// API errors carry a code and Korean / English texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { serializeError } = require('../core/api.js');

test('known messages get a code and a Korean text', () => {
  const e = serializeError(new Error('Project not found'));
  assert.equal(e.code, 'NOT_FOUND');
  assert.equal(e.text.en, 'Project not found');
  assert.equal(e.text.ko, '프로젝트를 찾을 수 없습니다.');
  const cron = serializeError(new Error('Bad cron minute field: "x"'));
  assert.equal(cron.code, 'BAD_REQUEST');
  assert.equal(cron.text.ko, 'Cron minute 필드가 잘못되었습니다: "x"');
});

test('an error keeps its own code and text', () => {
  const own = serializeError(Object.assign(new Error('x'), { code: 'CLOSED', text: { en: 'Closed.', ko: '닫힘.' } }));
  assert.deepEqual(own, { code: 'CLOSED', message: 'x', text: { en: 'Closed.', ko: '닫힘.' } });
  const coded = serializeError(Object.assign(new Error('nope'), { code: 'FORBIDDEN' }));
  assert.equal(coded.code, 'FORBIDDEN');
  assert.match(coded.text.ko, /권한이 없습니다/);
});

test('unknown errors fall back to ERROR with the message', () => {
  const e = serializeError(new Error('Something odd'));
  assert.equal(e.code, 'ERROR');
  assert.equal(e.text.ko, 'Something odd');
});
