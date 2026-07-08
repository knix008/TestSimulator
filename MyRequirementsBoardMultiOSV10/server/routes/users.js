import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { sanitizeUser } from '../auth/auth.js';
import { requireRole } from '../auth/middleware.js';
import { getUserProjects, setUserProjects, addUserToProject } from '../lib/projectMembers.js';
import { getSystemDefaultProject } from '../lib/systemProject.js';

const router = Router();

router.get('/', requireRole('ADMIN'), async (req, res) => {
  const db = getDatabase();
  const rows = await db.prepare('SELECT * FROM users ORDER BY id').all();
  res.json(rows.map(sanitizeUser));
});

router.get('/assignable', requireRole('VIEWER'), async (req, res) => {
  const db = getDatabase();
  const rows = await db.prepare(
    `SELECT id, username, name, email, role, is_active FROM users WHERE role != 'ADMIN' AND is_active = 1 ORDER BY name, username`,
  ).all();
  res.json(rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    email: r.email || '',
    role: r.role,
    isActive: Boolean(r.is_active),
  })));
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { username, password, name, email, company, department, role, projectIds, projectAssignments } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'ID, 비밀번호, 이름은 필수입니다.' });
  }

  const db = getDatabase();
  try {
    const result = await db.prepare(
      `INSERT INTO users (username, password_hash, name, email, company, department, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(username, hashPassword(password), name, email || '', company || '', department || '', role || 'VIEWER');

    const userId = result.lastInsertRowid;
    const assignments = Array.isArray(projectAssignments) && projectAssignments.length > 0
      ? projectAssignments
      : (Array.isArray(projectIds) ? projectIds.map((id) => ({ projectId: id, memberRole: 'VIEWER' })) : []);

    if (assignments.length > 0) {
      await setUserProjects(db, userId, assignments);
    } else if ((role || 'VIEWER') !== 'ADMIN') {
      const defaultProject = await getSystemDefaultProject(db);
      if (defaultProject) await addUserToProject(db, defaultProject.id, userId);
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.status(201).json(sanitizeUser(user));
  } catch (err) {
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('duplicate')) {
      return res.status(400).json({ error: '이미 사용 중인 ID입니다.' });
    }
    throw err;
  }
});

router.get('/registration-requests', requireRole('ADMIN'), async (req, res) => {
  const db = getDatabase();
  const rows = await db.prepare(
    `SELECT * FROM registration_requests WHERE status = 'PENDING' ORDER BY created_at DESC`,
  ).all();
  res.json(rows.map((r) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    email: r.email,
    company: r.company,
    department: r.department,
    requestedRole: r.requested_role,
    status: r.status,
    createdAt: r.created_at,
  })));
});

router.post('/registration-requests/:id/approve', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  const projectAssignments = Array.isArray(req.body?.projectAssignments)
    ? req.body.projectAssignments
    : (Array.isArray(req.body?.projectIds)
      ? req.body.projectIds.map((id) => ({ projectId: id, memberRole: 'VIEWER' }))
      : []);
  const db = getDatabase();
  const request = await db.prepare('SELECT * FROM registration_requests WHERE id = ?').get(id);
  if (!request || request.status !== 'PENDING') {
    return res.status(404).json({ error: '승인 대기 요청을 찾을 수 없습니다.' });
  }

  try {
    let userId;
    await db.transaction(async (tx) => {
      const insert = await tx.prepare(
        `INSERT INTO users (username, password_hash, name, email, company, department, role)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        request.username,
        request.password_hash,
        request.name,
        request.email,
        request.company,
        request.department,
        request.requested_role,
      );
      userId = insert.lastInsertRowid;
      await tx.prepare(
        `UPDATE registration_requests SET status = 'APPROVED', reviewed_at = datetime('now') WHERE id = ?`,
      ).run(id);
    });

    if (projectAssignments.length > 0) {
      await setUserProjects(db, userId, projectAssignments);
    } else if (request.requested_role !== 'ADMIN') {
      const defaultProject = await getSystemDefaultProject(db);
      if (defaultProject) await addUserToProject(db, defaultProject.id, userId);
    }

    res.json({ ok: true });
  } catch (err) {
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('duplicate')) {
      return res.status(400).json({ error: '이미 존재하는 사용자 ID입니다.' });
    }
    throw err;
  }
});

