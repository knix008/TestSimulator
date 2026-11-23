// Free-surface lattice flow (src/cad/cfd/freesurface.js): a resting pool stays at rest with the hydrostatic pressure
// ρ g h at its floor; a breaking dam keeps its mass and its front runs out like Martin & Moyce's measurements
// (column a wide and 2a high: Z = x/a against T = t √(2g/a)).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tankStudy, CELL } from '../../src/cad/cfd/freesurface.js';

test('a resting pool: no motion, mass kept, hydrostatic pressure at the floor', () => {
  const r = tankStudy({ size: [100, 10, 80], h: 4, liquid: (x, y, z) => z < 40, duration: 0.15, frames: 4 });
  assert.ok(Math.abs(r.massEnd - r.massStart) < 1e-4 * r.massStart, `mass ${r.massStart} → ${r.massEnd}`);
  let vmax = 0; for (let s = 0; s < r.type.length; s++) if (r.type[s] === CELL.FLUID) vmax = Math.max(vmax, Math.hypot(r.vel[3 * s], r.vel[3 * s + 1], r.vel[3 * s + 2]));
  assert.ok(vmax < 0.01, `still: largest lattice speed ${vmax}`);
  // Floor pressure (lattice ρ/3 above the surface's) against ρ g h: Δρ = 3 g_lat · (depth in cells).
  const [nx, , nz] = r.dims, i = Math.floor(nx / 2);
  let sum = 0; for (let k = 1; k < nx - 1; k++) sum += r.rho[k + nx * 1];
  const rhoFloor = sum / (nx - 2), depthCells = (40 - r.h / 2) / r.h;   // the surface to the floor cells' centres
  const gLat = (9.81 * r.dt * r.dt) / (r.h / 1000);
  assert.ok(Math.abs(rhoFloor - 1 - 3 * gLat * depthCells) < 0.1 * 3 * gLat * depthCells, `floor ρ ${rhoFloor} vs ${1 + 3 * gLat * depthCells}`);
  assert.ok(r.columnHeights.every((hgt) => Math.abs(hgt - 40) < 1.5 * r.h), `level ${Math.min(...r.columnHeights)} … ${Math.max(...r.columnHeights)} mm`);
  assert.ok(nz > 0);
});

test('dam break (column 50 wide, 100 high): mass kept, the front runs out as measured (Martin & Moyce)', () => {
  const a = 50, g = 9.81;
  const T = 2.2, t = T * Math.sqrt(a / 1000 / (2 * g));
  const r = tankStudy({ size: [300, 10, 140], h: 2.5, liquid: (x, y, z) => x < a && z < 2 * a, duration: t, frames: 8 });
  assert.ok(Math.abs(r.massEnd - r.massStart) < 1e-3 * r.massStart, `mass ${r.massStart} → ${r.massEnd}`);
  const Z = r.front / a;
  // Martin & Moyce (1952), n² = 2: Z ≈ 2.56 at T ≈ 2.2.
  assert.ok(Math.abs(Z - 2.56) < 0.25 * 2.56, `front Z = ${Z} at T = ${T}`);
  // The front only moves forward.
  const fronts = r.frames.map((f) => f.front);
  for (let k = 1; k < fronts.length; k++) assert.ok(fronts[k] >= fronts[k - 1] - r.h, `front ${fronts}`);
  // The column at the wall falls as the water runs out.
  const wall = r.frames.map((fr) => fr.columns[0]);
  assert.ok(wall.at(-1) < wall[0] - 5 * r.h, `column at the wall ${wall.map((x) => x.toFixed(0))} mm`);
});

import { vesselStudy, liquidMesh } from '../../src/cad/cfd/freesurface.js';
// A cup 100 × 20 × 80 mm with 4 mm walls and an open top, as a wall mask on the study's grid.
const cup = (origin, h, dims) => {
  const [nx, ny, nz] = dims, out = new Uint8Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = origin[0] + (i + 0.5) * h, y = origin[1] + (j + 0.5) * h, z = origin[2] + (k + 0.5) * h;
    const inBox = x > 0 && x < 100 && y > 0 && y < 20 && z > 0 && z < 80;
    const inside = x > 4 && x < 96 && y > 4 && y < 16 && z > 4;
    out[i + nx * (j + ny * k)] = inBox && !inside ? 1 : 0;
  }
  return out;
};

test('a cup half full: at rest it stays; accelerated along +x the liquid piles up at the rear wall (tilt a/g)', () => {
  const base = { lo: [0, 0, 0], hi: [100, 20, 80], solidMask: cup, h: 4, level: 0.5, duration: 0.25, frames: 6 };
  const rest = vesselStudy(base);
  assert.equal(rest.ok, true, rest.error);
  assert.ok(Math.abs(rest.massEnd - rest.massStart) < 1e-3 * rest.massStart);
  const c0 = rest.frames[0].com, c1 = rest.frames.at(-1).com;
  assert.ok(Math.hypot(c1[0] - c0[0], c1[2] - c0[2]) < 1, `at rest the liquid stays: ${c0} → ${c1}`);
  const a = 3, slosh = vesselStudy({ ...base, accel: a, duration: 0.4 });
  const last = slosh.frames.at(-1);
  assert.ok(last.com[0] < c0[0] - 1, `centre of mass moves back: ${c0[0]} → ${last.com[0]} mm`);
  const expected = (92 / 2) * (a / 9.81);                        // half the inner length × a/g
  assert.ok(last.top - rest.frames[0].top > 0.4 * expected, `run-up ${last.top - rest.frames[0].top} mm vs ≈ ${expected}`);
  const m = liquidMesh(last.fill, slosh.dims, slosh.origin, slosh.h);
  assert.ok(m.triangles.length > 0 && m.vertices.length === m.normals.length);
});

test('a cube of one liquid cell meshes to a closed box of 12 triangles', () => {
  const fill = new Float32Array(27); fill[13] = 1;
  const m = liquidMesh(fill, [3, 3, 3], [0, 0, 0], 2);
  assert.equal(m.triangles.length, 36);
});
