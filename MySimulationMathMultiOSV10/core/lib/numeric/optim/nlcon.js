// Constrained nonlinear minimization: an SQP engine (damped BFGS Hessian,
// active-set QP subproblems with an elastic fallback, L1 merit line search)
// used by fmincon, fminimax and fgoalattain.
import { num, isFuncHandle, isText } from '../../../value.js';
import { E, F, H, fnArg, V, callFn, M } from '../_util.js';
import {
  getOpts, optNum, optStr, optBool, dispLevel, scalarFn, gradFn, fdGrad, fdJac, makeOutputFcn, finalMessage,
  outStruct, pad, g4, EPS, xOut, wrapX, infNorm, twoNorm, rowDot, linCons, boundsOf, clampX, argAt, fromProblem,
  qpSolve, simplexLP, lambdaStruct, zerosM,
} from './common.js';

const colsToRows = (v, n) => {
  // GC is n×m (one column per constraint) → rows m×n
  if (!v || !v.dims) return [];
  const a = M(v); if (a.m * a.n === 0) return [];
  if (a.m !== n) throw E('fmincon:badConstraintGradient', `Constraint gradients must have ${n} rows (one per variable).`);
  const rows = []; for (let k = 0; k < a.n; k++) { const r = new Array(n); for (let i = 0; i < n; i++) r[i] = a.a[i + k * a.m]; rows.push(r); }
  return rows;
};

/**
 * SQP. prob: { n, x0, f(x)→number, fg(x)→[f,g] (optional), con(x)→{c, ceq, Jc?, Jceq?} (optional),
 *   Ain,bin,Aeq,beq (rows), lb, ub, dims, name, level, outFcn, cnt, o (options), algorithm }
 */
