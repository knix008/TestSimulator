// 2D polygon helpers used after projecting a face onto its plane basis.
// ShapeUtils (earcut) from the main 'three' entry, so the app bundles only one copy.
import { ShapeUtils, Vector2 } from 'three';

// Signed area (> 0 for counter-clockwise) of [{x, y}].
export function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length, j = n - 1; i < n; j = i++) a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return a * 0.5;
}

// Even-odd point in polygon test.
export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, n = pts.length, j = n - 1; i < n; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Squared distance from p to segment a-b (2D).
export function distSeg2(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + dx * t - p.x, y = a.y + dy * t - p.y;
  return x * x + y * y;
}

export function minDistToLoop2(p, pts) {
  let m = Infinity;
  for (let i = 0, n = pts.length, j = n - 1; i < n; j = i++) m = Math.min(m, distSeg2(p, pts[j], pts[i]));
  return m;
}

// 'in' | 'on' | 'out' for a region with holes. tol is a distance.
export function classifyPoint(p, outer, holes, tol) {
  const t2 = tol * tol;
  if (minDistToLoop2(p, outer) <= t2) return 'on';
  for (const h of holes) if (minDistToLoop2(p, h) <= t2) return 'on';
  if (!pointInPolygon(p, outer)) return 'out';
  for (const h of holes) if (pointInPolygon(p, h)) return 'out';
  return 'in';
}

// Earcut triangulation; returns a flat array of indices into outer.concat(...holes).
export function triangulate2D(outer, holes = []) {
  if (outer.length === 3 && !holes.length) return [0, 1, 2];
  if (outer.length === 4 && !holes.length && isConvexQuad(outer)) return [0, 1, 2, 0, 2, 3];
  const V = (p) => new Vector2(p.x, p.y);
  const tris = ShapeUtils.triangulateShape(outer.map(V), holes.map((h) => h.map(V)));
  const out = new Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) { out[i * 3] = tris[i][0]; out[i * 3 + 1] = tris[i][1]; out[i * 3 + 2] = tris[i][2]; }
  return out;
}

function isConvexQuad(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-18) return false;
    const s = Math.sign(cr);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

// A point strictly inside a region (centroid of its largest triangle).
export function interiorPoint(outer, holes = []) {
  const all = outer.concat(...holes);
  const tri = triangulate2D(outer, holes);
  let best = null, bestA = -1;
  for (let i = 0; i < tri.length; i += 3) {
    const a = all[tri[i]], b = all[tri[i + 1]], c = all[tri[i + 2]];
    const ar = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    if (ar > bestA) { bestA = ar; best = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 }; }
  }
  if (!best) { // degenerate: average of the outer loop
    let x = 0, y = 0;
    for (const p of outer) { x += p.x; y += p.y; }
    best = { x: x / outer.length, y: y / outer.length };
  }
  return best;
}

// Intersection of 2D lines a + s*da and b + t*db; null when parallel.
export function lineLine2(a, da, b, db) {
  const den = da.x * db.y - da.y * db.x;
  if (Math.abs(den) < 1e-14) return null;
  const s = ((b.x - a.x) * db.y - (b.y - a.y) * db.x) / den;
  return { x: a.x + da.x * s, y: a.y + da.y * s, s };
}
