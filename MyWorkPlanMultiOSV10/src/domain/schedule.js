// The scheduler: computes every date of a project from what the user entered,
// like MS Project's "calculate project".
//
//  1. Outline: summary tasks, WBS codes; links on a summary apply to every task
//     inside it (and a link from a summary waits for all of its tasks).
//  2. Forward pass (early dates) in dependency order: FS / SS / FF / SF links
//     with lags (working time, elapsed time or % of the predecessor), task
//     constraints (SNET, FNET, MSO, MFO, SNLT, FNLT), leveling delays, actual
//     dates, manual tasks, elapsed durations, milestones. Each task works on its
//     own calendar (task calendar → its resource's calendar → project calendar).
//  3. Backward pass (late dates) from the project finish, with deadlines and
//     "no later than" constraints; total and free slack; the critical path.
//     ALAP tasks move to their late dates; a project scheduled from its finish
//     date places every task as late as possible.
//  4. Roll-ups: summary dates, % complete, work and cost; resource work, cost,
//     day-by-day load and overallocation; baseline variances; late tasks.
//
// Nothing in the project is changed (except by level()); the result is a
// Schedule object the views read.
import { CalendarSet } from './calendars.js';
import { isElapsed } from './duration.js';
import { findResource, outline } from './project.js';
import { dayOf, dayStart, nowMin, toMin } from './time.js';

const BIG = 1e15;

/** Lag in minutes and how it is applied. */
function lagOf(link, predDuration) {
  if (link.lagUnit === '%') return { minutes: Math.round(((Number(link.lag) || 0) / 100) * (predDuration || 0)), elapsed: false };
  return { minutes: Number(link.lag) || 0, elapsed: isElapsed(link.lagUnit ?? 'd') };
}

export class Schedule {
  constructor(project) {
    this.project = project;
    this.tasks = new Map();
    this.resources = new Map();
    this.assignments = new Map();
    this.conflicts = [];
    this.errors = [];
    this.calendars = new CalendarSet(project.calendars);
    this.projectCal = this.calendars.get(project.calendarId);
  }

  info(id) {
    return this.tasks.get(id) ?? null;
  }

  /** Task calendar: its own, else its first work resource's, else the project's. */
  calendarFor(task) {
    if (task.calendarId) return this.calendars.get(task.calendarId);
    for (const assignment of this.project.assignments) {
      if (assignment.taskId !== task.id) continue;
      const resource = findResource(this.project, assignment.resourceId);
      if (resource?.type === 'work' && resource.calendarId) return this.calendars.get(resource.calendarId);
    }
    return this.projectCal;
  }
}

/** Builds the dependency graph between leaf tasks, expanding links on summary tasks. */
function buildGraph(project, structure) {
  const byId = new Map(project.tasks.map((task) => [task.id, task]));
  const leavesOf = new Map();
  const collectLeaves = (id) => {
    if (leavesOf.has(id)) return leavesOf.get(id);
    const kids = structure.children.get(id) ?? [];
    const leaves = kids.length ? kids.flatMap((kid) => collectLeaves(kid)) : [id];
    leavesOf.set(id, leaves);
    return leaves;
  };
  const isActive = (id) => byId.get(id)?.active !== false;
  const leaves = project.tasks.filter((task) => !structure.isSummary(task.id)).map((task) => task.id);
  const incoming = new Map(leaves.map((id) => [id, []]));
  const outgoing = new Map(leaves.map((id) => [id, []]));
  for (const id of leaves) {
    // Own links and the links of every summary above it.
    const owners = [id];
    for (let up = structure.parent.get(id); up; up = structure.parent.get(up)) owners.push(up);
    for (const owner of owners) {
      for (const link of byId.get(owner)?.predecessors ?? []) {
        if (!byId.has(link.taskId) || !isActive(link.taskId)) continue;
        const from = collectLeaves(link.taskId).filter((leaf) => isActive(leaf) && leaf !== id);
        if (!from.length) continue;
        const edge = { from, fromId: link.taskId, to: id, type: link.type ?? 'FS', link, viaSummary: owner !== id };
        incoming.get(id).push(edge);
        for (const leaf of from) outgoing.get(leaf).push(edge);
      }
    }
  }
  return { leaves, incoming, outgoing, leavesOf: collectLeaves };
}

