import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ex = require('../core/export/index.js');
const model = require('../core/export/model.js');
const { zip, crc32 } = require('../core/export/zip.js');
const { sheetName, colName } = require('../core/export/xlsx.js');
const pdf = require('../core/export/pdf.js');
const { TrueTypeFont } = require('../core/export/ttf.js');

// ---------------------------------------------------------------------------
// Independent helpers (do not reuse the code under test)

const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); }
  return t;
})();
function refCrc(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** Tiny ZIP reader: walks the central directory, inflates, checks CRC and sizes. */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  assert.ok(eocd >= 0, 'end of central directory');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOff = buf.readUInt32LE(eocd + 16);
  assert.equal(cdOff + buf.readUInt32LE(eocd + 12), eocd, 'central directory size');
  const out = new Map();
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central header signature');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    assert.ok(flags & 0x0800, `${name}: UTF-8 flag`);
    assert.equal(buf.readUInt32LE(local), 0x04034b50, `${name}: local header`);
    assert.equal(buf.subarray(local + 30, local + 30 + buf.readUInt16LE(local + 26)).toString('utf8'), name, 'local name matches');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : method === 0 ? Buffer.from(raw) : assert.fail(`method ${method}`);
    assert.equal(data.length, usize, `${name}: size`);
    assert.equal(refCrc(data), crc, `${name}: CRC`);
    out.set(name, data);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

/** Well-formedness check: balanced tags, quoted attributes, escaped ampersands, one root. */
function assertWellFormed(xml, label) {
  assert.ok(xml.startsWith('<?xml '), `${label}: declaration`);
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
  assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(body), `${label}: bare &`);
  const stack = [];
  let roots = 0;
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<[^>]*>/g;
  let m;
  while ((m = re.exec(body))) {
    assert.ok(m[2], `${label}: malformed tag ${m[0].slice(0, 60)}`);
    if (m[1]) { assert.equal(stack.pop(), m[2], `${label}: closing ${m[2]}`); continue; }
    if (!stack.length) roots++;
    if (!m[4]) stack.push(m[2]);
  }
  assert.equal(stack.length, 0, `${label}: unclosed ${stack.join(',')}`);
  assert.equal(roots, 1, `${label}: one root element`);
  const text = body.replace(/<[^>]*>/g, '');
  assert.ok(!/[<>]/.test(text), `${label}: stray angle bracket`);
}

function sampleModel(rows = 3) {
  return {
    title: '보안 보고서 — Security report',
    subtitle: 'OWASP Top 10 2021',
    meta: [['프로젝트', '데모'], ['Generated', '2026-10-26']],
    blocks: [
      { type: 'badge', text: '품질 게이트: 실패', color: '#c62828' },
      { type: 'h2', text: '취약점 분류' },
      { type: 'p', text: '한글 문단과 English text & <angle> "quotes" 가 섞여 있습니다.' },
      { type: 'kv', rows: [['버그', '11'], ['취약점', 35]] },
      { type: 'table', columns: ['규칙', 'Name', '개수', 'Ratio'], rows: Array.from({ length: rows }, (_, i) => [`rule:${i}`, `규칙 이름 ${i}`, i, `${i}.5`]) },
      { type: 'list', items: ['첫째 항목', 'second item'] },
      { type: 'pagebreak' },
      { type: 'h3', text: 'Appendix' },
      { type: 'table', columns: ['A', 'B'], rows: [['007', '-3.25'], ['x\ny', '']] },
    ],
  };
}

// ---------------------------------------------------------------------------
// PDF helpers

function pdfObjects(buf) {
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.7\n'), 'PDF header');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'EOF marker');
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s);
  assert.ok(sx, 'startxref');
  const xrefAt = Number(sx[1]);
  assert.equal(s.slice(xrefAt, xrefAt + 4), 'xref', 'startxref points at xref');
  const head = /^xref\s+0 (\d+)\s+/.exec(s.slice(xrefAt));
  const size = Number(head[1]);
  const entries = s.slice(xrefAt + head[0].length).split('\n').slice(0, size);
  assert.match(entries[0], /^0000000000 65535 f ?$/);
  const objs = new Map();
  for (let i = 1; i < size; i++) {
    const e = /^(\d{10}) (\d{5}) n ?$/.exec(entries[i].replace(/\r$/, ''));
    assert.ok(e, `xref entry ${i} format`);
    const off = Number(e[1]);
    assert.equal(s.slice(off, off + `${i} 0 obj`.length), `${i} 0 obj`, `xref offset of object ${i}`);
    const end = s.indexOf('endobj', off);
    objs.set(i, { text: s.slice(off, end), off });
  }
  const trailer = /trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(s);
  assert.ok(trailer && new RegExp(`/Size ${size}\\b`).test(trailer[1]), 'trailer size');
  return { s, objs, size, buf };
}

