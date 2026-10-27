// Least squares and nonlinear equations: lsqnonlin, lsqcurvefit
// (Levenberg–Marquardt with bound projection), fsolve (trust-region dogleg or
// Levenberg–Marquardt), lsqlin (via the QP solver) and lsqnonneg
// (Lawson–Hanson).
import { num, tensor } from '../../../value.js';
import { E, F, H, fnArg, V, M, isEmptyV } from '../_util.js';
import {
  getOpts, optNum, optStr, optBool, dispLevel, vecFn, fdJac, makeOutputFcn, finalMessage, outStruct, pad, g4, EPS,
  xOut, infNorm, twoNorm, rowDot, boundsOf, clampX, argAt, fromProblem, lambdaStruct, linCons, qpSolve, nnls, lstsq, zerosM, solve,
} from './common.js';

const jacValue = (J) => { const m = J.length, n = m ? J[0].length : 0; const a = new Float64Array(m * n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) a[i + j * m] = J[i][j]; return V(m, n, a); };
const ss = (r) => { let s = 0; for (const v of r) s += v * v; return s; };
const JtV = (J, r, n) => { const g = new Array(n).fill(0); for (let i = 0; i < J.length; i++) { const Ji = J[i], ri = r[i]; for (let j = 0; j < n; j++) g[j] += Ji[j] * ri; } return g; };

