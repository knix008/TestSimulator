// Scan to solid (reverse engineering of a scanned / faceted mesh): the mesh is split into regions, each region is
// fitted with an analytic surface, and a solid is rebuilt whose faces are those surfaces.
//
//   segmentMesh()   planar regions grow from the largest triangles while each neighbour's normal stays within
//                   `angle` of the region's and its corners within `tol` of the region's (refitted) plane; what is
//                   left grows into smooth regions (neighbour normals within `smooth`) fitted with a cylinder (axis:
//                   the direction the normals have least of, the circle by least squares across it) or a sphere,
//                   else kept as free-form. Each region: { kind, tris, area, fit, rms, coverage, convex }.
//   snapVertices()  every vertex moved onto its regions' surfaces: one plane → projected, two → onto their line,
//                   more → their least-squares point; a cylinder / sphere → radially to its radius (after the plane
//                   of a rim). Coplanar triangles then merge into one exact planar face (stl.js solidFromMesh).
//   scanToSolid()   the snapped mesh as a solid, then each full-turn cylinder replaced by the exact one: a hole cut
//                   (its facets' chords lie inside the true hole), a boss fused (its chords lie inside the true
//                   boss); the cylinder runs over the region's extent along its axis, carried past an open end
//                   (a blind hole's bottom is a plane square to the axis within its radius: not extended).
//                   → { shape, regions, report: { planes, cylinders, spheres, freeform, exactCylinders, rms } }.
import { rep } from './kernel.js';
import { solidFromMesh } from './stl.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Welds a triangle mesh ({ vertices (flat), triangles (flat) }) → { P: [[x,y,z]], T: [[a,b,c]] }. */
export function weld(mesh, tol = 1e-6) {
  const V = mesh.vertices, Tr = mesh.triangles;
  const P = [], map = new Int32Array(V.length / 3), index = new Map();
  for (let i = 0; i < V.length / 3; i++) {
    const k = `${Math.round(V[3 * i] / tol)},${Math.round(V[3 * i + 1] / tol)},${Math.round(V[3 * i + 2] / tol)}`;
    let j = index.get(k);
    if (j == null) { j = P.length; P.push([V[3 * i], V[3 * i + 1], V[3 * i + 2]]); index.set(k, j); }
    map[i] = j;
  }
  const T = [];
  for (let t = 0; t < Tr.length; t += 3) { const a = map[Tr[t]], b = map[Tr[t + 1]], c = map[Tr[t + 2]]; if (a !== b && b !== c && a !== c) T.push([a, b, c]); }
  return { P, T };
}

/** Eigen decomposition of a symmetric 3×3 (Jacobi): { values (ascending), vectors (columns as arrays) }. */
function eig3(A) {
  const a = [A[0].slice(), A[1].slice(), A[2].slice()], v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let s = 0; s < 60; s++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-30) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < 3; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - sn * kq; a[k][q] = sn * kp + c * kq; }
      for (let k = 0; k < 3; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - sn * qk; a[q][k] = sn * pk + c * qk; }
      for (let k = 0; k < 3; k++) { const kp = v[k][p], kq = v[k][q]; v[k][p] = c * kp - sn * kq; v[k][q] = sn * kp + c * kq; }
    }
  }
  const idx = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  return { values: idx.map((i) => a[i][i]), vectors: idx.map((i) => [v[0][i], v[1][i], v[2][i]]) };
}

/** Least-squares plane of points (area weights optional): { n, d } with n·p = d. */
function fitPlane(pts, w = null) {
  let W = 0; const c = [0, 0, 0];
  pts.forEach((p, i) => { const wi = w ? w[i] : 1; W += wi; for (let k = 0; k < 3; k++) c[k] += wi * p[k]; });
  for (let k = 0; k < 3; k++) c[k] /= W || 1;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  pts.forEach((p, i) => { const wi = w ? w[i] : 1; const d = sub(p, c); for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) C[r][s] += wi * d[r] * d[s]; });
  const n = unit(eig3(C).vectors[0]);
  return { n, d: dot(n, c), c };
}

/** Least-squares circle in 2D (Kåsa): { cx, cy, r }. */
function fitCircle(q) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0; const n = q.length;
  for (const [x, y] of q) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; }
  // [sxx sxy sx; sxy syy sy; sx sy n] [a b c] = [sxz syz sz]; centre (a/2, b/2), r² = c + cx² + cy².
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], rhs = [sxz, syz, sz];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-30) return null;
  const col = (k) => M.map((row, i) => row.map((v, j) => (j === k ? rhs[i] : v)));
  const a = det(col(0)) / D, b = det(col(1)) / D, c = det(col(2)) / D;
  const cx = a / 2, cy = b / 2;
  return { cx, cy, r: Math.sqrt(Math.max(0, c + cx * cx + cy * cy)) };
}

