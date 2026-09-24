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

test('확장자로 문서, 영상, 바로가기를 가른다', () => {
  assert.equal(catalog.kindOf({ name: '보고서.hwp' }), 'document');
  assert.equal(catalog.kindOf({ name: '표.xlsx' }), 'document');
  assert.equal(catalog.kindOf({ name: '영상.MP4' }), 'media');
  assert.equal(catalog.kindOf({ name: '사이트.url' }), 'shortcut');
  assert.equal(catalog.kindOf({ name: '앱.desktop' }), 'shortcut');
  assert.equal(catalog.kindOf({ name: 'setup.exe' }), 'other');
  assert.equal(catalog.kindOf(null), 'other');
});

test('셸 항목은 폴더여도 시스템 박스에 넣는다', () => {
  assert.equal(catalog.kindOf({ name: '휴지통', path: 'shell:RecycleBinFolder', directory: true }), 'system');
  assert.equal(catalog.kindOf({ name: '내 PC', shell: true }), 'system');
});

test('종류마다 정해 둔 테마를 붙인다', () => {
  const files = [
    { name: 'Work', path: 'C:/Desktop/Work', directory: true },
    { name: '노트.txt', path: 'C:/Desktop/노트.txt' },
    { name: '사진.png', path: 'C:/Desktop/사진.png' },
  ];
  const made = catalog.planFences(files, [{ name: '휴지통', path: 'shell:RecycleBinFolder' }], null, (kind) => kind);
  const themeOf = Object.fromEntries(made.map((fence) => [fence.title, fence.theme]));
  assert.equal(themeOf.folder, 'teal');
  assert.equal(themeOf.document, 'gold');
  assert.equal(themeOf.media, 'sunset');
  assert.equal(themeOf.system, 'night');
});

test('화면 높이를 넘기면 왼쪽 열로 넘어간다', () => {
  const files = [
    { name: 'A', path: 'C:/Desktop/A', directory: true },
    { name: 'B.lnk', path: 'C:/Desktop/B.lnk' },
    { name: 'C.txt', path: 'C:/Desktop/C.txt' },
  ];
  const made = catalog.planFences(files, [], { x: 10, y: 20, width: 900, height: 280 }, (kind) => kind);
  assert.ok(made.length >= 2);
  assert.ok(made[1].x < made[0].x, '둘째 박스는 첫째보다 왼쪽이다');
  assert.equal(made[1].y, 20 + 24);
});

test('항목이 많으면 박스가 더 길어진다', () => {
  const files = Array.from({ length: 6 }, (_, i) => ({ name: `폴더${i}`, path: `C:/Desktop/폴더${i}`, directory: true }));
  const [fence] = catalog.planFences(files, [], { x: 0, y: 0, width: 1600, height: 1200 }, (kind) => kind);
  assert.ok(fence.h > 200);
  assert.ok(fence.h <= 560);
  assert.equal(fence.items.length, 6);
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
