import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import pool from '../src/db';
import { registerUser, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => pool.end());

describe('POST /auth/register', () => {
  it('tạo user, trả token, không lộ password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Tài xế A', email: 'A@Example.com ', password: 'matkhau123', role: 'driver' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toEqual({ id: 1, name: 'Tài xế A', email: 'a@example.com', role: 'driver' });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = 1');
    expect(rows[0].password_hash).not.toBe('matkhau123');
  });

  it('không cho tự đăng ký role admin', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Hacker', email: 'h@example.com', password: 'matkhau123', role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('trùng email -> 409 EMAIL_ALREADY_EXISTS', async () => {
    await registerUser();
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'B', email: 'a@example.com', password: 'matkhau123', role: 'owner' });
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
    const expired = jwt.sign({ role: 'driver', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET!, {
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
    expect(res.body.data).toEqual({ id: 1, name: 'Tài xế A', email: 'a@example.com', role: 'driver' });
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
