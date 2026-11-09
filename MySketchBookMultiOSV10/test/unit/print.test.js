import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPrintSetup, fitScale, layoutSheets, normalizePrintSetup, pageChosen, PAPERS, pictureSize, planBounds, planScaleFor, planTiles,
  printablePages, scaleBarLength, scaleLabel, sheetGeometry, standardScale, TITLE_BLOCK_MM,
} from '../../src/print/layout.js';
import { fitText, pageTitle, sheetSvg } from '../../src/print/sheet.js';
import { pdfFromJpegPages } from '../../src/print/pdf.js';
import { loadPrintSetup, storePrintSetup, PRINT_KEY } from '../../src/domain/settings.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

test('print setup: defaults, and broken stored values fall back', () => {
  const d = defaultPrintSetup();
  assert.equal(d.paper, 'A4');
  assert.equal(d.orientation, 'landscape');
  const n = normalizePrintSetup({ paper: 'Z9', orientation: 'sideways', margin: 'huge', planScale: 'x', copies: 500, color: 'grey', dpi: 123, titleBlock: 'yes', planStyle: 'colour' });
  assert.equal(n.paper, 'A4');
  assert.equal(n.orientation, 'landscape');
  assert.equal(n.margin, 'normal');
  assert.equal(n.planScale, 'auto');
  assert.equal(n.copies, 99);
  assert.equal(n.color, 'grey');
  assert.equal(n.dpi, 150);
  assert.equal(n.titleBlock, true);
  assert.equal(n.planStyle, 'colour');
  assert.equal(normalizePrintSetup({ planScale: '100' }).planScale, 100);
  assert.equal(normalizePrintSetup({ planScale: 'fit' }).planScale, 'fit');
});

test('print setup is remembered in its own storage key', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(loadPrintSetup(storage), defaultPrintSetup());
  storePrintSetup(storage, { ...defaultPrintSetup(), paper: 'A3', planScale: 50, orientation: 'portrait' });
  assert.ok(store.has(PRINT_KEY));
  const back = loadPrintSetup(storage);
  assert.equal(back.paper, 'A3');
  assert.equal(back.planScale, 50);
  assert.equal(back.orientation, 'portrait');
  store.set(PRINT_KEY, '{not json');
  assert.equal(loadPrintSetup(storage).paper, 'A4');
});

test('sheet geometry: A4 landscape with margins and a title block', () => {
  const g = sheetGeometry({ paper: 'A4', orientation: 'landscape', margin: 'normal', titleBlock: true });
  assert.equal(g.width, 297);
  assert.equal(g.height, 210);
  assert.deepEqual(g.frame, { x: 10, y: 10, w: 277, h: 190 });
  assert.equal(g.block.h, TITLE_BLOCK_MM);
  assert.ok(near(g.block.y + g.block.h, 200));
  assert.ok(near(g.area.w, 269));
  assert.ok(near(g.area.h, 190 - 8 - TITLE_BLOCK_MM));
  const plain = sheetGeometry({ paper: 'A3', orientation: 'portrait', margin: 'wide', titleBlock: false });
  assert.equal(plain.width, PAPERS.A3.width);
  assert.equal(plain.block, null);
  assert.ok(near(plain.area.h, PAPERS.A3.height - 36 - 8));
});

test('plan bounds of a level: walls (with thickness), rooms and furniture; other levels ignored', () => {
  const project = {
    levels: [{ id: 'L1' }, { id: 'L2' }],
    walls: [{ level: 'L1', a: [0, 0], b: [10, 0], thickness: 0.2 }, { level: 'L1', a: [10, 0], b: [10, 6], thickness: 0.2 }, { level: 'L2', a: [-50, -50], b: [50, 50] }],
    rooms: [{ level: 'L1', points: [[0, 0], [10, 0], [10, 6], [0, 6]] }],
    objects: [{ level: 'L1', position: [5, 0, 7] }],
  };
  const b = planBounds(project, 'L1', 0);
  assert.ok(near(b.minX, -0.1) && near(b.maxX, 10.1));
  assert.ok(near(b.minZ, -0.1) && near(b.maxZ, 7.5));
  assert.equal(planBounds(project, 'L3'), null);
});

