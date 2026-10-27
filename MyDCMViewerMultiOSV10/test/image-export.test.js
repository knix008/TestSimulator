/* node --test — ImageExport: every format that encodes in Node is written to test/tmp/export/ and read back
 * with an independent decoder (sharp / ffmpeg / Pillow / numpy / libheif / libjxl / spec readers in
 * test/helpers/exportValidate.js). Browser-only paths (canvas WebP, WebCodecs HEIC) are covered by
 * scripts/export-check.mjs. The full table is written to test/tmp/export/node-results.txt. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const X = require('../src/js/imageExport');
const V = require('./helpers/exportValidate');

let results = [];
test.before(async () => {
  fs.rmSync(V.OUT, { recursive: true, force: true });
  fs.mkdirSync(V.OUT, { recursive: true });
  const files = [];
  for (const c of V.CASES) {
    const f = X.get(c.id);
    if (!(await f.isAvailable())) { files.push({ c, error: `not available in Node — ${f.notes}`, skip: true }); continue; }
    try {
      const data = await X.encode(c.id, V.input(c.input), c.options);
      const file = path.join(V.OUT, V.fileName(c, f));
      fs.writeFileSync(file, data);
      files.push({ c, file });
    } catch (e) { files.push({ c, error: e.stack || String(e) }); }
  }
  results = await V.validate(files);
  fs.writeFileSync(path.join(V.OUT, 'node-results.txt'), V.table(results) + '\n');
});

for (const c of V.CASES) {
  test(`${c.id} — ${c.name}`, async (t) => {
    const r = results.find((x) => x.c === c);
    assert.ok(r, 'no result');
    if (r.skip) { t.skip(r.error.split('\n')[0]); return; }
    assert.ok(!r.error, r.error);
    assert.ok(r.size > 0, 'empty file');
    for (const row of r.rows) {
      await t.test(`${row.tool}: ${row.msg}`, (st) => {
        if (row.status === 'skip') st.skip(row.msg);
        else assert.equal(row.status, 'pass', row.msg);
      });
    }
    assert.ok(r.rows.some((row) => row.status === 'pass') || r.rows.every((row) => row.status === 'skip'), 'no validator passed');
  });
}

test('every format has at least one validation case', () => {
  const covered = new Set(V.CASES.map((c) => c.id));
  assert.deepEqual(X.FORMATS.map((f) => f.id).filter((id) => !covered.has(id)), []);
});

test('FORMATS entries are complete', () => {
  const groups = new Set(['common', 'pro', 'legacy', 'hdr', 'medical', 'vector', 'icon', 'scientific']);
  const ids = new Set();
  for (const f of X.FORMATS) {
    assert.ok(!ids.has(f.id), `duplicate ${f.id}`); ids.add(f.id);
    assert.ok(f.label && f.ext && Array.isArray(f.exts) && f.exts.length && f.mime && f.notes, f.id);
    assert.ok(groups.has(f.group), `${f.id} group ${f.group}`);
    assert.ok(f.kinds.length && f.kinds.every((k) => ['rgba', 'gray16', 'frames'].includes(k)), f.id);
    assert.equal(typeof f.available, 'boolean');
    assert.equal(typeof f.isAvailable, 'function');
    for (const o of f.options) {
      assert.ok(['quality', 'select', 'bool', 'number', 'text'].includes(o.type), `${f.id}.${o.key}`);
      if (o.type === 'select') assert.ok(o.choices.includes(o.default), `${f.id}.${o.key} default`);
      if (o.type === 'text') assert.equal(typeof o.default, 'string', `${f.id}.${o.key} default`);
    }
  }
  assert.equal(X.byExt('nii.gz').id, 'nifti-gz');
  assert.equal(X.byExt('.TIF').id, 'tiff');
  assert.equal(X.byExt('img').id, 'analyze');
  assert.equal(X.defaults('jpeg').quality, 90);
});

test('two-file formats: encodeFiles gives the pair, encode gives a ZIP', async () => {
  const inp = V.input('vol');
  const a = await X.encodeFiles('analyze', inp);
  assert.deepEqual(a.map((f) => f.name), ['volume.hdr', 'volume.img']);
  assert.equal(a[0].data.length, 348);
  assert.equal(a[1].data.length, 37 * 23 * 3 * 2);
  const m = await X.encodeFiles('mhd', inp, { compress: true });
  assert.deepEqual(m.map((f) => f.name), ['volume.mhd', 'volume.zraw']);
  assert.match(Buffer.from(m[0].data).toString(), /ElementDataFile = volume\.zraw/);
  const z = await X.encode('mhd', inp);
  assert.equal(Buffer.from(z.subarray(0, 4)).toString('latin1'), 'PK\x03\x04');
  const one = await X.encodeFiles('png', { ...V.input('rgba37'), name: 'Scan 1.dcm' });
  assert.equal(one[0].name, 'Scan 1.png');
});

test('bad input is rejected', async () => {
  await assert.rejects(X.encode('png', { width: 0, height: 4 }), /width and height/);
  await assert.rejects(X.encode('png', { width: 4, height: 4 }), /no pixels/);
  await assert.rejects(X.encode('png', { width: 4, height: 4, rgba: new Uint8ClampedArray(8) }), /too short/);
  await assert.rejects(X.encode('nope', V.input('rgba37')), /unknown format/);
});

test('512×512 encodes in under 1 s (all but AVIF / JPEG XL / HEIC)', async (t) => {
  const inp = V.input('big');
  const slow = [];
  for (const f of X.FORMATS) {
    if (['avif', 'jxl', 'heic'].includes(f.id) || !(await f.isAvailable())) continue;
    await X.encode(f.id, { width: 8, height: 8, rgba: V.synth(8, 8) });   // warm up (wasm / module load)
    const t0 = performance.now();
    await X.encode(f.id, inp);
    const ms = performance.now() - t0;
    t.diagnostic(`${f.id} ${ms.toFixed(0)} ms`);
    if (ms >= 1000) slow.push(`${f.id} ${ms.toFixed(0)} ms`);
  }
  assert.deepEqual(slow, []);
});
