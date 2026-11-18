// Draws the issue macros of a rendered page: a chip for one issue, a live table for a WQL list.
import { getLanguage } from '../i18n.js';
import { findIssueByKey, issueFacts, runListMacro } from '../domain/issue-macros.js';
import { esc, formatWhen, icon, L, safeColor } from './bits.js';

const unescape = (text) => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function statusBadge(facts) {
  const color = safeColor(facts.statusColor) || '#64748b';
  return `<span class="issue-status${facts.done ? ' done' : ''}" style="--status:${color}">${esc(facts.status)}</span>`;
}

function openAttrs(facts) {
  return `data-action="open-hit" data-kind="issues" data-id="${esc(facts.id)}" data-project="${esc(facts.projectId)}"`;
}

function chip(ctx, key) {
  const found = findIssueByKey(ctx.ws, key, ctx.user?.id);
  if (!found) return `<span class="issue-chip missing" title="${esc(L('없거나 볼 수 없는 이슈', 'Missing, or not visible to you'))}">${icon('issues')}${esc(key)}</span>`;
  const facts = issueFacts(ctx.ws, found.project, found.issue, getLanguage() === 'en');
  return `<button type="button" class="issue-chip${facts.done ? ' done' : ''}" ${openAttrs(facts)} title="${esc(`${facts.key} ${facts.summary}`)}">${icon('issues')}<b>${esc(facts.key)}</b><span class="issue-chip-summary">${esc(facts.summary)}</span>${statusBadge(facts)}</button>`;
}

function table(ctx, source, page) {
  const fallback = (ctx.ws.spaces || []).find((space) => space.id === page?.spaceId)?.projectId || ctx.project?.id || '';
  const found = runListMacro(ctx.ws, source, ctx.user, fallback, ctx.now);
  const title = `<header>${icon('issues')}<b>${esc(found.project ? `${found.project.key} · ${found.project.name}` : L('이슈 목록', 'Issue list'))}</b>${found.query ? `<code>${esc(found.query)}</code>` : ''}<span class="grow"></span>${found.error ? '' : `<small>${esc(L(`${found.total}개`, `${found.total} issues`))}</small>`}</header>`;
  if (found.error) {
    const why = { 'no-project': L('과제를 찾을 수 없습니다. [[issues:키 | 질의]] 처럼 과제 키를 적으세요.', 'No project found. Write a project key, as in [[issues:KEY | query]].'), permission: L('이 과제를 볼 권한이 없습니다.', 'You do not take part in this project.'), query: L('질의 문법을 확인하세요.', 'Check the query syntax.') }[found.error];
    return `<div class="issue-macro error">${title}<p class="muted">${esc(why)}</p></div>`;
  }
  const english = getLanguage() === 'en';
  const rows = found.issues.map((issue) => {
    const facts = issueFacts(ctx.ws, found.project, issue, english);
    return `<tr><td><button type="button" class="key" ${openAttrs(facts)}>${esc(facts.key)}</button></td><td>${esc(facts.summary)}</td><td>${esc(facts.type)}</td><td>${statusBadge(facts)}</td><td>${esc(facts.priority)}</td><td>${esc(facts.assignee)}</td><td>${esc(facts.due ? formatWhen(facts.due) : '')}</td></tr>`;
  }).join('');
  const head = [L('키', 'Key'), L('요약', 'Summary'), L('유형', 'Type'), L('상태', 'Status'), L('우선순위', 'Priority'), L('담당', 'Assignee'), L('기한', 'Due')].map((name) => `<th>${esc(name)}</th>`).join('');
  const more = found.total > found.issues.length ? `<p class="muted">${esc(L(`${found.issues.length}개까지 보여 줍니다.`, `Showing the first ${found.issues.length}.`))}</p>` : '';
  return `<div class="issue-macro">${title}${rows ? `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">${esc(L('맞는 이슈가 없습니다.', 'No issue matches.'))}</p>`}${more}</div>`;
}

/** Replaces the macros in a page's rendered HTML with live issue chips and tables. */
export function expandIssueMacros(html, ctx, page) {
  let out = String(html);
  if (!out.includes('[[issue')) return out;
  out = out.replace(/<p>\s*\[\[issues:([^\]]*)\]\]\s*<\/p>/g, (_match, source) => table(ctx, unescape(source), page));
  out = out.replace(/\[\[issues:([^\]]*)\]\]/g, (_match, source) => table(ctx, unescape(source), page));
  out = out.replace(/\[\[issue:\s*([A-Za-z][A-Za-z0-9]*-\d+)\s*\]\]/g, (_match, key) => chip(ctx, key));
  return out;
}