test('scales: fit, the standard scale above it, and 1:N labels', () => {
  const area = { w: 269, h: 166 };
  const bounds = { minX: 0, maxX: 12, minZ: 0, maxZ: 8 };
  const fit = fitScale(bounds, area);
  assert.ok(near(fit, Math.max(12000 / 269, 8000 / 166)));
  assert.equal(standardScale(fit), 50);
  assert.equal(standardScale(100), 100);
  assert.equal(standardScale(101), 125);
  assert.equal(standardScale(7000), 7000);
  assert.equal(planScaleFor('auto', bounds, area), 50);
  assert.ok(near(planScaleFor('fit', bounds, area), fit));
  assert.equal(planScaleFor(100, bounds, area), 100);
  assert.equal(scaleLabel(49.6), '1:50');
});

test('a plan at 1:N covers area × N / 1000 metres; larger plans are tiled', () => {
  const area = { w: 200, h: 100 };
  const one = planTiles({ minX: 0, maxX: 10, minZ: 0, maxZ: 5 }, area, 100);
  assert.equal(one.length, 1);
  assert.ok(near(one[0].halfW, 10) && near(one[0].halfH, 5));
  assert.ok(near(one[0].cx, 5) && near(one[0].cz, 2.5));
  // 1:50 → 10 m × 5 m per sheet; a 25 m × 7 m plan needs 3 × 2 sheets.
  const many = planTiles({ minX: 0, maxX: 25, minZ: 0, maxZ: 7 }, area, 50);
  assert.equal(many.length, 6);
  assert.equal(many[0].cols, 3);
  assert.equal(many[0].rows, 2);
  // Centred on the plan, edge to edge.
  const xs = [...new Set(many.map((tile) => tile.cx))];
  assert.ok(near(xs[1] - xs[0], 10) && near((xs[0] + xs[2]) / 2, 12.5));
  // The picture's proportions are the area's, so the ortho camera matches the paper exactly.
  assert.ok(near(many[0].halfW / many[0].halfH, area.w / area.h));
});

test('scale bar: a round length at most 50 mm long on paper', () => {
  assert.equal(scaleBarLength(100), 5);
  assert.equal(scaleBarLength(50), 2);
  assert.equal(scaleBarLength(20), 1);
  assert.equal(scaleBarLength(500), 20);
  assert.ok((scaleBarLength(75) * 1000) / 75 <= 50);
});

test('picture size keeps the area proportions and is capped', () => {
  const s = pictureSize({ w: 254, h: 127 }, 100);
  assert.deepEqual(s, { w: 1000, h: 500 });
  const big = pictureSize({ w: 400, h: 200 }, 300, 2000);
  assert.equal(big.w, 2000);
  assert.equal(big.h, 1000);
});

const INFO = {
  levels: [{ id: 'a', name: '1F', bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 6 } }, { id: 'b', name: '2F', bounds: null }],
  scenes: [{ id: 's1', name: 'Living' }],
  summary: { name: 'Home', facts: [['Area', '60 m²']], rooms: [{ name: 'Living', level: '1F', area: '20.00 m²' }], furniture: [{ name: 'Sofa', count: 2 }] },
};

test('pages: view, a plan per level, scenes, summary; ticks override the groups', () => {
  const pages = printablePages(INFO);
  assert.deepEqual(pages.map((p) => p.key), ['view', 'plan:a', 'plan:b', 'scene:s1', 'summary']);
  const setup = { ...defaultPrintSetup(), includeScenes: false };
  assert.equal(pageChosen(pages[3], setup), false);
  assert.equal(pageChosen(pages[3], setup, { 'scene:s1': true }), true);
  assert.equal(pageChosen(pages[0], setup, { view: false }), false);
});

