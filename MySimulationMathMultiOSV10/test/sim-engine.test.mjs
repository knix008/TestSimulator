// Simulation engine: compiler errors, sample times, solvers and numerical
// accuracy (integrators, transfer functions, state space, discrete delays,
// saturation, zero crossings with a bouncing ball, conditional subsystems,
// Goto/From, buses, algebraic loops, data stores, iterators, logging).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newModel, makeBlock, connect, newSystem } from '../core/sim/model.js';
import { compileModel } from '../core/sim/compile.js';
import { Run } from '../core/sim/runtime.js';
import { makeSolver } from '../core/sim/solvers.js';
import { mockCtx } from './helpers/mockctx.mjs';
import { num } from '../core/value.js';

const ctx = mockCtx();

/** Builds a model: blocks [name, type, params, {variant, system}], lines [src, port, dst, port] (ports may be 'enable' …). */
function build(spec, sys = null, model = null) {
  const m = model || newModel(spec.name || 'm');
  const s = sys || m.root;
  const by = {};
  for (const [name, type, params, opt] of spec.blocks) {
    const b = makeBlock(m, type, { name, params, variant: opt && opt.variant }, s);
    if (opt && opt.inner) { b.system = newSystem(); build(opt.inner, b.system, m); }
    s.blocks.push(b); by[name] = b;
  }
  for (const [a, pa, b, pb] of spec.lines || []) connect(m, s, { block: by[a].id, port: pa }, { block: by[b].id, port: pb });
  if (!sys) Object.assign(m.settings, spec.settings || {});
  return m;
}
function simulate(m, c = ctx) {
  const prog = compileModel(m, c);
  const run = new Run(prog, c).init();
  const out = run.runSync();
  return { out, run, prog, t: Array.from(out.props.tout.re), y: (k = 0) => { const Y = out.props.yout; const N = Y.dims[0]; return Array.from(Y.re.subarray(k * N, (k + 1) * N)); } };
}
const last = (a) => a[a.length - 1];
const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);
const at = (r, k, time) => { const i = r.t.findIndex((x) => x >= time - 1e-12); return r.y(k)[i]; };

test('integrator of a constant is a ramp (variable and fixed step)', () => {
  const spec = { blocks: [['C', 'Constant', { Value: '2' }], ['I', 'Integrator', { InitialCondition: '1' }], ['O', 'Outport']], lines: [['C', 1, 'I', 1], ['I', 1, 'O', 1]], settings: { stopTime: '5' } };
  const r = simulate(build(spec));
  close(last(r.t), 5, 1e-12); close(last(r.y()), 11, 1e-9);
  const f = simulate(build({ ...spec, settings: { stopTime: '5', solverType: 'fixed', solver: 'ode1', fixedStep: '0.5' } }));
  assert.equal(f.t.length, 11);
  close(last(f.y()), 11, 1e-12);
});

test('first-order transfer function matches 1 - exp(-t/tau)', () => {
  const m = build({ blocks: [['S', 'Step', { Time: '0' }], ['G', 'TransferFcn', { Numerator: '1', Denominator: '[0.5 1]' }], ['O', 'Outport']], lines: [['S', 1, 'G', 1], ['G', 1, 'O', 1]], settings: { stopTime: '3', relTol: '1e-8', absTol: '1e-10' } });
  const r = simulate(m);
  let err = 0;
  r.t.forEach((t, i) => { err = Math.max(err, Math.abs(r.y()[i] - (1 - Math.exp(-t / 0.5)))); });
  assert.ok(err < 1e-6, `max error ${err}`);
});

test('second-order transfer function matches the analytic underdamped step response', () => {
  const wn = 2, z = 0.3;
  const m = build({ blocks: [['S', 'Step', { Time: '0' }], ['G', 'TransferFcn', { Numerator: String(wn * wn), Denominator: `[1 ${2 * z * wn} ${wn * wn}]` }], ['O', 'Outport']], lines: [['S', 1, 'G', 1], ['G', 1, 'O', 1]], settings: { stopTime: '8', relTol: '1e-8', absTol: '1e-10' } });
  const r = simulate(m);
  const wd = wn * Math.sqrt(1 - z * z), ph = Math.acos(z);
  const exact = (t) => 1 - Math.exp(-z * wn * t) * Math.sin(wd * t + ph) / Math.sqrt(1 - z * z);
  let err = 0;
  r.t.forEach((t, i) => { err = Math.max(err, Math.abs(r.y()[i] - exact(t))); });
  assert.ok(err < 1e-5, `max error ${err}`);
});

