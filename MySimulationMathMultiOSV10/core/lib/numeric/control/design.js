// Discretization, model reduction, state-feedback / estimator design and
// interconnection by signal names (internal models).
import * as K from '../_kernels.js';
import { E } from '../_util.js';
import {
  mkTF, mkZPK, mkSS, toSS, toTF, toZPK, convertTo, explicitSS, expm, logm, zerosM, eye, T, addM, blockM, hcatM, vcatM, blkdiag,
  hasDelay, totalDelay, fixMeta, careSolve, dareSolve, lyapC, lyapD, symmetrize, poles, freqResp, trimLead, isZeroPoly, cmul,
} from './lti.js';
import { append, mul, feedback, identity } from './ops.js';
import { isStable, phaseDeg } from './analysis.js';

const mm = (A, B) => K.mul(A, B);
const neg = (A) => A.map((r) => r.map((x) => -x));

// ------------------------------------------------------------ c2d / d2c / d2d
function delaysToSamples(m, Ts) {
  if (!hasDelay(m)) return m.meta;
  const f = (x) => { const k = x / Ts; if (Math.abs(k - Math.round(k)) > 1e-9 * Math.max(1, k)) throw E('c2d:fractionalDelay', 'Time delays must be integer multiples of the sample time; approximate them with pade first.'); return Math.round(k); };
  return { ...m.meta, InputDelay: m.meta.InputDelay.map(f), OutputDelay: m.meta.OutputDelay.map(f), IODelay: m.meta.IODelay.map((r) => r.map(f)) };
}
export function c2d(m, Ts, method = 'zoh', opts = {}) {
  if (m.Ts !== 0) throw E('c2d:discrete', 'The model is already discrete.');
  if (!(Ts > 0)) throw E('c2d:badTs', 'The sample time must be a positive scalar.');
  method = method.toLowerCase();
  const meta = { ...delaysToSamples(m, Ts), Variable: m.meta.Variable === 'p' ? 'q' : 'z' };
  if (method === 'matched') {
    const z = toZPK(m); const zz = [], pp = [], kk = [];
    for (let i = 0; i < z.ny; i++) {
      zz.push([]); pp.push([]); kk.push([]);
      for (let j = 0; j < z.nu; j++) {
        const map = (r) => { const re = [], im = []; for (let q = 0; q < r.re.length; q++) { const e = Math.exp(r.re[q] * Ts); re.push(e * Math.cos(r.im[q] * Ts)); im.push(e * Math.sin(r.im[q] * Ts)); } return { re, im }; };
        const zd = map(z.z[i][j]), pd = map(z.p[i][j]);
        // match gain at s=0 (or at a frequency away from poles)
        const s0 = [z.z[i][j], z.p[i][j]].some((r) => r.re.some((x, q) => Math.hypot(x, r.im[q]) < 1e-12)) ? 1 / Ts : 0;
        const gc = respZ(z.z[i][j], z.p[i][j], z.k[i][j], [s0, 0]);
        const zr = s0 ? [Math.cos(s0 * Ts), Math.sin(s0 * Ts)] : [1, 0];
        const gd = respZ(zd, pd, 1, zr);
        zz[i].push(zd); pp[i].push(pd); kk[i].push(z.k[i][j] === 0 ? 0 : Math.hypot(...gc) / Math.hypot(...gd) * Math.sign(gc[0] * gd[0] + gc[1] * gd[1] || 1));
      }
    }
    return convertTo(mkZPK(zz, pp, kk, Ts, meta), m.type);
  }
  const s = explicitSS(toSS(m)); const n = s.n, nu = s.nu;
  let A, B, C, D;
  if (method === 'zoh') {
    const M = zerosM(n + nu, n + nu);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] = s.A[i][j] * Ts; for (let j = 0; j < nu; j++) M[i][n + j] = s.B[i][j] * Ts; }
    const X = expm(M); A = X.slice(0, n).map((r) => r.slice(0, n)); B = X.slice(0, n).map((r) => r.slice(n)); C = s.C; D = s.D;
  } else if (method === 'foh') {
    const N = n + 2 * nu; const M = zerosM(N, N);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] = s.A[i][j] * Ts; for (let j = 0; j < nu; j++) M[i][n + j] = s.B[i][j] * Ts; }
    for (let j = 0; j < nu; j++) M[n + j][n + nu + j] = 1;
    const X = expm(M); const Phi = X.slice(0, n).map((r) => r.slice(0, n)), G1 = X.slice(0, n).map((r) => r.slice(n, n + nu)), G2 = X.slice(0, n).map((r) => r.slice(n + nu));
    A = Phi; B = n ? addM(addM(G1, mm(Phi, G2)), G2, -1) : []; C = s.C; D = n ? addM(s.D, mm(s.C, G2)) : s.D;
  } else if (method === 'impulse') {
    A = expm(s.A.map((r) => r.map((x) => x * Ts))); B = n ? mm(A, s.B).map((r) => r.map((x) => x * Ts)) : []; C = s.C; D = n ? mm(s.C, s.B).map((r) => r.map((x) => x * Ts)) : s.D.map((r) => r.map(() => 0));
  } else if (method === 'tustin' || method === 'bilinear' || method === 'prewarp') {
    let a = Ts / 2;
    const wp = opts.prewarp; if (wp) a = Math.tan(wp * Ts / 2) / wp;
    const Mi = n ? K.inv(addM(eye(n), s.A.map((r) => r.map((x) => x * a)), -1)) : [];
    A = n ? mm(Mi, addM(eye(n), s.A.map((r) => r.map((x) => x * a)))) : []; B = n ? mm(Mi, s.B).map((r) => r.map((x) => x * 2 * a)) : []; C = n ? mm(s.C, Mi) : s.C;
    D = n ? addM(s.D, mm(mm(s.C, Mi), s.B).map((r) => r.map((x) => x * a))) : s.D;
  } else if (method === 'least-squares' || method === 'least squares') throw E('c2d:method', "The 'least-squares' method is not supported; use 'zoh', 'foh', 'impulse', 'tustin' or 'matched'.");
  else throw E('c2d:method', `Unknown discretization method '${method}'.`);
  const r = mkSS(A, B, C, D, Ts, { ...meta, Variable: null }, null, [s.ny, s.nu]);
  if (m.type === 'tf') { const t = toTF(r); t.meta.Variable = meta.Variable; return t; }
  return convertTo(r, m.type);
}
function respZ(z, p, k, [sr, si]) { let hr = k, hi = 0; for (let q = 0; q < z.re.length; q++) [hr, hi] = cmul(hr, hi, sr - z.re[q], si - z.im[q]); for (let q = 0; q < p.re.length; q++) { const a = sr - p.re[q], b = si - p.im[q]; const d = a * a + b * b; [hr, hi] = [(hr * a + hi * b) / d, (hi * a - hr * b) / d]; } return [hr, hi]; }
export function d2c(m, method = 'zoh', opts = {}) {
  if (m.Ts === 0) throw E('d2c:continuous', 'The model is already continuous.');
  const Ts = m.Ts > 0 ? m.Ts : 1; method = method.toLowerCase();
  const meta = { ...m.meta, Variable: m.meta.Variable === 'q' ? 'p' : 's' };
  if (hasDelay(m)) { meta.InputDelay = m.meta.InputDelay.map((x) => x * Ts); meta.OutputDelay = m.meta.OutputDelay.map((x) => x * Ts); meta.IODelay = m.meta.IODelay.map((r) => r.map((x) => x * Ts)); }
  if (method === 'matched') {
    const z = toZPK(m);
    const map = (r) => { const re = [], im = []; for (let q = 0; q < r.re.length; q++) { const mag = Math.hypot(r.re[q], r.im[q]); if (mag === 0) throw E('d2c:zero', 'The matched method cannot map roots at z = 0.'); re.push(Math.log(mag) / Ts); im.push(Math.atan2(r.im[q], r.re[q]) / Ts); } return { re, im }; };
    const zz = z.z.map((row) => row.map(map)), pp = z.p.map((row) => row.map(map));
    const kk = z.k.map((row, i) => row.map((k, j) => { if (!k) return 0; const gd = respZ(z.z[i][j], z.p[i][j], k, [1, 0]); const gc = respZ(zz[i][j], pp[i][j], 1, [0, 0]); return Math.hypot(...gd) / Math.hypot(...gc) * Math.sign(gd[0] * gc[0] + gd[1] * gc[1] || 1); }));
    return convertTo(mkZPK(zz, pp, kk, 0, meta), m.type);
  }
  const s = explicitSS(toSS(m)); const n = s.n, nu = s.nu;
  let A, B, C, D;
  if (method === 'zoh') {
    const M = zerosM(n + nu, n + nu);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] = s.A[i][j]; for (let j = 0; j < nu; j++) M[i][n + j] = s.B[i][j]; }
    for (let j = 0; j < nu; j++) M[n + j][n + j] = 1;
    for (let k = 0; k < s.n; k++) { const ev = K.eigvals(s.A); if (ev.re.some((x, q) => x <= 0 && Math.abs(ev.im[q]) < 1e-12)) throw E('d2c:negativeReal', 'The zoh method cannot convert models with poles on the negative real axis or at z = 0; use tustin.'); break; }
    const L = logm(M).map((r) => r.map((x) => x / Ts));
    A = L.slice(0, n).map((r) => r.slice(0, n)); B = L.slice(0, n).map((r) => r.slice(n)); C = s.C; D = s.D;
  } else if (method === 'tustin' || method === 'bilinear') {
    let a = Ts / 2; if (opts.prewarp) a = Math.tan(opts.prewarp * Ts / 2) / opts.prewarp;
    const Mi2 = n ? K.inv(addM(s.A, eye(n))) : []; // (Ad+I)^-1
    const Mm = Mi2.map((r) => r.map((x) => 2 * x)); // M = 2 (Ad+I)^-1
    A = n ? addM(eye(n), Mm, -1).map((r) => r.map((x) => x / a)) : [];
    B = n ? mm(Mm, s.B).map((r) => r.map((x) => x / (2 * a))) : [];
    C = n ? mm(s.C, Mm) : s.C;
    D = n ? addM(s.D, mm(mm(s.C, Mm), s.B).map((r) => r.map((x) => x / 2)), -1) : s.D;
  } else throw E('d2c:method', `Unknown conversion method '${method}'.`);
  const r = mkSS(A, B, C, D, 0, { ...meta, Variable: null }, null, [s.ny, s.nu]);
  if (m.type === 'tf') { const t = toTF(r); t.meta.Variable = meta.Variable; return t; }
  return convertTo(r, m.type);
}
export function d2d(m, Ts, method = 'zoh') {
  if (m.Ts === 0) throw E('d2d:continuous', 'd2d needs a discrete model.');
  return c2d(d2c(m, method), Ts, method);
}

