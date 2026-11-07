// The fast tooltip box: where it goes, and that it stays inside the window.
import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLTIP_DELAY, tooltipPlace } from '../../src/ui/tooltip.js';

const VIEW = { width: 1000, height: 600 };
const SIZE = { width: 100, height: 30 };
const rect = (left, top, width = 20, height = 20) => ({ left, top, width, height, right: left + width, bottom: top + height });

test('a tooltip appears quickly, well before the browser\'s own', () => {
  assert.ok(TOOLTIP_DELAY <= 150, `${TOOLTIP_DELAY} ms`);
});

test('centred below the element', () => {
  assert.deepEqual(tooltipPlace(rect(500, 100), SIZE, VIEW), { left: 460, top: 126 });
});

test('above the element when there is no room below', () => {
  assert.equal(tooltipPlace(rect(500, 570), SIZE, VIEW).top, 534);
});

test('never outside the window', () => {
  assert.equal(tooltipPlace(rect(0, 100), SIZE, VIEW).left, 4, 'left edge');
  assert.equal(tooltipPlace(rect(980, 100), SIZE, VIEW).left, 896, 'right edge');
  // A window too small for either side (a small popup): it stays on screen anyway.
  const tiny = tooltipPlace(rect(10, 10), { width: 300, height: 90 }, { width: 200, height: 80 });
  assert.ok(tiny.top >= 4 - 14 && tiny.left <= 4, JSON.stringify(tiny));
});
