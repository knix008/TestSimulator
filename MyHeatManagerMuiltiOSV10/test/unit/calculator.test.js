// Unit tests of the field calculator and histogram (node --test test/unit/calculator.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression, evaluateField, histogram, histogramCsv, resultVariables } from '../../src/core/calculator.js';

/** A 3 × 2 2D result: T = 10…60, qx = 3, qy = 4, the last cell void. */
function tinyResult() {
  const n = 6;
  const data = new Float32Array(n * 4);
  for (let c = 0; c < n; c++) { data[c] = 10 * (c + 1); data[n + c] = 3; data[2 * n + c] = 4; data[3 * n + c] = c === 5 ? 255 : 0; }
  return {
    header: { grid: { dim: 2, nx: 3, ny: 2, nz: 1, dx: 2, dy: 1, dz: 1 }, times: [0], fields: { T: { offset: 0, length: n, frames: 1 }, qx: { offset: n, length: n }, qy: { offset: 2 * n, length: n }, mat: { offset: 3 * n, length: n } } },
    data,
  };
}

test('expressions: precedence, right-associative powers, unary minus, functions, constants, comparisons', () => {
  const ev = (text, vars = {}) => compileExpression(text).evaluate(vars);
  assert.equal(ev('1 + 2 * 3'), 7);
  assert.equal(ev('(1 + 2) * 3'), 9);
  assert.equal(ev('2 ^ 3 ^ 2'), 512);
  assert.equal(ev('2 ** 3'), 8);
  assert.equal(ev('-2 ^ 2'), -4);
  assert.equal(ev('max(1, 5, 3) - min(4, 2)'), 3);
  assert.ok(Math.abs(ev('sin(pi / 2)') - 1) < 1e-12);
  assert.equal(ev('T > 30', { T: 40 }), 1);
  assert.equal(ev('(T >= 30) * T', { T: 20 }), 0);
  assert.deepEqual(compileExpression('sqrt(qx^2 + qy^2) + T').names.sort(), ['T', 'qx', 'qy']);
});

test('expressions reject what is not arithmetic', () => {
  assert.throws(() => compileExpression(''), /empty/);
  assert.throws(() => compileExpression('1 +'), /ends too early/);
  assert.throws(() => compileExpression('foo(1)'), /unknown function/);
  assert.throws(() => compileExpression('alert`1`'), /unexpected/);
  assert.throws(() => compileExpression('(1 + 2'), /expected "\)"/);
  assert.throws(() => compileExpression('constructor.constructor("x")()'), /unexpected/);
});

test('field evaluation over a result: variables, magnitudes, cell centres, void cells', () => {
  const r = tinyResult();
  const vars = resultVariables(r, { ambient: 20 });
  for (const name of ['T', 'qx', 'qy', 'q', 'x', 'y', 'z', 'Tamb', 't']) assert.ok(vars.names.includes(name), name);
  const rise = evaluateField(r, 'T - Tamb', { ambient: 20 });
  assert.deepEqual([...rise.values.slice(0, 5)], [-10, 0, 10, 20, 30]);
  assert.ok(Number.isNaN(rise.values[5]), 'void cell');
  assert.equal(rise.count, 5);
  assert.equal(rise.mean, 10);
  assert.equal(evaluateField(r, 'q').max, 5);
  assert.equal(evaluateField(r, 'x').max, 5, 'cell centre of i = 2 with dx = 2 mm');
  const bad = evaluateField(r, 'log(T - 30)');
  assert.equal(bad.invalid, 3, 'log of two negative numbers and of zero');
  assert.throws(() => evaluateField(r, 'vonMises * 2'), /unknown name: vonMises/);
});

test('histogram: bins, fractions, cumulative, the void cell left out, CSV', () => {
  const r = tinyResult();
  const T = evaluateField(r, 'T').values;
  const mat = r.data.subarray(18, 24);
  const hist = histogram(T, mat, { bins: 4 });
  assert.equal(hist.total, 5);
  assert.deepEqual(hist.edges, [10, 20, 30, 40, 50]);
  assert.deepEqual(hist.counts, [1, 1, 1, 2], 'the top edge falls in the last bin');
  assert.equal(hist.cumulative.at(-1), 1);
  const csv = histogramCsv(hist, 'T', '°C').split('\n');
  assert.equal(csv[0], 'T (°C) from,T (°C) to,cells,fraction,cumulative');
  assert.equal(csv.length, 6);
});
