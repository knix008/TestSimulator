// N-dimensional computational geometry: convex hulls (convhulln), Delaunay
// triangulations (delaunayn), Voronoi diagrams (voronoi, voronoin), point
// location in triangulations (tsearch, tsearchn) and scattered-data
// interpolation in 3-D / N-D (griddata3, griddatan).
//
// The hull is an incremental quickhull (outside sets, farthest point first,
// horizon ridges) on simplicial facets. Delaunay triangulations are the lower
// hull of the points lifted onto a paraboloid, with one extra point far above
// the paraboloid so that cospherical inputs still give a full-dimensional
// hull. Qhull option strings are accepted and ignored.
import { fail, dbl, out, outMat, scalar, optText, H } from './util.js';
import { cell, str, isCell, isText, isString } from '../../value.js';

const many = (outs, nargout) => (nargout <= 1 ? outs[0] : outs.slice(0, Math.max(1, nargout)));

/** Points of an N-by-d matrix argument as a row-major Float64Array. */
function pointsArg(v, fn, what = 'X') {
  const t = dbl(v, fn, what);
  if (t.dims.length > 2) fail(`${fn}:inputMustBe2D`, `${what} must be a 2-D matrix of points (one per row).`);
  if (t.im) fail(`${fn}:complex`, `${what} must be real.`);
  const [N, d] = t.dims; const X = new Float64Array(N * d);
  for (let i = 0; i < N; i++) for (let k = 0; k < d; k++) X[i * d + k] = t.re[i + k * N];
  return { X, N, d };
}
const isOptionArg = (v) => v != null && (isText(v) || isCell(v) || (isString(v)));

// ------------------------------------------------------------- small dense helpers

