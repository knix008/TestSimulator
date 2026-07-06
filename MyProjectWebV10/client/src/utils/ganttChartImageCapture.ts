import { GANTT_HEADER_HEIGHT } from '../config/ganttLayout';
import type { NoteItem, TaskItem } from '../types/project';
import {
  GANTT_NOTE_WIDTH,
  getGanttContentHeightWithNotes,
  ganttDateToX,
} from './ganttNoteLayout';
import { expandAllTasksForExport, getVisibleTasks } from './taskModel';

/** Matches Win/server export: a little calendar before the first task. */
export const GANTT_EXPORT_START_MARGIN_DAYS = 3;
/** Matches Win/server export: a little calendar after the last task. */
export const GANTT_EXPORT_END_MARGIN_DAYS = 7;
/** White border around the cropped task area in the exported image. */
export const GANTT_EXPORT_IMAGE_PADDING_PX = 24;

export interface GanttExportContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GanttExportLayout {
  rect: GanttExportContentRect;
  exportStart: Date;
  exportEnd: Date;
  exportTasks: TaskItem[];
  visibleExportTasks: TaskItem[];
}

export interface FrappeGanttExportApi {
  gantt_start: Date;
  gantt_end: Date;
  config: { column_width: number };
  options: { container_height: number | 'auto' };
  $container?: HTMLElement;
  setup_date_values: () => void;
  render: () => void;
  setup_tasks: (tasks: unknown[]) => void;
  change_view_mode: (mode?: unknown, maintain_pos?: boolean) => void;
}

