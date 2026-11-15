// The zoom-following 5 × 5 grid (2D editor and 3D floor) and the ruler labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMetres, gridLevel } from '../../src/editor/grid.js';

test('grid: minor spacing on screen always stays between minPx and 5·minPx', () => {
  for (let ppm = 0.05; ppm < 2000; ppm *= 1.07) {
    const level = gridLevel(ppm, 10);
    assert.ok(level.minorPx >= 10 - 1e-6 && level.minorPx < 50 + 1e-6, `ppm ${ppm}: ${level.minorPx}px`);
    assert.equal(level.major, level.minor * 5);
    assert.ok(level.fade >= 0 && level.fade <= 1);
  }
});

test('grid: steps are powers of 5 and zooming out turns majors into minors', () => {
  assert.equal(gridLevel(18, 10).minor, 1); // the default 2D zoom: 1 m / 5 m
  assert.equal(gridLevel(1.8, 10).minor, 25);
  assert.equal(gridLevel(180, 10).minor, 0.2);
  const a = gridLevel(9, 10); const b = gridLevel(9 / 5, 10);
  assert.equal(b.minor, a.major);
  // Just past a level change the minor lines are faint, then grow in.
  assert.ok(gridLevel(10.01, 10).fade < 0.01);
  assert.ok(gridLevel(30, 10).fade === 1);
});

test('grid: ruler labels have no float noise', () => {
  assert.equal(formatMetres(0.2 * 3, 0.2), '0.6');
  assert.equal(formatMetres(0.04 * 7, 0.04), '0.28');
  assert.equal(formatMetres(-25, 5), '-25');
  assert.equal(formatMetres(-0.0001, 1), '0');
});
