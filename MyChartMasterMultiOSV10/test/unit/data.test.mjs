// The data layer: numbers and dates as people write them, delimited text, JSON shapes, spreadsheets (xlsx, ods),
// HTML / Markdown / XML tables, encodings, table edits and statistics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellText, columnLetter, columnStats, createTable, deleteColumns, deleteRows, fromMatrix, insertColumn, insertRow, matchingRows, parseDate, parseNumber,
  quantile, renameColumn, setCell, sortRows, transpose, uniqueNames,
} from '../../src/domain/data/table.js';
import { decodeText, detectFormat, guessDelimiter, htmlTables, importData, importPasted, markdownTables, parseJsonData, splitDelimited, xmlRecords } from '../../src/domain/data/importers.js';
import { exportData, toDelimited, toXlsx } from '../../src/domain/data/exporters.js';
import { crc32, readZip, writeZip } from '../../src/domain/data/zip.js';
import { parseXml, textOf } from '../../src/domain/data/xml.js';

const enc = (s) => new TextEncoder().encode(s);

test('parseNumber reads the ways people write numbers', () => {
  const cases = [['1,234.5', 1234.5], ['1.234,5', 1234.5], ['12%', 0.12], ['$3.20', 3.2], ['₩1,000', 1000], ['(42)', -42], ['1.2k', 1200], ['−5', -5], ['3,5', 3.5], ['1 234', 1234], ['2.5e3', 2500], ['-0.75', -0.75], ['1,000원', 1000]];
  for (const [text, want] of cases) assert.equal(parseNumber(text), want, text);
  for (const text of ['', 'abc', '1-2', '2024-03-01', 'N/A']) assert.equal(parseNumber(text), null, text);
  assert.equal(parseNumber('1.234', { decimal: ',' }), 1234);
  assert.equal(parseNumber(7), 7);
  assert.equal(parseNumber(Infinity), null);
});

test('parseDate reads ISO, slashes and Korean dates', () => {
  assert.equal(parseDate('2024-03-01'), Date.UTC(2024, 2, 1));
  assert.equal(parseDate('2024/3'), Date.UTC(2024, 2, 1));
  assert.equal(parseDate('2024년 3월 5일'), Date.UTC(2024, 2, 5));
  assert.equal(parseDate('2024-13-01'), null);
  assert.equal(parseDate('hello'), null);
});

test('createTable pads rows and infers column types', () => {
  const t = createTable(['Name', 'Value', 'When'], [['a', '1', '2024-01-01'], ['b', 2], ['c', '3,000', '2024-02-01']]);
  assert.deepEqual(t.columns.map((c) => c.type), ['text', 'number', 'date']);
  assert.equal(t.rows[1].length, 3);
  assert.equal(t.rows[1][2], null);
  assert.equal(columnLetter(0), 'A');
  assert.equal(columnLetter(27), 'AB');
  assert.deepEqual(uniqueNames(['A', 'A', '', 'A']), ['A', 'A (2)', 'Column', 'A (3)']);
});

test('fromMatrix finds the header row by itself', () => {
  const withHeader = fromMatrix([['City', 'Pop'], ['Seoul', '9.7'], ['Busan', '3.4']]);
  assert.deepEqual(withHeader.columns.map((c) => c.name), ['City', 'Pop']);
  assert.equal(withHeader.rows[0][1], 9.7);
  const noHeader = fromMatrix([['1', '2'], ['3', '4']]);
  assert.deepEqual(noHeader.columns.map((c) => c.name), ['A', 'B']);
  assert.equal(noHeader.rows.length, 2);
  const forced = fromMatrix([['x', 'y'], ['a', 'b']], { header: 'no' });
  assert.equal(forced.rows.length, 2);
});

test('delimited text: quotes, line breaks in quotes, delimiter guess, sep= hint', () => {
  assert.deepEqual(splitDelimited('a,"b, c","say ""hi"""\n1,"two\nlines",3'), [['a', 'b, c', 'say "hi"'], ['1', 'two\nlines', '3']]);
  assert.equal(guessDelimiter('a;b;c\n1;2;3\n4;5;6'), ';');
  assert.equal(guessDelimiter('a\tb\n1\t2'), '\t');
  assert.equal(guessDelimiter('a|b|c\n1|2|3'), '|');
  assert.deepEqual(splitDelimited('x   y  z\n1 2 3', ' '), [['x', 'y', 'z'], ['1', '2', '3']]);
});

