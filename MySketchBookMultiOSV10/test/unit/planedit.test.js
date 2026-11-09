// Floor-plan editing: structural columns (snapping, joins, sticky moves), wall rectangles of the
// Room tool, rooms found after drawing walls, wall length/thickness edits, and the sample floor plans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnFootprint, columnShape, columnSnapPoints, isColumn, moveJoined, rectangleSegments, roomsAfterWalls, setWallLength, setWallThickness } from '../../src/engine/planedit.js';
import { snapPlan } from '../../src/tools/snap.js';
import { detectRoom, pointInPolygon, wallCorners, wallDir, wallNormal } from '../../src/engine/walls.js';
import { createProject, normalizeProject, polygonArea } from '../../src/engine/document.js';
import { PLANS, buildPlan } from '../../src/engine/plans.js';
import { SAMPLE_GROUPS, SAMPLE_PROJECTS, buildSampleProject } from '../../src/engine/samples.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';

const catalogItem = (id) => PARAMETRIC_ITEMS.find((i) => i.id === id);
const itemParams = (item, params) => Object.fromEntries(item.params.map((p) => [p.key, params[p.key] ?? p.default]));

const W = (id, a, b, thickness = 0.2) => ({ id, level: 'L', a, b, thickness, height: null, material: {} });
const C = (id, x, z, params = {}) => ({ id, level: 'L', item: 'column', params: { shape: 'square', size: 0.4, ...params }, position: [x, 0, z], rotation: [0, 0, 0], scale: [1, 1, 1] });
const near = (p, q, tol = 1e-6) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
const plan = (walls, objects = [], rooms = []) => ({ walls, objects, rooms });

test('column shape and plan footprint (square, rectangular turned, round)', () => {
  const sq = C('c', 1, 2);
  assert.deepEqual(columnShape(sq), { shape: 'square', w: 0.4, d: 0.4 });
  const fp = columnFootprint(sq);
  assert.equal(fp.length, 4);
  assert.ok(Math.abs(polygonArea(fp) - 0.16) < 1e-9);
  assert.ok(fp.every(([x, z]) => Math.abs(Math.abs(x - 1) - 0.2) < 1e-9 && Math.abs(Math.abs(z - 2) - 0.2) < 1e-9));
  // A 0.4 × 0.8 column turned 90° is 0.8 wide in x.
  const rect = { ...C('r', 0, 0, { shape: 'rect', size: 0.4, depth: 0.8 }), rotation: [0, Math.PI / 2, 0] };
  const xs = columnFootprint(rect).map((p) => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 0.8) < 1e-9);
  const round = C('o', 0, 0, { shape: 'round', size: 0.5 });
  assert.ok(Math.abs(polygonArea(columnFootprint(round, 64)) - Math.PI * 0.0625) < 0.002);
  assert.ok(isColumn(round) && !isColumn({ item: 'sofa' }));
});

test('the library column has the structural parameters and builds every shape', () => {
  const item = catalogItem('column');
  const keys = item.params.map((p) => p.key);
  for (const k of ['shape', 'size', 'depth', 'fitLevel', 'height', 'material']) assert.ok(keys.includes(k), k);
  assert.deepEqual(item.params.find((p) => p.key === 'shape').options.map((o) => o[0]), ['round', 'square', 'rect']);
  for (const shape of ['round', 'square', 'rect']) {
    const g = item.build(itemParams(item, { shape, trim: shape !== 'rect' }), { material: () => null, quality: 'low' });
    assert.ok(g.children.length > 0, shape);
  }
});

test('the wall tool snaps to a column centre (endpoint inference)', () => {
  const project = { objects: [C('c', 2, 3)], rooms: [], walls: [] };
  const points = columnSnapPoints(project, 'L');
  assert.equal(points.length, 1);
  const s = snapPlan([2.05, 3.04], { walls: [], points, pixel: 0.01 });
  assert.equal(s.kind, 'endpoint');
  assert.deepEqual(s.point, [2, 3]);
  // A column placed on a wall's middle snaps onto the wall's centre line.
  const on = snapPlan([1.2, 0.03], { walls: [W('w', [0, 0], [5, 0])], points: [], pixel: 0.01 });
  assert.equal(on.kind, 'onEdge');
  assert.ok(Math.abs(on.point[1]) < 1e-9);
});

