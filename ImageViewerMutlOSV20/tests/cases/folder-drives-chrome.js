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

    test('Viewer menubar swaps Effects for a DICOM menu', () => {
      const defs = app.slice(app.indexOf('function _menubarDefs'), app.indexOf('function _ewMenubarDefs'));
      assertIncludes(defs, "labelKey: 'menu.dicom'", 'DICOM menu');
      assert(!/labelKey: 'menu\.effects'/.test(defs), 'no Effects menu in the viewer');
      // The edit window keeps it — that is where adjustments live.
      const ew = app.slice(app.indexOf('function _ewMenubarDefs'), app.indexOf('function _buildMenubar'));
      assertIncludes(ew, "labelKey: 'menu.effects'", 'edit window keeps Effects');
      assertIncludes(app, 'function _dicomMenuItems', 'menu builder');
      assertIncludes(app, "label: t('menu.noDicom')", 'hint when the file is not DICOM');
      // DICOM rows moved out of the View menu, so nothing is listed twice.
      const view = app.slice(app.indexOf('function _viewMenuItems'), app.indexOf('function _themeMenuItems'));
      assert(!/_dicomContextItems\(\)/.test(view), 'View menu no longer carries the DICOM block');
      assertIncludes(main, "label: t('menu.dicom')", 'native menu too');
      assert(!/label: t\('menu\.effects'\)/.test(main), 'native Effects menu gone');
      assertIncludes(app, "if (action.startsWith('dicom-') && !(state.dicom", 'DICOM actions need a DICOM image');
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
