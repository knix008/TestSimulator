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
      assertIncludes(app, 'function _showFilmstripFor', 'sheet becomes a filmstrip');
      assertIncludes(app, 'Browse.setFilmstrip(true)', 'filmstrip on');
      assertIncludes(app, 'Always convert the covering contact sheet into a bottom filmstrip', 'open ends in filmstrip');
    });

    /* ── Browse toolbar: size stepper ── */

    test('Toolbar has smaller / slider / current / larger controls', () => {
      assertIncludes(browse, 'id="browse-size-dec"', 'decrease');
      assertIncludes(browse, 'id="browse-size-slider"', 'slider');
      assertIncludes(browse, 'id="browse-size-val"', 'current size');
      assertIncludes(browse, 'id="browse-size-inc"', 'increase');
      assertIncludes(css, '.browse-zoom', 'stepper css');
      assertIncludes(css, '.browse-size-val', 'value css');
      assertIncludes(css, '.browse-size-slider', 'slider css');
      assertIncludes(css, '.browse-size-slider::-webkit-slider-thumb', 'slider thumb');
    });

    test('The slider sets any size between the two ends, and stays in step', () => {
      // Bounds come from the ladder, so the slider can never leave its range.
      assertIncludes(browse, 'min="${MIN_SIZE}" max="${MAX_SIZE}"', 'bounded by the ladder ends');
      assertIncludes(browse, "slider.addEventListener('input', () => setSize(slider.value))", 'live while dragging');
      assertIncludes(browse, "slider.addEventListener('dblclick', () => setSize(DEFAULT_SIZE))", 'double-click resets');
      // A button, Ctrl+wheel or a reset has to move the slider too.
      const sync = browse.slice(browse.indexOf('function _syncSizeChrome'), browse.indexOf('function _syncChrome'));
      assertIncludes(sync, 'slider.value = String(_view.size)', 'slider follows the size');
      // Dragging must not hammer localStorage, and must not re-render tiles.
      assertIncludes(browse, 'function _queueSaveView', 'debounced save');
      const set = browse.slice(browse.indexOf('function setSize'), browse.indexOf('function _syncSizeChrome'));
      assertIncludes(set, '_applySizeVar();', 'resize is a CSS variable');
      assertIncludes(set, '_queueSaveView();', 'save is debounced');
      assert(!/_render\(\)/.test(set), 'no re-render per pixel');
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
      assertIncludes(app, '} else if (_browseMode && (!Browse.isVisible?.() || Browse.isFilmstrip?.())) {', 'reopen branch');
    });

    /* ── Selecting in the sheet fills the info panel ── */

    test('Selecting a thumbnail previews it in the File Info panel', () => {
      assertIncludes(browse, 'onSelect', 'browse takes an onSelect');
      assertIncludes(browse, '_onSelect(entry && !entry.isDirectory ? entry.path : \'\')', 'files only');
      assertIncludes(app, 'onSelect: (p) => _previewFileInfo(p)', 'app wires it');
      assertIncludes(app, 'function _previewFileInfo', 'preview helper');
      assertIncludes(app, 'let target = filePath || null', 'selection drives the panel');
      assertIncludes(app, 'function _clearSelectionPanels', 'empty selection clears panels');
      assertIncludes(app, '_previewFileInfo(state.currentFile)', 'file view refreshes the panel');
      assertIncludes(app, 'if (!_layout.left) _toggleLeftPanel(true)', 'File Info panel opens on select');
      assertIncludes(app, 'function _panelSelectionPath', 'shared selection for info + histogram');
      assert(!app.includes('if (!_layout.left) return;'), 'a collapsed panel still receives the update');
    });

    test('Redraws do not fire the selection callback', () => {
      const render = browse.slice(browse.indexOf('function _render()'), browse.indexOf('function _syncCount()'));
      assertIncludes(render, '_paintSelection();', 'render repaints the selection');
      assert(!/_notify\(\)|_onSelect\(/.test(render), 'render is silent');
      assertIncludes(browse, 'function _select(path, { notify = true } = {})', 'opt-out parameter');
    });

    test('Thumbnail view selects many: Ctrl / Shift click, marquee drag, Ctrl+A', () => {
      const click = browse.slice(browse.indexOf("_grid.addEventListener('click'"), browse.indexOf("_grid.addEventListener('dblclick'"));
      assertIncludes(click, "_selectRange(_anchor || p, p, { add });", 'Shift = range from the anchor');
      assertIncludes(click, '_toggle(p);', 'Ctrl = toggle');
      assertIncludes(click, 'if (_suppressClick)', 'the click ending a drag is ignored');
      assertIncludes(browse, "drag.box.className = 'browse-marquee';", 'marquee box');
      assertIncludes(browse, 'if (Math.hypot(p.x - drag.x0, p.y - drag.y0) < 5) return;', 'small moves stay clicks');
      assertIncludes(browse, "if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A'))", 'Ctrl+A');
      assertIncludes(css, '.browse-marquee {', 'marquee styled');
      // The context menu acts on the whole selection
      assertIncludes(browse, "if (!_sel.has(_norm(tile.dataset.path))) _select(tile.dataset.path);", 'right-click inside keeps the selection');
      assertIncludes(browse, '_onContextMenu(entry, e.clientX, e.clientY, getSelectedPaths());', 'selection handed over');
      assertIncludes(app, 'onContextMenu: (entry, x, y, paths) => _showTreeContextMenu(entry, x, y, { paths }),', 'app passes it on');
      assertIncludes(app, 'const multiPaths = fromBrowse ? paths : FileTree.getSelectedPaths();', 'menu uses it');
      assertIncludes(app, 'if (Browse.isVisible?.()) Browse.refresh();', 'sheet follows disk changes');
    });

    test('Previewing another file leaves the open file’s metadata alone', () => {
      assertIncludes(app, 'const isOpenFile =', 'live A/V metrics are gated');
      assertIncludes(app, 'if (meta && isOpenFile) {', 'overlay only for the open file');
      assertIncludes(app, 'metaForFile: state.metaForFile', 'caches restored after a preview');
    });

    /* ── Toolbar order ── */

    test('Edit sits after the right-panel button, behind a separator', () => {
      const bar = app.slice(app.indexOf("id:'btn-browse'"), app.indexOf('{ spacer: true }'));
      const iInfo = bar.indexOf("id:'btn-panel-right'");
      const iSep = bar.indexOf('{ separator: true }', iInfo);
      const iEdit = bar.indexOf("id:'btn-edit'");
      assert(iInfo >= 0 && iSep > iInfo && iEdit > iSep,
        `expected info < separator < edit, got ${iInfo}/${iSep}/${iEdit}`);
    });

    test('Thumbnails drag onto an explorer folder: move, Ctrl = copy', () => {
      const tree = src.fileTree;
      // Source: Chromium's own drag with an app payload — not webContents.startDrag,
      // which on Windows holds the main process in the OS drag loop after a drop on
      // our own window until the next click (the move would stall).
      const ds = browse.slice(browse.indexOf("_grid.addEventListener('dragstart'"), browse.indexOf("_grid.addEventListener('dragend'"));
      assertIncludes(ds, 'e.dataTransfer.setData(DRAG_MIME, JSON.stringify(paths));', 'paths in the payload');
      assertIncludes(ds, "e.dataTransfer.effectAllowed = 'copyMove';", 'move allowed');
      assertIncludes(ds, 'if (!_sel.has(_norm(tile.dataset.path))) _select(tile.dataset.path);', 'unselected tile drags alone');
      assert(!ds.includes('startDrag'), 'no native startDrag');
      assertIncludes(browse, "if (e.target.closest?.('.browse-tile[draggable=\"true\"]')) return;", 'a press on a tile is a drag, not a marquee');
      assertIncludes(browse, "const DRAG_MIME   = 'application/x-imageviewer-paths';", 'browse type');
      assertIncludes(tree, "const INTERNAL_MIME = 'application/x-imageviewer-paths';", 'same type in the tree');
      // Target: the tree moves by default (Ctrl = copy) and stays put
      assertIncludes(tree, 'const isMove = internal ? !e.ctrlKey : e.shiftKey;', 'dragover: move unless Ctrl');
      assertIncludes(tree, "await _onInternalDrop({ paths, destDir, mode: e.ctrlKey ? 'copy' : 'move' });", 'drop: move unless Ctrl');
      assertIncludes(app, 'onInternalDrop: ({ paths, destDir, mode }) => _transferPathsInto(paths, destDir, mode),', 'shared transfer path');
      const xfer = app.slice(app.indexOf('async function _transferPathsInto'), app.indexOf('/* ─── File clipboard'));
      assertIncludes(xfer, "Browse.isVisible?.() ? Browse.refresh() : null,", 'sheet refreshes alongside the tree');
    });

    /* ── Thumbnail cache ── */

    test('Thumbnails are cached on disk, one cache per directory', () => {
      const { thumbs, preload } = src;
      // Main process: <userData>/ThumbCache/<sha1(dir)>/index.json + one JPEG per image
      assertIncludes(main, "path.join(app.getPath('userData'), 'ThumbCache')", 'cache root in userData');
      assertIncludes(main, "const folder = path.join(_thumbRoot(), key);", 'one folder per source directory');
      assertIncludes(main, 'st.size === ent.size && Math.abs(st.mtimeMs - ent.mtimeMs) < 1', 'stale entries are not served');
      assertIncludes(main, "app.on('before-quit', _thumbFlushAllSync);", 'pending index writes survive quit');
      for (const ch of ['thumb-cache-load', 'thumb-cache-put', 'thumb-cache-stats', 'thumb-cache-clear']) {
        assertIncludes(main, `ipcMain.handle('${ch}'`, `${ch} handled`);
        assertIncludes(preload, `'${ch}'`, `${ch} exposed`);
      }
      // Renderer: the directory's cache is read before anything is generated
      const req = thumbs.slice(thumbs.indexOf('async function request'), thumbs.indexOf('async function prefetchDir'));
      assert(req.indexOf('await _ensureDir(_dirOf(path));') < req.indexOf('_pending.set(key'), 'disk first');
      assertIncludes(thumbs, '_persist(path, jpeg, meta)', 'generated thumbnails are stored');
    });

    test('Thumbnails are produced in the background', () => {
      const { thumbs } = src;
      const worker = require('fs').readFileSync(require('path').join(__dirname, '../../src/js/thumbWorker.js'), 'utf8');
      assertIncludes(worker, 'createImageBitmap(new Blob([bytes]', 'decode in the worker');
      assertIncludes(worker, 'new OffscreenCanvas(tw, th)', 'resize in the worker');
      assertIncludes(worker, "convertToBlob({ type: 'image/jpeg'", 'encode in the worker');
      assertIncludes(thumbs, "new Worker('./js/thumbWorker.js')", 'worker started from the page');
      assertIncludes(thumbs, 'worker.postMessage({ id, bytes: buf, type: MIME[ext] || \'\', size: SIZE }, [buf]);', 'bytes transferred, not copied');
      // Formats that need the app's decoders wait for an idle UI thread
      const mainPath = thumbs.slice(thumbs.indexOf('async function _generateOnMainThread'), thumbs.indexOf('async function _generate(path)'));
      assertIncludes(mainPath, 'await _idle();', 'idle-time only');
    });

    test('Opening a file blanks the viewer instead of showing the previous image', () => {
      const open = app.slice(app.indexOf('async function _openFile'), app.indexOf('function _prefetchConvertedNeighbors'));
      assert(open.indexOf('_beginViewerSwitch();') > open.indexOf('const openGen = ++_openGen;'), 'blanked once the open starts');
      assertIncludes(open, 'if (openGen === _openGen) _endViewerSwitch();', 'only the newest open reveals');
      assertIncludes(css, '#viewer-container.is-switching > :not(#image-placeholder):not(#loading-overlay)', 'old frame hidden');
    });

    /* ── Panel visibility ── */

    test('Panels honour the hidden attribute', () => {
      // `display: flex` on the panels outranks the UA [hidden] rule.
      for (const sel of ['#sidebar[hidden]', '#file-tree-panel[hidden]', '#info-panel[hidden]']) {
        assertIncludes(css, sel, sel);
      }
      assertIncludes(app, "leftBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleLeftPanel(); });", 'left collapse button');
      assertIncludes(app, "rightBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleRightPanel(); });", 'right collapse button');
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
      'browse.sizeDec', 'browse.sizeInc', 'browse.sizeReset', 'browse.sizeSlider',
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

    /* ── Regressions found running the Tauri build (2026-10-22) ── */

    test('Selection-preview state is declared before _initBrowse() runs (no TDZ at start-up)', () => {
      // _initBrowse → _syncBrowseChrome → _previewFileInfo reads these during init;
      // declared below the call, the throw aborted the rest of app.js start-up.
      const initAt = app.indexOf('\n  _initBrowse();');
      assert(initAt > 0, '_initBrowse() call');
      for (const name of ['_previewInfoTimer', '_histPreviewGen', '_histPreview']) {
        const declAt = app.indexOf(`let ${name} =`);
        assert(declAt > 0 && declAt < initAt, `${name} declared before _initBrowse()`);
      }
    });

    test('Browse.open drops a superseded directory read', () => {
      assertIncludes(browse, 'const gen = ++_openGen;', 'generation taken');
      assertIncludes(browse, 'if (gen !== _openGen) return;', 'stale read dropped');
    });

    test('Re-opening the shown folder keeps the selection (filmstrip prev / next stay live)', () => {
      assertIncludes(browse, 'if (!(keepSelection || sameDir)) {', 'same-folder open keeps selection');
    });

    test('Browse path compare treats / and \\ alike', () => {
      const norm = (p) => String(p || '').replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
      assertIncludes(browse, ".replace(/[\\\\/]+/g, '/')", 'separator folding in _norm');
      assert(norm('D:\\A\\b.jpg') === norm('d:/a/b.jpg'), 'mixed separators match');
      assert(norm('D:\\A\\') === norm('D:\\A'), 'trailing separator ignored');
    });

    test('Filmstrip is built from the open image’s own folder', () => {
      const body = app.slice(app.indexOf('async function _showFilmstripFor('), app.indexOf('async function _openFile('));
      assert(body.indexOf('pathDirname(filePath)') >= 0, 'dirname of the file');
      assert(body.indexOf('pathDirname(filePath)') < body.indexOf('Browse.getDir?.()'), 'dirname wins over the sheet folder');
    });

    test('Opening / previewing a file does not expand a collapsed side panel', () => {
      const openBody = app.slice(app.indexOf('async function _openFile('), app.indexOf('function _revealOpenedImage('));
      const prevBody = app.slice(app.indexOf('function _previewFileInfo('), app.indexOf('function _browseTip('));
      assert(!openBody.includes('_toggleLeftPanel(true)'), '_openFile');
      assert(!prevBody.includes('_toggleLeftPanel(true)'), '_previewFileInfo');
    });

    test('Open Folder in browse mode leaves the filmstrip for the full sheet', () => {
      const body = app.slice(app.indexOf('async function _openFolder('), app.indexOf('function _zoom('));
      assert(body.indexOf('Browse.setFilmstrip?.(false)') >= 0
        && body.indexOf('Browse.setFilmstrip?.(false)') < body.indexOf('Browse.show(dirPath)'), 'strip off before show');
    });

    test('Asset-protocol images are loaded with crossOrigin (canvas stays readable)', () => {
      assertIncludes(h.read('src/js/thumbs.js'), "img.crossOrigin = 'anonymous'", 'thumbnail generator');
      const hist = app.slice(app.indexOf('async function _loadHistPreview('), app.indexOf('function _previewFileInfo('));
      assertIncludes(hist, "img.crossOrigin = 'anonymous'", 'histogram preview');
    });

    test('Desktop host serves the DICOM vendor packages', () => {
      const host = h.read('host/server.js');
      for (const pkg of ['dicom-parser', '@cornerstonejs/codec-openjpeg', '@cornerstonejs/codec-charls',
        '@cornerstonejs/codec-libjpeg-turbo-8bit', '@cornerstonejs/codec-libjpeg-turbo-12bit', 'jpeg-lossless-decoder-js']) {
        assertIncludes(host, `'${pkg}'`, pkg);
      }
      assertIncludes(host, "app.use('/node_modules/' + pkg", 'mounted under /node_modules');
      assertIncludes(h.read('src/js/dicomDecoder.js'), "${window.__MIV_HOST__ || 'http://127.0.0.1:17810'}/node_modules/", 'Tauri vendor base = the host of this copy');
    });
  },
};
