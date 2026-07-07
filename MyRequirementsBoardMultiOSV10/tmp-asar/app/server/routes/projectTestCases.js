import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { ensureTestCaseCodes } from '../lib/tcCode.js';

const router = Router({ mergeParams: true });

function mapProjectTestCase(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description ?? '',
    steps: row.steps,
    expectedResult: row.expected_result,
    status: row.status,
    requirementId: row.requirement_id,
    requirementCode: row.requirement_code,
    requirementTitle: row.requirement_title,
    requirementClassification: row.requirement_classification,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const { status, q, requirementId } = req.query;

  const db = getDatabase();
  await ensureTestCaseCodes(db);

  let sql = `
    SELECT
      tc.*,
      r.code AS requirement_code,
      r.title AS requirement_title,
      r.classification AS requirement_classification
    FROM test_cases tc
    INNER JOIN requirements r ON r.id = tc.requirement_id
    WHERE r.project_id = ?
  `;
  const params = [projectId];

  if (status) {
    sql += ' AND tc.status = ?';
    params.push(status);
  }
  if (requirementId) {
    sql += ' AND tc.requirement_id = ?';
    params.push(Number(requirementId));
  }
  if (q) {
    sql += ' AND (tc.code LIKE ? OR tc.title LIKE ? OR tc.description LIKE ? OR tc.steps LIKE ? OR tc.expected_result LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  sql += ' ORDER BY r.id ASC, tc.id ASC';

  const rows = await db.prepare(sql).all(...params);
  res.json(rows.map(mapProjectTestCase));
});

export default router;
