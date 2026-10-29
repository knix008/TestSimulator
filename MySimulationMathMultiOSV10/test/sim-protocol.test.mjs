// Editor ↔ engine message protocol (core/sim/PROTOCOL.md): open / new / edit /
// compile / run (chunked) / pause / continue / step / stop / tune / save /
// close, with sim.model, sim.compiled, sim.status, sim.scope, sim.values and
// sim.diagnostic replies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockCtx } from './helpers/mockctx.mjs';
import { createMemoryFs } from '../core/fs-memory.js';
import { newModel, makeBlock, connect } from '../core/sim/model.js';

function harness() {
  const posts = [];
  const waiters = [];
  const host = { post(m) { posts.push(m); for (const w of waiters.slice()) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); } }, request: () => null };
  const ctx = mockCtx({ host, fs: createMemoryFs() });
  const send = (msg) => ctx.dispatch(msg);
  const until = (pred, ms = 5000) => new Promise((resolve, reject) => {
    const hit = posts.find(pred);
    if (hit) { resolve(hit); return; }
    const w = { pred, resolve };
    waiters.push(w);
    setTimeout(() => reject(new Error('timed out waiting for a message')), ms).unref();
  });
  return { ctx, posts, send, until, of: (type) => posts.filter((p) => p.type === type) };
}
function scopeModel(name, stop = '2') {
  const m = newModel(name);
  const s = m.root;
  const add = (type, params) => { const b = makeBlock(m, type, { params }, s); s.blocks.push(b); return b; };
  const sine = add('SineWave'), k = add('Gain', { Gain: '2' }), sc = add('Scope'), d = add('Display'), w = add('ToWorkspace', { VariableName: 'sw', SaveFormat: 'Array' });
  connect(m, s, { block: sine.id, port: 1 }, { block: k.id, port: 1 });
  connect(m, s, { block: k.id, port: 1 }, { block: sc.id, port: 1 });
  connect(m, s, { block: k.id, port: 1 }, { block: d.id, port: 1 });
  connect(m, s, { block: k.id, port: 1 }, { block: w.id, port: 1 });
  m.settings.stopTime = stop;
  return { m, sine, k, sc, d };
}

test('sim.open / sim.new reply with sim.model; sim.edit replaces the engine copy', () => {
  const h = harness();
  h.send({ type: 'sim.open', reqId: 'r1', name: 'alpha' });
  const m1 = h.of('sim.model')[0];
  assert.equal(m1.reqId, 'r1'); assert.equal(m1.reason, 'open'); assert.equal(m1.name, 'alpha'); assert.equal(m1.model.format, 'smdl');
  h.send({ type: 'sim.new', reqId: 'r2' });
  const m2 = h.of('sim.model')[1];
  assert.equal(m2.reqId, 'r2'); assert.notEqual(m2.name, 'alpha');
  const { m } = scopeModel('alpha');
  h.send({ type: 'sim.edit', name: 'alpha', model: m });
  h.send({ type: 'sim.open', reqId: 'r3', name: 'alpha' });
  assert.equal(h.of('sim.model')[2].model.root.blocks.length, 5);
});

test('sim.compile replies with widths, sample times and rates (and errors with the block id)', () => {
  const h = harness();
  const { m, k, sine } = scopeModel('c1');
  h.send({ type: 'sim.compile', reqId: 'c', name: 'c1', model: m });
  const c = h.of('sim.compiled')[0];
  assert.equal(c.ok, true); assert.equal(c.reqId, 'c');
  assert.equal(c.ports[`${k.id}:1`].width, 1);
  assert.equal(c.blocks[sine.id].rate, 0);
  const bad = scopeModel('c2');
  bad.k.params.Gain = 'notDefinedAnywhere';
  h.send({ type: 'sim.compile', reqId: 'd', name: 'c2', model: bad.m });
  const e = h.of('sim.compiled')[1];
  assert.equal(e.ok, false); assert.equal(e.block, bad.k.id); assert.match(e.error, /Gain/);
  assert.ok(h.of('sim.diagnostic').some((d) => d.level === 'error' && d.block === bad.k.id));
});

