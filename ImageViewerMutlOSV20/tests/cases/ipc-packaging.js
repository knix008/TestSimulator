'use strict';

/** preload / main IPC contracts and package.json scripts. */
module.exports = {
  name: 'IPC & packaging',
  run({ test, each, src, h }) {
    const { preload, main, pkg } = src;
    const { assert, assertIncludes } = h;

    const apis = [
      'readDirectory', 'listDrives', 'pathAncestors', 'readFileBytes',
      'printImage', 'getPrinters', 'readFileBase64', 'decodeDicom',
      'windowClose', 'windowMinimize', 'windowMaximize',
      'getFileAssocStatus', 'setDefaultImageViewer', 'openDefaultAppsSettings',
      'watchDirectory', 'watchFile', 'openFileDialog', 'openFolderDialog',
    ];
    each(apis, (k) => `preload exposes ${k}`, (k) => {
      assertIncludes(preload, `${k}:`, k);
    });

    const handlers = [
      'print-image', 'list-drives', 'read-directory', 'decode-dicom',
      'get-printers', 'watch-directory', 'get-file-assoc-status',
    ];
    each(handlers, (ch) => `main handles ${ch}`, (ch) => {
      assertIncludes(main, `'${ch}'`, ch);
    });

    test('main builds print HTML', () => {
      assertIncludes(main, '_printPageHtml', 'print html');
    });

    test('package.json version and appId', () => {
      assert(pkg.version, 'version');
      assert(pkg.build && pkg.build.appId === 'com.shkwon.imageviewer', 'appId');
    });

    const scripts = ['start', 'test', 'create-icons', 'build:win', 'build:mac', 'build:linux'];
    each(scripts, (s) => `package script ${s}`, (s) => {
      assert(pkg.scripts[s], s);
    });
  },
};
