// Rib: parallel to the sketch with linear extension (fills the corner of an L bracket exactly), normal to the
// sketch (a wall from a plane above down to the plate), draft on a normal rib, one-sided thickness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addLine, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const front = { kind: 'std', name: 'front' };
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
const sketchOn = (part, plane, draw) => { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }

/** An L bracket: a plate (x 0 … 60, y 0 … 30, z 0 … 5) and a wall (x 0 … 5, z up to 60). */
function bracket() {
  const part = { id: 'p', name: 'P', features: [] };
  const a = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 60, 30));
  add(part, 'extrude', { sketch: a.id, depth: 5 });
  const b = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 5, 30));
  add(part, 'extrude', { sketch: b.id, depth: 60 });
  return part;
}
const L = 60 * 30 * 5 + 5 * 30 * 55;

test('parallel rib with linear extension: a short diagonal grows to the wall and the plate — the corner triangle', () => {
  const part = bracket();
  const mid = add(part, 'plane', { base: front, offset: -15 });
  // On the line through (5, 40) and (45, 5), the middle part only (sketch x → X, y → Z).
  const s = sketchOn(part, { kind: 'ref', id: mid.id }, (k) => addLine(k, 15, 31.25, 35, 13.75));
  add(part, 'rib', { sketch: s.id, thickness: 4, extension: 'linear' });
  near(V(ok(part).body) - L, ((35 * 40) / 2) * 4, 1e-6);
});

test('normal rib from a plane above, down to the plate (flip), both sides and one side; with draft', () => {
  const part = bracket();
  const above = add(part, 'plane', { base: top, offset: 50 });
  const s = sketchOn(part, { kind: 'ref', id: above.id }, (k) => addLine(k, 20, 5, 20, 25));
  const r = add(part, 'rib', { sketch: s.id, thickness: 4, direction: 'normal', flip: true });
  near(V(ok(part).body) - L, 4 * 20 * 45, 1e-6);
  r.side = 'first';
  near(V(ok(part).body) - L, 4 * 20 * 45, 1e-6);
  r.side = 'both'; r.draft = 2;
  const v = V(ok(part).body) - L;
  const narrow = 4 - 2 * 45 * Math.tan((2 * Math.PI) / 180);
  // Narrower away from the sketch: a trapezoid 4 wide at z = 50, narrower at the plate.
  near(v, (20 * 45 * (4 + narrow)) / 2, 1e-4);
});
