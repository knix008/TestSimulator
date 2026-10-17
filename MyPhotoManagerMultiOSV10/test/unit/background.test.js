// EDIT-BG: background removal keeps the object and clears background that sits
// inside the selection. The saved picture is the object's box, not the original
// frame and not the selection rectangle. The algorithms ship in src/edit/background.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEdit, isEmptyEdit } from '../../src/edit/pipeline.js';
import { BG_ALGORITHMS, cropToObject, normalizeAlgorithm, normalizeBackground, removeBackground } from '../../src/edit/background.js';

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

test('EDIT-BG ships five algorithms and GrabCut is the default', () => {
  assert.deepEqual([...BG_ALGORITHMS], ['grabcut', 'color', 'edge', 'kmeans', 'saliency']);
  assert.equal(normalizeAlgorithm('nope'), 'grabcut');
  assert.equal(normalizeAlgorithm('edge'), 'edge');
  assert.equal(normalizeBackground(null), null);
  const kept = normalizeBackground({ algorithm: 'color', selection: { kind: 'rect', x: 0.1, y: 0.2, w: 0.5, h: 0.4 } });
  assert.equal(kept.algorithm, 'color');
  assert.equal(normalizeBackground({ algorithm: 'nope', selection: { kind: 'rect', x: 0, y: 0, w: 0.2, h: 0.2 } }).algorithm, 'grabcut');
  assert.equal(normalizeBackground({ algorithm: 'grabcut', selection: { kind: 'free', points: [[0, 0], [1, 0]] } }), null);
});

test('EDIT-BG rectangle selection removes background inside it and crops to the object', () => {
  const scene = flatScene();
  for (const algorithm of BG_ALGORITHMS) assertCutout(scene, algorithm);
  const unknown = removeBackground(scene.img, scene.selection, 'no-such');
  const grab = removeBackground(scene.img, scene.selection, 'grabcut');
  assert.deepEqual(unknown.data, grab.data);
});

test('EDIT-BG freehand selection works the same way', () => {
  const scene = flatScene();
  const { x, y, w, h } = scene.selection;
  scene.selection = { kind: 'free', points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] };
  for (const algorithm of BG_ALGORITHMS) assertCutout(scene, algorithm);
});

test('EDIT-BG colour, edge, cluster and GrabCut handle a two-colour background', () => {
  const scene = splitScene();
  for (const algorithm of ['grabcut', 'color', 'edge', 'kmeans']) assertCutout(scene, algorithm);
});

test('EDIT-BG counts as an edit, so the picture can be saved', () => {
  const edit = defaultEdit();
  assert.equal(isEmptyEdit(edit), true);
  edit.background = { algorithm: 'grabcut', selection: { kind: 'rect', x: 0.2, y: 0.2, w: 0.4, h: 0.5 } };
  assert.equal(isEmptyEdit(edit), false);
});
