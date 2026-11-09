// Floor-plan editing, part 2: columns that split walls and become joints (and merge them again when
// deleted), walls drawn by a face, wall end / middle grips, and curved walls made of short straight walls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arcCurve, arcFromRadius, arcFromThreePoints, arcWallSegments, attachColumn, columnNodesOf, curveChain, curveInfo, faceToCentre,
  fixOpenings, mergeWallsAt, mergeWallsAtNodes, moveJoined, moveWallEnd, moveWallParallel, offsetPolyline, planSnapshot, refitRooms,
  restorePlan, setWallThickness, splitWallAt, splitWallsAtColumns,
} from '../../src/engine/planedit.js';
import { detectRoom, wallCorners, wallLength, wallNormal } from '../../src/engine/walls.js';
import { polygonArea } from '../../src/engine/document.js';

const W = (id, a, b, extra = {}) => ({ id, level: 'L', a, b, thickness: 0.2, height: null, material: {}, ...extra });
const C = (id, x, z) => ({ id, level: 'L', item: 'column', params: { shape: 'square', size: 0.4 }, position: [x, 0, z], rotation: [0, 0, 0], scale: [1, 1, 1] });
const near = (p, q, tol = 1e-6) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
const ids = () => { let n = 0; return () => `n${++n}`; };
const drop = (p, id) => { p.objects = p.objects.filter((o) => o.id !== id); };
const box = (x0, z0, x1, z1) => [W('t', [x0, z0], [x1, z0]), W('r', [x1, z0], [x1, z1]), W('b', [x1, z1], [x0, z1]), W('l', [x0, z1], [x0, z0])];

// ───────────────────────── columns split walls

test('a column placed in the middle of a wall splits it there; openings keep their place', () => {
  const wall = W('w', [0, 0], [6, 0], { height: 2.6, material: { left: 'paint-a', right: 'paint-b' }, align: 'left', tag: 't1' });
  const p = { walls: [wall], objects: [C('c', 3.02, 0.06)], rooms: [], openings: [{ id: 'o1', wall: 'w', offset: 1, width: 0.8 }, { id: 'o2', wall: 'w', offset: 4.5, width: 0.9 }] };
  const r = attachColumn(p, p.objects[0], ids());
  assert.equal(r.moved, true, 'snapped onto the centre line');
  assert.ok(near([p.objects[0].position[0], p.objects[0].position[2]], [3.02, 0]) && p.objects[0].position[1] === 0);
  assert.equal(r.split.length, 1);
  assert.equal(p.walls.length, 2);
  const [w1, w2] = p.walls;
  assert.equal(w1.id, 'w', 'the first piece keeps the id');
  assert.ok(near(w1.b, [3.02, 0]) && near(w2.a, [3.02, 0]) && near(w2.b, [6, 0]));
  for (const k of ['thickness', 'height', 'align', 'tag']) assert.equal(w2[k], wall[k], k);
  assert.deepEqual(w2.material, { left: 'paint-a', right: 'paint-b' });
  assert.notEqual(w2.material, w1.material, 'materials copied, not shared');
  assert.equal(p.openings[0].wall, 'w'); assert.equal(p.openings[0].offset, 1);
  assert.equal(p.openings[1].wall, w2.id); assert.ok(Math.abs(p.openings[1].offset - (4.5 - 3.02)) < 1e-9);
  // The column is a joint: moving it drags both pieces' ends; the far ends stay.
  moveJoined(p, { columns: ['c'] }, [0, 0.5]);
  assert.ok(near(w1.b, [3.02, 0.5]) && near(w2.a, [3.02, 0.5]));
  assert.ok(near(w1.a, [0, 0]) && near(w2.b, [6, 0]));
  // The pieces mitre at the joint (no gap between them).
  const c = wallCorners(p.walls);
  assert.ok(c.get('w').b.joined && c.get(w2.id).a.joined);
  assert.ok(near(c.get('w').b.left, c.get(w2.id).a.left, 1e-9) && near(c.get('w').b.right, c.get(w2.id).a.right, 1e-9));
});

