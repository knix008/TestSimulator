import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SETTINGS, MAX_RECENT_FILES, MAX_RECENT_DIRS,
  FONT_SIZE_MIN, FONT_SIZE_MAX, stepFontSize,
  SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_DEFAULT, clampSidebarWidth,
  INFO_PANEL_WIDTH_MIN, INFO_PANEL_WIDTH_DEFAULT, clampInfoPanelWidth,
  normalize, addRecentFile, removeRecentFile, addRecentDir, openDefaultDir,
  applyFontSettings, applyTheme, persistSettings, loadSettingsSync,
} from '../src/lib/settings.js';

describe('defaults', () => {
  it('starts in Korean dark theme with continuous fit-width viewing', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('dark');
    expect(DEFAULT_SETTINGS.lang).toBe('ko');
    expect(DEFAULT_SETTINGS.zoomMode).toBe('fit-width');
    expect(DEFAULT_SETTINGS.pageLayout).toBe('continuous');
    expect(DEFAULT_SETTINGS.pageEffect).toBe('flip');
    expect(normalize({ pageLayout: 'spread' }).pageLayout).toBe('spread');
    expect(normalize({ pageLayout: 'spread', zoomMode: 'actual' }).zoomMode).toBe('fit-page');
    expect(normalize({ pageLayout: 'single', zoomMode: 'fit-height' }).zoomMode).toBe('fit-height');
    expect(normalize({ pageLayout: 'single', zoomMode: 'custom' }).zoomMode).toBe('custom');
    expect(normalize({ zoomMode: 'stretch' }).zoomMode).toBe('fit-width');
    expect(normalize({ pageLayout: 'facing' }).pageLayout).toBe('continuous');
    expect(normalize({ pageEffect: 'slide' }).pageEffect).toBe('slide');
    expect(normalize({ pageEffect: 'curl' }).pageEffect).toBe('none');
    expect(DEFAULT_SETTINGS.tool).toBe('text');
    expect(DEFAULT_SETTINGS.sidebar).toBe('thumbnails');
    expect(DEFAULT_SETTINGS.sidebarWidth).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(DEFAULT_SETTINGS.rightPanel).toBe(false);
    expect(DEFAULT_SETTINGS.rightPanelWidth).toBe(INFO_PANEL_WIDTH_DEFAULT);
    expect(DEFAULT_SETTINGS.sidebarWidth).toBe(DEFAULT_SETTINGS.rightPanelWidth);
    expect(INFO_PANEL_WIDTH_MIN).toBe(Math.round(SIDEBAR_WIDTH_MIN * 1.5));
    expect(normalize({ rightPanel: true, rightPanelWidth: 80 }).rightPanelWidth).toBe(INFO_PANEL_WIDTH_MIN);
    expect(DEFAULT_SETTINGS.showStatusBar).toBe(true);
    expect(DEFAULT_SETTINGS.captureFormat).toBe('png');
    expect(DEFAULT_SETTINGS.captureQuality).toBe(0.92);
    expect(DEFAULT_SETTINGS.captureAction).toBe('ask');
    expect(DEFAULT_SETTINGS.autoCopyText).toBe(false);
    expect(DEFAULT_SETTINGS.autoCopyImage).toBe(false);
    expect(DEFAULT_SETTINGS.autoCopyRegion).toBe(false);
    expect(DEFAULT_SETTINGS.printScope).toBe('all');
    expect(DEFAULT_SETTINGS.rememberLastPage).toBe(true);
    expect(DEFAULT_SETTINGS.recentFiles).toEqual([]);
    expect(DEFAULT_SETTINGS.recentDirs).toEqual([]);
    expect(DEFAULT_SETTINGS.folderRoot).toBe('');
    expect(DEFAULT_SETTINGS.lastDir).toBe('');
    expect(DEFAULT_SETTINGS.defaultOpenDir).toBe('');
    expect(DEFAULT_SETTINGS.customThemes).toEqual([]);
  });

  it('caps recent lists at 10', () => {
    expect(MAX_RECENT_FILES).toBe(10);
    expect(MAX_RECENT_DIRS).toBe(10);
  });
});

