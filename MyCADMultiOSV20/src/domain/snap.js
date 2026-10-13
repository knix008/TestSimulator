// Object snaps (end, middle, centre, quadrant, intersection, nearest), grid
// snap, ortho mode and typed coordinates.
import { entityBox, primitives } from './entities.js';
import {
  angleOnArc, closestOnArc, closestOnCircle, closestOnSegment, dist, intersectCircles, intersectLines, intersectSegmentCircle, mid, polar, rad, sweep,
} from './geometry.js';

export const SNAP_KINDS = ['endpoint', 'midpoint', 'center', 'quadrant', 'intersection', 'nearest'];
/** Lower = preferred when two snaps are about as close. */
const PRIORITY = { endpoint: 0, intersection: 1, center: 2, midpoint: 3, quadrant: 4, nearest: 6, grid: 7 };

const segmentsOf = (prim) => {
  if (prim.kind === 'line') return [[prim.a, prim.b]];
  if (prim.kind === 'poly') {
    const out = [];
    const pts = prim.points;
    for (let i = 0; i < (prim.closed ? pts.length : pts.length - 1); i++) out.push([pts[i], pts[(i + 1) % pts.length]]);
    return out;
  }
  return [];
};

/** Snap points of one primitive (no intersections). */
function primitivePoints(prim, modes) {
  const out = [];
  const push = (kind, p) => { if (modes[kind]) out.push({ kind, x: p.x, y: p.y }); };
  if (prim.kind === 'line') {
    push('endpoint', prim.a); push('endpoint', prim.b); push('midpoint', mid(prim.a, prim.b));
  } else if (prim.kind === 'poly') {
    // Ellipses are polylines inside; only their centre/quadrants make sense, which the entity adds.
    if (!prim.ellipse) {
      for (const p of prim.points) push('endpoint', p);
      for (const [a, b] of segmentsOf(prim)) push('midpoint', mid(a, b));
    }
  } else if (prim.kind === 'circle') {
    push('center', prim.c);
    for (const angle of [0, 90, 180, 270]) push('quadrant', polar(prim.c, prim.r, angle));
  } else if (prim.kind === 'arc') {
    push('center', prim.c);
    push('endpoint', polar(prim.c, prim.r, prim.start));
    push('endpoint', polar(prim.c, prim.r, prim.end));
    push('midpoint', polar(prim.c, prim.r, prim.start + sweep(prim.start, prim.end) / 2));
    for (const angle of [0, 90, 180, 270]) if (angleOnArc(angle, prim.start, prim.end)) push('quadrant', polar(prim.c, prim.r, angle));
  } else if (prim.kind === 'text') {
    push('endpoint', prim.p);
  }
  return out;
}

function nearestOn(prim, p) {
  if (prim.kind === 'circle') return closestOnCircle(p, prim.c, prim.r);
  if (prim.kind === 'arc') return closestOnArc(p, prim.c, prim.r, prim.start, prim.end);
  let best = null;
  for (const [a, b] of segmentsOf(prim)) {
    const q = closestOnSegment(p, a, b).point;
    if (!best || dist(p, q) < dist(p, best)) best = q;
  }
  return best;
}

function intersections(p1, p2) {
  const out = [];
  const curve = (prim) => (prim.kind === 'circle' || prim.kind === 'arc' ? prim : null);
  const onCurve = (prim, q) => prim.kind === 'circle' || angleOnArc(Math.atan2(q.y - prim.c.y, q.x - prim.c.x) * (180 / Math.PI), prim.start, prim.end, 1e-4);
  const c1 = curve(p1);
  const c2 = curve(p2);
  if (!c1 && !c2) {
    for (const [a, b] of segmentsOf(p1)) for (const [c, d] of segmentsOf(p2)) { const q = intersectLines(a, b, c, d); if (q) out.push(q); }
  } else if (c1 && c2) {
    out.push(...intersectCircles(c1.c, c1.r, c2.c, c2.r).filter((q) => onCurve(c1, q) && onCurve(c2, q)));
  } else {
    const c = c1 ?? c2;
    const other = c1 ? p2 : p1;
    for (const [a, b] of segmentsOf(other)) out.push(...intersectSegmentCircle(a, b, c.c, c.r).filter((q) => onCurve(c, q)));
  }
  return out;
}

/**
 * The best snap near `p` within `tolerance` (drawing units), or null.
 * `modes` = { endpoint, midpoint, center, quadrant, intersection, nearest } booleans.
 */
