// Explicit (non-stiff) solvers: embedded Runge-Kutta pairs (ode45 Dormand-
// Prince 5(4), ode23 Bogacki-Shampine 3(2), ode78/ode89 Fehlberg 7(8) with
// local extrapolation) and a variable-step, variable-order Adams-Bashforth-
// Moulton PECE method (ode113).
import { EPS } from '../_util.js';
import { explicitRhs, initialStep, hermite, ntrp45, ntrp45d, failWarn } from './common.js';

const DP = {
  c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
  A: [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ],
  b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0],
  e: [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40],
  pow: 1 / 5, fsal: true, dense: 'rk45',
};
const BS = {
  c: [0, 1 / 2, 3 / 4, 1],
  A: [[], [1 / 2], [0, 3 / 4], [2 / 9, 1 / 3, 4 / 9]],
  b: [2 / 9, 1 / 3, 4 / 9, 0],
  e: [-5 / 72, 1 / 12, 1 / 9, -1 / 8],
  pow: 1 / 3, fsal: true,
};
// Runge-Kutta-Fehlberg 7(8): propagate the 8th-order solution.
const F78 = (() => {
  const A = [
    [],
    [2 / 27],
    [1 / 36, 1 / 12],
    [1 / 24, 0, 1 / 8],
    [5 / 12, 0, -25 / 16, 25 / 16],
    [1 / 20, 0, 0, 1 / 4, 1 / 5],
    [-25 / 108, 0, 0, 125 / 108, -65 / 27, 125 / 54],
    [31 / 300, 0, 0, 0, 61 / 225, -2 / 9, 13 / 900],
    [2, 0, 0, -53 / 6, 704 / 45, -107 / 9, 67 / 90, 3],
    [-91 / 108, 0, 0, 23 / 108, -976 / 135, 311 / 54, -19 / 60, 17 / 6, -1 / 12],
    [2383 / 4100, 0, 0, -341 / 164, 4496 / 1025, -301 / 82, 2133 / 4100, 45 / 82, 45 / 164, 18 / 41],
    [3 / 205, 0, 0, 0, 0, -6 / 41, -3 / 205, -3 / 41, 3 / 41, 6 / 41, 0],
    [-1777 / 4100, 0, 0, -341 / 164, 4496 / 1025, -289 / 82, 2193 / 4100, 51 / 82, 33 / 164, 12 / 41, 0, 1],
  ];
  const c = [0, 2 / 27, 1 / 9, 1 / 6, 5 / 12, 1 / 2, 5 / 6, 1 / 6, 2 / 3, 1 / 3, 1, 0, 1];
  const b = [0, 0, 0, 0, 0, 34 / 105, 9 / 35, 9 / 35, 9 / 280, 9 / 280, 0, 41 / 840, 41 / 840];
  const w = 41 / 840; const e = [w, 0, 0, 0, 0, 0, 0, 0, 0, 0, w, -w, -w];
  return { c, A, b, e, pow: 1 / 8, fsal: false };
})();
export const TABLEAUX = { DP, BS, F78 };

