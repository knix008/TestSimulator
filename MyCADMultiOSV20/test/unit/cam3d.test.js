// CAM 3D: height field, drop-cutter, roughing and finishing, the simulator.
import assert from 'node:assert/strict';
import test from 'node:test';
import { dropCutter, gridFor, heightField, simulate, stockCheck, stockMesh, surfacePaths } from '../../src/domain/cam3d.js';
import { camPaths, normalizeCamOptions, parseGcode, toGcode } from '../../src/domain/cam.js';
import { solidMesh } from '../../src/domain/solids.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const box = solidMesh({ type: 'solid', kind: 'box', params: { length: 20, width: 20, height: 5 }, x: 0, y: 0, z: 0 });
const sphere = solidMesh({ type: 'solid', kind: 'sphere', params: { radius: 20 }, x: 0, y: 0, z: 0 });

test('height field: the top of a box, the floor round it', () => {
  const f = heightField(box, { cell: 1, pad: 5 });
  const z = (x, y) => f.z[Math.round((y - f.y0) / f.cell) * f.nx + Math.round((x - f.x0) / f.cell)];
  near(z(10, 10), 5); near(z(0, 0), 5); near(z(-3, 10), 0); near(f.zMax, 5);
});

test('drop-cutter: a flat end mill rides on the box past its edge; a ball drops by r − √(r² − d²)', () => {
  const f = heightField(box, { cell: 0.5, pad: 6 });
  const cell = (x, y) => Math.round((y - f.y0) / f.cell) * f.nx + Math.round((x - f.x0) / f.cell);
  const flat = dropCutter(f, 2, 'flat'); const ball = dropCutter(f, 2, 'ball');
  near(flat[cell(-1, 10)], 5); near(flat[cell(-2.5, 10)], 0);
  near(ball[cell(-1, 10)], 5 - (2 - Math.sqrt(3)), 1e-9);
  near(ball[cell(10, 10)], 5);
});

test('finishing a sphere with a ball mill: no gouge, small scallops on top', () => {
  const field = heightField(sphere, { cell: 0.5, pad: 4 });
  const job = camPaths({ model: field }, { operation: 'finish3d', tool: 4, toolShape: 'ball', stepOver: 0.1, stockTop: 0 });
  assert.ok(job.paths.length > 20);
  const run = simulate(field, job, { top: job.options.top });
  const { gouge } = stockCheck(field, run.stock);
  // Sampled on a 0.5 mm grid: within an eighth of a cell.
  assert.ok(gouge < 0.5 / 8, `gouge ${gouge}`);
  // Within 10 mm of the top, the scallop is about step² / 8r = 0.4² / 16.
  let worst = 0;
  for (let k = 0; k < field.z.length; k++) {
    const x = field.x0 + (k % field.nx) * field.cell; const y = field.y0 + Math.floor(k / field.nx) * field.cell;
    if (Math.hypot(x, y) < 10) worst = Math.max(worst, run.stock[k] - field.z[k]);
  }
  assert.ok(worst < 0.05, `left ${worst}`);
});

test('roughing: every level cleared to the stock allowance, never into it', () => {
  const field = heightField(sphere, { cell: 0.5, pad: 6 });
  const o = { operation: 'rough3d', tool: 6, toolShape: 'flat', stepDown: 4, stepOver: 0.5, leave: 0.5, stockTop: 2 };
  const job = camPaths({ model: field }, o);
  near(job.options.top, field.zMax + 2);
  const run = simulate(field, job, { top: job.options.top });
  const tip = dropCutter(field, 3, 'flat');
  let under = 0; let over = 0;
  for (let k = 0; k < field.z.length; k++) {
    // Above the floor the allowance stays on; no level is left standing over what the tool can reach.
    if (field.z[k] > field.zMin + 1e-6) under = Math.max(under, field.z[k] + 0.5 - run.stock[k]);
    over = Math.max(over, run.stock[k] - Math.max(field.zMin, tip[k] + 0.5));
  }
  assert.ok(under < 0.02, `cut into the allowance ${under}`);
  assert.ok(over <= 4 + 1e-6, `a level left standing ${over}`);
  assert.ok(stockCheck(field, run.stock).gouge < 1e-6);
  // Run in two halves = run at once.
  const half = simulate(field, job, { top: job.options.top, count: Math.floor(run.total / 2) });
  const rest = simulate(field, job, { top: job.options.top, from: { stock: [...half.stock], cut: half.cut } });
  assert.deepEqual(rest.stock, run.stock);
});

test('2.5D pockets simulate too; 3D G-code keeps Z and clears the stock top', () => {
  const square = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
  const pocket = camPaths({ loops: [square], chains: [], circles: [] }, { operation: 'pocket', tool: 4, depth: 3, stepDown: 1.5 });
  const grid = gridFor(pocket);
  const run = simulate(grid, pocket, { top: 0 });
  const mid = Math.round((10 - grid.y0) / grid.cell) * grid.nx + Math.round((10 - grid.x0) / grid.cell);
  near(run.stock[mid], -3);
  const field = heightField(sphere, { cell: 1, pad: 3 });
  const job = camPaths({ model: field }, { operation: 'finish3d', tool: 4, toolShape: 'ball', stepOver: 0.25 });
  const text = toGcode(job, { title: 'Dome', date: new Date('2026-01-01T00:00:00Z') });
  assert.match(text, /G1 X[-\d.]+ Y[-\d.]+ Z[-\d.]+/);
  assert.match(text, new RegExp(`G0 Z${Math.round((field.zMax + 1 + 5) * 1000) / 1000}\\b`));
  const moves = parseGcode(text);
  const cutPoints = job.paths.reduce((s, p) => s + p.points.length - 1, 0);
  assert.ok(moves.filter((m) => !m.rapid).length >= cutPoints);
  assert.ok(moves.filter((m) => !m.rapid).every((m) => m.to.z >= field.zMin - 1e-6));
  assert.deepEqual(camPaths({ loops: [], chains: [], circles: [] }, { operation: 'rough3d' }).warnings, ['noModel']);
  assert.equal(normalizeCamOptions({ toolShape: 'bull', direction: 'z' }).toolShape, 'flat');
});

test('the machined stock is a closed mesh holding the volume left', () => {
  const field = heightField(box, { cell: 1, pad: 4 });
  const job = camPaths({ model: field }, { operation: 'rough3d', tool: 4, stepDown: 2, leave: 0, stockTop: 1 });
  const run = simulate(field, job, { top: job.options.top });
  const tris = stockMesh(field, run.stock, -2);
  let volume = 0;
  for (const [a, b, c] of tris) volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  // The prism under the stock surface: Σ cell areas × heights (trapezoids over the grid).
  let expected = 0;
  for (let j = 0; j + 1 < field.ny; j++) for (let i = 0; i + 1 < field.nx; i++) {
    const h = (ii, jj) => run.stock[jj * field.nx + ii] + 2;
    expected += (field.cell ** 2) * (h(i, j) + h(i + 1, j) + h(i + 1, j + 1) + h(i, j + 1)) / 4;
  }
  assert.ok(Math.abs(volume - expected) / expected < 0.02, `${volume} vs ${expected}`);
});
