// Unconstrained minimization: fminsearch (Nelder–Mead simplex, Lagarias et al.)
// and fminunc (BFGS quasi-Newton with a strong-Wolfe line search, or a
// trust-region Newton method with Steihaug conjugate gradients when the
// gradient is supplied).
import { num } from '../../../value.js';
import { E, F, H, fnArg, V } from '../_util.js';
import {
  getOpts, optNum, optStr, optBool, dispLevel, scalarFn, gradFn, fdGrad, makeOutputFcn, finalMessage,
  outStruct, pad, g4, EPS, xOut, infNorm, twoNorm, fromProblem, zerosM, solve,
} from './common.js';

const epsOf = (x) => { const a = Math.abs(x); if (a === 0 || !Number.isFinite(a)) return Number.MIN_VALUE; return 2 ** (Math.floor(Math.log2(a)) - 52); };

function fminsearch(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'options']);
  if (args.length < 2) throw E('fminsearch:notEnoughInputs', 'fminsearch requires a function and a starting point.');
  const fh = fnArg(args[0], 'FUN');
  const dims = args[1].dims || [1, 1];
  const x0 = Float64Array.from(F(args[1], 'X0'));
  const n = x0.length;
  const o = getOpts(args[2]);
  const extra = args.slice(3);
  const tolx = optNum(o, ['TolX', 'StepTolerance'], 1e-4);
  const tolf = optNum(o, ['TolFun', 'FunctionTolerance'], 1e-4);
  const maxfun = optNum(o, ['MaxFunEvals', 'MaxFunctionEvaluations'], 200 * n, n);
  const maxiter = optNum(o, ['MaxIter', 'MaxIterations'], 200 * n, n);
  const level = dispLevel(o, 'notify');
  const outFcn = makeOutputFcn(ctx, o);
  const cnt = { n: 0 };
  const f = scalarFn(ctx, fh, dims, cnt, extra);
  const rho = 1, chi = 2, psi = 0.5, sigma = 0.5;
  let v = [Float64Array.from(x0)], fv = [f(x0)];
  let how = '';
  const header = () => ctx.out('\n Iteration   Func-count         f(x)         Procedure\n');
  const show = (it, proc) => { if (level === 'iter') ctx.out(`${pad(it, 6)}${pad(cnt.n, 13)}${pad(g4(fv[0]), 17)}         ${proc}\n`); };
  if (level === 'iter') header();
  show(0, '');
  for (let j = 0; j < n; j++) {
    const y = Float64Array.from(x0);
    if (y[j] !== 0) y[j] = 1.05 * y[j]; else y[j] = 0.00025;
    v.push(y); fv.push(f(y));
  }
  const sortSimplex = () => {
    const idx = fv.map((_, i) => i).sort((a, b) => (fv[a] - fv[b]) || (a - b));
    v = idx.map((i) => v[i]); fv = idx.map((i) => fv[i]);
  };
  sortSimplex();
  let itercount = 1; how = 'initial simplex';
  show(itercount, how);
  let flag = 1, msg = '';
  const ov = () => ({ iteration: itercount, funccount: cnt.n, fval: fv[0], procedure: how });
  if (outFcn && outFcn(v[0], dims, ov(), 'init')) { flag = -1; }
  while (flag === 1 && cnt.n < maxfun && itercount < maxiter) {
    let df = 0; for (let j = 1; j <= n; j++) df = Math.max(df, Math.abs(fv[0] - fv[j]));
    let dx = 0; for (let j = 1; j <= n; j++) for (let i = 0; i < n; i++) dx = Math.max(dx, Math.abs(v[j][i] - v[0][i]));
    let vmax = -Infinity; for (let i = 0; i < n; i++) vmax = Math.max(vmax, v[0][i]);
    if (df <= Math.max(tolf, 10 * epsOf(fv[0])) && dx <= Math.max(tolx, 10 * epsOf(vmax))) break;
    const xbar = new Float64Array(n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) xbar[i] += v[j][i] / n;
    const vw = v[n];
    const xr = xbar.map((b, i) => (1 + rho) * b - rho * vw[i]); const fxr = f(xr);
    if (fxr < fv[0]) {
      const xe = xbar.map((b, i) => (1 + rho * chi) * b - rho * chi * vw[i]); const fxe = f(xe);
      if (fxe < fxr) { v[n] = xe; fv[n] = fxe; how = 'expand'; } else { v[n] = xr; fv[n] = fxr; how = 'reflect'; }
    } else if (fxr < fv[n - 1]) { v[n] = xr; fv[n] = fxr; how = 'reflect'; }
    else {
      let shrink = false;
      if (fxr < fv[n]) {
        const xc = xbar.map((b, i) => (1 + psi * rho) * b - psi * rho * vw[i]); const fxc = f(xc);
        if (fxc <= fxr) { v[n] = xc; fv[n] = fxc; how = 'contract outside'; } else shrink = true;
      } else {
        const xcc = xbar.map((b, i) => (1 - psi) * b + psi * vw[i]); const fxcc = f(xcc);
        if (fxcc < fv[n]) { v[n] = xcc; fv[n] = fxcc; how = 'contract inside'; } else shrink = true;
      }
      if (shrink) {
        for (let j = 1; j <= n; j++) { v[j] = v[j].map((x, i) => v[0][i] + sigma * (x - v[0][i])); fv[j] = f(v[j]); }
        how = 'shrink';
      }
    }
    sortSimplex();
    itercount++;
    show(itercount, how);
    if (outFcn && outFcn(v[0], dims, ov(), 'iter')) { flag = -1; break; }
  }
  if (flag === -1) msg = 'Optimization terminated prematurely by user.';
  else if (cnt.n >= maxfun) { flag = 0; msg = `Exiting: Maximum number of function evaluations has been exceeded\n         - increase MaxFunEvals option.\n         Current function value: ${g4(fv[0])} `; }
  else if (itercount >= maxiter) { flag = 0; msg = `Exiting: Maximum number of iterations has been exceeded\n         - increase MaxIter option.\n         Current function value: ${g4(fv[0])} `; }
  else msg = `Optimization terminated:\n the current x satisfies the termination criteria using OPTIONS.TolX of ${g4(tolx)} \n and F(X) satisfies the convergence criteria using OPTIONS.TolFun of ${g4(tolf)} `;
  if (outFcn && flag !== -1) outFcn(v[0], dims, ov(), 'done');
  finalMessage(ctx, level, flag, msg);
  const output = outStruct({ iterations: itercount, funcCount: cnt.n, algorithm: 'Nelder-Mead simplex direct search', message: msg });
  return [xOut(v[0], dims), num(fv[0]), num(flag), output].slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ fminunc
