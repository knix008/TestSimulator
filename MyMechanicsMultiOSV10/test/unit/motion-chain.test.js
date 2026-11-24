// Motors that swing (amplitude, period) and motors mounted on another component (parent): a robot's joints each
// turn on the link before it. The robot sample moves every joint and its gripper opens and closes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel } from '../../src/cad/kernel.js';
import { buildSample } from '../../src/cad/samples.js';
import { motorTravel, motionCursor, motionFrame } from '../../src/cad/assembly.js';

await loadKernel();
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('motor travel: speed runs on, amplitude and period swing back and forth', () => {
  near(motorTravel({ kind: 'rotary', speed: 30 }, 2), 2 * Math.PI); // 30 rpm for 2 s = one turn
  near(motorTravel({ kind: 'linear', speed: 5 }, 3), 15);
  const swing = { kind: 'rotary', amplitude: 45, period: 4 };
  near(motorTravel(swing, 0), 0);
  near(motorTravel(swing, 1), Math.PI / 4);
  near(motorTravel(swing, 3), -Math.PI / 4);
  near(motorTravel(swing, 4), 0, 1e-12);
  near(motorTravel({ kind: 'linear', amplitude: 6, period: 2, speed: 99 }, 0.5), 6);
});

/** Per component over the study: the largest distance its origin moves (mm) and the largest turn (°). */
function play(asm) {
  const cur = motionCursor(asm, { size: 900 });
  const start = new Map(asm.components.map((c) => [c.id, c]));
  const moved = new Map(); const turned = new Map();
  for (let t = 0; t <= asm.motion.duration + 1e-9; t += 0.25) {
    for (const [id, p] of cur.at(t)) {
      const c = start.get(id);
      moved.set(id, Math.max(moved.get(id) ?? 0, Math.hypot(...p.position.map((v, i) => v - c.position[i]))));
      const dot = Math.min(1, Math.abs(p.rotation.reduce((s, v, i) => s + v * c.rotation[i], 0)));
      turned.set(id, Math.max(turned.get(id) ?? 0, (2 * Math.acos(dot) * 180) / Math.PI));
    }
  }
  return { moved, turned };
}

test('robot sample: every joint has a motor on the link before it; every link and both fingers move, mates hold', () => {
  const project = buildSample('asmRobot', 'en');
  const robot = project.assemblies.find((a) => a.id === project.active.id);
  const grip = project.assemblies.find((a) => a !== robot);
  assert.deepEqual(robot.motion.motors.map((m) => m.id), ['motor-j1', 'motor-j2', 'motor-j3', 'motor-j4', 'motor-j5', 'motor-j6']);
  for (const m of robot.motion.motors) assert.ok(robot.components.some((c) => c.id === m.parent), `${m.id} is mounted on a component`);
  const { moved, turned } = play(robot);
  for (const c of robot.components) {
    if (c.fixed) { near(moved.get(c.id) + turned.get(c.id), 0, 1e-9); continue; }
    // Every link turns (J1 turns the waist about its own origin, so that one only turns).
    assert.ok(turned.get(c.id) > 10, `${c.name} turns (${turned.get(c.id)}°)`);
  }
  near(turned.get(robot.components.find((c) => /J1/.test(c.name)).id), 45, 0.5);
  for (const c of robot.components.filter((x) => !x.fixed && !/J1/.test(x.name))) assert.ok(moved.get(c.id) > 20, `${c.name} moves (${moved.get(c.id)} mm)`);
  for (const t of [0.6, 1.7, 2.9, 4.4, 5.8]) assert.ok(motionFrame(robot, t, { size: 900 }).ok, `robot mates hold at ${t} s`);
  // The gripper's own study: the fingers open and close by ±6 mm, the width mate keeps them centred.
  const gm = play(grip).moved;
  const fingers = grip.components.filter((c) => !c.fixed);
  assert.equal(fingers.length, 2);
  for (const f of fingers) near(gm.get(f.id), 6, 0.05);
  for (const t of [0.5, 1.5]) assert.ok(motionFrame(grip, t, { size: 200 }).ok, `gripper mates hold at ${t} s`);
});
