import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addToGallery, GALLERY_KEY, GALLERY_LIMIT, loadGallery, removeFromGallery, sanitizeGallery, storeGallery,
} from '../../src/domain/gallery.js';

const image = (path, extra = {}) => ({ kind: 'image', path, thumbnail: 'data:image/jpeg;base64,AA', width: 10, height: 5, bytes: 9, ...extra });

test('newest first, same path replaced, capped', () => {
  let items = [];
  items = addToGallery(items, image('a.png'));
  items = addToGallery(items, { kind: 'video', path: 'b.mp4', durationMs: 3000 });
  assert.deepEqual(items.map((item) => item.path), ['b.mp4', 'a.png']);
  assert.equal(items[0].durationMs, 3000);
  items = addToGallery(items, image('a.png', { bytes: 99 }));
  assert.deepEqual(items.map((item) => item.path), ['a.png', 'b.mp4']);
  assert.equal(items[0].bytes, 99);
  for (let i = 0; i < GALLERY_LIMIT + 5; i++) items = addToGallery(items, image(`${i}.png`));
  assert.equal(items.length, GALLERY_LIMIT);
  assert.equal(items[0].path, `${GALLERY_LIMIT + 4}.png`);
});

test('ids are unique and removal works for one or all', () => {
  let items = [image('a.png'), image('b.png'), image('c.png')].reduce(addToGallery, []);
  assert.equal(new Set(items.map((item) => item.id)).size, 3);
  items = removeFromGallery(items, [items[1].id]);
  assert.deepEqual(items.map((item) => item.path), ['c.png', 'a.png']);
  assert.deepEqual(removeFromGallery(items, items.map((item) => item.id)), []);
});

test('sanitize drops broken entries and duplicates', () => {
  const items = sanitizeGallery([
    image('a.png'),
    { kind: 'audio', path: 'x.mp3' },
    { kind: 'image' },
    image('a.png'),
    { kind: 'image', path: 'evil.png', thumbnail: 'javascript:alert(1)', durationMs: 5 },
    null,
  ]);
  assert.deepEqual(items.map((item) => item.path), ['a.png', 'evil.png']);
  assert.equal(items[1].thumbnail, null, 'only data:image thumbnails are kept');
  assert.equal(items[1].durationMs, null, 'images have no duration');
  assert.deepEqual(sanitizeGallery('nope'), []);
});

test('storage round-trip survives junk', () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  storeGallery(storage, [image('a.png')].reduce(addToGallery, []));
  assert.equal(loadGallery(storage)[0].path, 'a.png');
  memory.set(GALLERY_KEY, '{oops');
  assert.deepEqual(loadGallery(storage), []);
});
