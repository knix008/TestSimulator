// More linear algebra and geometry: polygon area / point-in-polygon /
// rectangle intersection, polynomial eigenvalue problems, ordered
// eigenvalues and Schur reordering, page-wise matrix operations, tensor
// products, QR updating and nearest-point search.
import { fail, dbl, mat, out, outMat, optText, H, EPS, cdiv } from './util.js';
import { tensor } from '../../value.js';

const cmulS = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
const call = (ctx, f, args, n = 1) => ctx.call(f, args, n);
const call1 = (ctx, f, args) => ctx.call(f, args, 1)[0];

// ------------------------------------------------------------- geometry

function polyareaFn(args) {
  if (args.length < 2) fail('polyarea:notEnoughInputs', 'Not enough input arguments.');
  const x = dbl(args[0], 'polyarea', 'X'), y = dbl(args[1], 'polyarea', 'Y');
  if (x.re.length !== y.re.length) fail('polyarea:sizeMismatch', 'X and Y must be the same size.');
  const d = x.dims;
  const isVec = d.length === 2 && (d[0] === 1 || d[1] === 1);
  const m = isVec ? x.re.length : d[0], nc = isVec ? 1 : x.re.length / d[0];
  const res = new Float64Array(nc);
  for (let c = 0; c < nc; c++) {
    let s = 0;
    for (let i = 0; i < m; i++) { const j = (i + 1) % m; s += x.re[c * m + i] * y.re[c * m + j] - x.re[c * m + j] * y.re[c * m + i]; }
    res[c] = Math.abs(s) / 2;
  }
  return isVec ? out([1, 1], res) : out([1, nc], res);
}
function inpolygonFn(args, nargout) {
  if (args.length < 4) fail('inpolygon:notEnoughInputs', 'Not enough input arguments.');
  const xq = dbl(args[0], 'inpolygon'), yq = dbl(args[1], 'inpolygon'), xv = dbl(args[2], 'inpolygon').re, yv = dbl(args[3], 'inpolygon').re;
  if (xq.re.length !== yq.re.length) fail('inpolygon:sizeMismatch', 'xq and yq must be the same size.');
  // split loops at NaN; close each loop
  const loops = []; let cur = [];
  for (let i = 0; i <= xv.length; i++) {
    if (i === xv.length || xv[i] !== xv[i] || yv[i] !== yv[i]) { if (cur.length) loops.push(cur); cur = []; } else cur.push([xv[i], yv[i]]);
  }
  let scale = 0; for (const l of loops) for (const [a, b] of l) scale = Math.max(scale, Math.abs(a), Math.abs(b));
  const tol = 1e-12 * (scale || 1);
  const n = xq.re.length, IN = new Float64Array(n), ON = new Float64Array(n);
  for (let q = 0; q < n; q++) {
    const px = xq.re[q], py = yq.re[q];
    let inside = false, on = false;
    for (const l of loops) {
      for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
        const [xi, yi] = l[i], [xj, yj] = l[j];
        const cr = (xj - xi) * (py - yi) - (yj - yi) * (px - xi);
        if (Math.abs(cr) <= tol * Math.max(1, Math.hypot(xj - xi, yj - yi)) && px >= Math.min(xi, xj) - tol && px <= Math.max(xi, xj) + tol && py >= Math.min(yi, yj) - tol && py <= Math.max(yi, yj) + tol) on = true;
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    IN[q] = inside || on ? 1 : 0; ON[q] = on ? 1 : 0;
  }
  const a = tensor('logical', xq.dims, IN);
  return nargout >= 2 ? [a, tensor('logical', xq.dims, ON)] : a;
}
function rectintFn(args) {
  if (args.length < 2) fail('rectint:notEnoughInputs', 'Not enough input arguments.');
  const A = mat(args[0], 'rectint', 'A'), B = mat(args[1], 'rectint', 'B');
  if (A.n !== 4 || B.n !== 4) fail('rectint:badRect', 'Rectangles must be given as [x y width height] rows.');
  const r = new Float64Array(A.m * B.m);
  for (let i = 0; i < A.m; i++) for (let j = 0; j < B.m; j++) {
    const g = (M, k, c) => M.re[k + c * M.m];
    const w = Math.min(g(A, i, 0) + g(A, i, 2), g(B, j, 0) + g(B, j, 2)) - Math.max(g(A, i, 0), g(B, j, 0));
    const h = Math.min(g(A, i, 1) + g(A, i, 3), g(B, j, 1) + g(B, j, 3)) - Math.max(g(A, i, 1), g(B, j, 1));
    r[i + j * A.m] = Math.max(0, w) * Math.max(0, h);
  }
  return outMat(A.m, B.m, r);
}
function dsearchnFn(args, nargout) {
  if (args.length < 2) fail('dsearchn:notEnoughInputs', 'Not enough input arguments.');
  const X = mat(args[0], 'dsearchn', 'X');
  const P = mat(args[args.length >= 3 && args[1].dims && args[1].dims[1] !== X.n ? 2 : 1], 'dsearchn', 'XI');
  if (P.n !== X.n) fail('dsearchn:dimMismatch', 'Query points must have the same number of columns as X.');
  const k = new Float64Array(P.m), d = new Float64Array(P.m);
  for (let q = 0; q < P.m; q++) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < X.m; i++) { let s = 0; for (let c = 0; c < X.n; c++) { const t = X.re[i + c * X.m] - P.re[q + c * P.m]; s += t * t; } if (s < bd) { bd = s; best = i; } }
    k[q] = best + 1; d[q] = Math.sqrt(bd);
  }
  return nargout >= 2 ? [out([P.m, 1], k), out([P.m, 1], d)] : out([P.m, 1], k);
}

