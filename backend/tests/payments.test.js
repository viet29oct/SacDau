const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const {
  createAdmin,
  createStationWithPort,
  latestPayment,
  registerUser,
  resetDb,
  simulateIpn,
  withValidSignature,
} = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

// Phiên đã đóng của tài xế: tổng 50.000đ, cọc đã trừ 20.000đ -> còn 30.000đ
const createSession = async ({ portId, userId = null, ended = true, cost = 50000, depositApplied = 20000 }) => {
  const { rows } = await pool.query(
    `INSERT INTO charging_sessions (port_id, user_id, started_at, ended_at, energy_kwh, unit_price, energy_cost, cost, deposit_applied)
     VALUES ($1, $2, now() - interval '1 hour', ${ended ? 'now()' : 'NULL'}, 10, 3500, $3, $3, $4)
     RETURNING id`,
    [portId, userId, ended ? cost : null, ended ? depositApplied : 0],
  );
  return rows[0].id;
};

const pay = (token, chargingSessionId) =>
  request(app).post('/payments').set('Authorization', `Bearer ${token}`).send({ chargingSessionId });

describe('POST /payments — trả phần còn lại sau phiên sạc', () => {
  it('phiên của mình -> 201, số tiền = tổng - cọc đã trừ, link có hạn', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const sessionId = await createSession({ portId, userId: driver.user.id });

    const res = await pay(driver.accessToken, sessionId);
    expect(res.status).toBe(201);
    expect(res.body.data.paymentUrl).toMatch(/^https:\/\/sandbox\.vnpayment\.vn/);
    expect(res.body.data.paymentUrl).toMatch(/vnp_Amount=3000000/);
    expect(res.body.data.paymentUrl).toMatch(/vnp_ExpireDate=/);
    const payment = await latestPayment({ sessionId });
    expect(payment).toMatchObject({ id: res.body.data.paymentId, status: 'pending', user_id: driver.user.id });
    expect(Number(payment.amount)).toBe(30000);
  });

  it('phiên trái phép (không có chủ) hoặc của tài xế khác -> 403', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });
    const unauthorized = await createSession({ portId, userId: null });
    const othersSession = await createSession({ portId, userId: other.user.id });
    expect((await pay(driver.accessToken, unauthorized)).status).toBe(403);
    expect((await pay(driver.accessToken, othersSession)).status).toBe(403);
  });

  it('phiên chưa kết thúc / cọc đã phủ đủ -> 400 VALIDATION_ERROR', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const running = await createSession({ portId, userId: driver.user.id, ended: false });
    const covered = await createSession({ portId, userId: driver.user.id, cost: 15000, depositApplied: 15000 });
    for (const id of [running, covered]) {
      const res = await pay(driver.accessToken, id);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('đang có giao dịch chưa hết hạn -> 409 PAYMENT_IN_PROGRESS; /checkout trả lại đúng link cũ', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const sessionId = await createSession({ portId, userId: driver.user.id });
    const first = await pay(driver.accessToken, sessionId);

    const second = await pay(driver.accessToken, sessionId);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('PAYMENT_IN_PROGRESS');
    expect(second.body.error.details.paymentId).toBe(first.body.data.paymentId);

    const checkout = await request(app)
      .get(`/payments/${first.body.data.paymentId}/checkout`)
      .set('Authorization', `Bearer ${driver.accessToken}`);
    expect(checkout.status).toBe(200);
    expect(checkout.body.data.paymentUrl).toBe(first.body.data.paymentUrl);

    // Hết hạn -> tạo giao dịch mới được
    await pool.query("UPDATE payments SET expires_at = now() - interval '1 minute' WHERE id = $1", [
      first.body.data.paymentId,
    ]);
    expect((await pay(driver.accessToken, sessionId)).status).toBe(201);
  });

  it('đã thanh toán -> 409 PAYMENT_ALREADY_PROCESSED; GET /sessions/me báo paid', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const sessionId = await createSession({ portId, userId: driver.user.id });
    const created = await pay(driver.accessToken, sessionId);
    const payment = await latestPayment({ sessionId });
    await simulateIpn(payment.vnpay_txn_ref, { amount: 30000 });

    const again = await pay(driver.accessToken, sessionId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PAYMENT_ALREADY_PROCESSED');
    const me = await request(app).get('/sessions/me').set('Authorization', `Bearer ${driver.accessToken}`);
    expect(me.body.data[0]).toMatchObject({ amountDue: 30000, paymentStatus: 'paid' });
    expect(created.status).toBe(201);
  });
});

describe('GET /payments/:id (chống IDOR)', () => {
  it('chính chủ xem được, người khác -> 403, admin xem được; /checkout của người khác -> 403', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });
    const admin = await createAdmin();
    const sessionId = await createSession({ portId, userId: driver.user.id });
    const { paymentId } = (await pay(driver.accessToken, sessionId)).body.data;

    const get = (token, path = '') => request(app).get(`/payments/${paymentId}${path}`).set('Authorization', `Bearer ${token}`);
    expect((await get(driver.accessToken)).status).toBe(200);
    expect((await get(other.accessToken)).status).toBe(403);
    expect((await get(admin.accessToken)).status).toBe(200);
    expect((await get(other.accessToken, '/checkout')).status).toBe(403);
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
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const sessionId = await createSession({ portId, userId: driver.user.id });
    await pay(driver.accessToken, sessionId);
    const payment = await latestPayment({ sessionId });

    const res = await request(app)
      .get('/payments/vnpay-return')
      .query({ vnp_TxnRef: payment.vnpay_txn_ref, vnp_ResponseCode: '00', vnp_SecureHash: 'sai-chu-ky' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/reason=invalid_signature/);
    expect((await latestPayment({ sessionId })).status).toBe('pending');
  });

  it('chữ ký đúng, responseCode 00 -> redirect status=success (vẫn không update DB)', async () => {
    const signed = withValidSignature({ vnp_TxnRef: 'TXN4', vnp_ResponseCode: '00' });
    const res = await request(app).get('/payments/vnpay-return').query(signed);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/status=success/);
  });
});

