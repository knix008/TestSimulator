// A model built from a 2D plan is checked and corrected before it is shown (src/engine/repair.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairModel } from '../../src/engine/repair.js';
import { checkProject } from '../../src/engine/checks.js';
import { createProject } from '../../src/engine/document.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';

const CATALOG = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));
const itemOf = (id) => CATALOG.get(id) ?? null;
const codes = (p) => checkProject(p, itemOf).map((x) => x.code);

function room() {
  const p = createProject();
  const L = p.levels[0].id;
  p.walls.push(
    { id: 'w', level: L, a: [0, 0], b: [4, 0], thickness: 0.2, height: 2.7, material: {} },
    { id: 'n', level: L, a: [0, 4], b: [4, 4], thickness: 0.2, height: 2.7, material: {} },
  );
  p.rooms.push({ id: 'r', level: L, name: 'Room', points: [[-1, -1], [5, -1], [5, 4], [-1, 4]] });
  return p;
}
const obj = (id, item, position, extra = {}) => ({ id, level: 'L', item, position, rotation: [0, 0, 0], scale: [1, 1, 1], params: {}, ...extra });

test('repair puts a wall item on the wall, seats a floating object, and fits an opening', () => {
  const p = room();
  const L = p.levels[0].id;
  const mirror = { id: 'mirror', placement: 'wall', size: [0.6, 0.8, 0.05] };
  const vase = { id: 'vase', placement: 'floor', size: [0.2, 0.3, 0.2] };
  const table = { id: 'table', placement: 'floor', size: [1.2, 0.4, 0.6] };
  const local = (id) => ({ mirror, vase, table }[id] ?? null);
  p.objects.push(
    obj('m', 'mirror', [2, 1.2, 2.2], { level: L }),
    obj('v', 'vase', [2, 0.5, 2], { level: L }),
    obj('tb', 'table', [1, 0, 2], { level: L }),
    obj('on', 'vase', [1, 0.9, 2], { level: L }),
  );
  p.openings.push({ id: 'win', wall: 'w', item: 'window', offset: 0.2, width: 5, height: 3.2, sill: 0.9, flip: false, side: 'left', params: {} });
  p.walls.push({ id: 'crumb', level: L, a: [0, 2], b: [0.05, 2], thickness: 0.12, height: 2.7, material: {} });
  const before = checkProject(p, local).map((x) => x.code).sort();
  assert.ok(before.includes('offWall'));
  assert.ok(before.includes('unsupported'));
  assert.ok(before.includes('openingTooWide') || before.includes('openingOutside') || before.includes('openingTooTall'));
  assert.ok(before.includes('wallShort'));
  const repair = repairModel(p, local);
  const after = checkProject(p, local).map((x) => x.code);
  assert.equal(after.filter((c) => c === 'offWall' || c === 'unsupported' || c === 'openingTooWide' || c === 'openingOutside' || c === 'openingTooTall' || c === 'wallShort').length, 0, after.join(','));
  assert.ok(repair.fixed >= 4);
  assert.equal(p.objects.find((o) => o.id === 'v').position[1], 0);
  assert.ok(Math.abs(p.objects.find((o) => o.id === 'on').position[1] - 0.4) < 0.02);
  assert.ok(!p.walls.some((w) => w.id === 'crumb'));
});

test('a wall item already on the wall is left where it is', () => {
  const p = room();
  const L = p.levels[0].id;
  const mirror = { id: 'mirror', placement: 'wall', size: [0.6, 0.8, 0.05] };
  p.objects.push(obj('m', 'mirror', [2, 1.2, 0.127], { level: L }));
  const repair = repairModel(p, (id) => (id === 'mirror' ? mirror : null));
  assert.equal(repair.fixed, 0);
  assert.ok(Math.abs(p.objects[0].position[2] - 0.127) < 0.01);
  assert.equal(codes(p).includes('offWall'), false);
});

test('furniture standing in a door swing is moved or the door is turned, so the leaf can open', () => {
  const p = createProject();
  const L = p.levels[0].id;
  const W = (id, a, b) => ({ id, level: L, a, b, thickness: 0.2, height: null, material: {} });
  p.walls.push(W('ws', [0, 3], [4, 3]), W('we', [4, 3], [4, 0]), W('wn', [4, 0], [0, 0]), W('ww', [0, 0], [0, 3]));
  p.rooms.push({ id: 'r', level: L, name: 'Room', points: [[0, 0], [4, 0], [4, 3], [0, 3]] });
  p.openings.push({ id: 'door', wall: 'ws', item: 'door-single', offset: 2, width: 0.9, height: 2.1, sill: 0, flip: false, side: 'right', params: {} });
  p.objects.push({ id: 'box', level: L, item: 'wardrobe', params: {}, position: [2, 0, 2.3], rotation: [0, Math.PI, 0], scale: [1, 1, 1], materials: {} });
  assert.ok(codes(p).includes('doorBlocked'));
  repairModel(p, itemOf);
  assert.equal(codes(p).filter((c) => c === 'doorBlocked' || c === 'doorHitsWall' || c === 'doorsCollide').length, 0, codes(p).join(','));
});
