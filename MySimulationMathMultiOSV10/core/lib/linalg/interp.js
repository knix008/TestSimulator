// Interpolation and computational geometry: interp1, interp2, interp3,
// interpn, interpft, griddedInterpolant, scatteredInterpolant, griddata,
// spline, pchip, makima, ppval, mkpp, unmkpp, delaunay,
// delaunayTriangulation, convhull, trapz, cumtrapz.
import { fail, out, outMat, scalar, optText, isOpt, scal, intArg, H, dbl, resultCls, firstNonSingleton, tensor } from './util.js';
import { structOf, isStruct, num, str, cell, isCell, object, isObject, toStr, isText, broadcastDims, prod } from '../../value.js';
import { field } from './util.js';
import { fftInPlace, alongDim } from './fft-kernel.js';
import { cm, toC, luFactor, luSolve } from './kernels.js';

// ---------------------------------------------------------------- 1-D slopes and pp

function locate(x, q) {
  // index i with x[i] <= q < x[i+1], clamped to [0, n-2]
  const n = x.length;
  if (q <= x[0]) return 0;
  if (q >= x[n - 1]) return n - 2;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= q) lo = mid; else hi = mid; }
  return lo;
}

function splineSlopes(x, y, ends) {
  const n = x.length;
  const s = new Float64Array(n);
  if (n === 2) { const d = (y[1] - y[0]) / (x[1] - x[0]); if (ends) { s[0] = ends[0]; s[1] = ends[1]; } else { s[0] = d; s[1] = d; } return s; }
  const h = new Float64Array(n - 1), del = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; del[i] = (y[i + 1] - y[i]) / h[i]; }
  if (n === 3 && !ends) {
    // the unique parabola
    const c2 = (del[1] - del[0]) / (x[2] - x[0]);
    for (let i = 0; i < 3; i++) s[i] = del[0] + c2 * (2 * x[i] - x[0] - x[1]);
    return s;
  }
  // tridiagonal system: a (sub), b (diag), c (super), r
  const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), r = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) { a[i] = h[i]; b[i] = 2 * (h[i - 1] + h[i]); c[i] = h[i - 1]; r[i] = 3 * (h[i] * del[i - 1] + h[i - 1] * del[i]); }
  if (ends) { b[0] = 1; c[0] = 0; r[0] = ends[0]; a[n - 1] = 0; b[n - 1] = 1; r[n - 1] = ends[1]; }
  else {
    const x31 = x[2] - x[0], xn = x[n - 1] - x[n - 3];
    b[0] = h[1]; c[0] = x31; r[0] = ((h[0] + 2 * x31) * h[1] * del[0] + h[0] * h[0] * del[1]) / x31;
    a[n - 1] = xn; b[n - 1] = h[n - 3]; r[n - 1] = (h[n - 2] * h[n - 2] * del[n - 3] + (2 * xn + h[n - 2]) * h[n - 3] * del[n - 2]) / xn;
  }
  // Thomas algorithm with partial safety (system is diagonally dominant in the interior)
  const cp = new Float64Array(n), rp = new Float64Array(n);
  cp[0] = c[0] / b[0]; rp[0] = r[0] / b[0];
  for (let i = 1; i < n; i++) { const m = b[i] - a[i] * cp[i - 1]; cp[i] = c[i] / m; rp[i] = (r[i] - a[i] * rp[i - 1]) / m; }
  s[n - 1] = rp[n - 1];
  for (let i = n - 2; i >= 0; i--) s[i] = rp[i] - cp[i] * s[i + 1];
  return s;
}
const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
function pchipEnd(h0, h1, d0, d1) {
  let d = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  if (sgn(d) !== sgn(d0)) d = 0;
  else if (sgn(d0) !== sgn(d1) && Math.abs(d) > Math.abs(3 * d0)) d = 3 * d0;
  return d;
}
function pchipSlopes(x, y) {
  const n = x.length; const s = new Float64Array(n);
  const h = new Float64Array(n - 1), del = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; del[i] = (y[i + 1] - y[i]) / h[i]; }
  if (n === 2) { s[0] = s[1] = del[0]; return s; }
  for (let k = 0; k < n - 2; k++) {
    if (sgn(del[k]) * sgn(del[k + 1]) > 0) {
      const hs = h[k] + h[k + 1];
      const w1 = (h[k] + hs) / (3 * hs), w2 = (hs + h[k + 1]) / (3 * hs);
      const dmax = Math.max(Math.abs(del[k]), Math.abs(del[k + 1])), dmin = Math.min(Math.abs(del[k]), Math.abs(del[k + 1]));
      s[k + 1] = dmin / (w1 * (del[k] / dmax) + w2 * (del[k + 1] / dmax));
    }
  }
  s[0] = pchipEnd(h[0], h[1], del[0], del[1]);
  s[n - 1] = pchipEnd(h[n - 2], h[n - 3], del[n - 2], del[n - 3]);
  return s;
}
function makimaSlopes(x, y) {
  const n = x.length; const s = new Float64Array(n);
  const del = new Float64Array(n + 3); // del[j+2] = delta_j, j = -2..n
  for (let i = 0; i < n - 1; i++) del[i + 2] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  if (n === 2) { s[0] = s[1] = del[2]; return s; }
  del[1] = 2 * del[2] - del[3]; del[0] = 2 * del[1] - del[2];
  del[n + 1] = 2 * del[n] - del[n - 1]; del[n + 2] = 2 * del[n + 1] - del[n];
  for (let i = 0; i < n; i++) {
    // node i uses delta_{i-2}, delta_{i-1}, delta_i, delta_{i+1}
    const dm2 = del[i], dm1 = del[i + 1], d0 = del[i + 2], dp1 = del[i + 3];
    const w1 = Math.abs(dp1 - d0) + Math.abs(dp1 + d0) / 2;
    const w2 = Math.abs(dm1 - dm2) + Math.abs(dm1 + dm2) / 2;
    s[i] = w1 + w2 === 0 ? 0 : (w1 * dm1 + w2 * d0) / (w1 + w2);
  }
  return s;
}
/** Cubic Hermite pp from values and slopes: coefs per piece [c3, c2, c1, c0]. */
function hermiteCoefs(x, y, s) {
  const l = x.length - 1; const co = new Float64Array(l * 4);
  for (let i = 0; i < l; i++) {
    const h = x[i + 1] - x[i], del = (y[i + 1] - y[i]) / h;
    co[i * 4] = (s[i] + s[i + 1] - 2 * del) / (h * h);
    co[i * 4 + 1] = (3 * del - 2 * s[i] - s[i + 1]) / h;
    co[i * 4 + 2] = s[i];
    co[i * 4 + 3] = y[i];
  }
  return co;
}
/** Builds a pp {breaks, d, k, coefs: Float64Array(l*d*k)} for comps (array of value arrays). */
function buildPP(x, comps, method, ends = null) {
  const l = x.length - 1, d = comps.length, k = 4;
  const coefs = new Float64Array(l * d * k);
  comps.forEach((y, c) => {
    const s = method === 'spline' ? splineSlopes(x, y, ends ? ends[c] : null) : method === 'pchip' ? pchipSlopes(x, y) : makimaSlopes(x, y);
    const co = hermiteCoefs(x, y, s);
    for (let i = 0; i < l; i++) for (let p = 0; p < k; p++) coefs[(i * d + c) * k + p] = co[i * 4 + p];
  });
  return { breaks: Float64Array.from(x), d, k, coefs };
}
function ppEvalComp(pp, c, q) {
  const { breaks, d, k, coefs } = pp;
  if (Number.isNaN(q)) return NaN;
  const i = locate(breaks, q);
  const t = q - breaks[i];
  let v = 0; const o = (i * d + c) * k;
  for (let p = 0; p < k; p++) v = v * t + coefs[o + p];
  return v;
}

// ---------------------------------------------------------------- 1-D local weights