/** Least-squares sphere: { c, r }. */
function fitSphere(pts) {
  // x² + y² + z² = 2ax + 2by + 2cz + d.
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], B = [0, 0, 0, 0];
  for (const p of pts) { const row = [2 * p[0], 2 * p[1], 2 * p[2], 1], z = dot(p, p); for (let i = 0; i < 4; i++) { B[i] += row[i] * z; for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j]; } }
  // Gaussian elimination.
  const M = A.map((r, i) => [...r, B[i]]);
  for (let i = 0; i < 4; i++) {
    let piv = i; for (let k = i + 1; k < 4; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    [M[i], M[piv]] = [M[piv], M[i]];
    if (Math.abs(M[i][i]) < 1e-30) return null;
    for (let k = 0; k < 4; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 5; j++) M[k][j] -= f * M[i][j]; }
  }
  const s = M.map((r, i) => r[4] / r[i]);
  const c = [s[0], s[1], s[2]];
  return { c, r: Math.sqrt(Math.max(0, s[3] + dot(c, c))) };
}

/** Two unit vectors square to axis a. */
const basis = (a) => { const u = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0])); return [u, cross(a, u)]; };

/**
 * Regions of a welded mesh (see the header). Options: tol (mm, the scan's noise; default 0.05 % of the size),
 * angle (degrees, planar growth limit: 40 — the growth itself goes by distance, as a noisy sliver's normal is unreliable), smooth
 * (degrees, curved growth on smoothed normals: 20), minArea (share of the total for a
 * planar region to count as a face: 0.002).
 */
