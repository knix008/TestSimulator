'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const files = require('../src/main/desktop/files');

test('바탕화면 폴더를 적어도 하나는 찾는다', () => {
  const dirs = files.desktopDirectories();
  assert.ok(dirs.length >= 1, '바탕화면 폴더를 찾지 못했다');
  for (const dir of dirs) assert.equal(path.isAbsolute(dir), true);
});

test('바탕화면에 있는 항목만 바탕화면 아이콘과 짝짓는다', () => {
  const [desk] = files.desktopDirectories();
  assert.ok(files.isOnDesktop(path.join(desk, '아무거나.lnk')), '바탕화면 파일을 알아본다');
  assert.equal(files.isOnDesktop(path.join(desk, '하위폴더', 'a.lnk')), false, '하위 폴더는 바탕화면이 아니다');
  assert.equal(files.isOnDesktop(path.join(os.homedir(), 'Documents', 'a.lnk')), false);
  assert.equal(files.isOnDesktop(''), false);
  assert.equal(files.isOnDesktop(null), false);
});

test('바로가기 이름은 확장자를 떼고 견준다', () => {
  assert.equal(files.labelOf('MyClock.lnk'), 'MyClock');
  assert.equal(files.labelOf('사이트.url'), '사이트');
  assert.equal(files.labelOf('보고서.txt'), '보고서.txt');

  assert.equal(files.sameName('MyClock', 'MyClock.lnk'), true);
  assert.equal(files.sameName('myclock', 'MyClock.lnk'), true, '대소문자는 가리지 않는다');
  assert.equal(files.sameName('MyClock', 'MyClock2.lnk'), false);
  assert.equal(files.sameName('', 'MyClock.lnk'), false);
});
