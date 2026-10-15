// Assembly: poses, joints, the solver inside the document's undo steps.
import assert from 'node:assert/strict';
import test from 'node:test';
import { animationPhase, drivenJoints, makeJoint, normalizeAnimation, normalizeJoints, placementOf, poseOf, solveAssembly } from '../../src/domain/assembly.js';
import { addEntity, createDrawing, normalizeDrawing, updateEntity } from '../../src/domain/drawing.js';
import { DrawingDocument } from '../../src/domain/document.js';
import { placement } from '../../src/domain/solids.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const nearPoint = (p, q, tol = 1e-6) => p.forEach((v, i) => near(v, q[i], tol));

test('poses: the same rotation as the solid placement, and back to angles', () => {
  const e = { x: 10, y: -5, z: 3, rx: 30, ry: -50, rz: 120 };
  const m = poseOf(e);
  const map = placement({ ...e, scale: 1 });
  for (const p of [[1, 0, 0], [0, 2, 0], [0, 0, 3], [4, 5, 6]]) nearPoint([m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]], map(p));
  const back = placementOf(m);
  for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) near(back[k], e[k], 1e-9);
  // Gimbal lock: still the same rotation.
  const locked = poseOf(placementOf(poseOf({ rx: 20, ry: 90, rz: 10 })));
  poseOf({ rx: 20, ry: 90, rz: 10 }).forEach((v, i) => near(v, locked[i], 1e-9));
});

test('joints: a hinged door turns about its hinge; a slider slides; a fixed part rides along', () => {
  const frame = { id: 'f', type: 'solid', x: 0, y: 0, z: 0 };
  const door = { id: 'd', type: 'solid', x: 100, y: 0, z: 0 };
  const hinge = makeJoint('revolute', frame, door, [100, 0, 0], [0, 0, 1], 'j1');
  const turned = solveAssembly([frame, door], [{ ...hinge, angle: 90 }]).entities[1];
  near(turned.x, 100); near(turned.y, 0); near(turned.rz, 90);
  // The door's far corner (800, 0) swings round to (100, 800).
  nearPoint(placement(turned)([800, 0, 0]), [100, 800, 0]);
  const slide = makeJoint('slider', frame, door, [100, 0, 0], [1, 0, 0], 'j2');
  near(solveAssembly([frame, door], [{ ...slide, offset: 250 }]).entities[1].x, 350);
  // Moving the base takes the part along; joints in a chain follow one another.
  const knob = { id: 'k', type: 'solid', x: 700, y: 50, z: 0 };
  const fixed = makeJoint('fixed', door, knob, [700, 50, 0], [0, 0, 1], 'j3');
  const moved = solveAssembly([{ ...frame, x: 1000 }, door, knob], [{ ...hinge, angle: 90 }, fixed]).entities;
  nearPoint([moved[2].x, moved[2].y], [1000 + 100 - 50, 600]);
  // A part left unchanged is the same object (meshes stay cached).
  const still = [frame, door];
  assert.equal(solveAssembly(still, [hinge]).entities[1], door);
});

test('loops and missing parts are reported, not looped over; bad joints are dropped', () => {
  const a = { id: 'a', type: 'solid' }; const b = { id: 'b', type: 'solid', x: 5 };
  const j1 = makeJoint('fixed', a, b, [0, 0, 0], [0, 0, 1], 'j1');
  const j2 = makeJoint('fixed', b, a, [0, 0, 0], [0, 0, 1], 'j2');
  assert.deepEqual(solveAssembly([a, b], [j1, j2]).failed.sort(), ['j1', 'j2']);
  assert.deepEqual(normalizeJoints([j1, { ...j1, type: 'weld' }, { ...j1, part: 'a' }, { ...j1, frame: [1] }]).map((j) => j.id), ['j1']);
});

