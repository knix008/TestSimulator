// Pitched roofs back from loose sloped faces (gbXML Roof surfaces and the
// like): faces of one storey are grouped into connected roofs, coplanar
// faces (a slope split per room) are merged into planes, and each roof is
// fitted to our roof model (src/core/roof.js) — shed (one plane), gable (two
// opposite planes), hip (four planes in two opposite pairs) — with its
// pitch, outline, overhang, orientation and height. A fit is kept only when
// the model's roof surface passes within a few centimetres of every input
// vertex and covers the same area; anything else (L-shaped and valley roofs,
// mansards, unequal pitches, curved roofs as facets) becomes a mass solid
// whose faces are the sloped faces as read, so the shape is still right in 3D.
//
// Points are plan millimetres [x, y (down), z (absolute)].

import { roofModel } from "../core/roof.js";
import { polygonArea, convexHull } from "../core/geom.js";

const r1 = (v) => Math.round(v * 10) / 10 || 0;

// Upward unit normal of a 3D polygon (Newell), or null when degenerate.
function upNormal(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(x, y, z);
  if (l < 1e-9) return null;
  return z < 0 ? [-x / l, -y / l, -z / l] : [x / l, y / l, z / l];
}

const centroid3 = (pts) => pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length, s[2] + q[2] / pts.length], [0, 0, 0]);
// Height of a plane (normal n through point o) above plan point (x, y).
const planeZ = (pl, x, y) => pl.o[2] - (pl.n[0] * (x - pl.o[0]) + pl.n[1] * (y - pl.o[1])) / pl.n[2];

function segDist3(p, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / L2));
  return Math.hypot(a[0] + d[0] * t - p[0], a[1] + d[1] * t - p[1], a[2] + d[2] * t - p[2]);
}

// Do two faces touch (a shared edge, a corner on the other's edge)?
function touching(A, B, tol = 40) {
  for (const p of A.pts) for (let i = 0; i < B.pts.length; i++) if (segDist3(p, B.pts[i], B.pts[(i + 1) % B.pts.length]) < tol) return true;
  for (const p of B.pts) for (let i = 0; i < A.pts.length; i++) if (segDist3(p, A.pts[i], A.pts[(i + 1) % A.pts.length]) < tol) return true;
  return false;
}

// Do two sloped faces share a ridge, hip or valley — an edge above the
// eaves (separate roofs that only meet at their eaves stay apart)?
function sharesRidge(A, B, tol = 40) {
  const zmin = Math.min(...A.pts.map((q) => q[2]), ...B.pts.map((q) => q[2]));
  for (let i = 0; i < A.pts.length; i++) {
    const a1 = A.pts[i], a2 = A.pts[(i + 1) % A.pts.length];
    const d = [a2[0] - a1[0], a2[1] - a1[1], a2[2] - a1[2]];
    const L = Math.hypot(...d);
    if (L < 100) continue;
    const u = d.map((x) => x / L);
    for (let j = 0; j < B.pts.length; j++) {
      const b1 = B.pts[j], b2 = B.pts[(j + 1) % B.pts.length];
      // Both ends of B's edge on A's edge line…
      const t = (p) => (p[0] - a1[0]) * u[0] + (p[1] - a1[1]) * u[1] + (p[2] - a1[2]) * u[2];
      const off = (p) => { const k = t(p); return Math.hypot(a1[0] + u[0] * k - p[0], a1[1] + u[1] * k - p[1], a1[2] + u[2] * k - p[2]); };
      if (off(b1) > tol || off(b2) > tol) continue;
      // …overlapping it by 100 mm or more, above the eaves.
      const lo = Math.max(0, Math.min(t(b1), t(b2))), hi = Math.min(L, Math.max(t(b1), t(b2)));
      if (hi - lo < 100) continue;
      const mz = a1[2] + u[2] * (lo + hi) / 2;
      if (mz > zmin + 50) return true;
    }
  }
  return false;
}

