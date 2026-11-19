const { Router } = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const { withTransaction } = require('../db/transaction');
const { authMiddleware, rbacMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { checkinRateLimiter } = require('../middleware/rateLimiter');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { validateBody, parseBody } = require('../validation/validate');
const { createBookingSchema, cancelBookingSchema, checkInSchema } = require('../validation/schemas');
const { logAudit } = require('../services/audit');
const rules = require('../config/rules');
const { BOOKING_SELECT, toBooking, vnDayRange, assertBookingWindow } = require('../services/bookings');
const {
  findPortWithStation,
  findStationRowById,
  isPortOnline,
  stationNotFoundError,
} = require('../services/stations');
const { UNPAID_SESSION_CONDITION, toChargingSession } = require('../services/chargingSessions');
const { createVnpayPayment, newCheckInCode } = require('../services/payments');
const notify = require('../services/notify');

const router = Router();
const { MINUTE_MS } = rules;

// Luồng đặt chỗ / cọc / huỷ / check-in: docs/LUONG_NGHIEP_VU.md mục 4-5.

const parseBookingId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy booking');
  return id;
};

const limitError = (message) => new AppError(409, 'BOOKING_LIMIT_REACHED', message);
const portUnavailable = (message) => new AppError(409, 'PORT_UNAVAILABLE', message);
const cancelNotAllowed = (message) => new AppError(400, 'BOOKING_CANCEL_NOT_ALLOWED', message);
const checkinNotAllowed = (message) => new AppError(400, 'CHECKIN_NOT_ALLOWED', message);
const sessionActionNotAllowed = (message, details) =>
  new AppError(409, 'SESSION_ACTION_NOT_ALLOWED', message, details);

// Vi phạm exclusion constraint (23P01): chồng giờ cùng cổng hoặc chính tài xế tự chồng giờ
const conflictError = (err) =>
  new AppError(
    409,
    'BOOKING_CONFLICT',
    err?.constraint === 'bookings_no_overlap_user'
      ? 'Bạn đã có booking khác trùng khung giờ này'
      : 'Cổng đã có người đặt trong khung giờ này',
  );

