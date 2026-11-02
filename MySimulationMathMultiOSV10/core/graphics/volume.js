// Volume visualisation and triangle-mesh plots: isosurface (marching
// tetrahedra) with isonormals / isocolors / isocaps, slice, smooth3,
// reducevolume, reducepatch, shrinkfaces, stream2 / stream3, stream ribbons
// and tubes, tetramesh / trimesh / trisurf / triplot, surface normals,
// surfl with diffuse / specular reflectance, and rotate. Everything is built
// from patch, surface and line objects (no renderer support needed).
import { tensor, cell, structOf, isStruct, isCell, str } from '../value.js';
import { gerr, isTxt, txt, nums, isNum, lower, finiteMinMax } from './util.js';
import { G, create, setPairs, pairsStart, handleValue, vecMat, matOfValue, objsOf, touch, matOfRows, rowsOfMat, isHandleValue, isGraphicsArg, isAxesType } from './model.js';
import { newplot, nextSeriesStyle, leadingAxes, applySpec, lineSpecOf } from './figax.js';
import { streamlines2d } from './plots3d.js';
import { resolvedColormap } from './scene.js';

const finite = (x) => x === x && x !== Infinity && x !== -Infinity;
const ret = (ctx, objs) => handleValue(ctx, objs.map((o) => o.id), objs.length === 0 ? [0, 0] : [objs.length, 1]);
const dbl = (dims, data) => tensor('double', dims, data instanceof Float64Array ? data : Float64Array.from(data));
const set3D = (ax) => { ax.props.View = [-37.5, 30]; ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = true; };
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- small vector helpers

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = nrm(a); return l > 0 ? scl(a, 1 / l) : [0, 0, 0]; };

/** Unit vector from [az el] in degrees (az = 0, el = 0 points along -y; the view convention) or from [x y z]. */
function dirVec(v, what) {
  const a = Array.from(nums(v));
  if (a.length === 2) { const az = a[0] * DEG, el = a[1] * DEG; return [Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)]; }
  if (a.length === 3) return a;
  throw gerr(`${what}:vector`, `${what}: the direction must be [az el] or [x y z].`);
}

// ---------------------------------------------------------------- volume grids

/** Grid vectors of a volume V (m×n×p): x along columns, y along rows, z along pages. */
function gridOf(V, X, Y, Z, fn) {
  const [m, n, p = 1] = V.dims;
  const axis = (M, len, stride, name) => {
    if (!M) return Array.from({ length: len }, (_, k) => k + 1);
    if (M.data.length === len) return Array.from(M.data);
    if (M.data.length === m * n * p) return Array.from({ length: len }, (_, k) => M.data[k * stride]);
    throw gerr(`${fn}:gridSize`, `${fn}: ${name} must be a vector of length ${len} or an array the size of the volume.`);
  };
  return { xs: axis(X, n, m, 'X'), ys: axis(Y, m, 1, 'Y'), zs: axis(Z, p, m * n, 'Z'), m, n, p };
}
const gidx = (g, i, j, k) => i + j * g.m + k * g.m * g.n;

/** Fractional index of x in a monotone vector (−1 when outside). */
function locate(a, x) {
  const n = a.length;
  if (n === 1) return Math.abs(x - a[0]) <= 1e-12 * Math.max(1, Math.abs(a[0])) ? 0 : -1;
  const inc = a[n - 1] >= a[0];
  const lo = inc ? a[0] : a[n - 1], hi = inc ? a[n - 1] : a[0];
  const tol = 1e-10 * Math.max(1, Math.abs(hi - lo));
  if (!(x >= lo - tol && x <= hi + tol)) return -1;
  let l = 0, h = n - 1;
  while (h - l > 1) { const mid = (l + h) >> 1; if ((a[mid] <= x) === inc) l = mid; else h = mid; }
  const d = a[h] - a[l];
  const t = d === 0 ? 0 : (x - a[l]) / d;
  return l + Math.min(1, Math.max(0, t));
}

/** Trilinear interpolation of data (on grid g) at (x, y, z); NaN outside. */
function trilinear(g, data, x, y, z) {
  const fj = locate(g.xs, x), fi = locate(g.ys, y), fk = locate(g.zs, z);
  if (fj < 0 || fi < 0 || fk < 0) return NaN;
  const j0 = Math.min(Math.floor(fj), Math.max(0, g.n - 2)), i0 = Math.min(Math.floor(fi), Math.max(0, g.m - 2)), k0 = Math.min(Math.floor(fk), Math.max(0, g.p - 2));
  const tj = fj - j0, ti = fi - i0, tk = fk - k0;
  const j1 = Math.min(j0 + 1, g.n - 1), i1 = Math.min(i0 + 1, g.m - 1), k1 = Math.min(k0 + 1, g.p - 1);
  const v = (i, j, k) => data[gidx(g, i, j, k)];
  const c00 = v(i0, j0, k0) * (1 - tj) + v(i0, j1, k0) * tj, c10 = v(i1, j0, k0) * (1 - tj) + v(i1, j1, k0) * tj;
  const c01 = v(i0, j0, k1) * (1 - tj) + v(i0, j1, k1) * tj, c11 = v(i1, j0, k1) * (1 - tj) + v(i1, j1, k1) * tj;
  const c0 = c00 * (1 - ti) + c10 * ti, c1 = c01 * (1 - ti) + c11 * ti;
  return c0 * (1 - tk) + c1 * tk;
}
function nearest(g, data, x, y, z) {
  const fj = locate(g.xs, x), fi = locate(g.ys, y), fk = locate(g.zs, z);
  if (fj < 0 || fi < 0 || fk < 0) return NaN;
  return data[gidx(g, Math.round(fi), Math.round(fj), Math.round(fk))];
}

/** Derivatives of a field on grid g: [d/dx, d/dy, d/dz] (central differences, one-sided at the ends). */
function gradField(g, F) {
  const N = g.m * g.n * g.p;
  const out = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
  const diff = (c, len, k0, step) => {
    const a = k0 === 0 ? 0 : k0 - 1, b = k0 === len - 1 ? len - 1 : k0 + 1;
    return [a, b, c[b] - c[a]];
  };
  for (let k = 0; k < g.p; k++) for (let j = 0; j < g.n; j++) for (let i = 0; i < g.m; i++) {
    const id = gidx(g, i, j, k);
    if (g.n > 1) { const [a, b, d] = diff(g.xs, g.n, j); out[0][id] = (F[gidx(g, i, b, k)] - F[gidx(g, i, a, k)]) / d; }
    if (g.m > 1) { const [a, b, d] = diff(g.ys, g.m, i); out[1][id] = (F[gidx(g, b, j, k)] - F[gidx(g, a, j, k)]) / d; }
    if (g.p > 1) { const [a, b, d] = diff(g.zs, g.p, k); out[2][id] = (F[gidx(g, i, j, b)] - F[gidx(g, i, j, a)]) / d; }
  }
  return out;
}

const meanCell = (g) => {
  const sp = (a) => (a.length > 1 ? Math.abs(a[a.length - 1] - a[0]) / (a.length - 1) : 0);
  const s = [sp(g.xs), sp(g.ys), sp(g.zs)].filter((x) => x > 0);
  return s.length ? s.reduce((x, y) => x + y, 0) / s.length : 1;
};
const minCell = (g) => {
  const sp = (a) => (a.length > 1 ? Math.abs(a[a.length - 1] - a[0]) / (a.length - 1) : Infinity);
  const v = Math.min(sp(g.xs), sp(g.ys), sp(g.zs));
  return Number.isFinite(v) && v > 0 ? v : 1;
};

/** Numeric (non-text) arguments as Mats and the text options (lower case). */
function splitArgs(args) {
  const d = [], opts = [];
  for (const a of args) { if (isTxt(a)) opts.push(lower(txt(a))); else d.push(a); }
  return { d, opts };
}
const mats = (vals) => vals.map((v) => matOfValue(v));
function need3D(V, fn) { if (V.dims.length < 3 || V.dims[2] < 2 || V.dims[0] < 2 || V.dims[1] < 2) throw gerr(`${fn}:volume`, `${fn}: the volume data must be a 3-D array (at least 2×2×2).`); }

// ---------------------------------------------------------------- faces / vertices values

const fvMats = (faces, verts, k = 3) => ({ F: { dims: [faces.length / k, k], data: colMajor(faces.map((x) => x + 1), k) }, V: { dims: [verts.length / 3, 3], data: colMajor(verts, 3) } });
function colMajor(flat, k) {
  const n = flat.length / k;
  const out = new Float64Array(flat.length);
  for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) out[i + c * n] = flat[i * k + c];
  return out;
}
const matV = (M) => dbl(M.dims, M.data);

/** Reads (faces, vertices) from a patch handle, an fv struct or two matrices. Returns {F, V, patch, rest}. */
function readFV(ctx, args, fn) {
  if (!args.length) throw gerr(`${fn}:args`, `${fn}: not enough input arguments.`);
  if (isHandleValue(args[0]) || (isNum(args[0]) && isGraphicsArg(ctx, args[0]))) {
    const [o] = objsOf(ctx, args[0]);
    if (o.type !== 'patch') throw gerr(`${fn}:notPatch`, `${fn}: the handle must be a patch.`);
    return { F: o.props.Faces, V: o.props.Vertices, patch: o, rest: args.slice(1) };
  }
  if (isStruct(args[0])) {
    const s = args[0];
    const get = (name) => { const f = s.fields.find((x) => lower(x) === name); return f ? matOfValue(s.data[0][f]) : null; };
    const F = get('faces'), V = get('vertices');
    if (!F || !V) throw gerr(`${fn}:struct`, `${fn}: the struct needs the fields 'faces' and 'vertices'.`);
    return { F, V, patch: null, rest: args.slice(1) };
  }
  if (args.length >= 2 && isNum(args[0]) && isNum(args[1])) return { F: matOfValue(args[0]), V: matOfValue(args[1]), patch: null, rest: args.slice(2) };
  throw gerr(`${fn}:args`, `${fn}: expected a patch handle, a struct with faces and vertices, or F and V.`);
}
const vertexRows = (V) => { const [n, k] = V.dims; const out = []; for (let i = 0; i < n; i++) out.push([V.data[i], V.data[i + n], k > 2 ? V.data[i + 2 * n] : 0]); return out; };
const faceRows = (F) => { const [n, k] = F.dims; const out = []; for (let i = 0; i < n; i++) { const r = []; for (let c = 0; c < k; c++) { const v = F.data[i + c * n]; if (finite(v)) r.push(v - 1); } out.push(r); } return out; };
/** Face list → Mat (NaN padded). */
function facesMat(list) {
  const n = list.length, k = Math.max(3, ...list.map((f) => f.length), 0);
  const d = new Float64Array(n * k).fill(NaN);
  list.forEach((f, i) => f.forEach((v, c) => { d[i + c * n] = v + 1; }));
  return { dims: [n, n ? k : 0], data: d };
}
const vertsMat = (rows) => matOfRows(rows.length ? rows : []);

