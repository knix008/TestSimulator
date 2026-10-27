// Arithmetic and interconnections of LTI models (internal JS models from lti.js).
import * as K from '../_kernels.js';
import { E } from '../_util.js';
import {
  mkTF, mkZPK, mkSS, mkFRD, toTF, toSS, toZPK, convertTo, freqResp, fixMeta, plainMeta, hasDelay, totalDelay,
  polyMul, polyAdd, isZeroPoly, trimLead, zerosM, blkdiag, hcatM, vcatM, addM, T, eye, cdiv, cmul, cluFactor, cluSolve, gainTF, explicitSS,
} from './lti.js';

const RANK = { tf: 0, zpk: 1, ss: 2, frd: 3 };
/** Result type of combining two models (frd > ss > zpk > tf). */
export function resultType(a, b) {
  if (a.meta.isStatic && !b.meta.isStatic) return b.type;
  if (b.meta.isStatic && !a.meta.isStatic) return a.type;
  return RANK[a.type] >= RANK[b.type] ? a.type : b.type;
}
/** Common sample time. */
export function joinTs(a, b) {
  if (a.meta.isStatic) return b.Ts;
  if (b.meta.isStatic) return a.Ts;
  if (a.Ts === b.Ts) return a.Ts;
  if (a.Ts === -1 && b.Ts > 0) return b.Ts;
  if (b.Ts === -1 && a.Ts > 0) return a.Ts;
  throw E('lti:tsMismatch', 'Sampling times must agree.');
}
const varOf = (a, b) => (a.meta.isStatic ? b.meta.Variable : a.meta.Variable) || (a.meta.Variable || b.meta.Variable) || null;
const staticBoth = (a, b) => !!(a.meta.isStatic && b.meta.isStatic);
function finish(m, a, b) { if (staticBoth(a, b)) m.meta.isStatic = true; return m; }

// ------------------------------------------------------------ SISO tf entries
const tfeAdd = (n1, d1, n2, d2) => {
  if (isZeroPoly(n1)) return [n2.slice(), d2.slice()];
  if (isZeroPoly(n2)) return [n1.slice(), d1.slice()];
  // identical denominators: add numerators
  if (d1.length === d2.length && d1.every((x, i) => x === d2[i])) return [polyAdd(n1, n2), d1.slice()];
  return [polyAdd(polyMul(n1, d2), polyMul(n2, d1)), polyMul(d1, d2)];
};
const tfeMul = (n1, d1, n2, d2) => (isZeroPoly(n1) || isZeroPoly(n2) ? [[0], [1]] : [polyMul(n1, n2), polyMul(d1, d2)]);

// ------------------------------------------------------------ FRD helpers
function frdOf(m, freq, Ts) {
  if (m.type === 'frd') return m;
  const R = freqResp(m.meta.isStatic ? { ...m, Ts } : m, freq);
  return mkFRD(R.map((r) => r.map((h) => ({ re: Array.from(h.re), im: Array.from(h.im) }))), freq, Ts, { ...m.meta });
}
function frdBinary(a, b, op) {
  const fa = a.type === 'frd' ? a : null, fb = b.type === 'frd' ? b : null;
  const freq = (fa || fb).freq; const Ts = joinTs(a, b);
  const A = frdOf(a, freq, Ts), B = frdOf(b, freq, Ts);
  const nf = freq.length; const out = [];
  const get = (X, k) => X.R.map((r) => r.map((h) => [h.re[k], h.im[k]]));
  const res = [];
  for (let k = 0; k < nf; k++) res.push(op(get(A, k), get(B, k)));
  const ny = res[0].length, nu = ny ? res[0][0].length : 0;
  for (let i = 0; i < ny; i++) { out.push([]); for (let j = 0; j < nu; j++) out[i].push({ re: res.map((M) => M[i][j][0]), im: res.map((M) => M[i][j][1]) }); }
  return mkFRD(out, freq, Ts, plainMeta(a.meta, ny, nu));
}
const cmAdd = (X, Y, s = 1) => X.map((r, i) => r.map((x, j) => [x[0] + s * Y[i][j][0], x[1] + s * Y[i][j][1]]));
const cmMul = (X, Y) => X.map((r) => Y[0].map((_, k) => { let sr = 0, si = 0; for (let j = 0; j < r.length; j++) { const [a, b] = cmul(r[j][0], r[j][1], Y[j][k][0], Y[j][k][1]); sr += a; si += b; } return [sr, si]; }));
function cmInv(X) {
  const n = X.length; const F = cluFactor(X.map((r) => r.map((x) => x[0])), X.map((r) => r.map((x) => x[1])));
  if (F.singular) throw E('lti:singular', 'The model is not invertible at some frequency.');
  const cols = []; for (let j = 0; j < n; j++) { const e = new Array(n).fill(0); e[j] = 1; cols.push(cluSolve(F, e, null)); }
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => [cols[j][0][i], cols[j][1][i]]));
}
const expandScalarC = (X, ny, nu) => Array.from({ length: ny }, () => Array.from({ length: nu }, () => X[0][0]));