function streamOf(pdfDoc, id) {
  const o = pdfDoc.objs.get(id);
  const len = Number(/\/Length (\d+)/.exec(o.text)[1]);
  const start = o.text.indexOf('stream\n') + 7;
  const data = pdfDoc.buf.subarray(o.off + start, o.off + start + len);
  return /\/FlateDecode/.test(o.text.slice(0, start)) ? zlib.inflateSync(data) : data;
}

function pageCount(pdfDoc) {
  const pages = [...pdfDoc.objs.values()].filter((o) => /\/Type \/Page\b(?!s)/.test(o.text));
  const tree = [...pdfDoc.objs.values()].find((o) => /\/Type \/Pages\b/.test(o.text));
  assert.equal(Number(/\/Count (\d+)/.exec(tree.text)[1]), pages.length, '/Count matches page objects');
  return pages.length;
}

function ref(text, key) { const m = new RegExp(`/${key} (\\d+) 0 R`).exec(text); return m ? Number(m[1]) : null; }

// ---------------------------------------------------------------------------
// ZIP

test('zip writes stored and deflated entries with CRC-32 and UTF-8 names', () => {
  const big = Buffer.from('가나다 abc '.repeat(500), 'utf8');
  const buf = zip([{ name: 'a.txt', data: 'hello' }, { name: '폴더/한글.xml', data: big }, { name: 'bin/raw.dat', data: Buffer.from([0, 1, 2, 255]), store: true }]);
  const files = unzip(buf);
  assert.deepEqual([...files.keys()], ['a.txt', '폴더/한글.xml', 'bin/raw.dat']);
  assert.equal(files.get('a.txt').toString(), 'hello');
  assert.ok(files.get('폴더/한글.xml').equals(big));
  assert.ok(buf.length < big.length, 'repetitive entry is deflated');
  assert.deepEqual([...files.get('bin/raw.dat')], [0, 1, 2, 255]);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.throws(() => zip([{ name: 'x', data: '' }, { name: 'x', data: '' }]), /duplicate/);
});

// ---------------------------------------------------------------------------
// DOCX

test('docx package has every OOXML part, well-formed XML and Korean text', () => {
  const buf = ex.exportDocument(sampleModel(), 'docx', { date: new Date('2026-10-26T01:02:03Z'), creator: '홍길동' });
  const files = unzip(buf);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/settings.xml', 'word/fontTable.xml', 'word/header1.xml', 'word/footer1.xml', 'docProps/core.xml', 'docProps/app.xml']) {
    assert.ok(files.has(part), `missing ${part}`);
    assertWellFormed(files.get(part).toString('utf8'), part);
  }
  const doc = files.get('word/document.xml').toString('utf8');
  assert.ok(doc.includes('한글 문단과 English text &amp; &lt;angle&gt; &quot;quotes&quot;'), 'escaped mixed text');
  assert.ok(doc.includes('<w:pStyle w:val="Heading2"/>') && doc.includes('<w:pStyle w:val="Heading3"/>'));
  assert.ok(doc.includes('<w:tblHeader/>'), 'header row repeats');
  assert.ok(doc.includes('<w:br w:type="page"/>'), 'page break');
  assert.ok(doc.includes('w:fill="C62828"'), 'badge colour');
  assert.ok(/<w:pgSz w:w="11906" w:h="16838"\/>/.test(doc), 'A4');
  assert.ok(doc.includes('<w:t xml:space="preserve">x</w:t></w:r><w:r><w:br/>'), 'cell line break');
  const styles = files.get('word/styles.xml').toString('utf8');
  assert.ok(styles.includes('w:eastAsia="맑은 고딕"') && styles.includes('w:ascii="Segoe UI"'));
  for (const id of ['Heading1', 'Heading2', 'Heading3', 'ReportTable', 'Title']) assert.ok(styles.includes(`w:styleId="${id}"`), id);
  assert.ok(/<w:tblStylePr w:type="firstRow">.*w:fill="EEF1F5"/.test(styles), 'header shading');
  assert.ok(files.get('word/footer1.xml').toString().includes(' PAGE ') && files.get('word/footer1.xml').toString().includes(' NUMPAGES '));
  assert.ok(files.get('word/footer1.xml').toString().includes('쪽'), 'Korean page label');
  assert.ok(files.get('word/header1.xml').toString().includes('보안 보고서'));
  const core = files.get('docProps/core.xml').toString();
  assert.ok(core.includes('<dc:title>보안 보고서 — Security report</dc:title>') && core.includes('<dc:creator>홍길동</dc:creator>') && core.includes('2026-10-26T01:02:03Z'));
  const ct = files.get('[Content_Types].xml').toString();
  assert.ok(ct.includes('/word/document.xml') && ct.includes('wordprocessingml.document.main+xml'));
});

