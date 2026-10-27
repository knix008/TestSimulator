// Tests of the ODE/DAE/BVP/PDE/DDE solvers of the numerics area.
// A numerics-only ctx is used so that work in progress in other areas does
// not affect these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as numeric from '../core/lib/numeric/index.js';
import { MError, isFuncHandle, num, rowVec, colVec, str, matrix, toStr } from '../core/value.js';

const B = numeric.builtins;
const jsHandle = (jsfn) => ({ cls: 'function_handle', dims: [1, 1], jsfn });
function makeCtx() {
  const ctx = {
    state: {}, outText: [], warnings: [],
    out(t) { this.outText.push(t); }, errOut(t) { this.outText.push(t); },
    warning(id, message) { this.warnings.push({ id, message }); },
    checkInterrupt() {},
    call(fn, args, nargout = 1) {
      let r;
      if (typeof fn === 'string') { const b = B[fn]; if (!b) throw new MError('test:undefined', `Undefined function '${fn}'.`); r = b(args, nargout, ctx); }
      else if (isFuncHandle(fn) && fn.jsfn) r = fn.jsfn(args, nargout);
      else throw new MError('test:badCall', 'cannot call this value');
      return Array.isArray(r) ? r : r === undefined ? [] : [r];
    },
  };
  numeric.install(ctx);
  return ctx;
}
const ctx = makeCtx();
const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const field = (s, f) => s.data[0][f];
const opts = (...kv) => B.odeset(kv.map((x) => (typeof x === 'string' ? str(x) : typeof x === 'number' ? num(x) : x)), 1, ctx);
const ycol = (Y, j) => { const N = Y.dims[0]; return Array.from(Y.re.slice(j * N, (j + 1) * N)); };

const decay = jsHandle(([t, y]) => colVec(Array.from(y.re, (v) => -v)));
const osc = jsHandle(([t, y]) => colVec([y.re[1], -y.re[0]]));
const robertson = jsHandle(([t, y]) => { const [a, b, c] = y.re; return colVec([-0.04 * a + 1e4 * b * c, 0.04 * a - 1e4 * b * c - 3e7 * b * b, 3e7 * b * b]); });
const ROB40 = [0.7158270687, 9.185534764e-6, 0.2841637457];

test('ode45: exponential decay at requested output times', () => {
  const [T, Y] = B.ode45([decay, rowVec([0, 0.5, 1, 2, 5]), num(1)], 2, ctx);
  assert.deepEqual(Array.from(T.re), [0, 0.5, 1, 2, 5]);
  T.re.forEach((t, i) => close(Y.re[i], Math.exp(-t), 2e-5, `t=${t}`));
});

for (const s of ['ode45', 'ode23', 'ode78', 'ode89', 'ode113', 'ode15s', 'ode23s', 'ode23t', 'ode23tb']) {
  test(`${s}: harmonic oscillator with tight tolerances`, () => {
    const tight = ['ode23', 'ode23s', 'ode23t', 'ode23tb'].includes(s);
    const o = opts('RelTol', tight ? 1e-6 : 1e-9, 'AbsTol', tight ? 1e-8 : 1e-11);
    const [T, Y] = B[s]([osc, rowVec([0, Math.PI / 2, Math.PI, 2 * Math.PI]), colVec([1, 0]), o], 2, ctx);
    const y1 = ycol(Y, 0), y2 = ycol(Y, 1);
    const tol = s === 'ode15s' ? 1e-5 : tight ? 2e-4 : 1e-6;
    Array.from(T.re).forEach((t, i) => { close(y1[i], Math.cos(t), tol, `${s} y1(${t})`); close(y2[i], -Math.sin(t), tol, `${s} y2(${t})`); });
  });
}

test('ode45: default Refine gives four output points per step', () => {
  const [T] = B.ode45([decay, rowVec([0, 1]), num(1)], 2, ctx);
  const sol = B.ode45([decay, rowVec([0, 1]), num(1)], 1, ctx);
  const nsteps = field(field(sol, 'stats'), 'nsteps').re[0];
  assert.equal(T.re.length, 4 * nsteps + 1);
});

