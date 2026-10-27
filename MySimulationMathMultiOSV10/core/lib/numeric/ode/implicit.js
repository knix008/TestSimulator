// Stiff and implicit solvers. All of them work on the residual form
//   R(t, y, yp) = 0          (for M(t,y) y' = f(t,y):  R = M yp - f)
// and solve the stage equations  yp = (y - psi) / kappa,  R(t, y, yp) = 0  with
// a simplified Newton iteration (Jacobian dR/dy + dR/dyp / kappa, reused
// between steps until convergence suffers).
//   ode15s, ode15i : variable-step, variable-order BDF (orders 1..MaxOrder<=5)
//   ode23s         : modified Rosenbrock 2(3) (ODEs with a constant/time mass)
//   ode23t         : trapezoidal rule
//   ode23tb        : TR-BDF2
import { E, EPS, num, col, callFn, F } from '../_util.js';
import * as K from '../_kernels.js';
import { initialStep, hermite, lagrange, fdJacobian, mmul, failWarn, colorGroups } from './common.js';

// ------------------------------------------------------------ residual problems
/** Residual problem for M y' = f (ode15s/ode23t/ode23tb). */
export function odeResidual(P) {
  const n = P.n;
  return {
    n,
    res(t, y, yp) { const fy = P.f(t, y); const M = P.mass ? P.mass(t, y) : null; const r = mmul(M, yp); for (let i = 0; i < n; i++) r[i] -= fy[i]; return r; },
    jac(t, y) { const J = P.jacF(t, y); const M = P.mass ? P.mass(t, y) : K.eye(n); return { dRdy: J.map((r) => r.map((x) => -x)), dRdyp: M }; },
    yp0(t, y) {
      const fy = P.f(t, y);
      if (!P.mass) return fy;
      const M = P.mass(t, y); const L = K.lu(M);
      if (!L.singular) return Float64Array.from(K.luSolve(L, fy));
      // singular mass: least squares for the differential part
      return Float64Array.from(K.lstsq(M, Array.from(fy)));
    },
  };
}
/** Residual problem of ode15i: user F(t, y, yp). */
export function implicitResidual(P) {
  const { ctx, fn, extra, n, stats, R, solver } = P;
  const res = (t, y, yp) => {
    stats.nfevals++;
    const r = callFn(ctx, fn, [num(t), col(Float64Array.from(y)), col(Float64Array.from(yp)), ...extra], 1);
    const v = F(r[0]); if (v.length !== n) throw E(`${solver}:badOutputSize`, `The implicit ODE function must return a vector of length ${n}.`);
    return Float64Array.from(v);
  };
  const Jv = R.get('Jacobian');
  let jac;
  if (Jv !== undefined && Jv.cls === 'function_handle') {
    jac = (t, y, yp) => {
      stats.npds++;
      const r = callFn(ctx, Jv, [num(t), col(Float64Array.from(y)), col(Float64Array.from(yp)), ...extra], 2);
      return { dRdy: K.rowsOf(F(r[0]), n, n), dRdyp: K.rowsOf(F(r[1]), n, n) };
    };
  } else if (Jv !== undefined && Jv.cls === 'cell') {
    const a = K.rowsOf(F(Jv.data[0]), n, n), b = K.rowsOf(F(Jv.data[1]), n, n);
    jac = () => ({ dRdy: a, dRdyp: b });
  } else {
    jac = (t, y, yp) => {
      stats.npds++;
      const r0 = res(t, y, yp);
      return { dRdy: fdJacobian((tt, yy) => res(tt, yy, yp), t, y, r0, P.tol), dRdyp: fdJacobian((tt, zz) => res(tt, y, zz), t, yp, r0, P.tol) };
    };
  }
  return { n, res, jac, yp0: () => Float64Array.from(P.yp0) };
}