/** Weights of grid nodes for a local method; null when out of range and no extrapolation. */
function weights1(g, q, method, extrap) {
  const n = g.length;
  if (Number.isNaN(q)) return null;
  const inside = q >= g[0] && q <= g[n - 1];
  if (!inside && !extrap) return null;
  if (n === 1) return { idx: [0], w: [1] };
  switch (method) {
    case 'nearest': {
      if (q <= g[0]) return { idx: [0], w: [1] };
      if (q >= g[n - 1]) return { idx: [n - 1], w: [1] };
      const i = locate(g, q);
      return { idx: [q - g[i] < g[i + 1] - q ? i : i + 1], w: [1] };
    }
    case 'next': {
      if (q > g[n - 1]) return extrap ? { idx: [n - 1], w: [1] } : null;
      if (q <= g[0]) return { idx: [0], w: [1] };
      const i = locate(g, q);
      return { idx: [q === g[i] ? i : i + 1], w: [1] };
    }
    case 'previous': {
      if (q < g[0]) return extrap ? { idx: [0], w: [1] } : null;
      if (q >= g[n - 1]) return { idx: [n - 1], w: [1] };
      const i = locate(g, q);
      return { idx: [q === g[i + 1] ? i + 1 : i], w: [1] };
    }
    case 'cubic': {
      if (n < 3) return weights1(g, q, 'linear', extrap);
      const h = (g[n - 1] - g[0]) / (n - 1);
      const sp = (q - g[0]) / h;
      let k = Math.floor(sp); if (k >= n - 1) k = n - 2; if (k < 0) k = 0;
      const t = sp - k;
      const ker = (u) => { u = Math.abs(u); if (u <= 1) return 1.5 * u ** 3 - 2.5 * u ** 2 + 1; if (u < 2) return -0.5 * u ** 3 + 2.5 * u ** 2 - 4 * u + 2; return 0; };
      const W = new Map();
      const add = (i, w) => W.set(i, (W.get(i) || 0) + w);
      for (let j = -1; j <= 2; j++) {
        const w = ker(t - j); if (w === 0) continue;
        const i = k + j;
        if (i < 0) { add(0, 3 * w); add(1, -3 * w); add(2, w); }
        else if (i > n - 1) { add(n - 1, 3 * w); add(n - 2, -3 * w); add(n - 3, w); }
        else add(i, w);
      }
      return { idx: [...W.keys()], w: [...W.values()] };
    }
    default: { // linear
      const i = locate(g, q);
      const t = (q - g[i]) / (g[i + 1] - g[i]);
      return { idx: [i, i + 1], w: [1 - t, t] };
    }
  }
}
const LOCAL = new Set(['linear', 'nearest', 'next', 'previous', 'cubic']);
const isUniform = (g) => { const n = g.length; if (n < 3) return true; const h = (g[n - 1] - g[0]) / (n - 1); for (let i = 1; i < n; i++) if (Math.abs(g[i] - g[i - 1] - h) > 1e-9 * Math.abs(h) * n) return false; return true; };

// ---------------------------------------------------------------- 1-D interpolation core

/** Interpolates columns of Y (array of Float64Array) at xq. extrap: null (value) | 'extrap'. */
function interp1Core(x, cols, xq, method, extrap, fillVal) {
  const nq = xq.length;
  const res = cols.map(() => new Float64Array(nq));
  if (method === 'spline' || method === 'pchip' || method === 'makima') {
    const pp = buildPP(x, cols, method);
    for (let c = 0; c < cols.length; c++) for (let i = 0; i < nq; i++) {
      const q = xq[i];
      if (Number.isNaN(q)) { res[c][i] = NaN; continue; }
      const outside = q < x[0] || q > x[x.length - 1];
      res[c][i] = outside && extrap !== 'extrap' ? fillVal : ppEvalComp(pp, c, q);
    }
    return res;
  }
  const m = method === 'cubic' && !isUniform(x) ? 'pchipFallback' : method;
  if (m === 'pchipFallback') return interp1Core(x, cols, xq, 'pchip', extrap, fillVal);
  for (let i = 0; i < nq; i++) {
    const wt = weights1(x, xq[i], m, extrap === 'extrap');
    for (let c = 0; c < cols.length; c++) {
      if (!wt) { res[c][i] = Number.isNaN(xq[i]) ? NaN : fillVal; continue; }
      let v = 0; for (let k = 0; k < wt.idx.length; k++) v += wt.w[k] * cols[c][wt.idx[k]];
      res[c][i] = v;
    }
  }
  return res;
}

const METHODS1 = ['linear', 'nearest', 'next', 'previous', 'pchip', 'cubic', 'v5cubic', 'spline', 'makima'];
function normMethod(m, fn) {
  if (m === '*linear' || m === '*nearest' || m === '*cubic' || m === '*spline') m = m.slice(1);
  if (m === 'v5cubic') m = 'cubic';
  if (!METHODS1.includes(m)) fail(`${fn}:invalidMethod`, `Invalid interpolation method '${m}'.`);
  return m;
}

/** Sorted, unique grid vector; returns {x, perm}. */
function gridVector(v, fn, what = 'X') {
  const t = dbl(v, fn, what);
  const x = Array.from(t.re);
  const perm = x.map((_, i) => i);
  let sorted = true; for (let i = 1; i < x.length; i++) if (!(x[i] > x[i - 1])) { sorted = false; break; }
  if (!sorted) perm.sort((a, b) => x[a] - x[b]);
  const xs = Float64Array.from(perm, (i) => x[i]);
  for (let i = 0; i < xs.length; i++) if (Number.isNaN(xs[i])) fail(`${fn}:NaNinX`, 'NaN is not an appropriate value for X.');
  for (let i = 1; i < xs.length; i++) if (xs[i] === xs[i - 1]) fail(`${fn}:NonUniqueX`, 'The grid vectors must contain unique points.');
  return { x: xs, perm };
}

// ---------------------------------------------------------------- pp values

function ppStruct(pp) {
  const l = pp.breaks.length - 1;
  const coefs = new Float64Array(l * pp.d * pp.k);
  // rows: piece-major with components fastest, column-major storage
  const rows = l * pp.d;
  for (let r = 0; r < rows; r++) for (let p = 0; p < pp.k; p++) coefs[r + p * rows] = pp.coefs[r * pp.k + p];
  return structOf({ form: str('pp'), breaks: out([1, l + 1], pp.breaks), coefs: outMat(rows, pp.k, coefs), pieces: num(l), order: num(pp.k), dim: num(pp.d) });
}
function ppFromStruct(s, fn) {
  if (!isStruct(s)) fail(`${fn}:badPP`, 'Input must be a piecewise polynomial structure.');
  const f = field(s, 'form');
  if (!f || toStr(f) !== 'pp') fail(`${fn}:badPP`, "Input must be a piecewise polynomial structure (form 'pp').");
  const breaks = dbl(field(s, 'breaks'), fn).re;
  const C = dbl(field(s, 'coefs'), fn);
  const k = scal(field(s, 'order'), fn), dv = field(s, 'dim');
  const d = dv ? dbl(dv, fn).re.reduce((a, b) => a * b, 1) : 1;
  const rows = C.dims[0];
  const coefs = new Float64Array(rows * k);
  for (let r = 0; r < rows; r++) for (let p = 0; p < k; p++) coefs[r * k + p] = C.re[r + p * rows];
  return { breaks: Float64Array.from(breaks), d, k, coefs, dimV: dv ? dbl(dv, fn).re : [1] };
}
function ppValues(pp, xq, xqDims) {
  const nq = xq.length;
  if (pp.d === 1) {
    const re = new Float64Array(nq);
    for (let i = 0; i < nq; i++) re[i] = ppEvalComp(pp, 0, xq[i]);
    return out(xqDims, re);
  }
  const re = new Float64Array(pp.d * nq);
  for (let i = 0; i < nq; i++) for (let c = 0; c < pp.d; c++) re[c + i * pp.d] = ppEvalComp(pp, c, xq[i]);
  const isVec = xqDims.length === 2 && (xqDims[0] === 1 || xqDims[1] === 1);
  const dv = pp.dimV && pp.dimV.length > 1 ? Array.from(pp.dimV) : [pp.d];
  return out(isVec ? [...dv, nq] : [...dv, ...xqDims], re);
}

/** spline/pchip/makima(x, y[, xq]). */
function ppBuiltin(method, args) {
  const fn = method;
  if (args.length < 2) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  const { x, perm } = gridVector(args[0], fn);
  const yt = dbl(args[1], fn, 'Y');
  const n = x.length;
  if (n < 2) fail(`${fn}:NotEnoughPts`, 'There should be at least two data points.');
  let comps, d, ends = null, dimV;
  const isVec = yt.dims.length === 2 && (yt.dims[0] === 1 || yt.dims[1] === 1);
  const last = isVec ? yt.re.length : yt.dims[yt.dims.length - 1];
  if (isVec) { d = 1; dimV = [1]; }
  else { d = yt.re.length / last; dimV = yt.dims.slice(0, -1); }
  const getComp = (c, j) => yt.re[c + j * d];
  if (last === n) comps = Array.from({ length: d }, (_, c) => Float64Array.from(perm, (j) => getComp(c, j)));
  else if (last === n + 2 && method === 'spline') {
    comps = Array.from({ length: d }, (_, c) => Float64Array.from(perm, (j) => getComp(c, j + 1)));
    ends = Array.from({ length: d }, (_, c) => [getComp(c, 0), getComp(c, n + 1)]);
  } else fail(`${fn}:NumSitesMismatchValues`, `The number of sites, ${n}, is incompatible with the number of values, ${last}.`);
  const pp = buildPP(x, comps, method, ends);
  pp.dimV = dimV;
  if (args.length < 3) return ppStruct(pp);
  const q = dbl(args[2], fn, 'xq');
  return ppValues(pp, q.re, q.dims);
}

// ---------------------------------------------------------------- N-D gridded interpolation

/**
 * Gridded interpolation. grids: array of sorted Float64Array; V: {dims, re, im};
 * Q: array (per dim) of Float64Array query coordinates (same length nq).
 * method: string; extrap: 'none' (use fillVal) | method name for extrapolation.
 */
