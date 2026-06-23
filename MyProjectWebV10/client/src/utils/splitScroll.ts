import { GANTT_HEADER_HEIGHT, GANTT_ROW_HEIGHT } from '../config/ganttLayout';

/** Expected scrollable content height for n visible task rows (header + rows). */
export function getSplitContentHeight(taskCount: number): number {
  if (taskCount <= 0) return GANTT_HEADER_HEIGHT;
  return GANTT_HEADER_HEIGHT + taskCount * GANTT_ROW_HEIGHT;
}

/**
 * Keep task grid and gantt vertically aligned.
 * Uses 1:1 scrollTop when both panes share the same row geometry.
 */
export function syncSplitScroll(source: HTMLElement, target: HTMLElement): void {
  const maxTarget = Math.max(0, target.scrollHeight - target.clientHeight);
  target.scrollTop = Math.min(Math.max(0, source.scrollTop), maxTarget);
}
