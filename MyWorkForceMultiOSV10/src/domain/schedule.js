// A project's schedule, kept apart from its issues (like a Microsoft Project plan):
//
//   project.schedule = { start, sprintDays, autoSchedule, tasks: [task…], baselineAt, applied }
//   task = { id, name, level, duration, milestone, preds: [{ id, type, lag }], assigneeId, kind, points,
//            fixedStart, percent, notes, issueId, versionId, baseline: { start, finish },
//            start, finish, float, critical }            ← the last four are worked out by computeSchedule
//
// The outline is the order of the tasks plus each one's level (1 = top): a task followed by deeper ones is a
// summary. Durations and lags are in working days of the work calendar (weekdays when there is none).
// Dependencies are finish-to-start (FS), start-to-start (SS), finish-to-finish (FF) and start-to-finish (SF).
//
// People who only plan never need issues. "Switch to Kanban / Scrum" (schedule-apply.js) turns the plan into
// issues, sprints and a board; tasks then remember their issue and show its progress.
import { byId, uid } from './util.js';

export const DAY = 86_400_000;
export const DEP_TYPES = ['FS', 'SS', 'FF', 'SF'];
export const TASK_KINDS = ['task', 'story', 'feature', 'bug', 'improvement'];
const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ── Days ──

/** Midnight UTC of a date ("2026-11-19", an ISO time, or a time value); null when there is none. */
export function dayOf(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') { const d = new Date(value); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  const text = String(value);
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (plain) return Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return null;
  // A stored issue date is local noon; its calendar day is what the person picked.
  const d = new Date(time);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export const isoDay = (ms) => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));

/** Whether a day is worked under a calendar (its week and holidays); weekdays without one. */
export function isWorkDay(calendar, ms) {
  const key = WEEK_KEYS[new Date(ms).getUTCDay()];
  if (calendar) {
    if ((calendar.holidays || []).includes(isoDay(ms))) return false;
    return Boolean(calendar.week?.[key]);
  }
  return key !== 'sat' && key !== 'sun';
}

/** Working days counted from an origin: index 0 is the first working day on or after it. */
export class WorkDays {
  constructor(calendar, origin) {
    this.calendar = calendar;
    let day = dayOf(origin) ?? dayOf(Date.now());
    let guard = 0;
    while (!isWorkDay(calendar, day) && guard < 400) { day += DAY; guard += 1; }
    this.days = [day];
  }
  grow(index) {
    let guard = 0;
    while (this.days.length <= index && guard < 20000) {
      let next = this.days[this.days.length - 1] + DAY;
      let skip = 0;
      while (!isWorkDay(this.calendar, next) && skip < 400) { next += DAY; skip += 1; }
      this.days.push(next);
      guard += 1;
    }
  }
  date(index) {
    const at = Math.max(0, Math.round(index));
    this.grow(at);
    return this.days[at];
  }
  /** The index of a day (a day off counts as the next working day). */
  index(ms) {
    const day = dayOf(ms);
    if (day == null || day <= this.days[0]) return 0;
    let at = 0;
    while (this.date(at) < day && at < 20000) at += 1;
    return at;
  }
  /** Working days from a to b, both ends counted. */
  between(a, b) {
    return Math.max(0, this.index(b) - this.index(a) + 1);
  }
}

// ── Shape ──

function normalizeTask(task = {}) {
  return {
    id: task.id || uid('t'),
    name: String(task.name ?? ''),
    level: Math.max(1, Math.min(9, Math.round(Number(task.level) || 1))),
    duration: task.milestone ? 0 : Math.max(1, Math.min(2000, Math.round(Number(task.duration) || 1))),
    milestone: Boolean(task.milestone),
    preds: (Array.isArray(task.preds) ? task.preds : []).filter((pred) => pred && pred.id).map((pred) => ({
      id: String(pred.id), type: DEP_TYPES.includes(pred.type) ? pred.type : 'FS', lag: Math.round(Number(pred.lag) || 0),
    })),
    assigneeId: String(task.assigneeId || ''),
    kind: TASK_KINDS.includes(task.kind) ? task.kind : 'task',
    points: task.points === '' || task.points == null || !Number.isFinite(Number(task.points)) ? null : Number(task.points),
    fixedStart: task.fixedStart ? isoDay(dayOf(task.fixedStart)) : '',
    percent: Math.max(0, Math.min(100, Math.round(Number(task.percent) || 0))),
    notes: String(task.notes || ''),
    issueId: String(task.issueId || ''),
    versionId: String(task.versionId || ''),
    baseline: task.baseline?.start ? { start: String(task.baseline.start), finish: String(task.baseline.finish || task.baseline.start) } : null,
    start: String(task.start || ''),
    finish: String(task.finish || ''),
    float: Number(task.float) || 0,
    critical: Boolean(task.critical),
  };
}

