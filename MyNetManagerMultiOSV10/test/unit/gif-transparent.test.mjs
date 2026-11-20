// GIF writer: an opaque picture as before, and with { transparent: true } the see-through pixels get a palette
// entry marked transparent in a Graphic Control Extension (GIF89a).
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGif, TRANSPARENT_FORMATS } from '../../src/domain/export/images.js';

function picture() {
  // 4×2: left half transparent, right half red / blue.
  const rgba = new Uint8ClampedArray(4 * 2 * 4);
  const set = (x, y, r, g, b, a) => { const i = (y * 4 + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a; };
  for (let y = 0; y < 2; y++) { set(0, y, 0, 0, 0, 0); set(1, y, 0, 0, 0, 10); set(2, y, 255, 0, 0, 255); set(3, y, 0, 0, 255, 255); }
  return rgba;
}

test('gif: transparent pixels get a transparent palette entry, opaque pictures have none', () => {
  const clear = encodeGif(4, 2, picture(), { transparent: true });
  assert.equal(String.fromCharCode(...clear.subarray(0, 6)), 'GIF89a');
  const gce = clear.findIndex((b, i) => b === 0x21 && clear[i + 1] === 0xf9 && clear[i + 2] === 0x04);
  assert.ok(gce > 0, 'Graphic Control Extension present');
  assert.equal(clear[gce + 3] & 1, 1, 'transparent colour flag set');
  const index = clear[gce + 6];
  assert.ok(index >= 2, `transparent index ${index} comes after the two colours`);
  const opaque = encodeGif(4, 2, picture());
  assert.equal(opaque.findIndex((b, i) => b === 0x21 && opaque[i + 1] === 0xf9), -1, 'no transparency without the option');
  // A picture with nothing see-through stays as it was.
  const solid = new Uint8ClampedArray(16).fill(255);
  assert.deepEqual([...encodeGif(2, 2, solid, { transparent: true })], [...encodeGif(2, 2, solid)]);
  assert.deepEqual(TRANSPARENT_FORMATS, ['png', 'webp', 'gif', 'avif', 'svg']);
});
