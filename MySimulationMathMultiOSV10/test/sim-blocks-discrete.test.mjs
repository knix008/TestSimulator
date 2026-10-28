// Tests of the Discrete, Discontinuities, Lookup Tables and User-Defined
// Functions block libraries of the simulation engine (compile + run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newModel, makeBlock, connect } from '../core/sim/model.js';
import { BLOCKS, portsOf, iconOf } from '../core/sim/blocks/index.js';
import { compileModel } from '../core/sim/compile.js';
import { Run } from '../core/sim/runtime.js';
import { makeB, baseScope, Interp } from '../core/sim/params.js';
import { mockCtx } from './helpers/mockctx.mjs';

const ctx = mockCtx();
const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);

/** Builds and runs a model; returns { t, y(k) → column k of yout, run }. */
function sim(blocks, lines, settings = {}) {
  const m = newModel('t');
  const by = {};
  for (const [name, type, params] of blocks) { const b = makeBlock(m, type, { name, params }, m.root); m.root.blocks.push(b); by[name] = b; }
  for (const [a, pa, b, pb] of lines) connect(m, m.root, { block: by[a].id, port: pa }, { block: by[b].id, port: pb });
  Object.assign(m.settings, settings);
  const run = new Run(compileModel(m, ctx), ctx).init();
  const out = run.runSync();
  const t = Array.from(out.props.tout.re);
  const Y = out.props.yout;
  const N = t.length;
  return { t, y: (k = 0) => Array.from(Y.re.subarray(k * N, (k + 1) * N)), run };
}
const fixed = (stop, step) => ({ solverType: 'fixed', solver: 'auto', stopTime: String(stop), fixedStep: String(step) });
const at = (r, tt, k = 0) => { const i = r.t.findIndex((x) => Math.abs(x - tt) < 1e-9); assert.ok(i >= 0, `no sample at t = ${tt}`); return r.y(k)[i]; };

test('every discrete / discontinuity / lookup / user-defined block builds with default parameters', () => {
  const interp = new Interp(ctx, {});
  const groups = new Set(['discrete', 'discont', 'lookup', 'userfn']);
  let n = 0;
  for (const d of Object.values(BLOCKS)) {
    if (!groups.has(d.group)) continue;
    const m = newModel('x');
    const b = makeBlock(m, d.type, {}, m.root);
    const pc = portsOf(b);
    assert.ok(iconOf(b), d.type);
    assert.equal(typeof d.make, 'function', d.type);
    const rt = d.make(makeB({ block: b, path: `x/${b.name}`, def: d, scope: baseScope(ctx), interp, ctx, nIn: pc.in, nOut: pc.out }));
    assert.ok(rt && typeof rt === 'object', d.type);
    n++;
  }
  assert.ok(n >= 35, `only ${n} blocks`);
});

test('Unit Delay and Delay shift a discrete clock', () => {
  const r = sim([['C', 'DigitalClock', { SampleTime: '1' }], ['D', 'UnitDelay', {}], ['D2', 'Delay', { DelayLength: '2', InitialCondition: '7' }], ['O', 'Outport', {}], ['O2', 'Outport', { Port: '2' }]],
    [['C', 1, 'D', 1], ['D', 1, 'O', 1], ['C', 1, 'D2', 1], ['D2', 1, 'O2', 1]], fixed(5, 1));
  assert.deepEqual(r.t, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(r.y(0), [0, 0, 1, 2, 3, 4]);
  assert.deepEqual(r.y(1), [7, 7, 0, 1, 2, 3]);
});

test('Discrete Transfer Fcn, Discrete Filter and Discrete State-Space match the closed-form step response', () => {
  const r = sim([['C', 'Constant', { Value: '1' }], ['H', 'DiscreteTransferFcn', { Numerator: '1', Denominator: '[1 -0.5]', SampleTime: '1' }],
    ['F', 'DiscreteFilter', { Numerator: '[0 1]', Denominator: '[1 -0.5]', SampleTime: '1' }], ['X', 'DiscreteStateSpace', { A: '0.5', B: '1', C: '1', D: '0', SampleTime: '1' }],
    ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }], ['O3', 'Outport', { Port: '3' }]],
  [['C', 1, 'H', 1], ['C', 1, 'F', 1], ['C', 1, 'X', 1], ['H', 1, 'O1', 1], ['F', 1, 'O2', 1], ['X', 1, 'O3', 1]], fixed(8, 1));
  for (let k = 0; k <= 8; k++) {
    const want = 2 * (1 - 0.5 ** k);
    for (let c = 0; c < 3; c++) close(r.y(c)[k], want, 1e-12, `column ${c} k=${k}`);
  }
});

