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

test('휴지통 그림 위를 누르면 그 아이콘이 잡힌다', () => {
  const hit = pick.pickIcon([folder, bin], { x: 30, y: 1000 });
  assert.equal(hit.name, '휴지통');
  assert.equal(pick.pickIcon([folder, bin], { x: 800, y: 400 }), null);
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

test('이 컴퓨터의 휴지통은 셸 항목으로 잡히고 그 자리가 맞다', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  const listed = desktop.debugList();
  const live = listed.find((icon) => icon.name === '휴지통');
  assert.ok(live, '바탕화면에 휴지통이 없다');
  const atIcon = pick.pickIcon(listed, { x: live.x + 20, y: live.y + 20 });
  assert.equal(atIcon.name, '휴지통');
  const shells = desktop.shellItems();
  assert.deepEqual(
    pick.shellPathFor(atIcon.name, shells, sameName),
    { name: '휴지통', path: 'shell:RecycleBinFolder' }
  );
});