test('docx strips characters XML cannot carry and uses English labels for English models', () => {
  const buf = ex.exportDocument({ title: 'Report', blocks: [{ type: 'p', text: 'bad\u0001char\u0000 ok' }] }, 'docx');
  const files = unzip(buf);
  const doc = files.get('word/document.xml').toString();
  assert.ok(doc.includes('badchar ok'));
  assertWellFormed(doc, 'document.xml');
  assert.ok(files.get('word/footer1.xml').toString().includes('Page '));
});

// ---------------------------------------------------------------------------
// XLSX

test('xlsx has one sheet per table, shared strings, numbers, frozen header and filter', () => {
  const buf = ex.exportDocument(sampleModel(5), 'xlsx', { date: new Date('2026-10-26T00:00:00Z') });
  const files = unzip(buf);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'docProps/core.xml', 'docProps/app.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
    assert.ok(files.has(part), `missing ${part}`);
    assertWellFormed(files.get(part).toString('utf8'), part);
  }
  assert.ok(!files.has('xl/worksheets/sheet4.xml'));
  const wb = files.get('xl/workbook.xml').toString();
  const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ['요약', '취약점 분류', 'Appendix']);
  assert.ok(wb.includes('_xlnm._FilterDatabase') && wb.includes('_xlnm.Print_Titles'));
  const sst = files.get('xl/sharedStrings.xml').toString();
  assert.ok(sst.includes('<t xml:space="preserve">규칙 이름 3</t>'));
  assert.ok(sst.includes('&lt;angle&gt;'), 'summary paragraph escaped');
  const s2 = files.get('xl/worksheets/sheet2.xml').toString();
  assert.ok(s2.includes('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'));
  assert.ok(s2.includes('<autoFilter ref="A1:D6"/>'));
  assert.ok(/<c r="C4" s="\d+"><v>2<\/v><\/c>/.test(s2), 'integer stored as number');
  assert.ok(/<c r="D4" s="\d+"><v>2.5<\/v><\/c>/.test(s2), 'numeric string stored as number');
  assert.ok(/<c r="A1" s="\d+" t="s">/.test(s2), 'header is a shared string');
  const widths = [...s2.matchAll(/<col min="(\d+)" max="\d+" width="([\d.]+)"/g)].map((m) => Number(m[2]));
  assert.ok(widths[1] > widths[0], 'Korean column (wide chars count 2) is wider than the ASCII one');
  const s3 = files.get('xl/worksheets/sheet3.xml').toString();
  assert.ok(/<c r="A2" s="\d+" t="s">/.test(s3), "'007' keeps its leading zeros as text");
  assert.ok(/<c r="B2" s="\d+"><v>-3.25<\/v>/.test(s3), 'negative decimal is a number');
  const styles = files.get('xl/styles.xml').toString();
  assert.ok(styles.includes('<b/>') && styles.includes('FFEEF1F5') && styles.includes('Malgun Gothic'));
  const s1 = files.get('xl/worksheets/sheet1.xml').toString();
  assert.ok(s1.includes('tabSelected="1"') && !s1.includes('state="frozen"'), 'summary sheet first, not frozen');
});

