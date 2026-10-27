// Internal linear time-invariant (LTI) model math of the control submodule.
// Plain JS models (no Values):
//   TF  { type:'tf',  ny, nu, num[i][j]: number[], den[i][j]: number[], Ts, meta }
//   ZPK { type:'zpk', ny, nu, z[i][j]: {re[], im[]}, p[i][j]: {re[], im[]}, k[i][j]: number, Ts, meta }
//   SS  { type:'ss',  n, ny, nu, A, B, C, D (row arrays), E (null or rows), Ts, meta }
//   FRD { type:'frd', ny, nu, freq: number[], R[i][j]: {re[], im[]}, Ts, meta }
// Polynomials are coefficient arrays in descending powers. Ts: 0 continuous,
// -1 discrete with unspecified sample time, > 0 discrete. A model with
// meta.isStatic adopts the sample time of the model it is combined with.
import * as K from '../_kernels.js';
import { E } from '../_util.js';

export const EPSV = 2.220446049250313e-16;

// ------------------------------------------------------------ complex helpers
export const cmul = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
export const cdiv = (ar, ai, br, bi) => {
  if (Math.abs(br) >= Math.abs(bi)) { const r = bi / br, d = br + bi * r; return [(ar + ai * r) / d, (ai - ar * r) / d]; }
  const r = br / bi, d = br * r + bi; return [(ar * r + ai) / d, (ai * r - ar) / d];
};
export const cabs = (r, i) => Math.hypot(r, i);

/** Complex LU factorization (partial pivoting) of n×n (Mr + i Mi), in place copies. */
export function cluFactor(Mr, Mi) {
  const n = Mr.length; const R = Mr.map((r) => r.slice()), I = Mi.map((r) => r.slice()); const piv = Array.from({ length: n }, (_, i) => i);
  let singular = false;
  for (let k = 0; k < n; k++) {
    let p = k, mx = cabs(R[k][k], I[k][k]);
    for (let i = k + 1; i < n; i++) { const a = cabs(R[i][k], I[i][k]); if (a > mx) { mx = a; p = i; } }
    if (p !== k) { [R[p], R[k]] = [R[k], R[p]]; [I[p], I[k]] = [I[k], I[p]]; [piv[p], piv[k]] = [piv[k], piv[p]]; }
    if (mx === 0) { singular = true; continue; }
    for (let i = k + 1; i < n; i++) {
      const [fr, fi] = cdiv(R[i][k], I[i][k], R[k][k], I[k][k]); R[i][k] = fr; I[i][k] = fi;
      if (fr === 0 && fi === 0) continue;
      for (let j = k + 1; j < n; j++) { R[i][j] -= fr * R[k][j] - fi * I[k][j]; I[i][j] -= fr * I[k][j] + fi * R[k][j]; }
    }
  }
  return { R, I, piv, singular };
}
export function cluSolve(F, br, bi) {
  const { R, I, piv } = F; const n = R.length;
  const xr = piv.map((p) => br[p]), xi = piv.map((p) => (bi ? bi[p] : 0));
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) { xr[i] -= R[i][j] * xr[j] - I[i][j] * xi[j]; xi[i] -= R[i][j] * xi[j] + I[i][j] * xr[j]; }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) { xr[i] -= R[i][j] * xr[j] - I[i][j] * xi[j]; xi[i] -= R[i][j] * xi[j] + I[i][j] * xr[j]; }
    const [a, b] = cdiv(xr[i], xi[i], R[i][i], I[i][i]); xr[i] = a; xi[i] = b;
  }
  return [xr, xi];
}
/** Complex determinant. */
export function cdet(Mr, Mi) {
  const n = Mr.length; if (!n) return [1, 0];
  const F = cluFactor(Mr, Mi); let dr = 1, di = 0;
  let swaps = 0; const p = F.piv.slice();
  for (let i = 0; i < n; i++) while (p[i] !== i) { const t = p[i]; [p[i], p[t]] = [p[t], p[i]]; swaps++; }
  for (let i = 0; i < n; i++) [dr, di] = cmul(dr, di, F.R[i][i], F.I[i][i]);
  return swaps % 2 ? [-dr, -di] : [dr, di];
}

