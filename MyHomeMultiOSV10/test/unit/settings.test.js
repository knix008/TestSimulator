// Settings: defaults, repair of bad values, the reset after a new installation; recent files; the document.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, normalizeSettings, resetForNewInstall, STORAGE_KEY, RECENT_KEY, zoomStep, applyInstallLanguage } from '../../src/domain/settings.js';
import { addRecent, removeRecent } from '../../src/domain/recent.js';
import { SiteDocument, baseName, directoryOf, withExtension, fileSafe } from '../../src/domain/document.js';
import { buildTemplate } from '../../src/domain/templates.js';
import * as S from '../../src/domain/site.js';

class Memory {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

test('bad stored values are repaired', () => {
  const s = normalizeSettings({ language: 'fr', theme: 'nope', fontSize: 400, defaultDesign: 'x', defaultDevice: 'watch', leftWidth: 10, autoFit: 'yes', startCardOpacity: 5 }, 'en');
  assert.equal(s.language, 'en');
  assert.equal(s.theme, 'light');
  assert.equal(s.fontSize, 28);
  assert.equal(s.defaultDesign, 'ocean');
  assert.equal(s.defaultDevice, 'desktop');
  assert.equal(s.leftWidth, 230);
  assert.equal(s.autoFit, true);
  assert.equal(s.startCardOpacity, 20);
  assert.equal(defaultSettings('ko').language, 'ko');
});

test('a new installation resets preferences once and keeps the user data', () => {
  const storage = new Memory();
  storage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', lastDirectory: 'C:/sites', tutorialDone: true }));
  storage.setItem(RECENT_KEY, '[{"path":"a.myhome"}]');
  storage.setItem('myhomemaker.popup.settings', '{}');
  assert.ok(resetForNewInstall(storage, 'token-1'));
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { lastDirectory: 'C:/sites', tutorialDone: true });
  assert.ok(storage.getItem(RECENT_KEY));
  assert.equal(storage.getItem('myhomemaker.popup.settings'), null);
  assert.ok(!resetForNewInstall(storage, 'token-1'));
  assert.ok(applyInstallLanguage(storage, 'en'));
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).language, 'en');
});

test('zoom steps and recent files', () => {
  assert.equal(zoomStep(100, 1), 110);
  assert.equal(zoomStep(10, -1), 10);
  let list = [];
  for (let i = 0; i < 12; i++) list = addRecent(list, { path: `C:/s/${i}.myhome` });
  assert.equal(list.length, 10);
  assert.equal(list[0].path, 'C:/s/11.myhome');
  list = addRecent(list, { path: 'c:\\s\\5.MYHOME' });
  assert.equal(list.filter((x) => /5\.myhome/i.test(x.path)).length, 1);
  assert.equal(removeRecent(list, 'C:/s/11.myhome').length, list.length - 1);
});

test('the open site: changes, undo, redo, dirty, paths', () => {
  const doc = new SiteDocument(buildTemplate('blank', 'en'));
  assert.equal(doc.dirty, false);
  doc.apply('add', (site) => S.insertBlocks(site.pages[0], [S.createBlock('text')]));
  assert.equal(doc.dirty, true);
  assert.equal(doc.site.pages[0].blocks.length, 2);
  assert.equal(doc.undo(), 'add');
  assert.equal(doc.site.pages[0].blocks.length, 1);
  assert.equal(doc.redo(), 'add');
  assert.equal(doc.site.pages[0].blocks.length, 2);
  doc.markSaved('C:/x/site.myhome');
  assert.equal(doc.dirty, false);
  assert.equal(S.parseSite(doc.text()).pages[0].blocks.length, 2);
  assert.equal(baseName('C:\\a\\b.myhome'), 'b.myhome');
  assert.equal(directoryOf('C:\\a\\b.myhome'), 'C:\\a');
  assert.equal(withExtension('a.json', 'myhome'), 'a.myhome');
  assert.equal(fileSafe('a/b:c'), 'a_b_c');
});
