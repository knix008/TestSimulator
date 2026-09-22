// The sample files (samples/, made by scripts/generate-samples.mjs) and how the hosts hand them to the
// viewer: core readFile classifies every image / video / audio format, the DICOM samples parse with their
// frame counts, the images decode, and the web server streams media with Range support (/api/media).
// The rendering itself (HEIC / DICOM / TIFF decoders, <video>) is checked in the smoke test:
//   npm run build && npm run smoke -- --scenario samples
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fsops = require('../core/fsops.js');
const dicomParser = require('dicom-parser');
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const samples = path.join(root, 'samples');
const file = (name) => path.join(samples, name);

// Every format the viewer / preview window is expected to open, with what readFile must call it.
const EXPECTED = {
  'sample.png': 'image', 'sample.jpg': 'image', 'sample.gif': 'image', 'sample.webp': 'image', 'sample.bmp': 'image', 'sample.svg': 'image',
  'sample.ico': 'image', 'sample.avif': 'image', 'sample.tiff': 'image', 'sample.heic': 'image',
  'CT_small.dcm': 'image', 'JPEG2000.dcm': 'image', 'SC_rgb_small_odd.dcm': 'image', 'multiframe.dcm': 'image', 'multiframe_color.dcm': 'image',
  'sample.pdf': 'pdf',
  'sample.mp4': 'media', 'sample.webm': 'media', 'sample_audio.webm': 'media', 'sample.wav': 'media',
};

test('samples/: every expected file is there', () => {
  for (const name of Object.keys(EXPECTED)) assert.ok(fs.existsSync(file(name)), `${name} missing — run node scripts/generate-samples.mjs`);
});

test('readFile: images are read whole (base64), video / audio are only named (kind media, nothing read)', async () => {
  for (const [name, kind] of Object.entries(EXPECTED)) {
    const r = await fsops.readFile(file(name));
    assert.equal(r.kind, kind, name);
    if (kind === 'pdf') { assert.ok(!r.base64); assert.equal(r.mime, 'application/pdf'); continue; }
    if (kind === 'image') { assert.ok(r.base64 && r.base64.length > 0, `${name}: base64`); assert.equal(r.truncated, false); assert.ok(r.mime, `${name}: mime`); }
    else { assert.ok(!r.base64, `${name}: must not be read`); assert.ok(['video', 'audio'].includes(r.media), `${name}: media kind`); assert.ok(r.mime.startsWith(`${r.media}/`)); }
  }
  assert.equal((await fsops.readFile(file('sample.wav'))).media, 'audio');
  assert.equal((await fsops.readFile(file('sample.mp4'))).media, 'video');
  assert.equal(fsops.mediaKind('x.MP3'), 'audio');
  assert.equal(fsops.mediaKind('x.mkv'), 'video');
  assert.equal(fsops.mediaKind('x.txt'), null);
  // .ts is TypeScript when it is text, MPEG-TS when it is not
  assert.equal((await fsops.readFile(path.join(root, 'test', 'samples.test.mjs'))).kind, 'text');
});

test('DICOM samples parse; the multi-frame ones report their frames', () => {
  const frames = (name) => { const ds = dicomParser.parseDicom(fs.readFileSync(file(name))); return Number(ds.string('x00280008') || 1); };
  assert.equal(frames('CT_small.dcm'), 1);
  assert.equal(frames('JPEG2000.dcm'), 1);
  assert.equal(frames('multiframe.dcm'), 10);
  assert.equal(frames('multiframe_color.dcm'), 30);
  const ds = dicomParser.parseDicom(fs.readFileSync(file('JPEG2000.dcm')));
  assert.equal(ds.string('x00020010'), '1.2.840.10008.1.2.4.91');   // JPEG 2000 — decoded by the openjpeg codec in the renderer
});

test('image samples decode (sharp) with the expected sizes; the GIF is animated', async () => {
  const size = async (name, opts) => { const m = await sharp(file(name), opts).metadata(); return [m.width, m.height, m.pages || 1]; };
  assert.deepEqual(await size('sample.png'), [320, 240, 1]);
  assert.deepEqual(await size('sample.jpg'), [320, 240, 1]);
  assert.deepEqual(await size('sample.webp'), [320, 240, 1]);
  assert.deepEqual(await size('sample.tiff'), [320, 240, 1]);
  assert.deepEqual(await size('sample.avif'), [320, 240, 1]);
  assert.deepEqual((await size('sample.gif', { animated: true })).slice(0, 1).concat([(await size('sample.gif', { animated: true }))[2]]), [160, 6]);
  assert.deepEqual((await size('sample.heic')).slice(0, 2), [1280, 720]);
  // BMP / ICO / WAV / WebM / MP4 are checked by their signatures
  const head = (name, n) => fs.readFileSync(file(name)).subarray(0, n);
  assert.equal(head('sample.bmp', 2).toString('latin1'), 'BM');
  assert.deepEqual([...head('sample.ico', 4)], [0, 0, 1, 0]);
  assert.equal(head('sample.wav', 4).toString('latin1'), 'RIFF');
  assert.deepEqual([...head('sample.webm', 4)], [0x1a, 0x45, 0xdf, 0xa3]);
  assert.equal(head('sample.mp4', 8).subarray(4).toString('latin1'), 'ftyp');
  assert.equal(head('sample.pdf', 5).toString('latin1'), '%PDF-');
});

// ── The web server streams media with Range requests ──
const PORT = 5197;
let server = null;
before(async () => {
  server = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(PORT), '--no-open'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, CC_SMOKE: '1' } });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 10_000);
    server.stdout.on('data', (d) => { if (String(d).includes('http://')) { clearTimeout(t); resolve(); } });
    server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
});
after(() => { if (server) server.kill(); });

const get = (p, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  }).on('error', reject).end();
});

test('GET /api/media: whole file, a byte range (206), HEAD, a bad range (416), a non-media file (415)', async () => {
  const p = file('sample.mp4');
  const size = fs.statSync(p).size;
  const q = `/api/media?path=${encodeURIComponent(p)}`;
  const whole = await get(q);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers['content-type'], 'video/mp4');
  assert.equal(whole.headers['accept-ranges'], 'bytes');
  assert.equal(whole.body.length, size);
  const part = await get(q, { range: 'bytes=100-199' });
  assert.equal(part.status, 206);
  assert.equal(part.headers['content-range'], `bytes 100-199/${size}`);
  assert.equal(part.body.length, 100);
  assert.deepEqual(part.body, whole.body.subarray(100, 200));
  const tail = await get(q, { range: 'bytes=-50' });
  assert.equal(tail.status, 206);
  assert.equal(tail.headers['content-range'], `bytes ${size - 50}-${size - 1}/${size}`);
  const head = await get(q, {}, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers['content-length']), size);
  assert.equal(head.body.length, 0);
  assert.equal((await get(q, { range: `bytes=${size + 10}-` })).status, 416);
  assert.equal((await get(`/api/media?path=${encodeURIComponent(path.join(root, 'package.json'))}`)).status, 415);
  assert.equal((await get(`/api/media?path=${encodeURIComponent(file('nope.mp4'))}`)).status, 404);
  // images are streamed too (the same endpoint serves a picture inline)
  assert.equal((await get(`/api/media?path=${encodeURIComponent(file('sample.png'))}`)).headers['content-type'], 'image/png');
  assert.equal((await get(`/api/media?path=${encodeURIComponent(file('sample.pdf'))}`)).headers['content-type'], 'application/pdf');
});
