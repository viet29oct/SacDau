const { Router } = require('express');
const { query } = require('../db');
const { authMiddleware, rbacMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { validateBody } = require('../validation/validate');
const { createBookingSchema } = require('../validation/schemas');
const { logAudit } = require('../services/audit');

const router = Router();

// Object Booking chuẩn theo docs/contracts.md mục 3
const toBooking = (row) => ({
  id: row.id,
  userId: row.user_id,
  portId: row.port_id,
  startTime: row.start_time,
  endTime: row.end_time,
  status: row.status,
  createdAt: row.created_at,
});

// POST /bookings — chỉ driver. Xác nhận ngay (status='confirmed'), không có bước 'pending'
// (xem docs/contracts.md mục 4, quy tắc /bookings).
router.post(
  '/bookings',
  authMiddleware,
  rbacMiddleware('driver'),
  validateBody(createBookingSchema),
  asyncHandler(async (req, res) => {
    const { portId, startTime, endTime } = req.body;

    const { rows: portRows } = await query('SELECT id FROM ports WHERE id = $1', [portId]);
    if (!portRows[0]) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy cổng sạc');

    // Trùng giờ: cùng port_id, booking khác chưa cancelled, có giao thoa khung giờ
    const { rows: conflictRows } = await query(
      `SELECT 1 FROM bookings
       WHERE port_id = $1 AND status != 'cancelled' AND start_time < $3 AND end_time > $2
       LIMIT 1`,
      [portId, startTime, endTime],
    );
    if (conflictRows[0]) {
      throw new AppError(409, 'BOOKING_CONFLICT', 'Trùng khung giờ đặt chỗ');
    }

    const { rows } = await query(
      `INSERT INTO bookings (user_id, port_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, 'confirmed')
       RETURNING *`,
      [req.user.id, portId, startTime, endTime],
    );
    await logAudit(req.user.id, 'booking.create', { portId, startTime, endTime });
    ok(res, toBooking(rows[0]), 201);
  }),
);

router.get(
  '/bookings/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM bookings WHERE user_id = $1 ORDER BY start_time DESC', [
      req.user.id,
    ]);
    ok(res, rows.map(toBooking));
  }),
);

// PATCH /bookings/:id/cancel — chỉ chính tài xế (hoặc admin), chưa cancelled, còn trước startTime
router.patch(
  '/bookings/:id/cancel',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy booking');
    }

    const { rows } = await query('SELECT * FROM bookings WHERE id = $1', [id]);
    const booking = rows[0];
    if (!booking) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy booking');
    assertOwnerOrAdmin(req.user, booking.user_id);

    if (booking.status === 'cancelled') {
      throw new AppError(400, 'BOOKING_CANCEL_NOT_ALLOWED', 'Booking đã được hủy trước đó');
    }
    if (new Date(booking.start_time).getTime() <= Date.now()) {
      throw new AppError(400, 'BOOKING_CANCEL_NOT_ALLOWED', 'Đã quá giờ bắt đầu, không thể hủy');
    }

    const { rows: updated } = await query("UPDATE bookings SET status = 'cancelled' WHERE id = $1 RETURNING *", [
      id,
    ]);
    await logAudit(req.user.id, 'booking.cancel', { bookingId: id });
    ok(res, toBooking(updated[0]));
  }),
);

module.exports = router;
