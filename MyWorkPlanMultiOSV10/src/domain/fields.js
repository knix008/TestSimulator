// Columns of the task and resource sheets: how each field is shown, sorted and
// edited. A "table" (MS Project's View › Tables) is a list of field ids.
//
// field = { id, width, align, kind, get(ctx, item, info) → value, text(ctx, value, item, info) → string,
//           set(ctx, item, value) → true when changed, options? }
// ctx = { project, sched, language, dateFormat, showTime, t(key) }
import { DATED_CONSTRAINTS, TASK_TYPES, assignResource, findResource, rowOf, setTaskDuration, setTaskWork, taskAtRow, unassignResource, updateTask, addResource, CONSTRAINTS, ACCRUALS, RESOURCE_TYPES } from './project.js';
import { formatDuration, formatMoney, formatPredecessors, parseDuration, parseMoney, parsePredecessors } from './duration.js';
import { formatDay, fromMin, parseDay } from './time.js';
import { setPercentComplete } from './tracking.js';
import { schedule } from './schedule.js';
import { ancestors, descendants } from './project.js';

/** A summary and a task inside it cannot be linked. */
const isFamily = (project, a, b) => ancestors(project, b).includes(a) || descendants(project, b).includes(a);

const opts = (ctx) => ctx.project.options;
const dur = (ctx, minutes, unit) => (minutes == null ? '' : formatDuration(minutes, unit ?? 'd', opts(ctx), ctx.language));
const days = (ctx, minutes) => dur(ctx, minutes, 'd');
const hours = (ctx, minutes) => (minutes == null ? '' : formatDuration(minutes, 'h', opts(ctx), ctx.language));
const money = (ctx, value) => formatMoney(value ?? 0, opts(ctx).currency);
const date = (ctx, minutes) => (minutes == null ? '' : formatDay(minutes, ctx.dateFormat, ctx.showTime));
const yesNo = (ctx, value) => ctx.t(value ? 'common.yes' : 'common.no');
const parseDate = (ctx, text) => {
  const minutes = parseDay(text, ctx.dateFormat);
  if (minutes == null) return null;
  return /\d:\d\d\s*$/.test(String(text)) ? minutes : minutes;
};
const startOfDay = (ctx, minutes) => minutes + (minutes % 1440 === 0 ? opts(ctx).defaultStart ?? 480 : 0);
const endOfDay = (ctx, minutes) => minutes + (minutes % 1440 === 0 ? opts(ctx).defaultFinish ?? 1020 : 0);

/** Resource names typed in the sheet: "Kim[50%], Lee" → [{ name, units }]. */
export function parseResourceNames(text) {
  return String(text ?? '').split(/[,;]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = /^(.*?)\s*\[\s*([\d.]+)\s*(%?)\s*[^\]]*\]$/.exec(part);
    if (!match) return { name: part, units: 1 };
    const amount = Number(match[2]);
    return { name: match[1].trim(), units: match[3] === '%' ? amount / 100 : amount };
  });
}

/** Replaces a task's assignments with the typed resource list (unknown names become new work resources). */
export function setResourceNames(project, task, text) {
  const wanted = parseResourceNames(text);
  const keep = new Set();
  for (const { name, units } of wanted) {
    let resource = project.resources.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (!resource) resource = addResource(project, { name });
    keep.add(resource.id);
    assignResource(project, task.id, resource.id, units);
  }
  for (const assignment of project.assignments.filter((a) => a.taskId === task.id && !keep.has(a.resourceId))) unassignResource(project, task.id, assignment.resourceId);
  return true;
}

const T = (id, width, align, kind, get, extra = {}) => ({ id, width, align, kind, get, ...extra });

