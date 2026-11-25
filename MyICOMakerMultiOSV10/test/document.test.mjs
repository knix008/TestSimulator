import test from 'node:test';
import assert from 'node:assert/strict';
import { addRecent, baseName, emptyDesign, parseDesign, serializeDesign } from '../src/lib/project.js';
import { createHistory } from '../src/lib/history.js';
import { createObject, objToSvg } from '../src/lib/iconCanvas.js';
import { TEMPLATES } from '../src/lib/templates.js';
import { EXAMPLES } from '../src/lib/examples.js';
import { EMOJI, EMOJI_ART, EMOJI_BY_ID, EMOJI_CATEGORIES, emojiChar, emojiIn } from '../src/lib/emoji.js';
import { BOX_TYPES, serializeSvg } from '../src/lib/iconCanvas.js';
import { encodeIco, encodeIcns } from '../src/lib/ico.js';

test('a design survives saving and opening', () => {
  const d = { ...emptyDesign(), background: '#123456', bgShape: 'circle', objects: [{ ...createObject('heart', 0, 0), x: 1, y: 2, w: 3, h: 4 }] };
  const back = parseDesign(serializeDesign(d, 'logo'));
  assert.equal(back.background, '#123456');
  assert.equal(back.bgShape, 'circle');
  assert.equal(back.objects.length, 1);
  assert.equal(back.objects[0].shape, 'heart');
  assert.equal(JSON.parse(serializeDesign(d, 'logo')).format, 'MyICOMaker');
});

test('bad files are refused; missing parts get defaults; ids are made unique', () => {
  assert.throws(() => parseDesign('not json'), /BAD_FILE/);
  assert.throws(() => parseDesign('{"format":"Other","design":{"objects":[]}}'), /BAD_FILE/);
  assert.throws(() => parseDesign('{"format":"MyICOMaker","version":99,"design":{"objects":[]}}'), /NEWER_FILE/);
  const d = parseDesign(JSON.stringify({ format: 'MyICOMaker', version: 1, design: { objects: [{ type: 'rect', id: 'a' }, { type: 'rect', id: 'a' }, { type: 'virus' }, 5] } }));
  assert.equal(d.objects.length, 2, 'unknown objects are dropped');
  assert.notEqual(d.objects[0].id, d.objects[1].id);
  assert.equal(d.objects[0].fx.depth, 6, 'effects get their defaults');
  assert.ok(d.sizes.length > 0);
});

test('file names and the recent list', () => {
  assert.equal(baseName('C:\\a\\b\\logo.myico'), 'logo');
  assert.equal(baseName('/home/x/app.icon.myico'), 'app.icon');
  let list = [];
  for (let i = 0; i < 15; i += 1) list = addRecent(list, { path: `C:/d/${i}.myico` });
  assert.equal(list.length, 12);
  list = addRecent(list, { path: 'c:/D/3.MYICO'.replace('MYICO', 'myico') });
  assert.equal(list[0].path, 'c:/D/3.myico');
  assert.equal(list.filter((x) => x.path.toLowerCase() === 'c:/d/3.myico').length, 1, 'no duplicates (case-insensitive)');
});

test('undo and redo walk through the snapshots; quick edits of one key are one step', () => {
  let now = 0;
  const h = createHistory({ now: () => now });
  assert.equal(h.canUndo, false);
  h.push('A');
  h.push('B');
  assert.equal(h.undo('C'), 'B');
  assert.equal(h.undo('B'), 'A');
  assert.equal(h.undo('A'), null);
  assert.equal(h.redo('A'), 'B');
  assert.equal(h.redo('B'), 'C');
  assert.equal(h.canRedo, false);
  h.clear();
  h.push('x', 'slider'); now += 100;
  h.push('y', 'slider'); now += 100;
  h.push('z', 'slider');
  assert.equal(h.size, 1, 'one step while dragging a slider');
  now += 5000;
  h.push('w', 'slider');
  assert.equal(h.size, 2, 'a later change is a new step');
  h.push('v');
  h.undo('now');
  h.push('new');
  assert.equal(h.canRedo, false, 'a new change drops the redo steps');
});

test('every template builds a fresh design that draws', () => {
  assert.ok(TEMPLATES.length >= 12);
  for (const tpl of TEMPLATES) {
    const a = tpl.build();
    const b = tpl.build();
    assert.ok(Array.isArray(a.objects), tpl.id);
    if (a.objects.length) assert.notEqual(a.objects[0].id, b.objects[0].id, `${tpl.id}: new ids each time`);
    for (const o of a.objects) assert.doesNotMatch(objToSvg(o), /NaN|undefined/, `${tpl.id}`);
  }
});