export function sqp(ctx, prob) {
  const { n, Ain, bin, Aeq, beq, lb, ub, o, cnt, level, dims } = prob;
  const name = prob.name || 'fmincon';
  const tolOpt = optNum(o, ['OptimalityTolerance', 'TolFun'], 1e-6);
  const tolX = optNum(o, ['StepTolerance', 'TolX'], prob.algorithm === 'interior-point' ? 1e-10 : 1e-6);
  const tolCon = optNum(o, ['ConstraintTolerance', 'TolCon'], 1e-6);
  const maxIter = optNum(o, ['MaxIterations', 'MaxIter'], prob.algorithm === 'interior-point' ? 1000 : 400, n);
  const maxFun = optNum(o, ['MaxFunctionEvaluations', 'MaxFunEvals'], prob.algorithm === 'interior-point' ? 3000 : 100 * n, n);
  const central = optStr(o, ['FiniteDifferenceType', 'FinDiffType'], 'forward').toLowerCase() === 'central';
  const fdOpts = { central, lb, ub };
  let x = clampX(prob.x0, lb, ub);
  if (prob.algorithm === 'interior-point') {
    // move strictly inside finite two-sided bounds, like the barrier method's start
    for (let i = 0; i < n; i++) if (Number.isFinite(lb[i]) && Number.isFinite(ub[i]) && ub[i] > lb[i]) {
      const w = ub[i] - lb[i]; x[i] = Math.min(Math.max(x[i], lb[i] + 1e-3 * w), ub[i] - 1e-3 * w);
    }
  }
  const evalAll = (z) => {
    let fz, gz;
    if (prob.fg) [fz, gz] = prob.fg(z); else { fz = prob.f(z); gz = fdGrad(prob.f, z, fz, fdOpts); }
    let c = [], ceq = [], Jc = [], Jceq = [];
    if (prob.con) {
      const r = prob.con(z);
      c = Array.from(r.c); ceq = Array.from(r.ceq);
      if (r.Jc) { Jc = r.Jc; Jceq = r.Jceq; }
      else if (c.length + ceq.length) {
        const V2 = (w) => { const q = prob.con(w); return Float64Array.from([...q.c, ...q.ceq]); };
        const J = fdJac(V2, z, Float64Array.from([...c, ...ceq]), fdOpts);
        Jc = J.slice(0, c.length); Jceq = J.slice(c.length);
      }
    }
    return { f: fz, g: gz, c, ceq, Jc, Jceq };
  };
  const linViol = (z) => { let v = 0; Ain.forEach((r, i) => { v += Math.max(0, rowDot(r, z) - bin[i]); }); Aeq.forEach((r, i) => { v += Math.abs(rowDot(r, z) - beq[i]); }); return v; };
  const nlViol = (s) => s.c.reduce((a, v) => a + Math.max(0, v), 0) + s.ceq.reduce((a, v) => a + Math.abs(v), 0);
  const maxViol = (z, s) => {
    let v = 0;
    Ain.forEach((r, i) => { v = Math.max(v, rowDot(r, z) - bin[i]); }); Aeq.forEach((r, i) => { v = Math.max(v, Math.abs(rowDot(r, z) - beq[i])); });
    for (const c of s.c) v = Math.max(v, c); for (const c of s.ceq) v = Math.max(v, Math.abs(c));
    for (let j = 0; j < n; j++) v = Math.max(v, lb[j] - z[j], z[j] - ub[j]);
    return Math.max(0, v);
  };
  let st = evalAll(x);
  if (!Number.isFinite(st.f)) throw E(`${name}:badStart`, 'The objective function is undefined at the initial point.');
  let B = zerosM(n, n); for (let i = 0; i < n; i++) B[i][i] = 1;
  let mu = 1; let iter = 0, flag = 0, msg = '', stepNorm = 0, alpha = 1;
  let lam = { ineqlin: new Array(Ain.length).fill(0), eqlin: new Array(Aeq.length).fill(0), ineqnonlin: new Array(st.c.length).fill(0), eqnonlin: new Array(st.ceq.length).fill(0), lower: new Array(n).fill(0), upper: new Array(n).fill(0) };
  const gradL = (s, l) => {
    const gl = Array.from(s.g);
    Ain.forEach((r, i) => { for (let j = 0; j < n; j++) gl[j] += l.ineqlin[i] * r[j]; });
    Aeq.forEach((r, i) => { for (let j = 0; j < n; j++) gl[j] += l.eqlin[i] * r[j]; });
    s.Jc.forEach((r, i) => { for (let j = 0; j < n; j++) gl[j] += l.ineqnonlin[i] * r[j]; });
    s.Jceq.forEach((r, i) => { for (let j = 0; j < n; j++) gl[j] += l.eqnonlin[i] * r[j]; });
    return gl;
  };
  const optimality = (s, l) => { const gl = gradL(s, l); for (let j = 0; j < n; j++) gl[j] += l.upper[j] - l.lower[j]; return infNorm(gl); };
  let firstOrder = infNorm(st.g);
  const header = '\n                                Norm of First-order\n Iter F-count            f(x) Feasibility  Steplength        step  optimality\n';
  if (level === 'iter') ctx.out(header + `${pad(0, 5)}${pad(cnt.n, 8)}${pad(g4(st.f), 16)}${pad(g4(maxViol(x, st)), 12)}${pad('', 12)}${pad('', 12)}${pad(g4(firstOrder), 12)}\n`);
  const ov = () => ({ iteration: iter, funccount: cnt.n, fval: st.f, constrviolation: maxViol(x, st), firstorderopt: firstOrder, stepsize: stepNorm, lssteplength: alpha, gradient: Array.from(st.g) });
  if (prob.outFcn && prob.outFcn(x, dims, ov(), 'init')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; }
  const g0n = Math.max(1, infNorm(st.g));
  while (!msg) {
    if (iter >= maxIter) { flag = 0; msg = `Solver stopped prematurely.\n\n${name} stopped because it exceeded the iteration limit,\noptions.MaxIterations = ${maxIter}.`; break; }
    if (cnt.n >= maxFun) { flag = 0; msg = `Solver stopped prematurely.\n\n${name} stopped because it exceeded the function evaluation limit,\noptions.MaxFunctionEvaluations = ${maxFun}.`; break; }
    ctx.checkInterrupt();
    // QP subproblem in d
    const G = [...Ain, ...st.Jc]; const h = [...Ain.map((r, i) => bin[i] - rowDot(r, x)), ...st.c.map((v) => -v)];
    const Eq = [...Aeq, ...st.Jceq]; const e = [...Aeq.map((r, i) => beq[i] - rowDot(r, x)), ...st.ceq.map((v) => -v)];
    const dlb = Float64Array.from(lb, (v, i) => v - x[i]), dub = Float64Array.from(ub, (v, i) => v - x[i]);
    let qp = qpSolve(B, Array.from(st.g), G, h, Eq, e, dlb, dub, { ctx, x0: new Float64Array(n) });
    if (qp.status === -2 || qp.status === 0 && !qp.x) {
      // elastic mode: minimise the linearised violation, then solve the relaxed QP
      const mi = G.length, me = Eq.length; const N = n + mi + 2 * me;
      const c = new Array(N).fill(0); for (let k = n; k < N; k++) c[k] = 1;
      const Gi = G.map((r, i) => { const q = new Array(N).fill(0); for (let j = 0; j < n; j++) q[j] = r[j]; q[n + i] = -1; return q; });
      const Ee = Eq.map((r, i) => { const q = new Array(N).fill(0); for (let j = 0; j < n; j++) q[j] = r[j]; q[n + mi + i] = -1; q[n + mi + me + i] = 1; return q; });
      const elb = new Float64Array(N), eub = new Float64Array(N).fill(Infinity);
      for (let j = 0; j < n; j++) { elb[j] = dlb[j]; eub[j] = dub[j]; }
      const lp = simplexLP(c, Gi, h, Ee, e, elb, eub, { ctx });
      if (lp.status !== 1) { flag = -2; msg = `No feasible solution found.\n\n${name} stopped because the linearized constraints could not be satisfied.`; break; }
      const t = lp.x;
      const h2 = h.map((v, i) => v + t[n + i]); const e2 = e.map((v, i) => v + t[n + mi + i] - t[n + mi + me + i]);
      qp = qpSolve(B, Array.from(st.g), G, h2, Eq, e2, dlb, dub, { ctx, x0: t.slice(0, n) });
      if (qp.status === -2) qp = { status: 1, x: t.slice(0, n), lambda: qp.lambda || { ineqlin: new Array(G.length).fill(0), eqlin: new Array(Eq.length).fill(0), lower: new Array(n).fill(0), upper: new Array(n).fill(0) } };
    }
    const d = qp.x; const ql = qp.lambda || { ineqlin: [], eqlin: [], lower: [], upper: [] };
    const lamNew = {
      ineqlin: ql.ineqlin.slice(0, Ain.length), ineqnonlin: ql.ineqlin.slice(Ain.length),
      eqlin: ql.eqlin.slice(0, Aeq.length), eqnonlin: ql.eqlin.slice(Aeq.length),
      lower: ql.lower.slice(), upper: ql.upper.slice(),
    };
    for (const k of Object.keys(lamNew)) lamNew[k] = lamNew[k].map((v) => (Number.isFinite(v) ? v : 0));
    const lamMax = Math.max(0, ...lamNew.ineqlin.map(Math.abs), ...lamNew.ineqnonlin.map(Math.abs), ...lamNew.eqlin.map(Math.abs), ...lamNew.eqnonlin.map(Math.abs));
    mu = Math.max(mu, 1.5 * lamMax + 1e-3);
    const dn = infNorm(d);
    const v0 = linViol(x) + nlViol(st);
    if (dn <= tolX * (1 + infNorm(x)) * 0.1) {
      lam = lamNew; firstOrder = optimality(st, lam);
      const cv = maxViol(x, st);
      if (cv <= tolCon) { flag = firstOrder <= tolOpt * g0n ? 1 : 2; msg = flag === 1 ? `Local minimum found that satisfies the constraints.\n\nOptimization completed because the objective function is non-decreasing in\nfeasible directions, to within the value of the optimality tolerance,\nand constraints are satisfied to within the value of the constraint tolerance.` : `Local minimum possible. Constraints satisfied.\n\n${name} stopped because the size of the current step is less than\nthe value of the step size tolerance and constraints are\nsatisfied to within the value of the constraint tolerance.`; }
      else { flag = -2; msg = `Converged to an infeasible point.\n\n${name} stopped because the size of the current step is less than\nthe value of the step size tolerance but constraints are not\nsatisfied to within the value of the constraint tolerance.`; }
      break;
    }
    // merit line search
    const phi0 = st.f + mu * v0;
    const dphi = rowDot(d, st.g) - mu * v0;
    alpha = 1; let stn = null, xn = null;
    for (let k = 0; k < 40; k++) {
      xn = x.map((v, i) => v + alpha * d[i]);
      for (let i = 0; i < n; i++) { if (xn[i] < lb[i]) xn[i] = lb[i]; if (xn[i] > ub[i]) xn[i] = ub[i]; }
      stn = evalAll(xn);
      const phi = stn.f + mu * (linViol(xn) + nlViol(stn));
      if (Number.isFinite(phi) && phi <= phi0 + 1e-4 * alpha * Math.min(dphi, 0)) break;
      if (Number.isFinite(phi) && k > 25 && phi < phi0) break;
      alpha *= 0.5;
      if (alpha < 1e-12) { stn = null; break; }
    }
    if (!stn) {
      lam = lamNew; firstOrder = optimality(st, lam);
      const cv = maxViol(x, st);
      if (cv <= tolCon) { flag = 2; msg = `Local minimum possible. Constraints satisfied.\n\n${name} stopped because it cannot decrease the merit function along the search direction.`; }
      else { flag = -2; msg = `No feasible solution found.\n\n${name} stopped because it cannot decrease the constraint violation further.`; }
      break;
    }
    const s = xn.map((v, i) => v - x[i]);
    const gl0 = gradL(st, lamNew), gl1 = gradL(stn, lamNew);
    let y = gl1.map((v, i) => v - gl0[i]);
    const Bs = B.map((r) => rowDot(r, s)); const sBs = rowDot(s, Bs); const sy = rowDot(s, y);
    if (sBs > 0) {
      if (sy < 0.2 * sBs) { const th = 0.8 * sBs / (sBs - sy); y = y.map((v, i) => th * v + (1 - th) * Bs[i]); }
      const sy2 = rowDot(s, y);
      if (sy2 > 0) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i][j] += -Bs[i] * Bs[j] / sBs + y[i] * y[j] / sy2;
    }
    x = xn; st = stn; lam = lamNew; iter++;
    stepNorm = twoNorm(s);
    firstOrder = optimality(st, lam);
    const cv = maxViol(x, st);
    if (level === 'iter') ctx.out(`${pad(iter, 5)}${pad(cnt.n, 8)}${pad(g4(st.f), 16)}${pad(g4(cv), 12)}${pad(g4(alpha), 12)}${pad(g4(stepNorm), 12)}${pad(g4(firstOrder), 12)}\n`);
    if (prob.outFcn && prob.outFcn(x, dims, ov(), 'iter')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; break; }
    if (cv <= tolCon && firstOrder <= tolOpt * g0n) { flag = 1; msg = 'Local minimum found that satisfies the constraints.\n\nOptimization completed because the objective function is non-decreasing in\nfeasible directions, to within the value of the optimality tolerance,\nand constraints are satisfied to within the value of the constraint tolerance.'; break; }
    if (stepNorm <= tolX * (1 + twoNorm(x)) && cv <= tolCon) { flag = 2; msg = `Local minimum possible. Constraints satisfied.\n\n${name} stopped because the size of the current step is less than\nthe value of the step size tolerance and constraints are\nsatisfied to within the value of the constraint tolerance.`; break; }
  }
  if (prob.outFcn && flag !== -1) prob.outFcn(x, dims, ov(), 'done');
  return { x, fval: st.f, flag, msg, iter, funcCount: cnt.n, lam, grad: st.g, B, constrviolation: maxViol(x, st), firstorderopt: firstOrder, stepsize: stepNorm, lssteplength: alpha, st };
}

