import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeIco, encodeIcns } from '../src/lib/ico.mjs';

const png = (n) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n]);

test('ICO directory describes every entry with the right offsets', () => {
  const ico = encodeIco([{ size: 256, png: png(1) }, { size: 16, png: png(2) }]);
  const v = new DataView(ico.buffer);
  assert.equal(v.getUint16(2, true), 1);
  assert.equal(v.getUint16(4, true), 2);
  assert.equal(ico[6], 16, 'smallest first');
  assert.equal(ico[22], 0, '256 is stored as 0');
  const off16 = v.getUint32(18, true);
  assert.equal(ico[off16 + 4], 2);
  const off256 = v.getUint32(34, true);
  assert.equal(ico[off256 + 4], 1);
});

test('ICNS has the magic, the total length and typed chunks', () => {
  const icns = encodeIcns([{ size: 16, png: png(1) }, { size: 512, png: png(2) }, { size: 100, png: png(3) }]);
  assert.equal(String.fromCharCode(...icns.slice(0, 4)), 'icns');
  assert.equal(new DataView(icns.buffer).getUint32(4, false), icns.length);
  assert.equal(String.fromCharCode(...icns.slice(8, 12)), 'icp4');
  assert.throws(() => encodeIcns([{ size: 100, png: png(1) }]));
});
