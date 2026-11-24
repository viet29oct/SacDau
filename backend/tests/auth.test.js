const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/db');
const { createAdmin, createUser, registerUser, resetDb } = require('./helpers');

beforeEach(resetDb);
afterAll(() => pool.end());

describe('POST /auth/register', () => {
  it('tạo user, trả token, không lộ password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Tài xế A', email: 'A@Example.com ', password: 'matkhau123', role: 'driver' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toEqual({ id: 1, name: 'Tài xế A', email: 'a@example.com', role: 'driver', isActive: true });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = 1');
    expect(rows[0].password_hash).not.toBe('matkhau123');
  });

  it.each(['admin', 'owner'])('không cho tự đăng ký role %s (owner do admin cấp)', async (role) => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Hacker', email: 'h@example.com', password: 'matkhau123', role });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const { rows } = await pool.query('SELECT 1 FROM users');
    expect(rows).toHaveLength(0);
  });

  it('không gửi role -> luôn tạo tài xế', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'C', email: 'c@example.com', password: 'matkhau123' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('driver');
  });

  it('trùng email -> 409 EMAIL_ALREADY_EXISTS', async () => {
    await registerUser();
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'B', email: 'a@example.com', password: 'matkhau123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it.each([
    [{ email: 'a@example.com', password: 'matkhau123', role: 'driver' }],
    [{ name: 'A', email: 'khong-phai-email', password: 'matkhau123', role: 'driver' }],
    [{ name: 'A', email: 'a@example.com', password: 'ngan', role: 'driver' }],
  ])('body sai -> 400 VALIDATION_ERROR (%j)', async (body) => {
    const res = await request(app).post('/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, data: null, error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) });
  });

  it('JSON hỏng -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/auth/register').set('Content-Type', 'application/json').send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('quá giới hạn đăng ký theo IP -> 429 TOO_MANY_REQUESTS', async () => {
    // Limiter riêng (bộ đếm mới), không dùng chung bộ đếm với các test đăng ký khác trong file
    const original = process.env.REGISTER_RATE_LIMIT;
    process.env.REGISTER_RATE_LIMIT = '2';
    try {
      let registerRateLimiter;
      jest.isolateModules(() => {
        ({ registerRateLimiter } = require('../src/middleware/rateLimiter'));
      });
      const mini = express().post('/auth/register', registerRateLimiter, (_req, res) => res.status(201).end());
      expect((await request(mini).post('/auth/register')).status).toBe(201);
      expect((await request(mini).post('/auth/register')).status).toBe(201);
      const blocked = await request(mini).post('/auth/register');
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    } finally {
      process.env.REGISTER_RATE_LIMIT = original;
    }
  });
});

describe('POST /auth/login', () => {
  beforeEach(() => registerUser());

  it('đúng mật khẩu -> trả user + token', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'a@example.com', password: 'matkhau123' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('a@example.com');
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('sai mật khẩu và sai email trả cùng 1 lỗi 401', async () => {
    const wrongPass = await request(app).post('/auth/login').send({ email: 'a@example.com', password: 'saimatkhau' });
    const wrongEmail = await request(app).post('/auth/login').send({ email: 'x@example.com', password: 'matkhau123' });
    expect(wrongPass.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect(wrongPass.body.error).toEqual(wrongEmail.body.error);
    expect(wrongPass.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('Route cần token', () => {
  it('không có token -> 401', async () => {
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('token rác -> 401', async () => {
    const res = await request(app).get('/users/me').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('token hết hạn -> 401', async () => {
    const { user } = await registerUser();
    const expired = jwt.sign({ role: 'driver', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, {
      subject: String(user.id),
    });
    const res = await request(app).get('/users/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('token ký bằng secret khác -> 401', async () => {
    const forged = jwt.sign({ role: 'admin' }, 'secret-cua-ke-gian', { subject: '1' });
    const res = await request(app).get('/users').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('token alg=none -> 401', async () => {
    const none = jwt.sign({ role: 'admin' }, '', { subject: '1', algorithm: 'none' });
    const res = await request(app).get('/users').set('Authorization', `Bearer ${none}`);
    expect(res.status).toBe(401);
  });

  it('refresh token không dùng thay access token được', async () => {
    const { refreshToken } = await registerUser();
    const res = await request(app).get('/users/me').set('Authorization', `Bearer ${refreshToken}`);
    expect(res.status).toBe(401);
  });

  it('token hợp lệ -> 200', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app).get('/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 1, name: 'Tài xế A', email: 'a@example.com', role: 'driver', isActive: true });
  });
});

describe('POST /auth/refresh', () => {
  it('refresh token hợp lệ -> access token mới dùng được', async () => {
    const { refreshToken } = await registerUser();
    const res = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    const me = await request(app).get('/users/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
  });

  it('dùng access token để refresh -> 401', async () => {
    const { accessToken } = await registerUser();
    const res = await request(app).post('/auth/refresh').send({ refreshToken: accessToken });
    expect(res.status).toBe(401);
  });

  it('user đã bị xoá -> 401', async () => {
    const { refreshToken } = await registerUser();
    await resetDb();
    const res = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('Tài khoản bị khoá / đổi quyền có hiệu lực ngay', () => {
  it('đúng mật khẩu nhưng tài khoản khoá -> 403 ACCOUNT_DISABLED; sai mật khẩu vẫn 401 như thường', async () => {
    await createUser({ email: 'k@example.com', isActive: false });
    const right = await request(app).post('/auth/login').send({ email: 'k@example.com', password: 'matkhau123' });
    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('ACCOUNT_DISABLED');
    const wrong = await request(app).post('/auth/login').send({ email: 'k@example.com', password: 'saimatkhau' });
    expect(wrong.status).toBe(401);
  });

  it('access token đang còn hạn bị chặn ngay khi tài khoản bị khoá; refresh cũng bị chặn', async () => {
    const { user, accessToken, refreshToken } = await registerUser();
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);
    const me = await request(app).get('/users/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(401);
    const refreshed = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it('role lấy từ DB, không tin role trong token: admin bị hạ quyền -> 403 ngay', async () => {
    const admin = await createAdmin();
    await pool.query("UPDATE users SET role = 'driver' WHERE id = $1", [admin.user.id]);
    const res = await request(app).get('/users').set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(403);
  });
});
