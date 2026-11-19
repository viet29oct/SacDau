const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { createAdmin, createOwner, registerUser, resetDb } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

describe('GET /users (RBAC)', () => {
  it('driver/owner -> 403 FORBIDDEN', async () => {
    const driver = await registerUser();
    const owner = await registerUser({ email: 'o@example.com', role: 'owner' });
    for (const { accessToken } of [driver, owner]) {
      const res = await request(app).get('/users').set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('admin -> danh sách user, không có passwordHash', async () => {
    await registerUser();
    const admin = await createAdmin();
    const res = await request(app).get('/users').set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe('PATCH /users/:id (chống IDOR)', () => {
  it('chính chủ sửa được tên/email của mình', async () => {
    const a = await registerUser();
    const res = await request(app)
      .patch(`/users/${a.user.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'Tên mới' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Tên mới', email: 'a@example.com' });
  });

  it('user A không sửa được user B -> 403, dữ liệu B không đổi', async () => {
    const a = await registerUser();
    const b = await registerUser({ name: 'B', email: 'b@example.com' });
    const res = await request(app)
      .patch(`/users/${b.user.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'Bị hack' });
    expect(res.status).toBe(403);
    const { rows } = await pool.query('SELECT name FROM users WHERE id = $1', [b.user.id]);
    expect(rows[0].name).toBe('B');
  });

  it('id không tồn tại với user thường -> 403 (không lộ id nào có thật)', async () => {
    const a = await registerUser();
    const res = await request(app)
      .patch('/users/9999')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('không tự nâng quyền qua field role (mass assignment)', async () => {
    const a = await registerUser();
    await request(app)
      .patch(`/users/${a.user.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'A', role: 'admin' });
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [a.user.id]);
    expect(rows[0].role).toBe('driver');
  });

  it('admin sửa được user khác; id không tồn tại -> 404', async () => {
    const a = await registerUser();
    const admin = await createAdmin();
    const res = await request(app)
      .patch(`/users/${a.user.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: 'moi@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('moi@example.com');

    const missing = await request(app)
      .patch('/users/9999')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'X' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('đổi sang email đã có -> 409', async () => {
    const a = await registerUser();
    await registerUser({ email: 'b@example.com' });
    const res = await request(app)
      .patch(`/users/${a.user.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ email: 'b@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('body rỗng hoặc id sai định dạng -> 400', async () => {
    const a = await registerUser();
    const empty = await request(app).patch(`/users/${a.user.id}`).set('Authorization', `Bearer ${a.accessToken}`).send({});
    const badId = await request(app).patch('/users/abc').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'X' });
    expect(empty.status).toBe(400);
    expect(badId.status).toBe(400);
  });
});

describe('POST /users (admin tạo tài khoản quản lý trạm)', () => {
  it('admin tạo owner -> 201, owner đăng nhập được; driver/owner gọi -> 403', async () => {
    const admin = await createAdmin();
    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Quản lý 1', email: 'ql1@example.com', password: 'matkhau123', role: 'owner' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'ql1@example.com', role: 'owner', isActive: true });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const login = await request(app).post('/auth/login').send({ email: 'ql1@example.com', password: 'matkhau123' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('owner');

    const driver = await registerUser();
    const forbidden = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ name: 'X', email: 'x@example.com', password: 'matkhau123', role: 'owner' });
    expect(forbidden.status).toBe(403);
  });

  it('không tạo được admin qua API; trùng email -> 409', async () => {
    const admin = await createAdmin();
    const asAdmin = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'X', email: 'x@example.com', password: 'matkhau123', role: 'admin' });
    expect(asAdmin.status).toBe(400);

    const dup = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'X', email: 'admin@example.com', password: 'matkhau123', role: 'owner' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });
});

describe('PATCH /users/:id/status (khoá/mở tài khoản)', () => {
  it('admin khoá rồi mở lại tài xế; tài xế bị khoá không đăng nhập được', async () => {
    const admin = await createAdmin();
    const driver = await registerUser();
    const lock = await request(app)
      .patch(`/users/${driver.user.id}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isActive: false });
    expect(lock.status).toBe(200);
    expect(lock.body.data.isActive).toBe(false);
    const login = await request(app).post('/auth/login').send({ email: 'a@example.com', password: 'matkhau123' });
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');

    const unlock = await request(app)
      .patch(`/users/${driver.user.id}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isActive: true });
    expect(unlock.body.data.isActive).toBe(true);
  });

  it('không khoá quản lý đang phụ trách trạm -> 409 OWNER_HAS_STATIONS', async () => {
    const admin = await createAdmin();
    const owner = await createOwner();
    await pool.query(
      `INSERT INTO stations (name, code, geom, owner_id)
       VALUES ('Trạm', 'ST01', ST_SetSRID(ST_MakePoint(105.78, 21.03), 4326), $1)`,
      [owner.user.id],
    );
    const res = await request(app)
      .patch(`/users/${owner.user.id}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OWNER_HAS_STATIONS');
  });

  it('admin không tự khoá chính mình; không phải admin -> 403', async () => {
    const admin = await createAdmin();
    const self = await request(app)
      .patch(`/users/${admin.user.id}/status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isActive: false });
    expect(self.status).toBe(400);

    const driver = await registerUser();
    const res = await request(app)
      .patch(`/users/${admin.user.id}/status`)
      .set('Authorization', `Bearer ${driver.accessToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });
});

it('endpoint không tồn tại -> 404 đúng envelope', async () => {
  const res = await request(app).get('/khong-co');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ success: false, data: null, error: { code: 'NOT_FOUND', message: expect.any(String) } });
});
