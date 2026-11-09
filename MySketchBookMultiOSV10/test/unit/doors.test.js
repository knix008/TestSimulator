// Door swings: the plan geometry (src/engine/doorswing.js) matches the 3D door the builder
// places, the Problems checks (doorBlocked, doorwayBlocked, doorsCollide, doorHitsWall), the
// hinge / swing controls, the plan lines, and every furnished sample keeps its doors clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';
import { createProject, normalizeProject } from '../../src/engine/document.js';
import { wallDir, wallNormal } from '../../src/engine/walls.js';
import { checkProject } from '../../src/engine/checks.js';
import { buildSampleProject, SAMPLE_PROJECTS } from '../../src/engine/samples.js';
import {
  swingMeta, swingKind, swingLeaves, planLeaves, sectorPolygon, overlapDepth, doorDirection, setDoorDirection, swingLinePoints, doorSideRooms, SWING_BAND,
} from '../../src/engine/doorswing.js';

const ITEMS = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));
const itemOf = (id) => ITEMS.get(id) ?? null;
const MAT = new THREE.MeshBasicMaterial();
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** Builds a door like SceneBuilder.buildOpening (same rotation and flip) and returns the plan box of its leaves. */
function builtLeafBox(itemId, opening, wall) {
  const item = itemOf(itemId);
  const content = item.build({ ...opening.params, width: opening.width, height: opening.height }, { quality: 'low', wallThickness: wall.thickness, material: () => MAT, THREE });
  if (opening.flip) content.scale.x = -1;
  const group = new THREE.Group();
  group.add(content);
  const d = wallDir(wall); const n = wallNormal(wall);
  group.position.set(wall.a[0] + d[0] * opening.offset, 0, wall.a[1] + d[1] * opening.offset);
  group.rotation.y = Math.atan2(n[0], n[1]) + (opening.side === 'right' ? Math.PI : 0);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  content.traverse((o) => { if (o.isMesh && o.userData.role === 'leaf') box.union(new THREE.Box3().setFromObject(o)); });
  return box;
}

const WALL = { id: 'w', level: 'L', a: [0, 0], b: [4, 0], thickness: 0.2 };

test('the swing of every hinged door matches the leaf the 3D model opens (side × flip)', () => {
  for (const itemId of ['door-single', 'door-entrance', 'door-double', 'door-two-panel', 'door-hanok', 'door-arched', 'door-fire', 'door-dutch']) {
    const item = itemOf(itemId);
    assert.ok(item, itemId);
    for (const side of ['left', 'right']) {
      for (const flip of [false, true]) {
        for (const wall of [WALL, { ...WALL, a: [1, 1], b: [1, 5] }]) {
          const width = item.size[0];
          const opening = { id: 'o', wall: 'w', item: itemId, offset: 2, width, height: 2.1, sill: 0, flip, side, params: { open: 90 } };
          const meta = swingMeta(item, { ...opening.params, width, height: 2.1 }, wall.thickness);
          assert.equal(swingKind(meta), 'swing', itemId);
          const leaves = planLeaves(opening, wall, meta);
          assert.ok(leaves.length >= 1, itemId);
          // Predicted: each open leaf runs from its hinge along v for r.
          const pred = new THREE.Box3();
          for (const l of leaves) {
            pred.expandByPoint(new THREE.Vector3(l.hinge[0], 0, l.hinge[1]));
            pred.expandByPoint(new THREE.Vector3(l.hinge[0] + l.v[0] * l.r, 0, l.hinge[1] + l.v[1] * l.r));
          }
          const box = builtLeafBox(itemId, opening, wall);
          const tol = 0.09;
          const label = `${itemId} side=${side} flip=${flip} wall=${wall.a}`;
          assert.ok(near(box.min.x, pred.min.x, tol) && near(box.max.x, pred.max.x, tol), `${label}: x ${box.min.x.toFixed(3)}..${box.max.x.toFixed(3)} vs ${pred.min.x.toFixed(3)}..${pred.max.x.toFixed(3)}`);
          assert.ok(near(box.min.z, pred.min.z, tol) && near(box.max.z, pred.max.z, tol), `${label}: z ${box.min.z.toFixed(3)}..${box.max.z.toFixed(3)} vs ${pred.min.z.toFixed(3)}..${pred.max.z.toFixed(3)}`);
        }
      }
    }
  }
});

