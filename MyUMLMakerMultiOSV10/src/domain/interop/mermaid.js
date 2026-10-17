// Mermaid text ↔ model. Reading turns a classDiagram, sequenceDiagram,
// flowchart/graph, erDiagram or stateDiagram(-v2) into new elements under one
// owner element (a package, collaboration, flowchart, data model or state
// machine) with ONE diagram whose views are laid out (layers or a grid).
// The caller puts the owner in the project: insertElement(target, result.owner)
// where canContain(target, result.owner._type) (see model.js).
// Writing turns a class, sequence, flowchart, ER, statechart, use case or
// activity diagram into Mermaid text (use case/activity as a flowchart).
//
// The intermediate forms (class IR, sequence IR), the layered layout and the
// member parser are exported for plantuml.js. Pure (no DOM).
import { typeDef } from '../meta.js';
import { addView, buildIndex, createEdgeView, createElement, createNodeView, insertElement, ref, refId, relationshipEnds, siblingsIn } from '../model.js';

export const fail = (code, detail) => Object.assign(new Error(code), { code, detail });

// ───────────────────────── shared: layout

/**
 * Layered layout: nodes [{ id, w, h }], edges [[fromId, toId]] → Map id → { x, y }
 * (top-left, from 0,0); map.extent is the total { w, h }. Cycles are broken; long layers wrap.
 */
export function layered(nodes, edges, { direction = 'TB', gapX = 60, gapY = 60, wrap = 6 } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  for (const [a, b] of edges) if (byId.has(a) && byId.has(b) && a !== b) { out.get(a).push(b); incoming.set(b, incoming.get(b) + 1); }
  // Depth-first from the sources: reverse post-order is a topological order without back edges.
  const state = new Map();
  const post = [];
  const back = new Set();
  const dfs = (id) => {
    state.set(id, 1);
    for (const next of out.get(id)) {
      if (state.get(next) === 1) back.add(`${id}>${next}`); else if (!state.has(next)) dfs(next);
    }
    state.set(id, 2);
    post.push(id);
  };
  for (const n of nodes) if (!incoming.get(n.id) && !state.has(n.id)) dfs(n.id);
  for (const n of nodes) if (!state.has(n.id)) dfs(n.id);
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  for (const id of post.reverse()) for (const next of out.get(id)) if (!back.has(`${id}>${next}`)) rank.set(next, Math.max(rank.get(next), rank.get(id) + 1));
  // Rows by rank, ordered by the mean position of their predecessors, wrapped.
  const rows = [];
  for (const n of nodes) (rows[rank.get(n.id)] ??= []).push(n.id);
  const position = new Map();
  const wrapped = [];
  for (const row of rows.filter(Boolean)) {
    const preds = (id) => edges.filter(([a, b]) => b === id && position.has(a)).map(([a]) => position.get(a));
    const key = new Map(row.map((id, i) => { const p = preds(id); return [id, p.length ? p.reduce((s, v) => s + v, 0) / p.length : i]; }));
    row.sort((a, b) => key.get(a) - key.get(b));
    for (let i = 0; i < row.length; i += wrap) {
      const part = row.slice(i, i + wrap);
      part.forEach((id, j) => position.set(id, j));
      wrapped.push(part);
    }
  }
  const horizontal = direction === 'LR' || direction === 'RL';
  const along = (n) => (horizontal ? n.h : n.w);
  const across = (n) => (horizontal ? n.w : n.h);
  const rowLength = (row) => row.reduce((s, id) => s + along(byId.get(id)), 0) + gapX * Math.max(0, row.length - 1);
  const widest = Math.max(0, ...wrapped.map(rowLength));
  const result = new Map();
  let cursor = 0;
  for (const row of wrapped) {
    const depth = Math.max(...row.map((id) => across(byId.get(id))));
    let offset = (widest - rowLength(row)) / 2;
    for (const id of row) {
      const n = byId.get(id);
      const a = offset;
      const c = cursor + (depth - across(n)) / 2;
      result.set(id, horizontal ? { x: c, y: a } : { x: a, y: c });
      offset += along(n) + gapX;
    }
    cursor += depth + gapY;
  }
  const total = { w: horizontal ? Math.max(0, cursor - gapY) : widest, h: horizontal ? widest : Math.max(0, cursor - gapY) };
  if (direction === 'BT' || direction === 'RL') {
    for (const [id, p] of result) {
      const n = byId.get(id);
      if (direction === 'BT') p.y = total.h - p.y - n.h; else p.x = total.w - p.x - n.w;
    }
  }
  result.extent = total;
  return result;
}

// ───────────────────────── shared: text helpers

const VIS_CHAR = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
const CHAR_OF_VIS = { public: '+', private: '-', protected: '#', package: '~' };
export const visibilityChar = (v) => CHAR_OF_VIS[v] ?? '';
const generics = (text) => String(text ?? '').replace(/~([^~]*)~/g, '<$1>');
const unquote = (text) => String(text ?? '').trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');

/** Splits by commas outside <>, (), []. */
function splitTop(text) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of String(text)) {
    if ('<([{'.includes(ch)) depth += 1;
    if ('>)]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth <= 0) { out.push(current); current = ''; } else current += ch;
  }
  if (current.trim()) out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** "name : Type" or "Type name" → { name, type }. */
function nameAndType(text, { typeFirst = true } = {}) {
  const value = generics(text).trim();
  if (value.includes(':')) {
    const at = value.indexOf(':');
    return { name: value.slice(0, at).trim(), type: value.slice(at + 1).trim() };
  }
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return typeFirst ? { name: parts[parts.length - 1], type: parts.slice(0, -1).join(' ') } : { name: parts[0], type: parts.slice(1).join(' ') };
  return { name: value, type: '' };
}

/**
 * One class member line (Mermaid or PlantUML) → { kind: 'attribute'|'operation', … }.
 * Visibility + - # ~; static: trailing $ or {static}; abstract: trailing * or {abstract}.
 */
export function parseMember(line) {
  let text = String(line ?? '').trim();
  let isStatic = false;
  let isAbstract = false;
  text = text.replace(/\{(static|classifier|abstract)\}\s*/g, (m, k) => { if (k === 'abstract') isAbstract = true; else isStatic = true; return ''; }).trim();
  let visibility = 'public';
  let explicitVisibility = false;
  if (VIS_CHAR[text[0]] && text.length > 1) { visibility = VIS_CHAR[text[0]]; explicitVisibility = true; text = text.slice(1).trim(); }
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open > 0 && close > open) {
    const name = text.slice(0, open).trim();
    const params = splitTop(text.slice(open + 1, close)).map((p) => {
      const nt = nameAndType(p.replace(/^(in|out|inout)\s+/, ''));
      return { name: nt.name, type: nt.type };
    });
    let rest = text.slice(close + 1).trim();
    for (;;) {
      if (rest.startsWith('$')) { isStatic = true; rest = rest.slice(1).trim(); } else if (rest.startsWith('*')) { isAbstract = true; rest = rest.slice(1).trim(); } else break;
    }
    rest = rest.replace(/^:\s*/, '');
    return { kind: 'operation', name: generics(name), params, returnType: generics(rest).trim(), visibility, explicitVisibility, isStatic, isAbstract };
  }
  if (/\$$/.test(text)) { isStatic = true; text = text.slice(0, -1).trim(); }
  let defaultValue = '';
  const eq = text.indexOf('=');
  if (eq > 0) { defaultValue = text.slice(eq + 1).trim(); text = text.slice(0, eq).trim(); }
  const nt = nameAndType(text);
  return { kind: 'attribute', name: nt.name, type: nt.type, defaultValue, visibility, explicitVisibility, isStatic };
}

/** Lines without comments, trimmed and non-empty. */
export function cleanLines(text, comment = /^%%/) {
  return String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !comment.test(l));
}

// ───────────────────────── shared: building elements

function adder(language) {
  return (owner, type, attrs = {}) => insertElement(owner, createElement(type, attrs, { language, siblings: siblingsIn(owner, type) }));
}

/**
 * Class IR → { owner: UMLPackage, diagram, kind: 'class' }.
 *   ir.classes: Map id → { id, label, kind: 'class'|'interface'|'enum', isAbstract, stereotype, namespace, members: [parseMember …], literals: [] }
 *   ir.relations: [{ kind: 'generalization'|'realization'|'dependency'|'association', from, to, name,
 *                    fromEnd: { multiplicity, aggregation, navigable }, toEnd: { … } }]   (directed: from = source)
 *   ir.notes: [{ text, for }]
 */
