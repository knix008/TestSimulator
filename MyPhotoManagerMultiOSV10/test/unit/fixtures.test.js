// The generated test files in test/fixtures/formats decode with the app's own
// decoders, and every format shows the same picture (mean colour within a
// small tolerance of the reference TGA).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import UTIF from 'utif2';
import { decodeJpeg2000, decodeJxl } from '../../src/formats/codecs.js';
import { decodeExtra } from '../../src/formats/extra.js';
import { readIfd, tiffHeader } from '../../src/formats/tiffstruct.js';
import { readZip, extractZip } from '../../src/formats/zip.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'formats');
const read = (name) => new Uint8Array(fs.readFileSync(path.join(dir, name)));
const skip = !fs.existsSync(dir) && 'run npm run fixtures first';

/** Frames of a GIF: walks the blocks (extensions, image descriptors) to the trailer. */
function gifFrames(bytes) {
  let p = 13;
  if (bytes[10] & 0x80) p += 3 * 2 ** ((bytes[10] & 7) + 1);
  const skipSubBlocks = () => { while (bytes[p]) p += bytes[p] + 1; p += 1; };
  let frames = 0;
  while (p < bytes.length && bytes[p] !== 0x3b) {
    if (bytes[p] === 0x21) { p += 2; skipSubBlocks(); continue; }
    if (bytes[p] !== 0x2c) throw new Error('bad GIF block at ' + p);
    frames += 1;
    const packed = bytes[p + 9];
    p += 10;
    if (packed & 0x80) p += 3 * 2 ** ((packed & 7) + 1);
    p += 1;
    skipSubBlocks();
  }
  return frames;
}

function mean(image) {
  const sum = [0, 0, 0];
  const n = image.width * image.height;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) sum[c] += image.data[i * 4 + c];
  return sum.map((v) => v / n);
}

test('FMT-EXTRA / FMT-ICO: TGA, PPM, QOI, DDS, SGI, RAS, PCX, ICO, HDR, XBM decode to the same picture', { skip }, () => {
  const reference = decodeExtra(read('scene.tga'), 'tga');
  assert.ok(reference.width > 50 && reference.height > 30);
  const ref = mean(reference);
  for (const ext of ['ppm', 'qoi', 'dds', 'sgi', 'ras', 'pcx', 'ico']) {
    const image = decodeExtra(read(`scene.${ext}`), ext);
    assert.equal(image.width, reference.width, ext);
    assert.equal(image.height, reference.height, ext);
    mean(image).forEach((v, c) => assert.ok(Math.abs(v - ref[c]) < 1.5, `${ext} channel ${c}: ${v} vs ${ref[c]}`));
  }
  // HDR is tone-mapped, so only the size and a plausible picture are checked.
  const hdr = decodeExtra(read('scene.hdr'), 'hdr');
  assert.deepEqual([hdr.width, hdr.height], [reference.width, reference.height]);
  assert.ok(mean(hdr).some((v) => v > 20));
  const xbm = decodeExtra(read('checker.xbm'), 'xbm');
  assert.deepEqual([xbm.width, xbm.height], [32, 24]);
});

test('FMT-JP2 / FMT-JXL: JPEG 2000 and JPEG XL fixtures decode losslessly', { skip }, async () => {
  const reference = decodeExtra(read('scene.tga'), 'tga');
  for (const [name, decode] of [['scene.jp2', decodeJpeg2000], ['scene.jxl', decodeJxl]]) {
    const image = await decode(read(name));
    assert.deepEqual([image.width, image.height], [reference.width, reference.height], name);
    let worst = 0;
    for (let i = 0; i < image.width * image.height * 4; i++) if (i % 4 !== 3) worst = Math.max(worst, Math.abs(image.data[i] - reference.data[i]));
    assert.ok(worst <= 1, `${name} differs by ${worst}`);
  }
});

test('FMT-TIFFPAGES: multi-page TIFF has two pages', { skip }, () => {
  const ifds = UTIF.decode(read('pages.tif'));
  assert.equal(ifds.length, 2);
});

test('FMT-PDF / CREATE-PDF: PDF fixture has two pages', { skip }, () => {
  const text = Buffer.from(read('document.pdf')).toString('latin1');
  assert.match(text, /^%PDF-1\./);
  assert.match(text, /\/Type \/Pages \/Kids \[[^\]]+\] \/Count 2/);
});

test('FMT-ZIP / CREATE-ZIP: ZIP fixture holds three JPEGs', { skip }, () => {
  const zip = read('album.zip');
  const entries = readZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ['zipped/photo-1.jpg', 'zipped/photo-2.jpg', 'zipped/photo-3.jpg']);
  const first = extractZip(zip, entries[0]);
  assert.deepEqual([first[0], first[1]], [0xff, 0xd8]);
});

test('FMT-GIF / CREATE-GIF: animated GIF has two frames and loops', { skip }, () => {
  const gif = Buffer.from(read('animation.gif'));
  assert.equal(gif.toString('latin1', 0, 6), 'GIF89a');
  assert.ok(gif.includes('NETSCAPE2.0'));
  assert.equal(gifFrames(gif), 2);
});

test('FMT-RAW: sensor.dng is a real Bayer CFA DNG without a preview', { skip }, () => {
  const bytes = read('sensor.dng');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { little, ifd0 } = tiffHeader(view);
  const ifd = readIfd(view, 0, ifd0, little);
  const value = (tag) => ifd.entries.find((e) => e.tag === tag);
  assert.ok(value(262), 'PhotometricInterpretation');
  assert.ok(value(33422), 'CFAPattern');
  assert.ok(value(50706), 'DNGVersion');
  assert.ok(value(50721), 'ColorMatrix1');
  assert.equal(value(0x0201), undefined, 'no JPEG preview');
});

test('FMT-VIDEO: WebM clip has video data', { skip }, () => {
  const webm = read('clip.webm');
  assert.deepEqual([...webm.slice(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
  assert.ok(webm.length > 2000, `only ${webm.length} bytes`);
});
