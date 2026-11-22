// The study API the app uses (src/cad/fea-sim2.js, src/cad/fem/run.js): nonlinear static with a load history,
// drop test, load-case combination (linearity, SRSS envelope), flow results, polar rotation, and the study runner
// (structured-clone-safe results, cancellation, probes on a sanitized result).
import test from 'node:test';
import assert from 'node:assert/strict';
import { nonlinearStatic, polarRotation, dropTest, combinationStudy, flowField, flowSection, streamlines } from '../../src/cad/fea-sim2.js';
import { runStudy, runStudyDirect, sanitize, transferables } from '../../src/cad/fem/run.js';
import { probeStatic } from '../../src/cad/fem/static.js';
import { boxMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };

test('polar rotation of a rotated stretch is the rotation', () => {
  const c = Math.cos(0.4), s = Math.sin(0.4), R = [c, -s, 0, s, c, 0, 0, 0, 1], U = [1.1, 0.05, 0, 0.05, 0.9, 0, 0, 0, 1.2];
  const F = Array.from({ length: 9 }, (_, k) => { const i = Math.floor(k / 3), j = k % 3; let t = 0; for (let m = 0; m < 3; m++) t += R[i * 3 + m] * U[m * 3 + j]; return t; });
  polarRotation(F).forEach((x, k) => assert.ok(Math.abs(x - R[k]) < 1e-9));
});

test('nonlinear static of a part: load history with unloading leaves a permanent set once yielded', () => {
  const r = nonlinearStatic(boxMesh(20, 2, 2, 1), { material: { ...STEEL, tangentModulus: 2000, kinematicFraction: 1 }, fixtures: [{ faceId: 0, type: 'displacement', value: [0, null, null] }, { faceId: 2, type: 'roller' }, { faceId: 4, type: 'roller' }], loads: [{ faceId: 1, force: [1400, 0, 0] }], elementSize: 2, history: [0, 1, 0], steps: 4, geometric: false });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.curve.length, 9);
  assert.ok(r.curve[4].maxStress > 250 && r.plasticFraction > 0.9);
  assert.ok(r.curve[8].maxDisplacement > 1e-3, 'plastic set after unloading');
  assert.ok(r.vertexPlasticStrain.length > 0);
});

test('drop test of a part from the app API: impulse and energy report', () => {
  const r = dropTest(boxMesh(10, 10, 40, 1), { material: { ...STEEL, plastic: false }, height: 50, elementSize: 5 });
  assert.equal(r.ok, true);
  assert.ok(r.impulse > 0 && r.time.length > 10 && r.stress.length === r.time.length);
  assert.ok(Math.abs(r.momentumChange - r.impulse) < 0.05 * r.impulse + 1e-9, 'impulse ≈ momentum change');
  assert.ok(r.energy.maxImbalance < 0.02);
});

test('combination: factors combine linearly and SRSS is never below the larger case', () => {
  const fx = [0], cases = [{ loads: [{ faceId: 1, force: [0, 0, -100] }], factor: 1, name: 'A' }, { loads: [{ faceId: 1, force: [0, -50, 0] }], factor: 2, name: 'B' }];
  const lin = combinationStudy(boxMesh(60, 10, 10, 1), { material: STEEL, fixtures: fx, cases, resolution: 12 });
  const one = combinationStudy(boxMesh(60, 10, 10, 1), { material: STEEL, fixtures: fx, cases: [{ ...cases[0], factor: 2 }], resolution: 12 });
  const twice = combinationStudy(boxMesh(60, 10, 10, 1), { material: STEEL, fixtures: fx, cases: [cases[0]], resolution: 12 });
  assert.ok(Math.abs(one.maxDisplacement - 2 * twice.maxDisplacement) < 1e-9 * one.maxDisplacement, 'linear in the factor');
  const srss = combinationStudy(boxMesh(60, 10, 10, 1), { material: STEEL, fixtures: fx, cases, method: 'srss', resolution: 12 });
  assert.ok(srss.maxStress >= Math.max(...srss.caseResults.map((c) => c.factor * c.maxStress)) * 0.999);
  assert.equal(lin.caseResults.length, 2);
});

test('flow field: section colours and streamlines from the app API', () => {
  const r = flowField(boxMesh(10, 10, 10, 1), { velocity: 0.002, fluid: 'water', resolution: 6, time: { mode: 'steady', maxSteps: 1500 } });
  assert.equal(r.ok, true);
  const sec = flowSection(r, { normalAxis: 1, quantity: 'pressure' });
  assert.equal(sec.colors.length, sec.mesh.vertices.length);
  assert.ok(streamlines(r, { count: 2 }).speed.every((v) => v >= 0));
});

test('study runner: results survive structured cloning, probes work on them, cancel stops a run', async () => {
  const input = { bodies: [{ mesh: boxMesh(50, 10, 10, 1), material: STEEL }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -100] }], mesh: { size: 5 } };
  const direct = runStudyDirect('static', input);
  const clone = structuredClone(sanitize(direct));
  assert.ok(transferables(clone).size > 3);
  const p = probeStatic(clone, [5, 5, 10]);
  assert.ok(Math.abs(p.stress[0] - probeStatic(direct, [5, 5, 10]).stress[0]) < 1e-9);
  const viaRunner = await runStudy('static', input);
  assert.equal(viaRunner.ok, true);
  const ac = new AbortController(); ac.abort();
  const cancelled = await runStudy('nonlinear', { ...input, steps: 5 }, { signal: ac.signal });
  assert.equal(cancelled.ok, false);
  assert.equal((await runStudy('nope', {})).error, 'unknown-study');
});
