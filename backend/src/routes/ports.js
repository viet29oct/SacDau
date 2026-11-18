const { Router } = require('express');
const { query } = require('../db');
const { authMiddleware, rbacMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { parseBody } = require('../validation/validate');
const { portServiceSchema } = require('../validation/schemas');
const { logAudit } = require('../services/audit');
const { findPortWithStation, toPort } = require('../services/stations');
const { BOOKING_SELECT, toBooking } = require('../services/bookings');

const router = Router();

// PATCH /ports/:id/service (owner của trạm/admin) — bật/tắt bảo trì cổng. Trả về các booking sắp tới
// trên cổng để owner huỷ (hoàn cọc) hoặc đổi cổng lúc check-in — hệ thống không tự huỷ thay owner.
router.patch(
  '/ports/:id/service',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy cổng sạc');
    const port = await findPortWithStation(id);
    if (!port) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy cổng sạc');
    assertOwnerOrAdmin(req.user, port.station_owner_id);

    const { serviceStatus, reason } = parseBody(portServiceSchema, req.body);
    const { rows } = await query('UPDATE ports SET service_status = $1 WHERE id = $2 RETURNING *', [serviceStatus, id]);

    const { rows: bookingRows } = await query(
      `${BOOKING_SELECT}
       WHERE b.port_id = $1 AND b.status IN ('pending', 'confirmed') AND b.end_time > now()
       ORDER BY b.start_time`,
      [id],
    );
    await logAudit(req.user.id, 'port.service', { portId: id, serviceStatus, reason: reason ?? null });
    ok(res, {
      port: toPort(rows[0]),
      affectedBookings: serviceStatus === 'maintenance' ? bookingRows.map((row) => toBooking(row)) : [],
    });
  }),
);

module.exports = router;
