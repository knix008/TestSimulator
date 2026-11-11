/* node --test — samples/more/: files that used to be unsupported (no preamble / meta, YBR_FULL_422,
 * Deflated Image Frame Compression, retired JPEG processes, documents without pixel data). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../src/js/dicomDecoder');

const SAMPLES = path.join(__dirname, '..', 'samples');
const MORE = path.join(SAMPLES, 'more');
const read = (...p) => new Uint8Array(fs.readFileSync(path.join(SAMPLES, ...p)));
const load = (...p) => D.load(read(...p));

// File → what it must turn into
const EXPECT = {
  'no_meta.dcm': { width: 128, height: 128, layout: 'raw-dataset' },
  'OT-PAL-8-face.dcm': { width: 640, height: 480, layout: 'raw-dataset', photometric: 'PALETTE COLOR' },
  'JLSL_RGB_ILV0.dcm': { width: 256, height: 256, layout: 'no-preamble', photometric: 'RGB' },
  'JLSN_RGB_ILV0.dcm': { width: 256, height: 256, layout: 'no-preamble', photometric: 'RGB' },
  'SC_ybr_full_422_uncompressed.dcm': { width: 100, height: 100, photometric: 'YBR_FULL_422' },
  'US-YBR_FULL_422-EVRLE.dcm': { width: 800, height: 555, photometric: 'YBR_FULL_422' },
  'liver_deflate.dcm': { width: 512, height: 512, frames: 3 },
  'CTImage.dcm_JPEGProcess6_8TransferSyntax_1.2.840.10008.1.2.4.53.dcm': { width: 512, height: 512 },
  'CTImage.dcm_JPEGProcess10_12TransferSyntax_1.2.840.10008.1.2.4.55.dcm': { width: 512, height: 512 },
  'rtplan.dcm': { docKind: 'rtplan' },
  'rtstruct.dcm': { docKind: 'rtstruct' },
  'test-SR.dcm': { docKind: 'sr' },
  'waveform_ecg.dcm': { docKind: 'waveform' },
};

const rgbaEqual = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const meanAbs = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) { if (i % 4 === 3) continue; s += Math.abs(a[i] - b[i]); n++; } return s / n; };

test('samples/more holds every listed file (and nothing unknown)', () => {
  const files = fs.readdirSync(MORE).filter((f) => /\.dcm$/i.test(f)).sort();
  assert.deepEqual(files, Object.keys(EXPECT).sort());
  assert.ok(!fs.existsSync(path.join(SAMPLES, '_unsupported')), 'samples/_unsupported should be gone');
});

for (const [file, exp] of Object.entries(EXPECT)) {
  test(`more/${file} opens`, async () => {
    const bytes = read('more', file);
    assert.ok(D.isDicom(bytes), 'isDicom');
    assert.ok(D.isDicom(bytes.subarray(0, 4096)), 'isDicom on the first 4 KB (folder scan)');
    if (exp.docKind) {
      await assert.rejects(D.load(bytes), (err) => {
        assert.equal(err.docKind, exp.docKind);
        assert.ok(err.meta && Array.isArray(err.tags) && err.tags.length > 10, 'err.meta / err.tags');
        return true;
      });
      const head = await D.scanHeader(bytes);
      assert.ok(head.sopClass, 'scanHeader reads the SOP class');
      return;
    }
    const img = await D.load(bytes);
    assert.equal(img.width, exp.width);
    assert.equal(img.height, exp.height);
    if (exp.frames) assert.equal(img.frames, exp.frames);
    if (exp.layout) assert.equal(img.fileLayout, exp.layout);
    if (exp.photometric) assert.equal(img.photometric, exp.photometric);
    for (let f = 0; f < img.frames; f++) {
      const r = await img.render({ frame: f });
      assert.equal(r.rgba.length, exp.width * exp.height * 4);
      const seen = new Set();
      for (let i = 0; i < r.rgba.length && seen.size < 3; i += 4) seen.add(r.rgba[i] * 65536 + r.rgba[i + 1] * 256 + r.rgba[i + 2]);
      assert.ok(seen.size > 1, `frame ${f} is uniform`);
    }
    const head = await D.scanHeader(bytes);
    assert.equal(head.rows, exp.height);
  });
}

test('no_meta.dcm (bare data set, one stray leading byte) is the same image as CT_small.dcm', async () => {
  const a = await (await load('more', 'no_meta.dcm')).render({});
  const b = await (await load('CT_small.dcm')).render({});
  assert.ok(rgbaEqual(a.rgba, b.rgba));
});

test('YBR_FULL_422 (uncompressed) renders like the RGB original', async (t) => {
  const ybr = await (await load('more', 'SC_ybr_full_422_uncompressed.dcm')).render({});
  const rgb = await (await load('pydicom-data', 'SC_rgb.dcm')).render({});
  const full = await (await load('pydicom-data', 'SC_ybr_full_uncompressed.dcm')).render({});
  const d = meanAbs(ybr.rgba, rgb.rgba);
  t.diagnostic(`YBR_FULL_422 vs SC_rgb mean |Δ| = ${d.toFixed(3)} (YBR_FULL vs SC_rgb ${meanAbs(full.rgba, rgb.rgba).toFixed(3)})`);
  assert.ok(d < 1.5, `mean abs difference ${d}`);
});

test('JPEG-LS interleave mode 0 colour comes out as RGB (lossless vs near-lossless agree)', async (t) => {
  const a = await load('more', 'JLSL_RGB_ILV0.dcm'), b = await load('more', 'JLSN_RGB_ILV0.dcm');
  const ra = await a.render({}), rb = await b.render({});
  const d = meanAbs(ra.rgba, rb.rgba);
  t.diagnostic(`JLSL vs JLSN mean |Δ| = ${d.toFixed(3)}`);
  assert.ok(d < 4, `difference ${d}`);
  // planes are not mixed up: neighbouring pixels are similar in every channel (a wrong interleave gives noise)
  let jump = 0;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 127; x++) { const o = (y * 256 + x) * 4; jump += Math.abs(ra.rgba[o] - ra.rgba[o + 4]) + Math.abs(ra.rgba[o + 1] - ra.rgba[o + 5]); }
  assert.ok(jump / (128 * 127 * 2) < 40, 'top half (photo / text) should be smooth');
  let colour = 0;
  for (let i = 0; i < ra.rgba.length; i += 4) if (Math.abs(ra.rgba[i] - ra.rgba[i + 1]) > 20) colour++;
  assert.ok(colour > 1000, 'image has colour');
});

test('liver_deflate.dcm (Deflated Image Frame Compression) equals liver.dcm and liver_rle.dcm frame by frame', async () => {
  const d = await load('more', 'liver_deflate.dcm'), u = await load('pydicom-data', 'liver.dcm'), r = await load('pydicom-data', 'liver_rle.dcm');
  assert.equal(d.transferSyntax, '1.2.840.10008.1.2.8.1');
  for (let f = 0; f < 3; f++) {
    const a = await d.render({ frame: f });
    assert.ok(rgbaEqual(a.rgba, (await u.render({ frame: f })).rgba), `frame ${f} vs liver.dcm`);
    assert.ok(rgbaEqual(a.rgba, (await r.render({ frame: f })).rgba), `frame ${f} vs liver_rle.dcm`);
  }
});

test('1-bit frames that do not end on a byte boundary (liver_nonbyte_aligned.dcm) follow each other bit by bit', async () => {
  const img = await load('pydicom-data', 'liver_nonbyte_aligned.dcm');
  assert.equal(img.width * img.height % 8, 4);
  const sums = [];
  for (let f = 0; f < img.frames; f++) { await img.render({ frame: f }); sums.push(img.samplesOf(f).reduce((a, b) => a + b, 0)); }
  assert.deepEqual(sums, [36233, 35645, 35220]);   // pydicom pixel_array, and the same segment as liver.dcm
});

test('retired JPEG processes 6/8 (4.53) and 10/12 (4.55) are close to the uncompressed CTImage.dcm', async (t) => {
  const ref = await load('cornerstone', 'CTImage.dcm');
  const v0 = await ref.valuesOf(0);
  const r0 = await ref.render({ wc: 40, ww: 400 });
  for (const f of ['CTImage.dcm_JPEGProcess6_8TransferSyntax_1.2.840.10008.1.2.4.53.dcm', 'CTImage.dcm_JPEGProcess10_12TransferSyntax_1.2.840.10008.1.2.4.55.dcm']) {
    const img = await load('more', f);
    assert.ok(img.lossy, 'flagged lossy');
    const v = await img.valuesOf(0);
    let s = 0, max = 0;
    for (let i = 0; i < v.length; i++) { const d = Math.abs(v[i] - v0[i]); s += d; if (d > max) max = d; }
    const hu = s / v.length;
    const px = meanAbs((await img.render({ wc: 40, ww: 400 })).rgba, r0.rgba);
    t.diagnostic(`${f.match(/4\.5\d/)[0]}: mean |ΔHU| = ${hu.toFixed(2)} (max ${max.toFixed(0)}), rendered mean |Δ| = ${px.toFixed(2)} grey levels`);
    assert.ok(hu < 10, `HU error ${hu}`);
    assert.ok(px < 3, `render error ${px}`);
  }
});

test('parseRaw on a file without meta keeps offsets into the caller\'s bytes', async () => {
  const bytes = read('more', 'rtstruct.dcm');
  const ds = await D.parseRaw(bytes);
  const e = ds.elements.x00100010;
  assert.ok(e && e.length > 0);
  const text = 'ANONYMOUS';
  for (let i = 0; i < e.length; i++) bytes[e.dataOffset + i] = i < text.length ? text.charCodeAt(i) : 0x20;
  await assert.rejects(D.load(bytes), (err) => { assert.equal(err.meta.patientName, 'ANONYMOUS'); return true; });
  // the stray-byte file too
  const nm = read('more', 'no_meta.dcm');
  const ds2 = await D.parseRaw(nm);
  const e2 = ds2.elements.x00100010;
  for (let i = 0; i < e2.length; i++) nm[e2.dataOffset + i] = i < 4 ? 'TEST'.charCodeAt(i) : 0x20;
  assert.equal((await D.load(nm)).meta.patientName, 'TEST');
});

test('pydicom decodes YBR_FULL_422 and PALETTE COLOR the same way (it has no 1.2.840.10008.1.2.8.1 decoder)', (t) => {
  const { spawnSync } = require('child_process');
  const py = process.env.PYTHON || 'python';
  const probe = spawnSync(py, ['-E', '-P', '-c', 'import pydicom, numpy'], { encoding: 'utf8' });
  if (probe.status !== 0) { t.skip('python with pydicom + numpy is not available'); return; }
  const out = path.join(__dirname, 'tmp', 'more');
  fs.mkdirSync(out, { recursive: true });
  const files = ['SC_ybr_full_422_uncompressed.dcm', 'US-YBR_FULL_422-EVRLE.dcm', 'OT-PAL-8-face.dcm'];
  const script = [
    'import sys, os, numpy as np, pydicom',
    'from pydicom.pixels import apply_color_lut',
    'src, out = sys.argv[1], sys.argv[2]',
    'for f in sys.argv[3:]:',
    '    ds = pydicom.dcmread(os.path.join(src, f), force=True)',
    '    if "TransferSyntaxUID" not in getattr(ds, "file_meta", {}):',
    '        ds.file_meta = pydicom.dataset.FileMetaDataset()',
    '        ds.file_meta.TransferSyntaxUID = pydicom.uid.ImplicitVRLittleEndian if ds.original_encoding[0] else pydicom.uid.ExplicitVRLittleEndian',
    '    a = ds.pixel_array',
    '    if ds.PhotometricInterpretation == "PALETTE COLOR":',
    '        a = apply_color_lut(a, ds)',
    '        if a.dtype != np.uint8: a = (a >> 8).astype(np.uint8)',
    '    elif a.ndim == 3 and ds.get("NumberOfFrames", 1) > 1: a = a[0] * 255',
    '    np.ascontiguousarray(a.astype(np.uint8)).tofile(os.path.join(out, f + ".raw"))',
  ].join('\n');
  const run = spawnSync(py, ['-E', '-P', '-c', script, MORE, out, ...files], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return (async () => {
    for (const f of files) {
      const img = await load('more', f);
      const r = (await img.render({})).rgba;
      const ref = new Uint8Array(fs.readFileSync(path.join(out, f + '.raw')));
      const n = img.width * img.height;
      const k = ref.length / n;
      let s = 0;
      for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) s += Math.abs(r[p * 4 + c] - ref[p * k + (k === 1 ? 0 : c)]);
      const mad = s / (n * 3);
      t.diagnostic(`${f}: mean |Δ| vs pydicom = ${mad.toFixed(3)}`);
      assert.ok(mad < 1, `${f}: ${mad}`);
    }
  })();
});

test('isDicom still rejects other files', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  assert.equal(D.isDicom(png), false);
  assert.equal(D.isDicom(new TextEncoder().encode('Hello, this is a plain text file with some words in it.\n'.repeat(20))), false);
  const tiff = new Uint8Array(512); tiff.set([0x49, 0x49, 0x2A, 0x00, 8, 0, 0, 0]);
  assert.equal(D.isDicom(tiff), false);
  const noise = new Uint8Array(4096); let x = 12345;
  for (let i = 0; i < noise.length; i++) { x = (x * 1103515245 + 12345) >>> 0; noise[i] = x >>> 24; }
  assert.equal(D.isDicom(noise), false);
});