/** nonlcon wrapper: (x) → {c, ceq, Jc?, Jceq?} */
function makeCon(ctx, nonlcon, dims, n, userGrad) {
  if (!nonlcon) return null;
  return (x) => {
    ctx.checkInterrupt();
    const r = callFn(ctx, nonlcon, [wrapX(x, dims)], userGrad ? 4 : 2);
    const c = r.length > 0 ? Array.from(F(r[0])) : []; const ceq = r.length > 1 ? Array.from(F(r[1])) : [];
    const out = { c, ceq };
    if (userGrad) { out.Jc = colsToRows(r[2], n); out.Jceq = colsToRows(r[3], n); }
    return out;
  };
}

function hessValue(B) { const n = B.length; const a = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) a[i + j * n] = B[i][j]; return V(n, n, a); }

function fmincon(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'Aineq', 'bineq', 'Aeq', 'beq', 'lb', 'ub', 'nonlcon', 'options']);
  if (args.length < 2) throw E('fmincon:notEnoughInputs', 'fmincon requires at least a function and a starting point.');
  if (args.length < 4 && args.length !== 2) throw E('fmincon:notEnoughInputs', 'fmincon requires FUN, X0, A and b (use [] for no linear constraints).');
  const fh = fnArg(args[0], 'FUN');
  const dims = args[1].dims || [1, 1];
  const x0 = Float64Array.from(F(args[1], 'X0'));
  const n = x0.length;
  const { rows: Ain, rhs: bin } = linCons(argAt(args, 2), argAt(args, 3), n, 'fmincon', 'A');
  const { rows: Aeq, rhs: beq } = linCons(argAt(args, 4), argAt(args, 5), n, 'fmincon', 'Aeq');
  const { lb, ub, consistent } = boundsOf(argAt(args, 6), argAt(args, 7), n, 'fmincon');
  const nlc = argAt(args, 8);
  const nonlcon = nlc && (isFuncHandle(nlc) || isText(nlc)) ? fnArg(nlc, 'NONLCON') : null;
  const o = getOpts(argAt(args, 9));
  const level = dispLevel(o, 'final');
  const algorithm = optStr(o, ['Algorithm'], 'interior-point').toLowerCase();
  const alg = algorithm === 'active-set' || algorithm === 'sqp' || algorithm === 'sqp-legacy' ? algorithm : algorithm === 'trust-region-reflective' ? 'trust-region-reflective' : 'interior-point';
  const cnt = { n: 0 };
  const userGrad = optBool(o, ['SpecifyObjectiveGradient', 'GradObj'], false);
  const userCGrad = optBool(o, ['SpecifyConstraintGradient', 'GradConstr'], false);
  if (!consistent) {
    const msg = 'Exiting due to infeasibility: at least one lower bound exceeds the corresponding upper bound.';
    finalMessage(ctx, level, -2, msg);
    return [xOut(x0, dims), num(NaN), num(-2), outStruct({ iterations: 0, funcCount: 0, algorithm: alg, message: msg, constrviolation: NaN, firstorderopt: NaN, stepsize: 0 })].slice(0, Math.max(1, nargout));
  }
  const prob = {
    n, x0, Ain, bin, Aeq, beq, lb, ub, o, cnt, level, dims, name: 'fmincon', algorithm: alg === 'interior-point' ? 'interior-point' : 'sqp',
    f: scalarFn(ctx, fh, dims, cnt), fg: userGrad ? gradFn(ctx, fh, dims, cnt) : null,
    con: makeCon(ctx, nonlcon, dims, n, userCGrad), outFcn: makeOutputFcn(ctx, o),
  };
  const r = sqp(ctx, prob);
  finalMessage(ctx, level, r.flag, r.msg);
  const output = outStruct({ iterations: r.iter, funcCount: r.funcCount, constrviolation: r.constrviolation, stepsize: r.stepsize, algorithm: alg, firstorderopt: r.firstorderopt, lssteplength: r.lssteplength, message: r.msg });
  const res = [xOut(r.x, dims), num(r.fval), num(r.flag), output];
  if (nargout > 4) res.push(lambdaStruct(n, { eqlin: r.lam.eqlin, eqnonlin: r.lam.eqnonlin, ineqlin: r.lam.ineqlin, lower: r.lam.lower, upper: r.lam.upper, ineqnonlin: r.lam.ineqnonlin }));
  if (nargout > 5) res.push(xOut(r.grad, [n, 1]));
  if (nargout > 6) res.push(hessValue(r.B));
  return res.slice(0, Math.max(1, nargout));
}