/** Dependency order (Kahn). Tasks in a loop are reported and placed in row order. */
function topoOrder(leaves, incoming, rowOf) {
  const indegree = new Map(leaves.map((id) => [id, 0]));
  const next = new Map(leaves.map((id) => [id, new Set()]));
  for (const id of leaves) {
    for (const edge of incoming.get(id)) {
      for (const from of edge.from) {
        if (!next.get(from)?.has(id)) {
          next.get(from)?.add(id);
          indegree.set(id, indegree.get(id) + 1);
        }
      }
    }
  }
  const ready = leaves.filter((id) => indegree.get(id) === 0).sort((a, b) => rowOf(a) - rowOf(b));
  const order = [];
  const done = new Set();
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    done.add(id);
    for (const succ of next.get(id)) {
      indegree.set(succ, indegree.get(succ) - 1);
      if (indegree.get(succ) === 0) ready.push(succ);
    }
  }
  const looped = leaves.filter((id) => !done.has(id)).sort((a, b) => rowOf(a) - rowOf(b));
  return { order: [...order, ...looped], looped: new Set(looped) };
}

/**
 * Computes the schedule. `delays` (Map id → minutes) overrides task leveling
 * delays (used while leveling).
 */
export function schedule(project, { delays = null, today = null } = {}) {
  const s = new Schedule(project);
  const o = project.options ?? {};
  const structure = outline(project);
  const rows = new Map(project.tasks.map((task, index) => [task.id, index + 1]));
  const rowOf = (id) => rows.get(id) ?? 0;
  const byId = new Map(project.tasks.map((task) => [task.id, task]));
  const graph = buildGraph(project, structure);
  const { order, looped } = topoOrder(graph.leaves, graph.incoming, rowOf);
  for (const id of looped) s.conflicts.push({ taskId: id, kind: 'circular' });
  s.order = order;
  s.outline = structure;
  const honor = o.honorConstraints !== false;
  const projectCal = s.projectCal;

  const date = (value) => toMin(value);
  const fromFinish = project.scheduleFrom === 'finish' && date(project.finish) != null;
  let projectStart = date(project.start) ?? nowMin();
  try { projectStart = projectCal.snapForward(projectStart); } catch { s.errors.push({ kind: 'calendar', calendarId: project.calendarId }); }

  const cal = new Map();
  const dur = new Map();
  const elapsed = new Map();
  for (const id of graph.leaves) {
    const task = byId.get(id);
    cal.set(id, s.calendarFor(task));
    dur.set(id, task.milestone ? 0 : Math.max(0, Number(task.duration) || 0));
    elapsed.set(id, isElapsed(task.durationUnit ?? 'd'));
  }

  const safe = (fn, fallback, id) => {
    try { return fn(); } catch { s.errors.push({ kind: 'calendar', taskId: id }); return fallback; }
  };
  const addLag = (t, lag) => (lag.elapsed ? t + lag.minutes : safe(() => projectCal.add(t, lag.minutes), t));
  const subLag = (t, lag) => (lag.elapsed ? t - lag.minutes : safe(() => projectCal.add(t, -lag.minutes), t));
  const forward = (id, start) => {
    const d = dur.get(id);
    if (elapsed.get(id)) return start + d;
    return d === 0 ? start : safe(() => cal.get(id).add(start, d), start + d, id);
  };
  const backward = (id, finish) => {
    const d = dur.get(id);
    if (elapsed.get(id)) return finish - d;
    if (d === 0) return finish;
    return safe(() => cal.get(id).subtract(cal.get(id).snapBackward(finish), d), finish - d, id);
  };
  const snapStart = (id, t) => {
    if (elapsed.get(id)) return t;
    const c = cal.get(id);
    return safe(() => {
      if (dur.get(id) === 0) return c.snapBackward(t) === t ? t : c.snapForward(t);
      return c.snapForward(t);
    }, t, id);
  };

  // ── forward pass
  const es = new Map();
  const ef = new Map();
  const groupStart = (edge) => Math.min(...edge.from.map((leaf) => es.get(leaf) ?? BIG));
  const groupFinish = (edge) => Math.max(...edge.from.map((leaf) => ef.get(leaf) ?? -BIG));
  const groupDuration = (edge) => {
    const a = groupStart(edge);
    const b = groupFinish(edge);
    return a < BIG && b > -BIG ? projectCal.between(a, b) : 0;
  };
  const delayOf = (task) => (delays?.has(task.id) ? delays.get(task.id) : Number(task.levelingDelay) || 0);
  const required = new Map();

  const forwardTask = (id, origin) => {
    const task = byId.get(id);
    if (task.manual) {
      const start = date(task.start) ?? (task.actualStart ? date(task.actualStart) : null) ?? origin;
      const finish = date(task.finish) ?? forward(id, start);
      es.set(id, start);
      ef.set(id, Math.max(start, finish));
      if (date(task.finish) != null && !task.milestone) dur.set(id, cal.get(id).between(start, Math.max(start, finish)));
      return;
    }
    let start = origin;
    let reason = null;
    for (const edge of graph.incoming.get(id)) {
      if (edge.from.some((leaf) => !es.has(leaf))) continue;
      const lag = lagOf(edge.link, groupDuration(edge));
      let candidate;
      if (edge.type === 'SS') candidate = addLag(groupStart(edge), lag);
      else if (edge.type === 'FF') candidate = backward(id, addLag(groupFinish(edge), lag));
      else if (edge.type === 'SF') candidate = backward(id, addLag(groupStart(edge), lag));
      else candidate = addLag(groupFinish(edge), lag);
      if (candidate > start) { start = candidate; reason = edge.fromId; }
    }
    required.set(id, start);
    const type = task.constraint?.type ?? 'ASAP';
    const cdate = date(task.constraint?.date);
    if (cdate != null) {
      if (type === 'SNET' && cdate > start) start = cdate;
      if (type === 'FNET' && backward(id, cdate) > start) start = backward(id, cdate);
      if (type === 'MSO') {
        if (cdate < start) s.conflicts.push({ taskId: id, kind: 'constraint', constraint: type, linkFrom: reason });
        if (honor || cdate >= start) start = cdate;
      }
      if (type === 'MFO') {
        const b = backward(id, cdate);
        if (b < start) s.conflicts.push({ taskId: id, kind: 'constraint', constraint: type, linkFrom: reason });
        if (honor || b >= start) start = b;
      }
      if (type === 'SNLT' && start > cdate) {
        s.conflicts.push({ taskId: id, kind: 'constraint', constraint: type, linkFrom: reason });
        if (honor) start = cdate;
      }
      if (type === 'FNLT' && forward(id, snapStart(id, start)) > cdate) {
        s.conflicts.push({ taskId: id, kind: 'constraint', constraint: type, linkFrom: reason });
        if (honor) start = backward(id, cdate);
      }
    }
    const delay = delayOf(task);
    if (delay > 0) start += delay;
    if (task.actualStart && date(task.actualStart) != null) start = date(task.actualStart);
    start = snapStart(id, start);
    let finish = forward(id, start);
    if (task.actualFinish && date(task.actualFinish) != null && (task.percentComplete ?? 0) >= 100) {
      finish = Math.max(start, date(task.actualFinish));
      if (!task.milestone && !elapsed.get(id)) dur.set(id, cal.get(id).between(start, finish));
    }
    es.set(id, start);
    ef.set(id, finish);
  };

  // ── backward pass (late dates)
  const ls = new Map();
  const lf = new Map();
  const backwardTask = (id, finishLimit) => {
    const task = byId.get(id);
    let finish = finishLimit;
    for (const edge of graph.outgoing.get(id)) {
      if (!ls.has(edge.to)) continue;
      const lag = lagOf(edge.link, groupDuration(edge));
      const succ = edge.to;
      let candidate;
      if (edge.type === 'SS') candidate = forward(id, subLag(ls.get(succ), lag));
      else if (edge.type === 'FF') candidate = subLag(lf.get(succ), lag);
      else if (edge.type === 'SF') candidate = forward(id, subLag(lf.get(succ), lag));
      else candidate = subLag(ls.get(succ), lag);
      if (candidate < finish) finish = candidate;
    }
    const type = task.constraint?.type ?? 'ASAP';
    const cdate = date(task.constraint?.date);
    if (cdate != null && type === 'FNLT' && cdate < finish) finish = cdate;
    if (cdate != null && type === 'SNLT' && forward(id, cdate) < finish) finish = forward(id, cdate);
    const deadline = date(task.deadline);
    if (deadline != null && deadline < finish) finish = deadline;
    if (!elapsed.get(id) && dur.get(id) > 0) finish = safe(() => cal.get(id).snapBackward(finish), finish, id);
    const start = backward(id, finish);
    ls.set(id, start);
    lf.set(id, finish);
  };

  const activeLeaves = graph.leaves.filter((id) => byId.get(id).active !== false);
  let projectFinish;
  if (fromFinish) {
    // Scheduled from the finish date: late dates first, every task as late as possible.
    projectFinish = safe(() => projectCal.snapBackward(date(project.finish)), date(project.finish));
    for (const id of [...order].reverse()) backwardTask(id, projectFinish);
    for (const id of order) {
      const task = byId.get(id);
      if (task.manual || task.actualStart || ['SNET', 'MSO', 'MFO', 'FNET'].includes(task.constraint?.type)) {
        forwardTask(id, ls.get(id));
        continue;
      }
      es.set(id, ls.get(id));
      ef.set(id, lf.get(id));
    }
    projectStart = Math.min(...activeLeaves.map((id) => es.get(id)), projectFinish);
    // Early dates for slack.
    const late = { ls: new Map(ls), lf: new Map(lf), es: new Map(es), ef: new Map(ef) };
    es.clear(); ef.clear();
    for (const id of order) forwardTask(id, projectStart);
    s.early = { es: new Map(es), ef: new Map(ef) };
    for (const id of order) { es.set(id, late.es.get(id)); ef.set(id, late.ef.get(id)); }
  } else {
    for (const id of order) forwardTask(id, projectStart);
    projectFinish = activeLeaves.length ? Math.max(...activeLeaves.map((id) => ef.get(id))) : projectStart;
    for (const id of [...order].reverse()) backwardTask(id, projectFinish);
    s.early = { es: new Map(es), ef: new Map(ef) };
    // ALAP tasks: as late as their successors allow.
    for (const id of [...order].reverse()) {
      const task = byId.get(id);
      if (task.manual || task.constraint?.type !== 'ALAP' || task.actualStart) continue;
      let finish = projectFinish;
      for (const edge of graph.outgoing.get(id)) {
        const lag = lagOf(edge.link, groupDuration(edge));
        if (edge.type === 'FS') finish = Math.min(finish, subLag(es.get(edge.to), lag));
        else if (edge.type === 'FF') finish = Math.min(finish, subLag(ef.get(edge.to), lag));
        else if (edge.type === 'SS') finish = Math.min(finish, forward(id, subLag(es.get(edge.to), lag)));
        else finish = Math.min(finish, forward(id, subLag(ef.get(edge.to), lag)));
      }
      const start = backward(id, finish);
      if (start > es.get(id)) { es.set(id, snapStart(id, start)); ef.set(id, forward(id, es.get(id))); }
    }
  }

  // ── leaf results
  const status = date(project.statusDate) ?? today ?? nowMin();
  const criticalLimit = Number(o.criticalSlack ?? 0) * (Number(o.hoursPerDay ?? 8) * 60);
  for (const task of project.tasks) {
    const id = task.id;
    const info = {
      id, row: rowOf(id), wbs: structure.wbs.get(id), parentId: structure.parent.get(id), level: task.outlineLevel,
      summary: structure.isSummary(id), children: structure.children.get(id) ?? [], milestone: Boolean(task.milestone),
      active: task.active !== false, manual: Boolean(task.manual),
    };
    if (!info.summary) {
      const c = cal.get(id);
      info.start = es.get(id);
      info.finish = ef.get(id);
      info.duration = dur.get(id);
      info.earlyStart = s.early.es.get(id);
      info.earlyFinish = s.early.ef.get(id);
      info.lateStart = ls.get(id);
      info.lateFinish = lf.get(id);
      const startSlack = c.between(info.earlyStart ?? info.start, info.lateStart);
      const finishSlack = c.between(info.earlyFinish ?? info.finish, info.lateFinish);
      info.totalSlack = Math.min(startSlack, finishSlack);
      let free = c.between(info.finish, projectFinish);
      for (const edge of graph.outgoing.get(id)) {
        const lag = lagOf(edge.link, groupDuration(edge));
        let gap;
        if (edge.type === 'SS') gap = c.between(addLag(info.start, lag), es.get(edge.to));
        else if (edge.type === 'FF') gap = c.between(addLag(info.finish, lag), ef.get(edge.to));
        else if (edge.type === 'SF') gap = c.between(addLag(info.start, lag), ef.get(edge.to));
        else gap = c.between(addLag(info.finish, lag), es.get(edge.to));
        free = Math.min(free, gap);
      }
      info.freeSlack = Math.max(0, free);
      info.percentComplete = Math.max(0, Math.min(100, Number(task.percentComplete) || 0));
      info.critical = info.active && info.percentComplete < 100 && info.totalSlack <= criticalLimit;
      info.calendarId = c.calendar.id;
      info.required = required.get(id);
      const deadline = date(task.deadline);
      info.missedDeadline = deadline != null && info.finish > deadline;
      info.actualDuration = Math.round((info.duration * info.percentComplete) / 100);
      info.remainingDuration = info.duration - info.actualDuration;
    }
    s.tasks.set(id, info);
  }

  // ── summaries (bottom-up: children come after their summary in row order)
  for (let index = project.tasks.length - 1; index >= 0; index--) {
    const task = project.tasks[index];
    const info = s.tasks.get(task.id);
    if (!info.summary) continue;
    const kids = info.children.map((kid) => s.tasks.get(kid)).filter((kid) => kid.active && kid.start != null);
    const all = kids.length ? kids : info.children.map((kid) => s.tasks.get(kid)).filter((kid) => kid.start != null);
    if (!all.length) {
      Object.assign(info, { start: projectStart, finish: projectStart, duration: 0, totalSlack: 0, freeSlack: 0, percentComplete: 0, critical: false });
      continue;
    }
    info.start = Math.min(...all.map((kid) => kid.start));
    info.finish = Math.max(...all.map((kid) => kid.finish));
    info.earlyStart = Math.min(...all.map((kid) => kid.earlyStart ?? kid.start));
    info.earlyFinish = Math.max(...all.map((kid) => kid.earlyFinish ?? kid.finish));
    info.lateStart = Math.min(...all.map((kid) => kid.lateStart ?? kid.start));
    info.lateFinish = Math.max(...all.map((kid) => kid.lateFinish ?? kid.finish));
    info.duration = projectCal.between(info.start, info.finish);
    info.totalSlack = Math.min(...all.map((kid) => kid.totalSlack ?? 0));
    info.freeSlack = Math.min(...all.map((kid) => kid.freeSlack ?? 0));
    info.critical = all.some((kid) => kid.critical);
    const weight = all.reduce((sum, kid) => sum + Math.max(kid.duration ?? 0, kid.milestone ? 0 : 1), 0);
    info.percentComplete = weight ? Math.round(all.reduce((sum, kid) => sum + (kid.percentComplete ?? 0) * Math.max(kid.duration ?? 0, kid.milestone ? 0 : 1), 0) / weight) : 0;
    if (all.every((kid) => kid.milestone) && all.length) info.percentComplete = Math.round(all.reduce((sum, kid) => sum + kid.percentComplete, 0) / all.length);
    info.actualDuration = Math.round((info.duration * info.percentComplete) / 100);
    info.remainingDuration = info.duration - info.actualDuration;
    info.calendarId = projectCal.calendar.id;
    const deadline = date(task.deadline);
    info.missedDeadline = deadline != null && info.finish > deadline;
  }

  s.start = projectStart;
  s.finish = projectFinish;
  s.duration = projectCal.between(projectStart, projectFinish);

  computeCosts(s, byId);
  computeLoads(s, byId, cal);
  computeTracking(s, byId, status);
  return s;
}