/** Levenberg–Marquardt with projection onto bounds. R(x) → {v, dims, J?}. */
function levmar(ctx, R, x0, lb, ub, o, ctl) {
  const n = x0.length;
  const tolOpt = optNum(o, ['OptimalityTolerance', 'TolFun'], 1e-6);
  const tolFun = optNum(o, ['FunctionTolerance', 'TolFun'], 1e-6);
  const tolX = optNum(o, ['StepTolerance', 'TolX'], 1e-6);
  const maxIter = optNum(o, ['MaxIterations', 'MaxIter'], 400, n);
  const maxFun = optNum(o, ['MaxFunctionEvaluations', 'MaxFunEvals'], ctl.maxFunDef || 100 * n, n);
  let lambda = optNum(o, ['InitDamping'], 1e-2);
  const central = optStr(o, ['FiniteDifferenceType', 'FinDiffType'], 'forward').toLowerCase() === 'central';
  const { level, cnt, outFcn, dims, name } = ctl;
  let x = clampX(x0, lb, ub);
  const evalR = (z) => { const r = R(z); const J = r.J || fdJac((w) => R(w).v, z, r.v, { central, lb, ub }); return { r: r.v, rdims: r.dims, J }; };
  let cur = evalR(x); let S = ss(cur.r);
  if (!Number.isFinite(S)) throw E(`${name}:badStart`, 'The function is undefined at the initial point.');
  const projGrad = (g, z) => g.map((v, j) => ((z[j] <= lb[j] && v > 0) || (z[j] >= ub[j] && v < 0) ? 0 : v));
  let g = JtV(cur.J, cur.r, n); let opt = infNorm(projGrad(g, x)) * 2;
  const opt0 = Math.max(1, opt);
  let iter = 0, flag = 0, msg = '', stepNorm = 0;
  if (level === 'iter') ctx.out('\n                                        First-order                     Norm of\n Iteration  Func-count    Resnorm      optimality      Lambda           step\n' + `${pad(0, 5)}${pad(cnt.n, 12)}${pad(g4(S), 14)}${pad(g4(opt), 14)}${pad(g4(lambda), 14)}\n`);
  const ov = () => ({ iteration: iter, funccount: cnt.n, resnorm: S, residual: Array.from(cur.r), firstorderopt: opt, stepsize: stepNorm, lambda });
  if (outFcn && outFcn(x, dims, ov(), 'init')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; }
  if (!msg && opt <= 1e-4 * tolOpt * opt0) { flag = 1; msg = 'Initial point is a local minimum.'; }
  while (!msg) {
    if (iter >= maxIter) { flag = 0; msg = `Solver stopped prematurely.\n\n${name} stopped because it exceeded the iteration limit,\noptions.MaxIterations = ${maxIter}.`; break; }
    if (cnt.n >= maxFun) { flag = 0; msg = `Solver stopped prematurely.\n\n${name} stopped because it exceeded the function evaluation limit,\noptions.MaxFunctionEvaluations = ${maxFun}.`; break; }
    ctx.checkInterrupt();
    const JTJ = zerosM(n, n);
    for (const Ji of cur.J) for (let a = 0; a < n; a++) { const v = Ji[a]; if (v === 0) continue; for (let b = 0; b < n; b++) JTJ[a][b] += v * Ji[b]; }
    const A = JTJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(v, 1e-12 * (1 + v)) + lambda * 1e-10 : v)));
    const d = solve(A, g.map((v) => -v));
    const xn = clampX(x.map((v, i) => v + d[i]), lb, ub);
    const step = xn.map((v, i) => v - x[i]); const sn = infNorm(step);
    let accepted = false, nxt = null, Sn = Infinity;
    if (sn > 0) { nxt = evalR(xn); Sn = ss(nxt.r); }
    if (Number.isFinite(Sn) && Sn < S) {
      accepted = true;
      const dS = S - Sn;
      x = xn; cur = nxt; S = Sn; lambda = Math.max(lambda / 10, 1e-20); iter++; stepNorm = twoNorm(step);
      g = JtV(cur.J, cur.r, n); opt = infNorm(projGrad(g, x)) * 2;
      if (level === 'iter') ctx.out(`${pad(iter, 5)}${pad(cnt.n, 12)}${pad(g4(S), 14)}${pad(g4(opt), 14)}${pad(g4(lambda), 14)}${pad(g4(stepNorm), 14)}\n`);
      if (outFcn && outFcn(x, dims, ov(), 'iter')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; break; }
      if (opt <= 1e-4 * tolOpt * opt0) { flag = 1; msg = `Local minimum found.\n\nOptimization completed because the size of the gradient is less than\nthe value of the optimality tolerance.`; break; }
      if (sn <= tolX * (Math.sqrt(EPS) + infNorm(x))) { flag = 2; msg = `Local minimum possible.\n\n${name} stopped because the final change in the sum of squares relative to\nits initial value is less than the value of the step size tolerance.`; break; }
      if (dS <= tolFun * S * 1e-3 || S <= 1e-30) { flag = 3; msg = `Local minimum possible.\n\n${name} stopped because the final change in the sum of squares relative to\nits initial value is less than the value of the function tolerance.`; break; }
    } else {
      lambda *= 10;
      if (lambda > 1e20 || sn <= tolX * EPS * (1 + infNorm(x))) { flag = 2; msg = `Local minimum possible.\n\n${name} stopped because the size of the current step is less than\nthe value of the step size tolerance.`; break; }
    }
    void accepted;
  }
  if (outFcn && flag !== -1) outFcn(x, dims, ov(), 'done');
  return { x, r: cur.r, rdims: cur.rdims, J: cur.J, S, flag, msg, iter, opt, stepNorm, g };
}