/** Strong Wolfe line search (Nocedal & Wright 3.5/3.6). phi(a) → [f, g·d, x, g, f]. */
export function wolfeSearch(phi, f0, d0, a1, c1 = 1e-4, c2 = 0.9, maxEval = 40) {
  let aPrev = 0, fPrev = f0, dPrev = d0, a = a1, evals = 0, best = null;
  const zoom = (lo, flo, dlo, hi, fhi, dhi) => {
    for (let k = 0; k < 30 && evals < maxEval; k++) {
      // cubic interpolation, safeguarded
      const d1 = dlo + dhi - 3 * (flo - fhi) / (lo - hi);
      const disc = d1 * d1 - dlo * dhi;
      let aj;
      if (disc >= 0) { const d2 = Math.sign(hi - lo) * Math.sqrt(disc); aj = hi - (hi - lo) * (dhi + d2 - d1) / (dhi - dlo + 2 * d2); }
      const lo_ = Math.min(lo, hi), hi_ = Math.max(lo, hi), w = hi_ - lo_;
      if (!(aj > lo_ + 0.1 * w && aj < hi_ - 0.1 * w)) aj = 0.5 * (lo + hi);
      const r = phi(aj); evals++;
      if (!best || r.f < best.f) best = { a: aj, ...r };
      if (r.f > f0 + c1 * aj * d0 || r.f >= flo) { hi = aj; fhi = r.f; dhi = r.d; }
      else {
        if (Math.abs(r.d) <= -c2 * d0) return { a: aj, ...r };
        if (r.d * (hi - lo) >= 0) { hi = lo; fhi = flo; dhi = dlo; }
        lo = aj; flo = r.f; dlo = r.d;
      }
      if (Math.abs(hi - lo) < 1e-16 * Math.max(1, Math.abs(lo))) break;
    }
    return best && best.f < f0 ? best : null;
  };
  for (let i = 0; i < maxEval; i++) {
    const r = phi(a); evals++;
    if (!best || r.f < best.f) best = { a, ...r };
    if (!Number.isFinite(r.f)) { a = 0.5 * (aPrev + a); continue; }
    if (r.f > f0 + c1 * a * d0 || (i > 0 && r.f >= fPrev)) return zoom(aPrev, fPrev, dPrev, a, r.f, r.d);
    if (Math.abs(r.d) <= -c2 * d0) return { a, ...r };
    if (r.d >= 0) return zoom(a, r.f, r.d, aPrev, fPrev, dPrev);
    aPrev = a; fPrev = r.f; dPrev = r.d; a = Math.min(2 * a, a + 1e6);
  }
  return best && best.f < f0 ? best : null;
}

