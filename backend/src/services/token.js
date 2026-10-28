const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/http');

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
};

// Access và refresh ký bằng 2 secret khác nhau -> không thể dùng refresh token thay access token và ngược lại
const accessSecret = () => requireEnv('JWT_SECRET');
const refreshSecret = () => requireEnv('JWT_REFRESH_SECRET');

const accessExpiresIn = () => process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
const refreshExpiresIn = () => process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

const signAccessToken = (userId, role) =>
  jwt.sign({ role }, accessSecret(), {
    subject: String(userId),
    expiresIn: accessExpiresIn(),
    algorithm: 'HS256',
  });

const signRefreshToken = (userId, role) =>
  jwt.sign({ role }, refreshSecret(), {
    subject: String(userId),
    expiresIn: refreshExpiresIn(),
    algorithm: 'HS256',
  });

const verify = (token, secret) => {
  try {
    // Chốt cứng thuật toán, chặn kiểu tấn công đổi "alg" trong header token
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) throw new Error('payload không hợp lệ');
    return { sub: payload.sub, role: payload.role };
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn');
  }
};

const verifyAccessToken = (token) => verify(token, accessSecret());
const verifyRefreshToken = (token) => verify(token, refreshSecret());

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