describe('GET /payments/vnpay-ipn (VNPay gọi bằng GET, phải trả đúng format VNPay)', () => {
  const setupPending = async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const sessionId = await createSession({ portId, userId: driver.user.id });
    await pay(driver.accessToken, sessionId);
    return { driver, sessionId, payment: await latestPayment({ sessionId }) };
  };

  it('chữ ký sai -> 97; giao dịch không tồn tại -> 01', async () => {
    const bad = await request(app)
      .get('/payments/vnpay-ipn')
      .query({ vnp_TxnRef: 'TXN5', vnp_ResponseCode: '00', vnp_SecureHash: 'sai' });
    expect(bad.body.RspCode).toBe('97');
    const missing = await simulateIpn('KHONG-TON-TAI', { amount: 1000 });
    expect(missing.body.RspCode).toBe('01');
  });

  it('sai số tiền (giả mạo vnp_Amount) -> 04, giao dịch vẫn pending', async () => {
    const { payment, sessionId } = await setupPending();
    const res = await simulateIpn(payment.vnpay_txn_ref, { amount: 1000 });
    expect(res.body.RspCode).toBe('04');
    expect((await latestPayment({ sessionId })).status).toBe('pending');
  });

  it('00 -> success + lưu mã giao dịch; IPN gọi lại -> 02', async () => {
    const { payment, sessionId } = await setupPending();
    const res = await simulateIpn(payment.vnpay_txn_ref, { amount: 30000 });
    expect(res.body).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(await latestPayment({ sessionId })).toMatchObject({ status: 'success', vnpay_transaction_no: '14231456' });

    const again = await simulateIpn(payment.vnpay_txn_ref, { amount: 30000 });
    expect(again.body.RspCode).toBe('02');
  });

  it('responseCode khác 00 -> failed, vẫn trả 00 cho VNPay', async () => {
    const { payment, sessionId } = await setupPending();
    const res = await simulateIpn(payment.vnpay_txn_ref, { amount: 30000, responseCode: '24' });
    expect(res.body.RspCode).toBe('00');
    expect((await latestPayment({ sessionId })).status).toBe('failed');
  });

  it('VNPay trừ tiền 2 lần cho cùng phiên -> lần 2 vẫn ghi nhận (success + cần hoàn), IPN không lỗi', async () => {
    const { driver, payment: first, sessionId } = await setupPending();
    await pool.query("UPDATE payments SET expires_at = now() - interval '1 minute' WHERE id = $1", [first.id]);
    await pay(driver.accessToken, sessionId);
    const second = await latestPayment({ sessionId });

    expect((await simulateIpn(first.vnpay_txn_ref, { amount: 30000 })).body.RspCode).toBe('00');
    expect((await simulateIpn(second.vnpay_txn_ref, { amount: 30000 })).body.RspCode).toBe('00');
    const { rows } = await pool.query(
      'SELECT id, status, refund_status FROM payments WHERE charging_session_id = $1 ORDER BY id',
      [sessionId],
    );
    expect(rows).toEqual([
      { id: first.id, status: 'success', refund_status: null },
      { id: second.id, status: 'success', refund_status: 'due' },
    ]);
  });
});

describe('Hoàn tiền (admin)', () => {
  it('admin xem danh sách cần hoàn, xác nhận đã hoàn (có audit); xác nhận lại -> 409; tài xế -> 403', async () => {
    const { portId } = await createStationWithPort();
    const driver = await registerUser();
    const admin = await createAdmin();
    const sessionId = await createSession({ portId, userId: driver.user.id });
    const { rows } = await pool.query(
      `INSERT INTO payments (purpose, charging_session_id, user_id, amount, status, vnpay_txn_ref, refund_status, paid_at)
       VALUES ('session', $1, $2, 30000, 'success', 'TXNDUP', 'due', now()) RETURNING id`,
      [sessionId, driver.user.id],
    );
    const paymentId = rows[0].id;

    const list = await request(app).get('/payments/refunds').set('Authorization', `Bearer ${admin.accessToken}`);
    expect(list.body.data.map((p) => p.id)).toEqual([paymentId]);
    const byDriver = await request(app)
      .post(`/payments/${paymentId}/mark-refunded`)
      .set('Authorization', `Bearer ${driver.accessToken}`);
    expect(byDriver.status).toBe(403);

    const done = await request(app)
      .post(`/payments/${paymentId}/mark-refunded`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ note: 'Đã chuyển khoản hoàn' });
    expect(done.status).toBe(200);
    expect(done.body.data.refundStatus).toBe('refunded');
    const audit = await pool.query("SELECT detail FROM audit_logs WHERE action = 'payment.refunded'");
    expect(audit.rows[0].detail).toMatchObject({ paymentId, amount: 30000 });

    const again = await request(app)
      .post(`/payments/${paymentId}/mark-refunded`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(again.status).toBe(409);
  });
});
