import { Priority, RequirementStatus, TestRunStatus } from "./types";

export const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
export const REQUIREMENT_STATUSES: RequirementStatus[] = ["Draft", "Approved", "InProgress", "Implemented", "Deprecated"];
export const TEST_RUN_STATUSES: TestRunStatus[] = ["NotRun", "Pass", "Fail", "Blocked"];

export function priorityToInt(value: Priority): number {
  return PRIORITIES.indexOf(value);
}
export function intToPriority(value: number): Priority {
  return PRIORITIES[value] ?? "Medium";
}

export function statusToInt(value: RequirementStatus): number {
  return REQUIREMENT_STATUSES.indexOf(value);
}
export function intToStatus(value: number): RequirementStatus {
  return REQUIREMENT_STATUSES[value] ?? "Draft";
}

export function runStatusToInt(value: TestRunStatus): number {
  return TEST_RUN_STATUSES.indexOf(value);
}
export function intToRunStatus(value: number): TestRunStatus {
  return TEST_RUN_STATUSES[value] ?? "NotRun";
}
