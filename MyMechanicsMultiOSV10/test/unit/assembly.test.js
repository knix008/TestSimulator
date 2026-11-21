// Advanced and mechanical mates, exploded views, motion studies and sub-assemblies (no kernel: synthetic
// mate entities in each part's own coordinates, as document.test.js builds them).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  solveMates, matesFor, quatIdentity, quatFromAxisAngle, placePoint, placeDir, rotate, twistAngle,
  captureLock, captureGear, captureMate, mateResiduals, mateComps, mateRefs, MATE_TYPES, MATE_REFS,
  explodedPlacement, autoExplode, motionFrame, motionFrames, flattenAssembly, instanceName, relativePlacement,
} from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const nearV = (a, b, tol = 1e-5) => a.forEach((v, i) => near(v, b[i], tol));
/** Same angle modulo 2π. */
const sameAngle = (a, b, tol = 1e-4) => { near(Math.cos(a), Math.cos(b), tol); near(Math.sin(a), Math.sin(b), tol); };

const plane = (point, dir) => ({ kind: 'plane', point, dir });
const axis = (point, dir) => ({ kind: 'axis', point, dir });
const pointE = (point) => ({ kind: 'point', point, dir: [0, 0, 1] });
const comp = (id, position = [0, 0, 0], rotation = quatIdentity(), fixed = false) => ({ id, part: 'p', position, rotation, fixed });
const ref = (c, e) => ({ comp: c, ...e });
const asmOf = (components, mates) => ({ id: 'A', name: 'A', components, mates });
const zAxis = axis([0, 0, 0], [0, 0, 1]);
const front = plane([0, 0, 0], [0, 0, 1]);
const back = plane([0, 0, 0], [0, 0, -1]);

test('mate lists: the standard list is unchanged, advanced and mechanical groups, refs per type', () => {
  const p = plane([0, 0, 0], [0, 1, 0]);
  assert.deepEqual(matesFor(p, p), ['coincident', 'parallel', 'perpendicular', 'distance', 'angle']);
  assert.deepEqual(matesFor(p, p, 'advanced'), ['width', 'symmetric', 'limitDistance', 'limitAngle']);
  assert.deepEqual(matesFor(zAxis, zAxis, 'mechanical'), ['gear', 'screw', 'hinge', 'rackPinion']);
  assert.deepEqual(matesFor(zAxis, p, 'mechanical'), ['rackPinion']);
  for (const t of ['lock', 'width', 'symmetric', 'limitDistance', 'limitAngle', 'gear', 'rackPinion', 'screw', 'hinge']) {
    assert.ok(MATE_TYPES.includes(t), t);
    assert.ok(MATE_REFS[t], t);
  }
  const m = { a: { comp: 'x' }, b: { comp: 'y' }, c: { comp: 'x' }, d: { comp: 'z' } };
  assert.equal(mateRefs(m).length, 4);
  assert.deepEqual(mateComps(m), ['x', 'y', 'z']);
  // The old call form of the residuals still works.
  assert.deepEqual(mateResiduals({ type: 'parallel' }, plane([0, 0, 0], [0, 1, 0]), plane([0, 0, 0], [0, -1, 0]), 10).map((v) => Math.abs(v)), [0, 0, 0]);
});

test('lock keeps the relative pose captured when it was made', () => {
  const a = comp('a', [0, 0, 0], quatIdentity(), true);
  const b = comp('b', [10, 20, 5], quatFromAxisAngle([1, 2, 3], 35));
  const asm = asmOf([a, b], [{ id: 'm', type: 'lock', a: { comp: 'a' }, b: { comp: 'b' } }]);
  captureLock(asm, asm.mates[0]);
  const rel = structuredClone(asm.mates[0].relative);
  // Move the fixed component: the locked one follows.
  a.position = [100, -50, 7]; a.rotation = quatFromAxisAngle([0, 1, 0], 70);
  const r = solveMates(asm, { size: 50 });
  assert.deepEqual(r.failed, []);
  const now = relativePlacement(a, b);
  nearV(now.position, rel.position, 1e-5);
  const p = [3, 4, 5];
  nearV(placePoint(b, p), placePoint(a, placePoint(rel, p)), 1e-5);
  assert.equal(r.status.get('b'), 'defined');
});