// ------------------------------------------------------------ Newton
class NewtonSolver {
  constructor(P, prob) { this.P = P; this.prob = prob; this.J = null; this.fresh = false; this.kappa = null; this.LU = null; }
  updateJac(t, y, yp) { this.J = this.prob.jac(t, y, yp); this.fresh = true; this.kappa = null; }
  factor(kappa) {
    if (this.kappa === kappa && this.LU) return;
    const { dRdy, dRdyp } = this.J; const n = dRdy.length;
    const G = K.zerosM(n, n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) G[i][j] = dRdy[i][j] + dRdyp[i][j] / kappa;
    this.LU = K.lu(G); this.kappa = kappa; this.P.stats.ndecomps++;
  }
  /** returns {y, yp} or null */
  solve(t, psi, kappa, guess) {
    this.factor(kappa);
    if (this.LU.singular) return null;
    const n = psi.length; const tol = this.P.tol;
    let y = Float64Array.from(guess); let normOld = 0, rate = 0;
    const scale = (v, yy) => { let m = 0; for (let i = 0; i < n; i++) { const s = Math.max(tol.rtol * Math.abs(yy[i]), tol.atol[i]); m = Math.max(m, Math.abs(v[i]) / s); } return m; };
    for (let it = 0; it < 5; it++) {
      const yp = new Float64Array(n); for (let i = 0; i < n; i++) yp[i] = (y[i] - psi[i]) / kappa;
      const r = this.prob.res(t, y, yp);
      for (let i = 0; i < n; i++) r[i] = -r[i];
      const d = K.luSolve(this.LU, r); this.P.stats.nsolves++;
      for (let i = 0; i < n; i++) y[i] += d[i];
      if (!y.every(Number.isFinite)) return null;
      const nd = scale(d, y);
      if (it > 0) { rate = nd / (normOld || 1e-300); if (rate > 0.9) return null; }
      if (nd <= 1e-3 || (it > 0 && nd * rate / (1 - rate) <= 0.05) || nd === 0) {
        const ypn = new Float64Array(n); for (let i = 0; i < n; i++) ypn[i] = (y[i] - psi[i]) / kappa;
        return { y, yp: ypn };
      }
      normOld = nd;
    }
    return null;
  }
}

// ------------------------------------------------------------ BDF (ode15s / ode15i)
function derivWeights(nodes) {
  // derivative at nodes[0] of the Lagrange basis
  const k = nodes.length; const x = nodes[0]; const w = new Array(k).fill(0);
  for (let j = 0; j < k; j++) {
    if (j === 0) { let s = 0; for (let m = 1; m < k; m++) s += 1 / (x - nodes[m]); w[0] = s; continue; }
    let p = 1 / (nodes[j] - nodes[0]);
    for (let m = 1; m < k; m++) if (m !== j) p *= (x - nodes[m]) / (nodes[j] - nodes[m]);
    w[j] = p;
  }
  return w;
}
function extrap(ts, ys, t) { return lagrange(ts, ys)(t); }

