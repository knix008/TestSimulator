// Linear / linear coupler, slot and universal joint mates, solved on synthetic components (no kernel).
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMates, captureMate, quatIdentity, quatFromAxisAngle, twistAngle, matesFor, MATE_REFS } from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const plane = (point, dir) => ({ kind: 'plane', point, dir });
const axis = (point, dir) => ({ kind: 'axis', point, dir });
const comp = (id, position = [0, 0, 0], rotation = quatIdentity(), fixed = false) => ({ id, part: 'p', position, rotation, fixed });
const ref = (c, e) => ({ comp: c, ...e });
const solve = (asm) => { const r = solveMates(asm, { size: 50 }); assert.deepEqual(r.failed, [], `mates hold (${r.error})`); return r; };

test('mates offered: the coupler between directions, slot and universal joint between axes', () => {
  assert.ok(matesFor(axis([0, 0, 0], [1, 0, 0]), axis([0, 0, 0], [0, 1, 0]), 'advanced').includes('linearCoupler'));
  assert.ok(matesFor(plane([0, 0, 0], [1, 0, 0]), plane([0, 0, 0], [0, 1, 0]), 'advanced').includes('linearCoupler'));
  for (const t of ['slot', 'universalJoint']) assert.ok(matesFor(axis([0, 0, 0], [0, 0, 1]), axis([1, 0, 0], [0, 0, 1]), 'mechanical').includes(t));
  assert.deepEqual(Object.keys(MATE_REFS.slot), ['a', 'b', 'c']);
});

test('linear coupler: b slides twice as far along Y as a along X', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const a = comp('a'); const b = comp('b', [3, 4, 2], quatFromAxisAngle([0, 0, 1], 10));
  const asm = { id: 'A', components: [g, a, b], mates: [
    { id: 'z', type: 'coincident', a: ref('g', plane([0, 0, 0], [0, 0, 1])), b: ref('b', plane([0, 0, 0], [0, 0, -1])) },
    { id: 'x', type: 'coincident', a: ref('g', plane([0, 0, 0], [1, 0, 0])), b: ref('b', plane([0, 0, 0], [-1, 0, 0])) },
    { id: 'r', type: 'parallel', a: ref('g', plane([0, 0, 0], [0, 1, 0])), b: ref('b', plane([0, 0, 0], [0, 1, 0])) },
  ] };
  solve(asm);
  near(b.position[0], 0); near(b.position[2], 0);
  const y0 = b.position[1];
  const coupler = captureMate(asm, { id: 'c', type: 'linearCoupler', a: ref('a', axis([0, 0, 0], [1, 0, 0])), b: ref('b', axis([0, 0, 0], [0, 1, 0])), ratio: 2 });
  asm.mates.push(coupler);
  a.position = [5, 0, 0]; a.fixed = true;
  solve(asm);
  near(b.position[1] - y0, 10);
});

test('slot: centre, distance from the first end, and free (pulled back inside the slot)', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const make = (extra, start = [7, 3, 0]) => {
    const pin = comp('b', start);
    return { id: 'A', components: [g, pin], mates: [
      { id: 'f', type: 'coincident', a: ref('g', plane([0, 0, 0], [0, 0, 1])), b: ref('b', plane([0, 0, 0], [0, 0, -1])) },
      { id: 's', type: 'slot', a: ref('g', axis([0, 0, 0], [0, 0, 1])), b: ref('b', axis([0, 0, 0], [0, 0, 1])), c: ref('g', axis([20, 0, 0], [0, 0, 1])), ...extra },
    ] };
  };
  let asm = make({ slotMode: 'center' }); solve(asm); near(asm.components[1].position[0], 10); near(asm.components[1].position[1], 0);
  asm = make({ slotMode: 'distance', value: 5 }); solve(asm); near(asm.components[1].position[0], 5);
  asm = make({ slotMode: 'percent', value: 75 }); solve(asm); near(asm.components[1].position[0], 15);
  asm = make({ slotMode: 'free' }, [30, 3, 0]); solve(asm); near(asm.components[1].position[0], 20); near(asm.components[1].position[1], 0);
});

test('universal joint: shafts 30° apart, the driven one turns by atan(tan θ / cos β)', () => {
  const beta = (30 * Math.PI) / 180;
  const u = [Math.cos(beta), Math.sin(beta), 0];
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const a = comp('a'); const b = comp('b');
  const asm = { id: 'A', components: [g, a, b], mates: [
    // b turns about the tilted axis through the origin (its own axis u), held along it.
    { id: 'cb', type: 'concentric', a: ref('g', axis([0, 0, 0], u)), b: ref('b', axis([0, 0, 0], u)) },
    { id: 'pb', type: 'coincident', a: ref('g', plane([0, 0, 0], u)), b: ref('b', plane([0, 0, 0], u.map((v) => -v))) },
  ] };
  const uj = captureMate(asm, { id: 'uj', type: 'universalJoint', a: ref('a', axis([0, 0, 0], [1, 0, 0])), b: ref('b', axis([0, 0, 0], u)) });
  asm.mates.push(uj);
  for (const deg of [20, 60, 135]) {
    const th = (deg * Math.PI) / 180;
    a.rotation = quatFromAxisAngle([1, 0, 0], deg); a.fixed = true;
    solve(asm);
    const tb = twistAngle(b.rotation, quatIdentity(), u);
    const want = Math.atan2(Math.sin(th), Math.cos(th) * Math.cos(beta));
    near(Math.cos(tb), Math.cos(want), 1e-4); near(Math.sin(tb), Math.sin(want), 1e-4);
  }
});

test('profile center: a plate centred on the top face of a block, 2 above it', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const p = comp('b', [17, -4, 30], quatFromAxisAngle([0, 0, 1], 15));
  const asm = { id: 'A', components: [g, p], mates: [
    { id: 'pc', type: 'profileCenter', a: ref('g', plane([30, 20, 10], [0, 0, 1])), b: ref('b', plane([5, 5, 0], [0, 0, -1])), value: 2 },
  ] };
  solve(asm);
  const c = p.position; const q = p.rotation;
  // b's face centre (5, 5, 0) in its frame lands on (30, 20, 12).
  const placed = (() => { const [x, y, z, w] = q; const v = [5, 5, 0]; const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]; return [v[0] + w * t[0] + (y * t[2] - z * t[1]) + c[0], v[1] + w * t[1] + (z * t[0] - x * t[2]) + c[1], v[2] + w * t[2] + (x * t[1] - y * t[0]) + c[2]]; })();
  near(placed[0], 30); near(placed[1], 20); near(placed[2], 12);
});
