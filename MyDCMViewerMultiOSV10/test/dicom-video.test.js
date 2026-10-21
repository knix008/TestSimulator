'use strict';
/* DICOM video (src/js/dicomVideo.js, dicomDecoder.js): H.264 / HEVC streams wrapped into MP4 must decode
 * (ffmpeg, independently) to exactly the same pictures in the same order as the raw elementary stream —
 * B-frames included; the decoder describes video files and hands out their streams. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const V = require('../src/js/dicomVideo.js');
const D = require('../src/js/dicomDecoder.js');

const DIR = path.join(__dirname, '..', 'samples', 'video');
const FILES = { h264: 'us_h264.dcm', hevc: 'us_hevc.dcm', mpeg2: 'us_mpeg2.dcm' };
const read = (f) => new Uint8Array(fs.readFileSync(path.join(DIR, f)));
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dcmv-vt-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const md5s = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', ...args, '-f', 'framemd5', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.split('\n').filter((l) => /^\d/.test(l)).map((l) => l.split(',').pop().trim());
};

test('transfer syntaxes map to codecs', () => {
  assert.strictEqual(V.codecOf('1.2.840.10008.1.2.4.102'), 'h264');
  assert.strictEqual(V.codecOf('1.2.840.10008.1.2.4.106'), 'h264');
  assert.strictEqual(V.codecOf('1.2.840.10008.1.2.4.107'), 'hevc');
  assert.strictEqual(V.codecOf('1.2.840.10008.1.2.4.100'), 'mpeg2');
  assert.strictEqual(V.codecOf('1.2.840.10008.1.2.1'), null);
});

test('Annex B: start codes of 3 and 4 bytes, trailing zeros dropped', () => {
  const b = Uint8Array.from([0, 0, 0, 1, 0x67, 1, 2, 0, 0, 1, 0x68, 3, 0, 0, 0, 0, 1, 0x65, 9, 9]);
  const n = V.nalUnits(b);
  assert.deepStrictEqual(n.map((x) => [...x]), [[0x67, 1, 2], [0x68, 3], [0x65, 9, 9]]);
});

for (const codec of ['h264', 'hevc']) {
  test(`${codec}: the decoder describes the video and extracts the whole stream`, async () => {
    const bytes = read(FILES[codec]);
    const img = await D.load(bytes);
    assert.ok(img.video, 'image.video');
    assert.strictEqual(img.video.codec, codec);
    assert.strictEqual(img.frames, 60);
    assert.strictEqual(img.video.fps, 25);
    const v = await D.extractVideo(bytes);
    assert.strictEqual(v.codec, codec);
    assert.strictEqual(v.width, 640);
    assert.strictEqual(v.stream.length, img.video.stream().length);
    await assert.rejects(img.render({ frame: 1 }), /video engine/);   // in Node there is none
  });

  test(`${codec}: MP4 holds every picture, key frames marked, B-frames reordered`, async () => {
    const v = await D.extractVideo(read(FILES[codec]));
    const a = V.analyze(v.stream, codec);
    assert.strictEqual(a.samples.length, 60);
    assert.ok(a.samples[0].key, 'starts with a key frame');
    assert.ok(a.samples.some((s, i) => i && s.poc < a.samples[i - 1].poc), 'the sample stream has B-frames (display order differs)');
    assert.strictEqual(a.width, 640); assert.strictEqual(a.height, 480);
    const mp4 = V.toMp4(v.stream, { codec, fps: v.fps });
    assert.strictEqual(String.fromCharCode(...mp4.subarray(4, 8)), 'ftyp');
    assert.match(V.mimeCodec(codec, a), codec === 'h264' ? /^avc1\.64/ : /^hvc1\./);
  });

  test(`${codec}: ffmpeg decodes the MP4 to the same frames as the raw stream`, { skip: !ffmpeg && 'ffmpeg not found' }, async () => {
    const v = await D.extractVideo(read(FILES[codec]));
    const mp4 = path.join(tmp, `${codec}.mp4`), es = path.join(tmp, `${codec}.es`);
    fs.writeFileSync(mp4, V.toMp4(v.stream, { codec, fps: v.fps }));
    fs.writeFileSync(es, v.stream);
    const ref = md5s(['-f', codec, '-i', es]);
    const got = md5s(['-i', mp4]);
    assert.strictEqual(got.length, 60);
    assert.deepStrictEqual(got, ref);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=r_frame_rate:format=duration', '-of', 'default=nw=1', mp4], { encoding: 'utf8' }).stdout;
    assert.match(probe, /r_frame_rate=25\/1/);
    assert.match(probe, /duration=2\.4/);
  });
}

test('mpeg2: described as video, extracted as a valid MPEG-2 elementary stream', { skip: !ffmpeg && 'ffmpeg not found' }, async () => {
  const bytes = read(FILES.mpeg2);
  const img = await D.load(bytes);
  assert.strictEqual(img.video.codec, 'mpeg2');
  assert.strictEqual(img.video.playable(), false);
  assert.throws(() => V.toMp4(img.video.stream(), { codec: 'mpeg2' }), /cannot be wrapped/);
  const v = await D.extractVideo(bytes);
  const f = path.join(tmp, 'v.m2v');
  fs.writeFileSync(f, v.stream);
  assert.strictEqual(md5s(['-i', f]).length, 60);
});

test('images are not video', async () => {
  const img = await D.load(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'samples', 'CT_small.dcm'))));
  assert.strictEqual(img.video, null);
  await assert.rejects(D.extractVideo(fs.readFileSync(path.join(__dirname, '..', 'samples', 'CT_small.dcm'))), /no DICOM video/);
});
