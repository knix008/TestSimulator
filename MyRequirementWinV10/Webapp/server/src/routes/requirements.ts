import { Router } from "express";
import { v4 as uuid } from "uuid";
import { asyncHandler } from "../asyncHandler";
import { getKnex } from "../db";
import { intToPriority, intToStatus, priorityToInt, statusToInt } from "../enums";
import { Requirement } from "../types";

const router = Router();

function rowToRequirement(row: any): Requirement {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: intToPriority(row.priority),
    status: intToStatus(row.status),
    source: row.source,
    parentId: row.parentId,
    createdUtc: row.createdUtc,
    modifiedUtc: row.modifiedUtc
  };
}

router.get("/", asyncHandler(async (_req, res) => {
  const db = getKnex();
  const rows = await db("requirements").select("*").orderBy("code");
  const requirementIds = rows.map((r: any) => r.id);
  const testCaseCounts = requirementIds.length
    ? await db("test_cases").select("requirementId").count<{ requirementId: string; count: string }[]>("* as count").whereIn("requirementId", requirementIds).groupBy("requirementId")
    : [];
  const countMap = new Map(testCaseCounts.map((r: any) => [r.requirementId, Number(r.count)]));

  res.json(
    rows.map((row: any) => ({
      ...rowToRequirement(row),
      testCaseCount: countMap.get(row.id) ?? 0
    }))
  );
}));

router.post("/", asyncHandler(async (req, res) => {
  const db = getKnex();
  const body = req.body as Partial<Requirement>;
  if (!body.title || !body.title.trim()) {
    res.status(400).json({ error: "Title is required." });
    return;
  }
  const now = new Date().toISOString();
  const id = uuid();
  await db("requirements").insert({
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
  });
  const row = await db("requirements").where({ id }).first();
  res.status(201).json(rowToRequirement(row));
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const db = getKnex();
  const { id } = req.params;
  const existing = await db("requirements").where({ id }).first();
  if (!existing) {
    res.status(404).json({ error: "Requirement not found." });
    return;
  }
  const body = req.body as Partial<Requirement>;
  if (body.title !== undefined && !body.title.trim()) {
    res.status(400).json({ error: "Title is required." });
    return;
  }
  await db("requirements")
    .where({ id })
    .update({
      code: body.code ?? existing.code,
      title: body.title ?? existing.title,
      description: body.description ?? existing.description,
      category: body.category ?? existing.category,
      priority: body.priority ? priorityToInt(body.priority) : existing.priority,
      status: body.status ? statusToInt(body.status) : existing.status,
      source: body.source ?? existing.source,
      parentId: body.parentId === undefined ? existing.parentId : body.parentId,
      modifiedUtc: new Date().toISOString()
    });
  const row = await db("requirements").where({ id }).first();
  res.json(rowToRequirement(row));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const db = getKnex();
  const { id } = req.params;
  const testCaseIds = (await db("test_cases").where({ requirementId: id }).select("id")).map((r: any) => r.id);
  if (testCaseIds.length) {
    await db("test_steps").whereIn("testCaseId", testCaseIds).delete();
    await db("test_runs").whereIn("testCaseId", testCaseIds).delete();
    await db("test_cases").whereIn("id", testCaseIds).delete();
  }
  await db("requirements").where({ id }).delete();
  res.status(204).send();
}));

export default router;