test('importData: CSV with a sep hint, TSV, semicolons and decimal commas', async () => {
  const csv = await importData(enc('sep=;\nItem;Price\nA;1,5\nB;2,25\n'), 'x.csv');
  assert.equal(csv.table.rows[1][1], 2.25);
  const tsv = await importData(enc('a\tb\n1\t2\n'), 'x.tsv');
  assert.equal(tsv.format, 'tsv');
  assert.deepEqual(tsv.table.rows, [[1, 2]]);
  const text = await importData(enc('name value\nx 3\ny 4\n'), 'x.txt');
  assert.deepEqual(text.table.rows, [['x', 3], ['y', 4]]);
});

test('importData decodes EUC-KR and UTF-16 Korean CSV', async () => {
  const eucKr = Uint8Array.from([0xc1, 0xf6, 0xbf, 0xaa, 0x2c, 0xb0, 0xaa, 0x0a, 0xbc, 0xad, 0xbf, 0xef, 0x2c, 0x31, 0x0a]); // 지역,값\n서울,1
  const r = await importData(eucKr, 'k.csv');
  assert.equal(r.table.columns[0].name, '지역');
  assert.equal(r.table.rows[0][0], '서울');
  const utf16 = new Uint8Array([0xff, 0xfe, ...[...'가,1\n'].flatMap((ch) => { const c = ch.charCodeAt(0); return [c & 0xff, c >> 8]; })]);
  assert.equal(decodeText(utf16), '가,1\n');
});

test('JSON in its common shapes', () => {
  assert.deepEqual(parseJsonData([{ a: 'x', b: 1 }, { a: 'y', b: 2 }]).rows, [['x', 1], ['y', 2]]);
  assert.deepEqual(parseJsonData([['h', 'n'], ['x', 1]]).columns.map((c) => c.name), ['h', 'n']);
  assert.deepEqual(parseJsonData({ columns: ['a', 'b'], rows: [[1, 2]] }).rows, [[1, 2]]);
  const chartJs = parseJsonData({ labels: ['Q1', 'Q2'], datasets: [{ label: 'S', data: [3, 4] }] });
  assert.deepEqual(chartJs.columns.map((c) => c.name), ['Label', 'S']);
  assert.deepEqual(parseJsonData({ A: [1, 2], B: [3, 4] }).rows, [[1, 3], [2, 4]]);
  assert.deepEqual(parseJsonData({ Seoul: 9.7, Busan: 3.4 }).rows, [['Seoul', 9.7], ['Busan', 3.4]]);
  assert.deepEqual(parseJsonData({ data: [{ v: 1 }] }).rows, [[1]]);
  assert.deepEqual(parseJsonData({ features: [{ properties: { n: 'a', v: 2 } }] }).rows, [['a', 2]]);
  assert.deepEqual(parseJsonData([{ a: { b: 1 } }]).columns.map((c) => c.name), ['a.b']);
  assert.throws(() => parseJsonData(42), /import.jsonShape/);
});

test('HTML, Markdown and XML tables', async () => {
  const html = '<html><body><p>x<table><caption>T1</caption><tr><th>Name<th>Val<tr><td>a<td>1<tr><td colspan=2>wide</table><table><tr><td>z</td></tr></table></body></html>';
  const tables = htmlTables(html);
  assert.equal(tables.length, 2);
  assert.equal(tables[0].name, 'T1');
  assert.deepEqual(tables[0].rows, [['Name', 'Val'], ['a', '1'], ['wide', 'wide']]);
  const md = markdownTables('# Sales\n\n| m | v |\n|---|--:|\n| a | 1 |\n| b | 2 |\n');
  assert.equal(md[0].name, 'Sales');
  assert.deepEqual(md[0].rows, [['m', 'v'], ['a', '1'], ['b', '2']]);
  const xml = xmlRecords('<?xml version="1.0"?><root><row id="1"><v>3</v></row><row id="2"><v>4</v></row></root>');
  assert.deepEqual(xml.rows, [['id', 'v'], ['1', '3'], ['2', '4']]);
  const imported = await importData(enc('| a | b |\n|---|---|\n| x | 1 |\n'), 'x.md');
  assert.equal(imported.table.rows[0][1], 1);
  assert.equal(textOf(parseXml('<a>x &amp; <b>y</b></a>')), 'x & y');
});

