// The main window's side of printing: gathers what the print window (print/popup.js) lays out on pages — the
// project's information, the board (its columns and their issues), the reports (charts drawn in print colours,
// with their summaries) and the issue list. Answers the print window's 'print-content' request.
import { REPORTS } from '../views/reports/defs.js';
import { printPalette } from '../views/reports/charts.js';
import { Lookups } from '../views/backlog/lookups.js';
import { L as reportText } from '../views/reports/texts.js';

/** The reports a print can include (version needs a version; it is left out). */
export const PRINT_REPORTS = ['cfd', 'burndown', 'throughput', 'createdResolved', 'control', 'workload', 'breakdown'];
const RANGE_DAYS = { cfd: 30, burndown: 30, throughput: 84, createdResolved: 30, control: 90 };
const CHART = { width: 760, height: 330 };

const isoDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const list = (x) => [].concat(x?.items ?? x ?? []);
/** A Markdown-ish description as plain text for paper: no ** _ # ` > marks, links as their text, no :icon[] refs. */
const plainText = (md) => String(md).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/:icon\[[^\]]*\]/g, '').replace(/[*_`#>]+/g, '').trim();

/**
 * deps: { api, project(), board(), t, language() }
 * → content { project, board, columns, reports [{ id, title, description, svg, summary, legend }], issues, at }
 */
export async function gatherPrintContent(deps) {
  const { api, t } = deps;
  const project = deps.project();
  const board = deps.board();
  if (!project) return null;
  const lang = deps.language();
  const [full, config, boardData, issues] = await Promise.all([
    api.project(project.id).catch(() => project),
    api.get(`/projects/${encodeURIComponent(project.id)}/config`).catch(() => null),
    board ? api.boardData(board.id).catch(() => null) : null,
    api.issues({ jql: `project = "${project.key}" ORDER BY rank ASC`, limit: 1000 }).catch(() => ({ items: [] })),
  ]);
  const lookups = new Lookups(api);
  if (boardData) lookups.absorb(boardData);
  const users = new Map((boardData?.users ?? []).map((u) => [u.id, u.displayName ?? u.username]));
  const statuses = new Map((config?.statuses ?? boardData?.statuses ?? []).map((s) => [s.id, s]));
  const types = new Map((config?.types ?? boardData?.types ?? []).map((x) => [x.id, x.name]));
  const priorities = new Map((config?.priorities ?? boardData?.priorities ?? []).map((x) => [x.id, x.name]));
  const p = full?.project ?? full ?? project;
  const rows = list(issues).map((i) => ({
    key: i.key, summary: i.summary, type: types.get(i.typeId) ?? '', status: statuses.get(i.statusId)?.name ?? '', category: statuses.get(i.statusId)?.category ?? '',
    priority: priorities.get(i.priorityId) ?? '', assignee: users.get(i.assigneeId) ?? '', points: i.storyPoints ?? '', due: i.dueDate ?? '',
  }));
  const byCategory = rows.reduce((acc, r) => { acc[r.category || 'todo'] = (acc[r.category || 'todo'] ?? 0) + 1; return acc; }, {});
  const info = {
    name: p.name, key: p.key, description: plainText(p.description ?? ''), lead: users.get(p.leadId) ?? '', template: p.template ?? '',
    members: list(config?.members).length || null, types: (config?.types ?? []).map((x) => x.name), statuses: (config?.statuses ?? []).map((s) => ({ name: s.name, category: s.category })),
    components: (config?.components ?? []).map((c) => c.name), versions: (config?.versions ?? []).map((v) => ({ name: v.name, released: Boolean(v.released), releaseDate: v.releaseDate ?? '' })),
    issueCount: rows.length, byCategory, boardName: board?.name ?? '',
  };
  const columns = (boardData?.columns ?? []).map((c) => ({
    name: c.name, wipMax: c.wipMax ?? null, done: Boolean(c.done),
    issues: [...(boardData.issues ?? [])].filter((card) => card.columnId === c.id).map((card) => ({ key: card.key, summary: card.summary, assignee: users.get(card.assigneeId) ?? '', priority: priorities.get(card.priorityId) ?? '', points: card.storyPoints ?? '' })),
  }));
  // reports: each in print colours at a fixed size (the page scales the picture)
  const colors = printPalette();
  const cx = { lookups, L: reportText, lang };
  const scope = board ? { boardId: board.id } : { projectId: project.id };
  const reports = [];
  for (const id of PRINT_REPORTS) {
    const def = REPORTS[id];
    if (!def) continue;
    const q = { ...scope };
    if (RANGE_DAYS[id]) { q.from = isoDay(Date.now() - RANGE_DAYS[id] * 86400000); q.to = isoDay(Date.now()); }
    if (id === 'throughput') q.interval = 'week';
    if (id === 'breakdown') { q.jql = `project = "${project.key}"`; q.field = 'status'; }
    try {
      const data = await def.fetch(api, q);
      const chart = def.draw(data, { chart: id === 'breakdown' ? 'pie' : undefined }, CHART, colors, cx);
      const summary = def.summary?.(data, {}, cx) ?? [];
      reports.push({ id, title: reportText(`r_${id}`), description: reportText(`d_${id}`), svg: chart.svg, legend: chart.legend ?? '', summary: summary.map((x) => ({ label: x.label, value: x.value })), range: q.from ? `${q.from} – ${q.to}` : '' });
    } catch (error) {
      reports.push({ id, title: reportText(`r_${id}`), description: reportText(`d_${id}`), error: String(error?.message ?? error) });
    }
  }
  return { at: Date.now(), lang, project: info, columns, reports, issues: rows, title: t('print.docTitle', { name: p.name }) };
}