// ------------------------------------------------------------ controllability / gramians / reduction
export function ctrbM(A, B) { const n = A.length; const blocks = [B]; for (let k = 1; k < n; k++) blocks.push(mm(A, blocks[k - 1])); return hcatM(n, ...blocks); }
export function obsvM(A, C) { const n = A.length; const blocks = [C]; for (let k = 1; k < n; k++) blocks.push(mm(blocks[k - 1], A)); return vcatM(...blocks); }
export function gram(s, type) {
  s = explicitSS(s);
  if (!isStable(s)) throw E('gram:unstable', 'The model must be stable to compute gramians.');
  const disc = s.Ts !== 0;
  if (type === 'c') { const Q = mm(s.B, T(s.B)); return disc ? symmetrize(lyapD(s.A, Q)) : lyapC(s.A, Q); }
  const Q = mm(T(s.C), s.C); return disc ? symmetrize(lyapD(T(s.A), Q)) : lyapC(T(s.A), Q);
}
function sqrtFactor(W) { const { values, vectors } = K.symEig(W); const n = W.length; const L = zerosM(n, n); for (let j = 0; j < n; j++) { const s = Math.sqrt(Math.max(0, values[j])); for (let i = 0; i < n; i++) L[i][j] = vectors[i][j] * s; } return L; }
export function balreal(s0) {
  const s = explicitSS(toSS(s0)); const n = s.n;
  if (!n) return { sys: s, g: [], T: [], Ti: [] };
  const Lc = sqrtFactor(gram(s, 'c')), Lo = sqrtFactor(gram(s, 'o'));
  const { U, s: sv, V } = K.svd(mm(T(Lo), Lc));
  const tol = Math.max(...sv) * 1e-14;
  const sq = sv.map((x) => Math.sqrt(Math.max(x, tol)));
  const Tr = zerosM(n, n), Ti = zerosM(n, n);
  const UtLo = mm(T(U), T(Lo)); const LcV = mm(Lc, V);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { Tr[i][j] = UtLo[i][j] / sq[i]; Ti[i][j] = LcV[i][j] / sq[j]; }
  const sys = mkSS(mm(mm(Tr, s.A), Ti), mm(Tr, s.B), mm(s.C, Ti), s.D, s.Ts, { ...s.meta, StateName: [] }, null, [s.ny, s.nu]);
  return { sys, g: sv, T: Tr, Ti };
}
export function modred(s0, elim, method = 'matchdc') {
  const s = explicitSS(toSS(s0)); const n = s.n;
  const keep = []; for (let i = 0; i < n; i++) if (!elim.includes(i)) keep.push(i);
  const sub = (X, r, c) => r.map((i) => c.map((j) => X[i][j]));
  const A11 = sub(s.A, keep, keep), A12 = sub(s.A, keep, elim), A21 = sub(s.A, elim, keep), A22 = sub(s.A, elim, elim);
  const B1 = keep.map((i) => s.B[i].slice()), B2 = elim.map((i) => s.B[i].slice());
  const C1 = s.C.map((r) => keep.map((j) => r[j])), C2 = s.C.map((r) => elim.map((j) => r[j]));
  if (method === 'truncate' || !elim.length) return mkSS(A11, B1, C1, s.D, s.Ts, { ...s.meta, StateName: keep.map((i) => s.meta.StateName[i]) }, null, [s.ny, s.nu]);
  const M22 = s.Ts === 0 ? A22 : addM(A22, eye(elim.length), -1);
  const Xi = K.inv(M22);
  const A = addM(A11, mm(mm(A12, Xi), A21), -1), B = addM(B1, mm(mm(A12, Xi), B2), -1);
  const C = addM(C1, mm(mm(C2, Xi), A21), -1), D = addM(s.D, mm(mm(C2, Xi), B2), -1);
  return mkSS(A, B, C, D, s.Ts, { ...s.meta, StateName: keep.map((i) => s.meta.StateName[i]) }, null, [s.ny, s.nu]);
}
function orthBasis(Mx, tol) {
  if (!Mx.length || !Mx[0].length) return { Q: zerosM(Mx.length, 0), r: 0 };
  const { U, s } = K.svd(Mx);
  const t = tol ?? Math.max(Mx.length, Mx[0].length) * (s[0] || 0) * 1e-10;
  const r = s.filter((x) => x > t).length;
  return { Q: U.map((row) => row.slice(0, r)), r };
}
/** Minimal realization. Returns {model, removed}. */
export function minreal(m, tol) {
  if (m.type === 'tf' || m.type === 'zpk') {
    const z = toZPK(m); const tl = tol ?? Math.sqrt(2.220446049250313e-16);
    let removed = 0;
    for (let i = 0; i < z.ny; i++) for (let j = 0; j < z.nu; j++) {
      const zz = { re: z.z[i][j].re.slice(), im: z.z[i][j].im.slice() }, pp = { re: z.p[i][j].re.slice(), im: z.p[i][j].im.slice() };
      for (let a = zz.re.length - 1; a >= 0; a--) {
        let best = -1, bd = Infinity;
        for (let b = 0; b < pp.re.length; b++) { const d = Math.hypot(zz.re[a] - pp.re[b], zz.im[a] - pp.im[b]); if (d < bd) { bd = d; best = b; } }
        if (best >= 0 && bd <= tl * Math.max(1, Math.hypot(pp.re[best], pp.im[best])) * 10) { zz.re.splice(a, 1); zz.im.splice(a, 1); pp.re.splice(best, 1); pp.im.splice(best, 1); removed++; }
      }
      z.z[i][j] = zz; z.p[i][j] = pp;
    }
    if (m.type === 'zpk') return { model: z, removed };
    const t = toTF(z);
    // tf results are normalized (monic denominator)
    return { model: t, removed };
  }
  if (m.type !== 'ss') throw E('minreal:frd', 'minreal is not defined for FRD models.');
  const s = explicitSS(m); const n = s.n;
  if (!n) return { model: s, removed: 0 };
  const tl = tol ?? null;
  const { Q, r } = orthBasis(ctrbM(s.A, s.B), tl);
  let A = mm(mm(T(Q), s.A), Q), B = mm(T(Q), s.B), C = mm(s.C, Q);
  if (r === 0) return { model: mkSS([], [], zerosM(s.ny, 0), s.D, s.Ts, { ...s.meta, StateName: [] }, null, [s.ny, s.nu]), removed: n };
  const O = obsvM(A, C);
  const { Q: P, r: r2 } = orthBasis(T(O), tl);
  if (r2 === 0) return { model: mkSS([], [], zerosM(s.ny, 0), s.D, s.Ts, { ...s.meta, StateName: [] }, null, [s.ny, s.nu]), removed: n };
  A = mm(mm(T(P), A), P); B = mm(T(P), B); C = mm(C, P);
  return { model: mkSS(A, B, C, s.D, s.Ts, { ...s.meta, StateName: [] }, null, [s.ny, s.nu]), removed: n - r2 };
}
/** Modal or companion canonical form: {model, T}. */
export function canon(m, type = 'modal') {
  const s = explicitSS(toSS(m)); const n = s.n;
  if (!n) return { model: s, T: [] };
  let Tm;
  if (type === 'companion') {
    if (s.nu < 1) throw E('canon:noInput', 'The companion form needs at least one input.');
    const Cm = ctrbM(s.A, s.B.map((r) => [r[0]]));
    if (K.rank(Cm) < n) throw E('canon:uncontrollable', 'The model must be controllable from the first input for the companion form.');
    Tm = K.inv(Cm);
  } else {
    const ev = K.eigvals(s.A); const V = zerosM(n, n); let c = 0;
    const order = ev.re.map((_, i) => i);
    for (let q = 0; q < n && c < n; q++) {
      const k = order[q]; const lr = ev.re[k], li = ev.im[k];
      if (li < 0) continue;
      const v = K.eigvec(s.A, lr, li);
      if (li === 0) { const nrm = Math.max(...v.re.map(Math.abs)) || 1; for (let i = 0; i < n; i++) V[i][c] = v.re[i] / nrm; c++; }
      else { for (let i = 0; i < n; i++) { V[i][c] = v.re[i]; V[i][c + 1] = v.im[i]; } c += 2; }
    }
    // modal form: A_m = V^-1 A V; T = V^-1
    Tm = K.inv(V);
  }
  const Ti = K.inv(Tm);
  const A = mm(mm(Tm, s.A), Ti), B = mm(Tm, s.B), C = mm(s.C, Ti);
  const clean = (X) => X.map((r) => r.map((x) => (Math.abs(x) < 1e-12 * (K.normFro(X) || 1) ? 0 : x)));
  return { model: mkSS(clean(A), B, C, s.D, s.Ts, { ...s.meta, StateName: [] }, null, [s.ny, s.nu]), T: Tm };
}
export function ss2ss(m, Tm) {
  const s = explicitSS(toSS(m)); const Ti = K.inv(Tm);
  return mkSS(mm(mm(Tm, s.A), Ti), mm(Tm, s.B), mm(s.C, Ti), s.D, s.Ts, s.meta, null, [s.ny, s.nu]);
}

