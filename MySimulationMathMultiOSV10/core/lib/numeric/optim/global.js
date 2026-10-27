// Global and derivative-free solvers: ga (real-coded genetic algorithm),
// particleswarm (adaptive-inertia particle swarm), simulannealbnd (simulated
// annealing with bounds) and patternsearch (generalized pattern search with
// a 2N positive basis). Random numbers come from the global stream, so
// rng(seed) makes runs reproducible.
import { num, tensor, isFuncHandle, isText } from '../../../value.js';
import { E, F, H, fnArg, V, callFn } from '../_util.js';
import { urand, nrand, globalGen } from '../random.js';
import {
  getOpts, optNum, optStr, optBool, optArr, optRaw, dispLevel, scalarFn, makeOutputFcn, finalMessage, outStruct, pad, g4,
  xOut, wrapX, infNorm, twoNorm, rowDot, linCons, boundsOf, argAt, fromProblem, svdNull, qpSolve, zerosM,
} from './common.js';

const rngStateStruct = (ctx) => { const g = globalGen(ctx); return { state: tensor('uint32', [625, 1], g.getState()), type: g.type }; };

/** Constraint helper shared by the population methods: violation of linear, bound and nonlinear constraints. */
function makeViolation(ctx, Ain, bin, Aeq, beq, lb, ub, nonlcon, dims) {
  return (x) => {
    let v = 0;
    Ain.forEach((r, i) => { v = Math.max(v, rowDot(r, x) - bin[i]); });
    Aeq.forEach((r, i) => { v = Math.max(v, Math.abs(rowDot(r, x) - beq[i])); });
    for (let j = 0; j < x.length; j++) v = Math.max(v, lb[j] - x[j], x[j] - ub[j]);
    if (nonlcon) {
      const r = callFn(ctx, nonlcon, [wrapX(x, dims)], 2);
      if (r.length > 0) for (const c of F(r[0])) v = Math.max(v, c);
      if (r.length > 1) for (const c of F(r[1])) v = Math.max(v, Math.abs(c));
    }
    return Math.max(0, v);
  };
}

