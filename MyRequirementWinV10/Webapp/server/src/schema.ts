import { Knex } from "knex";

/** Logical field names used by the web API (camelCase). */
export type ApiField =
  | "id"
  | "code"
  | "title"
  | "description"
  | "category"
  | "priority"
  | "status"
  | "source"
  | "parentId"
  | "createdUtc"
  | "modifiedUtc"
  | "requirementId"
  | "preconditions"
  | "expectedResult"
  | "testCaseId"
  | "stepOrder"
  | "action"
  | "expectedOutcome"
  | "executedUtc"
  | "executedBy"
  | "notes"
  | "buildOrVersion";

export interface DbTables {
  requirements: string;
  testCases: string;
  testSteps: string;
  testRuns: string;
}

const WEBAPP_COLUMNS: Record<ApiField, string> = {
  id: "id",
  code: "code",
  title: "title",
  description: "description",
  category: "category",
  priority: "priority",
  status: "status",
  source: "source",
  parentId: "parentId",
  createdUtc: "createdUtc",
  modifiedUtc: "modifiedUtc",
  requirementId: "requirementId",
  preconditions: "preconditions",
  expectedResult: "expectedResult",
  testCaseId: "testCaseId",
  stepOrder: "stepOrder",
  action: "action",
  expectedOutcome: "expectedOutcome",
  executedUtc: "executedUtc",
  executedBy: "executedBy",
  notes: "notes",
  buildOrVersion: "buildOrVersion"
};

const DESKTOP_COLUMNS: Record<ApiField, string> = {
  id: "Id",
  code: "Code",
  title: "Title",
  description: "Description",
  category: "Category",
  priority: "Priority",
  status: "Status",
  source: "Source",
  parentId: "ParentId",
  createdUtc: "CreatedUtc",
  modifiedUtc: "ModifiedUtc",
  requirementId: "RequirementId",
  preconditions: "Preconditions",
  expectedResult: "ExpectedResult",
  testCaseId: "TestCaseId",
  stepOrder: "StepOrder",
  action: "Action",
  expectedOutcome: "ExpectedOutcome",
  executedUtc: "ExecutedUtc",
  executedBy: "ExecutedBy",
  notes: "Notes",
  buildOrVersion: "BuildOrVersion"
};

let tables: DbTables = {
  requirements: "requirements",
  testCases: "test_cases",
  testSteps: "test_steps",
  testRuns: "test_runs"
};
let columns: Record<ApiField, string> = WEBAPP_COLUMNS;

async function tableExists(db: Knex, ...names: string[]): Promise<string | null> {
  for (const name of names) {
    if (await db.schema.hasTable(name)) return name;
  }
  return null;
}

async function columnNames(db: Knex, table: string): Promise<string[]> {
  const provider = db.client.config.client as string;
  if (provider === "pg") {
    const result = await db.raw(
      "SELECT column_name FROM information_schema.columns WHERE table_name = ?",
      [table.toLowerCase()]
    );
    return result.rows.map((r: { column_name: string }) => r.column_name);
  }
  if (provider === "mssql") {
    const result = await db.raw(
      "SELECT COLUMN_NAME AS Field FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ?",
      [table]
    );
    return result.map((r: { Field: string }) => r.Field);
  }
  const result = await db.raw(`SHOW COLUMNS FROM ??`, [table]);
  const rows = Array.isArray(result[0]) ? result[0] : result;
  return rows.map((r: { Field: string }) => r.Field);
}

/** Detect desktop (PascalCase) vs webapp (camelCase) tables created by ReqTrace desktop/web. */
export async function initSchema(db: Knex): Promise<void> {
  const requirements = (await tableExists(db, "requirements", "Requirements")) ?? "requirements";
  const reqColumns = await columnNames(db, requirements);
  const isDesktop = reqColumns.includes("Id");

  columns = isDesktop ? DESKTOP_COLUMNS : WEBAPP_COLUMNS;
  tables = {
    requirements,
    testCases:
      (await tableExists(db, "testcases", "TestCases", "test_cases", "testCases")) ??
      (isDesktop ? "testcases" : "test_cases"),
    testSteps:
      (await tableExists(db, "teststeps", "TestSteps", "test_steps", "testSteps")) ??
      (isDesktop ? "teststeps" : "test_steps"),
    testRuns:
      (await tableExists(db, "testruns", "TestRuns", "test_runs", "testRuns")) ??
      (isDesktop ? "testruns" : "test_runs")
  };
}

export function getTables(): DbTables {
  return tables;
}

export function col(field: ApiField): string {
  return columns[field];
}

export function readField(row: Record<string, unknown>, field: ApiField): unknown {
  const physical = columns[field];
  if (physical in row) return row[physical];
  if (field in row) return row[field];
  return undefined;
}

export function readString(row: Record<string, unknown>, field: ApiField): string {
  const value = readField(row, field);
  return value == null ? "" : String(value);
}

export function writeFields(values: Partial<Record<ApiField, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values) as [ApiField, unknown][]) {
    out[columns[field]] = value;
  }
  return out;
}

export function whereField(field: ApiField, value: unknown): Record<string, unknown> {
  return { [columns[field]]: value };
}
