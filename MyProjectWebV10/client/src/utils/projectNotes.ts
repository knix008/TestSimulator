import { GANTT_HEADER_HEIGHT } from '../config/ganttLayout';
import type { NoteItem, TaskItem } from '../types/project';
import { getDefaultNoteContentY } from './ganttNoteLayout';
import { getVisibleTasks } from './taskModel';

export function nextNoteId(notes: NoteItem[]): number {
  return notes.reduce((max, note) => Math.max(max, note.noteId), 0) + 1;
}

export function createNoteForTask(
  noteId: number,
  taskId: number,
  task: TaskItem,
  tasks: TaskItem[],
  body?: string,
): NoteItem {
  const endDate = new Date(task.endDate);
  endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(0, 0, 0, 0);

  return {
    noteId,
    title: 'New Note',
    body: body ?? task.notes ?? '',
    bodyRtf: '',
    taskId,
    offsetDays: 0,
    anchorDate: endDate.toISOString(),
    contentY: getDefaultNoteContentY(taskId, tasks),
    contentX: 0,
  };
}

export function syncTaskNotesFromLinkedNote(
  taskId: number,
  notes: NoteItem[],
  tasks: TaskItem[],
): TaskItem[] {
  const linked = notes.find((note) => note.taskId === taskId);
  const nextNotes = linked?.body ?? '';
  return tasks.map((task) =>
    task.taskId === taskId && task.notes !== nextNotes
      ? { ...task, notes: nextNotes }
      : task,
  );
}

export function updateNoteBodyInProject(
  notes: NoteItem[],
  noteId: number,
  body: string,
): NoteItem[] {
  return notes.map((note) =>
    note.noteId === noteId ? { ...note, body, bodyRtf: '' } : note,
  );
}

export function updateNotePositionInProject(
  notes: NoteItem[],
  noteId: number,
  anchorDate: string,
  contentY: number,
): NoteItem[] {
  return notes.map((note) =>
    note.noteId === noteId ? { ...note, anchorDate, contentY } : note,
  );
}

export function removeNoteFromProject(notes: NoteItem[], noteId: number): NoteItem[] {
  return notes.filter((note) => note.noteId !== noteId);
}

export function removeNotesForTaskIds(notes: NoteItem[], taskIds: Set<number>): NoteItem[] {
  return notes.filter((note) => !taskIds.has(note.taskId));
}

export function getTaskBarContentRect(
  taskId: number,
  container: HTMLElement,
): { left: number; top: number; width: number; height: number } | null {
  const wrapper = container.querySelector(`.bar-wrapper[data-id="${taskId}"]`);
  const bar = wrapper?.querySelector('.bar');
  if (!bar || !(bar instanceof SVGGraphicsElement)) return null;

  const frappeHost = container.querySelector(':scope > .gantt-container');
  if (!(frappeHost instanceof HTMLElement)) return null;

  const hostRect = frappeHost.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  return {
    left: barRect.left - hostRect.left + frappeHost.scrollLeft,
    top: barRect.top - hostRect.top + frappeHost.scrollTop,
    width: barRect.width,
    height: barRect.height,
  };
}

export function getDefaultNoteAnchorForEmptyChart(): NoteItem {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    noteId: 0,
    title: 'New Note',
    body: '',
    bodyRtf: '',
    taskId: -1,
    offsetDays: 0,
    anchorDate: today.toISOString(),
    contentY: GANTT_HEADER_HEIGHT,
    contentX: 0,
  };
}

export function getVisibleTaskRowIndex(taskId: number, tasks: TaskItem[]): number {
  return getVisibleTasks(tasks).findIndex((task) => task.taskId === taskId);
}
