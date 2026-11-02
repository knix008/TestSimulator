// 수식으로 모델 만들기: equations → block diagrams (core/sim/eqmodel.js), the
// M functions eq2model / ode2model / tf2model / ss2model, and the editor's
// dialog pieces (examples, the eq2model command it runs, wiring, strings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseEquations, equationModel, specModel, tfSpec, ssSpec, insertEquationModel } from '../core/sim/eqmodel.js';
import { newModel, makeBlock } from '../core/sim/model.js';
import { compileModel } from '../core/sim/compile.js';
import { Run } from '../core/sim/runtime.js';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import * as simArea from '../core/sim/index.js';
import { mockCtx } from './helpers/mockctx.mjs';
import { EQ_EXAMPLES, eqCommand } from '../src/sim/logic.js';
import { tr } from '../src/sim/i18n.js';

const ctx = mockCtx();
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const close = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);

/** Simulates a model with ode4 at a fixed 1 ms step (outputs exactly at the times asked): t, y(k) of Out port k, at(k, time). */
function simulate(model, settings = {}) {
  Object.assign(model.settings, { solverType: 'fixed', solver: 'ode4', fixedStep: '0.001' }, settings);
  const out = new Run(compileModel(model, ctx), ctx).init().runSync();
  const t = Array.from(out.props.tout.re);
  const Y = out.props.yout;
  const y = (k = 0) => Array.from(Y.re.subarray(k * t.length, (k + 1) * t.length));
  const at = (k, time) => { const i = t.findIndex((x) => x >= time - 1e-9); return y(k)[i]; };
  return { t, y, at };
}
/** Classic RK4 reference for x' = f(t, x). */
function rk4(f, x0, T, n = 20000) {
  let x = x0.slice(); const h = T / n;
  for (let i = 0; i < n; i++) {
    const t = i * h;
    const k1 = f(t, x), k2 = f(t + h / 2, x.map((v, j) => v + h / 2 * k1[j])), k3 = f(t + h / 2, x.map((v, j) => v + h / 2 * k2[j])), k4 = f(t + h, x.map((v, j) => v + h * k3[j]));
    x = x.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  }
  return x;
}
const types = (m) => m.root.blocks.map((b) => b.type).sort();
const block = (m, name) => m.root.blocks.find((b) => b.name === name);
const throwsLine = (text, re, opts) => assert.throws(() => parseEquations(text, opts), (e) => { assert.match(e.message, re); return true; });

// ---------------------------------------------------------------- parsing
test('differential equations: states, orders, parameters, inputs, initial values, outputs', () => {
  const s = parseEquations("% spring\nk = 4; c = 0.5\nx'' = -c*x' - k*x + u\nx(0) = 1\nx'(0) = -2\ny = 2*x");
  assert.equal(s.kind, 'ode');
  assert.deepEqual(s.states.map((x) => [x.name, x.order]), [['x', 2]]);
  assert.deepEqual(s.params.map((p) => p.name), ['k', 'c']);
  assert.deepEqual(s.inputs, ['u']);
  assert.deepEqual(s.init, { 'x:0': '1', 'x:1': '-2' });
  assert.deepEqual(s.outputs, ['y'], 'a definition nothing reads is the output');
  assert.deepEqual(parseEquations("x' = -x").outputs, ['x'], 'no such definition: the states are shown');
});

test("derivative notations: x', dx/dt, d2x/dt2, der(x); implicit products 2x and 2(x + 1)", () => {
  for (const text of ["x'' = -x", 'd2x/dt2 = -x', "der(x') = -x", 'der(der(x)) = -x']) {
    const s = parseEquations(text);
    assert.deepEqual(s.states.map((x) => [x.name, x.order]), [['x', 2]], text);
  }
  assert.deepEqual(parseEquations('dy/dt = -y').states.map((x) => [x.name, x.order]), [['y', 1]]);
  const m = equationModel("x' = -2x + 3(u - 1)").model;
  assert.ok(m.root.blocks.some((b) => b.type === 'Gain' && b.params.Gain === '2'), 'implicit 2x');
});

