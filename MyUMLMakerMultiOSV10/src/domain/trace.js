// Requirements management and traceability (Enterprise Architect style):
// the requirements list (every SysML requirement with its attributes and how
// many elements satisfy, verify or derive it), coverage (which requirements
// nothing satisfies or verifies, duplicate ids), the relationship matrix
// (source elements × target elements, a cell for each pair with the
// relationships between them) and its edits (a cell click creates or deletes a
// relationship), and CSV text of both tables. Pure (no DOM).
import { REQUIREMENT_STATUSES, TYPES, typeDef, typeLabel } from './meta.js';
import {
  buildIndex, createElement, displayName, insertElement, isDiagram, isRelationship, isWithin, nextRequirementId, numberRequirement, qualifiedName,
  relationshipEnds, relationshipOwner, removeElements, setRelationshipEnds, siblingsIn, walk,
} from './model.js';

export { nextRequirementId, numberRequirement };

const REQ = 'SysMLRequirement';
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Relationship types the matrix can show (every directed or two-ended relationship but messages). */
export const RELATION_TYPES = Object.values(TYPES).filter((d) => d.edge && (d.ends === 'directed' || d.ends === 'association') && d.type !== 'UMLMessage').map((d) => d.type);
/** The SysML requirement relationships, in EA's order. */
export const REQUIREMENT_RELATIONS = ['SysMLSatisfy', 'SysMLVerify', 'SysMLDeriveReqt', 'SysMLRefine', 'SysMLTrace', 'SysMLCopy', 'UMLContainment'];
/** Statuses for which a requirement must be satisfied and verified (proposed, rejected and deferred ones need not). */
export const COMMITTED_STATUSES = ['approved', 'implemented', 'verified'];

/** Every requirement of the project (model order). */
export function requirementsOf(project) {
  const out = [];
  walk(project, (e) => { if (e._type === REQ) out.push(e); });
  return out;
}

/**
 * Per requirement: how it is traced. requirement _id → { satisfiedBy, verifiedBy, derivedFrom, derived, refinedBy, tracedBy, copies, children }
 * (lists of element ids; children = sub-requirements by nesting or containment).
 */
export function coverage(project) {
  const index = buildIndex(project);
  const out = new Map();
  const entry = (id) => {
    if (!out.has(id)) out.set(id, { satisfiedBy: [], verifiedBy: [], derivedFrom: [], derived: [], refinedBy: [], tracedBy: [], copies: [], children: [] });
    return out.get(id);
  };
  for (const r of requirementsOf(project)) {
    entry(r._id);
    const parent = index.parent(r._id);
    if (parent?._type === REQ) entry(parent._id).children.push(r._id);
  }
  walk(project, (rel) => {
    if (!isRelationship(rel)) return;
    const [a, b] = relationshipEnds(rel);
    const src = index.get(a);
    const tgt = index.get(b);
    if (!src || !tgt) return;
    const isReq = (e) => e._type === REQ;
    switch (rel._type) {
      case 'SysMLSatisfy': if (isReq(tgt)) entry(b).satisfiedBy.push(a); break;
      case 'SysMLVerify': if (isReq(tgt)) entry(b).verifiedBy.push(a); break;
      case 'SysMLRefine': if (isReq(tgt)) entry(b).refinedBy.push(a); break;
      case 'SysMLTrace': if (isReq(tgt)) entry(b).tracedBy.push(a); if (isReq(src)) entry(a).tracedBy.push(b); break;
      case 'SysMLCopy': if (isReq(tgt)) entry(b).copies.push(a); break;
      case 'SysMLDeriveReqt': if (isReq(src)) entry(a).derivedFrom.push(b); if (isReq(tgt)) entry(b).derived.push(a); break;
      // Containment: the child (source) sits in the parent (target, the ⊕ end).
      case 'UMLContainment': if (isReq(src) && isReq(tgt)) entry(b).children.push(a); break;
      default: break;
    }
  });
  return out;
}

/** A requirement with the attributes the list shows, plus its trace counts. */
export function requirementRows(project, { language = 'en' } = {}) {
  const index = buildIndex(project);
  const cov = coverage(project);
  return requirementsOf(project).map((r) => {
    const c = cov.get(r._id);
    return {
      id: r._id, reqId: String(r.id ?? ''), name: displayName(r, language), text: String(r.text ?? ''),
      kind: r.kind ?? 'functional', status: r.status ?? 'proposed', priority: r.priority ?? 'medium', difficulty: r.difficulty ?? 'medium', stability: r.stability ?? 'medium',
      risk: r.risk ?? '', verifyMethod: r.verifyMethod ?? '', version: r.version ?? '', author: r.author ?? '', phase: r.phase ?? '',
      satisfiedBy: c.satisfiedBy.length, verifiedBy: c.verifiedBy.length, derivedFrom: c.derivedFrom.length, refinedBy: c.refinedBy.length, children: c.children.length,
      path: qualifiedName(project, r._id, index),
    };
  }).sort((a, b) => collator.compare(a.reqId || '￿', b.reqId || '￿') || collator.compare(a.name, b.name));
}

