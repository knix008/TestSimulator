// Scalar solvers: fzero (bracket search + Brent–Dekker) and fminbnd (golden
// section search with parabolic interpolation).
import { num } from '../../../value.js';
import { E, F, H, fnArg } from '../_util.js';
import { getOpts, optNum, dispLevel, scalarFn, makeOutputFcn, finalMessage, outStruct, pad, g4, EPS, fromProblem } from './common.js';

const sgn = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

function fzero(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x0', 'options']);
  if (args.length < 2) throw E('fzero:notEnoughInputs', 'fzero requires at least two inputs: a function and a starting point or interval.');
  const fh = fnArg(args[0], 'FUN');
  const o = getOpts(args[2]);
  const extra = args.slice(3);
  const tol = optNum(o, ['TolX', 'StepTolerance'], EPS);
  const level = dispLevel(o, 'notify');
  const maxFun = optNum(o, ['MaxFunEvals', 'MaxFunctionEvaluations'], Infinity);
  const maxIter = optNum(o, ['MaxIter', 'MaxIterations'], Infinity);
  const outFcn = makeOutputFcn(ctx, o);
  const cnt = { n: 0 };
  const f = scalarFn(ctx, fh, [1, 1], cnt, extra, 'function');
  const x0 = Array.from(F(args[1], 'X0'));
  if (!x0.length || x0.length > 2) throw E('fzero:badX0', 'The second argument must be a scalar or a two-element interval.');
  if (x0.some((v) => !Number.isFinite(v))) throw E('fzero:badX0', 'The starting point or interval must be finite.');
  const out = (x, fv, flag, msg, intervalIt, it, a, b) => {
    finalMessage(ctx, level, flag, msg);
    const output = outStruct({ intervaliterations: intervalIt, iterations: it, funcCount: cnt.n, algorithm: 'bisection, interpolation', message: msg });
    return [num(x), num(fv), num(flag), output].slice(0, Math.max(1, nargout));
  };
  let a, b, fa, fb, intervalIt = 0;
  if (level === 'iter') ctx.out('\n Func-count    x          f(x)             Procedure\n');
  if (x0.length === 2) {
    a = x0[0]; b = x0[1]; fa = f(a); fb = f(b);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) throw E('fzero:ValuesAtEndPtsComplexOrNotFinite', 'Function values at the interval endpoints must be finite and real.');
    if (fa === 0) return out(a, fa, 1, 'Zero found at the initial point.', 0, 0);
    if (fb === 0) return out(b, fb, 1, 'Zero found at the initial point.', 0, 0);
    if (sgn(fa) === sgn(fb)) throw E('fzero:ValuesAtEndPtsSameSign', 'The function values at the interval endpoints must differ in sign.');
    if (level === 'iter') { ctx.out(`${pad(1, 6)}${pad(g4(a), 15)}${pad(g4(fa), 15)}        initial\n`); ctx.out(`${pad(2, 6)}${pad(g4(b), 15)}${pad(g4(fb), 15)}        initial\n`); }
  } else {
    const x = x0[0]; const fx = f(x);
    if (fx === 0) return out(x, fx, 1, 'Zero found at the initial point.', 0, 0);
    if (!Number.isFinite(fx)) throw E('fzero:InitialValueNotFinite', 'The function value at the starting point must be finite and real.');
    let dx = x === 0 ? 1 / 50 : x / 50;
    a = x; fa = fx; b = x; fb = fx;
    if (level === 'iter') ctx.out('\nSearch for an interval around ' + g4(x) + ' containing a sign change:\n Func-count    a          f(a)             b          f(b)        Procedure\n');
    while (sgn(fa) === sgn(fb)) {
      intervalIt++;
      dx *= Math.SQRT2;
      a = x - dx; fa = f(a);
      if (!Number.isFinite(fa)) return out(a, fa, -3, `NaN or Inf function value encountered during search for an interval containing a sign change. Check function or try again with a different starting value.`, intervalIt, 0);
      if (sgn(fa) !== sgn(fb)) break;
      b = x + dx; fb = f(b);
      if (!Number.isFinite(fb)) return out(b, fb, -3, `NaN or Inf function value encountered during search for an interval containing a sign change. Check function or try again with a different starting value.`, intervalIt, 0);
      if (level === 'iter') ctx.out(`${pad(cnt.n, 6)}${pad(g4(a), 15)}${pad(g4(fa), 15)}${pad(g4(b), 15)}${pad(g4(fb), 15)}   search\n`);
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(dx) > 1e300 || cnt.n > maxFun) {
        return out(NaN, NaN, -6, 'Exiting fzero: aborting search for an interval containing a sign change because no sign change was detected.', intervalIt, 0);
      }
    }
    if (fa === 0) return out(a, fa, 1, 'Zero found during the interval search.', intervalIt, 0);
    if (fb === 0) return out(b, fb, 1, 'Zero found during the interval search.', intervalIt, 0);
    if (level === 'iter') ctx.out(`\nSearch for a zero in the interval [${g4(a)}, ${g4(b)}]:\n`);
  }
  const savea = a, saveb = b, savefa = fa, savefb = fb;
  // Brent–Dekker
  let c = a, fc = fa, d = b - a, e = d, iter = 0, proc = 'initial';
  fc = fb;
  let flag = 1, msg = '';
  while (fb !== 0 && a !== b) {
    if (sgn(fb) === sgn(fc)) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const m = 0.5 * (c - b); const toler = 2.0 * tol * Math.max(Math.abs(b), 1.0);
    if (Math.abs(m) <= toler || fb === 0) break;
    if (iter >= maxIter || cnt.n >= maxFun) { flag = 0; msg = 'Exiting fzero: the maximum number of iterations or function evaluations was reached.'; break; }
    if (Math.abs(e) < toler || Math.abs(fa) <= Math.abs(fb)) { d = m; e = m; proc = 'bisection'; }
    else {
      let s = fb / fa, p, q;
      if (a === c) { p = 2.0 * m * s; q = 1.0 - s; proc = 'interpolation'; }
      else { q = fa / fc; const r = fb / fc; p = s * (2.0 * m * q * (q - r) - (b - a) * (r - 1.0)); q = (q - 1.0) * (r - 1.0) * (s - 1.0); proc = 'interpolation'; }
      if (p > 0) q = -q; else p = -p;
      if (2.0 * p < 3.0 * m * q - Math.abs(toler * q) && p < Math.abs(0.5 * e * q)) { e = d; d = p / q; }
      else { d = m; e = m; proc = 'bisection'; }
    }
    a = b; fa = fb;
    if (Math.abs(d) > toler) b = b + d; else if (b > c) b = b - toler; else b = b + toler;
    fb = f(b); iter++;
    if (level === 'iter') ctx.out(`${pad(cnt.n, 6)}${pad(g4(b), 15)}${pad(g4(fb), 15)}        ${proc}\n`);
    if (outFcn && outFcn([b], [1, 1], { funccount: cnt.n, fval: fb, iteration: iter, intervala: Math.min(b, c), intervalb: Math.max(b, c), procedure: proc }, 'iter')) {
      return out(b, fb, -1, 'Optimization terminated prematurely by user.', intervalIt, iter);
    }
  }
  if (flag === 1) {
    if (Math.abs(fb) <= Math.max(Math.abs(savefa), Math.abs(savefb))) msg = `Zero found in the interval [${g4(Math.min(savea, saveb))}, ${g4(Math.max(savea, saveb))}]`;
    else { flag = -5; msg = 'Current point x may be near a singular point. The interval contains a sign change but the function value is not small there.'; }
  }
  return out(b, fb, flag, msg, intervalIt, iter);
}

