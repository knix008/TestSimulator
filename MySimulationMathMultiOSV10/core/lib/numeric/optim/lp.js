// Linear, mixed-integer linear and quadratic programming: linprog (two-phase
// simplex with bounds), intlinprog (branch and bound over LP relaxations) and
// quadprog (primal active-set method).
import { num } from '../../../value.js';
import { E, F, H, M, isEmptyV } from '../_util.js';
import {
  getOpts, optNum, optStr, dispLevel, finalMessage, outStruct, xOut, rowDot, linCons, boundsOf, argAt, fromProblem,
  simplexLP, qpSolve, kktMultipliers, lambdaStruct, linViolation, g4, pad,
} from './common.js';

/** Multipliers of the active linear constraints and bounds at x for gradient g. */
function activeLambda(g, x, Ain, bin, Aeq, beq, lb, ub) {
  const n = x.length; const Gi = [], tags = [];
  Ain.forEach((r, i) => { if (Math.abs(rowDot(r, x) - bin[i]) <= 1e-8 * (1 + Math.abs(bin[i]))) { Gi.push(r); tags.push(['ineqlin', i]); } });
  for (let j = 0; j < n; j++) {
    if (Number.isFinite(lb[j]) && Math.abs(x[j] - lb[j]) <= 1e-9 * (1 + Math.abs(lb[j]))) { const r = new Array(n).fill(0); r[j] = -1; Gi.push(r); tags.push(['lower', j]); }
    else if (Number.isFinite(ub[j]) && Math.abs(x[j] - ub[j]) <= 1e-9 * (1 + Math.abs(ub[j]))) { const r = new Array(n).fill(0); r[j] = 1; Gi.push(r); tags.push(['upper', j]); }
  }
  const { lam, mu } = kktMultipliers(g, Gi, Aeq);
  const out = { ineqlin: new Array(Ain.length).fill(0), eqlin: mu.length ? mu : new Array(Aeq.length).fill(0), lower: new Array(n).fill(0), upper: new Array(n).fill(0) };
  tags.forEach(([k, j], t) => { out[k][j] = lam[t]; });
  return out;
}

function lpArgs(args, fn, offset) {
  const f = Float64Array.from(F(args[0], 'f')); const n = f.length;
  const { rows: Ain, rhs: bin } = linCons(argAt(args, offset), argAt(args, offset + 1), n, fn, 'A');
  const { rows: Aeq, rhs: beq } = linCons(argAt(args, offset + 2), argAt(args, offset + 3), n, fn, 'Aeq');
  const bd = boundsOf(argAt(args, offset + 4), argAt(args, offset + 5), n, fn);
  return { f, n, Ain, bin, Aeq, beq, ...bd };
}

function linprog(args, nargout, ctx) {
  args = fromProblem(args, ['f', 'Aineq', 'bineq', 'Aeq', 'beq', 'lb', 'ub', 'options']);
  if (args.length < 1) throw E('linprog:notEnoughInputs', 'linprog requires the objective coefficient vector f.');
  if (args.length === 2 || isEmptyV(args[0])) throw E('linprog:notEnoughInputs', 'linprog requires f, A and b.');
  const p = lpArgs(args, 'linprog', 1);
  const o = getOpts(argAt(args, 7));
  const level = dispLevel(o, 'final');
  const algorithm = optStr(o, ['Algorithm'], 'dual-simplex');
  const r = p.consistent ? simplexLP(Array.from(p.f), p.Ain, p.bin, p.Aeq, p.beq, p.lb, p.ub, { ctx, maxIter: optNum(o, ['MaxIterations', 'MaxIter'], undefined) }) : { status: -2, x: new Float64Array(p.n), fval: NaN, iterations: 0 };
  let flag = r.status, msg;
  if (flag === 1) msg = 'Optimal solution found.';
  else if (flag === -2) msg = 'No feasible point found. Linear constraints are inconsistent or the bounds cannot be satisfied.';
  else if (flag === -3) msg = 'Problem is unbounded.';
  else msg = 'Solver stopped prematurely. linprog stopped because it exceeded the iteration limit.';
  if (level === 'iter') ctx.out(`\nLP preprocessing done.\n\n  Iter      Objective\n${pad(r.iterations, 6)}${pad(g4(r.fval), 15)}\n`);
  finalMessage(ctx, level, flag, msg);
  const ok = flag === 1;
  const x = ok ? r.x : null;
  const lam = ok ? activeLambda(Array.from(p.f), x, p.Ain, p.bin, p.Aeq, p.beq, p.lb, p.ub) : null;
  const output = outStruct({ iterations: r.iterations, constrviolation: ok ? linViolation(x, p.Ain, p.bin, p.Aeq, p.beq, p.lb, p.ub) : NaN, message: msg, algorithm, firstorderopt: 0 });
  const xv = ok ? xOut(x, [p.n, 1]) : xOut([], [0, 0]);
  const fval = ok ? num(r.fval) : xOut([], [0, 0]);
  const lv = lambdaStruct(p.n, ok ? lam : { ineqlin: [], eqlin: [], lower: [], upper: [] });
  return [xv, fval, num(flag), output, lv].slice(0, Math.max(1, nargout));
}

