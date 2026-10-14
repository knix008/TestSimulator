// Generates the test photos (test/fixtures/photos) and the web build's sample
// photos (public/samples): pictures drawn in headless Edge / Chrome, with real
// EXIF (camera, exposure, date taken, GPS, orientation) written by the app's
// own EXIF code, plus PNG, WebP, BMP, TIFF, PSD, a DNG (camera RAW with a JPEG
// preview), an exact duplicate and a resized near-duplicate.
//
//   npm run fixtures
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import UTIF from 'utif2';
import { encodeBmp } from '../src/formats/encode.js';
import { exifSegment, insertSegments } from '../src/formats/jpeg-meta.js';
import { encodePsd } from '../src/formats/psd.js';
import { cineDicom, encodeJp2, encodeJxl, writeExtraFixtures } from './fixture-formats.mjs';
import { ASCII, buildExifTiff, buildTiff, LONG, SHORT } from '../src/formats/tiffstruct.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test', 'fixtures', 'photos');
const samples = path.join(root, 'public', 'samples');

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];
const browser = browsers.find((candidate) => fs.existsSync(candidate));
if (!browser) { console.error('Edge 또는 Chrome 이 필요합니다.'); process.exit(1); }

const port = 9800 + Math.floor(Math.random() * 150);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'myphoto-fixtures-'));
const child = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 60 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ }
  if (!target) await new Promise((r) => setTimeout(r, 200));
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
const evaluate = (expression) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, (d) => (d.result?.exceptionDetails ? reject(new Error(d.result.exceptionDetails.exception?.description ?? 'error')) : resolve(d.result.result.value)));
  ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

// Scenes drawn in the page; each returns encoded images as base64 plus raw RGBA where needed.
const result = await evaluate(`(async () => {
  const scene = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
  const sky = (g, w, h, top, bottom) => { const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, top); s.addColorStop(1, bottom); g.fillStyle = s; g.fillRect(0, 0, w, h); };
  const beach = scene(1600, 1067, (g, w, h) => {
    sky(g, w, h * 0.55, '#3f8fe0', '#bfe3ff');
    g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(w * 0.78, h * 0.18, 70, 0, 7); g.fill();
    const sea = g.createLinearGradient(0, h * 0.5, 0, h * 0.72); sea.addColorStop(0, '#1d6fb8'); sea.addColorStop(1, '#43b5c9'); g.fillStyle = sea; g.fillRect(0, h * 0.5, w, h * 0.3);
    g.fillStyle = '#e9d29a'; g.beginPath(); g.moveTo(0, h * 0.72); g.quadraticCurveTo(w * 0.5, h * 0.64, w, h * 0.74); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(Math.random() * w, h * 0.5 + Math.random() * h * 0.2, 30 + Math.random() * 60, 2); }
  });
  const city = scene(1600, 1067, (g, w, h) => {
    sky(g, w, h, '#22305e', '#e98a5b');
    for (let i = 0; i < 18; i++) { const bw = 60 + (i * 37) % 70; const bh = 200 + (i * 97) % 420; const x = i * 92; g.fillStyle = ['#2b2f3a', '#363b49', '#1f232c'][i % 3]; g.fillRect(x, h - bh, bw, bh);
      g.fillStyle = '#ffd36a'; for (let y = h - bh + 14; y < h - 20; y += 26) for (let xx = x + 8; xx < x + bw - 10; xx += 18) if ((xx * y) % 7 < 3) g.fillRect(xx, y, 8, 12); }
    g.fillStyle = '#fff'; g.font = 'bold 90px sans-serif'; g.fillText('CITY ↑', 60, 140);
  });
  const forest = scene(1600, 1067, (g, w, h) => {
    sky(g, w, h, '#9fd4a8', '#2f6b3a');
    for (let i = 0; i < 60; i++) { const x = (i * 131) % w; const s = 60 + (i * 53) % 120; const y = h * 0.45 + (i * 71) % (h * 0.5); g.fillStyle = ['#1e5631', '#2d7a3e', '#174a2a'][i % 3];
      g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x - s * 0.6, y); g.lineTo(x + s * 0.6, y); g.fill(); g.fillStyle = '#5a3b1e'; g.fillRect(x - 6, y, 12, s * 0.3); }
  });
  const sunset = scene(1200, 800, (g, w, h) => {
    sky(g, w, h, '#ff7e5f', '#2b1055'); g.fillStyle = '#ffd56b'; g.beginPath(); g.arc(w / 2, h * 0.62, 110, 0, 7); g.fill();
    g.fillStyle = '#120a2a'; g.fillRect(0, h * 0.68, w, h);
  });
  const flower = scene(1000, 1000, (g, w, h) => {
    sky(g, w, h, '#f7f1e3', '#d6e4c8');
    g.translate(w / 2, h / 2); for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillStyle = i % 2 ? '#e84a7f' : '#f06292'; g.beginPath(); g.ellipse(0, -170, 70, 170, 0, 0, 7); g.fill(); }
    g.fillStyle = '#ffca28'; g.beginPath(); g.arc(0, 0, 90, 0, 7); g.fill();
  });
  const portrait = scene(900, 1200, (g, w, h) => {
    sky(g, w, h, '#c9d6df', '#52616b'); g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(w / 2, h * 0.38, 190, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2 - 70, h * 0.36, 34, 0, 7); g.arc(w / 2 + 70, h * 0.36, 34, 0, 7); g.fill();
    g.fillStyle = '#d0021b'; g.beginPath(); g.arc(w / 2 - 70, h * 0.36, 16, 0, 7); g.arc(w / 2 + 70, h * 0.36, 16, 0, 7); g.fill();
    g.fillStyle = '#34495e'; g.fillRect(w * 0.2, h * 0.62, w * 0.6, h * 0.4);
  });
  // A two-second WebM clip (a moving sun) recorded from a canvas.
  const recordVideo = () => new Promise((resolve) => {
    const c = scene(320, 240, () => {}); const g = c.getContext('2d');
    document.body.append(c); const stream = c.captureStream(0); const track = stream.getVideoTracks()[0]; const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 800000 });
    const parts = []; recorder.ondataavailable = (e) => parts.push(e.data);
    recorder.onstop = async () => { const b = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); resolve(btoa(s)); };
    let f = 0; const tick = () => { sky(g, 320, 240, '#3f8fe0', '#ffd0a0'); g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(20 + f * 6, 120, 30, 0, 7); g.fill(); f++; track.requestFrame(); };
    tick(); recorder.start(100); const timer = setInterval(tick, 40); setTimeout(() => { clearInterval(timer); recorder.stop(); }, 2000);
  });
  const enc = (c, type, q) => c.toDataURL(type, q).split(',')[1];
  const small = (c, k) => scene(Math.round(c.width * k), Math.round(c.height * k), (g, w, h) => { g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, h); });
  const rgba = (c, k) => { const s = small(c, k); return { width: s.width, height: s.height, data: Array.from(s.getContext('2d').getImageData(0, 0, s.width, s.height).data) }; };
  return {
    beach: await enc(beach, 'image/jpeg', 0.88), beachSmall: await enc(small(beach, 0.5), 'image/jpeg', 0.8), city: await enc(city, 'image/jpeg', 0.88),
    forest: await enc(forest, 'image/jpeg', 0.88), portrait: await enc(portrait, 'image/jpeg', 0.88), sunset: await enc(sunset, 'image/png'), flower: await enc(flower, 'image/webp', 0.85),
    rawPreview: await enc(forest, 'image/jpeg', 0.9), tiff: rgba(sunset, 0.4), psd: rgba(flower, 0.3), bmp: rgba(city, 0.25),
    small: rgba(sunset, 0.1), small2: rgba(beach, 0.075), medium: rgba(forest, 0.2), video: await recordVideo(),
  };
})()`);
ws.close();
child.kill();

