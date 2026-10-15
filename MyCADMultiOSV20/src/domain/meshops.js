// FreeCAD Mesh, MeshPart, Points, Reverse Engineering, Surface and Inspection
// operations on triangle meshes ([[p, q, r], …] with p = [x, y, z]) and point
// clouds ([[x, y, z], …]): bounding box, curvature, holes, flipping, refining,
// smoothing, trimming with a plane, cutting with a screen polygon,
// cross-sections, segmentation (smooth regions, best-fit planes / cylinders /
// spheres), unwrapping (least-squares conformal map), curves on a mesh, blend
// curves, extending a face, curve and surface fitting, implicit surface
// reconstruction from points, and distances for inspection.

import { meshPieces } from './partops.js';
import { meshTopology } from './topology.js';
import { fitCylinder, fitPlane, fitSphere, principalAxes } from './points.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const keyOf = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;

/** Shared vertices of a triangle soup: { points, faces: [[i, j, k]] }. */
export function indexMesh(tris) {
  const points = [];
  const index = new Map();
  const id = (p) => { const k = keyOf(p); if (!index.has(k)) { index.set(k, points.length); points.push(p.slice()); } return index.get(k); };
  return { points, faces: tris.map((t) => t.map(id)) };
}
const soup = ({ points, faces }) => faces.map((f) => f.map((i) => points[i].slice()));

// ───────────────────────── information

/** Mesh_BoundingBox. */
export function boundingBox(tris) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const p of t) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  if (!Number.isFinite(min[0])) return null;
  return { min, max, size: sub(max, min), center: mul(add(min, max), 0.5) };
}

/** Area and unit normal of a triangle. */
export function triangleInfo([p, q, r]) {
  const n = cross(sub(q, p), sub(r, p));
  return { area: len(n) / 2, normal: unit(n), center: mul(add(add(p, q), r), 1 / 3) };
}

/**
 * Mesh_CurvatureInfo / Mesh_VertexCurvature: discrete curvatures at every
 * vertex — Gaussian (angle deficit over area) and mean (cotangent Laplacian),
 * with the principal curvatures from them.
 */
export function vertexCurvatures(tris) {
  const { points, faces } = indexMesh(tris);
  const n = points.length;
  const angleSum = new Float64Array(n);
  const area = new Float64Array(n);
  const lap = Array.from({ length: n }, () => [0, 0, 0]);
  const normal = Array.from({ length: n }, () => [0, 0, 0]);
  const boundary = new Set();
  const edgeCount = new Map();
  for (const f of faces) {
    const fn = cross(sub(points[f[1]], points[f[0]]), sub(points[f[2]], points[f[0]]));
    const a = len(fn) / 2;
    for (let k = 0; k < 3; k++) {
      const i = f[k]; const j = f[(k + 1) % 3]; const m = f[(k + 2) % 3];
      const u = sub(points[j], points[i]); const v = sub(points[m], points[i]);
      angleSum[i] += Math.acos(Math.max(-1, Math.min(1, dot(u, v) / ((len(u) * len(v)) || 1e-30))));
      area[i] += a / 3;
      normal[i] = add(normal[i], fn);
      // Cotangent of the angle at m weighs edge ij.
      const e1 = sub(points[i], points[m]); const e2 = sub(points[j], points[m]);
      const cot = dot(e1, e2) / (len(cross(e1, e2)) || 1e-30);
      const d = sub(points[j], points[i]);
      lap[i] = add(lap[i], mul(d, cot / 2));
      lap[j] = add(lap[j], mul(d, -cot / 2));
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edgeCount) if (count === 1) for (const i of key.split(',').map(Number)) boundary.add(i);
  return points.map((p, i) => {
    if (boundary.has(i) || area[i] < 1e-30) return { point: p, gaussian: 0, mean: 0, k1: 0, k2: 0, boundary: true };
    const gaussian = (2 * Math.PI - angleSum[i]) / area[i];
    const hn = mul(lap[i], 1 / (2 * area[i]));
    // Sign: positive where the surface bends away from its normal (a sphere seen from outside).
    const mean = -Math.sign(dot(hn, normal[i]) || 1) * len(hn);
    const root = Math.sqrt(Math.max(0, mean * mean - gaussian));
    return { point: p, gaussian, mean, k1: mean + root, k2: mean - root, boundary: false };
  });
}

/** A colour (r, g, b in 0…1) for a value on a blue → green → red scale between lo and hi. */
export function colorScale(value, lo, hi) {
  const t = hi > lo ? Math.max(0, Math.min(1, (value - lo) / (hi - lo))) : 0.5;
  if (t < 0.5) { const s = t / 0.5; return [0, s, 1 - s]; }
  const s = (t - 0.5) / 0.5;
  return [s, 1 - s, 0];
}

// ───────────────────────── editing

/** Mesh_FlipNormals. */
export const flipNormals = (tris) => tris.map(([p, q, r]) => [p, r, q]);

/** Mesh_Scale: about the box centre (or a given point). */
export function scaleMesh(tris, factor, about = boundingBox(tris)?.center ?? [0, 0, 0]) {
  return tris.map((t) => t.map((p) => add(about, mul(sub(p, about), factor))));
}

/** Mesh_AddFacet: one more triangle, turned to agree with its neighbour sharing an edge. */
export function addFacet(tris, tri) {
  const keys = tri.map(keyOf);
  for (const t of tris) {
    const k = t.map(keyOf);
    for (let i = 0; i < 3; i++) {
      // A shared edge in the same direction means the new one faces the other way.
      for (let j = 0; j < 3; j++) if (k[i] === keys[j] && k[(i + 1) % 3] === keys[(j + 1) % 3]) return [...tris, [tri[0], tri[2], tri[1]]];
    }
  }
  return [...tris, tri];
}

/** Boundary loops (open edges joined): [[vertex index…]] with the indexed mesh. */
export function boundaryLoops(tris) {
  const mesh = indexMesh(tris);
  const half = new Map();
  for (const f of mesh.faces) for (let k = 0; k < 3; k++) half.set(`${f[k]},${f[(k + 1) % 3]}`, [f[k], f[(k + 1) % 3]]);
  // A half-edge without its twin is on the boundary; walk them (twin direction gives the hole's order).
  const next = new Map();
  for (const [, [a, b]] of half) if (!half.has(`${b},${a}`)) next.set(b, a);
  const loops = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let at = start;
    for (let guard = 0; guard <= next.size && !seen.has(at); guard++) { seen.add(at); loop.push(at); at = next.get(at); if (at === undefined) break; }
    if (loop.length >= 3 && at === start) loops.push(loop);
  }
  return { mesh, loops };
}

