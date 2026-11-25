// Side core (mold-more.js buildSideCore): after the tooling split, a sketch outline extruded through the tooling
// becomes a body of its own, taken out of the core and cavity; the moulded part stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const solids = (s) => [...R.iterTopo(s.wrapped, 'solid')].map((x) => R.cast(x));

test('a side core through the tooling: one more body, the same total volume, the part untouched', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const plate = R.makeBox([0, 0, 0], [40, 20, 10]);
  part.features.push({ id: 'im0', type: 'import', name: 'Imported1', brep: plate.serialize() });
  part.features.push(createFeature(part, 'partingLine', { dir: 'z' }));
  part.features.push(createFeature(part, 'toolingSplit', { dir: 'z', keepPart: true, gap: 0 }));
  const before = regenerate(part);
  const n0 = solids(before.body).length; const v0 = solids(before.body).reduce((s, x) => s + R.measureVolume(x), 0);
  // A 6 × 4 outline on the Front plane (looking along y), through all.
  const k = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'front' }, ...createSketchGeometry() }); addRectangle(k, 17, 3, 23, 7); part.features.push(k);
  const c = createFeature(part, 'sideCore', { sketch: k.id, end: 'through' }); part.features.push(c);
  const r = regenerate(part);
  assert.ok(r.results.get(c.id).ok, `${r.results.get(c.id).error} ${r.results.get(c.id).detail ?? ''}`);
  const list = solids(r.body);
  assert.equal(list.length, n0 + 1);
  near(list.reduce((s, x) => s + R.measureVolume(x), 0), v0, 1e-9);
  assert.ok(list.some((x) => Math.abs(R.measureVolume(x) - 40 * 20 * 10) < 1e-6), 'the part is whole');
  assert.ok(r.results.get(c.id).sideCore.volume > 0);
});
