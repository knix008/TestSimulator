// The web build in a real browser engine (headless Edge), driven by real input. Downloads land in a
// scratch folder and 7-Zip judges them.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq, includes, ok } from '../assert.js';
import { assert7zOk, ALT, assertSameTree, by, CTRL, SHIFT, makeTree, noise, page, readTree, root, scratch, sevenZip, waitTarget } from './ui.mjs';
import { freePort } from '../../scripts/free-port.mjs';

function findEdge() {
  for (const p of [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('no Chromium browser found');
}

export default async function suite(runCase) {
  let ui;
  let failures = 0;
  const base0 = { dir: null, reset: null };
  const test = (name, fn) => runCase(name, async () => {
    try {
      await fn();
    } catch (e) {
      failures += 1;
      const said = await ui?.js(`document.querySelector('[data-testid=error-text]')?.parentElement?.textContent ?? ''`).catch(() => '');
      if (base0.dir) await ui?.shot(path.join(base0.dir, `fail-${failures}.png`)).catch(() => {});
      await base0.reset?.().catch(() => {});
      if (said) e.message = `${e.message}\n  on screen: ${said}`;
      throw e;
    }
  });
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const made = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-build-info.mjs')], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error(made.stderr);
  // Always: an engine older than the source would test the wrong code. Nothing to do when current.
  const wasm = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-wasm.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (wasm.status !== 0) throw new Error(`could not build the web engine\n${wasm.stderr.slice(-2000)}`);
  const built = spawnSync(process.execPath, [vite, 'build', '--mode', 'web', '--logLevel', 'error'], { cwd: root, encoding: 'utf8' });
  if (built.status !== 0) throw new Error(built.stderr || built.stdout);

  const base = scratch('web');
  const downloads = path.join(base, 'downloads');
  fs.mkdirSync(downloads, { recursive: true });
  const srcDir = path.join(base, 'src');
  const tree = makeTree(srcDir);
  const setFiles = {};
  for (const [k, v] of Object.entries(tree)) if (k.startsWith('set/')) setFiles[k] = v;

  const port = await freePort(5400);
  const server = spawn(process.execPath, [vite, 'preview', '--mode', 'web', '--outDir', 'dist-web', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], { cwd: root, stdio: 'ignore' });
  const cdpPort = await freePort(9430, [port]);
  const browser = spawn(findEdge(), ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${path.join(base, 'profile')}`, '--no-first-run', '--disable-extensions', '--disable-sync', '--window-size=1400,900', `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
  try {
    const target = await waitTarget(cdpPort, (t) => t.url.includes(`127.0.0.1:${port}`), 30000);
    ui = await page(target);
    await ui.c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads }).catch(async () => {
      await ui.c.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    });
    await ui.c.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 Edge', acceptLanguage: 'ko-KR' }).catch(() => {});
    await ui.waitFor(by('toolbar'));

    // ── Helpers on top of the page ────────────────────────────────────────────────────────────
    const clearDownloads = () => {
      for (const n of fs.readdirSync(downloads)) fs.rmSync(path.join(downloads, n), { force: true, recursive: true });
    };
    const waitDownload = async (name, ms = 20000) => {
      const p = path.join(downloads, name);
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const partials = fs.readdirSync(downloads).filter((n) => n.endsWith('.crdownload') || n.endsWith('.tmp'));
        if (fs.existsSync(p) && !partials.length) return p;
        await ui.sleep(100);
      }
      throw new Error(`${name} not downloaded; have ${fs.readdirSync(downloads).join(', ')}`);
    };
    const reset = async () => {
      await ui.js('location.reload()');
      await ui.sleep(300);
      await ui.waitFor(by('toolbar'));
    };
    base0.dir = base;
    base0.reset = reset;
    const pickFiles = (files) => ui.setFiles(by('web-file-input'), files);
    const waitIdle = () => ui.waitGone(by('progress-dialog'));
    const startCreate = async (tweak) => {
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      await tweak();
      await ui.click(by('create-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
    };
    const closeResult = () => ui.click(by('result-close'));
    const outputs = () => ui.js(`[...document.querySelectorAll('[data-output]')].map((e) => ({ name: e.dataset.output, size: Number(e.querySelector('[data-size]').dataset.size) }))`);
    const download = async (name) => {
      await ui.click(`[data-output=${JSON.stringify(name)}] ${by('download-one')}`);
      return waitDownload(name);
    };

    // ── The page itself ───────────────────────────────────────────────────────────────────────
    await test('web: start screen, brand at far left, no window buttons', async () => {
      ok(await ui.exists(by('start-screen')));
      eq(await ui.text(by('brand-name')), 'MyZipMaster');
      eq(await ui.text(by('brand-version')), 'v1.0.0');
      ok(!(await ui.exists(by('window-controls'))));
      eq(await ui.attr('html', 'data-host'), 'web');
      eq(await ui.disabled(by('btn-unpack')), true);
      eq(await ui.disabled(by('btn-test')), true);
    });

    await test('web: add files, ZIP, download reads in 7-Zip', async () => {
      await pickFiles([path.join(srcDir, 'set/readme.txt'), path.join(srcDir, 'set/noise.bin')]);
      await ui.waitFor(ui.rowSel('readme.txt'));
      eq((await ui.rows()).length, 2);
      // Nothing selected: the whole list is what gets compressed.
      await startCreate(async () => {
        await ui.fill(by('output'), '/out/first.zip');
        eq(await ui.count(`${by('sources')} .source-row`), 2);
      });
      const [o] = await outputs();
      eq(o.name, 'first.zip');
      const file = await download('first.zip');
      assert7zOk(file);
      await closeResult();
    });

    // The folder on the list, selected, whatever the case before it left behind.
    const selectSet = async () => {
      if (!(await ui.exists(ui.rowSel('set')))) {
        await reset();
        await ui.setFiles(by('web-folder-input'), [path.join(srcDir, 'set')]);
        await ui.waitFor(ui.rowSel('set'));
      }
      await ui.click(ui.rowSel('set'));
    };

    await test('web: folder, ZIP split to size, download all', async () => {
      await reset();
      await selectSet();
      clearDownloads();
      await startCreate(async () => {
        await ui.fill(by('output'), '/out/sp.zip');
        await ui.choose(by('split'), 'custom');
        await ui.fill(by('split-text'), '128');
        await ui.choose(by('split-unit'), 'KB');
        includes(await ui.text(by('split-hint')), '131,072');
      });
      const list = await outputs();
      ok(list.length >= 3, `${list.length} parts`);
      eq(list[0].name, 'sp.z01');
      eq(list[list.length - 1].name, 'sp.zip');
      for (const v of list) ok(v.size <= 131072, `${v.name} is ${v.size}`);
      await ui.click(by('download-all'));
      for (const v of list) {
        const p = await waitDownload(v.name);
        eq(fs.statSync(p).size, v.size, v.name);
      }
      assert7zOk(path.join(downloads, 'sp.zip'));
      await closeResult();
    });

    await test('web: split 7z with password and encrypted names', async () => {
      await selectSet();
      clearDownloads();
      await startCreate(async () => {
        await ui.fill(by('output'), '/out/enc.7z');
        await ui.choose(by('format'), '7z');
        await ui.choose(by('split'), 'custom');
        await ui.fill(by('split-text'), '200');
        await ui.choose(by('split-unit'), 'KB');
        await ui.fill(by('password'), 'secret42');
        await ui.fill(by('confirm'), 'different');
        ok(await ui.disabled(by('create-start')), 'mismatch blocks');
        includes(await ui.text(by('create-problem')), '일치');
        await ui.fill(by('confirm'), 'secret42');
        await ui.click(by('encrypt-names'));
        await ui.click(by('solid'));
      });
      const list = await outputs();
      eq(list[0].name, 'enc.7z.001');
      for (const [i, v] of list.entries()) {
        if (i < list.length - 1) eq(v.size, 204800, `${v.name} is exact`);
      }
      await ui.click(by('download-all'));
      for (const v of list) await waitDownload(v.name);
      assert7zOk(path.join(downloads, 'enc.7z.001'), 'secret42');
      const noPw = sevenZip(['l', '-pnope', path.join(downloads, 'enc.7z.001')]);
      ok(!noPw.ok, 'names are encrypted');
      await closeResult();
    });

    await test('web: split RAR 5 with recovery record', async () => {
      await selectSet();
      clearDownloads();
      await startCreate(async () => {
        await ui.fill(by('output'), '/out/r.rar');
        await ui.choose(by('format'), 'rar');
        await ui.choose(by('split'), 'custom');
        await ui.fill(by('split-text'), '256');
        await ui.choose(by('split-unit'), 'KB');
        for (let i = 0; i < 5; i += 1) await ui.click(by('recovery-inc'));
        eq(await ui.value(by('recovery')), '5');
      });
      const list = await outputs();
      ok(list[0].name.startsWith('r.part'), list[0].name);
      for (const v of list) ok(v.size <= 262144, `${v.name} is ${v.size}`);
      await ui.click(by('download-all'));
      for (const v of list) await waitDownload(v.name);
      assert7zOk(path.join(downloads, list[0].name));
      await closeResult();
    });

    for (const [format, name] of [['tar.gz', 't.tar.gz'], ['tar.xz', 't.tar.xz'], ['tar.bz2', 't.tar.bz2'], ['tar', 't.tar']]) {
      await test(`web: ${format} compress`, async () => {
        await selectSet();
        clearDownloads();
        await startCreate(async () => {
          await ui.choose(by('format'), format);
          await ui.fill(by('output'), `/out/${name}`);
          ok(await ui.exists(by('create-start')));
        });
        assert7zOk(await download(name));
        await closeResult();
      });
    }

    await test('web: single-file formats take one file', async () => {
      await selectSet();
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      await ui.choose(by('format'), 'gz');
      ok(await ui.disabled(by('create-start')));
      includes(await ui.text(by('create-problem')), '하나');
      await ui.click(`${by('create-dialog')} .iconbtn`);
    });

    await test('web: clear the list', async () => {
      await selectSet();
      await ui.click(by('web-clear'));
      await ui.waitFor(by('start-screen'));
    });

    // ── Opening ───────────────────────────────────────────────────────────────────────────────
    const made = path.join(base, 'made');
    fs.mkdirSync(made, { recursive: true });
    const sz = (args) => {
      const r = sevenZip(args);
      ok(r.ok, r.out);
    };
    sz(['a', '-tzip', path.join(made, 'plain.zip'), path.join(srcDir, 'set'), path.join(srcDir, 'photo.png')]);
    sz(['a', '-t7z', '-v128k', path.join(made, 'multi.7z'), path.join(srcDir, 'set')]);
    sz(['a', '-t7z', '-psecret42', '-mhe=on', path.join(made, 'locked.7z'), path.join(srcDir, 'set')]);

    await test('web: open an archive and walk its folders', async () => {
      await reset();
      await pickFiles([path.join(made, 'plain.zip')]);
      await ui.waitFor(ui.rowSel('set'));
      eq(await ui.text(by('status-format')), 'ZIP');
      ok(await ui.exists(by('archive-tree')));
      ok(await ui.exists(ui.rowSel('photo.png')));

      // Into a folder by double-click, back by the keyboard, and by the tree.
      await ui.dblclick(ui.rowSel('set'));
      await ui.waitFor(ui.rowSel('readme.txt'));
      includes(await ui.text(by('crumbs')), 'set');
      await ui.press('Backspace');
      await ui.waitFor(ui.rowSel('photo.png'));
      await ui.click('[data-tree="set"]');
      await ui.waitFor(ui.rowSel('noise.bin'));
      await ui.click(by('btn-up'));
      await ui.waitFor(ui.rowSel('photo.png'));
    });

    const openPlain = async () => {
      if (!(await ui.exists(by('status-format')))) {
        await reset();
        await pickFiles([path.join(made, 'plain.zip')]);
      }
      await ui.waitFor(by('status-format'));
      if (await ui.exists(by('btn-up')) && !(await ui.disabled(by('btn-up')))) await ui.click('[data-tree=""]');
    };

    await test('web: sort, find, select all, range select', async () => {
      await openPlain();
      await ui.dblclick(ui.rowSel('set'));
      await ui.waitFor(ui.rowSel('noise.bin'));
      await ui.click('th[data-col="size"]');
      let names = await ui.rows();
      const files = names.slice(names.findIndex((n) => n.includes('.')));
      eq(files[0], 'empty.dat', 'smallest first');
      await ui.click('th[data-col="size"]');
      names = await ui.rows();
      eq(names[names.findIndex((n) => n.includes('.'))], 'noise.bin', 'largest first');
      await ui.click('th[data-col="name"]');

      await ui.fill(by('filter'), '*.log');
      await ui.waitFor(ui.rowSel('note.log'));
      eq((await ui.rows()).length, 1, 'the search reaches subfolders');
      await ui.fill(by('filter'), 'NOTE');
      await ui.waitFor(ui.rowSel('note.log'));
      await ui.fill(by('filter'), 'no-such-thing');
      await ui.waitFor(by('empty-note'));
      await ui.fill(by('filter'), '');

      await ui.click(by('file-table'));
      await ui.press('a', { modifiers: CTRL });
      includes(await ui.text(by('status-text')), String((await ui.rows()).length));
      await ui.click(ui.rowSel('noise.bin'));
      await ui.click(ui.rowSel('readme.txt'), { modifiers: SHIFT });
      eq(await ui.count('tr.sel'), 2, 'shift extends');
      await ui.click(ui.rowSel('noise.bin'), { modifiers: CTRL });
      eq(await ui.count('tr.sel'), 1, 'ctrl toggles');
      await ui.press('ArrowUp');
      eq(await ui.count('tr.sel'), 1);
      await ui.click(by('btn-up'));
    });

    await test('web: preview text, Korean, image, binary', async () => {
      await ui.dblclick(ui.rowSel('photo.png'));
      await ui.waitFor(by('preview-image'));
      await ui.until(`document.querySelector('[data-testid=preview-image]').naturalWidth === 10`);
      await ui.press('Escape');
      await ui.waitGone(by('preview-dialog'));

      await ui.dblclick(ui.rowSel('set'));
      await ui.dblclick(ui.rowSel('readme.txt'));
      await ui.waitFor(by('preview-text'));
      includes(await ui.text(by('preview-text')), 'MyZipMaster test file');
      await ui.press('Escape');
      await ui.dblclick(ui.rowSel('한글 폴더'));
      await ui.dblclick(ui.rowSel('보고서.txt'));
      await ui.waitFor(by('preview-text'));
      includes(await ui.text(by('preview-text')), '안녕하세요');
      await ui.press('Escape');
      await ui.click(by('btn-up'));
      await ui.waitFor(ui.rowSel('noise.bin'));
      await ui.click(ui.rowSel('noise.bin'));
      await ui.press('Enter');
      await ui.waitFor(by('preview-hex'));
      await ui.press('Escape');
      await ui.click(by('btn-up'));
    });

    await test('web: extract, download as ZIP, compare with originals', async () => {
      await ui.click(by('btn-unpack'));
      await ui.waitFor(by('extract-dialog'));
      await ui.click(by('extract-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      ok(Number(await ui.attr(by('extract-count'), 'data-files')) >= 5);
      clearDownloads();
      await ui.click(by('download-zip'));
      await ui.until(`!document.querySelector('[data-testid=progress-dialog]')`);
      const t0 = Date.now();
      let name = null;
      while (Date.now() - t0 < 15000 && !name) {
        name = fs.readdirSync(downloads).find((n) => n.startsWith('extracted-') && n.endsWith('.zip'));
        await ui.sleep(100);
      }
      ok(name, 'downloaded');
      await waitDownload(name);
      const out = path.join(base, 'unzipped');
      const r = sevenZip(['x', '-y', `-o${out}`, path.join(downloads, name)]);
      ok(r.ok, r.out);
      const expected = {};
      for (const [k, v] of Object.entries(setFiles)) expected[`extracted/${k}`] = v;
      expected['extracted/photo.png'] = tree['photo.png'];
      assertSameTree(readTree(out), expected, 'extracted');
      await closeResult();
    });

    await test('web: extract selected items without folders', async () => {
      await ui.dblclick(ui.rowSel('set'));
      await ui.waitFor(ui.rowSel('readme.txt'));
      await ui.click(ui.rowSel('readme.txt'));
      await ui.click(by('btn-unpack'));
      await ui.waitFor(by('extract-dialog'));
      eq(await ui.value(by('extract-scope')), 'selected');
      await ui.click(by('extract-flatten'));
      await ui.click(by('extract-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      eq(await ui.attr(by('extract-count'), 'data-files'), '1');
      const list = await ui.js(`[...document.querySelectorAll('[data-output]')].map((e) => e.dataset.output)`);
      eq(list.join(), 'readme.txt');
      clearDownloads();
      const p = await download('readme.txt');
      ok(fs.readFileSync(p).equals(tree['set/readme.txt']));
      await closeResult();
      await ui.click(by('btn-up'));
    });

    await test('web: test reports no problems', async () => {
      await ui.click(by('btn-test'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      includes(await ui.attr(by('result-line'), 'class'), 'ok');
      await closeResult();
    });

    await test('web: details dialog', async () => {
      await ui.click(by('btn-info'));
      await ui.waitFor(by('info-dialog'));
      eq(await ui.text(by('info-format')), 'ZIP');
      eq(await ui.text(by('info-files')), '6');
      await ui.press('Escape');
    });

    await test('web: edit (add, rename, folder, delete, comment), then verify the download', async () => {
      // Add
      await ui.click(by('btn-add'));
      await ui.setFiles(by('web-file-input'), [path.join(srcDir, 'set/deep/er/note.log')]);
      await waitIdle();
      await ui.waitFor(ui.rowSel('note.log'));
      // Rename
      await ui.click(ui.rowSel('note.log'));
      await ui.press('F2');
      await ui.waitFor(by('prompt-dialog'));
      await ui.fill(by('prompt-input'), 'renamed.log');
      await ui.click(by('prompt-ok'));
      await waitIdle();
      await ui.waitFor(ui.rowSel('renamed.log'));
      ok(!(await ui.exists(ui.rowSel('note.log'))));
      // New folder through the context menu
      await ui.rightClick(ui.rowSel('photo.png'));
      await ui.waitFor('.ctxmenu');
      await ui.click('.ctxmenu-item[data-menu="newFolder"]');
      await ui.waitFor(by('prompt-dialog'));
      await ui.fill(by('prompt-input'), 'made-here');
      await ui.click(by('prompt-ok'));
      await waitIdle();
      await ui.waitFor(ui.rowSel('made-here'));
      // Delete, with its question
      await ui.click(ui.rowSel('photo.png'));
      await ui.press('Delete');
      await ui.waitFor(by('confirm-dialog'));
      await ui.click(by('confirm-no'));
      ok(await ui.exists(ui.rowSel('photo.png')), 'no means no');
      await ui.click(ui.rowSel('photo.png'));
      await ui.click(by('btn-delete'));
      await ui.click(by('confirm-yes'));
      await waitIdle();
      await ui.waitGone(ui.rowSel('photo.png'));
      // Comment
      await ui.press('Enter', { modifiers: ALT });
      await ui.waitFor(by('info-dialog'));
      await ui.fill(by('info-comment'), 'a test comment');
      await ui.click(by('save-comment'));
      await waitIdle();
      await ui.waitGone(by('info-dialog'));
      // And the result, by an outside witness.
      clearDownloads();
      await ui.click(by('btn-download'));
      const p = await waitDownload('plain.zip');
      assert7zOk(p);
      const listed = sevenZip(['l', p]);
      includes(listed.out, 'renamed.log');
      includes(listed.out, 'made-here');
      includes(listed.out, 'a test comment');
      ok(!listed.out.includes('photo.png'), 'deleted');
    });

    await test('web: convert to another format', async () => {
      await openPlain();
      await ui.click(by('btn-convert'));
      await ui.waitFor(by('create-dialog'));
      await ui.choose(by('format'), '7z');
      await ui.fill(by('output'), '/out/conv.7z');
      await ui.click(by('create-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      clearDownloads();
      assert7zOk(await download('conv.7z'));
      await closeResult();
    });

    await test('web: close the open archive', async () => {
      await openPlain();
      await ui.click(by('btn-file'));
      await ui.click(by('menu-close'));
      await ui.waitFor(by('start-screen'));
    });

    await test('web: selecting all parts opens the set', async () => {
      const parts = fs.readdirSync(made).filter((n) => n.startsWith('multi.7z.')).map((n) => path.join(made, n));
      ok(parts.length >= 3);
      await pickFiles(parts);
      await ui.waitFor(ui.rowSel('set'));
      includes(await ui.text(by('status-volumes')), String(parts.length));
      ok(await ui.exists(by('status-readonly')));
      eq(await ui.disabled(by('btn-add')), true, 'a split set cannot be edited');
      await ui.click(by('btn-test'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      includes(await ui.attr(by('result-line'), 'class'), 'ok');
      await closeResult();
      await ui.click(by('btn-file'));
      await ui.click(by('menu-close'));
    });

    await test('web: a partial set is reported', async () => {
      const parts = fs.readdirSync(made).filter((n) => n.startsWith('multi.7z.')).sort().map((n) => path.join(made, n));
      await pickFiles([parts[1]]);
      await ui.waitFor(by('error-dialog'));
      eq(await ui.attr(by('error-text'), 'data-code'), 'missing_volume');
      await ui.click(by('error-ok'));
    });

    await test('web: locked archive: wrong password, asks again, opens', async () => {
      await reset();
      await pickFiles([path.join(made, 'locked.7z')]);
      await ui.waitFor(by('password-dialog'));
      await ui.fill(by('password-input'), 'wrong');
      await ui.click(by('password-ok'));
      await ui.until(`document.querySelector('[data-testid=password-prompt]')?.className.includes('warn')`);
      await ui.fill(by('password-input'), 'secret42');
      await ui.press('Enter');
      await ui.waitFor(ui.rowSel('set'));
      eq(await ui.text(by('status-format')), '7Z');
      // The password is remembered for what follows.
      await ui.click(by('btn-test'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      includes(await ui.attr(by('result-line'), 'class'), 'ok');
      await closeResult();
    });

    await test('web: not an archive is reported', async () => {
      await reset();
      const note = path.join(made, 'note.zip');
      fs.writeFileSync(note, 'this is not a zip at all');
      await pickFiles([note]);
      await ui.waitFor(by('error-dialog'));
      eq(await ui.attr(by('error-text'), 'data-code'), 'not_archive');
      await ui.click(by('error-ok'));
    });

    await test('web: repair a truncated ZIP', async () => {
      await reset();
      const whole = fs.readFileSync(path.join(made, 'plain.zip'));
      const broken = path.join(made, 'broken.zip');
      fs.writeFileSync(broken, whole.subarray(0, whole.indexOf(Buffer.from([0x50, 0x4b, 1, 2]))));
      await ui.setFiles(by('web-folder-input'), []).catch(() => {});
      // Not a valid archive to open, so it goes through the list.
      await pickFiles([broken, path.join(srcDir, 'photo.png')]);
      await ui.waitFor(ui.rowSel('broken.zip'));
      await ui.click(ui.rowSel('broken.zip'));
      await ui.click(by('btn-repair'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      includes(await ui.attr(by('result-line'), 'class'), 'ok');
      clearDownloads();
      await ui.click(by('download-one'));
      const name = (await ui.text(by('repair-output'))).trim();
      assert7zOk(await waitDownload(name));
      await closeResult();
    });

    // ── Tools ─────────────────────────────────────────────────────────────────────────────────
    await test(`web: checksums match Node's`, async () => {
      await reset();
      const file = path.join(srcDir, 'set/noise.bin');
      await pickFiles([file]);
      await ui.waitFor(ui.rowSel('noise.bin'));
      await ui.click(ui.rowSel('noise.bin'));
      await ui.click(by('btn-tools'));
      await ui.click(by('tool-hash'));
      await ui.waitFor(by('hash-dialog'));
      for (const a of ['md5', 'sha1', 'sha512']) await ui.click(`[data-hash="${a}"]`);
      await ui.click(by('hash-start'));
      await waitIdle();
      await ui.waitFor(by('hash-table'));
      const data = fs.readFileSync(file);
      for (const a of ['md5', 'sha1', 'sha256', 'sha512']) {
        eq(await ui.text(by(`hash-${a}`)), crypto.createHash(a).update(data).digest('hex'), a);
      }
      ok((await ui.text(by('hash-crc32'))).length === 8);
      await ui.press('Escape');
    });

    await test('web: split and join a file', async () => {
      await reset();
      const file = path.join(base, 'chunk.bin');
      const data = noise(700000, 11);
      fs.writeFileSync(file, data);
      await ui.click(by('btn-tools'));
      await ui.click(by('tool-split'));
      await ui.waitFor(by('split-dialog'));
      await ui.click(by('split-pick'));
      await ui.setFiles(by('web-file-input'), [file]);
      await ui.until(`document.querySelector('[data-testid=split-file]').textContent === 'chunk.bin'`);
      await ui.fill(by('split-size'), '0');
      ok(await ui.disabled(by('split-start')), 'zero is not a size');
      await ui.fill(by('split-size'), '256');
      await ui.choose(by('split-size-unit'), 'KB');
      await ui.click(by('split-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      const list = await outputs();
      eq(list.map((v) => v.name).join(), 'chunk.bin.001,chunk.bin.002,chunk.bin.003');
      eq(list[0].size, 262144);
      eq(list[1].size, 262144);
      clearDownloads();
      const saved = [];
      for (const v of list) saved.push(await download(v.name));
      await closeResult();

      await ui.click(by('btn-tools'));
      await ui.click(by('tool-join'));
      await ui.waitFor(by('join-dialog'));
      await ui.click(by('join-pick'));
      await ui.setFiles(by('web-file-input'), saved);
      await ui.until(`document.querySelector('[data-testid=join-file]').textContent !== ''`);
      await ui.click(by('join-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      clearDownloads();
      const joined = await download('chunk.bin');
      ok(fs.readFileSync(joined).equals(data), 'identical after split and join');
      await closeResult();
    });

    await test('web: benchmark', async () => {
      await ui.click(by('btn-tools'));
      await ui.click(by('tool-benchmark'));
      await ui.waitFor(by('benchmark-dialog'));
      await ui.fill(by('bench-size'), '1');
      await ui.click(by('bench-run'));
      await waitIdle();
      await ui.waitFor(by('bench-table'));
      eq(await ui.count('[data-method]'), 4);
      await ui.press('Escape');
    });

    await test('web: cancel a job, the engine still works', async () => {
      await reset();
      const big = path.join(base, 'big.bin');
      fs.writeFileSync(big, noise(40 * 1024 * 1024, 5));
      await pickFiles([big]);
      await ui.waitFor(ui.rowSel('big.bin'));
      await ui.click(ui.rowSel('big.bin'));
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      await ui.choose(by('format'), '7z');
      await ui.fill(by('output'), '/out/big.7z');
      await ui.click(by('create-start'));
      await ui.waitFor(by('progress-dialog'));
      await ui.sleep(200);
      await ui.click(by('progress-cancel'));
      await waitIdle();
      ok(!(await ui.exists(by('result-dialog'))), 'no result after cancel');
      ok(!(await ui.exists(by('error-dialog'))), 'cancel is not an error');
      await ui.click(ui.rowSel('big.bin'));
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      await ui.choose(by('level'), '0');
      await ui.fill(by('output'), '/out/after.zip');
      await ui.click(by('create-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      await closeResult();
    });

    // ── Look and feel ─────────────────────────────────────────────────────────────────────────
    await test('web: switch language', async () => {
      await reset();
      const tip = () => ui.js(`(() => { const b = document.querySelector('[data-testid=btn-pack]'); return b.getAttribute('aria-label'); })()`);
      const before = await tip();
      const lang = await ui.js('document.documentElement.lang');
      await ui.click(by('btn-lang'));
      await ui.until(`document.documentElement.lang !== ${JSON.stringify(lang)}`);
      ok((await tip()) !== before, 'the tooltips changed');
      await ui.click(by('btn-lang'));
      eq(await tip(), before);
    });

    await test('web: theme menu of 40, cycling, kept after reload', async () => {
      await ui.click(by('btn-theme'));
      await ui.waitFor(by('theme-menu'));
      eq(await ui.count(`${by('theme-menu')} [data-theme-pick]`), 40);
      eq(await ui.count(`${by('theme-menu')} [data-theme-group="dark"] [data-theme-pick]`), 20);
      eq(await ui.count(`${by('theme-menu')} [data-theme-group="light"] [data-theme-pick]`), 20);
      const layout = await ui.js(`(() => {
        const top = (s) => document.querySelector(s).getBoundingClientRect().top;
        const dark = [...document.querySelectorAll('[data-theme-group=dark] [data-theme-pick]')].map((e) => e.getBoundingClientRect().top);
        const light = [...document.querySelectorAll('[data-theme-group=light] [data-theme-pick]')].map((e) => e.getBoundingClientRect().top);
        const cols = new Set([...document.querySelectorAll('[data-theme-group=dark] [data-theme-pick]')].map((e) => Math.round(e.getBoundingClientRect().left))).size;
        return { cols, custom: top('[data-testid=theme-custom]'), settings: top('[data-testid=theme-customize]'), dark: top('[data-theme-group=dark]'), light: top('[data-theme-group=light]'), darkRows: new Set(dark).size, lightRows: new Set(light).size };
      })()`);
      ok(layout.custom < layout.dark && layout.settings < layout.dark, 'custom and settings on top');
      ok(layout.dark < layout.light, 'dark above light');
      eq(layout.cols, 2, 'two columns running down');
      eq(layout.darkRows, 10, 'ten rows of dark');
      eq(layout.lightRows, 10, 'ten rows of light');
      ok(await ui.exists(`${by('btn-theme-cycle')} svg`), 'a palette');
      ok((await ui.text(by('theme-current'))).length > 0, 'the dropdown names the theme');
      await ui.press('Escape');
      await ui.waitGone(by('theme-menu'), 2000);
      await ui.click(by('btn-theme-cycle'));
      const a = await ui.attr('html', 'data-theme');
      await ui.click(by('btn-theme-cycle'));
      const b = await ui.attr('html', 'data-theme');
      ok(a !== b, 'cycled');
      await reset();
      eq(await ui.attr('html', 'data-theme'), b);
    });

    await test('web: custom theme: pick, cancel, save', async () => {
      const before = await ui.attr('html', 'data-theme');
      const pick = (key, value) => ui.js(`(() => {
        const el = document.querySelector('[data-custom-color=${key}]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '${value}');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      const bg = () => ui.js(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()`);
      await ui.click(by('btn-theme'));
      await ui.click(by('theme-customize'));
      await ui.waitFor(by('custom-theme-dialog'));
      await pick('bg', '#402010');
      eq(await bg(), '#402010', 'applies as it is chosen');
      await ui.click(by('custom-cancel'));
      eq(await ui.attr('html', 'data-theme'), before, 'cancel restores');
      await ui.click(by('btn-theme'));
      await ui.click(by('theme-customize'));
      await pick('bg', '#102040');
      await pick('accent', '#ff6600');
      await ui.click(by('custom-save'));
      eq(await ui.attr('html', 'data-theme'), 'custom');
      eq(await bg(), '#102040');
      await reset();
      eq(await ui.attr('html', 'data-theme'), 'custom', 'kept across a restart');
      eq(await bg(), '#102040');
      await ui.click(by('btn-theme'));
      await ui.click('[data-theme-pick="dark"]');
      eq(await ui.attr('html', 'data-theme'), 'dark');
    });

    await test(`web: user's guide window`, async () => {
      await ui.click(by('btn-help'));
      const gt = await waitTarget(cdpPort, (t) => t.url.endsWith('#guide'));
      const g = await page(gt);
      await g.waitFor(by('guide-body'));
      includes(await g.text(`${by('guide-body')} h1`), 'MyZipMaster');
      ok((await g.count(`${by('guide-body')} table`)) >= 3);
      ok((await g.count('[data-toc]')) >= 10, 'a contents list');
      const size0 = await g.js(`getComputedStyle(document.querySelector('[data-testid=guide-body]')).fontSize`);
      await g.click(by('guide-size-inc'));
      ok((await g.js(`getComputedStyle(document.querySelector('[data-testid=guide-body]')).fontSize`)) !== size0, 'text size changes');
      await g.click('[data-guide-lang="en"]');
      await g.until(`document.querySelector('[data-testid=guide-body] h1').textContent.includes("User's Guide")`);
      g.c.close();
      await ui.c.send('Target.closeTarget', { targetId: gt.id }).catch(() => {});
    });

    await test('web: settings and about windows', async () => {
      await ui.click(by('btn-settings'));
      const st = await waitTarget(cdpPort, (t) => t.url.endsWith('#settings'));
      const s = await page(st);
      await s.waitFor(by('settings-page'));
      await s.click('[data-settings-tab="compress"]');
      await s.choose('[data-setting="format"]', '7z');
      await s.click('[data-settings-tab="appearance"]');
      eq(await s.count('[data-theme-pick]'), 41);
      await s.click('[data-theme-pick="nord"]');
      await ui.until(`document.documentElement.dataset.theme === 'nord'`, 5000);
      await s.click('[data-settings-tab="general"]');
      await s.click('[data-lang="en"]');
      await ui.until(`document.documentElement.lang === 'en'`, 5000);
      eq(await ui.attr(by('btn-pack'), 'aria-label'), 'Compress the selected files (Ctrl+N)');
      await s.click('[data-lang="ko"]');
      s.c.close();
      await ui.js(`1`);
      await ui.c.send('Target.closeTarget', { targetId: st.id }).catch(() => {});
      // The new default is what the next dialog starts from.
      await pickFiles([path.join(srcDir, 'photo.png')]);
      await ui.waitFor(ui.rowSel('photo.png'));
      await ui.click(ui.rowSel('photo.png'));
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      eq(await ui.value(by('format')), '7z');
      await ui.press('Escape').catch(() => {});
      await ui.click(`${by('create-dialog')} .iconbtn`);

      await ui.click(by('btn-about'));
      const at = await waitTarget(cdpPort, (t) => t.url.endsWith('#about'));
      const a = await page(at);
      await a.waitFor(by('about-page'));
      eq(await a.text(by('about-name')), 'MyZipMaster');
      includes(await a.text(by('about-version')), '1.0.0');
      eq(await a.text(by('about-platform')), '웹');
      a.c.close();
      await ui.c.send('Target.closeTarget', { targetId: at.id }).catch(() => {});
    });

    await test('web: toolbar is icons only, menus are not clipped', async () => {
      const buttons = await ui.js(`[...document.querySelectorAll('[data-testid=toolbar] .toolbar-group button')].map((b) => ({ id: b.dataset.testid, text: b.textContent.trim(), tip: b.getAttribute('aria-label') }))`);
      for (const b of buttons) {
        // The theme dropdown is there to name the current theme.
        if (b.id !== 'btn-theme') eq(b.text, '', `${b.id} has a label`);
        ok(b.tip, `${b.id} has no tooltip`);
      }
      await ui.click(by('btn-file'));
      await ui.center(by('menu-open'));
      await ui.press('Escape');
      await ui.click(by('btn-tools'));
      await ui.center(by('tool-benchmark'));
      await ui.press('Escape');
    });

    await test('web: right panel shows the open archive and a selected entry', async () => {
      await reset();
      await pickFiles([path.join(made, 'plain.zip')]);
      await ui.waitFor(by('panel-open'));
      eq(await ui.text('[data-info="format"]'), 'ZIP');
      await ui.click(ui.rowSel('photo.png'));
      await ui.waitFor(by('panel-entry'));
      eq(await ui.text('[data-info="path"]'), 'photo.png');
      await ui.click(by('btn-right'));
      await ui.waitGone(by('right-panel'));
      await ui.click(by('right-expand'));
      await ui.waitFor(by('right-panel'));
      await ui.click(by('left-collapse'));
      await ui.waitFor(by('left-rail'));
      await ui.click(by('btn-left'));
      await ui.waitFor(by('left-panel'));
      ok(await ui.exists(by('statusbar')));
      ok(!(await ui.exists(by('resize-grip'))), 'a browser sizes its own window');
    });

    await test('web: tabs between the panels, with arrows at their right end', async () => {
      await reset();
      const copies = [];
      for (let i = 0; i < 14; i += 1) {
        const c = path.join(made, `tab-number-${String(i).padStart(2, '0')}.zip`);
        fs.copyFileSync(path.join(made, 'plain.zip'), c);
        copies.push(c);
      }
      for (const c of copies) {
        await pickFiles([c]);
        await ui.waitFor(`[data-tab=${JSON.stringify(path.basename(c))}].on`);
      }
      eq(await ui.count('.ztab'), 15, 'the list and 14 archives');
      const layout = await ui.js(`(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const strip = box('[data-testid=tabstrip]'), left = box('[data-testid=left-panel]'), right = box('[data-testid=right-panel]'), bar = box('[data-testid=toolbar]'), next = box('[data-testid=tabs-next]'), prev = box('[data-testid=tabs-prev]');
        return { between: strip.left >= left.right && strip.right <= right.left, leftTop: left.top - bar.bottom, rightTop: right.top - bar.bottom, arrows: prev.left < next.left && next.right <= strip.right && next.left > box('[data-testid=tabs-scroll]').right - 1 };
      })()`);
      ok(layout.between, 'tabs sit between the panels');
      eq(layout.leftTop, 0, 'left panel right under the toolbar');
      eq(layout.rightTop, 0, 'right panel right under the toolbar');
      ok(layout.arrows, 'arrows at the far right');
      const pos = () => ui.js(`document.querySelector('[data-testid=tabs-scroll]').scrollLeft`);
      ok((await pos()) > 0, 'scrolled to the newest tab');
      ok(!(await ui.disabled(by('tabs-prev'))));
      const at = await pos();
      await ui.click(by('tabs-prev'));
      ok((await pos()) < at, '< scrolls back');
      await ui.click(by('tabs-next'));
      eq(await pos(), at, '> scrolls on');
      // Switching keeps each tab's place.
      await ui.click('[data-tab="tab-number-13.zip"] .ztab-name');
      await ui.dblclick(ui.rowSel('set'));
      await ui.waitFor(ui.rowSel('noise.bin'));
      await ui.click(by('tabs-prev'));
      await ui.click(by('tabs-prev'));
      await ui.click(by('tabs-prev'));
      await ui.click(by('tab-files'));
      await ui.waitFor('[data-tab="files"].on');
      await ui.click(by('tabs-next'));
      await ui.click(by('tabs-next'));
      await ui.click(by('tabs-next'));
      await ui.click('[data-tab="tab-number-13.zip"] .ztab-name');
      await ui.waitFor(ui.rowSel('noise.bin'));
      // Closing goes to a neighbour.
      await ui.click('[data-tab-close="tab-number-13.zip"]');
      await ui.waitGone('[data-tab="tab-number-13.zip"]');
      eq(await ui.count('.ztab'), 14);
      ok(await ui.exists('.ztab.on'));
    });

    await test('web: unusable commands are disabled and grey; delete takes items off the list', async () => {
      await reset();
      eq(await ui.disabled(by('btn-start')), true, 'nothing to go back to yet');
      await pickFiles([path.join(srcDir, 'set/readme.txt'), path.join(made, 'plain.zip')]);
      await ui.waitFor(ui.rowSel('readme.txt'));
      for (const b of ['btn-unpack', 'btn-test', 'btn-convert', 'btn-repair', 'btn-add', 'btn-delete', 'btn-info', 'btn-view']) eq(await ui.disabled(by(b)), true, b);
      eq(await ui.js(`getComputedStyle(document.querySelector('[data-testid=btn-add]')).filter`), 'grayscale(1)');
      await ui.click(ui.rowSel('readme.txt'));
      eq(await ui.disabled(by('btn-delete')), false);
      eq(await ui.disabled(by('btn-unpack')), true, 'not an archive');
      await ui.rightClick(ui.rowSel('readme.txt'));
      await ui.waitFor('.ctxmenu');
      eq(await ui.disabled('[data-menu="extract"]'), true, 'not an archive');
      eq(await ui.disabled('[data-menu="delete"]'), false);
      await ui.click('[data-menu="delete"]');
      await ui.waitGone(ui.rowSel('readme.txt'));
      await ui.click(ui.rowSel('plain.zip'));
      eq(await ui.disabled(by('btn-unpack')), false, 'an archive');
      await ui.click(by('btn-start'));
      await ui.waitFor(by('start-screen'));
      eq(await ui.attr(by('btn-start'), 'aria-pressed'), 'true');
      eq(await ui.disabled(by('btn-delete')), true, 'nothing to delete from the start screen');
      await ui.click(by('btn-start'));
      await ui.waitGone(by('start-screen'));
      ok(await ui.exists(ui.rowSel('plain.zip')), 'back where it was');
    });

    await test('web: split at 10 MB with the stepper, download every part, extract them again', async () => {
      await reset();
      const big = path.join(base, 'thirty.bin');
      const data = noise(25 * 1024 * 1024, 21);
      fs.writeFileSync(big, data);
      await pickFiles([big]);
      await ui.waitFor(ui.rowSel('thirty.bin'));
      clearDownloads();
      await startCreate(async () => {
        await ui.choose(by('format'), '7z');
        await ui.fill(by('output'), '/out/ten.7z');
        await ui.choose(by('level'), '0');
        await ui.choose(by('split'), 'custom');
        eq(await ui.value(by('split-text')), '100');
        for (let i = 0; i < 9; i += 1) await ui.click(by('split-text-dec'));
        eq(await ui.value(by('split-text')), '10', 'ten megabytes a press');
        includes(await ui.text(by('split-hint')), (10485760).toLocaleString());
      });
      const list = await outputs();
      eq(list.map((v) => v.name).join(), 'ten.7z.001,ten.7z.002,ten.7z.003');
      eq(list[0].size, 10485760);
      eq(list[1].size, 10485760);
      await ui.click(by('download-all'));
      const parts = [];
      for (const v of list) parts.push(await waitDownload(v.name, 60000));
      await closeResult();
      // A fresh page, the parts only, as someone receiving them would.
      await reset();
      await pickFiles(parts);
      await ui.waitFor(ui.rowSel('thirty.bin'));
      includes(await ui.text(by('status-volumes')), '3');
      await ui.click(by('btn-unpack'));
      await ui.waitFor(by('extract-dialog'));
      await ui.click(by('extract-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      clearDownloads();
      const out = await download('thirty.bin');
      ok(fs.readFileSync(out).equals(data), 'identical after splitting and extracting');
      await closeResult();
    });

    await test('web: moving background: 20 pictures, transparency and speed', async () => {
      await reset();
      await ui.waitFor(by('start-canvas'));
      eq(await ui.count('[data-bg-card]'), 20);
      eq(await ui.count(`${by('start-footer')} ${by('start-author')}`), 1);
      ok(!(await ui.exists(`${by('start-sec-title')} [data-card-handle]`)), 'the title section does not move');
      const frames = () => ui.js(`document.querySelector('[data-testid=start-canvas]').__zmBackground.frames`);
      const f0 = await frames();
      await ui.sleep(400);
      ok((await frames()) > f0, 'it moves');
      const seen = new Set();
      for (const kind of await ui.attrs('[data-bg-card]', 'data-bg-card')) {
        await ui.click(`[data-bg-card=${kind}]`);
        await ui.sleep(120);
        const picture = await ui.js(`document.querySelector('[data-testid=start-canvas]').toDataURL()`);
        ok(!seen.has(picture), `${kind} draws its own picture`);
        seen.add(picture);
      }
      await ui.click(by('start-transparency-inc'));
      eq(await ui.value(by('start-transparency')), '30');
      eq(await ui.js(`document.querySelector('[data-testid=start-canvas]').style.opacity`), '0.7');
      await ui.click(by('start-speed-inc'));
      eq(await ui.value(by('start-speed')), '110');
      await ui.fill(by('start-speed'), '0');
      await ui.sleep(100);
      const time = () => ui.js(`document.querySelector('[data-testid=start-canvas]').__zmBackground.time`);
      const t0 = await time();
      await ui.sleep(300);
      eq(await time(), t0, 'speed 0 stands still');
      await ui.fill(by('start-speed'), '100');
      await reset();
      eq(await ui.value(by('start-transparency')), '30', 'kept');
    });

    await test('web: an error nobody caught opens a popup with its details and a copy button', async () => {
      await ui.js(`setTimeout(() => { throw new Error('boom on the web'); }, 0); 1`);
      await ui.waitFor(by('error-dialog'));
      includes(await ui.text(by('error-details')), 'boom on the web');
      ok(await ui.exists(by('error-copy')));
      await ui.click(by('error-ok'));
    });

    await test('web: toolbar is not clipped in a narrow window', async () => {
      await ui.c.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
      await ui.sleep(100);
      const clipped = await ui.js(`(() => {
        const bar = document.querySelector('[data-testid=toolbar]');
        const r = bar.getBoundingClientRect();
        return [...bar.querySelectorAll('button')].filter((b) => { const x = b.getBoundingClientRect(); return x.right > r.right + 1 || x.bottom > r.bottom + 1; }).map((b) => b.textContent);
      })()`);
      eq(clipped.length, 0, clipped.join());
      eq(await ui.js('document.documentElement.scrollWidth <= innerWidth'), true, 'no sideways scroll');
      await ui.c.send('Emulation.clearDeviceMetricsOverride');
    });

    await test('web: nothing is uploaded', async () => {
      await ui.c.send('Network.enable');
      const seen = [];
      const before = seen.length;
      await reset();
      await pickFiles([path.join(srcDir, 'set/readme.txt')]);
      await ui.waitFor(ui.rowSel('readme.txt'));
      const external = await ui.js(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => !n.startsWith(location.origin) && !n.startsWith('blob:'))`);
      eq(external.length, before, external.join());
    });
  } finally {
    // Asked nicely first: killing only the main process leaves its helpers holding the profile.
    await ui?.c.send('Browser.close').catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    try { ui?.c.close(); } catch { /* gone */ }
    browser.kill();
    server.kill();
  }
}
