// The models behind the big separate editors: add-ons, the sequencer, motion tracking, and OSL script nodes.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BUILTIN_ADDONS, addonFromFile, addonInfo, addonOperators, disableAddon, enableAddon, isEnabled } from '../../src/core/addons.js';
import { activeObject, createDefaultScene, createDocument, defaultMaterial, deserialize } from '../../src/core/doc.js';
import { History } from '../../src/core/history.js';
import { signedVolume, isManifold } from '../../src/core/mesh.js';
import { addLink, createNode, evalShader, nodeSockets, defaultShaderGraph } from '../../src/core/nodes.js';
import { getOp, run } from '../../src/core/ops.js';
import { DEFAULT_OSL, compileOSL, oslShader } from '../../src/core/osl.js';
import { addStrip, addTransition, compositeFrame, createStrip, cutStrip, moveStrip, sequenceEnd, stripFrame, stripsAt, transitionFactor } from '../../src/core/sequencer.js';
import { createTrack, solveCamera, stabilizationOffsets, trackForward, trackStep } from '../../src/core/tracking.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b} (±${eps})`);
const context = () => {
  const doc = createDefaultScene();
  const history = new History();
  history.reset(doc);
  return { doc, history, undo() { const text = this.history.undo(); if (text) this.doc = deserialize(text); return Boolean(text); } };
};

describe('add-ons', () => {
  test('the built-in ones describe themselves', () => {
    const ctx = context();
    for (const addon of BUILTIN_ADDONS) {
      const info = addonInfo(ctx, addon);
      assert.ok(info.name && info.description, `${addon.id}: ${JSON.stringify(info)}`);
    }
  });
  test('Add Gear: on, used, off', () => {
    const ctx = context();
    const gear = BUILTIN_ADDONS.find((a) => a.id === 'add_mesh_gear');
    assert.deepEqual(enableAddon(ctx, gear), ['mesh.gear_add']);
    assert.equal(isEnabled(gear.id), true);
    assert.ok(addonOperators().includes('mesh.gear_add'));
    run(ctx, 'mesh.gear_add', { teeth: 8 });
    const mesh = activeObject(ctx.doc).data;
    assert.equal(activeObject(ctx.doc).name, 'Gear');
    assert.equal(mesh.verts.length, 8 * 4 * 2);
    assert.ok(isManifold(mesh), 'a closed solid');
    assert.ok(signedVolume(mesh) > 0, 'outward faces');
    disableAddon(gear.id);
    assert.equal(getOp('mesh.gear_add'), undefined);
    assert.equal(isEnabled(gear.id), false);
  });
  test('Scatter Copies places linked copies, the same for the same seed', () => {
    const go = () => {
      const ctx = context();
      const addon = BUILTIN_ADDONS.find((a) => a.id === 'object_scatter');
      enableAddon(ctx, addon);
      run(ctx, 'object.scatter_copies', { count: 5, area: 4, seed: 3 });
      disableAddon(addon.id);
      return ctx.doc.objects.slice(3).map((o) => o.location);
    };
    const a = go();
    assert.equal(a.length, 5);
    for (const l of a) assert.ok(Math.abs(l[0]) <= 4 && Math.abs(l[1]) <= 4);
    assert.deepEqual(a, go());
  });
  test('a JavaScript add-on', () => {
    const ctx = context();
    const lines = [];
    const addon = BUILTIN_ADDONS.find((a) => a.id === 'mesh_stats');
    enableAddon(ctx, addon, (line) => lines.push(line));
    run(ctx, 'mesh.statistics_print');
    assert.deepEqual(lines, ['Cube: 8 vertices, 6 faces']);
    disableAddon(addon.id);
    assert.equal(getOp('mesh.statistics_print'), undefined);
  });
  test('a broken add-on is an error to show, and leaves nothing behind', () => {
    const ctx = context();
    const bad = addonFromFile('bad.py', 'import nothing_here\n');
    assert.equal(bad.language, 'python');
    assert.throws(() => enableAddon(ctx, bad), /No module named/);
    assert.equal(isEnabled(bad.id), false);
    assert.match(addonInfo(ctx, bad).error, /No module/);
    assert.throws(() => addonFromFile('x.txt', ''), /\.py or \.js/);
  });
  test('turning one on twice does not register twice', () => {
    const ctx = context();
    const gear = BUILTIN_ADDONS[0];
    enableAddon(ctx, gear);
    enableAddon(ctx, gear);
    assert.equal(addonOperators().filter((x) => x === 'mesh.gear_add').length, 1);
    disableAddon(gear.id);
  });
});

