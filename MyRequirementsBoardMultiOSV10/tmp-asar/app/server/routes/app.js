import { Router } from 'express';
import { getAppInfo } from '../lib/appMeta.js';

const router = Router();

router.get('/info', (_req, res) => {
  res.json(getAppInfo());
});

export default router;
