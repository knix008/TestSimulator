'use strict';

/** Drive bar, viewer prev/next, settings/shortcuts, toolbar icons. */
module.exports = {
  name: 'Folder drives & viewer chrome',
  run({ test, each, src, h }) {
    const { html, icons, fileTree, css, app, main, fileDialog } = src;
    const { assert, assertIncludes } = h;

    test('Drive buttons live in the folder-view title', () => {
      assertIncludes(html, 'id="tree-drive-bar"', 'drive bar');
      assertIncludes(fileTree, 'listDrives', 'listDrives call');
    });

    test('Viewer menubar swaps Effects for a Window menu', () => {
      const defs = app.slice(app.indexOf('function _menubarDefs'), app.indexOf('function _ewMenubarDefs'));
      assertIncludes(defs, "labelKey: 'menu.window'", 'Window menu');
      assert(!/labelKey: 'menu\.effects'/.test(defs), 'no Effects menu in the viewer');
      assert(!/labelKey: 'menu\.dicom'/.test(defs), 'no DICOM menu either');
      // The edit window keeps Effects — that is where adjustments live.
      const ew = app.slice(app.indexOf('function _ewMenubarDefs'), app.indexOf('function _buildMenubar'));
      assertIncludes(ew, "labelKey: 'menu.effects'", 'edit window keeps Effects');
      // It holds what applies to the whole app: panels, the sheet, the window.
      const fn = app.slice(app.indexOf('function _windowMenuItems'), app.indexOf('function _helpMenuItems'));
      assertIncludes(fn, '_toggleTreePanel()', 'explorer panel');
      assertIncludes(fn, '_toggleInfoPanel()', 'file info panel');
      assertIncludes(fn, '_toggleInfoDock()', 'dock side');
      assertIncludes(fn, '_toggleBrowseMode()', 'contact sheet');
      assertIncludes(fn, 'toggleFullscreen', 'fullscreen');
      assertIncludes(fn, 'windowMinimize', 'minimise');
      assertIncludes(fn, 'windowMaximize', 'maximise');
      // DICOM rows stay in the View menu, where they were.
      const view = app.slice(app.indexOf('function _viewMenuItems'), app.indexOf('function _themeMenuItems'));
      assertIncludes(view, '..._dicomContextItems(),', 'DICOM block back in View');
      assertIncludes(main, "label: t('menu.window')", 'native menu too');
      assert(!/label: t\('menu\.effects'\)/.test(main), 'native Effects menu gone');
      for (const action of ['panel-tree', 'panel-info', 'panel-dock-left', 'panel-dock-right', 'toggle-browse']) {
        assertIncludes(app, `'${action}':`, `${action} handled in the renderer`);
        assertIncludes(main, `'${action}'`, `${action} sent by the native menu`);
      }
    });

    test('File Info dock button shows the side the panel is on', () => {
      const fn = app.slice(app.indexOf('function _applyPanelLayout'), app.indexOf('function _toggleTreePanel'));
      assertIncludes(fn, "Icons[_layout.dock === 'left' ? 'panelLeft' : 'panelRight']", 'icon matches the actual side');
      assertIncludes(fn, 'dockBtn.innerHTML = dockIcon', 'toolbar button');
      assertIncludes(fn, 'dockHdrBtn.innerHTML = dockIcon', 'panel header button');
      // The tooltip still says what a click would do.
      assertIncludes(app, "function _infoDockTip()  { return I18n.t(_layout.dock === 'left' ? 'toolbar.infoDockRight'", 'tooltip is the action');
    });

    test('Print is enabled only while an image is on screen', () => {
      const fn = app.slice(app.indexOf('function _canPrint'), app.indexOf('function _printSource'));
      assertIncludes(fn, 'if (_browseShowing()) return false;', 'not behind the contact sheet');
      assertIncludes(fn, '!state.isVideo && !state.isAudio', 'not for audio / video');
      assertIncludes(app, "set('btn-print', _canPrint());", 'toolbar button uses the same test');
      assertIncludes(app, "_setChromeBtn(document.getElementById('btn-print'), _canPrint());", 'resynced with the sheet');
      assertIncludes(app, 'disabled: !_canPrint()', 'File menu row too');
    });

    test('Switching drives lands on the last folder opened there', () => {
      assertIncludes(app, 'async function _recentDirOnDrive', 'main window helper');
      assertIncludes(app, 'onDriveSelect: async (p) => { _openFolder(await _recentDirOnDrive(p)', 'drive bar uses it');
      assertIncludes(fileDialog, 'async function _recentDirOnDrive', 'file dialog helper');
      assertIncludes(fileDialog, '_goTo(await _recentDirOnDrive(d.path))', 'dialog drive list uses it');
      assertIncludes(fileDialog, "localStorage.getItem('recentOpenedDirs')", 'shares the explorer history');
      const fn = app.slice(app.indexOf('async function _recentDirOnDrive'), app.indexOf('async function _clearRecentFolderHistory'));
      assertIncludes(fn, 'stats.isDirectory', 'skips folders that are gone');
      assertIncludes(fn, 'return drivePath', 'falls back to the drive root');
    });

    test('Main and edit windows have a SE resize grip', () => {
      assertIncludes(html, 'class="win-resize-grip"', 'grip markup');
      assertIncludes(css, '.win-resize-grip', 'grip css');
      assertIncludes(app, 'function _initResizeGrips', 'grip wiring');
    });

    test('Virtual prev/next on the image pane', () => {
      assertIncludes(html, 'id="viewer-nav-prev"', 'prev');
      assertIncludes(html, 'id="viewer-nav-next"', 'next');
    });

    const dialogs = [
      'settings-overlay', 'shortcuts-overlay', 'resize-overlay',
      'about-overlay', 'error-overlay', 'context-menu',
    ];
    each(dialogs, (id) => `Dialog #${id} exists`, (id) => {
      assertIncludes(html, `id="${id}"`, id);
    });

    const iconKeys = [
      'print', 'edit', 'openFile', 'openFolder', 'rotateLeft', 'rotateRight',
      'flipH', 'flipV', 'undo', 'redo', 'settings', 'drive',
    ];
    each(iconKeys, (k) => `Icon ${k} is defined`, (k) => {
      assertIncludes(icons, `${k}:`, k);
    });

    test('Explorer arrow keys open the selected image', () => {
      assertIncludes(fileTree, 'function handleKey', 'tree keyboard');
      assertIncludes(fileTree, 'function _moveBy', 'move selection');
      assertIncludes(fileTree, "e.key === 'ArrowDown'", 'down');
      assertIncludes(fileTree, "e.key === 'ArrowUp'", 'up');
      assertIncludes(fileTree, '_onSelect(path)', 'opens supported file');
      assertIncludes(app, "e.key === 'ArrowUp' || e.key === 'ArrowDown'", 'app wires keys');
      assertIncludes(app, 'FileTree.handleKey', 'wired in app');
    });

    test('Explorer keyboard skips folders and only opens media', () => {
      assertIncludes(fileTree, 'function _isSupportedPath', 'media check');
      assertIncludes(fileTree, 'IMAGE_EXTS.has(ext)', 'images');
      assertIncludes(fileTree, 'VIDEO_EXTS.has(ext)', 'video');
      assertIncludes(fileTree, 'AUDIO_EXTS.has(ext)', 'audio');
      assertIncludes(fileTree, "row.dataset.isDir === '1'", 'folders stay highlight-only');
    });

    test('Drive-bar CSS exists', () => {
      assertIncludes(css, '.tree-drive-bar', 'drive bar css');
    });
  },
};
