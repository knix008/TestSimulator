import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM, defaultCustom, DARK_DEFAULT, fromCustom, isThemeId, LIGHT_DEFAULT, nextTheme, resolveTheme, sanitizeCustom, SYSTEM, THEMES, themeIds,
} from '../../src/themes.js';
import { sanitizeSettings } from '../../src/domain/settings.js';

/** WCAG relative-luminance contrast ratio. */
function contrast(a, b) {
  const luminance = (hex) => {
    const [r, g, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('20 dark and 20 light themes with unique ids and names', () => {
  assert.equal(THEMES.filter((theme) => theme.mode === 'dark').length, 20);
  assert.equal(THEMES.filter((theme) => theme.mode === 'light').length, 20);
  assert.equal(new Set(THEMES.map((theme) => theme.id)).size, 40);
  for (const theme of THEMES) assert.ok(theme.nameKo && theme.nameEn, theme.id);
});

test('every theme sets every colour variable to a valid colour', () => {
  const names = Object.keys(THEMES[0].vars);
  for (const theme of [...THEMES, fromCustom(defaultCustom())]) {
    assert.deepEqual(Object.keys(theme.vars), names, theme.id);
    for (const [name, value] of Object.entries(theme.vars)) {
      if (name !== '--shadow') assert.match(value, /^#[0-9a-f]{6}$/i, `${theme.id} ${name}`);
    }
  }
});

test('text stays readable in every theme', () => {
  for (const theme of THEMES) {
    const v = theme.vars;
    assert.ok(contrast(v['--text'], v['--panel']) >= 7, `${theme.id}: text on panel`);
    assert.ok(contrast(v['--text'], v['--bg']) >= 7, `${theme.id}: text on background`);
    assert.ok(contrast(v['--muted'], v['--panel']) >= 3, `${theme.id}: secondary text`);
    assert.ok(contrast(v['--accent-text'], v['--accent']) >= 3, `${theme.id}: text on accent buttons`);
  }
});

test('the theme button cycles through all 40 themes and custom', () => {
  const seen = new Set();
  let id = LIGHT_DEFAULT;
  for (let i = 0; i < 41; i++) {
    seen.add(id);
    id = nextTheme(id);
  }
  assert.equal(id, LIGHT_DEFAULT, 'back to the start after a full round');
  assert.deepEqual([...seen].sort(), themeIds().sort());
  assert.equal(nextTheme(SYSTEM, true), themeIds()[themeIds().indexOf(DARK_DEFAULT) + 1], 'system continues from what is shown');
});

test('system follows the OS; unknown ids fall back', () => {
  assert.equal(resolveTheme(SYSTEM, null, true).id, DARK_DEFAULT);
  assert.equal(resolveTheme(SYSTEM, null, false).id, LIGHT_DEFAULT);
  assert.equal(resolveTheme('dark-ice', null, false).id, 'dark-ice');
  assert.equal(resolveTheme('no-such', null, true).id, DARK_DEFAULT);
  assert.ok(isThemeId(CUSTOM) && isThemeId(SYSTEM) && !isThemeId('nope'));
});

test('custom theme: colours validated, derived colours computed', () => {
  const custom = sanitizeCustom({ mode: 'light', bg: '#FFFFFF', accent: 'red', text: '#000000', extra: 1 });
  assert.equal(custom.mode, 'light');
  assert.equal(custom.bg, '#ffffff');
  assert.equal(custom.accent, defaultCustom().accent, 'invalid colour → default');
  assert.equal('extra' in custom, false);
  const theme = fromCustom({ ...custom, accent: '#ffcc00' });
  assert.equal(theme.id, CUSTOM);
  assert.equal(theme.vars['--accent'], '#ffcc00');
  assert.equal(theme.vars['--accent-text'], '#14171c', 'dark text on a light accent');
  assert.equal(fromCustom({ accent: '#123456' }).vars['--accent-text'], '#ffffff');
});

test('settings keep a valid theme and custom colours', () => {
  assert.equal(sanitizeSettings({}).theme, SYSTEM);
  assert.equal(sanitizeSettings({ theme: 'dark-plum' }).theme, 'dark-plum');
  assert.equal(sanitizeSettings({ theme: 'hotdog' }).theme, SYSTEM);
  assert.equal(sanitizeSettings({ customTheme: { bg: '#010203' } }).customTheme.bg, '#010203');
});
