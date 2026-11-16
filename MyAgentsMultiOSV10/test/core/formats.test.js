// File formats: every reader and writer round-trips (text, Markdown, HTML, CSV, JSON, PDF, Word, Excel, pictures).
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parse, render, convert, formatOf, sniff, markdownToHtml, htmlToMarkdown, htmlText, readPdf, writePdf, readDocx, writeDocx, readXlsx, writeXlsx, unzip, zip, crc32, imageInfo, imageBytes, markdownTable, parseCsv, toCsv } from '../../core/formats.js';

const MD = '# 주간 보고\n\n- 매출 **12%** 증가\n- New customers: 31\n\n| 지역 | 금액 |\n|---|---|\n| 서울 | 100 |\n| 부산 | 70 |\n\n본문 문단입니다. Plain English line.';
const ROWS = [{ 지역: '서울', 금액: 100, note: 'a, "quoted"' }, { 지역: '부산', 금액: 70.5, note: '' }];

import { PNG } from '../helpers/png.mjs';

test('format names: by file name, MIME type and the bytes themselves', () => {
  assert.deepEqual(['a.PDF', 'b.docx', 'c.xlsx', 'd.md', 'e.htm', 'f.tsv', 'g.json', 'h.jpeg', 'i.log', 'j.bin'].map((n) => formatOf(n)), ['pdf', 'docx', 'xlsx', 'markdown', 'html', 'csv', 'json', 'image', 'text', 'auto']);
  assert.equal(formatOf('', 'application/pdf'), 'pdf');
  assert.equal(sniff(PNG), 'image');
  assert.equal(sniff(writePdf('x')), 'pdf');
  assert.equal(sniff(writeDocx('x')), 'docx');
  assert.equal(sniff(writeXlsx([{ a: 1 }])), 'xlsx');
  assert.equal(sniff(Buffer.from('{"a":1}')), 'json');
  assert.equal(sniff(Buffer.from('<!doctype html><p>x</p>')), 'html');
  assert.equal(sniff(Buffer.from('# Title\n\ntext')), 'markdown');
});