/** min t over [x; t] with F_i(x) - w_i t <= goal_i. Shared by fminimax (w=1, goal=0) and fgoalattain. */
function minimaxCore(ctx, name, fh, x0V, goal, weight, rest, nargout, kind) {
  const dims = x0V.dims || [1, 1];
  const x0 = Float64Array.from(F(x0V, 'X0'));
  const n = x0.length;
  const { rows: A0, rhs: bin } = linCons(argAt(rest, 0), argAt(rest, 1), n, name, 'A');
  const { rows: Aeq0, rhs: beq } = linCons(argAt(rest, 2), argAt(rest, 3), n, name, 'Aeq');
  const { lb: lb0, ub: ub0 } = boundsOf(argAt(rest, 4), argAt(rest, 5), n, name);
  const nlc = argAt(rest, 6);
  const nonlcon = nlc && (isFuncHandle(nlc) || isText(nlc)) ? fnArg(nlc, 'NONLCON') : null;
  const o = getOpts(argAt(rest, 7));
  const level = dispLevel(o, 'final');
  const cnt = { n: 0 };
  const Fv = (x) => { ctx.checkInterrupt(); cnt.n++; const r = callFn(ctx, fh, [wrapX(x, dims)], 1); return Float64Array.from(F(r[0])); };
  const absMode = kind === 'minimax' ? Math.round(optNum(o, ['AbsoluteMaxObjectiveCount', 'MinAbsMax'], 0)) : 0;
  const F0 = Fv(x0); const m = F0.length;
  const gl = goal ? goal : new Float64Array(m); const w = weight ? weight : new Float64Array(m).fill(1);
  if (gl.length !== m || w.length !== m) throw E(`${name}:badGoal`, `The goal and weight vectors must have ${m} elements (one per objective).`);
  const userCon = makeCon(ctx, nonlcon, dims, n, false);
  const xa = (z) => z.slice(0, n);
  const objs = (x) => { const v = Fv(x); const out = []; for (let i = 0; i < m; i++) out.push(i < absMode ? Math.abs(v[i]) : v[i]); return out; };
  let t0 = -Infinity;
  { const v = objs(x0); for (let i = 0; i < m; i++) { const ti = w[i] !== 0 ? (v[i] - gl[i]) / w[i] : 0; if (ti > t0) t0 = ti; } if (!Number.isFinite(t0)) t0 = 0; }
  const con = (z) => {
    const x = xa(z); const v = objs(x); const c = []; const ceq = [];
    for (let i = 0; i < m; i++) { if (w[i] === 0) ceq.push(v[i] - gl[i]); else c.push(v[i] - w[i] * z[n] - gl[i]); }
    if (userCon) { const u = userCon(x); c.push(...u.c); ceq.push(...u.ceq); }
    return { c, ceq };
  };
  const pad1 = (rows) => rows.map((r) => [...r, 0]);
  const lb = Float64Array.from([...lb0, -Infinity]), ub = Float64Array.from([...ub0, Infinity]);
  const prob = {
    n: n + 1, x0: Float64Array.from([...x0, t0]), Ain: pad1(A0), bin, Aeq: pad1(Aeq0), beq, lb, ub, o, cnt, level, dims: [n + 1, 1], name, algorithm: 'sqp',
    fg: (z) => { const g = new Float64Array(n + 1); g[n] = 1; return [z[n], g]; }, con, outFcn: null,
  };
  const r = sqp(ctx, prob);
  const x = xa(r.x); const fval = objs(x);
  finalMessage(ctx, level, r.flag, r.msg);
  const output = outStruct({ iterations: r.iter, funcCount: r.funcCount, lssteplength: r.lssteplength, stepsize: r.stepsize, algorithm: 'active-set', firstorderopt: r.firstorderopt, constrviolation: r.constrviolation, message: r.msg });
  const nn = Math.min(m, r.lam.ineqnonlin.length);
  const lam = lambdaStruct(n, { lower: r.lam.lower.slice(0, n), upper: r.lam.upper.slice(0, n), eqlin: r.lam.eqlin, eqnonlin: r.lam.eqnonlin, ineqlin: r.lam.ineqlin, ineqnonlin: r.lam.ineqnonlin.slice(nn) });
  return { x: xOut(x, dims), fval: V(m, 1, Float64Array.from(fval)), t: r.x[n], flag: r.flag, output, lam, fmax: Math.max(...fval) };
}