function gridInterp(grids, V, Q, method, extrap, fillVal) {
  const d = grids.length, nq = Q[0].length;
  const dims = grids.map((g) => g.length);
  const strides = []; { let s = 1; for (let k = 0; k < d; k++) { strides.push(s); s *= dims[k]; } }
  const re = new Float64Array(nq), im = V.im ? new Float64Array(nq) : null;
  const outside = (k, q) => q < grids[k][0] || q > grids[k][dims[k] - 1];
  if (LOCAL.has(method)) {
    const m = method === 'cubic' && !grids.every(isUniform) ? 'spline' : method;
    if (m !== 'spline') {
      for (let p = 0; p < nq; p++) {
        let any = false, nan = false;
        const W = [];
        for (let k = 0; k < d; k++) {
          const q = Q[k][p];
          if (Number.isNaN(q)) { nan = true; break; }
          const out_ = outside(k, q);
          if (out_) any = true;
          const em = out_ ? (extrap === 'none' ? null : extrap) : m;
          if (out_ && !em) break;
          const w = weights1(grids[k], q, out_ ? (em === 'cubic' && m !== 'cubic' ? 'linear' : em) : m, true);
          W.push(w);
        }
        if (nan) { re[p] = NaN; if (im) im[p] = NaN; continue; }
        if (W.length < d) { re[p] = fillVal; if (im) im[p] = 0; continue; }
        void any;
        // tensor product
        let sr = 0, si = 0;
        const cnt = W.map((w) => w.idx.length);
        const ctr = new Array(d).fill(0);
        for (;;) {
          let w = 1, off = 0;
          for (let k = 0; k < d; k++) { w *= W[k].w[ctr[k]]; off += W[k].idx[ctr[k]] * strides[k]; }
          if (w !== 0) { sr += w * V.re[off]; if (im) si += w * V.im[off]; }
          let k = 0; while (k < d) { if (++ctr[k] < cnt[k]) break; ctr[k] = 0; k++; }
          if (k === d) break;
        }
        re[p] = sr; if (im) im[p] = si;
      }
      return { re, im };
    }
    method = 'spline';
  }
  // value-based methods (spline, pchip, makima): pp along dim 0 precomputed, the rest per point
  const n0 = dims[0], rest = V.re.length / n0;
  const parts = [V.re, V.im].filter(Boolean);
  const pps = parts.map((data) => {
    const cols = [];
    for (let r = 0; r < rest; r++) cols.push(data.subarray(r * n0, (r + 1) * n0));
    return n0 >= 2 ? buildPP(grids[0], cols, method) : null;
  });
  for (let p = 0; p < nq; p++) {
    let bad = false, nan = false;
    for (let k = 0; k < d; k++) { const q = Q[k][p]; if (Number.isNaN(q)) nan = true; else if (outside(k, q) && extrap === 'none') bad = true; }
    if (nan || bad) { re[p] = nan ? NaN : fillVal; if (im) im[p] = nan ? NaN : 0; continue; }
    parts.forEach((data, pi) => {
      // reduce dim 0
      let cur = new Float64Array(rest);
      for (let r = 0; r < rest; r++) cur[r] = pps[pi] ? ppEvalComp(pps[pi], r, Q[0][p]) : data[r];
      let curDims = dims.slice(1);
      for (let k = 1; k < d; k++) {
        const nk = curDims[0], rr = cur.length / nk;
        const nxt = new Float64Array(rr);
        for (let r = 0; r < rr; r++) {
          const line = cur.subarray(r * nk, (r + 1) * nk);
          if (nk < 2) { nxt[r] = line[0]; continue; }
          const pp = buildPP(grids[k], [line], method);
          nxt[r] = ppEvalComp(pp, 0, Q[k][p]);
        }
        cur = nxt; curDims = curDims.slice(1);
      }
      if (pi === 0) re[p] = cur[0]; else im[p] = cur[0];
    });
  }
  return { re, im };
}

/** Full ndgrid of query vectors. */
function ndgridQuery(vecs) {
  const odims = vecs.map((v) => v.length);
  const n = prod(odims);
  const Q = vecs.map(() => new Float64Array(n));
  const sub = new Array(odims.length).fill(0);
  for (let p = 0; p < n; p++) {
    vecs.forEach((v, i) => { Q[i][p] = v[sub[i]]; });
    for (let k = 0; k < odims.length; k++) { if (++sub[k] < odims[k]) break; sub[k] = 0; }
  }
  return { Q, dims: odims.length === 1 ? [odims[0], 1] : odims };
}
/** Grid vector along dimension k from a vector or an ndgrid/meshgrid array. */
function gridVecOf(v, k, fn) {
  const t = dbl(v, fn, 'grid');
  const isVec = t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
  if (isVec) return Float64Array.from(t.re);
  const n = t.dims[k] || 1; let stride = 1; for (let i = 0; i < k; i++) stride *= t.dims[i];
  return Float64Array.from({ length: n }, (_, i) => t.re[i * stride]);
}
function checkGrid(g, fn) {
  for (let i = 1; i < g.length; i++) if (!(g[i] > g[i - 1])) fail(`${fn}:gridVectorsNotMonotonic`, 'Grid vectors must be strictly increasing (sample points must be unique and sorted).');
  if (g.length < 2) fail(`${fn}:NotEnoughPts`, 'Each grid dimension must have at least 2 points.');
}
/** Query arrays: broadcast; vectors of different orientation form a grid. Returns {Q, dims}. */
function queryArrays(vals, fn, gridOrder = null) {
  const ts = vals.map((v) => dbl(v, fn, 'query'));
  const vecDir = (t) => { const nz = t.dims.map((d, i) => (d !== 1 ? i : -1)).filter((i) => i >= 0); return t.re.length === 1 ? -2 : nz.length === 1 ? nz[0] : -1; };
  const dirs = ts.map(vecDir);
  const allVec = dirs.every((x) => x >= 0) && new Set(dirs).size === dirs.length && ts.length > 1;
  if (allVec) {
    // grid: output dims ordered by gridOrder (default: as given)
    const order = gridOrder || ts.map((_, i) => i);
    const odims = order.map((i) => ts[i].re.length);
    const n = prod(odims);
    const Q = ts.map(() => new Float64Array(n));
    const sub = new Array(odims.length).fill(0);
    for (let p = 0; p < n; p++) {
      order.forEach((i, pos) => { Q[i][p] = ts[i].re[sub[pos]]; });
      for (let k = 0; k < odims.length; k++) { if (++sub[k] < odims[k]) break; sub[k] = 0; }
    }
    return { Q, dims: odims.length === 1 ? [odims[0], 1] : odims };
  }
  let dims = ts[0].dims;
  try { for (const t of ts) dims = broadcastDims(dims, t.dims); } catch { fail(`${fn}:sizeMismatch`, 'Query arrays must be the same size.'); }
  const n = prod(dims);
  const Q = ts.map((t) => (t.re.length === n ? Float64Array.from(t.re) : t.re.length === 1 ? new Float64Array(n).fill(t.re[0]) : expandTo(t, dims)));
  return { Q, dims };
}
function expandTo(t, dims) {
  const n = prod(dims); const r = new Float64Array(n);
  const d = t.dims.slice(); while (d.length < dims.length) d.push(1);
  const st = []; let s = 1; for (let k = 0; k < d.length; k++) { st.push(d[k] === 1 ? 0 : s); s *= d[k]; }
  const sub = new Array(dims.length).fill(0);
  for (let p = 0; p < n; p++) { let off = 0; for (let k = 0; k < dims.length; k++) off += sub[k] * st[k]; r[p] = t.re[off]; for (let k = 0; k < dims.length; k++) { if (++sub[k] < dims[k]) break; sub[k] = 0; } }
  return r;
}

function trailingOpts(args, fn, defMethod = 'linear') {
  let method = defMethod, fillVal = NaN, extrapMode = 'none';
  const a = args.slice();
  while (a.length) {
    const lastV = a[a.length - 1];
    const o = optText(lastV);
    if (o != null) {
      if (o === 'extrap') extrapMode = 'method';
      else method = normMethod(o, fn);
      a.pop(); continue;
    }
    break;
  }
  return { a, method, fillVal, extrapMode };
}

function nArgsSplit(args, fn) {
  // numeric args then optional method and extrapval (numeric after the method)
  const a = []; let method = null, extrapval = null, extrap = false;
  for (let i = 0; i < args.length; i++) {
    const o = optText(args[i]);
    if (o != null) {
      if (o === 'extrap') extrap = true; else method = normMethod(o, fn);
      if (i + 1 < args.length && optText(args[i + 1]) == null) { extrapval = scal(args[i + 1], fn, 'extrapval'); i++; }
      continue;
    }
    a.push(args[i]);
  }
  return { a, method, extrapval, extrap };
}

function refineGrid(n, k) {
  const step = Math.pow(2, -k); const pts = [];
  for (let i = 0; i <= (n - 1) / step + 1e-9; i++) pts.push(1 + i * step);
  return Float64Array.from(pts);
}

// ---------------------------------------------------------------- Delaunay (Bowyer-Watson)

