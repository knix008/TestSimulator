// UI texts in both languages, namespace by namespace (the part of the key before the first dot), so a failure
// names the area that broke: every key has a non-empty Korean and English text, the {placeholders} match
// between the languages, the HTML tags match, and no English text carries Korean characters. Also every
// dictionary module defines the same keys in both languages, and t() / setLanguage() behave.
// (Keys used in the source but missing from the dictionaries are checked by scripts/i18n-check.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DICTIONARIES, t, setLanguage, getLanguage } from '../../src/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { ko, en } = DICTIONARIES;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
// English texts that must name Korean on purpose: the language switch and the font preview.
const HANGUL_ALLOWED = (key, text) => key === 'settings.fontSample' || !HANGUL.test(text.replace(/한국어/g, ''));
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s) => [...String(s).matchAll(/<\/?([a-z][a-z0-9]*)/gi)].map((m) => m[0].toLowerCase()).sort();
const short = (list) => (list.length > 12 ? `${list.slice(0, 12).join(', ')} … (+${list.length - 12})` : list.join(', '));

// ───────────────────────── the merged dictionaries

test('the Korean and English dictionaries have exactly the same keys', () => {
  const onlyKo = Object.keys(ko).filter((k) => !(k in en));
  const onlyEn = Object.keys(en).filter((k) => !(k in ko));
  assert.deepEqual({ onlyKo, onlyEn }, { onlyKo: [], onlyEn: [] });
});

test('the dictionaries are large (thousands of texts) and every value is a string', () => {
  assert.ok(Object.keys(ko).length > 1000, `${Object.keys(ko).length} keys`);
  const bad = [...Object.entries(ko).map(([k, v]) => ['ko', k, v]), ...Object.entries(en).map(([k, v]) => ['en', k, v])].filter(([, , v]) => typeof v !== 'string').map(([l, k]) => `${l}:${k}`);
  assert.deepEqual(bad, []);
});

test('keys are well-formed: no whitespace, no leading or trailing dot', () => {
  const bad = Object.keys(ko).filter((k) => /\s/.test(k) || k.startsWith('.') || k.endsWith('.'));
  assert.deepEqual(bad, []);
});

const namespaces = new Map();
for (const k of new Set([...Object.keys(ko), ...Object.keys(en)])) {
  const ns = k.split('.')[0];
  if (!namespaces.has(ns)) namespaces.set(ns, []);
  namespaces.get(ns).push(k);
}

for (const [ns, keys] of [...namespaces].sort(([a], [b]) => a.localeCompare(b))) {
  test(`${ns}.*: every key has a non-empty Korean text (${keys.length} keys)`, () => {
    const bad = keys.filter((k) => typeof ko[k] !== 'string' || !ko[k].trim());
    assert.equal(bad.length, 0, `empty or missing Korean: ${short(bad)}`);
  });
  test(`${ns}.*: every key has a non-empty English text`, () => {
    const bad = keys.filter((k) => typeof en[k] !== 'string' || !en[k].trim());
    assert.equal(bad.length, 0, `empty or missing English: ${short(bad)}`);
  });
  test(`${ns}.*: {placeholders} are the same in both languages`, () => {
    const bad = keys.filter((k) => k in ko && k in en && placeholders(ko[k]).join() !== placeholders(en[k]).join()).map((k) => `${k} [${placeholders(ko[k])}] vs [${placeholders(en[k])}]`);
    assert.equal(bad.length, 0, `placeholder mismatch: ${short(bad)}`);
  });
  test(`${ns}.*: English texts contain no Korean characters`, () => {
    const bad = keys.filter((k) => typeof en[k] === 'string' && !HANGUL_ALLOWED(k, en[k])).map((k) => `${k}=${en[k].slice(0, 40)}`);
    assert.equal(bad.length, 0, `Korean in English: ${short(bad)}`);
  });
  test(`${ns}.*: HTML tags are the same in both languages`, () => {
    const bad = keys.filter((k) => k in ko && k in en && tags(ko[k]).join() !== tags(en[k]).join());
    assert.equal(bad.length, 0, `tag mismatch: ${short(bad)}`);
  });
}