function fminunc(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'options']);
  if (args.length < 2) throw E('fminunc:notEnoughInputs', 'fminunc requires a function and a starting point.');
  const fh = fnArg(args[0], 'FUN');
  const dims = args[1].dims || [1, 1];
  let x = Float64Array.from(F(args[1], 'X0'));
  const n = x.length;
  const o = getOpts(args[2]);
  const userGrad = optBool(o, ['SpecifyObjectiveGradient', 'GradObj'], false);
  let alg = optStr(o, ['Algorithm'], 'quasi-newton').toLowerCase();
  if (alg === 'trust-region' && !userGrad) {
    ctx.warning('numeric:fminunc:gradRequired', "The 'trust-region' algorithm requires the gradient (SpecifyObjectiveGradient); using 'quasi-newton' instead.");
    alg = 'quasi-newton';
  }
  const tolOpt = optNum(o, ['OptimalityTolerance', 'TolFun'], 1e-6);
  const tolX = optNum(o, ['StepTolerance', 'TolX'], 1e-6);
  const maxIter = optNum(o, ['MaxIterations', 'MaxIter'], 400, n);
  const maxFun = optNum(o, ['MaxFunctionEvaluations', 'MaxFunEvals'], 100 * n, n);
  const central = optStr(o, ['FiniteDifferenceType', 'FinDiffType'], 'forward').toLowerCase() === 'central';
  const level = dispLevel(o, 'final');
  const outFcn = makeOutputFcn(ctx, o);
  const cnt = { n: 0 };
  const f = scalarFn(ctx, fh, dims, cnt);
  const fgUser = userGrad ? gradFn(ctx, fh, dims, cnt) : null;
  const fg = (z) => { if (fgUser) return fgUser(z); const fz = f(z); return [fz, fdGrad(f, z, fz, { central })]; };
  let [fx, g] = fg(x);
  if (!Number.isFinite(fx)) throw E('fminunc:badStart', 'The objective function is undefined at the initial point; fminunc cannot continue.');
  const g0n = Math.max(1, infNorm(g));
  let flag = 0, msg = '', iter = 0, stepNorm = 0;
  let Hinv = zerosM(n, n); for (let i = 0; i < n; i++) Hinv[i][i] = 1;
  let Hess = null;
  let Delta = Math.max(1, twoNorm(x));
  if (level === 'iter') ctx.out(alg === 'quasi-newton' ? '\n                                                        First-order\n Iteration  Func-count       f(x)        Step-size       optimality\n' : '\n                                                         Norm of      First-order\n Iteration        f(x)          Step-size          step         optimality\n');
  const showIt = (ss) => { if (level === 'iter') ctx.out(`${pad(iter, 6)}${pad(cnt.n, 12)}${pad(g4(fx), 16)}${pad(ss === '' ? '' : g4(ss), 16)}${pad(g4(infNorm(g)), 16)}\n`); };
  showIt('');
  const ov = () => ({ iteration: iter, funccount: cnt.n, fval: fx, gradient: Array.from(g), stepsize: stepNorm, firstorderopt: infNorm(g) });
  if (outFcn && outFcn(x, dims, ov(), 'init')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; }
  if (flag === 0 && infNorm(g) <= tolOpt * g0n * 1e-3) { flag = 1; msg = 'Initial point is a local minimum.'; }
  while (flag === 0 && !msg) {
    if (iter >= maxIter) { flag = 0; msg = `Solver stopped prematurely.\n\nfminunc stopped because it exceeded the iteration limit,\noptions.MaxIterations = ${maxIter}.`; break; }
    if (cnt.n >= maxFun) { flag = 0; msg = `Solver stopped prematurely.\n\nfminunc stopped because it exceeded the function evaluation limit,\noptions.MaxFunctionEvaluations = ${maxFun}.`; break; }
    ctx.checkInterrupt();
    let s, xn, fn, gn;
    if (alg === 'quasi-newton') {
      let d = Hinv.map((r) => -r.reduce((acc, v, j) => acc + v * g[j], 0));
      let gd = d.reduce((acc, v, i) => acc + v * g[i], 0);
      if (!(gd < 0)) { Hinv = zerosM(n, n); for (let i = 0; i < n; i++) Hinv[i][i] = 1; d = Array.from(g, (v) => -v); gd = -d.reduce((a, v) => a + v * v, 0); }
      const a1 = iter === 0 ? Math.min(1, 1 / Math.max(infNorm(g), EPS)) : 1;
      const phi = (a) => { const z = x.map((v, i) => v + a * d[i]); const [fz, gz] = fg(z); let dd = 0; for (let i = 0; i < n; i++) dd += gz[i] * d[i]; return { f: fz, d: dd, x: z, g: gz }; };
      const ls = wolfeSearch(phi, fx, gd, a1);
      if (!ls) { flag = 5; msg = 'Local minimum possible.\n\nfminunc stopped because it cannot decrease the objective function along the current search direction.'; break; }
      xn = ls.x; fn = ls.f; gn = ls.g; s = d.map((v) => v * ls.a);
      const y = gn.map((v, i) => v - g[i]);
      const sy = s.reduce((a, v, i) => a + v * y[i], 0);
      if (iter === 0 && sy > 0) { const yy = y.reduce((a, v) => a + v * v, 0); Hinv = zerosM(n, n); for (let i = 0; i < n; i++) Hinv[i][i] = sy / yy; }
      if (sy > EPS * twoNorm(s) * twoNorm(y)) {
        const r = 1 / sy; const Hy = Hinv.map((row) => row.reduce((a, v, j) => a + v * y[j], 0)); const yHy = y.reduce((a, v, i) => a + v * Hy[i], 0);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Hinv[i][j] += -r * (Hy[i] * s[j] + s[i] * Hy[j]) + (r * r * yHy + r) * s[i] * s[j];
      }
    } else {
      // trust region Newton with Steihaug CG on a finite-difference Hessian of the gradient
      Hess = zerosM(n, n);
      for (let j = 0; j < n; j++) {
        const h = Math.sqrt(EPS) * Math.max(Math.abs(x[j]), 1); const z = Float64Array.from(x); z[j] += h; const gz = fg(z)[1];
        for (let i = 0; i < n; i++) Hess[i][j] = (gz[i] - g[i]) / h;
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) { const m = 0.5 * (Hess[i][j] + Hess[j][i]); Hess[i][j] = Hess[j][i] = m; }
      const p = steihaug(Hess, g, Delta);
      const Hp = Hess.map((r) => r.reduce((a, v, j) => a + v * p[j], 0));
      const pred = -(p.reduce((a, v, i) => a + v * g[i], 0) + 0.5 * p.reduce((a, v, i) => a + v * Hp[i], 0));
      const z = x.map((v, i) => v + p[i]); const [fz, gz] = fg(z);
      const rho = pred > 0 ? (fx - fz) / pred : -1;
      const pn = twoNorm(p);
      if (rho < 0.25) Delta = 0.25 * pn; else if (rho > 0.75 && pn > 0.99 * Delta) Delta = 2 * Delta;
      if (rho > 1e-4) { xn = z; fn = fz; gn = gz; s = p; }
      else {
        iter++;
        if (Delta < tolX * (1 + twoNorm(x))) { flag = 2; msg = 'Local minimum possible.\n\nfminunc stopped because the size of the current step is less than the value of the step size tolerance.'; }
        continue;
      }
    }
    const dfx = fx - fn;
    x = Float64Array.from(xn); fx = fn; g = Float64Array.from(gn); iter++; stepNorm = twoNorm(s);
    showIt(stepNorm);
    if (outFcn && outFcn(x, dims, ov(), 'iter')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; break; }
    if (fx < -1e20) { flag = -3; msg = 'Problem appears unbounded.\n\nfminunc stopped because the objective function value is less than options.ObjectiveLimit.'; break; }
    if (infNorm(g) <= tolOpt * g0n) { flag = 1; msg = 'Local minimum found.\n\nOptimization completed because the size of the gradient is less than\nthe value of the optimality tolerance.'; break; }
    if (infNorm(s) <= tolX * (EPS ** 0.5 + infNorm(x))) { flag = 2; msg = 'Local minimum possible.\n\nfminunc stopped because the size of the current step is less than\nthe value of the step size tolerance.'; break; }
    if (Math.abs(dfx) <= tolOpt * 1e-6 * Math.max(1, Math.abs(fx)) && dfx >= 0) { flag = 3; msg = 'Local minimum possible.\n\nfminunc stopped because the change in the objective function value is less than the function tolerance.'; break; }
  }
  if (outFcn && flag !== -1) outFcn(x, dims, ov(), 'done');
  finalMessage(ctx, level, flag, msg);
  const output = outStruct({ iterations: iter, funcCount: cnt.n, stepsize: stepNorm, lssteplength: 1, firstorderopt: infNorm(g), algorithm: alg === 'quasi-newton' ? 'quasi-newton' : 'trust-region', message: msg });
  const res = [xOut(x, dims), num(fx), num(flag), output];
  if (nargout > 4) res.push(xOut(g, [n, 1]));
  if (nargout > 5) {
    let Hm;
    if (Hess) Hm = Hess;
    else { Hm = solve(Hinv, Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))); }
    const a = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) a[i + j * n] = Hm[i][j];
    res.push(V(n, n, a));
  }
  return res.slice(0, Math.max(1, nargout));
}

