import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const [reqTotal] = await query('SELECT COUNT(*) as c FROM requirements');
    const reqByStatus = await query('SELECT status, COUNT(*) as count FROM requirements GROUP BY status');
    const reqByPriority = await query('SELECT priority, COUNT(*) as count FROM requirements GROUP BY priority');
    const reqByCategory = await query('SELECT category, COUNT(*) as count FROM requirements GROUP BY category');

    const [tcTotal] = await query('SELECT COUNT(*) as c FROM test_cases');
    const tcByStatus = await query('SELECT status, COUNT(*) as count FROM test_cases GROUP BY status');

    const coverage = await queryOne(`
      SELECT
        COUNT(DISTINCT r.id) as total_reqs,
        COUNT(DISTINCT CASE WHEN tc.id IS NOT NULL THEN r.id END) as reqs_with_tests,
        COUNT(DISTINCT CASE WHEN tc.status = 'Passed' THEN r.id END) as reqs_all_passed
      FROM requirements r
      LEFT JOIN test_cases tc ON tc.requirement_id = r.id
    `);

    const recentActivity = await query(`
      SELECT 'requirement' as type, req_id as ref_id, title, updated_at
      FROM requirements ORDER BY updated_at DESC LIMIT 5
    `);

    const reqStats = {
      total: reqTotal.c,
      byStatus: reqByStatus,
      byPriority: reqByPriority,
      byCategory: reqByCategory,
    };

    const tcStats = {
      total: tcTotal.c,
      byStatus: tcByStatus,
    };

    const passRate = tcStats.total > 0
      ? Math.round((tcStats.byStatus.find(s => s.status === 'Passed')?.count || 0) / tcStats.total * 100)
      : 0;

    res.json({
      requirements: reqStats,
      testCases: tcStats,
      coverage: {
        totalReqs: coverage.total_reqs,
        reqsWithTests: coverage.reqs_with_tests,
        reqsAllPassed: coverage.reqs_all_passed,
        coverageRate: coverage.total_reqs > 0
          ? Math.round(coverage.reqs_with_tests / coverage.total_reqs * 100) : 0,
      },
      passRate,
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
