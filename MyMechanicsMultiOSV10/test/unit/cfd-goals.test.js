// Flow goals and parametric studies (cad/cfd/goals.js): global, surface and volume goals from a flow result,
// whether a goal has settled, stopping a steady run when its goals settle, and a parametric sweep of the velocity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { flowStudy } from '../../src/cad/cfd/lbm.js';
import { evaluateGoals, goalValue, surfaceGoal, volumeGoal, parameterValues, parametricStudy, parametricCsv, goalSettled } from '../../src/cad/cfd/goals.js';
import { boxMesh } from './fem-shapes.js';

const mesh = boxMesh(20, 20, 20, 2);
const run = (velocity, time = { mode: 'steady', maxSteps: 3000 }) => flowStudy(mesh, { mode: 'external', axis: 'x', velocity, fluid: 'water', resolution: 8, time });
const base = run(0.0025);

test('global goals are the study’s own numbers', () => {
  assert.equal(base.ok, true, base.error);
  const rows = evaluateGoals(base, mesh, [{ kind: 'global', id: 'drag' }, { kind: 'global', id: 'cd' }, { kind: 'global', id: 'vmax' }]);
  assert.equal(rows[0].value, base.dragForce); assert.equal(rows[1].value, base.dragCoefficient); assert.equal(rows[2].value, base.maxVelocity);
  assert.equal(rows[0].unit, 'N');
});

test('surface goals: the front face is pushed (positive mean pressure, force downstream), the back one pulled; the faces’ pressure forces add up near the drag', () => {
  // boxMesh faces: 0 x = 0 (front, facing the flow), 1 x = 20 (back).
  const pf = surfaceGoal(base, mesh, [0], 'pAvg'), pb = surfaceGoal(base, mesh, [1], 'pAvg');
  assert.ok(pf > 0 && pb < 0, `front ${pf}, back ${pb}`);
  assert.ok(surfaceGoal(base, mesh, [0], 'pMax') >= pf && surfaceGoal(base, mesh, [0], 'pMin') <= pf);
  const fFront = surfaceGoal(base, mesh, [0], 'fFlow'), fBack = surfaceGoal(base, mesh, [1], 'fFlow');
  assert.ok(fFront > 0 && fBack > 0, `${fFront} ${fBack}`);
  // Pressure drag is a good part of a block's drag at Re 50 (the rest is friction on its sides).
  const all = surfaceGoal(base, mesh, [0, 1, 2, 3, 4, 5], 'fFlow');
  assert.ok(all > 0.2 * base.dragForce && all < 1.3 * base.dragForce, `pressure ${all} vs drag ${base.dragForce}`);
});

test('volume goals: far upstream the mean speed is the inlet speed and the largest is above it beside the block', () => {
  const lo = base.origin, h = base.h;
  const up = volumeGoal(base, { lo: [lo[0] + h, -40, -40], hi: [lo[0] + 4 * h, 60, 60] }, 'vAvg');
  assert.ok(Math.abs(up - 0.0025) < 0.15 * 0.0025, `upstream ${up}`);
  const beside = volumeGoal(base, { lo: [0, -20, -20], hi: [20, 40, 40] }, 'vMax');
  assert.ok(beside > 0.0025, `beside ${beside}`);
  assert.equal(volumeGoal(base, { lo: [5, 5, 5], hi: [15, 15, 15] }, 'vAvg'), null); // inside the block: no fluid
});

test('goals settle: the drag history’s spread; stopping on settled goals takes fewer steps and a drag close to the full run', () => {
  const s = goalSettled(base, { kind: 'global', id: 'drag' }, { tol: 0.02 });
  assert.ok(s.drift != null && s.settled, `drift ${s.drift}, spread ${s.spread}`);
  // The field alone never settles here within 8000 steps (the wake keeps moving); on its drag the run stops early.
  const quick = run(0.0025, { mode: 'steady', maxSteps: 8000, goalTol: 0.005 });
  assert.ok(quick.converged && quick.steps < 4000, `${quick.steps} steps, converged ${quick.converged}`);
  assert.ok(Math.abs(quick.dragForce - base.dragForce) < 0.05 * base.dragForce, `${quick.dragForce} vs ${base.dragForce}`);
});

test('parametric study: drag over three inlet velocities grows faster than linearly; CSV table', async () => {
  const values = parameterValues({ from: 0.0015, to: 0.0035, steps: 3 });
  assert.deepEqual(values.map((v) => Math.round(v * 1e5)), [150, 250, 350]);
  const goals = [{ kind: 'global', id: 'drag' }, { kind: 'surface', id: 'pAvg', faceIds: [0] }];
  const seen = [];
  const study = await parametricStudy(values, (v) => ({ result: run(v), mesh }), goals, { onRow: (r, i) => seen.push(i) });
  assert.deepEqual(seen, [0, 1, 2]);
  const d = study.rows.map((r) => r.goals[0]);
  assert.ok(d[0] < d[1] && d[1] < d[2], d.join(' '));
  assert.ok(d[2] / d[0] > 3.5 / 1.5, `${d[2] / d[0]}`);
  const csv = parametricCsv(study, 'velocity', ['drag', 'front pressure']).trim().split('\n');
  assert.equal(csv.length, 4); assert.equal(csv[0], 'velocity,drag,front pressure');
  assert.equal(goalValue(null, mesh, goals[0]), null);
});
