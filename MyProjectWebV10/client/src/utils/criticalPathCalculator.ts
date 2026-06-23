import type { DependencyItem, TaskItem } from '../types/project';
import { getWorkingDayIndex, snapToNextWorkingDay } from './workingDayCalendar';
import { startOfDay } from './scheduleUtils';
import { parseWorkingWeek, type WorkingWeek } from './workingWeek';

type DepType = 'FS' | 'FF' | 'SS' | 'SF';

interface EffectiveDependency {
  predecessorId: number;
  successorId: number;
  type: DepType;
  lagDays: number;
}

export interface CriticalPathResult {
  criticalTaskIds: Set<number>;
  criticalDependencies: Set<string>;
}

function depKey(pred: number, succ: number): string {
  return `${pred}-${succ}`;
}

function isSchedulable(task: TaskItem): boolean {
  return task.taskType !== 'Summary';
}

function taskEndDate(task: TaskItem): Date {
  return startOfDay(new Date(task.endDate));
}

function getChildren(tasks: TaskItem[], parentId: number): TaskItem[] {
  return tasks.filter((task) => task.parentId === parentId);
}

function isInSubtree(
  taskId: number,
  summaryRootId: number,
  taskById: Map<number, TaskItem>,
): boolean {
  if (taskId === summaryRootId) return true;
  const task = taskById.get(taskId);
  if (!task || task.parentId < 0) return false;
  return isInSubtree(task.parentId, summaryRootId, taskById);
}

function collectLeafSchedulable(
  parentId: number,
  tasks: TaskItem[],
  schedulableIds: Set<number>,
  result: TaskItem[],
): void {
  for (const child of getChildren(tasks, parentId)) {
    if (child.taskType === 'Summary') {
      collectLeafSchedulable(child.taskId, tasks, schedulableIds, result);
    } else if (schedulableIds.has(child.taskId)) {
      result.push(child);
    }
  }
}

function getLeafSchedulableTasks(
  summaryRootId: number,
  tasks: TaskItem[],
  schedulableIds: Set<number>,
): TaskItem[] {
  const result: TaskItem[] = [];
  collectLeafSchedulable(summaryRootId, tasks, schedulableIds, result);
  return result;
}

function resolveFinishDrivers(
  taskId: number,
  tasks: TaskItem[],
  taskById: Map<number, TaskItem>,
  schedulableIds: Set<number>,
): number[] {
  const task = taskById.get(taskId);
  if (!task) return [];

  if (task.taskType !== 'Summary') {
    return schedulableIds.has(taskId) ? [taskId] : [];
  }

  const leaves = getLeafSchedulableTasks(taskId, tasks, schedulableIds);
  if (leaves.length === 0) return [];

  const maxEndMs = Math.max(...leaves.map((leaf) => taskEndDate(leaf).getTime()));
  return leaves
    .filter((leaf) => taskEndDate(leaf).getTime() === maxEndMs)
    .map((leaf) => leaf.taskId);
}

function resolveStartDrivers(
  taskId: number,
  tasks: TaskItem[],
  taskById: Map<number, TaskItem>,
  schedulableIds: Set<number>,
  dependencies: DependencyItem[],
): number[] {
  const task = taskById.get(taskId);
  if (!task) return [];

  if (task.taskType !== 'Summary') {
    return schedulableIds.has(taskId) ? [taskId] : [];
  }

  const leaves = getLeafSchedulableTasks(taskId, tasks, schedulableIds);
  if (leaves.length === 0) return [];

  const leafIds = new Set(leaves.map((leaf) => leaf.taskId));
  let entryTasks = leaves.filter(
    (leaf) =>
      !dependencies.some(
        (dep) =>
          dep.successorId === leaf.taskId &&
          isInSubtree(dep.predecessorId, taskId, taskById) &&
          leafIds.has(dep.predecessorId),
      ),
  );

  if (entryTasks.length === 0) entryTasks = leaves;

  const minStartMs = Math.min(...entryTasks.map((leaf) => startOfDay(new Date(leaf.startDate)).getTime()));
  return entryTasks
    .filter((leaf) => startOfDay(new Date(leaf.startDate)).getTime() === minStartMs)
    .map((leaf) => leaf.taskId);
}

function addEffectiveDependency(
  expanded: EffectiveDependency[],
  seen: Set<string>,
  predecessorId: number,
  successorId: number,
  template: DependencyItem,
): void {
  const key = `${predecessorId}-${successorId}-${template.type}-${template.lagDays}`;
  if (seen.has(key)) return;
  seen.add(key);
  expanded.push({
    predecessorId,
    successorId,
    type: (template.type as DepType) || 'FS',
    lagDays: template.lagDays,
  });
}