// ------------------------------------------------------------ pole placement
export function acker(A, b, p) {
  const n = A.length; if (p.re.length !== n) throw E('acker:badPoles', `Exactly ${n} poles are required.`);
  const c = K.poly(p.re, p.im);
  const Cm = ctrbM(A, b);
  const F = K.lu(T(Cm)); if (F.singular) throw E('acker:uncontrollable', 'The system is not controllable.');
  let phi = zerosM(n, n);
  for (let k = 0; k <= n; k++) { phi = mm(phi, A); for (let i = 0; i < n; i++) phi[i][i] += c[k]; }
  const en = new Array(n).fill(0); en[n - 1] = 1;
  const y = K.luSolve(F, en);
  return [mm([y], phi)[0]];
}
export function place(A, B, p) {
  const n = A.length, m = B[0].length; if (p.re.length !== n) throw E('place:badPoles', `Exactly ${n} poles are required.`);
  if (m === 1) return acker(A, B, p);
  // rank-one reduction: find v such that (A, B v) is controllable
  const tries = [new Array(m).fill(1), ...Array.from({ length: m }, (_, i) => { const v = new Array(m).fill(0); v[i] = 1; return v; }), Array.from({ length: m }, (_, i) => Math.cos(1.7 * i + 0.3))];
  for (const v of tries) {
    const b = B.map((r) => [r.reduce((s, x, j) => s + x * v[j], 0)]);
    const Cm = ctrbM(A, b);
    if (K.rank(Cm) < n) continue;
    const k = acker(A, b, p)[0];
    return v.map((vi) => k.map((x) => vi * x));
  }
  // general: feedback to make it cyclic first
  const F0 = B[0].map((_, j) => A.map((_, i) => Math.sin(i + 2 * j + 1)));
  const A1 = addM(A, mm(B, F0), -1);
  const b = B.map((r) => [r[0]]);
  if (K.rank(ctrbM(A1, b)) < n) throw E('place:uncontrollable', 'The system is not controllable; cannot place the poles.');
  const k = acker(A1, b, p)[0];
  const Kf = F0.map((r) => r.slice()); for (let j = 0; j < n; j++) Kf[0][j] += k[j];
  return Kf;
}

