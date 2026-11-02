// Octave-compatible polynomial and piecewise-polynomial functions:
// mpoles, padecoef, polyaffine, polygcd, polyout, polyreduce, ppder, ppint,
// ppjumps, splinefit, fftconv.
import { tensor, prod, num, str, toNum, isStruct, isText, toStr } from '../../../value.js';
import { E, F, H, isEmptyV, sfield, fmtG } from '../_util.js';
import * as K from '../_kernels.js';
import { svdNull } from '../optim/common.js';
import { T, txt, colV, rowV, mat, likeVec } from './_h.js';

// ------------------------------------------------------------ roots and polynomials
function mpoles(args, nargout) {
  if (args.length < 1 || args.length > 3) throw E('mpoles:nargin', 'mpoles: expected mpoles(p, tol, reorder).');
  const t = T(args[0], 'mpoles');
  const tol = args.length > 1 && !isEmptyV(args[1]) ? toNum(args[1]) : 0.001;
  const reorder = args.length > 2 && !isEmptyV(args[2]) ? toNum(args[2]) !== 0 : true;
  const Np = t.re.length;
  const pr = Array.from(t.re), pi = t.im ? Array.from(t.im) : new Array(Np).fill(0);
  const absP = pr.map((r, i) => Math.hypot(r, pi[i]));
  let ordr = Array.from({ length: Np }, (_, i) => i);
  // largest magnitude first; equal magnitudes keep the reverse of their input order
  if (reorder) ordr.sort((a, b) => absP[b] - absP[a] || b - a);
  const qr = ordr.map((i) => pr[i]), qi = ordr.map((i) => pi[i]), qa = ordr.map((i) => absP[i]);
  const multp = new Array(Np).fill(0); const indx = [];
  const used = new Array(Np).fill(false);
  let n = multp.findIndex((m) => m === 0);
  while (n >= 0) {
    let p0;
    if (qa[n] === 0) {
      const nz = qa.filter((a) => a > 0 && Number.isFinite(a));
      p0 = nz.length ? nz.reduce((s, a) => s + a, 0) / nz.length : 1;
    } else p0 = qa[n];
    const k = [];
    for (let j = 0; j < Np; j++) if (!used[j] && Math.hypot(qr[j] - qr[n], qi[j] - qi[n]) < tol * p0) k.push(j);
    if (!k.length) k.push(n);
    k.forEach((j, m) => { multp[j] = m + 1; used[j] = true; indx.push(j); });
    n = multp.findIndex((m) => m === 0);
  }
  const mOut = colV(indx.map((j) => multp[j]));
  const iOut = colV(indx.map((j) => ordr[j] + 1));
  return nargout >= 2 ? [mOut, iOut] : mOut;
}
function padecoef(args, nargout) {
  if (args.length < 1 || args.length > 2) throw E('padecoef:nargin', 'padecoef: expected padecoef(T, N).');
  const Tt = toNum(args[0]);
  const N = args.length > 1 && !isEmptyV(args[1]) ? Math.round(toNum(args[1])) : 1;
  if (!(Tt >= 0)) throw E('padecoef:badT', 'padecoef: T must be a non-negative scalar.');
  if (!(N >= 0)) throw E('padecoef:badN', 'padecoef: N must be a non-negative scalar.');
  // c_k = (2N-k)! N! / ((2N)! k! (N-k)!)
  const lf = (x) => K.gammaln(x + 1);
  const c = []; for (let k = 0; k <= N; k++) c.push(Math.exp(lf(2 * N - k) + lf(N) - lf(2 * N) - lf(k) - lf(N - k)));
  const den = [], nm = [];
  for (let k = N; k >= 0; k--) { const v = c[k] * Tt ** k; den.push(v); nm.push((k % 2 ? -1 : 1) * v); }
  const s = den[0];
  const numer = rowV(nm.map((v) => v / s)), denom = rowV(den.map((v) => v / s));
  return nargout >= 2 ? [numer, denom] : numer;
}
function polyaffine(args) {
  if (args.length !== 2) throw E('polyaffine:nargin', 'polyaffine: expected polyaffine(f, mu).');
  const f = Array.from(F(args[0])); const mu = Array.from(F(args[1]));
  if (mu.length !== 2) throw E('polyaffine:badMu', 'polyaffine: MU must be a two-element vector.');
  if (mu[1] === 0) throw E('polyaffine:badMu', 'polyaffine: MU(2) must be nonzero.');
  // g(x) = f((x - mu1)/mu2), Horner with polynomial arithmetic
  const lin = [1 / mu[1], -mu[0] / mu[1]];
  let g = [0];
  for (const c of f) { g = K.conv(g, lin); g[g.length - 1] += c; }
  g = g.slice(g.length - f.length);
  return likeVec(args[0], g);
}
/** Polynomial division b / a (descending). Returns {q, r} with r of length(b). */
function deconv(b, a) {
  const nb = b.length, na = a.length;
  if (na > nb) return { q: [0], r: b.slice() };
  const r = b.slice(); const q = new Array(nb - na + 1).fill(0);
  for (let i = 0; i <= nb - na; i++) {
    const c = r[i] / a[0]; q[i] = c;
    for (let j = 0; j < na; j++) r[i + j] -= c * a[j];
  }
  return { q, r };
}
function polygcd(args) {
  if (args.length < 2 || args.length > 3) throw E('polygcd:nargin', 'polygcd: expected polygcd(b, a, tol).');
  let b = Array.from(F(args[0])), a = Array.from(F(args[1]));
  const tol = args.length > 2 && !isEmptyV(args[2]) ? toNum(args[2]) : Math.sqrt(2.220446049250313e-16);
  if (a.length === 1 || b.length === 1) {
    if (a.length === 1 && a[0] === 0) return likeVec(args[0], b);
    if (b.length === 1 && b[0] === 0) return likeVec(args[1], a);
    return num(1);
  }
  const strip = (p) => { const i = p.findIndex((x) => x !== 0); return i < 0 ? [0] : p.slice(i); };
  a = strip(a); b = strip(b);
  a = a.map((v) => v / a[0]);
  for (let it = 0; it < 1000; it++) {
    const { r } = deconv(b, a);
    const nz = r.findIndex((x) => Math.abs(x) > tol);
    if (nz < 0) return rowV(a);
    const rr = r.slice(nz);
    b = a; a = rr.map((v) => v / rr[0]);
  }
  return rowV(a);
}
function coeffText(re, im) {
  if (im) {
    if (re) return `${fmtG(re, 5)}${im < 0 ? '-' : '+'}${fmtG(Math.abs(im), 5)}i`;
    return `${fmtG(im, 5)}i`;
  }
  return fmtG(re, 5);
}
function polyout(args, nargout, ctx) {
  if (args.length < 1 || args.length > 2) throw E('polyout:nargin', 'polyout: expected polyout(c, x).');
  const t = T(args[0], 'polyout');
  const x = args.length > 1 ? (isText(args[1]) ? toStr(args[1]) : null) : 's';
  if (x === null) throw E('polyout:badX', 'polyout: X must be a string.');
  const n = t.re.length;
  let s;
  if (n > 0) {
    s = coeffText(t.re[0], t.im ? t.im[0] : 0);
    for (let i = 1; i < n; i++) {
      let re = t.re[i], im = t.im ? t.im[i] : 0; let ns = ' + ';
      if (re < 0) { ns = ' - '; re = -re; im = -im; }
      s = `${s}*${x}^${n - i}${ns}${coeffText(re, im)}`;
    }
  } else s = ' ';
  if (nargout === 0) { ctx.out(s + '\n'); return undefined; }
  return str(s);
}
function polyreduce(args) {
  if (args.length !== 1) throw E('polyreduce:nargin', 'polyreduce: one input is required.');
  const t = T(args[0], 'polyreduce');
  const n = t.re.length;
  if (!n) return t;
  let idx = -1; for (let i = 0; i < n; i++) if (t.re[i] !== 0 || (t.im && t.im[i] !== 0)) { idx = i; break; }
  if (idx < 0) return num(0);
  const re = t.re.slice(idx), im = t.im ? t.im.slice(idx) : null;
  const row = t.dims[0] === 1;
  return tensor('double', row ? [1, re.length] : [re.length, 1], re, im);
}

