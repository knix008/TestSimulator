import assert from 'node:assert/strict';
import test from 'node:test';
import { MIN_EXPORT_CELL, canvasSize, clampExportScale, exportSize } from '../src/render.js';

function result({ cols = 100, rows = 68, width = 960, height = 760 } = {}) {
  return { text: '', cols, rows, imageWidth: width, imageHeight: height, edited: false, cellRatio: 0.55 };
}

const ratio = (size) => size.width / size.height;

test('100% is the source image width with the source aspect ratio', () => {
  const size = exportSize(result(), 100);
  assert.equal(size.width, 960);
  assert.equal(size.height, 760);
  assert.ok(Math.abs(ratio(size) - 960 / 760) < 0.003);
});

test('lower resolutions shrink both sides by the same share', () => {
  const half = exportSize(result(), 50);
  assert.equal(half.width, 480);
  assert.equal(half.height, 380);
  const quarter = exportSize(result({ cols: 40, width: 4000, height: 3000 }), 25);
  assert.deepEqual([quarter.width, quarter.height], [1000, 750]);
});

test('a glyph never gets narrower than the minimum cell', () => {
  const size = exportSize(result({ cols: 200 }), 10);
  assert.equal(size.width, 200 * MIN_EXPORT_CELL);
  assert.ok(size.cellWidth >= MIN_EXPORT_CELL);
  assert.ok(Math.abs(ratio(size) - 960 / 760) < 0.01);
});

test('the scale snaps to 5% steps between 10% and 100%', () => {
  assert.equal(clampExportScale(0), 10);
  assert.equal(clampExportScale(47), 45);
  assert.equal(clampExportScale(48), 50);
  assert.equal(clampExportScale(250), 100);
  assert.equal(clampExportScale('abc'), 100);
});

test('no exported side is longer than 8192 pixels', () => {
  const size = exportSize(result({ width: 20000, height: 10000 }), 100);
  assert.equal(size.width, 8192);
  assert.equal(size.height, 4096);
});

test('a zoomed screen view is exactly the wanted width, within the screen limits', () => {
  const size = canvasSize(result(), 3000.4, { exact: true, maxEdge: 16384, maxArea: 64e6 });
  assert.equal(size.width, 3000);
  const huge = canvasSize(result(), 20000, { exact: true, maxEdge: 16384, maxArea: 64e6 });
  assert.ok(huge.width <= 16384 && huge.height <= 16384);
  assert.ok(huge.width * huge.height <= 64e6 * 1.001);
});

test('the doubled canvas keeps whole-pixel cells', () => {
  const size = canvasSize(result(), 1500);
  assert.ok(Number.isInteger(size.cellWidth) && Number.isInteger(size.cellHeight));
  assert.equal(size.width, size.cellWidth * 100);
  assert.equal(size.height, size.cellHeight * 68);
});
