import ExcelJS from 'exceljs';
import type { ExportProject } from '../exportTypes';
import {
  formatDateYmd,
  overallProgress,
  projectEndDate,
  taskIndentLabel,
  taskNameById,
} from './projectReportContent';

export async function generateExcelReport(project: ExportProject): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MyProject';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Summary');
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
    ['Critical Tasks', project.tasks.filter((t) => t.isCritical).length],
    ['Dependencies', project.dependencies.length],
  ];
  rows.forEach(([label, value], index) => {
    summary.getCell(index + 1, 1).value = label;
    summary.getCell(index + 1, 1).font = { bold: true };
    summary.getCell(index + 1, 2).value = value;
  });

  const tasks = workbook.addWorksheet('Task Schedule');
  tasks.addRow(['ID', 'Task', 'Type', 'Start', 'End', 'Days', 'Progress %', 'Assigned To', 'Deliverable', 'Notes']);
  tasks.getRow(1).font = { bold: true };
  for (const task of project.tasks) {
    tasks.addRow([
      task.taskId,
      `${taskIndentLabel(task.indentLevel)}${task.name}`,
      task.taskType,
      formatDateYmd(task.startDate),
      formatDateYmd(task.endDate),
      task.durationDays,
      Math.round(task.progress),
      task.assignedTo,
      task.deliverable,
      task.notes,
    ]);
  }
  tasks.columns.forEach((col) => {
    col.width = 16;
  });

  const deps = workbook.addWorksheet('Dependencies');
  deps.addRow(['Predecessor', 'Successor', 'Type', 'Lag Days']);
  deps.getRow(1).font = { bold: true };
  for (const dep of project.dependencies) {
    deps.addRow([
      taskNameById(project, dep.predecessorId),
      taskNameById(project, dep.successorId),
      dep.type,
      dep.lagDays,
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
