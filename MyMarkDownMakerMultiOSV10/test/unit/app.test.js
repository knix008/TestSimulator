// Unit tests (node:test, no browser): icons, texts, the Markdown engine, document settings, the
// document's Undo history, problems, samples and the recent list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, 'src');
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const f = path.join(dir, n); if (statSync(f).isDirectory()) walk(f, out); else if (/\.js$/.test(n)) out.push(f); } return out; };
const sources = walk(src).filter((f) => !/[\\/]i18n[\\/]/.test(f));

const { hasIcon, ICON_NAMES, animationIcon } = await import('../../src/icons.js');
const { toneOf } = await import('../../src/icon-tones.js');
const { DICTIONARIES } = await import('../../src/i18n.js');
const { ANIMATIONS, normalizeSettings, defaultSettings } = await import('../../src/domain/settings.js');
const { DEFAULT_EXPORT_SETTINGS, normalizeDocSettings } = await import('../../src/domain/docsettings.js');
const { DocHistory, firstDiff } = await import('../../src/domain/dochistory.js');
const { findProblems, countBySeverity } = await import('../../src/domain/problems.js');
const { SAMPLE_IDS, sampleFiles } = await import('../../src/domain/samples.js');
const { addRecent, removeRecent } = await import('../../src/domain/recent.js');
const { DARK_THEMES, LIGHT_THEMES } = await import('../../src/themes.js');
const md = await import('../../src/lib/markdown.js');

