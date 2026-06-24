import type { ProjectDetailDto } from '../projectService.js';

export function overallProgress(project: ProjectDetailDto): number {
  if (project.tasks.length === 0) return 0;
  return project.tasks.reduce((sum, t) => sum + t.progress, 0) / project.tasks.length;
}

export function projectEndDate(project: ProjectDetailDto): Date {
  if (project.tasks.length === 0) return new Date(project.projectStart);
  return project.tasks.reduce((max, task) => {
    const end = new Date(task.endDate);
    return end > max ? end : max;
  }, new Date(project.tasks[0].endDate));
}

export function taskIndentLabel(indentLevel: number): string {
  return ' '.repeat(Math.max(0, indentLevel) * 2);
}

export function parseIndentFromName(raw: string): { name: string; indentLevel: number } {
  const match = raw.match(/^(\s*)/);
  const spaces = match?.[1]?.length ?? 0;
  const indentLevel = Math.floor(spaces / 2);
  return { name: raw.trim(), indentLevel };
}

export function escapeMd(text: string | null | undefined): string {
  return (text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\r/g, '');
}

export function safeExportBasename(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return cleaned.slice(0, 80) || 'project';
}

export function formatDateYmd(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function taskNameById(project: ProjectDetailDto, taskId: number): string {
  return project.tasks.find((t) => t.taskId === taskId)?.name ?? `#${taskId}`;
}
