'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pick = require('../src/shared/deskpick');
const { sameName } = require('../src/main/desktop/files');

const bin = { index: 0, name: '휴지통', x: 14, y: 982 };
const folder = { index: 1, name: 'Projects', x: 14, y: 80 };

test('앞 창이 다른 프로그램이어도 커서 아래가 바탕화면이면 아이콘을 집는다', () => {
  assert.equal(pick.isDesktopTarget('SysListView32', 'Chrome_WidgetWin_1'), true);
  assert.equal(pick.isDesktopTarget('Progman', 'Progman'), true);
  assert.equal(pick.isDesktopTarget('CabinetWClass', 'Chrome_WidgetWin_1'), false);
});

test('다른 프로그램 창만 끌어 낼 대상으로 본다', () => {
  assert.equal(pick.isForeignTarget('Notepad', false), true);
  assert.equal(pick.isForeignTarget('Chrome_WidgetWin_1', false), true);
  assert.equal(pick.isForeignTarget('CabinetWClass', false), true);
  assert.equal(pick.isForeignTarget('Chrome_WidgetWin_1', true), false, '우리 창을 다른 프로그램으로 본다');
  assert.equal(pick.isForeignTarget('Progman', false), false, '바탕화면을 다른 프로그램으로 본다');
  assert.equal(pick.isForeignTarget('SysListView32', false), false);
  assert.equal(pick.isForeignTarget('WorkerW', false), false);
  assert.equal(pick.isForeignTarget('SHELLDLL_DefView', false), false);
  assert.equal(pick.isForeignTarget('Shell_TrayWnd', false), false, '작업 표시줄을 다른 프로그램으로 본다');
  assert.equal(pick.isForeignTarget('Shell_SecondaryTrayWnd', false), false);
  assert.equal(pick.isForeignTarget('', false), false);
  assert.equal(pick.isForeignTarget(null, false), false);
  assert.equal(pick.isSurfaceWindow({ ours: false, visible: true }), true);
  assert.equal(pick.isSurfaceWindow({ ours: true, visible: true }), false, '우리 창을 커서 아래로 본다');
  assert.equal(pick.isSurfaceWindow({ ours: false, visible: false }), false);
  assert.equal(pick.isSurfaceWindow({ ours: false, visible: true, cloaked: true }), false, '숨겨 둔 창을 다른 프로그램으로 본다');
  assert.equal(pick.isSurfaceWindow({ ours: false, visible: true, transparent: true }), false, '마우스를 통과시키는 창을 다른 프로그램으로 본다');
  assert.equal(pick.isSurfaceWindow(null), false);
});

test('바탕화면 창 종류면 앞 창이 달라도 바탕화면으로 본다', () => {
  assert.equal(pick.isDesktopTarget('SHELLDLL_DefView', 'Notepad'), true);
  assert.equal(pick.isDesktopTarget('WorkerW', ''), true);
  assert.equal(pick.isDesktopTarget('', 'Progman'), true);
  assert.equal(pick.isDesktopTarget('', ''), false);
  assert.equal(pick.isDesktopTarget('Button', 'CabinetWClass'), false);
});

test('그림에서 조금 벗어난 글자 위도 그 아이콘으로 집는다', () => {
  const hit = pick.pickIcon([folder, bin], { x: bin.x + 24, y: bin.y + 70 });
  assert.equal(hit.name, '휴지통');
});

test('어느 아이콘에도 가깝지 않으면 집지 않는다', () => {
  assert.equal(pick.pickIcon([folder], { x: folder.x + 200, y: folder.y }), null);
  assert.equal(pick.pickIcon([], { x: 0, y: 0 }), null);
  assert.equal(pick.pickIcon(null, { x: 0, y: 0 }), null);
});

test('바로 맞은 칸이 없으면 가장 가까운 아이콘을 집는다', () => {
  const near = pick.pickIcon([folder, bin], { x: folder.x + 90, y: folder.y + 24 });
  assert.equal(near.name, 'Projects');
});

test('휴지통 그림 위를 누르면 그 아이콘이 잡힌다', () => {
  const hit = pick.pickIcon([folder, bin], { x: 30, y: 1000 });
  assert.equal(hit.name, '휴지통');
  assert.equal(pick.pickIcon([folder, bin], { x: 800, y: 400 }), null);
});

