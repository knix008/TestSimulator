// The start page's card layout, the picture formats taken in, and the coloured icons.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_ORDER, cardsFrom, defaultCards } from '../../src/ui/startboard.js';
import { COLS, LAYOUT_VERSION, overlaps, place } from '../../src/ui/startlayout.js';
import { SAMPLE_GROUPS } from '../../src/domain/sample-names.js';
import { IMAGE_EXTENSIONS, imageDecoderFor, nativeImageMime, sniffImage } from '../../src/domain/image-formats.js';
import { isImageFileName } from '../../src/domain/format.js';
import extra from '../../src/export/extra-formats.js';
import { backgroundIcon, hasIcon, ICON_NAMES, icon } from '../../src/icons.js';
import { ANIMATIONS } from '../../src/domain/settings.js';
import { loadSettings } from '../../src/domain/settings.js';

const IDS = ['templates', 'background', 'recent', 'samples', 'folders']; // not in CARD_ORDER: the order comes from there
const ROWS = { templates: 20, recent: 8, folders: 8, background: 16, samples: 40 };

function assertNoOverlap(cards) {
  const list = Object.entries(cards);
  for (const [i, [a, ca]] of list.entries()) {
    assert.ok(ca.col >= 0 && ca.col + ca.w <= COLS, `${a} stays on the board`);
    for (const [b, cb] of list.slice(i + 1)) assert.ok(!overlaps(ca, cb), `${a} overlaps ${b}`);
  }
}

test('the default arrangement: one below the other, recent files and folders side by side, the moving background last', () => {
  const cards = defaultCards(IDS, ROWS);
  assertNoOverlap(cards);
  assert.ok(!('hero' in cards) && !('help' in cards), 'the title is not a card, and there is no help card');
  assert.equal(COLS, 2);
  for (const id of ['templates', 'samples', 'background']) assert.deepEqual([cards[id].col, cards[id].w], [0, COLS], `${id} spans the board`);
  assert.deepEqual([cards.recent.col, cards.recent.w, cards.folders.col, cards.folders.w], [0, 1, 1, 1], 'recent files left, recent folders right');
  assert.equal(cards.recent.row, cards.folders.row, 'on the same row');
  const order = Object.keys(cards).sort((a, b) => cards[a].row - cards[b].row || cards[a].col - cards[b].col);
  assert.deepEqual(order, CARD_ORDER, 'in order');
  assert.deepEqual(order.slice(-2), ['samples', 'background'], 'the moving background below the samples, at the bottom');
  assert.equal(cards.samples.fit, true, 'the sample card is as tall as its tiles');
  const alone = defaultCards(IDS.filter((id) => id !== 'recent'), ROWS);
  assert.deepEqual([alone.folders.col, alone.folders.w], [0, COLS], 'recent folders alone take the whole row');
});

test('a moved card stays where it was put, and a new card goes below', () => {
  const start = cardsFrom(null, IDS, ROWS);
  const moved = place(start, 'templates', { w: 1, col: 1, row: 0 });
  assertNoOverlap(moved);
  assert.deepEqual([moved.templates.col, moved.templates.w], [1, 1]);
  const saved = { version: LAYOUT_VERSION, cards: Object.fromEntries(Object.entries(moved).filter(([id]) => id !== 'background')) };
  const again = cardsFrom(saved, IDS, ROWS);
  assertNoOverlap(again);
  assert.deepEqual([again.templates.col, again.templates.w], [1, 1], 'kept after a reload');
  assert.equal(again.background.w, COLS, 'the card that was not saved is back, full width');
});

test('a resized card keeps its size; a fit card follows its contents; an old layout is dropped', () => {
  const start = cardsFrom(null, IDS, ROWS);
  const resized = place(start, 'recent', { h: 14, fit: false });
  const again = cardsFrom({ version: LAYOUT_VERSION, cards: resized }, IDS, { ...ROWS, recent: 3 });
  assert.deepEqual([again.recent.w, again.recent.h, again.recent.fit], [1, 14, false]);
  assertNoOverlap(again);
  assert.equal(cardsFrom({ version: LAYOUT_VERSION, cards: start }, IDS, { ...ROWS, folders: 12 }).folders.h, 12);
  const old = cardsFrom({ version: 4, cards: { samples: { col: 0, row: 0, w: 2, h: 8, fit: true } } }, IDS, ROWS);
  assert.deepEqual([old.recent.row === old.folders.row, old.samples.row > old.recent.row], [true, true], 'a layout of an older version gives way to the current one');
});

