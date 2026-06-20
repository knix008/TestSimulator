import { Router } from "express";
import { v4 as uuid } from "uuid";
import { asyncHandler } from "../asyncHandler";
import { getKnex } from "../db";
import { intToRunStatus, runStatusToInt } from "../enums";
import { TestCase, TestRun, TestStep } from "../types";

const router = Router();

async function loadTestCase(db: ReturnType<typeof getKnex>, id: string): Promise<TestCase | null> {
  const row = await db("test_cases").where({ id }).first();
  if (!row) return null;
  const steps: TestStep[] = (await db("test_steps").where({ testCaseId: id }).orderBy("stepOrder")).map((s: any) => ({
    testCaseId: s.testCaseId,
    order: s.stepOrder,
    action: s.action,
    expectedOutcome: s.expectedOutcome
  }));
  const runs: TestRun[] = (await db("test_runs").where({ testCaseId: id }).orderBy("executedUtc", "desc")).map((r: any) => ({
    id: r.id,
    testCaseId: r.testCaseId,
    status: intToRunStatus(r.status),
    executedUtc: r.executedUtc,
    executedBy: r.executedBy,
    notes: r.notes,
    buildOrVersion: r.buildOrVersion
  }));
  return {
    id: row.id,
    requirementId: row.requirementId,
    code: row.code,
    title: row.title,
    preconditions: row.preconditions,
    expectedResult: row.expectedResult,
    steps,
    runs
  };
}

// List test cases for a requirement: GET /api/testcases?requirementId=...
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const requirementId = req.query.requirementId as string | undefined;
    if (!requirementId) {
      res.status(400).json({ error: "requirementId query param is required." });
      return;
    }
    const ids = (await db("test_cases").where({ requirementId }).select("id")).map((r: any) => r.id);
    const cases = await Promise.all(ids.map((id: string) => loadTestCase(db, id)));
    res.json(cases.filter(Boolean));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const testCase = await loadTestCase(db, req.params.id);
    if (!testCase) {
      res.status(404).json({ error: "Test case not found." });
      return;
    }
    res.json(testCase);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const body = req.body as Partial<TestCase>;
    if (!body.requirementId) {
      res.status(400).json({ error: "requirementId is required." });
      return;
    }
    if (!body.title || !body.title.trim()) {
      res.status(400).json({ error: "Title is required." });
      return;
    }
    const id = uuid();
    await db("test_cases").insert({
      id,
      requirementId: body.requirementId,
      code: body.code ?? "",
      title: body.title,
      preconditions: body.preconditions ?? "",
      expectedResult: body.expectedResult ?? ""
    });
    if (body.steps?.length) {
      await db("test_steps").insert(
        body.steps.map((s, idx) => ({ testCaseId: id, stepOrder: s.order ?? idx, action: s.action, expectedOutcome: s.expectedOutcome }))
      );
    }
    res.status(201).json(await loadTestCase(db, id));
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const { id } = req.params;
    const existing = await db("test_cases").where({ id }).first();
    if (!existing) {
      res.status(404).json({ error: "Test case not found." });
      return;
    }
    const body = req.body as Partial<TestCase>;
    if (body.title !== undefined && !body.title.trim()) {
      res.status(400).json({ error: "Title is required." });
      return;
    }
    await db("test_cases")
      .where({ id })
      .update({
        code: body.code ?? existing.code,
        title: body.title ?? existing.title,
        preconditions: body.preconditions ?? existing.preconditions,
        expectedResult: body.expectedResult ?? existing.expectedResult
      });

    if (body.steps) {
      await db("test_steps").where({ testCaseId: id }).delete();
      if (body.steps.length) {
        await db("test_steps").insert(
          body.steps.map((s, idx) => ({ testCaseId: id, stepOrder: s.order ?? idx, action: s.action, expectedOutcome: s.expectedOutcome }))
        );
      }
    }

    res.json(await loadTestCase(db, id));
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const { id } = req.params;
    await db("test_steps").where({ testCaseId: id }).delete();
    await db("test_runs").where({ testCaseId: id }).delete();
    await db("test_cases").where({ id }).delete();
    res.status(204).send();
  })
);

router.post(
  "/:id/runs",
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const { id } = req.params;
    const testCase = await db("test_cases").where({ id }).first();
    if (!testCase) {
      res.status(404).json({ error: "Test case not found." });
      return;
    }
    const body = req.body as Partial<TestRun>;
    const runId = uuid();
    await db("test_runs").insert({
      id: runId,
      testCaseId: id,
      status: runStatusToInt(body.status ?? "NotRun"),
      executedUtc: new Date().toISOString(),
      executedBy: body.executedBy ?? "",
      notes: body.notes ?? "",
      buildOrVersion: body.buildOrVersion ?? ""
    });
    res.status(201).json(await loadTestCase(db, id));
  })
);

export default router;