// ------------------------------------------------------------ piecewise polynomials
function unpp(v, fn) {
  if (!isStruct(v)) throw E(`${fn}:badPP`, `${fn}: PP must be a piecewise polynomial structure.`);
  const form = sfield(v, 'form');
  if (form && isText(form) && toStr(form) !== 'pp') throw E(`${fn}:badPP`, `${fn}: PP must be a piecewise polynomial structure.`);
  const x = Array.from(F(sfield(v, 'breaks')));
  const n = x.length - 1;
  const k = toNum(sfield(v, 'order'));
  const d = Array.from(F(sfield(v, 'dim')));
  const D = d.reduce((a, b) => a * b, 1);
  const c = F(sfield(v, 'coefs')); // (D*n) × k column-major
  const rows = D * n;
  const P = []; for (let r = 0; r < rows; r++) { const row = new Array(k); for (let j = 0; j < k; j++) row[j] = c[r + j * rows]; P.push(row); }
  return { x, n, k, d, D, P };
}
const mkpp = (ctx, x, P, d) => ctx.call('mkpp', [rowV(x), mat(P, P.length, P.length ? P[0].length : 0), rowV(d)], 1)[0];
function ppder(args, nargout, ctx) {
  if (args.length < 1 || args.length > 2) throw E('ppder:nargin', 'ppder: expected ppder(pp, m).');
  const { x, k, d, D, P } = unpp(args[0], 'ppder');
  const m = args.length > 1 ? Math.round(toNum(args[1])) : 1;
  if (!(m >= 0)) throw E('ppder:badM', 'ppder: M must be a non-negative integer.');
  if (k - m <= 0) return mkpp(ctx, [x[0], x[x.length - 1]], Array.from({ length: D }, () => [0]), d);
  const ff = []; for (let j = 0; j < k - m; j++) { const p = k - 1 - j; let f = 1; for (let i = 0; i < m; i++) f *= p - i; ff.push(f); }
  const Q = P.map((row) => ff.map((f, j) => row[j] * f));
  return mkpp(ctx, x, Q, d);
}
function ppint(args, nargout, ctx) {
  if (args.length < 1 || args.length > 2) throw E('ppint:nargin', 'ppint: expected ppint(pp, c).');
  const { x, n, k, d, D, P } = unpp(args[0], 'ppint');
  const cv = args.length > 1 ? Array.from(F(args[1])) : [0];
  const Q = P.map((row) => [...row.map((v, j) => v / (k - j)), 0]);
  for (let di = 0; di < D; di++) {
    let acc = cv.length === D ? cv[di] : cv[0];
    for (let i = 0; i < n; i++) {
      const r = di + D * i;
      Q[r][k] = acc;
      acc = K.polyval(Q[r], x[i + 1] - x[i]);
    }
  }
  return mkpp(ctx, x, Q, d);
}
function ppjumps(args) {
  if (args.length !== 1) throw E('ppjumps:nargin', 'ppjumps: one input is required.');
  const { x, n, k, d, D, P } = unpp(args[0], 'ppjumps');
  const J = new Float64Array(D * Math.max(0, n - 1));
  for (let i = 0; i + 1 < n; i++) for (let di = 0; di < D; di++) {
    const left = K.polyval(P[di + D * i], x[i + 1] - x[i]);
    J[di + D * i] = P[di + D * (i + 1)][k - 1] - left;
  }
  const dims = D === 1 && d.length === 1 ? [1, n - 1] : [...d, n - 1];
  return tensor('double', dims.length < 2 ? [dims[0], 1] : dims, J);
}