test('every fixed-step solver converges with its expected order on x\' = -x', () => {
  const orders = { ode1: 1, ode2: 2, ode3: 3, ode4: 4, ode5: 5, ode8: 8, ode14x: 2 };
  const f = (t, x, d) => { d[0] = -x[0]; };
  for (const [name, p] of Object.entries(orders)) {
    const err = (h) => { const s = makeSolver(name, 1); let x = Float64Array.of(1); const o = new Float64Array(1); for (let t = 0; t < 1 - 1e-12; t += h) { s.step(f, t, x, h, o); x = Float64Array.from(o); } return Math.abs(x[0] - Math.exp(-1)); };
    const e1 = err(0.25), e2 = err(0.125);
    if (e2 < 1e-13) continue;
    const rate = Math.log2(e1 / e2);
    assert.ok(rate > p - 0.6, `${name}: observed order ${rate.toFixed(2)}, expected ${p}`);
  }
});

test('variable-step solvers (ode45, ode23, ode113, ode15s, ode23s) integrate a stiff-free and a stiff system', () => {
  const mk = (solver, den, stop) => build({ blocks: [['S', 'Step', { Time: '0' }], ['G', 'TransferFcn', { Numerator: '1', Denominator: den }], ['O', 'Outport']], lines: [['S', 1, 'G', 1], ['G', 1, 'O', 1]], settings: { stopTime: stop, solver, relTol: '1e-5', absTol: '1e-8' } });
  for (const s of ['ode45', 'ode23', 'ode113', 'ode15s', 'ode23s']) {
    const r = simulate(mk(s, '[1 1]', '4'));
    close(last(r.y()), 1 - Math.exp(-4), 2e-4, s);
    assert.equal(r.run.solverName, s);
  }
  // stiff: poles at -1 and -1e4; the Rosenbrock solver needs few steps
  const stiff = simulate(mk('ode15s', '[1e-4 1.0001 1]', '5'));
  close(last(stiff.y()), 1 - Math.exp(-5), 1e-3, 'stiff');
  assert.ok(stiff.t.length < 400, `stiff steps ${stiff.t.length}`);
});

test('state-space block reproduces a harmonic oscillator', () => {
  const m = build({ blocks: [['G', 'Ground'], ['P', 'StateSpace', { A: '[0 1; -1 0]', B: '[0; 1]', C: '[1 0]', D: '0', InitialCondition: '[1; 0]' }], ['O', 'Outport']], lines: [['G', 1, 'P', 1], ['P', 1, 'O', 1]], settings: { stopTime: '6.283185307179586', relTol: '1e-9', absTol: '1e-12' } });
  const r = simulate(m);
  close(last(r.y()), 1, 1e-6);
  close(at(r, 0, 0), 1, 1e-12);
});

