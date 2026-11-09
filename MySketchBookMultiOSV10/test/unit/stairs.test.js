// Stairs (src/engine/stairs.js + the `stairs` library item): riser and tread arithmetic per type,
// bounding sizes, the U stair's half landing and well, spiral angles, placing from a start point
// and a direction (the Stairs tool), floor holes (stairwells) and the stair checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';
import { createProject, normalizeProject, polygonArea, roomArea, newId } from '../../src/engine/document.js';
import { floorTriangles } from '../../src/engine/walls.js';
import { checkProject } from '../../src/engine/checks.js';
import { buildTemplate } from '../../src/engine/templates.js';
import {
  STAIR_TYPES, stairLayout, stairInfo, riserCount, sideRuns, placeStairs, rotationFor, toWorld, riseToNextLevel, syncStairwells, clipPolygon, holeInRoom, railSidesOf,
} from '../../src/engine/stairs.js';

const ITEMS = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));
const itemOf = (id) => ITEMS.get(id) ?? null;
const MAT = new THREE.MeshBasicMaterial();
const ctx = (quality = 'high') => ({ quality, wallThickness: 0.2, material: () => MAT });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const centroid = (poly) => [poly.reduce((s, q) => s + q[0], 0) / poly.length, poly.reduce((s, q) => s + q[1], 0) / poly.length];
const inside = (p, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]; const [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};
const bbox = (poly) => { const xs = poly.map((q) => q[0]); const zs = poly.map((q) => q[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }; };

test('riser count: n = ceil(rise / maxRiser), equal risers, never above the maximum', () => {
  assert.equal(riserCount(2.7, 0.19), 15);
  assert.equal(riserCount(3.6, 0.19), 19);
  assert.equal(riserCount(2.66, 0.19), 14); // 2.66 / 0.19 = 14 exactly
  assert.equal(riserCount(0.3, 0.19), 2);
  for (const type of STAIR_TYPES) {
    for (const rise of [2.6, 2.7, 3.0, 3.6]) {
      const L = stairLayout({ type, rise, maxRiser: 0.18 });
      assert.equal(L.n, Math.ceil(rise / 0.18 - 1e-9), `${type} ${rise}`);
      assert.ok(L.riser <= 0.18 + 1e-12 && near(L.riser * L.n, rise, 1e-9), `${type}: equal risers`);
    }
  }
});

test('every type: treads at 1·R … (n−1)·R, one per riser, the last riser reaching the floor above', () => {
  for (const type of STAIR_TYPES) {
    for (const turn of ['left', 'right']) {
      const L = stairLayout({ type, rise: 2.7, turn });
      const treads = L.steps.filter((s) => !s.platform);
      assert.equal(treads.length, L.n - 1, `${type}: n − 1 treads (landings and winders count)`);
      treads.forEach((s, i) => assert.ok(near(s.y, (i + 1) * L.riser, 1e-9), `${type}: tread ${i + 1} at ${s.y}`));
      for (const s of L.steps) assert.ok(polygonArea(s.poly) > 0.005, `${type}: tread area`);
      // A spiral's top landing is level with the floor above; the others end on the last riser.
      if (type === 'spiral') assert.ok(near(L.steps.at(-1).y, 2.7, 1e-9) && L.steps.at(-1).platform);
      else assert.ok(L.exit && L.exitRiser);
      // The pitch line of every side climbs from the first riser to the floor above.
      for (const side of L.sides) {
        assert.ok(side.pts[0][2] >= L.riser - 1e-9);
        assert.ok(side.pts.every((q, i) => i === 0 || q[2] >= side.pts[i - 1][2] - 1e-9), `${type}: pitch never goes down`);
        assert.ok(near(side.pts.at(-1)[2], 2.7, 1e-9), `${type} ${side.side}: ends at the rise`);
      }
    }
  }
});

test('straight: going (n − 1) × run, width × length footprint, sizes follow the params', () => {
  const L = stairLayout({ type: 'straight', rise: 2.7, run: 0.26, width: 1.1 });
  assert.equal(L.n, 15);
  assert.ok(near(L.size[0], 1.1, 1e-3) && near(L.size[2], 14 * 0.26, 1e-3));
  assert.ok(L.size[1] > 2.7 + 0.85, 'height includes the handrail');
  assert.ok(near(L.blondel, 2 * L.riser + 0.26, 1e-9));
  const info = stairInfo({ type: 'straight', rise: 2.7, run: 0.26 });
  assert.equal(info.n, 15);
  assert.equal(info.treads, 14);
  assert.equal(info.comfortable, true); // 2 × 180 + 260 = 620
  assert.equal(stairInfo({ type: 'straight', rise: 2.7, run: 0.35, maxRiser: 0.21 }).comfortable, false);
});

test('L (quarter landing) and winder: flights at right angles, landing ≥ width, three winders fill the corner', () => {
  const w = 1.0; const G = 0.26;
  const L = stairLayout({ type: 'l', rise: 2.7, width: w, run: G, turn: 'right' });
  const a = Math.ceil((L.n - 2) / 2); const b = L.n - 2 - a;
  assert.ok(near(L.size[0], w + b * G, 1e-3) && near(L.size[2], a * G + w, 1e-3), JSON.stringify(L.size));
  const landing = L.steps.find((s) => s.landing);
  assert.ok(near(polygonArea(landing.poly), w * w, 1e-9) && near(landing.y, (a + 1) * L.riser, 1e-9));
  const deeper = stairLayout({ type: 'l', rise: 2.7, width: w, run: G, landing: 1.4 });
  assert.ok(near(polygonArea(deeper.steps.find((s) => s.landing).poly), w * 1.4, 1e-9));
  // The second flight runs along x, to the right of the climber (turn right) or the left.
  const f2 = (lay) => centroid(lay.steps.at(-1).poly)[0] - centroid(lay.steps[0].poly)[0];
  assert.ok(f2(L) > 0.5 && f2(stairLayout({ type: 'l', rise: 2.7, turn: 'left' })) < -0.5);
  const W = stairLayout({ type: 'winder', rise: 2.7, width: w, run: G });
  const winders = W.steps.filter((s) => s.winder);
  assert.equal(winders.length, 3);
  assert.ok(near(winders.reduce((s, t) => s + polygonArea(t.poly), 0), w * w, 1e-9), 'the winders fill the square corner');
  assert.ok(near(W.walkGoing, (Math.PI / 4) * w / 3, 1e-9), 'winders: a quarter circle on the walking line, in three');
});

test('U / switchback: two parallel flights, a half landing across both and the well, the gap between them', () => {
  const w = 1.1; const g = 0.2; const G = 0.27;
  for (const turn of ['left', 'right']) {
    const L = stairLayout({ type: 'u', rise: 3.6, width: w, gap: g, run: G, turn });
    const a = Math.ceil((L.n - 2) / 2); const b = L.n - 2 - a;
    assert.equal(L.n, 19);
    assert.ok(near(L.size[0], 2 * w + g, 1e-3) && near(L.size[2], a * G + w, 1e-3), JSON.stringify(L.size));
    const flight1 = L.steps.slice(0, a); const landing = L.steps[a]; const flight2 = L.steps.slice(a + 1);
    assert.ok(landing.landing && flight2.length === b);
    const box1 = bbox(flight1.flatMap((s) => s.poly)); const box2 = bbox(flight2.flatMap((s) => s.poly)); const lb = bbox(landing.poly);
    // Side by side with the well between them; the landing spans both flights and the well.
    const gapNow = Math.max(box2.x0 - box1.x1, box1.x0 - box2.x1);
    assert.ok(near(gapNow, g, 1e-9), `gap ${gapNow}`);
    assert.ok(near(lb.x1 - lb.x0, 2 * w + g, 1e-9) && near(lb.z1 - lb.z0, w, 1e-9));
    // Both flights meet the landing edge; flight 1 climbs towards it, flight 2 climbs back.
    assert.ok(near(box1.z0, lb.z1, 1e-9) && near(box2.z0, lb.z1, 1e-9));
    assert.ok(flight1[1].poly[0][1] < flight1[0].poly[0][1] && flight2[1].poly[0][1] > flight2[0].poly[0][1]);
    // Turning right puts the second flight on the climber's right (+x before rotation).
    assert.equal(Math.sign(centroid(flight2[0].poly)[0] - centroid(flight1[0].poly)[0]), turn === 'right' ? 1 : -1);
    // The handrails run round the well: the inner side is split at the landing step.
    const inner = L.sides.find((s) => s.side === 'inner');
    assert.equal(sideRuns(inner.pts).length, 2);
    assert.deepEqual(railSidesOf(L).map((s) => s.side), ['inner']);
  }
  // No room for two balustrades: a central wall instead, rails on the outside.
  const tight = stairLayout({ type: 'u', rise: 2.7, gap: 0 });
  assert.ok(tight.spine && tight.spine.thick > 0);
});

test('spiral: wedge treads of angle / (n − 1), the turn and diameter as asked, pole and outer handrail', () => {
  const L = stairLayout({ type: 'spiral', rise: 2.7, angle: 360, diameter: 1.8, turn: 'right' });
  assert.ok(near(L.size[0], 1.8, 0.01) && near(L.size[2], 1.8, 0.01));
  const d = (2 * Math.PI) / (L.n - 1);
  // Each tread's front edge is a radius at (i − 1) · d from the first.
  const ang = (s) => { const [a, b] = s.front; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  const treads = L.steps.filter((s) => !s.platform);
  for (let i = 1; i < treads.length; i++) {
    let delta = ang(treads[i]) - ang(treads[i - 1]);
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    assert.ok(near(Math.abs(delta), d, 1e-6), `tread ${i}: ${delta}`);
  }
  assert.ok(L.pole && L.pole.h > 2.7);
  assert.deepEqual(railSidesOf(L).map((s) => s.side), ['outer']);
  // Clockwise one way, anticlockwise the other.
  const turning = (lay) => { const t = lay.steps.filter((s) => !s.platform); let delta = ang(t[1]) - ang(t[0]); return Math.sign(Math.atan2(Math.sin(delta), Math.cos(delta))); };
  assert.equal(turning(L), -turning(stairLayout({ type: 'spiral', rise: 2.7, turn: 'left' })));
  const curved = stairLayout({ type: 'curved', rise: 2.7, angle: 180, innerRadius: 0.6, width: 1.0 });
  assert.ok(near(curved.size[0], 2 * 1.6, 0.02) && near(curved.size[2], 1.6, 0.02), JSON.stringify(curved.size));
});

test('the opening covers the whole stair; its last edge is the arrival edge (no clearance there)', () => {
  for (const type of STAIR_TYPES) {
    const L = stairLayout({ type, rise: 2.7 });
    for (const s of L.steps) assert.ok(inside(centroid(s.poly), L.hole), `${type}: tread inside the opening`);
    for (const q of L.footprint) {
      const sh = [q[0] * 0.999, q[1] * 0.999];
      assert.ok(inside(sh, L.hole) || type === 'curved', `${type}: footprint inside the opening`);
    }
    // Centred: the bounding box of the footprint is centred on the origin.
    const b = bbox(L.footprint);
    assert.ok(near(b.x0 + b.x1, 0, 1e-9) && near(b.z0 + b.z1, 0, 1e-9), type);
  }
});

test('library item: builds every type, the bounding box matches sizeOf, old params still build', () => {
  const entry = ITEMS.get('stairs');
  for (const type of STAIR_TYPES) {
    for (const extra of [{}, { turn: 'right', rail: 'glass', railSides: 'both', risers: 'open' }]) {
      const params = { type, rise: 2.7, ...extra };
      const g = entry.build(params, ctx());
      const b = new THREE.Box3().setFromObject(g);
      const size = entry.sizeOf(params);
      assert.ok(Math.abs(b.min.y) < 0.01, `${type}: on the floor`);
      assert.ok(Math.abs(b.max.x - b.min.x - size[0]) < 0.08 && Math.abs(b.max.z - b.min.z - size[2]) < 0.08, `${type}: bbox ${b.max.x - b.min.x} × ${b.max.z - b.min.z} vs ${size}`);
      assert.ok(Math.abs(b.max.y - size[1]) < 0.1, `${type}: height ${b.max.y} vs ${size[1]}`);
    }
  }
  // A file from before the new types: { rise, width } (straight) and { type: 'l', turn } still build.
  for (const params of [{ rise: 2.7, width: 1 }, { type: 'l', rise: 2.6, turn: 'right', rail: 'glass' }]) {
    const g = entry.build(params, ctx('low'));
    assert.ok(new THREE.Box3().setFromObject(g).max.y > 2.6);
  }
  assert.deepEqual(entry.size, stairLayout({}).size);
});

test('placing (Stairs tool): the first riser starts at the clicked point and the stair climbs the chosen way', () => {
  for (const type of STAIR_TYPES) {
    for (const dir of [[0, -1], [1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2]]) {
      const params = { type, rise: 2.7, width: 1.0, turn: 'left' };
      const start = [2.5, -1.25];
      const placed = placeStairs(params, start, dir);
      const o = { position: placed.position, rotation: placed.rotation, scale: [1, 1, 1] };
      const s = toWorld(o, placed.layout.start);
      assert.ok(near(s[0], start[0], 1e-9) && near(s[1], start[1], 1e-9), `${type}: start ${s}`);
      // The first tread lies ahead of the start, in the climbing direction.
      const c = toWorld(o, centroid(placed.layout.steps[0].poly));
      assert.ok((c[0] - start[0]) * dir[0] + (c[1] - start[1]) * dir[1] > 0.05, `${type} ${dir}: first tread ahead`);
    }
  }
  assert.ok(near(rotationFor([0, -1]), 0) && near(Math.abs(rotationFor([0, 1])), Math.PI));
  // The rise reaches the level above (slab included); on the top level it is the level's height.
  const p = createProject();
  p.levels.push({ id: 'up', name: '2F', elevation: 3.0, height: 2.7 });
  assert.equal(riseToNextLevel(p, p.levels[0].id), 3.0);
  assert.equal(riseToNextLevel(p, 'up'), 2.7);
});

test('floor holes: the floor is triangulated round them and the area is the room less the holes', () => {
  const room = { points: [[0, 0], [6, 0], [6, 4], [0, 4]], holes: [{ points: [[1, 1], [3, 1], [3, 3], [1, 3]] }, [[4, 0.5], [5, 0.5], [5, 1.5], [4, 1.5]]] };
  assert.ok(near(roomArea(room), 24 - 4 - 1, 1e-9));
  const tri = floorTriangles(room.points, room.holes);
  const area = tri.triangles.reduce((s, [a, b, c]) => s + polygonArea([tri.points[a], tri.points[b], tri.points[c]]), 0);
  assert.ok(near(area, 19, 1e-6), `triangulated ${area}`);
  // A hole touching the room's edge (a stairwell against a wall) still triangulates.
  const edge = floorTriangles(room.points, [[[0, 2], [2, 2], [2, 4], [0, 4]]]);
  assert.ok(near(edge.triangles.reduce((s, [a, b, c]) => s + polygonArea([edge.points[a], edge.points[b], edge.points[c]]), 0), 20, 1e-6));
  // Clipping an opening to a room.
  assert.ok(near(polygonArea(clipPolygon([[-1, -1], [2, -1], [2, 2], [-1, 2]], room.points)), 4, 1e-9));
  assert.deepEqual(holeInRoom([[10, 10], [11, 10], [11, 11]], room.points), []);
  // Saved and loaded: kept; broken entries dropped; old files have none.
  const p = normalizeProject({ rooms: [{ points: room.points, holes: [{ points: [[1, 1], [2, 1], [2, 2]] }, { points: 'bad' }, [[0, 0], [1, 0]]] }, { points: room.points }] });
  assert.equal(p.rooms[0].holes.length, 1);
  assert.equal(p.rooms[1].holes, undefined);
});

/** Two levels, a room on each covering the same 6 × 4 m, and a straight stair on the ground floor. */
function twoLevels(params = { type: 'u', width: 1.0 }) {
  const p = createProject({ wallHeight: 2.7 });
  const up = { id: 'up', name: '2F', elevation: 3.0, height: 2.7 };
  p.levels.push(up);
  const pts = [[0, 0], [6, 0], [6, 4], [0, 4]];
  p.rooms.push({ id: 'r1', level: p.levels[0].id, name: '1F', points: pts, showCeiling: true }, { id: 'r2', level: 'up', name: '2F', points: pts });
  const placed = placeStairs({ rise: 3.0, ...params }, [1.0, 3.5], [0, -1]);
  p.objects.push({ id: 'st', level: p.levels[0].id, item: 'stairs', params: { rise: 3.0, ...params }, position: placed.position, rotation: placed.rotation, scale: [1, 1, 1] });
  return p;
}

test('stairwells: the stair cuts the floor above and the ceiling below; moving, resizing and deleting follow', () => {
  const p = twoLevels();
  assert.equal(syncStairwells(p), true);
  const r2 = p.rooms.find((r) => r.id === 'r2'); const r1 = p.rooms.find((r) => r.id === 'r1');
  assert.equal(r2.holes.length, 1);
  assert.equal(r1.ceilingHoles.length, 1);
  assert.equal(r1.holes, undefined, 'the floor of the stair\'s own level stays whole');
  const area = polygonArea(r2.holes[0].points);
  assert.ok(area > 2 && area < 24, `hole ${area}`);
  assert.equal(syncStairwells(p), false, 'nothing changes the second time');
  // Moving the stair moves the hole.
  const before = JSON.stringify(r2.holes);
  p.objects[0].position = [p.objects[0].position[0] + 1, 0, p.objects[0].position[2]];
  assert.equal(syncStairwells(p), true);
  assert.notEqual(JSON.stringify(r2.holes), before);
  // Wider stair: bigger hole.
  p.objects[0].params = { ...p.objects[0].params, width: 1.2 };
  syncStairwells(p);
  assert.ok(polygonArea(r2.holes[0].points) > area);
  // A hole drawn by hand stays.
  r2.holes.push({ points: [[5, 3], [5.5, 3], [5.5, 3.5]] });
  // Deleted (or stairwell switched off): its holes go, the others stay.
  p.objects = [];
  assert.equal(syncStairwells(p), true);
  assert.equal(r2.holes.length, 1);
  assert.equal(r1.ceilingHoles, undefined);
});

test('stair checks: rise mismatch, no level above, headroom under a floor without an opening', () => {
  const codes = (p) => checkProject(p, itemOf).filter((x) => /^stairs/.test(x.code)).map((x) => x.code).sort();
  const p = twoLevels();
  assert.deepEqual(codes(p), ['stairsHeadroom'], 'no opening yet: the floor above is in the way');
  syncStairwells(p);
  assert.deepEqual(codes(p), []);
  p.objects[0].params = { ...p.objects[0].params, rise: 2.7 };
  assert.ok(codes(p).includes('stairsRise'));
  const q = twoLevels();
  q.objects[0].level = 'up';
  assert.deepEqual(codes(q), ['stairsNoLevel']);
});

test('templates: the house and office stair cores use switchback stairs with openings in the floors above', () => {
  for (const id of ['house3', 'building']) {
    const p = buildTemplate(id);
    const stairs = p.objects.filter((o) => o.item === 'stairs');
    assert.ok(stairs.length >= 2 && stairs.every((o) => o.params.type === 'u'));
    const codes = checkProject(p, itemOf).filter((x) => /^stairs/.test(x.code));
    assert.deepEqual(codes, [], `${id}: ${JSON.stringify(codes)}`);
    // Every level above the ground floor has a floor with the opening.
    for (const lv of p.levels.slice(1)) assert.ok(p.rooms.some((r) => r.level === lv.id && r.holes?.length), `${id} ${lv.name}: opening`);
    void newId;
  }
  const duplex = buildTemplate('duplex');
  assert.equal(duplex.objects.filter((o) => o.item === 'stairs').length, 1);
});
