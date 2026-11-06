// The real desktop app: the debug build, on real files in a scratch folder, its dialogs answered
// through a test hook. It runs with its own settings and WebView data, so it never touches a copy
// the user has installed.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq, includes, ok } from '../assert.js';
import { assert7zOk, ALT, assertSameTree, by, CTRL, SHIFT, makeTree, page, readTree, root, scratch, sevenZip, noise, waitTarget } from './ui.mjs';
import { listTargets } from '../../scripts/cdp.mjs';
import { freePort } from '../../scripts/free-port.mjs';

const EXE = path.join(process.env.CARGO_TARGET_DIR || path.join(root, 'target'), 'debug', process.platform === 'win32' ? 'myzipmaster.exe' : 'myzipmaster');

// Sets the window's size the way other programs and Windows Snap do: past the app's minimum.
function osResize(pid, width, height) {
  if (process.platform !== 'win32') return;
  const script = `
Add-Type -Namespace Z -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr a, int x, int y, int w, int t, uint f);'
$h = (Get-Process -Id ${pid}).MainWindowHandle
[Z.U]::SetWindowPos($h, [System.IntPtr]::Zero, 0, 0, ${width}, ${height}, 0x0016) | Out-Null`;
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
}

export default async function suite(runCase) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const built = spawnSync(npm, ['run', '-s', 'build:debug'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 1 << 26 });
  if (built.status !== 0) throw new Error(`build:debug failed\n${built.stderr.slice(-3000)}`);

  const base = scratch('desktop');
  const srcDir = path.join(base, 'src');
  const tree = makeTree(srcDir);
  const out = path.join(base, 'out');
  fs.mkdirSync(out, { recursive: true });
  const setFiles = {};
  for (const [k, v] of Object.entries(tree)) if (k.startsWith('set/')) setFiles[k] = v;

  // Stands in for WinRAR's rar: records its arguments, makes real RAR files from the fixtures.
  const fakeDir = path.join(base, 'fake-rar');
  fs.mkdirSync(fakeDir, { recursive: true });
  const fakeLog = path.join(fakeDir, 'calls.log');
  fs.writeFileSync(path.join(fakeDir, 'fake.mjs'), `
import fs from 'node:fs';
import path from 'node:path';
const here = ${JSON.stringify(fakeDir)};
const fixtures = ${JSON.stringify(path.join(root, 'test', 'fixtures', 'rar'))};
const args = process.argv.slice(2);
fs.appendFileSync(path.join(here, 'calls.log'), JSON.stringify(args) + '\\n');
if (fs.existsSync(path.join(here, 'fail'))) { console.error('bad thing'); process.exit(3); }
process.stdout.write('Creating archive\\n 10%\\b\\b\\b\\b 50%\\b\\b\\b\\b100%\\n');
if (fs.existsSync(path.join(here, 'slow'))) await new Promise((r) => setTimeout(r, 12000));
const archive = args[args.indexOf('--') + 1];
if (args.some((a) => a.startsWith('-v'))) {
  const stem = archive.replace(/\\.rar$/, '');
  for (const n of [1, 2, 3]) fs.copyFileSync(path.join(fixtures, 'multivol.part' + n + '.rar'), stem + '.part' + n + '.rar');
} else fs.copyFileSync(path.join(fixtures, 'm3_default.rar'), archive);
`);
  const fakeRar = path.join(fakeDir, process.platform === 'win32' ? 'rar.cmd' : 'rar');
  fs.writeFileSync(fakeRar, process.platform === 'win32' ? `@"${process.execPath}" "${path.join(fakeDir, 'fake.mjs')}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${path.join(fakeDir, 'fake.mjs')}" "$@"\n`, { mode: 0o755 });

  const cdpPort = await freePort(9450);
  const launch = (extra = []) => spawn(EXE, extra, {
    env: {
      ...process.env,
      MYZIPMASTER_TEST: '1',
      MYZIPMASTER_CONFIG_DIR: path.join(base, 'config'),
      MYZIPMASTER_RAR: fakeRar,
      WEBVIEW2_USER_DATA_FOLDER: path.join(base, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
    },
    stdio: 'ignore',
  });
  let child = launch();
  let ui;
  let failures = 0;

  const isMain = (t) => !t.url.includes('#') && (t.url.includes('index.html') || t.url.includes('tauri.localhost') || t.url.startsWith('tauri:'));
  const connectMain = async () => {
    const target = await waitTarget(cdpPort, isMain, 40000);
    ui = await page(target);
    await ui.waitFor(by('toolbar'), 30000);
    // The window appears when its page is ready, and nobody can click one that has not.
    await ui.until('!document.hidden', 10000);
    await ui.js(`window.__zmDialogs = { open: [], folder: [], save: [] }; 1`);
  };
  const answer = (kind, value) => ui.js(`window.__zmDialogs.${kind}.push(${JSON.stringify(value)}); 1`);
  const waitIdle = () => ui.waitGone(by('progress-dialog'));
  const closeResult = () => ui.click(by('result-close'));
  const cleanScreen = async () => {
    // A reload clears any dialog, even a stuck one. The current folder is not what is on trial.
    await ui.js('location.reload(); 1').catch(() => {});
    await ui.sleep(500);
    await ui.waitFor(by('toolbar'));
    await ui.js(`window.__zmDialogs = { open: [], folder: [], save: [] }; 1`);
    await ui.sleep(300);
    if (await ui.exists(by('start-browse'))) await ui.click(by('start-browse'));
    await ui.sleep(200);
  };
  const setStart = async (on) => {
    if ((await ui.exists(by('start-screen'))) !== on) await ui.click(by('btn-start'));
    await (on ? ui.waitFor(by('start-screen')) : ui.waitGone(by('start-screen')));
  };
  const test = (name, fn) => runCase(name, async () => {
    try {
      await fn();
    } catch (e) {
      failures += 1;
      const said = await ui?.js(`document.querySelector('[data-testid=error-text]')?.parentElement?.textContent ?? ''`).catch(() => '');
      await ui?.shot(path.join(base, `fail-${failures}.png`)).catch(() => {});
      await cleanScreen().catch(() => {});
      if (said) e.message = `${e.message}\n  on screen: ${said}`;
      throw e;
    }
  });

  // Goes to a folder through the app's own navigation.
  const goToFolder = async (dir) => {
    await ui.js(`1`);
    const parent = path.dirname(dir);
    await closeArchive();
    await ui.until('window.__zmOpenFolder');
    // Double-clicking down from the tree would depend on what this machine holds.
    await ui.c.evaluate(`window.__zmOpenFolder?.(${JSON.stringify(dir)}); 1`);
    await ui.until(`document.querySelector('[data-testid=crumbs]')?.textContent.includes(${JSON.stringify(path.basename(dir))}) && !document.querySelector('tr.sel')`);
    return parent;
  };
  const closeArchive = async () => {
    // Closing a tab brings up its neighbour, so until none is left.
    while (await ui.exists(by('status-format'))) {
      await ui.click(by('btn-file'));
      await ui.click(by('menu-close'));
      await ui.sleep(30);
    }
  };
  const openArchive = async (file) => {
    await closeArchive();
    await answer('open', [file]);
    await ui.click(by('btn-file'));
    await ui.click(by('menu-open'));
    await waitIdle();
  };
  const compress = async (sources, output, tweak = async () => {}) => {
    await closeArchive();
    await ui.click(by('btn-pack'));
    await ui.waitFor(by('create-dialog'));
    // Whatever was selected in the list came along; this case says exactly what goes in.
    while (await ui.exists(`${by('sources')} .source-row .iconbtn`)) await ui.click(`${by('sources')} .source-row .iconbtn`);
    for (const s of sources) {
      if (fs.statSync(s).isDirectory()) {
        await answer('folder', s);
        await ui.click(by('add-folder'));
      } else {
        await answer('open', [s]);
        await ui.click(by('add-files'));
      }
      await ui.until(`document.querySelector('[data-testid=sources]').textContent.includes(${JSON.stringify(path.basename(s))})`);
    }
    await ui.fill(by('output'), output);
    await tweak();
    await ui.click(by('create-start'));
    await waitIdle();
    await ui.waitFor(by('result-dialog'));
  };
  const outputs = () => ui.js(`[...document.querySelectorAll('[data-output]')].map((e) => ({ name: e.dataset.output, size: Number(e.querySelector('[data-size]').dataset.size) }))`);

  try {
    await connectMain();

    await test('desktop: plain launch shows the start screen', async () => {
      await ui.waitFor(by('start-screen'));
      ok(await ui.exists(by('start-new')));
      ok(await ui.exists(by('start-open')));
      ok(!(await ui.exists(by('file-table'))));
      eq(await ui.count('.start-format'), 11, 'every format shows its icon');
      await ui.click(by('start-browse'));
      await ui.waitFor(by('file-table'));
      await ui.waitGone(by('start-screen'));
      await ui.until(`document.querySelectorAll('.tree-row[data-disk]').length > 0`);
    });

    await test('desktop: no title bar; brand far left, window buttons far right', async () => {
      ok(!(await ui.exists('.titlebar')), 'no title bar');
      ok(await ui.exists(by('disk-tree')));
      eq(await ui.attr('html', 'data-host'), 'desktop');
      eq(await ui.text(by('brand-name')), 'MyZipMaster');
      eq(await ui.text(by('brand-version')), 'v1.0.0');
      const r = await ui.js(`(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const bar = box('[data-testid=toolbar]');
        return {
          top: bar.top,
          first: document.querySelector('[data-testid=toolbar]').firstElementChild.dataset.testid,
          last: document.querySelector('[data-testid=toolbar]').lastElementChild.dataset.testid,
          right: box('[data-testid=win-close]').right,
          width: innerWidth,
          drag: getComputedStyle(document.querySelector('[data-testid=toolbar]')).webkitAppRegion,
          noDrag: getComputedStyle(document.querySelector('[data-testid=btn-pack]')).webkitAppRegion,
          order: ['win-min', 'win-max', 'win-close'].map((i) => box('[data-testid=' + i + ']').left),
        };
      })()`);
      eq(r.top, 0, 'the toolbar is the top edge');
      eq(r.first, 'brand');
      eq(r.last, 'window-controls');
      ok(Math.abs(r.right - r.width) < 1, 'close is in the corner');
      ok(r.order[0] < r.order[1] && r.order[1] < r.order[2], 'minimize, maximize, close');
      eq(r.drag, 'drag', 'the toolbar moves the window');
      eq(r.noDrag, 'no-drag', 'its buttons still click');
      ok(await ui.count('.tree-row[data-disk]') >= 1);
      eq(await ui.js(`[...document.querySelectorAll('[data-testid=toolbar] svg.icon-color')].every((s) => s.style.color !== '')`), true, 'every toolbar icon has a colour');
    });

    await test('desktop: toolbar is icons only with tooltips', async () => {
      const buttons = await ui.js(`[...document.querySelectorAll('[data-testid=toolbar] .toolbar-group button')].map((b) => ({ id: b.dataset.testid, text: b.textContent.trim(), tip: b.getAttribute('title') || b.getAttribute('data-tip') }))`);
      ok(buttons.length >= 16, `${buttons.length} buttons`);
      for (const b of buttons) {
        // The theme dropdown is there to name the current theme.
        if (b.id !== 'btn-theme') eq(b.text, '', `${b.id} has a label`);
        ok(b.tip, `${b.id} has no tooltip`);
      }
      const { x, y } = await ui.center(by('btn-pack'));
      await ui.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await ui.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 1, y });
      await ui.waitFor('.tooltip', 3000);
      ok((await ui.text('.tooltip')).length > 2);
      await ui.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 400 });
    });

    await test('desktop: menus are not clipped by the toolbar', async () => {
      for (const [btn, item] of [['btn-file', 'menu-open'], ['btn-tools', 'tool-hash']]) {
        await ui.click(by(btn));
        await ui.center(by(item));
        await ui.click(by(btn));
        await ui.waitGone(by(item), 2000);
      }
    });

    await test('desktop: maximize button grows and restores', async () => {
      const w0 = await ui.js('innerWidth');
      await ui.click(by('win-max'));
      await ui.until(`innerWidth !== ${w0}`, 5000);
      await ui.click(by('win-max'));
      await ui.until(`innerWidth === ${w0}`, 5000);
    });

    await test('desktop: panels: title bars, icons, collapse from their button and the toolbar', async () => {
      await ui.waitFor(by('left-panel'));
      await ui.waitFor(by('right-panel'));
      for (const side of ['left', 'right']) {
        ok(await ui.exists(`${by(`${side}-head`)} svg`), `${side} title bar has an icon`);
        ok((await ui.text(`${by(`${side}-head`)} .panel-title`)).length > 0, `${side} title`);
        await ui.click(by(`${side}-collapse`));
        await ui.waitGone(by(`${side}-panel`), 2000);
        await ui.waitFor(by(`${side}-rail`), 2000);
        eq(await ui.attr(by(`btn-${side}`), 'aria-pressed'), 'false');
        await ui.click(by(`${side}-expand`));
        await ui.waitFor(by(`${side}-panel`), 2000);
        await ui.click(by(`btn-${side}`));
        await ui.waitGone(by(`${side}-panel`), 2000);
        await ui.click(by(`btn-${side}`));
        await ui.waitFor(by(`${side}-panel`), 2000);
      }
    });

    await test('desktop: the panels sit right under the toolbar, with visible separators', async () => {
      const r = await ui.js(`(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const bar = box('[data-testid=toolbar]'), left = box('[data-testid=left-panel]'), right = box('[data-testid=right-panel]'), strip = box('[data-testid=tabstrip]'), sep = document.querySelector('.splitter');
        return { left: left.top - bar.bottom, right: right.top - bar.bottom, between: strip.left >= left.right && strip.right <= right.left, seps: document.querySelectorAll('.splitter').length, width: sep.getBoundingClientRect().width, cursor: getComputedStyle(sep).cursor, border: getComputedStyle(sep).borderLeftWidth };
      })()`);
      eq(r.left, 0);
      eq(r.right, 0);
      ok(r.between, 'the tab strip is between the panels');
      eq(r.seps, 2, 'one separator per panel');
      ok(r.width >= 5, 'wide enough to see and grab');
      eq(r.cursor, 'col-resize');
    });

    await test('desktop: tabs: one per archive, switching keeps its place, arrows when they overflow', async () => {
      const copies = [];
      for (let i = 0; i < 16; i += 1) {
        const c = path.join(out, `tab-number-${String(i).padStart(2, '0')}.zip`);
        copies.push(c);
      }
      // Made from the source tree, since this comes before the other cases' archives.
      const r = sevenZip(['a', '-tzip', copies[0], path.join(srcDir, 'set')]);
      ok(r.ok, r.out);
      for (const c of copies.slice(1)) fs.copyFileSync(copies[0], c);
      eq(await ui.disabled(by('tabs-next')), true, 'nothing to scroll yet');
      eq(await ui.disabled(by('tabs-prev')), true, 'nothing to scroll yet');
      for (const c of copies) {
        await answer('open', [c]);
        await ui.click(by('btn-file'));
        await ui.click(by('menu-open'));
        await ui.waitFor(`[data-tab=${JSON.stringify(path.basename(c))}].on`);
      }
      eq(await ui.count('.ztab'), 17);
      const pos = () => ui.js(`document.querySelector('[data-testid=tabs-scroll]').scrollLeft`);
      const at = await pos();
      ok(at > 0, 'the newest tab was scrolled into view');
      ok(await ui.js(`document.querySelector('[data-testid=tabs-next]').getBoundingClientRect().right <= document.querySelector('[data-testid=tabstrip]').getBoundingClientRect().right`), 'arrows at the far right');
      await ui.click(by('tabs-prev'));
      ok((await pos()) < at);
      await ui.click(by('tabs-next'));
      eq(await pos(), at);

      // Each tab remembers where it was.
      await ui.dblclick(ui.rowSel('set'));
      await ui.waitFor(ui.rowSel('noise.bin'));
      await ui.click(by('tabs-prev'));
      await ui.click('.ztab:nth-child(6) .ztab-name');
      await ui.waitFor(ui.rowSel('set'));
      await ui.click(by('tabs-next'));
      await ui.click(by('tabs-next'));
      await ui.click(`[data-tab=${JSON.stringify(path.basename(copies[15]))}] .ztab-name`);
      await ui.waitFor(ui.rowSel('noise.bin'));
      // The Files tab goes back to the list, archives stay open.
      await ui.click(by('tabs-prev'));
      await ui.click(by('tabs-prev'));
      await ui.click(by('tabs-prev'));
      await ui.click(by('tab-files'));
      await ui.waitFor(by('disk-tree'));
      eq(await ui.count('.ztab'), 17);
      // x closes one tab; opening the same file again does not make a second.
      await answer('open', [copies[3]]);
      await ui.click(by('btn-file'));
      await ui.click(by('menu-open'));
      await ui.waitFor(by('status-format'));
      eq(await ui.count('.ztab'), 17, 'no duplicate tab');
      await ui.click(`[data-tab-close=${JSON.stringify(path.basename(copies[3]))}]`);
      eq(await ui.count('.ztab'), 16);
      await closeArchive();
      eq(await ui.count('.ztab'), 1, 'only Files is left');
      for (const c of copies) fs.rmSync(c);
    });

    await test('desktop: drive icons at the top of the left panel', async () => {
      await ui.waitFor(by('drive-bar'));
      const drives = await ui.attrs('[data-drive]', 'data-drive');
      ok(drives.length >= 1, 'at least one drive');
      ok(await ui.exists('[data-drive] svg'), 'with an icon');
      const r = await ui.js(`(() => {
        const head = document.querySelector('[data-testid=left-head]').getBoundingClientRect();
        const bar = document.querySelector('[data-testid=drive-bar]').getBoundingClientRect();
        const body = document.querySelector('[data-testid=left-panel] .sidebar-body').getBoundingClientRect();
        return head.bottom <= bar.top && bar.bottom <= body.top;
      })()`);
      ok(r, 'between the title bar and the tree');
      const target = drives[0];
      await ui.click(`[data-drive=${JSON.stringify(target)}]`);
      await ui.until(`document.querySelector('[data-testid=crumbs]').textContent.includes(${JSON.stringify(target.replace(/[\\/]+$/, ''))})`);
      includes(await ui.attr(`[data-drive=${JSON.stringify(target)}]`, 'class'), 'on');
    });

    await test('desktop: the start button beside the version toggles the start screen', async () => {
      const r = await ui.js(`document.querySelector('[data-testid=btn-start]').getBoundingClientRect().left >= document.querySelector('[data-testid=brand-version]').getBoundingClientRect().right`);
      ok(r, 'right of the version number');
      await goToFolder(srcDir);
      await ui.click(ui.rowSel('photo.png'));
      await ui.click(by('btn-start'));
      await ui.waitFor(by('start-screen'));
      eq(await ui.attr(by('btn-start'), 'aria-pressed'), 'true');
      for (const b of ['btn-unpack', 'btn-test', 'btn-delete', 'btn-view', 'btn-left', 'btn-right']) eq(await ui.disabled(by(b)), true, `${b} on the start screen`);
      await ui.click(by('btn-start'));
      await ui.waitGone(by('start-screen'));
      eq(await ui.attr(by('btn-start'), 'aria-pressed'), 'false');
      ok(await ui.exists(ui.rowSel('photo.png')), 'back where it was');
    });

    await test('desktop: commands that do not apply are disabled and grey', async () => {
      await goToFolder(srcDir);
      for (const b of ['btn-unpack', 'btn-test', 'btn-convert', 'btn-repair', 'btn-add', 'btn-delete', 'btn-info', 'btn-view']) eq(await ui.disabled(by(b)), true, `${b} with nothing selected`);
      eq(await ui.js(`getComputedStyle(document.querySelector('[data-testid=btn-add]')).filter`), 'grayscale(1)');
      await ui.click(ui.rowSel('photo.png'));
      eq(await ui.disabled(by('btn-delete')), false, 'a file can be deleted');
      eq(await ui.disabled(by('btn-unpack')), true, 'a picture cannot be extracted');
      eq(await ui.disabled(by('btn-view')), true, 'a picture is not opened here');
      await ui.rightClick(ui.rowSel('photo.png'));
      await ui.waitFor('.ctxmenu');
      eq(await ui.disabled('[data-menu="extract"]'), true);
      eq(await ui.disabled('[data-menu="open"]'), true);
      eq(await ui.disabled('[data-menu="delete"]'), false);
      eq(await ui.disabled('[data-menu="pack"]'), false);
      await ui.press('Escape');
    });

    await test('desktop: delete in the context menu sends a file to the bin, after asking', async () => {
      await goToFolder(out);
      const f = path.join(out, 'throw-away.txt');
      fs.writeFileSync(f, 'bye');
      await ui.click(by('btn-refresh'));
      await ui.waitFor(ui.rowSel('throw-away.txt'));
      await ui.rightClick(ui.rowSel('throw-away.txt'));
      await ui.click('[data-menu="delete"]');
      await ui.waitFor(by('confirm-dialog'));
      await ui.click(by('confirm-no'));
      ok(fs.existsSync(f), 'no means no');
      await ui.click(ui.rowSel('throw-away.txt'));
      await ui.press('Delete');
      await ui.click(by('confirm-yes'));
      await ui.waitGone(ui.rowSel('throw-away.txt'));
      ok(!fs.existsSync(f));
      ok(fs.existsSync(path.join(base, 'config', 'test-trash', 'throw-away.txt')), 'recoverable, not gone');
      await goToFolder(srcDir);
    });

    await test('desktop: in an archive the menu has delete; a read-only one greys what cannot be done', async () => {
      const a = path.join(out, 'menu.7z');
      const r = sevenZip(['a', '-t7z', '-v64k', a, path.join(srcDir, 'set')]);
      ok(r.ok, r.out);
      await openArchive(`${a}.001`);
      await ui.waitFor(ui.rowSel('set'));
      await ui.rightClick(ui.rowSel('set'));
      await ui.waitFor('.ctxmenu');
      for (const m of ['rename', 'delete', 'newFolder', 'add']) eq(await ui.disabled(`[data-menu="${m}"]`), true, `${m} in a split set`);
      eq(await ui.disabled('[data-menu="extract"]'), false);
      await ui.press('Escape');
      eq(await ui.disabled(by('btn-add')), true);
      await closeArchive();
      const b = path.join(out, 'menu.zip');
      const z = sevenZip(['a', '-tzip', b, path.join(srcDir, 'set')]);
      ok(z.ok, z.out);
      await openArchive(b);
      await ui.waitFor(ui.rowSel('set'));
      await ui.rightClick(ui.rowSel('set'));
      await ui.waitFor('.ctxmenu');
      eq(await ui.disabled('[data-menu="delete"]'), false);
      eq(await ui.disabled('[data-menu="external"]'), true, 'a folder has no default program');
      await ui.press('Escape');
      await closeArchive();
    });

    await test('desktop: the panels resize by dragging their edge', async () => {
      const width = (s) => ui.js(`document.querySelector('[data-testid=${s}]').getBoundingClientRect().width`);
      for (const [sel, side, dx] of [['.splitter:not(.right)', 'left-panel', 60], ['.splitter.right', 'right-panel', -60]]) {
        const before = await width(side);
        const { x, y } = await ui.center(sel).catch(async () => {
          const r = await ui.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 200 }; })()`);
          return r;
        });
        await ui.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await ui.c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
        await ui.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y, button: 'left', buttons: 1 });
        await ui.c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y, button: 'left', clickCount: 1 });
        await ui.sleep(60);
        eq(Math.round(await width(side)), Math.round(before) + 60, side);
      }
    });

    await test('desktop: status bar at the bottom with a triangle of dots in its corner', async () => {
      const r = await ui.js(`(() => {
        const bar = document.querySelector('[data-testid=statusbar]').getBoundingClientRect();
        const grip = document.querySelector('[data-testid=resize-grip]');
        const g = grip.getBoundingClientRect();
        return { barBottom: bar.bottom, h: innerHeight, right: g.right, bottom: g.bottom, w: innerWidth, dots: grip.querySelectorAll('circle').length, cursor: getComputedStyle(grip).cursor };
      })()`);
      eq(r.barBottom, r.h, 'status bar is at the bottom');
      eq(r.right, r.w, 'grip in the corner');
      eq(r.bottom, r.h, 'grip in the corner');
      eq(r.dots, 6, 'a triangle of six dots');
      eq(r.cursor, 'nwse-resize');
    });

    await test('desktop: browse folders: double-click, up, find', async () => {
      await goToFolder(srcDir);
      await ui.waitFor(ui.rowSel('set'));
      await ui.dblclick(ui.rowSel('set'));
      await ui.waitFor(ui.rowSel('readme.txt'));
      await ui.fill(by('filter'), 'read');
      eq((await ui.rows()).join(), 'readme.txt');
      await ui.fill(by('filter'), '');
      await ui.press('Backspace');
      await ui.waitFor(ui.rowSel('photo.png'));
      await ui.click('th[data-col="mtime"]');
      await ui.click('th[data-col="name"]');
      await ui.click(by('btn-refresh'));
      ok(await ui.exists(ui.rowSel('set')));
    });

    await test('desktop: format icons show in the list', async () => {
      const zip = path.join(srcDir, 'icon-check.7z');
      fs.writeFileSync(zip, 'x');
      await ui.click(by('btn-refresh'));
      await ui.waitFor(ui.rowSel('icon-check.7z'));
      eq(await ui.attr(`${ui.rowSel('icon-check.7z')} .file-icon`, 'data-icon'), '7z');
      await ui.until(`document.querySelector(${JSON.stringify(`${ui.rowSel('icon-check.7z')} img`)}).naturalWidth > 0`);
      fs.rmSync(zip);
      await ui.click(by('btn-refresh'));
    });

    await test('desktop: select, ZIP, result, verified by 7-Zip', async () => {
      await ui.click(ui.rowSel('set'));
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      eq(await ui.count(`${by('sources')} .source-row`), 1);
      includes(await ui.value(by('output')), 'set.zip');
      await ui.fill(by('output'), path.join(out, 'plain.zip'));
      await ui.click(by('create-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      assert7zOk(path.join(out, 'plain.zip'));
      await closeResult();
    });

    await test('desktop: right panel shows a selected archive as items and values', async () => {
      await closeArchive();
      await goToFolder(out);
      await ui.waitFor(ui.rowSel('plain.zip'));
      await ui.click(ui.rowSel('plain.zip'));
      await ui.waitFor(by('panel-archive'));
      eq(await ui.text(by('panel-name')), 'plain.zip');
      eq(await ui.text('[data-info="format"]'), 'ZIP');
      eq(await ui.text('[data-info="files"]'), '5');
      eq(await ui.text('[data-info="encrypted"]'), await ui.text('[data-info="solid"]'));
      ok((await ui.count(`${by('panel-archive')} dt`)) >= 10, 'item and value rows');
      // Nothing selected: nothing to show. A plain file: its own facts, no archive ones.
      fs.writeFileSync(path.join(out, 'plain.txt'), 'x');
      await ui.click(by('btn-refresh'));
      await ui.waitFor(ui.rowSel('plain.txt'));
      await ui.click(ui.rowSel('plain.txt'));
      await ui.waitFor(by('panel-file'));
      ok(!(await ui.exists(by('panel-archive'))));
      // Inside an archive: the archive, then a chosen entry.
      await openArchive(path.join(out, 'plain.zip'));
      await ui.waitFor(by('panel-open'));
      eq(await ui.text('[data-info="format"]'), 'ZIP');
      await ui.dblclick(ui.rowSel('set'));
      await ui.click(ui.rowSel('readme.txt'));
      await ui.waitFor(by('panel-entry'));
      eq(await ui.text('[data-info="path"]'), 'set/readme.txt');
      eq(await ui.text('[data-info="method"]'), 'Deflate');
      await closeArchive();
      await goToFolder(srcDir);
    });

    await test('desktop: right panel: encrypted names ask for nothing and say so', async () => {
      const r = sevenZip(['a', '-t7z', '-pabc', '-mhe=on', path.join(out, 'hidden.7z'), path.join(srcDir, 'photo.png')]);
      ok(r.ok, r.out);
      await goToFolder(out);
      await ui.waitFor(ui.rowSel('hidden.7z'));
      await ui.click(ui.rowSel('hidden.7z'));
      await ui.waitFor(by('panel-locked'));
      ok(!(await ui.exists(by('password-dialog'))), 'selecting must not prompt');
      await goToFolder(srcDir);
    });

    await test('desktop: asks before overwriting a file', async () => {
      const a = path.join(out, 'exists.zip');
      fs.writeFileSync(a, 'precious');
      await ui.click(ui.rowSel('photo.png'));
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      await ui.fill(by('output'), a);
      await ui.click(by('create-start'));
      await ui.waitFor(by('confirm-dialog'));
      eq(fs.readFileSync(a, 'utf8'), 'precious', 'not touched yet');
      await ui.click(by('confirm-yes'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      assert7zOk(a);
      await closeResult();
    });

    for (const [format, name, preset, limit, firstName, lastName, exact] of [
      ['zip', 'v1.zip', ['custom', '128', 'KB'], 131072, 'v1.z01', 'v1.zip', false],
      ['7z', 'v2.7z', ['custom', '200', 'KB'], 204800, 'v2.7z.001', null, true],
      ['rar', 'v3.rar', ['custom', '256', 'KB'], 262144, null, null, false],
      ['tar.gz', 'v4.tar.gz', ['custom', '150', 'KB'], 153600, 'v4.tar.gz.001', null, true],
    ]) {
      await test(`desktop: ${format} split to size (sizes checked on disk)`, async () => {
        await compress([path.join(srcDir, 'set')], path.join(out, name), async () => {
          await ui.choose(by('format'), format);
          await ui.fill(by('output'), path.join(out, name));
          await ui.choose(by('split'), preset[0]);
          await ui.fill(by('split-text'), preset[1]);
          await ui.choose(by('split-unit'), preset[2]);
        });
        const list = await outputs();
        ok(list.length >= 2, `${list.length} parts`);
        if (firstName) eq(list[0].name, firstName);
        if (lastName) eq(list[list.length - 1].name, lastName);
        list.forEach((v, i) => {
          const real = fs.statSync(path.join(out, v.name)).size;
          eq(real, v.size, `${v.name} on disk`);
          ok(real <= limit, `${v.name} is ${real}, over ${limit}`);
          if (exact && i + 1 < list.length) eq(real, limit, `${v.name} is exact`);
        });
        const entry = format === 'zip' ? list[list.length - 1].name : list[0].name;
        assert7zOk(path.join(out, entry));
        await closeResult();
      });
    }

    await test('desktop: a set opens from any part, read-only', async () => {
      const parts = fs.readdirSync(out).filter((n) => /^v2\.7z\.\d+$/.test(n)).sort();
      await openArchive(path.join(out, parts[1]));
      await ui.waitFor(ui.rowSel('set'));
      includes(await ui.text(by('status-volumes')), String(parts.length));
      ok(await ui.exists(by('status-readonly')));
      ok(await ui.disabled(by('btn-add')));
      ok(await ui.disabled(by('btn-delete')));
      await ui.click(by('btn-info'));
      await ui.waitFor(by('info-dialog'));
      eq(await ui.text(by('info-volumes')), String(parts.length));
      await ui.press('Escape');
    });

    await test('desktop: extract a split set, matches the originals', async () => {
      await ui.click(by('btn-unpack'));
      await ui.waitFor(by('extract-dialog'));
      const dest = path.join(out, 'from-parts');
      await ui.fill(by('extract-dest'), dest);
      await ui.click(by('extract-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      await closeResult();
      assertSameTree(readTree(dest), setFiles, 'extracted from parts');
      ok(fs.statSync(path.join(dest, 'set/empty-folder')).isDirectory(), 'empty folder comes back');
    });

    await test('desktop: a missing part is reported', async () => {
      await closeArchive();
      const parts = fs.readdirSync(out).filter((n) => /^v1\.z\d+$/.test(n)).sort();
      fs.renameSync(path.join(out, parts[0]), path.join(out, 'moved.bak'));
      await answer('open', [path.join(out, 'v1.zip')]);
      await ui.click(by('btn-file'));
      await ui.click(by('menu-open'));
      await ui.waitFor(by('error-dialog'));
      fs.renameSync(path.join(out, 'moved.bak'), path.join(out, parts[0]));
      await ui.click(by('error-ok'));
    });

    await test('desktop: password: create, wrong, right', async () => {
      await compress([path.join(srcDir, 'set')], path.join(out, 'locked.7z'), async () => {
        await ui.choose(by('format'), '7z');
        await ui.fill(by('output'), path.join(out, 'locked.7z'));
        await ui.fill(by('password'), 'secret42');
        await ui.fill(by('confirm'), 'secret42');
        await ui.click(by('encrypt-names'));
      });
      await closeResult();
      assert7zOk(path.join(out, 'locked.7z'), 'secret42');
      await answer('open', [path.join(out, 'locked.7z')]);
      await ui.click(by('btn-file'));
      await ui.click(by('menu-open'));
      await ui.waitFor(by('password-dialog'));
      await ui.fill(by('password-input'), 'nope');
      await ui.click(by('password-ok'));
      await ui.until(`document.querySelector('[data-testid=password-prompt]')?.className.includes('warn')`);
      await ui.fill(by('password-input'), 'secret42');
      await ui.click(by('password-ok'));
      await ui.waitFor(ui.rowSel('set'));
      await ui.click(by('btn-test'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      includes(await ui.attr(by('result-line'), 'class'), 'ok');
      await closeResult();
    });

    await test('desktop: ZIP cipher choice and lock mark', async () => {
      await compress([path.join(srcDir, 'set/readme.txt')], path.join(out, 'zc.zip'), async () => {
        await ui.fill(by('password'), 'pw');
        await ui.fill(by('confirm'), 'pw');
        await ui.choose(by('cipher'), 'zipcrypto');
      });
      await closeResult();
      assert7zOk(path.join(out, 'zc.zip'), 'pw');
      await answer('open', [path.join(out, 'zc.zip')]);
      await ui.click(by('btn-file'));
      await ui.click(by('menu-open'));
      await waitIdle();
      await ui.waitFor(by('lock'));
      includes(await ui.text(`${ui.rowSel('readme.txt')}`), 'ZipCrypto');
    });

    await test('desktop: preview, open with default program', async () => {
      await openArchive(path.join(out, 'plain.zip'));
      await ui.waitFor(ui.rowSel('set'));
      await ui.dblclick(ui.rowSel('set'));
      await ui.dblclick(ui.rowSel('readme.txt'));
      await ui.waitFor(by('preview-text'));
      includes(await ui.text(by('preview-text')), 'MyZipMaster test file');
      await ui.click(by('preview-external'));
      await ui.sleep(300);
      ok(!(await ui.exists(by('error-dialog'))), 'extracted for opening');
      await ui.press('Escape');
    });

    await test('desktop: extract selection, conflicts: skip, rename, overwrite', async () => {
      const dest = path.join(out, 'conflict');
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(path.join(dest, 'readme.txt'), 'mine');
      const run = async (choice) => {
        await ui.click(ui.rowSel('readme.txt'));
        await ui.click(by('btn-unpack'));
        await ui.waitFor(by('extract-dialog'));
        await ui.fill(by('extract-dest'), dest);
        eq(await ui.value(by('extract-scope')), 'selected');
        await ui.click(by('extract-start'));
        await ui.waitFor(by('conflict-dialog'));
        includes(await ui.text(by('conflict-text')), '1');
        await ui.click(by(`conflict-${choice}`));
        await waitIdle();
        await ui.waitFor(by('result-dialog'));
        await closeResult();
      };
      await run('skip');
      eq(fs.readFileSync(path.join(dest, 'readme.txt'), 'utf8'), 'mine');
      await run('rename');
      eq(fs.readFileSync(path.join(dest, 'readme.txt'), 'utf8'), 'mine');
      ok(fs.readFileSync(path.join(dest, 'readme (1).txt')).equals(tree['set/readme.txt']));
      await run('overwrite');
      ok(fs.readFileSync(path.join(dest, 'readme.txt')).equals(tree['set/readme.txt']));
      await ui.click(by('btn-up'));
    });

    await test('desktop: edit: add, rename, delete, comment', async () => {
      await compress([path.join(srcDir, 'set')], path.join(out, 'edit.zip'));
      await closeResult();
      await answer('open', [path.join(out, 'edit.zip')]);
      await ui.click(by('btn-file'));
      await ui.click(by('menu-open'));
      await ui.waitFor(ui.rowSel('set'));
      await answer('open', [path.join(srcDir, 'photo.png')]);
      await ui.click(by('btn-add'));
      await waitIdle();
      await ui.waitFor(ui.rowSel('photo.png'));
      await ui.click(ui.rowSel('photo.png'));
      await ui.press('F2');
      await ui.waitFor(by('prompt-dialog'));
      await ui.fill(by('prompt-input'), 'picture.png');
      await ui.click(by('prompt-ok'));
      await waitIdle();
      await ui.waitFor(ui.rowSel('picture.png'));
      await ui.dblclick(ui.rowSel('set'));
      await ui.waitFor(ui.rowSel('noise.bin'));
      await ui.click(ui.rowSel('noise.bin'));
      await ui.press('Delete');
      await ui.waitFor(by('confirm-dialog'));
      await ui.click(by('confirm-yes'));
      await waitIdle();
      await ui.waitGone(ui.rowSel('noise.bin'));
      await ui.rightClick(ui.rowSel('readme.txt'));
      await ui.waitFor('.ctxmenu');
      ok(await ui.count('.ctxmenu-item') >= 7);
      ok(await ui.exists('[data-menu="delete"]'));
      await ui.press('Escape');
      await ui.press('Enter', { modifiers: ALT });
      await ui.waitFor(by('info-dialog'));
      await ui.fill(by('info-comment'), 'desktop comment');
      await ui.click(by('save-comment'));
      await waitIdle();
      await ui.waitGone(by('info-dialog'));
      const list = sevenZip(['l', path.join(out, 'edit.zip')]);
      ok(list.ok, list.out);
      includes(list.out, 'picture.png');
      includes(list.out, 'desktop comment');
      ok(!list.out.includes('noise.bin'), 'deleted');
    });

    await test('desktop: convert ZIP to split 7z', async () => {
      await ui.click(by('btn-convert'));
      await ui.waitFor(by('create-dialog'));
      await ui.choose(by('format'), '7z');
      await ui.fill(by('output'), path.join(out, 'conv.7z'));
      await ui.choose(by('split'), 'custom');
      await ui.fill(by('split-text'), '64');
      await ui.choose(by('split-unit'), 'KB');
      await ui.click(by('create-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      assert7zOk(path.join(out, 'conv.7z.001'));
      await closeResult();
    });

    await test('desktop: repair a truncated ZIP', async () => {
      await closeArchive();
      const whole = fs.readFileSync(path.join(out, 'plain.zip'));
      const broken = path.join(out, 'broken.zip');
      fs.writeFileSync(broken, whole.subarray(0, whole.indexOf(Buffer.from([0x50, 0x4b, 1, 2]))));
      await goToFolder(out);
      await ui.waitFor(ui.rowSel('broken.zip'));
      await ui.click(ui.rowSel('broken.zip'));
      await ui.click(by('btn-repair'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      includes(await ui.attr(by('result-line'), 'class'), 'ok');
      assert7zOk(path.join(out, 'broken.repaired.zip'));
      await closeResult();
    });

    await test('desktop: from the list: test, extract here, extract to named folder', async () => {
      await ui.click(by('btn-refresh'));
      await ui.waitFor(ui.rowSel('plain.zip'));
      await ui.click(ui.rowSel('plain.zip'));
      await ui.click(by('btn-test'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      await closeResult();

      const here = path.join(out, 'quick');
      fs.mkdirSync(here, { recursive: true });
      const copy = path.join(here, 'q.zip');
      fs.copyFileSync(path.join(out, 'plain.zip'), copy);
      await goToFolder(here);
      await ui.waitFor(ui.rowSel('q.zip'));
      await ui.click(ui.rowSel('q.zip'));
      await ui.click(by('btn-unpack-more'));
      await ui.click(by('unpack-named'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      await closeResult();
      ok(fs.existsSync(path.join(here, 'q', 'set', 'readme.txt')), 'named folder');
      await ui.click(ui.rowSel('q.zip'));
      await ui.click(by('btn-unpack-more'));
      await ui.click(by('unpack-here'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      await closeResult();
      ok(fs.existsSync(path.join(here, 'set', 'readme.txt')), 'here');
    });

    await test('desktop: make a self-extractor and run it', async () => {
      await ui.click(by('btn-tools'));
      await ui.click(by('tool-sfx'));
      await ui.waitFor(by('create-dialog'));
      while (await ui.exists(`${by('sources')} .source-row .iconbtn`)) await ui.click(`${by('sources')} .source-row .iconbtn`);
      await answer('folder', path.join(srcDir, 'set'));
      await ui.click(by('add-folder'));
      await ui.until(`document.querySelector('[data-testid=sources]').textContent.includes('set')`);
      const exe = path.join(out, process.platform === 'win32' ? 'self.exe' : 'self');
      await ui.fill(by('output'), exe);
      ok(await ui.js(`document.querySelector('[data-testid=sfx]').checked`));
      await ui.click(by('create-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      await closeResult();
      const dest = path.join(out, 'sfx-out');
      if (process.platform !== 'win32') fs.chmodSync(exe, 0o755);
      const r = spawnSync(exe, [dest, '-y'], { encoding: 'utf8' });
      eq(r.status, 0, r.stderr);
      assertSameTree(readTree(dest), setFiles, 'self-extracted');
    });

    await test(`desktop: checksums match Node's`, async () => {
      const file = path.join(srcDir, 'set/noise.bin');
      await goToFolder(srcDir);
      await ui.click(by('btn-tools'));
      await ui.click(by('tool-hash'));
      await ui.waitFor(by('hash-dialog'));
      await answer('open', [file]);
      await ui.click(by('hash-add-files'));
      await ui.until(`document.querySelector('[data-testid=hash-files]')?.textContent.includes('noise.bin')`);
      for (const a of ['md5', 'sha1', 'sha512', 'crc64', 'blake3']) await ui.click(`[data-hash="${a}"]`);
      await ui.click(by('hash-start'));
      await waitIdle();
      await ui.waitFor(by('hash-table'));
      const data = fs.readFileSync(file);
      for (const a of ['md5', 'sha1', 'sha256', 'sha512']) eq(await ui.text(by(`hash-${a}`)), crypto.createHash(a).update(data).digest('hex'), a);
      await ui.press('Escape');
    });

    await test('desktop: split and join a file', async () => {
      const file = path.join(out, 'chunk.bin');
      const data = noise(800000, 3);
      fs.writeFileSync(file, data);
      await ui.click(by('btn-tools'));
      await ui.click(by('tool-split'));
      await ui.waitFor(by('split-dialog'));
      await answer('open', [file]);
      await ui.click(by('split-pick'));
      await ui.until(`document.querySelector('[data-testid=split-file]').textContent === 'chunk.bin'`);
      await ui.fill(by('split-size'), '300');
      await ui.choose(by('split-size-unit'), 'KB');
      await ui.click(by('split-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      await closeResult();
      eq(fs.statSync(`${file}.001`).size, 307200);
      eq(fs.statSync(`${file}.002`).size, 307200);
      eq(fs.statSync(`${file}.003`).size, 800000 - 2 * 307200);

      await ui.click(by('btn-tools'));
      await ui.click(by('tool-join'));
      await ui.waitFor(by('join-dialog'));
      await answer('open', [`${file}.002`]);
      await ui.click(by('join-pick'));
      await ui.until(`document.querySelector('[data-testid=join-file]').textContent !== ''`);
      await ui.fill(by('join-output'), path.join(out, 'chunk-joined.bin'));
      await ui.click(by('join-start'));
      await waitIdle();
      await ui.waitFor(by('result-dialog'));
      await closeResult();
      ok(fs.readFileSync(path.join(out, 'chunk-joined.bin')).equals(data));
    });

    await test('desktop: benchmark', async () => {
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

    await test('desktop: cancel leaves nothing behind', async () => {
      const big = path.join(out, 'big.bin');
      fs.writeFileSync(big, noise(60 * 1024 * 1024, 2));
      const target = path.join(out, 'cancelled.7z');
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      while (await ui.exists(`${by('sources')} .source-row .iconbtn`)) await ui.click(`${by('sources')} .source-row .iconbtn`);
      await answer('open', [big]);
      await ui.click(by('add-files'));
      await ui.until(`document.querySelector('[data-testid=sources]').textContent.includes('big.bin')`);
      await ui.fill(by('output'), target);
      await ui.choose(by('format'), '7z');
      await ui.fill(by('output'), target);
      await ui.choose(by('level'), '9');
      await ui.click(by('create-start'));
      await ui.waitFor(by('progress-dialog'));
      await ui.sleep(300);
      await ui.click(by('progress-cancel'));
      await waitIdle();
      ok(!(await ui.exists(by('result-dialog'))), 'no result after cancel');
      ok(!(await ui.exists(by('error-dialog'))), `no error after cancel: ${await ui.text(by('error-text'))}`);
      ok(!fs.existsSync(target), 'no archive after cancel');
      ok(!fs.existsSync(`${target}.zmtmp`), 'no temporary left');
      fs.rmSync(big);
    });

    await test('desktop: recent files', async () => {
      await ui.click(by('btn-file'));
      await ui.waitFor(by('file-menu'));
      ok((await ui.count('[data-recent]')) >= 1);
      const first = await ui.attr('[data-recent]', 'data-recent');
      await ui.click('[data-recent]');
      await waitIdle();
      await ui.waitFor(by('status-format'));
      includes(await ui.js('document.title'), path.basename(first));
      includes(await ui.text(by('crumbs')), path.basename(first));
      await closeArchive();
    });

    await test('desktop: theme menu is its own window, reaching past a small main window', async () => {
      osResize(child.pid, 500, 300);
      await ui.sleep(500);
      const mainHeight = await ui.js('innerHeight');
      await ui.click(by('btn-theme'));
      const mt = await waitTarget(cdpPort, (t) => t.url.endsWith('#thememenu'));
      const m = await page(mt);
      await m.waitFor(by('theme-menu'));
      await m.sleep(400);
      const r = await m.js(`(() => {
        const top = (s) => document.querySelector(s).getBoundingClientRect().top;
        const box = document.querySelector('[data-testid=theme-menu]').getBoundingClientRect();
        const chips = (g) => [...document.querySelectorAll('[data-theme-group=' + g + '] [data-theme-pick]')].map((e) => e.getBoundingClientRect());
        const dark = chips('dark'), light = chips('light');
        return { w: innerWidth, h: innerHeight, boxW: box.width, boxH: box.height, sx: document.documentElement.scrollWidth, sy: document.documentElement.scrollHeight, custom: top('[data-testid=theme-custom]'), settings: top('[data-testid=theme-customize]'), dark: top('[data-theme-group=dark]'), light: top('[data-theme-group=light]'), darkRows: new Set(dark.map((x) => x.top)).size, lightRows: new Set(light.map((x) => x.top)).size, darkCols: new Set(dark.map((x) => Math.round(x.left))).size, lightCols: new Set(light.map((x) => Math.round(x.left))).size, picks: dark.length + light.length };
      })()`);
      ok(r.h > mainHeight, `the menu (${r.h}) is taller than the main window (${mainHeight}), so it reaches past it`);
      ok(r.boxW <= r.w + 1 && r.boxH <= r.h + 1, `all of the menu fits its window: ${r.boxW}x${r.boxH} in ${r.w}x${r.h}`);
      ok(r.sx <= r.w && r.sy <= r.h, 'no scrolling');
      ok(r.custom < r.dark && r.settings < r.dark, 'custom and settings first');
      ok(r.dark < r.light, 'dark above light');
      eq(r.darkCols, 2, 'two columns running down');
      eq(r.lightCols, 2, 'two columns running down');
      eq(r.darkRows, 10);
      eq(r.lightRows, 10);
      eq(r.picks, 40);
      // A pick applies to the main window at once.
      await m.click('[data-theme-pick="dracula"]');
      await ui.until(`document.documentElement.dataset.theme === 'dracula'`, 5000);
      // Customize from the menu opens the dialog in the main window.
      await ui.sleep(350);
      await ui.click(by('btn-theme'));
      await m.sleep(300);
      await m.click(by('theme-customize'));
      await ui.waitFor(by('custom-theme-dialog'));
      await ui.click(by('custom-cancel'));
      eq(await ui.attr('html', 'data-theme'), 'dracula', 'cancel restores');
      m.c.close();
      osResize(child.pid, 1280, 800);
      await ui.sleep(400);
    });

    await test('desktop: settings window reaches the main window and the disk', async () => {
      await ui.click(by('btn-settings'));
      const st = await waitTarget(cdpPort, (t) => t.url.endsWith('#settings'));
      const s = await page(st);
      await s.waitFor(by('settings-page'));
      const noScroll = async (tab) => {
        const r = await s.js(`(() => {
          const over = [...document.querySelectorAll('.settings-page, .settings-page-body, .settings-form, .settings-panel, .theme-groups')].filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map((e) => e.className + ' ' + e.scrollHeight + '/' + e.clientHeight);
          return over.join('; ');
        })()`);
        eq(r, '', `the ${tab} tab overflows`);
      };
      for (const tab of ['general', 'start', 'extract', 'compress', 'appearance']) {
        await s.click(`[data-settings-tab="${tab}"]`);
        await noScroll(tab);
      }
      await s.click('[data-settings-tab="compress"]');
      await s.choose('[data-setting="format"]', '7z');
      await s.choose('[data-setting="split"]', 'custom');
      await noScroll('compress, with a custom size');
      await s.choose('[data-setting="split"]', 'none');
      await s.click('[data-settings-tab="appearance"]');
      eq(await s.count('[data-theme-pick]'), 41, '40 themes and the custom one');
      await s.click('[data-theme-pick="nord"]');
      await ui.until(`document.documentElement.dataset.theme === 'nord'`, 5000);
      await s.click('[data-settings-tab="general"]');
      for (let i = 0; i < 2; i += 1) await s.click(by('set-scale-inc'));
      eq(await s.value(by('set-scale')), '110');
      await ui.until(`document.documentElement.style.zoom === '1.1'`, 5000);
      await s.fill(by('set-scale'), '100');
      await s.click('[data-settings-tab="start"]');
      await s.click(by('set-transparency-inc'));
      await s.click('[data-bg-card=volumes]');
      eq(await s.count('[data-bg-card]'), 20);
      await ui.until(`JSON.parse(localStorage.getItem('zm-settings')).startBg === 'volumes'`, 5000);
      await s.click('[data-settings-tab="appearance"]');
      await s.click('[data-settings-tab="general"]');
      await s.click('[data-lang="en"]');
      await ui.until(`document.documentElement.lang === 'en'`, 5000);
      eq(await ui.attr(by('btn-pack'), 'aria-label'), 'Compress the selected files (Ctrl+N)');
      await s.click('[data-lang="ko"]');
      await s.click(by('settings-ok'));
      await ui.sleep(400);
      s.c.close();
      const saved = JSON.parse(fs.readFileSync(path.join(base, 'config', 'settings.json'), 'utf8'));
      eq(saved.settings.format, '7z');
      eq(saved['zm-theme'], 'nord');
      eq(saved['zm-lang'], 'ko');
    });

    await test('desktop: settings, about and guide can each be closed and opened again', async () => {
      await setStart(false);
      for (const [button, route, closer] of [
        ['btn-settings', '#settings', by('settings-ok')],
        ['btn-about', '#about', '.settings-page-foot .btn.primary'],
        ['btn-help', '#guide', '.guide-tools .iconbtn'],
      ]) {
        for (let round = 0; round < 2; round += 1) {
          await ui.click(by(button));
          const target = await waitTarget(cdpPort, (t) => t.url.endsWith(route));
          const w = await page(target);
          await w.waitFor(closer);
          await w.click(closer).catch(() => {});
          w.c.close();
          const t0 = Date.now();
          while ((await listTargets(cdpPort)).some((t) => t.url.endsWith(route))) {
            ok(Date.now() - t0 < 8000, `${route} did not close`);
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      }
    });

    await test('desktop: about window', async () => {
      await ui.click(by('btn-about'));
      const at = await waitTarget(cdpPort, (t) => t.url.endsWith('#about'));
      const a = await page(at);
      await a.waitFor(by('about-page'));
      eq(await a.text(by('about-name')), 'MyZipMaster');
      includes(await a.text(by('about-version')), '1.0.0');
      includes(await a.text(by('about-platform')), process.platform === 'win32' ? 'windows' : '');
      // No scroll bar in either language: English is the longer.
      for (const lang of ['ko', 'en', 'ko']) {
        await ui.js(`document.documentElement.lang === ${JSON.stringify(lang)} || document.querySelector('[data-testid=btn-lang]').click(); 1`);
        await a.until(`document.querySelector('[data-testid=about-page]').textContent.includes(${JSON.stringify(lang === 'en' ? 'Supported file formats' : '지원하는 파일 형식')})`, 5000);
        await a.sleep(150);
        const fits = await a.js(`[...document.querySelectorAll('.settings-page, .settings-page-body')].every((e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1)`);
        ok(fits, `the About window fits in ${lang}`);
      }
      for (const name of ['ZIP', '7Z', 'RAR', 'TAR.ZST', 'XZ']) includes(await a.text(by('about-formats-both')), name);
      includes(await a.text(by('about-formats-read')), 'CAB');
      includes(await a.text(by('about-formats-read')), 'ISO');
      includes(await a.text(by('about-formats-split')), '.part1.rar');
      ok(await a.js(`[...document.querySelectorAll('.about-format-icons img')].length === 11 && [...document.querySelectorAll('.about-format-icons img')].every((i) => i.complete && i.naturalWidth > 0)`), 'with their pictures');
      eq(await a.js(`document.querySelector('.settings-page-body').scrollHeight <= document.querySelector('.settings-page-body').clientHeight + 1`), true, 'no scrolling in the About box');
      await a.click('.settings-page-foot .btn.primary').catch(() => {});
      a.c.close();
    });

    for (const lang of ['ko', 'en']) {
      await test(`desktop: shrinking never clips the toolbar (${lang})`, async () => {
        if (await ui.js('document.documentElement.lang') !== lang) await ui.click(by('btn-lang'));
        await ui.sleep(300);
        osResize(child.pid, 500, 300);
        await ui.sleep(700);
        const r = await ui.js(`(() => {
          const bar = document.querySelector('[data-testid=toolbar]');
          const box = bar.getBoundingClientRect();
          const cut = [...bar.querySelectorAll('button')].filter((b) => { const x = b.getBoundingClientRect(); return x.right > box.right + 0.5 || x.bottom > box.bottom + 0.5 || x.right > innerWidth; }).map((b) => b.dataset.testid);
          return { cut, w: innerWidth, h: innerHeight, over: document.documentElement.scrollWidth > innerWidth, rows: bar.getBoundingClientRect().height };
        })()`);
        eq(r.cut.join(), '', `clipped at ${r.w}x${r.h}`);
        eq(r.over, false, 'no sideways scroll');
        eq(r.rows, 44, 'one row');
        osResize(child.pid, 1280, 800);
        await ui.sleep(400);
      });
    }
    await ui.js(`localStorage.getItem('zm-lang')`);

    await test('desktop: split at 10 MB with the stepper, then extract each format and compare', async () => {
      const big = path.join(out, 'twentyfive.bin');
      const data = noise(25 * 1024 * 1024, 31);
      fs.writeFileSync(big, data);
      for (const [format, name, firstPart, parts, exact] of [
        ['zip', 'tm.zip', 'tm.z01', 3, false],
        ['7z', 'tm.7z', 'tm.7z.001', 3, true],
        ['rar', 'tm.rar', 'tm.part1.rar', 3, false],
      ]) {
        await compress([big], path.join(out, name), async () => {
          await ui.choose(by('format'), format);
          await ui.fill(by('output'), path.join(out, name));
          await ui.choose(by('level'), '0');
          await ui.choose(by('split'), 'custom');
          await ui.choose(by('split-unit'), 'MB');
          await ui.fill(by('split-text'), '100');
          for (let i = 0; i < 9; i += 1) await ui.click(by('split-text-dec'));
          eq(await ui.value(by('split-text')), '10', 'ten megabytes a press');
          await ui.click(by('split-text-inc'));
          eq(await ui.value(by('split-text')), '20');
          await ui.click(by('split-text-dec'));
        });
        const list = await outputs();
        eq(list.length, parts, `${format} parts: ${list.map((v) => v.name).join()}`);
        eq(list[0].name, firstPart);
        list.forEach((v, i) => {
          const real = fs.statSync(path.join(out, v.name)).size;
          ok(real <= 10485760, `${v.name} is ${real}`);
          if (exact && i + 1 < list.length) eq(real, 10485760, `${v.name} is exact`);
        });
        await closeResult();
        // Opened from the last part, extracted, compared; and 7-Zip reads the same set.
        await openArchive(path.join(out, list[list.length - 1].name));
        await ui.waitFor(ui.rowSel('twentyfive.bin'));
        includes(await ui.text(by('status-volumes')), String(parts));
        await ui.click(by('btn-unpack'));
        await ui.waitFor(by('extract-dialog'));
        const dest = path.join(out, `x-${format}`);
        await ui.fill(by('extract-dest'), dest);
        await ui.click(by('extract-start'));
        await waitIdle();
        await ui.waitFor(by('result-dialog'));
        await closeResult();
        ok(fs.readFileSync(path.join(dest, 'twentyfive.bin')).equals(data), `${format}: identical after splitting and extracting`);
        assert7zOk(path.join(out, format === 'zip' ? list[list.length - 1].name : list[0].name));
        await closeArchive();
      }
    });

    await test('desktop: moving background: picture, transparency and speed from the start screen', async () => {
      await setStart(true);
      await ui.waitFor(by('start-canvas'));
      eq(await ui.count('[data-bg-card]'), 20);
      eq(await ui.count('[data-bg-card] svg'), 20, 'each with its icon');
      ok(await ui.js(`document.querySelector('[data-bg-card=zipper]').getBoundingClientRect().height <= 32`), 'small');
      const frames = () => ui.js(`document.querySelector('[data-testid=start-canvas]').__zmBackground.frames`);
      const f0 = await frames();
      await ui.sleep(400);
      ok((await frames()) > f0, 'it moves');
      await ui.click('[data-bg-card=zipper]');
      includes(await ui.attr('[data-bg-card=zipper]', 'class'), 'on');
      const under = await ui.js(`(() => {
        const cards = document.querySelector('[data-testid=bg-cards]').getBoundingClientRect();
        return ['start-transparency', 'start-speed'].every((id) => document.querySelector('[data-testid=' + id + '-range]').getBoundingClientRect().top >= cards.bottom - 1);
      })()`);
      ok(under, 'transparency and speed are under the pictures');
      const line = await ui.js(`(() => { const top = (id) => document.querySelector('[data-testid=' + id + ']').getBoundingClientRect(); const [a, b] = [top('start-transparency-range'), top('start-speed-range')]; return Math.abs(a.top - b.top) <= 2 && a.left < b.left; })()`);
      ok(line, 'and on one line');
      const opacity0 = await ui.js(`document.querySelector('[data-testid=start-canvas]').style.opacity`);
      await ui.click(by('start-transparency-inc'));
      ok((await ui.js(`document.querySelector('[data-testid=start-canvas]').style.opacity`)) !== opacity0, 'transparency applies');
      await ui.click(by('start-speed-inc'));
      eq(await ui.value(by('start-speed')), '110');
      await ui.click(by('start-speed-dec'));
      await ui.click(by('start-transparency-dec'));
      await setStart(false);
    });

    await test('desktop: start screen: fixed title with a one-line guide button, fixed bottom line, large format pictures', async () => {
      await setStart(true);
      const r = await ui.js(`(() => {
        const box = (id) => document.querySelector('[data-testid=' + id + ']').getBoundingClientRect();
        const guide = box('start-guide');
        const pictures = document.querySelector('.start-format').getBoundingClientRect();
        return { titleTop: box('start-sec-title').top, boardTop: box('start-board').top, boardBottom: box('start-board').bottom, footerTop: box('start-footer').top,
          guideHeight: guide.height, guideIn: !!document.querySelector('[data-testid=start-sec-title] [data-testid=start-guide] svg'),
          author: document.querySelector('[data-testid=start-author]').textContent,
          optionIn: !!document.querySelector('[data-testid=start-footer] [data-testid=start-option]'),
          picture: pictures.width, handles: document.querySelectorAll('[data-testid=start-sec-title] [data-card-handle], [data-testid=start-footer] [data-card-handle]').length };
      })()`);
      ok(r.titleTop < r.boardTop && r.boardBottom <= r.footerTop, 'title, cards, bottom line');
      ok(r.guideIn, 'the guide is with the title, with its icon');
      ok(r.guideHeight <= 34, `one line: ${r.guideHeight}`);
      ok(r.optionIn, 'the start option is on the bottom line');
      includes(r.author, 'SHKWON(knix008@naver.com)');
      ok(r.picture >= 48, `format pictures can be told apart: ${r.picture}`);
      eq(r.handles, 0, 'neither of them moves');
    });

    await test('desktop: start screen: the two cards move and resize, stay apart, and go back', async () => {
      await setStart(true);
      await ui.js(`1`);
      const mouse = async (type, x, y, buttons) => ui.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
      const drag = async (sel, dx, dy) => {
        const { x, y } = await ui.center(sel);
        await mouse('mouseMoved', x, y, 0);
        await mouse('mousePressed', x, y, 1);
        await mouse('mouseMoved', x + dx / 2, y + dy / 2, 1);
        await mouse('mouseMoved', x + dx, y + dy, 1);
        await mouse('mouseReleased', x + dx, y + dy, 0);
        await ui.sleep(320);
      };
      const box = (id) => ui.js(`(() => { const b = document.querySelector('[data-testid=start-card-${id}]').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
      const titleBefore = await ui.js(`document.querySelector('[data-testid=start-sec-title]').getBoundingClientRect().top`);
      const inOrder = async () => {
        const [m, g] = [await box('main'), await box('background')];
        const beside = Math.abs(m.y - g.y) <= 1 && (Math.abs(m.x + m.w + 12 - g.x) <= 1 || Math.abs(g.x + g.w + 12 - m.x) <= 1);
        const stacked = Math.abs(m.x - g.x) <= 1 && Math.abs(m.w - g.w) <= 1 && (Math.abs(m.y + m.h + 12 - g.y) <= 1 || Math.abs(g.y + g.h + 12 - m.y) <= 1);
        ok(beside || stacked, `arranged: ${JSON.stringify({ m, g })}`);
        return { m, g, beside, stacked };
      };
      await ui.sleep(350);
      const first = await inOrder();
      const m0 = first.m;
      const b0 = first.g;
      ok(first.beside, 'side by side at first');

      // Moving a little: it comes back into line.
      await drag('[data-card-head=main] .start-section', 16, 16);
      let now = await inOrder();
      eq(now.m.x, m0.x);
      eq(now.m.y, m0.y);

      // Resizing: the other card fills what is left.
      await drag('[data-card-grip=main]', -96, -64);
      now = await inOrder();
      ok(Math.abs(now.m.w - m0.w + 96) <= 8, `narrower: ${m0.w} -> ${now.m.w}`);
      ok(now.m.h < m0.h, 'shorter');
      eq(Math.round(now.g.x + now.g.w), Math.round(b0.x + b0.w), 'the other card fills the width');
      ok(now.g.w > b0.w, 'wider');
      eq(await ui.js(`document.querySelector('[data-testid=start-sec-title]').getBoundingClientRect().top`), titleBefore, 'the title stayed');
      ok((await ui.js(`JSON.parse(localStorage.getItem('zm-settings')).startLayout`)).main.w > 0, 'kept');

      // Dragged over to the other side: they change places.
      await drag('[data-card-head=main] .start-section', b0.x, 0);
      now = await inOrder();
      ok(now.m.x > now.g.x, 'main on the right now');

      // The arrange button.
      await ui.click(by('start-arrange'));
      await ui.sleep(320);
      now = await inOrder();
      eq(now.m.x, m0.x);
      eq(now.m.w, m0.w);

      // Dragged below the other: stacked.
      await drag('[data-card-head=main] .start-section', 40, m0.h * 0.6);
      now = await inOrder();
      ok(now.stacked && now.g.y < now.m.y, `one above the other: ${JSON.stringify(now)}`);
      await ui.click(by('start-arrange'));
      await ui.sleep(320);

      // Keyboard: Alt+Shift+arrow resizes, Alt+arrow changes places.
      await ui.js(`document.querySelector('[data-card-handle=main]').focus(); 1`);
      await ui.press('ArrowLeft', { modifiers: ALT | SHIFT });
      await ui.sleep(320);
      now = await inOrder();
      ok(now.m.w < m0.w, 'Alt+Shift+arrow resizes');
      await ui.js(`document.querySelector('[data-card-handle=main]').focus(); 1`);
      await ui.press('ArrowRight', { modifiers: ALT });
      await ui.sleep(320);
      now = await inOrder();
      ok(now.m.x > now.g.x, 'Alt+arrow changes places');

      // The triangle twice quickly: the first arrangement.
      await ui.click('[data-card-grip=main]');
      await ui.click('[data-card-grip=main]');
      await ui.sleep(320);
      now = await inOrder();
      eq(now.m.x, m0.x, 'back');
      eq(now.m.w, m0.w, 'back');
    });

    await test('desktop: background sliders drag; the palette goes to the next theme, the dropdown names the current one', async () => {
      await setStart(true);
      const before = await ui.value(by('start-speed'));
      const bar = await ui.js(`(() => { const b = document.querySelector('[data-testid=start-speed-range]').getBoundingClientRect(); return { x: b.x, y: b.y + b.height / 2, w: b.width }; })()`);
      ok(bar.w >= 50, `a bar one can drag: ${bar.w}`);
      const press = (type, x, buttons) => ui.c.send('Input.dispatchMouseEvent', { type, x, y: bar.y, button: 'left', buttons, clickCount: 1 });
      await press('mouseMoved', bar.x + bar.w / 3, 0);
      await press('mousePressed', bar.x + bar.w / 3, 1);
      await press('mouseMoved', bar.x + bar.w / 2, 1);
      await press('mouseMoved', bar.x + bar.w - 2, 1);
      await press('mouseReleased', bar.x + bar.w - 2, 0);
      await ui.sleep(100);
      const after = Number(await ui.value(by('start-speed')));
      ok(after >= 260, `dragged to the end of the bar: ${after}`);
      await ui.fill(by('start-speed'), before);
      const name0 = await ui.text(by('theme-current'));
      ok(name0.length > 0, 'the dropdown shows the theme');
      await ui.click(by('btn-theme-cycle'));
      await ui.sleep(100);
      ok((await ui.text(by('theme-current'))) !== name0, 'the next theme, named at once');
      ok(await ui.js(`document.querySelector('[data-testid=btn-theme-cycle] svg').innerHTML.includes('circle')`), 'the palette');
      await ui.click(by('btn-theme-cycle'));
      for (let i = 0; i < 45 && (await ui.text(by('theme-current'))) !== name0; i += 1) await ui.click(by('btn-theme-cycle'));
      eq(await ui.text(by('theme-current')), name0, 'and all the way round');
      await setStart(false);
    });

    await test('desktop: panels: places and drives have icons and a line between; collapsed they keep icon and title', async () => {
      await goToFolder(srcDir);
      const r = await ui.js(`(() => {
        const places = document.querySelector('[data-testid=tree-places]'), drives = document.querySelector('[data-testid=tree-drives]');
        return { pi: !!places.querySelector('svg'), di: !!drives.querySelector('svg'), same: places.querySelector('svg').innerHTML === drives.querySelector('svg').innerHTML, line: parseFloat(getComputedStyle(drives).borderTopWidth) };
      })()`);
      ok(r.pi && r.di && !r.same, 'each its own icon');
      ok(r.line >= 1, 'a line between');
      for (const side of ['left', 'right']) {
        const title = await ui.text(`${by(`${side}-head`)} .panel-title`);
        await ui.click(by(`${side}-collapse`));
        await ui.waitFor(by(`${side}-rail`));
        eq((await ui.text(by(`${side}-rail-title`))).trim(), title.trim(), `${side}: the title stays`);
        ok(await ui.exists(`${by(`${side}-rail-title`)} svg`), `${side}: the icon stays`);
        ok(await ui.js(`(() => { const t = document.querySelector('[data-testid=${side}-rail-title]'); const r = t.parentElement.getBoundingClientRect(); const b = t.getBoundingClientRect(); return b.width <= r.width && b.left >= r.left; })()`), 'inside the rail');
        await ui.click(by(`${side}-expand`));
        await ui.waitFor(by(`${side}-panel`));
      }
    });

    await test('desktop: the x of every popup turns red under the mouse', async () => {
      const red = async (p, sel) => {
        const { x, y } = await p.center(sel);
        await p.c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await p.sleep(250);
        return p.js(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).backgroundColor`);
      };
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      eq(await red(ui, `${by('create-dialog')} .modal-head .iconbtn`), 'rgb(229, 72, 77)', 'a dialog');
      await ui.click(`${by('create-dialog')} .modal-head .iconbtn`);
      for (const [button, route] of [['btn-settings', '#settings'], ['btn-about', '#about'], ['btn-help', '#guide']]) {
        await ui.click(by(button));
        const w = await page(await waitTarget(cdpPort, (t) => t.url.endsWith(route)));
        await w.waitFor('.settings-page-head .iconbtn');
        eq(await red(w, '.settings-page-head .iconbtn'), 'rgb(229, 72, 77)', route);
        await w.click('.settings-page-head .iconbtn').catch(() => {});
        w.c.close();
        await ui.sleep(500);
      }
    });

    await test('desktop: settings: a small window; custom theme edited there; language buttons with flags', async () => {
      await ui.click(by('btn-settings'));
      const s = await page(await waitTarget(cdpPort, (t) => t.url.endsWith('#settings')));
      await s.waitFor(by('settings-page'));
      const size = await s.js('[innerWidth, innerHeight]');
      ok(size[0] <= 600 && size[1] <= 660, `small: ${size}`);
      for (const tab of ['general', 'start', 'extract', 'compress', 'appearance']) {
        await s.click(`[data-settings-tab="${tab}"]`);
        const waste = await s.js(`(() => { const p = document.querySelector('.settings-panel'); return [p.scrollHeight, p.clientHeight, p.scrollWidth, p.clientWidth]; })()`);
        ok(waste[0] <= waste[1] + 1 && waste[2] <= waste[3] + 1, `${tab} fits: ${waste}`);
      }
      eq(await s.count('[data-custom-color]'), 4, 'all four colours');
      const seen = await s.js(`[...document.querySelectorAll('[data-custom-color]')].every((el) => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return b.width >= 20 && b.height >= 12 && hit === el;
      })`);
      ok(seen, 'and they can be seen and reached');
      const set = await s.js(`(() => {
        const el = document.querySelector('[data-custom-color=accent]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '#123abc');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return el.value;
      })()`);
      eq(set, '#123abc');
      await ui.until(`document.documentElement.dataset.theme === 'custom' && getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase() === '#123abc'`, 5000);
      await s.click('[data-settings-tab="appearance"]');
      await s.click('[data-theme-pick="dark"]');
      await s.click('[data-settings-tab="general"]');
      ok(await s.exists('[data-lang=ko] svg'), 'a flag on Korean');
      ok(await s.exists('[data-lang=en] svg'), 'a flag on English');
      await s.click(by('settings-ok')).catch(() => {});
      s.c.close();
      await ui.sleep(500);
      await ui.click(by('btn-help'));
      const g = await page(await waitTarget(cdpPort, (t) => t.url.endsWith('#guide')));
      await g.waitFor(by('guide-body'));
      ok(await g.exists('[data-guide-lang=ko] svg') && await g.exists('[data-guide-lang=en] svg'), 'flags in the guide');
      await g.until(`[...document.querySelectorAll('[data-testid=guide-body] img')].length >= 9 && [...document.querySelectorAll('[data-testid=guide-body] img')].every((i) => i.complete && i.naturalWidth > 100)`, 8000);
      await g.click('[data-guide-lang=en]');
      await g.sleep(300);
      await g.until(`[...document.querySelectorAll('[data-testid=guide-body] img')].every((i) => i.complete && i.naturalWidth > 100 && i.src.includes('en'))`, 8000).catch(() => {});
      await g.until(`[...document.querySelectorAll('[data-testid=guide-body] img')].length >= 9 && [...document.querySelectorAll('[data-testid=guide-body] img')].every((i) => i.complete && i.naturalWidth > 100)`, 8000);
      await g.click('[data-guide-lang=ko]');
      await g.click('.settings-page-head .iconbtn').catch(() => {});
      g.c.close();
      await ui.sleep(500);
    });

    await test('desktop: originals go to the trash only after the archive reads back, and only when safe', async () => {
      const home = path.join(out, 'del');
      fs.mkdirSync(home, { recursive: true });
      const a = path.join(home, 'gone.txt');
      fs.writeFileSync(a, 'delete me after compressing');
      const trash = path.join(base, 'config', 'test-trash', 'gone.txt');
      await compress([a], path.join(out, 'del.zip'), async () => {
        ok(!(await ui.js(`document.querySelector('[data-testid=delete-sources]').checked`)), 'off unless asked');
        await ui.fill(by('exclude'), '*.tmp');
        eq(await ui.disabled(by('delete-sources')), true, 'excluded files would be lost');
        await ui.waitFor(by('delete-sources-why'));
        await ui.fill(by('exclude'), '');
        await ui.fill(by('output'), path.join(a, 'x.zip'));
        eq(await ui.disabled(by('delete-sources')), true, 'the archive would go with them');
        await ui.fill(by('output'), path.join(out, 'del.zip'));
        await ui.click(by('delete-sources'));
      });
      await ui.waitFor(by('result-sources-removed'));
      ok(!fs.existsSync(a), 'the original left');
      ok(fs.existsSync(trash), 'to the trash, not gone');
      assert7zOk(path.join(out, 'del.zip'));
      await closeResult();
    });

    await test('desktop: Zstandard offers its levels', async () => {
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      await ui.choose(by('format'), 'zst');
      eq(await ui.disabled(by('level')), false);
      ok(!(await ui.exists(`${by('create-dialog')} .hint:not([data-testid])`)) || !(await ui.text(by('create-dialog'))).includes('single, fast'), 'no web-only note here');
      await ui.click(`${by('create-dialog')} .modal-head .iconbtn`);
    });

    await test('desktop: compress with WinRAR when it is there: right switches, parts in place', async () => {
      const src = path.join(out, 'for-rar.txt');
      fs.writeFileSync(src, 'x'.repeat(5000));
      await compress([src], path.join(out, 'tool.rar'), async () => {
        await ui.choose(by('format'), 'rar');
        await ui.fill(by('output'), path.join(out, 'tool.rar'));
        await ui.click(by('use-rar-tool'));
        await ui.waitFor(by('rar-tool-hint'));
        await ui.choose(by('level'), '9');
        await ui.fill(by('password'), 'pw');
        await ui.fill(by('confirm'), 'pw');
        await ui.click(by('encrypt-names'));
        await ui.click(by('solid'));
        await ui.fill(by('recovery'), '3');
        await ui.choose(by('split'), 'custom');
        await ui.choose(by('split-unit'), 'MB');
        await ui.fill(by('split-text'), '10');
      });
      const call = JSON.parse(fs.readFileSync(fakeLog, 'utf8').trim().split('\n').pop());
      for (const sw of ['a', '-m5', '-ma5', '-v10485760b', '-s', '-rr3p', '-hppw', '-ep1']) ok(call.includes(sw), `${sw} in ${call.join(' ')}`);
      eq(call[call.length - 1], src, 'the source last');
      eq((await outputs()).map((v) => v.name).join(), 'tool.part1.rar,tool.part2.rar,tool.part3.rar');
      ok(!fs.readdirSync(out).some((n) => n.startsWith('.zm-rar')), 'nothing temporary left');
      await closeResult();

      // It fails: a message, no archive.
      fs.writeFileSync(path.join(fakeDir, 'fail'), '');
      await closeArchive();
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      while (await ui.exists(`${by('sources')} .source-row .iconbtn`)) await ui.click(`${by('sources')} .source-row .iconbtn`);
      await answer('open', [src]);
      await ui.click(by('add-files'));
      await ui.choose(by('format'), 'rar');
      await ui.fill(by('output'), path.join(out, 'bad.rar'));
      await ui.click(by('use-rar-tool'));
      await ui.click(by('create-start'));
      await ui.waitFor(by('error-dialog'));
      ok(!fs.existsSync(path.join(out, 'bad.rar')));
      ok(!fs.readdirSync(out).some((n) => n.startsWith('.zm-rar')), 'nothing temporary left');
      fs.rmSync(path.join(fakeDir, 'fail'));
      await ui.click(`${by('error-dialog')} .btn.primary`);

      // Cancelled: the same.
      fs.writeFileSync(path.join(fakeDir, 'slow'), '');
      await ui.click(by('btn-pack'));
      await ui.waitFor(by('create-dialog'));
      while (await ui.exists(`${by('sources')} .source-row .iconbtn`)) await ui.click(`${by('sources')} .source-row .iconbtn`);
      await answer('open', [src]);
      await ui.click(by('add-files'));
      await ui.choose(by('format'), 'rar');
      await ui.fill(by('output'), path.join(out, 'stop.rar'));
      await ui.click(by('use-rar-tool'));
      await ui.click(by('create-start'));
      await ui.waitFor(by('progress-cancel'));
      await ui.sleep(300);
      await ui.click(by('progress-cancel'));
      await waitIdle();
      ok(!fs.existsSync(path.join(out, 'stop.rar')));
      ok(!fs.readdirSync(out).some((n) => n.startsWith('.zm-rar')), 'nothing temporary left');
      fs.rmSync(path.join(fakeDir, 'slow'));
    });

    if (process.platform === 'win32') {
      await test('desktop: right-click menu: Settings and the installer command write it, in the language, and remove it', async () => {
        const branch = 'HKCU\\Software\\MyZipMasterTest\\Classes';
        const reg = (key) => spawnSync('reg', ['query', `${branch}\\${key}`, '/s'], { encoding: 'utf8' });
        const env = { ...process.env, MYZIPMASTER_TEST: '1', MYZIPMASTER_CONFIG_DIR: path.join(base, 'config') };
        try {
          await ui.click(by('btn-settings'));
          const s = await page(await waitTarget(cdpPort, (t) => t.url.endsWith('#settings')));
          await s.waitFor(by('shell-menu'));
          eq(await s.js(`document.querySelector('[data-testid=shell-menu]').checked`), false);
          await s.click(by('shell-menu'));
          await s.until(`document.querySelector('[data-testid=shell-menu]').checked`);
          const all = reg('*\\shell\\MyZipMaster.Add');
          eq(all.status, 0, 'all files');
          includes(all.stdout, '--shell-add "%1"');
          includes(all.stdout, 'MultiSelectModel');
          eq(reg('Directory\\shell\\MyZipMaster.Add').status, 0, 'folders');
          const zip = reg('SystemFileAssociations\\.zip\\shell\\MyZipMaster');
          for (const flag of ['--shell-extract-here "%1"', '--shell-extract-folder "%1"', '--shell-test "%1"', 'SubCommands']) includes(zip.stdout, flag);
          await s.click(by('open-default-apps'));
          await s.sleep(300);
          ok(fs.existsSync(path.join(base, 'config', 'default-apps-opened')), 'the Windows page was asked for');
          await s.click(by('shell-menu'));
          await s.until(`!document.querySelector('[data-testid=shell-menu]').checked`);
          ok(reg('*\\shell\\MyZipMaster.Add').status !== 0, 'gone');
          ok(reg('SystemFileAssociations\\.zip\\shell\\MyZipMaster').status !== 0, 'gone');
          await s.click(by('settings-ok')).catch(() => {});
          s.c.close();
          // What the installer runs, and what its uninstaller runs: no window, and they return.
          eq(spawnSync(EXE, ['--register-shell-menu', 'ko'], { env, timeout: 15000 }).status, 0);
          includes(reg('*\\shell\\MyZipMaster.Add').stdout, 'MyZipMaster');
          eq(spawnSync(EXE, ['--register-shell-menu', 'en'], { env, timeout: 15000 }).status, 0);
          includes(reg('*\\shell\\MyZipMaster.Add').stdout, 'Compress with MyZipMaster');
          eq(spawnSync(EXE, ['--unregister-shell-menu'], { env, timeout: 15000 }).status, 0);
          ok(reg('*\\shell\\MyZipMaster.Add').status !== 0, 'gone');
        } finally {
          spawnSync('reg', ['delete', 'HKCU\\Software\\MyZipMasterTest', '/f']);
        }
      });
    }

    await test('desktop: Linux and macOS menu files are well formed', async () => {
      const printed = spawnSync(EXE, ['--print-shell-menu', 'en'], { encoding: 'utf8', timeout: 15000, env: { ...process.env, MYZIPMASTER_TEST: '1', MYZIPMASTER_CONFIG_DIR: path.join(base, 'config') } });
      const plan = JSON.parse(printed.stdout);
      const add = plan.linux.find((f) => f.path.endsWith('myzipmaster-add.desktop'));
      includes(add.content, 'Exec="/opt/my app/myzipmaster" --shell-add %F');
      ok(plan.linux.some((f) => f.path.includes('nautilus/scripts/MyZipMaster - ') && f.executable && f.content.startsWith('#!/bin/bash')), 'Nautilus');
      const flow = plan.macos.find((f) => f.path.endsWith('document.wflow'));
      includes(flow.content, 'A &amp; B.app', 'XML-escaped');
      ok(!/&(?!amp;|lt;|gt;)/.test(flow.content), 'no bare ampersands');
      ok(plan.macos.some((f) => f.path.endsWith('Info.plist') && f.content.includes('NSServices')), 'a Finder service');
    });

    await test('desktop: started from the menu: compress with several files, extract here, extract to a folder, test', async () => {
      const home = path.join(out, 'shell');
      fs.mkdirSync(home, { recursive: true });
      const a = path.join(home, 'one.txt');
      const b = path.join(home, 'two.txt');
      fs.writeFileSync(a, 'one');
      fs.writeFileSync(b, 'two');
      const start = async (runs) => {
        const port = await freePort(9480);
        const env = { ...process.env, MYZIPMASTER_TEST: '1', MYZIPMASTER_CONFIG_DIR: path.join(base, 'config2'), WEBVIEW2_USER_DATA_FOLDER: path.join(base, 'webview2'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
        fs.mkdirSync(env.MYZIPMASTER_CONFIG_DIR, { recursive: true });
        const kids = runs.map((args) => spawn(EXE, args, { env, stdio: 'ignore' }));
        const p = await page(await waitTarget(port, isMain, 40000));
        await p.waitFor(by('toolbar'), 30000);
        await p.until('!document.hidden', 10000);
        return { p, stop: async () => { p.c.close(); for (const k of kids) k.kill(); await new Promise((r) => setTimeout(r, 900)); } };
      };
      // Explorer starts one process per file; they become one window.
      let w = await start([['--shell-add', a], ['--shell-add', b]]);
      await w.p.waitFor(by('create-dialog'));
      const sources = await w.p.text(by('sources'));
      includes(sources, 'one.txt');
      includes(sources, 'two.txt');
      ok(!(await w.p.exists(by('start-screen'))), 'no start screen');
      await w.p.fill(by('output'), path.join(home, 'made.zip'));
      await w.p.click(by('create-start'));
      await w.p.waitFor(by('result-dialog'), 20000);
      await w.stop();
      assert7zOk(path.join(home, 'made.zip'));
      const zip = path.join(home, 'made.zip');

      fs.rmSync(a);
      fs.rmSync(b);
      w = await start([['--shell-extract-here', zip]]);
      await w.p.waitFor(by('result-dialog'), 20000);
      await w.stop();
      eq(fs.readFileSync(a, 'utf8'), 'one', 'extracted beside the archive');

      w = await start([['--shell-extract-folder', zip]]);
      await w.p.waitFor(by('result-dialog'), 20000);
      await w.stop();
      eq(fs.readFileSync(path.join(home, 'made', 'two.txt'), 'utf8'), 'two', 'in a folder named after it');

      w = await start([['--shell-test', zip]]);
      await w.p.waitFor(by('result-dialog'), 20000);
      includes(await w.p.text(by('result-dialog')), '2');
      await w.stop();
    });

    await test('desktop: errors: a popup with details that can be copied, also when nothing caught them', async () => {
      await closeArchive();
      await ui.js(`setTimeout(() => { throw new Error('boom from a test'); }, 0); 1`);
      await ui.waitFor(by('error-dialog'));
      includes(await ui.text(by('error-details')), 'boom from a test');
      includes(await ui.text(by('error-details')), 'MyZipMaster 1.0.0');
      includes(await ui.text(by('error-details')), 'Code: unexpected');
      await ui.click(by('error-copy'));
      await ui.until(`document.querySelector('[data-testid=error-copy]').dataset.state === 'done'`, 3000);
      // It really is on the clipboard: pasted into a box.
      await ui.js(`(() => { const a = document.createElement('textarea'); a.id = 'paste-here'; a.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:200px;height:60px'; document.body.append(a); a.focus(); return 1; })()`);
      await ui.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: CTRL, commands: ['paste'] });
      await ui.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: CTRL });
      await ui.until(`document.getElementById('paste-here').value.includes('boom from a test')`, 3000);
      await ui.js(`document.getElementById('paste-here').remove(); 1`);
      await ui.click(by('error-ok'));
      await ui.waitGone(by('error-dialog'));
      ok(await ui.exists(by('toolbar')), 'the program goes on');

      await ui.js(`Promise.reject(new Error('lost promise from a test')); 1`);
      await ui.waitFor(by('error-dialog'));
      includes(await ui.text(by('error-details')), 'lost promise from a test');
      await ui.click(by('error-ok'));

      // An engine failure carries its detail too.
      const bad = path.join(out, 'not-really.zip');
      fs.writeFileSync(bad, 'this is no archive');
      await openArchive(bad);
      await ui.waitFor(by('error-dialog'));
      includes(await ui.text(by('error-details')), 'Code:');
      await ui.click(by('error-ok'));

      // A failure while drawing leaves a report, not a blank window.
      await ui.js(`window.dispatchEvent(new Event('zm-test-crash')); 1`);
      await ui.waitFor(by('error-page'));
      includes(await ui.text(by('error-details')), 'zm-test-crash');
      await ui.click(by('error-copy'));
      await ui.until(`document.querySelector('[data-testid=error-copy]').dataset.state === 'done'`, 3000);
      await ui.click(by('error-reload'));
      await ui.sleep(500);
      await ui.waitFor(by('toolbar'), 20000);
      await ui.js(`window.__zmDialogs = { open: [], folder: [], save: [] }; 1`);
      await cleanScreen();
    });

    await test('desktop: the window appears with its page already drawn, soon after starting', async () => {
      const port = await freePort(9490);
      const env = { ...process.env, MYZIPMASTER_TEST: '1', MYZIPMASTER_CONFIG_DIR: path.join(base, 'config3'), WEBVIEW2_USER_DATA_FOLDER: path.join(base, 'webview2'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
      fs.mkdirSync(env.MYZIPMASTER_CONFIG_DIR, { recursive: true });
      const t0 = Date.now();
      const kid = spawn(EXE, [], { env, stdio: 'ignore' });
      try {
        const p = await page(await waitTarget(port, isMain, 40000));
        await p.waitFor(by('start-screen'), 20000);
        const took = Date.now() - t0;
        ok(took < 5000, `a usable screen in ${took} ms`);
        if (process.platform === 'win32') {
          const shown = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Start-Sleep -Milliseconds 700; [int](Get-Process -Id ${kid.pid}).MainWindowHandle -ne 0`], { encoding: 'utf8' });
          includes(shown.stdout, 'True', 'it did appear');
        }
        p.c.close();
      } finally {
        kid.kill();
        await new Promise((r) => setTimeout(r, 900));
      }
    });

    await test('desktop: start option: on the start screen and in Settings, and honoured at launch', async () => {
      await closeArchive();
      await setStart(true);
      await ui.waitFor(by('start-option'));
      eq(await ui.js(`document.querySelector('[data-testid=start-option]').checked`), true);
      await ui.click(by('start-option'));
      await ui.sleep(100);
      eq(JSON.parse(fs.readFileSync(path.join(base, 'config', 'settings.json'), 'utf8')).settings.showStart, false);
      await ui.click(by('btn-settings'));
      const st = await waitTarget(cdpPort, (t) => t.url.endsWith('#settings'));
      const sp = await page(st);
      await sp.waitFor(by('settings-page'));
      await sp.click('[data-settings-tab="start"]');
      await sp.waitFor('[data-setting="showStart"]');
      eq(await sp.js(`document.querySelector('[data-setting=showStart]').checked`), false, 'the same setting');
      await sp.click(by('settings-ok'));
      sp.c.close();
      await ui.sleep(300);
      // Restart: straight to the files.
      await ui.click(by('win-close'));
      await new Promise((resolve, reject) => {
        child.once('exit', resolve);
        setTimeout(() => reject(new Error('the close button did not close the window')), 8000);
      });
      ui.c.close();
      await new Promise((r) => setTimeout(r, 500));
      child = launch();
      await connectMain();
      await ui.waitFor(by('file-table'));
      ok(!(await ui.exists(by('start-screen'))), 'the start screen stays away');
      await setStart(true);
      await ui.click(by('start-option'));
      await ui.sleep(100);
      await setStart(false);
    });

    await test("desktop: guide from the start screen: its own window, main window's language and theme", async () => {
      await setStart(true);
      await ui.waitFor(by('start-guide'));
      if ((await ui.js('document.documentElement.lang')) !== 'en') await ui.click(by('btn-lang'));
      await ui.click(by('start-guide'));
      const gt = await waitTarget(cdpPort, (t) => t.url.endsWith('#guide'));
      const g = await page(gt);
      await g.waitFor(by('guide-body'));
      await g.until(`document.querySelector('[data-testid=guide-body] h1').textContent.includes("User's Guide")`);
      eq(await g.attr('html', 'data-theme'), await ui.attr('html', 'data-theme'), 'same theme');
      ok((await g.count('[data-toc]')) >= 10, 'a contents list');
      await g.click('[data-toc="sec-5"]');
      ok(await g.js(`document.querySelector('[data-testid=guide-body]').scrollTop > 0`), 'contents jump to the section');
      const fontSize = () => g.js(`parseFloat(getComputedStyle(document.querySelector('[data-testid=guide-body]')).fontSize)`);
      const f0 = await fontSize();
      await g.click(by('guide-size-inc'));
      ok((await fontSize()) > f0);
      await g.click(by('guide-size-dec'));
      eq(await fontSize(), f0);
      await g.click('[data-guide-lang="ko"]');
      await g.until(`document.querySelector('[data-testid=guide-body] h1').textContent.includes('사용 설명서')`);
      eq(await ui.js('document.documentElement.lang'), 'en', 'the main window keeps its own language');
      // Theme follows the main window live; asking again returns to its language.
      await ui.click(by('btn-theme-cycle'));
      await g.until(`document.documentElement.dataset.theme === ${JSON.stringify(await ui.attr('html', 'data-theme'))}`, 5000);
      await ui.click(by('start-guide'));
      await g.until(`document.querySelector('[data-testid=guide-body] h1').textContent.includes("User's Guide")`, 5000);
      await g.click('.guide-tools .iconbtn').catch(() => {});
      g.c.close();
      await ui.click(by('btn-lang'));
      await setStart(false);
    });

    await test('desktop: restart keeps settings, opens the file it was given, no start screen', async () => {
      await ui.click(by('win-close'));
      await new Promise((resolve, reject) => {
        child.once('exit', resolve);
        setTimeout(() => reject(new Error('the close button did not close the window')), 8000);
      });
      ui.c.close();
      await new Promise((r) => setTimeout(r, 500));
      child = launch([path.join(out, 'plain.zip')]);
      const target = await waitTarget(cdpPort, isMain, 40000);
      ui = await page(target);
      await ui.waitFor(by('status-format'), 30000);
      ok(!(await ui.exists(by('start-screen'))), 'started on a file: no start screen');
      eq(await ui.text(by('status-format')), 'ZIP');
      includes(await ui.text(by('crumbs')), 'plain.zip');
      ok(await ui.attr('html', 'data-theme'), 'a theme was restored');
      await ui.waitFor(ui.rowSel('set'));
      ok(!fs.readFileSync(path.join(base, 'config', 'settings.json'), 'utf8').includes(path.join(process.env.USERPROFILE ?? '', 'Desktop')), 'nothing about the user');
    });

    await test('desktop: back to the start screen from the File menu, recent files show', async () => {
      await closeArchive();
      await ui.click(by('btn-file'));
      await ui.click(by('menu-start'));
      await ui.waitFor(by('start-screen'));
      ok(await ui.count('[data-start-recent]') >= 1);
      await ui.click('[data-start-recent]');
      await waitIdle();
      await ui.waitFor(by('status-format'));
      ok(!(await ui.exists(by('start-screen'))));
    });

    await test(`desktop: user's guide window (F1)`, async () => {
      await ui.click(by('file-table'));
      await ui.press('F1', { keyCode: 112 });
      const gt = await waitTarget(cdpPort, (t) => t.url.endsWith('#guide'));
      const g = await page(gt);
      await g.waitFor(by('guide-body'));
      includes(await g.text(`${by('guide-body')} h1`), 'MyZipMaster');
      ok((await g.count(`${by('guide-body')} table`)) >= 3);
      await g.click('.guide-tools .iconbtn').catch(() => {});
      g.c.close();
    });

    await test('desktop: test files stayed in the test folder', async () => {
      const saved = JSON.parse(fs.readFileSync(path.join(base, 'config', 'settings.json'), 'utf8'));
      for (const p of saved.settings.recent) ok(p.includes('test-results'), p);
      ok(fs.existsSync(path.join(base, 'config', 'settings.json')));
    });
  } finally {
    try { ui?.c.close(); } catch { /* gone */ }
    child.kill();
    // 'shift' and 'ctrl' are exported for symmetry with the web suite.
    void CTRL; void SHIFT;
  }
}
