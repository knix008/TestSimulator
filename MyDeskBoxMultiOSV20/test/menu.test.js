'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadHost, fence, baseState, fenceWindows } = require('./helpers/fakes');

// Every item except separators, following into submenus.
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

test('every box menu item has an icon', () => {
  const { host, electron } = openOne();
  host.showMenu('a', null);
  const template = electron.menus.at(-1);
  const items = flatten(template);
  assert.ok(items.length >= 5);
  for (const item of items) {
    assert.ok(item.icon, `'${item.where}' has no icon`);
    assert.ok(fs.existsSync(item.icon.path), `icon file for '${item.where}' is missing: ${item.icon.path}`);
  }
});

test('the menu opened on an icon has Open and Eject, with icons', () => {
  const { host, electron } = openOne();
  host.showMenu('a', 'C:/Users/me/Desktop/a.lnk');
  const items = flatten(electron.menus.at(-1));
  const labels = items.map((item) => item.label);
  assert.ok(labels.includes('열기'));
  assert.ok(labels.includes('바탕화면으로 꺼내기'));
  for (const item of items) assert.ok(item.icon, `'${item.where}' has no icon`);
});

test('right-clicking the Recycle Bin offers Empty', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.showMenu('a', 'shell:RecycleBinFolder');
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '휴지통 비우기');
  assert.ok(item, 'the Recycle Bin menu has no Empty item');
  assert.ok(item.icon, 'Empty has no icon');

  host.showMenu('a', 'C:/Desktop/노트.txt');
  const plain = flatten(electron.menus.at(-1)).map((entry) => entry.label);
  assert.equal(plain.includes('휴지통 비우기'), false);

  await item.click();
  assert.equal(desktop.calls.emptied, 1);
});

// Windows shows the delete confirmation and progress. Asking first ourselves would ask twice.
test('Empty Recycle Bin defers to the system without our own confirmation', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron, desktop, asks } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.showMenu('a', 'shell:RecycleBinFolder');
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '휴지통 비우기');

  // Even with an answer that would mean 'no' in our dialog, the system asks and empties.
  asks.reply = false;
  await item.click();
  assert.equal(asks.calls.length, 0, 'we asked again');
  assert.equal(desktop.calls.emptied, 1);

  // Pass the owner window handle so the system dialog doesn't hide behind the box.
  const [owner] = desktop.calls.binOwners;
  assert.equal(typeof owner, 'number');
  assert.ok(owner > 0, 'did not pass the owner window handle');
});

// If emptying is cancelled, nothing was deleted, so there is nothing to redraw.
test('does not redraw the box when cancelled in the system dialog', async () => {
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
  assert.equal(win.messages('fence:state').length, before, 'redrew without deleting anything');
});

test('label and icon change together with the collapsed state', () => {
  const { host, electron } = openOne();
  host.showMenu('a', null);
  const open = flatten(electron.menus.at(-1)).find((item) => item.label === '접기');
  assert.ok(open, 'an expanded box should show Collapse');
  assert.match(open.icon.path, /collapse\.png$/);

  host.setCollapsed('a', true);
  host.showMenu('a', null);
  const closed = flatten(electron.menus.at(-1)).find((item) => item.label === '펼치기');
  assert.ok(closed, 'a collapsed box should show Expand');
  assert.match(closed.icon.path, /expand\.png$/);
});

test('the tray menu has Settings and every item has an icon', () => {
  const { installTray, electron } = openOne();
  installTray();
  const tray = electron.trays.at(-1);
  assert.ok(tray, 'the tray should be created');
  assert.ok(fs.existsSync(tray.image.path), 'the tray icon file should exist');

  const items = flatten(electron.menus.at(-1));
  // Settings is a window opened by clicking. Frequently changed values stay under 'Quick settings'.
  const settings = items.find((item) => item.label === '설정');
  assert.ok(settings, 'there should be a Settings menu');
  assert.equal(typeof settings.click, 'function', 'clicking Settings does not open a window');
  assert.equal(settings.submenu, undefined, 'Settings is still a submenu');
  const quick = items.find((item) => item.label === '빠른 설정');
  assert.ok(quick, 'there should be a Quick settings menu');
  assert.ok(Array.isArray(quick.submenu) && quick.submenu.length > 0, 'Quick settings has no subitems');

  for (const item of items) {
    assert.ok(item.icon, `'${item.where}' has no icon`);
    assert.ok(fs.existsSync(item.icon.path), `icon file for '${item.where}' is missing: ${item.icon.path}`);
  }
});

