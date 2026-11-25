// Every mate type, one behaviour per test: two (or three) simple components with synthetic mate entities in
// their own coordinates, solved by solveMates(); the resulting placement is checked numerically. Also flipped
// alignment, over-constrained / impossible mates, the under / defined / fixed status, the reference tables
// (matesFor, MATE_REFS, MATE_DEFAULTS) and the capture helpers. No kernel needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_MATES, ADVANCED_MATES, MECHANICAL_MATES, MATE_TYPES, MATE_REFS, MATE_DEFAULTS,
  solveMates, matesFor, mateResiduals, mateRefs, mateComps, mateTouches, captureMate, captureLock, captureGear,
  quatIdentity, quatFromAxisAngle, quatMultiply, quatConjugate, quatNormalize, quatFromRotvec, quatToAxisAngle,
  placePoint, placeDir, rotate, twistAngle, relativePlacement, composePlacement, instanceName, motionFrame,
} from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const nearV = (a, b, tol = 1e-5) => { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i], tol)); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const deg = (r) => (r * 180) / Math.PI;
const angleBetween = (u, v) => deg(Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (Math.hypot(...u) * Math.hypot(...v))))));
const sameAngle = (a, b, tol = 1e-4) => { near(Math.cos(a), Math.cos(b), tol); near(Math.sin(a), Math.sin(b), tol); };

const plane = (point, dir) => ({ kind: 'plane', point, dir });
const axis = (point, dir) => ({ kind: 'axis', point, dir });
const pointE = (point) => ({ kind: 'point', point, dir: [0, 0, 1] });
const comp = (id, position = [0, 0, 0], rotation = quatIdentity(), fixed = false) => ({ id, part: 'p', position, rotation, fixed });
const ref = (c, e) => ({ comp: c, ...e });
const asmOf = (components, mates) => ({ id: 'A', name: 'A', components, mates });
/** A fixed ground g and a free component b that starts somewhere else, slightly turned. */
const pair = (start = [13, -7, 21], rot = quatFromAxisAngle([1, 2, 3], 12)) => [comp('g', [0, 0, 0], quatIdentity(), true), comp('b', start, rot)];
const solve = (asm, size = 50) => solveMates(asm, { size });
const ok = (asm, size) => { const r = solve(asm, size); assert.deepEqual(r.failed, [], `mates hold (error ${r.error})`); return r; };
const worldDir = (c, d) => placeDir(c, d);

const TOP = plane([0, 10, 0], [0, 1, 0]); // top face of a 10-high block
const BOTTOM = plane([0, 0, 0], [0, -1, 0]);
const Y_AXIS = axis([0, 0, 0], [0, 1, 0]);
const Z_AXIS = axis([0, 0, 0], [0, 0, 1]);
const X_AXIS = axis([0, 0, 0], [1, 0, 0]);
const FRONT = plane([0, 0, 0], [0, 0, 1]);
const BACK = plane([0, 0, 0], [0, 0, -1]);

// ───────────────────────── tables

test('mate type lists: MATE_TYPES is exactly standard + advanced + mechanical, no duplicates', () => {
  assert.deepEqual(MATE_TYPES, [...STANDARD_MATES, ...ADVANCED_MATES, ...MECHANICAL_MATES]);
  assert.equal(new Set(MATE_TYPES).size, MATE_TYPES.length);
});

for (const type of MATE_TYPES) {
  test(`MATE_REFS describes refs a and b of ${type}`, () => {
    const r = MATE_REFS[type];
    assert.ok(r, 'entry');
    assert.ok(r.a && r.b, 'a and b');
    for (const kinds of Object.values(r)) for (const k of kinds.split('|')) assert.ok(['any', 'plane', 'axis', 'point', 'comp', 'path'].includes(k), k);
  });
}

for (const [type, n] of Object.entries({ width: 4, hinge: 4, symmetric: 3, coincident: 2, gear: 2, cam: 2, lock: 2 })) {
  test(`${type} takes ${n} references`, () => assert.equal(Object.keys(MATE_REFS[type]).length, n));
}

for (const [type, fields] of Object.entries(MATE_DEFAULTS)) {
  test(`MATE_DEFAULTS of ${type} are numbers / booleans and the mate type exists`, () => {
    assert.ok(MATE_TYPES.includes(type));
    // Numbers and switches; a mode is a word (the slot mate's free / center / distance / percent).
    for (const [k, v] of Object.entries(fields)) assert.ok(typeof v === 'number' || typeof v === 'boolean' || (/Mode$/.test(k) && typeof v === 'string'), k);
  });
}

