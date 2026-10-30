const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { createAdmin, createStationWithPort, registerUser, resetDb } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

// Tạo trực tiếp 1 port bằng SQL (không qua /auth/login nhiều lần -> tránh chạm rate limit,
// quyền tạo trạm đã test riêng ở stations.test.js)
const createPort = async () => (await createStationWithPort()).portId;

const createBookingRow = async (userId, portId) => {
  const { rows } = await pool.query(
    `INSERT INTO bookings (user_id, port_id, start_time, end_time, status)
     VALUES ($1, $2, now() - interval '3 hour', now() - interval '2 hour', 'confirmed')
     RETURNING id`,
    [userId, portId],
  );
  return rows[0].id;
};

const createSession = async ({ portId, bookingId = null, ended = true, cost = 50000 }) => {
  const { rows } = await pool.query(
    `INSERT INTO charging_sessions (booking_id, port_id, started_at, ended_at, energy_kwh, cost)
     VALUES ($1, $2, now() - interval '1 hour', ${ended ? 'now()' : 'NULL'}, 10, $3)
     RETURNING id`,
    [bookingId, portId, ended ? cost : null],
  );
  return rows[0].id;
};

// Ký lại giống đúng thuật toán của services/vnpay.js để giả lập callback VNPay trong test
const sign = (params, hashSecret) => {
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
  return crypto.createHmac('sha512', hashSecret).update(signData, 'utf-8').digest('hex');
};

const withValidSignature = (params) => ({
  ...params,
  vnp_SecureHash: sign(params, process.env.VNPAY_HASH_SECRET),
});

describe('POST /payments (điều kiện mở thanh toán)', () => {
  it('phiên hợp lệ, đúng tài xế -> 201, trả paymentUrl', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const bookingId = await createBookingRow(driver.user.id, portId);
    const sessionId = await createSession({ portId, bookingId });

    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ chargingSessionId: sessionId });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentUrl).toMatch(/^https:\/\/sandbox\.vnpayment\.vn/);
    expect(res.body.data.paymentUrl).toMatch(/vnp_SecureHash=/);
  });

  it('phiên vãng lai (không có booking) -> 403 FORBIDDEN', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const sessionId = await createSession({ portId, bookingId: null });

    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ chargingSessionId: sessionId });
    expect(res.status).toBe(403);
  });

  it('phiên của tài xế khác -> 403 FORBIDDEN', async () => {
    const portId = await createPort();
    const owner = await registerUser({ email: 'a@example.com' });
    const other = await registerUser({ email: 'b@example.com' });
    const bookingId = await createBookingRow(owner.user.id, portId);
    const sessionId = await createSession({ portId, bookingId });

    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ chargingSessionId: sessionId });
    expect(res.status).toBe(403);
  });

  it('phiên chưa kết thúc -> 400 VALIDATION_ERROR', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const bookingId = await createBookingRow(driver.user.id, portId);
    const sessionId = await createSession({ portId, bookingId, ended: false });

    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ chargingSessionId: sessionId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('đã có giao dịch success -> 409 PAYMENT_ALREADY_PROCESSED', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const bookingId = await createBookingRow(driver.user.id, portId);
    const sessionId = await createSession({ portId, bookingId });
    await pool.query(
      "INSERT INTO payments (charging_session_id, amount, status, vnpay_txn_ref) VALUES ($1, 50000, 'success', 'TXN1')",
      [sessionId],
    );

    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ chargingSessionId: sessionId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_ALREADY_PROCESSED');
  });
});

