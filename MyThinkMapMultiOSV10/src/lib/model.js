// The map document and every edit made to it.
//
// A map is a plain JSON tree (the .tmap file is this object as JSON):
//
//   { format: 'mythinkmap', version, title, root: Topic, floating: [Topic + {x, y}],
//     relationships: [Relationship], layout, style, lineStyle, branchColors,
//     spacing: { h, v }, numbering, background, meta }
//
//   Topic = { id, text, children: [Topic], callouts?: [Topic], collapsed?, notes?,
//             style?: { shape, fill, color, border, borderWidth, fontSize, bold, italic,
//                       underline, strike, font, align, width, line, lineWidth },
//             icons?: [markerId], tags?: [string], task?: { priority, progress, start,
//             due, resources, effort, milestone }, link?: { url, label },
//             attachments?: [{ name, path }], image?: { src, w, h }, boundary?: { shape,
//             color, label }, layout?, side? }
//
// Edits never change an object in place: the topics on the path from the root
// to the edited one are copied and everything else is shared. That makes the
// undo history a list of map objects (cheap — pictures and untouched branches
// are shared) and "dirty" a reference comparison with the saved map.

export const FORMAT = 'mythinkmap';
export const FILE_VERSION = 1;

let seq = 0;
export function uid() {
  seq = (seq + 1) % 1679616;
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${seq.toString(36)}`;
}

export function makeTopic(text = '', extra = {}) {
  return { id: uid(), text, children: [], ...extra };
}

export const LAYOUTS = ['map', 'right', 'left', 'orgDown', 'orgUp', 'treeRight', 'treeLeft', 'timeline', 'fishbone'];
// The layouts a topic can give its own subtopics (map-level ones that need a root are not offered).
export const SUB_LAYOUTS = ['right', 'left', 'down', 'up', 'treeRight', 'treeLeft'];

export function newMap({ title = '', layout = 'map', style = 'auto' } = {}) {
  const now = new Date().toISOString();
  return {
    format: FORMAT,
    version: FILE_VERSION,
    title: '',
    root: makeTopic(title),
    floating: [],
    relationships: [],
    layout: LAYOUTS.includes(layout) ? layout : 'map',
    style,
    lineStyle: '',        // '' = the map style's own
    branchColors: null,   // null = the map style's own
    spacing: { h: 1, v: 1 },
    numbering: { enabled: false, style: 'decimal', depth: 3 },
    background: '',       // '' = the map style's own
    meta: { created: now, modified: now },
  };
}

// ── Index: id → { topic, parent, kind, index, depth, path } (cached per map object) ──

const indexCache = new WeakMap();

export function indexOf(map) {
  let idx = indexCache.get(map);
  if (idx) return idx;
  idx = new Map();
  const walk = (topic, parent, kind, index, depth, path) => {
    idx.set(topic.id, { topic, parent, kind, index, depth, path });
    const p = [...path, topic.id];
    (topic.children || []).forEach((c, i) => walk(c, topic.id, 'child', i, depth + 1, p));
    (topic.callouts || []).forEach((c, i) => walk(c, topic.id, 'callout', i, depth + 1, p));
  };
  walk(map.root, null, 'root', 0, 0, []);
  (map.floating || []).forEach((f, i) => walk(f, null, 'floating', i, 1, []));
  indexCache.set(map, idx);
  return idx;
}

export const findTopic = (map, id) => { const e = indexOf(map).get(id); return e ? e.topic : null; };
export const entryOf = (map, id) => indexOf(map).get(id) || null;
export const parentOf = (map, id) => { const e = indexOf(map).get(id); return e && e.parent ? findTopic(map, e.parent) : null; };
export const isRoot = (map, id) => map.root.id === id;
export const isFloating = (map, id) => { const e = indexOf(map).get(id); return !!e && e.kind === 'floating'; };

// Every topic of the map in reading order (root branch first, then floating topics).
export function allTopics(map, { callouts = true } = {}) {
  const out = [];
  const walk = (t) => { out.push(t); (t.children || []).forEach(walk); if (callouts) (t.callouts || []).forEach(walk); };
  walk(map.root);
  (map.floating || []).forEach(walk);
  return out;
}

export function countTopics(map) { return indexOf(map).size; }

// Is `id` inside the subtree of `ancestor` (or the same topic)?
export function isWithin(map, id, ancestor) {
  const e = indexOf(map).get(id);
  return !!e && (id === ancestor || e.path.includes(ancestor));
}

// ── Path-copying update ──

function touch(map, patch) {
  return { ...map, ...patch, meta: { ...(map.meta || {}), modified: new Date().toISOString() } };
}

// Rebuilds the topics from `id` up to its top (root or floating), `fn(topic) → topic`.
export function updateTopic(map, id, fn) {
  const e = indexOf(map).get(id);
  if (!e) return map;
  const next = typeof fn === 'function' ? fn(e.topic) : { ...e.topic, ...fn };
  if (next === e.topic) return map;
  return replaceAt(map, id, next);
}

function replaceAt(map, id, nextTopic) {
  const idx = indexOf(map);
  let e = idx.get(id);
  let child = nextTopic;
  while (e.parent) {
    const parent = idx.get(e.parent);
    const key = e.kind === 'callout' ? 'callouts' : 'children';
    const list = parent.topic[key].slice();
    list[e.index] = child;
    child = { ...parent.topic, [key]: list };
    e = parent;
  }
  if (e.kind === 'root') return touch(map, { root: child });
  const floating = map.floating.slice();
  floating[e.index] = child;
  return touch(map, { floating });
}

export function updateTopics(map, ids, fn) {
  let out = map;
  for (const id of ids) out = updateTopic(out, id, fn);
  return out;
}

// Shallow style / field patch with `undefined` / '' / null removing the key.
export function patchObject(obj, patch) {
  const out = { ...(obj || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined || v === null || v === '') delete out[k];
    else out[k] = v;
  }
  return out;
}

export function setStyle(map, ids, patch) {
  return updateTopics(map, ids, (t) => {
    const style = patchObject(t.style, patch);
    const next = { ...t, style };
    if (!Object.keys(style).length) delete next.style;
    return next;
  });
}

export function clearStyle(map, ids) {
  return updateTopics(map, ids, (t) => { if (!t.style) return t; const n = { ...t }; delete n.style; return n; });
}

export function setText(map, id, text) { return updateTopic(map, id, (t) => (t.text === text ? t : { ...t, text })); }

export function setField(map, ids, key, value) {
  return updateTopics(map, ids, (t) => {
    const empty = value == null || value === '' || (Array.isArray(value) && !value.length) || (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);
    if (empty) { if (!(key in t)) return t; const n = { ...t }; delete n[key]; return n; }
    return { ...t, [key]: value };
  });
}

export function setTask(map, ids, patch) {
  return updateTopics(map, ids, (t) => {
    const task = patchObject(t.task, patch);
    const n = { ...t, task };
    if (!Object.keys(task).length) delete n.task;
    return n;
  });
}

// ── Structure ──

function insertInto(map, parentId, key, topic, index) {
  return updateTopic(map, parentId, (p) => {
    const list = (p[key] || []).slice();
    const at = index == null || index < 0 || index > list.length ? list.length : index;
    list.splice(at, 0, topic);
    return { ...p, [key]: list, collapsed: key === 'children' ? false : p.collapsed };
  });
}

export function addChild(map, parentId, topic = makeTopic(''), index) {
  return { map: insertInto(map, parentId, 'children', topic, index), id: topic.id };
}

export function addCallout(map, parentId, topic = makeTopic('')) {
  return { map: insertInto(map, parentId, 'callouts', topic), id: topic.id };
}

// A sibling after (or before) `id`. On the root this adds a main topic; on a
// floating topic, another floating topic beside it.
export function addSibling(map, id, topic = makeTopic(''), { before = false } = {}) {
  const e = entryOf(map, id);
  if (!e) return { map, id: null };
  if (e.kind === 'root') return addChild(map, id, topic);
  if (e.kind === 'floating') {
    const src = map.floating[e.index];
    const f = { ...topic, x: src.x, y: (src.y || 0) + (before ? -70 : 70) };
    const floating = map.floating.slice();
    floating.splice(before ? e.index : e.index + 1, 0, f);
    return { map: touch(map, { floating }), id: f.id };
  }
  const key = e.kind === 'callout' ? 'callouts' : 'children';
  const parent = findTopic(map, e.parent);
  const sib = parent[key][e.index];
  if (key === 'children' && sib && sib.side && !topic.side) topic = { ...topic, side: sib.side };
  return { map: insertInto(map, e.parent, key, topic, before ? e.index : e.index + 1), id: topic.id };
}

export function addFloating(map, topic = makeTopic(''), x = 0, y = 0) {
  return { map: touch(map, { floating: [...(map.floating || []), { ...topic, x, y }] }), id: topic.id };
}

// Removes topics (and their subtrees). The root stays; relationships that
// touched a removed topic go too. Returns { map, removed: [ids] }.
export function removeTopics(map, ids) {
  const idx = indexOf(map);
  // Only the highest of nested selections matters.
  const top = ids.filter((id) => idx.has(id) && id !== map.root.id && !ids.some((o) => o !== id && idx.get(id).path.includes(o)));
  if (!top.length) return { map, removed: [] };
  const gone = new Set();
  for (const id of top) for (const [k, e] of idx) if (k === id || e.path.includes(id)) gone.add(k);
  let out = map;
  // Delete from the end of each list so the indexes stay right.
  const ordered = top.map((id) => idx.get(id)).sort((a, b) => b.index - a.index);
  for (const e of ordered) {
    if (e.kind === 'floating') {
      out = touch(out, { floating: out.floating.filter((f) => f.id !== e.topic.id) });
      continue;
    }
    const key = e.kind === 'callout' ? 'callouts' : 'children';
    out = updateTopic(out, e.parent, (p) => {
      const list = (p[key] || []).filter((c) => c.id !== e.topic.id);
      const n = { ...p, [key]: list };
      if (key === 'callouts' && !list.length) delete n.callouts;
      return n;
    });
  }
  const rels = (out.relationships || []).filter((r) => !gone.has(r.from) && !gone.has(r.to));
  if (rels.length !== (out.relationships || []).length) out = touch(out, { relationships: rels });
  return { map: out, removed: [...gone] };
}

function detach(map, id) {
  const e = entryOf(map, id);
  const topic = e.topic;
  if (e.kind === 'floating') return { map: touch(map, { floating: map.floating.filter((f) => f.id !== id) }), topic };
  const key = e.kind === 'callout' ? 'callouts' : 'children';
  const out = updateTopic(map, e.parent, (p) => {
    const n = { ...p, [key]: p[key].filter((c) => c.id !== id) };
    if (key === 'callouts' && !n.callouts.length) delete n.callouts;
    return n;
  });
  return { map: out, topic };
}

function cleanFloating(topic) {
  const t = { ...topic };
  delete t.x; delete t.y;
  return t;
}

// Moves a topic under `parentId` at `index` (children). Refused (map
// returned unchanged) for the root and for a move into its own subtree.
export function moveTopic(map, id, parentId, index, { side } = {}) {
  if (id === map.root.id || isWithin(map, parentId, id)) return map;
  const from = entryOf(map, id);
  if (!from || !entryOf(map, parentId)) return map;
  let at = index;
  if (from.kind === 'child' && from.parent === parentId && at != null && at > from.index) at -= 1;
  const { map: without, topic } = detach(map, id);
  let moved = cleanFloating(topic);
  if (parentId === map.root.id && side) moved = { ...moved, side };
  else if (parentId !== map.root.id && moved.side) { moved = { ...moved }; delete moved.side; }
  return insertInto(without, parentId, 'children', moved, at);
}

export function makeFloatingAt(map, id, x, y) {
  if (id === map.root.id) return map;
  const e = entryOf(map, id);
  if (!e) return map;
  if (e.kind === 'floating') {
    const floating = map.floating.map((f) => (f.id === id ? { ...f, x, y } : f));
    return touch(map, { floating });
  }
  const { map: without, topic } = detach(map, id);
  const t = { ...topic, x, y };
  delete t.side;
  return touch(without, { floating: [...(without.floating || []), t] });
}

// Wraps the topic in a new parent at its place.
export function insertParent(map, id, parent = makeTopic('')) {
  const e = entryOf(map, id);
  if (!e || e.kind === 'root') return { map, id: null };
  if (e.kind === 'floating') {
    const t = map.floating[e.index];
    const p = { ...parent, x: t.x, y: t.y, children: [cleanFloating(t)] };
    const floating = map.floating.slice();
    floating[e.index] = p;
    return { map: touch(map, { floating }), id: p.id };
  }
  const key = e.kind === 'callout' ? 'callouts' : 'children';
  let child = e.topic;
  let wrap = { ...parent, children: [child] };
  if (child.side) { wrap.side = child.side; child = { ...child }; delete child.side; wrap.children = [child]; }
  const out = updateTopic(map, e.parent, (p) => { const list = p[key].slice(); list[e.index] = wrap; return { ...p, [key]: list }; });
  return { map: out, id: wrap.id };
}

// Up / down among its siblings (delta -1 / +1).
export function shiftTopic(map, id, delta) {
  const e = entryOf(map, id);
  if (!e || e.kind === 'root') return map;
  if (e.kind === 'floating') {
    const j = e.index + delta;
    if (j < 0 || j >= map.floating.length) return map;
    const floating = map.floating.slice();
    [floating[e.index], floating[j]] = [floating[j], floating[e.index]];
    return touch(map, { floating });
  }
  const key = e.kind === 'callout' ? 'callouts' : 'children';
  return updateTopic(map, e.parent, (p) => {
    const list = p[key].slice();
    const j = e.index + delta;
    if (j < 0 || j >= list.length) return p;
    [list[e.index], list[j]] = [list[j], list[e.index]];
    return { ...p, [key]: list };
  });
}

// Outline view: Tab makes the topic a child of the sibling above; Shift+Tab a sibling of its parent.
export function indentTopic(map, id) {
  const e = entryOf(map, id);
  if (!e || e.kind !== 'child' || e.index === 0) return map;
  const prev = findTopic(map, e.parent).children[e.index - 1];
  return moveTopic(map, id, prev.id, (prev.children || []).length);
}

export function outdentTopic(map, id) {
  const e = entryOf(map, id);
  if (!e || e.kind !== 'child' || e.parent === map.root.id) return map;
  const pe = entryOf(map, e.parent);
  if (pe.kind !== 'child') return map;
  return moveTopic(map, id, pe.parent, pe.index + 1);
}

export function setCollapsed(map, ids, collapsed) {
  return updateTopics(map, ids, (t) => {
    if (!(t.children || []).length) return t;
    if (!!t.collapsed === !!collapsed) return t;
    const n = { ...t };
    if (collapsed) n.collapsed = true; else delete n.collapsed;
    return n;
  });
}

// Expand to `level` (1 = main topics only shown): topics shallower than it open, the rest closed.
export function expandToLevel(map, level) {
  const idx = indexOf(map);
  let out = map;
  for (const [id, e] of idx) {
    if (!(e.topic.children || []).length) continue;
    const want = level != null && e.depth >= level;
    if (!!e.topic.collapsed !== want) out = setCollapsed(out, [id], want);
  }
  return out;
}

export function expandAll(map) { return expandToLevel(map, null); }

// Sorts the children of each topic by text (natural order).
export function sortChildren(map, ids, { descending = false } = {}) {
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return updateTopics(map, ids, (t) => {
    if (!(t.children || []).length) return t;
    const list = t.children.slice().sort((a, b) => coll.compare(a.text || '', b.text || '') * (descending ? -1 : 1));
    return { ...t, children: list };
  });
}

// Main topics of a "map" layout, alternately to the right and left.
export function balanceSides(map) {
  return updateTopic(map, map.root.id, (r) => ({ ...r, children: r.children.map((c, i) => ({ ...c, side: i % 2 === 0 ? 'right' : 'left' })) }));
}

// ── Relationships ──

export function addRelationship(map, from, to, extra = {}) {
  if (!from || !to || from === to || !entryOf(map, from) || !entryOf(map, to)) return { map, id: null };
  const rel = { id: uid(), from, to, label: '', ...extra };
  return { map: touch(map, { relationships: [...(map.relationships || []), rel] }), id: rel.id };
}

export function updateRelationship(map, id, patch) {
  const list = (map.relationships || []).map((r) => (r.id === id ? patchObject(r, patch) : r));
  return touch(map, { relationships: list });
}

export function removeRelationships(map, ids) {
  const set = new Set(ids);
  return touch(map, { relationships: (map.relationships || []).filter((r) => !set.has(r.id)) });
}

// ── Copy / paste ──

// A deep copy of a topic with fresh ids (relationships inside a copied set keep their ends).
export function cloneTopic(topic, idMap = new Map()) {
  const nid = uid();
  idMap.set(topic.id, nid);
  const t = { ...topic, id: nid, children: (topic.children || []).map((c) => cloneTopic(c, idMap)) };
  if (topic.callouts) t.callouts = topic.callouts.map((c) => cloneTopic(c, idMap));
  return t;
}

// The selection as a clipboard fragment: the highest selected topics with their subtrees.
export function copyFragment(map, ids) {
  const idx = indexOf(map);
  const top = ids.filter((id) => idx.has(id) && !ids.some((o) => o !== id && idx.get(id).path.includes(o)));
  const topics = top.map((id) => idx.get(id).topic);
  const inside = new Set();
  for (const id of top) for (const [k, e] of idx) if (k === id || e.path.includes(id)) inside.add(k);
  const relationships = (map.relationships || []).filter((r) => inside.has(r.from) && inside.has(r.to));
  return { format: `${FORMAT}-fragment`, topics, relationships };
}

export function pasteFragment(map, parentId, fragment, index) {
  const idMap = new Map();
  let out = map;
  const ids = [];
  let at = index;
  for (const t of fragment.topics || []) {
    const copy = cleanFloating(cloneTopic(t, idMap));
    delete copy.side;
    const r = addChild(out, parentId, copy, at);
    out = r.map;
    ids.push(r.id);
    if (at != null) at += 1;
  }
  for (const rel of fragment.relationships || []) {
    if (idMap.has(rel.from) && idMap.has(rel.to)) out = addRelationship(out, idMap.get(rel.from), idMap.get(rel.to), { ...rel, id: undefined, from: undefined, to: undefined }).map;
  }
  return { map: out, ids };
}

// Plain text → topics: one topic per line, indentation (tabs or spaces)
// gives the levels; bullets and Markdown heading marks are removed (numbers
// stay — they are often part of the text).
export function topicsFromText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const indentOf = (l) => { const m = /^[\t ]*/.exec(l)[0]; return m.replace(/\t/g, '    ').length; };
  const clean = (l) => l.trim().replace(/^([-*+•·]|#+)\s+/, '').trim();
  const roots = [];
  const stack = [];
  for (const l of lines) {
    const ind = indentOf(l);
    const t = makeTopic(clean(l));
    while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
    if (stack.length) stack[stack.length - 1].t.children.push(t);
    else roots.push(t);
    stack.push({ ind, t });
  }
  return roots;
}

// The subtree as indented text (copy as text, quick export).
export function textOfTopics(topics, indent = '\t') {
  const out = [];
  const walk = (t, d) => { out.push(indent.repeat(d) + String(t.text || '').replace(/\n/g, ' ')); (t.children || []).forEach((c) => walk(c, d + 1)); };
  topics.forEach((t) => walk(t, 0));
  return out.join('\n');
}

// ── Find / filter ──

export function plainText(topic) { return String(topic.text || ''); }

// Topics whose text (and notes, when asked) contain the query.
export function findTopics(map, query, { notes = true, caseSensitive = false, wholeWord = false, regex = false } = {}) {
  if (!query) return [];
  let test;
  if (regex) {
    let re;
    try { re = new RegExp(query, caseSensitive ? 'g' : 'gi'); } catch { return []; }
    test = (s) => { re.lastIndex = 0; return re.test(s); };
  } else {
    const q = caseSensitive ? query : query.toLowerCase();
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wre = wholeWord ? new RegExp(`(^|[^\\p{L}\\p{N}_])${esc}($|[^\\p{L}\\p{N}_])`, caseSensitive ? 'u' : 'iu') : null;
    test = (s) => (wre ? wre.test(s) : (caseSensitive ? s : s.toLowerCase()).includes(q));
  }
  return allTopics(map).filter((t) => test(plainText(t)) || (notes && t.notes && test(t.notes))).map((t) => t.id);
}

export function replaceInTopics(map, ids, query, replacement, { caseSensitive = false, regex = false, notes = false } = {}) {
  if (!query) return { map, count: 0 };
  let re;
  try { re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi'); } catch { return { map, count: 0 }; }
  let count = 0;
  const out = updateTopics(map, ids, (t) => {
    const text = String(t.text || '').replace(re, () => { count++; return replacement; });
    let n = text === t.text ? t : { ...t, text };
    if (notes && t.notes) {
      const nn = t.notes.replace(re, () => { count++; return replacement; });
      if (nn !== t.notes) n = { ...n, notes: nn };
    }
    return n;
  });
  return { map: out, count };
}

// filter: { text, icons: [], tags: [], priority: [], progress: 'done'|'open'|'', due: 'overdue'|'week'|'' }
export function matchesFilter(topic, f, today = new Date()) {
  if (!f) return true;
  if (f.text) {
    const q = f.text.toLowerCase();
    if (!String(topic.text || '').toLowerCase().includes(q) && !String(topic.notes || '').toLowerCase().includes(q)) return false;
  }
  if (f.icons && f.icons.length && !f.icons.some((i) => (topic.icons || []).includes(i))) return false;
  if (f.tags && f.tags.length && !f.tags.some((g) => (topic.tags || []).includes(g))) return false;
  const task = topic.task || {};
  if (f.priority && f.priority.length && !f.priority.includes(task.priority)) return false;
  if (f.progress === 'done' && task.progress !== 100) return false;
  if (f.progress === 'open' && !(task.progress != null && task.progress < 100)) return false;
  if (f.due) {
    if (!task.due) return false;
    const due = new Date(`${task.due}T23:59:59`);
    const day = 86400000;
    if (f.due === 'overdue' && !(due < today && task.progress !== 100)) return false;
    if (f.due === 'week' && !(due >= today && due - today <= 7 * day)) return false;
  }
  return true;
}

export function filterActive(f) {
  return !!(f && (f.text || (f.icons && f.icons.length) || (f.tags && f.tags.length) || (f.priority && f.priority.length) || f.progress || f.due));
}

// Ids of the topics matching the filter, and of their ancestors (so a hidden-mode filter keeps the path visible).
export function filterTopics(map, f) {
  const idx = indexOf(map);
  const hits = new Set();
  const keep = new Set();
  for (const [id, e] of idx) {
    if (matchesFilter(e.topic, f)) {
      hits.add(id);
      keep.add(id);
      for (const a of e.path) keep.add(a);
    }
  }
  keep.add(map.root.id);
  return { hits, keep };
}

// Tags / icons used in the map, with how often.
export function usage(map) {
  const tags = new Map();
  const icons = new Map();
  const priorities = new Map();
  for (const t of allTopics(map)) {
    for (const g of t.tags || []) tags.set(g, (tags.get(g) || 0) + 1);
    for (const i of t.icons || []) icons.set(i, (icons.get(i) || 0) + 1);
    if (t.task && t.task.priority) priorities.set(t.task.priority, (priorities.get(t.task.priority) || 0) + 1);
  }
  return { tags, icons, priorities };
}

// ── Navigation helpers ──

export function siblingsOf(map, id) {
  const e = entryOf(map, id);
  if (!e) return [];
  if (e.kind === 'root') return [map.root];
  if (e.kind === 'floating') return map.floating;
  return findTopic(map, e.parent)[e.kind === 'callout' ? 'callouts' : 'children'];
}

export function subtreeIds(map, id) {
  const out = [];
  const t = findTopic(map, id);
  if (!t) return out;
  const walk = (x) => { out.push(x.id); (x.children || []).forEach(walk); (x.callouts || []).forEach(walk); };
  walk(t);
  return out;
}

// Topic numbering prefix ("1.2.3") when map.numbering is on (main topics are level 1).
export function numberingOf(map, id) {
  const n = map.numbering;
  if (!n || !n.enabled) return '';
  const e = entryOf(map, id);
  if (!e || e.kind !== 'child') return '';
  const parts = [];
  let cur = e;
  while (cur && cur.kind === 'child') {
    parts.unshift(cur.index + 1);
    cur = entryOf(map, cur.parent);
  }
  if (!cur || cur.kind !== 'root' || parts.length > (n.depth || 3)) return '';
  if (n.style === 'roman') {
    const roman = (k) => { const v = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [a, r] of v) while (k >= a) { s += r; k -= a; } return s; };
    const alpha = (k) => String.fromCharCode(64 + ((k - 1) % 26) + 1);
    return `${parts.map((p, i) => (i === 0 ? roman(p) : i === 1 ? alpha(p) : String(p))).join('.')}.`;
  }
  return `${parts.join('.')}.`;
}

// ── Normalization (opening a file) ──

// Makes a loaded object a valid map: missing arrays, duplicate / missing ids,
// relationships to unknown topics, a missing root.
export function normalizeMap(raw) {
  const base = newMap({});
  const src = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const fix = (t, floating) => {
    const topic = t && typeof t === 'object' ? { ...t } : { text: String(t ?? '') };
    if (!topic.id || seen.has(topic.id)) topic.id = uid();
    seen.add(topic.id);
    topic.text = topic.text == null ? '' : String(topic.text);
    topic.children = Array.isArray(topic.children) ? topic.children.map((c) => fix(c, false)) : [];
    if (Array.isArray(topic.callouts) && topic.callouts.length) topic.callouts = topic.callouts.map((c) => fix(c, false)); else delete topic.callouts;
    if (!floating) { delete topic.x; delete topic.y; }
    else { topic.x = Number(topic.x) || 0; topic.y = Number(topic.y) || 0; }
    for (const k of ['icons', 'tags', 'attachments']) if (k in topic && !Array.isArray(topic[k])) delete topic[k];
    return topic;
  };
  const map = {
    ...base,
    ...src,
    format: FORMAT,
    version: FILE_VERSION,
    root: fix(src.root || base.root, false),
    floating: Array.isArray(src.floating) ? src.floating.map((f) => fix(f, true)) : [],
    spacing: { ...base.spacing, ...(src.spacing || {}) },
    numbering: { ...base.numbering, ...(src.numbering || {}) },
    meta: { ...base.meta, ...(src.meta || {}) },
  };
  if (!LAYOUTS.includes(map.layout)) map.layout = 'map';
  const ids = indexOf(map);
  map.relationships = (Array.isArray(src.relationships) ? src.relationships : []).filter((r) => r && ids.has(r.from) && ids.has(r.to) && r.from !== r.to).map((r) => ({ ...r, id: r.id || uid() }));
  return map;
}

// The map's display title: its own title, else the central topic's first line.
export function mapTitle(map) {
  return (map.title || String(map.root.text || '').split('\n')[0] || '').trim();
}
