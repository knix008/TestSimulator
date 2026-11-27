// JSON Canvas 1.0 (Obsidian `.canvas`): parse, repair, write back, plus the geometry the canvas
// view needs (bounds, edge anchors and curves, hit tests) and an Undo stack of snapshots.
// Pure: no DOM. Unknown fields on the document, nodes and edges are kept when writing.

export const NODE_TYPES = ['text', 'file', 'link', 'group'];
export const SIDES = ['top', 'right', 'bottom', 'left'];
export const ENDS = ['none', 'arrow'];
/** Preset colours "1"…"6" of JSON Canvas, by name (the view maps them to --tone-*). */
export const PRESET_COLORS = { 1: 'red', 2: 'orange', 3: 'yellow', 4: 'green', 5: 'cyan', 6: 'purple' };
export const GRID = 10;
export const DEFAULT_SIZE = {
  text: { width: 260, height: 80 },
  file: { width: 400, height: 400 },
  link: { width: 400, height: 140 },
  group: { width: 600, height: 400 },
};
export const MIN_SIZE = { width: 60, height: 40 };

/** A new id: 16 lowercase hex characters, like Obsidian's. */
export function newId(random = Math.random) {
  const bytes = new Uint8Array(8);
  if (random === Math.random && globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(random() * 256) & 255;
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True for "1"…"6" or "#rgb"/"#rrggbb". */
export function isValidColor(value) {
  if (typeof value !== 'string') return false;
  return /^[1-6]$/.test(value) || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

/** { preset: 'red' } for "1"…"6", { hex: '#rrggbb' } for a custom colour, null for none. */
export function colorInfo(value) {
  if (!isValidColor(value)) return null;
  if (PRESET_COLORS[value]) return { preset: PRESET_COLORS[value] };
  let hex = value.toLowerCase();
  if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return { hex };
}

const num = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback);
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

/** Repairs one node in place-free fashion: returns a new object that keeps unknown fields. */
export function normalizeNode(raw, usedIds = new Set()) {
  const node = { ...raw };
  if (typeof node.id !== 'string' || !node.id || usedIds.has(node.id)) node.id = uniqueId(usedIds);
  usedIds.add(node.id);
  if (!NODE_TYPES.includes(node.type)) node.type = typeof node.type === 'string' && node.type ? node.type : 'text';
  const size = DEFAULT_SIZE[node.type] ?? DEFAULT_SIZE.text;
  node.x = Math.round(num(node.x, 0));
  node.y = Math.round(num(node.y, 0));
  node.width = Math.max(1, Math.round(num(node.width, size.width)));
  node.height = Math.max(1, Math.round(num(node.height, size.height)));
  if ('color' in node && !isValidColor(node.color)) delete node.color;
  if (node.type === 'text' && typeof node.text !== 'string') node.text = node.text == null ? '' : String(node.text);
  if (node.type === 'file') {
    if (typeof node.file !== 'string') node.file = node.file == null ? '' : String(node.file);
    if ('subpath' in node && (typeof node.subpath !== 'string' || !node.subpath)) delete node.subpath;
  }
  if (node.type === 'link' && typeof node.url !== 'string') node.url = node.url == null ? '' : String(node.url);
  if (node.type === 'group') {
    if ('label' in node && typeof node.label !== 'string') node.label = String(node.label ?? '');
    if ('background' in node && typeof node.background !== 'string') delete node.background;
    if ('backgroundStyle' in node && !['cover', 'ratio', 'repeat'].includes(node.backgroundStyle)) delete node.backgroundStyle;
  }
  return node;
}

/** Repairs one edge; returns null when it does not name two nodes. */
export function normalizeEdge(raw, usedIds = new Set()) {
  if (!isObject(raw) || typeof raw.fromNode !== 'string' || typeof raw.toNode !== 'string') return null;
  const edge = { ...raw };
  if (typeof edge.id !== 'string' || !edge.id || usedIds.has(edge.id)) edge.id = uniqueId(usedIds);
  usedIds.add(edge.id);
  for (const key of ['fromSide', 'toSide']) if (key in edge && !SIDES.includes(edge[key])) delete edge[key];
  for (const key of ['fromEnd', 'toEnd']) if (key in edge && !ENDS.includes(edge[key])) delete edge[key];
  if ('color' in edge && !isValidColor(edge.color)) delete edge.color;
  if ('label' in edge && typeof edge.label !== 'string') edge.label = String(edge.label ?? '');
  return edge;
}

function uniqueId(usedIds) {
  let id;
  do id = newId(); while (usedIds.has(id));
  return id;
}

/** An empty canvas document. */
export const emptyCanvas = () => ({ nodes: [], edges: [] });

/**
 * Parses a .canvas file. Empty text → empty canvas. Throws on invalid JSON or a non-object.
 * Edges whose end nodes are missing are kept (the view skips them) so nothing is lost.
 */
export function parseCanvas(text) {
  if (text == null || !String(text).trim()) return emptyCanvas();
  const data = JSON.parse(String(text).replace(/^﻿/, ''));
  if (!isObject(data)) throw new Error('Canvas file is not a JSON object');
  return normalizeCanvas(data);
}

export function normalizeCanvas(data) {
  const doc = { ...data };
  const used = new Set();
  doc.nodes = (Array.isArray(data.nodes) ? data.nodes : []).filter(isObject).map((n) => normalizeNode(n, used));
  doc.edges = (Array.isArray(data.edges) ? data.edges : []).map((e) => normalizeEdge(e, used)).filter(Boolean);
  return doc;
}

/** Writes the document the way Obsidian does: tab indent, one node / edge per line. */
export function serializeCanvas(doc) {
  const nodes = (doc.nodes ?? []).map((n) => `\t\t${JSON.stringify(n)}`).join(',\n');
  const edges = (doc.edges ?? []).map((e) => `\t\t${JSON.stringify(e)}`).join(',\n');
  const extra = Object.entries(doc).filter(([key, value]) => key !== 'nodes' && key !== 'edges' && value !== undefined);
  const parts = [
    `\t"nodes":[${nodes ? `\n${nodes}\n\t` : ''}]`,
    `\t"edges":[${edges ? `\n${edges}\n\t` : ''}]`,
    ...extra.map(([key, value]) => `\t${JSON.stringify(key)}:${JSON.stringify(value)}`),
  ];
  return `{\n${parts.join(',\n')}\n}\n`;
}

/** Edge end with the JSON Canvas defaults: fromEnd 'none', toEnd 'arrow'. */
export const edgeEnd = (edge, which) => edge?.[`${which}End`] ?? (which === 'to' ? 'arrow' : 'none');

/** 'none' | 'to' | 'both' | 'from' — the arrow direction of an edge. */
export function edgeDirection(edge) {
  const from = edgeEnd(edge, 'from') === 'arrow';
  const to = edgeEnd(edge, 'to') === 'arrow';
  return from && to ? 'both' : to ? 'to' : from ? 'from' : 'none';
}

/** Sets fromEnd / toEnd for a direction; leaves defaults out of the file. */
export function setEdgeDirection(edge, direction) {
  const from = direction === 'both' || direction === 'from';
  const to = direction === 'both' || direction === 'to';
  if (from) edge.fromEnd = 'arrow'; else delete edge.fromEnd;
  if (to) delete edge.toEnd; else edge.toEnd = 'none';
  return edge;
}

// ───────── creating nodes

/** A new node of `type` with the given fields; x / y name its top-left corner. */
export function makeNode(type, fields = {}) {
  const size = DEFAULT_SIZE[type] ?? DEFAULT_SIZE.text;
  const node = { id: fields.id ?? newId(), type };
  if (type === 'text') node.text = fields.text ?? '';
  if (type === 'file') { node.file = fields.file ?? ''; if (fields.subpath) node.subpath = fields.subpath; }
  if (type === 'link') node.url = fields.url ?? '';
  if (type === 'group' && fields.label != null) node.label = fields.label;
  node.x = Math.round(fields.x ?? 0);
  node.y = Math.round(fields.y ?? 0);
  node.width = Math.round(fields.width ?? size.width);
  node.height = Math.round(fields.height ?? size.height);
  if (isValidColor(fields.color)) node.color = fields.color;
  return node;
}

export function makeEdge(fromNode, fromSide, toNode, toSide, fields = {}) {
  const edge = { id: fields.id ?? newId(), fromNode };
  if (SIDES.includes(fromSide)) edge.fromSide = fromSide;
  edge.toNode = toNode;
  if (SIDES.includes(toSide)) edge.toSide = toSide;
  for (const key of ['fromEnd', 'toEnd', 'color', 'label']) if (fields[key] != null) edge[key] = fields[key];
  return edge;
}

/**
 * Copies the nodes with `ids` (and the edges between them) with fresh ids, moved by dx / dy.
 * Returns { nodes, edges } ready to append.
 */
export function cloneSubset(doc, ids, dx = 0, dy = 0) {
  const wanted = new Set(ids);
  const map = new Map();
  const nodes = [];
  for (const node of doc.nodes) {
    if (!wanted.has(node.id)) continue;
    const copy = structuredCloneSafe(node);
    copy.id = newId();
    copy.x += dx;
    copy.y += dy;
    map.set(node.id, copy.id);
    nodes.push(copy);
  }
  const edges = [];
  for (const edge of doc.edges ?? []) {
    if (!map.has(edge.fromNode) || !map.has(edge.toNode)) continue;
    const copy = structuredCloneSafe(edge);
    copy.id = newId();
    copy.fromNode = map.get(edge.fromNode);
    copy.toNode = map.get(edge.toNode);
    edges.push(copy);
  }
  return { nodes, edges };
}

const structuredCloneSafe = (value) => JSON.parse(JSON.stringify(value));

/** Removes nodes and edges by id; edges touching a removed node go too. */
export function removeItems(doc, ids) {
  const gone = new Set(ids);
  doc.nodes = doc.nodes.filter((n) => !gone.has(n.id));
  const alive = new Set(doc.nodes.map((n) => n.id));
  doc.edges = doc.edges.filter((e) => !gone.has(e.id) && alive.has(e.fromNode) && alive.has(e.toNode));
  return doc;
}

// ───────── geometry

export const snap = (value, grid = GRID) => Math.round(value / grid) * grid;
export const center = (n) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });

