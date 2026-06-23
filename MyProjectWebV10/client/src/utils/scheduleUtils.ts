import type { DependencyItem, ProjectDetail, TaskItem } from '../types/project';
import { applyCriticalPathFlags } from './criticalPathCalculator';
import { updateTaskHierarchy } from './taskModel';
import { countWorkingDaysInclusive, getTaskEndDate, snapToNextWorkingDay } from './workingDayCalendar';
import { parseWorkingWeek, type WorkingWeek } from './workingWeek';

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computeEndDate(
  startDate: string,
  durationDays: number,
  taskType: string,
  week?: WorkingWeek,
): string {
  if (taskType === 'Milestone') {
    return startDate;
  }
  const start = startOfDay(new Date(startDate));
  if (week) {
    return getTaskEndDate(start, Math.max(1, durationDays), week).toISOString();
  }
  const end = startOfDay(new Date(start));
  end.setDate(end.getDate() + Math.max(1, durationDays) - 1);
  return end.toISOString();
}

export function inclusiveDayCount(start: Date, end: Date, week?: WorkingWeek): number {
  if (week) {
    return Math.max(1, countWorkingDaysInclusive(start, end, week));
  }
  const s = startOfDay(start);
  const e = startOfDay(end);
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

export function applyTaskStartDateChange(
  task: TaskItem,
  start: Date,
  week?: WorkingWeek,
): TaskItem {
  const schedule = week ?? parseWorkingWeek('[]');
  const startDate = snapToNextWorkingDay(startOfDay(start), schedule).toISOString();
  const durationDays =
    task.taskType === 'Milestone' ? 1 : Math.max(1, task.durationDays);
  const endDate = computeEndDate(startDate, durationDays, task.taskType, schedule);
  return { ...task, startDate, durationDays, endDate };
}

export function applyTaskEndDateChange(
  task: TaskItem,
  end: Date,
  week?: WorkingWeek,
): TaskItem {
  const schedule = week ?? parseWorkingWeek('[]');
  const startDay = snapToNextWorkingDay(startOfDay(new Date(task.startDate)), schedule);
  let endDay = snapToNextWorkingDay(startOfDay(end), schedule);
  if (endDay < startDay) {
    endDay = startDay;
  }
  const durationDays =
    task.taskType === 'Milestone'
      ? 1
      : Math.max(1, inclusiveDayCount(startDay, endDay, schedule));
  const startDate = startDay.toISOString();
  const endDate = computeEndDate(startDate, durationDays, task.taskType, schedule);
  return { ...task, startDate, durationDays, endDate };
}

export function applyTaskDateChange(
  task: TaskItem,
  start: Date,
  end: Date,
  week?: WorkingWeek,
): TaskItem {
  const schedule = week ?? parseWorkingWeek('[]');
  const startDate = snapToNextWorkingDay(startOfDay(start), schedule).toISOString();
  let endDay = startOfDay(end);
  const startDay = startOfDay(new Date(startDate));
  if (endDay < startDay) {
    endDay = startDay;
  }
  const durationDays =
    task.taskType === 'Milestone' ? 1 : inclusiveDayCount(startDay, endDay, schedule);
  const endDate = computeEndDate(startDate, durationDays, task.taskType, schedule);
  return { ...task, startDate, durationDays, endDate };
}

export function applyTaskProgressChange(task: TaskItem, progress: number): TaskItem {
  const clamped = Math.min(100, Math.max(0, progress));
  return { ...task, progress: clamped };
}

function dependencyGraph(deps: DependencyItem[]): Map<number, number[]> {
  const graph = new Map<number, number[]>();
  for (const dep of deps) {
    const list = graph.get(dep.predecessorId) ?? [];
    list.push(dep.successorId);
    graph.set(dep.predecessorId, list);
  }
  return graph;
}

export function hasDependencyPath(
  deps: DependencyItem[],
  fromId: number,
  toId: number,
): boolean {
  const graph = dependencyGraph(deps);
  const queue = [fromId];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of graph.get(current) ?? []) {
      queue.push(next);
    }
  }
  return false;
}

export function wouldCreateDependencyCycle(
  deps: DependencyItem[],
  predecessorId: number,
  successorId: number,
): boolean {
  return hasDependencyPath(deps, successorId, predecessorId);
}

export function tryAddDependency(
  deps: DependencyItem[],
  predecessorId: number,
  successorId: number,
  defaults?: {
    type?: string;
    startLineEnd?: string | null;
    endLineEnd?: string | null;
  },
): { dependencies: DependencyItem[]; error?: string } {
  if (predecessorId === successorId) {
    return { dependencies: deps, error: '작업은 자기 자신과 연결할 수 없습니다.' };
  }

  const duplicate = deps.some(
    (dep) => dep.predecessorId === predecessorId && dep.successorId === successorId,
  );
  if (duplicate) {
    return { dependencies: deps, error: '이미 연결된 의존성입니다.' };
  }

  if (wouldCreateDependencyCycle(deps, predecessorId, successorId)) {
    return { dependencies: deps, error: '순환 의존성은 허용되지 않습니다.' };
  }

  return {
    dependencies: [
      ...deps,
      {
        predecessorId,
        successorId,
        type: defaults?.type ?? 'FS',
        lagDays: 0,
        startLineEnd: defaults?.startLineEnd ?? null,
        endLineEnd: defaults?.endLineEnd ?? null,
      },
    ],
  };
}

