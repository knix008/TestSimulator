// Issues shown inside pages: [[issue:PAY-12]] is one issue; [[issues:PAY | status != done]] is a live list
// from a WQL query. Only issues of projects the reader takes part in are shown.
import { participatesIn } from './permissions.js';
import { runQuery } from './query.js';

export const ISSUE_ONE = /\[\[issue:\s*([A-Za-z][A-Za-z0-9]*-\d+)\s*\]\]/g;
export const ISSUE_LIST = /\[\[issues:([^\]]*)\]\]/g;
const LIST_LIMIT = 50;

function nameOf(item, english) {
  if (!item) return '';
  return (english ? item.en : item.ko) || item.name || item.en || item.ko || item.id || '';
}

/** One issue by key, if the reader may see it: { project, issue } or null. */
export function findIssueByKey(ws, key, userId) {
  const wanted = String(key || '').trim().toUpperCase();
  const projectKey = wanted.split('-')[0];
  const project = (ws.projects || []).find((item) => String(item.key || '').toUpperCase() === projectKey);
  if (!project || !participatesIn(ws, project, userId)) return null;
  const issue = (project.issues || []).find((item) => String(item.key || '').toUpperCase() === wanted);
  return issue ? { project, issue } : null;
}

/**
 * Reads "PAY | status != done" (or just a query, or just a project key). The project defaults to the
 * page's own project; the query may be empty (then every issue of the project).
 */
export function parseListMacro(source, fallbackProjectId = '') {
  const text = String(source || '').trim();
  const bar = text.indexOf('|');
  let key = bar >= 0 ? text.slice(0, bar).trim() : '';
  let query = bar >= 0 ? text.slice(bar + 1).trim() : text;
  if (bar < 0 && /^[A-Za-z][A-Za-z0-9]*$/.test(text)) { key = text; query = ''; }
  return { key, query, fallbackProjectId };
}

/** Runs a list macro for a reader: { project, issues, total, error } (error: 'no-project', 'permission' or 'query'). */
export function runListMacro(ws, source, user, fallbackProjectId = '', now = Date.now()) {
  const { key, query } = parseListMacro(source);
  const project = key
    ? (ws.projects || []).find((item) => String(item.key || '').toUpperCase() === key.toUpperCase())
    : (ws.projects || []).find((item) => item.id === fallbackProjectId);
  if (!project) return { project: null, issues: [], total: 0, error: 'no-project', query };
  if (!participatesIn(ws, project, user?.id)) return { project, issues: [], total: 0, error: 'permission', query };
  const result = runQuery(ws, project, query, { user, now });
  if (result.error) return { project, issues: [], total: 0, error: 'query', query };
  return { project, issues: result.issues.slice(0, LIST_LIMIT), total: result.issues.length, error: '', query };
}

/** The issue facts a page shows: key, summary, status (with its colour and category), type, priority, assignee, due. */
export function issueFacts(ws, project, issue, english = false) {
  const status = (project.statuses || []).find((item) => item.id === issue.statusId);
  const type = (project.issueTypes || []).find((item) => item.id === issue.typeId);
  const priority = (project.priorities || []).find((item) => item.id === issue.priorityId);
  const assignee = (ws.users || []).find((user) => user.id === issue.assigneeId);
  return {
    id: issue.id, key: issue.key, summary: issue.summary || '', projectId: project.id,
    status: nameOf(status, english), statusColor: status?.color || '', done: status?.category === 'done',
    type: nameOf(type, english), priority: nameOf(priority, english), assignee: assignee?.name || '', due: issue.due || '',
  };
}

/** The macros written out as plain Markdown (for exports and printing): a line for one issue, a table for a list. */
export function issueMacrosToMarkdown(ws, body, user, fallbackProjectId = '', english = false) {
  const none = english ? 'Not available' : '볼 수 없음';
  let text = String(body || '').replace(ISSUE_LIST, (_match, source) => {
    const found = runListMacro(ws, source, user, fallbackProjectId);
    if (found.error) return `> ${none}: ${source.trim()}`;
    const head = english ? ['Key', 'Summary', 'Status', 'Assignee'] : ['키', '요약', '상태', '담당'];
    const rows = found.issues.map((issue) => {
      const facts = issueFacts(ws, found.project, issue, english);
      return `| ${facts.key} | ${facts.summary.replace(/\|/g, '/')} | ${facts.status} | ${facts.assignee} |`;
    });
    return [`| ${head.join(' | ')} |`, `|${' --- |'.repeat(head.length)}`, ...rows].join('\n');
  });
  text = text.replace(ISSUE_ONE, (_match, key) => {
    const found = findIssueByKey(ws, key, user?.id);
    if (!found) return `${key} (${none})`;
    const facts = issueFacts(ws, found.project, found.issue, english);
    return `**${facts.key}** ${facts.summary} [${facts.status}]`;
  });
  return text;
}
