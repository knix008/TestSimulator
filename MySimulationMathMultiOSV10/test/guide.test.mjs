// The user manual (src/docs, src/lib/guide.js), the tutorial steps
// (src/lib/tutorialSteps.js) and the tutorial settings defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMarkdown, tocTree, buildManual, manualStats, imagesOf, currentHeading, clampFont, FONT_DEFAULT,
  manualPrintHtml, highlightM, inline, chapterIdOf, resolveUrl,
} from '../src/lib/guide.js';
import { STEPS, CHAPTERS, tutorialMarkdown, tourCode, dwellOf } from '../src/lib/tutorialSteps.js';
import { DEFAULTS, merge } from '../src/lib/settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = new RegExp(['matl', 'ab|simul', 'ink'].join(''), 'i');
const readDocs = (lang) => {
  const dir = path.join(root, 'src/docs', lang);
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => [`../docs/${lang}/${f}`, fs.readFileSync(path.join(dir, f), 'utf8')]));
};
const FILES = { ...readDocs('ko'), ...readDocs('en') };

test('headings become stable ids and a nested table of contents', () => {
  const doc = parseMarkdown('# Title\n\n## One\n\ntext\n\n### One.a\n\n## Two\n', { prefix: 'ch' });
  assert.equal(doc.title, 'Title');
  assert.deepEqual(doc.headings.map((h) => [h.level, h.id, h.text]), [[1, 'ch', 'Title'], [2, 'ch-0', 'One'], [3, 'ch-1', 'One.a'], [2, 'ch-2', 'Two']]);
  const tree = tocTree(doc.headings);
  assert.equal(tree.length, 1);
  assert.deepEqual(tree[0].children.map((c) => c.text), ['One', 'Two']);
  assert.deepEqual(tree[0].children[0].children.map((c) => c.id), ['ch-1']);
  assert.match(doc.html, /<h2 id="ch-0">One<\/h2>/);
});

test('markdown blocks: tables, lists, notes, figures, code and keys', () => {
  const md = [
    '# T', '', '| a | b |', '| --- | ---: |', '| `x \\| y` | **2** |', '',
    '3. three', '4. four', '', '- item', '  - nested', '',
    '> Tip: be careful', '', '![A caption](images/ko/x.png)', '',
    '```m', "x = 1; % note", "s = 'it''s';", '```', '', 'Press {{Ctrl+S}} and <b>.',
  ].join('\n');
  const { html } = parseMarkdown(md, { prefix: 't', base: 'docs/' });
  assert.match(html, /<table>/);
  assert.match(html, /<code>x \| y<\/code>/);
  assert.match(html, /<td style="text-align:right"><strong>2<\/strong><\/td>/);
  assert.match(html, /<ol start="3"><li>three<\/li><li>four<\/li><\/ol>/);
  assert.match(html, /<ul><li>item<ul><li>nested<\/li><\/ul><\/li><\/ul>/);
  assert.match(html, /<div class="note note-tip">/);
  assert.match(html, /<figure><img src="docs\/images\/ko\/x.png" alt="A caption" loading="lazy"><figcaption>A caption<\/figcaption><\/figure>/);
  assert.match(html, /<span class="tk-c">% note<\/span>/);
  assert.match(html, /<span class="tk-s">&#39;it&#39;&#39;s&#39;<\/span>/);
  assert.match(html, /<kbd>Ctrl<\/kbd>\+<kbd>S<\/kbd>/);
  assert.match(html, /&lt;b&gt;/, 'raw HTML is escaped');
});

test('M highlighting tells transposes from strings', () => {
  const h = highlightM("y = A' + b'; s = 'text'; for k = 1:3, end");
  assert.ok(h.startsWith('y = A&#39; + b&#39;;'), 'a transpose is not a string');
  assert.match(h, /<span class="tk-s">&#39;text&#39;<\/span>/);
  assert.match(h, /<span class="tk-k">for<\/span>/);
  assert.match(h, /<span class="tk-n">1<\/span>/);
});

test('links: internal anchors stay, relative URLs get the base', () => {
  assert.match(inline('[go](#editor)'), /href="#editor" data-internal="1"/);
  assert.equal(resolveUrl('images/a.png', 'docs/'), 'docs/images/a.png');
  assert.equal(resolveUrl('https://x.org/a', 'docs/'), 'https://x.org/a');
  assert.equal(chapterIdOf('../docs/ko/03-command-window.md'), 'command-window');
});

test('scroll spy picks the last heading above the reading line', () => {
  const tops = [{ id: 'a', top: 0 }, { id: 'b', top: 400 }, { id: 'c', top: 900 }];
  assert.equal(currentHeading(tops, 0), 'a');
  assert.equal(currentHeading(tops, 390), 'b');
  assert.equal(currentHeading(tops, 899), 'c');
  assert.equal(currentHeading([], 10), null);
});

test('font size: 12 px by default, clamped to 9..24', () => {
  assert.equal(FONT_DEFAULT, 12);
  assert.equal(clampFont(undefined), 12);
  assert.equal(clampFont(3), 9);
  assert.equal(clampFont(99), 24);
  assert.equal(clampFont('15'), 15);
});

for (const lang of ['ko', 'en']) {
  test(`the ${lang} manual: chapters, sections and images`, () => {
    const m = buildManual(FILES, lang, { base: 'docs/' });
    const st = manualStats(m);
    assert.ok(st.chapters >= 16, `${st.chapters} chapters`);
    assert.ok(st.sections >= 80, `${st.sections} sections`);
    assert.ok(st.images >= 20, `${st.images} figures`);
    for (const c of m.chapters) {
      assert.ok(c.title, `${c.file} has a title`);
      assert.equal(c.headings[0].level, 1, `${c.file} starts with # Title`);
      const ids = c.headings.map((h) => h.id);
      assert.equal(new Set(ids).size, ids.length, `${c.file}: unique ids`);
    }
    assert.equal(new Set(m.chapters.map((c) => c.id)).size, m.chapters.length, 'unique chapter ids');
    for (const src of imagesOf(m)) {
      assert.ok(src.startsWith(`docs/images/${lang}/`), `${src} is in the ${lang} image folder`);
      assert.ok(fs.existsSync(path.join(root, 'public', src)), `${src} exists`);
    }
  });
}

test('Korean and English manuals have the same structure and pictures', () => {
  const ko = buildManual(FILES, 'ko');
  const en = buildManual(FILES, 'en');
  assert.deepEqual(en.chapters.map((c) => c.id), ko.chapters.map((c) => c.id));
  for (let i = 0; i < ko.chapters.length; i++) {
    assert.deepEqual(en.chapters[i].headings.map((h) => `${h.level}:${h.id}`), ko.chapters[i].headings.map((h) => `${h.level}:${h.id}`), ko.chapters[i].file);
  }
  const names = (m) => imagesOf(m).map((s) => s.split('/').pop()).sort();
  assert.deepEqual(names(en), names(ko));
});

test('no product names of other vendors in the docs or the guide code', () => {
  const files = [
    ...Object.entries(FILES),
    ...['src/lib/guide.js', 'src/lib/guideDocs.js', 'src/lib/guideLink.js', 'src/lib/tutorialSteps.js', 'src/lib/tourActions.js', 'src/components/GuideWindow.jsx', 'src/components/GuideHost.jsx', 'src/components/Tutorial.jsx', 'src/components/TutorialAsk.jsx', 'src/guide.css', 'src/tutorial.css']
      .map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]),
  ];
  for (const [name, text] of files) assert.ok(!BANNED.test(text), name);
  for (const lang of ['ko', 'en']) for (const f of fs.readdirSync(path.join(root, 'public/docs/images', lang))) assert.ok(!BANNED.test(f), f);
});

