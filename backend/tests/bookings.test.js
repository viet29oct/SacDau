const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { createStationWithPort, registerUser, resetDb } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

// Tạo trực tiếp 1 port bằng SQL (không qua /auth/login nhiều lần -> tránh chạm rate limit,
// quyền tạo trạm đã test riêng ở stations.test.js)
const createPort = async () => (await createStationWithPort()).portId;

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const inTwoHours = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

describe('POST /bookings', () => {
  it('driver tạo booking -> 201, status confirmed ngay (không qua pending)', async () => {
    const portId = await createPort();
    const driver = await registerUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId, startTime: inOneHour(), endTime: inTwoHours() });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ userId: driver.user.id, portId, status: 'confirmed' });
  });

  it('owner/admin không đặt chỗ được -> 403', async () => {
    const portId = await createPort();
    const owner = await registerUser({ email: 'o@example.com', role: 'owner' });

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ portId, startTime: inOneHour(), endTime: inTwoHours() });
    expect(res.status).toBe(403);
  });

  it('trùng giờ cùng port -> 409 BOOKING_CONFLICT', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });

    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId, startTime: inOneHour(), endTime: inTwoHours() });

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .send({ portId, startTime: inOneHour(), endTime: inTwoHours() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_CONFLICT');
  });

  it('startTime ở quá khứ -> 400 VALIDATION_ERROR', async () => {
    const portId = await createPort();
    const driver = await registerUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId, startTime: '2020-01-01T00:00:00Z', endTime: inOneHour() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('endTime <= startTime -> 400 VALIDATION_ERROR', async () => {
    const portId = await createPort();
    const driver = await registerUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId, startTime: inTwoHours(), endTime: inOneHour() });
    expect(res.status).toBe(400);
  });

  it('portId không tồn tại -> 404 NOT_FOUND', async () => {
    await createPort();
    const driver = await registerUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId: 9999, startTime: inOneHour(), endTime: inTwoHours() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /bookings/me', () => {
  it('chỉ trả booking của chính mình', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId, startTime: inOneHour(), endTime: inTwoHours() });

    const res = await request(app).get('/bookings/me').set('Authorization', `Bearer ${other.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('PATCH /bookings/:id/cancel', () => {
  it('chính chủ hủy trước giờ bắt đầu -> 200, status cancelled', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId, startTime: inOneHour(), endTime: inTwoHours() });

    const res = await request(app)
      .patch(`/bookings/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${driver.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('hủy lại booking đã cancelled -> 400 BOOKING_CANCEL_NOT_ALLOWED', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId, startTime: inOneHour(), endTime: inTwoHours() });
    await request(app)
      .patch(`/bookings/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${driver.accessToken}`);

    const res = await request(app)
      .patch(`/bookings/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${driver.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BOOKING_CANCEL_NOT_ALLOWED');
  });

  it('đã quá giờ bắt đầu -> 400 BOOKING_CANCEL_NOT_ALLOWED', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    // Chèn thẳng 1 booking đã bắt đầu từ quá khứ (API không cho tạo booking quá khứ)
    const { rows } = await pool.query(
      `INSERT INTO bookings (user_id, port_id, start_time, end_time, status)
       VALUES ($1, $2, now() - interval '1 hour', now() + interval '1 hour', 'confirmed')
       RETURNING id`,
      [driver.user.id, portId],
    );

    const res = await request(app)
      .patch(`/bookings/${rows[0].id}/cancel`)
      .set('Authorization', `Bearer ${driver.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BOOKING_CANCEL_NOT_ALLOWED');
  });

  it('user khác không hủy được booking của mình -> 403', async () => {
    const portId = await createPort();
    const driver = await registerUser();
    const other = await registerUser({ email: 'b@example.com' });
    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ portId, startTime: inOneHour(), endTime: inTwoHours() });

    const res = await request(app)
      .patch(`/bookings/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${other.accessToken}`);
    expect(res.status).toBe(403);
  });
});
