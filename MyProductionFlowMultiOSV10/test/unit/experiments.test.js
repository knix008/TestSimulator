// Sensitivity analysis, multi-parameter optimization (pattern search) and scenario comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestScenarioIndex, gridValues, patternSearch, scenarioDiff, scenarioFrom, sensitivityPlan, tornadoRows } from '../../src/sim/experiments.js';
import { buildSample } from '../../src/sim/samples.js';
import { runModel } from '../../src/sim/engine.js';
import { createRandom } from '../../src/sim/random.js';

test('sensitivity plan: ±percent, integers move by at least 1 and respect min', () => {
  const plan = sensitivityPlan([{ key: 'a', label: 'A', value: 10 }, { key: 'b', label: 'B', value: 2, integer: true, min: 1 }, { key: 'c', label: 'C', value: 1, integer: true, min: 1 }], 20);
  assert.deepEqual([plan[0].low, plan[0].high], [8, 12]);
  assert.deepEqual([plan[1].low, plan[1].high], [1, 3]);
  assert.deepEqual([plan[2].low, plan[2].high], [1, 2]);
  const rows = tornadoRows([{ label: 'A', lowValue: 9, highValue: 11 }, { label: 'B', lowValue: 5, highValue: 20 }], 10);
  assert.equal(rows[0].label, 'B');
  assert.equal(rows[0].swing, 15);
  assert.equal(rows[0].effectLow, -5);
});

test('grid values: from..to by step, no float drift', () => {
  assert.deepEqual(gridValues({ from: 0.1, to: 0.5, step: 0.1 }), [0.1, 0.2, 0.3, 0.4, 0.5]);
  assert.deepEqual(gridValues({ from: 1, to: 4, step: 1 }), [1, 2, 3, 4]);
});

test('pattern search finds the optimum of a 2-D function within the budget', async () => {
  const axes = [gridValues({ from: 0, to: 40, step: 1 }), gridValues({ from: 0, to: 40, step: 1 })];
  const f = ([x, y]) => -((x - 31) ** 2) - 2 * (y - 7) ** 2; // max at (31, 7)
  const rnd = createRandom(3);
  const r = await patternSearch({ axes, evaluate: async (v) => f(v), goal: 'maximize', budget: 120, random: () => rnd.next() });
  assert.deepEqual(r.best.values, [31, 7]);
  assert.ok(r.evaluations <= 120);
  assert.equal(r.space, 41 * 41);
  // Best so far never gets worse.
  for (let i = 1; i < r.history.length; i++) assert.ok(r.history[i].best >= r.history[i - 1].best);
  // Minimize, and a budget larger than the space tries each point once.
  const small = await patternSearch({ axes: [[1, 2, 3]], evaluate: async ([x]) => (x - 2) ** 2, goal: 'minimize', budget: 50 });
  assert.deepEqual(small.best.values, [2]);
  assert.equal(small.evaluations, 3);
});

test('scenarios: KPIs kept, best per KPI, model differences listed', () => {
  const m1 = buildSample('line');
  const r1 = runModel(m1, { seed: 1 }).results;
  const m2 = buildSample('line');
  m2.blocks.find((b) => b.name === 'CNC').props.capacity = 2;
  const r2 = runModel(m2, { seed: 1 }).results;
  const a = scenarioFrom('A', r1, m1); const b = scenarioFrom('B', r2, m2);
  assert.equal(a.values.completed, r1.kpi.completed);
  assert.equal(bestScenarioIndex([a, b], 'throughput'), r2.kpi.throughput > r1.kpi.throughput ? 1 : 0);
  assert.equal(bestScenarioIndex([a, b], 'bottleneckUtil'), -1);
  const diff = scenarioDiff(a, b);
  assert.deepEqual(diff, ['CNC.capacity: 1 → 2']);
});
