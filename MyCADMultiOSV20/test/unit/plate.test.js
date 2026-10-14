// Plane-stress plate FEM: checked against hand results.
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzePlate, meshPlate, normalizePlate, plateDeformed, platePeak, plateScale, plateSides, plateSource, stressColor } from '../../src/domain/plate.js';

const rect = (w, h) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
const circle = (cx, cy, r, n = 48) => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((-2 * Math.PI * i) / n), y: cy + r * Math.sin((-2 * Math.PI * i) / n) }));

test('sides: a rectangle has four, a round hole one; options are repaired', () => {
  const sides = plateSides([rect(200, 50), circle(100, 25, 10)]);
  assert.equal(sides.length, 5);
  assert.deepEqual(sides.slice(0, 4).map((s) => Math.round(s.length)), [200, 50, 200, 50]);
  assert.ok(Math.abs(sides[4].length - 2 * Math.PI * 10) < 0.2);
  const o = normalizePlate({ material: 'wood', nu: 0.9, thickness: -1, supports: { 0: 'glue', 3: 'fixed' }, loads: { 1: { fx: 'x', fy: 5 }, 2: { fx: 0, fy: 0 } } });
  assert.equal(o.material, 'steel'); assert.equal(o.nu, 0.49); assert.equal(o.thickness, 0.001);
  assert.deepEqual(o.supports, { 3: 'fixed' }); assert.deepEqual(o.loads, { 1: { fx: 0, fy: 5 } });
});

test('mesh: triangles cover the plate less the hole, all counter-clockwise', () => {
  const { nodes, tris } = meshPlate(rect(200, 100), [circle(100, 50, 20)], 10);
  let area = 0;
  for (const t of tris) {
    const [a, b, c] = t.map((i) => nodes[i]);
    const A = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    assert.ok(A > 0);
    area += A;
  }
  // The 48-gon hole is a little smaller than the circle.
  const hole = 0.5 * 48 * 20 * 20 * Math.sin((2 * Math.PI) / 48);
  assert.ok(Math.abs(area - (200 * 100 - hole)) < 1e-6, `${area}`);
});

test('uniform tension: σ = F / (w·t), elongation = F·L / (E·A), reactions balance the load', () => {
  // 200 × 50 steel strip, 10 thick, left end on rollers (x held) with one corner pinned by the bottom roller, pulled right with 100 kN.
  const r = analyzePlate(rect(200, 50), [], { material: 'steel', thickness: 10, size: 10, supports: { 3: 'rollerX', 0: 'rollerY' }, loads: { 1: { fx: 100000, fy: 0 } } });
  assert.ok(r.ok, r.error);
  const sigma = 100000 / (50 * 10);
  for (const s of r.stress) { assert.ok(Math.abs(s.sx - sigma) < 1e-3 * sigma); assert.ok(Math.abs(s.sy) < 1e-3 * sigma); }
  const right = r.mesh.sideNodes[1].map((i) => r.u[i][0]);
  const expected = (100000 * 200) / (210000 * 50 * 10);
  for (const ux of right) assert.ok(Math.abs(ux - expected) < 1e-3 * expected, `${ux} vs ${expected}`);
  assert.ok(Math.abs(r.reaction.fx + 100000) < 1e-3 * 100000);
  // Poisson contraction across the width: ν·σ/E·w.
  const top = r.mesh.sideNodes[2].map((i) => r.u[i][1]);
  for (const uy of top) assert.ok(Math.abs(uy + (0.3 * sigma * 50) / 210000) < 1e-3 * (0.3 * sigma * 50) / 210000);
});

test('a hole in a wide plate: the peak stress is about three times the far-field stress (Kirsch)', () => {
  const r = analyzePlate(rect(400, 200), [circle(200, 100, 15, 64)], { material: 'steel', thickness: 1, size: 6, supports: { 3: 'rollerX', 0: 'rollerY' }, loads: { 1: { fx: 200, fy: 0 } } });
  assert.ok(r.ok);
  // Constant-strain triangles average the peak over a whole element → somewhat under 3 (gross section, w/d ≈ 6.7 → Kt ≈ 2.6 net, 3.1 gross).
  const kt = Math.max(...r.nodalVm) / (200 / 200);
  assert.ok(kt > 2.2 && kt < 3.6, `Kt ${kt}`);
});

test('unstable or empty plates are reported; colours run blue → red', () => {
  assert.equal(analyzePlate(rect(10, 10), [], { loads: { 1: { fx: 1 } } }).error, 'unstable');
  assert.equal(analyzePlate([{ x: 0, y: 0 }, { x: 1, y: 0 }], [], {}).error, 'noOutline');
  assert.equal(stressColor(0), '#2654d6'); assert.equal(stressColor(1), '#dc3228');
});

test('source and results: the largest outline is the plate, inner ones holes; deformed outlines; the peak at the hole', () => {
  const outside = [{ x: 900, y: 900 }, { x: 910, y: 900 }, { x: 905, y: 910 }];
  const src = plateSource([circle(100, 50, 10).reverse(), rect(200, 100).reverse(), outside]);
  assert.equal(src.outer.length, 4); assert.equal(src.holes.length, 1);
  const r = analyzePlate(src.outer, src.holes, { thickness: 1, size: 8, supports: { 3: 'fixed' }, loads: { 1: { fx: 1000 } } });
  assert.ok(r.ok);
  const loops = plateDeformed(r, plateScale(r));
  assert.equal(loops.length, 2);
  assert.ok(loops[0].length >= 4 && loops[1].length >= 40);
  // The right side moved right.
  assert.ok(Math.max(...loops[0].map((p) => p.x)) > 200);
  const peak = platePeak(r);
  assert.ok(Math.hypot(peak.x - 100, peak.y - 50) < 12 || peak.x < 10, `${peak.x},${peak.y}`);
  assert.equal(plateSource([outside.slice(0, 2)]), null);
});