/** Gives a project its schedule (empty), keeping what it has. */
export function ensureSchedule(project, now = Date.now()) {
  // Normalised in place: callers keep hold of the schedule and its task objects.
  if (!project.schedule || typeof project.schedule !== 'object') project.schedule = {};
  const old = project.schedule;
  Object.assign(project.schedule, {
    start: isoDay(dayOf(old.start) ?? dayOf(project.created) ?? dayOf(now)),
    sprintDays: Math.max(1, Math.min(90, Math.round(Number(old.sprintDays) || 14))),
    sprintStart: old.sprintStart ? isoDay(dayOf(old.sprintStart)) : '',
    autoSchedule: old.autoSchedule !== false,
    baselineAt: String(old.baselineAt || ''),
    applied: old.applied && old.applied.mode ? { mode: old.applied.mode === 'kanban' ? 'kanban' : 'scrum', at: String(old.applied.at || '') } : null,
  });
  if (!Array.isArray(old.tasks)) old.tasks = [];
  for (let i = 0; i < old.tasks.length; i += 1) {
    const task = old.tasks[i];
    if (task && typeof task === 'object') Object.assign(task, normalizeTask(task));
    else old.tasks[i] = normalizeTask({});
  }
  // Predecessors that point at a deleted task are dropped.
  const ids = new Set(project.schedule.tasks.map((task) => task.id));
  for (const task of project.schedule.tasks) task.preds = task.preds.filter((pred) => ids.has(pred.id) && pred.id !== task.id);
  return project.schedule;
}

// ── Outline ──

export const isSummary = (tasks, at) => at + 1 < tasks.length && tasks[at + 1].level > tasks[at].level;

/** Index range [at, end) of a task and everything under it. */
export function subtree(tasks, at) {
  let end = at + 1;
  while (end < tasks.length && tasks[end].level > tasks[at].level) end += 1;
  return [at, end];
}

/** "1", "1.1", "1.2", "2" … for each task. */
export function wbsNumbers(tasks) {
  const counters = [];
  return tasks.map((task) => {
    counters.length = task.level;
    counters[task.level - 1] = (counters[task.level - 1] || 0) + 1;
    for (let i = 0; i < task.level - 1; i += 1) if (!counters[i]) counters[i] = 1;
    return counters.join('.');
  });
}

function parentIndex(tasks, at) {
  for (let i = at - 1; i >= 0; i -= 1) if (tasks[i].level < tasks[at].level) return i;
  return -1;
}

/** The summaries a task sits in, nearest first. */
export function ancestors(tasks, at) {
  const out = [];
  let i = parentIndex(tasks, at);
  while (i >= 0) { out.push(tasks[i]); i = parentIndex(tasks, i); }
  return out;
}

// ── Working out the dates ──

/**
 * Forward pass (earliest dates) and backward pass (latest dates) over the working-day calendar. A summary
 * spans its children and passes its own predecessors on to them. Writes start, finish, float, critical.
 */