/** Trust-region dogleg (Powell) for F(x) = 0. */
function dogleg(ctx, R, x0, o, ctl) {
  const n = x0.length;
  const tolOpt = optNum(o, ['OptimalityTolerance', 'TolFun'], 1e-6);
  const tolFun = optNum(o, ['FunctionTolerance', 'TolFun'], 1e-6);
  const tolX = optNum(o, ['StepTolerance', 'TolX'], 1e-6);
  const maxIter = optNum(o, ['MaxIterations', 'MaxIter'], 400, n);
  const maxFun = optNum(o, ['MaxFunctionEvaluations', 'MaxFunEvals'], 100 * n, n);
  const central = optStr(o, ['FiniteDifferenceType', 'FinDiffType'], 'forward').toLowerCase() === 'central';
  const { level, cnt, outFcn, dims, name } = ctl;
  let x = Float64Array.from(x0);
  const evalR = (z) => { const r = R(z); const J = r.J || fdJac((w) => R(w).v, z, r.v, { central }); return { r: r.v, rdims: r.dims, J }; };
  let cur = evalR(x); let S = ss(cur.r);
  if (!Number.isFinite(S)) throw E(`${name}:badStart`, 'Objective function is returning undefined values at the initial point.');
  let g = JtV(cur.J, cur.r, n); let opt = infNorm(g);
  let Delta = Math.max(1, twoNorm(x));
  let iter = 0, flag = 0, msg = '', stepNorm = 0;
  if (level === 'iter') ctx.out('\n                                         Norm of      First-order   Trust-region\n Iteration  Func-count     f(x)          step         optimality    radius\n' + `${pad(0, 5)}${pad(cnt.n, 12)}${pad(g4(S), 14)}${pad('', 14)}${pad(g4(opt), 14)}${pad(g4(Delta), 12)}\n`);
  const ov = () => ({ iteration: iter, funccount: cnt.n, fval: Array.from(cur.r), firstorderopt: opt, stepsize: stepNorm, trustregionradius: Delta });
  if (outFcn && outFcn(x, dims, ov(), 'init')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; }
  const solved = () => S <= Math.sqrt(tolFun) * 1e-3 || S < 1e-28;
  if (!msg && (opt <= tolOpt * 1e-3 || S === 0)) { flag = solved() ? 1 : -2; msg = flag === 1 ? 'Equation solved at initial point.' : 'No solution found.'; }
  while (!msg) {
    if (iter >= maxIter) { flag = 0; msg = `Solver stopped prematurely.\n\n${name} stopped because it exceeded the iteration limit,\noptions.MaxIterations = ${maxIter}.`; break; }
    if (cnt.n >= maxFun) { flag = 0; msg = `Solver stopped prematurely.\n\n${name} stopped because it exceeded the function evaluation limit,\noptions.MaxFunctionEvaluations = ${maxFun}.`; break; }
    ctx.checkInterrupt();
    const pGN = lstsq(cur.J, cur.r.map ? Array.from(cur.r, (v) => -v) : []);
    const Jg = cur.J.map((row) => rowDot(row, g)); const gg = rowDot(g, g); const JgJg = rowDot(Jg, Jg);
    const tau = JgJg > 0 ? gg / JgJg : 0; const pC = g.map((v) => -tau * v);
    let p;
    if (twoNorm(pGN) <= Delta) p = pGN;
    else if (twoNorm(pC) >= Delta) { const s = Delta / twoNorm(pC); p = pC.map((v) => v * s); }
    else {
      const dd = pGN.map((v, i) => v - pC[i]); const a = rowDot(dd, dd), b = 2 * rowDot(pC, dd), c = rowDot(pC, pC) - Delta * Delta;
      const t = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a); p = pC.map((v, i) => v + t * dd[i]);
    }
    const Jp = cur.J.map((row) => rowDot(row, p)); const pred = S - ss(cur.r.map((v, i) => v + Jp[i]));
    const xn = x.map((v, i) => v + p[i]); const nxt = evalR(xn); const Sn = ss(nxt.r);
    const rho = pred > 0 && Number.isFinite(Sn) ? (S - Sn) / pred : -1;
    const pn = twoNorm(p);
    if (rho < 0.25) Delta = 0.25 * pn; else if (rho > 0.75 && pn > 0.9 * Delta) Delta = Math.max(Delta, 2.5 * pn);
    if (rho > 1e-4) {
      const dS = S - Sn;
      x = Float64Array.from(xn); cur = nxt; S = Sn; iter++; stepNorm = pn; g = JtV(cur.J, cur.r, n); opt = infNorm(g);
      if (level === 'iter') ctx.out(`${pad(iter, 5)}${pad(cnt.n, 12)}${pad(g4(S), 14)}${pad(g4(stepNorm), 14)}${pad(g4(opt), 14)}${pad(g4(Delta), 12)}\n`);
      if (outFcn && outFcn(x, dims, ov(), 'iter')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; break; }
      if (S < 1e-28 || opt <= tolOpt * 1e-3) { flag = solved() ? 1 : -2; break; }
      if (pn <= tolX * (Math.sqrt(EPS) + twoNorm(x))) { flag = solved() ? 2 : -2; break; }
      if (dS <= tolFun * 1e-6 * Math.max(1, S)) { flag = solved() ? 3 : -2; break; }
    } else if (Delta < tolX * EPS * (1 + twoNorm(x)) || Delta < 1e-300) { flag = solved() ? 2 : -3; break; }
  }
  if (!msg) {
    msg = flag === 1 ? 'Equation solved.\n\nfsolve completed because the vector of function values is near zero\nas measured by the value of the function tolerance, and\nthe problem appears regular as measured by the gradient.'
      : flag === 2 ? 'Equation solved.\n\nfsolve completed because the size of the last step is small.'
        : flag === 3 ? 'Equation solved.\n\nfsolve completed because the change in the sum of squares is small.'
          : flag === -3 ? 'No solution found.\n\nfsolve stopped because the trust-region radius became too small.'
            : 'No solution found.\n\nfsolve stopped because the problem appears to be locally inconsistent\nwith the vector of function values not near zero.';
  }
  if (outFcn && flag !== -1) outFcn(x, dims, ov(), 'done');
  return { x, r: cur.r, rdims: cur.rdims, J: cur.J, S, flag, msg, iter, opt, stepNorm };
}

