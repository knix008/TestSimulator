// The command catalogue and the menus built from it.
//
// A menu is data, never markup: the toolbar hands the menu's id to the main
// process, which shows it in its own always-on-top window (see
// electron/childwindows.js). That window renders these rows — one per line, in a
// single column, each with an icon and a label — and sends back the id of the
// row that was clicked. Because the popup is a real window it can be taller and
// wider than the application itself, which is the whole point of doing it this
// way rather than with an in-page dropdown.

import { themeGroups } from './themes.js';
import { effectiveZoomMode, textColumnsOf, viewLayoutOf } from './view.js';

export const RECENT_PREFIX = 'recent:';
export const RECENT_FORGET_PREFIX = 'recent-forget:';
export const THEME_PREFIX = 'theme:';
export const BOOKMARK_PREFIX = 'bookmark:';

/**
 * Every command the app can run.
 *
 * `needs` gates a row: 'book' rows are disabled with no book open, 'text' rows
 * need a text selection, 'reflow' rows only apply to reflowable formats and
 * 'fixed' rows only to PDFs and comics.
 */
export const COMMANDS = [
  // ── File ──
  { id: 'openFolder', label: 'cmd.openFolder', icon: 'folderOpen', menu: 'file' },
  { id: 'open', label: 'cmd.open', icon: 'open', key: 'Ctrl+O', menu: 'file' },
  { id: 'openUrl', label: 'cmd.openUrl', icon: 'url', menu: 'file' },
  { id: 'closeBook', label: 'cmd.closeBook', icon: 'close', key: 'Ctrl+W', menu: 'file', needs: 'book' },
  { id: 'saveLibrary', label: 'cmd.saveLibrary', icon: 'save', key: 'Ctrl+S', menu: 'file', needs: 'book' },
  { id: 'saveLibraryAs', label: 'cmd.saveLibraryAs', icon: 'saveAs', menu: 'file', needs: 'book' },
  { id: 'exportText', label: 'cmd.exportText', icon: 'export', menu: 'file', needs: 'book' },
  { id: 'exportHtml', label: 'cmd.exportHtml', icon: 'export', menu: 'file', needs: 'book' },
  { id: 'print', label: 'cmd.print', icon: 'print', key: 'Ctrl+P', menu: 'file', needs: 'book' },
  { id: 'properties', label: 'cmd.properties', icon: 'info', menu: 'file', needs: 'book' },

  // ── Reading ──
  { id: 'prevSection', label: 'cmd.prevSection', icon: 'prev', key: 'PageUp', menu: 'reading', needs: 'book' },
  { id: 'nextSection', label: 'cmd.nextSection', icon: 'next', key: 'PageDown', menu: 'reading', needs: 'book' },
  { id: 'firstSection', label: 'cmd.firstSection', icon: 'first', key: 'Ctrl+Home', menu: 'reading', needs: 'book' },
  { id: 'lastSection', label: 'cmd.lastSection', icon: 'last', key: 'Ctrl+End', menu: 'reading', needs: 'book' },
  // Still dispatched by older controls. The three view buttons are the way a
  // reader chooses now, and only one of them can be on.
  { id: 'modeScroll', label: 'cmd.modeScroll', icon: 'scroll' },
  { id: 'modePaged', label: 'cmd.modePaged', icon: 'paged' },
  { id: 'twoColumns', label: 'cmd.twoColumns', icon: 'columns' },
  { id: 'textBigger', label: 'cmd.textBigger', icon: 'textBigger', key: 'Ctrl++', menu: 'reading', needs: 'reflow' },
  { id: 'textSmaller', label: 'cmd.textSmaller', icon: 'textSmaller', key: 'Ctrl+-', menu: 'reading', needs: 'reflow' },
  { id: 'textReset', label: 'cmd.textReset', icon: 'actual', key: 'Ctrl+0', menu: 'reading', needs: 'reflow' },
  // A turn effect needs a page that goes away. Read as one continuous thing
  // there is none, so these are offered only when the book comes a screen at a
  // time — one page, or two facing pages.
  { id: 'turnNone', label: 'cmd.turnNone', icon: 'pageTurn', menu: 'reading', needs: 'onePage', toggle: true },
  { id: 'turnSlide', label: 'cmd.turnSlide', icon: 'pageTurn', menu: 'reading', needs: 'onePage', toggle: true },
  { id: 'turnFlip', label: 'cmd.turnFlip', icon: 'pageTurn', menu: 'reading', needs: 'onePage', toggle: true },
  { id: 'justify', label: 'cmd.justify', icon: 'text', menu: 'reading', needs: 'reflow', toggle: true },
  // Text columns belong to one page. Two facing pages are not a 다단 split, and
  // a PDF page does not reflow, so these stay off in both of those.
  { id: 'columns1', label: 'cmd.columns1', icon: 'columns', menu: 'reading', needs: 'reflow', toggle: true },
  { id: 'columns2', label: 'cmd.columns2', icon: 'columns', menu: 'reading', needs: 'reflow', toggle: true },

  // ── View ──
  { id: 'viewSingle', label: 'cmd.viewSingle', icon: 'onePage', menu: 'view', needs: 'book', toggle: true },
  { id: 'viewDouble', label: 'cmd.viewDouble', icon: 'twoPages', menu: 'view', needs: 'book', toggle: true },
  { id: 'viewContinuous', label: 'cmd.viewContinuous', icon: 'scroll', menu: 'view', needs: 'book', toggle: true },
  { id: 'zoomIn', label: 'cmd.zoomIn', icon: 'zoomIn', key: 'Ctrl++', menu: 'view', needs: 'fixed' },
  { id: 'zoomOut', label: 'cmd.zoomOut', icon: 'zoomOut', key: 'Ctrl+-', menu: 'view', needs: 'fixed' },
  // A PDF or a picture can be fitted by width, height or the whole window.
  // An ebook is always the window, so these are not offered for one.
  { id: 'fitWidth', label: 'cmd.fitWidth', icon: 'fitWidth', menu: 'view', needs: 'fixed', toggle: true },
  { id: 'fitPage', label: 'cmd.fitPage', icon: 'fitPage', menu: 'view', needs: 'fixed', toggle: true },
  { id: 'fitHeight', label: 'cmd.fitHeight', icon: 'fitHeight', menu: 'view', needs: 'fixed', toggle: true },
  { id: 'actualSize', label: 'cmd.actualSize', icon: 'actual', key: 'Ctrl+0', menu: 'view', needs: 'fixed', toggle: true },
  { id: 'spreadSingle', label: 'cmd.spreadSingle', icon: 'onePage' },
  { id: 'spreadDouble', label: 'cmd.spreadDouble', icon: 'twoPages' },
  { id: 'rotateLeft', label: 'cmd.rotateLeft', icon: 'rotateLeft', menu: 'view', needs: 'fixed' },
  { id: 'rotateRight', label: 'cmd.rotateRight', icon: 'rotateRight', menu: 'view', needs: 'fixed' },
  { id: 'invertPages', label: 'cmd.invertPages', icon: 'invert', menu: 'view', toggle: true },
  { id: 'gallery', label: 'cmd.gallery', icon: 'library', key: 'Ctrl+Shift+G', menu: 'view', toggle: true },
  { id: 'galleryIcons', label: 'cmd.galleryIcons', icon: 'cover', menu: 'view', toggle: true },
  { id: 'galleryDetails', label: 'cmd.galleryDetails', icon: 'contents', menu: 'view', toggle: true },
  { id: 'toggleLeft', label: 'cmd.toggleLeft', icon: 'panelLeft', key: 'F9', menu: 'view', toggle: true },
  { id: 'toggleRight', label: 'cmd.toggleRight', icon: 'panelRight', key: 'F10', menu: 'view', toggle: true },
  { id: 'toggleMenuBar', label: 'cmd.toggleMenuBar', icon: 'layout', menu: 'view', toggle: true },
  { id: 'toggleStatus', label: 'cmd.toggleStatus', icon: 'layout', menu: 'view', toggle: true },
  { id: 'toolbarLabels', label: 'cmd.toolbarLabels', icon: 'text', menu: 'view', toggle: true },
  { id: 'background', label: 'cmd.background', icon: 'image', menu: 'view' },
  { id: 'clearBackground', label: 'cmd.clearBackground', icon: 'trash', menu: 'view' },

  // ── Marks ──
  { id: 'addBookmark', label: 'cmd.addBookmark', icon: 'bookmarkAdd', key: 'Ctrl+B', menu: 'marks', needs: 'book' },

  // ── Only where a place on the page is being pointed at ──
  // A bookmark at *this* spot needs a spot, which only a right click has. It
  // would be a command with no argument anywhere else, so it is offered nowhere
  // else — the Marks menu keeps the one that bookmarks where the reader is.
  { id: 'bookmarkHere', label: 'cmd.bookmarkHere', icon: 'bookmarkAdd', menu: 'context', needs: 'book' },
  // What a drag over the page does. Exactly one of the three is on.
  { id: 'selectText', label: 'cmd.selectText', icon: 'selectText', menu: 'marks', toggle: true },
  { id: 'selectImage', label: 'cmd.selectImage', icon: 'selectImage', menu: 'marks', needs: 'book', toggle: true },
  { id: 'selectRegion', label: 'cmd.selectRegion', icon: 'selectRegion', needs: 'fixed', menu: 'marks', toggle: true },
  { id: 'highlight', label: 'cmd.highlight', icon: 'highlight', key: 'Ctrl+H', menu: 'marks', needs: 'text' },
  { id: 'addNote', label: 'cmd.addNote', icon: 'note', menu: 'marks', needs: 'book' },
  { id: 'copySelection', label: 'cmd.copySelection', icon: 'copy', key: 'Ctrl+C', menu: 'marks', needs: 'text' },
  { id: 'copyImage', label: 'cmd.copyImage', icon: 'image', key: 'Ctrl+Shift+C', menu: 'marks', needs: 'image' },
  { id: 'copyRegion', label: 'cmd.copyRegion', icon: 'selectRegion', menu: 'marks', needs: 'region' },
  { id: 'copySection', label: 'cmd.copySection', icon: 'copy', menu: 'marks', needs: 'book' },
  { id: 'selectAll', label: 'cmd.selectAll', icon: 'selectAll', key: 'Ctrl+A', menu: 'marks', needs: 'book' },
  { id: 'paste', label: 'cmd.paste', icon: 'paste', key: 'Ctrl+V', menu: 'marks' },
  { id: 'find', label: 'cmd.find', icon: 'search', key: 'Ctrl+F', menu: 'marks', needs: 'book' },
  { id: 'undo', label: 'cmd.undo', icon: 'undo', key: 'Ctrl+Z', menu: 'marks' },
  { id: 'redo', label: 'cmd.redo', icon: 'redo', key: 'Ctrl+Y', menu: 'marks' },

  // ── App ──
  { id: 'settings', label: 'cmd.settings', icon: 'settings', menu: 'app' },
  { id: 'shortcuts', label: 'cmd.shortcuts', icon: 'keyboard', menu: 'app' },
  { id: 'language', label: 'cmd.language', icon: 'check', menu: 'app' },
  { id: 'about', label: 'cmd.about', icon: 'info', menu: 'app' },
];

