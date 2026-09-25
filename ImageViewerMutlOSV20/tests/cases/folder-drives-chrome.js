'use strict';

/** Drive bar, viewer prev/next, settings/shortcuts, toolbar icons. */
module.exports = {
  name: 'Folder drives & viewer chrome',
  run({ test, each, src, h }) {
    const { html, icons, fileTree, css } = src;
    const { assertIncludes } = h;

    test('Drive buttons live in the folder-view title', () => {
      assertIncludes(html, 'id="tree-drive-bar"', 'drive bar');
      assertIncludes(fileTree, 'listDrives', 'listDrives call');
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

    test('Drive-bar CSS exists', () => {
      assertIncludes(css, '.tree-drive-bar', 'drive bar css');
    });
  },
};
