import assert from 'node:assert/strict';
import test from 'node:test';
import { cardsFromClipboard, cardsToClipboard, CLIP_FORMAT } from '../../src/domain/clipboard.js';
import { addRecent, loadRecent, MAX_RECENT, removeRecent, storeRecent } from '../../src/domain/recent.js';
import { columnTitles, defaultSettings, loadSettings, normalizeSettings, STORAGE_KEY, storeSettings } from '../../src/domain/settings.js';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};

test('settings: defaults, store and load round trip', () => {
  const storage = memory();
  const settings = { ...defaultSettings('en'), theme: 'nord', fontSize: 18, fontFamily: 'Arial', zoom: 150 };
  assert.ok(storeSettings(storage, settings));
  assert.deepEqual(loadSettings(storage), settings);
});

test('settings: broken storage falls back to defaults', () => {
  const storage = memory();
  storage.setItem(STORAGE_KEY, '{oops');
  const settings = loadSettings(storage);
  assert.equal(settings.theme, 'light');
  assert.equal(settings.zoom, 100);
});

test('settings: out-of-range values are repaired', () => {
  const s = normalizeSettings({ language: 'fr', fontSize: 400, fontWeight: 123, fontStyle: 'oblique', zoom: 5, backgroundOpacity: -9, backgroundFit: 'x', cardDensity: '?', showLeftPanel: 'yes', transparency: 50 }, 'ko');
  assert.equal(s.language, 'ko');
  assert.equal(s.fontSize, 28);
  assert.equal(s.fontWeight, 400);
  assert.equal(s.fontStyle, 'normal');
  assert.equal(s.zoom, 30);
  assert.equal(s.backgroundOpacity, 0);
  assert.equal(s.backgroundFit, 'cover');
  assert.equal(s.cardDensity, 'comfortable');
  assert.equal(s.showLeftPanel, true);
  assert.equal('transparency' in s, false, 'the removed transparency setting is dropped');
});

test('settings: new board columns are comma separated', () => {
  assert.deepEqual(columnTitles(' a, b ,,c '), ['a', 'b', 'c']);
  assert.deepEqual(columnTitles(defaultSettings('ko').newBoardColumns), ['할 일', '진행 중', '완료']);
});

test('recent files: newest first, no duplicates, at most 10', () => {
  let list = [];
  for (let i = 0; i < 14; i++) list = addRecent(list, { path: `C:\\b\\${i}.mkanban`, title: `${i}` });
  assert.equal(list.length, MAX_RECENT);
  assert.equal(list[0].path, 'C:\\b\\13.mkanban');
  list = addRecent(list, { path: 'c:/B/5.MKANBAN' });
  assert.equal(list[0].path, 'c:/B/5.MKANBAN');
  assert.equal(list.filter((item) => item.path.toLowerCase().includes('5.mkanban')).length, 1, 'same file, other spelling, counted once');
  list = removeRecent(list, 'C:\\b\\13.mkanban');
  assert.ok(!list.some((item) => item.path.endsWith('13.mkanban')));
  const storage = memory();
  storeRecent(storage, list);
  assert.deepEqual(loadRecent(storage), list);
  storeRecent(storage, []);
  assert.deepEqual(loadRecent(storage), []);
});

test('clipboard: our cards round-trip with every field', () => {
  const cards = [{ id: 'a', title: 'x', description: 'd', color: 'red', tags: ['t'] }];
  const text = cardsToClipboard(cards);
  assert.ok(text.includes(CLIP_FORMAT));
  const back = cardsFromClipboard(text);
  assert.deepEqual(back, [{ title: 'x', description: 'd', color: 'red', tags: ['t'] }]);
});

test('clipboard: plain text becomes one card per line', () => {
  assert.deepEqual(cardsFromClipboard('- one\n* two\n\n3) three\n[ ] four\n  five  '), ['one', 'two', 'three', 'four', 'five'].map((title) => ({ title })));
  assert.deepEqual(cardsFromClipboard('   '), []);
  assert.deepEqual(cardsFromClipboard('{"not":"ours"}'), [{ title: '{"not":"ours"}' }]);
});
