import PDFDocument from 'pdfkit';
import type { ProjectDetailDto } from '../projectService.js';
import { drawGanttChartOnPdf, generateGanttChartPng } from './ganttChartExport.js';
import {
  formatDateYmd,
  overallProgress,
  projectEndDate,
  taskIndentLabel,
  taskNameById,
} from './projectReportContent.js';

function collectPdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

function writeSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).text(title);
  doc.moveDown(0.3);
}

function writeKeyValue(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc.font('Helvetica-Bold').fontSize(9).text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(value);
}

export async function generatePdfReport(project: ProjectDetailDto): Promise<Buffer> {
  const progress = overallProgress(project);
  const end = projectEndDate(project);
  const generated = new Date();
  const ganttPng = await generateGanttChartPng(project);

  return collectPdfBuffer((doc) => {
    doc.font('Helvetica-Bold').fontSize(16).text(project.name);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555555')
      .text(`Generated: ${generated.toISOString().slice(0, 16).replace('T', ' ')}`);
    doc.fillColor('#000000');

    writeSectionTitle(doc, 'Summary');
    writeKeyValue(doc, 'Project Start', formatDateYmd(project.projectStart));
    writeKeyValue(doc, 'Project End', formatDateYmd(end.toISOString()));
    writeKeyValue(doc, 'Total Tasks', String(project.tasks.length));
    writeKeyValue(doc, 'Overall Progress', `${progress.toFixed(1)}%`);
    writeKeyValue(doc, 'Dependencies', String(project.dependencies.length));

    drawGanttChartOnPdf(doc, project, ganttPng);

    writeSectionTitle(doc, 'Task Schedule');
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('ID  Task                          Start       End         Days  Prog');
    doc.font('Helvetica').fontSize(8);

    for (const task of project.tasks) {
      const name = `${taskIndentLabel(task.indentLevel)}${task.name}`.slice(0, 28);
      const line =
        `${String(task.taskId).padEnd(3)} ` +
        `${name.padEnd(30)} ` +
        `${formatDateYmd(task.startDate).padEnd(11)} ` +
        `${formatDateYmd(task.endDate).padEnd(11)} ` +
        `${String(task.durationDays).padStart(4)} ` +
        `${String(Math.round(task.progress)).padStart(3)}%`;
      doc.text(line);
      if (doc.y > doc.page.height - 60) doc.addPage();
    }

    if (project.dependencies.length > 0) {
      writeSectionTitle(doc, 'Dependencies');
      doc.font('Helvetica').fontSize(9);
      for (const dep of project.dependencies) {
        doc.text(
          `${taskNameById(project, dep.predecessorId)} → ${taskNameById(project, dep.successorId)} (${dep.type}, lag ${dep.lagDays}d)`,
        );
        if (doc.y > doc.page.height - 60) doc.addPage();
      }
    }
  });
}
