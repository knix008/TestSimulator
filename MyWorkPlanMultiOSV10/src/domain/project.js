// The project model and every edit made to it. Tasks are kept as one ordered
// list with outline levels (like MS Project's rows): a task followed by tasks
// of a deeper level is a summary task. Functions here change the project in
// place; the document wraps them for undo (document.js). Dates are computed by
// schedule.js — tasks store only what the user decided.
//
// project = { format, version, id, title, start, finish, scheduleFrom, statusDate, calendarId,
//             options, calendars[], resources[], tasks[], assignments[], properties… }
// task = { id, name, outlineLevel, manual, duration, durationUnit, estimated, start, finish,
//          milestone, percentComplete, actualStart, actualFinish, constraint: { type, date },
//          deadline, priority, type, effortDriven, fixedCost, notes, calendarId,
//          predecessors: [{ taskId, type, lag, lagUnit }], active, collapsed, hyperlink,
//          text1…text3, number1, flag1, barColor, levelingDelay, baselines: { 0: {…} }, recurring }
// resource = { id, name, type, initials, group, email, maxUnits, stdRate, ovtRate, costPerUse,
//              accrue, calendarId, materialLabel, notes }
// assignment = { id, taskId, resourceId, units, work?, cost? }
import { defaultCalendars, normalizePeriods } from './calendars.js';
import { DEFAULT_OPTIONS, unitMinutes } from './duration.js';
import { dayOf, dayStart, fromMin, nowMin, toMin, weekdayOfDay } from './time.js';

export const FORMAT = 'myworkplan';
export const VERSION = 1;
export const CONSTRAINTS = ['ASAP', 'ALAP', 'SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO'];
export const DATED_CONSTRAINTS = ['SNET', 'SNLT', 'FNET', 'FNLT', 'MSO', 'MFO'];
export const TASK_TYPES = ['fixedUnits', 'fixedDuration', 'fixedWork'];
export const RESOURCE_TYPES = ['work', 'material', 'cost'];
export const ACCRUALS = ['prorated', 'start', 'end'];
export const BAR_COLORS = ['', '#3a6cf0', '#139a8c', '#2f8a4c', '#e2602b', '#d63384', '#7c4dff', '#f4a21a', '#6b7280'];
export const MAX_LEVEL = 9;

