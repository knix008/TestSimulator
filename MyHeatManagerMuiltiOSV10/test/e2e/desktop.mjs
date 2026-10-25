// Desktop E2E: the real program (tauri build --debug --no-bundle, the page
// embedded) driven over WebView2's DevTools port, with the native Rust engine;
// then the command-line batch mode. Prints "E2E: <passed> passed, <failed> failed".
//
// The program runs with its own config/lock/profile folders in the temp
// directory, so the user's settings and an installed copy are never touched.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, freePort, sleep, waitFor } from './cdp.mjs';
import { resultLine, totalsLine } from './report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'test-results', 'desktop');
const exeName = process.platform === 'win32' ? 'MyHeatManager.exe' : 'MyHeatManager';
// Its own cargo target folder: a debug copy the user has open (target/debug) keeps that exe locked.
const targetDir = path.join(root, 'src-tauri', 'target', 'e2e');
const exe = path.join(targetDir, 'debug', exeName);

/** Rebuilds the debug program when a source file is newer than it. */
function ensureBuilt() {
  const newest = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((latest, entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['target', 'gen', 'node_modules'].includes(entry.name) ? latest : Math.max(latest, newest(full));
    return Math.max(latest, fs.statSync(full).mtimeMs);
  }, 0);
  const sources = Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'src-tauri', 'src')), newest(path.join(root, 'engine', 'heat-core', 'src')));
  if (fs.existsSync(exe) && fs.statSync(exe).mtimeMs > sources && process.env.E2E_NO_BUILD !== '0') return;
  console.log('  building the debug program (tauri build --debug --no-bundle)…');
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle'], { cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: targetDir } });
  if (r.status !== 0) throw new Error('debug build failed');
}

ensureBuilt();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'myheat-desktop-'));
const port = await freePort();
const app = spawn(exe, [], {
  stdio: 'ignore',
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: path.join(scratch, 'webview'),
    MYHEATMANAGER_CONFIG_DIR: path.join(scratch, 'config'),
    MYHEATMANAGER_LOCK_DIR: path.join(scratch, 'lock'),
  },
});
const results = [];
let cdp;
const errors = [];

