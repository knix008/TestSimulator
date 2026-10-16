// The .mwp file (a project plan) and .mwpt (a template: the same content,
// without progress) — UTF-8 JSON:
//   { "format": "myworkplan", "version": 1, "kind": "plan" | "template", "project": { … } }
// Reading repairs what it can (missing fields get their defaults, broken links
// and assignments are dropped) and refuses what is not a plan.
import { normalizePeriods } from './calendars.js';
import { createProject, createResource, createTask, CONSTRAINTS, FORMAT, RESOURCE_TYPES, TASK_TYPES, VERSION, fixOutline } from './project.js';
import { toMin } from './time.js';

export const PLAN_EXTENSION = 'mwp';
export const TEMPLATE_EXTENSION = 'mwpt';

export class FormatError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop();
export const directoryOf = (path) => {
  const text = String(path ?? '');
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return index > 0 ? text.slice(0, index) : '';
};
export const extensionOf = (name) => (/\.([^./\\]+)$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();
export const stripExtension = (name) => String(name ?? '').replace(/\.[^./\\]+$/, '');
export const withExtension = (path, extension) => (extensionOf(path) === extension ? path : `${stripExtension(path)}.${extension}`);
export const isPlanFileName = (name) => ['mwp', 'mwpt', 'json'].includes(extensionOf(name));
export const isTemplateFileName = (name) => extensionOf(name) === 'mwpt';
export const isXmlFileName = (name) => extensionOf(name) === 'xml';
export const isCsvFileName = (name) => ['csv', 'tsv', 'txt'].includes(extensionOf(name));
export const isImageFileName = (name) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(extensionOf(name));

const iso = (value) => {
  if (value == null || value === '') return null;
  const minutes = toMin(value);
  return minutes == null ? null : String(value).length <= 10 ? `${String(value).slice(0, 10)}T00:00` : String(value).slice(0, 16);
};
const number = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const text = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));

/** Repairs a project read from a file (or pasted): every field present and valid. */
export function normalizeProject(raw, language = 'ko') {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) throw new FormatError('format.notPlan');
  const base = createProject({ title: text(raw.title) || 'Project', start: iso(raw.start) ?? undefined, language });
  const project = { ...base, ...Object.fromEntries(Object.entries(raw).filter(([key]) => key in base)) };
  project.format = FORMAT;
  project.version = VERSION;
  project.title = text(project.title) || base.title;
  project.start = iso(project.start) ?? base.start;
  project.finish = iso(project.finish);
  project.statusDate = iso(project.statusDate);
  project.scheduleFrom = project.scheduleFrom === 'finish' && project.finish ? 'finish' : 'start';
  project.options = { ...base.options, ...(raw.options && typeof raw.options === 'object' ? raw.options : {}) };
  for (const key of ['hoursPerDay', 'hoursPerWeek', 'daysPerMonth']) project.options[key] = Math.max(0.5, number(project.options[key], base.options[key]));
  project.calendars = (Array.isArray(raw.calendars) && raw.calendars.length ? raw.calendars : base.calendars).filter((cal) => cal && typeof cal === 'object').map((cal, index) => ({
    id: text(cal.id) || `cal-${index}`,
    name: text(cal.name) || `Calendar ${index + 1}`,
    base: cal.base ? text(cal.base) : null,
    week: Object.fromEntries(Object.entries(cal.week ?? {}).filter(([day]) => /^[0-6]$/.test(day)).map(([day, periods]) => [day, normalizePeriods(periods)])),
    exceptions: (Array.isArray(cal.exceptions) ? cal.exceptions : []).filter((ex) => ex && toMin(ex.start) != null).map((ex, i) => ({
      id: text(ex.id) || `ex-${index}-${i}`, name: text(ex.name), start: String(ex.start).slice(0, 10), finish: String(toMin(ex.finish) != null ? ex.finish : ex.start).slice(0, 10), working: Boolean(ex.working), periods: normalizePeriods(ex.periods),
    })),
  }));
  if (!project.calendars.length) project.calendars = base.calendars;
  if (!project.calendars.some((cal) => cal.id === project.calendarId)) project.calendarId = project.calendars[0].id;
  const calendarIds = new Set(project.calendars.map((cal) => cal.id));

  const seen = new Set();
  project.tasks = raw.tasks.filter((task) => task && typeof task === 'object').map((task) => {
    const clean = createTask(project, { ...task, id: text(task.id) || undefined });
    if (seen.has(clean.id)) clean.id = `${clean.id}-${seen.size}`;
    seen.add(clean.id);
    clean.name = text(clean.name);
    clean.outlineLevel = Math.max(1, Math.round(number(clean.outlineLevel, 1)));
    clean.duration = Math.max(0, Math.round(number(clean.duration, 480)));
    clean.percentComplete = Math.max(0, Math.min(100, Math.round(number(clean.percentComplete))));
    clean.priority = Math.max(0, Math.min(1000, Math.round(number(clean.priority, 500))));
    clean.type = TASK_TYPES.includes(clean.type) ? clean.type : 'fixedUnits';
    clean.constraint = { type: CONSTRAINTS.includes(clean.constraint?.type) ? clean.constraint.type : 'ASAP', date: iso(clean.constraint?.date) };
    if (!['ASAP', 'ALAP'].includes(clean.constraint.type) && !clean.constraint.date) clean.constraint = { type: 'ASAP', date: null };
    // ASAP / ALAP have no date (an unknown type repaired to ASAP used to keep its date, shown in the Constraint Date column).
    if (['ASAP', 'ALAP'].includes(clean.constraint.type)) clean.constraint.date = null;
    for (const key of ['start', 'finish', 'actualStart', 'actualFinish', 'deadline']) clean[key] = iso(clean[key]);
    clean.calendarId = calendarIds.has(clean.calendarId) ? clean.calendarId : null;
    clean.fixedCost = number(clean.fixedCost);
    clean.levelingDelay = Math.max(0, number(clean.levelingDelay));
    clean.baselines = clean.baselines && typeof clean.baselines === 'object' ? clean.baselines : {};
    clean.predecessors = Array.isArray(clean.predecessors) ? clean.predecessors : [];
    return clean;
  });
  const taskIds = new Set(project.tasks.map((task) => task.id));
  for (const task of project.tasks) {
    task.predecessors = task.predecessors
      .filter((link) => link && taskIds.has(link.taskId) && link.taskId !== task.id)
      .map((link) => ({ taskId: link.taskId, type: ['FS', 'SS', 'FF', 'SF'].includes(link.type) ? link.type : 'FS', lag: number(link.lag), lagUnit: text(link.lagUnit) || 'd' }));
  }
  fixOutline(project);

  project.resources = (Array.isArray(raw.resources) ? raw.resources : []).filter((r) => r && typeof r === 'object').map((r) => {
    const clean = createResource(project, { ...r, id: text(r.id) || undefined });
    clean.name = text(clean.name);
    clean.type = RESOURCE_TYPES.includes(clean.type) ? clean.type : 'work';
    for (const key of ['maxUnits', 'stdRate', 'ovtRate', 'costPerUse']) clean[key] = Math.max(0, number(clean[key], key === 'maxUnits' ? 1 : 0));
    clean.calendarId = calendarIds.has(clean.calendarId) ? clean.calendarId : null;
    return clean;
  });
  const resourceIds = new Set(project.resources.map((r) => r.id));
  project.assignments = (Array.isArray(raw.assignments) ? raw.assignments : [])
    .filter((a) => a && taskIds.has(a.taskId) && resourceIds.has(a.resourceId))
    .map((a, index) => ({ ...a, id: text(a.id) || `a-${index}`, units: Math.max(0, number(a.units, 1)) }));
  project.baselineDates = raw.baselineDates && typeof raw.baselineDates === 'object' ? raw.baselineDates : {};
  return project;
}

