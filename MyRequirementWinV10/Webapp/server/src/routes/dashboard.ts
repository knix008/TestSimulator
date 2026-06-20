import { Router } from "express";
import { asyncHandler } from "../asyncHandler";
import { getKnex } from "../db";
import { PRIORITIES, REQUIREMENT_STATUSES, TEST_RUN_STATUSES } from "../enums";
import { col, getTables, readField, readString } from "../schema";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const db = getKnex();
    const t = getTables();

    const totalRequirements = Number((await db(t.requirements).count<{ count: string }[]>("* as count").first())?.count ?? 0);
    const totalTestCases = Number((await db(t.testCases).count<{ count: string }[]>("* as count").first())?.count ?? 0);

    const requirementsWithTests = Number(
      (await db(t.testCases).countDistinct<{ count: string }[]>(`${col("requirementId")} as count`).first())?.count ?? 0
    );

    const priorityRows = await db(t.requirements)
      .select(col("priority"))
      .count<{ priority: number; count: string }[]>("* as count")
      .groupBy(col("priority"));
    const priorityBreakdown = PRIORITIES.map((name, idx) => ({
      name,
      count: Number(priorityRows.find((r) => Number(readField(r, "priority")) === idx)?.count ?? 0)
    }));

    const statusRows = await db(t.requirements)
      .select(col("status"))
      .count<{ status: number; count: string }[]>("* as count")
      .groupBy(col("status"));
    const statusBreakdown = REQUIREMENT_STATUSES.map((name, idx) => ({
      name,
      count: Number(statusRows.find((r) => Number(readField(r, "status")) === idx)?.count ?? 0)
    }));

    const allRuns = await db(t.testRuns).select(col("testCaseId"), col("status"), col("executedUtc"));
    const latestByCase = new Map<string, { status: number; executedUtc: string }>();
    for (const r of allRuns) {
      const testCaseId = readString(r, "testCaseId");
      const executedUtc = readString(r, "executedUtc");
      const status = Number(readField(r, "status") ?? 0);
      const current = latestByCase.get(testCaseId);
      if (!current || new Date(executedUtc) > new Date(current.executedUtc)) {
        latestByCase.set(testCaseId, { status, executedUtc });
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
