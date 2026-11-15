import { esc, icon, L, nameOf } from './bits.js';

/** Filters for the screen that is open. Each screen keeps its own search and dropdowns. */
export function screenFind(ctx) {
  const row = ctx.ui.screenFind?.[ctx.ui.view] || {};
  return { ...row, q: row.q || '' };
}

export function matchesText(query, ...parts) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return parts.join('\n').toLowerCase().includes(needle);
}

/** Hide a block of HTML when its visible text does not match the search. */
export function keepBlock(query, html) {
  if (!String(query || '').trim()) return html;
  const text = String(html).replace(/<[^>]+>/g, ' ');
  return matchesText(query, text) ? html : '';
}

export function finderBar(ctx, facets = []) {
  const find = screenFind(ctx);
  const selects = facets.map((facet) => {
    const options = [{ id: '', label: facet.all || L('모두', 'All') }, ...(facet.options || [])];
    const html = options.map((option) => `<option value="${esc(option.id)}"${String(find[facet.id] || '') === String(option.id) ? ' selected' : ''}>${esc(option.label)}</option>`).join('');
    return `<label class="finder-facet"><span>${esc(facet.label)}</span><select data-facet="${esc(facet.id)}" title="${esc(facet.label)}">${html}</select></label>`;
  }).join('');
  return `<div class="finder"><label class="quick-search">${icon('search')}<input id="screen-find" value="${esc(find.q)}" placeholder="${esc(L('검색', 'Search'))}"></label>${selects}</div>`;
}

export function issueFacets(ctx, ids = ['type', 'status', 'priority', 'assignee']) {
  const project = ctx.project;
  if (!project) return [];
  const people = (ctx.ws.users || []).filter((user) => user.active !== false).map((user) => ({ id: user.id, label: user.name }));
  const all = {
    type: { id: 'type', label: L('유형', 'Type'), options: (project.issueTypes || []).map((item) => ({ id: item.id, label: nameOf(item) })) },
    status: { id: 'status', label: L('상태', 'Status'), options: (project.statuses || []).map((item) => ({ id: item.id, label: nameOf(item) })) },
    priority: { id: 'priority', label: L('우선순위', 'Priority'), options: (project.priorities || []).map((item) => ({ id: item.id, label: nameOf(item) })) },
    assignee: { id: 'assignee', label: L('담당', 'Assignee'), options: [{ id: '__none__', label: L('없음', 'Unassigned') }, ...people] },
  };
  return ids.map((id) => all[id]).filter(Boolean);
}

export function issueVisible(ctx, issue) {
  if (!issue) return false;
  const find = screenFind(ctx);
  if (!matchesText(find.q, issue.key, issue.summary, issue.description, ...(issue.labels || []))) return false;
  if (find.type && issue.typeId !== find.type) return false;
  if (find.status && issue.statusId !== find.status) return false;
  if (find.priority && issue.priorityId !== find.priority) return false;
  if (find.assignee === '__none__') return !issue.assigneeId;
  if (find.assignee && issue.assigneeId !== find.assignee) return false;
  return true;
}
