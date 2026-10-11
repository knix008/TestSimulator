import test from 'node:test';
import assert from 'node:assert/strict';
import { centred, fitScale, zoomAround, ZOOM_MAX, ZOOM_MIN } from '../../src/viewer.js';

test('fit scales the image to the box both ways', () => {
  assert.equal(fitScale({ width: 3840, height: 2160 }, { width: 960, height: 540 }), 0.25);
  assert.equal(fitScale({ width: 1000, height: 2000 }, { width: 800, height: 500 }), 0.25, 'tall image fits by height');
  assert.equal(fitScale({ width: 200, height: 100 }, { width: 800, height: 600 }), 4, 'small images grow with the window');
  assert.equal(fitScale({ width: 0, height: 0 }, { width: 800, height: 600 }), 1);
});

test('centred places the scaled content in the middle', () => {
  assert.deepEqual(centred({ width: 400, height: 200 }, { width: 800, height: 600 }, 1), { scale: 1, x: 200, y: 200 });
  assert.deepEqual(centred({ width: 400, height: 200 }, { width: 800, height: 600 }, 0.5), { scale: 0.5, x: 300, y: 250 });
});

test('zoom keeps the point under the cursor in place', () => {
  const view = { scale: 1, x: 100, y: 50 };
  const zoomed = zoomAround(view, 2, 300, 250);
  assert.equal(zoomed.scale, 2);
  // Image pixel under the cursor before: ((300-100)/1, (250-50)/1) = (200, 200); after: same pixel.
  assert.deepEqual([(300 - zoomed.x) / zoomed.scale, (250 - zoomed.y) / zoomed.scale], [200, 200]);
});

test('zoom is clamped', () => {
  assert.equal(zoomAround({ scale: 10, x: 0, y: 0 }, 4, 0, 0).scale, ZOOM_MAX);
  assert.equal(zoomAround({ scale: 0.06, x: 0, y: 0 }, 0.1, 0, 0).scale, ZOOM_MIN);
});
