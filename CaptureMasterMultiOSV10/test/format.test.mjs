import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDuration, formatDateTime, clamp } from '../src/lib/format.js';

test('byte sizes use B, KB, MB and GB', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(NaN), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
  assert.equal(formatBytes(3 * 1024 * 1024 * 1024), '3.00 GB');
});

test('durations are m:ss or h:mm:ss and never negative', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(-5), '0:00');
  assert.equal(formatDuration('nope'), '0:00');
  assert.equal(formatDuration(65.9), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
});

test('dates follow the language and clamp stays inside the range', () => {
  const ts = Date.UTC(2026, 0, 2, 3, 4, 5);
  assert.match(formatDateTime(ts, 'en'), /2026/);
  assert.match(formatDateTime(ts, 'ko'), /2026/);
  assert.notEqual(formatDateTime(ts, 'en'), formatDateTime(ts, 'ko'));
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});
