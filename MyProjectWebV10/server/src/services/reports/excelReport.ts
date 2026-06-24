import ExcelJS from 'exceljs';
import type { ProjectDetailDto } from '../projectService.js';
import type { UpdateScheduleInput } from '../projectService.js';
import {
  drawExcelDependencyConnectors,
  drawExcelHierarchyColumn,
  drawExcelTaskGanttBar,
  GANTT_EXCEL_COL_WIDTH,
  GANTT_EXCEL_FIRST_COL,
  getChartRange,
  writeExcelTimelineHeader,
} from './ganttChartExport.js';
import {
  formatDateYmd,
  overallProgress,
  parseIndentFromName,
  projectEndDate,
  taskIndentLabel,
  taskNameById,
} from './projectReportContent.js';
import { workingDaysBetween } from '../../utils/workingDayCalendar.js';

const TASK_SHEET = 'Task Schedule';
const DEP_SHEET = 'Dependencies';
const SUMMARY_SHEET = 'Summary';

export async function generateExcelReport(project: ProjectDetailDto): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MyProject Web';
  workbook.created = new Date();

  buildSummarySheet(workbook.addWorksheet(SUMMARY_SHEET), project);
  buildTaskScheduleSheet(workbook.addWorksheet(TASK_SHEET), project);
  buildDependenciesSheet(workbook.addWorksheet(DEP_SHEET), project);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildSummarySheet(sheet: ExcelJS.Worksheet, project: ProjectDetailDto): void {
  const progress = overallProgress(project);
  const end = projectEndDate(project);
  const rows: Array<[string, string | number | Date]> = [
    ['Project Name', project.name],
    ['Generated', new Date()],
    ['Project Start', new Date(project.projectStart)],
    ['Project End', end],
    ['Total Tasks', project.tasks.length],
    ['Overall Progress (%)', progress],
    ['Completed Tasks', project.tasks.filter((t) => t.progress >= 100).length],
    ['In-Progress Tasks', project.tasks.filter((t) => t.progress > 0 && t.progress < 100).length],
    ['Not Started Tasks', project.tasks.filter((t) => t.progress === 0).length],
    ['Critical Tasks', project.tasks.filter((t) => t.isCritical).length],
    ['Dependencies', project.dependencies.length],
  ];

  rows.forEach(([label, value], index) => {
    sheet.getCell(index + 1, 1).value = label;
    sheet.getCell(index + 1, 1).font = { bold: true };
    sheet.getCell(index + 1, 2).value = value;
  });

  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 36;
}

function buildTaskScheduleSheet(sheet: ExcelJS.Worksheet, project: ProjectDetailDto): void {
  const chartRange = getChartRange(project);
  const timelineStartCol = GANTT_EXCEL_FIRST_COL;

  const headers = [
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
    'Gantt',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCE8FC' },
  };

  writeExcelTimelineHeader(sheet, chartRange, timelineStartCol);

  let rowIndex = 2;
  const taskRows = new Map<number, number>();
  for (const task of project.tasks) {
    const row = sheet.getRow(rowIndex);
    taskRows.set(task.taskId, rowIndex);
    row.getCell(1).value = task.taskId;
    row.getCell(2).value = `${taskIndentLabel(task.indentLevel)}${task.name}`;
    row.getCell(3).value = task.taskType;
    row.getCell(4).value = new Date(task.startDate);
    row.getCell(5).value = new Date(task.endDate);
    row.getCell(6).value = task.taskType === 'Milestone' ? 0 : task.durationDays;
    row.getCell(7).value = task.progress / 100;
    row.getCell(8).value = task.assignedTo;
    row.getCell(9).value = task.deliverable;
    row.getCell(10).value = task.notes;

    row.getCell(4).numFmt = 'yyyy-mm-dd';
    row.getCell(5).numFmt = 'yyyy-mm-dd';
    row.getCell(7).numFmt = '0.0%';
    row.getCell(10).alignment = { wrapText: true };

    if (task.taskType === 'Summary') {
      row.font = { bold: true };
    }

    drawExcelHierarchyColumn(sheet, project, rowIndex);
    drawExcelTaskGanttBar(sheet, rowIndex, task, project, chartRange, timelineStartCol);
    row.height = 16;
    rowIndex++;
  }

  drawExcelDependencyConnectors(sheet, project, taskRows, chartRange, timelineStartCol);

  sheet.getColumn(11).width = 6;
  for (let col = timelineStartCol; col < timelineStartCol + chartRange.timelineUnits; col++) {
    sheet.getColumn(col).width = GANTT_EXCEL_COL_WIDTH;
  }

  sheet.columns = [
    { width: 8 },
    { width: 36 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 20 },
    { width: 28 },
    { width: 8 },
  ];

  sheet.views = [{ state: 'frozen', xSplit: GANTT_EXCEL_FIRST_COL - 1, ySplit: 1 }];
}

