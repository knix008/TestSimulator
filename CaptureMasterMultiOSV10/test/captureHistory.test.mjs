import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeHistory, addEntry, removeEntry, loadHistory, saveHistory, MAX_HISTORY, THUMB_SIZE } from '../src/lib/captureHistory.js';

test('normalizeHistory accepts the stored shape and drops junk', () => {
  const list = normalizeHistory({ version: 1, items: [
    { id: 'a', path: 'C:\\x\\a.png', kind: 'image', source: 'region', width: 10, height: 20, time: 5, thumb: 'data:image/jpeg;base64,AA' },
    null,
    { id: 'a', path: 'dup' },
    { path: 'C:\\x\\b.webm', kind: 'nonsense', source: 'nonsense', thumb: 'javascript:alert(1)' },
  ] });
  assert.equal(list.length, 2);
  assert.deepEqual([list[0].kind, list[0].source, list[0].width], ['image', 'region', 10]);
  assert.deepEqual([list[1].kind, list[1].source, list[1].thumb], ['image', 'screen', '']);
  assert.ok(list[1].id);
  assert.deepEqual(normalizeHistory('garbage'), []);
});

test('addEntry puts the newest first, replaces the same file and caps the list', () => {
  let list = addEntry([], { id: 'one', path: 'a.png' });
  list = addEntry(list, { id: 'two', path: 'b.png' });
  list = addEntry(list, { id: 'three', path: 'a.png' });
  assert.deepEqual(list.map((e) => e.id), ['three', 'two']);
  for (let i = 0; i < MAX_HISTORY + 5; i++) list = addEntry(list, { path: `${i}.png` });
  assert.equal(list.length, MAX_HISTORY);
});

test('removeEntry only removes the one entry', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(removeEntry(list, 'b').map((e) => e.id), ['a', 'c']);
  assert.equal(THUMB_SIZE, 240);
});

test('the web history round-trips through localStorage', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };
  assert.deepEqual(await loadHistory(''), []);
  const list = addEntry([], { path: 'C:/shots/a.png', kind: 'image', source: 'screen', width: 10, height: 8 });
  assert.equal(await saveHistory('', list), true);
  const back = await loadHistory('');
  assert.equal(back.length, 1);
  assert.equal(back[0].path, 'C:/shots/a.png');
  assert.equal(back[0].kind, 'image');
  store.set('capturemaster.history', '{');
  assert.deepEqual(await loadHistory(''), []);
});
