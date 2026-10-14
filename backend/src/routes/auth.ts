import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../services/token';
import { emailTakenError, findUserByEmail, findUserById, isUniqueViolation, toUser, UserRow } from '../services/users';
import { logAudit } from '../services/audit';
import { AppError, asyncHandler, ok } from '../utils/http';
import { loginRateLimiter } from '../middleware/rateLimiter';
import { loginSchema, refreshSchema, registerSchema } from '../validation/schemas';
import { validateBody } from '../validation/validate';

const router = Router();

const BCRYPT_ROUNDS = 10;
// Hash giả để khi email không tồn tại vẫn tốn thời gian bcrypt.compare như bình thường,
// tránh dò email qua thời gian phản hồi
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

const issueTokens = (user: UserRow) => ({
  user: toUser(user),
  accessToken: signAccessToken(user.id, user.role),
  refreshToken: signRefreshToken(user.id, user.role),
});

router.post(
  '/auth/register',
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      const { rows } = await query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, email, passwordHash, role],
      );
      await logAudit(rows[0].id, 'auth.register', { email, role });
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
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Tài khoản không còn tồn tại');
    ok(res, { accessToken: signAccessToken(user.id, user.role) });
  }),
);

export default router;
