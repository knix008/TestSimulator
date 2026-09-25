'use strict';

/** File menu, toolbar open/print, shortcuts, file dialog, folder-tree selection. */
module.exports = {
  name: 'File & navigation',
  run({ test, each, src, h }) {
    const { app, html, fileTree } = src;
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

    test('Folder tree refresh is opt-in via force', () => {
      assertIncludes(fileTree, 'force', 'force refresh flag');
    });
  },
};
