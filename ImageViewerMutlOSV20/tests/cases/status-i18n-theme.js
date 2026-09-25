'use strict';

/** Status-bar progress, ko/en key parity, theme registry. */
module.exports = {
  name: 'Status, i18n, theme',
  run({ test, each, src, h }) {
    const { html, app, css, ko, en, themes } = src;
    const { assert, assertIncludes, extractThemeIds, i18nPrefixes } = h;

    test('Main status bar has progress (no modal overlay for load)', () => {
      assertIncludes(html, 'id="status-progress"', 'status progress');
      assertIncludes(css, '#status-progress.is-done', 'done state');
    });

    const statusIds = ['status-zoom', 'status-dims', 'status-format', 'status-idx', 'status-msg', 'status-progress-msg', 'status-progress-pct'];
    each(statusIds, (id) => `Status bar has #${id}`, (id) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    test('ko.json and en.json have the same keys', () => {
      const koKeys = Object.keys(ko).sort();
      const enKeys = Object.keys(en).sort();
      const missingEn = koKeys.filter((k) => !en[k]);
      const missingKo = enKeys.filter((k) => !ko[k]);
      assert(missingEn.length === 0, `en missing: ${missingEn.slice(0, 8).join(', ')}`);
      assert(missingKo.length === 0, `ko missing: ${missingKo.slice(0, 8).join(', ')}`);
    });

    each(i18nPrefixes(ko), (p) => `i18n namespace ${p} is non-empty in ko/en`, (p) => {
      const keys = Object.keys(ko).filter((k) => k === p || k.startsWith(`${p}.`));
      assert(keys.length > 0, `no keys for ${p}`);
      keys.forEach((k) => {
        assert(String(ko[k]).length > 0, `ko empty ${k}`);
        assert(en[k] !== undefined && String(en[k]).length > 0, `en empty ${k}`);
      });
    });

    test('Korean print / effect strings are localized', () => {
      assert(ko['menu.print'].includes('인쇄'));
      assert(ko['progress.effectNamed'].includes('{name}'));
      assert(en['menu.print'].toLowerCase().includes('print'));
    });

    const themeIds = extractThemeIds(themes);
    test(`Theme registry has ${themeIds.length} themes`, () => {
      assert(themeIds.length >= 16, `expected many themes, got ${themeIds.length}`);
    });

    each(themeIds, (id) => `Theme ${id} is registered`, (id) => {
      assertIncludes(themes, `id: '${id}'`, id);
    });
  },
};
