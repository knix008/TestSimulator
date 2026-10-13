import assert from 'node:assert/strict';
import test from 'node:test';
import { createEntity } from '../../src/domain/entities.js';
import { applyOrtho, findSnap, parseCoordinate, snapToGrid } from '../../src/domain/snap.js';

const ALL = { endpoint: true, midpoint: true, center: true, quadrant: true, intersection: true, nearest: true };
const line = (x1, y1, x2, y2) => createEntity('line', { x1, y1, x2, y2 });

test('end, middle, centre and quadrant snaps', () => {
  const entities = [line(0, 0, 100, 0), createEntity('circle', { cx: 50, cy: 50, r: 20 })];
  assert.deepEqual(findSnap(entities, { x: 99, y: 1 }, 3, ALL), { kind: 'endpoint', x: 100, y: 0 });
  assert.deepEqual(findSnap(entities, { x: 51, y: 0.5 }, 3, ALL), { kind: 'midpoint', x: 50, y: 0 });
  assert.equal(findSnap(entities, { x: 51, y: 51 }, 3, ALL).kind, 'center');
  const quadrant = findSnap(entities, { x: 70.5, y: 50.5 }, 3, ALL);
  assert.equal(quadrant.kind, 'quadrant');
  assert.equal(quadrant.x, 70);
  assert.equal(findSnap(entities, { x: 300, y: 300 }, 3, ALL), null);
});

test('intersections of lines, circles and arcs', () => {
  const cross = [line(-10, 0, 10, 0), line(0, -10, 0, 10)];
  assert.deepEqual(findSnap(cross, { x: 0.4, y: 0.3 }, 2, { intersection: true }), { kind: 'intersection', x: 0, y: 0 });
  const lineCircle = [line(-20, 0, 20, 0), createEntity('circle', { cx: 0, cy: 0, r: 10 })];
  const hit = findSnap(lineCircle, { x: 10.3, y: 0.2 }, 2, { intersection: true });
  assert.equal(hit.kind, 'intersection');
  assert.ok(Math.abs(hit.x - 10) < 1e-9);
  // An arc only snaps where it actually is.
  const arc = [line(-20, 0, 20, 0), createEntity('arc', { cx: 0, cy: 0, r: 10, start: 0, end: 90 })];
  assert.equal(findSnap(arc, { x: -10, y: 0.2 }, 2, { intersection: true }), null);
});

test('nearest point on a line when nothing better is close', () => {
  const snap = findSnap([line(0, 0, 100, 0)], { x: 30, y: 1 }, 2, { nearest: true, endpoint: true });
  assert.deepEqual(snap, { kind: 'nearest', x: 30, y: 0 });
});

test('disabled snap kinds, excluded and dimension entities are ignored', () => {
  const entities = [line(0, 0, 100, 0)];
  assert.equal(findSnap(entities, { x: 99, y: 1 }, 3, { midpoint: true }), null);
  assert.equal(findSnap(entities, { x: 99, y: 1 }, 3, ALL, { exclude: new Set([entities[0].id]) }), null);
  const dim = createEntity('dim', { kind: 'aligned', x1: 0, y1: 0, x2: 100, y2: 0, ox: 50, oy: 10 });
  assert.equal(findSnap([dim], { x: 99, y: 1 }, 3, ALL), null);
});

test('part centres and polygon centres snap', () => {
  const gear = createEntity('part', { kind: 'gear', x: 40, y: 40 });
  assert.equal(findSnap([gear], { x: 40.5, y: 40.5 }, 2, { center: true }).kind, 'center');
});

test('grid snap and ortho', () => {
  assert.deepEqual(snapToGrid({ x: 12.4, y: -7.6 }, 5), { x: 10, y: -10 });
  assert.deepEqual(applyOrtho({ x: 0, y: 0 }, { x: 10, y: 3 }), { x: 10, y: 0 });
  assert.deepEqual(applyOrtho({ x: 0, y: 0 }, { x: 2, y: -9 }), { x: 0, y: -9 });
});

test('typed coordinates: absolute, relative, polar and distance along the cursor', () => {
  const last = { x: 10, y: 10 };
  assert.deepEqual(parseCoordinate('100,50', last), { x: 100, y: 50 });
  assert.deepEqual(parseCoordinate(' @30 , -10 ', last), { x: 40, y: 0 });
  const polar = parseCoordinate('@10<90', last);
  assert.ok(Math.abs(polar.x - 10) < 1e-9 && Math.abs(polar.y - 20) < 1e-9);
  const along = parseCoordinate('5', last, { x: 10, y: 100 });
  assert.ok(Math.abs(along.y - 15) < 1e-9);
  assert.equal(parseCoordinate('5', null), null, 'a distance needs a previous point');
  assert.equal(parseCoordinate('abc', last), null);
  assert.deepEqual(parseCoordinate('-1.5,2e1', null), { x: -1.5, y: 20 });
});