function lsqSetup(ctx, name, fh, x0V, o, extra) {
  const dims = x0V.dims || [1, 1];
  const x0 = Float64Array.from(F(x0V, 'X0'));
  const level = dispLevel(o, 'final');
  const cnt = { n: 0 };
  const jac = optBool(o, ['SpecifyObjectiveGradient', 'Jacobian'], false);
  const R = vecFn(ctx, fh, dims, cnt, jac, extra);
  return { dims, x0, level, cnt, R, outFcn: makeOutputFcn(ctx, o), name };
}
function lsqLambda(r, lb, ub, n) {
  const lower = new Array(n).fill(0), upper = new Array(n).fill(0);
  const g = r.g || JtV(r.J, r.r, n);
  for (let j = 0; j < n; j++) { if (r.x[j] <= lb[j] && g[j] > 0) lower[j] = 2 * g[j]; if (r.x[j] >= ub[j] && g[j] < 0) upper[j] = -2 * g[j]; }
  return lambdaStruct(n, { lower, upper });
}
const resValue = (r, dims) => tensor('double', dims && dims.reduce((a, b) => a * b, 1) === r.length ? dims : [r.length, 1], Float64Array.from(r));

function lsqnonlin(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'lb', 'ub', 'options']);
  if (args.length < 2) throw E('lsqnonlin:notEnoughInputs', 'lsqnonlin requires a function and a starting point.');
  // lsqnonlin(fun,x0,lb,ub,options) or (fun,x0,lb,ub,A,b,Aeq,beq,nonlcon,options)
  const o = getOpts(argAt(args, args.length > 5 ? 9 : 4));
  const s = lsqSetup(ctx, 'lsqnonlin', fnArg(args[0]), args[1], o, []);
  const n = s.x0.length;
  const { lb, ub, consistent } = boundsOf(argAt(args, 2), argAt(args, 3), n, 'lsqnonlin');
  if (!consistent) throw E('lsqnonlin:InfeasibleBounds', 'At least one lower bound exceeds the corresponding upper bound.');
  const r = levmar(ctx, s.R, s.x0, lb, ub, o, { ...s, maxFunDef: 100 * n });
  finalMessage(ctx, s.level, r.flag, r.msg);
  const algo = optStr(o, ['Algorithm'], 'trust-region-reflective');
  const output = outStruct({ firstorderopt: r.opt, iterations: r.iter, funcCount: s.cnt.n, cgiterations: 0, algorithm: algo, stepsize: r.stepNorm, message: r.msg });
  return [xOut(r.x, s.dims), num(r.S), resValue(r.r, r.rdims), num(r.flag), output, lsqLambda(r, lb, ub, n), jacValue(r.J)].slice(0, Math.max(1, nargout));
}

