'use strict';

// Checks that saved state is read back exactly as it was written.
//
// store.js asks electron's app for the settings folder. Here we plug in a fake
// that returns a temp folder. This file never uses real electron, so the fake
// stays in place until the end.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOM = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-store-'));
const KEY = ' electron';

const original = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, ...rest) {
  if (request === 'electron') return KEY;
  return original.call(this, request, parent, ...rest);
};
require.cache[KEY] = {
  id: KEY,
  filename: KEY,
  loaded: true,
  exports: { app: { getLocale: () => 'ko-KR', getPath: () => ROOM } },
};

const store = require('../src/main/store');

// Where the saved file lives.
function file() {
  return path.join(ROOM, 'layout.json');
}

test('launch at login is on when settings have never been saved', () => {
  // After installing and rebooting, the app should come back on its own.
  assert.equal(store.defaults().settings.openAtLogin, true);
});

test('saved positions and settings are read back unchanged', () => {
  const saved = store.defaults();
  saved.didWelcome = true;
  saved.hidden = true;
  saved.settings.lang = 'en';
  saved.settings.openAtLogin = false;
  saved.settings.opacity = 0.4;
  saved.settings.openWith = 'single';
  saved.settings.shadow = true;
  saved.fences = [store.normalizeFence({
    id: 'a', title: '일감', x: 321, y: 234, w: 420, h: 360, corner: 20, collapsed: true, folder: 'work',
  })];
  store.save(saved);

  const back = store.load();
  assert.equal(back.hidden, true, 'quitting while hidden should start hidden');
  assert.deepEqual(back.settings, saved.settings, 'settings changed');
  const box = back.fences[0];
  assert.deepEqual(
    [box.id, box.title, box.x, box.y, box.w, box.h, box.collapsed, box.folder],
    ['a', '일감', 321, 234, 420, 360, true, 'work'],
    'box position, size, collapsed state, or folder changed'
  );
});

test('launch at login stays off once the user turned it off', () => {
  const saved = store.defaults();
  saved.settings.openAtLogin = false;
  store.save(saved);
  assert.equal(store.load().settings.openAtLogin, false);
});

test('defaults are used when there is no settings file', () => {
  fs.rmSync(path.join(ROOM, 'layout.json'), { force: true });
  const back = store.load();
  assert.equal(back.settings.openAtLogin, true);
  assert.equal(back.fences.length, 0);
  assert.equal(back.didWelcome, false);
});

test('an older save without launch at login is treated as on', () => {
  // Upgraded from a version that did not save this value. The user never chose, so the default applies.
  fs.writeFileSync(file(), JSON.stringify({
    version: 1,
    didWelcome: true,
    settings: { lang: 'ko', theme: 'ocean' },
    fences: [],
  }));
  const back = store.load();
  assert.equal(back.settings.openAtLogin, true);
  assert.equal(back.settings.theme, 'ocean', 'existing values should be kept');
});

test('non-boolean values are read as true or false', () => {
  for (const [written, wanted] of [['yes', true], [0, false], [null, false], [1, true]]) {
    fs.writeFileSync(file(), JSON.stringify({ settings: { openAtLogin: written } }));
    assert.equal(store.load().settings.openAtLogin, wanted, `misread ${JSON.stringify(written)}`);
  }
});

test('a corrupted save falls back to defaults', () => {
  fs.writeFileSync(file(), '{ 여기서 끊겼다');
  const back = store.load();
  assert.equal(back.settings.openAtLogin, true);
  assert.equal(back.fences.length, 0);
});

test('saving replaces the file atomically and leaves no temp files', () => {
  const saved = store.defaults();
  saved.fences = [store.normalizeFence({ id: 'a', title: '일감', x: 10, y: 20 })];
  store.save(saved);
  const left = fs.readdirSync(ROOM).filter((name) => name.startsWith('layout.json'));
  assert.deepEqual(left, ['layout.json'], `temp files left behind: ${left.join(', ')}`);
});

// A box snapped to the left or top screen edge sits at 0. Zero is a valid position.
test('a box snapped to a screen corner is still there after restart', () => {
  const saved = store.defaults();
  saved.fences = [
    store.normalizeFence({ id: 'corner', title: '폴더', x: 0, y: 0, w: 456, h: 160 }),
    store.normalizeFence({ id: 'left', title: '프로그램', x: 0, y: 160, w: 456, h: 427 }),
    store.normalizeFence({ id: 'top', title: '기타', x: 500, y: 0, w: 456, h: 160 }),
  ];
  store.save(saved);

  const back = store.load();
  assert.deepEqual(
    back.fences.map((box) => [box.id, box.x, box.y]),
    [['corner', 0, 0], ['left', 0, 160], ['top', 500, 0]],
    'a box snapped to an edge moved elsewhere'
  );
});

test('negative positions for boxes on left or upper monitors are read as-is', () => {
  const box = store.normalizeFence({ id: 'a', x: -1920, y: -300 });
  assert.deepEqual([box.x, box.y], [-1920, -300]);
});

test('a missing or non-numeric position falls back to the default position', () => {
  for (const [x, y] of [[undefined, undefined], [null, null], ['abc', {}], [NaN, Infinity], ['', '']]) {
    const box = store.normalizeFence({ id: 'a', x, y });
    assert.deepEqual([box.x, box.y], [80, 80], `accepted ${String(x)}, ${String(y)} as a position`);
  }
  const text = store.normalizeFence({ id: 'a', x: '0', y: '12' });
  assert.deepEqual([text.x, text.y], [0, 12], 'numbers written as strings are not read');
});

test('out-of-range box values still respect the minimum size', () => {
  const box = store.normalizeFence({ id: 'a', w: 10, h: 10, opacity: 9, corner: -5 });
  assert.ok(box.w >= 180 && box.h >= 160, 'accepted a box that is too small');
  assert.ok(box.opacity <= 0.9 && box.opacity >= 0.15, 'opacity is out of range');
  assert.ok(box.corner >= 0, 'corner radius is negative');
});