function buildDependenciesSheet(sheet: ExcelJS.Worksheet, project: ProjectDetailDto): void {
  const headers = ['Predecessor ID', 'Predecessor', 'Successor ID', 'Successor', 'Type', 'Lag (Days)'];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCE8FC' },
  };

  for (const dep of project.dependencies) {
    sheet.addRow([
      dep.predecessorId,
      taskNameById(project, dep.predecessorId),
      dep.successorId,
      taskNameById(project, dep.successorId),
      dep.type,
      dep.lagDays,
    ]);
  }

  sheet.columns = [
    { width: 14 },
    { width: 28 },
    { width: 14 },
    { width: 28 },
    { width: 10 },
    { width: 12 },
  ];
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export class ExcelImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExcelImportError';
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return formatDateYmd(value.toISOString());
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
  return String(value).trim();
}

/** Preserves leading spaces used for parent/child hierarchy in Task Name. */
function cellTaskName(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return formatDateYmd(value.toISOString());
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').replace(/\r/g, '');
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').replace(/\r/g, '');
  return String(value).replace(/\r/g, '');
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const n = Number(String(value).replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function cellDate(value: ExcelJS.CellValue): Date | null {
  if (value instanceof Date) return value;
  const text = cellText(value);
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function findSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return (
    workbook.getWorksheet(name) ??
    workbook.worksheets.find((ws) => ws.name.toLowerCase() === name.toLowerCase())
  );
}

function headerIndexMap(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    const key = cellText(cell.value).toLowerCase();
    if (key) map.set(key, col);
  });
  return map;
}

function col(map: Map<string, number>, ...names: string[]): number | undefined {
  for (const name of names) {
    const idx = map.get(name.toLowerCase());
    if (idx != null) return idx;
  }
  return undefined;
}

function inferParentIds(
  tasks: Array<{ taskId: number; indentLevel: number }>,
): Map<number, number> {
  const parentById = new Map<number, number>();
  const stack: number[] = [];

  for (const task of tasks) {
    const level = Math.max(0, task.indentLevel);
    while (stack.length > level) stack.pop();
    parentById.set(task.taskId, level === 0 ? -1 : (stack[level - 1] ?? -1));
    stack[level] = task.taskId;
  }

  return parentById;
}