function expandDependencies(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  taskById: Map<number, TaskItem>,
  schedulableIds: Set<number>,
): EffectiveDependency[] {
  const expanded: EffectiveDependency[] = [];
  const seen = new Set<string>();

  for (const dep of dependencies) {
    if (!taskById.has(dep.predecessorId) || !taskById.has(dep.successorId)) continue;

    const finishDrivers = resolveFinishDrivers(dep.predecessorId, tasks, taskById, schedulableIds);
    if (finishDrivers.length === 0) continue;

    const startDrivers = resolveStartDrivers(
      dep.successorId,
      tasks,
      taskById,
      schedulableIds,
      dependencies,
    );
    if (startDrivers.length === 0) continue;

    for (const finishDriver of finishDrivers) {
      for (const startDriver of startDrivers) {
        addEffectiveDependency(expanded, seen, finishDriver, startDriver, dep);
      }
    }
  }

  return expanded;
}

function getBackwardLfLimit(
  dep: EffectiveDependency,
  succLs: number,
  succLf: number,
  predDuration: number,
): number {
  const lag = dep.lagDays;
  const durOffset = predDuration > 0 ? predDuration - 1 : 0;

  switch (dep.type) {
    case 'FS':
      return succLs - 1 - lag;
    case 'SS':
      return succLs + durOffset - lag;
    case 'FF':
      return succLf - lag;
    case 'SF':
      return succLf + durOffset - lag;
    default:
      return succLs - 1 - lag;
  }
}

function isDrivingDependency(
  dep: EffectiveDependency,
  es: Map<number, number>,
  ef: Map<number, number>,
): boolean {
  const predEs = es.get(dep.predecessorId);
  const predEf = ef.get(dep.predecessorId);
  const succEs = es.get(dep.successorId);
  const succEf = ef.get(dep.successorId);
  if (predEs == null || predEf == null || succEs == null || succEf == null) return false;

  const lag = dep.lagDays;
  switch (dep.type) {
    case 'FS':
      return succEs === predEf + 1 + lag;
    case 'SS':
      return succEs === predEs + lag;
    case 'FF':
      return succEf === predEf + lag;
    case 'SF':
      return succEf === predEs + lag;
    default:
      return succEs === predEf + 1 + lag;
  }
}

