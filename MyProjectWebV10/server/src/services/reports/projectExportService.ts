import type { Response } from 'express';
import type { ProjectDetailDto } from '../projectService.js';
import { safeExportBasename } from './projectReportContent.js';
import { generateExcelReport } from './excelReport.js';
import { generateMarkdownReport } from './markdownReport.js';
import { generatePdfReport } from './pdfReport.js';
import { generateWordReport } from './wordReport.js';

export type ExportFormat = 'excel' | 'word' | 'markdown' | 'pdf';

const FORMAT_META: Record<
  ExportFormat,
  { ext: string; contentType: string; generate: (project: ProjectDetailDto) => Promise<Buffer | string> }
> = {
  excel: {
    ext: 'xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    generate: generateExcelReport,
  },
  word: {
    ext: 'docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    generate: generateWordReport,
  },
  markdown: {
    ext: 'md',
    contentType: 'text/markdown; charset=utf-8',
    generate: async (project) => Buffer.from(await generateMarkdownReport(project), 'utf-8'),
  },
  pdf: {
    ext: 'pdf',
    contentType: 'application/pdf',
    generate: generatePdfReport,
  },
};

export function isExportFormat(value: string): value is ExportFormat {
  return value in FORMAT_META;
}

export async function sendProjectExport(
  res: Response,
  project: ProjectDetailDto,
  format: ExportFormat,
): Promise<void> {
  const meta = FORMAT_META[format];
  const body = await meta.generate(project);
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const filename = `${safeExportBasename(project.name)}.${meta.ext}`;

  res.setHeader('Content-Type', meta.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}
