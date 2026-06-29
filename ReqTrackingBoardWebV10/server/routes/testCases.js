import { Router } from 'express';
import { query, queryOne, insert, execute, now } from '../db.js';
import { authMiddleware, editMiddleware } from '../middleware/auth.js';
import {
  getNextStandardTcId,
  resolveTcIdForCreate,
  resolveTcIdForUpdate,
  renumberAllStandardTcIds,
} from '../utils/tcId.js';
import {
  canAccessProject,
  canEditProjectContent,
  assertTestCaseProjectAccess,
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

function mapTestCase(row) {
  return {
    id: row.id,
    tcId: row.tc_id,
    requirementId: row.requirement_id,
    reqId: row.req_id,
    title: row.title,
    description: row.description,
    steps: row.steps,
    expectedResult: row.expected_result,
    status: row.status,
    result: row.result,
    executedBy: row.executed_by,
    executedAt: row.executed_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const projectId = await resolveProjectContext(req, res);
    if (!projectId) return;

    const { requirementId, status } = req.query;
    let sql = `
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id
      WHERE r.project_id = ?
    `;
    const params = [projectId];
    if (requirementId) { sql += ` AND tc.requirement_id = ?`; params.push(requirementId); }
    if (status) { sql += ` AND tc.status = ?`; params.push(status); }
    sql += ` ORDER BY tc.tc_id`;
    const rows = await query(sql, params);
    res.json(rows.map(mapTestCase));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/next-id', authMiddleware, async (req, res) => {
  try {
    const projectId = await resolveProjectContext(req, res);
    if (!projectId) return;
    const tcId = await getNextStandardTcId(projectId);
    res.json({ tcId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const access = await assertTestCaseProjectAccess(req.user, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const row = await queryOne(`
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id WHERE tc.id = ?
    `, [req.params.id]);
    res.json(mapTestCase(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { tcId, requirementId, title, description, steps, expectedResult, status, result, notes } = req.body;
    if (!requirementId || !title) {
      return res.status(400).json({ error: 'requirementId and title required' });
    }

    const reqAccess = await assertRequirementProjectAccess(req.user, requirementId, true);
    if (!reqAccess.ok) return res.status(reqAccess.status).json({ error: reqAccess.error });
    const projectId = reqAccess.projectId;

    const { tcId: resolvedTcId, shiftedCount } = await resolveTcIdForCreate(tcId, projectId);

    const id = await insert(`
      INSERT INTO test_cases (project_id, tc_id, requirement_id, title, description, steps, expected_result, status, result, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      projectId, resolvedTcId, requirementId, title, description || '', steps || '', expectedResult || '',
      status || 'Not Run', result || '', notes || ''
    ]);

    const row = await queryOne(`
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id WHERE tc.id = ?
    `, [id]);
    res.status(201).json({ ...mapTestCase(row), shiftedCount });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const access = await assertTestCaseProjectAccess(req.user, req.params.id, true);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const { id } = req.params;
    const row = await queryOne('SELECT * FROM test_cases WHERE id = ?', [id]);

    const { tcId, title, description, steps, expectedResult, status, result, executedBy, notes } = req.body;
    const { tcId: resolvedTcId, shiftedCount } = await resolveTcIdForUpdate(
      Number(id),
      tcId ?? row.tc_id,
      row.tc_id,
      row.project_id
    );

    const newStatus = status ?? row.status;
    const executedAt = ['Passed', 'Failed', 'Blocked'].includes(newStatus) && newStatus !== row.status
      ? now() : (req.body.executedAt ?? row.executed_at);

    await execute(`
      UPDATE test_cases SET
        tc_id = ?, title = ?, description = ?, steps = ?, expected_result = ?,
        status = ?, result = ?, executed_by = ?, executed_at = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `, [
      resolvedTcId, title ?? row.title, description ?? row.description,
      steps ?? row.steps, expectedResult ?? row.expected_result,
      newStatus, result ?? row.result,
      executedBy ?? row.executed_by, executedAt, notes ?? row.notes, now(), id
    ]);

    const updated = await queryOne(`
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id WHERE tc.id = ?
    `, [id]);
    res.json({ ...mapTestCase(updated), shiftedCount });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const access = await assertTestCaseProjectAccess(req.user, req.params.id, true);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const row = await queryOne('SELECT project_id FROM test_cases WHERE id = ?', [req.params.id]);
    const result = await execute('DELETE FROM test_cases WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Test case not found' });
    const renumberedCount = await renumberAllStandardTcIds(null, row?.project_id);
    res.json({ success: true, renumberedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