/** Coverage problems: [{ rule, id }] for 'requirement-not-satisfied' | 'requirement-not-verified' | 'requirement-id-duplicate'. */
export function coverageProblems(project) {
  const cov = coverage(project);
  const out = [];
  const seen = new Map();
  for (const r of requirementsOf(project)) {
    const c = cov.get(r._id);
    const committed = COMMITTED_STATUSES.includes(r.status);
    // A composite requirement is covered by its parts.
    const leaf = !c.children.length;
    if (committed && leaf && !c.satisfiedBy.length) out.push({ rule: 'requirement-not-satisfied', id: r._id });
    if (committed && leaf && !c.verifiedBy.length) out.push({ rule: 'requirement-not-verified', id: r._id });
    const key = String(r.id ?? '').trim();
    if (!key) continue;
    if (seen.has(key)) out.push({ rule: 'requirement-id-duplicate', id: r._id, reqId: key, other: seen.get(key) });
    else seen.set(key, r._id);
  }
  return out;
}

/** The setting fields a requirement list cell may change (kept to known values). */
export const EDITABLE_REQUIREMENT_FIELDS = { status: REQUIREMENT_STATUSES, priority: ['high', 'medium', 'low'] };

// ───────────────────────── relationship matrix

/** Elements the matrix can list (not relationships, diagrams, views, ends or the project). */
const listable = (e) => {
  const def = typeDef(e._type);
  return Boolean(def) && !def.edge && !isDiagram(e) && e._type !== 'Project' && !/End$/.test(e._type) && e._type !== 'UMLTag';
};

/** Element types that occur in the project (for the matrix's type choosers), most frequent first. */
export function elementTypesIn(project) {
  const count = new Map();
  walk(project, (e) => { if (listable(e)) count.set(e._type, (count.get(e._type) ?? 0) + 1); });
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([type, n]) => ({ type, count: n }));
}

/** Relationship types that occur in the project, plus the requirement relationships (so a first one can be drawn). */
export function relationTypesIn(project) {
  const count = new Map(REQUIREMENT_RELATIONS.map((t) => [t, 0]));
  walk(project, (e) => { if (isRelationship(e) && RELATION_TYPES.includes(e._type)) count.set(e._type, (count.get(e._type) ?? 0) + 1); });
  return [...count.entries()].map(([type, n]) => ({ type, count: n }));
}

/** Namespaces (packages, models …) a side of the matrix may be limited to. */
export function scopesIn(project) {
  const index = buildIndex(project);
  const out = [];
  walk(project, (e) => { if (e !== project && typeDef(e._type)?.namespace && !typeDef(e._type)?.edge && /Model|Package|Subsystem|Profile|Process/.test(e._type)) out.push({ id: e._id, name: e.name ?? '', path: qualifiedName(project, e._id, index) }); });
  return out;
}

const arrowOf = (dir) => (dir === 'out' ? '→' : dir === 'in' ? '←' : '↔');

/**
 * The relationship matrix. options:
 *   sourceTypes, targetTypes   element types of the rows / columns (empty = every type)
 *   relationTypes              relationship types to show (empty = every type)
 *   sourceScope, targetScope   a namespace id the rows / columns are limited to (null = whole project)
 * Returns { rows, cols, cells, emptyRows, emptyCols, total }: rows/cols [{ id, name, label, type, path, count }],
 * cells { 'rowId|colId': [{ id, type, dir: 'out' (row → column) | 'in' (column → row) | 'both' (undirected) }] }.
 */
export function matrix(project, { sourceTypes = [], targetTypes = [], relationTypes = [], sourceScope = null, targetScope = null, language = 'en' } = {}) {
  const index = buildIndex(project);
  const pick = (types, scope) => {
    const out = [];
    walk(project, (e) => {
      if (!listable(e)) return;
      if (types?.length && !types.includes(e._type)) return;
      if (scope && (e._id === scope || !isWithin(project, e._id, scope, index))) return;
      out.push(e);
    });
    const label = (e) => (e._type === REQ && e.id ? `${e.id} ${displayName(e, language)}` : displayName(e, language) || `(${typeLabel(e._type, language)})`);
    return out.map((e) => ({ id: e._id, name: displayName(e, language), label: label(e), reqId: e._type === REQ ? String(e.id ?? '') : '', type: e._type, path: qualifiedName(project, e._id, index), count: 0 }))
      .sort((a, b) => collator.compare(a.reqId || '￿', b.reqId || '￿') || collator.compare(a.label, b.label));
  };
  const rows = pick(sourceTypes, sourceScope);
  const cols = pick(targetTypes, targetScope);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const colById = new Map(cols.map((c) => [c.id, c]));
  const cells = {};
  const wanted = relationTypes?.length ? new Set(relationTypes) : new Set(RELATION_TYPES);
  let total = 0;
  const put = (rowId, colId, rel, dir) => {
    const key = `${rowId}|${colId}`;
    (cells[key] ??= []).push({ id: rel._id, type: rel._type, dir, arrow: arrowOf(dir) });
    rowById.get(rowId).count += 1;
    colById.get(colId).count += 1;
    total += 1;
  };
  walk(project, (rel) => {
    if (!isRelationship(rel) || !wanted.has(rel._type)) return;
    const [a, b] = relationshipEnds(rel);
    if (!a || !b) return;
    const undirected = typeDef(rel._type)?.ends === 'association';
    if (rowById.has(a) && colById.has(b)) put(a, b, rel, undirected ? 'both' : 'out');
    if (a !== b && rowById.has(b) && colById.has(a)) put(b, a, rel, undirected ? 'both' : 'in');
  });
  return { rows, cols, cells, emptyRows: rows.filter((r) => !r.count).map((r) => r.id), emptyCols: cols.filter((c) => !c.count).map((c) => c.id), total };
}