/** Mesh_FillInteractiveHole / Mesh_FillupHoles: holes closed by a fan round their centre (the nearest to `near`, or all). */
export function fillHoles(tris, { near = null, maxEdges = Infinity } = {}) {
  const { mesh, loops } = boundaryLoops(tris);
  const usable = loops.filter((l) => l.length <= maxEdges);
  let chosen = usable;
  if (near) {
    const d = (l) => Math.min(...l.map((i) => len(sub(mesh.points[i], near))));
    chosen = usable.length ? [usable.slice().sort((a, b) => d(a) - d(b))[0]] : [];
  }
  const out = tris.slice();
  for (const loop of chosen) {
    const c = mul(loop.reduce((s, i) => add(s, mesh.points[i]), [0, 0, 0]), 1 / loop.length);
    for (let k = 0; k < loop.length; k++) out.push([mesh.points[loop[k]].slice(), mesh.points[loop[(k + 1) % loop.length]].slice(), c.slice()]);
  }
  return { tris: out, filled: chosen.length };
}

/** Mesh_RemeshGmsh (refinement): every edge longer than maxEdge is split (repeatedly). */
export function refineMesh(tris, maxEdge) {
  let out = tris;
  for (let pass = 0; pass < 12; pass++) {
    let split = false;
    const next = [];
    for (const [p, q, r] of out) {
      const e = [len(sub(q, p)), len(sub(r, q)), len(sub(p, r))];
      const m = e.indexOf(Math.max(...e));
      if (e[m] <= maxEdge) { next.push([p, q, r]); continue; }
      split = true;
      const v = [p, q, r];
      const a = v[m]; const b = v[(m + 1) % 3]; const c = v[(m + 2) % 3];
      const mid = lerp(a, b, 0.5);
      next.push([a, mid, c], [mid, b, c]);
    }
    out = next;
    if (!split || out.length > 400000) break;
  }
  // Neighbours split on one side only leave T-joints; the shared midpoints are already exact, so the surface stays the same.
  return out;
}

/** Mesh_Smoothing: Taubin λ|μ smoothing (keeps the volume, unlike plain Laplacian smoothing). Borders stay. */
export function smoothMesh(tris, { iterations = 5, lambda = 0.5, mu = -0.53 } = {}) {
  const { points, faces } = indexMesh(tris);
  const neighbours = points.map(() => new Set());
  const edgeCount = new Map();
  for (const f of faces) for (let k = 0; k < 3; k++) {
    const a = f[k]; const b = f[(k + 1) % 3];
    neighbours[a].add(b); neighbours[b].add(a);
    const key2 = a < b ? `${a},${b}` : `${b},${a}`;
    edgeCount.set(key2, (edgeCount.get(key2) ?? 0) + 1);
  }
  const fixed = new Set();
  for (const [k, c] of edgeCount) if (c === 1) for (const i of k.split(',').map(Number)) fixed.add(i);
  let P = points.map((p) => p.slice());
  const step = (factor) => {
    P = P.map((p, i) => {
      if (fixed.has(i) || !neighbours[i].size) return p;
      let avg = [0, 0, 0];
      for (const j of neighbours[i]) avg = add(avg, P[j]);
      avg = mul(avg, 1 / neighbours[i].size);
      return add(p, mul(sub(avg, p), factor));
    });
  };
  for (let i = 0; i < iterations; i++) { step(lambda); step(mu); }
  return soup({ points: P, faces });
}

/** Mesh_SplitComponents / Reen_SegmentationFromComponents. */
export const splitComponents = (tris) => meshPieces(tris);

// ───────────────────────── planes and polygons

/**
 * Mesh_TrimByPlane / MeshPart_TrimByPlane: the part on the plane's back side
 * (n·(p − o) ≤ 0); triangles across it are cut. keep: 'below' | 'above'.
 */
export function trimByPlane(tris, origin, normal, keep = 'below') {
  const n = unit(normal);
  const s = keep === 'below' ? 1 : -1;
  const side = (p) => s * dot(n, sub(p, origin));
  const out = [];
  for (const tri of tris) {
    const d = tri.map(side);
    const inside = d.map((v) => v <= 1e-12);
    const count = inside.filter(Boolean).length;
    if (count === 3) { out.push(tri); continue; }
    if (count === 0) continue;
    // Walk the triangle and keep the inside polygon, cutting each crossing edge.
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k]; const b = tri[(k + 1) % 3];
      const da = d[k]; const db = d[(k + 1) % 3];
      if (da <= 1e-12) poly.push(a);
      if ((da <= 1e-12) !== (db <= 1e-12)) poly.push(lerp(a, b, da / (da - db)));
    }
    for (let k = 1; k + 1 < poly.length; k++) out.push([poly[0], poly[k], poly[k + 1]]);
  }
  return out;
}

