// Print documents (src/lib/printdoc.js): page setup, page ranges, the document's @page rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSetup, contentSizeMm, parsePageRanges, buildPrintHtml, PAPERS, PRINT_SETUP_DEFAULTS } from '../src/lib/printdoc.js';

test('setup: defaults, presets, custom margins, clamping', () => {
  const d = normalizeSetup();
  assert.deepEqual(d, { ...PRINT_SETUP_DEFAULTS });
  assert.equal(normalizeSetup({ margin: 'narrow' }).marginMm, 6);
  assert.equal(normalizeSetup({ margin: 'none' }).marginMm, 0);
  assert.equal(normalizeSetup({ margin: 'custom', marginMm: 70 }).marginMm, 50);
  assert.equal(normalizeSetup({ scale: 500 }).scale, 200);
  assert.equal(normalizeSetup({ scale: 'x' }).scale, 100);
  assert.equal(normalizeSetup({ paper: 'Nope' }).paper, 'A4');
  assert.equal(normalizeSetup({ header: false }).header, false);
});

test('printable area: paper minus margins, landscape swaps the sides', () => {
  assert.deepEqual(contentSizeMm({ paper: 'A4', margin: 'normal' }), [180, 267, 210, 297]);
  assert.deepEqual(contentSizeMm({ paper: 'A4', margin: 'normal', landscape: true }), [267, 180, 297, 210]);
  assert.deepEqual(contentSizeMm({ paper: 'Letter', margin: 'none' }), [PAPERS.Letter[0], PAPERS.Letter[1], PAPERS.Letter[0], PAPERS.Letter[1]]);
});

test('page ranges: "1-3, 5, 8-" → 0-based inclusive ranges, bad input → null', () => {
  assert.deepEqual(parsePageRanges('1-3, 5, 8-', 10), [{ from: 0, to: 2 }, { from: 4, to: 4 }, { from: 7, to: 9 }]);
  assert.deepEqual(parsePageRanges('-2', 10), [{ from: 0, to: 1 }]);
  assert.equal(parsePageRanges('', 10), null);
  assert.equal(parsePageRanges('3-1', 10), null);
  assert.equal(parsePageRanges('a', 10), null);
  assert.equal(parsePageRanges('0', 10), null);
});

test('document: @page follows the setup, zoom is the scale, header is optional, text is escaped', () => {
  const html = buildPrintHtml({ title: 'a<b>.txt', kind: 'text', text: '1 < 2', fontSize: 11, meta: 'UTF-8', setup: { paper: 'A5', landscape: true, margin: 'custom', marginMm: 8, scale: 80, header: true } });
  assert.match(html, /@page \{ size: A5 landscape; margin: 8mm; \}/);
  assert.match(html, /zoom: 0\.8;/);
  assert.match(html, /<header><span class="name">a&lt;b&gt;\.txt<\/span>/);
  assert.match(html, /<pre class="wrap">1 &lt; 2<\/pre>/);
  assert.match(html, /font-size: 11pt/);
  const bare = buildPrintHtml({ title: 'x', kind: 'text', text: 'x', setup: { header: false, color: false } });
  assert.doesNotMatch(bare, /<header>/);
  assert.match(bare, /grayscale\(1\)/);
  const img = buildPrintHtml({ title: 'p.png', kind: 'image', mime: 'image/png', base64: 'AAAA' });
  assert.match(img, /<img src="data:image\/png;base64,AAAA"/);
});
