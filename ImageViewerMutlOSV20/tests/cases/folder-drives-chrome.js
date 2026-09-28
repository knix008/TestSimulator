'use strict';

/** Drive bar, viewer prev/next, settings/shortcuts, toolbar icons. */
module.exports = {
  name: 'Folder drives & viewer chrome',
  run({ test, each, src, h }) {
    const { html, icons, fileTree, css, app } = src;
    const { assertIncludes } = h;

    test('Drive buttons live in the folder-view title', () => {
      assertIncludes(html, 'id="tree-drive-bar"', 'drive bar');
      assertIncludes(fileTree, 'listDrives', 'listDrives call');
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