/** Is a 2D point inside a polygon ([[x, y], …])? */
export function insidePolygon([x, y], polygon) {
  let c = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Mesh_PolyCut / PolyTrim / PolySplit / PolySegm and Points_PolyCut: which
 * triangles (or points) fall inside a screen polygon, given a projector
 * p → [x, y] (screen) — a triangle by its centre.
 */
export function insideScreenPolygon(items, project, polygon, centreOf = (t) => mul(add(add(t[0], t[1]), t[2]), 1 / 3)) {
  return items.map((item) => insidePolygon(project(Array.isArray(item[0]) ? centreOf(item) : item), polygon));
}

// ───────────────────────── cross-sections

/** Segments where triangles cross the plane n·p = d. */
function planeSegments(tris, n, d) {
  const out = [];
  for (const tri of tris) {
    const s = tri.map((p) => dot(n, p) - d).map((v) => (Math.abs(v) < 1e-12 ? 1e-12 : v));
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const a = s[k]; const b = s[(k + 1) % 3];
      if ((a > 0) !== (b > 0)) pts.push(lerp(tri[k], tri[(k + 1) % 3], a / (a - b)));
    }
    if (pts.length === 2) out.push(pts);
  }
  return out;
}

/** Segments joined into 3D polylines. */
export function chain3d(segments, tolerance = 1e-6) {
  const k = (p) => `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)},${Math.round(p[2] / tolerance)}`;
  const ends = new Map();
  segments.forEach((s, i) => { for (const p of s) { const key3 = k(p); if (!ends.has(key3)) ends.set(key3, []); ends.get(key3).push(i); } });
  const used = new Set();
  const out = [];
  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;
    used.add(start);
    const pts = [segments[start][0], segments[start][1]];
    for (const forward of [true, false]) {
      let at = start;
      for (let guard = 0; guard < segments.length; guard++) {
        const tip = forward ? pts[pts.length - 1] : pts[0];
        const i = (ends.get(k(tip)) ?? []).find((j) => j !== at && !used.has(j));
        if (i === undefined) break;
        used.add(i);
        const other = k(segments[i][0]) === k(tip) ? segments[i][1] : segments[i][0];
        if (forward) pts.push(other); else pts.unshift(other);
        at = i;
      }
    }
    out.push(pts);
  }
  return out;
}

/** Mesh_CrossSections / MeshPart_CrossSections: `count` sections across an axis ('x' | 'y' | 'z'), as 3D polylines. */
export function crossSections(tris, axis, count) {
  const box = boundingBox(tris);
  if (!box) return [];
  const a = { x: 0, y: 1, z: 2 }[axis] ?? 2;
  const n = [0, 0, 0];
  n[a] = 1;
  const out = [];
  for (let i = 1; i <= count; i++) {
    const d = box.min[a] + (box.size[a] * i) / (count + 1);
    out.push(...chain3d(planeSegments(tris, n, d)));
  }
  return out;
}

// ───────────────────────── segmentation

/** Mesh_Segmentation: the smooth regions (faces between creases), each as triangles. */
export function segmentSmooth(tris, crease = 22) {
  const topology = meshTopology(tris, { crease });
  return topology.faces.map((face) => face.triangles.map((i) => tris[i]));
}

/**
 * Mesh_SegmentationBestFit / Reen_Segmentation: the smooth regions labelled by
 * the surface that fits them best (plane, cylinder, sphere, or free form).
 */
export function segmentBestFit(tris, tolerance = 0.05) {
  return segmentSmooth(tris).map((region) => {
    // Vertices and edge midpoints: a region's vertices alone can lie on a few circles a sphere also fits.
    const flat = region.flatMap((t) => [...t, ...t.map((p, k) => lerp(p, t[(k + 1) % 3], 0.5))].flatMap((p) => p));
    const box = boundingBox(region);
    const size = Math.max(...box.size) || 1;
    const fits = [];
    const plane = fitPlane(flat);
    if (plane) fits.push({ type: 'plane', error: plane.rms });
    const sphere = region.length >= 4 ? fitSphere(flat) : null;
    if (sphere && sphere.radius < size * 50) fits.push({ type: 'sphere', error: sphere.rms });
    const cyl = region.length >= 4 ? fitCylinder(flat) : null;
    if (cyl && cyl.radius < size * 50) fits.push({ type: 'cylinder', error: cyl.rms });
    fits.sort((a, b) => a.error - b.error);
    const best = fits[0] && fits[0].error <= tolerance * size ? fits[0] : { type: 'freeform', error: fits[0]?.error ?? 0 };
    return { type: best.type, error: best.error, tris: region };
  });
}

// ───────────────────────── unwrapping (MeshPart_CreateFlatMesh / CreateFlatFace)

/**
 * A mesh laid flat by a least-squares conformal map: each vertex gets (u, v)
 * that keep the triangles' angles; two far-apart vertices are pinned.
 * Returns { uv: [[u, v]], faces, points } scaled to the 3D size.
 */