test('width centres the tab between the groove faces', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const t = comp('t', [20, 3, -4], quatFromAxisAngle([0, 1, 0], 25));
  const asm = asmOf([g, t], [{
    id: 'w', type: 'width',
    a: ref('g', plane([-10, 0, 0], [1, 0, 0])), b: ref('g', plane([10, 0, 0], [-1, 0, 0])),
    c: ref('t', plane([0, 0, 0], [-1, 0, 0])), d: ref('t', plane([6, 0, 0], [1, 0, 0])),
  }]);
  const r = solveMates(asm, { size: 50 });
  assert.deepEqual(r.failed, []);
  near(placePoint(t, [3, 0, 0])[0], 0);
  near(Math.abs(placeDir(t, [1, 0, 0])[0]), 1);
  assert.equal(r.status.get('t'), 'under');
});

test('symmetric: b mirrors a in plane c (planes and points)', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const a = comp('a', [-15, 0, 0], quatIdentity(), true);
  const b = comp('b', [40, 7, 0], quatFromAxisAngle([0, 0, 1], 20));
  const asm = asmOf([g, a, b], [{ id: 's', type: 'symmetric', a: ref('a', plane([0, 0, 0], [1, 0, 0])), b: ref('b', plane([0, 0, 0], [-1, 0, 0])), c: ref('g', plane([0, 0, 0], [1, 0, 0])) }]);
  assert.deepEqual(solveMates(asm, { size: 50 }).failed, []);
  near(placePoint(b, [0, 0, 0])[0], 15);
  near(Math.abs(placeDir(b, [1, 0, 0])[0]), 1);

  const p = comp('p', [3, 8, -2], quatIdentity());
  const asm2 = asmOf([g, a, p], [{ id: 's2', type: 'symmetric', a: ref('a', pointE([0, 4, 6])), b: ref('p', pointE([0, 0, 0])), c: ref('g', plane([0, 0, 0], [1, 0, 0])) }]);
  assert.deepEqual(solveMates(asm2, { size: 50 }).failed, []);
  nearV(p.position, [15, 4, 6]);
});

test('limit distance clamps to [min, max] and leaves values inside alone', () => {
  const run = (y) => {
    const g = comp('g', [0, 0, 0], quatIdentity(), true);
    const b = comp('b', [0, y, 0]);
    const asm = asmOf([g, b], [{ id: 'l', type: 'limitDistance', min: 0, max: 20, a: ref('g', plane([0, 10, 0], [0, 1, 0])), b: ref('b', plane([0, 0, 0], [0, -1, 0])) }]);
    const r = solveMates(asm, { size: 50 });
    assert.deepEqual(r.failed, []);
    return { y: b.position[1], r };
  };
  near(run(50).y, 30);
  near(run(5).y, 10);
  const inside = run(25);
  near(inside.y, 25);
  assert.equal(inside.r.status.get('b'), 'under');
});

test('limit angle clamps the angle between two planes', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const b = comp('b', [0, 0, 0], quatFromAxisAngle([0, 0, 1], 60));
  const asm = asmOf([g, b], [{ id: 'la', type: 'limitAngle', min: 0, max: 30, a: ref('g', plane([0, 0, 0], [0, 1, 0])), b: ref('b', plane([0, 0, 0], [0, 1, 0])) }]);
  assert.deepEqual(solveMates(asm, { size: 50 }).failed, []);
  const angle = (Math.acos(Math.min(1, placeDir(b, [0, 1, 0])[1])) * 180) / Math.PI;
  near(angle, 30, 1e-3);
});