function intlinprog(args, nargout, ctx) {
  args = fromProblem(args, ['f', 'intcon', 'Aineq', 'bineq', 'Aeq', 'beq', 'lb', 'ub', 'x0', 'options']);
  if (args.length < 4) throw E('intlinprog:notEnoughInputs', 'intlinprog requires f, intcon, A and b.');
  const intcon = argAt(args, 1) ? Array.from(F(args[1])).map((v) => v - 1) : [];
  const p = lpArgs([args[0], ...args.slice(2)], 'intlinprog', 1);
  if (intcon.some((j) => !Number.isInteger(j) || j < 0 || j >= p.n)) throw E('intlinprog:badIntcon', `intcon must contain integers between 1 and ${p.n}.`);
  let optArg = argAt(args, 9); if (!optArg && getOpts(argAt(args, 8))) optArg = args[8];
  const o = getOpts(optArg);
  const level = dispLevel(o, 'final');
  const maxNodes = optNum(o, ['MaxNodes'], 1e7);
  const intTol = optNum(o, ['IntegerTolerance', 'TolInteger'], 1e-5);
  const gapTol = optNum(o, ['RelativeGapTolerance', 'TolGapRel'], 1e-4);
  const absGapTol = optNum(o, ['AbsoluteGapTolerance', 'TolGapAbs'], 1e-6);
  const maxTime = optNum(o, ['MaxTime'], 7200);
  const t0 = Date.now();
  // integer bounds
  const lb0 = Float64Array.from(p.lb), ub0 = Float64Array.from(p.ub);
  for (const j of intcon) { lb0[j] = Math.ceil(lb0[j] - intTol); ub0[j] = Math.floor(ub0[j] + intTol); }
  let best = null, bestF = Infinity, nodes = 0, feas = 0, rootBound = -Infinity, flag = 1, unbounded = false;
  const stack = [{ lb: lb0, ub: ub0, bound: -Infinity }];
  if (level === 'iter') ctx.out('\n   nodes    total     num int     integer       relative\nexplored  time (s)  solution        fval        gap (%)\n');
  while (stack.length) {
    if (nodes >= maxNodes || (Date.now() - t0) / 1000 > maxTime) { flag = best ? 2 : 0; break; }
    ctx.checkInterrupt();
    const node = stack.pop();
    if (node.bound >= bestF - absGapTol) continue;
    nodes++;
    if (!node.lb.every((v, i) => v <= node.ub[i])) continue;
    const r = simplexLP(Array.from(p.f), p.Ain, p.bin, p.Aeq, p.beq, node.lb, node.ub, { ctx });
    if (r.status === -3) { if (nodes === 1) { unbounded = true; break; } continue; }
    if (r.status !== 1) continue;
    if (nodes === 1) rootBound = r.fval;
    if (r.fval >= bestF - Math.max(absGapTol, gapTol * Math.abs(bestF))) continue;
    let bj = -1, bfrac = 0;
    for (const j of intcon) { const fr = Math.abs(r.x[j] - Math.round(r.x[j])); if (fr > intTol && fr > bfrac) { bfrac = fr; bj = j; } }
    if (bj < 0) {
      const x = Float64Array.from(r.x); for (const j of intcon) x[j] = Math.round(x[j]);
      let fv = 0; for (let j = 0; j < p.n; j++) fv += p.f[j] * x[j];
      if (fv < bestF) { bestF = fv; best = x; feas++; if (level === 'iter') ctx.out(`${pad(nodes, 8)}${pad(((Date.now() - t0) / 1000).toFixed(2), 10)}${pad(feas, 10)}${pad(g4(bestF), 14)}${pad(g4(100 * Math.abs(bestF - rootBound) / Math.max(1, Math.abs(bestF))), 14)}\n`); }
      continue;
    }
    const v = r.x[bj];
    const down = { lb: Float64Array.from(node.lb), ub: Float64Array.from(node.ub), bound: r.fval }; down.ub[bj] = Math.floor(v);
    const up = { lb: Float64Array.from(node.lb), ub: Float64Array.from(node.ub), bound: r.fval }; up.lb[bj] = Math.ceil(v);
    // explore the nearer branch first
    if (v - Math.floor(v) < 0.5) { stack.push(up); stack.push(down); } else { stack.push(down); stack.push(up); }
  }
  let msg;
  if (unbounded) { flag = -3; msg = 'Intlinprog stopped because the root LP problem is unbounded.'; }
  else if (!best) { flag = flag === 0 ? 0 : -2; msg = flag === 0 ? 'Intlinprog stopped because it reached the node or time limit without an integer feasible point.' : 'No feasible solution found.\n\nIntlinprog stopped because no integer points satisfy the constraints.'; }
  else if (flag === 2) msg = 'Intlinprog stopped because it reached the node or time limit. An integer feasible point was found.';
  else msg = `Optimal solution found.\n\nIntlinprog stopped because the objective value is within a gap tolerance of the\noptimal value, options.AbsoluteGapTolerance = ${g4(absGapTol)}. The intcon variables are\ninteger within tolerance, options.IntegerTolerance = ${g4(intTol)}.`;
  finalMessage(ctx, level, flag, msg);
  const absgap = best ? Math.max(0, bestF - Math.min(bestF, rootBound)) : Infinity;
  const output = outStruct({ relativegap: best ? absgap / (Math.abs(bestF) + 1) : Infinity, absolutegap: absgap, numfeaspoints: feas, numnodes: nodes, constrviolation: best ? linViolation(best, p.Ain, p.bin, p.Aeq, p.beq, p.lb, p.ub) : NaN, message: msg });
  return [best ? xOut(best, [p.n, 1]) : xOut([], [0, 0]), best ? num(bestF) : xOut([], [0, 0]), num(flag), output].slice(0, Math.max(1, nargout));
}

