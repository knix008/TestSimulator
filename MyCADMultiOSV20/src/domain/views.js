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
    // Hidden lines: dashed in the orthographic views, left out of the isometric one.
    const segments = projectEdges(tris, view, { hidden: true }).filter((seg) => view !== 'iso' || !seg.hidden);
    if (!segments.length) continue;
    let minX = Infinity;
    let minY = Infinity;
    for (const seg of segments) for (const p of seg) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
    const [ox, oy] = slots[view];
    const move = (p) => ({ x: p.x - minX + ox, y: p.y - minY + oy });
    // Slivers of the tessellation shorter than this are left out (1/250 of the model).
    const minLength = Math.max(sx, sy, sz) * 4e-3;
    for (const hidden of [false, true]) {
      const chains = joinSegments(segments.filter((seg) => Boolean(seg.hidden) === hidden).map(([a, b]) => [move(a), move(b)]), 1e-4);
      for (const chain of chains.map((c) => cleanChain(closeNearly(dropRepeats(c), minLength))).filter((c) => c && chainLength(c) >= minLength)) {
        out.push({ type: 'polyline', points: chain.points, closed: chain.closed, ...(hidden ? (hiddenLayer ? { layer: hiddenLayer } : { lineType: 'hidden' }) : {}) });
      }
    }
    if (labels[view]) out.push({ type: 'text', x: ox, y: oy - gap * 0.6, text: labels[view], size: textHeight, ...(textLayer ? { layer: textLayer } : {}) });
  }
  return out;
}

function chainLength({ points, closed }) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  if (closed && points.length > 1) length += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
  return length;
}

/** A chain whose ends nearly meet (closer than `tolerance`) is closed. */
function closeNearly(chain, tolerance) {
  const { points } = chain;
  if (chain.closed || points.length < 4) return chain;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < tolerance ? { points: points.slice(0, -1), closed: true } : chain;
}

/** Consecutive points on top of each other are kept once. */
function dropRepeats(chain) {
  const points = chain.points.filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y) > 1e-9);
  if (chain.closed && points.length > 1 && Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) <= 1e-9) points.pop();
  return { ...chain, points };
}

/**
 * A closed chain that only runs to and fro along one line (a face seen edge on)
 * encloses nothing: it becomes the plain line between its two ends.
 */
function cleanChain(chain) {
  const { points } = chain;
  if (!chain.closed || points.length < 3) return chain;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  }
  const size = chainLength(chain);
  if (Math.abs(area) / 2 > size * size * 1e-9) return chain;
  let a = points[0];
  let b = points[0];
  for (const p of points) for (const q of points) if (Math.hypot(p.x - q.x, p.y - q.y) > Math.hypot(a.x - b.x, a.y - b.y)) { a = p; b = q; }
  return { points: [a, b], closed: false };
}

/** Raw polylines where the plane z = level cuts the solids. */
export function sectionOutlines(solids, level) {
  return joinSegments(solids.flatMap((entity) => sectionAt(solidMesh(entity), level)), 1e-4)
    .map(dropRepeats)
    .filter((chain) => chain.points.length >= 2)
    .map((chain) => ({ type: 'polyline', points: chain.points, closed: chain.closed }));
}