const KINDS = { plane: TOP, axis: Y_AXIS, point: pointE([0, 0, 0]) };
const EXPECTED_FOR = {
  standard: { 'plane-plane': ['coincident', 'parallel', 'perpendicular', 'distance', 'angle'], 'axis-axis': ['concentric', 'parallel', 'perpendicular', 'distance', 'angle'], 'axis-plane': ['coincident', 'parallel', 'perpendicular', 'distance'], 'plane-axis': ['coincident', 'parallel', 'perpendicular', 'distance'], 'point-point': [], 'point-plane': [], 'plane-point': [], 'axis-point': [], 'point-axis': [] },
  advanced: { 'plane-plane': ['width', 'symmetric', 'limitDistance', 'limitAngle', 'linearCoupler', 'profileCenter'], 'axis-axis': ['symmetric', 'limitDistance', 'limitAngle', 'linearCoupler'], 'axis-plane': ['limitDistance', 'limitAngle', 'linearCoupler'], 'plane-axis': ['limitDistance', 'limitAngle', 'linearCoupler'], 'point-point': ['symmetric', 'limitDistance'], 'point-plane': [], 'plane-point': [], 'axis-point': [], 'point-axis': [] },
  mechanical: { 'plane-plane': ['cam'], 'axis-axis': ['gear', 'screw', 'hinge', 'rackPinion', 'slot', 'universalJoint'], 'axis-plane': ['rackPinion'], 'plane-axis': ['cam'], 'point-point': [], 'point-plane': [], 'plane-point': ['cam'], 'axis-point': [], 'point-axis': [] },
};
for (const [group, table] of Object.entries(EXPECTED_FOR)) {
  for (const [pairName, expected] of Object.entries(table)) {
    test(`matesFor ${pairName} (${group})`, () => {
      const [ka, kb] = pairName.split('-');
      assert.deepEqual(matesFor(KINDS[ka], KINDS[kb], group), expected);
    });
  }
}

test('matesFor "all" concatenates the three groups; a missing ref gives none', () => {
  assert.deepEqual(matesFor(TOP, BOTTOM, 'all'), [...EXPECTED_FOR.standard['plane-plane'], ...EXPECTED_FOR.advanced['plane-plane'], ...EXPECTED_FOR.mechanical['plane-plane']]);
  assert.deepEqual(matesFor(TOP, null), []);
  assert.deepEqual(matesFor(null, TOP, 'all'), []);
});

for (const type of MATE_TYPES) {
  test(`every type offered by matesFor('all') for some pair is a known type: ${type}`, () => {
    const offered = new Set();
    for (const a of Object.values(KINDS)) for (const b of [...Object.values(KINDS), { kind: 'path' }]) for (const t of matesFor(a, b, 'all')) offered.add(t);
    // lock is chosen by component, not by entity kinds.
    if (type === 'lock' || type === 'magnetic') assert.ok(!offered.has(type));
    else assert.ok(offered.has(type), `${type} is offered for some pair of refs`);
  });
}

// ───────────────────────── mate refs helpers

test('mateRefs lists a, b, c, d in order, skipping absent ones', () => {
  const m = { a: { comp: 'x' }, b: { comp: 'y' }, d: { comp: 'z' } };
  assert.deepEqual(mateRefs(m).map((r) => r.comp), ['x', 'y', 'z']);
  assert.deepEqual(mateRefs(null), []);
});

test('mateComps de-duplicates; mateTouches finds c and d refs too', () => {
  const m = { a: { comp: 'x' }, b: { comp: 'y' }, c: { comp: 'x' }, d: { comp: 'w' } };
  assert.deepEqual(mateComps(m), ['x', 'y', 'w']);
  assert.equal(mateTouches(m, 'w'), true);
  assert.equal(mateTouches(m, 'q'), false);
});

// ───────────────────────── transforms

test('quaternion multiply by identity and by conjugate', () => {
  const q = quatFromAxisAngle([0.3, -1, 2], 73);
  nearV(quatMultiply(q, quatIdentity()), q);
  nearV(quatNormalize(quatMultiply(q, quatConjugate(q))), [0, 0, 0, 1]);
});

for (const angle of [0, 30, 90, 179]) {
  test(`axis-angle round trip at ${angle}°`, () => {
    const { axis: ax, angle: a } = quatToAxisAngle(quatFromAxisAngle([1, 1, 0], angle));
    near(a, angle, 1e-9);
    if (angle) nearV(ax, [Math.SQRT1_2, Math.SQRT1_2, 0]);
  });
}

test('quatFromRotvec of a tiny vector is (almost) the identity', () => {
  nearV(quatNormalize(quatFromRotvec([1e-14, 0, 0])), [0, 0, 0, 1], 1e-12);
});

test('rotate 90° about z takes x to y', () => nearV(rotate(quatFromAxisAngle([0, 0, 1], 90), [1, 0, 0]), [0, 1, 0]));

test('relativePlacement inverts composePlacement', () => {
  const a = { position: [1, 2, 3], rotation: quatFromAxisAngle([0, 1, 0], 40) };
  const b = { position: [-5, 7, 9], rotation: quatFromAxisAngle([1, 0, 1], -25) };
  const back = composePlacement(a, relativePlacement(a, b));
  nearV(back.position, b.position);
  nearV(back.rotation, b.rotation);
});

for (const angle of [-150, -45, 0, 60, 170]) {
  test(`twistAngle reads a ${angle}° turn about z`, () => {
    near(deg(twistAngle(quatFromAxisAngle([0, 0, 1], angle), quatIdentity(), [0, 0, 1])), angle, 1e-9);
  });
}

test('instanceName counts existing copies of the part (and sub-assemblies by id)', () => {
  const asm = asmOf([{ id: '1', part: 'p' }, { id: '2', part: 'p' }, { id: '3', sub: 's' }], []);
  assert.equal(instanceName(asm, 'Plate', 'p'), 'Plate<3>');
  assert.equal(instanceName(asm, 'Sub', 's'), 'Sub<2>');
  assert.equal(instanceName(asm, 'New', 'n'), 'New<1>');
});

// ───────────────────────── coincident

test('coincident plane–plane: b sits on a (anti-aligned normals)', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) }]));
  near(placePoint(b, [0, 0, 0])[1], 10);
  near(dot(worldDir(b, [0, -1, 0]), [0, 1, 0]), -1);
});