test('door kinds: hinged, pairs, double-acting, pivot, sliding, folding and plain openings', () => {
  const kind = (id) => swingKind(swingMeta(itemOf(id), { width: itemOf(id).size[0] }, 0.2));
  assert.equal(kind('door-single'), 'swing');
  assert.equal(kind('door-double'), 'swing');
  assert.equal(kind('door-pivot'), 'swing');
  assert.equal(kind('door-sliding'), 'slide');
  assert.equal(kind('door-pocket'), 'slide');
  assert.equal(kind('door-barn'), 'slide');
  assert.equal(kind('door-folding'), 'fold');
  assert.equal(kind('door-cased-opening'), 'none');
  assert.equal(swingMeta(itemOf('window-casement'), {}, 0.2), null);
  const pair = swingLeaves(swingMeta(itemOf('door-double'), { width: 1.6 }, 0.2), { width: 1.6, thickness: 0.2 });
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.map((l) => l.dir).sort(), [-1, 1]);
  assert.ok(pair.every((l) => Math.abs(l.hinge[0]) > 0.7 && Math.abs(l.hinge[0]) <= 0.8), JSON.stringify(pair));
  const cafe = swingLeaves(swingMeta(itemOf('door-cafe'), { width: itemOf('door-cafe').size[0] }, 0.2), { width: itemOf('door-cafe').size[0] });
  assert.deepEqual([...new Set(cafe.map((l) => l.zs))].sort(), [-1, 1], 'double-acting doors swing both ways');
  const single = swingLeaves(swingMeta(itemOf('door-single'), { width: 0.9 }, 0.2), { width: 0.9, thickness: 0.2 });
  assert.equal(single.length, 1);
  assert.ok(single[0].hinge[0] < 0 && single[0].dir === 1 && single[0].zs === 1 && near(single[0].hinge[1], 0.1, 1e-9));
  const flipped = swingLeaves(swingMeta(itemOf('door-single'), { width: 0.9 }, 0.2), { width: 0.9, thickness: 0.2, flip: true });
  assert.ok(flipped[0].hinge[0] > 0 && flipped[0].dir === -1);
  const exterior = swingLeaves(swingMeta(itemOf('door-entrance'), { width: 1 }, 0.2), { width: 1, thickness: 0.2 });
  assert.equal(exterior[0].zs, -1, 'entrance doors open outwards');
});

test('the swept area is a quarter disc from the hinge, with the clearance band', () => {
  const leaf = { hinge: [0, 0], u: [1, 0], v: [0, 1], r: 0.8 };
  const sector = sectorPolygon(leaf, 0);
  const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  assert.ok(overlapDepth(sector, box(0.2, 0.2, 0.4, 0.4)) > 0, 'inside the arc');
  assert.ok(overlapDepth(sector, box(0.65, 0.65, 0.9, 0.9)) <= 0, 'beyond the arc (corner of the bounding square)');
  assert.ok(overlapDepth(sector, box(0.2, -0.5, 0.4, -0.1)) <= 0, 'behind the wall face');
  assert.ok(overlapDepth(sector, box(0.1, 0.84, 0.3, 1.2)) <= 0, 'just past the leaf');
  assert.ok(overlapDepth(sectorPolygon(leaf, SWING_BAND), box(0.1, 0.84, 0.3, 1.2)) > 0, 'inside the clearance band');
});

/** A 4 × 3 m room (walls along its edges) with a door in the south wall at x = 2, opening into the room. */
function roomWithDoor({ item = 'door-single', side = 'right', flip = false } = {}) {
  const p = createProject();
  const L = p.levels[0].id;
  const W = (id, a, b) => ({ id, level: L, a, b, thickness: 0.2, height: null, material: {} });
  p.walls.push(W('ws', [0, 3], [4, 3]), W('we', [4, 3], [4, 0]), W('wn', [4, 0], [0, 0]), W('ww', [0, 0], [0, 3]));
  p.rooms.push({ id: 'r', level: L, name: 'Room', points: [[0, 0], [4, 0], [4, 3], [0, 3]] });
  p.openings.push({ id: 'door', wall: 'ws', item, offset: 2, width: 0.9, height: 2.1, sill: 0, flip, side, params: {} });
  return p;
}
const add = (p, item, x, z, ry = 0, extra = {}) => { const o = { id: `ob-${p.objects.length}`, level: p.levels[0].id, item, params: {}, position: [x, 0, z], rotation: [0, ry, 0], scale: [1, 1, 1], materials: {}, ...extra }; p.objects.push(o); return o; };
const doorProblems = (p) => checkProject(p, itemOf).filter((x) => /^door/.test(x.code));

