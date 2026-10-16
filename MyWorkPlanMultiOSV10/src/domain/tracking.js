// Baselines and progress, like MS Project's Project › Set Baseline and
// Task › Update Tasks / Mark on Track / Update Project.
import { findTask, outline } from './project.js';
import { fromMin, toMin } from './time.js';

export const BASELINE_COUNT = 11; // Baseline, Baseline 1 … Baseline 10

/** Saves the current schedule of all tasks (or `ids`) as baseline `index`. Summaries above the tasks are refreshed too. */
export function setBaseline(project, sched, index = 0, ids = null, when = new Date().toISOString()) {
  let targets = ids ? new Set(ids) : null;
  if (targets) {
    // Roll the change up into the summaries (MS Project "roll up baselines to all summary tasks").
    const { parent } = outline(project);
    for (const id of [...targets]) for (let up = parent.get(id); up; up = parent.get(up)) targets.add(up);
  }
  let count = 0;
  for (const task of project.tasks) {
    if (targets && !targets.has(task.id)) continue;
    const info = sched.info(task.id);
    if (!info) continue;
    task.baselines = { ...(task.baselines ?? {}), [index]: { start: fromMin(info.start), finish: fromMin(info.finish), duration: info.duration ?? 0, work: info.work ?? 0, cost: info.cost ?? 0 } };
    count += 1;
  }
  project.baselineDates = { ...(project.baselineDates ?? {}), [index]: when };
  return count;
}

export function clearBaseline(project, index = 0, ids = null) {
  const targets = ids ? new Set(ids) : null;
  let count = 0;
  for (const task of project.tasks) {
    if (targets && !targets.has(task.id)) continue;
    if (task.baselines?.[index]) {
      const { [index]: removed, ...rest } = task.baselines;
      void removed;
      task.baselines = rest;
      count += 1;
    }
  }
  if (!targets) {
    const { [index]: removed, ...rest } = project.baselineDates ?? {};
    void removed;
    project.baselineDates = rest;
  }
  return count;
}

/** Copies baseline `from` into `to` (e.g. keep the original as Baseline 1 before re-baselining). */
export function copyBaseline(project, from, to) {
  for (const task of project.tasks) {
    if (task.baselines?.[from]) task.baselines = { ...task.baselines, [to]: { ...task.baselines[from] } };
  }
  if (project.baselineDates?.[from]) project.baselineDates = { ...project.baselineDates, [to]: project.baselineDates[from] };
}

export const hasBaseline = (project, index = 0) => project.tasks.some((task) => task.baselines?.[index]);

/**
 * Sets % complete on leaf tasks. Starting work fixes the actual start at the
 * scheduled start; 100% also fixes the actual finish; 0% clears both.
 */
export function setPercentComplete(project, sched, ids, percent) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  let count = 0;
  for (const id of leafIds(project, ids)) {
    const task = findTask(project, id);
    const info = sched.info(id);
    if (!task || !info) continue;
    task.percentComplete = value;
    if (value === 0) {
      task.actualStart = null;
      task.actualFinish = null;
    } else {
      task.actualStart ??= fromMin(info.start);
      task.actualFinish = value >= 100 ? fromMin(info.finish) : null;
    }
    count += 1;
  }
  return count;
}

/** The detailed "Update Tasks" dialog: % complete, actual dates, actual / remaining duration. */
export function updateProgress(project, sched, id, { percentComplete, actualStart, actualFinish, actualDuration, remainingDuration }) {
  const task = findTask(project, id);
  const info = sched.info(id);
  if (!task || !info || info.summary) return false;
  if (actualDuration != null && remainingDuration != null) {
    task.duration = Math.max(0, Math.round(actualDuration + remainingDuration));
    task.milestone = task.duration === 0 && task.milestone;
    task.percentComplete = task.duration > 0 ? Math.round((actualDuration / task.duration) * 100) : percentComplete ?? task.percentComplete;
  } else if (actualDuration != null) {
    task.percentComplete = task.duration > 0 ? Math.min(100, Math.round((actualDuration / task.duration) * 100)) : 100;
  }
  if (percentComplete != null && actualDuration == null) task.percentComplete = Math.max(0, Math.min(100, Math.round(percentComplete)));
  if (actualStart !== undefined) task.actualStart = actualStart || null;
  if (actualFinish !== undefined) {
    task.actualFinish = actualFinish || null;
    if (actualFinish) task.percentComplete = 100;
  }
  if (task.percentComplete > 0 && !task.actualStart) task.actualStart = fromMin(info.start);
  if (task.percentComplete >= 100 && !task.actualFinish) task.actualFinish = fromMin(info.finish);
  if (task.percentComplete === 0) { task.actualStart = actualStart || null; task.actualFinish = null; }
  return true;
}

/** "Mark on track": progress as scheduled up to the status date. */
export function markOnTrack(project, sched, ids, statusMinutes = sched.statusDate) {
  let count = 0;
  for (const id of leafIds(project, ids)) {
    const info = sched.info(id);
    const task = findTask(project, id);
    if (!info || !task) continue;
    const percent = progressAt(sched, info, statusMinutes);
    if (percent === task.percentComplete) continue;
    task.percentComplete = percent;
    task.actualStart = percent > 0 ? task.actualStart ?? fromMin(info.start) : null;
    task.actualFinish = percent >= 100 ? fromMin(info.finish) : null;
    count += 1;
  }
  return count;
}

/** "Update project": every task (or `ids`) complete as scheduled through `date`. */
export function updateProjectThrough(project, sched, date, ids = null) {
  const minutes = toMin(date);
  if (minutes == null) return 0;
  return markOnTrack(project, sched, ids ?? project.tasks.map((task) => task.id), minutes);
}

/**
 * "Reschedule uncompleted work to start after": the remaining part of tasks
 * that should have started by `date` moves after it (as an SNET constraint on
 * tasks not started yet).
 */
export function rescheduleUncompleted(project, sched, date) {
  const minutes = toMin(date);
  if (minutes == null) return 0;
  let count = 0;
  for (const task of project.tasks) {
    const info = sched.info(task.id);
    if (!info || info.summary || task.manual || (task.percentComplete ?? 0) > 0) continue;
    if (info.start < minutes) {
      task.constraint = { type: 'SNET', date: fromMin(minutes) };
      count += 1;
    }
  }
  return count;
}

function progressAt(sched, info, status) {
  if (status >= info.finish) return 100;
  if (status <= info.start) return 0;
  const cal = sched.projectCal;
  const total = cal.between(info.start, info.finish);
  return total > 0 ? Math.min(100, Math.round((cal.between(info.start, status) / total) * 100)) : 100;
}

/** The leaf tasks among `ids`, including those under selected summaries. */
export function leafIds(project, ids) {
  const { children, isSummary } = outline(project);
  const out = new Set();
  const walk = (id) => {
    if (isSummary(id)) for (const kid of children.get(id)) walk(kid);
    else out.add(id);
  };
  for (const id of ids) walk(id);
  return [...out];
}