function fminimax(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'Aineq', 'bineq', 'Aeq', 'beq', 'lb', 'ub', 'nonlcon', 'options']);
  if (args.length < 2) throw E('fminimax:notEnoughInputs', 'fminimax requires a function and a starting point.');
  const r = minimaxCore(ctx, 'fminimax', fnArg(args[0]), args[1], null, null, args.slice(2), nargout, 'minimax');
  return [r.x, r.fval, num(r.fmax), num(r.flag), r.output, r.lam].slice(0, Math.max(1, nargout));
}
function fgoalattain(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'goal', 'weight', 'Aineq', 'bineq', 'Aeq', 'beq', 'lb', 'ub', 'nonlcon', 'options']);
  if (args.length < 4) throw E('fgoalattain:notEnoughInputs', 'fgoalattain requires FUN, X0, GOAL and WEIGHT.');
  const goal = Float64Array.from(F(args[2], 'GOAL')); const weight = Float64Array.from(F(args[3], 'WEIGHT'));
  const r = minimaxCore(ctx, 'fgoalattain', fnArg(args[0]), args[1], goal, weight, args.slice(4), nargout, 'goal');
  return [r.x, r.fval, num(r.t), num(r.flag), r.output, r.lam].slice(0, Math.max(1, nargout));
}