export function bdfSolve(P, prob, rec) {
  const n = P.n, dir = P.dir, tf = P.tf;
  const maxOrder = Math.max(1, Math.min(5, Math.round(P.R.num('MaxOrder', 5))));
  let t = P.t0, y = Float64Array.from(P.y0);
  let yp = prob.yp0(t, y);
  rec.start(t, y, yp);
  const ts = [t], ys = [Float64Array.from(y)];
  const NS = new NewtonSolver(P, prob);
  let k = 1, stepsAtK = 0, fails = 0;
  let absh = Math.min(initialStep(P, yp, 1 / 2) * 0.5, P.hmax);
  if (!P.h0) absh = Math.min(absh, Math.abs(tf - t) * 1e-2 + 0, P.hmax);
  for (;;) {
    P.ctx.checkInterrupt();
    const hmin = 16 * EPS * Math.abs(t);
    absh = Math.min(P.hmax, Math.max(hmin, absh));
    const last = Math.abs(tf - t) <= 1.1 * absh;
    if (last) absh = Math.abs(tf - t);
    const tn1 = last ? tf : t + dir * absh;
    const kk = Math.min(k, ts.length);
    const nodes = [tn1]; const vals = [];
    for (let j = 0; j < kk; j++) { nodes.push(ts[ts.length - 1 - j]); vals.push(ys[ys.length - 1 - j]); }
    const w = derivWeights(nodes);
    const kappa = 1 / w[0]; const psi = new Float64Array(n);
    for (let j = 1; j < nodes.length; j++) for (let i = 0; i < n; i++) psi[i] -= w[j] * vals[j - 1][i] * kappa;
    // predictors of order kk-1, kk, kk+1
    const pred = (q) => {
      if (q === 1 && ts.length < 2) { const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = y[i] + (tn1 - t) * yp[i]; return r; }
      if (ts.length < q + 1) return null;
      return extrap(ts.slice(-(q + 1)), ys.slice(-(q + 1)), tn1);
    };
    const yPred = pred(kk) || pred(1);
    if (!NS.J) NS.updateJac(t, y, yp);
    const sol = NS.solve(tn1, psi, kappa, yPred);
    if (!sol) {
      if (!NS.fresh) { NS.updateJac(t, y, yp); continue; }
      P.stats.nfailed++; fails++;
      if (absh <= hmin) { failWarn(P, t, hmin); return; }
      absh = Math.max(hmin, absh * 0.25); NS.kappa = null;
      if (fails > 2) k = 1;
      continue;
    }
    const ynew = sol.y;
    const ed = new Float64Array(n); for (let i = 0; i < n; i++) ed[i] = ynew[i] - yPred[i];
    const err = P.tol.err(ed, y, ynew) / (kk + 1);
    if (err > 1) {
      P.stats.nfailed++; fails++;
      if (absh <= hmin) { failWarn(P, t, hmin); return; }
      absh = Math.max(hmin, absh * Math.max(0.1, 0.9 * Math.pow(err, -1 / (kk + 1))));
      if (fails >= 2 && k > 1) { k--; stepsAtK = 0; }
      if (fails >= 3 && !NS.fresh) NS.J = null;
      continue;
    }
    P.stats.nsteps++;
    for (const i of P.nonneg) if (ynew[i] < 0) ynew[i] = 0;
    const iNodes = nodes.slice(), iVals = [ynew, ...vals];
    const interp = (tq) => (tq === tn1 ? Float64Array.from(ynew) : lagrange(iNodes, iVals)(tq));
    const ypAt = (tq) => { const r = new Float64Array(n); const dt = 1e-7 * Math.max(Math.abs(tn1 - t), 1e-300); const a = interp(tq + dt), b = interp(tq - dt); for (let i = 0; i < n; i++) r[i] = (a[i] - b[i]) / (2 * dt); return r; };
    if (rec.step(t, y, tn1, ynew, interp, { yp: sol.yp, ypAt })) return;
    // order selection
    let r = err === 0 ? 2 : 0.9 * Math.pow(err, -1 / (kk + 1)); let knew = kk;
    stepsAtK++;
    if (kk > 1) {
      const pl = pred(kk - 1);
      if (pl) { for (let i = 0; i < n; i++) ed[i] = ynew[i] - pl[i]; const el = P.tol.err(ed, y, ynew) / kk; const rl = el === 0 ? 2 : 0.85 * Math.pow(el, -1 / kk); if (rl > r) { r = rl; knew = kk - 1; } }
    }
    if (kk < maxOrder && stepsAtK >= kk + 1 && knew === kk) {
      const ph = pred(kk + 1);
      if (ph) { for (let i = 0; i < n; i++) ed[i] = ynew[i] - ph[i]; const eh = P.tol.err(ed, y, ynew) / (kk + 2); const rh = eh === 0 ? 2 : 0.8 * Math.pow(eh, -1 / (kk + 2)); if (rh > r) { r = rh; knew = kk + 1; } }
    }
    if (knew !== k) stepsAtK = 0;
    k = knew;
    ts.push(tn1); ys.push(Float64Array.from(ynew)); if (ts.length > maxOrder + 3) { ts.shift(); ys.shift(); }
    t = tn1; y = ynew; yp = sol.yp; NS.fresh = false;
    if (last) return;
    if (fails) r = Math.min(r, 1);
    fails = 0;
    if (r < 1) absh *= Math.max(0.2, r); else if (r > 1.2) absh *= Math.min(2, r);
  }
}

