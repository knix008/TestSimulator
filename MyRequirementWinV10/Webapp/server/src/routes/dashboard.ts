import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { getKnex } from "../db";
import { PRIORITIES, REQUIREMENT_STATUSES, TEST_RUN_STATUSES } from "../enums";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const db = getKnex();

  const totalRequirements = Number((await db("requirements").count<{ count: string }[]>("* as count").first())?.count ?? 0);
  const totalTestCases = Number((await db("test_cases").count<{ count: string }[]>("* as count").first())?.count ?? 0);

  const requirementsWithTests = Number(
    (await db("test_cases").countDistinct<{ count: string }[]>("requirementId as count").first())?.count ?? 0
  );

  const priorityRows = await db("requirements").select("priority").count<{ priority: number; count: string }[]>("* as count").groupBy("priority");
  const priorityBreakdown = PRIORITIES.map((name, idx) => ({
    name,
    count: Number(priorityRows.find((r: any) => r.priority === idx)?.count ?? 0)
  }));

  const statusRows = await db("requirements").select("status").count<{ status: number; count: string }[]>("* as count").groupBy("status");
  const statusBreakdown = REQUIREMENT_STATUSES.map((name, idx) => ({
    name,
    count: Number(statusRows.find((r: any) => r.status === idx)?.count ?? 0)
  }));

  // Latest run per test case, used for coverage/pass-rate calculation. Computed in
  // JS rather than a correlated SQL subquery to stay portable across all 5 dialects.
  const allRuns = await db("test_runs").select("testCaseId", "status", "executedUtc");
  const latestByCase = new Map<string, { status: number; executedUtc: string }>();
  for (const r of allRuns as any[]) {
    const current = latestByCase.get(r.testCaseId);
    if (!current || new Date(r.executedUtc) > new Date(current.executedUtc)) {
      latestByCase.set(r.testCaseId, { status: r.status, executedUtc: r.executedUtc });
    }
  }
  const latestStatuses = Array.from(latestByCase.values()).map((v) => v.status);

  const runStatusBreakdown = TEST_RUN_STATUSES.map((name, idx) => ({
    name,
    count: latestStatuses.filter((s) => s === idx).length
  }));

  const passCount = runStatusBreakdown.find((r) => r.name === "Pass")?.count ?? 0;
  const coveragePct = totalRequirements === 0 ? 0 : (requirementsWithTests / totalRequirements) * 100;
  const passRatePct = totalTestCases === 0 ? 0 : (passCount / totalTestCases) * 100;

  res.json({
    totalRequirements,
    totalTestCases,
    requirementsWithTests,
    coveragePct,
    passRatePct,
    priorityBreakdown,
    statusBreakdown,
    runStatusBreakdown
  });
  })
);

export default router;