test('settings keep a valid card layout and the start background transparency, and drop bad ones', () => {
  const store = (value) => ({ getItem: () => JSON.stringify(value), setItem() {} });
  const layout = { version: LAYOUT_VERSION, cards: { templates: { col: 0, row: 0, w: 3, h: 5, fit: true } } };
  const good = loadSettings(store({ startLayout: layout, startBgTransparency: 40 }));
  assert.deepEqual(good.startLayout, layout);
  assert.equal(good.startBgTransparency, 40);
  const bad = loadSettings(store({ startLayout: { version: 1 }, startBgTransparency: 900 }));
  assert.equal(bad.startLayout, null);
  assert.ok(bad.startBgTransparency <= 100);
  assert.equal(loadSettings(store({ startLayout: { ...layout, version: 2 } })).startLayout, null, 'a layout from before the stacked cards');
});

test('every sample and every sample group has an icon of its own and a description', async () => {
  const groups = SAMPLE_GROUPS.map((group) => group.icon);
  const items = SAMPLE_GROUPS.flatMap((group) => group.items);
  const { masterById } = await import('../../src/domain/stencils.js');
  for (const name of [...groups, ...items.map((item) => item.icon)]) assert.ok(name.startsWith('m:') ? masterById(name.slice(2))?.id === name.slice(2) : hasIcon(name), `icon ${name} exists`);
  assert.equal(new Set(groups).size, groups.length, 'no two groups share an icon');
  assert.equal(new Set(items.map((item) => item.icon)).size, items.length, 'no two samples share an icon');
  assert.ok(groups.every((name) => !items.some((item) => item.icon === name)), 'a group icon is not also a sample icon');
  for (const item of items) for (const L of ['ko', 'en']) assert.ok(item.name[L] && item.desc[L], `${item.id} ${L}`);
});

test('every current picture format is taken in', () => {
  for (const ext of ['png', 'apng', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'tif', 'tiff', 'heic', 'heif', 'jxl', 'jp2', 'j2k', 'qoi', 'tga', 'pcx', 'ppm']) {
    assert.ok(IMAGE_EXTENSIONS.includes(ext), ext);
    assert.ok(isImageFileName(`a.${ext.toUpperCase()}`), ext);
  }
  assert.ok(!isImageFileName('a.pdf'));
  assert.equal(nativeImageMime('a.WEBP'), 'image/webp');
  assert.equal(nativeImageMime('a.heic'), null);
  assert.equal(imageDecoderFor('a.png'), '');
  assert.equal(imageDecoderFor('a.jxl'), 'jxl');
  assert.equal(imageDecoderFor('a.heic'), 'heif');
});

test('the first bytes decide over the extension', () => {
  const bytes = (...head) => { const b = new Uint8Array(16); b.set(head); return b; };
  const text = (s) => [...s].map((c) => c.charCodeAt(0));
  assert.equal(sniffImage(bytes(0x49, 0x49, 0x2a, 0)), 'tiff');
  assert.equal(sniffImage(bytes(0xff, 0x0a)), 'jxl');
  assert.equal(sniffImage(bytes(0xff, 0x4f, 0xff, 0x51)), 'j2k');
  assert.equal(sniffImage(bytes(...text('qoif'))), 'qoi');
  assert.equal(sniffImage(bytes(0, 0, 0, 24, ...text('ftypheic'))), 'heif');
  assert.equal(sniffImage(bytes(0, 0, 0, 24, ...text('ftypavif'))), 'native');
  assert.equal(imageDecoderFor('photo.png', bytes(0, 0, 0, 24, ...text('ftypheic'))), 'heif', 'a HEIC named .png');
  assert.equal(imageDecoderFor('photo.heic', bytes(0x89, 0x50, 0x4e, 0x47)), '', 'a PNG named .heic');
});

