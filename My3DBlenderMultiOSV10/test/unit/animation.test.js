// Curve modifiers, handles, key selection, NLA, drivers and live IK.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as anim from '../../src/core/anim.js';
import { armaturePoseMatrices, bonePoseMatrices, createArmature, createBone, posedBone, solveIK, solvedArmature } from '../../src/core/armature.js';
import { addObject, createDocument, evaluatedArmature, evaluateDriver, setFrame } from '../../src/core/doc.js';
import { calculateMotionPath } from '../../src/core/scenes.js';
import { v3 } from '../../src/core/mesh.js';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} against ${b}`);
const ramp = () => { const o = { location: [0, 0, 0] }; anim.insertKey(o, 'location.0', 0, 0, 'LINEAR'); anim.insertKey(o, 'location.0', 10, 10, 'LINEAR'); return o; };
const withMod = (type, props = {}) => { const o = ramp(); o.anim.modifiers = { 'location.0': [{ ...anim.defaultFModifier(type), ...props }] }; return o; };
const at = (o, f) => anim.evalFCurve(o.anim, 'location.0', f);

describe('F-curve modifiers', () => {
  test('Cycles repeats, offsets and mirrors, either way, and stops at its count', () => {
    let o = withMod('CYCLES');
    near(at(o, 15), 5); near(at(o, 25), 5); near(at(o, -5), 5);
    o = withMod('CYCLES', { after: 'OFFSET', before: 'OFFSET' });
    near(at(o, 15), 15); near(at(o, 25), 25); near(at(o, -5), -5);
    o = withMod('CYCLES', { after: 'MIRROR' });
    near(at(o, 12), 8); near(at(o, 22), 2);
    o = withMod('CYCLES', { after: 'NONE' });
    near(at(o, 15), 10);
    o = withMod('CYCLES', { countAfter: 1 });
    near(at(o, 15), 5); near(at(o, 40), 10, 1e-6);
  });
  test('Noise is the same each time, within its strength, and blends', () => {
    const o = withMod('NOISE', { strength: 2, scale: 3 });
    const values = [];
    for (let f = 0; f <= 10; f += 0.5) { const n = at(o, f) - f; assert.ok(Math.abs(n) <= 2 + 1e-9); values.push(n); }
    assert.ok(new Set(values).size > 5, 'it moves');
    assert.equal(at(o, 3.3), at(o, 3.3));
    const r = withMod('NOISE', { strength: 1, blend: 'REPLACE' });
    assert.ok(Math.abs(at(r, 5)) <= 1);
  });
  test('Generator, built-in, stepped and limits', () => {
    near(at(withMod('GENERATOR', { coefficients: [1, 2, 3] }), 2), 1 + 4 + 12);
    near(at(withMod('GENERATOR', { coefficients: [1], additive: 1 }), 5), 6);
    near(at(withMod('BUILTIN', { fn: 'SIN', amplitude: 2, phaseMultiplier: 0.5 }), Math.PI), 2);
    near(at(withMod('STEPPED', { step: 4 }), 7), 4);
    near(at(withMod('STEPPED', { step: 4 }), 8), 8);
    near(at(withMod('LIMITS', { minValue: 2, maxValue: 7 }), 1), 2);
    near(at(withMod('LIMITS', { minValue: 2, maxValue: 7 }), 9), 7);
  });
  test('the frame applies them, and a muted one does nothing', () => {
    const doc = createDocument();
    const obj = addObject(doc, { type: 'EMPTY', name: 'E' });
    anim.insertKey(obj, 'location.0', 0, 0, 'LINEAR');
    anim.insertKey(obj, 'location.0', 10, 10, 'LINEAR');
    obj.anim.modifiers = { 'location.0': [anim.defaultFModifier('CYCLES')] };
    setFrame(doc, 15);
    near(obj.location[0], 5);
    obj.anim.modifiers['location.0'][0].mute = true;
    setFrame(doc, 15);
    near(obj.location[0], 10);
  });
});

describe('handles', () => {
  const curve = () => { const o = {}; for (const [f, v] of [[0, 0], [10, 10], [20, 0]]) anim.insertKey(o, 'a', f, v); return o.anim.fcurves.a; };
  test('moving one by hand makes it aligned: the other stays opposite and keeps its length', () => {
    const keys = curve();
    const k = keys[1];
    const length = Math.hypot(k.hr[0] - k.f, k.hr[1] - k.v);
    anim.moveHandle(keys, k, 'hl', [7, 13]);
    assert.equal(k.handleType, 'ALIGNED');
    near(Math.hypot(k.hr[0] - k.f, k.hr[1] - k.v), length);
    near((k.hl[0] - k.f) * (k.hr[1] - k.v) - (k.hl[1] - k.v) * (k.hr[0] - k.f), 0);
  });
  test('free handles move alone; none crosses its neighbour; automatic ones leave hand-set keys alone', () => {
    const keys = curve();
    keys[1].handleType = 'FREE';
    const right = [...keys[1].hr];
    anim.moveHandle(keys, keys[1], 'hl', [8, 14]);
    assert.deepEqual(keys[1].hr, right);
    anim.moveHandle(keys, keys[1], 'hl', [-50, 14]);
    assert.ok(keys[1].hl[0] >= keys[0].f);
    const set = [...keys[1].hl];
    anim.autoHandles(keys);
    assert.deepEqual(keys[1].hl, set);
  });
  test('the curve follows the handle', () => {
    const keys = curve();
    keys[1].handleType = 'FREE';
    const before = anim.evalCurve(keys, 8);
    anim.moveHandle(keys, keys[1], 'hl', [8, 30]);
    assert.ok(anim.evalCurve(keys, 8) > before + 1);
  });
  test('vector points straight at the neighbours', () => {
    const keys = curve();
    keys[1].sel = true;
    anim.setHandleType(keys, 'VECTOR');
    near(keys[1].hl[1], 10 - 10 / 3);
    near(keys[1].hr[1], 10 - 10 / 3);
  });
  test('aligned straightens handles at once', () => {
    const keys = curve();
    keys[1].handleType = 'FREE';
    keys[1].hl = [8, 5];
    keys[1].hr = [12, 5];
    keys[1].sel = true;
    anim.setHandleType(keys, 'ALIGNED');
    near((keys[1].hl[0] - keys[1].f) * (keys[1].hr[1] - keys[1].v) - (keys[1].hl[1] - keys[1].v) * (keys[1].hr[0] - keys[1].f), 0);
  });
});

describe('selected keys', () => {
  const target = () => { const o = {}; for (const f of [0, 10, 20]) { anim.insertKey(o, 'a', f, f); anim.insertKey(o, 'b', f, -f); } return o; };
  test('a box selects by time and value', () => {
    const o = target();
    anim.selectInBox(o.anim.fcurves.a, { f0: 5, f1: 25, v0: 15, v1: 25 });
    assert.deepEqual(o.anim.fcurves.a.filter((k) => k.sel).map((k) => k.f), [20]);
    assert.ok(anim.hasSelectedKeys(o));
  });
  test('move, duplicate and delete take only the selected', () => {
    const o = target();
    o.anim.fcurves.a[1].sel = true;
    anim.moveSelectedKeys(o, 3);
    assert.deepEqual(o.anim.fcurves.a.map((k) => k.f), [0, 13, 20]);
    assert.deepEqual(o.anim.fcurves.b.map((k) => k.f), [0, 10, 20]);
    anim.duplicateSelectedKeys(o, 2);
    assert.deepEqual(o.anim.fcurves.a.map((k) => k.f), [0, 13, 15, 20]);
    assert.deepEqual(o.anim.fcurves.a.filter((k) => k.sel).map((k) => k.f), [15], 'the copy is what stays selected');
    assert.equal(anim.deleteSelectedKeys(o), 1);
    assert.deepEqual(o.anim.fcurves.a.map((k) => k.f), [0, 13, 20]);
  });
  test('deleting all of a curve removes the curve', () => {
    const o = target();
    for (const k of o.anim.fcurves.a) k.sel = true;
    anim.deleteSelectedKeys(o);
    assert.equal(o.anim.fcurves.a, undefined);
    assert.ok(o.anim.fcurves.b);
  });
  test('names for people', () => {
    assert.equal(anim.pathLabel('location.2'), 'Z Location');
    assert.equal(anim.pathGroupName('location.2'), 'Location');
    assert.equal(anim.pathLabel('modifiers.0.levels'), 'modifiers.0.levels');
  });
});

describe('NLA', () => {
  const pushed = (from, to, start = from) => {
    const o = { location: [0, 0, 0] };
    anim.insertKey(o, 'location.0', from, 0, 'LINEAR');
    anim.insertKey(o, 'location.0', to, 10, 'LINEAR');
    const strip = anim.pushDownAction(o);
    strip.start = start;
    anim.syncStripEnd(strip);
    return { o, strip };
  };
  const value = (o, f) => { o.location[0] = 0; anim.applyAnimation(o, f); return o.location[0]; };
  test('scale stretches and repeat plays again, ending on the end', () => {
    const { o, strip } = pushed(0, 10);
    strip.scale = 2;
    anim.syncStripEnd(strip);
    assert.equal(strip.end, 20);
    near(value(o, 10), 5);
    strip.scale = 1;
    strip.repeat = 3;
    anim.syncStripEnd(strip);
    assert.equal(strip.end, 30);
    near(value(o, 15), 5);
    near(value(o, 30), 10);
  });
  test('reversed plays backwards', () => {
    const { o, strip } = pushed(0, 10);
    strip.reverse = true;
    near(value(o, 2), 8);
  });
  test('blend in and out ramp the influence', () => {
    const { o, strip } = pushed(0, 10);
    strip.blendIn = 4;
    strip.blendOut = 4;
    near(value(o, 2), 2 * 0.5);
    near(value(o, 5), 5);
    near(value(o, 8), 8 * 0.5);
  });
  test('hold keeps the end value afterwards, and nothing is the default', () => {
    const { o, strip } = pushed(0, 10);
    near(value(o, 20), 0);
    strip.extrapolate = 'HOLD_FORWARD';
    near(value(o, 20), 10);
    near(value(o, -5), 0);
    strip.extrapolate = 'HOLD';
    near(value(o, -5), 0);
  });
  test('a transition goes from where one strip ends to where the next begins', () => {
    const { o, strip } = pushed(0, 10);
    const second = { ...strip, name: 'B', action: { 'location.0': [{ f: 0, v: 100, interp: 'LINEAR' }, { f: 10, v: 110, interp: 'LINEAR' }] }, start: 20, end: 30, actionStart: 0 };
    o.anim.nla.push(second);
    const t = anim.addTransition(o, 0);
    assert.equal(t.start, 10);
    assert.equal(t.end, 20);
    near(value(o, 15), (10 + 100) / 2);
    near(value(o, 10), 10);
    near(value(o, 25), 105);
    assert.equal(anim.addTransition(o, 1), null, 'not from a transition');
  });
  test('split keeps the motion and makes two strips', () => {
    const { o } = pushed(0, 10);
    const before = [2, 5, 7, 9].map((f) => value(o, f));
    const second = anim.splitStrip(o, 0, 5);
    assert.ok(second);
    assert.equal(o.anim.nla.length, 2);
    assert.equal(o.anim.nla[0].end, 5);
    assert.equal(second.start, 5);
    [2, 5, 7, 9].forEach((f, i) => near(value(o, f), before[i], 1e-3));
    assert.equal(anim.splitStrip(o, 0, 50), null, 'not outside it');
  });
});

describe('drivers', () => {
  test('safe expressions work; anything that reaches for the program does not', () => {
    near(anim.evalDriver('sin(frame) * 2 + x', { frame: 0, x: 3 }), 3);
    near(anim.evalDriver('x > 1 ? 2 : 3', { x: 5 }), 2);
    near(anim.evalDriver('PI', {}), Math.PI);
    for (const bad of ['constructor', 'this', 'x.constructor', "x['a']", 'window', 'process', 'alert(1)', 'globalThis', 'import("x")', '(1).constructor', '`a`']) {
      assert.equal(anim.evalDriver(bad, { x: 1 }), null, bad);
    }
  });
  test('sum, average, min and max need no expression', () => {
    const doc = createDocument();
    const a = addObject(doc, { type: 'EMPTY', name: 'A', location: [1, 0, 0] });
    const b = addObject(doc, { type: 'EMPTY', name: 'B', location: [3, 0, 0] });
    const c = addObject(doc, { type: 'EMPTY', name: 'C' });
    const d = { path: 'location.1', type: 'AVERAGE', variables: [{ name: 'p', object: a.id, path: 'location.0' }, { name: 'q', object: b.id, path: 'location.0' }] };
    evaluateDriver(doc, c, d);
    near(c.location[1], 2);
    for (const [type, want] of [['SUM', 4], ['MIN', 1], ['MAX', 3]]) { d.type = type; evaluateDriver(doc, c, d); near(c.location[1], want); }
  });
  test('an error is flagged and leaves the value alone', () => {
    const doc = createDocument();
    const c = addObject(doc, { type: 'EMPTY', name: 'C', location: [0, 7, 0] });
    const d = { path: 'location.1', expression: 'nonsense(' };
    evaluateDriver(doc, c, d);
    assert.equal(d._error, true);
    assert.equal(c.location[1], 7);
  });
});

describe('live IK', () => {
  const rig = () => {
    const doc = createDocument();
    const arm = createArmature();
    arm.bones[0].tail = [0, 0, 1];
    arm.bones.push(createBone('Fore', [0, 0, 1], [0, 0, 2], 0));
    const armature = addObject(doc, { type: 'ARMATURE', name: 'Arm', data: arm });
    const target = addObject(doc, { type: 'EMPTY', name: 'T', location: [1, 0, 1] });
    arm.bones[1].ik = { target: target.id, chain: 2, pole: null, poleAngle: 0, influence: 1, iterations: 32 };
    return { doc, arm, armature, target };
  };
  test('the tip follows the target as it moves, and the stored pose is untouched', () => {
    const { doc, arm, armature, target } = rig();
    let solved = evaluatedArmature(doc, armature);
    assert.ok(v3.dist(posedBone(solved, 1).tail, [1, 0, 1]) < 0.01);
    assert.deepEqual(arm.bones[0].pose.rotation, [0, 0, 0], 'stored pose stays');
    target.location = [0, 1, 1];
    solved = evaluatedArmature(doc, armature);
    assert.ok(v3.dist(posedBone(solved, 1).tail, [0, 1, 1]) < 0.01);
  });
  test('it works in the armature\'s own space', () => {
    const { doc, armature, target } = rig();
    armature.location = [5, 0, 0];
    target.location = [6, 0, 1];
    assert.ok(v3.dist(posedBone(evaluatedArmature(doc, armature), 1).tail, [1, 0, 1]) < 0.01);
  });
  test('the pole swings the elbow towards it, and the tip stays', () => {
    const arm = createArmature();
    arm.bones[0].tail = [0, 0, 1];
    arm.bones.push(createBone('Fore', [0, 0, 1], [0, 0, 2], 0));
    const goal = [0, 0, 1.5];
    for (const pole of [[5, 0, 0.7], [-5, 0, 0.7], [0, 5, 0.7]]) {
      const copy = JSON.parse(JSON.stringify(arm));
      // Bend it first, or there is no elbow to swing.
      copy.bones[0].pose.rotation = [20, 10, 0];
      solveIK(copy, 1, goal, 2, 32, pole);
      const head = posedBone(copy, 1).head;
      assert.ok(v3.dist(posedBone(copy, 1).tail, goal) < 0.02, 'the tip stays');
      const sideways = [head[0], head[1]];
      const len = Math.hypot(...sideways);
      assert.ok(len > 0.1, 'it bends');
      const dot = (sideways[0] * pole[0] + sideways[1] * pole[1]) / (len * Math.hypot(pole[0], pole[1]));
      assert.ok(dot > 0.99, `the elbow points at the pole: ${dot}`);
    }
  });
  test('influence blends, and no target means the same object back', () => {
    const { doc, arm, armature } = rig();
    arm.bones[1].ik.influence = 0;
    assert.ok(v3.dist(posedBone(evaluatedArmature(doc, armature), 1).tail, [0, 0, 2]) < 1e-6);
    arm.bones[1].ik.influence = 0.5;
    const half = posedBone(evaluatedArmature(doc, armature), 1).tail;
    assert.ok(v3.dist(half, [0, 0, 2]) > 0.05 && v3.dist(half, [1, 0, 1]) > 0.05);
    const plain = createArmature();
    assert.equal(solvedArmature(plain, () => null), plain);
    void armaturePoseMatrices; void bonePoseMatrices;
  });
  test('a bone path follows the tip through the animation', () => {
    const { doc, arm, armature, target } = rig();
    anim.insertKey(target, 'location.0', 1, 1, 'LINEAR');
    anim.insertKey(target, 'location.0', 5, 0.5, 'LINEAR');
    const path = calculateMotionPath(doc, armature, { start: 1, end: 5, bone: 1 });
    assert.equal(path.points.length, 5);
    assert.ok(Math.abs(path.points[0][0] - 1) < 0.02);
    assert.ok(Math.abs(path.points[4][0] - 0.5) < 0.02);
    assert.ok(arm.bones.length === 2);
  });
});
