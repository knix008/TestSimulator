import test from 'node:test';
import assert from 'node:assert/strict';

// recorder.js touches browser globals only inside functions; these stubs let it import.
globalThis.HTMLCanvasElement ??= class {};
globalThis.window ??= globalThis;
const { pickMimeType } = await import('../../src/platform/recorder.js');
const { decodeFrame } = await import('../../src/platform/native.js');

test('pickMimeType prefers the richest supported codec and respects audio', () => {
  const supported = new Set(['video/mp4;codecs=avc1.42E01F', 'video/webm;codecs=vp8,opus', 'video/webm']);
  const isSupported = (type) => supported.has(type);
  assert.equal(pickMimeType('mp4', false, isSupported), 'video/mp4;codecs=avc1.42E01F');
  assert.equal(pickMimeType('mp4', true, isSupported), null, 'no AAC → MP4 with audio is not offered');
  assert.equal(pickMimeType('webm', true, isSupported), 'video/webm;codecs=vp8,opus');
  assert.equal(pickMimeType('webm', false, isSupported), 'video/webm');
  assert.equal(pickMimeType('avi', false, () => true), null);
});

test('decodeFrame reads the backend frame header', () => {
  const bytes = new Uint8Array(8 + 2 * 1 * 4);
  new DataView(bytes.buffer).setUint32(0, 2, true);
  new DataView(bytes.buffer).setUint32(4, 1, true);
  bytes.set([1, 2, 3, 4, 5, 6, 7, 8], 8);
  const frame = decodeFrame(bytes.buffer);
  assert.equal(frame.width, 2);
  assert.equal(frame.height, 1);
  assert.deepEqual([...frame.pixels], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(decodeFrame([...bytes]).width, 2, 'plain arrays (older IPC) work too');
});