const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const withExif = (jpeg, info) => insertSegments(jpeg, [exifSegment(buildExifTiff(info))]);

/** DNG-like RAW: TIFF whose IFD0 points at a JPEG preview (what cameras embed). */
function makeDng(preview, info) {
  const entries = (offset) => [
    { tag: 0x00fe, type: LONG, value: 1 },
    { tag: 0x010f, type: ASCII, value: info.make },
    { tag: 0x0110, type: ASCII, value: info.model },
    { tag: 0x0112, type: SHORT, value: info.orientation ?? 1 },
    { tag: 0x0201, type: LONG, value: offset },
    { tag: 0x0202, type: LONG, value: preview.length },
    { tag: 0xc612, type: 1, value: [1, 4, 0, 0] },
  ];
  const head = buildTiff({ ifd0: entries(0) });
  const tiff = buildTiff({ ifd0: entries(head.length) });
  const outBytes = new Uint8Array(tiff.length + preview.length);
  outBytes.set(tiff, 0);
  outBytes.set(preview, tiff.length);
  return outBytes;
}

const files = {
  'beach.jpg': withExif(b64(result.beach), { make: 'Canon', model: 'Canon EOS R5', date: new Date(2023, 6, 14, 10, 30, 0), iso: 100, fNumber: 8, exposureTime: 1 / 500, focalLength: 24, lens: 'RF24-105mm F4 L IS USM', gps: { lat: 35.1587, lon: 129.1604, alt: 5 }, width: 1600, height: 1067, flash: 0, artist: 'SHKWON' }),
  'city.jpg': withExif(b64(result.city), { make: 'NIKON CORPORATION', model: 'NIKON D850', date: new Date(2024, 2, 2, 19, 5, 12), iso: 3200, fNumber: 2.8, exposureTime: 1 / 60, focalLength: 35, gps: { lat: 37.5665, lon: 126.978 }, orientation: 6, width: 1600, height: 1067 }),
  'forest.jpg': withExif(b64(result.forest), { make: 'SONY', model: 'ILCE-7M4', date: new Date(2024, 9, 5, 8, 0, 0), iso: 400, fNumber: 4, exposureTime: 1 / 125, focalLength: 85, width: 1600, height: 1067 }),
  'portrait.jpg': withExif(b64(result.portrait), { make: 'Apple', model: 'iPhone 15 Pro', date: new Date(2024, 9, 5, 14, 20, 0), iso: 64, fNumber: 1.8, exposureTime: 1 / 120, focalLength: 6.9, flash: 1, gps: { lat: 33.4996, lon: 126.5312 } }),
  'beach-copy.jpg': null,
  'beach-small.jpg': withExif(b64(result.beachSmall), { make: 'Canon', model: 'Canon EOS R5', date: new Date(2023, 6, 14, 10, 30, 0), width: 800, height: 534 }),
  'sunset.png': b64(result.sunset),
  'flower.webp': b64(result.flower),
  'scan.tif': new Uint8Array(UTIF.encodeImage(new Uint8Array(result.tiff.data), result.tiff.width, result.tiff.height)),
  'artwork.psd': encodePsd({ width: result.psd.width, height: result.psd.height, data: Uint8Array.from(result.psd.data) }),
  'icon.bmp': encodeBmp({ width: result.bmp.width, height: result.bmp.height, data: Uint8Array.from(result.bmp.data) }),
  'camera.dng': makeDng(b64(result.rawPreview), { make: 'Leica', model: 'Q2', orientation: 1 }),
};
files['beach-copy.jpg'] = files['beach.jpg'];