/** Output of (F, V[, C]) as nargout dictates: struct for 1, matrices for more. */
function fvOut(nargout, F, V, C = null, cName = 'facevertexcdata') {
  if (nargout <= 1) {
    const rec = { faces: matV(F), vertices: matV(V) };
    if (C) rec[cName] = matV(C);
    return structOf(rec);
  }
  return C ? [matV(F), matV(V), matV(C)] : [matV(F), matV(V)];
}

// ---------------------------------------------------------------- isosurface (marching tetrahedra)

// cube corners as (di, dj, dk) with i → y (rows), j → x (columns), k → z (pages)
const CORNERS = [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]];
// Freudenthal split of a cube into six tetrahedra around the 0–6 diagonal (consistent between neighbours)
const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];

/** Automatic isovalue from the data histogram: the weighted mean value outside the most populated bin. */
function autoIso(data) {
  const [lo, hi] = finiteMinMax(data);
  if (!(lo < hi)) return lo;
  const nb = 1000, cnt = new Float64Array(nb);
  for (const v of data) if (finite(v)) cnt[Math.min(nb - 1, Math.floor(((v - lo) / (hi - lo)) * nb))]++;
  let top = 0;
  for (let b = 1; b < nb; b++) if (cnt[b] > cnt[top]) top = b;
  let s = 0, w = 0;
  for (let b = 0; b < nb; b++) if (b !== top) { s += cnt[b] * (lo + (b + 0.5) * (hi - lo) / nb); w += cnt[b]; }
  return w ? s / w : (lo + hi) / 2;
}

/**
 * Isosurface of V (grid g) at iso: { faces (flat, 0-based), verts (flat xyz), colors | null }.
 * Triangles face towards smaller values (the direction isonormals gives).
 */
export function marchTetrahedra(g, V, iso, C = null, share = true) {
  const verts = [], cols = C ? [] : null, faces = [];
  const keys = new Map();
  const N = g.m * g.n * g.p;
  const pos = (i, j, k) => [g.xs[j], g.ys[i], g.zs[k]];
  const cid = new Array(8), cval = new Array(8), cpos = new Array(8);
  const edge = (a, b) => {
    const ga = cid[a], gb = cid[b];
    // a corner exactly at the isovalue is one vertex for all its edges
    const onA = cval[a] === iso, onB = cval[b] === iso;
    const key = onA ? -1 - ga : onB ? -1 - gb : ga < gb ? ga * N + gb : gb * N + ga;
    if (share && keys.has(key)) return keys.get(key);
    const t = onA ? 0 : onB ? 1 : (iso - cval[a]) / (cval[b] - cval[a]);
    const pa = cpos[a], pb = cpos[b];
    const id = verts.length / 3;
    verts.push(pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1]), pa[2] + t * (pb[2] - pa[2]));
    if (cols) cols.push(C[ga] + t * (C[gb] - C[ga]));
    if (share) keys.set(key, id);
    return id;
  };
  const vp = (id) => [verts[3 * id], verts[3 * id + 1], verts[3 * id + 2]];
  const tri = (a, b, c, toward) => {
    if (a === b || b === c || a === c) return;
    const n = crs(sub(vp(b), vp(a)), sub(vp(c), vp(a)));
    if (nrm(n) <= 1e-300) return;
    if (dot(n, toward) < 0) faces.push(a, c, b); else faces.push(a, b, c);
  };
  for (let k = 0; k + 1 < g.p; k++) for (let j = 0; j + 1 < g.n; j++) for (let i = 0; i + 1 < g.m; i++) {
    let above = 0, bad = false;
    for (let c = 0; c < 8; c++) {
      const [di, dj, dk] = CORNERS[c];
      const id = gidx(g, i + di, j + dj, k + dk);
      cid[c] = id; cval[c] = V[id];
      if (!finite(cval[c])) { bad = true; break; }
      if (cval[c] > iso) above++;
    }
    if (bad || above === 0 || above === 8) continue;
    for (let c = 0; c < 8; c++) { const [di, dj, dk] = CORNERS[c]; cpos[c] = pos(i + di, j + dj, k + dk); }
    for (const t of TETS) {
      const up = t.filter((c) => cval[c] > iso), dn = t.filter((c) => !(cval[c] > iso));
      if (!up.length || !dn.length) continue;
      const cen = (list) => scl(list.reduce((s, c) => add(s, cpos[c]), [0, 0, 0]), 1 / list.length);
      const toward = sub(cen(dn), cen(up)); // from larger to smaller values
      if (up.length === 1 || dn.length === 1) {
        const [lone, others] = up.length === 1 ? [up[0], dn] : [dn[0], up];
        tri(edge(lone, others[0]), edge(lone, others[1]), edge(lone, others[2]), toward);
      } else {
        const [a0, a1] = up, [b0, b1] = dn;
        const p = edge(a0, b0), q = edge(a0, b1), r = edge(a1, b1), s = edge(a1, b0);
        tri(p, q, r, toward); tri(p, r, s, toward);
      }
    }
  }
  if (!share) { // drop the vertices of skipped (degenerate) triangles: three own vertices per face
    const v2 = [], c2 = cols ? [] : null;
    const f2 = faces.map((id, q) => { v2.push(verts[3 * id], verts[3 * id + 1], verts[3 * id + 2]); if (c2) c2.push(cols[id]); return q; });
    return { faces: f2, verts: v2, colors: c2 };
  }
return { faces, verts, colors: cols };
}

/** (X,Y,Z,)V(,iso)(,colors) argument forms. */
function isoArgs(d, fn, maxExtra) {
  let X = null, Y = null, Z = null, V, rest;
  const M = mats(d);
  if (M.length >= 4 && M[3].dims.length >= 3) { [X, Y, Z, V] = M; rest = M.slice(4); }
  else { V = M[0]; rest = M.slice(1); }
  if (!V) throw gerr(`${fn}:args`, `${fn}: not enough input arguments.`);
  need3D(V, fn);
  if (rest.length > maxExtra) throw gerr(`${fn}:args`, `${fn}: too many input arguments.`);
  return { g: gridOf(V, X, Y, Z, fn), V, rest };
}

function isosurfaceFn(args, nargout, ctx) {
  const { d, opts } = splitArgs(args);
  const { g, V, rest } = isoArgs(d, 'isosurface', 2);
  const iso = rest[0] && rest[0].data.length ? rest[0].data[0] : autoIso(V.data);
  const C = rest[1] || null;
  if (C && C.data.length !== V.data.length) throw gerr('isosurface:colors', 'isosurface: COLORS must have the size of the volume data.');
  for (const o of opts) if (!['noshare', 'verbose'].includes(o)) throw gerr('isosurface:option', `isosurface: unknown option '${o}'.`);
  const r = marchTetrahedra(g, V.data, iso, C ? C.data : null, !opts.includes('noshare'));
  if (opts.includes('verbose')) ctx.out(`isosurface: ${r.faces.length / 3} triangles, ${r.verts.length / 3} vertices at isovalue ${iso}\n`);
  const { F, V: VV } = fvMats(r.faces, r.verts);
  const Cm = r.colors ? { dims: [r.colors.length, 1], data: Float64Array.from(r.colors) } : null;
  if (nargout === 0) {
    const { ax, held } = newplot(ctx, null);
    if (!held) set3D(ax);
    const nv = VV.dims[0];
    create(ctx, 'patch', ax.id, {
      Faces: F, Vertices: VV, FaceVertexCData: Cm || { dims: [nv, 1], data: new Float64Array(nv).fill(iso) },
      FaceColor: Cm ? 'interp' : 'flat', EdgeColor: Cm ? 'none' : [0, 0, 0], FaceLighting: 'gouraud',
    });
    return [];
  }
  return fvOut(nargout, F, VV, Cm);
}

// ---------------------------------------------------------------- isonormals / isocolors

/** Vertices from a matrix or from a patch handle. */
function verticesArg(ctx, v, fn) {
  if (isHandleValue(v) || (isNum(v) && isGraphicsArg(ctx, v) && v.dims[0] * v.dims[1] === 1)) {
    const [o] = objsOf(ctx, v);
    if (o.type !== 'patch') throw gerr(`${fn}:notPatch`, `${fn}: the handle must be a patch.`);
    return { verts: vertexRows(o.props.Vertices || { dims: [0, 3], data: [] }), patch: o };
  }
  const M = matOfValue(v);
  if (M.dims[1] !== 3) throw gerr(`${fn}:vertices`, `${fn}: the vertices must be an n-by-3 matrix.`);
  return { verts: vertexRows(M), patch: null };
}

function isonormalsFn(args, nargout, ctx) {
  let a = args.slice();
  let negate = false;
  a = a.filter((v) => { if (isTxt(v) && lower(txt(v)) === 'negate') { negate = true; return false; } return true; });
  if (a.length !== 2 && a.length !== 5) throw gerr('isonormals:args', 'isonormals(V, vertices) or isonormals(X, Y, Z, V, vertices).');
  const M = mats(a.slice(0, a.length - 1));
  const V = M[M.length - 1];
  need3D(V, 'isonormals');
  const g = gridOf(V, M.length === 4 ? M[0] : null, M.length === 4 ? M[1] : null, M.length === 4 ? M[2] : null, 'isonormals');
  const { verts, patch } = verticesArg(ctx, a[a.length - 1], 'isonormals');
  const [gx, gy, gz] = gradField(g, V.data);
  const n = verts.length;
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = verts[i];
    let v = [-trilinear(g, gx, x, y, z), -trilinear(g, gy, x, y, z), -trilinear(g, gz, x, y, z)];
    const l = nrm(v);
    v = l > 0 ? scl(v, (negate ? -1 : 1) / l) : v.map((c) => (finite(c) ? 0 : NaN));
    out[i] = v[0]; out[i + n] = v[1]; out[i + 2 * n] = v[2];
  }
  const N = { dims: [n, 3], data: out };
  if (patch && nargout === 0) { patch.props.VertexNormals = N; patch.userSet.add('VertexNormals'); touch(G(ctx), patch); return []; }
  return matV(N);
}

