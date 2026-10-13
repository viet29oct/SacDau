import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app';
import pool from '../src/db';

export const resetDb = () => pool.query('TRUNCATE users RESTART IDENTITY CASCADE');

export const registerUser = async (overrides: Record<string, unknown> = {}) => {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tài xế A', email: 'a@example.com', password: 'matkhau123', role: 'driver', ...overrides });
  return res.body.data as {
    user: { id: number; email: string; role: string };
    accessToken: string;
    refreshToken: string;
  };
};

// Admin không tự đăng ký được qua API -> chèn thẳng DB rồi login
export const createAdmin = async () => {
  const hash = await bcrypt.hash('adminpass123', 4);
  await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin@example.com', $1, 'admin')",
    [hash],
  );
  const res = await request(app).post('/auth/login').send({ email: 'admin@example.com', password: 'adminpass123' });
  return res.body.data as { user: { id: number }; accessToken: string };
};
