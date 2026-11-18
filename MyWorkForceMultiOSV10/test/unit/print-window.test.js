import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { defaultSetup, geometryOf, pagesInRange, PAPERS } = await import('../../src/ui/printwin.js');

describe('Print window', () => {
  test('paper, orientation and margins give the page and its content box in millimetres', () => {
    const a4 = geometryOf(defaultSetup());
    assert.equal(a4.width, 210);
    assert.equal(a4.height, 297);
    assert.deepEqual(a4.margins, { top: 15, right: 15, bottom: 15, left: 15 });
    assert.equal(a4.inner.width, 180);
    assert.equal(a4.inner.height, 297 - 30 - 9 - 8, 'header and footer take their room');
    const wide = geometryOf({ ...defaultSetup(), paper: 'A3', orientation: 'landscape', margin: 'narrow', header: false, footer: false });
    assert.deepEqual([wide.width, wide.height], [420, 297]);
    assert.equal(wide.inner.height, 297 - 16);
    const custom = geometryOf({ ...defaultSetup(), margin: 'custom', custom: { top: 30, right: 10, bottom: 99, left: -5 } });
    assert.deepEqual(custom.margins, { top: 30, right: 10, bottom: 60, left: 0 }, 'custom margins stay within 0-60 mm');
  });

  test('every common paper is offered', () => {
    for (const name of ['A3', 'A4', 'A5', 'B4', 'B5', 'Letter', 'Legal']) assert.ok(PAPERS[name], name);
  });

  test('a page range picks pages inside the document, or all when it makes no sense', () => {
    assert.deepEqual(pagesInRange('1-3, 5', 8), [1, 2, 3, 5]);
    assert.deepEqual(pagesInRange('6-4', 8), [4, 5, 6]);
    assert.deepEqual(pagesInRange('7-12', 8), [7, 8]);
    assert.deepEqual(pagesInRange('', 3), [1, 2, 3]);
    assert.deepEqual(pagesInRange('abc', 2), [1, 2]);
  });
});
