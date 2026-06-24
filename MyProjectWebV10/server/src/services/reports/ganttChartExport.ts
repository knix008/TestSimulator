import type ExcelJS from 'exceljs';
import type PDFKit from 'pdfkit';
import sharp from 'sharp';
import type { DependencyDto, ProjectDetailDto, TaskDto } from '../projectService.js';
import { projectEndDate } from './projectReportContent.js';

export const GANTT_EXCEL_FIRST_COL = 12;
export const GANTT_EXCEL_SEP_COL = 11;
export const GANTT_EXCEL_COL_WIDTH = 2.6;
export const MAX_DAILY_COLUMNS = 160;

const DEP_COLOR = '788296';
const DEP_CRITICAL_COLOR = 'D93025';
const SUMMARY_OUTLINE = '30343C';

const LABEL_WIDTH = 180;
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 16;
const CHART_PADDING = 8;

export interface ChartRange {
  chartStart: Date;
  chartEnd: Date;
  useWeekly: boolean;
  timelineUnits: number;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function weekStart(date: Date): Date {
  const d = startOfDay(date);
  return addDays(d, -d.getDay());
}

function countWeeks(chartStart: Date, chartEnd: Date): number {
  let count = 0;
  let cursor = weekStart(chartStart);
  while (cursor <= chartEnd) {
    count++;
    cursor = addDays(cursor, 7);
  }
  return count;
}

export function getChartRange(project: ProjectDetailDto): ChartRange {
  const projectStart = startOfDay(new Date(project.projectStart));
  const end = startOfDay(projectEndDate(project));
  let chartStart = addDays(projectStart, -3);
  let chartEnd = addDays(end, 7);
  if (chartEnd < chartStart) chartEnd = addDays(chartStart, 30);

  const totalDays = Math.round((chartEnd.getTime() - chartStart.getTime()) / 86_400_000) + 1;
  const useWeekly = totalDays > MAX_DAILY_COLUMNS;
  const timelineUnits = useWeekly ? countWeeks(chartStart, chartEnd) : totalDays;

  return { chartStart, chartEnd, useWeekly, timelineUnits };
}

function argbToHex(argb: number | null, fallback: string): string {
  if (argb == null) return fallback.replace('#', '').toUpperCase();
  const hex = (argb >>> 0).toString(16).padStart(8, '0').slice(-6);
  return hex.toUpperCase();
}

export function getTaskBarColors(task: TaskDto): { bar: string; progress: string } {
  if (task.taskType === 'Summary') {
    return {
      bar: argbToHex(task.barColorArgb, 'C4C8D6'),
      progress: argbToHex(task.progressColorArgb, '9EA4B2'),
    };
  }
  if (task.taskType === 'Milestone') {
    return {
      bar: argbToHex(task.barColorArgb, 'FFDC88'),
      progress: argbToHex(task.barColorArgb, 'FFDC88'),
    };
  }
  if (task.isCritical) {
    return {
      bar: argbToHex(task.barColorArgb, 'FFB7B2'),
      progress: argbToHex(task.progressColorArgb, 'FF9A94'),
    };
  }
  return {
    bar: argbToHex(task.barColorArgb, 'A8D0F5'),
    progress: argbToHex(task.progressColorArgb, '7EBDEE'),
  };
}

function taskStartEnd(task: TaskDto): { start: Date; end: Date } {
  const start = startOfDay(new Date(task.startDate));
  const end =
    task.taskType === 'Milestone' ? start : startOfDay(new Date(task.endDate));
  return { start, end };
}

function getDescendantTaskIds(project: ProjectDetailDto, taskId: number): number[] {
  const ids: number[] = [];
  const queue = project.tasks.filter((task) => task.parentId === taskId).map((t) => t.taskId);
  while (queue.length > 0) {
    const id = queue.shift()!;
    ids.push(id);
    for (const child of project.tasks.filter((task) => task.parentId === id)) {
      queue.push(child.taskId);
    }
  }
  return ids;
}

export function effectiveTaskSchedule(
  task: TaskDto,
  project: ProjectDetailDto,
): { start: Date; end: Date } {
  if (task.taskType !== 'Summary') {
    return taskStartEnd(task);
  }

  const descendantIds = getDescendantTaskIds(project, task.taskId);
  if (descendantIds.length === 0) {
    return taskStartEnd(task);
  }

  let minStart: Date | null = null;
  let maxEnd: Date | null = null;
  for (const id of descendantIds) {
    const child = project.tasks.find((entry) => entry.taskId === id);
    if (!child) continue;
    const { start, end } = taskStartEnd(child);
    if (!minStart || start < minStart) minStart = start;
    if (!maxEnd || end > maxEnd) maxEnd = end;
  }

  if (!minStart || !maxEnd) {
    return taskStartEnd(task);
  }
  return { start: minStart, end: maxEnd };
}

function overlapsRangeDates(
  start: Date,
  end: Date,
  taskType: string,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  if (taskType === 'Milestone') {
    return start >= rangeStart && start <= rangeEnd;
  }
  return start <= rangeEnd && end >= rangeStart;
}

function isProgressSegment(task: TaskDto, segmentStart: Date, segmentEnd: Date): boolean {
  if (task.progress <= 0 || task.durationDays <= 0) return false;
  const progressDays = Math.round((task.durationDays * task.progress) / 100);
  if (progressDays <= 0) return false;
  const { start } = taskStartEnd(task);
  const progressEnd = addDays(start, progressDays - 1);
  return segmentStart <= progressEnd && segmentEnd >= start;
}

function darken(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - amount);
  return `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function paintExcelGanttCell(
  cell: ExcelJS.Cell,
  task: TaskDto,
  segmentStart: Date,
  segmentEnd: Date,
  options?: { isBarStart?: boolean; isBarEnd?: boolean },
): void {
  const colors = getTaskBarColors(task);
  if (task.taskType === 'Milestone') {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${colors.bar}` },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: `FF${darken(colors.bar, 40)}` } },
      bottom: { style: 'medium', color: { argb: `FF${darken(colors.bar, 40)}` } },
      left: { style: 'medium', color: { argb: `FF${darken(colors.bar, 40)}` } },
      right: { style: 'medium', color: { argb: `FF${darken(colors.bar, 40)}` } },
    };
    return;
  }

  const inProgress = isProgressSegment(task, segmentStart, segmentEnd);
  const fillColor = inProgress ? colors.progress : colors.bar;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${fillColor}` },
  };
  const borderColor = task.taskType === 'Summary' ? SUMMARY_OUTLINE : darken(fillColor, 30);
  const edgeStyle = task.taskType === 'Summary' ? 'medium' : 'thin';
  cell.border = {
    top: { style: edgeStyle, color: { argb: `FF${borderColor}` } },
    bottom: { style: edgeStyle, color: { argb: `FF${borderColor}` } },
  };

  if (options?.isBarStart) {
    cell.border = {
      ...cell.border,
      left: { style: 'medium', color: { argb: `FF${borderColor}` } },
    };
  }
  if (options?.isBarEnd) {
    cell.border = {
      ...cell.border,
      right: { style: 'medium', color: { argb: `FF${borderColor}` } },
    };
  }
}

export function writeExcelTimelineHeader(
  sheet: ExcelJS.Worksheet,
  range: ChartRange,
  timelineStartCol: number,
): void {
  const today = startOfDay(new Date());
  if (range.useWeekly) {
    let cursor = weekStart(range.chartStart);
    let col = timelineStartCol;
    while (cursor <= range.chartEnd) {
      const cell = sheet.getCell(1, col);
      cell.value = cursor;
      cell.numFmt = 'yyyy-mm-dd';
      cell.font = { size: 8 };
      cell.alignment = { horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
      col++;
      cursor = addDays(cursor, 7);
    }
    return;
  }

  const totalDays = range.timelineUnits;
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(range.chartStart, i);
    const cell = sheet.getCell(1, timelineStartCol + i);
    cell.value = date.getDate();
    cell.font = { size: 8, bold: date.getTime() === today.getTime() };
    cell.alignment = { horizontal: 'center' };
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isToday = date.getTime() === today.getTime();
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isToday ? 'FF202124' : isWeekend ? 'FFF1F5F9' : 'FFF8FAFC' },
    };
    if (isToday) cell.font = { ...cell.font, color: { argb: 'FFFFFFFF' } };
  }
}

export function drawExcelTaskGanttBar(
  sheet: ExcelJS.Worksheet,
  row: number,
  task: TaskDto,
  project: ProjectDetailDto,
  range: ChartRange,
  timelineStartCol: number,
): void {
  const { start, end } = effectiveTaskSchedule(task, project);
  const paintedCols: number[] = [];

  if (range.useWeekly) {
    let cursor = weekStart(range.chartStart);
    let col = timelineStartCol;
    while (cursor <= range.chartEnd) {
      const weekEnd = addDays(cursor, 6);
      if (overlapsRangeDates(start, end, task.taskType, cursor, weekEnd)) {
        paintExcelGanttCell(sheet.getCell(row, col), task, cursor, weekEnd);
        paintedCols.push(col);
      }
      cursor = addDays(cursor, 7);
      col++;
    }
  } else {
    for (let i = 0; i < range.timelineUnits; i++) {
      const date = addDays(range.chartStart, i);
      if (date < start || date > end) continue;
      const col = timelineStartCol + i;
      paintExcelGanttCell(sheet.getCell(row, col), task, date, date);
      paintedCols.push(col);
    }
  }

  if (paintedCols.length === 0) return;
  const firstCol = Math.min(...paintedCols);
  const lastCol = Math.max(...paintedCols);
  for (const col of paintedCols) {
    const segmentStart = range.useWeekly
      ? addDays(range.chartStart, (col - timelineStartCol) * 7)
      : addDays(range.chartStart, col - timelineStartCol);
    const segmentEnd = range.useWeekly ? addDays(segmentStart, 6) : segmentStart;
    paintExcelGanttCell(sheet.getCell(row, col), task, segmentStart, segmentEnd, {
      isBarStart: col === firstCol,
      isBarEnd: col === lastCol,
    });
  }
}

function dateToTimelineCol(
  date: Date,
  range: ChartRange,
  timelineStartCol: number,
): number {
  const day = startOfDay(date);
  if (range.useWeekly) {
    let cursor = weekStart(range.chartStart);
    let col = timelineStartCol;
    while (cursor <= range.chartEnd) {
      const weekEnd = addDays(cursor, 6);
      if (day >= cursor && day <= weekEnd) return col;
      cursor = addDays(cursor, 7);
      col++;
    }
    return col;
  }
  const offset = Math.round(
    (day.getTime() - startOfDay(range.chartStart).getTime()) / 86_400_000,
  );
  return timelineStartCol + Math.max(0, Math.min(offset, range.timelineUnits - 1));
}

function dependencyAnchorDates(
  project: ProjectDetailDto,
  dep: DependencyDto,
): { from: Date; to: Date } | null {
  const pred = project.tasks.find((task) => task.taskId === dep.predecessorId);
  const succ = project.tasks.find((task) => task.taskId === dep.successorId);
  if (!pred || !succ) return null;

  const predSched = effectiveTaskSchedule(pred, project);
  const succSched = effectiveTaskSchedule(succ, project);
  const type = dep.type.toUpperCase();

  switch (type) {
    case 'SS':
      return { from: predSched.start, to: succSched.start };
    case 'FF':
      return { from: predSched.end, to: succSched.end };
    case 'SF':
      return { from: predSched.start, to: succSched.end };
    case 'FS':
    default:
      return { from: predSched.end, to: succSched.start };
  }
}

function isDependencyCritical(project: ProjectDetailDto, dep: DependencyDto): boolean {
  const pred = project.tasks.find((task) => task.taskId === dep.predecessorId);
  const succ = project.tasks.find((task) => task.taskId === dep.successorId);
  return Boolean(pred?.isCritical && succ?.isCritical);
}

function setBorderSide(
  cell: ExcelJS.Cell,
  side: 'top' | 'bottom' | 'left' | 'right',
  style: ExcelJS.BorderStyle,
  colorArgb: string,
): void {
  const border = cell.border ?? {};
  border[side] = { style, color: { argb: `FF${colorArgb}` } };
  cell.border = border;
}

function drawExcelDependencyPath(
  sheet: ExcelJS.Worksheet,
  predRow: number,
  succRow: number,
  fromCol: number,
  toCol: number,
  colorArgb: string,
): void {
  if (fromCol < GANTT_EXCEL_FIRST_COL || toCol < GANTT_EXCEL_FIRST_COL) return;

  const lineStyle: ExcelJS.BorderStyle = 'medium';
  const minRow = Math.min(predRow, succRow);
  const maxRow = Math.max(predRow, succRow);

  let routeCol = fromCol;
  if (fromCol === toCol && predRow !== succRow) {
    routeCol = fromCol + 1;
  } else if (fromCol !== toCol) {
    routeCol = fromCol < toCol ? fromCol + 1 : toCol + 1;
  }

  setBorderSide(sheet.getCell(predRow, fromCol), 'bottom', lineStyle, colorArgb);
  setBorderSide(sheet.getCell(succRow, toCol), 'bottom', lineStyle, colorArgb);

  if (predRow === succRow && fromCol === toCol) return;

  const horizStart1 = Math.min(fromCol, routeCol);
  const horizEnd1 = Math.max(fromCol, routeCol);
  for (let col = horizStart1; col <= horizEnd1; col++) {
    setBorderSide(sheet.getCell(predRow, col), 'bottom', lineStyle, colorArgb);
  }

  for (let row = minRow; row <= maxRow; row++) {
    setBorderSide(sheet.getCell(row, routeCol), 'left', lineStyle, colorArgb);
  }

  const horizStart2 = Math.min(routeCol, toCol);
  const horizEnd2 = Math.max(routeCol, toCol);
  for (let col = horizStart2; col <= horizEnd2; col++) {
    setBorderSide(sheet.getCell(succRow, col), 'bottom', lineStyle, colorArgb);
  }
}

export function drawExcelDependencyConnectors(
  sheet: ExcelJS.Worksheet,
  project: ProjectDetailDto,
  taskRows: Map<number, number>,
  range: ChartRange,
  timelineStartCol: number,
): void {
  for (const dep of project.dependencies) {
    const predRow = taskRows.get(dep.predecessorId);
    const succRow = taskRows.get(dep.successorId);
    if (!predRow || !succRow) continue;

    const anchors = dependencyAnchorDates(project, dep);
    if (!anchors) continue;

    const fromCol = dateToTimelineCol(anchors.from, range, timelineStartCol);
    const toCol = dateToTimelineCol(anchors.to, range, timelineStartCol);
    const color = isDependencyCritical(project, dep) ? DEP_CRITICAL_COLOR : DEP_COLOR;

    drawExcelDependencyPath(sheet, predRow, succRow, fromCol, toCol, color);
  }
}

function isLastChild(tasks: TaskDto[], index: number): boolean {
  const level = tasks[index].indentLevel;
  for (let i = index + 1; i < tasks.length; i++) {
    if (tasks[i].indentLevel <= level) return true;
    if (tasks[i].indentLevel === level) return false;
  }
  return true;
}

function buildHierarchyPrefix(tasks: TaskDto[], index: number): string {
  const level = tasks[index].indentLevel;
  if (level === 0) return '';

  let out = '';
  for (let depth = 0; depth < level; depth++) {
    if (depth < level - 1) {
      let showVertical = false;
      for (let j = index + 1; j < tasks.length; j++) {
        if (tasks[j].indentLevel <= depth) break;
        showVertical = true;
        break;
      }
      out += showVertical ? '│ ' : '  ';
    } else {
      out += isLastChild(tasks, index) ? '└─' : '├─';
    }
  }
  return out;
}

export function drawExcelHierarchyColumn(
  sheet: ExcelJS.Worksheet,
  project: ProjectDetailDto,
  row: number,
): void {
  const taskIndex = row - 2;
  const task = project.tasks[taskIndex];
  if (!task) return;

  const cell = sheet.getCell(row, GANTT_EXCEL_SEP_COL);
  cell.value = buildHierarchyPrefix(project.tasks, taskIndex);
  cell.font = { size: 9, color: { argb: 'FF64748B' } };
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

interface LayoutMetrics {
  labelWidth: number;
  headerHeight: number;
  rowHeight: number;
  unitWidth: number;
  chartWidth: number;
  chartHeight: number;
  range: ChartRange;
}

function getLayoutMetrics(project: ProjectDetailDto): LayoutMetrics {
  const range = getChartRange(project);
  const taskCount = Math.max(1, project.tasks.length);
  const unitWidth = range.useWeekly
    ? 24
    : Math.max(4, Math.min(10, Math.floor((1100 - LABEL_WIDTH) / range.timelineUnits)));
  const chartWidth = LABEL_WIDTH + range.timelineUnits * unitWidth + CHART_PADDING * 2;
  const chartHeight = HEADER_HEIGHT + taskCount * ROW_HEIGHT + CHART_PADDING * 2;
  return {
    labelWidth: LABEL_WIDTH,
    headerHeight: HEADER_HEIGHT,
    rowHeight: ROW_HEIGHT,
    unitWidth,
    chartWidth,
    chartHeight,
    range,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function svgTimelineX(
  date: Date,
  range: ChartRange,
  timelineStartX: number,
  unitWidth: number,
): number {
  const day = startOfDay(date);
  if (range.useWeekly) {
    let cursor = weekStart(range.chartStart);
    let i = 0;
    while (cursor <= range.chartEnd) {
      const weekEnd = addDays(cursor, 6);
      if (day >= cursor && day <= weekEnd) {
        return timelineStartX + i * unitWidth + unitWidth / 2;
      }
      cursor = addDays(cursor, 7);
      i++;
    }
    return timelineStartX;
  }
  const offset = Math.round(
    (day.getTime() - startOfDay(range.chartStart).getTime()) / 86_400_000,
  );
  return timelineStartX + Math.max(0, offset) * unitWidth + unitWidth / 2;
}

function drawSvgDependencyPath(
  parts: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  if (x1 === x2 && y1 === y2) return;

  const route = x1 === x2 ? x1 + 8 : x1 < x2 ? x1 + 8 : x2 + 8;
  const d = `M ${x1} ${y1} H ${route} V ${y2} H ${x2}`;
  parts.push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="square"/>`,
  );
}

