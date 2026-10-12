import { Router } from 'express';
import pool from '../db';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { status: 'ok', db: 'connected' }, error: null });
  } catch (err) {
    res.status(500).json({
      success: false,
      data: null,
      error: { code: 'DB_UNAVAILABLE', message: (err as Error).message },
    });
  }
});

export default router;
