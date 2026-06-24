export const TASK_GRID_COLUMN_IDS = [
  'id',
  'name',
  'duration',
  'start',
  'end',
  'progress',
  'type',
  'resource',
  'alloc',
  'deliverable',
  'notes',
] as const;

export type TaskGridColumnId = (typeof TASK_GRID_COLUMN_IDS)[number];

export const DEFAULT_TASK_GRID_COLUMN_WIDTHS: Record<TaskGridColumnId, number> = {
  id: 48,
  name: 220,
  duration: 76,
  start: 118,
  end: 118,
  progress: 72,
  type: 88,
  resource: 120,
  alloc: 100,
  deliverable: 120,
  notes: 140,
};

export const MIN_TASK_GRID_COLUMN_WIDTHS: Record<TaskGridColumnId, number> = {
  id: 32,
  name: 120,
  duration: 56,
  start: 90,
  end: 90,
  progress: 56,
  type: 64,
  resource: 80,
  alloc: 72,
  deliverable: 80,
  notes: 80,
};

const STORAGE_KEY = 'myproject.task-grid.column-widths';

export function loadTaskGridColumnWidths(): Record<TaskGridColumnId, number> {
  const defaults = { ...DEFAULT_TASK_GRID_COLUMN_WIDTHS };
  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<Record<TaskGridColumnId, number>>;
    const next = { ...defaults };
    for (const columnId of TASK_GRID_COLUMN_IDS) {
      const value = parsed[columnId];
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[columnId] = Math.max(MIN_TASK_GRID_COLUMN_WIDTHS[columnId], Math.round(value));
      }
    }
    return next;
  } catch {
    return defaults;
  }
}

export function saveTaskGridColumnWidths(widths: Record<TaskGridColumnId, number>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function sumTaskGridColumnWidths(widths: Record<TaskGridColumnId, number>): number {
  return TASK_GRID_COLUMN_IDS.reduce((total, columnId) => total + widths[columnId], 0);
}

export function columnWidthStyle(width: number): { width: number; minWidth: number; maxWidth: number } {
  return { width, minWidth: width, maxWidth: width };
}
