// Turning things in every direction: the free view rotation (screen axes, no clamp — a model can be laid down
// and turned over), roll, turning about an edge or an axis, the axis of a straight or circular edge, and the
// Move/Copy Body rotation about X, Y and Z through a centre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { freeOrbitStep, orbitStep, rollStep, orbitAboutAxis, edgeAxis, rotateVector, ORBIT_SPEED } from '../../src/view/orbit.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, STD_PLANES } from '../../src/cad/features.js';
import { newPart, sketchOn, top } from '../fixtures/feature-fixtures.js';
import { addRectangle } from '../../src/cad/sketch.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a, b, tol = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const angleOf = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (Math.hypot(...a) * Math.hypot(...b)))));

function wellFormed({ dir, up }, msg) {
  assert.ok(Math.abs(Math.hypot(...dir) - 1) < 1e-9, `${msg}: |dir|`);
  assert.ok(Math.abs(Math.hypot(...up) - 1) < 1e-9, `${msg}: |up|`);
  assert.ok(Math.abs(dot(dir, up)) < 1e-9, `${msg}: up ⊥ dir`);
}

// A drag of `rad` radians up/down is rad / ORBIT_SPEED pixels.
const px = (rad) => rad / ORBIT_SPEED;
const FRONT = { dir: [0, -1, 0], up: [0, 0, 1] }; // looking at the front (eye at −Y), Z up

test('free rotation goes over the top: dragging down by 180° turns the model upside down (the turntable stops short)', () => {
  let cam = FRONT;
  for (let i = 0; i < 180; i++) { cam = freeOrbitStep(cam.dir, cam.up, 0, px(Math.PI / 180)); wellFormed(cam, `step ${i}`); }
  // Over the top to the back, upside down: the eye is at +Y and the screen's up is −Z.
  assert.ok(near(cam.dir, [0, 1, 0], 1e-6), `dir ${cam.dir}`);
  assert.ok(near(cam.up, [0, 0, -1], 1e-6), `up ${cam.up}`);
  // Halfway: looking straight down with the model's front at the bottom of the screen (a model laid on its back).
  const half = freeOrbitStep(FRONT.dir, FRONT.up, 0, px(Math.PI / 2));
  assert.ok(near(half.dir, [0, 0, 1], 1e-9) && near(half.up, [0, 1, 0], 1e-9), JSON.stringify(half));
  // The turntable cannot pass the pole.
  let tt = FRONT;
  for (let i = 0; i < 180; i++) tt = orbitStep(tt.dir, tt.up, 0, px(Math.PI / 180));
  assert.ok(tt.up[2] >= 0 && tt.dir[2] < 1, 'turntable stays upright');
});

test('free rotation sideways from a laid-down view turns about the screen vertical, not about world Z', () => {
  // Looking down with Y up on screen (top view): a sideways drag of 90° turns about screen up (= world Y).
  const topView = { dir: [0, 0, 1], up: [0, 1, 0] };
  const r = freeOrbitStep(topView.dir, topView.up, px(Math.PI / 2), 0);
  assert.ok(near(r.up, [0, 1, 0], 1e-9), `up stays ${r.up}`);
  assert.ok(Math.abs(Math.abs(r.dir[0]) - 1) < 1e-9, `the eye swings to ±X: ${r.dir}`);
});

test('for small drags from an upright view free rotation moves like the turntable', () => {
  const start = { dir: [Math.SQRT1_2, -Math.SQRT1_2, 0], up: [0, 0, 1] };
  for (const [dx, dy] of [[1, 0], [0, 1], [-2, 1], [1, -2]]) {
    const a = freeOrbitStep(start.dir, start.up, dx, dy); const b = orbitStep(start.dir, start.up, dx, dy);
    assert.ok(near(a.dir, b.dir, 1e-4), `dir after (${dx}, ${dy})`);
  }
});

test('ten thousand random free drags keep the camera orthonormal (no drift)', () => {
  let seed = 7; const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let cam = FRONT;
  for (let i = 0; i < 10000; i++) {
    cam = freeOrbitStep(cam.dir, cam.up, (rand() - 0.5) * 600, (rand() - 0.5) * 600);
    if (i % 7 === 0) cam = rollStep(cam.dir, cam.up, (rand() - 0.5) * 2);
    wellFormed(cam, `step ${i}`);
  }
});

test('roll turns the screen up about the line of sight by the angle, keeping the view direction', () => {
  for (const deg of [15, 90, -40, 180]) {
    const r = rollStep(FRONT.dir, FRONT.up, (deg * Math.PI) / 180);
    assert.ok(near(r.dir, FRONT.dir), 'dir kept');
    assert.ok(Math.abs(angleOf(r.up, FRONT.up) - Math.abs(deg * Math.PI / 180)) < 1e-9, `rolled ${deg}°`);
    wellFormed(r, `roll ${deg}`);
  }
  // Positive roll turns the model anticlockwise on screen: the camera's up turns clockwise, toward the screen right.
  const r = rollStep(FRONT.dir, FRONT.up, 0.3);
  const right = cross(FRONT.up, FRONT.dir);
  assert.ok(dot(r.up, right) > 0, 'up leans to the right');
});

