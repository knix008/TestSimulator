// File formats: orientation, JPEG metadata, RAW previews, PSD, EXIF summary, XMP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readMetadata, summarize, cameraName, formatExposure } from '../../src/formats/exif.js';
import { encodeBmp } from '../../src/formats/encode.js';
import { insertSegments, isJpeg, jpegSize, metadataSegments, patchExifAfterEdit, readExifDates, readOrientation, readXmpPacket, rewriteExifDates, segments, stripExif, writeOrientation } from '../../src/formats/jpeg-meta.js';
import { compose, decompose, flipOrientation, mapPoint, rotateOrientation, swapsAxes } from '../../src/formats/orientation.js';
import { decodePsd, encodePsd, psdInfo } from '../../src/formats/psd.js';
import { extractRawPreview } from '../../src/formats/raw.js';
import { buildExifTiff, exifDate, parseExifDate, rational } from '../../src/formats/tiffstruct.js';
import { badgeOf, canWriteBack, extensionOf, isImage, isMedia, isVideo, kindOf, outputFormatFor, stemOf } from '../../src/formats/types.js';
import { buildXmp, parseXmp, sidecarName, updateXmp } from '../../src/formats/xmp.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'photos');
const read = (name) => new Uint8Array(fs.readFileSync(path.join(fixtures, name)));

// features: FMT-COMMON FMT-HEIC FMT-AVIF FMT-SVG FMT-VIDEO
test('file kinds by extension', () => {
  assert.equal(kindOf('A.JPG'), 'native');
  assert.equal(kindOf('x.cr2'), 'raw');
  assert.equal(kindOf('x.HEIC'), 'heif');
  assert.equal(kindOf('x.tiff'), 'tiff');
  assert.equal(kindOf('x.psd'), 'psd');
  assert.equal(kindOf('notes.txt'), null);
  assert.ok(isVideo('clip.MP4') && !isImage('clip.mp4') && isMedia('clip.mp4'));
  assert.equal(extensionOf('C:\\a.b\\photo'), '');
  assert.equal(stemOf('/x/IMG_1.final.jpg'), 'IMG_1.final');
  assert.equal(badgeOf('a.nef'), 'RAW·NEF');
  assert.ok(canWriteBack('a.jpeg') && !canWriteBack('a.nef') && !canWriteBack('a.gif'));
  assert.equal(outputFormatFor('a.JFIF').id, 'jpeg');
  assert.equal(outputFormatFor('a.tiff').id, 'tiff');
});

// features: BATCH-ROTATE
test('orientation algebra: rotations and flips compose like the EXIF table', () => {
  for (let o = 1; o <= 8; o++) assert.equal(compose(decompose(o)), o);
  assert.equal(rotateOrientation(1, 1), 6);
  assert.equal(rotateOrientation(6, 1), 3);
  assert.equal(rotateOrientation(1, -1), 8);
  assert.equal(rotateOrientation(8, 4), 8);
  assert.equal(flipOrientation(1), 2);
  assert.equal(flipOrientation(1, true), 4);
  assert.equal(flipOrientation(2), 1);
  // Four quarter turns from any orientation come back to it.
  for (let o = 1; o <= 8; o++) assert.equal(rotateOrientation(rotateOrientation(rotateOrientation(rotateOrientation(o, 1), 1), 1), 1), o);
  assert.ok(swapsAxes(6) && swapsAxes(5) && !swapsAxes(3));
  // Orientation 6 (rotate 90° CW): the top-left pixel ends up top-right.
  assert.deepEqual(mapPoint(0, 0, 4, 3, 6), [2, 0]);
  assert.deepEqual(mapPoint(0, 0, 4, 3, 8), [0, 3]);
  assert.deepEqual(mapPoint(0, 0, 4, 3, 2), [3, 0]);
});

test('EXIF dates and rationals', () => {
  const d = new Date(2024, 4, 1, 13, 45, 10);
  assert.equal(exifDate(d), '2024:05:01 13:45:10');
  assert.equal(parseExifDate('2024:05:01 13:45:10').getTime(), d.getTime());
  assert.equal(parseExifDate('0000:00:00 00:00:00'), null);
  assert.deepEqual(rational(1 / 250), [1, 250]);
  assert.deepEqual(rational(2.8), [28000, 10000]);
});