// ------------------------------------------------------------- polyeig

function polyeigFn(args, nargout, ctx) {
  if (!args.length) fail('polyeig:notEnoughInputs', 'Not enough input arguments.');
  const Ms = args.map((a, i) => mat(a, 'polyeig', `A${i}`));
  const n = Ms[0].m;
  for (const M of Ms) if (M.m !== n || M.n !== n) fail('polyeig:dimMismatch', 'All matrices must be square and of the same size.');
  const p = Ms.length - 1;
  if (p === 0) {
    const r = call(ctx, 'eig', [args[0]], Math.max(1, Math.min(nargout, 2)));
    return nargout >= 2 ? [r[0], call1(ctx, 'diag', [r[1]])] : r[0];
  }
  const N = n * p;
  const Mr = new Float64Array(N * N), Mi = new Float64Array(N * N), Nr = new Float64Array(N * N), Ni = new Float64Array(N * N);
  // first block row of M: -[A0 A1 ... A(p-1)], of N: [0 ... 0 Ap]
  for (let b = 0; b < p; b++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    Mr[i + (b * n + j) * N] = -Ms[b].re[i + j * n]; if (Ms[b].im) Mi[i + (b * n + j) * N] = -Ms[b].im[i + j * n];
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { Nr[i + ((p - 1) * n + j) * N] = Ms[p].re[i + j * n]; if (Ms[p].im) Ni[i + ((p - 1) * n + j) * N] = Ms[p].im[i + j * n]; }
  // z(k+1) = lambda z(k)
  for (let k = 1; k < p; k++) for (let i = 0; i < n; i++) { Mr[k * n + i + (k * n + i) * N] = 1; Nr[k * n + i + ((k - 1) * n + i) * N] = 1; }
  const anyIm = Ms.some((M) => M.im);
  const Mv = out([N, N], Mr, anyIm ? Mi : null), Nv = out([N, N], Nr, anyIm ? Ni : null);
  if (nargout < 2) return call1(ctx, 'eig', [Mv, Nv]);
  if (nargout > 2) fail('polyeig:noCondition', 'The condition number output is not supported.');
  const [V, D] = call(ctx, 'eig', [Mv, Nv], 2);
  const vr = V.re, vi = V.im;
  const X = new Float64Array(n * N), Xi = new Float64Array(n * N);
  const e = new Float64Array(N), ei = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    e[k] = D.re[k + k * N]; ei[k] = D.im ? D.im[k + k * N] : 0;
    const big = !(Math.hypot(e[k], ei[k]) <= 1);
    const blk = big ? p - 1 : 0;
    let s = 0;
    for (let i = 0; i < n; i++) { const o = blk * n + i + k * N; X[i + k * n] = vr[o]; Xi[i + k * n] = vi ? vi[o] : 0; s = Math.hypot(s, X[i + k * n], Xi[i + k * n]); }
    if (s > 0) for (let i = 0; i < n; i++) { X[i + k * n] /= s; Xi[i + k * n] /= s; }
  }
  return [out([n, N], X, Xi), out([N, 1], e, ei)];
}

// ------------------------------------------------------------- ordeig / ordschur