// ------------------------------------------------------------ ode23t / ode23tb
export function trSolve(P, prob, rec, variant) {
  const n = P.n, dir = P.dir, tf = P.tf;
  const g = 2 - Math.SQRT2;
  const C = variant === 'trbdf2' ? Math.abs((-3 * g * g + 4 * g - 2) / (12 * (2 - g))) : 1 / 12;
  let t = P.t0, y = Float64Array.from(P.y0), yp = prob.yp0(t, y);
  rec.start(t, y, yp);
  const NS = new NewtonSolver(P, prob);
  let absh = Math.min(initialStep(P, yp, 1 / 3) * 0.5, P.hmax);
  let prev = null; // {t, yp}
  let fails = 0;
  for (;;) {
    P.ctx.checkInterrupt();
    const hmin = 16 * EPS * Math.abs(t);
    absh = Math.min(P.hmax, Math.max(hmin, absh));
    const last = Math.abs(tf - t) <= 1.1 * absh;
    if (last) absh = Math.abs(tf - t);
    const tn1 = last ? tf : t + dir * absh; const h = tn1 - t;
    if (!NS.J) NS.updateJac(t, y, yp);
    let ynew, ypnew, d2 = null;
    let ok = true;
    if (variant === 'trbdf2') {
      const tg = t + g * h;
      const psi1 = new Float64Array(n), gs1 = new Float64Array(n);
      for (let i = 0; i < n; i++) { psi1[i] = y[i] + g * h / 2 * yp[i]; gs1[i] = y[i] + g * h * yp[i]; }
      const s1 = NS.solve(tg, psi1, g * h / 2, gs1);
      if (s1) {
        const a = 1 / (g * (2 - g)), b = (1 - g) * (1 - g) / (g * (2 - g));
        const psi2 = new Float64Array(n), gs2 = new Float64Array(n);
        for (let i = 0; i < n; i++) { psi2[i] = a * s1.y[i] - b * y[i]; gs2[i] = s1.y[i] + (1 - g) * h * s1.yp[i]; }
        const s2 = NS.solve(tn1, psi2, (1 - g) / (2 - g) * h, gs2);
        if (s2) {
          ynew = s2.y; ypnew = s2.yp;
          d2 = new Float64Array(n);
          for (let i = 0; i < n; i++) { const d1a = (s1.yp[i] - yp[i]) / (g * h), d1b = (ypnew[i] - s1.yp[i]) / ((1 - g) * h); d2[i] = 2 * (d1b - d1a) / h; }
        } else ok = false;
      } else ok = false;
    } else {
      const psi = new Float64Array(n), gs = new Float64Array(n);
      for (let i = 0; i < n; i++) { psi[i] = y[i] + h / 2 * yp[i]; gs[i] = y[i] + h * yp[i]; }
      const s = NS.solve(tn1, psi, h / 2, gs);
      if (s) {
        ynew = s.y; ypnew = s.yp; d2 = new Float64Array(n);
        if (prev) { for (let i = 0; i < n; i++) { const d1a = (yp[i] - prev.yp[i]) / (t - prev.t), d1b = (ypnew[i] - yp[i]) / h; d2[i] = 2 * (d1b - d1a) / (tn1 - prev.t); } }
        else for (let i = 0; i < n; i++) d2[i] = (ypnew[i] - yp[i]) / h * 2 / Math.abs(h) * 0.5;
      } else ok = false;
    }
    if (!ok) {
      if (!NS.fresh) { NS.updateJac(t, y, yp); continue; }
      P.stats.nfailed++; fails++;
      if (absh <= hmin) { failWarn(P, t, hmin); return; }
      absh = Math.max(hmin, absh * 0.25); continue;
    }
    const ed = new Float64Array(n); for (let i = 0; i < n; i++) ed[i] = C * Math.abs(h) ** 3 * d2[i];
    const err = P.tol.err(ed, y, ynew);
    if (err > 1) {
      P.stats.nfailed++; fails++;
      if (absh <= hmin) { failWarn(P, t, hmin); return; }
      absh = Math.max(hmin, absh * Math.max(0.1, 0.8 * Math.pow(err, -1 / 3)));
      continue;
    }
    P.stats.nsteps++;
    for (const i of P.nonneg) if (ynew[i] < 0) ynew[i] = 0;
    const interp = hermite(t, y, yp, tn1, ynew, ypnew);
    const ta = t, ya = Float64Array.from(y), ypa = Float64Array.from(yp);
    const ypAt = (tq) => { const hh = tn1 - ta, s = (tq - ta) / hh; const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = (6 * s * s - 6 * s) / hh * ya[i] + (3 * s * s - 4 * s + 1) * ypa[i] + (-6 * s * s + 6 * s) / hh * ynew[i] + (3 * s * s - 2 * s) * ypnew[i]; return r; };
    if (rec.step(t, y, tn1, ynew, interp, { yp: ypnew, ypAt })) return;
    prev = { t, yp: Float64Array.from(yp) };
    t = tn1; y = ynew; yp = ypnew; NS.fresh = false;
    if (last) return;
    let r = err === 0 ? 4 : Math.min(4, 0.8 * Math.pow(err, -1 / 3));
    if (fails) r = Math.min(r, 1);
    fails = 0;
    absh *= Math.max(0.2, r);
  }
}

