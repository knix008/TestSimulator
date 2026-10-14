// Points and Reverse Engineering: point cloud files, fits, mesh from points.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createEntity, normalizeEntity } from '../../src/domain/entities.js';
import { exportMesh, importMesh } from '../../src/domain/exchange3d.js';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import { delaunay, eulerTo, fitCylinder, fitPlane, fitSphere, meshFromPoints, parsePointCloud } from '../../src/domain/points.js';
import { placement, solidFootprint, solidPoints } from '../../src/domain/solids.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;

test('point clouds: xyz, csv-like, pts with a count, ASCII pcd; written back as xyz', () => {
  assert.deepEqual(parsePointCloud('1 2 3\n4,5,6\n# no\n7 8 9 0.5'), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(parsePointCloud('3\n1 2 3\n4 5 6\n7 8 9\n'), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(parsePointCloud('# .PCD v0.7\nVERSION 0.7\nFIELDS x y z\nPOINTS 3\nDATA ascii\n1 2 3\n4 5 6\n7 8 9\n').length, 9);
  assert.throws(() => parsePointCloud('VERSION 0.7\nDATA binary\n'), /ASCII/);
  const { entities } = importMesh('xyz', '0 0 0\n10 0 0\n0 10 0\n0 0 10\n');
  const cloud = normalizeEntity(entities[0]);
  assert.equal(cloud.kind, 'points');
  assert.equal(solidPoints(cloud).length, 4);
  assert.ok(solidFootprint(cloud).some((p) => p.kind === 'circle'), 'dots in the plan');
  const d = createDrawing();
  addEntity(d, 'solid', { ...entities[0], x: 100 });
  assert.match(new TextDecoder().decode(exportMesh('xyz', d, d.entities)), /^100 0 0\n110 0 0\n/);
});

test('fits: plane, sphere and cylinder come back exactly from points on them', () => {
  const plane = [];
  for (let i = 0; i < 400; i++) { const x = rnd() * 100; const y = rnd() * 50; plane.push(x, y, 2 + 0.1 * x + 0.3 * y); }
  const p = fitPlane(plane);
  const n = [-0.1, -0.3, 1].map((v) => v / Math.hypot(0.1, 0.3, 1));
  p.normal.forEach((v, i) => near(v, n[i], 1e-9));
  near(p.rms, 0, 1e-9);
  const sphere = [];
  for (let i = 0; i < 1000; i++) { const u = rnd() * 2; const t = rnd() * 2 * Math.PI; const r = Math.sqrt(1 - u * u); sphere.push(10 + 25 * r * Math.cos(t), -5 + 25 * r * Math.sin(t), 3 + 25 * u); }
  const s = fitSphere(sphere);
  near(s.radius, 25, 1e-6);
  [10, -5, 3].forEach((v, i) => near(s.center[i], v, 1e-6));
  const axis = [0.3, 0.2, 0.93].map((v) => v / Math.hypot(0.3, 0.2, 0.93));
  const e1 = [axis[1], -axis[0], 0].map((v) => v / Math.hypot(axis[0], axis[1]));
  const e2 = [axis[1] * e1[2] - axis[2] * e1[1], axis[2] * e1[0] - axis[0] * e1[2], axis[0] * e1[1] - axis[1] * e1[0]];
  const cyl = [];
  for (let i = 0; i < 2000; i++) { const t = rnd() * 2 * Math.PI; const h = (rnd() + 0.5) * 80; for (let k = 0; k < 3; k++) cyl.push([5, 10, 15][k] + 12 * Math.cos(t) * e1[k] + 12 * Math.sin(t) * e2[k] + h * axis[k]); }
  const c = fitCylinder(cyl);
  near(c.radius, 12, 1e-6);
  near(Math.abs(c.axis[0] * axis[0] + c.axis[1] * axis[1] + c.axis[2] * axis[2]), 1, 1e-9);
  near(c.rms, 0, 1e-6);
});

test('Euler angles turn z onto a direction; Delaunay of a grid; a mesh through a surface', () => {
  const { rx, ry } = eulerTo([0.3, 0.2, 0.93]);
  // MyCAD's own placement must carry z onto the direction.
  const map = placement(createEntity('solid', { kind: 'box', params: { length: 1, width: 1, height: 1 }, rx, ry }));
  const turned = map([0, 0, 1]);
  const want = [0.3, 0.2, 0.93].map((v) => v / Math.hypot(0.3, 0.2, 0.93));
  turned.forEach((v, i) => near(v, want[i], 1e-9));
  const grid = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) grid.push([i, j]);
  assert.equal(delaunay(grid).length, 2 * 5 * 5);
  const surface = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) surface.push(i, j, Math.sin(i / 3));
  assert.equal(meshFromPoints(surface).length, 2 * 19 * 19);
});