function delaunay2(px, py) {
  const n = px.length;
  if (n < 3) return [];
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let i = 0; i < n; i++) { minx = Math.min(minx, px[i]); maxx = Math.max(maxx, px[i]); miny = Math.min(miny, py[i]); maxy = Math.max(maxy, py[i]); }
  const sc = Math.max(maxx - minx, maxy - miny) || 1;
  const X = new Float64Array(n + 3), Y = new Float64Array(n + 3);
  for (let i = 0; i < n; i++) { X[i] = (px[i] - minx) / sc; Y[i] = (py[i] - miny) / sc; }
  const M = 1e4;
  X[n] = -M; Y[n] = -M; X[n + 1] = M; Y[n + 1] = -M; X[n + 2] = 0; Y[n + 2] = M;
  const orient = (a, b, c) => (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]);
  let tris = [[n, n + 1, n + 2]];
  const circ = (t) => {
    const [a, b, c] = t;
    const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    return { ux, uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let cc = [circ(tris[0])];
  // insertion order: sorted by x for locality
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => X[a] - X[b] || Y[a] - Y[b]);
  const seen = new Set();
  for (const p of order) {
    const key = X[p] + ',' + Y[p];
    if (seen.has(key)) continue; seen.add(key);
    const bad = [];
    for (let t = 0; t < tris.length; t++) {
      const c = cc[t]; const dx = X[p] - c.ux, dy = Y[p] - c.uy;
      if (dx * dx + dy * dy < c.r2 * (1 - 1e-12)) bad.push(t);
    }
    const edges = new Map();
    for (const t of bad) {
      const [a, b, c] = tris[t];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = u < v ? u + '_' + v : v + '_' + u;
        if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]);
      }
    }
    const badSet = new Set(bad);
    const nt = [], ncc = [];
    for (let t = 0; t < tris.length; t++) if (!badSet.has(t)) { nt.push(tris[t]); ncc.push(cc[t]); }
    for (const [u, v] of edges.values()) {
      if (Math.abs(orient(u, v, p)) < 1e-14) continue;
      const tri = orient(u, v, p) > 0 ? [u, v, p] : [v, u, p];
      nt.push(tri); ncc.push(circ(tri));
    }
    tris = nt; cc = ncc;
  }
  const res = tris.filter((t) => t[0] < n && t[1] < n && t[2] < n);
  return res;
}

function convHull2(px, py) {
  const n = px.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => px[a] - px[b] || py[a] - py[b]);
  const cross = (o, a, b) => (px[a] - px[o]) * (py[b] - py[o]) - (py[a] - py[o]) * (px[b] - px[o]);
  const lower = [], upper = [];
  for (const p of idx) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let k = idx.length - 1; k >= 0; k--) { const p = idx[k]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  return hull;
}

/** Triangle locator with a bucket grid. */
function makeLocator(px, py, tris) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let i = 0; i < px.length; i++) { minx = Math.min(minx, px[i]); maxx = Math.max(maxx, px[i]); miny = Math.min(miny, py[i]); maxy = Math.max(maxy, py[i]); }
  const G = Math.max(1, Math.ceil(Math.sqrt(tris.length / 2)));
  const w = (maxx - minx) || 1, h = (maxy - miny) || 1;
  const cells = Array.from({ length: G * G }, () => []);
  const cx = (x) => Math.min(G - 1, Math.max(0, Math.floor(((x - minx) / w) * G)));
  const cy = (y) => Math.min(G - 1, Math.max(0, Math.floor(((y - miny) / h) * G)));
  tris.forEach((t, k) => {
    const xs = t.map((i) => px[i]), ys = t.map((i) => py[i]);
    for (let a = cx(Math.min(...xs)); a <= cx(Math.max(...xs)); a++) for (let b = cy(Math.min(...ys)); b <= cy(Math.max(...ys)); b++) cells[a + b * G].push(k);
  });
  const bary = (k, x, y) => {
    const [a, b, c] = tris[k];
    const x1 = px[a], y1 = py[a], x2 = px[b], y2 = py[b], x3 = px[c], y3 = py[c];
    const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    const l1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
    const l2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
    return [l1, l2, 1 - l1 - l2];
  };
  return {
    bary,
    locate(x, y) {
      if (Number.isNaN(x) || Number.isNaN(y) || x < minx - 1e-12 * w || x > maxx + 1e-12 * w || y < miny - 1e-12 * h || y > maxy + 1e-12 * h) return null;
      const tol = -1e-12;
      for (const k of cells[cx(x) + cy(y) * G]) {
        const l = bary(k, x, y);
        if (l[0] >= tol && l[1] >= tol && l[2] >= tol) return { k, l };
      }
      return null;
    },
  };
}
function nearestIdx(px, py, x, y) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < px.length; i++) { const d = (px[i] - x) ** 2 + (py[i] - y) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

/** Scattered 2-D interpolation state. */
function makeScattered(px, py, v, method, extrapMethod) {
  const tris = delaunay2(px, py);
  const loc = tris.length ? makeLocator(px, py, tris) : null;
  const hull = convHull2(px, py);
  return { px, py, v, method, extrapMethod, tris, loc, hull };
}
function evalScattered(S, x, y, comp) {
  const vals = comp === 'im' ? S.v.im : S.v.re;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (S.method === 'nearest') {
    if (S.extrapMethod === 'none' && !(S.loc && S.loc.locate(x, y))) return NaN;
    return vals[nearestIdx(S.px, S.py, x, y)];
  }
  if (S.method === 'v4') return null;
  const hit = S.loc ? S.loc.locate(x, y) : null;
  if (hit) { const t = S.tris[hit.k]; return hit.l[0] * vals[t[0]] + hit.l[1] * vals[t[1]] + hit.l[2] * vals[t[2]]; }
  if (S.extrapMethod === 'none' || !S.tris.length) return S.extrapMethod === 'nearest' ? vals[nearestIdx(S.px, S.py, x, y)] : NaN;
  if (S.extrapMethod === 'nearest') return vals[nearestIdx(S.px, S.py, x, y)];
  // linear extrapolation: plane of the triangle nearest to the point
  let bestK = 0, bd = Infinity;
  S.tris.forEach((t, k) => { const mx = (S.px[t[0]] + S.px[t[1]] + S.px[t[2]]) / 3, my = (S.py[t[0]] + S.py[t[1]] + S.py[t[2]]) / 3; const d = (mx - x) ** 2 + (my - y) ** 2; if (d < bd) { bd = d; bestK = k; } });
  const l = S.loc.bary(bestK, x, y); const t = S.tris[bestK];
  return l[0] * vals[t[0]] + l[1] * vals[t[1]] + l[2] * vals[t[2]];
}
/** Biharmonic spline interpolation (Sandwell). */
function v4Interp(px, py, vals, qx, qy) {
  const n = px.length;
  const g = (r2) => (r2 === 0 ? 0 : r2 * (Math.log(Math.sqrt(r2)) - 1));
  const A = cm(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A.re[i + j * n] = g((px[i] - px[j]) ** 2 + (py[i] - py[j]) ** 2);
  const F = luFactor(A);
  const w = luSolve(F, cm(n, 1, Float64Array.from(vals))).re;
  const res = new Float64Array(qx.length);
  for (let k = 0; k < qx.length; k++) { let s = 0; for (let i = 0; i < n; i++) s += w[i] * g((qx[k] - px[i]) ** 2 + (qy[k] - py[i]) ** 2); res[k] = s; }
  return res;
}

function pointsArg(args, fn) {
  // (x, y, ...) or (P, ...) with P m-by-2
  const a0 = dbl(args[0], fn, 'x');
  if (a0.dims.length === 2 && a0.dims[1] === 2 && !(a0.dims[0] === 1) && (args.length < 2 || optText(args[1]) != null || dbl(args[1], fn).re.length !== a0.re.length)) {
    const m = a0.dims[0];
    return { px: a0.re.slice(0, m), py: a0.re.slice(m, 2 * m), used: 1 };
  }
  const a1 = dbl(args[1], fn, 'y');
  if (a1.re.length !== a0.re.length) fail(`${fn}:sizeMismatch`, 'x and y must be the same size.');
  return { px: Float64Array.from(a0.re), py: Float64Array.from(a1.re), used: 2 };
}
const trisValue = (tris) => { const m = tris.length; const re = new Float64Array(m * 3); tris.forEach((t, i) => { for (let j = 0; j < 3; j++) re[i + j * m] = t[j] + 1; }); return outMat(m, 3, re); };

// ---------------------------------------------------------------- classes

function giEval(obj, qargs, ctx) {
  const P = obj.props;
  const grids = P.GridVectors.data.map((g) => Float64Array.from(g.re));
  const V = P.Values; const vt = dbl(V, 'griddedInterpolant');
  const method = toStr(P.Method), em = toStr(P.ExtrapolationMethod);
  const d = grids.length;
  let Q, dims;
  if (qargs.length === 1 && isCell(qargs[0])) {
    const r = ndgridQuery(qargs[0].data.map((g) => dbl(g, 'griddedInterpolant').re)); Q = r.Q; dims = r.dims;
  } else if (qargs.length === 1 && d > 1) {
    const t = dbl(qargs[0], 'griddedInterpolant');
    if (t.dims[1] !== d) fail('griddedInterpolant:badQuery', `Query points must be an m-by-${d} matrix.`);
    const m = t.dims[0]; Q = Array.from({ length: d }, (_, k) => t.re.slice(k * m, (k + 1) * m)); dims = [m, 1];
  } else {
    if (qargs.length !== d) fail('griddedInterpolant:badQuery', `Expected ${d} query coordinate arrays.`);
    const r = queryArrays(qargs, 'griddedInterpolant'); Q = r.Q; dims = r.dims;
  }
  const r = gridInterp(grids, { re: vt.re, im: vt.im }, Q, method, em === 'none' ? 'none' : em, NaN);
  void ctx;
  return out(dims, r.re, r.im);
}

function makeGI(args) {
  const nums = [], strs = [];
  for (const a of args) { if (optText(a) != null) strs.push(optText(a)); else nums.push(a); }
  let grids, V;
  if (nums.length === 0) fail('griddedInterpolant:notEnoughInputs', 'Not enough input arguments.');
  if (nums.length === 1) {
    V = dbl(nums[0], 'griddedInterpolant');
    const isVec = V.dims.length === 2 && (V.dims[0] === 1 || V.dims[1] === 1);
    const dd = isVec ? [V.re.length] : V.dims;
    grids = dd.map((n) => Float64Array.from({ length: n }, (_, i) => i + 1));
  } else if (isCell(nums[0])) {
    grids = nums[0].data.map((g) => Float64Array.from(dbl(g, 'griddedInterpolant').re)); V = dbl(nums[1], 'griddedInterpolant');
  } else {
    V = dbl(nums[nums.length - 1], 'griddedInterpolant');
    grids = nums.slice(0, -1).map((g, k) => gridVecOf(g, k, 'griddedInterpolant'));
  }
  grids.forEach((g) => checkGrid(g, 'griddedInterpolant'));
  const method = strs[0] ? normMethod(strs[0], 'griddedInterpolant') : 'linear';
  const em = strs[1] ? (strs[1] === 'none' ? 'none' : normMethod(strs[1], 'griddedInterpolant')) : method;
  const vdims = grids.length === 1 ? [grids[0].length, 1] : grids.map((g) => g.length);
  if (prod(vdims) !== V.re.length) fail('griddedInterpolant:sizeMismatch', 'The grid vectors do not define a grid that matches the size of the values.');
  return object('griddedInterpolant', {
    GridVectors: cell([1, grids.length], grids.map((g) => out([1, g.length], g))),
    Values: out(vdims, V.re, V.im), Method: str(method), ExtrapolationMethod: str(em),
  });
}

function siEval(obj, qargs) {
  const P = obj.props;
  const pts = dbl(P.Points, 'scatteredInterpolant'); const m = pts.dims[0];
  const S = obj._state || (obj._state = makeScattered(pts.re.slice(0, m), pts.re.slice(m, 2 * m), dbl(P.Values, 'scatteredInterpolant'), toStr(P.Method), toStr(P.ExtrapolationMethod)));
  let qx, qy, dims;
  if (qargs.length === 1) { const t = dbl(qargs[0], 'scatteredInterpolant'); const k = t.dims[0]; qx = t.re.slice(0, k); qy = t.re.slice(k, 2 * k); dims = [k, 1]; }
  else { const r = queryArrays(qargs, 'scatteredInterpolant', [1, 0]); qx = r.Q[0]; qy = r.Q[1]; dims = r.dims; }
  const re = new Float64Array(qx.length), im = S.v.im ? new Float64Array(qx.length) : null;
  for (let k = 0; k < qx.length; k++) { re[k] = evalScattered(S, qx[k], qy[k], 're'); if (im) im[k] = evalScattered(S, qx[k], qy[k], 'im'); }
  return out(dims, re, im);
}

function propRef(obj, subs, nargout, ctx, evalFn, methods) {
  let cur = [obj];
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i]; const v = cur[0];
    if (isObject(v) && v.cls === obj.cls) {
      if (s.type === '()') { cur = [evalFn(v, s.subs, ctx)]; continue; }
      if (s.type === '.') {
        const name = typeof s.subs === 'string' ? s.subs : toStr(s.subs);
        if (name in v.props) { cur = [v.props[name]]; continue; }
        if (methods && methods[name]) {
          const nx = subs[i + 1];
          const margs = nx && nx.type === '()' ? nx.subs : [];
          if (nx && nx.type === '()') i++;
          const r = methods[name]([v, ...margs], nargout, ctx);
          cur = Array.isArray(r) ? r : [r];
          continue;
        }
        fail(`${obj.cls}:noProperty`, `No property or method '${name}' for class '${obj.cls}'.`);
      }
      fail(`${obj.cls}:badIndex`, 'Use F(query points) or F.Property.');
    }
    // index into the result with ctx when available
    if (ctx && typeof ctx.call === 'function' && s.type === '()') { cur = ctx.call('subsref', [v, structOf({ type: str('()'), subs: cell([1, s.subs.length], s.subs) })], 1); continue; }
    fail(`${obj.cls}:badIndex`, 'Unsupported indexing.');
  }
  return cur;
}
function propAsgn(obj, subs, rhs, allowed) {
  if (subs.length !== 1 || subs[0].type !== '.') fail(`${obj.cls}:badAssign`, 'Only property assignment F.Property = value is supported.');
  const name = typeof subs[0].subs === 'string' ? subs[0].subs : toStr(subs[0].subs);
  if (!allowed.includes(name)) fail(`${obj.cls}:readOnly`, `Property '${name}' cannot be set.`);
  const props = { ...obj.props, [name]: rhs };
  return object(obj.cls, props);
}

