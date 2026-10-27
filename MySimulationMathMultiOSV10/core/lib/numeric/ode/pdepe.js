// pdepe: systems of parabolic/elliptic PDEs in one space variable
//   c(x,t,u,ux) u_t = x^-m d/dx( x^m f(x,t,u,ux) ) + s(x,t,u,ux),  m = 0, 1, 2
// with boundary conditions p(x,t,u) + q(x,t) f(x,t,u,ux) = 0. Method of lines:
// a second-order Petrov-Galerkin/finite-volume discretisation in the spirit of
// Skeel and Berzins (pdefun evaluated at interval midpoints, volumes weighted
// by x^m), integrated in time with the variable-order BDF solver (Dirichlet
// conditions become algebraic equations). pdeval interpolates a solution.
import { E, F, H, num, col, callFn, tensor, V, isText, toStr, toNum, isStruct, EPS } from '../_util.js';
import { optReader, makeTol, Recorder, fdJacobian, colorGroups } from './common.js';
import { bdfSolve } from './implicit.js';

function pdepeImpl(args, nargout, ctx) {
  if (args.length < 6) throw E('pdepe:nargin', 'pdepe needs m, pdefun, icfun, bcfun, xmesh and tspan.');
  const m = toNum(args[0], 'm');
  if (![0, 1, 2].includes(m)) throw E('pdepe:badM', 'm must be 0, 1 or 2.');
  const fnOf = (v) => (isText(v) ? toStr(v) : v);
  const pdefun = fnOf(args[1]), icfun = fnOf(args[2]), bcfun = fnOf(args[3]);
  const x = Array.from(F(args[4])); const tspan = Array.from(F(args[5]));
  if (x.length < 3) throw E('pdepe:meshTooShort', 'xmesh must have at least three points.');
  if (tspan.length < 3) throw E('pdepe:tspanTooShort', 'tspan must have at least three points.');
  for (let i = 1; i < x.length; i++) if (!(x[i] > x[i - 1])) throw E('pdepe:meshNotIncreasing', 'xmesh must be strictly increasing.');
  for (let i = 1; i < tspan.length; i++) if (!(tspan[i] > tspan[i - 1])) throw E('pdepe:tspanNotIncreasing', 'tspan must be strictly increasing.');
  if (m > 0 && x[0] < 0) throw E('pdepe:negativeMesh', 'xmesh must be nonnegative when m > 0.');
  const optsV = args.length > 6 && isStruct(args[6]) ? args[6] : null;
  const extra = args.slice(7);
  const nx = x.length;
  const u0s = x.map((xx) => Float64Array.from(F(callFn(ctx, icfun, [num(xx), ...extra], 1)[0])));
  const npde = u0s[0].length;
  const n = nx * npde;
  const y0 = new Float64Array(n); u0s.forEach((u, i) => y0.set(u, i * npde));
  const R = optReader(optsV);
  const tol = makeTol(R, n, 'pdepe');
  const stats = { nsteps: 0, nfailed: 0, nfevals: 0, npds: 0, ndecomps: 0, nsolves: 0 };
  const xm = []; for (let j = 0; j < nx - 1; j++) xm.push((x[j] + x[j + 1]) / 2);
  const ip = (a, b) => (Math.pow(b, m + 1) - Math.pow(a, m + 1)) / (m + 1);
  const Vl = xm.map((xi, j) => ip(x[j], xi)), Vr = xm.map((xi, j) => ip(xi, x[j + 1]));
  const pw = (xx) => (m === 0 ? 1 : Math.pow(xx, m));
  const sym = m > 0 && x[0] === 0;

  const callPde = (xx, t, u, dudx) => {
    const r = callFn(ctx, pdefun, [num(xx), num(t), col(u), col(dudx), ...extra], 3);
    if (r.length < 3) throw E('pdepe:pdefunOutputs', 'pdefun must return [c, f, s].');
    const c = F(r[0]), f = F(r[1]), s = F(r[2]);
    const fix = (a) => (a.length === npde ? a : a.length === 1 ? new Float64Array(npde).fill(a[0]) : (() => { throw E('pdepe:pdefunSize', `pdefun outputs must have ${npde} elements.`); })());
    return { c: fix(c), f: fix(f), s: fix(s) };
  };
  const res = (t, y, yp) => {
    stats.nfevals++;
    const mids = [];
    for (let j = 0; j < nx - 1; j++) {
      const h = x[j + 1] - x[j]; const u = new Float64Array(npde), du = new Float64Array(npde);
      for (let k = 0; k < npde; k++) { const a = y[j * npde + k], b = y[(j + 1) * npde + k]; u[k] = (a + b) / 2; du[k] = (b - a) / h; }
      mids.push(callPde(xm[j], t, u, du));
    }
    const ul = y.subarray(0, npde), ur = y.subarray((nx - 1) * npde, n);
    const b = callFn(ctx, bcfun, [num(x[0]), col(Float64Array.from(ul)), num(x[nx - 1]), col(Float64Array.from(ur)), num(t), ...extra], 4);
    if (b.length < 4) throw E('pdepe:bcfunOutputs', 'bcfun must return [pl, ql, pr, qr].');
    const ex = (v) => { const a = F(v); return a.length === npde ? a : new Float64Array(npde).fill(a[0]); };
    const pl = ex(b[0]), ql = ex(b[1]), pr = ex(b[2]), qr = ex(b[3]);
    const r = new Float64Array(n);
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < npde; k++) {
        const idx = i * npde + k;
        let mass = 0, rhs = 0;
        if (i > 0) { const L = mids[i - 1]; mass += Vr[i - 1] * L.c[k]; rhs += -pw(xm[i - 1]) * L.f[k] + Vr[i - 1] * L.s[k]; }
        if (i < nx - 1) { const Rm = mids[i]; mass += Vl[i] * Rm.c[k]; rhs += pw(xm[i]) * Rm.f[k] + Vl[i] * Rm.s[k]; }
        if (i === 0 && !sym) {
          if (ql[k] === 0) { r[idx] = pl[k]; continue; }
          rhs -= pw(x[0]) * (-pl[k] / ql[k]);
        }
        if (i === nx - 1) {
          if (qr[k] === 0) { r[idx] = pr[k]; continue; }
          rhs += pw(x[nx - 1]) * (-pr[k] / qr[k]);
        }
        r[idx] = mass * yp[idx] - rhs;
      }
    }
    return r;
  };
  // sparsity: node i couples with i-1, i, i+1, and the two boundary nodes with each other
  const pattern = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < nx; i++) for (let k = 0; k < npde; k++) {
    const row = pattern[i * npde + k];
    for (let j = Math.max(0, i - 1); j <= Math.min(nx - 1, i + 1); j++) for (let q = 0; q < npde; q++) row[j * npde + q] = true;
    if (i === 0 || i === nx - 1) for (const j of [0, nx - 1]) for (let q = 0; q < npde; q++) row[j * npde + q] = true;
  }
  const groups = colorGroups(pattern, n);
  const prob = {
    n,
    res,
    jac(t, y, yp) {
      stats.npds++;
      const r0 = res(t, y, yp);
      const dRdy = fdJacobian((tt, yy) => res(tt, yy, yp), t, y, r0, tol, groups, pattern);
      const d = 1; const yp2 = new Float64Array(n); for (let i = 0; i < n; i++) yp2[i] = yp[i] + d;
      const r1 = res(t, y, yp2);
      const dRdyp = Array.from({ length: n }, (_, i) => { const rr = new Array(n).fill(0); rr[i] = (r1[i] - r0[i]) / d; return rr; });
      return { dRdy, dRdyp };
    },
    yp0(t, y) {
      const z = new Float64Array(n); const r0 = res(t, y, z); const o = new Float64Array(n).fill(1); const r1 = res(t, y, o);
      const yp = new Float64Array(n); for (let i = 0; i < n; i++) { const dg = r1[i] - r0[i]; yp[i] = Math.abs(dg) > 1e-300 ? -r0[i] / dg : 0; }
      return yp;
    },
  };
  const P = {
    ctx, solver: 'pdepe', tspan, dir: 1, t0: tspan[0], tf: tspan[tspan.length - 1], y0, n, R, opts: optsV, extra: [], stats, tol, nonneg: [],
    hmax: Math.abs(R.num('MaxStep', 0.1 * (tspan[tspan.length - 1] - tspan[0]))), h0: R.get('InitialStep') !== undefined ? R.num('InitialStep') : null,
    implicit: true, forceArrays: true,
  };
  const rec = new Recorder(P, 2, 1);
  bdfSolve(P, prob, rec);
  const nt = rec.tout.length;
  if (nt < tspan.length) ctx.warning('numeric:pdepe:incomplete', `The integration stopped at t = ${rec.lastT}; the solution is returned at ${nt} of ${tspan.length} times.`);
  const out = new Float64Array(nt * nx * npde);
  rec.yout.forEach((y, i) => { for (let j = 0; j < nx; j++) for (let k = 0; k < npde; k++) out[i + nt * (j + nx * k)] = y[j * npde + k]; });
  void EPS;
  return tensor('double', npde === 1 ? [nt, nx] : [nt, nx, npde], out);
}

