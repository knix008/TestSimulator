import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const examples = JSON.parse(read('public/examples/examples.json'));
const I18N = read('src/i18n.js');
const HTML = read('index.html');

test('the start screen has 20 famous paintings', () => {
  assert.equal(examples.length, 20);
  assert.equal(new Set(examples.map((work) => work.id)).size, 20, 'ids are unique');
  for (const work of examples) {
    for (const key of ['id', 'ko', 'en', 'artistKo', 'artistEn', 'image', 'source']) assert.ok(work[key], `${work.id}.${key}`);
    assert.match(work.source, /^https:\/\/commons\.wikimedia\.org\//, `${work.id} comes from Wikimedia Commons`);
  }
});

test('every painting is a public-domain work by an artist who died long ago', () => {
  for (const work of examples) {
    assert.ok(work.year < 1920, `${work.id} (${work.year})`);
    assert.match(work.license, /public domain|^PD/i, `${work.id}: ${work.license}`);
  }
});

test('every painting is a real JPEG of a sensible size', () => {
  for (const work of examples) {
    const url = new URL(`../public/${work.image}`, import.meta.url);
    const bytes = readFileSync(url);
    assert.equal(bytes[0], 0xff, work.id);
    assert.equal(bytes[1], 0xd8, work.id);
    const kb = statSync(url).size / 1024;
    assert.ok(kb > 20 && kb < 800, `${work.id}: ${kb.toFixed(0)} KB`);
    assert.ok(work.width >= 500 && work.height >= 300, `${work.id}: ${work.width}×${work.height}`);
  }
});

test('every text on the page is translated into Korean and English', () => {
  const keys = new Set([...HTML.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size > 80);
  const en = I18N.indexOf('const en = {');
  for (const key of keys) {
    const pattern = new RegExp(`^  ${key}: `, 'm');
    assert.ok(pattern.test(I18N.slice(0, en)), `ko: ${key}`);
    assert.ok(pattern.test(I18N.slice(en)), `en: ${key}`);
  }
});

test('the toolbar has Start, Print and Guide, and the dialogs exist', () => {
  for (const id of ['btn-start', 'btn-print', 'btn-guide', 'start-screen', 'start-examples', 'start-show', 'print-dialog', 'print-go', 'print-stage', 'guide-dialog', 'input-scale', 'start-board', 'zoom-bar', 'print-printer', 'settings-theme-dark', 'settings-theme-light']) {
    assert.match(HTML, new RegExp(`id="${id}"`), id);
  }
});
