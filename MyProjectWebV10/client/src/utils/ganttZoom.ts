import {
  GANTT_MAX_COLUMN_WIDTH,
  GANTT_MIN_COLUMN_WIDTH,
  GANTT_ZOOM_FACTOR,
} from '../config/ganttLayout';

export interface GanttZoomTarget {
  config: { column_width: number };
  dates: { length: number };
  update_options: (options: { column_width: number }) => void;
}

export function clampColumnWidth(width: number): number {
  return Math.min(
    GANTT_MAX_COLUMN_WIDTH,
    Math.max(GANTT_MIN_COLUMN_WIDTH, Math.round(width)),
  );
}

/** Zoom the timeline at the pointer, keeping the date under the cursor stable. */
export function applyGanttZoomAtPointer(
  gantt: GanttZoomTarget,
  scrollContainer: HTMLElement,
  clientX: number,
  zoomIn: boolean,
): number | null {
  const oldWidth = gantt.config.column_width;
  const factor = zoomIn ? GANTT_ZOOM_FACTOR : 1 / GANTT_ZOOM_FACTOR;
  const newWidth = clampColumnWidth(oldWidth * factor);
  if (newWidth === oldWidth) return null;

  const rect = scrollContainer.getBoundingClientRect();
  const pointerInViewport = clientX - rect.left;
  const pointerInContent = pointerInViewport + scrollContainer.scrollLeft;
  const oldTimelineWidth = Math.max(1, gantt.dates.length * oldWidth);
  const anchorRatio = pointerInContent / oldTimelineWidth;

  gantt.update_options({ column_width: newWidth });

  const newTimelineWidth = Math.max(1, gantt.dates.length * newWidth);
  const newPointerInContent = anchorRatio * newTimelineWidth;
  scrollContainer.scrollLeft = Math.max(0, newPointerInContent - pointerInViewport);

  return newWidth;
}
