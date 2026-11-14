import { getLanguage, nameOf } from '../i18n.js';
import { byId, formatDuration, formatWhen } from './util.js';

function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function labels(ws, project, issue, lang) {
  const type = byId(project.issueTypes, issue.typeId);
  const status = byId(project.statuses, issue.statusId);
  const priority = byId(project.priorities, issue.priorityId);
  const assignee = byId(ws.users, issue.assigneeId);
  const sprint = byId(project.sprints, issue.sprintId);
  return {
    type: nameOf(type),
    status: nameOf(status),
    priority: nameOf(priority),
    assignee: assignee?.name || '',
    sprint: sprint?.name || '',
    lang,
  };
}

export function toMarkdown(ws, project, issues, lang = getLanguage()) {
  const previous = getLanguage();
  if (lang !== previous) {
    /* nameOf follows the active language; callers set it before exporting. */
  }
  const lines = [
    `# ${project.name} (${project.key})`,
    '',
    project.description || '',
    '',
    `| ${lang === 'en' ? 'Key' : '키'} | ${lang === 'en' ? 'Type' : '유형'} | ${lang === 'en' ? 'Summary' : '요약'} | ${lang === 'en' ? 'Status' : '상태'} | ${lang === 'en' ? 'Priority' : '우선순위'} | ${lang === 'en' ? 'Assignee' : '담당'} | ${lang === 'en' ? 'Sprint' : '스프린트'} |`,
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const issue of issues) {
    const row = labels(ws, project, issue, lang);
    lines.push(`| ${cell(issue.key)} | ${cell(row.type)} | ${cell(issue.summary)} | ${cell(row.status)} | ${cell(row.priority)} | ${cell(row.assignee)} | ${cell(row.sprint)} |`);
  }
  lines.push('', `_${issues.length}_`);
  return `${lines.filter((line, index) => index !== 2 || line).join('\n')}\n`;
}

export function toCsv(ws, project, issues, lang = getLanguage()) {
  const headers = lang === 'en'
    ? ['Key', 'Type', 'Summary', 'Status', 'Priority', 'Assignee', 'Reporter', 'Sprint', 'Points', 'Spent', 'Created', 'Updated']
    : ['키', '유형', '요약', '상태', '우선순위', '담당', '보고자', '스프린트', '포인트', '소요', '생성', '수정'];
  const rows = issues.map((issue) => {
    const row = labels(ws, project, issue, lang);
    const reporter = byId(ws.users, issue.reporterId);
    return [
      issue.key, row.type, issue.summary, row.status, row.priority, row.assignee, reporter?.name || '', row.sprint,
      issue.storyPoints ?? '', formatDuration(issue.timeSpent, lang), formatWhen(issue.created, lang), formatWhen(issue.updated, lang),
    ].map(csvCell).join(',');
  });
  return `\uFEFF${headers.join(',')}\n${rows.join('\n')}\n`;
}
