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

test('옮기는 동안 튀어나온 박스 아이콘만 다시 치운다', () => {
  const shown = { x: 40, y: 40 };
  const parked = { x: 20000, y: 2000 };
  assert.equal(pick.dragIconAction(shown, { wanted: true, known: true, dragging: true, cursorOnIt: false }), 'park');
  assert.equal(pick.dragIconAction(shown, { wanted: true, known: true, dragging: true, cursorOnIt: true }), 'leave');
  assert.equal(pick.dragIconAction(shown, { wanted: false, known: false, dragging: true }), 'leave');
  assert.equal(pick.dragIconAction(parked, { wanted: false, known: false, dragging: true }), 'leave');
  assert.equal(pick.dragIconAction(parked, { wanted: false, known: false, dragging: false }), 'restore');
  assert.equal(pick.dragIconAction(shown, { wanted: true, known: true, dragging: false }), 'park');
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

test('이 컴퓨터의 휴지통은 셸 항목으로 잡히고 그 자리가 맞다', { skip: process.platform !== 'win32' }, (t) => {
  const desktop = require('../src/main/desktop/windows');
  const listed = desktop.debugList() || [];
  const live = listed.find((icon) => icon.name === '휴지통');
  if (!live) {
    t.skip('휴지통이 이미 박스 안으로 들어가 바탕화면에 없다');
    return;
  }
  const atIcon = pick.pickIcon(listed, { x: live.x + 20, y: live.y + 20 });
  assert.equal(atIcon.name, '휴지통');
  const shells = desktop.shellItems();
  assert.deepEqual(
    pick.shellPathFor(atIcon.name, shells, sameName),
    { name: '휴지통', path: 'shell:RecycleBinFolder' }
  );
});
