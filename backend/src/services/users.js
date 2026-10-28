const { query } = require('../db');
const { AppError } = require('../utils/http');

// Object User chuẩn theo docs/contracts.md mục 3 — không bao giờ có passwordHash
const toUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseName = (value) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'name phải là chuỗi 1-100 ký tự');
  }
  return value.trim();
};

const parseEmail = (value) => {
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_RE.test(value.trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email không hợp lệ');
  }
  return value.trim().toLowerCase();
};

const parsePassword = (value) => {
  // bcrypt chỉ dùng 72 byte đầu, quá dài thì phần sau bị bỏ qua âm thầm -> chặn luôn
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password phải dài 8-72 ký tự');
  }
  return value;
};

const findUserById = async (id) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
};

const findUserByEmail = async (email) => {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
};

// 23505 = unique_violation của Postgres (trùng email)
const isUniqueViolation = (err) => err?.code === '23505';

const emailTakenError = () => new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email đã được sử dụng');

module.exports = {
  toUser,
  parseName,
  parseEmail,
  parsePassword,
  findUserById,
  findUserByEmail,
  isUniqueViolation,
  emailTakenError,
};