test('아이콘 옆의 빈 곳에서 시작한 사각형만 새 박스이다', () => {
  const icons = [folder];
  const beside = { x: folder.x + 24 + 80, y: folder.y + 20 };
  assert.equal(pick.iconAt(icons, beside), null);
  assert.equal(pick.iconAt(icons, { x: folder.x + 24, y: folder.y + 20 }).name, 'Projects');
  const empty = { x: 400, y: 400, width: 200, height: 160 };
  assert.equal(pick.shouldOfferFence(empty, icons), true);
  assert.equal(pick.shouldOfferFence({ x: 0, y: 40, width: 200, height: 160 }, icons), false);
});

test('빈 곳을 끌면 박스를 물을 수 있고, 아이콘을 걸치면 고르기이다', () => {
  const icons = [folder, bin];
  const empty = { x: 400, y: 400, width: 200, height: 160 };
  const overFolder = { x: 0, y: 60, width: 200, height: 160 };
  const tiny = { x: 400, y: 400, width: 40, height: 30 };
  assert.equal(pick.shouldOfferFence(empty, icons), true);
  assert.equal(pick.shouldOfferFence(overFolder, icons), false);
  assert.equal(pick.shouldOfferFence(tiny, icons), false);
  assert.equal(pick.shouldOfferFence(overFolder, [{ x: 20000, y: 2000 }]), true);
  assert.equal(pick.shouldOfferFence(null, icons), false);
});

test('모서리만 걸친 아이콘도 여러 개 고르기로 본다', () => {
  const icon = { x: 100, y: 100 };
  const graze = { x: 160, y: 170, width: 200, height: 120 };
  const miss = { x: 172, y: 100, width: 200, height: 120 };
  assert.equal(pick.rectCoversIcon(graze, [icon]), true);
  assert.equal(pick.rectCoversIcon(miss, [icon]), false);
  assert.equal(pick.rectCoversIcon(graze, [{ x: -2000, y: 100 }]), false);
});

test('여덟 픽셀을 끌면 담고, 그 미만이나 빈 좌표는 담지 않는다', () => {
  assert.equal(pick.movedEnough({ x: 0, y: 0 }, { x: 8, y: 0 }), true);
  assert.equal(pick.movedEnough({ x: 0, y: 0 }, { x: 3, y: 4 }), false);
  assert.equal(pick.movedEnough(null, { x: 20, y: 20 }), false);
  assert.equal(pick.movedEnough({ x: 0, y: 0 }, null), false);
});

test('이름이 비슷해도 다르면 셸 경로를 주지 않는다', () => {
  const shells = [{ name: '휴지통', path: 'shell:RecycleBinFolder' }];
  assert.equal(pick.shellPathFor('휴지통2', shells, sameName), null);
  assert.equal(pick.shellPathFor('휴지통', [], sameName), null);
  assert.equal(pick.shellPathFor('휴지통', null, sameName), null);
});

test('휴지통을 조금 끌면 박스에 넣을 수 있고, 제자리 클릭은 넣지 않는다', () => {
  assert.equal(pick.movedEnough({ x: 14, y: 982 }, { x: 40, y: 982 }), true);
  assert.equal(pick.movedEnough({ x: 14, y: 982 }, { x: 16, y: 984 }), false);
});

test('휴지통 이름은 셸 경로로 연결된다', () => {
  const shells = [{ name: '휴지통', path: 'shell:RecycleBinFolder' }];
  assert.deepEqual(
    pick.shellPathFor('휴지통', shells, sameName),
    { name: '휴지통', path: 'shell:RecycleBinFolder' }
  );
  assert.equal(pick.shellPathFor('Projects', shells, sameName), null);
});

// shellItems 는 '지금 바탕화면에 나와 있어 담을 수 있는' 셸 항목만 준다.
// 휴지통이 이미 박스에 담겨 있으면 빈 목록이 맞다. 두 경우 모두 지켜야 할 것을 본다.
test('셸 항목 목록은 바탕화면에 나와 있는 것과 어긋나지 않는다', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  const shells = desktop.shellItems();
  const listed = desktop.debugList() || [];

  for (const item of shells) {
    assert.match(item.path, /^shell:/, '셸 경로가 아닌 것이 섞였다');
    assert.ok(item.name.trim(), '이름이 빈 셸 항목이 있다');
    assert.ok(
      listed.some((icon) => sameName(icon.name, item.name)),
      `${item.name} 은 바탕화면에 없는데 담을 수 있다고 한다`
    );
    // 바탕화면에서 집은 이름으로 다시 셸 경로를 찾을 수 있어야 담긴다.
    assert.deepEqual(pick.shellPathFor(item.name, shells, sameName), item);
  }

  // 담을 수 있는 것이 없으면 빈 목록이어야 한다. 엉뚱한 것을 만들어 내면 안 된다.
  if (!shells.length) assert.deepEqual(shells, []);
});