test('turning about an axis keeps the axis fixed and the target at the same distance from it', () => {
  const cam = { dir: [0, -1, 0], up: [0, 0, 1], target: [50, 0, 10] };
  const point = [0, 0, 0]; const axis = [1, 0, 0];
  const r = orbitAboutAxis(cam, point, axis, Math.PI / 2);
  // About X by +90°: the eye at −Y swings to +Z… applied to the camera (so the model appears turned by −90°).
  assert.ok(near(r.dir, rotateVector(cam.dir, axis, Math.PI / 2), 1e-12));
  assert.ok(near(r.target, [50, -10, 0], 1e-9), `target ${r.target}`);
  wellFormed(r, 'about X');
  // A full turn comes back.
  let c = cam; for (let i = 0; i < 8; i++) c = orbitAboutAxis(c, [3, 4, 5], [1, 2, 3], Math.PI / 4);
  assert.ok(near(c.dir, cam.dir, 1e-9) && near(c.up, cam.up, 1e-9) && near(c.target, cam.target, 1e-9));
});

test('the axis of an edge: a straight edge is its own line; an arc or circle turns about its centre axis', () => {
  const line = edgeAxis([[1, 2, 3], [2, 2, 3], [5, 2, 3]]);
  assert.equal(line.kind, 'line');
  assert.ok(near(line.dir, [1, 0, 0]) && near(line.point, [1, 2, 3]));
  // An arc of radius 7 about (1, 2, 3) in the plane with normal (0, 1, 1)/√2.
  const n = [0, Math.SQRT1_2, Math.SQRT1_2]; const u = [1, 0, 0]; const v = cross(n, u);
  const arc = [];
  for (let i = 0; i <= 12; i++) { const a = (i / 12) * 2; arc.push([0, 1, 2].map((k) => [1, 2, 3][k] + 7 * (Math.cos(a) * u[k] + Math.sin(a) * v[k]))); }
  const c = edgeAxis(arc);
  assert.equal(c.kind, 'circle');
  assert.ok(near(c.point, [1, 2, 3], 1e-9), `centre ${c.point}`);
  assert.ok(Math.abs(c.radius - 7) < 1e-9);
  assert.ok(Math.abs(Math.abs(dot(c.dir, n)) - 1) < 1e-12, `axis ${c.dir}`);
  // Degenerate input gives nothing.
  assert.equal(edgeAxis([[1, 1, 1], [1, 1, 1]]), null);
});

test('settings: the rotation mode and the arrow key step are kept, wrong values fall back', () => {
  assert.equal(normalizeSettings({}).orbitMode, 'free');
  assert.equal(normalizeSettings({ orbitMode: 'turntable' }).orbitMode, 'turntable');
  assert.equal(normalizeSettings({ orbitMode: 'sideways' }).orbitMode, 'free');
  assert.equal(normalizeSettings({}).arrowStep, 15);
  assert.equal(normalizeSettings({ arrowStep: 45 }).arrowStep, 45);
  assert.equal(normalizeSettings({ arrowStep: 400 }).arrowStep, 90);
});

await loadKernel();
const R = rep();

/** A 10 × 20 × 30 block from the origin (X 10, Y 20, Z 30), then Move/Copy Body with `o`. */
function movedBlock(o) {
  const p = newPart();
  const s = sketchOn(p, top, (k) => addRectangle(k, 0, 0, 10, 20));
  p.features.push(createFeature(p, 'extrude', { sketch: s.id, depth: 30 }));
  p.features.push(createFeature(p, 'moveBody', o));
  const body = regenerate(p).body;
  const [lo, hi] = body.boundingBox.bounds;
  return { lo, hi, size: hi.map((v, i) => Math.round((v - lo[i]) * 1e6) / 1e6), volume: R.measureVolume(body) };
}

test('Move/Copy Body turns about X, Y and Z: the 10 × 20 × 30 block is laid down on each side', () => {
  assert.deepEqual(movedBlock({}).size, [10, 20, 30]);
  assert.deepEqual(movedBlock({ rx: 90 }).size, [10, 30, 20]);
  assert.deepEqual(movedBlock({ ry: 90 }).size, [30, 20, 10]);
  assert.deepEqual(movedBlock({ rz: 90 }).size, [20, 10, 30]);
  assert.deepEqual(movedBlock({ rx: 90, ry: 90 }).size, [20, 30, 10]);
  // Turned over (180° about X): upside down below the XY plane, same size and volume.
  const over = movedBlock({ rx: 180 });
  assert.deepEqual(over.size, [10, 20, 30]);
  assert.ok(over.hi[2] <= 1e-6 && over.lo[2] >= -30 - 1e-6, `below the plane: ${over.lo} … ${over.hi}`);
  assert.ok(Math.abs(over.volume - 6000) < 1e-6);
});

test('Move/Copy Body: the rotation centre is the point that stays put', () => {
  // About Z through the block's centre (5, 10): the footprint swaps but stays centred there.
  const m = movedBlock({ rz: 90, cx: 5, cy: 10 });
  assert.ok(near(m.lo.slice(0, 2), [-5, 5], 1e-6) && near(m.hi.slice(0, 2), [15, 15], 1e-6), `${m.lo} … ${m.hi}`);
  // About X through (0, 0, 30) (the top edge): the block lies along +Y… above / below the top.
  const t = movedBlock({ rx: 90, cz: 30 });
  assert.deepEqual(t.size, [10, 30, 20]);
  assert.ok(Math.abs(t.hi[2] - 50) < 1e-6 || Math.abs(t.lo[2] - 30) < 1e-6, `${t.lo} … ${t.hi}`);
  // Copy keeps the original as well.
  assert.ok(Math.abs(movedBlock({ rx: 90, cz: 100, copy: true }).volume - 12000) < 1e-6);
});