export const MENU_IDS = ['file', 'reading', 'view', 'marks', 'app', 'context', 'theme', 'recent', 'bookmarks', 'turn'];

/** The page-turn effects, which are a list to choose from rather than a cycle. */
export const TURN_COMMANDS = ['turnNone', 'turnSlide', 'turnFlip'];

/**
 * The right-click menu, as an explicit list.
 *
 * It used to be the whole Marks menu with the Reading, View and App menus
 * piled on after it, which meant most of the toolbar appeared again in a menu
 * opened an inch below the buttons themselves — and the few commands that live
 * nowhere else were buried in the middle of it. So this is the short list of
 * things done *to what is under the pointer*, and nothing that is already a
 * button on the row above.
 *
 * `highlight` and `copyImage` are the two commands here that are also on the
 * toolbar, and deliberately: painting a selection and copying the picture
 * under the pointer are exactly what a reader right-clicks to do.
 *
 * `-` is a separator.
 */
export const CONTEXT_COMMANDS = [
  'highlight', 'addNote',
  '-',
  'copySelection', 'copyImage', 'copyRegion', 'copySection', 'selectAll', 'paste',
  '-',
  'bookmarkHere', 'addBookmark',
  '-',
  'find',
];

export function commandById(id) {
  return COMMANDS.find((c) => c.id === id) || null;
}

