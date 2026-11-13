'use strict';

/**
 * Checks that run, not just strings in the source: clean/clean:all on a
 * throwaway tree, the help page turning pictures into figures, the virtual
 * file list, and the start-screen name card staying put.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

module.exports = {
  name: 'Behavior checks',
  run({ test, src, h }) {
    const { assert, assertIncludes } = h;

    function write(root, rel, text = 'x') {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, text);
    }
    function exists(root, rel) {
      return fs.existsSync(path.join(root, rel));
    }

    test('clean removes build products and leaves installers, sources and node_modules', () => {
      const { cleanTree } = require(path.join(h.ROOT, 'scripts', 'clean.js'));
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miv-clean-'));
      try {
        write(root, 'dist/app.js');
        write(root, 'out/bundle.js');
        write(root, 'src-tauri/target/release/app.exe');
        write(root, 'src-tauri/gen/schemas/acl.json');
        write(root, 'src-tauri/runtime/ffmpeg.exe');
        write(root, 'src-tauri/runtime/.gitkeep', '');
        write(root, 'src/vendor/node_modules/exifr/dist/full.umd.js');
        write(root, 'src/vendor/UTIF.js', 'kept');
        write(root, 'src/help/home.jpg', 'pic');
        write(root, 'src/assets/icon.png', 'icon');
        write(root, 'node_modules/left/index.js', 'deps');
        write(root, 'MyImageViewer_1.0.2_x64-setup.exe', 'setup');
        write(root, 'notes.txt', 'keep');
        fs.mkdirSync(path.join(root, 'not-an-installer.exe'));

        const first = cleanTree(root, { all: false });
        assert(first.failed.length === 0, first.failed.join('; '));
        for (const gone of ['dist/app.js', 'out/bundle.js', 'src-tauri/target/release/app.exe', 'src-tauri/gen/schemas/acl.json', 'src-tauri/runtime/ffmpeg.exe', 'src/vendor/node_modules/exifr/dist/full.umd.js']) {
          assert(!exists(root, gone), `still there: ${gone}`);
        }
        for (const kept of ['src-tauri/runtime/.gitkeep', 'src/vendor/UTIF.js', 'src/help/home.jpg', 'src/assets/icon.png', 'node_modules/left/index.js', 'MyImageViewer_1.0.2_x64-setup.exe', 'notes.txt']) {
          assert(exists(root, kept), `removed: ${kept}`);
        }
        assert(fs.statSync(path.join(root, 'not-an-installer.exe')).isDirectory(), 'a directory whose name ends in .exe stays');

        const second = cleanTree(root, { all: true });
        assert(second.failed.length === 0, second.failed.join('; '));
        assert(!exists(root, 'MyImageViewer_1.0.2_x64-setup.exe'), 'clean:all removes the installer');
        assert(exists(root, 'notes.txt') && exists(root, 'src/help/home.jpg') && exists(root, 'node_modules/left/index.js'), 'clean:all still keeps sources and dependencies');
        assert(src.pkg.scripts.clean === 'node scripts/clean.js', 'npm run clean');
        assert(src.pkg.scripts['clean:all'] === 'node scripts/clean.js --all', 'npm run clean:all');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('Help turns a picture line into a figure and refuses a path that leaves the help folder', () => {
      const app = h.read('src/js/app.js');
      const start = app.indexOf('function _markdownToHtml(src) {');
      const end = app.indexOf('function _exportAs', start);
      assert(start > 0 && end > start, 'help renderer');
      const render = new Function(`${app.slice(start, end)}\nreturn _markdownToHtml;`)();
      const html = render('![시작 화면](help/home.jpg)\n\n**굵게** `코드`\n\n<script>alert(1)</script>');
      assert(html.includes('<figure class="help-fig"><img src="help/home.jpg" alt="시작 화면"><figcaption>시작 화면</figcaption></figure>'), 'picture');
      assert(html.includes('<strong>굵게</strong>') && html.includes('<code>코드</code>'), 'inline marks');
      assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'text is escaped');
      const sneaky = render('![x](help/../../secret.jpg)\n![y](https://example.com/a.jpg)');
      assert(!sneaky.includes('<img'), 'only a file directly under help/');
      assert(sneaky.includes('![x](help/../../secret.jpg)'), 'an unsafe path stays as text');
      assertIncludes(src.css, '.help-doc .help-fig img {', 'the help window sizes the picture');
    });

    test('Both guides show the same four screen pictures, and the files are real', () => {
      const names = ['home.jpg', 'viewer.jpg', 'thumbs.jpg', 'edit.jpg'];
      const ko = h.read('doc/도움말.md');
      const en = h.read('doc/help.md');
      const guide = h.read('UsersGuide.md');
      for (const name of names) {
        const file = path.join(h.ROOT, 'src', 'help', name);
        assert(fs.existsSync(file) && fs.statSync(file).size > 8000, `${name} is a real picture`);
        assert(ko.includes(`](help/${name})`), `Korean help links ${name}`);
        assert(en.includes(`](help/${name})`), `English help links ${name}`);
        assert(guide.includes(`](src/help/${name})`), `user guide links ${name}`);
      }
    });

    test('The program-name card stays full width on the first row; the other cards still move', () => {
      const sandbox = { window: {}, document: {}, localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 0 } };
      vm.runInNewContext(h.read('src/js/startboard.js'), sandbox);
      const SB = sandbox.window.StartBoard;
      const ids = ['hero', 'begin', 'tasks', 'recent', 'scenes'];
      const measured = { hero: 6, begin: 14, tasks: 14, recent: 12, scenes: 12 };
      const cells = SB.cardsOf(null, ids, measured);
      const stuck = SB.place(cells, 'hero', { col: 2, row: 9, w: 1, h: 2, fit: false });
      assert(stuck.hero.col === 0 && stuck.hero.row === 0 && stuck.hero.w === 3 && stuck.hero.fit === true, 'a move of the name card is ignored');
      const arranged = SB.autoArrange(ids, measured);
      assert(arranged.hero.col === 0 && arranged.hero.row === 0 && arranged.hero.w === 3, 'auto arrange keeps the name card on top');
      const shifted = SB.place(cells, 'begin', { col: 2, row: 0 });
      assert(shifted.begin.row >= shifted.hero.h, 'a card dropped on the name card lands under it');
      assert(shifted.hero.row === 0 && shifted.hero.w === 3, 'the name card did not move aside');
      for (const a of ids) for (const b of ids) if (a < b) assert(!SB.overlaps(shifted[a], shifted[b]), `${a} overlaps ${b}`);
    });

    test('The web file list registers files, keeps names unique and builds a folder tree', async () => {
      const file = path.join(h.ROOT, 'src/js/fileRegistry.js');
      delete require.cache[require.resolve(file)];
      const prev = global.window;
      global.window = global;
      let R;
      try {
        require(file);
        R = global.FileRegistry;
      } finally {
        if (prev === undefined) delete global.window;
        else global.window = prev;
      }
      assert(R, 'registry loaded');
      R.clear();
      const a = R.registerFile({ name: 'sample.jpg' }, '/');
      const b = R.registerFile({ name: 'sample.jpg' }, '/');
      assert(a === '/sample.jpg' && b !== a && b.endsWith('.jpg'), 'a second file of the same name gets a new name');
      const listing = await R.readDirectory('/');
      assert(listing.map((e) => e.name).sort().join(',') === ['sample (2).jpg', 'sample.jpg'].sort().join(','), 'both files are listed');
      R.mountWebkitFiles([
        { name: 'a.jpg', webkitRelativePath: 'Pics/a.jpg' },
        { name: 'b.png', webkitRelativePath: 'Pics/sub/b.png' },
      ]);
      const top = await R.readDirectory('/');
      assert(top.length === 1 && top[0].isDirectory && top[0].name === 'Pics', 'the picked folder is the root child');
      const nested = await R.readDirectory('/Pics/sub');
      assert(nested.length === 1 && nested[0].path === '/Pics/sub/b.png', 'a nested file is addressable');
      assert(R.dirname('/Pics/sub/b.png') === '/Pics/sub' && R.basename('/Pics/sub/b.png') === 'b.png', 'path parts');
    });

    test('Theme, language, settings and About stay at the right end of both toolbars', () => {
      const app = src.app;
      const block = app.slice(app.indexOf("{ id:'btn-edit'"), app.indexOf("{ id:'btn-info'"));
      const order = [...block.matchAll(/id:'(btn-[a-z-]+)'/g)].map((m) => m[1]);
      assert(order.join(',') === 'btn-edit,btn-theme,btn-theme-menu,btn-lang,btn-settings', 'main toolbar order after Edit');
      assert(block.includes('spacer: true') && block.indexOf('spacer: true') < block.indexOf("id:'btn-theme'"), 'a spacer pushes them right');
      const row = src.html.slice(src.html.indexOf('<div id="ew-toolbar-row"'), src.html.indexOf('<div id="ew-tools-row"'));
      assert(row.indexOf('class="ew-spacer"') < row.indexOf('id="ew-theme"') && row.indexOf('id="ew-theme"') < row.indexOf('id="ew-about"'), 'edit toolbar: spacer, then theme through About');
      const min = app.slice(app.indexOf('function _mainMinWidth'), app.indexOf('function _appMinWidth'));
      assertIncludes(min, '_barMinWidth(toolbar', 'the window cannot shrink past the toolbar');
      assertIncludes(min, "_barMinWidth(document.getElementById('menubar')", 'or past the menu bar');
    });
  },
};
