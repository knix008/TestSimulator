import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { MyProjectFileData } from './projectFileService';
import { createEmptyProjectData } from './projectFileService';
import type { ExportProject } from './exportTypes';
import { formatDateYmd } from './reports/projectReportContent';

const MSPDI_NS = 'http://schemas.microsoft.com/project';

function depTypeToLinkType(type: string): number {
  switch (type) {
    case 'FF':
      return 1;
    case 'SS':
      return 3;
    case 'SF':
      return 0;
    default:
      return 2; // FS
  }
}

function linkTypeToDepType(linkType: number): string {
  switch (linkType) {
    case 0:
      return 'SF';
    case 1:
      return 'FF';
    case 3:
      return 'SS';
    default:
      return 'FS';
  }
}

function durationToDays(duration: string | undefined): number {
  if (!duration) return 1;
  const match = duration.match(/PT(\d+)H/i);
  if (match) {
    const hours = parseInt(match[1], 10);
    return Math.max(1, Math.round(hours / 8));
  }
  const dayMatch = duration.match(/P(\d+)D/i);
  if (dayMatch) return Math.max(1, parseInt(dayMatch[1], 10));
  return 1;
}

function daysToDuration(days: number): string {
  return `PT${Math.max(1, days) * 8}H0M0S`;
}

