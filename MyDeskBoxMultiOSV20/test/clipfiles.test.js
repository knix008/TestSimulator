'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const clipfiles = require('../src/main/clipfiles');

test('file list round-trips through wide-character encoding', () => {
  const buf = clipfiles.encodeDrop(['C:\\Users\\나\\Desktop\\노트.txt', 'D:\\Work\\a.txt']);
  assert.deepEqual(clipfiles.decodeDrop(buf), ['C:\\Users\\나\\Desktop\\노트.txt', 'D:\\Work\\a.txt']);
});

test('copy combined with link is not a cut', () => {
  assert.equal(clipfiles.isCut(clipfiles.COPY), false);
  assert.equal(clipfiles.isCut(clipfiles.COPY | 4), false);
  assert.equal(clipfiles.isCut(clipfiles.MOVE), true);
  assert.equal(clipfiles.isCut(0), false);
});

test('memory clipboard distinguishes copy from cut and can be cleared', () => {
  clipfiles.useMemory();
  assert.equal(clipfiles.write(['C:\\Desk\\a.txt'], clipfiles.COPY), true);
  assert.equal(clipfiles.read().cut, false);
  assert.equal(clipfiles.write(['C:\\Desk\\a.txt'], clipfiles.MOVE), true);
  assert.deepEqual(clipfiles.read().paths, ['C:\\Desk\\a.txt']);
  assert.equal(clipfiles.read().cut, true);
  clipfiles.clear();
  assert.deepEqual(clipfiles.read().paths, []);
});
