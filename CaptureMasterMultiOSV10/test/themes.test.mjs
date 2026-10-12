import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, themeById, themeFromCustom, nextThemeId, DEFAULT_THEME } from '../src/themes.js';

test('20 dark and 20 light built-in themes, unique ids', () => {
  assert.equal(THEMES.length, 40);
  assert.equal(THEMES.filter((t) => t.mode === 'dark').length, 20);
  assert.equal(THEMES.filter((t) => t.mode === 'light').length, 20);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, 40);
  assert.equal(themeById(DEFAULT_THEME).id, DEFAULT_THEME);
  assert.equal(themeById('nope').id, THEMES[0].id);
});

test('custom themes join the cycle and keep their colours', () => {
  const custom = [{ id: 'custom-a', label: 'Mine', mode: 'light', bg: '#fff8ee', panel: '#f3e6d4', text: '#332211', accent: '#aa5500', titlebar: '#efe2d0' }];
  const theme = themeById('custom-a', custom);
  assert.equal(theme.mode, 'light');
  assert.equal(theme.tokens['--bg'], '#fff8ee');
  assert.equal(theme.tokens['--accent'], '#aa5500');
  assert.equal(themeFromCustom(custom[0]).label, 'Mine');
  const afterLastLight = nextThemeId('porcelain', custom);
  assert.equal(afterLastLight, 'custom-a');
  assert.equal(nextThemeId('custom-a', custom), 'midnight');
});

test('every theme defines the same token set with valid colours', () => {
  const keys = Object.keys(THEMES[0].tokens).sort();
  for (const t of THEMES) {
    assert.deepEqual(Object.keys(t.tokens).sort(), keys, t.id);
    for (const [k, v] of Object.entries(t.tokens)) {
      if (k === '--shadow') continue;
      assert.match(v, /^#[0-9a-f]{6}$/i, `${t.id} ${k}`);
    }
    assert.ok(t.label && t.labelEn, t.id);
  }
});
