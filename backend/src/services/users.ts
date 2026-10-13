import { query } from '../db';
import { Role } from './token';
import { AppError } from '../utils/http';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
}

// Object User chuẩn theo docs/contracts.md mục 3 — không bao giờ có passwordHash
export const toUser = (row: UserRow) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseName = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'name phải là chuỗi 1-100 ký tự');
  }
  return value.trim();
};

export const parseEmail = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_RE.test(value.trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email không hợp lệ');
  }
  return value.trim().toLowerCase();
};

export const parsePassword = (value: unknown): string => {
  // bcrypt chỉ dùng 72 byte đầu, quá dài thì phần sau bị bỏ qua âm thầm -> chặn luôn
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password phải dài 8-72 ký tự');
  }
  return value;
};

export const findUserById = async (id: number): Promise<UserRow | undefined> => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
};

export const findUserByEmail = async (email: string): Promise<UserRow | undefined> => {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0];
};

// 23505 = unique_violation của Postgres (trùng email)
export const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === '23505';

export const emailTakenError = () => new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email đã được sử dụng');
