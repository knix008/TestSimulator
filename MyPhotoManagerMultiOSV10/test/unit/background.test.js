// EDIT-BG: background removal keeps the object and clears background that sits
// inside the selection. The saved picture is the object's box, not the original
// frame and not the selection rectangle. The algorithms ship in src/edit/background.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEdit, isEmptyEdit } from '../../src/edit/pipeline.js';
import { BG_ALGORITHMS, BG_BUILTIN, BG_NEURAL, cropToObject, neuralKey, normalizeAlgorithm, normalizeBackground, prepareBuiltinRemoval, removeBackground, selectionLine, storeNeuralAlpha } from '../../src/edit/background.js';

const RED = [210, 40, 36];
const BLUE = [24, 72, 210];
const WHITE = [236, 236, 236];

function picture(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function at(image, x, y) {
  return (y * image.width + x) * 4;
}

function selectionBounds(selection) {
  if (selection.kind === 'rect') return { w: selection.w, h: selection.h };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of selection.points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { w: maxX - minX, h: maxY - minY };
}

/** Red block on a flat blue field. The selection is a larger rectangle around it. */
function flatScene() {
  const obj = { x: 50, y: 40, w: 40, h: 30 };
  const img = picture(160, 120, (x, y) => (x >= obj.x && x < obj.x + obj.w && y >= obj.y && y < obj.y + obj.h ? RED : BLUE));
  const selection = { kind: 'rect', x: 28, y: 20, w: 84, h: 70 };
  return { img, obj, selection, margin: [32, 24], object: [70, 55] };
}

/** Red block on a field that is white on the left and blue on the right. */
function splitScene() {
  const obj = { x: 58, y: 40, w: 44, h: 32 };
  const img = picture(160, 120, (x, y) => {
    if (x >= obj.x && x < obj.x + obj.w && y >= obj.y && y < obj.y + obj.h) return RED;
    return x < 80 ? WHITE : BLUE;
  });
  const selection = { kind: 'rect', x: 36, y: 18, w: 90, h: 74 };
  return { img, selection, margin: [42, 28], object: [80, 56] };
}

function assertCutout(scene, algorithm) {
  const out = removeBackground(scene.img, scene.selection, algorithm);
  assert.equal(out.width, scene.img.width, `${algorithm} keeps the working frame`);
  assert.equal(out.height, scene.img.height);
  const object = at(out, scene.object[0], scene.object[1]);
  const margin = at(out, scene.margin[0], scene.margin[1]);
  const outside = at(out, 4, 4);
  assert.equal(out.data[object], scene.img.data[object], `${algorithm} keeps object red`);
  assert.ok(out.data[object + 3] > 200, `${algorithm} object alpha ${out.data[object + 3]}`);
  assert.ok(out.data[margin + 3] < 16, `${algorithm} background inside the selection alpha ${out.data[margin + 3]}`);
  assert.equal(out.data[outside + 3], 0, `${algorithm} outside the selection is clear`);
  const cropped = cropToObject(out);
  const bounds = selectionBounds(scene.selection);
  assert.ok(cropped.width < scene.img.width && cropped.height < scene.img.height, `${algorithm} is smaller than the photo`);
  assert.ok(cropped.width < bounds.w - 4, `${algorithm} width ${cropped.width} is the object, not the selection (${bounds.w})`);
  assert.ok(cropped.height < bounds.h - 4, `${algorithm} height ${cropped.height} is the object, not the selection (${bounds.h})`);
  assert.ok(cropped.width >= 30 && cropped.height >= 22, `${algorithm} still contains the object (${cropped.width}×${cropped.height})`);
  const again = removeBackground(scene.img, scene.selection, algorithm);
  assert.deepEqual(again.data, out.data, `${algorithm} is deterministic`);
  return cropped;
}

test('EDIT-BG ships five built-in algorithms, plus downloadable REMBG 1 and REMBG 2', () => {
  assert.deepEqual([...BG_BUILTIN], ['grabcut', 'color', 'edge', 'kmeans', 'saliency']);
  assert.deepEqual([...BG_NEURAL], ['rembg1', 'rembg2']);
  assert.deepEqual([...BG_ALGORITHMS], [...BG_BUILTIN, ...BG_NEURAL]);
  assert.equal(normalizeAlgorithm('rembg1'), 'rembg1');
  assert.equal(normalizeAlgorithm('rembg2'), 'rembg2');
  assert.equal(normalizeAlgorithm('nope'), 'grabcut');
  assert.equal(normalizeAlgorithm('edge'), 'edge');
  assert.equal(normalizeBackground(null), null);
  const kept = normalizeBackground({ algorithm: 'color', selection: { kind: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.4 } });
  assert.equal(kept.algorithm, 'color');
  assert.equal(normalizeBackground({ algorithm: 'nope', selection: { kind: 'rect', x: 0, y: 0, w: 0.2, h: 0.2 } }).algorithm, 'grabcut');
  assert.equal(normalizeBackground({ algorithm: 'grabcut', selection: { kind: 'free', points: [[0, 0], [1, 0]] } }), null);
  const ellipse = normalizeBackground({ algorithm: 'color', selection: { kind: 'ellipse', x: 0.1, y: 0.1, w: 0.8, h: 0.6 } });
  assert.equal(ellipse.selection.kind, 'ellipse');
  const circle = normalizeBackground({ algorithm: 'color', selection: { kind: 'circle', x: -0.1, y: 0.2, w: 0.5, h: 0.4 } });
  assert.equal(circle.selection.kind, 'circle');
  assert.equal(normalizeBackground({ algorithm: 'color', selection: { kind: 'ellipse', x: 2, y: 2, w: 0.2, h: 0.2 } }), null);
});

test('EDIT-BG selection line is yellow and dashed unless a style and thickness are chosen', () => {
  const fresh = selectionLine(null);
  assert.equal(fresh.color, '#ffe14a');
  assert.equal(fresh.style, 'dashed');
  assert.equal(fresh.width, 3);
  assert.deepEqual(fresh.dash, [9, 6]);
  const custom = selectionLine({ lineColor: '#FF0000', lineStyle: 'dotted', lineWidth: 8 });
  assert.deepEqual({ color: custom.color, style: custom.style, width: custom.width }, { color: '#ff0000', style: 'dotted', width: 8 });
  assert.equal(selectionLine({ lineColor: 'red', lineStyle: 'wave', lineWidth: 0 }).style, 'dashed');
  assert.equal(selectionLine({ lineWidth: 99 }).width, 24);
  assert.equal(selectionLine({ lineStyle: 'solid' }).dash, null);
});

test('EDIT-BG rectangle selection removes background inside it and crops to the object', () => {
  const scene = flatScene();
  for (const algorithm of BG_BUILTIN) assertCutout(scene, algorithm);
  const unknown = removeBackground(scene.img, scene.selection, 'no-such');
  const grab = removeBackground(scene.img, scene.selection, 'grabcut');
  assert.deepEqual(unknown.data, grab.data);
});

test('EDIT-BG freehand keeps a subject close in colour to the background', () => {
  const skin = [170, 120, 100];
  const sand = [190, 170, 150];
  const obj = { x: 40, y: 30, w: 50, h: 40 };
  const img = picture(160, 120, (x, y) => (x >= obj.x && x < obj.x + obj.w && y >= obj.y && y < obj.y + obj.h ? skin : sand));
  // The stroke clips the object's left edge, so a little of the subject sits outside.
  const selection = { kind: 'free', points: [[48, 18], [110, 18], [110, 90], [48, 90]] };
  const out = removeBackground(img, selection, 'grabcut');
  assert.ok(out.data[at(out, 70, 50) + 3] > 200, 'the subject stays visible');
  assert.equal(out.data[at(out, 4, 4) + 3], 0, 'outside the stroke is clear');
  const margin = at(out, 55, 22);
  assert.ok(out.data[margin + 3] < 16, 'sand inside the stroke is still removed');
});

test('EDIT-BG freehand selection works the same way', () => {
  const scene = flatScene();
  const { x, y, w, h } = scene.selection;
  scene.selection = { kind: 'free', points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] };
  for (const algorithm of BG_BUILTIN) assertCutout(scene, algorithm);
});

