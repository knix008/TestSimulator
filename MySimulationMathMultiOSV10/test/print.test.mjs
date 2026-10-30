// The print document (src/print/printdoc.js): page setup, sheet geometry,
// page ranges, text runs and the document's @page / page CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPERS, PRINT_DEFAULTS, normalizeSetup, paperSize, pageSize, pageGeometry, nupLayout,
  parsePageRanges, runsToLines, buildPrintHtml, splitHtml, dateText,
} from '../src/print/printdoc.js';

test('paper sizes: ISO A, JIS B, US; custom is clamped and kept portrait', () => {
  assert.deepEqual(PAPERS.A4, [210, 297]);
  assert.deepEqual(PAPERS.A3, [297, 420]);
  assert.deepEqual(PAPERS.A5, [148, 210]);
  assert.deepEqual(PAPERS.B4, [257, 364]);
  assert.deepEqual(PAPERS.B5, [182, 257]);
  assert.deepEqual(PAPERS.Letter, [215.9, 279.4]);
  assert.deepEqual(PAPERS.Legal, [215.9, 355.6]);
  assert.deepEqual(paperSize({ paper: 'custom', customW: 300, customH: 100 }), [100, 300]);
  assert.deepEqual(paperSize({ paper: 'custom', customW: 5, customH: 5000 }), [50, 1200]);
  assert.equal(normalizeSetup({ paper: 'Nope' }).paper, 'A4');
  assert.deepEqual(pageSize({ paper: 'A4', landscape: true }), [297, 210]);
});

test('setup: defaults and clamping', () => {
  const d = normalizeSetup();
  assert.equal(d.paper, PRINT_DEFAULTS.paper);
  assert.deepEqual(d.margins, { top: 15, right: 15, bottom: 15, left: 15 });
  assert.equal(normalizeSetup({ scale: 9999 }).scale, 400);
  assert.equal(normalizeSetup({ scale: 'x' }).scale, 100);
  assert.equal(normalizeSetup({ fontSize: 2 }).fontSize, 6);
  assert.equal(normalizeSetup({ nup: 3 }).nup, 1);
  assert.equal(normalizeSetup({ copies: 0 }).copies, 1);
  assert.equal(normalizeSetup({ duplex: 'x' }).duplex, 'none');
  assert.equal(normalizeSetup({ header: false }).header, false);
});

test('margins: presets set every side, custom per side (0..100 mm)', () => {
  assert.deepEqual(normalizeSetup({ margin: 'narrow' }).margins, { top: 8, right: 8, bottom: 8, left: 8 });
  assert.deepEqual(normalizeSetup({ margin: 'none' }).margins, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual(normalizeSetup({ margin: 'custom', margins: { top: 10, right: 200, bottom: -3, left: 12.5 } }).margins, { top: 10, right: 100, bottom: 0, left: 12.5 });
});

test('page geometry: content box = page minus margins; header / footer need room', () => {
  const g = pageGeometry({ paper: 'A4', margin: 'custom', margins: { top: 20, right: 15, bottom: 20, left: 25 }, header: true, date: true, pageNumbers: true });
  assert.equal(g.pw, 210);
  assert.equal(g.ph, 297);
  assert.equal(g.cw, 210 - 25 - 15);
  assert.equal(g.ch, 297 - 40);
  assert.equal(g.head.top, 13);
  assert.equal(g.foot.bottom, 13);
  // No margin: the bands still need 10 mm, the content moves in.
  const z = pageGeometry({ paper: 'A4', margin: 'none', header: true, pageNumbers: true });
  assert.equal(z.top, 10);
  assert.equal(z.bottom, 10);
  assert.equal(z.cw, 210);
  // Without header / footer the margins are the content box.
  const n = pageGeometry({ paper: 'A4', margin: 'none', header: false, date: false, pageNumbers: false });
  assert.deepEqual([n.top, n.bottom, n.cw, n.ch, n.head, n.foot], [0, 0, 210, 297, null, null]);
});

test('pages per sheet: 2 and 6 turn the sheet, 4 / 9 / 16 keep it', () => {
  const two = nupLayout({ paper: 'A4', nup: 2 });
  assert.deepEqual([two.sheetW, two.sheetH, two.cols, two.rows], [297, 210, 2, 1]);
  assert.ok(Math.abs(two.scale - 210 / 297) < 1e-9);
  const four = nupLayout({ paper: 'A4', nup: 4 });
  assert.deepEqual([four.sheetW, four.sheetH, four.cols, four.rows, four.scale], [210, 297, 2, 2, 0.5]);
  const twoL = nupLayout({ paper: 'A4', nup: 2, landscape: true });
  assert.deepEqual([twoL.sheetW, twoL.sheetH, twoL.cols, twoL.rows], [210, 297, 1, 2]);
  assert.equal(nupLayout({ paper: 'A4' }).scale, 1);
});

test('page ranges: "1-3, 5, 8-" -> page numbers; bad input -> null', () => {
  assert.deepEqual(parsePageRanges('1-3, 5, 8-', 10), [1, 2, 3, 5, 8, 9, 10]);
  assert.deepEqual(parsePageRanges('-2', 10), [1, 2]);
  assert.deepEqual(parsePageRanges('3,1,3', 10), [1, 3]);
  assert.deepEqual(parsePageRanges('2~4', 10), [2, 3, 4]);
  assert.deepEqual(parsePageRanges('9-20', 10), [9, 10]);
  assert.equal(parsePageRanges('', 10), null);
  assert.equal(parsePageRanges('3-1', 10), null);
  assert.equal(parsePageRanges('a', 10), null);
  assert.equal(parsePageRanges('0', 10), null);
  assert.equal(parsePageRanges('11-12', 10), null);
});

test('text runs: split into lines, classes kept', () => {
  const lines = runsToLines([{ t: 'x = 1;', c: 'tk-v' }, { t: ' % a\nb\r\n' }, { t: 'end', c: 'tk-k' }]);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], [{ t: 'x = 1;', c: 'tk-v' }, { t: ' % a' }]);
  assert.deepEqual(lines[1], [{ t: 'b' }]);
  assert.deepEqual(lines[2], [{ t: 'end', c: 'tk-k' }]);
});