/** The bounding box of nodes, or null for none. */
export function boundsOf(nodes) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

/** The point in the middle of a node's side. */
export function anchorPoint(node, side) {
  switch (side) {
    case 'top': return { x: node.x + node.width / 2, y: node.y };
    case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left': return { x: node.x, y: node.y + node.height / 2 };
    default: return { x: node.x + node.width, y: node.y + node.height / 2 };
  }
}

export const sideNormal = (side) => ({ top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } })[side] ?? { x: 1, y: 0 };

/** The side of `node` whose middle is closest to point `p`. */
export function nearestSide(node, p) {
  let best = 'right';
  let bestDistance = Infinity;
  for (const side of SIDES) {
    const a = anchorPoint(node, side);
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < bestDistance) { bestDistance = d; best = side; }
  }
  return best;
}

/** Sides for an edge without stored sides: the pair facing each other. */
export function autoSides(from, to) {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) * (from.height + to.height) >= Math.abs(dy) * (from.width + to.width)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/**
 * The cubic curve of an edge between two nodes: { p0, c1, c2, p3, fromSide, toSide }.
 * `to` may also be a bare point { x, y } (a connection being drawn); then toSide may be null.
 */
export function edgeCurve(from, fromSide, to, toSide) {
  const isPoint = to.width == null;
  let [fs, ts] = isPoint ? [fromSide ?? nearestSide(from, to), toSide] : autoSides(from, to);
  if (fromSide) fs = fromSide;
  if (toSide && !isPoint) ts = toSide;
  const p0 = anchorPoint(from, fs);
  const p3 = isPoint ? { x: to.x, y: to.y } : anchorPoint(to, ts);
  const distance = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const reach = Math.max(30, Math.min(220, distance * 0.45));
  const n0 = sideNormal(fs);
  const c1 = { x: p0.x + n0.x * reach, y: p0.y + n0.y * reach };
  let c2;
  if (ts) { const n3 = sideNormal(ts); c2 = { x: p3.x + n3.x * reach, y: p3.y + n3.y * reach }; } else c2 = { x: p3.x, y: p3.y };
  return { p0, c1, c2, p3, fromSide: fs, toSide: ts ?? null };
}

