const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');
const { createAdmin, registerUser, resetDb } = require('./helpers');

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

it('endpoint không tồn tại -> 404 đúng envelope', async () => {
  const res = await request(app).get('/khong-co');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ success: false, data: null, error: { code: 'NOT_FOUND', message: expect.any(String) } });
});