// ------------------------------------------------------------ polynomial helpers
export function trimLead(p) { let i = 0; while (i < p.length - 1 && p[i] === 0) i++; return p.slice(i); }
export function padTo(p, n) { return p.length >= n ? p.slice() : [...new Array(n - p.length).fill(0), ...p]; }
export function polyAdd(a, b, sb = 1) { const n = Math.max(a.length, b.length); const A = padTo(a, n), B = padTo(b, n); return A.map((x, i) => x + sb * B[i]); }
export const polyMul = (a, b) => K.conv(a, b);
export const polyScale = (a, s) => a.map((x) => x * s);
export const isZeroPoly = (p) => p.every((x) => x === 0);
/** Real polynomial from complex roots (conjugate pairs assumed). */
export function polyFromRoots(re, im) { return K.poly(re, im); }
/** Roots of a polynomial as {re, im}, empty for constants. */
export function rootsOf(p) { const q = trimLead(p); if (q.length <= 1) return { re: [], im: [] }; return K.roots(q); }
/** Deflate p by (x - 1) when p(1)=0 (exact synthetic division). */
function deflate(p, r) { const q = []; let acc = 0; for (let i = 0; i < p.length - 1; i++) { acc = acc * r + p[i]; q.push(acc); } return q; }
/** Value of n(x)/d(x) at real x (0 or 1), cancelling common roots at x. */
export function ratioAt(n, d, x) {
  let a = trimLead(n), b = trimLead(d);
  for (let it = 0; it < 64; it++) {
    const na = K.polyval(a, x), nb = K.polyval(b, x);
    const sa = Math.max(1e-300, ...a.map(Math.abs)) * 1e-12, sb = Math.max(1e-300, ...b.map(Math.abs)) * 1e-12;
    const za = Math.abs(na) <= sa, zb = Math.abs(nb) <= sb;
    if (!zb) return (za ? 0 : na) / nb;
    if (za && a.length > 1 && b.length > 1) { a = deflate(a, x); b = deflate(b, x); continue; }
    if (za && isZeroPoly(a)) return 0;
    return na === 0 && za ? NaN : (na > 0 ? Infinity : -Infinity);
  }
  return NaN;
}

// ------------------------------------------------------------ meta (names, delays)
export function fixMeta(meta, ny, nu, n = 0) {
  const m = { Name: '', Notes: [], UserData: null, TimeUnit: 'seconds', Variable: null, ...(meta || {}) };
  const fit = (a, len, fillv) => { const r = Array.isArray(a) ? a.slice(0, len) : []; while (r.length < len) r.push(fillv); return r; };
  m.InputName = fit(m.InputName, nu, ''); m.OutputName = fit(m.OutputName, ny, ''); m.StateName = fit(m.StateName, n, '');
  m.InputUnit = fit(m.InputUnit, nu, ''); m.OutputUnit = fit(m.OutputUnit, ny, ''); m.StateUnit = fit(m.StateUnit, n, '');
  m.InputDelay = fit(m.InputDelay, nu, 0); m.OutputDelay = fit(m.OutputDelay, ny, 0);
  const io = []; for (let i = 0; i < ny; i++) { io.push([]); for (let j = 0; j < nu; j++) io[i].push(m.IODelay && m.IODelay[i] && m.IODelay[i][j] != null ? m.IODelay[i][j] : 0); }
  m.IODelay = io;
  return m;
}
export const hasDelay = (m) => m.meta.InputDelay.some((x) => x) || m.meta.OutputDelay.some((x) => x) || m.meta.IODelay.some((r) => r.some((x) => x));
export const totalDelay = (m, i, j) => m.meta.InputDelay[j] + m.meta.OutputDelay[i] + m.meta.IODelay[i][j];
/** Meta without the dynamic-specific info (for results of interconnections). */
export function plainMeta(src, ny, nu, n = 0, keep = {}) {
  const m = { TimeUnit: src && src.TimeUnit || 'seconds', Variable: src && src.Variable || null };
  if (keep.InputName) m.InputName = keep.InputName; if (keep.OutputName) m.OutputName = keep.OutputName; if (keep.StateName) m.StateName = keep.StateName;
  if (keep.InputDelay) m.InputDelay = keep.InputDelay; if (keep.OutputDelay) m.OutputDelay = keep.OutputDelay; if (keep.IODelay) m.IODelay = keep.IODelay;
  return fixMeta(m, ny, nu, n);
}

// ------------------------------------------------------------ constructors
export function mkTF(num, den, Ts = 0, meta) {
  const ny = num.length, nu = ny ? num[0].length : (meta && meta.nu) || 0;
  const N = [], D = [];
  for (let i = 0; i < ny; i++) {
    N.push([]); D.push([]);
    for (let j = 0; j < nu; j++) {
      let n = num[i][j].length ? num[i][j].slice() : [0], d = den[i][j].length ? den[i][j].slice() : [1];
      if (isZeroPoly(d)) throw E('tf:zeroDen', 'The denominator must be nonzero.');
      const zinv = meta && (meta.Variable === 'z^-1' || meta.Variable === 'q^-1');
      const L = Math.max(n.length, d.length);
      if (zinv) { while (n.length < L) n.push(0); while (d.length < L) d.push(0); }
      else { n = padTo(n, L); d = padTo(d, L); }
      // remove common leading zeros (keep at least one coefficient)
      while (n.length > 1 && n[0] === 0 && d[0] === 0) { n.shift(); d.shift(); }
      N[i].push(n); D[i].push(d);
    }
  }
  return { type: 'tf', ny, nu, num: N, den: D, Ts, meta: fixMeta(meta, ny, nu) };
}
export function mkZPK(z, p, k, Ts = 0, meta) {
  const ny = k.length, nu = ny ? k[0].length : (meta && meta.nu) || 0;
  return { type: 'zpk', ny, nu, z, p, k, Ts, meta: fixMeta(meta, ny, nu) };
}
export function mkSS(A, B, C, D, Ts = 0, meta, Emat = null, dimsHint) {
  const n = A.length;
  const ny = D.length || (dimsHint ? dimsHint[0] : C.length);
  const nu = D.length ? D[0].length : (dimsHint ? dimsHint[1] : (B[0] || []).length);
  const Bf = n ? B.map((r) => (r.length ? r.slice() : new Array(nu).fill(0))) : [];
  const Cf = []; for (let i = 0; i < ny; i++) Cf.push(n ? (C[i] ? C[i].slice() : new Array(n).fill(0)) : []);
  const Df = []; for (let i = 0; i < ny; i++) Df.push(D[i] ? D[i].slice() : new Array(nu).fill(0));
  return { type: 'ss', n, ny, nu, A: A.map((r) => r.slice()), B: Bf, C: Cf, D: Df, E: Emat, Ts, meta: fixMeta(meta, ny, nu, n) };
}
export function mkFRD(R, freq, Ts = 0, meta) {
  const ny = R.length, nu = ny ? R[0].length : 0;
  return { type: 'frd', ny, nu, R, freq: freq.slice(), Ts, meta: fixMeta(meta, ny, nu), FrequencyUnit: (meta && meta.FrequencyUnit) || 'rad/TimeUnit' };
}
/** Static gain matrix (rows) as a TF model. */
export function gainTF(G, Ts = 0) {
  const m = mkTF(G.map((r) => r.map((x) => [x])), G.map((r) => r.map(() => [1])), Ts, {});
  m.meta.isStatic = true; return m;
}