export function unwrapMesh(tris) {
  const { points, faces } = indexMesh(tris);
  const n = points.length;
  if (n < 3) return null;
  // Pins: the two vertices farthest apart along the main axis.
  let a = 0; let b = 0;
  for (let i = 0; i < n; i++) { if (points[i][0] + points[i][1] + points[i][2] < points[a][0] + points[a][1] + points[a][2]) a = i; }
  for (let i = 0; i < n; i++) if (len(sub(points[i], points[a])) > len(sub(points[b], points[a]))) b = i;
  const pinned = new Map([[a, [0, 0]], [b, [len(sub(points[b], points[a])), 0]]]);
  // Unknowns: u, v of the free vertices.
  const freeIndex = new Map();
  for (let i = 0; i < n; i++) if (!pinned.has(i)) freeIndex.set(i, freeIndex.size);
  const m = freeIndex.size * 2;
  // Rows of the conformal energy (two per triangle), as sparse lists.
  const rows = [];
  for (const f of faces) {
    const [p0, p1, p2] = f.map((i) => points[i]);
    const e1 = sub(p1, p0); const e2 = sub(p2, p0);
    const x1 = len(e1);
    if (x1 < 1e-15) continue;
    const ex = mul(e1, 1 / x1);
    const nn = cross(e1, e2);
    const area2 = len(nn);
    if (area2 < 1e-15) continue;
    const ey = unit(cross(unit(nn), ex));
    const local = [[0, 0], [x1, 0], [dot(e2, ex), dot(e2, ey)]];
    const s = 1 / Math.sqrt(area2);
    // W_j = (x_k − x_l) + i (y_k − y_l) over the triangle's corners (cyclic).
    const W = [0, 1, 2].map((j) => { const kk = (j + 1) % 3; const l = (j + 2) % 3; return [local[l][0] - local[kk][0], local[l][1] - local[kk][1]]; });
    const real = []; const imag = []; let rr = 0; let ri = 0;
    for (let j = 0; j < 3; j++) {
      const vi = f[j];
      const [wr, wi] = W[j];
      if (pinned.has(vi)) {
        const [u, v] = pinned.get(vi);
        rr -= s * (wr * u - wi * v);
        ri -= s * (wi * u + wr * v);
      } else {
        const col = freeIndex.get(vi) * 2;
        real.push([col, s * wr], [col + 1, -s * wi]);
        imag.push([col, s * wi], [col + 1, s * wr]);
      }
    }
    rows.push({ cols: real, rhs: rr }, { cols: imag, rhs: ri });
  }
  // Conjugate gradient on the normal equations AᵀA x = Aᵀb.
  const Ax = (x) => rows.map((r) => r.cols.reduce((s, [c, w]) => s + w * x[c], 0));
  const ATy = (y) => { const out = new Float64Array(m); rows.forEach((r, i) => { for (const [c, w] of r.cols) out[c] += w * y[i]; }); return out; };
  const bvec = rows.map((r) => r.rhs);
  let x = new Float64Array(m);
  let r = ATy(bvec);
  let p = r.slice();
  let rs = r.reduce((s, v) => s + v * v, 0);
  for (let it = 0; it < Math.min(4000, m * 2 + 50) && rs > 1e-24; it++) {
    const Ap = ATy(Ax(p));
    const alpha = rs / (p.reduce((s, v, i) => s + v * Ap[i], 0) || 1e-30);
    x = x.map((v, i) => v + alpha * p[i]);
    r = r.map((v, i) => v - alpha * Ap[i]);
    const next = r.reduce((s, v) => s + v * v, 0);
    p = p.map((v, i) => r[i] + (next / rs) * v);
    rs = next;
  }
  let uv = points.map((_, i) => (pinned.has(i) ? pinned.get(i) : [x[freeIndex.get(i) * 2], x[freeIndex.get(i) * 2 + 1]]));
  // The pins fix the size by a straight 3D distance; the flat piece is scaled to the surface's own area.
  const area2d = faces.reduce((s, f) => { const [a2, b2, c2] = f.map((i) => uv[i]); return s + Math.abs((b2[0] - a2[0]) * (c2[1] - a2[1]) - (c2[0] - a2[0]) * (b2[1] - a2[1])) / 2; }, 0);
  const area3d = faces.reduce((s, f) => s + len(cross(sub(points[f[1]], points[f[0]]), sub(points[f[2]], points[f[0]]))) / 2, 0);
  const k = area2d > 1e-30 ? Math.sqrt(area3d / area2d) : 1;
  uv = uv.map(([u, v]) => [u * k, v * k]);
  return { uv, faces, points };
}

/** The outline (boundary loops) and inner edges of an unwrapped mesh, as 2D paths. */
export function unwrappedOutline({ uv, faces }) {
  const count = new Map();
  for (const f of faces) for (let k = 0; k < 3; k++) {
    const a = f[k]; const b = f[(k + 1) % 3];
    const key2 = a < b ? `${a},${b}` : `${b},${a}`;
    count.set(key2, (count.get(key2) ?? 0) + 1);
  }
  const boundary = [...count].filter(([, c]) => c === 1).map(([k]) => k.split(',').map(Number).map((i) => uv[i]));
  return boundary.map(([p, q]) => [{ x: p[0], y: p[1] }, { x: q[0], y: q[1] }]);
}

// ───────────────────────── curves on meshes, blends, extending

/** The point of a triangle nearest to p. */
export function closestOnTriangle(p, [a, b, c]) {
  const ab = sub(b, a); const ac = sub(c, a); const ap = sub(p, a);
  const d1 = dot(ab, ap); const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b); const d3 = dot(ab, bp); const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c); const d5 = dot(ab, cp); const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add(a, add(mul(ab, vb * denom), mul(ac, vc * denom)));
}