test('a column near a wall end joins that end; far from walls it stays free', () => {
  const p = { walls: [W('w', [0, 0], [4, 0]), W('v', [4, 0], [4, 3])], objects: [C('c', 3.95, 0.05), C('free', 2, 2)], rooms: [], openings: [] };
  assert.deepEqual(attachColumn(p, p.objects[0], ids()), { moved: true, split: [] });
  assert.deepEqual(p.objects[0].position, [4, 0, 0]);
  assert.deepEqual(attachColumn(p, p.objects[1], ids()), { moved: false, split: [] });
  assert.equal(p.walls.length, 2);
  // A column exactly at a wall end does not split anything.
  assert.equal(splitWallAt(p, p.walls[0], 0.005, ids()), null);
});

test('a wall drawn through existing columns is split at each of them', () => {
  const p = { walls: [W('w', [0, 0], [9, 0])], objects: [C('c1', 3, 0), C('c2', 6, 0), C('off', 4.5, 1)], rooms: [], openings: [{ id: 'o', wall: 'w', offset: 7.5, width: 1 }] };
  const added = splitWallsAtColumns(p, ['w'], ids());
  assert.equal(added.length, 2);
  const lengths = p.walls.map(wallLength).sort((a, b) => a - b);
  assert.ok(lengths.every((l) => Math.abs(l - 3) < 1e-9), JSON.stringify(lengths));
  const holder = p.walls.find((w) => w.id === p.openings[0].wall);
  assert.ok(near(holder.a, [6, 0]) && Math.abs(p.openings[0].offset - 1.5) < 1e-9);
  // A column inside the wall but off its centre line moves onto it; one beside the wall stays out of it.
  const o = { walls: [W('w', [0, 0], [6, 0])], objects: [C('in', 2, 0.06), C('out', 4, 0.3)], rooms: [], openings: [] };
  assert.equal(splitWallsAtColumns(o, ['w'], ids()).length, 1);
  assert.deepEqual(o.objects[0].position, [2, 0, 0]);
  assert.deepEqual(o.objects[1].position, [4, 0, 0.3]);
  // Rooms stay valid: a box with a column mid-side still detects the same room.
  const q = { walls: box(0, 0, 6, 4), objects: [C('m', 3, 0)], rooms: [], openings: [] };
  const before = detectRoom(q.walls, [3, 2]);
  splitWallsAtColumns(q, ['t'], ids());
  assert.equal(q.walls.length, 5);
  const after = detectRoom(q.walls, [3, 2]);
  assert.ok(Math.abs(polygonArea(after) - polygonArea(before)) < 1e-9);
  assert.equal(after.length, 4, 'the split point is not a room corner');
});

test('deleting the joint column merges the two pieces back (only when they are alike and straight)', () => {
  const make = () => {
    const p = { walls: [W('w', [0, 0], [6, 0], { material: { left: 'a', right: 'b' } })], objects: [C('c', 2, 0)], rooms: [], openings: [{ id: 'o1', wall: 'w', offset: 1, width: 0.8, side: 'left' }, { id: 'o2', wall: 'w', offset: 4, width: 0.8, side: 'left' }] };
    attachColumn(p, p.objects[0], ids());
    return p;
  };
  const p = make();
  assert.equal(p.walls.length, 2);
  // While the column is there nothing merges.
  assert.equal(mergeWallsAt(p, 'L', [2, 0]), null);
  const nodes = columnNodesOf(p, ['c']);
  drop(p, 'c');
  assert.deepEqual(mergeWallsAtNodes(p, nodes), ['w']);
  assert.equal(p.walls.length, 1);
  assert.ok(near(p.walls[0].a, [0, 0]) && near(p.walls[0].b, [6, 0]));
  assert.deepEqual(p.openings.map((o) => [o.wall, o.offset]), [['w', 1], ['w', 4]]);

  // A piece flipped (b → a): its openings and materials are seen the other way round.
  const q = make();
  const w2 = q.walls[1];
  [w2.a, w2.b] = [w2.b, w2.a];
  w2.material = { left: 'b', right: 'a' };
  q.openings[1].offset = wallLength(w2) - 2; q.openings[1].side = 'right';
  drop(q, 'c');
  assert.equal(mergeWallsAt(q, 'L', [2, 0]), 'w');
  assert.ok(near(q.walls[0].b, [6, 0]));
  assert.ok(Math.abs(q.openings[1].offset - 4) < 1e-9);
  assert.equal(q.openings[1].side, 'left');

  // Different thickness, a corner, or a third wall at the node: no merge.
  for (const spoil of [(r) => { r.walls[1].thickness = 0.3; }, (r) => { r.walls[1].b = [2, 4]; }, (r) => { r.walls.push(W('x', [2, 0], [2, 3])); }, (r) => { r.walls[1].material = { left: 'z' }; }]) {
    const r = make();
    spoil(r);
    drop(r, 'c');
    assert.equal(mergeWallsAt(r, 'L', [2, 0]), null);
  }
  // The joint's start piece: merging where w1's start is at the node keeps w1's id and direction.
  const s = { walls: [W('A', [2, 0], [6, 0]), W('B', [0, 0], [2, 0])], objects: [], rooms: [], openings: [{ id: 'oa', wall: 'A', offset: 1, width: 0.5 }, { id: 'ob', wall: 'B', offset: 0.5, width: 0.5 }] };
  assert.equal(mergeWallsAt(s, 'L', [2, 0]), 'A');
  assert.ok(near(s.walls[0].a, [0, 0]) && near(s.walls[0].b, [6, 0]));
  assert.deepEqual(s.openings.map((o) => o.offset), [3, 0.5]);
});