export function buildClassModel(ir, { language = 'en', name = '' } = {}) {
  const add = adder(language);
  const owner = createElement('UMLPackage', { name: ir.title || name || 'Imported' });
  const packages = new Map();
  const packageFor = (path) => {
    if (!path) return owner;
    if (packages.has(path)) return packages.get(path);
    const parts = path.split('.');
    const parent = packageFor(parts.slice(0, -1).join('.'));
    const created = add(parent, 'UMLPackage', { name: parts[parts.length - 1] });
    packages.set(path, created);
    return created;
  };
  const elements = new Map();
  for (const c of ir.classes.values()) {
    const type = c.kind === 'interface' ? 'UMLInterface' : c.kind === 'enum' ? 'UMLEnumeration' : 'UMLClass';
    const element = add(packageFor(c.namespace), type, { name: c.label || c.id, ...(c.isAbstract ? { isAbstract: true } : {}), ...(c.stereotype ? { stereotype: c.stereotype } : {}) });
    for (const literal of c.literals ?? []) add(element, 'UMLEnumerationLiteral', { name: literal });
    for (const m of c.members ?? []) {
      if (c.kind === 'enum' && m.kind === 'attribute' && !m.type) { add(element, 'UMLEnumerationLiteral', { name: m.name }); continue; }
      if (m.kind === 'attribute') {
        add(element, 'UMLAttribute', { name: m.name, type: m.type, visibility: m.visibility, isStatic: m.isStatic, defaultValue: m.defaultValue ?? '' });
      } else {
        const op = add(element, 'UMLOperation', { name: m.name, visibility: m.visibility, isStatic: m.isStatic, isAbstract: m.isAbstract });
        for (const p of m.params) add(op, 'UMLParameter', { name: p.name, type: p.type, direction: 'in' });
        if (m.returnType) add(op, 'UMLParameter', { name: '', type: m.returnType, direction: 'return' });
      }
    }
    elements.set(c.id, element);
  }
  const diagram = insertElement(owner, createElement('UMLClassDiagram', { name: ir.title || name || 'Imported', ownedViews: [] }, { language }));
  const relations = [];
  for (const r of ir.relations) {
    const a = elements.get(r.from);
    const b = elements.get(r.to);
    if (!a || !b) continue;
    let element;
    if (r.kind === 'association') {
      element = createElement('UMLAssociation', {
        name: r.name ?? '',
        end1: { reference: ref(a), multiplicity: r.fromEnd?.multiplicity ?? '', aggregation: r.fromEnd?.aggregation ?? 'none', navigable: r.fromEnd?.navigable ? 'navigable' : 'unspecified' },
        end2: { reference: ref(b), multiplicity: r.toEnd?.multiplicity ?? '', aggregation: r.toEnd?.aggregation ?? 'none', navigable: r.toEnd?.navigable ? 'navigable' : 'unspecified' },
      }, { language });
    } else {
      const type = r.kind === 'generalization' ? 'UMLGeneralization' : r.kind === 'realization' ? (b._type === 'UMLInterface' ? 'UMLInterfaceRealization' : 'UMLRealization') : 'UMLDependency';
      element = createElement(type, { name: r.name ?? '', source: ref(a), target: ref(b) }, { language });
    }
    insertElement(a, element);
    relations.push(element);
  }
  // Layout: parents above children (generalization/realization point up).
  const nodes = [...elements.entries()].map(([id, el]) => ({ id: el._id, ...classSize(el), key: id }));
  const edges = relations.map((r) => { const [s, t] = relationshipEnds(r); return /Generalization|Realization/.test(r._type) ? [t, s] : [s, t]; });
  const placed = layered(nodes, edges, { gapX: 70, gapY: 80, wrap: 5 });
  const viewOf = new Map();
  for (const el of elements.values()) {
    const p = placed.get(el._id);
    viewOf.set(el._id, addView(diagram, createNodeView(`${el._type}View`, el._id, { x: 40 + p.x, y: 40 + p.y, w: 0, h: 0 })));
  }
  for (const r of relations) {
    const [s, t] = relationshipEnds(r);
    addView(diagram, createEdgeView(`${r._type}View`, r._id, viewOf.get(s)._id, viewOf.get(t)._id));
  }
  addNotes(diagram, ir.notes ?? [], (key) => viewOf.get(elements.get(key)?._id), placed.extent);
  return { owner, diagram, kind: 'class' };
}

function classSize(el) {
  const members = [...(el.attributes ?? []), ...(el.operations ?? []), ...(el.literals ?? [])];
  const longest = members.reduce((w, m) => Math.max(w, String(m.name ?? '').length + 14), String(el.name ?? '').length + 4);
  return { w: Math.min(360, Math.max(120, longest * 7.5)), h: 44 + 18 * members.length + 14 };
}

/** Notes: { text, for: key } beside the view (with a note link) or under the drawing. */
function addNotes(diagram, notes, viewFor, size) {
  let free = 0;
  for (const note of notes) {
    const target = note.for ? viewFor(note.for) : null;
    const box = target ? { x: target.left + 200, y: target.top - 70, w: 160, h: 50 } : { x: 40 + free, y: 80 + (size?.h ?? 0), w: 160, h: 50 };
    if (!target) free += 190;
    const view = addView(diagram, createNodeView('UMLNoteView', null, box, { text: note.text }));
    if (target) addView(diagram, createEdgeView('UMLNoteLinkView', null, view._id, target._id));
  }
}

/**
 * Sequence IR → { owner: UMLCollaboration, diagram, kind: 'sequence' }.
 *   ir.participants: [{ id, label, actor }]
 *   ir.items: [{ kind: 'message', from, to, sort, text } | { kind: 'fragment', operator, operands: [{ guard, items }] } | { kind: 'note', over: [ids], text }]
 */
export function buildSequenceModel(ir, { language = 'en', name = '' } = {}) {
  const add = adder(language);
  const title = ir.title || name || 'Interaction';
  const owner = createElement('UMLCollaboration', { name: title });
  const interaction = add(owner, 'UMLInteraction', { name: title });
  const diagram = insertElement(interaction, createElement('UMLSequenceDiagram', { name: title, ownedViews: [], showSequenceNumber: true, messageSignature: 'nameAndType', showActivation: true }, { language }));
  const lifelines = new Map();
  for (const p of ir.participants) {
    let type = '';
    if (p.actor) type = ref(add(owner, 'UMLActor', { name: p.label || p.id }));
    const attribute = add(owner, 'UMLAttribute', { name: p.label || p.id, type });
    lifelines.set(p.id, add(interaction, 'UMLLifeline', { name: p.label || p.id, represent: ref(attribute) }));
  }
  // Views: lifelines in a row, messages downwards, fragments around their messages.
  const LEFT = 40;
  const TOP = 40;
  const STEP = 180;
  const WIDTH = 120;
  const column = new Map(ir.participants.map((p, i) => [p.id, LEFT + i * STEP]));
  const MESSAGE = 40;
  const measure = (items) => items.reduce((h, item) => h + (item.kind === 'message' ? (item.from === item.to ? 60 : MESSAGE) : item.kind === 'note' ? 60 : fragmentHeight(item) + 20), 0);
  const operandHeight = (f) => Math.max(...f.operands.map((o) => 30 + measure(o.items) + 10), 60);
  const fragmentHeight = (f) => operandHeight(f) * Math.max(1, f.operands.length);
  const touched = (items, set = new Set()) => {
    for (const item of items) {
      if (item.kind === 'message') { set.add(item.from); set.add(item.to); } else if (item.kind === 'fragment') item.operands.forEach((o) => touched(o.items, set)); else if (item.kind === 'note') item.over.forEach((id) => set.add(id));
    }
    return set;
  };
  const views = new Map();
  for (const p of ir.participants) views.set(p.id, addView(diagram, createNodeView('UMLLifelineView', lifelines.get(p.id)._id, { x: column.get(p.id), y: TOP, w: WIDTH, h: 0 })));
  const pending = [];
  const place = (items, y, depth) => {
    for (const item of items) {
      if (item.kind === 'message') {
        const self = item.from === item.to;
        const message = add(interaction, 'UMLMessage', { name: item.text ?? '', source: ref(lifelines.get(item.from)), target: ref(lifelines.get(item.to)), messageSort: item.sort || 'synchCall' });
        y += self ? 30 : MESSAGE / 2;
        pending.push(createEdgeView('UMLMessageView', message._id, views.get(item.from)._id, views.get(item.to)._id, { y }));
        y += self ? 30 : MESSAGE / 2;
      } else if (item.kind === 'note') {
        const xs = item.over.map((id) => column.get(id)).filter((x) => x !== undefined);
        const x = xs.length ? Math.min(...xs) + WIDTH / 2 - 20 : LEFT;
        const w = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) + 40 : 140;
        pending.push(createNodeView('UMLNoteView', null, { x: item.side === 'right' ? x + 40 : item.side === 'left' ? x - 160 : x, y: y + 10, w, h: 40 }, { text: item.text }));
        y += 60;
      } else {
        const fragment = add(interaction, 'UMLCombinedFragment', { name: '', interactionOperator: item.operator });
        const covered = [...touched([item])].map((id) => column.get(id)).filter((x) => x !== undefined);
        const minX = covered.length ? Math.min(...covered) : LEFT;
        const maxX = covered.length ? Math.max(...covered) + WIDTH : LEFT + WIDTH;
        const top = y + 10;
        const opH = operandHeight(item);
        const inset = depth * 8;
        pending.push(createNodeView('UMLCombinedFragmentView', fragment._id, { x: minX - 20 + inset, y: top, w: maxX - minX + 40 - 2 * inset, h: opH * Math.max(1, item.operands.length) }));
        item.operands.forEach((operand, i) => {
          add(fragment, 'UMLInteractionOperand', { name: '', guard: operand.guard ?? '' });
          place(operand.items, top + i * opH + 30, depth + 1);
        });
        y = top + fragmentHeight(item) + 10;
      }
    }
    return y;
  };
  const bottom = place(ir.items, TOP + 60, 0);
  for (const view of views.values()) view.height = Math.max(200, bottom + 40 - TOP);
  // Fragments behind messages; notes on top.
  for (const view of pending.filter((v) => v._type === 'UMLCombinedFragmentView')) addView(diagram, view);
  for (const view of pending.filter((v) => v._type !== 'UMLCombinedFragmentView')) addView(diagram, view);
  return { owner, diagram, kind: 'sequence' };
}