test('walls joined at a column still mitre, and moving the column drags their ends', () => {
  const walls = [W('w1', [0, 0], [4, 0]), W('w2', [4, 0], [4, 3]), W('w3', [4, 3], [8, 3])];
  const col = C('c', 4, 0);
  const p = plan(walls, [col, C('far', 8, 3)]);
  assert.equal(wallCorners(walls).get('w1').b.joined, true);
  const moved = moveJoined(p, { columns: ['c'] }, [0.5, -0.25]);
  assert.deepEqual(col.position, [4.5, 0, -0.25]);
  assert.ok(near(walls[0].b, [4.5, -0.25]) && near(walls[1].a, [4.5, -0.25]));
  assert.ok(near(walls[0].a, [0, 0]) && near(walls[1].b, [4, 3]), 'far ends stay');
  assert.deepEqual(moved.sort(), ['c', 'w1', 'w2']);
  assert.deepEqual(p.objects[1].position, [8, 0, 3], 'other columns stay');
});

test('moving a wall drags the joined walls and the columns at its ends', () => {
  const walls = [W('w1', [0, 0], [4, 0]), W('w2', [4, 0], [4, 3]), W('w3', [0, 0], [0, 3])];
  const p = plan(walls, [C('a', 0, 0), C('b', 4, 0), C('mid', 2, 2)]);
  moveJoined(p, { walls: ['w1'] }, [0, 1]);
  assert.ok(near(walls[0].a, [0, 1]) && near(walls[0].b, [4, 1]));
  assert.ok(near(walls[1].a, [4, 1]) && near(walls[1].b, [4, 3]));
  assert.ok(near(walls[2].a, [0, 1]));
  assert.deepEqual(p.objects.map((o) => o.position[2]), [1, 1, 2]);
  // Columns of another level are not touched.
  const other = plan([W('x', [0, 0], [1, 0])], [{ ...C('o', 0, 0), level: 'M' }]);
  moveJoined(other, { walls: ['x'] }, [1, 0]);
  assert.deepEqual(other.objects[0].position, [0, 0, 0]);
});

test('wall length and thickness edits keep joined walls and columns attached', () => {
  const walls = [W('w1', [0, 0], [4, 0]), W('w2', [4, 0], [4, 3])];
  const p = plan(walls, [C('c', 4, 0)]);
  setWallLength(p, walls[0], 5);
  assert.ok(near(walls[0].b, [5, 0]) && near(walls[1].a, [5, 0]));
  assert.deepEqual(p.objects[0].position, [5, 0, 0]);
  // Thickness (on a fresh right-angled corner) 0.2 → 0.4 keeping the left face (+n side, n = (0, 1) for a wall along +x): the centre line moves by −0.1.
  walls[1].a = [5, 0]; walls[1].b = [5, 3];
  const n = wallNormal(walls[0]);
  const leftBefore = walls[0].a[1] + n[1] * 0.1;
  setWallThickness(p, walls[0], 0.4, 'left');
  assert.equal(walls[0].thickness, 0.4);
  assert.ok(Math.abs(walls[0].a[1] + n[1] * 0.2 - leftBefore) < 1e-9, 'left face stays');
  assert.ok(near(walls[1].a, walls[0].b), 'the joined wall follows the shifted centre line');
  assert.ok(Math.abs(walls[1].a[0] - 5) < 1e-9, 'it slides along itself');
  assert.ok(near([p.objects[0].position[0], p.objects[0].position[2]], walls[0].b), 'the column follows');
  setWallThickness(p, walls[0], 0.3);
  assert.equal(walls[0].thickness, 0.3);
});

test('a room rectangle makes four walls, sharing stretches that are already walled', () => {
  const four = rectangleSegments([], [0, 0], [4, 3]);
  assert.equal(four.length, 4);
  assert.ok(Math.abs(four.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1]), 0) - 14) < 1e-9);
  // Next to an existing 4 × 3 room: the shared side (x = 4, z 0..3) is not drawn again.
  const existing = four.map(([a, b], i) => W(`e${i}`, a, b));
  const next = rectangleSegments(existing, [4, 0], [7, 3]);
  assert.equal(next.length, 3);
  assert.ok(!next.some(([a, b]) => Math.abs(a[0] - 4) < 1e-9 && Math.abs(b[0] - 4) < 1e-9));
  // A taller room against it: only the uncovered part of the shared side is added.
  const tall = rectangleSegments(existing, [4, 0], [7, 5]);
  const shared = tall.filter(([a, b]) => Math.abs(a[0] - 4) < 1e-9 && Math.abs(b[0] - 4) < 1e-9);
  assert.equal(shared.length, 1);
  assert.ok(Math.abs(Math.abs(shared[0][1][1] - shared[0][0][1]) - 2) < 1e-9);
});

