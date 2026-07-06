import PDFDocument from 'pdfkit';
import type { ExportProject } from '../exportTypes';
import {
  formatDateYmd,
  overallProgress,
  projectEndDate,
  taskIndentLabel,
  taskNameById,
} from './projectReportContent';

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

export async function generatePdfReport(project: ExportProject): Promise<Buffer> {
  const progress = overallProgress(project);
  const end = projectEndDate(project);
  const generated = new Date();

  return collectPdfBuffer((doc) => {
    doc.font('Helvetica-Bold').fontSize(16).text(project.name);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555555')
      .text(`Generated: ${generated.toISOString().slice(0, 16).replace('T', ' ')}`);
    doc.fillColor('#000000');

    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(12).text('Summary');
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9).text('Project Start: ', { continued: true });
    doc.font('Helvetica').text(formatDateYmd(project.projectStart));
    doc.font('Helvetica-Bold').text('Project End: ', { continued: true });
    doc.font('Helvetica').text(formatDateYmd(end.toISOString()));
    doc.font('Helvetica-Bold').text('Total Tasks: ', { continued: true });
    doc.font('Helvetica').text(String(project.tasks.length));
    doc.font('Helvetica-Bold').text('Overall Progress: ', { continued: true });
    doc.font('Helvetica').text(`${progress.toFixed(1)}%`);

    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(12).text('Task Schedule');
    doc.moveDown(0.3);
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
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(12).text('Dependencies');
      doc.moveDown(0.3);
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
