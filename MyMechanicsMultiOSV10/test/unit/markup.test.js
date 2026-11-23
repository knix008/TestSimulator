// Markup engine (src/cad/markup.js): items are cleaned and clamped to the view, strokes simplified, the eraser and
// selection hit what is drawn (not the empty inside of a rectangle), the SVG scales with the view height, and the
// review HTML lists markups with their comments, escaped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { markupsOf, normaliseItem, createMarkup, addComment, simplifyStroke, hitItem, moveItem, itemBounds, markupSvg, itemSvg, markupReportHtml } from '../../src/cad/markup.js';

test('a document gets its markup list only when asked; items are checked and clamped', () => {
  const doc = {};
  assert.equal(markupsOf(doc), null);
  assert.deepEqual(markupsOf(doc, { create: true }), []);
  assert.equal(normaliseItem({ kind: 'laser', pts: [[0, 0], [1, 1]] }), null);
  assert.equal(normaliseItem({ kind: 'line', pts: [[0, 0]] }), null, 'a line needs two points');
  assert.equal(normaliseItem({ kind: 'text', pts: [[0.5, 0.5]], text: '   ' }), null, 'empty text');
  const it = normaliseItem({ id: 'a', kind: 'arrow', pts: [[-0.2, 0.5], [1.4, 0.5], [0.3, 0.3]], color: '#ABCDEF', width: 99 });
  assert.deepEqual(it.pts, [[0, 0.5], [1, 0.5]]);
  assert.equal(it.color, '#abcdef'); assert.equal(it.width, 40);
  assert.equal(normaliseItem({ kind: 'line', pts: [[0, 0], [1, 1]], color: 'red' }).color, '#e53935', 'a bad colour falls back to red');
  assert.ok(normaliseItem({ kind: 'highlight', pts: [[0, 0], [1, 1]], width: 2 }).width >= 8, 'the highlighter is wide');
});

test('a markup keeps its camera, size, status and comments; empty comments are refused', () => {
  const m = createMarkup({ id: 'm1', name: 'Hole too close', author: 'Kim', camera: { dir: [0, 0, 1] }, size: [800.6, 600.2] });
  assert.deepEqual(m.size, [800, 600]);
  assert.equal(m.status, 'open');
  assert.equal(addComment(m, { id: 'c', text: '  ' }), null);
  addComment(m, { id: 'c1', author: 'Lee', text: 'Move it 5 mm' });
  assert.equal(m.comments.length, 1); assert.equal(m.comments[0].author, 'Lee');
});

test('a hand-drawn straight stroke simplifies to its two ends; a corner is kept', () => {
  const straight = Array.from({ length: 50 }, (_, i) => [i / 49, 0.5 + (i % 2 ? 0.0005 : -0.0005)]);
  assert.equal(simplifyStroke(straight, 0.002).length, 2);
  const corner = [...Array.from({ length: 20 }, (_, i) => [i / 38, 0.1]), ...Array.from({ length: 20 }, (_, i) => [0.5, 0.1 + i / 38])];
  const s = simplifyStroke(corner, 0.002);
  assert.equal(s.length, 3);
  assert.deepEqual(s[1], [0.5, 0.1]);
});

test('hits: on the outline of a rectangle and ellipse, not their middle; on a pen stroke; inside a text box', () => {
  const rect = normaliseItem({ id: 'r', kind: 'rect', pts: [[0.2, 0.2], [0.6, 0.6]], width: 2 });
  assert.equal(hitItem(rect, [0.2, 0.4]), true, 'left edge');
  assert.equal(hitItem(rect, [0.4, 0.4]), false, 'the empty inside');
  const el = normaliseItem({ id: 'e', kind: 'ellipse', pts: [[0.2, 0.2], [0.6, 0.6]], width: 2 });
  assert.equal(hitItem(el, [0.6, 0.4]), true, 'the right end of the ellipse');
  assert.equal(hitItem(el, [0.2, 0.2]), false, 'the box corner is not on the ellipse');
  const pen = normaliseItem({ id: 'p', kind: 'pen', pts: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3]], width: 3 });
  assert.equal(hitItem(pen, [0.3, 0.2]), true);
  assert.equal(hitItem(pen, [0.2, 0.25]), false);
  const tx = normaliseItem({ id: 't', kind: 'text', pts: [[0.5, 0.5]], text: 'Check this', size: 20 });
  const [x0, y0, x1, y1] = itemBounds(tx, 1, 1000);
  assert.ok(x1 > x0 && y1 > y0);
  assert.equal(hitItem(tx, [(x0 + x1) / 2, (y0 + y1) / 2]), true);
  // On a wide view (aspect 2) the same fractions are farther apart horizontally.
  assert.equal(hitItem(rect, [0.215, 0.4], 0.01, 1), false);
  assert.equal(hitItem(rect, [0.205, 0.4], 0.01, 2), true);
});

