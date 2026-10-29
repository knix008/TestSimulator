// Every abbreviation the GUI shows has a tooltip explanation (src/lib/abbrev.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ABBREVIATIONS, abbreviationsIn, explainAbbreviations } = await import(pathToFileURL(path.join(root, 'src/lib/abbrev.js')).href);

// Upper-case words in the texts that are not abbreviations to explain: SQL and
// HTTP keywords in examples, language and format names spelled as words,
// placeholders, units and version labels.
const NOT_ABBREVIATIONS = new Set(['OK', 'SELECT', 'NAME', 'DELETE', 'WHERE', 'FROM', 'POST', 'GET', 'YYYY', 'KO', 'EN', 'V1', 'V5R3', 'L1', 'L2', 'L3', 'LT', 'DIR', 'ENV', 'README', 'RUN', 'PASSWORD', 'DC', 'C++', 'C#', 'C++14', 'C++17', 'SHKWON']);

function guiTexts() {
  const texts = [];
  const i18n = fs.readFileSync(path.join(root, 'src/lib/i18n.js'), 'utf8');
  for (const m of i18n.matchAll(/:\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) texts.push(m[2]);
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.jsx$/.test(name)) {
        const s = fs.readFileSync(full, 'utf8');
        for (const m of s.matchAll(/>([^<>{}\n]{2,80})</g)) texts.push(m[1]);
        for (const m of s.matchAll(/label: '([^']+)'/g)) texts.push(m[1]);
      }
    }
  };
  walk(path.join(root, 'src'));
  return texts;
}

test('every upper-case abbreviation in the GUI texts is explained', () => {
  const missing = new Set();
  for (const text of guiTexts()) {
    for (const m of text.matchAll(/(?<![A-Za-z0-9_\-./$])([A-Z][A-Z0-9]{1,9})(?![A-Za-z0-9_])/g)) {
      if (!ABBREVIATIONS[m[1]] && !NOT_ABBREVIATIONS.has(m[1])) missing.add(m[1]);
    }
  }
  assert.deepEqual([...missing].sort(), [], 'add these to src/lib/abbrev.js (or to NOT_ABBREVIATIONS when they are not abbreviations)');
});

test('entries have both languages, and matching takes whole words only', () => {
  for (const [key, e] of Object.entries(ABBREVIATIONS)) {
    assert.ok(Array.isArray(e.ko) && e.ko[0], `${key} ko`);
    assert.ok(Array.isArray(e.en) && e.en[0], `${key} en`);
  }
  assert.deepEqual(abbreviationsIn('기본값 (LP64)'), ['LP64']);
  assert.deepEqual(abbreviationsIn('SSL / TLS, SSL again'), ['SSL', 'TLS']);
  assert.deepEqual(abbreviationsIn('LP64x ALP64 api cwe'), []);
  assert.match(explainAbbreviations('Default (LP64)', 'en'), /^LP64 — LP64 data model: int is 32-bit/);
});
