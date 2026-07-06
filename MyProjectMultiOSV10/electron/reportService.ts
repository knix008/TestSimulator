import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ExportProject } from './exportTypes';
import { generateExcelReport } from './reports/excelReport';
import { generateHtmlReport } from './reports/htmlReport';
import { generateMarkdownReport } from './reports/markdownReport';
import { generatePdfReport } from './reports/pdfReport';
import { generateWordReport } from './reports/wordReport';
import { safeExportBasename } from './reports/projectReportContent';
import { exportProjectToMpx, exportProjectToMsXml } from './msProjectService';

export type ReportFormat = 'html' | 'markdown' | 'excel' | 'pdf' | 'word' | 'gantt-png';
export type MsProjectExportFormat = 'xml' | 'mpx';

export async function generateReportBuffer(
  format: ReportFormat,
  project: ExportProject,
  ganttPngBase64?: string,
): Promise<Buffer> {
  switch (format) {
    case 'html':
      return Buffer.from(generateHtmlReport(project), 'utf8');
    case 'markdown':
      return Buffer.from(generateMarkdownReport(project), 'utf8');
    case 'excel':
      return generateExcelReport(project);
    case 'pdf':
      return generatePdfReport(project);
    case 'word':
      return generateWordReport(project);
    case 'gantt-png': {
      if (!ganttPngBase64) throw new Error('Gantt image data is required.');
      const data = ganttPngBase64.replace(/^data:image\/png;base64,/, '');
      return Buffer.from(data, 'base64');
    }
    default:
      throw new Error(`Unsupported report format: ${format as string}`);
  }
}

export function reportExtension(format: ReportFormat): string {
  switch (format) {
    case 'html':
      return 'html';
    case 'markdown':
      return 'md';
    case 'excel':
      return 'xlsx';
    case 'pdf':
      return 'pdf';
    case 'word':
      return 'docx';
    case 'gantt-png':
      return 'png';
    default:
      return 'bin';
  }
}

export function msProjectExtension(format: MsProjectExportFormat): string {
  return format === 'mpx' ? 'mpx' : 'xml';
}

export async function writeMsProjectExport(
  filePath: string,
  format: MsProjectExportFormat,
  project: ExportProject,
): Promise<void> {
  const content = format === 'mpx' ? exportProjectToMpx(project) : exportProjectToMsXml(project);
  await fs.writeFile(filePath, content, 'utf8');
}

export function defaultExportBasename(project: ExportProject): string {
  return safeExportBasename(project.name);
}

async function tryImportMppWithJava(filePath: string): Promise<string> {
  const jarPath = path.join(process.resourcesPath ?? '', 'mpxj', 'mpxj-cli.jar');
  return new Promise((resolve, reject) => {
    const child = spawn('java', ['-jar', jarPath, filePath], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) resolve(stdout);
      else reject(new Error(stderr || 'Failed to read .mpp/.mpt file. Export to XML from Microsoft Project.'));
    });
    child.on('error', () => {
      reject(
        new Error(
          'Cannot read .mpp/.mpt without Java and MPXJ. Save as XML from Microsoft Project, or open .myprj/.xml/.mpx.',
        ),
      );
    });
  });
}

export async function readMppAsXmlContent(filePath: string): Promise<string | null> {
  try {
    return await tryImportMppWithJava(filePath);
  } catch {
    return null;
  }
}
