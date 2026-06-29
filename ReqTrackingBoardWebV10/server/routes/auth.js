import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { queryOne } from '../db.js';
import { signToken, authMiddleware } from '../middleware/auth.js';
import { isBootstrapLogin } from '../middleware/setup.js';
import { isDbInstalled, isDbReady } from '../db.js';
import {
  isDefaultCredentialPair,
  isDefaultCredentialsDisabled,
} from '../utils/credentials.js';
import { mapUser } from '../utils/user.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (isBootstrapLogin(username, password)) {
      const token = signToken({ id: 0, username: 'admin', role: 'admin', permission: 'edit', setup: true });
      return res.json({
        token,
        needsSetup: true,
        user: {
          id: 0,
          username: 'admin',
          displayName: 'Administrator',
          email: 'admin@localhost',
          role: 'admin',
          permission: 'edit',
          theme: 'default',
        },
      });
    }

    if (!isDbInstalled() || !isDbReady()) {
      return res.status(503).json({ error: 'Database not configured or connection failed. Use admin/admin for setup.' });
    }

    if (isDefaultCredentialPair(username, password) && isDefaultCredentialsDisabled()) {
      return res.status(401).json({ error: 'Default credentials are no longer valid. Use your updated account.' });
    }

    const user = await queryOne('SELECT * FROM users WHERE username = ? AND is_active', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      if (isDefaultCredentialPair(username, password)) {
        return res.status(401).json({ error: 'Default credentials are no longer valid. Use your updated account.' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken(user);
    res.json({ token, needsSetup: false, user: mapUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (!isDbInstalled() || !isDbReady()) {
      if (req.user.setup && req.user.username === 'admin') {
        return res.json({
          id: 0,
          username: 'admin',
          displayName: 'Administrator',
          email: 'admin@localhost',
          role: 'admin',
          permission: 'edit',
          theme: 'default',
          needsSetup: true,
        });
      }
      return res.status(503).json({
        error: 'Database not configured or connection failed',
        needsSetup: true,
        needsReconfigure: isDbInstalled() && !isDbReady(),
      });
    }

    const user = await queryOne(
      'SELECT id, username, display_name, email, role, permission, theme FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ ...mapUser(user), needsSetup: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
