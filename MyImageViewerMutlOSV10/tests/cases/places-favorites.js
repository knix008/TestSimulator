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

    test('Explorer keeps its tree as the first tab, then Home, Recent and Favorites', () => {
      const tabs = html.slice(html.indexOf('id="tree-tabs"'), html.indexOf('id="tree-path-bar"'));
      const order = ['explorer', 'home', 'recent', 'favorites'].map((t) => tabs.indexOf(`data-tree-tab="${t}"`));
      assert(order.every((i) => i > 0) && order.every((v, i) => i === 0 || order[i - 1] < v), 'tab order');
      assertIncludes(html, 'id="places-view"', 'shared list view');
      assertIncludes(app, "const TREE_TABS = ['explorer', 'home', 'recent', 'favorites'];", 'tab list');
      assertIncludes(app, "_setTreeTab(TREE_TABS.includes(saved) ? saved : 'explorer')", 'explorer is the default');
      for (const lang of [ko, en]) assert(lang['tree.tab.home'] && lang['places.openInExplorer'] && lang['places.homeUp'], 'labels');
    });

    test('Home tab browses the home folder: folders step in, files open, never above home', () => {
      assertIncludes(app, 'window.electronAPI.getHomeDir()', 'asks the host for home');
      assertIncludes(app, "if (row.dataset.section.startsWith('home-') && row.dataset.kind === 'dir') {", 'a folder row steps in');
      assertIncludes(app, "if (_treeTab === 'home') frag.appendChild(_homeNavBar());", 'up / home / show-in-Explorer bar');
      assertIncludes(app, "_treeTab === 'home' && (e.key === 'Backspace'", 'Backspace goes up');
      assertIncludes(app, 'FormatSupport.isSupportedFile(e.name)', 'only files the viewer opens');
      assertIncludes(app, "!String(e.name).startsWith('.')", 'hidden dot entries left out');
      assertIncludes(app, '?.remove?.(row.dataset.path)', 'Delete on a Home row is a no-op, not a crash');
      assertIncludes(css, '.pv-homebar {', 'bar styled');
    });

    test('Left panel: 340 px default, 304 px minimum (the four tabs in English, the wider language), up to 600', () => {
      const rule = css.slice(css.indexOf('#sidebar {'), css.indexOf('#sidebar {') + 200);
      assertIncludes(rule, 'width: 340px;', 'default');
      assertIncludes(rule, 'min-width: 304px;', 'minimum');
      assertIncludes(rule, 'max-width: 600px;', 'maximum');
      const tab = css.slice(css.indexOf('.tree-tab {'), css.indexOf('.tree-tab {') + 300);
      assertIncludes(tab, 'flex: 0 0 auto;', 'tabs keep their own width (no stretched gaps)');
      assertIncludes(tab, 'padding: 0 6px;', 'tight padding');
      const fn = app.slice(app.indexOf('function _initSidebarResize'), app.indexOf('function _initVerticalResize'));
      assertIncludes(fn, 'const MIN_W = 304;', 'drag minimum');
      assertIncludes(fn, 'const MAX_W = 600;', 'drag maximum');
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

    test('Start screen shows recent files, recent folders and favorites, stacked (no tabs)', () => {
      assertIncludes(app, "card('recent', 'recent', I18n.t('home.places'), recentHost)", 'card');
      for (const k of ['home.recentFiles', 'home.recentFolders']) assertIncludes(app, `t('${k}')`, k);
      assertIncludes(app, "entries: () => _favorites.map(", 'favorites list');
      const fn = app.slice(app.indexOf('function _homePlaces()'), app.indexOf('function _renderHomeBody'));
      assert(!fn.includes('TabStrip') && !fn.includes("role', 'tab'"), 'no tabs');
      assertIncludes(fn, "head.className = 'start-sub';", 'a heading per list');
      assertIncludes(fn, '.slice(0, HOME_PLACES_MAX)', 'kept short');
      assertIncludes(css, '.start-link {', 'rows styled');
    });

    test('Every places / favorites string exists in both languages', () => {
      const keys = [...app.matchAll(/t\('((?:places|tree\.tab|home\.tab|context\.(?:add|remove)Favorite)[\w.]*)'\)/g)].map((m) => m[1]);
      assert(keys.length > 10, 'found the keys');
      for (const k of new Set(keys)) assert(ko[k] && en[k], `missing ${k}`);
    });

    test('Every popup × turns red under the mouse (like the main window close)', () => {
      assertIncludes(css, '.dialog-close-btn:hover,\r\n.dialog-close-btn:focus-visible { background: #e81123; color: #fff; opacity: 1; }', 'red hover');
      assert(!/\.dialog-close-btn:hover\s*\{[^}]*--btn-hover/.test(css), 'no grey hover left');
      const closeBtns = (html.match(/class="dialog-close-btn"/g) || []).length;
      assert(closeBtns >= 15, `all dialogs use .dialog-close-btn (${closeBtns})`);
    });

    test('Keyboard Shortcuts fits without a scroll bar: two columns, its window sized to the content', () => {
      assertIncludes(html, '<div class="dialog-box shortcuts-dialog-box">', 'own box class');
      assertIncludes(css, '.shortcuts-table tbody {\r\n  columns: 2;', 'two columns');
      assertIncludes(css, 'max-height: calc(100vh - 24px);', 'in-page dialogs never taller than the window');
      assertIncludes(css, '.dialog-box > .dialog-body { overflow-y: auto; }', 'a dialog that cannot fit scrolls instead of losing its title row');
      // Dialog windows: measured at the natural size (no in-page cap, no flex shrink, no
      // opening animation), and _size ignores the window's own 100vh while it is first sized
      assertIncludes(dialogWindow, "box.style.flexShrink = '0';", 'no flex shrink');
      assertIncludes(dialogWindow, "box.style.animation = 'none';", 'no animation scale');
      assertIncludes(dialogWindow, "box.style.setProperty('max-height', 'none', 'important');", 'natural height in _size');
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