// ------------------------------------------------------------ Riccati based design
export function lqrDesign(A, B, Q, R, N, discrete) {
  const X = discrete ? dareSolve(A, B, Q, R, N) : careSolve(A, B, Q, R, N);
  let Kg;
  if (discrete) Kg = mm(K.inv(addM(mm(mm(T(B), X), B), R)), addM(mm(mm(T(B), X), A), N ? T(N) : zerosM(B[0].length, A.length)));
  else Kg = mm(K.inv(R), addM(mm(T(B), X), N ? T(N) : zerosM(B[0].length, A.length)));
  const cl = K.eigvals(addM(A, mm(B, Kg), -1));
  return { K: Kg, S: X, P: cl };
}
export function kalmanDesign(s0, Qn, Rn, Nn, known) {
  const s = explicitSS(toSS(s0)); const n = s.n, nu = s.nu, ny = s.ny; const nw = Qn.length;
  const nk = known ?? nu - nw;
  if (nk < 0) throw E('kalman:dims', 'The model has fewer inputs than the size of Qn.');
  const B = s.B.map((r) => r.slice(0, nk)), G = s.B.map((r) => r.slice(nk, nk + nw));
  const D = s.D.map((r) => r.slice(0, nk)), H = s.D.map((r) => r.slice(nk, nk + nw));
  const N = Nn || zerosM(nw, ny);
  const HQ = mm(H, Qn);
  const Rb = addM(addM(addM(Rn, mm(H, N)), mm(T(N), T(H))), mm(HQ, T(H)));
  const Qb = mm(mm(G, Qn), T(G)); const Nb = mm(G, addM(mm(Qn, T(H)), N));
  const disc = s.Ts !== 0;
  let P, L;
  if (!disc) { P = careSolve(T(s.A), T(s.C), Qb, Rb, Nb); L = mm(addM(mm(P, T(s.C)), Nb), K.inv(Rb)); }
  else { P = dareSolve(T(s.A), T(s.C), Qb, Rb, Nb); L = mm(addM(mm(mm(s.A, P), T(s.C)), Nb), K.inv(addM(mm(mm(s.C, P), T(s.C)), Rb))); }
  // estimator: inputs [u; y], outputs [y_hat; x_hat]
  const Ae = addM(s.A, mm(L, s.C), -1); const Be = hcatM(n, addM(B, mm(L, D), -1), L);
  const Ce = vcatM(s.C, eye(n)); const De = vcatM(hcatM(ny, D, zerosM(ny, ny)), zerosM(n, nk + ny));
  const meta = { InputName: [...s.meta.InputName.slice(0, nk), ...s.meta.OutputName], OutputName: [...s.meta.OutputName.map((x) => (x ? `${x}_e` : '')), ...s.meta.StateName.map((x) => (x ? `${x}_e` : ''))] };
  const kest = mkSS(Ae, Be, Ce, De, s.Ts, meta, null, [ny + n, nk + ny]);
  return { kest, L, P };
}

