// Filters, groups and sorting for the task views (MS Project's View › Data).
// A filter keeps the summary tasks above every matching task so the outline
// still reads; "highlight" shows all rows and marks the matches instead.
import { outline } from './project.js';
import { dayOf } from './time.js';

export const FILTERS = ['all', 'active', 'completed', 'incomplete', 'critical', 'milestones', 'summary', 'late', 'overallocated', 'unstarted', 'inProgress', 'withDeadline', 'constrained', 'manual', 'dateRange', 'usingResource'];
export const GROUPS = ['none', 'critical', 'milestones', 'priority', 'resource', 'status', 'duration', 'complete', 'constraint', 'mode'];
export const SORTS = ['id', 'name', 'start', 'finish', 'duration', 'priority', 'cost', 'work', 'slack'];

/** Does the task itself match the filter? */
export function matches(filter, task, info, params = {}, project = null) {
  if (!info) return false;
  switch (filter) {
    case 'active': return task.active !== false;
    case 'completed': return (info.percentComplete ?? 0) >= 100;
    case 'incomplete': return (info.percentComplete ?? 0) < 100;
    case 'critical': return Boolean(info.critical);
    case 'milestones': return Boolean(task.milestone);
    case 'summary': return Boolean(info.summary);
    case 'late': return Boolean(info.late);
    case 'overallocated': return Boolean(info.overallocated);
    case 'unstarted': return (info.percentComplete ?? 0) === 0;
    case 'inProgress': return (info.percentComplete ?? 0) > 0 && (info.percentComplete ?? 0) < 100;
    case 'withDeadline': return Boolean(task.deadline);
    case 'constrained': return !['ASAP', 'ALAP'].includes(task.constraint?.type ?? 'ASAP');
    case 'manual': return Boolean(task.manual);
    case 'dateRange': {
      const from = params.from ?? -Infinity;
      const to = params.to ?? Infinity;
      return info.start <= to && info.finish >= from;
    }
    case 'usingResource':
      return Boolean(project?.assignments.some((a) => a.taskId === task.id && a.resourceId === params.resourceId));
    default: return true;
  }
}

/** Text search over name, notes, WBS and resource names. */
export function matchesText(text, task, info) {
  const needle = String(text ?? '').trim().toLowerCase();
  if (!needle) return true;
  return [task.name, task.notes, info?.wbs, ...(info?.resourceNames ?? []), task.text1, task.text2, task.text3].some((value) => String(value ?? '').toLowerCase().includes(needle));
}

/**
 * The rows to show: { task, info, match, group? }[] — with filter, search text,
 * collapsed summaries, grouping and sorting applied.
 */
export function rowsFor(project, sched, view = {}) {
  const filter = view.filter ?? 'all';
  const text = view.text ?? '';
  const highlight = Boolean(view.highlight);
  const structure = sched.outline ?? outline(project);
  const tasks = project.tasks;
  const own = new Map();
  for (const task of tasks) {
    const info = sched.info(task.id);
    own.set(task.id, matches(filter, task, info, view.params, project) && matchesText(text, task, info));
  }
  const filtering = filter !== 'all' || Boolean(String(text).trim());
  // Summaries stay when something under them matches.
  const keep = new Map(own);
  if (filtering && !highlight) {
    for (const task of tasks) {
      if (!own.get(task.id)) continue;
      for (let up = structure.parent.get(task.id); up; up = structure.parent.get(up)) keep.set(up, true);
    }
  }

  const grouped = view.group && view.group !== 'none';
  const sorted = view.sort && view.sort !== 'id';
  if (grouped || sorted) {
    // Grouped or sorted views list leaf tasks flat (like MS Project without outline structure).
    let list = tasks.filter((task) => !structure.isSummary(task.id) || (!grouped && !sorted));
    list = list.filter((task) => (highlight || !filtering ? true : own.get(task.id)));
    const items = list.map((task) => ({ task, info: sched.info(task.id), match: filtering && own.get(task.id) }));
    if (sorted) sortRows(items, view.sort, view.descending);
    if (!grouped) return items;
    return groupRows(project, items, view.group);
  }

  const out = [];
  let hideBelow = Infinity;
  for (const task of tasks) {
    if (task.outlineLevel > hideBelow) continue;
    hideBelow = Infinity;
    if (!filtering || highlight || keep.get(task.id)) out.push({ task, info: sched.info(task.id), match: filtering && own.get(task.id) });
    if (task.collapsed) hideBelow = task.outlineLevel;
  }
  return out;
}

