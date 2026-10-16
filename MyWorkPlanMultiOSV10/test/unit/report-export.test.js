// Report export: HTML, Markdown, Word (.docx — our own ZIP writer) and PDF
// (JPEG pages). The files are parsed back here: ZIP headers and CRCs, the XML
// parts well-formed, PDF cross-reference offsets pointing at their objects.
import assert from 'node:assert/strict';
import test from 'node:test';
import { getLanguage, setLanguage } from '../../src/i18n.js';
import { TASK_FIELD_MAP } from '../../src/domain/fields.js';
import { schedule } from '../../src/domain/schedule.js';
import { buildSample } from '../../src/domain/templates.js';
import { toMin } from '../../src/domain/time.js';
import { REPORTS, reportModel } from '../../src/views/reports.js';
import { blockTable, chartSvg, crc32, reportFileName, reportToDocx, reportToHtml, reportToMarkdown, zip } from '../../src/export/report-export.js';
import { pdfFromJpegs } from '../../src/export/report-pdf.js';
import { t } from '../../src/i18n.js';

const MODEL = {
  id: 'cost', title: '비용 개요', project: '신제품 출시 <A&B>', date: '2026-10-16', language: 'ko',
  labels: { item: '항목', value: '값', date: '날짜', generated: 'MyWorkPlan에서 만든 보고서' },
  blocks: [
    { type: 'kpis', items: [{ label: '비용', value: '₩1,200,000' }, { label: '늦은 작업', value: '2', tone: 'bad' }] },
    { type: 'donut', title: '완료율', percent: 42, label: '완료율' },
    { type: 'line', title: '누적 비용', series: [{ key: 'planned', tone: 'planned', label: '기준 계획' }, { key: 'actual', tone: 'actual', label: '실제' }],
      points: [{ label: '10-01', values: { planned: 0, actual: 0 }, texts: { planned: '₩0', actual: '₩0' } }, { label: '10-15', values: { planned: 500, actual: null }, texts: { planned: '₩500', actual: '' } }] },
    { type: 'bars', title: '자원별 비용', legend: [{ tone: 'scheduled', label: '비용' }, { tone: 'planned', label: '기준 계획' }],
      items: [{ label: '설계 | 단계', value: 300, second: 250, text: '₩300', secondText: '₩250' }, { label: '개발', value: 900, second: null, text: '₩900', secondText: '' }] },
    { type: 'note', text: '여유 시간이 없는 작업입니다.' },
    { type: 'table', title: '작업', columns: [{ label: 'ID', align: 'right' }, { label: '이름' }], rows: [['1', '요구 사항 분석'], ['2', 'Design & build']], empty: '없음' },
    { type: 'table', title: '빈 표', columns: [{ label: 'ID' }], rows: [], empty: '해당하는 항목이 없습니다.' },
  ],
};

// ───────────────────────── helpers: XML, ZIP, PDF readers

/** Throws unless the text is well-formed XML (tags nest and close, attributes quoted, entities known). */
function assertWellFormedXml(xml, name) {
  const stack = [];
  const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g;
  let match;
  let roots = 0;
  while ((match = re.exec(xml))) {
    if (match[6]) assert.fail(`${name}: stray "<" at ${match.index}: ${xml.slice(match.index, match.index + 40)}`);
    if (match[5] !== undefined) {
      assert.doesNotMatch(match[5], /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/, `${name}: bad entity`);
      if (!stack.length) assert.equal(match[5].trim(), '', `${name}: text outside the root`);
      continue;
    }
    if (!match[2]) continue;
    const [, close, tag, , self] = match;
    if (close) assert.equal(stack.pop(), tag, `${name}: </${tag}> closes the open element`);
    else if (!self) { if (!stack.length) roots += 1; stack.push(tag); } else if (!stack.length) roots += 1;
  }
  assert.deepEqual(stack, [], `${name}: every element closed`);
  assert.equal(roots, 1, `${name}: one root element`);
}

