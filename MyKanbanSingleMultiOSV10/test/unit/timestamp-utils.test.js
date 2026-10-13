const assert = require('node:assert/strict');
const { describe, it } = require('../lib/framework');
const { normalizeTimestamp, sanitizeRowTimestamps } = require('../../src/db/timestamp-utils');

describe('Timestamp utilities', () => {
  it('returns null for null, undefined and empty string', () => {
    assert.equal(normalizeTimestamp(null), null);
    assert.equal(normalizeTimestamp(undefined), null);
    assert.equal(normalizeTimestamp(''), null);
  });

  it('keeps a valid Date instance unchanged', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    assert.equal(normalizeTimestamp(d), d);
  });

  it('replaces an invalid Date with the current time', () => {
    const result = normalizeTimestamp(new Date('not a date'));
    assert.ok(result instanceof Date);
    assert.ok(Math.abs(result.getTime() - Date.now()) < 5000);
  });

  it('converts epoch milliseconds (number) to a Date', () => {
    const result = normalizeTimestamp(1783562279745);
    assert.ok(result instanceof Date);
    assert.equal(result.getTime(), 1783562279745);
  });

  it('converts a 13-digit millisecond string (MySQL bug case) to a Date', () => {
    const result = normalizeTimestamp('1783562279745');
    assert.equal(result.getTime(), 1783562279745);
  });

  it('converts a 10-digit seconds string to a Date', () => {
    const result = normalizeTimestamp('1700000000');
    assert.equal(result.getTime(), 1700000000 * 1000);
  });

  it('parses ISO date strings', () => {
    const result = normalizeTimestamp('2026-03-15T10:20:30.000Z');
    assert.equal(result.toISOString(), '2026-03-15T10:20:30.000Z');
  });

  it('falls back to the current time for unparseable strings', () => {
    const result = normalizeTimestamp('garbage');
    assert.ok(Math.abs(result.getTime() - Date.now()) < 5000);
  });

  it('sanitizes only the timestamp fields of known tables', () => {
    const row = { id: 1, title: 'x', created_at: '1783562279745', updated_at: 1783562279745 };
    const out = sanitizeRowTimestamps('cards', row);
    assert.ok(out.created_at instanceof Date);
    assert.ok(out.updated_at instanceof Date);
    assert.equal(out.title, 'x');
    assert.equal(row.created_at, '1783562279745', 'input row must not be mutated');
  });

  it('leaves rows of unknown tables and null fields untouched', () => {
    const row = { created_at: '1783562279745' };
    assert.equal(sanitizeRowTimestamps('unknown_table', row), row);
    const cols = sanitizeRowTimestamps('columns', { created_at: null });
    assert.equal(cols.created_at, null);
  });
});
