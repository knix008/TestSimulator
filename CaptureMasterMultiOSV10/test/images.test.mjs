import test from 'node:test';
import assert from 'node:assert/strict';
import { mimeForExt, dataUrlToBytes } from '../src/lib/image.js';

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

test('a data URL is decoded without fetch, including a full-screen sized payload', async () => {
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 255]);
  const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  const big = new Uint8Array(2 * 1024 * 1024 + 100);
  for (let i = 0; i < big.length; i++) big[i] = i & 255;
  const bigUrl = `data:application/octet-stream;base64,${Buffer.from(big).toString('base64')}`;
  const orig = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('fetch should not read a data URL'); };
  try {
    assert.deepEqual(await dataUrlToBytes(dataUrl), bytes);
    assert.deepEqual(await dataUrlToBytes(bigUrl), big);
    assert.deepEqual(await dataUrlToBytes('data:text/plain,a%20b'), new TextEncoder().encode('a b'));
  } finally {
    globalThis.fetch = orig;
  }
});
