// While an item is being placed, the physical problems of that spot are named before the click.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placementProblems } from '../../src/engine/checks.js';
import { createProject } from '../../src/engine/document.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';

const CATALOG = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));
const itemOf = (id) => CATALOG.get(id) ?? null;
const codes = (list) => list.map((p) => p.code);

function room() {
  const p = createProject();
  const L = p.levels[0].id;
  p.walls.push(
    { id: 'ws', level: L, a: [0, 3], b: [4, 3], thickness: 0.2, height: 2.7, material: {} },
    { id: 'we', level: L, a: [4, 3], b: [4, 0], thickness: 0.2, height: 2.7, material: {} },
    { id: 'wn', level: L, a: [4, 0], b: [0, 0], thickness: 0.2, height: 2.7, material: {} },
    { id: 'ww', level: L, a: [0, 0], b: [0, 3], thickness: 0.2, height: 2.7, material: {} },
  );
  p.rooms.push({ id: 'r', level: L, name: 'Room', points: [[0, 0], [4, 0], [4, 3], [0, 3]] });
  p.openings.push({ id: 'door', wall: 'ws', item: 'door-single', offset: 2, width: 0.9, height: 2.1, sill: 0, flip: false, side: 'right', params: {} });
  return p;
}

test('a spot in a door swing is reported while the furniture is still only a preview', () => {
  const p = room();
  const L = p.levels[0].id;
  const blocked = placementProblems(p, { kind: 'object', level: L, item: 'wardrobe', position: [2, 0, 2.3], rotation: [0, Math.PI, 0], scale: [1, 1, 1], params: {} }, itemOf);
  assert.ok(codes(blocked).includes('doorBlocked'), codes(blocked).join(','));
  const clear = placementProblems(p, { kind: 'object', level: L, item: 'wardrobe', position: [0.7, 0, 0.5], rotation: [0, 0, 0], scale: [1, 1, 1], params: {} }, itemOf);
  assert.equal(codes(clear).includes('doorBlocked'), false, codes(clear).join(','));
});

test('overlapping, floating and off-wall spots are named, and a vase on a table is not floating', () => {
  const p = room();
  const L = p.levels[0].id;
  const box = { id: 'box', placement: 'floor', size: [1, 0.8, 1] };
  const vase = { id: 'vase', placement: 'floor', size: [0.2, 0.3, 0.2] };
  const table = { id: 'table', placement: 'floor', size: [1.2, 0.4, 0.6] };
  const mirror = { id: 'mirror', placement: 'wall', size: [0.6, 0.8, 0.05] };
  const local = (id) => ({ box, vase, table, mirror }[id] ?? null);
  p.objects.push({ id: 'tb', level: L, item: 'table', position: [1, 0, 1.5], rotation: [0, 0, 0], scale: [1, 1, 1], params: {} });
  const over = placementProblems(p, { kind: 'object', level: L, item: 'box', position: [1, 0, 1.5], rotation: [0, 0, 0], scale: [1, 1, 1], params: {} }, local);
  assert.ok(codes(over).includes('objectsOverlap'), codes(over).join(','));
  const air = placementProblems(p, { kind: 'object', level: L, item: 'vase', position: [3, 0.5, 1], rotation: [0, 0, 0], scale: [1, 1, 1], params: {} }, local);
  assert.ok(codes(air).includes('unsupported'));
  const onTable = placementProblems(p, { kind: 'object', level: L, item: 'vase', position: [1, 0.4, 1.5], rotation: [0, 0, 0], scale: [1, 1, 1], params: {} }, local);
  assert.equal(codes(onTable).includes('unsupported'), false);
  const loose = placementProblems(p, { kind: 'object', level: L, item: 'mirror', position: [2, 1.2, 1.5], rotation: [0, 0, 0], scale: [1, 1, 1], params: {} }, local);
  assert.ok(codes(loose).includes('offWall'));
});

test('a door preview that is wider than its wall, or that opens into furniture, says so', () => {
  const p = room();
  const wide = placementProblems(p, { kind: 'opening', wall: 'wn', item: 'window-casement', offset: 2, width: 6, height: 1.2, sill: 0.9, side: 'left', flip: false, params: {} }, itemOf);
  assert.ok(codes(wide).includes('openingTooWide'), codes(wide).join(','));
  p.objects.push({ id: 'box', level: p.levels[0].id, item: 'wardrobe', position: [2, 0, 2.3], rotation: [0, Math.PI, 0], scale: [1, 1, 1], params: {} });
  const into = placementProblems(p, { kind: 'opening', wall: 'ws', item: 'door-single', offset: 2, width: 0.9, height: 2.1, sill: 0, side: 'right', flip: false, params: {} }, itemOf);
  assert.ok(codes(into).includes('swingBlocked') || codes(into).includes('openingsOverlap'), codes(into).join(','));
});