export const builtins = { fmincon, fminimax, fgoalattain };
export const help = {
  fmincon: H("Minimum of a constrained nonlinear multivariable function (linear, bound and nonlinear constraints; 'sqp', 'active-set' and a basic 'interior-point').", "제약 조건이 있는 비선형 다변수 함수의 최솟값 (선형·경계·비선형 제약; 'sqp', 'active-set', 기본 'interior-point').", ['x = fmincon(fun, x0, A, b)', 'x = fmincon(fun, x0, A, b, Aeq, beq)', 'x = fmincon(fun, x0, A, b, Aeq, beq, lb, ub)', 'x = fmincon(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon)', 'x = fmincon(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options)', 'x = fmincon(problem)', '[x, fval, exitflag, output, lambda, grad, hessian] = fmincon(___)']),
  fminimax: H('Minimizes the worst-case (largest) value of a set of objective functions, with constraints.', '여러 목적 함수 중 최악(최댓값)을 제약 조건 아래 최소화합니다.', ['x = fminimax(fun, x0)', 'x = fminimax(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options)', '[x, fval, maxfval, exitflag, output, lambda] = fminimax(___)']),
  fgoalattain: H('Multiobjective goal attainment: minimizes the attainment factor gamma with F(x) - weight*gamma <= goal.', '다목적 목표 달성: F(x) - weight*gamma <= goal 을 만족하며 달성 계수 gamma 를 최소화합니다.', ['x = fgoalattain(fun, x0, goal, weight)', 'x = fgoalattain(fun, x0, goal, weight, A, b, Aeq, beq, lb, ub, nonlcon, options)', '[x, fval, attainfactor, exitflag, output, lambda] = fgoalattain(___)']),
};
