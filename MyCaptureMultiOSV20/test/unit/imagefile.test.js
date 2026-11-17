import test from 'node:test';
import assert from 'node:assert/strict';
import { decodedInWebview, frameBody } from '../../src/platform/imagefile.js';
import { IMAGE_FORMATS, LOSSY_FORMATS, sanitizeSettings } from '../../src/domain/settings.js';
import { messages } from '../../src/i18n.js';

test('frame body: [u32 meta length][meta JSON][u32 width][u32 height][RGBA] little endian', () => {
  const data = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
  const meta = { output: { kind: 'exact', path: 'C:\\캡처\\a.png' }, format: 'png', jpegQuality: 90 };
  const body = frameBody(meta, { width: 2, height: 1, data });
  const view = new DataView(body.buffer);
  const length = view.getUint32(0, true);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + length))), meta, 'UTF-8 meta survives (Korean paths)');
  assert.equal(view.getUint32(4 + length, true), 2);
  assert.equal(view.getUint32(8 + length, true), 1);
  assert.deepEqual([...body.subarray(12 + length)], [...data]);
  assert.equal(frameBody(null, { width: 1, height: 1, data: new Uint8ClampedArray(4) }).length, 4 + 2 + 8 + 4, 'no meta → "{}"');
});

test('formats: JPG · PNG · GIF · AVIF · WEBP · TIFF · BMP; AVIF is decoded by the webview', () => {
  assert.deepEqual(IMAGE_FORMATS, ['jpg', 'png', 'gif', 'avif', 'webp', 'tiff', 'bmp']);
  assert.deepEqual(LOSSY_FORMATS, ['jpg', 'avif']);
  assert.equal(sanitizeSettings({ imageFormat: 'avif' }).imageFormat, 'avif');
  assert.equal(sanitizeSettings({ imageFormat: 'heic' }).imageFormat, 'jpg');
  for (const format of IMAGE_FORMATS.filter((value) => value !== 'jpg')) {
    assert.ok(messages.ko[`format.note.${format}`] && messages.en[`format.note.${format}`], format);
  }
  assert.equal(decodedInWebview('C:\\a\\Capture.AVIF'), true);
  assert.equal(decodedInWebview('/home/u/a.png'), false);
  assert.equal(decodedInWebview(null), false);
});
