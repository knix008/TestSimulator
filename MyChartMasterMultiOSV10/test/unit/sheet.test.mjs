// The data window's model: formulas (domain/data/formula.js), sheet operations (domain/data/sheet.js), formulas and
// formats through .xlsx and .mychart, and undo of the sheet extras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustFormula, evaluate, formatValue, FUNCTION_NAMES, moveFormula, parseRange, rangeAddress, recalc, shiftFormula, tokenize } from '../../src/domain/data/formula.js';
import {
  blockText, boxStats, clearBox, copyBlock, deleteCells, fillBox, findCells, formatBox, insertCells, jumpEdge, normalizeSheet, parseInput, pasteBlock,
  recalcTable, replaceIn, setInput, sheetCells, sortBox, tableFromCells, textBlock,
} from '../../src/domain/data/sheet.js';
import { createTable } from '../../src/domain/data/table.js';
import { importData, splitDelimited } from '../../src/domain/data/importers.js';
import { toXlsx } from '../../src/domain/data/exporters.js';
import { ChartDoc } from '../../src/domain/chart/doc.js';
import { readZip, zipText } from '../../src/domain/data/zip.js';

const grid = () => [['Name', 'Q1', 'Q2', 'Total'], ['a', 10, 20, null], ['b', 5, '7', null], ['c', 1, 2, null]];
const value = (formula, cells = grid()) => recalc(cells, { '9,9': formula })[9][9];

test('formulas: arithmetic, precedence, text, comparisons and errors', () => {
  assert.equal(value('=1+2*3'), 7);
  assert.equal(value('=(1+2)*3'), 9);
  assert.equal(value('=-2^2'), 4);
  assert.equal(value('=2^3^2'), 64);
  assert.equal(value('=10%*50'), 5);
  assert.equal(value('="a"&"b"&1'), 'ab1');
  assert.equal(value('=B2>B3'), 'TRUE');
  assert.equal(value('=A2="A"'), 'TRUE');
  assert.equal(value('=1/0'), '#DIV/0!');
  assert.equal(value('=NOPE(1)'), '#NAME?');
  assert.equal(value('=1+'), '#NAME?');
  assert.equal(value('=A2+1'), '#VALUE!');
  assert.equal(value('=C3+1'), 8, 'number-like text counts in arithmetic');
  assert.equal(value('=SQRT(-1)'), '#NUM!');
});

