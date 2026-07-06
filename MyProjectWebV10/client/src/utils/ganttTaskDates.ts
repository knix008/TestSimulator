import type { TaskItem } from '../types/project';
import { toDateInputValue } from './taskDateInput';

export function parseLocalDateString(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Stored schedule duration for milestones (zero-duration). */
export const MILESTONE_DURATION_DAYS = 0;

/** Visual/interaction span on the Gantt chart (inclusive calendar days). */
export const MILESTONE_CHART_DURATION_DAYS = 1;

/** ISO schedule date → local YYYY-MM-DD for Frappe Gantt (avoids UTC slice drift). */
export function toGanttDateString(iso: string): string {
  return toDateInputValue(iso);
}

/** Local calendar day from a Frappe drag Date (avoids UTC midnight drift). */
export function localDayFromFrappeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Frappe Gantt treats the end date as the last calendar day of the task
 * (midnight is extended to end-of-day). Milestones are stored as 0-day tasks
 * but use the same start/end day here so the chart shows a 1-day bar.
 */
export function toFrappeGanttEndDate(task: TaskItem): string {
  const start = toGanttDateString(task.startDate);
  if (task.taskType === 'Milestone') {
    return start;
  }
  return toGanttDateString(task.endDate);
}
