// FreeCAD Draft operations MyCAD did not have yet: joining wires, stretching
// what lies in a window, copies along a path or onto points, Bézier curves
// from control points, a wire's slope (into 3D), flipping a dimension, the
// outline of a text (Draft_ShapeString) traced from its picture, and the
// document's annotation styles and working-plane proxies.

import { primitives } from './entities.js';
import { chainSegments } from './sketch.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

// ───────────────────────── wires

/** The points of an entity's outline, in order (arcs and curves as short segments); null for things that are not a path. */
export function pathPoints(e) {
  if (!e || ['text', 'dim', 'solid', 'hatch', 'point', 'part', 'leader'].includes(e.type)) return null;
  const pts = [];
  let closed = false;
  for (const prim of primitives(e)) {
    let list = null;
    if (prim.kind === 'line') list = [prim.a, prim.b];
    else if (prim.kind === 'poly') { list = prim.points; closed = closed || Boolean(prim.closed); }
    else if (prim.kind === 'circle' || prim.kind === 'arc') {
      const start = prim.kind === 'circle' ? 0 : prim.start;
      const sweep = prim.kind === 'circle' ? 360 : ((prim.end - prim.start) % 360 + 360) % 360 || 360;
      const n = Math.max(8, Math.ceil(sweep / 5));
      list = Array.from({ length: n + 1 }, (_, i) => {
        const a = ((start + (sweep * i) / n) * Math.PI) / 180;
        return { x: prim.c.x + prim.r * Math.cos(a), y: prim.c.y + prim.r * Math.sin(a) };
      });
      if (prim.kind === 'circle') closed = true;
    }
    if (!list) continue;
    for (const p of list) if (!pts.length || dist(pts[pts.length - 1], p) > 1e-9) pts.push({ x: p.x, y: p.y });
  }
  if (closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) > 1e-9) pts.push({ ...pts[0] });
  return pts.length >= 2 ? { points: pts, closed } : null;
}

/** Draft_Join / Draft_Upgrade: paths that meet end to end, joined into longer ones. [{ points, closed }]. */
export function joinPaths(paths, tolerance = 1e-6) {
  const pool = paths.map((p) => p.slice());
  const out = [];
  while (pool.length) {
    let chain = pool.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        const [head, tail] = [chain[0], chain[chain.length - 1]];
        let next = null;
        if (dist(tail, p[0]) <= tolerance) next = [...chain, ...p.slice(1)];
        else if (dist(tail, p[p.length - 1]) <= tolerance) next = [...chain, ...p.slice(0, -1).reverse()];
        else if (dist(head, p[p.length - 1]) <= tolerance) next = [...p, ...chain.slice(1)];
        else if (dist(head, p[0]) <= tolerance) next = [...p.slice(1).reverse(), ...chain];
        if (next) { chain = next; pool.splice(i, 1); grew = true; break; }
      }
    }
    const closed = chain.length > 3 && dist(chain[0], chain[chain.length - 1]) <= tolerance;
    out.push({ points: closed ? chain.slice(0, -1) : chain, closed });
  }
  return out;
}