// ------------------------------------------------------------ scalar expansion
/** Replicates a SISO model to ny×nu (every entry equal). */
export function expandTo(m, ny, nu) {
  if (m.ny === ny && m.nu === nu) return m;
  if (m.ny * m.nu !== 1) throw E('lti:dimMismatch', 'Model dimensions must agree.');
  if (m.type === 'tf') return mkTF(Array.from({ length: ny }, () => Array.from({ length: nu }, () => m.num[0][0])), Array.from({ length: ny }, () => Array.from({ length: nu }, () => m.den[0][0])), m.Ts, { ...plainMeta(m.meta, ny, nu), isStatic: m.meta.isStatic, Variable: m.meta.Variable });
  if (m.type === 'zpk') return mkZPK(Array.from({ length: ny }, () => Array.from({ length: nu }, () => m.z[0][0])), Array.from({ length: ny }, () => Array.from({ length: nu }, () => m.p[0][0])), Array.from({ length: ny }, () => new Array(nu).fill(m.k[0][0])), m.Ts, { ...plainMeta(m.meta, ny, nu), isStatic: m.meta.isStatic });
  if (m.type === 'frd') return mkFRD(Array.from({ length: ny }, () => Array.from({ length: nu }, () => m.R[0][0])), m.freq, m.Ts, plainMeta(m.meta, ny, nu));
  // ss: one copy per entry
  const s = explicitSS(m); const copies = ny * nu; const n = s.n;
  const A = blkdiag(...Array.from({ length: copies }, () => s.A));
  const B = zerosM(n * copies, nu), C = zerosM(ny, n * copies), D = zerosM(ny, nu);
  for (let j = 0; j < nu; j++) for (let i = 0; i < ny; i++) {
    const c = j * ny + i;
    for (let q = 0; q < n; q++) { B[c * n + q][j] = s.B[q][0]; C[i][c * n + q] = s.C[0][q]; }
    D[i][j] = s.D[0][0];
  }
  const r = mkSS(A, B, C, D, s.Ts, plainMeta(s.meta, ny, nu, n * copies), null, [ny, nu]); if (m.meta.isStatic) r.meta.isStatic = true; return r;
}
/** Diagonal replication of a SISO model (k copies): sys*I_k. */
export function diagCopies(m, k) { return append(...Array.from({ length: k }, () => m)); }

