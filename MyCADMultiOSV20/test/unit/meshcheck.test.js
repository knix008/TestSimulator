// Check geometry and mesh repair (FreeCAD Part › Check geometry, Mesh › Analyze / Repair).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createEntity } from '../../src/domain/entities.js';
import { parseFile } from '../../src/domain/format.js';
import { analyzeMesh, checkSolid, repairMesh } from '../../src/domain/meshcheck.js';
import { solidMesh } from '../../src/domain/solids.js';

const box = (x = 0, y = 0, z = 0) => solidMesh(createEntity('solid', { kind: 'box', params: { length: 10, width: 10, height: 10 }, x, y, z }));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

test('a closed box is valid and its volume and area are measured', () => {
  const r = analyzeMesh(box());
  assert.equal(r.ok, true);
  assert.equal(r.closed, true);
  assert.deepEqual([r.triangles, r.vertices, r.shells], [12, 8, 1]);
  near(r.volume, 1000);
  near(r.area, 600);
});

test('each kind of damage is found', () => {
  assert.deepEqual(analyzeMesh(box().slice(2)).issues, ['openEdges']);
  assert.equal(analyzeMesh(box().slice(2)).holes, 2);
  assert.deepEqual(analyzeMesh(box().map((t, i) => (i === 3 ? [t[0], t[2], t[1]] : t))).issues, ['flipped']);
  assert.deepEqual(analyzeMesh(box().map((t) => [t[0], t[2], t[1]])).issues, ['inverted']);
  assert.deepEqual(analyzeMesh([...box(), box()[0], [[0, 0, 0], [0, 0, 0], [1, 1, 1]]]).issues, ['degenerate', 'duplicates']);
  // Two boxes cutting through each other; touching boxes are fine.
  assert.ok(analyzeMesh([...box(), ...box(5, 5, 5)]).selfIntersections > 0);
  assert.ok(analyzeMesh([...box(), ...box(3, 4, 6)]).selfIntersections > 0);
  assert.equal(analyzeMesh([...box(), ...box(10, 0, 0)]).selfIntersections, 0);
});

test('repair mends holes, orientation, inside-out shells and duplicates', () => {
  const cases = [box().slice(2), box().map((t, i) => (i === 3 ? [t[0], t[2], t[1]] : t)), box().map((t) => [t[0], t[2], t[1]]), [...box(), box()[0]], box().map((t, i) => (i === 3 ? [t[0], t[2], t[1]] : t)).slice(2)];
  for (const tris of cases) {
    const { triangles } = repairMesh(tris);
    const r = analyzeMesh(triangles);
    assert.equal(r.ok, true, JSON.stringify(r.issues));
    near(r.volume, 1000);
  }
  // A cylinder with its top taken away gets a lid of the same size.
  const cylinder = solidMesh(createEntity('solid', { kind: 'cylinder', params: { radius: 5, height: 10 } }));
  const open = cylinder.filter((t) => !t.every((p) => p[2] > 9.99));
  const { triangles, fixed } = repairMesh(open);
  assert.equal(fixed.holes, 1);
  near(analyzeMesh(triangles).volume, analyzeMesh(cylinder).volume);
});

test('a crack (T-junction) is closed by splitting the other side, not by a lid', () => {
  // A box whose top face is split along x = 5 on one side only: the two halves do not share the middle point.
  const tris = box().filter((t) => !t.every((p) => p[2] === 10));
  tris.push([[0, 0, 10], [5, 0, 10], [5, 10, 10]], [[0, 0, 10], [5, 10, 10], [0, 10, 10]]);
  tris.push([[5, 0, 10], [10, 0, 10], [10, 10, 10]], [[5, 0, 10], [10, 10, 10], [5, 10, 10]]);
  // Now the y = 0 side of the top is split at (5,0,10) but the front face is not: a T-junction.
  const before = analyzeMesh(tris);
  assert.ok(before.openEdges > 0);
  const { triangles, fixed } = repairMesh(tris);
  assert.ok(fixed.cracks > 0);
  assert.equal(fixed.holes, 0);
  assert.equal(analyzeMesh(triangles).ok, true);
  near(analyzeMesh(triangles).volume, 1000);
});

test('BIM objects are checked block by block and the samples are all valid', () => {
  for (const name of ['10-mounting-block.mcad', '22-machine-vise.mcad', '24-two-storey-house.mcad']) {
    const file = parseFile(fs.readFileSync(new URL(`../../samples/${name}`, import.meta.url), 'utf8'));
    const solids = (file.drawing ?? file).entities.filter((e) => e.type === 'solid');
    assert.ok(solids.length > 0);
    for (const e of solids) {
      const r = checkSolid(e);
      assert.equal(r.ok, true, `${name} ${e.kind}: ${r.issues.map((k) => `${k}=${r[k]}`).join(', ')}`);
    }
  }
});
