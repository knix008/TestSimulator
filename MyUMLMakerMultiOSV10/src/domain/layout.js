// Automatic layout of a diagram (Format › Layout): a layered layout (cycles
// broken, longest-path ranks, barycentre ordering) in four directions, with
// generalizations and realizations pointing up so that parents sit above their
// children; and a sequence-diagram tidy-up (lifelines spaced evenly, messages
// at even steps). Containers, annotations and lines keep their place; moved
// lines lose their bend points. Pure: node sizes come from the renderer.
import { isEdgeView, refId } from './model.js';
import { typeDef, viewDef } from './meta.js';

export const LAYOUT_DIRECTIONS = ['TB', 'BT', 'LR', 'RL'];
const UPWARD = new Set(['UMLGeneralization', 'UMLInterfaceRealization', 'UMLRealization', 'UMLComponentRealization', 'UMLExtension', 'UMLInclude']);

/**
 * Lays out the node views of a diagram. boxes: view id → { x, y, w, h }.
 * Changes the views in place; returns the number of views moved.
 */
export function layoutDiagram(diagram, boxes, index, { direction = 'TB', nodeSep = 50, rankSep = 70, origin = null } = {}) {
  const views = diagram.ownedViews ?? [];
  if (diagram._type === 'UMLSequenceDiagram') return layoutSequence(diagram, boxes, index);
  const nodes = views.filter((v) => !isEdgeView(v) && boxes.get(v._id) && !viewDef(v._type).container && !typeDef(index.get(refId(v.model))?._type)?.container && v._type !== 'UMLNoteView' && v._type !== 'UMLTextView');
  if (!nodes.length) return 0;
  const ids = new Set(nodes.map((v) => v._id));
  const edges = [];
  for (const v of views) {
    if (!isEdgeView(v)) continue;
    let a = refId(v.tail); let b = refId(v.head);
    if (!ids.has(a) || !ids.has(b) || a === b) continue;
    const element = index.get(refId(v.model));
    if (element && UPWARD.has(element._type)) [a, b] = [b, a];
    edges.push([a, b]);
  }
  // Break cycles: drop back edges found by DFS.
  const out = new Map(nodes.map((v) => [v._id, []]));
  for (const [a, b] of edges) out.get(a).push(b);
  const state = new Map();
  const dag = [];
  const visit = (id) => {
    state.set(id, 1);
    for (const next of out.get(id)) {
      if (state.get(next) === 1) continue;
      dag.push([id, next]);
      if (!state.get(next)) visit(next);
    }
    state.set(id, 2);
  };
  for (const v of nodes) if (!state.get(v._id)) visit(v._id);
  // Ranks: longest path from the sources.
  const rank = new Map(nodes.map((v) => [v._id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const [a, b] of dag) if (rank.get(b) < rank.get(a) + 1) { rank.set(b, rank.get(a) + 1); changed = true; }
    if (!changed) break;
  }
  // Unconnected nodes go into a row of their own at the end.
  const connected = new Set(dag.flat());
  const maxRank = Math.max(0, ...[...rank.values()]);
  const loners = nodes.filter((v) => !connected.has(v._id));
  if (loners.length && loners.length < nodes.length) loners.forEach((v) => rank.set(v._id, maxRank + 1));
  const layers = [];
  for (const v of nodes) (layers[rank.get(v._id)] ??= []).push(v._id);
  for (let i = 0; i < layers.length; i += 1) layers[i] ??= [];
  // Order within layers: barycentre sweeps (down and up).
  const preds = new Map(nodes.map((v) => [v._id, []]));
  const succs = new Map(nodes.map((v) => [v._id, []]));
  for (const [a, b] of dag) { preds.get(b).push(a); succs.get(a).push(b); }
  const pos = new Map();
  const place = () => layers.forEach((layer) => layer.forEach((id, i) => pos.set(id, i)));
  place();
  const bary = (id, near) => { const list = near.get(id); return list.length ? list.reduce((s, x) => s + pos.get(x), 0) / list.length : pos.get(id); };
  for (let sweep = 0; sweep < 6; sweep += 1) {
    const down = sweep % 2 === 0;
    const order = down ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).slice(0, -1).reverse();
    for (const i of order) { layers[i].sort((a, b) => bary(a, down ? preds : succs) - bary(b, down ? preds : succs)); layers[i].forEach((id, k) => pos.set(id, k)); }
  }
  // Coordinates.
  const horizontal = direction === 'LR' || direction === 'RL';
  const along = (id) => (horizontal ? boxes.get(id).h : boxes.get(id).w);
  const across = (id) => (horizontal ? boxes.get(id).w : boxes.get(id).h);
  const start = origin ?? { x: Math.min(...nodes.map((v) => boxes.get(v._id).x)), y: Math.min(...nodes.map((v) => boxes.get(v._id).y)) };
  const widths = layers.map((layer) => layer.reduce((s, id) => s + along(id), 0) + Math.max(0, layer.length - 1) * nodeSep);
  const widest = Math.max(...widths);
  const depths = layers.map((layer) => Math.max(0, ...layer.map(across)));
  let offset = 0;
  const coords = new Map();
  layers.forEach((layer, i) => {
    let p = (widest - widths[i]) / 2;
    for (const id of layer) { coords.set(id, { a: p, r: offset + (depths[i] - across(id)) / 2 }); p += along(id) + nodeSep; }
    offset += depths[i] + rankSep;
  });
  const total = offset - rankSep;
  let moved = 0;
  for (const v of nodes) {
    const c = coords.get(v._id);
    if (!c) continue;
    let r = c.r;
    if (direction === 'BT' || direction === 'RL') r = total - c.r - across(v._id);
    const x = horizontal ? start.x + r : start.x + c.a;
    const y = horizontal ? start.y + c.a : start.y + r;
    if (Math.round(x) !== v.left || Math.round(y) !== v.top) moved += 1;
    v.left = Math.round(x);
    v.top = Math.round(y);
  }
  for (const v of views) if (isEdgeView(v) && (ids.has(refId(v.tail)) || ids.has(refId(v.head)))) v.points = [];
  return moved;
}

/** Sequence diagram: lifelines side by side, messages at even steps in their current order. */
function layoutSequence(diagram, boxes, index) {
  const views = diagram.ownedViews ?? [];
  const lifelines = views.filter((v) => v._type === 'UMLLifelineView').sort((a, b) => a.left - b.left);
  let x = lifelines.length ? Math.min(...lifelines.map((v) => v.left)) : 40;
  const top = lifelines.length ? Math.min(...lifelines.map((v) => v.top)) : 40;
  for (const v of lifelines) { v.left = Math.round(x); v.top = top; x += (boxes.get(v._id)?.w ?? 100) + 80; }
  const messages = views.filter((v) => v._type === 'UMLMessageView').sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  let y = top + 80;
  for (const m of messages) {
    m.y = y;
    const self = refId(m.tail) === refId(m.head);
    y += self ? 52 : 36;
  }
  for (const v of lifelines) v.height = Math.max(v.height || 0, y - top + 20);
  return lifelines.length + messages.length;
}