test('EDIT-BG colour, edge, cluster and GrabCut handle a two-colour background', () => {
  const scene = splitScene();
  for (const algorithm of ['grabcut', 'color', 'edge', 'kmeans']) assertCutout(scene, algorithm);
});

test('EDIT-BG REMBG keeps the picture until a mask is ready, then clears only the background', () => {
  const scene = flatScene();
  const plain = removeBackground(scene.img, scene.selection, 'rembg1');
  assert.equal(plain.data[at(plain, 4, 4) + 3], 255, 'no mask yet, so nothing is cleared');
  const alpha = new Uint8Array(scene.img.width * scene.img.height);
  const { x, y, w, h } = scene.obj;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) alpha[yy * scene.img.width + xx] = 255;
  for (const algorithm of BG_NEURAL) {
    storeNeuralAlpha(neuralKey(algorithm, scene.selection, scene.img.width, scene.img.height), alpha);
    assertCutout(scene, algorithm);
  }
});

test('EDIT-BG prepareBuiltinRemoval reports progress before the picture changes', async () => {
  const scene = flatScene();
  const seen = [];
  await prepareBuiltinRemoval(scene.img, scene.selection, 'grabcut', (done, total) => seen.push([done, total]), () => false);
  assert.ok(seen.length >= 3, `expected several updates, got ${seen.length}`);
  assert.equal(seen[0][0] < seen.at(-1)[0], true);
  assert.deepEqual(seen.at(-1), [100, 100]);
  const out = removeBackground(scene.img, scene.selection, 'grabcut');
  assert.ok(out.data[at(out, scene.object[0], scene.object[1]) + 3] > 200);
  await assert.rejects(() => prepareBuiltinRemoval(scene.img, scene.selection, 'color', () => {}, () => true), { message: 'cancelled' });
});

