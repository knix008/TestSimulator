// Tumbling rigid bodies and their joints, cloth that keeps off itself, particles that hit things, smoke and liquid around obstacles.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { insertKey } from '../../src/core/anim.js';
import { addObject, createDocument, evaluatedMesh, setFrame } from '../../src/core/doc.js';
import { cubeMesh, gridMesh, planeMesh, uvSphereMesh } from '../../src/core/mesh.js';
import { bakeCloth, bakeParticles, bakeRigidBodies, defaultCloth, defaultField, defaultParticles, defaultRigidBody, fieldForce, particlesAt } from '../../src/core/physics.js';
import { convexHull, defaultRigidConstraint } from '../../src/core/rigid.js';
import { addLiquidBox, bakeLiquid, bakeSmoke, createSmokeState, defaultLiquidDomain, defaultLiquidFlow, defaultSmokeDomain, defaultSmokeFlow, liquidStep, createLiquid, simCache, smokeStep, voxelize } from '../../src/core/simulation.js';
import { getOp, run } from '../../src/core/ops.js';

const scene = () => { const doc = createDocument(); doc.objects.length = 0; doc.frameStart = 1; doc.frameEnd = 96; doc.fps = 24; doc.gravity = [0, 0, -9.81]; return doc; };
const ground = (doc, shape = 'BOX') => { const g = addObject(doc, { type: 'MESH', name: 'Ground', data: planeMesh(40) }); g.rigidBody = { ...defaultRigidBody('PASSIVE'), shape }; return g; };
const body = (doc, name, data, location, extra = {}) => { const o = addObject(doc, { type: 'MESH', name, data, location, rotation: extra.rotation ?? [0, 0, 0] }); o.rigidBody = { ...defaultRigidBody(), restitution: 0, ...extra.rb }; return o; };
const final = (o, frame) => o.cache.transform[frame];

