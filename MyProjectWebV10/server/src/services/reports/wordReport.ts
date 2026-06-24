import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ProjectDetailDto } from '../projectService.js';
import { generateGanttChartPng } from './ganttChartExport.js';
import {
  formatDateYmd,
  overallProgress,
  projectEndDate,
  taskIndentLabel,
  taskNameById,
} from './projectReportContent.js';

function heading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
}

function body(text: string, bold = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold, size: 22, font: 'Calibri' })] ,
    spacing: { after: 80 },
  });
}

function kvTable(rows: Array<[string, string]>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              children: [body(label, true)],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [body(value)],
            }),
          ],
        }),
    ),
  });
}

function dataTable(headers: string[], rows: string[][]): Table {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              shading: { fill: 'DCE8FC' },
              children: [body(h, true)],
            }),
        ),
      }),
      ...rows.map(
        (cells) =>
          new TableRow({
            children: cells.map((c) => new TableCell({ children: [body(c)] })),
          }),
      ),
    ],
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
  });
}

export async function generateWordReport(project: ProjectDetailDto): Promise<Buffer> {
  const progress = overallProgress(project);
  const end = projectEndDate(project);
  const generated = new Date();
  const ganttPng = await generateGanttChartPng(project);

  const summaryRows: Array<[string, string]> = [
    ['Project Start', formatDateYmd(project.projectStart)],
    ['Project End', formatDateYmd(end.toISOString())],
    ['Total Tasks', String(project.tasks.length)],
    ['Overall Progress', `${progress.toFixed(1)}%`],
    ['Completed Tasks', String(project.tasks.filter((t) => t.progress >= 100).length)],
    ['In-Progress Tasks', String(project.tasks.filter((t) => t.progress > 0 && t.progress < 100).length)],
    ['Not Started Tasks', String(project.tasks.filter((t) => t.progress === 0).length)],
    ['Critical Tasks', String(project.tasks.filter((t) => t.isCritical).length)],
    ['Dependencies', String(project.dependencies.length)],
  ];

  const taskHeaders = ['ID', 'Task', 'Type', 'Start', 'End', 'Days', 'Progress', 'Assignee'];
  const taskRows = project.tasks.map((task) => [
    String(task.taskId),
    `${taskIndentLabel(task.indentLevel)}${task.name}`,
    task.taskType,
    formatDateYmd(task.startDate),
    formatDateYmd(task.endDate),
    String(task.durationDays),
    `${Math.round(task.progress)}%`,
    task.assignedTo,
  ]);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: project.name, bold: true, size: 36, font: 'Calibri' })] ,
      alignment: AlignmentType.LEFT,
      spacing: { after: 120 },
    }),
    body(`Generated: ${generated.toISOString().slice(0, 16).replace('T', ' ')}`),
    heading('Summary'),
    kvTable(summaryRows),
    heading('Gantt Chart'),
    new Paragraph({
      children: [
        new ImageRun({
          type: 'png',
          data: ganttPng,
          transformation: { width: 620, height: Math.min(420, 34 + project.tasks.length * 16 + 16) },
        }),
      ],
      spacing: { after: 200 },
    }),
    heading('Task Schedule'),
    dataTable(taskHeaders, taskRows),
  ];

  if (project.dependencies.length > 0) {
    const depHeaders = ['Predecessor', 'Successor', 'Type', 'Lag'];
    const depRows = project.dependencies.map((dep) => [
      taskNameById(project, dep.predecessorId),
      taskNameById(project, dep.successorId),
      dep.type,
      `${dep.lagDays}d`,
    ]);
    children.push(heading('Dependencies'), dataTable(depHeaders, depRows));
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