const findBookingForResponse = async (id, client = { query }) => {
  const { rows } = await client.query(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
  return rows[0];
};

// POST /bookings — chỉ driver. Tạo booking 'pending' giữ chỗ 5 phút + giao dịch cọc VNPay.
// IPN cọc thành công mới chuyển 'confirmed' (services/payments.js).
router.post(
  '/bookings',
  authMiddleware,
  rbacMiddleware('driver'),
  validateBody(createBookingSchema),
  asyncHandler(async (req, res) => {
    const { portId, startTime, endTime } = req.body;
    const now = new Date();
    assertBookingWindow(startTime, endTime, now);

    const { bookingRow, paymentUrl } = await withTransaction(async (client) => {
      // Khoá dòng tài xế: 2 request song song của cùng người không cùng lọt các giới hạn đếm
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);

      const { rows: unpaid } = await client.query(
        `SELECT 1 FROM charging_sessions cs WHERE cs.user_id = $1 AND ${UNPAID_SESSION_CONDITION} LIMIT 1`,
        [req.user.id],
      );
      if (unpaid[0]) {
        throw new AppError(409, 'UNPAID_SESSION_EXISTS', 'Bạn còn phiên sạc chưa thanh toán, hãy thanh toán trước khi đặt chỗ mới');
      }

      const { rows: countRows } = await client.query(
        `SELECT
           count(*) FILTER (WHERE status = 'pending') AS pending,
           count(*) FILTER (WHERE status IN ('confirmed', 'checked_in') AND end_time > now()) AS active,
           count(*) FILTER (WHERE status = 'cancelled' AND cancel_reason = 'payment_timeout'
                              AND cancelled_at > now() - interval '24 hours') AS expired
         FROM bookings WHERE user_id = $1`,
        [req.user.id],
      );
      const counts = countRows[0];
      if (Number(counts.pending) >= rules.MAX_PENDING_BOOKINGS) {
        throw limitError('Bạn đang có booking chờ thanh toán cọc, hãy hoàn tất hoặc huỷ booking đó trước');
      }
      if (Number(counts.active) >= rules.MAX_CONFIRMED_BOOKINGS) {
        throw limitError(`Mỗi tài khoản chỉ giữ tối đa ${rules.MAX_CONFIRMED_BOOKINGS} booking đang hiệu lực`);
      }
      if (Number(counts.expired) >= rules.MAX_EXPIRED_HOLDS_24H) {
        throw limitError('Bạn đã để quá hạn thanh toán cọc nhiều lần trong 24 giờ, vui lòng thử lại sau');
      }

      const port = await findPortWithStation(portId, client);
      if (!port) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy cổng sạc');
      if (!port.station_is_active || !port.station_owner_id) {
        throw new AppError(409, 'STATION_NOT_OPERATIONAL', 'Trạm đang ngừng hoạt động hoặc chưa có quản lý trực');
      }
      if (port.service_status === 'maintenance') throw portUnavailable('Cổng đang bảo trì');
      // Lỗi/mất kết nối chỉ chặn booking sắp bắt đầu — mất WiFi 1 phút không làm hỏng việc đặt cho ngày mai
      const startsSoon = startTime.getTime() - now.getTime() <= rules.PORT_HEALTH_WINDOW_MINUTES * MINUTE_MS;
      if (startsSoon && (port.status === 'fault' || !isPortOnline(port.last_seen_at, now.getTime()))) {
        throw portUnavailable('Cổng đang lỗi hoặc mất kết nối, hãy chọn cổng khác');
      }

      const deposit = rules.BOOKING_DEPOSIT_VND;
      const needsDeposit = deposit > 0;
      const holdExpiresAt = new Date(now.getTime() + rules.BOOKING_HOLD_MINUTES * MINUTE_MS);
      let row;
      try {
        ({
          rows: [row],
        } = await client.query(
          `INSERT INTO bookings (user_id, port_id, start_time, end_time, status, hold_expires_at, deposit_amount, check_in_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            req.user.id,
            portId,
            startTime,
            endTime,
            needsDeposit ? 'pending' : 'confirmed',
            needsDeposit ? holdExpiresAt : null,
            deposit,
            needsDeposit ? null : newCheckInCode(),
          ],
        ));
      } catch (err) {
        if (err?.code === '23P01') throw conflictError(err);
        throw err;
      }

      let url = null;
      if (needsDeposit) {
        const created = await createVnpayPayment(client, {
          purpose: 'booking_deposit',
          bookingId: row.id,
          userId: req.user.id,
          amount: deposit,
          expiresAt: holdExpiresAt,
          ipAddr: req.ip,
          orderInfo: `Coc giu cho booking ${row.id}`,
        });
        row.deposit_payment_id = created.payment.id;
        url = created.paymentUrl;
      }
      return { bookingRow: row, paymentUrl: url };
    });

    await logAudit(req.user.id, 'booking.create', { bookingId: bookingRow.id, portId, startTime, endTime });
    ok(res, { ...toBooking(bookingRow, { includeCheckInCode: true }), paymentUrl }, 201);
  }),
);

router.get(
  '/bookings/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY b.start_time DESC`, [req.user.id]);
    ok(res, rows.map((row) => toBooking(row, { includeCheckInCode: true })));
  }),
);

// GET /stations/:id/bookings?date=YYYY-MM-DD — owner của trạm/admin. Có tên tài xế, KHÔNG có mã check-in.
router.get(
  '/stations/:id/bookings',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const stationId = Number(req.params.id);
    if (!Number.isInteger(stationId) || stationId <= 0) throw stationNotFoundError();
    const station = await findStationRowById(stationId);
    if (!station) throw stationNotFoundError();
    assertOwnerOrAdmin(req.user, station.owner_id);

    const { from, to } = vnDayRange(req.query.date);
    const { rows } = await query(
      `SELECT b.*, u.name AS driver_name,
         (SELECT p2.id FROM payments p2
          WHERE p2.booking_id = b.id AND p2.purpose = 'booking_deposit'
          ORDER BY p2.id DESC LIMIT 1) AS deposit_payment_id
       FROM bookings b
       JOIN ports p ON p.id = b.port_id
       JOIN users u ON u.id = b.user_id
       WHERE p.station_id = $1 AND b.start_time >= $2 AND b.start_time < $3
       ORDER BY b.start_time`,
      [stationId, from, to],
    );
    ok(res, rows.map((row) => toBooking(row)));
  }),
);

// PATCH /bookings/:id/cancel — tài xế của booking, owner của trạm, hoặc admin.
// Hoàn cọc: tài xế huỷ trước giờ bắt đầu >= 2h, hoặc owner/admin huỷ (lỗi phía công ty).
router.patch(
  '/bookings/:id/cancel',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = parseBookingId(req.params.id);
    const { reason } = parseBody(cancelBookingSchema, req.body ?? {});
    const now = new Date();

    const outcome = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT b.*, s.owner_id AS station_owner_id
         FROM bookings b JOIN ports p ON p.id = b.port_id JOIN stations s ON s.id = p.station_id
         WHERE b.id = $1 FOR UPDATE OF b`,
        [id],
      );
      const booking = rows[0];
      if (!booking) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy booking');

      const isDriver = req.user.id === booking.user_id;
      const isStaff =
        req.user.role === 'admin' || (req.user.role === 'owner' && req.user.id === booking.station_owner_id);
      if (!isDriver && !isStaff) throw new AppError(403, 'FORBIDDEN', 'Không có quyền trên tài nguyên này');

      if (booking.status === 'checked_in') throw cancelNotAllowed('Booking đã check-in, không huỷ được');
      if (!['pending', 'confirmed'].includes(booking.status)) {
        throw cancelNotAllowed('Booking đã kết thúc hoặc đã huỷ trước đó');
      }

      let refund = false;
      if (isDriver && !isStaff) {
        if (booking.status === 'confirmed') {
          const msToStart = new Date(booking.start_time).getTime() - now.getTime();
          if (msToStart <= 0) throw cancelNotAllowed('Đã quá giờ bắt đầu, không thể huỷ');
          refund = msToStart >= rules.REFUND_CANCEL_BEFORE_HOURS * 60 * MINUTE_MS;
        }
      } else {
        refund = booking.status === 'confirmed';
      }

      await client.query(
        `UPDATE bookings SET status = 'cancelled', cancel_reason = $2, cancelled_by = $3, cancelled_at = now()
         WHERE id = $1`,
        [id, reason ?? (isDriver && !isStaff ? 'driver_cancel' : 'staff_cancel'), req.user.id],
      );
      // Giao dịch cọc chưa trả -> failed. Nếu VNPay vẫn báo đã trả sau đó, IPN sẽ đưa vào "cần hoàn".
      await client.query(
        "UPDATE payments SET status = 'failed' WHERE booking_id = $1 AND purpose = 'booking_deposit' AND status = 'pending'",
        [id],
      );
      let depositOutcome = booking.status === 'confirmed' ? 'forfeited' : 'none';
      if (refund) {
        await client.query(
          `UPDATE payments SET refund_status = 'due'
           WHERE booking_id = $1 AND purpose = 'booking_deposit' AND status = 'success' AND refund_status IS NULL`,
          [id],
        );
        depositOutcome = 'refund_due';
      }
      return depositOutcome;
    });

    await logAudit(req.user.id, 'booking.cancel', { bookingId: id, depositOutcome: outcome, reason: reason ?? null });
    ok(res, { ...toBooking(await findBookingForResponse(id)), depositOutcome: outcome });
  }),
);

const codesMatch = (input, expected) => {
  if (typeof expected !== 'string') return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// POST /bookings/:id/check-in { code, portId?, attachSessionId? } — owner của trạm/admin.
// Mã nằm trên app tài xế -> owner không tự bịa check-in để đổ tiền phiên khác cho tài xế được.
router.post(
  '/bookings/:id/check-in',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  checkinRateLimiter,
  asyncHandler(async (req, res) => {
    const id = parseBookingId(req.params.id);
    const { code, portId, attachSessionId } = parseBody(checkInSchema, req.body);
    const now = new Date();

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT b.*, p.station_id, s.owner_id AS station_owner_id
         FROM bookings b JOIN ports p ON p.id = b.port_id JOIN stations s ON s.id = p.station_id
         WHERE b.id = $1 FOR UPDATE OF b`,
        [id],
      );
      const booking = rows[0];
      if (!booking) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy booking');
      assertOwnerOrAdmin(req.user, booking.station_owner_id);

      const recheck = booking.status === 'checked_in' || booking.status === 'completed';
      if (booking.status === 'pending') throw checkinNotAllowed('Booking chưa thanh toán cọc');
      if (booking.status !== 'confirmed' && !recheck) {
        throw checkinNotAllowed(`Booking đang ở trạng thái ${booking.status}, không check-in được`);
      }

      if (booking.checkin_locked_until && new Date(booking.checkin_locked_until) > now) {
        throw new AppError(429, 'TOO_MANY_REQUESTS', 'Nhập sai mã quá nhiều lần, check-in booking này đang bị khoá tạm thời');
      }
      if (!codesMatch(code, booking.check_in_code)) {
        // Lưu số lần sai rồi mới báo lỗi (COMMIT) — nếu ném lỗi ngay, ROLLBACK sẽ xoá luôn bộ đếm
        const attempts = booking.checkin_failed_attempts + 1;
        const locked = attempts >= rules.CHECKIN_MAX_FAILED;
        await client.query(
          'UPDATE bookings SET checkin_failed_attempts = $1, checkin_locked_until = $2 WHERE id = $3',
          [locked ? 0 : attempts, locked ? new Date(now.getTime() + rules.CHECKIN_LOCK_MINUTES * MINUTE_MS) : null, id],
        );
        return {
          error: locked
            ? new AppError(429, 'TOO_MANY_REQUESTS', `Sai mã ${rules.CHECKIN_MAX_FAILED} lần, check-in bị khoá ${rules.CHECKIN_LOCK_MINUTES} phút`)
            : new AppError(400, 'INVALID_CHECKIN_CODE', `Sai mã check-in (còn ${rules.CHECKIN_MAX_FAILED - attempts} lần thử)`),
        };
      }

      if (booking.status === 'confirmed') {
        const start = new Date(booking.start_time).getTime();
        if (
          now.getTime() < start - rules.CHECKIN_EARLY_MINUTES * MINUTE_MS ||
          now.getTime() > start + rules.CHECKIN_LATE_MINUTES * MINUTE_MS
        ) {
          throw checkinNotAllowed(
            `Chỉ check-in được từ ${rules.CHECKIN_EARLY_MINUTES} phút trước đến ${rules.CHECKIN_LATE_MINUTES} phút sau giờ bắt đầu`,
          );
        }
      } else {
        // Check-in lại (rút ra cắm lại / cắm trễ): chỉ để gắn phiên, trong giờ booking
        if (now > new Date(booking.end_time)) throw checkinNotAllowed('Booking đã hết giờ');
        if (!attachSessionId) {
          throw checkinNotAllowed('Booking đã check-in; gửi kèm attachSessionId để gắn phiên đang sạc');
        }
      }

      // Đổi sang cổng trống khác cùng trạm (cổng đã đặt hỏng / bị xe khác chiếm)
      let targetPortId = booking.port_id;
      if (portId && portId !== booking.port_id) {
        if (booking.status !== 'confirmed') throw checkinNotAllowed('Chỉ đổi cổng ở lần check-in đầu tiên');
        const target = await findPortWithStation(portId, client);
        if (!target || target.station_id !== booking.station_id) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Cổng mới phải thuộc cùng trạm');
        }
        if (target.service_status === 'maintenance' || target.status === 'fault') {
          throw portUnavailable('Cổng mới đang bảo trì hoặc lỗi');
        }
        try {
          await client.query('UPDATE bookings SET port_id = $1 WHERE id = $2', [portId, id]);
        } catch (err) {
          if (err?.code === '23P01') throw new AppError(409, 'BOOKING_CONFLICT', 'Cổng mới đã có booking trùng khung giờ');
          throw err;
        }
        targetPortId = portId;
      }

      const { rows: openRows } = await client.query(
        'SELECT * FROM charging_sessions WHERE port_id = $1 AND ended_at IS NULL FOR UPDATE',
        [targetPortId],
      );
      const open = openRows[0];
      if (open && open.user_id !== null && open.user_id !== booking.user_id) {
        throw portUnavailable('Cổng đang có xe khác sạc, hãy chọn cổng khác (portId)');
      }

      let sessionRow = null;
      if (attachSessionId) {
        if (!open || open.id !== attachSessionId || open.user_id !== null) {
          throw sessionActionNotAllowed('Phiên cần gắn phải đang sạc trên cổng của booking và chưa thuộc về ai');
        }
        if (new Date(open.started_at).getTime() < new Date(booking.start_time).getTime() - rules.CHECKIN_EARLY_MINUTES * MINUTE_MS) {
          throw sessionActionNotAllowed('Phiên bắt đầu trước khung giờ của booking');
        }
        // Cập nhật có điều kiện: engine MQTT có thể vừa đóng phiên này
        const { rows: attached } = await client.query(
          `UPDATE charging_sessions SET booking_id = $1, user_id = $2
           WHERE id = $3 AND ended_at IS NULL AND user_id IS NULL RETURNING *`,
          [id, booking.user_id, attachSessionId],
        );
        if (!attached[0]) throw sessionActionNotAllowed('Phiên vừa kết thúc hoặc đã được gắn cho người khác');
        sessionRow = attached[0];
      } else if (open && open.user_id === null) {
        throw sessionActionNotAllowed(
          'Cổng đang có phiên sạc chưa gắn với ai. Xác nhận đúng xe của tài xế này rồi gửi lại kèm attachSessionId',
          { session: toChargingSession(open) },
        );
      }

      await client.query(
        `UPDATE bookings
         SET status = 'checked_in', checked_in_at = COALESCE(checked_in_at, now()),
             checked_in_by = COALESCE(checked_in_by, $2), checkin_failed_attempts = 0, checkin_locked_until = NULL
         WHERE id = $1`,
        [id, req.user.id],
      );
      return { sessionRow };
    });

    if (result.error) throw result.error;
    await logAudit(req.user.id, 'booking.check_in', {
      bookingId: id,
      portId: portId ?? null,
      attachSessionId: attachSessionId ?? null,
    });
    const session = result.sessionRow ? toChargingSession(result.sessionRow) : null;
    if (session) notify.sessionUpdated(session);
    ok(res, { booking: toBooking(await findBookingForResponse(id)), session });
  }),
);

module.exports = router;