function isocolorsFn(args, nargout, ctx) {
  const a = args.slice();
  if (![2, 4, 5, 7].includes(a.length)) throw gerr('isocolors:args', 'isocolors(C, vertices), isocolors(X, Y, Z, C, vertices), isocolors(R, G, B, vertices) or isocolors(X, Y, Z, R, G, B, vertices).');
  const M = mats(a.slice(0, a.length - 1));
  let X = null, Y = null, Z = null, comps;
  if (M.length === 1) comps = M;
  else if (M.length === 3 && M[0].dims.length >= 3 && M[0].data.length === M[1].data.length && M[1].data.length === M[2].data.length && a.length === 4) comps = M;
  else if (M.length === 4) { [X, Y, Z] = M; comps = [M[3]]; }
  else if (M.length === 6) { [X, Y, Z] = M; comps = M.slice(3); }
  else comps = M;
  for (const c of comps) need3D(c, 'isocolors');
  const g = gridOf(comps[0], X, Y, Z, 'isocolors');
  const { verts, patch } = verticesArg(ctx, a[a.length - 1], 'isocolors');
  const n = verts.length, k = comps.length;
  const out = new Float64Array(n * k);
  for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) out[i + c * n] = trilinear(g, comps[c].data, ...verts[i]);
  const Cm = { dims: [n, k], data: out };
  if (patch && nargout === 0) { patch.props.FaceVertexCData = Cm; patch.props.FaceColor = 'interp'; touch(G(ctx), patch); return []; }
  return matV(Cm);
}

// ---------------------------------------------------------------- isocaps

const PLANES = ['xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax'];

export function capGeometry(g, V, iso, enclose = 'above', which = 'all') {
  const verts = [], cols = [], faces = [];
  const keys = new Map();
  const inside = (v) => (enclose === 'above' ? v >= iso : v <= iso);
  const N = g.m * g.n * g.p;
  const corner = (i, j, k) => {
    const id = gidx(g, i, j, k), key = `c${id}`;
    if (!keys.has(key)) { keys.set(key, verts.length / 3); verts.push(g.xs[j], g.ys[i], g.zs[k]); cols.push(V[id]); }
    return keys.get(key);
  };
  const cross = (A, B) => {
    const ga = gidx(g, ...A), gb = gidx(g, ...B);
    const key = `e${Math.min(ga, gb) * N + Math.max(ga, gb)}`;
    if (!keys.has(key)) {
      const t = (iso - V[ga]) / (V[gb] - V[ga]);
      const pa = [g.xs[A[1]], g.ys[A[0]], g.zs[A[2]]], pb = [g.xs[B[1]], g.ys[B[0]], g.zs[B[2]]];
      keys.set(key, verts.length / 3);
      verts.push(pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1]), pa[2] + t * (pb[2] - pa[2]));
      cols.push(iso);
    }
    return keys.get(key);
  };
  const vp = (id) => [verts[3 * id], verts[3 * id + 1], verts[3 * id + 2]];
  for (const plane of PLANES) {
    if (which !== 'all' && which !== plane) continue;
    const axis = plane[0], max = plane.endsWith('max');
    const outward = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis].map((c) => (max ? c : -c));
    // index triples (i, j, k) over the plane: u / v are the free grid axes
    let nu, nv, at;
    if (axis === 'x') { const j = max ? g.n - 1 : 0; nu = g.m; nv = g.p; at = (u, v) => [u, j, v]; }
    else if (axis === 'y') { const i = max ? g.m - 1 : 0; nu = g.n; nv = g.p; at = (u, v) => [i, u, v]; }
    else { const k = max ? g.p - 1 : 0; nu = g.m; nv = g.n; at = (u, v) => [u, v, k]; }
    for (let v = 0; v + 1 < nv; v++) for (let u = 0; u + 1 < nu; u++) {
      const cs = [at(u, v), at(u + 1, v), at(u + 1, v + 1), at(u, v + 1)];
      const vals = cs.map((c) => V[gidx(g, ...c)]);
      if (vals.some((x) => !finite(x))) continue;
      const ins = vals.map(inside);
      if (!ins.some(Boolean)) continue;
      const poly = [];
      for (let q = 0; q < 4; q++) {
        const r = (q + 1) % 4;
        if (ins[q]) poly.push(corner(...cs[q]));
        if (ins[q] !== ins[r]) poly.push(cross(cs[q], cs[r]));
      }
      for (let t = 1; t + 1 < poly.length; t++) {
        const a = poly[0], b = poly[t], c = poly[t + 1];
        if (a === b || b === c || a === c) continue;
        const n = crs(sub(vp(b), vp(a)), sub(vp(c), vp(a)));
        if (nrm(n) <= 1e-300) continue;
        if (dot(n, outward) < 0) faces.push(a, c, b); else faces.push(a, b, c);
      }
    }
  }
  return { faces, verts, colors: cols };
}

function isocapsFn(args, nargout, ctx) {
  const { d, opts } = splitArgs(args);
  const { g, V, rest } = isoArgs(d, 'isocaps', 1);
  const iso = rest[0] && rest[0].data.length ? rest[0].data[0] : autoIso(V.data);
  let enclose = 'above', which = 'all';
  for (const o of opts) {
    if (o === 'above' || o === 'below') enclose = o;
    else if (o === 'all' || PLANES.includes(o)) which = o;
    else throw gerr('isocaps:option', `isocaps: unknown option '${o}'.`);
  }
  const r = capGeometry(g, V.data, iso, enclose, which);
  const { F, V: VV } = fvMats(r.faces, r.verts);
  const Cm = { dims: [r.colors.length, 1], data: Float64Array.from(r.colors) };
  if (nargout === 0) {
    const { ax, held } = newplot(ctx, null);
    if (!held) set3D(ax);
    create(ctx, 'patch', ax.id, { Faces: F, Vertices: VV, FaceVertexCData: Cm, FaceColor: 'interp', EdgeColor: 'none' });
    return [];
  }
  return fvOut(nargout, F, VV, Cm);
}

// ---------------------------------------------------------------- reducepatch / shrinkfaces / reducevolume

/** Vertex clustering on a G×G×G grid: {faces, verts}. */
function cluster(faces, verts, Gn) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) for (let c = 0; c < 3; c++) { if (v[c] < lo[c]) lo[c] = v[c]; if (v[c] > hi[c]) hi[c] = v[c]; }
  const cellOf = (x, c) => (hi[c] > lo[c] ? Math.min(Gn - 1, Math.floor(((x - lo[c]) / (hi[c] - lo[c])) * Gn)) : 0);
  const map = new Map(), rep = [], sums = [];
  const vmap = verts.map((v) => {
    const key = (cellOf(v[0], 0) * Gn + cellOf(v[1], 1)) * Gn + cellOf(v[2], 2);
    if (!map.has(key)) { map.set(key, rep.length); rep.push(0); sums.push([0, 0, 0]); }
    const id = map.get(key);
    rep[id]++; sums[id][0] += v[0]; sums[id][1] += v[1]; sums[id][2] += v[2];
    return id;
  });
  const seen = new Set(), out = [];
  for (const f of faces) {
    const q = [];
    for (const v of f) { const m = vmap[v]; if (q[q.length - 1] !== m) q.push(m); }
    while (q.length > 1 && q[0] === q[q.length - 1]) q.pop();
    if (new Set(q).size < 3) continue;
    const key = q.slice().sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue;
    seen.add(key); out.push(q);
  }
  // drop unused vertices
  const used = new Map(), nv = [];
  const faces2 = out.map((f) => f.map((v) => { if (!used.has(v)) { used.set(v, nv.length); nv.push(scl(sums[v], 1 / rep[v])); } return used.get(v); }));
  return { faces: faces2, verts: nv };
}

export function reduceMesh(faces, verts, target) {
  if (faces.length <= target) return { faces, verts };
  let best = { faces: [], verts: [] };
  let lo = 1, hi = 2;
  while (hi < 1 << 16) { const r = cluster(faces, verts, hi); if (r.faces.length > target) break; best = r; lo = hi; hi *= 2; }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; const r = cluster(faces, verts, mid); if (r.faces.length > target) hi = mid; else { best = r; lo = mid; } }
  if (!best.faces.length && lo === 1) best = cluster(faces, verts, 1);
  return best;
}

function reducepatchFn(args, nargout, ctx) {
  const { d, opts } = splitArgs(args);
  for (const o of opts) if (!['fast', 'verbose'].includes(o)) throw gerr('reducepatch:option', `reducepatch: unknown option '${o}'.`);
  const { F, V, patch, rest } = readFV(ctx, d, 'reducepatch');
  const r = rest.length ? nums(rest[0])[0] : 0.5;
  if (!(r > 0)) throw gerr('reducepatch:ratio', 'reducepatch: the reduction factor must be positive.');
  const faces = faceRows(F), verts = vertexRows(V);
  const target = r < 1 ? Math.max(1, Math.round(r * faces.length)) : Math.round(r);
  const red = reduceMesh(faces, verts, target);
  if (opts.includes('verbose')) ctx.out(`reducepatch: ${faces.length} faces reduced to ${red.faces.length}\n`);
  const Fm = facesMat(red.faces), Vm = vertsMat(red.verts);
  if (patch && nargout === 0) { patch.props.Faces = Fm; patch.props.Vertices = Vm; patch.props.FaceVertexCData = null; patch.props.XData = patch.props.YData = patch.props.ZData = null; touch(G(ctx), patch); return []; }
  return fvOut(nargout, Fm, Vm);
}

