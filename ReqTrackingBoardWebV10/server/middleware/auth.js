import jwt from 'jsonwebtoken';
import { isAdminRole } from '../utils/roles.js';

const JWT_SECRET = process.env.JWT_SECRET || 'req-tracking-secret-key-change-in-production';

export function signToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    permission: user.permission,
  };
  if (user.setup) payload.setup = true;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function adminMiddleware(req, res, next) {
  if (!isAdminRole(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function editMiddleware(req, res, next) {
  if (isAdminRole(req.user?.role) || req.user?.permission === 'edit') {
    return next();
  }
  return res.status(403).json({ error: 'Edit permission required' });
}