/** Diagonal blocks of a (quasi) triangular matrix: [{k, size}] */
function blocksOf(T, n) {
  const bl = [];
  for (let k = 0; k < n;) {
    if (k + 1 < n && (T.re[k + 1 + k * n] !== 0 || (T.im && T.im[k + 1 + k * n] !== 0))) { bl.push({ k, size: 2 }); k += 2; } else { bl.push({ k, size: 1 }); k += 1; }
  }
  return bl;
}
function eig2x2(a, b, c, d) {
  const tr = a + d, det = a * d - b * c, disc = tr * tr / 4 - det;
  if (disc >= 0) { const s = Math.sqrt(disc); return [[tr / 2 + s, 0], [tr / 2 - s, 0]]; }
  const s = Math.sqrt(-disc); return [[tr / 2, s], [tr / 2, -s]];
}
function ordeigFn(args) {
  if (!args.length) fail('ordeig:notEnoughInputs', 'Not enough input arguments.');
  const T = mat(args[0], 'ordeig', 'T'); const n = T.n;
  if (T.m !== n) fail('ordeig:notSquare', 'T must be square.');
  const B = args[1] ? mat(args[1], 'ordeig', 'BB') : null;
  const er = new Float64Array(n), ei = new Float64Array(n);
  const g = (M, i, j) => [M.re[i + j * n], M.im ? M.im[i + j * n] : 0];
  for (const { k, size } of blocksOf(T, n)) {
    if (size === 1) {
      let [a, ai] = g(T, k, k);
      if (B) { const [b, bi] = g(B, k, k); [a, ai] = cdiv(a, ai, b, bi); }
      er[k] = a; ei[k] = ai;
    } else if (!B) {
      const ev = eig2x2(T.re[k + k * n], T.re[k + (k + 1) * n], T.re[k + 1 + k * n], T.re[k + 1 + (k + 1) * n]);
      [er[k], ei[k]] = ev[0]; [er[k + 1], ei[k + 1]] = ev[1];
    } else {
      // pencil 2x2: det(A - lambda B) = 0, B upper triangular
      const a11 = T.re[k + k * n], a12 = T.re[k + (k + 1) * n], a21 = T.re[k + 1 + k * n], a22 = T.re[k + 1 + (k + 1) * n];
      const b11 = B.re[k + k * n], b12 = B.re[k + (k + 1) * n], b22 = B.re[k + 1 + (k + 1) * n];
      const qa = b11 * b22, qb = -(a11 * b22 + a22 * b11 - a21 * b12), qc = a11 * a22 - a12 * a21;
      const disc = qb * qb - 4 * qa * qc;
      if (disc >= 0) { const s = Math.sqrt(disc); er[k] = (-qb + s) / (2 * qa); er[k + 1] = (-qb - s) / (2 * qa); }
      else { const s = Math.abs(Math.sqrt(-disc) / (2 * qa)); er[k] = er[k + 1] = -qb / (2 * qa); ei[k] = s; ei[k + 1] = -s; }
    }
  }
  return out([n, 1], er, ei);
}
/** Swaps adjacent diagonal blocks (sizes p, q at k) of T in place, accumulating U. Complex arithmetic. */
function swapBlocks(T, U, n, k, p, q) {
  const idx = (i, j) => i + j * n;
  // Solve A11 X - X A22 = A12 (p x q) via the Kronecker system
  const m = p * q;
  const Kr = new Float64Array(m * m), Ki = new Float64Array(m * m), br = new Float64Array(m), bi = new Float64Array(m);
  for (let j = 0; j < q; j++) for (let i = 0; i < p; i++) {
    const r = i + j * p;
    br[r] = T.re[idx(k + i, k + p + j)]; bi[r] = T.im[idx(k + i, k + p + j)];
    for (let l = 0; l < p; l++) { const c = l + j * p; Kr[r + c * m] += T.re[idx(k + i, k + l)]; Ki[r + c * m] += T.im[idx(k + i, k + l)]; }
    for (let l = 0; l < q; l++) { const c = i + l * p; Kr[r + c * m] -= T.re[idx(k + p + l, k + p + j)]; Ki[r + c * m] -= T.im[idx(k + p + l, k + p + j)]; }
  }
  // Gaussian elimination with partial pivoting (complex)
  for (let c = 0; c < m; c++) {
    let piv = c, pv = -1; for (let r = c; r < m; r++) { const a = Math.hypot(Kr[r + c * m], Ki[r + c * m]); if (a > pv) { pv = a; piv = r; } }
    if (pv < EPS) { Kr[piv + c * m] = EPS; Ki[piv + c * m] = 0; }
    if (piv !== c) { for (let j = 0; j < m; j++) { [Kr[c + j * m], Kr[piv + j * m]] = [Kr[piv + j * m], Kr[c + j * m]]; [Ki[c + j * m], Ki[piv + j * m]] = [Ki[piv + j * m], Ki[c + j * m]]; } [br[c], br[piv]] = [br[piv], br[c]]; [bi[c], bi[piv]] = [bi[piv], bi[c]]; }
    for (let r = c + 1; r < m; r++) {
      const [fr, fi] = cdiv(Kr[r + c * m], Ki[r + c * m], Kr[c + c * m], Ki[c + c * m]);
      if (fr === 0 && fi === 0) continue;
      for (let j = c; j < m; j++) { const [x, y] = cmulS(fr, fi, Kr[c + j * m], Ki[c + j * m]); Kr[r + j * m] -= x; Ki[r + j * m] -= y; }
      const [x, y] = cmulS(fr, fi, br[c], bi[c]); br[r] -= x; bi[r] -= y;
    }
  }
  const xr = new Float64Array(m), xi = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let sr = br[r], si = bi[r];
    for (let j = r + 1; j < m; j++) { const [x, y] = cmulS(Kr[r + j * m], Ki[r + j * m], xr[j], xi[j]); sr -= x; si -= y; }
    [xr[r], xi[r]] = cdiv(sr, si, Kr[r + r * m], Ki[r + r * m]);
  }
  // Orthonormal basis Q of size s = p+q whose first q columns span [-X; I]
  const s = p + q;
  const cols = [];
  for (let j = 0; j < q; j++) { const vr = new Float64Array(s), vi = new Float64Array(s); for (let i = 0; i < p; i++) { vr[i] = -xr[i + j * p]; vi[i] = -xi[i + j * p]; } vr[p + j] = 1; cols.push([vr, vi]); }
  for (let j = 0; j < s; j++) { const vr = new Float64Array(s), vi = new Float64Array(s); vr[j] = 1; cols.push([vr, vi]); }
  const Q = [];
  for (const [vr, vi] of cols) {
    for (let pass = 0; pass < 2; pass++) for (const [qr, qi] of Q) {
      let dr = 0, di = 0; for (let i = 0; i < s; i++) { dr += qr[i] * vr[i] + qi[i] * vi[i]; di += qr[i] * vi[i] - qi[i] * vr[i]; }
      for (let i = 0; i < s; i++) { const [x, y] = cmulS(dr, di, qr[i], qi[i]); vr[i] -= x; vi[i] -= y; }
    }
    let nv = 0; for (let i = 0; i < s; i++) nv = Math.hypot(nv, vr[i], vi[i]);
    if (nv > 1e-10 && Q.length < s) { for (let i = 0; i < s; i++) { vr[i] /= nv; vi[i] /= nv; } Q.push([vr, vi]); }
  }
  // T(k:k+s-1, :) = Q^H T(...), T(:, k:k+s-1) = T(...) Q, U(:, ...) = U Q
  for (let j = 0; j < n; j++) {
    const tr = [], ti = [];
    for (let a = 0; a < s; a++) { let sr = 0, si = 0; const [qr, qi] = Q[a]; for (let i = 0; i < s; i++) { const r = T.re[idx(k + i, j)], im = T.im[idx(k + i, j)]; sr += qr[i] * r + qi[i] * im; si += qr[i] * im - qi[i] * r; } tr.push(sr); ti.push(si); }
    for (let a = 0; a < s; a++) { T.re[idx(k + a, j)] = tr[a]; T.im[idx(k + a, j)] = ti[a]; }
  }
  for (const M of [T, U]) for (let i = 0; i < n; i++) {
    const tr = [], ti = [];
    for (let a = 0; a < s; a++) { let sr = 0, si = 0; const [qr, qi] = Q[a]; for (let l = 0; l < s; l++) { const [x, y] = cmulS(M.re[idx(i, k + l)], M.im[idx(i, k + l)], qr[l], qi[l]); sr += x; si += y; } tr.push(sr); ti.push(si); }
    for (let a = 0; a < s; a++) { M.re[idx(i, k + a)] = tr[a]; M.im[idx(i, k + a)] = ti[a]; }
  }
  // exact zeros below the new blocks
  for (let j = k; j < k + q; j++) for (let i = k + q; i < k + s; i++) { T.re[idx(i, j)] = 0; T.im[idx(i, j)] = 0; }
  if (q === 1) for (let i = k + 1; i < k + s; i++) { T.re[idx(i, k)] = 0; T.im[idx(i, k)] = 0; }
  if (p === 1) for (let i = k + q + 1; i < n; i++) { T.re[idx(i, k + q)] = 0; T.im[idx(i, k + q)] = 0; }
}
function ordschurFn(args, nargout) {
  if (args.length < 3) fail('ordschur:notEnoughInputs', 'Not enough input arguments.');
  const U0 = mat(args[0], 'ordschur', 'U'), T0 = mat(args[1], 'ordschur', 'T');
  const n = T0.n;
  if (T0.m !== n || U0.n !== n) fail('ordschur:dimMismatch', 'U and T must be square matrices of the same size.');
  const T = { re: Float64Array.from(T0.re), im: T0.im ? Float64Array.from(T0.im) : new Float64Array(n * n) };
  const U = { re: Float64Array.from(U0.re), im: U0.im ? Float64Array.from(U0.im) : new Float64Array(U0.re.length) };
  const ev = ordeigFn([args[1]]);
  const kw = optText(args[2]);
  let labels;
  if (kw !== null) {
    const f = { lhp: (r) => r < 0, rhp: (r) => r > 0, udi: (r, i) => Math.hypot(r, i) < 1, udo: (r, i) => Math.hypot(r, i) > 1 }[kw];
    if (!f) fail('ordschur:badKeyword', "Cluster keyword must be 'lhp', 'rhp', 'udi' or 'udo'.");
    labels = Array.from(ev.re, (r, i) => (f(r, ev.im ? ev.im[i] : 0) ? 1 : 0));
  } else {
    const s = dbl(args[2], 'ordschur', 'select').re;
    if (s.length !== n) fail('ordschur:badSelect', 'The selection vector must have one entry per eigenvalue.');
    labels = Array.from(s);
  }
  // per block label (a 2x2 block takes the larger label of its pair)
  const bl = blocksOf(T, n);
  const lab = bl.map((b) => (b.size === 2 ? Math.max(labels[b.k], labels[b.k + 1]) : labels[b.k]));
  const levels = [...new Set(lab)].sort((a, b) => a - b);
  // move the blocks with label >= lv to the top for increasing lv: the highest cluster ends first
  for (const lv of levels.slice(1).length ? levels.slice(1) : []) {
    let ks = 0;
    for (let bi = 0; bi < bl.length; bi++) {
      if (!(lab[bi] >= lv)) continue;
      for (let j = bi; j > ks; j--) {
        const a = bl[j - 1], b = bl[j];
        swapBlocks(T, U, n, a.k, a.size, b.size);
        bl[j - 1] = { k: a.k, size: b.size }; bl[j] = { k: a.k + b.size, size: a.size };
        [lab[j - 1], lab[j]] = [lab[j], lab[j - 1]];
      }
      ks++;
    }
  }
  const real = !T0.im && !U0.im;
  const outs = [out([n, n], U.re, real ? null : U.im), out([n, n], T.re, real ? null : T.im)];
  return nargout <= 1 ? outs[0] : outs;
}

