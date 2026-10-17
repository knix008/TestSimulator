// Automatic layout (Visio "Re-Layout Page"): places the connected shapes of a
// page as a flowchart (layered, top-down or left-right), a tree (org chart),
// radially around a root, on a circle, or on a grid. Shapes are taken as
// top-level boxes (a group moves as one); containers, text and line shapes
// keep their place. Connectors lose their manual bends so they route again.
// Pure (unit-tested).
import { connectionGraph, findShape, isConnector, isGroup, moveShapes, refreshGroups, topLevel } from './diagram.js';
import { masterById } from './stencils.js';

export const LAYOUTS = ['flowTB', 'flowLR', 'treeTB', 'treeLR', 'radial', 'circular', 'grid'];

/** The shapes a layout moves: top-level, not containers, text, line shapes or connectors. */
export function layoutNodes(page, ids = null) {
  const set = ids ? new Set(ids.map((id) => topLevel(page, id)?.id)) : null;
  const seen = new Set();
  const out = [];
  for (const shape of page.shapes) {
    if (isConnector(shape) || shape.groupId) continue;
    if (set && !set.has(shape.id)) continue;
    const master = isGroup(shape) ? null : masterById(shape.master);
    if (master && ['container', 'text', 'lineShape', 'annotation'].includes(master.kind)) continue;
    if (seen.has(shape.id)) continue;
    seen.add(shape.id);
    out.push(shape);
  }
  return out;
}

/** Breaks cycles (depth-first, back edges reversed) so the graph can be layered. */
function acyclic(nodes, edges) {
  const out = new Map(nodes.map((node) => [node.id, []]));
  for (const e of edges) out.get(e.from)?.push(e);
  const state = new Map();
  const result = [];
  const visit = (id) => {
    state.set(id, 1);
    for (const e of out.get(id) ?? []) {
      const s = state.get(e.to);
      if (s === 1) result.push({ from: e.to, to: e.from, id: e.id, reversed: true });
      else { result.push(e); if (!s) visit(e.to); }
    }
    state.set(id, 2);
  };
  // Start from shapes nothing points to, in reading order.
  const incoming = new Set(edges.map((e) => e.to));
  for (const node of [...nodes].sort((a, b) => (incoming.has(a.id) - incoming.has(b.id)) || a.y - b.y || a.x - b.x)) if (!state.get(node.id)) visit(node.id);
  return result;
}

/** Layered layout: longest-path layers, barycentre ordering, centred rows. */
function layered(nodes, edges, { horizontal, gapX, gapY, origin }) {
  const dag = acyclic(nodes, edges);
  const layer = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of dag) if (layer.get(e.to) < layer.get(e.from) + 1) { layer.set(e.to, layer.get(e.from) + 1); changed = true; }
    if (!changed) break;
  }
  const count = Math.max(0, ...layer.values()) + 1;
  const rows = Array.from({ length: count }, () => []);
  const sortKey = (node) => (horizontal ? node.y : node.x);
  for (const node of [...nodes].sort((a, b) => sortKey(a) - sortKey(b))) rows[layer.get(node.id)].push(node);
  const preds = new Map(nodes.map((node) => [node.id, []]));
  const succs = new Map(nodes.map((node) => [node.id, []]));
  for (const e of dag) { preds.get(e.to)?.push(e.from); succs.get(e.from)?.push(e.to); }
  const position = () => new Map(rows.flatMap((row) => row.map((node, i) => [node.id, i])));
  for (let sweep = 0; sweep < 6; sweep++) {
    const pos = position();
    const down = sweep % 2 === 0;
    for (let r = down ? 1 : count - 2; down ? r < count : r >= 0; r += down ? 1 : -1) {
      const near = down ? preds : succs;
      const bary = (node) => { const list = near.get(node.id).map((id) => pos.get(id)).filter((v) => v != null); return list.length ? list.reduce((a, b) => a + b, 0) / list.length : pos.get(node.id); };
      rows[r].sort((a, b) => bary(a) - bary(b));
      rows[r].forEach((node, i) => pos.set(node.id, i));
    }
  }
  const sizeAlong = (node) => (horizontal ? node.h : node.w);
  const sizeAcross = (node) => (horizontal ? node.w : node.h);
  const rowWidths = rows.map((row) => row.reduce((sum, node) => sum + sizeAlong(node), 0) + Math.max(0, row.length - 1) * gapX);
  const widest = Math.max(0, ...rowWidths);
  const targets = new Map();
  let across = 0;
  rows.forEach((row, r) => {
    const thick = Math.max(0, ...row.map(sizeAcross));
    let along = (widest - rowWidths[r]) / 2;
    for (const node of row) {
      const a = along;
      const b = across + (thick - sizeAcross(node)) / 2;
      targets.set(node.id, horizontal ? { x: origin.x + b, y: origin.y + a } : { x: origin.x + a, y: origin.y + b });
      along += sizeAlong(node) + gapX;
    }
    across += thick + gapY;
  });
  return targets;
}