/** A grid of triangles for nearest-point queries. */
export function triangleGrid(tris, cells = 24) {
  const box = boundingBox(tris);
  const size = Math.max(...box.size, 1e-9);
  const h = size / cells;
  const grid = new Map();
  const cell = (p) => p.map((v, k) => Math.floor((v - box.min[k]) / h));
  tris.forEach((t, i) => {
    const lo = [0, 1, 2].map((k) => Math.min(t[0][k], t[1][k], t[2][k]));
    const hi = [0, 1, 2].map((k) => Math.max(t[0][k], t[1][k], t[2][k]));
    const [a, b] = [cell(lo), cell(hi)];
    for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) {
      const k = `${x},${y},${z}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  });
  /** The nearest point of the mesh to p, with its distance and triangle. */
  const nearest = (p) => {
    const c = cell(p);
    let best = null;
    for (let ring = 0; ring <= cells * 2; ring++) {
      const seen = new Set();
      for (let x = c[0] - ring; x <= c[0] + ring; x++) for (let y = c[1] - ring; y <= c[1] + ring; y++) for (let z = c[2] - ring; z <= c[2] + ring; z++) {
        if (Math.max(Math.abs(x - c[0]), Math.abs(y - c[1]), Math.abs(z - c[2])) !== ring) continue;
        for (const i of grid.get(`${x},${y},${z}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const q = closestOnTriangle(p, tris[i]);
          const d = len(sub(p, q));
          if (!best || d < best.distance) best = { point: q, distance: d, triangle: i };
        }
      }
      // Anything in a further ring is at least ring·h away.
      if (best && best.distance <= ring * h) break;
    }
    return best;
  };
  return { nearest };
}

/** A smooth 3D curve through points (Catmull–Rom), sampled. */
export function curveThrough(points, perSpan = 12) {
  if (points.length < 2) return points.slice();
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = points[Math.max(0, i - 1)]; const p1 = points[i]; const p2 = points[i + 1]; const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < perSpan; s++) {
      const t = s / perSpan;
      const t2 = t * t; const t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(points[points.length - 1].slice());
  return out;
}

/** MeshPart_CurveOnMesh / Surface_CurveOnMesh: a curve through picked points, every sample pulled onto the mesh. */
export function curveOnMesh(tris, picks, perSpan = 16) {
  const grid = triangleGrid(tris);
  return curveThrough(picks, perSpan).map((p) => grid.nearest(p)?.point ?? p);
}

/**
 * Surface_BlendCurve: a cubic between two curve ends that leaves each along
 * its tangent (G1). a, b: { point, tangent (pointing out of the curve) }.
 */
export function blendCurve(a, b, { samples = 32, weight = 1 } = {}) {
  const d = len(sub(b.point, a.point));
  const ta = mul(unit(a.tangent), (d * weight) / 3);
  const tb = mul(unit(b.tangent), (d * weight) / 3);
  const c1 = add(a.point, ta);
  const c2 = add(b.point, tb);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples; const u = 1 - t;
    return [0, 1, 2].map((k) => u * u * u * a.point[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * b.point[k]);
  });
}

/** Surface_ExtendFace: a face grown outward by `distance` along its own surface direction at its border. */
export function extendFace(faceTris, distance) {
  const { mesh, loops } = boundaryLoops(faceTris);
  if (!loops.length) return faceTris.slice();
  const out = faceTris.slice();
  const vertexNormal = mesh.points.map(() => [0, 0, 0]);
  for (const f of mesh.faces) {
    const n = cross(sub(mesh.points[f[1]], mesh.points[f[0]]), sub(mesh.points[f[2]], mesh.points[f[0]]));
    for (const i of f) vertexNormal[i] = add(vertexNormal[i], n);
  }
  for (const loop of loops) {
    const ring = loop.map((i, k) => {
      const p = mesh.points[i];
      const prev = mesh.points[loop[(k + loop.length - 1) % loop.length]];
      const next = mesh.points[loop[(k + 1) % loop.length]];
      const tangent = unit(sub(next, prev));
      const n = unit(vertexNormal[i]);
      // Outward: across the border, in the surface's tangent plane.
      let out = unit(cross(tangent, n));
      const inner = mesh.faces.find((f) => f.includes(i));
      const centre = mul(inner.reduce((s, j) => add(s, mesh.points[j]), [0, 0, 0]), 1 / 3);
      if (dot(out, sub(p, centre)) < 0) out = mul(out, -1);
      return add(p, mul(out, distance));
    });
    for (let k = 0; k < loop.length; k++) {
      const a = mesh.points[loop[k]]; const b = mesh.points[loop[(k + 1) % loop.length]];
      const a2 = ring[k]; const b2 = ring[(k + 1) % loop.length];
      out.push([b, a, a2], [b, a2, b2]);
    }
  }
  return out;
}

// ───────────────────────── fitting (Reverse engineering)

/** Points sorted along their main direction (for fitting a curve through a cloud). */
function alongMainAxis(points) {
  const axes = principalAxes(points);
  const dir = axes ? axes.vectors[axes.values.indexOf(Math.max(...axes.values))] : [1, 0, 0];
  return points.slice().sort((p, q) => dot(p, dir) - dot(q, dir));
}

/** Reen_ApproxCurve: a cubic B-spline (control points) fitted to points by least squares, sampled. */
export function approximateCurve(points, controlCount = 8, samples = 100) {
  const pts = alongMainAxis(points);
  const n = Math.max(4, Math.min(controlCount, pts.length));
  const p = 3;
  // Chord-length parameters, clamped uniform knots.
  const t = [0];
  for (let i = 1; i < pts.length; i++) t.push(t[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = t[t.length - 1] || 1;
  const params = t.map((v) => v / total);
  const inner = n - p - 1;
  const knots = [0, 0, 0, 0, ...Array.from({ length: inner }, (_, i) => (i + 1) / (inner + 1)), 1, 1, 1, 1];
  const basis = (u) => {
    const N = new Array(n).fill(0);
    for (let i = 0; i < n; i++) N[i] = bspline(i, p, u, knots);
    if (u >= 1) N[n - 1] = 1;
    return N;
  };
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const B = Array.from({ length: n }, () => [0, 0, 0]);
  params.forEach((u, k) => {
    const N = basis(u);
    for (let i = 0; i < n; i++) { if (!N[i]) continue; for (let j = 0; j < n; j++) A[i][j] += N[i] * N[j]; for (let c = 0; c < 3; c++) B[i][c] += N[i] * pts[k][c]; }
  });
  const ctrl = solveDense(A, B);
  if (!ctrl) return null;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const N = basis(i / samples);
    return [0, 1, 2].map((c) => N.reduce((s, w, j) => s + w * ctrl[j][c], 0));
  });
}