const dtMethods = {
  pointLocation(args) {
    const dt = args[0]; const P = dbl(dt.props.Points, 'pointLocation'); const m = P.dims[0];
    const px = P.re.slice(0, m), py = P.re.slice(m, 2 * m);
    const T = dbl(dt.props.ConnectivityList, 'pointLocation'); const nt = T.dims[0];
    const tris = Array.from({ length: nt }, (_, k) => [T.re[k] - 1, T.re[k + nt] - 1, T.re[k + 2 * nt] - 1]);
    const loc = makeLocator(px, py, tris);
    let qx, qy;
    if (args.length >= 3) { qx = dbl(args[1], 'pointLocation').re; qy = dbl(args[2], 'pointLocation').re; }
    else { const q = dbl(args[1], 'pointLocation'); const k = q.dims[0]; qx = q.re.slice(0, k); qy = q.re.slice(k, 2 * k); }
    const ti = new Float64Array(qx.length), bc = new Float64Array(qx.length * 3);
    for (let i = 0; i < qx.length; i++) {
      const h = loc.locate(qx[i], qy[i]);
      if (h) { ti[i] = h.k + 1; for (let j = 0; j < 3; j++) bc[i + j * qx.length] = h.l[j]; } else { ti[i] = NaN; for (let j = 0; j < 3; j++) bc[i + j * qx.length] = NaN; }
    }
    return [out([qx.length, 1], ti), outMat(qx.length, 3, bc)];
  },
  nearestNeighbor(args) {
    const dt = args[0]; const P = dbl(dt.props.Points, 'nearestNeighbor'); const m = P.dims[0];
    const px = P.re.slice(0, m), py = P.re.slice(m, 2 * m);
    let qx, qy;
    if (args.length >= 3) { qx = dbl(args[1], 'nearestNeighbor').re; qy = dbl(args[2], 'nearestNeighbor').re; }
    else { const q = dbl(args[1], 'nearestNeighbor'); const k = q.dims[0]; qx = q.re.slice(0, k); qy = q.re.slice(k, 2 * k); }
    const id = new Float64Array(qx.length), dd = new Float64Array(qx.length);
    for (let i = 0; i < qx.length; i++) { const j = nearestIdx(px, py, qx[i], qy[i]); id[i] = j + 1; dd[i] = Math.hypot(px[j] - qx[i], py[j] - qy[i]); }
    return [out([qx.length, 1], id), out([qx.length, 1], dd)];
  },
  convexHull(args) {
    const dt = args[0]; const P = dbl(dt.props.Points, 'convexHull'); const m = P.dims[0];
    const h = convHull2(P.re.slice(0, m), P.re.slice(m, 2 * m));
    const k = h.concat([h[0]]);
    return out([k.length, 1], Float64Array.from(k, (i) => i + 1));
  },
  edges(args) {
    const dt = args[0]; const T = dbl(dt.props.ConnectivityList, 'edges'); const nt = T.dims[0];
    const set = new Map();
    for (let k = 0; k < nt; k++) { const t = [T.re[k], T.re[k + nt], T.re[k + 2 * nt]]; for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) { const u = Math.min(a, b), v = Math.max(a, b); set.set(u + '_' + v, [u, v]); } }
    const E = [...set.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const re = new Float64Array(E.length * 2); E.forEach((e, i) => { re[i] = e[0]; re[i + E.length] = e[1]; });
    return outMat(E.length, 2, re);
  },
};