/** Tidy tree: each subtree as wide as its children, parents centred above them. */
function tree(nodes, edges, { horizontal, gapX, gapY, origin }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map(nodes.map((node) => [node.id, []]));
  const hasParent = new Set();
  for (const e of acyclic(nodes, edges)) {
    if (hasParent.has(e.to) || !byId.has(e.to) || !byId.has(e.from)) continue;
    hasParent.add(e.to);
    children.get(e.from).push(e.to);
  }
  const along = (node) => (horizontal ? node.h : node.w);
  const across = (node) => (horizontal ? node.w : node.h);
  for (const list of children.values()) list.sort((a, b) => (horizontal ? byId.get(a).y - byId.get(b).y : byId.get(a).x - byId.get(b).x));
  const width = new Map();
  const measure = (id) => {
    const kids = children.get(id);
    const own = along(byId.get(id));
    const sum = kids.reduce((total, kid) => total + measure(kid), 0) + Math.max(0, kids.length - 1) * gapX;
    width.set(id, Math.max(own, sum));
    return width.get(id);
  };
  const depthSize = [];
  const depths = (id, d) => { depthSize[d] = Math.max(depthSize[d] ?? 0, across(byId.get(id))); for (const kid of children.get(id)) depths(kid, d + 1); };
  const roots = nodes.filter((node) => !hasParent.has(node.id)).sort((a, b) => (horizontal ? a.y - b.y : a.x - b.x));
  for (const root of roots) { measure(root.id); depths(root.id, 0); }
  const offsets = [0];
  for (let d = 1; d <= depthSize.length; d++) offsets[d] = offsets[d - 1] + (depthSize[d - 1] ?? 0) + gapY;
  const targets = new Map();
  const place = (id, start, d) => {
    const node = byId.get(id);
    const w = width.get(id);
    const a = start + (w - along(node)) / 2;
    const b = offsets[d] + ((depthSize[d] ?? 0) - across(node)) / 2;
    targets.set(id, horizontal ? { x: origin.x + b, y: origin.y + a } : { x: origin.x + a, y: origin.y + b });
    const kids = children.get(id);
    const total = kids.reduce((sum, kid) => sum + width.get(kid), 0) + Math.max(0, kids.length - 1) * gapX;
    let at = start + (w - total) / 2;
    for (const kid of kids) { place(kid, at, d + 1); at += width.get(kid) + gapX; }
  };
  let start = 0;
  for (const root of roots) { place(root.id, start, 0); start += width.get(root.id) + gapX * 2; }
  return targets;
}

/** Radial: the most connected shape in the middle, each level on a wider ring. */
function radial(nodes, edges, { gapX, gapY, origin }) {
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const e of edges) { degree.set(e.from, (degree.get(e.from) ?? 0) + 1); degree.set(e.to, (degree.get(e.to) ?? 0) + 1); }
  const adj = new Map(nodes.map((node) => [node.id, []]));
  for (const e of edges) { adj.get(e.from)?.push(e.to); adj.get(e.to)?.push(e.from); }
  const root = [...nodes].sort((a, b) => degree.get(b.id) - degree.get(a.id))[0];
  const parent = new Map([[root.id, null]]);
  const order = [root.id];
  for (let i = 0; i < order.length; i++) for (const next of adj.get(order[i])) if (!parent.has(next)) { parent.set(next, order[i]); order.push(next); }
  for (const node of nodes) if (!parent.has(node.id)) { parent.set(node.id, root.id); order.push(node.id); }
  const kids = new Map(nodes.map((node) => [node.id, []]));
  for (const [id, p] of parent) if (p) kids.get(p).push(id);
  const leaves = new Map();
  const countLeaves = (id) => { const k = kids.get(id); leaves.set(id, k.length ? k.reduce((s, c) => s + countLeaves(c), 0) : 1); return leaves.get(id); };
  countLeaves(root.id);
  const biggest = Math.max(...nodes.map((node) => Math.max(node.w, node.h)));
  const ring = biggest + Math.max(gapX, gapY) * 1.3;
  const centre = { x: origin.x + ring * 3, y: origin.y + ring * 3 };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const targets = new Map();
  const place = (id, depth, a0, a1) => {
    const node = byId.get(id);
    const a = (a0 + a1) / 2;
    const r = depth * ring;
    targets.set(id, { x: centre.x + Math.cos(a) * r - node.w / 2, y: centre.y + Math.sin(a) * r - node.h / 2 });
    let at = a0;
    for (const kid of kids.get(id)) { const span = ((a1 - a0) * leaves.get(kid)) / leaves.get(id); place(kid, depth + 1, at, at + span); at += span; }
  };
  place(root.id, 0, -Math.PI / 2, Math.PI * 1.5);
  return normalizeOrigin(targets, byId, origin);
}

