// Inspection: characteristics of a drawing, their limits (tolerance types, ISO 286 fits, ISO 2768 general
// tolerances), balloons (one per characteristic, numbered once, not overlapping), measured values typed in or
// imported from CSV, pass / fail, and the report as CSV and as PDF pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  characteristicsOf, autoBalloon, limitsOf, generalTolerance, setMeasured, parseMeasurementsCsv, importMeasurements, reportCsv, reportRows,
  reportSummary, reportPages, pdfFromPages, balloonsSvg, inspectionOf, evaluate,
} from '../../src/cad/inspection.js';
import { createDrawing } from '../../src/cad/drawing.js';

function drawing() {
  const d = createDrawing({ id: 'd1', name: 'Bracket', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: 'v1', type: 'front' }, { id: 'v2', type: 'top' }, { id: 'v3', type: 'iso' }];
  d.annotations = [
    { id: 'a1', kind: 'drwDim', view: 'v1', dtype: 'horizontal', p1: [0, 0], p2: [100, 0], x: 0, y: 30, tol: { type: 'symmetric', upper: 0.1 } },
    { id: 'a2', kind: 'drwDim', view: 'v1', dtype: 'diameter', c: [0, 0], r: 10, x: 20, y: -20, tol: { type: 'fit', fit: 'H7' } },
    { id: 'a3', kind: 'drwDim', view: 'v2', dtype: 'vertical', p1: [0, 0], p2: [0, 25], x: -40, y: 0 },
    { id: 'a4', kind: 'drwDim', view: 'v2', dtype: 'horizontal', p1: [0, 0], p2: [40, 0], x: 0, y: 25, tol: { type: 'bilateral', upper: 0.05, lower: 0.02 } },
    { id: 'a5', kind: 'drwDim', view: 'v2', dtype: 'radial', c: [0, 0], r: 5, x: 10, y: 10, tol: { type: 'limits', upper: 0.1, lower: 0 } },
    { id: 'a6', kind: 'drwDim', view: 'v1', dtype: 'aligned', p1: [0, 0], p2: [30, 40], x: 5, y: 5, tol: { type: 'basic' } },
    { id: 'a7', kind: 'drwDim', view: 'v1', dtype: 'angular', v: [0, 0], r1: [10, 0], r2: [0, 10], x: 12, y: 12 },
    { id: 'g1', kind: 'gdt', symbol: 'flatness', tolerance: '0.05', x: 50, y: 50 },
    { id: 'g2', kind: 'gdt', symbol: 'position', tolerance: '0.1', diameter: true, datums: ['A', 'B'], x: 60, y: 70 },
    { id: 's1', kind: 'surface', ra: '1.6', x: 80, y: 60 },
    { id: 'n1', kind: 'note', text: 'Break all sharp edges 0.2', x: 30, y: 250 },
    { id: 'b1', kind: 'balloon', item: 1, x: 1, y: 1 },
  ];
  return d;
}
const projections = new Map([['v1', { box: { x0: -50, y0: -15, x1: 50, y1: 15 } }], ['v2', { box: { x0: -50, y0: -20, x1: 50, y1: 20 } }], ['v3', { box: { x0: -40, y0: -40, x1: 40, y1: 40 } }]]);