test('detectFormat by name and by content', () => {
  assert.equal(detectFormat('a.xlsx'), 'xlsx');
  assert.equal(detectFormat('a.mychart'), 'mychart');
  assert.equal(detectFormat('a.txt', enc('[{"a":1}]')), 'json');
  assert.equal(detectFormat('a.txt', enc('<table><tr><td>1</td></tr></table>')), 'html');
  assert.equal(detectFormat('noext', enc('PK\x03\x04....')), 'xlsx');
  assert.equal(detectFormat('data', enc('a,b\n1,2')), 'csv');
});

test('ZIP: write then read back, deflated and stored, CRC', async () => {
  assert.equal(crc32(enc('123456789')), 0xcbf43926);
  const big = 'hello chart '.repeat(200);
  const zip = await writeZip([{ name: 'a.txt', data: big }, { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3]) }]);
  const files = await readZip(zip);
  assert.equal(new TextDecoder().decode(files.get('a.txt')), big);
  assert.deepEqual([...files.get('dir/b.bin')], [1, 2, 3]);
  await assert.rejects(readZip(new Uint8Array(30)), /zip.damaged/);
});

test('Excel: our .xlsx reads back the same table', async () => {
  const table = createTable(['지역', '매출', '비율'], [['서울', 120, 0.25], ['부산 & 울산', 80.5, null], ['<대구>', -3, 1]]);
  const bytes = await toXlsx(table, { sheetName: '시트/1' });
  const back = await importData(bytes, 'x.xlsx');
  assert.deepEqual(back.sheets, ['시트 1']);
  assert.deepEqual(back.table.columns.map((c) => c.name), ['지역', '매출', '비율']);
  assert.deepEqual(back.table.rows, [['서울', 120, 0.25], ['부산 & 울산', 80.5, null], ['<대구>', -3, 1]]);
});

test('Excel: shared and inline strings, dates, sheets, table not at A1', async () => {
  const files = [
    { name: 'xl/workbook.xml', data: '<workbook xmlns:r="r"><sheets><sheet name="One" r:id="rId1"/><sheet name="Two" r:id="rId2"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>' },
    { name: 'xl/sharedStrings.xml', data: '<sst><si><t>Date</t></si><si><r><t>Va</t></r><r><t>lue</t></r></si></sst>' },
    { name: 'xl/styles.xml', data: '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData><row r="3"><c r="C3" t="s"><v>0</v></c><c r="D3" t="s"><v>1</v></c></row><row r="4"><c r="C4" s="1"><v>45658</v></c><c r="D4"><v>7</v></c></row><row r="5"><c r="C5" t="inlineStr"><is><t>later</t></is></c><c r="D5" t="b"><v>1</v></c></row></sheetData></worksheet>' },
    { name: 'xl/worksheets/sheet2.xml', data: '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>' },
  ];
  const bytes = await writeZip(files);
  const r = await importData(bytes, 'x.xlsx');
  assert.deepEqual(r.sheets, ['One', 'Two']);
  assert.deepEqual(r.table.columns.map((c) => c.name), ['Date', 'Value']);
  assert.deepEqual(r.table.rows, [['2025-01-01', 7], ['later', 'TRUE']]);
  const two = await importData(bytes, 'x.xlsx', { sheet: 1 });
  assert.equal(two.sheet, 1);
});