// ------------------------------------------------------------ plus / minus / uminus
export function neg(m) {
  if (m.type === 'tf') return { ...m, num: m.num.map((r) => r.map((p) => p.map((x) => -x))) };
  if (m.type === 'zpk') return { ...m, k: m.k.map((r) => r.map((x) => -x)) };
  if (m.type === 'ss') return { ...m, C: m.C.map((r) => r.map((x) => -x)), D: m.D.map((r) => r.map((x) => -x)) };
  return { ...m, R: m.R.map((r) => r.map((h) => ({ re: h.re.map((x) => -x), im: h.im.map((x) => -x) }))) };
}
export function add(a, b) {
  if (a.ny * a.nu === 1 && (b.ny * b.nu !== 1)) a = expandTo(a, b.ny, b.nu);
  else if (b.ny * b.nu === 1 && (a.ny * a.nu !== 1)) b = expandTo(b, a.ny, a.nu);
  if (a.ny !== b.ny || a.nu !== b.nu) throw E('lti:dimMismatch', 'Model dimensions must agree for addition.');
  const type = resultType(a, b);
  if (type === 'frd') return frdBinary(a, b, (X, Y) => cmAdd(X, Y));
  const Ts = joinTs(a, b);
  if ((hasDelay(a) || hasDelay(b))) {
    for (let i = 0; i < a.ny; i++) for (let j = 0; j < a.nu; j++) if (totalDelay(a, i, j) !== totalDelay(b, i, j)) throw E('lti:delay', 'Adding models with different time delays is not supported; approximate the delays with pade first.');
  }
  const keepNames = (m) => ({ InputName: a.meta.InputName, OutputName: a.meta.OutputName, InputDelay: a.meta.InputDelay, OutputDelay: a.meta.OutputDelay, IODelay: a.meta.IODelay, ...m });
  if (type === 'tf' || type === 'zpk') {
    const A = toTF(a), B = toTF(b); const num = [], den = [];
    for (let i = 0; i < a.ny; i++) { num.push([]); den.push([]); for (let j = 0; j < a.nu; j++) { const [n, d] = tfeAdd(A.num[i][j], A.den[i][j], B.num[i][j], B.den[i][j]); num[i].push(n); den[i].push(d); } }
    const r = mkTF(num, den, Ts, keepNames({ Variable: varOf(a, b), TimeUnit: a.meta.TimeUnit }));
    if (type === 'zpk') {
      const z = toZPK(r);
      // keep the poles exactly as the union of the operands' poles
      const Za = toZPK(a), Zb = toZPK(b);
      for (let i = 0; i < a.ny; i++) for (let j = 0; j < a.nu; j++) {
        if (Za.k[i][j] === 0 || Zb.k[i][j] === 0 || z.k[i][j] === 0) continue;
        const pa = Za.p[i][j], pb = Zb.p[i][j];
        const same = pa.re.length === pb.re.length && pa.re.every((x, q) => x === pb.re[q] && pa.im[q] === pb.im[q]);
        z.p[i][j] = same ? { re: pa.re.slice(), im: pa.im.slice() } : { re: [...pa.re, ...pb.re], im: [...pa.im, ...pb.im] };
      }
      return finish(z, a, b);
    }
    return finish(r, a, b);
  }
  const A = explicitSS(toSS(a)), B = explicitSS(toSS(b));
  const r = mkSS(blkdiag(A.A, B.A), vcatM(A.B, B.B), hcatM(a.ny, A.C, B.C), addM(A.D, B.D), Ts,
    keepNames({ StateName: [...A.meta.StateName, ...B.meta.StateName], TimeUnit: a.meta.TimeUnit }), null, [a.ny, a.nu]);
  return finish(r, a, b);
}
export const sub = (a, b) => add(a, neg(b));

// ------------------------------------------------------------ mtimes (series)
/** a*b: output of b feeds a. */
export function mul(a, b) {
  if (a.ny * a.nu === 1 && b.ny !== 1) a = diagCopies(a, b.ny);
  else if (b.ny * b.nu === 1 && a.nu !== 1) b = diagCopies(b, a.nu);
  if (a.nu !== b.ny) throw E('lti:dimMismatch', 'In SYS1*SYS2, the number of inputs of SYS1 must match the number of outputs of SYS2.');
  const type = resultType(a, b);
  if (type === 'frd') return frdBinary(a, b, (X, Y) => cmMul(X, Y));
  const Ts = joinTs(a, b);
  const ny = a.ny, nu = b.nu;
  let io = null;
  if (hasDelay(a) || hasDelay(b)) {
    if (a.ny * a.nu !== 1 || b.ny * b.nu !== 1) throw E('lti:delay', 'Multiplying MIMO models with time delays is not supported; approximate the delays with pade first.');
    io = [[totalDelay(a, 0, 0) + totalDelay(b, 0, 0)]];
  }
  const meta = { InputName: b.meta.InputName, OutputName: a.meta.OutputName, InputUnit: b.meta.InputUnit, OutputUnit: a.meta.OutputUnit, TimeUnit: a.meta.TimeUnit, Variable: varOf(a, b), IODelay: io || undefined };
  if (type === 'zpk') {
    const A = toZPK(a), B = toZPK(b);
    if (ny * nu === 1 && a.nu === 1) {
      return finish(mkZPK([[{ re: [...A.z[0][0].re, ...B.z[0][0].re], im: [...A.z[0][0].im, ...B.z[0][0].im] }]], [[{ re: [...A.p[0][0].re, ...B.p[0][0].re], im: [...A.p[0][0].im, ...B.p[0][0].im] }]], [[A.k[0][0] * B.k[0][0]]], Ts, meta), a, b);
    }
    return finish(toZPK(mulTF(toTF(a), toTF(b), Ts, meta)), a, b);
  }
  if (type === 'tf') return finish(mulTF(toTF(a), toTF(b), Ts, meta), a, b);
  const A = explicitSS(toSS(a)), B = explicitSS(toSS(b));
  // x = [xa; xb]; xa' = Aa xa + Ba (Cb xb + Db u); y = Ca xa + Da Cb xb + Da Db u
  const n1 = A.n, n2 = B.n;
  const Aa = blkdiag(A.A, B.A); const BaCb = n1 && n2 ? K.mul(A.B, B.C) : zerosM(n1, n2);
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) Aa[i][n1 + j] = BaCb[i][j];
  const Bt = vcatM(n1 ? (A.B.length ? K.mul(A.B, B.D) : []) : [], B.B);
  const DaCb = n2 ? K.mul(A.D, B.C) : zerosM(ny, 0);
  const Cc = hcatM(ny, A.C, DaCb);
  const Dd = K.mul(A.D, B.D);
  const r = mkSS(Aa, Bt, Cc, Dd, Ts, { ...meta, StateName: [...A.meta.StateName, ...B.meta.StateName] }, null, [ny, nu]);
  return finish(r, a, b);
}
function mulTF(A, B, Ts, meta) {
  const ny = A.ny, nu = B.nu, nk = A.nu; const num = [], den = [];
  for (let i = 0; i < ny; i++) {
    num.push([]); den.push([]);
    for (let k = 0; k < nu; k++) {
      let n = [0], d = [1];
      for (let j = 0; j < nk; j++) { const [pn, pd] = tfeMul(A.num[i][j], A.den[i][j], B.num[j][k], B.den[j][k]); [n, d] = tfeAdd(n, d, pn, pd); }
      num[i].push(n); den[i].push(d);
    }
  }
  return mkTF(num, den, Ts, meta);
}