// ───────────────────────── Mermaid: reading

const SEQ_ARROWS = { '->>': 'synchCall', '-->>': 'reply', '->': 'synchCall', '-->': 'reply', '-x': 'asynchSignal', '--x': 'asynchSignal', '-)': 'asynchCall', '--)': 'asynchCall', '<<->>': 'synchCall', '<<-->>': 'reply' };
const CLASS_NAME = String.raw`[\w$.À-￿]+(?:~[^~]*~)?`;
const REL = new RegExp(String.raw`^(${CLASS_NAME})\s*(?:"([^"]*)")?\s*(<\||\*|o|<)?(--|\.\.)(\|>|\*|o(?=[\s"])|>)?\s*(?:"([^"]*)")?\s*(${CLASS_NAME})\s*(?::\s*(.*))?$`);

function parseClassDiagram(lines) {
  const ir = { classes: new Map(), relations: [], notes: [], title: '' };
  const namespaces = [];
  const cls = (raw) => {
    const id = String(raw).replace(/~[^~]*~$/, '');
    const generic = /~([^~]*)~$/.exec(raw);
    if (!ir.classes.has(id)) ir.classes.set(id, { id, label: generic ? `${id}<${generic[1]}>` : '', kind: 'class', isAbstract: false, stereotype: '', namespace: namespaces.join('.'), members: [], literals: [] });
    return ir.classes.get(id);
  };
  const annotate = (c, annotation) => {
    const a = annotation.trim().toLowerCase();
    if (a === 'interface') c.kind = 'interface';
    else if (a === 'enumeration' || a === 'enum') c.kind = 'enum';
    else if (a === 'abstract') c.isAbstract = true;
    else c.stereotype = annotation.trim();
  };
  const member = (c, text) => {
    const m = parseMember(text);
    if (m.name || m.kind === 'operation') c.members.push(m);
  };
  let open = null;
  for (const raw of lines.slice(1)) {
    const line = raw.replace(/:::\w+/g, '').replace(/;$/, '').trim();
    if (open) {
      if (line === '}') { open = null; continue; }
      const ann = /^<<(.+)>>$/.exec(line);
      if (ann) annotate(open, ann[1]); else member(open, line);
      continue;
    }
    let m;
    if ((m = /^title\s+(.*)$/.exec(line))) { ir.title = m[1].trim(); continue; }
    if (/^(direction|style|classDef|cssClass|click|link|callback)\b/.test(line)) continue;
    if ((m = /^namespace\s+([\w.]+)\s*\{$/.exec(line))) { namespaces.push(m[1]); continue; }
    if (line === '}') { namespaces.pop(); continue; }
    if ((m = new RegExp(String.raw`^class\s+(${CLASS_NAME})(?:\s*\["([^"]*)"\])?\s*(\{)?\s*(\})?$`).exec(line))) {
      const c = cls(m[1]);
      if (m[2]) c.label = m[2];
      if (m[3] && !m[4]) open = c;
      continue;
    }
    if ((m = new RegExp(String.raw`^<<(.+)>>\s*(${CLASS_NAME})$`).exec(line))) { annotate(cls(m[2]), m[1]); continue; }
    if ((m = /^note\s+for\s+(\S+)\s+"(.*)"$/.exec(line))) { ir.notes.push({ for: m[1], text: m[2].replace(/\\n/g, '\n') }); continue; }
    if ((m = /^note\s+"(.*)"$/.exec(line))) { ir.notes.push({ text: m[1].replace(/\\n/g, '\n') }); continue; }
    if ((m = REL.exec(line))) {
      const [, left, leftCard, lh, link, rh, rightCard, right, label] = m;
      const a = cls(left).id;
      const b = cls(right).id;
      const dashed = link === '..';
      const name = (label ?? '').trim();
      if (lh === '<|') ir.relations.push({ kind: dashed ? 'realization' : 'generalization', from: b, to: a, name });
      else if (rh === '|>') ir.relations.push({ kind: dashed ? 'realization' : 'generalization', from: a, to: b, name });
      else if (dashed && (rh === '>' || lh === '<' || (!lh && !rh))) ir.relations.push(lh === '<' ? { kind: 'dependency', from: b, to: a, name } : { kind: 'dependency', from: a, to: b, name });
      else {
        const end = (head, card) => ({ multiplicity: card ?? '', aggregation: head === '*' ? 'composite' : head === 'o' ? 'shared' : 'none', navigable: head === '<' || head === '>' });
        ir.relations.push({ kind: 'association', from: a, to: b, name, fromEnd: end(lh, leftCard), toEnd: end(rh, rightCard) });
      }
      continue;
    }
    if ((m = new RegExp(String.raw`^(${CLASS_NAME})\s*:\s*(.+)$`).exec(line))) {
      const c = cls(m[1]);
      const ann = /^<<(.+)>>$/.exec(m[2].trim());
      if (ann) annotate(c, ann[1]); else member(c, m[2]);
      continue;
    }
    if ((m = new RegExp(String.raw`^(${CLASS_NAME})$`).exec(line))) cls(m[1]);
  }
  return ir;
}

function parseSequenceDiagram(lines) {
  const ir = { participants: [], items: [], title: '' };
  const known = new Map();
  const participant = (id, label = '', actor = false) => {
    const key = id.trim();
    if (!known.has(key)) { const p = { id: key, label: label.trim() || key, actor }; known.set(key, p); ir.participants.push(p); } else if (label) known.get(key).label = label.trim();
    if (actor) known.get(key).actor = true;
    return known.get(key);
  };
  const stack = [{ items: ir.items, transparent: false }];
  const target = () => stack[stack.length - 1].items;
  const created = new Set();
  const destroyed = new Set();
  for (const raw of lines.slice(1)) {
    const line = raw.replace(/;$/, '').trim();
    let m;
    if ((m = /^title\s*:?\s*(.*)$/.exec(line))) { ir.title = m[1].trim(); continue; }
    if ((m = /^(create\s+)?(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(line))) {
      const p = participant(m[3], m[4] ?? '', m[2] === 'actor');
      if (m[1]) created.add(p.id);
      continue;
    }
    if ((m = /^destroy\s+(.+)$/.exec(line))) { destroyed.add(m[1].trim()); continue; }
    if (/^(autonumber|activate|deactivate|links?|properties|details)\b/.test(line)) continue;
    if ((m = /^(alt|opt|loop|par|critical|break)\b\s*(.*)$/.exec(line))) {
      const fragment = { kind: 'fragment', operator: m[1], operands: [{ guard: m[2].trim(), items: [] }] };
      target().push(fragment);
      stack.push({ fragment, items: fragment.operands[0].items });
      continue;
    }
    if ((m = /^(rect|box)\b/.exec(line))) { stack.push({ items: target(), transparent: true }); continue; }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(line))) {
      const top = stack[stack.length - 1];
      if (top.fragment) { const operand = { guard: m[2].trim(), items: [] }; top.fragment.operands.push(operand); top.items = operand.items; }
      continue;
    }
    if (line === 'end') { if (stack.length > 1) stack.pop(); continue; }
    if ((m = /^note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i.exec(line))) {
      const over = m[2].split(',').map((s) => participant(s).id);
      target().push({ kind: 'note', over, text: m[3].replace(/<br\s*\/?>/g, '\n'), side: /left/i.test(m[1]) ? 'left' : /right/i.test(m[1]) ? 'right' : 'over' });
      continue;
    }
    if ((m = /^(.+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-]?)\s*([^:]+?)\s*(?::\s*(.*))?$/.exec(line))) {
      const from = participant(m[1]).id;
      const to = participant(m[4]).id;
      let sort = SEQ_ARROWS[m[2]] ?? 'synchCall';
      if (created.has(to)) { sort = 'createMessage'; created.delete(to); } else if (destroyed.has(to)) { sort = 'deleteMessage'; destroyed.delete(to); }
      target().push({ kind: 'message', from, to, sort, text: (m[5] ?? '').trim() });
    }
  }
  return ir;
}