test('Discrete-Time Integrator: forward Euler and trapezoidal of a constant, reset to the initial condition', () => {
  const r = sim([['C', 'Constant', { Value: '2' }], ['FE', 'DiscreteTimeIntegrator', { SampleTime: '0.5' }], ['TR', 'DiscreteTimeIntegrator', { SampleTime: '0.5', IntegratorMethod: 'Integration: Trapezoidal', InitialCondition: '1' }],
    ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }]], [['C', 1, 'FE', 1], ['C', 1, 'TR', 1], ['FE', 1, 'O1', 1], ['TR', 1, 'O2', 1]], fixed(3, 0.5));
  r.t.forEach((t, i) => { close(r.y(0)[i], 2 * t, 1e-12, 'FE'); close(r.y(1)[i], 1 + 2 * t, 1e-12, 'trap'); });
  const s = sim([['C', 'Constant', { Value: '1' }], ['P', 'PulseGenerator', { Period: '2', PulseWidth: '1', PulseType: 'sample', SampleTime: '1' }], ['I', 'DiscreteTimeIntegrator', { SampleTime: '1', ExternalReset: 'rising' }], ['O', 'Outport', {}]],
    [['C', 1, 'I', 1], ['P', 1, 'I', 2], ['I', 1, 'O', 1]], fixed(4, 1));
  assert.deepEqual(s.y(0), [0, 1, 0, 1, 0]);
});

test('Discrete PID with only the proportional and integral terms', () => {
  const r = sim([['C', 'Constant', { Value: '1' }], ['P', 'DiscretePIDController', { Controller: 'PI', P: '2', I: '0.5', SampleTime: '1' }], ['O', 'Outport', {}]], [['C', 1, 'P', 1], ['P', 1, 'O', 1]], fixed(3, 1));
  assert.deepEqual(r.y(0), [2, 2.5, 3, 3.5]);
});

test('Memory, Difference, Tapped Delay and Discrete Derivative', () => {
  const r = sim([['C', 'DigitalClock', { SampleTime: '1' }], ['M', 'Memory', {}], ['D', 'Difference', {}], ['T', 'TappedDelay', { NumDelays: '3' }], ['Dd', 'DiscreteDerivative', { gainval: '2', SampleTime: '1' }],
    ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }], ['O3', 'Outport', { Port: '3' }], ['O4', 'Outport', { Port: '4' }]],
  [['C', 1, 'M', 1], ['C', 1, 'D', 1], ['C', 1, 'T', 1], ['C', 1, 'Dd', 1], ['M', 1, 'O1', 1], ['D', 1, 'O2', 1], ['T', 1, 'O3', 1], ['Dd', 1, 'O4', 1]], fixed(4, 1));
  assert.deepEqual(r.y(0), [0, 0, 1, 2, 3]);
  assert.deepEqual(r.y(1), [0, 1, 1, 1, 1]);
  // tapped delay (oldest first): yout columns 3..5; at t = 4 the taps hold 1, 2, 3
  assert.deepEqual([r.y(2)[4], r.y(3)[4], r.y(4)[4]], [1, 2, 3]);
  assert.deepEqual(r.y(5), [0, 2, 2, 2, 2]);
});

