import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, DEFAULT_SETTINGS, addRecent, removeRecent, MAX_RECENT, imageFormatByExt } from '../src/lib/settings.js';

test('nothing stored yields the defaults', () => {
  assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS, recent: [] });
  assert.deepEqual(normalizeSettings('garbage'), { ...DEFAULT_SETTINGS, recent: [] });
});

test('invalid values fall back field by field', () => {
  const s = normalizeSettings({
    language: 'fr', theme: 42, opacity: 500,
    font: { size: 'huge', bold: 'yes' },
    annotation: { color: 'red', strokeWidth: -3 },
    video: { fps: 17 },
    recent: [{ path: '' }, { path: 'C:/a.cmcap', kind: 'weird' }, 'x'],
  });
  assert.equal(s.language, 'ko');
  assert.equal(s.theme, DEFAULT_SETTINGS.theme);
  assert.equal(s.opacity, 100);
  assert.equal(s.font.size, DEFAULT_SETTINGS.font.size);
  assert.equal(s.font.bold, false);
  assert.equal(s.annotation.color, DEFAULT_SETTINGS.annotation.color);
  assert.equal(s.annotation.strokeWidth, 1);
  assert.equal(s.video.fps, DEFAULT_SETTINGS.video.fps);
  assert.equal(s.recent.length, 1);
  assert.equal(s.recent[0].kind, 'capture');
  assert.equal(s.recent[0].name, 'a.cmcap');
});

test('recent list is capped, de-duplicated and most-recent first', () => {
  let recent = [];
  for (let i = 0; i < MAX_RECENT + 5; i++) recent = addRecent(recent, { path: `/f${i}`, kind: 'image', name: `f${i}` });
  assert.equal(recent.length, MAX_RECENT);
  assert.equal(recent[0].path, `/f${MAX_RECENT + 4}`);
  recent = addRecent(recent, { path: '/f10', kind: 'image', name: 'f10' });
  assert.equal(recent.length, MAX_RECENT);
  assert.equal(recent[0].path, '/f10');
  assert.equal(recent.filter((r) => r.path === '/f10').length, 1);
  recent = removeRecent(recent, '/f10');
  assert.ok(!recent.some((r) => r.path === '/f10'));
});

test('export format is derived from the file extension', () => {
  assert.equal(imageFormatByExt('.JPG').id, 'jpeg');
  assert.equal(imageFormatByExt('webp').id, 'webp');
  assert.equal(imageFormatByExt('txt'), null);
});
