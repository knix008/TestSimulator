// FEM of solids: voxel bricks with incompatible modes, checked against beam theory and CalculiX.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { analyzeSolid, boundaryQuads, hexStiffness, parseCalculixDat, toCalculix, voxelize } from '../../src/domain/fem3d.js';
import { solidMesh } from '../../src/domain/solids.js';
import { findFreecad } from '../../scripts/freecad/locate.mjs';

const box = (length, width, height, place = {}) => solidMesh({ type: 'solid', kind: 'box', params: { length, width, height }, ...place });
const rel = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${label} ${a} vs ${b}`);

test('voxels: a box fills its grid; a cylinder fills about π r² of it', () => {
  const g = voxelize(box(100, 20, 20), 10);
  assert.deepEqual([g.nx, g.ny, g.nz], [10, 2, 2]);
  assert.equal(g.cells.reduce((s, c) => s + c, 0), 40);
  const c = voxelize(solidMesh({ type: 'solid', kind: 'cylinder', params: { radius: 20, height: 10, angle: 360 } }), 40);
  rel(c.cells.reduce((s, x) => s + x, 0) * c.h ** 3, Math.PI * 400 * 10, 0.03, 'cylinder volume');
});

test('the element: symmetric, positive, rigid moves cost nothing', () => {
  const K = hexStiffness(2, 210000, 0.3);
  for (let a = 0; a < 24; a++) for (let b = 0; b < 24; b++) assert.ok(Math.abs(K[a][b] - K[b][a]) < 1e-6 * Math.abs(K[a][a]));
  const move = Array.from({ length: 24 }, (_, i) => (i % 3 === 1 ? 1 : 0));
  for (let a = 0; a < 24; a++) assert.ok(Math.abs(K[a].reduce((s, v, b) => s + v * move[b], 0)) < 1e-6 * K[a][a]);
});

test('a bar pulled: elongation F·L/(E·A) (the clamped end stiffens it a little)', () => {
  const r = analyzeSolid(box(10, 10, 100), { material: 'steel', resolution: 20, fixed: ['zmin'], loads: [{ face: 'zmax', fz: 1000 }] });
  assert.ok(r.ok, r.error);
  const top = r.nodes.map((p, i) => [p, i]).filter(([p]) => Math.abs(p[2] - 100) < 1e-6).map(([, i]) => r.u[3 * i + 2]);
  const mean = top.reduce((s, v) => s + v, 0) / top.length;
  rel(mean, (1000 * 100) / (210000 * 100), 0.03, 'elongation');
  rel(-r.reaction[2], 1000, 1e-6, 'reaction');
});

test('a cantilever: tip deflection F·L³/(3EI) + shear (incompatible modes: no shear locking)', () => {
  const [L, b, h, F] = [200, 20, 20, 1000];
  const r = analyzeSolid(box(L, b, h), { material: 'steel', resolution: 40, fixed: ['xmin'], loads: [{ face: 'xmax', fz: -F }] });
  assert.ok(r.ok);
  const I = (b * h ** 3) / 12; const E = 210000; const G = E / 2.6;
  const expected = (F * L ** 3) / (3 * E * I) + (F * L) / ((5 / 6) * G * b * h);
  const tip = r.nodes.map((p, i) => [p, i]).filter(([p]) => Math.abs(p[0] - L) < 1e-6).map(([, i]) => -r.u[3 * i + 2]);
  rel(tip.reduce((s, v) => s + v, 0) / tip.length, expected, 0.05, 'tip');
  // Bending stress at the root: M c / I (the first element's centre is half an element from the wall).
  rel(r.max.vm, (F * (L - r.grid.h / 2) * (h / 2 - r.grid.h / 2)) / I, 0.12, 'root stress');
  assert.ok(boundaryQuads(r).length > 0);
});

const freecad = findFreecad();
const ccx = freecad ? path.join(path.dirname(freecad), process.platform === 'win32' ? 'ccx.exe' : 'ccx') : null;
if (!ccx || !fs.existsSync(ccx)) throw new Error('CalculiX (ccx, shipped with FreeCAD next to FreeCADCmd) was not found. Install FreeCAD 1.x or set FREECAD_CMD.');
const skip = false;

test('CalculiX solves the same deck to the same displacements (C3D8I)', { skip }, () => {
  const r = analyzeSolid(box(120, 20, 20), { material: 'steel', resolution: 24, fixed: ['xmin'], loads: [{ face: 'xmax', fz: -500, fy: 200 }], gravity: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycad-ccx-'));
  fs.writeFileSync(path.join(dir, 'beam.inp'), toCalculix(r, 'Beam'));
  const run = spawnSync(ccx, ['beam'], { cwd: dir, encoding: 'utf8', timeout: 300000, windowsHide: true, env: { ...process.env, OMP_NUM_THREADS: '1' } });
  assert.ok(fs.existsSync(path.join(dir, 'beam.dat')), run.stdout?.slice(-400));
  const { u } = parseCalculixDat(fs.readFileSync(path.join(dir, 'beam.dat'), 'utf8'));
  assert.equal(u.size, r.nodes.length);
  let worst = 0; let largest = 0;
  r.nodes.forEach((_, i) => {
    const theirs = u.get(i + 1);
    for (let d = 0; d < 3; d++) { worst = Math.max(worst, Math.abs(theirs[d] - r.u[3 * i + d])); largest = Math.max(largest, Math.abs(theirs[d])); }
  });
  assert.ok(worst <= largest * 0.01, `largest difference ${worst} of ${largest}`);
});
