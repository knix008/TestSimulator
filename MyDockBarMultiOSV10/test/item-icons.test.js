'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { canAdoptIcon } = require('../src/main/ipc');

const ROOT = path.join(__dirname, '..');
const IPC = fs.readFileSync(path.join(ROOT, 'src/main/ipc.js'), 'utf8');

describe('giving a new entry its program\'s icon', () => {
  it('takes one for a program that has none yet', () => {
    assert.strictEqual(canAdoptIcon({ type: 'app', path: 'C:/Windows/notepad.exe', icon: '' }), true);
  });

  it('takes one for a folder too', () => {
    assert.strictEqual(canAdoptIcon({ type: 'folder', path: 'C:/Users', icon: '' }), true);
  });

  it('leaves an icon the user already chose alone', () => {
    assert.strictEqual(
      canAdoptIcon({ type: 'app', path: 'C:/Windows/notepad.exe', icon: 'C:/mine.png' }),
      false,
    );
  });

  it('leaves the icon a shortcut named alone', () => {
    // itemFromPath reads .lnk files and carries their icon across; adopting on
    // top of that would throw away the one the shortcut asked for.
    assert.strictEqual(canAdoptIcon({ type: 'app', path: 'C:/a.exe', icon: 'C:/b.ico' }), false);
  });

  it('leaves the dock\'s own entries to draw themselves', () => {
    for (const target of ['system:trash', 'system:home', 'system:show-desktop', 'dock:settings']) {
      assert.strictEqual(canAdoptIcon({ type: 'special', path: target, icon: '' }), false, target);
    }
  });

  it('skips a web link, which has no file to read an icon out of', () => {
    assert.strictEqual(canAdoptIcon({ type: 'url', path: 'https://example.com', icon: '' }), false);
  });

  it('skips a separator', () => {
    assert.strictEqual(canAdoptIcon({ type: 'separator', path: '', icon: '' }), false);
  });

  it('skips an entry with no target yet', () => {
    assert.strictEqual(canAdoptIcon({ type: 'app', path: '', icon: '' }), false);
    assert.strictEqual(canAdoptIcon({ type: 'app', icon: '' }), false);
  });

  it('does not fall over on nothing at all', () => {
    assert.strictEqual(canAdoptIcon(null), false);
    assert.strictEqual(canAdoptIcon(undefined), false);
    assert.strictEqual(canAdoptIcon({}), false);
  });
});

describe('where the icon is taken', () => {
  it('happens on every route an entry can arrive by', () => {
    for (const handler of ['items:add-paths', 'items:insert-paths', 'items:add']) {
      const open = IPC.indexOf(`ipcMain.handle('${handler}'`);
      assert.ok(open >= 0, `no handler for ${handler}`);
      const body = IPC.slice(open, IPC.indexOf('\n  });', open));
      assert.ok(body.includes('withDefaultIcon'),
        `${handler} adds an entry without giving it an icon`);
    }
  });

  it('is refreshed when an entry is pointed at a different program', () => {
    const open = IPC.indexOf("ipcMain.handle('items:update'");
    const body = IPC.slice(open, IPC.indexOf('\n  });', open));
    assert.ok(body.includes('withDefaultIcon'),
      'retargeting an entry leaves the old program\'s icon on it');
  });

  it('is copied out of the disposable extraction cache', () => {
    // The icon cache can be cleared from the settings window; an entry's own
    // icon must not disappear with it.
    const icons = fs.readFileSync(path.join(ROOT, 'src/main/icons.js'), 'utf8');
    const open = icons.indexOf('async function adoptDefault(');
    assert.ok(open >= 0, 'icons.js has no adoptDefault');
    const body = icons.slice(open, icons.indexOf('\n}', open));
    assert.ok(body.includes('importCustomIcon'),
      'adoptDefault hands back a cache path instead of a copy');
  });
});