test('ode45: sol structure and deval', () => {
  const sol = B.ode45([osc, rowVec([0, 10]), colVec([1, 0])], 1, ctx);
  assert.equal(toStr(field(sol, 'solver')), 'ode45');
  for (const f of ['extdata', 'x', 'y', 'stats', 'idata']) assert.ok(field(sol, f), f);
  const [Yq, YPq] = B.deval([sol, rowVec([1.3, 7.7])], 2, ctx);
  assert.deepEqual(Yq.dims, [2, 2]);
  close(Yq.re[0], Math.cos(1.3), 5e-3); close(Yq.re[2], Math.cos(7.7), 5e-3);
  close(YPq.re[0], -Math.sin(1.3), 5e-3);
  const y1only = B.deval([sol, num(2), num(1)], 1, ctx);
  assert.deepEqual(y1only.dims, [1, 1]);
  close(y1only.re[0], Math.cos(2), 5e-3);
  assert.throws(() => B.deval([sol, num(11)], 1, ctx), /outside/);
});

test('ode45: terminal event (falling ball reaches the ground)', () => {
  const ball = jsHandle(([t, y]) => colVec([y.re[1], -9.81]));
  const ev = jsHandle(([t, y]) => [num(y.re[0]), num(1), num(-1)]);
  const o = opts('Events', ev);
  const [T, Y, te, ye, ie] = B.ode45([ball, rowVec([0, 10]), colVec([10, 0]), o], 5, ctx);
  const tHit = Math.sqrt(20 / 9.81);
  close(te.re[0], tHit, 1e-6); close(ye.re[0], 0, 1e-6); assert.equal(ie.re[0], 1);
  close(T.re[T.re.length - 1], tHit, 1e-6);
  const sol = B.ode45([ball, rowVec([0, 10]), colVec([10, 0]), o], 1, ctx);
  close(field(sol, 'xe').re[0], tHit, 1e-6);
});

test('ode23: non-terminal events are all recorded', () => {
  const ev = jsHandle(([t, y]) => [num(y.re[0]), num(0), num(0)]);
  const o = opts('Events', ev, 'RelTol', 1e-8, 'AbsTol', 1e-10);
  const r = B.ode23([osc, rowVec([0, 10]), colVec([1, 0]), o], 5, ctx);
  const te = Array.from(r[2].re);
  assert.equal(te.length, 3); // pi/2, 3pi/2, 5pi/2
  te.forEach((t, k) => close(t, Math.PI / 2 + k * Math.PI, 1e-6));
});

test('ode45: backward integration', () => {
  const [T, Y] = B.ode45([decay, rowVec([1, 0]), num(Math.exp(-1))], 2, ctx);
  close(T.re[T.re.length - 1], 0, 0); close(Y.re[Y.re.length - 1], 1, 1e-5);
});

test('ode45: extra parameters are passed to the ODE function', () => {
  const f = jsHandle(([t, y, k]) => colVec([-k.re[0] * y.re[0]]));
  const [T, Y] = B.ode45([f, rowVec([0, 1]), num(1), B.odeset([], 1, ctx), num(3)], 2, ctx);
  close(Y.re[Y.re.length - 1], Math.exp(-3), 1e-4);
});

test('ode45: constant nonsingular mass matrix', () => {
  const o = opts('Mass', num(2));
  const [T, Y] = B.ode45([decay, rowVec([0, 1]), num(1), o], 2, ctx);
  close(Y.re[Y.re.length - 1], Math.exp(-0.5), 1e-5);
});

test('ode15s / ode23s / ode23tb: stiff Robertson problem', () => {
  for (const s of ['ode15s', 'ode23s', 'ode23tb']) {
    const [T, Y] = B[s]([robertson, rowVec([0, 40]), colVec([1, 0, 0])], 2, ctx);
    const N = T.re.length;
    close(Y.re[N - 1], ROB40[0], 2e-3, `${s} y1`);
    close(Y.re[2 * N - 1], ROB40[1], 5e-8, `${s} y2`);
    close(Y.re[3 * N - 1], ROB40[2], 2e-3, `${s} y3`);
    assert.ok(N < 500, `${s} took ${N} steps`);
  }
});