export function computeSchedule(project, calendar = null) {
  const schedule = ensureSchedule(project);
  const tasks = schedule.tasks;
  const days = new WorkDays(calendar, schedule.start);
  if (!tasks.length) return { finish: '', days };
  const at = new Map(tasks.map((task, i) => [task.id, i]));
  const summary = tasks.map((_, i) => isSummary(tasks, i));
  // Predecessors including those inherited from the summaries above.
  const preds = tasks.map((task, i) => [...task.preds, ...ancestors(tasks, i).flatMap((parent) => parent.preds)]);
  const ES = tasks.map(() => 0);
  const EF = tasks.map((task) => (task.milestone ? 0 : task.duration - 1));
  const span = (i) => (tasks[i].milestone ? 0 : tasks[i].duration - 1);
  const rollUp = () => {
    for (let i = tasks.length - 1; i >= 0; i -= 1) {
      if (!summary[i]) continue;
      const [from, to] = subtree(tasks, i);
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = from + 1; j < to; j += 1) { lo = Math.min(lo, ES[j]); hi = Math.max(hi, EF[j]); }
      ES[i] = lo; EF[i] = hi;
    }
  };
  for (let pass = 0; pass < tasks.length + 2; pass += 1) {
    let changed = false;
    tasks.forEach((task, i) => {
      if (summary[i]) return;
      let start = task.fixedStart ? days.index(task.fixedStart) : 0;
      for (const pred of preds[i]) {
        const p = at.get(pred.id);
        if (p == null || p === i) continue;
        const gap = tasks[p].milestone ? 0 : 1;
        if (pred.type === 'FS') start = Math.max(start, EF[p] + gap + pred.lag);
        if (pred.type === 'SS') start = Math.max(start, ES[p] + pred.lag);
        if (pred.type === 'FF') start = Math.max(start, EF[p] + pred.lag - span(i));
        if (pred.type === 'SF') start = Math.max(start, ES[p] + pred.lag - span(i) - 1);
      }
      start = Math.max(0, start);
      if (start !== ES[i]) { ES[i] = start; changed = true; }
      EF[i] = start + span(i);
    });
    rollUp();
    if (!changed && pass > 0) break;
  }
  // Backward pass on the working tasks: how late each may finish without moving the end of the project.
  const end = Math.max(...EF);
  const LF = tasks.map(() => end);
  const successors = tasks.map(() => []);
  tasks.forEach((task, i) => {
    if (summary[i]) return;
    for (const pred of preds[i]) {
      const p = at.get(pred.id);
      if (p == null || p === i) continue;
      if (summary[p]) {
        const [from, to] = subtree(tasks, p);
        for (let j = from + 1; j < to; j += 1) if (!summary[j]) successors[j].push({ i, pred });
      } else successors[p].push({ i, pred });
    }
  });
  for (let pass = 0; pass < tasks.length + 2; pass += 1) {
    let changed = false;
    for (let t = tasks.length - 1; t >= 0; t -= 1) {
      if (summary[t]) continue;
      let late = end;
      for (const { i, pred } of successors[t]) {
        const LS = LF[i] - span(i);
        const gap = tasks[t].milestone ? 0 : 1;
        if (pred.type === 'FS') late = Math.min(late, LS - gap - pred.lag);
        if (pred.type === 'SS') late = Math.min(late, LS - pred.lag + span(t));
        if (pred.type === 'FF') late = Math.min(late, LF[i] - pred.lag);
        if (pred.type === 'SF') late = Math.min(late, LF[i] - pred.lag + span(t) + 1);
      }
      if (late !== LF[t]) { LF[t] = late; changed = true; }
    }
    if (!changed) break;
  }
  tasks.forEach((task, i) => {
    task.start = isoDay(days.date(ES[i]));
    task.finish = isoDay(days.date(EF[i]));
    if (!summary[i]) {
      task.float = Math.max(0, LF[i] - EF[i]);
      task.critical = LF[i] - EF[i] <= 0;
    }
  });
  for (let i = tasks.length - 1; i >= 0; i -= 1) {
    if (!summary[i]) continue;
    const [from, to] = subtree(tasks, i);
    const kids = tasks.slice(from + 1, to).filter((_, k) => !summary[from + 1 + k]);
    tasks[i].critical = kids.some((kid) => kid.critical);
    tasks[i].float = kids.length ? Math.min(...kids.map((kid) => kid.float)) : 0;
    tasks[i].duration = Math.max(1, EF[i] - ES[i] + 1);
  }
  return { finish: isoDay(days.date(end)), days };
}

/** Working days of a summary or a task as shown in the table. */
export function shownDuration(tasks, at) {
  return tasks[at].milestone ? 0 : tasks[at].duration;
}

// ── Predecessor text ("3FS+2d; 5SS-1; 7") ──

export function formatPreds(tasks, task) {
  const rows = new Map(tasks.map((item, i) => [item.id, i + 1]));
  return task.preds.filter((pred) => rows.has(pred.id)).map((pred) => `${rows.get(pred.id)}${pred.type === 'FS' && !pred.lag ? '' : pred.type}${pred.lag ? `${pred.lag > 0 ? '+' : ''}${pred.lag}d` : ''}`).join('; ');
}

export function parsePreds(tasks, text, selfId = '') {
  const out = [];
  for (const part of String(text || '').split(/[;,\s]+/).filter(Boolean)) {
    const match = /^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*[dD일]?$/i.exec(part.trim());
    if (!match) throw new Error('pred-invalid');
    const task = tasks[Number(match[1]) - 1];
    if (!task || task.id === selfId) throw new Error('pred-invalid');
    out.push({ id: task.id, type: (match[2] || 'FS').toUpperCase(), lag: match[3] ? Number(match[3].replace(/\s/g, '')) : 0 });
  }
  return out;
}