test('at least 100 emoji: every one has art, both names and a category', () => {
  assert.ok(EMOJI.length >= 100, `${EMOJI.length} emoji`);
  assert.equal(new Set(EMOJI.map((e) => e.id)).size, EMOJI.length, 'no emoji twice');
  for (const e of EMOJI) {
    assert.ok(EMOJI_ART[e.id]?.startsWith('<'), `${e.id} has art`);
    assert.ok(e.ko && e.en, `${e.id} has names`);
    assert.ok(EMOJI_CATEGORIES.some((c) => c.id === e.cat), `${e.id} category`);
  }
  for (const c of EMOJI_CATEGORIES) {
    assert.ok(emojiIn(c.id).length >= 10, `${c.id} has emoji`);
    assert.ok(EMOJI_ART[c.icon], `${c.id} tab icon`);
  }
  assert.equal(emojiChar('1f600'), '😀');
  assert.equal(EMOJI_BY_ID['1f680'].en, 'Rocket');
});

test('an emoji object draws its vector art in its box, rotates and survives saving', () => {
  assert.ok(BOX_TYPES.includes('emoji'));
  const o = { ...createObject('emoji', 100, 50), w: 200, h: 200, emoji: '1f600', rotate: 30, fx: { ...createObject('emoji', 0, 0).fx, gloss: true } };
  const svg = objToSvg(o);
  assert.match(svg, /<svg x="100" y="50" width="200" height="200" viewBox="0 0 36 36"/);
  assert.match(svg, /fill="#FFCC4D"/, 'the art is inside');
  assert.match(svg, /rotate\(30\)/);
  assert.match(svg, /url\(#gl-/, 'gloss follows the round outline');
  const doc = { ...emptyDesign(), objects: [o] };
  const back = parseDesign(serializeDesign(doc, 'e'));
  assert.equal(back.objects[0].type, 'emoji');
  assert.equal(back.objects[0].emoji, '1f600');
  assert.match(serializeSvg(back, 64), /viewBox="0 0 36 36"/);
});

test('20 examples build fresh designs that draw, most with emoji', () => {
  assert.equal(EXAMPLES.length, 20);
  assert.equal(new Set(EXAMPLES.map((e) => e.id)).size, 20);
  let withEmoji = 0;
  for (const ex of EXAMPLES) {
    assert.ok(ex.ko && ex.en, ex.id);
    const a = ex.build();
    const b = ex.build();
    assert.ok(a.objects.length >= 2, ex.id);
    assert.notEqual(a.objects[0].id, b.objects[0].id, `${ex.id}: new ids each time`);
    for (const o of a.objects) {
      assert.doesNotMatch(objToSvg(o), /NaN|undefined/, ex.id);
      if (o.type === 'emoji') assert.ok(EMOJI_ART[o.emoji], `${ex.id}: emoji ${o.emoji} has art`);
    }
    if (a.objects.some((o) => o.type === 'emoji')) withEmoji += 1;
  }
  assert.ok(withEmoji >= 18, `${withEmoji} examples use emoji`);
});

const png = (n) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n]);

test('ICO files: directory entries point at the PNG data, 256 is written as 0', () => {
  const ico = encodeIco([{ size: 256, png: png(3) }, { size: 16, png: png(1) }, { size: 512, png: png(9) }]);
  const v = new DataView(ico.buffer);
  assert.equal(v.getUint16(2, true), 1, 'type: icon');
  assert.equal(v.getUint16(4, true), 2, 'entries above 256 are left out');
  assert.equal(ico[6], 16, 'sorted, 16 first');
  assert.equal(ico[6 + 16], 0, '256 → 0');
  const offset = v.getUint32(6 + 12, true);
  assert.deepEqual([...ico.slice(offset, offset + 5)], [...png(1)]);
  assert.throws(() => encodeIco([]), /at least one/);
});

test('ICNS files: big-endian lengths and PNG chunk types', () => {
  const icns = encodeIcns([{ size: 32, png: png(1) }, { size: 1024, png: png(2) }]);
  assert.equal(String.fromCharCode(...icns.slice(0, 4)), 'icns');
  assert.equal(new DataView(icns.buffer).getUint32(4, false), icns.length);
  assert.equal(String.fromCharCode(...icns.slice(8, 12)), 'icp5');
  assert.equal(String.fromCharCode(...icns.slice(8 + 13, 8 + 17)), 'ic10');
});

