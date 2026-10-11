'use strict';

// Startup and shutdown concerns: registering as a startup app, living only in the tray, remembering positions and settings.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadHost, loadMain, fence, baseState, fenceWindows } = require('./helpers/fakes');

// ── Launching automatically at startup ─────────────────────────────────────

test('registers itself as a startup app on launch per settings', async () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const app = await loadMain(state);
  try {
    assert.equal(app.electron.module.app.login.openAtLogin, true, 'should be registered as a startup app');
    assert.equal(app.electron.module.app.login.path, process.execPath, 'should be registered with the current path');
  } finally {
    app.stop();
  }
});

test('registers nothing on launch for users who turned it off', async () => {
  const state = baseState({ settings: { openAtLogin: false } });
  const app = await loadMain(state);
  try {
    assert.deepEqual(app.electron.module.app.login, { openAtLogin: false, path: '' }, 'should not be touched');
  } finally {
    app.stop();
  }
});

test('turning it off in settings removes it from startup and keeps the value', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const { host, electron } = loadHost(state);

  host.setLogin(false);
  assert.equal(state.settings.openAtLogin, false);
  assert.equal(electron.module.app.login.openAtLogin, false, 'should also be removed from the OS');

  host.setLogin(true);
  assert.equal(state.settings.openAtLogin, true);
  assert.equal(electron.module.app.login.openAtLogin, true);
});

test('a development build is not registered as a startup app', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const { host, electron } = loadHost(state);
  electron.module.app.isPackaged = false;

  host.setLogin(true);

  assert.equal(state.settings.openAtLogin, true, 'the chosen value should be kept');
  assert.deepEqual(electron.module.app.login, { openAtLogin: false, path: '' }, 'should not be registered with the OS');
});

// ── Living only in the tray ────────────────────────────────────────────────

test('no window appears in the taskbar', async () => {
  const state = baseState({ fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  host.beginDraw();
  host.openPrefs();
  host.openSettings('a');
  for (const win of electron.windows) win.ready();

  assert.ok(electron.windows.length >= 4, 'there must be windows to check for this test to mean anything');
  for (const win of electron.windows) {
    assert.equal(win.options.skipTaskbar, true, `${win.loaded && win.loaded.file} appears in the taskbar`);
    assert.equal(win.options.frame, false, `${win.loaded && win.loaded.file} has a window frame`);
  }
});

test('everything can be managed from a single tray icon', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  const tray = loaded.installTray();
  assert.equal(loaded.electron.trays.length, 1, 'there should be one tray icon');
  assert.ok(tray.menu, 'it should have a menu');
});

// ── Remembering positions and settings ─────────────────────────────────────

// Loading the saved values themselves is covered by test/store.test.js.
// Here we check that windows are placed according to the loaded values.
test('boxes reappear at their previous positions on relaunch', () => {
  const state = baseState({ fences: [fence({ x: 640, y: 360, w: 300, h: 260 })] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  const win = fenceWindows(electron)[0];
  assert.equal(win.bounds.x, 640, 'position should not be adjusted on launch');
  assert.equal(win.bounds.y, 360);
  assert.equal(state.fences[0].w, 300);
  assert.equal(state.fences[0].h, 260);
});

// From reading the saved file to opening boxes. Boxes snapped to the screen edge (0) are the easiest to get wrong.
test('boxes snapped to the screen edge also reappear in place on relaunch', () => {
  const { normalizeFence } = require('../src/main/store');
  const written = JSON.parse(JSON.stringify([
    { id: 'p', title: '프로그램', x: 1, y: 160, w: 456, h: 427 },
    { id: 'f', title: '폴더', x: 0, y: 0, w: 456, h: 160 },
    { id: 'e', title: '기타', x: 2, y: 588, w: 456, h: 160 },
  ]));
  const state = baseState({ fences: written.map(normalizeFence) });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();

  assert.deepEqual(
    state.fences.map((box) => [box.title, box.x, box.y]),
    [['프로그램', 1, 160], ['폴더', 0, 0], ['기타', 2, 588]],
    'box positions changed on launch'
  );
  const wins = fenceWindows(electron);
  assert.deepEqual(
    wins.map((win) => [win.bounds.x, win.bounds.y]),
    [[1, 160], [0, 0], [2, 588]],
    'windows did not open at their saved positions'
  );
});

test('boxes hidden at exit stay hidden on relaunch', () => {
  const state = baseState({ hidden: true, fences: [fence()] });
  const { host, electron } = loadHost(state);
  host.openAll();
  for (const win of electron.windows) win.ready();
  assert.equal(fenceWindows(electron).every((win) => !win.isVisible()), true);
});

test('appears in Task Manager under a human-readable name', () => {
  const state = baseState({ settings: { openAtLogin: false } });
  const { host, electron } = loadHost(state);

  host.setLogin(true);

  const { login } = electron.module.app;
  // Without a name, 'com.suhokwon.mydeskbox' is recorded. The uninstaller also looks it up by this name.
  assert.equal(login.name, 'MyDeskBox');
  assert.equal(login.path, process.execPath, 'should record the current executable');
  assert.deepEqual(login.args, [], 'should launch as-is with no extra arguments');
});

test('re-registers on launch if removed from startup apps', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const { host, electron } = loadHost(state);
  host.setLogin(true);

  // Simulate the user removing it in Task Manager.
  electron.module.app.login = { openAtLogin: false, path: '' };
  assert.equal(electron.module.app.getLoginItemSettings().openAtLogin, false);

  // Call the sync path as if relaunching.
  assert.equal(host.syncLogin(), true, 'did not re-register');
  assert.equal(electron.module.app.login.openAtLogin, true);
  assert.equal(electron.module.app.login.path, process.execPath);
});

test('the sync path does nothing for users who turned it off', () => {
  const state = baseState({ settings: { openAtLogin: false } });
  const { host, electron } = loadHost(state);

  assert.equal(host.syncLogin(), false, 'removes something that is not there');
  assert.deepEqual(electron.module.app.login, { openAtLogin: false, path: '' });
});

test('the chosen value is kept even if the OS refuses', () => {
  const state = baseState({ settings: { openAtLogin: false } });
  const { host, electron } = loadHost(state);
  electron.module.app.setLoginItemSettings = () => {
    throw new Error('운영체제가 거절했다');
  };

  host.setLogin(true);

  assert.equal(state.settings.openAtLogin, true, 'even the chosen value was lost');
});

test('turning it off in the settings window takes the same path', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const { host, electron } = loadHost(state);
  host.setLogin(true);
  assert.equal(electron.module.app.login.openAtLogin, true);

  host.changePrefs({ openAtLogin: false });

  assert.equal(state.settings.openAtLogin, false);
  assert.equal(electron.module.app.login.openAtLogin, false, 'was not removed from the OS');
});

test('the tray Launch at startup item shows the current value and toggles on click', () => {
  const state = baseState({ settings: { openAtLogin: true } });
  const loaded = loadHost(state);
  loaded.installTray();

  const find = () => {
    const menu = loaded.electron.menus.at(-1);
    const quick = menu.find((row) => row.submenu && row.submenu.some((entry) => entry.label === '시작할 때 실행'));
    assert.ok(quick, 'Quick settings has no Launch at startup item');
    return quick.submenu.find((entry) => entry.label === '시작할 때 실행');
  };

  const on = find();
  assert.equal(on.type, 'checkbox');
  assert.equal(on.checked, true, 'shown as off while it is on');

  // Click to turn it off. The menu is redrawn with the post-click value.
  on.click({ checked: false });
  assert.equal(state.settings.openAtLogin, false);
  assert.equal(loaded.electron.module.app.login.openAtLogin, false);
  assert.equal(find().checked, false, 'still shown as on after turning it off');
});

test('every place that creates a window keeps it out of the taskbar', () => {
  // loadHost swaps in a fake prompt window (ask.js), so window counts can't tell us.
  // Count directly in the source in case more window-creating sites are added.
  const root = path.join(__dirname, '..', 'src', 'main');
  let seen = 0;
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.js')) continue;
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    const made = (text.match(/new BrowserWindow\(/g) || []).length;
    if (!made) continue;
    const skipped = (text.match(/skipTaskbar: true/g) || []).length;
    assert.equal(skipped, made, `${name}: only ${skipped} of ${made} windows are kept out of the taskbar`);
    seen += made;
  }
  assert.ok(seen >= 6, `only ${seen} window-creating sites found; the check isn't looking at anything`);
});

// ── Recording for the next launch ──────────────────────────────────────────
//
// The tests above check that windows are placed according to loaded values. The ones
// below check that those values are actually written to layout.json. Both must hold
// for things to come back as they were on relaunch.

function written(loaded) {
  return JSON.parse(fs.readFileSync(path.join(loaded.userData, 'layout.json'), 'utf8'));
}

test('moving a box records its position immediately', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();

  loaded.host.applyBounds('a', { id: 'a', x: 720, y: 480, w: 360, h: 300 }, true);

  const box = written(loaded).fences[0];
  assert.deepEqual([box.x, box.y, box.w, box.h], [720, 480, 360, 300], 'the new position was not recorded');
});