function shrinkfacesFn(args, nargout, ctx) {
  const { F, V, patch, rest } = readFV(ctx, args, 'shrinkfaces');
  const sf = rest.length ? nums(rest[0])[0] : 0.3;
  if (!(sf >= 0)) throw gerr('shrinkfaces:factor', 'shrinkfaces: the shrink factor must be a nonnegative scalar.');
  const faces = faceRows(F), verts = vertexRows(V);
  const nf = [], nv = [];
  const C = patch ? patch.props.FaceVertexCData : null;
  const perVertexC = C && C.dims[0] === verts.length && verts.length !== faces.length;
  const cRows = perVertexC ? rowsOfMat(C) : null, nc = [];
  for (const f of faces) {
    const cen = scl(f.reduce((s, v) => add(s, verts[v]), [0, 0, 0]), 1 / f.length);
    nf.push(f.map((v) => { nv.push(add(cen, scl(sub(verts[v], cen), sf))); if (cRows) nc.push(cRows[v]); return nv.length - 1; }));
  }
  const Fm = facesMat(nf), Vm = vertsMat(nv);
  if (patch && nargout === 0) {
    patch.props.Faces = Fm; patch.props.Vertices = Vm; patch.props.XData = patch.props.YData = patch.props.ZData = null;
    if (cRows) patch.props.FaceVertexCData = matOfRows(nc);
    touch(G(ctx), patch);
    return [];
  }
  return fvOut(nargout, Fm, Vm);
}

function reducevolumeFn(args, nargout, ctx) {
  void ctx;
  const M = mats(args);
  let X = null, Y = null, Z = null, V, R;
  if (M.length === 5) [X, Y, Z, V, R] = M;
  else if (M.length === 2) [V, R] = M;
  else throw gerr('reducevolume:args', 'reducevolume(V, R) or reducevolume(X, Y, Z, V, R).');
  need3D(V, 'reducevolume');
  let r = Array.from(R.data).map((x) => Math.round(x));
  if (r.length === 1) r = [r[0], r[0], r[0]];
  if (r.length !== 3 || r.some((x) => !(x >= 1))) throw gerr('reducevolume:factor', 'reducevolume: R must be a positive integer or a 3-element vector [Rx Ry Rz].');
  const g = gridOf(V, X, Y, Z, 'reducevolume');
  const keep = (len, step) => { const out = []; for (let k = 0; k < len; k += step) out.push(k); return out; };
  const J = keep(g.n, r[0]), I = keep(g.m, r[1]), K = keep(g.p, r[2]);
  const dims = [I.length, J.length, K.length];
  const total = dims[0] * dims[1] * dims[2];
  const nv = new Float64Array(total), nx = new Float64Array(total), ny = new Float64Array(total), nz = new Float64Array(total);
  let q = 0;
  for (const k of K) for (const j of J) for (const i of I) { nv[q] = V.data[gidx(g, i, j, k)]; nx[q] = g.xs[j]; ny[q] = g.ys[i]; nz[q] = g.zs[k]; q++; }
  if (nargout <= 1) return dbl(dims, nv);
  return [dbl(dims, nx), dbl(dims, ny), dbl(dims, nz), dbl(dims, nv)];
}

// ---------------------------------------------------------------- smooth3

function smooth3Fn(args) {
  const V0 = args[0] ? matOfValue(args[0]) : null;
  if (!V0) throw gerr('smooth3:args', 'smooth3: not enough input arguments.');
  if (V0.dims.length !== 3) throw gerr('smooth3:volume', 'smooth3: the data must be a 3-D array.');
  const filt = args.length > 1 ? lower(txt(args[1])) : 'box';
  if (filt !== 'box' && filt !== 'gaussian') throw gerr('smooth3:filter', "smooth3: the filter must be 'box' or 'gaussian'.");
  let sz = args.length > 2 ? Array.from(nums(args[2])).map(Math.round) : [3];
  if (sz.length === 1) sz = [sz[0], sz[0], sz[0]];
  if (sz.length !== 3 || sz.some((s) => !(s >= 1) || s % 2 === 0)) throw gerr('smooth3:size', 'smooth3: the size must be odd positive integers.');
  const sd = args.length > 3 ? nums(args[3])[0] : 0.65;
  const [m, n, p] = V0.dims;
  const kernel = (s) => {
    const h = (s - 1) / 2;
    const w = Array.from({ length: s }, (_, t) => (filt === 'box' ? 1 : Math.exp(-((t - h) ** 2) / (2 * sd * sd))));
    const tot = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / tot);
  };
  let cur = Float64Array.from(V0.data);
  const dimsArr = [m, n, p], strides = [1, m, m * n];
  // sz = [rows, columns, pages] (the order of the array dimensions)
  for (let ax = 0; ax < 3; ax++) {
    if (sz[ax] === 1) continue;
    const w = kernel(sz[ax]), h = (sz[ax] - 1) / 2, len = dimsArr[ax], st = strides[ax];
    const next = new Float64Array(cur.length);
    for (let id = 0; id < cur.length; id++) {
      const pos = Math.floor(id / st) % len;
      const base = id - pos * st;
      let s = 0;
      for (let t = 0; t < w.length; t++) { const q = Math.min(len - 1, Math.max(0, pos + t - h)); s += w[t] * cur[base + q * st]; }
      next[id] = s;
    }
    cur = next;
  }
  return dbl([m, n, p], cur);
}

// ---------------------------------------------------------------- slice

function sliceFn(args, nargout, ctx) {
  const lead = leadingAxes(ctx, args);
  const { d, opts } = splitArgs(lead.args);
  let method = 'linear';
  for (const o of opts) { if (['linear', 'nearest', 'cubic'].includes(o)) method = o; else throw gerr('slice:method', `slice: unknown method '${o}'.`); }
  const M = mats(d);
  let X = null, Y = null, Z = null, V, rest;
  if (M.length === 7) { [X, Y, Z, V] = M; rest = M.slice(4); }
  else if (M.length === 4) { V = M[0]; rest = M.slice(1); }
  else throw gerr('slice:args', 'slice(V, sx, sy, sz), slice(X, Y, Z, V, sx, sy, sz) or slice(X, Y, Z, V, XI, YI, ZI).');
  need3D(V, 'slice');
  const g = gridOf(V, X, Y, Z, 'slice');
  const sample = method === 'nearest' ? nearest : trilinear;
  const { ax, held } = newplot(ctx, lead.ax);
  const out = [];
  const mkSurf = (rows, cols, fx, fy, fz) => {
    const n = rows * cols, xd = new Float64Array(n), yd = new Float64Array(n), zd = new Float64Array(n), cd = new Float64Array(n);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const q = r + c * rows;
      xd[q] = fx(r, c); yd[q] = fy(r, c); zd[q] = fz(r, c); cd[q] = sample(g, V.data, xd[q], yd[q], zd[q]);
    }
    const dims = [rows, cols];
    out.push(create(ctx, 'surface', ax.id, { XData: { dims, data: xd }, YData: { dims, data: yd }, ZData: { dims, data: zd }, CData: { dims, data: cd }, CDataMode: 'manual', FaceColor: 'flat', EdgeColor: [0, 0, 0] }));
  };
  const [SX, SY, SZ] = rest;
  const isSurface = SX.dims[0] > 1 && SX.dims[1] > 1 && SX.data.length === SY.data.length && SY.data.length === SZ.data.length;
  if (isSurface) {
    const [r, c] = SX.dims;
    mkSurf(r, c, (i, j) => SX.data[i + j * r], (i, j) => SY.data[i + j * r], (i, j) => SZ.data[i + j * r]);
  } else {
    for (const sx of SX.data) mkSurf(g.p, g.m, () => sx, (r, c) => g.ys[c], (r) => g.zs[r]);
    for (const sy of SY.data) mkSurf(g.p, g.n, (r, c) => g.xs[c], () => sy, (r) => g.zs[r]);
    for (const sz of SZ.data) mkSurf(g.m, g.n, (r, c) => g.xs[c], (r) => g.ys[r], () => sz);
  }
  if (!held) set3D(ax);
  return ret(ctx, out);
}

// ---------------------------------------------------------------- streamlines

function streamOpts(M, fn) {
  if (!M) return { step: 0.1, maxVert: 10000 };
  const a = Array.from(M.data);
  if (a.length < 1 || a.length > 2 || !(a[0] > 0)) throw gerr(`${fn}:options`, `${fn}: options must be [step] or [step maxvert].`);
  return { step: a[0], maxVert: a.length > 1 ? Math.max(1, Math.round(a[1])) : 10000 };
}

function stream2Fn(args) {
  const M = mats(args);
  let X, Y, U, V, sx, sy, o = null;
  if (M.length === 6 || M.length === 7) [X, Y, U, V, sx, sy, o] = M;
  else if (M.length === 4 || M.length === 5) {
    [U, V, sx, sy, o] = M;
    const [m, n] = U.dims;
    X = vecMat(Array.from({ length: n }, (_, j) => j + 1)); Y = { dims: [m, 1], data: Float64Array.from({ length: m }, (_, i) => i + 1) };
  } else throw gerr('stream2:args', 'stream2(X, Y, U, V, startx, starty) or stream2(U, V, startx, starty).');
  if (U.data.length !== V.data.length) throw gerr('stream2:size', 'stream2: U and V must have the same size.');
  if (sx.data.length !== sy.data.length) throw gerr('stream2:start', 'stream2: startx and starty must have the same number of elements.');
  const { step, maxVert } = streamOpts(o, 'stream2');
  const lines = streamlines2d(X, Y, U, V, Array.from(sx.data), Array.from(sy.data), step, maxVert - 1);
  return cell([1, lines.length], lines.map(([px, py]) => { const n = px.length; const d = new Float64Array(2 * n); for (let i = 0; i < n; i++) { d[i] = px[i]; d[i + n] = py[i]; } return dbl([n, 2], d); }));
}

/** 3-D streamlines (midpoint rule on the normalised field, step in cell units): arrays of [x,y,z] points. */
export function streamlines3d(g, U, V, W, starts, step = 0.1, maxVert = 10000) {
  const h = step * minCell(g);
  const vel = (x, y, z) => [trilinear(g, U, x, y, z), trilinear(g, V, x, y, z), trilinear(g, W, x, y, z)];
  const lines = [];
  for (const s of starts) {
    let p = s.slice();
    const pts = [];
    if (!finite(trilinear(g, U, ...p))) { lines.push(pts); continue; }
    pts.push(p.slice());
    for (let it = 1; it < maxVert; it++) {
      const v1 = vel(...p), s1 = nrm(v1);
      if (!(s1 > 1e-12)) break;
      const mid = add(p, scl(v1, 0.5 * h / s1));
      const v2 = vel(...mid), s2 = nrm(v2);
      if (!(s2 > 1e-12)) break;
      p = add(p, scl(v2, h / s2));
      if (!finite(trilinear(g, U, ...p))) break;
      pts.push(p.slice());
    }
    lines.push(pts);
  }
  return lines;
}

