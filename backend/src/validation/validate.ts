import { RequestHandler } from 'express';
import { ZodType } from 'zod';
import { AppError } from '../utils/http';

export const parseBody = <T>(schema: ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ';
    throw new AppError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
};

// Dùng cho route không cần xen logic (RBAC/IDOR) giữa lúc nhận request và lúc validate body
export const validateBody =
  <T>(schema: ZodType<T>): RequestHandler =>
  (req, _res, next) => {
    try {
      req.body = parseBody(schema, req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
