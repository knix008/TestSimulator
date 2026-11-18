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
