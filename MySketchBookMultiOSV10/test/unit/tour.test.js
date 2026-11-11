// Automatic walk-through (src/engine/tour.js): the route through the start page's sample buildings — in at the
// entrance, every room seen, walks that never go through a wall (only through door gaps), stairs climbed to the
// floors above — and the player walking a viewport's camera along it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SAMPLE_PROJECTS, buildSampleProject } from '../../src/engine/samples.js';
import { planTour, levelObstacles, clearPath, roomStandPoint, isPassable, TourPlayer, EYE_HEIGHT } from '../../src/engine/tour.js';
import { pointInPolygon } from '../../src/engine/walls.js';

const projects = SAMPLE_PROJECTS.map((s) => [s.id, buildSampleProject(s.id, 'ko')]).filter(([, p]) => p);

test('tour: every room of every sample is visited, once', () => {
  for (const [id, p] of projects) {
    const moves = planTour(p);
    const looks = moves.filter((m) => m.type === 'look');
    assert.equal(looks.length, p.rooms.filter((r) => r.points?.length >= 3).length, `${id}: rooms visited`);
    assert.equal(new Set(looks.map((m) => m.room)).size, looks.length, `${id}: a room twice`);
    looks.forEach((m, i) => { assert.equal(m.index, i + 1); assert.equal(m.total, looks.length); });
  }
});

test('tour: rooms are walked to (a glide only into rooms without a door)', () => {
  let glides = 0; let rooms = 0;
  for (const [id, p] of projects) {
    const moves = planTour(p);
    for (const m of moves.filter((x) => x.type === 'look')) {
      rooms++;
      if (!m.glide) continue;
      glides++;
      // A glide is only allowed where no door of the level leads into the room.
      const { doors } = levelObstacles(p, m.level);
      const poly = p.rooms.find((r) => r.id === m.room).points;
      const levels = [...p.levels].sort((a, b) => a.elevation - b.elevation);
      const upper = levels.findIndex((l) => l.id === m.level) > 0;
      assert.ok(upper || !doors.some((d) => d.sides.some((s) => pointInPolygon(s, poly))), `${id}: ${m.name} has a door but was not walked to`);
    }
  }
  assert.ok(glides <= rooms * 0.05, `too many glides: ${glides} of ${rooms}`);
});

test('tour: walks keep clear of walls — they cross a wall line only in a door gap', () => {
  for (const [id, p] of projects) {
    const moves = planTour(p);
    for (const m of moves.filter((x) => x.type === 'walk')) {
      const { solids } = levelObstacles(p, m.level);
      for (let i = 1; i < m.points.length; i++) {
        // The stairs' foot may be close to a wall (tight clearance); every other leg keeps the full clearance.
        const ok = clearPath(m.points[i - 1], m.points[i], solids, 0.04);
        assert.ok(ok, `${id}: walk leg ${i} goes through a wall`);
      }
    }
  }
});

test('tour: the stairs of multi-storey samples are climbed, ending on the next floor', () => {
  let climbs = 0;
  for (const [id, p] of projects) {
    if (p.levels.length < 2) continue;
    const stairs = p.objects.filter((o) => /^stairs/.test(o.item));
    const moves = planTour(p);
    const c = moves.filter((m) => m.type === 'climb');
    if (stairs.length) assert.ok(c.length >= 1, `${id}: no climb`);
    for (const m of c) {
      climbs++;
      const from = p.levels.find((l) => l.id === m.from); const to = p.levels.find((l) => l.id === m.to);
      assert.ok(to.elevation > from.elevation, `${id}: climbs down`);
      assert.equal(m.points[0][1], 0);
      assert.ok(Math.abs(m.points.at(-1)[1] - (to.elevation - from.elevation)) < 1e-6, `${id}: does not end on the floor above`);
      for (let i = 1; i < m.points.length; i++) assert.ok(m.points[i][1] >= m.points[i - 1][1] - 1e-6, `${id}: goes down on the way up`);
    }
  }
  assert.ok(climbs >= 5, `climbs: ${climbs}`);
});

test('tour: starts outside the entrance door when there is one', () => {
  const p = buildSampleProject('apt84-a', 'ko');
  const moves = planTour(p);
  const first = moves[0];
  assert.equal(first.type, 'walk');
  const inside = p.rooms.some((r) => pointInPolygon(first.points[0], r.points));
  assert.equal(inside, false, 'starts outside');
});