/** Generic embedded explicit Runge-Kutta integrator. */
export function rkSolve(P, rec, tab, opts = {}) {
  const f = explicitRhs(P);
  const { c, A, b, e, pow, fsal } = tab; const s = c.length; const n = P.n; const dir = P.dir;
  let t = P.t0, y = Float64Array.from(P.y0), tf = P.tf;
  let f0 = f(t, y);
  rec.start(t, y, f0);
  let absh = Math.min(initialStep(P, f0, pow), P.hmax);
  const Ks = Array.from({ length: s }, () => new Float64Array(n));
  const yi = new Float64Array(n);
  const stepTo = opts.stepToOutput && P.tspan.length > 2;
  let nextOut = 1;
  let done = false;
  while (!done) {
    P.ctx.checkInterrupt();
    const hmin = 16 * EPS * Math.abs(t);
    absh = Math.min(P.hmax, Math.max(hmin, absh));
    let target = tf;
    if (stepTo) { while (nextOut < P.tspan.length && (P.tspan[nextOut] - t) * dir <= 0) nextOut++; if (nextOut < P.tspan.length) target = P.tspan[nextOut]; }
    if (1.1 * absh >= Math.abs(target - t)) absh = Math.abs(target - t);
    let nofailed = true, err, tnew, ynew;
    for (;;) {
      const h = dir * absh;
      Ks[0].set(f0);
      for (let i = 1; i < s; i++) {
        const Ai = A[i];
        for (let q = 0; q < n; q++) { let acc = 0; for (let j = 0; j < Ai.length; j++) if (Ai[j]) acc += Ai[j] * Ks[j][q]; yi[q] = y[q] + h * acc; }
        Ks[i] = f(t + c[i] * h, yi);
      }
      tnew = (absh === Math.abs(target - t)) ? target : t + h;
      ynew = new Float64Array(n);
      for (let q = 0; q < n; q++) { let acc = 0; for (let j = 0; j < s; j++) if (b[j]) acc += b[j] * Ks[j][q]; ynew[q] = y[q] + h * acc; }
      const ev = new Float64Array(n);
      for (let q = 0; q < n; q++) { let acc = 0; for (let j = 0; j < s; j++) if (e[j]) acc += e[j] * Ks[j][q]; ev[q] = h * acc; }
      err = P.tol.err(ev, y, ynew);
      if (err > 1) {
        P.stats.nfailed++;
        if (absh <= hmin) { failWarn(P, t, hmin); rec.finishEarly = true; return; }
        if (nofailed) { nofailed = false; absh = Math.max(hmin, absh * Math.max(0.1, 0.8 * Math.pow(err, -pow))); }
        else absh = Math.max(hmin, 0.5 * absh);
        continue;
      }
      break;
    }
    P.stats.nsteps++;
    for (const i of P.nonneg) if (ynew[i] < 0) ynew[i] = 0;
    const fnew = fsal ? Float64Array.from(Ks[s - 1]) : f(tnew, ynew);
    let interp, extra;
    if (tab.dense === 'rk45') {
      const t0 = t, y0 = Float64Array.from(y), h = tnew - t, KK = Ks.map((k) => Float64Array.from(k));
      interp = (tq) => (tq === tnew ? Float64Array.from(ynew) : ntrp45(t0, y0, h, KK, tq));
      extra = { yp: fnew, K: KK, ypAt: (tq) => ntrp45d(t0, h, KK, tq, n) };
    } else {
      interp = hermite(t, y, f0, tnew, ynew, fnew);
      const t0 = t, y0 = Float64Array.from(y), fa = Float64Array.from(f0);
      extra = { yp: fnew, ypAt: (tq) => hermiteD(t0, y0, fa, tnew, ynew, fnew, tq) };
    }
    if (rec.step(t, y, tnew, ynew, interp, extra)) return;
    if (tnew === tf) done = true;
    t = tnew; y = ynew; f0 = fnew;
    if (nofailed) { const r = err === 0 ? 5 : Math.min(5, 0.8 * Math.pow(err, -pow)); absh *= r; }
  }
}
function hermiteD(t0, y0, f0, t1, y1, f1, t) {
  const h = t1 - t0; const s = (t - t0) / h; const n = y0.length; const r = new Float64Array(n);
  const d00 = (6 * s * s - 6 * s) / h, d10 = 3 * s * s - 4 * s + 1, d01 = (-6 * s * s + 6 * s) / h, d11 = 3 * s * s - 2 * s;
  for (let i = 0; i < n; i++) r[i] = d00 * y0[i] + d10 * f0[i] + d01 * y1[i] + d11 * f1[i];
  return r;
}

// ------------------------------------------------------------ Adams (ode113)
const GL8 = (() => {
  const x = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
  const w = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
  return { x, w };
})();
/** weights w_i = ∫_{a}^{b} L_i(s) ds for Lagrange basis on nodes */
function intWeights(nodes, a, b) {
  const k = nodes.length; const w = new Array(k).fill(0);
  if (a === b) return w;
  const hm = (b - a) / 2, mid = (a + b) / 2;
  for (let q = 0; q < 8; q++) {
    const s = mid + hm * GL8.x[q];
    for (let i = 0; i < k; i++) {
      let l = 1; for (let j = 0; j < k; j++) if (j !== i) l *= (s - nodes[j]) / (nodes[i] - nodes[j]);
      w[i] += GL8.w[q] * hm * l;
    }
  }
  return w;
}

