// The image engine: rasters, filters, the face finder, the caricature warp, styles and effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blurChannel, createRaster, fitSize, kmeansPalette, kuwahara, mapToPalette, resize, rng, toGray, xdog, bilateral, parseColor, toHex, sample } from '../../src/engine/raster.js';
import { defaultFeatures, detectFace, ellipseCoords, ellipsePoint, faceCrop, featuresFromEllipse, fromLandmarks, moveFeature, scaleFeatures, translateFeatures, validFeatures } from '../../src/engine/face.js';
import { buildWarp, caricatureWarp, forwardOp, inverseOp, normalizeWarp, NO_WARP, WARP_KEYS } from '../../src/engine/warp.js';
import { CLASSIC_STYLE_IDS, DEFAULT_STYLE_IDS, maskFromFeatures, normalizeOptions, STYLE_IDS, STYLES, styleById } from '../../src/engine/styles.js';
import { applyEffects, EFFECT_IDS, EFFECTS, isOverlay, newEffect, normalizeEffect } from '../../src/engine/effects.js';
import { renderCaricature, sizeUnit } from '../../src/engine/pipeline.js';
import { newItem } from '../../src/domain/project.js';
import { syntheticPortrait } from './synthetic.js';

const finite = (r) => r.data.every((v) => Number.isFinite(v) && v >= 0 && v <= 255);
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

test('raster: resize keeps the mean colour and the requested size', () => {
  const { raster } = syntheticPortrait(200, 250);
  const small = resize(raster, 50, 62);
  assert.equal(small.width, 50);
  assert.equal(small.height, 62);
  assert.ok(Math.abs(mean(toGray(raster)) - mean(toGray(small))) < 3);
  const big = resize(small, 120, 150);
  assert.equal(big.width, 120);
  assert.ok(finite(big));
});

test('raster: fitSize never enlarges and keeps the aspect', () => {
  assert.deepEqual(fitSize(400, 300, 800), { width: 400, height: 300, scale: 1 });
  const f = fitSize(4000, 3000, 1000);
  assert.equal(f.width, 1000);
  assert.equal(f.height, 750);
});

test('raster: blur keeps the mean and smooths a step', () => {
  const w = 40;
  const h = 10;
  const step = new Float32Array(w * h).map((_, i) => (i % w < 20 ? 0 : 255));
  const soft = blurChannel(step, w, h, 3);
  assert.ok(Math.abs(mean(soft) - mean(step)) < 1);
  assert.ok(soft[5 * w + 19] > 40 && soft[5 * w + 19] < 215);
});

test('raster: XDoG gives ink only near edges', () => {
  const w = 60;
  const h = 20;
  const gray = new Float32Array(w * h).map((_, i) => (i % w < 30 ? 40 : 220));
  const lines = xdog(gray, w, h, { sigma: 1, tau: 0.98, phi: 20, eps: 0.5 });
  assert.ok(lines.every((v) => v >= 0 && v <= 1));
  assert.ok(lines[10 * w + 55] > 0.9, 'flat light area is paper');
});

test('raster: k-means palette has k colours and is deterministic', () => {
  const { raster } = syntheticPortrait(160, 200);
  const a = kmeansPalette(raster, 6, { seed: 3 });
  const b = kmeansPalette(raster, 6, { seed: 3 });
  assert.equal(a.length, 6);
  assert.deepEqual(a, b);
  const mapped = mapToPalette(raster, a);
  const colours = new Set();
  for (let i = 0; i < mapped.data.length; i += 4) colours.add(`${mapped.data[i]},${mapped.data[i + 1]},${mapped.data[i + 2]}`);
  assert.ok(colours.size <= 6);
});

test('raster: bilateral and Kuwahara keep the size and the value range', () => {
  const { raster } = syntheticPortrait(120, 150);
  for (const out of [bilateral(raster, 3, 30, 2), kuwahara(raster, 3)]) {
    assert.equal(out.width, 120);
    assert.equal(out.height, 150);
    assert.ok(finite(out));
  }
});

