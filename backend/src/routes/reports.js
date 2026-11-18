const { Router } = require('express');
const { query } = require('../db');
const { authMiddleware, rbacMiddleware } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { UNPAID_SESSION_CONDITION } = require('../services/chargingSessions');

const router = Router();

// Báo cáo: admin xem toàn hệ thống, owner chỉ xem các trạm được phân công (docs/contracts.md mục 4).
// Mọi câu truy vấn dùng chung 3 tham số: $1 from, $2 to (lọc theo thời điểm bắt đầu phiên/booking),
// $3 ownerId (null = admin, không giới hạn trạm).

// from/to tùy chọn, dạng ISO 8601
const parseDateRange = (req) => {
  const { from, to } = req.query;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((from && Number.isNaN(fromDate.getTime())) || (to && Number.isNaN(toDate.getTime()))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'from/to phải là ngày ISO 8601 hợp lệ');
  }
  return { fromDate, toDate };
};

const scopeParams = (req) => {
  const { fromDate, toDate } = parseDateRange(req);
  return [fromDate, toDate, req.user.role === 'admin' ? null : req.user.id];
};

const SCOPE = '($3::int IS NULL OR s.owner_id = $3)';
const inRange = (column) => `($1::timestamptz IS NULL OR ${column} >= $1) AND ($2::timestamptz IS NULL OR ${column} <= $2)`;
const SESSIONS_FROM = `
  FROM charging_sessions cs
  JOIN ports p ON p.id = cs.port_id
  JOIN stations s ON s.id = p.station_id`;

const sumOf = async (sql, params) => Number((await query(sql, params)).rows[0].total ?? 0);

router.get(
  '/reports/revenue',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const params = scopeParams(req);
    const ended = `cs.ended_at IS NOT NULL AND ${inRange('cs.started_at')} AND ${SCOPE}`;

    // Doanh thu phát sinh: phiên có chủ (tiền điện + phí chiếm chỗ)
    const { rows: byStation } = await query(
      `SELECT p.station_id, COALESCE(sum(cs.cost), 0) AS revenue, count(*) AS sessions,
              COALESCE(sum(cs.idle_fee), 0) AS idle_fees
       ${SESSIONS_FROM}
       WHERE ${ended} AND cs.user_id IS NOT NULL
       GROUP BY p.station_id ORDER BY p.station_id`,
      params,
    );

    // Tiền VNPay thực thu (cọc + phiên), không tính khoản phải hoàn
    const PAYMENTS_FROM = `
      FROM payments pay
      LEFT JOIN charging_sessions cs ON cs.id = pay.charging_session_id
      LEFT JOIN bookings b ON b.id = pay.booking_id
      JOIN ports p ON p.id = COALESCE(cs.port_id, b.port_id)
      JOIN stations s ON s.id = p.station_id`;
    const collectedRevenue = await sumOf(
      `SELECT sum(pay.amount) AS total ${PAYMENTS_FROM}
       WHERE pay.status = 'success' AND pay.refund_status IS NULL AND ${inRange('pay.paid_at')} AND ${SCOPE}`,
      params,
    );
    // Khoản đang chờ hoàn: không lọc theo ngày (còn nợ tài xế bất kể phát sinh lúc nào)
    const refundsDue = await sumOf(
      `SELECT sum(pay.amount) AS total ${PAYMENTS_FROM}
       WHERE pay.refund_status = 'due' AND ($1::int IS NULL OR s.owner_id = $1)`,
      [params[2]],
    );

    // Cọc giữ lại mà không dùng cho tiền điện: no-show, huỷ sát giờ, sạc ít hơn cọc
    const forfeitedDeposits = await sumOf(
      `SELECT sum(GREATEST(dep.paid - COALESCE(used.applied, 0), 0)) AS total
       FROM bookings b
       JOIN ports p ON p.id = b.port_id
       JOIN stations s ON s.id = p.station_id
       JOIN LATERAL (
         SELECT sum(pay.amount) AS paid FROM payments pay
         WHERE pay.booking_id = b.id AND pay.purpose = 'booking_deposit'
           AND pay.status = 'success' AND pay.refund_status IS NULL
       ) dep ON dep.paid IS NOT NULL
       LEFT JOIN LATERAL (
         SELECT sum(cs.deposit_applied) AS applied FROM charging_sessions cs WHERE cs.booking_id = b.id
       ) used ON true
       WHERE b.status IN ('no_show', 'cancelled', 'completed') AND ${inRange('b.start_time')} AND ${SCOPE}`,
      params,
    );

    // Đã phát sinh nhưng tài xế chưa trả (phần còn lại sau khi trừ cọc)
    const outstandingRevenue = await sumOf(
      `SELECT sum(cs.cost - cs.deposit_applied) AS total ${SESSIONS_FROM}
       WHERE ${UNPAID_SESSION_CONDITION} AND ${inRange('cs.started_at')} AND ${SCOPE}`,
      params,
    );

    // Thất thoát do phiên trái phép (người chưa check-in cắm sạc) — đo trách nhiệm quản lý trạm
    const { rows: unauthorizedRows } = await query(
      `SELECT count(*) AS sessions,
              COALESCE(sum(GREATEST(cs.energy_kwh - cs.energy_start_kwh, 0)), 0) AS energy,
              COALESCE(sum(cs.cost), 0) AS amount
       ${SESSIONS_FROM}
       WHERE ${ended} AND cs.user_id IS NULL`,
      params,
    );

    ok(res, {
      totalRevenue: byStation.reduce((sum, row) => sum + Number(row.revenue), 0),
      totalSessions: byStation.reduce((sum, row) => sum + Number(row.sessions), 0),
      byStation: byStation.map((row) => ({ stationId: row.station_id, revenue: Number(row.revenue) })),
      collectedRevenue,
      idleFees: byStation.reduce((sum, row) => sum + Number(row.idle_fees), 0),
      forfeitedDeposits,
      refundsDue,
      outstandingRevenue,
      unauthorized: {
        sessions: Number(unauthorizedRows[0].sessions),
        energyKwh: Number(unauthorizedRows[0].energy),
        amount: Number(unauthorizedRows[0].amount),
      },
    });
  }),
);

router.get(
  '/reports/usage',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const params = scopeParams(req);
    const where = `${inRange('cs.started_at')} AND ${SCOPE}`;
    // Giờ trong ngày theo giờ Việt Nam
    const { rows: byHourRows } = await query(
      `SELECT EXTRACT(HOUR FROM cs.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hour, count(*) AS count
       ${SESSIONS_FROM}
       WHERE ${where}
       GROUP BY hour ORDER BY hour`,
      params,
    );
    const { rows: byStationRows } = await query(
      `SELECT p.station_id, count(*) AS count ${SESSIONS_FROM} WHERE ${where} GROUP BY p.station_id ORDER BY p.station_id`,
      params,
    );

    ok(res, {
      byHour: byHourRows.map((row) => ({ hour: row.hour, count: Number(row.count) })),
      byStation: byStationRows.map((row) => ({ stationId: row.station_id, count: Number(row.count) })),
    });
  }),
);

module.exports = router;