test('formulas: the common functions', () => {
  const cases = [
    ['=SUM(B2:C4)', 45], ['=SUM(B:B)', 16], ['=AVERAGE(B2:B4)', 16 / 3], ['=MIN(B2:B4)', 1], ['=MAX(B2:C4)', 20], ['=COUNT(B2:C4)', 5], ['=COUNTA(A1:D4)', 13],
    ['=COUNTBLANK(D2:D4)', 3], ['=MEDIAN(B2:B4)', 5], ['=ROUND(2.345,2)', 2.35], ['=ROUNDUP(2.341,2)', 2.35], ['=ROUNDDOWN(-2.349,2)', -2.34], ['=INT(-2.5)', -3],
    ['=MOD(-3,5)', 2], ['=ABS(-4)', 4], ['=POWER(2,10)', 1024], ['=PRODUCT(B2:B4)', 50], ['=IF(B2>5,"big","small")', 'big'], ['=IFERROR(1/0,"x")', 'x'],
    ['=AND(B2>1,B3>1)', 'TRUE'], ['=OR(B2>100,B3>100)', 'FALSE'], ['=NOT(TRUE)', 'FALSE'], ['=SUMIF(B2:B4,">2")', 15], ['=SUMIF(A2:A4,"b",B2:B4)', 5],
    ['=COUNTIF(A2:A4,"?")', 3], ['=COUNTIFS(B2:B4,">2",C2:C4,">10")', 1], ['=AVERAGEIF(B2:B4,">2")', 7.5], ['=VLOOKUP("b",A2:D4,2,FALSE)', 5],
    ['=HLOOKUP("Q2",A1:D4,2,FALSE)', 20], ['=INDEX(B2:C4,3,2)', 2], ['=MATCH(5,B2:B4,0)', 2], ['=XLOOKUP("c",A2:A4,B2:B4)', 1], ['=LEN("한글abc")', 5],
    ['=LEFT("Hello",2)', 'He'], ['=RIGHT("Hello",3)', 'llo'], ['=MID("Hello",2,3)', 'ell'], ['=UPPER("ab")', 'AB'], ['=TRIM("  a   b ")', 'a b'],
    ['=CONCAT(A2:A4)', 'abc'], ['=TEXTJOIN("-",TRUE,A2:A4)', 'a-b-c'], ['=SUBSTITUTE("a-b-c","-","+")', 'a+b+c'], ['=TEXT(0.256,"0.0%")', '25.6%'],
    ['=TEXT(1234.5,"#,##0.00")', '1,234.50'], ['=DATE(2024,2,30)', '2024-03-01'], ['=YEAR("2024-03-05")', 2024], ['=MONTH("2024-03-05")', 3],
    ['=LARGE(B2:C4,2)', 10], ['=SMALL(B2:C4,1)', 1], ['=RANK(5,B2:B4)', 2], ['=SUMPRODUCT(B2:B4,B2:B4)', 126], ['=ROWS(A1:B4)', 4], ['=COLUMN(C9)', 3],
    ['=STDEV(B2:B4)', Math.sqrt(((10 - 16 / 3) ** 2 + (5 - 16 / 3) ** 2 + (1 - 16 / 3) ** 2) / 2)], ['=CHOOSE(2,"x","y")', 'y'], ['=ISNUMBER(B2)', 'TRUE'],
  ];
  for (const [formula, want] of cases) {
    const got = value(formula);
    if (typeof want === 'number') assert.ok(Math.abs(got - want) < 1e-9, `${formula} = ${got}, want ${want}`);
    else assert.equal(got, want, formula);
  }
  assert.ok(FUNCTION_NAMES.length >= 100, `${FUNCTION_NAMES.length} functions`);
});

test('formulas: chains, cycles and whole-column ranges', () => {
  const cells = recalc(grid(), { '1,3': '=SUM(B2:C2)', '2,3': '=D2*2', '3,3': '=SUM(D2:D3)', '5,0': '=A6', '6,0': '=A8', '7,0': '=A7' });
  assert.equal(cells[1][3], 30);
  assert.equal(cells[2][3], 60);
  assert.equal(cells[3][3], 90);
  assert.equal(cells[5][0], '#CIRC!');
  assert.equal(cells[6][0], '#CIRC!');
  assert.equal(evaluate('=ROW()', { get: () => null, at: { r: 4, c: 0 } }), 5);
});

test('formulas: references move on copy, insert and delete like Excel', () => {
  assert.equal(shiftFormula('=SUM(B2:C2)+$A$1+A$1+$A1', 2, 1), '=SUM(C4:D4)+$A$1+B$1+$A3');
  assert.equal(shiftFormula('=A1', -1, 0), '=#REF!');
  assert.equal(shiftFormula('=LOG10(A1)', 1, 0), '=LOG10(A2)', 'function names are not references');
  assert.equal(shiftFormula('="A1"&A1', 1, 0), '="A1"&A2', 'text stays');
  assert.equal(adjustFormula('=SUM(B2:B9)+B5', { axis: 'row', at: 4, count: -1 }), '=SUM(B2:B8)+#REF!');
  assert.equal(adjustFormula('=SUM(B2:B9)', { axis: 'row', at: 1, count: 2 }), '=SUM(B4:B11)');
  assert.equal(adjustFormula('=$C$3', { axis: 'col', at: 0, count: 1 }), '=$D$3', 'absolute references move with inserted cells');
  assert.equal(adjustFormula('=SUM(A:B)', { axis: 'col', at: 0, count: 2 }), '=SUM(C:D)');
  assert.equal(adjustFormula('=SUM(B2:B4)', { axis: 'row', at: 1, count: -3 }), '=SUM(#REF!)');
  assert.equal(moveFormula('=$C$5+D6', -2, -2), '=$A$3+B4');
  assert.deepEqual(parseRange('b3:a1'), { r0: 0, c0: 0, r1: 2, c1: 1 });
  assert.equal(rangeAddress({ r0: 1, c0: 1, r1: 1, c1: 1 }), 'B2');
  assert.equal(tokenize('A1:B2').length, 1);
});