// ------------------------------------------------------------ ga
function ga(args, nargout, ctx) {
  args = fromProblem(args, ['fitnessfcn', 'nvars', 'Aineq', 'Bineq', 'Aeq', 'Beq', 'lb', 'ub', 'nonlcon', 'intcon', 'options']);
  if (args.length < 2) throw E('ga:notEnoughInputs', 'ga requires a fitness function and the number of variables.');
  const fh = fnArg(args[0], 'FITNESSFCN');
  const n = Math.round(F(args[1])[0]);
  if (!(n >= 1)) throw E('ga:badNvars', 'The number of variables must be a positive integer.');
  // ga(fun,nvars,A,b,Aeq,beq,lb,ub,nonlcon,options) or (...,nonlcon,IntCon,options)
  let o = null, intcon = [];
  if (getOpts(argAt(args, 9)) ) o = getOpts(args[9]);
  else { o = getOpts(argAt(args, 10)); if (argAt(args, 9)) intcon = Array.from(F(args[9])).map((v) => v - 1); }
  for (let k = 2; k < args.length && !o; k++) if (getOpts(args[k]) && k === args.length - 1) o = getOpts(args[k]);
  const { rows: Ain, rhs: bin } = linCons(argAt(args, 2), argAt(args, 3), n, 'ga', 'A');
  const { rows: Aeq, rhs: beq } = linCons(argAt(args, 4), argAt(args, 5), n, 'ga', 'Aeq');
  const { lb, ub } = boundsOf(argAt(args, 6), argAt(args, 7), n, 'ga');
  const nlc = argAt(args, 8); const nonlcon = nlc && (isFuncHandle(nlc) || isText(nlc)) ? fnArg(nlc) : null;
  const dims = [1, n];
  const level = dispLevel(o, 'final');
  const P = Math.round(optNum(o, ['PopulationSize'], n <= 5 ? 50 : 200));
  const maxGen = optNum(o, ['MaxGenerations', 'Generations'], 100 * n, n);
  const stallGen = optNum(o, ['MaxStallGenerations', 'StallGenLimit'], 50);
  const tolFun = optNum(o, ['FunctionTolerance', 'TolFun'], 1e-6);
  const fitLimit = optNum(o, ['FitnessLimit'], -Infinity);
  const eliteCount = Math.round(optNum(o, ['EliteCount'], Math.ceil(0.05 * P)));
  const xoverFrac = optNum(o, ['CrossoverFraction'], 0.8);
  const range = optArr(o, ['InitialPopulationRange', 'PopInitRange'], [-10, 10]);
  const outFcn = makeOutputFcn(ctx, o);
  const cnt = { n: 0 };
  const f = scalarFn(ctx, fh, dims, cnt, [], 'fitness function');
  const viol = makeViolation(ctx, Ain, bin, Aeq, beq, lb, ub, nonlcon, dims);
  const constrained = Ain.length || Aeq.length || nonlcon;
  const lo = new Float64Array(n), hi = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const rl = range.length >= 2 * n ? range[2 * j] : range[0], rh = range.length >= 2 * n ? range[2 * j + 1] : range[1];
    lo[j] = Number.isFinite(lb[j]) ? lb[j] : Math.min(rl, Number.isFinite(ub[j]) ? ub[j] - (rh - rl) : rl);
    hi[j] = Number.isFinite(ub[j]) ? ub[j] : Math.max(rh, lo[j] + (rh - rl));
  }
  const fix = (x) => { for (let j = 0; j < n; j++) { if (x[j] < lb[j]) x[j] = lb[j]; if (x[j] > ub[j]) x[j] = ub[j]; } for (const j of intcon) { x[j] = Math.round(x[j]); if (x[j] < lb[j]) x[j] = Math.ceil(lb[j]); if (x[j] > ub[j]) x[j] = Math.floor(ub[j]); } return x; };
  let pop = [];
  const init = optRaw(o, ['InitialPopulationMatrix', 'InitialPopulation']);
  if (init) { const a = F(init); const m = a.length / n; for (let i = 0; i < m; i++) { const x = new Float64Array(n); for (let j = 0; j < n; j++) x[j] = a[i + j * m]; pop.push(fix(x)); } }
  while (pop.length < P) { const x = new Float64Array(n); for (let j = 0; j < n; j++) x[j] = lo[j] + urand(ctx) * (hi[j] - lo[j]); pop.push(fix(x)); }
  pop = pop.slice(0, P);
  // penalty scoring: feasible → f; infeasible → worst feasible + violation
  const score = (pp) => {
    const raw = pp.map((x) => f(x)); const vi = constrained ? pp.map((x) => viol(x)) : pp.map(() => 0);
    let worst = -Infinity; raw.forEach((v, i) => { if (vi[i] <= 1e-6 && v > worst) worst = v; });
    if (!Number.isFinite(worst)) worst = 0;
    return { raw, vi, pen: raw.map((v, i) => (vi[i] <= 1e-6 ? v : worst + Math.abs(worst) * 0 + vi[i] * 1e3 + 1)) };
  };
  let sc = score(pop);
  let gen = 0, stall = 0, flag = 0, msg = '';
  const bestOf = () => { let b = 0; for (let i = 1; i < P; i++) if (sc.pen[i] < sc.pen[b]) b = i; return b; };
  let bi = bestOf(); let bestHist = [sc.pen[bi]];
  if (level === 'iter') ctx.out('\n                                  Best           Mean      Stall\nGeneration      Func-count        f(x)           f(x)    Generations\n');
  const ov = () => ({ Generation: gen, FunEval: cnt.n, Best: bestHist.slice(), LastImprovement: gen - stall, Population: pop.map((x) => Array.from(x)), Score: Array.from(sc.pen) });
  const sigma0 = Float64Array.from(hi, (h, j) => h - lo[j]);
  while (!msg) {
    ctx.checkInterrupt();
    if (gen >= maxGen) { flag = 0; msg = 'Optimization terminated: maximum number of generations exceeded.'; break; }
    if (sc.pen[bi] <= fitLimit) { flag = 5; msg = 'Optimization terminated: minimum fitness limit reached.'; break; }
    // rank scaling and stochastic uniform selection
    const order = sc.pen.map((_, i) => i).sort((a, b) => sc.pen[a] - sc.pen[b]);
    const expct = new Float64Array(P); order.forEach((i, r) => { expct[i] = 1 / Math.sqrt(r + 1); });
    const tot = expct.reduce((a, b) => a + b, 0);
    const nParents = 2 * P;
    const parents = []; { const step = tot / nParents; let pos = urand(ctx) * step, acc = 0, k = 0; for (let i = 0; i < P && parents.length < nParents; i++) { acc += expct[i]; while (pos < acc && parents.length < nParents) { parents.push(i); pos += step; } k++; } while (parents.length < nParents) parents.push(order[0]); }
    for (let i = parents.length - 1; i > 0; i--) { const j = Math.floor(urand(ctx) * (i + 1)); [parents[i], parents[j]] = [parents[j], parents[i]]; }
    const next = []; for (let e = 0; e < Math.min(eliteCount, P); e++) next.push(Float64Array.from(pop[order[e]]));
    const nX = Math.round(xoverFrac * (P - next.length)); let pi = 0;
    for (let k = 0; k < nX; k++) {
      const a = pop[parents[pi++ % nParents]], b = pop[parents[pi++ % nParents]];
      const c = new Float64Array(n);
      for (let j = 0; j < n; j++) c[j] = urand(ctx) < 0.5 ? a[j] : b[j];
      if (constrained) { const t = urand(ctx); for (let j = 0; j < n; j++) c[j] = a[j] + t * (b[j] - a[j]); }
      next.push(fix(c));
    }
    const shrink = 1 - gen / maxGen;
    while (next.length < P) {
      const a = pop[parents[pi++ % nParents]]; const c = new Float64Array(n);
      for (let j = 0; j < n; j++) c[j] = a[j] + nrand(ctx) * sigma0[j] * shrink * (Number.isFinite(lb[j]) && Number.isFinite(ub[j]) ? 0.25 : 1);
      next.push(fix(c));
    }
    pop = next; sc = score(pop); gen++;
    const prevBest = bestHist[bestHist.length - 1];
    bi = bestOf(); const bv = sc.pen[bi]; bestHist.push(bv);
    if (bv < prevBest - Math.abs(prevBest) * 0) stall = 0; else stall++;
    if (level === 'iter') ctx.out(`${pad(gen, 6)}${pad(cnt.n, 16)}${pad(g4(bv), 16)}${pad(g4(sc.pen.reduce((a, b) => a + b, 0) / P), 16)}${pad(stall, 8)}\n`);
    if (outFcn && outFcn(pop[bi], dims, ov(), 'iter')) { flag = -1; msg = 'Optimization terminated: stop requested by the output function.'; break; }
    if (gen > stallGen) {
      const old = bestHist[bestHist.length - 1 - stallGen];
      const change = Math.abs(old - bv) / (stallGen * Math.max(1, Math.abs(bv)));
      if (change <= tolFun) { flag = 1; msg = 'Optimization terminated: average change in the fitness value less than options.FunctionTolerance.'; break; }
    }
  }
  const best = pop[bi];
  const cv = constrained || lb.some(Number.isFinite) || ub.some(Number.isFinite) ? viol(best) : 0;
  if (flag === 1 && cv > 1e-3) { flag = -2; msg = 'Optimization terminated: no feasible point found.'; }
  finalMessage(ctx, level, flag, msg);
  const rs = rngStateStruct(ctx);
  const output = outStruct({ problemtype: intcon.length ? 'integerconstraints' : nonlcon ? 'nonlinearconstr' : Ain.length || Aeq.length ? 'linearconstraints' : lb.some(Number.isFinite) || ub.some(Number.isFinite) ? 'boundconstraints' : 'unconstrained', rngstate: { State: rs.state, Type: rs.type }, generations: gen, funccount: cnt.n, message: msg, maxconstraint: cv, hybridflag: [] });
  const popV = (() => { const a = new Float64Array(P * n); pop.forEach((x, i) => { for (let j = 0; j < n; j++) a[i + j * P] = x[j]; }); return V(P, n, a); })();
  return [xOut(best, dims), num(sc.raw[bi]), num(flag), output, popV, xOut(sc.pen, [P, 1])].slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ particleswarm