// ------------------------------------------------------------ pade
export function padeCoef(tau, N) {
  if (!Number.isInteger(N) || N < 0) throw E('pade:badOrder', 'The order must be a nonnegative integer.');
  const fact = (k) => { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; };
  const c = []; for (let k = 0; k <= N; k++) c.push(fact(2 * N - k) * fact(N) / (fact(2 * N) * fact(k) * fact(N - k)));
  // descending powers of s: coefficient of s^k is c_k tau^k (den), (-1)^k c_k tau^k (num)
  const den = [], num = [];
  for (let k = N; k >= 0; k--) { den.push(c[k] * tau ** k); num.push((k % 2 ? -1 : 1) * c[k] * tau ** k); }
  const s = den[0]; return { num: num.map((x) => x / s), den: den.map((x) => x / s) };
}
export function padeModel(m, N) {
  if (m.Ts !== 0) throw E('pade:discrete', 'pade approximates continuous-time delays only.');
  if (!hasDelay(m)) return m;
  const ny = m.ny, nu = m.nu; const meta0 = { ...m.meta, InputDelay: [], OutputDelay: [], IODelay: null };
  const base = convertTo(m.type === 'frd' ? m : { ...m, meta: fixMeta(meta0, ny, nu, m.n || 0) }, m.type);
  const padeTF = (tau) => { const p = padeCoef(tau, N); return mkTF([[p.num]], [[p.den]], 0, {}); };
  let res = base;
  // input delays on the right, output delays on the left, io delays per entry
  if (m.meta.InputDelay.some((x) => x)) res = mul(res, append(...m.meta.InputDelay.map((t) => (t ? padeTF(t) : identity(1, 0, 'tf')))));
  if (m.meta.OutputDelay.some((x) => x)) res = mul(append(...m.meta.OutputDelay.map((t) => (t ? padeTF(t) : identity(1, 0, 'tf')))), res);
  if (m.meta.IODelay.some((r) => r.some((x) => x))) {
    const t = toTF(res); const num = t.num.map((r) => r.slice()), den = t.den.map((r) => r.slice());
    for (let i = 0; i < ny; i++) for (let j = 0; j < nu; j++) { const tau = m.meta.IODelay[i][j]; if (!tau) continue; const p = padeCoef(tau, N); num[i][j] = K.conv(num[i][j], p.num); den[i][j] = K.conv(den[i][j], p.den); }
    res = convertTo(mkTF(num, den, 0, t.meta), m.type);
  }
  return convertTo(res, m.type);
}

