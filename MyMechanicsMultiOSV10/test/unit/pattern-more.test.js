// Patterns that rebuild their instances in place (geometry pattern off) and sketch-driven variation
// (cad/pattern-more.js): an "up to next" boss reaches whatever is above each instance; a variable pattern changes
// the seed sketch's dimensions by a step per instance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const V = (s) => R.measureVolume(s);

function ok(part) {
  const r = regenerate(part);
  for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`);
  return r;
}
function plane(part, offset) { const p = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset }); part.features.push(p); return { kind: 'ref', id: p.id }; }
function block(part, on, x0, x1, depth) {
  const s = createFeature(part, 'sketch', { plane: on, ...createSketchGeometry() }); addRectangle(s, x0, 0, x1, 20); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth }));
}

/** A plate (z 0…5) under two roofs: z 20…25 over x 0…40 and z 40…45 over x 50…100; a Ø6 post at x = 20 up to next. */
function roofs(geometry) {
  const part = { id: 'p', name: 'P', features: [] };
  block(part, { kind: 'std', name: 'top' }, 0, 100, 5);
  block(part, plane(part, 20), 0, 40, 5);
  block(part, plane(part, 40), 50, 100, 5);
  const s = createFeature(part, 'sketch', { plane: plane(part, 5), ...createSketchGeometry() }); addCircle(s, 20, 10, 3); part.features.push(s);
  const post = createFeature(part, 'extrude', { sketch: s.id, end: 'upToNext' }); part.features.push(post);
  const before = V(ok(part).body);
  part.features.push(createFeature(part, 'linearPattern', { seeds: [post.id], direction: { kind: 'axis', axis: 'x' }, spacing: 50, count: 2, geometry }));
  return { added: V(ok(part).body) - before };
}

test('geometry pattern off: an up-to-next post is built again at each place (reaches the higher roof there)', () => {
  const copy = roofs(true); const rebuilt = roofs(false);
  near(copy.added, Math.PI * 9 * 15, 1e-5);
  near(rebuilt.added, Math.PI * 9 * 35, 1e-5);
});

test('variable pattern: the seed sketch\'s radius grows by a step per instance', () => {
  const part = { id: 'p', name: 'P', features: [] };
  block(part, { kind: 'std', name: 'top' }, 0, 200, 5);
  const s = createFeature(part, 'sketch', { plane: plane(part, 5), ...createSketchGeometry() });
  const c = addCircle(s, 20, 10, 2);
  s.constraints.push({ id: 'dR', type: 'radius', a: c.id, value: 2 });
  part.features.push(s);
  const post = createFeature(part, 'extrude', { sketch: s.id, depth: 10 }); part.features.push(post);
  const before = V(ok(part).body);
  const pat = createFeature(part, 'linearPattern', { seeds: [post.id], direction: { kind: 'axis', axis: 'x' }, spacing: 30, count: 4, vary: [{ dim: 'dR', step: 1 }] });
  part.features.push(pat);
  const r = ok(part);
  // Radii 3, 4, 5 for instances 1…3 (the seed keeps 2).
  near(V(r.body) - before, Math.PI * (9 + 16 + 25) * 10, 1e-5);
  // A step that would make a dimension negative is refused.
  pat.vary = [{ dim: 'dR', step: -1 }];
  assert.equal(regenerate(part).results.get(pat.id).error, 'vary-negative');
});

test('mirror, geometry pattern off: an asymmetric boss with an arc rebuilt on the far side is its exact mirror image', () => {
  const part = { id: 'p', name: 'P', features: [] };
  block(part, { kind: 'std', name: 'top' }, -50, 50, 5);
  const s = createFeature(part, 'sketch', { plane: plane(part, 5), ...createSketchGeometry() });
  // A D shape at x 20…30: a straight side and an arc bulging to +x (radius 10, centre (20, 10)).
  const P = (id, x, y) => { s.entities.push({ id, type: 'point', x, y }); return id; };
  P('a', 20, 0); P('b', 20, 20); P('c', 20, 10);
  s.entities.push({ id: 'l', type: 'line', p1: 'a', p2: 'b' }, { id: 'r', type: 'arc', c: 'c', p1: 'a', p2: 'b' });
  part.features.push(s);
  const boss = createFeature(part, 'extrude', { sketch: s.id, depth: 8 }); part.features.push(boss);
  const one = ok(part); const v1 = V(one.body) - 100 * 20 * 5;
  const m = createFeature(part, 'mirror', { seeds: [boss.id], plane: { kind: 'std', name: 'right' }, geometry: false }); part.features.push(m);
  const r = ok(part);
  near(V(r.body) - 100 * 20 * 5, 2 * v1, 1e-6);
  const [lo, hi] = r.body.boundingBox.bounds;
  near(lo[0], -50); near(hi[0], 50);
  // The mirrored D sits at x −30…−20 (its arc bulging to −x), the same as a geometry copy.
  m.geometry = true; const g = ok(part);
  near(V(g.body), V(r.body), 1e-6);
  near(R.measureVolume(g.body.clone().cut(r.body)), 0, 1e-6);
});

test('mirror body with merge result off keeps the mirror image as a body of its own', () => {
  const part = { id: 'p', name: 'P', features: [] };
  block(part, { kind: 'std', name: 'top' }, 10, 40, 5);
  part.features.push(createFeature(part, 'mirror', { body: true, plane: { kind: 'std', name: 'right' }, merge: false }));
  const r = ok(part);
  assert.equal([...R.iterTopo(r.body.wrapped, 'solid')].length, 2);
  near(V(r.body), 2 * 30 * 20 * 5);
});
