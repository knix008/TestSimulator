import type { TaskItem } from '../types/project';
import { parseDateInputValue, toDateInputValue } from './taskDateInput';

export interface TaskPropertiesDraft {
  name: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  progress: number;
  taskType: string;
  notes: string;
}

export function taskToPropertiesDraft(task: TaskItem): TaskPropertiesDraft {
  return {
    name: task.name,
    startDate: toDateInputValue(task.startDate),
    endDate: toDateInputValue(task.endDate),
    durationDays: task.taskType === 'Milestone' ? 0 : task.durationDays,
    progress: Math.round(task.progress),
    taskType: task.taskType,
    notes: task.notes ?? '',
  };
}

export function buildTaskPropertiesPatch(
  original: TaskItem,
  draft: TaskPropertiesDraft,
): Partial<TaskItem> {
  const patch: Partial<TaskItem> = {};

  if (draft.name !== original.name) {
    patch.name = draft.name;
  }
  if (draft.notes !== (original.notes ?? '')) {
    patch.notes = draft.notes;
  }
  if (draft.progress !== Math.round(original.progress)) {
    patch.progress = draft.progress;
  }
  if (draft.taskType !== original.taskType) {
    patch.taskType = draft.taskType;
  }

  const originalStart = toDateInputValue(original.startDate);
  const originalEnd = toDateInputValue(original.endDate);
  if (draft.startDate !== originalStart) {
    patch.startDate = parseDateInputValue(draft.startDate).toISOString();
  }
  if (original.taskType !== 'Milestone' && draft.endDate !== originalEnd) {
    patch.endDate = parseDateInputValue(draft.endDate).toISOString();
  }
  if (
    original.taskType !== 'Milestone' &&
    draft.taskType !== 'Milestone' &&
    draft.durationDays !== original.durationDays
  ) {
    patch.durationDays = Math.max(1, draft.durationDays);
  }

  return patch;
}
