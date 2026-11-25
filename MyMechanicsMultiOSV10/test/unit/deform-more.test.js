// Deform: curve to curve and surface push (part-more.js buildDeformMore).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const ok = (part) => { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; };
function block(part, w, d, h) { const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, w, d); part.features.push(s); part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: h })); }

test('curve to curve: the top centre line bowed up 4 in the middle carries the top with it', () => {
  const part = { id: 'p', name: 'P', features: [] };
  block(part, 100, 20, 10);
  const a = createFeature(part, 'sketch3d', { points: [[0, 10, 10], [100, 10, 10]] }); part.features.push(a);
  const b = createFeature(part, 'sketch3d', { points: [[0, 10, 10], [50, 10, 14], [100, 10, 10]], spline: true }); part.features.push(b);
  const d = createFeature(part, 'deform', { kind: 'curve', curvesFrom: [a.id], curvesTo: [b.id], radius: 15 }); part.features.push(d);
  const r = ok(part);
  const [lo, hi] = r.body.boundingBox.bounds;
  assert.ok(Math.abs(hi[2] - 14) < 0.1, `top ${hi[2]}`);
  assert.ok(Math.abs(lo[2]) < 1e-6 || lo[2] > 0, `bottom ${lo[2]}`);
  assert.ok(R.measureVolume(r.body) > 100 * 20 * 10 + 100, 'the top rose');
});

test('surface push: a Ø20 tool body pressed 5 into the top dents it; the tool body is used up', () => {
  const part = { id: 'p', name: 'P', features: [] };
  block(part, 100, 60, 20);
  const pl = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 15 }); part.features.push(pl);
  const k = createFeature(part, 'sketch', { plane: { kind: 'ref', id: pl.id }, ...createSketchGeometry() }); addCircle(k, 50, 30, 10); part.features.push(k);
  const tool = createFeature(part, 'extrude', { sketch: k.id, depth: 20, merge: false }); part.features.push(tool);
  const d = createFeature(part, 'deform', { kind: 'push', tool: tool.id, dir: '-z', radius: 6 }); part.features.push(d);
  const r = ok(part);
  assert.equal([...R.iterTopo(r.body.wrapped, 'solid')].length, 1);
  const lost = 100 * 60 * 20 - R.measureVolume(r.body);
  assert.ok(lost > Math.PI * 100 * 5 * 0.9 && lost < Math.PI * 100 * 5 * 2, `dent ${lost}`);
  assert.ok(r.body.boundingBox.bounds[1][2] < 20 + 1e-6);
});
