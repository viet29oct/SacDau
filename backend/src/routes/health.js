const { Router } = require('express');
const pool = require('../db');
const { logger } = require('../logger');

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { status: 'ok', db: 'connected' }, error: null });
  } catch (err) {
    // Lỗi gốc của Postgres (host, tên DB, user) chỉ ghi log, không trả ra ngoài
    logger.error({ err }, 'health: không kết nối được DB');
    res.status(500).json({
      success: false,
      data: null,
      error: { code: 'DB_UNAVAILABLE', message: 'Không kết nối được cơ sở dữ liệu' },
    });
  }
});

module.exports = router;
