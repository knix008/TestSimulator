import fs from 'node:fs/promises';
import path from 'node:path';
import { createEmptyProjectData, loadProjectFile, type MyProjectFileData } from './projectFileService';
import { importMsProjectXml } from './msProjectService';
import { readMppAsXmlContent } from './reportService';

const IMPORT_EXTENSIONS = new Set(['.myprj', '.xml', '.mpx', '.mpp', '.mpt']);

export function canImportProjectPath(filePath: string): boolean {
  return IMPORT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function loadProjectFromPath(filePath: string): Promise<MyProjectFileData> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.myprj') {
    return loadProjectFile(filePath);
  }
  if (ext === '.xml') {
    const xml = await fs.readFile(filePath, 'utf8');
    return importMsProjectXml(xml, filePath);
  }
  if (ext === '.mpx') {
    const mpx = await fs.readFile(filePath, 'utf8');
    return importMpxContent(mpx, filePath);
  }
  if (ext === '.mpp' || ext === '.mpt') {
    const xml = await readMppAsXmlContent(filePath);
    if (xml) return importMsProjectXml(xml, filePath);
    throw new Error(
      'Cannot open .mpp/.mpt in this build. Save as XML from Microsoft Project, or use .myprj/.xml/.mpx.',
    );
  }
  throw new Error(`Unsupported project file type: ${ext}`);
}

function importMpxContent(content: string, sourcePath: string): MyProjectFileData {
  const lines = content.split(/\r?\n/);
  const taskHeaderIndex = lines.findIndex((line) => line.startsWith('ID,Name'));
  if (taskHeaderIndex < 0) {
    throw new Error('Invalid MPX file: task section not found.');
  }

  const projectName =
    lines.find((line) => line.startsWith('30,'))?.slice(3) ??
    path.basename(sourcePath, path.extname(sourcePath));
  const projectStart =
    lines.find((line) => line.startsWith('40,'))?.slice(3) ?? new Date().toISOString().slice(0, 10);

  const tasks: MyProjectFileData['tasks'] = [];
  const dependencies: MyProjectFileData['dependencies'] = [];

  for (let i = taskHeaderIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('11,')) break;
    const parts = parseCsvLine(line);
    if (parts.length < 4) continue;
    const id = Number(parts[0]);
    if (!Number.isFinite(id)) continue;
    const name = parts[1];
    const durationMatch = parts[2]?.match(/(\d+)/);
    const durationDays = durationMatch ? Math.max(1, Number(durationMatch[1])) : 1;
    const startDate = parts[3];
    const finishDate = parts[4] || startDate;
    const predecessorField = parts[5] ?? '';
    const assignedTo = parts[6] ?? '';
    const progress = Number(parts[7] ?? 0) || 0;
    const notes = parts[8] ?? '';

    tasks.push({
      id,
      parentId: -1,
      name,
      startDate: `${startDate}T00:00:00.000Z`,
      durationDays,
      progress,
      taskType: durationDays <= 0 ? 'Milestone' : 'Normal',
      indentLevel: 0,
      isExpanded: true,
      assignedTo,
      notes,
      autoSchedule: true,
      deliverable: '',
      isCritical: false,
    });

    if (predecessorField.trim()) {
      for (const token of predecessorField.split(',')) {
        const match = token.trim().match(/^(\d+)([A-Z]{2})?$/i);
        if (!match) continue;
        dependencies.push({
          predecessorId: Number(match[1]),
          successorId: id,
          type: (match[2] ?? 'FS').toUpperCase(),
          lagDays: 0,
        });
      }
    }

    void finishDate;
  }

  const data = createEmptyProjectData();
  data.projectName = projectName;
  data.projectStart = `${projectStart}T00:00:00.000Z`;
  data.tasks = tasks;
  data.dependencies = dependencies;
  return data;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
