import type { ExportProject } from '../exportTypes';
import {
  escapeHtml,
  formatDateYmd,
  overallProgress,
  projectEndDate,
  taskIndentLabel,
  taskNameById,
  taskTypeLabel,
} from './projectReportContent';

const CSS = `
body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; color: #222; line-height: 1.4; }
h1 { margin-bottom: 4px; }
h2 { margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
.meta { color: #555; margin-bottom: 16px; }
table { border-collapse: collapse; width: 100%; margin-top: 8px; font-size: 13px; }
th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; vertical-align: top; }
thead th { background: #dce8fc; font-weight: 600; }
.summary th { background: #f5f5f5; width: 220px; }
.summary td { background: #fff; }
.summary-row td { font-weight: 600; }
.critical-row td { color: #c00000; font-weight: 600; }
.notes-cell { max-width: 280px; white-space: pre-wrap; }
.progress { display: inline-block; width: 80px; height: 10px; background: #e8e8e8; border: 1px solid #bbb; vertical-align: middle; }
.progress-bar { height: 100%; background: #4a7fd4; }
.note-card { background: #fffcdc; border: 1.5px solid #727272; border-left: 4px solid #727272; padding: 12px 14px; margin: 12px 0; max-width: 720px; }
.note-title { font-weight: 700; margin-bottom: 4px; }
.note-meta { font-size: 12px; color: #555; margin-bottom: 2px; }
.note-body { white-space: pre-wrap; margin-top: 8px; }
.empty { color: #666; font-style: italic; }
`;