/** Circle: shapes in connection order around a ring big enough for them. */
function circular(nodes, edges, { gapX, origin }) {
  const adj = new Map(nodes.map((node) => [node.id, []]));
  for (const e of edges) { adj.get(e.from)?.push(e.to); adj.get(e.to)?.push(e.from); }
  const order = [];
  const seen = new Set();
  const visit = (id) => { seen.add(id); order.push(id); for (const next of adj.get(id)) if (!seen.has(next)) visit(next); };
  for (const node of [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)) if (!seen.has(node.id)) visit(node.id);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const perimeter = nodes.reduce((sum, node) => sum + Math.max(node.w, node.h) + gapX, 0);
  const r = Math.max(120, perimeter / (2 * Math.PI));
  const targets = new Map();
  order.forEach((id, i) => {
    const node = byId.get(id);
    const a = -Math.PI / 2 + (i / order.length) * Math.PI * 2;
    targets.set(id, { x: origin.x + r + Math.cos(a) * r - node.w / 2, y: origin.y + r + Math.sin(a) * r - node.h / 2 });
  });
  return normalizeOrigin(targets, byId, origin);
}

/** Grid: reading order, as square as possible, cells as big as the biggest shape. */
function grid(nodes, edges, { gapX, gapY, origin }) {
  const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  const cw = Math.max(...sorted.map((node) => node.w)) + gapX;
  const ch = Math.max(...sorted.map((node) => node.h)) + gapY;
  const targets = new Map();
  sorted.forEach((node, i) => targets.set(node.id, { x: origin.x + (i % cols) * cw + (cw - gapX - node.w) / 2, y: origin.y + Math.floor(i / cols) * ch + (ch - gapY - node.h) / 2 }));
  return targets;
}

function normalizeOrigin(targets, byId, origin) {
  const minX = Math.min(...[...targets.values()].map((p) => p.x));
  const minY = Math.min(...[...targets.values()].map((p) => p.y));
  for (const p of targets.values()) { p.x += origin.x - minX; p.y += origin.y - minY; }
  void byId;
  return targets;
}

/**
 * Lays out a page (or the given shapes). options: { kind, spacing (px between
 * shapes, default 50), origin ({ x, y }, default: where the shapes start) }.
 * Returns how many shapes moved.
 */
export function layoutPage(page, { kind = 'flowTB', spacing = 50, ids = null, origin = null } = {}) {
  const nodes = layoutNodes(page, ids);
  if (!nodes.length) return 0;
  const set = new Set(nodes.map((node) => node.id));
  const edges = connectionGraph(page).filter((e) => set.has(e.from) && set.has(e.to));
  const start = origin ?? { x: Math.min(...nodes.map((node) => node.x)), y: Math.min(...nodes.map((node) => node.y)) };
  const opts = { horizontal: kind.endsWith('LR'), gapX: spacing, gapY: spacing * 1.2, origin: start };
  const targets = kind.startsWith('tree') ? tree(nodes, edges, opts)
    : kind === 'radial' ? radial(nodes, edges, opts)
      : kind === 'circular' ? circular(nodes, edges, opts)
        : kind === 'grid' ? grid(nodes, edges, opts)
          : layered(nodes, edges, opts);
  let moved = 0;
  for (const node of nodes) {
    const to = targets.get(node.id);
    if (!to) continue;
    const dx = to.x - node.x;
    const dy = to.y - node.y;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) { moveShapes(page, [node.id], dx, dy); moved += 1; }
  }
  for (const shape of page.shapes) if (isConnector(shape) && ((shape.from.id && set.has(topLevel(page, shape.from.id)?.id)) || (shape.to.id && set.has(topLevel(page, shape.to.id)?.id)))) shape.waypoints = [];
  // Tree layouts read best with right-angle connectors leaving from the bottom / right.
  if (kind.startsWith('tree')) {
    for (const shape of page.shapes) {
      if (!isConnector(shape) || !shape.from.id || !shape.to.id) continue;
      if (!set.has(topLevel(page, shape.from.id)?.id) || !set.has(topLevel(page, shape.to.id)?.id)) continue;
      const a = findShape(page, shape.from.id);
      const b = findShape(page, shape.to.id);
      if (isGroup(a) || isGroup(b)) continue;
      shape.from = { id: a.id, pt: 'auto' };
      shape.to = { id: b.id, pt: 'auto' };
    }
  }
  refreshGroups(page);
  return moved;
}
