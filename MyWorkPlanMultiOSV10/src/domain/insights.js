// What the bottom panel shows about a plan's schedule: problems (loops, calendar
// errors, constraint conflicts, missed deadlines, overbooked people, late work,
// loose ends), the critical path, overallocations, delays and milestones. Pure:
// the panel (ui/bottom-panel.js) only draws what this returns.
//
// Every item: { severity: 'error' | 'warning' | 'info', kind, taskId?, resourceId?, …facts }.
import { criticalPath } from './critical.js';
import { dayStart, toMin } from './time.js';

export const INSIGHT_TABS = ['problems', 'critical', 'overallocation', 'delays', 'milestones'];

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

/** Tasks that do work (not summaries, not inactive). */
const leavesOf = (project, sched) => project.tasks.filter((task) => {
  const info = sched.info(task.id);
  return info && !info.summary && task.active !== false;
});

function problems(project, sched, leaves) {
  const out = [];
  const seen = new Set();
  const add = (item) => {
    const key = `${item.kind}:${item.taskId ?? ''}:${item.resourceId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  for (const c of sched.conflicts ?? []) {
    if (c.kind === 'circular') add({ severity: 'error', kind: 'circular', taskId: c.taskId });
    else if (c.kind === 'constraint') add({ severity: 'warning', kind: 'constraint', taskId: c.taskId, constraint: c.constraint });
  }
  for (const e of sched.errors ?? []) add({ severity: 'error', kind: 'calendar', taskId: e.taskId ?? null, calendarId: e.calendarId ?? null });
  for (const task of leaves) {
    const info = sched.info(task.id);
    if (info.missedDeadline) add({ severity: 'error', kind: 'deadline', taskId: task.id, days: Math.max(1, Math.ceil((info.finish - (toMin(task.deadline) ?? info.finish)) / 1440)) });
  }
  for (const resource of project.resources) {
    const r = sched.resources.get(resource.id);
    if (r?.overallocated) add({ severity: 'warning', kind: 'overallocated', resourceId: resource.id, peak: r.peak, days: r.overallocatedDays?.size ?? 0 });
  }
  for (const task of leaves) {
    const info = sched.info(task.id);
    if (info.late) add({ severity: 'warning', kind: 'late', taskId: task.id, percent: task.percentComplete ?? 0, expected: info.expectedComplete ?? 0 });
  }
  // Loose ends: work with neither predecessors nor successors floats free of the plan.
  const hasSucc = new Set();
  for (const task of project.tasks) for (const p of task.predecessors ?? []) hasSucc.add(p.taskId);
  if (leaves.length > 2) {
    for (const task of leaves) {
      if (task.milestone) continue;
      if (!(task.predecessors ?? []).length && !hasSucc.has(task.id)) add({ severity: 'info', kind: 'unlinked', taskId: task.id });
    }
  }
  for (const task of leaves) {
    const info = sched.info(task.id);
    if (!task.milestone && project.resources.length && !project.assignments.some((a) => a.taskId === task.id) && (info.duration ?? 0) > 0) add({ severity: 'info', kind: 'noResource', taskId: task.id });
    if (task.manual && (info.duration ?? 0) === 0 && !task.milestone) add({ severity: 'info', kind: 'manualZero', taskId: task.id });
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (sched.info(a.taskId)?.row ?? 1e9) - (sched.info(b.taskId)?.row ?? 1e9));
}

function critical(project, sched) {
  const cp = criticalPath(project, sched);
  const ids = [...new Set(cp.chains.flat())];
  const tasks = ids.map((id) => ({ taskId: id, start: sched.info(id).start, finish: sched.info(id).finish, duration: sched.info(id).duration ?? 0, slack: sched.info(id).totalSlack ?? 0, percent: sched.info(id).percentComplete ?? 0 }))
    .sort((a, b) => a.start - b.start || (sched.info(a.taskId).row ?? 0) - (sched.info(b.taskId).row ?? 0));
  const all = project.tasks.filter((task) => sched.info(task.id)?.critical && !sched.info(task.id)?.summary).length;
  return { chains: cp.chains.length, tasks, all, finish: sched.finish, start: sched.start, duration: sched.duration ?? 0, remaining: tasks.filter((x) => x.percent < 100).length };
}

function overallocations(project, sched) {
  const out = [];
  for (const resource of project.resources) {
    const r = sched.resources.get(resource.id);
    if (!r?.overallocated) continue;
    const days = [...(r.overallocatedDays ?? [])].sort((a, b) => a - b);
    const tasks = r.assignments.filter((a) => a.overallocated).map((a) => a.taskId);
    out.push({ severity: 'warning', kind: 'overallocated', resourceId: resource.id, peak: r.peak, maxUnits: Number(resource.maxUnits) || 1, days: days.length, first: days.length ? dayStart(days[0]) : null, last: days.length ? dayStart(days[days.length - 1]) : null, tasks });
  }
  return out.sort((a, b) => (a.first ?? 0) - (b.first ?? 0));
}

function delays(project, sched, leaves) {
  const out = [];
  for (const task of leaves) {
    const info = sched.info(task.id);
    const slip = info.baseline ? info.finishVariance ?? 0 : 0;
    if (!info.late && !info.missedDeadline && slip <= 0) continue;
    out.push({
      severity: info.missedDeadline ? 'error' : info.late ? 'warning' : 'info',
      kind: info.missedDeadline ? 'deadline' : info.late ? 'late' : 'slip',
      taskId: task.id, slip, percent: task.percentComplete ?? 0, expected: info.expectedComplete ?? 0, critical: Boolean(info.critical), finish: info.finish,
    });
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.slip - a.slip);
}

function milestones(project, sched, leaves) {
  return leaves.filter((task) => task.milestone).map((task) => {
    const info = sched.info(task.id);
    const done = (task.percentComplete ?? 0) >= 100;
    const slip = info.baseline ? info.finishVariance ?? 0 : 0;
    return { severity: info.missedDeadline ? 'error' : slip > 0 && !done ? 'warning' : 'info', kind: done ? 'done' : 'milestone', taskId: task.id, finish: info.finish, slip, done, critical: Boolean(info.critical) };
  }).sort((a, b) => a.finish - b.finish);
}

/** Everything the bottom panel shows, with a count per tab. */
export function scheduleInsights(project, sched) {
  const leaves = leavesOf(project, sched);
  const result = {
    problems: problems(project, sched, leaves),
    critical: critical(project, sched),
    overallocation: overallocations(project, sched),
    delays: delays(project, sched, leaves),
    milestones: milestones(project, sched, leaves),
  };
  result.counts = {
    problems: result.problems.length,
    errors: result.problems.filter((x) => x.severity === 'error').length,
    warnings: result.problems.filter((x) => x.severity === 'warning').length,
    critical: result.critical.tasks.length,
    overallocation: result.overallocation.length,
    delays: result.delays.length,
    milestones: result.milestones.length,
  };
  return result;
}