/** Cox–de Boor basis value. */
function bspline(i, p, u, K) {
  if (p === 0) return (u >= K[i] && u < K[i + 1]) ? 1 : 0;
  const a = K[i + p] - K[i] ? ((u - K[i]) / (K[i + p] - K[i])) * bspline(i, p - 1, u, K) : 0;
  const b = K[i + p + 1] - K[i + 1] ? ((K[i + p + 1] - u) / (K[i + p + 1] - K[i + 1])) * bspline(i + 1, p - 1, u, K) : 0;
  return a + b;
}

/** Gaussian elimination for A X = B (several right-hand sides). */
function solveDense(A, B) {
  const n = A.length;
  const m = B[0].length;
  const M = A.map((row, i) => [...row, ...B[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-14) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col || !M[r][col]) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k < n + m; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row.slice(n).map((v) => v / M[i][i]));
}

/** The frame of a cloud's best plane: origin, axes e1, e2 (in the plane) and n. */
function cloudFrame(points) {
  const c = mul(points.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / points.length);
  const plane = fitPlane(points.flat());
  const n = unit(plane?.normal ?? [0, 0, 1]);
  const helper = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unit(cross(helper, n));
  const e2 = cross(n, e1);
  return { c, e1, e2, n };
}

/**
 * Reen_ApproxSurface / Reen_ApproxPolynomial: a surface fitted to points as a
 * height over their best plane — a bicubic B-spline with `controls`² control
 * heights, or a quadratic polynomial — returned as a triangle grid.
 */
export function approximateSurface(points, { kind = 'bspline', controls = 6, grid = 24 } = {}) {
  const { c, e1, e2, n } = cloudFrame(points);
  const local = points.map((p) => { const d = sub(p, c); return [dot(d, e1), dot(d, e2), dot(d, n)]; });
  const [u0, u1] = [Math.min(...local.map((q) => q[0])), Math.max(...local.map((q) => q[0]))];
  const [v0, v1] = [Math.min(...local.map((q) => q[1])), Math.max(...local.map((q) => q[1]))];
  let height;
  if (kind === 'polynomial') {
    // z = a + bu + cv + du² + euv + fv²
    const terms = (u, v) => [1, u, v, u * u, u * v, v * v];
    const A = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const B = Array.from({ length: 6 }, () => [0]);
    for (const [u, v, z] of local) { const T = terms(u, v); for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) A[i][j] += T[i] * T[j]; B[i][0] += T[i] * z; } }
    for (let i = 0; i < 6; i++) A[i][i] += 1e-12;
    const coef = solveDense(A, B)?.map((r) => r[0]) ?? [0, 0, 0, 0, 0, 0];
    height = (u, v) => terms(u, v).reduce((s, w, i) => s + w * coef[i], 0);
  } else {
    const nc = Math.max(4, controls);
    const inner = nc - 4;
    const knots = [0, 0, 0, 0, ...Array.from({ length: inner }, (_, i) => (i + 1) / (inner + 1)), 1, 1, 1, 1];
    const basis = (s) => { const N = Array.from({ length: nc }, (_, i) => bspline(i, 3, s, knots)); if (s >= 1) N[nc - 1] = 1; return N; };
    const su = (u) => (u - u0) / ((u1 - u0) || 1);
    const sv = (v) => (v - v0) / ((v1 - v0) || 1);
    const size = nc * nc;
    const A = Array.from({ length: size }, () => new Array(size).fill(0));
    const B = Array.from({ length: size }, () => [0]);
    for (const [u, v, z] of local) {
      const Nu = basis(su(u)); const Nv = basis(sv(v));
      const row = [];
      for (let i = 0; i < nc; i++) for (let j = 0; j < nc; j++) row.push(Nu[i] * Nv[j]);
      for (let a = 0; a < size; a++) { if (!row[a]) continue; for (let b = 0; b < size; b++) A[a][b] += row[a] * row[b]; B[a][0] += row[a] * z; }
    }
    // A little smoothing keeps empty patches flat.
    for (let a = 0; a < size; a++) A[a][a] += 1e-6;
    const ctrl = solveDense(A, B)?.map((r) => r[0]) ?? new Array(size).fill(0);
    height = (u, v) => {
      const Nu = basis(su(u)); const Nv = basis(sv(v));
      let s = 0;
      for (let i = 0; i < nc; i++) for (let j = 0; j < nc; j++) s += Nu[i] * Nv[j] * ctrl[i * nc + j];
      return s;
    };
  }
  const at = (i, j) => {
    const u = u0 + ((u1 - u0) * i) / grid;
    const v = v0 + ((v1 - v0) * j) / grid;
    return add(add(add(c, mul(e1, u)), mul(e2, v)), mul(n, height(u, v)));
  };
  const tris = [];
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) tris.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)], [at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
  const rms = Math.sqrt(local.reduce((s, [u, v, z]) => s + (z - height(u, v)) ** 2, 0) / local.length);
  return { tris, rms };
}

// ───────────────────────── surface from points (Reen_PoissonReconstruction)

