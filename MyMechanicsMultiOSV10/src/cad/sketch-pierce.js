// The pierce relation: a sketch point held where a curve outside the sketch — a curve of another sketch, or a
// curve feature (3D sketch, helix, curve through points …) — passes through the sketch's plane. The crossing is
// found on the curve itself (sign changes of the distance to the plane along it, then bisection to the last
// bit), the one nearest the point when the curve crosses more than once. The relation keeps the crossing in
// sketch coordinates (x, y), refreshed whenever the part rebuilds (and the sketch solved again with it).
//   constraint: { type: 'pierce', a: pointId, src: { feature, entity? }, x, y }
import { arcGeometry, byId, polyline, splineBeziers, bezierPoint, solveSketch } from './sketch.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const toWorld = (f, [u, v]) => [0, 1, 2].map((i) => f.origin[i] + f.xDir[i] * u + f.yDir[i] * v);
const toUV = (f, p) => { const d = sub(p, f.origin); return [dot(d, f.xDir), dot(d, f.yDir)]; };

/** A curve of a 2D sketch as a function of t ∈ [0, 1] in the world (null for points and text). */
export function sketchCurveFn(sketch, frame, e) {
  if (!e) return null;
  if (e.type === 'line') { const a = byId(sketch, e.p1); const b = byId(sketch, e.p2); return (t) => toWorld(frame, [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]); }
  if (e.type === 'arc') { const g = arcGeometry(sketch, e); return (t) => { const ang = g.a0 + (g.a1 - g.a0) * t; return toWorld(frame, [g.cx + g.r * Math.cos(ang), g.cy + g.r * Math.sin(ang)]); }; }
  if (e.type === 'circle') { const c = byId(sketch, e.c); return (t) => toWorld(frame, [c.x + e.r * Math.cos(2 * Math.PI * t), c.y + e.r * Math.sin(2 * Math.PI * t)]); }
  if (e.type === 'spline') {
    const bz = splineBeziers(sketch, e);
    return (t) => { const k = Math.min(bz.length - 1, Math.floor(t * bz.length)); const u = t * bz.length - k; return toWorld(frame, bezierPoint(bz[k], u)); };
  }
  // Other curves along their drawn points (fine enough to bisect on the straight pieces between them).
  const pts = polyline(sketch, e, undefined, 512);
  if (!pts?.length) return null;
  return (t) => { const x = t * (pts.length - 1); const k = Math.min(pts.length - 2, Math.floor(x)); const u = x - k; return toWorld(frame, [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u]); };
}

/** A kernel edge (replicad) as a function of t ∈ [0, 1]. */
export const edgeFn = (edge) => (t) => { const p = edge.pointAt(t); return [p.x, p.y, p.z]; };

/** Where curve `fn` passes through the plane of `frame`: points [u, v] in the plane's coordinates. */
export function planeCrossings(frame, fn, samples = 256) {
  const s = (t) => dot(sub(fn(t), frame.origin), frame.normal);
  const out = [];
  let t0 = 0; let s0 = s(0);
  if (Math.abs(s0) < 1e-12) out.push(toUV(frame, fn(0)));
  for (let i = 1; i <= samples; i++) {
    const t1 = i / samples; const s1 = s(t1);
    if (Math.abs(s1) < 1e-12) out.push(toUV(frame, fn(t1)));
    else if (s0 * s1 < 0 && Math.abs(s0) >= 1e-12) {
      let a = t0, b = t1, sa = s0;
      for (let k = 0; k < 80; k++) { const m = (a + b) / 2; const sm = s(m); if (sa * sm <= 0) b = m; else { a = m; sa = sm; } }
      out.push(toUV(frame, fn((a + b) / 2)));
    }
    t0 = t1; s0 = s1;
  }
  return out;
}

/**
 * The curve a pierce relation names, as a function: another sketch's entity (needs that sketch and its frame), or a
 * curve feature's edges (`curves`: feature id → kernel shape with edges). Returns [fn] (a curve feature may have
 * several edges).
 */
export function pierceSources(src, { features, frames, curves }) {
  const f = features.find((x) => x.id === src.feature);
  if (!f) return [];
  if (f.type === 'sketch') {
    const fr = frames.get(f.id);
    const fn = fr && src.entity ? sketchCurveFn(f, fr, byId(f, src.entity)) : null;
    return fn ? [fn] : [];
  }
  const shape = curves?.get(f.id);
  const edges = shape?.edges ?? (shape ? [shape] : []);
  return edges.filter((e) => typeof e?.pointAt === 'function').map(edgeFn);
}

/**
 * Moves every pierce relation of `sketch` (on `frame`) to where its curve crosses the plane now (nearest to the
 * point), and solves the sketch when one moved. Returns { moved, missing: [constraint ids with no crossing] }.
 */
export function refreshPierce(sketch, frame, sources) {
  let moved = 0; const missing = [];
  for (const c of sketch.constraints ?? []) {
    if (c.type !== 'pierce') continue;
    const fns = pierceSources(c.src ?? {}, sources);
    const p = byId(sketch, c.a);
    const hits = fns.flatMap((fn) => planeCrossings(frame, fn));
    if (!hits.length || !p) { missing.push(c.id); continue; }
    const best = hits.reduce((m, h) => (Math.hypot(h[0] - p.x, h[1] - p.y) < Math.hypot(m[0] - p.x, m[1] - p.y) ? h : m));
    if (Math.abs(best[0] - (c.x ?? NaN)) > 1e-12 || Math.abs(best[1] - (c.y ?? NaN)) > 1e-12 || !Number.isFinite(c.x)) { c.x = best[0]; c.y = best[1]; moved++; }
  }
  if (moved) solveSketch(sketch);
  return { moved, missing };
}