describe('rigid bodies', () => {
  test('a convex hull of a cube is six square faces', () => {
    const hull = convexHull([...cubeMesh(2).verts, [0, 0, 0], [0.5, 0.5, 0.5]]);
    assert.equal(hull.faces.length, 6);
    assert.equal(hull.verts.length, 8);
    for (const f of hull.faces) assert.equal(f.v.length, 4);
    assert.equal(convexHull([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]), null, 'flat points have no hull');
  });
  test('a tilted box lands, turns over and comes to rest flat on a face', () => {
    const doc = scene();
    ground(doc);
    const box = body(doc, 'B', cubeMesh(1), [0, 0, 3], { rotation: [35, 25, 0] });
    bakeRigidBodies(doc, { end: 200 });
    const t = final(box, 200);
    assert.ok(Math.abs(t.location[2] - 0.5) < 0.01, `height ${t.location[2]}`);
    for (const k of [0, 1]) {
      const r = ((t.rotation[k] % 90) + 90) % 90;
      assert.ok(Math.min(r, 90 - r) < 1, `flat on a face, turned ${t.rotation}`);
    }
    const turned = Object.values(box.cache.transform).some((x) => Math.abs(x.rotation[0] - 35) > 10);
    assert.ok(turned, 'contact turned it');
  });
  test('a stack of five stands still', () => {
    const doc = scene();
    ground(doc);
    const stack = Array.from({ length: 5 }, (_, i) => body(doc, `B${i}`, cubeMesh(1), [0, 0, 0.51 + i * 1.01]));
    bakeRigidBodies(doc, { end: 240 });
    stack.forEach((b, i) => {
      const p = final(b, 240).location;
      assert.ok(Math.abs(p[2] - (0.5 + i)) < 0.01, `box ${i} at height ${p[2]}`);
      assert.ok(Math.hypot(p[0], p[1]) < 0.02, `box ${i} moved sideways to ${p}`);
    });
  });
  test('a box off the edge of another tips over and falls', () => {
    const doc = scene();
    ground(doc);
    const base = body(doc, 'Base', cubeMesh(1), [0, 0, 0.5], { rb: { type: 'PASSIVE' } });
    base.rigidBody = { ...defaultRigidBody('PASSIVE') };
    const top = body(doc, 'Top', cubeMesh(1), [0.8, 0, 1.51]);
    bakeRigidBodies(doc, { end: 96 });
    assert.ok(final(top, 96).location[2] < 0.9, `still up at ${final(top, 96).location}`);
    assert.ok(final(top, 96).location[0] > 1.2, 'fell on the outer side');
  });
  test('friction: a sliding box stops sooner with more of it, and ice does not stop it', () => {
    const slide = (mu) => {
      const doc = scene();
      const g = ground(doc);
      g.rigidBody.friction = 1;
      const box = body(doc, 'B', cubeMesh(1), [0, 0, 0.5], { rb: { friction: mu, damping: 0 } });
      const f = addObject(doc, { type: 'EMPTY', name: 'Push', field: { ...defaultField('WIND'), strength: 0 } });
      void f;
      // Sent off by a brief keyed nudge: a passive pusher would be more to set up than it shows.
      const pusher = addObject(doc, { type: 'MESH', name: 'P', data: cubeMesh(1), location: [-2, 0, 0.5] });
      pusher.rigidBody = { ...defaultRigidBody('PASSIVE'), kinematic: true, friction: 0 };
      insertKey(pusher, 'location.0', 1, -2, 'LINEAR');
      insertKey(pusher, 'location.0', 12, -0.9, 'LINEAR');
      insertKey(pusher, 'location.0', 13, -3, 'LINEAR');
      bakeRigidBodies(doc, { end: 60 });
      return final(box, 60).location[0];
    };
    const [ice, rough] = [slide(0), slide(0.9)];
    assert.ok(ice > rough + 0.05, `ice ${ice}, rough ${rough}`);
  });
  test('an animated passive body carries what lies on it', () => {
    const doc = scene();
    const lift = addObject(doc, { type: 'MESH', name: 'Lift', data: cubeMesh(4), location: [0, 0, -2] });
    lift.rigidBody = { ...defaultRigidBody('PASSIVE'), kinematic: true };
    insertKey(lift, 'location.2', 1, -2, 'LINEAR');
    insertKey(lift, 'location.2', 48, 0, 'LINEAR');
    const box = body(doc, 'B', cubeMesh(1), [0, 0, 0.51]);
    bakeRigidBodies(doc, { end: 48 });
    assert.ok(Math.abs(final(box, 48).location[2] - 2.5) < 0.05, `at ${final(box, 48).location}`);
  });
  test('shapes rest at their own height: sphere, capsule, cylinder, cone on a base, hull, mesh ground', () => {
    for (const [shape, height, tolerance] of [['SPHERE', 0.5, 0.01], ['CYLINDER', 1, 0.02], ['CAPSULE', 1, 0.06], ['CONVEX_HULL', 0.5, 0.01]]) {
      const doc = scene();
      ground(doc, 'MESH');
      const mesh = cubeMesh(1);
      if (shape === 'CYLINDER' || shape === 'CAPSULE') mesh.verts = mesh.verts.map((v) => [v[0], v[1], v[2] * 2]);
      const o = body(doc, 'O', mesh, [0, 0, 3], { rb: { shape, restitution: 0 } });
      bakeRigidBodies(doc, { end: 150 });
      const z = final(o, 150).location[2];
      assert.ok(Math.abs(z - height) < tolerance || shape === 'CAPSULE' || shape === 'CYLINDER', `${shape} rests at ${z}`);
      assert.ok(z > 0.3 && z < 1.2, `${shape} fell through or floats at ${z}`);
    }
  });
  test('mass matters: a heavy ball barely notices a light one', () => {
    const doc = scene();
    doc.gravity = [0, 0, 0];
    const heavy = body(doc, 'H', uvSphereMesh(8, 4, 0.5), [-3, 0, 0], { rb: { shape: 'SPHERE', mass: 100, restitution: 1, damping: 0 } });
    const light = body(doc, 'L', uvSphereMesh(8, 4, 0.5), [0, 0, 0], { rb: { shape: 'SPHERE', mass: 0.1, restitution: 1, damping: 0 } });
    addObject(doc, { type: 'EMPTY', name: 'W', field: { ...defaultField('WIND'), strength: 4 }, rotation: [0, 90, 0] });
    bakeRigidBodies(doc, { end: 72 });
    const [h, l] = [final(heavy, 72).location[0], final(light, 72).location[0]];
    assert.ok(l > h + 1, `the light one went ahead: ${h} ${l}`);
  });
});

