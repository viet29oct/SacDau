import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../services/token';
import {
  emailTakenError,
  findUserByEmail,
  findUserById,
  isUniqueViolation,
  parseEmail,
  parseName,
  parsePassword,
  toUser,
  UserRow,
} from '../services/users';
import { AppError, asyncHandler, ok } from '../utils/http';

const router = Router();

const BCRYPT_ROUNDS = 10;
// Hash giả để khi email không tồn tại vẫn tốn thời gian bcrypt.compare như bình thường,
// tránh dò email qua thời gian phản hồi
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

// Tự đăng ký chỉ được làm driver/owner. Tài khoản admin tạo bằng `npm run create-admin`
const SELF_REGISTER_ROLES = ['driver', 'owner'];

const issueTokens = (user: UserRow) => ({
  user: toUser(user),
  accessToken: signAccessToken(user.id, user.role),
  refreshToken: signRefreshToken(user.id, user.role),
});

router.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const name = parseName(body.name);
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);
    if (!SELF_REGISTER_ROLES.includes(body.role)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'role phải là driver hoặc owner');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      const { rows } = await query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, email, passwordHash, body.role],
      );
      ok(res, issueTokens(rows[0]), 201);
    } catch (err) {
      if (isUniqueViolation(err)) throw emailTakenError();
      throw err;
    }
  }),
);

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cần email và password');
    }

    const user = await findUserByEmail(email.trim().toLowerCase());
    const match = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    // Cùng 1 thông báo cho sai email và sai mật khẩu -> không lộ email nào đã đăng ký
    if (!user || !match) {
      throw new AppError(401, 'UNAUTHORIZED', 'Email hoặc mật khẩu không đúng');
    }
    ok(res, issueTokens(user));
  }),
);

router.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cần refreshToken');
    }
    const payload = verifyRefreshToken(refreshToken);
    // Lấy role mới nhất từ DB (role có thể đã đổi, user có thể đã bị xoá)
    const user = await findUserById(Number(payload.sub));
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Tài khoản không còn tồn tại');
    ok(res, { accessToken: signAccessToken(user.id, user.role) });
  }),
);

export default router;