/** Text of a .mwp / .mwpt file. Auto-scheduled dates are written too, for other programs to read. */
export function serialize(project, { template = false, sched = null } = {}) {
  const copy = JSON.parse(JSON.stringify(project));
  if (sched) {
    for (const task of copy.tasks) {
      const info = sched.info(task.id);
      if (!info || task.manual) continue;
      task.scheduledStart = info.start != null ? new Date(info.start * 60000).toISOString().slice(0, 16) : null;
      task.scheduledFinish = info.finish != null ? new Date(info.finish * 60000).toISOString().slice(0, 16) : null;
    }
  }
  if (template) {
    // A template starts fresh: no progress, no baselines, no status date.
    copy.statusDate = null;
    copy.baselineDates = {};
    for (const task of copy.tasks) Object.assign(task, { percentComplete: 0, actualStart: null, actualFinish: null, baselines: {}, levelingDelay: 0 });
  }
  return `${JSON.stringify({ format: FORMAT, version: VERSION, kind: template ? 'template' : 'plan', saved: new Date().toISOString(), project: copy }, null, 1)}\n`;
}

/** Parses a .mwp / .mwpt / .json file. Returns { project, template }. */
export function parsePlan(source, language = 'ko') {
  let data;
  try {
    data = JSON.parse(String(source ?? '').replace(/^﻿/, ''));
  } catch (error) {
    throw new FormatError('format.notJson', error.message);
  }
  if (!data || typeof data !== 'object') throw new FormatError('format.notPlan');
  if (data.format && data.format !== FORMAT) throw new FormatError('format.notPlan', String(data.format));
  if (Number(data.version) > VERSION) throw new FormatError('format.newer', String(data.version));
  const raw = data.project ?? data;
  const project = normalizeProject(raw, language);
  for (const task of project.tasks) { delete task.scheduledStart; delete task.scheduledFinish; }
  return { project, template: data.kind === 'template' };
}
