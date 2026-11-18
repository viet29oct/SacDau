const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const pool = require('../src/db');
const { signAccessToken, signRefreshToken } = require('../src/services/token');
const { toUser } = require('../src/services/users');

// DELETE theo thứ tự khoá ngoại thay cho TRUNCATE ... CASCADE: TRUNCATE phải tạo lại file cho
// mọi bảng + index (nhiều bảng/index sau migration business-flows) -> chậm, hay timeout trên Docker Desktop.
const resetDb = () =>
  pool.query(`
    DELETE FROM payments; DELETE FROM incidents; DELETE FROM telemetry; DELETE FROM charging_sessions;
    DELETE FROM bookings; DELETE FROM ports; DELETE FROM stations; DELETE FROM audit_logs; DELETE FROM users;
    ALTER SEQUENCE users_id_seq RESTART; ALTER SEQUENCE stations_id_seq RESTART; ALTER SEQUENCE ports_id_seq RESTART;
    ALTER SEQUENCE bookings_id_seq RESTART; ALTER SEQUENCE charging_sessions_id_seq RESTART;
    ALTER SEQUENCE payments_id_seq RESTART; ALTER SEQUENCE incidents_id_seq RESTART;
  `);

// Chèn user thẳng vào DB rồi ký token qua services/token.js — không gọi /auth/login
// (rate limit 10 lần/15 phút/IP sẽ làm test chập chờn khi tạo nhiều user).
const createUser = async ({
  name = 'Người dùng',
  email = 'user@example.com',
  password = 'matkhau123',
  role = 'driver',
  isActive = true,
} = {}) => {
  const hash = await bcrypt.hash(password, 4);
  const { rows } = await pool.query(
    'INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name, email, hash, role, isActive],
  );
  const row = rows[0];
  return {
    user: toUser(row),
    accessToken: signAccessToken(row.id, row.role),
    refreshToken: signRefreshToken(row.id, row.role),
  };
};

// Tài xế đi qua API /auth/register thật (để test luôn đường đăng ký); role khác không tự đăng ký
// được nữa (2026-11-18) nên tạo thẳng DB.
const registerUser = async ({ role = 'driver', ...overrides } = {}) => {
  const body = { name: 'Tài xế A', email: 'a@example.com', password: 'matkhau123', ...overrides };
  if (role !== 'driver') return createUser({ ...body, role });
  const res = await request(app).post('/auth/register').send(body);
  return res.body.data;
};

const createAdmin = () =>
  createUser({ name: 'Admin', email: 'admin@example.com', password: 'adminpass123', role: 'admin' });

const createOwner = (overrides = {}) =>
  createUser({ name: 'Quản lý trạm', email: 'owner@example.com', role: 'owner', ...overrides });

// Tạo trực tiếp 1 trạm + 1 cổng bằng SQL (không qua POST /stations/login) — dùng cho test
// bookings/payments chỉ cần có sẵn 1 port, không nhằm kiểm tra quyền tạo trạm (đã test riêng
// ở stations.test.js). Tránh gọi /auth/login nhiều lần trong 1 file -> dễ chạm rate limit 10
// lần/15 phút của /auth/login (express-rate-limit, xem src/middleware/rateLimiter.js).
const createStationWithPort = async ({ code = 'ST01', portNumber = 1 } = {}) => {
  const { rows } = await pool.query(
    `INSERT INTO stations (name, code, geom)
     VALUES ('Trạm test', $1, ST_SetSRID(ST_MakePoint(105.7829, 21.0368), 4326))
     RETURNING id`,
    [code],
  );
  const stationId = rows[0].id;
  const { rows: portRows } = await pool.query(
    'INSERT INTO ports (station_id, port_number) VALUES ($1, $2) RETURNING id',
    [stationId, portNumber],
  );
  return { stationId, portId: portRows[0].id };
};

module.exports = { resetDb, createUser, registerUser, createAdmin, createOwner, createStationWithPort };
