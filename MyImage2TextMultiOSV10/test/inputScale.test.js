import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MIN_COLS, clampInputScale, scaledColumns, scaledSize } from '../src/inputScale.js';
import { exportSize } from '../src/render.js';

test('the input image shrinks by the chosen share and keeps its aspect ratio', () => {
  assert.deepEqual(scaledSize(960, 760, 100), { width: 960, height: 760 });
  assert.deepEqual(scaledSize(960, 760, 50), { width: 480, height: 380 });
  assert.deepEqual(scaledSize(4000, 3000, 25), { width: 1000, height: 750 });
  assert.deepEqual(scaledSize(3, 2, 10), { width: 1, height: 1 });
});

test('the number of characters shrinks by the same share', () => {
  assert.equal(scaledColumns(100, 100), 100);
  assert.equal(scaledColumns(100, 50), 50);
  assert.equal(scaledColumns(60, 10), MIN_COLS);
});

test('the share snaps to 5% steps between 10% and 100%', () => {
  assert.equal(clampInputScale(0), 10);
  assert.equal(clampInputScale(48), 50);
  assert.equal(clampInputScale(250), 100);
  assert.equal(clampInputScale('x'), 100);
});

test('an exported image is the shrunken input image size', () => {
  const size = scaledSize(960, 760, 50);
  const result = { text: '', cols: 50, rows: 34, imageWidth: size.width, imageHeight: size.height, edited: false, cellRatio: 0.55 };
  const out = exportSize(result, 100);
  assert.deepEqual([out.width, out.height], [480, 380]);
});

test('the columns slider goes up to 100 and every slider has a typed number box', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<input id="cols" type="range" min="24" max="100"/);
  assert.match(html, /<input id="input-scale" type="range" min="10" max="100" step="5"/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /function setupMeterInputs\(\)/);
  assert.match(main, /setupMeterInputs\(\);/);
});
