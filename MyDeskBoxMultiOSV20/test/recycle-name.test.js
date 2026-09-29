'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const recycle = require('../src/main/desktop/recycle-name');

function infoFile(original) {
  const chars = Buffer.from(`${original}\0`, 'utf16le');
  const head = Buffer.alloc(28);
  head.writeBigUInt64LE(2n, 0);
  head.writeUInt32LE(chars.length / 2, 24);
  return Buffer.concat([head, chars]);
}

test('같은 이름을 휴지통에 넣을 때는 바꾸지 않는 표시를 쓴다', () => {
  const flags = recycle.recycleDeleteFlags();
  assert.equal(flags & 0x0008, 0x0008, '이름 충돌 때 다른 항목으로 남기지 않는다');
  assert.equal(flags & 0x0010, 0x0010, '바꿀지 묻는다');
  assert.equal(flags & 0x0040, 0x0040, '휴지통에 남기지 않는다');
});

test('$I 파일에서 원래 이름을 읽는다', () => {
  const original = 'C:\\Users\\나\\Desktop\\노트.txt';
  assert.equal(recycle.nameFromInfo(infoFile(original)), original);
});

test('휴지통 폴더에 같은 이름이 있으면 참이다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-bin-'));
  const sid = path.join(root, 'S-1-5-21');
  fs.mkdirSync(sid);
  fs.writeFileSync(path.join(sid, '$IABC123.txt'), infoFile('D:\\Work\\노트.txt'));
  fs.writeFileSync(path.join(sid, '$RABC123.txt'), '버린 내용');

  assert.equal(recycle.hasNameIn(root, '노트.txt'), true);
  assert.equal(recycle.hasNameIn(root, '다른.txt'), false);
});
