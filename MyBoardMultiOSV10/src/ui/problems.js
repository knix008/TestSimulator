// The bottom panel's Problems tab: what needs attention on the open board, found from the board data
// (GET /boards/:id/data) plus the app's own state (core connection, errors in Messages).
// findProblems is pure (no DOM, no fetch) so the unit tests can feed it data and a clock.

const DAY = 86_400_000;
export const STALE_DAYS = 14;
export const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

/**
 * @param data   board data ({ columns, issues, backlog, statuses, users }) or null
 * @param opts   { now, coreOk, errors (messages of kind error), staleDays }
 * @returns [{ severity, kind, issueId?, issueKey?, columnId?, params }] — texts come from `problems.<kind>`
 */
export function findProblems(data, { now = Date.now(), coreOk = true, errors = 0, staleDays = STALE_DAYS } = {}) {
  const out = [];
  if (!coreOk) out.push({ severity: 'error', kind: 'core', params: {} });
  if (errors > 0) out.push({ severity: 'error', kind: 'messages', params: { n: errors } });
  if (!data) return sortProblems(out);
  const statuses = Object.fromEntries((data.statuses ?? []).map((s) => [s.id, s]));
  const category = (issue) => statuses[issue.statusId]?.category ?? 'todo';
  const columns = data.columns ?? [];
  const colName = Object.fromEntries(columns.map((c) => [c.id, c.name]));
  // the board's columns
  for (const c of columns) {
    if (c.overMax) out.push({ severity: 'error', kind: 'wipOver', columnId: c.id, params: { column: c.name, n: c.count, max: c.wipMax } });
    else if (c.underMin) out.push({ severity: 'warning', kind: 'wipUnder', columnId: c.id, params: { column: c.name, n: c.count, min: c.wipMin } });
    if (!(c.statusIds ?? []).length) out.push({ severity: 'warning', kind: 'emptyColumn', columnId: c.id, params: { column: c.name } });
  }
  const mapped = new Set(columns.flatMap((c) => c.statusIds ?? []));
  for (const s of data.statuses ?? []) if (!mapped.has(s.id)) out.push({ severity: 'warning', kind: 'unmapped', params: { status: s.name } });
  // the issues on the board (the backlog's too, for dates)
  const today = startOfDay(now);
  const all = [...(data.issues ?? []), ...(data.backlog ?? [])];
  for (const i of all) {
    const done = category(i) === 'done' || Boolean(i.resolvedAt);
    if (done) continue;
    const at = { issueId: i.id, issueKey: i.key };
    const where = colName[i.columnId] ?? statuses[i.statusId]?.name ?? '';
    const p = { key: i.key, summary: i.summary, column: where };
    if (i.dueDate != null && i.dueDate !== '') {
      const due = startOfDay(toMs(i.dueDate));
      if (Number.isFinite(due) && due < today) out.push({ severity: 'error', kind: 'overdue', ...at, params: { ...p, days: Math.round((today - due) / DAY) } });
      else if (due === today) out.push({ severity: 'warning', kind: 'dueToday', ...at, params: p });
    }
    if (i.flagged) out.push({ severity: 'warning', kind: 'flagged', ...at, params: p });
    if (category(i) === 'inprogress') {
      const since = Number(i.statusChangedAt ?? i.updatedAt ?? now);
      const days = Math.floor((now - since) / DAY);
      if (days >= staleDays) out.push({ severity: 'warning', kind: 'stale', ...at, params: { ...p, days } });
      if (!i.assigneeId) out.push({ severity: 'info', kind: 'unassigned', ...at, params: p });
    }
  }
  return sortProblems(out);
}

export function sortProblems(list) {
  return list.sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || String(a.issueKey ?? '').localeCompare(String(b.issueKey ?? ''), undefined, { numeric: true }));
}

export function countBySeverity(list) {
  const n = { error: 0, warning: 0, info: 0 };
  for (const p of list) n[p.severity] += 1;
  return n;
}

function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
function toMs(v) {
  if (typeof v === 'number') return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
  return Date.parse(s);
}