// ------------------------------------------------------------- page-wise operations

/** Page dims (beyond 2) and per-page slices of a numeric array. */
function pages(v, fn) {
  const t = dbl(v, fn);
  const d = t.dims; const m = d[0], n = d[1] ?? 1;
  const pd = d.slice(2); const np = pd.reduce((a, b) => a * b, 1);
  const get = (p) => {
    const re = t.re.subarray(p * m * n, (p + 1) * m * n), im = t.im ? t.im.subarray(p * m * n, (p + 1) * m * n) : null;
    return tensor('double', [m, n], Float64Array.from(re), im ? Float64Array.from(im) : null);
  };
  return { m, n, pd, np, get, cls: v.cls === 'single' ? 'single' : 'double' };
}
function bcastPages(a, b, fn) {
  const nd = Math.max(a.pd.length, b.pd.length);
  const pa = a.pd.concat(Array(nd - a.pd.length).fill(1)), pb = b.pd.concat(Array(nd - b.pd.length).fill(1));
  const pd = pa.map((x, i) => { if (x !== pb[i] && x !== 1 && pb[i] !== 1) fail(`${fn}:pageMismatch`, 'Page dimensions must agree or be 1.'); return Math.max(x, pb[i]); });
  const np = pd.reduce((s, x) => s * x, 1);
  const idx = (p, dims) => { let r = p, lin = 0, st = 1; for (let k = 0; k < nd; k++) { const s = r % pd[k]; r = Math.floor(r / pd[k]); lin += (dims[k] === 1 ? 0 : s) * st; st *= dims[k]; } return lin; };
  return { pd, np, ia: (p) => idx(p, pa), ib: (p) => idx(p, pb) };
}
function stackPages(results, pd, fn, cls = 'double') {
  if (!results.length) return tensor('double', [0, 0, ...pd]);
  const [m, n] = results[0].dims;
  const N = m * n; const re = new Float64Array(N * results.length);
  const anyIm = results.some((r) => r.im); const im = anyIm ? new Float64Array(re.length) : null;
  results.forEach((r, p) => { if (r.dims[0] !== m || r.dims[1] !== n) fail(`${fn}:pageSize`, 'Pages have different sizes.'); re.set(r.re, p * N); if (r.im) im.set(r.im, p * N); });
  return out([m, n, ...pd], re, im, cls);
}
const transOpt = (v, fn) => { const s = optText(v); if (s === null || !['none', 'transpose', 'ctranspose'].includes(s)) fail(`${fn}:badTranspose`, "Transpose option must be 'none', 'transpose' or 'ctranspose'."); return s; };
function pagemtimesFn(args, nargout, ctx) {
  let X, Y, tx = 'none', ty = 'none';
  if (args.length === 4) { X = args[0]; tx = transOpt(args[1], 'pagemtimes'); Y = args[2]; ty = transOpt(args[3], 'pagemtimes'); }
  else if (args.length === 2) { X = args[0]; Y = args[1]; }
  else fail('pagemtimes:badArgs', 'Use pagemtimes(X, Y) or pagemtimes(X, transpX, Y, transpY).');
  const a = pages(X, 'pagemtimes'), b = pages(Y, 'pagemtimes');
  const bp = bcastPages(a, b, 'pagemtimes');
  const tr = (v, t) => (t === 'none' ? v : call1(ctx, t, [v]));
  const res = [];
  for (let p = 0; p < bp.np; p++) res.push(dbl(call1(ctx, 'mtimes', [tr(a.get(bp.ia(p)), tx), tr(b.get(bp.ib(p)), ty)]), 'pagemtimes'));
  return stackPages(res, bp.pd, 'pagemtimes', a.cls === 'single' || b.cls === 'single' ? 'single' : 'double');
}
function pageBinary(fn, op) {
  return (args, nargout, ctx) => {
    if (args.length < 2) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
    const a = pages(args[0], fn), b = pages(args[1], fn);
    const bp = bcastPages(a, b, fn);
    const res = [];
    for (let p = 0; p < bp.np; p++) res.push(dbl(call1(ctx, op, [a.get(bp.ia(p)), b.get(bp.ib(p))]), fn));
    return stackPages(res, bp.pd, fn, a.cls === 'single' || b.cls === 'single' ? 'single' : 'double');
  };
}
function pageUnary(fn, op, extra = () => []) {
  return (args, nargout, ctx) => {
    if (!args.length) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
    const a = pages(args[0], fn);
    const res = [];
    for (let p = 0; p < a.np; p++) res.push(dbl(call1(ctx, op, [a.get(p), ...extra(args)]), fn));
    return stackPages(res, a.pd, fn, a.cls);
  };
}
function pageMulti(fn, op, maxOut) {
  return (args, nargout, ctx) => {
    if (!args.length) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
    const a = pages(args[0], fn);
    const k = Math.max(1, Math.min(nargout, maxOut));
    const res = Array.from({ length: k }, () => []);
    for (let p = 0; p < a.np; p++) { const r = call(ctx, op, [a.get(p), ...args.slice(1)], k); for (let i = 0; i < k; i++) res[i].push(dbl(r[i], fn)); }
    const outs = res.map((r) => stackPages(r, a.pd, fn, a.cls));
    return k === 1 ? outs[0] : outs;
  };
}
function pagenormFn(args, nargout, ctx) {
  if (!args.length) fail('pagenorm:notEnoughInputs', 'Not enough input arguments.');
  const a = pages(args[0], 'pagenorm');
  const res = [];
  for (let p = 0; p < a.np; p++) res.push(dbl(call1(ctx, 'norm', [a.get(p), ...args.slice(1)]), 'pagenorm'));
  return stackPages(res, a.pd, 'pagenorm', a.cls);
}