/** Work and cost of assignments, tasks (with summaries) and resources. */
function computeCosts(s, byId) {
  const project = s.project;
  for (const resource of project.resources) s.resources.set(resource.id, { id: resource.id, work: 0, cost: 0, actualWork: 0, actualCost: 0, overallocated: false, peak: 0, assignments: [] });
  for (const info of s.tasks.values()) Object.assign(info, { work: 0, cost: 0, actualWork: 0, actualCost: 0, resourceNames: [] });
  for (const assignment of project.assignments) {
    const task = byId.get(assignment.taskId);
    const info = s.tasks.get(assignment.taskId);
    const resource = findResource(project, assignment.resourceId);
    if (!task || !info || !resource || info.summary) continue;
    const pct = (info.percentComplete ?? 0) / 100;
    let work = 0;
    let cost = 0;
    const units = Number(assignment.units) || 0;
    if (resource.type === 'work') {
      work = assignment.work != null && task.type === 'fixedWork' ? assignment.work : Math.round((info.duration ?? 0) * units);
      cost = (work / 60) * (Number(resource.stdRate) || 0) + (Number(resource.costPerUse) || 0);
    } else if (resource.type === 'material') {
      cost = units * (Number(resource.stdRate) || 0) + (Number(resource.costPerUse) || 0);
    } else {
      cost = Number(assignment.cost) || 0;
    }
    const result = { id: assignment.id, taskId: task.id, resourceId: resource.id, units, work, cost, actualWork: Math.round(work * pct), actualCost: cost * pct, start: info.start, finish: info.finish, overallocated: false };
    s.assignments.set(assignment.id, result);
    info.work += work;
    info.cost += cost;
    info.actualWork += result.actualWork;
    info.actualCost += result.actualCost;
    info.resourceNames.push(units !== 1 && resource.type === 'work' ? `${resource.name}[${Math.round(units * 100)}%]` : resource.type === 'material' ? `${resource.name}[${units}${resource.materialLabel ? ` ${resource.materialLabel}` : ''}]` : resource.name);
    const r = s.resources.get(resource.id);
    r.work += work;
    r.cost += cost;
    r.actualWork += result.actualWork;
    r.actualCost += result.actualCost;
    r.assignments.push(result);
  }
  // Tasks without resources keep the work typed for them; fixed costs.
  for (const task of project.tasks) {
    const info = s.tasks.get(task.id);
    if (info.summary) continue;
    if (!info.work && task.work) info.work = task.work;
    const fixed = Number(task.fixedCost) || 0;
    info.cost += fixed;
    info.actualCost += fixed * ((info.percentComplete ?? 0) / 100);
  }
  for (let index = project.tasks.length - 1; index >= 0; index--) {
    const info = s.tasks.get(project.tasks[index].id);
    if (!info.summary) continue;
    const kids = info.children.map((kid) => s.tasks.get(kid)).filter((kid) => kid.active);
    info.work = kids.reduce((sum, kid) => sum + kid.work, 0);
    info.cost = kids.reduce((sum, kid) => sum + kid.cost, 0) + (Number(project.tasks[index].fixedCost) || 0);
    info.actualWork = kids.reduce((sum, kid) => sum + kid.actualWork, 0);
    info.actualCost = kids.reduce((sum, kid) => sum + kid.actualCost, 0);
  }
  for (const info of s.tasks.values()) {
    info.remainingWork = info.work - info.actualWork;
    info.remainingCost = info.cost - info.actualCost;
  }
  const top = [...s.tasks.values()].filter((info) => !info.parentId && info.active);
  s.work = top.reduce((sum, info) => sum + info.work, 0);
  s.cost = top.reduce((sum, info) => sum + info.cost, 0);
  s.actualWork = top.reduce((sum, info) => sum + info.actualWork, 0);
  s.actualCost = top.reduce((sum, info) => sum + info.actualCost, 0);
  const weight = top.reduce((sum, info) => sum + Math.max(1, info.duration ?? 0), 0);
  s.percentComplete = weight ? Math.round(top.reduce((sum, info) => sum + (info.percentComplete ?? 0) * Math.max(1, info.duration ?? 0), 0) / weight) : 0;
}