test('changing the new-box theme and opacity in settings applies to the next box', () => {
  const state = baseState();
  const loaded = loadHost(state);
  loaded.host.setDefaultTheme('sunset');
  loaded.host.setDefaultOpacity(0.66);
  const made = loaded.host.finishDraw({ x: 0, y: 0, w: 300, h: 240 });
  assert.equal(made.theme, 'sunset');
  assert.equal(made.opacity, 0.66);
});

test('tray label and icon follow the hidden state', () => {
  const { host, installTray, electron } = openOne();
  installTray();
  const before = flatten(electron.menus.at(-1)).find((item) => item.label === '박스 숨기기');
  assert.ok(before);
  assert.match(before.icon.path, /hide\.png$/);

  host.toggleHidden();
  const after = flatten(electron.menus.at(-1)).find((item) => item.label === '박스 보이기');
  assert.ok(after, 'after hiding it should change to Show');
  assert.match(after.icon.path, /show\.png$/);
});

test('the tray menu has About', () => {
  const { installTray, electron } = openOne();
  installTray();
  const items = flatten(electron.menus.at(-1));
  const about = items.find((item) => item.label === '프로그램 정보');
  assert.ok(about, 'there is no About item');
  assert.ok(about.icon, 'no icon');
  assert.match(about.icon.path, /info\.png$/);
  assert.equal(typeof about.click, 'function', 'should be clickable');
});

// Items must be deletable right from the box. The file itself should go away, not just leave the box.
test('deleting a box item sends the file to the Recycle Bin', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const room = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-trash-'));
  const file = path.join(room, '지울 것.txt');
  fs.writeFileSync(file, '');

  const state = baseState({ fences: [fence({ items: [{ name: '지울 것.txt', path: file }] })] });
  const { host, electron, asks } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.refreshIcons();
  const at = state.fences[0].items[0].path;

  host.showMenu('a', at);
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '삭제');
  assert.ok(item, 'Delete is not in the menu');
  assert.ok(item.icon, 'Delete has no icon');
  electron.setDialogAnswer(0);
  await item.click();

  assert.equal(asks.calls.length, 1, 'did not ask before deleting');
  assert.match(asks.calls[0].title, /삭제할까요/);
  assert.equal(asks.calls[0].confirm, '삭제');
  assert.deepEqual(electron.shell.trashed, [at], 'did not send the file to the Recycle Bin');
  assert.deepEqual(state.fences[0].items, [], 'still left in the box');
});

