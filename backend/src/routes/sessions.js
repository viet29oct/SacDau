const { Router } = require('express');
const { query } = require('../db');
const { withTransaction } = require('../db/transaction');
const { authMiddleware, rbacMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { parseBody } = require('../validation/validate');
const { forceCloseSchema } = require('../validation/schemas');
const { logAudit } = require('../services/audit');
const rules = require('../config/rules');
const { SESSION_SELECT, toChargingSession } = require('../services/chargingSessions');
const { findStationRowById, isPortOnline, stationNotFoundError } = require('../services/stations');
const { finalizeSession } = require('../services/sessionEngine');
const notify = require('../services/notify');

const router = Router();

const parseSessionId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phiên sạc');
  return id;
};

const notAllowed = (message, details) => new AppError(409, 'SESSION_ACTION_NOT_ALLOWED', message, details);

// GET /sessions/me — lịch sử phiên sạc + chi phí của chính tài xế
router.get(
  '/sessions/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${SESSION_SELECT} WHERE cs.user_id = $1 ORDER BY cs.started_at DESC`, [req.user.id]);
    ok(res, rows.map(toChargingSession));
  }),
);

// GET /sessions/:id — chủ phiên, quản lý của trạm chứa cổng, hoặc admin
router.get(
  '/sessions/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = parseSessionId(req.params.id);
    const { rows } = await query(
      `${SESSION_SELECT}
       JOIN ports p ON p.id = cs.port_id
       JOIN stations s ON s.id = p.station_id
       WHERE cs.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phiên sạc');

    const { rows: ownerRows } = await query(
      'SELECT s.owner_id FROM ports p JOIN stations s ON s.id = p.station_id WHERE p.id = $1',
      [row.port_id],
    );
    const isAdmin = req.user.role === 'admin';
    const isStationOwner = req.user.id === ownerRows[0]?.owner_id;
    const isSessionDriver = row.user_id !== null && req.user.id === row.user_id;
    if (!isAdmin && !isStationOwner && !isSessionDriver) {
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
      `${SESSION_SELECT} JOIN ports p ON p.id = cs.port_id WHERE p.station_id = $1 ORDER BY cs.started_at DESC`,
      [stationId],
    );
    ok(res, rows.map(toChargingSession));
  }),
);

// POST /sessions/:id/force-close { energyKwh, note } — quản lý đóng phiên khi thiết bị mất kết nối.
// Chặn dưới: không nhỏ hơn số đo cuối cùng (không xoá tiền điện đã sạc).
// Chặn trên: số đo cuối + công suất tối đa × thời gian mất tín hiệu (không thổi phồng tiền của tài xế).
router.post(
  '/sessions/:id/force-close',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const id = parseSessionId(req.params.id);
    const { energyKwh, note } = parseBody(forceCloseSchema, req.body);
    const now = new Date();

    const { closed, before } = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT cs.*, p.last_seen_at, s.owner_id AS station_owner_id
         FROM charging_sessions cs JOIN ports p ON p.id = cs.port_id JOIN stations s ON s.id = p.station_id
         WHERE cs.id = $1
         FOR UPDATE OF cs`,
        [id],
      );
      const session = rows[0];
      if (!session) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phiên sạc');
      assertOwnerOrAdmin(req.user, session.station_owner_id);
      if (session.ended_at) throw notAllowed('Phiên đã kết thúc');

      const offline = !isPortOnline(session.last_seen_at, now.getTime());
      if (!offline && !session.needs_review) {
        throw notAllowed('Chỉ đóng tay khi cổng mất kết nối hoặc phiên đang chờ kiểm tra');
      }

      const lastEnergy = Number(session.energy_kwh);
      const lostSince = new Date(session.last_seen_at ?? session.started_at).getTime();
      const lostHours = Math.max(now.getTime() - lostSince, 0) / (60 * 60 * 1000);
      const maxEnergy = Math.round((lastEnergy + rules.MAX_PORT_POWER_KW * lostHours + rules.ENERGY_TOLERANCE_KWH) * 100) / 100;
      if (energyKwh < lastEnergy || energyKwh > maxEnergy) {
        throw notAllowed(`Số kWh phải nằm trong khoảng ${lastEnergy} - ${maxEnergy}`, {
          minEnergyKwh: lastEnergy,
          maxEnergyKwh: maxEnergy,
        });
      }

      // finalizeSession cập nhật có điều kiện "ended_at IS NULL" -> null nếu engine vừa đóng phiên
      const result = await finalizeSession(client, session, {
        endedAt: now,
        finalEnergy: energyKwh,
        endReason: 'manual_close',
      });
      if (!result) throw notAllowed('Phiên vừa được thiết bị đóng');
      return { closed: result, before: lastEnergy };
    });

    await logAudit(req.user.id, 'session.force_close', { sessionId: id, energyBefore: before, energyKwh, note });
    const session = toChargingSession(closed);
    notify.sessionUpdated(session);
    ok(res, session);
  }),
);

module.exports = router;
