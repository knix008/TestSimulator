// Exchange with other programs: Microsoft Project XML (MSPDI), CSV for
// spreadsheets, and plain text copied to / pasted from Excel or an outline.
//
// Pure functions with no dependencies outside the domain, so they run the same
// in the browser and in Node (the XML reader below is our own: no DOMParser).
//
// MSPDI encodings used here (MS Project's own):
//  - moments 'YYYY-MM-DDTHH:MM:SS'; durations and work 'PT{h}H{m}M0S' (working time);
//  - DurationFormat / LagFormat 3 m, 4 em, 5 h, 6 eh, 7 d, 8 ed, 9 w, 10 ew, 11 mo,
//    12 emo, 19 %, 20 e% (+32 = estimated, e.g. 39 = 'd?');
//  - LinkLag, TotalSlack, FreeSlack, LevelingDelay in tenths of a minute; a
//    percentage lag is written with LagFormat 19 and LinkLag = percent × 10
//    (50 % → 500), the same tenths scale.
import { CalendarEngine, normalizePeriods, standardCalendar } from './calendars.js';
import { DEFAULT_OPTIONS, compactDuration, formatPredecessors, isElapsed, parseDuration, parsePredecessors } from './duration.js';
import { DATED_CONSTRAINTS, MAX_LEVEL, addResource, createProject, createTask, fixOutline, newId, outline } from './project.js';
import { schedule } from './schedule.js';
import { dayOf, dayStart, fromMin, isoDay, minToClock, clockToMin, parseDay, parts, toMin, weekdayOfDay } from './time.js';

/** An Error with a `.code` the UI translates ('format.notMspdi', 'format.emptyCsv'). */
function formatError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

/** The object without its null / undefined / NaN values (so create* defaults apply). */
function defined(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null || (typeof value === 'number' && Number.isNaN(value))) continue;
    out[key] = value;
  }
  return out;
}

const round = (value, digits = 2) => {
  const f = 10 ** digits;
  return Math.round((Number(value) || 0) * f) / f;
};

// ───────────────────────── XML reading

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][\w.-]*);/g, (all, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[ref] ?? all;
  });
}

const localName = (qname) => qname.slice(qname.indexOf(':') + 1);

/**
 * Parses XML text into { name (local name, prefix dropped), qname, attrs, children, text }.
 * Handles the XML declaration, comments, processing instructions, DOCTYPE,
 * CDATA and character / predefined entities. Throws on malformed input.
 */
export function parseXml(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const doc = { name: '#document', qname: '#document', attrs: {}, children: [], text: '' };
  const stack = [doc];
  let i = 0;
  const fail = (why) => { throw new Error(`XML: ${why} at ${i}`); };
  const addText = (raw, decode = true) => {
    const top = stack[stack.length - 1];
    if (stack.length === 1) {
      if (raw.trim()) fail('text outside the root element');
      return;
    }
    top.text += decode ? decodeEntities(raw) : raw;
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { addText(src.slice(i)); break; }
    if (lt > i) addText(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) fail('unclosed comment');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end < 0) fail('unclosed CDATA');
      addText(src.slice(lt + 9, end), false);
      i = end + 3;
    } else if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end < 0) fail('unclosed declaration');
      i = end + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE (with an optional [internal subset]).
      let j = lt + 2;
      let depth = 0;
      for (; j < src.length; j++) {
        if (src[j] === '[') depth += 1;
        else if (src[j] === ']') depth -= 1;
        else if (src[j] === '>' && depth <= 0) break;
      }
      if (j >= src.length) fail('unclosed DOCTYPE');
      i = j + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      if (end < 0) fail('unclosed end tag');
      const qname = src.slice(lt + 2, end).trim();
      const top = stack.pop();
      if (stack.length === 0 || top.qname !== qname) fail(`mismatched </${qname}>`);
      i = end + 1;
    } else {
      // Start tag: name, attributes (quoted values may contain '>'), '/>' or '>'.
      let j = lt + 1;
      const nameMatch = /^[^\s/>=<"']+/.exec(src.slice(j, j + 256));
      if (!nameMatch) fail('bad tag');
      const qname = nameMatch[0];
      j += qname.length;
      const attrs = {};
      let selfClosing = false;
      for (;;) {
        while (j < src.length && /\s/.test(src[j])) j++;
        if (j >= src.length) fail('unclosed tag');
        if (src[j] === '>') { j++; break; }
        if (src[j] === '/' && src[j + 1] === '>') { selfClosing = true; j += 2; break; }
        const attrMatch = /^[^\s/>=<"']+/.exec(src.slice(j, j + 256));
        if (!attrMatch) fail('bad attribute');
        j += attrMatch[0].length;
        while (/\s/.test(src[j] ?? '')) j++;
        if (src[j] !== '=') fail('attribute without value');
        j++;
        while (/\s/.test(src[j] ?? '')) j++;
        const quote = src[j];
        if (quote !== '"' && quote !== "'") fail('unquoted attribute');
        const close = src.indexOf(quote, j + 1);
        if (close < 0) fail('unclosed attribute');
        attrs[localName(attrMatch[0])] = decodeEntities(src.slice(j + 1, close));
        j = close + 1;
      }
      const node = { name: localName(qname), qname, attrs, children: [], text: '' };
      const parent = stack[stack.length - 1];
      if (parent === doc && doc.children.length) fail('more than one root element');
      parent.children.push(node);
      if (!selfClosing) stack.push(node);
      i = j;
    }
  }
  if (stack.length !== 1) fail('unclosed element');
  if (doc.children.length !== 1) fail('no root element');
  return doc.children[0];
}