describe('normalize', () => {
  it('returns defaults for null, undefined and non-objects', () => {
    expect(normalize(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalize(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalize('x')).toEqual(DEFAULT_SETTINGS);
    expect(normalize(3)).toEqual(DEFAULT_SETTINGS);
  });

  it('drops unknown keys so old files cannot inject junk', () => {
    const out = normalize({ theme: 'nord', evil: true, __proto__: { x: 1 } });
    expect(out.theme).toBe('nord');
    expect(out).not.toHaveProperty('evil');
  });

  it('skips null and undefined overrides', () => {
    const out = normalize({ theme: null, lang: undefined, fontSize: 18 });
    expect(out.theme).toBe('dark');
    expect(out.lang).toBe('ko');
    expect(out.fontSize).toBe(18);
  });

  it('coerces numbers and rejects non-finite values', () => {
    expect(normalize({ zoom: '1.5' }).zoom).toBe(1.5);
    expect(normalize({ zoom: 'nope' }).zoom).toBe(DEFAULT_SETTINGS.zoom);
    expect(normalize({ zoom: Infinity }).zoom).toBe(DEFAULT_SETTINGS.zoom);
    expect(normalize({ zoom: NaN }).zoom).toBe(DEFAULT_SETTINGS.zoom);
  });

  it('coerces booleans', () => {
    expect(normalize({ showStatusBar: 0 }).showStatusBar).toBe(false);
    expect(normalize({ showStatusBar: 'yes' }).showStatusBar).toBe(true);
    expect(normalize({ invertPages: 1 }).invertPages).toBe(true);
  });

  it('keeps arrays only when the incoming value is an array', () => {
    expect(normalize({ recentFiles: 'oops' }).recentFiles).toEqual([]);
    expect(normalize({ recentDirs: ['C:/a'] }).recentDirs).toEqual(['C:/a']);
  });

  it('normalizes custom themes and drops a missing custom selection', () => {
    const saved = normalize({
      theme: 'custom-lake',
      customThemes: [{
        id: 'custom-lake',
        name: '  Lake  ',
        kind: 'light',
        colors: { bg: 'f4f2f0', panel: '#ffffff', text: '#241f1d', accent: '#c33a32' },
      }],
    });
    expect(saved.theme).toBe('custom-lake');
    expect(saved.customThemes).toHaveLength(1);
    expect(saved.customThemes[0]).toMatchObject({
      id: 'custom-lake',
      name: 'Lake',
      kind: 'light',
      colors: { bg: '#f4f2f0', panel: '#ffffff', text: '#241f1d', accent: '#c33a32' },
    });
    expect(normalize({ theme: 'custom-gone', customThemes: [] }).theme).toBe('dark');
    expect(normalize({ customThemes: 'nope' }).customThemes).toEqual([]);
  });

  it('clamps fontSize to 10–24', () => {
    expect(normalize({ fontSize: 3 }).fontSize).toBe(FONT_SIZE_MIN);
    expect(normalize({ fontSize: 10 }).fontSize).toBe(10);
    expect(normalize({ fontSize: 24 }).fontSize).toBe(24);
    expect(normalize({ fontSize: 99 }).fontSize).toBe(FONT_SIZE_MAX);
  });

  it('steps font size down and up and stops at the ends', () => {
    expect(stepFontSize(14, -1)).toBe(13);
    expect(stepFontSize(14, 1)).toBe(15);
    expect(stepFontSize(FONT_SIZE_MIN, -1)).toBe(FONT_SIZE_MIN);
    expect(stepFontSize(FONT_SIZE_MAX, 1)).toBe(FONT_SIZE_MAX);
    expect(stepFontSize('nope', 1)).toBe(DEFAULT_SETTINGS.fontSize + 1);
  });

  it('clamps the sidebar panel width', () => {
    expect(clampSidebarWidth(220)).toBe(220);
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_WIDTH_MAX);
    expect(clampSidebarWidth('nope')).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(normalize({ sidebarWidth: 40 }).sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
    expect(normalize({ sidebarWidth: 400 }).sidebarWidth).toBe(400);
  });

  it('clamps the document info panel width with a 1.5× sidebar minimum', () => {
    expect(INFO_PANEL_WIDTH_MIN).toBe(270);
    expect(SIDEBAR_WIDTH_DEFAULT).toBe(INFO_PANEL_WIDTH_DEFAULT);
    expect(SIDEBAR_WIDTH_DEFAULT).toBe(INFO_PANEL_WIDTH_MIN);
    expect(clampInfoPanelWidth(300)).toBe(300);
    expect(clampInfoPanelWidth(10)).toBe(INFO_PANEL_WIDTH_MIN);
    expect(clampInfoPanelWidth(9999)).toBe(SIDEBAR_WIDTH_MAX);
    expect(clampInfoPanelWidth('nope')).toBe(INFO_PANEL_WIDTH_DEFAULT);
    expect(normalize({ rightPanelWidth: 40 }).rightPanelWidth).toBe(INFO_PANEL_WIDTH_MIN);
    expect(normalize({ rightPanelWidth: 400 }).rightPanelWidth).toBe(400);
  });

  it('keeps a default Open folder and falls back to the last used folder', () => {
    expect(normalize({ defaultOpenDir: '  D:/Docs  ' }).defaultOpenDir).toBe('D:/Docs');
    expect(normalize({ defaultOpenDir: 12 }).defaultOpenDir).toBe('');
    expect(openDefaultDir({ defaultOpenDir: 'D:/Pdf', lastDir: 'C:/tmp' })).toBe('D:/Pdf');
    expect(openDefaultDir({ defaultOpenDir: '', lastDir: 'C:/tmp' })).toBe('C:/tmp');
    expect(openDefaultDir({})).toBe('');
  });

  it('clamps captureQuality to 0.1–1', () => {
    expect(normalize({ captureQuality: 0 }).captureQuality).toBe(0.1);
    expect(normalize({ captureQuality: 0.05 }).captureQuality).toBe(0.1);
    expect(normalize({ captureQuality: 1 }).captureQuality).toBe(1);
    expect(normalize({ captureQuality: 2 }).captureQuality).toBe(1);
  });

  it('clamps minImageSize to 1–512', () => {
    expect(normalize({ minImageSize: 0 }).minImageSize).toBe(1);
    expect(normalize({ minImageSize: 24 }).minImageSize).toBe(24);
    expect(normalize({ minImageSize: 9999 }).minImageSize).toBe(512);
  });

  it('treats the old captureAction=copy as auto-copy region', () => {
    const out = normalize({ captureAction: 'copy' });
    expect(out.autoCopyRegion).toBe(true);
    expect(out.captureAction).toBe('copy');
  });

  it('keeps autoCopyRegion in sync with captureAction', () => {
    expect(normalize({ autoCopyRegion: true }).captureAction).toBe('copy');
    expect(normalize({ autoCopyRegion: false, captureAction: 'copy' }).captureAction).toBe('ask');
  });

  it('resets an unknown tool to text', () => {
    expect(normalize({ tool: 'lasso' }).tool).toBe('text');
    expect(normalize({ tool: 'image' }).tool).toBe('image');
    expect(normalize({ tool: 'region' }).tool).toBe('region');
  });

  it('filters recent files without a path and trims to 10', () => {
    const files = Array.from({ length: 15 }, (_, i) => ({ path: `p${i}.pdf`, name: `p${i}` }));
    files.push({ name: 'no-path' }, null, 5);
    const out = normalize({ recentFiles: files });
    expect(out.recentFiles).toHaveLength(10);
    expect(out.recentFiles.every((f) => typeof f.path === 'string')).toBe(true);
  });

  it('filters recent dirs that are not strings and trims to 10', () => {
    const dirs = [...Array.from({ length: 12 }, (_, i) => `D${i}`), 1, null];
    const out = normalize({ recentDirs: dirs });
    expect(out.recentDirs).toHaveLength(10);
    expect(out.recentDirs[0]).toBe('D0');
  });
});

describe('recent files / dirs', () => {
  it('adds a file at the front with openedAt', () => {
    const next = addRecentFile([], { path: 'a.pdf', name: 'a.pdf' });
    expect(next).toHaveLength(1);
    expect(next[0].path).toBe('a.pdf');
    expect(next[0].openedAt).toBeGreaterThan(0);
  });

  it('moves an existing path to the front instead of duplicating', () => {
    const list = addRecentFile([{ path: 'a.pdf' }, { path: 'b.pdf' }], { path: 'b.pdf', name: 'b' });
    expect(list.map((f) => f.path)).toEqual(['b.pdf', 'a.pdf']);
  });

  it('matches by name when path is missing (web)', () => {
    const list = addRecentFile([{ name: 'a.pdf' }], { name: 'a.pdf', size: 9 });
    expect(list).toHaveLength(1);
    expect(list[0].size).toBe(9);
  });

  it('never keeps more than MAX_RECENT_FILES', () => {
    let list = [];
    for (let i = 0; i < 20; i++) list = addRecentFile(list, { path: `${i}.pdf` });
    expect(list).toHaveLength(MAX_RECENT_FILES);
    expect(list[0].path).toBe('19.pdf');
    expect(list[9].path).toBe('10.pdf');
  });

  it('removes by path or name', () => {
    const list = [{ path: 'a.pdf' }, { name: 'b.pdf' }];
    expect(removeRecentFile(list, 'a.pdf')).toEqual([{ name: 'b.pdf' }]);
    expect(removeRecentFile(list, 'b.pdf')).toEqual([{ path: 'a.pdf' }]);
    expect(removeRecentFile(null, 'x')).toEqual([]);
  });

  it('adds a directory at the front and de-duplicates', () => {
    expect(addRecentDir(['C:/a', 'C:/b'], 'C:/b')).toEqual(['C:/b', 'C:/a']);
  });

  it('ignores an empty directory', () => {
    expect(addRecentDir(['C:/a'], '')).toEqual(['C:/a']);
    expect(addRecentDir(['C:/a'], null)).toEqual(['C:/a']);
    expect(addRecentDir(null, '')).toEqual([]);
  });

  it('never keeps more than MAX_RECENT_DIRS', () => {
    let list = [];
    for (let i = 0; i < 15; i++) list = addRecentDir(list, `D${i}`);
    expect(list).toHaveLength(MAX_RECENT_DIRS);
  });
});

describe('applyFontSettings / applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.cssText = '';
  });

  it('writes UI font CSS variables', () => {
    applyFontSettings({
      fontFamily: 'Malgun Gothic',
      fontSize: 16,
      fontWeight: 'bold',
      fontStyle: 'italic',
      fontUnderline: true,
    });
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--ui-font')).toBe("'Malgun Gothic'");
    expect(s.getPropertyValue('--ui-size')).toBe('16px');
    expect(s.getPropertyValue('--ui-weight')).toBe('bold');
    expect(s.getPropertyValue('--ui-style')).toBe('italic');
    expect(s.getPropertyValue('--ui-decoration')).toBe('underline');
  });

  it('clears the family and underline when unset', () => {
    applyFontSettings({
      fontFamily: '',
      fontSize: 14,
      fontWeight: 'normal',
      fontStyle: 'normal',
      fontUnderline: false,
    });
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--ui-font')).toBe('');
    expect(s.getPropertyValue('--ui-decoration')).toBe('none');
  });

  it('sets data-theme on the document root', () => {
    applyTheme('nord');
    expect(document.documentElement.getAttribute('data-theme')).toBe('nord');
    applyTheme('sky');
    expect(document.documentElement.getAttribute('data-theme')).toBe('sky');
  });

  it('applies a custom theme as CSS variables and clears them afterwards', () => {
    const custom = {
      id: 'custom-test',
      name: 'Lake',
      kind: 'dark',
      colors: { bg: '#102030', panel: '#1a3040', text: '#e8f0f8', accent: '#3aa0d8' },
    };
    applyTheme(custom.id, [custom]);
    expect(document.documentElement.getAttribute('data-theme')).toBe('custom');
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#102030');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#3aa0d8');
    applyTheme('nord', [custom]);
    expect(document.documentElement.getAttribute('data-theme')).toBe('nord');
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
  });
});

describe('persist / load', () => {
  it('round-trips settings through localStorage', () => {
    persistSettings({ ...DEFAULT_SETTINGS, theme: 'ocean', lang: 'en' });
    const loaded = loadSettingsSync();
    expect(loaded.theme).toBe('ocean');
    expect(loaded.lang).toBe('en');
  });

  it('normalizes garbage stored in localStorage', () => {
    localStorage.setItem('mypdfviewer-state', '{"theme":"rose","fontSize":3,"tool":"xyz"}');
    const loaded = loadSettingsSync();
    expect(loaded.theme).toBe('rose');
    expect(loaded.fontSize).toBe(10);
    expect(loaded.tool).toBe('text');
  });
});