test('hinge = concentric + coincident; rotation stays free', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const b = comp('b', [20, -9, 14], quatFromAxisAngle([1, 1, 0], 15));
  const asm = asmOf([g, b], [{ id: 'h', type: 'hinge', a: ref('g', axis([5, 5, 0], [0, 0, 1])), b: ref('b', zAxis), c: ref('g', front), d: ref('b', back) }]);
  const r = solveMates(asm, { size: 50 });
  assert.deepEqual(r.failed, []);
  const o = placePoint(b, [0, 0, 0]);
  nearV(o, [5, 5, 0]);
  near(placeDir(b, [0, 0, 1])[2], 1);
  assert.equal(r.status.get('b'), 'under');
});

/** Ground with two shafts along z (at x 0 and 30), gear A on the first, gear B on the second. */
function gearAssembly(ratio = 2, reverse = false) {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const a = comp('a', [1, 2, 3], quatFromAxisAngle([1, 0, 0], 5));
  const b = comp('b', [28, -1, 4]);
  const asm = asmOf([g, a, b], [
    { id: 'ca', type: 'concentric', a: ref('g', zAxis), b: ref('a', zAxis) },
    { id: 'pa', type: 'coincident', a: ref('g', front), b: ref('a', back) },
    { id: 'cb', type: 'concentric', a: ref('g', axis([30, 0, 0], [0, 0, 1])), b: ref('b', zAxis) },
    { id: 'pb', type: 'coincident', a: ref('g', front), b: ref('b', back) },
  ]);
  assert.deepEqual(solveMates(asm, { size: 50 }).failed, []);
  const gear = { id: 'gear', type: 'gear', ratio, reverse, a: ref('a', zAxis), b: ref('b', zAxis) };
  asm.mates.push(captureMate(asm, gear));
  return asm;
}

test('gear: the driven gear turns −ratio × the driver; a fixed driver fully defines it', () => {
  const asm = gearAssembly(2);
  const [, a, b] = asm.components;
  const startB = [...b.rotation];
  a.rotation = quatFromAxisAngle([0, 0, 1], 40);
  a.position = [0, 0, 0];
  a.fixed = true;
  const r = solveMates(asm, { size: 50 });
  assert.deepEqual(r.failed, []);
  sameAngle(twistAngle(b.rotation, startB, [0, 0, 1]), (-80 * Math.PI) / 180);
  assert.equal(r.status.get('b'), 'defined');
  nearV(placePoint(b, [0, 0, 0]), [30, 0, 0]);
});

test('gear ratio 2 through a motion study, past a full turn', () => {
  const asm = gearAssembly(2);
  asm.motion = { duration: 3, motors: [{ id: 'mot', kind: 'rotary', comp: 'a', ref: ref('a', zAxis), speed: 60 }] };
  const a0 = [...asm.components[1].rotation];
  const b0 = [...asm.components[2].rotation];
  for (const t of [0.25, 0.6, 1.5, 2.3]) {
    const f = motionFrame(asm, t, { size: 50 });
    assert.deepEqual(f.failed, [], `t=${t}`);
    const theta = 2 * Math.PI * t;
    sameAngle(twistAngle(f.placements.get('a').rotation, a0, [0, 0, 1]), theta);
    sameAngle(twistAngle(f.placements.get('b').rotation, b0, [0, 0, 1]), -2 * theta);
    nearV(placePoint(f.placements.get('b'), [0, 0, 0]), [30, 0, 0], 1e-4);
  }
  // The assembly itself did not move.
  nearV(asm.components[1].rotation, a0, 0);
  // Reverse: same direction.
  const rev = gearAssembly(2, true);
  rev.motion = { duration: 1, motors: [{ id: 'mot', kind: 'rotary', comp: 'a', ref: ref('a', zAxis), speed: 60 }] };
  const rb0 = [...rev.components[2].rotation];
  const f = motionFrame(rev, 0.1, { size: 50 });
  sameAngle(twistAngle(f.placements.get('b').rotation, rb0, [0, 0, 1]), 2 * 2 * Math.PI * 0.1);
});

