const { Router } = require('express');
const { query } = require('../db');
const { authMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { toChargingSession } = require('../services/chargingSessions');
const { findStationRowById, stationNotFoundError } = require('../services/stations');

const router = Router();

// GET /sessions/:id — xem được bởi: admin, owner của trạm chứa port đó, hoặc tài xế gắn với booking
router.get(
  '/sessions/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phiên sạc');
    }

    const { rows } = await query(
      `SELECT cs.*, s.owner_id AS station_owner_id, b.user_id AS booking_user_id
       FROM charging_sessions cs
       JOIN ports p ON p.id = cs.port_id
       JOIN stations s ON s.id = p.station_id
       LEFT JOIN bookings b ON b.id = cs.booking_id
       WHERE cs.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phiên sạc');

    const isAdmin = req.user.role === 'admin';
    const isStationOwner = req.user.id === row.station_owner_id;
    const isBookingDriver = row.booking_user_id !== null && req.user.id === row.booking_user_id;
    if (!isAdmin && !isStationOwner && !isBookingDriver) {
      throw new AppError(403, 'FORBIDDEN', 'Không có quyền xem phiên sạc này');
    }
    ok(res, toChargingSession(row));
  }),
);

// GET /stations/:id/sessions — chỉ owner được phân công hoặc admin (lịch sử vận hành/doanh thu trạm)
router.get(
  '/stations/:id/sessions',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const stationId = Number(req.params.id);
    if (!Number.isInteger(stationId) || stationId <= 0) throw stationNotFoundError();

    const station = await findStationRowById(stationId);
    if (!station) throw stationNotFoundError();
    assertOwnerOrAdmin(req.user, station.owner_id);

    const { rows } = await query(
      `SELECT cs.* FROM charging_sessions cs
       JOIN ports p ON p.id = cs.port_id
       WHERE p.station_id = $1
       ORDER BY cs.started_at DESC`,
      [stationId],
    );
    ok(res, rows.map(toChargingSession));
  }),
);

module.exports = router;
