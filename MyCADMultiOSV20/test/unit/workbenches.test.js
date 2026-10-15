// FreeCAD Spreadsheet (styles, merging, CSV import), Assembly (ball, distance,
// parallel, perpendicular and angle joints, grounding, exploded view, BOM,
// ASMT), Robot (home, tool on the flange, trajectories) and OpenSCAD (hull,
// Minkowski sum).
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCells, mergeOf, normalizeSpreadsheet, parseCsv, rangeCells, splitCell, styleCells } from '../../src/domain/spreadsheet.js';
import { billOfMaterials, explodeDeltas, makeJoint, makeOrientedJoint, normalizeJoints, poseOf, solveAssembly, toAsmt } from '../../src/domain/assembly.js';
import { compoundTrajectory, dressUpTrajectory, flangePose, followRobotTools, normalizeRobotData, robotJointValues } from '../../src/domain/robot.js';
import { boundaryLoops, convexHull2d, convexHull3d, minkowskiHull } from '../../src/domain/meshops.js';
import { meshVolume, normalizeSolidData, solidMesh } from '../../src/domain/solids.js';
import { normalizeEntity } from '../../src/domain/entities.js';
import { createDrawing, normalizeDrawing } from '../../src/domain/drawing.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const solid = (id, p = {}) => normalizeEntity({ id, type: 'solid', kind: 'box', params: { length: 10, width: 10, height: 10 }, ...p });
const zAxis = (e) => { const m = poseOf(e); return [m[2], m[6], m[10]]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('spreadsheet: styles, blocks of cells merged and split, CSV import with quotes and semicolons', () => {
  assert.deepEqual(rangeCells('B2', 'A1'), ['A1', 'B1', 'A2', 'B2']);
  let s = normalizeSpreadsheet({ cells: { A1: '1' } });
  s = styleCells(s, ['A1', 'B1'], { b: true, h: 'center' });
  assert.deepEqual(s.styles.A1, { b: true, h: 'center' });
  s = styleCells(s, ['A1'], { b: null });
  assert.deepEqual(s.styles.A1, { h: 'center' });
  s = mergeCells(s, 'A1', 'B2');
  assert.deepEqual(s.merged, [{ from: 'A1', to: 'B2' }]);
  assert.equal(mergeOf(s, 'B2').from, 'A1');
  s = mergeCells(s, 'B2', 'C3');
  assert.deepEqual(s.merged, [{ from: 'B2', to: 'C3' }], 'a new block replaces one it overlaps');
  s = splitCell(s, 'C3');
  assert.equal(s.merged.length, 0);
  const kept = normalizeSpreadsheet({ cells: { A1: 'x' }, styles: { A1: { i: true, v: 'bottom', bogus: 1 } }, merged: [{ from: 'B3', to: 'A1' }, { from: 'A2', to: 'A2' }] });
  assert.deepEqual(kept.styles.A1, { i: true, v: 'bottom' });
  assert.deepEqual(kept.merged, [{ from: 'A1', to: 'B3' }], 'ordered corners; a single cell is no block');
  const csv = parseCsv('﻿name;value\n"bolt; M6";4,5\r\nnut;"say ""hi"""\n');
  assert.deepEqual(csv.cells, { A1: 'name', B1: 'value', A2: 'bolt; M6', B2: '4,5', A3: 'nut', B3: 'say "hi"' });
  assert.deepEqual(parseCsv('1,2,3\n4,5,6').cells, { A1: '1', B1: '2', C1: '3', A2: '4', B2: '5', C2: '6' });
});

test('assembly: ball keeps the point, distance keeps the plane gap, parallel / perpendicular / angle set the axis', () => {
  const base = solid('b');
  const tilted = solid('p', { x: 30, y: 5, z: 7, rx: 20, ry: 10 });
  for (const [type, check] of [
    ['parallel', (e) => near(dot(zAxis(e), [0, 0, 1]), 1)],
    ['perpendicular', (e) => near(dot(zAxis(e), [0, 0, 1]), 0)],
    ['angle', (e) => near(dot(zAxis(e), [0, 0, 1]), Math.cos(Math.PI / 4))],
  ]) {
    const j = makeOrientedJoint(type, base, tilted, { tilt: 45, id: 'j1' });
    const run = solveAssembly([base, tilted], normalizeJoints([j]));
    const moved = run.entities.find((e) => e.id === 'p');
    check(moved);
    near(moved.x, 30, 1e-6); near(moved.y, 5, 1e-6);
  }
  const d = makeOrientedJoint('distance', base, tilted, { distance: 12, id: 'j1' });
  const placed = solveAssembly([base, tilted], normalizeJoints([d])).entities.find((e) => e.id === 'p');
  near(placed.z, 12, 1e-6);
  near(placed.x, 30, 1e-6);
  near(dot(zAxis(placed), [0, 0, 1]), 1);
  const ball = makeOrientedJoint('ball', base, tilted, { id: 'j1' });
  const turned = solveAssembly([base, tilted], normalizeJoints([{ ...ball, rz: (ball.rz ?? 0) + 30 }])).entities.find((e) => e.id === 'p');
  near(turned.x, 30, 1e-6); near(turned.z, 7, 1e-6);
  assert.notEqual(Math.round(turned.rz), Math.round(tilted.rz ?? 0));
});

test('assembly: a grounded part is not moved; exploded view, bill of materials and ASMT text', () => {
  const base = solid('b');
  const part = solid('p', { x: 20, grounded: true });
  assert.equal(part.grounded, true);
  const j = { ...makeJoint('revolute', base, part, [20, 0, 0], [0, 0, 1], 'j1'), angle: 40 };
  const run = solveAssembly([base, part], normalizeJoints([j]));
  assert.equal(run.entities.find((e) => e.id === 'p').rz ?? 0, 0, 'grounded: stays');
  const deltas = explodeDeltas([base, solid('c', { x: 20 })], 2, (e) => [e.x ?? 0, 0, 0]);
  assert.deepEqual([deltas.get('b')[3], deltas.get('c')[3]], [-20, 20]);
  const rows = billOfMaterials([solid('a', { name: 'Plate' }), solid('b', { name: 'Plate' }), solid('c', { name: 'Pin' })], { volumeOf: () => 1000 });
  assert.deepEqual(rows.map((r) => [r.name, r.count]), [['Plate', 2], ['Pin', 1]]);
  const text = toAsmt([base, part], normalizeJoints([j]), { name: 'Test' });
  assert.match(text, /^OndselSolver\nAssembly/);
  assert.match(text, /RevoluteJoint[\s\S]*MarkerI\n\t+\/Test\/b\/j1_i/);
});

test('robot: data kept in the file, flange pose, a tool shape follows the arm, compound and dressed trajectories', () => {
  const data = normalizeRobotData({ r: { home: [0, -90, 90, 0, 90, 0], orientation: [0, 180, 0], defaults: { speed: 30 }, tool: { id: 't', rel: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 50] }, trajectories: [{ name: 'A', points: [[0, 0, 0], [10, 0, 0]] }] } });
  assert.equal(data.r.defaults.speed, 30);
  assert.equal(data.r.trajectories[0].speed, 30, 'a trajectory takes the robot defaults');
  const robot = normalizeEntity({ id: 'r', type: 'solid', kind: 'robot', params: {} });
  const tool = solid('t');
  const d = { ...createDrawing(), entities: [robot, tool], robots: data };
  followRobotTools(d);
  const flange = flangePose(poseOf(robot), robotJointValues(robot));
  const placed = d.entities.find((e) => e.id === 't');
  const tip = poseOf(placed);
  near(tip[3], flange[3] + 50 * flange[2], 1e-6); near(tip[11], flange[11] + 50 * flange[10], 1e-6);
  // Turning the first axis turns the tool round.
  const turned = { ...d, entities: d.entities.map((e) => (e.id === 'r' ? { ...e, params: { ...e.params, a1: 45 } } : e)) };
  followRobotTools(turned);
  assert.notEqual(Math.round(turned.entities.find((e) => e.id === 't').y), Math.round(placed.y));
  const both = compoundTrajectory([data.r.trajectories[0], { ...data.r.trajectories[0], points: [[20, 0, 0]] }], 'AB');
  assert.equal(both.points.length, 3);
  const dressed = dressUpTrajectory(data.r.trajectories[0], { offset: [0, 0, 5], speed: 80 });
  assert.deepEqual(dressed.points[1], [10, 0, 5]);
  assert.equal(dressed.speed, 80);
  assert.equal(normalizeDrawing({ ...createDrawing(), robots: data, exploded: { factor: 2 } }).exploded.factor, 2);
});

test('OpenSCAD: the hull of two boxes is closed and holds both; Minkowski of a box and a cube adds their sizes', () => {
  const a = solidMesh(normalizeSolidData({ type: 'solid', kind: 'box', params: { length: 10, width: 10, height: 10 } }));
  const b = a.map((tri) => tri.map((p) => [p[0] + 30, p[1], p[2]]));
  const hull = convexHull3d([...a, ...b].flat());
  assert.equal(boundaryLoops(hull).loops.length, 0, 'closed');
  near(meshVolume(hull), 40 * 10 * 10, 1e-6);
  const cube = solidMesh(normalizeSolidData({ type: 'solid', kind: 'box', params: { length: 2, width: 2, height: 2 } }));
  near(meshVolume(minkowskiHull(a, cube)), 12 * 12 * 12, 1e-6);
  const square = convexHull2d([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 2, y: 2 }, { x: 1, y: 3 }]);
  assert.equal(square.length, 4);
});
