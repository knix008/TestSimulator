import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { requireRole } from '../auth/middleware.js';
import {
  addUserToProject,
  getProjectMembers,
  getProjectMembership,
  listProjectsForUser,
  setProjectMembers,
  userCanDeleteProject,
  userCanManageProject,
  userCanViewProject,
  userCanEditProject,
  normalizeMemberRole,
} from '../lib/projectMembers.js';
import { deleteProjectWithContents } from '../lib/projectDelete.js';
import {
  exportProjectToReqtproj,
  importReqtprojAsNewProject,
  importReqtprojIntoProject,
} from '../lib/projectFileService.js';
import {
  mergeProjectUiSettings,
  parseProjectUiSettings,
  serializeProjectUiSettings,
} from '../lib/projectUiSettings.js';
import { isSystemDefaultProjectRow } from '../lib/systemProject.js';

const router = Router();

function normalizeProjectCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function mapProject(row, user) {
  const memberRole = normalizeMemberRole(row.member_role);
  const isAdmin = user?.role === 'ADMIN';
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: Boolean(row.is_active),
    createdById: row.created_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requirementCount: row.requirement_count ?? 0,
    memberRole,
    canView: true,
    canEdit: isAdmin || memberRole === 'EDITOR',
    canManage: isAdmin || memberRole === 'EDITOR',
    isOwner: Number(row.created_by_id) === Number(user?.id),
    isSystemDefault: isSystemDefaultProjectRow(row),
    uiSettings: parseProjectUiSettings(row.ui_settings),
  };
}

router.get('/', requireRole('VIEWER'), async (req, res) => {
  const manage = req.query.manage === '1' || req.query.manage === 'true';
  if (manage && req.session.user.role !== 'ADMIN') {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }

  const db = getDatabase();
  const rows = await listProjectsForUser(db, req.session.user, { manage });
  res.json(rows.map((row) => mapProject(row, req.session.user)));
});