test('every icon the app names exists, and each has a colour tone', () => {
  const missing = new Set();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bicon\(\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
    for (const m of text.matchAll(/\bicon:\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
    for (const m of text.matchAll(/\bglyph:\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
  }
  assert.deepEqual([...missing], []);
  assert.ok(ICON_NAMES.length > 300);
  for (const name of ICON_NAMES) assert.ok(toneOf(name), name);
});

test('16 moving backgrounds, each with its own icon and name in both languages', () => {
  assert.equal(ANIMATIONS.length, 16);
  for (const kind of ANIMATIONS) {
    assert.ok(hasIcon(animationIcon(kind)), kind);
    assert.ok(DICTIONARIES.ko[`animation.${kind}`] && DICTIONARIES.en[`animation.${kind}`], kind);
  }
});

test('20 dark and 20 light themes with names in both languages', () => {
  assert.equal(DARK_THEMES.length, 20);
  assert.equal(LIGHT_THEMES.length, 20);
  assert.equal(new Set([...DARK_THEMES, ...LIGHT_THEMES].map((x) => x.id)).size, 40);
  for (const theme of [...DARK_THEMES, ...LIGHT_THEMES]) assert.ok(theme.name.ko && theme.name.en && theme.dark === DARK_THEMES.includes(theme), theme.id);
});

test('both dictionaries have the same keys', () => {
  const ko = Object.keys(DICTIONARIES.ko);
  const en = new Set(Object.keys(DICTIONARIES.en));
  assert.deepEqual(ko.filter((k) => !en.has(k)), []);
  assert.deepEqual([...en].filter((k) => !(k in DICTIONARIES.ko)), []);
});

test('merging joins the files in order with rules and optional file headings', () => {
  const files = [{ name: 'a.md', relPath: 'x/a.md', content: '# A\n\ntext\n\n' }, { name: 'b.md', relPath: 'b.md', content: '# B' }];
  assert.equal(md.mergeFiles(files), '# A\n\ntext\n\n---\n\n# B\n');
  assert.match(md.mergeFiles(files, { insertFileHeaders: true }), /^## x\/a\.md\n\n# A/);
});

test('numbering: 1, 1.1, 1.1.1 — and code fences are left alone', () => {
  const out = md.renumberHeadings('# A\n## B\n### C\n```\n# not\n```\n## D\n# E\n');
  assert.match(out, /^# 1 A$/m);
  assert.match(out, /^## 1\.1 B$/m);
  assert.match(out, /^### 1\.1\.1 C$/m);
  assert.match(out, /^# not$/m);
  assert.match(out, /^## 1\.2 D$/m);
  assert.match(out, /^# 2 E$/m);
  assert.equal(md.renumberHeadings(out), out, 'renumbering is stable');
});

test('a built document carries cover, contents and figure index; the outline skips them', () => {
  const body = '# 1 Intro\n\n![Chart](data:image/png;base64,AA)\n\n## 1.1 More\n';
  const doc = md.buildDocument(body, { ...DEFAULT_EXPORT_SETTINGS, contentsLabel: 'Contents', figuresLabel: 'Figures', figureLabel: 'Figure', coverDate: '2026-01-01' });
  const parts = md.splitDocument(doc);
  assert.ok(parts.cover && parts.toc && parts.figures);
  assert.deepEqual(md.getOutline(doc).map((h) => h.text), ['1 Intro', '1.1 More']);
  assert.equal(md.getFigures(doc).length, 1);
  assert.deepEqual(md.getDocumentOutline(doc, {}).filter((h) => h.section).map((h) => h.section), ['cover', 'toc', 'figures']);
});

test('figure width is written as w=NN% and read back', () => {
  const text = 'x\n![Chart](pic.png)\n';
  const [figure] = md.getFigures(text);
  const out = md.setFigureWidth(text, figure, 60);
  assert.match(out, /!\[Chart\]\(pic\.png "w=60%"\)/);
  assert.equal(md.setFigureWidth(out, md.getFigures(out)[0], 100), text);
});

test('sorting files by name, date and custom order', () => {
  const files = [{ name: 'b.md', mtime: 1 }, { name: 'A.md', mtime: 3 }, { name: 'c.md', mtime: 2 }];
  assert.deepEqual(md.sortFiles(files, 'nameAsc').map((f) => f.name), ['A.md', 'b.md', 'c.md']);
  assert.deepEqual(md.sortFiles(files, 'dateNewest').map((f) => f.name), ['A.md', 'c.md', 'b.md']);
  assert.deepEqual(md.sortFiles(files, 'custom').map((f) => f.name), ['b.md', 'A.md', 'c.md']);
});

test('document settings are repaired: ranges, choices, booleans, no stored page maps', () => {
  const s = normalizeDocSettings({ fontSizePt: 999, lineHeight: 0.04, sortOrder: 'weird', coverPage: 'yes', headerAlign: 'middle', pageNumberPos: 'x', tocPageMap: { a: 1 }, fontFamily: 7 });
  assert.equal(s.fontSizePt, 48);
  assert.equal(s.lineHeight, 0.5);
  assert.equal(s.sortOrder, 'nameAsc');
  assert.equal(s.coverPage, true);
  assert.equal(s.headerAlign, 'center');
  assert.equal(s.pageNumberPos, 'bottom-right');
  assert.equal(s.tocPageMap, null);
  assert.equal(s.fontFamily, '');
  assert.equal(normalizeDocSettings({ lineHeight: 1.55 }).lineHeight, 1.6);
});

test('app settings keep the document settings nested and repaired; the bottom panel starts hidden', () => {
  const s = normalizeSettings({ doc: { fontSizePt: 12 }, centerTab: 'nope', docZoom: 1000 }, 'ko');
  assert.equal(s.doc.fontSizePt, 12);
  assert.equal(s.doc.coverPage, true);
  assert.equal(s.centerTab, 'preview');
  assert.equal(s.docZoom, 300);
  assert.equal(defaultSettings('en').showBottomPanel, false);
});

test('document history: one step per burst of typing, undo and redo swap snapshots', () => {
  let now = 1000;
  const h = new DocHistory(150, () => now);
  h.record('typing', { text: 'a' }, { coalesce: true });
  now += 100;
  h.record('typing', { text: 'ab' }, { coalesce: true });
  assert.equal(h.past.length, 1, 'coalesced');
  now += 2000;
  h.record('typing', { text: 'abc' }, { coalesce: true });
  assert.equal(h.past.length, 2);
  const step = h.undo({ text: 'abcd' });
  assert.equal(step.snapshot.text, 'abc');
  assert.equal(h.redo({ text: 'abc' }).snapshot.text, 'abcd');
  h.record('renumber', { text: 'x' });
  assert.equal(h.canRedo, false, 'a new step drops the redo branch');
  assert.equal(firstDiff('hello', 'help'), 3);
});

test('problems: heading jumps, unclosed fences, missing pictures, empty files', () => {
  const text = '# A\n### C\n![x](pics/a.png)\n![y](mmm-img:1)\n```\ncode\n';
  const list = findProblems(text, [{ id: 'f1', name: 'e.md', content: '  ', checked: true }, { id: 'f2', name: 'n.md', content: 'no heading', checked: true }], { checked: (f) => f.checked });
  const kinds = list.map((p) => p.kind);
  for (const kind of ['headingJump', 'openFence', 'missingImage', 'emptyFile', 'fileNoHeading']) assert.ok(kinds.includes(kind), kind);
  assert.equal(list[0].severity, 'error', 'errors first');
  assert.equal(list.filter((p) => p.kind === 'missingImage').length, 1, 'embedded pictures are fine');
  assert.deepEqual(countBySeverity([{ severity: 'info' }, { severity: 'info' }]), { error: 0, warning: 0, info: 2 });
  assert.deepEqual(findProblems('<!-- mmm:toc -->\n## Contents\n<!-- /mmm:toc -->\n# 1 A\n## 1.1 B\n'), []);
});

test('samples: three sets in both languages, each with headings and at least one picture', () => {
  assert.deepEqual(SAMPLE_IDS, ['manual', 'report', 'api']);
  for (const id of SAMPLE_IDS) for (const lang of ['ko', 'en']) {
    const files = sampleFiles(id, lang);
    assert.equal(files.length, 3);
    for (const f of files) assert.match(f.content, /^# /m, `${id}/${lang}/${f.name}`);
    if (id !== 'api') assert.ok(files.some((f) => /!\[[^\]]*\]\(data:image\/svg/.test(f.content)), `${id} has a picture`);
  }
});

test('recent list: newest first, no duplicates (paths compare case- and slash-insensitively), at most 10', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = addRecent(list, { path: `C:\\docs\\${i}.md`, kind: 'file' });
  assert.equal(list.length, 10);
  list = addRecent(list, { path: 'c:/DOCS/11.md', kind: 'file' });
  assert.equal(list.filter((x) => /11\.md$/i.test(x.path)).length, 1);
  assert.equal(removeRecent(list, 'C:\\docs\\11.md').length, 9);
});

// ───────────────────────── later additions: export with picture files, print setup, heading sizes, logo settings

const { markdownWithImageFiles } = await import('../../src/lib/export.js');
const { registerImage, clearImages } = await import('../../src/lib/images.js');
const { normalizePrint, sheetOf, parseRanges, rangesText, pageCss, withPageCss } = await import('../../src/print/printwin.js');

test('Markdown export with picture files: references and data URIs become files in <name>_images, linked relatively', () => {
  clearImages();
  const ref = registerImage('data:image/png;base64,AAAA', 'my chart.png');
  const text = `# A\n\n![one](${ref})\n\n![two](data:image/jpeg;base64,BBBB)\n\n![again](${ref})\n`;
  const { text: out, files } = markdownWithImageFiles(text, 'Report_images');
  assert.deepEqual(files.map((f) => f.name), ['my-chart.png', 'image-2.jpg']);
  assert.equal(files[0].data, 'AAAA');
  assert.match(out, /!\[one\]\(Report_images\/my-chart\.png\)/);
  assert.match(out, /!\[two\]\(Report_images\/image-2\.jpg\)/);
  assert.match(out, /!\[again\]\(Report_images\/my-chart\.png\)/, 'the same picture is written once');
  assert.ok(!/mmm-img:|data:image/.test(out));
});

test('print setup: papers, orientation, ranges and the page CSS that follows the document\'s own', () => {
  const p = normalizePrint({ paper: 'A5', orientation: 'landscape', copies: 500, margins: 'wide', range: 'x' });
  assert.deepEqual(sheetOf(p), [210, 148]);
  assert.equal(p.copies, 99);
  assert.equal(p.range, 'all');
  assert.deepEqual(parseRanges('1-3, 5, 7-', 9), [1, 2, 3, 5, 7, 8, 9]);
  assert.equal(parseRanges('3-1', 9), null);
  assert.equal(parseRanges('a', 9), null);
  assert.equal(rangesText([1, 2, 3, 5, 7, 8]), '1-3,5,7-8');
  assert.match(pageCss(p), /@page\{size:210mm 148mm;margin:25mm 25mm\}/);
  assert.match(pageCss({ ...p, color: 'gray' }), /grayscale/);
  const html = withPageCss('<html><head><style>@page{size:A4}</style></head><body></body></html>', p);
  assert.ok(html.indexOf('data-print-setup') > html.indexOf('@page{size:A4}'), 'after the document\'s own @page');
});

test('heading sizes per level: only the set levels get CSS, inside the given scope', () => {
  assert.equal(md.headingSizeCss({ headingSizes: { h1: 20, h2: 0, h3: 13.5 } }, '.doc-content'), '.doc-content h1{font-size:20pt !important}.doc-content h3{font-size:13.5pt !important}');
  assert.equal(md.headingSizeCss({}, '#x'), '');
});

test('document settings: logo, chapter breaks, leaders, heading sizes and Markdown pictures are repaired', () => {
  const s = normalizeDocSettings({ logoImage: 'javascript:alert(1)', logoHeightMm: 99, coverLogoPosition: 'side', logoHeaderAlign: 'up', headingSizes: { h1: 3, h2: 200, h3: 'x' }, mdPictures: 'zip', chapterBreak: 'yes' });
  assert.equal(s.logoImage, '');
  assert.equal(s.logoHeightMm, 30);
  assert.equal(s.coverLogoPosition, 'middle');
  assert.equal(s.logoHeaderAlign, 'left');
  assert.deepEqual([s.headingSizes.h1, s.headingSizes.h2, s.headingSizes.h3], [6, 96, 0]);
  assert.equal(s.mdPictures, 'embed');
  assert.equal(s.chapterBreak, false);
  assert.equal(s.tocLeaders, true);
  assert.equal(normalizeDocSettings({ logoImage: 'data:image/png;base64,AA' }).logoImage, 'data:image/png;base64,AA');
  assert.equal(normalizeSettings({ previewMode: 'book' }, 'ko').previewMode, 'flow');
});

test('popup events: each popup only takes its own, so a hidden menu does not come back for the progress window', async () => {
  // A fake Tauri: like the real one, every listener of an event gets it, whichever window it was sent to.
  const listeners = [];
  const sent = [];
  const callbacks = new Map();
  let ids = 0;
  const saved = globalThis.window;
  globalThis.window = {
    addEventListener() {},
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
    __TAURI_INTERNALS__: {
      transformCallback: (callback) => { ids += 1; callbacks.set(ids, callback); return ids; },
      invoke: async (cmd, args) => {
        if (cmd === 'plugin:event|listen') { listeners.push({ event: args.event, id: args.handler }); return listeners.length; }
        if (cmd === 'plugin:event|emit_to') {
          sent.push(args);
          for (const l of listeners) if (l.event === args.event) callbacks.get(l.id)({ event: args.event, payload: args.payload });
          return null;
        }
        if (cmd === 'open_popup' || cmd === 'hide_popup') return null;
        return null;
      },
    },
  };
  try {
    const { PopupHost, forPopup } = await import('../../src/platform/popups.js');
    // The popup side (popup.js): a menu ignores what is meant for the progress window.
    assert.equal(forPopup('menu', 'progress'), false);
    assert.equal(forPopup('menu', 'menu'), true);
    assert.equal(forPopup('menu', undefined), true);
    // The host side: messages to a popup say whom they are for, and the host does not take them as a popup's.
    const host = new PopupHost();
    await host.init();
    const results = [];
    host.receive = (message) => results.push(message);
    await host.post('progress', { type: 'refresh' });
    assert.equal(sent.at(-1).payload.to, 'progress');
    assert.deepEqual(sent.at(-1).target, { kind: 'AnyLabel', label: 'popup-progress' });
    assert.deepEqual(results, [], 'a message to a popup is not one from a popup');
    await globalThis.window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'AnyLabel', label: 'main' }, event: 'popup-message', payload: { kind: 'menu', type: 'result', data: { id: 'x' } } });
    assert.equal(results.length, 1);
    // The menu's choice runs once its window has hidden itself (or after a short wait at most).
    const started = Date.now();
    const hidden = host.whenHidden('menu', 1000);
    await globalThis.window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'AnyLabel', label: 'main' }, event: 'popup-hidden', payload: 'menu' });
    await hidden;
    assert.ok(Date.now() - started < 500);
  } finally {
    globalThis.window = saved;
  }
});
