import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRoom, nearestWall, openingSpans, planarGraph, signedArea, wallCorners, wallFootprints, wallMesh } from '../../src/engine/walls.js';
import { createProject, formatLength, History, normalizeProject, parseLength, polygonArea, removeEntities } from '../../src/engine/document.js';

const W = (id, a, b, thickness = 0.2) => ({ id, level: 'L', a, b, thickness });
const near = (p, q, tol = 1e-6) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;

test('two walls at a right angle meet in a mitre', () => {
  const walls = [W('w1', [0, 0], [4, 0]), W('w2', [4, 0], [4, 3])];
  const c = wallCorners(walls);
  // Outer corner (4.1, -0.1) and inner corner (3.9, 0.1) are shared.
  const all = [c.get('w1').b.left, c.get('w1').b.right, c.get('w2').a.left, c.get('w2').a.right];
  assert.ok(all.some((p) => near(p, [4.1, -0.1])), JSON.stringify(all));
  assert.ok(all.some((p) => near(p, [3.9, 0.1])), JSON.stringify(all));
  assert.equal(c.get('w1').a.joined, false);
  assert.equal(c.get('w1').b.joined, true);
});

test('a wall ending on the side of another butts against its face', () => {
  const walls = [W('w1', [0, 0], [6, 0]), W('w2', [3, 0], [3, 4])];
  const c = wallCorners(walls).get('w2');
  assert.ok(Math.abs(c.a.left[1] - 0.1) < 1e-6 && Math.abs(c.a.right[1] - 0.1) < 1e-6, JSON.stringify(c.a));
  assert.equal(c.a.butt, 'w1');
});

test('a closed square of walls gives a room of the inner size', () => {
  const walls = [W('a', [0, 0], [5, 0]), W('b', [5, 0], [5, 4]), W('c', [5, 4], [0, 4]), W('d', [0, 4], [0, 0])];
  const room = detectRoom(walls, [2, 2]);
  assert.ok(room);
  assert.equal(room.length, 4);
  assert.ok(Math.abs(polygonArea(room) - 4.8 * 3.8) < 1e-6, String(polygonArea(room)));
  assert.ok(signedArea(room) > 0);
  assert.equal(detectRoom(walls, [7, 7]), null);
});

test('a partition splits the room; the click picks the smaller cycle', () => {
  const walls = [W('a', [0, 0], [6, 0]), W('b', [6, 0], [6, 4]), W('c', [6, 4], [0, 4]), W('d', [0, 4], [0, 0]), W('p', [2, 0], [2, 4], 0.1)];
  const { edges } = planarGraph(walls);
  assert.equal(edges.length, 7);
  const left = detectRoom(walls, [1, 2]);
  const right = detectRoom(walls, [4, 2]);
  assert.ok(Math.abs(polygonArea(left) - (2 - 0.1 - 0.05) * 3.8) < 1e-6, String(polygonArea(left)));
  assert.ok(Math.abs(polygonArea(right) - (4 - 0.1 - 0.05) * 3.8) < 1e-6, String(polygonArea(right)));
});

test('wall mesh: groups, finite numbers, a window makes a hole and reveals', () => {
  const walls = [W('w', [0, 0], [4, 0])];
  const corners = wallCorners(walls);
  const plain = wallMesh(walls[0], { corners, height: 2.5 });
  const slots = plain.groups.map((g) => g.slot);
  for (const s of ['left', 'right', 'top', 'end']) assert.ok(slots.includes(s), s);
  assert.ok([...plain.positions].every(Number.isFinite));
  const openings = [{ id: 'o', wall: 'w', offset: 2, width: 1.2, height: 1.2, sill: 0.9 }, { id: 'd', wall: 'w', offset: 0.8, width: 0.9, height: 2.1, sill: 0 }];
  assert.equal(openingSpans(walls[0], openings, 2.5).length, 2);
  const cut = wallMesh(walls[0], { corners, height: 2.5, openings });
  assert.ok(cut.groups.some((g) => g.slot === 'reveal'));
  assert.ok(cut.indices.length > plain.indices.length);
  // Left side normals point +n = (0, 0, 1)·(-dz, dx) = (0, 0, 1) for a wall along +x.
  const g = cut.groups.find((x) => x.slot === 'left');
  const i0 = cut.indices[g.start];
  assert.equal(cut.normals[i0 * 3 + 2], 1);
});

test('nearest wall for placing openings', () => {
  const walls = [W('a', [0, 0], [5, 0]), W('b', [5, 0], [5, 4])];
  const hit = nearestWall(walls, [2, 0.2]);
  assert.equal(hit.wall.id, 'a');
  assert.ok(Math.abs(hit.t - 2) < 1e-9);
  assert.equal(nearestWall(walls, [2, 3]), null);
});

test('footprints have four corners per wall', () => {
  const walls = [W('w1', [0, 0], [4, 0]), W('w2', [4, 0], [4, 3])];
  const f = wallFootprints(walls);
  assert.equal(f.get('w1').length, 4);
});

test('document: normalise, history and units', () => {
  const p = createProject({ name: 'T' });
  const h = new History(p);
  p.walls.push({ id: 'w', level: p.levels[0].id, a: [0, 0], b: [3, 0], thickness: 0.2 });
  h.commit(p, 'wall', ['walls']);
  p.openings.push({ id: 'o', wall: 'w', offset: 1, width: 0.9, height: 2.1, sill: 0, item: 'door-single' });
  h.commit(p, 'door', ['openings']);
  assert.equal(h.undo(p), 'door');
  assert.equal(p.openings.length, 0);
  assert.equal(p.walls.length, 1);
  assert.equal(h.redo(p), 'door');
  assert.equal(p.openings.length, 1);
  removeEntities(p, ['w']);
  assert.equal(p.openings.length, 0, 'openings go with their wall');
  const n = normalizeProject(JSON.parse(JSON.stringify({ ...p, walls: [{ a: [0, 0], b: [1, 0] }, { a: 'bad' }] })));
  assert.equal(n.walls.length, 1);
  assert.equal(parseLength('2400', 'mm'), 2.4);
  assert.equal(parseLength('2.4m', 'mm'), 2.4);
  assert.deepEqual(parseLength('1200,800', 'mm'), [1.2, 0.8]);
  assert.ok(Math.abs(parseLength("8'", 'mm') - 2.4384) < 1e-9);
  assert.equal(parseLength('abc', 'mm'), null);
  assert.equal(formatLength(2.4, 'mm'), '2,400 mm');
});