/** (X,Y,Z,)U,V,W,sx,sy,sz(,opts) → {g, U, V, W, starts, extra}. */
function field3Args(M, fn, nExtra = 1) {
  let X = null, Y = null, Z = null, U, V, W, sx, sy, sz, extra;
  if (M.length >= 9 && M.length <= 9 + nExtra && M[3].dims.length >= 3) { [X, Y, Z, U, V, W, sx, sy, sz] = M; extra = M.slice(9); }
  else if (M.length >= 6 && M.length <= 6 + nExtra) { [U, V, W, sx, sy, sz] = M; extra = M.slice(6); }
  else throw gerr(`${fn}:args`, `${fn}(X, Y, Z, U, V, W, startx, starty, startz) or ${fn}(U, V, W, startx, starty, startz).`);
  need3D(U, fn);
  if (U.data.length !== V.data.length || V.data.length !== W.data.length) throw gerr(`${fn}:size`, `${fn}: U, V and W must have the same size.`);
  if (sx.data.length !== sy.data.length || sy.data.length !== sz.data.length) throw gerr(`${fn}:start`, `${fn}: the start coordinates must have the same number of elements.`);
  const g = gridOf(U, X, Y, Z, fn);
  const starts = Array.from(sx.data, (x, i) => [x, sy.data[i], sz.data[i]]);
  return { g, U: U.data, V: V.data, W: W.data, starts, extra };
}

function stream3Fn(args) {
  const M = mats(args);
  const { g, U, V, W, starts, extra } = field3Args(M, 'stream3');
  const { step, maxVert } = streamOpts(extra[0], 'stream3');
  const lines = streamlines3d(g, U, V, W, starts, step, maxVert);
  return cell([1, lines.length], lines.map((pts) => { const n = pts.length; const d = new Float64Array(3 * n); pts.forEach((q, i) => { d[i] = q[0]; d[i + n] = q[1]; d[i + 2 * n] = q[2]; }); return dbl([n, 3], d); }));
}

/** Rotation-minimising frames along a polyline: [{t, n, b}]. */
function frames(pts) {
  const n = pts.length;
  const T = pts.map((_, k) => unit(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)])));
  const t0 = T[0];
  const ref = Math.abs(t0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let N = unit(crs(t0, ref));
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = T[k];
    N = unit(sub(N, scl(t, dot(N, t))));
    if (!(nrm(N) > 0)) N = unit(crs(t, Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    out.push({ t, n: N, b: crs(t, N) });
  }
  return out;
}

/** Accumulated twist angle along a line from angular velocity samples (rad per unit time) and speeds. */
function twistOf(pts, omega, speed) {
  const th = [0];
  for (let k = 1; k < pts.length; k++) {
    const ds = nrm(sub(pts[k], pts[k - 1]));
    const w = 0.5 * ((omega[k - 1] || 0) + (omega[k] || 0)), s = 0.5 * ((speed[k - 1] || 0) + (speed[k] || 0));
    th.push(th[k - 1] + (s > 1e-12 && finite(w) ? (w * ds) / s : 0));
  }
  return th;
}

/** Field derived quantities at points: streamwise angular velocity (½ curl·û), speed and divergence. */
function fieldSampler(g, U, V, W) {
  const [Ux, Uy, Uz] = gradField(g, U), [Vx, Vy, Vz] = gradField(g, V), [Wx, Wy, Wz] = gradField(g, W);
  const at = (A, p) => trilinear(g, A, p[0], p[1], p[2]);
  return {
    vel: (p) => [at(U, p), at(V, p), at(W, p)],
    curl: (p) => [at(Wy, p) - at(Vz, p), at(Uz, p) - at(Wx, p), at(Vx, p) - at(Uy, p)],
    div: (p) => at(Ux, p) + at(Vy, p) + at(Wz, p),
  };
}

function cellLines(v, fn) {
  if (!isCell(v)) throw gerr(`${fn}:vertices`, `${fn}: the vertices must be a cell array of n-by-3 matrices.`);
  return v.data.map((x) => { const M = matOfValue(x); if (M.dims[1] !== 3 && M.data.length) throw gerr(`${fn}:vertices`, `${fn}: each vertex array must be n-by-3.`); return vertexRows(M); });
}
const perLine = (v, k, len) => {
  if (isCell(v)) { const a = Array.from(nums(v.data[Math.min(k, v.data.length - 1)])); return a.length === 1 ? new Array(len).fill(a[0]) : a; }
  const a = Array.from(nums(v)); return a.length === 1 ? new Array(len).fill(a[0]) : a;
};

/** A surface tube around pts: radius per point, nv sides, twist per point. */
function tubeSurface(ctx, ax, pts, radius, nv, twist, colorByAngle) {
  const fr = frames(pts);
  const rows = pts.length, cols = nv + 1;
  const xd = new Float64Array(rows * cols), yd = new Float64Array(rows * cols), zd = new Float64Array(rows * cols), cd = new Float64Array(rows * cols);
  for (let k = 0; k < rows; k++) {
    const { n, b } = fr[k];
    for (let c = 0; c < cols; c++) {
      const phi = (2 * Math.PI * c) / nv + (twist ? twist[k] : 0);
      const off = add(scl(n, Math.cos(phi) * radius[k]), scl(b, Math.sin(phi) * radius[k]));
      const q = k + c * rows;
      xd[q] = pts[k][0] + off[0]; yd[q] = pts[k][1] + off[1]; zd[q] = pts[k][2] + off[2];
      cd[q] = colorByAngle ? Math.cos((2 * Math.PI * c) / nv) : radius[k];
    }
  }
  const dims = [rows, cols];
  return create(ctx, 'surface', ax.id, { XData: { dims, data: xd }, YData: { dims, data: yd }, ZData: { dims, data: zd }, CData: { dims, data: cd }, CDataMode: 'manual', FaceColor: 'interp', EdgeColor: 'none', FaceLighting: 'gouraud' });
}

function tubeOpts(M, g) {
  const a = M ? Array.from(M.data) : [];
  const scale = a.length ? a[0] : 1, nv = a.length > 1 ? Math.max(3, Math.round(a[1])) : 20;
  if (!(scale > 0)) throw gerr('streamtube:options', 'streamtube: options must be [scale] or [scale n].');
  return { r0: 0.5 * scale * (g ? meanCell(g) : 1), nv };
}

function streamtubeImpl(args, ctx, oriented) {
  const fn = oriented ? 'ostreamtube' : 'streamtube';
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  const lines = [], radii = [], twists = [];
  let nv = 20;
  if (a.length && isCell(a[0])) {
    if (oriented) throw gerr(`${fn}:args`, `${fn}(X, Y, Z, U, V, W, startx, starty, startz[, options]).`);
    const L = cellLines(a[0], fn);
    const M = mats(a.slice(1).filter((v) => !isCell(v)));
    if (M.length >= 4) { // (verts, X, Y, Z, divergence[, options])
      const [X, Y, Z, D] = M;
      const g = gridOf(D, X, Y, Z, fn);
      const o = tubeOpts(M[4], g); nv = o.nv;
      const all = [];
      L.forEach((pts) => all.push(...pts.map((p) => Math.abs(trilinear(g, D.data, ...p)))));
      const mean = all.filter(finite).reduce((s, x) => s + x, 0) / Math.max(1, all.filter(finite).length) || 1;
      for (const pts of L) { lines.push(pts); radii.push(pts.map((p) => o.r0 * Math.min(3, Math.max(0.1, Math.sqrt((Math.abs(trilinear(g, D.data, ...p)) || 0) / mean || 1))))); twists.push(null); }
    } else { // (verts, width[, options])
      const o = tubeOpts(a[2] ? matOfValue(a[2]) : null, null); nv = o.nv;
      L.forEach((pts, k) => { lines.push(pts); radii.push(a.length > 1 ? perLine(a[1], k, pts.length).map((w) => w / 2) : new Array(pts.length).fill(0.5)); twists.push(null); });
    }
  } else {
    const M = mats(a);
    const { g, U, V, W, starts, extra } = field3Args(M, fn);
    const o = tubeOpts(extra[0], g); nv = o.nv;
    const sm = fieldSampler(g, U, V, W);
    const L = streamlines3d(g, U, V, W, starts, 0.1, 10000);
    const divs = L.map((pts) => pts.map((p) => Math.abs(sm.div(p))));
    const flat = divs.flat().filter(finite);
    const mean = flat.length ? flat.reduce((s, x) => s + x, 0) / flat.length : 0;
    L.forEach((pts, k) => {
      lines.push(pts);
      if (oriented) {
        radii.push(new Array(pts.length).fill(o.r0));
        const omega = pts.map((p) => 0.5 * dot(sm.curl(p), unit(sm.vel(p))));
        const speed = pts.map((p) => nrm(sm.vel(p)));
        twists.push(twistOf(pts, omega, speed));
      } else {
        radii.push(divs[k].map((dv) => (mean > 1e-12 ? o.r0 * Math.min(3, Math.max(0.1, Math.sqrt(dv / mean))) : o.r0)));
        twists.push(null);
      }
    });
  }
  const { ax, held } = newplot(ctx, lead.ax);
  const out = [];
  lines.forEach((pts, k) => { if (pts.length >= 2) out.push(tubeSurface(ctx, ax, pts, radii[k], nv, twists[k], oriented)); });
  if (!held) set3D(ax);
  return ret(ctx, out);
}

function streamribbonFn(args, nargout, ctx) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args;
  const lines = [], twists = [];
  let width = null;
  let g = null;
  if (a.length && isCell(a[0])) {
    const L = cellLines(a[0], 'streamribbon');
    const M = mats(a.slice(1).filter((v) => !isCell(v)));
    if (M.length >= 5) { // (verts, X, Y, Z, cav, speed[, width])
      const [X, Y, Z, CAV, SP] = M;
      g = gridOf(CAV, X, Y, Z, 'streamribbon');
      if (M[5]) width = M[5].data[0];
      for (const pts of L) { lines.push(pts); twists.push(twistOf(pts, pts.map((p) => trilinear(g, CAV.data, ...p)), pts.map((p) => trilinear(g, SP.data, ...p)))); }
    } else { // (verts, twistangle[, width])
      if (a.length < 2) throw gerr('streamribbon:args', 'streamribbon(vertices, twistangle[, width]).');
      if (a[2]) width = nums(a[2])[0];
      L.forEach((pts, k) => { lines.push(pts); twists.push(perLine(a[1], k, pts.length)); });
    }
  } else {
    const M = mats(a);
    const r = field3Args(M, 'streamribbon');
    g = r.g;
    if (r.extra[0]) width = r.extra[0].data[0];
    const sm = fieldSampler(g, r.U, r.V, r.W);
    for (const pts of streamlines3d(g, r.U, r.V, r.W, r.starts, 0.1, 10000)) {
      lines.push(pts);
      twists.push(twistOf(pts, pts.map((p) => 0.5 * dot(sm.curl(p), unit(sm.vel(p)))), pts.map((p) => nrm(sm.vel(p)))));
    }
  }
  if (width == null) width = g ? meanCell(g) : 1;
  const { ax, held } = newplot(ctx, lead.ax);
  const out = [];
  lines.forEach((pts, k) => {
    if (pts.length < 2) return;
    const fr = frames(pts);
    const rows = pts.length, n = rows * 2;
    const xd = new Float64Array(n), yd = new Float64Array(n), zd = new Float64Array(n), cd = new Float64Array(n);
    for (let i = 0; i < rows; i++) {
      const th = twists[k][i] || 0;
      const dir = add(scl(fr[i].n, Math.cos(th)), scl(fr[i].b, Math.sin(th)));
      for (let c = 0; c < 2; c++) {
        const q = pts[i];
        const off = scl(dir, (c ? 0.5 : -0.5) * width);
        xd[i + c * rows] = q[0] + off[0]; yd[i + c * rows] = q[1] + off[1]; zd[i + c * rows] = q[2] + off[2]; cd[i + c * rows] = th;
      }
    }
    const dims = [rows, 2];
    out.push(create(ctx, 'surface', ax.id, { XData: { dims, data: xd }, YData: { dims, data: yd }, ZData: { dims, data: zd }, CData: { dims, data: cd }, CDataMode: 'manual', FaceColor: 'interp', EdgeColor: 'none', FaceLighting: 'gouraud' }));
  });
  if (!held) set3D(ax);
  return ret(ctx, out);
}

