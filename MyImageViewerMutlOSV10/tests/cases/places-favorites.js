'use strict';

/** Explorer › Recent / Favorites tabs, the start screen's lists, the File menu's
 *  Recent Folders, favorites.db, and the dialog title rows. */
module.exports = {
  name: 'Recent, favorites & dialog chrome',
  run({ test, src, h }) {
    const { html, css, app, main, preload, ko, en, fileTree } = src;
    const { assert, assertIncludes } = h;
    const webApi = h.read('src/js/webAPI.js');
    const dialogWindow = h.read('src/js/dialogWindow.js');
    const shell = h.read('src-tauri/src/main.rs');

    test('Explorer keeps its tree as the first tab, then Recent and Favorites', () => {
      const tabs = html.slice(html.indexOf('id="tree-tabs"'), html.indexOf('id="tree-path-bar"'));
      const order = ['explorer', 'recent', 'favorites'].map((t) => tabs.indexOf(`data-tree-tab="${t}"`));
      assert(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], 'tab order');
      assertIncludes(html, 'id="places-view"', 'shared list view');
      assertIncludes(app, "_setTreeTab(['explorer', 'recent', 'favorites'].includes(saved) ? saved : 'explorer')", 'explorer is the default');
    });

    test('Drive buttons have their own row under the tabs', () => {
      const header = html.slice(html.indexOf('<div id="file-tree-panel">'), html.indexOf('id="tree-tabs"'));
      assert(!header.includes('id="tree-drive-bar"'), 'not in the panel header any more');
      assert(html.indexOf('id="tree-drive-bar"') > html.indexOf('id="tree-tabs"'), 'below the tabs');
      assertIncludes(fileTree, "btn.innerHTML = Icons.drive || '';", 'drive icon on each button');
    });

    test('Recent folders and files keep 10 each; one click opens; Delete only forgets', () => {
      assertIncludes(app, 'const RECENT_DIRS_MAX = 10;', 'folders');
      assertIncludes(app, 'const RECENT_FILES_MAX = 10;', 'files');
      assertIncludes(app, '_selectPlaceRow(row, { open: true });', 'click opens');
      assertIncludes(app, '// Takes the entry off this list — never deletes the file itself', 'Delete key');
      assertIncludes(app, '_showFolderInCenter(path);', 'a folder lists its contents in the centre');
      assertIncludes(app, 'await _openFileRevealed(path);', 'a file is shown');
    });

    test('File menu: Open Folder browses, Recent Folders is its own entry with × and clear-all', () => {
      const menu = app.slice(app.indexOf('function _fileMenuItems'), app.indexOf('async function _recentFolderItems'));
      assertIncludes(menu, "label: t('menu.openFolder'), shortcut: 'Ctrl+Shift+O', action: () => _pickOpenFolder() },", 'no flyout on Open Folder');
      assertIncludes(menu, "label: t('menu.recentFolders'), submenu: () => _recentFolderItems()", 'Recent Folders');
      const items = app.slice(app.indexOf('async function _recentFolderItems'), app.indexOf('function _exportMenuItems'));
      assertIncludes(items, 'remove: {', 'per-row ×');
      assertIncludes(items, '_clearRecentFolderHistory()', 'clear all');
    });

    test('Favorites live in SQLite (favorites.db) on the desktop and IndexedDB on the web', () => {
      assertIncludes(main, 'Connection::open(dir.join("favorites.db"))', 'database file');
      assertIncludes(main, 'key      TEXT    NOT NULL UNIQUE', 'one row per path');
      for (const ch of ['favorites-list', 'favorites-add', 'favorites-remove', 'favorites-clear', 'favorites-remap']) {
        assertIncludes(main, `"${ch}"`, ch);
        assertIncludes(preload, `'${ch}'`, `bridge ${ch}`);
      }
      assertIncludes(webApi, "indexedDB.open(FAV_DB, 1)", 'web store');
      assertIncludes(h.read('src-tauri/Cargo.toml'), 'rusqlite = { version = "0.32", features = ["bundled"] }', 'SQLite compiled in');
    });

    test('Context menus offer Add to / Remove from Favorites', () => {
      assertIncludes(app, "label: t('context.removeFavorite'), action: () => _removeFavorite(p)", 'remove');
      assertIncludes(app, "label: t('context.addFavorite'), action: () => _addFavorites(", 'add');
      assertIncludes(app, '_favoriteMenuItem(entry.path, isDir),', 'explorer / sheet item');
      assertIncludes(app, '_favoriteMenuItemMulti(multiPaths),', 'multi-selection');
      assertIncludes(app, 'hasFile && _favoriteMenuItem(state.currentFile, false),', 'viewer');
    });

    test('Start screen shows recent folders, recent files and favorites', () => {
      assertIncludes(app, "group('recent', 'recent', I18n.t('home.places'), recentHost)", 'group');
      for (const k of ['home.tab.recentFolders', 'home.tab.recentFiles']) assertIncludes(app, `t('${k}')`, k);
      assertIncludes(app, "entries: () => _favorites.map(", 'favorites tab');
    });

    test('Every places / favorites string exists in both languages', () => {
      const keys = [...app.matchAll(/t\('((?:places|tree\.tab|home\.tab|context\.(?:add|remove)Favorite)[\w.]*)'\)/g)].map((m) => m[1]);
      assert(keys.length > 10, 'found the keys');
      for (const k of new Set(keys)) assert(ko[k] && en[k], `missing ${k}`);
    });

    test('Dialog title rows: one height, centred, × at the top right', () => {
      const rule = css.slice(css.indexOf('.dialog-header {'), css.indexOf('.dialog-header:active'));
      assertIncludes(rule, 'min-height: 44px;', 'fixed height');
      assertIncludes(rule, 'align-items: center;', 'centred');
      assert(/\.dialog-close-btn \{\s*flex: none;\s*margin-left: auto;/.test(css), '× pushed right');
      assertIncludes(css, '  padding: 0 !important;', 'the Open dialog keeps no in-page padding in its window');
    });

    test('A dialog window is sized again once shown (no blank band under the buttons)', () => {
      const fit = shell.slice(shell.indexOf('fn fit_dialog'), shell.indexOf('fn fit_dialog') + 2600);
      const show = fit.indexOf('let _ = dialog.show();');
      assert(show > 0 && fit.indexOf('dialog.set_size(tauri::LogicalSize::new(w, h));', show) > show, 'resized after show');
      assert(!dialogWindow.includes('extraH'), 'no page-side guesswork');
    });
  },
};
