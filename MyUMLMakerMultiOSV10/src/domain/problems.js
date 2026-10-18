// The Problems panel (bottom of the main window): validation problems turned
// into rows that say where to fix them — the element's qualified path, its
// type, the diagrams that show it and the view to select there — plus the
// panel's filters (severity, current diagram, text) and its sort order
// (errors first, then by path). Pure (no DOM).
import { typeLabel } from './meta.js';
import { allDiagrams, isDiagram, qualifiedName, refId, viewsOf } from './model.js';

export const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
export const PROBLEM_FILTERS = ['all', 'error', 'warning'];

/** The property field to fix for a rule (a double-click on a row goes there); 'name' when there is no better one. */
const PROBLEM_FIELDS = {
  'multiplicity-invalid': 'multiplicity', 'column-type-missing': 'type', 'foreign-key-type-mismatch': 'type', 'foreign-key-no-reference': 'referenceTo',
  'gantt-date-invalid': 'start', 'gantt-period-reversed': 'end', 'gantt-duration-invalid': 'duration', 'requirement-id-duplicate': 'id',
  'lifeline-no-represent': 'represent', 'data-syntax-error': 'text', 'interface-attribute-not-static': 'isStatic', 'abstract-operation-in-concrete-class': 'isAbstract',
};
export const problemField = (rule) => PROBLEM_FIELDS[rule] ?? 'name';

/** model id → [{ diagramId, diagramName, viewId }] for every view of every diagram (one pass). */
export function viewsByModel(project) {
  const map = new Map();
  for (const diagram of allDiagrams(project)) {
    for (const view of viewsOf(diagram)) {
      const id = refId(view.model);
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ diagramId: diagram._id, diagramName: diagram.name ?? '', viewId: view._id });
    }
  }
  return map;
}

/**
 * One row per problem: { key, rule, severity, id, type, name, path, message: { ko, en }, detail: { ko, en },
 * target, diagrams: [{ id, name, viewId }] }. `target` is the element whose views stand for the problem:
 * the element itself, or the nearest owner that is drawn (a column is shown inside its entity's box).
 * A diagram's own problem (an empty diagram) lists that diagram.
 */
export function problemRows(project, problems, { index, views = viewsByModel(project) } = {}) {
  const parent = (id) => index?.parent?.(id) ?? null;
  // Keys stay the same from one check to the next (rule + element, numbered when one element breaks a rule twice).
  const seenKeys = new Map();
  return problems.map((p) => {
    const base = `${p.rule}:${p.id ?? '-'}`;
    const n = seenKeys.get(base) ?? 0;
    seenKeys.set(base, n + 1);
    const element = p.id ? index?.get(p.id) ?? null : null;
    let target = element;
    while (target && !isDiagram(target) && !views.has(target._id) && target._type !== 'Project') target = parent(target._id);
    let diagrams = [];
    if (target && isDiagram(target)) diagrams = [{ id: target._id, name: target.name ?? '', viewId: null }];
    else if (target && views.has(target._id)) {
      const seen = new Set();
      for (const v of views.get(target._id)) if (!seen.has(v.diagramId)) { seen.add(v.diagramId); diagrams.push({ id: v.diagramId, name: v.diagramName, viewId: v.viewId }); }
    }
    return {
      key: n ? `${base}#${n}` : base,
      rule: p.rule,
      severity: p.severity,
      id: p.id ?? null,
      type: element?._type ?? null,
      name: element?.name ?? '',
      path: element ? qualifiedName(project, element._id, index) : '',
      message: p.message,
      detail: p.detail ?? p.message,
      target: target && target._type !== 'Project' ? target._id : null,
      diagrams,
    };
  });
}

/** Errors first, then warnings; within a severity by path, then message. */
export function sortProblems(rows, language = 'en') {
  const text = (r) => r.detail?.[language] ?? r.message?.[language] ?? '';
  return [...rows].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    || (a.path || '￿').localeCompare(b.path || '￿') || text(a).localeCompare(text(b)) || a.key.localeCompare(b.key));
}

/** The rows the panel shows: severity ('all' | 'error' | 'warning'), only those on `diagramId`, a text filter. */
export function filterProblems(rows, { severity = 'all', diagramId = null, query = '', language = 'en' } = {}) {
  const words = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (severity === 'error' && r.severity !== 'error') return false;
    if (severity === 'warning' && r.severity === 'error') return false;
    if (diagramId && !r.diagrams.some((d) => d.id === diagramId)) return false;
    if (!words.length) return true;
    const hay = [r.message?.ko, r.message?.en, r.name, r.path, r.rule, r.type ? typeLabel(r.type, language) : '', ...r.diagrams.map((d) => d.name)].join('\n').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Counts by severity of a list of rows: { error, warning, total }. */
export function countProblems(rows) {
  let error = 0;
  for (const r of rows) if (r.severity === 'error') error += 1;
  return { error, warning: rows.length - error, total: rows.length };
}

/** The rows grouped by severity in display order: [{ severity, rows }] (empty groups left out). */
export function groupProblems(rows, language = 'en') {
  const groups = new Map();
  for (const r of sortProblems(rows, language)) {
    const key = r.severity === 'error' ? 'error' : 'warning';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return ['error', 'warning'].filter((k) => groups.has(k)).map((severity) => ({ severity, rows: groups.get(severity) }));
}

/** Badges for a diagram: view id → { severity (the worst), rows }. */
export function problemsByView(rows, diagramId) {
  const out = new Map();
  if (!diagramId) return out;
  for (const r of rows) {
    for (const d of r.diagrams) {
      if (d.id !== diagramId || !d.viewId) continue;
      const entry = out.get(d.viewId) ?? { severity: 'warning', rows: [] };
      entry.rows.push(r);
      if (r.severity === 'error') entry.severity = 'error';
      out.set(d.viewId, entry);
    }
  }
  return out;
}
