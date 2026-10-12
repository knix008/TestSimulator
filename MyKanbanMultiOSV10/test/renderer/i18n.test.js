const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('../lib/framework');
const { createBrowser, RENDERER_JS } = require('../lib/browser');

const RENDERER_DIR = path.join(RENDERER_JS, '..');

function collectUsedKeys() {
  const keys = new Set();
  for (const file of fs.readdirSync(RENDERER_JS).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(RENDERER_JS, file), 'utf8');
    for (const m of src.matchAll(/I18n\.t\(\s*['"]([A-Za-z0-9_]+)['"]/g)) keys.add(m[1]);
  }
  const html = fs.readFileSync(path.join(RENDERER_DIR, 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-title)?="([A-Za-z0-9_]+)"/g)) keys.add(m[1]);
  return [...keys].sort();
}

describe('Internationalization (Korean / English)', () => {
  const browser = createBrowser({ scripts: ['lang.js'], lang: 'en' });
  const LANGS = browser.eval('LANGS');
  const I18n = browser.eval('I18n');

  it('defines both Korean and English dictionaries', () => {
    assert.ok(LANGS.ko && LANGS.en);
    assert.ok(Object.keys(LANGS.en).length > 100, 'expected a substantial English dictionary');
  });

  it('has every Korean key translated into English', () => {
    const missing = Object.keys(LANGS.ko).filter((k) => !(k in LANGS.en));
    assert.deepEqual(missing, [], `keys missing in English: ${missing.join(', ')}`);
  });

  it('has every English key translated into Korean', () => {
    const missing = Object.keys(LANGS.en).filter((k) => !(k in LANGS.ko));
    assert.deepEqual(missing, [], `keys missing in Korean: ${missing.join(', ')}`);
  });

  it('has no empty translations', () => {
    const empty = [];
    for (const [lang, dict] of Object.entries(LANGS)) {
      for (const [k, v] of Object.entries(dict)) {
        if (typeof v !== 'string' || !v.trim()) empty.push(`${lang}.${k}`);
      }
    }
    assert.deepEqual(empty, []);
  });

  it('defines every key referenced by the UI code and index.html', () => {
    const missing = collectUsedKeys().filter((k) => !(k in LANGS.en) || !(k in LANGS.ko));
    assert.deepEqual(missing, [], `undefined i18n keys: ${missing.join(', ')}`);
  });

  it('reads the saved language from localStorage', () => {
    assert.equal(I18n.getLang(), 'en');
    assert.equal(I18n.t('login'), LANGS.en.login);
  });

  it('switches language and persists the choice', () => {
    I18n.setLang('ko');
    assert.equal(I18n.getLang(), 'ko');
    assert.equal(browser.storage.get('kanban-lang'), 'ko');
    assert.equal(browser.document.documentElement.lang, 'ko');
    assert.equal(I18n.t('login'), LANGS.ko.login);
    I18n.setLang('en');
  });

  it('falls back to the key itself for unknown keys', () => {
    assert.equal(I18n.t('__no_such_key__'), '__no_such_key__');
  });

  it('substitutes {placeholders} with provided values', () => {
    const key = Object.keys(LANGS.en).find((k) => /\{[a-zA-Z]+\}/.test(LANGS.en[k]));
    if (!key) return;
    const placeholder = LANGS.en[key].match(/\{([a-zA-Z]+)\}/)[1];
    const text = I18n.t(key, { [placeholder]: 'VALUE_42' });
    assert.ok(text.includes('VALUE_42'));
    assert.ok(!text.includes(`{${placeholder}}`));
  });

  it('defaults to Korean when no language is saved', () => {
    const fresh = createBrowser({ scripts: ['lang.js'], lang: null });
    assert.equal(fresh.eval('I18n.getLang()'), 'ko');
  });
});