/**
 * How many minutes of an assignment fall on each day: the work spread over the
 * working time of the task (at its units). Map day → minutes.
 */
export function assignmentProfile(calendar, start, finish, units) {
  const out = new Map();
  if (start == null || finish == null || finish <= start || !units) return out;
  for (const [a, b] of calendar.workingSpans(start, finish)) {
    const day = dayOf(a);
    out.set(day, (out.get(day) ?? 0) + (b - a) * units);
  }
  return out;
}

/** Day-by-day load of each work resource and overallocation. */
function computeLoads(s, byId, cal) {
  const project = s.project;
  s.loads = new Map();
  for (const resource of project.resources) {
    if (resource.type !== 'work') continue;
    const load = new Map();
    const rcal = resource.calendarId ? s.calendars.get(resource.calendarId) : s.projectCal;
    for (const result of s.resources.get(resource.id).assignments) {
      const info = s.tasks.get(result.taskId);
      const task = byId.get(result.taskId);
      if (!info?.active || !task || (info.duration ?? 0) === 0) continue;
      const c = cal.get(task.id) ?? s.projectCal;
      // Work actually spread: work / working minutes of the task.
      const span = c.between(info.start, info.finish);
      const units = span > 0 ? result.work / span : 0;
      if (span > 366 * 1440 * 5) continue;
      for (const [day, minutes] of assignmentProfile(c, info.start, info.finish, units)) load.set(day, (load.get(day) ?? 0) + minutes);
    }
    const days = [];
    let peak = 0;
    for (const [day, minutes] of load) {
      const capacity = (Number(resource.maxUnits) || 0) * rcal.dayMinutes(day);
      // Peak units: the busiest day's work against a full working day.
      peak = Math.max(peak, rcal.dayMinutes(day) > 0 ? minutes / rcal.dayMinutes(day) : minutes > 0 ? Infinity : 0);
      if (minutes > capacity + 0.5) days.push(day);
    }
    const r = s.resources.get(resource.id);
    r.peak = peak;
    r.overallocatedDays = new Set(days);
    r.overallocated = days.length > 0;
    s.loads.set(resource.id, load);
    if (r.overallocated) {
      for (const result of r.assignments) {
        const info = s.tasks.get(result.taskId);
        if (!info?.active || info.start == null) continue;
        for (let day = dayOf(info.start); day <= dayOf(Math.max(info.start, info.finish - 1)); day++) {
          if (r.overallocatedDays.has(day)) { result.overallocated = true; info.overallocated = true; break; }
        }
      }
    }
  }
}

