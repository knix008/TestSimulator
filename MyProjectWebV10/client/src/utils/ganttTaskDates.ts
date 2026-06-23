import type { TaskItem } from '../types/project';

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

/**
 * Frappe Gantt uses an exclusive end date (loop: start <= d < end).
 * MyProject stores an inclusive end date — convert for the chart.
 */
export function toFrappeGanttEndDate(task: TaskItem): string {
  const start = task.startDate.slice(0, 10);
  if (task.taskType === 'Milestone') {
    return start;
  }

  const endInclusive = parseLocalDateString(task.endDate.slice(0, 10));
  const exclusive = new Date(endInclusive);
  exclusive.setDate(exclusive.getDate() + 1);
  return formatLocalDateString(exclusive);
}
