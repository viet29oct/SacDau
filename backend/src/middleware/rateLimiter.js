const rateLimit = require('express-rate-limit');
const { fail } = require('../utils/http');

// Chống brute force /auth/login: tối đa 10 lần thử / 15 phút / IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    fail(res, 429, 'TOO_MANY_REQUESTS', 'Thử đăng nhập quá nhiều lần, vui lòng thử lại sau');
  },
});

// Chống tạo tài khoản rác hàng loạt (mỗi lần đăng ký tốn một lần bcrypt): mặc định 10 lần / giờ / IP.
// Đọc env mỗi request để test (đăng ký hàng chục tài xế từ cùng IP) nâng được giới hạn.
const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: () => Number(process.env.REGISTER_RATE_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    fail(res, 429, 'TOO_MANY_REQUESTS', 'Đăng ký quá nhiều tài khoản, vui lòng thử lại sau');
  },
});

// Check-in: ngoài khoá 10' sau 5 lần sai mã của từng booking (đếm trong DB), giới hạn thêm theo
// tài khoản để không dò mã hàng loạt trên nhiều booking. Đặt sau authMiddleware (cần req.user).
const checkinRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `user:${req.user?.id}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    fail(res, 429, 'TOO_MANY_REQUESTS', 'Thao tác check-in quá nhanh, vui lòng thử lại sau');
  },
});

module.exports = { loginRateLimiter, registerRateLimiter, checkinRateLimiter };