/** Determinant of a k-by-k matrix given as an array of rows (Gaussian elimination with partial pivoting). */
function det(rows) {
  const k = rows.length; if (k === 0) return 1;
  const a = rows.map((r) => Float64Array.from(r)); let s = 1;
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (a[p][c] === 0) return 0;
    if (p !== c) { [a[p], a[c]] = [a[c], a[p]]; s = -s; }
    for (let r = c + 1; r < k; r++) { const f = a[r][c] / a[c][c]; if (f !== 0) for (let j = c; j < k; j++) a[r][j] -= f * a[c][j]; }
    s *= a[c][c];
  }
  return s;
}
/** Solves the k-by-k system M x = b (rows), null when singular. */
function solve(rows, b) {
  const k = rows.length; const a = rows.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (a[p][c] === 0) return null;
    [a[p], a[c]] = [a[c], a[p]];
    for (let r = 0; r < k; r++) { if (r === c) continue; const f = a[r][c] / a[c][c]; if (f !== 0) for (let j = c; j <= k; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((r, i) => r[k] / r[i]);
}
/** Inverse of a k-by-k matrix (rows), null when singular. */
function inverse(rows) {
  const k = rows.length; const a = rows.map((r, i) => { const e = new Array(k).fill(0); e[i] = 1; return [...r, ...e]; });
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-300) return null;
    [a[p], a[c]] = [a[c], a[p]];
    const piv = a[c][c]; for (let j = 0; j < 2 * k; j++) a[c][j] /= piv;
    for (let r = 0; r < k; r++) { if (r === c) continue; const f = a[r][c]; if (f !== 0) for (let j = 0; j < 2 * k; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((r) => r.slice(k));
}
const factorial = (k) => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
/** Signed volume * d! of the simplex with vertex indices vs (d+1 of them). */
function simplexDet(X, d, vs) {
  const rows = []; for (let k = 1; k <= d; k++) { const r = new Array(d); for (let c = 0; c < d; c++) r[c] = X[vs[k] * d + c] - X[vs[0] * d + c]; rows.push(r); }
  return det(rows);
}

// ------------------------------------------------------------- convex hull (quickhull)

/** Oriented hyperplane through the d points verts (outward = away from interior); null when degenerate. */
function hyperplane(X, d, verts, interior) {
  const o = verts[0] * d; const D = [];
  for (let k = 1; k < d; k++) { const r = new Array(d); for (let c = 0; c < d; c++) r[c] = X[verts[k] * d + c] - X[o + c]; D.push(r); }
  const n = new Float64Array(d); let nn = 0;
  for (let c = 0; c < d; c++) { const minor = D.map((r) => r.filter((_, j) => j !== c)); n[c] = (c % 2 ? -1 : 1) * det(minor); nn = Math.hypot(nn, n[c]); }
  if (!(nn > 0)) return null;
  let off = 0; for (let c = 0; c < d; c++) { n[c] /= nn; off += n[c] * X[o + c]; }
  let side = -off; for (let c = 0; c < d; c++) side += n[c] * interior[c];
  if (side > 0) { for (let c = 0; c < d; c++) n[c] = -n[c]; off = -off; }
  return { v: verts.slice(), n, off, out: [], dead: false };
}
const dist = (X, d, f, i) => { let s = -f.off; for (let c = 0; c < d; c++) s += f.n[c] * X[i * d + c]; return s; };

/**
 * Convex hull of points X (N-by-d, row-major). Returns {facets, interior} with simplicial facets
 * {v: vertex indices, n: unit outward normal, off}. Throws when the points do not span d dimensions.
 */
function convexHull(X, N, d, tol, fn) {
  if (N < d + 1) fail(`${fn}:notEnoughPoints`, `At least ${d + 1} points are needed in ${d}-D.`);
  // initial simplex: extremes along the widest axis, then the farthest points from the affine hull
  let axis = 0, best = -1, a = 0, b = 0;
  for (let c = 0; c < d; c++) {
    let lo = 0, hi = 0;
    for (let i = 1; i < N; i++) { if (X[i * d + c] < X[lo * d + c]) lo = i; if (X[i * d + c] > X[hi * d + c]) hi = i; }
    const ext = X[hi * d + c] - X[lo * d + c];
    if (ext > best) { best = ext; axis = c; a = lo; b = hi; }
  }
  void axis;
  if (!(best > tol)) fail(`${fn}:degenerate`, 'The points are coincident; the hull is degenerate (initial simplex is flat).');
  const simplex = [a, b]; const basis = [];
  const addDir = (i) => {
    const v = new Float64Array(d); for (let c = 0; c < d; c++) v[c] = X[i * d + c] - X[a * d + c];
    for (let pass = 0; pass < 2; pass++) for (const e of basis) { let s = 0; for (let c = 0; c < d; c++) s += e[c] * v[c]; for (let c = 0; c < d; c++) v[c] -= s * e[c]; }
    let nv = 0; for (let c = 0; c < d; c++) nv = Math.hypot(nv, v[c]);
    for (let c = 0; c < d; c++) v[c] /= nv; basis.push(v);
  };
  addDir(b);
  while (simplex.length < d + 1) {
    let far = -1, fd = 0;
    for (let i = 0; i < N; i++) {
      let r2 = 0; const v = new Float64Array(d);
      for (let c = 0; c < d; c++) v[c] = X[i * d + c] - X[a * d + c];
      for (const e of basis) { let s = 0; for (let c = 0; c < d; c++) s += e[c] * v[c]; for (let c = 0; c < d; c++) v[c] -= s * e[c]; }
      for (let c = 0; c < d; c++) r2 += v[c] * v[c];
      if (r2 > fd) { fd = r2; far = i; }
    }
    if (!(Math.sqrt(fd) > tol)) fail(`${fn}:degenerate`, `The points lie in a lower-dimensional subspace; the ${d}-D hull is degenerate (initial simplex is flat).`);
    simplex.push(far); addDir(far);
  }
  const interior = new Float64Array(d);
  for (const i of simplex) for (let c = 0; c < d; c++) interior[c] += X[i * d + c] / (d + 1);
  let facets = [];
  for (let k = 0; k <= d; k++) { const f = hyperplane(X, d, simplex.filter((_, j) => j !== k), interior); if (f) facets.push(f); }
  const inSimplex = new Set(simplex);
  for (let i = 0; i < N; i++) {
    if (inSimplex.has(i)) continue;
    for (const f of facets) if (dist(X, d, f, i) > tol) { f.out.push(i); break; }
  }
  let scan = 0, deadCount = 0;
  for (;;) {
    let f = null;
    for (let t = 0; t < facets.length; t++) { const g = facets[(scan + t) % facets.length]; if (!g.dead && g.out.length) { f = g; scan = (scan + t) % facets.length; break; } }
    if (!f) break;
    let p = f.out[0], pd = -Infinity;
    for (const i of f.out) { const dd = dist(X, d, f, i); if (dd > pd) { pd = dd; p = i; } }
    const visible = [];
    for (const g of facets) if (!g.dead && dist(X, d, g, p) > tol) visible.push(g);
    if (!visible.includes(f)) visible.push(f);
    const ridges = new Map();
    for (const g of visible) {
      g.dead = true; deadCount++;
      for (let j = 0; j < d; j++) {
        const r = g.v.filter((_, k) => k !== j); const key = r.slice().sort((x, y) => x - y).join(',');
        const e = ridges.get(key); if (e) e.count++; else ridges.set(key, { count: 1, r });
      }
    }
    const made = [];
    for (const { count, r } of ridges.values()) if (count === 1) { const nf = hyperplane(X, d, [...r, p], interior); if (nf) made.push(nf); }
    for (const g of visible) for (const i of g.out) {
      if (i === p) continue;
      for (const nf of made) if (dist(X, d, nf, i) > tol) { nf.out.push(i); break; }
    }
    for (const nf of made) facets.push(nf);
    if (deadCount > facets.length / 2) { facets = facets.filter((g) => !g.dead); deadCount = 0; scan = 0; }
  }
  return { facets: facets.filter((g) => !g.dead), interior };
}

/** Coordinates centred and scaled to [-1, 1]; returns {Y, center, scale}. */
function normalize(X, N, d) {
  const center = new Float64Array(d); let scale = 0;
  for (let c = 0; c < d; c++) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < N; i++) { lo = Math.min(lo, X[i * d + c]); hi = Math.max(hi, X[i * d + c]); } center[c] = (lo + hi) / 2; scale = Math.max(scale, (hi - lo) / 2); }
  const Y = new Float64Array(N * d); const s = scale || 1;
  for (let i = 0; i < N; i++) for (let c = 0; c < d; c++) Y[i * d + c] = (X[i * d + c] - center[c]) / s;
  return { Y, center, scale: s };
}
const HULL_TOL = (d) => 1e-11 * (d + 1);

/** Delaunay simplices (arrays of d+1 point indices) of N points in d dimensions. */
function delaunayCore(X, N, d, fn) {
  if (d < 1) fail(`${fn}:badDim`, 'Points must have at least one coordinate.');
  if (d === 1) {
    const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => X[a] - X[b]);
    const res = []; for (let k = 0; k + 1 < N; k++) if (X[idx[k + 1]] > X[idx[k]]) res.push([idx[k], idx[k + 1]]);
    return res;
  }
  if (N < d + 1) fail(`${fn}:notEnoughPoints`, `At least ${d + 1} points are needed in ${d}-D.`);
  const { Y } = normalize(X, N, d);
  const D = d + 1; const L = new Float64Array((N + 1) * D);
  let maxLift = 0;
  for (let i = 0; i < N; i++) { let s = 0; for (let c = 0; c < d; c++) { L[i * D + c] = Y[i * d + c]; s += Y[i * d + c] ** 2; } L[i * D + d] = s; maxLift = Math.max(maxLift, s); }
  L[N * D + d] = 1e4 * (maxLift + 1);
  const { facets } = convexHull(L, N + 1, D, HULL_TOL(D), fn);
  const vtol = 1e-12 * factorial(d);
  const res = [];
  for (const f of facets) {
    if (f.n[d] >= 0 || f.v.includes(N)) continue;
    if (Math.abs(simplexDet(Y, d, f.v)) <= vtol) continue;
    res.push(f.v.slice());
  }
  return res;
}

