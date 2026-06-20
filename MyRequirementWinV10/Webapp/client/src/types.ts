export type DbProvider = "mysql" | "mariadb" | "postgresql" | "sqlite" | "mssql";

export interface ConnectionSettings {
  provider: DbProvider;
  server: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sqliteFilePath: string;
}

export type Priority = "Low" | "Medium" | "High" | "Critical";
export type RequirementStatus = "Draft" | "Approved" | "InProgress" | "Implemented" | "Deprecated";
export type TestRunStatus = "NotRun" | "Pass" | "Fail" | "Blocked";

export interface Requirement {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  status: RequirementStatus;
  source: string;
  parentId: string | null;
  createdUtc: string;
  modifiedUtc: string;
  testCaseCount: number;
}

export interface TestStep {
  testCaseId: string;
  order: number;
  action: string;
  expectedOutcome: string;
}

export interface TestRun {
  id: string;
  testCaseId: string;
  status: TestRunStatus;
  executedUtc: string;
  executedBy: string;
  notes: string;
  buildOrVersion: string;
}

export interface TestCase {
  id: string;
  requirementId: string;
  code: string;
  title: string;
  preconditions: string;
  expectedResult: string;
  steps: TestStep[];
  runs: TestRun[];
}

export interface DashboardData {
  totalRequirements: number;
  totalTestCases: number;
  requirementsWithTests: number;
  coveragePct: number;
  passRatePct: number;
  priorityBreakdown: { name: string; count: number }[];
  statusBreakdown: { name: string; count: number }[];
  runStatusBreakdown: { name: string; count: number }[];
}