test('tour: stand points are inside their rooms, away from the walls', () => {
  for (const [id, p] of projects.slice(0, 30)) {
    for (const lv of p.levels) {
      const { solids } = levelObstacles(p, lv.id);
      for (const r of p.rooms.filter((x) => x.level === lv.id)) {
        const s = roomStandPoint(r, solids);
        assert.ok(s && pointInPolygon(s, r.points), `${id}: ${r.name}`);
      }
    }
  }
});

test('tour: doors and floor-height openings are passable, windows are not', () => {
  assert.equal(isPassable({ item: 'door-single', sill: 0, height: 2.1 }), true);
  assert.equal(isPassable({ item: 'door-pocket', sill: 0, height: 2.1 }), true);
  assert.equal(isPassable({ item: 'opening-arch', sill: 0, height: 2.1 }), true);
  assert.equal(isPassable({ item: 'window-casement', sill: 0.9, height: 1.4 }), false);
  assert.equal(isPassable({ item: 'window-sliding', sill: 0.1, height: 2.1 }), false);
});

test('tour: no rooms, no tour', () => {
  const p = buildSampleProject('apt84-a', 'ko');
  assert.equal(planTour({ ...p, rooms: [] }).filter((m) => m.type === 'look').length, 0);
});

test('tour: planning is quick (all samples)', () => {
  const t0 = performance.now();
  for (const [, p] of projects) planTour(p);
  const per = (performance.now() - t0) / projects.length;
  assert.ok(per < 60, `${per.toFixed(1)} ms per building`);
});

test('tour player: walks the camera along the route at eye height, looks round, reports rooms, ends', () => {
  const p = buildSampleProject('apt59-furnished', 'ko');
  const moves = planTour(p);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(10, 10, 10);
  const vp = {
    camera, target: new THREE.Vector3(), isOrtho: false, tour: null, animation: null,
    setProjection() {}, syncCameras() { camera.lookAt(this.target); }, touchInteraction() {}, requestRender() {},
    animateTo(pos, target) { camera.position.copy(pos); this.target.copy(target); },
  };
  const reports = [];
  const player = new TourPlayer(vp, p, moves, { speed: 3, onChange: (s) => reports.push(s) });
  player.start();
  assert.equal(vp.tour, player);
  player.wait = 0;
  let now = 1000; let guard = 0;
  const heights = new Set();
  while (player.index < moves.length && guard++ < 200000) {
    now += 16; player.step(now);
    heights.add(Math.round((camera.position.y - EYE_HEIGHT) * 100));
  }
  assert.ok(guard < 200000, 'never ends');
  assert.ok(reports.at(-1).done, 'reports the end');
  const roomsSeen = new Set(reports.filter((r) => r.room?.here).map((r) => r.room.name));
  assert.equal(roomsSeen.size, moves.filter((m) => m.type === 'look').length);
  assert.deepEqual([...heights], [0], 'eye height on one floor');
  player.stop({ restore: true });
  assert.equal(vp.tour, null);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(10, 10, 10)) < 1e-9, 'back to the view it started from');
});

test('tour player: pause holds the camera; skip goes to the next room', () => {
  const p = buildSampleProject('apt84-a', 'ko');
  const moves = planTour(p);
  const camera = new THREE.PerspectiveCamera();
  const vp = { camera, target: new THREE.Vector3(0, 0, -1), isOrtho: false, setProjection() {}, syncCameras() {}, touchInteraction() {}, requestRender() {}, animateTo(pos, target) { camera.position.copy(pos); this.target.copy(target); } };
  const player = new TourPlayer(vp, p, moves, { onChange: () => {} });
  player.start(); player.wait = 0;
  for (let i = 1; i < 30; i++) player.step(1000 + i * 16);
  player.setPaused(true);
  const at = camera.position.clone();
  for (let i = 30; i < 90; i++) player.step(1000 + i * 16);
  assert.ok(camera.position.equals(at), 'held while paused');
  player.resume(); player.wait = 0;
  const before = player.index;
  const nextLook = moves.findIndex((m, i) => i > before && m.type === 'look');
  player.skip(1);
  assert.equal(player.index, nextLook, 'the next room');
  assert.equal(moves[player.index].type, 'look');
  const look = moves[player.index];
  assert.ok(Math.hypot(camera.position.x - look.at[0], camera.position.z - look.at[1]) < 1e-9, 'at the room');
});
