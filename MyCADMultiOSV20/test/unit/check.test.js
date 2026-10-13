import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkDrawing, nearTolerance, PROBLEM_CODES, problemCounts } from '../../src/domain/check.js';
import { createEntity } from '../../src/domain/entities.js';
import { parseFile } from '../../src/domain/format.js';
import { DICTIONARIES } from '../../src/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const drawing = (entities, layers = [{ id: '0', name: '0' }]) => ({ layers, entities: entities.map(([type, data]) => createEntity(type, { layer: '0', ...data })) });
const codes = (d) => checkDrawing(d).map((f) => f.code);

test('check: a clean drawing has no problems', () => {
  const d = drawing([
    ['line', { x1: 0, y1: 0, x2: 100, y2: 0 }], ['line', { x1: 100, y1: 0, x2: 100, y2: 50 }],
    ['rect', { x: 10, y: 10, width: 20, height: 10 }], ['circle', { cx: 50, cy: 25, r: 5 }], ['text', { x: 0, y: -10, text: 'A' }],
  ]);
  assert.deepEqual(checkDrawing(d), []);
});

test('check: broken geometry is an error', () => {
  const d = drawing([
    ['line', { x1: 5, y1: 5, x2: 5, y2: 5 }],
    ['polyline', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], closed: true }],
    ['dim', { kind: 'horizontal', x1: 3, y1: 0, x2: 3, y2: 9, ox: 3, oy: 12 }],
    ['line', { x1: 0, y1: 0, x2: 2e7, y2: 0 }],
  ]);
  const found = checkDrawing(d);
  assert.deepEqual(found.filter((f) => f.severity === 'error').map((f) => f.code).sort(), ['degenerateOutline', 'hugeCoordinate', 'zeroDim', 'zeroLength']);
  assert.equal(found[0].severity, 'error', 'worst first');
});

test('check: duplicates, near misses and almost closed outlines are warnings', () => {
  const d = drawing([
    ['circle', { cx: 0, cy: 0, r: 5 }], ['circle', { cx: 0, cy: 0, r: 5 }],
    ['line', { x1: 0, y1: 20, x2: 50, y2: 20 }], ['line', { x1: 50.004, y1: 20, x2: 50, y2: 60 }],
    ['polyline', { points: [{ x: 100, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 30 }, { x: 100.003, y: 0.002 }], closed: false }],
    ['text', { x: 0, y: -20, text: '  ' }],
  ]);
  const found = checkDrawing(d);
  const duplicate = found.find((f) => f.code === 'duplicate');
  assert.equal(duplicate.ids.length, 2);
  const gap = found.find((f) => f.code === 'gap');
  assert.ok(Math.abs(gap.params.gap - 0.004) < 1e-9, JSON.stringify(gap));
  assert.ok(found.some((f) => f.code === 'nearlyClosed'));
  assert.ok(found.some((f) => f.code === 'emptyText'));
  assert.equal(found.filter((f) => f.code === 'gap').length, 1, 'one gap reported once');
  assert.deepEqual(problemCounts(found), { error: 0, warning: 4, info: 0, total: 4 });
});

test('check: ends joined exactly are fine; ends far apart are not a gap', () => {
  const d = drawing([
    ['line', { x1: 0, y1: 0, x2: 10, y2: 0 }], ['line', { x1: 10, y1: 0, x2: 10, y2: 10 }], ['line', { x1: 13, y1: 0, x2: 30, y2: 0 }],
  ]);
  assert.ok(!codes(d).includes('gap'));
});

test('check: repeated vertices and a missing layer are notes; solids without parts are errors', () => {
  const d = drawing([
    ['polyline', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: false }],
    ['line', { x1: 0, y1: 20, x2: 9, y2: 20, layer: 'gone' }],
    ['solid', { kind: 'boolean', params: {}, shape: { op: 'cut', parts: [] }, name: 'B' }],
  ]);
  const found = checkDrawing(d);
  assert.equal(found.find((f) => f.code === 'repeatedPoint').params.count, 1);
  assert.equal(found.find((f) => f.code === 'missingLayer').params.layer, 'gone');
  assert.ok(found.some((f) => f.code === 'emptyBoolean' && f.severity === 'error'));
});

test('check: the near-miss tolerance follows the drawing size (0.01 … 0.5)', () => {
  assert.equal(nearTolerance(null), 0.01);
  assert.equal(nearTolerance({ minX: 0, minY: 0, maxX: 10, maxY: 10 }), 0.01);
  assert.ok(Math.abs(nearTolerance({ minX: 0, minY: 0, maxX: 300, maxY: 400 }) - 0.05) < 1e-12);
  assert.equal(nearTolerance({ minX: 0, minY: 0, maxX: 1e5, maxY: 1e5 }), 0.5);
});

test('check: every problem has a message in both languages', () => {
  for (const code of PROBLEM_CODES) {
    for (const dict of Object.values(DICTIONARIES)) assert.ok(dict[`problems.${code}`], code);
  }
});

test('check: every sample drawing is clean (fast, without meshing solids)', () => {
  for (const file of fs.readdirSync(path.join(root, 'samples')).filter((name) => name.endsWith('.mcad'))) {
    const d = parseFile(fs.readFileSync(path.join(root, 'samples', file), 'utf8'));
    const start = performance.now();
    const found = checkDrawing(d);
    assert.deepEqual(found.map((f) => f.code), [], file);
    assert.ok(performance.now() - start < 500, `${file}: ${Math.round(performance.now() - start)} ms`);
  }
});