test('document: joints solve on every change and leave with their parts', () => {
  const doc = new DrawingDocument(createDrawing());
  const base = doc.apply('add', (d) => addEntity(d, 'solid', { kind: 'box', params: { length: 1000, width: 50, height: 50 } }));
  const arm = doc.apply('add', (d) => addEntity(d, 'solid', { kind: 'box', params: { length: 500, width: 40, height: 40 }, x: 1000, z: 50 }));
  doc.apply('joint', (d) => { d.joints = [makeJoint('revolute', base, arm, [1000, 0, 50], [0, 0, 1], 'j1')]; });
  doc.apply('turn', (d) => { d.joints = d.joints.map((j) => ({ ...j, angle: 90 })); });
  let moved = doc.drawing.entities.find((e) => e.id === arm.id);
  near(moved.rz, 90);
  doc.apply('move base', (d) => updateEntity(d, base.id, { y: 300 }));
  moved = doc.drawing.entities.find((e) => e.id === arm.id);
  near(moved.y, 300);
  // Saved and opened again, the joint is still there.
  assert.equal(normalizeDrawing(JSON.parse(JSON.stringify(doc.drawing))).joints.length, 1);
  doc.apply('delete', (d) => { d.entities = d.entities.filter((e) => e.id !== base.id); });
  assert.equal(doc.drawing.joints, undefined);
});

const rz = (deg) => (deg * Math.PI) / 180;

test('crank and slider: the piston sits at r·cosθ + √(L² − r²·sin²θ) all the way round', () => {
  const ground = { id: 'g', type: 'solid' };
  const crank = { id: 'c', type: 'solid' };
  const rod = { id: 'r', type: 'solid', x: 50 };
  const piston = { id: 'p', type: 'solid', x: 200 };
  const joints = [
    { ...makeJoint('revolute', ground, crank, [0, 0, 0], [0, 0, 1], 'crank'), drive: { key: 'angle', from: 0, to: 360 } },
    makeJoint('revolute', crank, rod, [50, 0, 0], [0, 0, 1], 'pin'),
    makeJoint('slider', ground, piston, [200, 0, 0], [1, 0, 0], 'bore'),
    makeJoint('revolute', rod, piston, [200, 0, 0], [0, 0, 1], 'wrist'),
  ];
  let current = joints;
  for (let deg = 0; deg <= 360; deg += 15) {
    const run = solveAssembly([ground, crank, rod, piston], drivenJoints(current, deg / 360 * 4, { duration: 4, mode: 'once' }));
    assert.deepEqual(run.failed, [], `θ ${deg}`);
    current = run.joints;
    const x = run.entities[3].x;
    near(x, 50 * Math.cos(rz(deg)) + Math.sqrt(150 ** 2 - (50 * Math.sin(rz(deg))) ** 2), 1e-3);
    near(run.entities[3].y ?? 0, 0, 1e-6);
  }
});

test('four-bar linkage: both links keep their lengths as the crank turns (warm start keeps the branch)', () => {
  const B0 = [40, 0]; const C0 = [136.6667, Math.sqrt(6400 - 36.6667 ** 2)];
  const ground = { id: 'g', type: 'solid' };
  const crank = { id: 'c', type: 'solid' };
  const coupler = { id: 'k', type: 'solid', x: B0[0], rz: (Math.atan2(C0[1], C0[0] - B0[0]) * 180) / Math.PI };
  const rocker = { id: 'r', type: 'solid', x: 100, rz: (Math.atan2(C0[1], C0[0] - 100) * 180) / Math.PI };
  let joints = [
    { ...makeJoint('revolute', ground, crank, [0, 0, 0], [0, 0, 1], 'a'), drive: { key: 'angle', from: 0, to: 360 } },
    makeJoint('revolute', crank, coupler, [...B0, 0], [0, 0, 1], 'b'),
    makeJoint('revolute', ground, rocker, [100, 0, 0], [0, 0, 1], 'd'),
    makeJoint('revolute', coupler, rocker, [...C0, 0], [0, 0, 1], 'c'),
  ];
  for (let step = 0; step <= 24; step++) {
    const run = solveAssembly([ground, crank, coupler, rocker], drivenJoints(joints, step / 24, { duration: 1, mode: 'once' }));
    assert.deepEqual(run.failed, []);
    joints = run.joints;
    const [, c, k, r] = run.entities;
    const B = placement({ ...c, scale: 1 })([40, 0, 0]);
    near(Math.hypot(B[0] - (k.x ?? 0), B[1] - (k.y ?? 0)), 0, 1e-3);
    const Ck = placement({ ...k, scale: 1 })([120, 0, 0]);
    const Cr = placement({ ...r, scale: 1 })([80, 0, 0]);
    nearPoint(Ck, Cr, 1e-3);
    assert.ok(Ck[1] > -1e-6 || step > 0, 'upper branch');
  }
});