const kid = (node, name) => node?.children.find((child) => child.name === name) ?? null;
const kids = (node, name) => node?.children.filter((child) => child.name === name) ?? [];
/** Trimmed text of a child element; null when it is missing or empty. */
const val = (node, name) => {
  const text = kid(node, name)?.text.trim();
  return text ? text : null;
};
const num = (node, name) => {
  const text = val(node, name);
  if (text == null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};
const flag = (node, name) => {
  const text = val(node, name);
  return text == null ? null : text === '1' || text.toLowerCase() === 'true';
};
/** 'YYYY-MM-DDTHH:MM:SS' → 'YYYY-MM-DDTHH:mm' (null for 'NA' and the like). */
const dateText = (text) => (text ? fromMin(toMin(text)) : null);

// ───────────────────────── XML writing

const esc = (value) => String(value ?? '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  .replace(/\r/g, '&#13;');

class XmlWriter {
  constructor() { this.lines = []; this.depth = 0; }
  raw(text) { this.lines.push(text); }
  open(name, attrs = '') { this.lines.push(`${'  '.repeat(this.depth)}<${name}${attrs}>`); this.depth += 1; }
  close(name) { this.depth -= 1; this.lines.push(`${'  '.repeat(this.depth)}</${name}>`); }
  /** <name>value</name>; nothing for null / undefined / ''. Booleans as 1 / 0. */
  leaf(name, value) {
    if (value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return;
    const text = typeof value === 'boolean' ? (value ? '1' : '0') : value;
    this.lines.push(`${'  '.repeat(this.depth)}<${name}>${esc(text)}</${name}>`);
  }
  toString() { return `${this.lines.join('\n')}\n`; }
}

const xmlDate = (minutes) => (minutes == null || !Number.isFinite(minutes) ? null : `${fromMin(minutes)}:00`);
const xmlDateOf = (text) => xmlDate(toMin(text));
const xmlClock = (minutes) => (minutes >= 1440 ? '00:00:00' : `${minToClock(minutes)}:00`);

/** Minutes → 'PT40H0M0S'. */
export function isoDuration(minutes) {
  const value = Math.round(Number(minutes) || 0);
  const abs = Math.abs(value);
  return `${value < 0 ? '-' : ''}PT${Math.floor(abs / 60)}H${abs % 60}M0S`;
}

/**
 * 'PT16H0M0S', 'PT7H30M', 'P1DT2H', 'P2W' → minutes. Days, weeks and months
 * count working time (hours per day …) unless `elapsed` (a day is then 24 h).
 * Null when the text is not an ISO 8601 duration.
 */
export function parseIsoDuration(text, options = DEFAULT_OPTIONS, elapsed = false) {
  const value = String(text ?? '').trim();
  const match = /^(-)?P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value);
  if (!match || /^-?PT?$/i.test(value)) return null;
  const o = { ...DEFAULT_OPTIONS, ...options };
  const [y, mo, w, d, h, m, s] = match.slice(2).map((part) => Number(part ?? 0));
  const day = elapsed ? 1440 : o.hoursPerDay * 60;
  const week = elapsed ? 10080 : o.hoursPerWeek * 60;
  const month = elapsed ? 43200 : o.daysPerMonth * o.hoursPerDay * 60;
  const minutes = y * 12 * month + mo * month + w * week + d * day + h * 60 + m + s / 60;
  return Math.round(minutes) * (match[1] ? -1 : 1);
}

// ───────────────────────── MSPDI code tables

const FORMAT_OF_UNIT = { m: 3, em: 4, h: 5, eh: 6, d: 7, ed: 8, w: 9, ew: 10, mo: 11, emo: 12, '%': 19 };
const UNIT_OF_FORMAT = { 3: 'm', 4: 'em', 5: 'h', 6: 'eh', 7: 'd', 8: 'ed', 9: 'w', 10: 'ew', 11: 'mo', 12: 'emo', 19: '%', 20: '%' };
/** Unit of a DurationFormat / LagFormat code (estimated codes 35… count as the plain ones). */
function unitOfFormat(code) {
  if (code == null) return null;
  const plain = code >= 35 && code <= 52 ? code - 32 : code;
  return UNIT_OF_FORMAT[plain] ?? null;
}
const LINK_CODE = { FF: 0, FS: 1, SF: 2, SS: 3 };
const LINK_OF_CODE = ['FF', 'FS', 'SF', 'SS'];
const CONSTRAINT_CODE = { ASAP: 0, ALAP: 1, MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 };
const CONSTRAINT_OF_CODE = ['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT'];
const TASK_TYPE_CODE = { fixedUnits: 0, fixedDuration: 1, fixedWork: 2 };
const TASK_TYPE_OF_CODE = ['fixedUnits', 'fixedDuration', 'fixedWork'];
const RESOURCE_TYPE_CODE = { material: 0, work: 1, cost: 2 };
const RESOURCE_TYPE_OF_CODE = ['material', 'work', 'cost'];
const ACCRUE_CODE = { start: 1, end: 2, prorated: 3 };
const ACCRUE_OF_CODE = { 1: 'start', 2: 'end', 3: 'prorated' };
// Custom fields as MS Project field ids (Text1, Text2, Text3, Number1, Flag1).
const CUSTOM_FIELDS = [
  ['text1', 188743731, 'Text1'], ['text2', 188743734, 'Text2'], ['text3', 188743737, 'Text3'],
  ['number1', 188743767, 'Number1'], ['flag1', 188743752, 'Flag1'],
];

// ───────────────────────── MSPDI export

/** The project as Microsoft Project XML (MSPDI) that MS Project 2010+ opens. */
export function exportMspdi(project, sched = schedule(project)) {
  const o = { ...DEFAULT_OPTIONS, ...(project.options ?? {}) };
  const structure = outline(project);
  const calUid = new Map(project.calendars.map((cal, index) => [cal.id, index + 1]));
  const taskUid = new Map(project.tasks.map((task, index) => [task.id, index + 1]));
  const resUid = new Map(project.resources.map((resource, index) => [resource.id, index + 1]));
  const projectCalUid = calUid.get(project.calendarId) ?? 1;
  const fromFinish = project.scheduleFrom === 'finish' && project.finish;
  const w = new XmlWriter();

  w.raw('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  w.open('Project', ' xmlns="http://schemas.microsoft.com/project"');
  w.leaf('SaveVersion', 14);
  w.leaf('Name', project.title);
  w.leaf('Title', project.title);
  w.leaf('Subject', project.subject);
  w.leaf('Category', project.category);
  w.leaf('Company', project.company);
  w.leaf('Manager', project.manager);
  w.leaf('Author', project.author);
  w.leaf('CreationDate', xmlDateOf(project.created));
  w.leaf('ScheduleFromStart', !fromFinish);
  w.leaf('StartDate', fromFinish ? xmlDate(sched.start) : xmlDateOf(project.start) ?? xmlDate(sched.start));
  w.leaf('FinishDate', fromFinish ? xmlDateOf(project.finish) : xmlDate(sched.finish));
  w.leaf('CriticalSlackLimit', Math.round(Number(o.criticalSlack) || 0));
  w.leaf('CurrencyDigits', o.currency === '₩' || o.currency === '¥' ? 0 : 2);
  w.leaf('CurrencySymbol', o.currency);
  w.leaf('CalendarUID', projectCalUid);
  w.leaf('DefaultStartTime', xmlClock(o.defaultStart ?? 480));
  w.leaf('DefaultFinishTime', xmlClock(o.defaultFinish ?? 1020));
  w.leaf('MinutesPerDay', Math.round(o.hoursPerDay * 60));
  w.leaf('MinutesPerWeek', Math.round(o.hoursPerWeek * 60));
  w.leaf('DaysPerMonth', o.daysPerMonth);
  w.leaf('DefaultTaskType', TASK_TYPE_CODE[o.defaultTaskType] ?? 0);
  w.leaf('DefaultFixedCostAccrual', 3);
  w.leaf('DefaultStandardRate', Number(o.defaultStdRate) || 0);
  w.leaf('DefaultOvertimeRate', Number(o.defaultOvtRate) || 0);
  w.leaf('DurationFormat', FORMAT_OF_UNIT[o.defaultDurationUnit] ?? 7);
  w.leaf('WorkFormat', 2);
  w.leaf('HonorConstraints', o.honorConstraints !== false);
  w.leaf('NewTasksEffortDriven', Boolean(o.effortDriven));
  w.leaf('NewTasksEstimated', true);
  w.leaf('WeekStartDay', o.weekStart ?? 1);
  w.leaf('StatusDate', xmlDateOf(project.statusDate));

  const usedCustom = CUSTOM_FIELDS.filter(([key]) => project.tasks.some((task) => task[key] !== undefined && task[key] !== '' && task[key] !== 0 && task[key] !== false && task[key] !== null));
  if (usedCustom.length) {
    w.open('ExtendedAttributes');
    for (const [, fieldId, fieldName] of usedCustom) {
      w.open('ExtendedAttribute');
      w.leaf('FieldID', fieldId);
      w.leaf('FieldName', fieldName);
      w.close('ExtendedAttribute');
    }
    w.close('ExtendedAttributes');
  }

  // Calendars: base calendars list all seven days; derived ones only the days they change.
  w.open('Calendars');
  for (const cal of project.calendars) {
    w.open('Calendar');
    w.leaf('UID', calUid.get(cal.id));
    w.leaf('Name', cal.name);
    w.leaf('IsBaseCalendar', !cal.base);
    w.leaf('IsBaselineCalendar', false);
    w.leaf('BaseCalendarUID', cal.base ? calUid.get(cal.base) ?? -1 : -1);
    const days = [0, 1, 2, 3, 4, 5, 6].filter((wd) => !cal.base || Array.isArray(cal.week?.[wd]));
    if (days.length) {
      w.open('WeekDays');
      for (const wd of days) {
        const periods = normalizePeriods(cal.week?.[wd] ?? []);
        w.open('WeekDay');
        w.leaf('DayType', wd + 1);
        w.leaf('DayWorking', periods.length > 0);
        writeWorkingTimes(w, periods);
        w.close('WeekDay');
      }
      w.close('WeekDays');
    }
    if (cal.exceptions?.length) {
      w.open('Exceptions');
      for (const exception of cal.exceptions) {
        const from = dayOf(toMin(exception.start));
        const to = dayOf(toMin(exception.finish ?? exception.start) ?? toMin(exception.start));
        const periods = exception.working ? normalizePeriods(exception.periods) : [];
        w.open('Exception');
        w.leaf('EnteredByOccurrences', false);
        w.open('TimePeriod');
        w.leaf('FromDate', `${isoDay(from)}T00:00:00`);
        w.leaf('ToDate', `${isoDay(Math.max(from, to))}T23:59:00`);
        w.close('TimePeriod');
        w.leaf('Occurrences', 1);
        w.leaf('Name', exception.name);
        w.leaf('Type', 1);
        w.leaf('DayWorking', periods.length > 0);
        writeWorkingTimes(w, periods);
        w.close('Exception');
      }
      w.close('Exceptions');
    }
    w.close('Calendar');
  }
  w.close('Calendars');

  // Tasks, after MS Project's project summary task (UID 0).
  w.open('Tasks');
  w.open('Task');
  w.leaf('UID', 0);
  w.leaf('ID', 0);
  w.leaf('Name', project.title);
  w.leaf('Active', true);
  w.leaf('Manual', false);
  w.leaf('Type', 1);
  w.leaf('IsNull', false);
  w.leaf('WBS', '0');
  w.leaf('OutlineNumber', '0');
  w.leaf('OutlineLevel', 0);
  w.leaf('Priority', project.priority ?? 500);
  w.leaf('Start', xmlDate(sched.start));
  w.leaf('Finish', xmlDate(sched.finish));
  w.leaf('Duration', isoDuration(sched.duration ?? 0));
  w.leaf('DurationFormat', 7);
  w.leaf('Work', isoDuration(sched.work ?? 0));
  w.leaf('Estimated', false);
  w.leaf('Milestone', false);
  w.leaf('Summary', true);
  w.leaf('Critical', false);
  w.leaf('PercentComplete', sched.percentComplete ?? 0);
  w.leaf('Cost', round(sched.cost));
  w.leaf('ConstraintType', 0);
  w.leaf('CalendarUID', -1);
  w.close('Task');

  project.tasks.forEach((task, index) => {
    const info = sched.info(task.id) ?? {};
    const summary = structure.isSummary(task.id);
    const unit = task.durationUnit ?? 'd';
    const duration = task.milestone ? 0 : info.duration ?? task.duration ?? 0;
    const constraint = task.constraint?.type ?? 'ASAP';
    w.open('Task');
    w.leaf('UID', taskUid.get(task.id));
    w.leaf('ID', index + 1);
    w.leaf('Name', task.name);
    w.leaf('Active', task.active !== false);
    w.leaf('Manual', Boolean(task.manual));
    w.leaf('Type', TASK_TYPE_CODE[task.type] ?? 0);
    w.leaf('IsNull', false);
    w.leaf('CreateDate', xmlDateOf(task.created));
    w.leaf('WBS', structure.wbs.get(task.id));
    w.leaf('OutlineNumber', structure.wbs.get(task.id));
    w.leaf('OutlineLevel', task.outlineLevel ?? 1);
    w.leaf('Priority', task.priority ?? 500);
    w.leaf('Start', xmlDate(info.start));
    w.leaf('Finish', xmlDate(info.finish));
    w.leaf('Duration', isoDuration(duration));
    if (task.manual) {
      w.leaf('ManualStart', xmlDate(info.start));
      w.leaf('ManualFinish', xmlDate(info.finish));
      w.leaf('ManualDuration', isoDuration(duration));
    }
    w.leaf('DurationFormat', summary ? 7 : FORMAT_OF_UNIT[unit] ?? 7);
    w.leaf('Work', isoDuration(info.work ?? 0));
    w.leaf('EffortDriven', Boolean(task.effortDriven));
    w.leaf('Estimated', Boolean(task.estimated));
    w.leaf('Milestone', Boolean(task.milestone));
    w.leaf('Summary', summary);
    w.leaf('Critical', Boolean(info.critical));
    w.leaf('FreeSlack', Math.round((info.freeSlack ?? 0) * 10));
    w.leaf('TotalSlack', Math.round((info.totalSlack ?? 0) * 10));
    w.leaf('FixedCost', Number(task.fixedCost) || 0);
    w.leaf('FixedCostAccrual', ACCRUE_CODE[task.fixedCostAccrual] ?? 3);
    w.leaf('PercentComplete', Math.round(info.percentComplete ?? task.percentComplete ?? 0));
    w.leaf('Cost', round(info.cost));
    w.leaf('ActualStart', xmlDateOf(task.actualStart));
    w.leaf('ActualFinish', xmlDateOf(task.actualFinish));
    w.leaf('ConstraintType', CONSTRAINT_CODE[constraint] ?? 0);
    w.leaf('CalendarUID', task.calendarId ? calUid.get(task.calendarId) ?? -1 : -1);
    if (DATED_CONSTRAINTS.includes(constraint)) w.leaf('ConstraintDate', xmlDateOf(task.constraint.date));
    w.leaf('Deadline', xmlDateOf(task.deadline));
    if (task.levelingDelay) {
      w.leaf('LevelingDelay', Math.round(task.levelingDelay * 10));
      w.leaf('LevelingDelayFormat', 8);
    }
    w.leaf('Hyperlink', task.hyperlink);
    w.leaf('HyperlinkAddress', task.hyperlink);
    w.leaf('Notes', task.notes);
    w.leaf('HideBar', Boolean(task.hideBar));
    for (const link of task.predecessors ?? []) {
      if (!taskUid.has(link.taskId)) continue;
      const lagUnit = link.lagUnit ?? 'd';
      w.open('PredecessorLink');
      w.leaf('PredecessorUID', taskUid.get(link.taskId));
      w.leaf('Type', LINK_CODE[link.type] ?? 1);
      w.leaf('CrossProject', false);
      w.leaf('LinkLag', Math.round((Number(link.lag) || 0) * 10));
      w.leaf('LagFormat', FORMAT_OF_UNIT[lagUnit] ?? 7);
      w.close('PredecessorLink');
    }
    for (const [key, fieldId] of usedCustom) {
      const value = task[key];
      if (value === undefined || value === null || value === '' || value === 0 || value === false) continue;
      w.open('ExtendedAttribute');
      w.leaf('FieldID', fieldId);
      w.leaf('Value', typeof value === 'boolean' ? (value ? '1' : '0') : value);
      w.close('ExtendedAttribute');
    }
    const baselines = Object.keys(task.baselines ?? {}).map(Number).filter((n) => n >= 0 && n <= 10).sort((a, b) => a - b);
    for (const n of baselines) {
      const base = task.baselines[n];
      if (!base) continue;
      w.open('Baseline');
      w.leaf('Number', n);
      w.leaf('Start', xmlDateOf(base.start));
      w.leaf('Finish', xmlDateOf(base.finish));
      w.leaf('Duration', isoDuration(base.duration ?? 0));
      w.leaf('DurationFormat', 7);
      w.leaf('Work', isoDuration(base.work ?? 0));
      w.leaf('Cost', round(base.cost));
      w.close('Baseline');
    }
    w.close('Task');
  });
  w.close('Tasks');

  w.open('Resources');
  project.resources.forEach((resource, index) => {
    const info = sched.resources?.get(resource.id);
    w.open('Resource');
    w.leaf('UID', resUid.get(resource.id));
    w.leaf('ID', index + 1);
    w.leaf('Name', resource.name);
    w.leaf('Type', RESOURCE_TYPE_CODE[resource.type] ?? 1);
    w.leaf('IsNull', false);
    w.leaf('Initials', resource.initials);
    if (resource.type === 'material') w.leaf('MaterialLabel', resource.materialLabel);
    w.leaf('Code', resource.code);
    w.leaf('Group', resource.group);
    w.leaf('EmailAddress', resource.email);
    if (resource.type === 'work') w.leaf('MaxUnits', Number(resource.maxUnits) || 0);
    w.leaf('AccrueAt', ACCRUE_CODE[resource.accrue] ?? 3);
    w.leaf('Work', isoDuration(info?.work ?? 0));
    w.leaf('StandardRate', Number(resource.stdRate) || 0);
    w.leaf('StandardRateFormat', 2);
    w.leaf('Cost', round(info?.cost));
    w.leaf('OvertimeRate', Number(resource.ovtRate) || 0);
    w.leaf('OvertimeRateFormat', 2);
    w.leaf('CostPerUse', Number(resource.costPerUse) || 0);
    w.leaf('CalendarUID', resource.calendarId ? calUid.get(resource.calendarId) ?? projectCalUid : resource.type === 'work' ? projectCalUid : -1);
    w.leaf('Notes', resource.notes);
    w.close('Resource');
  });
  w.close('Resources');

  w.open('Assignments');
  let uid = 0;
  for (const assignment of project.assignments) {
    if (!taskUid.has(assignment.taskId) || !resUid.has(assignment.resourceId)) continue;
    const result = sched.assignments?.get(assignment.id);
    const info = sched.info(assignment.taskId) ?? {};
    uid += 1;
    w.open('Assignment');
    w.leaf('UID', uid);
    w.leaf('TaskUID', taskUid.get(assignment.taskId));
    w.leaf('ResourceUID', resUid.get(assignment.resourceId));
    w.leaf('Cost', round(result?.cost ?? assignment.cost ?? 0));
    w.leaf('Finish', xmlDate(info.finish));
    w.leaf('Start', xmlDate(info.start));
    w.leaf('Units', Number(assignment.units) || 0);
    w.leaf('Work', isoDuration(result?.work ?? assignment.work ?? 0));
    w.close('Assignment');
  }
  w.close('Assignments');
  w.close('Project');
  return w.toString();
}

function writeWorkingTimes(w, periods) {
  if (!periods.length) return;
  w.open('WorkingTimes');
  for (const [from, to] of periods) {
    w.open('WorkingTime');
    w.leaf('FromTime', xmlClock(from));
    w.leaf('ToTime', xmlClock(to));
    w.close('WorkingTime');
  }
  w.close('WorkingTimes');
}

// ───────────────────────── MSPDI import

/**
 * A project from Microsoft Project XML. Throws an Error with
 * `.code = 'format.notMspdi'` when the text is not an MSPDI document.
 */
export function importMspdi(text, { language = 'ko' } = {}) {
  let root;
  try {
    root = parseXml(text);
  } catch (error) {
    throw formatError('format.notMspdi', error);
  }
  if (root.name !== 'Project') throw formatError('format.notMspdi');
  try {
    return projectFromMspdi(root, language);
  } catch (error) {
    if (error?.code) throw error;
    throw formatError('format.notMspdi', error);
  }
}

/** Periods of a <WorkingTimes> element ('00:00:00' as an end is midnight). */
function readWorkingTimes(node) {
  const periods = [];
  for (const time of kids(kid(node, 'WorkingTimes'), 'WorkingTime')) {
    const from = clockToMin((val(time, 'FromTime') ?? '').slice(0, 5));
    let to = clockToMin((val(time, 'ToTime') ?? '').slice(0, 5));
    if (from == null || to == null) continue;
    if (to <= from) to = 1440;
    periods.push([from, to]);
  }
  return normalizePeriods(periods);
}

/** First and last day of a <TimePeriod> (a ToDate at 00:00 ends the day before). */
function readTimePeriod(node) {
  const period = kid(node, 'TimePeriod');
  const from = toMin(val(period, 'FromDate'));
  if (from == null) return null;
  const toAt = toMin(val(period, 'ToDate')) ?? from;
  let to = dayOf(toAt);
  if (toAt % 1440 === 0 && to > dayOf(from)) to -= 1;
  return [dayOf(from), Math.max(dayOf(from), to)];
}

/**
 * The days of an <Exception> as [firstDay, lastDay] ranges. A plain one covers
 * FromDate…ToDate; recurring ones (weekly DaysOfWeek, yearly Month + MonthDay,
 * monthly MonthDay, every n days) are expanded within that range.
 */
function exceptionRanges(node) {
  const range = readTimePeriod(node);
  if (!range) return [];
  const [from, to] = range;
  const period = Math.max(1, num(node, 'Period') ?? 1);
  const byCount = flag(node, 'EnteredByOccurrences') ? num(node, 'Occurrences') : null;
  const daysOfWeek = num(node, 'DaysOfWeek');
  const month = num(node, 'Month');
  const monthDay = num(node, 'MonthDay');
  let test = null;
  if (daysOfWeek != null) {
    const firstWeek = from - weekdayOfDay(from);
    test = (day) => Math.floor((day - firstWeek) / 7) % period === 0 && (daysOfWeek & (1 << weekdayOfDay(day))) !== 0;
  } else if (month != null && monthDay != null) {
    test = (day) => { const p = parts(dayStart(day)); return p.month === month && p.day === monthDay; };
  } else if (monthDay != null) {
    const first = parts(dayStart(from));
    test = (day) => { const p = parts(dayStart(day)); return p.day === monthDay && ((p.year - first.year) * 12 + p.month - first.month) % period === 0; };
  } else if (period > 1) {
    test = (day) => (day - from) % period === 0;
  }
  if (!test) return [[from, to]];
  const out = [];
  const last = byCount ? from + 366 * 50 : Math.min(to, from + 366 * 50);
  for (let day = from; day <= last && out.length < 2000; day++) {
    if (!test(day)) continue;
    out.push([day, day]);
    if (byCount && out.length >= byCount) break;
  }
  return out;
}

function readCalendarException(node, ranges) {
  const working = flag(node, 'DayWorking') === true;
  const periods = working ? readWorkingTimes(node) : [];
  return ranges.map(([from, to]) => ({
    id: newId('ex'), name: val(node, 'Name') ?? '', start: isoDay(from), finish: isoDay(to),
    working: working && periods.length > 0, periods,
  }));
}

function projectFromMspdi(root, language) {
  const minutesPerDay = num(root, 'MinutesPerDay');
  const minutesPerWeek = num(root, 'MinutesPerWeek');
  const daysPerMonth = num(root, 'DaysPerMonth');
  const title = val(root, 'Title') ?? (val(root, 'Name') ?? '').replace(/\.(xml|mpp)$/i, '') ?? '';
  const start = dateText(val(root, 'StartDate'));
  const project = createProject(defined({ title: title || 'Project', start, language }));
  const o = project.options;
  if (minutesPerDay > 0) o.hoursPerDay = minutesPerDay / 60;
  if (minutesPerWeek > 0) o.hoursPerWeek = minutesPerWeek / 60;
  if (daysPerMonth > 0) o.daysPerMonth = daysPerMonth;
  const currency = val(root, 'CurrencySymbol');
  if (currency) o.currency = currency;
  const defaultStart = clockToMin((val(root, 'DefaultStartTime') ?? '').slice(0, 5));
  const defaultFinish = clockToMin((val(root, 'DefaultFinishTime') ?? '').slice(0, 5));
  if (defaultStart != null) o.defaultStart = defaultStart;
  if (defaultFinish != null) o.defaultFinish = defaultFinish || 1440;
  if (num(root, 'DefaultTaskType') != null) o.defaultTaskType = TASK_TYPE_OF_CODE[num(root, 'DefaultTaskType')] ?? o.defaultTaskType;
  if (flag(root, 'HonorConstraints') != null) o.honorConstraints = flag(root, 'HonorConstraints');
  if (flag(root, 'NewTasksEffortDriven') != null) o.effortDriven = flag(root, 'NewTasksEffortDriven');
  if (num(root, 'WeekStartDay') != null) o.weekStart = num(root, 'WeekStartDay');
  if (num(root, 'CriticalSlackLimit') != null) o.criticalSlack = num(root, 'CriticalSlackLimit');
  if (num(root, 'DefaultStandardRate') != null) o.defaultStdRate = num(root, 'DefaultStandardRate');
  if (num(root, 'DefaultOvertimeRate') != null) o.defaultOvtRate = num(root, 'DefaultOvertimeRate');
  const defaultUnit = unitOfFormat(num(root, 'DurationFormat'));
  if (defaultUnit && defaultUnit !== '%') o.defaultDurationUnit = defaultUnit;
  for (const [key, name] of [['subject', 'Subject'], ['category', 'Category'], ['company', 'Company'], ['manager', 'Manager'], ['author', 'Author']]) {
    const value = val(root, name);
    if (value) project[key] = value;
  }
  if (val(root, 'CreationDate')) project.created = dateText(val(root, 'CreationDate')) ?? project.created;
  project.statusDate = dateText(val(root, 'StatusDate'));
  if (val(root, 'ScheduleFromStart') === '0' && dateText(val(root, 'FinishDate'))) {
    project.scheduleFrom = 'finish';
    project.finish = dateText(val(root, 'FinishDate'));
  }
  const iso = (text, elapsed = false) => (text ? parseIsoDuration(text, o, elapsed) : null);

  // ── resources and tasks first (to know which calendars are resource calendars)
  const resourceNodes = kids(kid(root, 'Resources'), 'Resource')
    .filter((node) => !flag(node, 'IsNull') && !(num(node, 'UID') === 0 && !val(node, 'Name')));
  const taskNodes = kids(kid(root, 'Tasks'), 'Task')
    .filter((node) => !flag(node, 'IsNull') && num(node, 'UID') !== 0 && num(node, 'OutlineLevel') !== 0)
    .map((node, index) => ({ node, order: num(node, 'ID') ?? 1e9 + index }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.node);

  // ── calendars
  const calendarNodes = kids(kid(root, 'Calendars'), 'Calendar').filter((node) => num(node, 'UID') != null);
  const calendarIds = new Map(); // uid → calendar id
  if (calendarNodes.length) {
    const projectUid = num(root, 'CalendarUID')
      ?? num(calendarNodes.find((node) => /^(standard|표준)$/i.test(val(node, 'Name') ?? '')) ?? calendarNodes.find((node) => flag(node, 'IsBaseCalendar') !== false), 'UID')
      ?? num(calendarNodes[0], 'UID');
    const taken = new Set();
    const defaults = { '24 hours': '24hours', '24시간': '24hours', 'night shift': 'night', '야간 작업': 'night', '야간': 'night' };
    const calendars = [];
    const raw = new Map();
    for (const node of calendarNodes) {
      const uid = num(node, 'UID');
      const name = val(node, 'Name') ?? '';
      let id = uid === projectUid ? 'standard' : defaults[name.toLowerCase()];
      if (!id || taken.has(id)) id = newId('cal');
      taken.add(id);
      calendarIds.set(uid, id);
      const isBase = flag(node, 'IsBaseCalendar') !== false;
      const baseUid = num(node, 'BaseCalendarUID');
      const week = {};
      const oldExceptions = [];
      for (const day of kids(kid(node, 'WeekDays'), 'WeekDay')) {
        const type = num(day, 'DayType');
        if (type == null) continue;
        if (type === 0) {
          // Older form: an exception written as a WeekDay with a TimePeriod.
          const range = readTimePeriod(day);
          if (range) oldExceptions.push(...readCalendarException(day, [range]));
          continue;
        }
        if (type < 1 || type > 7) continue;
        const working = flag(day, 'DayWorking') === true;
        let periods = working ? readWorkingTimes(day) : [];
        if (working && !periods.length) periods = standardCalendar().week[1].map((p) => [...p]);
        week[type - 1] = periods;
      }
      const exceptionsNode = kid(node, 'Exceptions');
      const exceptions = exceptionsNode
        ? kids(exceptionsNode, 'Exception').flatMap((exception) => readCalendarException(exception, exceptionRanges(exception)))
        : oldExceptions;
      exceptions.sort((a, b) => a.start.localeCompare(b.start));
      if (isBase || baseUid == null || baseUid < 0) {
        // A base calendar defines every day (missing days as the standard week).
        for (let wd = 0; wd < 7; wd++) if (!week[wd]) week[wd] = standardCalendar().week[wd].map((p) => [...p]);
      }
      const calendar = { id, name: name || id, base: null, week, exceptions };
      raw.set(uid, { calendar, baseUid: isBase ? null : baseUid, empty: !Object.keys(week).length && !exceptions.length });
      calendars.push(calendar);
    }
    for (const { calendar, baseUid } of raw.values()) {
      if (baseUid != null && raw.has(baseUid) && raw.get(baseUid).calendar !== calendar) calendar.base = raw.get(baseUid).calendar.id;
    }
    // Resource calendars that change nothing are their base calendar.
    const usedByTasks = new Set(taskNodes.map((node) => num(node, 'CalendarUID')));
    const usedByResources = new Set(resourceNodes.map((node) => num(node, 'CalendarUID')));
    const dropped = new Set();
    for (const [uid, item] of raw) {
      if (!item.empty || !item.calendar.base || uid === projectUid || usedByTasks.has(uid) || !usedByResources.has(uid)) continue;
      if (calendars.some((cal) => cal.base === item.calendar.id)) continue;
      dropped.add(item.calendar);
      calendarIds.set(uid, item.calendar.base);
    }
    project.calendars = calendars.filter((cal) => !dropped.has(cal));
    if (!project.calendars.some((cal) => cal.id === 'standard')) project.calendars[0].id = 'standard';
    project.calendarId = 'standard';
  }
  const calendarOf = (uid) => (uid == null || uid < 0 ? null : calendarIds.get(uid) ?? null);

  // ── resources
  const resourceIds = new Map(); // uid → id
  for (const node of resourceNodes) {
    let type = RESOURCE_TYPE_OF_CODE[num(node, 'Type') ?? 1] ?? 'work';
    if (flag(node, 'IsCostResource')) type = 'cost';
    let calendarId = calendarOf(num(node, 'CalendarUID'));
    if (calendarId === project.calendarId) calendarId = null;
    const resource = addResource(project, defined({
      name: val(node, 'Name') ?? '',
      type,
      initials: val(node, 'Initials'),
      group: val(node, 'Group'),
      email: val(node, 'EmailAddress'),
      maxUnits: num(node, 'MaxUnits'),
      stdRate: num(node, 'StandardRate'),
      ovtRate: num(node, 'OvertimeRate'),
      costPerUse: num(node, 'CostPerUse'),
      accrue: ACCRUE_OF_CODE[num(node, 'AccrueAt')],
      calendarId,
      materialLabel: val(node, 'MaterialLabel'),
      code: val(node, 'Code'),
      notes: kid(node, 'Notes')?.text,
    }));
    resourceIds.set(num(node, 'UID'), resource.id);
  }

  // ── tasks
  const customById = new Map(CUSTOM_FIELDS.map(([key, fieldId]) => [fieldId, key]));
  const taskIds = new Map(); // uid → id
  const taskWork = new Map();
  for (const node of taskNodes) {
    const formatCode = num(node, 'DurationFormat');
    let unit = unitOfFormat(formatCode);
    if (!unit || unit === '%') unit = o.defaultDurationUnit ?? 'd';
    const elapsed = isElapsed(unit);
    const manual = flag(node, 'Manual') === true;
    const milestone = flag(node, 'Milestone') === true;
    const durationText = manual ? val(node, 'ManualDuration') ?? val(node, 'Duration') : val(node, 'Duration');
    const duration = milestone ? 0 : iso(durationText, elapsed);
    const constraintType = CONSTRAINT_OF_CODE[num(node, 'ConstraintType') ?? 0] ?? 'ASAP';
    const level = num(node, 'OutlineLevel') ?? ((val(node, 'OutlineNumber') ?? '1').split('.').length);
    const baselines = {};
    for (const base of kids(node, 'Baseline')) {
      const n = num(base, 'Number') ?? 0;
      if (n < 0 || n > 10) continue;
      baselines[n] = {
        start: dateText(val(base, 'Start')), finish: dateText(val(base, 'Finish')),
        duration: iso(val(base, 'Duration')) ?? 0, work: iso(val(base, 'Work')) ?? 0, cost: num(base, 'Cost') ?? 0,
      };
      project.baselineDates[n] = project.baselineDates[n] ?? new Date().toISOString();
    }
    const custom = {};
    for (const attribute of kids(node, 'ExtendedAttribute')) {
      const key = customById.get(num(attribute, 'FieldID'));
      if (!key) continue;
      const value = kid(attribute, 'Value')?.text ?? '';
      custom[key] = key === 'number1' ? Number(value) || 0 : key === 'flag1' ? value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes' : value;
    }
    const levelingDelay = num(node, 'LevelingDelay');
    const task = createTask(project, defined({
      name: kid(node, 'Name')?.text ?? '',
      outlineLevel: Math.max(1, Math.min(MAX_LEVEL, Math.round(level))),
      manual,
      duration,
      durationUnit: unit,
      estimated: flag(node, 'Estimated') ?? (formatCode != null && formatCode >= 35 ? true : duration == null ? null : false),
      start: manual ? dateText(val(node, 'ManualStart') ?? val(node, 'Start')) : null,
      finish: manual && !milestone ? dateText(val(node, 'ManualFinish') ?? val(node, 'Finish')) : null,
      milestone,
      percentComplete: num(node, 'PercentComplete'),
      actualStart: dateText(val(node, 'ActualStart')),
      actualFinish: dateText(val(node, 'ActualFinish')),
      constraint: { type: constraintType, date: DATED_CONSTRAINTS.includes(constraintType) ? dateText(val(node, 'ConstraintDate')) : null },
      deadline: dateText(val(node, 'Deadline')),
      priority: num(node, 'Priority'),
      type: TASK_TYPE_OF_CODE[num(node, 'Type')],
      effortDriven: flag(node, 'EffortDriven'),
      fixedCost: num(node, 'FixedCost'),
      fixedCostAccrual: ACCRUE_OF_CODE[num(node, 'FixedCostAccrual')],
      notes: kid(node, 'Notes')?.text,
      calendarId: calendarOf(num(node, 'CalendarUID')),
      active: flag(node, 'Active'),
      hyperlink: val(node, 'HyperlinkAddress') ?? val(node, 'Hyperlink'),
      hideBar: flag(node, 'HideBar'),
      levelingDelay: levelingDelay ? Math.round(levelingDelay / 10) : null,
      baselines,
      created: dateText(val(node, 'CreateDate')),
      ...custom,
    }));
    if (task.constraint.date == null && DATED_CONSTRAINTS.includes(task.constraint.type)) task.constraint = { type: 'ASAP', date: null };
    project.tasks.push(task);
    taskIds.set(num(node, 'UID'), task.id);
    taskWork.set(task.id, iso(val(node, 'Work')));
  }

  // ── links (after every task exists)
  taskNodes.forEach((node, index) => {
    const task = project.tasks[index];
    for (const link of kids(node, 'PredecessorLink')) {
      if (flag(link, 'CrossProject')) continue;
      const from = taskIds.get(num(link, 'PredecessorUID'));
      if (!from || from === task.id || task.predecessors.some((item) => item.taskId === from)) continue;
      const lagUnit = unitOfFormat(num(link, 'LagFormat')) ?? 'd';
      const raw = (num(link, 'LinkLag') ?? 0) / 10;
      task.predecessors.push({
        taskId: from,
        type: LINK_OF_CODE[num(link, 'Type') ?? 1] ?? 'FS',
        lag: lagUnit === '%' ? raw : Math.round(raw),
        lagUnit,
      });
    }
  });

  // ── assignments
  const byTask = new Map(project.tasks.map((task) => [task.id, task]));
  for (const node of kids(kid(root, 'Assignments'), 'Assignment')) {
    const taskId = taskIds.get(num(node, 'TaskUID'));
    const resourceId = resourceIds.get(num(node, 'ResourceUID'));
    if (!taskId || !resourceId) continue;
    if (project.assignments.some((a) => a.taskId === taskId && a.resourceId === resourceId)) continue;
    const resource = project.resources.find((item) => item.id === resourceId);
    const assignment = { id: newId('a'), taskId, resourceId, units: num(node, 'Units') ?? 1 };
    if (resource.type === 'cost') assignment.cost = num(node, 'Cost') ?? 0;
    if (resource.type === 'work' && byTask.get(taskId).type === 'fixedWork' && val(node, 'Work')) assignment.work = iso(val(node, 'Work'));
    project.assignments.push(assignment);
  }
  // Work typed on tasks without resources.
  for (const task of project.tasks) {
    if (project.assignments.some((a) => a.taskId === task.id)) continue;
    const work = taskWork.get(task.id);
    if (work) task.work = work;
  }

  fixOutline(project);
  return project;
}

// ───────────────────────── CSV

export const CSV_HEADERS = ['ID', 'WBS', 'Name', 'Outline Level', 'Duration', 'Start', 'Finish', 'Predecessors', 'Resource Names', '% Complete', 'Cost', 'Work', 'Milestone', 'Notes'];

// Header names (lower case) → field. English, MS Project's Korean names, and common variants.
const HEADER_ALIASES = {
  id: ['id', '#', '번호', '작업 id', '고유 번호'],
  wbs: ['wbs'],
  name: ['name', 'task name', 'task', 'title', 'summary', '이름', '작업 이름', '작업명', '작업'],
  level: ['outline level', 'level', 'outlinelevel', '개요 수준', '수준'],
  duration: ['duration', '기간'],
  start: ['start', 'start date', 'begin', '시작', '시작 날짜', '시작일'],
  finish: ['finish', 'finish date', 'end', 'end date', 'due', 'due date', '완료', '완료 날짜', '종료', '종료일', '완료일'],
  predecessors: ['predecessors', 'predecessor', '선행 작업', '선행작업'],
  resources: ['resource names', 'resources', 'resource', 'assigned to', '자원 이름', '자원'],
  percent: ['% complete', 'percent complete', '%complete', 'progress', '완료율', '% 완료', '진행률'],
  cost: ['cost', '비용'],
  work: ['work', '작업량', '작업 시간'],
  milestone: ['milestone', '마일스톤', '이정표', '단계'],
  notes: ['notes', 'note', 'comments', '메모', '비고'],
};
const HEADER_FIELD = new Map(Object.entries(HEADER_ALIASES).flatMap(([field, names]) => names.map((name) => [name, field])));
const normalizeHeader = (text) => String(text ?? '').replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** One CSV field, quoted when needed (RFC 4180). */
function csvField(value) {
  const text = String(value ?? '');
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvDate = (minutes) => (minutes == null ? '' : fromMin(minutes).replace('T', ' '));

/** A duration in its unit when that is exact, else in hours or minutes ('7.5h', '45m'). */
function durationText(minutes, unit, options) {
  for (const candidate of [unit, isElapsed(unit) ? 'eh' : 'h', isElapsed(unit) ? 'em' : 'm']) {
    const text = compactDuration(minutes, candidate, options);
    if (parseDuration(text, options)?.minutes === Math.round(minutes)) return text;
  }
  return compactDuration(minutes, 'm', options);
}

/** Display of a task's resources: 'Kim;Lee[50%];Cement[20]'. */
function resourceNamesOf(project, taskId) {
  return project.assignments
    .filter((assignment) => assignment.taskId === taskId)
    .map((assignment) => {
      const resource = project.resources.find((item) => item.id === assignment.resourceId);
      if (!resource) return null;
      const units = Number(assignment.units) || 0;
      if (resource.type === 'material') return `${resource.name}[${round(units, 3)}]`;
      if (resource.type === 'work' && units !== 1) return `${resource.name}[${round(units * 100, 1)}%]`;
      return resource.name;
    })
    .filter(Boolean)
    .join(';');
}

/** The task table as CSV (UTF-8 with BOM, CRLF, English headers so it reads back the same). */
export function exportCsv(project, sched = schedule(project), { language = 'en' } = {}) { // eslint-disable-line no-unused-vars
  const o = { ...DEFAULT_OPTIONS, ...(project.options ?? {}) };
  const structure = outline(project);
  const rows = new Map(project.tasks.map((task, index) => [task.id, index + 1]));
  const lines = [CSV_HEADERS.map(csvField).join(',')];
  project.tasks.forEach((task, index) => {
    const info = sched.info(task.id) ?? {};
    const summary = structure.isSummary(task.id);
    const unit = summary && isElapsed(task.durationUnit ?? 'd') ? 'd' : task.durationUnit ?? 'd';
    const minutes = task.milestone ? 0 : info.duration ?? task.duration ?? 0;
    const duration = `${durationText(minutes, unit, o)}${task.estimated && !summary ? '?' : ''}`;
    lines.push([
      index + 1,
      structure.wbs.get(task.id),
      task.name,
      task.outlineLevel ?? 1,
      duration,
      csvDate(info.start),
      csvDate(info.finish),
      formatPredecessors(task.predecessors, (id) => rows.get(id), o),
      resourceNamesOf(project, task.id),
      Math.round(info.percentComplete ?? task.percentComplete ?? 0),
      round(info.cost),
      round((info.work ?? 0) / 60),
      task.milestone ? 'Yes' : 'No',
      task.notes ?? '',
    ].map(csvField).join(','));
  });
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Comma, semicolon or tab: whichever appears most in the first line (outside quotes). */
export function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const c of String(text)) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && c in counts) counts[c] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/** RFC 4180 records: quoted fields may hold delimiters, line breaks and doubled quotes. */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else if (c === '\r' && src[i + 1] === '\n') {
        field += '\n';
        i++;
      } else field += c;
    } else if (c === '"' && !wasQuoted && field.trim() === '') {
      quoted = true;
      wasQuoted = true;
      field = '';
    } else if (c === delimiter) {
      row.push(field);
      field = '';
      wasQuoted = false;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      wasQuoted = false;
      if (c === '\r' && src[i + 1] === '\n') i++;
    } else field += c;
  }
  if (field !== '' || row.length || wasQuoted) { row.push(field); rows.push(row); }
  return rows;
}

const YES = new Set(['yes', 'y', 'true', '1', 'x', '예', '네', 'o', 'v', '✓', '✔']);

/** 'YYYY-MM-DD HH:mm', 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD', '10/19/2026' → minutes (`time` when no time is given). */
function csvMoment(text, time) {
  const value = String(text ?? '').trim();
  if (!value) return null;
  const hasTime = /\d{1,2}:\d{2}/.test(value);
  const minutes = /^\d{4}-\d{1,2}-\d{1,2}/.test(value) ? toMin(value) : parseDay(value.replace(/(\d{1,2}:\d{2}):\d{2}\s*$/, '$1'), 'iso');
  if (minutes == null) return null;
  return hasTime ? minutes : dayStart(dayOf(minutes)) + time;
}

/** Leading indentation and bullets → { level (0-based), text }. Two spaces or a tab per level. */
function stripIndent(line) {
  const lead = /^[ \t　]*/.exec(line)[0];
  let width = 0;
  for (const c of lead) width += c === '\t' ? 2 : c === '　' ? 2 : 1;
  let text = line.slice(lead.length);
  let numbering = 0;
  const bullet = /^(?:[-*+•·◦▪▫‣○●■□–—]|(\d+(?:\.\d+)*)[.)]|(\d+(?:\.\d+)+))\s+/.exec(text);
  if (bullet) {
    numbering = (bullet[1] ?? bullet[2] ?? '').split('.').filter(Boolean).length;
    text = text.slice(bullet[0].length);
  }
  return { indent: Math.floor(width / 2), numbering, text };
}

