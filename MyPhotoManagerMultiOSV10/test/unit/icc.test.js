// ICC colour management: profiles are read (matrix/TRC RGB, grey, gamma /
// parametric / table curves, v2 'desc' and v4 'mluc' names), Adobe RGB is
// converted to the sRGB values the standard matrices give, sRGB itself is left
// alone, and profiles embedded in PSD files are found.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSrgb, parseIcc, psdIcc, toSrgb } from '../../src/formats/icc.js';
import { ADOBE, buildIcc } from '../helpers/icc-build.mjs';

const GAMMA = 563 / 256;
const adobe = () => buildIcc({ desc: 'Adobe RGB (1998)', xyz: ADOBE, curves: { rTRC: ['gamma', GAMMA], gTRC: ['gamma', GAMMA], bTRC: ['gamma', GAMMA] } });

/** The textbook path: Adobe RGB → XYZ (D65) → sRGB. */
function expectedSrgb([r, g, b]) {
  const lin = [r, g, b].map((v) => (v / 255) ** GAMMA);
  const M = [[0.5767309, 0.1855540, 0.1881852], [0.2973769, 0.6273491, 0.0752741], [0.0270343, 0.0706872, 0.9911085]];
  const S = [[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]];
  const xyz = M.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return S.map((row) => row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2]).map((v) => {
    const c = Math.max(0, Math.min(1, v));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  });
}

test('reads an Adobe RGB profile', () => {
  const p = parseIcc(adobe());
  assert.equal(p.description, 'Adobe RGB (1998)');
  assert.equal(p.space, 'RGB');
  assert.ok(p.supported);
  assert.ok(Math.abs(p.curves[0](0.5) - 0.5 ** GAMMA) < 1e-4);
  assert.equal(isSrgb(p), false);
});

test('Adobe RGB pixels become the sRGB values of the standard matrices', () => {
  const convert = toSrgb(parseIcc(adobe()));
  const samples = [[200, 100, 50], [128, 128, 128], [30, 180, 90], [250, 240, 230], [10, 20, 160], [0, 0, 0], [255, 255, 255]];
  const data = new Uint8ClampedArray(samples.flatMap((s) => [...s, 255]));
  convert(data);
  samples.forEach((s, i) => {
    const want = expectedSrgb(s);
    const got = [...data.subarray(i * 4, i * 4 + 3)];
    assert.ok(got.every((v, c) => Math.abs(v - want[c]) <= 2), `${s} → ${got}, expected ${want}`);
    assert.equal(data[i * 4 + 3], 255, 'alpha kept');
  });
  // A saturated Adobe RGB green is more saturated than sRGB can show: red/blue clip to 0.
  const green = new Uint8ClampedArray([0, 200, 0, 255]);
  convert(green);
  assert.ok(green[0] === 0 && green[2] < 40 && green[1] > 190, `green ${[...green]}`);
});

test('an sRGB profile (parametric curve, v4 name) needs no conversion', () => {
  const srgbCurve = ['para3', 2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045];
  const bytes = buildIcc({ desc: 'sRGB IEC61966-2.1', v4: true, xyz: { rXYZ: [0.4360747, 0.2225045, 0.0139322], gXYZ: [0.3850649, 0.7168786, 0.0971045], bXYZ: [0.1430804, 0.0606169, 0.7141733] }, curves: { rTRC: srgbCurve, gTRC: srgbCurve, bTRC: srgbCurve } });
  const p = parseIcc(bytes);
  assert.equal(p.description, 'sRGB IEC61966-2.1');
  assert.ok(isSrgb(p));
  assert.equal(toSrgb(p), null);
});

test('grey profiles and table curves', () => {
  const p = parseIcc(buildIcc({ space: 'GRAY', desc: 'Gray Gamma 1.8', curves: { kTRC: ['gamma', 1.8] } }));
  const data = new Uint8ClampedArray([128, 128, 128, 255]);
  toSrgb(p)(data);
  const want = Math.round(((y) => (y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055))((128 / 255) ** 1.8) * 255);
  assert.ok(Math.abs(data[0] - want) <= 1 && data[0] === data[1] && data[1] === data[2], `grey ${data[0]} vs ${want}`);
  const table = parseIcc(buildIcc({ xyz: ADOBE, curves: { rTRC: ['table', [0, 0.25, 1]], gTRC: ['table', [0, 0.25, 1]], bTRC: ['table', [0, 0.25, 1]] } }));
  assert.ok(Math.abs(table.curves[0](0.5) - 0.25) < 1e-3 && Math.abs(table.curves[0](0.75) - 0.625) < 1e-3, 'table interpolated');
});

test('not a profile; LUT-only profiles are reported unsupported', () => {
  assert.throws(() => parseIcc(new Uint8Array(200)), /not an ICC/);
  const lutOnly = parseIcc(buildIcc({ desc: 'LUT only', xyz: {}, curves: {} }));
  assert.equal(lutOnly.supported, false);
  assert.equal(toSrgb(lutOnly), null);
});

test('finds the profile in a PSD (image resource 1039)', () => {
  const icc = adobe();
  const name = Buffer.from([0, 0]); // empty Pascal name, padded to even
  const size = Buffer.alloc(4); size.writeUInt32BE(icc.length);
  const resource = Buffer.concat([Buffer.from('8BIM'), Buffer.from([0x04, 0x0f]), name, size, Buffer.from(icc), Buffer.alloc(icc.length % 2)]);
  const header = Buffer.alloc(26); header.write('8BPS'); header.writeUInt16BE(1, 4);
  const colorMode = Buffer.alloc(4);
  const resLen = Buffer.alloc(4); resLen.writeUInt32BE(resource.length);
  const psd = new Uint8Array(Buffer.concat([header, colorMode, resLen, resource, Buffer.alloc(16)]));
  const found = psdIcc(psd);
  assert.ok(found && Buffer.from(found).equals(Buffer.from(icc)));
  assert.equal(parseIcc(found).description, 'Adobe RGB (1998)');
});