test('ZIP: written entries read back (deflated, UTF-8 names)', () => {
  const z = zip([{ name: 'a.txt', data: 'hello' }, { name: '폴더/b.xml', data: '<x>한글</x>' }]);
  const files = unzip(z);
  assert.deepEqual([...files.keys()], ['a.txt', '폴더/b.xml']);
  assert.equal(files.get('폴더/b.xml')().toString('utf8'), '<x>한글</x>');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('Markdown → HTML: headings, lists, tables, code, links; HTML → Markdown and text', () => {
  const html = markdownToHtml(`${MD}\n\n\`\`\`js\nconst a = 1 < 2;\n\`\`\`\n\n[link](https://x.y) and *em*\n\n> quote`);
  for (const part of ['<h1>주간 보고</h1>', '<li>매출 <strong>12%</strong> 증가</li>', '<th>지역</th>', '<td>서울</td>', '<code class="language-js">const a = 1 &lt; 2;</code>', '<a href="https://x.y">link</a>', '<em>em</em>', '<blockquote>quote</blockquote>']) assert.ok(html.includes(part), part);
  assert.equal(htmlToMarkdown('<h2>T</h2><p>a <b>b</b></p><ul><li>x</li></ul><table><tr><th>h</th></tr><tr><td>v</td></tr></table>'), '## T\n\na **b**\n\n- x\n\n| h |\n| --- |\n| v |');
  assert.equal(htmlText('<style>x{}</style><h1>A</h1><p>b<br>c</p><table><tr><th>k</th><th>v</th></tr></table>'), 'A\nb\nc\nk\tv');
});

test('CSV: quotes, delimiters and numbers both ways', () => {
  const text = toCsv(ROWS);
  assert.equal(text.split('\n')[1], '서울,100,"a, ""quoted"""');
  assert.deepEqual(parseCsv(text), ROWS);
  assert.deepEqual(parseCsv('a\tb\n1\tx', 'tab'), [{ a: 1, b: 'x' }]);
  assert.equal(markdownTable(ROWS).split('\n')[2], '| 서울 | 100 | a, "quoted" |');
});

test('PDF: written with Korean, read back as text (lines, pages)', () => {
  const pdf = writePdf(MD, { title: '보고' });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const back = readPdf(pdf);
  assert.equal(back.pages, 1);
  assert.match(back.text, /^주간 보고\n• 매출 12% 증가\n• New customers: 31/);
  assert.match(back.text, /서울 +100/);
  const long = writePdf(Array.from({ length: 120 }, (_, i) => `줄 ${i + 1}`).join('\n'));
  assert.ok(readPdf(long).pages >= 3, 'long text flows over pages');
  // a PDF made elsewhere: a FlateDecode stream with literal strings
  const content = zlib.deflateSync(Buffer.from('BT /F1 12 Tf 72 700 Td (Hello \\(PDF\\)) Tj 0 -14 Td (Second line) Tj ET'));
  const other = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Length ' + content.length + ' /Filter /FlateDecode >>\nstream\n', 'latin1'), content, Buffer.from('\nendstream endobj\n%%EOF', 'latin1')]);
  assert.equal(readPdf(other).text, 'Hello (PDF)\nSecond line');
});

test('Word: headings, lists and bold written; text and Markdown read back', () => {
  const back = readDocx(writeDocx(MD, { title: 'T' }));
  assert.match(back.text, /^주간 보고\n• 매출 12% 증가/);
  assert.ok(back.paragraphs >= 6);
  // a Word file with real heading styles and numbering
  const doc = '<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>item &amp; more</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">a</w:t><w:tab/><w:t>b</w:t></w:r></w:p></w:body></w:document>';
  const r = readDocx(zip([{ name: 'word/document.xml', data: doc }]));
  assert.equal(r.markdown, '# Title\n\n- item & more\n\na\tb');
});

test('Excel: rows written (numbers, text, booleans) and read back; shared strings', () => {
  const back = readXlsx(writeXlsx([...ROWS, { 지역: '대구', 금액: 3, ok: true }]));
  assert.deepEqual(back.columns, ['지역', '금액', 'note', 'ok']);
  assert.deepEqual(back.items[1], { 지역: '부산', 금액: 70.5, note: '', ok: '' });
  assert.equal(back.items[2].ok, true);
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>7</v></c><c r="C2" t="s"><v>0</v></c></row></sheetData></worksheet>';
  const book = '<workbook><sheets><sheet name="데이터" sheetId="1"/></sheets></workbook>';
  const strings = '<sst><si><t>이름</t></si><si><r><t>값</t></r></si></sst>';
  const r = readXlsx(zip([{ name: 'xl/workbook.xml', data: book }, { name: 'xl/sharedStrings.xml', data: strings }, { name: 'xl/worksheets/sheet1.xml', data: sheet }]));
  assert.deepEqual(r.items, [{ 이름: 7, col2: '', 값: '이름' }]);
  assert.equal(r.sheets[0].name, '데이터');
});

test('pictures: sizes of PNG, JPEG, GIF, BMP, SVG; data URLs; text as an SVG card', () => {
  assert.deepEqual(imageInfo(PNG), { mime: 'image/png', width: 2, height: 3 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(imageInfo(jpeg), { mime: 'image/jpeg', width: 64, height: 48 });
  const gif = Buffer.from('GIF89a\x05\x00\x07\x00', 'latin1');
  assert.deepEqual(imageInfo(gif), { mime: 'image/gif', width: 5, height: 7 });
  const bmp = Buffer.alloc(30); bmp.write('BM'); bmp.writeInt32LE(9, 18); bmp.writeInt32LE(-4, 22);
  assert.deepEqual(imageInfo(bmp), { mime: 'image/bmp', width: 9, height: 4 });
  assert.deepEqual(imageInfo(Buffer.from('<svg viewBox="0 0 120 80"></svg>')), { mime: 'image/svg+xml', width: 120, height: 80 });
  const url = `data:image/png;base64,${PNG.toString('base64')}`;
  assert.equal(imageBytes(url).bytes.length, PNG.length);
  assert.equal(imageBytes({ dataUrl: url }).mime, 'image/png');
  assert.equal(imageBytes(PNG.toString('base64')).mime, 'image/png');
  assert.equal(imageBytes('just words'), null);
  const card = render({ text: '첫 줄\n둘째 줄' }, 'image', { title: '제목' });
  assert.equal(card.mime, 'image/svg+xml');
  assert.match(card.bytes.toString(), /제목[\s\S]*첫 줄[\s\S]*둘째 줄/);
});

test('parse and render: every format, from rows and from Markdown', () => {
  for (const f of ['text', 'markdown', 'html', 'pdf', 'docx']) {
    const out = render({ markdown: MD }, f, { title: 'T' });
    const back = parse(out.bytes, 'auto', { name: `x.${out.ext}` });
    assert.equal(back.format, f, f);
    assert.match(back.text, /주간 보고/, f);
    assert.match(back.text, /New customers: 31/, f);
  }
  for (const f of ['csv', 'xlsx', 'json']) {
    const out = render(ROWS, f);
    const back = parse(out.bytes, 'auto', { name: `x.${out.ext}` });
    assert.deepEqual(back.items ?? back.data, ROWS, f);
  }
  const pic = parse(PNG, 'auto', { name: 'p.png' });
  assert.deepEqual([pic.format, pic.width, pic.height], ['image', 2, 3]);
  assert.ok(pic.dataUrl.startsWith('data:image/png;base64,'));
  assert.deepEqual(render(pic, 'image').bytes, PNG, 'a picture saves as itself');
  assert.throws(() => parse(Buffer.from('nope'), 'image'), /Not a picture/);
  assert.throws(() => parse('{bad', 'json'), /Not JSON/);
});

test('convert: Markdown ↔ HTML ↔ text, CSV ↔ JSON, rows → a Markdown table', () => {
  assert.match(convert(MD, 'markdown', 'html').html, /<h1>주간 보고<\/h1>/);
  assert.equal(convert('<h2>A</h2><p>b</p>', 'html', 'markdown').text, '## A\n\nb');
  assert.equal(convert('<p>a<br>b</p>', 'html', 'text').text, 'a\nb');
  assert.deepEqual(convert('a,b\n1,x', 'csv', 'json').data, [{ a: 1, b: 'x' }]);
  assert.equal(convert('[{"a":1}]', 'json', 'csv').text, 'a\n1');
  assert.equal(convert(ROWS, 'auto', 'markdown').text.split('\n')[0], '| 지역 | 금액 | note |');
});
