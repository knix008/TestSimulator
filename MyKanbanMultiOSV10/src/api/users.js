const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/connection');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  next();
}

// 전체 사용자 목록 (관리자)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await getDb()('users')
      .select('id', 'username', 'email', 'display_name', 'role', 'status', 'created_at')
      .orderBy('created_at', 'desc');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 활성 사용자 목록 (카드 담당자 지정용)
router.get('/active', requireAuth, async (req, res) => {
  try {
    const users = await getDb()('users')
      .where({ status: 'active' })
      .select('id', 'username', 'display_name');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 사용자 생성 (관리자)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { username, password, email, displayName, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호는 필수입니다.' });

    const db = getDb();
    const exists = await db('users').where({ username }).first();
    if (exists) return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });

    const hash = await bcrypt.hash(password, 10);
    const [id] = await db('users').insert({
      username,
      password: hash,
      email: email || null,
      display_name: displayName || username,
      role: role || 'user',
      status: 'active'
    });

    res.json({ id, username, displayName: displayName || username, role: role || 'user', status: 'active' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 사용자 수정 (관리자)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, displayName, role, status, password } = req.body;
    const db = getDb();

    const update = { updated_at: new Date() };
    if (email !== undefined) update.email = email || null;
    if (displayName !== undefined) update.display_name = displayName || null;
    if (role !== undefined) update.role = role;
    if (status !== undefined) update.status = status;
    if (password) update.password = await bcrypt.hash(password, 10);

    await db('users').where({ id }).update(update);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 사용자 삭제 (관리자)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const user = await db('users').where({ id }).first();
    if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    if (user.username === 'admin') {
      return res.status(400).json({ error: '관리자 계정은 삭제할 수 없습니다.' });
    }
    if (parseInt(id) === req.session.userId) {
      return res.status(400).json({ error: '자신의 계정은 삭제할 수 없습니다.' });
    }
    await db('users').where({ id }).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 등록 요청 승인 (관리자)
router.patch('/:id/approve', requireAdmin, async (req, res) => {
  try {
    await getDb()('users').where({ id: req.params.id }).update({ status: 'active', updated_at: new Date() });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 등록 요청 거부/삭제 (관리자)
router.patch('/:id/reject', requireAdmin, async (req, res) => {
  try {
    await getDb()('users').where({ id: req.params.id, status: 'pending' }).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