test('print page: every chapter, a contents page and absolute image URLs', () => {
  const m = buildManual(FILES, 'ko', { base: 'docs/' });
  const html = manualPrintHtml(m.chapters, { title: 'Manual', lang: 'ko', baseUrl: 'http://host/app/', fontSize: 12 });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<nav class="print-toc">/);
  assert.equal((html.match(/<section class="guide-chapter"/g) || []).length, m.chapters.length);
  assert.match(html, /<img src="http:\/\/host\/app\/docs\/images\/ko\//);
  assert.ok(!/<img src="docs\//.test(html), 'no relative image left');
  const one = manualPrintHtml([m.chapters[0]], { title: 'One', baseUrl: 'http://host/' });
  assert.ok(!one.includes('<nav class="print-toc">'), 'a single chapter has no contents page');
});

test('tutorial steps: ids, chapters, texts and targets', () => {
  const ids = STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'unique step ids');
  for (const c of CHAPTERS) assert.ok(STEPS.some((s) => s.chapter === c.id), `chapter ${c.id} has steps`);
  for (const s of STEPS) {
    assert.ok(CHAPTERS.some((c) => c.id === s.chapter), `${s.id}: known chapter`);
    for (const l of ['ko', 'en']) { assert.ok(s[l].title && s[l].body.length > 20, `${s.id} ${l} text`); }
    assert.ok(s.target.length > 0 && s.target.every((x) => typeof x === 'string' && x), `${s.id} target`);
    assert.ok(dwellOf(s, 'ko') >= 4000);
  }
  // The walk the user asked for: start → script → Command Window → Workspace → run → figure (zoom, 2D/3D) → model → settings.
  const order = ['welcome', 'newScript', 'cmd', 'workspace', 'runScript', 'figZoom', 'fig3d', 'model', 'settings'].map((id) => ids.indexOf(id));
  assert.ok(order.every((x) => x >= 0), 'every required step exists');
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in this order');
  assert.ok(tourCode('script', 'ko').includes('감쇠'));
  assert.ok(!/[가-힣]/.test(tourCode('script', 'en')), 'the English script has no Korean');
});

test('tutorial document: one section per chapter, pictures that exist', () => {
  for (const lang of ['ko', 'en']) {
    const md = tutorialMarkdown(lang);
    const doc = parseMarkdown(md, { prefix: 'tutorial', base: 'docs/' });
    assert.equal(doc.headings.filter((h) => h.level === 2).length, CHAPTERS.length);
    assert.equal(doc.headings.filter((h) => h.level === 3).length, STEPS.length);
    for (const m of doc.html.matchAll(/<img src="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, 'public', m[1])), m[1]);
  }
});

test('settings: the tutorial launch popup is on by default and keeps its choice', () => {
  assert.deepEqual(DEFAULTS.tutorial, { askOnLaunch: true, done: false });
  const s = merge(DEFAULTS, { tutorial: { askOnLaunch: false } });
  assert.equal(s.tutorial.askOnLaunch, false);
  assert.equal(s.tutorial.done, false);
  assert.equal(merge(DEFAULTS, {}).tutorial.askOnLaunch, true);
});