// ───────────────────────── walls drawn by a face

test('walls drawn along their left or right face: the centre line is offset by half the thickness and corners mitre', () => {
  // A 4 × 3 room traced along its inner faces, clockwise on screen (z down): the inside is the walls' left (+n) side.
  const face = [[0, 0], [4, 0], [4, 3], [0, 3]];
  const centre = faceToCentre(face, 0.2, 'left', true);
  // The centre line is 0.1 outside the traced rectangle all round.
  assert.ok(near(centre[0], [-0.1, -0.1]) && near(centre[1], [4.1, -0.1]) && near(centre[2], [4.1, 3.1]) && near(centre[3], [-0.1, 3.1]));
  const walls = centre.map((a, i) => W(`f${i}`, a, centre[(i + 1) % 4]));
  // The room inside those walls is exactly the traced rectangle.
  const room = detectRoom(walls, [2, 1.5]);
  assert.ok(Math.abs(polygonArea(room) - 12) < 1e-9);
  // Each wall's left face (the align 'left' face of the Entity panel) is on the drawn line.
  for (const w of walls) { const n = wallNormal(w); const f = [w.a[0] + n[0] * 0.1, w.a[1] + n[1] * 0.1]; assert.ok(face.some((q, i) => { const r = face[(i + 1) % 4]; return Math.abs((f[0] - q[0]) * (r[1] - q[1]) - (f[1] - q[1]) * (r[0] - q[0])) < 1e-9; })); }
  // Mitred corners: every end is joined at a node.
  const c = wallCorners(walls);
  assert.ok([...c.values()].every((e) => e.a.joined && e.b.joined));
  // The right face: the centre line is on the other side; centre = no change; an open chain keeps its ends square.
  const right = faceToCentre([[0, 0], [4, 0], [4, 3]], 0.2, 'right');
  assert.ok(near(right[0], [0, 0.1]) && near(right[1], [3.9, 0.1]) && near(right[2], [3.9, 3]));
  assert.deepEqual(faceToCentre(face, 0.2, 'center'), face);
  // A straight continuation keeps the plain offset point.
  assert.ok(near(offsetPolyline([[0, 0], [1, 0], [2, 0]], 0.5)[1], [1, 0.5]));
});

test('the Entity panel thickness-from convention matches the drawing faces', () => {
  // A wall drawn by its left face, then made thicker keeping that face: the drawn line stays the face.
  const face = [[0, 0], [5, 0]];
  const [a, b] = faceToCentre(face, 0.2, 'left');
  const w = W('w', a, b, { align: 'left' });
  const p = { walls: [w], objects: [], rooms: [], openings: [] };
  setWallThickness(p, w, 0.4, 'left');
  const n = wallNormal(w);
  assert.ok(Math.abs(w.a[1] + n[1] * 0.2 - 0) < 1e-9, 'left face still on z = 0');
});

// ───────────────────────── grips

