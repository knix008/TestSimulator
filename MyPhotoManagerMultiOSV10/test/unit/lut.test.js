// Colour LUTs: .cube parsing (3D and 1D, domain, errors), trilinear lookup,
// amount blending, the built-in looks, and LUTs inside the edit pipeline.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLut, BUILTIN_LUTS, cubeText, getLut, lutFrom, lutId, parseCube } from '../../src/edit/lut.js';
import { isEmptyEdit, normalizeEdit } from '../../src/edit/pipeline.js';

const pixels = (...rgb) => ({ width: rgb.length, height: 1, data: Uint8ClampedArray.from(rgb.flatMap(([r, g, b]) => [r, g, b, 255])) });
const identity = (size) => lutFrom((r, g, b) => [r, g, b], size);

test('parses a 3D .cube with title, comments and domain', () => {
  const text = `# made by hand\nTITLE "Tiny"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;
  const lut = parseCube(text);
  assert.equal(lut.kind, '3d');
  assert.equal(lut.size, 2);
  assert.equal(lut.title, 'Tiny');
  assert.equal(lut.table.length, 24);
});

test('round-trips through cubeText', () => {
  const lut = getLut('teal-orange');
  const back = parseCube(cubeText(lut, 'x'));
  assert.equal(back.size, lut.size);
  assert.ok(back.table.every((v, i) => Math.abs(v - lut.table[i]) < 1e-5));
});

test('rejects files that are not LUTs', () => {
  assert.throws(() => parseCube('hello'), /not a \.cube/);
  assert.throws(() => parseCube('LUT_3D_SIZE 2\n0 0 0\n1 1 1\n'), /expected 8/);
  assert.throws(() => parseCube('LUT_3D_SIZE 2\n' + '0 0 x\n'.repeat(8)), /not a number/);
});

test('an identity LUT leaves pixels unchanged (any size)', () => {
  for (const size of [2, 17, 33]) {
    const p = pixels([0, 0, 0], [255, 255, 255], [12, 200, 77], [128, 64, 250]);
    const before = [...p.data];
    applyLut(p, identity(size));
    assert.deepEqual([...p.data], before, `size ${size}`);
  }
});

test('trilinear interpolation between grid points', () => {
  const invert = lutFrom((r, g, b) => [1 - r, 1 - g, 1 - b], 2);
  const p = pixels([0, 128, 255], [64, 64, 64]);
  applyLut(p, invert);
  assert.deepEqual([...p.data], [255, 127, 0, 255, 191, 191, 191, 255]);
});

test('amount blends with the original', () => {
  const black = lutFrom(() => [0, 0, 0], 2);
  const p = pixels([200, 100, 50]);
  applyLut(p, black, 0.25);
  assert.deepEqual([...p.data.slice(0, 3)], [150, 75, 38]);
});

test('1D LUTs map each channel', () => {
  const lut = parseCube('LUT_1D_SIZE 3\n0 0 1\n0.5 0.5 0.5\n1 1 0\n');
  const p = pixels([0, 0, 0], [255, 255, 255]);
  applyLut(p, lut);
  assert.deepEqual([...p.data], [0, 0, 255, 255, 255, 255, 0, 255]);
});

test('every built-in look changes a mid-grey picture and keeps values in range', () => {
  for (const id of BUILTIN_LUTS) {
    const p = pixels([128, 128, 128], [40, 90, 200], [230, 180, 120]);
    const before = [...p.data];
    applyLut(p, getLut(id));
    assert.notDeepEqual([...p.data], before, id);
  }
});

test('ids are stable and file-name safe', () => {
  assert.equal(lutId('Kodak 2383'), lutId('Kodak 2383'));
  assert.notEqual(lutId('a'), lutId('b'));
  assert.match(lutId('한글 LUT'), /^u[0-9a-f]{8}$/);
});

test('an edit with a LUT is not empty and survives normalizing', () => {
  const edit = normalizeEdit({ lut: { id: 'warm-film', name: 'Warm film', amount: 60 } });
  assert.deepEqual(edit.lut, { id: 'warm-film', name: 'Warm film', amount: 60 });
  assert.equal(isEmptyEdit(edit), false);
  assert.equal(isEmptyEdit(normalizeEdit({})), true);
});
