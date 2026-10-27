const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const pool = require('../src/db');

const resetDb = () => pool.query('TRUNCATE users RESTART IDENTITY CASCADE');

const registerUser = async (overrides = {}) => {
  const res = await request(app)
    .post('/auth/register')
    .send({ name: 'Tài xế A', email: 'a@example.com', password: 'matkhau123', role: 'driver', ...overrides });
  return res.body.data;
};

// Admin không tự đăng ký được qua API -> chèn thẳng DB rồi login
const createAdmin = async () => {
  const hash = await bcrypt.hash('adminpass123', 4);
  await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin@example.com', $1, 'admin')",
    [hash],
  );
  const res = await request(app).post('/auth/login').send({ email: 'admin@example.com', password: 'adminpass123' });
  return res.body.data;
};

module.exports = { resetDb, registerUser, createAdmin };
