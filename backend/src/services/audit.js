const { query } = require('../db');
const { logger } = require('../logger');

// Ghi log đăng nhập + thao tác nhạy cảm (đổi thông tin tài khoản...) vào bảng audit_logs,
// đồng thời in ra console qua pino để xem nhanh lúc vận hành.
const logAudit = async (userId, action, detail) => {
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

module.exports = { logAudit };