test('Saturation and Dead Zone of a sine wave', () => {
  const r = sim([['S', 'SineWave', { Amplitude: '2' }], ['Sat', 'Saturation', {}], ['Dz', 'DeadZone', {}], ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }]],
    [['S', 1, 'Sat', 1], ['S', 1, 'Dz', 1], ['Sat', 1, 'O1', 1], ['Dz', 1, 'O2', 1]], fixed(6.3, 0.01));
  const ys = r.y(0), yd = r.y(1);
  close(Math.max(...ys), 0.5, 1e-12); close(Math.min(...ys), -0.5, 1e-12);
  r.t.forEach((t, i) => { const u = 2 * Math.sin(t); close(ys[i], Math.max(-0.5, Math.min(0.5, u)), 1e-9); close(yd[i], u > 0.5 ? u - 0.5 : u < -0.5 ? u + 0.5 : 0, 1e-9); });
});

test('Relay hysteresis follows the switch on / off points', () => {
  const r = sim([['S', 'SineWave', {}], ['R', 'Relay', { OnSwitchValue: '0.5', OffSwitchValue: '-0.5' }], ['O', 'Outport', {}]], [['S', 1, 'R', 1], ['R', 1, 'O', 1]], fixed(6.28, 0.01));
  r.t.forEach((t, i) => {
    const want = t >= Math.PI / 6 + 0.005 && t <= 7 * Math.PI / 6 - 0.005 ? 1 : (t < Math.PI / 6 - 0.005 || t > 7 * Math.PI / 6 + 0.005) ? 0 : null;
    if (want !== null) assert.equal(r.y(0)[i], want, `t = ${t}`);
  });
});

test('Rate Limiter limits the rise of a step, Quantizer and Backlash', () => {
  const r = sim([['St', 'Step', { Time: '1' }], ['RL', 'RateLimiter', { RisingSlewLimit: '0.5' }], ['O', 'Outport', {}]], [['St', 1, 'RL', 1], ['RL', 1, 'O', 1]], fixed(4, 0.1));
  close(at(r, 0.9), 0, 1e-9); close(at(r, 1), 0.05, 1e-9); close(at(r, 2), 0.55, 1e-9); close(at(r, 3), 1, 1e-9); close(at(r, 4), 1, 1e-9);
  const q = sim([['C', 'Clock', {}], ['Q', 'Quantizer', { QuantizationInterval: '0.5' }], ['B', 'Backlash', { BacklashWidth: '1' }], ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }]],
    [['C', 1, 'Q', 1], ['C', 1, 'B', 1], ['Q', 1, 'O1', 1], ['B', 1, 'O2', 1]], fixed(2, 0.1));
  close(at(q, 0.7), 0.5, 1e-12); close(at(q, 0.8), 1, 1e-12);
  close(at(q, 0.2), 0, 1e-12); close(at(q, 1.5, 1), 1, 1e-9);
});

test('Hit Crossing: the variable-step solver lands on the crossing of a sine', () => {
  // an integrator gives the model a continuous state, so the variable-step solver (with zero-crossing location) runs
  const r = sim([['S', 'SineWave', {}], ['H', 'HitCrossing', { HitCrossingDirection: 'falling' }], ['O', 'Outport', {}], ['I', 'Integrator', {}], ['T', 'Terminator', {}]],
    [['S', 1, 'H', 1], ['H', 1, 'O', 1], ['S', 1, 'I', 1], ['I', 1, 'T', 1]], { stopTime: '5' });
  // the input starts exactly at the offset (sin 0 = 0), which also counts as a hit
  assert.equal(r.y(0)[0], 1);
  const i = r.y(0).findIndex((v, k) => v === 1 && r.t[k] > 1);
  assert.ok(i > 0, 'no crossing reported');
  close(r.t[i], Math.PI, 1e-6);
  assert.equal(r.y(0).filter((v, k) => v === 1 && r.t[k] > 1).length, 1);
});

