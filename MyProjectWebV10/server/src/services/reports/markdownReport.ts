import type { ProjectDetailDto } from '../projectService.js';
import { generateGanttChartPng } from './ganttChartExport.js';
import {
  escapeMd,
  formatDateYmd,
  overallProgress,
  projectEndDate,
  taskIndentLabel,
  taskNameById,
} from './projectReportContent.js';

export async function generateMarkdownReport(project: ProjectDetailDto): Promise<string> {
  const lines: string[] = [];
  const generated = new Date();
  const progress = overallProgress(project);
  const end = projectEndDate(project);

  lines.push(`# ${project.name}`, '');
  lines.push(`**Generated:** ${generated.toISOString().slice(0, 16).replace('T', ' ')}  `);
  lines.push(`**Total Tasks:** ${project.tasks.length}  `);
  lines.push(`**Project Start:** ${formatDateYmd(project.projectStart)}  `);
  lines.push(`**Project End:** ${formatDateYmd(end.toISOString())}`);
  lines.push('');
  lines.push(`**Overall Progress:** ${progress.toFixed(1)}%`, '');
  lines.push('## Gantt Chart', '');
  if (project.tasks.length === 0) {
    lines.push('_No tasks to display._', '');
  } else {
    const png = await generateGanttChartPng(project);
    lines.push(`![Gantt Chart](data:image/png;base64,${png.toString('base64')})`, '');
  }
  lines.push('## Task Schedule', '');
  lines.push('| # | Task | Start | End | Days | Progress | Assignee | Deliverable | Notes |');
  lines.push('|---|------|-------|-----|------|----------|----------|-------------|-------|');

  for (const task of project.tasks) {
    const type =
      task.taskType === 'Milestone' ? '🔷' : task.taskType === 'Summary' ? '📁' : '▶';
    lines.push(
      `| ${task.taskId} ` +
        `| ${taskIndentLabel(task.indentLevel)}${type} ${escapeMd(task.name)} ` +
        `| ${formatDateYmd(task.startDate)} ` +
        `| ${formatDateYmd(task.endDate)} ` +
        `| ${task.durationDays} ` +
        `| ${Math.round(task.progress)}% ` +
        `| ${escapeMd(task.assignedTo)} ` +
        `| ${escapeMd(task.deliverable)} ` +
        `| ${escapeMd(task.notes)} |`,
    );
  }

  if (project.dependencies.length > 0) {
    lines.push('', '## Dependencies', '');
    lines.push('| Predecessor | Successor | Type | Lag | Critical |');
    lines.push('|-------------|-----------|------|-----|----------|');
    for (const dep of project.dependencies) {
      const critical =
        project.tasks.find((t) => t.taskId === dep.predecessorId)?.isCritical &&
        project.tasks.find((t) => t.taskId === dep.successorId)?.isCritical;
      lines.push(
        `| ${escapeMd(taskNameById(project, dep.predecessorId))} ` +
          `| ${escapeMd(taskNameById(project, dep.successorId))} ` +
          `| ${dep.type} ` +
          `| ${dep.lagDays}d ` +
          `| ${critical ? 'Yes' : 'No'} |`,
      );
    }
  }

  const criticalTasks = project.tasks.filter((t) => t.isCritical);
  if (criticalTasks.length > 0) {
    lines.push('', '## Critical Path Tasks', '');
    for (const task of criticalTasks) {
      lines.push(
        `- **${task.name}** (${formatDateYmd(task.startDate)} → ${formatDateYmd(task.endDate)})`,
      );
    }
  }

  const completed = project.tasks.filter((t) => t.progress >= 100).length;
  const inProgress = project.tasks.filter((t) => t.progress > 0 && t.progress < 100).length;
  lines.push('', '## Summary', '');
  lines.push(`- Completed: ${completed}`);
  lines.push(`- In Progress: ${inProgress}`);
  lines.push(`- Not Started: ${project.tasks.filter((t) => t.progress === 0).length}`);

  return lines.join('\n');
}