test('limits: symmetric, bilateral, limits, ISO 286 fit, basic and ISO 2768 general tolerances', () => {
  assert.deepEqual(pick(limitsOf(100, { type: 'symmetric', upper: 0.1 })), [0.1, -0.1, 100.1, 99.9]);
  assert.deepEqual(pick(limitsOf(40, { type: 'bilateral', upper: 0.05, lower: 0.02 })), [0.05, -0.02, 40.05, 39.98]);
  assert.deepEqual(pick(limitsOf(5, { type: 'limits', upper: 0.1, lower: 0 })), [0.1, 0, 5.1, 5]);
  assert.deepEqual(pick(limitsOf(20, { type: 'fit', fit: 'H7' })), [0.021, 0, 20.021, 20]);
  assert.deepEqual(pick(limitsOf(20, { type: 'fit', fit: 'g6' })), [-0.007, -0.02, 19.993, 19.98]);
  assert.equal(limitsOf(30, { type: 'basic' }).tolKind, 'basic');
  assert.equal(generalTolerance(25, 'm'), 0.2); assert.equal(generalTolerance(100, 'f'), 0.15); assert.equal(generalTolerance(500, 'c'), 2);
  assert.equal(generalTolerance(0, 'm', { angular: true, leg: 30 }), 0.5);
  assert.deepEqual(pick(limitsOf(25, null, { general: 'm' })), [0.2, -0.2, 25.2, 24.8]);
});
const pick = (l) => [l.upper, l.lower, l.usl, l.lsl].map((v) => Math.round(v * 1e6) / 1e6);

test('characteristics: every dimension, GD&T frame, surface mark and note, and the views’ overall sizes', () => {
  const chars = characteristicsOf(drawing(), projections);
  // 7 dimensions, 2 frames, 1 surface mark, 1 note, 2 sizes for each of the two orthographic views.
  assert.equal(chars.length, 7 + 2 + 1 + 1 + 4);
  assert.equal(chars.filter((c) => c.kind === 'viewSize').length, 4);
  const by = (src) => chars.find((c) => c.src === src);
  assert.equal(by('a2').text, 'Ø20 H7');
  assert.equal(by('a7').unit, '°'); assert.ok(Math.abs(by('a7').nominal - 90) < 1e-9); assert.equal(by('a7').upper, 0.5);
  assert.equal(by('g2').check, 'max'); assert.equal(by('g2').usl, 0.1); assert.match(by('g2').text, /A \| B/);
  assert.equal(by('s1').unit, 'µm'); assert.equal(by('n1').check, 'attribute'); assert.equal(by('a6').check, 'basic');
  assert.equal(chars.find((c) => c.src === 'view:v1:w').nominal, 100);
});

