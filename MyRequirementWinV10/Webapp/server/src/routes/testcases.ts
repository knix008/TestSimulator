import { Router } from "express";
import { v4 as uuid } from "uuid";
import { asyncHandler } from "../asyncHandler";
import { requireEditor } from "../auth";
import { getKnex } from "../db";
import { toSqlDateTime } from "../dateTime";
import { intToRunStatus, runStatusToInt } from "../enums";
import { col, getTables, readField, readString, whereField, writeFields } from "../schema";
import { TestCase, TestRun, TestStep } from "../types";

const router = Router();

async function loadTestCase(db: ReturnType<typeof getKnex>, id: string): Promise<TestCase | null> {
  const t = getTables();
  const row = await db(t.testCases).where(whereField("id", id)).first();
  if (!row) return null;
  const steps: TestStep[] = (await db(t.testSteps).where(whereField("testCaseId", id)).orderBy(col("stepOrder"))).map(
    (s) => ({
      testCaseId: readString(s, "testCaseId"),
      order: Number(readField(s, "stepOrder") ?? 0),
      action: readString(s, "action"),
      expectedOutcome: readString(s, "expectedOutcome")
    })
  );
  const runs: TestRun[] = (await db(t.testRuns).where(whereField("testCaseId", id)).orderBy(col("executedUtc"), "desc")).map(
    (r) => ({
      id: readString(r, "id"),
      testCaseId: readString(r, "testCaseId"),
      status: intToRunStatus(Number(readField(r, "status") ?? 0)),
      executedUtc: readString(r, "executedUtc"),
      executedBy: readString(r, "executedBy"),
      notes: readString(r, "notes"),
      buildOrVersion: readString(r, "buildOrVersion")
    })
  );
  return {
    id: readString(row, "id"),
    requirementId: readString(row, "requirementId"),
    code: readString(row, "code"),
    title: readString(row, "title"),
    preconditions: readString(row, "preconditions"),
    expectedResult: readString(row, "expectedResult"),
    steps,
    runs
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const t = getTables();
    const requirementId = req.query.requirementId as string | undefined;
    if (!requirementId) {
      res.status(400).json({ error: "requirementId query param is required." });
      return;
    }
    const ids = (await db(t.testCases).where(whereField("requirementId", requirementId)).select(col("id"))).map((r) =>
      readString(r, "id")
    );
    const cases = await Promise.all(ids.map((id) => loadTestCase(db, id)));
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
  requireEditor,
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const t = getTables();
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
    await db(t.testCases).insert(
      writeFields({
        id,
        requirementId: body.requirementId,
        code: body.code ?? "",
        title: body.title,
        preconditions: body.preconditions ?? "",
        expectedResult: body.expectedResult ?? ""
      })
    );
    if (body.steps?.length) {
      await db(t.testSteps).insert(
        body.steps.map((s, idx) =>
          writeFields({
            testCaseId: id,
            stepOrder: s.order ?? idx,
            action: s.action,
            expectedOutcome: s.expectedOutcome
          })
        )
      );
    }
    res.status(201).json(await loadTestCase(db, id));
  })
);

router.put(
  "/:id",
  requireEditor,
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const t = getTables();
    const { id } = req.params;
    const existing = await db(t.testCases).where(whereField("id", id)).first();
    if (!existing) {
      res.status(404).json({ error: "Test case not found." });
      return;
    }
    const body = req.body as Partial<TestCase>;
    if (body.title !== undefined && !body.title.trim()) {
      res.status(400).json({ error: "Title is required." });
      return;
    }
    await db(t.testCases)
      .where(whereField("id", id))
      .update(
        writeFields({
          code: body.code ?? readString(existing, "code"),
          title: body.title ?? readString(existing, "title"),
          preconditions: body.preconditions ?? readString(existing, "preconditions"),
          expectedResult: body.expectedResult ?? readString(existing, "expectedResult")
        })
      );

    if (body.steps) {
      await db(t.testSteps).where(whereField("testCaseId", id)).delete();
      if (body.steps.length) {
        await db(t.testSteps).insert(
          body.steps.map((s, idx) =>
            writeFields({
              testCaseId: id,
              stepOrder: s.order ?? idx,
              action: s.action,
              expectedOutcome: s.expectedOutcome
            })
          )
        );
      }
    }

    res.json(await loadTestCase(db, id));
  })
);

router.delete(
  "/:id",
  requireEditor,
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const t = getTables();
    const { id } = req.params;
    await db(t.testSteps).where(whereField("testCaseId", id)).delete();
    await db(t.testRuns).where(whereField("testCaseId", id)).delete();
    await db(t.testCases).where(whereField("id", id)).delete();
    res.status(204).send();
  })
);

router.post(
  "/:id/runs",
  requireEditor,
  asyncHandler(async (req, res) => {
    const db = getKnex();
    const t = getTables();
    const { id } = req.params;
    const testCase = await db(t.testCases).where(whereField("id", id)).first();
    if (!testCase) {
      res.status(404).json({ error: "Test case not found." });
      return;
    }
    const body = req.body as Partial<TestRun>;
    const runId = uuid();
    await db(t.testRuns).insert(
      writeFields({
        id: runId,
        testCaseId: id,
        status: runStatusToInt(body.status ?? "NotRun"),
        executedUtc: toSqlDateTime(),
        executedBy: body.executedBy ?? "",
        notes: body.notes ?? "",
        buildOrVersion: body.buildOrVersion ?? ""
      })
    );
    res.status(201).json(await loadTestCase(db, id));
  })
);

export default router;
