import assert from 'node:assert/strict';
import test from 'node:test';
import { planGrid } from '../src/aspect.js';

function expectMatchingRatio(imageWidth, imageHeight, charWidth, lineHeight, requested, maxCells) {
  const grid = planGrid(requested, imageWidth, imageHeight, charWidth, lineHeight, maxCells);
  const got = (grid.cols * charWidth) / (grid.rows * lineHeight);
  const want = imageWidth / imageHeight;
  const error = Math.abs(got - want) / want;
  assert.ok(grid.cols >= 8);
  assert.ok(grid.rows >= 1);
  assert.ok(grid.cols * grid.rows <= (maxCells ?? 180000));
  assert.ok(error <= 0.005, `got ${got} want ${want} ${JSON.stringify(grid)}`);
}

test('matches a 16:9 image', () => {
  expectMatchingRatio(1920, 1080, 8, 16, 120);
});

test('matches a portrait image', () => {
  expectMatchingRatio(1080, 1920, 8, 16, 80);
});

test('matches a square image', () => {
  expectMatchingRatio(800, 800, 7, 15, 100);
});

test('matches a very wide image by increasing columns', () => {
  const grid = planGrid(24, 1000, 50, 8, 16);
  expectMatchingRatio(1000, 50, 8, 16, 24);
  assert.ok(grid.cols > 24);
});

test('matches a very tall image', () => {
  expectMatchingRatio(50, 1000, 8, 16, 24);
});

test('matches wider block glyphs', () => {
  expectMatchingRatio(640, 480, 14, 16, 60);
});

test('stays inside the cell budget', () => {
  const grid = planGrid(400, 1000, 8000, 8, 16, 20000);
  assert.ok(grid.cols * grid.rows <= 20000);
  expectMatchingRatio(1000, 8000, 8, 16, 400, 20000);
});
