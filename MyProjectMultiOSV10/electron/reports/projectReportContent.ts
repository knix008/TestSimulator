import type { ExportProject } from '../exportTypes';

export function overallProgress(project: ExportProject): number {
  if (project.tasks.length === 0) return 0;
  return project.tasks.reduce((sum, t) => sum + t.progress, 0) / project.tasks.length;
}

export function projectEndDate(project: ExportProject): Date {
  if (project.tasks.length === 0) return new Date(project.projectStart);
  return project.tasks.reduce((max, task) => {
    const end = new Date(task.endDate);
    return end > max ? end : max;
  }, new Date(project.tasks[0].endDate));
}

export function taskIndentLabel(indentLevel: number): string {
  return ' '.repeat(Math.max(0, indentLevel) * 2);
}

export function escapeHtml(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

export function taskNameById(project: ExportProject, taskId: number): string {
  return project.tasks.find((t) => t.taskId === taskId)?.name ?? `#${taskId}`;
}

export function taskTypeLabel(taskType: string): string {
  if (taskType === 'Summary') return 'Summary';
  if (taskType === 'Milestone') return 'Milestone';
  return 'Task';
}
