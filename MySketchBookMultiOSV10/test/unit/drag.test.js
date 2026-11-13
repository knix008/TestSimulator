// Dragging furniture with the mouse (src/tools/drag.js): which surface a dragged selection follows and where the
// pointer lands on it — floor items on the floor under them (not at the grab height), wall items on their wall
// (along it and up/down), straight up and down with the vertical lock, the 2D plan always on the floor, and no
// kilometre jumps near the horizon. A stand-in app with a real three.js camera; screenToWorldOnPlane casts the ray.
// Run: node --test test/unit/drag.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { dragPointer, dragSurface } from '../../src/tools/drag.js';

function makeApp({ objects, boxes = {}, planMode = false, eye = [4, 3, 6], target = [0, 0.5, 0] } = {}) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(...eye);
  camera.lookAt(...target);
  camera.updateMatrixWorld();
  const W = 800, H = 800;
  return {
    project: () => ({ objects }),
    builder: { worldBox: (id) => boxes[id] ?? null },
    viewport: {
      planMode, camera,
      /** Screen point (pixels in a W×H view) → ray → plane. */
      screenToWorldOnPlane(x, y, point, normal) {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1), camera);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
        const out = new THREE.Vector3();
        return ray.ray.intersectPlane(plane, out) ? out : null;
      },
      toScreen(p) { const v = p.clone().project(camera); return { clientX: ((v.x + 1) / 2) * W, clientY: ((1 - v.y) / 2) * H }; },
    },
  };
}
const items = { clock: { placement: 'wall' }, desk: { placement: 'floor' } };
const itemOf = (id) => items[id];

test('a floor item follows the floor under it, whatever the grab height', () => {
  const box = new THREE.Box3(new THREE.Vector3(-0.6, 0, -0.4), new THREE.Vector3(0.6, 0.75, 0.4));
  const app = makeApp({ objects: [{ id: 'a', item: 'desk', rotation: [0, 0, 0] }], boxes: { a: box } });
  const grab = new THREE.Vector3(0, 0.75, 0); // the desk top
  const s = dragSurface(app, ['a'], grab, null, itemOf);
  assert.equal(s.mode, 'floor');
  assert.equal(s.point.y, 0, 'the plane is the floor under the desk, not the top');
  assert.deepEqual(s.normal.toArray(), [0, 1, 0]);
  // Dragging the pointer from the desk's foot to a point 1 m further on the floor moves it by that 1 m.
  const from = dragPointer(app, app.viewport.toScreen(new THREE.Vector3(0, 0, 0)), s);
  const to = dragPointer(app, app.viewport.toScreen(new THREE.Vector3(0, 0, -1)), s);
  assert.ok(Math.abs(to.z - from.z + 1) < 1e-6 && Math.abs(to.x - from.x) < 1e-6 && Math.abs(to.y) < 1e-9, `moved ${to.clone().sub(from).toArray()}`);
});

test('a wall item slides on its wall: along it and up and down, never off it', () => {
  // A clock on a wall facing +x (rotated 90°): its wall is the plane x = 2.
  const app = makeApp({ objects: [{ id: 'c', item: 'clock', rotation: [0, Math.PI / 2, 0] }] });
  const grab = new THREE.Vector3(2, 1.9, 0);
  const s = dragSurface(app, ['c'], grab, null, itemOf);
  assert.equal(s.mode, 'wall');
  assert.ok(s.normal.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-9, `normal ${s.normal.toArray()}`);
  const up = dragPointer(app, app.viewport.toScreen(new THREE.Vector3(2, 2.4, 0.5)), s);
  assert.ok(Math.abs(up.x - 2) < 1e-6, 'stays on the wall');
  assert.ok(Math.abs(up.y - 2.4) < 1e-6 && Math.abs(up.z - 0.5) < 1e-6, `up and along: ${up.toArray()}`);
});

test('the vertical lock moves straight up and down; the 2D plan never does', () => {
  const app = makeApp({ objects: [{ id: 'a', item: 'desk', rotation: [0, 0, 0] }] });
  const start = new THREE.Vector3(0.3, 0, -0.2);
  const s = dragSurface(app, ['a'], start, 'vertical', itemOf);
  assert.equal(s.mode, 'vertical');
  assert.equal(s.normal.y, 0, 'an upright plane');
  const p = dragPointer(app, app.viewport.toScreen(new THREE.Vector3(0.3, 1.2, -0.2)), s);
  assert.deepEqual([p.x, p.z], [0.3, -0.2], 'x and z stay');
  assert.ok(Math.abs(p.y - 1.2) < 1e-6, `height ${p.y}`);
  const plan = makeApp({ objects: [{ id: 'c', item: 'clock', rotation: [0, 0, 0] }], planMode: true });
  assert.equal(dragSurface(plan, ['c'], start, 'vertical', itemOf).mode, 'floor');
  assert.equal(dragSurface(plan, ['c'], start, null, itemOf).mode, 'floor', 'wall items too');
});

test('several things together move on the floor; a pointer above the horizon gives nothing', () => {
  const app = makeApp({ objects: [{ id: 'c', item: 'clock', rotation: [0, 0, 0] }, { id: 'a', item: 'desk', rotation: [0, 0, 0] }] });
  const s = dragSurface(app, ['c', 'a'], new THREE.Vector3(0, 1, 0), null, itemOf);
  assert.equal(s.mode, 'floor', 'a wall item in a group of several moves with them on the floor');
  // Looking slightly down: a point high on the screen hits the floor far away (or not at all).
  const low = makeApp({ objects: [{ id: 'a', item: 'desk', rotation: [0, 0, 0] }], eye: [0, 1.2, 8], target: [0, 1.1, 0] });
  const f = dragSurface(low, ['a'], new THREE.Vector3(0, 0, 0), null, itemOf);
  assert.equal(dragPointer(low, { clientX: 400, clientY: 395 }, f), null, 'near the horizon: ignored, not a jump of hundreds of metres');
});