test('motion frames: one placement map per frame', () => {
  const asm = gearAssembly(0.5);
  asm.motion = { duration: 2, motors: [{ id: 'mot', kind: 'rotary', comp: 'a', ref: ref('a', zAxis), speed: 30 }] };
  const b0 = [...asm.components[2].rotation];
  const frames = motionFrames(asm, { fps: 4, size: 50 });
  assert.equal(frames.length, 9);
  frames.forEach((fr, i) => {
    const theta = Math.PI * (i / 4); // 30 rpm = π rad/s
    // ratio 0.5: b turns −θ/2, tracked continuously (the pose alone could not tell after a full turn of a).
    sameAngle(twistAngle(fr.get('b').rotation, b0, [0, 0, 1]), -theta / 2);
  });
});

test('rack and pinion: rack travel = radius × pinion rotation', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const p = comp('p');
  const rack = comp('r', [0, -10, 0]);
  const asm = asmOf([g, p, rack], [
    { id: 'cp', type: 'concentric', a: ref('g', zAxis), b: ref('p', zAxis) },
    { id: 'pp', type: 'coincident', a: ref('g', front), b: ref('p', back) },
    { id: 'r1', type: 'coincident', a: ref('g', front), b: ref('r', back) },
    { id: 'r2', type: 'coincident', a: ref('g', plane([0, -10, 0], [0, 1, 0])), b: ref('r', plane([0, 0, 0], [0, -1, 0])) },
  ]);
  const rp = { id: 'rp', type: 'rackPinion', radius: 10, a: ref('p', zAxis), b: ref('r', axis([0, 0, 0], [1, 0, 0])) };
  asm.mates.push(captureMate(asm, rp));
  asm.motion = { duration: 2, motors: [{ id: 'm', kind: 'rotary', comp: 'p', ref: ref('p', zAxis), speed: 60 }] };
  for (const t of [0.3, 1.25]) {
    const f = motionFrame(asm, t, { size: 50 });
    assert.deepEqual(f.failed, []);
    near(f.placements.get('r').position[0], 10 * 2 * Math.PI * t, 1e-3);
    near(f.placements.get('r').position[1], -10, 1e-5);
  }
  // Driven the other way: a linear motor on the rack turns the pinion by s / r.
  asm.motion = { duration: 2, motors: [{ id: 'm', kind: 'linear', comp: 'r', ref: ref('r', axis([0, 0, 0], [1, 0, 0])), speed: 20 }] };
  const f = motionFrame(asm, 2, { size: 50 });
  assert.deepEqual(f.failed, []);
  sameAngle(twistAngle(f.placements.get('p').rotation, quatIdentity(), [0, 0, 1]), 40 / 10);
});

test('screw: the nut travels pitch per turn', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const s = comp('s');
  const n = comp('n', [0, 0, 5]);
  const asm = asmOf([g, s, n], [
    { id: 'cs', type: 'concentric', a: ref('g', zAxis), b: ref('s', zAxis) },
    { id: 'ps', type: 'coincident', a: ref('g', front), b: ref('s', back) },
    // The nut cannot spin: its side face stays parallel to the ground's.
    { id: 'pn', type: 'parallel', a: ref('g', plane([0, 0, 0], [1, 0, 0])), b: ref('n', plane([0, 0, 0], [1, 0, 0])) },
  ]);
  asm.mates.push(captureGear(asm, { id: 'sc', type: 'screw', pitch: 2, a: ref('s', zAxis), b: ref('n', zAxis) }));
  asm.motion = { duration: 2, motors: [{ id: 'm', kind: 'rotary', comp: 's', ref: ref('s', zAxis), speed: 60 }] };
  const f = motionFrame(asm, 1.5, { size: 50 });
  assert.deepEqual(f.failed, []);
  // 1.5 turns of the shaft = −1.5 turns of the nut relative to it → −3 mm.
  near(f.placements.get('n').position[2], 5 - 3, 1e-3);
  nearV(f.placements.get('n').position.slice(0, 2), [0, 0], 1e-4);
  // A static screw: nut pulled off the axis comes back to it (implicitly concentric).
  n.position = [4, -3, 5];
  assert.deepEqual(solveMates(asm, { size: 50 }).failed, []);
  nearV(n.position.slice(0, 2), [0, 0], 1e-5);
});