test('coincident plane–plane aligned: normals point the same way', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'coincident', aligned: 'aligned', a: ref('g', TOP), b: ref('b', BOTTOM) }]));
  near(placePoint(b, [0, 0, 0])[1], 10);
  near(dot(worldDir(b, [0, -1, 0]), [0, 1, 0]), 1);
});

test('coincident axis–axis: the axes are the same line', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', axis([5, 0, 5], [0, 1, 0])), b: ref('b', Y_AXIS) }]));
  const p = placePoint(b, [0, 0, 0]);
  near(p[0], 5); near(p[2], 5);
  near(Math.abs(dot(worldDir(b, [0, 1, 0]), [0, 1, 0])), 1);
});

test('coincident point–point: the points meet', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', pointE([3, 4, 5])), b: ref('b', pointE([1, 1, 1])) }]));
  nearV(placePoint(b, [1, 1, 1]), [3, 4, 5]);
});

test('coincident point–plane: the point lies in the plane', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('b', pointE([2, 2, 2])) }]));
  near(placePoint(b, [2, 2, 2])[1], 10);
});

test('coincident point–axis: the point lies on the axis', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', axis([0, 0, 8], [1, 0, 0])), b: ref('b', pointE([0, 0, 0])) }]));
  const p = placePoint(b, [0, 0, 0]);
  near(p[1], 0); near(p[2], 8);
});

test('coincident axis–plane: the axis lies in the plane', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('b', X_AXIS) }]));
  near(placePoint(b, [0, 0, 0])[1], 10);
  near(dot(worldDir(b, [1, 0, 0]), [0, 1, 0]), 0);
});

// ───────────────────────── distance

for (const value of [0, 5, 12.5, 40]) {
  test(`distance plane–plane ${value} mm: the gap is ${value}`, () => {
    const [g, b] = pair();
    ok(asmOf([g, b], [{ id: 'm', type: 'distance', value, a: ref('g', TOP), b: ref('b', BOTTOM) }]));
    near(placePoint(b, [0, 0, 0])[1], 10 + value);
  });
}

test('distance plane–plane flipped: b goes to the other side of a', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'distance', value: 6, flip: true, a: ref('g', TOP), b: ref('b', BOTTOM) }]));
  near(placePoint(b, [0, 0, 0])[1], 4);
});

for (const value of [3, 7, 20]) {
  test(`distance axis–axis ${value} mm: parallel axes ${value} apart`, () => {
    const [g, b] = pair([10, 3, 2]);
    ok(asmOf([g, b], [{ id: 'm', type: 'distance', value, a: ref('g', Y_AXIS), b: ref('b', Y_AXIS) }]));
    const p = placePoint(b, [0, 0, 0]);
    near(Math.hypot(p[0], p[2]), value);
    near(Math.abs(dot(worldDir(b, [0, 1, 0]), [0, 1, 0])), 1);
  });
}

for (const value of [4, 15]) {
  test(`distance point–point ${value} mm`, () => {
    const [g, b] = pair();
    ok(asmOf([g, b], [{ id: 'm', type: 'distance', value, a: ref('g', pointE([1, 2, 3])), b: ref('b', pointE([0, 0, 0])) }]));
    const p = placePoint(b, [0, 0, 0]);
    near(Math.hypot(p[0] - 1, p[1] - 2, p[2] - 3), value);
  });
}

test('distance point–plane 9 mm along the normal', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'distance', value: 9, a: ref('g', TOP), b: ref('b', pointE([0, 0, 0])) }]));
  near(placePoint(b, [0, 0, 0])[1], 19);
});

test('distance point–axis 6 mm from the line', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'distance', value: 6, a: ref('g', Y_AXIS), b: ref('b', pointE([0, 0, 0])) }]));
  const p = placePoint(b, [0, 0, 0]);
  near(Math.hypot(p[0], p[2]), 6);
});

test('distance axis–plane 11 mm: axis parallel to the plane, 11 above', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'distance', value: 11, a: ref('g', TOP), b: ref('b', X_AXIS) }]));
  near(placePoint(b, [0, 0, 0])[1], 21);
  near(dot(worldDir(b, [1, 0, 0]), [0, 1, 0]), 0);
});

test('distance with a non-numeric value acts as 0', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'distance', value: 'abc', a: ref('g', TOP), b: ref('b', BOTTOM) }]));
  near(placePoint(b, [0, 0, 0])[1], 10);
});

// ───────────────────────── concentric, parallel, perpendicular, angle

test('concentric: the axes coincide, direction either way', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'concentric', a: ref('g', axis([-4, 0, 9], [0, 1, 0])), b: ref('b', Y_AXIS) }]));
  const p = placePoint(b, [0, 0, 0]);
  near(p[0], -4); near(p[2], 9);
  near(Math.abs(dot(worldDir(b, [0, 1, 0]), [0, 1, 0])), 1);
});

test('concentric leaves rotation about and slide along the axis free (under defined)', () => {
  const [g, b] = pair();
  const r = ok(asmOf([g, b], [{ id: 'm', type: 'concentric', a: ref('g', Y_AXIS), b: ref('b', Y_AXIS) }]));
  assert.equal(r.status.get('b'), 'under');
});

test('parallel plane–plane: normals parallel, position free', () => {
  const [g, b] = pair();
  const before = [...b.position];
  ok(asmOf([g, b], [{ id: 'm', type: 'parallel', a: ref('g', TOP), b: ref('b', TOP) }]));
  near(Math.abs(dot(worldDir(b, [0, 1, 0]), [0, 1, 0])), 1);
  // Only rotation was needed: the solver did not drift far.
  assert.ok(Math.hypot(...b.position.map((v, i) => v - before[i])) < 50);
});

