import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  THEMES, THEME_IDS, nextTheme, isDarkTheme, isPaperTheme, themeGroups,
} from '../src/lib/themes.js';

const css = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.css'),
  'utf-8',
);

describe('theme list', () => {
  it('offers a wide choice', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(20);
  });

  it('offers twenty dark themes and twenty light ones', () => {
    const groups = themeGroups();
    expect(groups.map((g) => g.kind)).toEqual(['dark', 'light']);
    for (const group of groups) expect(group.themes, group.kind).toHaveLength(20);
    expect(groups[0].themes.length + groups[1].themes.length).toBe(THEMES.length);
  });

  it('puts every theme in exactly one family', () => {
    const groups = themeGroups();
    const ids = groups.flatMap((g) => g.themes.map((t) => t.id));
    expect(new Set(ids).size).toBe(THEMES.length);
    for (const theme of groups[0].themes) expect(isDarkTheme(theme.id), theme.id).toBe(true);
    for (const theme of groups[1].themes) expect(isDarkTheme(theme.id), theme.id).toBe(false);
  });

  it('has unique ids', () => {
    expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length);
  });

  it('gives every theme three swatch colours', () => {
    for (const theme of THEMES) {
      expect(theme.bars).toHaveLength(3);
      for (const colour of theme.bars) expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('cycles through every theme and wraps', () => {
    let id = THEME_IDS[0];
    const seen = new Set([id]);
    for (let i = 1; i < THEME_IDS.length; i++) {
      id = nextTheme(id);
      seen.add(id);
    }
    expect(seen.size).toBe(THEME_IDS.length);
    expect(nextTheme(THEME_IDS.at(-1))).toBe(THEME_IDS[0]);
  });

  it('starts at the first theme for an unknown id', () => {
    expect(nextTheme('no-such-theme')).toBe(THEME_IDS[0]);
  });

  it('knows which themes are dark and which are paper-like', () => {
    expect(isDarkTheme('night')).toBe(true);
    expect(isDarkTheme('light')).toBe(false);
    expect(isPaperTheme('sepia')).toBe(true);
    expect(isPaperTheme('midnight')).toBe(false);
  });
});

describe('App.css', () => {
  it('defines a palette for every theme in the list', () => {
    const missing = THEME_IDS.filter((id) => id !== 'dark' && !css.includes(`[data-theme='${id}']`));
    expect(missing).toEqual([]);
  });

  it('defines the default palette on :root', () => {
    expect(css).toMatch(/:root\s*\{[\s\S]*--bg:/);
  });

  it('gives every theme the variables the components use', () => {
    // Each theme block must set the reading surface as well as the chrome,
    // otherwise a page would inherit the previous theme's paper colour.
    const blocks = css.match(/:root\[data-theme='[^']+'\]\s*\{[^}]*\}/g) || [];
    expect(blocks.length).toBeGreaterThanOrEqual(THEME_IDS.length - 1);
    for (const block of blocks) {
      for (const name of ['--bg:', '--panel:', '--text:', '--accent:', '--page-bg:', '--page-paper:', '--page-ink:']) {
        expect(block).toContain(name);
      }
    }
  });

  it('drives the reading pane from the reading variables', () => {
    expect(css).toContain('font-size: var(--read-size)');
    expect(css).toContain('line-height: var(--read-line)');
    expect(css).toContain('max-width: var(--read-width)');
    expect(css).toContain('text-align: var(--read-align)');
  });

  it('paginates with CSS columns in paged mode', () => {
    expect(css).toMatch(/\.bookview\.reflow\.paged[\s\S]*column-width/);
  });
});