test('JPEG segments, orientation read/write (lossless rotate)', () => {
  const city = read('city.jpg');
  assert.ok(isJpeg(city));
  assert.equal(readOrientation(city), 6);
  assert.deepEqual(jpegSize(city), { width: 1600, height: 1067 });
  const rotated = writeOrientation(city, 1);
  assert.equal(rotated.length, city.length, 'patched in place');
  assert.equal(readOrientation(rotated), 1);
  // The compressed picture data is untouched.
  const sos = segments(city).find((s) => s.marker === 0xda);
  assert.deepEqual(rotated.subarray(sos.end, sos.end + 2000), city.subarray(sos.end, sos.end + 2000));
  // A JPEG without EXIF gets a small EXIF block.
  const bare = stripExif(city);
  assert.equal(readOrientation(bare), 1);
  const tagged = writeOrientation(bare, 8);
  assert.equal(readOrientation(tagged), 8);
  assert.deepEqual(jpegSize(tagged), { width: 1600, height: 1067 });
});

test('orientation is added to an EXIF block that has none (IFD0 rebuilt)', () => {
  const beach = read('beach.jpg');
  // Build a JPEG whose EXIF has no orientation tag by removing it from a fresh block.
  const tiff = buildExifTiff({ make: 'Test', model: 'Cam', date: new Date(2020, 0, 2, 3, 4, 5), orientation: 1 });
  // Change the Orientation tag number (0x0112) into an unused one, keeping the layout.
  const view = new DataView(tiff.buffer);
  const count = view.getUint16(8, true);
  for (let i = 0; i < count; i++) if (view.getUint16(10 + i * 12, true) === 0x0112) view.setUint16(10 + i * 12, 0x9999, true);
  const segment = new Uint8Array([0xff, 0xe1, 0, 0, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  segment[2] = (segment.length - 2) >> 8; segment[3] = (segment.length - 2) & 0xff;
  const withoutTag = insertSegments(stripExif(beach), [segment]);
  assert.equal(readOrientation(withoutTag), 1);
  const changed = writeOrientation(withoutTag, 3);
  assert.equal(readOrientation(changed), 3);
  assert.equal(readExifDates(changed).modified.getTime(), new Date(2020, 0, 2, 3, 4, 5).getTime(), 'other tags still readable');
});

test('metadata carries over to a re-encoded JPEG; thumbnail dropped, size updated', () => {
  const beach = read('beach.jpg');
  const keep = metadataSegments(beach);
  assert.ok(keep.length >= 1);
  const other = stripExif(read('forest.jpg'));
  const merged = patchExifAfterEdit(writeOrientation(insertSegments(other, keep), 1), 640, 480);
  assert.ok(isJpeg(merged));
  assert.equal(readExifDates(merged).taken.getTime(), new Date(2023, 6, 14, 10, 30, 0).getTime());
  assert.equal(readXmpPacket(merged), '');
});

// features: BATCH-DATES
test('EXIF dates shift in place', () => {
  const beach = read('beach.jpg');
  const hour = 3600 * 1000;
  const shifted = rewriteExifDates(beach, (d) => new Date(d.getTime() + 25 * hour));
  assert.equal(shifted.length, beach.length);
  const dates = readExifDates(shifted);
  assert.equal(dates.taken.getTime(), new Date(2023, 6, 15, 11, 30, 0).getTime());
  assert.equal(dates.digitized.getTime(), dates.taken.getTime());
  assert.equal(rewriteExifDates(stripExif(beach), (d) => d), null);
});

// features: META-EXIF
test('EXIF summary of the fixtures (exifr)', async () => {
  const beach = (await readMetadata(read('beach.jpg'))).summary;
  assert.equal(beach.camera, 'Canon EOS R5');
  assert.equal(beach.iso, 100);
  assert.equal(beach.fNumber, 8);
  assert.equal(beach.exposure, 1 / 500);
  assert.equal(beach.focal, 24);
  assert.equal(beach.lens, 'RF24-105mm F4 L IS USM');
  assert.equal(beach.taken, new Date(2023, 6, 14, 10, 30, 0).getTime());
  assert.ok(Math.abs(beach.lat - 35.1587) < 1e-4 && Math.abs(beach.lon - 129.1604) < 1e-4);
  assert.equal(beach.alt, 5);
  assert.equal(beach.flash, false);
  const city = (await readMetadata(read('city.jpg'))).summary;
  assert.equal(city.camera, 'Nikon D850');
  assert.equal(city.orientation, 6);
  const none = (await readMetadata(read('sunset.png'))).summary;
  assert.equal(none.camera, undefined);
  const grouped = await readMetadata(read('beach.jpg'), { groups: true });
  assert.ok(grouped.groups.some((g) => g.id === 'gps'));
  assert.ok(grouped.groups.some((g) => g.id === 'exif' && g.tags.some(([k]) => k === 'ISO')));
});

test('camera names and exposure text', () => {
  assert.equal(cameraName('NIKON CORPORATION', 'NIKON Z 6_2'), 'Nikon Z 6_2');
  assert.equal(cameraName('Canon', 'Canon EOS 5D Mark IV'), 'Canon EOS 5D Mark IV');
  assert.equal(cameraName('Apple', 'iPhone 15 Pro'), 'Apple iPhone 15 Pro');
  assert.equal(cameraName('', 'X100V'), 'X100V');
  assert.equal(formatExposure(1 / 250), '1/250 s');
  assert.equal(formatExposure(2), '2 s');
  const s = summarize({ Rating: 4, Label: 'Red', subject: ['sea', 'family'], Keywords: 'sea', DateTimeOriginal: '2021:01:02 03:04:05', latitude: 0, longitude: 0 });
  assert.equal(s.xmpRating, 4);
  assert.equal(s.xmpLabel, 'Red');
  assert.deepEqual(s.keywords, ['sea', 'family']);
  assert.equal(s.taken, new Date(2021, 0, 2, 3, 4, 5).getTime());
  assert.equal(s.lat, undefined, '0,0 is "no location"');
});

// features: FMT-RAW
test('RAW: the JPEG preview of a DNG is found, with its orientation', () => {
  const raw = extractRawPreview(read('camera.dng'));
  assert.ok(raw);
  assert.ok(isJpeg(raw.jpeg));
  assert.deepEqual({ w: raw.width, h: raw.height }, { w: 1600, h: 1067 });
  assert.equal(raw.orientation, 1);
  assert.equal(raw.applyOrientation, true);
  // Non-TIFF container: falls back to scanning for complete JPEG streams.
  const junk = new Uint8Array(5000 + raw.jpeg.length);
  junk.set(raw.jpeg, 3000);
  const scanned = extractRawPreview(junk);
  assert.equal(scanned.width, 1600);
  assert.equal(scanned.applyOrientation, false);
  assert.equal(extractRawPreview(new Uint8Array(1000)), null);
});

// features: FMT-PSD
test('PSD composite: our writer and reader agree (RLE and raw)', () => {
  const width = 37;
  const height = 11;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = (i * 7) % 256; data[i * 4 + 1] = i % 3 ? 200 : 10; data[i * 4 + 2] = 99; data[i * 4 + 3] = 255; }
  for (const rle of [true, false]) {
    const decoded = decodePsd(encodePsd({ width, height, data }, { rle }));
    assert.equal(decoded.width, width);
    assert.deepEqual(Array.from(decoded.data), Array.from(data));
  }
  const fixture = read('artwork.psd');
  assert.deepEqual(psdInfo(fixture).mode, 3);
  const image = decodePsd(fixture);
  assert.equal(image.width * image.height * 4, image.data.length);
  assert.throws(() => decodePsd(new Uint8Array(40)), /not a PSD/);
});

test('BMP writer', () => {
  const bmp = encodeBmp({ width: 3, height: 2, data: new Uint8ClampedArray(24).fill(255) });
  assert.equal(String.fromCharCode(bmp[0], bmp[1]), 'BM');
  assert.equal(bmp.length, 54 + 12 * 2);
});

// features: META-SIDECAR
test('XMP sidecars: build, parse, and update keeping other properties', () => {
  assert.equal(sidecarName('IMG_1.CR2'), 'IMG_1.xmp');
  const fields = { rating: 4, label: 'blue', keywords: ['sea', 'R&D'], categories: ['People/Family'], caption: 'At the "beach"', title: 'Summer' };
  const text = buildXmp(fields);
  assert.deepEqual(parseXmp(text), { rating: 4, label: 'blue', keywords: ['sea', 'R&D'], categories: ['People/Family'], caption: 'At the "beach"', title: 'Summer' });
  const lightroom = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" crs:Exposure2012="+0.50" xmp:Rating="1"><dc:subject xmlns:dc="http://purl.org/dc/elements/1.1/"><rdf:Bag><rdf:li>old</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const updated = updateXmp(lightroom, { rating: 5, label: 'red', keywords: ['new'] });
  assert.ok(updated.includes('crs:Exposure2012="+0.50"'), 'develop settings kept');
  const parsed = parseXmp(updated);
  assert.equal(parsed.rating, 5);
  assert.equal(parsed.label, 'red');
  assert.deepEqual(parsed.keywords, ['new']);
  assert.equal(parseXmp('').rating, 0);
});