/** True when making `fromId` a predecessor of `toId` would close a loop. */
export function predCycle(tasks, fromId, toId) {
  const index = new Map(tasks.map((task, i) => [task.id, i]));
  const inside = (id) => { const at = index.get(id); if (at == null) return []; const [from, to] = subtree(tasks, at); return tasks.slice(from, to).map((task) => task.id); };
  // A summary and its own tasks cannot wait for each other.
  if (inside(fromId).includes(toId) || inside(toId).includes(fromId)) return true;
  // A link to or from a summary is a link to or from everything in it.
  const next = new Map(tasks.map((task) => [task.id, []]));
  for (const task of tasks) for (const pred of task.preds) for (const a of inside(pred.id)) for (const b of inside(task.id)) next.get(a)?.push(b);
  for (const b of inside(toId)) for (const a of inside(fromId)) if (a === b) return true;
  const seeds = inside(toId);
  const targets = new Set(inside(fromId));
  const seen = new Set();
  const stack = [...seeds];
  while (stack.length) {
    const id = stack.pop();
    if (targets.has(id)) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) || []));
  }
  return false;
}

// ── Editing ──

function taskIndex(schedule, taskId) {
  const at = schedule.tasks.findIndex((task) => task.id === taskId);
  if (at < 0) throw new Error('not-found');
  return at;
}

/** Adds a task after another (and its subtree), or at the end. `child` puts it one level below. */
export function addTask(project, { afterId = '', child = false, name = '', duration = 5, milestone = false, kind = 'task' } = {}) {
  const schedule = ensureSchedule(project);
  const tasks = schedule.tasks;
  let insert = tasks.length;
  let level = 1;
  if (afterId) {
    const at = taskIndex(schedule, afterId);
    level = tasks[at].level + (child ? 1 : 0);
    insert = child ? at + 1 : subtree(tasks, at)[1];
  }
  const task = normalizeTask({ name, level, duration, milestone, kind });
  tasks.splice(insert, 0, task);
  return task;
}

export function updateTask(project, taskId, patch) {
  const schedule = ensureSchedule(project);
  const at = taskIndex(schedule, taskId);
  const task = schedule.tasks[at];
  const next = { ...task };
  if (patch.name != null) next.name = String(patch.name);
  if (patch.duration != null) {
    const days = Math.round(Number(String(patch.duration).replace(/[^\d.-]/g, '')));
    if (!Number.isFinite(days) || days < 0) throw new Error('duration-invalid');
    next.milestone = days === 0;
    next.duration = days || 0;
  }
  if (patch.milestone != null) { next.milestone = Boolean(patch.milestone); if (!next.milestone && !next.duration) next.duration = 1; }
  if (patch.fixedStart != null) next.fixedStart = patch.fixedStart;
  if (patch.preds != null) {
    const preds = typeof patch.preds === 'string' ? parsePreds(schedule.tasks, patch.preds, task.id) : patch.preds;
    for (const pred of preds) if (predCycle(schedule.tasks, pred.id, task.id)) throw new Error('dependency-cycle');
    next.preds = preds;
  }
  for (const key of ['assigneeId', 'kind', 'points', 'percent', 'notes']) if (patch[key] != null) next[key] = patch[key];
  return Object.assign(task, normalizeTask(next));
}

/** Moves a task (with what is under it) one level in or out. */
export function indentTask(project, taskId, delta) {
  const schedule = ensureSchedule(project);
  const tasks = schedule.tasks;
  const at = taskIndex(schedule, taskId);
  const [from, to] = subtree(tasks, at);
  if (delta > 0 && (at === 0 || tasks[at - 1].level < tasks[at].level)) return;
  if (delta < 0 && tasks[at].level === 1) return;
  for (let i = from; i < to; i += 1) tasks[i].level = Math.max(1, Math.min(9, tasks[i].level + (delta > 0 ? 1 : -1)));
}

/** Moves a task (with what is under it) above the previous sibling or below the next one. */
export function moveTask(project, taskId, delta) {
  const schedule = ensureSchedule(project);
  const tasks = schedule.tasks;
  const at = taskIndex(schedule, taskId);
  const [from, to] = subtree(tasks, at);
  const block = tasks.slice(from, to);
  if (delta < 0) {
    let prev = from - 1;
    while (prev >= 0 && tasks[prev].level > tasks[at].level) prev -= 1;
    if (prev < 0 || tasks[prev].level < tasks[at].level) return;
    tasks.splice(from, block.length);
    tasks.splice(prev, 0, ...block);
  } else {
    if (to >= tasks.length || tasks[to].level < tasks[at].level) return;
    const [, nextEnd] = subtree(tasks, to);
    const after = nextEnd - block.length;
    tasks.splice(from, block.length);
    tasks.splice(after, 0, ...block);
  }
}

/** Deletes a task and everything under it; links to them go too. Returns the issues they had made. */
export function deleteTask(project, taskId) {
  const schedule = ensureSchedule(project);
  const at = taskIndex(schedule, taskId);
  const [from, to] = subtree(schedule.tasks, at);
  const gone = schedule.tasks.splice(from, to - from);
  const ids = new Set(gone.map((task) => task.id));
  for (const task of schedule.tasks) task.preds = task.preds.filter((pred) => !ids.has(pred.id));
  return gone.map((task) => task.issueId).filter(Boolean);
}

