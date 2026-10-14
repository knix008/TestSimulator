// Advanced editor algorithms: equalizers, dehaze, lens / perspective, masks, effects, blend modes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAdjustments } from '../../src/edit/adjust.js';
import {
  applyEffect, applyMasked, BLEND_MODES, blendLayer, brushMask, cloneStamp, colorEq, dehaze, EFFECTS, effectParams, gradientMask,
  lensCorrect, lightEq, perspective, radialMask, skinSmooth, splitTone, tiltShift, whiteBalanceFromPixel,
} from '../../src/edit/advanced.js';

const image = (w, h, fill) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const [r, g, b, a = 255] = fill(i % w, Math.floor(i / w)); data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a; }
  return { width: w, height: h, data };
};
const solid = (r, g, b, w = 4, h = 4) => image(w, h, () => [r, g, b]);
const clone = (img) => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) });
const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const std = (img) => {
  let s = 0; let s2 = 0; const n = img.data.length / 4;
  for (let i = 0; i < img.data.length; i += 4) { const l = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; s += l; s2 += l * l; }
  return Math.sqrt(s2 / n - (s / n) ** 2);
};
const hueOf = ([r, g, b]) => {
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
// Colourful, textured test picture (gradients + bright patch + checker detail).
const scene = (w = 64, h = 48) => image(w, h, (x, y) => {
  const check = ((x >> 2) + (y >> 2)) % 2 ? 30 : -30;
  if (x > w * 0.7 && y < h * 0.3) return [250, 245, 235];
  return [(x / w) * 220 + check + 20, (y / h) * 200 + 20, ((x + y) / (w + h)) * 180 + 40 - check];
});

// features: EDIT-COLOREQ
test('colorEq: red band moves red hues only; greys never change', () => {
  const red = solid(255, 0, 0);
  const blue = solid(0, 0, 255);
  colorEq(red, { red: { hue: 30 } });
  colorEq(blue, { red: { hue: 30, saturation: -100, lightness: 50 } });
  const h = hueOf(px(red, 0, 0));
  assert.ok(h > 20 && h < 40, `red hue shifted to ${h}`);
  assert.deepEqual(px(blue, 0, 0), [0, 0, 255, 255], 'blue untouched by the red band');
  const grey = solid(128, 128, 128);
  colorEq(grey, Object.fromEntries(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'].map((k) => [k, { saturation: 100, hue: 90 }])));
  assert.deepEqual(px(grey, 0, 0), [128, 128, 128, 255]);
  // Desaturating greens greys a green pixel; a weakly saturated pixel moves less.
  const green = solid(40, 200, 40);
  colorEq(green, { green: { saturation: -100 } });
  const [r, g, b] = px(green, 0, 0);
  assert.ok(Math.abs(r - g) < 3 && Math.abs(g - b) < 3);
  const strong = solid(220, 40, 40);
  const weak = solid(140, 120, 120);
  colorEq(strong, { red: { lightness: 60 } });
  colorEq(weak, { red: { lightness: 60 } });
  assert.ok(px(strong, 0, 0)[1] - 40 > px(weak, 0, 0)[1] - 120);
  // Between orange (30°) and yellow (60°): a 45° pixel gets half of the orange shift.
  const between = solid(255, 191, 0); // ≈ 45°
  colorEq(between, { orange: { hue: 20 } });
  const h2 = hueOf(px(between, 0, 0));
  assert.ok(h2 > 50 && h2 < 60, `blended shift → ${h2}`);
});

// features: EDIT-LIGHTEQ
test('lightEq: shadow band lifts darks, leaves highlights; colour preserved', () => {
  const dark = solid(24, 12, 6);
  const bright = solid(230, 220, 210);
  const bands = [100, 0, 0, 0, 0, 0, 0, 0, 0];
  lightEq(dark, bands);
  lightEq(bright, bands);
  const d = px(dark, 0, 0);
  assert.ok(d[0] > 30, `dark lifted ${d}`);
  assert.ok(Math.abs(d[0] / d[1] - 2) < 0.15, 'channel ratio kept');
  assert.deepEqual(px(bright, 0, 0), [230, 220, 210, 255]);
  const mid = solid(128, 128, 128);
  lightEq(mid, [0, 0, 0, 0, -100, 0, 0, 0, 0]);
  assert.ok(px(mid, 0, 0)[0] < 90);
  const same = solid(50, 60, 70);
  lightEq(same, []);
  assert.deepEqual(px(same, 0, 0), [50, 60, 70, 255]);
});

// features: EDIT-SPLIT
test('splitTone: warm highlights, cool shadows, black stays black', () => {
  const light = solid(200, 200, 200);
  const shadow = solid(50, 50, 50);
  const black = solid(0, 0, 0);
  const opts = { highlightHue: 40, highlightSat: 80, shadowHue: 220, shadowSat: 80, balance: 0 };
  splitTone(light, opts); splitTone(shadow, opts); splitTone(black, opts);
  const l = px(light, 0, 0); const s = px(shadow, 0, 0);
  assert.ok(l[0] > l[2] + 10, `highlight warm ${l}`);
  assert.ok(s[2] > s[0] + 10, `shadow cool ${s}`);
  assert.deepEqual(px(black, 0, 0), [0, 0, 0, 255]);
});

// features: EDIT-DEHAZE
test('dehaze raises contrast of a hazy picture; negative adds haze', () => {
  const clear = scene(80, 60);
  const hazy = clone(clear);
  for (let i = 0; i < hazy.data.length; i += 4) for (let c = 0; c < 3; c++) hazy.data[i + c] = hazy.data[i + c] * 0.45 + 215 * 0.55;
  const before = std(hazy);
  dehaze(hazy, 80);
  assert.ok(std(hazy) > before * 1.4, `${std(hazy)} vs ${before}`);
  assert.ok(!Array.from(hazy.data).some(Number.isNaN));
  const fog = clone(clear);
  dehaze(fog, -80);
  assert.ok(std(fog) < std(clear));
  const untouched = clone(clear);
  dehaze(untouched, 0);
  assert.deepEqual(untouched.data, clear.data);
});

// features: EDIT-WBPICK
test('whiteBalanceFromPixel neutralises the picked colour through applyAdjustments', () => {
  for (const [r, g, b] of [[180, 160, 140], [120, 130, 160], [150, 170, 150], [200, 180, 190], [90, 100, 80]]) {
    const wb = whiteBalanceFromPixel(r, g, b);
    assert.ok(Math.abs(wb.temperature) <= 100 && Math.abs(wb.tint) <= 100);
    const out = applyAdjustments(solid(r, g, b, 1, 1), wb);
    const [nr, ng, nb] = px(out, 0, 0);
    assert.ok(Math.abs(nr - ng) <= 3 && Math.abs(nr - nb) <= 3 && Math.abs(ng - nb) <= 3, `${[r, g, b]} → ${[nr, ng, nb]} with ${JSON.stringify(wb)}`);
  }
  assert.deepEqual(whiteBalanceFromPixel(128, 128, 128), { temperature: 0, tint: 0 });
  const extreme = whiteBalanceFromPixel(255, 0, 0);
  assert.equal(extreme.temperature, -100);
});

// features: EDIT-SKIN
test('skinSmooth smooths skin texture but leaves non-skin alone', () => {
  const skin = image(48, 48, (x, y) => { const n = ((x * 7 + y * 13) % 5) * 6; return [205 + n - 12, 150 + n - 12, 125 + n - 12]; });
  const sky = image(48, 48, (x, y) => { const n = ((x * 7 + y * 13) % 5) * 6; return [60 + n, 120 + n, 220 + n - 24]; });
  const before = std(skin);
  skinSmooth(skin, 100);
  assert.ok(std(skin) < before * 0.6, `${std(skin)} vs ${before}`);
  const skyBefore = clone(sky);
  skinSmooth(sky, 100);
  let diff = 0;
  for (let i = 0; i < sky.data.length; i++) diff = Math.max(diff, Math.abs(sky.data[i] - skyBefore.data[i]));
  assert.ok(diff <= 2, `sky changed by ${diff}`);
});

// features: EDIT-LENS EDIT-PERSPECTIVE
test('lensCorrect and perspective: neutral = identity, corrections keep the frame filled', () => {
  const img = scene();
  const same = lensCorrect(img, {});
  assert.notEqual(same, img);
  assert.deepEqual(same.data, img.data);
  assert.deepEqual(perspective(img, {}).data, img.data);
  assert.deepEqual(perspective(img, { vertical: 0, horizontal: 0, rotate: 0, scale: 100 }).data, img.data);
  for (const opts of [{ distortion: 60 }, { distortion: -60 }, { chromatic: 80 }]) {
    const out = lensCorrect(img, opts);
    assert.equal(out.width, img.width);
    assert.equal(px(out, 0, 0)[3], 255, 'no empty corner');
    assert.notDeepEqual(out.data, img.data);
  }
  // Barrel correction pulls the edge midpoints outward → the centre region grows.
  const v = lensCorrect(solid(100, 100, 100, 32, 32), { vignette: 100 });
  assert.ok(px(v, 0, 0)[0] > 180 && px(v, 16, 16)[0] < 105);
  for (const opts of [{ vertical: 60 }, { horizontal: -50 }, { rotate: 8 }, { vertical: -40, horizontal: 30, rotate: -5 }]) {
    const out = perspective(img, opts);
    for (const [x, y] of [[0, 0], [63, 0], [0, 47], [63, 47]]) assert.equal(px(out, x, y)[3], 255, `${JSON.stringify(opts)} corner ${x},${y} filled`);
    assert.notDeepEqual(out.data, img.data);
  }
  const loose = perspective(img, { vertical: 60, autoCrop: false });
  assert.ok([[0, 0], [63, 0], [0, 47], [63, 47]].some(([x, y]) => px(loose, x, y)[3] === 0), 'without auto-crop the borders are empty');
});

// features: EDIT-TILTSHIFT
test('tiltShift keeps the band sharp and blurs outside', () => {
  const stripes = image(60, 60, (x) => (x % 2 ? [255, 255, 255] : [0, 0, 0]));
  tiltShift(stripes, { position: 0.5, width: 0.2, blur: 100, angle: 0, feather: 0.1 });
  assert.ok(Math.abs(px(stripes, 10, 30)[0] - px(stripes, 11, 30)[0]) > 200, 'centre sharp');
  assert.ok(Math.abs(px(stripes, 10, 2)[0] - px(stripes, 11, 2)[0]) < 60, 'top blurred');
});

// features: EDIT-CLONE
test('cloneStamp copies the source spot with a soft edge', () => {
  const img = image(40, 20, (x) => (x < 20 ? [200, 50, 50] : [20, 20, 220]));
  cloneStamp(img, { x: 30, y: 10, sx: 10, sy: 10, radius: 6, hardness: 0.5, opacity: 1 });
  assert.deepEqual(px(img, 30, 10), [200, 50, 50, 255], 'centre copied');
  assert.deepEqual(px(img, 30, 2), [20, 20, 220, 255], 'outside untouched');
  const edge = px(img, 35, 10);
  assert.ok(edge[0] > 20 && edge[0] < 200, 'soft rim');
  const half = image(40, 20, (x) => (x < 20 ? [200, 200, 200] : [0, 0, 0]));
  cloneStamp(half, { x: 30, y: 10, sx: 10, sy: 10, radius: 6, hardness: 0.9, opacity: 0.5 });
  assert.equal(px(half, 30, 10)[0], 100);
});

// features: EDIT-LOCAL
test('masks: gradient, radial, brush, and masked application', () => {
  const g = gradientMask(100, 10, { x1: 10, y1: 5, x2: 90, y2: 5 });
  assert.equal(g[5 * 100 + 10], 1);
  assert.equal(g[5 * 100 + 90], 0);
  assert.equal(g[0], 1);
  assert.ok(Math.abs(g[50] - 0.5) < 0.01);
  const r = radialMask(100, 100, { cx: 50, cy: 50, rx: 40, ry: 20, feather: 50 });
  assert.equal(r[50 * 100 + 50], 1);
  assert.equal(r[50 * 100 + 95], 0);
  assert.equal(r[20 * 100 + 50], 0, 'outside short radius');
  assert.ok(r[50 * 100 + 80] > 0 && r[50 * 100 + 80] < 1, 'feathered');
  const inv = radialMask(100, 100, { cx: 50, cy: 50, rx: 40, ry: 20, invert: true });
  assert.equal(inv[50 * 100 + 50], 0);
  const turned = radialMask(100, 100, { cx: 50, cy: 50, rx: 40, ry: 10, angle: 90, feather: 0 });
  assert.equal(turned[15 * 100 + 50], 1);
  assert.equal(turned[50 * 100 + 85], 0);
  const b = brushMask(50, 50, [{ points: [[10, 10], [40, 10]], radius: 5, hardness: 0.5 }, { points: [[25, 10]], radius: 3, hardness: 1, erase: true }]);
  assert.equal(b[10 * 50 + 15], 1);
  assert.equal(b[10 * 50 + 25], 0, 'erased');
  assert.equal(b[30 * 50 + 15], 0);
  assert.ok(b[14 * 50 + 15] > 0 && b[14 * 50 + 15] < 1);
  const img = solid(100, 100, 100, 3, 1);
  applyMasked(img, Float32Array.from([0, 0.5, 1]), (copy) => { copy.data.fill(200); });
  assert.deepEqual([img.data[0], img.data[4], img.data[8]], [100, 150, 200]);
  const viaReturn = solid(10, 10, 10, 2, 1);
  applyMasked(viaReturn, Float32Array.from([1, 0]), (copy) => solid(250, 250, 250, copy.width, copy.height));
  assert.deepEqual([viaReturn.data[0], viaReturn.data[4]], [250, 10]);
});

// features: EDIT-EFFECTS
test('every effect runs on 64×48, changes the image, stays finite and deterministic', () => {
  const ids = Object.keys(EFFECTS);
  assert.ok(ids.length >= 22);
  for (const id of ids) {
    const spec = EFFECTS[id];
    for (const [key, p] of Object.entries(spec.params)) assert.ok(p.min <= p.default && p.default <= p.max, `${id}.${key}`);
    const src = scene();
    const out = applyEffect(clone(src), id, {});
    assert.ok(!Array.from(out.data).some((v) => Number.isNaN(v)), `${id} NaN`);
    assert.notDeepEqual(out.data, src.data, `${id} changed nothing`);
    for (let i = 3; i < out.data.length; i += 4) assert.equal(out.data[i], 255, `${id} alpha`);
    assert.deepEqual(applyEffect(clone(src), id, {}).data, out.data, `${id} deterministic`);
    const scaled = applyEffect(clone(src), id, {}, 0.25);
    assert.ok(!Array.from(scaled.data).some((v) => Number.isNaN(v)), `${id} scaled`);
  }
  assert.throws(() => applyEffect(scene(), 'nope'));
  assert.deepEqual(effectParams('posterize', { levels: 99 }), { levels: 16 });
  const poster = applyEffect(scene(), 'posterize', { levels: 2 });
  assert.ok(Array.from(poster.data).every((v) => v === 0 || v === 255));
  const bw = applyEffect(scene(), 'threshold', { level: 128 });
  assert.ok(Array.from(bw.data).every((v) => v === 0 || v === 255));
  const seedA = applyEffect(scene(), 'oldPhoto', { seed: 1 });
  const seedB = applyEffect(scene(), 'oldPhoto', { seed: 2 });
  assert.notDeepEqual(seedA.data, seedB.data);
});

// features: EDIT-LAYERS
test('blend modes: known values, opacity, alpha, position and scale', () => {
  const one = (mode, b, s, opts = {}) => px(blendLayer(solid(b, b, b, 1, 1), solid(s, s, s, 1, 1), { mode, ...opts }), 0, 0)[0];
  assert.equal(one('multiply', 128, 128), 64);
  assert.equal(one('screen', 128, 128), 192);
  assert.equal(one('normal', 10, 200), 200);
  assert.equal(one('darken', 100, 50), 50);
  assert.equal(one('lighten', 100, 50), 100);
  assert.equal(one('difference', 200, 50), 150);
  assert.equal(one('exclusion', 255, 255), 0);
  assert.equal(one('overlay', 64, 255), 128);
  assert.equal(one('hardLight', 255, 64), 128);
  assert.equal(one('colorDodge', 128, 128), 255);
  assert.equal(one('colorBurn', 128, 128), 2); // 255·(1 − 127/128)
  assert.equal(one('softLight', 128, 128), 128);
  assert.equal(one('multiply', 128, 128, { opacity: 0 }), 128);
  assert.equal(one('normal', 0, 200, { opacity: 0.5 }), 100);
  // Non-separable: colour takes hue+saturation of the layer, luminosity of the base.
  const base = solid(100, 100, 100, 1, 1);
  blendLayer(base, solid(255, 0, 0, 1, 1), { mode: 'color' });
  const [r, g, b] = px(base, 0, 0);
  assert.ok(r > g + 50 && Math.abs(0.3 * r + 0.59 * g + 0.11 * b - 100) < 2);
  const lumBase = solid(255, 0, 0, 1, 1);
  blendLayer(lumBase, solid(30, 30, 30, 1, 1), { mode: 'luminosity' });
  assert.ok(Math.abs(0.3 * lumBase.data[0] + 0.59 * lumBase.data[1] + 0.11 * lumBase.data[2] - 30) < 2);
  const greyBase = solid(120, 120, 120, 1, 1);
  blendLayer(greyBase, solid(0, 0, 255, 1, 1), { mode: 'hue' });
  assert.deepEqual(px(greyBase, 0, 0), [120, 120, 120, 255], 'hue on grey keeps grey');
  // Layer alpha, position, scale.
  const canvas = solid(0, 0, 0, 10, 10);
  blendLayer(canvas, image(2, 2, () => [255, 255, 255, 128]), { mode: 'normal', x: 4, y: 4, scale: 2 });
  assert.equal(px(canvas, 3, 3)[0], 0);
  assert.equal(px(canvas, 4, 4)[0], 128);
  assert.equal(px(canvas, 7, 7)[0], 128);
  assert.equal(px(canvas, 8, 8)[0], 0);
  const clipped = solid(0, 0, 0, 4, 4);
  blendLayer(clipped, solid(255, 255, 255, 4, 4), { x: -2, y: 3 });
  assert.equal(px(clipped, 1, 3)[0], 255);
  assert.equal(px(clipped, 2, 3)[0], 0);
  for (const mode of BLEND_MODES) {
    const img = scene();
    blendLayer(img, scene(20, 20), { mode, opacity: 0.7, x: 5, y: 5, scale: 1.5 });
    assert.ok(!Array.from(img.data).some(Number.isNaN), mode);
  }
  assert.throws(() => blendLayer(solid(1, 1, 1), solid(1, 1, 1), { mode: 'bogus' }));
});
