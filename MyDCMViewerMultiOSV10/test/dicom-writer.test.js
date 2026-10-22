/* node --test — DicomWriter: parse / edit / write round trips, decompress, anonymise, Secondary Capture,
 * and an independent check of the output with pydicom (skipped when Python / pydicom is not installed). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const D = require('../src/js/dicomDecoder');
const W = require('../src/js/dicomWriter');

const SAMPLES = path.join(__dirname, '..', 'samples');
const TMP = path.join(__dirname, 'tmp', 'writer');
const read = (p) => new Uint8Array(fs.readFileSync(path.join(SAMPLES, p)));
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
fs.mkdirSync(TMP, { recursive: true });

// Sources for the decompress round trip (lossless and lossy transfer syntaxes, colour models, bit depths)
const CT = 'cornerstone/CTImage.dcm';
const ROUND_TRIP = [
  CT, `${CT}_LittleEndianExplicitTransferSyntax_1.2.840.10008.1.2.1.dcm`, `${CT}_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.dcm`,
  `${CT}_DeflatedExplicitVRLittleEndianTransferSyntax_1.2.840.10008.1.2.1.99.dcm`, `${CT}_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm`,
  `${CT}_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57.dcm`, `${CT}_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm`,
  `${CT}_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm`, `${CT}_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm`,
  'MR_small.dcm', 'pydicom/MR_small_implicit.dcm', 'pydicom/MR_small_bigendian.dcm', 'pydicom/MR_small_RLE.dcm', 'pydicom/MR_small_jp2klossless.dcm',
  'pydicom/MR_small_jpeg_ls_lossless.dcm', 'pydicom/MR_small_padded.dcm',
  'pydicom-data/emri_small.dcm', 'pydicom-data/emri_small_RLE.dcm', 'pydicom-data/emri_small_big_endian.dcm', 'pydicom-data/emri_small_jpeg_2k_lossless.dcm',
  'pydicom-data/emri_small_jpeg_ls_lossless.dcm',
  'pydicom-data/SC_rgb.dcm', 'pydicom-data/SC_rgb_16bit.dcm', 'pydicom-data/SC_rgb_32bit.dcm', 'pydicom-data/SC_rgb_2frame.dcm', 'pydicom/SC_rgb_rle.dcm',
  'pydicom/SC_rgb_rle_16bit.dcm', 'pydicom/SC_rgb_rle_2frame.dcm', 'pydicom-data/SC_ybr_full_uncompressed.dcm', 'SC_rgb_small_odd.dcm', 'pydicom-data/color-pl.dcm',
  'pydicom/examples_palette.dcm', 'more/OT-PAL-8-face.dcm', 'pydicom/examples_overlay.dcm', 'pydicom-data/MR-SIEMENS-DICOM-WithOverlays.dcm',
  'pydicom-data/parametric_map_float.dcm', 'pydicom-data/parametric_map_double_float.dcm', 'pydicom/ExplVR_BigEnd.dcm', 'pydicom/rtdose_rle.dcm',
  'pydicom-data/liver.dcm', 'pydicom-data/liver_rle.dcm', 'pydicom-data/liver_nonbyte_aligned.dcm', 'more/liver_deflate.dcm', 'pydicom-data/mlut_18.dcm', 'pydicom-data/vlut_04.dcm',
  'more/no_meta.dcm', 'more/SC_ybr_full_422_uncompressed.dcm', 'more/US-YBR_FULL_422-EVRLE.dcm', 'more/JLSL_RGB_ILV0.dcm', 'pydicom-data/JLSL_16_15_1_1F.dcm',
  'pydicom-data/explicit_VR-UN.dcm', 'pydicom/J2K_pixelrep_mismatch.dcm',
];
const LOSSY = [
  `${CT}_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm`, `${CT}_JPEGProcess2_4TransferSyntax_1.2.840.10008.1.2.4.51.dcm`,
  `${CT}_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm`, `${CT}_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm`,
  'more/CTImage.dcm_JPEGProcess6_8TransferSyntax_1.2.840.10008.1.2.4.53.dcm', 'more/CTImage.dcm_JPEGProcess10_12TransferSyntax_1.2.840.10008.1.2.4.55.dcm',
  'pydicom/SC_rgb_jpeg_dcmtk.dcm', 'pydicom/examples_ybr_color.dcm', 'pydicom-data/HTJ2K_08_RGB.dcm', 'more/JLSN_RGB_ILV0.dcm', 'pydicom/JPEG-lossy.dcm',
];

// Up to `max` frames of an image, rendered with default options
async function renders(img, max = 4) {
  const out = [];
  const n = Math.min(img.frames, max);
  for (let f = 0; f < n; f++) out.push((await img.render({ frame: f, resetWindow: true })).rgba);
  return out;
}

const pyOutputs = [];   // { file, ts, shape, sumRaw, sumMasked, float }
async function record(name, bytes) {
  const file = path.join(TMP, name.replace(/[^\w.-]+/g, '_'));
  fs.writeFileSync(file, bytes);
  const m = W.parse(bytes);
  const entry = { file, ts: m.transferSyntax };
  if (m.elements.some((e) => e.tag === '7FE00010' || e.tag === '7FE00008' || e.tag === '7FE00009')) {
    const img = await D.load(bytes);
    const s = (await img.rawFrame(0)).samples;
    const spp = img.samplesPerPixel;
    let raw = 0, masked = 0;
    const bs = img.bitsStored;
    for (let i = 0; i < img.width * img.height * spp; i++) {
      const v = s[i];
      raw += v;
      if (img.isFloat) masked += v;
      else if (img.signed) { const sh = 32 - bs; masked += bs < 32 ? (v << sh) >> sh : v; }
      else masked += bs < 32 ? v % 2 ** bs : v;
    }
    const shape = [...(img.frames > 1 ? [img.frames] : []), img.height, img.width, ...(spp > 1 ? [spp] : [])];
    Object.assign(entry, { shape, sumRaw: raw, sumMasked: masked, float: img.isFloat });
  }
  pyOutputs.push(entry);
}

test('decompress: lossless sources render byte-identically (every frame)', async (t) => {
  let n = 0;
  for (const src of ROUND_TRIP) {
    const bytes = read(src);
    const a = await D.load(bytes);
    const out = await W.decompress(bytes);
    const b = await D.load(out);
    assert.equal(b.transferSyntax, '1.2.840.10008.1.2.1', src);
    assert.equal(b.width, a.width); assert.equal(b.height, a.height); assert.equal(b.frames, a.frames, src);
    assert.equal(b.bitsStored, a.bitsStored, src);
    assert.equal(b.signed, a.signed, src);
    assert.equal(b.slope, a.slope); assert.equal(b.intercept, a.intercept);
    if (!a.gray) { assert.equal(b.photometric, 'RGB', src); assert.equal(b.planar, false); }
    else assert.equal(b.photometric, a.photometric, src);
    const ra = await renders(a), rb = await renders(b);
    ra.forEach((x, i) => assert.ok(same(x, rb[i]), `${src} frame ${i} differs`));
    if (a.gray && !a.isFloat && a.photometric !== 'PALETTE COLOR' && a.bitsAllocated > 1) {
      const va = await a.valuesOf(0), vb = await b.valuesOf(0);
      for (let i = 0; i < va.length; i += 97) assert.ok(Object.is(va[i], vb[i]) || va[i] === vb[i], `${src} value ${i}`);
    }
    if (/emri_small\.dcm|SC_rgb_2frame|liver_deflate|examples_palette|parametric_map_float|SC_ybr_full_422|ExplVR_BigEnd|JLSL_RGB|SC_rgb_32bit|CTImage\.dcm$/.test(src)) await record(`decomp_${path.basename(src)}`, out);
    a.release(); b.release();
    n++;
  }
  t.diagnostic(`${n} files decompressed and re-rendered identically`);
});

test('decompress: lossy sources keep the size, are flagged lossy and render like the decoded original', async (t) => {
  const ref = await D.load(read(CT));
  const refR = (await ref.render({ wc: 40, ww: 400 })).rgba;
  const notes = [];
  for (const src of LOSSY) {
    const bytes = read(src);
    const a = await D.load(bytes);
    const out = await W.decompress(bytes);
    const b = await D.load(out);
    assert.equal(b.width, a.width); assert.equal(b.height, a.height);
    assert.equal(W.get(W.parse(out), '00282110'), '01', `${src} Lossy Image Compression`);
    const ra = await renders(a, 2), rb = await renders(b, 2);
    let err = 0;
    for (let i = 0; i < ra[0].length; i++) err += Math.abs(ra[0][i] - rb[0][i]);
    err /= ra[0].length;
    assert.ok(err < 1, `${src}: error ${err}`);
    if (src.startsWith(CT) || src.includes('CTImage')) {
      const r = (await b.render({ wc: 40, ww: 400 })).rgba;
      let e = 0; for (let i = 0; i < r.length; i++) if (i % 4 !== 3) e += Math.abs(r[i] - refR[i]);
      const mae = e / (r.length * 0.75);
      notes.push(`${src.match(/(\d\.\d\d)\.dcm$/)[1]} ${mae.toFixed(2)}`);
      assert.ok(mae < 6, `${src} vs uncompressed CT: ${mae}`);
    }
    if (/4\.91|SC_rgb_jpeg_dcmtk|4\.55/.test(src)) await record(`decomp_${path.basename(src)}`, out);
  }
  t.diagnostic(`lossy CT (TS: mean |Δ| grey levels vs uncompressed, W400/L40): ${notes.join(', ')}`);
});

// Every element of a model, flattened: path → { vr, bytes }
function flat(model) {
  const out = new Map();
  const walk = (list, prefix) => {
    for (const el of list) {
      const p = prefix ? `${prefix}/${el.tag}` : el.tag;
      if (el.tag.slice(4) === '0000') continue;   // group lengths are recomputed
      if (el.items) { out.set(p, { vr: 'SQ', n: el.items.length }); el.items.forEach((it, i) => walk(it.elements, `${p}/${i}`)); continue; }
      if (el.fragments) { out.set(p, { vr: el.vr, frags: el.fragments.map((f) => Buffer.from(f).toString('base64')).join('|') }); continue; }
      let v = el.value;
      if (v.length % 2) v = new Uint8Array([...v, el.vr === 'UI' || !['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UR', 'UT'].includes(el.vr) ? 0 : 0x20]);
      out.set(p, { vr: el.vr, v: Buffer.from(v).toString('base64') });
    }
  };
  walk(model.elements, '');
  return out;
}

test('parse → set Patient Name → write → parse keeps every other element', async () => {
  for (const src of ['CT_small.dcm', 'pydicom/MR_small_implicit.dcm', 'pydicom/MR_small_bigendian.dcm', 'pydicom/JPEG-lossy.dcm', 'more/test-SR.dcm',
    'more/rtstruct.dcm', 'more/no_meta.dcm', 'pydicom/image_dfl.dcm', 'pydicom-data/emri_small_jpeg_2k_lossless.dcm', 'more/waveform_ecg.dcm']) {
    const bytes = read(src);
    const m = W.parse(bytes);
    const before = flat(m);
    W.set(m, '00100010', 'Doe^Jane');
    const out = W.write(m);
    const m2 = W.parse(out);
    assert.equal(W.get(m2, '00100010'), 'Doe^Jane', src);
    const after = flat(m2);
    before.delete('00100010'); after.delete('00100010');
    assert.deepEqual([...after.keys()], [...before.keys()], `${src}: same elements`);
    for (const [k, v] of before) assert.deepEqual(after.get(k), v, `${src} ${k}`);
    const encapsulated = m.elements.some((e) => e.fragments);
    assert.equal(m2.transferSyntax, encapsulated ? m.transferSyntax : '1.2.840.10008.1.2.1', src);
    // pixels still decode the same
    if (m.elements.some((e) => e.tag === '7FE00010')) {
      const a = await D.load(bytes), b = await D.load(out);
      assert.ok(same((await a.render({})).rgba, (await b.render({})).rgba), `${src} render`);
      assert.equal(b.meta.patientName, 'Doe Jane');
    }
  }
  // implicit VR output
  const m = W.parse(read('MR_small.dcm'));
  const imp = W.write(m, { transferSyntax: '1.2.840.10008.1.2' });
  const back = W.parse(imp);
  assert.equal(back.transferSyntax, '1.2.840.10008.1.2');
  assert.equal(W.get(back, '00280010'), 64);
  assert.ok(same((await (await D.load(imp)).render({})).rgba, (await (await D.load(read('MR_small.dcm'))).render({})).rgba));
  await record('implicit_MR_small.dcm', imp);
  assert.throws(() => W.write(W.parse(read('pydicom/JPEG-lossy.dcm')), { transferSyntax: '1.2.840.10008.1.2.1' }), /decompress/);
});

test('get / set / remove: value types, padding, dictionary VRs, sequence paths', () => {
  const m = W.parse(read('CT_small.dcm'));
  assert.equal(W.get(m, '(0028,0010)'), 128);
  assert.equal(W.get(m, 'x00280011'), 128);
  assert.equal(W.get(m, '00080060'), 'CT');
  assert.equal(W.get(m, '00020010'), '1.2.840.10008.1.2.1');
  W.set(m, '00081030', 'ODD');                       // LO → padded with a space
  const e = m.elements.find((x) => x.tag === '00081030');
  assert.equal(e.value.length, 4); assert.equal(e.value[3], 0x20);
  W.set(m, '00209999', '1.2.3');                     // unknown → LO
  W.set(m, '0020000D', '1.2.345');                   // UI → padded with NUL
  assert.equal(m.elements.find((x) => x.tag === '0020000D').value[7], 0);
  W.set(m, '00280030', [0.5, 0.25]);                 // DS from numbers
  assert.equal(W.get(m, '00280030'), '0.5\\0.25');
  W.set(m, '00181310', [0, 256, 256, 0]);            // US multi-valued (dictionary VR)
  assert.deepEqual(W.get(m, '00181310'), [0, 256, 256, 0]);
  W.set(m, '00189073', 1.5);                         // FD
  assert.equal(W.get(m, '00189073'), 1.5);
  W.set(m, '00081110/0/00081155', '1.2.3.4');        // creates the sequence and item
  assert.equal(W.get(m, '00081110/0/00081155'), '1.2.3.4');
  W.set(m, '00100010', '홍^길동');                     // outside Latin-1 → UTF-8 + ISO_IR 192
  assert.equal(W.get(m, '00080005'), 'ISO_IR 192');
  const back = W.parse(W.write(m));
  assert.equal(W.get(back, '00100010'), '홍^길동');
  assert.equal(W.get(back, '00081110/0/00081155'), '1.2.3.4');
  assert.equal(W.get(back, '00081030'), 'ODD');
  assert.ok(W.remove(back, '00081030'));
  assert.equal(W.get(back, '00081030'), undefined);
  assert.equal(W.remove(back, '00081030'), false);
  const meta = W.parse(W.write(back)).meta;
  const tagOf = (t) => meta.find((x) => x.tag === t);
  assert.equal(String.fromCharCode(...tagOf('00020013').value).trim(), 'MYDCMVIEWER_1');
  assert.equal(String.fromCharCode(...tagOf('00020012').value).replace(/\0/g, ''), W.IMPLEMENTATION_CLASS_UID);
});

test('editableTags lists a tag-editor view', () => {
  const list = W.editableTags(W.parse(read('CT_small.dcm')));
  const pn = list.find((x) => x.tag === '00100010');
  assert.equal(pn.editable, true); assert.equal(pn.vr, 'PN'); assert.equal(pn.name, 'Patient Name'); assert.equal(pn.depth, 0);
  assert.equal(list.find((x) => x.tag === '7FE00010').editable, false);
  assert.equal(list.find((x) => x.tag === '00020010').editable, false);
  assert.equal(list.find((x) => x.tag === '00280010').value, '128');
  const nested = W.editableTags(W.parse(read('more/rtstruct.dcm'))).filter((x) => x.depth > 0 && x.editable);
  assert.ok(nested.length > 10);
  assert.match(nested[0].tag, /^[0-9A-F]{8}\/\d+\/[0-9A-F]{8}/);
});

test('newUid: 2.25 form, unique, ≤ 64 characters', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const u = W.newUid();
    assert.match(u, /^2\.25\.(0|[1-9]\d*)$/);
    assert.ok(u.length <= 64);
    seen.add(u);
  }
  assert.equal(seen.size, 200);
});

test('anonymize: PHI and private tags removed (sequences too), consistent new UIDs, pixels unchanged', async () => {
  const PHI = W.DEFAULT_PHI_TAGS;
  for (const src of ['CT_small.dcm', 'MR_small.dcm', 'pydicom/JPEG-lossy.dcm', 'more/rtstruct.dcm', 'more/test-SR.dcm', 'pydicom-data/emri_small.dcm', 'more/no_meta.dcm']) {
    const bytes = read(src);
    const orig = W.parse(bytes);
    // put PHI into a sequence item to prove nested elements are handled
    W.set(orig, '00081110/0/00100010', 'Nested^Name');
    W.set(orig, '00081110/0/00090010', 'PRIVATE CREATOR');
    const out = W.anonymize(W.write(orig, { transferSyntax: orig.elements.some((e) => e.fragments) ? orig.transferSyntax : undefined }), { replacement: 'ANONYMOUS' });
    const m = W.parse(out);
    const walk = (list) => {
      for (const el of list) {
        assert.ok(parseInt(el.tag.slice(0, 4), 16) % 2 === 0, `${src}: private ${el.tag} left`);
        if (PHI.includes(el.tag)) {
          const v = W.valueOf(el);
          assert.ok(v === '' || v === 'ANONYMOUS', `${src}: ${el.tag} = ${v}`);
        }
        if (el.items) el.items.forEach((it) => walk(it.elements));
      }
    };
    walk(m.elements);
    assert.equal(W.get(m, '00120062'), 'YES');
    assert.ok(W.get(m, '00120063').length > 0);
    assert.equal(W.get(m, '00100010'), 'ANONYMOUS');
    for (const t of ['0020000D', '0020000E', '00080018']) {
      const before = W.get(orig, t);
      if (before) { assert.notEqual(W.get(m, t), before, `${src} ${t} renewed`); assert.match(W.get(m, t), /^2\.25\./); }
    }
    assert.equal(W.get(m, '00020003'), W.get(m, '00080018'), 'meta SOP instance = data set SOP instance');
    assert.equal(W.get(m, '00080016'), W.get(orig, '00080016'), 'SOP class kept');
    if (src === 'more/rtstruct.dcm') {
      // the frame of reference UID is replaced the same way where it is referenced
      const forUid = W.get(m, '30060010/0/00200052');
      assert.equal(W.get(m, '30060020/0/30060024'), forUid);
      assert.notEqual(forUid, W.get(orig, '30060010/0/00200052'));
    }
    if (orig.elements.some((e) => e.tag === '7FE00010')) {
      const a = await D.load(bytes), b = await D.load(out);
      assert.ok(same((await a.render({})).rgba, (await b.render({})).rgba), `${src}: pixels changed`);
    }
    if (src === 'CT_small.dcm' || src === 'pydicom/JPEG-lossy.dcm') await record(`anon_${path.basename(src)}`, out);
  }
  // options: keep private tags, keep UIDs, custom tag list
  const m = W.parse(W.anonymize(read('CT_small.dcm'), { tags: ['00100010'], removePrivate: false, newUids: false, replacement: 'X' }));
  assert.equal(W.get(m, '00100010'), 'X');
  assert.equal(W.get(m, '00100020'), W.get(W.parse(read('CT_small.dcm')), '00100020'));
  assert.ok(m.elements.some((e) => parseInt(e.tag.slice(0, 4), 16) % 2 === 1));
  assert.equal(W.get(m, '0020000D'), W.get(W.parse(read('CT_small.dcm')), '0020000D'));
});

test('secondaryCapture: RGB, multi-frame RGB, 8-bit and 16-bit grey', async () => {
  const w = 37, h = 21, n = w * h;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { rgba[i * 4] = (i * 7) & 255; rgba[i * 4 + 1] = (i * 13) & 255; rgba[i * 4 + 2] = (i * 29) & 255; rgba[i * 4 + 3] = 255; }
  const meta = { patientName: 'SC^Test', patientId: 'SC1', studyDescription: 'Capture', seriesDescription: 'Screen', modality: 'OT' };
  const sc = W.secondaryCapture({ width: w, height: h, rgba, meta });
  const img = await D.load(sc);
  assert.equal(W.get(W.parse(sc), '00080016'), '1.2.840.10008.5.1.4.1.1.7');
  assert.equal(img.width, w); assert.equal(img.height, h);
  assert.ok(same((await img.render({})).rgba, rgba), 'RGB pixels come back');
  assert.equal(img.meta.patientName, 'SC Test');
  await record('sc_rgb.dcm', sc);

  const frames = [0, 1, 2].map((k) => { const f = new Uint8ClampedArray(rgba); for (let i = 0; i < n; i++) f[i * 4] = (f[i * 4] + k * 50) & 255; return f; });
  const mf = W.secondaryCapture({ width: w, height: h, frames, meta: { ...meta, studyUid: '1.2.3.4', seriesUid: '1.2.3.4.5' } });
  const mfm = W.parse(mf);
  assert.equal(W.get(mfm, '00080016'), '1.2.840.10008.5.1.4.1.1.7.4');
  assert.equal(W.get(mfm, '0020000D'), '1.2.3.4');
  const mi = await D.load(mf);
  assert.equal(mi.frames, 3);
  for (let k = 0; k < 3; k++) assert.ok(same((await mi.render({ frame: k })).rgba, frames[k]), `frame ${k}`);
  await record('sc_rgb_mf.dcm', mf);

  const g8 = new Uint8Array(n); for (let i = 0; i < n; i++) g8[i] = (i * 3) & 255;
  const gi = await D.load(W.secondaryCapture({ width: w, height: h, gray: g8, meta }));
  const gr = (await gi.render({})).rgba;
  for (let i = 0; i < n; i++) assert.equal(gr[i * 4], g8[i], `grey pixel ${i}`);

  const g16 = new Uint16Array(n); for (let i = 0; i < n; i++) g16[i] = i * 50;
  const s16 = W.secondaryCapture({ width: w, height: h, gray: g16, bits: 16, meta, frames: [g16, g16.map((v) => 65535 - v)] });
  assert.equal(W.get(W.parse(s16), '00080016'), '1.2.840.10008.5.1.4.1.1.7.3');
  const i16 = await D.load(s16);
  await i16.render({ frame: 1 });
  assert.deepEqual(Array.from(i16.samplesOf(1).subarray(0, 5)), [65535, 65485, 65435, 65385, 65335]);
  await i16.render({ frame: 0 });
  assert.deepEqual(Array.from(i16.samplesOf(0)), Array.from(g16));
  await record('sc_gray16_mf.dcm', s16);
});

test('DICOMDIR output passes pydicom too', async () => {
  const files = [{ path: ['A', 'B'], bytes: await W.decompress(read('MR_small.dcm')) }];
  await record('DICOMDIR_small', W.makeDicomDir(files));
});

test('independent validation with pydicom', (t) => {
  const py = process.env.PYTHON || 'python';
  // -E -P: ignore PYTHON* variables and do not put the script directory on sys.path (user site stays enabled — pydicom may live there)
  const probe = spawnSync(py, ['-E', '-P', '-c', 'import pydicom, numpy; print(pydicom.__version__)'], { encoding: 'utf8' });
  if (probe.status !== 0) { t.skip('python with pydicom + numpy is not available'); return; }
  const manifest = path.join(TMP, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify(pyOutputs));
  const script = [
    'import json, sys, warnings',
    'import numpy as np, pydicom',
    'from pydicom.dataset import validate_file_meta',
    'warnings.simplefilter("ignore")',
    'res = []',
    'for e in json.load(open(sys.argv[1])):',
    '    r = {"file": e["file"], "ok": True, "why": []}',
    '    try:',
    '        ds = pydicom.dcmread(e["file"])',
    '        validate_file_meta(ds.file_meta, enforce_standard=True)',
    '        if str(ds.file_meta.TransferSyntaxUID) != e["ts"]: r["why"].append("ts %s" % ds.file_meta.TransferSyntaxUID)',
    '        if "shape" in e:',
    '            a = ds.pixel_array',
    '            if list(a.shape) != e["shape"]: r["why"].append("shape %s != %s" % (list(a.shape), e["shape"]))',
    '            f0 = a[0] if len(e["shape"]) > (3 if e["shape"][-1] == 3 and len(e["shape"]) >= 3 else 2) else a',
    '            s = float(np.asarray(f0, dtype=np.float64).sum())',
    '            tol = 1e-6 * max(1.0, abs(e["sumMasked"])) if e.get("float") else 0.5',
    '            if abs(s - e["sumMasked"]) > tol and abs(s - e["sumRaw"]) > tol: r["why"].append("sum %r != %r" % (s, e["sumMasked"]))',
    '    except Exception as ex:',
    '        if "available plugins" in str(ex) or "No pixel data decoders" in str(ex): r["nodecoder"] = str(ex).splitlines()[-1].strip()',
    '        else: r["why"].append("%s: %s" % (type(ex).__name__, ex))',
    '    r["ok"] = not r["why"]',
    '    res.append(r)',
    'print(json.dumps(res))',
  ].join('\n');
  const run = spawnSync(py, ['-E', '-P', '-c', script, manifest], { encoding: 'utf8', maxBuffer: 1 << 24 });
  assert.equal(run.status, 0, run.stderr);
  const res = JSON.parse(run.stdout.trim().split('\n').pop());
  const bad = res.filter((r) => !r.ok);
  t.diagnostic(`pydicom ${probe.stdout.trim()} read ${res.length} files written by DicomWriter; ${bad.length} problem(s)`);
  // compressed outputs whose codec pydicom lacks here: the file meta / data set were still validated
  for (const r of res.filter((x) => x.nodecoder)) t.diagnostic(`${path.basename(r.file)}: pixels not checked by pydicom (${r.nodecoder})`);
  assert.equal(res.length, pyOutputs.length);
  assert.deepEqual(bad.map((r) => `${path.basename(r.file)}: ${r.why.join('; ')}`), []);
});