// ------------------------------------------------------------ block helpers
export const zerosM = K.zerosM;
export function blkdiag(...Ms) {
  const m = Ms.reduce((s, X) => s + X.length, 0), n = Ms.reduce((s, X) => s + (X.length ? X[0].length : (X.cols || 0)), 0);
  const R = zerosM(m, n); let r0 = 0, c0 = 0;
  for (const X of Ms) { const c = X.length ? X[0].length : (X.cols || 0); for (let i = 0; i < X.length; i++) for (let j = 0; j < c; j++) R[r0 + i][c0 + j] = X[i][j]; r0 += X.length; c0 += c; }
  return R;
}
/** n×m zero matrix that remembers its column count even when it has no rows. */
export function zcols(m, n) { const Z = zerosM(m, n); Z.cols = n; return Z; }
export const cols = (X, n) => (X.length ? X[0].length : (X.cols ?? n ?? 0));
export function hcatM(m, ...Ms) { const R = []; for (let i = 0; i < m; i++) R.push(Ms.flatMap((X) => X[i] || [])); return R; }
export function vcatM(...Ms) { return Ms.flatMap((X) => X.map((r) => r.slice())); }
export function mulM(A, B, m, n) { if (!A.length || !B.length) return zerosM(m ?? A.length, n ?? cols(B)); return K.mul(A, B); }
export function addM(A, B, s = 1) { return A.map((r, i) => r.map((x, j) => x + s * B[i][j])); }
export const T = K.T;
export const eye = K.eye;

// ------------------------------------------------------------ conversions
/** Controller canonical realization of a SISO n/d (padded same length). */
function realizeSISO(num, den) {
  const d = trimLead(den);
  if (d.length === 1 && d[0] === 0) throw E('ss:zeroDen', 'Denominator is zero.');
  let nn = trimLead(num);
  if (nn.length > d.length && !isZeroPoly(nn)) throw E('ss:improper', 'Cannot convert an improper transfer function to state space.');
  nn = padTo(nn, d.length);
  const a0 = d[0]; const dn = d.map((x) => x / a0), nm = nn.map((x) => x / a0);
  const n = d.length - 1; const Dv = nm[0];
  const A = zerosM(n, n); for (let j = 0; j < n; j++) A[0][j] = -dn[j + 1]; for (let i = 1; i < n; i++) A[i][i - 1] = 1;
  const B = zerosM(n, 1); if (n) B[0][0] = 1;
  const C = [new Array(n).fill(0)]; for (let j = 0; j < n; j++) C[0][j] = nm[j + 1] - Dv * dn[j + 1];
  return { A, B, C, D: [[Dv]] };
}
function sameDen(a, b) { const x = trimLead(a), y = trimLead(b); if (x.length !== y.length) return false; const sx = x[0], sy = y[0]; return x.every((v, i) => Math.abs(v / sx - y[i] / sy) <= 1e-14 * (1 + Math.abs(v / sx))); }

