// Draft working plane: typed coordinates, grid snap and ortho in the plane's terms.
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDrawing } from '../../src/domain/drawing.js';
import { applyOrtho, parseCoordinate, snapToGrid } from '../../src/domain/snap.js';
import { fromPlane, normalizeWorkPlane, planeFrom, toPlane } from '../../src/domain/workplane.js';

const near = (p, q) => assert.ok(Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9, `${JSON.stringify(p)} ≠ ${JSON.stringify(q)}`);
const wp = { x: 100, y: 50, angle: 90, z: 0 };

test('points go to and from a working plane', () => {
  near(fromPlane({ x: 10, y: 0 }, wp), { x: 100, y: 60 });
  near(toPlane({ x: 100, y: 60 }, wp), { x: 10, y: 0 });
  near(toPlane(fromPlane({ x: 3, y: -7 }, wp), wp), { x: 3, y: -7 });
  assert.equal(normalizeWorkPlane({ x: 0, y: 0, angle: 360, z: 0 }), null, 'the global plane is no plane');
  assert.deepEqual(planeFrom({ x: 1, y: 1 }, { x: 1, y: 5 }, 30), { x: 1, y: 1, angle: 90, z: 30 });
  assert.deepEqual(normalizeDrawing({ workPlane: { x: 5, angle: 45 } }).workPlane, { x: 5, y: 0, angle: 45, z: 0 });
  assert.equal(normalizeDrawing({}).workPlane, undefined);
});

test('typed coordinates are in the plane: absolute, relative, polar', () => {
  near(parseCoordinate('10,0', null, null, 'mm', wp), { x: 100, y: 60 });
  near(parseCoordinate('@10,0', { x: 0, y: 0 }, null, 'mm', wp), { x: 0, y: 10 });
  near(parseCoordinate('@10<0', { x: 0, y: 0 }, null, 'mm', wp), { x: 0, y: 10 });
  // Without a plane nothing changes.
  near(parseCoordinate('10,0', null, null, 'mm'), { x: 10, y: 0 });
});

test('grid snap and ortho follow the plane', () => {
  const turned = { x: 0, y: 0, angle: 45, z: 0 };
  const p = snapToGrid({ x: 7.2, y: 6.9 }, 10, turned);
  near(toPlane(p, turned), { x: 10, y: 0 });
  // Ortho along the plane's X axis (45°).
  const q = applyOrtho({ x: 0, y: 0 }, { x: 10, y: 9 }, turned);
  assert.ok(Math.abs(q.x - q.y) < 1e-9);
  near(snapToGrid({ x: 7.2, y: 6.9 }, 10), { x: 10, y: 10 });
});