/** Points with corners only (Douglas–Peucker). */
export function simplifyPath(points, tolerance) {
  if (points.length < 3) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const p = points[a]; const q = points[b];
    const dx = q.x - p.x; const dy = q.y - p.y;
    const l = Math.hypot(dx, dy) || 1e-12;
    let worst = -1; let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dx * (points[i].y - p.y) - dy * (points[i].x - p.x)) / l;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tolerance) { keep[at] = true; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

// ───────────────────────── stretch (Draft_Stretch)

const inBox = (p, box) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;

/**
 * An entity stretched: the points inside the window move by (dx, dy), the
 * others stay. A rectangle or polygon with only some corners inside becomes a
 * polyline. Returns { type, data } or null when nothing of it is inside.
 */
export function stretchEntity(e, box, dx, dy) {
  const move = (p) => (inBox(p, box) ? { x: p.x + dx, y: p.y + dy } : p);
  const moved = (p) => inBox(p, box);
  const { id: _id, type, ...data } = e;
  switch (type) {
    case 'line': {
      const a = { x: e.x1, y: e.y1 }; const b = { x: e.x2, y: e.y2 };
      if (!moved(a) && !moved(b)) return null;
      const [p, q] = [move(a), move(b)];
      return { type, data: { ...data, x1: p.x, y1: p.y, x2: q.x, y2: q.y } };
    }
    case 'polyline': case 'spline': case 'leader':
      if (!e.points.some(moved)) return null;
      return { type, data: { ...data, points: e.points.map(move) } };
    case 'rect': case 'polygon': {
      const corners = pathPoints(e).points.slice(0, -1);
      const inside = corners.filter(moved).length;
      if (!inside) return null;
      if (inside === corners.length) {
        return type === 'rect' ? { type, data: { ...data, x: e.x + dx, y: e.y + dy } } : { type, data: { ...data, cx: e.cx + dx, cy: e.cy + dy } };
      }
      return { type: 'polyline', data: { layer: e.layer, color: e.color, lineType: e.lineType, lineWidth: e.lineWidth, group: e.group, points: corners.map(move), closed: true } };
    }
    case 'circle': case 'arc': case 'ellipse': {
      if (!moved({ x: e.cx, y: e.cy })) return null;
      return { type, data: { ...data, cx: e.cx + dx, cy: e.cy + dy } };
    }
    case 'point': case 'text': case 'part':
      if (!moved({ x: e.x, y: e.y })) return null;
      return { type, data: { ...data, x: e.x + dx, y: e.y + dy } };
    case 'dim': {
      const keys = [['x1', 'y1'], ['x2', 'y2'], ['ox', 'oy'], ['cx', 'cy']].filter(([x, y]) => Number.isFinite(e[x]) && Number.isFinite(e[y]));
      if (!keys.some(([x, y]) => moved({ x: e[x], y: e[y] }))) return null;
      const out = { ...data };
      for (const [x, y] of keys) { const p = move({ x: e[x], y: e[y] }); out[x] = p.x; out[y] = p.y; }
      return { type, data: out };
    }
    default: return null;
  }
}

// ───────────────────────── arrays along paths and on points

/**
 * `count` places along a path at equal distances: [{ x, y, angle }] (angle of
 * the path there, degrees). A closed path does not put two copies on its start.
 */
export function placesAlong(path, count) {
  const pts = path.points;
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + dist(pts[i - 1], pts[i]));
  const total = lengths[lengths.length - 1];
  if (!(total > 0) || count < 1) return [];
  const steps = path.closed ? count : Math.max(1, count - 1);
  const out = [];
  for (let k = 0; k < count; k++) {
    const s = count === 1 ? 0 : (total * k) / steps;
    let i = 1;
    while (i < pts.length - 1 && lengths[i] < s) i++;
    const seg = lengths[i] - lengths[i - 1] || 1e-12;
    const f = Math.min(1, Math.max(0, (s - lengths[i - 1]) / seg));
    const a = pts[i - 1]; const b = pts[i];
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }
  return out;
}

/** The points a point array copies to: point objects, or the corners of polylines / the vertices of anything else. */
export function arrayPoints(entities) {
  const out = [];
  for (const e of entities) {
    if (e.type === 'point') out.push({ x: e.x, y: e.y });
    else {
      const path = pathPoints(e);
      if (path) out.push(...(path.closed ? path.points.slice(0, -1) : path.points));
    }
  }
  return out;
}

// ───────────────────────── Bézier curves (Draft_BezCurve, Draft_CubicBezCurve)

/**
 * A chain of Bézier segments of one degree from control points (each segment
 * shares its last point with the next): a B-spline with the inner knots
 * repeated `degree` times. Missing points of the last segment repeat its end.
 */
export function bezierFromPoints(points, degree) {
  if (points.length < 2) return null;
  const p = Math.max(1, Math.min(degree, 5, points.length - 1));
  const pts = points.map((q) => ({ x: q.x, y: q.y }));
  while ((pts.length - 1) % p) pts.push({ ...pts[pts.length - 1] });
  const segments = (pts.length - 1) / p;
  const knots = [...Array(p + 1).fill(0)];
  for (let i = 1; i < segments; i++) knots.push(...Array(p).fill(i / segments));
  knots.push(...Array(p + 1).fill(1));
  return { degree: p, points: pts, knots, weights: null };
}

// ───────────────────────── slope (Draft_Slope)

/** A 2D wire lifted into 3D so that it rises `percent` % along its length (from z0). */
export function slopePath(points, percent, z0 = 0) {
  let run = 0;
  return points.map((p, i) => {
    if (i) run += dist(points[i - 1], p);
    return [p.x, p.y, z0 + (run * percent) / 100];
  });
}

// ───────────────────────── dimensions (Draft_FlipDimension)

