'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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

test('휴지통 경로는 파일이 아니어도 바탕화면 항목이다', () => {
  assert.equal(files.isShellItem('shell:RecycleBinFolder'), true);
  assert.equal(files.isOnDesktop('shell:RecycleBinFolder'), true);
  assert.equal(files.isShellItem('C:/Desktop/노트.txt'), false);
  assert.equal(files.isShellItem(''), false);
  assert.equal(files.isShellItem(null), false);
});

test('숨김 파일과 바탕화면 설정 파일은 목록에서 뺀다', () => {
  const names = files.listDesktopFiles().map((file) => file.name.toLowerCase());
  assert.equal(names.includes('desktop.ini'), false);
  assert.equal(names.includes('.localized'), false);
  assert.equal(names.includes('.ds_store'), false);
  assert.equal(names.some((name) => name.startsWith('.')), false);
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

// 계측으로 잡은 것이다. LVM_SETWORKAREAS 를 한 번 보내면 바탕화면 아이콘의 그림이
// 모두 사라지고 이름만 남는다. 탐색기를 다시 띄우기 전에는 돌아오지 않는다.
// 앱을 켤 때마다 normalizeList 가 이것을 보내고 있었다.
// 시험: 탐색기를 새로 띄우고 앱을 켠 뒤 27개 중 그림이 보이는 것을 세었다.
//   아무것도 안 함        -> 27개
//   이 메시지만 보냄      -> 0개
//   아이콘 자리잡기만     -> 27개
//   빼고 전부 켬          -> 27개
test('바탕화면 아이콘 영역을 건드리지 않는다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.doesNotMatch(source, /SendMessage\w*\([^)]*LVM_SETWORKAREAS/, '아이콘 그림을 지우는 메시지가 되돌아왔다');
});

// 담는다는 것은 그 파일을 박스 폴더로 옮기는 일이다. 바탕화면 아이콘은 밀어내기만 한다.
// 담긴 파일은 바탕화면 폴더에서 빠져 아이콘이 아예 없으므로 자리를 잡아 줄 일도 없다.
test('아이콘은 밀어내기만 하고 담는 일은 폴더가 맡는다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.match(source, /function nudge\(blocks, live\)/, '박스 자리의 아이콘을 밀어내는 길이 없다');
  assert.equal(/function layoutGroups\(/.test(source), false, '아이콘을 박스 자리로 모으는 길이 남아 있다');
  assert.equal(/function behindIcons\(/.test(source), false, '아이콘 층 뒤에 판을 넣는 길이 남아 있다');

  // 자동 정렬이 켜져 있으면 탐색기가 밀어낸 자리를 곧바로 되돌린다.
  assert.match(source, /function manualArrange\(list\)[\s\S]*?turnedOffAutoArrange = true/, '끈 것을 적어 두지 않는다');
  assert.match(source, /function restoreArrange\(\)[\s\S]*?LVS_AUTOARRANGE/, '자동 정렬을 되돌리지 않는다');

  // 박스를 격자에 맞추려면 칸 크기를 알아야 한다.
  assert.match(source, /function gridInfo\(\)/, '바탕화면 격자를 재는 길이 없다');

  // 사용자의 파일에는 숨김 속성을 붙이지 않는다. 보관함 폴더 하나만 감춘다.
  assert.equal(/function stashFile/.test(source), false, '파일을 바탕화면 밖으로 옮기는 길이 남아 있다');
  assert.equal(/function hideFile\(/.test(source), false, '파일에 숨김 속성을 붙이는 길이 남아 있다');
  assert.match(source, /function hidePath\(target\)/, '보관함 폴더를 감추는 길이 없다');
});

test('예전 판이 치워 둔 파일은 되돌릴 수 있다', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  assert.equal(typeof desktop.stashFile, 'undefined', '파일을 치우는 길이 아직 열려 있다');
  assert.equal(typeof desktop.unstashFile, 'function', '되돌릴 길이 없다');
});

// 박스는 제 폴더에서 돌아간다. 바탕화면 아이콘은 이제 만지지 않는다.
// 자리를 옮기거나 층을 감추면 탐색기와 끝나지 않는 다툼이 생긴다.
test('바탕화면 아이콘을 옮기거나 감추지 않는다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.equal(/function gather\(/.test(source), false, '아이콘을 거두는 길이 남아 있다');
  assert.equal(/function keepHidden\(/.test(source), false, '되치우는 길이 남아 있다');
  assert.equal(/function holdParked\(/.test(source), false, '쫓아다니며 되치우는 길이 남아 있다');
  assert.equal(
    /LVM_SETEXTENDEDLISTVIEWSTYLE, BigInt\(LVS_EX_SNAPTOGRID\), 0n/.test(source),
    false,
    '격자에 맞춤을 끄고 있다. 그 메시지가 전체 정렬을 부른다'
  );
});

// 예전 판으로 쓰던 사람이 올라오면 그때 해 둔 것이 남아 있다. 한 번은 되돌려야 한다.
test('예전 판이 해 둔 것을 되돌리는 길은 남겨 둔다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.match(source, /function homeAll/, '화면 밖 아이콘을 제자리로 보내는 길이 없다');
  assert.match(source, /function showLayer/, '감춰 둔 아이콘 층을 되살리는 길이 없다');
  assert.match(source, /function release\(items\)[\s\S]*?showLayer\(true\)/, '되돌릴 때 층을 되살리지 않는다');
  assert.match(source, /function release\(items\)[\s\S]*?homeAll\(\)/, '되돌릴 때 아이콘 자리를 되돌리지 않는다');
});