test('moving an item keeps it inside the view', () => {
  const it = normaliseItem({ id: 'l', kind: 'line', pts: [[0.8, 0.5], [0.9, 0.5]] });
  const pts = moveItem(it, 0.15, 0).pts;
  assert.ok(Math.abs(pts[0][0] - 0.95) < 1e-12 && pts[1][0] === 1 && pts[0][1] === 0.5, JSON.stringify(pts));
});

test('SVG: coordinates in pixels of the view, widths scale with the height, text escaped, selection box', () => {
  const m = createMarkup({ id: 'm', name: 'x', size: [1000, 500] });
  m.items.push(normaliseItem({ id: 'a', kind: 'line', pts: [[0, 0], [1, 1]], width: 4 }));
  m.items.push(normaliseItem({ id: 'b', kind: 'text', pts: [[0.1, 0.1]], text: 'a < b & "c"', size: 10 }));
  m.items.push(normaliseItem({ id: 'c', kind: 'arrow', pts: [[0.1, 0.9], [0.5, 0.9]] }));
  m.items.push(normaliseItem({ id: 'd', kind: 'cloud', pts: [[0.6, 0.1], [0.9, 0.4]] }));
  const svg = markupSvg(m, 2000, 1000, { selected: 'a' });
  assert.match(svg, /<line data-mk-item="a" x1="0" y1="0" x2="2000" y2="1000"[^>]*stroke-width="8"/, 'drawn at height 500, shown at 1000: twice as wide');
  assert.match(svg, /a &lt; b &amp; &quot;c&quot;/);
  assert.match(svg, /<polygon /, 'arrow head');
  assert.match(svg, / A\d/, 'cloud arcs');
  assert.match(svg, /class="mk-sel"/);
  assert.equal(itemSvg({ kind: 'nope', pts: [] }, 10, 10), '');
});

test('review HTML: every markup with its status and comments, escaped; words come from the caller', () => {
  const html = markupReportHtml('Bracket <A>', [
    { name: 'Hole', author: 'Kim', date: '2026-11-23T10:15:00Z', status: 'open', png: 'data:image/png;base64,AAA', comments: [{ author: 'Lee', date: '2026-11-23T11:00:00Z', text: 'ok\n<b>' }] },
    { name: 'Rib', author: '', date: '', status: 'resolved', comments: [] },
  ], { comments: 'Kommentare' });
  assert.match(html, /<title>Bracket &lt;A&gt;<\/title>/);
  assert.match(html, /2026-11-23 10:15/);
  assert.match(html, /ok<br\/>&lt;b&gt;/);
  assert.match(html, /Resolved/);
  assert.match(html, /Kommentare/);
  assert.equal((html.match(/<section>/g) ?? []).length, 2);
  assert.match(html, /<img src="data:image\/png;base64,AAA"/);
});

test('text boxes are wide enough for Korean: a Hangul character takes a full em, a Latin one about 0.6', async () => {
  const { textEm } = await import('../../src/cad/markup.js');
  assert.equal(textEm('가나다'), 3);
  assert.ok(Math.abs(textEm('abc') - 1.8) < 1e-9);
  const ko = normaliseItem({ id: 'k', kind: 'text', pts: [[0, 0]], text: '구멍이 가깝습니다', size: 20 });
  const en = normaliseItem({ id: 'e', kind: 'text', pts: [[0, 0]], text: 'abcdefghi', size: 20 });
  assert.ok(itemBounds(ko, 1, 1000)[2] > itemBounds(en, 1, 1000)[2] * 1.3, 'the Korean box is wider than the Latin one of the same length');
});
