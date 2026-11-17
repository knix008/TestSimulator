import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoArrange, cardsOf, COLS, compact, LAYOUT_VERSION, layoutValue, overlaps, place, rowsFor } from '../../src/startboard.js';
import { inline, renderMarkdown, slug } from '../../src/domain/markdown.js';
import { defaultSettings, sanitizeSettings } from '../../src/domain/settings.js';
import { messages } from '../../src/i18n.js';
import { QUICK_TASKS, TIP_COUNT } from '../../src/start.js';
import { THEMES } from '../../src/themes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');
const IDS = ['hero', 'begin', 'recent', 'tips', 'themes'];
const noOverlap = (cards) => {
  const list = Object.entries(cards);
  for (const [a, ca] of list) for (const [b, cb] of list) if (a < b) assert.ok(!overlaps(ca, cb), `${a} overlaps ${b}`);
};

test('start board: default layout — name card on top, full width, nothing overlapping', () => {
  const cards = cardsOf(null, IDS, { hero: 5, begin: 6, recent: 9, tips: 11, themes: 6 });
  assert.deepEqual(cards.hero, { col: 0, row: 0, w: COLS, h: 5, fit: true });
  assert.equal(cards.begin.row, 5);
  assert.equal(cards.begin.w, 3);
  // Recent (2 columns) and tips (1 column) share a row, as tall as the taller one.
  assert.equal(cards.recent.row, cards.tips.row);
  assert.equal(cards.recent.col + cards.recent.w, cards.tips.col);
  assert.equal(cards.themes.row, cards.recent.row + 11);
  noOverlap(cards);
});

test('start board: moving a card pushes the others aside, the name card never moves', () => {
  const start = cardsOf(null, IDS, { hero: 5, begin: 6, recent: 9, tips: 9, themes: 6 });
  const moved = place(start, 'themes', { col: 0, row: 0 });
  assert.deepEqual(moved.hero, start.hero, 'the name card keeps the first row');
  assert.equal(moved.themes.row, 5, 'dropped right under the name card');
  assert.ok(moved.begin.row >= moved.themes.row + moved.themes.h, 'the card that was there moves down');
  noOverlap(moved);
  const hero = place(start, 'hero', { col: 1, row: 7, w: 1 });
  assert.deepEqual(hero.hero, { col: 0, row: 0, w: 3, h: 5, fit: true });
});

test('start board: resize, saved layouts and broken storage', () => {
  const start = cardsOf(null, IDS, { hero: 5, begin: 6, recent: 9, tips: 9, themes: 6 });
  const resized = place(start, 'tips', { w: 3, h: 14, fit: false });
  assert.equal(resized.tips.w, 3);
  assert.equal(resized.tips.col, 0, 'a card made wider stays on the board');
  noOverlap(resized);
  const saved = layoutValue(resized);
  assert.equal(saved.version, LAYOUT_VERSION);
  const again = cardsOf(JSON.parse(JSON.stringify(saved)), IDS, { hero: 5, begin: 6, recent: 9, themes: 6 });
  assert.equal(again.tips.h, 14, 'a resized card keeps its height');
  assert.equal(again.tips.fit, false);
  // Rubbish in storage → the default arrangement.
  assert.deepEqual(cardsOf({ version: 99, cards: {} }, IDS, {}), cardsOf(null, IDS, {}));
  assert.deepEqual(cardsOf('nope', IDS, {}), cardsOf(null, IDS, {}));
  // A card the saved layout does not know yet goes at the bottom.
  const partial = cardsOf({ version: LAYOUT_VERSION, flow: 'custom', cards: { hero: { col: 0, row: 0, w: 3, h: 4 } } }, IDS, {});
  noOverlap(partial);
  assert.equal(Object.keys(partial).length, IDS.length);
  // Auto arrange gives back the default.
  assert.deepEqual(autoArrange(IDS, { hero: 5, begin: 6, recent: 9, tips: 9, themes: 6 }), start);
  assert.equal(rowsFor(0), 2);
  assert.equal(rowsFor(186), 10);
  const gaps = compact({ a: { col: 0, row: 7, w: 1, h: 2 }, b: { col: 0, row: 20, w: 1, h: 2 } });
  assert.deepEqual([gaps.a.row, gaps.b.row], [0, 2]);
});

test('start screen: shown at startup by default, can be turned off', () => {
  assert.equal(defaultSettings.showStartScreen, true);
  assert.equal(sanitizeSettings({}).showStartScreen, true);
  assert.equal(sanitizeSettings({ showStartScreen: false }).showStartScreen, false);
  assert.equal(sanitizeSettings({ showStartScreen: 'no' }).showStartScreen, true);
  // Every quick-start tile and tip has its text in both languages.
  for (const language of ['ko', 'en']) {
    for (const [mode, target] of QUICK_TASKS) {
      assert.ok(messages[language][`start.quick.${mode}.${target}`], `${language}: ${mode}.${target}`);
      assert.ok(messages[language][`start.quick.${mode}.${target}.detail`], `${language}: ${mode}.${target}.detail`);
    }
    for (let i = 0; i < TIP_COUNT; i += 1) assert.ok(messages[language][`start.tip.${i}`]);
  }
  assert.equal(QUICK_TASKS.length, 6);
});

test('themes: 20 dark, 20 light, unique ids and names', () => {
  assert.equal(THEMES.filter((theme) => theme.mode === 'dark').length, 20);
  assert.equal(THEMES.filter((theme) => theme.mode === 'light').length, 20);
  assert.equal(new Set(THEMES.map((theme) => theme.id)).size, 40);
});

