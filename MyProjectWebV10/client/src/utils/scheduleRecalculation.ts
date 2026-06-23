import type { DependencyItem, TaskItem } from '../types/project';
import { addWorkingDays, getTaskEndDate, snapToNextWorkingDay } from './workingDayCalendar';
import { computeEndDate, finalizeSchedule, startOfDay } from './scheduleUtils';
import { parseWorkingWeek, type WorkingWeek } from './workingWeek';

function getTaskEnd(task: TaskItem, week: WorkingWeek): Date {
  if (task.taskType === 'Milestone') {
    return startOfDay(new Date(task.startDate));
  }
  return getTaskEndDate(startOfDay(new Date(task.startDate)), Math.max(1, task.durationDays), week);
}

function applyDependencyCascade(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  week: WorkingWeek,
): TaskItem[] {
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const visited = new Set<number>();

  const cascadeFrom = (predecessorId: number) => {
    if (!visited.add(predecessorId)) return;
    const pred = taskById.get(predecessorId);
    if (!pred || pred.taskType === 'Summary') return;

    const predEnd = getTaskEnd(pred, week);

    for (const dep of dependencies.filter((d) => d.predecessorId === predecessorId)) {
      const succ = taskById.get(dep.successorId);
      if (!succ || succ.taskType === 'Summary' || !succ.autoSchedule) continue;

      const succDuration =
        succ.taskType === 'Milestone' ? 0 : Math.max(1, succ.durationDays);
      let newStart: Date;

      switch (dep.type) {
        case 'FF':
          newStart = addWorkingDays(predEnd, dep.lagDays - Math.max(0, succDuration - 1), week);
          break;
        case 'SS':
          newStart = addWorkingDays(startOfDay(new Date(pred.startDate)), dep.lagDays, week);
          break;
        case 'SF':
          newStart = addWorkingDays(
            startOfDay(new Date(pred.startDate)),
            dep.lagDays - Math.max(0, succDuration - 1),
            week,
          );
          break;
        case 'FS':
        default:
          newStart = addWorkingDays(predEnd, 1 + dep.lagDays, week);
          break;
      }

      newStart = snapToNextWorkingDay(newStart, week);
      const currentStart = startOfDay(new Date(succ.startDate));
      if (newStart > currentStart) {
        const startDate = newStart.toISOString();
        const updated: TaskItem = {
          ...succ,
          startDate,
          endDate: computeEndDate(startDate, succ.durationDays, succ.taskType, week),
        };
        taskById.set(succ.taskId, updated);
        cascadeFrom(succ.taskId);
      }
    }
  };

  for (const dep of dependencies) {
    visited.clear();
    cascadeFrom(dep.predecessorId);
  }

  return tasks.map((task) => taskById.get(task.taskId) ?? task);
}

export function recalculateScheduleForWorkingWeek(
  tasks: TaskItem[],
  dependencies: DependencyItem[],
  project: { projectStart: string; workingDaysJson: string },
): TaskItem[] {
  const week = parseWorkingWeek(project.workingDaysJson);

  let next = tasks.map((task) => {
    if (task.taskType === 'Summary') return task;
    const snapped = snapToNextWorkingDay(new Date(task.startDate), week);
    const startDate = snapped.toISOString();
    return {
      ...task,
      startDate,
      endDate: computeEndDate(startDate, task.durationDays, task.taskType, week),
    };
  });

  next = applyDependencyCascade(next, dependencies, week);
  return finalizeSchedule(next, dependencies, project);
}