function particleswarm(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'nvars', 'lb', 'ub', 'options']);
  if (args.length < 2) throw E('particleswarm:notEnoughInputs', 'particleswarm requires an objective function and the number of variables.');
  const fh = fnArg(args[0], 'FUN'); const n = Math.round(F(args[1])[0]);
  if (!(n >= 1)) throw E('particleswarm:badNvars', 'The number of variables must be a positive integer.');
  const { lb, ub, consistent } = boundsOf(argAt(args, 2), argAt(args, 3), n, 'particleswarm');
  if (!consistent) throw E('particleswarm:InfeasibleBounds', 'At least one lower bound exceeds the corresponding upper bound.');
  const o = getOpts(argAt(args, 4));
  const dims = [1, n];
  const level = dispLevel(o, 'final');
  const N = Math.round(optNum(o, ['SwarmSize'], Math.min(100, 10 * n)));
  const maxIt = optNum(o, ['MaxIterations', 'MaxIter'], 200 * n, n);
  const stallIt = optNum(o, ['MaxStallIterations', 'StallIterLimit'], 20);
  const tolFun = optNum(o, ['FunctionTolerance', 'TolFun'], 1e-6);
  const objLimit = optNum(o, ['ObjectiveLimit'], -Infinity);
  const inertia = optArr(o, ['InertiaRange'], [0.1, 1.1]);
  const selfW = optNum(o, ['SelfAdjustmentWeight', 'SelfAdjustment'], 1.49);
  const socW = optNum(o, ['SocialAdjustmentWeight', 'SocialAdjustment'], 1.49);
  const minFrac = optNum(o, ['MinNeighborsFraction'], 0.25);
  const span = optArr(o, ['InitialSwarmSpan'], [2000]);
  const outFcn = makeOutputFcn(ctx, o);
  const cnt = { n: 0 };
  const f = scalarFn(ctx, fh, dims, cnt);
  const lo = new Float64Array(n), hi = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const s = span.length === n ? span[j] : span[0];
    if (Number.isFinite(lb[j]) && Number.isFinite(ub[j])) { lo[j] = lb[j]; hi[j] = ub[j]; }
    else if (Number.isFinite(lb[j])) { lo[j] = lb[j]; hi[j] = lb[j] + s; }
    else if (Number.isFinite(ub[j])) { lo[j] = ub[j] - s; hi[j] = ub[j]; }
    else { lo[j] = -s / 2; hi[j] = s / 2; }
  }
  const X = [], Vv = [], P = [], fP = [];
  const init = optRaw(o, ['InitialSwarmMatrix', 'InitialSwarm']);
  let ia = null, im = 0; if (init) { ia = F(init); im = ia.length / n; }
  for (let i = 0; i < N; i++) {
    const x = new Float64Array(n), v = new Float64Array(n);
    for (let j = 0; j < n; j++) { x[j] = i < im ? ia[i + j * im] : lo[j] + urand(ctx) * (hi[j] - lo[j]); const r = hi[j] - lo[j]; v[j] = -r + 2 * r * urand(ctx); }
    X.push(x); Vv.push(v);
  }
  const fX = X.map((x) => f(x));
  for (let i = 0; i < N; i++) { P.push(Float64Array.from(X[i])); fP.push(fX[i]); }
  let bi = 0; for (let i = 1; i < N; i++) if (fP[i] < fP[bi]) bi = i;
  const minN = Math.max(2, Math.floor(N * minFrac));
  let nb = minN, W = inertia[1], c = 0, iter = 0, flag = 0, msg = '';
  const hist = [fP[bi]];
  if (level === 'iter') ctx.out('\n                                 Best            Mean     Stall\nIteration     f-count            f(x)            f(x)    Iterations\n' + `${pad(0, 5)}${pad(cnt.n, 12)}${pad(g4(fP[bi]), 16)}${pad(g4(fX.reduce((a, b) => a + b, 0) / N), 16)}${pad(0, 10)}\n`);
  let stall = 0;
  while (!msg) {
    ctx.checkInterrupt();
    if (fP[bi] <= objLimit) { flag = -3; msg = 'Optimization ended: the best objective value reached options.ObjectiveLimit.'; break; }
    if (iter >= maxIt) { flag = 0; msg = 'Optimization ended: number of iterations exceeded options.MaxIterations.'; break; }
    iter++;
    for (let i = 0; i < N; i++) {
      // random neighbourhood
      let best = i, bf = fP[i];
      for (let k = 0; k < nb - 1; k++) { const q = Math.floor(urand(ctx) * N); if (fP[q] < bf) { bf = fP[q]; best = q; } }
      const x = X[i], v = Vv[i];
      for (let j = 0; j < n; j++) {
        v[j] = W * v[j] + selfW * urand(ctx) * (P[i][j] - x[j]) + socW * urand(ctx) * (P[best][j] - x[j]);
        x[j] += v[j];
        if (x[j] < lb[j]) { x[j] = lb[j]; v[j] = 0; } else if (x[j] > ub[j]) { x[j] = ub[j]; v[j] = 0; }
      }
      const fx = f(x); fX[i] = fx;
      if (fx < fP[i]) { fP[i] = fx; P[i] = Float64Array.from(x); }
    }
    const prev = fP[bi]; let nbi = 0; for (let i = 1; i < N; i++) if (fP[i] < fP[nbi]) nbi = i;
    if (fP[nbi] < prev) {
      bi = nbi; c = Math.max(0, c - 1); nb = minN;
    } else { c++; nb = Math.min(nb + minN, N); }
    if (c < 2) W = 2 * W; else if (c > 5) W = W / 2;
    W = Math.min(Math.max(W, inertia[0]), inertia[1]);
    hist.push(fP[bi]);
    if (fP[bi] < hist[hist.length - 2]) stall = 0; else stall++;
    if (level === 'iter') ctx.out(`${pad(iter, 5)}${pad(cnt.n, 12)}${pad(g4(fP[bi]), 16)}${pad(g4(fX.reduce((a, b) => a + b, 0) / N), 16)}${pad(stall, 10)}\n`);
    if (outFcn && outFcn(P[bi], dims, { iteration: iter, funccount: cnt.n, bestx: Array.from(P[bi]), bestfval: fP[bi], meanfval: fX.reduce((a, b) => a + b, 0) / N, stalliterations: stall, swarm: X.map((x) => Array.from(x)), swarmfvals: fX.slice() }, 'iter')) { flag = -1; msg = 'Optimization ended by the output function.'; break; }
    if (hist.length > stallIt) {
      const old = hist[hist.length - 1 - stallIt]; const rel = Math.abs(old - fP[bi]) / Math.max(1, Math.abs(fP[bi]));
      if (rel <= tolFun) { flag = 1; msg = 'Optimization ended: relative change in the objective value\nover the last OPTIONS.MaxStallIterations iterations is less than OPTIONS.FunctionTolerance.'; break; }
    }
  }
  finalMessage(ctx, level, flag, msg);
  const rs = rngStateStruct(ctx);
  const output = outStruct({ rngstate: { State: rs.state, Type: rs.type }, iterations: iter, funccount: cnt.n, message: msg, hybridflag: [] });
  return [xOut(P[bi], dims), num(fP[bi]), num(flag), output].slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ simulannealbnd