// ------------------------------------------------------------- tensorprod

function tensorprodFn(args, nargout, ctx) {
  if (args.length < 2) fail('tensorprod:notEnoughInputs', 'Not enough input arguments.');
  const A = dbl(args[0], 'tensorprod', 'A'), B = dbl(args[1], 'tensorprod', 'B');
  let da = [], db = [], outer = false, numDimsA = null, numDimsB = null, all = false;
  let i = 2;
  if (args[i] !== undefined && optText(args[i]) === 'all') { all = true; i++; }
  else if (args[i] !== undefined && optText(args[i]) === null) {
    da = Array.from(dbl(args[i], 'tensorprod').re, (x) => x - 1); i++;
    if (args[i] !== undefined && optText(args[i]) === null) { db = Array.from(dbl(args[i], 'tensorprod').re, (x) => x - 1); i++; } else db = da.slice();
  } else outer = true;
  for (; i < args.length; i += 2) {
    const s = optText(args[i]);
    if (s === 'numdimensionsa') numDimsA = dbl(args[i + 1], 'tensorprod').re[0];
    else if (s === 'numdimensionsb') numDimsB = dbl(args[i + 1], 'tensorprod').re[0];
    else fail('tensorprod:badOption', `Invalid option '${s}'.`);
  }
  const dA = A.dims.slice(), dB = B.dims.slice();
  if (numDimsA) while (dA.length < numDimsA) dA.push(1);
  if (numDimsB) while (dB.length < numDimsB) dB.push(1);
  if (all) { if (A.re.length !== B.re.length) fail('tensorprod:sizeMismatch', "With 'all' the arrays must have the same size."); da = dA.map((_, k) => k); db = da.slice(); }
  const maxD = Math.max(...da, ...db, -1);
  while (dA.length <= maxD) dA.push(1); while (dB.length <= maxD) dB.push(1);
  if (da.length !== db.length) fail('tensorprod:dimMismatch', 'The contracted dimension lists must have the same length.');
  da.forEach((k, q) => { if (dA[k] !== dB[db[q]]) fail('tensorprod:sizeMismatch', 'Contracted dimensions must have the same sizes.'); });
  void outer;
  const freeA = dA.map((_, k) => k).filter((k) => !da.includes(k)), freeB = dB.map((_, k) => k).filter((k) => !db.includes(k));
  // permute A to [freeA, da] and B to [db, freeB], reshape to matrices, multiply
  const perm = (T, dims, order) => call1(ctx, 'permute', [{ ...T, dims: dims.slice() }, out([1, order.length], Float64Array.from(order, (x) => x + 1))]);
  const fa = freeA.reduce((s, k) => s * dA[k], 1), ca = da.reduce((s, k) => s * dA[k], 1), fb = freeB.reduce((s, k) => s * dB[k], 1);
  const orderA = [...freeA, ...da], orderB = [...db, ...freeB];
  const Ap = orderA.length >= 2 ? perm(A, dA, orderA) : { ...A };
  const Bp = orderB.length >= 2 ? perm(B, dB, orderB) : { ...B };
  const Am = tensor('double', [fa, ca], Ap.re, Ap.im), Bm = tensor('double', [ca, fb], Bp.re, Bp.im);
  const C = dbl(call1(ctx, 'mtimes', [Am, Bm]), 'tensorprod');
  let dims = [...freeA.map((k) => dA[k]), ...freeB.map((k) => dB[k])];
  while (dims.length < 2) dims.push(1);
  return out(dims, C.re, C.im);
}