async function step(name, fn) {
  const started = performance.now();
  const before = errors.length;
  try {
    await fn();
    if (errors.length > before) throw new Error(`page errors: ${errors.slice(before).join(' | ')}`);
    results.push({ name, ok: true });
    console.log(resultLine({ status: 'pass', name, ms: performance.now() - started }));
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(resultLine({ status: 'fail', name, ms: performance.now() - started, error: error.message }));
    try { await cdp?.screenshot(path.join(shots, `fail-${name.replace(/[^\w-]+/g, '_')}.png`)); } catch { /* gone */ }
  }
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  const target = await waitFor(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return list.find((item) => item.type === 'page' && /tauri\.localhost|localhost/.test(item.url));
  }, 60000, 300);
  cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  cdp.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await waitFor(() => cdp.evaluate('Boolean(window.__myheat)'), 30000);
  const js = (expression) => cdp.evaluate(expression);
  // The program starts in Korean; the tests run it in English so that everything they print is English.
  await js('window.__myheat.state.settings.language === "en" || window.__myheat.api.patchSettings({ language: "en" })');
  const solve = async (sample) => {
    await js(`(async () => { const m = await import('./src/core/samples.js').catch(() => null); return Boolean(m); })()`).catch(() => false);
    await js(`window.__myheat.run('newFromSample')`);
    await waitFor(() => js(`Boolean(window.__myheat.query('[data-testid=sample-${sample}]')?.ownerDocument.defaultView.innerWidth)`), 5000);
    await js(`window.__myheat.query('[data-testid=sample-${sample}]').click()`);
    await js(`void window.__myheat.run('run')`);
    await waitFor(() => js('window.__myheat.state.solving'), 5000).catch(() => {});
    await waitFor(() => js('!window.__myheat.state.solving'), 240000, 250);
    return js('(() => { const r = window.__myheat.doc().result; return r && { ok: r.header.ok, stats: r.header.stats, fields: Object.keys(r.header.fields), times: r.header.times.length, ms: r.header.elapsedMs, balance: r.header.balance }; })()');
  };

  await step('window: the page loads with the native engine', async () => {
    assert(await js('Boolean(document.querySelector("[data-testid=menubar]"))'), 'no menu bar');
    const engine = await js('document.querySelector("[data-testid=status-engine]").textContent');
    assert(/Rust/.test(engine) && !/WebAssembly/.test(engine), `engine: ${engine}`);
    await cdp.screenshot(path.join(shots, '01-window.png'));
  });

  await step('title row: no system title bar; icon, name, version, home, window buttons, size grip', async () => {
    const brand = await js('document.querySelector("[data-testid=app-brand]")?.textContent');
    assert(/MyHeatManager/.test(brand) && /v1.0.0/.test(brand), `brand: ${brand}`);
    assert(await js('Boolean(document.querySelector("[data-testid=app-brand] img"))'), 'no icon');
    const order = await js('[...document.querySelector("[data-testid=menubar]").children].map((el) => el.dataset.testid ?? el.className)');
    assert(order.indexOf('tb-home') === order.indexOf('menu-file') - 1, `home is not left of File: ${order.join(',')}`);
    assert(!(await js('Boolean(document.querySelector("[data-testid=toolbar] [data-testid=tb-home]"))')), 'home still on the toolbar');
    for (const id of ['win-min', 'win-max', 'win-close', 'size-grip']) assert(await js(`Boolean(document.querySelector('[data-testid=${id}]'))`), `no ${id}`);
    // The window has no system frame: its client area starts at the window's top (no caption).
    const caption = await js('window.outerHeight - window.innerHeight');
    assert(caption < 20, `a caption of ${caption} px is still there`);
    await js('document.querySelector("[data-testid=win-max]").click()');
    await waitFor(() => js('window.__myheat.state.maximized === true'), 5000);
    await js('document.querySelector("[data-testid=win-max]").click()');
    await waitFor(() => js('window.__myheat.state.maximized === false'), 5000);
    await cdp.screenshot(path.join(shots, '00-title-row.png'));
  });

  await step('minimum width: shrinking the window never hides a toolbar button', async () => {
    await js("window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 640, height: 720 } } })");
    await sleep(800);
    const r = await js('(() => { const tb = document.querySelector("[data-testid=toolbar]"); const right = Math.max(...[...tb.children].map((c) => c.getBoundingClientRect().right)); const mb = document.querySelector("[data-testid=menubar]"); const mright = Math.max(...[...mb.children].map((c) => c.getBoundingClientRect().right)); return { inner: innerWidth, right, mright, min: parseFloat(document.querySelector(".app").style.minWidth) }; })()');
    assert(r.inner >= r.min - 1, `window ${r.inner} px is narrower than the minimum ${r.min} px`);
    assert(r.right <= r.inner + 1 && r.mright <= r.inner + 1, `buttons cut off: ${JSON.stringify(r)}`);
    await cdp.screenshot(path.join(shots, '00b-min-width.png'));
    await js("window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1480, height: 900 } } })");
    await sleep(500);
  });

  const targets = async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((item) => item.type === 'page');

  await step('about: version and native engine from the backend, in a window of its own', async () => {
    await js('window.__myheat.run("about")');
    await waitFor(() => js('Boolean(window.__myheat.query("[data-testid=dialog-about]"))'), 5000);
    await sleep(300);
    const text = await js('window.__myheat.query("[data-testid=dialog-about]").textContent');
    assert(/1\.0\.0/.test(text), 'no version');
    assert(/Tauri/.test(text), 'no Tauri version');
    // The dialog lives in a pop-out window (about:blank#popout-dialog-about-n), not in the main page.
    assert(!(await js('Boolean(document.querySelector("[data-testid=dialog-about]"))')), 'the dialog is still drawn in the main page');
    await waitFor(async () => (await targets()).some((t) => /#popout-dialog-about/.test(t.url)), 5000);
    await js('window.__myheat.query("[data-testid=dialog-close-about]").click()');
    await waitFor(async () => !(await targets()).some((t) => /#popout-dialog-about/.test(t.url)), 5000);
  });

  await step('pop-out windows: settings may be bigger than the main window; menus open in the menu window', async () => {
    // A small main window: the settings window (820 x 560) still shows whole, past the main window if need be.
    await js("window.__TAURI_INTERNALS__.invoke('plugin:window|unmaximize', { label: 'main' }).catch(() => {})");
    await js("window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1100, height: 700 } } }).catch(() => {})");
    await sleep(400);
    await js('window.__myheat.run("settings")');
    await waitFor(() => js('Boolean(window.__myheat.query("[data-testid=settings-apply]"))'), 5000);
    await sleep(600);
    const size = await js('(() => { const el = window.__myheat.query("[data-testid=dialog-settings]"); const w = el.ownerDocument.defaultView; return { w: w.innerWidth, h: w.innerHeight, own: el.ownerDocument !== document }; })()');
    assert(size.own && size.w >= 800 && size.h >= 540, `settings window ${JSON.stringify(size)}`);
    { const t = (await targets()).find((x) => /#popout-dialog-settings/.test(x.url)); if (t) { const c = await new Cdp(t.webSocketDebuggerUrl).open(); await c.screenshot(path.join(shots, 'popout-settings.png')).catch(() => {}); c.close(); } }
    await js('window.__myheat.query("[data-testid=settings-cancel]").click()');
    await sleep(300);
    // The File menu drops into the menu window.
    await js('document.querySelector("[data-testid=menu-file]").click()');
    await waitFor(() => js('Boolean(window.__myheat.query("[data-testid=menuitem-open]")) && !document.querySelector("[data-testid=menu-popup]")'), 5000);
    await waitFor(async () => (await targets()).some((t) => /#popout-menu/.test(t.url)), 5000);
    await sleep(300);
    { const t = (await targets()).find((x) => /#popout-menu/.test(x.url)); if (t) { const c = await new Cdp(t.webSocketDebuggerUrl).open(); await c.screenshot(path.join(shots, 'popout-file-menu.png')).catch(() => {}); c.close(); } }
    await js('window.__myheat.closeMenu()');
    await sleep(200);
    // The theme list too: picking in the menu window applies the theme.
    await js('document.querySelector("[data-testid=tb-theme-menu]").click()');
    await waitFor(() => js('Boolean(window.__myheat.query("[data-testid=theme-pick-custom]"))'), 5000);
    await sleep(300);
    { const t = (await targets()).find((x) => /#popout-menu/.test(x.url)); if (t) { const c = await new Cdp(t.webSocketDebuggerUrl).open(); await c.screenshot(path.join(shots, 'popout-theme-menu.png')).catch(() => {}); c.close(); } }
    await js('window.__myheat.query("[data-testid=theme-pick-light]").click()');
    await sleep(200);
    assert((await js('window.__myheat.state.settings.theme')) === 'light', 'theme not picked from the menu window');
    await js('window.__myheat.query("[data-testid=theme-pick-light]") === null || true');
  });

  for (const [sample, check] of [
    ['windowFrame', (r) => r.stats.Tmax < 21 && r.stats.Tmin > -18],
    ['pcb3d', (r) => r.stats.Tmax > 30],
    ['pcmSink', (r) => r.times > 10 && r.fields.includes('liquid')],
    ['cpuHeatsink', (r) => r.fields.includes('u')],
    ['ledStress', (r) => r.fields.includes('vonMises')],
  ]) {
    await step(`native solve: ${sample}`, async () => {
      const r = await solve(sample);
      assert(r?.ok, `no result ${JSON.stringify(r)}`);
      assert(check(r), `out of range ${JSON.stringify(r)}`);
      await cdp.screenshot(path.join(shots, `sample-${sample}.png`));
    });
  }

  await step('save as and reopen through the backend file commands', async () => {
    const file = path.join(scratch, 'saved.myheat').replace(/\\/g, '/');
    await js(`window.__TAURI_INTERNALS__.invoke('write_text_file', { path: ${JSON.stringify(file)}, content: JSON.stringify(window.__myheat.doc().model), op: 'save' })`);
    const text = await js(`window.__TAURI_INTERNALS__.invoke('read_text_file', { path: ${JSON.stringify(file)}, op: 'open' })`);
    assert(JSON.parse(text).format === 'myheat', 'not a model');
  });
} finally {
  cdp?.close();
  app.kill();
}

// Batch mode: no window, outputs next to the model.
const batchDir = path.join(scratch, 'batch');
fs.mkdirSync(batchDir, { recursive: true });
fs.copyFileSync(path.join(root, 'samples', 'windowFrame.myheat'), path.join(batchDir, 'window.myheat'));
await step('batch: --batch writes summary JSON, CSV and PNG', async () => {
  const r = spawnSync(exe, ['--batch', path.join(batchDir, 'window.myheat'), '--quiet'], { encoding: 'utf8', env: { ...process.env, MYHEATMANAGER_LOCK_DIR: path.join(scratch, 'lock2') } });
  assert(r.status === 0, `exit ${r.status}: ${r.stdout} ${r.stderr}`);
  const summary = JSON.parse(fs.readFileSync(path.join(batchDir, 'window.summary.json'), 'utf8'));
  assert(summary.ok && summary.stats.Tmax < 21, 'summary');
  const csv = fs.readFileSync(path.join(batchDir, 'window.T.csv'), 'utf8').split('\n');
  assert(csv.length > 1000, `csv rows ${csv.length}`);
  const png = fs.readFileSync(path.join(batchDir, 'window.T.png'));
  assert(png.subarray(1, 4).toString() === 'PNG', 'png');
});
await step('batch: a broken model fails with exit code 2', async () => {
  fs.writeFileSync(path.join(batchDir, 'broken.myheat'), '{ not json');
  const r = spawnSync(exe, ['--batch', path.join(batchDir, 'broken.myheat'), '--quiet'], { encoding: 'utf8' });
  assert(r.status === 2, `exit ${r.status}`);
});

const passed = results.filter((r) => r.ok).length;
fs.mkdirSync(shots, { recursive: true });
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${totalsLine('E2E', passed, results.length - passed)}`);
setTimeout(() => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* locked */ } }, 1500);
process.exitCode = passed === results.length ? 0 : 1;