test('number formats show values like a spreadsheet', () => {
  assert.equal(formatValue(1234.5, { type: 'thousands' }, 'en'), '1,234.50');
  assert.equal(formatValue(1234.5, { type: 'currency', decimals: 0 }, 'ko'), '₩1,235');
  assert.equal(formatValue(-3, { type: 'currency', decimals: 2, symbol: '$' }, 'en'), '-$3.00');
  assert.equal(formatValue(0.1234, { type: 'percent', decimals: 1 }, 'en'), '12.3%');
  assert.equal(formatValue(12345, { type: 'scientific', decimals: 2 }), '1.23E+4');
  assert.equal(formatValue(45352, { type: 'date' }), '2024-03-01');
  assert.equal(formatValue('text', { type: 'number' }), 'text');
  assert.equal(formatValue(0.1 + 0.2, null), '0.3');
});

test('sheet: typing, rows and columns, clearing and the table it makes', () => {
  let { cells, sheet } = setInput(grid(), null, 1, 3, '=SUM(B2:C2)');
  assert.equal(cells[1][3], 30);
  ({ cells, sheet } = setInput(cells, sheet, 1, 1, '100'));
  assert.equal(cells[1][3], 120, 'recalculated');
  ({ cells, sheet } = insertCells(cells, sheet, 'row', 1, 2));
  assert.equal(sheet.formulas['3,3'], '=SUM(B4:C4)');
  assert.equal(cells[3][3], 120);
  ({ cells, sheet } = deleteCells(cells, sheet, 'col', 2, 1));
  assert.equal(sheet.formulas['3,2'], '=SUM(B4:B4)');
  assert.equal(cells[3][2], 100);
  ({ cells, sheet } = clearBox(cells, sheet, { r0: 3, r1: 3, c0: 2, c1: 2 }));
  assert.equal(sheet.formulas['3,2'], undefined);
  const t = tableFromCells([['A', '', 'A'], ['x', 1, null], [null, null, null]], null);
  assert.deepEqual(t.columns.map((c) => c.name), ['A', 'B', 'A (2)']);
  assert.equal(t.rows.length, 1, 'empty rows at the end go');
  assert.equal(parseInput('1,234'), 1234);
  assert.equal(parseInput('12%'), 0.12);
  assert.equal(parseInput('A-12'), 'A-12');
  assert.equal(parseInput('true'), 'TRUE');
});

test('sheet: copy and paste keep formulas relative, text from Excel pastes as values', () => {
  const start = setInput(grid(), null, 1, 3, '=B2+C2');
  const block = copyBlock(start.cells, start.sheet, { r0: 1, r1: 1, c0: 3, c1: 3 });
  const out = pasteBlock(start.cells, start.sheet, block, { r0: 2, c0: 3, r1: 3, c1: 3 });
  assert.equal(out.sheet.formulas['2,3'], '=B3+C3');
  assert.equal(out.sheet.formulas['3,3'], '=B4+C4');
  assert.equal(out.cells[3][3], 3);
  const values = pasteBlock(start.cells, start.sheet, block, { r0: 2, c0: 3 }, 'values');
  assert.equal(values.sheet.formulas['2,3'], undefined);
  assert.equal(values.cells[2][3], 30);
  const text = textBlock('x\t1,000\r\n"a\tb"\t2\r\n', splitDelimited);
  assert.equal(text.rows, 2);
  const pasted = pasteBlock(grid(), null, text, { r0: 5, c0: 0 });
  assert.deepEqual(pasted.cells[5].slice(0, 2), ['x', 1000]);
  assert.equal(pasted.cells[6][0], 'a\tb');
  assert.equal(blockText(copyBlock(grid(), null, { r0: 1, r1: 2, c0: 0, c1: 1 })), 'a\t10\r\nb\t5');
});