// ------------------------------------------------------------- QR updating (refactor the modified matrix)

function qrOf(ctx, A, wantFull) { const [Q, R] = call(ctx, 'qr', [A], 2); void wantFull; return [Q, R]; }
function qrupdateFn(args, nargout, ctx) {
  if (args.length < 4) fail('qrupdate:notEnoughInputs', 'Not enough input arguments.');
  const A = call1(ctx, 'plus', [call1(ctx, 'mtimes', [args[0], args[1]]), call1(ctx, 'mtimes', [args[2], call1(ctx, 'ctranspose', [args[3]])])]);
  return qrOf(ctx, A);
}
function qrinsertFn(args, nargout, ctx) {
  if (args.length < 4) fail('qrinsert:notEnoughInputs', 'Not enough input arguments.');
  const A = dbl(call1(ctx, 'mtimes', [args[0], args[1]]), 'qrinsert');
  const j = dbl(args[2], 'qrinsert').re[0] - 1;
  const orient = args[4] !== undefined ? optText(args[4]) : 'col';
  const x = dbl(args[3], 'qrinsert');
  const [m, n] = A.dims;
  let re, im, dims;
  const g = (T, k) => [T.re[k], T.im ? T.im[k] : 0];
  if (orient === 'col') {
    if (!(j >= 0 && j <= n) || x.re.length !== m) fail('qrinsert:badInsert', 'Column index out of range or column of wrong length.');
    dims = [m, n + 1]; re = new Float64Array(m * (n + 1)); im = new Float64Array(re.length);
    for (let c = 0, s = 0; c <= n; c++) for (let r = 0; r < m; r++) { const v = c === j ? g(x, r) : g(A, r + s * m); re[r + c * m] = v[0]; im[r + c * m] = v[1]; if (r === m - 1 && c !== j) s++; }
  } else if (orient === 'row') {
    if (!(j >= 0 && j <= m) || x.re.length !== n) fail('qrinsert:badInsert', 'Row index out of range or row of wrong length.');
    dims = [m + 1, n]; re = new Float64Array((m + 1) * n); im = new Float64Array(re.length);
    for (let c = 0; c < n; c++) for (let r = 0, s = 0; r <= m; r++) { const v = r === j ? g(x, c) : g(A, s++ + c * m); re[r + c * (m + 1)] = v[0]; im[r + c * (m + 1)] = v[1]; }
  } else fail('qrinsert:badOrient', "Orientation must be 'col' or 'row'.");
  return qrOf(ctx, out(dims, re, im));
}
function qrdeleteFn(args, nargout, ctx) {
  if (args.length < 3) fail('qrdelete:notEnoughInputs', 'Not enough input arguments.');
  const A = dbl(call1(ctx, 'mtimes', [args[0], args[1]]), 'qrdelete');
  const j = dbl(args[2], 'qrdelete').re[0] - 1;
  const orient = args[3] !== undefined ? optText(args[3]) : 'col';
  const [m, n] = A.dims;
  const keep = [];
  if (orient === 'col') { if (!(j >= 0 && j < n)) fail('qrdelete:badIndex', 'Column index out of range.'); for (let c = 0; c < n; c++) if (c !== j) for (let r = 0; r < m; r++) keep.push(r + c * m); }
  else if (orient === 'row') { if (!(j >= 0 && j < m)) fail('qrdelete:badIndex', 'Row index out of range.'); for (let c = 0; c < n; c++) for (let r = 0; r < m; r++) if (r !== j) keep.push(r + c * m); }
  else fail('qrdelete:badOrient', "Orientation must be 'col' or 'row'.");
  const dims = orient === 'col' ? [m, n - 1] : [m - 1, n];
  return qrOf(ctx, out(dims, Float64Array.from(keep, (k) => A.re[k]), A.im ? Float64Array.from(keep, (k) => A.im[k]) : null));
}