// ------------------------------------------------------------ connect by names
function expandName(name, k) { return `${name}(${k})`; }
export function namesOf(list, n) { if (list.length === n) return list; if (list.length === 1 && n > 1) return Array.from({ length: n }, (_, k) => expandName(list[0], k + 1)); return list; }
/** connect(blocks, inputs[], outputs[]) by signal names. */
export function connectByName(models, inNames, outNames) {
  const sys = explicitSS(toSS(append(...models)));
  const uN = sys.meta.InputName, yN = sys.meta.OutputName;
  const resolve = (names, pool) => names.flatMap((nm) => { const exact = pool.map((x, i) => (x === nm ? i : -1)).filter((i) => i >= 0); if (exact.length) return [exact]; const vec = pool.map((x, i) => (x.startsWith(nm + '(') ? i : -1)).filter((i) => i >= 0); if (vec.length) return vec.map((i) => [i]); return [null]; });
  const nU = sys.nu, nY = sys.ny;
  const Fm = zerosM(nU, nY);
  for (let a = 0; a < nU; a++) { if (!uN[a]) continue; for (let b = 0; b < nY; b++) if (yN[b] === uN[a]) Fm[a][b] = 1; }
  // external inputs: each name drives all block inputs with that name
  const ext = [];
  for (const nm of inNames) {
    const idx = uN.map((x, i) => (x === nm ? i : -1)).filter((i) => i >= 0);
    if (idx.length) { ext.push({ name: nm, idx }); continue; }
    const vec = uN.map((x, i) => (x.startsWith(nm + '(') ? x : null)).filter((x) => x);
    if (vec.length) { for (const v of [...new Set(vec)]) ext.push({ name: v, idx: uN.map((x, i) => (x === v ? i : -1)).filter((i) => i >= 0) }); continue; }
    // an external input may also be an internal output name (break the loop there)
    const oi = yN.map((x, i) => (x === nm ? i : -1)).filter((i) => i >= 0);
    if (!oi.length) throw E('connect:unknownInput', `The input "${nm}" does not match any block input or output.`);
    ext.push({ name: nm, idx: [], fromOut: oi });
  }
  const G = zerosM(nU, ext.length);
  ext.forEach((e, c) => { for (const i of e.idx) G[i][c] = 1; if (e.fromOut) for (let a = 0; a < nU; a++) for (const o of e.fromOut) if (Fm[a][o]) { Fm[a][o] = 0; G[a][c] = 1; } });
  const n = sys.n;
  const Mi = K.inv(addM(eye(nU), mm(Fm, sys.D), -1));
  const MiF = mm(Mi, Fm), MiG = mm(Mi, G);
  const A = n ? addM(sys.A, mm(mm(sys.B, MiF), sys.C)) : [];
  const B = n ? mm(sys.B, MiG) : [];
  const Cy = n ? addM(sys.C, mm(mm(sys.D, MiF), sys.C)) : zerosM(nY, 0);
  const Dy = mm(sys.D, MiG);
  // u signals as outputs too
  const Cu = n ? mm(MiF, sys.C) : zerosM(nU, 0); const Du = MiG;
  const rowsC = [], rowsD = [], onames = [];
  for (const nm of outNames) {
    let idx = yN.map((x, i) => (x === nm ? i : -1)).filter((i) => i >= 0);
    if (idx.length) { rowsC.push(Cy[idx[0]]); rowsD.push(Dy[idx[0]]); onames.push(nm); continue; }
    idx = yN.map((x, i) => (x.startsWith(nm + '(') ? i : -1)).filter((i) => i >= 0);
    if (idx.length) { for (const i of idx) { rowsC.push(Cy[i]); rowsD.push(Dy[i]); onames.push(yN[i]); } continue; }
    idx = uN.map((x, i) => (x === nm ? i : -1)).filter((i) => i >= 0);
    if (idx.length) { rowsC.push(Cu[idx[0]]); rowsD.push(Du[idx[0]]); onames.push(nm); continue; }
    throw E('connect:unknownOutput', `The output "${nm}" does not match any block output.`);
  }
  return mkSS(A, B, rowsC, rowsD, sys.Ts, { InputName: ext.map((e) => e.name), OutputName: onames, StateName: sys.meta.StateName, TimeUnit: sys.meta.TimeUnit }, null, [onames.length, ext.length]);
}
/** Index-based connect(sys, Q, inputs, outputs) (1-based in Q; signed output indices). */
export function connectByIndex(sys0, Q, inputs, outputs) {
  const sys = explicitSS(toSS(sys0)); const nU = sys.nu, nY = sys.ny;
  const Fm = zerosM(nU, nY);
  for (const row of Q) { const u = row[0] - 1; for (const y of row.slice(1)) if (y) Fm[u][Math.abs(y) - 1] += Math.sign(y); }
  const G = zerosM(nU, inputs.length); inputs.forEach((u, c) => { G[u - 1][c] = 1; });
  const Mi = K.inv(addM(eye(nU), mm(Fm, sys.D), -1)); const MiF = mm(Mi, Fm), MiG = mm(Mi, G); const n = sys.n;
  const A = n ? addM(sys.A, mm(mm(sys.B, MiF), sys.C)) : [];
  const B = n ? mm(sys.B, MiG) : [];
  const Cy = n ? addM(sys.C, mm(mm(sys.D, MiF), sys.C)) : zerosM(nY, 0); const Dy = mm(sys.D, MiG);
  return mkSS(A, B, outputs.map((o) => Cy[o - 1]), outputs.map((o) => Dy[o - 1]), sys.Ts, { InputName: inputs.map((u) => sys.meta.InputName[u - 1]), OutputName: outputs.map((o) => sys.meta.OutputName[o - 1]) }, null, [outputs.length, inputs.length]);
}

