import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkStep, walkAxes } from '../../src/app-walk.js';

// A world of a floor at z = 0 and a wall at x = 1000 (rays only along the axes, as the walker casts them).
const world = (extra = []) => (o, d, far) => {
  let best = Infinity;
  if (d[2] < 0 && o[2] >= 0) best = Math.min(best, o[2]);
  if (d[0] > 0 && o[0] <= 1000) best = Math.min(best, 1000 - o[0]);
  for (const f of extra) best = Math.min(best, f(o, d));
  return best <= far ? best : Infinity;
};

test('walkAxes: yaw 0 looks along +X, right is −Y', () => {
  const { f, level, right } = walkAxes(0, 0);
  assert.deepEqual(f.map((v) => Math.round(v)), [1, 0, 0]);
  assert.deepEqual(level, [1, 0, 0]);
  assert.deepEqual(right.map((v) => Math.round(v) + 0), [0, -1, 0]);
});

test('walkStep: walking forward at the speed for the time', () => {
  const s = { eye: [0, 0, 1600], yaw: 0, pitch: 0, speed: 1000, eyeHeight: 1600, gravity: true, collide: true };
  walkStep(s, { forward: true }, 0.25, world());
  assert.ok(Math.abs(s.eye[0] - 250) < 1e-9);
  assert.equal(s.eye[2], 1600);
});

test('walkStep: Shift runs three times as fast; strafing goes right', () => {
  const s = { eye: [0, 0, 1600], yaw: 0, pitch: 0, speed: 100, eyeHeight: 1600, gravity: true, collide: false };
  walkStep(s, { forward: true, run: true }, 1, world());
  assert.ok(Math.abs(s.eye[0] - 300) < 1e-9);
  walkStep(s, { right: true }, 1, world());
  assert.ok(Math.abs(s.eye[1] + 100) < 1e-9);
});

test('walkStep: collision stops short of the wall by the radius; without it the walker passes', () => {
  const s = { eye: [800, 0, 1600], yaw: 0, pitch: 0, speed: 1000, eyeHeight: 1600, gravity: true, collide: true, radius: 100 };
  for (let i = 0; i < 20; i++) walkStep(s, { forward: true }, 0.05, world());
  assert.ok(s.eye[0] <= 900 && s.eye[0] > 800, String(s.eye[0]));
  s.collide = false;
  for (let i = 0; i < 20; i++) walkStep(s, { forward: true }, 0.05, world());
  assert.ok(s.eye[0] > 1000);
});

test('walkStep: a diagonal into the wall slides along it', () => {
  const s = { eye: [880, 0, 1600], yaw: Math.PI / 4, pitch: 0, speed: 1000, eyeHeight: 1600, gravity: true, collide: true, radius: 100 };
  walkStep(s, { forward: true }, 0.1, world());
  assert.ok(Math.abs(s.eye[0] - 880) < 1e-9);
  assert.ok(s.eye[1] > 70);
});

test('walkStep: gravity lands at the eye height; a low step is climbed, a high one is not', () => {
  const s = { eye: [0, 0, 3000], yaw: 0, pitch: 0, speed: 1000, eyeHeight: 1600, gravity: true, collide: true };
  for (let i = 0; i < 100; i++) walkStep(s, {}, 0.05, world());
  assert.ok(Math.abs(s.eye[2] - 1600) < 1e-9);
  // A 300 mm box from x 100 on: under 40 % of the eye height, so stepped onto.
  const box = (top) => (o, d) => (d[2] < 0 && o[0] >= 100 && o[2] >= top ? o[2] - top : Infinity);
  walkStep(s, { forward: true }, 0.2, world([box(300)]));
  assert.ok(Math.abs(s.eye[2] - 1900) < 1e-9);
  // An 800 mm one stays under the feet's ray start: the floor reads as the ground.
  const t = { eye: [0, 0, 1600], yaw: 0, pitch: 0, speed: 1000, eyeHeight: 1600, gravity: true, collide: false };
  walkStep(t, { forward: true }, 0.2, world([box(800)]));
  assert.ok(Math.abs(t.eye[2] - 1600) < 1e-9);
});

test('walkStep: flying (no gravity) follows the pitch and Q/E', () => {
  const s = { eye: [0, 0, 0], yaw: 0, pitch: Math.PI / 2 - 1e-9, speed: 100, eyeHeight: 1600, gravity: false, collide: false };
  walkStep(s, { forward: true }, 1, world());
  assert.ok(Math.abs(s.eye[2] - 100) < 1e-6);
  walkStep(s, { down: true }, 1, world());
  assert.ok(Math.abs(s.eye[2]) < 1e-6);
});
