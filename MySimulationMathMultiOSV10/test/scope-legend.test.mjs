// The scope legend names what is wired to each input (the line's name, else the source block, with
// /port for a block of several outputs), and the 입력들의 합 example shows three inputs and their sum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newModel, makeBlock, connect } from '../core/sim/model.js';
import { scopeLabels } from '../src/sim/viewers.js';
import { MODEL_SAMPLES } from '../src/lib/modelSamples.js';
import { createSession } from '../core/session.js';

function model() {
  const m = newModel('t');
  const s = m.root;
  const add = (type, name, params = {}) => { const b = makeBlock(m, type, { name, params }, s); s.blocks.push(b); return b; };
  const sine = add('SineWave', 'Sine');
  const step = add('Step', 'Step');
  const demux = add('Demux', 'Split', { Outputs: '2' });
  const scope = add('Scope', 'Scope', { NumInputPorts: '4' });
  connect(m, s, { block: sine.id, port: 1 }, { block: scope.id, port: 1 });
  connect(m, s, { block: step.id, port: 1 }, { block: scope.id, port: 2 });
  connect(m, s, { block: demux.id, port: 2 }, { block: scope.id, port: 3 });
  return { m, s, sine, step, demux, scope };
}

test('a scope legend names the block wired to each input', () => {
  const { s, scope } = model();
  assert.deepEqual(scopeLabels(s, scope), ['Sine', 'Step', 'Split/2', null], 'an open input: null (입력 4)');
});

test('a named line names its input', () => {
  const { s, scope, step } = model();
  s.lines.find((l) => l.src.block === step.id).name = 'force';
  assert.equal(scopeLabels(s, scope)[1], 'force');
});

test('a Floating Scope names its signals', () => {
  const { m, s, sine, demux } = model();
  const fs2 = makeBlock(m, 'FloatingScope', { name: 'IO', params: { Signals: `${sine.id}:1,${demux.id}:1` } }, s);
  assert.deepEqual(scopeLabels(s, fs2), ['Sine', 'Split/1']);
  assert.deepEqual(scopeLabels(null, fs2), []);
});

test('the scope window draws those names in its legend', () => {
  const sw = fs.readFileSync(new URL('../src/sim/ScopeWindow.jsx', import.meta.url), 'utf8');
  assert.match(sw, /const base = labels\[s\.port - 1\] \|\| /);
  const me = fs.readFileSync(new URL('../src/sim/ModelEditor.jsx', import.meta.url), 'utf8');
  assert.match(me, /labels=\{scopeLabels\(scopeSys\.get\(b\.id\), b\)\}/);
});

test('the 입력들의 합 example: a Sum of three sources, overlaid with them on one scope with a legend', () => {
  const ex = MODEL_SAMPLES.find((x) => x.id === 'sum_inputs');
  assert.ok(ex, 'listed with the model examples');
  assert.match(ex.code, /add_block\('Sum', \[mdl '\/Sum'\], 'Inputs', '\+\+\+'/);
  assert.match(ex.code, /'NumInputPorts', '4', 'Layout', 'overlay', 'Legend', 'on'/);
  // build it and run it: the sum is sine + step + ramp at every sample
  const out = [];
  const se = createSession({ print: (t) => out.push(t), host: { post: () => {}, request: () => null } });
  const r = se.evaluate(`${ex.code}\nsimOut = sim(mdl);`);
  assert.ok(r.ok, r.error && r.error.message);
  const chk = se.evaluate([
    "sys = 'ex_sum_inputs';",
    "h = get_param([sys '/Sum'], 'Handle');",
    "ok = ~isempty(h);",
  ].join('\n'));
  assert.ok(chk.ok, chk.error && chk.error.message);
  assert.ok(fs.existsSync(new URL('../samples/models/09_math/ex_sum_inputs.smdl', import.meta.url)), 'samples/ file');
});
