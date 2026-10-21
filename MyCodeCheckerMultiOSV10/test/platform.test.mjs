import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeIco, encodeIcns } from '../scripts/icons.mjs';
import { rejectReason } from '../scripts/platform-build.mjs';

test('ICO and ICNS containers start with their magic', () => {
  const rgba = new Uint8Array(16 * 16 * 4).fill(255);
  const ico = encodeIco([{ size: 16, png: new Uint8Array([1, 2, 3]), rgba }]);
  assert.equal(ico[2], 1);
  const png = new Uint8Array([137, 80, 78, 71]);
  const icns = encodeIcns([{ size: 16, png }]);
  assert.equal(Buffer.from(icns.subarray(0, 4)).toString(), 'icns');
});

test('an installer is built on its own operating system', () => {
  assert.equal(rejectReason('linux', 'win32').includes('Linux'), true);
  assert.equal(rejectReason('mac', 'win32').includes('macOS'), true);
  assert.equal(rejectReason('win', 'linux').includes('Windows'), true);
  assert.equal(rejectReason('win', 'win32'), null);
  assert.equal(rejectReason('linux', 'linux'), null);
  assert.equal(rejectReason('mac', 'darwin'), null);
});
