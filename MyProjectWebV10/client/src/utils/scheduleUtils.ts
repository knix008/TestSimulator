import type { AssignmentItem, DependencyItem, GanttViewSettings, ProjectDetail, NoteItem, TaskItem } from '../types/project';
import { applyCriticalPathFlags } from './criticalPathCalculator';
import { MILESTONE_DURATION_DAYS } from './ganttTaskDates';
import { updateTaskHierarchy } from './taskModel';
import { countWorkingDaysInclusive, getTaskEndDate, snapToNextWorkingDay } from './workingDayCalendar';
import { defaultWorkingWeek, parseWorkingWeek, type WorkingWeek } from './workingWeek';

function resolveWorkingWeek(week?: WorkingWeek): WorkingWeek {
  return week ?? defaultWorkingWeek();
}

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
  return getTaskEndDate(start, Math.max(1, durationDays), resolveWorkingWeek(week)).toISOString();
}

export function inclusiveDayCount(start: Date, end: Date, week?: WorkingWeek): number {
  return Math.max(1, countWorkingDaysInclusive(start, end, resolveWorkingWeek(week)));
}

/** Snap starts and recompute ends from working-day durations (load/import/working-week change). */
export function normalizeTasksToWorkingWeek(tasks: TaskItem[], workingDaysJson: string): TaskItem[] {
  const week = parseWorkingWeek(workingDaysJson);
  return tasks.map((task) => {
    if (task.taskType === 'Summary') return task;
    const startDate = snapToNextWorkingDay(startOfDay(new Date(task.startDate)), week).toISOString();
    const durationDays =
      task.taskType === 'Milestone' ? MILESTONE_DURATION_DAYS : Math.max(1, task.durationDays);
    return {
      ...task,
      startDate,
      durationDays,
      endDate: computeEndDate(startDate, durationDays, task.taskType, week),
    };
  });
}

export function applyTaskStartDateChange(
  task: TaskItem,
  start: Date,
  week?: WorkingWeek,
): TaskItem {
  const schedule = week ?? defaultWorkingWeek();
  const startDate = snapToNextWorkingDay(startOfDay(start), schedule).toISOString();
  const durationDays =
    task.taskType === 'Milestone' ? MILESTONE_DURATION_DAYS : Math.max(1, task.durationDays);
  const endDate = computeEndDate(startDate, durationDays, task.taskType, schedule);
  return { ...task, startDate, durationDays, endDate };
}

