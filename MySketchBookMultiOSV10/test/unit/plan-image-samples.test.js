// The 2D plan samples (scripts/make-plan-image-samples.mjs → samples/plan-images/, public/plan-samples/, the start
// page's "2D plan samples" card): every file is there in both places with its thumbnail, is the format its name says,
// and the app's wall detection — both methods, the better one picked as the workbench does — reads the plan
// (rooms after the automatic cleanup), dark pictures included. The freehand sketch is marked hard: only some walls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { detectImageWalls, lightGround, MAX_DETECT_SIZE } from '../../src/io/plan-image.js';
import { decodeTga, decodeTiff } from '../../src/io/plan-raster.js';
import { fromResult, toResult, cleanupAll, dominantAngle, rotateDraft, draftProblems, pickDetection } from '../../src/io/plan-draft.js';
import { applyPlan } from '../../src/io/plan-build.js';
import { createProject } from '../../src/engine/document.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'samples', 'plan-images');
const pub = path.join(root, 'public', 'plan-samples');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));

const MAGIC = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b.subarray(1, 4).toString() === 'PNG',
  gif: (b) => b.subarray(0, 4).toString() === 'GIF8',
  webp: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  bmp: (b) => b.subarray(0, 2).toString() === 'BM',
  avif: (b) => b.subarray(4, 12).toString() === 'ftypavif',
  tif: (b) => (b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d),
  tga: (b) => b[2] === 10 || b[2] === 2,
};

function readBmp(buf) {
  const off = buf.readUInt32LE(10); const w = buf.readInt32LE(18); const h = buf.readInt32LE(22); const row = Math.ceil((w * 3) / 4) * 4;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = off + (h - 1 - y) * row + x * 3; const o = (y * w + x) * 4; data[o] = buf[i + 2]; data[o + 1] = buf[i + 1]; data[o + 2] = buf[i]; data[o + 3] = 255; }
  return { data, width: w, height: h };
}

/** RGBA pixels of a sample picture: the app's own TGA / TIFF readers, sharp for the formats a browser decodes. */
async function decode(file) {
  const buf = fs.readFileSync(path.join(dir, file));
  if (/\.bmp$/i.test(file)) return readBmp(buf);
  if (/\.tga$/i.test(file)) { const d = decodeTga(new Uint8Array(buf)); return { data: new Uint8ClampedArray(d.data), width: d.width, height: d.height }; }
  if (/\.tiff?$/i.test(file)) { const d = decodeTiff(new Uint8Array(buf)); return { data: new Uint8ClampedArray(d.data), width: d.width, height: d.height }; }
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

/** Shrunk to the size the app detects at (ui/plan-import.js detectPicture). */
async function detectable(img) {
  const k = Math.min(1, MAX_DETECT_SIZE / Math.max(img.width, img.height));
  if (k === 1) return { img, k };
  const w = Math.round(img.width * k); const h = Math.round(img.height * k);
  const { data } = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } }).resize(w, h).raw().toBuffer({ resolveWithObject: true });
  return { img: { data: new Uint8ClampedArray(data), width: w, height: h }, k };
}

const roomsOf = (result) => applyPlan(createProject(), result, { target: 'replace' }).rooms;

test('plan image samples: index, files in samples/ and public/, thumbnails, formats', () => {
  assert.ok(index.pictures.length >= 12, 'a dozen pictures');
  assert.ok(index.drawings.length >= 5, 'the CAD / PDF drawings');
  const formats = new Set(index.pictures.map((p) => p.format));
  for (const f of ['jpg', 'png', 'gif', 'webp', 'bmp', 'tga', 'avif', 'tif']) assert.ok(formats.has(f), `a ${f} picture`);
  assert.ok(new Set(index.pictures.map((p) => p.style)).size >= 6, 'many drawing styles');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pub, 'index.json'), 'utf8')), index, 'public copy of the index');
  for (const p of index.pictures) {
    const bytes = fs.readFileSync(path.join(dir, p.file));
    assert.ok(MAGIC[p.format](bytes), `${p.file} is a ${p.format}`);
    assert.ok(fs.readFileSync(path.join(pub, p.file)).equals(bytes), `${p.file} copied to public/plan-samples`);
    assert.ok(fs.existsSync(path.join(pub, 'thumbs', `${p.id}.webp`)), `${p.id} thumbnail`);
    assert.ok(p.title.length === 2 && p.note.length === 2, `${p.id} titles in Korean and English`);
    assert.ok(p.pxPerMetre > 0 && p.widthMetres > 3 && p.counts.walls > 0 && p.counts.rooms > 0);
  }
  for (const d of index.drawings) {
    assert.ok(fs.existsSync(path.join(pub, d.file)), `${d.file} copied to public/plan-samples`);
    assert.ok(fs.existsSync(path.join(pub, 'thumbs', `${d.id}.webp`)), `${d.id} thumbnail`);
  }
  const total = fs.readdirSync(pub).filter((n) => n !== 'thumbs').reduce((s, n) => s + fs.statSync(path.join(pub, n)).size, 0);
  assert.ok(total < 6 * 1024 * 1024, `the samples stay small for the app bundle (${(total / 1048576).toFixed(1)} MB)`);
});

test('plan image samples: light lines on a dark ground are read as dark lines on a light ground', () => {
  const dark = { data: new Uint8ClampedArray([20, 30, 60, 255, 240, 240, 240, 255, 20, 30, 60, 255, 20, 30, 60, 255]), width: 2, height: 2 };
  const light = lightGround(dark);
  assert.equal(light.inverted, true);
  assert.deepEqual([...light.data.slice(0, 4)], [235, 225, 195, 255]);
  const white = { data: new Uint8ClampedArray([250, 250, 250, 255, 0, 0, 0, 255, 250, 250, 250, 255, 250, 250, 250, 255]), width: 2, height: 2 };
  assert.equal(lightGround(white), white, 'a light picture is left as it is');
});

for (const p of index.pictures) {
  test(`plan image samples: ${p.id} (${p.format}, ${p.style}) — walls, openings and rooms are found`, async () => {
    const raw = await decode(p.file);
    assert.deepEqual([raw.width, raw.height], p.size, 'decoded size');
    const { img, k } = await detectable(raw);
    const found = ['outline', 'edges'].map((method) => detectImageWalls(img, { metresPerPixel: 1 / (p.pxPerMetre * k), method }));
    const best = found[pickDetection(found)];
    const d = fromResult({ ...best, texts: [] });
    rotateDraft(d, [0, 0], -dominantAngle(d));
    cleanupAll(d);
    const rooms = roomsOf(toResult(d));
    if (p.hard) {
      // Freehand: part of the plan, the rest is drawn in the 2D workbench.
      assert.ok(d.walls.length >= 3, `${p.id}: some walls (${d.walls.length})`);
      return;
    }
    assert.ok(best.walls.length >= p.counts.walls * 0.8, `${p.id}: walls ${best.walls.length} of ${p.counts.walls}`);
    assert.ok(best.openings.length >= Math.ceil((p.counts.doors + p.counts.windows) * 0.5), `${p.id}: openings ${best.openings.length} of ${p.counts.doors + p.counts.windows}`);
    assert.ok(rooms >= p.counts.rooms - 1, `${p.id}: rooms ${rooms} of ${p.counts.rooms}`);
    assert.ok(draftProblems(d).length <= 6, `${p.id}: little left to fix by hand (${draftProblems(d).length})`);
  });
}
