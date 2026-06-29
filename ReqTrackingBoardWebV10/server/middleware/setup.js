import { isDbInstalled, isDbReady } from '../db.js';

export function requireDb(req, res, next) {
  if (!isDbInstalled()) {
    return res.status(503).json({ error: 'Database not configured', needsSetup: true });
  }
  if (!isDbReady()) {
    return res.status(503).json({
      error: 'Database connection failed',
      needsSetup: true,
      needsReconfigure: true,
    });
  }
  next();
}

export const BOOTSTRAP_ADMIN = { username: 'admin', password: 'admin' };

export function isBootstrapLogin(username, password) {
  if (username !== BOOTSTRAP_ADMIN.username || password !== BOOTSTRAP_ADMIN.password) {
    return false;
  }
  if (!isDbInstalled()) return true;
  if (!isDbReady()) return true;
  return false;
}