// ---------------------------------------------------------------- triangle meshes

/** Splits (numeric..., [linespec], name/value...) */
function meshArgs(args, fn, minNum) {
  const k = pairsStart(args, minNum);
  const d = [];
  let spec = null, i = 0;
  for (; i < k; i++) {
    if (isTxt(args[i])) { const s = lineSpecOf(args[i]); if (!s) break; spec = s; continue; }
    d.push(matOfValue(args[i]));
  }
  if (d.length < minNum) throw gerr(`${fn}:args`, `${fn}: not enough input arguments.`);
  return { d, spec, pairs: args.slice(i) };
}
function triFaces(T, nv, fn, k = 3) {
  if (T.dims[1] !== k) throw gerr(`${fn}:tri`, `${fn}: the triangulation must have ${k} columns.`);
  for (const v of T.data) if (!(Number.isInteger(v) && v >= 1 && v <= nv)) throw gerr(`${fn}:tri`, `${fn}: the triangulation refers to a vertex that does not exist.`);
  return T;
}

function triplotFn(args, nargout, ctx) {
  const lead = leadingAxes(ctx, args);
  const { d, spec, pairs } = meshArgs(lead.args, 'triplot', 3);
  const [T, X, Y] = d;
  if (X.data.length !== Y.data.length) throw gerr('triplot:size', 'triplot: X and Y must have the same number of elements.');
  triFaces(T, X.data.length, 'triplot');
  const nt = T.dims[0];
  const xs = [], ys = [];
  for (let r = 0; r < nt; r++) {
    for (const c of [0, 1, 2, 0]) { const v = T.data[r + c * nt] - 1; xs.push(X.data[v]); ys.push(Y.data[v]); }
    xs.push(NaN); ys.push(NaN);
  }
  const { ax } = newplot(ctx, lead.ax);
  const props = { XData: vecMat(xs), YData: vecMat(ys) };
  applySpec(props, spec, nextSeriesStyle(ax));
  const o = create(ctx, 'line', ax.id, props);
  setPairs(ctx, [o], pairs);
  return ret(ctx, [o]);
}

function trimeshImpl(args, nargout, ctx, kind) {
  const lead = leadingAxes(ctx, args);
  const { d, pairs } = meshArgs(lead.args, kind, 3);
  if (d.length === 3 && kind === 'trimesh') return triplotFn(args, nargout, ctx);
  if (d.length < 4) throw gerr(`${kind}:args`, `${kind}(tri, x, y, z[, c]).`);
  const [T, X, Y, Z] = d;
  const n = X.data.length;
  if (Y.data.length !== n || Z.data.length !== n) throw gerr(`${kind}:size`, `${kind}: x, y and z must have the same number of elements.`);
  triFaces(T, n, kind);
  const C = d[4] || Z;
  const V = { dims: [n, 3], data: Float64Array.from([...X.data, ...Y.data, ...Z.data]) };
  const rgb = C.dims[1] === 3 && C.dims[0] === n && C.data.length === 3 * n;
  const CD = rgb ? C : { dims: [C.data.length, 1], data: Float64Array.from(C.data) };
  const { ax, held } = newplot(ctx, lead.ax);
  const props = { Faces: T, Vertices: V, FaceVertexCData: CD };
  if (kind === 'trimesh') Object.assign(props, { FaceColor: [1, 1, 1], EdgeColor: CD.dims[0] === T.dims[0] ? 'flat' : 'interp', FaceLighting: 'none' });
  else Object.assign(props, { FaceColor: CD.dims[0] === T.dims[0] ? 'flat' : 'interp', EdgeColor: [0, 0, 0] });
  if (kind === 'trisurf' && CD.dims[0] === n && n !== T.dims[0]) props.FaceColor = 'flat';
  const o = create(ctx, 'patch', ax.id, props);
  setPairs(ctx, [o], pairs);
  if (!held) set3D(ax);
  return ret(ctx, [o]);
}

function tetrameshFn(args, nargout, ctx) {
  const lead = leadingAxes(ctx, args);
  const { d, pairs } = meshArgs(lead.args, 'tetramesh', 2);
  const [T, X] = d;
  if (X.dims[1] !== 3) throw gerr('tetramesh:points', 'tetramesh: X must be an n-by-3 matrix of points.');
  triFaces(T, X.dims[0], 'tetramesh', 4);
  const nt = T.dims[0];
  const P = vertexRows(X);
  const { ax, held } = newplot(ctx, lead.ax);
  const cmap = rowsOfMat(resolvedColormap(G(ctx), ax));
  let colors;
  const C = d[2];
  if (C && C.dims[1] === 3 && C.dims[0] === nt) colors = rowsOfMat(C);
  else {
    const c = C ? Array.from(C.data) : Array.from({ length: nt }, (_, i) => i + 1);
    if (c.length !== nt) throw gerr('tetramesh:colors', 'tetramesh: C must have one value per tetrahedron.');
    const [lo, hi] = finiteMinMax(c);
    colors = c.map((v) => cmap[hi > lo ? Math.min(cmap.length - 1, Math.floor(((v - lo) / (hi - lo)) * (cmap.length - 1) + 0.5)) : 0]);
  }
  const out = [];
  for (let r = 0; r < nt; r++) {
    const vs = [0, 1, 2, 3].map((c) => P[T.data[r + c * nt] - 1]);
    out.push(create(ctx, 'patch', ax.id, { Faces: matOfRows([[1, 2, 3], [1, 2, 4], [1, 3, 4], [2, 3, 4]]), Vertices: matOfRows(vs), FaceColor: colors[r].slice(), EdgeColor: [0, 0, 0] }));
  }
  setPairs(ctx, out, pairs);
  if (!held) { set3D(ax); ax.props.XGrid = ax.props.YGrid = ax.props.ZGrid = false; }
  return ret(ctx, out);
}

// ---------------------------------------------------------------- surface normals and reflectance

/** (Z) or (X, Y, Z) → full m×n arrays. */
function surfGrid(M, fn) {
  let X, Y, Z;
  if (M.length === 1) Z = M[0];
  else if (M.length >= 3) [X, Y, Z] = M;
  else throw gerr(`${fn}:args`, `${fn}(Z) or ${fn}(X, Y, Z).`);
  const [m, n] = Z.dims;
  if (m < 2 || n < 2) throw gerr(`${fn}:size`, `${fn}: Z must be at least 2-by-2.`);
  const full = (A, isX) => {
    const d = new Float64Array(m * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) {
      d[i + j * m] = !A ? (isX ? j + 1 : i + 1) : A.data.length === m * n ? A.data[i + j * m] : isX ? A.data[j] : A.data[i];
    }
    if (A && A.data.length !== m * n && A.data.length !== (isX ? n : m)) throw gerr(`${fn}:size`, `${fn}: X and Y must match the size of Z.`);
    return d;
  };
  return { m, n, X: full(X, true), Y: full(Y, false), Z: Float64Array.from(Z.data) };
}

/** Unit normals of a surface grid (central differences; +z for a flat z = 0 grid). */
export function surfaceNormals(s) {
  const { m, n, X, Y, Z } = s;
  const N = [new Float64Array(m * n), new Float64Array(m * n), new Float64Array(m * n)];
  const P = (i, j) => [X[i + j * m], Y[i + j * m], Z[i + j * m]];
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) {
    const dj = sub(P(i, Math.min(n - 1, j + 1)), P(i, Math.max(0, j - 1)));
    const di = sub(P(Math.min(m - 1, i + 1), j), P(Math.max(0, i - 1), j));
    const v = unit(crs(dj, di));
    for (let c = 0; c < 3; c++) N[c][i + j * m] = v[c];
  }
  return N;
}

