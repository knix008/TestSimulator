import { Router } from 'express';
import { query, queryOne, insert, execute, now } from '../db.js';
import { authMiddleware, editMiddleware } from '../middleware/auth.js';

const router = Router();

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
    const { search, status, category } = req.query;
    let sql = `
      SELECT r.*,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) as test_case_count,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id AND tc.status = 'Passed') as passed_count,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id AND tc.status = 'Failed') as failed_count
      FROM requirements r WHERE 1=1
    `;
    const params = [];
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

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM requirements WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Requirement not found' });
    res.json(mapRequirement(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, editMiddleware, async (req, res) => {
  try {
    const { reqId, title, description, category, priority, status, owner, version } = req.body;
    if (!reqId || !title) return res.status(400).json({ error: 'reqId and title required' });

    const existing = await queryOne('SELECT id FROM requirements WHERE req_id = ?', [reqId]);
    if (existing) return res.status(409).json({ error: 'Requirement ID already exists' });

    const id = await insert(`
      INSERT INTO requirements (req_id, title, description, category, priority, status, owner, version, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      reqId, title, description || '', category || 'General', priority || 'Medium',
      status || 'Draft', owner || '', version || '1.0', req.user.id, req.user.id
    ]);

    const row = await queryOne('SELECT * FROM requirements WHERE id = ?', [id]);
    res.status(201).json(mapRequirement(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, editMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const row = await queryOne('SELECT * FROM requirements WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Requirement not found' });

    const { reqId, title, description, category, priority, status, owner, version } = req.body;
    if (reqId && reqId !== row.req_id) {
      const dup = await queryOne('SELECT id FROM requirements WHERE req_id = ? AND id != ?', [reqId, id]);
      if (dup) return res.status(409).json({ error: 'Requirement ID already exists' });
    }

    await execute(`
      UPDATE requirements SET
        req_id = ?, title = ?, description = ?, category = ?, priority = ?,
        status = ?, owner = ?, version = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `, [
      reqId ?? row.req_id, title ?? row.title, description ?? row.description,
      category ?? row.category, priority ?? row.priority, status ?? row.status,
      owner ?? row.owner, version ?? row.version, req.user.id, now(), id
    ]);

    const updated = await queryOne('SELECT * FROM requirements WHERE id = ?', [id]);
    res.json(mapRequirement(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, editMiddleware, async (req, res) => {
  try {
    const result = await execute('DELETE FROM requirements WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Requirement not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
