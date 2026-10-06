// Settings defaults (src/lib/settings.js), the error dialog's text (src/lib/errors.js) and the error
// shape the backend sends (core/api.js serializeError).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { SETTINGS_DEFAULTS, SETTINGS_KEYS, isTextFile } from '../src/lib/settings.js';
import { describeError } from '../src/lib/errors.js';

const require = createRequire(import.meta.url);
const { serializeError } = require('../core/api.js');

test('SETTINGS_KEYS are exactly the keys of the defaults', () => {
  assert.deepEqual(SETTINGS_KEYS, Object.keys(SETTINGS_DEFAULTS));
});

test('settings defaults: Korean, the midnight theme, confirm before delete', () => {
  assert.equal(SETTINGS_DEFAULTS.language, 'ko');
  assert.equal(SETTINGS_DEFAULTS.theme, 'midnight');
  assert.equal(SETTINGS_DEFAULTS.confirmDelete, true);
  assert.ok(SETTINGS_DEFAULTS.historyMax > 0);
  assert.ok(SETTINGS_DEFAULTS.prompt && typeof SETTINGS_DEFAULTS.prompt === 'object', 'a prompt theme');
});

test('settings defaults: the choices are values the settings dialog offers', () => {
  assert.ok(['app', 'viewer', 'editor', 'custom'].includes(SETTINGS_DEFAULTS.textOpen));
  assert.ok(['auto', 'lf', 'crlf'].includes(SETTINGS_DEFAULTS.termEol));
  assert.ok(['overwrite', 'newline', 'strip'].includes(SETTINGS_DEFAULTS.termCr));
});

test('isTextFile: the default list, any case', () => {
  for (const n of ['notes.txt', 'README.MD', 'app.jsx', 'run.ps1', 'a.b.json']) assert.equal(isTextFile(n), true, n);
  for (const n of ['photo.png', 'archive.zip', 'Makefile', '.gitignore', 'a.']) assert.equal(isTextFile(n), false, n);
});

test('isTextFile: a custom list separated by spaces, commas or semicolons', () => {
  assert.equal(isTextFile('a.foo', 'foo, bar;baz qux'), true);
  assert.equal(isTextFile('a.QUX', 'foo, bar;baz qux'), true);
  assert.equal(isTextFile('a.txt', 'foo bar'), false);
});

test('describeError: a plain message', () => {
  assert.deepEqual(describeError('Disk full'), { message: 'Disk full', detail: '' });
  assert.deepEqual(describeError('Disk full', 'more'), { message: 'Disk full', detail: 'more' });
});

test('describeError: nothing at all is an unexpected error', () => {
  assert.equal(describeError(null).message, '예상하지 못한 오류가 발생했습니다.');
});

test('describeError: code, path and syscall go to the details, the stack last', () => {
  const err = Object.assign(new Error('no access'), { code: 'EACCES', path: 'C:\\x', syscall: 'open' });
  const { message, detail } = describeError(err, 'while copying');
  assert.equal(message, 'no access');
  const lines = detail.split('\n');
  assert.deepEqual(lines.slice(0, 4), ['코드: EACCES', '경로: C:\\x', 'syscall: open', 'while copying']);
  assert.match(detail, /Error: no access/);
});

test('describeError: the generic ERROR code is not listed', () => {
  const err = { message: 'x', code: 'ERROR' };
  assert.equal(describeError(err).detail, '');
});

test('serializeError: code, message, path, syscall and stack', () => {
  const err = Object.assign(new Error('gone'), { code: 'ENOENT', path: '/a', syscall: 'stat' });
  const s = serializeError(err);
  assert.equal(s.code, 'ENOENT');
  assert.equal(s.message, 'gone');
  assert.equal(s.path, '/a');
  assert.equal(s.syscall, 'stat');
  assert.match(s.stack, /gone/);
});

test('serializeError: defaults for a bare error or nothing', () => {
  assert.deepEqual(serializeError(null), { code: 'UNKNOWN', message: 'Unknown error' });
  const s = serializeError(new Error('plain'));
  assert.equal(s.code, 'ERROR');
  assert.equal(s.path, undefined);
  assert.equal(serializeError('text').message, 'text');
});