export function tfToSS(m) {
  const { ny, nu } = m;
  const blocks = []; // {A, B (n×nu), C (ny×n)}
  let Dm = zerosM(ny, nu);
  for (let j = 0; j < nu; j++) {
    // common denominator in the column?
    const dens = []; for (let i = 0; i < ny; i++) if (!isZeroPoly(m.num[i][j])) dens.push(m.den[i][j]);
    const common = dens.length > 1 && dens.every((d) => sameDen(d, dens[0]));
    if (common) {
      const d0 = trimLead(dens[0]); const s0 = d0[0]; const dn = d0.map((x) => x / s0); const n = dn.length - 1;
      const A = zerosM(n, n); for (let c = 0; c < n; c++) A[0][c] = -dn[c + 1]; for (let r = 1; r < n; r++) A[r][r - 1] = 1;
      const B = zerosM(n, nu); if (n) B[0][j] = 1;
      const C = zerosM(ny, n);
      for (let i = 0; i < ny; i++) {
        if (isZeroPoly(m.num[i][j])) continue;
        const di = trimLead(m.den[i][j]); const sc = di[0];
        let nn = trimLead(m.num[i][j]).map((x) => x / sc);
        if (nn.length > n + 1) throw E('ss:improper', 'Cannot convert an improper transfer function to state space.');
        nn = padTo(nn, n + 1); Dm[i][j] = nn[0];
        for (let c = 0; c < n; c++) C[i][c] = nn[c + 1] - nn[0] * dn[c + 1];
      }
      if (n) blocks.push({ A, B, C });
    } else {
      for (let i = 0; i < ny; i++) {
        if (isZeroPoly(m.num[i][j])) continue;
        const r = realizeSISO(m.num[i][j], m.den[i][j]); Dm[i][j] = r.D[0][0];
        const n = r.A.length; if (!n) continue;
        const B = zerosM(n, nu); for (let k = 0; k < n; k++) B[k][j] = r.B[k][0];
        const C = zerosM(ny, n); C[i] = r.C[0].slice();
        blocks.push({ A: r.A, B, C });
      }
    }
  }
  const A = blkdiag(...blocks.map((b) => b.A));
  const B = vcatM(...blocks.map((b) => b.B));
  const C = hcatM(ny, ...blocks.map((b) => b.C));
  const meta = { ...m.meta }; delete meta.Variable;
  const r = mkSS(A, B, C.length ? C : zerosM(ny, 0), Dm, m.Ts, { ...meta, StateName: [] }, null, [ny, nu]);
  if (m.meta.isStatic) r.meta.isStatic = true;
  return r;
}

/** Descriptor → explicit when E is invertible. */
export function explicitSS(s) {
  if (!s.E) return s;
  const Ei = K.inv(s.E);
  return { ...s, A: K.mul(Ei, s.A), B: s.n ? K.mul(Ei, s.B) : s.B, E: null };
}

