'use strict';
/* The help window's data (src/help/help-data.js, built from doc/help/*.md by scripts/make-help.mjs):
 * up to date with the Markdown, every picture present, every tutorial link a real step. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = {};
require('../src/help/help-data.js');
require('../src/js/tour.js');
const PAGES = window.HELP_PAGES;
const STEPS = new Set(window.Tour.STEPS.map((s) => s.id));

test('every doc/help page is in the help window, in order, with a title', () => {
  const md = fs.readdirSync(path.join(ROOT, 'doc', 'help')).filter((f) => f.endsWith('.md')).sort().map((f) => path.basename(f, '.md'));
  assert.deepStrictEqual(PAGES.map((p) => p.id), md, 'run npm run help:build');
  for (const p of PAGES) {
    assert.ok(p.title && p.html.startsWith('<h1>'), p.id);
    const src = fs.readFileSync(path.join(ROOT, 'doc', 'help', `${p.id}.md`), 'utf8');
    assert.ok(src.includes(`# ${p.title}`), `${p.id}: help-data.js is older than the Markdown — run npm run help:build`);
  }
});

test('every picture exists (doc/images and the copy the app ships)', () => {
  for (const p of PAGES) for (const m of p.html.matchAll(/src="help\/images\/([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'src', 'help', 'images', m[1])), `${p.id}: src/help/images/${m[1]}`);
    assert.ok(fs.existsSync(path.join(ROOT, 'doc', 'images', m[1])), `${p.id}: doc/images/${m[1]}`);
  }
});

test('every "show in the tutorial" link is a tutorial step', () => {
  for (const p of PAGES) {
    if (p.tour) assert.ok(STEPS.has(p.tour), `${p.id}: tour ${p.tour}`);
    for (const m of p.html.matchAll(/data-tour="([\w-]+)"/g)) assert.ok(STEPS.has(m[1]), `${p.id}: tour ${m[1]}`);
  }
});

test('doc/tutorial.md shows every tutorial step with its picture', { skip: !fs.existsSync(path.join(ROOT, 'doc', 'tutorial.md')) && 'run npm run tutorial:video' }, () => {
  const md = fs.readFileSync(path.join(ROOT, 'doc', 'tutorial.md'), 'utf8');
  for (const s of window.Tour.STEPS) assert.ok(md.includes(s.ko[0]), `step ${s.id} in doc/tutorial.md`);
  for (const m of md.matchAll(/\(images\/([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'doc', 'images', m[1])), m[1]);
});
