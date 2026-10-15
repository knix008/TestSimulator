// Writing metadata into files: EXIF editing, embedded XMP, IPTC Core in XMP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readMetadata } from '../../src/formats/exif.js';
import { editJpegExif, editMetadataField, embedJpegXmp, parseExifBlock, serializeExifBlock } from '../../src/formats/exif-edit.js';
import { jpegSize, readExifDates, readOrientation, readXmpPacket, segments, stripExif } from '../../src/formats/jpeg-meta.js';
import { buildXmp, parseXmp, updateXmp } from '../../src/formats/xmp.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'photos');
const read = (name) => new Uint8Array(fs.readFileSync(path.join(fixtures, name)));
const exifBlock = (jpeg) => {
  const s = segments(jpeg).find((seg) => seg.marker === 0xe1 && jpeg[seg.dataStart] === 0x45);
  return jpeg.slice(s.dataStart + 6, s.end);
};

test('EXIF block: parse → serialize keeps every tag readable', async () => {
  const beach = read('beach.jpg');
  const model = parseExifBlock(exifBlock(beach));
  const rebuilt = serializeExifBlock(model);
  const again = parseExifBlock(rebuilt);
  assert.deepEqual(again.ifd0.map((e) => e.tag), model.ifd0.map((e) => e.tag));
  assert.deepEqual(again.exif.map((e) => [e.tag, Array.from(e.bytes)]), model.exif.map((e) => [e.tag, Array.from(e.bytes)]));
  assert.equal(again.gps.length, model.gps.length);
});

// features: META-EXIFEDIT
test('EXIF edit: text tags, date taken, GPS change and removal; picture data untouched', async () => {
  const beach = read('beach.jpg');
  const edited = editJpegExif(beach, { artist: '홍길동', copyright: '© 2026', description: 'Beach day', dateTaken: new Date(2022, 0, 2, 3, 4, 5), gps: { lat: -33.8568, lon: 151.2153, alt: 12.5 } });
  const meta = (await readMetadata(edited)).summary;
  assert.equal(meta.artist, '홍길동');
  assert.equal(meta.copyright, '© 2026');
  assert.equal(meta.caption, 'Beach day');
  assert.equal(meta.taken, new Date(2022, 0, 2, 3, 4, 5).getTime());
  assert.ok(Math.abs(meta.lat + 33.8568) < 1e-4 && Math.abs(meta.lon - 151.2153) < 1e-4);
  assert.equal(meta.alt, 12.5);
  assert.equal(meta.camera, 'Canon EOS R5', 'other tags kept');
  assert.equal(meta.iso, 100);
  assert.deepEqual(jpegSize(edited), jpegSize(beach));
  const sos = (bytes) => { const s = segments(bytes).find((seg) => seg.marker === 0xda); return bytes.subarray(s.start); };
  assert.deepEqual(Buffer.from(sos(edited)), Buffer.from(sos(beach)), 'compressed picture identical');
  const noGps = editJpegExif(edited, { gps: null, artist: '' });
  const meta2 = (await readMetadata(noGps)).summary;
  assert.equal(meta2.lat, undefined);
  assert.equal(meta2.artist, undefined);
  assert.equal(readOrientation(editJpegExif(read('city.jpg'), { artist: 'x' })), 6, 'orientation kept');
});

test('EXIF edit on a JPEG without EXIF creates a block', async () => {
  const bare = stripExif(read('forest.jpg'));
  const edited = editJpegExif(bare, { dateTaken: new Date(2020, 5, 6, 7, 8, 9), make: 'Test', model: 'Cam 1' });
  assert.equal(readExifDates(edited).taken.getTime(), new Date(2020, 5, 6, 7, 8, 9).getTime());
  assert.equal((await readMetadata(edited)).summary.camera, 'Test Cam 1');
});

// features: META-EMBED META-IPTC
test('XMP embedded in JPEG: added, replaced, read back with IPTC fields', async () => {
  const beach = read('beach.jpg');
  const fields = { rating: 5, label: 'green', keywords: ['sea'], caption: 'Hello', author: 'Kim', copyright: '© Kim', headline: 'Summer', city: 'Busan', country: 'Korea', sublocation: 'Haeundae', credit: 'Me', usageTerms: 'CC BY' };
  const once = embedJpegXmp(beach, buildXmp(fields));
  const twice = embedJpegXmp(once, buildXmp({ ...fields, rating: 3 }));
  const packets = segments(twice).filter((s) => s.marker === 0xe1 && twice[s.dataStart] === 0x68);
  assert.equal(packets.length, 1, 'one XMP segment');
  const parsed = parseXmp(readXmpPacket(twice));
  assert.equal(parsed.rating, 3);
  for (const key of ['author', 'copyright', 'headline', 'city', 'country', 'sublocation', 'credit', 'usageTerms']) assert.equal(parsed[key], fields[key], key);
  const meta = (await readMetadata(twice)).summary;
  assert.equal(meta.xmpRating, 3);
  assert.equal(meta.city, 'Busan');
  assert.equal(meta.camera, 'Canon EOS R5', 'EXIF still there');
});

test('metadata fields: lens, ISO, date and latitude write back without dropping the rest', async () => {
  const beach = read('beach.jpg');
  let bytes = editMetadataField(beach, 'exif', 'LensModel', 'Test Lens 50mm');
  bytes = editMetadataField(bytes, 'exif', 'ISO', '320');
  bytes = editMetadataField(bytes, 'exif', 'ExposureTime', '1/500');
  bytes = editMetadataField(bytes, 'exif', 'DateTimeOriginal', '2020-01-02 03:04:05');
  bytes = editMetadataField(bytes, 'image', 'Artist', '편집자');
  bytes = editMetadataField(bytes, 'gps', 'latitude', '1.5');
  const meta = (await readMetadata(bytes)).summary;
  assert.equal(meta.lens, 'Test Lens 50mm');
  assert.equal(meta.iso, 320);
  assert.equal(meta.exposure, 1 / 500);
  assert.equal(meta.artist, '편집자');
  assert.equal(meta.taken, new Date(2020, 0, 2, 3, 4, 5).getTime());
  assert.ok(Math.abs(meta.lat - 1.5) < 1e-4);
  assert.ok(Math.abs(meta.lon - 129.1604) < 1e-3, 'longitude kept');
  assert.equal(meta.camera, 'Canon EOS R5');
});

test('XMP update replaces IPTC fields and keeps foreign ones', () => {
  const existing = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" photoshop:City="Old" crs:Temperature="5000"/></rdf:RDF></x:xmpmeta>';
  const updated = updateXmp(existing, { city: 'New', rating: 2 });
  assert.ok(updated.includes('crs:Temperature="5000"'));
  assert.ok(!updated.includes('photoshop:City="Old"'));
  assert.equal(parseXmp(updated).city, 'New');
  assert.equal(parseXmp(updated).rating, 2);
});
