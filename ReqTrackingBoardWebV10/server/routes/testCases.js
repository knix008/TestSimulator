import { Router } from 'express';
import { query, queryOne, insert, execute, now } from '../db.js';
import { authMiddleware, editMiddleware } from '../middleware/auth.js';

const router = Router();

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
    const { requirementId, status } = req.query;
    let sql = `
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id WHERE 1=1
    `;
    const params = [];
    if (requirementId) { sql += ` AND tc.requirement_id = ?`; params.push(requirementId); }
    if (status) { sql += ` AND tc.status = ?`; params.push(status); }
    sql += ` ORDER BY tc.tc_id`;
    const rows = await query(sql, params);
    res.json(rows.map(mapTestCase));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const row = await queryOne(`
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id WHERE tc.id = ?
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Test case not found' });
    res.json(mapTestCase(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, editMiddleware, async (req, res) => {
  try {
    const { tcId, requirementId, title, description, steps, expectedResult, status, result, notes } = req.body;
    if (!tcId || !requirementId || !title) {
      return res.status(400).json({ error: 'tcId, requirementId, and title required' });
    }
    const reqRow = await queryOne('SELECT id FROM requirements WHERE id = ?', [requirementId]);
    if (!reqRow) return res.status(404).json({ error: 'Requirement not found' });

    const existing = await queryOne('SELECT id FROM test_cases WHERE tc_id = ?', [tcId]);
    if (existing) return res.status(409).json({ error: 'Test case ID already exists' });

    const id = await insert(`
      INSERT INTO test_cases (tc_id, requirement_id, title, description, steps, expected_result, status, result, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tcId, requirementId, title, description || '', steps || '', expectedResult || '',
      status || 'Not Run', result || '', notes || ''
    ]);

    const row = await queryOne(`
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id WHERE tc.id = ?
    `, [id]);
    res.status(201).json(mapTestCase(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, editMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne('SELECT * FROM test_cases WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Test case not found' });

    const { tcId, title, description, steps, expectedResult, status, result, executedBy, notes } = req.body;
    if (tcId && tcId !== row.tc_id) {
      const dup = await queryOne('SELECT id FROM test_cases WHERE tc_id = ? AND id != ?', [tcId, id]);
      if (dup) return res.status(409).json({ error: 'Test case ID already exists' });
    }

    const newStatus = status ?? row.status;
    const executedAt = ['Passed', 'Failed', 'Blocked'].includes(newStatus) && newStatus !== row.status
      ? now() : (req.body.executedAt ?? row.executed_at);

    await execute(`
      UPDATE test_cases SET
        tc_id = ?, title = ?, description = ?, steps = ?, expected_result = ?,
        status = ?, result = ?, executed_by = ?, executed_at = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `, [
      tcId ?? row.tc_id, title ?? row.title, description ?? row.description,
      steps ?? row.steps, expectedResult ?? row.expected_result,
      newStatus, result ?? row.result,
      executedBy ?? row.executed_by, executedAt, notes ?? row.notes, now(), id
    ]);

    const updated = await queryOne(`
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id WHERE tc.id = ?
    `, [id]);
    res.json(mapTestCase(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, editMiddleware, async (req, res) => {
  try {
    const result = await execute('DELETE FROM test_cases WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Test case not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
