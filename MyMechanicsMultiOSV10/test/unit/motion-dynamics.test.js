// Motion studies: keyframe animation (placements at times, played in between) and motion analysis (rigid bodies
// with mass and inertia under gravity, springs and motors, mates as constraints) checked against the physics
// worked out by hand: a pendulum's speed at the bottom and its period, a spring–mass period, a motor's torque.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyframePose, captureKey, simulateDynamics, combineInertia, dynamicsPose, quatSlerp } from '../../src/cad/motion-dynamics.js';
import { quatIdentity, quatFromAxisAngle, placePoint } from '../../src/cad/assembly.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b} (±${tol})`);
const at = (position, rotation = quatIdentity()) => ({ position, rotation });
const G = 9806.65;

test('keyframes: placements between keys move straight (or eased) and turn the short way; outside the keys they hold', () => {
  const asm = { components: [{ id: 'a', ...at([0, 0, 0]) }, { id: 'b', ...at([5, 5, 5]) }], motion: { duration: 4, motors: [] } };
  captureKey(asm, 0);
  asm.components[0].position = [100, 0, 0];
  asm.components[0].rotation = quatFromAxisAngle([0, 0, 1], 90);
  captureKey(asm, 2);
  asm.motion.keys[1].ease = 'linear';
  const mid = keyframePose(asm, 1).get('a');
  near(mid.position[0], 50, 1e-9);
  const q45 = quatFromAxisAngle([0, 0, 1], 45);
  q45.forEach((v, i) => near(mid.rotation[i], v, 1e-9));
  near(keyframePose(asm, 3).get('a').position[0], 100, 1e-9);
  near(keyframePose(asm, -1).get('a').position[0], 0, 1e-9);
  assert.deepEqual(keyframePose(asm, 1).get('b').position, [5, 5, 5]);
  asm.motion.keys[1].ease = 'smooth';
  near(keyframePose(asm, 0.5).get('a').position[0], 100 * (0.25 * 0.25 * (3 - 0.5)), 1e-9);
  // Same time again replaces the key.
  captureKey(asm, 2);
  assert.equal(asm.motion.keys.length, 2);
  // Slerp the short way round.
  const s = quatSlerp([0, 0, 0, 1], [0, 0, 0, -1], 0.5);
  near(Math.abs(s[3]), 1, 1e-9);
});

test('combined inertia: two point-like masses 100 mm apart', () => {
  const tiny = [[1e-9, 0, 0], [0, 1e-9, 0], [0, 0, 1e-9]];
  const r = combineInertia([{ mass: 1, com: [0, 0, 0], I: tiny }, { mass: 1, com: [0, 0, 0], I: tiny, placement: at([100, 0, 0]) }]);
  near(r.mass, 2, 1e-12); near(r.com[0], 50, 1e-12);
  near(r.I[1][1], 2 * 50 * 50, 1e-6); near(r.I[2][2], 5000, 1e-6); near(r.I[0][0], 0, 1e-6);
});

// A pendulum: a 1 kg mass 100 mm below a hinge along x at the origin (the mass's inertia about itself tiny).
const pendulum = (angle, extra = {}) => ({
  components: [
    { id: 'g', fixed: true, ...at([0, 0, 0]) },
    { id: 'p', ...at([0, 0, 0], quatFromAxisAngle([1, 0, 0], angle)) },
  ],
  mates: [
    { id: 'hinge', type: 'concentric', a: { comp: 'p', kind: 'axis', point: [0, 0, 0], dir: [1, 0, 0] }, b: { comp: 'g', kind: 'axis', point: [0, 0, 0], dir: [1, 0, 0] } },
    { id: 'face', type: 'coincident', a: { comp: 'p', kind: 'plane', point: [0, 0, 0], dir: [1, 0, 0] }, b: { comp: 'g', kind: 'plane', point: [0, 0, 0], dir: [-1, 0, 0] } },
  ],
  motion: { duration: 1, motors: [], gravity: { on: true, dir: [0, 0, -1], g: G }, ...extra },
});
const bob = new Map([['p', { mass: 1, com: [0, 0, -100], I: [[1e-6, 0, 0], [0, 1e-6, 0], [0, 0, 1e-6]] }]]);

test('a pendulum let go level reaches the bottom at √(2 g L)', () => {
  const r = simulateDynamics(pendulum(90), { bodies: bob, fps: 200, dt: 1 / 2000, duration: 0.4 });
  assert.ok(r.ok);
  const vmax = Math.max(...r.series.bodies.p.speed);
  near(vmax, Math.sqrt(2 * G * 100), 0.02 * Math.sqrt(2 * G * 100));
  // It stays on the hinge: the mass 100 mm from the axis all along.
  for (const f of r.frames) { const c = placePoint(f.poses.get('p'), [0, 0, -100]); near(Math.hypot(c[1], c[2]), 100, 0.05); near(c[0], 0, 0.01); }
  // The hinge carries the weight and the pull of the swing: at the bottom m g + m v² / L = 3 m g (≈ 29.4 N).
  near(Math.max(...r.series.mates.hinge), 3 * G / 1000, 0.08 * 3 * G / 1000);
});

test('a small swing has the period 2π √(L / g)', () => {
  const r = simulateDynamics(pendulum(5), { bodies: bob, fps: 500, dt: 1 / 2000, duration: 1 });
  // The times the mass passes the bottom going the same way: one period apart.
  const ys = r.frames.map((f) => placePoint(f.poses.get('p'), [0, 0, -100])[1]);
  const ups = [];
  for (let i = 1; i < ys.length; i++) if (ys[i - 1] > 0 && ys[i] <= 0) ups.push(r.frames[i - 1].t + (r.frames[i].t - r.frames[i - 1].t) * (ys[i - 1] / (ys[i - 1] - ys[i])));
  assert.ok(ups.length >= 2, `crossings ${ups}`);
  near(ups[1] - ups[0], 2 * Math.PI * Math.sqrt(100 / G), 0.01);
});