test('exploded placement: factor 0, 0.5 and 1', () => {
  const asm = asmOf([comp('a', [1, 2, 3]), comp('b', [0, 0, 0]), comp('c')], []);
  asm.explode = { on: true, steps: [{ id: 's1', comps: ['a'], dir: [0, 2, 0], distance: 40 }, { id: 's2', comps: ['a', 'b'], dir: [1, 0, 0], distance: 10 }] };
  nearV(explodedPlacement(asm, 'a', 0).position, [1, 2, 3]);
  nearV(explodedPlacement(asm, 'a', 0.5).position, [6, 22, 3]);
  nearV(explodedPlacement(asm, 'a').position, [11, 42, 3]);
  nearV(explodedPlacement(asm, asm.components[1]).position, [10, 0, 0]);
  nearV(explodedPlacement(asm, 'c').position, [0, 0, 0]);
});

test('auto explode separates stacked boxes along the dominant axis', () => {
  const asm = asmOf([comp('a'), comp('b'), comp('c'), comp('d')], []);
  const boxes = new Map([['a', [[0, 0, 0], [5, 10, 5]]], ['b', [[0, 10, 0], [5, 20, 5]]], ['c', [[0, 20, 0], [5, 30, 5]]], ['d', [[1, 30, 1], [4, 40, 4]]]]);
  const ex = autoExplode(asm, boxes, 8);
  assert.equal(asm.explode, ex);
  assert.ok(ex.steps.length >= 2);
  for (const s of ex.steps) { assert.equal(s.dir[0], 0); assert.equal(s.dir[2], 0); }
  const moved = [...boxes].map(([id, [lo, hi]]) => {
    const d = explodedPlacement(asm, id).position;
    return [lo[1] + d[1], hi[1] + d[1]];
  }).sort((p, q) => p[0] - q[0]);
  for (let i = 1; i < moved.length; i++) assert.ok(moved[i][0] - moved[i - 1][1] >= 8 - 1e-9, `gap ${i}`);
});

test('flatten a two-level assembly; cycles stop', () => {
  const sub = { id: 'sub', name: 'Sub', components: [{ id: 's1', part: 'p2', position: [5, 0, 0], rotation: quatIdentity() }], mates: [] };
  const top = {
    id: 'top', name: 'Top', mates: [], components: [
      { id: 'c1', part: 'p1', position: [10, 0, 0], rotation: quatIdentity() },
      { id: 'c2', sub: 'sub', position: [0, 0, 100], rotation: quatFromAxisAngle([0, 0, 1], 90) },
    ],
  };
  const project = { parts: [], assemblies: [top, sub] };
  const flat = flattenAssembly(project, top);
  assert.equal(flat.length, 2);
  assert.deepEqual(flat[1].path, ['c2', 's1']);
  assert.equal(flat[1].part, 'p2');
  nearV(flat[1].placement.position, [0, 5, 100]);
  nearV(rotate(flat[1].placement.rotation, [1, 0, 0]), [0, 1, 0]);
  // A cycle: the sub-assembly contains the top one (and itself).
  sub.components.push({ id: 's2', sub: 'top', position: [0, 0, 0], rotation: quatIdentity() }, { id: 's3', sub: 'sub', position: [0, 0, 0], rotation: quatIdentity() });
  assert.equal(flattenAssembly(project, top).length, 2);
  assert.equal(instanceName(top, 'Sub', 'sub'), 'Sub<2>');
  assert.equal(instanceName(top, 'P1', 'p1'), 'P1<2>');
});