/** Baseline variances, late tasks, the status date. */
function computeTracking(s, byId, status) {
  s.statusDate = status;
  const cal = s.projectCal;
  for (const info of s.tasks.values()) {
    const task = byId.get(info.id);
    const base = task.baselines?.[0];
    if (base && base.start) {
      const bStart = toMin(base.start);
      const bFinish = toMin(base.finish);
      info.baseline = { start: bStart, finish: bFinish, duration: base.duration ?? 0, work: base.work ?? 0, cost: base.cost ?? 0 };
      info.startVariance = cal.between(bStart, info.start);
      info.finishVariance = cal.between(bFinish, info.finish);
      info.durationVariance = (info.duration ?? 0) - (base.duration ?? 0);
      info.workVariance = info.work - (base.work ?? 0);
      info.costVariance = info.cost - (base.cost ?? 0);
    } else {
      info.baseline = null;
      info.startVariance = info.finishVariance = info.durationVariance = info.workVariance = info.costVariance = 0;
    }
    // Late: should have finished by the status date, or less done than the time passed says.
    if (!info.summary && info.active && info.start != null) {
      const pct = info.percentComplete ?? 0;
      let expected = 0;
      if (status >= info.finish) expected = 100;
      else if (status > info.start) expected = info.duration > 0 ? (cal.between(info.start, status) / Math.max(1, info.duration)) * 100 : 0;
      info.late = pct < 100 && expected - pct > 0.5 && status > info.start;
      info.expectedComplete = Math.min(100, Math.round(expected));
      info.status = pct >= 100 ? 'complete' : info.late ? 'late' : status < info.start ? 'future' : 'onSchedule';
    }
  }
  for (let index = s.project.tasks.length - 1; index >= 0; index--) {
    const info = s.tasks.get(s.project.tasks[index].id);
    if (!info.summary) continue;
    const kids = info.children.map((kid) => s.tasks.get(kid));
    info.late = kids.some((kid) => kid.late);
    info.overallocated = kids.some((kid) => kid.overallocated);
    info.status = info.percentComplete >= 100 ? 'complete' : info.late ? 'late' : status < info.start ? 'future' : 'onSchedule';
  }
}