function surfnormFn(args, nargout, ctx) {
  const lead = leadingAxes(ctx, args);
  const k = pairsStart(lead.args, 1);
  const M = mats(lead.args.slice(0, k));
  const s = surfGrid(M, 'surfnorm');
  const N = surfaceNormals(s);
  if (nargout > 0) return N.map((d) => dbl([s.m, s.n], d));
  const { ax, held } = newplot(ctx, lead.ax);
  const Zm = { dims: [s.m, s.n], data: s.Z };
  const surf = create(ctx, 'surface', ax.id, { XData: { dims: [s.m, s.n], data: s.X }, YData: { dims: [s.m, s.n], data: s.Y }, ZData: Zm, CData: Zm });
  setPairs(ctx, [surf], lead.args.slice(k));
  const [x0, x1] = finiteMinMax(s.X), [y0, y1] = finiteMinMax(s.Y), [z0, z1] = finiteMinMax(s.Z);
  const len = 0.1 * Math.hypot(x1 - x0, y1 - y0, z1 - z0) || 0.1;
  const xs = [], ys = [], zs = [];
  for (let q = 0; q < s.m * s.n; q++) {
    xs.push(s.X[q], s.X[q] + len * N[0][q], NaN); ys.push(s.Y[q], s.Y[q] + len * N[1][q], NaN); zs.push(s.Z[q], s.Z[q] + len * N[2][q], NaN);
  }
  create(ctx, 'line', ax.id, { XData: vecMat(xs), YData: vecMat(ys), ZData: vecMat(zs), Color: nextSeriesStyle(ax).color });
  if (!held) set3D(ax);
  return [];
}

/** Diffuse (Lambert) reflectance of normals (sx, sy, sz) for light direction lv. */
export function diffuseRefl(sx, sy, sz, lv) {
  const l = unit(lv);
  return sx.map((x, i) => { const n = Math.hypot(x, sy[i], sz[i]); const r = (x * l[0] + sy[i] * l[1] + sz[i] * l[2]) / n; return r > 0 ? r : 0; });
}
/** Specular (Phong) reflectance: (r·v)^se with r the mirrored light direction. */
export function specularRefl(sx, sy, sz, lv, vv, se = 10) {
  const l = unit(lv), v = unit(vv);
  const lv_ = dot(l, v);
  return sx.map((x, i) => {
    const n = Math.hypot(x, sy[i], sz[i]);
    const nl = (x * l[0] + sy[i] * l[1] + sz[i] * l[2]) / n, nv = (x * v[0] + sy[i] * v[1] + sz[i] * v[2]) / n;
    const c = 2 * nl * nv - lv_;
    return c > 0 && nl > 0 ? c ** se : 0;
  });
}

function reflArgs(args, fn, n) {
  if (args.length < n) throw gerr(`${fn}:args`, `${fn}: not enough input arguments.`);
  const S = mats(args.slice(0, 3));
  if (S[0].data.length !== S[1].data.length || S[1].data.length !== S[2].data.length) throw gerr(`${fn}:size`, `${fn}: SX, SY and SZ must have the same size.`);
  return S;
}

function surflFn(args, nargout, ctx) {
  const lead = leadingAxes(ctx, args);
  const a = lead.args.filter((v) => !(isTxt(v) && lower(txt(v)) === 'light'));
  const useLight = a.length !== lead.args.length;
  const M = mats(a);
  let data, L = null, P = [0.55, 0.6, 0.4, 10];
  if (M.length === 1 || M.length === 3) data = M;
  else if (M.length === 2) { data = [M[0]]; L = M[1]; }
  else if (M.length === 4) { if (M[1].data.length <= 3 && M[0].data.length > 3) { data = [M[0]]; L = M[1]; P = Array.from(M[2].data); } else { data = M.slice(0, 3); L = M[3]; } }
  else if (M.length === 5) { data = M.slice(0, 3); L = M[3]; P = Array.from(M[4].data); }
  else throw gerr('surfl:args', 'surfl(Z), surfl(X, Y, Z), surfl(..., L), surfl(..., L, P) or surfl(..., \'light\').');
  if (P.length !== 4) throw gerr('surfl:reflectance', 'surfl: P must be [ka kd ks spread].');
  const s = surfGrid(data, 'surfl');
  const { ax, held } = newplot(ctx, lead.ax);
  if (!held) set3D(ax);
  const [az, el] = ax.props.View;
  const lv = L ? dirVec(tensor('double', L.dims, L.data), 'surfl') : dirVec(tensor('double', [1, 2], [az + 45, el]), 'surfl');
  const vv = dirVec(tensor('double', [1, 2], [az, el]), 'surfl');
  const dims = [s.m, s.n];
  const props = { XData: { dims, data: s.X }, YData: { dims, data: s.Y }, ZData: { dims, data: s.Z } };
  if (useLight) {
    Object.assign(props, { CData: { dims, data: s.Z }, FaceLighting: 'gouraud', AmbientStrength: P[0], DiffuseStrength: P[1], SpecularStrength: P[2], SpecularExponent: P[3], EdgeColor: 'none', FaceColor: 'interp' });
    const surf = create(ctx, 'surface', ax.id, props);
    const scale = Math.max(1, ...[s.X, s.Y, s.Z].map((d) => { const [lo, hi] = finiteMinMax(d); return Math.abs(hi - lo); }));
    create(ctx, 'light', ax.id, { Position: scl(unit(lv), scale * 10), Style: 'infinite' });
    return ret(ctx, [surf]);
  }
  const N = surfaceNormals(s);
  const nx = Array.from(N[0]), ny = Array.from(N[1]), nz = Array.from(N[2]);
  const dif = diffuseRefl(nx, ny, nz, lv), spe = specularRefl(nx, ny, nz, lv, vv, P[3]);
  const cd = Float64Array.from(dif, (dv, i) => P[0] + P[1] * dv + P[2] * spe[i]);
  Object.assign(props, { CData: { dims, data: cd }, CDataMode: 'manual', EdgeColor: 'none', FaceColor: 'interp' });
  const surf = create(ctx, 'surface', ax.id, props);
  return ret(ctx, [surf]);
}

// ---------------------------------------------------------------- rotate

function rotateFn(args, nargout, ctx) {
  if (args.length < 3) throw gerr('rotate:args', 'rotate(h, direction, alpha) or rotate(h, direction, alpha, origin).');
  const objs = objsOf(ctx, args[0]);
  const axis = unit((() => {
    const a = Array.from(nums(args[1]));
    if (a.length === 2) { const th = a[0] * DEG, ph = a[1] * DEG; return [Math.cos(ph) * Math.cos(th), Math.cos(ph) * Math.sin(th), Math.sin(ph)]; }
    if (a.length === 3) return a;
    throw gerr('rotate:direction', 'rotate: the direction must be [theta phi] or [x y z].');
  })());
  if (!(nrm(axis) > 0)) throw gerr('rotate:direction', 'rotate: the direction must not be zero.');
  const alpha = nums(args[2])[0] * DEG;
  const st = G(ctx);
  // per-object point lists (getter / setter)
  const items = objs.map((o) => pointsOf(o));
  let origin;
  if (args.length > 3) { origin = Array.from(nums(args[3])); if (origin.length !== 3) throw gerr('rotate:origin', 'rotate: the origin must be [x y z].'); }
  else {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const it of items) for (const p of it.pts) for (let c = 0; c < 3; c++) if (finite(p[c])) { lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); }
    origin = lo.map((l, c) => (l <= hi[c] ? (l + hi[c]) / 2 : 0));
  }
  const c = Math.cos(alpha), s = Math.sin(alpha), [ux, uy, uz] = axis;
  const R = [
    [c + ux * ux * (1 - c), ux * uy * (1 - c) - uz * s, ux * uz * (1 - c) + uy * s],
    [uy * ux * (1 - c) + uz * s, c + uy * uy * (1 - c), uy * uz * (1 - c) - ux * s],
    [uz * ux * (1 - c) - uy * s, uz * uy * (1 - c) + ux * s, c + uz * uz * (1 - c)],
  ];
  const rot = (p) => { const q = sub(p, origin); return add(origin, [dot(R[0], q), dot(R[1], q), dot(R[2], q)]); };
  for (const it of items) { it.set(it.pts.map(rot)); touch(st, it.o); }
  return [];
}

function pointsOf(o) {
  const p = o.props;
  const xyzTypes = ['line', 'animatedline', 'scatter', 'stem', 'stair', 'surface'];
  if (xyzTypes.includes(o.type)) {
    const Y = p.YData, X = p.XData, Z = p.ZData;
    let dims, xs, ys, zs;
    if (o.type === 'surface') {
      const s = surfGrid([X, Y, Z].map((M) => M || null).every(Boolean) ? [X, Y, Z] : [Z], 'rotate');
      dims = [s.m, s.n]; xs = s.X; ys = s.Y; zs = s.Z;
    } else {
      const n = Y ? Y.data.length : 0;
      dims = Y ? Y.dims.slice() : [1, 0];
      xs = Float64Array.from({ length: n }, (_, i) => (X && X.data.length === n ? X.data[i] : i + 1));
      ys = Float64Array.from(Y ? Y.data : []);
      zs = Float64Array.from({ length: n }, (_, i) => (Z && Z.data.length === n ? Z.data[i] : 0));
    }
    const pts = Array.from(xs, (x, i) => [x, ys[i], zs[i]]);
    return {
      o, pts,
      set(q) {
        p.XData = { dims, data: Float64Array.from(q, (v) => v[0]) }; p.YData = { dims, data: Float64Array.from(q, (v) => v[1]) }; p.ZData = { dims, data: Float64Array.from(q, (v) => v[2]) };
        if ('XDataMode' in p) p.XDataMode = 'manual';
      },
    };
  }
  if (o.type === 'patch') {
    const pts = p.Vertices ? vertexRows(p.Vertices) : [];
    return {
      o, pts,
      set(q) {
        p.Vertices = matOfRows(q);
        if (p.XData && p.Faces) { // keep the per-face X/Y/Z data in step
          const F = p.Faces, [nf, k] = F.dims;
          const mk = (c) => { const d = new Float64Array(k * nf); for (let f = 0; f < nf; f++) for (let r = 0; r < k; r++) { const v = F.data[f + r * nf]; d[r + f * k] = finite(v) ? q[v - 1][c] : NaN; } return { dims: [k, nf], data: d }; };
          p.XData = mk(0); p.YData = mk(1); p.ZData = mk(2);
        }
      },
    };
  }
  if (o.type === 'text' || o.type === 'light') {
    const P = p.Position || [0, 0, 0];
    return { o, pts: [[P[0], P[1], P[2] || 0]], set(q) { p.Position = q[0].slice(); } };
  }
  if (isAxesType(o.type) || o.type === 'figure') throw gerr('rotate:type', 'rotate: the handles must be graphics objects such as lines, surfaces, patches or text.');
  return { o, pts: [], set() {} };
}