export function commandsInMenu(menu) {
  return COMMANDS.filter((c) => c.menu === menu);
}

/** The keyboard shortcut list shown by the Shortcuts dialog. */
export function shortcutRows() {
  return COMMANDS.filter((c) => c.key).map((c) => ({ id: c.id, label: c.label, key: c.key }));
}

/**
 * The rows of one menu, ready to render.
 *
 * `state` carries what the rows need to know: whether a book is open, what is
 * selected, which toggles are on, the recent files and the bookmarks.
 */
export function menuRows(menu, state = {}) {
  const {
    hasBook = false, hasSelection = false, reflowable = true, hasImage = false, hasRegion = false,
    onePage = false, layout = 'continuous',
    active = [], recentFiles = [], bookmarks = [], canUndo = false, canRedo = false,
  } = state;

  const disabled = (command) => {
    if (command.id === 'undo') return !canUndo;
    if (command.id === 'redo') return !canRedo;
    switch (command.needs) {
      case 'book':
        if (!hasBook) return true;
        return false;
      case 'text': return !hasSelection;
      case 'image': return !hasImage;
      case 'region': return !hasRegion;
      case 'reflow':
        if (!hasBook || !reflowable) return true;
        // 다단 is one page split into columns. Two facing pages and a continuous
        // run do not take it.
        if ((command.id === 'columns1' || command.id === 'columns2' || command.id === 'twoColumns') && layout !== 'single') return true;
        return false;
      case 'fixed':
        if (!hasBook || reflowable) return true;
        // One page of a picture always fills the window. Width and height are
        // the other layouts' fit.
        if ((command.id === 'fitWidth' || command.id === 'fitHeight') && layout === 'single') return true;
        return false;
      case 'onePage': return !hasBook || !onePage;
      default: return false;
    }
  };

  if (menu === 'recent') return recentRows(recentFiles);
  if (menu === 'bookmarks') return bookmarkRows(bookmarks);

  const rowFor = (command) => ({
    id: command.id,
    label: command.label,
    icon: command.icon,
    key: command.key || '',
    disabled: disabled(command),
    checked: active.includes(command.id),
  });

  // The right-click menu is its own short list — see CONTEXT_COMMANDS.
  if (menu === 'context') {
    return CONTEXT_COMMANDS
      .map((id) => (id === '-' ? { separator: true } : commandById(id)))
      .filter(Boolean)
      .map((entry) => (entry.separator ? entry : rowFor(entry)));
  }

  // The turn menu is the three effects on their own, so that one can be picked
  // rather than cycled round to.
  const source = menu === 'turn'
    ? TURN_COMMANDS.map(commandById).filter(Boolean)
    : commandsInMenu(menu);
  const rows = source.map(rowFor);

  if (menu === 'file') {
    return [
      ...rows,
      ...(recentFiles.length
        ? [{ separator: true }, { section: 'recent.title' }, ...recentRows(recentFiles)]
        : [{ separator: true }, { section: 'recent.title' }, { empty: 'recent.empty' }]),
    ];
  }

  return rows;
}

