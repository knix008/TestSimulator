// Which files are video / audio / pictures, and the small helpers around them
// (src/lib/media.js, src/lib/images.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_EXTS, AUDIO_EXTS, isVideoName, isAudioName, isMediaName, formatTime } from '../src/lib/media.js';
import { IMAGE_EXTS, extOf, isImageName, base64ToBytes, withExt } from '../src/lib/images.js';

for (const n of ['clip.mp4', 'CLIP.MKV', 'a.b.webm', 'old.avi', 'x.mov']) {
  test(`isVideoName: ${n}`, () => { assert.equal(isVideoName(n), true); assert.equal(isAudioName(n), false); });
}

for (const n of ['song.mp3', 'SONG.FLAC', 'voice.m4a', 'x.ogg', 'midi.mid']) {
  test(`isAudioName: ${n}`, () => { assert.equal(isAudioName(n), true); assert.equal(isVideoName(n), false); });
}

test('isMediaName: video or audio, nothing else', () => {
  assert.equal(isMediaName('a.mp4'), true);
  assert.equal(isMediaName('a.wav'), true);
  for (const n of ['a.txt', 'mp4', '', null, undefined, 'a.']) assert.equal(isMediaName(n), false, String(n));
});

test('the video and audio extension lists do not overlap and are lower case', () => {
  assert.deepEqual(VIDEO_EXTS.filter((e) => AUDIO_EXTS.includes(e)), []);
  for (const e of [...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS]) assert.equal(e, e.toLowerCase());
});

for (const [sec, want] of [[0, '0:00'], [5, '0:05'], [59.9, '0:59'], [60, '1:00'], [3599, '59:59'], [3600, '1:00:00'], [3725, '1:02:05'], [36000, '10:00:00']]) {
  test(`formatTime(${sec}) → ${want}`, () => assert.equal(formatTime(sec), want));
}

test('formatTime: an unknown or negative duration shows dashes', () => {
  for (const v of [NaN, Infinity, -1, undefined]) assert.equal(formatTime(v), '–:––', String(v));
});

test('extOf: lower-case extension; a leading dot is no extension', () => {
  assert.equal(extOf('Photo.JPG'), 'jpg');
  assert.equal(extOf('archive.tar.gz'), 'gz');
  assert.equal(extOf('.bashrc'), '');
  assert.equal(extOf('noext'), '');
  assert.equal(extOf(null), '');
});

test('isImageName: browser formats and the ones decoded here (HEIC, DICOM, TIFF)', () => {
  for (const n of ['a.png', 'b.JPEG', 'c.webp', 'd.svg', 'e.heic', 'f.dcm', 'g.tiff', 'h.avif']) assert.equal(isImageName(n), true, n);
  for (const n of ['a.psd', 'b.txt', 'png', '.png']) assert.equal(isImageName(n), false, n);
});

test('base64ToBytes decodes to the original bytes', () => {
  const src = Buffer.from([0, 1, 2, 250, 255, 128]);
  assert.deepEqual(Array.from(base64ToBytes(src.toString('base64'))), Array.from(src));
  assert.equal(base64ToBytes('').length, 0);
});

test('withExt replaces the extension or adds one', () => {
  assert.equal(withExt('photo.heic', 'png'), 'photo.png');
  assert.equal(withExt('a.b.c', 'jpg'), 'a.b.jpg');
  assert.equal(withExt('README', 'txt'), 'README.txt');
  assert.equal(withExt('.hidden', 'png'), '.hidden.png');
});
