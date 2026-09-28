'use strict';

/** Explorer navigation (Up / breadcrumbs), the browse contact sheet's toolbar
 *  and details columns, and the panel-visibility wiring they depend on. */
module.exports = {
  name: 'Explorer & browse view',
  run({ test, each, src, h }) {
    const { html, css, app, fileTree, browse, main, ko, en } = src;
    const { assert, assertIncludes } = h;

    /* ── Explorer: moving to the parent directory ── */

    test('Path bar carries an Up button and a breadcrumb strip', () => {
      assertIncludes(html, 'id="tree-up-btn"', 'up button markup');
      assertIncludes(html, 'id="tree-crumbs"', 'crumb host markup');
      assertIncludes(css, '.tree-path-btn', 'up button css');
      assertIncludes(css, '.tree-crumb', 'crumb css');
    });

    test('Explorer exposes goUp / navigateTo', () => {
      assertIncludes(fileTree, 'async function goUp()', 'goUp');
      assertIncludes(fileTree, 'async function navigateTo(', 'navigateTo');
      assertIncludes(fileTree, 'goUp, navigateTo', 'both exported');
    });

    test('_parentOf stops at a drive root and at "/"', () => {
      // Mirrors the implementation in fileTree.js so the rules stay pinned.
      const parentOf = (p) => {
        if (!p) return null;
        const trimmed = String(p).replace(/[\\/]+$/, '');
        if (!trimmed) return null;
        if (/^[a-zA-Z]:$/.test(trimmed)) return null;
        const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
        if (idx < 0) return null;
        let parent = trimmed.slice(0, idx);
        if (/^[a-zA-Z]:$/.test(parent)) parent += '\\';
        if (!parent) parent = '/';
        return parent;
      };
      assert(parentOf('D:\\Home\\Photos') === 'D:\\Home', 'nested windows path');
      assert(parentOf('D:\\Home') === 'D:\\', 'up to the drive root');
      assert(parentOf('D:\\') === null, 'drive root has no parent');
      assert(parentOf('/Users/me/pics') === '/Users/me', 'nested posix path');
      assert(parentOf('/Users') === '/', 'up to the posix root');
      assert(parentOf('/') === null, 'posix root has no parent');
      assert(parentOf('') === null, 'empty path');
    });

    test('Backspace and Alt+Up go up in the explorer', () => {
      assertIncludes(fileTree, "e.key === 'Backspace'", 'backspace');
      assertIncludes(fileTree, "e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowUp'", 'alt+up');
    });

    test('Up button is disabled at a root', () => {
      assertIncludes(fileTree, 'upBtn.disabled = !_parentOf(dirPath)', 'disabled state');
    });

    /* ── Explorer: other paths stay visible ── */

    test('Revealing a folder keeps branches opened elsewhere', () => {
      assertIncludes(fileTree, 'for (const a of ancestors) _expandedDirs.add(a)', 'merges instead of replacing');
      assert(!/_expandedDirs = new Set\(ancestors\)/.test(fileTree),
        'revealPath must not reset the expanded set');
    });

    test('Expanded branches are capped so refresh stays cheap', () => {
      assertIncludes(fileTree, 'const MAX_EXPANDED', 'cap constant');
      assertIncludes(fileTree, 'function _pruneExpanded', 'prune');
    });

    test('Folders-only mode is reflected in the refresh signature', () => {
      // Otherwise a browse-mode switch looks like "nothing changed" and files stay listed.
      assertIncludes(fileTree, "Mirror _renderDir's filter", 'documented');
      const walk = fileTree.slice(fileTree.indexOf('async function _walkExpandedPaths'));
      assert(walk.slice(0, 900).includes('_foldersOnly ? entries.filter'),
        '_walkExpandedPaths must apply the folders-only filter');
    });

    /* ── Explorer: double-click shows just that image ── */

    test('Double-clicking a file row activates it', () => {
      assertIncludes(fileTree, "row.addEventListener('dblclick'", 'dblclick handler');
      assertIncludes(fileTree, '_onActivate(entry.path)', 'calls back');
      assertIncludes(app, 'onActivate: (p) =>', 'app wires onActivate');
    });

    test('Opening a file leaves the contact sheet', () => {
      assertIncludes(app, 'if (window.Browse?.isVisible?.()) Browse.hide();', 'hides the sheet');
    });

    /* ── Browse toolbar: size stepper ── */

    test('Toolbar has smaller / current / larger controls', () => {
      assertIncludes(browse, 'id="browse-size-dec"', 'decrease');
      assertIncludes(browse, 'id="browse-size-val"', 'current size');
      assertIncludes(browse, 'id="browse-size-inc"', 'increase');
      assert(!browse.includes('id="browse-size" type="range"'), 'the slider is replaced');
      assertIncludes(css, '.browse-zoom', 'stepper css');
      assertIncludes(css, '.browse-size-val', 'value css');
    });

    test('Size steps through a ladder and clamps at both ends', () => {
      const m = browse.match(/const SIZES = \[([^\]]+)\]/);
      assert(m, 'SIZES ladder');
      const sizes = m[1].split(',').map((s) => Number(s.trim()));
      assert(sizes.length >= 5, `ladder too short: ${sizes.length}`);
      assert(sizes.every((n, i) => i === 0 || n > sizes[i - 1]), 'ladder must ascend');
      const step = (size, dir) => {
        const next = dir > 0 ? sizes.find((s) => s > size) : [...sizes].reverse().find((s) => s < size);
        return next == null ? (dir > 0 ? sizes[sizes.length - 1] : sizes[0]) : next;
      };
      assert(step(sizes[0], -1) === sizes[0], 'clamped at the small end');
      assert(step(sizes[sizes.length - 1], 1) === sizes[sizes.length - 1], 'clamped at the large end');
      assert(step(sizes[0], 1) === sizes[1], 'one step up');
      assert(step(sizes[1], -1) === sizes[0], 'one step down');
    });

    test('Size applies to thumbnails and to list / details rows', () => {
      assertIncludes(browse, "setProperty('--browse-tile'", 'tile var');
      assertIncludes(browse, "setProperty('--browse-row'", 'row var');
      assertIncludes(css, 'width: var(--browse-row, 28px)', 'rows follow the size');
    });

    test('Ctrl+wheel and Ctrl +/- resize the grid', () => {
      assertIncludes(browse, "_grid.addEventListener('wheel'", 'wheel');
      assertIncludes(browse, '_stepSize(e.deltaY < 0 ? 1 : -1)', 'wheel direction');
      assertIncludes(browse, "e.key === '+' || e.key === '='", 'keyboard zoom in');
      assertIncludes(browse, "e.key === '-' || e.key === '_'", 'keyboard zoom out');
    });

    /* ── Browse details mode: the full column set ── */

    const detailCols = ['browse-type', 'browse-size-cell', 'browse-dim', 'browse-date', 'browse-created'];
    each(detailCols, (c) => `Details column .${c} is rendered and styled`, (c) => {
      assertIncludes(browse, c, `${c} cell`);
      assertIncludes(css, `#browse-view[data-mode="details"] .${c}`, `${c} width`);
    });

    test('Details mode has a header row', () => {
      assertIncludes(browse, 'id="browse-head"', 'header markup');
      assertIncludes(css, '.browse-head', 'header css');
      assertIncludes(css, '#browse-view[data-mode="details"] .browse-head', 'details only');
      assert(/\.browse-head \{\s*display: none;/.test(css), 'hidden in the other modes');
    });

    test('Clicking a header sorts by that column', () => {
      assertIncludes(browse, ".browse-col[data-col]", 'sortable cells');
      assertIncludes(browse, 'if (_view.sort === key) _view.desc = !_view.desc;', 'toggles direction');
      assertIncludes(css, '.browse-col.sorted', 'sorted indicator');
    });

    test('Thumbnails keep the terse meta line', () => {
      assertIncludes(css, '#browse-view[data-mode="grid"] .browse-meta .browse-date', 'date hidden in grid');
      assertIncludes(css, '#browse-view[data-mode="grid"] .browse-tile.is-file .browse-type', 'type hidden for files');
    });

    test('Directory listing supplies size, mtime and birthtime', () => {
      assertIncludes(main, 'read-directory-detailed', 'detailed ipc');
      assertIncludes(main, 'row.birthtimeMs = st.birthtimeMs;', 'created time');
      assertIncludes(browse, 'entry.birthtimeMs', 'used by the view');
    });

    /* ── Thumbnail-view toolbar button state ── */

    test('Browse button reflects what is on screen, not just the mode', () => {
      assertIncludes(app, 'function _browseShowing()', 'visibility-aware state');
      assertIncludes(app, "classList.toggle('active', _browseShowing())", 'button follows it');
      assertIncludes(app, 'onVisibility: () => _syncBrowseChrome()', 'app subscribes');
      assertIncludes(browse, 'function _notifyVisibility', 'browse notifies');
      assert(!/toggle\('active', _browseMode\)/.test(app), 'must not key off the raw mode');
    });

    test('Browse button returns to the sheet when an image is open', () => {
      assertIncludes(app, '} else if (_browseMode && !Browse.isVisible?.()) {', 'reopen branch');
    });

    /* ── Selecting in the sheet fills the info panel ── */

    test('Selecting a thumbnail previews it in the File Info panel', () => {
      assertIncludes(browse, 'onSelect', 'browse takes an onSelect');
      assertIncludes(browse, '_onSelect(entry && !entry.isDirectory ? entry.path : \'\')', 'files only');
      assertIncludes(app, 'onSelect: (p) => _previewFileInfo(p)', 'app wires it');
      assertIncludes(app, 'function _previewFileInfo', 'preview helper');
      assertIncludes(app, 'if (!_layout.info) return;', 'skipped when the panel is closed');
    });

    test('Redraws do not fire the selection callback', () => {
      assertIncludes(browse, '_select(_selected, { notify: false })', 'render is silent');
      assertIncludes(browse, 'function _select(path, { notify = true } = {})', 'opt-out parameter');
    });

    test('Previewing another file leaves the open file’s metadata alone', () => {
      assertIncludes(app, 'const isOpenFile =', 'live A/V metrics are gated');
      assertIncludes(app, 'if (meta && isOpenFile) {', 'overlay only for the open file');
      assertIncludes(app, 'metaForFile: state.metaForFile', 'caches restored after a preview');
    });

    /* ── Toolbar order ── */

    test('Edit sits after the file-info button, behind a separator', () => {
      const bar = app.slice(app.indexOf("id:'btn-browse'"), app.indexOf('{ spacer: true }'));
      const iInfo = bar.indexOf("id:'btn-panel-info'");
      const iSep = bar.indexOf('{ separator: true }', iInfo);
      const iEdit = bar.indexOf("id:'btn-edit'");
      assert(iInfo >= 0 && iSep > iInfo && iEdit > iSep,
        `expected info < separator < edit, got ${iInfo}/${iSep}/${iEdit}`);
    });

    /* ── Panel visibility ── */

    test('Panels honour the hidden attribute', () => {
      // `display: flex` on the panels outranks the UA [hidden] rule.
      for (const sel of ['#sidebar[hidden]', '#file-tree-panel[hidden]', '#info-panel[hidden]']) {
        assertIncludes(css, sel, sel);
      }
      assertIncludes(app, 'closeBtn.addEventListener(\'click\', () => _toggleInfoPanel(false))', 'close button');
      assertIncludes(app, 'info.hidden = !_layout.info;', 'layout drives it');
    });

    /* ── Language ── */

    test('Browse and explorer chrome is rebuilt on a language switch', () => {
      assertIncludes(app, 'window.Browse?.applyI18n?.();', 'browse relabelled');
      assertIncludes(app, 'window.FileTree?.applyI18n?.();', 'explorer relabelled');
      assertIncludes(fileTree, 'function applyI18n', 'explorer implements it');
    });

    test('Rebuilding the browse chrome does not stack thumb-ready listeners', () => {
      assertIncludes(browse, 'function _bindThumbReady', 'listener bound once');
      const build = browse.slice(browse.indexOf('function _buildChrome'), browse.indexOf('function _bindThumbReady'));
      assert(!build.includes("window.addEventListener('thumb-ready'"),
        '_buildChrome must not re-register the window listener');
    });

    const newKeys = [
      'tree.up',
      'browse.sizeDec', 'browse.sizeInc', 'browse.sizeReset',
      'browse.colName', 'browse.colType', 'browse.colSize',
      'browse.colDim', 'browse.colModified', 'browse.colCreated',
      'browse.fileType', 'browse.fileNoExt',
    ];
    each(newKeys, (k) => `i18n key ${k} in both locales`, (k) => {
      assert(typeof ko[k] === 'string' && ko[k], `ko missing ${k}`);
      assert(typeof en[k] === 'string' && en[k], `en missing ${k}`);
    });

    test('browse.fileType keeps its {ext} placeholder in both locales', () => {
      assert(ko['browse.fileType'].includes('{ext}'), 'ko placeholder');
      assert(en['browse.fileType'].includes('{ext}'), 'en placeholder');
    });
  },
};