test('document: @page is the sheet with margin 0; pages carry the margins', () => {
  const html = buildPrintHtml({ title: 'a<b>.m', kind: 'code', text: 'x = 1 < 2\ny' }, { paper: 'A5', landscape: true, margin: 'custom', margins: { top: 12, right: 9, bottom: 12, left: 11 }, fontSize: 11 });
  assert.match(html, /@page \{ size: 210mm 148mm; margin: 0; \}/);
  assert.match(html, /\.msp-page \{[^}]*width: 210mm; height: 148mm;/);
  assert.match(html, /\.msp-body \{ position: absolute; left: 11mm; top: 12mm; width: 190mm;/);
  assert.match(html, /<title>a&lt;b&gt;\.m<\/title>/);
  assert.match(html, /<span class="n">1<\/span><span class="t">x = 1 &lt; 2<\/span>/);
  assert.match(html, /font-size: 11pt/);
  assert.match(html, /class="msp-code wrap"/);
  const two = buildPrintHtml({ kind: 'text', text: 'x' }, { paper: 'A4', nup: 2 });
  assert.match(two, /@page \{ size: 297mm 210mm; margin: 0; \}/);
});

test('document: options become classes (grayscale, no backgrounds, no wrap, no line numbers)', () => {
  const html = buildPrintHtml({ kind: 'code', text: 'a\nb' }, { color: false, backgrounds: false, wrap: false, lineNumbers: false });
  assert.match(html, /<body class="msp-gray msp-nobg"/);
  assert.match(html, /class="msp-code nowrap"/);
  assert.doesNotMatch(html, /class="n"/);
  const syn = buildPrintHtml({ kind: 'code', runs: [{ t: 'end', c: 'tk-k' }] }, { syntax: true });
  assert.match(syn, /<span class="tk-k">end<\/span>/);
  const plain = buildPrintHtml({ kind: 'code', runs: [{ t: 'end', c: 'tk-k' }] }, { syntax: false });
  assert.doesNotMatch(plain, /<span class="tk-k">/);
});

test('document: images fit the page or take the custom scale', () => {
  const fit = buildPrintHtml({ kind: 'image', imageDataUrl: 'data:image/png;base64,AAAA', imageWidthPx: 800 }, { scaleMode: 'fit' });
  assert.match(fit, /<figure class="msp-img fit [^"]*" style="height:267mm"><img src="data:image\/png;base64,AAAA"/);
  assert.match(fit, /\.msp-img \{[^}]*padding: 10mm/, '그림 여백 normal = 10 mm around the image');
  assert.match(buildPrintHtml({ kind: 'image', imageDataUrl: 'data:,' }, { imagePad: 'large' }), /\.msp-img \{[^}]*padding: 18mm/);
  assert.match(buildPrintHtml({ kind: 'image', imageDataUrl: 'data:,' }, { imagePad: 'none' }), /\.msp-img \{[^}]*padding: 0mm/);
  const half = buildPrintHtml({ kind: 'image', imageDataUrl: 'data:,', imageWidthPx: 800 }, { scaleMode: 'custom', scale: 50 });
  assert.match(half, /style="width:400px"/);
  const lighter = buildPrintHtml({ kind: 'image', imageDataUrl: 'data:,', lightenable: true }, { lighten: true });
  assert.match(lighter, /msp-img fit lighten/);
});

test('document: several images (a model and its scopes) each on a page with a caption; scopes can be left out', () => {
  const spec = { kind: 'image', images: [{ dataUrl: 'data:a', caption: 'model', role: 'diagram' }, { dataUrl: 'data:b', caption: 'model/Scope', role: 'scope' }] };
  const both = buildPrintHtml(spec, {});
  assert.equal((both.match(/<figure class="msp-img/g) || []).length, 2);
  assert.match(both, /<figcaption>model\/Scope<\/figcaption>/);
  const noScopes = buildPrintHtml(spec, { scopes: false });
  assert.equal((noScopes.match(/<figure class="msp-img/g) || []).length, 1);
  assert.doesNotMatch(noScopes, /<figcaption>/, 'a single image needs no caption');
});

test('document: an html document keeps its head styles and body, drops scripts, gets <base>', () => {
  const src = '<!doctype html><html><head><title>Guide</title><style>.x{color:red}</style><script>alert(1)</script></head><body><h1>Hi</h1><img src="img/a.png"><script>bad()</script></body></html>';
  const html = buildPrintHtml({ kind: 'html', html: src, title: 'Manual', baseUrl: 'http://127.0.0.1:5230/guide/' }, {});
  assert.match(html, /<base href="http:\/\/127\.0\.0\.1:5230\/guide\/">/);
  assert.match(html, /<style>\.x\{color:red\}<\/style>/);
  assert.match(html, /<div class="msp-html"><h1>Hi<\/h1><img src="img\/a\.png"><\/div>/);
  assert.doesNotMatch(html, /alert|bad\(\)/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.deepEqual(splitHtml('<p>a</p>'), { head: '', body: '<p>a</p>' });
});

test('date text', () => {
  assert.equal(dateText(new Date(2026, 9, 28, 9, 5)), '2026-10-28 09:05');
});