// ------------------------------------------------------------ ode23s (Rosenbrock)
export function rosenbrockSolve(P, rec) {
  const n = P.n, dir = P.dir, tf = P.tf;
  if (P.mass && P.massDep === 'strong') throw E('ode23s:stateMass', 'ode23s cannot solve problems with a strongly state-dependent mass matrix. Use ode15s or ode23t.');
  const d = 1 / (2 + Math.SQRT2), e32 = 6 + Math.SQRT2;
  let t = P.t0, y = Float64Array.from(P.y0);
  const massAt = (tt, yy) => (P.mass ? P.mass(tt, yy) : null);
  let M = massAt(t, y);
  const toYp = (fy, MM) => { if (!MM) return fy; const L = K.lu(MM); if (L.singular) throw E('ode23s:singularMass', 'ode23s cannot solve problems with a singular mass matrix. Use ode15s or ode23t.'); return Float64Array.from(K.luSolve(L, fy)); };
  let F0 = P.f(t, y);
  rec.start(t, y, toYp(F0, M));
  let absh = Math.min(initialStep(P, toYp(F0, M), 1 / 3), P.hmax);
  let J = null; let fails = 0;
  for (;;) {
    P.ctx.checkInterrupt();
    const hmin = 16 * EPS * Math.abs(t);
    absh = Math.min(P.hmax, Math.max(hmin, absh));
    const last = Math.abs(tf - t) <= 1.1 * absh;
    if (last) absh = Math.abs(tf - t);
    if (!J || !P.jacConst) J = P.jacF(t, y, F0);
    const h = dir * absh; const tn1 = last ? tf : t + h;
    // df/dt
    const dt = Math.sqrt(EPS) * Math.max(Math.abs(t), Math.abs(h));
    const Ft = P.f(t + dt, y); const T = new Float64Array(n); for (let i = 0; i < n; i++) T[i] = (Ft[i] - F0[i]) / dt;
    const W = K.zerosM(n, n); const Mm = M || K.eye(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) W[i][j] = Mm[i][j] - h * d * J[i][j];
    const L = K.lu(W); P.stats.ndecomps++;
    if (L.singular) { P.stats.nfailed++; absh *= 0.5; if (absh <= hmin) { failWarn(P, t, hmin); return; } continue; }
    const rhs1 = new Float64Array(n); for (let i = 0; i < n; i++) rhs1[i] = F0[i] + h * d * T[i];
    const k1 = Float64Array.from(K.luSolve(L, rhs1));
    const y1 = new Float64Array(n); for (let i = 0; i < n; i++) y1[i] = y[i] + 0.5 * h * k1[i];
    const F1 = P.f(t + 0.5 * h, y1);
    const Mk1 = mmul(M, k1);
    const r2 = new Float64Array(n); for (let i = 0; i < n; i++) r2[i] = F1[i] - Mk1[i];
    const k2 = Float64Array.from(K.luSolve(L, r2)); for (let i = 0; i < n; i++) k2[i] += k1[i];
    const ynew = new Float64Array(n); for (let i = 0; i < n; i++) ynew[i] = y[i] + h * k2[i];
    const F2 = P.f(tn1, ynew);
    const Mk2 = mmul(M, k2);
    const r3 = new Float64Array(n); for (let i = 0; i < n; i++) r3[i] = F2[i] - e32 * (Mk2[i] - F1[i]) - 2 * (Mk1[i] - F0[i]) + h * d * T[i];
    const k3 = K.luSolve(L, r3); P.stats.nsolves += 3;
    const ed = new Float64Array(n); for (let i = 0; i < n; i++) ed[i] = h / 6 * (k1[i] - 2 * k2[i] + k3[i]);
    const err = ynew.every(Number.isFinite) ? P.tol.err(ed, y, ynew) : Infinity;
    if (err > 1) {
      P.stats.nfailed++; fails++;
      if (absh <= hmin) { failWarn(P, t, hmin); return; }
      absh = Math.max(hmin, absh * Math.max(0.1, 0.8 * Math.pow(err, -1 / 3)));
      continue;
    }
    P.stats.nsteps++;
    for (const i of P.nonneg) if (ynew[i] < 0) ynew[i] = 0;
    const t0 = t, y0 = Float64Array.from(y), c1 = 1 / (1 - 2 * d);
    const interp = (tq) => { const s = (tq - t0) / h; const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = y0[i] + h * (s * (1 - s) * c1 * k1[i] + s * (s - 2 * d) * c1 * k2[i]); return r; };
    const ypAt = (tq) => { const s = (tq - t0) / h; const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = (1 - 2 * s) * c1 * k1[i] + (2 * s - 2 * d) * c1 * k2[i]; return r; };
    const Mn = massAt(tn1, ynew);
    if (rec.step(t, y, tn1, ynew, interp, { yp: toYp(F2, Mn), ypAt })) return;
    t = tn1; y = ynew; F0 = F2; M = Mn;
    if (last) return;
    let r = err === 0 ? 5 : Math.min(5, 0.8 * Math.pow(err, -1 / 3));
    if (fails) r = Math.min(r, 1);
    fails = 0;
    absh *= Math.max(0.2, r);
  }
}

export { colorGroups };