// ------------------------------------------------------------- point location

/** Locator of points in simplices: locate(q) -> {idx, lam} or null. */
function makeLocator(X, d, simplices, tol = 1e-12) {
  const S = simplices.map((vs) => {
    const rows = []; for (let r = 0; r < d; r++) { const row = new Array(d); for (let k = 1; k <= d; k++) row[k - 1] = X[vs[k] * d + r] - X[vs[0] * d + r]; rows.push(row); }
    const inv = inverse(rows);
    const lo = new Float64Array(d).fill(Infinity), hi = new Float64Array(d).fill(-Infinity);
    for (const v of vs) for (let c = 0; c < d; c++) { lo[c] = Math.min(lo[c], X[v * d + c]); hi[c] = Math.max(hi[c], X[v * d + c]); }
    return { vs, inv, lo, hi };
  });
  const glo = new Float64Array(d).fill(Infinity), ghi = new Float64Array(d).fill(-Infinity);
  for (const s of S) for (let c = 0; c < d; c++) { glo[c] = Math.min(glo[c], s.lo[c]); ghi[c] = Math.max(ghi[c], s.hi[c]); }
  const g = Math.max(1, Math.min(64, Math.floor(Math.pow(Math.max(1, S.length), 1 / d))));
  const ncell = g ** d;
  const cells = Array.from({ length: ncell }, () => []);
  const cellOf = (x, c) => { const w = ghi[c] - glo[c]; if (!(w > 0)) return 0; return Math.min(g - 1, Math.max(0, Math.floor(((x - glo[c]) / w) * g))); };
  S.forEach((s, si) => {
    if (!s.inv) return;
    const a = [], b = []; for (let c = 0; c < d; c++) { a.push(cellOf(s.lo[c], c)); b.push(cellOf(s.hi[c], c)); }
    const idx = a.slice();
    for (;;) {
      let lin = 0; for (let c = d - 1; c >= 0; c--) lin = lin * g + idx[c];
      cells[lin].push(si);
      let c = 0; while (c < d && idx[c] === b[c]) { idx[c] = a[c]; c++; }
      if (c === d) break; idx[c]++;
    }
  });
  const scaleTol = tol;
  return (q) => {
    for (let c = 0; c < d; c++) if (!(q[c] >= glo[c] - 1e-9 * (ghi[c] - glo[c] + 1) && q[c] <= ghi[c] + 1e-9 * (ghi[c] - glo[c] + 1))) return null;
    let lin = 0; for (let c = d - 1; c >= 0; c--) lin = lin * g + cellOf(q[c], c);
    for (const si of cells[lin]) {
      const s = S[si]; const lam = new Float64Array(d + 1); let sum = 0; let ok = true;
      for (let r = 0; r < d && ok; r++) { let v = 0; for (let c = 0; c < d; c++) v += s.inv[r][c] * (q[c] - X[s.vs[0] * d + c]); lam[r + 1] = v; sum += v; if (v < -scaleTol) ok = false; }
      if (!ok) continue;
      lam[0] = 1 - sum; if (lam[0] < -scaleTol) continue;
      return { idx: si, lam };
    }
    return null;
  };
}
/** Simplex index list from a triangulation argument (1-based rows) → 0-based arrays. */
function simplicesArg(v, fn, N, k) {
  const t = dbl(v, fn, 'T'); const [m, c] = t.dims;
  if (c !== k) fail(`${fn}:badTriangulation`, `The triangulation must have ${k} columns.`);
  const res = [];
  for (let i = 0; i < m; i++) {
    const r = []; for (let j = 0; j < c; j++) { const x = t.re[i + j * m]; if (!(Number.isInteger(x) && x >= 1 && x <= N)) fail(`${fn}:badTriangulation`, 'Triangulation indices must be integers between 1 and the number of points.'); r.push(x - 1); }
    res.push(r);
  }
  return res;
}

