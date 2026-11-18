const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { createAdmin, createStationWithPort, insertBooking, registerUser, resetDb } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

const insertSession = async ({ portId, userId = null, bookingId = null, energy, energyCost, idleFee = 0, depositApplied = 0 }) => {
  const { rows } = await pool.query(
    `INSERT INTO charging_sessions
       (port_id, user_id, booking_id, started_at, ended_at, energy_kwh, unit_price, energy_cost, idle_fee, cost, deposit_applied, end_reason)
     VALUES ($1, $2, $3, now() - interval '3 hour', now() - interval '2 hour', $4, 3500, $5, $6, $5::numeric + $6::numeric, $7, 'device_idle')
     RETURNING id`,
    [portId, userId, bookingId, energy, energyCost, idleFee, depositApplied],
  );
  return rows[0].id;
};

// ST01 (quản lý A): 1 phiên đã trả đủ có phí chiếm chỗ, 1 phiên trái phép, 1 no-show, 1 cọc cần hoàn.
// ST02 (quản lý B): 1 phiên còn nợ.
const seed = async () => {
  const st1 = await createStationWithPort({ code: 'ST01' });
  const st2 = await createStationWithPort({ code: 'ST02' });
  const driver = await registerUser();
  const driver2 = await registerUser({ email: 'b@example.com' });

  const done = await insertBooking({ userId: driver.user.id, portId: st1.portId, startOffsetMin: -200, status: 'completed' });
  const s1 = await insertSession({
    portId: st1.portId,
    userId: driver.user.id,
    bookingId: done.id,
    energy: 10,
    energyCost: 35000,
    idleFee: 15000,
    depositApplied: 20000,
  });
  await pool.query(
    `INSERT INTO payments (purpose, charging_session_id, user_id, amount, status, vnpay_txn_ref, paid_at)
     VALUES ('session', $1, $2, 30000, 'success', 'S1', now())`,
    [s1, driver.user.id],
  );
  await insertSession({ portId: st1.portId, energy: 2, energyCost: 7000 }); // trái phép
  await insertBooking({ userId: driver.user.id, portId: st1.portId, startOffsetMin: -100, durationMin: 30, status: 'no_show' });
  const refunded = await insertBooking({ userId: driver.user.id, portId: st1.portId, startOffsetMin: 300, status: 'cancelled' });
  await pool.query("UPDATE payments SET refund_status = 'due' WHERE booking_id = $1", [refunded.id]);

  const done2 = await insertBooking({ userId: driver2.user.id, portId: st2.portId, startOffsetMin: -200, status: 'completed' });
  await insertSession({
    portId: st2.portId,
    userId: driver2.user.id,
    bookingId: done2.id,
    energy: 10,
    energyCost: 35000,
    depositApplied: 20000,
  });
  return { st1, st2, driver };
};

describe('GET /reports/revenue', () => {
  it('quản lý trạm chỉ thấy số liệu trạm được phân công', async () => {
    const { st1 } = await seed();
    const res = await request(app).get('/reports/revenue').set('Authorization', `Bearer ${st1.owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalRevenue: 50000,
      totalSessions: 1,
      byStation: [{ stationId: st1.stationId, revenue: 50000 }],
      collectedRevenue: 70000, // cọc 20.000 + phần còn lại 30.000 + cọc no-show 20.000 (cọc cần hoàn không tính)
      idleFees: 15000,
      forfeitedDeposits: 20000, // no-show
      refundsDue: 20000,
      outstandingRevenue: 0,
      unauthorized: { sessions: 1, energyKwh: 2, amount: 7000 },
    });
  });

  it('admin thấy toàn hệ thống; tài xế -> 403', async () => {
    const { driver } = await seed();
    const admin = await createAdmin();
    const res = await request(app).get('/reports/revenue').set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.body.data).toMatchObject({
      totalRevenue: 85000,
      totalSessions: 2,
      collectedRevenue: 90000, // + cọc 20.000 của ST02
      outstandingRevenue: 15000,
    });
    const forbidden = await request(app).get('/reports/revenue').set('Authorization', `Bearer ${driver.accessToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('from/to sai định dạng -> 400', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .get('/reports/revenue')
      .query({ from: 'hôm qua' })
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /reports/usage', () => {
  it('quản lý trạm chỉ thấy trạm mình (tính cả phiên trái phép)', async () => {
    const { st1 } = await seed();
    const res = await request(app).get('/reports/usage').set('Authorization', `Bearer ${st1.owner.accessToken}`);
    expect(res.body.data.byStation).toEqual([{ stationId: st1.stationId, count: 2 }]);
    expect(res.body.data.byHour.reduce((sum, h) => sum + h.count, 0)).toBe(2);
  });
});

describe('/incidents — sự cố cổng sạc', () => {
  it('quản lý chỉ thấy và đóng sự cố trạm mình; đóng phải có ghi chú', async () => {
    const { st1, st2 } = await seed();
    const { rows } = await pool.query(
      `INSERT INTO incidents (port_id, type) VALUES ($1, 'fault'), ($2, 'offline') RETURNING id`,
      [st1.portId, st2.portId],
    );
    const [own, others] = rows.map((r) => r.id);
    const token = st1.owner.accessToken;

    const list = await request(app).get('/incidents').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.map((i) => i.id)).toEqual([own]);

    expect((await request(app).patch(`/incidents/${others}/resolve`).set('Authorization', `Bearer ${token}`).send({ note: 'x' })).status).toBe(403);
    expect((await request(app).patch(`/incidents/${own}/resolve`).set('Authorization', `Bearer ${token}`).send({})).status).toBe(400);

    const resolved = await request(app)
      .patch(`/incidents/${own}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Đã thay cáp' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data).toMatchObject({ id: own, note: 'Đã thay cáp', resolvedBy: st1.owner.user.id });

    const open = await request(app).get('/incidents').set('Authorization', `Bearer ${token}`);
    expect(open.body.data).toEqual([]);
    const closed = await request(app).get('/incidents?status=resolved').set('Authorization', `Bearer ${token}`);
    expect(closed.body.data.map((i) => i.id)).toEqual([own]);
  });
});