export function segmentMesh({ P, T }, { tol = null, angle = 40, smooth = 20, minArea = 0.002, minWidth = 0.03 } = {}) {
  const nt = T.length, nv = P.length;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of P) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const size = len(sub(hi, lo)) || 1;
  const eps = tol ?? 0.0005 * size;
  const N = [], A = [], C = [];
  for (const [a, b, c] of T) { const m = cross(sub(P[b], P[a]), sub(P[c], P[a])); A.push(len(m) / 2); N.push(unit(m)); C.push(mul(add(add(P[a], P[b]), P[c]), 1 / 3)); }
  const total = A.reduce((s, v) => s + v, 0);
  // Smoothed normals (area-weighted vertex normals averaged over each triangle): steadier than a noisy sliver's own.
  const VN = Array.from({ length: nv }, () => [0, 0, 0]);
  T.forEach((t, i) => { for (const v of t) for (let k = 0; k < 3; k++) VN[v][k] += A[i] * N[i][k]; });
  const SN = T.map((t) => unit(add(add(unit(VN[t[0]]), unit(VN[t[1]])), unit(VN[t[2]]))));
  // Neighbours across edges.
  const edgeMap = new Map(), nb = Array.from({ length: nt }, () => []);
  T.forEach((t, i) => { for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], key = a < b ? a * nv + b : b * nv + a; const o = edgeMap.get(key); if (o == null) edgeMap.set(key, i); else { nb[i].push(o); nb[o].push(i); } } });
  const owner = new Int32Array(nt).fill(-1);
  const regions = [];
  const cosA = Math.cos((angle * Math.PI) / 180), cosS = Math.cos((smooth * Math.PI) / 180);
  const order = [...Array(nt).keys()].sort((i, j) => A[j] - A[i]);
  // ── planes: grown by distance (corners within eps of the region's plane), refitted from running sums.
  for (const seed of order) {
    if (owner[seed] >= 0) continue;
    let n = N[seed], d = dot(n, C[seed]);
    const tris = [seed]; owner[seed] = -2;
    const S = { w: 0, p: [0, 0, 0], pp: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] };
    const acc = (t) => { for (const v of T[t]) { const p = P[v]; S.w += 1; for (let r = 0; r < 3; r++) { S.p[r] += p[r]; for (let s = 0; s < 3; s++) S.pp[r][s] += p[r] * p[s]; } } };
    const refit = () => { const c = mul(S.p, 1 / S.w); const Cv = S.pp.map((row, r) => row.map((v, s) => v / S.w - c[r] * c[s])); let m = unit(eig3(Cv).vectors[0]); if (dot(m, n) < 0) m = mul(m, -1); n = m; d = dot(n, c); };
    acc(seed);
    for (let q = 0; q < tris.length; q++) {
      for (const j of nb[tris[q]]) {
        if (owner[j] !== -1) continue;
        if (dot(SN[j], n) < cosA && dot(N[j], n) < cosA) continue;
        if (T[j].some((v) => Math.abs(dot(n, P[v]) - d) > eps)) continue;
        owner[j] = -2; tris.push(j); acc(j);
        if (tris.length % 32 === 0) refit();
      }
    }
    if (tris.length >= 3) refit();
    const area = tris.reduce((s, t) => s + A[t], 0);
    const [u, v] = basis(n);
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (const t of tris) for (const vi of T[t]) { const pu = dot(P[vi], u), pv = dot(P[vi], v); umin = Math.min(umin, pu); umax = Math.max(umax, pu); vmin = Math.min(vmin, pv); vmax = Math.max(vmax, pv); }
    const width = Math.min(umax - umin, vmax - vmin);
    // Not a strip of a tessellated curve: a cylinder strip within eps of a plane is at most 2·√(2·r·eps) wide.
    if (area >= minArea * total && width > Math.max(8 * eps, minWidth * size)) {
      const id = regions.length;
      for (const t of tris) owner[t] = id;
      let sq = 0, cnt = 0; for (const t of tris) for (const vi of T[t]) { sq += (dot(n, P[vi]) - d) ** 2; cnt++; }
      regions.push({ id, kind: 'plane', tris, area, fit: { n, d }, rms: Math.sqrt(sq / cnt) });
    } else for (const t of tris) owner[t] = -1;
  }
  // ── curved: grown by smoothed normals, fitted with a cylinder or a sphere.
  const fitCurved = (tris) => {
    const vset = [...new Set(tris.flatMap((t) => T[t]))], ps = vset.map((v) => P[v]);
    const Cn = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const t of tris) for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) Cn[r][s] += A[t] * SN[t][r] * SN[t][s];
    const axis = unit(eig3(Cn).vectors[0]);
    const [u, v] = basis(axis);
    const circ = ps.length >= 6 ? fitCircle(ps.map((p) => [dot(p, u), dot(p, v)])) : null;
    if (circ && circ.r > 0 && circ.r < 2 * size) {
      const base = add(mul(u, circ.cx), mul(v, circ.cy));
      const radial = (p) => { const w = sub(p, base); return len(sub(w, mul(axis, dot(w, axis)))); };
      const rms = Math.sqrt(ps.reduce((s, p) => s + (radial(p) - circ.r) ** 2, 0) / ps.length);
      if (rms < 2 * eps) return { kind: 'cylinder', fit: { axis, base, r: circ.r }, rms };
    }
    const sph = ps.length >= 8 ? fitSphere(ps) : null;
    if (sph && sph.r > 0 && sph.r < 2 * size) {
      const rms = Math.sqrt(ps.reduce((s, p) => s + (len(sub(p, sph.c)) - sph.r) ** 2, 0) / ps.length);
      if (rms < 2 * eps) return { kind: 'sphere', fit: sph, rms };
    }
    return { kind: 'freeform', fit: null, rms: null };
  };
  // Smoothed normals again from the curved triangles only: a rim vertex's normal must not lean towards the big
  // plane it also belongs to.
  for (const vn of VN) vn.fill(0);
  T.forEach((t, i) => { if (owner[i] < 0) for (const v of t) for (let k = 0; k < 3; k++) VN[v][k] += A[i] * N[i][k]; });
  T.forEach((t, i) => { if (owner[i] < 0) SN[i] = unit(add(add(unit(VN[t[0]]), unit(VN[t[1]])), unit(VN[t[2]]))); });
  for (const seed of order) {
    if (owner[seed] >= 0) continue;
    const id = regions.length; owner[seed] = id;
    const tris = [seed];
    for (let q = 0; q < tris.length; q++) for (const j of nb[tris[q]]) { if (owner[j] < 0 && dot(SN[j], SN[tris[q]]) >= cosS) { owner[j] = id; tris.push(j); } }
    regions.push({ id, tris, area: tris.reduce((s, t) => s + A[t], 0), ...fitCurved(tris) });
  }
  // ── merge cylinders of one surface (same axis line and radius) split by the growth.
  const same = (a, b) => {
    if (Math.abs(Math.abs(dot(a.axis, b.axis)) - 1) > 1e-3 || Math.abs(a.r - b.r) > 2 * eps) return false;
    const w = sub(b.base, a.base); return len(sub(w, mul(a.axis, dot(w, a.axis)))) < 2 * eps;
  };
  for (const r of regions) {
    if (r.kind !== 'cylinder' || r.merged) continue;
    for (const o of regions) {
      if (o === r || o.kind !== 'cylinder' || o.merged || !same(r.fit, o.fit)) continue;
      r.tris.push(...o.tris); r.area += o.area; o.merged = true; for (const t of o.tris) owner[t] = r.id;
    }
  }
  // ── small pieces (and small free-form ones) taken in by the neighbouring region whose surface they lie on.
  const distTo = (r, p) => (r.kind === 'plane' ? Math.abs(dot(r.fit.n, p) - r.fit.d) : r.kind === 'cylinder' ? (() => { const w = sub(p, r.fit.base); return Math.abs(len(sub(w, mul(r.fit.axis, dot(w, r.fit.axis)))) - r.fit.r); })() : r.kind === 'sphere' ? Math.abs(len(sub(p, r.fit.c)) - r.fit.r) : Infinity);
  for (let pass = 0; pass < 3; pass++) {
    for (const r of regions) {
      if (r.merged || r.kind === 'plane' || (r.kind !== 'freeform' && r.area >= minArea * total)) continue;
      for (const t of r.tris) {
        let best = null, bd = Infinity;
        for (const j of nb[t]) { const o = regions[owner[j]]; if (!o || o === r || o.merged || o.kind === 'freeform') continue; const dd = Math.max(...T[t].map((v) => distTo(o, P[v]))); if (dd < bd) { bd = dd; best = o; } }
        if (best && bd < 3 * eps) { owner[t] = best.id; best.tris.push(t); best.area += A[t]; }
      }
      r.tris = r.tris.filter((t) => owner[t] === r.id); r.area = r.tris.reduce((s, t) => s + A[t], 0);
      if (!r.tris.length) r.merged = true;
    }
  }
  // Extents and coverage of the cylinders; convex or concave.
  for (const r of regions) {
    if (r.merged || r.kind !== 'cylinder') continue;
    const { axis, base } = r.fit; const [u, v] = basis(axis);
    const vset = [...new Set(r.tris.flatMap((t) => T[t]))];
    const ts = vset.map((vi) => dot(sub(P[vi], base), axis));
    const angs = vset.map((vi) => { const w = sub(P[vi], base); return Math.atan2(dot(w, v), dot(w, u)); }).sort((a, b) => a - b);
    let gap = angs.length ? 2 * Math.PI - (angs.at(-1) - angs[0]) : 2 * Math.PI;
    for (let i = 1; i < angs.length; i++) gap = Math.max(gap, angs[i] - angs[i - 1]);
    let out = 0; for (const t of r.tris) { const w = sub(C[t], base); out += A[t] * Math.sign(dot(N[t], sub(w, mul(axis, dot(w, axis))))); }
    r.fit.t0 = Math.min(...ts); r.fit.t1 = Math.max(...ts); r.coverage = 360 - (gap * 180) / Math.PI; r.convex = out > 0;
  }
  const list = regions.filter((r) => !r.merged && r.tris.length);
  const remap = new Map(list.map((r, i) => [r.id, i]));
  list.forEach((r, i) => { r.id = i; });
  for (let t = 0; t < nt; t++) owner[t] = remap.get(owner[t]) ?? -1;
  return { regions: list, owner, eps, size, total };
}