/** Steihaug–Toint truncated CG for min g'p + 0.5 p'Hp, ||p|| <= Delta. */
export function steihaug(Hm, g, Delta) {
  const n = g.length; const p = new Array(n).fill(0); let r = Array.from(g); let d = r.map((v) => -v);
  const rn0 = twoNorm(r); if (rn0 === 0) return p;
  const tol = Math.min(0.5, Math.sqrt(rn0)) * rn0;
  const toBoundary = (p, d) => { const a = d.reduce((s, v) => s + v * v, 0), b = 2 * p.reduce((s, v, i) => s + v * d[i], 0), c = p.reduce((s, v) => s + v * v, 0) - Delta * Delta; const t = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); return p.map((v, i) => v + t * d[i]); };
  for (let k = 0; k < 2 * n + 5; k++) {
    const Hd = Hm.map((row) => row.reduce((a, v, j) => a + v * d[j], 0));
    const dHd = d.reduce((a, v, i) => a + v * Hd[i], 0);
    if (dHd <= 0) return toBoundary(p, d);
    const rr = r.reduce((a, v) => a + v * v, 0); const alpha = rr / dHd;
    const pn = p.map((v, i) => v + alpha * d[i]);
    if (twoNorm(pn) >= Delta) return toBoundary(p, d);
    for (let i = 0; i < n; i++) { p[i] = pn[i]; r[i] += alpha * Hd[i]; }
    const rr2 = r.reduce((a, v) => a + v * v, 0);
    if (Math.sqrt(rr2) < tol) return p;
    d = d.map((v, i) => -r[i] + (rr2 / rr) * v);
  }
  return p;
}

export const builtins = { fminsearch, fminunc };
export const help = {
  fminsearch: H('Minimum of an unconstrained multivariable function by the derivative-free Nelder–Mead simplex method.', '도함수 없이 Nelder–Mead 단체법으로 제약 없는 다변수 함수의 최솟값을 찾습니다.', ['x = fminsearch(fun, x0)', 'x = fminsearch(fun, x0, options)', 'x = fminsearch(problem)', '[x, fval, exitflag, output] = fminsearch(___)']),
  fminunc: H("Minimum of an unconstrained multivariable function (BFGS quasi-Newton with line search, or 'trust-region' with a supplied gradient).", "제약 없는 다변수 함수의 최솟값 (선 탐색 BFGS 준뉴턴, 또는 기울기를 줄 때 'trust-region').", ['x = fminunc(fun, x0)', 'x = fminunc(fun, x0, options)', 'x = fminunc(problem)', '[x, fval, exitflag, output, grad, hessian] = fminunc(___)']),
};