export const classes = {
  griddedInterpolant: {
    handle: false,
    construct(args) { return makeGI(args); },
    methods: {},
    subsref(obj, subs, nargout, ctx) { return propRef(obj, subs, nargout, ctx, giEval, null); },
    subsasgn(obj, subs, rhs) { return propAsgn(obj, subs, rhs, ['Values', 'Method', 'ExtrapolationMethod', 'GridVectors']); },
    display(obj, name) { const P = obj.props; return `${name} = \n  griddedInterpolant with properties:\n\n    GridVectors: {1x${P.GridVectors.data.length} cell}\n         Values: [${P.Values.dims.join('x')} double]\n         Method: '${toStr(P.Method)}'\n    ExtrapolationMethod: '${toStr(P.ExtrapolationMethod)}'\n`; },
    props: ['GridVectors', 'Values', 'Method', 'ExtrapolationMethod'],
  },
  scatteredInterpolant: {
    handle: false,
    construct(args) {
      const nums = [], strs = [];
      for (const a of args) { if (optText(a) != null) strs.push(optText(a)); else nums.push(a); }
      if (nums.length < 2) fail('scatteredInterpolant:notEnoughInputs', 'Use scatteredInterpolant(x, y, v) or scatteredInterpolant(P, v).');
      let px, py, v;
      if (nums.length >= 3) { px = dbl(nums[0], 'scatteredInterpolant').re; py = dbl(nums[1], 'scatteredInterpolant').re; v = dbl(nums[2], 'scatteredInterpolant'); }
      else { const P = dbl(nums[0], 'scatteredInterpolant'); if (P.dims[1] !== 2) fail('scatteredInterpolant:only2D', 'Only 2-D scattered data is supported (P must be m-by-2).'); const m = P.dims[0]; px = P.re.slice(0, m); py = P.re.slice(m, 2 * m); v = dbl(nums[1], 'scatteredInterpolant'); }
      if (px.length !== py.length || px.length !== v.re.length) fail('scatteredInterpolant:sizeMismatch', 'The number of data points and values must match.');
      let method = strs[0] || 'linear';
      if (!['linear', 'nearest', 'natural'].includes(method)) fail('scatteredInterpolant:badMethod', "Method must be 'linear', 'nearest' or 'natural'.");
      const em = strs[1] || (method === 'nearest' ? 'nearest' : 'linear');
      if (!['linear', 'nearest', 'none'].includes(em)) fail('scatteredInterpolant:badExtrap', "ExtrapolationMethod must be 'linear', 'nearest' or 'none'.");
      const m = px.length; const pr = new Float64Array(2 * m); pr.set(px, 0); pr.set(py, m);
      return object('scatteredInterpolant', { Points: outMat(m, 2, pr), Values: out([m, 1], v.re, v.im), Method: str(method), ExtrapolationMethod: str(em) });
    },
    methods: {},
    subsref(obj, subs, nargout, ctx) { return propRef(obj, subs, nargout, ctx, (o, q) => siEval(o, q), null); },
    subsasgn(obj, subs, rhs) { return propAsgn(obj, subs, rhs, ['Values', 'Method', 'ExtrapolationMethod']); },
    display(obj, name) { const P = obj.props; return `${name} = \n  scatteredInterpolant with properties:\n\n                 Points: [${P.Points.dims.join('x')} double]\n                 Values: [${P.Values.dims.join('x')} double]\n                 Method: '${toStr(P.Method)}'\n    ExtrapolationMethod: '${toStr(P.ExtrapolationMethod)}'\n`; },
    props: ['Points', 'Values', 'Method', 'ExtrapolationMethod'],
  },
  delaunayTriangulation: {
    handle: false,
    construct(args) {
      if (!args.length) return object('delaunayTriangulation', { Points: outMat(0, 2, []), ConnectivityList: outMat(0, 3, []), Constraints: outMat(0, 2, []) });
      const { px, py } = pointsArg(args, 'delaunayTriangulation');
      const tris = delaunay2(px, py);
      const m = px.length; const pr = new Float64Array(2 * m); pr.set(px, 0); pr.set(py, m);
      return object('delaunayTriangulation', { Points: outMat(m, 2, pr), ConnectivityList: trisValue(tris), Constraints: outMat(0, 2, []) });
    },
    methods: dtMethods,
    subsref(obj, subs, nargout, ctx) { return propRef(obj, subs, nargout, ctx, () => fail('delaunayTriangulation:badIndex', 'Use DT.Points or DT.ConnectivityList.'), dtMethods); },
    display(obj, name) { const P = obj.props; return `${name} = \n  delaunayTriangulation with properties:\n\n              Points: [${P.Points.dims.join('x')} double]\n    ConnectivityList: [${P.ConnectivityList.dims.join('x')} double]\n         Constraints: []\n`; },
    size(obj) { return obj.props.ConnectivityList.dims.slice(); },
    props: ['Points', 'ConnectivityList', 'Constraints'],
  },
};

// ---------------------------------------------------------------- builtins