/** Normals of a cloud from its k nearest neighbours (plane fit), turned outward from the centre. */
export function estimateNormals(points, k = 10) {
  const c = mul(points.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / points.length);
  const box = boundingBox([points]);
  const h = Math.max(...box.size) / Math.max(4, Math.cbrt(points.length));
  const grid = new Map();
  const cell = (p) => p.map((v) => Math.floor(v / h)).join(',');
  points.forEach((p, i) => { const key4 = cell(p); if (!grid.has(key4)) grid.set(key4, []); grid.get(key4).push(i); });
  return points.map((p) => {
    const [x, y, z] = p.map((v) => Math.floor(v / h));
    const near = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) near.push(...(grid.get(`${x + dx},${y + dy},${z + dz}`) ?? []));
    const nearest = near.map((i) => points[i]).sort((a, b) => len(sub(a, p)) - len(sub(b, p))).slice(0, k);
    const plane = nearest.length >= 3 ? fitPlane(nearest.flat()) : null;
    let n = unit(plane?.normal ?? sub(p, c));
    if (dot(n, sub(p, c)) < 0) n = mul(n, -1);
    return n;
  });
}

/**
 * A closed surface round a point cloud: the signed distance to the nearest
 * point's tangent plane on a voxel grid (Hoppe), contoured at zero with
 * marching tetrahedra. `depth` sets the grid (2^depth cells along the longest side).
 */
export function reconstructSurface(points, { depth = 5, normals = null } = {}) {
  const N = normals ?? estimateNormals(points);
  const box = boundingBox([points]);
  const size = Math.max(...box.size);
  const cells = 2 ** Math.max(3, Math.min(7, depth));
  const h = (size * 1.2) / cells;
  const origin = sub(box.center, [h * cells / 2, h * cells / 2, h * cells / 2]);
  const dims = cells + 1;
  // Nearest point by a bucket grid.
  const bucket = new Map();
  const bk = (p) => p.map((v, k) => Math.floor((v - origin[k]) / h)).join(',');
  points.forEach((p, i) => { const k5 = bk(p); if (!bucket.has(k5)) bucket.set(k5, []); bucket.get(k5).push(i); });
  const field = new Float64Array(dims * dims * dims);
  const at = (i, j, k) => add(origin, [i * h, j * h, k * h]);
  for (let i = 0; i < dims; i++) for (let j = 0; j < dims; j++) for (let k = 0; k < dims; k++) {
    const p = at(i, j, k);
    let best = -1; let bestD = Infinity;
    // Rings of buckets outward until nothing nearer can be further out.
    for (let r = 0; r <= dims; r++) {
      for (let a = i - r; a <= i + r; a++) for (let b = j - r; b <= j + r; b++) for (let c = k - r; c <= k + r; c++) {
        if (Math.max(Math.abs(a - i), Math.abs(b - j), Math.abs(c - k)) !== r) continue;
        for (const q of bucket.get(`${a},${b},${c}`) ?? []) { const d = len(sub(points[q], p)); if (d < bestD) { bestD = d; best = q; } }
      }
      if (best >= 0 && bestD <= (r - 1) * h) break;
    }
    field[(i * dims + j) * dims + k] = best < 0 ? h * cells : dot(sub(p, points[best]), N[best]);
  }
  // Marching tetrahedra: each cube split into six tetrahedra round its main diagonal.
  const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const tris = [];
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) for (let k = 0; k < cells; k++) {
    const corner = CORNER.map(([a, b, c]) => ({ p: at(i + a, j + b, k + c), v: field[((i + a) * dims + j + b) * dims + k + c] }));
    for (const tet of TETS) {
      const q = tet.map((t) => corner[t]);
      const inside = q.map((x) => x.v < 0);
      const count = inside.filter(Boolean).length;
      if (count === 0 || count === 4) continue;
      const cut = (a, b) => lerp(a.p, b.p, a.v / (a.v - b.v));
      const ins = q.filter((_, x) => inside[x]);
      const outs = q.filter((_, x) => !inside[x]);
      // Each triangle faces from the tetrahedron's inside corners to its outside ones.
      const outward = sub(mul(outs.reduce((s, x) => add(s, x.p), [0, 0, 0]), 1 / outs.length), mul(ins.reduce((s, x) => add(s, x.p), [0, 0, 0]), 1 / ins.length));
      const push = (t) => tris.push(dot(cross(sub(t[1], t[0]), sub(t[2], t[0])), outward) < 0 ? [t[0], t[2], t[1]] : t);
      if (count === 1) push([cut(ins[0], outs[0]), cut(ins[0], outs[1]), cut(ins[0], outs[2])]);
      else if (count === 3) push([cut(outs[0], ins[0]), cut(outs[0], ins[2]), cut(outs[0], ins[1])]);
      else {
        const a = cut(ins[0], outs[0]); const b = cut(ins[0], outs[1]); const c = cut(ins[1], outs[0]); const d = cut(ins[1], outs[1]);
        push([a, b, d]);
        push([a, d, c]);
      }
    }
  }
  // Slivers stay: dropping a zero-area triangle would open a crack between its neighbours.
  return tris;
}

// ───────────────────────── points

