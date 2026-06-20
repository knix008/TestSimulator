import { Router } from "express";
import { v4 as uuid } from "uuid";
import { asyncHandler } from "../asyncHandler";
import { requireEditor } from "../auth";
import { getKnex } from "../db";
import { toSqlDateTime } from "../dateTime";
import { intToPriority, intToStatus, priorityToInt, statusToInt } from "../enums";
import { col, getTables, readField, readString, whereField, writeFields } from "../schema";
import { generateTestCases } from "../testCaseGenerator";
import { Requirement } from "../types";

const router = Router();

function rowToRequirement(row: Record<string, unknown>): Requirement {
  return {
    id: readString(row, "id"),
    code: readString(row, "code"),
    title: readString(row, "title"),
    description: readString(row, "description"),
    category: readString(row, "category"),
    priority: intToPriority(Number(readField(row, "priority") ?? 0)),
    status: intToStatus(Number(readField(row, "status") ?? 0)),
    source: readString(row, "source"),
    parentId: (readField(row, "parentId") as string | null | undefined) ?? null,
    createdUtc: readString(row, "createdUtc"),
    modifiedUtc: readString(row, "modifiedUtc")
  };
}

router.get("/", asyncHandler(async (_req, res) => {
  const db = getKnex();
  const t = getTables();
  const rows = await db(t.requirements).select("*").orderBy(col("code"));
  const requirementIds = rows.map((r) => readString(r, "id")).filter(Boolean);
  const testCaseCounts = requirementIds.length
    ? await db(t.testCases)
        .select(col("requirementId"))
        .count("* as count")
        .whereIn(col("requirementId"), requirementIds)
        .groupBy(col("requirementId"))
    : [];
  const countMap = new Map(
    testCaseCounts.map((r) => [readString(r as Record<string, unknown>, "requirementId"), Number((r as { count: string | number }).count)])
  );

  res.json(
    rows.map((row) => ({
      ...rowToRequirement(row),
      testCaseCount: countMap.get(readString(row, "id")) ?? 0
    }))
  );
}));

router.post("/", requireEditor, asyncHandler(async (req, res) => {
  const db = getKnex();
  const t = getTables();
  const body = req.body as Partial<Requirement>;
  if (!body.title || !body.title.trim()) {
    res.status(400).json({ error: "Title is required." });
    return;
  }
  const now = toSqlDateTime();
  const id = uuid();
  await db(t.requirements).insert(
    writeFields({
      id,
      code: body.code ?? "",
      title: body.title,
      description: body.description ?? "",
      category: body.category ?? "",
      priority: priorityToInt(body.priority ?? "Medium"),
      status: statusToInt(body.status ?? "Draft"),
      source: body.source ?? "",
      parentId: body.parentId ?? null,
      createdUtc: now,
      modifiedUtc: now
    })
  );
  const row = await db(t.requirements).where(whereField("id", id)).first();
  res.status(201).json(rowToRequirement(row));
}));

router.put("/:id", requireEditor, asyncHandler(async (req, res) => {
  const db = getKnex();
  const t = getTables();
  const { id } = req.params;
  const existing = await db(t.requirements).where(whereField("id", id)).first();
  if (!existing) {
    res.status(404).json({ error: "Requirement not found." });
    return;
  }
  const body = req.body as Partial<Requirement>;
  if (body.title !== undefined && !body.title.trim()) {
    res.status(400).json({ error: "Title is required." });
    return;
  }
  await db(t.requirements)
    .where(whereField("id", id))
    .update(
      writeFields({
        code: body.code ?? readString(existing, "code"),
        title: body.title ?? readString(existing, "title"),
        description: body.description ?? readString(existing, "description"),
        category: body.category ?? readString(existing, "category"),
        priority: body.priority ? priorityToInt(body.priority) : Number(readField(existing, "priority")),
        status: body.status ? statusToInt(body.status) : Number(readField(existing, "status")),
        source: body.source ?? readString(existing, "source"),
        parentId: body.parentId === undefined ? readField(existing, "parentId") : body.parentId,
        modifiedUtc: toSqlDateTime()
      })
    );
  const row = await db(t.requirements).where(whereField("id", id)).first();
  res.json(rowToRequirement(row));
}));

router.post("/:id/generate-testcases", requireEditor, asyncHandler(async (req, res) => {
  const db = getKnex();
  const t = getTables();
  const { id } = req.params;
  const requirement = await db(t.requirements).where(whereField("id", id)).first();
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found." });
    return;
  }

  const generated = generateTestCases({
    code: readString(requirement, "code"),
    title: readString(requirement, "title"),
    description: readString(requirement, "description"),
    priority: intToPriority(Number(readField(requirement, "priority") ?? 0))
  });

  const created: string[] = [];
  for (const tc of generated) {
    const testCaseId = uuid();
    await db(t.testCases).insert(
      writeFields({
        id: testCaseId,
        requirementId: id,
        code: tc.code,
        title: tc.title,
        preconditions: tc.preconditions,
        expectedResult: tc.expectedResult
      })
    );
    if (tc.steps.length) {
      await db(t.testSteps).insert(
        tc.steps.map((s) =>
          writeFields({
            testCaseId,
            stepOrder: s.order,
            action: s.action,
            expectedOutcome: s.expectedOutcome
          })
        )
      );
    }
    created.push(testCaseId);
  }

  res.status(201).json({ createdCount: created.length, testCaseIds: created });
}));

router.delete("/:id", requireEditor, asyncHandler(async (req, res) => {
  const db = getKnex();
  const t = getTables();
  const { id } = req.params;
  const testCaseIds = (await db(t.testCases).where(whereField("requirementId", id)).select(col("id"))).map((r) =>
    readString(r, "id")
  );
  if (testCaseIds.length) {
    await db(t.testSteps).whereIn(col("testCaseId"), testCaseIds).delete();
    await db(t.testRuns).whereIn(col("testCaseId"), testCaseIds).delete();
    await db(t.testCases).whereIn(col("id"), testCaseIds).delete();
  }
  await db(t.requirements).where(whereField("id", id)).delete();
  res.status(204).send();
}));

export default router;
