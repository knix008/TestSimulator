import { describe, it, expect, beforeEach } from 'vitest';
import i18n, { setLanguage } from '../src/i18n.js';

function flatten(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flatten(v, path));
    else keys.push(path);
  }
  return keys;
}

describe('language packs', () => {
  const ko = i18n.getResourceBundle('ko', 'translation');
  const en = i18n.getResourceBundle('en', 'translation');
  const koKeys = flatten(ko);
  const enKeys = flatten(en);

  it('ships Korean and English bundles', () => {
    expect(ko.app.title).toBe('MyPDFViewer');
    expect(en.app.title).toBe('MyPDFViewer');
    expect(koKeys.length).toBeGreaterThan(150);
    expect(enKeys.length).toBeGreaterThan(150);
  });

  it('keeps the two packs in key lockstep', () => {
    const missingInEn = koKeys.filter((k) => !enKeys.includes(k));
    const missingInKo = enKeys.filter((k) => !koKeys.includes(k));
    expect(missingInEn).toEqual([]);
    expect(missingInKo).toEqual([]);
  });

  it('does not leave empty strings', () => {
    for (const key of koKeys) {
      const v = i18n.getResource('ko', 'translation', key);
      expect(String(v).length, key).toBeGreaterThan(0);
    }
    for (const key of enKeys) {
      const v = i18n.getResource('en', 'translation', key);
      expect(String(v).length, key).toBeGreaterThan(0);
    }
  });

  it('covers the main feature areas', () => {
    const expected = [
      'toolbar.print', 'toolbar.toolText', 'toolbar.toolImage', 'toolbar.toolRegion',
      'toolbar.comments', 'toolbar.bookmarks', 'toolbar.search', 'tip.comments', 'tip.bookmarks',
      'tip.lang', 'tip.langPick',
      'print.rangeEmpty', 'print.rangeInvalid', 'print.rangeOutside',
      'capture.fmt.png', 'capture.fmt.gif', 'capture.fmt.bmp',
      'error.ctx.print', 'error.notPdf', 'error.password',
      'side.outline', 'side.bookmarks', 'side.comments', 'side.clips',
      'settings.tabs.appearance', 'about.version',
      'unsaved.title', 'unsaved.message', 'unsaved.discard',
    ];
    for (const key of expected) {
      expect(koKeys).toContain(key);
      expect(enKeys).toContain(key);
    }
  });
});

describe('setLanguage', () => {
  beforeEach(async () => {
    await setLanguage('ko');
  });

  it('switches translations immediately', async () => {
    expect(i18n.t('toolbar.open')).toBe('열기');
    await setLanguage('en');
    expect(i18n.t('toolbar.open')).toBe('Open');
    expect(i18n.language).toBe('en');
  });

  it('persists the choice in localStorage', async () => {
    await setLanguage('en');
    expect(localStorage.getItem('mypdfviewer-lang')).toBe('en');
    await setLanguage('ko');
    expect(localStorage.getItem('mypdfviewer-lang')).toBe('ko');
  });

  it('interpolates counts and names', async () => {
    await setLanguage('en');
    expect(i18n.t('side.results_one', { count: 1 })).toBe('1 result');
    expect(i18n.t('status.copiedChars', { n: 12 })).toBe('Copied 12 characters');
    expect(i18n.t('print.allHint', { n: 9 })).toContain('9');
    await setLanguage('ko');
    expect(i18n.t('status.chars', { n: 4 })).toBe('4자');
  });

  it('does not HTML-escape interpolated values', async () => {
    await setLanguage('en');
    expect(i18n.t('status.loaded', { name: 'A & B.pdf' })).toContain('A & B.pdf');
  });
});
