// Data the app ships: dictionaries, icons, templates, samples, start board layout, help documents.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ko from '../src/i18n/ko.js';
import en from '../src/i18n/en.js';
import { ICON_NAMES } from '../src/icons.js';
import { EDITOR_ICONS } from '../src/icons-editor.js';
import { TEMPLATES, templateText } from '../src/domain/templates.js';
import { SAMPLES, SAMPLE_GROUPS } from '../src/domain/samples.js';
import { kindOf } from '../src/domain/doctypes.js';
import { autoArrange, cardsOf, overlaps, place, layoutValue } from '../src/ui/startlayout.js';

const START_CARD_SPAN = { hero: 3, actions: 2, recent: 1, templates: 3, samples: 3, theme: 3, background: 3 };
const root = new URL('..', import.meta.url);
const source = (dir) => fs.readdirSync(new URL(dir, root), { recursive: true }).filter((f) => /\.js$/.test(f)).map((f) => fs.readFileSync(new URL(`${dir}/${f.replace(/\\/g, '/')}`, root), 'utf8')).join('\n');

test('Korean and English have the same keys and no empty text', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ko).sort());
  for (const [key, value] of [...Object.entries(ko), ...Object.entries(en)]) assert.ok(String(value).trim(), key);
});

test('every literal translation key used in the source exists', () => {
  const code = source('src');
  const keys = new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1]));
  const labels = [...code.matchAll(/label: '([a-z]+\.[\w.]+)'/g)].map((m) => m[1]);
  assert.ok(keys.size > 100);
  for (const key of [...keys, ...labels]) assert.ok(key in ko, `missing key ${key}`);
});

test('every icon used by name exists, and editor icons are new names', () => {
  const code = source('src');
  const used = new Set([...code.matchAll(/\bicon\(\s*'([a-zA-Z0-9]+)'/g), ...code.matchAll(/\bicon: '([a-zA-Z0-9]+)'/g)].map((m) => m[1]));
  assert.ok(used.size > 50);
  for (const name of used) assert.ok(ICON_NAMES.includes(name), `missing icon ${name}`);
  assert.ok(Object.keys(EDITOR_ICONS).length > 40);
});

test('templates: three kinds, both languages, no {date} left', () => {
  for (const template of TEMPLATES) {
    assert.ok(['markdown', 'html', 'text'].includes(template.kind), template.id);
    assert.equal(template.ko.length, 2);
    assert.equal(template.en.length, 2);
    for (const language of ['ko', 'en']) assert.doesNotMatch(templateText(template, language), /\{date\}/);
  }
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

test('samples: each group has some, file names give the right kind', () => {
  for (const group of SAMPLE_GROUPS) assert.ok(SAMPLES.some((s) => s.group === group.id), group.id);
  for (const sample of SAMPLES) {
    assert.equal(kindOf(sample.file), sample.group, sample.file);
    assert.ok(sample.text.length > 100, sample.id);
  }
});

test('samples/ folder matches the sample list (npm run samples)', () => {
  for (const sample of SAMPLES) {
    const file = new URL(`samples/${sample.file}`, root);
    assert.ok(fs.existsSync(file), `samples/${sample.file} is missing — run npm run samples`);
    assert.equal(fs.readFileSync(file, 'utf8'), sample.text, `samples/${sample.file} is out of date — run npm run samples`);
  }
});

test('start board: default arrangement and moves never overlap cards', () => {
  const ids = Object.keys(START_CARD_SPAN);
  const check = (cards) => {
    const list = Object.values(cards);
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.ok(!overlaps(list[i], list[j]));
  };
  const arranged = autoArrange(ids, START_CARD_SPAN, { hero: 6, actions: 10, recent: 8 });
  check(arranged);
  check(place(arranged, 'recent', { col: 0, row: 0 }));
  check(place(arranged, 'theme', { w: 1, h: 30, fit: false }));
  check(cardsOf(layoutValue(arranged), ids, START_CARD_SPAN));
});

test("the user's guide exists in both languages under doc/ (the tutorial was dropped)", () => {
  for (const name of ['UsersGuide.md', 'UsersGuide.en.md']) {
    const text = fs.readFileSync(new URL(`doc/${name}`, root), 'utf8');
    assert.match(text, /^# /, name);
    assert.ok(text.length > 2000, `${name} is too short`);
  }
});