export const builtins = {
  interp1(args) {
    if (args.length < 2) fail('interp1:notEnoughInputs', 'Not enough input arguments.');
    // parse: numeric args (2 or 3), then method, then extrapolation ('extrap' or scalar), or 'pp'
    const nums = []; let i = 0;
    while (i < args.length && optText(args[i]) == null) nums.push(args[i++]);
    let method = 'linear', extrap = null, fillVal = NaN, wantPP = false;
    if (i < args.length) { const o = optText(args[i]); if (o === 'pp') wantPP = true; else method = normMethod(o, 'interp1'); i++; }
    if (i < args.length) {
      const o = optText(args[i]);
      if (o === 'pp') wantPP = true; else if (o === 'extrap') extrap = 'extrap'; else if (o != null) fail('interp1:badExtrap', "Extrapolation must be 'extrap' or a scalar value."); else { fillVal = scal(args[i], 'interp1', 'extrapval'); extrap = 'value'; }
    }
    if (extrap == null) extrap = ['pchip', 'spline', 'makima'].includes(method) ? 'extrap' : 'value';
    let xv, vv, xq;
    if (wantPP) { if (nums.length !== 2) fail('interp1:ppInputs', "Use pp = interp1(x, v, method, 'pp')."); [xv, vv] = nums; }
    else if (nums.length === 2) { vv = nums[0]; xq = nums[1]; }
    else if (nums.length === 3) { [xv, vv, xq] = nums; }
    else fail('interp1:badInputs', 'Use interp1(x, v, xq), interp1(v, xq) or interp1(x, v, xq, method, extrapolation).');
    const V = dbl(vv, 'interp1', 'v');
    const vIsVec = V.dims.length === 2 && (V.dims[0] === 1 || V.dims[1] === 1);
    const n = vIsVec ? V.re.length : V.dims[0];
    const ncols = vIsVec ? 1 : V.re.length / n;
    let x, perm;
    if (xv == null) { x = Float64Array.from({ length: n }, (_, k) => k + 1); perm = Array.from({ length: n }, (_, k) => k); }
    else { ({ x, perm } = gridVector(xv, 'interp1')); if (x.length !== n) fail('interp1:YInvalidNumRows', 'The length of X and the number of rows of V must match.'); }
    if (n < 2 && method !== 'nearest') fail('interp1:NotEnoughPts', 'Interpolation requires at least two sample points for each dimension.');
    const parts = [V.re, V.im].filter(Boolean);
    if (wantPP) {
      const m = method === 'linear' || method === 'nearest' || method === 'next' || method === 'previous' ? null : method === 'cubic' ? 'pchip' : method;
      if (!m) {
        // linear pp
        const l = n - 1; const d = ncols; const coefs = new Float64Array(l * d * 2);
        for (let c = 0; c < d; c++) for (let k = 0; k < l; k++) { const y0 = V.re[perm[k] + c * n], y1 = V.re[perm[k + 1] + c * n]; coefs[(k * d + c) * 2] = (y1 - y0) / (x[k + 1] - x[k]); coefs[(k * d + c) * 2 + 1] = y0; }
        return ppStruct({ breaks: x, d, k: 2, coefs, dimV: [d] });
      }
      const cols = Array.from({ length: ncols }, (_, c) => Float64Array.from(perm, (k) => V.re[k + c * n]));
      const pp = buildPP(x, cols, m); pp.dimV = [ncols];
      return ppStruct(pp);
    }
    const q = dbl(xq, 'interp1', 'xq');
    const results = parts.map((data) => {
      const cols = Array.from({ length: ncols }, (_, c) => Float64Array.from(perm, (k) => data[k + c * n]));
      return interp1Core(x, cols, q.re, method, extrap, data === V.im ? (Number.isNaN(fillVal) ? NaN : 0) : fillVal);
    });
    const nq = q.re.length;
    const re = new Float64Array(nq * ncols), im = V.im ? new Float64Array(nq * ncols) : null;
    for (let c = 0; c < ncols; c++) { re.set(results[0][c], c * nq); if (im) im.set(results[1][c], c * nq); }
    const qIsVec = q.dims.length === 2 && (q.dims[0] === 1 || q.dims[1] === 1);
    const dims = vIsVec ? q.dims : qIsVec ? [nq, ncols] : [...q.dims, ...V.dims.slice(1)];
    return out(dims, re, im, resultCls(vv));
  },
  interp2(args) {
    const { a, method: m0, extrapval, extrap } = nArgsSplit(args, 'interp2');
    const method = m0 || 'linear';
    let X, Y, Vv, Xq, Yq;
    if (a.length <= 2) {
      Vv = a[0]; const k = a.length === 2 ? intArg(a[1], 'interp2', 'k') : 1;
      const V = dbl(Vv, 'interp2'); const [mr, nc] = V.dims;
      X = Float64Array.from({ length: nc }, (_, i) => i + 1); Y = Float64Array.from({ length: mr }, (_, i) => i + 1);
      const xq = refineGrid(nc, k); Xq = out([1, xq.length], xq);
      const yq = refineGrid(mr, k); Yq = out([yq.length, 1], yq);
    } else if (a.length === 3) {
      [Vv, Xq, Yq] = a; const V = dbl(Vv, 'interp2'); const [mr, nc] = V.dims;
      X = Float64Array.from({ length: nc }, (_, i) => i + 1); Y = Float64Array.from({ length: mr }, (_, i) => i + 1);
    } else if (a.length === 5) {
      let Xv, Yv; [Xv, Yv, Vv, Xq, Yq] = a;
      X = gridVecOf(Xv, 1, 'interp2'); Y = gridVecOf(Yv, 0, 'interp2');
    } else fail('interp2:badInputs', 'Use interp2(X, Y, V, Xq, Yq), interp2(V, Xq, Yq) or interp2(V, k).');
    const V = dbl(Vv, 'interp2', 'V');
    if (V.dims.length > 2 || V.dims[0] !== Y.length || V.dims[1] !== X.length) fail('interp2:sizeMismatch', 'The lengths of X and Y must match the size of V (columns and rows).');
    checkGrid(X, 'interp2'); checkGrid(Y, 'interp2');
    const { Q, dims } = queryArrays([Xq, Yq], 'interp2', [1, 0]);
    const r = gridInterp([Y, X], { re: V.re, im: V.im }, [Q[1], Q[0]], method, extrap ? method : 'none', extrapval ?? NaN);
    return out(dims, r.re, r.im, resultCls(Vv));
  },
  interp3(args) {
    const { a, method: m0, extrapval } = nArgsSplit(args, 'interp3');
    const method = m0 || 'linear';
    let grids, Vv, qs;
    if (a.length === 4) {
      Vv = a[0]; const V = dbl(Vv, 'interp3'); const d = V.dims.concat([1, 1, 1]);
      grids = [d[0], d[1], d[2]].map((n) => Float64Array.from({ length: n }, (_, i) => i + 1));
      qs = [a[2], a[1], a[3]];
    } else if (a.length === 7) {
      Vv = a[3];
      grids = [gridVecOf(a[1], 0, 'interp3'), gridVecOf(a[0], 1, 'interp3'), gridVecOf(a[2], 2, 'interp3')];
      qs = [a[5], a[4], a[6]];
    } else fail('interp3:badInputs', 'Use interp3(X, Y, Z, V, Xq, Yq, Zq) or interp3(V, Xq, Yq, Zq).');
    const V = dbl(Vv, 'interp3', 'V');
    grids.forEach((g) => checkGrid(g, 'interp3'));
    if (prod(grids.map((g) => g.length)) !== V.re.length) fail('interp3:sizeMismatch', 'The grid does not match the size of V.');
    const { Q, dims } = queryArrays([qs[1], qs[0], qs[2]], 'interp3', [1, 0, 2]);
    const r = gridInterp(grids, { re: V.re, im: V.im }, [Q[1], Q[0], Q[2]], method, 'none', extrapval ?? NaN);
    return out(dims, r.re, r.im, resultCls(Vv));
  },
  interpn(args) {
    const { a, method: m0, extrapval } = nArgsSplit(args, 'interpn');
    const method = m0 || 'linear';
    const c = a.length;
    let grids, Vv, qs;
    const ndOf = (v) => { const t = dbl(v, 'interpn'); return t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1) ? 1 : t.dims.length; };
    if (c >= 3 && c % 2 === 1 && ndOf(a[(c - 1) / 2]) === (c - 1) / 2) {
      const n = (c - 1) / 2; Vv = a[n];
      grids = a.slice(0, n).map((g, k) => gridVecOf(g, k, 'interpn')); qs = a.slice(n + 1);
    } else {
      Vv = a[0]; const V = dbl(Vv, 'interpn');
      const isVec = V.dims.length === 2 && (V.dims[0] === 1 || V.dims[1] === 1);
      const dd = isVec ? [V.re.length] : V.dims;
      if (c === 1 || c === 2) {
        const k = c === 2 ? intArg(a[1], 'interpn', 'k') : 1;
        grids = dd.map((n) => Float64Array.from({ length: n }, (_, i) => i + 1));
        const rq = grids.map((g) => refineGrid(g.length, k));
        qs = rq.map((v, i) => { const d = new Array(Math.max(2, rq.length)).fill(1); d[i] = v.length; return out(d, v); });
      } else {
        grids = dd.map((n) => Float64Array.from({ length: n }, (_, i) => i + 1));
        qs = a.slice(1);
      }
    }
    const V = dbl(Vv, 'interpn', 'V');
    grids.forEach((g) => checkGrid(g, 'interpn'));
    if (qs.length !== grids.length) fail('interpn:badInputs', 'The number of query arrays must match the number of dimensions of V.');
    const { Q, dims } = queryArrays(qs, 'interpn');
    const r = gridInterp(grids, { re: V.re, im: V.im }, Q, method, 'none', extrapval ?? NaN);
    return out(dims, r.re, r.im, resultCls(Vv));
  },
  interpft(args) {
    if (args.length < 2) fail('interpft:notEnoughInputs', 'Not enough input arguments.');
    const X = dbl(args[0], 'interpft', 'x'); const n = intArg(args[1], 'interpft', 'n');
    const dim = args.length > 2 ? intArg(args[2], 'interpft', 'dim') - 1 : firstNonSingleton(X.dims);
    const m = X.dims[dim] ?? 1;
    const r = alongDim(X.dims, X.re, X.im, dim, n, (lr, li, yr, yi) => {
      const ar = Float64Array.from(lr), ai = li ? Float64Array.from(li) : new Float64Array(m);
      fftInPlace(ar, ai);
      const br = new Float64Array(n), bi = new Float64Array(n);
      if (n >= m) {
        const nyq = Math.ceil((m + 1) / 2);
        for (let k = 0; k < nyq; k++) { br[k] = ar[k]; bi[k] = ai[k]; }
        for (let k = nyq; k < m; k++) { br[n - m + k] = ar[k]; bi[n - m + k] = ai[k]; }
        if (m % 2 === 0) { const h = m / 2; br[h] = ar[h] / 2; bi[h] = ai[h] / 2; br[h + n - m] = ar[h] / 2; bi[h + n - m] = ai[h] / 2; }
      } else {
        const keep = Math.ceil((n + 1) / 2);
        for (let k = 0; k < keep; k++) { br[k] = ar[k]; bi[k] = ai[k]; }
        for (let k = keep; k < n; k++) { br[k] = ar[m - n + k]; bi[k] = ai[m - n + k]; }
      }
      fftInPlace(br, bi, true);
      for (let k = 0; k < n; k++) { yr[k] = (br[k] / m); yi[k] = (bi[k] / m); }
    });
    return out(r.dims, r.re, X.im ? r.im : null, resultCls(args[0]));
  },
  spline(args) { return ppBuiltin('spline', args); },
  pchip(args) { return ppBuiltin('pchip', args); },
  makima(args) { return ppBuiltin('makima', args); },
  ppval(args) {
    if (args.length < 2) fail('ppval:notEnoughInputs', 'Not enough input arguments.');
    let ppV = args[0], xxV = args[1];
    if (isStruct(xxV) && !isStruct(ppV)) { const t = ppV; ppV = xxV; xxV = t; }
    const pp = ppFromStruct(ppV, 'ppval');
    const q = dbl(xxV, 'ppval', 'xx');
    return ppValues(pp, q.re, q.dims);
  },
  mkpp(args) {
    if (args.length < 2) fail('mkpp:notEnoughInputs', 'Not enough input arguments.');
    const breaks = dbl(args[0], 'mkpp', 'breaks').re;
    const C = dbl(args[1], 'mkpp', 'coefs');
    const dimV = args.length > 2 ? Array.from(dbl(args[2], 'mkpp', 'd').re) : [1];
    const d = dimV.reduce((x, y) => x * y, 1);
    const l = breaks.length - 1;
    if (l < 1) fail('mkpp:tooFewBreaks', 'There must be at least two breaks.');
    const total = C.re.length;
    const k = Math.round(total / (l * d));
    if (k * l * d !== total) fail('mkpp:PPNumberMismatchCoeffs', `The requested number of polynomial pieces, ${l}, is incompatible with the proposed size of the coefficient array.`);
    // coefs is (l*d)-by-k (or any array with that many elements in that order)
    const rows = l * d; const co = new Float64Array(rows * k);
    for (let r = 0; r < rows; r++) for (let p = 0; p < k; p++) co[r * k + p] = C.re[r + p * rows];
    const pp = { breaks: Float64Array.from(breaks), d, k, coefs: co };
    const s = ppStruct(pp);
    if (dimV.length > 1) s.data[0].dim = out([1, dimV.length], dimV);
    return s;
  },
  unmkpp(args, nargout) {
    const pp = ppFromStruct(args[0], 'unmkpp');
    const s = args[0].data[0];
    const res = [s.breaks, s.coefs, num(pp.breaks.length - 1), num(pp.k), s.dim];
    return res.slice(0, Math.max(1, nargout));
  },
  delaunay(args) {
    if (!args.length) fail('delaunay:notEnoughInputs', 'Not enough input arguments.');
    const { px, py } = pointsArg(args, 'delaunay');
    if (args.length >= 3 && optText(args[2]) == null) fail('delaunay:only2D', 'Only 2-D Delaunay triangulation is supported.');
    return trisValue(delaunay2(px, py));
  },
  convhull(args, nargout) {
    if (!args.length) fail('convhull:notEnoughInputs', 'Not enough input arguments.');
    const { px, py } = pointsArg(args, 'convhull');
    if (px.length < 3) fail('convhull:notEnoughPts', 'At least 3 points are needed.');
    const h = convHull2(px, py);
    if (h.length < 3) fail('convhull:collinear', 'The points are collinear; the convex hull is degenerate.');
    const k = h.concat([h[0]]);
    const kv = out([k.length, 1], Float64Array.from(k, (i) => i + 1));
    if (nargout < 2) return kv;
    let area = 0; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; area += px[a] * py[b] - px[b] * py[a]; }
    return [kv, scalar(Math.abs(area) / 2)];
  },
  griddata(args) {
    const nums = [], strs = [];
    for (const a of args) { if (optText(a) != null) strs.push(optText(a)); else nums.push(a); }
    if (nums.length < 5) fail('griddata:notEnoughInputs', 'Use griddata(x, y, v, xq, yq) (2-D data).');
    if (nums.length > 5) fail('griddata:only2D', '3-D griddata is not supported.');
    const method = strs[0] || 'linear';
    if (!['linear', 'nearest', 'natural', 'cubic', 'v4'].includes(method)) fail('griddata:badMethod', `Unknown method '${method}'.`);
    const px = Float64Array.from(dbl(nums[0], 'griddata').re), py = Float64Array.from(dbl(nums[1], 'griddata').re);
    const v = dbl(nums[2], 'griddata');
    if (px.length !== py.length || px.length !== v.re.length) fail('griddata:sizeMismatch', 'x, y and v must have the same number of elements.');
    // merge duplicate points (mean)
    const map = new Map(); const ux = [], uy = [], ur = [], ui = [], cnt = [];
    for (let i = 0; i < px.length; i++) {
      const key = px[i] + ',' + py[i];
      if (map.has(key)) { const j = map.get(key); ur[j] += v.re[i]; ui[j] += v.im ? v.im[i] : 0; cnt[j]++; }
      else { map.set(key, ux.length); ux.push(px[i]); uy.push(py[i]); ur.push(v.re[i]); ui.push(v.im ? v.im[i] : 0); cnt.push(1); }
    }
    const vals = { re: Float64Array.from(ur, (x, j) => x / cnt[j]), im: v.im ? Float64Array.from(ui, (x, j) => x / cnt[j]) : null };
    const X = Float64Array.from(ux), Y = Float64Array.from(uy);
    const { Q, dims } = queryArrays([nums[3], nums[4]], 'griddata', [1, 0]);
    const n = Q[0].length;
    if (method === 'v4') {
      const re = v4Interp(X, Y, vals.re, Q[0], Q[1]);
      const im = vals.im ? v4Interp(X, Y, vals.im, Q[0], Q[1]) : null;
      return out(dims, re, im);
    }
    const S = makeScattered(X, Y, vals, method === 'nearest' ? 'nearest' : 'linear', method === 'nearest' ? 'nearest' : 'none');
    const re = new Float64Array(n), im = vals.im ? new Float64Array(n) : null;
    for (let k = 0; k < n; k++) { re[k] = evalScattered(S, Q[0][k], Q[1][k], 're'); if (im) im[k] = evalScattered(S, Q[0][k], Q[1][k], 'im'); }
    return out(dims, re, im);
  },
};

