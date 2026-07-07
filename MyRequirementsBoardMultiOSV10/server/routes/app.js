import { Router } from 'express';
import { getAppInfo } from '../lib/appMeta.js';
import { requireAuth } from '../auth/middleware.js';

const router = Router();

router.get('/info', requireAuth, (_req, res) => {
  res.json(getAppInfo());
});

export default router;