test('QOI and TGA pictures decode to the same pixels', () => {
  const image = { width: 2, height: 2, rgba: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 8, 7, 255]) };
  for (const [encode, family] of [[extra.encodeQoi, 'qoi'], [extra.encodeTga, 'tga']]) {
    const out = extra.decode(encode(image), family);
    assert.deepEqual([out.width, out.height], [2, 2]);
    assert.deepEqual([...out.rgba], [...image.rgba], family);
  }
});

test('every icon has a colour of its own that follows the theme', () => {
  const colours = new Set();
  for (const name of ICON_NAMES) {
    const match = /style="color:color-mix\(in srgb,(#[0-9a-f]{6}) \d+%,var\(--text\)\)"/.exec(icon(name));
    assert.ok(match, name);
    colours.add(match[1]);
  }
  assert.ok(colours.size >= 8, `${colours.size} colours`);
});

test('every start page background has an icon of its own', () => {
  const pictures = new Set();
  for (const kind of ANIMATIONS) {
    assert.ok(hasIcon(backgroundIcon(kind)), kind);
    pictures.add(icon(backgroundIcon(kind)).replace(/^<svg[^>]*>/, ''));
  }
  assert.equal(pictures.size, ANIMATIONS.length);
});

test('the View tutorial window is on by default and can be turned off', () => {
  const store = (value) => ({ getItem: () => JSON.stringify(value), setItem() {} });
  assert.equal(loadSettings(store({})).showTutorialPopup, true);
  assert.equal(loadSettings(store({ showTutorialPopup: false })).showTutorialPopup, false);
});

test('the fill presets have pastel colours', async () => {
  const { PASTEL_COLORS, luminance } = await import('../../src/domain/designs.js');
  assert.ok(PASTEL_COLORS.length >= 12);
  for (const colour of PASTEL_COLORS) assert.ok(luminance(colour) > 0.5, colour);
});

