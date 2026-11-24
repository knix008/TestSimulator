// Revolve: mid-plane, a second direction, up to vertex / surface / offset from surface, thin features and selected
// contours — volumes by Pappus (area × path of the centroid) or by integrating over the angle swept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addLine, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const front = { kind: 'std', name: 'front' };
const top = { kind: 'std', name: 'top' };
const newPart = () => ({ id: 'p', name: 'Part', features: [] });
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
const sketchOn = (part, plane, draw) => { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
const FULL = Math.PI * (30 * 30 - 20 * 20) * 10; // the 20 … 30 × 0 … 10 rectangle turned once about Z

/** A part with the rectangle (x 20 … 30, z 0 … 10 on the Front plane) and a centreline on the Z axis. */
function ring(extra = () => {}) {
  const part = newPart();
  extra(part);
  const s = sketchOn(part, front, (k) => { addRectangle(k, 20, 0, 30, 10); addLine(k, 0, -5, 0, 20, { construction: true }); });
  return { part, s };
}

test('revolve: blind angle, mid-plane (symmetric about the sketch plane) and a second direction', () => {
  const { part, s } = ring();
  const r = add(part, 'revolve', { sketch: s.id, angle: 90 });
  near(V(ok(part).body), FULL / 4);
  r.end = 'midplane';
  const body = ok(part).body;
  near(V(body), FULL / 4);
  const [lo, hi] = body.boundingBox.bounds;
  near(lo[1], -hi[1]);
  r.end = 'blind'; r.end2 = 'blind'; r.angle2 = 45;
  near(V(ok(part).body), (FULL * 135) / 360);
});

test('revolve up to vertex: stops at the half-plane through the axis and a vertex 60° round', () => {
  const c = [50 * Math.cos(Math.PI / 3), 50 * Math.sin(Math.PI / 3)];
  const { part, s } = ring((p) => { const b = sketchOn(p, top, (k) => addRectangle(k, c[0], c[1], c[0] + 5, c[1] + 5)); add(p, 'extrude', { sketch: b.id, depth: 5 }); });
  const r = add(part, 'revolve', { sketch: s.id, end: 'upToVertex', endVertex: [c[0], c[1], 0], merge: false });
  const box = 125;
  const a = V(ok(part).body) - box;
  r.reverse = true;
  const b = V(ok(part).body) - box;
  // One way it is 60° away, the other way 300°.
  assert.deepEqual([a, b].map((v) => Math.round((v / FULL) * 360)).sort((x, y) => x - y), [60, 300]);
});

test('revolve up to a plane through the axis, and offset 5 from a plane short of it', () => {
  const { part, s } = ring();
  const r = add(part, 'revolve', { sketch: s.id, end: 'upToSurface', endFace: { kind: 'std', name: 'right' } });
  near(V(ok(part).body), FULL / 4);
  // The plane x = 0 offset 5 toward the profile (x = 5): the ring where x > 5 from the profile on,
  // ∫ (r from 20 to 30) 10 · r · acos(5 / r) dr.
  r.end = 'offsetFromSurface'; r.endOffset = 5;
  let exp = 0; const n = 20000;
  for (let i = 0; i < n; i++) { const x = 20 + (10 * (i + 0.5)) / n; exp += 10 * x * Math.acos(5 / x) * (10 / n); }
  near(V(ok(part).body), exp, 1e-6);
});

test('revolve thin (a 1 mm wall round the rectangle, inward) and selected contours', () => {
  const { part, s } = ring();
  const r = add(part, 'revolve', { sketch: s.id, angle: 360, thin: true, thinKind: 'oneDir', thinT1: 1 });
  // Pappus: the wall's area (10² − 8²) times the path of its centroid (radius 25).
  near(V(ok(part).body), (100 - 64) * 2 * Math.PI * 25);
  delete r.thin;
  const t = sketchOn(part, front, (k) => { addRectangle(k, 20, 0, 30, 10); addRectangle(k, 40, 0, 45, 10); addLine(k, 0, -5, 0, 20, { construction: true }); });
  r.sketch = t.id;
  part.features.push(part.features.splice(part.features.indexOf(r), 1)[0]);
  r.contours = [1];
  const one = V(ok(part).body);
  r.contours = [0];
  const other = V(ok(part).body);
  assert.deepEqual([one, other].map((v) => Math.round(v)).sort((x, y) => x - y), [Math.round(Math.PI * (45 * 45 - 40 * 40) * 10), Math.round(FULL)].sort((x, y) => x - y));
});