/** Moves the vertices onto their regions' surfaces (see the header). Returns new points. */
export function snapVertices({ P, T }, seg) {
  const of = P.map(() => new Set());
  T.forEach((t, i) => { const r = seg.owner[i]; if (r >= 0) for (const v of t) of[v].add(r); });
  return P.map((p, vi) => {
    const regs = [...of[vi]].map((i) => seg.regions[i]);
    const planes = regs.filter((r) => r.kind === 'plane').map((r) => r.fit);
    let q = p.slice();
    if (planes.length === 1) q = sub(q, mul(planes[0].n, dot(planes[0].n, q) - planes[0].d));
    else if (planes.length >= 2) {
      // The point nearest p on all the planes (least squares, with a weak pull towards p for a line).
      const M = [[1e-6, 0, 0], [0, 1e-6, 0], [0, 0, 1e-6]], b = mul(p, 1e-6);
      for (const pl of planes) { for (let r = 0; r < 3; r++) { for (let s = 0; s < 3; s++) M[r][s] += pl.n[r] * pl.n[s]; b[r] += pl.n[r] * pl.d; } }
      const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(M);
      if (Math.abs(D) > 1e-24) q = [0, 1, 2].map((k) => det(M.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / D);
    }
    for (const r of regs) {
      if (r.kind === 'cylinder') {
        const { axis, base, r: rad } = r.fit; const w = sub(q, base); const along = dot(w, axis); const out = sub(w, mul(axis, along)); const l = len(out);
        // A full-turn cylinder is replaced by the exact one (scanToSolid): its facets go a little towards the
        // axis (`inset`), wholly inside the exact cylinder, so the cut (hole) or fuse (boss) leaves no slivers.
        const rr = r.coverage >= 340 ? rad - (seg.inset ?? 0) : rad;
        if (l > 1e-12) q = add(add(base, mul(axis, along)), mul(out, rr / l));
      } else if (r.kind === 'sphere') {
        const w = sub(q, r.fit.c); const l = len(w); if (l > 1e-12) q = add(r.fit.c, mul(w, r.fit.r / l));
      }
    }
    return q;
  });
}

/** Scan to solid (see the header). mesh: { vertices, triangles } (closed). */
export function scanToSolid(mesh, opts = {}) {
  const R = rep();
  const W = weld(mesh, opts.weld ?? 1e-6);
  const seg = segmentMesh(W, opts);
  seg.inset = 2 * seg.eps;
  const P2 = snapVertices(W, seg);
  // Snapping can bring vertices together (a corner of three planes): weld again and drop the collapsed triangles.
  const W2 = weld({ vertices: Float64Array.from(P2.flat()), triangles: Uint32Array.from(W.T.flat()) }, Math.max(1e-7, seg.eps * 1e-3));
  let shape = solidFromMesh(W2.P, W2.T);
  let exact = 0;
  const planes = seg.regions.filter((r) => r.kind === 'plane');
  const P3 = P2;
  for (const r of seg.regions) {
    if (r.kind !== 'cylinder' || r.coverage < 340) continue;
    const { axis, base, r: rad, t0, t1 } = r.fit;
    // An end is closed when a plane square to the axis sits there within the radius (a blind hole's bottom, a
    // boss's top is open air for a boss is fused — its ends are its own faces: not extended either).
    const closedAt = (t) => planes.some((pl) => Math.abs(Math.abs(dot(pl.fit.n, axis)) - 1) < 1e-3 && Math.abs(dot(pl.fit.n, add(base, mul(axis, t))) - pl.fit.d) < 4 * seg.eps
      && pl.tris.some((ti) => { const c = mul(add(add(P2[W.T[ti][0]], P2[W.T[ti][1]]), P2[W.T[ti][2]]), 1 / 3); const w = sub(c, base); return len(sub(w, mul(axis, dot(w, axis)))) < rad * 0.9; }));
    const m = 0.05 * Math.max(rad, t1 - t0);
    const a = r.convex || closedAt(t0) ? t0 : t0 - m, b = r.convex || closedAt(t1) ? t1 : t1 + m;
    try {
      const cyl = R.makeCylinder(rad, b - a, add(base, mul(axis, a)), axis);
      const next = r.convex ? shape.fuse(cyl) : shape.cut(cyl);
      shape = next; exact++;
    } catch { /* keep the facets */ }
  }
  try { shape = shape.simplify?.() ?? shape; } catch { /* as is */ }
  const count = (k) => seg.regions.filter((r) => r.kind === k).length;
  const rmsAll = Math.sqrt(seg.regions.filter((r) => r.rms != null).reduce((s, r) => s + r.rms ** 2 * r.area, 0) / Math.max(1e-12, seg.regions.filter((r) => r.rms != null).reduce((s, r) => s + r.area, 0)));
  return {
    shape, segmentation: seg,
    report: { planes: count('plane'), cylinders: count('cylinder'), spheres: count('sphere'), freeform: count('freeform'), exactCylinders: exact, rms: rmsAll, tolerance: seg.eps,
      regions: seg.regions.map((r) => ({ kind: r.kind, area: r.area, rms: r.rms ?? null, radius: r.fit?.r ?? null, coverage: r.coverage ?? null, convex: r.convex ?? null })) },
  };
}