function pdevalImpl(args) {
  if (args.length < 4) throw E('pdeval:nargin', 'pdeval needs m, xmesh, ui and xout.');
  const x = Array.from(F(args[1])); const u = F(args[2]); const xo = Array.from(F(args[3]));
  const nx = x.length; if (u.length !== nx) throw E('pdeval:badUi', 'ui must have one value per mesh point.');
  const uo = new Float64Array(xo.length), du = new Float64Array(xo.length);
  xo.forEach((xx, q) => {
    if (xx < x[0] || xx > x[nx - 1]) throw E('pdeval:outside', 'xout must lie inside xmesh.');
    let j = 0; while (j < nx - 2 && xx > x[j + 1]) j++;
    const h = x[j + 1] - x[j]; const s = (xx - x[j]) / h;
    uo[q] = u[j] + s * (u[j + 1] - u[j]); du[q] = (u[j + 1] - u[j]) / h;
  });
  return [V(1, xo.length, uo), V(1, xo.length, du)];
}

export const builtins = { pdepe: pdepeImpl, pdeval: pdevalImpl };
export const help = {
  pdepe: H('Solve 1-D parabolic and elliptic PDE systems (method of lines with a stiff BDF integrator).', '1차원 포물형·타원형 편미분방정식 계를 풉니다 (선 방법 + 강성 BDF 적분기).', ['sol = pdepe(m, pdefun, icfun, bcfun, xmesh, tspan)', 'sol = pdepe(m, pdefun, icfun, bcfun, xmesh, tspan, options)']),
  pdeval: H('Interpolate a pdepe solution component at new points.', 'pdepe 해 성분을 새 점에서 보간합니다.', ['[uout, duoutdx] = pdeval(m, xmesh, ui, xout)']),
};