function computeBackwardPassCritical(
  groupTasks: TaskItem[],
  effectiveDeps: EffectiveDependency[],
  es: Map<number, number>,
  ef: Map<number, number>,
  groupFinish: number,
): Set<number> {
  const duration = (task: TaskItem) =>
    task.taskType === 'Milestone' ? 0 : Math.max(1, (ef.get(task.taskId) ?? 0) - (es.get(task.taskId) ?? 0) + 1);

  const lf = new Map<number, number>();
  const ls = new Map<number, number>();

  for (const task of groupTasks) {
    lf.set(task.taskId, groupFinish);
    const dur = duration(task);
    ls.set(task.taskId, task.taskType === 'Milestone' ? groupFinish : groupFinish - dur + 1);
  }

  for (let iteration = 0; iteration < groupTasks.length + 5; iteration++) {
    let changed = false;
    for (const task of groupTasks) {
      const dur = duration(task);
      let newLf = lf.get(task.taskId) ?? groupFinish;

      for (const dep of effectiveDeps.filter((d) => d.predecessorId === task.taskId)) {
        const succLs = ls.get(dep.successorId);
        const succLf = lf.get(dep.successorId);
        if (succLs == null || succLf == null) continue;
        const limit = getBackwardLfLimit(dep, succLs, succLf, dur);
        if (limit < newLf) newLf = limit;
      }

      if (newLf !== lf.get(task.taskId)) {
        lf.set(task.taskId, newLf);
        changed = true;
      }

      const newLs = task.taskType === 'Milestone' ? newLf : newLf - dur + 1;
      if (newLs !== ls.get(task.taskId)) {
        ls.set(task.taskId, newLs);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const result = new Set<number>();
  for (const task of groupTasks) {
    const early = es.get(task.taskId) ?? 0;
    const late = ls.get(task.taskId) ?? 0;
    if (late <= early) result.add(task.taskId);
  }
  return result;
}

function computeLocalCriticalTaskIds(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  projectStart: Date,
  schedule: WorkingWeek,
): Set<number> {
  const localCritical = new Set<number>();
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const schedulableIds = new Set(tasks.filter(isSchedulable).map((task) => task.taskId));
  const origin = snapToNextWorkingDay(projectStart, schedule);

  const earlyStart = (task: TaskItem) =>
    getWorkingDayIndex(origin, startOfDay(new Date(task.startDate)), schedule);
  const earlyFinish = (task: TaskItem) =>
    task.taskType === 'Milestone'
      ? earlyStart(task)
      : getWorkingDayIndex(origin, taskEndDate(task), schedule);

  for (const root of tasks.filter((task) => task.parentId < 0 && task.taskType === 'Summary')) {
    const groupTasks = getLeafSchedulableTasks(root.taskId, tasks, schedulableIds);
    if (groupTasks.length === 0) continue;

    const groupIds = new Set(groupTasks.map((task) => task.taskId));
    const es = new Map(groupTasks.map((task) => [task.taskId, earlyStart(task)]));
    const ef = new Map(groupTasks.map((task) => [task.taskId, earlyFinish(task)]));
    const groupFinish = Math.max(...groupTasks.map((task) => ef.get(task.taskId) ?? 0));

    const groupDeps = dependencies.filter(
      (dep) =>
        isInSubtree(dep.predecessorId, root.taskId, taskById) &&
        isInSubtree(dep.successorId, root.taskId, taskById),
    );
    const effectiveDeps = expandDependencies(tasks, groupDeps, taskById, groupIds);

    for (const id of computeBackwardPassCritical(groupTasks, effectiveDeps, es, ef, groupFinish)) {
      localCritical.add(id);
    }
  }

  return localCritical;
}

export function computeCriticalPath(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  projectStart: Date,
  schedule: WorkingWeek,
): CriticalPathResult {
  const result: CriticalPathResult = {
    criticalTaskIds: new Set<number>(),
    criticalDependencies: new Set<string>(),
  };

  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const schedulable = tasks.filter(isSchedulable);
  if (schedulable.length === 0) return result;

  const schedulableIds = new Set(schedulable.map((task) => task.taskId));
  const effectiveDeps = expandDependencies(tasks, dependencies, taskById, schedulableIds);
  const origin = snapToNextWorkingDay(projectStart, schedule);

  const earlyStart = (task: TaskItem) =>
    getWorkingDayIndex(origin, startOfDay(new Date(task.startDate)), schedule);
  const earlyFinish = (task: TaskItem) =>
    task.taskType === 'Milestone'
      ? earlyStart(task)
      : getWorkingDayIndex(origin, taskEndDate(task), schedule);

  const es = new Map(schedulable.map((task) => [task.taskId, earlyStart(task)]));
  const ef = new Map(schedulable.map((task) => [task.taskId, earlyFinish(task)]));
  const duration = (task: TaskItem) =>
    task.taskType === 'Milestone'
      ? 0
      : Math.max(1, (ef.get(task.taskId) ?? 0) - (es.get(task.taskId) ?? 0) + 1);

  const projectFinish = Math.max(...schedulable.map((task) => ef.get(task.taskId) ?? 0));
  const lf = new Map<number, number>();
  const ls = new Map<number, number>();

  for (const task of schedulable) {
    lf.set(task.taskId, projectFinish);
    const dur = duration(task);
    ls.set(task.taskId, task.taskType === 'Milestone' ? projectFinish : projectFinish - dur + 1);
  }

  for (let iteration = 0; iteration < schedulable.length + 5; iteration++) {
    let changed = false;
    for (const task of schedulable) {
      const dur = duration(task);
      let newLf = lf.get(task.taskId) ?? projectFinish;

      for (const dep of effectiveDeps.filter((d) => d.predecessorId === task.taskId)) {
        const succLs = ls.get(dep.successorId);
        const succLf = lf.get(dep.successorId);
        if (succLs == null || succLf == null) continue;
        const limit = getBackwardLfLimit(dep, succLs, succLf, dur);
        if (limit < newLf) {
          newLf = limit;
          changed = true;
        }
      }

      if (newLf !== lf.get(task.taskId)) {
        lf.set(task.taskId, newLf);
        changed = true;
      }

      const newLs = task.taskType === 'Milestone' ? newLf : newLf - dur + 1;
      if (newLs !== ls.get(task.taskId)) {
        ls.set(task.taskId, newLs);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const task of schedulable) {
    const early = es.get(task.taskId) ?? 0;
    const late = ls.get(task.taskId) ?? 0;
    if (late <= early) result.criticalTaskIds.add(task.taskId);
  }

  for (const dep of effectiveDeps) {
    if (
      !result.criticalTaskIds.has(dep.predecessorId) ||
      !result.criticalTaskIds.has(dep.successorId)
    ) {
      continue;
    }
    if (isDrivingDependency(dep, es, ef)) {
      result.criticalDependencies.add(depKey(dep.predecessorId, dep.successorId));
    }
  }

  for (const id of computeLocalCriticalTaskIds(tasks, dependencies, projectStart, schedule)) {
    result.criticalTaskIds.add(id);
  }

  return result;
}

function collectDescendants(tasks: TaskItem[], taskId: number): TaskItem[] {
  const result: TaskItem[] = [];
  const stack = getChildren(tasks, taskId);
  while (stack.length > 0) {
    const child = stack.pop()!;
    result.push(child);
    for (const nested of getChildren(tasks, child.taskId)) {
      stack.push(nested);
    }
  }
  return result;
}

export function applyCriticalPathFlags(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  projectStart: string,
  workingDaysJson: string,
): TaskItem[] {
  const schedule = parseWorkingWeek(workingDaysJson);
  const result = computeCriticalPath(tasks, dependencies, new Date(projectStart), schedule);
  const criticalIds = result.criticalTaskIds;

  return tasks.map((task) => {
    const isCritical =
      task.taskType === 'Summary'
        ? collectDescendants(tasks, task.taskId).some((child) => criticalIds.has(child.taskId))
        : criticalIds.has(task.taskId);

    return task.isCritical === isCritical ? task : { ...task, isCritical };
  });
}