export function adamsSolve(P, rec) {
  const f = explicitRhs(P);
  const n = P.n, dir = P.dir, tf = P.tf; const KMAX = 10;
  let t = P.t0, y = Float64Array.from(P.y0);
  let fy = f(t, y);
  rec.start(t, y, fy);
  const ts = [t], fs = [Float64Array.from(fy)];
  let k = 1; let absh = Math.min(initialStep(P, fy, 1 / 2), P.hmax);
  let fails = 0;
  for (;;) {
    P.ctx.checkInterrupt();
    const hmin = 16 * EPS * Math.abs(t);
    absh = Math.min(P.hmax, Math.max(hmin, absh));
    const last = Math.abs(tf - t) <= 1.1 * absh;
    if (last) absh = Math.abs(tf - t);
    const h = dir * absh; const tnew = last ? tf : t + h;
    const kk = Math.min(k, ts.length);
    const pn = ts.slice(-kk).reverse(), pf = fs.slice(-kk).reverse();
    const wp = intWeights(pn, t, tnew);
    const yp = Float64Array.from(y);
    for (let j = 0; j < kk; j++) for (let i = 0; i < n; i++) yp[i] += wp[j] * pf[j][i];
    const fp = f(tnew, yp);
    const cn = [tnew, ...pn], cf = [fp, ...pf];
    const wc = intWeights(cn, t, tnew);
    const yc = Float64Array.from(y);
    for (let j = 0; j < cn.length; j++) for (let i = 0; i < n; i++) yc[i] += wc[j] * cf[j][i];
    const ed = new Float64Array(n); for (let i = 0; i < n; i++) ed[i] = yc[i] - yp[i];
    const err = P.tol.err(ed, y, yc) * 0.5;
    // lower-order estimate for order reduction
    let errLow = Infinity;
    if (kk > 1) {
      const wl = intWeights(pn.slice(0, kk - 1), t, tnew); const yl = Float64Array.from(y);
      for (let j = 0; j < kk - 1; j++) for (let i = 0; i < n; i++) yl[i] += wl[j] * pf[j][i];
      for (let i = 0; i < n; i++) ed[i] = yc[i] - yl[i];
      errLow = P.tol.err(ed, y, yc) * 0.5;
    }
    if (err > 1) {
      P.stats.nfailed++; fails++;
      if (absh <= hmin) { failWarn(P, t, hmin); return; }
      absh = Math.max(hmin, absh * Math.max(0.1, 0.8 * Math.pow(err, -1 / (kk + 1))));
      if (fails >= 3) k = 1; else if (errLow < err && k > 1) k--;
      continue;
    }
    P.stats.nsteps++;
    for (const i of P.nonneg) if (yc[i] < 0) yc[i] = 0;
    const fc = f(tnew, yc);
    const t0 = t, y0 = Float64Array.from(y), cfi = [fc, ...pf];
    const interp = (tq) => {
      if (tq === tnew) return Float64Array.from(yc);
      const w = intWeights(cn, t0, tq); const r = Float64Array.from(y0);
      for (let j = 0; j < cn.length; j++) for (let i = 0; i < n; i++) r[i] += w[j] * cfi[j][i];
      return r;
    };
    const ypAt = (tq) => { const r = new Float64Array(n); for (let j = 0; j < cn.length; j++) { let l = 1; for (let m = 0; m < cn.length; m++) if (m !== j) l *= (tq - cn[m]) / (cn[j] - cn[m]); for (let i = 0; i < n; i++) r[i] += l * cfi[j][i]; } return r; };
    if (rec.step(t, y, tnew, yc, interp, { yp: fc, ypAt })) return;
    ts.push(tnew); fs.push(fc); if (ts.length > KMAX + 2) { ts.shift(); fs.shift(); }
    t = tnew; y = yc;
    if (last) return;
    // step size and order for the next step
    const growth = fails ? 1 : 2;
    let r = err === 0 ? growth : Math.min(growth, 0.8 * Math.pow(err, -1 / (kk + 1)));
    if (kk > 1 && errLow <= err) { const rl = errLow === 0 ? growth : Math.min(growth, 0.8 * Math.pow(errLow, -1 / kk)); if (rl > r) { r = rl; k = kk - 1; } }
    else if (k < KMAX && ts.length > k) k = kk + 1;
    fails = 0;
    absh *= Math.max(0.2, r);
  }
}
