// Session persistence (core/session.js): defaults, saving, loading, folders that no longer exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Session, DEFAULTS, defaultConfigDir } = require('../core/session.js');

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-session-'));

test('without a file the defaults apply and both panels start at home', () => {
  const s = new Session(tmpdir());
  const d = s.load();
  assert.equal(d.language, 'ko');
  assert.equal(d.splitter, 0.5);
  assert.equal(d.windowBounds, null);
  assert.equal(d.left, os.homedir());
  assert.equal(d.right, os.homedir());
});

test('save writes session.json and a new Session reads it back', () => {
  const dir = tmpdir();
  new Session(dir).save({ language: 'en', splitter: 0.3, windowBounds: { x: 1, y: 2, width: 1500, height: 900, maximized: false } });
  assert.ok(fs.existsSync(path.join(dir, 'session.json')));
  const d = new Session(dir).load();
  assert.equal(d.language, 'en');
  assert.equal(d.splitter, 0.3);
  assert.deepEqual(d.windowBounds, { x: 1, y: 2, width: 1500, height: 900, maximized: false });
});

test('save merges: earlier keys stay', () => {
  const dir = tmpdir();
  const s = new Session(dir);
  s.save({ theme: 'ocean' });
  s.save({ dockVisible: true });
  const d = new Session(dir).load();
  assert.equal(d.theme, 'ocean');
  assert.equal(d.dockVisible, true);
});

test('keys the defaults do not know are kept (hotlist, tabs …)', () => {
  const dir = tmpdir();
  new Session(dir).save({ hotlist: ['/a', '/b'] });
  assert.deepEqual(new Session(dir).load().hotlist, ['/a', '/b']);
});

test('a folder that still exists is restored, one that is gone falls back to home', () => {
  const dir = tmpdir();
  const keep = tmpdir();
  new Session(dir).save({ left: keep, right: path.join(keep, 'gone') });
  const d = new Session(dir).load();
  assert.equal(d.left, keep);
  assert.equal(d.right, os.homedir());
});

test('a file instead of a folder is not restored as a panel path', () => {
  const dir = tmpdir();
  const file = path.join(dir, 'f.txt');
  fs.writeFileSync(file, 'x');
  new Session(dir).save({ left: file });
  assert.equal(new Session(dir).load().left, os.homedir());
});

test('a broken session.json gives the defaults instead of an error', () => {
  const dir = tmpdir();
  fs.writeFileSync(path.join(dir, 'session.json'), '{ not json');
  const d = new Session(dir).load();
  assert.equal(d.theme, DEFAULTS.theme);
});

test('a session.json saved with a byte-order mark (Notepad, PowerShell) is still read', () => {
  const dir = tmpdir();
  fs.writeFileSync(path.join(dir, 'session.json'), '\uFEFF{"language":"en"}');
  assert.equal(new Session(dir).load().language, 'en');
});

test('the config folder is created when it does not exist yet', () => {
  const dir = path.join(tmpdir(), 'nested', 'deeper');
  new Session(dir).save({ theme: 'forest' });
  assert.ok(fs.existsSync(path.join(dir, 'session.json')));
});

test('get returns a copy: changing it does not change the session', () => {
  const s = new Session(tmpdir());
  s.load();
  const d = s.get();
  d.language = 'en';
  assert.equal(s.get().language, 'ko');
});

test('the default config folder is under the platform\'s app-data folder', () => {
  const d = defaultConfigDir('CCTest');
  assert.equal(path.basename(d), 'CCTest');
  assert.ok(path.isAbsolute(d));
});