// ------------------------------------------------------------ pidtune
export function pidtune(G, type = 'PI', wcTarget = null, pmTarget = 60) {
  if (G.ny * G.nu !== 1) throw E('pidtune:mimo', 'pidtune requires a SISO plant.');
  type = type.toUpperCase();
  const cont = G.Ts === 0; const Ts = G.Ts;
  const evalG = (w) => { const H = freqResp(G, [w])[0][0]; return [H.re[0], H.im[0]]; };
  const design = (w) => {
    const [gr, gi] = evalG(w); const gm = Math.hypot(gr, gi); if (!(gm > 0) || !Number.isFinite(gm)) return null;
    const gph = Math.atan2(gi, gr);
    const want = (-180 + pmTarget) * Math.PI / 180; // desired loop phase
    let cph = want - gph; cph -= 2 * Math.PI * Math.round(cph / (2 * Math.PI));
    const cm = 1 / gm; const cr = cm * Math.cos(cph), ci = cm * Math.sin(cph);
    // continuous-equivalent controller forms at s = jw
    let Kp = 0, Ki = 0, Kd = 0;
    if (type === 'P') { if (Math.abs(ci) > 0.05 * cm) return null; Kp = cm * Math.sign(cr); }
    else if (type === 'I') { if (Math.abs(cr) > 0.05 * cm) return null; Ki = -ci * w; }
    else if (type === 'PI') { Kp = cr; Ki = -ci * w; }
    else if (type === 'PD' || type === 'PDF') { Kp = cr; Kd = ci / w; }
    else { // PID / PIDF: Ti = 4 Td
      Kp = cr; if (Kp <= 0) return null; const a = ci / Kp; // w Td - 1/(4 w Td) = a → 4 w^2 Td^2 - 4 a w Td - 1 = 0
      const Td = (4 * a * w + Math.sqrt(16 * a * a * w * w + 16 * w * w)) / (8 * w * w);
      Kd = Kp * Td; Ki = Kp / (4 * Td);
    }
    if (Kp < 0 || Ki < 0 || Kd < 0) return null;
    if ((type.includes('I') && !(Ki > 0)) || (type.startsWith('P') && type !== 'I' && !(Kp > 0))) return null;
    return { Kp, Ki, Kd, Tf: type.endsWith('F') && Kd ? Kd / Kp / 10 : 0 };
  };
  const mkC = (g) => ({ type: 'pid', Kp: g.Kp, Ki: g.Ki, Kd: g.Kd, Tf: g.Tf, Ts: cont ? 0 : Ts, IFormula: cont ? '' : 'ForwardEuler', DFormula: cont ? '' : 'ForwardEuler', ny: 1, nu: 1, meta: fixMeta({}, 1, 1) });
  const pidTFlocal = (c) => {
    const s0 = []; let num = [c.Kp], den = [1];
    const addT = (n2, d2) => { const a = K.conv(num, d2), b = K.conv(n2, den); const L = Math.max(a.length, b.length); const pa = [...new Array(L - a.length).fill(0), ...a], pb = [...new Array(L - b.length).fill(0), ...b]; num = pa.map((x, i) => x + pb[i]); den = K.conv(den, d2); };
    if (cont) { if (c.Ki) addT([c.Ki], [1, 0]); if (c.Kd) addT([c.Kd, 0], c.Tf ? [c.Tf, 1] : [1]); }
    else { const T0 = Ts > 0 ? Ts : 1; if (c.Ki) addT([c.Ki * T0], [1, -1]); if (c.Kd) addT(c.Tf ? [c.Kd, -c.Kd] : [c.Kd, -c.Kd], c.Tf ? [c.Tf, T0 - c.Tf] : [T0, 0]); }
    void s0; return mkTF([[num]], [[den]], cont ? 0 : Ts, {});
  };
  const stableCL = (c) => { try { return isStable(feedback(mul(pidTFlocal(c), G), identity(1, G.Ts, 'tf'))); } catch { return false; } };
  let best = null;
  if (wcTarget) { const g = design(wcTarget); if (g && stableCL(g)) best = { g, w: wcTarget }; else if (g) best = { g, w: wcTarget }; }
  else {
    // scan crossover candidates; prefer the fastest stable design, bounded by the plant phase
    const p = poles(G); const mags = p.re.map((r, k) => Math.hypot(r, p.im[k])).filter((x) => x > 1e-9);
    const mid = mags.length ? Math.exp(mags.reduce((s, x) => s + Math.log(x), 0) / mags.length) : 1;
    let hi = Math.log10(mid) + 2, lo = Math.log10(mid) - 3;
    if (!cont) hi = Math.min(hi, Math.log10(Math.PI / (Ts > 0 ? Ts : 1)) - 0.5);
    const cands = []; for (let k = 0; k <= 120; k++) cands.push(10 ** (lo + (hi - lo) * k / 120));
    for (const w of cands) {
      const g = design(w); if (!g) continue;
      // reject designs that rely on a large derivative boost
      if (!stableCL(g)) continue;
      const [gr, gi] = evalG(w); const ph = Math.atan2(gi, gr) * 180 / Math.PI;
      if (type === 'PI' && ph < -180 + pmTarget + 5 - 90 + 10) continue;
      best = { g, w };
    }
    if (!best) { for (const w of cands) { const g = design(w); if (g) { best = { g, w }; break; } } }
  }
  if (!best) throw E('pidtune:fail', 'Could not find a stabilizing controller of this type for the plant.');
  const C = mkC(best.g);
  const stable = stableCL(best.g);
  return { C, info: { Stable: stable, CrossoverFrequency: best.w, PhaseMargin: pmTarget } };
}
void phaseDeg; void blockM; void blkdiag; void trimLead; void isZeroPoly; void lyapD; void poles;
