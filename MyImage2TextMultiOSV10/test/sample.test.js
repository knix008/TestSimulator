import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleCells } from '../src/converter.js';

function pixel(red, green, blue) {
  return [red, green, blue, 255];
}

test('averages every source pixel in one cell', () => {
  const data = new Uint8ClampedArray([
    ...pixel(0, 0, 0),
    ...pixel(100, 0, 0),
    ...pixel(0, 60, 0),
    ...pixel(0, 0, 20),
  ]);
  const rgb = sampleCells(data, 2, 2, 1, 1);
  assert.equal(rgb[0], 25);
  assert.equal(rgb[1], 15);
  assert.equal(rgb[2], 5);
});

test('keeps a hard edge between two columns', () => {
  const data = new Uint8ClampedArray([
    ...pixel(0, 0, 0),
    ...pixel(255, 255, 255),
    ...pixel(0, 0, 0),
    ...pixel(255, 255, 255),
  ]);
  const rgb = sampleCells(data, 2, 2, 2, 1);
  assert.equal(rgb[0], 0);
  assert.equal(rgb[3], 255);
  assert.equal(rgb[4], 255);
  assert.equal(rgb[5], 255);
});

test('weights only the source area a narrow cell covers', () => {
  const data = new Uint8ClampedArray([
    ...pixel(0, 0, 0),
    ...pixel(200, 0, 0),
  ]);
  const rgb = sampleCells(data, 2, 1, 4, 1);
  assert.equal(rgb[0], 0);
  assert.equal(rgb[3], 0);
  assert.equal(rgb[6], 200);
  assert.equal(rgb[9], 200);
});
