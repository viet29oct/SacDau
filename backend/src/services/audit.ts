import { query } from '../db';
import { logger } from '../logger';

// Ghi log đăng nhập + thao tác nhạy cảm (đổi thông tin tài khoản...) vào bảng audit_logs,
// đồng thời in ra console qua pino để xem nhanh lúc vận hành.
export const logAudit = async (
  userId: number | null,
  action: string,
  detail?: Record<string, unknown>,
): Promise<void> => {
  logger.info({ userId, action, detail }, 'audit');
  try {
    await query('INSERT INTO audit_logs (user_id, action, detail) VALUES ($1, $2, $3)', [
      userId,
      action,
      detail ? JSON.stringify(detail) : null,
    ]);
  } catch (err) {
    // Ghi log không được làm fail request chính (vd. login vẫn phải thành công dù audit lỗi)
    logger.error({ err }, 'ghi audit_logs thất bại');
  }
};
