// Mixed meshes (fem/mixed.js): solids, shells and beams in one study, bonded where they meet — a beam welded to the
// side of a fixed block bends as a cantilever (P L³ / 3EI), a plate standing on a fixed block likewise, and a beam
// carried on from a plate's end adds its own bending.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mixedStatic } from '../../src/cad/fem/mixed.js';
import { boxMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250 };
const near = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${what}: ${a} vs ${b}`);
const sq = (s) => ({ A: s * s, Iy: s ** 4 / 12, Iz: s ** 4 / 12, J: 0.1406 * s ** 4 });

test('a beam welded to the side of a fixed block: the tip deflects P·L³/3EI (the block barely gives)', () => {
  // Block 20 × 20 × 20 fixed on its bottom face; a 10 × 10 bar 200 long from the middle of its +x face.
  const block = boxMesh(20, 20, 20, 2);
  const L = 200, P = 50, s = 10;
  const bottom = []; for (let x = 0; x <= 20; x += 1) for (let y = 0; y <= 20; y += 1) bottom.push([x, y, 0]);
  const r = mixedStatic({ solids: [{ mesh: block, material: STEEL }], solidMesh: { size: 4, order: 2 }, beams: [{ a: [20, 10, 10], b: [20 + L, 10, 10], u: [0, 0, 1], section: sq(s), material: STEEL, divisions: 20 }],
    fixtures: [{ points: bottom, tol: 0.6 }], loads: [{ points: [[20 + L, 10, 10]], force: [0, 0, -P] }], spiderRadius: 6 });
  assert.ok(r.ok);
  const tip = -r.at([20 + L, 10, 10])[2], want = (P * L ** 3) / (3 * STEEL.E * sq(s).Iy);
  near(tip, want, 0.06, 'tip');
  assert.ok(tip > want * 0.99, 'the block adds a little, never takes away');
});

test('a plate standing on a fixed block bends as a cantilever; a beam carried on from its end adds its own', () => {
  const block = boxMesh(20, 20, 20, 2);
  // Plate 20 wide (y 0…20), 100 tall (z 20…120), 2 thick, its mid-surface at x = 10, standing on the block's top.
  const nodes = [], tri = [], nz = 25, ny = 4;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= ny; i++) nodes.push(10, (20 * i) / ny, 20 + (100 * j) / nz);
  const id = (i, j) => j * (ny + 1) + i;
  for (let j = 0; j < nz; j++) for (let i = 0; i < ny; i++) tri.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  const bottom = []; for (let x = 0; x <= 20; x += 1) for (let y = 0; y <= 20; y += 1) bottom.push([x, y, 0]);
  const P = 20, t = 2, I = (20 * t ** 3) / 12, L = 100;
  const top = []; for (let i = 0; i <= ny; i++) top.push([10, (20 * i) / ny, 120]);
  const r = mixedStatic({ solids: [{ mesh: block, material: STEEL }], solidMesh: { size: 4, order: 2 }, shells: [{ nodes: Float64Array.from(nodes), triangles: Uint32Array.from(tri), thickness: t, material: STEEL }],
    fixtures: [{ points: bottom, tol: 0.6 }], loads: [{ points: top, force: [P, 0, 0] }], spiderRadius: 3 });
  assert.ok(r.ok);
  const tipX = r.at([10, 10, 120])[0], want = (P * L ** 3) / (3 * STEEL.E * I);
  near(tipX, want, 0.08, 'plate tip');
  // A 10 × 10 beam 100 long on from the plate's top middle node (welded): the load moved to its end.
  const r2 = mixedStatic({ solids: [{ mesh: block, material: STEEL }], solidMesh: { size: 4, order: 2 }, shells: [{ nodes: Float64Array.from(nodes), triangles: Uint32Array.from(tri), thickness: t, material: STEEL }],
    beams: [{ a: [10, 10, 120], b: [10, 10, 220], u: [0, 1, 0], section: sq(10), material: STEEL, divisions: 10 }],
    fixtures: [{ points: bottom, tol: 0.6 }], loads: [{ points: [[10, 10, 220]], force: [P, 0, 0] }], spiderRadius: 3 });
  assert.ok(r2.ok && r2.ties > 0);
  // The beam end goes further than the plate top (the plate turns at its top too: a longer lever).
  assert.ok(r2.at([10, 10, 220])[0] > r2.at([10, 10, 120])[0] * 1.5);
});

test('an assembly of a block (solid), a plate standing on it (shell) and a bar on top (beam): one study, fields on each', async () => {
  const { mixedAssemblyStudy } = await import('../../src/cad/fem/mixed.js');
  const block = boxMesh(20, 20, 20, 2);                               // faces 0 x=0 … 4 z=0 (bottom), 5 z=20
  const plate = boxMesh(2, 20, 100, 2, [9, 0, 20]);                   // standing on the block's top
  const bar = boxMesh(4, 4, 100, 2, [8, 8, 120]);                     // on the plate's top edge
  const r = mixedAssemblyStudy({ bodies: [{ mesh: block, material: STEEL, kind: 'solid', name: 'block' }, { mesh: plate, material: STEEL, kind: 'shell', name: 'plate' }, { mesh: bar, material: STEEL, kind: 'beam', name: 'bar' }],
    fixtures: [{ body: 0, faceId: 4 }], loads: [{ body: 2, faceId: 5, force: [10, 0, 0] }], mesh: { size: 4 } });
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.kinds, ['solid', 'shell', 'beam']);
  const sizes = { solid: block, shell: plate, beam: bar };
  assert.ok(r.bodies.every((b) => b.vertexDisplacement.length === sizes[b.kind].vertices.length));
  const dx = (b) => { let m = 0; for (let i = 0; i < b.vertexDisplacement.length; i += 3) m = Math.max(m, b.vertexDisplacement[i]); return m; };
  assert.ok(dx(r.bodies[2]) > dx(r.bodies[1]) && dx(r.bodies[1]) > 100 * dx(r.bodies[0]), `${r.bodies.map(dx)}`);
  // The plate's root stress (z 20…30, away from where the bar joins it at one node — a point tie concentrates there)
  // ~ 6·M/(b t²) with M = F·(100 + 100).
  let root = 0; for (let v = 0; v < plate.vertices.length / 3; v++) if (plate.vertices[3 * v + 2] < 30) root = Math.max(root, r.bodies[1].vertexStress[v]);
  const want = (6 * 10 * 200) / (20 * 4);
  assert.ok(root > 0.6 * want && root < 1.6 * want, `${root} vs ~${want}`);
});
