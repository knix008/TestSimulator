'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

  await item.click();
  assert.equal(desktop.calls.emptied, 1);
});

// 지울지 묻는 창과 진행률은 윈도우가 보여 준다. 우리가 먼저 물으면 두 번 묻게 된다.
test('휴지통 비우기는 우리 확인 창 없이 시스템에 맡긴다', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop, asks } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.showMenu('a', 'shell:RecycleBinFolder');
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '휴지통 비우기');

  // 우리 창이라면 '아니오' 에 해당하는 답이어도 시스템이 묻고 지운다.
  asks.reply = false;
  await item.click();
  assert.equal(asks.calls.length, 0, '우리가 또 물었다');
  assert.equal(desktop.calls.emptied, 1);

  // 시스템 창이 박스 뒤로 숨지 않게 주인 창 번호를 넘긴다.
  const [owner] = desktop.calls.binOwners;
  assert.equal(typeof owner, 'number');
  assert.ok(owner > 0, '주인 창 번호를 넘기지 않았다');
});

// 비우기를 그만두면 아무것도 지워지지 않았으므로 다시 그릴 것도 없다.
test('시스템 창에서 그만두면 박스를 다시 그리지 않는다', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  desktop.module.emptyRecycle = () => Promise.resolve(false);
  host.showMenu('a', 'shell:RecycleBinFolder');
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '휴지통 비우기');
  const [win] = fenceWindows(electron);
  const before = win.messages('fence:state').length;
  await item.click();
  assert.equal(win.messages('fence:state').length, before, '지우지도 않고 다시 그렸다');
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
  // 설정은 눌러서 여는 창이다. 자주 바꾸는 값은 '빠른 설정' 아래에 그대로 둔다.
  const settings = items.find((item) => item.label === '설정');
  assert.ok(settings, '설정 메뉴가 있어야 한다');
  assert.equal(typeof settings.click, 'function', '설정을 눌러도 창이 열리지 않는다');
  assert.equal(settings.submenu, undefined, '설정이 아직 하위 메뉴다');
  const quick = items.find((item) => item.label === '빠른 설정');
  assert.ok(quick, '빠른 설정 메뉴가 있어야 한다');
  assert.ok(Array.isArray(quick.submenu) && quick.submenu.length > 0, '빠른 설정에 하위 항목이 없다');

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

// 박스 안에서 바로 지울 수 있어야 한다. 박스에서만 빼는 것이 아니라 파일이 없어져야 한다.
test('박스 항목을 지우면 파일이 휴지통으로 간다', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const room = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-trash-'));
  const file = path.join(room, '지울 것.txt');
  fs.writeFileSync(file, '');

  const state = baseState({ fences: [fence({ items: [{ name: '지울 것.txt', path: file }] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.refreshIcons();
  const at = state.fences[0].items[0].path;

  host.showMenu('a', at);
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '삭제');
  assert.ok(item, '지우기가 메뉴에 없다');
  assert.ok(item.icon, '지우기에 그림이 없다');
  await item.click();

  assert.deepEqual(electron.shell.trashed, [at], '파일을 휴지통으로 보내지 않았다');
  assert.deepEqual(state.fences[0].items, [], '박스에 그대로 남아 있다');
});

test('휴지통 같은 셸 항목은 지우기를 누를 수 없다', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.showMenu('a', 'shell:RecycleBinFolder');
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '삭제');
  assert.equal(item.enabled, false, '지울 파일이 없는데 누를 수 있다');
});

// 트레이의 설정은 프로그램 설정 창을 연다. 박스 하나의 설정 창과는 다른 창이다.
test('트레이의 설정을 누르면 설정 창이 열린다', () => {
  const { installTray, electron, host } = openOne();
  installTray();
  const items = flatten(electron.menus.at(-1));
  const settings = items.find((item) => item.label === '설정');

  settings.click();
  for (const win of electron.windows) win.ready();

  const opened = electron.windows.filter((win) => win.loaded && /prefs\.html$/.test(win.loaded.file));
  assert.equal(opened.length, 1, '설정 창이 열리지 않았다');
  assert.equal(opened[0].isVisible(), true, '설정 창이 보이지 않는다');

  // 두 번 눌러도 창은 하나다.
  settings.click();
  const again = electron.windows.filter((win) => win.loaded && /prefs\.html$/.test(win.loaded.file));
  assert.equal(again.length, 1, '설정 창이 두 개 열렸다');
  host.closePrefs();
});

test('설정 창은 크기가 고정이고 정보 탭까지 갖춘다', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'prefs.html'), 'utf8');
  for (const tab of ['general', 'look', 'files', 'about']) {
    assert.match(html, new RegExp(`data-tab="${tab}"`), `${tab} 탭이 없다`);
    assert.match(html, new RegExp(`data-pane="${tab}"`), `${tab} 칸이 없다`);
  }
  // 제목 줄의 톱니바퀴.
  assert.match(html, /id="mark"/, '제목 줄에 그림 자리가 없다');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'prefs.js'), 'utf8');
  assert.match(js, /payload\.gear/, '제목 줄에 톱니바퀴를 그리지 않는다');
  // 창 크기를 내용에 맞춰 늘이지 않는다.
  assert.equal(/prefsSize|boxSize/.test(js), false, '창 크기를 내용에 맞춰 바꾼다');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'prefs.css'), 'utf8');
  assert.match(css, /#body\s*\{[^}]*overflow:\s*hidden/, '스크롤 막대가 생길 수 있다');
});

// 만든 이는 한 곳에서만 적는다. 트레이와 설정 창이 같은 것을 보여 준다.
test('만든 이가 SHKWON 으로 적혀 있다', () => {
  const { host } = openOne();
  assert.equal(host.AUTHOR.name, 'SHKWON');
  assert.equal(host.AUTHOR.email, 'knix008@naver.com');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.author.name, 'SHKWON');
  assert.equal(pkg.author.email, 'knix008@naver.com');
});