function simulannealbnd(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'lb', 'ub', 'options']);
  if (args.length < 2) throw E('simulannealbnd:notEnoughInputs', 'simulannealbnd requires an objective function and a starting point.');
  const fh = fnArg(args[0], 'FUN'); const dims = args[1].dims || [1, 1];
  let x = Float64Array.from(F(args[1], 'X0')); const n = x.length;
  const { lb, ub, consistent } = boundsOf(argAt(args, 2), argAt(args, 3), n, 'simulannealbnd');
  if (!consistent) throw E('simulannealbnd:InfeasibleBounds', 'At least one lower bound exceeds the corresponding upper bound.');
  const o = getOpts(argAt(args, 4));
  const level = dispLevel(o, 'final');
  const T0 = optArr(o, ['InitialTemperature'], [100]);
  const reanneal = optNum(o, ['ReannealInterval'], 100);
  const maxFun = optNum(o, ['MaxFunctionEvaluations', 'MaxFunEvals'], 3000 * n, n);
  const maxIter = optNum(o, ['MaxIterations', 'MaxIter'], Infinity, n);
  const stallLim = optNum(o, ['MaxStallIterations', 'StallIterLimit'], 500 * n, n);
  const tolFun = optNum(o, ['FunctionTolerance', 'TolFun'], 1e-6);
  const objLimit = optNum(o, ['ObjectiveLimit'], -Infinity);
  const outFcn = makeOutputFcn(ctx, o);
  const cnt = { n: 0 };
  const f = scalarFn(ctx, fh, dims, cnt);
  for (let j = 0; j < n; j++) { if (x[j] < lb[j]) x[j] = lb[j]; if (x[j] > ub[j]) x[j] = ub[j]; }
  let fx = f(x); let best = Float64Array.from(x), fbest = fx;
  const k = new Float64Array(n); const Tinit = Float64Array.from({ length: n }, (_, j) => (T0.length === n ? T0[j] : T0[0]));
  const temp = () => Float64Array.from(k, (kk, j) => Tinit[j] * 0.95 ** kk);
  let iter = 0, accepted = 0, flag = 0, msg = '', stall = 0; let fAvgRef = fbest;
  if (level === 'iter') ctx.out('\n                           Best        Current           Mean\nIteration   f-count         f(x)         f(x)         temperature\n');
  while (!msg) {
    ctx.checkInterrupt();
    if (fbest <= objLimit) { flag = 5; msg = 'Optimization terminated: best function value reached options.ObjectiveLimit.'; break; }
    if (cnt.n >= maxFun) { flag = 0; msg = 'Maximum number of function evaluations exceeded: increase options.MaxFunctionEvaluations.'; break; }
    if (iter >= maxIter) { flag = 0; msg = 'Maximum number of iterations exceeded: increase options.MaxIterations.'; break; }
    const T = temp();
    // annealing fast: step of length T along a random unit direction
    const dir = new Float64Array(n); let nr = 0; for (let j = 0; j < n; j++) { dir[j] = nrand(ctx); nr += dir[j] * dir[j]; } nr = Math.sqrt(nr) || 1;
    const y = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      y[j] = x[j] + T[j] * dir[j] / nr;
      if (y[j] < lb[j]) y[j] = lb[j] + urand(ctx) * (x[j] - lb[j]); else if (y[j] > ub[j]) y[j] = ub[j] - urand(ctx) * (ub[j] - x[j]);
    }
    const fy = f(y); iter++;
    const delta = fy - fx; const Tm = Math.max(...T);
    if (delta <= 0 || urand(ctx) < 1 / (1 + Math.exp(delta / Math.max(Tm, 1e-300)))) { x = y; fx = fy; accepted++; }
    for (let j = 0; j < n; j++) k[j] += 1;
    if (fx < fbest) { fbest = fx; best = Float64Array.from(x); }
    if (accepted > 0 && accepted % reanneal === 0) { for (let j = 0; j < n; j++) k[j] = Math.floor(k[j] / 2); accepted++; }
    // stall test on the best value
    if (Math.abs(fAvgRef - fbest) <= tolFun * Math.max(1, Math.abs(fbest))) stall++; else { stall = 0; fAvgRef = fbest; }
    if (level === 'iter' && iter % 10 === 0) ctx.out(`${pad(iter, 6)}${pad(cnt.n, 10)}${pad(g4(fbest), 14)}${pad(g4(fx), 14)}${pad(g4(Tm), 14)}\n`);
    if (outFcn && outFcn(x, dims, { x: Array.from(x), fval: fx, bestx: Array.from(best), bestfval: fbest, temperature: Array.from(T), iteration: iter, funccount: cnt.n }, 'iter')) { flag = -1; msg = 'Optimization terminated by the output function.'; break; }
    if (stall >= stallLim) { flag = 1; msg = 'Optimization terminated: change in best function value less than options.FunctionTolerance.'; break; }
  }
  finalMessage(ctx, level, flag, msg);
  const rs = rngStateStruct(ctx);
  const output = outStruct({ iterations: iter, funccount: cnt.n, message: msg, rngstate: { State: rs.state, Type: rs.type }, problemtype: lb.some(Number.isFinite) || ub.some(Number.isFinite) ? 'boundconstraints' : 'unconstrained', temperature: Array.from(temp()), totaltime: 0 });
  return [xOut(best, dims), num(fbest), num(flag), output].slice(0, Math.max(1, nargout));
}

