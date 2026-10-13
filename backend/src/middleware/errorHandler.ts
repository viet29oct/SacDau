import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, fail } from '../utils/http';

export const notFoundHandler: RequestHandler = (_req, res) => {
  fail(res, 404, 'NOT_FOUND', 'Không tìm thấy endpoint');
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    fail(res, err.status, err.code, err.message);
    return;
  }
  // Body JSON sai cú pháp (express.json() ném lỗi này)
  if (err?.type === 'entity.parse.failed') {
    fail(res, 400, 'VALIDATION_ERROR', 'Body không phải JSON hợp lệ');
    return;
  }
  console.error(err);
  // Không trả err.message ra ngoài để tránh lộ chi tiết nội bộ (câu SQL, stack...)
  fail(res, 500, 'INTERNAL_ERROR', 'Lỗi máy chủ');
};
