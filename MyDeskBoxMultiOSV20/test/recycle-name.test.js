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

test('recycling a same-named item uses flags that do not rename it', () => {
  const flags = recycle.recycleDeleteFlags();
  assert.equal(flags & 0x0008, 0x0008, 'must not keep a separate item on name collision');
  assert.equal(flags & 0x0010, 0x0010, 'must ask before replacing');
  assert.equal(flags & 0x0040, 0x0040, 'must not leave it in the Recycle Bin');
});

test('reads the original name from a $I file', () => {
  const original = 'C:\\Users\\나\\Desktop\\노트.txt';
  assert.equal(recycle.nameFromInfo(infoFile(original)), original);
});

test('returns true when the Recycle Bin folder has the same name', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-bin-'));
  const sid = path.join(root, 'S-1-5-21');
  fs.mkdirSync(sid);
  fs.writeFileSync(path.join(sid, '$IABC123.txt'), infoFile('D:\\Work\\노트.txt'));
  fs.writeFileSync(path.join(sid, '$RABC123.txt'), '버린 내용');

  assert.equal(recycle.hasNameIn(root, '노트.txt'), true);
  assert.equal(recycle.hasNameIn(root, '다른.txt'), false);
});
