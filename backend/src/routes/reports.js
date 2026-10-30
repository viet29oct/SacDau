const { Router } = require('express');
const { query } = require('../db');
const { authMiddleware, rbacMiddleware } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');

const router = Router();

// from/to tùy chọn, dạng ISO 8601 (docs/contracts.md mục 4)
const parseDateRange = (req) => {
  const { from, to } = req.query;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if ((from && Number.isNaN(fromDate.getTime())) || (to && Number.isNaN(toDate.getTime()))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'from/to phải là ngày ISO 8601 hợp lệ');
  }
  return { fromDate, toDate };
};

// Dashboard tổng — chỉ admin (owner xem doanh thu trạm mình qua GET /stations/:id/sessions)
router.get(
  '/reports/revenue',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (req, res) => {
    const { fromDate, toDate } = parseDateRange(req);
    const { rows } = await query(
      `SELECT p.station_id, COALESCE(SUM(cs.cost), 0) AS revenue, COUNT(*) AS sessions
       FROM charging_sessions cs
       JOIN ports p ON p.id = cs.port_id
       WHERE cs.ended_at IS NOT NULL
         AND ($1::timestamptz IS NULL OR cs.started_at >= $1)
         AND ($2::timestamptz IS NULL OR cs.started_at <= $2)
       GROUP BY p.station_id`,
      [fromDate, toDate],
    );

    const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue), 0);
    const totalSessions = rows.reduce((sum, row) => sum + Number(row.sessions), 0);
    ok(res, {
      totalRevenue,
      totalSessions,
      byStation: rows.map((row) => ({ stationId: row.station_id, revenue: Number(row.revenue) })),
    });
  }),
);

router.get(
  '/reports/usage',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (req, res) => {
    const { fromDate, toDate } = parseDateRange(req);

    const { rows: byHourRows } = await query(
      `SELECT EXTRACT(HOUR FROM started_at)::int AS hour, COUNT(*) AS count
       FROM charging_sessions
       WHERE ($1::timestamptz IS NULL OR started_at >= $1)
         AND ($2::timestamptz IS NULL OR started_at <= $2)
       GROUP BY hour
       ORDER BY hour`,
      [fromDate, toDate],
    );
    const { rows: byStationRows } = await query(
      `SELECT p.station_id, COUNT(*) AS count
       FROM charging_sessions cs
       JOIN ports p ON p.id = cs.port_id
       WHERE ($1::timestamptz IS NULL OR cs.started_at >= $1)
         AND ($2::timestamptz IS NULL OR cs.started_at <= $2)
       GROUP BY p.station_id`,
      [fromDate, toDate],
    );

    ok(res, {
      byHour: byHourRows.map((row) => ({ hour: row.hour, count: Number(row.count) })),
      byStation: byStationRows.map((row) => ({ stationId: row.station_id, count: Number(row.count) })),
    });
  }),
);

module.exports = router;
