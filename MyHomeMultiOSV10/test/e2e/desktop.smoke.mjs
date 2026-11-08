// Desktop smoke test: the real app (debug or release executable) driven through CDP.
//   node test/e2e/desktop.smoke.mjs [path/to/MyHomeMaker.exe]
// Starts the app in private folders, then checks the start page, a new site from a template,
// blocks, inline text, the popups as OS windows, saving and opening, publishing to a folder and
// the browser preview (recorded, not opened), and quitting. Prints one line per case.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesktopApp } from './desktop-harness.mjs';
import { sleep } from './cdp.mjs';
import { Report } from '../report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const exe = process.argv[2] ?? path.join(root, 'src-tauri', 'target', 'debug', process.platform === 'win32' ? 'MyHomeMaker.exe' : 'myhomemaker');
if (!fs.existsSync(exe)) {
  console.error(`executable not found: ${exe} (build it with: npx tauri build --debug --no-bundle)`);
  process.exit(2);
}

const expect = (value, message) => { if (!value) throw new Error(message); };

const app = new DesktopApp(exe);
const report = new Report('desktop', 'desktop', `the desktop app (${path.relative(root, exe)}) through CDP, private folders`);
try {
  const main = await app.launch([], { MYHOMEMAKER_TEST_NO_WELCOME: '1' });
  const evalApp = (code) => main.eval(code);
  await evalApp('window.__MYHOMEMAKER_NO_WELCOME = true; 1');

  report.group('window');
  await report.check('window shows the start page', async () => {
    await main.waitFor("document.querySelector('#start-page:not([hidden]) .start-board .start-card')", { timeout: 15000 });
    const cards = await evalApp("document.querySelectorAll('.start-card').length");
    expect(cards >= 6, `start cards: ${cards}`);
  });

  await report.check('title bar row has the window buttons', async () => {
    const buttons = await evalApp("[...document.querySelectorAll('#menubar [data-window]')].map((b) => b.dataset.window).join(',')");
    expect(buttons === 'minimize,maximize,close', buttons);
  });

  report.group('editing');
  await report.check('new site from the business template', async () => {
    await evalApp("window.__myhomemaker.actions.newSite('business'), 1");
    await main.waitFor("document.querySelector('.site-frame')?.contentDocument?.querySelectorAll('[data-block-id]').length >= 6");
    const tabs = await evalApp("document.querySelectorAll('#tabs [data-page-tab]').length");
    expect(tabs === 4, `page tabs: ${tabs}`);
  });

  await report.check('clicking a block selects it and shows its fields', async () => {
    const ok = await evalApp(`(() => { const doc = document.querySelector('.site-frame').contentDocument; const el = doc.querySelector('[data-block-type="features"] h2'); el.click(); return window.__myhomemaker.state.selected && document.querySelectorAll('#editors [data-prop]').length > 3; })()`);
    expect(ok, 'no selection or fields');
    await main.waitFor("!document.querySelector('.sel-bar').hidden");
  });

  await report.check('a click on the selected text edits it in place', async () => {
    await evalApp(`(() => { const doc = document.querySelector('.site-frame').contentDocument; doc.querySelector('[data-block-type="features"] [data-edit="title"]').click(); return 1; })()`);
    await main.waitFor(`document.querySelector('.site-frame').contentDocument.querySelector('[contenteditable]') !== null`);
    await main.type('Hello desktop');
    await main.key('Enter');
    await main.waitFor(`window.__myhomemaker.state.docs[0].site.pages[0].blocks.find((b) => b.type === 'features').props.title === 'Hello desktop'`);
  });

  await report.check('a block from the panel is inserted below the selection', async () => {
    const before = await evalApp('window.__myhomemaker.state.docs[0].page.blocks.length');
    await main.click('#left-panel .block-item[data-block-type="quote"]');
    await main.waitFor(`window.__myhomemaker.state.docs[0].page.blocks.length === ${before + 1}`);
    const order = await evalApp("window.__myhomemaker.state.docs[0].page.blocks.map((b) => b.type).join(',')");
    expect(order.includes('features,quote'), order);
  });

  await report.check('a real click on a panel block inserts it once', async () => {
    const before = await evalApp('window.__myhomemaker.state.docs[0].page.blocks.length');
    await evalApp("document.querySelector('#left-panel .block-item[data-block-type=\"divider\"]').scrollIntoView({ block: 'center' }), 1");
    const at = await main.center('#left-panel .block-item[data-block-type="divider"]');
    await main.realClick(at.x, at.y);
    await main.waitFor(`window.__myhomemaker.state.docs[0].page.blocks.length === ${before + 1}`);
    await sleep(400);
    const after = await evalApp('window.__myhomemaker.state.docs[0].page.blocks.length');
    expect(after === before + 1, `inserted ${after - before} times`);
    await evalApp("window.__myhomemaker.run('undo'), 1");
  });

  await report.check('undo and redo', async () => {
    const before = await evalApp('window.__myhomemaker.state.docs[0].page.blocks.length');
    await evalApp("window.__myhomemaker.run('undo'), 1");
    await main.waitFor(`window.__myhomemaker.state.docs[0].page.blocks.length === ${before - 1}`);
    await evalApp("window.__myhomemaker.run('redo'), 1");
    await main.waitFor(`window.__myhomemaker.state.docs[0].page.blocks.length === ${before}`);
  });

  report.group('popups');
  for (const [kind, command] of [['settings', "window.__myhomemaker.run('settings')"], ['design', "window.__myhomemaker.run('designPicker')"], ['publish', "window.__myhomemaker.run('publish')"], ['template', "window.__myhomemaker.popups.open('template', {})"]]) {
    await report.check(`popup "${kind}" opens as its own window`, async () => {
      await evalApp(`void ${command}, 1`);
      const popup = await app.popup(kind);
      const size = await popup.eval('({ w: innerWidth, h: innerHeight, scroll: document.querySelector(".popup-body")?.scrollHeight > document.querySelector(".popup-body")?.clientHeight + 2 })');
      expect(size.w > 300 && size.h > 150, JSON.stringify(size));
      await popup.eval("window.__myhomemakerPopup.close(), 1").catch(() => {});
      popup.close();
      await sleep(400);
    });
  }

  report.group('design & view');
  await report.check('a design changes the whole site', async () => {
    await evalApp("window.__myhomemaker.actions.setDesign({ id: 'midnight' }, { reset: true }), 1");
    const color = await evalApp("getComputedStyle(document.querySelector('.site-frame').contentDocument.body).backgroundColor");
    expect(color === 'rgb(13, 19, 36)', color);
  });

  await report.check('phone width shows the folded menu', async () => {
    await evalApp("window.__myhomemaker.actions.setDevice('mobile'), 1");
    await sleep(300);
    const shown = await evalApp("getComputedStyle(document.querySelector('.site-frame').contentDocument.querySelector('.hm-burger')).display");
    expect(shown !== 'none', shown);
    await evalApp("window.__myhomemaker.actions.setDevice('desktop'), 1");
  });

  report.group('files');
  const savePath = path.join(app.dir('files'), 'smoke-site.myhome');
  await report.check('save and open a site file', async () => {
    await evalApp(`window.__myhomemakerSavePicks = [${JSON.stringify(savePath)}]; 1`);
    await evalApp("window.__myhomemaker.actions.saveDoc(window.__myhomemaker.state.docs[0]).then(() => 1)");
    expect(fs.existsSync(savePath), 'file not written');
    const json = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    expect(json.format === 'myhomemaker' && json.pages.length === 4, 'bad file');
    await evalApp("window.__myhomemaker.actions.closeDoc(window.__myhomemaker.state.docs[0], { force: true }).then(() => 1)");
    await evalApp(`window.__myhomemaker.actions.openPath(${JSON.stringify(savePath)}).then(() => 1)`);
    await main.waitFor("window.__myhomemaker.state.docs[0]?.site.pages[0].blocks.some((b) => b.props.title === 'Hello desktop')");
  });

  report.group('publishing');
  await report.check('publish to a folder writes every page', async () => {
    const parent = app.dir('files');
    await evalApp(`window.__myhomemakerFolderPicks = [${JSON.stringify(parent)}]; 1`);
    await evalApp("void window.__myhomemaker.actions.publishSite('folder', { extract: true }), 1");
    const site = path.join(parent, 'smoke-site');
    const end = Date.now() + 15000;
    while (Date.now() < end && !fs.existsSync(path.join(site, 'contact.html'))) await sleep(200);
    for (const file of ['index.html', 'about.html', 'services.html', 'contact.html', 'style.css']) expect(fs.existsSync(path.join(site, file)), `${file} missing`);
    const assets = fs.readdirSync(path.join(site, 'assets'));
    expect(assets.length > 3, `assets: ${assets.length}`);
    const index = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
    expect(index.includes('Hello desktop') && !index.includes('data-block-id'), 'index.html content');
    await sleep(500);
    const confirm = await app.popup('confirm').catch(() => null);
    if (confirm) { await confirm.eval("document.querySelector('[data-value=\"close\"]')?.click(), 1").catch(() => {}); confirm.close(); }
  });

  await report.check('preview in the browser writes the site and opens it', async () => {
    await evalApp("window.__myhomemaker.actions.previewInBrowser().then(() => 1)");
    const opened = app.opened().filter((line) => /myhomemaker-preview-\d+[\\/]index\.html$/.test(line));
    expect(opened.length, `opened: ${app.opened().join(' | ')}`);
    expect(fs.existsSync(opened.at(-1)), 'preview file missing');
  });

  report.group('mouse');
  // Mouse drags (CDP input). A real cursor resting over the test window adds its own moves, so each
  // try starts on a fresh site and a drag is tried up to three times.
  const freshSite = async () => { await evalApp("window.__myhomemaker.actions.newSite('business'), 1"); await sleep(500); await evalApp("document.querySelector('.canvas-scroll').scrollTop = 0, 1"); };
  await report.check('dragging a panel block onto the canvas places it there', async () => {
    await freshSite();
    const before = await evalApp('window.__myhomemaker.state.docs[0].page.blocks.length');
    await evalApp("document.querySelector('#left-panel .block-item[data-block-type=\"gallery\"]').scrollIntoView({ block: 'center' }), 1");
    const from = await main.center('#left-panel .block-item[data-block-type="gallery"]');
    // Just above the middle of the second block of the page.
    const to = await evalApp(`(() => { const frame = document.querySelector('.site-frame'); const r = frame.getBoundingClientRect(); const z = r.width / frame.offsetWidth; const b = frame.contentDocument.querySelectorAll('main > [data-block-id]')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (b.top + 8) * z }; })()`);
    await main.drag(from, to, 16);
    await main.waitFor(`window.__myhomemaker.state.docs[0].page.blocks.length === ${before + 1}`, { timeout: 5000 });
    const index = await evalApp("window.__myhomemaker.state.docs[0].page.blocks.findIndex((b) => b.type === 'gallery')");
    expect(index === 1, `gallery at ${index}`);
  }, { attempts: 3 });

  await report.check('dragging a block by its name tab moves it', async () => {
    await freshSite();
    const order = () => evalApp("window.__myhomemaker.state.docs[0].page.blocks.map((b) => b.type).join(',')");
    const before = (await order()).split(',');
    await evalApp("(() => { const a = window.__myhomemaker; a.actions.select(a.state.docs[0].page.blocks[1].id); document.querySelector('.canvas-scroll').scrollTop = 0; return 1; })()");
    await sleep(400);
    const from = await main.center('.sel-bar .sel-name');
    const to = await evalApp(`(() => { const frame = document.querySelector('.site-frame'); const r = frame.getBoundingClientRect(); const z = r.width / frame.offsetWidth; const b = frame.contentDocument.querySelectorAll('main > [data-block-id]')[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (b.top + 6) * z }; })()`);
    await main.drag(from, to, 20);
    await main.waitFor(`window.__myhomemaker.state.docs[0].page.blocks[0].type === '${before[1]}'`, { timeout: 5000 });
    await evalApp("window.__myhomemaker.run('undo'), 1");
    const back = await order();
    expect(back === before.join(','), `${back} ≠ ${before.join(',')}`);
  }, { attempts: 3 });

  report.group('window size');
  if (process.platform === 'win32') await report.check('the OS cannot shrink the window below the toolbar', async () => {
    await evalApp("window.__myhomemaker.actions.newSite('business'), 1");
    await sleep(600);
    const min = await evalApp('window.__myhomemaker.state.minWidth');
    expect(min > 900, `minimum ${min}`);
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'test', 'e2e', 'set-window-size.ps1'), '-ProcessId', String(app.process.pid), '-Width', '700', '-Height', '500'], { encoding: 'utf8' });
    expect(ps.status === 0, ps.stdout + ps.stderr);
    await sleep(800);
    const out = await evalApp(`(() => { const bar = document.querySelector('#toolbar'); const r = bar.getBoundingClientRect(); const cut = [...bar.querySelectorAll('.tool-button')].filter((b) => b.getBoundingClientRect().right > r.right + 0.5).length; return { w: innerWidth, cut }; })()`);
    expect(out.w + 1 >= min && out.cut === 0, JSON.stringify({ ...out, min }));
  });

  report.group('errors');
  await report.check('no script errors in the main window', async () => {
    expect(!main.errors.length, main.errors.join(' | '));
  });
} catch (error) {
  report.group('start-up');
  await report.check('the app starts', async () => { throw error; });
} finally {
  await app.cleanup();
}

process.exitCode = report.finish() ? 0 : 1;
