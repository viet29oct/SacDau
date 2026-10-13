import { Router } from 'express';
import { query } from '../db';
import { assertOwnerOrAdmin, authMiddleware, rbacMiddleware } from '../middleware/auth';
import {
  emailTakenError,
  findUserById,
  isUniqueViolation,
  parseEmail,
  parseName,
  toUser,
} from '../services/users';
import { AppError, asyncHandler, ok } from '../utils/http';

const router = Router();

router.get(
  '/users/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await findUserById(req.user!.id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');
    ok(res, toUser(user));
  }),
);

router.get(
  '/users',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (_req, res) => {
    const { rows } = await query('SELECT * FROM users ORDER BY id');
    ok(res, rows.map(toUser));
  }),
);

router.patch(
  '/users/:id',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id không hợp lệ');
    }
    // Check quyền trước khi tra DB -> user thường không dò được id nào tồn tại
    assertOwnerOrAdmin(req.user!, id);

    // Chỉ nhận name/email; các field khác (role, passwordHash...) bị bỏ qua -> chống mass assignment
    const body = req.body ?? {};
    const name = body.name !== undefined ? parseName(body.name) : undefined;
    const email = body.email !== undefined ? parseEmail(body.email) : undefined;
    if (name === undefined && email === undefined) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cần ít nhất name hoặc email');
    }

    try {
      const { rows } = await query(
        `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email)
         WHERE id = $3 RETURNING *`,
        [name ?? null, email ?? null, id],
      );
      if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');
      ok(res, toUser(rows[0]));
    } catch (err) {
      if (isUniqueViolation(err)) throw emailTakenError();
      throw err;
    }
  }),
);

export default router;
