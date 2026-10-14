import assert from 'node:assert/strict';
import test from 'node:test';
import { lastDirectory, parentDirectory, rememberDirectory, rememberRecent } from '../src/recent.js';

function useMemoryStorage() {
  const items = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key),
    },
  });
}

test('parent folder of windows, unix and drive-root paths', () => {
  assert.equal(parentDirectory('C:\\Users\\me\\Pictures\\cat.png'), 'C:\\Users\\me\\Pictures');
  assert.equal(parentDirectory('C:\\cat.png'), 'C:\\');
  assert.equal(parentDirectory('/home/me/cat.png'), '/home/me');
  assert.equal(parentDirectory('/cat.png'), '/');
  assert.equal(parentDirectory('cat.png'), '');
});

test('open dialog starts in the folder of the last opened file', () => {
  useMemoryStorage();
  assert.equal(lastDirectory(), '');
  rememberRecent([{ path: 'D:\\photos\\a.jpg', name: 'a.jpg' }]);
  assert.equal(lastDirectory(), 'D:\\photos');
  rememberDirectory('E:\\scans\\2026\\b.png');
  assert.equal(lastDirectory(), 'E:\\scans\\2026');
});
