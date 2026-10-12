import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CARD_COLORS, PRIORITIES, TEMPLATES } from '../../src/domain/board.js';
import { MARGINS } from '../../src/domain/print.js';
import { BACKGROUND_FITS, DENSITIES, FONT_WEIGHTS } from '../../src/domain/settings.js';
import { DICTIONARIES, formatBytes, setLanguage, t } from '../../src/i18n.js';
import { ICON_NAMES, icon } from '../../src/icons.js';
import {
  applyTheme, contrast, CUSTOM, customFrom, customTheme, DARK_THEMES, LIGHT_THEMES, mix, nextThemeId, normalizeCustom, resolveTheme, THEME_IDS, themeName, THEMES, themeVariables,
} from '../../src/themes.js';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const sources = fs.readdirSync(src, { recursive: true }).filter((file) => file.endsWith('.js')).map((file) => fs.readFileSync(path.join(src, file), 'utf8')).join('\n');

test('Korean and English have the same keys', () => {
  const ko = Object.keys(DICTIONARIES.ko).sort();
  const en = Object.keys(DICTIONARIES.en).sort();
  assert.deepEqual(ko.filter((k) => !en.includes(k)), [], 'missing in English');
  assert.deepEqual(en.filter((k) => !ko.includes(k)), [], 'missing in Korean');
});

test('both languages use the same placeholders', () => {
  for (const key of Object.keys(DICTIONARIES.ko)) {
    const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(names(DICTIONARIES.ko[key]), names(DICTIONARIES.en[key]), key);
  }
});

test('every literal t() key used in the source exists', () => {
  // Literal keys only: t('a.b') or t('a.b', …) — not t('a.' + name).
  const used = [...sources.matchAll(/\bt\('([a-zA-Z0-9_.]*[a-zA-Z0-9_])'\s*[,)]/g)].map((m) => m[1]);
  assert.ok(used.length > 150);
  const missing = [...new Set(used)].filter((key) => !(key in DICTIONARIES.ko));
  assert.deepEqual(missing, []);
});

test('keys built from enumerations exist', () => {
  const keys = [
    ...PRIORITIES.map((p) => `priority.${p}`), ...CARD_COLORS.map((c) => `color.${c}`),
    ...FONT_WEIGHTS.map((w) => `settings.weight.${w}`), ...BACKGROUND_FITS.map((f) => `settings.fit.${f}`), ...DENSITIES.map((d) => `settings.density.${d}`),
    ...Object.keys(MARGINS).map((m) => `print.margin.${m}`), ...Object.keys(TEMPLATES).map((name) => `tool.${name}`),
    ...['file', 'edit', 'view', 'board', 'help'].map((m) => `menu.${m}`), ...['all', 'current', 'custom'].map((r) => `print.${r}`),
    'format.invalidJson', 'format.notBoard', 'format.otherFormat', 'format.newerVersion',
  ];
  assert.deepEqual(keys.filter((key) => !(key in DICTIONARIES.ko) || !(key in DICTIONARIES.en)), []);
});

test('t() switches language and fills placeholders', () => {
  setLanguage('en');
  assert.equal(t('notice.pasted', { count: 3 }), 'Pasted 3 cards');
  setLanguage('ko');
  assert.equal(t('notice.pasted', { count: 3 }), '카드 3개를 붙여넣었습니다');
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(20 * 1024 * 1024), '20 MB');
});

test('every icon referenced in the source exists', () => {
  const used = new Set([...sources.matchAll(/\bicon\('([a-zA-Z]+)'/g), ...sources.matchAll(/\bicon: '([a-zA-Z]+)'/g)].map((m) => m[1]));
  assert.ok(used.size > 40);
  const missing = [...used].filter((name) => !ICON_NAMES.includes(name));
  assert.deepEqual(missing, []);
  assert.match(icon('save'), /^<svg/);
});

test('themes: 20 light and 20 dark, each named in both languages', () => {
  assert.equal(LIGHT_THEMES.length, 20);
  assert.equal(DARK_THEMES.length, 20);
  assert.ok(LIGHT_THEMES.every((theme) => !theme.dark) && DARK_THEMES.every((theme) => theme.dark));
  for (const id of THEME_IDS) {
    assert.notEqual(themeName(id, 'ko'), id, id);
    assert.notEqual(themeName(id, 'en'), id, id);
  }
  assert.equal(new Set(THEMES.map((theme) => themeName(theme.id, 'ko'))).size, 40, 'distinct names');
});

test('themes: readable text on every theme (contrast ≥ 4.5)', () => {
  for (const theme of THEMES) {
    for (const surface of ['bg', 'surface', 'card', 'column']) {
      assert.ok(contrast(theme.colors.text, theme.colors[surface]) >= 4.5, `${theme.id}: text on ${surface} ${contrast(theme.colors.text, theme.colors[surface]).toFixed(2)}`);
    }
    assert.ok(contrast(theme.colors.accentText, theme.colors.accent) >= 3, `${theme.id}: text on accent`);
  }
});

test('themes: toolbar button cycles through every theme, then custom', () => {
  const seen = new Set();
  let id = 'light';
  for (let i = 0; i < 41; i++) { seen.add(id); id = nextThemeId(id); }
  assert.equal(seen.size, 41);
  assert.equal(id, 'light', 'back to the start');
  assert.equal(nextThemeId('system'), LIGHT_THEMES[1].id);
});

test('custom theme: from colours, repaired, derived colours', () => {
  const custom = { ...customFrom(DARK_THEMES[3]), accent: '#ff0000', bg: 'nonsense' };
  const fixed = normalizeCustom(custom);
  assert.match(fixed.bg, /^#[0-9a-f]{6}$/);
  const theme = customTheme(custom);
  assert.equal(theme.id, CUSTOM);
  assert.equal(theme.dark, true);
  assert.equal(theme.colors.accent, '#ff0000');
  assert.ok(theme.colors.hover && theme.colors.surface2);
  assert.equal(resolveTheme(CUSTOM, false, custom).colors.accent, '#ff0000');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
});

test('themes: all complete, distinct ids, system follows the OS', () => {
  assert.ok(THEMES.length >= 40);
  assert.equal(new Set(THEMES.map((theme) => theme.id)).size, THEMES.length);
  const keys = Object.keys(THEMES[0].colors).sort();
  for (const theme of THEMES) {
    assert.deepEqual(Object.keys(theme.colors).sort(), keys, theme.id);
    assert.equal(theme.swatch.length, 3);
  }
  assert.equal(resolveTheme('system', true).id, 'dark');
  assert.equal(resolveTheme('system', false).id, 'light');
  assert.equal(resolveTheme('unknown').id, 'light');
  assert.equal(themeVariables(THEMES[1])['--accent-text'], THEMES[1].colors.accentText);
  const set = new Map();
  const root = { style: { setProperty: (k, v) => set.set(k, v) }, dataset: {} };
  applyTheme(THEMES[2], root);
  assert.equal(root.dataset.theme, THEMES[2].id);
  assert.equal(set.get('--bg'), THEMES[2].colors.bg);
});
