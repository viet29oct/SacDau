const { query } = require('../db');
const { AppError } = require('../utils/http');

// Object Station/Port chuẩn theo docs/contracts.md mục 3
const toPort = (row) => ({
  id: row.id,
  stationId: row.station_id,
  portNumber: row.port_number,
  status: row.status,
});

const toStation = (row, ports = []) => ({
  id: row.id,
  name: row.name,
  ownerId: row.owner_id,
  location: { lat: Number(row.lat), lng: Number(row.lng) },
  ports: ports.map(toPort),
  createdAt: row.created_at,
});

// geom -> {lat,lng} qua ST_X/ST_Y (PostGIS), không tính toán tọa độ bằng JS
const STATION_COLUMNS = 'id, owner_id, name, code, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at';

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

const stationNotFoundError = () => new AppError(404, 'STATION_NOT_FOUND', 'Không tìm thấy trạm');

module.exports = {
  toStation,
  toPort,
  STATION_COLUMNS,
  findStationRowById,
  findPortsByStationIds,
  stationNotFoundError,
};