let counter = 0;
export function newId(prefix = 'id') {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultOptions(language = 'ko') {
  return {
    ...DEFAULT_OPTIONS,
    defaultStart: 480,
    defaultFinish: 1020,
    weekStart: 1,
    currency: language === 'en' ? '$' : '₩',
    defaultTaskMode: 'auto',
    defaultDurationUnit: 'd',
    defaultTaskType: 'fixedUnits',
    effortDriven: false,
    criticalSlack: 0,
    honorConstraints: true,
    autoCalculate: true,
    defaultStdRate: 0,
    defaultOvtRate: 0,
    newTaskDuration: 1,
  };
}

/** Next working morning (Monday–Friday 08:00) from today. */
export function defaultStartDate() {
  let day = dayOf(nowMin());
  while ([0, 6].includes(weekdayOfDay(day))) day += 1;
  return fromMin(dayStart(day) + 480);
}

export function createProject({ title = 'Project', start = defaultStartDate(), language = 'ko', calendarNames = {} } = {}) {
  return {
    format: FORMAT,
    version: VERSION,
    id: newId('prj'),
    title,
    subject: '',
    author: '',
    manager: '',
    company: '',
    category: '',
    keywords: '',
    comments: '',
    start,
    finish: null,
    scheduleFrom: 'start',
    statusDate: null,
    calendarId: 'standard',
    priority: 500,
    options: defaultOptions(language),
    calendars: defaultCalendars(calendarNames),
    resources: [],
    tasks: [],
    assignments: [],
    baselineDates: {},
    customFields: { text1: '', text2: '', text3: '', number1: '', flag1: '' },
    created: fromMin(nowMin()),
  };
}

export function createTask(project, data = {}) {
  const options = project.options ?? defaultOptions();
  const unit = data.durationUnit ?? options.defaultDurationUnit ?? 'd';
  const milestone = Boolean(data.milestone);
  return {
    id: data.id ?? newId('t'),
    name: data.name ?? '',
    outlineLevel: data.outlineLevel ?? 1,
    manual: data.manual ?? options.defaultTaskMode === 'manual',
    duration: data.duration ?? (milestone ? 0 : (options.newTaskDuration ?? 1) * unitMinutes(unit, options)),
    durationUnit: unit,
    estimated: data.estimated ?? (data.duration == null && !milestone),
    start: data.start ?? null,
    finish: data.finish ?? null,
    milestone,
    percentComplete: data.percentComplete ?? 0,
    actualStart: data.actualStart ?? null,
    actualFinish: data.actualFinish ?? null,
    constraint: data.constraint ?? { type: 'ASAP', date: null },
    deadline: data.deadline ?? null,
    priority: data.priority ?? 500,
    type: data.type ?? options.defaultTaskType ?? 'fixedUnits',
    effortDriven: data.effortDriven ?? Boolean(options.effortDriven),
    fixedCost: data.fixedCost ?? 0,
    fixedCostAccrual: data.fixedCostAccrual ?? 'prorated',
    work: data.work ?? null,
    notes: data.notes ?? '',
    calendarId: data.calendarId ?? null,
    predecessors: data.predecessors ?? [],
    active: data.active ?? true,
    collapsed: data.collapsed ?? false,
    hyperlink: data.hyperlink ?? '',
    text1: data.text1 ?? '',
    text2: data.text2 ?? '',
    text3: data.text3 ?? '',
    number1: data.number1 ?? 0,
    flag1: data.flag1 ?? false,
    barColor: data.barColor ?? '',
    hideBar: data.hideBar ?? false,
    timeline: data.timeline ?? false,
    levelingDelay: data.levelingDelay ?? 0,
    baselines: data.baselines ?? {},
    recurring: data.recurring ?? null,
    created: data.created ?? fromMin(nowMin()),
  };
}

export function createResource(project, data = {}) {
  const options = project.options ?? defaultOptions();
  const name = data.name ?? '';
  return {
    id: data.id ?? newId('r'),
    name,
    type: RESOURCE_TYPES.includes(data.type) ? data.type : 'work',
    initials: data.initials ?? initialsOf(name),
    group: data.group ?? '',
    email: data.email ?? '',
    maxUnits: data.maxUnits ?? 1,
    stdRate: data.stdRate ?? options.defaultStdRate ?? 0,
    ovtRate: data.ovtRate ?? options.defaultOvtRate ?? 0,
    costPerUse: data.costPerUse ?? 0,
    accrue: data.accrue ?? 'prorated',
    calendarId: data.calendarId ?? null,
    materialLabel: data.materialLabel ?? '',
    code: data.code ?? '',
    notes: data.notes ?? '',
  };
}

export const initialsOf = (name) => String(name ?? '').trim().split(/\s+/).filter(Boolean).map((word) => [...word][0]).join('').slice(0, 3).toUpperCase();

// ───────────────────────── lookups and outline structure

export const taskIndex = (project, id) => project.tasks.findIndex((task) => task.id === id);
export const findTask = (project, id) => project.tasks.find((task) => task.id === id) ?? null;
export const findResource = (project, id) => project.resources.find((resource) => resource.id === id) ?? null;
/** Row number shown as the task ID (1-based). */
export const rowOf = (project, id) => taskIndex(project, id) + 1;
export const taskAtRow = (project, row) => project.tasks[row - 1] ?? null;

/** Parent and children of every task, and WBS codes ("1.2.3"). */
export function outline(project) {
  const parent = new Map();
  const children = new Map();
  const wbs = new Map();
  const stack = [];
  const counters = [0];
  for (const task of project.tasks) {
    const level = Math.max(1, Math.min(task.outlineLevel ?? 1, stack.length + 1));
    while (stack.length >= level) stack.pop();
    const up = stack[stack.length - 1] ?? null;
    parent.set(task.id, up?.id ?? null);
    if (up) {
      if (!children.has(up.id)) children.set(up.id, []);
      children.get(up.id).push(task.id);
    }
    counters.length = level;
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    wbs.set(task.id, counters.slice(0, level).join('.'));
    stack.push(task);
  }
  return { parent, children, wbs, isSummary: (id) => (children.get(id)?.length ?? 0) > 0 };
}

/** The task, then every task under it (the rows it spans). */
export function subtreeRange(project, id) {
  const start = taskIndex(project, id);
  if (start < 0) return [0, 0];
  const level = project.tasks[start].outlineLevel;
  let end = start + 1;
  while (end < project.tasks.length && project.tasks[end].outlineLevel > level) end += 1;
  return [start, end];
}

export const descendants = (project, id) => {
  const [start, end] = subtreeRange(project, id);
  return project.tasks.slice(start + 1, end).map((task) => task.id);
};

export function ancestors(project, id) {
  const { parent } = outline(project);
  const out = [];
  for (let up = parent.get(id); up; up = parent.get(up)) out.push(up);
  return out;
}

/** Rows visible with collapsed summaries hidden. */
export function visibleTasks(project) {
  const out = [];
  let hideBelow = Infinity;
  for (const task of project.tasks) {
    if (task.outlineLevel > hideBelow) continue;
    hideBelow = Infinity;
    out.push(task);
    if (task.collapsed) hideBelow = task.outlineLevel;
  }
  return out;
}

/** Keeps outline levels valid: the first row is level 1, no row is more than one deeper than the row above. */
export function fixOutline(project) {
  let previous = 0;
  for (const task of project.tasks) {
    task.outlineLevel = Math.max(1, Math.min(MAX_LEVEL, Math.round(task.outlineLevel || 1), previous + 1));
    previous = task.outlineLevel;
  }
}

/** Only the topmost of the given tasks (dropping those inside another selected subtree). */
export function topmost(project, ids) {
  const set = new Set(ids);
  const out = [];
  let skipLevel = Infinity;
  for (const task of project.tasks) {
    if (task.outlineLevel > skipLevel) continue;
    skipLevel = Infinity;
    if (set.has(task.id)) { out.push(task.id); skipLevel = task.outlineLevel; }
  }
  return out;
}

// ───────────────────────── tasks

/** Inserts a new task at row index `index` (0-based; end when omitted). Level follows the row above unless given. */
export function insertTask(project, index = project.tasks.length, data = {}) {
  const at = Math.max(0, Math.min(index, project.tasks.length));
  const above = project.tasks[at - 1];
  const below = project.tasks[at];
  // Inserting just above a deeper row (inside a summary) keeps the new task inside it.
  const level = data.outlineLevel ?? Math.max(above?.outlineLevel ?? 1, below && above && below.outlineLevel > above.outlineLevel ? below.outlineLevel : 1);
  const task = createTask(project, { ...data, outlineLevel: level });
  project.tasks.splice(at, 0, task);
  fixOutline(project);
  return task;
}

export function updateTask(project, id, patch) {
  const task = findTask(project, id);
  if (!task) return null;
  Object.assign(task, patch);
  if ('milestone' in patch && patch.milestone) task.duration = 0;
  // A duration of zero makes a milestone; any other duration a normal task.
  if ('duration' in patch && !('milestone' in patch)) task.milestone = patch.duration === 0;
  if ('percentComplete' in patch) task.percentComplete = Math.max(0, Math.min(100, Math.round(Number(patch.percentComplete) || 0)));
  if ('priority' in patch) task.priority = Math.max(0, Math.min(1000, Math.round(Number(patch.priority) || 0)));
  return task;
}

/** Deletes tasks with everything under them, their links and their assignments. */
export function deleteTasks(project, ids) {
  const remove = new Set();
  for (const id of ids) {
    if (!findTask(project, id)) continue;
    remove.add(id);
    for (const child of descendants(project, id)) remove.add(child);
  }
  project.tasks = project.tasks.filter((task) => !remove.has(task.id));
  for (const task of project.tasks) task.predecessors = (task.predecessors ?? []).filter((link) => !remove.has(link.taskId));
  project.assignments = project.assignments.filter((assignment) => !remove.has(assignment.taskId));
  fixOutline(project);
  return remove.size;
}

/** Indent: each selected task (with its subtree) goes one level deeper, under the task above. */
export function indentTasks(project, ids) {
  let changed = 0;
  for (const id of topmost(project, ids)) {
    const [start, end] = subtreeRange(project, id);
    const above = project.tasks[start - 1];
    if (!above || above.outlineLevel < project.tasks[start].outlineLevel || project.tasks[start].outlineLevel >= MAX_LEVEL) continue;
    // A link between a task and its new summary is not allowed: drop it.
    for (let i = start; i < end; i++) project.tasks[i].outlineLevel += 1;
    changed += 1;
  }
  fixOutline(project);
  removeSummaryLinksToOwnChildren(project);
  return changed;
}

export function outdentTasks(project, ids) {
  let changed = 0;
  for (const id of topmost(project, ids)) {
    const [start, end] = subtreeRange(project, id);
    if (project.tasks[start].outlineLevel <= 1) continue;
    for (let i = start; i < end; i++) project.tasks[i].outlineLevel -= 1;
    changed += 1;
  }
  fixOutline(project);
  return changed;
}

/** Moves the selected subtrees up (-1) or down (+1) past their neighbour at the same level. */
export function moveTasks(project, ids, direction) {
  const roots = topmost(project, ids);
  const order = direction < 0 ? roots : [...roots].reverse();
  let moved = 0;
  // Selected rows that could not move (first/last among their siblings): the
  // rows selected with them must not jump over them, or the selection would
  // swap places instead of staying together.
  const stuck = new Set();
  for (const id of order) {
    const [start, end] = subtreeRange(project, id);
    const level = project.tasks[start].outlineLevel;
    if (direction < 0) {
      let prev = start - 1;
      while (prev >= 0 && project.tasks[prev].outlineLevel > level) prev -= 1;
      if (prev < 0 || project.tasks[prev].outlineLevel < level || stuck.has(project.tasks[prev].id)) { stuck.add(id); continue; }
      const block = project.tasks.splice(start, end - start);
      project.tasks.splice(prev, 0, ...block);
    } else {
      if (end >= project.tasks.length || project.tasks[end].outlineLevel < level || stuck.has(project.tasks[end].id)) { stuck.add(id); continue; }
      const [, nextEnd] = subtreeRange(project, project.tasks[end].id);
      const block = project.tasks.splice(start, end - start);
      project.tasks.splice(nextEnd - block.length, 0, ...block);
    }
    moved += 1;
  }
  fixOutline(project);
  return moved;
}

/** Moves the selected subtrees so they start at row index `target` (drag and drop of rows). */
export function moveTasksTo(project, ids, target, level = null) {
  const roots = topmost(project, ids);
  if (!roots.length) return 0;
  const blocks = [];
  let insertAt = target;
  for (const id of roots) {
    const [start, end] = subtreeRange(project, id);
    blocks.push({ start, rows: project.tasks.slice(start, end) });
  }
  const moving = new Set(blocks.flatMap((block) => block.rows.map((task) => task.id)));
  insertAt -= project.tasks.slice(0, target).filter((task) => moving.has(task.id)).length;
  const rest = project.tasks.filter((task) => !moving.has(task.id));
  const rows = blocks.flatMap((block) => block.rows);
  if (level != null) {
    const shift = level - rows[0].outlineLevel;
    for (const task of rows) task.outlineLevel += shift;
  }
  rest.splice(Math.max(0, Math.min(insertAt, rest.length)), 0, ...rows);
  project.tasks = rest;
  fixOutline(project);
  removeSummaryLinksToOwnChildren(project);
  return roots.length;
}

// ───────────────────────── links

/** True when linking `fromId` → `toId` would make a loop (directly, or through summary tasks). */
export function wouldCycle(project, fromId, toId) {
  if (fromId === toId) return true;
  const { parent } = outline(project);
  const family = (id) => {
    const set = new Set([id, ...descendants(project, id)]);
    for (let up = parent.get(id); up; up = parent.get(up)) set.add(up);
    return set;
  };
  // A summary and a task inside it cannot be linked.
  if (family(fromId).has(toId)) return true;
  // Everything that would wait for toId: its successors, the tasks inside a
  // summary that waits, and the successors of the summaries above a task that
  // waits (a summary finishes with its tasks). A loop exists when fromId, a
  // summary above it, or a task inside it ends up waiting.
  const successors = new Map();
  for (const task of project.tasks) {
    for (const link of task.predecessors ?? []) {
      if (!successors.has(link.taskId)) successors.set(link.taskId, []);
      successors.get(link.taskId).push(task.id);
    }
  }
  const targets = family(fromId);
  const seen = new Set();
  const stack = [toId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    if (targets.has(id)) return true;
    for (const next of successors.get(id) ?? []) stack.push(next);
    for (const child of descendants(project, id)) stack.push(child);
    for (let up = parent.get(id); up; up = parent.get(up)) for (const next of successors.get(up) ?? []) stack.push(next);
  }
  return false;
}

export function linkTasks(project, fromId, toId, type = 'FS', lag = 0, lagUnit = 'd') {
  const to = findTask(project, toId);
  if (!to || !findTask(project, fromId)) return false;
  const existing = to.predecessors.find((link) => link.taskId === fromId);
  if (existing) {
    Object.assign(existing, { type, lag, lagUnit });
    return true;
  }
  if (wouldCycle(project, fromId, toId)) return false;
  to.predecessors.push({ taskId: fromId, type, lag, lagUnit });
  return true;
}

/** "Link tasks": each selected task to the next one (in row order). Returns how many links were made. */
export function linkSequence(project, ids) {
  const order = project.tasks.filter((task) => ids.includes(task.id)).map((task) => task.id);
  let made = 0;
  for (let i = 1; i < order.length; i++) if (linkTasks(project, order[i - 1], order[i])) made += 1;
  return made;
}

export function unlinkTasks(project, fromId, toId) {
  const to = findTask(project, toId);
  if (!to) return false;
  const before = to.predecessors.length;
  to.predecessors = to.predecessors.filter((link) => link.taskId !== fromId);
  return to.predecessors.length !== before;
}

/** "Unlink tasks": every link into and out of the selected tasks (among them, or all when only one is selected). */
export function unlinkAll(project, ids) {
  const set = new Set(ids);
  let removed = 0;
  for (const task of project.tasks) {
    const before = task.predecessors.length;
    task.predecessors = task.predecessors.filter((link) => !(set.size === 1 ? set.has(task.id) || set.has(link.taskId) : set.has(task.id) && set.has(link.taskId)));
    removed += before - task.predecessors.length;
  }
  return removed;
}

export function successorsOf(project, id) {
  return project.tasks.filter((task) => task.predecessors.some((link) => link.taskId === id)).map((task) => ({ task, link: task.predecessors.find((link) => link.taskId === id) }));
}

function removeSummaryLinksToOwnChildren(project) {
  const { parent } = outline(project);
  for (const task of project.tasks) {
    const ups = new Set();
    for (let up = parent.get(task.id); up; up = parent.get(up)) ups.add(up);
    const inside = new Set(descendants(project, task.id));
    task.predecessors = task.predecessors.filter((link) => !ups.has(link.taskId) && !inside.has(link.taskId));
  }
}

// ───────────────────────── resources and assignments

export function addResource(project, data = {}, index = project.resources.length) {
  const resource = createResource(project, data);
  project.resources.splice(Math.max(0, Math.min(index, project.resources.length)), 0, resource);
  return resource;
}

export function updateResource(project, id, patch) {
  const resource = findResource(project, id);
  if (!resource) return null;
  Object.assign(resource, patch);
  if ('name' in patch && !('initials' in patch) && (!resource.initials || resource.initials === initialsOf(patch.previousName ?? ''))) resource.initials = initialsOf(patch.name);
  delete resource.previousName;
  resource.maxUnits = Math.max(0, Number(resource.maxUnits) || 0);
  return resource;
}

export function deleteResources(project, ids) {
  const set = new Set(ids);
  project.resources = project.resources.filter((resource) => !set.has(resource.id));
  project.assignments = project.assignments.filter((assignment) => !set.has(assignment.resourceId));
}

export const assignmentsOf = (project, taskId) => project.assignments.filter((assignment) => assignment.taskId === taskId);
export const assignmentsFor = (project, resourceId) => project.assignments.filter((assignment) => assignment.resourceId === resourceId);

/**
 * Assigns a resource. Effort-driven tasks keep their total work: adding people
 * shortens the task (MS Project's rule for fixed-units, effort-driven tasks).
 */
export function assignResource(project, taskId, resourceId, units = 1, data = {}) {
  const task = findTask(project, taskId);
  const resource = findResource(project, resourceId);
  if (!task || !resource) return null;
  const existing = project.assignments.find((item) => item.taskId === taskId && item.resourceId === resourceId);
  if (existing) {
    existing.units = units;
    Object.assign(existing, data);
    return existing;
  }
  const workBefore = taskWorkUnits(project, task);
  const assignment = { id: newId('a'), taskId, resourceId, units, ...data };
  project.assignments.push(assignment);
  if (task.effortDriven && workBefore > 0 && resource.type === 'work' && task.type !== 'fixedDuration' && !task.milestone) {
    const unitsNow = taskWorkUnits(project, task);
    task.duration = Math.max(1, Math.round((task.duration * workBefore) / unitsNow));
    task.estimated = false;
  }
  return assignment;
}

export function unassignResource(project, taskId, resourceId) {
  const before = project.assignments.length;
  project.assignments = project.assignments.filter((item) => !(item.taskId === taskId && item.resourceId === resourceId));
  return before !== project.assignments.length;
}

/** Sum of the units of the work resources on a task (1 = one full-time person). */
export function taskWorkUnits(project, task) {
  return project.assignments
    .filter((assignment) => assignment.taskId === task.id)
    .reduce((sum, assignment) => sum + (findResource(project, assignment.resourceId)?.type === 'work' ? Number(assignment.units) || 0 : 0), 0);
}

/** Work of one assignment in minutes (work resources), from the task duration and the units. */
export function assignmentWork(project, task, assignment) {
  const resource = findResource(project, assignment.resourceId);
  if (!resource || resource.type !== 'work') return 0;
  if (assignment.work != null && task.type === 'fixedWork') return assignment.work;
  return Math.round((task.duration ?? 0) * (Number(assignment.units) || 0));
}

/**
 * Changes a task's duration following its task type:
 *  fixed units → work changes with the duration; fixed work → units change so
 *  the work stays; fixed duration → just the duration.
 */
export function setTaskDuration(project, taskId, minutes, unit) {
  const task = findTask(project, taskId);
  if (!task) return null;
  const old = task.duration;
  task.duration = Math.max(0, Math.round(minutes));
  if (unit) task.durationUnit = unit;
  task.milestone = task.duration === 0;
  task.estimated = false;
  if (task.type === 'fixedWork' && old > 0 && task.duration > 0) {
    for (const assignment of assignmentsOf(project, taskId)) {
      const work = assignment.work ?? old * (Number(assignment.units) || 0);
      assignment.work = work;
      assignment.units = Math.round((work / task.duration) * 1000) / 1000;
    }
  }
  return task;
}

/** Sets a task's total work (minutes): the duration (fixed units) or the units (fixed duration / work) follow. */
export function setTaskWork(project, taskId, minutes) {
  const task = findTask(project, taskId);
  if (!task) return null;
  const list = assignmentsOf(project, taskId).filter((a) => findResource(project, a.resourceId)?.type === 'work');
  if (!list.length) { task.work = Math.max(0, minutes); return task; }
  const units = taskWorkUnits(project, task) || 1;
  if (task.type === 'fixedUnits') {
    task.duration = Math.max(0, Math.round(minutes / units));
  } else {
    const factor = task.duration > 0 ? minutes / (task.duration * units) : 0;
    for (const assignment of list) {
      assignment.units = Math.round((Number(assignment.units) || 0) * factor * 1000) / 1000;
      if (task.type === 'fixedWork') assignment.work = Math.round(task.duration * assignment.units);
    }
  }
  task.estimated = false;
  return task;
}

// ───────────────────────── calendars

export function addCalendar(project, name, copyFromId = 'standard') {
  const source = project.calendars.find((cal) => cal.id === copyFromId) ?? project.calendars[0];
  const calendar = { ...JSON.parse(JSON.stringify(source)), id: newId('cal'), name, base: null };
  project.calendars.push(calendar);
  return calendar;
}

export function deleteCalendar(project, id) {
  if (id === project.calendarId || ['standard'].includes(id)) return false;
  project.calendars = project.calendars.filter((cal) => cal.id !== id);
  for (const cal of project.calendars) if (cal.base === id) cal.base = null;
  for (const task of project.tasks) if (task.calendarId === id) task.calendarId = null;
  for (const resource of project.resources) if (resource.calendarId === id) resource.calendarId = null;
  return true;
}

export function setWorkWeek(project, calendarId, weekday, periods) {
  const calendar = project.calendars.find((cal) => cal.id === calendarId);
  if (!calendar) return null;
  calendar.week = { ...calendar.week, [weekday]: normalizePeriods(periods) };
  return calendar;
}

export function addException(project, calendarId, data) {
  const calendar = project.calendars.find((cal) => cal.id === calendarId);
  if (!calendar) return null;
  const exception = { id: newId('ex'), name: data.name ?? '', start: data.start, finish: data.finish ?? data.start, working: Boolean(data.working), periods: normalizePeriods(data.periods ?? []) };
  calendar.exceptions = [...(calendar.exceptions ?? []), exception].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return exception;
}

export function removeException(project, calendarId, exceptionId) {
  const calendar = project.calendars.find((cal) => cal.id === calendarId);
  if (!calendar) return false;
  const before = calendar.exceptions.length;
  calendar.exceptions = calendar.exceptions.filter((item) => item.id !== exceptionId);
  return before !== calendar.exceptions.length;
}

// ───────────────────────── copies (clipboard, templates)

/** Deep copies of tasks with new ids; links among the copied tasks are kept, others dropped. */
export function copyTasks(project, ids) {
  const rows = [];
  const roots = topmost(project, ids);
  for (const id of roots) {
    const [start, end] = subtreeRange(project, id);
    rows.push(...project.tasks.slice(start, end));
  }
  const baseLevel = Math.min(...rows.map((task) => task.outlineLevel));
  const kept = new Set(rows.map((task) => task.id));
  return {
    tasks: rows.map((task) => ({ ...JSON.parse(JSON.stringify(task)), outlineLevel: task.outlineLevel - baseLevel + 1, predecessors: task.predecessors.filter((link) => kept.has(link.taskId)) })),
    assignments: project.assignments.filter((assignment) => kept.has(assignment.taskId)).map((assignment) => ({ ...assignment })),
  };
}

/** Inserts copied tasks at `index` under the level of the row above; returns the new ids. */
export function pasteTasks(project, copied, index = project.tasks.length, levelBase = null) {
  const map = new Map();
  const at = Math.max(0, Math.min(index, project.tasks.length));
  const above = project.tasks[at - 1];
  const base = levelBase ?? (above ? above.outlineLevel : 1);
  const tasks = copied.tasks.map((task) => {
    const id = newId('t');
    map.set(task.id, id);
    return createTask(project, { ...task, id, outlineLevel: task.outlineLevel - 1 + base });
  });
  for (const task of tasks) task.predecessors = task.predecessors.map((link) => ({ ...link, taskId: map.get(link.taskId) })).filter((link) => link.taskId);
  project.tasks.splice(at, 0, ...tasks);
  for (const assignment of copied.assignments ?? []) {
    if (map.has(assignment.taskId) && findResource(project, assignment.resourceId)) project.assignments.push({ ...assignment, id: newId('a'), taskId: map.get(assignment.taskId) });
  }
  fixOutline(project);
  return tasks.map((task) => task.id);
}

export const toMinutes = toMin;