/** Flowchart node shapes: opening, closing, type. Longest openings first. */
const FC_SHAPES = [
  ['(((', ')))', 'FCConnector'], ['((', '))', 'FCConnector'], ['([', '])', 'FCTerminator'], ['[[', ']]', 'FCPredefinedProcess'], ['[(', ')]', 'FCDatabase'],
  ['{{', '}}', 'FCPreparation'], ['[/', '/]', 'FCData'], ['[\\', '\\]', 'FCData'], ['[/', '\\]', 'FCManualOperation'], ['[\\', '/]', 'FCManualOperation'],
  ['[', ']', 'FCProcess'], ['(', ')', 'FCTerminator'], ['{', '}', 'FCDecision'], ['>', ']', 'FCOffPageConnector'],
];
const SHAPE_OF_TYPE = {
  FCProcess: ['[', ']'], FCTerminator: ['([', '])'], FCDecision: ['{', '}'], FCDatabase: ['[(', ')]'], FCStoredData: ['[(', ')]'], FCDirectAccessStorage: ['[(', ')]'],
  FCConnector: ['((', '))'], FCPredefinedProcess: ['[[', ']]'], FCPreparation: ['{{', '}}'], FCData: ['[/', '/]'], FCManualOperation: ['[\\', '/]'],
  FCManualInput: ['[/', '/]'], FCOffPageConnector: ['>', ']'], FCAlternateProcess: ['(', ')'], FCDelay: ['(', ')'],
};
const NODE_ID = /^[A-Za-z0-9_À-￿][\wÀ-￿]*/;
const LINK_TEXT = /^\s*(<?)(--|==|-\.)\s+(.+?)\s+(-{2,}|={2,}|\.+-)([>ox]?)\s*/;
const LINK = /^\s*(<?)(-{2,}|={2,}|-?\.+-?|~{3,})([>ox]?)(?:\s*\|([^|]*)\|)?\s*/;