test('sheet: fill handle series, sort with formulas, find and replace, statistics, Ctrl+arrows', () => {
  const cells = [['N', 'V', 'L'], [null, 1, 'Q1'], [null, 3, null], [null, null, null], [null, null, null]];
  const out = fillBox(cells, null, { r0: 1, r1: 2, c0: 1, c1: 1 }, { r0: 1, r1: 4, c0: 1, c1: 1 });
  assert.deepEqual(out.cells.slice(1).map((r) => r[1]), [1, 3, 5, 7]);
  const labels = fillBox(cells, null, { r0: 1, r1: 1, c0: 2, c1: 2 }, { r0: 1, r1: 3, c0: 2, c1: 2 });
  assert.deepEqual(labels.cells.slice(1, 4).map((r) => r[2]), ['Q1', 'Q2', 'Q3']);
  const withFormula = setInput(grid(), null, 1, 3, '=B2*2');
  const filled = fillBox(withFormula.cells, withFormula.sheet, { r0: 1, r1: 1, c0: 3, c1: 3 }, { r0: 1, r1: 3, c0: 3, c1: 3 });
  assert.equal(filled.sheet.formulas['3,3'], '=B4*2');
  assert.equal(filled.cells[3][3], 2);
  const sorted = sortBox(filled.cells, filled.sheet, { r0: 1, r1: 3, c0: 0, c1: 3 }, 1, 1);
  assert.deepEqual(sorted.cells.slice(1).map((r) => r[0]), ['c', 'b', 'a']);
  assert.equal(sorted.sheet.formulas['1,3'], '=B2*2', 'the formula moved with its row');
  assert.equal(sorted.cells[3][3], 20);
  assert.equal(sorted.cells[0][0], 'Name', 'header stays');
  assert.deepEqual(findCells(grid(), null, 'q', {}).map((h) => [h.r, h.c]), [[0, 1], [0, 2]]);
  assert.equal(findCells(grid(), null, 'q', { matchCase: true }).length, 0);
  assert.equal(replaceIn('a-a', 'A', 'b'), 'b-b');
  assert.equal(replaceIn('abc', 'b', 'x', { whole: true }), null);
  assert.deepEqual(boxStats(grid(), { r0: 0, r1: 3, c0: 1, c1: 2 }), { count: 8, numbers: 5, sum: 38, average: 7.6, min: 1, max: 20 });
  const big = [['h'], [1], [2], [null], [null], [5]];
  assert.equal(jumpEdge(big, 1, 0, 1, 0, { rows: 100, cols: 5 }).r, 2);
  assert.equal(jumpEdge(big, 2, 0, 1, 0, { rows: 100, cols: 5 }).r, 5);
  assert.equal(jumpEdge(big, 5, 0, 1, 0, { rows: 100, cols: 5 }).r, 99);
  assert.deepEqual(formatBox(null, { r0: 1, r1: 1, c0: 0, c1: 1 }, { b: true }).formats, { '1,0': { b: true }, '1,1': { b: true } });
});

test('xlsx keeps formulas, formats and widths; formulas come back at their place', async () => {
  const table = createTable(['Item', 'Qty', 'Price', 'Total'], [['a', 2, 10, 20], ['b', 3, 5, 15]]);
  const sheet = { formulas: { '1,3': '=B2*C2', '2,3': '=B3*C3' }, formats: { '1,2': { b: true, fill: '#ffee00', fmt: 'currency', dec: 0 } }, widths: { 0: 140 } };
  const bytes = await toXlsx(table, { sheet });
  const out = await importData(bytes, 'x.xlsx');
  assert.deepEqual(out.extras.formulas, sheet.formulas);
  assert.equal(out.table.rows[1][3], 15);
  const files = await readZip(bytes);
  assert.ok(zipText(files, 'xl/workbook.xml').includes('fullCalcOnLoad'), 'Excel calculates again on open');
  const styles = zipText(files, 'xl/styles.xml');
  assert.ok(styles.includes('FFFFEE00') && styles.includes('<b/>') && styles.includes('#,##0'), 'formats');
  assert.ok(zipText(files, 'xl/worksheets/sheet1.xml').includes('<f>B2*C2</f>'), 'formula written');
});