export const TASK_FIELDS = [
  T('indicators', 40, 'center', 'readonly', () => ''),
  T('id', 44, 'right', 'readonly', (ctx, task, info) => info?.row),
  T('mode', 36, 'center', 'select', (ctx, task) => (task.manual ? 'manual' : 'auto'), {
    options: ['auto', 'manual'], text: (ctx, value) => ctx.t(`mode.${value}`),
    set: (ctx, task, value) => {
      const manual = value === 'manual';
      if (manual === Boolean(task.manual)) return false;
      const info = ctx.sched.info(task.id);
      // Switching to manual keeps the dates the task has now.
      updateTask(ctx.project, task.id, manual ? { manual, start: fromMin(info?.start), finish: fromMin(info?.finish) } : { manual });
      return true;
    },
  }),
  T('wbs', 70, 'left', 'readonly', (ctx, task, info) => info?.wbs),
  T('name', 220, 'left', 'text', (ctx, task) => task.name, { set: (ctx, task, value) => { updateTask(ctx.project, task.id, { name: String(value) }); return true; } }),
  T('duration', 82, 'right', 'duration', (ctx, task, info) => info?.duration ?? task.duration, {
    text: (ctx, value, task, info) => `${dur(ctx, value, info?.summary ? 'd' : task.durationUnit)}${task.estimated && !info?.summary ? '?' : ''}`,
    set: (ctx, task, value) => {
      const parsed = parseDuration(value, opts(ctx), task.durationUnit ?? opts(ctx).defaultDurationUnit ?? 'd');
      if (!parsed) throw new Error('field.badDuration');
      if (task.manual && task.start) {
        setTaskDuration(ctx.project, task.id, parsed.minutes, parsed.unit);
        task.finish = null;
      } else setTaskDuration(ctx.project, task.id, parsed.minutes, parsed.unit);
      task.estimated = parsed.estimated;
      return true;
    },
  }),
  T('start', 120, 'right', 'date', (ctx, task, info) => info?.start, {
    text: (ctx, value) => date(ctx, value),
    set: (ctx, task, value) => {
      const minutes = parseDate(ctx, value);
      if (minutes == null) throw new Error('field.badDate');
      const at = startOfDay(ctx, minutes);
      if (task.manual) {
        const info = ctx.sched.info(task.id);
        const length = info ? info.finish - info.start : 0;
        updateTask(ctx.project, task.id, { start: fromMin(at), finish: task.finish ? fromMin(at + length) : null });
      } else updateTask(ctx.project, task.id, { constraint: { type: 'SNET', date: fromMin(at) } });
      return true;
    },
  }),
  T('finish', 120, 'right', 'date', (ctx, task, info) => info?.finish, {
    text: (ctx, value) => date(ctx, value),
    set: (ctx, task, value) => {
      const minutes = parseDate(ctx, value);
      if (minutes == null) throw new Error('field.badDate');
      const at = endOfDay(ctx, minutes);
      const info = ctx.sched.info(task.id);
      if (task.manual) updateTask(ctx.project, task.id, { finish: fromMin(Math.max(at, info?.start ?? at)), start: task.start ?? fromMin(info?.start) });
      else if (info && at >= info.start) {
        // An auto task's new finish changes its duration (working time from its start).
        const cal = ctx.sched.calendarFor(task);
        setTaskDuration(ctx.project, task.id, cal.between(info.start, at), task.durationUnit);
      } else updateTask(ctx.project, task.id, { constraint: { type: 'FNET', date: fromMin(at) } });
      return true;
    },
  }),
  T('predecessors', 110, 'left', 'predecessors', (ctx, task) => formatPredecessors(task.predecessors, (id) => rowOf(ctx.project, id), opts(ctx)), {
    set: (ctx, task, value) => {
      const { links, errors } = parsePredecessors(value, (row) => taskAtRow(ctx.project, row)?.id, opts(ctx));
      if (errors.length) throw new Error('field.badPredecessors');
      const before = task.predecessors;
      task.predecessors = links.filter((link) => link.taskId !== task.id);
      // Refuse loops (also through summary tasks): put the old links back.
      if (task.predecessors.some((link) => isFamily(ctx.project, link.taskId, task.id)) || schedule(ctx.project).conflicts.some((c) => c.kind === 'circular')) {
        task.predecessors = before;
        throw new Error('field.loop');
      }
      return true;
    },
  }),
  T('successors', 110, 'left', 'readonly', (ctx, task) => ctx.project.tasks.filter((other) => other.predecessors.some((link) => link.taskId === task.id)).map((other) => rowOf(ctx.project, other.id)).join(',')),
  T('resourceNames', 170, 'left', 'resources', (ctx, task, info) => (info?.resourceNames ?? []).join(', '), { set: (ctx, task, value) => setResourceNames(ctx.project, task, value) }),
  T('percentComplete', 70, 'right', 'percent', (ctx, task, info) => info?.percentComplete ?? task.percentComplete, {
    text: (ctx, value) => `${value ?? 0}%`,
    set: (ctx, task, value) => {
      const number = Number(String(value).replace('%', ''));
      if (!Number.isFinite(number)) throw new Error('field.badNumber');
      setPercentComplete(ctx.project, ctx.sched, [task.id], number);
      return true;
    },
  }),
  T('work', 82, 'right', 'duration', (ctx, task, info) => info?.work ?? 0, {
    text: (ctx, value) => hours(ctx, value),
    set: (ctx, task, value) => {
      const parsed = parseDuration(value, opts(ctx), 'h');
      if (!parsed) throw new Error('field.badDuration');
      setTaskWork(ctx.project, task.id, parsed.minutes);
      return true;
    },
  }),
  T('cost', 100, 'right', 'readonly', (ctx, task, info) => info?.cost ?? 0, { text: (ctx, value) => money(ctx, value) }),
  T('fixedCost', 96, 'right', 'money', (ctx, task) => task.fixedCost ?? 0, {
    text: (ctx, value) => money(ctx, value),
    set: (ctx, task, value) => { const n = parseMoney(value); if (n == null) throw new Error('field.badNumber'); task.fixedCost = n; return true; },
  }),
  T('actualStart', 120, 'right', 'date', (ctx, task) => (task.actualStart ? ctx.toMin(task.actualStart) : null), {
    text: (ctx, value) => (value == null ? ctx.t('common.na') : date(ctx, value)),
    set: (ctx, task, value) => {
      if (!String(value).trim() || String(value).trim() === ctx.t('common.na')) { task.actualStart = null; task.actualFinish = null; task.percentComplete = 0; return true; }
      const minutes = parseDate(ctx, value);
      if (minutes == null) throw new Error('field.badDate');
      task.actualStart = fromMin(startOfDay(ctx, minutes));
      if (!task.percentComplete) task.percentComplete = 1;
      return true;
    },
  }),
  T('actualFinish', 120, 'right', 'date', (ctx, task) => (task.actualFinish ? ctx.toMin(task.actualFinish) : null), {
    text: (ctx, value) => (value == null ? ctx.t('common.na') : date(ctx, value)),
    set: (ctx, task, value) => {
      if (!String(value).trim() || String(value).trim() === ctx.t('common.na')) { task.actualFinish = null; if (task.percentComplete >= 100) task.percentComplete = 99; return true; }
      const minutes = parseDate(ctx, value);
      if (minutes == null) throw new Error('field.badDate');
      const info = ctx.sched.info(task.id);
      task.actualStart ??= fromMin(info.start);
      task.actualFinish = fromMin(endOfDay(ctx, minutes));
      task.percentComplete = 100;
      return true;
    },
  }),
  T('actualDuration', 82, 'right', 'readonly', (ctx, task, info) => info?.actualDuration ?? 0, { text: (ctx, value) => days(ctx, value) }),
  T('remainingDuration', 82, 'right', 'readonly', (ctx, task, info) => info?.remainingDuration ?? 0, { text: (ctx, value) => days(ctx, value) }),
  T('actualCost', 100, 'right', 'readonly', (ctx, task, info) => info?.actualCost ?? 0, { text: (ctx, value) => money(ctx, value) }),
  T('remainingCost', 100, 'right', 'readonly', (ctx, task, info) => info?.remainingCost ?? 0, { text: (ctx, value) => money(ctx, value) }),
  T('actualWork', 82, 'right', 'readonly', (ctx, task, info) => info?.actualWork ?? 0, { text: (ctx, value) => hours(ctx, value) }),
  T('remainingWork', 82, 'right', 'readonly', (ctx, task, info) => info?.remainingWork ?? 0, { text: (ctx, value) => hours(ctx, value) }),
  T('baselineStart', 120, 'right', 'readonly', (ctx, task, info) => info?.baseline?.start ?? null, { text: (ctx, value) => (value == null ? ctx.t('common.na') : date(ctx, value)) }),
  T('baselineFinish', 120, 'right', 'readonly', (ctx, task, info) => info?.baseline?.finish ?? null, { text: (ctx, value) => (value == null ? ctx.t('common.na') : date(ctx, value)) }),
  T('baselineDuration', 82, 'right', 'readonly', (ctx, task, info) => info?.baseline?.duration ?? null, { text: (ctx, value) => (value == null ? ctx.t('common.na') : days(ctx, value)) }),
  T('baselineWork', 82, 'right', 'readonly', (ctx, task, info) => info?.baseline?.work ?? null, { text: (ctx, value) => (value == null ? ctx.t('common.na') : hours(ctx, value)) }),
  T('baselineCost', 100, 'right', 'readonly', (ctx, task, info) => info?.baseline?.cost ?? null, { text: (ctx, value) => (value == null ? ctx.t('common.na') : money(ctx, value)) }),
  T('startVariance', 82, 'right', 'readonly', (ctx, task, info) => info?.startVariance ?? 0, { text: (ctx, value) => days(ctx, value) }),
  T('finishVariance', 82, 'right', 'readonly', (ctx, task, info) => info?.finishVariance ?? 0, { text: (ctx, value) => days(ctx, value) }),
  T('durationVariance', 82, 'right', 'readonly', (ctx, task, info) => info?.durationVariance ?? 0, { text: (ctx, value) => days(ctx, value) }),
  T('workVariance', 82, 'right', 'readonly', (ctx, task, info) => info?.workVariance ?? 0, { text: (ctx, value) => hours(ctx, value) }),
  T('costVariance', 100, 'right', 'readonly', (ctx, task, info) => info?.costVariance ?? 0, { text: (ctx, value) => money(ctx, value) }),
  T('totalSlack', 82, 'right', 'readonly', (ctx, task, info) => info?.totalSlack ?? 0, { text: (ctx, value) => days(ctx, value) }),
  T('freeSlack', 82, 'right', 'readonly', (ctx, task, info) => info?.freeSlack ?? 0, { text: (ctx, value) => days(ctx, value) }),
  T('earlyStart', 120, 'right', 'readonly', (ctx, task, info) => info?.earlyStart, { text: (ctx, value) => date(ctx, value) }),
  T('earlyFinish', 120, 'right', 'readonly', (ctx, task, info) => info?.earlyFinish, { text: (ctx, value) => date(ctx, value) }),
  T('lateStart', 120, 'right', 'readonly', (ctx, task, info) => info?.lateStart, { text: (ctx, value) => date(ctx, value) }),
  T('lateFinish', 120, 'right', 'readonly', (ctx, task, info) => info?.lateFinish, { text: (ctx, value) => date(ctx, value) }),
  T('critical', 60, 'center', 'readonly', (ctx, task, info) => Boolean(info?.critical), { text: (ctx, value) => yesNo(ctx, value) }),
  T('constraintType', 120, 'left', 'select', (ctx, task) => task.constraint?.type ?? 'ASAP', {
    options: CONSTRAINTS, text: (ctx, value) => ctx.t(`constraint.${value}`),
    set: (ctx, task, value) => {
      const info = ctx.sched.info(task.id);
      const dateValue = DATED_CONSTRAINTS.includes(value) ? task.constraint?.date ?? fromMin(value.startsWith('F') || value === 'MFO' ? info?.finish : info?.start) : null;
      task.constraint = { type: value, date: dateValue };
      return true;
    },
  }),
  T('constraintDate', 120, 'right', 'date', (ctx, task) => (task.constraint?.date ? ctx.toMin(task.constraint.date) : null), {
    text: (ctx, value) => (value == null ? ctx.t('common.na') : date(ctx, value)),
    set: (ctx, task, value) => {
      if (!String(value).trim()) { task.constraint = { type: 'ASAP', date: null }; return true; }
      const minutes = parseDate(ctx, value);
      if (minutes == null) throw new Error('field.badDate');
      const type = DATED_CONSTRAINTS.includes(task.constraint?.type) ? task.constraint.type : 'SNET';
      task.constraint = { type, date: fromMin(type.startsWith('F') || type === 'MFO' ? endOfDay(ctx, minutes) : startOfDay(ctx, minutes)) };
      return true;
    },
  }),
  T('deadline', 120, 'right', 'date', (ctx, task) => (task.deadline ? ctx.toMin(task.deadline) : null), {
    text: (ctx, value) => (value == null ? ctx.t('common.na') : date(ctx, value)),
    set: (ctx, task, value) => {
      if (!String(value).trim() || String(value).trim() === ctx.t('common.na')) { task.deadline = null; return true; }
      const minutes = parseDate(ctx, value);
      if (minutes == null) throw new Error('field.badDate');
      task.deadline = fromMin(endOfDay(ctx, minutes));
      return true;
    },
  }),
  T('priority', 66, 'right', 'number', (ctx, task) => task.priority ?? 500, {
    set: (ctx, task, value) => { const n = Number(value); if (!Number.isFinite(n)) throw new Error('field.badNumber'); updateTask(ctx.project, task.id, { priority: n }); return true; },
  }),
  T('type', 110, 'left', 'select', (ctx, task) => task.type ?? 'fixedUnits', { options: TASK_TYPES, text: (ctx, value) => ctx.t(`taskType.${value}`), set: (ctx, task, value) => { task.type = value; return true; } }),
  T('effortDriven', 70, 'center', 'bool', (ctx, task) => Boolean(task.effortDriven), { text: (ctx, value) => yesNo(ctx, value), set: (ctx, task, value) => { task.effortDriven = Boolean(value); return true; } }),
  T('milestone', 70, 'center', 'bool', (ctx, task) => Boolean(task.milestone), { text: (ctx, value) => yesNo(ctx, value), set: (ctx, task, value) => { updateTask(ctx.project, task.id, value ? { milestone: true } : { milestone: false, duration: task.duration || 480 }); return true; } }),
  T('active', 60, 'center', 'bool', (ctx, task) => task.active !== false, { text: (ctx, value) => yesNo(ctx, value), set: (ctx, task, value) => { task.active = Boolean(value); return true; } }),
  T('calendar', 110, 'left', 'select', (ctx, task) => task.calendarId ?? '', {
    options: (ctx) => ['', ...ctx.project.calendars.map((cal) => cal.id)],
    text: (ctx, value) => (value ? ctx.project.calendars.find((cal) => cal.id === value)?.name ?? '' : ctx.t('common.none')),
    set: (ctx, task, value) => { task.calendarId = value || null; return true; },
  }),
  T('outlineLevel', 60, 'right', 'readonly', (ctx, task) => task.outlineLevel),
  T('status', 92, 'left', 'readonly', (ctx, task, info) => info?.status ?? '', { text: (ctx, value) => (value ? ctx.t(`status.${value}`) : '') }),
  T('notes', 200, 'left', 'text', (ctx, task) => task.notes ?? '', { text: (ctx, value) => String(value).replace(/\s+/g, ' '), set: (ctx, task, value) => { task.notes = String(value); return true; } }),
  T('hyperlink', 160, 'left', 'text', (ctx, task) => task.hyperlink ?? '', { set: (ctx, task, value) => { task.hyperlink = String(value).trim(); return true; } }),
  T('text1', 110, 'left', 'text', (ctx, task) => task.text1 ?? '', { set: (ctx, task, value) => { task.text1 = String(value); return true; } }),
  T('text2', 110, 'left', 'text', (ctx, task) => task.text2 ?? '', { set: (ctx, task, value) => { task.text2 = String(value); return true; } }),
  T('text3', 110, 'left', 'text', (ctx, task) => task.text3 ?? '', { set: (ctx, task, value) => { task.text3 = String(value); return true; } }),
  T('number1', 80, 'right', 'number', (ctx, task) => task.number1 ?? 0, { set: (ctx, task, value) => { const n = Number(value); if (!Number.isFinite(n)) throw new Error('field.badNumber'); task.number1 = n; return true; } }),
  T('flag1', 60, 'center', 'bool', (ctx, task) => Boolean(task.flag1), { text: (ctx, value) => yesNo(ctx, value), set: (ctx, task, value) => { task.flag1 = Boolean(value); return true; } }),
  T('levelingDelay', 82, 'right', 'readonly', (ctx, task) => task.levelingDelay ?? 0, { text: (ctx, value) => dur(ctx, value, 'ed') }),
];

