// Start page 3D backgrounds: every scene builds and draws, speeds per clock,
// terrain heights the camera relies on, and the settings that hold them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize } from '../../src/settings.js';
import { gridArrays, MeshBuilder, pine, rand, seeds, solid, SOLID_KINDS, STRIDE, stripArrays } from '../../src/ui/start3d/meshes.js';
import { SCENE_IDS, sceneOf } from '../../src/ui/start3d/scenes.js';
import { groundUnder, hash12, TERRAIN, terrainHeight } from '../../src/ui/start3d/terrain.js';
import { CHANNEL_MAX, channelPercent, START_SCENE_IDS, START_SPEED_CHANNELS, startIsStill, startRates, startSpeedPercent } from '../../src/ui/startscenes.js';

const finite = (value, where) => {
  const list = typeof value === 'number' ? [value] : Array.from(value ?? []);
  for (const v of list) assert.ok(Number.isFinite(v), `${where}: ${v}`);
};

/** A kit that records what a scene draws and checks every number it is given. */
function mockKit() {
  const calls = [];
  const check = (kind, u = {}) => {
    for (const [key, value] of Object.entries(u)) if (value != null && typeof value !== 'boolean') finite(value, `${kind}.${key}`);
    calls.push(kind);
  };
  const buffer = (count) => ({ buffer: {}, count });
  return {
    calls,
    vp: new Float32Array(16),
    model: new Float32Array(16),
    eye: [0, 0, 0],
    indexed: ({ idx }) => buffer(idx.length),
    mesh: (b) => {
      finite(b.floats(), 'mesh');
      return buffer(b.count);
    },
    cloud: (d) => buffer(d.length / 4),
    camera(eye, target, opts = {}) {
      finite(eye, 'eye'); finite(target, 'target');
      if (opts.roll != null) finite(opts.roll, 'roll');
      this.eye = eye;
      calls.push('camera');
    },
    begin: (c) => check('begin', { c }),
    sky: (u) => check('sky', u),
    terrain: (t, u) => check('terrain', { ...u, amp: t.amp ?? 0 }),
    water: (u) => check('water', u),
    solid: (g, u) => check('solid', u),
    points: (cl, u) => check('points', u),
    ribbon: (u) => check('ribbon', u),
    beginMirror: () => calls.push('mirror'),
    endMirror: () => calls.push('/mirror'),
  };
}

// features: APP-STARTBG
test('APP-STARTBG: every start scene is a 3D scene that builds and draws', () => {
  assert.deepEqual([...SCENE_IDS].sort(), [...START_SCENE_IDS].sort(), 'one 3D scene per background');
  assert.equal(START_SCENE_IDS.length, 22);
  for (const id of START_SCENE_IDS) {
    const kit = mockKit();
    const state = sceneOf(id).build(kit, rand(7));
    for (const clock of [{ camera: 0, objects: 0, sky: 0, step: 0 }, { camera: 123.4, objects: 56.7, sky: 890.1, step: 0.02 }, { camera: 5000, objects: 7000, sky: 9000, step: 0.05 }]) {
      kit.calls.length = 0;
      sceneOf(id).draw(kit, state, clock, { dark: true, accent: [0.3, 0.55, 1], bg: [0.1, 0.1, 0.12], c: (rgb) => rgb });
      sceneOf(id).draw(kit, state, clock, { dark: false, accent: [0.9, 0.4, 0.2], bg: [0.95, 0.95, 0.96], c: (rgb) => rgb });
      assert.ok(kit.calls.includes('camera'), `${id} places a camera`);
      assert.ok(kit.calls.length > 2, `${id} draws something`);
      assert.equal(kit.calls.filter((c) => c === 'mirror').length, kit.calls.filter((c) => c === '/mirror').length, `${id} closes its mirror pass`);
    }
  }
});

test('APP-STARTBG: the camera clock moves the viewer, the object and sky clocks do not', () => {
  for (const id of ['valley', 'ocean', 'mountains', 'city', 'forest', 'grid']) {
    const eyes = [];
    const kit = mockKit();
    const scene = sceneOf(id);
    const state = scene.build(kit, rand(3));
    const tone = { dark: true, accent: [0.3, 0.55, 1], bg: [0, 0, 0], c: (rgb) => rgb };
    for (const clock of [{ camera: 10, objects: 0, sky: 0, step: 0 }, { camera: 10, objects: 50, sky: 50, step: 0 }, { camera: 60, objects: 0, sky: 0, step: 0 }]) {
      delete state.alt;
      scene.draw(kit, state, clock, tone);
      eyes.push(kit.eye.map((v) => Math.round(v * 1000) / 1000));
    }
    assert.deepEqual(eyes[0], eyes[1], `${id}: objects and sky leave the camera alone`);
    assert.notDeepEqual(eyes[0], eyes[2], `${id}: the camera clock moves the camera`);
  }
});