/** Keeps today's dates as the baseline to compare against. */
export function saveBaseline(project, now = new Date().toISOString()) {
  const schedule = ensureSchedule(project);
  for (const task of schedule.tasks) task.baseline = { start: task.start, finish: task.finish };
  schedule.baselineAt = now;
}

export function clearBaseline(project) {
  const schedule = ensureSchedule(project);
  for (const task of schedule.tasks) task.baseline = null;
  schedule.baselineAt = '';
}

/** Days a task finishes later (+) or earlier (−) than its baseline, in calendar days. */
export function slip(task) {
  if (!task.baseline?.finish || !task.finish) return 0;
  return Math.round((dayOf(task.finish) - dayOf(task.baseline.finish)) / DAY);
}

// ── Progress (from the issue once the task has one) ──

export function taskPercent(project, task) {
  const issue = task.issueId ? (project.issues || []).find((item) => item.id === task.issueId) : null;
  if (!issue) return task.percent;
  const category = byId(project.statuses, issue.statusId)?.category;
  if (category === 'done') return 100;
  if (category === 'indeterminate') {
    const spent = Number(issue.timeSpent) || 0;
    const left = Number(issue.remainingEstimate);
    if (spent > 0 && Number.isFinite(left) && spent + left > 0) return Math.max(5, Math.min(95, Math.round((spent / (spent + left)) * 100)));
    return 50;
  }
  return 0;
}

/** Progress of every task; a summary is the duration-weighted progress of its working tasks. */
export function progressOf(project) {
  const tasks = ensureSchedule(project).tasks;
  const out = new Map();
  tasks.forEach((task, i) => { if (!isSummary(tasks, i)) out.set(task.id, task.milestone ? (taskPercent(project, task) >= 100 ? 100 : taskPercent(project, task)) : taskPercent(project, task)); });
  tasks.forEach((task, i) => {
    if (!isSummary(tasks, i)) return;
    const [from, to] = subtree(tasks, i);
    let weight = 0;
    let sum = 0;
    for (let j = from + 1; j < to; j += 1) {
      if (isSummary(tasks, j) || tasks[j].milestone) continue;
      weight += tasks[j].duration;
      sum += tasks[j].duration * out.get(tasks[j].id);
    }
    out.set(task.id, weight ? Math.round(sum / weight) : 0);
  });
  return out;
}

/** Totals for the head of the schedule screen. */
export function scheduleSummary(project, calendar = null, now = Date.now()) {
  const schedule = ensureSchedule(project);
  const tasks = schedule.tasks;
  const progress = progressOf(project);
  const work = tasks.filter((_, i) => !isSummary(tasks, i) && !tasks[i].milestone);
  const weight = work.reduce((sum, task) => sum + task.duration, 0);
  const done = work.reduce((sum, task) => sum + task.duration * (progress.get(task.id) || 0), 0);
  const today = dayOf(now);
  const late = work.filter((task) => task.finish && dayOf(task.finish) < today && (progress.get(task.id) || 0) < 100);
  const finish = tasks.reduce((max, task) => (task.finish > max ? task.finish : max), '');
  return {
    tasks: work.length,
    milestones: tasks.filter((task) => task.milestone).length,
    start: schedule.start,
    finish,
    workDays: finish ? new WorkDays(calendar, schedule.start).between(schedule.start, finish) : 0,
    percent: weight ? Math.round(done / weight) : 0,
    critical: work.filter((task) => task.critical).length,
    late: late.length,
    linked: tasks.filter((task) => task.issueId && (project.issues || []).some((issue) => issue.id === task.issueId)).length,
  };
}

/** Sprint windows of `sprintDays` calendar days from the sprint start until the schedule's finish. */
export function sprintWindows(project, { sprintDays, start, count = 0 } = {}) {
  const schedule = ensureSchedule(project);
  const length = Math.max(1, Math.round(Number(sprintDays ?? schedule.sprintDays) || 14));
  const first = dayOf(start || schedule.sprintStart || schedule.start);
  const finish = schedule.tasks.reduce((max, task) => Math.max(max, dayOf(task.finish) ?? 0), first);
  const windows = [];
  for (let from = first; (count ? windows.length < count : from <= finish) && windows.length < 200; from += length * DAY) {
    windows.push({ start: from, end: from + (length - 1) * DAY });
  }
  return windows;
}

// ── Files: Microsoft Project XML (MSPDI) and CSV ──

const xml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MS_TYPE = { FF: 0, FS: 1, SF: 2, SS: 3 };
const MS_TYPE_BACK = ['FF', 'FS', 'SF', 'SS'];

