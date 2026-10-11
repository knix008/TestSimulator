'use strict';

const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { loadHost, fence, baseState, tempRoot, fenceWindows } = require('./helpers/fakes');
const { THEMES, DEFAULT_THEME } = require('../src/main/themes');

test('multiple boxes can be created, each with its own window', () => {
  const state = baseState();
  const { host, electron } = loadHost(state);
  host.openAll();

  const first = host.finishDraw({ x: 10, y: 10, w: 300, h: 240 });
  const second = host.finishDraw({ x: 400, y: 20, w: 260, h: 200 });
  const third = host.finishDraw({ x: 80, y: 400, w: 320, h: 280 });

  assert.equal(state.fences.length, 3);
  const ids = new Set([first.id, second.id, third.id]);
  assert.equal(ids.size, 3, 'each box has a distinct id');
  assert.equal(fenceWindows(electron).length, 3, 'each box opens one window');

  const titles = state.fences.map((entry) => entry.title);
  assert.equal(new Set(titles).size, 3, `duplicate titles: ${titles.join(', ')}`);

  // Positions match what was drawn.
  assert.deepEqual(
    state.fences.map((entry) => [entry.x, entry.y]),
    [[10, 10], [400, 20], [80, 400]]
  );
});

// Deleting a box never touches files. It only returns the icons it held to their original spots.
test('deleting a box returns its icons to their original spots', async () => {
  const room = tempRoot();
  const made = ['a.lnk', 'b.lnk'].map((name) => {
    const at = path.join(room, name);
    fs.writeFileSync(at, '');
    return { name, path: at };
  });
  const state = baseState({ fences: [fence({ items: made })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  host.refreshIcons();

  electron.setDialogAnswer(0); // choose Delete
  await host.removeFence('a');

  assert.equal(state.fences.length, 0, 'the box is removed');
  assert.deepEqual(desktop.calls.homed.at(-1), ['a.lnk', 'b.lnk'], 'icons were not returned to their original spots');
  for (const item of made) {
    assert.equal(fs.existsSync(item.path), true, `${item.name} disappeared`);
  }
  assert.equal(fenceWindows(electron)[0].isDestroyed(), true, 'the window is closed too');
});

test('canceling deletion leaves the box and its items intact', async () => {
  const items = [{ name: 'a.lnk', path: 'C:/Desktop/a.lnk' }];
  const state = baseState({ fences: [fence({ items })] });
  const { host, electron, desktop } = loadHost(state);
  host.openAll();

  electron.setDialogAnswer(1); // Cancel
  await host.removeFence('a');

  assert.equal(state.fences.length, 1);
  assert.equal(desktop.calls.moved.length, 0);
});

test('each box can have its own theme', async () => {
  const state = baseState({ fences: [fence({ id: 'a' }), fence({ id: 'b' })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  host.restyle('a', { theme: 'sunset' });
  host.restyle('b', { theme: 'night' });

  assert.equal(state.fences[0].theme, 'sunset');
  assert.equal(state.fences[1].theme, 'night');

  // The chosen theme's colors are passed through to the screen as-is.
  await host.push('a');
  const sent = fenceWindows(electron)[0].messages('fence:state').at(-1);
  assert.equal(sent.theme.id, 'sunset');
  assert.equal(sent.theme.bg, THEMES.find((t) => t.id === 'sunset').bg);
});

test('an unknown theme falls back to the default theme', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.restyle('a', { theme: '없는테마' });
  assert.equal(state.fences[0].theme, DEFAULT_THEME);
});

test('opacity is clamped so it is never too faint or too solid', () => {
  const state = baseState({ fences: [fence()] });
  const { host } = loadHost(state);
  host.restyle('a', { opacity: 5 });
  assert.ok(state.fences[0].opacity <= 0.9);
  host.restyle('a', { opacity: -1 });
  assert.ok(state.fences[0].opacity >= 0.15);
});

test('deletion asks in our own window and shows red because it cannot be undone', async () => {
  const state = baseState({ fences: [fence({ title: '일감' })] });
  const { host, electron, asks } = loadHost(state);
  host.openAll();

  electron.setDialogAnswer(0);
  await host.removeFence('a');

  const asked = asks.calls.at(-1);
  assert.ok(asked, 'shows a confirmation window');
  assert.match(asked.title, /일감/, 'says which box it is');
  assert.ok(asked.detail, 'explains what will happen');
  assert.equal(asked.danger, true, 'marks the action as irreversible');
  assert.ok(asked.icon, 'shows an image as well');
  assert.ok(asked.confirm && asked.cancel, 'both buttons have labels');
});

test('creating a box also asks in our own window', async () => {
  const state = baseState();
  const { host, electron, asks } = loadHost(state);
  electron.setDialogAnswer(0);
  await host.offerFence({ x: 0, y: 0, w: 300, h: 240 });

  const asked = asks.calls.at(-1);
  assert.ok(asked);
  assert.notEqual(asked.danger, true, 'creating is not dangerous');
  assert.ok(asked.icon);
});

test('confirmation window text follows the chosen language', async () => {
  const state = baseState({ settings: { lang: 'en', openAtLogin: false, theme: 'ocean', opacity: 0.52 } });
  const { host, electron, asks } = loadHost(state);
  electron.setDialogAnswer(1);
  await host.offerFence({ x: 0, y: 0, w: 300, h: 240 });
  assert.equal(asks.calls.at(-1).confirm, 'Create');
  assert.equal(asks.calls.at(-1).cancel, 'Cancel');
});


test('the Recycle Bin dragged from the desktop goes into that box', async () => {
  const state = baseState({ fences: [fence({ x: 100, y: 100, w: 400, h: 300 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  await host.acceptDesktopDrop(
    { name: '휴지통', path: 'shell:RecycleBinFolder' },
    { x: 180, y: 180 }
  );

  assert.deepEqual(
    state.fences[0].items.map((item) => item.path),
    ['shell:RecycleBinFolder']
  );

});

test('the Recycle Bin dropped outside a box is not added', async () => {
  const state = baseState({ fences: [fence({ x: 100, y: 100, w: 200, h: 160 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  await host.acceptDesktopDrop(
    { name: '휴지통', path: 'shell:RecycleBinFolder' },
    { x: 900, y: 900 }
  );

  assert.equal(state.fences[0].items.length, 0);
});

test('items that cannot be dragged in, like the Recycle Bin, are added via the menu', async () => {
  const state = baseState({ fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  host.showMenu('a', null);
  const template = electron.menus.at(-1);
  const special = template.find((item) => item.label === '바탕화면 항목 담기');
  assert.ok(special, 'the menu has the add-desktop-items entry');
  assert.ok(special.icon, 'the parent entry has an image');

  const bin = special.submenu.find((item) => item.label === '휴지통');
  assert.ok(bin, 'the Recycle Bin is in the list');
  assert.ok(bin.icon, 'the Recycle Bin also has an image');

  await bin.click();
  assert.deepEqual(
    state.fences[0].items.map((item) => item.path),
    ['shell:RecycleBinFolder'],
    'choosing it adds it to the box'
  );
});

test('desktop items already added do not appear in the menu again', () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.showMenu('a', null);
  const special = electron.menus.at(-1).find((item) => item.label === '바탕화면 항목 담기');
  assert.equal(special, undefined, 'the menu does not appear when there is nothing to add');
});

test('shell items are not removed for lacking a file', async () => {
  const state = baseState({
    fences: [fence({ items: [{ name: '휴지통', path: 'shell:RecycleBinFolder' }] })],
  });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  await host.push('a');
  assert.equal(state.fences[0].items.length, 1, 'the shell item survives');
});
