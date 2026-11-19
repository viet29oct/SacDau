const { Router } = require('express');
const pool = require('../db');
const { query } = require('../db');
const { authMiddleware, rbacMiddleware } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { validateBody, parseBody } = require('../validation/validate');
const { createStationSchema, updateStationSchema, assignOwnerSchema } = require('../validation/schemas');
const { logAudit } = require('../services/audit');
const {
  STATION_COLUMNS,
  findStationRowById,
  withPorts,
  stationNotFoundError,
} = require('../services/stations');

const router = Router();

const parseStationId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw stationNotFoundError();
  return id;
};

const RETURNING_STATION = 'RETURNING id, owner_id, name, code, is_active, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at';

// Mô hình: admin tạo/sửa/ngừng hoạt động trạm + phân công owner; owner chỉ thao tác vận hành
// (bảo trì cổng, check-in...) trên trạm được phân công. Xem docs/LUONG_NGHIEP_VU.md mục 3.

// GET /stations?near=lat,lng&radiusKm= — public, chỉ trạm đang hoạt động
router.get(
  '/stations',
  asyncHandler(async (req, res) => {
    const { near, radiusKm } = req.query;
    let rows;

    if (near) {
      const [latStr, lngStr] = String(near).split(',');
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'near phải có dạng lat,lng');
      }
      const radiusMeters = (Number(radiusKm) || 5) * 1000;
      ({ rows } = await query(
        `SELECT ${STATION_COLUMNS}
         FROM stations
         WHERE is_active
           AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`,
        [lng, lat, radiusMeters],
      ));
    } else {
      ({ rows } = await query(`SELECT ${STATION_COLUMNS} FROM stations WHERE is_active ORDER BY id`));
    }

    ok(res, await withPorts(rows));
  }),
);

// GET /stations/managed — owner: trạm được phân công; admin: tất cả (kể cả đã ngừng hoạt động).
// Khai báo TRƯỚC /stations/:id, nếu không "managed" sẽ bị khớp vào :id.
router.get(
  '/stations/managed',
  authMiddleware,
  rbacMiddleware('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } =
      req.user.role === 'admin'
        ? await query(`SELECT ${STATION_COLUMNS} FROM stations ORDER BY id`)
        : await query(`SELECT ${STATION_COLUMNS} FROM stations WHERE owner_id = $1 AND is_active ORDER BY id`, [
            req.user.id,
          ]);
    ok(res, await withPorts(rows));
  }),
);

// GET /stations/:id — public; trạm đã ngừng hoạt động coi như không tồn tại (admin xem qua /managed)
router.get(
  '/stations/:id',
  asyncHandler(async (req, res) => {
    const id = parseStationId(req.params.id);
    const row = await findStationRowById(id);
    if (!row || !row.is_active) throw stationNotFoundError();
    const [station] = await withPorts([row]);
    ok(res, station);
  }),
);

// POST /stations (chỉ admin) — body { name, code, lat, lng, portsCount? }, tạo kèm N cổng đánh số 1..N
router.post(
  '/stations',
  authMiddleware,
  rbacMiddleware('admin'),
  validateBody(createStationSchema),
  asyncHandler(async (req, res) => {
    const { name, code, lat, lng, portsCount = 1 } = req.body;
    const client = await pool.connect();
    let station;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO stations (name, code, geom)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326))
         ${RETURNING_STATION}`,
        [name, code, lng, lat],
      );
      station = rows[0];
      for (let portNumber = 1; portNumber <= portsCount; portNumber += 1) {
        await client.query('INSERT INTO ports (station_id, port_number) VALUES ($1, $2)', [station.id, portNumber]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') {
        throw new AppError(409, 'STATION_CODE_ALREADY_EXISTS', 'code trạm đã tồn tại');
      }
      throw err;
    } finally {
      client.release();
    }
    await logAudit(req.user.id, 'station.create', { stationId: station.id, code, portsCount });
    const [result] = await withPorts([station]);
    ok(res, result, 201);
  }),
);

// PATCH /stations/:id (chỉ admin) — dữ liệu gốc (tên, toạ độ) không để owner sửa, tránh làm sai dữ liệu GIS
router.patch(
  '/stations/:id',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (req, res) => {
    const id = parseStationId(req.params.id);
    const existing = await findStationRowById(id);
    if (!existing) throw stationNotFoundError();

    const { name, lat, lng } = parseBody(updateStationSchema, req.body);
    const { rows } = await query(
      `UPDATE stations
       SET name = COALESCE($1, name), geom = ST_SetSRID(ST_MakePoint($2, $3), 4326)
       WHERE id = $4
       ${RETURNING_STATION}`,
      [name ?? null, lng ?? existing.lng, lat ?? existing.lat, id],
    );
    await logAudit(req.user.id, 'station.update', { stationId: id, name, lat, lng });
    const [station] = await withPorts(rows);
    ok(res, station);
  }),
);

// DELETE /stations/:id (chỉ admin) — NGỪNG HOẠT ĐỘNG (soft), không xoá cứng: trạm có lịch sử
// booking/phiên/thanh toán, xoá cứng vừa lỗi khoá ngoại vừa mất dữ liệu tài chính.
router.delete(
  '/stations/:id',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (req, res) => {
    const id = parseStationId(req.params.id);
    const existing = await findStationRowById(id);
    if (!existing) throw stationNotFoundError();

    const { rows: inUse } = await query(
      `SELECT 1 FROM ports p
       WHERE p.station_id = $1 AND (
         EXISTS (SELECT 1 FROM charging_sessions cs WHERE cs.port_id = p.id AND cs.ended_at IS NULL)
         OR EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.port_id = p.id AND b.status IN ('pending', 'confirmed', 'checked_in') AND b.end_time > now()
         )
       )
       LIMIT 1`,
      [id],
    );
    if (inUse[0]) {
      throw new AppError(
        409,
        'STATION_IN_USE',
        'Trạm còn phiên đang sạc hoặc booking sắp tới, hãy huỷ/xử lý trước khi ngừng hoạt động',
      );
    }

    const { rows } = await query(`UPDATE stations SET is_active = false WHERE id = $1 ${RETURNING_STATION}`, [id]);
    await logAudit(req.user.id, 'station.deactivate', { stationId: id });
    const [station] = await withPorts(rows);
    ok(res, station);
  }),
);

// PATCH /stations/:id/assign-owner (chỉ admin) — body { ownerId }: tài khoản owner đang hoạt động
router.patch(
  '/stations/:id/assign-owner',
  authMiddleware,
  rbacMiddleware('admin'),
  validateBody(assignOwnerSchema),
  asyncHandler(async (req, res) => {
    const id = parseStationId(req.params.id);
    const { ownerId } = req.body;

    const { rows: ownerRows } = await query('SELECT id, role, is_active FROM users WHERE id = $1', [ownerId]);
    const ownerUser = ownerRows[0];
    if (!ownerUser) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản ownerId');
    if (ownerUser.role !== 'owner') {
      throw new AppError(400, 'VALIDATION_ERROR', 'ownerId phải là tài khoản có role owner');
    }
    if (!ownerUser.is_active) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Tài khoản quản lý này đang bị khoá');
    }

    const { rows } = await query(`UPDATE stations SET owner_id = $1 WHERE id = $2 ${RETURNING_STATION}`, [
      ownerId,
      id,
    ]);
    if (!rows[0]) throw stationNotFoundError();
    await logAudit(req.user.id, 'station.assign_owner', { stationId: id, ownerId });
    const [station] = await withPorts(rows);
    ok(res, station);
  }),
);

module.exports = router;
