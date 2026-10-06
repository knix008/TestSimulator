// The EXIF reader of the file-info window (src/lib/exif.js), on JPEGs built here byte by byte, and
// the rows it turns the tags into.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readExif, exifRows } from '../src/lib/exif.js';

// A TIFF block: entries are [tag, type, value] — type 2 ASCII (string), 3 SHORT / 4 LONG (number or
// array), 5 RATIONAL (array of [numerator, denominator]). The EXIF and GPS sub-IFDs are linked from IFD0.
function buildTiff({ ifd0 = [], exif = [], gps = [] }, le = true) {
  const b = Buffer.alloc(4096);
  const w16 = (buf, o, v) => (le ? buf.writeUInt16LE(v, o) : buf.writeUInt16BE(v, o));
  const w32 = (buf, o, v) => (le ? buf.writeUInt32LE(v, o) : buf.writeUInt32BE(v, o));
  b.write(le ? 'II' : 'MM', 0, 'latin1'); w16(b, 2, 42);
  let free = 8;
  const place = (list) => {
    const at = free;
    free += 2 + list.length * 12 + 4;
    w16(b, at, list.length);
    list.forEach(([tag, type, value], i) => {
      const e = at + 2 + i * 12;
      let bytes, count;
      if (type === 2) { bytes = Buffer.from(`${value}\0`, 'latin1'); count = bytes.length; }
      else if (type === 5) { count = value.length; bytes = Buffer.alloc(count * 8); value.forEach(([n, d], k) => { w32(bytes, k * 8, n); w32(bytes, k * 8 + 4, d); }); }
      else {
        const a = [].concat(value), size = type === 3 ? 2 : 4;
        count = a.length; bytes = Buffer.alloc(count * size);
        a.forEach((v, k) => (size === 2 ? w16(bytes, k * 2, v) : w32(bytes, k * 4, v)));
      }
      w16(b, e, tag); w16(b, e + 2, type); w32(b, e + 4, count);
      if (bytes.length <= 4) bytes.copy(b, e + 8);
      else { bytes.copy(b, free); w32(b, e + 8, free); free += bytes.length; }
    });
    return at;
  };
  const links = [];
  if (exif.length) links.push([0x8769, 4, place(exif)]);
  if (gps.length) links.push([0x8825, 4, place(gps)]);
  w32(b, 4, place([...ifd0, ...links]));
  return b.subarray(0, free);
}
function jpeg(tiff, { app0 = false } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (app0) parts.push(Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
  if (tiff) {
    const len = 2 + 6 + tiff.length;
    parts.push(Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]), Buffer.from('Exif\0\0', 'latin1'), tiff);
  }
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00, 0x00]));
  return new Uint8Array(Buffer.concat(parts));
}

const CAMERA = {
  ifd0: [[0x010f, 2, 'Canon'], [0x0110, 2, 'Canon EOS R5'], [0x0112, 3, 6], [0x0131, 2, 'Firmware 1.8']],
  exif: [[0x829a, 5, [[1, 250]]], [0x829d, 5, [[28, 10]]], [0x8827, 3, 100], [0x920a, 5, [[50, 1]]], [0xa405, 3, 75], [0x9003, 2, '2024:05:01 10:20:30'], [0xa434, 2, 'RF 50mm F1.8']],
  gps: [[0x0001, 2, 'N'], [0x0002, 5, [[37, 1], [30, 1], [0, 1]]], [0x0003, 2, 'W'], [0x0004, 5, [[122, 1], [15, 1], [0, 1]]], [0x0006, 5, [[120, 1]]]],
};

test('readExif: camera, exposure and GPS tags from a little-endian JPEG', () => {
  const x = readExif(jpeg(buildTiff(CAMERA)));
  assert.equal(x.make, 'Canon');
  assert.equal(x.model, 'Canon EOS R5');
  assert.equal(x.orientation, 6);
  assert.equal(x.exposureTime, 1 / 250);
  assert.equal(x.fNumber, 2.8);
  assert.equal(x.iso, 100);
  assert.equal(x.dateTimeOriginal, '2024:05:01 10:20:30');
  assert.equal(x.gps.latRef, 'N');
  assert.deepEqual(x.gps.lat, [37, 30, 0]);
});

