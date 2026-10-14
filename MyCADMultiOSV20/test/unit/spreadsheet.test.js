// Spreadsheet: cells, formulas, aliases, cycles, bindings that follow the sheet.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DrawingDocument } from '../../src/domain/document.js';
import { addEntity, createDrawing, findEntity, normalizeDrawing } from '../../src/domain/drawing.js';
import { evaluate } from '../../src/domain/expr.js';
import { applyBindings, computeSheet, evaluateWith, normalizeSpreadsheet, sheetCsv } from '../../src/domain/spreadsheet.js';

const sheet = { cells: { A1: '10', A2: '=A1*2', B1: '=width + A2', B2: '=sqrt(B1) * 2', C1: '=C2', C2: '=C1', D1: 'note', D2: '=D1*2' }, aliases: { width: 'A1', total: 'B1' } };

test('formulas use cells and aliases; cycles and text in sums are errors', () => {
  const v = computeSheet(sheet);
  assert.equal(v.A2, 20);
  assert.equal(v.B1, 30);
  assert.ok(Math.abs(v.B2 - Math.sqrt(30) * 2) < 1e-12);
  assert.deepEqual(v.C1, { error: 'cycle' });
  assert.equal(v.D1, 'note');
  assert.deepEqual(v.D2, { error: 'text' });
  assert.equal(evaluateWith(sheet, 'total / 3 + width'), 20);
  assert.ok(Number.isNaN(evaluate('total')), 'without a sheet the name is unknown');
});

test('normalize keeps valid cells and aliases only; CSV has the values', () => {
  const s = normalizeSpreadsheet({ cells: { A1: '1', Z999: 'x', B2: '' }, aliases: { ok: 'A1', A2: 'A1', '1x': 'A1' } });
  assert.deepEqual(s, { cells: { A1: '1' }, aliases: { ok: 'A1' } });
  assert.equal(sheetCsv({ cells: { A1: '2', B2: '=A1*3' }, aliases: {} }), '2,\r\n,6\r\n');
});

test('bound values follow the spreadsheet in a document, and are saved', () => {
  const doc = new DrawingDocument(createDrawing());
  let id;
  doc.apply('add', (d) => {
    d.spreadsheet = normalizeSpreadsheet({ cells: { A1: '40' }, aliases: { width: 'A1' } });
    id = addEntity(d, 'solid', { kind: 'box', params: { length: 1, width: 10, height: 10 }, bind: { 'params.length': 'width * 2', z: 'width / 4' } }).id;
  });
  assert.equal(findEntity(doc.drawing, id).params.length, 80);
  assert.equal(findEntity(doc.drawing, id).z, 10);
  doc.apply('sheet', (d) => { d.spreadsheet.cells.A1 = '25'; });
  assert.equal(findEntity(doc.drawing, id).params.length, 50, 'the box follows the sheet');
  const back = normalizeDrawing(JSON.parse(JSON.stringify(doc.drawing)));
  assert.deepEqual(back.entities[0].bind, { 'params.length': 'width * 2', z: 'width / 4' });
  assert.equal(applyBindings(back), 0, 'nothing to change after a reload');
});