export function findSnap(entities, p, tolerance, modes, { exclude = new Set() } = {}) {
  const near = [];
  for (const entity of entities) {
    if (exclude.has(entity.id) || entity.type === 'dim') continue;
    const box = entityBox(entity);
    if (!box || p.x < box.minX - tolerance || p.x > box.maxX + tolerance || p.y < box.minY - tolerance || p.y > box.maxY + tolerance) continue;
    const prims = primitives(entity).filter((prim) => prim.kind !== 'fill');
    near.push({ entity, prims });
    // Ellipse centre and axis ends.
    if (entity.type === 'ellipse') {
      if (modes.center) near.push({ entity, extra: [{ kind: 'center', x: entity.cx, y: entity.cy }] });
      if (modes.quadrant) near.push({ entity, extra: [0, 90, 180, 270].map((a) => ({ kind: 'quadrant', ...polar({ x: entity.cx, y: entity.cy }, a % 180 ? entity.ry : entity.rx, entity.angle + a) })) });
    }
    if ((entity.type === 'polygon') && modes.center) near.push({ entity, extra: [{ kind: 'center', x: entity.cx, y: entity.cy }] });
    if (entity.type === 'part' && modes.center) near.push({ entity, extra: [{ kind: 'center', x: entity.x, y: entity.y }] });
  }
  const candidates = [];
  for (const item of near) {
    if (item.extra) { candidates.push(...item.extra); continue; }
    for (const prim of item.prims) candidates.push(...primitivePoints(prim, modes));
  }
  if (modes.intersection) {
    const prims = near.filter((item) => item.prims).flatMap((item) => item.prims.filter((prim) => prim.kind !== 'text').map((prim) => ({ prim, id: item.entity.id })));
    // Only primitives that pass close to the cursor can meet there.
    const close = prims.filter(({ prim }) => {
      const q = nearestOn(prim, p);
      return q && dist(q, p) <= tolerance * 2;
    }).slice(0, 40);
    for (let i = 0; i < close.length; i++) {
      for (let j = i + 1; j < close.length; j++) {
        for (const q of intersections(close[i].prim, close[j].prim)) candidates.push({ kind: 'intersection', x: q.x, y: q.y });
      }
    }
  }
  let best = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const d = dist(candidate, p);
    if (d > tolerance) continue;
    const score = d + PRIORITY[candidate.kind] * tolerance * 0.08;
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  if (!best && modes.nearest) {
    for (const item of near) {
      for (const prim of item.prims ?? []) {
        if (prim.kind === 'text') continue;
        const q = nearestOn(prim, p);
        if (q && dist(q, p) <= tolerance && (!best || dist(q, p) < dist(best, p))) best = { kind: 'nearest', x: q.x, y: q.y };
      }
    }
  }
  return best;
}

export const snapToGrid = (p, size) => ({ x: Math.round(p.x / size) * size, y: Math.round(p.y / size) * size });

/** Ortho: keeps the point on the horizontal or vertical line through `base`. */
export function applyOrtho(base, p) {
  return Math.abs(p.x - base.x) >= Math.abs(p.y - base.y) ? { x: p.x, y: base.y } : { x: base.x, y: p.y };
}

// ───────────────────────── typed coordinates

const NUMBER = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?';

/**
 * Coordinates typed while drawing:
 *   "100,50"   absolute        "@30,-10"  relative to the last point
 *   "@50<30"   50 at 30°       "50<30"    the same (relative)
 *   "75"       75 along the current cursor direction from the last point
 * Returns a point, or null when the text is not a coordinate.
 */
export function parseCoordinate(text, last, cursor) {
  const value = String(text ?? '').trim().replace(/\s+/g, '').replace(/，/g, ',');
  if (!value) return null;
  let match = new RegExp(`^(@)?(${NUMBER}),(${NUMBER})$`, 'i').exec(value);
  if (match) {
    const x = Number(match[2]);
    const y = Number(match[3]);
    if (match[1]) return last ? { x: last.x + x, y: last.y + y } : { x, y };
    return { x, y };
  }
  match = new RegExp(`^@?(${NUMBER})<(${NUMBER})$`, 'i').exec(value);
  if (match) {
    const base = last ?? { x: 0, y: 0 };
    return polar(base, Number(match[1]), Number(match[2]));
  }
  match = new RegExp(`^(${NUMBER})$`, 'i').exec(value);
  if (match && last) {
    const distance = Number(match[1]);
    const toward = cursor && dist(cursor, last) > 1e-9 ? Math.atan2(cursor.y - last.y, cursor.x - last.x) : 0;
    return { x: last.x + distance * Math.cos(toward), y: last.y + distance * Math.sin(toward) };
  }
  return null;
}

export { rad };