/** Least-squares spline fit with continuity, periodicity and point constraints. */
function splinefit(args, nargout, ctx) {
  if (args.length < 3) throw E('splinefit:nargin', 'splinefit: expected splinefit(x, y, breaks, ...).');
  const x = Array.from(F(args[0]));
  const yt = T(args[1], 'splinefit');
  const m = x.length;
  let ydims = yt.dims.slice();
  const isVecY = ydims.length === 2 && (ydims[0] === 1 || ydims[1] === 1);
  let D, dOut;
  if (isVecY) { if (yt.re.length !== m) throw E('splinefit:sizeMismatch', 'splinefit: X and Y must have the same length.'); D = 1; dOut = [1]; }
  else {
    if (ydims[ydims.length - 1] !== m) throw E('splinefit:sizeMismatch', 'splinefit: the last dimension of Y must match the length of X.');
    dOut = ydims.slice(0, -1); D = prod(dOut);
  }
  // breaks
  let br = Array.from(F(args[2]));
  if (br.length === 1) {
    const p = Math.round(br[0]);
    if (!(p >= 1)) throw E('splinefit:badBreaks', 'splinefit: the number of pieces must be a positive integer.');
    const lo = Math.min(...x), hi = Math.max(...x);
    br = Array.from({ length: p + 1 }, (_, i) => lo + (hi - lo) * i / p);
  }
  br = [...new Set(br)].sort((a, b) => a - b);
  if (br.length < 2) throw E('splinefit:badBreaks', 'splinefit: at least two distinct breaks are needed.');
  // options
  let order = 3, periodic = false, beta = 0, cons = null;
  for (let i = 3; i < args.length; i += 2) {
    const k = txt(args[i]);
    if (!k || i + 1 >= args.length) throw E('splinefit:badOption', 'splinefit: options must be name/value pairs.');
    const v = args[i + 1];
    if (k === 'order') order = Math.round(toNum(v));
    else if (k === 'periodic') periodic = toNum(v) !== 0;
    else if (k === 'robust') { if (toNum(v) !== 0 && beta === 0) beta = 0.5; }
    else if (k === 'beta') beta = toNum(v);
    else if (k === 'constraints') cons = v;
    else throw E('splinefit:badOption', `splinefit: unknown option '${toStr(args[i])}'.`);
  }
  if (!(order >= 0)) throw E('splinefit:badOrder', 'splinefit: ORDER must be a non-negative integer.');
  if (!(beta >= 0 && beta < 1)) throw E('splinefit:badBeta', 'splinefit: BETA must be in [0, 1).');
  const np = br.length - 1, kk = order + 1, N = np * kk;
  const hs = br.slice(1).map((b, i) => b - br[i]);
  const pieceOf = (xv) => { let lo = 0, hi = np - 1; while (lo < hi) { const c = (lo + hi + 1) >> 1; if (xv >= br[c]) lo = c; else hi = c - 1; } return lo; };
  /** Row of coefficients for derivative r at x (scaled basis t = (x - b_i)/h_i, power p in column i*kk + p). */
  const derivRow = (xv, r, piece = pieceOf(xv), atT = null) => {
    const row = new Array(N).fill(0);
    const h = hs[piece]; const t = atT ?? (xv - br[piece]) / h;
    for (let p = r; p < kk; p++) { let f = 1; for (let q = 0; q < r; q++) f *= p - q; row[piece * kk + p] = f * t ** (p - r) / h ** r; }
    return row;
  };
  // equality constraints: continuity, periodicity, user constraints
  const C = [], dvals = []; // dvals: per row array of D values
  for (let i = 0; i + 1 < np; i++) for (let r = 0; r < order; r++) {
    const a = derivRow(0, r, i, 1), b = derivRow(0, r, i + 1, 0);
    C.push(a.map((v, j) => v - b[j])); dvals.push(new Array(D).fill(0));
  }
  if (periodic) for (let r = 0; r < order; r++) {
    const a = derivRow(0, r, np - 1, 1), b = derivRow(0, r, 0, 0);
    C.push(a.map((v, j) => v - b[j])); dvals.push(new Array(D).fill(0));
  }
  if (cons && !isEmptyV(cons)) {
    if (!isStruct(cons)) throw E('splinefit:badConstraints', 'splinefit: CONSTRAINTS must be a structure with fields xc, yc and cc.');
    const xc = Array.from(F(sfield(cons, 'xc')));
    const ycv = sfield(cons, 'yc'); const ccv = sfield(cons, 'cc');
    const nc = xc.length;
    const yc = ycv && !isEmptyV(ycv) ? F(ycv) : new Float64Array(D * nc);
    let cc; let ncr = 1;
    if (ccv && !isEmptyV(ccv)) { const ct = T(ccv, 'splinefit'); ncr = ct.dims[0]; cc = ct.re; if (ct.dims[1] !== nc && !(nc === 1 && ct.re.length === ncr)) throw E('splinefit:badConstraints', 'splinefit: CC must have one column per constraint point.'); }
    else cc = new Float64Array(nc).fill(1);
    if (ncr > kk) throw E('splinefit:badConstraints', 'splinefit: too many derivative rows in CC for the spline order.');
    for (let j = 0; j < nc; j++) {
      const row = new Array(N).fill(0);
      for (let r = 0; r < ncr; r++) { const w = cc[r + ncr * j]; if (!w) continue; const dr = derivRow(xc[j], r); for (let q = 0; q < N; q++) row[q] += w * dr[q]; }
      C.push(row);
      dvals.push(Array.from({ length: D }, (_, di) => (yc.length === nc ? yc[j] : yc[di + D * j])));
    }
  }
  // data matrix
  const Arows = x.map((xv) => derivRow(xv, 0));
  const Y = Array.from({ length: m }, (_, i) => Array.from({ length: D }, (_, di) => (isVecY ? yt.re[i] : yt.re[di + D * i])));
  // particular solution and null space of C
  let Z, ap;
  if (C.length) {
    const Cp = K.pinv(C);
    ap = Array.from({ length: D }, (_, di) => K.mulv(Cp, dvals.map((r) => r[di])));
    Z = svdNull(C, N); // array of N-vectors
  } else { ap = Array.from({ length: D }, () => new Array(N).fill(0)); Z = Array.from({ length: N }, (_, j) => { const e = new Array(N).fill(0); e[j] = 1; return e; }); }
  const nz = Z.length;
  const MZ = Arows.map((r) => Z.map((z) => K.dot(r, z)));
  const coefs = Array.from({ length: D }, () => new Array(N).fill(0));
  for (let di = 0; di < D; di++) {
    const base = Arows.map((r) => K.dot(r, ap[di]));
    const rhs = Y.map((yrow, i) => yrow[di] - base[i]);
    let w = new Array(m).fill(1);
    let z = new Array(nz).fill(0);
    const iters = beta > 0 ? 30 : 1;
    for (let it = 0; it < iters; it++) {
      const G = K.zerosM(nz, nz), g = new Array(nz).fill(0);
      for (let i = 0; i < m; i++) { const r = MZ[i], wi = w[i]; for (let a = 0; a < nz; a++) { if (!r[a]) continue; g[a] += wi * r[a] * rhs[i]; for (let b = 0; b < nz; b++) G[a][b] += wi * r[a] * r[b]; } }
      z = nz ? K.lstsq(G, g) : [];
      if (beta > 0) {
        const res = MZ.map((r, i) => K.dot(r, z) - rhs[i]);
        const sc = res.map(Math.abs).sort((a, b) => a - b)[Math.floor(m / 2)] || 1;
        const del = 1e-6 * Math.max(sc, 1e-300);
        const p = 2 * (1 - beta);
        w = res.map((r) => (r * r + del * del) ** ((p - 2) / 2));
      }
    }
    for (let q = 0; q < N; q++) { let s = ap[di][q]; for (let a = 0; a < nz; a++) s += Z[a][q] * z[a]; coefs[di][q] = s; }
  }
  // pp coefficients: unscale (t^p / h^p) and order descending
  const P = [];
  for (let i = 0; i < np; i++) for (let di = 0; di < D; di++) {
    const row = new Array(kk);
    for (let p = 0; p < kk; p++) row[kk - 1 - p] = coefs[di][i * kk + p] / hs[i] ** p;
    P.push(row);
  }
  return mkpp(ctx, br, P, dOut);
}

