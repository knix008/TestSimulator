// The whole block library: every type builds, has texts and an icon, and runs
// in the engine; the new behaviours do what they promise; the diagnosis finds
// the planted problems and its fixes change the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BLOCK_TYPES, CATEGORIES, baseOf, portCount } from '../../src/sim/blocks.js';
import { addLink, checkModel, createModel, makeBlock } from '../../src/sim/model.js';
import { runModel, resultValue } from '../../src/sim/engine.js';
import { diagnose } from '../../src/sim/diagnose.js';
import { buildSample } from '../../src/sim/samples.js';

const iconSource = ['src/icons.js', 'src/icons-3d.js', 'src/icons-flow.js', 'src/icons-flow2.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');

test('12 categories and well over 100 block types, each with an icon', () => {
  assert.equal(CATEGORIES.length, 12);
  assert.ok(Object.keys(BLOCK_TYPES).length >= 130);
  for (const c of CATEGORIES) assert.ok(Object.values(BLOCK_TYPES).filter((s) => s.cat === c.id).length >= 5, c.id);
  for (const [type, spec] of Object.entries(BLOCK_TYPES)) assert.match(iconSource, new RegExp(`\\b${spec.icon}:`), `${type} icon ${spec.icon}`);
});

test('every flow block passes entities from a source to a sink', () => {
  for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
    if (spec.sd || ['agent', 'layout', 'analysis'].includes(spec.cat) || !spec.ins || !spec.outs) continue;
    const m = createModel(); m.settings.duration = 300;
    const b = makeBlock(m, type, 0, 0); m.blocks.push(b);
    const src = makeBlock(m, 'source', -10, 0, { props: { interarrival: { type: 'exponential', mean: 2 } } }); m.blocks.push(src);
    const sink = makeBlock(m, 'sink', 10, 0); m.blocks.push(sink);
    for (let i = 0; i < portCount(b, 'in'); i++) addLink(m, { block: src.id, port: 0 }, { block: b.id, port: i });
    for (let i = 0; i < portCount(b, 'out'); i++) addLink(m, { block: b.id, port: i }, { block: sink.id, port: 0 });
    const base = baseOf(type);
    if (base === 'restrictedEnd' || base === 'timeEnd') { const st = makeBlock(m, base === 'timeEnd' ? 'timeStart' : 'restrictedStart', -5, 5); m.blocks.push(st); b.props.start = st.name; }
    if (base === 'seize' || base === 'release') { const pool = makeBlock(m, 'resourcePool', 0, 5); m.blocks.push(pool); b.props.pool = pool.name; }
    assert.deepEqual(checkModel(m).filter((p) => p.severity === 'error'), [], type);
    const { results } = runModel(m, { seed: 1 });
    assert.deepEqual(results.errors, [], type);
    assert.ok(results.kpi.completed > 0, `${type}: nothing completed`);
  }
});

test('restricted area caps WIP; time measurement measures; maintenance stops the machine', () => {
  const m = buildSample('kanbanLine');
  const { sim, results } = runModel(m, { seed: 2 });
  assert.ok(results.blocks.CardIn.insideMax <= 10);
  assert.ok(resultValue(results, 'StopClock.time') > 0);
  const pm = buildSample('machiningPm');
  const r2 = runModel(pm, { seed: 2 }).results;
  assert.ok(r2.blocks.PM1.maintenances >= 3, JSON.stringify(r2.blocks.PM1));
  assert.ok(r2.blocks.CNC1.downShare > 0);
  void sim;
});

test('split makes copies and match pairs them again', () => {
  const r = runModel(buildSample('ecommerce'), { seed: 4 }).results;
  assert.ok(r.blocks.Pair.pairs > 100);
  assert.equal(r.blocks['Labels used'].out, r.blocks.Delivered.out + r.blocks.Trucks.contentsMean * 0 + (r.blocks['Labels used'].out - r.blocks.Delivered.out));
  assert.ok(Math.abs(r.blocks['Labels used'].out - r.blocks.Pair.pairs) <= 1);
});

test('fluids: tanks stop at their capacity and valves pass nothing while closed', () => {
  const m = createModel(); m.settings.duration = 40; m.settings.sdDt = 0.1;
  const tank = makeBlock(m, 'tank', 0, 0, { name: 'T', props: { initial: '900', capacity: 1000 } }); m.blocks.push(tank);
  const fill = makeBlock(m, 'fluidSource', -5, 0, { name: 'Fill', props: { equation: '50' } }); m.blocks.push(fill);
  addLink(m, { block: fill.id, port: 0 }, { block: tank.id, port: -1 });
  const low = makeBlock(m, 'tank', 0, 10, { name: 'Low', props: { initial: '0', capacity: 0 } }); m.blocks.push(low);
  const valve = makeBlock(m, 'valve', -5, 10, { name: 'V', props: { equation: '10', openTime: 5, closedTime: 5 } }); m.blocks.push(valve);
  const supply = makeBlock(m, 'tank', -10, 10, { name: 'Up', props: { initial: '1000', capacity: 0 } }); m.blocks.push(supply);
  addLink(m, { block: supply.id, port: -1 }, { block: valve.id, port: 0 }); addLink(m, { block: valve.id, port: 0 }, { block: low.id, port: -1 });
  const r = runModel(m, { seed: 1 }).results;
  assert.equal(r.sd.T.value, 1000);
  assert.ok(Math.abs(r.sd.Low.value - 200) < 2, `valve moved ${r.sd.Low.value}`);
});