// ---------------------------------------------------------------- builtins

export const builtins = {
  isosurface: isosurfaceFn,
  isonormals: isonormalsFn,
  isocolors: isocolorsFn,
  isocaps: isocapsFn,
  reducepatch: reducepatchFn,
  reducevolume: reducevolumeFn,
  shrinkfaces: shrinkfacesFn,
  smooth3(args) { return smooth3Fn(args); },
  slice: sliceFn,
  stream2(args) { return stream2Fn(args); },
  stream3(args) { return stream3Fn(args); },
  streamribbon: streamribbonFn,
  streamtube(args, nargout, ctx) { return streamtubeImpl(args, ctx, false); },
  ostreamtube(args, nargout, ctx) { return streamtubeImpl(args, ctx, true); },
  tetramesh: tetrameshFn,
  trimesh(args, nargout, ctx) { return trimeshImpl(args, nargout, ctx, 'trimesh'); },
  trisurf(args, nargout, ctx) { return trimeshImpl(args, nargout, ctx, 'trisurf'); },
  triplot: triplotFn,
  surfnorm: surfnormFn,
  surfl: surflFn,
  diffuse(args) {
    const S = reflArgs(args, 'diffuse', 4);
    const lv = dirVec(args[3], 'diffuse');
    return dbl(S[0].dims, diffuseRefl(Array.from(S[0].data), Array.from(S[1].data), Array.from(S[2].data), lv));
  },
  specular(args) {
    const S = reflArgs(args, 'specular', 5);
    const lv = dirVec(args[3], 'specular'), vv = dirVec(args[4], 'specular');
    const se = args.length > 5 ? nums(args[5])[0] : 10;
    return dbl(S[0].dims, specularRefl(Array.from(S[0].data), Array.from(S[1].data), Array.from(S[2].data), lv, vv, se));
  },
  rotate: rotateFn,
};

export const quiet = ['slice', 'streamribbon', 'streamtube', 'ostreamtube', 'tetramesh', 'trimesh', 'trisurf', 'triplot', 'surfl'];

// ---------------------------------------------------------------- help

const H = {};
const h = (name, en, ko, syntax) => { H[name] = { en, ko, syntax }; };
h('isosurface', 'Isosurface of volume data (marching tetrahedra); draws a patch when no output is requested.', '부피 데이터의 등위면 (사면체 행진법); 출력이 없으면 패치를 그립니다.',
  ['fv = isosurface(V, isovalue)', 'fv = isosurface(X, Y, Z, V, isovalue)', '[f, v] = isosurface(___)', '[f, v, c] = isosurface(X, Y, Z, V, isovalue, colors)', "isosurface(___, 'noshare')", "isosurface(___, 'verbose')"]);
h('isonormals', 'Vertex normals of an isosurface from the gradient of the volume data (pointing towards smaller values).', '부피 데이터의 기울기로 구한 등위면 꼭짓점 법선 (작은 값 쪽을 향함).',
  ['n = isonormals(V, vertices)', 'n = isonormals(X, Y, Z, V, vertices)', 'isonormals(___, p)', "n = isonormals(___, 'negate')"]);
h('isocolors', 'Colours of isosurface vertices interpolated from volume colour data.', '부피 색 데이터에서 보간한 등위면 꼭짓점 색.',
  ['c = isocolors(C, vertices)', 'c = isocolors(X, Y, Z, C, vertices)', 'c = isocolors(R, G, B, vertices)', 'c = isocolors(X, Y, Z, R, G, B, vertices)', 'isocolors(___, p)']);
h('isocaps', 'End caps that close an isosurface at the faces of the volume box.', '부피 상자 면에서 등위면을 닫는 끝 덮개.',
  ['fvc = isocaps(V, isovalue)', 'fvc = isocaps(X, Y, Z, V, isovalue)', "[f, v, c] = isocaps(___, 'below')", "isocaps(___, 'xmin')"]);
h('reducepatch', 'Reduces the number of faces of a patch (vertex clustering).', '패치의 면 수를 줄입니다 (꼭짓점 묶기).',
  ['nfv = reducepatch(p, r)', 'nfv = reducepatch(fv, r)', '[nf, nv] = reducepatch(f, v, r)', 'reducepatch(p, r)', "reducepatch(___, 'verbose')"]);
h('reducevolume', 'Reduces volume data by keeping every R-th element.', 'R번째 원소마다 남겨 부피 데이터를 줄입니다.',
  ['nv = reducevolume(V, R)', '[nx, ny, nz, nv] = reducevolume(X, Y, Z, V, R)', 'nv = reducevolume(V, [Rx Ry Rz])']);
h('shrinkfaces', 'Shrinks each patch face towards its centre.', '패치의 각 면을 중심 쪽으로 줄입니다.',
  ['nfv = shrinkfaces(p, sf)', 'nfv = shrinkfaces(fv, sf)', '[nf, nv] = shrinkfaces(f, v, sf)', 'shrinkfaces(p, sf)']);
h('smooth3', 'Smooths 3-D data with a box or Gaussian filter.', '상자 또는 가우스 필터로 3차원 데이터를 매끄럽게 합니다.',
  ['W = smooth3(V)', "W = smooth3(V, 'box', size)", "W = smooth3(V, 'gaussian', size, sd)"]);
h('slice', 'Slice planes (or a slice surface) through volume data, coloured by the data.', '부피 데이터를 자르는 평면(또는 곡면)을 데이터 색으로 그립니다.',
  ['slice(V, sx, sy, sz)', 'slice(X, Y, Z, V, sx, sy, sz)', 'slice(X, Y, Z, V, XI, YI, ZI)', "slice(___, 'nearest')", 'h = slice(___)']);
h('stream2', 'Vertices of 2-D streamlines.', '2차원 유선의 꼭짓점.', ['xy = stream2(X, Y, U, V, startx, starty)', 'xy = stream2(U, V, startx, starty)', 'xy = stream2(___, [step maxvert])']);
h('stream3', 'Vertices of 3-D streamlines.', '3차원 유선의 꼭짓점.', ['xyz = stream3(X, Y, Z, U, V, W, startx, starty, startz)', 'xyz = stream3(U, V, W, startx, starty, startz)', 'xyz = stream3(___, [step maxvert])']);
h('streamribbon', 'Ribbons along 3-D streamlines, twisted by the streamwise vorticity.', '흐름 방향 소용돌이도로 꼬인 3차원 유선 리본.',
  ['streamribbon(X, Y, Z, U, V, W, startx, starty, startz)', 'streamribbon(U, V, W, startx, starty, startz)', 'streamribbon(vertices, twistangle)', 'streamribbon(vertices, X, Y, Z, cav, speed)', 'streamribbon(___, width)', 'h = streamribbon(___)']);
h('streamtube', 'Tubes along 3-D streamlines; the radius follows the divergence of the field.', '3차원 유선을 따른 관; 반지름은 벡터장의 발산을 따릅니다.',
  ['streamtube(X, Y, Z, U, V, W, startx, starty, startz)', 'streamtube(U, V, W, startx, starty, startz)', 'streamtube(vertices, X, Y, Z, divergence)', 'streamtube(vertices, width)', 'streamtube(___, [scale n])', 'h = streamtube(___)']);
h('ostreamtube', 'Oriented tubes along 3-D streamlines: constant radius, twisted by the streamwise vorticity.', '방향이 있는 3차원 유선 관: 일정한 반지름, 흐름 방향 소용돌이도로 꼬임.',
  ['ostreamtube(X, Y, Z, U, V, W, startx, starty, startz)', 'ostreamtube(U, V, W, startx, starty, startz)', 'ostreamtube(___, [scale n])', 'h = ostreamtube(___)']);
h('tetramesh', 'Plots a tetrahedral mesh (one patch per tetrahedron).', '사면체 메시를 그립니다 (사면체마다 패치 하나).', ['tetramesh(T, X)', 'tetramesh(T, X, C)', 'h = tetramesh(___, Name, Value)']);
h('trimesh', 'Triangular mesh plot.', '삼각형 메시 그림.', ['trimesh(tri, x, y, z)', 'trimesh(tri, x, y, z, c)', 'trimesh(tri, x, y)', 'h = trimesh(___, Name, Value)']);
h('trisurf', 'Triangular surface plot.', '삼각형 곡면 그림.', ['trisurf(tri, x, y, z)', 'trisurf(tri, x, y, z, c)', 'h = trisurf(___, Name, Value)']);
h('triplot', 'Plots a 2-D triangulation as lines.', '2차원 삼각분할을 선으로 그립니다.', ['triplot(tri, x, y)', 'triplot(tri, x, y, linespec)', 'h = triplot(___, Name, Value)']);
h('surfnorm', 'Surface normals; without outputs draws the surface with its normals.', '곡면 법선; 출력이 없으면 곡면과 법선을 그립니다.', ['[nx, ny, nz] = surfnorm(X, Y, Z)', '[nx, ny, nz] = surfnorm(Z)', 'surfnorm(___)']);
h('surfl', 'Surface shaded by a light source (ambient + diffuse + specular reflectance as colour).', '광원으로 음영을 준 곡면 (주변광 + 확산 + 정반사를 색으로).',
  ['surfl(Z)', 'surfl(X, Y, Z)', 'surfl(___, L)', 'surfl(___, L, P)', "surfl(___, 'light')", 'h = surfl(___)']);
h('diffuse', 'Diffuse (Lambert) reflectance of surface normals for a light direction.', '광원 방향에 대한 곡면 법선의 확산(람베르트) 반사율.', ['R = diffuse(sx, sy, sz, lv)']);
h('specular', 'Specular (Phong) reflectance of surface normals for light and view directions.', '광원과 시점 방향에 대한 곡면 법선의 정반사(퐁) 반사율.', ['R = specular(sx, sy, sz, lv, vv)', 'R = specular(sx, sy, sz, lv, vv, se)']);
h('rotate', 'Rotates graphics objects about an axis through an origin (changes their data).', '원점을 지나는 축을 중심으로 그래픽 객체를 회전합니다 (데이터를 바꿈).',
  ['rotate(h, direction, alpha)', 'rotate(h, direction, alpha, origin)']);
export const help = H;
void str;