test('walls that close an area become a room; a partition splits a room and keeps its finishes', () => {
  const p = createProject();
  const L = p.levels[0].id;
  const segs = rectangleSegments([], [0, 0], [6, 4]);
  p.walls = segs.map(([a, b], i) => ({ ...W(`r${i}`, a, b), level: L }));
  const make = (points, from) => ({ id: `n${p.rooms.length}`, level: L, name: from ? `${from.name}+` : 'new', points, floor: from?.floor ?? 'floor-oak' });
  const first = roomsAfterWalls(p, L, p.walls, make);
  assert.equal(first.added.length, 1);
  assert.ok(Math.abs(polygonArea(p.rooms[0].points) - 5.8 * 3.8) < 1e-6);
  // Again: nothing new.
  assert.deepEqual(roomsAfterWalls(p, L, p.walls, make), { added: [], changed: [] });
  p.rooms[0].floor = 'tile-grey';
  p.rooms[0].name = 'Big';
  const wall = { ...W('part', [2, 0], [2, 4], 0.1), level: L };
  p.walls.push(wall);
  const split = roomsAfterWalls(p, L, [wall], make);
  assert.equal(split.changed.length, 1);
  assert.equal(split.added.length, 1);
  assert.equal(p.rooms.length, 2);
  assert.ok(p.rooms.every((r) => r.floor === 'tile-grey'), 'the new part keeps the finish');
  assert.ok(Math.abs(p.rooms.reduce((s, r) => s + polygonArea(r.points), 0) - (5.8 * 3.8 - 0.1 * 3.8)) < 1e-6);
  // A free-standing wall inside a room closes nothing.
  const stub = { ...W('stub', [4, 1], [4, 2], 0.1), level: L };
  p.walls.push(stub);
  assert.deepEqual(roomsAfterWalls(p, L, [stub], make), { added: [], changed: [] });
});

test('old projects with a library column still load; the column counts as structure', () => {
  const raw = { ...createProject(), objects: [{ id: 'old', level: undefined, item: 'column', params: { shape: 'round', size: 0.3 }, position: [1, 0, 1] }] };
  const p = normalizeProject(JSON.parse(JSON.stringify(raw)));
  assert.equal(p.objects.length, 1);
  assert.ok(isColumn(p.objects[0]));
  assert.deepEqual(columnShape(p.objects[0]), { shape: 'round', w: 0.3, d: 0.3 });
  assert.equal(columnSnapPoints(p, p.levels[0].id).length, 1);
});

// ───────────────────────── sample floor plans

/** Two walls of a level that lie on one line and overlap along it. */
function overlappingWalls(walls) {
  const out = [];
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const A = walls[i]; const B = walls[j];
      const d = wallDir(A); const n = wallNormal(A);
      const off = (q) => (q[0] - A.a[0]) * n[0] + (q[1] - A.a[1]) * n[1];
      if (Math.abs(off(B.a)) > 1e-3 || Math.abs(off(B.b)) > 1e-3) continue;
      const t = (q) => (q[0] - A.a[0]) * d[0] + (q[1] - A.a[1]) * d[1];
      const [a0, a1] = [0, t(A.b)].sort((x, y) => x - y);
      const [b0, b1] = [t(B.a), t(B.b)].sort((x, y) => x - y);
      if (Math.min(a1, b1) - Math.max(a0, b0) > 1e-3) out.push([A.id, B.id]);
    }
  }
  return out;
}