interface SavedInlineStyle {
  element: HTMLElement | SVGElement;
  properties: Record<string, string>;
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

function getTaskDateRange(tasks: TaskItem[]): { minStart: Date; maxEnd: Date } | null {
  if (tasks.length === 0) return null;

  let minStart = startOfDay(new Date(tasks[0].startDate));
  let maxEnd = startOfDay(new Date(tasks[0].endDate));

  for (const task of tasks) {
    const start = startOfDay(new Date(task.startDate));
    const end =
      task.taskType === 'Milestone' ? start : startOfDay(new Date(task.endDate));
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  }

  return { minStart, maxEnd };
}

export function computeGanttExportLayout(
  tasks: TaskItem[],
  notes: NoteItem[],
  columnWidth: number,
): GanttExportLayout | null {
  if (columnWidth <= 0 || tasks.length === 0) return null;

  const exportTasks = expandAllTasksForExport(tasks);
  const visibleExportTasks = getVisibleTasks(exportTasks);
  const range = getTaskDateRange(exportTasks);
  if (!range || visibleExportTasks.length === 0) return null;

  const exportStart = addDays(range.minStart, -GANTT_EXPORT_START_MARGIN_DAYS);
  const exportEnd = addDays(range.maxEnd, GANTT_EXPORT_END_MARGIN_DAYS);
  const dayCount = daysBetween(exportStart, exportEnd) + 1;
  let width = Math.max(columnWidth * 7, dayCount * columnWidth);
  const height = getGanttContentHeightWithNotes(visibleExportTasks.length, notes);

  for (const note of notes) {
    const noteRight =
      ganttDateToX(new Date(note.anchorDate), exportStart, columnWidth) +
      GANTT_NOTE_WIDTH +
      columnWidth * 2;
    width = Math.max(width, noteRight);
  }

  return {
    rect: { x: 0, y: 0, width, height },
    exportStart,
    exportEnd,
    exportTasks,
    visibleExportTasks,
  };
}

/** @deprecated Use computeGanttExportLayout. */
export function computeGanttExportContentRect(
  tasks: TaskItem[],
  notes: NoteItem[],
  _ganttStart: Date,
  columnWidth: number,
): GanttExportContentRect | null {
  return computeGanttExportLayout(tasks, notes, columnWidth)?.rect ?? null;
}

function saveInlineStyle(element: HTMLElement | SVGElement, properties: string[]): SavedInlineStyle {
  const saved: Record<string, string> = {};
  for (const property of properties) {
    saved[property] = element.style.getPropertyValue(property);
  }
  return { element, properties: saved };
}

function restoreInlineStyles(saved: SavedInlineStyle[]): void {
  for (const entry of saved) {
    for (const [property, value] of Object.entries(entry.properties)) {
      if (value) {
        entry.element.style.setProperty(property, value);
      } else {
        entry.element.style.removeProperty(property);
      }
    }
  }
}

function getFrappeScrollContainer(container: HTMLElement): HTMLElement | null {
  return container.querySelector(':scope > .gantt-container');
}

function waitAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export function prepareGanttExportSession(options: {
  scrollArea: HTMLElement;
  container: HTMLElement;
  chartRoot: HTMLElement;
  gantt: FrappeGanttExportApi;
  layout: GanttExportLayout;
  frappeTasks: unknown[];
  transparentBackground: boolean;
}): { restore: () => void } {
  const { scrollArea, container, chartRoot, gantt, layout, frappeTasks, transparentBackground } =
    options;
  const { rect, exportStart, exportEnd } = layout;
  const frappeScroll = getFrappeScrollContainer(container);
  const savedStyles: SavedInlineStyle[] = [];
  const hadTransparentClass = chartRoot.classList.contains('gantt-export-transparent');

  const track = (element: HTMLElement | SVGElement | null | undefined, properties: string[]) => {
    if (!element) return;
    savedStyles.push(saveInlineStyle(element, properties));
  };

  track(scrollArea, [
    'overflow',
    'height',
    'max-height',
    'width',
    'max-width',
    'padding-bottom',
    'background',
  ]);
  track(chartRoot, ['background']);
  track(container, ['overflow', 'width', 'height', 'min-height', 'background']);
  track(frappeScroll, [
    'overflow',
    'width',
    'height',
    'min-width',
    'transform',
    'background',
  ]);

  const overlay = scrollArea.querySelector('.gantt-link-overlay');
  const savedOverlayWidth = overlay instanceof SVGElement ? overlay.getAttribute('width') : null;
  const savedOverlayHeight = overlay instanceof SVGElement ? overlay.getAttribute('height') : null;
  if (overlay instanceof SVGElement) {
    savedStyles.push(saveInlineStyle(overlay, ['transform']));
  }

  const notesLayer = scrollArea.querySelector('.gantt-notes-layer');
  track(notesLayer instanceof HTMLElement ? notesLayer : null, ['transform']);

  const savedGanttStart = new Date(gantt.gantt_start);
  const savedGanttEnd = new Date(gantt.gantt_end);
  const savedContainerHeight = gantt.options.container_height;
  const savedScrollTop = scrollArea.scrollTop;
  const savedFrappeScrollLeft = frappeScroll?.scrollLeft ?? 0;
  const savedGridHeight = gantt.$container?.style.getPropertyValue('--gv-grid-height') ?? '';

  gantt.gantt_start = exportStart;
  gantt.gantt_end = exportEnd;
  gantt.setup_date_values();
  gantt.setup_tasks(frappeTasks);
  gantt.change_view_mode(undefined, true);
  gantt.render();

  gantt.options.container_height = rect.height;
  gantt.$container?.style.setProperty('--gv-grid-height', `${rect.height}px`);
  container.style.minHeight = `${rect.height}px`;

  scrollArea.style.overflow = 'hidden';
  scrollArea.style.height = `${rect.height}px`;
  scrollArea.style.maxHeight = `${rect.height}px`;
  scrollArea.style.width = `${rect.width}px`;
  scrollArea.style.maxWidth = `${rect.width}px`;
  scrollArea.style.paddingBottom = '0';
  scrollArea.style.background = transparentBackground ? 'transparent' : '#ffffff';
  scrollArea.scrollTop = 0;

  chartRoot.style.background = transparentBackground ? 'transparent' : '#ffffff';
  if (transparentBackground) {
    chartRoot.classList.add('gantt-export-transparent');
    applyTransparentExportStyles(chartRoot);
  }

  container.style.overflow = 'hidden';
  container.style.width = `${rect.width}px`;
  container.style.height = `${rect.height}px`;
  container.style.background = transparentBackground ? 'transparent' : '#ffffff';

  if (frappeScroll) {
    frappeScroll.style.overflow = 'hidden';
    frappeScroll.style.width = `${rect.width}px`;
    frappeScroll.style.height = `${rect.height}px`;
    frappeScroll.style.minWidth = `${rect.width}px`;
    frappeScroll.style.transform = 'none';
    frappeScroll.style.background = transparentBackground ? 'transparent' : '#ffffff';
    frappeScroll.scrollLeft = 0;
  }

  if (overlay instanceof SVGElement) {
    overlay.setAttribute('width', String(rect.width));
    overlay.setAttribute('height', String(rect.height));
    overlay.style.transform = 'none';
  }

  if (notesLayer instanceof HTMLElement) {
    notesLayer.style.transform = 'none';
  }

  return {
    restore: () => {
      gantt.gantt_start = savedGanttStart;
      gantt.gantt_end = savedGanttEnd;
      gantt.options.container_height = savedContainerHeight;
      if (savedGridHeight) {
        gantt.$container?.style.setProperty('--gv-grid-height', savedGridHeight);
      } else {
        gantt.$container?.style.removeProperty('--gv-grid-height');
      }

      restoreInlineStyles(savedStyles);
      scrollArea.scrollTop = savedScrollTop;
      if (frappeScroll) {
        frappeScroll.scrollLeft = savedFrappeScrollLeft;
      }

      if (transparentBackground && !hadTransparentClass) {
        chartRoot.classList.remove('gantt-export-transparent');
      }

      if (overlay instanceof SVGElement) {
        if (savedOverlayWidth) overlay.setAttribute('width', savedOverlayWidth);
        else overlay.removeAttribute('width');
        if (savedOverlayHeight) overlay.setAttribute('height', savedOverlayHeight);
        else overlay.removeAttribute('height');
      }
    },
  };
}

function addPaddingToCanvas(
  source: HTMLCanvasElement,
  paddingPx: number,
  transparentBackground: boolean,
): HTMLCanvasElement {
  const padded = document.createElement('canvas');
  padded.width = source.width + paddingPx * 2;
  padded.height = source.height + paddingPx * 2;
  const ctx = padded.getContext('2d');
  if (!ctx) return source;

  if (!transparentBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, padded.width, padded.height);
  }