/** Entries of a ZIP, checked against both the local headers and the central directory. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50, 'end of central directory');
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  assert.equal(cdOffset + cdSize, eocd, 'central directory ends where the end record starts');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries = new Map();
  let at = cdOffset;
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50, 'central header signature');
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extra + comment;
    assert.equal(view.getUint32(local, true), 0x04034b50, `${name}: local header signature`);
    assert.equal(method, 0, `${name}: stored`);
    assert.equal(view.getUint32(local + 14, true), crc, `${name}: local CRC = central CRC`);
    assert.equal(view.getUint32(local + 18, true), size, `${name}: local size`);
    const localName = view.getUint16(local + 26, true);
    const localExtra = view.getUint16(local + 28, true);
    assert.equal(decoder.decode(bytes.subarray(local + 30, local + 30 + localName)), name, 'same name in both headers');
    const data = bytes.subarray(local + 30 + localName + localExtra, local + 30 + localName + localExtra + size);
    assert.equal(crc32(data), crc, `${name}: CRC-32 of the data`);
    entries.set(name, data);
  }
  return entries;
}

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

// ───────────────────────── tests

test('CRC-32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test('the ZIP writer round-trips names and bytes (UTF-8 names)', () => {
  const bin = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 0xff);
  const entries = readZip(zip([{ name: 'a.txt', data: '안녕' }, { name: '폴더/b.bin', data: bin }]));
  assert.deepEqual([...entries.keys()], ['a.txt', '폴더/b.bin']);
  assert.equal(new TextDecoder().decode(entries.get('a.txt')), '안녕');
  assert.deepEqual([...entries.get('폴더/b.bin')], [...bin]);
});

test('HTML: a standalone UTF-8 page with title, project, date, KPIs, SVG charts and escaped tables', () => {
  const html = reportToHtml(MODEL);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<title>비용 개요 — 신제품 출시 &lt;A&amp;B&gt;<\/title>/);
  assert.match(html, /<h1>비용 개요<\/h1>/);
  assert.ok(html.includes('2026-10-16'));
  assert.ok(html.includes('<div class="kpi bad"><small>늦은 작업</small><b>2</b></div>'));
  assert.equal((html.match(/<svg /g) ?? []).length, 3, 'donut, line and bar charts');
  assert.ok(html.includes('<td>Design &amp; build</td>'));
  assert.ok(html.includes('해당하는 항목이 없습니다.'));
  assert.doesNotMatch(html, /<link |<script/, 'no external resources');
  assert.ok(html.includes('<style>'));
});

test('Markdown: headings, GitHub tables with alignment, chart numbers as tables, escaped pipes', () => {
  const md = reportToMarkdown(MODEL);
  assert.ok(md.startsWith('# 비용 개요\n'));
  assert.ok(md.includes('**신제품 출시 \\<A&B\\>** · 2026-10-16'));
  assert.ok(md.includes('| 항목 | 값 |\n| --- | ---: |\n| 비용 | ₩1,200,000 |'));
  assert.ok(md.includes('## 누적 비용\n\n| 날짜 | 기준 계획 | 실제 |'));
  assert.ok(md.includes('| 10-15 | ₩500 |  |'));
  assert.ok(md.includes('| 설계 \\| 단계 | ₩300 | ₩250 |'), 'pipes inside cells are escaped');
  assert.ok(md.includes('**완료율**: 42%'));
  assert.ok(md.includes('> 여유 시간이 없는 작업입니다.'));
  assert.ok(md.includes('_해당하는 항목이 없습니다._'));
  // Every table row has the same number of cells as its header.
  const tables = md.split('\n\n').filter((part) => part.startsWith('| '));
  assert.ok(tables.length >= 4);
  for (const table of tables) {
    const cells = table.split('\n').map((line) => line.replace(/\\\|/g, '').split('|').length);
    assert.equal(new Set(cells).size, 1, table);
  }
});

test('Word: a valid .docx package (ZIP, content types, relationships, well-formed XML, Korean text)', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const bytes = reportToDocx(MODEL, { images: { 2: { png, width: 680, height: 280 } }, now: new Date('2026-10-16T09:00:00Z') });
  assert.equal(latin1(bytes.subarray(0, 2)), 'PK');
  const entries = readZip(bytes);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml', 'word/media/chart1.png']) assert.ok(entries.has(name), name);
  assert.equal([...entries.keys()][0], '[Content_Types].xml', 'content types first');
  const text = (name) => new TextDecoder('utf-8', { fatal: true }).decode(entries.get(name));
  for (const name of entries.keys()) if (name.endsWith('.xml') || name.endsWith('.rels')) assertWellFormedXml(text(name), name);
  const document = text('word/document.xml');
  assert.ok(document.includes('<w:t xml:space="preserve">비용 개요</w:t>'), 'the Korean title');
  assert.ok(document.includes('신제품 출시 &lt;A&amp;B&gt;'));
  assert.ok(document.includes('<w:pStyle w:val="Heading1"/>'));
  assert.ok(document.includes('<w:tbl>') && document.includes('<w:tblBorders>'), 'tables with borders');
  assert.ok(document.includes('<w:tblHeader/>'), 'header rows repeat on each page');
  assert.ok(document.includes('r:embed="rIdImg1"'), 'the chart picture');
  assert.ok(document.includes('<w:pgSz w:w="11906" w:h="16838"/>'), 'A4');
  assert.ok(text('word/styles.xml').includes('w:eastAsia="Malgun Gothic"'));
  assert.ok(text('word/_rels/document.xml.rels').includes('Target="media/chart1.png"'));
  assert.ok(text('[Content_Types].xml').includes('<Default Extension="png" ContentType="image/png"/>'));
  assert.deepEqual([...entries.get('word/media/chart1.png')], [...png]);
  assert.ok(text('docProps/core.xml').includes('<dcterms:created xsi:type="dcterms:W3CDTF">2026-10-16T09:00:00Z</dcterms:created>'));
  // Without pictures, charts are tables of their numbers.
  const plain = readZip(reportToDocx(MODEL));
  assert.ok(!plain.has('word/media/chart1.png'));
  assert.ok(new TextDecoder().decode(plain.get('word/document.xml')).includes('기준 계획'));
});

test('PDF: header, one page per JPEG, xref offsets point at their objects, stream lengths, %%EOF', () => {
  const jpeg = (n) => Uint8Array.from({ length: n }, (_, i) => (i === 0 ? 0xff : i === 1 ? 0xd8 : (i * 31) & 0xff));
  const pages = [{ jpeg: jpeg(500), width: 1190, height: 1684 }, { jpeg: jpeg(321), width: 1190, height: 1684 }, { jpeg: jpeg(77), width: 1190, height: 1684 }];
  const bytes = pdfFromJpegs(pages, { title: '비용 개요 — 계획' });
  const text = latin1(bytes);
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.endsWith('%%EOF\n'));
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)[1]);
  assert.ok(text.slice(startxref).startsWith('xref\n'), 'startxref points at the xref table');
  const [, first, size] = /^xref\n(\d+) (\d+)\n/.exec(text.slice(startxref)).map(Number);
  assert.equal(first, 0);
  const rows = text.slice(startxref).split('\n').slice(2, 2 + size);
  assert.equal(rows[0], '0000000000 65535 f ');
  for (let n = 1; n < size; n++) {
    assert.match(rows[n], /^\d{10} 00000 n $/);
    const offset = Number(rows[n].slice(0, 10));
    assert.ok(text.startsWith(`${n} 0 obj\n`, offset), `object ${n} at ${offset}`);
  }
  assert.ok(new RegExp(`/Size ${size} /Root 1 0 R`).test(text));
  assert.equal((text.match(/\/Type \/Page\b(?!s)/g) ?? []).length, 3, 'three pages');
  assert.ok(text.includes('/Count 3'));
  assert.equal((text.match(/\/Filter \/DCTDecode/g) ?? []).length, 3);
  // Every stream is exactly /Length bytes long.
  for (const match of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const start = match.index + match[0].length;
    assert.equal(text.slice(start + Number(match[1]), start + Number(match[1]) + 10), '\nendstream', `stream at ${start}`);
  }
  assert.ok(text.includes(latin1(pages[1].jpeg)), 'the JPEG bytes are embedded unchanged');
  assert.ok(text.includes('/Title <FEFFBE44C6A9'), 'title as UTF-16BE (비용)');
  assert.ok(text.includes('/MediaBox [0 0 595.28 841.89]'), 'A4');
});

test('every report has an export model, and every format renders it', () => {
  const before = getLanguage();
  setLanguage('ko');
  try {
    const project = buildSample('ko', { today: '2026-10-16' });
    const sched = schedule(project);
    const app = {
      project: () => project, sched: () => sched, settings: () => ({ dateFormat: 'iso' }), taskFieldMap: () => TASK_FIELD_MAP,
      fieldCtx: () => ({ project, sched, language: 'ko', dateFormat: 'iso', showTime: false, t, toMin }),
    };
    for (const [id] of REPORTS) {
      const model = reportModel(app, id);
      assert.equal(model.title, t(`report.${id}`));
      assert.equal(model.project, project.title);
      assert.ok(model.blocks.length, id);
      for (const block of model.blocks) {
        if (['bars', 'line', 'donut'].includes(block.type)) {
          const chart = chartSvg(block);
          assert.ok(chart.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && chart.width > 0 && chart.height > 0, `${id} ${block.type}`);
          assertWellFormedXml(chart.svg, `${id} ${block.type} svg`);
          assert.doesNotMatch(chart.svg, /NaN|undefined/, `${id} ${block.type} numbers`);
        }
        const table = blockTable(block, model.labels);
        if (table) for (const row of table.rows) assert.equal(row.length, table.columns.length, `${id}: row width`);
      }
      assert.ok(reportToHtml(model).includes(`<h1>${model.title}</h1>`), id);
      assert.ok(reportToMarkdown(model).startsWith(`# ${model.title}`), id);
      const entries = readZip(reportToDocx(model));
      assertWellFormedXml(new TextDecoder().decode(entries.get('word/document.xml')), `${id} document.xml`);
      assert.match(reportFileName(model, 'pdf'), /\.pdf$/);
      assert.doesNotMatch(reportFileName(model, 'pdf'), /[\\/:*?"<>|]/);
    }
    const tasks = reportModel(app, 'critical').blocks.find((b) => b.type === 'table');
    assert.ok(tasks.rows.length > 0, 'the sample has critical tasks');
    assert.equal(tasks.columns[1].label, t('field.name'));
  } finally {
    setLanguage(before);
  }
});