test('discrete unit delay shifts a counter by one sample', () => {
  const m = build({ blocks: [['K', 'CounterLimited', { uplimit: '100', SampleTime: '1' }], ['D', 'UnitDelay', { InitialCondition: '-1', SampleTime: '1' }], ['O1', 'Outport'], ['O2', 'Outport', { Port: '2' }]], lines: [['K', 1, 'D', 1], ['K', 1, 'O1', 1], ['D', 1, 'O2', 1]], settings: { stopTime: '5', solver: 'discrete' } });
  const r = simulate(m);
  assert.deepEqual(r.t, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(r.y(0), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(r.y(1), [-1, 0, 1, 2, 3, 4]);
  assert.deepEqual(r.prog.rates, [[1, 0]]);
});

test('multirate model: hits at every sample time and held outputs between', () => {
  const m = build({ blocks: [['C', 'Clock'], ['Z1', 'ZeroOrderHold', { SampleTime: '0.5' }], ['Z2', 'ZeroOrderHold', { SampleTime: '0.2' }], ['O1', 'Outport'], ['O2', 'Outport', { Port: '2' }], ['I', 'Integrator'], ['T', 'Terminator']], lines: [['C', 1, 'Z1', 1], ['C', 1, 'Z2', 1], ['Z1', 1, 'O1', 1], ['Z2', 1, 'O2', 1], ['C', 1, 'I', 1], ['I', 1, 'T', 1]], settings: { stopTime: '1' } });
  const r = simulate(m);
  for (const h of [0.2, 0.4, 0.5, 0.6, 0.8, 1]) assert.ok(r.t.some((t) => Math.abs(t - h) < 1e-12), `no step at ${h}`);
  close(at(r, 0, 0.7), 0.5, 1e-12);
  close(at(r, 1, 0.7), 0.6, 1e-12);
  assert.deepEqual(r.prog.rates, [[0.2, 0], [0.5, 0]]);
});

test('saturation clips a sine; step sources are hit exactly (breakpoints)', () => {
  const m = build({ blocks: [['S', 'SineWave', { Amplitude: '2' }], ['L', 'Saturation', { UpperLimit: '1', LowerLimit: '-0.5' }], ['O', 'Outport'], ['St', 'Step', { Time: '1.2345' }], ['O2', 'Outport', { Port: '2' }]], lines: [['S', 1, 'L', 1], ['L', 1, 'O', 1], ['St', 1, 'O2', 1]], settings: { stopTime: '10' } });
  const r = simulate(m);
  assert.ok(Math.max(...r.y(0)) <= 1 && Math.min(...r.y(0)) >= -0.5);
  close(Math.max(...r.y(0)), 1, 1e-12);
  assert.ok(r.t.some((t) => t === 1.2345), 'the step time is a major step');
  close(at(r, 1, 1.2345), 1, 0);
});

test('bouncing ball: zero crossings locate the impacts (reset integrator with state port)', () => {
  const m = newModel('ball');
  const s = m.root;
  const add = (name, type, params) => { const b = makeBlock(m, type, { name, params }, s); s.blocks.push(b); return b; };
  const g = add('g', 'Constant', { Value: '-9.81' });
  const v = add('v', 'Integrator', { InitialCondition: '0', ExternalReset: 'falling', InitialConditionSource: 'external', ShowStatePort: 'on' });
  const k = add('k', 'Gain', { Gain: '-0.8' });
  const x = add('x', 'Integrator', { InitialCondition: '10' });
  const o = add('o', 'Outport');
  const o2 = add('o2', 'Outport', { Port: '2' });
  connect(m, s, { block: g.id, port: 1 }, { block: v.id, port: 1 });
  connect(m, s, { block: v.id, port: 2 }, { block: k.id, port: 1 });
  connect(m, s, { block: k.id, port: 1 }, { block: v.id, port: 3 });
  connect(m, s, { block: v.id, port: 1 }, { block: x.id, port: 1 });
  connect(m, s, { block: x.id, port: 1 }, { block: v.id, port: 2 });
  connect(m, s, { block: x.id, port: 1 }, { block: o.id, port: 1 });
  connect(m, s, { block: v.id, port: 1 }, { block: o2.id, port: 1 });
  Object.assign(m.settings, { stopTime: '5', relTol: '1e-8', absTol: '1e-10' });
  const r = simulate(m);
  const pos = r.y(0), vel = r.y(1);
  const t1 = Math.sqrt(2 * 10 / 9.81), v1 = 9.81 * t1, t2 = t1 + 2 * 0.8 * v1 / 9.81;
  assert.ok(Math.min(...pos) > -1e-6, `the ball went below the floor: ${Math.min(...pos)}`);
  const jumps = [];
  for (let i = 1; i < vel.length; i++) if (vel[i] - vel[i - 1] > 5) jumps.push(r.t[i]);
  assert.equal(jumps.length, 2, `impacts ${jumps}`);
  close(jumps[0], t1, 1e-6, 'first impact'); close(jumps[1], t2, 1e-5, 'second impact');
  const after = pos.filter((p, i) => r.t[i] > t1 && r.t[i] < t2);
  close(Math.max(...after), (0.8 * v1) ** 2 / (2 * 9.81), 0.02, 'bounce height');
  const k1 = r.t.findIndex((t) => t >= jumps[0]);
  close(vel[k1], 0.8 * v1, 1e-4, 'rebound velocity');
});

test('enabled subsystem integrates only while enabled, held output and reset states', () => {
  const inner = { blocks: [['In1', 'Inport', { Port: '1' }], ['E', 'EnablePort', { StatesWhenEnabling: 'held' }], ['I', 'Integrator'], ['Out1', 'Outport', { Port: '1' }]], lines: [['In1', 1, 'I', 1], ['I', 1, 'Out1', 1]] };
  const m = build({ blocks: [['C', 'Constant', { Value: '1' }], ['P', 'PulseGenerator', { Period: '2', PulseWidth: '50', Amplitude: '1' }], ['Sub', 'Subsystem', {}, { inner }], ['O', 'Outport']], lines: [['C', 1, 'Sub', 1], ['P', 1, 'Sub', 'enable'], ['Sub', 1, 'O', 1]], settings: { stopTime: '4', relTol: '1e-8' } });
  const r = simulate(m);
  r.t.forEach((t, i) => { const want = t <= 1 ? t : t <= 2 ? 1 : t <= 3 ? t - 1 : 2; close(r.y()[i], want, 1e-6, ); });
  close(last(r.y()), 2, 1e-6);
  assert.equal(r.prog.groups.length, 1);
});

test('triggered subsystem samples its input at rising edges', () => {
  const inner = { blocks: [['In1', 'Inport', { Port: '1' }], ['T', 'TriggerPort', { TriggerType: 'rising' }], ['Out1', 'Outport', { Port: '1' }]], lines: [['In1', 1, 'Out1', 1]] };
  const m = build({ blocks: [['C', 'Clock'], ['P', 'PulseGenerator', { Period: '1', PulseWidth: '50', PhaseDelay: '0.25' }], ['Sub', 'Subsystem', {}, { inner }], ['O', 'Outport']], lines: [['C', 1, 'Sub', 1], ['P', 1, 'Sub', 'trigger'], ['Sub', 1, 'O', 1]], settings: { stopTime: '3' } });
  const r = simulate(m);
  close(at(r, 0, 0.2), 0, 0); close(at(r, 0, 1.0), 0.25, 1e-9); close(at(r, 0, 2.0), 1.25, 1e-9); close(last(r.y()), 2.25, 1e-9);
});

test('if / action subsystems with merge choose the branch per step', () => {
  const branch = (gain) => ({ blocks: [['In1', 'Inport', { Port: '1' }], ['A', 'ActionPort'], ['K', 'Gain', { Gain: gain }], ['Out1', 'Outport', { Port: '1' }]], lines: [['In1', 1, 'K', 1], ['K', 1, 'Out1', 1]] });
  const m = build({
    blocks: [['S', 'SineWave'], ['If', 'If', { IfExpression: 'u1 > 0' }], ['Pos', 'Subsystem', {}, { inner: branch('10') }], ['Neg', 'Subsystem', {}, { inner: branch('-1') }], ['M', 'Merge'], ['O', 'Outport']],
    lines: [['S', 1, 'If', 1], ['If', 1, 'Pos', 'action'], ['If', 2, 'Neg', 'action'], ['S', 1, 'Pos', 1], ['S', 1, 'Neg', 1], ['Pos', 1, 'M', 1], ['Neg', 1, 'M', 2], ['M', 1, 'O', 1]],
    settings: { stopTime: '6', maxStep: '0.05' },
  });
  const r = simulate(m);
  r.t.forEach((t, i) => { const s = Math.sin(t); if (Math.abs(s) > 1e-6) close(r.y()[i], s > 0 ? 10 * s : -s, 1e-9, `t=${t}`); });
});

test('Goto / From, Mux / Demux and buses route signals', () => {
  const m = build({
    blocks: [['A', 'Constant', { Value: '[1 2]' }], ['B', 'Constant', { Value: '5' }], ['G', 'Goto', { GotoTag: 'x' }], ['F', 'From', { GotoTag: 'x' }], ['Mx', 'Mux', { Inputs: '2' }], ['Dm', 'Demux', { Outputs: '[2 1]' }],
      ['BC', 'BusCreator', { Inputs: '2', SignalNames: 'pair,five' }], ['BS', 'BusSelector', { OutputSignals: 'five,pair' }], ['O1', 'Outport'], ['O2', 'Outport', { Port: '2' }], ['O3', 'Outport', { Port: '3' }], ['T1', 'Terminator'], ['T2', 'Terminator']],
    lines: [['A', 1, 'G', 1], ['F', 1, 'Mx', 1], ['B', 1, 'Mx', 2], ['Mx', 1, 'Dm', 1], ['Dm', 2, 'O1', 1], ['Dm', 1, 'T1', 1], ['F', 1, 'BC', 1], ['B', 1, 'BC', 2], ['BC', 1, 'BS', 1], ['BS', 1, 'O2', 1], ['BS', 2, 'O3', 1], ['Mx', 1, 'T2', 1]],
    settings: { stopTime: '1' },
  });
  const r = simulate(m);
  const Y = r.out.props.yout;
  assert.equal(Y.dims[1], 4);
  const row = [0, 1, 2, 3].map((j) => Y.re[j * Y.dims[0]]);
  assert.deepEqual(row, [5, 5, 1, 2]);
});

test('algebraic loops: error setting raises, default setting solves by Newton iteration', () => {
  const spec = { blocks: [['C', 'Constant', { Value: '1' }], ['S', 'Sum', { Inputs: '+-' }], ['K', 'Gain', { Gain: '0.5' }], ['O', 'Outport']], lines: [['C', 1, 'S', 1], ['K', 1, 'S', 2], ['S', 1, 'K', 1], ['S', 1, 'O', 1]] };
  assert.throws(() => compileModel(build({ ...spec, settings: { algebraicLoop: 'error' } }), ctx), (e) => e.identifier === 'sim:compile:algebraicLoop' && /Algebraic loop/.test(e.message));
  const r = simulate(build({ ...spec, settings: { algebraicLoop: 'warning', stopTime: '1' } }));
  close(last(r.y()), 2 / 3, 1e-10);
  assert.ok(r.run.diags.some((d) => /Algebraic loop/.test(d.message)));
  // a delay in the loop breaks it
  const ok = compileModel(build({ blocks: [['C', 'Constant'], ['S', 'Sum', { Inputs: '+-' }], ['D', 'UnitDelay', { SampleTime: '1' }], ['O', 'Outport']], lines: [['C', 1, 'S', 1], ['D', 1, 'S', 2], ['S', 1, 'D', 1], ['S', 1, 'O', 1]], settings: { algebraicLoop: 'error' } }), ctx);
  assert.equal(ok.plan.filter((p) => p.kind === 'loop').length, 0);
});

test('compile errors name the block: unknown type, missing Goto, bad parameter, double driver', () => {
  const m = build({ blocks: [['F', 'From', { GotoTag: 'nope' }], ['O', 'Outport']], lines: [['F', 1, 'O', 1]] });
  assert.throws(() => compileModel(m, ctx), (e) => e.identifier === 'sim:compile:noGoto' && e.block === m.root.blocks[0].id);
  const m2 = build({ blocks: [['K', 'Gain', { Gain: 'undefinedVariable123' }], ['C', 'Constant'], ['O', 'Outport']], lines: [['C', 1, 'K', 1], ['K', 1, 'O', 1]] });
  assert.throws(() => compileModel(m2, ctx), (e) => e.identifier === 'sim:param:eval' && /Gain/.test(e.message) && e.block === m2.root.blocks[0].id);
  const m3 = build({ blocks: [['C', 'Constant'], ['O', 'Outport']], lines: [['C', 1, 'O', 1]] });
  m3.root.blocks[0].type = 'NoSuchBlock';
  assert.throws(() => compileModel(m3, ctx), (e) => e.identifier === 'sim:compile:unknownBlock');
  const m4 = build({ blocks: [['A', 'Constant'], ['B', 'Constant'], ['O', 'Outport']], lines: [['A', 1, 'O', 1]] });
  m4.root.lines.push({ id: 'l99', src: { block: m4.root.blocks[1].id, port: 1 }, points: [], dst: { block: m4.root.blocks[2].id, port: 1 }, branches: [], name: '', log: false });
  assert.throws(() => compileModel(m4, ctx), (e) => e.identifier === 'sim:compile:multipleDrivers');
});

test('unconnected inputs read zero and give a warning', () => {
  const m = build({ blocks: [['K', 'Gain', { Gain: '3' }], ['O', 'Outport']], lines: [['K', 1, 'O', 1]], settings: { stopTime: '1' } });
  const r = simulate(m);
  assert.equal(last(r.y()), 0);
  assert.ok(r.run.diags.some((d) => /not connected/.test(d.message)));
});

test('model workspace and base workspace variables are used in parameters', () => {
  const c = mockCtx();
  c.setVar('Kbase', num(4));
  const m = build({ blocks: [['C', 'Constant', { Value: 'Kbase * Kmodel' }], ['O', 'Outport']], lines: [['C', 1, 'O', 1]], settings: { stopTime: '1' } });
  m.workspace = [{ name: 'Kmodel', value: '2.5' }];
  const r = simulate(m, c);
  assert.equal(last(r.y()), 10);
});

test('To Workspace, signal logging and the state output', () => {
  const m = build({ blocks: [['C', 'Clock'], ['W', 'ToWorkspace', { VariableName: 'clk', SaveFormat: 'Array' }], ['I', 'Integrator'], ['T', 'Terminator']], lines: [['C', 1, 'W', 1], ['C', 1, 'I', 1], ['I', 1, 'T', 1]], settings: { stopTime: '2', saveState: 'on' } });
  m.root.lines.find((l) => l.src.block === m.root.blocks[2].id).log = true;
  m.root.lines.find((l) => l.src.block === m.root.blocks[2].id).name = 'area';
  const r = simulate(m);
  const p = r.out.props;
  assert.equal(p.clk.dims[1], 1);
  assert.equal(p.clk.re[p.clk.re.length - 1], 2);
  const area = p.logsout.data[0].area.data[0];
  close(area.Data.re[area.Data.re.length - 1], 2, 1e-9);
  close(p.xout.re[p.xout.re.length - 1], 2, 1e-9);
  assert.equal(p.SimulationMetadata.data[0].ModelName.cls, 'char');
});

test('data store, for-iterator subsystem and stop simulation block', () => {
  const iter = { blocks: [['It', 'ForIterator', { NumberOfIterations: '4' }], ['Acc', 'Sum', { Inputs: '++' }], ['D', 'Memory'], ['Out1', 'Outport', { Port: '1' }]], lines: [['It', 1, 'Acc', 1], ['D', 1, 'Acc', 2], ['Acc', 1, 'D', 1], ['Acc', 1, 'Out1', 1]] };
  const m = build({
    blocks: [['Loop', 'Subsystem', {}, { inner: iter }], ['O', 'Outport'], ['DSM', 'DataStoreMemory', { DataStoreName: 'A', InitialValue: '7' }], ['R', 'DataStoreRead', { DataStoreName: 'A' }], ['O2', 'Outport', { Port: '2' }],
      ['C', 'Clock'], ['Cmp', 'CompareToConstant', { relop: '>=', const: '0.5' }], ['Stop', 'StopSimulation']],
    lines: [['Loop', 1, 'O', 1], ['R', 1, 'O2', 1], ['C', 1, 'Cmp', 1], ['Cmp', 1, 'Stop', 1]],
    settings: { stopTime: '10', solverType: 'fixed', solver: 'ode1', fixedStep: '0.1' },
  });
  const r = simulate(m);
  close(last(r.t), 0.5, 1e-12, 'stopped');
  assert.equal(r.y(0)[0], 10, '1+2+3+4 in the first step');
  assert.equal(r.y(1)[0], 7);
});

test('transport delay shifts a ramp', () => {
  const m = build({ blocks: [['R', 'Ramp', { slope: '1' }], ['D', 'TransportDelay', { DelayTime: '0.5', InitialOutput: '-1' }], ['O', 'Outport']], lines: [['R', 1, 'D', 1], ['D', 1, 'O', 1]], settings: { stopTime: '3', maxStep: '0.01' } });
  const r = simulate(m);
  close(at(r, 0, 0.25), -1, 0); close(at(r, 0, 2), 1.5, 1e-9); close(last(r.y()), 2.5, 1e-9);
});

test('PID controller closes a loop around a first-order plant', () => {
  const m = build({ blocks: [['R', 'Step', { Time: '0' }], ['E', 'Sum', { Inputs: '+-' }], ['C', 'PIDController', { P: '2', I: '1', D: '0' }], ['G', 'TransferFcn', { Denominator: '[1 1]' }], ['O', 'Outport']], lines: [['R', 1, 'E', 1], ['G', 1, 'E', 2], ['E', 1, 'C', 1], ['C', 1, 'G', 1], ['G', 1, 'O', 1]], settings: { stopTime: '20' } });
  const r = simulate(m);
  close(last(r.y()), 1, 1e-3);
});

test('compiled port widths and sample-time rates for the editor', () => {
  const m = build({ blocks: [['C', 'Constant', { Value: '[1 2 3]' }], ['K', 'Gain', { Gain: '2' }], ['Z', 'ZeroOrderHold', { SampleTime: '0.1' }], ['O', 'Outport']], lines: [['C', 1, 'K', 1], ['K', 1, 'Z', 1], ['Z', 1, 'O', 1]] });
  const run = new Run(compileModel(m, ctx), ctx).init();
  const info = run.compiledInfo();
  const [c, k, z] = m.root.blocks;
  assert.equal(info.ports[`${c.id}:1`].width, 3);
  assert.equal(info.ports[`${k.id}:1`].width, 3);
  assert.equal(info.blocks[c.id].rate, 'const');
  assert.equal(info.blocks[z.id].rate, 1);
  assert.deepEqual(info.ports[`${z.id}:1`].ts, [0.1, 0]);
});
