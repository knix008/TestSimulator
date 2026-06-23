import type { DependencyItem, TaskItem } from '../types/project';
import { computeEndDate, startOfDay } from './scheduleUtils';
import { countWorkingDaysInclusive } from './workingDayCalendar';
import { parseWorkingWeek, type WorkingWeek } from './workingWeek';

export function nextTaskId(tasks: TaskItem[]): number {
  if (tasks.length === 0) return 1;
  return Math.max(...tasks.map((t) => t.taskId)) + 1;
}

export function getInsertIndexAfterSubtree(tasks: TaskItem[], taskId: number): number {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx < 0) return tasks.length;

  const level = tasks[idx].indentLevel;
  let insertIdx = idx + 1;
  while (insertIdx < tasks.length && tasks[insertIdx].indentLevel > level) {
    insertIdx++;
  }
  return insertIdx;
}

export function getSubtreeTaskIds(tasks: TaskItem[], taskId: number): number[] {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx < 0) return [];

  const level = tasks[idx].indentLevel;
  const ids: number[] = [];
  for (let i = idx; i < tasks.length; i++) {
    if (i > idx && tasks[i].indentLevel <= level) break;
    ids.push(tasks[i].taskId);
  }
  return ids;
}

function getParentId(tasks: TaskItem[], index: number): number {
  const level = tasks[index].indentLevel;
  if (level === 0) return -1;
  for (let i = index - 1; i >= 0; i--) {
    if (tasks[i].indentLevel < level) return tasks[i].taskId;
  }
  return -1;
}

function hasChildren(tasks: TaskItem[], taskId: number): boolean {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx < 0) return false;
  const level = tasks[idx].indentLevel;
  return idx + 1 < tasks.length && tasks[idx + 1].indentLevel > level;
}

export function taskHasChildren(tasks: TaskItem[], taskId: number): boolean {
  return hasChildren(tasks, taskId);
}

export function getParentTask(tasks: TaskItem[], taskId: number): TaskItem | null {
  const task = tasks.find((t) => t.taskId === taskId);
  if (!task || task.parentId < 0) return null;
  return tasks.find((t) => t.taskId === task.parentId) ?? null;
}

export function isTaskVisible(tasks: TaskItem[], taskId: number): boolean {
  const task = tasks.find((t) => t.taskId === taskId);
  if (!task) return false;
  let parentId = task.parentId;
  while (parentId >= 0) {
    const parent = tasks.find((t) => t.taskId === parentId);
    if (!parent) break;
    if (!parent.isExpanded) return false;
    parentId = parent.parentId;
  }
  return true;
}

export function getVisibleTasks(tasks: TaskItem[]): TaskItem[] {
  return tasks.filter((task) => isTaskVisible(tasks, task.taskId));
}

function getAllDescendants(tasks: TaskItem[], taskId: number): TaskItem[] {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx < 0) return [];
  const level = tasks[idx].indentLevel;
  const descendants: TaskItem[] = [];
  for (let i = idx + 1; i < tasks.length; i++) {
    if (tasks[i].indentLevel <= level) break;
    descendants.push(tasks[i]);
  }
  return descendants;
}

function rollupSummaryTask(task: TaskItem, tasks: TaskItem[], week?: WorkingWeek): TaskItem {
  const descendants = getAllDescendants(tasks, task.taskId);
  if (descendants.length === 0) return task;

  const minStartMs = Math.min(...descendants.map((d) => new Date(d.startDate).getTime()));
  const maxEndMs = Math.max(...descendants.map((d) => new Date(d.endDate).getTime()));
  const start = startOfDay(new Date(minStartMs));
  const end = startOfDay(new Date(maxEndMs));
  const startDate = start.toISOString();
  const durationDays = week
    ? Math.max(1, countWorkingDaysInclusive(start, end, week))
    : Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
      );

  let totalWeight = 0;
  let weightedProgress = 0;
  for (const child of descendants.filter((c) => c.taskType !== 'Summary')) {
    const weight = child.taskType === 'Milestone' ? 1 : Math.max(1, child.durationDays);
    totalWeight += weight;
    weightedProgress += child.progress * weight;
  }

  return {
    ...task,
    startDate,
    durationDays,
    progress: totalWeight > 0 ? weightedProgress / totalWeight : task.progress,
    endDate: computeEndDate(startDate, durationDays, 'Summary', week),
  };
}