const H2 = H;
export const builtins = {
  polyarea: polyareaFn,
  inpolygon: inpolygonFn,
  rectint: rectintFn,
  dsearchn: dsearchnFn,
  interp1q(args, nargout, ctx) { if (args.length < 3) fail('interp1q:notEnoughInputs', 'Not enough input arguments.'); return call1(ctx, 'interp1', [args[0], args[1], args[2], tensor('char', [1, 6], Array.from('linear', (c) => c.charCodeAt(0)))]); },
  polyeig: polyeigFn,
  ordeig: ordeigFn,
  ordschur: ordschurFn,
  pagemtimes: pagemtimesFn,
  pagetranspose: pageUnary('pagetranspose', 'transpose'),
  pagectranspose: pageUnary('pagectranspose', 'ctranspose'),
  pagemldivide: pageBinary('pagemldivide', 'mldivide'),
  pagemrdivide: pageBinary('pagemrdivide', 'mrdivide'),
  pageinv: pageUnary('pageinv', 'inv'),
  pagesvd: pageMulti('pagesvd', 'svd', 3),
  pageeig: pageMulti('pageeig', 'eig', 3),
  pagenorm: pagenormFn,
  tensorprod: tensorprodFn,
  qrupdate: qrupdateFn,
  qrinsert: qrinsertFn,
  qrdelete: qrdeleteFn,
};
export const help = {
  polyarea: H2('Area of a polygon.', '다각형의 넓이.', ['A = polyarea(x, y)']),
  inpolygon: H2('Points inside or on the edge of a polygon region.', '다각형 영역 내부 또는 경계 위의 점.', ['in = inpolygon(xq, yq, xv, yv)', '[in, on] = inpolygon(xq, yq, xv, yv)']),
  rectint: H2('Intersection areas of rectangles [x y w h].', '사각형 [x y w h] 의 교차 넓이.', ['area = rectint(A, B)']),
  dsearchn: H2('Nearest point search.', '가장 가까운 점 찾기.', ['k = dsearchn(X, XI)', '[k, dist] = dsearchn(X, XI)']),
  interp1q: H2('Quick 1-D linear interpolation (NaN outside the data).', '빠른 1차원 선형 보간 (범위 밖은 NaN).', ['yi = interp1q(x, Y, xi)']),
  polyeig: H2('Polynomial eigenvalue problem (A0 + l*A1 + ... + l^p*Ap) x = 0.', '다항 고유값 문제 (A0 + l*A1 + ... + l^p*Ap) x = 0.', ['e = polyeig(A0, A1, ..., Ap)', '[X, e] = polyeig(A0, A1, ..., Ap)']),
  ordeig: H2('Eigenvalues of a (quasi) triangular Schur or QZ form, in diagonal order.', '(준)삼각 슈어 또는 QZ 형식의 고유값 (대각 순서).', ['E = ordeig(T)', 'E = ordeig(AA, BB)']),
  ordschur: H2('Reorders a Schur factorization so that selected eigenvalues come first.', '선택한 고유값이 앞에 오도록 슈어 분해 재정렬.', ['[US, TS] = ordschur(U, T, select)', "[US, TS] = ordschur(U, T, 'lhp')", "[US, TS] = ordschur(U, T, 'udi')"]),
  pagemtimes: H2('Page-wise matrix multiplication.', '페이지별 행렬 곱.', ['Z = pagemtimes(X, Y)', "Z = pagemtimes(X, 'transpose', Y, 'none')"]),
  pagetranspose: H2('Page-wise transpose.', '페이지별 전치.', ['Y = pagetranspose(X)']),
  pagectranspose: H2('Page-wise complex conjugate transpose.', '페이지별 켤레 전치.', ['Y = pagectranspose(X)']),
  pagemldivide: H2('Page-wise left matrix division.', '페이지별 왼쪽 행렬 나눗셈.', ['Z = pagemldivide(X, Y)']),
  pagemrdivide: H2('Page-wise right matrix division.', '페이지별 오른쪽 행렬 나눗셈.', ['Z = pagemrdivide(X, Y)']),
  pageinv: H2('Page-wise matrix inverse.', '페이지별 역행렬.', ['Y = pageinv(X)']),
  pagesvd: H2('Page-wise singular value decomposition.', '페이지별 특이값 분해.', ['S = pagesvd(X)', '[U, S, V] = pagesvd(X)', "[...] = pagesvd(X, 'econ')"]),
  pageeig: H2('Page-wise eigenvalues and eigenvectors.', '페이지별 고유값과 고유벡터.', ['D = pageeig(X)', '[V, D] = pageeig(X)']),
  pagenorm: H2('Page-wise matrix or vector norm.', '페이지별 행렬 또는 벡터 노름.', ['N = pagenorm(X)', 'N = pagenorm(X, p)']),
  tensorprod: H2('Tensor products between two arrays (contraction over dimensions).', '두 배열의 텐서 곱 (차원 축약).', ['C = tensorprod(A, B, dimA, dimB)', 'C = tensorprod(A, B, dim)', 'C = tensorprod(A, B)', "C = tensorprod(A, B, 'all')"]),
  qrupdate: H2('QR factorization of A + u*v\' from the factors of A.', "A + u*v' 의 QR 분해 (A 의 인수로부터).", ["[Q1, R1] = qrupdate(Q, R, u, v)"]),
  qrinsert: H2('QR factorization after inserting a column or row.', '열 또는 행 삽입 후 QR 분해.', ['[Q1, R1] = qrinsert(Q, R, j, x)', "[Q1, R1] = qrinsert(Q, R, j, x, 'row')"]),
  qrdelete: H2('QR factorization after deleting a column or row.', '열 또는 행 삭제 후 QR 분해.', ['[Q1, R1] = qrdelete(Q, R, j)', "[Q1, R1] = qrdelete(Q, R, j, 'row')"]),
};