test('sim.run streams scope data and values, then stops and writes the workspace', async () => {
  const h = harness();
  const { m, sc, d } = scopeModel('r1', '5');
  h.send({ type: 'sim.run', name: 'r1', model: m });
  const done = await h.until((p) => p.type === 'sim.status' && p.state === 'stopped');
  assert.equal(done.time, 5); assert.equal(done.progress, 1);
  const states = h.of('sim.status').map((p) => p.state);
  assert.equal(states[0], 'compiling'); assert.ok(states.includes('running'));
  const scopes = h.of('sim.scope').filter((p) => p.block === sc.id);
  assert.ok(scopes.length >= 1); assert.equal(scopes[0].reset, true);
  const t = scopes.flatMap((p) => p.t);
  const data = scopes.flatMap((p) => p.series[0].data);
  assert.equal(t.length, data.length); assert.equal(t[t.length - 1], 5);
  data.forEach((y, i) => assert.ok(Math.abs(y - 2 * Math.sin(t[i])) < 1e-12));
  const vals = h.of('sim.values').pop();
  assert.ok(Math.abs(vals.displays[d.id][0] - 2 * Math.sin(5)) < 1e-12);
  const out = h.ctx.getVar('out');
  assert.equal(out.cls, 'SimulationOutput');
  assert.ok(out.props.sw.re.length > 10);
});

test('sim.step, sim.pause, sim.continue, sim.tune and sim.stop control a run', async () => {
  const h = harness();
  const { m, k } = scopeModel('r2', 'inf');
  h.send({ type: 'sim.step', name: 'r2', model: m });
  h.send({ type: 'sim.step', name: 'r2' });
  const paused = h.of('sim.status').filter((p) => p.state === 'paused');
  assert.ok(paused.length >= 2);
  assert.ok(paused[paused.length - 1].time > 0);
  h.send({ type: 'sim.tune', name: 'r2', block: k.id, params: { Gain: '-3' } });
  h.send({ type: 'sim.continue', name: 'r2' });
  await h.until((p) => p.type === 'sim.status' && p.state === 'running' && p.time > 1);
  h.send({ type: 'sim.pause', name: 'r2' });
  const p2 = h.of('sim.status').filter((p) => p.state === 'paused').pop();
  const vals = h.of('sim.values').pop();
  const kv = vals.values[`${k.id}:1`][0];
  assert.ok(Math.abs(kv + 3 * Math.sin(p2.time)) < 1e-9, 'the tuned gain is in effect');
  h.send({ type: 'sim.stop', name: 'r2' });
  const st = h.of('sim.status').pop();
  assert.equal(st.state, 'stopped');
  assert.equal(h.ctx.getVar('out').cls, 'SimulationOutput');
});

test('a run error is reported with sim.status error and a diagnostic', async () => {
  const h = harness();
  const m = newModel('bad');
  const s = m.root;
  const c = makeBlock(m, 'Constant', { params: { Value: '[1 2 3]' } }, s); s.blocks.push(c);
  const sel = makeBlock(m, 'Selector', { params: { Indices: '5' } }, s); s.blocks.push(sel);
  const t = makeBlock(m, 'Terminator', {}, s); s.blocks.push(t);
  connect(m, s, { block: c.id, port: 1 }, { block: sel.id, port: 1 });
  connect(m, s, { block: sel.id, port: 1 }, { block: t.id, port: 1 });
  h.send({ type: 'sim.run', name: 'bad', model: m });
  const e = await h.until((p) => p.type === 'sim.status' && p.state === 'error');
  assert.match(e.message, /exceeds/);
  assert.ok(h.of('sim.diagnostic').some((d) => d.block === sel.id));
});

test('sim.save writes .smdl (renaming the model) and sim.open reads it back', () => {
  const h = harness();
  const { m } = scopeModel('s1');
  h.send({ type: 'sim.save', reqId: 'w', name: 's1', path: '/home/plant.smdl', model: m });
  const sv = h.of('sim.saved')[0];
  assert.equal(sv.ok, true); assert.equal(sv.name, 'plant'); assert.equal(sv.oldName, 's1'); assert.equal(sv.path, '/home/plant.smdl');
  h.send({ type: 'sim.close', name: 'plant' });
  h.send({ type: 'sim.open', reqId: 'o', path: '/home/plant.smdl' });
  const mo = h.of('sim.model').pop();
  assert.equal(mo.name, 'plant'); assert.equal(mo.path, '/home/plant.smdl'); assert.equal(mo.model.root.blocks.length, 5);
  h.send({ type: 'sim.open', reqId: 'n', path: '/home/missing.smdl' });
  const nm = h.of('sim.model').pop();
  assert.equal(nm.name, 'missing'); assert.equal(nm.model.root.blocks.length, 0);
  h.send({ type: 'sim.save', reqId: 'x', name: 'nope', path: '/home/x.smdl' });
  assert.equal(h.of('sim.saved').pop().ok, false);
});
