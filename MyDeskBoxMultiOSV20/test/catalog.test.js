'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/shared/catalog');

test('splits folders, shortcuts, and documents into separate boxes', () => {
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
  assert.equal(made[0].x, 1600 - 280 - 24, 'the first box is placed on the right side of the screen');
});

test('classifies documents, media, and shortcuts by extension', () => {
  assert.equal(catalog.kindOf({ name: '보고서.hwp' }), 'document');
  assert.equal(catalog.kindOf({ name: '표.xlsx' }), 'document');
  assert.equal(catalog.kindOf({ name: '영상.MP4' }), 'media');
  assert.equal(catalog.kindOf({ name: '사이트.url' }), 'shortcut');
  assert.equal(catalog.kindOf({ name: '앱.desktop' }), 'shortcut');
  assert.equal(catalog.kindOf({ name: 'setup.exe' }), 'other');
  assert.equal(catalog.kindOf(null), 'other');
});

test('shell items go into the system box even if they are folders', () => {
  assert.equal(catalog.kindOf({ name: '휴지통', path: 'shell:RecycleBinFolder', directory: true }), 'system');
  assert.equal(catalog.kindOf({ name: '내 PC', shell: true }), 'system');
});

test('assigns each kind its predefined theme', () => {
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

test('wraps to the column on the left when exceeding screen height', () => {
  const files = [
    { name: 'A', path: 'C:/Desktop/A', directory: true },
    { name: 'B.lnk', path: 'C:/Desktop/B.lnk' },
    { name: 'C.txt', path: 'C:/Desktop/C.txt' },
  ];
  const made = catalog.planFences(files, [], { x: 10, y: 20, width: 900, height: 280 }, (kind) => kind);
  assert.ok(made.length >= 2);
  assert.ok(made[1].x < made[0].x, 'the second box is to the left of the first');
  assert.equal(made[1].y, 20 + 24);
});

test('more items make the box taller', () => {
  const files = Array.from({ length: 6 }, (_, i) => ({ name: `폴더${i}`, path: `C:/Desktop/폴더${i}`, directory: true }));
  const [fence] = catalog.planFences(files, [], { x: 0, y: 0, width: 1600, height: 1200 }, (kind) => kind);
  assert.ok(fence.h > 200);
  assert.ok(fence.h <= 560);
  assert.equal(fence.items.length, 6);
});

test('empty kinds do not create a box', () => {
  const made = catalog.planFences(
    [{ name: 'Only.lnk', path: 'C:/Desktop/Only.lnk' }],
    [],
    { x: 0, y: 0, width: 800, height: 600 },
    (kind) => kind
  );
  assert.equal(made.length, 1);
  assert.equal(made[0].title, 'shortcut');
});