// ------------------------------------------------------------ patternsearch
function patternsearch(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'Aineq', 'bineq', 'Aeq', 'beq', 'lb', 'ub', 'nonlcon', 'options']);
  if (args.length < 2) throw E('patternsearch:notEnoughInputs', 'patternsearch requires an objective function and a starting point.');
  const fh = fnArg(args[0], 'FUN'); const dims = args[1].dims || [1, 1];
  let x = Float64Array.from(F(args[1], 'X0')); const n = x.length;
  const { rows: Ain, rhs: bin } = linCons(argAt(args, 2), argAt(args, 3), n, 'patternsearch', 'A');
  const { rows: Aeq, rhs: beq } = linCons(argAt(args, 4), argAt(args, 5), n, 'patternsearch', 'Aeq');
  const { lb, ub, consistent } = boundsOf(argAt(args, 6), argAt(args, 7), n, 'patternsearch');
  if (!consistent) throw E('patternsearch:InfeasibleBounds', 'At least one lower bound exceeds the corresponding upper bound.');
  const nlc = argAt(args, 8); const nonlcon = nlc && (isFuncHandle(nlc) || isText(nlc)) ? fnArg(nlc) : null;
  const o = getOpts(argAt(args, 9));
  const level = dispLevel(o, 'final');
  let mesh = optNum(o, ['InitialMeshSize'], 1);
  const meshTol = optNum(o, ['MeshTolerance', 'TolMesh'], 1e-6);
  const stepTol = optNum(o, ['StepTolerance', 'TolX'], 1e-6);
  const funTol = optNum(o, ['FunctionTolerance', 'TolFun'], 1e-6);
  const maxIter = optNum(o, ['MaxIterations', 'MaxIter'], 100 * n, n);
  const maxFun = optNum(o, ['MaxFunctionEvaluations', 'MaxFunEvals'], 2000 * n, n);
  const expand = optNum(o, ['MeshExpansionFactor', 'MeshExpansion'], 2);
  const contract = optNum(o, ['MeshContractionFactor', 'MeshContraction'], 0.5);
  const complete = optBool(o, ['UseCompletePoll', 'CompletePoll'], false);
  const outFcn = makeOutputFcn(ctx, o);
  const cnt = { n: 0 };
  const f0 = scalarFn(ctx, fh, dims, cnt);
  const viol = nonlcon ? makeViolation(ctx, [], [], [], [], new Float64Array(n).fill(-Infinity), new Float64Array(n).fill(Infinity), nonlcon, dims) : null;
  let rho = 10;
  const f = (z) => { const v = f0(z); if (!viol) return v; const c = viol(z); return v + rho * c * c * 1e2 + (c > 0 ? rho * c : 0); };
  const feasibleLin = (z) => Ain.every((r, i) => rowDot(r, z) <= bin[i] + 1e-10 * (1 + Math.abs(bin[i]))) && z.every((v, j) => v >= lb[j] && v <= ub[j]);
  // directions: ± null-space basis of Aeq (± unit vectors without equalities)
  let D;
  if (Aeq.length) { const Z = svdNull(Aeq, n); D = [...Z, ...Z.map((d) => d.map((v) => -v))]; }
  else { D = []; for (let j = 0; j < n; j++) { const e = new Array(n).fill(0); e[j] = 1; D.push(e); } for (let j = 0; j < n; j++) { const e = new Array(n).fill(0); e[j] = -1; D.push(e); } }
  for (let j = 0; j < n; j++) { if (x[j] < lb[j]) x[j] = lb[j]; if (x[j] > ub[j]) x[j] = ub[j]; }
  const eqOK = (z) => Aeq.every((r, i) => Math.abs(rowDot(r, z) - beq[i]) <= 1e-10 * (1 + Math.abs(beq[i])));
  if (!feasibleLin(x) || !eqOK(x)) {
    // start from the nearest point that satisfies the linear constraints and bounds
    const I = zerosM(n, n); for (let j = 0; j < n; j++) I[j][j] = 1;
    const pr = qpSolve(I, Array.from(x, (v) => -v), Ain, bin, Aeq, beq, lb, ub, { ctx });
    if (pr.status === -2) throw E('patternsearch:infeasible', 'The linear constraints and bounds cannot be satisfied.');
    x = Float64Array.from(pr.x);
  }
  let fx = f(x); let iter = 0, flag = 0, msg = '';
  if (level === 'iter') ctx.out('\nIter     Func-count       f(x)      MeshSize     Method\n' + `${pad(0, 4)}${pad(cnt.n, 14)}${pad(g4(fx), 14)}${pad(g4(mesh), 12)}\n`);
  let lastStep = Infinity, lastDf = Infinity;
  while (!msg) {
    ctx.checkInterrupt();
    if (mesh < meshTol) { flag = 1; msg = 'Optimization terminated: mesh size less than options.MeshTolerance.'; break; }
    if (iter >= maxIter) { flag = 0; msg = 'Maximum number of iterations exceeded: increase options.MaxIterations.'; break; }
    if (cnt.n >= maxFun) { flag = 0; msg = 'Maximum number of function evaluations exceeded: increase options.MaxFunctionEvaluations.'; break; }
    iter++;
    let bestY = null, bestF = fx, bestK = -1;
    for (let k = 0; k < D.length; k++) {
      const y = x.map((v, j) => v + mesh * D[k][j]);
      if (!feasibleLin(y)) continue;
      const fy = f(y);
      if (fy < bestF) { bestF = fy; bestY = y; bestK = k; if (!complete) break; }
    }
    let how;
    if (bestY) {
      lastStep = mesh * twoNorm(D[bestK]); lastDf = fx - bestF; x = bestY; fx = bestF; mesh *= expand; how = 'Successful Poll';
      // opportunistic poll: move the successful direction first
      if (!complete && bestK > 0) { const d = D.splice(bestK, 1)[0]; D.unshift(d); }
    } else { mesh *= contract; how = 'Refine Mesh'; }
    if (level === 'iter') ctx.out(`${pad(iter, 4)}${pad(cnt.n, 14)}${pad(g4(fx), 14)}${pad(g4(mesh), 12)}     ${how}\n`);
    if (outFcn && outFcn(x, dims, { x: Array.from(x), iteration: iter, fval: fx, meshsize: mesh, funccount: cnt.n, method: how }, 'iter')) { flag = -1; msg = 'Optimization terminated by the output function.'; break; }
    if (bestY && lastStep < stepTol && Math.abs(lastDf) < funTol * Math.max(1, Math.abs(fx)) && mesh < 1e-3) { flag = 4; msg = 'Optimization terminated: change in X less than options.StepTolerance and change in the function value less than options.FunctionTolerance.'; break; }
    if (viol && !bestY && mesh < 1e-3) rho = Math.min(rho * 2, 1e8);
  }
  const fval = f0(x); cnt.n--;
  const cv = Math.max(0, ...Ain.map((r, i) => rowDot(r, x) - bin[i]), ...Aeq.map((r, i) => Math.abs(rowDot(r, x) - beq[i])), viol ? viol(x) : 0);
  finalMessage(ctx, level, flag, msg);
  const output = outStruct({ function: fh.name || 'objective', problemtype: nonlcon ? 'nonlinearconstr' : Ain.length || Aeq.length ? 'linearconstraints' : lb.some(Number.isFinite) || ub.some(Number.isFinite) ? 'boundconstraints' : 'unconstrained', pollmethod: 'gpspositivebasis2n', maxconstraint: cv, searchmethod: 'none', iterations: iter, funccount: cnt.n, meshsize: mesh, rngstate: rngStateStruct(ctx).state, message: msg });
  return [xOut(x, dims), num(fval), num(flag), output].slice(0, Math.max(1, nargout));
}