// ------------------------------------------------------------- builtins

function convhullnFn(args, nargout) {
  if (!args.length) fail('convhulln:notEnoughInputs', 'Not enough input arguments.');
  if (args[1] != null && !isOptionArg(args[1])) fail('convhulln:badOptions', 'Options must be a string or a cell array of strings.');
  const { X, N, d } = pointsArg(args[0], 'convhulln', 'pts');
  if (d < 2) fail('convhulln:badDim', 'The points must have at least 2 coordinates.');
  const { Y, scale } = normalize(X, N, d);
  const { facets, interior } = convexHull(Y, N, d, HULL_TOL(d), 'convhulln');
  const m = facets.length; const re = new Float64Array(m * d);
  facets.forEach((f, i) => { const vs = f.v.slice().sort((a, b) => a - b); for (let k = 0; k < d; k++) re[i + k * m] = vs[k] + 1; });
  const Hm = outMat(m, d, re);
  if (nargout < 2) return Hm;
  let vol = 0;
  for (const f of facets) {
    const rows = f.v.map((v) => { const r = new Array(d); for (let c = 0; c < d; c++) r[c] = Y[v * d + c] - interior[c]; return r; });
    vol += Math.abs(det(rows));
  }
  return [Hm, scalar((vol / factorial(d)) * scale ** d)];
}
function delaunaynFn(args) {
  if (!args.length) fail('delaunayn:notEnoughInputs', 'Not enough input arguments.');
  if (args[1] != null && !isOptionArg(args[1])) fail('delaunayn:badOptions', 'Options must be a string or a cell array of strings.');
  const { X, N, d } = pointsArg(args[0], 'delaunayn', 'pts');
  const T = delaunayCore(X, N, d, 'delaunayn');
  const m = T.length, k = d + 1; const re = new Float64Array(m * k);
  T.forEach((vs, i) => vs.forEach((v, j) => { re[i + j * m] = v + 1; }));
  return outMat(m, k, re);
}
/** Circumcentre of simplex vs (d+1 points of X), null when degenerate. */
function circumcenter(X, d, vs) {
  const rows = [], rhs = [];
  for (let k = 1; k <= d; k++) {
    const r = new Array(d); let s = 0;
    for (let c = 0; c < d; c++) { const a = X[vs[k] * d + c], b = X[vs[0] * d + c]; r[c] = 2 * (a - b); s += a * a - b * b; }
    rows.push(r); rhs.push(s);
  }
  return solve(rows, rhs);
}
function voronoinFn(args, nargout) {
  if (!args.length) fail('voronoin:notEnoughInputs', 'Not enough input arguments.');
  if (args[1] != null && !isOptionArg(args[1])) fail('voronoin:badOptions', 'Options must be a string or a cell array of strings.');
  const { X, N, d } = pointsArg(args[0], 'voronoin', 'pts');
  if (d < 2) fail('voronoin:badDim', 'The points must have at least 2 coordinates.');
  const { Y, center, scale } = normalize(X, N, d);
  const T = delaunayCore(X, N, d, 'voronoin');
  // Voronoi vertices = circumcentres (merged when they coincide)
  const verts = []; const keyOf = new Map(); const triVert = [];
  const q = 1e-9;
  for (const vs of T) {
    const c = circumcenter(Y, d, vs);
    if (!c) { triVert.push(-1); continue; }
    const key = c.map((x) => Math.round(x / q)).join(',');
    let id = keyOf.get(key);
    if (id === undefined) { id = verts.length; verts.push(c); keyOf.set(key, id); }
    triVert.push(id);
  }
  // unbounded cells: points on the hull boundary
  const { facets } = convexHull(Y, N, d, HULL_TOL(d), 'voronoin');
  const onHull = new Uint8Array(N);
  for (let i = 0; i < N; i++) for (const f of facets) if (Math.abs(dist(Y, d, f, i)) <= 1e-9) { onHull[i] = 1; break; }
  const cellsOf = Array.from({ length: N }, () => new Set());
  T.forEach((vs, t) => { if (triVert[t] >= 0) for (const v of vs) cellsOf[v].add(triVert[t]); });
  const F = [];
  for (let i = 0; i < N; i++) {
    let ids = Array.from(cellsOf[i]);
    if (d === 2 && ids.length) {
      const ang = (id) => Math.atan2(verts[id][1] - Y[i * 2 + 1], verts[id][0] - Y[i * 2]);
      ids.sort((a, b) => ang(a) - ang(b));
      if (onHull[i] && ids.length > 1) {
        // start right after the largest angular gap (where the cell opens to infinity)
        let gap = -1, at = 0;
        for (let k = 0; k < ids.length; k++) { let g = ang(ids[(k + 1) % ids.length]) - ang(ids[k]); if (g <= 0) g += 2 * Math.PI; if (g > gap) { gap = g; at = (k + 1) % ids.length; } }
        ids = ids.slice(at).concat(ids.slice(0, at));
      }
    }
    const idx = ids.map((id) => id + 2);
    if (onHull[i]) idx.unshift(1);
    F.push(out([1, idx.length], Float64Array.from(idx)));
  }
  const nv = verts.length + 1; const C = new Float64Array(nv * d);
  for (let c = 0; c < d; c++) { C[c * nv] = Infinity; verts.forEach((v, k) => { C[k + 1 + c * nv] = v[c] * scale + center[c]; }); }
  return many([outMat(nv, d, C), cell([N, 1], F)], nargout);
}
function voronoiFn(args, nargout, ctx) {
  let a = args.slice(); let hax = null;
  if (a.length >= 3 && a[0].dims && a[0].dims[0] * a[0].dims[1] === 1 && !isOptionArg(a[0]) && a[1].dims && a[1].dims[0] * a[1].dims[1] > 1) { hax = a[0]; a = a.slice(1); }
  if (a.length < 2) fail('voronoi:notEnoughInputs', 'Not enough input arguments.');
  const xv = dbl(a[0], 'voronoi', 'x').re, yv = dbl(a[1], 'voronoi', 'y').re;
  if (xv.length !== yv.length) fail('voronoi:dimMismatch', 'x and y must be vectors of the same length.');
  const n = xv.length;
  if (n < 3) fail('voronoi:notEnoughPoints', 'At least 3 points are needed.');
  let linespec = null;
  for (const o of a.slice(2)) { const t = optText(o); if (t != null && !/^q/i.test(t)) linespec = o; else if (!isOptionArg(o)) fail('voronoi:badOptions', 'Options must be Qhull option strings or a line specification.'); }
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) { xmin = Math.min(xmin, xv[i]); xmax = Math.max(xmax, xv[i]); ymin = Math.min(ymin, yv[i]); ymax = Math.max(ymax, yv[i]); }
  const dx = xmax - xmin || 1, dy = ymax - ymin || 1, sc = 2;
  const bx = [xmin - sc * dx, xmin - sc * dx, xmax + sc * dx, xmax + sc * dx], by = [ymin - sc * dy, ymax + sc * dy, ymax + sc * dy, ymin - sc * dy];
  const N = n + 4; const X = new Float64Array(N * 2);
  for (let i = 0; i < n; i++) { X[2 * i] = xv[i]; X[2 * i + 1] = yv[i]; }
  for (let k = 0; k < 4; k++) { X[2 * (n + k)] = bx[k]; X[2 * (n + k) + 1] = by[k]; }
  const T = delaunayCore(X, N, 2, 'voronoi');
  const cc = T.map((vs) => circumcenter(X, 2, vs));
  const edges = new Map();
  T.forEach((vs, t) => { for (let k = 0; k < 3; k++) { const p = vs[k], q = vs[(k + 1) % 3]; const key = p < q ? `${p},${q}` : `${q},${p}`; const e = edges.get(key); if (e) e.push(t); else edges.set(key, [t]); } });
  const ex = [], ey = [];
  const tol = 1e-10 * Math.max(dx, dy);
  for (const [key, ts] of edges) {
    if (ts.length !== 2) continue;
    const [p, q] = key.split(',').map(Number);
    if (p >= n && q >= n) continue;
    const c1 = cc[ts[0]], c2 = cc[ts[1]]; if (!c1 || !c2) continue;
    if (Math.hypot(c1[0] - c2[0], c1[1] - c2[1]) <= tol) continue;
    ex.push(c1[0], c2[0]); ey.push(c1[1], c2[1]);
  }
  const k = ex.length / 2;
  const vx = outMat(2, k, Float64Array.from(ex)), vy = outMat(2, k, Float64Array.from(ey));
  if (nargout >= 2) return [vx, vy];
  const px = outMat(n, 1, Float64Array.from(xv)), py = outMat(n, 1, Float64Array.from(yv));
  const r = ctx.call('plot', [...(hax ? [hax] : []), vx, vy, linespec || str('-b'), px, py, str('+')], nargout >= 1 ? 1 : 0);
  return nargout >= 1 ? r[0] : undefined;
}
function tsearchFn(args) {
  if (args.length < 5) fail('tsearch:notEnoughInputs', 'Not enough input arguments.');
  const x = dbl(args[0], 'tsearch', 'x').re, y = dbl(args[1], 'tsearch', 'y').re;
  if (x.length !== y.length) fail('tsearch:dimMismatch', 'x and y must have the same number of elements.');
  const N = x.length; const X = new Float64Array(N * 2);
  for (let i = 0; i < N; i++) { X[2 * i] = x[i]; X[2 * i + 1] = y[i]; }
  const T = simplicesArg(args[2], 'tsearch', N, 3);
  const xi = dbl(args[3], 'tsearch', 'xi'), yi = dbl(args[4], 'tsearch', 'yi');
  if (xi.re.length !== yi.re.length) fail('tsearch:dimMismatch', 'xi and yi must have the same number of elements.');
  const loc = makeLocator(X, 2, T);
  const res = Float64Array.from(xi.re, (xq, k) => { const r = loc([xq, yi.re[k]]); return r ? r.idx + 1 : NaN; });
  return out(xi.dims, res);
}
function tsearchnFn(args, nargout) {
  if (args.length < 3) fail('tsearchn:notEnoughInputs', 'Not enough input arguments.');
  const { X, N, d } = pointsArg(args[0], 'tsearchn', 'x');
  const T = simplicesArg(args[1], 'tsearchn', N, d + 1);
  const Q = pointsArg(args[2], 'tsearchn', 'xi');
  if (Q.d !== d) fail('tsearchn:dimMismatch', 'xi must have as many columns as x.');
  const loc = makeLocator(X, d, T);
  const idx = new Float64Array(Q.N), P = new Float64Array(Q.N * (d + 1));
  for (let i = 0; i < Q.N; i++) {
    const r = loc(Q.X.subarray(i * d, (i + 1) * d));
    if (!r) { idx[i] = NaN; for (let k = 0; k <= d; k++) P[i + k * Q.N] = NaN; continue; }
    idx[i] = r.idx + 1; for (let k = 0; k <= d; k++) P[i + k * Q.N] = r.lam[k];
  }
  return many([out([Q.N, 1], idx), outMat(Q.N, d + 1, P)], nargout);
}
/** Scattered interpolation at query points Q (row-major) — 'linear' or 'nearest'. */
function scatteredInterp(X, N, d, vals, Q, nq, method, fn) {
  const res = new Float64Array(nq);
  if (method === 'nearest') {
    for (let i = 0; i < nq; i++) {
      let best = -1, bd = Infinity;
      for (let j = 0; j < N; j++) { let s = 0; for (let c = 0; c < d; c++) s += (X[j * d + c] - Q[i * d + c]) ** 2; if (s < bd) { bd = s; best = j; } }
      res[i] = vals[best];
    }
    return res;
  }
  if (method !== 'linear') fail(`${fn}:badMethod`, `Unknown method '${method}' (use 'linear' or 'nearest').`);
  const T = delaunayCore(X, N, d, fn);
  const loc = makeLocator(X, d, T, 1e-10);
  for (let i = 0; i < nq; i++) {
    const r = loc(Q.subarray(i * d, (i + 1) * d));
    if (!r) { res[i] = NaN; continue; }
    let s = 0; T[r.idx].forEach((v, k) => { s += r.lam[k] * vals[v]; }); res[i] = s;
  }
  return res;
}
function griddatanFn(args) {
  if (args.length < 3) fail('griddatan:notEnoughInputs', 'Not enough input arguments.');
  const { X, N, d } = pointsArg(args[0], 'griddatan', 'x');
  const y = dbl(args[1], 'griddatan', 'y').re;
  if (y.length !== N) fail('griddatan:dimMismatch', 'y must have one value per row of x.');
  const Q = pointsArg(args[2], 'griddatan', 'xi');
  if (Q.d !== d) fail('griddatan:dimMismatch', 'xi must have as many columns as x.');
  const method = args[3] == null || (args[3].dims && args[3].dims[0] * args[3].dims[1] === 0) ? 'linear' : optText(args[3]);
  if (method == null) fail('griddatan:badMethod', 'The method must be text.');
  return out([Q.N, 1], scatteredInterp(X, N, d, y, Q.X, Q.N, method, 'griddatan'));
}
function griddata3Fn(args) {
  if (args.length < 7) fail('griddata3:notEnoughInputs', 'Not enough input arguments.');
  const xs = [0, 1, 2].map((k) => dbl(args[k], 'griddata3', 'xyz'.charAt(k)).re);
  const v = dbl(args[3], 'griddata3', 'v').re; const N = v.length;
  if (xs.some((a) => a.length !== N)) fail('griddata3:dimMismatch', 'x, y, z and v must have the same number of elements.');
  let qs = [4, 5, 6].map((k) => dbl(args[k], 'griddata3', ['xi', 'yi', 'zi'][k - 4]));
  let dims = qs[0].dims;
  const isVec = (t) => t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
  const same = qs.every((t) => t.dims.length === dims.length && t.dims.every((x, i) => x === dims[i]));
  if (!same) {
    if (!qs.every(isVec)) fail('griddata3:dimMismatch', 'xi, yi and zi must have the same size (or be vectors that define a grid).');
    const [a, b, c] = qs.map((t) => t.re); const nx = a.length, ny = b.length, nz = c.length;
    dims = [ny, nx, nz]; const n = nx * ny * nz;
    const g = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    for (let k = 0; k < nz; k++) for (let j = 0; j < nx; j++) for (let i = 0; i < ny; i++) { const o = i + ny * (j + nx * k); g[0][o] = a[j]; g[1][o] = b[i]; g[2][o] = c[k]; }
    qs = g.map((re) => ({ re }));
  }
  const nq = qs[0].re.length; const Q = new Float64Array(nq * 3);
  for (let i = 0; i < nq; i++) for (let c = 0; c < 3; c++) Q[i * 3 + c] = qs[c].re[i];
  const X = new Float64Array(N * 3); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) X[i * 3 + c] = xs[c][i];
  const method = args[7] == null ? 'linear' : optText(args[7]);
  if (method == null) fail('griddata3:badMethod', 'The method must be text.');
  return out(dims, scatteredInterp(X, N, 3, v, Q, nq, method, 'griddata3'));
}