// ------------------------------------------------------------ inverse / power
export function inv(m) {
  if (m.ny !== m.nu) throw E('lti:inv', 'Only square models can be inverted.');
  if (hasDelay(m)) throw E('lti:inv', 'Cannot invert a model with time delays.');
  if (m.type === 'tf' && m.ny === 1) { if (isZeroPoly(m.num[0][0])) throw E('lti:inv', 'The model is singular and cannot be inverted.'); return mkTF([[m.den[0][0]]], [[m.num[0][0]]], m.Ts, { ...m.meta, InputName: m.meta.OutputName, OutputName: m.meta.InputName }); }
  if (m.type === 'zpk' && m.ny === 1) { if (m.k[0][0] === 0) throw E('lti:inv', 'The model is singular and cannot be inverted.'); return mkZPK([[m.p[0][0]]], [[m.z[0][0]]], [[1 / m.k[0][0]]], m.Ts, { ...m.meta, InputName: m.meta.OutputName, OutputName: m.meta.InputName }); }
  if (m.type === 'frd') return { ...m, R: transposeBack(m, (X) => cmInv(X)) };
  if (m.type === 'tf' || m.type === 'zpk') return convertTo(inv(toSS(m)), m.type);
  const s = explicitSS(m);
  const F = K.lu(s.D); if (F.singular) throw E('lti:inv', 'Cannot invert a model whose feedthrough matrix D is singular.');
  const Di = K.inv(s.D);
  const A = s.n ? addM(s.A, K.mul(K.mul(s.B, Di), s.C), -1) : [];
  const B = s.n ? K.mul(s.B, Di) : [];
  const C = s.n ? K.mul(Di, s.C).map((r) => r.map((x) => -x)) : zerosM(s.ny, 0);
  return mkSS(A, B, C, Di, s.Ts, { ...s.meta, InputName: s.meta.OutputName, OutputName: s.meta.InputName }, null, [s.nu, s.ny]);
}
function transposeBack(m, f) {
  const nf = m.freq.length; const res = [];
  for (let k = 0; k < nf; k++) res.push(f(m.R.map((r) => r.map((h) => [h.re[k], h.im[k]]))));
  const ny = res[0].length, nu = res[0][0].length; const out = [];
  for (let i = 0; i < ny; i++) { out.push([]); for (let j = 0; j < nu; j++) out[i].push({ re: res.map((M) => M[i][j][0]), im: res.map((M) => M[i][j][1]) }); }
  return out;
}
export function identity(n, Ts, type) { const G = eye(n); const g = gainTF(G, Ts); return type === 'tf' ? g : convertTo(g, type); }
export function mpower(m, k) {
  if (!Number.isInteger(k)) throw E('lti:mpower', 'The exponent must be an integer.');
  if (m.ny !== m.nu) throw E('lti:mpower', 'Only square models can be raised to a power.');
  if (k === 0) { const r = identity(m.ny, m.Ts, m.type === 'frd' ? 'tf' : m.type); r.meta.isStatic = false; r.meta.Variable = m.meta.Variable; return r; }
  let base = k < 0 ? inv(m) : m; let r = base;
  for (let i = 1; i < Math.abs(k); i++) r = mul(r, base);
  return r;
}

