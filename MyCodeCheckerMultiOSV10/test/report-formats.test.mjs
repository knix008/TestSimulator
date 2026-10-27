// Reports in every format with the chart pictures: Word, Excel, PDF,
// PowerPoint, Markdown (pictures inside or apart), HTML; and reports written
// automatically after an analysis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const { createApi } = require('../core/api.js');
const chart = require('../core/export/chart.js');
const ex = require('../core/export/index.js');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const DEMO = path.resolve('samples/demo');

/** Entry names of a ZIP (local headers). */
function zipNames(buf) {
  const names = [];
  for (let p = 0; p + 30 < buf.length && buf.readUInt32LE(p) === 0x04034b50;) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    names.push(buf.toString('utf8', p + 30, p + 30 + nameLen));
    p += 30 + nameLen + extra + size;
  }
  return names;
}

function zipText(buf, name) {
  for (let p = 0; p + 30 < buf.length && buf.readUInt32LE(p) === 0x04034b50;) {
    const method = buf.readUInt16LE(p + 8);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const n = buf.toString('utf8', p + 30, p + 30 + nameLen);
    const data = buf.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
    if (n === name) return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    p += 30 + nameLen + extra + size;
  }
  return null;
}

test('charts are valid PNG files with the expected size', () => {
  const c = chart.barChart({ title: '심각도', items: [{ label: '차단', value: 3, color: '#d64545' }, { label: 'Minor', value: 10 }] });
  assert.deepEqual([...c.png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(c.png.readUInt32BE(16), c.width);
  assert.equal(c.png.readUInt32BE(20), c.height);
  // IDAT decodes to height rows of 1 + 3*width bytes.
  let idat = [];
  for (let p = 8; p < c.png.length;) { const len = c.png.readUInt32BE(p); if (c.png.toString('latin1', p + 4, p + 8) === 'IDAT') idat.push(c.png.subarray(p + 8, p + 8 + len)); p += 12 + len; }
  assert.equal(zlib.inflateSync(Buffer.concat(idat)).length, c.height * (1 + c.width * 3));
  const all = chart.reportCharts({ issues: [{ type: 'BUG', severity: 'MAJOR', rule: 'r1' }], measures: {}, ratings: { reliability: 'C' } }, { lang: 'en' });
  assert.deepEqual(all.map((x) => x.id), ['ratings', 'types', 'severity', 'rules']);
});

test('every format carries the pictures', async () => {
  const api = createApi({ configDir: tmp('mcc-rep-') });
  const r = await api.call('project.scan', { path: DEMO });
  const args = { projectId: r.project.id, kind: 'executive', lang: 'ko' };
  const bin = async (format) => Buffer.from((await api.call('report.export', { ...args, format })).base64, 'base64');

  const docx = await bin('docx');
  assert.equal(zipNames(docx).filter((n) => /^word\/media\/image\d+\.png$/.test(n)).length, 4);
  assert.match(zipText(docx, 'word/document.xml'), /<a:blip r:embed="rIdImg1"\/>/);

  const xlsx = await bin('xlsx');
  assert.equal(zipNames(xlsx).filter((n) => /^xl\/media\//.test(n)).length, 4);
  assert.match(zipText(xlsx, 'xl/workbook.xml'), /<sheet name="차트"/);

  const pptx = await bin('pptx');
  const names = zipNames(pptx);
  assert.ok(names.includes('ppt/presentation.xml'));
  assert.equal(names.filter((n) => /^ppt\/media\//.test(n)).length, 4);
  assert.ok(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length >= 3);

  const pdf = await bin('pdf');
  assert.equal(pdf.toString('latin1', 0, 5), '%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Subtype \/Image/g) || []).length, 4);

  const html = await api.call('report.export', { ...args, format: 'html' });
  assert.equal((html.body.match(/<img src="data:image\/png;base64,/g) || []).length, 4);

  const mdIn = await api.call('report.export', { ...args, format: 'md', embedImages: true });
  assert.equal((mdIn.body.match(/!\[[^\]]*\]\(data:image\/png;base64,/g) || []).length, 4);
  assert.equal(mdIn.images, undefined);

  const mdOut = await api.call('report.export', { ...args, format: 'md', embedImages: false });
  assert.equal(mdOut.images.length, 4);
  for (const img of mdOut.images) {
    assert.match(img.path, /^executive-.*_images\/[\w-]+\.png$/);
    assert.ok(mdOut.body.includes(`](${encodeURI(img.path)})`));
  }
  const zipped = await api.call('report.export', { ...args, format: 'md', embedImages: false, zip: true });
  assert.equal(zipped.format, 'zip');
  const zn = zipNames(Buffer.from(zipped.base64, 'base64'));
  assert.equal(zn.filter((n) => n.endsWith('.png')).length, 4);
  assert.ok(zn.some((n) => n.endsWith('.md')));
});

test('the Markdown default follows Settings › Reports', async () => {
  const api = createApi({ configDir: tmp('mcc-rep-set-') });
  const r = await api.call('project.scan', { path: DEMO });
  const ws = await api.call('workspace.load', {});
  await api.call('workspace.save', { workspace: { settings: { ...ws.settings, reports: { mdEmbedImages: false } } } });
  const md = await api.call('report.export', { projectId: r.project.id, kind: 'executive', format: 'md' });
  assert.equal(md.images.length, 4);
});

test('reports are written after an analysis when automatic reports are on', async () => {
  const dir = tmp('mcc-rep-auto-');
  const folder = path.join(dir, 'out');
  const api = createApi({ configDir: dir });
  const ws = await api.call('workspace.load', {});
  await api.call('workspace.save', { workspace: { settings: { ...ws.settings, reports: { mdEmbedImages: false, auto: { enabled: true, kinds: ['executive', 'security'], formats: ['pdf', 'md', 'pptx'], folder } } } } });
  const r = await api.call('project.scan', { path: DEMO });
  assert.equal(r.task.reports.files.length, 6);
  const files = fs.readdirSync(folder);
  assert.equal(files.filter((f) => /\.(pdf|md|pptx)$/.test(f)).length, 6);
  const imageDirs = files.filter((f) => f.endsWith('_images'));
  assert.equal(imageDirs.length, 2);
  assert.equal(fs.readdirSync(path.join(folder, imageDirs[0])).length, 4);
});

test('the export model keeps image blocks; Markdown escapes table cells', () => {
  const png = chart.barChart({ items: [{ label: 'a', value: 1 }] });
  const doc = ex.normalize({ title: 'T', blocks: [{ type: 'image', png: png.png, width: png.width, height: png.height, alt: 'x' }, { type: 'table', columns: ['a|b'], rows: [['1\n2']] }] });
  assert.equal(doc.blocks[0].type, 'image');
  const md = ex.markdownFiles(doc, { embedImages: false, imageDir: 'img' });
  assert.ok(md.text.includes('| a\\|b |'));
  assert.ok(md.text.includes('| 1<br>2 |'));
  assert.equal(md.images[0].path, 'img/x.png');
});
