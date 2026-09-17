// Error dialog text (src/shared/error-format.js): message + copyable details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { describeError, summarize } = require('../src/shared/error-format.js');

test('describeError: Error with stack, code and context', () => {
  const err = new Error('spawn failed');
  err.code = 'ENOENT';
  err.syscall = 'spawn';
  err.path = 'C:\\nope\\bash.exe';
  const { message, details } = describeError(err, { context: 'shell' });
  assert.equal(message, 'spawn failed');
  assert.ok(details.startsWith('[shell]\nspawn failed'));
  assert.ok(details.includes('code: ENOENT · syscall: spawn · path: C:\\nope\\bash.exe'));
  assert.ok(details.includes('Error: spawn failed\n'));
  assert.ok(details.includes('    at ')); // the stack
});

test('describeError: strings, plain objects, causes, nothing', () => {
  assert.deepEqual(describeError('just text'), { message: 'just text', details: 'just text' });
  const plain = describeError({ message: 'ssh auth failed', level: 'client-authentication' });
  assert.equal(plain.message, 'ssh auth failed');
  assert.ok(plain.details.includes('level: client-authentication'));
  const withCause = describeError(new Error('outer', { cause: new Error('inner') }));
  assert.ok(withCause.details.includes('caused by: inner'));
  assert.equal(describeError(null).message, 'Unknown error');
  assert.equal(describeError(undefined).details, 'Unknown error');
  assert.equal(summarize({ a: 1 }), '{"a":1}');
  assert.equal(summarize(42), '42');
});

test('describeError: a bare name-only error and a TypeError keep their names', () => {
  const t = new TypeError('x is not a function');
  const d = describeError(t);
  assert.equal(d.message, 'x is not a function');
  assert.ok(d.details.includes('name: TypeError'));
  assert.ok(d.details.includes('TypeError: x is not a function'));
});
