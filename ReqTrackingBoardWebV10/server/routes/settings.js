import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { execute, queryOne, now } from '../db.js';
import { authMiddleware, signToken } from '../middleware/auth.js';
import { VALID_THEMES } from '../utils/themes.js';
import { mapUser, validateEmail, normalizeEmail } from '../utils/user.js';
import {
  userHasDefaultCredentials,
  markDefaultCredentialsDisabled,
  validateNewCredentials,
} from '../utils/credentials.js';
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

router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, username, display_name, email, role, permission, theme FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ theme: user.theme || 'default', user: mapUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/password-verification/status', authMiddleware, (req, res) => {
  res.json(getVerificationStatus(req.user.id));
});

router.post('/password-verification/send', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, email } = req.body;
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const targetEmail = normalizeEmail(email || user.email);
    const emailErr = validateEmail(targetEmail);
    if (emailErr) return res.status(400).json({ error: emailErr });

    if (!canSendVerificationCode(user.id)) {
      return res.status(429).json({
        error: 'Please wait before requesting another code',
        cooldownSeconds: getResendCooldownSeconds(user.id),
      });
    }

    const code = createVerificationCode(user.id, targetEmail);
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

router.post('/password-verification/verify', authMiddleware, async (req, res) => {
  try {
    const { code, email } = req.body;
    if (!code || !email) {
      return res.status(400).json({ error: 'Verification code and email are required' });
    }

    const result = verifyCode(req.user.id, code, email);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    res.json(getVerificationStatus(req.user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/theme', authMiddleware, async (req, res) => {
  try {
    const { theme } = req.body;
    if (!theme || !VALID_THEMES.includes(theme)) {
      return res.status(400).json({ error: `Invalid theme. Valid: ${VALID_THEMES.join(', ')}` });
    }
    await execute('UPDATE users SET theme = ? WHERE id = ?', [theme, req.user.id]);
    res.json({ theme });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/account', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, username, newPassword, displayName, email } = req.body;
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const nextUsername = username?.trim() || user.username;
    const nextDisplayName = displayName?.trim() || user.display_name;
    const nextEmail = email !== undefined ? normalizeEmail(email) : (user.email || '');
    const passwordChanging = !!newPassword;
    const usernameChanging = nextUsername !== user.username;
    const emailChanging = nextEmail !== normalizeEmail(user.email || '');

    if (!nextUsername) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const emailErr = validateEmail(nextEmail);
    if (emailErr) return res.status(400).json({ error: emailErr });

    if (usernameChanging) {
      const dup = await queryOne('SELECT id FROM users WHERE username = ? AND id != ?', [nextUsername, user.id]);
      if (dup) return res.status(409).json({ error: 'Username already exists' });
    }

    if (passwordChanging) {
      if (!consumePasswordChangeVerification(user.id, nextEmail)) {
        return res.status(403).json({
          error: 'Email verification required before password change',
          needsEmailVerification: true,
        });
      }
      const err = validateNewCredentials(nextUsername, newPassword);
      if (err) return res.status(400).json({ error: err });
    } else if (usernameChanging && nextUsername === 'admin' && userHasDefaultCredentials(user)) {
      return res.status(400).json({ error: validateNewCredentials('admin', 'admin') });
    }

    if (emailChanging) {
      clearVerification(user.id);
    }

    const hadDefaultCredentials = userHasDefaultCredentials(user);
    const updates = ['display_name = ?', 'email = ?', 'username = ?', 'updated_at = ?'];
    const params = [nextDisplayName, nextEmail, nextUsername, now()];

    if (passwordChanging) {
      updates.splice(3, 0, 'password = ?');
      params.splice(3, 0, bcrypt.hashSync(newPassword, 10));
    }

    params.push(user.id);
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    if (hadDefaultCredentials && (usernameChanging || passwordChanging)) {
      markDefaultCredentialsDisabled();
    }

    const updated = await queryOne(
      'SELECT id, username, display_name, email, role, permission, theme FROM users WHERE id = ?',
      [user.id]
    );
    const mapped = mapUser(updated);
    const token = signToken(updated);

    let passwordNotificationSent = false;
    if (passwordChanging) {
      const result = await notifyPasswordChangedAndWait(updated, {
        changedBy: 'self',
        email: nextEmail,
        ip: clientIp(req),
      });
      passwordNotificationSent = !!result?.sent;
    }

    res.json({
      success: true,
      token,
      user: mapped,
      passwordChanged: passwordChanging,
      passwordNotificationSent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