test('ode15s / ode23t: Robertson as a DAE with a singular mass matrix', () => {
  const dae = jsHandle(([t, y]) => { const [a, b, c] = y.re; return colVec([-0.04 * a + 1e4 * b * c, 0.04 * a - 1e4 * b * c - 3e7 * b * b, a + b + c - 1]); });
  const o = opts('Mass', matrix([[1, 0, 0], [0, 1, 0], [0, 0, 0]]), 'RelTol', 1e-4, 'AbsTol', colVec([1e-6, 1e-10, 1e-6]));
  for (const s of ['ode15s', 'ode23t']) {
    const [T, Y] = B[s]([dae, rowVec([0, 40]), colVec([1, 0, 0]), o], 2, ctx);
    const N = T.re.length;
    close(Y.re[N - 1], ROB40[0], 1e-3, `${s} y1`);
    close(Y.re[3 * N - 1], ROB40[2], 1e-3, `${s} y3`);
    close(Y.re[N - 1] + Y.re[2 * N - 1] + Y.re[3 * N - 1], 1, 1e-9, `${s} conservation`);
  }
});

test('ode15s: van der Pol oscillator with mu = 1000 completes', () => {
  const mu = 1000;
  const vdp = jsHandle(([t, y]) => colVec([y.re[1], mu * (1 - y.re[0] ** 2) * y.re[1] - y.re[0]]));
  const sol = B.ode15s([vdp, rowVec([0, 3000]), colVec([2, 0])], 1, ctx);
  const x = field(sol, 'x').re; const y = field(sol, 'y').re;
  assert.equal(x[x.length - 1], 3000);
  const nsteps = field(field(sol, 'stats'), 'nsteps').re[0];
  assert.ok(nsteps < 3000, `nsteps ${nsteps}`);
  const yEnd = y[2 * (x.length - 1)];
  assert.ok(Math.abs(yEnd) < 2.1 && Math.abs(yEnd) > 1, `y1(3000) = ${yEnd}`);
});

test('ode15s: analytic Jacobian option and Stats output', () => {
  const c = makeCtx();
  const J = jsHandle(() => matrix([[0, 1], [-1, 0]]));
  const o = opts('Jacobian', J, 'Stats', 'on', 'RelTol', 1e-6, 'AbsTol', 1e-8);
  const [T, Y] = B.ode15s([osc, rowVec([0, Math.PI]), colVec([1, 0]), o], 2, c);
  close(Y.re[T.re.length - 1], -1, 1e-4);
  const txt = c.outText.join('');
  assert.match(txt, /successful steps/); assert.match(txt, /LU decompositions/);
});

test('ode15i: implicit form of y\' = -y and decic', () => {
  const F = jsHandle(([t, y, yp]) => colVec([yp.re[0] + y.re[0]]));
  const [y0, yp0] = B.decic([F, num(0), num(1), num(1), num(0), num(0)], 2, ctx);
  close(y0.re[0], 1, 0); close(yp0.re[0], -1, 1e-8);
  const [T, Y] = B.ode15i([F, rowVec([0, 1, 2]), y0, yp0], 2, ctx);
  close(Y.re[1], Math.exp(-1), 2e-3); close(Y.re[2], Math.exp(-2), 2e-3);
});

test('OutputFcn: init, steps, done and early stop', () => {
  const flags = []; let calls = 0;
  const of = jsHandle(([t, y, flag]) => { const f = toStr(flag); flags.push(f); if (f === '') calls++; return num(f === '' && calls >= 3 ? 1 : 0); });
  const [T] = B.ode45([decay, rowVec([0, 10]), num(1), opts('OutputFcn', of)], 2, ctx);
  assert.equal(flags[0], 'init'); assert.equal(flags[flags.length - 1], 'done');
  assert.equal(calls, 3);
  assert.ok(T.re[T.re.length - 1] < 10);
});

