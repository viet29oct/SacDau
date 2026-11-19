const crypto = require('crypto');
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

// Tạo trực tiếp 1 trạm + cổng bằng SQL (quyền tạo trạm đã test riêng ở stations.test.js).
// Mặc định trạm có quản lý (tạo mới nếu không truyền ownerId) và cổng đang online — đủ điều
// kiện nhận đặt chỗ. Truyền ownerId: null để có trạm chưa phân công.
const createStationWithPort = async ({ code = 'ST01', portsCount = 1, ownerId, online = true } = {}) => {
  let owner = null;
  let resolvedOwnerId = ownerId;
  if (ownerId === undefined) {
    owner = await createOwner({ email: `owner-${code.toLowerCase()}@example.com` });
    resolvedOwnerId = owner.user.id;
  }
  const { rows } = await pool.query(
    `INSERT INTO stations (name, code, geom, owner_id)
     VALUES ('Trạm test', $1, ST_SetSRID(ST_MakePoint(105.7829, 21.0368), 4326), $2)
     RETURNING id`,
    [code, resolvedOwnerId],
  );
  const stationId = rows[0].id;
  const portIds = [];
  for (let n = 1; n <= portsCount; n += 1) {
    const { rows: portRows } = await pool.query(
      `INSERT INTO ports (station_id, port_number, last_seen_at) VALUES ($1, $2, ${online ? 'now()' : 'NULL'})
       RETURNING id`,
      [stationId, n],
    );
    portIds.push(portRows[0].id);
  }
  return { stationId, portId: portIds[0], portIds, owner };
};

// Mốc giờ Việt Nam cụ thể (vd vnTime(1, 10) = 10h sáng mai giờ VN) — để test không phụ thuộc giờ chạy
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const vnTime = (daysAhead, hour, minute = 0) => {
  const nowVn = new Date(Date.now() + VN_OFFSET_MS);
  return new Date(
    Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate() + daysAhead, hour, minute) - VN_OFFSET_MS,
  );
};
const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60 * 1000);

// Ký giống đúng thuật toán của services/vnpay.js để giả lập callback VNPay
const signVnpay = (params) => {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .reduce((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});
  const signData = Object.entries(sorted)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v)).replace(/%20/g, '+')}`)
    .join('&');
  return crypto.createHmac('sha512', process.env.VNPAY_HASH_SECRET).update(signData, 'utf-8').digest('hex');
};
const withValidSignature = (params) => ({ ...params, vnp_SecureHash: signVnpay(params) });

const simulateIpn = (txnRef, { amount, responseCode = '00', transactionNo = '14231456' } = {}) =>
  request(app)
    .get('/payments/vnpay-ipn')
    .query(
      withValidSignature({
        vnp_TxnRef: txnRef,
        vnp_Amount: String(Math.round(amount * 100)),
        vnp_ResponseCode: responseCode,
        vnp_TransactionStatus: responseCode,
        vnp_TransactionNo: transactionNo,
      }),
    );

const latestPayment = async ({ bookingId, sessionId }) => {
  const { rows } = bookingId
    ? await pool.query(
        "SELECT * FROM payments WHERE booking_id = $1 AND purpose = 'booking_deposit' ORDER BY id DESC LIMIT 1",
        [bookingId],
      )
    : await pool.query(
        "SELECT * FROM payments WHERE charging_session_id = $1 AND purpose = 'session' ORDER BY id DESC LIMIT 1",
        [sessionId],
      );
  return rows[0];
};

// IPN thành công cho giao dịch cọc mới nhất của booking
const payDeposit = async (bookingId) => {
  const payment = await latestPayment({ bookingId });
  return simulateIpn(payment.vnpay_txn_ref, { amount: Number(payment.amount) });
};

// Chèn booking thẳng DB (bỏ qua luật đặt chỗ) — dùng khi cần booking ở thời điểm/trạng thái cụ thể.
// depositPaid: kèm giao dịch cọc 20.000đ đã thành công.
const insertBooking = async ({
  userId,
  portId,
  startOffsetMin = 0,
  durationMin = 60,
  status = 'confirmed',
  code = '123456',
  depositPaid = true,
}) => {
  const { rows } = await pool.query(
    `INSERT INTO bookings (user_id, port_id, start_time, end_time, status, deposit_amount, check_in_code)
     VALUES ($1, $2, now() + make_interval(mins => $3), now() + make_interval(mins => $3 + $4), $5, 20000, $6)
     RETURNING *`,
    [userId, portId, startOffsetMin, durationMin, status, code],
  );
  const booking = rows[0];
  if (depositPaid) {
    await pool.query(
      `INSERT INTO payments (purpose, booking_id, user_id, amount, status, vnpay_txn_ref, paid_at)
       VALUES ('booking_deposit', $1, $2, 20000, 'success', $3, now())`,
      [booking.id, userId, `DEP${booking.id}`],
    );
  }
  return booking;
};

module.exports = {
  resetDb,
  createUser,
  registerUser,
  createAdmin,
  createOwner,
  createStationWithPort,
  vnTime,
  minutesFromNow,
  signVnpay,
  withValidSignature,
  simulateIpn,
  latestPayment,
  payDeposit,
  insertBooking,
};