export function exportProjectToMsXml(project: ExportProject): string {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressEmptyNode: true,
  });

  const start = formatDateYmd(project.projectStart);
  const tasksXml = project.tasks.map((task, index) => ({
    Task: {
      UID: task.taskId,
      ID: index + 1,
      Name: task.name,
      Type: task.taskType === 'Summary' ? 1 : 0,
      IsNull: 0,
      WBS: String(index + 1),
      OutlineNumber: String(index + 1),
      OutlineLevel: task.indentLevel + 1,
      Start: `${formatDateYmd(task.startDate)}T08:00:00`,
      Finish: `${formatDateYmd(task.endDate)}T17:00:00`,
      Duration: daysToDuration(task.durationDays),
      DurationFormat: 7,
      PercentComplete: Math.round(task.progress),
      Milestone: task.taskType === 'Milestone' ? 1 : 0,
      Summary: task.taskType === 'Summary' ? 1 : 0,
      Notes: task.notes || undefined,
    },
  }));

  const linksXml = project.dependencies.map((dep, index) => ({
    PredecessorLink: {
      PredecessorUID: dep.predecessorId,
      SuccessorUID: dep.successorId,
      Type: depTypeToLinkType(dep.type),
      LinkLag: dep.lagDays * 4800,
      LagFormat: 7,
      CrossProject: 0,
      LinkType: depTypeToLinkType(dep.type),
      UID: index + 1,
    },
  }));

  const doc = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    Project: {
      '@_xmlns': MSPDI_NS,
      Name: project.name,
      Title: project.name,
      ScheduleFromStart: 1,
      StartDate: `${start}T08:00:00`,
      FinishDate: `${formatDateYmd(project.tasks[project.tasks.length - 1]?.endDate ?? project.projectStart)}T17:00:00`,
      CalendarUID: 1,
      Tasks: tasksXml,
      ...(linksXml.length > 0 ? { PredecessorLinks: linksXml } : {}),
    },
  };

  return builder.build(doc);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function importMsProjectXml(xmlContent: string, sourcePath: string): MyProjectFileData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  });
  const parsed = parser.parse(xmlContent);
  const projectNode = parsed.Project ?? parsed.project;
  if (!projectNode) {
    throw new Error('Invalid Microsoft Project XML: missing Project element.');
  }

  const projectName =
    (typeof projectNode.Name === 'string' && projectNode.Name.trim()) ||
    (typeof projectNode.Title === 'string' && projectNode.Title.trim()) ||
    sourcePath.replace(/\.[^.\\/]+$/, '').split(/[/\\]/).pop() ||
    'Imported Project';

  const startRaw = projectNode.StartDate ?? projectNode.startDate;
  const projectStart = startRaw ? String(startRaw).slice(0, 10) : formatDateYmd(new Date().toISOString());

  const rawTasks = asArray(projectNode.Tasks?.Task ?? projectNode.Task);
  const tasks: MyProjectFileData['tasks'] = [];
  const uidToId = new Map<number, number>();
  let nextId = 1;

  for (const raw of rawTasks) {
    if (!raw || raw['@_type'] === '1' && raw.IsNull === 1) continue;
    const uid = Number(raw.UID ?? raw.uid ?? nextId);
    const ourId = nextId++;
    uidToId.set(uid, ourId);

    const outlineLevel = Math.max(1, Number(raw.OutlineLevel ?? raw.outlineLevel ?? 1));
    const indentLevel = outlineLevel - 1;
    const isSummary = Number(raw.Summary ?? raw.summary ?? 0) === 1;
    const isMilestone = Number(raw.Milestone ?? raw.milestone ?? 0) === 1;
    const taskType = isMilestone ? 'Milestone' : isSummary ? 'Summary' : 'Normal';
    const durationDays = durationToDays(String(raw.Duration ?? raw.duration ?? ''));
    const startDate = String(raw.Start ?? raw.start ?? projectStart).slice(0, 10);

    tasks.push({
      id: ourId,
      parentId: -1,
      name: String(raw.Name ?? raw.name ?? `Task ${ourId}`),
      startDate: `${startDate}T00:00:00.000Z`,
      durationDays,
      progress: Number(raw.PercentComplete ?? raw.percentComplete ?? 0),
      taskType,
      indentLevel,
      isExpanded: true,
      assignedTo: '',
      notes: String(raw.Notes ?? raw.notes ?? ''),
      autoSchedule: true,
      deliverable: '',
      isCritical: false,
    });
  }

  // Resolve parent from outline levels
  const indentStack: number[] = [];
  for (const task of tasks) {
    while (indentStack.length > task.indentLevel) indentStack.pop();
    task.parentId = task.indentLevel > 0 && indentStack.length > 0 ? indentStack[indentStack.length - 1] : -1;
    if (indentStack.length === task.indentLevel) indentStack.push(task.id);
    else indentStack[task.indentLevel] = task.id;
  }

  const dependencies: MyProjectFileData['dependencies'] = [];
  const links = asArray(
    projectNode.PredecessorLinks?.PredecessorLink ??
      projectNode.PredecessorLink ??
      projectNode.Tasks?.Task?.flatMap?.((t: Record<string, unknown>) => asArray(t.PredecessorLink)) ??
      [],
  );

  for (const link of links) {
    if (!link) continue;
    const predUid = Number(link.PredecessorUID ?? link.predecessorUID);
    const succUid = Number(link.SuccessorUID ?? link.successorUID);
    const predId = uidToId.get(predUid);
    const succId = uidToId.get(succUid);
    if (predId == null || succId == null) continue;
    const linkType = Number(link.Type ?? link.type ?? 2);
    const lagMinutes = Number(link.LinkLag ?? link.linkLag ?? 0);
    dependencies.push({
      predecessorId: predId,
      successorId: succId,
      type: linkTypeToDepType(linkType),
      lagDays: Math.round(lagMinutes / 4800),
    });
  }

  const data = createEmptyProjectData();
  data.projectName = projectName;
  data.projectStart = `${projectStart}T00:00:00.000Z`;
  data.tasks = tasks;
  data.dependencies = dependencies;
  return data;
}

export function exportProjectToMpx(project: ExportProject): string {
  const lines: string[] = [];
  lines.push('MPX', '1.0', 'MyProject', 'ANSI');
  lines.push('10,Standard');
  lines.push(`30,${project.name}`);
  lines.push(`40,${formatDateYmd(project.projectStart)}`);
  lines.push('11,Tasks');
  lines.push('ID,Name,Duration,Start,Finish,Predecessors,Resource Names,Percent Complete,Notes');

  for (const task of project.tasks) {
    const preds = project.dependencies
      .filter((d) => d.successorId === task.taskId)
      .map((d) => `${d.predecessorId}${d.type}`)
      .join(',');
    lines.push(
      [
        task.taskId,
        `"${task.name.replace(/"/g, '""')}"`,
        `${task.durationDays}d`,
        formatDateYmd(task.startDate),
        formatDateYmd(task.endDate),
        preds,
        `"${task.assignedTo.replace(/"/g, '""')}"`,
        Math.round(task.progress),
        `"${(task.notes ?? '').replace(/"/g, '""')}"`,
      ].join(','),
    );
  }

  return lines.join('\r\n');
}
