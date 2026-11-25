// Feature recognition of an imported body (cad/feature-recog.js): a dumb solid of a plate with a raised step, a
// rounded boss, a through hole and a blind hole comes back as reference planes, sketches and extrudes (boss steps and
// hole cuts) that rebuild the same volume; a body that is not 2.5D is refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { recognizeBody } from '../../src/cad/feature-recog.js';
import { regenerate } from '../../src/cad/features.js';

await loadKernel();
const R = rep();

test('a stepped plate with a boss and holes: planes, sketches, boss extrudes and hole cuts that rebuild it', () => {
  let b = R.makeBox([0, 0, 0], [80, 50, 10]).fuse(R.makeBox([0, 0, 10], [30, 50, 18]));
  b = b.fuse(R.makeCylinder(8, 12, [60, 25, 10], [0, 0, 1]));
  b = b.cut(R.makeCylinder(4, 40, [15, 25, -5], [0, 0, 1]));        // through the step
  b = b.cut(R.makeCylinder(3, 6, [60, 25, 16], [0, 0, 1]));         // blind, in the boss
  const r = recognizeBody(b);
  assert.equal(r.report.error, null, JSON.stringify(r.report));
  assert.equal(r.report.axis, 'z');
  assert.equal(r.report.holes, 2);
  assert.equal(r.report.steps, 3);
  assert.ok(Math.abs(r.report.rebuilt / r.report.volume - 1) < 1e-4);
  const kinds = r.features.map((f) => f.type);
  assert.equal(kinds.filter((k) => k === 'extrude').length, 5);
  assert.equal(r.features.filter((f) => f.op === 'cut').length, 2);
  // The sketch of the boss step holds its circle exactly (an arc entity, not a polygon).
  const sk = r.features.filter((f) => f.type === 'sketch');
  assert.ok(sk.some((s) => s.entities.some((e) => e.type === 'circle' && Math.abs(e.r - 8) < 1e-6)));
  // Editable: a hole made wider changes the volume as it should.
  const part = { id: 'p', name: 'p', features: structuredClone(r.features) };
  const hole = part.features.filter((f) => f.type === 'sketch').at(-2);
  const circ = hole.entities.find((e) => e.type === 'circle'); circ.r = 5;
  const v2 = R.measureVolume(regenerate(part).body);
  assert.ok(Math.abs(r.report.volume - v2 - Math.PI * (25 - 16) * 18) < 0.5, `${r.report.volume - v2}`);
});

test('a body that is not 2.5D (a sphere) is refused', () => {
  const r = recognizeBody(R.makeSphere(10));
  assert.ok(r.report.error && !r.features.length);
});
