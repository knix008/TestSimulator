/* node --test — decodes every sample DICOM and checks the image API used by the renderer. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../src/js/dicomDecoder');

const SAMPLES = path.join(__dirname, '..', 'samples');
const files = fs.existsSync(SAMPLES) ? fs.readdirSync(SAMPLES).filter((f) => /\.dcm$/i.test(f)) : [];

test('samples folder has DICOM files', () => { assert.ok(files.length > 0, 'no samples found'); });

for (const f of files) {
  test(`decode ${f}`, async () => {
    const bytes = fs.readFileSync(path.join(SAMPLES, f));
    assert.ok(D.isDicom(bytes), 'isDicom');
    const image = await D.load(bytes);
    assert.ok(image.width > 0 && image.height > 0, 'size');
    const r = await image.render({});
    assert.equal(r.rgba.length, image.width * image.height * 4);
    // something must be visible
    let sum = 0;
    for (let i = 0; i < r.rgba.length; i += 4) sum += r.rgba[i];
    assert.ok(sum > 0, 'rendered frame is black');
    assert.ok(Array.isArray(image.tags) && image.tags.length > 10, 'tags');
    assert.ok(image.meta.transferSyntax, 'meta');
    const v = image.valueAt(0, 0);
    assert.ok(v !== null, 'valueAt');
    if (image.gray && !image.palette) {
      const h = image.histogram(64);
      assert.equal(h.counts.length, 64);
      const st = image.stats({ x: 0, y: 0, w: 8, h: 8, shape: 'rect' });
      assert.ok(st.n > 0);
      assert.ok(image.samplesOf(0).length >= image.width * image.height);
      // window changes must change the output
      const a = await image.render({ wc: image.range.min, ww: 1 });
      const b = await image.render({ wc: image.range.max, ww: 1 });
      assert.notDeepEqual(Buffer.from(a.rgba.buffer).toString('base64'), Buffer.from(b.rgba.buffer).toString('base64'));
    }
    const head = await D.scanHeader(bytes);
    assert.equal(head.rows, image.height);
    assert.ok(typeof head.seriesUid === 'string');
    const txt = D.tagsToText(image.tags, 'json');
    assert.ok(JSON.parse(txt).length === image.tags.length);
  });
}

test('sortSeries orders by instance number then position', () => {
  const s = D.sortSeries([{ instanceNumber: 3 }, { instanceNumber: 1 }, { normalPos: 5 }, { normalPos: -2 }]);
  assert.deepEqual(s.map((x) => x.instanceNumber ?? x.normalPos), [1, 3, -2, 5]);
});

test('isDicom rejects other files', () => {
  assert.equal(D.isDicom(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 0, 0])), false);
});