test('parallel axis–axis', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'parallel', a: ref('g', Z_AXIS), b: ref('b', X_AXIS) }]));
  near(Math.abs(dot(worldDir(b, [1, 0, 0]), [0, 0, 1])), 1);
});

test('parallel axis–plane: the axis is perpendicular to the normal', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'parallel', a: ref('g', TOP), b: ref('b', Y_AXIS) }]));
  near(dot(worldDir(b, [0, 1, 0]), [0, 1, 0]), 0);
});

test('perpendicular plane–plane: normals at 90°', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'perpendicular', a: ref('g', TOP), b: ref('b', TOP) }]));
  near(angleBetween(worldDir(b, [0, 1, 0]), [0, 1, 0]), 90, 1e-3);
});

test('perpendicular axis–axis', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'perpendicular', a: ref('g', Z_AXIS), b: ref('b', Z_AXIS) }]));
  near(angleBetween(worldDir(b, [0, 0, 1]), [0, 0, 1]), 90, 1e-3);
});

test('perpendicular axis–plane: the axis is along the plane normal', () => {
  const [g, b] = pair();
  ok(asmOf([g, b], [{ id: 'm', type: 'perpendicular', a: ref('g', TOP), b: ref('b', X_AXIS) }]));
  near(Math.abs(dot(worldDir(b, [1, 0, 0]), [0, 1, 0])), 1);
});

for (const value of [15, 30, 45, 60, 90, 120, 150]) {
  test(`angle ${value}° between two plane normals`, () => {
    const [g, b] = pair([0, 0, 0], quatFromAxisAngle([0, 0, 1], value > 90 ? 100 : 5));
    ok(asmOf([g, b], [{ id: 'm', type: 'angle', value, a: ref('g', TOP), b: ref('b', TOP) }]));
    near(angleBetween(worldDir(b, [0, 1, 0]), [0, 1, 0]), value, 1e-3);
  });
}

test('angle between two axes 35°', () => {
  const [g, b] = pair([0, 0, 0], quatFromAxisAngle([0, 1, 0], 10));
  ok(asmOf([g, b], [{ id: 'm', type: 'angle', value: 35, a: ref('g', X_AXIS), b: ref('b', X_AXIS) }]));
  near(angleBetween(worldDir(b, [1, 0, 0]), [1, 0, 0]), 35, 1e-3);
});

// ───────────────────────── lock

test('lock keeps b at its captured pose relative to a when a moves', () => {
  const a = comp('a', [0, 0, 0]);
  const b = comp('b', [10, 0, 0], quatFromAxisAngle([0, 0, 1], 30));
  const asm = asmOf([a, b], [captureLock({ components: [a, b] }, { id: 'l', type: 'lock', a: { comp: 'a' }, b: { comp: 'b' } })]);
  a.position = [5, 5, 5]; a.rotation = quatFromAxisAngle([0, 0, 1], 90); a.fixed = true;
  const r = ok(asm);
  nearV(b.position, [5, 15, 5], 1e-4);
  near(deg(twistAngle(b.rotation, quatIdentity(), [0, 0, 1])), 120, 1e-3);
  assert.equal(r.status.get('b'), 'defined');
});

test('lock without a captured pose keeps the pose before the solve', () => {
  const [g, b] = pair([3, 4, 5], quatFromAxisAngle([1, 0, 0], 20));
  const pos = [...b.position];
  const r = ok(asmOf([g, b], [{ id: 'l', type: 'lock', a: { comp: 'g' }, b: { comp: 'b' } }]));
  nearV(b.position, pos);
  assert.equal(r.status.get('b'), 'defined');
});

// ───────────────────────── advanced

test('width: the tab centres between the groove faces (groove 0…20 in x, tab 6 wide)', () => {
  const [g, b] = pair([2, 0, 0], quatIdentity());
  ok(asmOf([g, b], [{ id: 'w', type: 'width', a: ref('g', plane([0, 0, 0], [1, 0, 0])), b: ref('g', plane([20, 0, 0], [-1, 0, 0])), c: ref('b', plane([0, 0, 0], [-1, 0, 0])), d: ref('b', plane([6, 0, 0], [1, 0, 0])) }]));
  near(placePoint(b, [3, 0, 0])[0], 10);
});

test('symmetric points: b is a mirrored in plane x = 5', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const s = comp('s', [0, 0, 0], quatIdentity(), true); const b = comp('b', [1, 1, 1]);
  ok(asmOf([g, s, b], [{ id: 's', type: 'symmetric', a: ref('g', pointE([2, 3, 4])), b: ref('b', pointE([0, 0, 0])), c: ref('s', plane([5, 0, 0], [1, 0, 0])) }]));
  nearV(placePoint(b, [0, 0, 0]), [8, 3, 4]);
});

test('symmetric axes: b is a mirrored axis', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [1, 1, 1]);
  ok(asmOf([g, b], [{ id: 's', type: 'symmetric', a: ref('g', axis([3, 0, 0], [0, 1, 0])), b: ref('b', Y_AXIS), c: ref('g', plane([0, 0, 0], [1, 0, 0])) }]));
  const p = placePoint(b, [0, 0, 0]);
  near(p[0], -3); near(p[2], 0);
});

