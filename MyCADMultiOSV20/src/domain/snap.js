// Object snaps (end, middle, centre, quadrant, intersection, nearest), grid
// snap, ortho mode and typed coordinates.
import { entityBox, primitives } from './entities.js';
import { fromPlane, toPlane, vectorFromPlane } from './workplane.js';
import { displayUnit, evaluateLength } from './units.js';
import {
  angleOnArc, closestOnArc, closestOnCircle, closestOnSegment, dist, intersectCircles, intersectLines, intersectSegmentCircle, mid, polar, rad, sweep,
} from './geometry.js';

export const SNAP_KINDS = ['endpoint', 'midpoint', 'center', 'quadrant', 'intersection', 'nearest', 'perpendicular', 'parallel', 'extension', 'angle', 'special'];
/** Lower = preferred when two snaps are about as close. */
const PRIORITY = { endpoint: 0, intersection: 1, special: 1.5, center: 2, perpendicular: 2.5, midpoint: 3, angle: 3.5, quadrant: 4, extension: 5, parallel: 5, nearest: 6, grid: 7 };
/** Entities whose insertion point is their "special" point (Draft_Snap_Special). */
const SPECIAL = ['text', 'dim', 'part', 'leader', 'point', 'hatch'];

/**
 * Draft_Snap_Extension / Draft_Snap_Parallel: the lines the pointer passed
 * over lately (FreeCAD remembers them so a point can be put on their extension
 * or parallel to them away from them).
 */
const recentLines = [];
function remember(a, b) {
  const same = (l) => dist(l[0], a) < 1e-9 && dist(l[1], b) < 1e-9;
  if (recentLines.some(same)) return;
  recentLines.unshift([a, b]);
  recentLines.length = Math.min(recentLines.length, 4);
}
export const forgetSnapLines = () => { recentLines.length = 0; };