export function removeDependency(
  deps: DependencyItem[],
  predecessorId: number,
  successorId: number,
): DependencyItem[] {
  return deps.filter(
    (dep) => !(dep.predecessorId === predecessorId && dep.successorId === successorId),
  );
}

export function setDependencyType(
  deps: DependencyItem[],
  predecessorId: number,
  successorId: number,
  type: string,
): DependencyItem[] {
  return deps.map((dep) =>
    dep.predecessorId === predecessorId && dep.successorId === successorId
      ? { ...dep, type }
      : dep,
  );
}

export function getIncomingDependencies(deps: DependencyItem[], taskId: number): DependencyItem[] {
  return deps.filter((dep) => dep.successorId === taskId);
}

export function getOutgoingDependencies(deps: DependencyItem[], taskId: number): DependencyItem[] {
  return deps.filter((dep) => dep.predecessorId === taskId);
}

export interface DependencyLinkKey {
  predecessorId: number;
  successorId: number;
}

export function resolveDependencyTypeTarget(
  deps: DependencyItem[],
  taskId: number,
  linkSourceTaskId: number | null,
): DependencyLinkKey | null {
  if (linkSourceTaskId != null && linkSourceTaskId !== taskId) {
    return { predecessorId: linkSourceTaskId, successorId: taskId };
  }

  const incoming = getIncomingDependencies(deps, taskId);
  if (incoming.length === 1) {
    return { predecessorId: incoming[0].predecessorId, successorId: taskId };
  }

  const outgoing = getOutgoingDependencies(deps, taskId);
  if (outgoing.length === 1) {
    return { predecessorId: taskId, successorId: outgoing[0].successorId };
  }

  return null;
}

export function resolveContextDependencyType(
  deps: DependencyItem[],
  taskId: number,
  linkSourceTaskId: number | null,
  defaultType: string,
): string {
  const target = resolveDependencyTypeTarget(deps, taskId, linkSourceTaskId);
  if (!target) return defaultType;

  const dep = deps.find(
    (item) =>
      item.predecessorId === target.predecessorId && item.successorId === target.successorId,
  );
  return dep?.type || defaultType;
}

export function toUpdatePayload(project: ProjectDetail): {
  expectedVersion: string;
  tasks: Omit<TaskItem, 'endDate'>[];
  dependencies: DependencyItem[];
} {
  return {
    expectedVersion: project.version,
    tasks: project.tasks.map((task) => ({
      taskId: task.taskId,
      parentId: task.parentId,
      name: (task.name.trim() || 'New Task').slice(0, 512),
      startDate: new Date(task.startDate).toISOString(),
      durationDays: Math.max(1, Math.round(task.durationDays)),
      progress: Math.min(100, Math.max(0, Math.round(task.progress))),
      taskType: task.taskType,
      indentLevel: Math.max(0, Math.round(task.indentLevel)),
      isExpanded: task.isExpanded,
      assignedTo: task.assignedTo ?? '',
      notes: task.notes ?? '',
      autoSchedule: task.autoSchedule,
      deliverable: task.deliverable ?? '',
      isCritical: task.isCritical,
    })),
    dependencies: project.dependencies.map((dep) => ({
      predecessorId: dep.predecessorId,
      successorId: dep.successorId,
      type: dep.type,
      lagDays: Math.round(dep.lagDays),
      startLineEnd: dep.startLineEnd ?? null,
      endLineEnd: dep.endLineEnd ?? null,
    })),
  };
}

export function getPredecessors(deps: DependencyItem[], taskId: number): DependencyItem[] {
  return deps.filter((dep) => dep.successorId === taskId);
}

export function getTaskName(tasks: TaskItem[], taskId: number): string {
  return tasks.find((task) => task.taskId === taskId)?.name ?? `#${taskId}`;
}

export function finalizeSchedule(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  project: Pick<ProjectDetail, 'projectStart' | 'workingDaysJson'>,
): TaskItem[] {
  const hierarchical = updateTaskHierarchy(tasks, project.workingDaysJson);
  return applyCriticalPathFlags(
    hierarchical,
    dependencies,
    project.projectStart,
    project.workingDaysJson,
  );
}

export function withRecalculatedSchedule(project: ProjectDetail): ProjectDetail {
  const tasks = finalizeSchedule(project.tasks, project.dependencies, project);
  if (tasks === project.tasks) return project;
  return { ...project, tasks };
}
