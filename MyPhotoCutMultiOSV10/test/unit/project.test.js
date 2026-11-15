// Projects (.mypcut), Undo history, settings and recent files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  defaultItems, fixedSeed, randomizeItem, FormatError, isOpenableName, isPhotoName, isProjectName, MAX_ITEMS, newItem, normalizeItem, parseProject, safeFileName, serializeProject, varyItem, extensionOf, stripExtension, directoryOf, baseName,
} from '../../src/domain/project.js';
import { History } from '../../src/domain/history.js';
import { defaultSettings, loadSettings, normalizeSettings, resetForNewInstall, STORAGE_KEY, zoomStep, applyInstallLanguage } from '../../src/domain/settings.js';
import { addRecent, removeRecent } from '../../src/domain/recent.js';
import { DEFAULT_STYLE_IDS, normalizeOptions, styleById } from '../../src/engine/styles.js';
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

test('project: random generation gives different takes; fixed generation the same', () => {
  const a = defaultItems(DEFAULT_STYLE_IDS, 11, null, { randomize: true, spread: 0.12 });
  const b = defaultItems(DEFAULT_STYLE_IDS, 12, null, { randomize: true, spread: 0.12 });
  const look = (list) => list.map((i) => JSON.stringify([i.seed, i.warp, i.options]));
  const differ = look(a).filter((s, i) => s !== look(b)[i]).length;
  assert.equal(differ, DEFAULT_STYLE_IDS.length, 'every style draws a different picture');
  const optionsMoved = a.filter((item) => JSON.stringify(item.options) !== JSON.stringify(normalizeOptions(item.styleId, styleById(item.styleId).options))).length;
  assert.ok(optionsMoved >= DEFAULT_STYLE_IDS.length * 0.8, `style options moved for ${optionsMoved}`);
  for (const item of a) {
    const own = styleById(item.styleId).options;
    if (own.lines <= 0) assert.equal(item.options.lines, own.lines, `${item.styleId} keeps no lines`);
    if (own.texture <= 0) assert.equal(item.options.texture, own.texture, `${item.styleId} keeps no texture`);
    if (own.colors <= 2) assert.equal(item.options.colors, own.colors, `${item.styleId} keeps two colours`);
    assert.equal(item.options.background, own.background);
  }
  // Same seed, same take (an undo / a saved project redraws the same picture).
  assert.deepEqual(look([randomizeItem(newItem('cartoon', 5), 5)]), look([randomizeItem(newItem('cartoon', 5), 5)]));
  // Not random: a style always gets the same seed.
  assert.equal(fixedSeed('cartoon'), fixedSeed('cartoon'));
  assert.notEqual(fixedSeed(DEFAULT_STYLE_IDS[0]), fixedSeed(DEFAULT_STYLE_IDS[1]));
  assert.equal(defaultSettings().randomGenerate, true);
  assert.equal(normalizeSettings({ randomGenerate: false }).randomGenerate, false);
  assert.equal(normalizeSettings({ randomGenerate: 'x' }).randomGenerate, true);
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

test('samples: forty public-domain portraits of famous people and paintings', () => {
  assert.equal(SAMPLE_PHOTOS.length, 40);
  assert.equal(new Set(SAMPLE_PHOTOS.map((s) => s.id)).size, 40);
  assert.equal(new Set(SAMPLE_PHOTOS.map((s) => s.file)).size, 40);
  assert.ok(!SAMPLE_PHOTOS.some((s) => /armstrong|ride|jemison/.test(s.id)), 'no astronauts');
  for (const s of SAMPLE_PHOTOS) assert.ok(s.file && s.ko && s.en && s.commons, s.id);
});

test('samples: every portrait is on disk as a real JPEG and credited', () => {
  const dir = new URL('../../public/samples/', import.meta.url);
  const credits = fs.readFileSync(new URL('CREDITS.md', dir), 'utf8');
  const onDisk = fs.readdirSync(dir).filter((name) => name.endsWith('.jpg'));
  assert.deepEqual(onDisk.sort(), SAMPLE_PHOTOS.map((s) => s.file).sort(), 'no missing and no stray pictures');
  for (const s of SAMPLE_PHOTOS) {
    const bytes = fs.readFileSync(new URL(s.file, dir));
    assert.ok(bytes.length > 30000, `${s.file}: ${bytes.length} bytes`);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], `${s.file} is a JPEG`);
    assert.ok(credits.includes(`| ${s.file} |`), `${s.file} credited`);
  }
  assert.equal(new Set(SAMPLE_PHOTOS.map((s) => s.ko)).size, 40, 'Korean names distinct');
  assert.equal(new Set(SAMPLE_PHOTOS.map((s) => s.en)).size, 40, 'English names distinct');
});

test('project: fixed generation uses the style defaults; random keeps values in range', () => {
  for (const id of DEFAULT_STYLE_IDS) {
    const fixed = newItem(id, fixedSeed(id));
    assert.deepEqual(fixed.options, normalizeOptions(id, styleById(id).options), id);
    for (let seed = 1; seed < 30; seed++) {
      const r = randomizeItem(newItem(id, seed), seed, 0.4);
      for (const value of Object.values(r.warp)) assert.ok(value >= 0.5 && value <= 2.2, `${id} warp ${value}`);
      assert.ok(r.options.lines >= 0 && r.options.lines <= 5 && r.options.detail >= 0 && r.options.detail <= 100, id);
      assert.ok(r.options.colors >= 2 && r.options.colors <= 24 && Number.isInteger(r.options.colors), `${id} colours ${r.options.colors}`);
    }
  }
});
