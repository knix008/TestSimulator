// Silhouette Entities: the outline of a body seen square to the sketch plane, made into sketch curves. The body is
// projected onto the plane by OpenCASCADE's hidden-line removal (exact lines, circles and curves: sharp edges and
// the smooth outlines of curved faces, visible and hidden), and a projected curve is kept when it bounds the
// body's shadow on the plane — the shadow on one side of it and not on the other (a line through the point along
// the plane normal meets the body or not). External keeps the outer outline only; internal also keeps the holes
// of the shadow (through holes seen end on) and the outlines of faces inside it.
import { rep } from './kernel.js';
import { addArc, addCircle, addLine, newSketchId, byId, mergePoints, pointsOf, polyline, removeEntities, profiles } from './sketch.js';
import { addSpline } from './sketchtools.js';
import { edgesToSketch } from './sketch-more.js';
import { repairSketch } from './sketch-repair.js';
import { toWorld } from './features.js';

const FLAT = { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] };

/**
 * Adds the silhouette of `body` to the sketch on frame `fr`. Options: mode 'external' | 'internal'.
 * Returns the curves made.
 */
export function silhouetteEntities(sketch, fr, body, { mode = 'external' } = {}) {
  const R = rep();
  if (!body) return [];
  const camera = new R.ProjectionCamera(fr.origin, fr.normal, fr.xDir);
  const { visible, hidden } = R.makeProjectedEdges(body, camera, true);
  const before = new Set(sketch.entities.map((e) => e.id));
  const [lo0, hi0] = body.boundingBox.bounds;
  const size0 = Math.hypot(hi0[0] - lo0[0], hi0[1] - lo0[1], hi0[2] - lo0[2]) || 1;
  const size = size0;
  for (const edge of [...visible, ...hidden]) {
    if (edge.geomType === 'LINE' || edge.geomType === 'CIRCLE') edgesToSketch(sketch, FLAT, [edge]);
    else curveToSketch(sketch, edge, size);
  }
  let made = sketch.entities.filter((e) => !before.has(e.id) && e.type !== 'point');
  // The shadow: does the line square to the plane through (u, v) meet the body?
  const [lo, hi] = [lo0, hi0];
  const reach = size * 2 + Math.hypot(...lo) + Math.hypot(...hi);
  const cache = new Map();
  const inShadow = (u, v) => {
    const key = `${u.toFixed(9)},${v.toFixed(9)}`;
    if (cache.has(key)) return cache.get(key);
    const p = toWorld(fr, [u, v]);
    const a = p.map((x, i) => x - fr.normal[i] * reach); const b = p.map((x, i) => x + fr.normal[i] * reach);
    let hit = false;
    try { const line = R.makeLine(a, b); hit = R.measureDistanceBetween(line, body) < size * 1e-9 + 1e-9; line.delete?.(); } catch { hit = false; }
    cache.set(key, hit);
    return hit;
  };
  const eps = Math.max(size * 2e-4, 1e-5);
  const onBoundary = (e) => {
    const pts = polyline(sketch, e, undefined, 8);
    // A middle point and the way the curve runs there.
    const k = Math.floor(pts.length / 2);
    const m = pts[k]; const q = pts[Math.min(k + 1, pts.length - 1)]; const r = pts[Math.max(k - 1, 0)];
    const d = [q[0] - r[0], q[1] - r[1]]; const l = Math.hypot(d[0], d[1]) || 1;
    const n = [-d[1] / l, d[0] / l];
    return inShadow(m[0] + n[0] * eps, m[1] + n[1] * eps) !== inShadow(m[0] - n[0] * eps, m[1] - n[1] * eps);
  };
  const drop = made.filter((e) => !onBoundary(e));
  removeEntities(sketch, drop.map((e) => e.id));
  made = made.filter((e) => !drop.includes(e));
  // The same curve projected twice (a front and a back edge, a circle seen edge on as two halves and whole):
  // duplicates and overlapping lines merged, touching ends joined — Repair Sketch over the new curves only.
  const own = new Set(made.flatMap((e) => [e.id, ...pointsOf(e)]));
  const tmp = { entities: sketch.entities.filter((e) => own.has(e.id)), constraints: [] };
  repairSketch(tmp, { gap: size * 1e-7 + 1e-7 });
  const keep = new Set(tmp.entities.map((e) => e.id));
  sketch.entities = sketch.entities.filter((e) => !own.has(e.id) || keep.has(e.id));
  made = made.filter((e) => keep.has(e.id));
  if (mode === 'external') {
    // Only the outer outline: curves of the shadow's holes go (a probe just inside them is outside the shadow,
    // and the probe on the far side lies inside a bigger outline of the made curves).
    const loops = profilesOf(sketch, made);
    const inner = new Set(loops.flatMap((p) => p.holes.flatMap((h) => h.ids ?? [])));
    if (inner.size) { removeEntities(sketch, [...inner]); made = made.filter((e) => !inner.has(e.id)); }
  }
  for (const e of made) if (e.type === 'line' || e.type === 'arc' || e.type === 'circle' || e.type === 'spline') e.silhouette = mode;
  return made;
}