export const help = {
  interp1: H('1-D interpolation (linear, nearest, next, previous, pchip, cubic, spline, makima).', '1차원 보간 (linear, nearest, next, previous, pchip, cubic, spline, makima).', ['vq = interp1(x, v, xq)', 'vq = interp1(x, v, xq, method)', "vq = interp1(x, v, xq, method, 'extrap')", 'vq = interp1(x, v, xq, method, extrapval)', "pp = interp1(x, v, method, 'pp')"]),
  interp2: H('2-D interpolation of gridded data (meshgrid format).', '격자 데이터 2차원 보간 (meshgrid 형식).', ['Vq = interp2(X, Y, V, Xq, Yq)', 'Vq = interp2(V, Xq, Yq)', 'Vq = interp2(..., method, extrapval)', 'Vq = interp2(V, k)']),
  interp3: H('3-D interpolation of gridded data (meshgrid format).', '격자 데이터 3차원 보간 (meshgrid 형식).', ['Vq = interp3(X, Y, Z, V, Xq, Yq, Zq)', 'Vq = interp3(V, Xq, Yq, Zq)', 'Vq = interp3(..., method, extrapval)']),
  interpn: H('N-D interpolation of gridded data (ndgrid format).', '격자 데이터 N차원 보간 (ndgrid 형식).', ['Vq = interpn(X1, ..., Xn, V, Xq1, ..., Xqn)', 'Vq = interpn(V, Xq1, ..., Xqn)', 'Vq = interpn(..., method, extrapval)']),
  interpft: H('1-D interpolation using the FFT method.', 'FFT 방법을 이용한 1차원 보간.', ['y = interpft(x, n)', 'y = interpft(x, n, dim)']),
  griddedInterpolant: H('Interpolant for gridded data.', '격자 데이터용 보간 객체.', ['F = griddedInterpolant(x, v)', 'F = griddedInterpolant(x1, x2, V, method, extrapmethod)', 'F = griddedInterpolant({x1, x2}, V)', 'vq = F(xq1, xq2)', 'vq = F({gq1, gq2})']),
  scatteredInterpolant: H('Interpolant for 2-D scattered data.', '2차원 산재 데이터용 보간 객체.', ['F = scatteredInterpolant(x, y, v)', 'F = scatteredInterpolant(P, v, method, extrapmethod)', 'vq = F(xq, yq)']),
  griddata: H('Interpolate 2-D scattered data.', '2차원 산재 데이터 보간.', ['vq = griddata(x, y, v, xq, yq)', "vq = griddata(x, y, v, xq, yq, method)  % 'linear' | 'nearest' | 'natural' | 'cubic' | 'v4'"]),
  spline: H('Cubic spline interpolation (not-a-knot or clamped ends).', '3차 스플라인 보간 (not-a-knot 또는 끝 기울기 지정).', ['pp = spline(x, y)', 'yq = spline(x, y, xq)']),
  pchip: H('Shape-preserving piecewise cubic Hermite interpolation.', '모양 보존 구간별 3차 에르미트 보간.', ['pp = pchip(x, y)', 'yq = pchip(x, y, xq)']),
  makima: H('Modified Akima piecewise cubic Hermite interpolation.', '수정 아키마 구간별 3차 에르미트 보간.', ['pp = makima(x, y)', 'yq = makima(x, y, xq)']),
  ppval: H('Evaluate a piecewise polynomial.', '구간별 다항식 계산.', ['v = ppval(pp, xq)']),
  mkpp: H('Make a piecewise polynomial.', '구간별 다항식 만들기.', ['pp = mkpp(breaks, coefs)', 'pp = mkpp(breaks, coefs, d)']),
  unmkpp: H('Extract piecewise polynomial details.', '구간별 다항식 정보 추출.', ['[breaks, coefs, l, k, d] = unmkpp(pp)']),
  delaunay: H('2-D Delaunay triangulation.', '2차원 들로네 삼각분할.', ['T = delaunay(x, y)', 'T = delaunay(P)']),
  delaunayTriangulation: H('2-D Delaunay triangulation object (Points, ConnectivityList; pointLocation, nearestNeighbor, convexHull, edges).', '2차원 들로네 삼각분할 객체 (Points, ConnectivityList; pointLocation, nearestNeighbor, convexHull, edges).', ['DT = delaunayTriangulation(x, y)', 'DT = delaunayTriangulation(P)', 'ti = pointLocation(DT, qx, qy)']),
  convhull: H('2-D convex hull (counterclockwise, closed).', '2차원 볼록 껍질 (반시계 방향, 닫힌 경로).', ['k = convhull(x, y)', '[k, area] = convhull(P)']),
};
void isOpt; void tensor; void toC; void isText; void trailingOpts;