// ------------------------------------------------------------ fftconv
function fftconv(args) {
  if (args.length < 2 || args.length > 3) throw E('fftconv:nargin', 'fftconv: expected fftconv(x, y, n).');
  const x = T(args[0], 'fftconv'), y = T(args[1], 'fftconv');
  const isVec = (t) => t.dims.length === 2 && (t.dims[0] === 1 || t.dims[1] === 1);
  if (!isVec(x) && x.re.length) throw E('fftconv:notVector', 'fftconv: both A and B must be vectors.');
  if (!isVec(y) && y.re.length) throw E('fftconv:notVector', 'fftconv: both A and B must be vectors.');
  const la = x.re.length, lb = y.re.length;
  if (!la || !lb) return tensor('double', [0, 0], new Float64Array(0));
  const lt = la + lb - 1;
  let N = lt;
  if (args.length > 2 && !isEmptyV(args[2])) { const n = toNum(args[2]); N = Math.max(lt, 2 ** Math.ceil(Math.log2(Math.max(1, n)))); }
  const pad = (t) => { const re = new Float64Array(N), im = new Float64Array(N); re.set(t.re); if (t.im) im.set(t.im); return [re, im]; };
  const [ar, ai] = pad(x), [br, bi] = pad(y);
  const A = K.fft(ar, ai), B = K.fft(br, bi);
  const pr = new Float64Array(N), pim = new Float64Array(N);
  for (let k = 0; k < N; k++) { pr[k] = A.re[k] * B.re[k] - A.im[k] * B.im[k]; pim[k] = A.re[k] * B.im[k] + A.im[k] * B.re[k]; }
  const c = K.fft(pr, pim, true);
  const real = !x.im && !y.im;
  const re = c.re.slice(0, lt), im = real ? null : c.im.slice(0, lt);
  const row = la === 1 ? y.dims[0] === 1 : x.dims[0] === 1;
  return tensor('double', row ? [1, lt] : [lt, 1], re, im && im.some((v) => v !== 0) ? im : null);
}

