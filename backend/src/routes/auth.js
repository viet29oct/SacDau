const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../services/token');
const { emailTakenError, findUserByEmail, findUserById, isUniqueViolation, toUser } = require('../services/users');
const { logAudit } = require('../services/audit');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { loginRateLimiter, registerRateLimiter } = require('../middleware/rateLimiter');
const { loginSchema, refreshSchema, registerSchema } = require('../validation/schemas');
const { validateBody } = require('../validation/validate');

const router = Router();

const BCRYPT_ROUNDS = 10;
// Hash giả để khi email không tồn tại vẫn tốn thời gian bcrypt.compare như bình thường,
// tránh dò email qua thời gian phản hồi
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

const issueTokens = (user) => ({
  user: toUser(user),
  accessToken: signAccessToken(user.id, user.role),
  refreshToken: signRefreshToken(user.id, user.role),
});

router.post(
  '/auth/register',
  registerRateLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      // Tự đăng ký luôn là tài xế — owner do admin tạo (POST /users), admin tạo bằng script
      const { rows } = await query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'driver') RETURNING *`,
        [name, email, passwordHash],
      );
      await logAudit(rows[0].id, 'auth.register', { email, role: 'driver' });
      ok(res, issueTokens(rows[0]), 201);
    } catch (err) {
      if (isUniqueViolation(err)) throw emailTakenError();
      throw err;
    }
  }),
);

router.post(
  '/auth/login',
  loginRateLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await findUserByEmail(normalizedEmail);
    const match = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    // Cùng 1 thông báo cho sai email và sai mật khẩu -> không lộ email nào đã đăng ký
    if (!user || !match) {
      await logAudit(user?.id ?? null, 'auth.login', { email: normalizedEmail, success: false });
      throw new AppError(401, 'UNAUTHORIZED', 'Email hoặc mật khẩu không đúng');
    }
    // Chỉ báo "đã khoá" sau khi đúng mật khẩu -> không lộ trạng thái tài khoản cho người đoán mò
    if (!user.is_active) {
      await logAudit(user.id, 'auth.login', { email: normalizedEmail, success: false, reason: 'disabled' });
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khoá, liên hệ quản trị viên');
    }
    await logAudit(user.id, 'auth.login', { email: normalizedEmail, success: true });
    ok(res, issueTokens(user));
  }),
);

router.post(
  '/auth/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const payload = verifyRefreshToken(refreshToken);
    // Lấy role mới nhất từ DB (role có thể đã đổi, user có thể đã bị xoá)
    const user = await findUserById(Number(payload.sub));
    if (!user || !user.is_active) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tài khoản không còn tồn tại hoặc đã bị khoá');
    }
    ok(res, { accessToken: signAccessToken(user.id, user.role) });
  }),
);

module.exports = router;