test('markdown: headings, lists, tables, code, quotes and escaping', () => {
  const { html, headings } = renderMarkdown([
    '# Title',
    '',
    '## 1. 시작 화면',
    '',
    'Some **bold**, *italic* and `code <b>` text.',
    'Same paragraph.',
    '',
    '- one',
    '- two',
    '  - nested',
    '- three',
    '',
    '1. first',
    '2. second',
    '',
    '| A | B |',
    '|---|:---:|',
    '| x \\| y | <script> |',
    '',
    '```text',
    '<tag> & stuff',
    '```',
    '',
    '> quoted **text**',
    '',
    '---',
    '',
    '### 1. 시작 화면',
    '[Tutorial](Tutorial.md) and [site](https://example.com) and [bad](javascript:alert(1))',
  ].join('\n'));
  assert.deepEqual(headings.map((item) => [item.level, item.id]), [[1, 'title'], [2, '1-시작-화면'], [3, '1-시작-화면-2']]);
  assert.match(html, /<p>Some <strong>bold<\/strong>, <em>italic<\/em> and <code>code &lt;b&gt;<\/code> text\. Same paragraph\.<\/p>/);
  assert.match(html, /<ul><li>one<\/li><li>two<ul><li>nested<\/li><\/ul><\/li><li>three<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<td>x \| y<\/td><td style="text-align:center">&lt;script&gt;<\/td>/);
  assert.match(html, /<pre><code class="language-text">&lt;tag&gt; &amp; stuff<\/code><\/pre>/);
  assert.match(html, /<blockquote><p>quoted <strong>text<\/strong><\/p><\/blockquote>/);
  assert.match(html, /<hr \/>/);
  assert.match(html, /<a href="#" data-link="Tutorial.md">Tutorial<\/a>/);
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noreferrer">site<\/a>/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(slug('7. 테마 (Themes)!'), '7-테마-themes');
  assert.equal(inline('a ** b'), 'a ** b');
  // Pictures: a figure with a caption, resolved through `image`; unknown ones are left out.
  const pictures = renderMarkdown('![Start "screen"](images/ko/start.png)\n\n![gone](images/ko/none.png)\n\n1. a\n\n![x](images/ko/start.png)\n\n2. b', {
    image: (src) => (src.endsWith('start.png') ? `/assets/${src}` : null),
  }).html;
  assert.match(pictures, /<figure><img src="\/assets\/images\/ko\/start.png" alt="Start &quot;screen&quot;" decoding="async" \/><figcaption>Start &quot;screen&quot;<\/figcaption><\/figure>/);
  assert.doesNotMatch(pictures, /none\.png/);
  assert.match(pictures, /<ol start="2"><li>b<\/li><\/ol>/, 'a numbered list split by a picture keeps counting');
  assert.doesNotMatch(renderMarkdown('![x](javascript:alert(1))').html, /<img/);
  // A stray fence-like line never stalls the renderer.
  assert.match(renderMarkdown('```js extra\ntext').html, /```js extra/);
});

test('doc/: user guide and tutorial in Korean and English, rendered with contents', () => {
  for (const file of ['UsersGuide.md', 'UsersGuide.en.md', 'Tutorial.md', 'Tutorial.en.md']) {
    const text = fs.readFileSync(path.join(projectRoot, 'doc', file), 'utf8');
    const { html, headings } = renderMarkdown(text);
    assert.ok(headings.filter((item) => item.level === 2).length >= 8, `${file}: chapters`);
    assert.ok(text.includes('1.0.2'), `${file}: version`);
    assert.ok(html.length > 4000, `${file}: content`);
    assert.equal(new Set(headings.map((item) => item.id)).size, headings.length, `${file}: unique ids`);
  }
  // Pictures: every one a document names exists, in that document's language, and each
  // guide shows at least ten of them (made by npm run guide:images).
  for (const [file, language, least] of [['UsersGuide.md', 'ko', 10], ['UsersGuide.en.md', 'en', 10], ['Tutorial.md', 'ko', 5], ['Tutorial.en.md', 'en', 5]]) {
    const text = fs.readFileSync(path.join(projectRoot, 'doc', file), 'utf8');
    const pictures = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
    assert.ok(pictures.length >= least, `${file}: ${pictures.length} pictures`);
    for (const picture of pictures) {
      assert.ok(picture.startsWith(`images/${language}/`), `${file}: ${picture} is in the ${language} folder`);
      assert.ok(fs.existsSync(path.join(projectRoot, 'doc', picture)), `${file}: ${picture} exists`);
    }
    const { html } = renderMarkdown(text, { image: (src) => `/x/${src}` });
    assert.equal((html.match(/<figure><img src="\/x\/images\//g) ?? []).length, pictures.length, `${file}: every picture is a figure`);
  }
  // The guides describe the start screen, the title-bar panel buttons and the themes.
  const ko = fs.readFileSync(path.join(projectRoot, 'doc', 'UsersGuide.md'), 'utf8');
  for (const word of ['시작 화면', '왼쪽 패널', '오른쪽 패널', '어두운 테마 20', '밝은 테마 20', '사용자 정의']) assert.ok(ko.includes(word), word);
  const en = fs.readFileSync(path.join(projectRoot, 'doc', 'UsersGuide.en.md'), 'utf8');
  for (const word of ['Start screen', 'Left panel', 'Right panel', '20 dark', '20 light', 'Custom']) assert.ok(en.includes(word), word);
});