// ───────────────────────── each dictionary module on its own

const dir = path.join(root, 'src/i18n');
const pairedDefaults = [['ko.js', 'en.js'], ['ko3d.js', 'en3d.js']];
for (const [kf, ef] of pairedDefaults) {
  test(`src/i18n/${kf} and ${ef} define the same keys`, async () => {
    const k = (await import(pathToFileURL(path.join(dir, kf)).href)).default;
    const e = (await import(pathToFileURL(path.join(dir, ef)).href)).default;
    assert.deepEqual(Object.keys(k).filter((x) => !(x in e)), [], 'only in Korean');
    assert.deepEqual(Object.keys(e).filter((x) => !(x in k)), [], 'only in English');
  });
}
const skip = new Set(pairedDefaults.flat());
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !skip.has(f)).sort()) {
  test(`src/i18n/${file} exports ko and en with the same keys`, async () => {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    assert.ok(mod.ko && mod.en, 'exports ko and en');
    assert.deepEqual(Object.keys(mod.ko).filter((x) => !(x in mod.en)), [], 'only in Korean');
    assert.deepEqual(Object.keys(mod.en).filter((x) => !(x in mod.ko)), [], 'only in English');
  });
  test(`src/i18n/${file}: every text it defines reaches the merged dictionaries`, async () => {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    const lost = Object.keys(mod.ko ?? {}).filter((k) => !(k in ko));
    assert.deepEqual(lost, []);
  });
}

// ───────────────────────── t() and the language switch

test('setLanguage switches between ko and en; anything else means ko', () => {
  const before = getLanguage();
  setLanguage('en'); assert.equal(getLanguage(), 'en');
  setLanguage('ko'); assert.equal(getLanguage(), 'ko');
  setLanguage('fr'); assert.equal(getLanguage(), 'ko');
  setLanguage(before);
});

test('t() returns the text of the current language', () => {
  const before = getLanguage();
  const key = 'action.undo';
  setLanguage('en'); assert.equal(t(key), en[key]);
  setLanguage('ko'); assert.equal(t(key), ko[key]);
  assert.notEqual(en[key], ko[key]);
  setLanguage(before);
});

test('t() fills every {placeholder} it is given and keeps unknown ones', () => {
  const key = Object.keys(en).find((k) => placeholders(en[k]).length >= 1);
  assert.ok(key, 'a key with a placeholder exists');
  const before = getLanguage();
  setLanguage('en');
  const params = Object.fromEntries(placeholders(en[key]).map((p) => [p, `<<${p}>>`]));
  const out = t(key, params);
  for (const p of placeholders(en[key])) assert.ok(out.includes(`<<${p}>>`), `${p} filled`);
  assert.doesNotMatch(out, /\{\w+\}/);
  assert.match(t(key, {}), /\{\w+\}/, 'unknown placeholders stay');
  setLanguage(before);
});

test('t() of an unknown key returns the fallback, or the key itself', () => {
  assert.equal(t('no.such.key.anywhere'), 'no.such.key.anywhere');
  assert.equal(t('no.such.key.anywhere', null, 'Fallback'), 'Fallback');
});

test('t() with numeric and zero parameters writes them as text', () => {
  const key = Object.keys(en).find((k) => placeholders(en[k]).length === 1);
  const [p] = placeholders(en[key]);
  const before = getLanguage();
  setLanguage('en');
  assert.ok(t(key, { [p]: 0 }).includes('0'));
  assert.ok(t(key, { [p]: 12.5 }).includes('12.5'));
  setLanguage(before);
});

test('every placeholder in every English text is filled when all its names are given', () => {
  const before = getLanguage();
  setLanguage('en');
  const bad = [];
  for (const k of Object.keys(en)) {
    const names = placeholders(en[k]);
    if (!names.length) continue;
    const out = t(k, Object.fromEntries(names.map((n) => [n, 'X'])));
    if (/\{\w+\}/.test(out)) bad.push(k);
  }
  setLanguage(before);
  assert.deepEqual(bad, []);
});