test('symmetric planes: b is a mirrored plane', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [0, 3, 0]);
  ok(asmOf([g, b], [{ id: 's', type: 'symmetric', a: ref('g', plane([0, 10, 0], [0, 1, 0])), b: ref('b', plane([0, 0, 0], [0, -1, 0])), c: ref('g', plane([0, 0, 0], [0, 1, 0])) }]));
  near(placePoint(b, [0, 0, 0])[1], -10);
});

for (const [name, start, expected] of [['below the minimum', 1, 5], ['above the maximum', 40, 20], ['inside the range', 12, 12]]) {
  test(`limit distance plane–plane 5…20: a gap ${name} ends at ${expected}`, () => {
    const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [0, 10 + start, 0]);
    ok(asmOf([g, b], [{ id: 'l', type: 'limitDistance', min: 5, max: 20, a: ref('g', TOP), b: ref('b', BOTTOM) }]));
    near(placePoint(b, [0, 0, 0])[1], 10 + expected, 1e-4);
  });
}

test('limit distance axis–axis 4…8: axes 20 apart come to 8', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [20, 0, 0]);
  ok(asmOf([g, b], [{ id: 'l', type: 'limitDistance', min: 4, max: 8, a: ref('g', Y_AXIS), b: ref('b', Y_AXIS) }]));
  near(Math.hypot(b.position[0], b.position[2]), 8, 1e-4);
});

test('limit distance point–point 0…3: points 10 apart come to 3', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [10, 0, 0]);
  ok(asmOf([g, b], [{ id: 'l', type: 'limitDistance', min: 0, max: 3, a: ref('g', pointE([0, 0, 0])), b: ref('b', pointE([0, 0, 0])) }]));
  near(Math.hypot(...b.position), 3, 1e-4);
});

test('limit distance point–plane 2…6: a point 30 above comes to 6', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [0, 40, 0]);
  ok(asmOf([g, b], [{ id: 'l', type: 'limitDistance', min: 2, max: 6, a: ref('g', TOP), b: ref('b', pointE([0, 0, 0])) }]));
  near(b.position[1], 16, 1e-4);
});

test('limit distance without max has no upper bound', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [0, 110, 0]);
  ok(asmOf([g, b], [{ id: 'l', type: 'limitDistance', min: 2, a: ref('g', TOP), b: ref('b', BOTTOM) }]));
  near(b.position[1], 110, 1e-4);
});

// An inequality: any angle in the range satisfies it, so a start outside only has to end inside (the solver
// may step past the nearer limit); a start inside does not move.
for (const [name, start] of [['below the minimum', 5], ['above the maximum', 80]]) {
  test(`limit angle 20…60°: ${name} (${start}°) ends inside the range`, () => {
    const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [0, 0, 0], quatFromAxisAngle([0, 0, 1], start));
    ok(asmOf([g, b], [{ id: 'l', type: 'limitAngle', min: 20, max: 60, a: ref('g', TOP), b: ref('b', TOP) }]));
    const a = angleBetween(worldDir(b, [0, 1, 0]), [0, 1, 0]);
    assert.ok(a >= 20 - 1e-3 && a <= 60 + 1e-3, `angle ${a} in 20…60`);
  });
}
test('limit angle 20…60°: a start inside the range (40°) stays at 40°', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const b = comp('b', [0, 0, 0], quatFromAxisAngle([0, 0, 1], 40));
  ok(asmOf([g, b], [{ id: 'l', type: 'limitAngle', min: 20, max: 60, a: ref('g', TOP), b: ref('b', TOP) }]));
  near(angleBetween(worldDir(b, [0, 1, 0]), [0, 1, 0]), 40, 1e-2);
});

// ───────────────────────── mechanical

/** Two shafts on the fixed ground along z at x 0 and x 30; gear a and gear b on them. */
function gearSetup(mate) {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const a = comp('a', [0, 0, 0]);
  const b = comp('b', [30, 0, 0]);
  const asm = asmOf([g, a, b], [
    { id: 'ca', type: 'concentric', a: ref('g', Z_AXIS), b: ref('a', Z_AXIS) },
    { id: 'pa', type: 'coincident', a: ref('g', FRONT), b: ref('a', BACK) },
    { id: 'cb', type: 'concentric', a: ref('g', axis([30, 0, 0], [0, 0, 1])), b: ref('b', Z_AXIS) },
    { id: 'pb', type: 'coincident', a: ref('g', FRONT), b: ref('b', BACK) },
  ]);
  asm.mates.push(captureMate(asm, { id: 'x', a: ref('a', Z_AXIS), b: ref('b', Z_AXIS), ...mate }));
  return asm;
}

for (const [ratio, reverse] of [[1, false], [2, false], [0.5, false], [3, true], [1, true]]) {
  test(`gear ratio ${ratio}${reverse ? ' reversed' : ''}: driver 20° turns the driven gear ${reverse ? '+' : '−'}${ratio * 20}°`, () => {
    const asm = gearSetup({ type: 'gear', ratio, reverse });
    const [, a, b] = asm.components;
    a.rotation = quatFromAxisAngle([0, 0, 1], 20); a.fixed = true;
    const r = ok(asm);
    sameAngle(twistAngle(b.rotation, quatIdentity(), [0, 0, 1]), ((reverse ? 1 : -1) * ratio * 20 * Math.PI) / 180);
    assert.equal(r.status.get('b'), 'defined');
  });
}

