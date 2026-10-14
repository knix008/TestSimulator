// DICOM: the decoder reads the sample files (pydicom's test images) — size,
// frames, windows, rescaled values (CT in HU), tags, rendering, ROI statistics.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

globalThis.require = createRequire(import.meta.url); // the decoder loads its codecs with require() under Node
const { default: DicomDecoder } = await import('../../src/formats/dicomDecoder.js');
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'dicom');
const load = (name) => DicomDecoder.load(new Uint8Array(fs.readFileSync(path.join(dir, name))));

// features: FMT-DICOM VIEW-DICOM
test('FMT-DICOM: CT (16-bit, rescaled to HU), MR, RGB and JPEG 2000 compressed files decode and render', async () => {
  const ct = await load('CT_small.dcm');
  assert.deepEqual([ct.width, ct.height], [128, 128]);
  assert.equal(ct.meta?.modality ?? ct.modality, 'CT');
  assert.equal(ct.units, 'HU');
  const rendered = await ct.render({ frame: 0 });
  assert.equal(rendered.rgba.length, 128 * 128 * 4);
  assert.ok(ct.fileWindows.length >= 1 || ct.presets.length >= 1, 'windows from the file or presets for CT');
  const probe = ct.valueAt(64, 64);
  assert.ok(probe && Number.isFinite(probe.value) && probe.units === 'HU', JSON.stringify(probe));
  const stats = ct.stats({ x: 32, y: 32, w: 64, h: 64, shape: 'rect' });
  assert.equal(stats.n, 64 * 64);
  assert.ok(stats.max >= stats.mean && stats.mean >= stats.min);
  assert.ok(stats.areaMm2 > 0, 'pixel spacing gives an area in mm²');
  assert.ok(ct.tags.length > 50 && ct.tags.some((tag) => tag.tag.toUpperCase().includes('0010')), 'patient tags listed');

  const mr = await load('MR_small.dcm');
  assert.deepEqual([mr.width, mr.height], [64, 64]);
  const rgb = await load('SC_rgb_small_odd.dcm');
  assert.equal(rgb.gray, false);
  const color = await rgb.render({ frame: 0 });
  assert.equal(color.rgba.length, rgb.width * rgb.height * 4);
  const j2k = await load('JPEG2000.dcm');
  const j2kRendered = await j2k.render({ frame: 0 });
  assert.equal(j2kRendered.rgba.length, j2k.width * j2k.height * 4);
});

// features: VIEW-DICOM
test('VIEW-DICOM: window/level, invert, colour map, re-render and pixel probe', async () => {
  const ct = await load('CT_small.dcm');
  const base = await ct.render({ frame: 0 });
  const narrow = await ct.render({ frame: 0, wc: 40, ww: 80 });
  assert.equal(narrow.state.wc, 40);
  assert.equal(narrow.state.ww, 80);
  assert.notDeepEqual(Array.from(narrow.rgba.slice(0, 4000)), Array.from(base.rgba.slice(0, 4000)), 'a different window changes the picture');
  const inverted = await ct.render({ frame: 0, wc: 40, ww: 80, invert: true });
  const i = (64 * 128 + 64) * 4;
  assert.equal(inverted.rgba[i], 255 - narrow.rgba[i], 'invert');
  assert.ok(ct.colormaps.includes('hotiron'));
  const hot = await ct.render({ frame: 0, wc: 40, ww: 80, colormap: 'hotiron' });
  assert.ok(hot.rgba[i] !== hot.rgba[i + 2] || hot.rgba[i] === 0, 'colour map tints the gray values');
  const histogram = ct.histogram(32);
  assert.equal(histogram.counts.length, 32);
  assert.equal(histogram.counts.reduce((a, b) => a + b, 0), 128 * 128);
});

// features: VIEW-DICOM
test('VIEW-DICOM: multi-frame file (generated cine.dcm): frames, frame time, pixel spacing, each frame differs', async () => {
  const cine = await load('cine.dcm');
  assert.equal(cine.frames, 8);
  assert.deepEqual([cine.width, cine.height], [96, 64]);
  assert.equal(Math.round(cine.frameRate), 10, '100 ms per frame');
  assert.deepEqual(cine.geometry.pixelSpacing, [0.5, 0.5]);
  assert.equal(cine.meta.patientName, 'Test Cine', 'person name shown with its parts separated');
  const first = await cine.render({ frame: 0 });
  const last = await cine.render({ frame: 7 });
  const at = (r, x) => r.rgba[(32 * 96 + x) * 4];
  assert.ok(at(first, 12) > at(first, 84) + 50, 'disc on the left in frame 1');
  assert.ok(at(last, 84) > at(last, 12) + 50, 'disc on the right in frame 8');
});
