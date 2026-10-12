import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, DEFAULT_SETTINGS, addRecent, removeRecent, MAX_RECENT, imageFormatByExt, imageFormatById, imageFormatsFor, IMAGE_FORMATS, micOptions, HISTORY_WIDTH, TOOL_PANEL_WIDTH, AUDIO_GAIN } from '../src/lib/settings.js';
import { selectionShape } from '../src/lib/selection.js';

test('nothing stored yields the defaults', () => {
  assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS, recent: [] });
  assert.deepEqual(normalizeSettings('garbage'), { ...DEFAULT_SETTINGS, recent: [] });
});

test('invalid values fall back field by field', () => {
  const s = normalizeSettings({
    language: 'fr', theme: 42, opacity: 50,
    font: { size: 'huge', bold: 'yes' },
    annotation: { color: 'red', strokeWidth: -3 },
    video: { fps: 17 },
    recent: [{ path: '' }, { path: 'C:/a.cmcap', kind: 'weird' }, 'x'],
  });
  assert.equal(s.language, 'ko');
  assert.equal(s.theme, DEFAULT_SETTINGS.theme);
  assert.equal('opacity' in s, false);
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

test('microphone settings are clamped and turned into recorder options', () => {
  const s = normalizeSettings({ video: { microphone: true }, mic: { deviceId: 'abc', gain: 999, echoCancellation: 'no', autoGainControl: true } });
  assert.equal(s.mic.gain, 300);
  assert.equal(s.mic.echoCancellation, true);
  assert.deepEqual(micOptions(s), { deviceId: 'abc', gain: 3, echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  assert.equal(micOptions(normalizeSettings({ mic: { deviceId: 'abc' } })), false);
  assert.equal(normalizeSettings({ video: { systemAudioGain: -5 } }).video.systemAudioGain, 0);
  assert.equal(normalizeSettings({ video: { systemAudioGain: 'x' } }).video.systemAudioGain, 100);
});

test('tool panel width shares the capture history limits', () => {
  assert.deepEqual(normalizeSettings({}).toolPanel, { open: true, width: HISTORY_WIDTH.min });
  assert.equal(TOOL_PANEL_WIDTH.min, HISTORY_WIDTH.min);
  assert.equal(normalizeSettings({ toolPanel: { width: 50 } }).toolPanel.width, HISTORY_WIDTH.min);
  assert.equal(normalizeSettings({ toolPanel: { width: 9999, open: false } }).toolPanel.width, HISTORY_WIDTH.max);
  assert.equal(normalizeSettings({ toolPanel: { open: false } }).toolPanel.open, false);
  assert.equal(normalizeSettings({ history: { open: false } }).history.open, false);
  assert.equal(normalizeSettings({ history: { open: false }, toolPanel: { open: false } }).history.open, false);
});

test('selection shape is kept when known and falls back to a rectangle', () => {
  assert.equal(normalizeSettings({}).editor.selectionShape, 'rect');
  assert.equal(normalizeSettings({ editor: { selectionShape: 'ellipse' } }).editor.selectionShape, 'ellipse');
  assert.equal(normalizeSettings({ editor: { selectionShape: 'star' } }).editor.selectionShape, 'rect');
  assert.equal(selectionShape({ x: 0, y: 0, w: 1, h: 1 }), 'rect');
  assert.equal(selectionShape({ shape: 'round' }), 'round');
});

test('export format is derived from the file extension', () => {
  assert.equal(imageFormatByExt('.JPG').id, 'jpeg');
  assert.equal(imageFormatByExt('webp').id, 'webp');
  assert.equal(imageFormatByExt('txt'), null);
  assert.equal(imageFormatById('png').mime, 'image/png');
  assert.equal(imageFormatById('nope').id, 'png');
});

test('native image formats are omitted when the desktop encoder is absent', () => {
  const web = imageFormatsFor(false).map((f) => f.id);
  const native = imageFormatsFor(true).map((f) => f.id);
  assert.deepEqual(native, IMAGE_FORMATS.map((f) => f.id));
  assert.ok(web.includes('png') && web.includes('jpeg'));
  assert.ok(!web.includes('tiff') && !web.includes('qoi'));
  assert.equal(normalizeSettings({ image: { format: 'qoi', quality: 1000 } }).image.quality, 100);
  assert.equal(normalizeSettings({ image: { format: 'nope' } }).image.format, 'png');
});

test('custom themes are repaired, de-duplicated and capped', () => {
  const themes = normalizeSettings({
    customThemes: [
      { id: 'custom-a', label: '  Mine  ', mode: 'light', bg: 'red', accent: '#112233' },
      { id: 'custom-a', label: '' },
      null,
      ...Array.from({ length: 30 }, (_, i) => ({ id: `custom-n${i}`, label: 'x'.repeat(80) })),
    ],
  }).customThemes;
  assert.equal(themes[0].id, 'custom-a');
  assert.equal(themes[0].label, 'Mine');
  assert.equal(themes[0].mode, 'light');
  assert.equal(themes[0].bg, '#f6f7f9');
  assert.equal(themes[0].accent, '#112233');
  assert.notEqual(themes[1].id, 'custom-a');
  assert.equal(themes.length, 24);
  assert.equal(themes.at(-1).label.length, 40);
  assert.equal(AUDIO_GAIN.max, 300);
});