// Faces → connected groups (union-find). Sloped faces join over a shared
// ridge / hip / valley edge; with { flat: true } any touch joins.
export function groupFaces(faces, { flat = false } = {}) {
  const linked = flat ? touching : sharesRidge;
  const parent = faces.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const box = faces.map((f) => { const xs = f.pts.map((q) => q[0]), ys = f.pts.map((q) => q[1]); return [Math.min(...xs) - 50, Math.min(...ys) - 50, Math.max(...xs) + 50, Math.max(...ys) + 50]; });
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const a = box[i], b = box[j];
      if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;
      if (find(i) !== find(j) && linked(faces[i], faces[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  faces.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });
  return [...groups.values()];
}

// Coplanar faces of a group → planes {n, o, faces, slope (deg), dir (downhill, plan)}.
function planesOf(faces) {
  const planes = [];
  for (const f of faces) {
    const n = f.n || upNormal(f.pts);
    if (!n) continue;
    const c = centroid3(f.pts);
    const hit = planes.find((pl) => pl.n[0] * n[0] + pl.n[1] * n[1] + pl.n[2] * n[2] > Math.cos((2 * Math.PI) / 180) && Math.abs(planeZ(pl, c[0], c[1]) - c[2]) < 40);
    if (hit) hit.faces.push(f);
    else planes.push({ n, o: c, faces: [f] });
  }
  for (const pl of planes) {
    pl.slope = (Math.acos(Math.min(1, pl.n[2])) * 180) / Math.PI;
    const h = Math.hypot(pl.n[0], pl.n[1]) || 1;
    pl.dir = [pl.n[0] / h, pl.n[1] / h];
    pl.area = pl.faces.reduce((s, f) => s + Math.abs(polygonArea(f.pts.map((q) => [q[0], q[1]]))), 0);
  }
  return planes;
}

// The lower envelope of the model's roof faces at (x, y).
function modelZ(model, x, y) {
  let z = Infinity;
  for (const pl of model) { const v = planeZ(pl, x, y); if (v < z) z = v; }
  return z;
}

// Fit one connected group. lv: {elevation, height}; walls: plan walls of
// the storey (for the overhang). → {roof, error} or null.
export function fitRoof(faces, lv, walls = []) {
  const planes = planesOf(faces);
  if (!planes.length || planes.length > 4) return null;
  const kinds = planes.length === 1 ? ["shed"] : planes.length === 2 ? ["gable"] : planes.length === 4 ? ["hip"] : [];
  if (!kinds.length) return null;
  const slopes = planes.map((pl) => pl.slope);
  const pitch = slopes.reduce((s, v) => s + v, 0) / slopes.length;
  if (Math.max(...slopes) - Math.min(...slopes) > 1.5 || pitch < 2 || pitch > 75) return null;
  // Opposite pairs: a gable's two planes face apart; a hip's four planes are two opposite pairs at right angles.
  const d = planes.map((pl) => pl.dir);
  const dotd = (a, b) => a[0] * b[0] + a[1] * b[1];
  if (kinds[0] === "gable" && dotd(d[0], d[1]) > -0.995) return null;
  if (kinds[0] === "hip") {
    const opp = d.map((a) => d.findIndex((b) => dotd(a, b) < -0.995));
    if (opp.some((j) => j < 0)) return null;
    if (!d.some((a) => Math.abs(dotd(a, d[0])) < 0.05)) return null;
  }
  const pts = faces.flatMap((f) => f.pts);
  // Frame: v along the main downhill direction, u across it.
  const vdir = d[0];
  const udir = [-vdir[1], vdir[0]];
  const U = (q) => q[0] * udir[0] + q[1] * udir[1], V = (q) => q[0] * vdir[0] + q[1] * vdir[1];
  const us = pts.map(U), vs = pts.map(V);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  const footArea = (u1 - u0) * (v1 - v0);
  const area = planes.reduce((s, pl) => s + pl.area, 0);
  if (Math.abs(area - footArea) > 0.12 * footArea) return null;
  const zmin = Math.min(...pts.map((q) => q[2]));
  const tan = Math.tan((pitch * Math.PI) / 180);
  // Overhang: the walls inside the outline sit the same distance in from every edge.
  let overhang = 0;
  const inside = walls.filter((w) => [[w.x1, w.y1], [w.x2, w.y2]].every((q) => U(q) > u0 - 1 && U(q) < u1 + 1 && V(q) > v0 - 1 && V(q) < v1 + 1));
  if (inside.length) {
    const wu = inside.flatMap((w) => [U([w.x1, w.y1]), U([w.x2, w.y2])]), wv = inside.flatMap((w) => [V([w.x1, w.y1]), V([w.x2, w.y2])]);
    const m = [Math.min(...wu) - u0, u1 - Math.max(...wu), Math.min(...wv) - v0, v1 - Math.max(...wv)];
    if (m.every((x) => x >= -1 && x < 2000) && Math.max(...m) - Math.min(...m) < 150) overhang = Math.max(0, r1(m.reduce((s, x) => s + x, 0) / 4));
  }
  const rect = (o) => [[u0 + o, v0 + o], [u1 - o, v0 + o], [u1 - o, v1 - o], [u0 + o, v1 - o]].map(([u, v]) => [r1(u * udir[0] + v * vdir[0]), r1(u * udir[1] + v * vdir[1])]);
  const top = lv.elevation + lv.height;
  const span = Math.max(u1 - u0, v1 - v0);
  const tol = Math.max(60, span * 0.01);
  let best = null;
  for (const o of overhang ? [overhang, 0] : [0]) {
    if (best && best.error <= tol) break; // the overhang the walls suggest fits
    if (u1 - u0 <= 2 * o + 100 || v1 - v0 <= 2 * o + 100) continue;
    for (const rot of [0, 90, 180, 270]) {
      const base = zmin + o * tan;
      const roof = { kind: kinds[0], pts: rect(o), pitch: r1(pitch), overhang: o, rot };
      const m = roofModel(roof, base);
      const model = m.faces.map((f) => ({ n: upNormal(f.pts), o: centroid3(f.pts) })).filter((x) => x.n && x.n[2] > 1e-3);
      if (!model.length) continue;
      let err = 0;
      for (const q of pts) { const e = Math.abs(modelZ(model, q[0], q[1]) - q[2]); if (e > err) err = e; }
      // Same plan footprint as the faces.
      const out = m.outline;
      const ou = out.map(U), ov = out.map(V);
      err = Math.max(err, Math.abs(Math.min(...ou) - u0), Math.abs(Math.max(...ou) - u1), Math.abs(Math.min(...ov) - v0), Math.abs(Math.max(...ov) - v1));
      if (!best || err < best.error - 1e-6) best = { roof: { ...roof, offset: r1(base - top) }, error: err };
    }
  }
  if (!best || best.error > tol) return null;
  const roof = best.roof;
  if (!roof.rot) delete roof.rot;
  if (Math.abs(roof.offset) < 30) delete roof.offset;
  return best;
}

// Faces of one storey → {roofs, solids} (without ids/levels; the caller adds them).
// faces: [{pts: [[x, y, z]…], th}]
export function rebuildRoofs(faces, lv, walls = []) {
  const roofs = [];
  const solids = [];
  for (const group of groupFaces(faces)) {
    const th = group.reduce((s, f) => s + (f.th || 200), 0) / group.length;
    const fit = fitRoof(group, lv, walls);
    if (fit) { roofs.push({ ...fit.roof, thickness: r1(th), faces: group.length }); continue; }
    const pts = group.flatMap((f) => f.pts);
    const zs = pts.map((q) => q[2]);
    const zmin = Math.min(...zs), zmax = Math.max(...zs);
    const hull = convexHull(pts.map((q) => [q[0], q[1]]));
    if (hull.length < 3) continue;
    solids.push({
      kind: "roof", pts: hull.map(([x, y]) => [r1(x), r1(y)]), z0: r1(zmin - lv.elevation), height: r1(Math.max(1, zmax - zmin)), taper: 1,
      material: "roof-tiles", thickness: r1(th), faces: group.map((f) => f.pts.map(([x, y, z]) => [r1(x), r1(y), r1(z - lv.elevation)])),
    });
  }
  return { roofs, solids };
}