test('a spring and a mass on a slide: period 2π √(m / k); the spring force follows Hooke', () => {
  const asm = {
    components: [{ id: 'g', fixed: true, ...at([0, 0, 0]) }, { id: 'm', ...at([0, 0, 60]) }],
    mates: [
      { id: 'slide', type: 'concentric', a: { comp: 'm', kind: 'axis', point: [0, 0, 0], dir: [0, 0, 1] }, b: { comp: 'g', kind: 'axis', point: [0, 0, 0], dir: [0, 0, 1] } },
      { id: 'noTurn', type: 'parallel', a: { comp: 'm', kind: 'plane', point: [0, 0, 0], dir: [1, 0, 0] }, b: { comp: 'g', kind: 'plane', point: [0, 0, 0], dir: [1, 0, 0] } },
    ],
    motion: { duration: 0.6, motors: [], gravity: { on: false }, springs: [{ id: 'sp', a: { comp: 'g', point: [0, 0, 0] }, b: { comp: 'm', point: [0, 0, 0] }, k: 1, c: 0, length: 50 }] },
  };
  const bodies = new Map([['m', { mass: 1, com: [0, 0, 0], I: [[100, 0, 0], [0, 100, 0], [0, 0, 100]] }]]);
  const r = simulateDynamics(asm, { bodies, fps: 1000, dt: 1 / 4000 });
  assert.ok(r.ok);
  near(r.series.springs.sp[0], 10, 1e-6);
  const z = r.frames.map((f) => f.poses.get('m').position[2] - 50);
  const downs = [];
  for (let i = 1; i < z.length; i++) if (z[i - 1] > 0 && z[i] <= 0) downs.push(r.frames[i - 1].t + (r.frames[i].t - r.frames[i - 1].t) * (z[i - 1] / (z[i - 1] - z[i])));
  near(downs[1] - downs[0], 2 * Math.PI * Math.sqrt(1 / 1000), 0.003);
  near(Math.min(...z), -10, 0.3);
});

test('a motor turning a pendulum slowly needs m g L of torque when the arm is level', () => {
  const asm = pendulum(0, { duration: 1.5, motors: [{ id: 'mo', comp: 'p', kind: 'rotary', speed: 10, ref: { comp: 'p', kind: 'axis', point: [0, 0, 0], dir: [1, 0, 0] } }] });
  const r = simulateDynamics(asm, { bodies: bob, fps: 100, dt: 1 / 1000 });
  assert.ok(r.ok);
  // 10 rpm = 60°/s: level (90°) at 1.5 s; the torque grows as sin of the angle.
  const tq = r.series.motors.mo;
  near(Math.abs(tq[tq.length - 1]), G * 100 / 1000, 0.05 * G * 100 / 1000);
  near(Math.abs(tq[Math.round(0.5 * 100)]), (G * 100 / 1000) * Math.sin(Math.PI / 6), 0.06 * G * 100 / 1000);
  // The played placements match the motor's path.
  const pl = dynamicsPose(r, 0.75);
  const c = placePoint(pl.get('p'), [0, 0, -100]);
  near(Math.atan2(c[1], -c[2]) * 180 / Math.PI, 45, 0.5);
});

test('contact: a ball dropped on the floor bounces back to e² of its height; with no bounce it rests on it', () => {
  // A 5 mm ball (its centre at the component origin) 100 mm above a fixed floor (z = 0).
  const gap = (ct, placeOf) => { const p = placeOf('ball').position; return { gap: p[2] - 5, pa: [p[0], p[1], 0], pb: [p[0], p[1], p[2] - 5], n: [0, 0, 1] }; };
  const run = (e, duration) => simulateDynamics({
    components: [{ id: 'floor', fixed: true, ...at([0, 0, 0]) }, { id: 'ball', ...at([0, 0, 105]) }],
    mates: [], motion: { duration, motors: [], gravity: { on: true, dir: [0, 0, -1], g: G }, contacts: [{ id: 'c1', a: 'floor', b: 'ball', e }] },
  }, { bodies: new Map([['ball', { mass: 0.004, com: [0, 0, 0], I: [[0.04, 0, 0], [0, 0.04, 0], [0, 0, 0.04]] }]]), fps: 500, dt: 1 / 4000, gap });
  const r = run(0.8, 0.5);
  assert.ok(r.ok);
  const z = r.frames.map((f) => f.poses.get('ball').position[2]);
  // The first bounce: the first lowest point, then the highest point before it comes down again.
  const hit = z.findIndex((v, k) => k > 0 && k + 1 < z.length && v <= z[k - 1] && v < z[k + 1]);
  let top = hit + 1; while (top + 1 < z.length && z[top + 1] >= z[top]) top++;
  const peak = z[top];
  near(peak - 5, 0.64 * 100, 3);
  assert.ok(Math.min(...z) > 4.8, `no sinking: ${Math.min(...z)}`);
  assert.ok(Math.max(...r.series.contacts.c1) > 0);
  const still = run(0, 0.6);
  const zs = still.frames.map((f) => f.poses.get('ball').position[2]);
  near(zs.at(-1), 5, 0.05);
  // Resting: the floor carries the ball's weight.
  near(still.series.contacts.c1.at(-1), 0.004 * G / 1000, 0.1 * 0.004 * G / 1000);
});