/** Points_Structure: a cloud resampled onto a regular grid over its best plane (cells with no point are left out). */
export function structurePoints(points, width = null, height = null) {
  const { c, e1, e2, n } = cloudFrame(points);
  const local = points.map((p) => { const d = sub(p, c); return [dot(d, e1), dot(d, e2), dot(d, n)]; });
  const side = Math.max(2, Math.round(Math.sqrt(points.length)));
  const W = width ?? side; const H = height ?? side;
  const [u0, u1] = [Math.min(...local.map((q) => q[0])), Math.max(...local.map((q) => q[0]))];
  const [v0, v1] = [Math.min(...local.map((q) => q[1])), Math.max(...local.map((q) => q[1]))];
  const sums = new Map();
  for (const [u, v, z] of local) {
    const i = Math.min(W - 1, Math.floor(((u - u0) / ((u1 - u0) || 1)) * W));
    const j = Math.min(H - 1, Math.floor(((v - v0) / ((v1 - v0) || 1)) * H));
    const key6 = j * W + i;
    const s = sums.get(key6) ?? [0, 0];
    sums.set(key6, [s[0] + z, s[1] + 1]);
  }
  const out = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const s = sums.get(j * W + i);
    if (!s) continue;
    const u = u0 + ((u1 - u0) * (i + 0.5)) / W;
    const v = v0 + ((v1 - v0) * (j + 0.5)) / H;
    out.push(add(add(add(c, mul(e1, u)), mul(e2, v)), mul(n, s[0] / s[1])));
  }
  return { points: out, width: W, height: H };
}

// ───────────────────────── inspection

/**
 * Inspection_VisualInspection: the distance of each point of the actual
 * object to the nominal mesh — signed (outside positive) when the nominal is
 * closed. Returns { distances, min, max, rms }.
 */
export function inspectDistances(points, nominalTris) {
  const grid = triangleGrid(nominalTris);
  const distances = points.map((p) => {
    const hit = grid.nearest(p);
    if (!hit) return 0;
    const { normal } = triangleInfo(nominalTris[hit.triangle]);
    const s = dot(sub(p, hit.point), normal);
    return Math.abs(s) > 1e-12 ? Math.sign(s) * hit.distance : hit.distance;
  });
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  const rms = Math.sqrt(distances.reduce((s, d) => s + d * d, 0) / (distances.length || 1));
  return { distances, min, max, rms };
}


// ───────────────────────── convex hulls (OpenSCAD_Hull, OpenSCAD_Minkowski)

/** The convex hull of 3D points as outward-facing triangles (incremental; points closer than eps merge). */
export function convexHull3d(input, eps = 1e-9) {
  const seen = new Map();
  for (const p of input) seen.set(keyOf(p), p);
  const pts = [...seen.values()];
  if (pts.length < 4) return [];
  // A first tetrahedron from extreme points.
  let a = 0; let b = 0;
  for (let i = 1; i < pts.length; i++) { if (pts[i][0] < pts[a][0]) a = i; if (pts[i][0] > pts[b][0]) b = i; }
  if (a === b) b = pts.findIndex((_, i) => i !== a);
  const ab = sub(pts[b], pts[a]);
  let c = -1; let best = eps;
  pts.forEach((p, i) => { const d = len(cross(ab, sub(p, pts[a]))); if (d > best) { best = d; c = i; } });
  if (c < 0) return [];
  const n0 = cross(ab, sub(pts[c], pts[a]));
  let d = -1; best = eps;
  pts.forEach((p, i) => { const h = Math.abs(dot(n0, sub(p, pts[a]))); if (h > best) { best = h; d = i; } });
  if (d < 0) return [];
  const centre = mul(add(add(pts[a], pts[b]), add(pts[c], pts[d])), 0.25);
  let faces = [];
  const addFace = (i, j, k) => {
    let f = [i, j, k];
    const n = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
    if (dot(n, sub(pts[i], centre)) < 0) f = [i, k, j];
    const m = cross(sub(pts[f[1]], pts[f[0]]), sub(pts[f[2]], pts[f[0]]));
    faces.push({ v: f, n: unit(m), o: pts[f[0]] });
  };
  addFace(a, b, c); addFace(a, b, d); addFace(a, c, d); addFace(b, c, d);
  const scale = Math.max(...boundingBox([pts]).size, 1);
  for (let i = 0; i < pts.length; i++) {
    if (i === a || i === b || i === c || i === d) continue;
    const p = pts[i];
    const visible = faces.filter((f) => dot(f.n, sub(p, f.o)) > eps * scale);
    if (!visible.length) continue;
    // The horizon: edges of visible faces not shared with another visible face.
    const count = new Map();
    for (const f of visible) for (let k = 0; k < 3; k++) {
      const e = [f.v[k], f.v[(k + 1) % 3]];
      const key2 = `${Math.min(...e)},${Math.max(...e)}`;
      count.set(key2, { e, n: (count.get(key2)?.n ?? 0) + 1 });
    }
    faces = faces.filter((f) => !visible.includes(f));
    for (const { e, n } of count.values()) {
      if (n !== 1) continue;
      const v = [e[0], e[1], i];
      const m = cross(sub(pts[v[1]], pts[v[0]]), sub(pts[v[2]], pts[v[0]]));
      faces.push({ v, n: unit(m), o: pts[v[0]] });
    }
  }
  return faces.map((f) => f.v.map((k) => pts[k].slice()));
}

/** OpenSCAD_Minkowski: the hull of every vertex of A plus every vertex of B (exact for convex shapes). */
export function minkowskiHull(trisA, trisB) {
  const verts = (tris) => [...new Map(tris.flat().map((p) => [keyOf(p), p])).values()];
  const A = verts(trisA); const B = verts(trisB);
  const sums = [];
  for (const p of A) for (const q of B) sums.push(add(p, q));
  return convexHull3d(sums);
}

/** The 2D convex hull of points (counter-clockwise, Andrew's monotone chain). */
export function convexHull2d(points) {
  const P = [...new Map(points.map((p) => [`${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`, p])).values()].sort((p, q) => p.x - q.x || p.y - q.y);
  if (P.length < 3) return P;
  const turn = (o, a2, b2) => (a2.x - o.x) * (b2.y - o.y) - (a2.y - o.y) * (b2.x - o.x);
  const lower = []; const upper = [];
  for (const p of P) { while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of P.slice().reverse()) { while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