// ------------------------------------------------------------ feedback
export function feedback(a, b, feedin, feedout, sign = -1) {
  const nu1 = a.nu, ny1 = a.ny;
  feedin = feedin || Array.from({ length: nu1 }, (_, i) => i);
  feedout = feedout || Array.from({ length: ny1 }, (_, i) => i);
  if (b.ny * b.nu === 1 && (feedin.length !== 1 || feedout.length !== 1)) {
    if (feedin.length !== feedout.length) throw E('feedback:dims', 'Feedback model dimensions do not match.');
    b = diagCopies(b, feedin.length);
  }
  if (b.nu !== feedout.length || b.ny !== feedin.length) throw E('feedback:dims', 'The feedback model size does not match the number of feedback inputs/outputs.');
  if (hasDelay(a) || hasDelay(b)) throw E('feedback:delay', 'Feedback loops with time delays are not supported; approximate the delays with pade first.');
  const type = resultType(a, b);
  const Ts = joinTs(a, b);
  if (type === 'frd') {
    const full = a.nu === feedin.length && a.ny === feedout.length && feedin.every((x, i) => x === i) && feedout.every((x, i) => x === i);
    if (!full) throw E('feedback:frd', 'Index-based feedback is not supported for FRD models.');
    return frdBinary(a, b, (G, H) => { const n = G.length; const GH = cmMul(H, G); const I = Array.from({ length: GH.length }, (_, i) => Array.from({ length: GH.length }, (_, j) => [i === j ? 1 : 0, 0])); const M = cmAdd(I, GH, -sign); return cmMul(G, cmInv(M)); });
  }
  const sisoFull = a.ny * a.nu === 1 && b.ny * b.nu === 1;
  if (sisoFull && (type === 'tf' || type === 'zpk')) {
    const A = toTF(a), B = toTF(b);
    const n1 = A.num[0][0], d1 = A.den[0][0], n2 = B.num[0][0], d2 = B.den[0][0];
    const num = polyMul(n1, d2); const den = polyAdd(polyMul(d1, d2), polyMul(n1, n2), -sign);
    if (isZeroPoly(den)) throw E('feedback:algebraicLoop', 'The feedback interconnection has an algebraic loop and is not well posed.');
    const r = mkTF([[num]], [[den]], Ts, { InputName: a.meta.InputName, OutputName: a.meta.OutputName, Variable: varOf(a, b), TimeUnit: a.meta.TimeUnit });
    if (type === 'zpk') {
      const z = toZPK(r); const za = toZPK(a), zb = toZPK(b);
      // closed-loop zeros are the zeros of a and the poles of b
      if (z.k[0][0] !== 0) z.z[0][0] = { re: [...za.z[0][0].re, ...zb.p[0][0].re], im: [...za.z[0][0].im, ...zb.p[0][0].im] };
      return z;
    }
    return r;
  }
  const A = explicitSS(toSS(a)), B = explicitSS(toSS(b));
  // embed b: y1 (ny1) -> e (nu1)
  const nfb = B.n;
  const Bb = zerosM(nfb, ny1); for (let q = 0; q < nfb; q++) feedout.forEach((o, c) => { Bb[q][o] = B.B[q][c]; });
  const Cb = zerosM(nu1, nfb); feedin.forEach((inp, r) => { for (let q = 0; q < nfb; q++) Cb[inp][q] = B.C[r][q]; });
  const Db = zerosM(nu1, ny1); feedin.forEach((inp, r) => feedout.forEach((o, c) => { Db[inp][o] = B.D[r][c]; }));
  const n1 = A.n; const s = sign;
  const M = addM(eye(nu1), K.mul(Db, A.D), -s);
  const Fl = K.lu(M); if (Fl.singular) throw E('feedback:algebraicLoop', 'The feedback interconnection has an algebraic loop and is not well posed.');
  const F = K.inv(M);
  const sF = F.map((r) => r.map((x) => s * x));
  // e = F r + sF Db C1 x1 + sF Cb x2
  const Ex1 = n1 ? K.mul(K.mul(sF, Db), A.C) : zerosM(nu1, 0);
  const Ex2 = nfb ? K.mul(sF, Cb) : zerosM(nu1, 0);
  const y1x1 = n1 ? addM(A.C, K.mul(A.D, Ex1)) : zerosM(ny1, 0);
  const y1x2 = nfb ? K.mul(A.D, Ex2) : zerosM(ny1, 0);
  const y1r = K.mul(A.D, F);
  const A11 = n1 ? addM(A.A, K.mul(A.B, Ex1)) : []; const A12 = n1 && nfb ? K.mul(A.B, Ex2) : zerosM(n1, nfb);
  const A21 = nfb && n1 ? K.mul(Bb, y1x1) : zerosM(nfb, n1); const A22 = nfb ? addM(B.A, K.mul(Bb, y1x2)) : [];
  const Acl = [...A11.map((r, i) => [...r, ...A12[i]]), ...A21.map((r, i) => [...r, ...A22[i]])];
  if (!n1) for (let i = 0; i < nfb; i++) Acl[i] = A22[i].slice();
  const Bcl = [...(n1 ? K.mul(A.B, F) : []), ...(nfb ? K.mul(Bb, y1r) : [])];
  const Ccl = hcatM(ny1, y1x1, y1x2);
  const r = mkSS(Acl, Bcl, Ccl, y1r, Ts, { InputName: a.meta.InputName, OutputName: a.meta.OutputName, StateName: [...A.meta.StateName, ...B.meta.StateName], TimeUnit: a.meta.TimeUnit }, null, [ny1, nu1]);
  return convertTo(r, type);
}