test('raster: colours and random numbers', () => {
  assert.deepEqual(parseColor('#ff8000'), [255, 128, 0]);
  assert.deepEqual(parseColor('nope', [1, 2, 3]), [1, 2, 3]);
  assert.equal(toHex([255, 128, 0]), '#ff8000');
  const r1 = rng(42);
  const r2 = rng(42);
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2());
  const px = sample(createRaster(2, 2, new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255])), 0.5, 0, new Float32Array(4));
  assert.equal(Math.round(px[0]), 128);
});

test('face: the skin-colour finder finds the synthetic face and its eyes', () => {
  const { raster, truth } = syntheticPortrait(480, 600);
  const f = detectFace(raster);
  assert.equal(f.method, 'skin');
  assert.ok(validFeatures(f));
  assert.ok(Math.abs(f.face.cx - truth.cx) < truth.rx * 0.2, `cx ${f.face.cx} vs ${truth.cx}`);
  assert.ok(Math.abs(f.face.cy - truth.cy) < truth.ry * 0.35, `cy ${f.face.cy} vs ${truth.cy}`);
  assert.ok(Math.abs(f.face.rx - truth.rx) < truth.rx * 0.35);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.hypot(f.eyes[i].x - truth.eyes[i][0], f.eyes[i].y - truth.eyes[i][1]) < truth.rx * 0.2, `eye ${i}`);
  }
});

test('face: no skin → the default face in the middle', () => {
  const blue = createRaster(300, 400);
  for (let i = 0; i < blue.data.length; i += 4) { blue.data[i] = 20; blue.data[i + 1] = 60; blue.data[i + 2] = 200; blue.data[i + 3] = 255; }
  const f = detectFace(blue);
  assert.equal(f.method, 'default');
  assert.ok(validFeatures(f));
  assert.ok(Math.abs(f.face.cx - 150) < 1);
});

test('face: ellipse coordinates go both ways', () => {
  const face = { cx: 100, cy: 120, rx: 40, ry: 55, angle: 0.3 };
  const p = ellipsePoint(face, 0.4, -0.7);
  const back = ellipseCoords(face, p.x, p.y);
  assert.ok(Math.abs(back.u - 0.4) < 1e-9 && Math.abs(back.v + 0.7) < 1e-9);
});

test('face: mesh landmarks map to features (left eye on the left)', () => {
  // 478 points on a fake face: the oval on a circle, the named points where they belong.
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (i, x, y) => { points[i] = { x, y, z: 0 }; };
  set(10, 0.5, 0.2); set(152, 0.5, 0.8); set(234, 0.3, 0.5); set(454, 0.7, 0.5);
  set(468, 0.62, 0.45); set(473, 0.38, 0.45); // iris centres, given "the wrong way round"
  set(33, 0.66, 0.45); set(133, 0.58, 0.45); set(362, 0.42, 0.45); set(263, 0.34, 0.45);
  set(1, 0.5, 0.56); set(129, 0.47, 0.57); set(358, 0.53, 0.57);
  set(61, 0.44, 0.66); set(291, 0.56, 0.66); set(13, 0.5, 0.65); set(14, 0.5, 0.67); set(0, 0.5, 0.64); set(17, 0.5, 0.69);
  const f = fromLandmarks(points, 1000, 1000);
  assert.equal(f.method, 'landmarks');
  assert.ok(validFeatures(f));
  assert.ok(f.eyes[0].x < f.eyes[1].x, 'eyes sorted left to right');
  assert.ok(Math.abs(f.nose.x - 500) < 1 && Math.abs(f.chin.y - 800) < 1);
  assert.ok(f.face.ry > f.face.rx);
  assert.equal(fromLandmarks([], 10, 10), null);
});