/** Outline levels from raw indents: shallowest is 1, never more than one deeper than the row above. */
function levelsFromIndents(indents) {
  const min = Math.min(...indents);
  const out = [];
  let previous = 0;
  for (const indent of indents) {
    const level = Math.max(1, Math.min(MAX_LEVEL, indent - min + 1, previous + 1));
    out.push(level);
    previous = level;
  }
  return out;
}

/**
 * A project from CSV: the export above, MS Project / Excel tables (headers in
 * English or Korean, any order, comma / semicolon / tab), or a plain list (one
 * task name per line). Throws `.code = 'format.emptyCsv'` when nothing is usable.
 */
export function importCsv(text, { language = 'ko', title = 'Project' } = {}) {
  const source = String(text ?? '').replace(/^﻿/, '');
  const records = parseCsv(source, detectDelimiter(source)).filter((row) => row.some((cell) => cell.trim()));
  if (!records.length) throw formatError('format.emptyCsv');

  const header = records[0].map(normalizeHeader);
  const columns = {};
  header.forEach((name, index) => {
    const field = HEADER_FIELD.get(name);
    if (field && !(field in columns)) columns[field] = index;
  });
  // A lone header-like word ('Work') in a one-column list is a task, not a header.
  const hasHeader = Object.keys(columns).length > 0 && (records[0].length > 1 || 'name' in columns);
  if (hasHeader && !('name' in columns)) {
    // A table with known columns but an unknown name column: the first unknown column.
    const free = header.findIndex((name, index) => name && !Object.values(columns).includes(index));
    if (free < 0) throw formatError('format.emptyCsv');
    columns.name = free;
  }
  if (!hasHeader) columns.name = 0;
  const body = hasHeader ? records.slice(1) : records;

  const probe = createProject({ language });
  const o = probe.options;
  const engine = new CalendarEngine(probe.calendars, probe.calendarId);
  const cell = (row, field) => (columns[field] == null ? '' : String(row[columns[field]] ?? ''));

  // Read every row first: the project start is the earliest task start.
  const items = [];
  for (const row of body) {
    const rawName = cell(row, 'name');
    const { indent, numbering, text: name } = stripIndent(rawName.replace(/\r?\n/g, ' '));
    if (!name.trim()) continue;
    const start = csvMoment(cell(row, 'start'), o.defaultStart);
    const finish = csvMoment(cell(row, 'finish'), o.defaultFinish);
    let parsed = parseDuration(cell(row, 'duration'), o, o.defaultDurationUnit);
    if (!parsed && !hasHeader && row.length > 1) parsed = parseDuration(row[1], o, o.defaultDurationUnit);
    const levelText = cell(row, 'level').trim();
    items.push({
      row, name: name.trim(), start, finish, parsed,
      id: Number(cell(row, 'id').trim()) || null,
      level: levelText && Number.isFinite(Number(levelText)) ? Number(levelText) : null,
      indent: columns.level == null ? Math.max(indent, numbering ? numbering - 1 : 0) : 0,
    });
  }
  if (!items.length) throw formatError('format.emptyCsv');

  const starts = items.map((item) => item.start).filter((t) => t != null);
  const project = createProject({ title, language, ...(starts.length ? { start: fromMin(Math.min(...starts)) } : {}) });
  const levels = columns.level == null ? levelsFromIndents(items.map((item) => item.indent)) : null;
  const byRow = new Map();
  const resources = new Map(project.resources.map((r) => [r.name.toLowerCase(), r]));
  items.forEach((item, index) => {
    const milestoneText = cell(item.row, 'milestone').trim().toLowerCase();
    let { parsed } = item;
    if (!parsed && item.start != null && item.finish != null && item.finish >= item.start) {
      parsed = { minutes: engine.between(item.start, item.finish), unit: 'd', estimated: false };
    }
    const milestone = YES.has(milestoneText) || parsed?.minutes === 0;
    const percent = parseFloat(cell(item.row, 'percent').replace('%', ''));
    const task = createTask(project, defined({
      name: item.name,
      outlineLevel: levels ? levels[index] : Math.max(1, Math.round(item.level ?? 1)),
      duration: milestone ? 0 : parsed?.minutes,
      durationUnit: parsed?.unit,
      estimated: parsed ? parsed.estimated : null,
      milestone,
      percentComplete: Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null,
      notes: cell(item.row, 'notes') || null,
    }));
    project.tasks.push(task);
    byRow.set(item.id ?? index + 1, task.id);
    // Resources by name, created the first time they appear.
    for (const part of cell(item.row, 'resources').split(/[;,](?![^[]*\])/)) {
      const match = /^\s*(.*?)\s*(?:\[\s*([-+]?\d*\.?\d+)\s*(%?)\s*([^\]]*)\])?\s*$/.exec(part);
      const name = match?.[1];
      if (!name) continue;
      const material = match[2] != null && !match[3];
      const units = match[2] == null ? 1 : material ? Number(match[2]) : Number(match[2]) / 100;
      let resource = resources.get(name.toLowerCase());
      if (!resource) {
        resource = addResource(project, { name, type: material ? 'material' : 'work', materialLabel: material ? match[4].trim() : '' });
        resources.set(name.toLowerCase(), resource);
      }
      if (!project.assignments.some((a) => a.taskId === task.id && a.resourceId === resource.id)) {
        project.assignments.push({ id: newId('a'), taskId: task.id, resourceId: resource.id, units });
      }
    }
    item.task = task;
  });
  fixOutline(project);

  // Links (by ID column, else by row), constraints, cost and work.
  const structure = outline(project);
  const idOf = (row) => byRow.get(row) ?? null;
  for (const item of items) {
    const { task } = item;
    const { links } = parsePredecessors(cell(item.row, 'predecessors'), idOf, o);
    for (const link of links) {
      if (link.taskId === task.id || task.predecessors.some((other) => other.taskId === link.taskId)) continue;
      task.predecessors.push(link);
    }
    if (structure.isSummary(task.id)) continue;
    if (item.start != null && !task.predecessors.length) task.constraint = { type: 'SNET', date: fromMin(item.start) };
    const cost = parseFloat(cell(item.row, 'cost').replace(/[^0-9.+-]/g, ''));
    // Resources made here have no rates, so the cost read back is the task's fixed cost.
    if (Number.isFinite(cost) && cost) task.fixedCost = cost;
    const assigned = project.assignments.some((a) => a.taskId === task.id);
    const work = parseDuration(cell(item.row, 'work'), o, 'h');
    if (work && work.minutes && !assigned) task.work = work.minutes;
  }
  // Linked tasks the links alone would start earlier than the file says (a
  // constraint the CSV could not carry): hold them at their start too.
  for (let pass = 0; pass < 5; pass++) {
    const s = schedule(project);
    let changed = false;
    for (const item of items) {
      const { task } = item;
      if (item.start == null || structure.isSummary(task.id) || task.constraint.type !== 'ASAP') continue;
      if ((s.info(task.id)?.start ?? item.start) < item.start) {
        task.constraint = { type: 'SNET', date: fromMin(item.start) };
        changed = true;
      }
    }
    if (!changed) break;
  }
  return project;
}