test('kind detection and explicit kinds', () => {
  assert.equal(parseEquations("x' = 1").kind, 'ode');
  assert.equal(parseEquations('G = 1/(s + 1)').kind, 'tf');
  assert.equal(parseEquations('1/(s + 1)').kind, 'tf');
  assert.equal(parseEquations('A = 1; B = 1; C = 1').kind, 'ss');
  assert.equal(parseEquations('Ts = 0.5; H = 1/(z - 0.5)').kind, 'tf');
  throwsLine('k = 2', /Write differential equations/);
  throwsLine("x' = 1", /State space needs A/, { kind: 'ss' });
  throwsLine('x = 1', /Unknown kind/, { kind: 'zz' });
});

test('errors name the line and the problem', () => {
  throwsLine('', /There are no equations/);
  throwsLine("x' = -x\n\ny' = foo(x)", /^Line 3: Unknown function 'foo'/);
  throwsLine("x' = -x\nx' = 2", /^Line 2: 'x' has two differential equations/);
  throwsLine("x' = u'", /only states .* have derivatives/);
  throwsLine("x' = x''", /higher derivative than its equation/);
  throwsLine("x' = -x\ny(0) = 1", /'y' has no differential equation/);
  throwsLine("x'' = -x\nx''(0) = 1", /given by its equation/);
  throwsLine("x' = a\na = b + 1\nb = 2*a", /algebraic loop/);
  throwsLine("x' = -x +", /^Line 1: The expression is incomplete/);
  throwsLine("x' = (x", /Expected '\)'/);
  throwsLine("x' = x $ 2", /Unexpected character/);
  throwsLine("x' = -x\nx(0) = y\ny = x", /must be a constant/);
  throwsLine('G = s^2/(s + 1)', /improper/);
  throwsLine('G = s/z', /not both/);
  throwsLine('H = 1/(z - 1)', /sample time: Ts/);
  throwsLine('A = [1 2]; B = [1]; C = [1]', /A must be square/);
  throwsLine('A = [1 0; 0 1]; B = [1]; C = [1 0]', /B must have 2 rows/);
  throwsLine('A = [1 2; 3]; B = [1; 1]; C = [1 0]', /rows of A have different lengths/);
});

// ---------------------------------------------------------------- structure
test('a linear right-hand side becomes Gain blocks and a Sum; parameters go to the model workspace', () => {
  const { model, info } = equationModel("k = 4; c = 0.5\nx'' = -c*x' - k*x + u\nx(0) = 1");
  assert.deepEqual(types(model), ['Gain', 'Gain', 'Integrator', 'Integrator', 'Outport', 'Scope', 'Step', 'Sum']);
  assert.equal(block(model, "x'").params.InitialCondition, '0');
  assert.equal(block(model, 'x').params.InitialCondition, '1');
  const sum = model.root.blocks.find((b) => b.type === 'Sum');
  assert.equal(sum.params.Inputs, '--+');
  assert.deepEqual(model.root.blocks.filter((b) => b.type === 'Gain').map((b) => b.params.Gain).sort(), ['c', 'k']);
  assert.deepEqual(model.workspace, [{ name: 'k', value: '4' }, { name: 'c', value: '0.5' }]);
  assert.equal(info.blocks, model.root.blocks.length);
  assert.equal(model.settings.stopTime, '10');
});

test('nonlinear terms become Fcn blocks (through a Mux when they read several signals); constants a Constant', () => {
  const p = equationModel("g = 9.81; L = 1\nth'' = -g/L*sin(th) - 0.2*th' + 1").model;
  const fcn = p.root.blocks.find((b) => b.type === 'Fcn');
  assert.equal(fcn.params.Expr, '-g/L*sin(u(1))');
  assert.ok(p.root.blocks.some((b) => b.type === 'Constant' && b.params.Value === '1'));
  assert.ok(!p.root.blocks.some((b) => b.type === 'Mux'));
  const v = equationModel("x'' = (1 - x^2)*x' - x").model;
  const f2 = v.root.blocks.find((b) => b.type === 'Fcn');
  assert.equal(f2.params.Expr, '(1 - u(1)^2)*u(2)');
  assert.equal(v.root.blocks.find((b) => b.type === 'Mux').params.Inputs, '2');
});