test('NonNegative keeps a component nonnegative', () => {
  const f = jsHandle(([t, y]) => colVec([-1]));
  const [T, Y] = B.ode45([f, rowVec([0, 2]), num(1), opts('NonNegative', num(1))], 2, ctx);
  assert.ok(Array.from(Y.re).every((v) => v >= 0));
  close(Y.re[Y.re.length - 1], 0, 1e-12);
});

test('odeset / odeget', () => {
  const o = opts('reltol', 1e-4, 'Abs', 1e-7);
  assert.equal(B.odeget([o, str('RelTol')], 1, ctx).re[0], 1e-4);
  assert.equal(B.odeget([o, str('AbsTol')], 1, ctx).re[0], 1e-7);
  assert.equal(B.odeget([o, str('MaxStep'), num(5)], 1, ctx).re[0], 5);
  const o2 = B.odeset([o, str('RelTol'), num(1e-2)], 1, ctx);
  assert.equal(B.odeget([o2, str('RelTol')], 1, ctx).re[0], 1e-2);
  assert.equal(B.odeget([o2, str('AbsTol')], 1, ctx).re[0], 1e-7);
  assert.throws(() => B.odeset([str('NoSuchOption'), num(1)], 1, ctx), /Unrecognized property/);
  assert.ok(o.fields.includes('Events') && o.fields.includes('Mass'));
});

test('odextend continues a solution', () => {
  const sol = B.ode45([decay, rowVec([0, 1]), num(1)], 1, ctx);
  const ext = B.odextend([sol, decay, num(3)], 1, ctx);
  const x = field(ext, 'x').re; assert.equal(x[x.length - 1], 3);
  close(B.deval([ext, num(2.5)], 1, ctx).re[0], Math.exp(-2.5), 1e-3);
});

test('ode solvers: argument errors', () => {
  assert.throws(() => B.ode45([decay, num(1), num(1)], 2, ctx), /at least two/);
  assert.throws(() => B.ode45([jsHandle(() => colVec([1, 2])), rowVec([0, 1]), num(1)], 2, ctx), /length 1/);
});

test('bvp4c: y\'\' = -y with y(0)=0, y(pi/2)=1 gives sin(x)', () => {
  const f = jsHandle(([x, y]) => colVec([y.re[1], -y.re[0]]));
  const bc = jsHandle(([ya, yb]) => colVec([ya.re[0], yb.re[0] - 1]));
  const init = B.bvpinit([rowVec([0, 0.4, 0.8, 1.2, Math.PI / 2]), rowVec([0.5, 0.5])], 1, ctx);
  for (const s of ['bvp4c', 'bvp5c']) {
    const sol = B[s]([f, bc, init], 1, ctx);
    const xs = [0.1, 0.7, 1.5];
    const Y = B.deval([sol, rowVec(xs)], 1, ctx);
    xs.forEach((x, i) => { close(Y.re[2 * i], Math.sin(x), 1e-3, `${s} y`); close(Y.re[2 * i + 1], Math.cos(x), 1e-3, `${s} y'`); });
  }
});

test('bvp4c: unknown parameter (eigenvalue of y\'\' + lambda y = 0)', () => {
  const f = jsHandle(([x, y, p]) => colVec([y.re[1], -p.re[0] * y.re[0]]));
  const bc = jsHandle(([ya, yb, p]) => colVec([ya.re[0], ya.re[1] - 1, yb.re[0]]));
  const xs = Array.from({ length: 10 }, (_, i) => i * Math.PI / 9);
  const yinit = jsHandle(([x]) => colVec([Math.sin(x.re[0]), Math.cos(x.re[0])]));
  const init = B.bvpinit([rowVec(xs), yinit, num(1.3)], 1, ctx);
  const sol = B.bvp4c([f, bc, init], 1, ctx);
  close(field(sol, 'parameters').re[0], 1, 1e-3);
});