// ------------------------------------------------------------ concatenation / append / select
export function hcat(list) {
  if (list.length === 1) return list[0];
  const ny = list[0].ny; for (const m of list) if (m.ny !== ny) throw E('lti:horzcat', 'In [SYS1 , SYS2], both models must have the same number of outputs.');
  let type = list[0].type, Ts = list[0].Ts, st = list[0];
  for (const m of list.slice(1)) { type = resultType(st, m); Ts = joinTs(st, m); st = { ...m, type, Ts, meta: { ...m.meta, isStatic: st.meta.isStatic && m.meta.isStatic } }; }
  const nu = list.reduce((s, m) => s + m.nu, 0);
  const meta = { OutputName: list[0].meta.OutputName, InputName: list.flatMap((m) => m.meta.InputName), InputDelay: list.flatMap((m) => m.meta.InputDelay), TimeUnit: list[0].meta.TimeUnit, Variable: list.map((m) => m.meta.Variable).find((v) => v) || null };
  meta.IODelay = Array.from({ length: ny }, (_, i) => list.flatMap((m) => m.meta.IODelay[i].map((x, j) => x + m.meta.OutputDelay[i])));
  if (type === 'frd') return catFRD(list, ny, nu, 'h', Ts, meta);
  if (type === 'tf' || type === 'zpk') {
    const ts = list.map((m) => convertTo(m, type));
    if (type === 'tf') return mkTF(Array.from({ length: ny }, (_, i) => ts.flatMap((m) => m.num[i])), Array.from({ length: ny }, (_, i) => ts.flatMap((m) => m.den[i])), Ts, meta);
    return mkZPK(Array.from({ length: ny }, (_, i) => ts.flatMap((m) => m.z[i])), Array.from({ length: ny }, (_, i) => ts.flatMap((m) => m.p[i])), Array.from({ length: ny }, (_, i) => ts.flatMap((m) => m.k[i])), Ts, meta);
  }
  const ss = list.map((m) => explicitSS(toSS(m)));
  return mkSS(blkdiag(...ss.map((s) => s.A)), blkdiag(...ss.map((s) => withCols(s.B, s.nu))), hcatM(ny, ...ss.map((s) => s.C)), hcatM(ny, ...ss.map((s) => s.D)), Ts, { ...meta, StateName: ss.flatMap((s) => s.meta.StateName) }, null, [ny, nu]);
}
const withCols = (X, n) => { const r = X.map((x) => x.slice()); r.cols = n; return r; };
export function vcat(list) {
  if (list.length === 1) return list[0];
  const nu = list[0].nu; for (const m of list) if (m.nu !== nu) throw E('lti:vertcat', 'In [SYS1 ; SYS2], both models must have the same number of inputs.');
  let type = list[0].type, Ts = list[0].Ts, st = list[0];
  for (const m of list.slice(1)) { type = resultType(st, m); Ts = joinTs(st, m); st = { ...m, type, Ts, meta: { ...m.meta, isStatic: st.meta.isStatic && m.meta.isStatic } }; }
  const ny = list.reduce((s, m) => s + m.ny, 0);
  const meta = { InputName: list[0].meta.InputName, OutputName: list.flatMap((m) => m.meta.OutputName), OutputDelay: list.flatMap((m) => m.meta.OutputDelay), TimeUnit: list[0].meta.TimeUnit, Variable: list.map((m) => m.meta.Variable).find((v) => v) || null };
  meta.IODelay = list.flatMap((m) => m.meta.IODelay.map((r) => r.map((x, j) => x + m.meta.InputDelay[j])));
  if (type === 'frd') return catFRD(list, ny, nu, 'v', Ts, meta);
  if (type === 'tf' || type === 'zpk') {
    const ts = list.map((m) => convertTo(m, type));
    if (type === 'tf') return mkTF(ts.flatMap((m) => m.num), ts.flatMap((m) => m.den), Ts, meta);
    return mkZPK(ts.flatMap((m) => m.z), ts.flatMap((m) => m.p), ts.flatMap((m) => m.k), Ts, meta);
  }
  const ss = list.map((m) => explicitSS(toSS(m)));
  const nx = ss.reduce((s, x) => s + x.n, 0);
  return mkSS(blkdiag(...ss.map((s) => s.A)), vcatM(...ss.map((s) => s.B)), blkdiag(...ss.map((s) => withCols(s.C, s.n))), vcatM(...ss.map((s) => s.D)), Ts, { ...meta, StateName: ss.flatMap((s) => s.meta.StateName) }, null, [ny, nu]);
}
function catFRD(list, ny, nu, dir, Ts, meta) {
  const freq = list.find((m) => m.type === 'frd').freq;
  const fs = list.map((m) => frdOf(m, freq, Ts));
  if (dir === 'h') return mkFRD(Array.from({ length: ny }, (_, i) => fs.flatMap((m) => m.R[i])), freq, Ts, meta);
  return mkFRD(fs.flatMap((m) => m.R), freq, Ts, meta);
}
export function append(...list) {
  if (list.length === 1) return list[0];
  const ny = list.reduce((s, m) => s + m.ny, 0), nu = list.reduce((s, m) => s + m.nu, 0);
  let type = list[0].type, Ts = list[0].Ts, st = list[0];
  for (const m of list.slice(1)) { type = resultType(st, m); Ts = joinTs(st, m); st = { ...m, type, Ts, meta: { ...m.meta, isStatic: st.meta.isStatic && m.meta.isStatic } }; }
  const meta = { InputName: list.flatMap((m) => m.meta.InputName), OutputName: list.flatMap((m) => m.meta.OutputName), TimeUnit: list[0].meta.TimeUnit, Variable: list.map((m) => m.meta.Variable).find((v) => v) || null };
  if (type === 'tf' || type === 'zpk') {
    const ts = list.map((m) => toTF(m)); const num = [], den = [];
    let r0 = 0;
    for (let i = 0; i < ny; i++) { num.push(new Array(nu).fill(null).map(() => [0])); den.push(new Array(nu).fill(null).map(() => [1])); }
    let c0 = 0;
    for (const m of ts) { for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) { num[r0 + i][c0 + j] = m.num[i][j]; den[r0 + i][c0 + j] = m.den[i][j]; } r0 += m.ny; c0 += m.nu; }
    const r = mkTF(num, den, Ts, meta);
    if (list.every((m) => m.meta.isStatic)) r.meta.isStatic = true;
    return type === 'zpk' ? toZPK(r) : r;
  }
  if (type === 'frd') throw E('append:frd', 'append is not supported for FRD models.');
  const ss = list.map((m) => explicitSS(toSS(m)));
  return mkSS(blkdiag(...ss.map((s) => s.A)), blkdiag(...ss.map((s) => withCols(s.B, s.nu))), blkdiag(...ss.map((s) => withCols(s.C, s.n))), blkdiag(...ss.map((s) => withCols(s.D, s.nu))), Ts, { ...meta, StateName: ss.flatMap((s) => s.meta.StateName) }, null, [ny, nu]);
}
/** Subsystem with output rows ri and input columns ci (0-based arrays). */
export function select(m, ri, ci) {
  const pick = (arr, idx) => idx.map((k) => arr[k]);
  const meta = { ...m.meta, InputName: pick(m.meta.InputName, ci), OutputName: pick(m.meta.OutputName, ri), InputDelay: pick(m.meta.InputDelay, ci), OutputDelay: pick(m.meta.OutputDelay, ri), IODelay: ri.map((i) => ci.map((j) => m.meta.IODelay[i][j])), InputUnit: pick(m.meta.InputUnit, ci), OutputUnit: pick(m.meta.OutputUnit, ri) };
  if (m.type === 'tf') return mkTF(ri.map((i) => ci.map((j) => m.num[i][j])), ri.map((i) => ci.map((j) => m.den[i][j])), m.Ts, { ...meta, nu: ci.length });
  if (m.type === 'zpk') return mkZPK(ri.map((i) => ci.map((j) => m.z[i][j])), ri.map((i) => ci.map((j) => m.p[i][j])), ri.map((i) => ci.map((j) => m.k[i][j])), m.Ts, { ...meta, nu: ci.length });
  if (m.type === 'frd') return mkFRD(ri.map((i) => ci.map((j) => m.R[i][j])), m.freq, m.Ts, meta);
  const B = m.B.map((r) => ci.map((j) => r[j])); B.cols = ci.length;
  return mkSS(m.A, B, ri.map((i) => m.C[i].slice()), ri.map((i) => ci.map((j) => m.D[i][j])), m.Ts, meta, m.E, [ri.length, ci.length]);
}

