'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

// 구분선을 뺀 모든 항목. 하위 메뉴까지 따라 들어간다.
function flatten(template, trail = '') {
  const out = [];
  for (const item of template) {
    if (item.type === 'separator') continue;
    const where = `${trail}${item.label}`;
    out.push({ ...item, where });
    if (Array.isArray(item.submenu)) out.push(...flatten(item.submenu, `${where} > `));
  }
  return out;
}

function openOne() {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  return loaded;
}

test('박스 메뉴의 모든 항목에 그림이 붙는다', () => {
  const { host, electron } = openOne();
  host.showMenu('a', null);
  const template = electron.menus.at(-1);
  const items = flatten(template);
  assert.ok(items.length >= 5);
  for (const item of items) {
    assert.ok(item.icon, `'${item.where}' 에 그림이 없다`);
    assert.ok(fs.existsSync(item.icon.path), `'${item.where}' 의 그림 파일이 없다: ${item.icon.path}`);
  }
});

test('아이콘을 눌러 연 메뉴에는 열기와 꺼내기가 그림과 함께 있다', () => {
  const { host, electron } = openOne();
  host.showMenu('a', 'C:/Users/me/Desktop/a.lnk');
  const items = flatten(electron.menus.at(-1));
  const labels = items.map((item) => item.label);
  assert.ok(labels.includes('열기'));
  assert.ok(labels.includes('바탕화면으로 꺼내기'));
  for (const item of items) assert.ok(item.icon, `'${item.where}' 에 그림이 없다`);
});

test('휴지통을 오른쪽 단추로 누르면 비우기가 있다', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.showMenu('a', 'shell:RecycleBinFolder');
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '휴지통 비우기');
  assert.ok(item, '휴지통 메뉴에 비우기가 없다');
  assert.ok(item.icon, '비우기에 그림이 없다');

  host.showMenu('a', 'C:/Desktop/노트.txt');
  const plain = flatten(electron.menus.at(-1)).map((entry) => entry.label);
  assert.equal(plain.includes('휴지통 비우기'), false);

  electron.setDialogAnswer(0);
  await item.click();
  assert.equal(desktop.calls.emptied, 1);
});

test('접힘 여부에 따라 글씨와 그림이 함께 바뀐다', () => {
  const { host, electron } = openOne();
  host.showMenu('a', null);
  const open = flatten(electron.menus.at(-1)).find((item) => item.label === '접기');
  assert.ok(open, '펼쳐진 박스에는 접기가 보인다');
  assert.match(open.icon.path, /collapse\.png$/);

  host.setCollapsed('a', true);
  host.showMenu('a', null);
  const closed = flatten(electron.menus.at(-1)).find((item) => item.label === '펼치기');
  assert.ok(closed, '접힌 박스에는 펼치기가 보인다');
  assert.match(closed.icon.path, /expand\.png$/);
});

test('트레이 메뉴에 설정이 있고 모든 항목에 그림이 붙는다', () => {
  const { installTray, electron } = openOne();
  installTray();
  const tray = electron.trays.at(-1);
  assert.ok(tray, '트레이가 만들어진다');
  assert.ok(fs.existsSync(tray.image.path), '트레이 그림 파일이 있어야 한다');

  const items = flatten(electron.menus.at(-1));
  const settings = items.find((item) => item.label === '설정');
  assert.ok(settings, '설정 메뉴가 있어야 한다');
  assert.ok(Array.isArray(settings.submenu) && settings.submenu.length > 0, '설정에는 하위 항목이 있다');

  for (const item of items) {
    assert.ok(item.icon, `'${item.where}' 에 그림이 없다`);
    assert.ok(fs.existsSync(item.icon.path), `'${item.where}' 의 그림 파일이 없다: ${item.icon.path}`);
  }
});

test('설정 메뉴에서 새 박스 테마와 투명도를 바꾸면 다음 박스에 쓰인다', () => {
  const state = baseState();
  const loaded = loadHost(state);
  loaded.host.setDefaultTheme('sunset');
  loaded.host.setDefaultOpacity(0.66);
  const made = loaded.host.finishDraw({ x: 0, y: 0, w: 300, h: 240 });
  assert.equal(made.theme, 'sunset');
  assert.equal(made.opacity, 0.66);
});

test('숨김 상태가 바뀌면 트레이 글씨와 그림이 따라 바뀐다', () => {
  const { host, installTray, electron } = openOne();
  installTray();
  const before = flatten(electron.menus.at(-1)).find((item) => item.label === '박스 숨기기');
  assert.ok(before);
  assert.match(before.icon.path, /hide\.png$/);

  host.toggleHidden();
  const after = flatten(electron.menus.at(-1)).find((item) => item.label === '박스 보이기');
  assert.ok(after, '숨긴 뒤에는 보이기로 바뀐다');
  assert.match(after.icon.path, /show\.png$/);
});

test('트레이 메뉴에 프로그램 정보가 있다', () => {
  const { installTray, electron } = openOne();
  installTray();
  const items = flatten(electron.menus.at(-1));
  const about = items.find((item) => item.label === '프로그램 정보');
  assert.ok(about, '프로그램 정보 항목이 없다');
  assert.ok(about.icon, '그림이 없다');
  assert.match(about.icon.path, /info\.png$/);
  assert.equal(typeof about.click, 'function', '누를 수 있어야 한다');
});