function parseFlowchart(lines) {
  const header = /^(?:flowchart|graph)\s*(TB|TD|BT|LR|RL)?/i.exec(lines[0]);
  const ir = { direction: (header?.[1] ?? 'TB').toUpperCase().replace('TD', 'TB'), nodes: new Map(), edges: [], title: '' };
  const node = (id, text, type) => {
    if (!ir.nodes.has(id)) ir.nodes.set(id, { id, text: id, type: 'FCProcess' });
    const n = ir.nodes.get(id);
    if (text !== undefined) { n.text = text; n.type = type; }
    return n;
  };
  // A node (with optional shape) at the start of s → [node, rest] or null.
  const readNode = (s) => {
    const idMatch = NODE_ID.exec(s);
    if (!idMatch) return null;
    const id = idMatch[0];
    let rest = s.slice(id.length);
    for (const [open, close, type] of FC_SHAPES) {
      if (!rest.startsWith(open)) continue;
      const body = rest.slice(open.length);
      let end;
      let text;
      if (body.trimStart().startsWith('"')) {
        const q = body.indexOf('"');
        const q2 = body.indexOf('"', q + 1);
        if (q2 < 0 || !body.slice(q2 + 1).trimStart().startsWith(close)) continue;
        text = body.slice(q + 1, q2);
        end = body.indexOf(close, q2 + 1);
      } else {
        end = body.indexOf(close);
        if (end < 0) continue;
        text = body.slice(0, end);
      }
      rest = body.slice(end + close.length);
      return [node(id, text.replace(/<br\s*\/?>/g, '\n').replace(/#quot;/g, '"').trim(), type), rest.replace(/^:::\w+/, '')];
    }
    return [node(id), rest.replace(/^:::\w+/, '')];
  };
  const readGroup = (s) => {
    const out = [];
    let rest = s.trimStart();
    for (;;) {
      const read = readNode(rest);
      if (!read) break;
      out.push(read[0]);
      rest = read[1].trimStart();
      if (rest.startsWith('&')) { rest = rest.slice(1).trimStart(); continue; }
      break;
    }
    return [out, rest];
  };
  const statements = lines.slice(1).flatMap((l) => l.split(/;\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((l) => l.trim()).filter(Boolean);
  for (const statement of statements) {
    if (/^(subgraph|end$|classDef|class\s|style|linkStyle|click|direction|%%)/.test(statement)) continue;
    let [from, rest] = readGroup(statement);
    if (!from.length) continue;
    while (rest) {
      let m = LINK_TEXT.exec(rest);
      let text = '';
      let dashed = false;
      if (m) { text = m[3]; dashed = m[2] === '-.'; } else { m = LINK.exec(rest); if (!m) break; text = m[4] ?? ''; dashed = m[2].includes('.'); }
      rest = rest.slice(m[0].length);
      const [to, after] = readGroup(rest);
      if (!to.length) break;
      for (const a of from) for (const b of to) ir.edges.push({ from: a.id, to: b.id, text: text.trim().replace(/^"(.*)"$/, '$1'), dashed });
      from = to;
      rest = after.trim();
    }
  }
  return ir;
}

const ER_LEFT = { '|o': '0..1', '||': '1', '}o': '0..*', '}|': '1..*' };
const ER_RIGHT = { 'o|': '0..1', '||': '1', 'o{': '0..*', '|{': '1..*' };
const ER_NAME = String.raw`(?:"[^"]+"|[\wÀ-￿-]+)`;

function parseErDiagram(lines) {
  const ir = { entities: new Map(), relations: [], title: '' };
  const entity = (raw) => {
    const id = unquote(raw);
    if (!ir.entities.has(id)) ir.entities.set(id, { id, label: '', columns: [] });
    return ir.entities.get(id);
  };
  let open = null;
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    let m;
    if (open) {
      if (line === '}') { open = null; continue; }
      if ((m = /^([\wÀ-￿\-[\]()*,]+)\s+([\wÀ-￿-]+)((?:\s+(?:PK|FK|UK)\s*,?)*)\s*(?:"([^"]*)")?$/.exec(line))) {
        const keys = (m[3] ?? '').toUpperCase();
        open.columns.push({ name: m[2], type: m[1], primaryKey: keys.includes('PK'), foreignKey: keys.includes('FK'), unique: keys.includes('UK'), comment: m[4] ?? '' });
      }
      continue;
    }
    if ((m = /^title\s+(.*)$/.exec(line))) { ir.title = m[1].trim(); continue; }
    if ((m = new RegExp(String.raw`^(${ER_NAME})\s*(?:\[\s*"?([^"\]]*)"?\s*\])?\s*\{$`).exec(line))) { open = entity(m[1]); if (m[2]) open.label = m[2]; continue; }
    if ((m = new RegExp(String.raw`^(${ER_NAME})\s*(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)\s*(${ER_NAME})\s*(?::\s*(.*))?$`).exec(line))) {
      ir.relations.push({ from: entity(m[1]).id, to: entity(m[5]).id, fromCard: ER_LEFT[m[2]], toCard: ER_RIGHT[m[4]], identifying: m[3] === '--', name: unquote(m[6] ?? '') });
      continue;
    }
    if ((m = new RegExp(String.raw`^(${ER_NAME})$`).exec(line))) entity(m[1]);
  }
  return ir;
}

function buildErModel(ir, { language = 'en', name = '' } = {}) {
  const add = adder(language);
  const owner = createElement('ERDDataModel', { name: ir.title || name || 'Data Model' });
  const entities = new Map();
  for (const e of ir.entities.values()) {
    const entity = add(owner, 'ERDEntity', { name: e.label || e.id });
    for (const c of e.columns) add(entity, 'ERDColumn', { name: c.name, type: c.type, primaryKey: c.primaryKey, foreignKey: c.foreignKey, unique: c.unique, ...(c.comment ? { documentation: c.comment } : {}) });
    entities.set(e.id, entity);
  }
  const relations = [];
  for (const r of ir.relations) {
    const a = entities.get(r.from);
    const b = entities.get(r.to);
    const element = add(owner, 'ERDRelationship', { name: r.name, identifying: r.identifying, end1: { reference: ref(a), cardinality: r.fromCard }, end2: { reference: ref(b), cardinality: r.toCard } });
    relations.push(element);
  }
  // Foreign keys → the primary key of a related entity (same name, or <entity>_<pk>, or the only one).
  for (const entity of entities.values()) {
    const related = relations.flatMap((r) => { const [x, y] = relationshipEnds(r); return x === entity._id ? [y] : y === entity._id ? [x] : []; })
      .map((id) => [...entities.values()].find((e) => e._id === id)).filter(Boolean);
    for (const column of entity.columns ?? []) {
      if (!column.foreignKey || column.referenceTo) continue;
      const candidates = related.flatMap((e) => (e.columns ?? []).filter((c) => c.primaryKey).map((c) => ({ e, c })));
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const hit = candidates.find(({ e, c }) => norm(column.name) === norm(c.name) || norm(column.name) === norm(`${e.name}${c.name}`)) ?? (candidates.length === 1 ? candidates[0] : null);
      if (hit) column.referenceTo = ref(hit.c);
    }
  }
  const diagram = insertElement(owner, createElement('ERDDiagram', { name: ir.title || name || 'ER Diagram', ownedViews: [] }, { language }));
  const nodes = [...entities.values()].map((e) => ({ id: e._id, w: Math.max(140, String(e.name).length * 8 + 40, ...(e.columns ?? []).map((c) => (c.name.length + String(c.type).length) * 7 + 60)), h: 40 + 20 * (e.columns?.length ?? 0) }));
  const placed = layered(nodes, relations.map((r) => relationshipEnds(r)), { gapX: 90, gapY: 90, wrap: 4 });
  const viewOf = new Map();
  for (const e of entities.values()) { const p = placed.get(e._id); viewOf.set(e._id, addView(diagram, createNodeView('ERDEntityView', e._id, { x: 40 + p.x, y: 40 + p.y, w: 0, h: 0 }))); }
  for (const r of relations) { const [a, b] = relationshipEnds(r); addView(diagram, createEdgeView('ERDRelationshipView', r._id, viewOf.get(a)._id, viewOf.get(b)._id)); }
  return { owner, diagram, kind: 'er' };
}

const FC_SIZE = { FCDecision: { w: 130, h: 70 }, FCConnector: { w: 50, h: 50 }, FCDatabase: { w: 100, h: 70 }, FCTerminator: { w: 130, h: 44 } };

function buildFlowchart(ir, { language = 'en', name = '' } = {}) {
  const add = adder(language);
  const owner = createElement('FCFlowchart', { name: ir.title || name || 'Flowchart' });
  const elements = new Map();
  for (const n of ir.nodes.values()) elements.set(n.id, add(owner, n.type, { name: n.text }));
  const flows = ir.edges.map((e) => add(owner, 'FCFlow', { name: e.text, source: ref(elements.get(e.from)), target: ref(elements.get(e.to)) }));
  const diagram = insertElement(owner, createElement('FCFlowchartDiagram', { name: ir.title || name || 'Flowchart', ownedViews: [] }, { language }));
  const size = (el) => { const base = FC_SIZE[el._type] ?? { w: 130, h: 50 }; const longest = Math.max(...String(el.name).split('\n').map((s) => s.length)); return { w: Math.max(base.w, Math.min(260, longest * 7.5 + 30)), h: base.h }; };
  const nodes = [...elements.values()].map((el) => ({ id: el._id, ...size(el) }));
  const placed = layered(nodes, flows.map((f) => relationshipEnds(f)), { direction: ir.direction, gapX: 50, gapY: 50, wrap: 8 });
  const viewOf = new Map();
  for (const el of elements.values()) {
    const p = placed.get(el._id);
    const s = size(el);
    viewOf.set(el._id, addView(diagram, createNodeView(`${el._type}View`, el._id, { x: 40 + p.x, y: 40 + p.y, w: s.w, h: s.h })));
  }
  for (const f of flows) { const [a, b] = relationshipEnds(f); addView(diagram, createEdgeView('FCFlowView', f._id, viewOf.get(a)._id, viewOf.get(b)._id)); }
  return { owner, diagram, kind: 'flowchart' };
}

/** "event [guard] / effect" → { triggers, guard, effect }. */
export function parseTransitionLabel(text) {
  const m = /^([^[/]*)(?:\[([^\]]*)\])?\s*(?:\/(.*))?$/.exec(String(text ?? '').trim());
  return m ? { triggers: m[1].trim(), guard: (m[2] ?? '').trim(), effect: (m[3] ?? '').trim() } : { triggers: String(text ?? ''), guard: '', effect: '' };
}

function parseStateDiagram(lines) {
  const root = { id: '', states: new Map(), transitions: [], initial: false, final: false };
  const ir = { root, title: '' };
  const all = new Map();
  const stack = [root];
  const scope = () => stack[stack.length - 1];
  const state = (id, where = scope()) => {
    if (all.has(id)) return all.get(id);
    const s = { id, label: '', kind: 'state', description: '', scope: where, states: new Map(), transitions: [], initial: false, final: false };
    where.states.set(id, s);
    all.set(id, s);
    return s;
  };
  let inNote = false;
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    let m;
    if (inNote) { if (/^end\s+note$/i.test(line)) inNote = false; continue; }
    if (/^note\b/i.test(line)) { if (!line.includes(':')) inNote = true; continue; }
    if (/^(direction|classDef|class\s|style)\b/.test(line) || line === '--') continue;
    if ((m = /^title\s+(.*)$/.exec(line))) { ir.title = m[1].trim(); continue; }
    if (line === '}') { if (stack.length > 1) stack.pop(); continue; }
    if ((m = /^state\s+"([^"]*)"\s+as\s+([\wÀ-￿]+)\s*(\{)?$/.exec(line))) { const s = state(m[2]); s.label = m[1]; if (m[3]) stack.push(s); continue; }
    if ((m = /^state\s+([\wÀ-￿]+)\s*<<(choice|fork|join)>>$/.exec(line))) { state(m[1]).kind = m[2]; continue; }
    if ((m = /^state\s+([\wÀ-￿]+)\s*(\{)?$/.exec(line))) { const s = state(m[1]); if (m[2]) stack.push(s); continue; }
    if ((m = /^(\[\*\]|[\wÀ-￿]+)\s*-->\s*(\[\*\]|[\wÀ-￿]+)\s*(?::\s*(.*))?$/.exec(line))) {
      const here = scope();
      const from = m[1] === '[*]' ? (here.initial = true, '[*]start') : state(m[1]).id;
      const to = m[2] === '[*]' ? (here.final = true, '[*]end') : state(m[2]).id;
      here.transitions.push({ from, to, label: (m[3] ?? '').trim() });
      continue;
    }
    if ((m = /^([\wÀ-￿]+)\s*:\s*(.*)$/.exec(line))) { const s = state(m[1]); s.description = s.description ? `${s.description}\n${m[2]}` : m[2]; continue; }
    if ((m = /^([\wÀ-￿]+)$/.exec(line))) state(m[1]);
  }
  return ir;
}

function buildStateMachine(ir, { language = 'en', name = '' } = {}) {
  const add = adder(language);
  const owner = createElement('UMLStateMachine', { name: ir.title || name || 'StateMachine' });
  const diagram = insertElement(owner, createElement('UMLStatechartDiagram', { name: ir.title || name || 'Statechart', ownedViews: [] }, { language }));
  const elementOf = new Map();
  // Elements: scope by scope; [*] becomes an initial pseudostate / a final state per scope.
  const make = (scopeIr, container) => {
    const local = new Map();
    if (scopeIr.initial) local.set('[*]start', add(container, 'UMLPseudostate', { name: '', kind: 'initial' }));
    for (const s of scopeIr.states.values()) {
      const element = s.kind === 'state'
        ? add(container, 'UMLState', { name: s.label || s.id, ...(s.description ? { documentation: s.description } : {}) })
        : add(container, 'UMLPseudostate', { name: s.id, kind: s.kind });
      elementOf.set(s.id, element);
      local.set(s.id, element);
      if (s.states.size || s.transitions.length) make(s, element);
    }
    if (scopeIr.final) local.set('[*]end', add(container, 'UMLFinalState', { name: '' }));
    scopeIr.local = local;
    scopeIr.container = container;
    for (const t of scopeIr.transitions) {
      const a = local.get(t.from) ?? elementOf.get(t.from);
      const b = local.get(t.to) ?? elementOf.get(t.to);
      if (a && b) t.element = add(container, 'UMLTransition', { name: '', source: ref(a), target: ref(b), ...parseTransitionLabel(t.label) });
    }
  };
  make(ir.root, owner);
  const scopeOfElement = new Map();
  for (const sc of all(ir.root)) for (const el of sc.local?.values() ?? []) scopeOfElement.set(el._id, sc);
  // Views: each scope laid out in layers; a composite state's box holds its scope.
  const sizeOf = (el) => (el._type === 'UMLPseudostate' ? (el.kind === 'fork' || el.kind === 'join' ? { w: 80, h: 8 } : el.kind === 'choice' ? { w: 30, h: 30 } : { w: 20, h: 20 }) : el._type === 'UMLFinalState' ? { w: 24, h: 24 } : { w: Math.max(110, String(el.name).length * 8 + 40), h: 44 });
  const layout = (scopeIr) => {
    const items = [...scopeIr.local.entries()].map(([key, el]) => {
      const child = scopeIr.states.get(key);
      if (child?.local) { const inner = layout(child); return { id: el._id, el, inner, w: Math.max(sizeOf(el).w, inner.size.w + 40), h: inner.size.h + 60 }; }
      return { id: el._id, el, ...sizeOf(el) };
    });
    const lift = (id) => {
      // The element of this scope that holds id (id itself, or the composite state around it).
      let current = id;
      for (let sc = scopeOfElement.get(current); sc; sc = scopeOfElement.get(current)) {
        if (sc === scopeIr) return current;
        if (!sc.scope) return null;
        current = sc.scope.local.get(sc.id)?._id;
      }
      return null;
    };
    const edges = all(ir.root).flatMap((sc) => sc.transitions).filter((t) => t.element).map((t) => [lift(refId(t.element.source)), lift(refId(t.element.target))]).filter(([x, y]) => x && y);
    const placed = layered(items, edges, { gapX: 60, gapY: 60, wrap: 5 });
    return { items, placed, size: placed.extent };
  };
  const placeViews = (laid, x0, y0) => {
    for (const item of laid.items) {
      const p = laid.placed.get(item.id);
      const box = { x: x0 + p.x, y: y0 + p.y, w: item.inner ? item.w : (item.el._type === 'UMLState' ? 0 : item.w), h: item.inner ? item.h : (item.el._type === 'UMLState' ? 0 : item.h) };
      item.view = addView(diagram, createNodeView(`${item.el._type}View`, item.el._id, box));
      viewOf.set(item.el._id, item.view);
      if (item.inner) placeViews(item.inner, box.x + 20 + (item.w - 40 - item.inner.size.w) / 2, box.y + 44);
    }
  };
  const viewOf = new Map();
  placeViews(layout(ir.root), 40, 40);
  for (const t of all(ir.root).flatMap((s) => s.transitions)) {
    if (!t.element) continue;
    const a = viewOf.get(refId(t.element.source));
    const b = viewOf.get(refId(t.element.target));
    if (a && b) addView(diagram, createEdgeView('UMLTransitionView', t.element._id, a._id, b._id));
  }
  return { owner, diagram, kind: 'state' };
}

/** Every scope of a state IR (root first). */
function all(scope, out = []) {
  out.push(scope);
  for (const s of scope.states.values()) all(s, out);
  return out;
}

/**
 * Reads Mermaid text. Returns { owner, diagram, kind } — owner is a new element
 * (not in any project yet) holding everything that was created, diagram is the
 * one diagram inside it, kind is 'class'|'sequence'|'flowchart'|'er'|'state'.
 * Throws 'interop.unsupportedMermaid' (detail: the first line) for other kinds,
 * 'interop.empty' for empty text.
 */
export function importMermaid(text, { language = 'en', name = '' } = {}) {
  let lines = cleanLines(text);
  // Front matter (--- title: x ---) and directives.
  let title = '';
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    for (const l of lines.slice(1, end)) { const m = /^title:\s*(.*)$/.exec(l); if (m) title = unquote(m[1]); }
    lines = lines.slice(end + 1);
  }
  lines = lines.filter((l) => !/^%%\{.*\}%%$/.test(l));
  if (!lines.length) throw fail('interop.empty', '');
  const head = lines[0];
  const opts = { language, name: name || title };
  let result;
  if (/^classDiagram/.test(head)) result = buildClassModel(withTitle(parseClassDiagram(lines), title), opts);
  else if (/^sequenceDiagram/.test(head)) result = buildSequenceModel(withTitle(parseSequenceDiagram(lines), title), opts);
  else if (/^(flowchart|graph)\b/.test(head)) result = buildFlowchart(withTitle(parseFlowchart(lines), title), opts);
  else if (/^erDiagram/.test(head)) result = buildErModel(withTitle(parseErDiagram(lines), title), opts);
  else if (/^stateDiagram/.test(head)) result = buildStateMachine(withTitle(parseStateDiagram(lines), title), opts);
  else throw fail('interop.unsupportedMermaid', head);
  return result;
}
const withTitle = (ir, title) => { if (title && !ir.title) ir.title = title; return ir; };

// ───────────────────────── shared: reading a diagram

/**
 * What a diagram shows: { index, nodes: [{ view, element }], edges: [{ view, element, tail, head }], notes: [view] }.
 * tail/head are the elements (or null) at the ends of an edge view.
 */
export function diagramContent(project, diagram) {
  const index = buildIndex(project);
  const views = diagram?.ownedViews ?? [];
  const viewById = new Map(views.map((v) => [v._id, v]));
  const nodes = [];
  const edges = [];
  const notes = [];
  for (const view of views) {
    const element = view.model ? index.get(view.model) : null;
    if (view.tail || view.head) {
      const tv = viewById.get(refId(view.tail));
      const hv = viewById.get(refId(view.head));
      edges.push({ view, element, tail: tv?.model ? index.get(tv.model) : null, head: hv?.model ? index.get(hv.model) : null, tailView: tv, headView: hv });
    } else if (element) nodes.push({ view, element });
    else if (view._type === 'UMLNoteView' || view._type === 'UMLTextView') notes.push(view);
  }
  return { index, nodes, edges, notes };
}

/** Text of a type field (a string or a reference to a classifier). */
export function typeText(value, index) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return index.get(value)?.name ?? '';
}

/** Identifier-safe names, unique within one export (reserved words get a suffix). */
export function idMaker(reserved = []) {
  const used = new Map();
  const taken = new Set(reserved);
  return (key, label) => {
    if (used.has(key)) return used.get(key);
    let base = String(label ?? '').normalize('NFC').replace(/[^\wÀ-￿]/g, '_').replace(/^_+|_+$/g, '') || 'n';
    if (/^\d/.test(base)) base = `n${base}`;
    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = `${base}_${n}`;
    taken.add(id);
    used.set(key, id);
    return id;
  };
}

const viewTop = (v) => Number(v.top ?? 0);
const box = (v) => ({ x: Number(v.left ?? 0), y: Number(v.top ?? 0), w: Number(v.width ?? 0), h: Number(v.height ?? 0) });
const inside = (inner, outer) => outer.w > 0 && outer.h > 0 && inner.x >= outer.x && inner.y >= outer.y && inner.x + Math.max(inner.w, 1) <= outer.x + outer.w && inner.y + Math.max(inner.h, 1) <= outer.y + outer.h;

/** Sequence diagram as events: lifelines left to right and a tree of messages and fragments. */
export function sequenceTree(project, diagram) {
  const { index, nodes, edges } = diagramContent(project, diagram);
  const lifelines = nodes.filter((n) => n.element._type === 'UMLLifeline').sort((a, b) => a.view.left - b.view.left);
  const messages = edges.filter((e) => e.element?._type === 'UMLMessage').map((e) => ({ ...e, y: Number(e.view.y ?? 0) })).sort((a, b) => a.y - b.y);
  const fragments = nodes.filter((n) => n.element._type === 'UMLCombinedFragment').map((n) => ({ ...n, top: viewTop(n.view), bottom: viewTop(n.view) + Number(n.view.height || 0) }));
  const used = new Set();
  const block = (lo, hi) => {
    const candidates = fragments.filter((f) => !used.has(f) && f.top >= lo && f.bottom <= hi);
    const tops = candidates.filter((f) => !candidates.some((g) => g !== f && g.top <= f.top && g.bottom >= f.bottom && (g.bottom - g.top) > (f.bottom - f.top)));
    tops.forEach((f) => used.add(f));
    const items = [
      ...messages.filter((m) => m.y >= lo && m.y < hi && !tops.some((f) => m.y >= f.top && m.y <= f.bottom)).map((m) => ({ kind: 'message', y: m.y, ...m })),
      ...tops.map((f) => {
        const operands = f.element.operands?.length ? f.element.operands : [{ guard: '' }];
        const h = (f.bottom - f.top) / operands.length;
        return { kind: 'fragment', y: f.top, element: f.element, operator: f.element.interactionOperator || 'alt', operands: operands.map((o, i) => ({ guard: o.guard ?? '', items: block(f.top + i * h, f.top + (i + 1) * h) })) };
      }),
    ];
    return items.sort((a, b) => a.y - b.y);
  };
  return { index, lifelines, items: block(-Infinity, Infinity) };
}

/** The type a lifeline represents (UMLActor → actor). */
export function lifelineIsActor(lifeline, index) {
  const represent = index.get(lifeline.represent);
  const type = represent ? index.get(represent.type) : null;
  return type?._type === 'UMLActor';
}

/** States of a statechart diagram as a tree following the model (vertex → owning state). */
export function stateScopes(project, diagram) {
  const { index, nodes, edges } = diagramContent(project, diagram);
  const shown = new Set(nodes.map((n) => n.element._id));
  const scopeOf = (el) => {
    for (let owner = index.parent(el._id); owner; owner = index.parent(owner._id)) {
      if (owner._type === 'UMLState' && shown.has(owner._id)) return owner._id;
      if (owner._type === 'UMLStateMachine') return '';
    }
    return '';
  };
  const children = new Map([['', []]]);
  for (const n of nodes) {
    if (!/^UML(State|Pseudostate|FinalState|SubmachineState)$/.test(n.element._type)) continue;
    const scope = scopeOf(n.element);
    if (!children.has(scope)) children.set(scope, []);
    children.get(scope).push(n.element);
  }
  return { index, children, scopeOf, transitions: edges.filter((e) => e.element?._type === 'UMLTransition' && e.tail && e.head) };
}

/** "trigger [guard] / effect" of a transition. */
export function transitionLabel(t) {
  return [t.triggers || t.name || '', t.guard ? `[${t.guard}]` : '', t.effect ? `/ ${t.effect}` : ''].filter(Boolean).join(' ').trim();
}

// ───────────────────────── Mermaid: writing

const MERMAID_RESERVED = ['end', 'graph', 'subgraph', 'flowchart', 'class', 'classDef', 'style', 'click', 'default', 'state', 'note', 'direction', 'participant', 'actor', 'loop', 'alt', 'opt', 'par', 'and', 'else', 'rect', 'critical', 'break', 'title'];
const esc = (text) => String(text ?? '').replace(/"/g, '#quot;').replace(/\r?\n/g, '<br>');
const mg = (text) => String(text ?? '').replace(/</g, '~').replace(/>/g, '~');

function memberLines(element, index) {
  const out = [];
  for (const literal of element.literals ?? []) out.push(literal.name);
  for (const a of element.attributes ?? []) {
    const type = typeText(a.type, index);
    out.push(`${visibilityChar(a.visibility)}${type ? `${mg(type)} ` : ''}${a.name}${a.isStatic ? '$' : ''}`);
  }
  for (const o of element.operations ?? []) {
    const params = (o.parameters ?? []).filter((p) => p.direction !== 'return').map((p) => { const t = typeText(p.type, index); return t ? `${mg(t)} ${p.name}` : p.name; }).join(', ');
    const ret = (o.parameters ?? []).find((p) => p.direction === 'return');
    const rt = ret ? typeText(ret.type, index) : '';
    out.push(`${visibilityChar(o.visibility)}${o.name}(${params})${o.isAbstract ? '*' : o.isStatic ? '$' : ''}${rt ? ` ${mg(rt)}` : ''}`);
  }
  return out;
}

function mermaidClass(project, diagram) {
  const { index, nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(MERMAID_RESERVED);
  const out = ['classDiagram'];
  for (const { element } of nodes) {
    if (!element.name && !/Class|Interface|Enumeration|DataType|Signal|PrimitiveType/.test(element._type)) continue;
    const name = id(element._id, element.name);
    const label = name !== element.name ? `["${esc(element.name)}"]` : '';
    const members = memberLines(element, index);
    const annotation = element._type === 'UMLInterface' ? 'interface' : element._type === 'UMLEnumeration' ? 'enumeration' : element.isAbstract ? 'abstract' : typeof element.stereotype === 'string' && element.stereotype ? element.stereotype : element._type !== 'UMLClass' ? typeDef(element._type)?.keyword ?? '' : '';
    if (!members.length && !annotation) { out.push(`  class ${name}${label}`); continue; }
    out.push(`  class ${name}${label} {`);
    if (annotation) out.push(`    <<${annotation}>>`);
    for (const line of members) out.push(`    ${line}`);
    out.push('  }');
  }
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head) continue;
    const a = id(tail._id, tail.name);
    const b = id(head._id, head.name);
    const label = element.name ? ` : ${element.name}` : '';
    if (element._type === 'UMLGeneralization') out.push(`  ${b} <|-- ${a}${label}`);
    else if (/Realization$/.test(element._type)) out.push(`  ${b} <|.. ${a}${label}`);
    else if (typeDef(element._type)?.ends === 'directed') out.push(`  ${a} ..> ${b}${label}`);
    else if (typeDef(element._type)?.ends === 'association') {
      const e1 = element.end1 ?? {};
      const e2 = element.end2 ?? {};
      const [x, y] = refId(e1.reference) === tail._id ? [e1, e2] : [e2, e1];
      const lh = x.aggregation === 'composite' ? '*' : x.aggregation === 'shared' ? 'o' : x.navigable === 'navigable' ? '<' : '';
      const rh = y.aggregation === 'composite' ? '*' : y.aggregation === 'shared' ? 'o' : y.navigable === 'navigable' ? '>' : '';
      const lm = x.multiplicity ? `"${x.multiplicity}" ` : '';
      const rm = y.multiplicity ? ` "${y.multiplicity}"` : '';
      out.push(`  ${a} ${lm}${lh}--${rh}${rm} ${b}${label}`);
    }
  }
  return `${out.join('\n')}\n`;
}

const MERMAID_ARROW = { synchCall: '->>', asynchCall: '-)', asynchSignal: '-x', reply: '-->>', createMessage: '->>', deleteMessage: '->>' };
const OPERAND_WORD = { par: 'and', critical: 'option' };

function mermaidSequence(project, diagram) {
  const { index, lifelines, items } = sequenceTree(project, diagram);
  const id = idMaker(MERMAID_RESERVED);
  const out = ['sequenceDiagram'];
  for (const { element } of lifelines) {
    const name = id(element._id, element.name);
    out.push(`  ${lifelineIsActor(element, index) ? 'actor' : 'participant'} ${name}${name !== element.name ? ` as ${element.name}` : ''}`);
  }
  const emit = (list, indent) => {
    for (const item of list) {
      if (item.kind === 'message') {
        if (!item.tail || !item.head) continue;
        const to = id(item.head._id, item.head.name);
        if (item.element.messageSort === 'deleteMessage') out.push(`${indent}destroy ${to}`);
        out.push(`${indent}${id(item.tail._id, item.tail.name)}${MERMAID_ARROW[item.element.messageSort] ?? '->>'}${to}: ${item.element.name ?? ''}`.trimEnd());
      } else {
        const op = ['alt', 'opt', 'loop', 'par', 'critical', 'break'].includes(item.operator) ? item.operator : 'rect';
        item.operands.forEach((operand, i) => {
          out.push(`${indent}${i === 0 ? op : OPERAND_WORD[op] ?? 'else'}${operand.guard ? ` ${operand.guard}` : ''}`);
          emit(operand.items, `${indent}  `);
        });
        out.push(`${indent}end`);
      }
    }
  };
  emit(items, '  ');
  return `${out.join('\n')}\n`;
}

/** Flowchart node of an element: [open, close] by type. */
function flowShape(element) {
  const type = element._type;
  if (SHAPE_OF_TYPE[type]) return SHAPE_OF_TYPE[type];
  if (type === 'UMLActor') return ['((', '))'];
  if (type === 'UMLUseCase') return ['([', '])'];
  if (/Initial|Final/.test(type)) return ['((', '))'];
  if (/Decision|Merge/.test(type)) return ['{', '}'];
  if (/Fork|Join/.test(type)) return ['[[', ']]'];
  if (type === 'UMLAction') return ['(', ')'];
  return ['[', ']'];
}

function nodeLabel(element) {
  if (element.name) return element.name;
  if (element._type === 'UMLInitialNode') return 'start';
  if (/Final/.test(element._type)) return 'end';
  return '';
}

function mermaidFlow(project, diagram) {
  const { index, nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(MERMAID_RESERVED);
  const wide = nodes.length && (Math.max(...nodes.map((n) => n.view.left)) - Math.min(...nodes.map((n) => n.view.left))) > 1.5 * (Math.max(...nodes.map((n) => n.view.top)) - Math.min(...nodes.map((n) => n.view.top)));
  const out = [`flowchart ${wide ? 'LR' : 'TD'}`];
  const subjects = nodes.filter((n) => n.element._type === 'UMLUseCaseSubject');
  const inSubject = new Map();
  for (const s of subjects) for (const n of nodes) if (n !== s && inside(box(n.view), box(s.view))) inSubject.set(n, s);
  const nodeLine = (n) => { const [o, c] = flowShape(n.element); return `${id(n.element._id, n.element.name || n.element._type)}${o}"${esc(nodeLabel(n.element))}"${c}`; };
  for (const n of nodes) if (n.element._type !== 'UMLUseCaseSubject' && !inSubject.has(n)) out.push(`  ${nodeLine(n)}`);
  for (const s of subjects) {
    out.push(`  subgraph ${id(s.element._id, s.element.name || 'subject')}["${esc(s.element.name)}"]`);
    for (const n of nodes) if (inSubject.get(n) === s) out.push(`    ${nodeLine(n)}`);
    out.push('  end');
  }
  for (const { element, tail, head } of edges) {
    if (!element || !tail || !head) continue;
    const a = id(tail._id, tail.name || tail._type);
    const b = id(head._id, head.name || head._type);
    const type = element._type;
    let link = '-->';
    let text = element.name || element.guard || '';
    if (type === 'UMLAssociation') link = '---';
    else if (type === 'UMLInclude') { link = '-.->'; text = 'include'; } else if (type === 'UMLExtend') { link = '-.->'; text = 'extend'; } else if (type === 'UMLGeneralization') { link = '==>'; } else if (typeDef(type)?.line === 'dash') link = '-.->';
    out.push(`  ${a} ${link}${text ? `|"${esc(text)}"|` : ''} ${b}`);
  }
  return `${out.join('\n')}\n`;
}

const ER_LEFT_OF = { 1: '||', '0..1': '|o', '0..*': '}o', '1..*': '}|' };
const ER_RIGHT_OF = { 1: '||', '0..1': 'o|', '0..*': 'o{', '1..*': '|{' };

function mermaidEr(project, diagram) {
  const { nodes, edges } = diagramContent(project, diagram);
  const id = idMaker(MERMAID_RESERVED);
  const out = ['erDiagram'];
  for (const { element } of nodes) {
    if (element._type !== 'ERDEntity') continue;
    const name = id(element._id, element.name);
    out.push(`  ${name}${name !== element.name ? `["${esc(element.name)}"]` : ''} {`);
    for (const c of element.columns ?? []) {
      const keys = [c.primaryKey && 'PK', c.foreignKey && 'FK', c.unique && !c.primaryKey && 'UK'].filter(Boolean).join(', ');
      const type = String(c.type || 'string').replace(/\s+/g, '_') + (c.length ? `(${c.length})` : '');
      out.push(`    ${type} ${String(c.name).replace(/\s+/g, '_')}${keys ? ` ${keys}` : ''}${c.documentation ? ` "${String(c.documentation).replace(/"/g, "'")}"` : ''}`);
    }
    out.push('  }');
  }
  for (const { element, tail, head } of edges) {
    if (element?._type !== 'ERDRelationship' || !tail || !head) continue;
    const [x, y] = refId(element.end1?.reference) === tail._id ? [element.end1, element.end2] : [element.end2, element.end1];
    out.push(`  ${id(tail._id, tail.name)} ${ER_LEFT_OF[x?.cardinality] ?? '||'}${element.identifying === false ? '..' : '--'}${ER_RIGHT_OF[y?.cardinality] ?? '||'} ${id(head._id, head.name)} : "${String(element.name ?? '').replace(/"/g, "'")}"`);
  }
  return `${out.join('\n')}\n`;
}

function mermaidState(project, diagram) {
  const { children, scopeOf, transitions } = stateScopes(project, diagram);
  const id = idMaker(MERMAID_RESERVED);
  const out = ['stateDiagram-v2'];
  const ref_ = (el, asSource) => (el._type === 'UMLPseudostate' && el.kind === 'initial' && asSource) || (el._type === 'UMLFinalState' && !asSource) ? '[*]' : id(el._id, el.name || el._type);
  const scopedT = (scope) => transitions.filter(({ tail, head }) => {
    const special = (tail._type === 'UMLPseudostate' && tail.kind === 'initial') ? tail : head._type === 'UMLFinalState' ? head : null;
    if (special) return scopeOf(special) === scope;
    const a = scopeOf(tail);
    return (a === scopeOf(head) ? a : '') === scope;
  });
  const emit = (scope, indent) => {
    for (const el of children.get(scope) ?? []) {
      if (el._type === 'UMLPseudostate' && el.kind === 'initial') continue;
      if (el._type === 'UMLFinalState') continue;
      const name = id(el._id, el.name || el._type);
      if (el._type === 'UMLPseudostate') { out.push(`${indent}state ${name} <<${['choice', 'fork', 'join'].includes(el.kind) ? el.kind : 'choice'}>>`); continue; }
      const label = name !== el.name && el.name ? `"${el.name.replace(/"/g, "'")}" as ` : '';
      if (children.get(el._id)?.length) {
        out.push(`${indent}state ${label}${name} {`);
        emit(el._id, `${indent}  `);
        out.push(`${indent}}`);
      } else if (label) out.push(`${indent}state ${label}${name}`);
      else out.push(`${indent}${name}`);
    }
    for (const { element, tail, head } of scopedT(scope)) {
      const text = transitionLabel(element);
      out.push(`${indent}${ref_(tail, true)} --> ${ref_(head, false)}${text ? ` : ${text}` : ''}`);
    }
  };
  emit('', '  ');
  return `${out.join('\n')}\n`;
}

/**
 * A diagram as Mermaid text. Class, sequence, flowchart, ER, statechart; use
 * case and activity diagrams are written as flowcharts.
 * Throws 'interop.unsupportedDiagram' (detail: the diagram type).
 */
export function exportMermaid(project, diagram) {
  switch (diagram?._type) {
    case 'UMLClassDiagram': case 'UMLPackageDiagram': return mermaidClass(project, diagram);
    case 'UMLSequenceDiagram': return mermaidSequence(project, diagram);
    case 'FCFlowchartDiagram': case 'UMLUseCaseDiagram': case 'UMLActivityDiagram': return mermaidFlow(project, diagram);
    case 'ERDDiagram': return mermaidEr(project, diagram);
    case 'UMLStatechartDiagram': return mermaidState(project, diagram);
    default: throw fail('interop.unsupportedDiagram', diagram?._type ?? '');
  }
}
