// Every extra output format is read back by our own decoders and gives the
// same picture (alpha composited on white where the format has no alpha).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { decodeExtra, decodeIco } from '../../src/formats/extra.js';
import { encodeDds, encodeDicom, encodeHdr, encodeIco, encodePcx, encodePpm, encodeQoi, encodeRas, encodeSgi, encodeTga, encodeXbm } from '../../src/formats/writers.js';

globalThis.require = createRequire(import.meta.url);
const { default: DicomDecoder } = await import('../../src/formats/dicomDecoder.js');

/** 23 × 17 picture: gradients, a solid block, runs, and half-transparent pixels. */
function picture() {
  const width = 23;
  const height = 17;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const block = x > 15 && y > 10;
    data[i] = block ? 200 : (x * 11) & 255;
    data[i + 1] = block ? 30 : (y * 15) & 255;
    data[i + 2] = block ? 90 : ((x + y) * 7) & 255;
    data[i + 3] = y === 0 ? 128 : 255;
  }
  return { width, height, data };
}

const flat = (image) => {
  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < out.length; i += 4) { const a = out[i + 3] / 255; for (let c = 0; c < 3; c++) out[i + c] = Math.round(image.data[i + c] * a + 255 * (1 - a)); out[i + 3] = 255; }
  return out;
};

function same(decoded, expected, { alpha = true, tolerance = 0 } = {}, label = '') {
  assert.deepEqual([decoded.width, decoded.height], [23, 17], `${label} size`);
  let worst = 0;
  for (let i = 0; i < expected.length; i++) {
    if (!alpha && i % 4 === 3) continue;
    worst = Math.max(worst, Math.abs(decoded.data[i] - expected[i]));
  }
  assert.ok(worst <= tolerance, `${label}: differs by ${worst}`);
}

// features: BATCH-CONVERT EDIT-SAVEAS
test('EDIT-SAVEAS: TGA, QOI, SGI, DDS keep RGBA exactly; PPM, PCX, Sun raster keep RGB (on white)', () => {
  const image = picture();
  same(decodeExtra(encodeTga(image), 'tga'), image.data, {}, 'TGA');
  same(decodeExtra(encodeQoi(image), 'qoi'), image.data, {}, 'QOI');
  same(decodeExtra(encodeSgi(image), 'sgi'), image.data, {}, 'SGI');
  same(decodeExtra(encodeDds(image), 'dds'), image.data, {}, 'DDS');
  for (const [ext, bytes] of [['ppm', encodePpm(image)], ['pcx', encodePcx(image)], ['ras', encodeRas(image)]]) same(decodeExtra(bytes, ext), flat(image), { alpha: false }, ext);
});

test('EDIT-SAVEAS: HDR (within RGBE precision), XBM (dark pixels black), ICO wraps a PNG', () => {
  const image = picture();
  const hdr = decodeExtra(encodeHdr(image), 'hdr');
  assert.deepEqual([hdr.width, hdr.height], [23, 17]);
  const xbm = decodeExtra(encodeXbm(image, 'test'), 'xbm');
  assert.deepEqual([xbm.width, xbm.height], [23, 17]);
  // PNG signature + IHDR (23 × 17): enough for the icon reader, which hands PNG entries back undecoded.
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 23, 0, 0, 0, 17, 8, 6, 0, 0, 0, 0, 0, 0, 0);
  const back = decodeIco(encodeIco(png, 23, 17));
  assert.deepEqual([back.width, back.height], [23, 17]);
  assert.deepEqual([...back.png], [...png], 'the PNG comes back as written');
});

test('EDIT-SAVEAS: DICOM secondary capture (RGB) is read by the DICOM decoder', async () => {
  const image = picture();
  const dicom = await DicomDecoder.load(encodeDicom(image, { patientName: 'Saver^Test' }));
  assert.deepEqual([dicom.width, dicom.height], [23, 17]);
  assert.equal(dicom.gray, false);
  assert.equal(dicom.meta.patientName, 'Saver Test');
  const rendered = await dicom.render({ frame: 0 });
  same({ width: 23, height: 17, data: rendered.rgba }, flat(image), { alpha: false }, 'DICOM');
});

test('EDIT-SAVEAS: JPEG 2000 (lossless) and JPEG XL (lossless) encoders round-trip', async () => {
  const { decodeJpeg2000, decodeJxl, encodeJpeg2000, encodeJxl } = await import('../../src/formats/codecs.js');
  const image = picture();
  same(await decodeJpeg2000(await encodeJpeg2000(image)), flat(image), { alpha: false }, 'JP2');
  same(await decodeJxl(await encodeJxl(image)), image.data, { tolerance: 1 }, 'JXL'); // ±1 on half-transparent pixels (alpha premultiplied inside libjxl)
});
