import { describe, it, expect } from 'vitest';
import {
  COMMANDS, MENU_IDS, commandById, commandsInMenu, menuRows, recentRows, bookmarkRows,
  themeRows, parseChoice, activeCommands, shortcutRows, RECENT_PREFIX, RECENT_FORGET_PREFIX,
  THEME_PREFIX, BOOKMARK_PREFIX,
} from '../src/lib/menus.js';
import { THEMES, isDarkTheme } from '../src/lib/themes.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';

const state = (over = {}) => ({
  hasBook: true,
  hasSelection: false,
  reflowable: true,
  active: [],
  recentFiles: [],
  bookmarks: [],
  canUndo: false,
  canRedo: false,
  ...over,
});

describe('command catalogue', () => {
  it('has unique ids', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every command an icon and a label key', () => {
    for (const command of COMMANDS) {
      expect(command.icon, command.id).toBeTruthy();
      expect(command.label, command.id).toMatch(/^cmd\./);
    }
  });

  it('files every command under a real menu', () => {
    for (const command of COMMANDS) expect(MENU_IDS).toContain(command.menu);
  });

  it('looks a command up by id', () => {
    expect(commandById('print').label).toBe('cmd.print');
    expect(commandById('nope')).toBeNull();
  });

  it('lists the commands of one menu', () => {
    expect(commandsInMenu('file').map((c) => c.id)).toContain('open');
    expect(commandsInMenu('file').every((c) => c.menu === 'file')).toBe(true);
  });

  it('lists the shortcuts for the shortcuts dialog', () => {
    const rows = shortcutRows();
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.find((r) => r.id === 'open').key).toBe('Ctrl+O');
  });
});

describe('menuRows', () => {
  it('gives every row an icon and a label', () => {
    for (const menu of ['file', 'reading', 'view', 'marks', 'app']) {
      for (const row of menuRows(menu, state())) {
        if (row.separator || row.section || row.empty) continue;
        expect(row.icon, `${menu}/${row.id}`).toBeTruthy();
        expect(row.label || row.text, `${menu}/${row.id}`).toBeTruthy();
      }
    }
  });

  it('disables book commands when nothing is open', () => {
    const rows = menuRows('file', state({ hasBook: false }));
    expect(rows.find((r) => r.id === 'print').disabled).toBe(true);
    expect(rows.find((r) => r.id === 'open').disabled).toBe(false);
  });

  it('disables selection commands without a selection', () => {
    expect(menuRows('marks', state()).find((r) => r.id === 'highlight').disabled).toBe(true);
    expect(menuRows('marks', state({ hasSelection: true })).find((r) => r.id === 'highlight').disabled).toBe(false);
  });

  it('disables reflow commands for a fixed-layout book and vice versa', () => {
    const fixed = menuRows('reading', state({ reflowable: false }));
    expect(fixed.find((r) => r.id === 'textBigger').disabled).toBe(true);
    const reflow = menuRows('view', state({ reflowable: true }));
    expect(reflow.find((r) => r.id === 'zoomIn').disabled).toBe(true);
  });

  it('follows the undo stack', () => {
    expect(menuRows('marks', state()).find((r) => r.id === 'undo').disabled).toBe(true);
    expect(menuRows('marks', state({ canUndo: true })).find((r) => r.id === 'undo').disabled).toBe(false);
  });

  it('ticks the toggles that are on', () => {
    const rows = menuRows('reading', state({ active: ['modePaged'] }));
    expect(rows.find((r) => r.id === 'modePaged').checked).toBe(true);
    expect(rows.find((r) => r.id === 'modeScroll').checked).toBe(false);
  });

  it('puts the recent files at the end of the File menu', () => {
    const rows = menuRows('file', state({ recentFiles: [{ path: '/a/b.epub', name: 'b.epub', dir: '/a' }] }));
    expect(rows.some((r) => r.section === 'recent.title')).toBe(true);
    const recent = rows.find((r) => r.id?.startsWith(RECENT_PREFIX));
    expect(recent.text).toBe('b.epub');
    expect(recent.detail).toBe('/a');
    expect(recent.forget).toBe(`${RECENT_FORGET_PREFIX}/a/b.epub`);
  });

  it('says so when there are no recent files', () => {
    expect(menuRows('file', state()).some((r) => r.empty === 'recent.empty')).toBe(true);
  });

  it('builds a context menu of marks, reading and view commands', () => {
    const rows = menuRows('context', state({ hasSelection: true }));
    const ids = rows.filter((r) => r.id).map((r) => r.id);
    expect(ids).toContain('copySelection');
    expect(ids).toContain('nextSection');
    expect(ids).toContain('toggleLeft');
    expect(rows.filter((r) => r.separator).length).toBeGreaterThan(0);
  });
});