describe('sequencer model', () => {
  const seq = () => ({ strips: [], channels: 8 });
  const red = (init = {}) => createStrip('COLOR', { color: [1, 0, 0], start: 1, length: 10, ...init });
  const blue = (init = {}) => createStrip('COLOR', { color: [0, 0, 1], start: 1, length: 10, channel: 2, ...init });
  const px = (rgba, w, x, y) => [...rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 3)];
  test('strips show only between their start and end', () => {
    const s = seq();
    const a = addStrip(s, red({ start: 5, length: 3 }));
    assert.deepEqual(stripsAt(s, 4), []);
    assert.deepEqual(stripsAt(s, 5), [a]);
    assert.deepEqual(stripsAt(s, 7), [a]);
    assert.deepEqual(stripsAt(s, 8), []);
    assert.equal(sequenceEnd(s), 7);
  });
  test('adding where another strip is goes up a channel; no channel left is an error', () => {
    const s = { strips: [], channels: 2 };
    addStrip(s, red());
    const b = addStrip(s, red());
    assert.equal(b.channel, 2);
    assert.throws(() => addStrip(s, red()), /No free channel/);
  });
  test('moving never makes an overlap', () => {
    const s = seq();
    const a = addStrip(s, red({ start: 1, length: 10 }));
    const b = addStrip(s, red({ start: 20, length: 10 }));
    assert.equal(moveStrip(s, b, 5), true);
    assert.equal(b.channel, 2, 'it went up to the next free channel');
    assert.equal(b.start, 5);
    moveStrip(s, b, 40, 1);
    assert.equal(b.channel, 1);
    void a;
  });
  test('cutting: two strips that show the same frames as the one', () => {
    const s = seq();
    const a = addStrip(s, createStrip('MOVIE', { start: 10, length: 20, offset: 5 }));
    const right = cutStrip(s, a, 18);
    assert.equal(a.length, 8);
    assert.equal(right.start, 18);
    assert.equal(right.length, 12);
    assert.equal(stripFrame(right, 18), stripFrame({ start: 10, offset: 5 }, 18), 'the same source frame');
    assert.equal(cutStrip(s, a, 10), null, 'not at its very start');
    assert.equal(cutStrip(s, a, 100), null, 'not outside');
  });
  test('the higher channel covers the lower; opacity lets it through', () => {
    const s = seq();
    addStrip(s, red());
    const b = addStrip(s, blue());
    let out = compositeFrame(s, 5, 4, 4);
    assert.deepEqual(px(out, 4, 1, 1), [0, 0, 255]);
    b.opacity = 0.5;
    out = compositeFrame(s, 5, 4, 4);
    assert.deepEqual(px(out, 4, 1, 1), [128, 0, 128]);
  });
  test('add and multiply', () => {
    const s = seq();
    addStrip(s, createStrip('COLOR', { color: [0.5, 0.5, 0.5], start: 1, length: 5 }));
    const b = addStrip(s, createStrip('COLOR', { color: [0.25, 0.25, 0.25], start: 1, length: 5, channel: 2, blend: 'ADD' }));
    near(px(compositeFrame(s, 1, 2, 2), 2, 0, 0)[0], 128 + 64, 1);
    b.blend = 'MULTIPLY';
    near(px(compositeFrame(s, 1, 2, 2), 2, 0, 0)[0], 32, 1);
  });
  test('nothing there is black, and a muted strip is not there', () => {
    const s = seq();
    const a = addStrip(s, red());
    a.mute = true;
    assert.deepEqual(px(compositeFrame(s, 5, 2, 2), 2, 0, 0), [0, 0, 0]);
  });
  test('placement and scale: x moves it right, a small strip leaves black around', () => {
    const s = seq();
    addStrip(s, red({ scale: 0.5 }));
    const out = compositeFrame(s, 5, 8, 8);
    assert.deepEqual(px(out, 8, 4, 4), [255, 0, 0]);
    assert.deepEqual(px(out, 8, 0, 0), [0, 0, 0]);
    s.strips[0].x = 0.25;
    assert.deepEqual(px(compositeFrame(s, 5, 8, 8), 8, 2, 4), [0, 0, 0]);
    assert.deepEqual(px(compositeFrame(s, 5, 8, 8), 8, 6, 4), [255, 0, 0]);
  });
  test('a cross fades across the overlap, from one strip to the other', () => {
    const s = seq();
    const a = addStrip(s, red({ start: 1, length: 11 }));
    const b = addStrip(s, blue({ start: 6, length: 11 }));
    const cross = addTransition(s, a, b, 'CROSS');
    assert.equal(cross.start, 6);
    assert.equal(cross.length, 6);
    assert.equal(transitionFactor(cross, 6), 0);
    assert.equal(transitionFactor(cross, 11), 1);
    assert.deepEqual(px(compositeFrame(s, 3, 2, 2), 2, 0, 0), [255, 0, 0], 'before: only the first');
    assert.deepEqual(px(compositeFrame(s, 6, 2, 2), 2, 0, 0), [255, 0, 0], 'it starts at the first');
    const mid = px(compositeFrame(s, 8, 2, 2), 2, 0, 0);
    assert.ok(mid[0] > 80 && mid[0] < 200 && mid[2] > 60, `middle ${mid}`);
    assert.deepEqual(px(compositeFrame(s, 11, 2, 2), 2, 0, 0), [0, 0, 255], 'it ends at the second');
    assert.deepEqual(px(compositeFrame(s, 14, 2, 2), 2, 0, 0), [0, 0, 255], 'after: only the second');
  });
  test('a wipe has a hard edge moving left to right', () => {
    const s = seq();
    const a = addStrip(s, red({ start: 1, length: 11 }));
    const b = addStrip(s, blue({ start: 1, length: 11 }));
    addTransition(s, a, b, 'WIPE');
    const out = compositeFrame(s, 6, 10, 2);
    assert.deepEqual(px(out, 10, 1, 0), [0, 0, 255]);
    assert.deepEqual(px(out, 10, 8, 0), [255, 0, 0]);
  });
  test('no overlap in time, no transition', () => {
    const s = seq();
    const a = addStrip(s, red({ start: 1, length: 5 }));
    const b = addStrip(s, blue({ start: 10, length: 5 }));
    assert.equal(addTransition(s, a, b), null);
  });
  test('pictures come from the provider, with the strip\'s own frame', () => {
    const s = seq();
    addStrip(s, createStrip('IMAGE', { start: 10, length: 5, offset: 2 }));
    const asked = [];
    compositeFrame(s, 12, 2, 2, (strip, frame) => { asked.push(frame); return { width: 1, height: 1, rgba: new Uint8ClampedArray([0, 255, 0, 255]) }; });
    assert.deepEqual(asked, [4]);
    assert.deepEqual(px(compositeFrame(s, 12, 2, 2, () => ({ width: 1, height: 1, rgba: new Uint8ClampedArray([0, 255, 0, 255]) })), 2, 0, 0), [0, 255, 0]);
    assert.deepEqual(px(compositeFrame(s, 12, 2, 2, () => null), 2, 0, 0), [0, 0, 0], 'no picture yet: just black');
  });
  test('sound makes no picture', () => {
    const s = seq();
    addStrip(s, createStrip('SOUND', { start: 1, length: 5 }));
    assert.deepEqual(px(compositeFrame(s, 2, 2, 2), 2, 0, 0), [0, 0, 0]);
  });
});

