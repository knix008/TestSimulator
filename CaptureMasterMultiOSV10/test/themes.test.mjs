import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, themeById, DEFAULT_THEME } from '../src/themes.js';

test('16 built-in themes, unique ids, both modes represented', () => {
  assert.equal(THEMES.length, 16);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, 16);
  assert.ok(THEMES.some((t) => t.mode === 'dark') && THEMES.some((t) => t.mode === 'light'));
  assert.equal(themeById(DEFAULT_THEME).id, DEFAULT_THEME);
  assert.equal(themeById('nope').id, THEMES[0].id);
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