/** Coefficients of det(M(s)) for a matrix polynomial M(s) = s*Es + M0 (size N) of degree <= deg. */
function detPoly(M0, Es, deg) {
  const N = deg + 1; if (!M0.length) return [1];
  let scale = 1; for (const r of M0) for (const x of r) scale = Math.max(scale, Math.abs(x));
  const rad = Math.min(scale, 1e6);
  const vr = [], vi = [];
  for (let k = 0; k < N; k++) {
    const th = 2 * Math.PI * k / N; const sr = rad * Math.cos(th), si = rad * Math.sin(th);
    const Mr = M0.map((row, i) => row.map((x, j) => x + sr * Es[i][j])); const Mi = M0.map((row, i) => row.map((_, j) => si * Es[i][j]));
    const [dr, di] = cdet(Mr, Mi); vr.push(dr); vi.push(di);
  }
  // inverse DFT → coefficients c_m * rad^m
  const c = new Array(N).fill(0);
  let mx = 0;
  for (let mm = 0; mm < N; mm++) {
    let sr = 0; for (let k = 0; k < N; k++) { const th = -2 * Math.PI * mm * k / N; sr += vr[k] * Math.cos(th) - vi[k] * Math.sin(th); }
    c[mm] = sr / N; mx = Math.max(mx, Math.abs(c[mm]));
  }
  for (let mm = 0; mm < N; mm++) { if (Math.abs(c[mm]) <= 1e-11 * mx) c[mm] = 0; c[mm] /= rad ** mm; }
  return c.reverse(); // descending
}
/** det([sI - A, -b; c, d]) as a polynomial: numerator of c (sI-A)^-1 b + d times det(sI-A). */
function rosenbrockNum(A, b, c, d, Em) {
  const n = A.length;
  const M0 = zerosM(n + 1, n + 1), Es = zerosM(n + 1, n + 1);
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { M0[i][j] = -A[i][j]; Es[i][j] = Em ? Em[i][j] : (i === j ? 1 : 0); } M0[i][n] = -b[i]; M0[n][i] = c[i]; }
  M0[n][n] = d;
  return detPoly(M0, Es, n);
}
export function ssToTF(s0) {
  const s = explicitSS(s0); const { n, ny, nu } = s;
  const ev = n ? K.eigvals(s.A) : { re: [], im: [] };
  let den = n ? K.poly(ev.re, ev.im) : [1];
  den = den.map((x) => (Math.abs(x) < 1e-14 * Math.max(...den.map(Math.abs)) ? 0 : x));
  const num = [], dd = [];
  for (let i = 0; i < ny; i++) {
    num.push([]); dd.push([]);
    for (let j = 0; j < nu; j++) {
      if (!n) { num[i].push([s.D[i][j]]); dd[i].push([1]); continue; }
      const b = s.B.map((r) => r[j]), c = s.C[i];
      let nm = rosenbrockNum(s.A, b, c, s.D[i][j], null);
      // structurally zero path → 0
      if (b.every((x) => x === 0) || c.every((x) => x === 0)) nm = K.conv([s.D[i][j]], den);
      const mx = Math.max(...nm.map(Math.abs), Math.abs(s.D[i][j]));
      nm = nm.map((x) => (Math.abs(x) <= 1e-10 * Math.max(mx, 1e-300) ? 0 : x));
      num[i].push(padTo(nm, n + 1)); dd[i].push(den.slice());
    }
  }
  const meta = { ...s.meta, StateName: [] };
  const r = mkTF(num, dd, s.Ts, meta);
  if (s.meta.isStatic) r.meta.isStatic = true;
  return r;
}
export function tfToZPK(m) {
  const z = [], p = [], k = [];
  for (let i = 0; i < m.ny; i++) {
    z.push([]); p.push([]); k.push([]);
    for (let j = 0; j < m.nu; j++) {
      const nn = trimLead(m.num[i][j]), dd = trimLead(m.den[i][j]);
      if (isZeroPoly(nn)) { z[i].push({ re: [], im: [] }); p[i].push({ re: [], im: [] }); k[i].push(0); continue; }
      z[i].push(rootsOf(nn)); p[i].push(rootsOf(dd)); k[i].push(nn[0] / dd[0]);
    }
  }
  const meta = { ...m.meta }; if (meta.Variable === 'z^-1' || meta.Variable === 'q^-1') meta.Variable = 'z';
  const r = mkZPK(z, p, k, m.Ts, meta); if (m.meta.isStatic) r.meta.isStatic = true; return r;
}
export function zpkToTF(m) {
  const num = [], den = [];
  for (let i = 0; i < m.ny; i++) {
    num.push([]); den.push([]);
    for (let j = 0; j < m.nu; j++) {
      const zz = m.z[i][j], pp = m.p[i][j];
      let nn = K.poly(zz.re, zz.im).map((x) => x * m.k[i][j]); const dd = K.poly(pp.re, pp.im);
      if (m.k[i][j] === 0) nn = [0];
      num[i].push(nn); den[i].push(dd);
    }
  }
  const r = mkTF(num, den, m.Ts, m.meta); if (m.meta.isStatic) r.meta.isStatic = true; return r;
}
export function toTF(m) {
  if (m.type === 'tf') return m;
  if (m.type === 'zpk') return zpkToTF(m);
  if (m.type === 'ss') return ssToTF(m);
  throw E('tf:frd', 'Cannot convert frequency response data to a transfer function.');
}
export function toSS(m) {
  if (m.type === 'ss') return m;
  if (m.type === 'tf') return tfToSS(m);
  if (m.type === 'zpk') return tfToSS(zpkToTF(m));
  throw E('ss:frd', 'Cannot convert frequency response data to state space.');
}
export function toZPK(m) {
  if (m.type === 'zpk') return m;
  if (m.type === 'tf') return tfToZPK(m);
  if (m.type === 'ss') {
    // poles from eig(A) (exact), zeros and gains from the transfer function
    const t = ssToTF(m); const r = tfToZPK(t);
    return r;
  }
  throw E('zpk:frd', 'Cannot convert frequency response data to zero-pole-gain form.');
}
export function convertTo(m, type) {
  if (type === 'tf') return toTF(m);
  if (type === 'ss') return toSS(m);
  if (type === 'zpk') return toZPK(m);
  if (type === 'frd') return m;
  throw E('lti:badType', `Unknown model type '${type}'.`);
}

// ------------------------------------------------------------ poles / zeros
export function poles(m) {
  if (m.type === 'ss') { const s = explicitSS(m); return s.n ? K.eigvals(s.A) : { re: [], im: [] }; }
  if (m.type === 'zpk' && m.ny * m.nu === 1) return { re: m.p[0][0].re.slice(), im: m.p[0][0].im.slice() };
  if (m.type === 'tf' && m.ny * m.nu === 1) return rootsOf(m.den[0][0]);
  if (m.type === 'frd') return { re: [], im: [] };
  // MIMO tf/zpk: poles of a realization (minimal per entry blocks)
  return poles(tfToSS(toTF(m)));
}
/** Transmission (invariant) zeros of a square or SISO model. */
export function tzeros(m) {
  if (m.type === 'frd') return { re: [], im: [] };
  if (m.ny * m.nu === 1 && m.type !== 'ss') { if (m.type === 'zpk') return { re: m.z[0][0].re.slice(), im: m.z[0][0].im.slice() }; return isZeroPoly(m.num[0][0]) ? { re: [], im: [] } : rootsOf(m.num[0][0]); }
  const s = explicitSS(toSS(m));
  if (s.ny !== s.nu) return nonSquareZeros(s);
  const { n, ny } = s; const N = n + ny;
  const M0 = zerosM(N, N), Es = zerosM(N, N);
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { M0[i][j] = -s.A[i][j]; Es[i][j] = i === j ? 1 : 0; } for (let j = 0; j < ny; j++) M0[i][n + j] = -s.B[i][j]; }
  for (let i = 0; i < ny; i++) { for (let j = 0; j < n; j++) M0[n + i][j] = s.C[i][j]; for (let j = 0; j < ny; j++) M0[n + i][n + j] = s.D[i][j]; }
  const p = detPoly(M0, Es, n);
  if (isZeroPoly(p)) return { re: [], im: [] };
  return rootsOf(p);
}
function nonSquareZeros(s) {
  // zeros common to all entries: roots of the gcd is fragile; use the zeros of the first nonzero
  // square sub-block that are also zeros of the others (tolerance based).
  const cand = [];
  const tf = ssToTF(s);
  const lists = [];
  for (let i = 0; i < s.ny; i++) for (let j = 0; j < s.nu; j++) if (!isZeroPoly(tf.num[i][j])) lists.push(rootsOf(tf.num[i][j]));
  if (!lists.length) return { re: [], im: [] };
  const base = lists[0];
  for (let k = 0; k < base.re.length; k++) {
    const zr = base.re[k], zi = base.im[k];
    let ok = true;
    for (let i = 0; i < s.ny && ok; i++) for (let j = 0; j < s.nu && ok; j++) {
      const [vr, vi] = K.cpolyval(tf.num[i][j], zr, zi); const sc = Math.max(...tf.num[i][j].map(Math.abs)) * (1 + Math.hypot(zr, zi)) ** tf.num[i][j].length;
      if (Math.hypot(vr, vi) > 1e-6 * sc) ok = false;
    }
    if (ok) cand.push([zr, zi]);
  }
  return { re: cand.map((c) => c[0]), im: cand.map((c) => c[1]) };
}

