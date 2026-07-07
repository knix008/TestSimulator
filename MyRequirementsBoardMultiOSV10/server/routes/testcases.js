import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import {
  requireRequirementProjectEdit,
  requireRequirementProjectAccess,
} from '../auth/middleware.js';
import { renumberTestCaseCodes, tempTestCaseCode } from '../lib/tcCode.js';

const router = Router({ mergeParams: true });

function mapTestCase(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    steps: row.steps,
    expectedResult: row.expected_result,
    status: row.status,
    requirementId: row.requirement_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', requireRequirementProjectAccess(), async (req, res) => {
  const requirementId = Number(req.params.requirementId);
  const db = getDatabase();
  const rows = await db.prepare('SELECT * FROM test_cases WHERE requirement_id = ? ORDER BY id ASC').all(requirementId);
  res.json(rows.map(mapTestCase));
});

router.post('/renumber', requireRequirementProjectEdit(), async (req, res) => {
  const db = getDatabase();
  const assigned = await renumberTestCaseCodes(db);
  res.json({ ok: true, count: assigned.length });
});

router.post('/', requireRequirementProjectEdit(), async (req, res) => {
  const requirementId = Number(req.params.requirementId);
  const { code, title, steps, expectedResult, status } = req.body || {};
  if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });

  const db = getDatabase();
  const insertCode = String(code || '').trim() || tempTestCaseCode();

  try {
    const result = await db.prepare(
      `INSERT INTO test_cases (code, title, steps, expected_result, status, requirement_id, created_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(insertCode, title, steps || '', expectedResult || '', status || 'NOT_RUN', requirementId, req.session.user.id);

    await renumberTestCaseCodes(db);

    const row = await db.prepare('SELECT * FROM test_cases WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(mapTestCase(row));
  } catch (err) {
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('duplicate')) {
      return res.status(400).json({ error: '이미 사용 중인 테스트 케이스 코드입니다.' });
    }
    throw err;
  }
});

router.put('/:id', requireRequirementProjectEdit(), async (req, res) => {
  const id = Number(req.params.id);
  const { title, steps, expectedResult, status } = req.body || {};
  const db = getDatabase();
  const existing = await db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '테스트 케이스를 찾을 수 없습니다.' });

  await db.prepare(
    `UPDATE test_cases SET title = ?, steps = ?, expected_result = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(
    title ?? existing.title,
    steps ?? existing.steps,
    expectedResult ?? existing.expected_result,
    status ?? existing.status,
    id,
  );

  const row = await db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id);
  res.json(mapTestCase(row));
});

router.delete('/:id', requireRequirementProjectEdit(), async (req, res) => {
  const id = Number(req.params.id);
  const db = getDatabase();
  const result = await db.prepare('DELETE FROM test_cases WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: '테스트 케이스를 찾을 수 없습니다.' });

  await renumberTestCaseCodes(db);
  res.json({ ok: true });
});

export default router;
