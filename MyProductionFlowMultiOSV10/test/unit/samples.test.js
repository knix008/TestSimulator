// Every template and sample: builds, has no model errors, survives a save/open
// round trip, and runs to the end producing what it is about.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSample, buildTemplate, SAMPLE_GROUPS, SAMPLE_PROJECTS, TEMPLATES } from '../../src/sim/samples.js';
import { checkModel, parseModel, serializeModel } from '../../src/sim/model.js';
import { runModel } from '../../src/sim/engine.js';

test('there are samples in every group, with Korean and English names', () => {
  for (const g of SAMPLE_GROUPS) assert.ok(SAMPLE_PROJECTS.some((s) => s.group === g.id), g.id);
  for (const s of SAMPLE_PROJECTS) { assert.equal(s.ko.length, 2); assert.equal(s.en.length, 2); }
  assert.ok(SAMPLE_PROJECTS.length >= 20);
});

for (const [id] of TEMPLATES) {
  test(`template ${id}: no errors and runs`, () => {
    const m = buildTemplate(id, id);
    const errors = checkModel(m).filter((p) => p.severity === 'error');
    assert.deepEqual(errors, []);
    const { results } = runModel(m, { seed: 1 });
    assert.deepEqual(results.errors, []);
  });
}

for (const s of SAMPLE_PROJECTS) {
  test(`sample ${s.id}: no errors, round trip, runs`, () => {
    const m = buildSample(s.id);
    const errors = checkModel(m).filter((p) => p.severity === 'error');
    assert.deepEqual(errors, [], JSON.stringify(errors));
    const again = parseModel(serializeModel(m));
    assert.equal(again.blocks.length, m.blocks.length);
    assert.equal(again.links.length, m.links.length);
    const { sim, results } = runModel(again, { seed: 3 });
    assert.deepEqual(results.errors, []);
    const hasDe = m.blocks.some((b) => b.type === 'sink');
    if (hasDe) assert.ok(results.kpi.completed > 0, `${s.id}: nothing completed`);
    for (const [name, v] of Object.entries(results.sd)) assert.ok(Number.isFinite(v.value), `${s.id}: ${name} = ${v.value}`);
    assert.ok(sim.series.t.length > 10);
  });
}
