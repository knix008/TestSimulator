// Every text the app shows exists in Korean and English.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ko from '../../src/i18n/ko.js';
import en from '../../src/i18n/en.js';
import { dynamicKeys, staticKeys } from '../../scripts/i18n-keys.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Korean and English have the same keys, none empty', () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  for (const [key, value] of Object.entries(ko)) assert.ok(String(value).trim(), `ko ${key}`);
  for (const [key, value] of Object.entries(en)) assert.ok(String(value).trim(), `en ${key}`);
});

test('every key the sources use is translated', async () => {
  const keys = new Set([...staticKeys(), ...(await dynamicKeys())]);
  const missing = [...keys].filter((key) => !(key in ko) || !(key in en));
  assert.deepEqual(missing, []);
});

test('quoted keys of known groups anywhere in the sources are translated', () => {
  const groups = new Set(Object.keys(ko).map((key) => key.split('.')[0]));
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'i18n' ? [] : walk(path.join(dir, e.name))) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
  const missing = [];
  for (const file of walk(path.join(root, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [, key] of text.matchAll(/'([a-z][a-zA-Z]*\.[a-zA-Z][\w.]*)'/g)) {
      if (!groups.has(key.split('.')[0]) || /\.(js|css|html|png|json|myhome|mhomt)$/.test(key)) continue;
      if (!(key in ko)) missing.push(`${key} (${path.basename(file)})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('placeholders match between the languages', () => {
  for (const key of Object.keys(ko)) {
    const names = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(names(ko[key]), names(en[key]), key);
  }
});

test('no text of the UML program is left', () => {
  for (const [key, value] of Object.entries({ ...ko, ...Object.fromEntries(Object.entries(en).map(([k, v]) => [`en:${k}`, v])) })) {
    assert.ok(!/UML|StarUML|diagram|다이어그램|MyUMLMaker/i.test(value), `${key}: ${value}`);
  }
});