test('EDIT-BG ellipse and circle clear the outside of the shape', () => {
  const ellipseImage = picture(80, 60, (x, y) => {
    const dx = (x + 0.5 - 40) / 24;
    const dy = (y + 0.5 - 30) / 16;
    return dx * dx + dy * dy <= 0.35 ? RED : BLUE;
  });
  const ellipse = removeBackground(ellipseImage, { kind: 'ellipse', x: 16, y: 14, w: 48, h: 32 }, 'color');
  assert.equal(ellipse.data[at(ellipse, 17, 15) + 3], 0, 'a corner of the ellipse box is background');
  assert.ok(ellipse.data[at(ellipse, 40, 30) + 3] > 200, 'the ellipse centre stays');

  const circleImage = picture(100, 40, (x, y) => {
    const dx = x + 0.5 - 45;
    const dy = y + 0.5 - 20;
    return dx * dx + dy * dy <= 12 * 12 ? RED : BLUE;
  });
  const circle = removeBackground(circleImage, { kind: 'circle', x: 10, y: 5, w: 70, h: 30 }, 'color');
  assert.ok(circle.data[at(circle, 45, 20) + 3] > 200, 'the circle centre stays');
  assert.equal(circle.data[at(circle, 72, 20) + 3], 0, 'a wide box is tightened to a circle');
});

test('EDIT-BG counts as an edit, so the picture can be saved', () => {
  const edit = defaultEdit();
  assert.equal(isEmptyEdit(edit), true);
  edit.background = { algorithm: 'grabcut', selection: { kind: 'rect', x: 0.2, y: 0.2, w: 0.4, h: 0.5 } };
  assert.equal(isEmptyEdit(edit), false);
});