// 박스 창 위에서 누른 것을 바탕화면 끌기로 보면,
// 박스 밑에 가려 있던 아이콘을 끌어다 박스에 넣어 버린다.
test('커서 아래가 박스 창이면 바탕화면 끌기로 보지 않는다', () => {
  assert.equal(pick.isDesktopTarget('Chrome_WidgetWin_1', 'Progman'), false, '앞 창만 보고 바탕화면이라 했다');
  assert.equal(pick.isDesktopTarget('SysListView32', 'Chrome_WidgetWin_1'), true);
  // 커서 아래를 읽지 못했을 때만 앞 창을 대신 본다.
  assert.equal(pick.isDesktopTarget('', 'Progman'), true);
  assert.equal(pick.isDesktopTarget('', 'Chrome_WidgetWin_1'), false);
});

// 바탕화면 두 번 누르기.
// 사이 시간은 사용자가 제어판에서 정한 값을 따른다. Windows 기본값은 500밀리초다.
test('보통 속도로 두 번 누른 것을 두 번으로 센다', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  assert.equal(taps.press(1000, { x: 200, y: 300 }), false, '첫 누름은 아직 아니다');
  assert.equal(taps.press(1400, { x: 201, y: 302 }), true, '400밀리초 뒤는 두 번 누른 것이다');
});

test('너무 느리게 누른 것은 두 번으로 세지 않는다', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  taps.press(1000, { x: 200, y: 300 });
  assert.equal(taps.press(1600, { x: 200, y: 300 }), false);
});

test('멀리 떨어진 두 번째 누름은 두 번으로 세지 않는다', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  taps.press(1000, { x: 200, y: 300 });
  assert.equal(taps.press(1200, { x: 260, y: 300 }), false, '자리가 멀면 다른 클릭이다');
});

test('세 번 눌러도 한 번만 센다', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  taps.press(1000, { x: 10, y: 10 });
  assert.equal(taps.press(1150, { x: 10, y: 10 }), true);
  assert.equal(taps.press(1300, { x: 10, y: 10 }), false, '세 번째가 또 세졌다');
});

test('바탕화면이 아닌 곳을 누르면 세던 것을 버린다', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 4, y: 4 } });
  taps.press(1000, { x: 10, y: 10 });
  taps.forget();
  assert.equal(taps.press(1150, { x: 10, y: 10 }), false, '사이에 딴 곳을 눌렀는데 세졌다');
  assert.equal(taps.pending(), 1150);
});

// 운영체제가 알려 준 값을 그때그때 읽어야 설정을 바꿔도 따라간다.
test('사이 시간과 허용 범위를 부를 때마다 읽는다', () => {
  let limit = 200;
  const taps = pick.createDeskTaps({ limit: () => limit, slop: () => ({ x: 4, y: 4 }) });
  taps.press(1000, { x: 10, y: 10 });
  assert.equal(taps.press(1400, { x: 10, y: 10 }), false, '짧은 설정에서는 세지 않는다');

  // 설정을 늘린 뒤 처음부터 다시 센다.
  limit = 800;
  taps.forget();
  taps.press(2000, { x: 10, y: 10 });
  assert.equal(taps.press(2400, { x: 10, y: 10 }), true, '설정을 늘렸는데 따라가지 않는다');
});

test('값을 주지 않으면 500밀리초와 4픽셀로 본다', () => {
  const taps = pick.createDeskTaps();
  taps.press(1000, { x: 10, y: 10 });
  assert.equal(taps.press(1490, { x: 12, y: 12 }), true);
});

// 빈 바탕화면을 두 번 누르는 것은 아이콘을 두 번 눌러 여는 것만큼 정확할 까닭이 없다.
// 실제로 재 보니 두 번 누르는 사이 손이 20픽셀 넘게 움직였다.
test('손이 조금 움직여도 두 번으로 센다', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 28, y: 28 } });
  taps.press(1000, { x: 1258, y: 998 });
  assert.equal(taps.press(1185, { x: 1252, y: 1021 }), true, '23픽셀 움직인 것을 두 번으로 세지 않았다');
});

test('아주 멀리 떨어진 것은 그래도 두 번이 아니다', () => {
  const taps = pick.createDeskTaps({ limit: 500, slop: { x: 28, y: 28 } });
  taps.press(1000, { x: 200, y: 300 });
  assert.equal(taps.press(1150, { x: 200, y: 400 }), false, '100픽셀 떨어진 것은 다른 클릭이다');
});