function summaryRow(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

export function generateHtmlReport(project: ExportProject): string {
  const progress = overallProgress(project);
  const end = projectEndDate(project);
  const generated = new Date();
  const lines: string[] = [];

  lines.push('<!DOCTYPE html>', '<html lang="en">', '<head>');
  lines.push('<meta charset="utf-8"/>');
  lines.push(`<title>${escapeHtml(project.name)} — Project Report</title>`);
  lines.push(`<style>${CSS}</style>`, '</head>', '<body>');
  lines.push(`<h1>${escapeHtml(project.name)}</h1>`);
  lines.push(`<p class="meta">Generated: ${formatDateYmd(generated.toISOString())} ${generated.toTimeString().slice(0, 5)}</p>`);

  lines.push('<h2>Summary</h2>', '<table class="summary">');
  lines.push(summaryRow('Project Start', formatDateYmd(project.projectStart)));
  lines.push(summaryRow('Project End', formatDateYmd(end.toISOString())));
  lines.push(summaryRow('Total Tasks', String(project.tasks.length)));
  lines.push(summaryRow('Overall Progress', `${progress.toFixed(1)}%`));
  lines.push(summaryRow('Completed Tasks', String(project.tasks.filter((t) => t.progress >= 100).length)));
  lines.push(summaryRow('In-Progress Tasks', String(project.tasks.filter((t) => t.progress > 0 && t.progress < 100).length)));
  lines.push(summaryRow('Not Started Tasks', String(project.tasks.filter((t) => t.progress === 0).length)));
  lines.push(summaryRow('Critical Tasks', String(project.tasks.filter((t) => t.isCritical).length)));
  lines.push(summaryRow('Dependencies', String(project.dependencies.length)));
  lines.push(summaryRow('Resource Assignments', String(project.assignments.length)));
  lines.push(summaryRow('Notes', String(project.ganttNotes.length)));
  lines.push('</table>');

  lines.push('<h2>Task Schedule</h2>', '<table>', '<thead><tr>');
  for (const header of ['ID', 'Task', 'Type', 'Start', 'End', 'Days', 'Progress', 'Assigned To', 'Deliverable', 'Task Notes']) {
    lines.push(`<th>${header}</th>`);
  }
  lines.push('</tr></thead><tbody>');

  for (const task of project.tasks) {
    const rowClass = [
      task.taskType === 'Summary' ? 'summary-row' : '',
      task.isCritical ? 'critical-row' : '',
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(`<tr class="${rowClass}">`);
    lines.push(`<td>${task.taskId}</td>`);
    lines.push(`<td>${escapeHtml(taskIndentLabel(task.indentLevel) + task.name)}</td>`);
    lines.push(`<td>${taskTypeLabel(task.taskType)}</td>`);
    lines.push(`<td>${formatDateYmd(task.startDate)}</td>`);
    lines.push(`<td>${formatDateYmd(task.endDate)}</td>`);
    lines.push(`<td>${task.durationDays}</td>`);
    lines.push(
      `<td><div class="progress" title="${Math.round(task.progress)}%"><div class="progress-bar" style="width:${Math.round(task.progress)}%"></div></div> ${Math.round(task.progress)}%</td>`,
    );
    lines.push(`<td>${escapeHtml(task.assignedTo)}</td>`);
    lines.push(`<td>${escapeHtml(task.deliverable)}</td>`);
    lines.push(`<td class="notes-cell">${escapeHtml(task.notes)}</td>`);
    lines.push('</tr>');
  }
  lines.push('</tbody></table>');

  lines.push('<h2>Notes</h2>');
  if (project.ganttNotes.length === 0) {
    lines.push('<p class="empty">No notes in this project.</p>');
  } else {
    for (const note of [...project.ganttNotes].sort((a, b) => a.noteId - b.noteId)) {
      const linked = note.taskId >= 0 ? taskNameById(project, note.taskId) : '';
      lines.push('<div class="note-card">');
      lines.push(`<div class="note-title">${escapeHtml(note.title || 'Note')}</div>`);
      if (linked) {
        lines.push(`<div class="note-meta">Linked task: ${escapeHtml(linked)} (ID ${note.taskId})</div>`);
      }
      lines.push(`<div class="note-meta">Anchor date: ${formatDateYmd(note.anchorDate)}</div>`);
      lines.push(`<div class="note-body">${escapeHtml(note.body)}</div>`);
      lines.push('</div>');
    }
  }

  lines.push('<h2>Dependencies</h2>');
  if (project.dependencies.length === 0) {
    lines.push('<p class="empty">No dependencies defined.</p>');
  } else {
    lines.push('<table>', '<thead><tr><th>Predecessor</th><th>Successor</th><th>Type</th><th>Lag (Days)</th><th>Critical Path</th></tr></thead><tbody>');
    for (const dep of project.dependencies) {
      const pred = project.tasks.find((t) => t.taskId === dep.predecessorId);
      const succ = project.tasks.find((t) => t.taskId === dep.successorId);
      if (!pred || !succ) continue;
      const critical = pred.isCritical && succ.isCritical;
      lines.push(`<tr class="${critical ? 'critical-row' : ''}">`);
      lines.push(`<td>${escapeHtml(pred.name)}</td>`);
      lines.push(`<td>${escapeHtml(succ.name)}</td>`);
      lines.push(`<td>${dep.type}</td>`);
      lines.push(`<td>${dep.lagDays}</td>`);
      lines.push(`<td>${critical ? 'Yes' : 'No'}</td>`);
      lines.push('</tr>');
    }
    lines.push('</tbody></table>');
  }

  lines.push('<h2>Resource Allocation</h2>');
  if (project.assignments.length === 0) {
    const fallback = project.tasks.filter((t) => t.assignedTo.trim());
    if (fallback.length === 0) {
      lines.push('<p class="empty">No resource assignments.</p>');
    } else {
      lines.push('<table>', '<thead><tr><th>Task</th><th>Resource</th><th>Allocation</th></tr></thead><tbody>');
      for (const task of fallback) {
        lines.push('<tr>');
        lines.push(`<td>${escapeHtml(task.name)}</td>`);
        lines.push(`<td>${escapeHtml(task.assignedTo)}</td>`);
        lines.push('<td>100%</td>');
        lines.push('</tr>');
      }
      lines.push('</tbody></table>');
    }
  } else {
    lines.push('<table>', '<thead><tr><th>Task</th><th>Resource</th><th>Allocation</th></tr></thead><tbody>');
    for (const assignment of [...project.assignments].sort((a, b) => a.taskId - b.taskId || a.resourceName.localeCompare(b.resourceName))) {
      const task = project.tasks.find((t) => t.taskId === assignment.taskId);
      lines.push('<tr>');
      lines.push(`<td>${escapeHtml(task?.name ?? '')}</td>`);
      lines.push(`<td>${escapeHtml(assignment.resourceName)}</td>`);
      lines.push(`<td>${assignment.allocationPercent}%</td>`);
      lines.push('</tr>');
    }
    lines.push('</tbody></table>');
  }

  lines.push('</body>', '</html>');
  return lines.join('\n');
}
