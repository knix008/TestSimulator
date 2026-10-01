import { describe, it, expect } from 'vitest';
import {
  COMMANDS, MENU_IDS, commandById, commandsInMenu, menuRows, recentRows, bookmarkRows,
  themeRows, parseChoice, activeCommands, shortcutRows, RECENT_PREFIX, RECENT_FORGET_PREFIX,
  THEME_PREFIX, BOOKMARK_PREFIX,
} from '../src/lib/menus.js';
import { THEMES, isDarkTheme } from '../src/lib/themes.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { translate } from '../src/i18n.js';

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
    // The older layout commands stay so a saved shortcut still runs. The three
    // view buttons are the menu, and only one of them can be on.
    const kept = new Set(['modeScroll', 'modePaged', 'twoColumns', 'spreadSingle', 'spreadDouble']);
    for (const command of COMMANDS) {
      if (kept.has(command.id)) {
        expect(command.menu).toBeUndefined();
        continue;
      }
      expect(MENU_IDS, command.id).toContain(command.menu);
    }
  });

  it('looks a command up by id', () => {
    expect(commandById('print').label).toBe('cmd.print');
    expect(commandById('nope')).toBeNull();
  });

  it('lists the commands of one menu', () => {
    const file = commandsInMenu('file').map((c) => c.id);
    expect(file[0]).toBe('openFolder');
    expect(file).toContain('open');
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

  it('disables document zoom for an ebook, and keeps the type size', () => {
    const fixed = menuRows('reading', state({ reflowable: false }));
    expect(fixed.find((r) => r.id === 'textBigger').disabled).toBe(true);
    expect(fixed.find((r) => r.id === 'columns2').disabled).toBe(true);
    const facing = menuRows('reading', state({ reflowable: true, layout: 'double' }));
    expect(facing.find((r) => r.id === 'columns1').disabled).toBe(true);
    expect(facing.find((r) => r.id === 'columns2').disabled).toBe(true);
    const one = menuRows('reading', state({ reflowable: true, layout: 'single' }));
    expect(one.find((r) => r.id === 'columns2').disabled).toBe(false);
    const run = menuRows('reading', state({ reflowable: true, layout: 'continuous' }));
    expect(run.find((r) => r.id === 'columns1').disabled).toBe(true);
    expect(run.find((r) => r.id === 'columns2').disabled).toBe(true);
    const reflow = menuRows('view', state({ reflowable: true, layout: 'double' }));
    expect(reflow.find((r) => r.id === 'zoomIn').disabled).toBe(true);
    expect(reflow.find((r) => r.id === 'zoomOut').disabled).toBe(true);
    expect(reflow.find((r) => r.id === 'actualSize').disabled).toBe(true);
    // An ebook is always the window. Fit by width, height or page is a picture's choice.
    expect(reflow.find((r) => r.id === 'fitWidth').disabled).toBe(true);
    expect(reflow.find((r) => r.id === 'fitPage').disabled).toBe(true);
    const single = menuRows('view', state({ reflowable: false, layout: 'single' }));
    expect(single.find((r) => r.id === 'zoomIn').disabled).toBe(false);
    expect(single.find((r) => r.id === 'fitWidth').disabled).toBe(true);
    expect(single.find((r) => r.id === 'fitPage').disabled).toBe(false);
  });

  it('follows the undo stack', () => {
    expect(menuRows('marks', state()).find((r) => r.id === 'undo').disabled).toBe(true);
    expect(menuRows('marks', state({ canUndo: true })).find((r) => r.id === 'undo').disabled).toBe(false);
  });

  it('ticks the toggles that are on', () => {
    const rows = menuRows('view', state({ active: ['viewSingle'] }));
    expect(rows.find((r) => r.id === 'viewSingle').checked).toBe(true);
    expect(rows.find((r) => r.id === 'viewDouble').checked).toBe(false);
    expect(rows.find((r) => r.id === 'viewContinuous').checked).toBe(false);
  });

  it('puts the recent files at the end of the File menu', () => {
    const rows = menuRows('file', state({ recentFiles: [{ path: '/a/b.epub', name: 'b.epub', dir: '/a' }] }));
    expect(rows.some((r) => r.section === 'recent.title')).toBe(true);
    const recent = rows.find((r) => r.id?.startsWith(RECENT_PREFIX));
    expect(recent.text).toBe('b.epub');
    // The name whole, and the path it came from on hover rather than beside it.
    expect(recent.detail).toBeUndefined();
    expect(recent.tip).toBe('/a/b.epub');
    expect(recent.forget).toBe(`${RECENT_FORGET_PREFIX}/a/b.epub`);
  });

  it('says so when there are no recent files', () => {
    expect(menuRows('file', state()).some((r) => r.empty === 'recent.empty')).toBe(true);
  });

  it('builds a context menu of what is done to the thing under the pointer', () => {
    const rows = menuRows('context', state({ hasSelection: true }));
    const ids = rows.filter((r) => r.id).map((r) => r.id);
    expect(ids).toContain('highlight');
    expect(ids).toContain('addNote');
    expect(ids).toContain('copySelection');
    expect(ids).toContain('bookmarkHere');
    expect(rows.filter((r) => r.separator).length).toBeGreaterThan(0);
  });

  it('offers copy and the highlighter on a selection, and works them', () => {
    const rows = menuRows('context', state({ hasSelection: true }));
    const row = (id) => rows.find((r) => r.id === id);
    expect(row('copySelection').disabled).toBe(false);
    expect(row('highlight').disabled).toBe(false);
  });

  it('greys those two out when nothing is selected, rather than hiding them', () => {
    const rows = menuRows('context', state({ hasSelection: false }));
    const row = (id) => rows.find((r) => r.id === id);
    // Still there, so the reader can see what a selection would offer.
    expect(row('copySelection').disabled).toBe(true);
    expect(row('highlight').disabled).toBe(true);
  });

  it('offers copying the picture that was clicked, and only then', () => {
    expect(menuRows('context', state({ hasImage: true }))
      .find((r) => r.id === 'copyImage').disabled).toBe(false);
    expect(menuRows('context', state({ hasImage: false }))
      .find((r) => r.id === 'copyImage').disabled).toBe(true);
  });
  it('offers exactly the copy that the selection mode allows', () => {
    const row = (rows, id) => rows.find((r) => r.id === id);

    // Words selected: copy the text. There is no region and no picture, so
    // neither of the other two is live.
    const text = menuRows('context', state({ hasSelection: true }));
    expect(row(text, 'copySelection').disabled).toBe(false);
    expect(row(text, 'copyImage').disabled).toBe(true);
    expect(row(text, 'copyRegion').disabled).toBe(true);

    // A picture picked: copy the picture, and only that.
    const picture = menuRows('context', state({ hasImage: true }));
    expect(row(picture, 'copyImage').disabled).toBe(false);
    expect(row(picture, 'copySelection').disabled).toBe(true);
    expect(row(picture, 'copyRegion').disabled).toBe(true);

    // A rectangle drawn: copy the region, and only that.
    const region = menuRows('context', state({ hasRegion: true }));
    expect(row(region, 'copyRegion').disabled).toBe(false);
    expect(row(region, 'copySelection').disabled).toBe(true);
    expect(row(region, 'copyImage').disabled).toBe(true);
  });

  it('tells the three copies apart by name', () => {
    // They sit next to each other in the menu, so two of them reading the
    // same is the same as having only one.
    const names = ['cmd.copySelection', 'cmd.copyImage', 'cmd.copyRegion']
      .map((key) => translate('ko', key));
    expect(new Set(names).size).toBe(3);
  });
  it('never repeats a button the toolbar already has', () => {
    const ids = menuRows('context', state({ hasSelection: true }))
      .filter((r) => r.id).map((r) => r.id);
    // The whole row of buttons used to appear again an inch below itself.
    for (const id of ['nextSection', 'prevSection', 'toggleLeft', 'toggleRight',
      'textBigger', 'textSmaller', 'settings', 'about', 'language', 'undo', 'redo']) {
      expect(ids).not.toContain(id);
    }
  });
});