function lsqcurvefit(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'xdata', 'ydata', 'lb', 'ub', 'options']);
  if (args.length < 4) throw E('lsqcurvefit:notEnoughInputs', 'lsqcurvefit requires FUN, X0, XDATA and YDATA.');
  const fh = fnArg(args[0]); const xdata = args[2]; const ydata = Float64Array.from(F(args[3], 'YDATA'));
  const o = getOpts(argAt(args, args.length > 7 ? 11 : 6));
  const s = lsqSetup(ctx, 'lsqcurvefit', fh, args[1], o, [xdata]);
  const n = s.x0.length;
  const { lb, ub, consistent } = boundsOf(argAt(args, 4), argAt(args, 5), n, 'lsqcurvefit');
  if (!consistent) throw E('lsqcurvefit:InfeasibleBounds', 'At least one lower bound exceeds the corresponding upper bound.');
  const R = (x) => {
    const r = s.R(x);
    if (r.v.length !== ydata.length) throw E('lsqcurvefit:sizeMismatch', `Function value and YDATA sizes are not equal (${r.v.length} and ${ydata.length}).`);
    return { v: r.v.map((v, i) => v - ydata[i]), dims: args[3].dims, J: r.J };
  };
  const r = levmar(ctx, R, s.x0, lb, ub, o, { ...s, maxFunDef: 100 * n });
  finalMessage(ctx, s.level, r.flag, r.msg);
  const algo = optStr(o, ['Algorithm'], 'trust-region-reflective');
  const output = outStruct({ firstorderopt: r.opt, iterations: r.iter, funcCount: s.cnt.n, cgiterations: 0, algorithm: algo, stepsize: r.stepNorm, message: r.msg });
  return [xOut(r.x, s.dims), num(r.S), resValue(r.r, r.rdims), num(r.flag), output, lsqLambda(r, lb, ub, n), jacValue(r.J)].slice(0, Math.max(1, nargout));
}

function fsolve(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'options']);
  if (args.length < 2) throw E('fsolve:notEnoughInputs', 'fsolve requires a function and a starting point.');
  const o = getOpts(argAt(args, 2));
  const s = lsqSetup(ctx, 'fsolve', fnArg(args[0]), args[1], o, args.slice(3));
  const n = s.x0.length;
  const algo = optStr(o, ['Algorithm'], 'trust-region-dogleg').toLowerCase();
  let r;
  if (algo === 'levenberg-marquardt' || algo === 'trust-region' || algo === 'trust-region-reflective') {
    const inf = new Float64Array(n);
    r = levmar(ctx, s.R, s.x0, inf.map(() => -Infinity), inf.map(() => Infinity), o, { ...s, maxFunDef: 200 * n });
    const solved = r.S <= Math.sqrt(optNum(o, ['FunctionTolerance', 'TolFun'], 1e-6)) * 1e-3 || r.S < 1e-28;
    if (r.flag > 0 && !solved) { r.flag = -2; r.msg = 'No solution found.\n\nfsolve stopped because the problem appears to be locally inconsistent\nwith the vector of function values not near zero.'; }
    else if (r.flag > 0) r.msg = 'Equation solved.\n\nfsolve completed because the vector of function values is near zero\nas measured by the value of the function tolerance.';
  } else r = dogleg(ctx, s.R, s.x0, o, s);
  finalMessage(ctx, s.level, r.flag, r.msg);
  const output = outStruct({ iterations: r.iter, funcCount: s.cnt.n, algorithm: algo, firstorderopt: r.opt, stepsize: r.stepNorm, message: r.msg });
  return [xOut(r.x, s.dims), resValue(r.r, r.rdims), num(r.flag), output, jacValue(r.J)].slice(0, Math.max(1, nargout));
}