function drawSvgTaskBar(
  parts: string[],
  task: TaskDto,
  project: ProjectDetailDto,
  index: number,
  layout: LayoutMetrics,
): void {
  const { range, labelWidth, headerHeight, rowHeight, unitWidth } = layout;
  const rowY = CHART_PADDING + headerHeight + index * rowHeight;
  const prefix = buildHierarchyPrefix(project.tasks, index);
  const name = truncate(`${prefix}${task.name}`, 28);
  parts.push(
    `<rect x="${CHART_PADDING}" y="${rowY}" width="${labelWidth}" height="${rowHeight}" fill="#ffffff" stroke="#e2e8f0"/>`,
  );
  parts.push(
    `<text x="${CHART_PADDING + 6}" y="${rowY + rowHeight / 2 + 4}" font-family="Segoe UI, sans-serif" font-size="9" fill="#1e293b"${task.taskType === 'Summary' ? ' font-weight="700"' : ''}>${escapeXml(name)}</text>`,
  );

  const colors = getTaskBarColors(task);
  const { start, end } = effectiveTaskSchedule(task, project);
  const barTop = rowY + 3;
  const barHeight = rowHeight - 6;
  const timelineStartX = CHART_PADDING + labelWidth;
  const summaryStroke = task.taskType === 'Summary' ? ` stroke="#${SUMMARY_OUTLINE}" stroke-width="1.2"` : ' stroke="#626874" stroke-width="0.5"';

  if (range.useWeekly) {
    let cursor = weekStart(range.chartStart);
    for (let i = 0; i < range.timelineUnits; i++) {
      const weekEnd = addDays(cursor, 6);
      if (overlapsRangeDates(start, end, task.taskType, cursor, weekEnd)) {
        const x = timelineStartX + i * unitWidth + 1;
        const fill = isProgressSegment(task, cursor, weekEnd) ? colors.progress : colors.bar;
        if (task.taskType === 'Milestone') {
          const cx = x + unitWidth / 2;
          const cy = barTop + barHeight / 2;
          parts.push(
            `<polygon points="${cx},${barTop} ${x + unitWidth - 1},${cy} ${cx},${barTop + barHeight} ${x + 1},${cy}" fill="#${fill}" stroke="#626874"/>`,
          );
        } else {
          parts.push(
            `<rect x="${x}" y="${barTop}" width="${unitWidth - 2}" height="${barHeight}" fill="#${fill}"${summaryStroke}/>`,
          );
        }
      }
      cursor = addDays(cursor, 7);
    }
    return;
  }

  const startOffset = Math.round((start.getTime() - range.chartStart.getTime()) / 86_400_000);
  const endOffset = Math.round((end.getTime() - range.chartStart.getTime()) / 86_400_000);
  const barX = timelineStartX + startOffset * unitWidth + 1;
  const barW = Math.max(unitWidth - 2, (endOffset - startOffset + 1) * unitWidth - 2);

  if (task.taskType === 'Milestone') {
    const cx = barX + (unitWidth - 2) / 2;
    const cy = barTop + barHeight / 2;
    parts.push(
      `<polygon points="${cx},${barTop} ${barX + unitWidth - 2},${cy} ${cx},${barTop + barHeight} ${barX},${cy}" fill="#${colors.bar}" stroke="#626874"/>`,
    );
    return;
  }

  parts.push(
    `<rect x="${barX}" y="${barTop}" width="${barW}" height="${barHeight}" fill="#${colors.bar}"${summaryStroke}/>`,
  );

  if (task.progress > 0 && task.durationDays > 0 && task.taskType !== 'Summary') {
    const progressDays = Math.round((task.durationDays * task.progress) / 100);
    const progressW = Math.min(barW, Math.max(0, progressDays * unitWidth - 2));
    if (progressW > 0) {
      parts.push(
        `<rect x="${barX}" y="${barTop}" width="${progressW}" height="${barHeight}" fill="#${colors.progress}"/>`,
      );
    }
  }
}

