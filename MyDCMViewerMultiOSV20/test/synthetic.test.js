/* node --test — synthetic series / multi-frame fixtures: decoding, sorting, values, anonymisation in place. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('../src/js/dicomDecoder');
const { writeSeries, writeMultiframe } = require('./helpers/makeDicom');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dcmviewer-'));

test('synthetic series decodes and sorts by instance number', async () => {
  const dir = path.join(tmp, 'series');
  const names = writeSeries(dir, { slices: 12 });
  const items = [];
  for (const n of names) {
    const bytes = fs.readFileSync(path.join(dir, n));
    assert.ok(D.isDicom(bytes));
    items.push({ name: n, ...(await D.scanHeader(bytes)) });
  }
  const sorted = D.sortSeries(items);
  assert.deepEqual(sorted.map((x) => x.instanceNumber), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.ok(sorted.every((x) => x.seriesUid === sorted[0].seriesUid));
  // z positions ascend with the instance number
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].normalPos > sorted[i - 1].normalPos);
  const img = await D.load(fs.readFileSync(path.join(dir, sorted[6].name)));
  await img.render({});
  const v = await img.valuesOf(0);
  assert.equal(v.length, 64 * 64);
  assert.equal(Math.round(v[32 * 64 + 32]), 700, 'bone core HU');
  assert.equal(Math.round(v[0]), -1000, 'air HU');
  assert.equal(img.units, 'HU');
  assert.equal(img.meta.window, 'C 40 / W 400');
  const full = await img.render({ wc: 40, ww: 400 });
  const half = await img.render({ wc: 40, ww: 400, step: 2 });
  assert.equal(half.width, Math.ceil(full.width / 2));
  assert.equal(half.height, Math.ceil(full.height / 2));
  const at = (rgba, w, x, y) => rgba[(y * w + x) * 4];
  assert.equal(at(half.rgba, half.width, 16, 16), at(full.rgba, full.width, 32, 32), 'step 2 keeps the centre sample');
  const small = await img.render({ wc: 40, ww: 400, maxEdge: 16 });
  assert.ok(Math.max(small.width, small.height) <= 16);
  const buf = new Uint8ClampedArray(full.width * full.height * 4);
  const into = await img.render({ wc: 40, ww: 400, target: buf });
  assert.equal(into.rgba, buf);
  assert.equal(at(into.rgba, into.width, 32, 32), at(full.rgba, full.width, 32, 32));
  const again = await img.render({ wc: 40, ww: 400 });
  assert.notEqual(again.rgba, buf, 'a render without a target keeps its own buffer');
  assert.equal(again.width, full.width);
});

test('samples/series is two related CT series in slice order', async () => {
  const dir = path.join(__dirname, '..', 'samples', 'series');
  const names = fs.readdirSync(dir).filter((n) => n.endsWith('.dcm'));
  assert.equal(names.length, 16);
  const items = [];
  for (const n of names) items.push({ name: n, ...(await D.scanHeader(fs.readFileSync(path.join(dir, n)))) });
  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.seriesUid)) groups.set(it.seriesUid, []);
    groups.get(it.seriesUid).push(it);
  }
  assert.equal(groups.size, 2);
  const axial = D.sortSeries(groups.get('1.2.826.0.1.3680043.10.511.1.1'));
  assert.deepEqual(axial.map((x) => x.instanceNumber), Array.from({ length: 12 }, (_, i) => i + 1));
  for (let i = 1; i < axial.length; i++) assert.ok(axial[i].normalPos > axial[i - 1].normalPos);
  const mid = await D.load(fs.readFileSync(path.join(dir, 'ax_06.dcm')));
  assert.equal(mid.width, 128);
  assert.equal(mid.meta.modality, 'CT');
  const edge = await D.load(fs.readFileSync(path.join(dir, 'ax_01.dcm')));
  const midV = await mid.valuesOf(0);
  const edgeV = await edge.valuesOf(0);
  assert.ok(midV.filter((v) => Math.round(v) === 700).length > edgeV.filter((v) => Math.round(v) === 700).length, 'the middle slice shows more of the bone core');
});

test('synthetic multi-frame file', async () => {
  const file = writeMultiframe(path.join(tmp, 'mf.dcm'), { frames: 10 });
  const img = await D.load(fs.readFileSync(file));
  assert.equal(img.frames, 10);
  const first = await img.render({ frame: 0 });
  const mid = await img.render({ frame: 5 });
  assert.notEqual(Buffer.from(first.rgba.buffer).toString('base64'), Buffer.from(mid.rgba.buffer).toString('base64'));
  const p = img.valueAt(32, 32, 5);
  assert.equal(Math.round(p.value), 700);
});

test('parseRaw keeps element offsets for in-place edits', async () => {
  const file = writeMultiframe(path.join(tmp, 'edit.dcm'), { frames: 2 });
  const bytes = new Uint8Array(fs.readFileSync(file));
  const ds = await D.parseRaw(bytes);
  const e = ds.elements.x00100010;
  assert.ok(e && e.length > 0);
  const text = 'ANONYMOUS';
  for (let i = 0; i < e.length; i++) bytes[e.dataOffset + i] = i < text.length ? text.charCodeAt(i) : 0x20;
  const img = await D.load(bytes);
  assert.equal(img.meta.patientName, 'ANONYMOUS');
  assert.equal(img.frames, 2);
});
