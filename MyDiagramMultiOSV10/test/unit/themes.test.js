// Themes: 20 light and 20 dark, the custom theme, the random theme button, and
// no text that the theme colours would make hard to read (WCAG contrast).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contrast, customFrom, customTheme, DARK_THEMES, LIGHT_THEMES, mix, nextThemeId, randomThemeId, resolveTheme, THEME_IDS, themeName, themeVariables,
} from '../../src/themes.js';

const ALL = [...LIGHT_THEMES, ...DARK_THEMES];

test('20 light and 20 dark themes with unique ids and names in both languages', () => {
  assert.equal(LIGHT_THEMES.length, 20);
  assert.equal(DARK_THEMES.length, 20);
  assert.equal(new Set(ALL.map((theme) => theme.id)).size, 40);
  for (const theme of LIGHT_THEMES) assert.equal(theme.dark, false, theme.id);
  for (const theme of DARK_THEMES) assert.equal(theme.dark, true, theme.id);
  for (const theme of ALL) {
    assert.ok(/[가-힣]/.test(theme.name.ko), `${theme.id}: Korean name`);
    assert.ok(/^[A-Za-z]/.test(theme.name.en), `${theme.id}: English name`);
  }
  assert.ok(THEME_IDS.includes('system') && THEME_IDS.includes('custom'));
});

test('text is readable on every background of every theme', () => {
  const problems = [];
  for (const theme of ALL) {
    const c = theme.colors;
    for (const surface of ['bg', 'surface', 'surface2', 'panel', 'toolbar', 'status', 'gridAlt', 'chart', 'hover']) {
      const ratio = contrast(c.text, c[surface]);
      if (ratio < 4.5) problems.push(`${theme.id}: text on ${surface} ${ratio.toFixed(2)}`);
    }
    for (const surface of ['bg', 'surface', 'panel', 'toolbar', 'status']) {
      const ratio = contrast(c.muted, c[surface]);
      if (ratio < 3) problems.push(`${theme.id}: muted text on ${surface} ${ratio.toFixed(2)}`);
    }
    const onAccent = contrast(c.accentText, c.accent);
    if (onAccent < 4.5) problems.push(`${theme.id}: text on accent ${onAccent.toFixed(2)}`);
    // Selected rows tint the surface with the accent: text must stay readable.
    const selected = contrast(c.text, mix(c.surface, c.accent, 0.18));
    if (selected < 4.5) problems.push(`${theme.id}: text on a selected row ${selected.toFixed(2)}`);
    // Accent-coloured text and icons (links, active items) on the surface.
    const accentOnSurface = contrast(c.accent, c.surface);
    if (accentOnSurface < 2.2) problems.push(`${theme.id}: accent on surface ${accentOnSurface.toFixed(2)}`);
  }
  assert.deepEqual(problems, []);
});

test('the theme button picks a random theme, never the current one, eventually all of them', () => {
  const seen = new Set();
  let current = 'light';
  let seed = 7;
  const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 2000; i++) {
    const next = randomThemeId(current, random);
    assert.notEqual(next, current);
    assert.ok(ALL.some((theme) => theme.id === next));
    seen.add(next);
    current = next;
  }
  assert.equal(seen.size, 40);
  assert.equal(nextThemeId('light'), LIGHT_THEMES[1].id);
});

test('custom theme: copied from a theme, repaired, readable defaults; system follows the OS', () => {
  const custom = customFrom(DARK_THEMES[2]);
  const theme = customTheme(custom);
  assert.equal(theme.dark, true);
  assert.equal(theme.colors.bg, DARK_THEMES[2].colors.bg);
  assert.equal(customTheme({ bg: 'not a colour' }).colors.bg, LIGHT_THEMES[0].colors.bg);
  assert.equal(resolveTheme('system', true).id, 'dark');
  assert.equal(resolveTheme('system', false).id, 'light');
  assert.equal(resolveTheme('nope').id, LIGHT_THEMES[0].id);
  assert.equal(themeName('custom', 'en'), 'Custom');
  const vars = themeVariables(LIGHT_THEMES[0]);
  for (const name of ['--bg', '--text', '--accent', '--accent-text', '--grid-alt', '--chart', '--danger']) assert.ok(vars[name], name);
});
