// Clearance verification: pairs of components closer than a minimum clearance, with the real closest gap
// measured by the kernel between the placed solids.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { clearances, boxGap } from '../../src/cad/asm-tools.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
before(async () => { await loadKernel(); });

const box = (id, x, y = 0, z = 0, s = 10) => {
  const shape = rep().makeBaseBox(s, s, s).translate([x + s / 2, y + s / 2, z]);
  return { id, shape, box: shape.boundingBox.bounds };
};
const dist = (a, b) => rep().measureDistanceBetween(a, b);

test('box gap: 0 when boxes overlap, the corner distance when apart diagonally', () => {
  near(boxGap([[0, 0, 0], [1, 1, 1]], [[0.5, 0.5, 0.5], [2, 2, 2]]), 0);
  near(boxGap([[0, 0, 0], [1, 1, 1]], [[4, 5, 1], [6, 6, 2]]), 5);
});

test('pairs closer than the minimum are listed with the measured gap, smallest first', () => {
  // a at x 0..10; b at 10.4..20.4 (gap 0.4); c at 30..40 (gap 9.6 from b); d touches a on top (z 10).
  const items = [box('a', 0), box('b', 10.4), box('c', 30), box('d', 0, 0, 10)];
  const r = clearances(items, dist, { min: 1 });
  assert.deepEqual(r.items.map((x) => `${x.a}-${x.b}`), ['a-d', 'a-b', 'b-d']);
  near(r.items[0].gap, 0, 1e-6);
  near(r.items[1].gap, 0.4, 1e-6);
  // b-d: d spans x 0..10 at z 10..20, b x 10.4.. z 0..10 → the edges are 0.4 apart.
  near(r.items[2].gap, 0.4, 1e-6);
  // c is never measured: its box is ≥ 1 from all the others.
  assert.equal(r.checked, 3);
});

test('a larger minimum catches the far pair; touching pairs can be left to the interference check', () => {
  const items = [box('a', 0), box('b', 10.4), box('c', 30), box('d', 0, 0, 10)];
  const r = clearances(items, dist, { min: 10, ignoreTouching: true });
  assert.deepEqual(r.items.map((x) => `${x.a}-${x.b}`), ['a-b', 'b-d', 'b-c']);
  near(r.items[2].gap, 9.6, 1e-6);
});

test('chosen components are checked only against the rest; a gap equal to the minimum can be ignored', () => {
  const items = [box('a', 0), box('b', 10.4), box('c', 30), box('d', 0, 0, 10)];
  const r = clearances(items, dist, { min: 1, among: ['b'] });
  assert.deepEqual(r.items.map((x) => `${x.a}-${x.b}`), ['a-b', 'b-d']);
  const eq = clearances([box('a', 0), box('e', 11)], dist, { min: 1 });
  assert.equal(eq.items.length, 1);
  near(eq.items[0].gap, 1);
  assert.equal(clearances([box('a', 0), box('e', 11)], dist, { min: 1, ignoreEqual: true }).items.length, 0);
});

test('a cylinder in a hole: the radial clearance is found', () => {
  const R = rep();
  const plate = R.makeBaseBox(40, 40, 10).cut(R.makeCylinder(5.5, 10, [0, 0, 0], [0, 0, 1]));
  const pin = R.makeCylinder(5, 30, [0, 0, -10], [0, 0, 1]);
  const items = [{ id: 'plate', shape: plate, box: plate.boundingBox.bounds }, { id: 'pin', shape: pin, box: pin.boundingBox.bounds }];
  const r = clearances(items, dist, { min: 1 });
  assert.equal(r.items.length, 1);
  near(r.items[0].gap, 0.5, 1e-5);
});
