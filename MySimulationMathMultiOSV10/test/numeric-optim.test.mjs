// Tests of the optimization part of the numerics area (core/lib/numeric/optim).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as optim from '../core/lib/numeric/optim/index.js';
import * as random from '../core/lib/numeric/random.js';
import { MError, isFuncHandle, num, str, matrix, rowVec, colVec, toStr, isStruct, empty, tensor } from '../core/value.js';

const registry = {
  builtins: { ...optim.builtins, ...random.builtins }, owner: {}, help: { ...optim.help, ...random.help },
  classes: { ...random.classes }, installs: [random.install],
};
// A ctx shaped like test/helpers/mockctx.mjs, built only from this area's modules so
// the tests do not depend on the other library areas being loadable.
const jsHandle = (jsfn) => ({ cls: 'function_handle', dims: [1, 1], jsfn });
function newCtx() {
  const out = [];
  const ctx = {
    registry, outText: out, warnings: [], state: {}, format: { numeric: 'short', spacing: 'loose' },
    out(t) { out.push(t); }, errOut(t) { out.push(t); }, warning(id, message) { ctx.warnings.push({ id, message }); },
    checkInterrupt() {},
    call(fn, args, nargout = 1) {
      let r;
      if (typeof fn === 'string') { const b = registry.builtins[fn]; if (!b) throw new MError('test:undefined', `Undefined function '${fn}'.`); r = b(args, nargout, ctx); }
      else if (isFuncHandle(fn) && fn.jsfn) r = fn.jsfn(args, nargout);
      else if (isFuncHandle(fn) && fn.name) return ctx.call(fn.name, args, nargout);
      else throw new MError('test:badCall', 'cannot call this value');
      return Array.isArray(r) ? r : r === undefined ? [] : [r];
    },
  };
  for (const install of registry.installs) install(ctx);
  return ctx;
}
const call = (ctx, name, args, nargout = 1) => ctx.call(name, args, nargout);
const call1 = (ctx, name, args) => ctx.call(name, args, 1)[0];
const E = empty();
/** f(xArray) → number as a function handle. */
const sfh = (f) => jsHandle((args) => num(f(Array.from(args[0].re))));
const vfh = (f) => jsHandle((args) => colVec(f(Array.from(args[0].re))));
const field = (s, name) => s.data[0][name];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a} (tol ${tol})`);
const rosen = (x) => 100 * (x[1] - x[0] ** 2) ** 2 + (1 - x[0]) ** 2;
const quiet = (ctx, solver) => call1(ctx, 'optimoptions', [str(solver), str('Display'), str('off')]);

test('fzero finds pi/2 for cos from a start point and from a bracket', () => {
  const ctx = newCtx();
  const [x, fval, flag, out] = call(ctx, 'fzero', [sfh((x) => Math.cos(x[0])), num(1)], 4);
  near(x.re[0], Math.PI / 2, 1e-12);
  near(fval.re[0], 0, 1e-12);
  assert.equal(flag.re[0], 1);
  assert.ok(isStruct(out) && toStr(field(out, 'algorithm')) === 'bisection, interpolation');
  const [x2] = call(ctx, 'fzero', [sfh((x) => x[0] ** 3 - 2 * x[0] - 5), rowVec([2, 3])]);
  near(x2.re[0], 2.0945514815423265, 1e-12);
  assert.throws(() => call(ctx, 'fzero', [sfh((x) => x[0] ** 2 + 1), rowVec([0, 1])]), /differ in sign/);
});

test('fminbnd minimizes on an interval', () => {
  const ctx = newCtx();
  const [x, fval, flag] = call(ctx, 'fminbnd', [sfh((x) => Math.sin(x[0])), num(0), num(2 * Math.PI)], 3);
  near(x.re[0], 3 * Math.PI / 2, 1e-4);
  near(fval.re[0], -1, 1e-8);
  assert.equal(flag.re[0], 1);
  const [x2] = call(ctx, 'fminbnd', [sfh((x) => (x[0] - 0.3) ** 2), num(-1), num(1)], 1);
  near(x2.re[0], 0.3, 1e-4);
});

test('fminsearch: Rosenbrock from [-1.2 1] and shape of x0 is kept', () => {
  const ctx = newCtx();
  const [x, fval, flag, out] = call(ctx, 'fminsearch', [sfh(rosen), rowVec([-1.2, 1])], 4);
  assert.deepEqual(x.dims, [1, 2]);
  near(x.re[0], 1, 1e-3); near(x.re[1], 1, 1e-3);
  assert.ok(fval.re[0] < 1e-7);
  assert.equal(flag.re[0], 1);
  assert.equal(toStr(field(out, 'algorithm')), 'Nelder-Mead simplex direct search');
  const opts = call1(ctx, 'optimset', [str('TolX'), num(1e-10), str('TolFun'), num(1e-10), str('MaxFunEvals'), num(5000), str('MaxIter'), num(5000)]);
  const [x3] = call(ctx, 'fminsearch', [sfh(rosen), rowVec([-1.2, 1]), opts]);
  near(x3.re[0], 1, 1e-8); near(x3.re[1], 1, 1e-8);
  const [, , flag2] = call(ctx, 'fminsearch', [sfh(rosen), rowVec([-1.2, 1]), call1(ctx, 'optimset', [str('MaxIter'), num(5)])], 3);
  assert.equal(flag2.re[0], 0);
  const [xm] = call(ctx, 'fminsearch', [jsHandle((a) => { assert.deepEqual(a[0].dims, [2, 2]); const v = a[0].re; return num(v.reduce((s, t, i) => s + (t - i) ** 2, 0)); }), matrix([[1, 1], [1, 1]])]);
  assert.deepEqual(xm.dims, [2, 2]);
});

test('fminunc: quasi-Newton on Rosenbrock with outputs grad and hessian', () => {
  const ctx = newCtx();
  const opts = quiet(ctx, 'fminunc');
  const [x, fval, flag, out, grad, hess] = call(ctx, 'fminunc', [sfh(rosen), rowVec([-1.2, 1]), opts], 6);
  near(x.re[0], 1, 2e-3); near(x.re[1], 1, 4e-3);
  assert.ok(fval.re[0] < 1e-5);
  assert.ok(flag.re[0] > 0);
  assert.equal(toStr(field(out, 'algorithm')), 'quasi-newton');
  assert.deepEqual(grad.dims, [2, 1]);
  assert.deepEqual(hess.dims, [2, 2]);
  // the true Hessian at [1 1] is [802 -400; -400 200]
  assert.ok(hess.re[0] > 100 && hess.re[3] > 30);
});

test('fminunc: trust-region with a user gradient', () => {
  const ctx = newCtx();
  const f = jsHandle((args, nargout) => {
    const [a, b] = args[0].re; const v = num(rosen([a, b]));
    if (nargout < 2) return v;
    return [v, colVec([-400 * a * (b - a * a) - 2 * (1 - a), 200 * (b - a * a)])];
  });
  const opts = call1(ctx, 'optimoptions', [str('fminunc'), str('Algorithm'), str('trust-region'), str('SpecifyObjectiveGradient'), num(1), str('Display'), str('off')]);
  const [x, , flag] = call(ctx, 'fminunc', [f, colVec([-1.2, 1]), opts], 3);
  near(x.re[0], 1, 1e-4); near(x.re[1], 1, 1e-4);
  assert.ok(flag.re[0] > 0);
});

test('fmincon: Rosenbrock inside the unit disk (sqp and interior-point)', () => {
  const ctx = newCtx();
  const nonlcon = jsHandle((args) => { const [a, b] = args[0].re; return [num(a * a + b * b - 1), E]; });
  for (const alg of ['sqp', 'interior-point', 'active-set']) {
    const opts = call1(ctx, 'optimoptions', [str('fmincon'), str('Algorithm'), str(alg), str('Display'), str('off')]);
    const [x, fval, flag, out, lambda] = call(ctx, 'fmincon', [sfh(rosen), rowVec([0, 0]), E, E, E, E, E, E, nonlcon, opts], 5);
    near(x.re[0], 0.7864, 1e-3, alg); near(x.re[1], 0.6177, 1e-3, alg);
    near(fval.re[0], 0.045674, 1e-4, alg);
    assert.ok(flag.re[0] > 0, alg);
    assert.ok(field(out, 'constrviolation').re[0] < 1e-6, alg);
    assert.ok(field(lambda, 'ineqnonlin').re[0] > 0, alg);
  }
});

test('fmincon: linear constraints, bounds and equality', () => {
  const ctx = newCtx();
  const opts = quiet(ctx, 'fmincon');
  // min (x-1)^2 + (y-2)^2 with x + y <= 2 → (0.5, 1.5)
  const [x] = call(ctx, 'fmincon', [sfh((v) => (v[0] - 1) ** 2 + (v[1] - 2) ** 2), colVec([0, 0]), rowVec([1, 1]), num(2), E, E, E, E, E, opts]);
  near(x.re[0], 0.5, 1e-5); near(x.re[1], 1.5, 1e-5);
  // bounds 0 <= x <= 0.25, equality x + y = 1
  const [x2] = call(ctx, 'fmincon', [sfh((v) => (v[0] - 1) ** 2 + (v[1] - 2) ** 2), colVec([0, 0]), E, E, rowVec([1, 1]), num(1), colVec([0, -10]), colVec([0.25, 10]), E, opts]);
  near(x2.re[0], 0, 1e-5); near(x2.re[1], 1, 1e-5);
  // problem structure
  const prob = { cls: 'struct', dims: [1, 1], fields: ['objective', 'x0', 'lb', 'ub', 'options', 'solver'], data: [Object.assign(Object.create(null), { objective: sfh((v) => (v[0] - 3) ** 2), x0: num(0), lb: num(-1), ub: num(2), options: opts, solver: str('fmincon') })] };
  const [x3] = call(ctx, 'fmincon', [prob]);
  near(x3.re[0], 2, 1e-6);
});

test('linprog: known LP, infeasible and unbounded flags, multipliers', () => {
  const ctx = newCtx();
  const opts = quiet(ctx, 'linprog');
  // max x + y s.t. x + 2y <= 4, 3x + y <= 6, x, y >= 0 → x = 1.6, y = 1.2, f = -2.8
  const A = matrix([[1, 2], [3, 1]]); const b = colVec([4, 6]);
  const [x, fval, flag, out, lambda] = call(ctx, 'linprog', [colVec([-1, -1]), A, b, E, E, colVec([0, 0]), E, opts], 5);
  near(x.re[0], 1.6, 1e-9); near(x.re[1], 1.2, 1e-9); near(fval.re[0], -2.8, 1e-9);
  assert.equal(flag.re[0], 1);
  assert.ok(isStruct(out));
  near(field(lambda, 'ineqlin').re[0], 0.4, 1e-8); near(field(lambda, 'ineqlin').re[1], 0.2, 1e-8);
  const [, , flagInf] = call(ctx, 'linprog', [colVec([1, 1]), matrix([[1, 1], [-1, -1]]), colVec([1, -2]), E, E, E, E, opts], 3);
  assert.equal(flagInf.re[0], -2);
  const [, , flagUnb] = call(ctx, 'linprog', [colVec([-1, 0]), rowVec([0, 1]), num(1), E, E, colVec([0, 0]), E, opts], 3);
  assert.equal(flagUnb.re[0], -3);
  // equality constraints and free variables
  const [x2] = call(ctx, 'linprog', [colVec([1, 2, 3]), E, E, matrix([[1, 1, 1]]), num(1), colVec([0, 0, 0]), E, opts]);
  assert.deepEqual(Array.from(x2.re).map((v) => Math.round(v * 1e9) / 1e9), [1, 0, 0]);
});

test('intlinprog: 0-1 knapsack by branch and bound', () => {
  const ctx = newCtx();
  const opts = call1(ctx, 'optimoptions', [str('intlinprog'), str('Display'), str('off')]);
  // values 10 13 7 8, weights 3 4 2 3, capacity 7 → items 2 and 3? 13+7=20 (w 6); 10+8? (w6) 18; 10+13? w7 = 23 best
  const f = colVec([-10, -13, -7, -8]);
  const [x, fval, flag, out] = call(ctx, 'intlinprog', [f, rowVec([1, 2, 3, 4]), rowVec([3, 4, 2, 3]), num(7), E, E, colVec([0, 0, 0, 0]), colVec([1, 1, 1, 1]), opts], 4);
  assert.deepEqual(Array.from(x.re), [1, 1, 0, 0]);
  assert.equal(fval.re[0], -23);
  assert.equal(flag.re[0], 1);
  assert.ok(field(out, 'numnodes').re[0] >= 1);
  // general integers: max x + y, 2x + 2y <= 7 → f = -3
  const [, fv2] = call(ctx, 'intlinprog', [colVec([-1, -1]), rowVec([1, 2]), rowVec([2, 2]), num(7), E, E, colVec([0, 0]), E, opts], 2);
  assert.equal(fv2.re[0], -3);
});

test('quadprog: known QP with linear constraints and bounds', () => {
  const ctx = newCtx();
  const opts = quiet(ctx, 'quadprog');
  // reference example: H=[1 -1; -1 2], f=[-2;-6], A=[1 1;-1 2;2 1], b=[2;2;3], lb=0 → x=[0.6667;1.3333], fval=-8.2222
  const [x, fval, flag, , lambda] = call(ctx, 'quadprog', [matrix([[1, -1], [-1, 2]]), colVec([-2, -6]), matrix([[1, 1], [-1, 2], [2, 1]]), colVec([2, 2, 3]), E, E, colVec([0, 0]), E, E, opts], 5);
  near(x.re[0], 2 / 3, 1e-8); near(x.re[1], 4 / 3, 1e-8);
  near(fval.re[0], -8.222222222, 1e-7);
  assert.equal(flag.re[0], 1);
  near(field(lambda, 'ineqlin').re[0], 3.1111, 1e-3); near(field(lambda, 'ineqlin').re[1], 0.4444, 1e-3);
  // equality constrained
  const [x2] = call(ctx, 'quadprog', [matrix([[2, 0], [0, 2]]), colVec([0, 0]), E, E, rowVec([1, 1]), num(1), E, E, E, opts]);
  near(x2.re[0], 0.5, 1e-10); near(x2.re[1], 0.5, 1e-10);
});

test('lsqcurvefit: exponential fit; lsqnonlin with bounds', () => {
  const ctx = newCtx();
  const xd = [0, 0.5, 1, 1.5, 2, 2.5, 3];
  const yd = xd.map((t) => 3 * Math.exp(-0.7 * t));
  const model = jsHandle((args) => { const [a, k] = args[0].re; return rowVec(Array.from(args[1].re, (t) => a * Math.exp(-k * t))); });
  const opts = quiet(ctx, 'lsqcurvefit');
  const [x, resnorm, residual, flag, , , jac] = call(ctx, 'lsqcurvefit', [model, colVec([1, 0.1]), rowVec(xd), rowVec(yd), E, E, opts], 7);
  near(x.re[0], 3, 1e-5); near(x.re[1], 0.7, 1e-5);
  assert.ok(resnorm.re[0] < 1e-10);
  assert.deepEqual(residual.dims, [1, 7]);
  assert.ok(flag.re[0] > 0);
  assert.deepEqual(jac.dims, [7, 2]);
  // bounded: minimise (x-3)^2 with x <= 1
  const [xb] = call(ctx, 'lsqnonlin', [vfh((v) => [v[0] - 3]), num(0), num(-5), num(1), quiet(ctx, 'lsqnonlin')]);
  near(xb.re[0], 1, 1e-10);
});

test('fsolve: 2x2 nonlinear system (dogleg and Levenberg-Marquardt)', () => {
  const ctx = newCtx();
  // reference example: 2x1 - x2 = exp(-x1), -x1 + 2x2 = exp(-x2) → x = [0.5671; 0.5671]
  const Fn = vfh((v) => [2 * v[0] - v[1] - Math.exp(-v[0]), -v[0] + 2 * v[1] - Math.exp(-v[1])]);
  for (const alg of ['trust-region-dogleg', 'levenberg-marquardt']) {
    const opts = call1(ctx, 'optimoptions', [str('fsolve'), str('Algorithm'), str(alg), str('Display'), str('off')]);
    const [x, fval, flag] = call(ctx, 'fsolve', [Fn, colVec([-5, -5]), opts], 3);
    near(x.re[0], 0.567143290409784, 1e-6, alg); near(x.re[1], 0.567143290409784, 1e-6, alg);
    assert.ok(Math.abs(fval.re[0]) < 1e-6, alg);
    assert.equal(flag.re[0], 1, alg);
  }
  // no root: x^2 + 1 = 0
  const [, , flagNo] = call(ctx, 'fsolve', [vfh((v) => [v[0] * v[0] + 1]), num(1), quiet(ctx, 'fsolve')], 3);
  assert.ok(flagNo.re[0] <= 0);
});

test('lsqlin and lsqnonneg', () => {
  const ctx = newCtx();
  const C = matrix([[1, 0], [0, 1], [1, 1]]); const d = colVec([1, 2, 4]);
  // unconstrained LS solution of this system: [4/3, 7/3]
  const [x, resnorm] = call(ctx, 'lsqlin', [C, d, E, E, E, E, E, E, E, quiet(ctx, 'lsqlin')], 2);
  near(x.re[0], 4 / 3, 1e-9); near(x.re[1], 7 / 3, 1e-9); near(resnorm.re[0], 1 / 3, 1e-9);
  const [xc] = call(ctx, 'lsqlin', [C, d, rowVec([0, 1]), num(2), E, E, E, E, E, quiet(ctx, 'lsqlin')]);
  near(xc.re[1], 2, 1e-9); near(xc.re[0], 1.5, 1e-9);
  // lsqnonneg reference example
  const C2 = matrix([[0.0372, 0.2869], [0.6861, 0.7071], [0.6233, 0.6245], [0.6344, 0.6170]]);
  const d2 = colVec([0.8587, 0.1781, 0.0747, 0.8405]);
  const [xn, rn] = call(ctx, 'lsqnonneg', [C2, d2], 2);
  near(xn.re[0], 0, 1e-12); near(xn.re[1], 0.6929, 1e-4); near(rn.re[0], 0.8315, 1e-4);
});

test('fminimax and fgoalattain', () => {
  const ctx = newCtx();
  const opts = quiet(ctx, 'fminimax');
  // max(|x-1|, |x+1|) style: minimise max((x-1)^2, (x+1)^2) → x = 0, value 1
  const Fm = vfh((v) => [(v[0] - 1) ** 2, (v[0] + 1) ** 2]);
  const [x, fval, maxf, flag] = call(ctx, 'fminimax', [Fm, num(0.7), E, E, E, E, E, E, E, opts], 4);
  near(x.re[0], 0, 1e-5); near(maxf.re[0], 1, 1e-5); assert.ok(flag.re[0] > 0); assert.equal(fval.re.length, 2);
  // goal attainment: F = [x; 2-x], goal [0.5 0.5], weight [1 1] → x = 1, gamma = 0.5
  const [xg, , gam] = call(ctx, 'fgoalattain', [vfh((v) => [v[0], 2 - v[0]]), num(0), rowVec([0.5, 0.5]), rowVec([1, 1]), E, E, E, E, E, E, E, quiet(ctx, 'fgoalattain')], 3);
  near(xg.re[0], 1, 1e-5); near(gam.re[0], 0.5, 1e-5);
});

test('global solvers reach the global minimum with a fixed seed', () => {
  const ctx = newCtx();
  call(ctx, 'rng', [num(0)], 0);
  // shifted sphere with minimum at (1, -2)
  const f = sfh((v) => (v[0] - 1) ** 2 + (v[1] + 2) ** 2);
  const [xg, fg, flg] = call(ctx, 'ga', [f, num(2), E, E, E, E, colVec([-5, -5]), colVec([5, 5]), E, quiet(ctx, 'ga')], 3);
  near(xg.re[0], 1, 0.05); near(xg.re[1], -2, 0.05); assert.ok(fg.re[0] < 5e-3); assert.ok(flg.re[0] >= 0);
  call(ctx, 'rng', [num(0)], 0);
  const [xp, fp, flp] = call(ctx, 'particleswarm', [f, num(2), colVec([-5, -5]), colVec([5, 5]), quiet(ctx, 'particleswarm')], 3);
  near(xp.re[0], 1, 1e-3); near(xp.re[1], -2, 1e-3); assert.ok(fp.re[0] < 1e-6); assert.equal(flp.re[0], 1);
  call(ctx, 'rng', [num(0)], 0);
  const [xs, fs] = call(ctx, 'simulannealbnd', [f, rowVec([4, 4]), rowVec([-5, -5]), rowVec([5, 5]), quiet(ctx, 'simulannealbnd')], 2);
  near(xs.re[0], 1, 0.05); near(xs.re[1], -2, 0.05); assert.ok(fs.re[0] < 5e-3);
  const [xq, fq, flq] = call(ctx, 'patternsearch', [f, rowVec([0, 0]), E, E, E, E, E, E, E, quiet(ctx, 'patternsearch')], 3);
  near(xq.re[0], 1, 1e-5); near(xq.re[1], -2, 1e-5); assert.ok(fq.re[0] < 1e-10); assert.equal(flq.re[0], 1);
  // Rastrigin: particleswarm finds the global minimum 0
  call(ctx, 'rng', [num(1)], 0);
  const ras = sfh((v) => 20 + v.reduce((s, t) => s + t * t - 10 * Math.cos(2 * Math.PI * t), 0));
  const [, fr] = call(ctx, 'particleswarm', [ras, num(2), colVec([-5, -5]), colVec([5, 5]), quiet(ctx, 'particleswarm')], 2);
  assert.ok(fr.re[0] < 1e-4, `rastrigin ${fr.re[0]}`);
  // reproducible: same seed, same answer
  call(ctx, 'rng', [num(7)], 0); const [a1] = call(ctx, 'ga', [f, num(2), E, E, E, E, colVec([-5, -5]), colVec([5, 5]), E, quiet(ctx, 'ga')]);
  call(ctx, 'rng', [num(7)], 0); const [a2] = call(ctx, 'ga', [f, num(2), E, E, E, E, colVec([-5, -5]), colVec([5, 5]), E, quiet(ctx, 'ga')]);
  assert.deepEqual(Array.from(a1.re), Array.from(a2.re));
});

test('patternsearch with a linear constraint and ga with integer variables', () => {
  const ctx = newCtx();
  const f = sfh((v) => (v[0] - 1) ** 2 + (v[1] + 2) ** 2);
  const [x] = call(ctx, 'patternsearch', [f, rowVec([0, -5]), rowVec([-1, 0]), num(-2), E, E, E, E, E, quiet(ctx, 'patternsearch')]);
  near(x.re[0], 2, 1e-5); near(x.re[1], -2, 1e-5);
  const [xe] = call(ctx, 'patternsearch', [f, rowVec([0, 0]), E, E, rowVec([1, 1]), num(0), E, E, E, quiet(ctx, 'patternsearch')]);
  near(xe.re[0], 1.5, 1e-4); near(xe.re[1], -1.5, 1e-4);
  call(ctx, 'rng', [num(3)], 0);
  const g = sfh((v) => (v[0] - 1.3) ** 2 + (v[1] + 2.6) ** 2);
  const [xi] = call(ctx, 'ga', [g, num(2), E, E, E, E, colVec([-5, -5]), colVec([5, 5]), E, rowVec([1, 2]), quiet(ctx, 'ga')]);
  assert.deepEqual(Array.from(xi.re), [1, -3]);
});

test('optimset / optimget / optimoptions', () => {
  const ctx = newCtx();
  const o = call1(ctx, 'optimset', [str('TolX'), num(1e-8), str('display'), str('iter')]);
  assert.equal(call1(ctx, 'optimget', [o, str('TolX')]).re[0], 1e-8);
  assert.equal(toStr(call1(ctx, 'optimget', [o, str('Display')])), 'iter');
  assert.equal(call1(ctx, 'optimget', [o, str('MaxIter'), num(77)]).re[0], 77);
  const d = call1(ctx, 'optimset', [str('fminsearch')]);
  assert.equal(call1(ctx, 'optimget', [d, str('TolFun')]).re[0], 1e-4);
  const o2 = call1(ctx, 'optimset', [o, str('MaxIter'), num(10)]);
  assert.equal(call1(ctx, 'optimget', [o2, str('MaxIter')]).re[0], 10);
  assert.equal(call1(ctx, 'optimget', [o2, str('TolX')]).re[0], 1e-8);
  const p = call1(ctx, 'optimoptions', [str('fmincon'), str('Algorithm'), str('sqp'), str('TolX'), num(1e-9), str('GradObj'), str('on')]);
  assert.equal(toStr(field(p, 'SolverName')), 'fmincon');
  assert.equal(toStr(field(p, 'Algorithm')), 'sqp');
  assert.equal(field(p, 'StepTolerance').re[0], 1e-9);
  assert.equal(field(p, 'SpecifyObjectiveGradient').re[0], 1);
  const p2 = call1(ctx, 'optimoptions', [p, str('MaxIterations'), num(50)]);
  assert.equal(field(p2, 'MaxIterations').re[0], 50);
  assert.equal(toStr(field(p2, 'Algorithm')), 'sqp');
  assert.throws(() => call1(ctx, 'optimoptions', [str('fmincon'), str('NoSuchOption'), num(1)]), /not an option/);
  // the option struct drives the solver
  const [, , flag] = call(ctx, 'fminsearch', [sfh(rosen), rowVec([-1.2, 1]), call1(ctx, 'optimset', [str('MaxFunEvals'), num(10)])], 3);
  assert.equal(flag.re[0], 0);
});

test('Display iter prints a table and OutputFcn can stop a solver', () => {
  const ctx = newCtx();
  call(ctx, 'fminsearch', [sfh(rosen), rowVec([-1.2, 1]), call1(ctx, 'optimset', [str('Display'), str('iter'), str('MaxIter'), num(3)])], 0);
  const text = ctx.outText.join('');
  assert.match(text, /Iteration\s+Func-count\s+f\(x\)\s+Procedure/);
  assert.match(text, /initial simplex/);
  let calls = 0;
  const stopper = jsHandle((args) => { calls++; const state = toStr(args[2]); assert.ok(['init', 'iter', 'done'].includes(state)); return tensor('logical', [1, 1], [calls >= 3 ? 1 : 0]); });
  const [, , flag] = call(ctx, 'fminunc', [sfh(rosen), rowVec([-1.2, 1]), call1(ctx, 'optimoptions', [str('fminunc'), str('OutputFcn'), stopper, str('Display'), str('off')])], 3);
  assert.equal(flag.re[0], -1);
  assert.ok(registry.help.fmincon && registry.help.fmincon.ko && registry.help.fmincon.syntax.length);
  for (const k of Object.keys(optim.builtins)) assert.ok(optim.help[k] && optim.help[k].en && optim.help[k].ko && optim.help[k].syntax.length, `help for ${k}`);
});