test('an end grip moves the wall end with the joined walls and columns; Alt detaches it', () => {
  const walls = [W('w1', [0, 0], [4, 0]), W('w2', [4, 0], [4, 3])];
  const p = { walls, objects: [C('c', 4, 0)], rooms: [], openings: [{ id: 'o', wall: 'w1', offset: 3.5, width: 0.8 }, { id: 'q', wall: 'w2', offset: 1, width: 0.8 }] };
  moveWallEnd(p, walls[0], 'b', [5, 0]);
  assert.ok(near(walls[0].b, [5, 0]) && near(walls[1].a, [5, 0]));
  assert.deepEqual(p.objects[0].position, [5, 0, 0]);
  assert.equal(p.openings[0].offset, 3.5, 'measured from the end that stayed');
  // w2's start moved: its opening keeps its distance from w2's end that stayed.
  assert.ok(Math.abs(p.openings[1].offset - (wallLength(walls[1]) - 2)) < 1e-9);
  // Shortening clamps the opening inside the wall.
  moveWallEnd(p, walls[0], 'b', [1, 0]);
  assert.ok(Math.abs(p.openings[0].offset - 0.6) < 1e-9, String(p.openings[0].offset));
  // Alt: only this wall's end moves; the joined wall and the column stay.
  moveWallEnd(p, walls[0], 'b', [2, 1], { detach: true });
  assert.ok(near(walls[0].b, [2, 1]) && near(walls[1].a, [1, 0]));
  assert.deepEqual(p.objects[0].position, [1, 0, 0]);
  // Moving the start keeps openings measured from the end b that stayed.
  const s = { walls: [W('s', [0, 0], [4, 0])], objects: [], rooms: [], openings: [{ id: 'o', wall: 's', offset: 3, width: 0.5 }] };
  moveWallEnd(s, s.walls[0], 'a', [-1, 0]);
  assert.ok(Math.abs(s.openings[0].offset - 4) < 1e-9);
});

test('the middle grip moves a wall parallel: joined and butting walls stretch, rooms refit, one snapshot restores', () => {
  const walls = [...box(0, 0, 4, 3), W('tee', [2, 3], [2, 5])];
  const room = { id: 'R', level: 'L', points: detectRoom(walls.slice(0, 4), [2, 1.5]) };
  const p = { walls, objects: [], rooms: [room], openings: [{ id: 'o', wall: 'b', offset: 1, width: 0.8 }] };
  const snap = planSnapshot(p, 'L');
  const bottom = walls[2]; // [4,3] → [0,3]
  const n = wallNormal(bottom); // (0, −1)·(−1) … left normal of a wall running −x is (0, −1)
  assert.ok(near(n, [0, -1]));
  moveWallParallel(p, bottom, -1); // 1 m towards +z (outwards)
  assert.ok(near(bottom.a, [4, 4]) && near(bottom.b, [0, 4]));
  assert.ok(near(walls[1].b, [4, 4]) && near(walls[3].a, [0, 4]), 'the side walls stretch');
  assert.ok(near(walls[4].a, [2, 4]) && near(walls[4].b, [2, 5]), 'the butting wall stretches to the new line');
  assert.equal(p.openings[0].offset, 1);
  refitRooms(p, new Set(['L']));
  assert.ok(Math.abs(polygonArea(room.points) - 3.8 * 3.8) < 1e-6, String(polygonArea(room.points)));
  restorePlan(p, snap);
  assert.ok(near(bottom.a, [4, 3]) && near(walls[1].b, [4, 3]) && near(walls[4].a, [2, 3]));
  assert.ok(Math.abs(polygonArea(room.points) - 3.8 * 2.8) < 1e-6);
});

test('fixOpenings: a wall moved whole keeps its offsets; one stretched at both ends projects them', () => {
  const p = { walls: [W('w', [1, 0], [5, 0])], openings: [{ id: 'o', wall: 'w', offset: 2, width: 1 }] };
  const before = new Map([['w', { a: [0, 0], b: [4, 0] }]]);
  fixOpenings(p, before);
  assert.equal(p.openings[0].offset, 2);
  p.walls[0].a = [-1, 0]; p.walls[0].b = [6, 0];
  fixOpenings(p, new Map([['w', { a: [1, 0], b: [5, 0] }]]));
  assert.ok(Math.abs(p.openings[0].offset - 4) < 1e-9);
});

// ───────────────────────── curved walls

