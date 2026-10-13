const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/connection');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });

    const db = getDb();
    const user = await db('users').where({ username }).first();

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    if (user.status === 'pending') {
      return res.status(403).json({ error: '계정 승인 대기 중입니다. 관리자에게 문의하세요.' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ error: '비활성화된 계정입니다.' });
    }

    req.session.userId = user.id;
    req.session.role = user.role;

    res.json({ id: user.id, username: user.username, displayName: user.display_name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await getDb()('users').where({ id: req.session.userId }).first();
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, displayName: user.display_name, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 등록 요청 (승인 후 활성화)
router.post('/register-request', async (req, res) => {
  try {
    const { username, password, email, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호는 필수입니다.' });

    const db = getDb();
    const exists = await db('users').where({ username }).first();
    if (exists) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });

    const hash = await bcrypt.hash(password, 10);
    await db('users').insert({
      username,
      password: hash,
      email: email || null,
      display_name: displayName || username,
      role: 'user',
      status: 'pending'
    });

    res.json({ ok: true, message: '등록 요청이 완료되었습니다. 관리자 승인을 기다려주세요.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 비밀번호 변경 (본인)
router.post('/change-password', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: '모든 필드를 입력하세요.' });
    if (newPassword.length < 4) return res.status(400).json({ error: '비밀번호는 최소 4자 이상이어야 합니다.' });

    const db = getDb();
    const user = await db('users').where({ id: req.session.userId }).first();
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db('users').where({ id: req.session.userId }).update({ password: hash, updated_at: new Date() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 프로필 업데이트 (본인)
router.put('/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { email, displayName } = req.body;
    const db = getDb();
    await db('users').where({ id: req.session.userId }).update({
      email: email || null,
      display_name: displayName || null,
      updated_at: new Date()
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
