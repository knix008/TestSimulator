// Model comparison (baselines, "Compare with file…"): which elements were
// added, removed or changed between an old and a new model, field by field
// (names, documentation, types, multiplicities, owners …), relationships with
// their ends, and diagrams (views added, removed, moved). Elements are matched
// by id. diffTree() turns the result into indented rows (with the unchanged
// owners around the changes) for the compare popup. Pure.
import { CHILD_COLLECTIONS, typeDef, typeLabel } from './meta.js';
import { buildIndex, isDiagram, isRelationship, qualifiedName, refId, walk } from './model.js';

const SKIP = new Set(['_id', '_parent', 'end1', 'end2', 'baselines', ...CHILD_COLLECTIONS]);
export const DIFF_STATUSES = ['added', 'removed', 'changed'];
export const DIFF_CATEGORIES = ['element', 'feature', 'relationship', 'diagram'];

/** JSON with sorted object keys (so key order never counts as a change). */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
const FEATURE_LISTS = ['attributes', 'operations', 'literals', 'columns', 'parameters', 'receptions', 'templateParameters', 'extensionPoints', 'slots', 'tags', 'ownedRules'];
const isEnd =(element, parent) => Boolean(parent && (parent.end1 === element || parent.end2 === element));
/** Own fields of an element, association ends folded in as end1.x / end2.x. */
function ownFields(element) {
  const out = {};
  for (const [key, value] of Object.entries(element)) if (!SKIP.has(key) && value !== undefined) out[key] = value;
  for (const key of ['end1', 'end2']) {
    const end = element[key];
    if (end && typeof end === 'object') for (const [k, v] of Object.entries(end)) if (!SKIP.has(k) && k !== '_type' && v !== undefined) out[`${key}.${k}`] = v;
  }
  return out;
}

function collect(root) {
  const items = new Map();
  walk(root, (element, parent) => {
    if (!element._id || isEnd(element, parent)) return;
    items.set(element._id, { element, parent });
  });
  return items;
}

const categoryOf = (element, parent) => {
  if (isDiagram(element)) return 'diagram';
  if (isRelationship(element)) return 'relationship';
  if (typeDef(element._type)?.feature || FEATURE_LISTS.some((key) => Array.isArray(parent?.[key]) && parent[key].includes(element))) return 'feature';
  return 'element';
};

/** A value as short text; references show the name of what they point to. */
function display(value, index, language) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.map((v) => display(v, index, language)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    if (value.$ref) { const target = index.get(value.$ref); return target ? target.name || `(${typeLabel(target._type, language)})` : `#${value.$ref}`; }
    return stable(value);
  }
  return String(value);
}

const GEOMETRY = ['left', 'top', 'width', 'height', 'points'];
/** Diagram changes: views shown / hidden, moved or resized, restyled. */
function diagramChanges(before, after, oldIndex, newIndex, language) {
  const oldViews = new Map((before.ownedViews ?? []).map((v) => [v._id, v]));
  const newViews = new Map((after.ownedViews ?? []).map((v) => [v._id, v]));
  const label = (view, index) => { const model = index.get(refId(view.model)); return model ? model.name || typeLabel(model._type, language) : typeLabel(String(view._type).replace(/View$/, ''), language); };
  const added = [...newViews.values()].filter((v) => !oldViews.has(v._id)).map((v) => label(v, newIndex));
  const removed = [...oldViews.values()].filter((v) => !newViews.has(v._id)).map((v) => label(v, oldIndex));
  let moved = 0;
  let styled = 0;
  for (const [id, v] of newViews) {
    const o = oldViews.get(id);
    if (!o) continue;
    if (GEOMETRY.some((k) => stable(o[k]) !== stable(v[k]))) moved += 1;
    const rest = (view) => stable(Object.fromEntries(Object.entries(view).filter(([k]) => !GEOMETRY.includes(k) && k !== '_parent')));
    if (rest(o) !== rest(v)) styled += 1;
  }
  const out = [];
  if (added.length) out.push({ field: 'views.added', before: '', after: added.join(', ') });
  if (removed.length) out.push({ field: 'views.removed', before: removed.join(', '), after: '' });
  if (moved) out.push({ field: 'views.moved', before: '', after: String(moved) });
  if (styled) out.push({ field: 'views.styled', before: '', after: String(styled) });
  return out;
}