function fminbnd(args, nargout, ctx) {
  args = fromProblem(args, ['objective', 'x1', 'x2', 'options']);
  if (args.length < 3) throw E('fminbnd:notEnoughInputs', 'fminbnd requires a function and the interval end points x1 and x2.');
  const fh = fnArg(args[0], 'FUN');
  const ax = F(args[1])[0], bx = F(args[2])[0];
  if (!(ax <= bx)) throw E('fminbnd:badInterval', 'The lower bound x1 must be less than or equal to the upper bound x2.');
  const o = getOpts(args[3]);
  const extra = args.slice(4);
  const tolx = optNum(o, ['TolX', 'StepTolerance'], 1e-4);
  const maxfun = optNum(o, ['MaxFunEvals', 'MaxFunctionEvaluations'], 500);
  const maxiter = optNum(o, ['MaxIter', 'MaxIterations'], 500);
  const level = dispLevel(o, 'notify');
  const outFcn = makeOutputFcn(ctx, o);
  const cnt = { n: 0 };
  const f = scalarFn(ctx, fh, [1, 1], cnt, extra);
  const c = 0.5 * (3.0 - Math.sqrt(5.0));
  let a = ax, b = bx, v = a + c * (b - a), w = v, xf = v, e = 0, d = 0;
  let x = xf, fx = f(x), fv = fx, fw = fx, iter = 0;
  let xm = 0.5 * (a + b), tol1 = Math.sqrt(EPS) * Math.abs(xf) + tolx / 3, tol2 = 2 * tol1;
  let flag = 1, msg = '';
  if (level === 'iter') ctx.out(`\n Func-count     x          f(x)         Procedure\n${pad(cnt.n, 6)}${pad(g4(xf), 15)}${pad(g4(fx), 15)}        initial\n`);
  while (Math.abs(xf - xm) > (tol2 - 0.5 * (b - a))) {
    let gs = true, proc = 'golden';
    if (Math.abs(e) > tol1) {
      gs = false;
      let r = (xf - w) * (fx - fv), q = (xf - v) * (fx - fw), p = (xf - v) * q - (xf - w) * r;
      q = 2.0 * (q - r);
      if (q > 0) p = -p;
      q = Math.abs(q); r = e; e = d;
      if (Math.abs(p) < Math.abs(0.5 * q * r) && p > q * (a - xf) && p < q * (b - xf)) {
        d = p / q; x = xf + d; proc = 'parabolic';
        if ((x - a) < tol2 || (b - x) < tol2) { const si = Math.sign(xm - xf) + ((xm - xf) === 0 ? 1 : 0); d = tol1 * si; }
      } else gs = true;
    }
    if (gs) { e = xf >= xm ? a - xf : b - xf; d = c * e; proc = 'golden'; }
    const si = Math.sign(d) + (d === 0 ? 1 : 0);
    x = xf + si * Math.max(Math.abs(d), tol1);
    const fu = f(x); iter++;
    if (level === 'iter') ctx.out(`${pad(cnt.n, 6)}${pad(g4(x), 15)}${pad(g4(fu), 15)}        ${proc}\n`);
    if (fu <= fx) {
      if (x >= xf) a = xf; else b = xf;
      v = w; fv = fw; w = xf; fw = fx; xf = x; fx = fu;
    } else {
      if (x < xf) a = x; else b = x;
      if (fu <= fw || w === xf) { v = w; fv = fw; w = x; fw = fu; }
      else if (fu <= fv || v === xf || v === w) { v = x; fv = fu; }
    }
    xm = 0.5 * (a + b); tol1 = Math.sqrt(EPS) * Math.abs(xf) + tolx / 3; tol2 = 2 * tol1;
    if (outFcn && outFcn([xf], [1, 1], { funccount: cnt.n, fval: fx, iteration: iter, procedure: proc }, 'iter')) { flag = -1; msg = 'Optimization terminated prematurely by user.'; break; }
    if (cnt.n >= maxfun || iter >= maxiter) { flag = 0; msg = 'Exiting: Maximum number of function evaluations or iterations has been exceeded.'; break; }
  }
  if (flag === 1) msg = `Optimization terminated:\n the current x satisfies the termination criteria using OPTIONS.TolX of ${g4(tolx)}`;
  finalMessage(ctx, level, flag, msg);
  const output = outStruct({ iterations: iter, funcCount: cnt.n, algorithm: 'golden section search, parabolic interpolation', message: msg });
  return [num(xf), num(fx), num(flag), output].slice(0, Math.max(1, nargout));
}

export const builtins = { fzero, fminbnd };
export const help = {
  fzero: H('Root of a nonlinear function of one variable (interval search, then Brent–Dekker bisection/interpolation).', '한 변수 비선형 함수의 근 (구간 탐색 후 Brent–Dekker 이분법/보간).', ['x = fzero(fun, x0)', 'x = fzero(fun, [a b])', 'x = fzero(fun, x0, options)', 'x = fzero(problem)', '[x, fval, exitflag, output] = fzero(___)']),
  fminbnd: H('Minimum of a function of one variable on a fixed interval (golden section search and parabolic interpolation).', '고정 구간에서 한 변수 함수의 최솟값 (황금분할 탐색과 포물선 보간).', ['x = fminbnd(fun, x1, x2)', 'x = fminbnd(fun, x1, x2, options)', 'x = fminbnd(problem)', '[x, fval, exitflag, output] = fminbnd(___)']),
};


