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

test('a working plane on a face: the frame, solids padded on it stand on the face', async () => {
  const { frameOnFace, frameMatrix, normalizeWorkPlane } = await import('../../src/domain/workplane.js');
  const { composePose, placementOf, poseOf } = await import('../../src/domain/assembly.js');
  const { solidMesh } = await import('../../src/domain/solids.js');
  // The front face (normal −y) of a box at y = 0: x runs along the face, y up.
  const f = frameOnFace([10, 0, 5], [0, -1, 0]);
  assert.deepEqual(f.x, [1, 0, 0]); assert.deepEqual(f.y, [0, 0, 1]); assert.deepEqual(f.z, [0, -1, 0]);
  assert.deepEqual(normalizeWorkPlane({ frame: f }).frame, f);
  // A 20 × 10 pad 5 high drawn at (0, 0) on that plane: it grows out of the face (−y), its outline on the face.
  const pad = { type: 'solid', kind: 'box', params: { length: 20, width: 10, height: 5 } };
  const placed = { ...pad, ...placementOf(composePose(frameMatrix(f), poseOf(pad))) };
  const pts = solidMesh(placed).flat();
  const span = (k) => [Math.min(...pts.map((p) => p[k])), Math.max(...pts.map((p) => p[k]))];
  assert.deepEqual(span(0).map((v) => Math.round(v * 1e6) / 1e6), [10, 30]);
  assert.deepEqual(span(1).map((v) => Math.round(v * 1e6) / 1e6), [-5, 0]);
  assert.deepEqual(span(2).map((v) => Math.round(v * 1e6) / 1e6), [5, 15]);
  // A level face keeps the world's x.
  assert.deepEqual(frameOnFace([0, 0, 30], [0, 0, 1]).x, [1, 0, 0]);
});