function quadprog(args, nargout, ctx) {
  args = fromProblem(args, ['H', 'f', 'Aineq', 'bineq', 'Aeq', 'beq', 'lb', 'ub', 'x0', 'options']);
  if (args.length < 2) throw E('quadprog:notEnoughInputs', 'quadprog requires H and f.');
  let n;
  const f0 = argAt(args, 1) ? Float64Array.from(F(args[1], 'f')) : null;
  const Hv = argAt(args, 0);
  if (Hv) { const h = M(Hv, 'H'); if (h.m !== h.n) throw E('quadprog:badH', 'H must be a square matrix.'); n = h.n; }
  else n = f0 ? f0.length : 0;
  const f = f0 || new Float64Array(n);
  if (f.length !== n) throw E('quadprog:sizeMismatch', 'The length of f must equal the size of H.');
  const Hm = []; if (Hv) { const h = M(Hv); for (let i = 0; i < n; i++) { const r = new Array(n); for (let j = 0; j < n; j++) r[j] = 0.5 * (h.a[i + j * n] + h.a[j + i * n]); Hm.push(r); } } else for (let i = 0; i < n; i++) Hm.push(new Array(n).fill(0));
  const { rows: Ain, rhs: bin } = linCons(argAt(args, 2), argAt(args, 3), n, 'quadprog', 'A');
  const { rows: Aeq, rhs: beq } = linCons(argAt(args, 4), argAt(args, 5), n, 'quadprog', 'Aeq');
  const { lb, ub, consistent } = boundsOf(argAt(args, 6), argAt(args, 7), n, 'quadprog');
  const x0 = argAt(args, 8) && !getOpts(args[8]) ? Float64Array.from(F(args[8])) : null;
  const o = getOpts(argAt(args, 9) || (getOpts(argAt(args, 8)) ? args[8] : undefined));
  const level = dispLevel(o, 'final');
  const algorithm = optStr(o, ['Algorithm'], 'interior-point-convex');
  const r = consistent ? qpSolve(Hm, Array.from(f), Ain, bin, Aeq, beq, lb, ub, { ctx, x0, maxIter: optNum(o, ['MaxIterations', 'MaxIter'], undefined) }) : { status: -2, x: new Float64Array(n), iterations: 0 };
  let flag = r.status, msg;
  if (flag === 1 && r.nonconvex) { flag = -6; msg = 'Non-convex problem detected; the returned point is a local solution.'; }
  else if (flag === 1) msg = 'Minimum found that satisfies the constraints.\n\nOptimization completed because the objective function is non-decreasing in\nfeasible directions, to within the value of the optimality tolerance,\nand constraints are satisfied to within the value of the constraint tolerance.';
  else if (flag === -2) msg = 'The problem is infeasible.\n\nquadprog stopped because the constraints cannot be satisfied.';
  else if (flag === -3) msg = 'The problem is unbounded.\n\nquadprog stopped because the objective decreases without bound.';
  else msg = 'Solver stopped prematurely.\n\nquadprog exceeded the iteration limit.';
  finalMessage(ctx, level, flag, msg);
  const x = r.x;
  let fval = 0; for (let i = 0; i < n; i++) { fval += f[i] * x[i]; for (let j = 0; j < n; j++) fval += 0.5 * x[i] * Hm[i][j] * x[j]; }
  const g = f.map((v, i) => v + Hm[i].reduce((a, h, j) => a + h * x[j], 0));
  const lam = flag === 1 || flag === -6 ? activeLambda(Array.from(g), x, Ain, bin, Aeq, beq, lb, ub) : (r.lambda || { ineqlin: [], eqlin: [], lower: [], upper: [] });
  const output = outStruct({ message: msg, algorithm, firstorderopt: 0, constrviolation: linViolation(x, Ain, bin, Aeq, beq, lb, ub), iterations: r.iterations, cgiterations: 0 });
  return [xOut(x, [n, 1]), num(fval), num(flag), output, lambdaStruct(n, lam)].slice(0, Math.max(1, nargout));
}

