import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange, inRange, rangeToFrames, rangeCount, formatRange } from '../../src/domain/analysis/ranges.js';

test('parses Wireshark packet ranges', () => {
  assert.deepEqual(parseRange('1-10,15,20-', 30).ranges, [[1, 10], [15, 15], [20, 30]]);
  assert.deepEqual(parseRange('-5', 30).ranges, [[1, 5]]);
  assert.deepEqual(parseRange(' 3 7 , 9 - 12 ', 30).ranges, [[3, 3], [7, 7], [9, 12]]);
  assert.deepEqual(parseRange('10-5').ranges, [[5, 10]]);
  assert.deepEqual(parseRange('1-5,3-8,9').ranges, [[1, 9]], 'overlapping and adjacent ranges merge');
  assert.deepEqual(parseRange('20-').ranges, [[20, Infinity]], 'open end without a maximum');
});

test('clamps to the last frame and drops ranges beyond it', () => {
  assert.deepEqual(parseRange('5-100,200', 50).ranges, [[5, 50]]);
});

test('reports errors with a code and position', () => {
  const r = parseRange('1-3,x', 10);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'syntax');
  assert.equal(r.at, 4);
  assert.equal(parseRange('', 10).code, 'empty');
  assert.equal(parseRange('0-3', 10).code, 'zero');
  assert.equal(parseRange('-', 10).code, 'syntax');
});

test('inRange, rangeCount, rangeToFrames and formatRange', () => {
  const p = parseRange('2-4,8', 10);
  assert.ok(inRange(p, 3));
  assert.ok(inRange(p, 8));
  assert.ok(!inRange(p, 5));
  assert.ok(!inRange(p, 1));
  assert.equal(rangeCount(p), 4);
  const frames = Array.from({ length: 10 }, (_, i) => ({ no: i + 1 }));
  assert.deepEqual(rangeToFrames('2-4,8', frames).map((f) => f.no), [2, 3, 4, 8]);
  assert.deepEqual(rangeToFrames('9-', frames).map((f) => f.no), [9, 10]);
  assert.deepEqual(rangeToFrames('bad', frames), []);
  assert.equal(formatRange(p), '2-4,8');
});
