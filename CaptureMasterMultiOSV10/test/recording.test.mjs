import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedVideoFormats, pickVideoFormat, GIF_FORMAT, GIF_MAX_FPS, GIF_MAX_WIDTH } from '../src/lib/capture.js';

test('a format is chosen only from what this runtime can record', () => {
  const supported = supportedVideoFormats();
  assert.equal(supported.some((format) => format.gif), false);
  assert.equal(GIF_FORMAT.gif, true);
  assert.equal(GIF_MAX_FPS, 20);
  assert.equal(GIF_MAX_WIDTH, 1280);
  const automatic = pickVideoFormat('auto');
  if (supported.length === 0) {
    assert.equal(automatic, null);
    assert.equal(pickVideoFormat('webm-vp9'), null);
    assert.equal(pickVideoFormat('gif'), null);
  } else {
    assert.equal(automatic.id, 'webm-vp9');
    assert.equal(pickVideoFormat(supported[0].id).id, supported[0].id);
    assert.equal(pickVideoFormat('not-a-format').id, automatic.id);
  }
});
