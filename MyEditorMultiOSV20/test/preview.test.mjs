import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const files = require('../core/files');
const dicom = require('../core/dicom');
const png = require('../core/png');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myeditor-preview-'));

test('PNG encoder writes a readable signature and IHDR size', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const buf = png.encodeRgba(2, 2, rgba);
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(png.dataUrl(2, 2, rgba), /^data:image\/png;base64,/);
});

test('a synthetic DICOM round-trips through file.preview', async () => {
  const p = path.join(tmp, 'one.dcm');
  const pixels = new Uint8Array(16 * 12);
  for (let i = 0; i < pixels.length; i++) pixels[i] = i % 256;
  fs.writeFileSync(p, dicom.encodeUncompressed({
    width: 16, height: 12, pixels, patientName: 'Park^Test', patientId: 'T1',
    modality: 'CT', ww: 200, wl: 80, seriesDesc: 'Unit',
  }));
  const r = await files.imagePreview(p);
  assert.equal(r.kind, 'dicom');
  assert.equal(r.width, 16);
  assert.equal(r.height, 12);
  assert.equal(r.count, 1);
  assert.equal(r.meta.patientName, 'Park Test');
  assert.equal(r.meta.modality, 'CT');
  assert.equal(r.windowWidth, 200);
  assert.equal(r.windowCenter, 80);
  assert.match(r.src, /^data:image\/png;base64,/);
  const url = await files.dataUrl(p);
  assert.match(url.dataUrl, /^data:image\/png;base64,/);
});

test('a multi-frame DICOM is walked with index', async () => {
  const p = path.join(tmp, 'cine.dcm');
  const w = 8, h = 8, frames = 4;
  const pixels = new Uint8Array(w * h * frames);
  for (let f = 0; f < frames; f++) pixels.fill(40 + f * 40, f * w * h, (f + 1) * w * h);
  fs.writeFileSync(p, dicom.encodeUncompressed({ width: w, height: h, pixels, frames, modality: 'XA' }));
  const a = await files.imagePreview(p, { index: 0 });
  const b = await files.imagePreview(p, { index: 3 });
  assert.equal(a.kind, 'dicom');
  assert.equal(a.mode, 'frames');
  assert.equal(a.count, 4);
  assert.equal(a.index, 0);
  assert.equal(b.index, 3);
  assert.notEqual(a.pixels, b.pixels);
});

test('sibling DICOM files of the same series become a slider', async () => {
  const dir = path.join(tmp, 'series');
  fs.mkdirSync(dir);
  const uid = '1.2.826.0.1.3680043.8.498.77';
  for (let i = 1; i <= 3; i++) {
    fs.writeFileSync(path.join(dir, `ct-00${i}.dcm`), dicom.encodeUncompressed({
      width: 6, height: 6, instance: i, seriesUid: uid, seriesDesc: 'Chest', modality: 'CT',
    }));
  }
  const r = await files.imagePreview(path.join(dir, 'ct-002.dcm'));
  assert.equal(r.mode, 'series');
  assert.equal(r.count, 3);
  assert.equal(r.index, 1);
  assert.equal(r.series.length, 3);
  const last = await files.imagePreview(path.join(dir, 'ct-002.dcm'), { index: 2 });
  assert.equal(last.index, 2);
  assert.match(last.path.replace(/\\/g, '/'), /ct-003\.dcm$/);
});

test('window/level maps a stored value to a grey', () => {
  const pixels = new Int16Array([0, 40, 80, 400]);
  const rgba = dicom.applyWindow(pixels, { width: 4, height: 1, slope: 1, intercept: 0, ww: 80, wl: 40 });
  assert.equal(rgba[0], 0);
  assert.ok(rgba[4] > 100 && rgba[4] < 160);
  assert.equal(rgba[8], 255);
  assert.equal(rgba[12], 255);
  const inv = dicom.applyWindow(pixels, { width: 4, height: 1, slope: 1, intercept: 0, ww: 80, wl: 40, invert: true });
  assert.equal(inv[0], 255);
  assert.equal(inv[8], 0);
});

test('HEIC / DICOM extensions are images; a junk HEIC is refused', async () => {
  const p = path.join(tmp, 'no.heic');
  fs.writeFileSync(p, Buffer.from('not a heic'));
  await assert.rejects(() => files.dataUrl(p), /HEIC|HEIF|heic/i);
  await assert.rejects(() => files.imagePreview(p), (e) => e.code === 'ENOTHEIC' || /HEIC/i.test(e.message));
});
