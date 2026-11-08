// The tutorial: its steps and chapters, the four-page site it builds (FlowNote), and the tutorial
// document written from it — one test per check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, STEPS } from '../../src/ui/tutorial.js';
import { OPS, PROJECT_ACCENT, PROJECT_DARK, TUTORIAL_WORDS, stageSite } from '../../src/ui/tutorial-project.js';
import { SpellChecker, decodeWordList } from '../../src/domain/spell.js';
import { SPELL_EXTRA } from '../../src/domain/spell-extra.js';
import { siteProblems, spellingProblems } from '../../src/domain/problems.js';
import { siteFiles } from '../../src/domain/publish.js';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ids = STEPS.map((s) => s.id);
const read = (id) => decodeWordList(fs.readFileSync(path.join(root, 'public', 'dict', `${id}.txt`), 'utf8'));
const checker = new SpellChecker({ en: read('en'), ko: read('ko'), extra: SPELL_EXTRA });
const final = (L) => stageSite(L, ids, ids.length);

test('steps: unique ids, known chapters in order, every step translated', () => {
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(STEPS.length >= 30, `${STEPS.length} steps`);
  assert.deepEqual([...new Set(STEPS.map((s) => s.chapter))], CHAPTERS, 'chapters in order, none empty');
  for (const dict of [ko, en]) {
    for (const c of CHAPTERS) assert.ok(dict[`tutorial.chapter.${c}`], `chapter ${c}`);
    for (const s of STEPS) assert.ok(dict[`tutorial.${s.id}.title`] && dict[`tutorial.${s.id}.text`], s.id);
  }
});

test('every change the tutorial makes belongs to a step, in the step order', () => {
  for (const id of Object.keys(OPS)) assert.ok(ids.includes(id), id);
  const order = Object.keys(OPS).map((id) => ids.indexOf(id));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

for (const L of ['ko', 'en']) {
  test(`the site at every step builds [${L}]`, () => {
    let pages = 1;
    for (let i = 0; i <= ids.length; i++) {
      const site = stageSite(L, ids, i);
      assert.ok(site.pages.length >= pages, `pages never go away (step ${i})`);
      pages = site.pages.length;
    }
  });

  test(`the finished site: four pages, dark design, accent, sticky header [${L}]`, () => {
    const site = final(L);
    assert.deepEqual(site.pages.map((p) => p.slug), ['index', 'pricing', 'about', 'contact']);
    assert.equal(site.design.id, PROJECT_DARK);
    assert.equal(site.design.overrides.accent, PROJECT_ACCENT);
    assert.ok(site.layout.header.props.sticky);
    assert.deepEqual(site.pages[0].blocks.map((b) => b.type), ['hero', 'logos', 'features', 'stats', 'testimonials', 'cta']);
    assert.equal(site.pages[0].blocks[2].style.anchor, 'features');
    assert.ok(site.meta.description.length > 20 && site.meta.description.length <= 160);
  });

  test(`the typo is there until the spelling step and gone after it [${L}]`, () => {
    const before = stageSite(L, ids, ids.indexOf('spelling'));
    const after = stageSite(L, ids, ids.indexOf('spelling') + 1);
    const words = (site) => spellingProblems(site, checker).map((p) => p.word);
    assert.ok(words(before).includes(TUTORIAL_WORDS.typo[L]));
    assert.ok(!words(after).includes(TUTORIAL_WORDS.typo[L]));
    assert.ok(checker.suggest(TUTORIAL_WORDS.typo[L]).slice(0, 3).includes(TUTORIAL_WORDS.fixed[L]), 'the right word is suggested');
    assert.ok(words(after).includes(TUTORIAL_WORDS.newWord[L]), 'the word of the dictionary step is still unknown');
  });

  test(`the finished site has no problems once its word is in the dictionary [${L}]`, () => {
    const c = new SpellChecker({ en: read('en'), ko: read('ko'), extra: SPELL_EXTRA, user: [TUTORIAL_WORDS.newWord[L]] });
    assert.deepEqual(siteProblems(final(L), { checker: c }).map((p) => `${p.code} ${p.word ?? ''}`), []);
  });

  test(`the finished site publishes with every page [${L}]`, () => {
    const files = siteFiles(final(L)).map((f) => f.path);
    for (const name of ['index.html', 'pricing.html', 'about.html', 'contact.html', 'style.css']) assert.ok(files.includes(name), name);
  });
}

test('the tutorial document follows the steps, in both languages', () => {
  for (const [file, dict, lang] of [['Tutorial.md', ko, 'ko'], ['Tutorial.en.md', en, 'en']]) {
    const text = fs.readFileSync(path.join(root, 'doc', file), 'utf8');
    const titles = [...text.matchAll(/^### (\d+)\. (.+)$/gm)].map((m) => [Number(m[1]), m[2]]);
    assert.deepEqual(titles, STEPS.map((s, i) => [i + 1, dict[`tutorial.${s.id}.title`]]), file);
    for (const [i, s] of STEPS.entries()) assert.ok(fs.existsSync(path.join(root, 'doc', 'images', lang, 'tutorial', `${String(i + 1).padStart(2, '0')}-${s.id}.png`)), `${lang} picture of ${s.id}`);
  }
});
