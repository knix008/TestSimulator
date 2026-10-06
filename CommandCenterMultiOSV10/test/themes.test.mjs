// The themes (src/themes.js): 30 built-in ones, complete and distinct, cycling, custom themes and
// the colours the host window is painted in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEMES, DEFAULT_THEME, CUSTOM_COLOR_KEYS, setCustomThemes, getCustomThemes, getCustomThemesRaw,
  allThemes, baseColorsOf, themeById, nextThemeId, themeWindowColors,
} from '../src/themes.js';

const TOKENS = ['--bg', '--bg-panel', '--bg-elev', '--bg-hover', '--bg-sel', '--bg-sel-inactive', '--fg', '--fg-muted', '--border', '--border-strong',
  '--accent', '--accent-strong', '--accent-text', '--danger', '--folder', '--file', '--ok', '--shadow', '--active-border', '--active-glow'];

test('there are 30 built-in themes: 15 dark and 15 light', () => {
  assert.equal(THEMES.length, 30);
  assert.equal(THEMES.filter((t) => t.mode === 'dark').length, 15);
  assert.equal(THEMES.filter((t) => t.mode === 'light').length, 15);
});

test('theme ids are unique and every theme has a Korean and an English name', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  for (const t of THEMES) assert.ok(t.label && t.labelEn, t.id);
});

test('every theme defines every colour token', () => {
  for (const t of THEMES) for (const k of TOKENS) assert.ok(t.tokens[k], `${t.id} ${k}`);
});

test('the base colours of every theme are #rrggbb', () => {
  for (const t of THEMES) {
    for (const [k, v] of Object.entries(baseColorsOf(t))) assert.match(v, /^#[0-9a-f]{6}$/i, `${t.id}.${k}`);
  }
});

test('no two themes look the same', () => {
  const looks = THEMES.map((t) => `${t.tokens['--bg']}|${t.tokens['--accent']}|${t.tokens['--fg']}`);
  assert.equal(new Set(looks).size, THEMES.length);
});

test('text and background differ in every theme', () => {
  for (const t of THEMES) assert.notEqual(t.tokens['--fg'].toLowerCase(), t.tokens['--bg'].toLowerCase(), t.id);
});

test('the default theme exists and is the first one', () => {
  assert.equal(DEFAULT_THEME, 'midnight');
  assert.equal(THEMES[0].id, DEFAULT_THEME);
});

test('themeById: the theme, or the default one for an unknown id', () => {
  assert.equal(themeById('ocean').id, 'ocean');
  assert.equal(themeById('nope').id, DEFAULT_THEME);
});

test('nextThemeId cycles through all themes and wraps around', () => {
  const seen = new Set();
  let id = THEMES[0].id;
  for (let i = 0; i < THEMES.length; i++) { seen.add(id); id = nextThemeId(id); }
  assert.equal(seen.size, THEMES.length);
  assert.equal(id, THEMES[0].id);
  assert.equal(nextThemeId(THEMES[THEMES.length - 1].id), THEMES[0].id);
});

test('custom themes join the list, cycle with the rest and can be looked up', () => {
  const colors = baseColorsOf(themeById('ocean'));
  setCustomThemes([{ id: 'custom-1', label: '내 테마', mode: 'light', colors }]);
  assert.equal(getCustomThemes().length, 1);
  assert.equal(allThemes().length, 31);
  const c = themeById('custom-1');
  assert.equal(c.custom, true);
  assert.equal(c.mode, 'light');
  assert.equal(c.label, '내 테마');
  assert.equal(nextThemeId(THEMES[THEMES.length - 1].id), 'custom-1');
  assert.equal(nextThemeId('custom-1'), THEMES[0].id);
  setCustomThemes([]);
});

test('custom themes: entries without id or colours are ignored, an unknown mode is dark', () => {
  setCustomThemes([{ id: 'x' }, { colors: {} }, null, { id: 'ok', colors: { bg: '#000000' }, mode: 'weird' }]);
  assert.deepEqual(getCustomThemes().map((t) => [t.id, t.mode, t.label]), [['ok', 'dark', 'Custom']]);
  assert.equal(getCustomThemesRaw().length, 4, 'the raw list is kept as given');
  setCustomThemes('not a list');
  assert.deepEqual(getCustomThemes(), []);
});

test('baseColorsOf → custom theme reproduces the original tokens', () => {
  const src = themeById('forest');
  setCustomThemes([{ id: 'copy', mode: src.mode, colors: baseColorsOf(src) }]);
  const copy = themeById('copy');
  for (const k of ['--bg', '--fg', '--accent', '--border', '--folder', '--danger']) assert.equal(copy.tokens[k], src.tokens[k], k);
  setCustomThemes([]);
});

test('every base colour key of a custom theme is one a built-in theme provides', () => {
  assert.deepEqual(Object.keys(baseColorsOf(THEMES[0])).sort(), [...CUSTOM_COLOR_KEYS].sort());
});

test('themeWindowColors: background and title-bar colours for the native window', () => {
  const t = themeById('midnight');
  assert.deepEqual(themeWindowColors(t), { themeBg: t.tokens['--bg'], titleBg: t.tokens['--bg-elev'], titleFg: t.tokens['--fg'] });
});
