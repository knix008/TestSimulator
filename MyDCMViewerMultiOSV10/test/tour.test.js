'use strict';
/* The tutorial (src/js/tour.js): every step's demo uses app commands that exist, opens samples that
 * exist, points at elements of the page, belongs to a chapter, and has both languages. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = {};
require('../src/js/tour.js');
const { STEPS, CHAPTERS } = window.Tour;
const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
const actions = new Set([...app.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]));
const samples = new Set([...fs.readFileSync(path.join(ROOT, 'src/js/start/sampleList.js'), 'utf8').matchAll(/\{ id: '([a-z0-9-]+)', file: '([^']+)'/g)].map((m) => {
  assert.ok(fs.existsSync(path.join(ROOT, 'samples', m[2])), `sample file ${m[2]}`);
  return m[1];
}));

test('steps: unique ids, a known chapter, Korean and English text', () => {
  const ids = new Set();
  const chapters = new Set(CHAPTERS.map((c) => c.id));
  for (const s of STEPS) {
    assert.ok(!ids.has(s.id), `duplicate step ${s.id}`); ids.add(s.id);
    assert.ok(chapters.has(s.chapter), `${s.id}: chapter ${s.chapter}`);
    for (const l of ['ko', 'en']) assert.ok(s[l] && s[l][0] && s[l][1] && s[l][1].length > 20, `${s.id}: ${l} text`);
  }
  for (const c of CHAPTERS) assert.ok(STEPS.some((s) => s.chapter === c.id), `chapter ${c.id} has steps`);
  assert.ok(STEPS.length >= 40, `${STEPS.length} steps`);
});

test('every demo command exists in app.js and every sample is listed', () => {
  for (const s of STEPS) for (const item of s.play || []) {
    if (!Array.isArray(item)) { assert.ok(item.wait > 0 || item.spot, `${s.id}: play item`); continue; }
    const [action, data] = item;
    assert.ok(actions.has(action), `${s.id}: unknown action ${action}`);
    if (action === 'sample') assert.ok(samples.has(data.sample), `${s.id}: unknown sample ${data.sample}`);
  }
});

test('targets point at elements of the page', () => {
  for (const s of STEPS) {
    if (!s.target) continue;
    for (const id of s.target.match(/#[A-Za-z][\w-]*/g) || []) assert.ok(html.includes(`id="${id.slice(1)}"`) || /startPage/.test(id), `${s.id}: ${id}`);
    for (const cls of s.target.match(/\.[a-z][\w-]*/g) || []) assert.ok(html.includes(cls.slice(1)) || /start-/.test(cls), `${s.id}: ${cls}`);
  }
});

test('the major features each have a step', () => {
  const ids = new Set(STEPS.map((s) => s.id));
  for (const id of ['samples', 'window', 'length', 'roi', 'cine', 'video', 'layout', 'mpr', 'volume', 'filters', 'fusion', 'tageditor', 'anonymize', 'sr', 'ecg', 'rt', 'dicomdir', 'export', 'exportas', 'print', 'batch', 'pacs', 'look', 'help']) {
    assert.ok(ids.has(id), `step ${id}`);
  }
});
