import { NextFunction, Request, RequestHandler, Response } from 'express';

// Lỗi nghiệp vụ có code nằm trong danh sách error.code của docs/contracts.md mục 2
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const ok = (res: Response, data: unknown, status = 200) => {
  res.status(status).json({ success: true, data, error: null });
};

export const fail = (res: Response, status: number, code: string, message: string) => {
  res.status(status).json({ success: false, data: null, error: { code, message } });
};

// Express 4 không tự bắt lỗi của handler async -> chuyển sang errorHandler
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
