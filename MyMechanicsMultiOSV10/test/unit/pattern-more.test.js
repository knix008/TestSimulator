// Linear and circular patterns: instances to skip, up to a reference, the seed only in direction 2, a circular
// pattern's second direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }

/** A 2 × 2 × 2 cube boss at (0 … 2) — the seed — standing alone (no base). */
function seed() {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addRectangle(s, 0, 0, 2, 2); part.features.push(s);
  const e = add(part, 'extrude', { sketch: s.id, depth: 2 });
  return { part, e };
}

test('linear pattern: skipped instances, the seed only in direction 2, up to a reference point', () => {
  const { part, e } = seed();
  const p = add(part, 'linearPattern', { seeds: [e.id], direction: { kind: 'axis', axis: 'x' }, spacing: 5, count: 4, direction2: { kind: 'axis', axis: 'y' }, spacing2: 5, count2: 3 });
  near(V(ok(part).body), 12 * 8);
  p.skip = ['1,1', '3,2'];
  near(V(ok(part).body), 10 * 8);
  delete p.skip; p.seedOnly2 = true;
  // 4 along x and 3 along y sharing the seed: 6.
  near(V(ok(part).body), 6 * 8);
  delete p.seedOnly2; delete p.direction2;
  p.upTo = true; p.upToPoint = [31, 1, 1];
  // The seed's centre (1, 1, 1) to x = 31: 30 over 3 gaps → the last cube centred at x = 31.
  const body = ok(part).body;
  near(body.boundingBox.bounds[1][0], 32);
});

test('circular pattern: skipped instances and a second direction', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addCircle(s, 20, 0, 2); part.features.push(s);
  const e = add(part, 'extrude', { sketch: s.id, depth: 3 });
  const pin = Math.PI * 4 * 3;
  const c = add(part, 'circularPattern', { seeds: [e.id], axis: { kind: 'axis', axis: 'z' }, count: 6, angle: 360, equal: true });
  near(V(ok(part).body), 6 * pin);
  c.skip = ['2', '4'];
  near(V(ok(part).body), 4 * pin);
  delete c.skip; c.count = 3; c.angle = 60; c.dir2 = true; c.count2 = 2; c.angle2 = 90;
  // 0°, 30°, 60° one way and −90° the other way.
  near(V(ok(part).body), 4 * pin);
  const ys = ok(part).body.boundingBox.bounds;
  near(ys[0][1], -22);
});