test('pdepe: heat equation against the series solution', () => {
  const pde = jsHandle(([x, t, u, dudx]) => [num(1), dudx, num(0)]);
  const ic = jsHandle(([x]) => num(Math.sin(Math.PI * x.re[0])));
  const bc = jsHandle(([xl, ul, xr, ur, t]) => [ul, num(0), ur, num(0)]);
  const x = Array.from({ length: 21 }, (_, i) => i / 20);
  const t = [0, 0.05, 0.1, 0.2];
  const sol = B.pdepe([num(0), pde, ic, bc, rowVec(x), rowVec(t)], 1, ctx);
  assert.deepEqual(sol.dims, [4, 21]);
  for (let i = 0; i < t.length; i++) for (const j of [5, 10, 15]) close(sol.re[i + 4 * j], Math.exp(-(Math.PI ** 2) * t[i]) * Math.sin(Math.PI * x[j]), 4e-3, `u(${t[i]},${x[j]})`);
  // boundaries satisfy the Dirichlet conditions
  for (let i = 1; i < t.length; i++) close(sol.re[i], 0, 1e-8);
  const [uo, du] = B.pdeval([num(0), rowVec(x), rowVec(x.map((_, j) => sol.re[3 + 4 * j])), rowVec([0.5])], 2, ctx);
  close(uo.re[0], Math.exp(-(Math.PI ** 2) * 0.2), 4e-3); close(du.re[0], 0, 0.05);
});

test('pdepe: flux boundary conditions and spherical symmetry (m = 2)', () => {
  // u_t = x^-2 (x^2 u_x)_x, u(1,t) = 0, u(x,0) = sin(pi x)/(pi x)  ->  exp(-pi^2 t) sin(pi x)/(pi x)
  const pde = jsHandle(([x, t, u, dudx]) => [num(1), dudx, num(0)]);
  const ic = jsHandle(([x]) => { const v = x.re[0]; return num(v === 0 ? 1 : Math.sin(Math.PI * v) / (Math.PI * v)); });
  const bc = jsHandle(([xl, ul, xr, ur, t]) => [num(0), num(1), ur, num(0)]);
  const x = Array.from({ length: 41 }, (_, i) => i / 40);
  const sol = B.pdepe([num(2), pde, ic, bc, rowVec(x), rowVec([0, 0.05, 0.1])], 1, ctx);
  const exact = (xx, t) => Math.exp(-(Math.PI ** 2) * t) * (xx === 0 ? 1 : Math.sin(Math.PI * xx) / (Math.PI * xx));
  for (const j of [0, 10, 20, 30]) close(sol.re[2 + 3 * j], exact(x[j], 0.1), 1e-2, `x=${x[j]}`);
});

test('dde23: y\'(t) = -y(t-1) with constant history (method of steps)', () => {
  const f = jsHandle(([t, y, Z]) => colVec([-Z.re[0]]));
  const sol = B.dde23([f, num(1), num(1), rowVec([0, 2])], 1, ctx);
  const ex = (t) => (t <= 1 ? 1 - t : 1 - t + (t - 1) ** 2 / 2);
  for (const t of [0.5, 1, 1.5, 2]) close(B.deval([sol, num(t)], 1, ctx).re[0], ex(t), 1e-5, `t=${t}`);
  assert.equal(toStr(field(sol, 'solver')), 'dde23');
});

test('ddesd: function-valued delays and a history function', () => {
  const f = jsHandle(([t, y, Z]) => colVec([-Z.re[0]]));
  const d = jsHandle(([t, y]) => num(t.re[0] - 1));
  const hist = jsHandle(([t]) => num(1));
  const sol = B.ddesd([f, d, hist, rowVec([0, 2])], 1, ctx);
  close(B.deval([sol, num(2)], 1, ctx).re[0], -0.5, 1e-3);
});

test('help entries exist for every ODE builtin', () => {
  for (const k of ['ode45', 'ode23', 'ode78', 'ode89', 'ode113', 'ode15s', 'ode23s', 'ode23t', 'ode23tb', 'ode15i', 'odeset', 'odeget', 'deval', 'odextend', 'decic', 'bvp4c', 'bvp5c', 'bvpinit', 'bvpset', 'bvpget', 'bvpxtend', 'pdepe', 'pdeval', 'dde23', 'ddesd', 'ddeset', 'ddeget']) {
    assert.ok(B[k], `builtin ${k}`);
    const h = numeric.help[k]; assert.ok(h && h.en && h.ko && h.syntax.length, `help ${k}`);
  }
});