test('t is a Clock; inputs become Step, Sine Wave, Constant or numbered In ports', () => {
  const m = equationModel("x' = -x + sin(t)").model;
  assert.ok(m.root.blocks.some((b) => b.type === 'Clock' && b.name === 't'));
  const kinds = { step: 'Step', sine: 'SineWave', constant: 'Constant', inport: 'Inport' };
  for (const [input, type] of Object.entries(kinds)) {
    const mm = equationModel("x' = a - x + b", { input }).model;
    const src = mm.root.blocks.filter((b) => b.type === type && ['a', 'b'].includes(b.name));
    assert.equal(src.length, 2, input);
    if (type === 'Inport') assert.deepEqual(src.map((b) => b.params.Port).sort(), ['1', '2']);
  }
});

test('generated diagrams: no two blocks overlap and everything starts at the top left', () => {
  for (const x of EQ_EXAMPLES) {
    const { model } = equationModel(x.text);
    const bs = model.root.blocks;
    assert.equal(Math.min(...bs.map((b) => b.x)), 40, x.en);
    assert.equal(Math.min(...bs.map((b) => b.y)), 40, x.en);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${x.en}: ${a.name} overlaps ${b.name}`);
    }
    // every block input is connected
    for (const b of bs) {
      if (['Step', 'SineWave', 'Constant', 'Inport', 'Clock'].includes(b.type)) continue;
      assert.ok(model.root.lines.some((l) => { const hit = (s) => (s.dst && s.dst.block === b.id) || (s.branches || []).some(hit); return hit(l); }), `${x.en}: ${b.name} has an input`);
    }
  }
});

// ---------------------------------------------------------------- numbers
test("x'' = -x, x(0) = 1 is cos(t)", () => {
  const r = simulate(equationModel("x'' = -x\nx(0) = 1").model, { stopTime: '6' });
  for (const t of [1, 2, 3, 4.5, 6]) close(r.at(0, t), Math.cos(t), 1e-5, `t=${t}`);
});

test('first-order lag with a constant input and an output definition: y = 3(1 - exp(-t/tau))', () => {
  const r = simulate(equationModel("tau = 2\nx' = (u - x)/tau\ny = 3*x", { input: 'constant' }).model, { stopTime: '5' });
  for (const t of [0.5, 2, 5]) close(r.at(0, t), 3 * (1 - Math.exp(-t / 2)), 1e-5, `t=${t}`);
});

test('nonlinear pendulum and Van der Pol match an RK4 reference', () => {
  const p = simulate(equationModel(EQ_EXAMPLES[1].text).model, { stopTime: '5' });
  const pr = rk4((t, [a, w]) => [w, -9.81 * Math.sin(a) - 0.2 * w], [1, 0], 5);
  close(p.at(0, 5), pr[0], 1e-4, 'pendulum');
  const v = simulate(equationModel(EQ_EXAMPLES[2].text).model, { stopTime: '4' });
  const vr = rk4((t, [x, w]) => [w, (1 - x * x) * w - x], [2, 0], 4);
  close(v.at(0, 4), vr[0], 1e-4, 'Van der Pol');
});

test('coupled states (Lorenz) match an RK4 reference over a short time', () => {
  const r = simulate(equationModel(EQ_EXAMPLES[3].text).model, { stopTime: '0.5' });
  const ref = rk4((t, [x, y, z]) => [10 * (y - x), x * (28 - z) - y, x * y - 8 / 3 * z], [1, 0, 0], 0.5);
  close(r.at(0, 0.5), ref[0], 1e-4, 'x'); close(r.at(1, 0.5), ref[1], 1e-4, 'y'); close(r.at(2, 0.5), ref[2], 1e-4, 'z');
});

test('transfer functions: coefficients, normalization, composition, discrete', () => {
  const s = parseEquations('G = (s + 1)/(s^2 + 2s + 1)');
  assert.deepEqual([s.tfs[0].num, s.tfs[0].den], [[1, 1], [1, 2, 1]]);
  const n = parseEquations('G = 2/(2*s + 2)');
  assert.deepEqual([n.tfs[0].num, n.tfs[0].den], [[1], [1, 1]], 'denominator made monic');
  const c = parseEquations(EQ_EXAMPLES[6].text);
  assert.deepEqual(c.tfs.map((t) => t.name), ['L'], 'only the final transfer function becomes a block');
  assert.deepEqual([c.tfs[0].num, c.tfs[0].den], [[2, 1], [1, 1, 0]]);
  const w = parseEquations('wn = 2; zeta = 0.3\nG = wn^2/(s^2 + 2*zeta*wn*s + wn^2)');
  assert.deepEqual(w.tfs[0].den, [1, 1.2, 4]);
  const two = parseEquations('G1 = 1/(s + 1)\nG2 = 1/(s + 2)');
  assert.deepEqual(two.tfs.map((t) => t.name), ['G1', 'G2'], 'side by side');
  const d = equationModel(EQ_EXAMPLES[7].text).model;
  const h = d.root.blocks.find((b) => b.type === 'DiscreteTransferFcn');
  assert.deepEqual([h.params.Numerator, h.params.Denominator, h.params.SampleTime], ['0.5', '[1 -0.5]', '0.1']);
  assert.ok(!d.workspace.some((x) => x.name === 'Ts'), 'Ts is the sample time, not a parameter');
});

test('a transfer function and its state space give the same step response', () => {
  const tf = simulate(equationModel('G = 4/(s^2 + s + 4)', { input: 'constant' }).model, { stopTime: '6' });
  const ss = simulate(equationModel('A = [0 1; -4 -1]; B = [0; 1]; C = [4 0]; D = 0', { input: 'constant' }).model, { stopTime: '6' });
  for (const t of [1, 3, 6]) close(tf.at(0, t), ss.at(0, t), 1e-5, `t=${t}`);
  const lag = simulate(equationModel('G = 1/(s + 1)', { input: 'constant' }).model, { stopTime: '3' });
  close(lag.at(0, 3), 1 - Math.exp(-3), 1e-6);
});

test('state space: x0, several inputs through a Mux, discrete with Ts', () => {
  const m = equationModel(EQ_EXAMPLES[8].text).model;
  const sb = m.root.blocks.find((b) => b.type === 'StateSpace');
  assert.deepEqual([sb.params.A, sb.params.B, sb.params.C, sb.params.D, sb.params.InitialCondition], ['[0 1; -4 -1]', '[0; 1]', '[1 0]', '0', '[1; 0]']);
  const r = simulate(m, { stopTime: '0' });
  close(r.y(0)[0], 1, 1e-12, 'y(0) = C x0');
  const two = equationModel('A = -1; B = [1 2]; C = 1').model;
  assert.equal(two.root.blocks.find((b) => b.type === 'Mux').params.Inputs, '2');
  assert.deepEqual(two.root.blocks.filter((b) => b.type === 'Step').map((b) => b.name).sort(), ['u1', 'u2']);
  const d = equationModel('Ts = 0.5; A = 0.5; B = 1; C = 1').model;
  assert.equal(d.root.blocks.find((b) => b.type === 'DiscreteStateSpace').params.SampleTime, '0.5');
});

test('specs from numbers: tfSpec / ssSpec', () => {
  const t = specModel(tfSpec([{ name: 'G', num: [0, 2], den: [2, 4] }]), { name: 'nm' });
  assert.equal(t.model.name, 'nm');
  const g = t.model.root.blocks.find((b) => b.type === 'TransferFcn');
  assert.deepEqual([g.params.Numerator, g.params.Denominator], ['1', '[1 2]']);
  assert.throws(() => ssSpec({ A: [[1, 2], [3, 4]], B: [[1]], C: [[1, 0]] }), /B must have 2 rows/);
  assert.throws(() => specModel(tfSpec([{ name: 'G', num: [1], den: [1] }]), { name: '9bad' }), /not a valid model name/);
});

// ---------------------------------------------------------------- into an existing diagram
test('insertEquationModel: new ids, unique names, below the diagram, parameters merged', () => {
  const host = newModel('host');
  const g = makeBlock(host, 'Gain', { name: 'x', x: 100, y: 100 }, host.root);
  host.root.blocks.push(g);
  host.workspace = [{ name: 'k', value: '1' }, { name: 'z', value: '5' }];
  const built = equationModel("k = 4\nx' = -k*x").model;
  const before = JSON.stringify(built);
  const ids = insertEquationModel(host, host.root, built);
  assert.equal(ids.length, built.root.blocks.length);
  const names = host.root.blocks.map((b) => b.name);
  assert.equal(new Set(names).size, names.length, 'names stay unique');
  assert.equal(new Set(host.root.blocks.map((b) => b.id)).size, host.root.blocks.length, 'ids stay unique');
  const added = host.root.blocks.filter((b) => ids.includes(b.id));
  assert.ok(added.every((b) => b.y > g.y + g.h), 'below what was there');
  assert.ok(host.root.lines.every((l) => host.root.blocks.some((b) => b.id === l.src.block)), 'lines point at the new blocks');
  assert.deepEqual(host.workspace, [{ name: 'k', value: '4' }, { name: 'z', value: '5' }]);
  assert.equal(JSON.stringify(built), before, 'the built model itself is left as it was');
});

// ---------------------------------------------------------------- M functions
function session() {
  const posts = [];
  const s = createSession({ fs: createMemoryFs(), print: () => {}, host: { post: (m) => posts.push(m), request: () => null } });
  return {
    posts,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw new Error(r.error.message); return r; },
    err(code) { const r = s.evaluate(code); assert.equal(r.ok, false, code); return r.error.message; },
    v(name) { const v = s.getVariable(name); return v.cls === 'char' ? String.fromCharCode(...v.re) : v.re.length === 1 ? v.re[0] : Array.from(v.re); },
  };
}

test('eq2model / ode2model build, register and open the model; sim runs it', () => {
  const h = session();
  h.run(`n = eq2model('osc', "x'' = -x; x(0) = 1", 'StopTime', pi); o = sim('osc'); y = o.yout(end);`);
  assert.equal(h.v('n'), 'osc');
  close(h.v('y'), -1, 1e-5);
  assert.ok(h.posts.some((p) => p.type === 'sim.openEditor' && p.name === 'osc'));
  h.run(`ode2model('pend', {"th'' = -g/L*sin(th)", 'g = 9.81', 'L = 1', 'th(0) = 0.5'}, 'Open', 'off'); k = get_param('pend/th', 'InitialCondition');`);
  assert.equal(h.v('k'), '0.5');
  assert.ok(!h.posts.some((p) => p.type === 'sim.openEditor' && p.name === 'pend'), "'Open', 'off'");
  h.run(`ode2model('lor', "x' = 10*(y - x)", "y' = x*(28 - z) - y", "z' = x*y - 8/3*z", 'x(0) = 1', 'Open', 'off', 'Input', 'inport');`);
  h.run(`m = eq2model("x' = -x", 'Open', 'off'); m2 = eq2model("x' = -x", 'Open', 'off');`);
  assert.equal(h.v('m'), 'eqmodel');
  assert.equal(h.v('m2'), 'eqmodel1', 'a free name each time');
  assert.match(h.err(`ode2model('bad', 'G = 1/(s + 1)')`), /Write differential equations/, "ode2model insists on x' = …");
});

test('an existing name is an error unless Overwrite is on', () => {
  const h = session();
  h.run(`eq2model('m', "x' = -x", 'Open', 'off');`);
  assert.match(h.err(`eq2model('m', "x' = 1")`), /already loaded.*Overwrite/);
  h.run(`eq2model('m', "x' = 1", 'Overwrite', 'on', 'Open', 'off'); o = sim('m', 'StopTime', '2'); y = o.yout(end);`);
  close(h.v('y'), 2, 1e-9);
  assert.match(h.err(`eq2model('m', "x' = 1", 'Input', 'noise', 'Overwrite', 'on')`), /Input must be/);
});

test('tf2model / ss2model: numbers, text and tf / ss objects', () => {
  const h = session();
  h.run(`tf2model('a', [1], [1 1], 'Open', 'off', 'Input', 'constant'); o = sim('a', 'StopTime', '3'); y = o.yout(end);`);
  close(h.v('y'), 1 - Math.exp(-3), 1e-5);
  h.run(`tf2model('b', '(s + 1)/(s^2 + 2*s + 1)', 'Open', 'off'); n = get_param('b/G', 'Denominator');`);
  assert.equal(h.v('n'), '[1 2 1]');
  h.run(`tf2model('c', tf([2], [1 3]), 'Open', 'off'); d = get_param('c/G', 'Denominator');`);
  assert.equal(h.v('d'), '[1 3]');
  h.run(`tf2model('dz', [0.5], [1 -0.5], 'Ts', 0.1, 'Open', 'off'); ts = get_param('dz/G', 'SampleTime');`);
  assert.equal(h.v('ts'), '0.1');
  h.run(`ss2model('s1', [0 1; -2 -3], [0; 1], [1 0], 0, 'Open', 'off'); a = get_param('s1/StateSpace', 'A');`);
  assert.equal(h.v('a'), '[0 1; -2 -3]');
  h.run(`ss2model('s2', ss(tf(1, [1 2 1])), 'Open', 'off'); bt = get_param('s2/StateSpace', 'BlockType');`);
  h.run(`ss2model('s3', 'A = -1; B = 1; C = 1; x0 = 2', 'Open', 'off'); ic = get_param('s3/StateSpace', 'InitialCondition');`);
  assert.equal(h.v('ic'), '2');
  assert.match(h.err(`tf2model('e', tf({1, 1}, {[1 1], [1 2]}))`), /one input and one output/);
  assert.match(h.err(`ss2model('e', [1 2], 1, 1)`), /A must be square/);
});

test('the four functions are registered with ko / en help', () => {
  for (const n of ['eq2model', 'ode2model', 'tf2model', 'ss2model']) {
    assert.equal(typeof simArea.builtins[n], 'function', n);
    const hp = simArea.help[n];
    assert.ok(hp && hp.en && hp.ko && hp.syntax.length >= 3, n);
  }
});

// ---------------------------------------------------------------- the dialog
test('every example builds; the dialog command builds the same model in the engine', () => {
  for (const x of EQ_EXAMPLES) assert.doesNotThrow(() => equationModel(x.text), x.en);
  const h = session();
  for (const [i, x] of EQ_EXAMPLES.entries()) {
    const cmd = eqCommand({ name: `ex${i}`, text: x.text, kind: 'auto', input: 'sine', stopTime: '7' });
    h.run(cmd.replace(/\);$/, ", 'Open', 'off');"));
    h.run(`st = get_param('ex${i}', 'StopTime'); nb = numel(find_system('ex${i}', 'SearchDepth', 1)) - 1;`);
    assert.equal(h.v('st'), '7', x.en);
    assert.equal(h.v('nb'), equationModel(x.text, { input: 'sine' }).model.root.blocks.length, `${x.en}: same blocks`);
  }
  assert.equal(eqCommand({ text: "x' = -x\n\nx(0) = 1" }), "eq2model({'x'' = -x', 'x(0) = 1'}, 'Kind', 'auto', 'Input', 'step', 'StopTime', '10');");
});

test('the model editor has the 수식 button and the dialog; icons and strings exist', () => {
  const editor = read('../src/sim/ModelEditor.jsx');
  const dlg = read('../src/sim/EquationDialog.jsx');
  assert.match(editor, /<TB icon="equation" label=\{L\('eq'\)\}/);
  assert.match(editor, /dialog\.kind === 'equation'/);
  assert.match(editor, /insertEquationModel\(mm, s, built\)/);
  assert.match(dlg, /equationModel\(text, \{ kind, input/);
  assert.match(dlg, /engine\.eval\(eqCommand/);
  assert.match(read('../src/sim/icons.jsx'), /^\s{2}equation:/m);
  assert.match(read('../src/components/Chrome.jsx'), /^\s{2}equation:/m);
  const keys = [...dlg.matchAll(/L\('(eq_[a-z_]+)'/g)].map((m) => m[1]).concat(['eq', 'eq_tip', 'eq_kind_auto', 'eq_kind_ode', 'eq_kind_tf', 'eq_kind_ss', 'eq_kind_auto_tip', 'eq_kind_ode_tip', 'eq_kind_tf_tip', 'eq_kind_ss_tip']);
  for (const k of keys) { assert.notEqual(tr('ko', k), k, `ko ${k}`); assert.notEqual(tr('en', k), k, `en ${k}`); }
  assert.equal(tr('ko', 'eq_title'), '수식으로 모델 만들기');
  assert.ok(!/matl[a]b|simul[i]nk/i.test(read('../core/sim/eqmodel.js') + dlg), 'name rule');
});
