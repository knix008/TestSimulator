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

  // 파일은 옮기지 않고 숨기지도 않는다. 바탕화면 아이콘만 박스 칸으로 옮긴다.
  assert.equal(/function stashFile/.test(source), false, '파일을 바탕화면 밖으로 옮기는 길이 남아 있다');
  assert.equal(/function hideFile\(/.test(source), false, '파일을 무조건 숨기는 길이 남아 있다');
  assert.equal(/function coverKept\(/.test(source), false, '숨김 속성으로 가리는 길이 남아 있다');
  const seat = source.slice(source.indexOf('function seatKept'), source.indexOf('function syncShellIcons'));
  assert.match(seat, /function seatKept\(/, '박스 칸으로 아이콘을 옮기는 길이 없다');
  assert.doesNotMatch(seat, /FILE_ATTRIBUTE_HIDDEN/, '칸으로 옮기면서 숨김 속성을 붙인다');
  const follow = source.slice(source.indexOf('function followSeats'), source.indexOf('function syncShellIcons'));
  assert.doesNotMatch(follow, /sendPos\(/, '창을 덮기 전에 아이콘을 옮기면 밖에 비친다');
  assert.doesNotMatch(follow, /PostMessage/, '아이콘 자리를 던져 두면 늦게 따라온다');
  assert.doesNotMatch(follow, /InvalidateRect\(list, null/, '바탕 전체를 지우면 아이콘 그림이 늦어진다');
  assert.doesNotMatch(follow, /UpdateWindow/, '창을 덮기 전에 아이콘을 그리면 밖에 비친다');
  const paint = source.slice(source.indexOf('function paintFollow'), source.indexOf('function followReset'));
  assert.match(paint, /sendPos\(/, '창이 덮은 뒤에 아이콘 자리를 확정하지 않는다');
  const arm = source.slice(source.indexOf('function armFollow'), source.indexOf('function paintFollow'));
  assert.match(arm, /sendPos\(/, '창을 옮기기 전에 아이콘 자리를 바꿔 두지 않는다');
  assert.match(arm, /ValidateRect\(list, null\)/, '새 자리를 창보다 먼저 그리면 밖에 비친다');
  const fences = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'fences.js'), 'utf8');
  const bounds = fences.slice(fences.indexOf('function applyBounds'), fences.indexOf('function followSoon'));
  const armAt = bounds.indexOf('armFollow');
  const moveAt = bounds.indexOf('setBounds');
  const paintAt = bounds.indexOf('paintFollow');
  assert.ok(armAt >= 0 && armAt < moveAt && moveAt < paintAt, '옛 그림을 창보다 늦게 지우면 밖에 비친다');
  assert.match(source, /function hidePath\(target\)/, '보관함 폴더를 감추는 길이 없다');
  assert.match(source, /function roundWindow\([\s\S]*?applyRegion/, '모서리 밖을 창에서 빼지 않는다');
  assert.match(source, /function applyRegion\([\s\S]*?SetWindowRgn/, '모서리 밖을 창에서 빼지 않는다');
  assert.equal(source.includes('ACCENT_ENABLE_BLURBEHIND'), false, '흐림이 창 사각형 전체를 칠하면 모퉁이가 남는다');
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

// 바탕화면 빈 곳을 두 번 누르면 박스를 감추고, 다시 두 번 누르면 보여 준다.
// 이 길은 탐색기를 직접 두드리므로 검사에서 부를 수 없다. 조건이 제자리에 있는지 글로 본다.
test('두 번 누르기는 운영체제가 정한 시간을 따른다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');

  // 320밀리초처럼 박아 두면 보통 속도로 두 번 누른 것이 세지지 않는다.
  assert.match(source, /function doubleTime\(\)[\s\S]*?GetDoubleClickTime\(\)/, '사이 시간을 운영체제에게 묻지 않는다');
  assert.match(source, /function doubleSlop\(\)[\s\S]*?SM_CXDOUBLECLK/, '허용 범위를 운영체제에게 묻지 않는다');
  assert.doesNotMatch(source, /now - last < 320/, '사이 시간이 박혀 있다');

  // 뗌을 세면 빠른 손의 첫 클릭을 통째로 놓친다. 누름을 세야 한다.
  assert.match(source, /function watchDoubleClick\(onToggle\)[\s\S]*?if \(down && !wasDown\)/, '누름을 세지 않는다');
  // 자주 물어야 짧은 클릭을 놓치지 않는다.
  const every = /function watchDoubleClick\(onToggle\)[\s\S]*?\}, (\d+)\);/.exec(source);
  assert.ok(every && Number(every[1]) <= 20, `너무 뜸하게 묻는다: ${every && every[1]}밀리초`);

  // 커서 아래가 바탕화면이어야 한다. 앞 창만 보면 박스 위에서 누른 것도 잡힌다.
  assert.match(source, /function watchDoubleClick\(onToggle\)[\s\S]*?desktopAt\(pos\)/, '커서 아래를 보지 않는다');
  assert.match(source, /function watchDoubleClick\(onToggle\)[\s\S]*?cursorOnIcon\(\)/, '아이콘 위에서도 감춘다');
  // 세는 일은 순수한 셈에 맡긴다.
  assert.match(source, /createDeskTaps\(/, '두 번 누르기 셈을 쓰지 않는다');
});

test('두 번 누르기가 숨김을 뒤집도록 이어져 있다', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.match(main, /watchDoubleClick\(\(\) => host\.toggleHidden\(\)\)/, '두 번 눌러도 숨기지 않는다');
});

// 운영체제가 주는 4픽셀은 아이콘을 두 번 눌러 여는 잣대다.
// 빈 바탕화면을 두 번 누르는 데에 그만한 정확도를 요구하면 손이 조금만 움직여도 세지 않는다.
test('두 번 누르기 자리 범위를 넉넉히 잡는다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js'), 'utf8');
  assert.match(source, /SLOP_FLOOR = (\d+)/, '최소 범위가 없다');
  const floor = Number(/SLOP_FLOOR = (\d+)/.exec(source)[1]);
  assert.ok(floor >= 20, `자리 범위가 너무 좁다: ${floor}픽셀`);
  assert.match(source, /function doubleSlop\(\)[\s\S]*?SLOP_FLOOR/, '최소 범위를 쓰지 않는다');
});
