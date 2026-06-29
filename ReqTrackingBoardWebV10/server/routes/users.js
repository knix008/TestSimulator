import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne, insert, execute, now } from '../db.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { validateNewCredentials } from '../utils/credentials.js';
import { validateEmail, normalizeEmail } from '../utils/user.js';
import { notifyPasswordChangedAndWait } from '../utils/passwordNotify.js';
import { sendPasswordChangeVerificationCode } from '../utils/mail.js';
import {
  canSendVerificationCode,
  createVerificationCode,
  verifyCode,
  consumePasswordChangeVerification,
  getVerificationStatus,
  getResendCooldownSeconds,
  clearVerification,
} from '../utils/passwordChangeVerification.js';

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
}

const router = Router();
router.use(authMiddleware, adminMiddleware);

function mapUserRow(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email || '',
    role: u.role,
    permission: u.permission,
    isActive: !!u.is_active,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

router.get('/', async (req, res) => {
  try {
    const users = await query(`
      SELECT id, username, display_name, email, role, permission, is_active, created_at, updated_at
      FROM users ORDER BY id
    `);
    res.json(users.map(mapUserRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/password-verification/status', async (req, res) => {
  try {
    const user = await queryOne('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(getVerificationStatus(parseInt(req.params.id, 10)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/password-verification/send', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const targetEmail = normalizeEmail(req.body.email || user.email);
    const emailErr = validateEmail(targetEmail);
    if (emailErr) return res.status(400).json({ error: emailErr });

    if (!canSendVerificationCode(userId)) {
      return res.status(429).json({
        error: 'Please wait before requesting another code',
        cooldownSeconds: getResendCooldownSeconds(userId),
      });
    }

    const code = createVerificationCode(userId, targetEmail);
    await sendPasswordChangeVerificationCode({
      to: targetEmail,
      username: user.username,
      displayName: user.display_name,
      code,
    });

    res.json({ success: true, email: targetEmail, cooldownSeconds: 60 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/password-verification/verify', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = await queryOne('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { code, email } = req.body;
    if (!code || !email) {
      return res.status(400).json({ error: 'Verification code and email are required' });
    }

    const result = verifyCode(userId, code, email);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    res.json(getVerificationStatus(userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { username, password, displayName, email, role = 'user', permission = 'view' } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Username, password, and display name required' });
    }
    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
    const normalizedEmail = normalizeEmail(email);

    const existing = await queryOne('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const credErr = validateNewCredentials(username, password);
    if (credErr) return res.status(400).json({ error: credErr });

    const hash = bcrypt.hashSync(password, 10);
    const id = await insert(
      'INSERT INTO users (username, password, display_name, email, role, permission) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hash, displayName, normalizedEmail, role, permission]
    );

    res.status(201).json({ id, username, displayName, email: normalizedEmail, role, permission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const { displayName, email, role, permission, isActive, password } = req.body;
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const params = [];
    if (displayName !== undefined) { updates.push('display_name = ?'); params.push(displayName); }
    if (email !== undefined) {
      const emailErr = validateEmail(email);
      if (emailErr) return res.status(400).json({ error: emailErr });
      updates.push('email = ?');
      params.push(normalizeEmail(email));
    }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (permission !== undefined) { updates.push('permission = ?'); params.push(permission); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    const passwordChanging = !!password;
    const notifyEmail = email !== undefined ? normalizeEmail(email) : (user.email || '');

    if (passwordChanging) {
      if (!consumePasswordChangeVerification(userId, notifyEmail)) {
        return res.status(403).json({
          error: 'Email verification required before password change',
          needsEmailVerification: true,
        });
      }
      const credErr = validateNewCredentials(user.username, password);
      if (credErr) return res.status(400).json({ error: credErr });
      updates.push('password = ?');
      params.push(bcrypt.hashSync(password, 10));
    }

    if (email !== undefined && normalizeEmail(email) !== normalizeEmail(user.email || '')) {
      clearVerification(userId);
    }

    updates.push('updated_at = ?');
    params.push(now());
    params.push(id);

    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    let passwordNotificationSent = false;
    if (passwordChanging) {
      const result = await notifyPasswordChangedAndWait(
        { ...user, display_name: displayName ?? user.display_name, email: notifyEmail },
        {
          changedBy: 'admin',
          actorUsername: req.user.username,
          email: notifyEmail,
          ip: clientIp(req),
        }
      );
      passwordNotificationSent = !!result?.sent;
    }

    res.json({ success: true, passwordChanged: passwordChanging, passwordNotificationSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.username === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin account' });
    }
    clearVerification(parseInt(id, 10));
    await execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