/**
 * Compares two models (projects, or one package in both): {
 *   items: [{ id, status: 'added'|'removed'|'changed', category, type, name, oldName, renamed, path, ownerId, trail: [{ id, name, type }], changes: [{ field, before, after }] }],
 *   summary: { added, removed, changed, total } }.
 * Items come in model order (new model), removed ones after their old owner's items.
 */
export function compareModels(oldRoot, newRoot, { language = 'en' } = {}) {
  const oldItems = collect(oldRoot);
  const newItems = collect(newRoot);
  const oldIndex = buildIndex(oldRoot);
  const newIndex = buildIndex(newRoot);
  const trailOf = (id, index) => {
    const out = [];
    for (let p = index.parent(id); p; p = index.parent(p._id)) if (p._id) out.unshift({ id: p._id, name: p.name || typeLabel(p._type, language), type: p._type });
    return out;
  };
  const pathOf = (id, index, root) => qualifiedName(root, id, index);
  const items = [];
  const make = (status, element, parent, index, root, changes = [], old = null) => ({
    id: element._id, status, category: categoryOf(element, parent), type: element._type, typeLabel: typeLabel(element._type, language),
    name: element.name ?? '', oldName: old?.name ?? element.name ?? '', renamed: Boolean(old && (old.name ?? '') !== (element.name ?? '')),
    path: pathOf(element._id, index, root), ownerId: parent?._id ?? null, trail: trailOf(element._id, index), changes,
  });
  for (const [id, { element, parent }] of newItems) {
    const before = oldItems.get(id);
    if (!before) { items.push(make('added', element, parent, newIndex, newRoot)); continue; }
    const a = ownFields(before.element);
    const b = ownFields(element);
    const changes = [];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (stable(a[key]) === stable(b[key])) continue;
      changes.push({ field: key, before: display(a[key], oldIndex, language), after: display(b[key], newIndex, language) });
    }
    if ((before.parent?._id ?? null) !== (parent?._id ?? null)) changes.push({ field: 'owner', before: before.parent?.name ?? '', after: parent?.name ?? '' });
    if (isDiagram(element)) changes.push(...diagramChanges(before.element, element, oldIndex, newIndex, language));
    if (changes.length) items.push(make('changed', element, parent, newIndex, newRoot, changes, before.element));
  }
  for (const [id, { element, parent }] of oldItems) if (!newItems.has(id)) items.push(make('removed', element, parent, oldIndex, oldRoot));
  // Children of an added / removed element are listed under it but not counted separately.
  const topLevel = (item) => !item.trail.some((p) => items.some((x) => x.id === p.id && x.status === item.status && item.status !== 'changed'));
  const listed = items.filter(topLevel);
  const summary = { added: 0, removed: 0, changed: 0, total: listed.length };
  for (const item of listed) summary[item.status] += 1;
  return { items: listed, summary };
}

/**
 * Indented rows for display: every item under its owners (owners that did not change appear as context rows, status null).
 * filter: { statuses: [...], categories: [...], text }.
 */
export function diffTree(diff, { statuses = DIFF_STATUSES, categories = DIFF_CATEGORIES, text = '' } = {}) {
  const query = String(text ?? '').trim().toLowerCase();
  const shown = diff.items.filter((item) => statuses.includes(item.status) && categories.includes(item.category)
    && (!query || `${item.name} ${item.oldName} ${item.path} ${item.typeLabel} ${item.changes.map((c) => `${c.field} ${c.before} ${c.after}`).join(' ')}`.toLowerCase().includes(query)));
  const nodes = new Map();
  const roots = [];
  const node = (id, data) => {
    if (!nodes.has(id)) nodes.set(id, { id, data, children: [] });
    const n = nodes.get(id);
    if (data && !n.data?.status) n.data = data;
    return n;
  };
  for (const item of shown) {
    let parent = null;
    for (const step of item.trail.slice(1)) {
      const known = nodes.has(step.id);
      const n = node(step.id, nodes.get(step.id)?.data ?? { id: step.id, name: step.name, type: step.type, status: null });
      if (!known) (parent ? parent.children : roots).push(n);
      parent = n;
    }
    const known = nodes.has(item.id);
    const n = node(item.id, item);
    if (!known) (parent ? parent.children : roots).push(n);
  }
  const rows = [];
  const visit = (n, depth) => { rows.push({ ...n.data, depth }); n.children.forEach((c) => visit(c, depth + 1)); };
  roots.forEach((n) => visit(n, 0));
  return rows;
}