test('OpenDocument spreadsheet (.ods) with repeated cells', async () => {
  const content = `<office:document-content xmlns:office="o" xmlns:table="t" xmlns:text="x"><office:body><office:spreadsheet>
    <table:table table:name="Data">
      <table:table-row><table:table-cell office:value-type="string"><text:p>Item</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>N</text:p></table:table-cell></table:table-row>
      <table:table-row><table:table-cell office:value-type="string"><text:p>a</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="2.5"><text:p>2.5</text:p></table:table-cell></table:table-row>
      <table:table-row table:number-rows-repeated="2"><table:table-cell office:value-type="float" office:value="1" table:number-columns-repeated="2"/></table:table-row>
    </table:table></office:spreadsheet></office:body></office:document-content>`;
  const bytes = await writeZip([{ name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' }, { name: 'content.xml', data: content }], { store: true });
  const r = await importData(bytes, 'x.ods');
  assert.deepEqual(r.sheets, ['Data']);
  assert.deepEqual(r.table.rows, [['a', 2.5], [1, 1], [1, 1]]);
});

test('pasted text: spreadsheet range, Markdown, JSON', async () => {
  assert.deepEqual((await importPasted('a\tb\n1\t2')).table.rows, [[1, 2]]);
  assert.equal((await importPasted('| x | y |\n|---|---|\n| 1 | 2 |')).format, 'markdown');
  assert.equal((await importPasted('[{"k":1}]')).format, 'json');
  await assert.rejects(importPasted('   '), /import.empty/);
});

test('exports: CSV with BOM and quoting, TSV, JSON, Markdown, HTML', () => {
  const t = createTable(['name', 'v'], [['a, b', 1], ['say "x"', 2.5]]);
  const csv = toDelimited(t);
  assert.ok(csv.startsWith('﻿name,v\r\n"a, b",1\r\n"say ""x""",2.5'));
  assert.equal(exportData(t, 'tsv').split('\r\n')[1], 'a, b\t1');
  assert.deepEqual(JSON.parse(exportData(t, 'json')), [{ name: 'a, b', v: 1 }, { name: 'say "x"', v: 2.5 }]);
  assert.match(exportData(t, 'markdown', { title: 'T' }), /^# T\n\n\| name \| v \|\n\| --- \| ---: \|/);
  assert.match(exportData(t, 'html', { title: 'T' }), /<td class="num">2.5<\/td>/);
});

test('table edits return new tables and keep types', () => {
  const t = createTable(['k', 'v'], [['b', 2], ['a', 10], ['c', 1]]);
  assert.equal(setCell(t, 0, 1, '5').rows[0][1], 5);
  assert.equal(setCell(t, 5, 0, 'z').rows.length, 6);
  assert.equal(t.rows[0][1], 2, 'the original stays');
  assert.equal(insertRow(t, 1).rows.length, 4);
  assert.deepEqual(deleteRows(t, [0, 2]).rows, [['a', 10]]);
  assert.deepEqual(insertColumn(t, 1, 'new').columns.map((c) => c.name), ['k', 'new', 'v']);
  assert.equal(deleteColumns(t, [0, 1]), t, 'the last column stays');
  assert.deepEqual(deleteColumns(t, [0]).columns.map((c) => c.name), ['v']);
  assert.deepEqual(sortRows(t, 1, 1).rows.map((r) => r[0]), ['c', 'b', 'a']);
  assert.deepEqual(sortRows(t, 0, -1).rows.map((r) => r[0]), ['c', 'b', 'a']);
  assert.equal(renameColumn(t, 0, 'key').columns[0].name, 'key');
  const tr = transpose(t);
  assert.deepEqual(tr.columns.map((c) => c.name), ['k', 'b', 'a', 'c']);
  assert.deepEqual(tr.rows, [['v', 2, 10, 1]]);
  assert.deepEqual(matchingRows(t, 'A'), [1]);
  assert.equal(cellText(0.1 + 0.2), '0.3');
});

test('column statistics', () => {
  const t = createTable(['v'], [[1], [2], [3], [4], [null], ['x']]);
  const s = columnStats(t, 0);
  assert.equal(s.numbers, 4);
  assert.equal(s.count, 5);
  assert.equal(s.empty, 1);
  assert.equal(s.sum, 10);
  assert.equal(s.mean, 2.5);
  assert.equal(s.median, 2.5);
  assert.ok(Math.abs(s.stdev - 1.2909944) < 1e-6);
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
});