/** A dimension put on the other side of what it measures (its text turned round). */
export function flipDimension(e) {
  if (e?.type !== 'dim') return null;
  if (['aligned', 'horizontal', 'vertical'].includes(e.kind)) {
    // The offset point mirrored across the measured line.
    const dx = e.x2 - e.x1; const dy = e.y2 - e.y1;
    const l2 = dx * dx + dy * dy || 1e-12;
    let { ox, oy } = e;
    if (e.kind === 'horizontal') oy = e.y1 + e.y2 - oy;
    else if (e.kind === 'vertical') ox = e.x1 + e.x2 - ox;
    else {
      const t = ((ox - e.x1) * dx + (oy - e.y1) * dy) / l2;
      const fx = e.x1 + dx * t; const fy = e.y1 + dy * t;
      ox = 2 * fx - ox; oy = 2 * fy - oy;
    }
    return { ...e, ox, oy };
  }
  if (e.kind === 'radius' || e.kind === 'diameter') return { ...e, angle: ((e.angle ?? 0) + 180) % 360 };
  if (e.kind === 'angle') return { ...e, start: e.end, end: e.start };
  return null;
}

// ───────────────────────── text outlines (Draft_ShapeString)

/**
 * Outlines of a picture: alpha (0…255, w×h, row 0 at the top) traced with
 * marching squares into closed loops in picture coordinates (y down),
 * simplified to `tolerance` pixels.
 */
export function traceOutlines(alpha, w, h, { threshold = 128, tolerance = 0.6 } = {}) {
  const on = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? alpha[y * w + x] >= threshold : false);
  // Each cell between four pixel centres gives edges between the midpoints of its sides.
  const segments = [];
  const mid = { t: (x, y) => ({ x: x + 0.5, y }), r: (x, y) => ({ x: x + 1, y: y + 0.5 }), b: (x, y) => ({ x: x + 0.5, y: y + 1 }), l: (x, y) => ({ x, y: y + 0.5 }) };
  const CASES = { 1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']], 5: [['l', 't'], ['b', 'r']], 6: [['b', 't']], 7: [['l', 't']], 8: [['l', 't']], 9: [['b', 't']], 10: [['l', 'b'], ['t', 'r']], 11: [['t', 'r']], 12: [['l', 'r']], 13: [['b', 'r']], 14: [['l', 'b']] };
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      // Corners: top-left 8, top-right 4, bottom-right 2, bottom-left 1 (pixel centres at +0.5).
      const code = (on(x, y) ? 8 : 0) | (on(x + 1, y) ? 4 : 0) | (on(x + 1, y + 1) ? 2 : 0) | (on(x, y + 1) ? 1 : 0);
      for (const [a, b] of CASES[code] ?? []) segments.push([mid[a](x + 0.5, y + 0.5), mid[b](x + 0.5, y + 0.5)]);
    }
  }
  return chainSegments(segments, 1e-6)
    .filter((loop) => loop.closed && loop.points.length >= 3)
    .map((loop) => simplifyLoop(loop.points, tolerance))
    .filter((loop) => loop.length >= 3);
}

/** A closed loop simplified: split at the point farthest from its first, each half simplified. */
export function simplifyLoop(points, tolerance) {
  if (points.length < 4) return points.slice();
  let far = 1;
  for (let i = 1; i < points.length; i++) if (dist(points[i], points[0]) > dist(points[far], points[0])) far = i;
  const first = simplifyPath(points.slice(0, far + 1), tolerance);
  const second = simplifyPath([...points.slice(far), points[0]], tolerance);
  return [...first, ...second.slice(1, -1)];
}

/** Signed area of a loop (counter-clockwise positive). */
export const loopArea = (loop) => loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;

// ───────────────────────── document extras

/** Draft_AnnotationStyleEditor: named styles of texts and dimensions. */
export function normalizeAnnotationStyles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s) => s && typeof s.name === 'string' && s.name.trim()).slice(0, 100).map((s) => ({
    name: s.name.trim().slice(0, 80),
    textHeight: Math.max(0.1, finite(s.textHeight, 3.5)),
    precision: Math.max(0, Math.min(6, Math.round(finite(s.precision, 2)))),
    ...(typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? { color: s.color.toLowerCase() } : {}),
  }));
}

/** Draft_WorkingPlaneProxy: saved working planes (and the camera with them). */
export function normalizeWpProxies(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => p && typeof p.name === 'string').slice(0, 50).map((p) => ({ name: p.name.slice(0, 80), workPlane: p.workPlane && typeof p.workPlane === 'object' ? p.workPlane : null, ...(p.camera ? { camera: p.camera } : {}) }));
}
