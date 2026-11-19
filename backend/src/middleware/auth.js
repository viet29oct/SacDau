const { query } = require('../db');
const { verifyAccessToken } = require('../services/token');
const { AppError } = require('../utils/http');

// Xác thực token rồi đọc lại is_active + role từ DB mỗi request: admin khoá tài khoản hoặc đổi
// quyền thì có hiệu lực ngay, không phải chờ access token (15 phút) hết hạn.
const authMiddleware = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Thiếu access token'));
    return;
  }
  let payload;
  try {
    payload = verifyAccessToken(header.slice('Bearer '.length).trim());
  } catch (err) {
    next(err);
    return;
  }
  query('SELECT id, role, is_active FROM users WHERE id = $1', [Number(payload.sub)])
    .then(({ rows }) => {
      const user = rows[0];
      if (!user || !user.is_active) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tài khoản không còn tồn tại hoặc đã bị khoá');
      }
      req.user = { id: user.id, role: user.role };
      next();
    })
    .catch(next);
};

// Dùng sau authMiddleware: rbacMiddleware('admin'), rbacMiddleware('owner', 'admin')...
const rbacMiddleware =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Chưa đăng nhập'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'Không đủ quyền'));
      return;
    }
    next();
  };

// Chống IDOR: chỉ chủ sở hữu tài nguyên hoặc admin được thao tác
const assertOwnerOrAdmin = (user, ownerId) => {
  if (user.role !== 'admin' && user.id !== ownerId) {
    throw new AppError(403, 'FORBIDDEN', 'Không có quyền trên tài nguyên này');
  }
};

module.exports = { authMiddleware, rbacMiddleware, assertOwnerOrAdmin };
