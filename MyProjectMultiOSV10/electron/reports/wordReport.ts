import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ExportProject } from '../exportTypes';
import {
  formatDateYmd,
  overallProgress,
  projectEndDate,
  taskIndentLabel,
  taskNameById,
} from './projectReportContent';

function heading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
}

function body(text: string, bold = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold, size: 22, font: 'Calibri' })],
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

export async function generateWordReport(project: ExportProject): Promise<Buffer> {
  const progress = overallProgress(project);
  const end = projectEndDate(project);
  const generated = new Date();

  const summaryRows: Array<[string, string]> = [
    ['Project Start', formatDateYmd(project.projectStart)],
    ['Project End', formatDateYmd(end.toISOString())],
    ['Total Tasks', String(project.tasks.length)],
    ['Overall Progress', `${progress.toFixed(1)}%`],
    ['Dependencies', String(project.dependencies.length)],
  ];

  const taskRows = project.tasks.map((task) => [
    String(task.taskId),
    `${taskIndentLabel(task.indentLevel)}${task.name}`,
    formatDateYmd(task.startDate),
    formatDateYmd(task.endDate),
    String(task.durationDays),
    `${Math.round(task.progress)}%`,
    task.assignedTo,
  ]);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: project.name, bold: true, size: 32, font: 'Calibri' })],
      spacing: { after: 120 },
    }),
    body(`Generated: ${generated.toISOString().slice(0, 16).replace('T', ' ')}`),
    heading('Summary'),
    kvTable(summaryRows),
    heading('Task Schedule'),
    dataTable(['ID', 'Task', 'Start', 'End', 'Days', 'Progress', 'Assignee'], taskRows),
  ];

  if (project.dependencies.length > 0) {
    children.push(
      heading('Dependencies'),
      ...project.dependencies.map(
        (dep) =>
          body(
            `${taskNameById(project, dep.predecessorId)} → ${taskNameById(project, dep.successorId)} (${dep.type}, lag ${dep.lagDays}d)`,
          ),
      ),
    );
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