/** The schedule as Microsoft Project XML (MSPDI): tasks, outline, links with lags, resources and assignments. */
export function toProjectXml(project, ws = null, calendar = null) {
  const schedule = ensureSchedule(project);
  computeSchedule(project, calendar);
  const tasks = schedule.tasks;
  const wbs = wbsNumbers(tasks);
  const uidOf = new Map(tasks.map((task, i) => [task.id, i + 1]));
  const people = [...new Set(tasks.map((task) => task.assigneeId).filter(Boolean))];
  const nameOfUser = (id) => (ws?.users || []).find((user) => user.id === id)?.name || id;
  const hours = (days) => `PT${days * 8}H0M0S`;
  const taskXml = tasks.map((task, i) => `    <Task>
      <UID>${i + 1}</UID>
      <ID>${i + 1}</ID>
      <Name>${xml(task.name)}</Name>
      <WBS>${wbs[i]}</WBS>
      <OutlineNumber>${wbs[i]}</OutlineNumber>
      <OutlineLevel>${task.level}</OutlineLevel>
      <Start>${task.start}T09:00:00</Start>
      <Finish>${task.finish}T18:00:00</Finish>
      <Duration>${hours(task.milestone ? 0 : task.duration)}</Duration>
      <DurationFormat>7</DurationFormat>
      <Milestone>${task.milestone ? 1 : 0}</Milestone>
      <Summary>${isSummary(tasks, i) ? 1 : 0}</Summary>
      <Critical>${task.critical ? 1 : 0}</Critical>
      <PercentComplete>${progressOf(project).get(task.id) || 0}</PercentComplete>
      ${task.fixedStart ? `<ConstraintType>4</ConstraintType>\n      <ConstraintDate>${task.fixedStart}T09:00:00</ConstraintDate>` : '<ConstraintType>0</ConstraintType>'}
      ${task.notes ? `<Notes>${xml(task.notes)}</Notes>` : ''}
${task.preds.filter((pred) => uidOf.has(pred.id)).map((pred) => `      <PredecessorLink>
        <PredecessorUID>${uidOf.get(pred.id)}</PredecessorUID>
        <Type>${MS_TYPE[pred.type]}</Type>
        <LinkLag>${pred.lag * 8 * 600}</LinkLag>
        <LagFormat>7</LagFormat>
      </PredecessorLink>`).join('\n')}
    </Task>`.replace(/\n\s*\n/g, '\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>${xml(project.name)}</Name>
  <Title>${xml(project.name)}</Title>
  <StartDate>${schedule.start}T09:00:00</StartDate>
  <ScheduleFromStart>1</ScheduleFromStart>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <Tasks>
${taskXml}
  </Tasks>
  <Resources>
${people.map((id, i) => `    <Resource>\n      <UID>${i + 1}</UID>\n      <ID>${i + 1}</ID>\n      <Name>${xml(nameOfUser(id))}</Name>\n    </Resource>`).join('\n')}
  </Resources>
  <Assignments>
${tasks.map((task, i) => (task.assigneeId ? `    <Assignment>\n      <UID>${i + 1}</UID>\n      <TaskUID>${i + 1}</TaskUID>\n      <ResourceUID>${people.indexOf(task.assigneeId) + 1}</ResourceUID>\n    </Assignment>` : '')).filter(Boolean).join('\n')}
  </Assignments>
</Project>
`;
}

/** Working days from an MSPDI duration such as "PT40H0M0S" (8-hour days). */
function msDays(value) {
  const match = /^-?P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?/.exec(String(value || '').trim());
  if (!match) return 0;
  return Math.round(((Number(match[1]) || 0) * 8 + (Number(match[2]) || 0) + (Number(match[3]) || 0) / 60) / 8);
}

/**
 * Reads Microsoft Project XML into { name, start, tasks } (tasks in the schedule's own shape, with resource
 * names in `resource` to match against people). Uses the XML reader from requirements.js.
 */
export function parseProjectXml(source, parseXml) {
  const root = parseXml(source);
  const local = (name) => String(name).replace(/^.*:/, '');
  const find = (node, name) => node?.children.find((child) => local(child.name) === name);
  const text = (node, name) => (find(node, name)?.text || '').trim();
  const projectNode = root.children.find((child) => local(child.name) === 'Project');
  if (!projectNode) throw new Error('file-invalid');
  const taskNodes = (find(projectNode, 'Tasks')?.children || []).filter((node) => local(node.name) === 'Task');
  const resources = new Map((find(projectNode, 'Resources')?.children || []).map((node) => [text(node, 'UID'), text(node, 'Name')]));
  const assigned = new Map();
  for (const node of find(projectNode, 'Assignments')?.children || []) {
    const name = resources.get(text(node, 'ResourceUID'));
    if (name && !assigned.has(text(node, 'TaskUID'))) assigned.set(text(node, 'TaskUID'), name);
  }
  const byUid = new Map();
  const tasks = [];
  for (const node of taskNodes) {
    const uidText = text(node, 'UID');
    const level = Number(text(node, 'OutlineLevel')) || 1;
    // Project's own "project summary" task (outline level 0) is not a task of the plan.
    if (text(node, 'OutlineLevel') === '0' || uidText === '0') continue;
    if (!text(node, 'Name') && !text(node, 'Start')) continue;
    const milestone = text(node, 'Milestone') === '1';
    const task = normalizeTask({
      name: text(node, 'Name'),
      level,
      duration: milestone ? 0 : Math.max(1, msDays(text(node, 'Duration'))),
      milestone,
      fixedStart: ['4', '2'].includes(text(node, 'ConstraintType')) ? text(node, 'ConstraintDate').slice(0, 10) : '',
      percent: Number(text(node, 'PercentComplete')) || 0,
      notes: text(node, 'Notes'),
      start: text(node, 'Start').slice(0, 10),
      finish: text(node, 'Finish').slice(0, 10),
    });
    task.resource = assigned.get(uidText) || '';
    task.rawPreds = node.children.filter((child) => local(child.name) === 'PredecessorLink').map((link) => ({
      uid: text(link, 'PredecessorUID'),
      type: MS_TYPE_BACK[Number(text(link, 'Type'))] || 'FS',
      // LinkLag is in tenths of a minute; 4800 = one 8-hour day.
      lag: Math.round((Number(text(link, 'LinkLag')) || 0) / 4800),
    }));
    byUid.set(uidText, task);
    tasks.push(task);
  }
  for (const task of tasks) {
    task.preds = task.rawPreds.map((pred) => ({ id: byUid.get(pred.uid)?.id, type: pred.type, lag: pred.lag })).filter((pred) => pred.id);
    delete task.rawPreds;
  }
  const start = text(projectNode, 'StartDate').slice(0, 10) || tasks.map((task) => task.start).filter(Boolean).sort()[0] || '';
  return { name: text(projectNode, 'Name') || text(projectNode, 'Title'), start, tasks };
}

const csvCell = (value) => { const body = String(value ?? ''); return /[",\r\n]/.test(body) ? `"${body.replace(/"/g, '""')}"` : body; };
export const SCHEDULE_CSV = ['ID', 'WBS', 'Level', 'Name', 'Duration', 'Start', 'Finish', 'Predecessors', 'Resource', 'Milestone', 'Kind', 'Points', '% Complete'];

export function toScheduleCsv(project, ws = null, calendar = null) {
  computeSchedule(project, calendar);
  const tasks = ensureSchedule(project).tasks;
  const wbs = wbsNumbers(tasks);
  const progress = progressOf(project);
  const lines = [SCHEDULE_CSV.join(',')];
  tasks.forEach((task, i) => {
    const person = (ws?.users || []).find((user) => user.id === task.assigneeId)?.name || '';
    lines.push([i + 1, wbs[i], task.level, task.name, task.milestone ? 0 : task.duration, task.start, task.finish, formatPreds(tasks, task), person, task.milestone ? 'yes' : '', task.kind, task.points ?? '', progress.get(task.id) || 0].map(csvCell).join(','));
  });
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Reads the schedule CSV (rows: ID, Level or WBS, Name, Duration, Predecessors by ID, Resource …). */
export function parseScheduleCsv(rows) {
  const get = (row, ...names) => { for (const name of names) { const value = row[name.toLowerCase()]; if (value != null && String(value).trim() !== '') return String(value).trim(); } return ''; };
  const tasks = [];
  const byRow = new Map();
  rows.forEach((row, i) => {
    const name = get(row, 'Name', 'Task', '작업', '이름', 'Task name');
    if (!name) return;
    const wbs = get(row, 'WBS');
    const level = Number(get(row, 'Level', '수준')) || (wbs ? wbs.split('.').length : 1);
    const milestone = /^(yes|y|1|true|예|o)$/i.test(get(row, 'Milestone', '마일스톤')) || get(row, 'Duration', '기간') === '0';
    const task = normalizeTask({
      name, level, milestone,
      duration: Number(String(get(row, 'Duration', '기간')).replace(/[^\d.]/g, '')) || 1,
      kind: get(row, 'Kind', '종류'), points: get(row, 'Points', '포인트'),
      percent: Number(get(row, '% Complete', 'Percent', '완료율').replace('%', '')) || 0,
      fixedStart: get(row, 'Fixed start', '고정 시작'),
    });
    task.resource = get(row, 'Resource', 'Resource Names', '담당', '자원');
    task.rawPreds = get(row, 'Predecessors', '선행 작업', '선행');
    byRow.set(get(row, 'ID') || String(i + 1), task);
    tasks.push(task);
  });
  // Predecessors name rows by their ID column.
  const ids = [...byRow.keys()];
  for (const task of tasks) {
    const preds = [];
    for (const part of String(task.rawPreds || '').split(/[;,\s]+/).filter(Boolean)) {
      const match = /^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?/i.exec(part);
      const other = match && byRow.get(match[1]);
      if (other && other.id !== task.id) preds.push({ id: other.id, type: (match[2] || 'FS').toUpperCase(), lag: match[3] ? Number(match[3].replace(/\s/g, '')) : 0 });
    }
    task.preds = preds;
    delete task.rawPreds;
  }
  void ids;
  return { tasks };
}

/** Replaces (or appends to) a project's schedule with imported tasks, matching resource names to people. */
export function importSchedule(project, ws, imported, { replace = true } = {}) {
  const schedule = ensureSchedule(project);
  const person = (name) => (ws?.users || []).find((user) => user.name === name || user.email === name || user.login === name)?.id || '';
  const tasks = imported.tasks.map((task) => normalizeTask({ ...task, assigneeId: task.assigneeId || person(task.resource), issueId: '', versionId: '' }));
  if (imported.start && replace) schedule.start = isoDay(dayOf(imported.start));
  schedule.tasks = replace ? tasks : [...schedule.tasks, ...tasks];
  return tasks.length;
}

// ── The planner calendar: what happens on which days ──

/**
 * Everything with dates for the planner: schedule tasks (those not yet turned into issues), issues with a
 * start or due date, sprints and release versions. `mine` keeps the person's own tasks and issues.
 */
export function plannerItems(ws, { projectIds = null, userId = '', mine = false, kinds = null } = {}) {
  const want = (kind) => !kinds || kinds.includes(kind);
  const items = [];
  for (const project of ws.projects || []) {
    if (project.archived) continue;
    if (projectIds && !projectIds.includes(project.id)) continue;
    const linked = new Set();
    if (want('task')) {
      const tasks = ensureSchedule(project).tasks;
      const progress = progressOf(project);
      tasks.forEach((task, i) => {
        if (task.issueId && (project.issues || []).some((issue) => issue.id === task.issueId)) { linked.add(task.issueId); if (!isSummary(tasks, i)) return; }
        if (!task.start || isSummary(tasks, i)) return;
        // A milestone that became a release version shows as that version.
        if (task.milestone && task.versionId && (project.versions || []).some((version) => version.id === task.versionId) && want('version')) return;
        if (mine && task.assigneeId !== userId) return;
        items.push({ kind: task.milestone ? 'milestone' : 'task', id: task.id, projectId: project.id, project: project.key, title: task.name, start: dayOf(task.start), end: dayOf(task.finish || task.start), done: (progress.get(task.id) || 0) >= 100, critical: task.critical, assigneeId: task.assigneeId });
      });
    }
    if (want('issue')) {
      for (const issue of project.issues || []) {
        if (!issue.start && !issue.due) continue;
        if (mine && issue.assigneeId !== userId) continue;
        const status = byId(project.statuses, issue.statusId);
        const start = dayOf(issue.start) ?? dayOf(issue.due);
        const end = dayOf(issue.due) ?? start;
        items.push({ kind: 'issue', id: issue.id, projectId: project.id, project: project.key, key: issue.key, title: issue.summary, start: Math.min(start, end), end: Math.max(start, end), done: status?.category === 'done', color: status?.color, typeId: issue.typeId, assigneeId: issue.assigneeId, fromPlan: linked.has(issue.id) });
      }
    }
    if (want('sprint') && !mine) {
      for (const sprint of project.sprints || []) {
        if (!sprint.start || !sprint.end) continue;
        items.push({ kind: 'sprint', id: sprint.id, projectId: project.id, project: project.key, title: sprint.name, start: dayOf(sprint.start), end: dayOf(sprint.end), done: sprint.state === 'closed', state: sprint.state });
      }
    }
    if (want('version') && !mine) {
      for (const version of project.versions || []) {
        if (!version.releaseDate) continue;
        items.push({ kind: 'version', id: version.id, projectId: project.id, project: project.key, title: version.name, start: dayOf(version.releaseDate), end: dayOf(version.releaseDate), done: Boolean(version.released) });
      }
    }
  }
  return items.filter((item) => item.start != null).sort((a, b) => a.start - b.start || a.end - b.end || String(a.title).localeCompare(String(b.title)));
}

/** Items touching the days [from, to] (day values). */
export const itemsIn = (items, from, to) => items.filter((item) => item.start <= to && item.end >= from);
