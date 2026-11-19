const { Router } = require('express');
const { query } = require('../db');
const { authMiddleware, rbacMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { parseBody } = require('../validation/validate');
const { resolveIncidentSchema } = require('../validation/schemas');
const { logAudit } = require('../services/audit');

const router = Router();

// Sự cố cổng sạc (fault / offline) do hệ thống tự mở (sessionEngine, watchdog); quản lý trạm xem
// và đóng kèm ghi chú. Phục vụ báo cáo "sự cố & thời gian ngừng hoạt động" (LUONG_NGHIEP_VU mục 10).

const INCIDENT_SELECT = `
  SELECT i.*, p.station_id, s.owner_id AS station_owner_id
  FROM incidents i JOIN ports p ON p.id = i.port_id JOIN stations s ON s.id = p.station_id`;

const toIncident = (row) => ({
  id: row.id,
  portId: row.port_id,
  stationId: row.station_id,
  type: row.type,
  openedAt: row.opened_at,
  recoveredAt: row.recovered_at,
  resolvedAt: row.resolved_at,
  resolvedBy: row.resolved_by,
  note: row.note,
});

// GET /incidents?status=open|resolved — owner chỉ thấy trạm được phân công, admin thấy tất cả
router.get(
  '/incidents',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const resolved = req.query.status === 'resolved';
    const ownerId = req.user.role === 'admin' ? null : req.user.id;
    const { rows } = await query(
      `${INCIDENT_SELECT}
       WHERE (i.resolved_at IS NOT NULL) = $1 AND ($2::int IS NULL OR s.owner_id = $2)
       ORDER BY i.opened_at DESC`,
      [resolved, ownerId],
    );
    ok(res, rows.map(toIncident));
  }),
);

// PATCH /incidents/:id/resolve { note } — quản lý của trạm/admin đóng sự cố
router.patch(
  '/incidents/:id/resolve',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sự cố');
    const { note } = parseBody(resolveIncidentSchema, req.body);
    const { rows } = await query(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
    const incident = rows[0];
    if (!incident) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sự cố');
    assertOwnerOrAdmin(req.user, incident.station_owner_id);
    if (incident.resolved_at) throw new AppError(400, 'VALIDATION_ERROR', 'Sự cố đã được đóng trước đó');

    await query('UPDATE incidents SET resolved_at = now(), resolved_by = $2, note = $3 WHERE id = $1', [
      id,
      req.user.id,
      note,
    ]);
    await logAudit(req.user.id, 'incident.resolve', { incidentId: id, note });
    const { rows: updated } = await query(`${INCIDENT_SELECT} WHERE i.id = $1`, [id]);
    ok(res, toIncident(updated[0]));
  }),
);

module.exports = router;