// ------------------------------------------------------------ frequency response
/**
 * Response at complex points s (arrays sr, si): returns H[i][j] = {re: Float64Array, im: Float64Array}.
 * For discrete models pass z values. Delays are applied as exp(-s*tau) (continuous) or z^-tau.
 */
export function evalAt(m, sr, si, withDelay = true) {
  const N = sr.length; const H = [];
  for (let i = 0; i < m.ny; i++) { H.push([]); for (let j = 0; j < m.nu; j++) H[i].push({ re: new Float64Array(N), im: new Float64Array(N) }); }
  if (m.type === 'frd') throw E('frd:eval', 'Use the frequency points of the FRD model.');
  if (m.type === 'tf' || m.type === 'zpk') {
    const zinv = m.type === 'tf' && (m.meta.Variable === 'z^-1' || m.meta.Variable === 'q^-1');
    for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) {
      for (let k = 0; k < N; k++) {
        let hr, hi;
        if (m.type === 'tf') {
          const nn = m.num[i][j], dd = m.den[i][j];
          if (zinv) {
            // polynomials in z^-1 (ascending) equal descending in z when padded to the same length
            const L = Math.max(nn.length, dd.length);
            const [nr, ni] = K.cpolyval(padRight(nn, L), sr[k], si[k]); const [dr, di] = K.cpolyval(padRight(dd, L), sr[k], si[k]);
            [hr, hi] = cdiv(nr, ni, dr, di);
          } else { const [nr, ni] = K.cpolyval(nn, sr[k], si[k]); const [dr, di] = K.cpolyval(dd, sr[k], si[k]); [hr, hi] = cdiv(nr, ni, dr, di); }
        } else {
          hr = m.k[i][j]; hi = 0;
          const zz = m.z[i][j], pp = m.p[i][j];
          for (let q = 0; q < zz.re.length; q++) [hr, hi] = cmul(hr, hi, sr[k] - zz.re[q], si[k] - zz.im[q]);
          for (let q = 0; q < pp.re.length; q++) [hr, hi] = cdiv(hr, hi, sr[k] - pp.re[q], si[k] - pp.im[q]);
        }
        H[i][j].re[k] = hr; H[i][j].im[k] = hi;
      }
    }
  } else {
    const s = m; const n = s.n;
    for (let k = 0; k < N; k++) {
      if (!n) { for (let i = 0; i < s.ny; i++) for (let j = 0; j < s.nu; j++) H[i][j].re[k] = s.D[i][j]; continue; }
      const Mr = s.A.map((r, a) => r.map((x, b) => (s.E ? s.E[a][b] : a === b ? 1 : 0) * sr[k] - x));
      const Mi = s.A.map((r, a) => r.map((_, b) => (s.E ? s.E[a][b] : a === b ? 1 : 0) * si[k]));
      const F = cluFactor(Mr, Mi);
      for (let j = 0; j < s.nu; j++) {
        let xr, xi;
        if (F.singular) { xr = new Array(n).fill(Infinity); xi = new Array(n).fill(0); }
        else [xr, xi] = cluSolve(F, s.B.map((r) => r[j]), null);
        for (let i = 0; i < s.ny; i++) {
          let hr = s.D[i][j], hi = 0;
          for (let q = 0; q < n; q++) { if (s.C[i][q] === 0) continue; hr += s.C[i][q] * xr[q]; hi += s.C[i][q] * xi[q]; }
          H[i][j].re[k] = hr; H[i][j].im[k] = hi;
        }
      }
    }
  }
  if (withDelay && hasDelay(m)) {
    for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) {
      const tau = totalDelay(m, i, j); if (!tau) continue;
      for (let k = 0; k < N; k++) {
        let fr, fi;
        if (m.Ts === 0) { const a = -tau * sr[k], b = -tau * si[k]; const ea = Math.exp(a); fr = ea * Math.cos(b); fi = ea * Math.sin(b); }
        else { // z^-tau
          const r = Math.hypot(sr[k], si[k]), th = Math.atan2(si[k], sr[k]); const rr = r ** -tau; fr = rr * Math.cos(-tau * th); fi = rr * Math.sin(-tau * th);
        }
        const [a, b] = cmul(H[i][j].re[k], H[i][j].im[k], fr, fi); H[i][j].re[k] = a; H[i][j].im[k] = b;
      }
    }
  }
  return H;
}
function padRight(p, L) { const r = p.slice(); while (r.length < L) r.push(0); return r; }
/** Frequency response at real frequencies w (rad/TimeUnit). */
export function freqResp(m, w) {
  if (m.type === 'frd') {
    // interpolate onto w when different
    const same = w.length === m.freq.length && w.every((x, k) => Math.abs(x - m.freq[k]) <= 1e-12 * Math.max(1, x));
    const H = [];
    for (let i = 0; i < m.ny; i++) { H.push([]); for (let j = 0; j < m.nu; j++) {
      if (same) { H[i].push({ re: Float64Array.from(m.R[i][j].re), im: Float64Array.from(m.R[i][j].im) }); continue; }
      const re = new Float64Array(w.length), im = new Float64Array(w.length);
      for (let k = 0; k < w.length; k++) { const q = m.freq.findIndex((f) => Math.abs(f - w[k]) <= 1e-9 * Math.max(1, f)); if (q < 0) throw E('frd:freq', 'Frequency points must be a subset of the FRD frequency vector.'); re[k] = m.R[i][j].re[q]; im[k] = m.R[i][j].im[q]; }
      H[i].push({ re, im });
    } }
    return H;
  }
  const sr = new Float64Array(w.length), si = new Float64Array(w.length);
  if (m.Ts === 0) for (let k = 0; k < w.length; k++) si[k] = w[k];
  else { const Ts = m.Ts > 0 ? m.Ts : 1; for (let k = 0; k < w.length; k++) { sr[k] = Math.cos(w[k] * Ts); si[k] = Math.sin(w[k] * Ts); } }
  return evalAt(m, sr, si);
}

