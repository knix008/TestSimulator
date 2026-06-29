import { Router } from 'express';
import { queryOne } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/version', authMiddleware, async (req, res) => {
  try {
    const [reqRow, tcRow, userRow, histRow] = await Promise.all([
      queryOne('SELECT COUNT(*) as c, MAX(updated_at) as ts FROM requirements'),
      queryOne('SELECT COUNT(*) as c, MAX(updated_at) as ts FROM test_cases'),
      queryOne('SELECT COUNT(*) as c, MAX(updated_at) as ts FROM users'),
      queryOne('SELECT COUNT(*) as c, MAX(changed_at) as ts FROM requirement_history'),
    ]);

    const version = [
      reqRow?.c ?? 0,
      tcRow?.c ?? 0,
      userRow?.c ?? 0,
      histRow?.c ?? 0,
      reqRow?.ts ?? '',
      tcRow?.ts ?? '',
      userRow?.ts ?? '',
      histRow?.ts ?? '',
    ].join('|');

    res.json({ version });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