test('APP-STARTBG: overall and per-clock speeds', () => {
  assert.deepEqual(startRates({ motion: 20 }), { camera: 1, objects: 1, sky: 1 }, '20% plays the designed pace');
  assert.deepEqual(startRates({ motion: 100, cameraSpeed: 0, objectSpeed: 300, skySpeed: 50 }), { camera: 0, objects: 15, sky: 2.5 });
  assert.equal(startIsStill(startRates({ motion: 0 })), true);
  assert.equal(startIsStill(startRates({ motion: 40, cameraSpeed: 0, objectSpeed: 0, skySpeed: 0 })), true);
  assert.equal(startIsStill(startRates({ motion: 40, cameraSpeed: 0, objectSpeed: 0, skySpeed: 10 })), false);
  assert.equal(startSpeedPercent('fast'), 100, 'older names still load');
  assert.equal(startSpeedPercent('off'), 0);
  assert.equal(channelPercent(undefined), 100);
  assert.equal(channelPercent(999), CHANNEL_MAX);
  assert.equal(channelPercent(-5), 0);
  assert.deepEqual(START_SPEED_CHANNELS.map((c) => c.id), ['camera', 'objects', 'sky']);
});

test('APP-STARTBG: settings keep every speed in range', () => {
  const fresh = normalize(null).startScreen;
  assert.deepEqual(fresh, { scene: 'valley', motion: 20, cameraSpeed: 100, objectSpeed: 100, skySpeed: 100 });
  const old = normalize({ startScreen: { scene: 'ocean', motion: 'medium' } }).startScreen;
  assert.deepEqual(old, { scene: 'ocean', motion: 55, cameraSpeed: 100, objectSpeed: 100, skySpeed: 100 }, 'settings from before the clocks');
  const wild = normalize({ startScreen: { motion: 400, cameraSpeed: 1000, objectSpeed: -3, skySpeed: 42.4 } }).startScreen;
  assert.deepEqual([wild.motion, wild.cameraSpeed, wild.objectSpeed, wild.skySpeed], [100, CHANNEL_MAX, 0, 42]);
});

test('APP-STARTBG: terrain heights are repeatable and the flying cameras clear them', () => {
  assert.ok(hash12(3, 4) >= 0 && hash12(3, 4) < 1);
  assert.equal(hash12(-17.5, 220), hash12(-17.5, 220));
  for (const mode of Object.values(TERRAIN)) {
    const t = { mode, amp: 30, freq: 0.01, seed: [12.3, 4.5], shape: mode === TERRAIN.basin ? [0, 0, 40, 120] : [380, 600, 70, 0] };
    for (let i = 0; i < 50; i++) {
      const x = (i * 37.7) % 900 - 450;
      const z = (i * 91.3) % 900 - 450;
      const h = terrainHeight(t, x, z);
      assert.ok(Number.isFinite(h), `mode ${mode}`);
      assert.ok(groundUnder(t, x, z, 20) >= h, 'the highest ground around a point is at least the point');
    }
  }
  assert.equal(terrainHeight({ mode: TERRAIN.flat }, 10, 10), 0);
  const channel = { mode: TERRAIN.channel, amp: 45, freq: 0.015, seed: [1, 2], shape: [1500, 16, 70, 0] };
  assert.equal(terrainHeight(channel, 1500, 0), 0, 'the grid road is flat');
});

test('APP-STARTBG: meshes are whole triangles with finite numbers', () => {
  const b = new MeshBuilder();
  pine(b, 1, 2, 8, [0.1, 0.3, 0.1], [0.3, 0.2, 0.1], rand(1), { snow: [1, 1, 1] });
  for (const kind of SOLID_KINDS) solid(b, kind, [1, 1, 1], rand(2));
  const data = b.floats();
  assert.equal(data.length % (STRIDE * 3), 0);
  finite(data, 'mesh');
  const grid = gridArrays(161);
  assert.ok(grid.idx.reduce((m, v) => Math.max(m, v), 0) < 65536, '16-bit indices');
  assert.equal(stripArrays(240, 2).idx.length, 239 * 6);
  assert.equal(seeds(10, 1).length, 40);
});
