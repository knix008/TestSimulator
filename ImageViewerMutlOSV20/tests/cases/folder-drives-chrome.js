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
      assertIncludes(fn, '_toggleLeftPanel()', 'left panel');
      assertIncludes(fn, '_toggleRightPanel()', 'right panel');
      assertIncludes(fn, '_toggleBrowseMode()', 'contact sheet');
      assertIncludes(fn, 'toggleFullscreen', 'fullscreen');
      assertIncludes(fn, 'windowMinimize', 'minimise');
      assertIncludes(fn, 'windowMaximize', 'maximise');
      // DICOM rows stay in the View menu, where they were.
      const view = app.slice(app.indexOf('function _viewMenuItems'), app.indexOf('function _themeMenuItems'));
      assertIncludes(view, '..._dicomContextItems(),', 'DICOM block back in View');
      assertIncludes(main, "label: t('menu.window')", 'native menu too');
      assert(!/label: t\('menu\.effects'\)/.test(main), 'native Effects menu gone');
      for (const action of ['panel-left', 'panel-right', 'toggle-browse']) {
        assertIncludes(app, `'${action}':`, `${action} handled in the renderer`);
        assertIncludes(main, `'${action}'`, `${action} sent by the native menu`);
      }
    });

    test('Left and right panels collapse to a rail, one button each, no duplicates', () => {
      // Left: explorer over file info. Right: histogram, colour wheel, adjustments.
      const left = html.slice(html.indexOf('<div id="sidebar">'), html.indexOf('<div id="viewer-area">'));
      const right = html.slice(html.indexOf('<div id="right-sidebar">'), html.indexOf('<!-- /main-area -->'));
      assert(left.indexOf('id="file-tree-panel"') >= 0 && left.indexOf('id="info-panel"') > left.indexOf('id="file-tree-panel"'),
        'file info sits under the explorer');
      assert(!right.includes('id="info-panel"'), 'file info only on the left');
      for (const id of ['cp-histogram', 'cp-wheel', 'cp-adjust']) assertIncludes(right, `id="${id}"`, id);
      for (const gone of ['info-dock-btn', 'info-close-btn']) assert(!html.includes(gone), `${gone} removed`);
      assert(!/_toggleInfoDock|_layout\.dock|btn-panel-(tree|info|dock)/.test(app), 'dock + old toolbar buttons gone');
      // Every panel title carries an icon; each side has exactly one collapse button.
      for (const id of ['tree-panel-icon', 'info-panel-icon', 'color-panel-icon']) assertIncludes(html, `id="${id}"`, id);
      assertIncludes(app, "'tree-panel-icon': 'folderTree', 'info-panel-icon': 'fileInfo', 'color-panel-icon': 'palette'", 'icons');
      assert(left.split('panel-collapse-btn').length === 2, 'one collapse button on the left');
      assert(right.split('panel-collapse-btn').length === 2, 'one collapse button on the right');
      // Toolbar: exactly one button per side.
      const bar = app.slice(app.indexOf('function _buildToolbar'), app.indexOf('{ spacer: true }'));
      assert(bar.split("id:'btn-panel-").length === 3, 'two panel buttons on the toolbar');
      assertIncludes(bar, "id:'btn-panel-left',  icon:'panelLeft'", 'left panel button');
      assertIncludes(bar, "id:'btn-panel-right', icon:'panelRight'", 'right panel button');
      // Collapsed = rail with icon + vertical title, not hidden.
      const fn = app.slice(app.indexOf('function _applyPanelLayout'), app.indexOf('function _toggleLeftPanel'));
      assertIncludes(fn, "sidebar.classList.toggle('collapsed', !_layout.left)", 'left collapses');
      assertIncludes(fn, "right.classList.toggle('collapsed', !_layout.right)", 'right collapses');
      assert(!/\.hidden\s*=/.test(fn), 'collapsing never hides a panel');
      assertIncludes(css, 'writing-mode: vertical-rl', 'title runs down the rail');
      assertIncludes(css, '#sidebar.collapsed .tree-drive-bar', 'drive bar off the rail');
    });

    test('Right panel edits colour through the Editor, one undo step per pick', () => {
      const { editor } = src;
      assertIncludes(editor, "tintColor: '', tintAmount: 0", 'tint effect with defaults');
      assertIncludes(editor, "tc.globalCompositeOperation = 'color';", 'tint keeps the luminance');
      assertIncludes(editor, 'function setEffects(map)', 'batched setter');
      assertIncludes(editor, 'setEffect, setEffects, getEffects', 'exported');
      // Wheel commits on pointer-up only, so a drag is one history entry.
      const wheel = app.slice(app.indexOf('function _initColorWheel'), app.indexOf('function _syncColorPick'));
      assertIncludes(wheel, "cv.addEventListener('pointerup', end);", 'commit on release');
      assert(!/pointermove[\s\S]*?setEffect/.test(wheel.slice(wheel.indexOf("'pointermove'"), wheel.indexOf('const end'))), 'no commit while dragging');
      // Panel constants sit above the init calls (TDZ).
      assert(app.indexOf('const CP_SLIDERS') < app.indexOf('_initPanelLayout();'), 'CP_SLIDERS declared before init');
      assert(app.indexOf('let _cpSyncQueued') < app.indexOf('_initPanelLayout();'), 'sync flag declared before init');
      // Histogram follows every picture change.
      assertIncludes(app, '() => { _markDirty(); _queueColorPanelSync(); },', 'render hook');
      assertIncludes(app, "!state.isVideo && !state.isAudio && !state.editMode && !state.dicom", 'disabled where it cannot apply');
    });

    test('Context menus open a Details dialog built from tables', () => {
      assertIncludes(html, 'id="details-overlay" class="dialog-overlay"', 'in-app dialog');
      const viewer = app.slice(app.indexOf('function _showContextMenu'), app.indexOf('function _imageFileOsMenuItems'));
      assertIncludes(viewer, "label: t('context.details'), shortcut: 'Ctrl+I', action: () => _showFileInfoDialog() }", 'image context menu');
      const tree = app.slice(app.indexOf('function _showTreeContextMenu'), app.indexOf('function _showContextMenu'));
      assertIncludes(tree, "label: t('context.details'), action: () => _showFileInfoDialog(entry.path) }", 'explorer context menu');
      const fn = app.slice(app.indexOf('async function _showFileInfoDialog'), app.indexOf('function _analysisSection'));
      assertIncludes(fn, 'content.innerHTML = _renderInfoSections(sections)', 'same tables as the panel');
      assertIncludes(fn, 'if (saved) Object.assign(state, saved);', "another file's metadata does not clobber the open one");
      assert(!fn.includes('showMessageBox'), 'no plain-text native box any more');
      assertIncludes(app, 'function _imageStats(source, maxSide = 512)', 'shared with the histogram');
    });

    test('File Info renders each section as a table', () => {
      const fn = app.slice(app.indexOf('function _renderInfoSections'), app.indexOf('function _initInfoTagFilter'));
      assertIncludes(fn, '<table class="info-table', 'table per section');
      assertIncludes(fn, '<th class="info-label" scope="row"', 'label column');
      assertIncludes(fn, '<td class="info-value"', 'value column');
      assertIncludes(css, '.info-table {', 'table styles');
      assertIncludes(css, 'table-layout: fixed;', 'stable columns');
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