describe('dynamic rows', () => {
  it('builds rows for the recent files', () => {
    const rows = recentRows([{ path: 'p', name: 'n', dir: 'd' }]);
    expect(rows[0]).toMatchObject({ id: `${RECENT_PREFIX}p`, text: 'n', detail: 'd', icon: 'recent' });
  });

  it('builds rows for the bookmarks', () => {
    const rows = bookmarkRows([{ id: 'x1', label: 'mark', section: 3 }]);
    expect(rows[0]).toMatchObject({ id: `${BOOKMARK_PREFIX}x1`, text: 'mark', detail: '4' });
  });

  it('builds rows for the themes, ticking the current one', () => {
    const rows = themeRows(THEMES, 'paper');
    const picks = rows.filter((r) => r.id);
    expect(picks).toHaveLength(THEMES.length);
    expect(rows.find((r) => r.id === `${THEME_PREFIX}paper`).checked).toBe(true);
    expect(picks[0].bars).toHaveLength(3);
  });

  it('splits the themes into a dark and a light family', () => {
    const rows = themeRows(THEMES, 'paper');
    const heads = rows.filter((r) => r.section).map((r) => r.section);
    expect(heads).toEqual(['settings.themeFamily.dark', 'settings.themeFamily.light']);

    // Every pick belongs to the family whose heading it follows.
    let family = null;
    for (const row of rows) {
      if (row.section) family = row.section.endsWith('dark');
      else if (row.id) {
        expect(isDarkTheme(row.id.slice(THEME_PREFIX.length))).toBe(family);
      }
    }
  });
});

describe('parseChoice', () => {
  it('tells the kinds of row apart', () => {
    expect(parseChoice('print')).toEqual({ kind: 'command', value: 'print' });
    expect(parseChoice(`${RECENT_PREFIX}/a/b`)).toEqual({ kind: 'recent', value: '/a/b' });
    expect(parseChoice(`${RECENT_FORGET_PREFIX}/a/b`)).toEqual({ kind: 'recent-forget', value: '/a/b' });
    expect(parseChoice(`${THEME_PREFIX}nord`)).toEqual({ kind: 'theme', value: 'nord' });
    expect(parseChoice(`${BOOKMARK_PREFIX}id1`)).toEqual({ kind: 'bookmark', value: 'id1' });
  });
});

describe('activeCommands', () => {
  it('reports the toggles that are on for the default settings', () => {
    const active = activeCommands(DEFAULT_SETTINGS, null);
    expect(active).toContain('modeScroll');
    // A fixed page meets the window whole unless the reader says otherwise.
    expect(active).toContain('fitPage');
    expect(active).toContain('toggleLeft');
    expect(active).toContain('toggleRight');
    expect(active).toContain('toggleStatus');
    expect(active).not.toContain('modePaged');
  });

  it('follows a changed setting', () => {
    const active = activeCommands({ ...DEFAULT_SETTINGS, pageMode: 'paged', twoColumns: true, leftPanel: 'none' }, null);
    expect(active).toContain('modePaged');
    expect(active).toContain('twoColumns');
    expect(active).not.toContain('toggleLeft');
  });
});