test('every sample floor plan builds: rooms detected, no overlapping walls, columns on walls', () => {
  assert.ok(Object.keys(PLANS).length >= 16);
  for (const want of ['apt59-flat', 'apt59-tower', 'apt74-flat', 'apt74-tower', 'apt84-flat', 'apt84-tower', 'apt114-flat', 'officetel', 'studio', 'villa', 'house-1f', 'house-2f', 'small-office', 'cafe', 'clinic', 'classroom', 'apt84-3bay', 'villa-3room', 'academy']) assert.ok(PLANS[want], want);
  for (const [id, spec] of Object.entries(PLANS)) {
    for (const lang of ['ko', 'en']) assert.ok(spec[lang][0] && spec[lang][1], `${id}: ${lang} name`);
    const built = buildPlan(id, { language: 'ko' });
    const p = { ...normalizeProject(built), rects: built.rects };
    assert.equal(p.levels.length, spec.plan.length, id);
    spec.plan.forEach((levelSpec, i) => {
      const level = p.levels[i].id;
      const walls = p.walls.filter((w) => w.level === level);
      const rooms = p.rooms.filter((r) => r.level === level);
      assert.ok(walls.length >= 4, `${id}: walls`);
      assert.ok(rooms.length >= 1, `${id}: rooms`);
      assert.deepEqual(overlappingWalls(walls), [], `${id} ${p.levels[i].name}: overlapping walls`);
      // Each room rectangle's centre lies in a detected room (except the open stairwell).
      for (const r of p.rects.filter((x) => x.level === level && x.key !== levelSpec.stairwell)) {
        const c = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
        // …in exactly one room: rooms do not overlap.
        assert.equal(rooms.filter((room) => pointInPolygon(c, room.points)).length, 1, `${id}: ${r.key} has one room`);
        assert.ok(detectRoom(walls, c, level), `${id}: ${r.key} is enclosed`);
      }
      // Doors and windows stay inside their walls and do not overlap on a wall.
      for (const w of walls) {
        const ops = p.openings.filter((o) => o.wall === w.id).sort((x, y) => x.offset - y.offset);
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        for (const o of ops) assert.ok(o.offset - o.width / 2 >= 0 && o.offset + o.width / 2 <= L + 1e-9, `${id}: opening inside its wall`);
        for (let k = 1; k < ops.length; k++) assert.ok(ops[k].offset - ops[k].width / 2 >= ops[k - 1].offset + ops[k - 1].width / 2, `${id}: openings overlap`);
      }
      // Columns sit on a wall line (their centre within the wall's half thickness).
      for (const col of p.objects.filter((o) => isColumn(o) && o.level === level)) {
        const c = [col.position[0], col.position[2]];
        assert.ok(walls.some((w) => { const d = wallDir(w); const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); const t = (c[0] - w.a[0]) * d[0] + (c[1] - w.a[1]) * d[1]; const off = Math.abs((c[0] - w.a[0]) * -d[1] + (c[1] - w.a[1]) * d[0]); return t >= -1e-6 && t <= L + 1e-6 && off <= w.thickness / 2; }), `${id}: column on a wall`);
      }
    });
    // The entrance door leads outside.
    assert.ok(p.openings.some((o) => o.item === 'door-entrance' || o.item === 'door-single'), `${id}: doors`);
  }
});

test('commercial plans have structural columns; apartments are wall structures', () => {
  for (const id of ['small-office', 'cafe', 'clinic', 'classroom', 'academy']) assert.ok(buildPlan(id).objects.filter(isColumn).length >= 4, id);
  for (const id of ['apt59-flat', 'apt84-tower', 'villa']) assert.equal(buildPlan(id).objects.filter(isColumn).length, 0, id);
});

test('the floor plans are start-page samples (empty and lightly furnished)', () => {
  assert.ok(SAMPLE_GROUPS.some((g) => g.id === 'plans' && g.ko && g.en));
  const plans = SAMPLE_PROJECTS.filter((s) => s.group === 'plans');
  // The start page shows five tiles a row: the group fills its rows.
  assert.ok(plans.length >= 25 && plans.length % 5 === 0, String(plans.length));
  assert.equal(new Set(SAMPLE_PROJECTS.map((s) => s.id)).size, SAMPLE_PROJECTS.length, 'unique ids');
  for (const s of plans) {
    const p = buildSampleProject(s.id, 'en');
    assert.ok(p && p.walls.length >= 4 && p.rooms.length >= 1, s.id);
    if (s.furnish) assert.ok(p.objects.filter((o) => !isColumn(o) && o.item !== 'stairs').length >= 3, `${s.id}: furnished`);
    else assert.equal(p.objects.filter((o) => !isColumn(o) && o.item !== 'stairs').length, 0, `${s.id}: empty`);
    assert.equal(p.name, s.en[0]);
  }
});