describe('dynamic rows', () => {
  it('builds rows for the recent files', () => {
    const rows = recentRows([{ path: 'p', name: 'n', dir: 'd' }]);
    expect(rows[0]).toMatchObject({ id: `${RECENT_PREFIX}p`, text: 'n', tip: 'p', icon: 'recent' });
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
    expect(active).toContain('viewContinuous');
    // A fixed page meets the window whole unless the reader says otherwise.
    expect(active).toContain('fitPage');
    expect(active).toContain('toggleLeft');
    expect(active).toContain('toggleRight');
    expect(active).toContain('toggleStatus');
    expect(active).not.toContain('viewSingle');
  });

  it('follows a changed setting', () => {
    const active = activeCommands({ ...DEFAULT_SETTINGS, pageMode: 'paged', twoColumns: true, leftPanel: 'none' }, null);
    expect(active).toContain('viewDouble');
    expect(active).not.toContain('viewSingle');
    expect(active).not.toContain('viewContinuous');
    expect(active).not.toContain('toggleLeft');
  });

  it('marks a column count only while one page is showing', () => {
    const one = activeCommands({ ...DEFAULT_SETTINGS, viewLayout: 'single', columns: 2 }, { reflowable: true });
    expect(one).toContain('columns2');
    expect(one).not.toContain('columns1');
    const facing = activeCommands({ ...DEFAULT_SETTINGS, viewLayout: 'double', columns: 2 }, { reflowable: true });
    expect(facing).not.toContain('columns1');
    expect(facing).not.toContain('columns2');
    const run = activeCommands({ ...DEFAULT_SETTINGS, viewLayout: 'continuous', columns: 2 }, { reflowable: true });
    expect(run).not.toContain('columns1');
    expect(run).not.toContain('columns2');
  });
});

describe('the page-turn effect as a list', () => {
  it('offers the three effects on their own', () => {
    const rows = menuRows('turn', { hasBook: true, onePage: true, active: ['turnSlide'] });
    expect(rows.map((r) => r.id)).toEqual(['turnNone', 'turnSlide', 'turnFlip']);
  });

  it('marks the one that is on, so the list says which it is', () => {
    const rows = menuRows('turn', { hasBook: true, onePage: true, active: ['turnFlip'] });
    expect(rows.find((r) => r.id === 'turnFlip').checked).toBe(true);
    expect(rows.find((r) => r.id === 'turnNone').checked).toBe(false);
  });

  it('greys them all where there is no page to turn', () => {
    const rows = menuRows('turn', { hasBook: true, onePage: false, active: [] });
    expect(rows.every((r) => r.disabled)).toBe(true);
  });

  it('is one of the menus the app knows about', () => {
    expect(MENU_IDS).toContain('turn');
  });
});