test('sheets: one per picture page, tiles for plans, the summary without a picture', () => {
  const { sheets, geometry } = layoutSheets(INFO, { ...defaultPrintSetup(), planScale: 'auto' });
  assert.deepEqual(sheets.map((s) => s.page.key), ['view', 'plan:a', 'plan:b', 'scene:s1', 'summary']);
  const plan = sheets[1];
  assert.equal(plan.scale, 50);
  assert.equal(plan.request.type, 'plan');
  assert.ok(near(plan.request.camera.halfW / plan.request.camera.halfH, geometry.area.w / geometry.area.h, 1e-3));
  assert.ok(near(plan.request.w / plan.request.h, geometry.area.w / geometry.area.h, 0.01));
  assert.equal(sheets[2].empty, true);
  assert.equal(sheets[4].request, undefined);
  // Same request → same key (the picture is reused); another paper → another key.
  const again = layoutSheets(INFO, { ...defaultPrintSetup() });
  assert.equal(again.sheets[0].request.key, sheets[0].request.key);
  const a3 = layoutSheets(INFO, { ...defaultPrintSetup(), paper: 'A3' });
  assert.notEqual(a3.sheets[0].request.key, sheets[0].request.key);
  const tiled = layoutSheets(INFO, { ...defaultPrintSetup(), planScale: 20 });
  assert.ok(tiled.sheets.filter((s) => s.page.key === 'plan:a').length > 1);
  assert.equal(layoutSheets(INFO, { ...defaultPrintSetup(), color: 'grey' }).sheets[0].request.grey, true);
});

test('sheet SVG: picture, scale bar, title block with scale and sheet number', () => {
  const { sheets, geometry } = layoutSheets(INFO, defaultPrintSetup());
  const ctx = { t, index: 1, total: sheets.length, project: 'Home <A&B>', date: '2026-11-09', scaleBar: true, titleBlock: true, summary: INFO.summary };
  const svg = sheetSvg(sheets[1], geometry, 'data:image/png;base64,AAAA', ctx);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1123" height="794"/);
  assert.match(svg, /<image href="data:image\/png;base64,AAAA"/);
  assert.match(svg, /class="scale-bar"/);
  assert.match(svg, />1:50</);
  assert.match(svg, />2 \/ 5</);
  assert.match(svg, /Home &lt;A&amp;B&gt;/);
  const pending = sheetSvg(sheets[0], geometry, null, { ...ctx, index: 0 });
  assert.match(pending, /sheet-pending/);
  assert.doesNotMatch(pending, /<image/);
  const summary = sheetSvg(sheets[4], geometry, null, { ...ctx, index: 4 });
  assert.match(summary, /Living/);
  assert.match(summary, /Sofa/);
  const bare = sheetSvg(sheets[0], sheetGeometry({ titleBlock: false }), 'x', { ...ctx, titleBlock: false });
  assert.doesNotMatch(bare, /print3d\.tb\.project/);
  assert.equal(pageTitle({ type: 'plan', name: '2F' }, t), 'print3d.page.plan:{"name":"2F"}');
});

test('long titles are cut to fit their cell', () => {
  assert.equal(fitText('short', 3, 100), 'short');
  const cut = fitText('가나다라마바사아자차카타파하'.repeat(3), 4, 30);
  assert.ok(cut.endsWith('…') && cut.length < 12);
});

test('PDF of JPEG pages: one page per sheet at the paper size', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const bytes = pdfFromJpegPages([{ jpeg, width: 10, height: 7, widthMm: 297, heightMm: 210 }, { jpeg, width: 7, height: 10, widthMm: 210, heightMm: 297 }], { title: 'Plan (1)' });
  const text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  // Every xref offset points at its object.
  const xref = Number(/startxref\n(\d+)/.exec(text)[1]);
  const rows = text.slice(xref).split('\n').slice(3).filter((l) => / n $/.test(l));
  rows.forEach((row, i) => assert.ok(text.startsWith(`${i + 1} 0 obj`, Number(row.slice(0, 10)))));
});
