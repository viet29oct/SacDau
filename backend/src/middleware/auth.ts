import { RequestHandler } from 'express';
import { Role, verifyAccessToken } from '../services/token';
import { AppError } from '../utils/http';

export interface AuthUser {
  id: number;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Thiếu access token'));
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
};

// Dùng sau authMiddleware: rbacMiddleware('admin'), rbacMiddleware('owner', 'admin')...
export const rbacMiddleware =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Chưa đăng nhập'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'Không đủ quyền'));
      return;
    }
    next();
  };

// Chống IDOR: chỉ chủ sở hữu tài nguyên hoặc admin được thao tác
export const assertOwnerOrAdmin = (user: AuthUser, ownerId: number) => {
  if (user.role !== 'admin' && user.id !== ownerId) {
    throw new AppError(403, 'FORBIDDEN', 'Không có quyền trên tài nguyên này');
  }
};
