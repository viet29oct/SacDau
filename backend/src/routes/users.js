const { Router } = require('express');
const { query } = require('../db');
const { assertOwnerOrAdmin, authMiddleware, rbacMiddleware } = require('../middleware/auth');
const { emailTakenError, findUserById, isUniqueViolation, toUser } = require('../services/users');
const { logAudit } = require('../services/audit');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { updateUserSchema } = require('../validation/schemas');
const { parseBody } = require('../validation/validate');

const router = Router();

router.get(
  '/users/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await findUserById(req.user.id);
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
    // Check quyền trước khi tra DB/validate body -> user thường không dò được id nào tồn tại
    assertOwnerOrAdmin(req.user, id);

    // zod strip field lạ (vd. role) khỏi req.body -> chống mass assignment
    const { name, email } = parseBody(updateUserSchema, req.body);

    try {
      const { rows } = await query(
        `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email)
         WHERE id = $3 RETURNING *`,
        [name ?? null, email ?? null, id],
      );
      if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');
      await logAudit(req.user.id, 'user.update', { targetId: id, name, email });
      ok(res, toUser(rows[0]));
    } catch (err) {
      if (isUniqueViolation(err)) throw emailTakenError();
      throw err;
    }
  }),
);

module.exports = router;
