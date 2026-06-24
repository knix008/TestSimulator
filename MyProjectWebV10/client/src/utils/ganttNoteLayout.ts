import { GANTT_HEADER_HEIGHT, GANTT_ROW_HEIGHT } from '../config/ganttLayout';
import type { TaskItem } from '../types/project';
import { getVisibleTasks } from './taskModel';

export const GANTT_NOTE_WIDTH = 104;
export const GANTT_NOTE_HEIGHT = 58;
export const GANTT_NOTE_DRAG_THRESHOLD = 4;

export interface GanttPoint {
  x: number;
  y: number;
}

export interface GanttRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function ganttDateToX(anchorDate: Date, ganttStart: Date, columnWidth: number): number {
  const diffMs = startOfDay(anchorDate).getTime() - startOfDay(ganttStart).getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  return diffDays * columnWidth;
}

export function ganttXToDate(x: number, ganttStart: Date, columnWidth: number): Date {
  const days = Math.round(x / columnWidth);
  const next = startOfDay(ganttStart);
  next.setDate(next.getDate() + days);
  return next;
}

export function getDefaultNoteContentY(taskId: number, tasks: TaskItem[]): number {
  const visible = getVisibleTasks(tasks);
  const idx = visible.findIndex((task) => task.taskId === taskId);
  if (idx < 0) return GANTT_HEADER_HEIGHT;
  return GANTT_HEADER_HEIGHT + idx * GANTT_ROW_HEIGHT;
}

export function getNoteRect(
  anchorDate: string,
  contentY: number,
  ganttStart: Date,
  columnWidth: number,
): GanttRect {
  return {
    left: ganttDateToX(new Date(anchorDate), ganttStart, columnWidth),
    top: contentY,
    width: GANTT_NOTE_WIDTH,
    height: GANTT_NOTE_HEIGHT,
  };
}

function getRectCenter(rect: GanttRect): GanttPoint {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function getRectEdgePoint(rect: GanttRect, target: GanttPoint): GanttPoint {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;

  if (rect.width <= 0 || rect.height <= 0) {
    return { x: cx, y: cy };
  }

  if (Math.abs(dx) * rect.height > Math.abs(dy) * rect.width) {
    return dx >= 0
      ? { x: rect.left + rect.width, y: cy }
      : { x: rect.left, y: cy };
  }

  return dy >= 0
    ? { x: cx, y: rect.top + rect.height }
    : { x: cx, y: rect.top };
}

export function getNoteConnectorPoints(
  noteRect: GanttRect,
  taskBarRect: GanttRect,
): { from: GanttPoint; to: GanttPoint } {
  const noteCenter = getRectCenter(noteRect);
  const barCenter = getRectCenter(taskBarRect);
  return {
    from: getRectEdgePoint(taskBarRect, noteCenter),
    to: getRectEdgePoint(noteRect, barCenter),
  };
}

export function getNoteDisplayText(body: string, bodyRtf: string): string {
  const plain = body.trim();
  if (plain) return plain;
  if (!bodyRtf.trim()) return '';
  return bodyRtf.replace(/\\par\b/g, '\n').replace(/[{}\\]/g, '').trim();
}