test('xlsx sheet names are unique, at most 31 characters and free of invalid characters', () => {
  const used = new Set();
  const a = sheetName('Results: [all] / *files*?', used, 'Table 1');
  assert.equal(a, 'Results all files');
  const long = '아주 긴 시트 이름이 서른한 글자를 넘어가면 잘라야 합니다 정말로';
  const b = sheetName(long, used, 'x');
  const c = sheetName(long, used, 'x');
  assert.ok(b.length <= 31 && c.length <= 31);
  assert.notEqual(b, c);
  assert.ok(c.endsWith('(2)'));
  assert.equal(sheetName('', used, 'Table 3'), 'Table 3');
  assert.equal(sheetName("'History'", used, 'Table 4'), 'Table 4');
  assert.equal(sheetName('RESULTS ALL FILES', used, 'z'), 'RESULTS ALL FILES (2)');
  assert.deepEqual([0, 25, 26, 701, 702].map(colName), ['A', 'Z', 'AA', 'ZZ', 'AAA']);

  const m = { title: 'T', blocks: [1, 2, 3].map(() => ({ type: 'table', columns: ['a'], rows: [['1']] })).flatMap((t) => [{ type: 'h2', text: 'Same / name' }, t]) };
  const files = unzip(ex.exportDocument(m, 'xlsx'));
  const names = [...files.get('xl/workbook.xml').toString().matchAll(/<sheet name="([^"]*)"/g)].map((x) => x[1]);
  assert.deepEqual(names, ['Same name', 'Same name (2)', 'Same name (3)']);
});

// ---------------------------------------------------------------------------
// PDF

test('pdf xref offsets are exact and a long table spans pages with repeated headers', () => {
  const rows = Array.from({ length: 300 }, (_, i) => [`row-${i}`, `value ${i}`, i]);
  const doc = { title: 'Long table', blocks: [{ type: 'table', columns: ['Column A', 'Column B', 'N'], rows }] };
  const r = pdf.renderPdf(doc, { searchSystemFonts: false, compress: false });
  const p = pdfObjects(r.buffer);
  const n = pageCount(p);
  assert.equal(n, r.pages);
  // 300 single-line rows of 8 pt text: 16.56 pt each, 731.89 pt of body per page.
  assert.ok(n >= 7 && n <= 8, `page count ${n}`);
  const contents = [...p.objs.values()].filter((o) => /\/Type \/Page\b(?!s)/.test(o.text)).map((o) => streamOf(p, ref(o.text, 'Contents')).toString('latin1'));
  assert.equal(contents.filter((c) => c.includes('(Column A) Tj')).length, n, 'header row on every page');
  assert.ok(contents[n - 1].includes(`(Page ${n} of ${n}) Tj`), 'last page footer');
  assert.ok(contents.join('').includes('(row-299) Tj') && contents[0].includes('(row-0) Tj'));
  let seen = 0;
  for (const c of contents) seen += (c.match(/\(row-\d+\) Tj/g) || []).length;
  assert.equal(seen, 300, 'every row drawn once');
});

