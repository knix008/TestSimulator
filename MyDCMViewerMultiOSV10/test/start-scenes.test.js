/* node --test — the 3D start-page scenes: ids, names, icons, and every scene's build() and draw()
 * run against a recording mock of the WebGL Kit (no GPU needed). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const START = path.join(__dirname, '..', 'src', 'js', 'start');
const load = (rel) => import(pathToFileURL(path.join(START, rel)).href);

const TONE = { dark: true, accent: [0.22, 0.74, 0.97], bg: [0.07, 0.07, 0.09], c: (rgb, k = 0.18) => rgb };
const CLOCKS = [0, 3.7, 120, 5000];

let mods;
test.before(async () => {
  const [scenes, ids, names, meshes] = await Promise.all([load('start3d/scenes.js'), load('startscenes.js'), load('sceneNames.js'), load('start3d/meshes.js')]);
  mods = { scenes, ids, names, meshes };
});

/** The build-time kit: uploads are counted, handles look like the real ones. */
function buildKit() {
  const meshes = [];
  const clouds = [];
  const released = [];
  return {
    meshes, clouds, released,
    mesh(builder) {
      assert.equal(builder.data.length % 13, 0, 'MeshBuilder stride');
      const handle = { buffer: { id: meshes.length }, count: builder.count };
      meshes.push(handle.count);
      return handle;
    },
    cloud(data) {
      assert.equal(data.length % 4, 0, 'seed cloud is 4 floats per point');
      const handle = { buffer: { id: `c${clouds.length}` }, count: data.length / 4 };
      clouds.push(handle.count);
      return handle;
    },
    release(item) { released.push(item); },
  };
}

/** The draw-time kit: a Proxy that records every method a scene calls. */
function drawKit() {
  const calls = [];
  const model = new Float32Array(16);
  const k = new Proxy({}, {
    get(_, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop === 'model') return model;
      if (prop === 'calls') return calls;
      return (...args) => {
        calls.push({ name: prop, args: args.map((a) => (ArrayBuffer.isView(a) ? Array.from(a) : a)) });
      };
    },
  });
  return { k, calls };
}

function walkNumbers(value, where, seen = new Set()) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${where}: ${value}`);
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (ArrayBuffer.isView(value)) { for (const v of value) assert.ok(Number.isFinite(v), `${where}: ${v}`); return; }
  for (const [key, v] of Object.entries(value)) walkNumbers(v, `${where}.${key}`, seen);
}

const rnd = (seed) => mods.meshes.rand(seed);

test('scene ids match the settings list, and each has names and an icon', () => {
  const { SCENE_IDS, sceneOf } = mods.scenes;
  const { START_SCENE_IDS, startSceneId } = mods.ids;
  const { SCENE_NAMES, SCENE_ICONS } = mods.names;
  assert.deepEqual(SCENE_IDS, START_SCENE_IDS);
  assert.ok(SCENE_IDS.length >= 12 && SCENE_IDS.length <= 20, `${SCENE_IDS.length} scenes`);
  assert.deepEqual(Object.keys(SCENE_NAMES).sort(), [...SCENE_IDS].sort());
  assert.deepEqual(Object.keys(SCENE_ICONS).sort(), [...SCENE_IDS].sort());
  for (const id of SCENE_IDS) {
    const n = SCENE_NAMES[id];
    assert.ok(typeof n.ko === 'string' && n.ko.trim(), `${id} ko`);
    assert.ok(typeof n.en === 'string' && n.en.trim(), `${id} en`);
    assert.ok(/[가-힣]/.test(n.ko), `${id} ko is Korean`);
    assert.ok(n.en.split(/\s+/).length <= 3, `${id} en is short`);
    const svg = SCENE_ICONS[id];
    assert.match(svg, /^<svg[^>]*viewBox="0 0 24 24"/, `${id} icon`);
    assert.match(svg, /stroke="currentColor"/);
    assert.match(svg, /fill="none"/);
    assert.match(svg, /<\/svg>$/);
  }
  assert.equal(sceneOf('no-such-scene'), sceneOf(SCENE_IDS[0]));
  assert.equal(startSceneId('no-such-scene'), SCENE_IDS[0]);
  assert.equal(startSceneId('radial'), SCENE_IDS[0]);
});

test('every scene builds non-empty meshes and releases them all', () => {
  const { SCENE_IDS, sceneOf, releaseScene } = mods.scenes;
  for (const id of SCENE_IDS) {
    const kit = buildKit();
    const state = sceneOf(id).build(kit, rnd(1234 + id.length));
    assert.ok(state && typeof state === 'object', `${id} state`);
    assert.ok(Number.isFinite(state.phase), `${id} phase`);
    assert.ok(kit.meshes.some((n) => n > 0), `${id} built a visible mesh`);
    assert.ok(kit.meshes.every((n) => n > 0), `${id} has no empty mesh: ${kit.meshes}`);
    assert.ok(kit.meshes.every((n) => n % 3 === 0), `${id} whole triangles`);
    const verts = kit.meshes.reduce((a, b) => a + b, 0);
    assert.ok(verts < 400000, `${id} is not too heavy: ${verts} vertices`);
    releaseScene(kit, state);
    assert.equal(kit.released.length, kit.meshes.length + kit.clouds.length, `${id} releases every buffer`);
  }
});

test('every scene draws a finite, visible frame with the camera outside the world', () => {
  const { SCENE_IDS, sceneOf } = mods.scenes;
  const VISIBLE = new Set(['solid', 'points', 'terrain']);
  for (const id of SCENE_IDS) {
    const scene = sceneOf(id);
    const state = scene.build(buildKit(), rnd(99 + id.charCodeAt(0)));
    for (const c of CLOCKS) {
      for (const clock of [{ camera: c, objects: c, sky: c }, { camera: c, objects: c * 0.37, sky: c * 2.1 }]) {
        const where = `${id} @ ${JSON.stringify(clock)}`;
        const { k, calls } = drawKit();
        scene.draw(k, state, clock, TONE);
        const cams = calls.filter((x) => x.name === 'camera');
        assert.equal(cams.length, 1, `${where}: one camera() per frame`);
        const [eye, target] = cams[0].args;
        assert.equal(eye.length, 3);
        assert.equal(target.length, 3);
        walkNumbers(eye, `${where} eye`);
        walkNumbers(target, `${where} target`);
        assert.ok(Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]) > 0.5, `${where}: eye is not on its target`);
        assert.ok(Math.hypot(...eye) > 0.5, `${where}: eye is away from the scene centre`);
        assert.ok(eye[1] > -1, `${where}: eye is above the floor (${eye[1]})`);
        assert.ok(calls.some((x) => x.name === 'begin'), `${where}: begin()`);
        assert.ok(calls.some((x) => x.name === 'sky'), `${where}: sky()`);
        const drawn = calls.filter((x) => VISIBLE.has(x.name) && (x.name === 'terrain' || x.args[0]?.count > 0));
        assert.ok(drawn.some((x) => x.name === 'solid' && x.args[0].count > 0), `${where}: a solid mesh is drawn`);
        assert.ok(drawn.length >= 2, `${where}: something visible is drawn`);
        assert.equal(calls.filter((x) => x.name === 'beginMirror').length, calls.filter((x) => x.name === 'endMirror').length, `${where}: mirror pass closed`);
        calls.forEach((x, i) => walkNumbers(x.args, `${where} #${i} ${x.name}`));
      }
    }
  }
});