test('face: moving points keeps the features consistent', () => {
  const f = featuresFromEllipse({ cx: 200, cy: 200, rx: 60, ry: 80, angle: 0 });
  const moved = moveFeature(f, 'face', 220, 210);
  assert.equal(moved.method, 'manual');
  assert.ok(Math.abs(moved.nose.x - (f.nose.x + 20)) < 1e-9);
  const eye = moveFeature(f, 'eyeL', 170, 190);
  assert.deepEqual([eye.eyes[0].x, eye.eyes[0].y], [170, 190]);
  const chin = moveFeature(f, 'chin', 200, f.chin.y + 40);
  assert.ok(chin.face.ry > f.face.ry, 'a lower chin makes the head taller');
  const scaled = scaleFeatures(f, 0.5);
  assert.equal(scaled.face.rx, 30);
  const shifted = translateFeatures(f, -10, 5);
  assert.equal(shifted.mouth.x, f.mouth.x - 10);
  assert.equal(validFeatures({ face: {} }), false);
});

test('face: framing crops a small face to head and shoulders, not a big one', () => {
  const small = featuresFromEllipse({ cx: 500, cy: 300, rx: 60, ry: 80, angle: 0 });
  const crop = faceCrop(small, 1000, 1400);
  assert.ok(crop);
  assert.ok(crop.x <= 440 && crop.x + crop.w >= 560, 'the head is inside');
  assert.ok(crop.y <= 300 - 80, 'room above the head');
  assert.ok(Math.abs(crop.w / crop.h - 0.75) < 0.02, '3:4 portrait');
  const big = featuresFromEllipse({ cx: 500, cy: 600, rx: 300, ry: 380, angle: 0 });
  assert.equal(faceCrop(big, 1000, 1400), null);
});

test('warp: neutral values do nothing; inverse and forward agree', () => {
  const f = defaultFeatures(400, 500);
  assert.equal(buildWarp(f, NO_WARP).ops.length, 0);
  const { ops } = buildWarp(f, { ...NO_WARP, head: 1.6, eyes: 1.4, nose: 1.3 });
  assert.ok(ops.length >= 3);
  for (const op of ops) {
    for (const [x, y] of [[op.cx + 3, op.cy - 2], [op.cx + op.rx * 0.5, op.cy], [op.cx, op.cy + op.ry * 0.8]]) {
      const [fx, fy] = forwardOp(op, x, y);
      const [ix, iy] = inverseOp(op, fx, fy);
      assert.ok(Math.hypot(ix - x, iy - y) < 0.1, 'forward then inverse returns the point');
    }
  }
});

test('warp: a bigger head moves the eyes apart; smaller features shrink', () => {
  const f = defaultFeatures(400, 500);
  const before = f.eyes[1].x - f.eyes[0].x;
  const big = buildWarp(f, { ...NO_WARP, head: 1.8 }).features;
  assert.ok(big.eyes[1].x - big.eyes[0].x > before * 1.4);
  assert.ok(big.face.rx > f.face.rx * 1.4);
  const tiny = buildWarp(f, { ...NO_WARP, eyes: 0.6 }).features;
  assert.ok(tiny.eyes[0].r < f.eyes[0].r);
  const none = buildWarp(f, { ...NO_WARP, head: 1.8, strength: 0 });
  assert.equal(none.ops.length, 0, 'strength 0 = no exaggeration');
});

test('warp: values are clamped and the picture keeps its size', () => {
  const w = normalizeWarp({ head: 9, eyes: -3, nose: 'x', strength: 5 });
  assert.equal(w.head, 2.2);
  assert.equal(w.eyes, 0.5);
  assert.equal(w.nose, 1);
  assert.equal(w.strength, 2);
  for (const key of WARP_KEYS) assert.ok(key in w);
  const { raster } = syntheticPortrait(160, 200);
  const f = detectFace(raster);
  const mask = maskFromFeatures(160, 200, f);
  const out = caricatureWarp(raster, f, { ...NO_WARP, head: 1.7 }, mask);
  assert.equal(out.raster.width, 160);
  assert.equal(out.mask.length, 160 * 200);
  assert.ok(finite(out.raster));
});

test('styles: forty styles, all drawn by default, each with complete options', () => {
  assert.equal(STYLES.length, 40);
  assert.equal(DEFAULT_STYLE_IDS.length, 40);
  assert.equal(CLASSIC_STYLE_IDS.length, 10);
  assert.equal(new Set(STYLE_IDS).size, 40);
  for (const style of STYLES) {
    const o = normalizeOptions(style.id, {});
    for (const key of ['lines', 'detail', 'colors', 'smooth', 'texture', 'background']) assert.ok(key in o, `${style.id}.${key}`);
    assert.equal(typeof style.render, 'function');
  }
  assert.equal(styleById('nope').id, 'cartoon');
  assert.equal(normalizeOptions('cartoon', { colors: 99, background: 'x' }).colors, 24);
});

