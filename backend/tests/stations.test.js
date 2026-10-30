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

describe('PATCH /stations/:id và assign-owner (chống IDOR theo mô hình owner-được-phân-công)', () => {
  it('owner chưa được phân công -> 403 khi sửa trạm', async () => {
    const admin = await createAdmin();
    const created = await createStation(admin.accessToken);
    const owner = await registerUser({ email: 'o@example.com', role: 'owner' });

    const res = await request(app)
      .patch(`/stations/${created.body.data.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Tên mới' });
    expect(res.status).toBe(403);
  });

  it('admin phân công owner -> owner đó sửa được, owner khác vẫn 403', async () => {
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

    const okRes = await request(app)
      .patch(`/stations/${stationId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Trạm đã đổi tên' });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.name).toBe('Trạm đã đổi tên');

    const forbidden = await request(app)
      .patch(`/stations/${stationId}`)
      .set('Authorization', `Bearer ${otherOwner.accessToken}`)
      .send({ name: 'Hack' });
    expect(forbidden.status).toBe(403);
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

describe('DELETE /stations/:id (chỉ admin)', () => {
  it('admin xoá được; driver -> 403', async () => {
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

    const after = await request(app).get(`/stations/${created.body.data.id}`);
    expect(after.status).toBe(404);
  });
});
