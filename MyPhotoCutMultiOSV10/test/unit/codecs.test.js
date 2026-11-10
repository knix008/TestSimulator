// Picture formats read and written in plain JS: every encoder's output decodes back to the same pixels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeImage, decodePnm, decodePsd, decodeQoi, decodeTga, decodeTiff, encodeGif, encodePpm, encodeQoi, encodeTga, icoFromPng, sniff, svgFromPng } from '../../src/export/codecs.js';
import { encodeTiff, encodeBmp } from '../../src/export/image-encode.js';
import { pdfFromJpegs } from '../../src/export/files.js';
import { syntheticPortrait } from './synthetic.js';

const { raster } = syntheticPortrait(40, 30);
const same = (a, b, tolerance = 0) => {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]));
  assert.ok(worst <= tolerance, `largest difference ${worst}`);
};

test('codecs: QOI, TGA and TIFF round-trip exactly', async () => {
  same(decodeQoi(encodeQoi(raster.data, 40, 30)), raster);
  same(decodeTga(encodeTga(raster.data, 40, 30)), raster);
  same(await decodeTiff(encodeTiff(raster.data, 40, 30)), raster);
});

test('codecs: PPM (binary and text) and PBM', () => {
  same(decodePnm(encodePpm(raster.data, 40, 30)), raster);
  const text = new TextEncoder().encode('P3\n# hi\n2 1\n255\n255 0 0  0 0 255\n');
  const t = decodePnm(text);
  assert.deepEqual([...t.data], [255, 0, 0, 255, 0, 0, 255, 255]);
  const pbm = decodePnm(new TextEncoder().encode('P1\n2 1\n1 0\n'));
  assert.deepEqual([...pbm.data.slice(0, 4)], [0, 0, 0, 255]);
});

test('codecs: PSD merged picture (raw and RLE)', () => {
  const w = 3; const h = 2;
  const head = [0x38, 0x42, 0x50, 0x53, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, h, 0, 0, 0, w, 0, 8, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const raw = Uint8Array.from([...head, 0, 0, ...Array(w * h).fill(200), ...Array(w * h).fill(100), ...Array(w * h).fill(50)]);
  const a = decodePsd(raw);
  assert.deepEqual([...a.data.slice(0, 4)], [200, 100, 50, 255]);
  const counts = []; const rows = [];
  for (let c = 0; c < 3; c++) for (let y = 0; y < h; y++) { counts.push(0, 2); rows.push(-(w - 1) & 255, [9, 8, 7][c]); }
  const rle = Uint8Array.from([...head, 0, 1, ...counts, ...rows]);
  assert.deepEqual([...decodePsd(rle).data.slice(0, 4)], [9, 8, 7, 255]);
});

test('codecs: GIF, ICO, SVG, PDF and BMP have the right headers', () => {
  const gif = encodeGif(raster.data, 40, 30);
  assert.equal(new TextDecoder().decode(gif.slice(0, 6)), 'GIF89a');
  assert.equal(gif[gif.length - 1], 0x3b);
  const ico = icoFromPng(new Uint8Array([1, 2, 3]), 40, 30);
  assert.deepEqual([...ico.slice(0, 6)], [0, 0, 1, 0, 1, 0]);
  const svg = new TextDecoder().decode(svgFromPng(new Uint8Array([1, 2]), 40, 30, (b) => Buffer.from(b).toString('base64')));
  assert.ok(svg.includes('<svg') && svg.includes('data:image/png;base64,AQI='));
  const pdf = new TextDecoder('latin1').decode(pdfFromJpegs([{ jpeg: new Uint8Array([0xff, 0xd8]), width: 40, height: 30 }]));
  assert.ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'));
  const bmp = encodeBmp(raster.data, 40, 30);
  assert.equal(String.fromCharCode(bmp[0], bmp[1]), 'BM');
});

test('codecs: the first bytes tell the format', async () => {
  assert.equal(sniff(encodeTiff(raster.data, 4, 4)), 'tiff');
  assert.equal(sniff(encodeQoi(raster.data, 40, 30)), 'qoi');
  assert.equal(sniff(new TextEncoder().encode('P6\n1 1\n255\nabc')), 'pnm');
  assert.equal(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), null);
  await assert.rejects(decodeImage('nope', new Uint8Array(4)));
});
