const { query } = require('../db');
const { AppError } = require('../utils/http');
const { OFFLINE_AFTER_SECONDS } = require('../config/rules');

// online = có bản tin MQTT trong OFFLINE_AFTER_SECONDS gần nhất (giờ server); chưa từng gửi -> false
const isPortOnline = (lastSeenAt, now = Date.now()) =>
  Boolean(lastSeenAt) && now - new Date(lastSeenAt).getTime() <= OFFLINE_AFTER_SECONDS * 1000;

// Object Station/Port chuẩn theo docs/contracts.md mục 3
const toPort = (row) => ({
  id: row.id,
  stationId: row.station_id,
  portNumber: row.port_number,
  status: row.status,
  serviceStatus: row.service_status,
  online: isPortOnline(row.last_seen_at),
  lastSeenAt: row.last_seen_at,
});

const toStation = (row, ports = []) => ({
  id: row.id,
  name: row.name,
  ownerId: row.owner_id,
  isActive: row.is_active,
  location: { lat: Number(row.lat), lng: Number(row.lng) },
  ports: ports.map(toPort),
  createdAt: row.created_at,
});

// geom -> {lat,lng} qua ST_X/ST_Y (PostGIS), không tính toán tọa độ bằng JS
const STATION_COLUMNS = 'id, owner_id, name, code, is_active, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at';

const findStationRowById = async (id) => {
  const { rows } = await query(`SELECT ${STATION_COLUMNS} FROM stations WHERE id = $1`, [id]);
  return rows[0];
};

const findPortsByStationIds = async (stationIds) => {
  if (stationIds.length === 0) return new Map();
  const { rows } = await query('SELECT * FROM ports WHERE station_id = ANY($1::int[]) ORDER BY port_number', [
    stationIds,
  ]);
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.station_id) ?? [];
    list.push(row);
    map.set(row.station_id, list);
  }
  return map;
};

// Trả về các Station đầy đủ (kèm ports) cho 1 danh sách row trạm
const withPorts = async (stationRows) => {
  const portsByStation = await findPortsByStationIds(stationRows.map((row) => row.id));
  return stationRows.map((row) => toStation(row, portsByStation.get(row.id) ?? []));
};

// Port kèm thông tin trạm (owner, active) — dùng cho kiểm tra quyền owner theo cổng
const findPortWithStation = async (portId, client = { query }) => {
  const { rows } = await client.query(
    `SELECT p.*, s.owner_id AS station_owner_id, s.is_active AS station_is_active, s.code AS station_code
     FROM ports p JOIN stations s ON s.id = p.station_id
     WHERE p.id = $1`,
    [portId],
  );
  return rows[0];
};

const stationNotFoundError = () => new AppError(404, 'STATION_NOT_FOUND', 'Không tìm thấy trạm');

module.exports = {
  isPortOnline,
  toStation,
  toPort,
  STATION_COLUMNS,
  findStationRowById,
  findPortsByStationIds,
  findPortWithStation,
  withPorts,
  stationNotFoundError,
};
