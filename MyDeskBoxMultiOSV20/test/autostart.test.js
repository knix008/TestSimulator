'use strict';

// Linux has no login-item support handled by Electron, so we place a .desktop
// file in ~/.config/autostart ourselves. This file tests only that path.
//
// It fakes both the platform and electron, so it gets a file of its own to
// avoid interfering with other tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOM = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-xdg-'));
process.env.XDG_CONFIG_HOME = ROOM;
Object.defineProperty(process, 'platform', { value: 'linux' });

const KEY = ' electron';
const fake = { app: { isPackaged: true } };
const original = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, ...rest) {
  if (request === 'electron') return KEY;
  return original.call(this, request, parent, ...rest);
};
require.cache[KEY] = { id: KEY, filename: KEY, loaded: true, exports: fake };

const autostart = require('../src/main/autostart');

test('enabling writes a .desktop file to the autostart folder', () => {
  assert.equal(autostart.apply(true, 'MyDeskBox'), true);

  const file = autostart.desktopFile();
  assert.equal(file, path.join(ROOM, 'autostart', 'mydeskbox.desktop'));
  const body = fs.readFileSync(file, 'utf8');
  assert.match(body, /^\[Desktop Entry\]$/m);
  assert.match(body, /^Type=Application$/m);
  assert.match(body, /^Name=MyDeskBox$/m);
  assert.ok(body.includes(process.execPath), 'the file does not say what to launch');
  assert.match(body, /^X-GNOME-Autostart-enabled=true$/m);
  assert.equal(autostart.enabled(), true);
});

test('disabling removes the file', () => {
  autostart.apply(true, 'MyDeskBox');
  assert.equal(autostart.apply(false, 'MyDeskBox'), true);
  assert.equal(fs.existsSync(autostart.desktopFile()), false);
  assert.equal(autostart.enabled(), false);
});

test('disabling does nothing when the file is already gone', () => {
  autostart.apply(false, 'MyDeskBox');
  assert.equal(autostart.sync(false, 'MyDeskBox'), false, 'tried to delete a file that does not exist');
});

test('every enable rewrites the file with the current location', () => {
  autostart.apply(false, 'MyDeskBox');
  assert.equal(autostart.sync(true, 'MyDeskBox'), true);
  assert.equal(fs.existsSync(autostart.desktopFile()), true, 'the removed file was not recreated');
});

test('a development (unpackaged) run is not registered', () => {
  autostart.apply(false, 'MyDeskBox');
  fake.app.isPackaged = false;
  try {
    assert.equal(autostart.apply(true, 'MyDeskBox'), false);
    assert.equal(fs.existsSync(autostart.desktopFile()), false);
  } finally {
    fake.app.isPackaged = true;
  }
});

test('an AppImage records the outer AppImage path', () => {
  // The inner executable moves on every launch; recording it would leave a dead path at next login.
  const shell = '/home/me/Apps/My Desk Box.AppImage';
  process.env.APPIMAGE = shell;
  try {
    autostart.apply(true, 'MyDeskBox');
    const body = fs.readFileSync(autostart.desktopFile(), 'utf8');
    // A path containing spaces must be quoted to be read as a single word.
    assert.match(body, /^Exec="\/home\/me\/Apps\/My Desk Box\.AppImage"$/m);
    assert.ok(!body.includes(process.execPath), 'recorded the inner executable');
  } finally {
    delete process.env.APPIMAGE;
  }
});

test('a path without spaces is not quoted', () => {
  process.env.APPIMAGE = '/opt/mydeskbox/MyDeskBox';
  try {
    autostart.apply(true, 'MyDeskBox');
    assert.match(fs.readFileSync(autostart.desktopFile(), 'utf8'), /^Exec=\/opt\/mydeskbox\/MyDeskBox$/m);
  } finally {
    delete process.env.APPIMAGE;
  }
});

test('a human-readable name is used even when none is given', () => {
  autostart.apply(true);
  assert.match(fs.readFileSync(autostart.desktopFile(), 'utf8'), /^Name=MyDeskBox$/m);
});

test('the .desktop entry opens no terminal and stays out of the app menu', () => {
  autostart.apply(true, 'MyDeskBox');
  const body = fs.readFileSync(autostart.desktopFile(), 'utf8');
  assert.match(body, /^Terminal=false$/m, 'a terminal window opens alongside');
  assert.match(body, /^NoDisplay=true$/m, 'an extra entry shows up in the app menu');
  assert.ok(body.endsWith('\n'), 'the last line is not terminated');
});

test('enabling twice leaves only one file', () => {
  autostart.apply(true, 'MyDeskBox');
  autostart.apply(true, 'MyDeskBox');
  const dir = path.dirname(autostart.desktopFile());
  assert.deepEqual(fs.readdirSync(dir), ['mydeskbox.desktop']);
});