describe('GET /payments/:id (chống IDOR)', () => {
  it('chính chủ xem được, người khác -> 403, admin xem được', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });
    const admin = await createAdmin();
    const bookingId = await createBookingRow(driver.user.id, portId);
    const sessionId = await createSession({ portId, bookingId });
    const { rows } = await pool.query(
      "INSERT INTO payments (charging_session_id, amount, status, vnpay_txn_ref) VALUES ($1, 50000, 'pending', 'TXN2') RETURNING id",
      [sessionId],
    );
    const paymentId = rows[0].id;

    const ownRes = await request(app).get(`/payments/${paymentId}`).set('Authorization', `Bearer ${driver.accessToken}`);
    expect(ownRes.status).toBe(200);

    const otherRes = await request(app).get(`/payments/${paymentId}`).set('Authorization', `Bearer ${other.accessToken}`);
    expect(otherRes.status).toBe(403);

    const adminRes = await request(app).get(`/payments/${paymentId}`).set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminRes.status).toBe(200);
  });

  it('id không tồn tại -> 404 PAYMENT_NOT_FOUND', async () => {
    const driver = await registerUser();
    const res = await request(app).get('/payments/9999').set('Authorization', `Bearer ${driver.accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND');
  });
});

describe('GET /payments/vnpay-return (không update DB, chỉ hiển thị kết quả)', () => {
  it('chữ ký sai -> redirect kèm reason=invalid_signature, không update payments', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const bookingId = await createBookingRow(driver.user.id, portId);
    const sessionId = await createSession({ portId, bookingId });
    const { rows } = await pool.query(
      "INSERT INTO payments (charging_session_id, amount, status, vnpay_txn_ref) VALUES ($1, 50000, 'pending', 'TXN3') RETURNING id",
      [sessionId],
    );

    const res = await request(app)
      .get('/payments/vnpay-return')
      .query({ vnp_TxnRef: 'TXN3', vnp_ResponseCode: '00', vnp_SecureHash: 'sai-chu-ky' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/reason=invalid_signature/);

    const check = await pool.query('SELECT status FROM payments WHERE id = $1', [rows[0].id]);
    expect(check.rows[0].status).toBe('pending');
  });

  it('chữ ký đúng, responseCode 00 -> redirect status=success (vẫn không update DB)', async () => {
    const signed = withValidSignature({ vnp_TxnRef: 'TXN4', vnp_ResponseCode: '00' });
    const res = await request(app).get('/payments/vnpay-return').query(signed);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/status=success/);
  });
});

describe('GET /payments/vnpay-ipn (VNPay gọi bằng GET, phải trả đúng format VNPay)', () => {
  it('chữ ký sai -> RspCode 97', async () => {
    const res = await request(app)
      .get('/payments/vnpay-ipn')
      .query({ vnp_TxnRef: 'TXN5', vnp_ResponseCode: '00', vnp_SecureHash: 'sai' });
    expect(res.status).toBe(200);
    expect(res.body.RspCode).toBe('97');
  });

  it('vnp_TxnRef không tồn tại -> RspCode 01', async () => {
    const signed = withValidSignature({ vnp_TxnRef: 'KHONG-TON-TAI', vnp_ResponseCode: '00' });
    const res = await request(app).get('/payments/vnpay-ipn').query(signed);
    expect(res.body.RspCode).toBe('01');
  });

  it('responseCode 00 -> cập nhật payments.status=success, trả RspCode 00', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const bookingId = await createBookingRow(driver.user.id, portId);
    const sessionId = await createSession({ portId, bookingId });
    const { rows } = await pool.query(
      "INSERT INTO payments (charging_session_id, amount, status, vnpay_txn_ref) VALUES ($1, 50000, 'pending', 'TXN6') RETURNING id",
      [sessionId],
    );

    const signed = withValidSignature({
      vnp_TxnRef: 'TXN6',
      vnp_ResponseCode: '00',
      vnp_TransactionNo: '14231456',
    });
    const res = await request(app).get('/payments/vnpay-ipn').query(signed);
    expect(res.body).toEqual({ RspCode: '00', Message: 'Confirm Success' });

    const check = await pool.query('SELECT status, vnpay_transaction_no FROM payments WHERE id = $1', [rows[0].id]);
    expect(check.rows[0].status).toBe('success');
    expect(check.rows[0].vnpay_transaction_no).toBe('14231456');
  });

  it('IPN gọi lại cho giao dịch đã xử lý -> RspCode 02, không xử lý lại', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const bookingId = await createBookingRow(driver.user.id, portId);
    const sessionId = await createSession({ portId, bookingId });
    await pool.query(
      "INSERT INTO payments (charging_session_id, amount, status, vnpay_txn_ref) VALUES ($1, 50000, 'success', 'TXN7')",
      [sessionId],
    );

    const signed = withValidSignature({ vnp_TxnRef: 'TXN7', vnp_ResponseCode: '00' });
    const res = await request(app).get('/payments/vnpay-ipn').query(signed);
    expect(res.body.RspCode).toBe('02');
  });
});