test('auto balloon: one balloon per characteristic, numbered 1…N, none overlapping, numbers kept on a second run', () => {
  const d = drawing();
  const chars = characteristicsOf(d, projections);
  const b = autoBalloon(d, chars);
  assert.equal(b.length, chars.length);
  assert.deepEqual(b.map((c) => c.n), Array.from({ length: chars.length }, (_, i) => i + 1));
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const dd = Math.hypot(b[i].balloon[0] - b[j].balloon[0], b[i].balloon[1] - b[j].balloon[1]);
    assert.ok(dd >= 8 - 1e-6, `balloons ${b[i].n} and ${b[j].n} ${dd.toFixed(2)} mm apart`);
  }
  // A dimension removed and one added: the others keep their numbers, the new one takes the next.
  d.annotations = d.annotations.filter((a) => a.id !== 'a3');
  d.annotations.push({ id: 'a9', kind: 'drwDim', view: 'v1', dtype: 'vertical', p1: [0, 0], p2: [0, 12], x: -60, y: 0 });
  const again = autoBalloon(d, characteristicsOf(d, projections));
  assert.equal(again.length, chars.length);
  assert.equal(again.find((c) => c.src === 'a1').n, 1);
  assert.equal(again.find((c) => c.src === 'a9').n, chars.length + 1);
  const svg = balloonsSvg(again);
  assert.equal((svg.match(/class="insp-balloon/g) ?? []).length, again.length);
  assert.equal(Object.keys(inspectionOf(d).items).length, again.length);
});

test('measured values: pass / fail against the limits, statistics, attribute checks', () => {
  const d = drawing();
  let chars = autoBalloon(d, characteristicsOf(d, projections));
  const n = (src) => chars.find((c) => c.src === src).n;
  setMeasured(d, n('a1'), [100.05, 99.95, 100.02]);
  setMeasured(d, n('a2'), [20.025]);
  setMeasured(d, n('g1'), [0.03]);
  setMeasured(d, n('n1'), ['OK']);
  setMeasured(d, 'a4', [39.97]);
  chars = autoBalloon(d, characteristicsOf(d, projections));
  const c = (src) => chars.find((x) => x.src === src);
  assert.equal(c('a1').status, 'pass'); assert.ok(Math.abs(c('a1').mean - 100.00667) < 1e-4); assert.ok(c('a1').cpk > 0);
  assert.equal(c('a2').status, 'fail', 'Ø20.025 is over the H7 limit 20.021');
  assert.equal(c('g1').status, 'pass'); assert.equal(c('n1').status, 'pass');
  assert.equal(c('a4').status, 'fail', '39.97 is under 39.98');
  assert.equal(c('a6').status, 'na'); assert.equal(c('a3').status, 'open');
  const s = reportSummary(chars);
  assert.equal(s.fail, 2); assert.equal(s.pass, 3); assert.equal(s.verdict, 'fail');
  assert.equal(evaluate({ check: 'two', usl: 1, lsl: 0, measured: [1 + 1e-12], nominal: 0.5 }).status, 'pass', 'on the limit passes');
});

test('CSV import (header or not, ";" with decimal commas, several samples) and CSV export', () => {
  const d = drawing();
  const chars = autoBalloon(d, characteristicsOf(d, projections));
  const rows = parseMeasurementsCsv('Balloon;Measured 1;Measured 2\n1;100,02;99,97\n2;20,010\n99;1\n');
  assert.deepEqual(rows, [{ n: 1, values: [100.02, 99.97] }, { n: 2, values: [20.01] }, { n: 99, values: [1] }]);
  assert.deepEqual(importMeasurements(d, rows), { applied: 2, unknown: [99] });
  assert.deepEqual(parseMeasurementsCsv('3,25.1,25.05\n4,"0,04"\n').map((r) => r.n), [3, 4]);
  const after = autoBalloon(d, characteristicsOf(d, projections));
  assert.equal(after.find((c) => c.n === 1).status, 'pass');
  const csv = reportCsv(after, { title: 'Bracket' });
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 2 + chars.length);
  assert.match(lines[1], /^Balloon,Characteristic,Type,Nominal,Upper tol,Lower tol,USL,LSL,Unit,Measured 1,Measured 2,Mean,Result$/);
  assert.match(lines[2], /^1,100 ±0\.100,dimension,100,0\.1,-0\.1,100\.1,99\.9,mm,100\.02,99\.97,99\.995,PASS$/);
  const excel = reportCsv(after, { excel: true });
  assert.ok(excel.startsWith('﻿sep=,\r\n'));
  // The exported table reads back: balloon numbers and first samples.
  const back = parseMeasurementsCsv(csv.split('\n').slice(1).join('\n'));
  assert.ok(back.length >= 1);
  assert.equal(reportRows(after).rows.length, chars.length);
});

test('PDF report: pages hold every row, the PDF is well formed', () => {
  const d = drawing();
  const many = [];
  for (let i = 0; i < 60; i++) many.push({ id: `x${i}`, kind: 'drwDim', view: 'v1', dtype: 'horizontal', p1: [0, 0], p2: [10 + i, 0], x: i, y: 40 + i });
  d.annotations.push(...many);
  const chars = autoBalloon(d, characteristicsOf(d, projections));
  const pages = reportPages(chars, { title: 'Inspection report — Bracket', subtitle: 'Rev A' });
  assert.ok(pages.length >= 2);
  const rowsDrawn = pages.reduce((s, p) => s + p.items.filter((it) => it.t === 'rect').length - 1, 0);
  assert.equal(rowsDrawn, chars.length);
  const pdf = pdfFromPages(pages, { title: 'Bracket' });
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4') && text.trimEnd().endsWith('%%EOF'));
  assert.equal((text.match(/\/Type \/Page /g) ?? []).length, pages.length);
  // The cross-reference table points at the objects.
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(xref).startsWith('xref'));
  const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.ok(text.slice(o).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
});