router.post('/open-reqtproj', requireRole('VIEWER'), async (req, res, next) => {
  try {
    const db = getDatabase();
    const result = await importReqtprojAsNewProject(db, req.session.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/reqtproj', requireRole('VIEWER'), async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const db = getDatabase();
    const allowed = await userCanViewProject(db, req.session.user, projectId);
    if (!allowed) return res.status(403).json({ error: '이 프로젝트를 볼 수 있는 권한이 없습니다.' });

    const payload = await exportProjectToReqtproj(db, projectId);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reqtproj', requireRole('VIEWER'), async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const db = getDatabase();
    const canEdit = await userCanEditProject(db, req.session.user, projectId);
    if (!canEdit) return res.status(403).json({ error: '프로젝트를 편집할 권한이 없습니다.' });

    const project = await db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

    const importResult = await importReqtprojIntoProject(db, projectId, req.session.user.id, req.body);
    res.json({ importResult });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/members', requireRole('VIEWER'), async (req, res) => {
  const projectId = Number(req.params.id);
  const db = getDatabase();
  const canManage = await userCanManageProject(db, req.session.user, projectId);
  const canView = await userCanViewProject(db, req.session.user, projectId);
  if (!canView) return res.status(403).json({ error: '이 프로젝트를 볼 수 있는 권한이 없습니다.' });
  if (!canManage && req.session.user.role !== 'ADMIN') {
    return res.status(403).json({ error: '프로젝트 멤버를 관리할 권한이 없습니다.' });
  }

  const project = await db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
  const members = await getProjectMembers(db, projectId);
  res.json(members);
});

router.put('/:id/members', requireRole('VIEWER'), async (req, res) => {
  const projectId = Number(req.params.id);
  const members = Array.isArray(req.body?.members) ? req.body.members : [];
  const db = getDatabase();
  const canManage = await userCanManageProject(db, req.session.user, projectId);
  if (!canManage) return res.status(403).json({ error: '프로젝트 멤버를 관리할 권한이 없습니다.' });

  const project = await db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

  await setProjectMembers(db, projectId, members);
  const result = await getProjectMembers(db, projectId);
  res.json(result);
});

router.get('/:id', requireRole('VIEWER'), async (req, res) => {
  const projectId = Number(req.params.id);
  const db = getDatabase();
  const allowed = await userCanViewProject(db, req.session.user, projectId);
  if (!allowed) return res.status(403).json({ error: '이 프로젝트를 볼 수 있는 권한이 없습니다.' });

  const row = await db.prepare(`
    SELECT p.*, COUNT(r.id) AS requirement_count,
      COALESCE(pm.member_role, 'EDITOR') AS member_role
    FROM projects p
    LEFT JOIN requirements r ON r.project_id = p.id
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.id = ?
    GROUP BY p.id
  `).get(req.session.user.id, projectId);

  if (!row) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
  res.json(mapProject(row, req.session.user));
});

router.post('/', requireRole('VIEWER'), async (req, res) => {
  const { code, name, description, members } = req.body || {};
  if (!code || !name) {
    return res.status(400).json({ error: '코드와 이름은 필수입니다.' });
  }

  const db = getDatabase();
  try {
    const result = await db.prepare(
      `INSERT INTO projects (code, name, description, created_by_id)
       VALUES (?, ?, ?, ?)`,
    ).run(normalizeProjectCode(code), name, description || '', req.session.user.id);

    const projectId = result.lastInsertRowid;
    const memberList = Array.isArray(members) ? [...members] : [];
    const creatorIncluded = memberList.some((m) => Number(m.userId ?? m.id) === Number(req.session.user.id));
    if (!creatorIncluded && req.session.user.role !== 'ADMIN') {
      memberList.push({ userId: req.session.user.id, memberRole: 'EDITOR' });
    }
    if (memberList.length > 0) {
      await setProjectMembers(db, projectId, memberList);
    } else if (req.session.user.role !== 'ADMIN') {
      await addUserToProject(db, projectId, req.session.user.id, 'EDITOR');
    }

    const project = await db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    const membership = await getProjectMembership(db, req.session.user, projectId);
    res.status(201).json(mapProject({
      ...project,
      requirement_count: 0,
      member_role: membership?.memberRole || 'EDITOR',
    }, req.session.user));
  } catch (err) {
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('duplicate')) {
      return res.status(400).json({ error: '이미 사용 중인 프로젝트 코드입니다.' });
    }
    throw err;
  }
});

router.put('/:id', requireRole('VIEWER'), async (req, res) => {
  const projectId = Number(req.params.id);
  const { name, description, isActive, code } = req.body || {};
  const db = getDatabase();
  const existing = await db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!existing) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

  const canManage = await userCanManageProject(db, req.session.user, projectId);
  if (!canManage && req.session.user.role !== 'ADMIN') {
    return res.status(403).json({ error: '프로젝트를 편집할 권한이 없습니다.' });
  }

  const nextActive = req.session.user.role === 'ADMIN' && typeof isActive === 'boolean'
    ? (isActive ? 1 : 0)
    : existing.is_active;

  let nextCode = existing.code;
  if (code !== undefined && code !== null) {
    const normalized = normalizeProjectCode(code);
    if (!normalized) {
      return res.status(400).json({ error: '유효하지 않은 프로젝트 코드입니다.' });
    }
    nextCode = normalized;
  }

  try {
    await db.prepare(
      `UPDATE projects SET code = ?, name = ?, description = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(nextCode, name ?? existing.name, description ?? existing.description, nextActive, existing.id);
  } catch (err) {
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('duplicate')) {
      return res.status(400).json({ error: '이미 사용 중인 프로젝트 코드입니다.' });
    }
    throw err;
  }

  const updated = await db.prepare(`
    SELECT p.*, COUNT(r.id) AS requirement_count,
      COALESCE(pm.member_role, 'EDITOR') AS member_role
    FROM projects p
    LEFT JOIN requirements r ON r.project_id = p.id
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.id = ?
    GROUP BY p.id
  `).get(req.session.user.id, existing.id);
  res.json(mapProject(updated, req.session.user));
});

router.patch('/:id/ui-settings', requireRole('VIEWER'), async (req, res) => {
  const projectId = Number(req.params.id);
  const db = getDatabase();
  const existing = await db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!existing) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

  const canEdit = await userCanEditProject(db, req.session.user, projectId);
  if (!canEdit) {
    return res.status(403).json({ error: '이 프로젝트를 편집할 수 있는 권한이 없습니다.' });
  }

  const merged = mergeProjectUiSettings(existing.ui_settings, req.body || {});
  await db.prepare(
    `UPDATE projects SET ui_settings = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(serializeProjectUiSettings(merged), projectId);

  const updated = await db.prepare(`
    SELECT p.*, COUNT(r.id) AS requirement_count,
      COALESCE(pm.member_role, 'EDITOR') AS member_role
    FROM projects p
    LEFT JOIN requirements r ON r.project_id = p.id
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.id = ?
    GROUP BY p.id
  `).get(req.session.user.id, projectId);

  res.json(mapProject(updated, req.session.user));
});

router.delete('/:id', requireRole('VIEWER'), async (req, res) => {
  const db = getDatabase();
  const id = Number(req.params.id);
  const existing = await db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });

  const canDelete = await userCanDeleteProject(db, req.session.user, existing);
  if (!canDelete) return res.status(403).json({ error: '프로젝트를 삭제할 권한이 없습니다.' });

  const { testCaseCount, requirementCount } = await deleteProjectWithContents(db, id);
  res.json({ ok: true, requirementCount, testCaseCount });
});

export default router;
