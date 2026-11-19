const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { assertOwnerOrAdmin, authMiddleware, rbacMiddleware } = require('../middleware/auth');
const { emailTakenError, findUserById, isUniqueViolation, toUser } = require('../services/users');
const { logAudit } = require('../services/audit');
const { AppError, asyncHandler, ok } = require('../utils/http');
const { createUserSchema, updateUserSchema, userStatusSchema } = require('../validation/schemas');
const { parseBody, validateBody } = require('../validation/validate');

const router = Router();

const parseUserId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'id không hợp lệ');
  }
  return id;
};

// POST /users (admin) — tạo tài khoản quản lý trạm (owner) hoặc tài xế. Quản lý trạm là nhân viên
// công ty nên không tự đăng ký được qua /auth/register (docs/LUONG_NGHIEP_VU.md mục 2).
router.post(
  '/users',
  authMiddleware,
  rbacMiddleware('admin'),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, email, passwordHash, role],
      );
      await logAudit(req.user.id, 'user.create', { targetId: rows[0].id, email, role });
      ok(res, toUser(rows[0]), 201);
    } catch (err) {
      if (isUniqueViolation(err)) throw emailTakenError();
      throw err;
    }
  }),
);

// PATCH /users/:id/status (admin) — khoá/mở tài khoản. Không khoá chính mình (tránh tự khoá admin
// cuối cùng), không khoá quản lý đang phụ trách trạm (trạm sẽ không còn ai check-in).
router.patch(
  '/users/:id/status',
  authMiddleware,
  rbacMiddleware('admin'),
  asyncHandler(async (req, res) => {
    const id = parseUserId(req.params.id);
    const { isActive } = parseBody(userStatusSchema, req.body);

    const target = await findUserById(id);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy người dùng');
    if (!isActive && id === req.user.id) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Không thể tự khoá tài khoản của chính mình');
    }
    if (!isActive && target.role === 'owner') {
      const { rows: stationRows } = await query(
        'SELECT 1 FROM stations WHERE owner_id = $1 AND is_active LIMIT 1',
        [id],
      );
      if (stationRows[0]) {
        throw new AppError(409, 'OWNER_HAS_STATIONS', 'Quản lý đang phụ trách trạm, hãy phân công trạm cho người khác trước');
      }
    }

    const { rows } = await query('UPDATE users SET is_active = $1 WHERE id = $2 RETURNING *', [isActive, id]);
    await logAudit(req.user.id, 'user.status', { targetId: id, isActive });
    ok(res, toUser(rows[0]));
  }),
);

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
    const id = parseUserId(req.params.id);
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