test('pdf page breaks and tall rows split across pages', () => {
  const doc = { title: 'Breaks', blocks: [{ type: 'p', text: 'one' }, { type: 'pagebreak' }, { type: 'p', text: 'two' }, { type: 'pagebreak' }, { type: 'pagebreak' }, { type: 'p', text: 'three' }] };
  assert.equal(pageCount(pdfObjects(pdf.renderPdf(doc, { searchSystemFonts: false }).buffer)), 3, 'consecutive breaks do not add blank pages');
  const tall = { title: 'Tall', blocks: [{ type: 'table', columns: ['k', 'v'], rows: [['a', Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n')]] }] };
  const r = pdf.renderPdf(tall, { searchSystemFonts: false, compress: false });
  const p = pdfObjects(r.buffer);
  assert.ok(pageCount(p) >= 2);
  const all = [...p.objs.keys()].filter((id) => /\/Type \/Page\b(?!s)/.test(p.objs.get(id).text)).map((id) => streamOf(p, ref(p.objs.get(id).text, 'Contents')).toString('latin1')).join('\n');
  for (const i of [0, 60, 119]) assert.ok(all.includes(`(line ${i}) Tj`), `line ${i}`);
});

test('pdf embeds a subset CID font with ToUnicode when a Korean font is available', () => {
  const found = pdf.resolveFonts({});
  const r = pdf.renderPdf(sampleModel(40), { compress: false });
  const p = pdfObjects(r.buffer);
  if (!found.regular) {
    // No Korean TrueType font on this machine: the fallback must still produce a valid PDF.
    assert.ok(r.warnings.some((w) => w.code === 'fallback'));
    assert.ok(p.s.includes('/BaseFont /Helvetica'));
    return;
  }
  assert.equal(r.font, found.file);
  assert.deepEqual(r.warnings, []);
  const type0 = [...p.objs.values()].find((o) => /\/Subtype \/Type0/.test(o.text));
  assert.ok(/\/Encoding \/Identity-H/.test(type0.text));
  assert.ok(/\/BaseFont \/[A-Z]{6}\+/.test(type0.text), 'subset tag');
  const cid = p.objs.get(Number(/\/DescendantFonts \[(\d+) 0 R\]/.exec(type0.text)[1])).text;
  assert.ok(/\/Subtype \/CIDFontType2/.test(cid) && /\/CIDToGIDMap \/Identity/.test(cid) && /\/W \[/.test(cid));
  const cmap = streamOf(p, ref(type0.text, 'ToUnicode')).toString('latin1');
  assert.ok(cmap.includes('begincmap') && cmap.includes('beginbfchar'));
  const map = new Map([...cmap.matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)].map((m) => [m[1], String.fromCharCode(...m[2].match(/.{4}/g).map((h) => parseInt(h, 16)))]));
  // Decode every F1 string on page 1 through the ToUnicode map.
  const page1 = [...p.objs.values()].find((o) => /\/Type \/Page\b(?!s)/.test(o.text));
  const content = streamOf(p, ref(page1.text, 'Contents')).toString('latin1');
  assert.equal(ref(page1.text, 'F1'), [...p.objs.entries()].find(([, o]) => o === type0)[0], 'page uses the Type0 font as F1');
  const decoded = [...content.matchAll(/\/F1 [\d.]+ Tf [\d.-]+ [\d.-]+ Td <([0-9A-F]*)> Tj/g)].map((m) => (m[1].match(/.{4}/g) || []).map((h) => map.get(h) || '�').join('')).join('|');
  assert.ok(decoded.includes('한글 문단과'), decoded.slice(0, 200));
  assert.ok(decoded.includes('규칙 이름 3'));
  // The embedded program is a valid TrueType subset holding exactly the glyphs in /W.
  const desc = p.objs.get(ref(cid, 'FontDescriptor')).text;
  const program = streamOf(p, ref(desc, 'FontFile2'));
  const sub = new TrueTypeFont(program);
  const wCount = /\/W \[([\s\S]*?)\] \/CIDToGIDMap/.exec(cid)[1].match(/\[([^\]]*)\]/g).reduce((a, run) => a + run.slice(1, -1).trim().split(/\s+/).length, 0);
  assert.equal(sub.numGlyphs, wCount);
  assert.ok(sub.numGlyphs < 400, `subset is small (${sub.numGlyphs} glyphs)`);
  assert.ok(sub.glyphId('한'.codePointAt(0)) > 0, 'subset cmap maps Hangul');
  assert.ok(program.length < 200000, `subset size ${program.length}`);
  // Bookmarks for headings.
  assert.ok(/\/Outlines \d+ 0 R/.test(p.s));
});

test('pdf falls back to Helvetica with warnings when no font file is available', () => {
  const missing = path.join(os.tmpdir(), `no-such-font-${process.pid}.ttf`);
  const r = pdf.renderPdf(sampleModel(), { fontPath: missing, searchSystemFonts: false, compress: false, lang: 'ko' });
  const p = pdfObjects(r.buffer);
  assert.deepEqual(r.warnings.map((w) => w.code), ['missing', 'fallback', 'replaced']);
  for (const w of r.warnings) assert.ok(w.message.en && w.message.ko && w.message.en !== w.message.ko);
  assert.equal(r.font, null);
  assert.ok(p.s.includes('/BaseFont /Helvetica /Encoding /WinAnsiEncoding') && p.s.includes('/BaseFont /Helvetica-Bold'));
  assert.ok(!p.s.includes('/ToUnicode') && !p.s.includes('/FontFile2'));
  const page1 = [...p.objs.values()].find((o) => /\/Type \/Page\b(?!s)/.test(o.text));
  const content = streamOf(p, ref(page1.text, 'Contents')).toString('latin1');
  assert.ok(content.includes('(?? ??? \\227 Security report) Tj'), 'Hangul replaced, em dash kept in WinAnsi');
  assert.ok(content.includes('(English text & <angle> "quotes"') || content.includes('English text & <angle>'));
  assert.equal(pageCount(p), r.pages);
  // An explicit font path that exists but is not a usable TrueType font is reported too.
  const cff = path.join(os.tmpdir(), `cff-font-${process.pid}.otf`);
  const fake = Buffer.alloc(12);
  fake.write('OTTO', 0, 'latin1');
  fs.writeFileSync(cff, fake);
  try {
    const r2 = pdf.renderPdf({ title: 'x', blocks: [] }, { fontPath: cff, searchSystemFonts: false });
    assert.deepEqual(r2.warnings.map((w) => w.code), ['cff', 'fallback']);
    pdfObjects(r2.buffer);
  } finally { fs.rmSync(cff, { force: true }); }
});

test('pdf wrapping keeps Korean words together and breaks over-long tokens', () => {
  const font = { width: (s, size) => [...s].length * size * 0.5 };
  const lines = pdf.wrap('가나다 라마바사 아자차카타파하 English words here', font, 10, 35);
  assert.deepEqual(lines.slice(0, 3), ['가나다', '라마바사', '아자차카타파하']);
  for (const l of lines) assert.ok(font.width(l, 10) <= 35, l);
  const long = pdf.wrap('x'.repeat(25), font, 10, 35);
  assert.deepEqual(long, ['xxxxxxx', 'xxxxxxx', 'xxxxxxx', 'xxxx']);
  assert.deepEqual(pdf.wrap('a\nb', font, 10, 40), ['a', 'b']);
  assert.deepEqual(pdf.tokenize('漢字 a-b'), ['漢', '字', ' ', 'a-', 'b']);
});

// ---------------------------------------------------------------------------
// Model and HTML conversion

test('model helpers decode entities, measure width and normalize blocks', () => {
  assert.equal(model.decodeEntities('&lt;a&gt; &amp;amp; &#xAC00;&#44032; &middot; &nbsp;&bogus;'), '<a> &amp; 가가 ·  &bogus;');
  assert.equal(model.displayWidth('ab한글'), 6);
  const n = model.normalize({ title: 5, blocks: [{ type: 'nope' }, { type: 'table', columns: ['a'], rows: [[1, null]] }, { type: 'badge', text: 'x', color: 'var(--bad)' }] });
  assert.equal(n.title, '5');
  assert.deepEqual(n.blocks, [{ type: 'table', columns: ['a'], rows: [[1, '']] }, { type: 'badge', text: 'x', color: '#c62828' }]);
  assert.deepEqual(model.columnAlign({ columns: ['a', 'b'], rows: [['x', '1'], ['y', '—']] }), ['left', 'right']);
  assert.equal(model.detectLang({ title: '보고서' }), 'ko');
  assert.equal(model.detectLang({ title: 'Report' }), 'en');
});

test('fromHtml is tolerant of unclosed cells, comments, scripts and SVG', () => {
  const m = model.fromHtml('<html><head><title>T &amp; U</title><script>if (a < b) {}</script></head><body><!-- c --><h2>Head<br>two</h2><table><tr><th>A<th>B<tr><td>1<td>2</table><ul><li>x<li>y</ul><svg><text>gone</text></svg><div>loose <b>text</b></div><p>last');
  assert.equal(m.title, 'T & U');
  assert.deepEqual(m.blocks, [
    { type: 'h2', text: 'Head\ntwo' },
    { type: 'table', columns: ['A', 'B'], rows: [['1', '2']] },
    { type: 'list', items: ['x', 'y'] },
    { type: 'p', text: 'loose text' },
    { type: 'p', text: 'last' },
  ]);
});

let realAnalysis = null;
function analysis() {
  if (!realAnalysis) realAnalysis = require('../core/analyze.js').analyzePath(path.join(root, 'samples/demo'), {});
  return realAnalysis;
}

test('fromHtml recovers headings, cards, verdicts and tables from real reports', () => {
  const reports = require('../core/platform/reports.js');
  const { listRules } = require('../core/analyze.js');
  const a = analysis();
  const catalog = listRules();
  const exec = reports.build('executive', a, { lang: 'ko', catalog, project: '데모 & <x>' });
  const m = model.fromHtml(exec.html);
  assert.equal(m.title, '요약 보고서');
  assert.equal(m.lang, 'ko');
  assert.deepEqual(m.meta[0], ['프로젝트', '데모 & <x>']);
  const h2 = m.blocks.filter((b) => b.type === 'h2').map((b) => b.text);
  for (const h of ['전체 코드', '새 코드', '가장 많이 위반한 규칙', '심각도']) assert.ok(h2.includes(h), h);
  const badge = m.blocks.find((b) => b.type === 'badge');
  assert.ok(badge.text.startsWith('품질 게이트') && /^#[0-9a-f]{6}$/.test(badge.color));
  const kv = m.blocks.find((b) => b.type === 'kv');
  assert.ok(kv.rows.some(([k]) => k === '신뢰성'));
  const tables = m.blocks.filter((b) => b.type === 'table');
  const htmlTables = (exec.html.match(/<table>/g) || []).length;
  assert.equal(tables.length, htmlTables);
  const sev = tables.find((t) => t.columns.includes('BLOCKER'));
  assert.deepEqual(sev.columns, ['종류', 'BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO']);
  assert.deepEqual(sev.rows.map((r) => r[0]), ['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT']);
  assert.ok(sev.rows.every((r) => r.slice(1).every((c) => /^\d+$/.test(c))));
  const top = tables.find((t) => t.columns[0] === '규칙');
  assert.ok(top.rows.length > 0 && top.align[2] === 'right');

  const sp = reports.build('sparrow', a, { lang: 'en', catalog, ruleSet: 'security' });
  const ms = model.fromHtml(sp.html);
  assert.equal(ms.title, 'Rule-set compliance report');
  const big = ms.blocks.find((b) => b.type === 'table');
  assert.deepEqual(big.columns, ['Rule', 'Name', 'Category', 'Severity', 'Violations', 'Status']);
  assert.equal(big.rows.length, (sp.html.match(/<tr>/g) || []).length - 1);
  assert.ok(big.rows.every((r) => r.length === 6));
});

test('real reports export to every format with matching file names', () => {
  const { listRules } = require('../core/analyze.js');
  const a = analysis();
  const opts = { lang: 'ko', catalog: listRules(), standard: 'owasp2021', project: '데모' };
  for (const kind of ['executive', 'security', 'integrity']) {
    for (const fmt of ex.FORMATS) {
      const r = ex.exportReport(kind, a, fmt, opts);
      assert.ok(r.buffer.length > 200, `${kind} ${fmt}`);
      assert.ok(r.fileName.endsWith(`.${fmt}`) && r.fileName.startsWith(kind === 'security' ? 'security-owasp2021' : kind));
      if (fmt === 'pdf') { const p = pdfObjects(r.buffer); assert.ok(pageCount(p) >= 1); }
      if (fmt === 'docx') assert.ok(unzip(r.buffer).get('word/document.xml').toString().includes('<w:pStyle w:val="Title"/>'));
      if (fmt === 'xlsx') assert.ok(unzip(r.buffer).get('xl/sharedStrings.xml').toString().length > 100);
      if (fmt === 'csv') assert.ok(r.buffer.toString('utf8').startsWith('﻿"'));
      if (fmt === 'html') assert.ok(r.buffer.toString('utf8').startsWith('<!doctype html>'));
    }
  }
  const html = require('../core/platform/reports.js').build('integrity', a, opts).html;
  assert.equal(ex.exportReportHtml(html, 'html').toString(), html, 'html passes through');
  assert.equal(ex.exportReportHtml(html, 'csv', { csv: 'a,b' }).toString(), 'a,b');
  assert.ok(ex.exportReportHtml(html, '.XLSX').length > 0, 'format names are case-insensitive');
  assert.throws(() => ex.exportDocument({}, 'odt'), /Unknown export format/);
});

test('model html and csv writers escape content', () => {
  const html = ex.exportDocument(sampleModel(), 'html').toString();
  assert.ok(html.startsWith('<!doctype html><html lang="ko">'));
  assert.ok(html.includes('&lt;angle&gt;') && html.includes('<th class="n">개수</th>') && html.includes('class="pagebreak"'));
  const csv = ex.exportDocument(sampleModel(2), 'csv').toString();
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"규칙","Name","개수","Ratio"\r\n"rule:0","규칙 이름 0","0","0.5"'));
  assert.ok(csv.includes('"x\ny",""'));
  assert.ok(ex.exportDocument({ blocks: [{ type: 'table', columns: ['f'], rows: [['=1+2']] }] }, 'csv').toString().includes(`"'=1+2"`), 'formula injection guarded');
});
