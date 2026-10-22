// Translations (src/lib/i18n.js): both languages complete and consistent, t() substitution and
// fallback, and every key the UI asks for exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

globalThis.document = globalThis.document || { documentElement: {} };   // setLanguage sets <html lang>
const { t, setLanguage, getLanguage } = await import('../src/lib/i18n.js');

const root = path.join(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/i18n.js'), 'utf8');
// The dictionaries are not exported: read the object literals out of the source.
function dict(name) {
  const start = source.indexOf(`const ${name} = {`);
  const end = source.indexOf('\n};', start);
  return new Function(`return ${source.slice(start + `const ${name} = `.length, end + 2)}`)();
}
const ko = dict('ko'), en = dict('en');
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('Korean and English have exactly the same keys', () => {
  assert.deepEqual(Object.keys(en).filter((k) => !(k in ko)), [], 'only in English');
  assert.deepEqual(Object.keys(ko).filter((k) => !(k in en)), [], 'only in Korean');
});

test('no translation is empty', () => {
  for (const [lang, d] of [['ko', ko], ['en', en]]) {
    for (const [k, v] of Object.entries(d)) assert.ok(typeof v === 'string' && v.length > 0, `${lang}.${k}`);
  }
});

test('both languages use the same {placeholders} in every string', () => {
  for (const k of Object.keys(ko)) assert.deepEqual(placeholders(en[k]), placeholders(ko[k]), k);
});

test('every t(\'key\') in the source exists in the dictionary', () => {
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(f.name)) files.push(p);
    }
  })(path.join(root, 'src'));
  const missing = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) {
      if (!(m[1] in ko)) missing.push(`${path.relative(root, f)}: ${m[1]}`);
    }
  }
  assert.ok(files.length > 10, 'the source was found');
  assert.deepEqual(missing, []);
});

test('the default language is Korean', () => {
  assert.equal(getLanguage(), 'ko');
  assert.equal(t('folder'), '폴더');
});

test('setLanguage switches the strings and <html lang>', () => {
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('folder'), 'Folder');
  assert.equal(document.documentElement.lang, 'en');
  setLanguage('ko');
  assert.equal(t('folder'), '폴더');
});

test('an unknown language falls back to Korean', () => {
  setLanguage('xx');
  assert.equal(getLanguage(), 'ko');
});

test('t substitutes every occurrence of each parameter', () => {
  assert.equal(t('file_of', { ext: 'PNG' }), 'PNG 파일');
  setLanguage('en');
  assert.equal(t('hist_rename', { from: 'a', to: 'b' }), "Rename 'a' → 'b'");
  setLanguage('ko');
});

test('t: numbers are accepted as parameters, unknown ones are ignored', () => {
  setLanguage('en');
  assert.equal(t('undo_cancelled', { what: 42, extra: 'x' }), 'Undo cancelled: 42');
  setLanguage('ko');
});

test('t: an unknown key comes back as itself', () => {
  assert.equal(t('no_such_key_here'), 'no_such_key_here');
});

test('the app name is the same in both languages', () => {
  assert.equal(ko.appName, en.appName);
});
