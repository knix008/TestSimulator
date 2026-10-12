import test from 'node:test';
import assert from 'node:assert/strict';
import { mimeForExt } from '../src/lib/image.js';

test('file extensions map to image and video types', () => {
  assert.equal(mimeForExt('png'), 'image/png');
  assert.equal(mimeForExt('.JPG'), 'image/jpeg');
  assert.equal(mimeForExt('jpeg'), 'image/jpeg');
  assert.equal(mimeForExt('webp'), 'image/webp');
  assert.equal(mimeForExt('webm'), 'video/webm');
  assert.equal(mimeForExt('mp4'), 'video/mp4');
  assert.equal(mimeForExt('mkv'), 'video/x-matroska');
  assert.equal(mimeForExt('ogg'), 'video/ogg');
  assert.equal(mimeForExt(''), 'application/octet-stream');
  assert.equal(mimeForExt('txt'), 'application/octet-stream');
});