test('couplings: gears turn the other way by the ratio; a screw advances its pitch per turn', () => {
  const base = { id: 'b', type: 'solid' };
  const g1 = { id: 'g1', type: 'solid' }; const g2 = { id: 'g2', type: 'solid', x: 60 };
  const nut = { id: 'n', type: 'solid', x: 200 };
  const j1 = { ...makeJoint('revolute', base, g1, [0, 0, 0], [0, 0, 1], 'j1'), angle: 30 };
  const j2 = { ...makeJoint('revolute', base, g2, [60, 0, 0], [0, 0, 1], 'j2'), follow: { joint: 'j1', key: 'angle', from: 'angle', ratio: -0.5, phase: 0 } };
  const screw = { ...makeJoint('cylindrical', base, nut, [200, 0, 0], [1, 0, 0], 'j3'), angle: 720, follow: { joint: 'j3', key: 'offset', from: 'angle', ratio: 2 / 360, phase: 0 } };
  const [norm2, norm3] = normalizeJoints([j2, screw]);
  const run = solveAssembly([base, g1, g2, nut], [j1, norm2, norm3]);
  near(run.entities[2].rz, -15);
  near(run.entities[3].x, 204);
  // Following itself on the same value is meaningless and dropped.
  assert.equal(normalizeJoints([{ ...j1, follow: { joint: 'j1', key: 'angle', from: 'angle', ratio: 2 } }])[0].follow, undefined);
});

test('animation: loop, bounce and once phases; drives only where from ≠ to', () => {
  assert.equal(animationPhase(5, { duration: 4, mode: 'loop' }), 0.25);
  assert.equal(animationPhase(5, { duration: 4, mode: 'bounce' }), 0.75);
  assert.equal(animationPhase(5, { duration: 4, mode: 'once' }), 1);
  assert.deepEqual(normalizeAnimation({ duration: -1, mode: 'x' }), { duration: 4, mode: 'loop' });
  const base = { id: 'b', type: 'solid' }; const part = { id: 'p', type: 'solid' };
  const j = makeJoint('slider', base, part, [0, 0, 0], [1, 0, 0], 'j');
  assert.deepEqual(normalizeJoints([{ ...j, drive: { key: 'offset', from: 10, to: 110 } }])[0].drive, { key: 'offset', from: 10, to: 110 });
  assert.equal(normalizeJoints([{ ...j, drive: { key: 'angle', from: 0, to: 90 } }])[0].drive, undefined);
  near(drivenJoints([{ ...j, drive: { key: 'offset', from: 10, to: 110 } }], 1, { duration: 4 })[0].offset, 35);
});

test('scrubbing far in one go stays on the branch (walked in small steps)', async () => {
  const { solveAnimation } = await import('../../src/domain/assembly.js');
  const ground = { id: 'g', type: 'solid' }; const crank = { id: 'c', type: 'solid' };
  const rod = { id: 'r', type: 'solid', x: 50 }; const piston = { id: 'p', type: 'solid', x: 200 };
  const joints = [
    { ...makeJoint('revolute', ground, crank, [0, 0, 0], [0, 0, 1], 'crank'), drive: { key: 'angle', from: 0, to: 360 } },
    makeJoint('revolute', crank, rod, [50, 0, 0], [0, 0, 1], 'pin'),
    makeJoint('slider', ground, piston, [200, 0, 0], [1, 0, 0], 'bore'),
    makeJoint('revolute', rod, piston, [200, 0, 0], [0, 0, 1], 'wrist'),
  ];
  const run = solveAnimation([ground, crank, rod, piston], joints, 0, 1.9, { duration: 4, mode: 'loop' });
  const deg = (1.9 / 4) * 360;
  near(run.entities[3].x, 50 * Math.cos(rz(deg)) + Math.sqrt(150 ** 2 - (50 * Math.sin(rz(deg))) ** 2), 1e-3);
});