/** The point at t (0…1) on a curve from edgeCurve. */
export function curvePoint(c, t) {
  const u = 1 - t;
  const a = u * u * u; const b = 3 * u * u * t; const d = 3 * u * t * t; const e = t * t * t;
  return { x: a * c.p0.x + b * c.c1.x + d * c.c2.x + e * c.p3.x, y: a * c.p0.y + b * c.c1.y + d * c.c2.y + e * c.p3.y };
}

/** The SVG path data of a curve. */
export const curvePath = (c) => `M${r(c.p0.x)},${r(c.p0.y)} C${r(c.c1.x)},${r(c.c1.y)} ${r(c.c2.x)},${r(c.c2.y)} ${r(c.p3.x)},${r(c.p3.y)}`;
const r = (v) => Math.round(v * 10) / 10;

/** Unit direction the curve travels in at its end (`'to'`) or leaves its start backwards (`'from'`). */
export function curveDirection(c, which) {
  const [tip, prev] = which === 'from' ? [c.p0, curvePoint(c, 0.04)] : [c.p3, curvePoint(c, 0.96)];
  const dx = tip.x - prev.x; const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** The three points of an arrowhead whose tip is at the curve's `which` end. */
export function arrowHead(c, which, size = 12) {
  const tip = which === 'from' ? c.p0 : c.p3;
  const d = curveDirection(c, which);
  const back = { x: tip.x - d.x * size, y: tip.y - d.y * size };
  const half = size * 0.5;
  return [tip, { x: back.x - d.y * half, y: back.y + d.x * half }, { x: back.x + d.y * half, y: back.y - d.x * half }];
}

/** Shortest distance from p to the curve (sampled). */
export function distanceToCurve(c, p, steps = 40) {
  let best = Infinity;
  let prev = curvePoint(c, 0);
  for (let i = 1; i <= steps; i++) {
    const next = curvePoint(c, i / steps);
    best = Math.min(best, distanceToSegment(p, prev, next));
    prev = next;
  }
  return best;
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export const containsPoint = (n, p) => p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height;
export const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
export const containsRect = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** The topmost node under p: cards before groups, later (front) before earlier; smaller groups first. */
export function hitNode(nodes, p, exceptId = null) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n.type !== 'group' && n.id !== exceptId && containsPoint(n, p)) return n;
  }
  const groups = nodes.filter((n) => n.type === 'group' && n.id !== exceptId && containsPoint(n, p));
  groups.sort((a, b) => a.width * a.height - b.width * b.height);
  return groups[0] ?? null;
}

