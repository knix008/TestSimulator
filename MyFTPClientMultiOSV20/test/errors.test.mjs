// Structured error popup: friendly text, labelled facts, stack kept aside.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeError, formatErrorCopy } from '../src/lib/errors.js';
import { setLanguage, t } from '../src/lib/i18n.js';

test('describeError: a short localised string stays a one-line dialog', () => {
  setLanguage('ko');
  const r = describeError('호스트를 입력하세요.');
  assert.equal(r.message, '호스트를 입력하세요.');
  assert.deepEqual(r.fields, []);
  assert.equal(r.detail, '');
});

test('describeError: connection refused becomes a short explanation plus facts', () => {
  setLanguage('ko');
  const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED', syscall: 'connect' });
  err.stack = `${err.message}\n    at connect (net.js:1:1)\n    at Client.access (basic-ftp.js:2:2)`;
  const r = describeError(err);
  assert.equal(r.message, t('err_refused'));
  assert.deepEqual(r.fields.map((f) => [f.key, f.value]), [
    ['code', 'ECONNREFUSED'],
    ['target', '127.0.0.1:1'],
    ['syscall', 'connect'],
    ['original', 'connect ECONNREFUSED 127.0.0.1:1'],
  ]);
  assert.match(r.detail, /at connect/);
  assert.doesNotMatch(r.message, /ECONNREFUSED/);
});

test('describeError: job detail blob (code / path / stack) is parsed', () => {
  setLanguage('en');
  const extra = [
    'code: ENOENT',
    'path: C:\\dl\\missing.txt',
    'Error: ENOENT: no such file or directory, open \'C:\\dl\\missing.txt\'',
    '    at open (node:fs:1:1)',
  ].join('\n');
  const r = describeError('ENOENT: no such file or directory, open \'C:\\dl\\missing.txt\'', extra);
  assert.equal(r.message, t('err_enoent'));
  assert.equal(r.fields.find((f) => f.key === 'code').value, 'ENOENT');
  assert.equal(r.fields.find((f) => f.key === 'path').value, 'C:\\dl\\missing.txt');
  assert.match(r.detail, /at open/);
});

test('describeError: FTP 530 login is explained, reply kept as a fact', () => {
  setLanguage('ko');
  const r = describeError('530 Login incorrect');
  assert.equal(r.message, t('err_login'));
  assert.equal(r.fields.find((f) => f.key === 'reply').value, '530 Login incorrect');
});

test('describeError: FTPS against a plain server mentions TLS', () => {
  setLanguage('en');
  const r = describeError('502 TLS not supported by this server');
  assert.equal(r.message, t('err_tls'));
  assert.equal(r.fields.find((f) => f.key === 'reply').value, '502 TLS not supported by this server');
});

test('describeError: empty input has a fallback', () => {
  setLanguage('ko');
  const r = describeError(null);
  assert.equal(r.message, t('error_unexpected'));
});

test('formatErrorCopy: title, summary, facts, then technical details', () => {
  setLanguage('en');
  const spec = {
    title: 'Connection error',
    ...describeError(Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:21'), { code: 'ECONNREFUSED' })),
  };
  spec.detail = '    at connect (net.js:1:1)';
  const text = formatErrorCopy(spec);
  assert.match(text, /Connection error/);
  assert.match(text, /The server refused the connection/);
  assert.match(text, /Code: ECONNREFUSED/);
  assert.match(text, /Technical details:/);
  assert.match(text, /at connect/);
});