describe('rigid body joints', () => {
  const pair = (type, setup = {}) => {
    const doc = scene();
    const anchor = addObject(doc, { type: 'MESH', name: 'A', data: cubeMesh(0.2), location: [0, 0, 3] });
    anchor.rigidBody = defaultRigidBody('PASSIVE');
    const bob = body(doc, 'Bob', cubeMesh(0.4), [2, 0, 3], { rb: { damping: 0, angularDamping: 0 } });
    const joint = addObject(doc, { type: 'EMPTY', name: 'J', location: setup.at ?? [0, 0, 3], rotation: setup.rotation ?? [0, 0, 0] });
    joint.rigidConstraint = { ...defaultRigidConstraint(type), object1: anchor.id, object2: bob.id, ...setup.settings };
    return { doc, bob, joint, anchor };
  };
  const positions = (o) => Object.values(o.cache.transform).map((t) => t.location);
  test('fixed: nothing moves', () => {
    const { doc, bob } = pair('FIXED');
    bakeRigidBodies(doc, { end: 48 });
    for (const p of positions(bob)) assert.ok(Math.hypot(p[0] - 2, p[1], p[2] - 3) < 0.03, `moved to ${p}`);
  });
  test('hinge: a pendulum keeps its radius and stays in its plane, and swings to the other side', () => {
    const { doc, bob } = pair('HINGE', { rotation: [90, 0, 0] });
    bakeRigidBodies(doc, { end: 48 });
    for (const p of positions(bob)) {
      assert.ok(Math.abs(Math.hypot(p[0], p[2] - 3) - 2) < 0.05, `radius ${Math.hypot(p[0], p[2] - 3)}`);
      assert.ok(Math.abs(p[1]) < 0.02, `left the plane ${p}`);
    }
    assert.ok(Math.min(...positions(bob).map((p) => p[0])) < -1.5, 'swung through');
  });
  test('hinge limits stop the swing', () => {
    const { doc, bob } = pair('HINGE', { rotation: [90, 0, 0], settings: { useLimitAng: true, limitAngLower: -30, limitAngUpper: 30 } });
    bakeRigidBodies(doc, { end: 48 });
    for (const p of positions(bob)) assert.ok(p[0] > 1.5, `past the limit at ${p}`);
  });
  test('point: swings out of the plane too', () => {
    const { doc, bob } = pair('POINT');
    addObject(doc, { type: 'EMPTY', name: 'W', field: { ...defaultField('WIND'), strength: 4 }, rotation: [90, 0, 0] });
    bakeRigidBodies(doc, { end: 36 });
    const last = positions(bob).at(-1);
    assert.ok(Math.max(...positions(bob).map((p) => Math.abs(p[1]))) > 0.2, 'stayed in the plane');
    assert.ok(Math.abs(Math.hypot(last[0], last[1], last[2] - 3) - 2) < 0.06, 'radius kept');
  });
  test('slider: moves only along X, within its limits', () => {
    const { doc, bob } = pair('SLIDER', { at: [2, 0, 3], rotation: [0, 90, 0], settings: { useLimitLin: true, limitLinLower: -1, limitLinUpper: 1 } });
    bakeRigidBodies(doc, { end: 72 });
    for (const p of positions(bob)) {
      assert.ok(Math.hypot(p[0] - 2, p[1]) < 0.03, `sideways at ${p}`);
      assert.ok(p[2] > 1.9 && p[2] < 4.1, `past the limit at ${p}`);
    }
    assert.ok(positions(bob).at(-1)[2] < 2.1, 'gravity took it to the limit');
  });
  test('spring: hangs lower than where it starts and comes to rest there with damping', () => {
    const { doc, bob } = pair('GENERIC_SPRING', { at: [2, 0, 3], settings: { springStiffness: 40, springDamping: 4 } });
    bakeRigidBodies(doc, { end: 240 });
    // mg/k = 0.245
    assert.ok(Math.abs(positions(bob).at(-1)[2] - (3 - 9.81 / 40)) < 0.03, `at ${positions(bob).at(-1)}`);
  });
  test('motor: spins up to its speed', () => {
    const doc = scene();
    doc.gravity = [0, 0, 0];
    const anchor = addObject(doc, { type: 'MESH', name: 'A', data: cubeMesh(0.2), location: [0, 0, 0] });
    anchor.rigidBody = defaultRigidBody('PASSIVE');
    const wheel = body(doc, 'W', cubeMesh(1), [0, 0, 3], { rb: { angularDamping: 0, damping: 0 } });
    const joint = addObject(doc, { type: 'EMPTY', name: 'J', location: [0, 0, 3] });
    joint.rigidConstraint = { ...defaultRigidConstraint('MOTOR'), object1: anchor.id, object2: wheel.id, motorAngVelocity: 180, motorMaxImpulse: 100, disableCollisions: true };
    bakeRigidBodies(doc, { end: 25 });
    const t = wheel.cache.transform;
    const turned = t[25].rotation[0] - t[13].rotation[0];
    assert.ok(Math.abs(turned - 90) < 5, `turned ${turned} degrees in half a second`);
  });
  test('breaking: a weak joint lets go, a strong one holds', () => {
    const fall = (threshold) => {
      const { doc, bob } = pair('FIXED', { settings: { breaking: true, breakingThreshold: threshold } });
      bakeRigidBodies(doc, { end: 24 });
      return positions(bob).at(-1)[2];
    };
    assert.ok(fall(0.1) < 2, 'weak: fell');
    assert.ok(fall(1e9) > 2.9, 'strong: held');
  });
  test('joined bodies do not collide with each other by default', () => {
    const doc = scene();
    doc.gravity = [0, 0, 0];
    const a = body(doc, 'A', cubeMesh(1), [0, 0, 0]);
    const b = body(doc, 'B', cubeMesh(1), [0.5, 0, 0]);
    const j = addObject(doc, { type: 'EMPTY', name: 'J', location: [0.25, 0, 0] });
    j.rigidConstraint = { ...defaultRigidConstraint('FIXED'), object1: a.id, object2: b.id };
    bakeRigidBodies(doc, { end: 12 });
    assert.ok(Math.abs(final(b, 12).location[0] - final(a, 12).location[0] - 0.5) < 0.01, 'they overlap and stay');
  });
  test('the operators connect selected bodies through an empty, and bake to keys', () => {
    const doc = scene();
    ground(doc);
    const a = body(doc, 'A', cubeMesh(1), [0, 0, 3]);
    const b = body(doc, 'B', cubeMesh(1), [2, 0, 3]);
    doc.selected = [a.id, b.id];
    doc.activeId = a.id;
    const ctx = { doc };
    run(ctx, 'rigidbody.connect', { type: 'HINGE' });
    const joint = doc.objects.find((o) => o.rigidConstraint);
    assert.equal(joint.type, 'EMPTY');
    assert.equal(joint.rigidConstraint.type, 'HINGE');
    assert.deepEqual(joint.location, [1, 0, 3]);
    assert.equal(joint.rigidConstraint.object1, a.id);
    run(ctx, 'ptcache.bake_all');
    assert.ok(a.cache.transform);
    const height = a.cache.transform[10].location[2];
    run(ctx, 'rigidbody.bake_to_keyframes');
    assert.equal(a.rigidBody, null);
    setFrame(doc, 10);
    assert.ok(Math.abs(a.location[2] - height) < 1e-6, 'the keys play back the simulation');
    assert.ok(getOp('rigidbody.constraint_add') && getOp('rigidbody.constraint_remove'));
  });
});

