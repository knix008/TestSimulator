import { describe, it, expect } from 'vitest';
import { THEMES, THEME_IDS, isDarkTheme, nextTheme } from '../src/lib/themes.js';

const DARK = [
  'dark', 'midnight', 'nord', 'forest', 'rose', 'contrast', 'ocean', 'mocha',
  'ember', 'slate', 'grape', 'crimson',
];
const LIGHT = ['light', 'white', 'solarized', 'sky', 'lavender', 'matcha', 'sand', 'ice'];

describe('THEMES', () => {
  it('exposes twenty unique themes', () => {
    expect(THEMES).toHaveLength(20);
    expect(THEME_IDS).toEqual(THEMES.map((t) => t.id));
    expect(new Set(THEME_IDS).size).toBe(20);
  });

  it('includes the advertised set from the user guide', () => {
    expect(THEME_IDS).toEqual(expect.arrayContaining([
      'dark', 'light', 'white', 'midnight', 'nord', 'forest',
      'rose', 'solarized', 'contrast', 'ocean', 'mocha', 'sky',
    ]));
  });

  it('gives every theme a 3-stop swatch of hex colours', () => {
    for (const theme of THEMES) {
      expect(theme.bars).toHaveLength(3);
      for (const c of theme.bars) {
        expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe('nextTheme', () => {
  it('advances through the list and wraps to the first', () => {
    expect(nextTheme('dark')).toBe('light');
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
    for (const id of DARK) expect(isDarkTheme(id)).toBe(true);
  });

  it('classifies light themes', () => {
    for (const id of LIGHT) expect(isDarkTheme(id)).toBe(false);
  });

  it('treats an unknown id as light (pages stay uninverted)', () => {
    expect(isDarkTheme('unknown')).toBe(false);
    expect(isDarkTheme(undefined)).toBe(false);
  });

  it('covers every shipped theme id', () => {
    expect([...DARK, ...LIGHT].sort()).toEqual([...THEME_IDS].sort());
  });
});
