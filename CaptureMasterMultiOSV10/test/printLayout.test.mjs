import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPages, sheetSize, docsInScope, sourceRect, DEFAULT_PRINT_SETTINGS, MM_PER_PX, PAPERS } from '../src/lib/printLayout.js';

const wide = { id: 'a', width: 2000, height: 1000, selection: { x: 100, y: 100, w: 400, h: 800 } };
const tall = { id: 'b', width: 600, height: 900, selection: null };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('auto orientation follows most pictures', () => {
  assert.equal(sheetSize(DEFAULT_PRINT_SETTINGS, [{ w: 2, h: 1 }]).landscape, true);
  assert.equal(sheetSize(DEFAULT_PRINT_SETTINGS, [{ w: 2, h: 1 }, { w: 1, h: 2 }]).landscape, false);
  const s = sheetSize({ ...DEFAULT_PRINT_SETTINGS, orientation: 'portrait' }, [{ w: 2, h: 1 }]);
  assert.deepEqual([s.w, s.h], [210, 297]);
});

test('fit centres the picture inside the margins', () => {
  const { sheet, content, pages } = layoutPages([wide], DEFAULT_PRINT_SETTINGS);
  assert.deepEqual([sheet.w, sheet.h], [297, 210]);
  const { box } = pages[0];
  near(box.w, content.w);                      // width-limited: 2:1 in a 271.6 × 184.6 area
  near(box.h, content.w / 2);
  near(box.y, (content.h - box.h) / 2);
});

test('selection only crops the current document', () => {
  const { pages } = layoutPages([wide], { ...DEFAULT_PRINT_SETTINGS, orientation: 'portrait' }, { selectionOnly: true, currentId: 'a' });
  const { box, img } = pages[0];
  near(box.w / box.h, 400 / 800);
  const s = box.w / 400;
  near(img.x, -100 * s);
  near(img.w, 2000 * s);
});

test('actual size uses 96 DPI and header shrinks the content area', () => {
  const { content, pages } = layoutPages([tall], { ...DEFAULT_PRINT_SETTINGS, layout: 'actual', header: true, margin: 'none' });
  near(pages[0].box.w, 600 * MM_PER_PX);
  near(content.h, 297 - 7);
});

test('fill covers the sheet and custom scale follows the percent', () => {
  const filled = layoutPages([wide], { ...DEFAULT_PRINT_SETTINGS, layout: 'fill', orientation: 'landscape' });
  assert.ok(filled.pages[0].box.w >= filled.content.w - 0.01);
  assert.ok(filled.pages[0].box.h >= filled.content.h - 0.01);
  const custom = layoutPages([wide], { ...DEFAULT_PRINT_SETTINGS, layout: 'custom', scale: 50, margin: 'none', orientation: 'landscape' });
  near(custom.pages[0].box.w, 2000 * MM_PER_PX * 0.5);
  const unknown = sheetSize({ paper: 'tabloid', orientation: 'portrait' }, []);
  assert.equal(unknown.paper.id, PAPERS[0].id);
  assert.equal(unknown.landscape, false);
});

test('a missing selection prints the whole picture', () => {
  assert.deepEqual(sourceRect({ id: 'a', width: 80, height: 40 }, true, 'a'), { x: 0, y: 0, w: 80, h: 40 });
  assert.deepEqual(sourceRect({ id: 'a', width: 80, height: 40, selection: { x: 1, y: 2, w: 0, h: 9 } }, true, 'a'), { x: 0, y: 0, w: 80, h: 40 });
  assert.deepEqual(sourceRect({ id: 'b', width: 0, height: 0 }, false, 'b'), { x: 0, y: 0, w: 1, h: 1 });
});

test('scope picks documents', () => {
  const docs = [wide, tall];
  assert.deepEqual(docsInScope(docs, 'current', 'b', new Set()).map((d) => d.id), ['b']);
  assert.deepEqual(docsInScope(docs, 'custom', null, new Set(['a'])).map((d) => d.id), ['a']);
  assert.equal(docsInScope(docs, 'all', null, new Set()).length, 2);
});