/**
 * Resource leveling: delays tasks (in start order, higher priority first on
 * ties) until no work resource is overallocated. Tasks with priority 1000,
 * manual tasks and tasks already started are not moved. Returns
 * { delays: Map(id → minutes), moved: [ids], unresolved: [resourceIds] }.
 *
 * options: { order: 'standard' | 'id' | 'priority', withinSlack: false, clear: true, onProgress(done, total) }
 */
export function levelResources(project, options = {}) {
  const delays = new Map();
  const movable = (task) => !task.manual && !task.actualStart && (task.priority ?? 500) < 1000 && task.active !== false && !['MSO', 'MFO'].includes(task.constraint?.type);
  for (const task of project.tasks) {
    if (options.clear !== false && movable(task)) delays.set(task.id, 0);
    else delays.set(task.id, Number(task.levelingDelay) || 0);
  }
  let s = schedule(project, { delays });
  const structure = s.outline;
  const leaves = project.tasks.filter((task) => !structure.isSummary(task.id) && task.active !== false);
  const topo = new Map(s.order.map((id, index) => [id, index]));
  const sortKey = (task) => {
    const info = s.info(task.id);
    if (options.order === 'id') return [s.info(task.id).row];
    if (options.order === 'priority') return [-(task.priority ?? 500), info.start, topo.get(task.id)];
    return [info.start, -(task.priority ?? 500), info.totalSlack, topo.get(task.id)];
  };
  const compare = (a, b) => {
    const x = sortKey(a);
    const y = sortKey(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  const queue = [...leaves].sort(compare);
  const committed = new Map(project.resources.filter((r) => r.type === 'work').map((r) => [r.id, new Map()]));
  const rcal = (resource) => (resource.calendarId ? s.calendars.get(resource.calendarId) : s.projectCal);
  const moved = [];
  const unresolved = new Set();
  const total = queue.length;
  queue.forEach((task, index) => {
    options.onProgress?.(index, total);
    const assigned = project.assignments.filter((a) => a.taskId === task.id).map((a) => ({ a, r: findResource(project, a.resourceId) })).filter(({ r }) => r?.type === 'work');
    let info = s.info(task.id);
    if (!assigned.length || !(info.duration > 0)) return;
    const cal = s.calendarFor(task);
    const profileAt = (start) => {
      const finish = cal.add(start, info.duration);
      const span = cal.between(start, finish);
      return assigned.map(({ a, r }) => {
        const work = a.work != null && task.type === 'fixedWork' ? a.work : info.duration * (Number(a.units) || 0);
        return { r, profile: assignmentProfile(cal, start, finish, span > 0 ? work / span : 0) };
      });
    };
    const fits = (profiles) => profiles.every(({ r, profile }) => {
      const used = committed.get(r.id);
      for (const [day, minutes] of profile) {
        const capacity = (Number(r.maxUnits) || 0) * rcal(r).dayMinutes(day);
        if ((used.get(day) ?? 0) + minutes > capacity + 0.5) return false;
      }
      return true;
    });
    const alone = profileAt(info.start).every(({ r, profile }) => [...profile].every(([day, minutes]) => minutes <= (Number(r.maxUnits) || 0) * rcal(r).dayMinutes(day) + 0.5));
    let start = info.start;
    let profiles = profileAt(start);
    if (movable(task) && alone) {
      let guard = 0;
      while (!fits(profiles) && guard < 1500) {
        start = cal.snapForward(dayStart(dayOf(start) + 1));
        profiles = profileAt(start);
        guard += 1;
      }
      const delay = start - info.start;
      if (delay > 0 && (!options.withinSlack || cal.between(info.start, start) <= Math.max(0, info.totalSlack))) {
        delays.set(task.id, (delays.get(task.id) ?? 0) + delay);
        moved.push(task.id);
        s = schedule(project, { delays });
        info = s.info(task.id);
        profiles = profileAt(info.start);
      } else if (delay > 0) {
        profiles = profileAt(info.start);
      }
    }
    if (!fits(profiles)) for (const { r } of profiles) unresolved.add(r.id);
    for (const { r, profile } of profiles) {
      const used = committed.get(r.id);
      for (const [day, minutes] of profile) used.set(day, (used.get(day) ?? 0) + minutes);
    }
  });
  options.onProgress?.(total, total);
  return { delays, moved, unresolved: [...unresolved] };
}

/** Days from `from` to `to` (inclusive) with each resource's work minutes, for usage views. */
export function resourceLoad(s, resourceId, fromDay, toDay) {
  const load = s.loads?.get(resourceId) ?? new Map();
  const out = [];
  for (let day = fromDay; day <= toDay; day++) out.push(load.get(day) ?? 0);
  return out;
}

/** Work minutes of one assignment on each day from `fromDay` to `toDay`. */
export function assignmentLoad(s, assignmentId, fromDay, toDay) {
  const result = s.assignments.get(assignmentId);
  const out = new Array(Math.max(0, toDay - fromDay + 1)).fill(0);
  if (!result) return out;
  const task = s.project.tasks.find((item) => item.id === result.taskId);
  const info = s.tasks.get(result.taskId);
  if (!task || !info || !(info.duration > 0)) return out;
  const cal = s.calendarFor(task);
  const span = cal.between(info.start, info.finish);
  for (const [day, minutes] of assignmentProfile(cal, info.start, info.finish, span > 0 ? result.work / span : 0)) {
    if (day >= fromDay && day <= toDay) out[day - fromDay] += minutes;
  }
  return out;
}
