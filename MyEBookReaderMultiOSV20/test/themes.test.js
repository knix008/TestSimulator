import { describe, it, expect } from 'vitest';
import {
  THEMES, THEME_IDS, THEME_KINDS, DARK_THEMES, LIGHT_THEMES,
  MAX_CUSTOM_THEMES, DEFAULT_CUSTOM_COLORS,
  isDarkTheme, nextTheme, themesByKind, parseHex, mixHex,
  expandThemeColors, normalizeCustomTheme, normalizeCustomThemes, allThemes,
} from '../src/lib/themes.js';

describe('THEMES', () => {
  it('exposes twenty dark and twenty light themes', () => {
    expect(THEME_KINDS).toEqual(['dark', 'light']);
    expect(THEMES).toHaveLength(40);
    expect(DARK_THEMES).toHaveLength(20);
    expect(LIGHT_THEMES).toHaveLength(20);
    expect(themesByKind('dark')).toEqual(DARK_THEMES);
    expect(themesByKind('light')).toEqual(LIGHT_THEMES);
    expect(THEME_IDS).toEqual(THEMES.map((t) => t.id));
    expect(new Set(THEME_IDS).size).toBe(40);
  });

  it('includes the original set plus the new dark and light names', () => {
    expect(THEME_IDS).toEqual(expect.arrayContaining([
      'dark', 'midnight', 'nord', 'forest', 'rose', 'contrast', 'ocean', 'mocha',
      'ember', 'slate', 'grape', 'crimson', 'charcoal', 'onyx', 'dusk', 'pine',
      'rust', 'ink', 'wine', 'storm',
      'light', 'white', 'solarized', 'sky', 'lavender', 'matcha', 'sand', 'ice',
      'paper', 'linen', 'mist', 'peach', 'mint', 'lemon', 'cloud', 'pearl',
      'blossom', 'cream', 'frost', 'dawn',
    ]));
  });

  it('gives every theme a kind and a 3-stop swatch of hex colours', () => {
    for (const theme of THEMES) {
      expect(['dark', 'light']).toContain(theme.kind);
      expect(theme.bars).toHaveLength(3);
      for (const c of theme.bars) {
        expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe('nextTheme', () => {
  it('advances through the list and wraps to the first', () => {
    expect(nextTheme('dark')).toBe('midnight');
    expect(nextTheme(THEME_IDS[THEME_IDS.length - 1])).toBe(THEME_IDS[0]);
    expect(nextTheme('unknown')).toBe(THEME_IDS[0]);
  });

  it('visits every theme exactly once in a full cycle', () => {
    const seen = [];
    let id = THEME_IDS[0];
    for (let i = 0; i < THEME_IDS.length; i++) {
      id = nextTheme(id);
      seen.push(id);
    }
    expect(seen).toEqual([...THEME_IDS.slice(1), THEME_IDS[0]]);
  });
});

describe('isDarkTheme', () => {
  it('classifies dark themes', () => {
    for (const th of DARK_THEMES) expect(isDarkTheme(th.id)).toBe(true);
  });

  it('classifies light themes', () => {
    for (const th of LIGHT_THEMES) expect(isDarkTheme(th.id)).toBe(false);
  });

  it('treats an unknown id as light (pages stay uninverted)', () => {
    expect(isDarkTheme('unknown')).toBe(false);
    expect(isDarkTheme(undefined)).toBe(false);
  });

  it('uses the custom theme kind when one is supplied', () => {
    const custom = [{ id: 'custom-x', name: 'X', kind: 'dark', colors: DEFAULT_CUSTOM_COLORS.dark }];
    expect(isDarkTheme('custom-x', custom)).toBe(true);
    expect(isDarkTheme('custom-y', [{ ...custom[0], id: 'custom-y', kind: 'light' }])).toBe(false);
  });

  it('covers every shipped theme id', () => {
    expect([...DARK_THEMES, ...LIGHT_THEMES].map((t) => t.id).sort())
      .toEqual([...THEME_IDS].sort());
  });
});

describe('custom themes', () => {
  const sample = {
    id: 'custom-lake',
    name: 'Lake',
    kind: 'dark',
    colors: { bg: '#102030', panel: '#1a3040', text: '#e8f0f8', accent: '#3aa0d8' },
  };

  it('parses hex colours and mixes them', () => {
    expect(parseHex('#ABC')).toBe(null);
    expect(parseHex('3aa0d8')).toBe('#3aa0d8');
    expect(parseHex('#FFFFFF')).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('expands four colours into the chrome tokens', () => {
    const vars = expandThemeColors('dark', sample.colors);
    expect(vars['--bg']).toBe('#102030');
    expect(vars['--panel']).toBe('#1a3040');
    expect(vars['--text']).toBe('#e8f0f8');
    expect(vars['--accent']).toBe('#3aa0d8');
    expect(vars['--accent-fg']).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars['--page-bg']).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('fills missing fields and caps the saved list', () => {
    const one = normalizeCustomTheme({ name: '  Mine  ', kind: 'light' });
    expect(one.name).toBe('Mine');
    expect(one.kind).toBe('light');
    expect(one.id).toMatch(/^custom-/);
    expect(one.colors).toEqual(DEFAULT_CUSTOM_COLORS.light);
    const many = normalizeCustomThemes(Array.from({ length: 20 }, (_, i) => ({
      id: `custom-${i}`,
      name: `T${i}`,
      kind: 'dark',
      colors: DEFAULT_CUSTOM_COLORS.dark,
    })));
    expect(many).toHaveLength(MAX_CUSTOM_THEMES);
  });

  it('walks built-in themes then custom ones', () => {
    expect(allThemes([sample]).map((t) => t.id)).toEqual([...THEME_IDS, sample.id]);
    expect(nextTheme(THEME_IDS[THEME_IDS.length - 1], [sample])).toBe(sample.id);
    expect(nextTheme(sample.id, [sample])).toBe(THEME_IDS[0]);
  });
});
