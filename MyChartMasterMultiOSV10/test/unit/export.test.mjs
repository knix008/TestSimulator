// Picture export: every image format is offered, the formats that keep a transparent background are the ones the
// export window offers "transparent" for, and the GIF writer keeps see-through pixels see-through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHART_FORMATS, TRANSPARENT_FORMATS } from '../../src/domain/export/chartexport.js';
import { encodeGif } from '../../src/domain/export/images.js';

test('image formats: PNG, JPEG, WebP, GIF, AVIF and SVG; transparency only where the format keeps it', () => {
  for (const id of ['png', 'jpg', 'webp', 'gif', 'avif', 'svg']) assert.ok(CHART_FORMATS[id], id);
  assert.deepEqual([...TRANSPARENT_FORMATS].sort(), ['avif', 'gif', 'html', 'png', 'svg', 'webp']);
  for (const id of ['jpg', 'pdf', 'docx', 'markdown']) assert.ok(!TRANSPARENT_FORMATS.has(id), `${id} has no transparency`);
});

/** The GIF's Graphic Control Extension: { transparent flag, index } or null. */
function gce(bytes) {
  for (let i = 13; i < bytes.length - 7; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) return { flag: bytes[i + 3] & 1, index: bytes[i + 6] };
  return null;
}

test('GIF: a transparent background stays transparent (one palette entry), an opaque one has none', () => {
  const w = 4;
  const h = 2;
  const rgba = new Uint8ClampedArray(w * h * 4);
  // Top row: a red and a blue pixel, the rest see-through; bottom row see-through.
  rgba.set([255, 0, 0, 255], 0);
  rgba.set([0, 0, 255, 255], 4);
  const clear = encodeGif(w, h, rgba, { transparent: true });
  assert.equal(String.fromCharCode(...clear.slice(0, 6)), 'GIF89a');
  const ext = gce(clear);
  assert.ok(ext && ext.flag === 1, 'transparency flag');
  assert.equal(ext.index, 2, 'the entry after the two colours');
  assert.equal(clear.at(-1), 0x3b);
  const opaque = encodeGif(w, h, rgba.map((v, i) => (i % 4 === 3 ? 255 : v)), { transparent: true });
  assert.equal(gce(opaque), null, 'nothing see-through: no transparency block');
  assert.equal(gce(encodeGif(w, h, rgba)), null, 'not asked: no transparency block');
});