export function updateTaskHierarchy(tasks: TaskItem[], workingDaysJson?: string): TaskItem[] {
  const week = workingDaysJson ? parseWorkingWeek(workingDaysJson) : undefined;
  const withParents = tasks.map((task, index) => ({
    ...task,
    parentId: getParentId(tasks, index),
  }));

  let withTypes = withParents.map((task) => {
    if (task.taskType === 'Milestone') return task;
    if (hasChildren(withParents, task.taskId)) {
      return { ...task, taskType: 'Summary' };
    }
    if (task.taskType === 'Summary') {
      return { ...task, taskType: 'Normal' };
    }
    return task;
  });

  const maxLevel = withTypes.reduce((max, task) => Math.max(max, task.indentLevel), 0);
  for (let level = maxLevel; level >= 0; level--) {
    withTypes = withTypes.map((task) => {
      if (task.indentLevel !== level || !hasChildren(withTypes, task.taskId)) return task;
      return rollupSummaryTask(task, withTypes, week);
    });
  }

  return withTypes;
}

export function createDefaultTask(
  taskId: number,
  options: {
    name?: string;
    startDate?: string;
    indentLevel?: number;
    taskType?: string;
    durationDays?: number;
  } = {},
): TaskItem {
  const taskType = options.taskType ?? 'Normal';
  const startDate = options.startDate ?? startOfDay(new Date()).toISOString();
  const durationDays =
    options.durationDays ?? (taskType === 'Milestone' ? 1 : 5);
  return {
    taskId,
    parentId: -1,
    name: options.name ?? 'New Task',
    startDate,
    durationDays,
    progress: 0,
    taskType,
    indentLevel: options.indentLevel ?? 0,
    isExpanded: true,
    assignedTo: '',
    notes: '',
    autoSchedule: true,
    deliverable: '',
    isCritical: false,
    endDate: computeEndDate(startDate, durationDays, taskType),
  };
}

export function addTaskAfter(
  tasks: TaskItem[],
  afterTaskId: number | null,
  name = 'New Task',
): { tasks: TaskItem[]; newTaskId: number } {
  const taskId = nextTaskId(tasks);
  let insertIndex = tasks.length;
  let indentLevel = 0;
  let startDate = startOfDay(new Date()).toISOString();

  if (afterTaskId != null) {
    const afterIndex = tasks.findIndex((t) => t.taskId === afterTaskId);
    if (afterIndex >= 0) {
      insertIndex = getInsertIndexAfterSubtree(tasks, afterTaskId);
      indentLevel = tasks[afterIndex].indentLevel;
      startDate = tasks[afterIndex].startDate;
    }
  }

  const newTask = createDefaultTask(taskId, { name, indentLevel, startDate });
  const next = [...tasks];
  next.splice(insertIndex, 0, newTask);
  return { tasks: updateTaskHierarchy(next), newTaskId: taskId };
}

export function addSubtask(
  tasks: TaskItem[],
  parentId: number,
  name = 'New Task',
): { tasks: TaskItem[]; newTaskId: number } {
  const parentIdx = tasks.findIndex((t) => t.taskId === parentId);
  if (parentIdx < 0) {
    return addTaskAfter(tasks, null, name);
  }

  const parent = tasks[parentIdx];
  const taskId = nextTaskId(tasks);
  let insertIdx = parentIdx + 1;
  while (insertIdx < tasks.length && tasks[insertIdx].indentLevel > parent.indentLevel) {
    insertIdx++;
  }

  const newTask = createDefaultTask(taskId, {
    name,
    indentLevel: parent.indentLevel + 1,
    startDate: parent.startDate,
  });

  const next = tasks.map((t) =>
    t.taskId === parentId && !t.isExpanded ? { ...t, isExpanded: true } : t,
  );
  next.splice(insertIdx, 0, newTask);
  return { tasks: updateTaskHierarchy(next), newTaskId: taskId };
}

export function removeTaskSubtree(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  taskId: number,
): { tasks: TaskItem[]; dependencies: DependencyItem[] } {
  const removeIds = new Set(getSubtreeTaskIds(tasks, taskId));
  const nextTasks = updateTaskHierarchy(tasks.filter((t) => !removeIds.has(t.taskId)));
  const nextDeps = dependencies.filter(
    (d) => !removeIds.has(d.predecessorId) && !removeIds.has(d.successorId),
  );
  return { tasks: nextTasks, dependencies: nextDeps };
}

export function patchTask(
  task: TaskItem,
  patch: Partial<TaskItem>,
  workingDaysJson?: string,
): TaskItem {
  const week = workingDaysJson ? parseWorkingWeek(workingDaysJson) : undefined;
  const next = { ...task, ...patch };

  if (
    patch.startDate !== undefined ||
    patch.durationDays !== undefined ||
    patch.taskType !== undefined
  ) {
    const durationDays =
      next.taskType === 'Milestone' ? 1 : Math.max(1, next.durationDays);
    return {
      ...next,
      durationDays,
      endDate: computeEndDate(next.startDate, durationDays, next.taskType, week),
    };
  }

  if (patch.progress !== undefined) {
    const clamped = Math.min(100, Math.max(0, next.progress));
    return { ...next, progress: clamped };
  }

  return next;
}

