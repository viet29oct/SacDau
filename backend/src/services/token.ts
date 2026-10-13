import jwt, { SignOptions } from 'jsonwebtoken';
import { AppError } from '../utils/http';

export type Role = 'driver' | 'owner' | 'admin';

export interface TokenPayload {
  sub: string;
  role: Role;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
};

// Access và refresh ký bằng 2 secret khác nhau -> không thể dùng refresh token thay access token và ngược lại
const accessSecret = () => requireEnv('JWT_SECRET');
const refreshSecret = () => requireEnv('JWT_REFRESH_SECRET');

const accessExpiresIn = () => (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as SignOptions['expiresIn'];
const refreshExpiresIn = () => (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'];

export const signAccessToken = (userId: number, role: Role) =>
  jwt.sign({ role }, accessSecret(), {
    subject: String(userId),
    expiresIn: accessExpiresIn(),
    algorithm: 'HS256',
  });

export const signRefreshToken = (userId: number, role: Role) =>
  jwt.sign({ role }, refreshSecret(), {
    subject: String(userId),
    expiresIn: refreshExpiresIn(),
    algorithm: 'HS256',
  });

const verify = (token: string, secret: string): TokenPayload => {
  try {
    // Chốt cứng thuật toán, chặn kiểu tấn công đổi "alg" trong header token
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) throw new Error('payload không hợp lệ');
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn');
  }
};

export const verifyAccessToken = (token: string) => verify(token, accessSecret());
export const verifyRefreshToken = (token: string) => verify(token, refreshSecret());
