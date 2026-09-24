'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/shared/catalog');

test('폴더, 바로가기, 문서를 서로 다른 박스로 나눈다', () => {
  const files = [
    { name: 'Work', path: 'C:/Desktop/Work', directory: true },
    { name: 'Chrome.lnk', path: 'C:/Desktop/Chrome.lnk' },
    { name: '노트.txt', path: 'C:/Desktop/노트.txt' },
    { name: '사진.png', path: 'C:/Desktop/사진.png' },
    { name: 'data.bin', path: 'C:/Desktop/data.bin' },
  ];
  const shell = [{ name: '휴지통', path: 'shell:RecycleBinFolder' }];
  const made = catalog.planFences(files, shell, { x: 0, y: 0, width: 1600, height: 900 }, (kind) => kind);

  const byTitle = Object.fromEntries(made.map((fence) => [fence.title, fence.items.map((item) => item.name)]));
  assert.deepEqual(byTitle.folder, ['Work']);
  assert.deepEqual(byTitle.shortcut, ['Chrome.lnk']);
  assert.deepEqual(byTitle.document, ['노트.txt']);
  assert.deepEqual(byTitle.media, ['사진.png']);
  assert.deepEqual(byTitle.other, ['data.bin']);
  assert.deepEqual(byTitle.system, ['휴지통']);
  assert.equal(made[0].x, 1600 - 280 - 24, '첫 박스는 화면 오른쪽에 놓는다');
});

test('비어 있는 종류는 박스를 만들지 않는다', () => {
  const made = catalog.planFences(
    [{ name: 'Only.lnk', path: 'C:/Desktop/Only.lnk' }],
    [],
    { x: 0, y: 0, width: 800, height: 600 },
    (kind) => kind
  );
  assert.equal(made.length, 1);
  assert.equal(made[0].title, 'shortcut');
});
