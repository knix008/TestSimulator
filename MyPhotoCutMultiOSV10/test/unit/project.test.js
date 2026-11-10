// Projects (.mypcut), Undo history, settings and recent files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultItems, FormatError, isOpenableName, isPhotoName, isProjectName, MAX_ITEMS, newItem, normalizeItem, parseProject, safeFileName, serializeProject, varyItem, extensionOf, stripExtension, directoryOf, baseName,
} from '../../src/domain/project.js';
import { History } from '../../src/domain/history.js';
import { defaultSettings, loadSettings, normalizeSettings, resetForNewInstall, STORAGE_KEY, zoomStep, applyInstallLanguage } from '../../src/domain/settings.js';
import { addRecent, removeRecent } from '../../src/domain/recent.js';
import { DEFAULT_STYLE_IDS, styleById } from '../../src/engine/styles.js';
import { featuresFromEllipse } from '../../src/engine/face.js';
import { newEffect } from '../../src/engine/effects.js';
import { SAMPLE_PHOTOS } from '../../src/domain/samples.js';

const PHOTO = { name: 'me.jpg', type: 'image/jpeg', width: 400, height: 500, data: 'data:image/jpeg;base64,AAAA' };

test('project: a new photo gets one caricature of every default style (forty)', () => {
  const items = defaultItems();
  assert.equal(items.length, 40);
  assert.deepEqual(items.map((i) => i.styleId), DEFAULT_STYLE_IDS);
  assert.equal(new Set(items.map((i) => i.id)).size, 40);
  const item = newItem('chibi', 5);
  assert.equal(item.warp.head, styleById('chibi').warp.head);
  assert.equal(item.seed, 5);
});

test('project: variations stay within the spread and get a new id', () => {
  const item = newItem('cartoon', 1);
  const v = varyItem(item, 99, 0.1);
  assert.notEqual(v.id, item.id);
  assert.equal(v.seed, 99);
  for (const key of ['head', 'eyes', 'nose']) assert.ok(Math.abs(v.warp[key] - item.warp[key]) <= item.warp[key] * 0.1 + 0.011, key);
});

test('project: save and open give the same project', () => {
  const items = [newItem('cartoon', 1), { ...newItem('popart', 2), name: '팝!', effects: [newEffect('caption', { text: 'Hi' })] }];
  const features = featuresFromEllipse({ cx: 200, cy: 210, rx: 70, ry: 90, angle: 0 }, 'landmarks');
  const text = serializeProject({ name: 'Me', photo: PHOTO, features, items, selected: items[1].id, autoCrop: false, crop: { x: 10, y: 20, w: 300, h: 400 } });
  const back = parseProject(text);
  assert.equal(back.name, 'Me');
  assert.deepEqual(back.photo, PHOTO);
  assert.equal(back.items.length, 2);
  assert.equal(back.items[1].name, '팝!');
  assert.equal(back.items[1].effects[0].text, 'Hi');
  assert.equal(back.selected, items[1].id);
  assert.equal(back.autoCrop, false);
  assert.deepEqual(back.crop, { x: 10, y: 20, w: 300, h: 400 });
  assert.deepEqual(back.features.face, features.face);
});

test('project: broken files are refused with a reason', () => {
  const code = (text) => { try { parseProject(text); return null; } catch (error) { assert.ok(error instanceof FormatError); return error.code; } };
  assert.equal(code('{nope'), 'format.notJson');
  assert.equal(code('{"format":"other"}'), 'format.notProject');
  assert.equal(code('{"format":"myphotocut","version":99}'), 'format.newer');
  assert.equal(code('{"format":"myphotocut","version":1,"photo":{"data":"x"}}'), 'format.badPhoto');
});

test('project: bad items and crops are dropped, at most 80 items', () => {
  const raw = { format: 'myphotocut', version: 1, photo: PHOTO, items: [{ styleId: 'nope' }, null, newItem('ink', 1), ...Array.from({ length: 90 }, () => newItem('oil'))], crop: { x: -5, y: 0, w: 10, h: 10 } };
  const back = parseProject(JSON.stringify(raw));
  assert.equal(back.items.length, MAX_ITEMS);
  assert.equal(back.items[0].styleId, 'ink');
  assert.equal(back.crop, null);
  assert.equal(back.features, null);
  assert.equal(normalizeItem({ styleId: 'sketch', warp: { head: 50 }, effects: [{ id: 'bad' }, { id: 'sepia' }] }).effects.length, 1);
});

