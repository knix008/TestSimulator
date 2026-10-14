// Robot: forward / inverse kinematics, trajectories, KRL, the robot solid.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createEntity } from '../../src/domain/entities.js';
import { forwardKinematics, inverseKinematics, JOINT_LIMITS, samplePath, toKrl, trajectory } from '../../src/domain/robot.js';
import { meshBox, solidMesh } from '../../src/domain/solids.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const tip = (joints, options) => { const m = forwardKinematics(joints, options).tcp; return [m[3], m[7], m[11]]; };

test('forward kinematics: the home pose reaches forward with the tool pointing down', () => {
  const { tcp } = forwardKinematics([0, -90, 90, 0, 90, 0]);
  [445, 0, 810].forEach((v, i) => near([tcp[3], tcp[7], tcp[11]][i], v, 1e-9));
  near(tcp[10], -1, 1e-12);
  // A tool adds its length straight down; joint 1 swings the arm about z.
  near(tip([0, -90, 90, 0, 90, 0], { tool: 100 })[2], 710, 1e-9);
  const turned = tip([90, -90, 90, 0, 90, 0]);
  near(turned[0], 0, 1e-9);
  near(turned[1], 445, 1e-9);
});

test('inverse kinematics: reachable points exactly, tool down; out of reach reported', () => {
  for (const target of [[600, 0, 200], [400, 300, 100], [-300, 500, 400], [700, -200, 0]]) {
    const r = inverseKinematics(target, undefined, { tool: 100 });
    assert.ok(r.reached, `${target}: ${r.error}`);
    tip(r.joints, { tool: 100 }).forEach((v, i) => near(v, target[i], 0.5));
    near(forwardKinematics(r.joints, { tool: 100 }).tcp[10], -1, 1e-3);
    r.joints.forEach((v, i) => assert.ok(v >= JOINT_LIMITS[i][0] && v <= JOINT_LIMITS[i][1]));
  }
  const far = inverseKinematics([2000, 0, 0]);
  assert.equal(far.reached, false);
  assert.ok(far.error > 500);
});

test('trajectory along a square: every point reached, small steps between poses, KRL program', () => {
  const path = samplePath([[400, -150, 100], [650, -150, 100], [650, 150, 100], [400, 150, 100], [400, -150, 100]], 25);
  assert.equal(path.length, 1 + 4 * 10 + 2 * 2);
  const run = trajectory(path, [0, -90, 90, 0, 90, 0], { tool: 100 });
  assert.ok(run.reached);
  for (let i = 1; i < run.steps.length; i++) {
    const jump = Math.max(...run.steps[i].joints.map((v, k) => Math.abs(v - run.steps[i - 1].joints[k])));
    assert.ok(jump < 30, `step ${i} jumps ${jump}°`);
  }
  const krl = toKrl(run.steps, { name: 'my path!' });
  assert.match(krl, /^DEF my_path_\(\)\r\n/);
  assert.equal((krl.match(/^PTP /gm) ?? []).length, run.steps.length + 2);
  assert.match(krl, /PTP \{A1 -?\d+(\.\d+)?, A2 -?\d+(\.\d+)?, A3 -?\d+(\.\d+)?, A4 -?\d+(\.\d+)?, A5 -?\d+(\.\d+)?, A6 -?\d+(\.\d+)?\} ; X 400 Y -150 Z 100/);
  assert.match(krl, /\r\nEND\r\n$/);
});

test('robot solid: parameters within limits; the mesh follows the joints and the size factor', () => {
  const robot = createEntity('solid', { kind: 'robot', params: { a2: -500 } });
  assert.equal(robot.params.a2, JOINT_LIMITS[1][0]);
  const home = meshBox(solidMesh(createEntity('solid', { kind: 'robot' })));
  near(home.max[2], 960, 5);
  const big = meshBox(solidMesh(createEntity('solid', { kind: 'robot', params: { reach: 2, tool: 200 } })));
  near(big.max[2], home.max[2] * 2, 1);
  const turned = meshBox(solidMesh(createEntity('solid', { kind: 'robot', params: { a1: 90 } })));
  assert.ok(turned.max[1] > 400 && turned.max[0] < 200, 'swung round to +y');
});