test('arcWallSegments: chord error ≤ 1 cm, pieces ≤ 0.3 m, joined end to end in order', () => {
  for (const [r, sweep] of [[2, Math.PI / 2], [0.3, Math.PI], [8, -Math.PI / 3], [1, 2 * Math.PI]]) {
    const segs = arcWallSegments([1, 2], r, 0.4, 0.4 + sweep);
    assert.ok(segs.length >= 2);
    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      assert.ok(L <= 0.3 + 1e-9, `length ${L}`);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      assert.ok(r - Math.hypot(mid[0] - 1, mid[1] - 2) <= 0.01 + 1e-9, 'chord error');
      for (const q of [a, b]) assert.ok(Math.abs(Math.hypot(q[0] - 1, q[1] - 2) - r) < 1e-9, 'ends on the arc');
      if (i) assert.deepEqual(segs[i - 1][1], a, 'consecutive pieces share their end');
    }
    assert.ok(near(segs[0][0], [1 + r * Math.cos(0.4), 2 + r * Math.sin(0.4)]));
    assert.ok(near(segs.at(-1)[1], [1 + r * Math.cos(0.4 + sweep), 2 + r * Math.sin(0.4 + sweep)]));
  }
  // A big radius: the 0.3 m limit decides; a small one: the 1 cm chord error decides.
  assert.equal(arcWallSegments([0, 0], 10, 0, 0.3).length, Math.ceil(0.3 / (2 * Math.asin(0.015))));
  assert.equal(arcWallSegments([0, 0], 0.1, 0, Math.PI).length, Math.ceil(Math.PI / (2 * Math.acos(0.9))));
  assert.deepEqual(arcWallSegments([0, 0], 1, 0, 0), []);
  // Exact end points can be given (clicked points).
  const exact = arcWallSegments([0, 0], 1, 0, Math.PI / 2, { start: [1, 0], end: [0, 1] });
  assert.deepEqual(exact[0][0], [1, 0]); assert.deepEqual(exact.at(-1)[1], [0, 1]);
});

test('arcs from three points or from a typed radius; the pieces form one selectable curve', () => {
  const arc = arcFromThreePoints([2, 0], [0, 2], [Math.SQRT2, Math.SQRT2]);
  assert.ok(Math.abs(arc.r - 2) < 1e-9 && Math.abs(arc.cx) < 1e-9 && Math.abs(arc.cz) < 1e-9);
  assert.ok(Math.abs(arc.a0) < 1e-9 && Math.abs(arc.a1 - Math.PI / 2) < 1e-9, 'counter-clockwise through the bulge');
  const other = arcFromThreePoints([2, 0], [0, 2], [-2, 0]);
  assert.ok(Math.abs(other.a1 - other.a0 + 1.5 * Math.PI) < 1e-9, 'the long way round, clockwise');
  assert.equal(arcFromThreePoints([0, 0], [2, 0], [1, 0]), null, 'collinear');
  // Radius 5 over a 6 m chord, bulging to −z: sagitta 1.
  const byR = arcFromRadius([0, 0], [6, 0], 5, [3, -3]);
  assert.ok(Math.abs(byR.r - 5) < 1e-9 && Math.abs(byR.cz - 4) < 1e-9);
  const half = arcFromRadius([0, 0], [6, 0], 1, [3, 3]);
  assert.ok(Math.abs(half.r - 3) < 1e-9, 'too small a radius makes a half circle');

  const segs = arcWallSegments([arc.cx, arc.cz], arc.r, arc.a0, arc.a1, { start: [2, 0], end: [0, 2] });
  const curve = arcCurve('cv1', [arc.cx, arc.cz], arc.r, arc.a0, arc.a1);
  const walls = segs.map(([a, b], i) => W(`s${i}`, a, b, { curve }));
  const p = { walls: [...walls, W('x', [0, 2], [-3, 2])], objects: [], rooms: [], openings: [] };
  assert.deepEqual(curveChain(p, walls[3]).map((w) => w.id), walls.map((w) => w.id));
  assert.deepEqual(curveChain(p, p.walls.at(-1)).map((w) => w.id), ['x']);
  const info = curveInfo(walls);
  assert.equal(info.segments, walls.length);
  assert.ok(Math.abs(info.r - 2) < 1e-9 && Math.abs(info.length - Math.PI) < 0.01);
  assert.equal(curveInfo([walls[0], p.walls.at(-1)]), null);
  // The pieces mitre into a smooth curve: every inner join is a node of two walls.
  const c = wallCorners(walls);
  for (let i = 1; i < walls.length; i++) assert.ok(c.get(walls[i].id).a.joined);
  // Curve pieces never merge with each other when a column between them goes.
  assert.equal(mergeWallsAt({ walls, objects: [], rooms: [], openings: [] }, 'L', walls[1].a), null);
});