test('project: file names', () => {
  assert.ok(isPhotoName('A.JPG') && isPhotoName('b.webp') && !isPhotoName('c.txt'));
  assert.ok(isProjectName('x.mypcut') && isOpenableName('x.mypcut') && isOpenableName('y.png'));
  assert.equal(extensionOf('C:\\a.b\\photo.JPEG'), 'jpeg');
  assert.equal(stripExtension('photo.final.png'), 'photo.final');
  assert.equal(directoryOf('C:\\pics\\a.png'), 'C:\\pics');
  assert.equal(baseName('/x/y/z.png'), 'z.png');
  assert.equal(safeFileName('a/b:c?'), 'a_b_c_');
});

test('history: undo, redo, labels and merged steps', () => {
  const h = new History();
  h.push({ v: 1 }, 'one', { now: 0 });
  h.push({ v: 2 }, 'two', { merge: 'k', now: 10_000 });
  assert.equal(h.push({ v: 3 }, 'two again', { merge: 'k', now: 10_500 }), false, 'merged into the previous step');
  assert.equal(h.undoLabel, 'two');
  const back = h.undo({ v: 4 });
  assert.deepEqual(back.state, { v: 2 });
  assert.ok(h.canRedo);
  assert.deepEqual(h.redo({ v: 2 }).state, { v: 4 });
  h.undo({ v: 4 });
  h.push({ v: 9 }, 'new', { now: 20_000 });
  assert.equal(h.canRedo, false, 'a new change clears redo');
  const limited = new History(3);
  for (let i = 0; i < 6; i++) limited.push({ i }, `s${i}`, { now: i * 5000 });
  assert.equal(limited.undoStack.length, 3);
});

test('settings: defaults, repairs and the style set', () => {
  const s = defaultSettings('ko');
  assert.equal(s.styleSet.length, 40);
  assert.equal(s.autoGenerate, true);
  const fixed = normalizeSettings({ language: 'en', workSize: 7, exportSize: 1200, styleSet: ['nope', 'ink', 'ink'], galleryColumns: 9, theme: 'zzz' });
  assert.equal(fixed.language, 'en');
  assert.equal(fixed.workSize, 480);
  assert.equal(fixed.exportSize, 1200);
  assert.deepEqual(fixed.styleSet, ['ink']);
  assert.equal(fixed.galleryColumns, 0);
  assert.deepEqual(normalizeSettings({ styleSet: [] }).styleSet, DEFAULT_STYLE_IDS);
  assert.equal(zoomStep(100, 1), 125);
  assert.equal(zoomStep(100, -1), 75);
});

test('settings: storage, the installer language and a new installation', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i], get length() { return store.size; } };
  assert.ok(applyInstallLanguage(storage, 'en'));
  assert.equal(loadSettings(storage).language, 'en');
  store.set(STORAGE_KEY, JSON.stringify({ theme: 'dark', styleSet: ['ink'], language: 'en' }));
  store.set('myphotocut.popup.menu', '{}');
  assert.ok(resetForNewInstall(storage, 'token-1'));
  assert.equal(store.has('myphotocut.popup.menu'), false);
  assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)), { styleSet: ['ink'] });
  assert.equal(resetForNewInstall(storage, 'token-1'), false, 'once per token');
});

test('recent files: newest first, no duplicates, at most 10', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = addRecent(list, { path: `C:\\p\\${i}.png` });
  assert.equal(list.length, 10);
  assert.equal(list[0].path, 'C:\\p\\11.png');
  list = addRecent(list, { path: 'c:/p/5.PNG' });
  assert.equal(list.filter((x) => x.path.toLowerCase().endsWith('5.png')).length, 1);
  assert.equal(removeRecent(list, 'C:\\p\\11.png').length, list.length - 1);
});

test('samples: ten public-domain portraits of famous people and paintings', () => {
  assert.equal(SAMPLE_PHOTOS.length, 10);
  assert.ok(!SAMPLE_PHOTOS.some((s) => /armstrong|ride|jemison/.test(s.id)), 'no astronauts');
  for (const s of SAMPLE_PHOTOS) assert.ok(s.file && s.ko && s.en && s.commons, s.id);
});
