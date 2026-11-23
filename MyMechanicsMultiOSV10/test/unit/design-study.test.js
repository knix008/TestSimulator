// Design study engine (src/cad/design-study.js) on analytic "parts": a beam W × H whose mass is W·H and whose stress
// is 6 M / (W H²). Scenarios, a full grid, and the optimiser finding the lightest beam under a stress limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedValues, gridOf, feasibility, objective, runDesignStudy, designStudyCsv } from '../../src/cad/design-study.js';

const beam = async ({ W, H }) => ({ ok: true, sensors: { mass: W * H, stress: (6 * 1e5) / (W * H * H) } });

test('allowed values: a range on its step (the end kept), a discrete list as given', () => {
  assert.deepEqual(allowedValues({ kind: 'range', min: 10, max: 20, step: 3 }), [10, 13, 16, 19, 20]);
  assert.deepEqual(allowedValues({ kind: 'range', min: 0.1, max: 0.3, step: 0.1 }), [0.1, 0.2, 0.3]);
  assert.deepEqual(allowedValues({ kind: 'discrete', values: ['6', 8, 'x', 10] }), [6, 8, 10]);
  assert.equal(gridOf([{ name: 'A', kind: 'range', min: 0, max: 9, step: 1 }, { name: 'B', kind: 'range', min: 0, max: 99, step: 1 }], 400), null, 'too many');
  assert.equal(gridOf([{ name: 'A', kind: 'discrete', values: [1, 2] }, { name: 'B', kind: 'discrete', values: [3, 4, 5] }]).length, 6);
});

test('feasibility and the objective: an infeasible design never beats a feasible one', () => {
  const cons = [{ sensor: 'stress', op: '<=', value: 100 }];
  assert.deepEqual(feasibility({ stress: 90 }, cons), { feasible: true, miss: 0 });
  assert.ok(Math.abs(feasibility({ stress: 110 }, cons).miss - 0.1) < 1e-12);
  const good = objective({ mass: 500, stress: 99 }, { sensor: 'mass', sense: 'min' }, cons).value;
  const bad = objective({ mass: 10, stress: 101 }, { sensor: 'mass', sense: 'min' }, cons).value;
  assert.ok(bad > good);
  assert.equal(objective({ mass: 7 }, { sensor: 'mass', sense: 'target', value: 10 }).value, 3);
  assert.equal(objective({ mass: 7 }, { sensor: 'mass', sense: 'max' }).value, -7);
});

test('what-if scenarios and a grid: every design evaluated once, the best feasible one marked', async () => {
  const s = await runDesignStudy({ variables: [{ name: 'W', kind: 'discrete', values: [10, 20] }, { name: 'H', kind: 'discrete', values: [20, 40] }], method: 'whatif', scenarios: [{ name: 'A', values: { W: 10, H: 20 } }, { name: 'B', values: { W: 20, H: 40 } }], evaluate: beam });
  assert.deepEqual(s.rows.map((r) => [r.name, r.sensors.mass]), [['A', 200], ['B', 800]]);
  assert.equal(s.best, -1, 'no goal: nothing best');
  let calls = 0;
  const g = await runDesignStudy({ variables: [{ name: 'W', kind: 'range', min: 10, max: 30, step: 10 }, { name: 'H', kind: 'range', min: 20, max: 60, step: 20 }], method: 'grid', goal: { sensor: 'mass', sense: 'min' }, constraints: [{ sensor: 'stress', op: '<=', value: 100 }], evaluate: async (v) => { calls++; return beam(v); } });
  assert.equal(calls, 9); assert.equal(g.rows.length, 9);
  const b = g.rows[g.best];
  assert.ok(b.feasible && b.sensors.stress <= 100);
  for (const r of g.rows) if (r.feasible) assert.ok(r.sensors.mass >= b.sensors.mass, 'the lightest feasible');
});

test('optimise: the lightest beam with stress ≤ 100 — W at its minimum, H just tall enough (W H² ≥ 6000 → H ≥ 34.6)', async () => {
  const r = await runDesignStudy({
    variables: [{ name: 'W', kind: 'range', min: 5, max: 40, step: 5 }, { name: 'H', kind: 'range', min: 20, max: 80, step: 10 }],
    method: 'optimise', goal: { sensor: 'mass', sense: 'min' }, constraints: [{ sensor: 'stress', op: '<=', value: 100 }], start: { W: 30, H: 40 }, maxEvaluations: 120, evaluate: beam,
  });
  const b = r.rows[r.best];
  assert.ok(b.feasible);
  // mass = W·H with W·H² ≥ 6000: at the smallest W (5) the height just meeting the limit, √1200 = 34.64, on the
  // refined step (10 / 16).
  assert.equal(b.values.W, 5);
  assert.ok(b.values.H >= Math.sqrt(1200) && b.values.H <= 36, `H ${b.values.H}`);
  assert.ok(r.evaluations <= 120);
  const csv = designStudyCsv(r, [{ name: 'W' }, { name: 'H' }], ['mass', 'stress']);
  assert.match(csv, /^Design,W,H,mass,stress,Feasible,Best\n/);
  assert.equal((csv.match(/,yes\n/g) ?? []).length, 1, 'one best');
});

test('optimise on a discrete variable and a target goal; a failed rebuild is skipped', async () => {
  const r = await runDesignStudy({
    variables: [{ name: 'N', kind: 'discrete', values: [4, 6, 8, 10, 12] }], method: 'optimise', goal: { sensor: 'area', sense: 'target', value: 64 }, start: { N: 4 },
    evaluate: async ({ N }) => (N === 10 ? { ok: false, error: 'rebuild' } : { ok: true, sensors: { area: N * N } }),
  });
  assert.equal(r.rows[r.best].values.N, 8);
  assert.ok(r.rows.every((x) => x.values.N !== 10 || !x.ok));
});
