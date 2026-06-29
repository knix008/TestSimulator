import { Router } from 'express';
import { query, queryOne, insert, execute, now } from '../db.js';
import { authMiddleware, editMiddleware } from '../middleware/auth.js';
import {
  getNextStandardReqId,
  resolveReqIdForCreate,
  resolveReqIdForUpdate,
  renumberAllStandardReqIds,
} from '../utils/reqId.js';
import {
  rowToSnapshot,
  bodyToSnapshot,
  diffSnapshots,
  logRequirementHistory,
  fetchRequirementHistory,
} from '../utils/requirementHistory.js';
import {
  canAccessProject,
  canEditProjectContent,
  assertRequirementProjectAccess,
  parseProjectId,
} from '../utils/projectAccess.js';

const router = Router();

async function resolveProjectContext(req, res, needsEdit = false) {
  const projectId = parseProjectId(req.query.projectId ?? req.body?.projectId);
  if (!projectId) {
    res.status(400).json({ error: 'projectId required' });
    return null;
  }
  if (!(await canAccessProject(req.user, projectId))) {
    res.status(403).json({ error: 'Project access denied' });
    return null;
  }
  if (needsEdit && !(await canEditProjectContent(req.user, projectId))) {
    res.status(403).json({ error: 'Project edit permission required' });
    return null;
  }
  return projectId;
}

function mapRequirement(row) {
  return {
    id: row.id,
    reqId: row.req_id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    owner: row.owner,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    testCaseCount: row.test_case_count ?? 0,
    passedCount: row.passed_count ?? 0,
    failedCount: row.failed_count ?? 0,
  };
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const projectId = await resolveProjectContext(req, res);
    if (!projectId) return;

    const { search, status, category } = req.query;
    let sql = `
      SELECT r.*,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) as test_case_count,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id AND tc.status = 'Passed') as passed_count,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id AND tc.status = 'Failed') as failed_count
      FROM requirements r WHERE r.project_id = ?
    `;
    const params = [projectId];
    if (search) {
      sql += ` AND (r.req_id LIKE ? OR r.title LIKE ? OR r.description LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (status) { sql += ` AND r.status = ?`; params.push(status); }
    if (category) { sql += ` AND r.category = ?`; params.push(category); }
    sql += ` ORDER BY r.req_id`;
    const rows = await query(sql, params);
    res.json(rows.map(mapRequirement));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const projectId = await resolveProjectContext(req, res);
    if (!projectId) return;
    const history = await fetchRequirementHistory({
      projectId,
      requirementId: req.query.requirementId ? Number(req.query.requirementId) : undefined,
      reqId: req.query.reqId,
      limit: req.query.limit,
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/next-id', authMiddleware, async (req, res) => {
  try {
    const projectId = await resolveProjectContext(req, res);
    if (!projectId) return;
    const reqId = await getNextStandardReqId(projectId);
    res.json({ reqId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/history', authMiddleware, async (req, res) => {
  try {
    const access = await assertRequirementProjectAccess(req.user, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const history = await fetchRequirementHistory({
      requirementId: Number(req.params.id),
      limit: req.query.limit,
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const access = await assertRequirementProjectAccess(req.user, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const row = await queryOne('SELECT * FROM requirements WHERE id = ?', [req.params.id]);
    res.json(mapRequirement(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const projectId = await resolveProjectContext(req, res, true);
    if (!projectId) return;

    const { reqId, title, description, category, priority, status, owner, version } = req.body;
    if (!reqId || !title) return res.status(400).json({ error: 'reqId and title required' });

    const userId = req.user.id;
    const { reqId: resolvedReqId, shiftedCount } = await resolveReqIdForCreate(reqId, userId, projectId);

    const id = await insert(`
      INSERT INTO requirements (project_id, req_id, title, description, category, priority, status, owner, version, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      projectId, resolvedReqId, title, description || '', category || 'General', priority || 'Medium',
      status || 'Draft', owner || '', version || '1.0', userId, userId
    ]);

    const row = await queryOne('SELECT * FROM requirements WHERE id = ?', [id]);
    await logRequirementHistory({
      action: 'create',
      requirementId: id,
      reqId: resolvedReqId,
      changedBy: userId,
      changes: { snapshot: rowToSnapshot(row) },
    });

    res.status(201).json({ ...mapRequirement(row), shiftedCount });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const access = await assertRequirementProjectAccess(req.user, req.params.id, true);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const { id } = req.params;
    const row = access.row ?? await queryOne('SELECT * FROM requirements WHERE id = ?', [id]);

    const userId = req.user.id;
    const { reqId, title, description, category, priority, status, owner, version } = req.body;
    const { reqId: resolvedReqId, shiftedCount } = await resolveReqIdForUpdate(
      Number(id),
      reqId ?? row.req_id,
      row.req_id,
      userId,
      row.project_id
    );

    const before = rowToSnapshot(row);
    const after = bodyToSnapshot(
      { reqId, title, description, category, priority, status, owner, version },
      resolvedReqId
    );
    after.title = title ?? row.title;
    after.description = description ?? row.description;
    after.category = category ?? row.category;
    after.priority = priority ?? row.priority;
    after.status = status ?? row.status;
    after.owner = owner ?? row.owner;
    after.version = version ?? row.version;

    await execute(`
      UPDATE requirements SET
        req_id = ?, title = ?, description = ?, category = ?, priority = ?,
        status = ?, owner = ?, version = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `, [
      resolvedReqId, after.title, after.description,
      after.category, after.priority, after.status,
      after.owner, after.version, userId, now(), id
    ]);

    const changes = diffSnapshots(before, after);
    if (Object.keys(changes).length > 0) {
      await logRequirementHistory({
        action: 'update',
        requirementId: Number(id),
        reqId: after.reqId,
        changedBy: userId,
        changes,
      });
    }

    const updated = await queryOne('SELECT * FROM requirements WHERE id = ?', [id]);
    res.json({ ...mapRequirement(updated), shiftedCount });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const access = await assertRequirementProjectAccess(req.user, req.params.id, true);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const row = await queryOne('SELECT * FROM requirements WHERE id = ?', [req.params.id]);

    const userId = req.user.id;
    await logRequirementHistory({
      action: 'delete',
      requirementId: row.id,
      reqId: row.req_id,
      changedBy: userId,
      changes: { snapshot: rowToSnapshot(row) },
    });

    await execute('DELETE FROM requirements WHERE id = ?', [req.params.id]);
    const renumberedCount = await renumberAllStandardReqIds(userId, row.project_id);
    res.json({ success: true, renumberedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