// Additional formats and generated documents live in their own folder so the
// basic suites keep their exact file counts.
const formatsDir = path.join(root, 'test', 'fixtures', 'formats');
fs.rmSync(formatsDir, { recursive: true, force: true });
fs.mkdirSync(formatsDir, { recursive: true });
const rgbaOf = (x) => ({ width: x.width, height: x.height, data: Uint8ClampedArray.from(x.data) });
const images = { small: rgbaOf(result.small), small2: rgbaOf(result.small2), medium: rgbaOf(result.medium) };
const extra = writeExtraFixtures(formatsDir, images, { jpegs: ['beach.jpg', 'city.jpg', 'forest.jpg'].map((n) => files[n]) });
const avif = ['../CommandCenterMultiOSV10/samples/sample.avif', '../ImageViewerMutlOSV10/samples/sample.avif'].map((p) => path.join(root, p)).find((p) => fs.existsSync(p));
if (avif) fs.copyFileSync(avif, path.join(formatsDir, 'photo.avif'));
const video = b64(result.video ?? '');
const videoSample = ['../ImageViewerMutlOSV10/samples/sample.webm', '../CommandCenterMultiOSV10/samples/sample.webm'].map((p) => path.join(root, p)).find((p) => fs.existsSync(p));
if (video.length > 2000) fs.writeFileSync(path.join(formatsDir, 'clip.webm'), video);
else if (videoSample) fs.copyFileSync(videoSample, path.join(formatsDir, 'clip.webm'));
else console.warn('clip.webm: MediaRecorder produced no data and no sample video was found');
fs.writeFileSync(path.join(formatsDir, 'scene.jp2'), await encodeJp2(images.small));
fs.writeFileSync(path.join(formatsDir, 'scene.jxl'), await encodeJxl(images.small));
console.log(`${extra.length + 3} files in test/fixtures/formats`);
// DICOM: pydicom's sample images are kept in test/fixtures/dicom; the multi-frame one is made here.
fs.mkdirSync(path.join(root, 'test', 'fixtures', 'dicom'), { recursive: true });
fs.writeFileSync(path.join(root, 'test', 'fixtures', 'dicom', 'cine.dcm'), cineDicom());

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'sub', 'deeper'), { recursive: true });
for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(out, name), bytes);
fs.copyFileSync(path.join(out, 'forest.jpg'), path.join(out, 'sub', 'forest-2.jpg'));
fs.copyFileSync(path.join(out, 'sunset.png'), path.join(out, 'sub', 'deeper', 'sunset-2.png'));
fs.writeFileSync(path.join(out, 'notes.txt'), 'not a photo');
for (const heic of ['../ImageViewerMutlOSV10/samples/sample.heic', '../CommandCenterMultiOSV10/samples/sample.heic']) {
  const source = path.join(root, heic);
  if (fs.existsSync(source)) { fs.copyFileSync(source, path.join(out, 'phone.heic')); break; }
}

// Web samples: the JPEGs with EXIF/GPS plus a PNG and a WebP.
fs.rmSync(samples, { recursive: true, force: true });
fs.mkdirSync(samples, { recursive: true });
const sampleNames = ['beach.jpg', 'city.jpg', 'forest.jpg', 'portrait.jpg', 'sunset.png', 'flower.webp'];
for (const name of sampleNames) fs.copyFileSync(path.join(out, name), path.join(samples, name));
fs.writeFileSync(path.join(samples, 'index.json'), JSON.stringify(sampleNames));
fs.rmSync(profile, { recursive: true, force: true });
console.log(`${fs.readdirSync(out).length} files in test/fixtures/photos, ${sampleNames.length} in public/samples`);
