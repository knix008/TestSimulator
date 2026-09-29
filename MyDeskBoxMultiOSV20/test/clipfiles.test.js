'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const clipfiles = require('../src/main/clipfiles');

test('파일 목록은 넓은 글자로 적었다가 그대로 읽힌다', () => {
  const buf = clipfiles.encodeDrop(['C:\\Users\\나\\Desktop\\노트.txt', 'D:\\Work\\a.txt']);
  assert.deepEqual(clipfiles.decodeDrop(buf), ['C:\\Users\\나\\Desktop\\노트.txt', 'D:\\Work\\a.txt']);
});

test('복사와 연결이 함께 켜진 것은 잘라내기가 아니다', () => {
  assert.equal(clipfiles.isCut(clipfiles.COPY), false);
  assert.equal(clipfiles.isCut(clipfiles.COPY | 4), false);
  assert.equal(clipfiles.isCut(clipfiles.MOVE), true);
  assert.equal(clipfiles.isCut(0), false);
});

test('메모리 클립보드는 복사와 잘라내기를 구분하고 비울 수 있다', () => {
  clipfiles.useMemory();
  assert.equal(clipfiles.write(['C:\\Desk\\a.txt'], clipfiles.COPY), true);
  assert.equal(clipfiles.read().cut, false);
  assert.equal(clipfiles.write(['C:\\Desk\\a.txt'], clipfiles.MOVE), true);
  assert.deepEqual(clipfiles.read().paths, ['C:\\Desk\\a.txt']);
  assert.equal(clipfiles.read().cut, true);
  clipfiles.clear();
  assert.deepEqual(clipfiles.read().paths, []);
});