export const builtins = {
  convhulln: convhullnFn,
  delaunayn: delaunaynFn,
  voronoi: voronoiFn,
  voronoin: voronoinFn,
  tsearch: tsearchFn,
  tsearchn: tsearchnFn,
  griddatan: griddatanFn,
  griddata3: griddata3Fn,
};

export const help = {
  convhulln: H('N-dimensional convex hull: facets (one simplex per row) and optionally the enclosed volume.', 'N 차원 볼록 껍질: 면 (행마다 단체 하나) 과 선택적으로 둘러싼 부피.', ['H = convhulln(pts)', 'H = convhulln(pts, options)', '[H, v] = convhulln(...)']),
  delaunayn: H('N-dimensional Delaunay triangulation (one simplex per row; zero-volume simplices removed).', 'N 차원 들로네 삼각분할 (행마다 단체 하나; 부피 0 인 단체 제거).', ['T = delaunayn(pts)', 'T = delaunayn(pts, options)']),
  voronoi: H('2-D Voronoi diagram: plots the edges, or returns them as 2-by-k vertex lists.', '2차원 보로노이 다이어그램: 변을 그리거나 2×k 꼭짓점 목록으로 반환.', ['voronoi(x, y)', 'voronoi(x, y, linespec)', 'h = voronoi(...)', '[vx, vy] = voronoi(x, y)']),
  voronoin: H('N-dimensional Voronoi cells: vertices C (first row Inf) and the vertex indices of each cell.', 'N 차원 보로노이 셀: 꼭짓점 C (첫 행은 Inf) 와 각 셀의 꼭짓점 인덱스.', ['[C, F] = voronoin(pts)', '[C, F] = voronoin(pts, options)']),
  tsearch: H('Index of the enclosing triangle of each point (NaN outside the triangulation).', '각 점을 포함하는 삼각형의 인덱스 (삼각분할 밖은 NaN).', ['idx = tsearch(x, y, t, xi, yi)']),
  tsearchn: H('Enclosing simplex of each point and its barycentric coordinates (NaN outside).', '각 점을 포함하는 단체와 무게중심 좌표 (밖은 NaN).', ['idx = tsearchn(x, t, xi)', '[idx, p] = tsearchn(x, t, xi)']),
  griddatan: H("Interpolate N-dimensional scattered data ('linear' or 'nearest').", "N 차원 산재 데이터 보간 ('linear' 또는 'nearest').", ['yi = griddatan(x, y, xi)', 'yi = griddatan(x, y, xi, method)']),
  griddata3: H("Interpolate 3-D scattered data ('linear' or 'nearest').", "3차원 산재 데이터 보간 ('linear' 또는 'nearest').", ['vi = griddata3(x, y, z, v, xi, yi, zi)', 'vi = griddata3(x, y, z, v, xi, yi, zi, method)']),
};