export const builtins = { ga, particleswarm, simulannealbnd, patternsearch };
export const help = {
  ga: H('Global minimum by a genetic algorithm (rank scaling, stochastic uniform selection, elitism, scattered crossover, Gaussian mutation); supports linear, bound, nonlinear and integer constraints.', '유전 알고리즘으로 전역 최솟값을 찾습니다 (순위 척도, 확률적 균등 선택, 엘리트, 분산 교차, 가우스 돌연변이); 선형·경계·비선형·정수 제약 지원.', ['x = ga(fun, nvars)', 'x = ga(fun, nvars, A, b)', 'x = ga(fun, nvars, A, b, Aeq, beq, lb, ub)', 'x = ga(fun, nvars, A, b, Aeq, beq, lb, ub, nonlcon, options)', 'x = ga(fun, nvars, A, b, [], [], lb, ub, nonlcon, intcon, options)', '[x, fval, exitflag, output, population, scores] = ga(___)']),
  particleswarm: H('Global minimum by particle swarm optimization with adaptive inertia and random neighbourhoods.', '적응 관성과 무작위 이웃을 쓰는 입자 군집 최적화로 전역 최솟값을 찾습니다.', ['x = particleswarm(fun, nvars)', 'x = particleswarm(fun, nvars, lb, ub)', 'x = particleswarm(fun, nvars, lb, ub, options)', '[x, fval, exitflag, output] = particleswarm(___)']),
  simulannealbnd: H('Bound-constrained minimum by simulated annealing (exponential cooling, reannealing).', '모의 담금질로 경계 제약 최솟값을 찾습니다 (지수 냉각, 재담금질).', ['x = simulannealbnd(fun, x0)', 'x = simulannealbnd(fun, x0, lb, ub)', 'x = simulannealbnd(fun, x0, lb, ub, options)', '[x, fval, exitflag, output] = simulannealbnd(___)']),
  patternsearch: H('Derivative-free minimum by generalized pattern search (2N positive basis poll, mesh expansion and contraction); linear, bound and nonlinear constraints.', '일반화 패턴 탐색으로 도함수 없이 최솟값을 찾습니다 (2N 양의 기저 폴링, 격자 확장·축소); 선형·경계·비선형 제약.', ['x = patternsearch(fun, x0)', 'x = patternsearch(fun, x0, A, b)', 'x = patternsearch(fun, x0, A, b, Aeq, beq, lb, ub)', 'x = patternsearch(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options)', '[x, fval, exitflag, output] = patternsearch(___)']),
};