test('gear without its partner turning keeps the driven gear still', () => {
  const asm = gearSetup({ type: 'gear', ratio: 2 });
  asm.components[1].fixed = true;
  ok(asm);
  sameAngle(twistAngle(asm.components[2].rotation, quatIdentity(), [0, 0, 1]), 0);
});

/** Pinion p on the ground's z axis; rack r slides along x at y = −10. */
function rackSetup(extra) {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const p = comp('p'); const rack = comp('r', [0, -10, 0]);
  const asm = asmOf([g, p, rack], [
    { id: 'cp', type: 'concentric', a: ref('g', Z_AXIS), b: ref('p', Z_AXIS) },
    { id: 'pp', type: 'coincident', a: ref('g', FRONT), b: ref('p', BACK) },
    { id: 'r1', type: 'coincident', a: ref('g', FRONT), b: ref('r', BACK) },
    { id: 'r2', type: 'coincident', a: ref('g', plane([0, -10, 0], [0, 1, 0])), b: ref('r', plane([0, 0, 0], [0, -1, 0])) },
    { id: 'r3', type: 'parallel', a: ref('g', plane([0, 0, 0], [1, 0, 0])), b: ref('r', plane([0, 0, 0], [1, 0, 0])) },
  ]);
  asm.mates.push(captureMate(asm, { id: 'rp', type: 'rackPinion', a: ref('p', Z_AXIS), ...extra }));
  return asm;
}

for (const [radius, reverse, turn] of [[10, false, 30], [5, false, 90], [10, true, 45], [20, false, -60]]) {
  test(`rack and pinion r=${radius}${reverse ? ' reversed' : ''}: pinion ${turn}° moves the rack ${reverse ? '−' : ''}${radius}·θ`, () => {
    const asm = rackSetup({ radius, reverse, b: ref('r', X_AXIS) });
    const [, p, rack] = asm.components;
    p.rotation = quatFromAxisAngle([0, 0, 1], turn); p.fixed = true;
    ok(asm);
    near(rack.position[0], (reverse ? -1 : 1) * radius * ((turn * Math.PI) / 180), 1e-4);
    near(rack.position[1], -10, 1e-5);
  });
}

test('rack and pinion with a plane as the rack ref: travel ⊥ pinion axis, in the plane', () => {
  const asm = rackSetup({ radius: 10, b: ref('r', plane([0, 0, 0], [0, -1, 0])) });
  const [, p, rack] = asm.components;
  p.rotation = quatFromAxisAngle([0, 0, 1], 30); p.fixed = true;
  ok(asm);
  near(Math.abs(rack.position[0]), 10 * (Math.PI / 6), 1e-4);
});

for (const [pitch, reverse] of [[1, false], [2.5, false], [2, true]]) {
  test(`screw pitch ${pitch}${reverse ? ' reversed' : ''}: a quarter turn of the nut moves it pitch / 4`, () => {
    const g = comp('g', [0, 0, 0], quatIdentity(), true);
    const n = comp('n', [0, 0, 5]);
    const asm = asmOf([g, n], []);
    asm.mates.push(captureMate(asm, { id: 's', type: 'screw', pitch, reverse, a: ref('g', Z_AXIS), b: ref('n', Z_AXIS) }));
    n.rotation = quatFromAxisAngle([0, 0, 1], 90);
    // Hold the rotation: the nut's +x side face, turned 90° about z, must face the ground's +y (angle 0).
    asm.mates.push({ id: 'p', type: 'angle', value: 0, a: ref('g', plane([0, 0, 0], [0, 1, 0])), b: ref('n', plane([0, 0, 0], [1, 0, 0])) });
    ok(asm);
    const turns = twistAngle(n.rotation, quatIdentity(), [0, 0, 1]) / (2 * Math.PI);
    near(turns, 0.25, 1e-4);
    near(n.position[2], 5 + (reverse ? -1 : 1) * pitch * 0.25, 1e-4);
    nearV(n.position.slice(0, 2), [0, 0], 1e-5);
  });
}

test('hinge holds a pin in a hole and a face on a face; flipped alignment puts it on the other side', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const b = comp('b', [3, 3, 3], quatFromAxisAngle([1, 0, 0], 10));
  const r = ok(asmOf([g, b], [{ id: 'h', type: 'hinge', aligned: 'aligned', a: ref('g', axis([2, 2, 0], [0, 0, 1])), b: ref('b', Z_AXIS), c: ref('g', FRONT), d: ref('b', FRONT) }]));
  nearV(placePoint(b, [0, 0, 0]), [2, 2, 0]);
  near(dot(worldDir(b, [0, 0, 1]), [0, 0, 1]), 1);
  assert.equal(r.status.get('b'), 'under');
});

test('cam with a roller follower: its centre ends followerRadius from the profile', () => {
  // Cam: a 20 × 20 square outline (x, y from −10 to 10) on the fixed ground, axis z.
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const f = comp('f', [0, 30, 0]);
  const asm = asmOf([g, f], [
    { id: 'slide', type: 'coincident', a: ref('g', axis([0, 0, 0], [0, 1, 0])), b: ref('f', pointE([0, 0, 0])) },
    { id: 'cam', type: 'cam', followerRadius: 3, profile: [[-10, -10, 0], [10, -10, 0], [10, 10, 0], [-10, 10, 0]], a: ref('g', FRONT), b: ref('f', pointE([0, 0, 0])) },
  ]);
  ok(asm);
  near(f.position[1], 13, 1e-4);
});