/** Relationships of `type` from `sourceId` to `targetId` (either way for undirected ones). */
export function relationsBetween(project, sourceId, targetId, type) {
  const out = [];
  const undirected = typeDef(type)?.ends === 'association';
  walk(project, (rel) => {
    if (rel._type !== type) return;
    const [a, b] = relationshipEnds(rel);
    if ((a === sourceId && b === targetId) || (undirected && a === targetId && b === sourceId)) out.push(rel);
  });
  return out;
}

/**
 * A matrix cell click: deletes the relationships of `type` from source to target when there are any,
 * else creates one (in the owner StarUML would use). Returns { action: 'created' | 'removed' | 'none', element?, removed? }.
 */
export function toggleRelation(project, { sourceId, targetId, type, language = 'en' }) {
  const def = typeDef(type);
  const index = buildIndex(project);
  if (!def?.edge || !index.get(sourceId) || !index.get(targetId)) return { action: 'none' };
  const existing = relationsBetween(project, sourceId, targetId, type);
  if (existing.length) return { action: 'removed', removed: removeElements(project, existing.map((r) => r._id)) };
  const owner = relationshipOwner(project, type, sourceId, index);
  const element = createElement(type, {}, { language, siblings: siblingsIn(owner, type) });
  setRelationshipEnds(element, sourceId, targetId);
  insertElement(owner, element);
  return { action: 'created', element };
}

// ───────────────────────── CSV

/** RFC 4180 CSV text (CRLF line ends; fields with commas, quotes or line breaks quoted). */
export function csvText(table) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return `${table.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

const CSV_HEAD = {
  ko: ['ID', '이름', '종류', '상태', '우선순위', '난이도', '안정성', '위험', '검증 방법', '버전', '작성자', '단계', '충족', '검증', '파생 원본', '정제', '본문', '전체 이름'],
  en: ['ID', 'Name', 'Kind', 'Status', 'Priority', 'Difficulty', 'Stability', 'Risk', 'Verification', 'Version', 'Author', 'Phase', 'Satisfied by', 'Verified by', 'Derived from', 'Refined by', 'Text', 'Qualified name'],
};

/** The requirements list as CSV. `label(value)` translates enum values (default: as they are). */
export function requirementsCsv(rows, { language = 'en', label = (v) => v } = {}) {
  const head = CSV_HEAD[language] ?? CSV_HEAD.en;
  return csvText([head, ...rows.map((r) => [r.reqId, r.name, label(r.kind), label(r.status), label(r.priority), label(r.difficulty), label(r.stability), r.risk ? label(r.risk) : '', r.verifyMethod ? label(r.verifyMethod) : '',
    r.version, r.author, r.phase, r.satisfiedBy, r.verifiedBy, r.derivedFrom, r.refinedBy, r.text, r.path])]);
}

/** The matrix as CSV: a header row of column labels, then one row per source with its cells' arrows and the row count. */
export function matrixCsv(m, { language = 'en', typeName = (type) => typeLabel(type, language) } = {}) {
  const total = language === 'ko' ? '합계' : 'Total';
  const cellText = (list) => (list ?? []).map((c) => `${c.arrow} ${typeName(c.type)}`).join('; ');
  return csvText([
    ['', ...m.cols.map((c) => c.label), total],
    ...m.rows.map((r) => [r.label, ...m.cols.map((c) => cellText(m.cells[`${r.id}|${c.id}`])), r.count]),
    [total, ...m.cols.map((c) => c.count), m.total],
  ]);
}

/** The matrix as tab-separated text (for Copy: pastes into a spreadsheet). */
export function matrixTsv(m) {
  const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ');
  return `${[['', ...m.cols.map((c) => c.label)], ...m.rows.map((r) => [r.label, ...m.cols.map((c) => (m.cells[`${r.id}|${c.id}`] ?? []).map((x) => x.arrow).join(''))])]
    .map((row) => row.map(clean).join('\t')).join('\n')}\n`;
}
