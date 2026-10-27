const { AppError } = require('../utils/http');

const parseBody = (schema, body) => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ';
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
};

// Dùng cho route không cần xen logic (RBAC/IDOR) giữa lúc nhận request và lúc validate body
const validateBody = (schema) => (req, _res, next) => {
  try {
    req.body = parseBody(schema, req.body);
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { parseBody, validateBody };