export function sortRows(items, sort, descending = false) {
  const key = {
    name: (item) => String(item.task.name).toLowerCase(),
    start: (item) => item.info?.start ?? 0,
    finish: (item) => item.info?.finish ?? 0,
    duration: (item) => item.info?.duration ?? 0,
    priority: (item) => -(item.task.priority ?? 500),
    cost: (item) => -(item.info?.cost ?? 0),
    work: (item) => -(item.info?.work ?? 0),
    slack: (item) => item.info?.totalSlack ?? 0,
  }[sort] ?? ((item) => item.info?.row ?? 0);
  items.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const order = x < y ? -1 : x > y ? 1 : (a.info?.row ?? 0) - (b.info?.row ?? 0);
    return descending ? -order : order;
  });
  return items;
}

/** Groups rows: a heading row { group: { key, label, count } } before each group. */
export function groupRows(project, items, group) {
  const keyOf = {
    critical: (item) => (item.info?.critical ? 'yes' : 'no'),
    milestones: (item) => (item.task.milestone ? 'yes' : 'no'),
    priority: (item) => String(Math.floor((item.task.priority ?? 500) / 100) * 100),
    resource: (item) => {
      const names = project.assignments.filter((a) => a.taskId === item.task.id).map((a) => project.resources.find((r) => r.id === a.resourceId)?.name).filter(Boolean);
      return names.length ? names.sort().join(', ') : '';
    },
    status: (item) => item.info?.status ?? '',
    duration: (item) => {
      const d = item.info?.duration ?? 0;
      const day = (project.options.hoursPerDay ?? 8) * 60;
      return d === 0 ? '0' : d <= day ? '1' : d <= 5 * day ? '5' : d <= 20 * day ? '20' : 'more';
    },
    complete: (item) => {
      const p = item.info?.percentComplete ?? 0;
      return p >= 100 ? '100' : p > 0 ? 'some' : '0';
    },
    constraint: (item) => item.task.constraint?.type ?? 'ASAP',
    mode: (item) => (item.task.manual ? 'manual' : 'auto'),
  }[group] ?? (() => '');
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const order = [...groups.keys()].sort((a, b) => (group === 'priority' ? Number(b) - Number(a) : String(a).localeCompare(String(b))));
  const out = [];
  for (const key of order) {
    const list = groups.get(key);
    const start = Math.min(...list.map((item) => item.info?.start ?? Infinity));
    const finish = Math.max(...list.map((item) => item.info?.finish ?? -Infinity));
    const cost = list.reduce((sum, item) => sum + (item.info?.cost ?? 0), 0);
    const work = list.reduce((sum, item) => sum + (item.info?.work ?? 0), 0);
    out.push({ group: { key, kind: group, count: list.length, start, finish, cost, work } });
    out.push(...list);
  }
  return out;
}

/** Days spanned by the visible rows (for the timescale). */
export function spanOf(rows, sched) {
  let from = sched.start;
  let to = sched.finish;
  for (const row of rows) {
    if (row.info?.start != null) from = Math.min(from, row.info.start);
    if (row.info?.finish != null) to = Math.max(to, row.info.finish);
    if (row.info?.baseline?.finish != null) to = Math.max(to, row.info.baseline.finish);
  }
  return { fromDay: dayOf(from), toDay: dayOf(to) };
}