test('cam with a flat follower: the nearest profile point lies on its face', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true);
  const f = comp('f', [0, 30, 0]);
  const asm = asmOf([g, f], [
    { id: 'slide', type: 'parallel', a: ref('g', TOP), b: ref('f', BOTTOM) },
    { id: 'line', type: 'coincident', a: ref('g', axis([0, 0, 0], [0, 1, 0])), b: ref('f', pointE([0, 0, 0])) },
    { id: 'cam', type: 'cam', profile: [[-10, -10, 0], [10, -10, 0], [10, 12, 0], [-10, 12, 0]], a: ref('g', FRONT), b: ref('f', plane([0, 0, 0], [0, -1, 0])) },
  ]);
  ok(asm);
  near(f.position[1], 12, 1e-4);
});

test('cam with fewer than three profile points does nothing', () => {
  assert.deepEqual(mateResiduals({ type: 'cam', profile: [[0, 0, 0]] }, { a: FRONT, b: pointE([0, 0, 0]) }, 10, { a: { position: [0, 0, 0], rotation: quatIdentity() } }), [0]);
});

// ───────────────────────── capture

test('captureMate stores lock.relative, and base for gear, rackPinion and screw; nothing for others', () => {
  const a = comp('a', [1, 0, 0]); const b = comp('b', [0, 2, 0], quatFromAxisAngle([0, 0, 1], 10));
  const asm = asmOf([a, b], []);
  for (const type of MATE_TYPES) {
    const m = captureMate(asm, { id: type, type, a: { comp: 'a' }, b: { comp: 'b' } });
    if (type === 'lock') { assert.ok(m.relative, 'lock'); nearV(m.relative.position, [-1, 2, 0]); }
    else if (['gear', 'rackPinion', 'screw', 'linearCoupler', 'universalJoint'].includes(type)) { assert.deepEqual(m.base.pa, [1, 0, 0], type); assert.deepEqual(m.base.pb, [0, 2, 0], type); }
    else { assert.equal(m.relative, undefined, type); assert.equal(m.base, undefined, type); }
  }
});

test('captureGear copies the arrays (later moves do not change the base)', () => {
  const a = comp('a'); const b = comp('b', [5, 0, 0]);
  const m = captureGear(asmOf([a, b], []), { type: 'gear', a: { comp: 'a' }, b: { comp: 'b' } });
  b.position[0] = 99;
  assert.equal(m.base.pb[0], 5);
});

test('capture with a missing component leaves the mate alone', () => {
  const m = captureMate(asmOf([comp('a')], []), { type: 'lock', a: { comp: 'a' }, b: { comp: 'nope' } });
  assert.equal(m.relative, undefined);
});

// ───────────────────────── status, failures, skipped mates

test('status: a fixed component stays fixed and does not move', () => {
  const [g, b] = pair();
  const r = ok(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) }]));
  assert.equal(r.status.get('g'), 'fixed');
  nearV(g.position, [0, 0, 0], 0);
});

test('status: three coincident faces of a box fully define it', () => {
  const [g, b] = pair([5, 15, 4], quatFromAxisAngle([0, 1, 0], 8));
  const r = ok(asmOf([g, b], [
    { id: 'y', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) },
    { id: 'x', type: 'coincident', a: ref('g', plane([0, 0, 0], [1, 0, 0])), b: ref('b', plane([0, 0, 0], [-1, 0, 0])) },
    { id: 'z', type: 'coincident', a: ref('g', FRONT), b: ref('b', BACK) },
  ]));
  assert.equal(r.status.get('b'), 'defined');
  nearV(b.position, [0, 10, 0], 1e-5);
});

test('status: one coincident face leaves b under defined', () => {
  const [g, b] = pair();
  assert.equal(ok(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) }])).status.get('b'), 'under');
});

test('status: a component with no mates is under defined and does not move', () => {
  const [g, b] = pair();
  const c = comp('c', [1, 2, 3]);
  const r = solve(asmOf([g, b, c], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) }]));
  assert.equal(r.status.get('c'), 'under');
  nearV(c.position, [1, 2, 3]);
});

test('status: no free components → empty failure list, ground fixed', () => {
  const r = solve(asmOf([comp('g', [0, 0, 0], quatIdentity(), true)], []));
  assert.deepEqual(r.failed, []);
  assert.equal(r.status.get('g'), 'fixed');
});

test('over-constrained: coincident and distance 5 on the same faces — one of them fails', () => {
  const [g, b] = pair();
  const r = solve(asmOf([g, b], [
    { id: 'c', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) },
    { id: 'd', type: 'distance', value: 5, a: ref('g', TOP), b: ref('b', BOTTOM) },
  ]));
  assert.ok(r.failed.length >= 1, 'a conflicting pair is reported');
  assert.ok(r.failed.every((id) => id === 'c' || id === 'd'));
});

test('over-constrained: parallel and perpendicular on the same faces', () => {
  const [g, b] = pair();
  const r = solve(asmOf([g, b], [
    { id: 'p', type: 'parallel', a: ref('g', TOP), b: ref('b', TOP) },
    { id: 'q', type: 'perpendicular', a: ref('g', TOP), b: ref('b', TOP) },
  ]));
  assert.ok(r.failed.length >= 1);
});

test('impossible: a mate between two fixed components that do not meet fails', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const h = comp('h', [0, 50, 0], quatIdentity(), true);
  assert.deepEqual(solve(asmOf([g, h], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('h', BOTTOM) }])).failed, ['m']);
});

