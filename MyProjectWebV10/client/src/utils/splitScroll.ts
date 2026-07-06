import { getGanttContentHeightWithNotes } from './ganttNoteLayout';
import type { NoteItem } from '../types/project';

/** Expected scrollable content height for n visible task rows (header + rows + notes). */
export function getSplitContentHeight(taskCount: number, notes: NoteItem[] = []): number {
  return getGanttContentHeightWithNotes(taskCount, notes);
}

/**
 * Keep task grid and gantt vertically aligned.
 * Uses 1:1 scrollTop when both panes share the same row geometry.
 */
export function syncSplitScroll(source: HTMLElement, target: HTMLElement): void {
  const maxTarget = Math.max(0, target.scrollHeight - target.clientHeight);
  target.scrollTop = Math.min(Math.max(0, source.scrollTop), maxTarget);
}