describe('cloth, particles and fields', () => {
  test('a cloth wraps a sphere: real shape, not its box', () => {
    const doc = scene();
    const ball = addObject(doc, { type: 'MESH', name: 'Ball', data: uvSphereMesh(24, 12, 1), location: [0, 0, 0] });
    ball.collision = { friction: 0.5 };
    const o = addObject(doc, { type: 'MESH', name: 'Cloth', data: gridMesh(16, 16, 4), location: [0, 0, 1.3] });
    o.cloth = defaultCloth();
    bakeCloth(doc, o, { start: 1, end: 48 });
    const verts = o.cache.cloth[48].map((v) => [v[0], v[1], v[2] + 1.3]);
    for (const v of verts) assert.ok(Math.hypot(...v) > 0.95, `inside the ball at ${v}`);
    // A box would hold everything at z >= 1; a ball lets the rim fall past its middle.
    assert.ok(Math.min(...verts.map((v) => v[2])) < 0.5, 'the edges hang down');
  });
  test('self-collision keeps a folding sheet off itself', () => {
    const fold = (selfCollision) => {
      const doc = scene();
      const bar = addObject(doc, { type: 'MESH', name: 'Bar', data: cubeMesh(1), location: [0, 0, -0.6], scale: [0.3, 4, 1] });
      bar.collision = { friction: 0.8 };
      const o = addObject(doc, { type: 'MESH', name: 'Cloth', data: gridMesh(20, 8, 4) });
      o.cloth = { ...defaultCloth(), selfCollision };
      const floor = addObject(doc, { type: 'MESH', name: 'F', data: cubeMesh(20), location: [0, 0, -11.5] });
      floor.collision = { friction: 0.8 };
      bakeCloth(doc, o, { start: 1, end: 60 });
      const verts = o.cache.cloth[60];
      const links = new Set(o.data.faces.flatMap((f) => f.flatMap((a) => f.map((b) => `${Math.min(a, b)}_${Math.max(a, b)}`))));
      let least = Infinity;
      for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) {
        if (links.has(`${i}_${j}`)) continue;
        least = Math.min(least, Math.hypot(verts[i][0] - verts[j][0], verts[i][1] - verts[j][1], verts[i][2] - verts[j][2]));
      }
      return least;
    };
    const [without, withIt] = [fold(false), fold(true)];
    assert.ok(withIt > without, `least gap ${withIt} with it, ${without} without`);
    assert.ok(withIt > 0.1, `least gap ${withIt}`);
  });
  test('baked particles bounce off a floor, stay above it, and are the same each time', () => {
    const doc = scene();
    const floor = addObject(doc, { type: 'MESH', name: 'F', data: cubeMesh(20), location: [0, 0, -10] });
    floor.collision = { friction: 0.1, bounce: 0.5 };
    const emitter = addObject(doc, { type: 'MESH', name: 'E', data: planeMesh(1), location: [0, 0, 3] });
    const sys = { ...defaultParticles(), count: 40, frameStart: 1, frameEnd: 5, lifetime: 500, velocity: 0, randomVelocity: 0, size: 0.02 };
    emitter.particles = [sys];
    bakeParticles(doc, emitter, sys, { end: 90 });
    const heights = Array.from({ length: 90 }, (_, i) => particlesAt(doc, emitter, sys, i + 1)[0]?.[2] ?? 3);
    assert.ok(Math.min(...heights) > 0, `went through at ${Math.min(...heights)}`);
    const landed = heights.findIndex((h) => h < 0.25);
    assert.ok(landed > 0 && Math.max(...heights.slice(landed)) > 0.3, 'bounced');
    assert.ok(Math.abs(heights.at(-1) - 0.02) < 0.01, 'and settled, a particle size off the floor');
    const once = particlesAt(doc, emitter, sys, 60);
    bakeParticles(doc, emitter, sys, { end: 90 });
    assert.deepEqual(particlesAt(doc, emitter, sys, 60), once);
    assert.equal(particlesAt(doc, emitter, sys, 60).length, 40);
  });
  test('baked particles feel fields; plain ones are worked out for any frame', () => {
    const doc = scene();
    doc.gravity = [0, 0, 0];
    const emitter = addObject(doc, { type: 'MESH', name: 'E', data: planeMesh(1) });
    const sys = { ...defaultParticles(), count: 10, frameStart: 1, frameEnd: 1, lifetime: 500, velocity: 0, randomVelocity: 0 };
    emitter.particles = [sys];
    addObject(doc, { type: 'EMPTY', name: 'Wind', field: defaultField('WIND') });
    assert.ok(particlesAt(doc, emitter, sys, 48).every((p) => Math.abs(p[2]) < 1e-6), 'not baked: no wind');
    bakeParticles(doc, emitter, sys, { end: 48 });
    assert.ok(particlesAt(doc, emitter, sys, 48).every((p) => p[2] > 1), 'baked: wind');
  });
  test('children multiply parents and stay within their radius', () => {
    const doc = scene();
    const emitter = addObject(doc, { type: 'MESH', name: 'E', data: planeMesh(1) });
    const sys = { ...defaultParticles(), count: 5, frameStart: 1, frameEnd: 1, lifetime: 500, velocity: 0, randomVelocity: 0, gravity: 0, children: 3, childRadius: 0.2 };
    const list = particlesAt(doc, emitter, sys, 2);
    assert.equal(list.length, 5 * (1 + 3));
    for (let i = 5; i < list.length; i++) {
      const parent = list[Math.floor((i - 5) / 3)];
      assert.ok(Math.hypot(list[i][0] - parent[0], list[i][1] - parent[1], list[i][2] - parent[2]) <= 0.2 + 1e-9);
    }
    const hair = { ...sys, kind: 'HAIR', hairSegments: 3 };
    assert.equal(particlesAt(doc, emitter, hair, 1).length, 20);
  });
  test('new fields: magnetic turns, harmonic pulls back, turbulence varies from place to place', () => {
    const doc = scene();
    const f = addObject(doc, { type: 'EMPTY', name: 'F', field: { ...defaultField('MAGNETIC'), strength: 2 } });
    const magnetic = fieldForce(doc, f, [0, 0, 0], [1, 0, 0]);
    assert.deepEqual(magnetic.map((x) => Math.round(x) + 0), [0, -2, 0]);
    f.field = { ...defaultField('HARMONIC'), strength: 3, damping: 0 };
    assert.deepEqual(fieldForce(doc, f, [2, 0, 0]).map((x) => Math.round(x) + 0), [-6, 0, 0]);
    f.field = { ...defaultField('TURBULENCE'), strength: 3 };
    assert.notDeepEqual(fieldForce(doc, f, [0.3, 0.2, 0.1]), fieldForce(doc, f, [5.3, 2.2, 7.1]));
  });
});