test('redundant but consistent mates both hold (coincident twice)', () => {
  const [g, b] = pair();
  const r = solve(asmOf([g, b], [
    { id: 'c1', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) },
    { id: 'c2', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) },
  ]));
  assert.deepEqual(r.failed, []);
});

test('a suppressed mate is ignored (b does not move)', () => {
  const [g, b] = pair();
  const pos = [...b.position];
  solve(asmOf([g, b], [{ id: 'm', type: 'coincident', suppressed: true, a: ref('g', TOP), b: ref('b', BOTTOM) }]));
  nearV(b.position, pos);
});

test('a mate to a deleted component is skipped, not failed', () => {
  const [g, b] = pair();
  const r = solve(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('gone', BOTTOM) }]));
  assert.deepEqual(r.failed, []);
});

test('a width mate missing its c / d refs is skipped', () => {
  const [g, b] = pair();
  const r = solve(asmOf([g, b], [{ id: 'w', type: 'width', a: ref('g', TOP), b: ref('g', BOTTOM) }]));
  assert.deepEqual(r.failed, []);
});

test('the entity callback re-reads refs (rebuilt geometry): a moved face moves b', () => {
  const [g, b] = pair();
  const asm = asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', { ...TOP, sig: 'top' }), b: ref('b', BOTTOM) }]);
  solveMates(asm, { size: 50, entity: (r) => (r.sig === 'top' ? plane([0, 25, 0], [0, 1, 0]) : r) });
  near(placePoint(b, [0, 0, 0])[1], 25);
});

test('an entity the callback cannot find (null) skips the mate', () => {
  const [g, b] = pair();
  const pos = [...b.position];
  const r = solveMates(asmOf([g, b], [{ id: 'm', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) }]), { entity: () => null });
  assert.deepEqual(r.failed, []);
  nearV(b.position, pos);
});

test('a chain: c mates to b, b mates to the ground — both solved at once', () => {
  const [g, b] = pair();
  const c = comp('c', [40, 40, 40]);
  const r = ok(asmOf([g, b, c], [
    { id: 'm1', type: 'coincident', a: ref('g', TOP), b: ref('b', BOTTOM) },
    { id: 'm2', type: 'coincident', a: ref('b', TOP), b: ref('c', BOTTOM) },
  ]));
  near(placePoint(c, [0, 0, 0])[1], 20);
  assert.equal(r.status.get('c'), 'under');
});

for (const type of MATE_TYPES) {
  test(`mateResiduals of ${type} returns finite numbers for a sensible configuration`, () => {
    const refs = { a: Z_AXIS, b: Z_AXIS, c: FRONT, d: BACK };
    if (['coincident', 'distance', 'parallel', 'perpendicular', 'angle', 'width', 'symmetric', 'limitDistance', 'limitAngle', 'cam'].includes(type)) { refs.a = TOP; refs.b = BOTTOM; refs.c = FRONT; refs.d = BACK; }
    if (type === 'rackPinion') refs.b = X_AXIS;
    const p = { position: [0, 0, 0], rotation: quatIdentity() };
    const res = mateResiduals({ type, value: 5, profile: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }, refs, 10, { a: p, b: p, c: p, d: p }, { a: p, b: p });
    assert.ok(Array.isArray(res) && res.length > 0, 'some residuals');
    assert.ok(res.every(Number.isFinite), JSON.stringify(res));
  });
}

test('mateResiduals of an unknown type is empty', () => assert.deepEqual(mateResiduals({ type: 'nope' }, { a: TOP, b: TOP }, 10), []));

test('mateResiduals accepts the old (m, a, b, K) call form', () => {
  const r = mateResiduals({ type: 'coincident' }, TOP, BOTTOM, 10);
  assert.equal(r.length, 4);
  near(r[3], -10);
});

// ───────────────────────── motors

test('a linear motor moves its component speed × t along its axis', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const s = comp('s', [0, 0, 0]);
  const asm = asmOf([g, s], [{ id: 'c', type: 'concentric', a: ref('g', X_AXIS), b: ref('s', X_AXIS) }]);
  asm.motion = { duration: 2, motors: [{ id: 'm', kind: 'linear', comp: 's', ref: ref('s', X_AXIS), speed: 15 }] };
  const f = motionFrame(asm, 1.5, { size: 50 });
  assert.deepEqual(f.failed, []);
  near(f.placements.get('s').position[0], 22.5, 1e-6);
});

test('a rotary motor at 30 rpm turns its component 180° in one second', () => {
  const g = comp('g', [0, 0, 0], quatIdentity(), true); const s = comp('s', [0, 0, 0]);
  const asm = asmOf([g, s], [{ id: 'c', type: 'concentric', a: ref('g', Z_AXIS), b: ref('s', Z_AXIS) }]);
  asm.motion = { duration: 2, motors: [{ id: 'm', kind: 'rotary', comp: 's', ref: ref('s', Z_AXIS), speed: 30 }] };
  sameAngle(twistAngle(motionFrame(asm, 1, { size: 50 }).placements.get('s').rotation, quatIdentity(), [0, 0, 1]), Math.PI);
});

test('a motor on a missing component is ignored', () => {
  const asm = asmOf([comp('g', [0, 0, 0], quatIdentity(), true)], []);
  asm.motion = { motors: [{ id: 'm', kind: 'rotary', comp: 'nope', ref: ref('nope', Z_AXIS), speed: 30 }] };
  assert.equal(motionFrame(asm, 1).ok, true);
});
