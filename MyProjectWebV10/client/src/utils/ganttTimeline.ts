import type { TaskItem } from '../types/project';

export interface FrappeGanttTimelineApi {
  config: { column_width: number };
  gantt_start: Date;
  gantt_end: Date;
  setup_date_values: () => void;
  render: () => void;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(start: Date, end: Date): number {
  const s = startOfDay(start);
  const e = startOfDay(end);
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000));
}

const MIN_SIDE_MARGIN_DAYS = 30;

/**
 * Extends frappe-gantt timeline so zoom-out shows more calendar days (Win-style viewport),
 * not only task min/max + 7d padding.
 */
export function ensureGanttTimelineRange(
  gantt: FrappeGanttTimelineApi,
  tasks: TaskItem[],
  viewportWidthPx: number,
): boolean {
  if (tasks.length === 0 || viewportWidthPx <= 0) return false;

  const columnWidth = gantt.config.column_width;
  if (columnWidth <= 0) return false;

  let minStart = startOfDay(new Date(tasks[0].startDate));
  let maxEnd = startOfDay(new Date(tasks[0].endDate));
  for (const task of tasks) {
    const start = startOfDay(new Date(task.startDate));
    const end = startOfDay(new Date(task.endDate));
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  }

  const taskSpanDays = daysBetween(minStart, maxEnd) + 1;
  const viewportDays = Math.max(1, Math.ceil(viewportWidthPx / columnWidth));
  const sideMargin = Math.max(MIN_SIDE_MARGIN_DAYS, Math.ceil(viewportDays * 0.15));
  const today = startOfDay(new Date());

  const minTimelineDays = Math.max(taskSpanDays + sideMargin * 2, viewportDays + sideMargin);

  let desiredStart = addDays(minStart, -sideMargin);
  let desiredEnd = addDays(desiredStart, minTimelineDays);
  const minEnd = addDays(maxEnd, sideMargin);
  if (desiredEnd < minEnd) {
    desiredEnd = minEnd;
    desiredStart = addDays(desiredEnd, -minTimelineDays);
    if (desiredStart > addDays(minStart, -sideMargin)) {
      desiredStart = addDays(minStart, -sideMargin);
    }
  }

  if (today < desiredStart) {
    desiredStart = addDays(today, -sideMargin);
  }
  if (today > desiredEnd) {
    desiredEnd = addDays(today, sideMargin);
  }

  const currentStart = startOfDay(gantt.gantt_start);
  const currentEnd = startOfDay(gantt.gantt_end);
  const needsStart = desiredStart < currentStart;
  const needsEnd = desiredEnd > currentEnd;

  if (!needsStart && !needsEnd) return false;

  gantt.gantt_start = needsStart ? desiredStart : currentStart;
  gantt.gantt_end = needsEnd ? desiredEnd : currentEnd;

  if (daysBetween(gantt.gantt_start, gantt.gantt_end) < minTimelineDays) {
    gantt.gantt_end = addDays(gantt.gantt_start, minTimelineDays);
  }

  gantt.setup_date_values();
  gantt.render();
  return true;
}