test('a mind map converts to a fishbone and back, without losing anything', async () => {
  const { buildTemplate } = await import('../../src/domain/templates.js');
  const { hasMindMap, isFishbone, toFishbone, toMindMap } = await import('../../src/domain/fishbone.js');
  const { contentBounds } = await import('../../src/domain/diagram.js');
  const page = buildTemplate('mindmap', { language: 'en' }).pages[0];
  const count = page.shapes.length;
  assert.ok(hasMindMap(page) && !isFishbone(page));
  assert.ok(toFishbone(page));
  assert.ok(isFishbone(page));
  assert.equal(page.shapes.length, count + 1, 'the spine is added');
  const topics = page.shapes.filter((s) => s.type !== 'connector' && s.name !== 'fishbone-spine');
  for (const [i, a] of topics.entries()) for (const b of topics.slice(i + 1)) {
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.text} overlaps ${b.text}`);
  }
  const head = page.shapes.find((s) => s.master === 'centralTopic');
  assert.ok(topics.every((s) => s === head || s.x < head.x + head.w), 'the head is on the right');
  assert.ok(contentBounds(page).x >= 0);
  assert.equal(toFishbone(page), false, 'already a fishbone');
  assert.ok(toMindMap(page));
  assert.equal(page.shapes.length, count, 'the spine is gone');
  assert.ok(page.shapes.filter((s) => s.type === 'connector').every((c) => c.from.id && c.to.id), 'every line glued again');
});

test('100 fill patterns, each drawn in the second colour', async () => {
  const { PATTERNS, patternTile } = await import('../../src/domain/patterns.js');
  const { renderPageSvg } = await import('../../src/render/svg.js');
  const { buildTemplate } = await import('../../src/domain/templates.js');
  assert.equal(PATTERNS.length, 100);
  assert.equal(new Set(PATTERNS.map((p) => p.id)).size, 100);
  assert.equal(new Set(PATTERNS.map((p) => p.body)).size, 100, 'all different');
  for (const p of PATTERNS) {
    const tile = patternTile(p, '#111111', '#222222', 'x');
    assert.ok(tile.includes('#222222'), p.id);
    assert.ok(!tile.includes('NaN') && !tile.includes('undefined') && !tile.includes('{c}'), p.id);
    assert.ok(p.name.ko && p.name.en, p.id);
  }
  const doc = buildTemplate('basic', { language: 'en' });
  const shape = doc.pages[0].shapes.find((s) => s.type === 'shape' && s.master === 'roundRect');
  shape.style = { fill: '#112233', fill2: '#445566', fillPattern: PATTERNS[50].id };
  const { svg } = renderPageSvg(doc, doc.pages[0], {});
  assert.ok(svg.includes('<pattern') && svg.includes('#445566'));
});

test('the Icons stencil fills its rows at every panel width', async () => {
  const { mastersIn } = await import('../../src/domain/stencils.js');
  const count = mastersIn('icons').length;
  assert.ok(count >= 100);
  for (const columns of [2, 3, 4, 5, 6]) assert.equal(count % columns, 0, `${count} icons in ${columns} columns`);
});

test('a drawing exports as Markdown, Word, Excel and text', async () => {
  const { buildSample } = await import('../../src/domain/templates.js');
  const { documentTables, documentToDocx, documentToMarkdown, documentToText, documentToXlsx, reportToXlsx } = await import('../../src/export/document-export.js');
  const doc = buildSample('en');
  const tables = documentTables(doc, { labels: { shape: 'Shape', text: 'Text', generated: 'x' }, nameOf: (s) => s.master });
  assert.equal(tables.pages.length, doc.pages.filter((p) => !p.background).length);
  assert.ok(tables.pages[0].rows.some((row) => row.includes('Place order')));
  assert.ok(tables.pages[0].columns.includes('Minutes'), 'shape data become columns');
  const md = documentToMarkdown(tables, ['data:image/png;base64,AAAA']);
  assert.match(md, /^# Online shop operations/);
  assert.match(md, /!\[Order process\]\(data:image\/png;base64,AAAA\)/);
  assert.match(md, /\| Shape \| Text \|/);
  assert.match(documentToText(tables), /Place order/);
  const png = new Uint8Array([137, 80, 78, 71]);
  const word = documentToDocx(tables, [{ png, width: 100, height: 50 }]);
  const excel = documentToXlsx(tables);
  const text = (bytes) => Buffer.from(bytes).toString('latin1');
  for (const [bytes, part] of [[word, 'word/document.xml'], [word, 'word/media/chart1.png'], [excel, 'xl/workbook.xml'], [excel, 'xl/worksheets/sheet3.xml']]) {
    assert.equal(text(bytes).slice(0, 2), 'PK');
    assert.ok(text(bytes).includes(part), part);
  }
  const report = reportToXlsx({ title: 'R', labels: {}, blocks: [{ type: 'table', title: 'T', columns: [{ label: 'A' }], rows: [['b'], [3]] }] });
  assert.ok(text(report).includes('xl/worksheets/sheet1.xml'));
});

test('lines inside a filled shape stand out from the fill', async () => {
  const { renderPageSvg } = await import('../../src/render/svg.js');
  const { addShape, createDocument, createShape } = await import('../../src/domain/diagram.js');
  const doc = createDocument({ title: 'x', language: 'en', design: 'office' });
  const page = doc.pages[0];
  const dark = addShape(page, createShape('predefined', { x: 50, y: 50, style: { fill: '#1e3a8a' } }));
  void dark;
  addShape(page, createShape('summingJunction', { x: 300, y: 50, style: { fill: '#fde68a' } }));
  const own = addShape(page, createShape('predefined', { x: 50, y: 300, style: { fill: '#1e3a8a', line: '#ff0000' } }));
  void own;
  addShape(page, createShape('sun', { x: 300, y: 300, style: { fill: '#1e3a8a' } }));
  const { svg } = renderPageSvg(doc, page, {});
  assert.match(svg, /class="inner-line"[^>]*fill="none" fill-rule="evenodd" stroke="#ffffff"/, 'light lines on a dark fill');
  assert.match(svg, /fill="none" fill-rule="evenodd" stroke="#1f2937"/, 'dark lines on a light fill');
  assert.ok((svg.match(/stroke="#ff0000"/g) ?? []).length >= 2, 'a line colour of its own stays');
  const sunRays = svg.split('fill="none"').length;
  assert.ok(sunRays > 2);
});

test('a Visio export knows what it cannot hold', async () => {
  const { vsdxLosses } = await import('../../src/domain/interop.js');
  const { buildSample } = await import('../../src/domain/templates.js');
  const { addShape, createShape } = await import('../../src/domain/diagram.js');
  const doc = buildSample('en');
  assert.deepEqual(vsdxLosses(doc), { icons: 0, patterns: 0, pictures: 0 }, 'nothing to warn about');
  const page = doc.pages[0];
  addShape(page, createShape('icoHeart', { x: 10, y: 10 }));
  addShape(page, createShape('rect', { x: 10, y: 10, style: { fill: '#112233', fillPattern: 'p-brick20' } }));
  addShape(page, createShape('rect', { x: 10, y: 10, style: { fill: '#112233', fillPattern: 'hatch' } }));
  addShape(page, createShape('rect', { x: 10, y: 10, style: { fill: '#112233', fillPattern: 'linear' } }));
  addShape(page, createShape('image', { x: 10, y: 10, src: 'data:image/webp;base64,AAAA' }));
  addShape(page, createShape('image', { x: 10, y: 10, src: 'data:image/png;base64,AAAA' }));
  assert.deepEqual(vsdxLosses(doc), { icons: 1, patterns: 2, pictures: 1 });
});

test('the web version lists and makes the same 229 samples per language', async () => {
  const { isWebSample, makeSampleFile, webSamplePaths } = await import('../../src/domain/sample-names.js');
  const samples = await import('../../src/domain/samples.js');
  const { serialize, parseDiagram } = await import('../../src/domain/format.js');
  const { buildTemplate } = await import('../../src/domain/templates.js');
  const { exportVsdx } = await import('../../src/domain/interop.js');
  const fs = await import('node:fs');
  const paths = webSamplePaths();
  const names = paths.map((path) => path.replace('web-sample:', ''));
  const onDisk = fs.readdirSync(new URL('../../samples/', import.meta.url)).filter((name) => /\.(ko|en)\.(mdg|mdgt|vsdx)$/.test(name)).sort();
  assert.deepEqual(names, onDisk, 'the same files as the installer');
  assert.equal(names.filter((name) => name.includes('.ko.')).length, 229);
  for (const group of (await import('../../src/domain/sample-names.js')).SAMPLE_GROUPS) assert.equal(group.items.length, 12, `${group.id}: twelve samples (two full rows of six tiles)`);
  assert.ok(paths.every(isWebSample));
  const tools = { serialize, buildTemplate, exportVsdx };
  for (const name of names) {
    const content = makeSampleFile(name, samples, tools);
    if (name.endsWith('.vsdx')) assert.equal(Buffer.from(content).toString('latin1', 0, 2), 'PK', name);
    else assert.ok(parseDiagram(content).doc.pages.length >= 1, name);
  }
});

test('the Shapes panel: every shape of every stencil has a picture, drawn in proportion', async () => {
  const { CATEGORIES, mastersIn } = await import('../../src/domain/stencils.js');
  const { masterIcon } = await import('../../src/render/svg.js');
  for (const category of CATEGORIES) {
    assert.ok(hasIcon(category.icon), `${category.id}: its icon`);
    for (const master of mastersIn(category.id)) {
      const svg = masterIcon(master.id, { size: 40 });
      assert.ok(/<(path|rect|circle|ellipse|line|polyline|polygon|image)\b/.test(svg) && !/NaN|undefined/.test(svg), `${category.id}/${master.id} draws a picture`);
      assert.ok(master.name.ko && master.name.en, `${master.id}: named`);
    }
  }
  // Every stencil has at least 42 shapes, in full rows of six (and of three and two on the larger sizes).
  for (const category of CATEGORIES) {
    const count = mastersIn(category.id).length;
    assert.ok(count >= 42 && count % 6 === 0, `${category.id}: ${count} shapes`);
  }
  assert.ok(CATEGORIES.length >= 41, `${CATEGORIES.length} stencils`);
  // Drawn at their own size and scaled down: a container's header band is a band, not the whole picture.
  assert.notEqual(masterIcon('container'), masterIcon('ctSide'), 'top and side headers differ');
  const stroke = (id) => Math.max(...[...masterIcon(id).matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1])));
  const scale = (id) => Number(/scale\(([\d.]+)\)/.exec(masterIcon(id))[1]);
  assert.ok(stroke('bpmnCallActivity') * scale('bpmnCallActivity') > stroke('bpmnTask') * scale('bpmnTask') * 1.5, 'a call activity keeps its thick border');
});
