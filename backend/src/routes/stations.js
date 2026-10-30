const { Router } = require('express');
const pool = require('../db');
const { query } = require('../db');
const { authMiddleware, rbacMiddleware, assertOwnerOrAdmin } = require('../middleware/auth');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { validateBody, parseBody } = require('../validation/validate');
const { createStationSchema, updateStationSchema, assignOwnerSchema } = require('../validation/schemas');
const {
  toStation,
  STATION_COLUMNS,
  findStationRowById,
  findPortsByStationIds,
  stationNotFoundError,
} = require('../services/stations');

const router = Router();

const parseStationId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw stationNotFoundError();
  return id;
};

// Mô hình mới (2026-10-29): admin tạo/xoá trạm + phân công owner; owner chỉ sửa trạm được
// phân công (stations.owner_id === req.user.id) — không tự tạo trạm. Xem docs/contracts.md mục 4.

// GET /stations?near=lat,lng&radiusKm= — public, không cần đăng nhập
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
         WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`,
        [lng, lat, radiusMeters],
      ));
    } else {
      ({ rows } = await query(`SELECT ${STATION_COLUMNS} FROM stations ORDER BY id`));
    }

    const portsByStation = await findPortsByStationIds(rows.map((row) => row.id));
    ok(res, rows.map((row) => toStation(row, portsByStation.get(row.id) ?? [])));
  }),
);

// GET /stations/:id — public, kèm danh sách ports
router.get(
  '/stations/:id',
  asyncHandler(async (req, res) => {
    const id = parseStationId(req.params.id);
    const row = await findStationRowById(id);
    if (!row) throw stationNotFoundError();
    const portsByStation = await findPortsByStationIds([id]);
    ok(res, toStation(row, portsByStation.get(id) ?? []));
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
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO stations (name, code, geom)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326))
         RETURNING id, owner_id, name, code, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at`,
        [name, code, lng, lat],
      );
      const station = rows[0];
      for (let portNumber = 1; portNumber <= portsCount; portNumber += 1) {
        await client.query('INSERT INTO ports (station_id, port_number) VALUES ($1, $2)', [
          station.id,
          portNumber,
        ]);
      }
      await client.query('COMMIT');

      const portsByStation = await findPortsByStationIds([station.id]);
      ok(res, toStation(station, portsByStation.get(station.id) ?? []), 201);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err?.code === '23505') {
        throw new AppError(409, 'STATION_CODE_ALREADY_EXISTS', 'code trạm đã tồn tại');
      }
      throw err;
    } finally {
      client.release();
    }
  }),
);

// PATCH /stations/:id (owner được phân công hoặc admin) — body { name?, lat?, lng? }
router.patch(
  '/stations/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = parseStationId(req.params.id);
    const existing = await findStationRowById(id);
    if (!existing) throw stationNotFoundError();
    // owner_id null (chưa phân công ai) -> chỉ admin được sửa
    assertOwnerOrAdmin(req.user, existing.owner_id);

    const { name, lat, lng } = parseBody(updateStationSchema, req.body);
    const nextLat = lat ?? existing.lat;
    const nextLng = lng ?? existing.lng;

    const { rows } = await query(
      `UPDATE stations
       SET name = COALESCE($1, name), geom = ST_SetSRID(ST_MakePoint($2, $3), 4326)
       WHERE id = $4
       RETURNING id, owner_id, name, code, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at`,
      [name ?? null, nextLng, nextLat, id],
    );
    const portsByStation = await findPortsByStationIds([id]);
    ok(res, toStation(rows[0], portsByStation.get(id) ?? []));
  }),
);

// DELETE /stations/:id (chỉ admin)
router.delete(
  '/stations/:id',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (req, res) => {
    const id = parseStationId(req.params.id);
    const { rows } = await query('DELETE FROM stations WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) throw stationNotFoundError();
    ok(res, null);
  }),
);

// PATCH /stations/:id/assign-owner (chỉ admin) — body { ownerId }
router.patch(
  '/stations/:id/assign-owner',
  authMiddleware,
  rbacMiddleware('admin'),
  validateBody(assignOwnerSchema),
  asyncHandler(async (req, res) => {
    const id = parseStationId(req.params.id);
    const { ownerId } = req.body;

    const { rows: ownerRows } = await query('SELECT id, role FROM users WHERE id = $1', [ownerId]);
    const ownerUser = ownerRows[0];
    if (!ownerUser) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản ownerId');
    if (ownerUser.role !== 'owner') {
      throw new AppError(400, 'VALIDATION_ERROR', 'ownerId phải là tài khoản có role owner');
    }

    const { rows } = await query(
      `UPDATE stations SET owner_id = $1 WHERE id = $2
       RETURNING id, owner_id, name, code, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at`,
      [ownerId, id],
    );
    if (!rows[0]) throw stationNotFoundError();
    const portsByStation = await findPortsByStationIds([id]);
    ok(res, toStation(rows[0], portsByStation.get(id) ?? []));
  }),
);

module.exports = router;