test('cancelling delete keeps the file in the box', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const room = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-trash-no-'));
  const file = path.join(room, '남길 것.txt');
  fs.writeFileSync(file, '그대로');

  const state = baseState({ fences: [fence({ items: [{ name: '남길 것.txt', path: file }] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.refreshIcons();
  const at = state.fences[0].items[0].path;

  electron.setDialogAnswer(1);
  await host.trashItems('a', [at]);

  assert.deepEqual(electron.shell.trashed, [], 'sent to the Recycle Bin despite cancelling');
  assert.equal(fs.existsSync(at), true, 'the file disappeared despite cancelling');
  assert.equal(state.fences[0].items.length, 1);
});

test('Delete is disabled for shell items like the Recycle Bin', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.showMenu('a', 'shell:RecycleBinFolder');
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '삭제');
  assert.equal(item.enabled, false, 'clickable even though there is no file to delete');
});

// Tray Settings opens the app settings window, which is separate from a single box's settings window.
test('clicking Settings in the tray opens the settings window', () => {
  const { installTray, electron, host } = openOne();
  installTray();
  const items = flatten(electron.menus.at(-1));
  const settings = items.find((item) => item.label === '설정');

  settings.click();
  for (const win of electron.windows) win.ready();

  const opened = electron.windows.filter((win) => win.loaded && /prefs\.html$/.test(win.loaded.file));
  assert.equal(opened.length, 1, 'the settings window did not open');
  assert.equal(opened[0].isVisible(), true, 'the settings window is not visible');

  // Clicking twice still leaves one window.
  settings.click();
  const again = electron.windows.filter((win) => win.loaded && /prefs\.html$/.test(win.loaded.file));
  assert.equal(again.length, 1, 'two settings windows opened');
  host.closePrefs();
});

test('the settings window has a fixed size and includes an About tab', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'prefs.html'), 'utf8');
  for (const tab of ['general', 'look', 'files', 'about']) {
    assert.match(html, new RegExp(`data-tab="${tab}"`), `missing ${tab} tab`);
    assert.match(html, new RegExp(`data-pane="${tab}"`), `missing ${tab} pane`);
  }
  // The gear in the title bar.
  assert.match(html, /id="mark"/, 'no icon slot in the title bar');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'prefs.js'), 'utf8');
  assert.match(js, /payload\.gear/, 'does not draw the gear in the title bar');
  // The window does not grow to fit its content.
  assert.equal(/prefsSize|boxSize/.test(js), false, 'resizes the window to fit content');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'prefs.css'), 'utf8');
  assert.match(css, /#body\s*\{[^}]*overflow:\s*hidden/, 'a scrollbar may appear');
});

// The author is defined in one place. The tray and settings window show the same thing.
test('the author is listed as SHKWON', () => {
  const { host } = openOne();
  assert.equal(host.AUTHOR.name, 'SHKWON');
  assert.equal(host.AUTHOR.email, 'knix008@naver.com');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.author.name, 'SHKWON');
  assert.equal(pkg.author.email, 'knix008@naver.com');
});

// Rename in the item menu renames that item; the one in the box menu renames the box.
// Both appear side by side in one menu, so their labels must differ.
test('item rename and box rename are separate', () => {
  const os = require('node:os');
  const room = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-rename-'));
  const file = path.join(room, '바꿀 것.txt');
  fs.writeFileSync(file, '');

  const state = baseState({ fences: [fence({ items: [{ name: '바꿀 것.txt', path: file }] })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.refreshIcons();
  const at = state.fences[0].items[0].path;
  const win = fenceWindows(electron)[0];

  host.showMenu('a', at);
  const items = flatten(electron.menus.at(-1));
  const one = items.find((entry) => entry.label === '이름 바꾸기');
  const box = items.find((entry) => entry.label === '박스 이름 바꾸기');
  assert.ok(one, 'item Rename is not in the menu');
  assert.ok(one.icon, 'Rename has no icon');
  assert.ok(box, 'Rename box is not in the menu');

  one.click();
  assert.deepEqual(win.messages('fence:rename-item'), [at], 'did not say which item to rename');
  box.click();
  assert.equal(win.messages('fence:rename').length, 1, 'Rename box tries to rename an item');
});

test('the empty-area menu has no item rename', () => {
  const { host, electron } = openOne();
  host.showMenu('a', null);
  const labels = flatten(electron.menus.at(-1)).map((entry) => entry.label);
  assert.equal(labels.includes('이름 바꾸기'), false, 'item Rename shown with no item selected');
  assert.equal(labels.includes('박스 이름 바꾸기'), true);
});

test('shell items like the Recycle Bin cannot be renamed', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.showMenu('a', 'shell:RecycleBinFolder');
  const item = flatten(electron.menus.at(-1)).find((entry) => entry.label === '이름 바꾸기');
  assert.equal(item.enabled, false, 'clickable even though there is no file to rename');
});