export function applyTaskEndDateChange(
  task: TaskItem,
  end: Date,
  week?: WorkingWeek,
): TaskItem {
  const schedule = week ?? defaultWorkingWeek();
  if (task.taskType === 'Milestone') {
    const startDate = snapToNextWorkingDay(startOfDay(end), schedule).toISOString();
    return { ...task, startDate, endDate: startDate, durationDays: MILESTONE_DURATION_DAYS };
  }

  const startDay = snapToNextWorkingDay(startOfDay(new Date(task.startDate)), schedule);
  let endDay = snapToNextWorkingDay(startOfDay(end), schedule);
  if (endDay < startDay) {
    endDay = startDay;
  }
  const durationDays = Math.max(1, inclusiveDayCount(startDay, endDay, schedule));
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
  if (task.taskType === 'Summary') return task;
  const schedule = week ?? defaultWorkingWeek();
  if (task.taskType === 'Milestone') {
    const startDate = snapToNextWorkingDay(startOfDay(start), schedule).toISOString();
    return {
      ...task,
      startDate,
      endDate: startDate,
      durationDays: MILESTONE_DURATION_DAYS,
    };
  }

  const startDate = snapToNextWorkingDay(startOfDay(start), schedule).toISOString();
  let endDay = snapToNextWorkingDay(startOfDay(end), schedule);
  const startDay = startOfDay(new Date(startDate));
  if (endDay < startDay) {
    endDay = startDay;
  }
  const durationDays = inclusiveDayCount(startDay, endDay, schedule);
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

export function setDependencyLineEnd(
  deps: DependencyItem[],
  predecessorId: number,
  successorId: number,
  which: 'start' | 'end',
  style: string,
): DependencyItem[] {
  const field = which === 'start' ? 'startLineEnd' : 'endLineEnd';
  return deps.map((dep) =>
    dep.predecessorId === predecessorId && dep.successorId === successorId
      ? { ...dep, [field]: style }
      : dep,
  );
}

export function resolveDependencyStartLineEnd(
  dep: DependencyItem | undefined,
  viewSettings: Pick<GanttViewSettings, 'startLineEnd'>,
): GanttViewSettings['startLineEnd'] {
  const value = dep?.startLineEnd;
  if (value === 'None' || value === 'Arrow' || value === 'OpenArrow' || value === 'Dot' || value === 'Square') {
    return value;
  }
  return viewSettings.startLineEnd;
}

export function resolveDependencyEndLineEnd(
  dep: DependencyItem | undefined,
  viewSettings: Pick<GanttViewSettings, 'endLineEnd'>,
): GanttViewSettings['endLineEnd'] {
  const value = dep?.endLineEnd;
  if (value === 'None' || value === 'Arrow' || value === 'OpenArrow' || value === 'Dot' || value === 'Square') {
    return value;
  }
  return viewSettings.endLineEnd;
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

export function resolveContextDependencyTarget(
  deps: DependencyItem[],
  taskId: number,
  linkSourceTaskId: number | null,
  selectedDependency: DependencyLinkKey | null,
): DependencyLinkKey | null {
  if (selectedDependency) {
    const involvesTask =
      selectedDependency.predecessorId === taskId ||
      selectedDependency.successorId === taskId;
    if (
      involvesTask &&
      deps.some(
        (dep) =>
          dep.predecessorId === selectedDependency.predecessorId &&
          dep.successorId === selectedDependency.successorId,
      )
    ) {
      return selectedDependency;
    }
  }

  return resolveDependencyTypeTarget(deps, taskId, linkSourceTaskId);
}

function findDependency(
  deps: DependencyItem[],
  target: DependencyLinkKey,
): DependencyItem | undefined {
  return deps.find(
    (item) =>
      item.predecessorId === target.predecessorId && item.successorId === target.successorId,
  );
}

export function resolveContextDependencyType(
  deps: DependencyItem[],
  taskId: number,
  linkSourceTaskId: number | null,
  defaultType: string,
  selectedDependency: DependencyLinkKey | null = null,
): string {
  const target = resolveContextDependencyTarget(
    deps,
    taskId,
    linkSourceTaskId,
    selectedDependency,
  );
  if (!target) return defaultType;

  return findDependency(deps, target)?.type || defaultType;
}

export function toUpdatePayload(project: ProjectDetail): {
  expectedVersion: string;
  tasks: Omit<TaskItem, 'endDate'>[];
  dependencies: DependencyItem[];
  assignments: AssignmentItem[];
  ganttNotes: NoteItem[];
} {
  return {
    expectedVersion: project.version,
    tasks: project.tasks.map((task) => ({
      taskId: task.taskId,
      parentId: task.parentId,
      name: (task.name.trim() || 'New Task').slice(0, 512),
      startDate: new Date(task.startDate).toISOString(),
      durationDays:
        task.taskType === 'Milestone'
          ? 0
          : Math.max(1, Math.round(task.durationDays)),
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
    assignments: (project.assignments ?? []).map((assignment) => ({
      taskId: assignment.taskId,
      resourceName: assignment.resourceName.slice(0, 256),
      allocationPercent: Math.max(0, assignment.allocationPercent),
    })),
    ganttNotes: (project.ganttNotes ?? []).map((note) => ({
      noteId: note.noteId,
      title: (note.title || 'New Note').slice(0, 256),
      body: note.body ?? '',
      bodyRtf: note.bodyRtf ?? '',
      taskId: note.taskId,
      offsetDays: note.offsetDays,
      anchorDate: new Date(note.anchorDate).toISOString(),
      contentY: Math.round(note.contentY),
      contentX: Math.round(note.contentX),
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
  const normalized = {
    ...project,
    assignments: project.assignments ?? [],
    ganttNotes: project.ganttNotes ?? [],
  };
  const tasks = finalizeSchedule(
    normalizeTasksToWorkingWeek(normalized.tasks, normalized.workingDaysJson),
    normalized.dependencies,
    normalized,
  );
  if (tasks === normalized.tasks) return normalized;
  return { ...normalized, tasks };
}