router.post('/registration-requests/:id/reject', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  const db = getDatabase();
  const result = await db.prepare(
    `UPDATE registration_requests SET status = 'REJECTED', reviewed_at = datetime('now') WHERE id = ? AND status = 'PENDING'`,
  ).run(id);
  if (result.changes === 0) return res.status(404).json({ error: '승인 대기 요청을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

router.get('/:id/projects', requireRole('ADMIN'), async (req, res) => {
  const userId = Number(req.params.id);
  const db = getDatabase();
  const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  const projects = await getUserProjects(db, userId);
  res.json(projects);
});

router.put('/:id/projects', requireRole('ADMIN'), async (req, res) => {
  const userId = Number(req.params.id);
  const projectAssignments = Array.isArray(req.body?.projectAssignments)
    ? req.body.projectAssignments
    : (Array.isArray(req.body?.projectIds)
      ? req.body.projectIds.map((id) => ({ projectId: id, memberRole: 'VIEWER' }))
      : []);
  const db = getDatabase();
  const user = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

  await setUserProjects(db, userId, projectAssignments);
  const projects = await getUserProjects(db, userId);
  res.json(projects);
});

router.put('/:id/password', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  const currentPassword = String(req.body?.currentPassword || '').trim();
  const password = String(req.body?.password || '').trim();

  if (!currentPassword) {
    return res.status(400).json({ error: '기존 비밀번호를 입력하세요.' });
  }
  if (!password) {
    return res.status(400).json({ error: '새 비밀번호를 입력하세요.' });
  }

  const db = getDatabase();
  const existing = await db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

  if (!verifyPassword(currentPassword, existing.password_hash)) {
    return res.status(400).json({ error: '기존 비밀번호가 일치하지 않습니다.' });
  }

  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  res.json({ ok: true });
});

router.put('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  const { username, name, email, company, department, role, isActive, password } = req.body || {};
  const db = getDatabase();
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

  const nextUsername = (username ?? existing.username).trim();
  if (!nextUsername) {
    return res.status(400).json({ error: 'ID는 필수입니다.' });
  }
  if (existing.username === 'admin') {
    if (nextUsername !== 'admin') {
      return res.status(400).json({ error: '기본 관리자 계정의 ID는 변경할 수 없습니다.' });
    }
    if (role && role !== 'ADMIN') {
      return res.status(400).json({ error: '기본 관리자 계정의 역할은 변경할 수 없습니다.' });
    }
    if (isActive === false) {
      return res.status(400).json({ error: '기본 관리자 계정은 비활성화할 수 없습니다.' });
    }
  }

  const nextRole = role ?? existing.role;
  const nextActive = isActive !== undefined
    ? (isActive === false ? 0 : 1)
    : existing.is_active;

  try {
    if (password) {
      await db.prepare(
        `UPDATE users SET username = ?, name = ?, email = ?, company = ?, department = ?, role = ?, is_active = ?, password_hash = ? WHERE id = ?`,
      ).run(
        nextUsername,
        name ?? existing.name,
        email ?? existing.email,
        company ?? existing.company,
        department ?? existing.department,
        nextRole,
        nextActive,
        hashPassword(password),
        id,
      );
    } else {
      await db.prepare(
        `UPDATE users SET username = ?, name = ?, email = ?, company = ?, department = ?, role = ?, is_active = ? WHERE id = ?`,
      ).run(
        nextUsername,
        name ?? existing.name,
        email ?? existing.email,
        company ?? existing.company,
        department ?? existing.department,
        nextRole,
        nextActive,
        id,
      );
    }
  } catch (err) {
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('duplicate')) {
      return res.status(400).json({ error: '이미 사용 중인 ID입니다.' });
    }
    throw err;
  }

  const updated = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (req.session?.user && Number(req.session.user.id) === Number(id)) {
    req.session.user = sanitizeUser(updated);
  }
  res.json(sanitizeUser(updated));
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  const db = getDatabase();
  const existing = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  if (existing.role === 'ADMIN') {
    return res.status(400).json({ error: '관리자 계정은 삭제할 수 없습니다.' });
  }

  await db.transaction(async (tx) => {
    await tx.prepare('UPDATE requirements SET assignee_user_id = NULL WHERE assignee_user_id = ?').run(id);
    await tx.prepare('UPDATE requirements SET created_by_id = NULL WHERE created_by_id = ?').run(id);
    await tx.prepare('UPDATE test_cases SET created_by_id = NULL WHERE created_by_id = ?').run(id);
    await tx.prepare('UPDATE projects SET created_by_id = NULL WHERE created_by_id = ?').run(id);
    await tx.prepare('DELETE FROM users WHERE id = ?').run(id);
  });

  res.json({ ok: true });
});

export default router;
