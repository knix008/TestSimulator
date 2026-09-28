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
      'renamePath', 'deleteFile',
    ];
    each(apis, (k) => `preload exposes ${k}`, (k) => {
      assertIncludes(preload, `${k}:`, k);
    });

    const handlers = [
      'print-image', 'list-drives', 'read-directory', 'decode-dicom',
      'get-printers', 'watch-directory', 'get-file-assoc-status',
      'rename-path', 'delete-file',
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

    test('Test report lists every case name by default', () => {
      const runner = h.read('tests/run-feature-tests.js');
      assertIncludes(runner, '테스트 내용', 'html case column');
      assertIncludes(runner, 'summaryOnly', 'full list is default');
      assertIncludes(runner, 'table class="cases"', 'per-suite case table');
    });

    test('Every case reports a numeric execution time', () => {
      assert(h.fmtMs(0) === '0.000 ms', h.fmtMs(0));
      assert(h.fmtMs(0.004) === '0.004 ms', h.fmtMs(0.004));
      assert(h.fmtMs(12.3) === '12.300 ms', h.fmtMs(12.3));
      const runner = h.read('tests/run-feature-tests.js');
      assertIncludes(runner, '실행 시간', 'duration column');
      assertIncludes(runner, 'h.fmtMs(t.ms)', 'per-case time');
    });

    test('Test report separates summary from case details', () => {
      const runner = h.read('tests/run-feature-tests.js');
      assertIncludes(runner, 'id="summary"', 'summary section');
      assertIncludes(runner, 'id="details"', 'details section');
      assertIncludes(runner, 'table class="summary"', 'suite summary table');
      assertIncludes(runner, "console.log(`${C.bold}  요약${C.reset}`)", 'console summary');
      assertIncludes(runner, "console.log(`${C.bold}  상세${C.reset}", 'console details');
    });
  },
};