test('styles: every style draws a full picture without bad values, the same for the same seed', () => {
  const { raster } = syntheticPortrait(150, 190);
  const f = detectFace(raster);
  for (const style of STYLES) {
    const item = newItem(style.id, 77);
    const a = renderCaricature(raster, f, item);
    assert.equal(a.image.width, 150, style.id);
    assert.equal(a.image.height, 190, style.id);
    assert.ok(finite(a.image), `${style.id} values`);
    const b = renderCaricature(raster, f, item);
    assert.deepEqual(a.image.data, b.image.data, `${style.id} deterministic`);
    // Not a blank picture: some contrast.
    const gray = toGray(a.image);
    assert.ok(Math.max(...gray) - Math.min(...gray) > 40, `${style.id} has contrast`);
  }
});

test('effects: every pixel effect runs; overlays are left to the page', () => {
  const { raster } = syntheticPortrait(120, 150);
  const f = detectFace(raster);
  const base = renderCaricature(raster, f, newItem('cartoon', 5));
  for (const def of EFFECTS) {
    const out = applyEffects(base.base, [newEffect(def.id)], { mask: base.mask, features: base.features, u: sizeUnit(120, 150) });
    assert.equal(out.width, 120);
    assert.ok(finite(out), def.id);
    if (def.overlay) assert.equal(out, base.base, `${def.id} is an overlay`);
  }
  const off = applyEffects(base.base, [{ ...newEffect('invert'), on: false }]);
  assert.equal(off, base.base, 'switched-off effects are skipped');
  const inverted = applyEffects(base.base, [newEffect('invert')]);
  assert.equal(inverted.data[0], 255 - base.base.data[0]);
  assert.ok(isOverlay('caption') && !isOverlay('blur'));
  assert.equal(EFFECT_IDS.length, 20);
});

test('effects: parameters are repaired; unknown effects are dropped', () => {
  const e = normalizeEffect({ id: 'vignette', amount: 400, color: 'red', size: '30' });
  assert.equal(e.amount, 100);
  assert.equal(e.color, '#000000');
  assert.equal(e.size, 30);
  assert.equal(normalizeEffect({ id: 'nope' }), null);
  assert.equal(normalizeEffect({ id: 'frame', style: 'weird' }).style, 'polaroid');
  assert.throws(() => newEffect('nope'));
});

test('face: what stands out is exaggerated more (distinctiveness, personal warp)', async () => {
  const { distinctiveness, standoutFeatures, MEAN_FACE } = await import('../../src/engine/face.js');
  const { personalWarp } = await import('../../src/engine/warp.js');
  const f = featuresFromEllipse({ cx: 300, cy: 300, rx: 100, ry: 100 * MEAN_FACE.aspect, angle: 0 }, 'landmarks');
  // An average nose, then a much wider one.
  f.nose.r = 100 * MEAN_FACE.nose;
  const average = distinctiveness(f);
  assert.ok(Math.abs(average.nose - 1) < 0.25);
  const big = structuredClone(f);
  big.nose.r = 100 * MEAN_FACE.nose * 1.3;
  const d = distinctiveness(big);
  assert.ok(d.nose > average.nose + 0.2, `nose ${d.nose} vs ${average.nose}`);
  assert.ok(standoutFeatures(big).some((s) => s.key === 'nose' && s.percent > 20));
  const w = personalWarp({ head: 1.3, nose: 1.2, eyes: 1.2, mouth: 1.1, chin: 1, jaw: 1, forehead: 1, ears: 1 }, d);
  assert.ok(w.nose > 1.2 && w.head === 1.3);
  assert.deepEqual(personalWarp({ nose: 1.2 }, null).nose, 1.2);
  assert.equal(distinctiveness({}), null);
});
