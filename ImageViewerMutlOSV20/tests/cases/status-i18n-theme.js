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

    test('Settings dialog has a Theme tab with dark/light button grids', () => {
      assertIncludes(html, 'data-tab="theme"', 'theme tab');
      assertIncludes(html, 'data-panel="theme"', 'theme panel');
      assertIncludes(html, 'id="settings-theme-dark"', 'dark grid');
      assertIncludes(html, 'id="settings-theme-light"', 'light grid');
      assertIncludes(html, 'settings.tab.theme', 'theme tab i18n');
      assertIncludes(css, '.settings-theme-btn', 'theme button style');
    });

    const Themes = require(require('path').join(h.ROOT, 'src/js/themes.js'));

    test('Theme registry has 10 dark and 10 light palettes', () => {
      assert(Themes.ofKind('dark').length === 10, `dark ${Themes.ofKind('dark').length}`);
      assert(Themes.ofKind('light').length === 10, `light ${Themes.ofKind('light').length}`);
      assert(Themes.list.length === 20, `total ${Themes.list.length}`);
      assert(Themes.default === 'dark', 'default is dark');
    });

    each(Themes.list, (th) => `Theme ${th.id} has a 3-color swatch`, (th) => {
      assert(th.kind === 'dark' || th.kind === 'light', th.kind);
      assert(Array.isArray(th.swatch) && th.swatch.length === 3, 'swatch');
      th.swatch.forEach((c) => assert(/^#[0-9a-fA-F]{6}$/.test(c), c));
    });

    each(themeIds, (id) => `CSS defines [data-theme="${id}"]`, (id) => {
      assertIncludes(css, `[data-theme="${id}"]`, id);
    });

    test('Themes.next wraps from last palette to first', () => {
      const last = Themes.list[Themes.list.length - 1].id;
      assert(Themes.next(last) === Themes.list[0].id, `${last} → ${Themes.list[0].id}`);
      assert(Themes.next('dark') === 'midnight', 'dark → midnight');
    });

    test('Themes.normalize falls back to dark', () => {
      assert(Themes.normalize('nord') === 'nord');
      assert(Themes.normalize('nope') === 'dark');
      assert(Themes.normalize('') === 'dark');
    });

    test('Themes.label uses i18n keys for named defaults', () => {
      assert(Themes.label('dark', (k) => ({ 'theme.dark': '다크 (기본)' }[k])) === '다크 (기본)');
      assert(Themes.label('dracula') === 'Dracula');
    });

    const settingsTabs = ['general', 'theme', 'viewer', 'dicom', 'media'];
    each(settingsTabs, (id) => `Settings has ${id} tab and panel`, (id) => {
      assertIncludes(html, `data-tab="${id}"`, `tab ${id}`);
      assertIncludes(html, `data-panel="${id}"`, `panel ${id}`);
    });

    test('Theme tab follows General in the settings tab strip', () => {
      const iGeneral = html.indexOf('data-tab="general"');
      const iTheme = html.indexOf('data-tab="theme"');
      const iViewer = html.indexOf('data-tab="viewer"');
      assert(iGeneral > 0 && iTheme > iGeneral && iViewer > iTheme, 'general → theme → viewer');
    });

    test('General panel no longer hosts the theme dropdown', () => {
      const start = html.indexOf('data-panel="general"');
      const end = html.indexOf('data-panel="theme"');
      const general = html.slice(start, end);
      assert(start > 0 && end > start, 'panels');
      assert(!/id="settings-theme"/.test(general), 'old select removed');
      assert(!general.includes('settings-theme-dark'), 'theme grid not in general');
      assertIncludes(general, 'settings-lang-btn', 'language stays on general');
    });

    test('Settings theme buttons apply the chosen palette', () => {
      assertIncludes(app, 'function _fillSettingsThemeButtons', 'builder');
      assertIncludes(app, 'function _syncSettingsThemeButtons', 'active sync');
      assertIncludes(app, 'function _settingsSelectTab', 'tab switch');
      assertIncludes(app, "btn.addEventListener('click', () => _applyTheme(th.id))", 'click applies');
      assertIncludes(app, "btn.className = 'settings-theme-btn'", 'button class');
      assertIncludes(app, '--sw-bg', 'preview bg');
      assertIncludes(app, '--sw-bar', 'preview bar');
      assertIncludes(app, '--sw-accent', 'preview accent');
    });

    test('Settings dialog is 640×580 so theme buttons fit', () => {
      assertIncludes(css, '.settings-dialog-box { width: 640px; min-width: 640px; max-width: 640px; height: 580px;', 'dialog size');
    });

    const themeCss = [
      ['.settings-theme-grid', 'grid'],
      ['.settings-theme-btn.active', 'active state'],
      ['.settings-theme-preview', 'color preview'],
      ['.settings-theme-name', 'theme name'],
      ['grid-template-columns: repeat(5, 1fr)', 'five columns'],
    ];
    each(themeCss, ([needle, label]) => `Theme tab CSS: ${label}`, ([needle]) => {
      assertIncludes(css, needle, needle);
    });

    test('Theme tab strings are localized', () => {
      assert(ko['settings.tab.theme'] === '테마', ko['settings.tab.theme']);
      assert(en['settings.tab.theme'] === 'Theme', en['settings.tab.theme']);
      assert(ko['menu.darkThemes'].includes('다크'));
      assert(en['menu.darkThemes'].toLowerCase().includes('dark'));
      assert(ko['menu.lightThemes'].includes('라이트'));
      assert(en['menu.lightThemes'].toLowerCase().includes('light'));
    });
  },
};