describe('motion tracking', () => {
  /** A picture with a textured patch at (x, y), so correlation has something to hold on to. */
  const picture = (x, y, w = 96, h = 96, spots = [[x, y]]) => {
    const luma = new Float32Array(w * h).fill(40);
    for (const [cx, cy] of spots) {
      for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
        const [px, py] = [Math.round(cx) + i, Math.round(cy) + j];
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        luma[py * w + px] = 120 + ((i * 3 + j * 7) % 13) * 9 + (i === 0 ? 40 : 0) + (j > 0 ? 25 : 0);
      }
    }
    return { width: w, height: h, luma };
  };
  test('one step finds a patch that moved', () => {
    const hit = trackStep(picture(40, 40), picture(45, 37), 40, 40);
    near(hit.x, 45, 0.6);
    near(hit.y, 37, 0.6);
    assert.ok(hit.score > 0.95, `score ${hit.score}`);
  });
  test('following through frames keeps the path', () => {
    const frames = Array.from({ length: 20 }, (_, f) => picture(20 + f * 2, 30 + f));
    const track = createTrack('A', 0, 20, 30);
    const added = trackForward(track, (f) => frames[f], 0, 19);
    assert.equal(added, 19);
    near(track.points[19][0], 58, 1);
    near(track.points[19][1], 49, 1);
  });
  test('backward works too', () => {
    const frames = Array.from({ length: 10 }, (_, f) => picture(20 + f * 2, 30));
    const track = createTrack('A', 9, 38, 30);
    trackForward(track, (f) => frames[f], 9, 0);
    near(track.points[0][0], 20, 1);
  });
  test('a lost patch stops the track, rather than guessing', () => {
    const frames = [picture(30, 30), picture(31, 30), { width: 96, height: 96, luma: new Float32Array(96 * 96).fill(40) }];
    const track = createTrack('A', 0, 30, 30);
    assert.equal(trackForward(track, (f) => frames[f], 0, 2), 1);
    assert.equal(track.points[2], undefined);
  });
  test('stabilizing cancels the average movement', () => {
    const a = createTrack('A', 0, 10, 10);
    const b = createTrack('B', 0, 30, 10);
    a.points[1] = [13, 12];
    b.points[1] = [33, 12];
    assert.deepEqual(stabilizationOffsets([a, b], 0)[1], [-3, -2]);
    assert.deepEqual(stabilizationOffsets([a, b], 0)[0], [0, 0]);
  });
  // A rigid shape seen from a turning far camera: projected exactly, in pixels.
  const SHAPE = [[1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1], [0.3, 0.2, 1.6], [-0.4, 1.4, 0.2]];
  const syntheticTracks = (noise = 0) => {
    const tracks = SHAPE.map((_, i) => createTrack(`T${i}`, 0, 0, 0));
    let seed = 1;
    const jitter = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * noise; };
    for (let f = 0; f < 24; f++) {
      const [a, b] = [f * 0.05, 0.3 + f * 0.03];
      const [ca, sa, cb, sb] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)];
      SHAPE.forEach(([x, y, z], i) => {
        const x1 = ca * x + sa * z;
        const z1 = -sa * x + ca * z;
        const y1 = cb * y - sb * z1;
        tracks[i].points[f] = [320 + 50 * x1 + jitter() + f * 0.5, 240 - 50 * y1 + jitter()];
      });
    }
    return tracks;
  };
  const distances = (points) => { const out = []; for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) out.push(Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1], points[i][2] - points[j][2])); return out; };
  test('the solve explains exact tracks to a tiny error, and recovers the shape up to scale', () => {
    const solve = solveCamera(syntheticTracks());
    assert.ok(solve.error < 1e-6, `error ${solve.error}`);
    const [got, want] = [distances(solve.points), distances(SHAPE)];
    const k = want[0] / got[0];
    got.forEach((d, i) => near(d * k, want[i], 1e-5));
    assert.equal(solve.rotations.length, 24);
  });
  test('noisy tracks still solve, with an honest error', () => {
    const solve = solveCamera(syntheticTracks(1));
    assert.ok(solve.error > 0.05 && solve.error < 1, `error ${solve.error}`);
  });
  test('the rotations are real ones, and change as the camera turned', () => {
    const solve = solveCamera(syntheticTracks());
    for (const q of solve.rotations) near(Math.hypot(...q), 1, 1e-6);
    const dot = solve.rotations[0].reduce((s, x, i) => s + x * solve.rotations[23][i], 0);
    assert.ok(Math.abs(dot) < 0.999, 'the last differs from the first');
    assert.ok(Math.abs(solve.rotations[0][3]) > 0.999, 'the first camera defines the axes');
  });
  test('what cannot be solved says so', () => {
    assert.throws(() => solveCamera(syntheticTracks().slice(0, 3)), /at least 4 tracks/);
    const few = syntheticTracks().map((t) => ({ ...t, points: { 0: t.points[0], 1: t.points[1] } }));
    assert.throws(() => solveCamera(few), /at least 3 frames/);
    const flat = SHAPE.slice(0, 4).map((p, i) => { const t = createTrack(`F${i}`, 0, 0, 0); for (let f = 0; f < 5; f++) t.points[f] = [p[0] * 50 + f, p[1] * 50]; return t; });
    assert.throws(() => solveCamera(flat), /depth/);
  });
  test('the operator fills the scene with points and an animated camera', () => {
    const ctx = context();
    ctx.doc.clips = [{ id: 'c', name: 'Clip', kind: 'IMAGES', frames: [], width: 640, height: 480, start: 1, tracks: syntheticTracks() }];
    const before = ctx.doc.objects.length;
    run(ctx, 'clip.solve');
    assert.equal(ctx.doc.objects.length, before + SHAPE.length + 1);
    const camera = ctx.doc.objects.at(-1);
    assert.equal(camera.type, 'CAMERA');
    assert.equal(ctx.doc.activeCamera, camera.id);
    assert.ok(camera.anim.fcurves['rotation.0'].length === 24);
    assert.ok(ctx.doc.clips[0].solve.error < 1e-6);
    run(ctx, 'clip.solve');
    assert.equal(ctx.doc.objects.length, before + SHAPE.length + 1, 'solving again replaces');
  });
  test('Camera Solver, Object Solver and Follow Track constraints use the solve', async () => {
    const { addObject, createConstraint, defaultCamera, setFrame, solvedCameraMatrix, worldMatrix } = await import('../../src/core/doc.js');
    const ctx = context();
    const doc = ctx.doc;
    doc.clips = [{ id: 'c', name: 'Clip', kind: 'IMAGES', frames: [], width: 640, height: 480, start: 1, tracks: syntheticTracks() }];
    run(ctx, 'clip.solve');
    const clip = doc.clips[0];
    assert.equal(clip.solve.camera.length, 24, 'the camera path is kept with the clip');
    assert.equal(clip.solve.points.length, SHAPE.length);
    const solvedCamera = doc.objects.at(-1);
    // A second camera held only by the constraint stands where the keyed one does, at every frame and between.
    const held = addObject(doc, { type: 'CAMERA', name: 'Held', data: defaultCamera() });
    held.constraints = [{ ...createConstraint('CAMERA_SOLVER'), clip: 'c' }];
    for (const frame of [1, 7, 24]) {
      setFrame(doc, frame);
      const [a, b] = [worldMatrix(doc, held).elements, worldMatrix(doc, solvedCamera).elements];
      a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, `frame ${frame}, element ${i}: ${x} and ${b[i]}`));
    }
    const half = solvedCameraMatrix(clip, 7.5).elements;
    assert.ok(half.every(Number.isFinite), 'blended between frames');
    // Object Solver: with the solved camera as the scene camera, the object's motion undoes it, so it stays where it is put.
    const box = addObject(doc, { type: 'EMPTY', name: 'Box', location: [1, 2, 3], data: {} });
    box.constraints = [{ ...createConstraint('OBJECT_SOLVER'), clip: 'c', camera: solvedCamera.id }];
    for (const frame of [1, 12]) {
      setFrame(doc, frame);
      const e = worldMatrix(doc, box).elements;
      assert.deepEqual([e[12], e[13], e[14]].map((x) => +x.toFixed(4)), [1, 2, 3]);
    }
    // Follow Track in 3D is at the solved point, the same as the track's empty.
    const follower = addObject(doc, { type: 'EMPTY', name: 'Follower', data: {} });
    const name = clip.tracks[2].name;
    follower.constraints = [{ ...createConstraint('FOLLOW_TRACK'), clip: 'c', track: name, use3D: true }];
    const marker = doc.objects.find((o) => o.name === name);
    const [p, q] = [worldMatrix(doc, follower).elements, worldMatrix(doc, marker).elements];
    for (const i of [12, 13, 14]) assert.ok(Math.abs(p[i] - q[i]) < 1e-6);
    // On screen: the clip's centre seen by a camera at the origin looking down −Z is straight ahead, at the depth.
    const eye = addObject(doc, { type: 'CAMERA', name: 'Eye', data: defaultCamera() });
    clip.tracks[2].points[0] = [320, 240];
    follower.constraints = [{ ...createConstraint('FOLLOW_TRACK'), clip: 'c', track: name, camera: eye.id, depth: 4 }];
    setFrame(doc, 1);
    const at = worldMatrix(doc, follower).elements;
    assert.deepEqual([at[12], at[13], at[14]].map((x) => +x.toFixed(6) + 0), [0, 0, -4]);
    // A corner of the picture is at the edge of the camera's view: half the sensor over the lens, times the depth.
    clip.tracks[2].points[0] = [640, 0];
    setFrame(doc, 1);
    const corner = worldMatrix(doc, follower).elements;
    assert.ok(Math.abs(corner[12] - (4 * 18) / 50) < 1e-9 && Math.abs(corner[13] - ((4 * 18) / 50) * 0.75) < 1e-9);
  });
});