export function buildGanttChartSvg(project: ProjectDetailDto): string {
  if (project.tasks.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="20" y="40" font-family="Segoe UI, sans-serif" font-size="14" fill="#64748b">No tasks</text></svg>`;
  }

  const layout = getLayoutMetrics(project);
  const { range, labelWidth, headerHeight, rowHeight, unitWidth, chartWidth, chartHeight } =
    layout;
  const today = startOfDay(new Date());
  const parts: string[] = [];
  const timelineStartX = CHART_PADDING + labelWidth;
  const taskCenterY = new Map<number, number>();

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);

  parts.push(
    `<rect x="${CHART_PADDING}" y="${CHART_PADDING}" width="${chartWidth - CHART_PADDING * 2}" height="${headerHeight}" fill="#f8fafc" stroke="#e2e8f0"/>`,
  );

  for (let i = 0; i < range.timelineUnits; i++) {
    const x = timelineStartX + i * unitWidth;
    let label: string;
    let bg = '#f8fafc';
    let fg = '#475569';
    let bold = false;

    if (range.useWeekly) {
      const date = addDays(weekStart(range.chartStart), i * 7);
      label = `${date.getMonth() + 1}/${date.getDate()}`;
    } else {
      const date = addDays(range.chartStart, i);
      label = String(date.getDate());
      if (date.getDay() === 0 || date.getDay() === 6) bg = '#f1f5f9';
      if (date.getTime() === today.getTime()) {
        bg = '#202124';
        fg = '#ffffff';
        bold = true;
      }
    }

    parts.push(
      `<rect x="${x}" y="${CHART_PADDING}" width="${unitWidth}" height="${headerHeight}" fill="${bg}" stroke="#e2e8f0"/>`,
    );
    parts.push(
      `<text x="${x + unitWidth / 2}" y="${CHART_PADDING + headerHeight / 2 + 4}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="9" fill="${fg}"${bold ? ' font-weight="700"' : ''}>${escapeXml(label)}</text>`,
    );
  }

  project.tasks.forEach((task, index) => {
    const rowY = CHART_PADDING + headerHeight + index * rowHeight;
    taskCenterY.set(task.taskId, rowY + rowHeight / 2);
    drawSvgTaskBar(parts, task, project, index, layout);
  });

  for (const dep of project.dependencies) {
    const y1 = taskCenterY.get(dep.predecessorId);
    const y2 = taskCenterY.get(dep.successorId);
    if (y1 == null || y2 == null) continue;

    const anchors = dependencyAnchorDates(project, dep);
    if (!anchors) continue;

    const x1 = svgTimelineX(anchors.from, range, timelineStartX, unitWidth);
    const x2 = svgTimelineX(anchors.to, range, timelineStartX, unitWidth);
    const color = isDependencyCritical(project, dep) ? `#${DEP_CRITICAL_COLOR}` : `#${DEP_COLOR}`;
    drawSvgDependencyPath(parts, x1, y1, x2, y2, color);
  }

  parts.push('</svg>');
  return parts.join('');
}

export async function generateGanttChartPng(project: ProjectDetailDto): Promise<Buffer> {
  const svg = buildGanttChartSvg(project);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export function drawGanttChartOnPdf(
  doc: PDFKit.PDFDocument,
  project: ProjectDetailDto,
  png: Buffer,
): void {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const maxHeight = 420;
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(12).text('Gantt Chart');
  doc.moveDown(0.2);

  if (project.tasks.length === 0) {
    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('No tasks to display.');
    doc.fillColor('#000000');
    return;
  }

  doc.image(png, {
    fit: [pageWidth, maxHeight],
    align: 'center',
  });
  doc.moveDown(0.4);
}
