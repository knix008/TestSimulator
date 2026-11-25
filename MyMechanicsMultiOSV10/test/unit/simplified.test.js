// Simplified representation: parts inside others (by their boxes) and tiny parts are left out of the display.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenInside } from '../../src/cad/asm-more.js';

const box = (key, lo, hi) => ({ key, box: [lo, hi] });

test('a part inside the housing is hidden; touching or overlapping parts stay; equal boxes both stay', () => {
  const leaves = [
    box('housing', [0, 0, 0], [100, 50, 50]),
    box('shaft', [10, 20, 20], [90, 30, 30]),
    box('cover', [100, 0, 0], [105, 50, 50]),
    box('bolt', [95, 10, 10], [110, 15, 15]),
    box('twinA', [200, 0, 0], [210, 10, 10]),
    box('twinB', [200, 0, 0], [210, 10, 10]),
  ];
  assert.deepEqual([...hiddenInside(leaves)], ['shaft']);
});

test('tiny parts go too', () => {
  const leaves = [box('big', [0, 0, 0], [100, 100, 100]), box('pin', [200, 0, 0], [201, 1, 1])];
  assert.deepEqual([...hiddenInside(leaves, { minSize: 0.02 })], ['pin']);
});