/** The foot of the perpendicular from p onto the infinite line ab, with its parameter (0 at a, 1 at b). */
function foot(p, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1e-24;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  return { x: a.x + dx * t, y: a.y + dy * t, t };
}

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
export function findSnap(entities, p, tolerance, modes, { exclude = new Set(), base = null } = {}) {
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
    if (modes.special && SPECIAL.includes(entity.type)) {
      const at = entity.type === 'leader' ? entity.points?.[0] : entity.type === 'hatch' ? null : entity.type === 'dim' ? { x: entity.ox ?? entity.cx, y: entity.oy ?? entity.cy } : { x: entity.x, y: entity.y };
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) near.push({ entity, extra: [{ kind: 'special', x: at.x, y: at.y }] });
    }
  }
  const candidates = [];
  for (const item of near) {
    if (item.extra) { candidates.push(...item.extra); continue; }
    for (const prim of item.prims) candidates.push(...primitivePoints(prim, modes));
  }
  // Lines under the pointer are remembered for the extension and parallel snaps.
  for (const item of near) {
    for (const prim of item.prims ?? []) {
      for (const [a, b] of segmentsOf(prim)) if (dist(closestOnSegment(p, a, b).point, p) <= tolerance) remember(a, b);
    }
  }
  if (modes.angle) {
    // Draft_Snap_Angle: points of circles and arcs at every 15°.
    for (const item of near) {
      for (const prim of item.prims ?? []) {
        if (prim.kind !== 'circle' && prim.kind !== 'arc') continue;
        for (let a = 0; a < 360; a += 15) if (prim.kind === 'circle' || angleOnArc(a, prim.start, prim.end)) candidates.push({ kind: 'angle', ...polar(prim.c, prim.r, a) });
      }
    }
  }
  if (modes.perpendicular && base) {
    // Draft_Snap_Perpendicular: where a line from the last point meets an edge square.
    for (const item of near) {
      for (const prim of item.prims ?? []) {
        if (prim.kind === 'circle' || prim.kind === 'arc') {
          const d = dist(base, prim.c);
          if (d > 1e-9) {
            for (const sign of [1, -1]) {
              const q = { x: prim.c.x + (sign * prim.r * (base.x - prim.c.x)) / d, y: prim.c.y + (sign * prim.r * (base.y - prim.c.y)) / d };
              if (prim.kind === 'circle' || angleOnArc(Math.atan2(q.y - prim.c.y, q.x - prim.c.x) * (180 / Math.PI), prim.start, prim.end)) candidates.push({ kind: 'perpendicular', x: q.x, y: q.y });
            }
          }
          continue;
        }
        for (const [a, b] of segmentsOf(prim)) {
          const f = foot(base, a, b);
          if (f.t >= -1e-9 && f.t <= 1 + 1e-9) candidates.push({ kind: 'perpendicular', x: f.x, y: f.y });
        }
      }
    }
  }
  if (modes.extension) {
    // Draft_Snap_Extension: on a remembered line, beyond its ends.
    for (const [a, b] of recentLines) {
      const f = foot(p, a, b);
      if (f.t < -1e-6 || f.t > 1 + 1e-6) candidates.push({ kind: 'extension', x: f.x, y: f.y });
    }
  }
  if (modes.parallel && base) {
    // Draft_Snap_Parallel: from the last point, along a remembered line's direction.
    for (const [a, b] of recentLines) {
      const f = foot(p, base, { x: base.x + b.x - a.x, y: base.y + b.y - a.y });
      if (dist(f, base) > 1e-9) candidates.push({ kind: 'parallel', x: f.x, y: f.y });
    }
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

/** Nearest grid point (of the working plane `wp`, when there is one). */
export function snapToGrid(p, size, wp = null) {
  const q = toPlane(p, wp);
  return fromPlane({ x: Math.round(q.x / size) * size, y: Math.round(q.y / size) * size }, wp);
}

/** Ortho: keeps the point on the line through `base` along the (working plane's) X or Y axis. */
export function applyOrtho(base, p, wp = null) {
  const b = toPlane(base, wp);
  const q = toPlane(p, wp);
  return fromPlane(Math.abs(q.x - b.x) >= Math.abs(q.y - b.y) ? { x: q.x, y: b.y } : { x: b.x, y: q.y }, wp);
}

// ───────────────────────── typed coordinates

const NUMBER = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?';
/** A number with an optional unit of its own (mm, cm, m, in, ft, " and '). */
const LENGTH = `${NUMBER}(?:mm|cm|m|in|ft|"|'|″|′)?`;

/**
 * Coordinates typed while drawing:
 *   "100,50"   absolute        "@30,-10"  relative to the last point
 *   "@50<30"   50 at 30°       "50<30"    the same (relative)
 *   "75"       75 along the current cursor direction from the last point
 * Returns a point, or null when the text is not a coordinate.
 */
export function parseCoordinate(text, last, cursor, unit = displayUnit(), wp = null) {
  const value = String(text ?? '').trim().replace(/\s+/g, '').replace(/，/g, ',');
  if (!value) return null;
  // Lengths are in the display unit unless they carry their own ("2in,30mm").
  const length = (s) => evaluateLength(s, unit);
  let match = new RegExp(`^(@)?(${LENGTH}),(${LENGTH})$`, 'i').exec(value);
  if (match) {
    const x = length(match[2]);
    const y = length(match[3]);
    // On a working plane: absolute = its coordinates, relative = along its axes.
    if (match[1]) {
      const v = vectorFromPlane({ x, y }, wp);
      return last ? { x: last.x + v.x, y: last.y + v.y } : fromPlane({ x, y }, wp);
    }
    return fromPlane({ x, y }, wp);
  }
  match = new RegExp(`^@?(${LENGTH})<(${NUMBER})$`, 'i').exec(value);
  if (match) {
    const base = last ?? fromPlane({ x: 0, y: 0 }, wp);
    return polar(base, length(match[1]), Number(match[2]) + (wp?.angle ?? 0));
  }
  match = new RegExp(`^(${LENGTH})$`, 'i').exec(value);
  if (match && last) {
    const distance = length(match[1]);
    const toward = cursor && dist(cursor, last) > 1e-9 ? Math.atan2(cursor.y - last.y, cursor.x - last.x) : 0;
    return { x: last.x + distance * Math.cos(toward), y: last.y + distance * Math.sin(toward) };
  }
  return null;
}

export { rad };
