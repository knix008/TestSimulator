// Sweep: twist along the path, a guide curve that scales the profile, a circular profile, a thin sweep.
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

/** A 10 × 10 square centred on the origin (Top) and a straight path 100 up (a line on Front: sketch y is Z). */
function setup() {
  const part = { id: 'p', name: 'P', features: [] };
  const prof = sketchOn(part, top, (k) => addRectangle(k, -5, -5, 5, 5));
  const path = sketchOn(part, front, (k) => addLine(k, 0, 0, 0, 100));
  return { part, prof, path };
}

test('sweep twist: 90° along a straight path keeps the volume and turns the end square', () => {
  const { part, prof, path } = setup();
  const s = add(part, 'sweep', { sketch: prof.id, path: path.id, twist: 90 });
  const body = ok(part).body;
  near(V(body), 10000, 1e-4);
  // Half way it is turned 45°: the half diagonal reaches 5√2.
  near(body.boundingBox.bounds[1][0], 5 * Math.SQRT2, 1e-3);
  s.twist = 0.25; s.twistUnit = 'turns';
  near(V(ok(part).body), 10000, 1e-4);
});

test('sweep guide curve: the profile doubles in size along the path (a guide from 5 to 10 off it)', () => {
  const { part, prof, path } = setup();
  const g = sketchOn(part, front, (k) => addLine(k, 5, 0, 10, 100));
  add(part, 'sweep', { sketch: prof.id, path: path.id, guide: g.id });
  // ∫ (10 (1 + z/100))² dz over 0 … 100.
  near(V(ok(part).body), (100 * 100 * (8 - 1)) / 3, 1e-4);
});

test('sweep with a circular profile (no sketch) and a thin sweep', () => {
  const { part, prof, path } = setup();
  const s = add(part, 'sweep', { path: path.id, circular: true, diameter: 6 });
  near(V(ok(part).body), Math.PI * 9 * 100, 1e-6);
  delete s.circular; s.sketch = prof.id; s.thin = true; s.thinT1 = 1;
  near(V(ok(part).body), (100 - 64) * 100, 1e-6);
});