test('does not write while dragging, only on release', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();
  loaded.host.applyBounds('a', { id: 'a', x: 300, y: 300, w: 400, h: 300 }, true);

  // While dragging (save is false) nothing is saved, to avoid writing the file on every drag step.
  loaded.host.applyBounds('a', { id: 'a', x: 500, y: 500, w: 400, h: 300 }, false);
  assert.equal(written(loaded).fences[0].x, 300, 'wrote the file while dragging');

  loaded.host.applyBounds('a', { id: 'a', x: 500, y: 500, w: 400, h: 300 }, true);
  assert.equal(written(loaded).fences[0].x, 500, 'did not write even after release');
});

test('changing settings records them for the next launch', () => {
  const state = baseState();
  const loaded = loadHost(state);

  loaded.host.setLang('en');
  loaded.host.setDefaultTheme('cherry');
  loaded.host.setDefaultOpacity(0.7);
  loaded.host.setOpenWith('single');
  loaded.host.setShadow(true);
  loaded.host.setLogin(false);

  assert.deepEqual(
    (({ lang, theme, opacity, openWith, shadow, openAtLogin }) => ({ lang, theme, opacity, openWith, shadow, openAtLogin }))(written(loaded).settings),
    { lang: 'en', theme: 'cherry', opacity: 0.7, openWith: 'single', shadow: true, openAtLogin: false }
  );
});

test('collapsed and hidden states are recorded too', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();
  for (const win of loaded.electron.windows) win.ready();

  loaded.host.setCollapsed('a', true);
  loaded.host.setHidden(true);

  const saved = written(loaded);
  assert.equal(saved.fences[0].collapsed, true, 'collapsed state was not recorded');
  assert.equal(saved.hidden, true, 'hidden state was not recorded');
});

test('box renames and theme changes are recorded too', () => {
  const state = baseState({ fences: [fence()] });
  const loaded = loadHost(state);
  loaded.host.openAll();

  loaded.host.rename('a', '일감');
  loaded.host.restyle('a', { theme: 'forest', corner: 4 });

  const box = written(loaded).fences[0];
  assert.equal(box.title, '일감');
  assert.equal(box.theme, 'forest');
});