/**
 * A projected curve (HLR gives curved outlines as B-splines in the plane): a line when it is straight, an arc or
 * a circle when its points lie on one, a spline through its points otherwise.
 */
function curveToSketch(sketch, edge, size) {
  const N = 16;
  const pts = Array.from({ length: N + 1 }, (_, i) => { const p = edge.pointAt(i / N); return [p.x ?? p[0], p.y ?? p[1]]; });
  const tol = size * 1e-7 + 1e-9;
  const a = pts[0]; const b = pts[N];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const pointAt = (x, y) => { const q = { id: newSketchId('p'), type: 'point', x, y }; sketch.entities.push(q); return q.id; };
  if (chord > tol) {
    const d = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
    const off = Math.max(...pts.map((p) => Math.abs(d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0]))));
    // Straight, and running one way only (a flattened circle goes out and back: that is a line too, its extent).
    if (off <= tol) {
      const ts = pts.map((p) => d[0] * (p[0] - a[0]) + d[1] * (p[1] - a[1]));
      const t0 = Math.min(...ts); const t1 = Math.max(...ts);
      if (t1 - t0 > tol) addLine(sketch, 0, 0, 0, 0, { from: pointAt(a[0] + d[0] * t0, a[1] + d[1] * t0), to: pointAt(a[0] + d[0] * t1, a[1] + d[1] * t1) });
      return;
    }
  }
  // A circle through three of its points.
  const c = circleThrough(pts[0], pts[Math.floor(N / 2)], pts[Math.floor(N / 3)]);
  if (c && pts.every((p) => Math.abs(Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) - c.r) <= tol * 10 + c.r * 1e-9)) {
    if (chord <= tol) { addCircle(sketch, c.c[0], c.c[1], c.r); return; }
    const ang = (p) => Math.atan2(p[1] - c.c[1], p[0] - c.c[0]);
    const span = (from, to) => { let x = to - from; while (x < 0) x += 2 * Math.PI; return x; };
    const ccw = span(ang(a), ang(pts[Math.floor(N / 2)])) < span(ang(a), ang(b));
    const [p1, p2] = ccw ? [a, b] : [b, a];
    addArc(sketch, c.c[0], c.c[1], c.r, ang(p1), ang(p2), { from: pointAt(...p1), to: pointAt(...p2) });
    return;
  }
  const ids = pts.map((p, i) => (i === 0 || i === N ? pointAt(...p) : undefined));
  addSpline(sketch, pts, { ids });
}
function circleThrough(p, q, r) {
  const d = 2 * (p[0] * (q[1] - r[1]) + q[0] * (r[1] - p[1]) + r[0] * (p[1] - q[1]));
  if (Math.abs(d) < 1e-12) return null;
  const s = (v) => v[0] * v[0] + v[1] * v[1];
  const cx = (s(p) * (q[1] - r[1]) + s(q) * (r[1] - p[1]) + s(r) * (p[1] - q[1])) / d;
  const cy = (s(p) * (r[0] - q[0]) + s(q) * (p[0] - r[0]) + s(r) * (q[0] - p[0])) / d;
  return { c: [cx, cy], r: Math.hypot(p[0] - cx, p[1] - cy) };
}

/** Profiles of only the given curves (a sketch holding just them), each hole with the ids of its curves. */
function profilesOf(sketch, curves) {
  const ids = new Set(curves.flatMap((e) => [e.id, ...pointsOf(e)]));
  const tmp = { entities: sketch.entities.filter((e) => ids.has(e.id)), constraints: [] };
  const out = profiles(tmp);
  // Which curves make each hole: the curves whose middle lies on its boundary.
  return out.map((p) => ({ ...p, holes: p.holes.map((h) => ({ ...h, ids: curves.filter((e) => onLoop(tmp, e, h.points)).map((e) => e.id) })) }));
}
function onLoop(sk, e, pts) {
  const line = polyline(sk, e, undefined, 8);
  const m = line[Math.floor(line.length / 2)];
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    const d = [b[0] - a[0], b[1] - a[1]]; const l2 = d[0] * d[0] + d[1] * d[1] || 1;
    const t = Math.max(0, Math.min(1, ((m[0] - a[0]) * d[0] + (m[1] - a[1]) * d[1]) / l2));
    best = Math.min(best, Math.hypot(m[0] - a[0] - d[0] * t, m[1] - a[1] - d[1] * t));
  }
  return best < 1e-3;
}