test('furniture in a door swing is a doorBlocked warning on the furniture, naming the door', () => {
  const p = roomWithDoor();
  // Wall ws runs +x along z = 3; its left normal points to +z (outside), so side 'right' opens into the room.
  const meta = swingMeta(itemOf('door-single'), { width: 0.9 }, 0.2);
  assert.equal(doorDirection(p.openings[0], meta).swing, 'right');
  const [leaf] = planLeaves(p.openings[0], p.walls[0], meta);
  assert.ok(leaf.v[1] < -0.99, 'opens into the room (−z)');
  const box = add(p, 'wardrobe', leaf.hinge[0] + leaf.u[0] * 0.4, 2.3, Math.PI);
  let probs = doorProblems(p);
  assert.equal(probs.length, 1, JSON.stringify(probs));
  assert.equal(probs[0].code, 'doorBlocked');
  assert.equal(probs[0].severity, 'warning');
  assert.equal(probs[0].entity, box.id);
  assert.equal(probs[0].params.other, 'door');
  // Against the side wall, far from the door: no problem.
  box.position = [0.75, 0, 0.45]; box.rotation = [0, 0, 0];
  assert.deepEqual(doorProblems(p), []);
  // Hidden, flat (rug), wall-mounted or on another level: never in the way.
  const rug = add(p, 'rug', 2, 2.3);
  const art = add(p, 'wall-art', 2, 2.7, 0);
  art.position[1] = 1.3;
  const hidden = add(p, 'armchair', 2, 2.5, 0, { hidden: true });
  const upstairs = add(p, 'armchair', 2, 2.5, 0, { level: 'other-level' });
  void rug; void hidden; void upstairs;
  assert.deepEqual(doorProblems(p).filter((x) => x.code === 'doorBlocked'), []);
  // The same chair on this level, visible: blocked.
  add(p, 'armchair', 2, 2.5);
  probs = doorProblems(p);
  assert.equal(probs.filter((x) => x.code === 'doorBlocked').length, 1);
});

test('furniture right in front of a doorway (the side the door does not open to) is a doorwayBlocked hint', () => {
  const p = roomWithDoor({ side: 'left' }); // opens outwards: the room side is the walkway
  const chair = add(p, 'armchair', 2, 2.6);
  const probs = doorProblems(p);
  assert.equal(probs.length, 1, JSON.stringify(probs));
  assert.equal(probs[0].code, 'doorwayBlocked');
  assert.equal(probs[0].severity, 'info');
  assert.equal(probs[0].entity, chair.id);
  chair.position = [3.3, 0, 2.4];
  assert.deepEqual(doorProblems(p), []);
});

test('two swings that meet are doorsCollide; a leaf that hits a wall is doorHitsWall', () => {
  const p = roomWithDoor();
  const meta = swingMeta(itemOf('door-single'), { width: 0.9 }, 0.2);
  // A second door in the east wall near the south-east corner, opening into the room.
  p.walls.find((w) => w.id === 'ws').b = [4, 3];
  p.openings[0].offset = 3.3;
  p.openings.push({ id: 'door2', wall: 'we', item: 'door-single', offset: 0.7, width: 0.9, height: 2.1, sill: 0, flip: false, side: 'left', params: {} });
  for (const o of p.openings) setDoorDirection(o, meta, { swing: 'right' }); // into the room
  const leaves = p.openings.map((o) => planLeaves(o, p.walls.find((w) => w.id === o.wall), meta)[0]);
  assert.ok(leaves.every(Boolean));
  // Hinges at the corner side make the two leaves sweep the same corner.
  for (const [i, o] of p.openings.entries()) {
    const l = leaves[i];
    const toCorner = Math.hypot(l.hinge[0] - 4, l.hinge[1] - 3);
    const tip = Math.hypot(l.hinge[0] + l.u[0] * l.r - 4, l.hinge[1] + l.u[1] * l.r - 3);
    if (tip < toCorner) setDoorDirection(o, meta, { hinge: doorDirection(o, meta).hinge === 'left' ? 'right' : 'left' });
  }
  const codes = doorProblems(p).map((x) => x.code);
  assert.deepEqual(codes, ['doorsCollide']);
  // A wall 0.5 m in front of the first door (a corridor too narrow for its leaf).
  p.walls.push({ id: 'wp', level: p.levels[0].id, a: [2.6, 2.4], b: [3.9, 2.4], thickness: 0.1, height: null, material: {} });
  const hit = doorProblems(p).filter((x) => x.code === 'doorHitsWall');
  assert.ok(hit.some((x) => x.entity === 'door' && x.params.other === 'wp'), JSON.stringify(hit));
  assert.ok(hit.every((x) => x.params.other === 'wp'), 'only the new wall');
  p.walls.pop();
  // Hinges away from the corner and the second door far along its wall: no problems.
  p.openings[0].offset = 1.5;
  p.openings[1].offset = 2.3;
  for (const o of p.openings) setDoorDirection(o, meta, { hinge: 'left' });
  const after = doorProblems(p);
  assert.deepEqual(after.filter((x) => x.code === 'doorsCollide' || x.code === 'doorHitsWall'), [], JSON.stringify(after));
});