export const builtins = { linprog, intlinprog, quadprog };
export const help = {
  linprog: H('Linear programming: minimizes f\'*x subject to A*x <= b, Aeq*x = beq and lb <= x <= ub (two-phase simplex).', '선형 계획법: A*x <= b, Aeq*x = beq, lb <= x <= ub 아래 f\'*x 를 최소화합니다 (2단계 심플렉스).', ['x = linprog(f, A, b)', 'x = linprog(f, A, b, Aeq, beq)', 'x = linprog(f, A, b, Aeq, beq, lb, ub)', 'x = linprog(f, A, b, Aeq, beq, lb, ub, options)', 'x = linprog(problem)', '[x, fval, exitflag, output, lambda] = linprog(___)']),
  intlinprog: H('Mixed-integer linear programming by branch and bound over LP relaxations.', 'LP 완화 위의 분기 한정법으로 혼합 정수 선형 계획 문제를 풉니다.', ['x = intlinprog(f, intcon, A, b)', 'x = intlinprog(f, intcon, A, b, Aeq, beq)', 'x = intlinprog(f, intcon, A, b, Aeq, beq, lb, ub)', 'x = intlinprog(f, intcon, A, b, Aeq, beq, lb, ub, x0, options)', '[x, fval, exitflag, output] = intlinprog(___)']),
  quadprog: H('Quadratic programming: minimizes 0.5*x\'*H*x + f\'*x with linear and bound constraints (active-set method).', '이차 계획법: 선형·경계 제약 아래 0.5*x\'*H*x + f\'*x 를 최소화합니다 (활성 집합법).', ['x = quadprog(H, f)', 'x = quadprog(H, f, A, b)', 'x = quadprog(H, f, A, b, Aeq, beq, lb, ub)', 'x = quadprog(H, f, A, b, Aeq, beq, lb, ub, x0, options)', 'x = quadprog(problem)', '[x, fval, exitflag, output, lambda] = quadprog(___)']),
};