export function updateTaskInList(
  tasks: TaskItem[],
  taskId: number,
  patch: Partial<TaskItem>,
  workingDaysJson?: string,
): TaskItem[] {
  const next = tasks.map((t) =>
    t.taskId === taskId ? patchTask(t, patch, workingDaysJson) : t,
  );
  return updateTaskHierarchy(next, workingDaysJson);
}

function applyIndentDelta(tasks: TaskItem[], rootTaskId: number, delta: number): TaskItem[] {
  const idx = tasks.findIndex((t) => t.taskId === rootTaskId);
  if (idx < 0) return tasks;

  const rootLevel = tasks[idx].indentLevel;
  return tasks.map((t, i) => {
    if (i < idx) return t;
    if (i === idx) {
      return { ...t, indentLevel: Math.max(0, t.indentLevel + delta) };
    }
    if (tasks[i].indentLevel <= rootLevel) return t;
    return { ...t, indentLevel: Math.max(0, t.indentLevel + delta) };
  });
}

export function isTaskInSubtree(
  tasks: TaskItem[],
  ancestorId: number,
  taskId: number,
): boolean {
  if (ancestorId === taskId) return true;
  return getSubtreeTaskIds(tasks, ancestorId).includes(taskId);
}

export function areHierarchyRelated(
  tasks: TaskItem[],
  taskId1: number,
  taskId2: number,
): boolean {
  return (
    taskId1 !== taskId2 &&
    (isTaskInSubtree(tasks, taskId1, taskId2) ||
      isTaskInSubtree(tasks, taskId2, taskId1))
  );
}

export function removeInvalidHierarchyDependencies(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
): DependencyItem[] {
  return dependencies.filter(
    (dep) => !areHierarchyRelated(tasks, dep.predecessorId, dep.successorId),
  );
}

export function moveTaskSubtree(
  tasks: TaskItem[],
  taskId: number,
  targetIndex: number,
): TaskItem[] {
  const blockIds = new Set(getSubtreeTaskIds(tasks, taskId));
  const block = tasks.filter((t) => blockIds.has(t.taskId));
  const rest = tasks.filter((t) => !blockIds.has(t.taskId));
  const clamped = Math.max(0, Math.min(targetIndex, rest.length));
  return [...rest.slice(0, clamped), ...block, ...rest.slice(clamped)];
}

function ensureTaskNestedUnderParent(
  tasks: TaskItem[],
  taskId: number,
  parentId: number,
): TaskItem[] {
  const parentIdx = tasks.findIndex((t) => t.taskId === parentId);
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx < 0 || parentIdx < 0 || idx <= parentIdx) return tasks;

  let targetIndex = getInsertIndexAfterSubtree(tasks, parentId);
  const subtreeCount = getSubtreeTaskIds(tasks, taskId).length;
  if (idx < targetIndex) {
    targetIndex -= subtreeCount;
  }
  const subtreeEnd = idx + subtreeCount;
  if (subtreeEnd === targetIndex) return tasks;

  return moveTaskSubtree(tasks, taskId, targetIndex);
}

export function canIndentTask(tasks: TaskItem[], taskId: number): boolean {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx <= 0) return false;
  const level = tasks[idx].indentLevel;
  for (let i = idx - 1; i >= 0; i--) {
    if (tasks[i].indentLevel === level) return true;
  }
  return false;
}

export function canOutdentTask(tasks: TaskItem[], taskId: number): boolean {
  const task = tasks.find((t) => t.taskId === taskId);
  return task != null && task.indentLevel > 0;
}

export function indentTask(tasks: TaskItem[], taskId: number): TaskItem[] {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx <= 0) return tasks;

  const level = tasks[idx].indentLevel;
  let parentIdx = -1;
  for (let i = idx - 1; i >= 0; i--) {
    if (tasks[i].indentLevel === level) {
      parentIdx = i;
      break;
    }
  }
  if (parentIdx < 0) return tasks;
  if (tasks[parentIdx].indentLevel !== level) return tasks;

  const parentId = tasks[parentIdx].taskId;
  let indented = applyIndentDelta(tasks, taskId, 1);
  indented = indented.map((t) =>
    t.taskId === parentId && !t.isExpanded ? { ...t, isExpanded: true } : t,
  );
  indented = ensureTaskNestedUnderParent(indented, taskId, parentId);
  return updateTaskHierarchy(indented);
}

export function outdentTask(tasks: TaskItem[], taskId: number): TaskItem[] {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx < 0 || tasks[idx].indentLevel === 0) return tasks;
  const outdented = applyIndentDelta(tasks, taskId, -1);
  return updateTaskHierarchy(outdented);
}