// ───────────────────────── clipboard text

/** The tasks (in row order) as tab-separated Name, Duration, Start, Finish lines for Excel; names indented two spaces per level. */
export function tasksToTsv(project, sched = schedule(project), ids = project.tasks.map((task) => task.id)) {
  const o = { ...DEFAULT_OPTIONS, ...(project.options ?? {}) };
  const wanted = new Set(ids);
  const tasks = project.tasks.filter((task) => wanted.has(task.id));
  if (!tasks.length) return '';
  const base = Math.min(...tasks.map((task) => task.outlineLevel ?? 1));
  const clean = (text) => String(text ?? '').replace(/[\t\r\n]+/g, ' ');
  return `${tasks.map((task) => {
    const info = sched.info(task.id) ?? {};
    const minutes = task.milestone ? 0 : info.duration ?? task.duration ?? 0;
    const unit = info.summary && isElapsed(task.durationUnit ?? 'd') ? 'd' : task.durationUnit ?? 'd';
    return [
      '  '.repeat(Math.max(0, (task.outlineLevel ?? 1) - base)) + clean(task.name),
      durationText(minutes, unit, o),
      csvDate(info.start),
      csvDate(info.finish),
    ].join('\t');
  }).join('\r\n')}\r\n`;
}

/**
 * Tasks from pasted text: one per line; leading tabs / spaces (a tab or two
 * spaces per level), bullets (-, *, •) or numbering (1., 1), 1.2) give the outline
 * level; an optional tab-separated second column is a duration ('3d').
 * Returns [{ name, outlineLevel, duration?, durationUnit? }].
 */
export function tasksFromText(text, options = DEFAULT_OPTIONS) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const items = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const { indent, numbering, text: rest } = stripIndent(line);
    const [name, second] = rest.split('\t');
    if (!name.trim()) continue;
    const item = { name: name.trim(), indent: indent || (numbering > 1 ? numbering - 1 : 0) };
    const parsed = second != null ? parseDuration(second, options) : null;
    if (parsed) { item.duration = parsed.minutes; item.durationUnit = parsed.unit; }
    items.push(item);
  }
  if (!items.length) return [];
  const levels = levelsFromIndents(items.map((item) => item.indent));
  return items.map(({ indent, ...item }, index) => ({ ...item, outlineLevel: levels[index] })); // eslint-disable-line no-unused-vars
}
