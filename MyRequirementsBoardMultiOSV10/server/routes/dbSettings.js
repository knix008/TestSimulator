import { Router } from 'express';
import { describeDbError } from '../lib/dbErrorMessage.js';
import { requireRole } from '../auth/middleware.js';
import {
  connectExternalDatabase,
  disconnectExternalDatabase,
  getDbSettingsStatus,
  initExternalSchema,
} from '../db/index.js';
import { defaultPortFor } from '../db/constants.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getDbSettingsStatus());
});

router.post('/connect', async (req, res) => {
  const status = getDbSettingsStatus();
  if (status.mode === 'external' && status.connected) {
    if (!req.session?.user || req.session.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'DB 재접속은 관리자만 할 수 있습니다.' });
    }
  }

  try {
    const result = await connectExternalDatabase(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: `DB 접속에 실패했습니다: ${describeDbError(err)}` });
  }
});

router.post('/disconnect', requireRole('ADMIN'), async (_req, res) => {
  try {
    const result = await disconnectExternalDatabase();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: describeDbError(err) });
  }
});

router.post('/init', requireRole('ADMIN'), async (_req, res) => {
  try {
    const result = await initExternalSchema();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: describeDbError(err) });
  }
});

router.get('/defaults', (_req, res) => {
  res.json({
    provider: 'mariadb',
    server: 'localhost',
    port: defaultPortFor('mariadb'),
    database: '',
    username: '',
  });
});

export default router;
