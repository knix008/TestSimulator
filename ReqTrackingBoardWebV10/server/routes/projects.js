import { Router } from 'express';
import { query, queryOne, insert, execute, now } from '../db.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { isAdminRole } from '../utils/roles.js';
import {
  canAccessProject,
  canEditProjectContent,
  getProjectById,
  getProjectMembership,
  isProjectAdmin,
  listUserProjects,
  mapJoinRequest,
  mapProject,
  mapProjectMember,
  parseProjectId,
} from '../utils/projectAccess.js';
import {
  diffProjectSnapshots,
  fetchProjectHistory,
  logProjectHistory,
  projectRowToSnapshot,
} from '../utils/projectHistory.js';

const router = Router();

async function memberSnapshot(userId, projectId) {
  const row = await queryOne(
    `SELECT pm.role, pm.permission, u.username, u.display_name
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = ? AND pm.user_id = ?`,
    [projectId, userId]
  );
  if (!row) {
    const user = await queryOne('SELECT username, display_name FROM users WHERE id = ?', [userId]);
    return user ? { userId, username: user.username, displayName: user.display_name } : { userId };
  }
  return {
    userId,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    permission: row.permission,
  };
}

async function loadMembersByProjectIds(projectIds) {
  if (!projectIds.length) return new Map();
  const placeholders = projectIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT pm.project_id, pm.role, pm.permission, u.id AS user_id, u.username, u.display_name
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id IN (${placeholders})
     ORDER BY pm.project_id, pm.role DESC, u.display_name, u.username`,
    projectIds
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.project_id)) map.set(row.project_id, []);
    map.get(row.project_id).push({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      permission: row.permission,
    });
  }
  return map;
}

async function loadProjectStats(projectId) {
  const [reqTotal] = await query(
    'SELECT COUNT(*) as c FROM requirements WHERE project_id = ?',
    [projectId]
  );
  const reqByStatus = await query(
    'SELECT status, COUNT(*) as count FROM requirements WHERE project_id = ? GROUP BY status',
    [projectId]
  );
  const [tcTotal] = await query(
    'SELECT COUNT(*) as c FROM test_cases WHERE project_id = ?',
    [projectId]
  );
  const tcByStatus = await query(
    'SELECT status, COUNT(*) as count FROM test_cases WHERE project_id = ? GROUP BY status',
    [projectId]
  );
  const [memberCount] = await query(
    'SELECT COUNT(*) as c FROM project_members WHERE project_id = ?',
    [projectId]
  );
  const [pendingRequests] = await query(
    `SELECT COUNT(*) as c FROM project_join_requests
     WHERE project_id = ? AND status = 'pending'`,
    [projectId]
  );
  const passCount = tcByStatus.find(s => s.status === 'Passed')?.count || 0;
  return {
    requirements: { total: reqTotal.c, byStatus: reqByStatus },
    testCases: { total: tcTotal.c, byStatus: tcByStatus },
    memberCount: memberCount.c,
    pendingJoinRequests: pendingRequests.c,
    passRate: tcTotal.c > 0 ? Math.round(passCount / tcTotal.c * 100) : 0,
  };
}

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    let rows;
    if (isAdminRole(req.user.role)) {
      rows = await query('SELECT * FROM projects ORDER BY name');
      rows = rows.map(r => ({ ...r, member_role: 'project_admin', member_permission: 'edit' }));
    } else {
      rows = await listUserProjects(req.user.id);
    }
    const membersMap = await loadMembersByProjectIds(rows.map(r => r.id));
    res.json(rows.map(r => ({
      ...mapProject(r),
      members: membersMap.get(r.id) || [],
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const projects = await query('SELECT * FROM projects ORDER BY name');
    const overview = [];
    for (const project of projects) {
      overview.push({
        ...mapProject(project),
        stats: await loadProjectStats(project.id),
      });
    }
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    if (isAdminRole(req.user.role)) {
      const rows = await query('SELECT * FROM projects ORDER BY name');
      res.json(rows.map(mapProject));
      return;
    }

    const rows = await query(
      `SELECT p.*,
              pm.role AS member_role,
              pm.permission AS member_permission,
              pm.joined_at,
              (SELECT status FROM project_join_requests jr
               WHERE jr.project_id = p.id AND jr.user_id = ? AND jr.status = 'pending'
               LIMIT 1) AS pending_request_status
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
       WHERE p.status = 'active'
       ORDER BY p.name`,
      [req.user.id, req.user.id]
    );
    res.json(rows.map(mapProject));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { code, name, description, status } = req.body;
    if (!code?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'code and name required' });
    }

    const existing = await queryOne('SELECT id FROM projects WHERE code = ?', [code.trim()]);
    if (existing) return res.status(409).json({ error: 'Project code already exists' });

    const projectStatus = isAdminRole(req.user.role) ? (status || 'active') : 'active';

    const id = await insert(
      `INSERT INTO projects (code, name, description, status, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [code.trim(), name.trim(), description || '', projectStatus, req.user.id, now()]
    );

    await insert(
      'INSERT INTO project_members (project_id, user_id, role, permission) VALUES (?, ?, ?, ?)',
      [id, req.user.id, 'project_admin', 'edit']
    );

    const row = await getProjectById(id);
    await logProjectHistory({
      projectId: id,
      projectCode: code.trim(),
      action: 'create',
      changedBy: req.user.id,
      changes: { snapshot: projectRowToSnapshot(row) },
    });
    res.status(201).json(mapProject({
      ...row,
      member_role: 'project_admin',
      member_permission: 'edit',
      joined_at: now(),
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/dashboard', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    if (!(await canAccessProject(req.user, projectId))) {
      return res.status(403).json({ error: 'Project access denied' });
    }
    const project = await getProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project: mapProject(project), stats: await loadProjectStats(projectId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/history', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    if (!(await canAccessProject(req.user, projectId))) {
      return res.status(403).json({ error: 'Project access denied' });
    }
    const history = await fetchProjectHistory({
      projectId,
      limit: req.query.limit,
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/available-users', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    if (!(await isProjectAdmin(req.user, projectId))) {
      return res.status(403).json({ error: 'Project admin access required' });
    }

    const rows = await query(
      `SELECT u.id, u.username, u.display_name, u.email
       FROM users u
       WHERE u.is_active = 1
         AND u.id NOT IN (SELECT user_id FROM project_members WHERE project_id = ?)
       ORDER BY u.display_name`,
      [projectId]
    );
    res.json(rows.map(r => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      email: r.email,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/members', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    if (!(await canAccessProject(req.user, projectId))) {
      return res.status(403).json({ error: 'Project access denied' });
    }
    const rows = await query(
      `SELECT pm.*, u.username, u.display_name, u.email
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?
       ORDER BY pm.role DESC, u.display_name`,
      [projectId]
    );
    res.json(rows.map(mapProjectMember));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    const { userId, role, permission } = req.body;
    if (!projectId || !userId) {
      return res.status(400).json({ error: 'project id and userId required' });
    }
    if (!(await isProjectAdmin(req.user, projectId))) {
      return res.status(403).json({ error: 'Project admin access required' });
    }

    const user = await queryOne('SELECT id, is_active FROM users WHERE id = ?', [userId]);
    if (!user || !user.is_active) return res.status(404).json({ error: 'User not found' });

    const existing = await getProjectMembership(userId, projectId);
    if (existing) return res.status(409).json({ error: 'User is already a member' });

    const memberRole = role === 'project_admin' ? 'project_admin' : 'member';
    const memberPermission = permission === 'edit' ? 'edit' : 'view';

    const id = await insert(
      'INSERT INTO project_members (project_id, user_id, role, permission) VALUES (?, ?, ?, ?)',
      [projectId, userId, memberRole, memberPermission]
    );

    await execute(
      `UPDATE project_join_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ?
       WHERE project_id = ? AND user_id = ? AND status = 'pending'`,
      [req.user.id, now(), projectId, userId]
    );

    const row = await queryOne(
      `SELECT pm.*, u.username, u.display_name, u.email
       FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.id = ?`,
      [id]
    );
    await logProjectHistory({
      projectId,
      projectCode: (await getProjectById(projectId))?.code || '',
      action: 'member_add',
      changedBy: req.user.id,
      changes: {
        snapshot: {
          userId: Number(userId),
          username: row.username,
          displayName: row.display_name,
          role: memberRole,
          permission: memberPermission,
        },
      },
    });
    res.status(201).json(mapProjectMember(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    const userId = Number(req.params.userId);
    if (!projectId || !userId) return res.status(400).json({ error: 'Invalid ids' });
    if (!(await isProjectAdmin(req.user, projectId))) {
      return res.status(403).json({ error: 'Project admin access required' });
    }

    const target = await getProjectMembership(userId, projectId);
    if (!target) return res.status(404).json({ error: 'Member not found' });

    const beforeSnap = await memberSnapshot(userId, projectId);
    const memberRole = req.body.role === 'project_admin' ? 'project_admin' : 'member';
    const memberPermission = req.body.permission === 'edit' ? 'edit' : 'view';

    if (target.role === 'project_admin' && memberRole !== 'project_admin') {
      const admins = await query(
        'SELECT user_id FROM project_members WHERE project_id = ? AND role = ?',
        [projectId, 'project_admin']
      );
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last project admin' });
      }
    }

    await execute(
      'UPDATE project_members SET role = ?, permission = ? WHERE project_id = ? AND user_id = ?',
      [memberRole, memberPermission, projectId, userId]
    );

    const row = await queryOne(
      `SELECT pm.*, u.username, u.display_name, u.email
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? AND pm.user_id = ?`,
      [projectId, userId]
    );

    const changes = {};
    if (beforeSnap.role !== memberRole) {
      changes.role = { old: beforeSnap.role, new: memberRole };
    }
    if (beforeSnap.permission !== memberPermission) {
      changes.permission = { old: beforeSnap.permission, new: memberPermission };
    }
    changes.member = {
      userId,
      username: beforeSnap.username,
      displayName: beforeSnap.displayName,
    };
    if (Object.keys(changes).length > 1 || changes.role || changes.permission) {
      const project = await getProjectById(projectId);
      await logProjectHistory({
        projectId,
        projectCode: project?.code || '',
        action: 'member_update',
        changedBy: req.user.id,
        changes,
      });
    }

    res.json(mapProjectMember(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    const userId = Number(req.params.userId);
    if (!projectId || !userId) return res.status(400).json({ error: 'Invalid ids' });
    if (!(await isProjectAdmin(req.user, projectId))) {
      return res.status(403).json({ error: 'Project admin access required' });
    }

    const admins = await query(
      'SELECT user_id FROM project_members WHERE project_id = ? AND role = ?',
      [projectId, 'project_admin']
    );
    const target = await getProjectMembership(userId, projectId);
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'project_admin' && admins.length <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last project admin' });
    }

    const removedSnap = await memberSnapshot(userId, projectId);
    const project = await getProjectById(projectId);

    await execute('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);

    await logProjectHistory({
      projectId,
      projectCode: project?.code || '',
      action: 'member_remove',
      changedBy: req.user.id,
      changes: { snapshot: removedSnap },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/join-requests', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });

    const project = await getProjectById(projectId);
    if (!project || project.status !== 'active') {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (isAdminRole(req.user.role)) {
      return res.status(400).json({ error: 'Global admin already has access to all projects' });
    }

    const membership = await getProjectMembership(req.user.id, projectId);
    if (membership) return res.status(409).json({ error: 'Already a project member' });

    const pending = await queryOne(
      `SELECT id FROM project_join_requests
       WHERE project_id = ? AND user_id = ? AND status = 'pending'`,
      [projectId, req.user.id]
    );
    if (pending) return res.status(409).json({ error: 'Join request already pending' });

    const id = await insert(
      `INSERT INTO project_join_requests (project_id, user_id, message, status)
       VALUES (?, ?, ?, 'pending')`,
      [projectId, req.user.id, req.body.message || '']
    );

    const row = await queryOne(
      `SELECT jr.*, u.username, u.display_name
       FROM project_join_requests jr
       JOIN users u ON u.id = jr.user_id
       WHERE jr.id = ?`,
      [id]
    );
    res.status(201).json(mapJoinRequest(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/join-requests', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    if (!(await isProjectAdmin(req.user, projectId))) {
      return res.status(403).json({ error: 'Project admin access required' });
    }

    const status = req.query.status || 'pending';
    const rows = await query(
      `SELECT jr.*, u.username, u.display_name
       FROM project_join_requests jr
       JOIN users u ON u.id = jr.user_id
       WHERE jr.project_id = ? AND jr.status = ?
       ORDER BY jr.created_at DESC`,
      [projectId, status]
    );
    res.json(rows.map(mapJoinRequest));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function reviewJoinRequest(req, res, approve) {
  const projectId = parseProjectId(req.params.id);
  const requestId = Number(req.params.requestId);
  if (!projectId || !requestId) return res.status(400).json({ error: 'Invalid ids' });
  if (!(await isProjectAdmin(req.user, projectId))) {
    return res.status(403).json({ error: 'Project admin access required' });
  }

  const joinRequest = await queryOne(
    'SELECT * FROM project_join_requests WHERE id = ? AND project_id = ?',
    [requestId, projectId]
  );
  if (!joinRequest) return res.status(404).json({ error: 'Join request not found' });
  if (joinRequest.status !== 'pending') {
    return res.status(400).json({ error: 'Join request already processed' });
  }

  await execute(
    `UPDATE project_join_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
    [approve ? 'approved' : 'rejected', req.user.id, now(), requestId]
  );

  if (approve) {
    const existing = await getProjectMembership(joinRequest.user_id, projectId);
    if (!existing) {
      await insert(
        'INSERT INTO project_members (project_id, user_id, role, permission) VALUES (?, ?, ?, ?)',
        [projectId, joinRequest.user_id, 'member', 'view']
      );
    }
    const user = await queryOne(
      'SELECT username, display_name FROM users WHERE id = ?',
      [joinRequest.user_id]
    );
    const project = await getProjectById(projectId);
    await logProjectHistory({
      projectId,
      projectCode: project?.code || '',
      action: 'join_approve',
      changedBy: req.user.id,
      changes: {
        snapshot: {
          userId: joinRequest.user_id,
          username: user?.username,
          displayName: user?.display_name,
          role: 'member',
          permission: 'view',
        },
      },
    });
  } else {
    const user = await queryOne(
      'SELECT username, display_name FROM users WHERE id = ?',
      [joinRequest.user_id]
    );
    const project = await getProjectById(projectId);
    await logProjectHistory({
      projectId,
      projectCode: project?.code || '',
      action: 'join_reject',
      changedBy: req.user.id,
      changes: {
        snapshot: {
          userId: joinRequest.user_id,
          username: user?.username,
          displayName: user?.display_name,
        },
      },
    });
  }

  const row = await queryOne(
    `SELECT jr.*, u.username, u.display_name
     FROM project_join_requests jr JOIN users u ON u.id = jr.user_id WHERE jr.id = ?`,
    [requestId]
  );
  res.json(mapJoinRequest(row));
}

router.post('/:id/join-requests/:requestId/approve', authMiddleware, (req, res) =>
  reviewJoinRequest(req, res, true).catch(err => res.status(500).json({ error: err.message }))
);

router.post('/:id/join-requests/:requestId/reject', authMiddleware, (req, res) =>
  reviewJoinRequest(req, res, false).catch(err => res.status(500).json({ error: err.message }))
);

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    if (!(await canAccessProject(req.user, projectId))) {
      return res.status(403).json({ error: 'Project access denied' });
    }
    const row = await getProjectById(projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const membership = await getProjectMembership(req.user.id, projectId);
    res.json(mapProject({
      ...row,
      member_role: membership?.role ?? (isAdminRole(req.user.role) ? 'project_admin' : null),
      member_permission: membership?.permission ?? (isAdminRole(req.user.role) ? 'edit' : null),
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    const row = await getProjectById(projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });

    const isGlobalAdmin = isAdminRole(req.user.role);
    const canManage = isGlobalAdmin || await isProjectAdmin(req.user, projectId);
    if (!canManage) {
      return res.status(403).json({ error: 'Project admin access required' });
    }

    const { code, name, description, status } = req.body;
    if (code && code.trim() !== row.code) {
      const dup = await queryOne('SELECT id FROM projects WHERE code = ? AND id != ?', [code.trim(), projectId]);
      if (dup) return res.status(409).json({ error: 'Project code already exists' });
    }

    const nextStatus = isGlobalAdmin ? (status || row.status) : row.status;
    const afterSnapshot = {
      code: code?.trim() || row.code,
      name: name?.trim() || row.name,
      description: description ?? row.description,
      status: nextStatus,
    };
    const changes = diffProjectSnapshots(projectRowToSnapshot(row), afterSnapshot);

    await execute(
      `UPDATE projects SET code = ?, name = ?, description = ?, status = ?, updated_at = ? WHERE id = ?`,
      [
        afterSnapshot.code,
        afterSnapshot.name,
        afterSnapshot.description,
        afterSnapshot.status,
        now(),
        projectId,
      ]
    );

    if (Object.keys(changes).length > 0) {
      await logProjectHistory({
        projectId,
        projectCode: afterSnapshot.code,
        action: 'update',
        changedBy: req.user.id,
        changes,
      });
    }

    const updated = await getProjectById(projectId);
    res.json(mapProject(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) return res.status(400).json({ error: 'Invalid project id' });
    const row = await getProjectById(projectId);
    if (!row) return res.status(404).json({ error: 'Project not found' });

    const [reqCount] = await query(
      'SELECT COUNT(*) as c FROM requirements WHERE project_id = ?',
      [projectId]
    );
    if (reqCount.c > 0) {
      return res.status(400).json({ error: 'Cannot delete project with requirements. Archive it instead.' });
    }

    await logProjectHistory({
      projectId,
      projectCode: row.code,
      action: 'delete',
      changedBy: req.user.id,
      changes: { snapshot: projectRowToSnapshot(row) },
    });

    await execute('DELETE FROM projects WHERE id = ?', [projectId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