test('ChartDoc keeps the sheet extras through undo, redo and .mychart', () => {
  const doc = new ChartDoc({ table: createTable(['A', 'B'], [['x', 1], ['y', 2]]) });
  const t2 = recalcTable(createTable(['A', 'B', 'C'], [['x', 1, null], ['y', 2, null]]), { formulas: { '1,2': '=B2*10' } });
  doc.setTable(t2, { sheet: { formulas: { '1,2': '=B2*10' }, formats: {}, widths: {} } });
  assert.equal(doc.table.rows[0][2], 10);
  doc.undo();
  assert.equal(doc.sheet, null);
  doc.redo();
  assert.equal(doc.sheet.formulas['1,2'], '=B2*10');
  const again = ChartDoc.fromJSON(doc.serialize(), { name: 'x.mychart' });
  assert.deepEqual(again.sheet.formulas, { '1,2': '=B2*10' });
  assert.equal(normalizeSheet({ formulas: { bad: '=1', '1,1': 'text' } }), null);
  assert.deepEqual(sheetCells(createTable(['A'], [[1]])), [['A'], [1]]);
});

test('Excel number format codes give what Excel shows', async () => {
  const { formatCode, BUILTIN_FORMATS, FORMAT_PRESETS } = await import('../../src/domain/data/numfmt.js');
  const cases = [
    [1234.567, '0', '1235'], [1234.567, '0.00', '1234.57'], [1234.567, '#,##0', '1,235'], [1234.567, '#,##0.00', '1,234.57'],
    [-1234.5, '#,##0;[Red]-#,##0', '-1,235'], [-1234.5, '#,##0;(#,##0)', '(1,235)'], [0.256, '0%', '26%'], [0.256, '0.0%', '25.6%'],
    [12345, '0.00E+00', '1.23E+04'], [0.00012, '0.00E+00', '1.20E-04'], [1234.5, '"₩"#,##0', '₩1,235'], [1234.5, '#,##0"원"', '1,235원'],
    [1234567, '#,##0,"천"', '1,235천'], [1234567, '#,##0,,', '1'], [1.5, '# ?/?', '1 1/2'], [42, '000000', '000042'], [3.1, '#.##', '3.1'],
    [0, '#,##0;-#,##0;"zero"', 'zero'], [45352, 'yyyy-mm-dd', '2024-03-01'], ['2024-03-01', 'yyyy"년" m"월" d"일"', '2024년 3월 1일'],
    [45352.5, 'yyyy-mm-dd hh:mm', '2024-03-01 12:00'], [0.75, 'h:mm AM/PM', '6:00 PM'], [1.5, '[h]:mm', '36:00'], [45352, 'd-mmm-yy', '1-Mar-24'],
    ['abc', '@', 'abc'], ['abc', '0.00', 'abc'], [1234.5, 'General', '1234.5'], [150, '[>=100]"high";"low"', 'high'], [5, '[>=100]"high";"low"', 'low'],
    [-5, '0.00_);(0.00)', '(5.00)'], [0.5, '#,##0.00', '0.50'], [0.5, '#.00', '.50'],
  ];
  for (const [v, code, want] of cases) assert.equal(formatCode(v, code).text, want, `${v} in ${code}`);
  assert.equal(formatCode(-3, '#,##0;[Red]-#,##0').color, '#d92d20');
  assert.equal(BUILTIN_FORMATS[4], '#,##0.00');
  for (const code of FORMAT_PRESETS) assert.equal(typeof formatCode(1234.5, code).text, 'string', code);
});

test('xlsx number formats: written as codes, read back on the cells', async () => {
  const t = createTable(['A', 'B'], [['x', 1234.5], ['y', -3]]);
  const bytes = await toXlsx(t, { sheet: { formulas: {}, formats: { '1,1': { fmt: 'custom', code: '#,##0.00;[Red]-#,##0.00' }, '2,1': { fmt: 'thousands', dec: 0 } }, widths: {} } });
  const out = await importData(bytes, 'x.xlsx');
  assert.deepEqual(out.extras.formats, { '1,1': { fmt: 'custom', code: '#,##0.00;[Red]-#,##0.00' }, '2,1': { fmt: 'custom', code: '#,##0' } });
});