describe('OSL', () => {
  const G = { P: [0.25, 0.5, 0.75], N: [0, 0, 1], u: 0.2, v: 0.8 };
  const run1 = (source, values = {}) => compileOSL(source).run(values, G);
  test('parameters become inputs and outputs, with defaults', () => {
    const s = compileOSL('shader T(float a = 2, color c = color(1, 0, 0), vector v = vector(1, 2, 3), output color o = 0, output float f = 1) { }');
    assert.equal(s.name, 'T');
    assert.deepEqual(s.inputs.map((x) => [x.name, x.type]), [['a', 'float'], ['c', 'color'], ['v', 'vector']]);
    assert.deepEqual(s.inputs[1].def, [1, 0, 0]);
    assert.deepEqual(s.outputs.map((x) => x.name), ['o', 'f']);
  });
  test('arithmetic on numbers and triples', () => {
    const r = run1('shader T(output color a = 0, output float b = 0, output color c = 0, output float d = 0) { a = color(1, 2, 3) * 2 + 1; b = 2 * 3 + 4 / 2; c = color(1) - color(0.5, 0.25, 0); d = -b; }');
    assert.deepEqual(r.a, [3, 5, 7]);
    assert.equal(r.b, 8);
    assert.deepEqual(r.c, [0.5, 0.75, 1]);
    assert.equal(r.d, -8);
  });
  test('globals, components, functions', () => {
    const r = run1('shader T(output float a = 0, output float b = 0, output float c = 0, output float d = 0, output color e = 0) { a = P[1] + u; b = length(vector(3, 4, 0)); c = dot(N, vector(0, 0, 5)); d = mix(0, 10, 0.5); e = normalize(vector(0, 0, 9)); }');
    near(r.a, 0.7);
    assert.equal(r.b, 5);
    assert.equal(r.c, 5);
    assert.equal(r.d, 5);
    assert.deepEqual(r.e, [0, 0, 1]);
  });
  test('if, for, while, local variables, compound assignment', () => {
    const r = run1('shader T(float n = 4, output float sum = 0, output float w = 0, output float big = 0) { int i; for (i = 0; i < n; i++) { sum += i; } float k = 1; while (k < 100) k *= 2; w = k; if (sum > 5) big = 1; else big = 2; }');
    assert.equal(r.sum, 6);
    assert.equal(r.w, 128);
    assert.equal(r.big, 1);
  });
  test('an input value from outside wins over the default', () => {
    assert.equal(run1('shader T(float a = 1, output float o = 0) { o = a * 2; }', { a: 5 }).o, 10);
  });
  test('a float assigned to a colour spreads, a colour to a float averages', () => {
    const r = run1('shader T(output color c = 0, output float f = 0) { c = 0.5; f = color(0, 0.5, 1); }');
    assert.deepEqual(r.c, [0.5, 0.5, 0.5]);
    assert.equal(r.f, 0.5);
  });
  test('errors name the line, and are found when compiling', () => {
    assert.throws(() => compileOSL('shader T( { }'), /Line 1/);
    assert.throws(() => compileOSL('nonsense'), /starts with/);
    assert.throws(() => compileOSL('shader T(output float o = 0) { o = nosuch(1); }'), /Unknown function 'nosuch'/);
    assert.throws(() => run1('shader T(output float o = 0) { o = nosuch; }'), /Unknown name/);
    assert.throws(() => run1('shader T(output float o = 0) { while (1) o = 1; }'), /too long/);
    assert.match(oslShader('shader (').error, /Line 1/);
  });
  test('as a node: sockets from the source, and it drives a material', () => {
    const doc = createDocument();
    const mat = { ...defaultMaterial(), useNodes: true };
    mat.nodes = defaultShaderGraph(mat);
    doc.materials.push(mat);
    const script = createNode('SCRIPT_OSL', 0, 0);
    assert.equal(script.values.source, DEFAULT_OSL);
    const sockets = nodeSockets(script);
    assert.deepEqual(sockets.inputs.map((s) => [s.name, s.type]), [['Scale', 'VALUE'], ['Dark', 'COLOR'], ['Light', 'COLOR']]);
    assert.deepEqual(sockets.outputs.map((s) => [s.name, s.type]), [['Color', 'COLOR'], ['Fac', 'VALUE']]);
    mat.nodes.nodes.push(script);
    addLink(mat.nodes, script.id, 'Color', mat.nodes.nodes[0].id, 'Base Color');
    const at = (position) => evalShader(mat.nodes, { position, normal: [0, 0, 1], uv: [0, 0] }).baseColor;
    assert.notDeepEqual(at([0.05, 0.05, 0.05]), at([0.25, 0.05, 0.05]), 'the checker changes across cells');
    script.values.Scale = 1;
    assert.deepEqual(at([0.05, 0.05, 0.05]), at([0.25, 0.05, 0.05]), 'a socket value changes it');
  });
  test('a node with broken source gives nothing, not a crash', () => {
    const node = createNode('SCRIPT_OSL', 0, 0, { source: 'broken' });
    assert.deepEqual(nodeSockets(node), { inputs: [], outputs: [] });
  });
});

describe('icon colours', () => {
  test('every icon of the set has a colour of its own, as a CSS colour', async () => {
    const { ICON_TONES } = await import('../../src/ui/icon-tones.js');
    const source = (await import('node:fs')).readFileSync(new URL('../../src/ui/icons.js', import.meta.url), 'utf8');
    const names = [...source.matchAll(/'?([a-z][a-z0-9-]*)'?: (?:L|C|F|CUBE|GEAR)\(?/g)].map((m) => m[1]).filter((n) => !['d', 'x', 'y', 'r'].includes(n));
    assert.ok(names.length > 150, `${names.length} icons read`);
    const missing = names.filter((n) => !ICON_TONES[n]);
    assert.deepEqual(missing, [], 'icons without a colour');
    for (const tone of Object.values(ICON_TONES)) assert.match(tone, /^#[0-9a-f]{6}$/);
  });
});