  ctx.drawImage(source, paddingPx, paddingPx);
  return padded;
}

function applyTransparentExportStyles(root: HTMLElement): void {
  root.classList.add('gantt-export-transparent');

  const transparentFillSelectors = [
    '.grid-background',
    '.grid-row',
    '.holiday-highlight',
    '.side-header',
  ];
  for (const selector of transparentFillSelectors) {
    root.querySelectorAll(selector).forEach((element) => {
      if (element instanceof SVGElement) {
        element.setAttribute('fill', 'transparent');
        if (selector !== '.holiday-highlight') {
          element.setAttribute('stroke', 'transparent');
        }
      } else if (element instanceof HTMLElement) {
        element.style.background = 'transparent';
      }
    });
  }

  root.querySelectorAll('.row-line').forEach((element) => {
    if (element instanceof SVGElement) {
      element.setAttribute('stroke', 'transparent');
    }
  });

  root.querySelectorAll('.upper-text, .lower-text').forEach((element) => {
    if (element instanceof HTMLElement) {
      element.style.background = 'transparent';
      element.style.boxShadow = 'none';
    }
  });

  root.querySelectorAll('.gantt-scroll, .gantt-container, .gantt-notes-layer').forEach((element) => {
    if (element instanceof HTMLElement) {
      element.style.background = 'transparent';
    }
  });
}