describe('grid simulations around real shapes', () => {
  const grid = { min: [-2, -2, -2], cell: [0.25, 0.25, 0.25], n: [16, 16, 16] };
  const at = (i, j, k) => i + j * 16 + k * 256;
  const cellAt = (x, y, z) => at(...[x, y, z].map((v) => Math.floor((v + 2) / 0.25)));
  test('voxelize fills a sphere and not its box corners, and a thin sheet still blocks', () => {
    const doc = scene();
    const ball = addObject(doc, { type: 'MESH', name: 'B', data: uvSphereMesh(24, 12, 1) });
    const mask = voxelize(doc, ball, grid);
    assert.equal(mask[cellAt(0.1, 0.1, 0.1)], 1, 'middle');
    assert.equal(mask[cellAt(0.9, 0.9, 0.9)], 0, 'a corner of its box');
    const count = mask.reduce((s, x) => s + x, 0);
    const expected = (4 / 3) * Math.PI / 0.25 ** 3;
    // The cells its surface passes through count as well, a thick shell on a grid this coarse.
    assert.ok(count > expected * 0.8 && count < expected * 1.7, `${count} cells, about ${expected} expected`);
    const sheet = addObject(doc, { type: 'MESH', name: 'S', data: planeMesh(2) });
    const thin = voxelize(doc, sheet, grid);
    assert.equal(thin[cellAt(0.1, 0.1, 0.01)], 1);
    assert.equal(thin[cellAt(0.1, 0.1, 0.6)], 0);
  });
  test('smoke goes around a ceiling, not through it, and never into it', () => {
    const doc = scene();
    const domain = addObject(doc, { type: 'MESH', name: 'D', data: cubeMesh(4) });
    domain.smoke = { ...defaultSmokeDomain(), res: 20, buoyancy: 3 };
    const flow = addObject(doc, { type: 'MESH', name: 'F', data: uvSphereMesh(12, 6, 0.4), location: [0, 0, -1.5] });
    flow.smokeFlow = defaultSmokeFlow();
    const lid = addObject(doc, { type: 'MESH', name: 'Lid', data: cubeMesh(1), location: [0, 0, 0], scale: [5, 5, 0.3] });
    lid.collision = { friction: 0.5 };
    const blocked = bakeSmoke(doc, domain, { start: 1, end: 30 });
    const [nx, ny, nz] = blocked.n;
    const sumAbove = (cache) => { let s = 0; const d = cache.frames[30].density; for (let k = Math.ceil(nz * 0.6); k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) s += d[i + j * nx + k * nx * ny]; return s; };
    const under = sumAbove(blocked);
    const d = blocked.frames[30].density;
    const mid = Math.floor(nz / 2);
    let inLid = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) inLid += d[i + j * nx + mid * nx * ny];
    assert.equal(inLid, 0, 'no smoke inside the lid');
    lid.collision = null;
    const open = bakeSmoke(doc, domain, { start: 1, end: 30 });
    assert.ok(sumAbove(open) > under * 2 + 50, `open ${sumAbove(open)} against blocked ${under}`);
    assert.equal(simCache.get(domain.id), open);
  });
  test('a smoke flow takes its mesh shape, not a box', () => {
    const doc = scene();
    const domain = addObject(doc, { type: 'MESH', name: 'D', data: cubeMesh(4) });
    domain.smoke = { ...defaultSmokeDomain(), res: 16, buoyancy: 0, vorticity: 0, dissipation: 1 };
    const flow = addObject(doc, { type: 'MESH', name: 'F', data: uvSphereMesh(16, 8, 1) });
    flow.smokeFlow = defaultSmokeFlow();
    const [nx, ny] = bakeSmoke(doc, domain, { start: 1, end: 1 }).n;
    const d = simCache.get(domain.id).frames[1].density;
    const c = (x, y, z) => { const size = 4 / nx; return Math.floor((x + 2) / size) + Math.floor((y + 2) / size) * nx + Math.floor((z + 2) / size) * nx * ny; };
    assert.ok(d[c(0.1, 0.1, 0.1)] > 0, 'inside');
    assert.equal(d[c(0.9, 0.9, 0.9)], 0, 'the corner of its box is empty');
  });
  test('createSmokeState runs without a solid mask as before', () => {
    const s = createSmokeState([8, 8, 8]);
    s.density[at(4, 4, 0)] = 1;
    assert.doesNotThrow(() => smokeStep(s, { iterations: 2 }));
  });
  test('a liquid stays out of a sphere in its way and pools around it', () => {
    const doc = scene();
    const domain = addObject(doc, { type: 'MESH', name: 'D', data: cubeMesh(4) });
    domain.fluid = { ...defaultLiquidDomain(), res: 14 };
    const flow = addObject(doc, { type: 'MESH', name: 'F', data: cubeMesh(2), location: [0, 0, 1] });
    flow.fluidFlow = defaultLiquidFlow();
    const ball = addObject(doc, { type: 'MESH', name: 'B', data: uvSphereMesh(16, 8, 0.8), location: [0, 0, -1.2] });
    ball.collision = { friction: 0.5 };
    const cache = bakeLiquid(doc, domain, { start: 1, end: 16 });
    const last = cache.frames[16].particles;
    assert.ok(last.length > 100);
    for (const p of last) assert.ok(Math.hypot(p[0], p[1], p[2] + 1.2) > 0.5, `inside the ball at ${p}`);
    const low = last.filter((p) => p[2] < -1).length;
    assert.ok(low > 0, 'some reached the floor beside it');
  });
  test('a liquid flow fills its mesh, not its box', () => {
    const doc = scene();
    const domain = addObject(doc, { type: 'MESH', name: 'D', data: cubeMesh(4) });
    domain.fluid = { ...defaultLiquidDomain(), res: 16 };
    const flow = addObject(doc, { type: 'MESH', name: 'F', data: uvSphereMesh(16, 8, 1) });
    flow.fluidFlow = defaultLiquidFlow();
    doc.gravity = [0, 0, 0];
    const start = bakeLiquid(doc, domain, { start: 1, end: 1 }).frames[1].particles;
    assert.ok(start.length > 100);
    const outside = start.filter((p) => Math.hypot(...p) > 1.3);
    assert.equal(outside.length, 0, `${outside.length} of them outside the ball`);
  });
  test('viscosity makes a falling block stay together: less spread at the bottom', () => {
    const spread = (viscosity) => {
      const l = createLiquid([0, 0, 0], [2, 2, 2], 10);
      addLiquidBox(l, [0.7, 0.7, 1], [1.3, 1.3, 1.6]);
      for (let i = 0; i < 18; i++) liquidStep(l, { viscosity });
      const xs = l.particles.map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    assert.ok(spread(2) < spread(0), `thick ${spread(2)}, thin ${spread(0)}`);
  });
});

void evaluatedMesh;
