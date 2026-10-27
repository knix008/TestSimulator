'use strict';
/* The help window's data (src/help/help-data.js, built from doc/help/*.md and doc/help/en/*.md by
 * scripts/make-help.mjs): up to date with the Markdown, the English pages the same as the Korean ones,
 * every picture present, every tutorial link a real step. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = {};
require('../src/help/help-data.js');
require('../src/js/tour.js');
const PAGES = window.HELP_PAGES;
const LANGS = window.HELP_LANGS;
const ALL = [...LANGS.ko, ...LANGS.en];
const DIRS = { ko: path.join(ROOT, 'doc', 'help'), en: path.join(ROOT, 'doc', 'help', 'en') };
const STEPS = new Set(window.Tour.STEPS.map((s) => s.id));

test('every doc/help page is in the help window, in order, with a title (Korean and English)', () => {
  assert.strictEqual(PAGES, LANGS.ko);
  for (const [lang, dir] of Object.entries(DIRS)) {
    const md = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => path.basename(f, '.md'));
    assert.deepStrictEqual(LANGS[lang].map((p) => p.id), md, `${lang}: run npm run help:build`);
    for (const p of LANGS[lang]) {
      assert.ok(p.title && p.html.startsWith('<h1>'), `${lang} ${p.id}`);
      const src = fs.readFileSync(path.join(dir, `${p.id}.md`), 'utf8');
      assert.ok(src.includes(`# ${p.title}`), `${lang} ${p.id}: help-data.js is older than the Markdown — run npm run help:build`);
    }
  }
});

test('the English manual has every Korean page, with the same sections, pictures and tutorial links, and no Korean', () => {
  assert.deepStrictEqual(LANGS.en.map((p) => p.id), LANGS.ko.map((p) => p.id));
  const shape = (p) => ({
    headings: p.headings.map((h) => h.level),
    pictures: [...p.html.matchAll(/src="help\/images\/(?:en\/)?([^"]+)"/g)].map((m) => m[1]),
    tours: [p.tour, ...[...p.html.matchAll(/data-tour="([\w-]+)"/g)].map((m) => m[1])],
    rows: (p.html.match(/<tr>/g) || []).length,
  });
  LANGS.ko.forEach((ko, i) => {
    const en = LANGS.en[i];
    assert.deepStrictEqual(shape(en), shape(ko), en.id);
    assert.ok(!/[가-힣]/.test(en.html), `${en.id}: Korean text in the English page`);
  });
});

test('every picture exists (doc/images and the copy the app ships)', () => {
  for (const p of ALL) for (const m of p.html.matchAll(/src="help\/images\/([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'src', 'help', 'images', m[1])), `${p.id}: src/help/images/${m[1]}`);
    assert.ok(fs.existsSync(path.join(ROOT, 'doc', 'images', m[1])), `${p.id}: doc/images/${m[1]}`);
  }
});

test('every "show in the tutorial" link is a tutorial step', () => {
  for (const p of ALL) {
    if (p.tour) assert.ok(STEPS.has(p.tour), `${p.id}: tour ${p.tour}`);
    for (const m of p.html.matchAll(/data-tour="([\w-]+)"/g)) assert.ok(STEPS.has(m[1]), `${p.id}: tour ${m[1]}`);
  }
});

test('doc/tutorial.md shows every tutorial step with its picture', { skip: !fs.existsSync(path.join(ROOT, 'doc', 'tutorial.md')) && 'run npm run tutorial:video' }, () => {
  const md = fs.readFileSync(path.join(ROOT, 'doc', 'tutorial.md'), 'utf8');
  for (const s of window.Tour.STEPS) assert.ok(md.includes(s.ko[0]), `step ${s.id} in doc/tutorial.md`);
  for (const m of md.matchAll(/\(images\/([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'doc', 'images', m[1])), m[1]);
});
