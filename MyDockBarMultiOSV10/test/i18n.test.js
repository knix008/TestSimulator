'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const i18n = require('../src/shared/i18n');

const ROOT = path.join(__dirname, '..');

describe('translation table', () => {
  it('offers exactly the two supported languages', () => {
    assert.deepStrictEqual(i18n.SUPPORTED, ['en', 'ko']);
  });

  it('translates every English key into Korean', () => {
    const missing = Object.keys(i18n.STRINGS.en).filter((key) => !(key in i18n.STRINGS.ko));
    assert.deepStrictEqual(missing, [], `Korean is missing: ${missing.join(', ')}`);
  });

  it('has no Korean key without an English original', () => {
    const extra = Object.keys(i18n.STRINGS.ko).filter((key) => !(key in i18n.STRINGS.en));
    assert.deepStrictEqual(extra, [], `English is missing: ${extra.join(', ')}`);
  });

  it('leaves no Korean string untranslated', () => {
    const untouched = Object.keys(i18n.STRINGS.en).filter((key) => {
      const en = i18n.STRINGS.en[key];
      // Product names and unit suffixes are the same in both languages.
      if (/^(MyDockBar|English|한국어)$/.test(en)) return false;
      if (key.startsWith('u.px') || key.startsWith('u.ms')) return false;
      return i18n.STRINGS.ko[key] === en;
    });
    assert.deepStrictEqual(untouched, [], `still English: ${untouched.join(', ')}`);
  });

  it('keeps the same placeholders in both languages', () => {
    const placeholders = (text) => (text.match(/\{(\w+)\}/g) || []).sort().join(',');
    const mismatched = Object.keys(i18n.STRINGS.en)
      .filter((key) => placeholders(i18n.STRINGS.en[key]) !== placeholders(i18n.STRINGS.ko[key]));
    assert.deepStrictEqual(mismatched, [], `placeholder mismatch: ${mismatched.join(', ')}`);
  });
});

describe('locale resolution', () => {
  it('honours an explicit choice', () => {
    assert.strictEqual(i18n.resolve('ko', 'en-US'), 'ko');
    assert.strictEqual(i18n.resolve('en', 'ko-KR'), 'en');
  });

  it('follows the system when set to auto', () => {
    assert.strictEqual(i18n.resolve('auto', 'ko-KR'), 'ko');
    assert.strictEqual(i18n.resolve('auto', 'en-GB'), 'en');
  });

  it('falls back to English for anything unrecognised', () => {
    assert.strictEqual(i18n.resolve('auto', 'fr-FR'), 'en');
    assert.strictEqual(i18n.resolve('klingon', undefined), 'en');
  });
});

describe('substitution', () => {
  it('fills placeholders from the supplied values', () => {
    assert.strictEqual(i18n.translate('en', 'm.themeSet', { name: 'Ruby' }), 'Theme: Ruby');
  });

  it('leaves a placeholder alone when no value is given', () => {
    assert.match(i18n.translate('en', 'm.themeSet', {}), /\{name\}/);
  });

  it('falls back to the English string for a key a language is missing', () => {
    assert.strictEqual(i18n.translate('ko', 'definitely.not.a.key'), 'definitely.not.a.key');
  });

  it('binds a locale with make()', () => {
    const t = i18n.make('ko');
    assert.strictEqual(t.locale, 'ko');
    assert.strictEqual(t('b.ok'), '확인');
  });
});

describe('interface coverage', () => {
  it('defines every data-i18n key used in the settings window', () => {
    const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'settings.html'), 'utf8');
    const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(used.length > 30, 'expected the settings window to be fully marked up');

    const missing = [...new Set(used)].filter((key) => !(key in i18n.STRINGS.en));
    assert.deepStrictEqual(missing, [], `settings.html uses undefined keys: ${missing.join(', ')}`);
  });

  it('defines every key the main process asks for', () => {
    const sources = ['src/main/tray.js', 'src/main/ipc.js']
      .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
      .join('\n');
    const used = [...sources.matchAll(/\bt\((['`])([a-z]+\.[A-Za-z]+)\1/g)].map((m) => m[2]);
    assert.ok(used.length > 10, 'expected the menus to be translated');

    const missing = [...new Set(used)].filter((key) => !(key in i18n.STRINGS.en));
    assert.deepStrictEqual(missing, [], `main process uses undefined keys: ${missing.join(', ')}`);
  });
});