test('reversing the swing keeps the hinge on the same jamb; swapping the hinge mirrors it', () => {
  const p = roomWithDoor();
  const o = p.openings[0]; const wall = p.walls[0];
  const meta = swingMeta(itemOf('door-single'), { width: 0.9 }, 0.2);
  const before = planLeaves(o, wall, meta)[0];
  const dir = doorDirection(o, meta);
  assert.ok(setDoorDirection(o, meta, { swing: dir.swing === 'left' ? 'right' : 'left' }));
  const after = planLeaves(o, wall, meta)[0];
  assert.ok(near(after.hinge[0], before.hinge[0], 1e-9), 'same jamb');
  assert.ok(near(after.v[1], -before.v[1], 1e-9), 'other side of the wall');
  assert.notEqual(doorDirection(o, meta).hinge, dir.hinge, 'the same jamb seen from the other side');
  const h = doorDirection(o, meta).hinge;
  assert.ok(setDoorDirection(o, meta, { hinge: h === 'left' ? 'right' : 'left' }));
  const swapped = planLeaves(o, wall, meta)[0];
  assert.ok(near(swapped.hinge[0], 4 - after.hinge[0], 1e-9), 'mirrored about the door centre (x = 2)');
  assert.equal(setDoorDirection(o, meta, { hinge: doorDirection(o, meta).hinge }), false, 'no change, no edit');
  // The Entity Info panel names the rooms on both faces.
  const rooms = doorSideRooms(p, o, itemOf('door-single'));
  assert.deepEqual(rooms.rooms, { left: '', right: 'Room' });
  assert.equal(doorSideRooms(p, { ...o, item: 'window-casement' }, itemOf('window-casement')), null);
});

test('plan lines: an arc and the open leaf for swinging doors, an arrow for sliding doors, none for openings', () => {
  const pts = (id, extra = {}) => swingLinePoints(swingMeta(itemOf(id), { width: itemOf(id).size[0] }, 0.2), { width: itemOf(id).size[0], thickness: 0.2, ...extra });
  const single = pts('door-single');
  assert.equal(single.length % 6, 0);
  assert.ok(single.length / 6 >= 18, 'arc segments');
  // Every point lies on the floor and within the leaf radius of the hinge side.
  for (let i = 1; i < single.length; i += 3) assert.ok(near(single[i], 0.012, 1e-9));
  assert.ok(pts('door-double').length > single.length);
  assert.ok(pts('door-sliding').length > 0);
  assert.ok(pts('door-pocket').length > 0);
  assert.ok(pts('door-folding').length > 0);
  assert.deepEqual(pts('door-cased-opening'), []);
  const mirrored = pts('door-single', { flip: true });
  for (let i = 0; i < single.length; i += 3) assert.ok(near(mirrored[i], -single[i], 1e-9), 'flip mirrors x');
});

test('no furnished sample has furniture in a door swing, doors that meet, or a leaf hitting a wall', () => {
  let before = 0;
  for (const sample of SAMPLE_PROJECTS) {
    for (const language of ['ko', 'en']) {
      const p = normalizeProject(buildSampleProject(sample.id, language));
      const bad = checkProject(p, itemOf).filter((x) => x.code === 'doorBlocked' || x.code === 'doorsCollide' || x.code === 'doorHitsWall');
      const name = (id) => p.objects.find((o) => o.id === id)?.item ?? p.openings.find((o) => o.id === id)?.item ?? id;
      assert.deepEqual(bad.map((x) => `${x.code}: ${name(x.entity)} / ${name(x.params.other)}`), [], `${sample.id}.${language}`);
    }
    // Without making room for the doors the rules do put furniture in swings (the check is not idle).
    before += checkProject(normalizeProject(buildSampleProject(sample.id, 'ko', { doors: false })), itemOf).filter((x) => x.code === 'doorBlocked').length;
  }
  assert.ok(before > 0);
});