function lsqlin(args, nargout, ctx) {
  args = fromProblem(args, ['C', 'd', 'Aineq', 'bineq', 'Aeq', 'beq', 'lb', 'ub', 'x0', 'options']);
  if (args.length < 2) throw E('lsqlin:notEnoughInputs', 'lsqlin requires C and d.');
  const Cm = M(args[0], 'C'); const d = Float64Array.from(F(args[1], 'd'));
  const n = Cm.n, m = Cm.m;
  if (d.length !== m) throw E('lsqlin:sizeMismatch', 'The number of rows of C must equal the length of d.');
  const C = []; for (let i = 0; i < m; i++) { const r = new Array(n); for (let j = 0; j < n; j++) r[j] = Cm.a[i + j * m]; C.push(r); }
  const { rows: Ain, rhs: bin } = linCons(argAt(args, 2), argAt(args, 3), n, 'lsqlin', 'A');
  const { rows: Aeq, rhs: beq } = linCons(argAt(args, 4), argAt(args, 5), n, 'lsqlin', 'Aeq');
  const { lb, ub, consistent } = boundsOf(argAt(args, 6), argAt(args, 7), n, 'lsqlin');
  const x0 = argAt(args, 8) ? Float64Array.from(F(args[8])) : null;
  const o = getOpts(argAt(args, 9));
  const level = dispLevel(o, 'final');
  const Hm = zerosM(n, n); const f = new Array(n).fill(0);
  for (let i = 0; i < m; i++) for (let a = 0; a < n; a++) { f[a] -= C[i][a] * d[i]; for (let b = 0; b < n; b++) Hm[a][b] += C[i][a] * C[i][b]; }
  let r = consistent ? qpSolve(Hm, f, Ain, bin, Aeq, beq, lb, ub, { ctx, x0 }) : { status: -2, x: new Float64Array(n), iterations: 0 };
  if (!r.lambda) r.lambda = { ineqlin: new Array(Ain.length).fill(0), eqlin: new Array(Aeq.length).fill(0), lower: new Array(n).fill(0), upper: new Array(n).fill(0) };
  const x = r.x; const res = C.map((row, i) => rowDot(row, x) - d[i]);
  const flag = r.status === 1 ? 1 : r.status === -2 ? -2 : r.status;
  const msg = flag === 1 ? 'Minimum found that satisfies the constraints.\n\nOptimization completed because the objective function is non-decreasing in\nfeasible directions, to within the value of the optimality tolerance,\nand constraints are satisfied to within the value of the constraint tolerance.' : flag === -2 ? 'No feasible point found. The constraints are inconsistent.' : 'Solver stopped prematurely.';
  finalMessage(ctx, level, flag, msg);
  // multipliers of ||Cx-d||^2 (factor 2 relative to the QP with H = C'C)
  const lam = {}; for (const k of Object.keys(r.lambda)) lam[k] = r.lambda[k].map((v) => 2 * v);
  const output = outStruct({ message: msg, algorithm: optStr(o, ['Algorithm'], 'interior-point'), firstorderopt: 0, constrviolation: 0, iterations: r.iterations, cgiterations: 0 });
  return [xOut(x, [n, 1]), num(ss(res)), tensor('double', [m, 1], Float64Array.from(res)), num(flag), output, lambdaStruct(n, lam)].slice(0, Math.max(1, nargout));
}