/** Nodes picked by a selection rectangle: cards that touch it, groups wholly inside it. */
export function nodesInRect(nodes, rect) {
  return nodes.filter((n) => (n.type === 'group' ? containsRect(rect, n) : intersects(rect, n)));
}

/** Nodes lying wholly inside a group (nested groups and their contents included). */
export function nodesInGroup(nodes, group) {
  return nodes.filter((n) => n.id !== group.id && containsRect(group, n));
}

/** Rectangle from two corner points. */
export function rectFromPoints(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/**
 * The view transform that fits `bounds` into a viewport of width × height:
 * { x, y, scale } with screen = world · scale + (x, y).
 */
export function fitView(bounds, width, height, { padding = 60, maxScale = 1, minScale = 0.1 } = {}) {
  if (!bounds || width <= 0 || height <= 0) return { x: width / 2, y: height / 2, scale: 1 };
  const scale = Math.max(minScale, Math.min(maxScale, (width - padding * 2) / Math.max(1, bounds.width), (height - padding * 2) / Math.max(1, bounds.height)));
  return {
    x: width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: height / 2 - (bounds.y + bounds.height / 2) * scale,
    scale,
  };
}

/** Zooms view by factor around screen point (sx, sy). */
export function zoomViewAt(view, factor, sx, sy, minScale = 0.1, maxScale = 4) {
  const scale = Math.max(minScale, Math.min(maxScale, view.scale * factor));
  const k = scale / view.scale;
  return { x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k, scale };
}

/** Rectangle after dragging a resize handle (`dir` among n s e w ne nw se sw) by dx / dy. */
export function resizeRect(start, dir, dx, dy, { grid = 0, min = MIN_SIZE } = {}) {
  let left = start.x; let top = start.y; let right = start.x + start.width; let bottom = start.y + start.height;
  const g = (v) => (grid ? snap(v, grid) : v);
  if (dir.includes('w')) left = Math.min(g(left + dx), right - min.width);
  if (dir.includes('e')) right = Math.max(g(right + dx), left + min.width);
  if (dir.includes('n')) top = Math.min(g(top + dy), bottom - min.height);
  if (dir.includes('s')) bottom = Math.max(g(bottom + dy), top + min.height);
  return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
}

// ───────── file cards

/**
 * The part of a note a file node's subpath names: "#Heading" (to the next heading of the same or a
 * higher level; "#A#B" walks nested headings) or "#^block" (the paragraph carrying that block id).
 * Returns the whole text when nothing matches.
 */
export function extractSection(text, subpath) {
  if (!subpath || typeof text !== 'string') return text ?? '';
  const lines = text.split(/\r?\n/);
  const parts = subpath.replace(/^#/, '').split('#').filter(Boolean);
  if (!parts.length) return text;
  if (parts[0].startsWith('^')) {
    const id = parts[0].slice(1);
    const at = lines.findIndex((line) => new RegExp(`\\s\\^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(line));
    if (at < 0) return text;
    let start = at; while (start > 0 && lines[start - 1].trim()) start--;
    return lines.slice(start, at + 1).join('\n').replace(/\s\^[\w-]+\s*$/, '');
  }
  let from = 0; let to = lines.length; let found = false;
  for (const part of parts) {
    const want = part.trim().toLowerCase();
    let hit = -1; let level = 0;
    for (let i = from; i < to; i++) {
      const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
      if (m && m[2].trim().toLowerCase() === want) { hit = i; level = m[1].length; break; }
    }
    if (hit < 0) return found ? lines.slice(from, to).join('\n') : text;
    let end = to;
    for (let i = hit + 1; i < to; i++) { const m = /^(#{1,6})\s/.exec(lines[i]); if (m && m[1].length <= level) { end = i; break; } }
    from = hit; to = end; found = true;
  }
  return lines.slice(from, to).join('\n').trimEnd();
}

/** The file name (no folders) of a vault path. */
export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() || String(path ?? '');

// ───────── Undo

/** Undo stack of JSON snapshots. push() after each change; undo()/redo() return the snapshot to show. */
export class CanvasHistory {
  constructor(limit = 200) { this.limit = limit; this.reset(null); }

  reset(doc) {
    this.stack = doc == null ? [] : [JSON.stringify(doc)];
    this.index = this.stack.length - 1;
  }

  /** Records `doc` as the newest state (ignored when equal to the current one). Returns true when stored. */
  push(doc) {
    const snap = JSON.stringify(doc);
    if (this.stack[this.index] === snap) return false;
    this.stack.splice(this.index + 1);
    this.stack.push(snap);
    if (this.stack.length > this.limit) this.stack.splice(0, this.stack.length - this.limit);
    this.index = this.stack.length - 1;
    return true;
  }

  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }
  undo() { if (!this.canUndo) return null; this.index--; return JSON.parse(this.stack[this.index]); }
  redo() { if (!this.canRedo) return null; this.index++; return JSON.parse(this.stack[this.index]); }
}