// ------------------------------------------------------------ transposes
export function transpose(m) {
  const meta = { ...m.meta, InputName: m.meta.OutputName, OutputName: m.meta.InputName, InputDelay: m.meta.OutputDelay, OutputDelay: m.meta.InputDelay, IODelay: T(m.meta.IODelay.length ? m.meta.IODelay : [[]]) };
  if (!m.meta.IODelay.length) meta.IODelay = [];
  if (m.type === 'tf') return mkTF(T(m.num), T(m.den), m.Ts, meta);
  if (m.type === 'zpk') return mkZPK(T(m.z), T(m.p), T(m.k), m.Ts, meta);
  if (m.type === 'frd') return mkFRD(T(m.R), m.freq, m.Ts, meta);
  const s = explicitSS(m);
  return mkSS(T(s.A.length ? s.A : []), T(s.C).length ? T(s.C) : zerosM(s.n, s.ny), T(s.B).length ? T(s.B) : zerosM(s.nu, s.n), T(s.D), s.Ts, meta, null, [s.nu, s.ny]);
}
/** Pertransposition G(-s).' (continuous) or G(1/z).' (discrete, via the response only for tf). */
export function ctranspose(m) {
  const t = transpose(m);
  if (m.Ts !== 0) {
    if (t.type === 'ss') throw E('lti:ctranspose', "Pertransposition of discrete state-space models is not supported.");
    const tf = toTF(t);
    // G(1/z): reverse coefficient order (with equal lengths)
    const r = mkTF(tf.num.map((r) => r.map((p) => p.slice().reverse())), tf.den.map((r) => r.map((p) => p.slice().reverse())), m.Ts, tf.meta);
    return t.type === 'zpk' ? toZPK(r) : r;
  }
  if (t.type === 'ss') return { ...t, A: t.A.map((r) => r.map((x) => -x)), B: t.B.map((r) => r.map((x) => -x)) };
  const flip = (p) => { const n = p.length; return p.map((x, k) => ((n - 1 - k) % 2 ? -x : x)); };
  if (t.type === 'tf') return mkTF(t.num.map((r) => r.map(flip)), t.den.map((r) => r.map(flip)), t.Ts, t.meta);
  if (t.type === 'zpk') return mkZPK(t.z.map((r) => r.map((z) => ({ re: z.re.map((x) => -x), im: z.im.map((x) => -x) }))), t.p.map((r) => r.map((z) => ({ re: z.re.map((x) => -x), im: z.im.map((x) => -x) }))),
    t.k.map((r, i) => r.map((k, j) => k * ((t.z[i][j].re.length - t.p[i][j].re.length) % 2 ? -1 : 1))), t.Ts, t.meta);
  throw E('lti:ctranspose', 'Pertransposition is not supported for FRD models.');
}
