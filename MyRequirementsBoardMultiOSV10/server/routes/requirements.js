import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { requireProjectEdit } from '../auth/middleware.js';
import { renumberRequirementCodes, tempCode, ensureRequirementCodes } from '../lib/reqCode.js';
import { mapRequirementRow } from '../db/requirementSchema.js';

const router = Router({ mergeParams: true });

function mapRequirement(row, extra = {}) {
  return mapRequirementRow(row, extra);
}

router.get('/', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const { status, priority, q } = req.query;

  const db = getDatabase();
  await ensureRequirementCodes(db, projectId);

  let sql = `
    SELECT r.*, u.name AS created_by_name,
      (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) AS test_case_count
    FROM requirements r
    LEFT JOIN users u ON u.id = r.created_by_id
    WHERE r.project_id = ?
  `;
  const params = [projectId];

  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  if (priority) { sql += ' AND r.priority = ?'; params.push(priority); }
  if (q) {
    sql += ' AND (r.code LIKE ? OR r.classification LIKE ? OR r.title LIKE ? OR r.category LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  sql += ' ORDER BY r.id ASC';

  const rows = await db.prepare(sql).all(...params);
  res.json(rows.map((r) => mapRequirement(r, {
    createdByName: r.created_by_name,
    testCaseCount: r.test_case_count,
  })));
});

router.post('/renumber', requireProjectEdit(), async (req, res) => {
  const projectId = Number(req.params.projectId);
  const db = getDatabase();
  const assigned = await renumberRequirementCodes(db, projectId);
  res.json({ ok: true, count: assigned.length });
});

router.get('/:id', async (req, res) => {
  const db = getDatabase();
  const row = await db.prepare(`
    SELECT r.*, u.name AS created_by_name
    FROM requirements r
    LEFT JOIN users u ON u.id = r.created_by_id
    WHERE r.id = ? AND r.project_id = ?
  `).get(Number(req.params.id), Number(req.params.projectId));

  if (!row) return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });

  const testCases = await db.prepare('SELECT * FROM test_cases WHERE requirement_id = ? ORDER BY id').all(row.id);
  res.json({
    ...mapRequirement(row, { createdByName: row.created_by_name }),
    testCases: testCases.map((tc) => ({
      id: tc.id,
      code: tc.code,
      title: tc.title,
      steps: tc.steps,
      expectedResult: tc.expected_result,
      status: tc.status,
    })),
  });
});

router.post('/', requireProjectEdit(), async (req, res) => {
  const projectId = Number(req.params.projectId);
  const { title, description, category, classification, priority, status } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title은 필수입니다.' });

  const db = getDatabase();
  const result = await db.prepare(
    `INSERT INTO requirements (project_id, code, classification, title, description, category, priority, status, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectId,
    tempCode(),
    classification || '',
    title,
    description || '',
    category || '',
    priority || 'MEDIUM',
    status || 'DRAFT',
    req.session.user.id,
  );

  await renumberRequirementCodes(db, projectId);
  const row = await db.prepare('SELECT * FROM requirements WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(mapRequirement(row));
});

router.put('/:id', requireProjectEdit(), async (req, res) => {
  const projectId = Number(req.params.projectId);
  const id = Number(req.params.id);
  const { title, description, category, classification, priority, status } = req.body || {};

  const db = getDatabase();
  const existing = await db.prepare('SELECT * FROM requirements WHERE id = ? AND project_id = ?').get(id, projectId);
  if (!existing) return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });

  await db.prepare(
    `UPDATE requirements SET title = ?, description = ?, category = ?, classification = ?, priority = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    title ?? existing.title,
    description ?? existing.description,
    category ?? existing.category,
    classification ?? existing.classification,
    priority ?? existing.priority,
    status ?? existing.status,
    id,
  );

  const row = await db.prepare('SELECT * FROM requirements WHERE id = ?').get(id);
  res.json(mapRequirement(row));
});

router.delete('/:id', requireProjectEdit(), async (req, res) => {
  const projectId = Number(req.params.projectId);
  const id = Number(req.params.id);
  const db = getDatabase();

  const existing = await db.prepare('SELECT id FROM requirements WHERE id = ? AND project_id = ?').get(id, projectId);
  if (!existing) return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });

  await db.prepare('DELETE FROM requirements WHERE id = ?').run(id);
  await renumberRequirementCodes(db, projectId);
  res.json({ ok: true });
});

router.delete('/', requireProjectEdit(), async (req, res) => {
  const projectId = Number(req.params.projectId);
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n) => !Number.isNaN(n)) : [];
  if (ids.length === 0) return res.status(400).json({ error: '삭제할 요구사항을 선택하세요.' });

  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(
    `DELETE FROM requirements WHERE project_id = ? AND id IN (${placeholders})`,
  ).run(projectId, ...ids);

  await renumberRequirementCodes(db, projectId);
  res.json({ ok: true, count: result.changes });
});

export default router;
