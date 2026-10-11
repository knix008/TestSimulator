import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLanguage, messages, setLanguage, systemLanguage, t } from '../../src/i18n.js';
import { switchFlag } from '../../src/flags.js';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []);
}

test('Korean and English have exactly the same keys', () => {
  const ko = Object.keys(messages.ko).sort();
  const en = Object.keys(messages.en).sort();
  assert.deepEqual(ko.filter((key) => !en.includes(key)), [], 'missing in English');
  assert.deepEqual(en.filter((key) => !ko.includes(key)), [], 'missing in Korean');
});

test('every t("…") key used in src/ exists', () => {
  const missing = [];
  for (const file of sourceFiles(src).filter((name) => !name.endsWith('i18n.js'))) {
    const code = fs.readFileSync(file, 'utf8');
    for (const [, key] of code.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
      if (!(key in messages.ko)) missing.push(`${path.relative(src, file)}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('placeholders match between the languages', () => {
  const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  const mismatched = Object.keys(messages.ko).filter((key) => names(messages.ko[key]).join() !== names(messages.en[key]).join());
  assert.deepEqual(mismatched, []);
});

test('t() switches language and fills placeholders', () => {
  setLanguage('ko');
  assert.equal(t('notice.regionSet', { width: 3, height: 4 }), '영역을 정했습니다: 3 × 4');
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('notice.regionSet', { width: 3, height: 4 }), 'Region set: 3 × 4');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLanguage('fr');
  assert.ok(['ko', 'en'].includes(getLanguage()), 'unknown languages fall back to the system language');
  setLanguage('ko');
});

test('system language: Korean locales → ko, everything else → en', () => {
  assert.equal(systemLanguage('ko-KR'), 'ko');
  assert.equal(systemLanguage('en-US'), 'en');
  assert.equal(systemLanguage('ja'), 'en');
});

test('the language button shows the flag of the other language', () => {
  assert.match(switchFlag('ko'), /#012169/, 'Korean UI → Union Jack');
  assert.match(switchFlag('en'), /#cd2e3a/, 'English UI → Taegukgi');
});
