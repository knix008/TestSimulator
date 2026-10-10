import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, normalize, loadSettingsSync, persistSettings, clampPanelWidth,
  stepFontSize, addRecentFile, removeRecentFile, updateRecentFile, addRecentDir,
  removeRecentDir, applyFontSettings, applyTheme, viewSettingsOf, recentKey,
  MAX_RECENT_FILES, MAX_RECENT_DIRS, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX, PANEL_WIDTH_DEFAULT,
} from '../src/lib/settings.js';

describe('normalize', () => {
  it('returns the defaults for nothing', () => {
    expect(normalize(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalize('not an object')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps values it knows and drops values it does not', () => {
    const out = normalize({ theme: 'paper', bogusKey: 'x' });
    expect(out.theme).toBe('paper');
    expect(out.bogusKey).toBeUndefined();
  });

  it('repairs an invalid enum', () => {
    expect(normalize({ pageMode: 'sideways' }).pageMode).toBe(DEFAULT_SETTINGS.pageMode);
    expect(normalize({ leftPanel: 'nope' }).leftPanel).toBe(DEFAULT_SETTINGS.leftPanel);
    expect(normalize({ zoomMode: 'huge' }).zoomMode).toBe(DEFAULT_SETTINGS.zoomMode);
    expect(normalize({ spread: 'triple' }).spread).toBe('single');
    expect(normalize({ pageTurn: 'explode' }).pageTurn).toBe('slide');
  });

  it('reads an older two-column flag as two columns', () => {
    expect(normalize({ twoColumns: true }).columns).toBe(2);
    expect(normalize({ columns: 3 })).toMatchObject({ columns: 2, twoColumns: true });
    expect(normalize({ columns: 1, twoColumns: true }).columns).toBe(1);
  });

  it('keeps a page layout and a turning effect it does know', () => {
    expect(normalize({ spread: 'double' }).spread).toBe('double');
    expect(normalize({ pageTurn: 'flip' }).pageTurn).toBe('flip');
  });

  it('clamps the numbers', () => {
    const out = normalize({
      fontSize: 99, backgroundOpacity: 400, fontScale: 12,
      lineHeight: 0.1, letterSpacing: 40, zoom: 99, rotation: 100,
      leftWidth: 5, rightWidth: 5000,
    });
    expect(out.fontSize).toBe(24);
    expect(out.backgroundOpacity).toBe(100);
    expect(out.fontScale).toBe(3);
    expect(out.lineHeight).toBe(1.1);
    expect(out.letterSpacing).toBe(4);
    expect(out.zoom).toBe(8);
    expect(out.rotation).toBe(90);
    expect(out.leftWidth).toBe(PANEL_WIDTH_MIN);
    expect(out.rightWidth).toBe(PANEL_WIDTH_MAX);
  });

  it('keeps a boolean a boolean and a number a number', () => {
    expect(normalize({ justify: 'yes' }).justify).toBe(true);
    expect(normalize({ fontSize: 'big' }).fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });

  it('caps and cleans the recent lists', () => {
    const files = Array.from({ length: 30 }, (_, i) => ({ path: `p${i}`, name: `n${i}` }));
    const out = normalize({ recentFiles: [...files, null, 42], recentDirs: Array(30).fill('d') });
    expect(out.recentFiles).toHaveLength(MAX_RECENT_FILES);
    expect(out.recentDirs).toHaveLength(MAX_RECENT_DIRS);
  });

  it('accepts a reading width that is not one of the presets', () => {
    expect(normalize({ readingWidth: 812 }).readingWidth).toBe(812);
    expect(normalize({ pagePreset: 'sideways' }).pagePreset).toBe('md');
    expect(normalize({ pageWidth: 20, pageHeight: 9000 })).toMatchObject({ pageWidth: 400, pageHeight: 1800 });
    expect(normalize({ pagePreset: 'lg', pageWidth: 840, pageHeight: 910 })).toMatchObject({
      pagePreset: 'lg', pageWidth: 840, pageHeight: 910,
    });
  });
});

describe('persistence', () => {
  it('writes and reads the settings back', () => {
    persistSettings({ ...DEFAULT_SETTINGS, theme: 'sepia', fontScale: 1.5 });
    const loaded = loadSettingsSync();
    expect(loaded.theme).toBe('sepia');
    expect(loaded.fontScale).toBe(1.5);
  });

  it('survives junk in storage', () => {
    localStorage.setItem('myebookreader-state', '{ not json');
    expect(loadSettingsSync()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('recent files', () => {
  it('adds an entry at the front with a timestamp', () => {
    const list = addRecentFile([], { path: 'a', name: 'a.epub' });
    expect(list[0].openedAt).toBeGreaterThan(0);
  });

  it('moves a file that is opened again to the front', () => {
    let list = addRecentFile([], { path: 'a', name: 'a' });
    list = addRecentFile(list, { path: 'b', name: 'b' });
    list = addRecentFile(list, { path: 'a', name: 'a' });
    expect(list.map((f) => f.path)).toEqual(['a', 'b']);
  });

  it('keeps at most ten', () => {
    let list = [];
    for (let i = 0; i < 15; i++) list = addRecentFile(list, { path: `p${i}`, name: `n${i}` });
    expect(list).toHaveLength(MAX_RECENT_FILES);
    expect(list[0].path).toBe('p14');
  });

  it('removes one entry', () => {
    const list = addRecentFile(addRecentFile([], { path: 'a' }), { path: 'b' });
    expect(removeRecentFile(list, 'a').map((f) => f.path)).toEqual(['b']);
  });

  it('updates the remembered position of one entry', () => {
    const list = addRecentFile([], { path: 'a', name: 'a', section: 0 });
    expect(updateRecentFile(list, 'a', { section: 7 })[0].section).toBe(7);
  });

  it('keys an entry by path, falling back to the name', () => {
    expect(recentKey({ path: 'p', name: 'n' })).toBe('p');
    expect(recentKey({ name: 'n' })).toBe('n');
    expect(recentKey(null)).toBe('');
  });

  it('keeps the recent folders unique and capped', () => {
    let dirs = addRecentDir([], '/a');
    dirs = addRecentDir(dirs, '/b');
    dirs = addRecentDir(dirs, '/a');
    expect(dirs).toEqual(['/a', '/b']);
    expect(removeRecentDir(dirs, '/a')).toEqual(['/b']);
    expect(addRecentDir(dirs, '')).toEqual(dirs);
  });
});

describe('applying settings to the document', () => {
  it('sets the theme attribute', () => {
    applyTheme('nord');
    expect(document.documentElement.getAttribute('data-theme')).toBe('nord');
  });

  it('sets the UI font variables', () => {
    applyFontSettings({
      fontFamily: 'Consolas', fontSize: 18, fontWeight: 'bold',
      fontStyle: 'italic', fontUnderline: true,
    });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--ui-font')).toBe("'Consolas'");
    expect(style.getPropertyValue('--ui-size')).toBe('18px');
    expect(style.getPropertyValue('--ui-weight')).toBe('bold');
    expect(style.getPropertyValue('--ui-style')).toBe('italic');
    expect(style.getPropertyValue('--ui-decoration')).toBe('underline');
  });
});

describe('helpers', () => {
  it('clamps a panel width', () => {
    expect(clampPanelWidth(10)).toBe(PANEL_WIDTH_MIN);
    expect(clampPanelWidth(9999)).toBe(PANEL_WIDTH_MAX);
    expect(clampPanelWidth('x')).toBe(PANEL_WIDTH_DEFAULT);
  });

  it('steps the UI font size within its range', () => {
    expect(stepFontSize(14, 1)).toBe(15);
    expect(stepFontSize(10, -1)).toBe(10);
    expect(stepFontSize(24, 1)).toBe(24);
  });

  it('picks out the settings a reading file carries', () => {
    const view = viewSettingsOf(DEFAULT_SETTINGS);
    expect(Object.keys(view)).toContain('fontScale');
    expect(Object.keys(view)).toContain('pageMode');
    expect(Object.keys(view)).toContain('spread');
    expect(Object.keys(view)).toContain('pageTurn');
    expect(Object.keys(view)).toContain('pagePreset');
    expect(view.pageWidth).toBe(720);
    expect(view.pageHeight).toBe(780);
    expect(Object.keys(view)).not.toContain('recentFiles');
  });
});