function applyExportCloneStyles(
  cloneScroll: HTMLElement,
  rect: GanttExportContentRect,
  transparentBackground: boolean,
): void {
  cloneScroll.style.overflow = 'hidden';
  cloneScroll.style.height = `${rect.height}px`;
  cloneScroll.style.maxHeight = `${rect.height}px`;
  cloneScroll.style.width = `${rect.width}px`;
  cloneScroll.style.maxWidth = `${rect.width}px`;
  cloneScroll.style.paddingBottom = '0';
  cloneScroll.style.background = transparentBackground ? 'transparent' : '#ffffff';

  const chartRoot = cloneScroll.closest('.gantt-chart');
  chartRoot?.querySelector('.gantt-hscroll')?.remove();
  if (chartRoot instanceof HTMLElement) {
    chartRoot.style.background = transparentBackground ? 'transparent' : '#ffffff';
    if (transparentBackground) {
      applyTransparentExportStyles(chartRoot);
    }
  }

  const frappeHost = cloneScroll.querySelector(':scope > .gantt-container');
  if (frappeHost instanceof HTMLElement) {
    frappeHost.style.overflow = 'hidden';
    frappeHost.style.width = `${rect.width}px`;
    frappeHost.style.height = `${rect.height}px`;
    frappeHost.style.background = transparentBackground ? 'transparent' : '#ffffff';
  }

  const frappeScroll = cloneScroll.querySelector(':scope > .gantt-container > .gantt-container');
  if (frappeScroll instanceof HTMLElement) {
    frappeScroll.style.overflow = 'visible';
    frappeScroll.style.transform = 'none';
    frappeScroll.style.width = `${rect.width}px`;
    frappeScroll.style.minWidth = `${rect.width}px`;
    frappeScroll.style.background = transparentBackground ? 'transparent' : '#ffffff';
  }

  for (const selector of ['.gantt-link-overlay', '.gantt-notes-layer']) {
    const target = cloneScroll.querySelector(selector);
    if (target instanceof SVGElement) {
      target.setAttribute('width', String(rect.width));
      target.setAttribute('height', String(rect.height));
      target.style.transform = 'none';
    } else if (target instanceof HTMLElement) {
      target.style.transform = 'none';
      target.style.background = transparentBackground ? 'transparent' : '';
    }
  }

  cloneScroll.querySelectorAll('.grid-header').forEach((header) => {
    if (header instanceof HTMLElement) {
      header.style.height = `${GANTT_HEADER_HEIGHT}px`;
      header.style.minHeight = `${GANTT_HEADER_HEIGHT}px`;
      header.style.maxHeight = `${GANTT_HEADER_HEIGHT}px`;
    }
  });
}

export async function captureGanttChartImage(
  scrollArea: HTMLElement,
  options: {
    rect: GanttExportContentRect;
    scale?: number;
    transparentBackground?: boolean;
  },
): Promise<string> {
  const transparentBackground = options.transparentBackground ?? false;
  const { rect } = options;
  const scale = options.scale ?? 2;
  const padding = GANTT_EXPORT_IMAGE_PADDING_PX;

  await waitAnimationFrames(2);

  const { default: html2canvas } = await import('html2canvas');

  const canvas = await html2canvas(scrollArea, {
    backgroundColor: transparentBackground ? 'rgba(0,0,0,0)' : '#ffffff',
    scale,
    logging: false,
    useCORS: true,
    width: rect.width,
    height: rect.height,
    scrollX: 0,
    scrollY: 0,
    onclone: (doc, clone) => {
      if (transparentBackground) {
        doc.documentElement.style.background = 'transparent';
        doc.body.style.background = 'transparent';
      }
      if (clone instanceof HTMLElement) {
        applyExportCloneStyles(clone, rect, transparentBackground);
      }
    },
  });

  return addPaddingToCanvas(canvas, padding * scale, transparentBackground).toDataURL('image/png');
}

export async function capturePreparedGanttChartImage(options: {
  scrollArea: HTMLElement;
  container: HTMLElement;
  chartRoot: HTMLElement;
  gantt: FrappeGanttExportApi;
  tasks: TaskItem[];
  notes: NoteItem[];
  frappeTasks: unknown[];
  transparentBackground?: boolean;
  scale?: number;
  onPrepared?: () => void;
  onRestored?: () => void;
}): Promise<string> {
  const layout = computeGanttExportLayout(
    options.tasks,
    options.notes,
    options.gantt.config.column_width,
  );
  if (!layout) {
    throw new Error('No tasks to export.');
  }

  const session = prepareGanttExportSession({
    scrollArea: options.scrollArea,
    container: options.container,
    chartRoot: options.chartRoot,
    gantt: options.gantt,
    layout,
    frappeTasks: options.frappeTasks,
    transparentBackground: options.transparentBackground ?? false,
  });

  try {
    options.onPrepared?.();
    await waitAnimationFrames(2);
    return await captureGanttChartImage(options.scrollArea, {
      rect: layout.rect,
      scale: options.scale,
      transparentBackground: options.transparentBackground,
    });
  } finally {
    session.restore();
    options.onRestored?.();
  }
}