export const builtins = { mpoles, padecoef, polyaffine, polygcd, polyout, polyreduce, ppder, ppint, ppjumps, splinefit, fftconv };

export const help = {
  mpoles: H('Identify the multiplicity of poles: groups poles closer than TOL (relative) and returns the multiplicity index and the ordering.', '극점의 중복도를 찾습니다. 상대 거리 TOL 이내의 극점을 묶고 중복 번호와 순서를 돌려줍니다.', ['multp = mpoles(p)', '[multp, idxp] = mpoles(p, tol, reorder)']),
  padecoef: H('Padé approximant coefficients of the time delay exp(−sT) of order N (descending powers, monic denominator).', '시간 지연 exp(−sT) 의 N 차 파데 근사 계수 (내림차순, 분모 최고차 계수 1).', ['[num, den] = padecoef(T)', '[num, den] = padecoef(T, N)']),
  polyaffine: H('Affine transform of the polynomial variable: g(x) = f((x − mu(1)) / mu(2)).', '다항식 변수의 아핀 변환 g(x) = f((x − mu(1)) / mu(2)).', ['g = polyaffine(f, mu)']),
  polygcd: H('Greatest common divisor of two polynomials (monic), using a remainder tolerance.', '두 다항식의 최대공약수 (최고차 계수 1), 나머지 허용 오차 사용.', ['q = polygcd(b, a)', 'q = polygcd(b, a, tol)']),
  polyout: H('Display or return a polynomial as text, e.g. 1*s^2 + 2*s^1 + 3.', '다항식을 1*s^2 + 2*s^1 + 3 형태의 문자열로 표시하거나 돌려줍니다.', ['polyout(c)', 'polyout(c, x)', 'str = polyout(...)']),
  polyreduce: H('Remove leading zero coefficients of a polynomial.', '다항식 앞쪽의 0 계수를 제거합니다.', ['p = polyreduce(c)']),
  ppder: H('Derivative of order M (default 1) of a piecewise polynomial.', '구간별 다항식의 M 차 도함수 (기본 1).', ['ppd = ppder(pp)', 'ppd = ppder(pp, m)']),
  ppint: H('Antiderivative of a piecewise polynomial, continuous, with value C at the first break.', '구간별 다항식의 연속 부정적분 (첫 분할점에서 값 C).', ['ppi = ppint(pp)', 'ppi = ppint(pp, c)']),
  ppjumps: H('Jumps of a piecewise polynomial at its interior breaks (right limit minus left limit).', '구간별 다항식의 내부 분할점에서의 불연속 크기 (오른쪽 극한 − 왼쪽 극한).', ['jumps = ppjumps(pp)']),
  splinefit: H('Least-squares spline fit with given breaks (or number of pieces); options order, periodic, robust, beta, constraints (struct xc, yc, cc).', '주어진 분할점(또는 조각 수)으로 최소제곱 스플라인 맞춤. 옵션 order, periodic, robust, beta, constraints(xc, yc, cc 구조체).', ['pp = splinefit(x, y, breaks)', 'pp = splinefit(x, y, p)', 'pp = splinefit(..., "order", k, "periodic", tf, "robust", tf, "beta", b, "constraints", s)']),
  fftconv: H('Convolution of two vectors computed with the FFT.', 'FFT 로 계산한 두 벡터의 컨볼루션.', ['c = fftconv(x, y)', 'c = fftconv(x, y, n)']),
};
