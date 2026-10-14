import rateLimit from 'express-rate-limit';
import { fail } from '../utils/http';

// Chống brute force /auth/login: tối đa 10 lần thử / 15 phút / IP
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    fail(res, 429, 'TOO_MANY_REQUESTS', 'Thử đăng nhập quá nhiều lần, vui lòng thử lại sau');
  },
});
