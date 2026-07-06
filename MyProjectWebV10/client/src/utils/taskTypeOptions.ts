export const EDITABLE_TASK_TYPES = ['Normal', 'Milestone'] as const;
export const ALL_TASK_TYPES = ['Normal', 'Summary', 'Milestone'] as const;

export type TaskTypeValue = (typeof ALL_TASK_TYPES)[number];

export function isTaskTypeValue(value: string): value is TaskTypeValue {
  return (ALL_TASK_TYPES as readonly string[]).includes(value);
}

export function getTaskTypeOptions(includeSummary: boolean): TaskTypeValue[] {
  return includeSummary ? [...ALL_TASK_TYPES] : [...EDITABLE_TASK_TYPES];
}

export function buildTaskTypePatch(
  task: { taskType: string; durationDays: number },
  nextType: TaskTypeValue,
): Partial<{ taskType: string; durationDays: number }> {
  if (task.taskType === nextType) return {};

  if (nextType === 'Milestone') {
    return { taskType: nextType, durationDays: 0 };
  }

  if (task.taskType === 'Milestone') {
    return {
      taskType: nextType,
      durationDays: Math.max(1, task.durationDays || 1),
    };
  }

  return { taskType: nextType };
}
