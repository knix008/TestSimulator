// Burndown chart data: how much is left to do, day by day, from the project
// start to its finish.
//
//   ideal     a straight line from everything (at the start) to nothing (at the finish)
//   planned   what is left if the work is done as scheduled
//   baseline  the same for the baseline schedule (when one was saved)
//   actual    what is really left (progress up to the status date; empty after it)
//
// The amount is the plan's work (hours of resources). A plan without work
// (no resources assigned) burns down its task durations instead, so the chart
// is never flat. A second series counts the tasks still open.
import { dayOf, dayStart, nowMin, toMin } from './time.js';

/** Share of [start, finish) done by the end of `day` (0…1). */
function share(start, finish, day) {
  const end = dayStart(day + 1);
  if (end <= start) return 0;
  if (end >= finish || finish <= start) return 1;
  return (end - start) / (finish - start);
}

/**
 * Returns { unit: 'work' | 'duration', total, done, remaining, tasks, tasksOpen, statusDay, start, finish,
 *           points: [{ day, ideal, planned, baseline, actual, tasksIdeal, tasksPlanned, tasksActual }] }.
 * `maxPoints` keeps long plans readable (one point per step of days).
 */
export function burndownData(project, sched, { now = nowMin(), maxPoints = 80 } = {}) {
  const leaves = project.tasks
    .filter((task) => task.active !== false && sched.info(task.id) && !sched.info(task.id).summary)
    .map((task) => ({ task, info: sched.info(task.id) }));
  const byWork = leaves.some((x) => (x.info.work ?? 0) > 0);
  const amount = (info) => Math.max(0, (byWork ? info.work : info.duration) ?? 0);
  const baseAmount = (info) => Math.max(0, (byWork ? info.baseline?.work : info.baseline?.duration) ?? 0);
  const total = leaves.reduce((sum, x) => sum + amount(x.info), 0);
  const done = leaves.reduce((sum, x) => sum + (amount(x.info) * (x.info.percentComplete ?? 0)) / 100, 0);
  const baseTotal = leaves.reduce((sum, x) => sum + baseAmount(x.info), 0);
  const hasBaseline = leaves.some((x) => x.info.baseline && x.info.baseline.start != null);
  const status = sched.statusDate ?? now;
  const from = dayOf(sched.start);
  const to = Math.max(dayOf(sched.finish), from + 1);
  const steps = Math.max(2, Math.min(maxPoints, to - from + 1));
  const days = [...new Set(Array.from({ length: steps }, (_, i) => Math.round(from + ((to - from) * i) / (steps - 1))))];
  const span = Math.max(1, to - from);
  const taskCount = leaves.length;
  // The day a finished task was done: its actual finish, else its scheduled one.
  const finishedOn = (x) => ((x.info.percentComplete ?? 0) < 100 ? Infinity : dayOf(toMin(x.task.actualFinish) ?? x.info.finish));
  const points = days.map((day) => {
    const f = (day - from) / span;
    let planned = 0;
    let baseline = 0;
    let actualDone = 0;
    let plannedOpen = 0;
    let actualOpen = 0;
    const past = dayStart(day) <= status;
    for (const x of leaves) {
      const s = share(x.info.start, x.info.finish, day);
      planned += amount(x.info) * s;
      if (hasBaseline && x.info.baseline?.start != null) baseline += baseAmount(x.info) * share(x.info.baseline.start, x.info.baseline.finish, day);
      if (past) actualDone += amount(x.info) * Math.min(s, (x.info.percentComplete ?? 0) / 100);
      if (s < 1) plannedOpen += 1;
      if (past && finishedOn(x) > day) actualOpen += 1;
    }
    return {
      day,
      ideal: total * (1 - f),
      planned: total - planned,
      baseline: hasBaseline ? baseTotal - baseline : null,
      actual: past ? total - actualDone : null,
      tasksIdeal: taskCount * (1 - f),
      tasksPlanned: plannedOpen,
      tasksActual: past ? actualOpen : null,
    };
  });
  return {
    unit: byWork ? 'work' : 'duration',
    total, done, remaining: total - done,
    tasks: taskCount,
    tasksOpen: leaves.filter((x) => (x.info.percentComplete ?? 0) < 100).length,
    statusDay: dayOf(status),
    start: sched.start, finish: sched.finish,
    hasBaseline,
    points,
  };
}

/** Where the plan stands against its schedule at the status date: + ahead (less left than scheduled), − behind (in the chart's unit). */
export function burndownVariance(data) {
  const past = data.points.filter((p) => p.actual != null);
  const last = past.at(-1);
  if (!last) return 0;
  return last.planned - last.actual;
}