test('readExif: a big-endian (Motorola) block reads the same', () => {
  const x = readExif(jpeg(buildTiff(CAMERA, false)));
  assert.equal(x.model, 'Canon EOS R5');
  assert.equal(x.iso, 100);
  assert.equal(x.focalLength, 50);
});

test('readExif: segments before APP1 (JFIF) are skipped', () => {
  assert.equal(readExif(jpeg(buildTiff({ ifd0: [[0x010f, 2, 'Nikon']] }), { app0: true })).make, 'Nikon');
});

test('readExif: a JPEG without EXIF gives null', () => {
  assert.equal(readExif(jpeg(null, { app0: true })), null);
});

test('readExif: not a JPEG, too short, or garbage gives null and never throws', () => {
  assert.equal(readExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), null);
  assert.equal(readExif(new Uint8Array([0xff])), null);
  assert.equal(readExif(new Uint8Array([0xff, 0xd8, 0x00, 0x11, 0x22, 0x33])), null);
  const broken = jpeg(buildTiff(CAMERA)).subarray(0, 40);
  assert.doesNotThrow(() => readExif(broken));
});

test('readExif: an EXIF block with only unknown tags gives null', () => {
  assert.equal(readExif(jpeg(buildTiff({ ifd0: [[0x9999, 3, 1]] }))), null);
});

test('exifRows: the whole picture of a camera shot', () => {
  const rows = Object.fromEntries(exifRows(readExif(jpeg(buildTiff(CAMERA)))));
  assert.equal(rows.info_camera, 'Canon EOS R5', 'the make is not repeated');
  assert.equal(rows.info_lens, 'RF 50mm F1.8');
  assert.equal(rows.info_taken, '2024:05:01 10:20:30');
  assert.equal(rows.info_exposure, '1/250 s  ·  f/2.8  ·  ISO 100  ·  50 mm (75 mm)');
  assert.equal(rows.info_orientation, '6');
  assert.equal(rows.info_software, 'Firmware 1.8');
  assert.equal(rows.info_gps, '37.500000, -122.250000  ·  120 m');
});

test('exifRows: nothing → no rows', () => {
  assert.deepEqual(exifRows(null), []);
  assert.deepEqual(exifRows({}), []);
});

test('exifRows: make and model are joined when the model does not start with the make', () => {
  assert.deepEqual(exifRows({ make: 'SONY', model: 'ILCE-7M4' }), [['info_camera', 'SONY ILCE-7M4']]);
  assert.deepEqual(exifRows({ model: 'Pixel 8' }), [['info_camera', 'Pixel 8']]);
});

test('exifRows: long exposures in seconds, the first ISO of a list', () => {
  const [[, v]] = exifRows({ exposureTime: 2, iso: [400, 800] });
  assert.equal(v, '2 s  ·  ISO 400');
});

test('exifRows: orientation 1 (upright) is not listed', () => {
  assert.deepEqual(exifRows({ orientation: 1 }), []);
});

test('exifRows: the date the picture was taken wins over the file date', () => {
  assert.deepEqual(exifRows({ dateTime: 'file', dateTimeOriginal: 'shot' }), [['info_taken', 'shot']]);
  assert.deepEqual(exifRows({ dateTime: 'file' }), [['info_taken', 'file']]);
});

test('exifRows: southern / western positions are negative; no altitude, no metres', () => {
  const rows = exifRows({ gps: { latRef: 'S', lat: [33, 52, 4.8], lngRef: 'E', lng: [151, 12, 36] } });
  assert.deepEqual(rows, [['info_gps', '-33.868000, 151.210000']]);
});

test('exifRows: an incomplete GPS position is left out', () => {
  assert.deepEqual(exifRows({ gps: { lat: [1, 2] , lng: [3, 4, 5] } }), []);
  assert.deepEqual(exifRows({ gps: { lat: [1, 2, 3] } }), []);
});

test('exifRows: artist and copyright', () => {
  assert.deepEqual(exifRows({ artist: 'Kim', copyright: '© 2024' }), [['info_artist', 'Kim'], ['info_copyright', '© 2024']]);
});
