// Assembly: poses, joints, the solver inside the document's undo steps.
import assert from 'node:assert/strict';
import test from 'node:test';
import { makeJoint, normalizeJoints, placementOf, poseOf, solveAssembly } from '../../src/domain/assembly.js';
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