export const RESOURCE_FIELDS = [
  T('indicators', 40, 'center', 'readonly', () => ''),
  T('id', 44, 'right', 'readonly', (ctx, resource) => ctx.project.resources.indexOf(resource) + 1),
  T('name', 180, 'left', 'text', (ctx, r) => r.name, { set: (ctx, r, value) => { r.name = String(value); return true; } }),
  T('resourceType', 90, 'left', 'select', (ctx, r) => r.type, { options: RESOURCE_TYPES, text: (ctx, value) => ctx.t(`resourceType.${value}`), set: (ctx, r, value) => { r.type = value; return true; } }),
  T('materialLabel', 80, 'left', 'text', (ctx, r) => r.materialLabel ?? '', { set: (ctx, r, value) => { r.materialLabel = String(value); return true; } }),
  T('initials', 60, 'left', 'text', (ctx, r) => r.initials ?? '', { set: (ctx, r, value) => { r.initials = String(value); return true; } }),
  T('group', 100, 'left', 'text', (ctx, r) => r.group ?? '', { set: (ctx, r, value) => { r.group = String(value); return true; } }),
  T('maxUnits', 80, 'right', 'percent', (ctx, r) => Math.round((r.maxUnits ?? 1) * 100), {
    text: (ctx, value, r) => (r.type === 'work' ? `${value}%` : ''),
    set: (ctx, r, value) => { const n = Number(String(value).replace('%', '')); if (!Number.isFinite(n) || n < 0) throw new Error('field.badNumber'); r.maxUnits = n / 100; return true; },
  }),
  T('stdRate', 100, 'right', 'money', (ctx, r) => r.stdRate ?? 0, {
    text: (ctx, value, r) => (r.type === 'cost' ? '' : `${money(ctx, value)}${r.type === 'work' ? ctx.t('unit.perHour') : ''}`),
    set: (ctx, r, value) => { const n = parseMoney(value); if (n == null) throw new Error('field.badNumber'); r.stdRate = n; return true; },
  }),
  T('ovtRate', 100, 'right', 'money', (ctx, r) => r.ovtRate ?? 0, {
    text: (ctx, value, r) => (r.type === 'work' ? `${money(ctx, value)}${ctx.t('unit.perHour')}` : ''),
    set: (ctx, r, value) => { const n = parseMoney(value); if (n == null) throw new Error('field.badNumber'); r.ovtRate = n; return true; },
  }),
  T('costPerUse', 96, 'right', 'money', (ctx, r) => r.costPerUse ?? 0, {
    text: (ctx, value, r) => (r.type === 'cost' ? '' : money(ctx, value)),
    set: (ctx, r, value) => { const n = parseMoney(value); if (n == null) throw new Error('field.badNumber'); r.costPerUse = n; return true; },
  }),
  T('accrue', 90, 'left', 'select', (ctx, r) => r.accrue ?? 'prorated', { options: ACCRUALS, text: (ctx, value) => ctx.t(`accrue.${value}`), set: (ctx, r, value) => { r.accrue = value; return true; } }),
  T('calendar', 110, 'left', 'select', (ctx, r) => r.calendarId ?? '', {
    options: (ctx) => ['', ...ctx.project.calendars.map((cal) => cal.id)],
    text: (ctx, value) => (value ? ctx.project.calendars.find((cal) => cal.id === value)?.name ?? '' : ctx.t('common.projectCalendar')),
    set: (ctx, r, value) => { r.calendarId = value || null; return true; },
  }),
  T('code', 70, 'left', 'text', (ctx, r) => r.code ?? '', { set: (ctx, r, value) => { r.code = String(value); return true; } }),
  T('email', 150, 'left', 'text', (ctx, r) => r.email ?? '', { set: (ctx, r, value) => { r.email = String(value).trim(); return true; } }),
  T('work', 90, 'right', 'readonly', (ctx, r) => ctx.sched.resources.get(r.id)?.work ?? 0, { text: (ctx, value, r) => (r.type === 'work' ? hours(ctx, value) : '') }),
  T('cost', 100, 'right', 'readonly', (ctx, r) => ctx.sched.resources.get(r.id)?.cost ?? 0, { text: (ctx, value) => money(ctx, value) }),
  T('actualCost', 100, 'right', 'readonly', (ctx, r) => ctx.sched.resources.get(r.id)?.actualCost ?? 0, { text: (ctx, value) => money(ctx, value) }),
  T('peak', 70, 'right', 'readonly', (ctx, r) => Math.round((ctx.sched.resources.get(r.id)?.peak ?? 0) * 100), { text: (ctx, value, r) => (r.type === 'work' ? `${value}%` : '') }),
  T('overallocated', 70, 'center', 'readonly', (ctx, r) => Boolean(ctx.sched.resources.get(r.id)?.overallocated), { text: (ctx, value) => yesNo(ctx, value) }),
  T('notes', 200, 'left', 'text', (ctx, r) => r.notes ?? '', { text: (ctx, value) => String(value).replace(/\s+/g, ' '), set: (ctx, r, value) => { r.notes = String(value); return true; } }),
];