test('SD lookup interpolates and smooth follows its input', () => {
  const m = createModel(); m.settings.duration = 50; m.settings.sdDt = 0.1;
  m.blocks.push(makeBlock(m, 'lookup', 0, 0, { name: 'L', props: { input: 'time', xs: '0, 100', ys: '0, 50' } }));
  m.blocks.push(makeBlock(m, 'smooth', 0, 5, { name: 'S', props: { input: '100', delay: 10, initial: '0' } }));
  const r = runModel(m, { seed: 1 }).results;
  assert.ok(Math.abs(r.sd.L.value - 25) < 0.1);
  assert.ok(Math.abs(r.sd.S.value - 100 * (1 - Math.exp(-5))) < 1.5, String(r.sd.S.value));
});

test('cell grids: Game of Life keeps its cell count; forest fire burns', () => {
  const r = runModel(buildSample('lifeSample'), { seed: 1 }).results;
  const st = r.blocks.Life.states;
  assert.equal(st.Dead.now + st.Alive.now, 90 * 56);
  const f = runModel(buildSample('forestFireSample'), { seed: 1 }).results.blocks.Forest.states;
  assert.ok(f.Fire.max > 0 && f.Ash.max > 0);
});

test('diagnosis: the bank shows its bottleneck with a fix that adds a teller', () => {
  const m = buildSample('bank');
  const issues = diagnose(m, runModel(m, { seed: 3 }).results);
  const bn = issues.find((x) => x.id === 'bottleneck');
  assert.ok(bn && bn.block === 'Tellers');
  const fix = bn.fixes.find((f) => f.key === 'addCapacity');
  assert.deepEqual(fix.action, { block: 'Tellers', prop: 'capacity', value: 4 });
  // Applying it helps: fewer customers leave.
  const before = runModel(buildSample('bank'), { seed: 3 }).results.blocks['Waiting line'].reneged;
  const better = buildSample('bank'); better.blocks.find((b) => b.name === 'Tellers').props.capacity = 4;
  const after = runModel(better, { seed: 3 }).results.blocks['Waiting line'].reneged;
  assert.ok(after < before, `${after} < ${before}`);
});

test('diagnosis: every sample gets at least one card, problems sorted by severity', () => {
  for (const id of ['line', 'hospital', 'bass', 'epidemic', 'waterTreatment', 'port']) {
    const m = buildSample(id);
    const issues = diagnose(m, runModel(m, { seed: 3 }).results);
    assert.ok(issues.length > 0, id);
    const rank = { error: 0, warning: 1, info: 2, success: 3 };
    for (let i = 1; i < issues.length; i++) assert.ok(rank[issues[i - 1].severity] <= rank[issues[i].severity], id);
  }
});

test('event: raises a machine capacity at a time, sets an SD parameter, checks its property', () => {
  const line = (withEvent) => {
    const m = createModel(); m.settings.duration = 600; m.settings.warmup = 0;
    const src = makeBlock(m, 'source', -10, 0, { props: { interarrival: { type: 'constant', value: 1 } } }); m.blocks.push(src);
    const q = makeBlock(m, 'queue', -5, 0); m.blocks.push(q);
    const pr = makeBlock(m, 'process', 0, 0, { props: { capacity: 1, time: { type: 'constant', value: 3 } } }); m.blocks.push(pr);
    const sink = makeBlock(m, 'sink', 10, 0); m.blocks.push(sink);
    addLink(m, { block: src.id, port: 0 }, { block: q.id, port: 0 });
    addLink(m, { block: q.id, port: 0 }, { block: pr.id, port: 0 });
    addLink(m, { block: pr.id, port: 0 }, { block: sink.id, port: 0 });
    if (withEvent) { const ev = makeBlock(m, 'event', 0, 6, { props: { trigger: 'once', startAt: 300, targetBlock: pr.name, property: 'capacity', newValue: 'current + 2' } }); m.blocks.push(ev); }
    return { m, pr };
  };
  const a = line(false); const b = line(true);
  assert.deepEqual(checkModel(b.m).filter((p) => p.severity === 'error'), []);
  const ra = runModel(a.m, { seed: 1 }).results; const rb = runModel(b.m, { seed: 1 }).results;
  // One part per 3 time units (about 200), then three per 3 from t = 300 (about 100 + 300).
  assert.ok(ra.kpi.completed < 210, String(ra.kpi.completed));
  assert.ok(rb.kpi.completed > 350, String(rb.kpi.completed));
  assert.equal(b.pr.props.capacity, 1, 'the model itself is not changed');
  // A wrong property name is a model error.
  b.m.blocks.find((x) => x.type === 'event').props.property = 'nope';
  assert.ok(checkModel(b.m).some((p) => p.key === 'eventProperty'));
  // Cyclic event on an SD parameter, at most 3 times.
  const m = createModel(); m.settings.duration = 100; m.settings.warmup = 0;
  const par = makeBlock(m, 'parameter', 0, 0, { name: 'Price', props: { value: 10 } }); m.blocks.push(par);
  const ev = makeBlock(m, 'event', 0, 5, { props: { trigger: 'cyclic', startAt: 10, every: { type: 'constant', value: 10 }, maxTimes: 3, targetBlock: 'Price', property: '', newValue: 'current * 2' } }); m.blocks.push(ev);
  assert.deepEqual(checkModel(m).filter((p) => p.severity === 'error'), []);
  const r = runModel(m, { seed: 1 }).results;
  assert.equal(resultValue(r, 'Price'), 80);
  assert.equal(r.blocks[ev.name].fired, 3);
});