// ------------------------------------------------------------ matrix functions
export function expm(A) { return A.length ? K.expm(A) : []; }
/** Matrix square root by Denman–Beavers iteration. */
export function sqrtm(A) {
  const n = A.length; let Y = A.map((r) => r.slice()), Z = eye(n);
  for (let it = 0; it < 100; it++) {
    const Yi = K.inv(Y), Zi = K.inv(Z);
    const Yn = addM(Y, Zi).map((r) => r.map((x) => x / 2)); const Zn = addM(Z, Yi).map((r) => r.map((x) => x / 2));
    const d = K.normFro(addM(Yn, Y, -1)); Y = Yn; Z = Zn;
    if (d <= 1e-15 * K.normFro(Y)) break;
  }
  return Y;
}
/** Matrix logarithm (inverse scaling and squaring). */
export function logm(A) {
  const n = A.length; let X = A.map((r) => r.slice()); let k = 0; const I = eye(n);
  while (K.normFro(addM(X, I, -1)) > 0.25 && k < 40) { X = sqrtm(X); k++; }
  const Y = K.mul(addM(X, I, -1), K.inv(addM(X, I))); const Y2 = K.mul(Y, Y);
  let term = Y.map((r) => r.slice()); let S = Y.map((r) => r.slice());
  for (let j = 1; j < 60; j++) { term = K.mul(term, Y2); const f = 1 / (2 * j + 1); S = addM(S, term, f); if (K.normFro(term) * f < 1e-18) break; }
  return S.map((r) => r.map((x) => 2 * x * 2 ** k));
}
/** Kronecker product. */
export function kron(A, B) {
  const m = A.length, n = A[0].length, p = B.length, q = B[0].length; const R = zerosM(m * p, n * q);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) for (let a = 0; a < p; a++) for (let b = 0; b < q; b++) R[i * p + a][j * q + b] = A[i][j] * B[a][b];
  return R;
}
const vecM = (X) => { const m = X.length, n = X[0].length; const v = new Array(m * n); for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) v[i + j * m] = X[i][j]; return v; };
const unvec = (v, m, n) => { const X = zerosM(m, n); for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) X[i][j] = v[i + j * m]; return X; };
/** Solves A X + X B + C = 0 (Sylvester). */
export function sylvester(A, B, C) {
  const m = A.length, n = B.length;
  const M = addM(kron(eye(n), A), kron(T(B), eye(m)));
  const F = K.lu(M); if (F.singular) throw E('lyap:singular', 'The solution of this Lyapunov equation does not exist or is not unique.');
  return unvec(K.luSolve(F, vecM(C).map((x) => -x)), m, n);
}
export const lyapC = (A, Q) => { const X = sylvester(A, T(A), Q); return symmetrize(X); };
/** Solves A X A' - X + Q = 0. */
export function lyapD(A, Q, Eq = null) {
  const n = A.length; const M = addM(kron(A, A), Eq ? kron(Eq, Eq) : eye(n * n), -1);
  const F = K.lu(M); if (F.singular) throw E('dlyap:singular', 'The solution of this Lyapunov equation does not exist or is not unique.');
  return unvec(K.luSolve(F, vecM(Q).map((x) => -x)), n, n);
}
/** Discrete Sylvester A X B - X + C = 0. */
export function sylvesterD(A, B, C) {
  const m = A.length, n = B.length; const M = addM(kron(T(B), A), eye(m * n), -1);
  const F = K.lu(M); if (F.singular) throw E('dlyap:singular', 'The solution of this Sylvester equation does not exist or is not unique.');
  return unvec(K.luSolve(F, vecM(C).map((x) => -x)), m, n);
}
export const symmetrize = (X) => X.map((r, i) => r.map((x, j) => (x + X[j][i]) / 2));