test('1-D Lookup Table: linear interpolation, linear extrapolation and clipping', () => {
  const r = sim([['C', 'Clock', {}], ['L1', 'Lookup1D', { BreakpointsForDimension1: '[0 1 2]', Table: '[0 10 0]' }], ['L2', 'Lookup1D', { BreakpointsForDimension1: '[0 1 2]', Table: '[0 10 0]', ExtrapMethod: 'Clip' }],
    ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }]], [['C', 1, 'L1', 1], ['C', 1, 'L2', 1], ['L1', 1, 'O1', 1], ['L2', 1, 'O2', 1]], fixed(3, 0.5));
  close(at(r, 0.5), 5, 1e-12); close(at(r, 1.5), 5, 1e-12); close(at(r, 3), -10, 1e-12); close(at(r, 3, 1), 0, 1e-12);
});

test('2-D and n-D Lookup Table (bilinear) and Prelookup + Interpolation', () => {
  const r = sim([['A', 'Constant', { Value: '1.5' }], ['B', 'Constant', { Value: '2.5' }], ['T2', 'Lookup2D', {}], ['TN', 'LookupND', {}], ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }]],
    [['A', 1, 'T2', 1], ['B', 1, 'T2', 2], ['A', 1, 'TN', 1], ['B', 1, 'TN', 2], ['T2', 1, 'O1', 1], ['TN', 1, 'O2', 1]], fixed(1, 1));
  const want = 0.25 * (5 + 6 + 19 + 20);
  close(r.y(0)[0], want, 1e-12); close(r.y(1)[0], want, 1e-12);
  const p = sim([['C', 'Clock', {}], ['P', 'Prelookup', { BreakpointsData: '[0 2 4]' }], ['I', 'Interpolation', { Table: '[0 4 16]' }], ['O', 'Outport', {}]],
    [['C', 1, 'P', 1], ['P', 1, 'I', 1], ['P', 2, 'I', 2], ['I', 1, 'O', 1]], fixed(4, 1));
  assert.deepEqual(p.y(0), [0, 2, 4, 10, 16]);
});

test('Fcn and Interpreted M Function evaluate expressions of u', () => {
  const r = sim([['C', 'Clock', {}], ['F', 'Fcn', { Expr: 'u(1)^2 + 1' }], ['I', 'InterpretedFunction', { Function: 'cos' }], ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }]],
    [['C', 1, 'F', 1], ['C', 1, 'I', 1], ['F', 1, 'O1', 1], ['I', 1, 'O2', 1]], fixed(2, 0.5));
  close(at(r, 2), 5, 1e-12); close(at(r, 1.5, 1), Math.cos(1.5), 1e-12);
});

test('M Function with a persistent counter and two outputs', () => {
  const script = 'function [y, z] = fcn(u)\n  persistent n\n  if isempty(n)\n    n = 0;\n  end\n  n = n + 1;\n  y = n;\n  z = 2*u;\nend';
  const r = sim([['C', 'DigitalClock', { SampleTime: '1' }], ['M', 'MFunction', { Script: script }], ['O1', 'Outport', {}], ['O2', 'Outport', { Port: '2' }]],
    [['C', 1, 'M', 1], ['M', 1, 'O1', 1], ['M', 2, 'O2', 1]], fixed(4, 1));
  assert.deepEqual(r.y(0), [1, 2, 3, 4, 5]);
  assert.deepEqual(r.y(1), [0, 2, 4, 6, 8]);
});

test('M Function reports script errors as block parameter errors', () => {
  const m = newModel('bad');
  const b = makeBlock(m, 'MFunction', { params: { Script: 'y = u' } }, m.root);
  m.root.blocks.push(b);
  assert.throws(() => compileModel(m, ctx), /function definition/);
});