export const TASK_FIELD_MAP = new Map(TASK_FIELDS.map((field) => [field.id, field]));
export const RESOURCE_FIELD_MAP = new Map(RESOURCE_FIELDS.map((field) => [field.id, field]));

/** View › Tables for tasks (the name column and the ID column always come first). */
export const TASK_TABLES = {
  entry: ['indicators', 'mode', 'name', 'duration', 'start', 'finish', 'predecessors', 'resourceNames'],
  schedule: ['indicators', 'name', 'start', 'finish', 'lateStart', 'lateFinish', 'freeSlack', 'totalSlack'],
  cost: ['indicators', 'name', 'fixedCost', 'cost', 'baselineCost', 'costVariance', 'actualCost', 'remainingCost'],
  work: ['indicators', 'name', 'work', 'baselineWork', 'workVariance', 'actualWork', 'remainingWork', 'percentComplete'],
  tracking: ['indicators', 'name', 'actualStart', 'actualFinish', 'percentComplete', 'actualDuration', 'remainingDuration', 'actualCost', 'actualWork'],
  variance: ['indicators', 'name', 'start', 'finish', 'baselineStart', 'baselineFinish', 'startVariance', 'finishVariance'],
  baseline: ['indicators', 'name', 'baselineDuration', 'baselineStart', 'baselineFinish', 'baselineWork', 'baselineCost'],
  summary: ['indicators', 'name', 'wbs', 'duration', 'start', 'finish', 'percentComplete', 'cost', 'work'],
  constraints: ['indicators', 'name', 'duration', 'constraintType', 'constraintDate', 'deadline', 'priority', 'type'],
};
export const RESOURCE_TABLES = {
  entry: ['indicators', 'name', 'resourceType', 'materialLabel', 'initials', 'group', 'maxUnits', 'stdRate', 'ovtRate', 'costPerUse', 'accrue', 'calendar', 'code'],
  cost: ['indicators', 'name', 'cost', 'actualCost', 'stdRate', 'costPerUse'],
  work: ['indicators', 'name', 'work', 'peak', 'maxUnits', 'overallocated'],
  summary: ['indicators', 'name', 'group', 'maxUnits', 'peak', 'stdRate', 'ovtRate', 'cost', 'work'],
};

export function fieldText(ctx, field, item, info) {
  const value = field.get(ctx, item, info);
  if (field.text) return field.text(ctx, value, item, info);
  return value == null ? '' : String(value);
}

export function sortValue(ctx, field, item, info) {
  const value = field.get(ctx, item, info);
  return typeof value === 'number' || typeof value === 'boolean' ? Number(value) : String(value ?? '').toLowerCase();
}

export const fieldOptions = (ctx, field) => (typeof field.options === 'function' ? field.options(ctx) : field.options ?? []);
export { findResource };
