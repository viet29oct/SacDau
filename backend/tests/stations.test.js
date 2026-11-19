const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { createAdmin, registerUser, resetDb } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

const createStation = (token, overrides = {}) =>
  request(app)
    .post('/stations')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Trạm Cầu Giấy', code: 'ST01', lat: 21.0368, lng: 105.7829, portsCount: 2, ...overrides });

describe('POST /stations (chỉ admin, mô hình mới)', () => {
  it('driver/owner -> 403 FORBIDDEN', async () => {
    const driver = await registerUser();
    const owner = await registerUser({ email: 'o@example.com', role: 'owner' });
    for (const { accessToken } of [driver, owner]) {
      const res = await createStation(accessToken);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('admin tạo được trạm kèm đúng số cổng (portsCount)', async () => {
    const admin = await createAdmin();
    const res = await createStation(admin.accessToken);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Trạm Cầu Giấy',
      ownerId: null,
      location: { lat: 21.0368, lng: 105.7829 },
    });
    expect(res.body.data.ports).toHaveLength(2);
    expect(res.body.data.ports.map((p) => p.portNumber)).toEqual([1, 2]);
    expect(res.body.data.ports.every((p) => p.status === 'idle')).toBe(true);
  });

  it('trùng code -> 409 STATION_CODE_ALREADY_EXISTS', async () => {
    const admin = await createAdmin();
    await createStation(admin.accessToken);
    const res = await createStation(admin.accessToken, { name: 'Trạm khác' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STATION_CODE_ALREADY_EXISTS');
  });
});

describe('GET /stations (public)', () => {
  it('không cần token vẫn xem được, kèm ports', async () => {
    const admin = await createAdmin();
    await createStation(admin.accessToken);

    const res = await request(app).get('/stations');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].ports).toHaveLength(2);
  });

  it('?near=lat,lng&radiusKm= lọc đúng trạm trong bán kính, loại trạm ngoài bán kính', async () => {
    const admin = await createAdmin();
    await createStation(admin.accessToken); // Cầu Giấy, 21.0368,105.7829
    await createStation(admin.accessToken, {
      name: 'Trạm xa',
      code: 'ST02',
      lat: 10.7769,
      lng: 106.7009, // TP.HCM, rất xa Hà Nội
    });

    const res = await request(app).get('/stations').query({ near: '21.0368,105.7829', radiusKm: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Trạm Cầu Giấy');
  });

  it('near sai định dạng -> 400', async () => {
    const res = await request(app).get('/stations').query({ near: 'không-hợp-lệ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /stations/:id không tồn tại -> 404 STATION_NOT_FOUND', async () => {
    const res = await request(app).get('/stations/9999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('STATION_NOT_FOUND');
  });
});

describe('PATCH /stations/:id và assign-owner (dữ liệu gốc chỉ admin sửa)', () => {
  it('admin sửa được tên/toạ độ; owner kể cả được phân công -> 403', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const stationId = created.body.data.id;
    const owner = await registerUser({ email: 'o@example.com', role: 'owner' });
    await request(app)
      .patch(`/stations/${stationId}/assign-owner`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ ownerId: owner.user.id });

    const byOwner = await request(app)
      .patch(`/stations/${stationId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ lat: 10.1 });
    expect(byOwner.status).toBe(403);

    const byAdmin = await request(app)
      .patch(`/stations/${stationId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Trạm đã đổi tên' });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data).toMatchObject({ name: 'Trạm đã đổi tên', location: { lat: 21.0368, lng: 105.7829 } });
  });

  it('admin phân công owner -> /stations/managed của owner đó có trạm, owner khác không thấy', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const stationId = created.body.data.id;
    const owner = await registerUser({ email: 'o@example.com', role: 'owner' });
    const otherOwner = await registerUser({ email: 'o2@example.com', role: 'owner' });

    const assign = await request(app)
      .patch(`/stations/${stationId}/assign-owner`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ ownerId: owner.user.id });
    expect(assign.status).toBe(200);
    expect(assign.body.data.ownerId).toBe(owner.user.id);

    const mine = await request(app).get('/stations/managed').set('Authorization', `Bearer ${owner.accessToken}`);
    expect(mine.body.data.map((s) => s.id)).toEqual([stationId]);
    const others = await request(app)
      .get('/stations/managed')
      .set('Authorization', `Bearer ${otherOwner.accessToken}`);
    expect(others.body.data).toEqual([]);
  });

  it('không phân công được owner đang bị khoá', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const owner = await registerUser({ email: 'o@example.com', role: 'owner', isActive: false });
    const res = await request(app)
      .patch(`/stations/${created.body.data.id}/assign-owner`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ ownerId: owner.user.id });
    expect(res.status).toBe(400);
  });

  it('assign-owner với ownerId không phải role owner -> 400 VALIDATION_ERROR', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const driver = await registerUser();

    const res = await request(app)
      .patch(`/stations/${created.body.data.id}/assign-owner`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ ownerId: driver.user.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('owner/driver gọi assign-owner -> 403', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const driver = await registerUser();

    const res = await request(app)
      .patch(`/stations/${created.body.data.id}/assign-owner`)
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ ownerId: driver.user.id });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /stations/:id (chỉ admin, ngừng hoạt động - soft)', () => {
  it('admin ngừng hoạt động được; trạm biến khỏi danh sách public nhưng vẫn còn trong DB; driver -> 403', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const driver = await registerUser();

    const forbidden = await request(app)
      .delete(`/stations/${created.body.data.id}`)
      .set('Authorization', `Bearer ${driver.accessToken}`);
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .delete(`/stations/${created.body.data.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    const after = await request(app).get(`/stations/${created.body.data.id}`);
    expect(after.status).toBe(404);
    const list = await request(app).get('/stations');
    expect(list.body.data).toHaveLength(0);
    const managed = await request(app).get('/stations/managed').set('Authorization', `Bearer ${admin.accessToken}`);
    expect(managed.body.data[0].isActive).toBe(false);
  });

  it('còn booking sắp tới -> 409 STATION_IN_USE (trước đây xoá cứng sẽ lỗi khoá ngoại 500)', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const driver = await registerUser();
    const portId = created.body.data.ports[0].id;
    await pool.query(
      `INSERT INTO bookings (user_id, port_id, start_time, end_time, status)
       VALUES ($1, $2, now() + interval '1 day', now() + interval '1 day 1 hour', 'confirmed')`,
      [driver.user.id, portId],
    );
    const res = await request(app)
      .delete(`/stations/${created.body.data.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STATION_IN_USE');
  });
});

describe('PATCH /ports/:id/service (bảo trì cổng)', () => {
  it('owner được phân công bật bảo trì -> trả booking bị ảnh hưởng; owner khác -> 403', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const owner = await registerUser({ email: 'o@example.com', role: 'owner' });
    const otherOwner = await registerUser({ email: 'o2@example.com', role: 'owner' });
    const driver = await registerUser();
    await request(app)
      .patch(`/stations/${created.body.data.id}/assign-owner`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ ownerId: owner.user.id });
    const portId = created.body.data.ports[0].id;
    await pool.query(
      `INSERT INTO bookings (user_id, port_id, start_time, end_time, status)
       VALUES ($1, $2, now() + interval '1 day', now() + interval '1 day 1 hour', 'confirmed')`,
      [driver.user.id, portId],
    );

    const forbidden = await request(app)
      .patch(`/ports/${portId}/service`)
      .set('Authorization', `Bearer ${otherOwner.accessToken}`)
      .send({ serviceStatus: 'maintenance' });
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .patch(`/ports/${portId}/service`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ serviceStatus: 'maintenance', reason: 'Hỏng cáp' });
    expect(res.status).toBe(200);
    expect(res.body.data.port).toMatchObject({ id: portId, serviceStatus: 'maintenance', online: false });
    expect(res.body.data.affectedBookings).toHaveLength(1);
    expect(res.body.data.affectedBookings[0].checkInCode).toBeNull();
  });
});
