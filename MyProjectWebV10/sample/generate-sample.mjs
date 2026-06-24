/**
 * Generates sample/sample.xlsx for MyProject Excel schedule import.
 * Run from repo root: node sample/generate-sample.mjs
 */
import ExcelJS from '../node_modules/exceljs/excel.js';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, 'sample.xlsx');

const TASK_SHEET = 'Task Schedule';
const DEP_SHEET = 'Dependencies';

/** Mon–Fri working week (matches default project settings). */
function isWorkingDay(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function snapToNextWorkingDay(date) {
  const d = startOfDay(date);
  while (!isWorkingDay(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** Inclusive working-day span from start through end. */
function countWorkingDaysInclusive(from, to) {
  let start = startOfDay(from);
  let end = startOfDay(to);
  if (end < start) [start, end] = [end, start];
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (isWorkingDay(cursor)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Task end date for durationDays >= 1 (inclusive working days). */
function taskEndDate(start, durationDays) {
  if (durationDays <= 0) return startOfDay(start);
  let remaining = durationDays - 1;
  const d = snapToNextWorkingDay(start);
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) remaining--;
  }
  return d;
}

/** First working day strictly after end (FS successor start). */
function fsSuccessorStart(predecessorEnd) {
  const d = startOfDay(predecessorEnd);
  d.setDate(d.getDate() + 1);
  return snapToNextWorkingDay(d);
}

function date(y, m, d) {
  return startOfDay(new Date(y, m - 1, d));
}

/** Excel import/export: use local noon to avoid UTC date shift. */
function toExcelDate(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

function indent(level, name) {
  return `${' '.repeat(level * 2)}${name}`;
}

function rollupSummary(directChildren, allDescendants) {
  const starts = allDescendants.map((t) => t.start);
  const ends = allDescendants.map((t) => t.end);
  const start = new Date(Math.min(...starts.map((d) => d.getTime())));
  const end = new Date(Math.max(...ends.map((d) => d.getTime())));
  const duration = directChildren.reduce(
    (sum, child) => sum + (child.type === 'Milestone' ? 0 : child.duration),
    0,
  );
  return {
    start,
    end,
    duration: Math.max(1, duration || countWorkingDaysInclusive(start, end)),
  };
}

// Leaf schedule (dependency chain: 2 → 3 → 5 → 6 → 7 → 8)
const reqStart = date(2026, 1, 6);
const reqDuration = 5;
const reqEnd = taskEndDate(reqStart, reqDuration);

const designStart = fsSuccessorStart(reqEnd);
const designEnd = designStart;

const backendStart = fsSuccessorStart(designEnd);
const backendDuration = 9;
const backendEnd = taskEndDate(backendStart, backendDuration);

const frontendStart = fsSuccessorStart(backendEnd);
const frontendDuration = 11;
const frontendEnd = taskEndDate(frontendStart, frontendDuration);

const integrationStart = fsSuccessorStart(frontendEnd);
const integrationDuration = 5;
const integrationEnd = taskEndDate(integrationStart, integrationDuration);

const completeStart = fsSuccessorStart(integrationEnd);
const completeEnd = completeStart;

const kickoffChildren = [
  { start: reqStart, end: reqEnd, duration: reqDuration, type: 'Normal' },
  { start: designStart, end: designEnd, duration: 0, type: 'Milestone' },
];
const kickoffRollup = rollupSummary(kickoffChildren, kickoffChildren);

const devChildren = [
  { start: backendStart, end: backendEnd, duration: backendDuration, type: 'Normal' },
  { start: frontendStart, end: frontendEnd, duration: frontendDuration, type: 'Normal' },
  { start: integrationStart, end: integrationEnd, duration: integrationDuration, type: 'Normal' },
];
const devRollup = rollupSummary(devChildren, devChildren);

const tasks = [
  {
    id: 1,
    name: indent(0, 'Project Kickoff'),
    type: 'Summary',
    start: kickoffRollup.start,
    end: kickoffRollup.end,
    duration: kickoffRollup.duration,
    progress: 0.35,
    assignee: 'PM Team',
    deliverable: 'Project charter',
    notes: 'Top-level summary task (dates/duration roll up from subtasks)',
  },
  {
    id: 2,
    name: indent(1, 'Requirements gathering'),
    type: 'Normal',
    start: reqStart,
    end: reqEnd,
    duration: reqDuration,
    progress: 1,
    assignee: 'Analyst',
    deliverable: 'Requirements document',
    notes: '',
  },
  {
    id: 3,
    name: indent(1, 'Design review'),
    type: 'Milestone',
    start: designStart,
    end: designEnd,
    duration: 0,
    progress: 0,
    assignee: '',
    deliverable: '',
    notes: 'Zero-duration milestone',
  },
  {
    id: 4,
    name: indent(0, 'Development Phase'),
    type: 'Summary',
    start: devRollup.start,
    end: devRollup.end,
    duration: devRollup.duration,
    progress: 0.25,
    assignee: 'Dev Team',
    deliverable: '',
    notes: '',
  },
  {
    id: 5,
    name: indent(1, 'Backend API'),
    type: 'Normal',
    start: backendStart,
    end: backendEnd,
    duration: backendDuration,
    progress: 0.4,
    assignee: 'Backend Dev',
    deliverable: 'REST API v1',
    notes: '',
  },
  {
    id: 6,
    name: indent(1, 'Frontend UI'),
    type: 'Normal',
    start: frontendStart,
    end: frontendEnd,
    duration: frontendDuration,
    progress: 0.2,
    assignee: 'Frontend Dev',
    deliverable: 'Web UI screens',
    notes: 'Starts after Backend API (FS dependency)',
  },
  {
    id: 7,
    name: indent(1, 'Integration testing'),
    type: 'Normal',
    start: integrationStart,
    end: integrationEnd,
    duration: integrationDuration,
    progress: 0,
    assignee: 'QA',
    deliverable: 'Test report',
    notes: '',
  },
  {
    id: 8,
    name: indent(0, 'Project Complete'),
    type: 'Milestone',
    start: completeStart,
    end: completeEnd,
    duration: 0,
    progress: 0,
    assignee: '',
    deliverable: '',
    notes: 'Final milestone',
  },
];

const dependencies = [
  { predecessorId: 2, predecessor: 'Requirements gathering', successorId: 3, successor: 'Design review', type: 'FS', lag: 0 },
  { predecessorId: 3, predecessor: 'Design review', successorId: 5, successor: 'Backend API', type: 'FS', lag: 0 },
  { predecessorId: 5, predecessor: 'Backend API', successorId: 6, successor: 'Frontend UI', type: 'FS', lag: 0 },
  { predecessorId: 6, predecessor: 'Frontend UI', successorId: 7, successor: 'Integration testing', type: 'FS', lag: 0 },
  { predecessorId: 7, predecessor: 'Integration testing', successorId: 8, successor: 'Project Complete', type: 'FS', lag: 0 },
];

const workbook = new ExcelJS.Workbook();
workbook.creator = 'MyProject Web';
workbook.created = new Date();

const taskSheet = workbook.addWorksheet(TASK_SHEET);
const taskHeaders = [
  'ID',
  'Task Name',
  'Type',
  'Start Date',
  'End Date',
  'Duration (Days)',
  'Progress (%)',
  'Assigned To',
  'Deliverable',
  'Task Notes',
];
const headerRow = taskSheet.addRow(taskHeaders);
headerRow.font = { bold: true };
headerRow.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFDCE8FC' },
};

for (const task of tasks) {
  const row = taskSheet.addRow([
    task.id,
    task.name,
    task.type,
    toExcelDate(task.start),
    toExcelDate(task.end),
    task.type === 'Milestone' ? 0 : task.duration,
    task.progress,
    task.assignee,
    task.deliverable,
    task.notes,
  ]);
  row.getCell(4).numFmt = 'yyyy-mm-dd';
  row.getCell(5).numFmt = 'yyyy-mm-dd';
  row.getCell(7).numFmt = '0%';
  if (task.type === 'Summary') {
    row.font = { bold: true };
  }
}

taskSheet.columns = [
  { width: 8 },
  { width: 36 },
  { width: 12 },
  { width: 14 },
  { width: 14 },
  { width: 14 },
  { width: 12 },
  { width: 16 },
  { width: 22 },
  { width: 28 },
];
taskSheet.views = [{ state: 'frozen', ySplit: 1 }];

const depSheet = workbook.addWorksheet(DEP_SHEET);
const depHeaders = ['Predecessor ID', 'Predecessor', 'Successor ID', 'Successor', 'Type', 'Lag (Days)'];
const depHeaderRow = depSheet.addRow(depHeaders);
depHeaderRow.font = { bold: true };
depHeaderRow.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFDCE8FC' },
};

for (const dep of dependencies) {
  depSheet.addRow([
    dep.predecessorId,
    dep.predecessor,
    dep.successorId,
    dep.successor,
    dep.type,
    dep.lag,
  ]);
}

depSheet.columns = [
  { width: 14 },
  { width: 28 },
  { width: 14 },
  { width: 28 },
  { width: 10 },
  { width: 12 },
];
depSheet.views = [{ state: 'frozen', ySplit: 1 }];

mkdirSync(__dirname, { recursive: true });
await workbook.xlsx.writeFile(outPath);

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

console.log(`Created ${outPath}`);
console.log('Schedule summary (Mon–Fri):');
for (const task of tasks) {
  console.log(
    `  [${task.id}] ${task.name.trim()} (${task.type}): ${ymdLocal(task.start)} → ${ymdLocal(task.end)}, ${task.duration}d`,
  );
}