export async function parseExcelImport(
  buffer: Buffer,
  workingDaysJson?: string,
): Promise<Pick<UpdateScheduleInput, 'tasks' | 'dependencies'>> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings expect legacy Node Buffer; multer provides compatible bytes.
  await workbook.xlsx.load(buffer as never);

  const taskSheet = findSheet(workbook, TASK_SHEET);
  if (!taskSheet) {
    throw new ExcelImportError(
      `"${TASK_SHEET}" 시트를 찾을 수 없습니다. MyProject Excel 내보내기 형식(.xlsx)을 사용하세요.`,
    );
  }

  const headerRow = taskSheet.getRow(1);
  const headers = headerIndexMap(headerRow);
  const nameCol = col(headers, 'task name', 'name', '작업 이름');
  const startCol = col(headers, 'start date', 'start', '시작');
  const endCol = col(headers, 'end date', 'end', '종료');
  const durationCol = col(headers, 'duration (days)', 'duration', 'days', '기간');
  const progressCol = col(headers, 'progress (%)', 'progress', '진행률');
  const typeCol = col(headers, 'type', '유형');
  const idCol = col(headers, 'id');
  const assigneeCol = col(headers, 'assigned to', 'assignee');
  const deliverableCol = col(headers, 'deliverable', '산출물');
  const notesCol = col(headers, 'task notes', 'notes', '메모', '설명');

  if (nameCol == null || startCol == null) {
    throw new ExcelImportError('Task Name과 Start Date 열이 필요합니다.');
  }

  const parsedTasks: Array<{
    taskId: number;
    name: string;
    indentLevel: number;
    taskType: string;
    startDate: Date;
    durationDays: number;
    progress: number;
    assignedTo: string;
    deliverable: string;
    notes: string;
  }> = [];

  let nextAutoId = 1;
  taskSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawName = cellTaskName(row.getCell(nameCol).value);
    if (!rawName.trim()) return;

    const { name, indentLevel } = parseIndentFromName(rawName);
    const startDate = cellDate(row.getCell(startCol).value);
    if (!startDate) return;

    let taskId = idCol != null ? cellNumber(row.getCell(idCol).value) : null;
    if (taskId == null || taskId <= 0) taskId = nextAutoId++;
    else nextAutoId = Math.max(nextAutoId, Math.floor(taskId) + 1);

    let taskType = typeCol != null ? cellText(row.getCell(typeCol).value) : 'Normal';
    if (!['Normal', 'Milestone', 'Summary'].includes(taskType)) {
      taskType = 'Normal';
    }

    let durationDays = durationCol != null ? cellNumber(row.getCell(durationCol).value) : null;
    if (durationCol == null && endCol != null) {
      const endDate = cellDate(row.getCell(endCol).value);
      if (endDate) {
        durationDays = workingDaysBetween(startDate, endDate, workingDaysJson ?? '[]');
      }
    }
    if (taskType === 'Milestone') {
      durationDays = 0;
    } else if (durationDays == null || durationDays < 1) {
      durationDays = 1;
    } else {
      durationDays = Math.round(durationDays);
    }

    let progress = progressCol != null ? cellNumber(row.getCell(progressCol).value) : 0;
    if (progress == null) progress = 0;
    if (progress > 0 && progress <= 1) progress *= 100;
    progress = Math.min(100, Math.max(0, Math.round(progress)));

    parsedTasks.push({
      taskId: Math.floor(taskId),
      name: name.slice(0, 512) || 'New Task',
      indentLevel,
      taskType,
      startDate,
      durationDays,
      progress,
      assignedTo: assigneeCol != null ? cellText(row.getCell(assigneeCol).value).slice(0, 256) : '',
      deliverable:
        deliverableCol != null ? cellText(row.getCell(deliverableCol).value).slice(0, 512) : '',
      notes: notesCol != null ? cellText(row.getCell(notesCol).value).slice(0, 4000) : '',
    });
  });

  if (parsedTasks.length === 0) {
    throw new ExcelImportError('불러올 작업이 없습니다. Task Schedule 시트를 확인하세요.');
  }

  const parentById = inferParentIds(parsedTasks);
  const tasks = parsedTasks.map((task) => ({
    taskId: task.taskId,
    parentId: parentById.get(task.taskId) ?? -1,
    name: task.name,
    startDate: task.startDate.toISOString(),
    durationDays: task.durationDays,
    progress: task.progress,
    taskType: task.taskType,
    indentLevel: task.indentLevel,
    isExpanded: true,
    assignedTo: task.assignedTo,
    notes: task.notes,
    autoSchedule: true,
    deliverable: task.deliverable,
    isCritical: false,
  }));

  const dependencies: NonNullable<UpdateScheduleInput['dependencies']> = [];
  const depSheet = findSheet(workbook, DEP_SHEET);
  if (depSheet) {
    const depHeader = headerIndexMap(depSheet.getRow(1));
    const predIdCol = col(depHeader, 'predecessor id', 'predecessor');
    const succIdCol = col(depHeader, 'successor id', 'successor');
    const typeDepCol = col(depHeader, 'type');
    const lagCol = col(depHeader, 'lag (days)', 'lag');

    if (predIdCol != null && succIdCol != null) {
      const taskIds = new Set(tasks.map((t) => t.taskId));
      depSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const predecessorId = Math.floor(cellNumber(row.getCell(predIdCol).value) ?? 0);
        const successorId = Math.floor(cellNumber(row.getCell(succIdCol).value) ?? 0);
        if (predecessorId <= 0 || successorId <= 0) return;
        if (!taskIds.has(predecessorId) || !taskIds.has(successorId)) return;
        let type = typeDepCol != null ? cellText(row.getCell(typeDepCol).value).toUpperCase() : 'FS';
        if (!['FS', 'FF', 'SS', 'SF'].includes(type)) type = 'FS';
        const lagDays = Math.round(cellNumber(row.getCell(lagCol ?? 0).value) ?? 0);
        dependencies.push({
          predecessorId,
          successorId,
          type,
          lagDays,
          startLineEnd: 'None',
          endLineEnd: 'Arrow',
        });
      });
    }
  }

  return { tasks, dependencies };
}