/** Continuous algebraic Riccati: A'X + XA - (XB + S) R^-1 (B'X + S') + Q = 0. Returns X. */
export function careSolve(A, B, Q, R, S = null) {
  const n = A.length; const Ri = K.inv(R);
  let A1 = A, Q1 = Q;
  if (S) { A1 = addM(A, K.mul(K.mul(B, Ri), T(S)), -1); Q1 = addM(Q, K.mul(K.mul(S, Ri), T(S)), -1); }
  const G = K.mul(K.mul(B, Ri), T(B));
  // Hamiltonian sign function
  let Z = blockM([[A1, G.map((r) => r.map((x) => -x))], [Q1.map((r) => r.map((x) => -x)), T(A1).map((r) => r.map((x) => -x))]]);
  const N2 = 2 * n;
  for (let it = 0; it < 100; it++) {
    const Zi = K.inv(Z);
    const dz = Math.abs(K.det(Z)); let c = dz > 0 && Number.isFinite(dz) ? dz ** (-1 / N2) : 1; if (!Number.isFinite(c) || c <= 0) c = 1;
    const Zn = Z.map((r, i) => r.map((x, j) => 0.5 * (c * x + Zi[i][j] / c)));
    const d = K.normFro(addM(Zn, Z, -1)); Z = Zn;
    if (d <= 1e-13 * K.normFro(Z)) break;
  }
  const Z11 = Z.slice(0, n).map((r) => r.slice(0, n)), Z12 = Z.slice(0, n).map((r) => r.slice(n)), Z21 = Z.slice(n).map((r) => r.slice(0, n)), Z22 = Z.slice(n).map((r) => r.slice(n));
  const Mst = vcatM(Z12, addM(Z22, eye(n))); const Rhs = vcatM(addM(Z11, eye(n)), Z21).map((r) => r.map((x) => -x));
  let X = T(T(Rhs).map((c) => K.lstsq(Mst, c)));
  X = symmetrize(X);
  // Newton (Kleinman) refinement
  for (let it = 0; it < 4; it++) {
    const Kg = K.mul(Ri, addM(K.mul(T(B), X), S ? T(S) : zerosM(B[0].length, n)));
    const Ak = addM(A, K.mul(B, Kg), -1);
    const Qk = addM(addM(Q, K.mul(K.mul(T(Kg), R), Kg)), S ? addM(K.mul(S, Kg), K.mul(T(Kg), T(S))).map((r) => r.map((x) => -x)) : zerosM(n, n));
    try { const Xn = lyapC(T(Ak), Qk); if (Xn.every((r) => r.every(Number.isFinite))) X = Xn; } catch { break; }
  }
  return X;
}
/** Discrete algebraic Riccati: A'XA - X - (A'XB + S)(B'XB + R)^-1 (B'XA + S') + Q = 0. */
export function dareSolve(A, B, Q, R, S = null) {
  const n = A.length; const Ri = K.inv(R);
  let A1 = A, Q1 = Q;
  if (S) { A1 = addM(A, K.mul(K.mul(B, Ri), T(S)), -1); Q1 = addM(Q, K.mul(K.mul(S, Ri), T(S)), -1); }
  let Ak = A1.map((r) => r.slice()), Gk = K.mul(K.mul(B, Ri), T(B)), Hk = Q1.map((r) => r.slice());
  for (let it = 0; it < 200; it++) {
    const W = addM(eye(n), K.mul(Gk, Hk)); const Wi = K.inv(W);
    const AW = K.mul(Ak, Wi);
    const An = K.mul(AW, Ak); const Gn = addM(Gk, K.mul(K.mul(AW, Gk), T(Ak))); const Hn = addM(Hk, K.mul(K.mul(T(Ak), Hk), K.mul(Wi, Ak)));
    const d = K.normFro(addM(Hn, Hk, -1)); Ak = An; Gk = Gn; Hk = Hn;
    if (d <= 1e-14 * Math.max(1, K.normFro(Hk))) break;
  }
  return symmetrize(Hk);
}
export function blockM(rows) { return rows.flatMap((blk) => { const m = blk[0].length; const out = []; for (let i = 0; i < m; i++) out.push(blk.flatMap((X) => X[i])); return out; }); }
