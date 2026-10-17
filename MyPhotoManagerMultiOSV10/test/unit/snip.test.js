// EDIT-SNIP: a rectangle, ellipse, circle or freehand selection can be copied
// (the piece keeps its pixels) or cut (those pixels become transparent).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEdit, isEmptyEdit, normalizeEdit } from '../../src/edit/pipeline.js';
import { applySnips, extractSnip, normalizeSnips, snipMask } from '../../src/edit/snip.js';

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

const on = (mask, width, x, y) => mask[y * width + x] === 1;
const alpha = (image, x, y) => image.data[(y * image.width + x) * 4 + 3];

test('EDIT-SNIP rectangle selection covers the box and the copy keeps its colour', () => {
  const image = picture(40, 30, (x, y) => [x * 4, y * 6, 90]);
  const selection = { kind: 'rect', x: 0.25, y: 0.2, w: 0.5, h: 0.4 };
  const mask = snipMask(40, 30, selection);
  assert.equal(on(mask, 40, 20, 12), true);
  assert.equal(on(mask, 40, 1, 1), false);
  const piece = extractSnip(image, selection);
  assert.ok(piece.width >= 18 && piece.height >= 10);
  assert.equal(piece.data[3], 255);
  assert.equal(piece.data[0], 10 * 4);
});

test('EDIT-SNIP ellipse selection leaves the bounding-box corners out of the copy', () => {
  const image = picture(80, 40, () => [12, 80, 200]);
  const selection = { kind: 'ellipse', x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  const mask = snipMask(80, 40, selection);
  assert.equal(on(mask, 80, 40, 20), true);
  assert.equal(on(mask, 80, 10, 6), false, 'a bounding-box corner is outside the ellipse');
  const piece = extractSnip(image, selection);
  assert.equal(piece.data[3], 0, 'the copied corner is transparent');
  const mid = (Math.floor(piece.height / 2) * piece.width + Math.floor(piece.width / 2)) * 4;
  assert.equal(piece.data[mid + 3], 255);
  assert.equal(piece.data[mid], 12);
});

test('EDIT-SNIP circle selection stays round in pixels', () => {
  const mask = snipMask(100, 50, { kind: 'circle', x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  assert.equal(on(mask, 100, 35, 17), true);
  assert.equal(on(mask, 100, 58, 17), false, 'a wide box is tightened to a circle');
  let minX = 100;
  let maxX = 0;
  let minY = 50;
  let maxY = 0;
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 100; x++) {
      if (!on(mask, 100, x, y)) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  assert.ok(Math.abs((maxX - minX) - (maxY - minY)) <= 1, 'the circle is as wide as it is tall');
});

test('EDIT-SNIP freehand selection covers the inside of the outline', () => {
  const mask = snipMask(20, 20, { kind: 'free', points: [[0.1, 0.1], [0.8, 0.2], [0.2, 0.8]] });
  assert.equal(on(mask, 20, 5, 5), true);
  assert.equal(on(mask, 20, 18, 18), false);
  assert.equal(normalizeSnips([{ kind: 'free', points: [[0, 0], [1, 1]] }]).length, 0, 'two points are not a selection');
});

test('EDIT-SNIP a cut clears only the selected pixels and cuts stack', () => {
  const image = picture(20, 16, (x, y) => [x * 10, y * 10, 40]);
  const rect = { kind: 'rect', x: 0.2, y: 0.25, w: 0.3, h: 0.25 };
  const other = { kind: 'rect', x: 0.7, y: 0.6, w: 0.2, h: 0.25 };
  const punched = applySnips(image, [rect, other]);
  assert.equal(alpha(punched, 6, 4), 0);
  assert.equal(alpha(punched, 15, 11), 0);
  assert.equal(alpha(punched, 0, 0), 255);
  assert.equal(image.data[3], 255, 'the source picture is left as it was');
});

test('EDIT-SNIP cuts count as an edit and empty shapes are dropped', () => {
  assert.equal(isEmptyEdit(defaultEdit()), true);
  const edit = normalizeEdit({ cuts: [{ kind: 'circle', x: 0.2, y: 0.2, w: 0.3, h: 0.4 }, { kind: 'nope' }, { kind: 'rect', x: 0, y: 0, w: 0, h: 0.2 }] });
  assert.equal(edit.cuts.length, 1);
  assert.equal(edit.cuts[0].kind, 'circle');
  assert.equal(isEmptyEdit(edit), false);
});
