'use strict';

/** File menu, toolbar open/print, shortcuts, file dialog, folder-tree selection. */
module.exports = {
  name: 'File & navigation',
  run({ test, each, src, h }) {
    const { app, html, fileTree, css } = src;
    const { assert, assertIncludes, exists } = h;

    const fileMenu = [
      ['menu.openFile', 'Open File'],
      ['menu.openFolder', 'Open Folder'],
      ['menu.saveAs', 'Save As'],
      ['menu.print', 'Print'],
      ['menu.settings', 'Settings'],
      ['menu.exit', 'Exit'],
    ];
    each(fileMenu, ([key, label]) => `File menu includes ${label}`, ([key]) => {
      assertIncludes(app, `t('${key}')`, key);
    });

    test('File menu is built by _fileMenuItems', () => {
      assertIncludes(app, 'function _fileMenuItems', 'app.js');
    });

    const toolbar = [
      ['btn-open-file', 'Open File'],
      ['btn-open-folder', 'Open Folder'],
      ['btn-print', 'Print'],
      ['btn-undo', 'Undo'],
      ['btn-redo', 'Redo'],
      ['btn-fit', 'Fit'],
      ['btn-actual', 'Actual size'],
      ['btn-rotate-l', 'Rotate left'],
      ['btn-rotate-r', 'Rotate right'],
      ['btn-flip-h', 'Flip H'],
      ['btn-flip-v', 'Flip V'],
      ['btn-resize', 'Resize'],
      ['btn-prev', 'Previous'],
      ['btn-next', 'Next'],
      ['btn-edit', 'Edit'],
    ];
    each(toolbar, ([id, label]) => `Toolbar has ${label}`, ([id]) => {
      assertIncludes(app, `id:'${id}'`, id);
    });

    test('Edit toolbar button sits to the right of Zoom In', () => {
      const iZoomIn = app.indexOf("id:'btn-zoom-in'");
      const iEdit = app.indexOf("id:'btn-edit'");
      assert(iZoomIn > 0 && iEdit > iZoomIn, 'edit should follow zoom in');
    });

    test('About toolbar button sits to the right of Settings', () => {
      const iSettings = app.indexOf("id:'btn-settings'");
      const iInfo = app.lastIndexOf("id:'btn-info'");
      assert(iSettings > 0 && iInfo > iSettings, 'info should follow settings');
    });

    test('Toolbar order is Open File → Open Folder → Print', () => {
      const iFile = app.indexOf("id:'btn-open-file'");
      const iFolder = app.indexOf("id:'btn-open-folder'");
      const iPrint = app.indexOf("id:'btn-print'");
      assert(iFile > 0 && iFolder > iFile && iPrint > iFolder, 'toolbar order should be file, folder, print');
    });

    test('In-app file dialog overlay exists', () => {
      assertIncludes(html, 'id="file-dialog-overlay"', 'html');
      assert(exists('src/js/fileDialog.js'), 'fileDialog.js missing');
    });

    test('Folder tree setSelected does not rebuild the tree', () => {
      assertIncludes(fileTree, 'function setSelected', 'fileTree');
      assertIncludes(fileTree, 'scrollTop', 'scroll selected row into view');
    });

    test('Viewer and explorer context menus include Print', () => {
      const viewer = app.slice(app.indexOf('function _showContextMenu'), app.indexOf('function _imageFileOsMenuItems'));
      assertIncludes(viewer, "t('menu.print')", 'print in viewer menu');
      const tree = app.slice(app.indexOf('function _showTreeContextMenu'), app.indexOf('async function _printPath'));
      assertIncludes(tree, "t('menu.print')", 'print in explorer menu');
      assertIncludes(app, 'function _printPath', 'print helper');
    });

    test('Image viewer context menu can delete the file', () => {
      assertIncludes(app, 'function _showContextMenu', 'viewer context');
      assertIncludes(app, 'function _imageFileOsMenuItems', 'file OS items');
      const block = app.slice(app.indexOf('function _showContextMenu'), app.indexOf('function _imageFileOsMenuItems'));
      assertIncludes(block, '_imageFileOsMenuItems', 'delete in viewer menu');
      assertIncludes(app, "t('context.deleteFile')", 'delete label');
    });

    test('Explorer folder context menu can rename', () => {
      const tree = app.slice(app.indexOf('function _showTreeContextMenu'), app.indexOf('async function _printPath'));
      assertIncludes(tree, "t('context.rename')", 'rename in explorer menu');
      assertIncludes(tree, '_renameEntry(entry.path, isDir)', 'rename action');
      assertIncludes(app, 'function _renameEntry', 'rename helper');
      assertIncludes(app, 'function _promptRename', 'rename dialog');
      assertIncludes(html, 'id="rename-overlay"', 'rename overlay');
      assertIncludes(html, 'id="rename-input"', 'rename input');
    });

    test('Explorer context Delete is marked danger (red)', () => {
      const tree = app.slice(app.indexOf('function _showTreeContextMenu'), app.indexOf('async function _printPath'));
      const first = tree.indexOf('Icons.delete');
      const last = tree.lastIndexOf('Icons.delete');
      assert(first >= 0 && last > first, 'multi and single delete items');
      assertIncludes(tree.slice(first, first + 240), 'danger: true', 'multi-select delete');
      assertIncludes(tree.slice(last, last + 240), 'danger: true', 'single delete');
      assertIncludes(css, '.ctx-item.danger { color: var(--danger); }', 'danger color');
      const ctx = h.read('src/js/contextMenu.js');
      assertIncludes(ctx, "item.danger ? ' danger'", 'danger class applied');
    });

    test('Viewer and File menu Delete are marked danger', () => {
      const os = app.slice(app.indexOf('function _imageFileOsMenuItems'), app.indexOf('async function _showInExplorer'));
      assertIncludes(os, 'danger: true', 'viewer OS delete');
      const file = app.slice(app.indexOf('function _fileMenuItems'), app.indexOf('async function _recentFolderItems'));
      assertIncludes(file, "t('context.deleteFile'), danger: true", 'File menu delete');
    });

    test('Main window open progress stays on the status bar', () => {
      const block = app.slice(app.indexOf('async function _openFile'), app.indexOf('function _prefetchConvertedNeighbors'));
      assertIncludes(block, 'modal: !!state.editMode', 'main open is not a popup');
      assertIncludes(block, 'showOpenProgress', 'status progress');
    });

    test('Folder tree refresh is opt-in via force', () => {
      assertIncludes(fileTree, 'force', 'force refresh flag');
    });
  },
};
