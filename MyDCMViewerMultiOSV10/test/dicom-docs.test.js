/* node --test — DicomDocs: SR, waveform, encapsulated documents, RT Structure Set / Plan, DICOMDIR, SEG. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../src/js/dicomDecoder');
const W = require('../src/js/dicomWriter');
const X = require('../src/js/dicomDocs');
const { buildDicomDirSet } = require('./helpers/makeDicomDir');

const SAMPLES = path.join(__dirname, '..', 'samples');
const read = (...p) => new Uint8Array(fs.readFileSync(path.join(SAMPLES, ...p)));
const TMP = path.join(__dirname, 'tmp', 'docs');

test('kindOf by SOP Class', () => {
  assert.equal(X.kindOf(read('more', 'test-SR.dcm')), 'sr');
  assert.equal(X.kindOf(read('more', 'waveform_ecg.dcm')), 'waveform');
  assert.equal(X.kindOf(read('more', 'rtplan.dcm')), 'rtplan');
  assert.equal(X.kindOf(read('more', 'rtstruct.dcm')), 'rtstruct');
  assert.equal(X.kindOf(read('pydicom', 'rtdose.dcm')), 'rtdose');
  assert.equal(X.kindOf(read('pydicom-data', 'liver.dcm')), 'seg');
  assert.equal(X.kindOf(read('CT_small.dcm')), 'image');
  assert.equal(X.kindOf(read('more', 'no_meta.dcm')), 'image');
  assert.equal(X.kindOf(read('dicomdir', 'DICOMDIR')), 'dicomdir');
});

test('readSR: test-SR.dcm content tree', () => {
  const sr = X.readSR(read('more', 'test-SR.dcm'));
  assert.equal(sr.title, 'Diagnosis');
  assert.equal(sr.completion, 'COMPLETE');
  assert.equal(sr.verification, 'VERIFIED');
  assert.equal(sr.root.valueType, 'CONTAINER');
  assert.deepEqual(sr.root.children.map((c) => c.valueType), ['UIDREF', 'CONTAINER', 'TEXT', 'COMPOSITE', 'IMAGE']);
  assert.equal(sr.root.children[0].relationship, 'HAS OBS CONTEXT');
  const all = [];
  const walk = (n) => { all.push(n); n.children.forEach(walk); };
  walk(sr.root);
  const types = new Set(all.map((n) => n.valueType));
  for (const t of ['TEXT', 'CODE', 'NUM', 'DATE', 'TIME', 'DATETIME', 'UIDREF', 'IMAGE', 'COMPOSITE', 'SCOORD', 'TCOORD', 'WAVEFORM']) assert.ok(types.has(t), `has ${t}`);
  const num = all.find((n) => n.valueType === 'NUM');
  assert.equal(num.conceptName, 'Diameter');
  assert.equal(num.numeric, 3);
  assert.equal(num.units, 'cm');
  const sc = all.find((n) => n.valueType === 'SCOORD');
  assert.equal(sc.graphicType, 'CIRCLE');
  assert.deepEqual(sc.points, [[0, 0], [255, 255]]);
  const img = all.find((n) => n.valueType === 'IMAGE');
  assert.equal(img.reference.sopClassUid, '1.2.840.10008.5.1.4.1.1.2');
  assert.deepEqual(img.reference.frames, [5, 2]);
  const text = X.srToText(sr);
  assert.match(text, /^Diagnosis/);
  assert.match(text, /\n {4}CONTAINS Diameter \[NUM\]: 3 cm/);
  const html = X.srToHtml(sr);
  assert.match(html, /<details open><summary>/);
  assert.ok(!html.includes('<>{}'), 'text is escaped');
  assert.ok(html.includes('&lt;&gt;{}'));
  assert.ok(!/<link|<style|class="[^"]*"[^>]*href/.test(html), 'no external CSS');
});

test('readWaveform: 12-lead ECG', () => {
  const w = X.readWaveform(read('more', 'waveform_ecg.dcm'));
  assert.equal(w.groups.length, 2);
  const g = w.groups[0];
  assert.equal(g.samplingFrequency, 1000);
  assert.equal(g.nSamples, 10000);
  assert.equal(g.channels.length, 12);
  assert.equal(g.label, 'RHYTHM');
  assert.equal(g.originality, 'ORIGINAL');
  assert.equal(g.channels[1].label, 'Lead II');
  for (const c of g.channels) {
    assert.equal(c.samples.length, 10000);
    assert.ok(c.samples.every(Number.isFinite));
    assert.equal(c.units, 'uV');
  }
  // values pydicom's waveform_array(0) gives for the first samples
  assert.deepEqual(Array.from(g.channels[0].samples.subarray(0, 3)), [100, 81.25, 62.5]);
  assert.deepEqual(Array.from(g.channels[1].samples.subarray(0, 3)), [112.5, 106.25, 100]);
  const csv = X.waveformToCsv(w.groups[1]);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 1 + 1200);
  assert.match(lines[0], /^time_ms,Lead I \(Einthoven\) \(uV\),Lead II \(uV\)/);
  assert.equal(lines[0].split(',').length, 13);
  assert.equal(lines[2].split(',')[0], '1');
});

test('readWaveform: 8-bit mu-law / unsigned and multiplexed samples', () => {
  // two channels interleaved, WaveformBitsAllocated 8: UB and MB
  for (const [interp, raw, expect] of [['UB', [10, 200, 20, 100], [[10, 20], [200, 100]]], ['SB', [10, 0xF6, 20, 0x9C], [[10, 20], [-10, -100]]],
    ['MB', [0xFF, 0x7F, 0x80, 0x00], null]]) {
    const m = { meta: [], elements: [], transferSyntax: '1.2.840.10008.1.2.1' };
    W.set(m, '00080016', '1.2.840.10008.5.1.4.1.1.9.1.1');
    W.set(m, '00080018', W.newUid());
    const ch = (label) => {
      const it = { meta: [], elements: [] };
      W.set(it, '003A0203', label); W.set(it, '003A0210', '2'); W.set(it, '003A0213', '1');
      return { elements: it.elements };
    };
    const grp = { meta: [], elements: [] };
    W.set(grp, '003A0005', 2, 'US'); W.set(grp, '003A0010', 2, 'UL'); W.set(grp, '003A001A', '500');
    W.set(grp, '54001004', 8, 'US'); W.set(grp, '54001006', interp); W.set(grp, '54001010', new Uint8Array(raw), 'OB');
    W.set(grp, '003A0200', [ch('A'), ch('B')]);
    W.set(m, '54000100', [{ elements: grp.elements }]);
    const g = X.readWaveform(W.write(m)).groups[0];
    assert.equal(g.channels.length, 2);
    if (interp === 'MB') {
      // G.711: 0xFF → 0, 0x00 → -32124, 0x7F → 0, 0x80 → +32124
      assert.deepEqual(Array.from(g.channels[0].samples), [(0 + 1) * 2, (32124 + 1) * 2]);
      assert.deepEqual(Array.from(g.channels[1].samples), [(0 + 1) * 2, (-32124 + 1) * 2]);
    } else {
      assert.deepEqual(Array.from(g.channels[0].samples), expect[0].map((v) => (v + 1) * 2));
      assert.deepEqual(Array.from(g.channels[1].samples), expect[1].map((v) => (v + 1) * 2));
    }
  }
});

test('readEncapsulatedDocument: PDF with a pad byte, declared length, CDA', () => {
  const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer <<>>\n%%EOF\n');   // odd length → padded
  assert.equal(pdf.length % 2, 1);
  const mk = (bytes, mime, sop, len) => {
    const m = { meta: [], elements: [], transferSyntax: '1.2.840.10008.1.2.1' };
    W.set(m, '00080016', sop); W.set(m, '00080018', W.newUid());
    W.set(m, '00420010', 'Report'); W.set(m, '00420011', bytes, 'OB'); W.set(m, '00420012', mime);
    if (len !== undefined) W.set(m, '00420015', len, 'UL');
    return W.write(m);
  };
  const f = mk(pdf, 'application/pdf', '1.2.840.10008.5.1.4.1.1.104.1');
  assert.equal(X.kindOf(f), 'pdf');
  const d = X.readEncapsulatedDocument(f);
  assert.equal(d.mime, 'application/pdf');
  assert.equal(d.title, 'Report');
  assert.deepEqual(Array.from(d.bytes), Array.from(pdf));
  const d2 = X.readEncapsulatedDocument(mk(pdf, 'application/pdf', '1.2.840.10008.5.1.4.1.1.104.1', pdf.length - 1));
  assert.equal(d2.bytes.length, pdf.length - 1);
  const xml = new TextEncoder().encode('<ClinicalDocument xmlns="urn:hl7-org:v3"/>\n');
  const c = mk(xml, 'text/xml', '1.2.840.10008.5.1.4.1.1.104.2');
  assert.equal(X.kindOf(c), 'cda');
  assert.equal(new TextDecoder().decode(X.readEncapsulatedDocument(c).bytes), '<ClinicalDocument xmlns="urn:hl7-org:v3"/>\n');
  // binary STL: 84-byte header + 1 triangle (50 bytes) = 134 (even, nothing stripped)
  const stl = new Uint8Array(134); stl[80] = 1;
  const s = mk(stl, 'model/stl', '1.2.840.10008.5.1.4.1.1.104.3');
  assert.equal(X.kindOf(s), 'stl');
  assert.equal(X.readEncapsulatedDocument(s).bytes.length, 134);
});

test('readRtStruct: named ROIs with colours and contour points', () => {
  const s = X.readRtStruct(read('more', 'rtstruct.dcm'));
  assert.equal(s.label, 'sep30');
  assert.ok(s.frameOfReference.length > 10);
  assert.deepEqual(s.rois.map((r) => r.name), ['patient', 'Isocenter 1', 'Isocenter 2']);
  const body = s.rois[0];
  assert.deepEqual(body.color, [220, 160, 120]);
  assert.equal(body.interpretedType, 'EXTERNAL');
  assert.equal(body.contours.length, 3);
  for (const c of body.contours) {
    assert.ok(c.points.length >= 3 && c.points.every((p) => p.length === 3 && p.every(Number.isFinite)));
    assert.equal(c.type, 'CLOSED_PLANAR');
    assert.equal(c.points.length, c.nPoints);
  }
  assert.equal(s.rois[1].contours[0].type, 'POINT');
});

test('readRtPlan: fraction groups, beams, control points, prescriptions', () => {
  const p = X.readRtPlan(read('more', 'rtplan.dcm'));
  assert.equal(p.label, 'Plan1');
  assert.equal(p.fractionGroups.length, 1);
  assert.equal(p.fractionGroups[0].fractions, 30);
  assert.equal(p.fractionGroups[0].beams[0].number, 1);
  assert.ok(Math.abs(p.fractionGroups[0].beams[0].meterset - 116.0036697) < 1e-6);
  assert.equal(p.beams.length, 1);
  const b = p.beams[0];
  assert.equal(b.name, 'Field 1');
  assert.equal(b.radiationType, 'PHOTON');
  assert.equal(b.machine, 'unit001');
  assert.equal(b.energy, 6);
  assert.equal(b.gantry, 0);
  assert.equal(b.controlPoints.length, 2);
  assert.equal(b.isocenter.length, 3);
  assert.equal(b.controlPoints[0].devices.length, 2);
  assert.deepEqual(p.prescriptions.map((x) => x.description), ['iso', 'PTV']);
});

test('readDicomDir: synthetic DICOMDIR round trip (offset links and sequence-order fallback)', async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const files = [];
  const add = async (src, p) => files.push({ path: p, bytes: await W.decompress(read(...src)) });
  await add(['CT_small.dcm'], ['A', 'CT1']);
  await add(['MR_small.dcm'], ['B', 'MR1']);
  await add(['pydicom', 'MR_small_RLE.dcm'], ['B', 'MR2']);   // same series as MR_small → 2 images in one series
  const dir = W.makeDicomDir(files, { fileSetId: 'TESTSET' });
  assert.equal(X.kindOf(dir), 'dicomdir');
  const r = X.readDicomDir(dir);
  assert.equal(r.fileSetId, 'TESTSET');
  assert.ok(r.linked, 'offsets were followed');
  assert.equal(r.patients.length, 2);
  assert.equal(r.patients[0].id, '1CT1');
  assert.equal(r.patients[1].studies[0].series[0].images.length, 2);
  assert.deepEqual(r.patients[1].studies[0].series[0].images.map((i) => i.path.join('/')), ['B/MR1', 'B/MR2']);
  assert.equal(r.patients[0].studies[0].series[0].modality, 'CT');
  assert.equal(r.patients[0].studies[0].series[0].images[0].sopClassUid, '1.2.840.10008.5.1.4.1.1.2');
  assert.deepEqual(r.files.map((f) => f.join('/')), ['A/CT1', 'B/MR1', 'B/MR2']);
  // break the links: the reader falls back to the record order
  const m = W.parse(dir);
  W.set(m, '00041200', 0, 'UL');
  const r2 = X.readDicomDir(W.write(m));
  assert.equal(r2.linked, false);
  assert.deepEqual(r2.patients.map((p) => p.id), r.patients.map((p) => p.id));
  assert.deepEqual(r2.files, r.files);
  // and the DICOMDIR loads in the decoder as a document
  await assert.rejects(D.load(dir), (err) => err.docKind === 'dicomdir');
});

test('samples/dicomdir/DICOMDIR resolves to existing files, matching SOP instances', async () => {
  const base = path.join(SAMPLES, 'dicomdir');
  const r = X.readDicomDir(read('dicomdir', 'DICOMDIR'));
  assert.equal(r.fileSetId, 'MYDCMSAMPLE');
  assert.ok(r.linked);
  const leaves = r.patients.flatMap((p) => p.studies.flatMap((s) => s.series.flatMap((se) => se.images)));
  assert.equal(leaves.length, 4);
  assert.ok(leaves.some((l) => l.type === 'SR DOCUMENT'));
  for (const l of leaves) {
    const file = path.join(base, ...l.path);
    assert.ok(fs.existsSync(file), `${l.path.join('/')} exists`);
    const bytes = new Uint8Array(fs.readFileSync(file));
    const m = W.parse(bytes);
    assert.equal(W.get(m, '00080018'), l.sopInstanceUid);
    assert.equal(m.transferSyntax, '1.2.840.10008.1.2.1');
    if (l.type === 'IMAGE') { const img = await D.load(bytes); assert.ok(img.width > 0); }
  }
  // the committed set is what the generator makes now (same records / files)
  const out = path.join(TMP, 'dicomdir');
  const gen = await buildDicomDirSet(out);
  assert.deepEqual(X.readDicomDir(gen.dicomdir).files, r.files);
});

test('segmentationInfo: liver SEG', () => {
  const s = X.segmentationInfo(read('pydicom-data', 'liver.dcm'));
  assert.equal(s.type, 'BINARY');
  assert.equal(s.frames, 3);
  assert.equal(s.segments.length, 1);
  assert.equal(s.segments[0].label, 'Liver');
  assert.deepEqual(s.segments[0].frames, [0, 1, 2]);
  assert.equal(s.segments[0].color.length, 3);
  assert.ok(s.segments[0].color[0] > s.segments[0].color[2], 'liver colour is reddish');
  const s2 = X.segmentationInfo(read('more', 'liver_deflate.dcm'));
  assert.equal(s2.segments[0].label, 'Liver');
});

test('read(): picks the reader by kind', () => {
  assert.equal(X.read(read('more', 'test-SR.dcm')).doc.title, 'Diagnosis');
  assert.equal(X.read(read('more', 'rtstruct.dcm')).kind, 'rtstruct');
  assert.equal(X.read(read('CT_small.dcm')).doc, null);
});
