// Photo rendering, the parts that need no GPU: environment presets, settings, resolutions, the material
// mapping (engineering material → physically based parameters) and the sample sequences (pixel jitter,
// aperture / sun disc, sky hemisphere), the tone curve and the running mean.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENV_PRESETS, ENV_IDS, RESOLUTIONS, DEFAULT_RENDER, normalizeRenderSettings, resolveResolution, materialClass, pbrFor,
  halton, pixelJitter, diskSample, hemisphereSample, dirOf, aces, accumulate,
} from '../../src/view/render.js';
import { MATERIALS } from '../../src/cad/materials.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const hex = /^#[0-9a-f]{6}$/i;

test('environment presets are complete and Z up (the sun above the horizon)', () => {
  assert.deepEqual(ENV_IDS, ['studio', 'sunset', 'overcast', 'daylight', 'night']);
  for (const id of ENV_IDS) {
    const p = ENV_PRESETS[id];
    for (const k of ['zenith', 'horizon', 'ground', 'floor']) assert.match(p[k], hex, `${id}.${k}`);
    assert.ok(p.sun.el > 0 && p.sun.el < 90 && p.sun.intensity > 0 && p.sun.radius > 0, id);
    assert.ok(dirOf(p.sun.az, p.sun.el)[2] > 0, `${id} sun is above (+Z)`);
    assert.ok(p.panels.length >= 1 && p.panels.every((x) => x.intensity > 0 && x.size > 0), id);
    assert.ok(p.exposure > 0 && p.sky >= 0);
  }
});

test('settings are normalised; resolutions follow the choice and the GPU limit', () => {
  assert.deepEqual(normalizeRenderSettings({}), { ...DEFAULT_RENDER, focus: 0 });
  const s = normalizeRenderSettings({ env: 'nope', resolution: 'x', samples: 1e9, ground: 'lava', background: 'pink', dof: 1, aperture: -3, sunIntensity: 99 });
  assert.equal(s.env, 'studio'); assert.equal(s.resolution, 'hd'); assert.equal(s.samples, 4096);
  assert.equal(s.ground, 'shadow'); assert.equal(s.background, 'env'); assert.equal(s.dof, true);
  assert.equal(s.aperture, 0); assert.equal(s.sunIntensity, 10);
  assert.deepEqual(resolveResolution('fhd', 800, 600), { width: 1920, height: 1080 });
  assert.deepEqual(resolveResolution('view', 812.4, 533.6), { width: 812, height: 534 });
  assert.deepEqual(resolveResolution('qhd', 0, 0, 2048), { width: 2048, height: 1152 });
  assert.deepEqual(Object.keys(RESOLUTIONS), ['view', 'hd', 'fhd', 'qhd', 'square']);
});

test('every engineering material maps to a look class and sane PBR values', () => {
  const classes = new Set();
  for (const m of MATERIALS) {
    const p = pbrFor(m.id);
    classes.add(p.class);
    assert.equal(p.class, materialClass(m.id));
    for (const k of ['metalness', 'roughness', 'clearcoat', 'transmission', 'sheen']) assert.ok(p[k] >= 0 && p[k] <= 1, `${m.id}.${k}`);
    assert.ok(p.ior >= 1 && p.ior <= 2.5);
    assert.equal(p.color, m.color);
  }
  assert.deepEqual([...classes].sort(), ['clearPlastic', 'glass', 'metal', 'plastic', 'rubber', 'wood']);
  // Metals are metallic, the steels rougher than stainless; glass transmits, rubber is matte.
  assert.equal(pbrFor('steel-1020').metalness, 1);
  assert.ok(pbrFor('stainless-304').roughness < pbrFor('cast-iron').roughness);
  assert.equal(pbrFor('glass').transmission, 1); assert.ok(pbrFor('glass').roughness < 0.05);
  assert.ok(pbrFor('rubber').roughness > 0.9 && pbrFor('rubber').metalness === 0);
  assert.equal(pbrFor('abs').metalness, 0);
  // A part's own colour (a cable's colour) wins.
  assert.equal(pbrFor('rubber', '#d23c3c').color, '#d23c3c');
});

test('sample sequences: Halton, pixel jitter, discs and the hemisphere', () => {
  near(halton(0, 2), 0.5); near(halton(1, 2), 0.25); near(halton(2, 2), 0.75); near(halton(0, 3), 1 / 3);
  assert.deepEqual(pixelJitter(0), [0, 0]);
  let sx = 0; let sy = 0; const n = 256;
  for (let i = 1; i <= n; i++) {
    const [x, y] = pixelJitter(i);
    assert.ok(Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5);
    sx += x; sy += y;
  }
  assert.ok(Math.abs(sx / n) < 0.02 && Math.abs(sy / n) < 0.02, 'jitter is centred');
  let inner = 0;
  for (let i = 0; i < 400; i++) {
    const [x, y] = diskSample(i);
    const r = Math.hypot(x, y);
    assert.ok(r <= 1 + 1e-12);
    if (r < Math.SQRT1_2) inner += 1;
    const h = hemisphereSample(i);
    near(Math.hypot(...h), 1, 1e-9);
    assert.ok(h[2] >= 0, 'upper hemisphere (+Z)');
  }
  // Uniform over the area: half of the points within r = 1/√2.
  assert.ok(Math.abs(inner / 400 - 0.5) < 0.05, `${inner}`);
  const d = dirOf(90, 0); near(d[0], 0, 1e-12); near(d[1], 1); near(dirOf(0, 90)[2], 1);
});

test('tone curve and running mean', () => {
  assert.equal(aces(0), 0);
  assert.ok(aces(0.18) > 0.18 * 0.9 && aces(0.18) < 0.3);
  assert.equal(aces(100), 1);
  let m = 0;
  const values = [1, 3, 5, 7];
  values.forEach((v, i) => { m = accumulate(m, v, i); });
  near(m, 4);
});
