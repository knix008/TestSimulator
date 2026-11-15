// The report model and its Markdown / HTML / Word writers (the PDF and the pages need a canvas: web E2E).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, pickSections, REPORT_SECTIONS } from '../../src/report/content.js';
import { crc32, dataUrlBytes, toDocx, toHtml, toMarkdown } from '../../src/report/writers.js';
import { buildSample } from '../../src/sim/samples.js';
import { runModel } from '../../src/sim/engine.js';
import { diagnose } from '../../src/sim/diagnose.js';

// A 1 × 1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function sampleReport() {
  const model = buildSample('line');
  const { results } = runModel(model, { seed: 1 });
  return buildReport({
    model, results, issues: diagnose(model, results), experiment: null,
    images: { layout2d: { src: PNG, w: 1, h: 1 }, view3d: { src: PNG, w: 1, h: 1 } }, charts: [{ title: 'WIP', src: PNG, w: 2, h: 1 }],
    t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k), fmt: (v, d = 2) => Number(v).toFixed(d), docName: 'line.mpf', date: '2026-11-15',
  });
}

/** Reads a store-only ZIP: { name: bytes }. */
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let o = 0;
  while (dv.getUint32(o, true) === 0x04034b50) {
    const size = dv.getUint32(o + 18, true); const nlen = dv.getUint16(o + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(o + 30, o + 30 + nlen));
    const data = bytes.subarray(o + 30 + nlen, o + 30 + nlen + size);
    assert.equal(crc32(data), dv.getUint32(o + 14, true), `${name} CRC`);
    out[name] = data; o += 30 + nlen + size;
  }
  assert.equal(dv.getUint32(o, true), 0x02014b50, 'central directory follows');
  return out;
}

test('report model: sections, KPIs, diagnosis, tables, pictures', () => {
  const doc = sampleReport();
  const sections = new Set(doc.blocks.map((b) => b.section));
  for (const s of ['overview', 'layout2d', 'view3d', 'kpis', 'diagnosis', 'tables', 'charts']) assert.ok(sections.has(s), s);
  assert.ok(doc.blocks.some((b) => b.t === 'table' && b.rows.some((r) => r[0] === 'CNC')));
  assert.equal(doc.blocks.filter((b) => b.t === 'image').length, 3);
  assert.ok([...sections].every((s) => REPORT_SECTIONS.includes(s)));
  const only = pickSections(doc, ['kpis']);
  assert.ok(only.blocks.length > 0 && only.blocks.every((b) => b.section === 'kpis'));
});

test('Markdown and HTML have the tables and the pictures', () => {
  const doc = sampleReport();
  const md = toMarkdown(doc);
  assert.match(md, /^# Machining line/m);
  assert.match(md, /\| CNC \|/);
  assert.equal((md.match(/!\[[^\]]*\]\(data:image\/png;base64,/g) ?? []).length, 3);
  const html = toHtml(doc, 'ko');
  assert.match(html, /^<!doctype html>/);
  assert.equal((html.match(/<img src="data:image\/png;base64,/g) ?? []).length, 3);
  assert.match(html, /<td>CNC<\/td>/);
});

test('Word: a valid package with the pictures in word/media', () => {
  const bytes = toDocx(sampleReport());
  const files = unzip(bytes);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']) assert.ok(files[name], name);
  const media = Object.keys(files).filter((n) => n.startsWith('word/media/'));
  assert.equal(media.length, 3);
  assert.deepEqual([...files[media[0]]], [...dataUrlBytes(PNG).bytes]);
  const xml = new TextDecoder().decode(files['word/document.xml']);
  assert.match(xml, /<w:tbl>/);
  assert.equal((xml.match(/<a:blip r:embed="rIdImg\d+"/g) ?? []).length, 3);
  assert.match(new TextDecoder().decode(files['word/_rels/document.xml.rels']), /media\/image3\.png/);
});
