// Themes: 20 dark + 20 light, all readable; the custom theme; cycling.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrast, customTheme, DEFAULT_CUSTOM, mix, nextTheme, themeOf, THEMES, themeVars } from '../../src/themes.js';
import { normalize } from '../../src/settings.js';

// features: APP-THEMES
test('APP-THEMES: 20 dark and 20 light themes with unique ids and names', () => {
  assert.equal(THEMES.filter((t) => t.mode === 'dark').length, 20);
  assert.equal(THEMES.filter((t) => t.mode === 'light').length, 20);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, 40);
  assert.equal(new Set(THEMES.map((t) => t.name)).size, 40);
  assert.ok(THEMES.some((t) => t.id === 'dark') && THEMES.some((t) => t.id === 'light'), 'the old ids still work');
});

test('APP-THEMES: every theme is readable (WCAG contrast of text, secondary text, accent buttons)', () => {
  const problems = [];
  for (const theme of THEMES) {
    const v = themeVars(theme);
    const check = (label, a, b, min) => { const c = contrast(a, b); if (c < min) problems.push(`${theme.id} ${label} ${c.toFixed(2)} < ${min}`); };
    check('text/bg', v['--text'], v['--bg'], 7);
    check('text/panel', v['--text'], v['--panel'], 7);
    check('text-2/bg', v['--text-2'], v['--bg'], 4.5);
    check('text-3/bg', v['--text-3'], v['--bg'], 3);
    check('accent-text/accent', v['--accent-text'], v['--accent'], 3);
    check('accent/bg', v['--accent'], v['--bg'], 3);
    check('text/input', v['--text'], v['--input'], 7);
  }
  assert.deepEqual(problems, []);
});

test('APP-THEMES: the theme button walks through all themes and wraps around', () => {
  const seen = new Set();
  let id = 'dark';
  for (let i = 0; i < THEMES.length; i++) { seen.add(id); id = nextTheme(id).id; }
  assert.equal(seen.size, 40);
  assert.equal(id, 'dark');
  assert.equal(nextTheme('custom').id, THEMES[0].id);
});

test('APP-THEMES: custom theme from settings; bad colours fall back; settings keep it', () => {
  const custom = customTheme({ mode: 'light', bg: '#fafafa', text: '#101010', accent: '#ff00aa', panel: 'nope' });
  assert.deepEqual([custom.mode, custom.bg, custom.text, custom.accent, custom.panel], ['light', '#fafafa', '#101010', '#ff00aa', '']);
  assert.equal(themeOf('custom', { bg: 'red' }).bg, DEFAULT_CUSTOM.bg);
  assert.equal(themeOf('no-such-theme').id, 'dark');
  assert.equal(themeVars({ ...custom, panel: '#eeeeee' })['--panel'], '#eeeeee');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  const s = normalize({ theme: 'nord', customTheme: { mode: 'light', bg: '#ffffff', text: '#000000', accent: '#123456', panel: '' } });
  assert.equal(s.theme, 'nord');
  assert.equal(s.customTheme.accent, '#123456');
  assert.equal(normalize({}).customTheme.mode, 'dark');
});
