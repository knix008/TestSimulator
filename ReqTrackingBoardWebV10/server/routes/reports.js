import { Router } from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { canAccessProject, parseProjectId } from '../utils/projectAccess.js';

const router = Router();

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    if (!(await canAccessProject(req.user, projectId))) {
      return res.status(403).json({ error: 'Project access denied' });
    }

    const requirements = await query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id) as test_count,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id AND tc.status = 'Passed') as passed,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id AND tc.status = 'Failed') as failed,
        (SELECT COUNT(*) FROM test_cases tc WHERE tc.requirement_id = r.id AND tc.status = 'Not Run') as not_run
      FROM requirements r
      WHERE r.project_id = ?
      ORDER BY r.req_id
    `, [projectId]);

    const testCases = await query(`
      SELECT tc.*, r.req_id, r.title as req_title
      FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id
      WHERE tc.project_id = ?
      ORDER BY tc.tc_id
    `, [projectId]);

    const summary = {
      generatedAt: new Date().toISOString(),
      projectId,
      totalRequirements: requirements.length,
      totalTestCases: testCases.length,
      reqByStatus: groupCount(requirements, 'status'),
      tcByStatus: groupCount(testCases, 'status'),
      requirements: requirements.map(r => ({
        reqId: r.req_id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        category: r.category,
        testCount: r.test_count,
        passed: r.passed,
        failed: r.failed,
        notRun: r.not_run,
      })),
      testCases: testCases.map(tc => ({
        tcId: tc.tc_id,
        reqId: tc.req_id,
        reqTitle: tc.req_title,
        title: tc.title,
        status: tc.status,
        result: tc.result,
        executedBy: tc.executed_by,
        executedAt: tc.executed_at,
      })),
    };

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function groupCount(items, field) {
  const map = {};
  for (const item of items) {
    const key = item[field] || 'Unknown';
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

export default router;