test('guide pages: blocks fill a page, a heading never ends one, a tall block gets its own', async () => {
  const { planPages, guideFile } = await import('../src/lib/docPages.js');
  const unit = (top, height, keepWithNext = false) => ({ top, bottom: top + height, keepWithNext });
  // 100 px pages: three 40 px blocks → two on the first page, one on the second.
  assert.deepEqual(planPages([unit(0, 40), unit(40, 40), unit(80, 40)], 100), [[0, 1], [2]]);
  // A heading at the bottom of a page moves to the next page with its paragraph.
  assert.deepEqual(planPages([unit(0, 50), unit(50, 20, true), unit(70, 40)], 100), [[0], [1, 2]]);
  // A block taller than a page is alone on its page.
  assert.deepEqual(planPages([unit(0, 30), unit(30, 250), unit(280, 10)], 100), [[0], [1], [2]]);
  assert.deepEqual(planPages([], 100), []);
  // A table row that starts a page brings the repeated header row (lead) along.
  const rows = [unit(0, 30), unit(30, 30), unit(60, 30), { ...unit(90, 30), lead: 20 }, { ...unit(120, 30), lead: 20 }, { ...unit(150, 30), lead: 20 }];
  assert.deepEqual(planPages(rows, 100), [[0, 1, 2], [3, 4], [5]], '20 + 30 + 30 fits; a third row would not');
  assert.equal(guideFile('en'), 'docs/UsersGuide.en.html');
  assert.equal(guideFile('ko'), 'docs/UsersGuide.html');
});

test('My emoji and my examples: added, listed, removed; bad items refused', async () => {
  const lib = await import('../src/lib/userLibrary.js');
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  assert.deepEqual(lib.loadUserEmoji(storage), []);
  const a = lib.addUserEmoji({ name: 'logo', href: 'data:image/svg+xml,<svg/>' }, storage);
  lib.addUserEmoji({ name: '', href: 'data:image/png;base64,AAAA' }, storage);
  assert.equal(lib.loadUserEmoji(storage).length, 2);
  assert.equal(lib.loadUserEmoji(storage)[1].name, 'emoji', 'an empty name gets a default');
  assert.throws(() => lib.addUserEmoji({ name: 'x', href: 'javascript:alert(1)' }, storage), /BAD_PICTURE/);
  lib.removeUserEmoji(a.id, storage);
  assert.deepEqual(lib.loadUserEmoji(storage).map((e) => e.name), ['emoji']);
  const design = { ...emptyDesign(), objects: [createObject('heart', 1, 2)] };
  const ex = lib.addUserExample({ name: 'mine', design, thumb: 'data:image/svg+xml,x' }, storage);
  design.objects.push(createObject('star', 0, 0));
  assert.equal(lib.loadUserExamples(storage)[0].design.objects.length, 1, 'a copy is kept, not the live design');
  assert.throws(() => lib.addUserExample({ name: 'bad', design: {} }, storage), /BAD_FILE/);
  lib.removeUserExample(ex.id, storage);
  assert.equal(lib.loadUserExamples(storage).length, 0);
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.throws(() => lib.addUserEmoji({ name: 'x', href: 'data:image/png;base64,AA' }, full), /STORAGE_FULL/);
  mem.set(lib.USER_EMOJI_KEY, 'not json');
  assert.deepEqual(lib.loadUserEmoji(storage), [], 'a broken list reads as empty');
});

test('a selection as its own SVG is cropped to the object, with room for effects', async () => {
  const { selectionSvg } = await import('../src/lib/iconCanvas.js');
  const o = { ...createObject('star', 100, 120), w: 80, h: 60 };
  assert.match(selectionSvg([o]), /viewBox="100 120 80 60"/);
  const shadowed = { ...o, fx: { ...o.fx, shadow: true, shadowDy: 10, shadowBlur: 5 } };
  const [, x, y, w, h] = selectionSvg([shadowed]).match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/).map(Number);
  assert.ok(x < 100 && y < 120 && w > 80 && h > 60, 'the shadow fits');
  const turned = selectionSvg([{ ...o, rotate: 90 }]);
  assert.match(turned, /viewBox="110 110 60 80"/, 'a quarter turn swaps width and height');
  assert.equal(selectionSvg([]), '');
});

test('3D model files are recognised by their extension', async () => {
  const { MODEL_EXTS, isModelFile, VIEW_PRESETS, DEFAULT_VIEW } = await import('../src/lib/model3d.js');
  for (const ext of ['obj', 'stl', 'ply', 'glb', 'gltf', 'fbx', 'dae', '3mf', '3ds', 'amf', 'wrl']) assert.ok(MODEL_EXTS.includes(ext), ext);
  assert.ok(isModelFile('Robot.OBJ'));
  assert.ok(!isModelFile('photo.png'));
  assert.ok(Object.keys(VIEW_PRESETS).includes('iso'));
  assert.equal(DEFAULT_VIEW.zoom, 100);
});