function lsqnonneg(args, nargout, ctx) {
  if (args.length < 2) throw E('lsqnonneg:notEnoughInputs', 'lsqnonneg requires C and d.');
  const Cm = M(args[0], 'C'); const d = Float64Array.from(F(args[1], 'd'));
  const n = Cm.n, m = Cm.m;
  if (d.length !== m) throw E('lsqnonneg:sizeMismatch', 'The number of rows of C must equal the length of d.');
  const o = getOpts(argAt(args, 2));
  const tol = optNum(o, ['TolX'], undefined);
  const C = []; for (let i = 0; i < m; i++) { const r = new Array(n); for (let j = 0; j < n; j++) r[j] = Cm.a[i + j * m]; C.push(r); }
  const r = nnls(C, d, tol);
  const res = C.map((row, i) => d[i] - rowDot(row, r.x));
  const level = dispLevel(o, 'notify');
  finalMessage(ctx, level, 1, 'Optimization terminated.');
  const output = outStruct({ iterations: r.iterations, algorithm: 'active-set', message: 'Optimization terminated.' });
  return [xOut(r.x, [n, 1]), num(ss(res)), tensor('double', [m, 1], Float64Array.from(res)), num(1), output, xOut(r.w, [n, 1])].slice(0, Math.max(1, nargout));
}

export const builtins = { lsqnonlin, lsqcurvefit, fsolve, lsqlin, lsqnonneg };
export const help = {
  lsqnonlin: H('Nonlinear least squares: minimizes sum(fun(x).^2) with optional bounds (Levenberg–Marquardt with bound projection).', '비선형 최소제곱: sum(fun(x).^2) 를 경계 조건과 함께 최소화합니다 (경계 투영 Levenberg–Marquardt).', ['x = lsqnonlin(fun, x0)', 'x = lsqnonlin(fun, x0, lb, ub)', 'x = lsqnonlin(fun, x0, lb, ub, options)', '[x, resnorm, residual, exitflag, output, lambda, jacobian] = lsqnonlin(___)']),
  lsqcurvefit: H('Nonlinear curve fitting in the least-squares sense: finds x minimizing sum((fun(x, xdata) - ydata).^2).', '최소제곱 비선형 곡선 맞춤: sum((fun(x, xdata) - ydata).^2) 를 최소화하는 x 를 찾습니다.', ['x = lsqcurvefit(fun, x0, xdata, ydata)', 'x = lsqcurvefit(fun, x0, xdata, ydata, lb, ub)', 'x = lsqcurvefit(fun, x0, xdata, ydata, lb, ub, options)', '[x, resnorm, residual, exitflag, output, lambda, jacobian] = lsqcurvefit(___)']),
  fsolve: H("Solves a system of nonlinear equations F(x) = 0 ('trust-region-dogleg' or 'levenberg-marquardt').", "비선형 연립방정식 F(x) = 0 을 풉니다 ('trust-region-dogleg' 또는 'levenberg-marquardt').", ['x = fsolve(fun, x0)', 'x = fsolve(fun, x0, options)', 'x = fsolve(problem)', '[x, fval, exitflag, output, jacobian] = fsolve(___)']),
  lsqlin: H('Constrained linear least squares: minimizes norm(C*x - d)^2 with linear and bound constraints.', '제약 선형 최소제곱: 선형·경계 제약 아래 norm(C*x - d)^2 를 최소화합니다.', ['x = lsqlin(C, d, A, b)', 'x = lsqlin(C, d, A, b, Aeq, beq, lb, ub)', 'x = lsqlin(C, d, A, b, Aeq, beq, lb, ub, x0, options)', '[x, resnorm, residual, exitflag, output, lambda] = lsqlin(___)']),
  lsqnonneg: H('Nonnegative linear least squares (Lawson–Hanson active-set method).', '음이 아닌 선형 최소제곱 (Lawson–Hanson 활성 집합법).', ['x = lsqnonneg(C, d)', 'x = lsqnonneg(C, d, options)', '[x, resnorm, residual, exitflag, output, lambda] = lsqnonneg(___)']),
};

