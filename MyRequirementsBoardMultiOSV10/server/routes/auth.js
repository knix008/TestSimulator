import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { sanitizeUser } from '../auth/auth.js';
import { requireAuth } from '../auth/middleware.js';
import {
  mergeUserPreferences,
  parseUserPreferences,
  serializeUserPreferences,
} from '../lib/userPreferences.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'ID와 비밀번호를 입력하세요.' });
  }

  const db = getDatabase();
  const user = await db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);

  if (!user || user.is_active === 0 || user.is_active === false) {
    return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' });
  }

  if (!verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' });
  }

  const sessionUser = sanitizeUser(user);
  req.session.user = sessionUser;
  res.json({ user: sessionUser });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/session', async (req, res) => {
  if (!req.session?.user) {
    return res.json({ authenticated: false });
  }

  const db = getDatabase();
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!row || row.is_active === 0 || row.is_active === false) {
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }

  const sessionUser = sanitizeUser(row);
  req.session.user = sessionUser;
  res.json({ authenticated: true, user: sessionUser });
});

router.get('/profile', requireAuth, async (req, res) => {
  const db = getDatabase();
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  res.json(sanitizeUser(user));
});

router.put('/profile', requireAuth, async (req, res) => {
  const { name, email, company, department, currentPassword, newPassword } = req.body || {};
  const db = getDatabase();
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);

  if (newPassword) {
    if (!verifyPassword(currentPassword || '', user.password_hash)) {
      return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }
    await db.prepare(
      `UPDATE users SET name = ?, email = ?, company = ?, department = ?, password_hash = ? WHERE id = ?`,
    ).run(name ?? user.name, email ?? user.email, company ?? user.company, department ?? user.department, hashPassword(newPassword), user.id);
  } else {
    await db.prepare(
      `UPDATE users SET name = ?, email = ?, company = ?, department = ? WHERE id = ?`,
    ).run(name ?? user.name, email ?? user.email, company ?? user.company, department ?? user.department, user.id);
  }

  const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  req.session.user = sanitizeUser(updated);
  res.json(sanitizeUser(updated));
});

router.get('/preferences', requireAuth, async (req, res) => {
  const db = getDatabase();
  const user = await db.prepare('SELECT preferences FROM users WHERE id = ?').get(req.session.user.id);
  res.json(parseUserPreferences(user?.preferences));
});

router.patch('/preferences', requireAuth, async (req, res) => {
  const db = getDatabase();
  const user = await db.prepare('SELECT preferences FROM users WHERE id = ?').get(req.session.user.id);
  const merged = mergeUserPreferences(user?.preferences, req.body || {});
  await db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(
    serializeUserPreferences(merged),
    req.session.user.id,
  );
  res.json(merged);
});

router.post('/register', async (req, res) => {
  const { username, password, name, email, company, department } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'ID, 비밀번호, 이름은 필수입니다.' });
  }

  const db = getDatabase();
  const exists = await db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  if (exists) {
    return res.status(400).json({ error: '이미 사용 중인 ID입니다.' });
  }

  const pending = await db.prepare(
    `SELECT id FROM registration_requests WHERE username = ? AND status = 'PENDING'`,
  ).get(username);
  if (pending) {
    return res.status(400).json({ error: '이미 승인 대기 중인 등록 요청이 있습니다.' });
  }

  await db.prepare(
    `INSERT INTO registration_requests (username, password_hash, name, email, company, department)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(username, hashPassword(password), name, email || '', company || '', department || '');

  res.status(201).json({ ok: true, message: '등록 요청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.' });
});

export default router;
