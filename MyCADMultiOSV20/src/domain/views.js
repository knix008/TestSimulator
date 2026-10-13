// Drawing views and sections of 3D solids as 2D entities (FreeCAD TechDraw /
// Part Section): used by the app's commands and by the sample generator.
import { joinSegments, meshBox, projectEdges, sectionAt, solidMesh } from './solids.js';

export const VIEW_NAMES = ['front', 'top', 'right', 'iso'];

/**
 * Raw 2D entities for views of `solids`, in third-angle layout (top above
 * front, right beside it, isometric at the top right), starting at
 * (x0, y0) — its lower left corner. Visible lines continuous, hidden lines
 * on the hidden layer (or dashed when there is none). labels: view → text.
 */
export function drawingViews(solids, { x0 = 0, y0 = 0, gap = 20, views = { front: true, top: true, right: true, iso: true }, labels = {}, textHeight = 3.5, hiddenLayer = 'hidden', textLayer = 'text' } = {}) {
  const tris = solids.flatMap((entity) => solidMesh(entity));
  if (!tris.length) return [];
  const [sx, sy, sz] = meshBox(tris).size;
  const slots = { front: [x0, y0], top: [x0, y0 + sz + gap], right: [x0 + sx + gap, y0], iso: [x0 + sx + gap, y0 + sz + gap] };
  const out = [];
  for (const view of VIEW_NAMES.filter((name) => views[name])) {
    const segments = projectEdges(tris, view, { hidden: view !== 'iso' });
    if (!segments.length) continue;
    let minX = Infinity;
    let minY = Infinity;
    for (const seg of segments) for (const p of seg) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
    const [ox, oy] = slots[view];
    const move = (p) => ({ x: p.x - minX + ox, y: p.y - minY + oy });
    for (const hidden of [false, true]) {
      const chains = joinSegments(segments.filter((seg) => Boolean(seg.hidden) === hidden).map(([a, b]) => [move(a), move(b)]), 1e-4);
      for (const chain of chains) out.push({ type: 'polyline', points: chain.points, closed: chain.closed, ...(hidden ? (hiddenLayer ? { layer: hiddenLayer } : { lineType: 'hidden' }) : {}) });
    }
    if (labels[view]) out.push({ type: 'text', x: ox, y: oy - gap * 0.6, text: labels[view], size: textHeight, ...(textLayer ? { layer: textLayer } : {}) });
  }
  return out;
}

/** Raw polylines where the plane z = level cuts the solids. */
export function sectionOutlines(solids, level) {
  return joinSegments(solids.flatMap((entity) => sectionAt(solidMesh(entity), level)), 1e-4)
    .filter((chain) => chain.points.length >= 2)
    .map((chain) => ({ type: 'polyline', points: chain.points, closed: chain.closed }));
}