/** Recent files: one row each, with a "forget this one" button. */
export function recentRows(recentFiles) {
  return (recentFiles || []).map((file) => ({
    id: `${RECENT_PREFIX}${file.path || file.name}`,
    text: file.name || file.path,
    // The folder is the tooltip, not a second column. A column beside the name
    // takes its room, and a name that has been cut in half no longer says which
    // book it is — whereas the folder is only wanted when two books share a
    // name, which is exactly when the reader hovers to ask.
    tip: file.path || file.name,
    icon: 'recent',
    forget: `${RECENT_FORGET_PREFIX}${file.path || file.name}`,
  }));
}

export function bookmarkRows(bookmarks) {
  return (bookmarks || []).map((mark) => ({
    id: `${BOOKMARK_PREFIX}${mark.id}`,
    text: mark.label || '—',
    detail: `${(mark.section ?? 0) + 1}`,
    icon: 'bookmark',
  }));
}

/** The theme picker, as menu rows — the swatches are drawn from `bars`. */
export function themeRows(themes, current) {
  const rows = [];
  for (const group of themeGroups(themes || [])) {
    if (!group.themes.length) continue;
    if (rows.length) rows.push({ separator: true });
    rows.push({ section: `settings.themeFamily.${group.kind}` });
    for (const theme of group.themes) {
      rows.push({
        id: `${THEME_PREFIX}${theme.id}`,
        text: theme.id,
        icon: 'theme',
        bars: theme.bars,
        checked: theme.id === current,
      });
    }
  }
  return rows;
}

