import { Router } from 'express';
import { SUPPORTED_DB_TYPES, DEFAULT_DB_TYPE, normalizeDbConfig, getDefaultDbConfig } from '../database/config.js';
import {
  isDbInstalled,
  isDbReady,
  getDbInfo,
  getDbConfigForAdmin,
  getConnectionError,
  testDatabaseConnection,
  setupDatabase,
  reconfigureDatabase,
  queryOne,
} from '../db.js';
import { authMiddleware, signToken } from '../middleware/auth.js';
import { mapUser } from '../utils/user.js';

const router = Router();

router.get('/status', (req, res) => {
  const info = getDbInfo();
  const defaults = getDefaultDbConfig();
  res.json({
    installed: isDbInstalled(),
    ready: isDbReady(),
    needsSetup: !isDbInstalled() || !isDbReady(),
    needsReconfigure: isDbInstalled() && !isDbReady(),
    connectionError: getConnectionError(),
    supportedTypes: SUPPORTED_DB_TYPES,
    defaultType: DEFAULT_DB_TYPE,
    defaults,
    current: info,
  });
});

router.get('/config', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.json(getDbConfigForAdmin());
});

router.post('/test', async (req, res) => {
  try {
    const config = normalizeDbConfig(req.body);
    const result = await testDatabaseConnection(config);
    res.json({
      success: true,
      message: 'Connection successful',
      databaseCreated: !!result.databaseCreated,
      databaseExisted: !!result.databaseExisted,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Connection failed' });
  }
});

router.post('/complete', authMiddleware, async (req, res) => {
  try {
    if (isDbInstalled() && isDbReady()) {
      return res.status(400).json({ error: 'Database is already configured' });
    }
    if (req.user.role !== 'admin' && !req.user.setup) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const config = normalizeDbConfig(req.body);
    const saved = await setupDatabase(config);
    const admin = await queryOne(
      'SELECT id, username, display_name, email, role, permission, theme FROM users WHERE username = ?',
      ['admin']
    );
    const token = signToken(admin);
    res.json({
      success: true,
      installed: true,
      type: saved.type,
      token,
      user: mapUser(admin),
      needsSetup: false,
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Setup failed' });
  }
});

router.put('/reconfigure', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !req.user.setup) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    if (!isDbReady() && !req.user.setup) {
      return res.status(503).json({ error: 'Use setup wizard when database is disconnected' });
    }
    const config = normalizeDbConfig(req.body);
    const saved = await reconfigureDatabase(config);
    res.json({
      success: true,
      type: saved.type,
      message: 'Database reconfigured successfully',
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Reconfigure failed' });
  }
});

export default router;
