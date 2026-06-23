import type { TaskItem } from '../types/project';

const TREE_INDENT_PX = 16;

export function getTreeIndentPx(level: number): number {
  return level * TREE_INDENT_PX;
}

/** Whether a vertical guide should continue below this row at the given ancestor level. */
export function hasSiblingBelowAtLevel(
  tasks: TaskItem[],
  taskIndex: number,
  ancestorLevel: number,
): boolean {
  const task = tasks[taskIndex];
  if (!task) return false;
  for (let i = taskIndex + 1; i < tasks.length; i++) {
    if (tasks[i].indentLevel < ancestorLevel) return false;
    if (tasks[i].indentLevel === ancestorLevel) return true;
  }
  return false;
}

export function hasSiblingBelow(tasks: TaskItem[], taskIndex: number): boolean {
  const level = tasks[taskIndex]?.indentLevel;
  if (level == null) return false;
  for (let i = taskIndex + 1; i < tasks.length; i++) {
    if (tasks[i].indentLevel < level) return false;
    if (tasks[i].indentLevel === level) return true;
  }
  return false;
}

export interface TreeGuideSegment {
  left: number;
  top: 'half' | 'full';
}

export function getTreeGuideSegments(
  tasks: TaskItem[],
  taskIndex: number,
): TreeGuideSegment[] {
  const task = tasks[taskIndex];
  if (!task || task.indentLevel === 0) return [];

  const segments: TreeGuideSegment[] = [];
  const level = task.indentLevel;

  for (let ancestorLevel = 1; ancestorLevel < level; ancestorLevel++) {
    if (hasSiblingBelowAtLevel(tasks, taskIndex, ancestorLevel)) {
      segments.push({
        left: (ancestorLevel - 1) * TREE_INDENT_PX + 7,
        top: 'full',
      });
    }
  }

  segments.push({
    left: (level - 1) * TREE_INDENT_PX + 7,
    top: hasSiblingBelow(tasks, taskIndex) ? 'full' : 'half',
  });

  return segments;
}

export function getTreeNameOffsetPx(task: TaskItem, hasChildRows: boolean): number {
  return getTreeIndentPx(task.indentLevel) + (hasChildRows ? 14 : 0);
}