/** Splits a chosen row id back into its kind and payload. */
export function parseChoice(id) {
  const value = String(id || '');
  if (value.startsWith(RECENT_FORGET_PREFIX)) return { kind: 'recent-forget', value: value.slice(RECENT_FORGET_PREFIX.length) };
  if (value.startsWith(RECENT_PREFIX)) return { kind: 'recent', value: value.slice(RECENT_PREFIX.length) };
  if (value.startsWith(THEME_PREFIX)) return { kind: 'theme', value: value.slice(THEME_PREFIX.length) };
  if (value.startsWith(BOOKMARK_PREFIX)) return { kind: 'bookmark', value: value.slice(BOOKMARK_PREFIX.length) };
  return { kind: 'command', value };
}

/** Which toggle commands are currently on, from the settings. */
export function activeCommands(settings, book) {
  const on = [];
  // Exactly one layout. The older flags are written together with it, so a
  // two-page spread and a continuous run cannot both be ticked.
  const layout = viewLayoutOf(settings, book);
  if (layout === 'single') on.push('viewSingle');
  if (layout === 'double') on.push('viewDouble');
  if (layout === 'continuous') on.push('viewContinuous');
  // 다단 is a choice about one page. Two facing pages and a continuous run
  // are not in a column mode, so neither count is the one that is on.
  if (layout === 'single') on.push(textColumnsOf(settings) === 2 ? 'columns2' : 'columns1');
  if (settings.justify) on.push('justify');
  if (settings.pageTurn === 'none') on.push('turnNone');
  if (settings.pageTurn === 'slide') on.push('turnSlide');
  if (settings.pageTurn === 'flip') on.push('turnFlip');
  const zoomMode = effectiveZoomMode(settings, layout);
  if (zoomMode === 'fit-width') on.push('fitWidth');
  if (zoomMode === 'fit-page') on.push('fitPage');
  if (zoomMode === 'fit-height') on.push('fitHeight');
  if (zoomMode === 'actual') on.push('actualSize');
  const mode = settings.selectMode || 'text';
  if (mode === 'text') on.push('selectText');
  if (mode === 'picture') on.push('selectImage');
  if (mode === 'region') on.push('selectRegion');
  if (settings.invertPages) on.push('invertPages');
  if (settings.leftPanel !== 'none') on.push('toggleLeft');
  if (settings.rightPanel !== 'none') on.push('toggleRight');
  if (settings.showMenuBar) on.push('toggleMenuBar');
  if (settings.showStatusBar) on.push('toggleStatus');
  if (settings.showToolbarLabels) on.push('toolbarLabels');
  if (settings.galleryView === 'details') on.push('galleryDetails');
  else on.push('galleryIcons');
  return on;
}
