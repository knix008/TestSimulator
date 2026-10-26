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
const exeName = process.platform === 'win32' ? 'MySimulator.exe' : 'MySimulator';
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
  const sources = Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'src-tauri', 'src')), newest(path.join(root, 'engine', 'sim-core', 'src')));
  if (fs.existsSync(exe) && fs.statSync(exe).mtimeMs > sources && process.env.E2E_NO_BUILD !== '0') return;
  console.log('  building the debug program (tauri build --debug --no-bundle)…');
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle'], { cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: targetDir } });
  if (r.status !== 0) throw new Error('debug build failed');
}

ensureBuilt();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mysim-desktop-'));
const port = await freePort();
const app = spawn(exe, [], {
  stdio: 'ignore',
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: path.join(scratch, 'webview'),
    MYSIMULATOR_CONFIG_DIR: path.join(scratch, 'config'),
    MYSIMULATOR_LOCK_DIR: path.join(scratch, 'lock'),
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
  await waitFor(() => cdp.evaluate('Boolean(window.__mysim)'), 30000);
  const js = (expression) => cdp.evaluate(expression);
  // The program starts in Korean; the tests run it in English so that everything they print is English.
  await js('window.__mysim.state.settings.language === "en" || window.__mysim.api.patchSettings({ language: "en" })');
  await step('window: the page loads with the native engine', async () => {
    assert(await js('Boolean(document.querySelector("[data-testid=menubar]"))'), 'no menu bar');
    const engine = await js('document.querySelector("[data-testid=status-engine]").textContent');
    assert(/Rust/.test(engine) && !/WebAssembly/.test(engine), `engine: ${engine}`);
    await cdp.screenshot(path.join(shots, '01-window.png'));
  });

  await step('title row: no system title bar; icon, name, version, home, window buttons, size grip', async () => {
    const brand = await js('document.querySelector("[data-testid=app-brand]")?.textContent');
    assert(/MySimulator/.test(brand) && /v1.0.0/.test(brand), `brand: ${brand}`);
    assert(await js('Boolean(document.querySelector("[data-testid=app-brand] img"))'), 'no icon');
    const order = await js('[...document.querySelector("[data-testid=menubar]").children].map((el) => el.dataset.testid ?? el.className)');
    assert(order.indexOf('tb-home') === order.indexOf('menu-file') - 1, `home is not left of File: ${order.join(',')}`);
    assert(!(await js('Boolean(document.querySelector("[data-testid=toolbar] [data-testid=tb-home]"))')), 'home still on the toolbar');
    for (const id of ['win-min', 'win-max', 'win-close', 'size-grip']) assert(await js(`Boolean(document.querySelector('[data-testid=${id}]'))`), `no ${id}`);
    // The window has no system frame: its client area starts at the window's top (no caption).
    const caption = await js('window.outerHeight - window.innerHeight');
    assert(caption < 20, `a caption of ${caption} px is still there`);
    await js('document.querySelector("[data-testid=win-max]").click()');
    await waitFor(() => js('window.__mysim.state.maximized === true'), 5000);
    await js('document.querySelector("[data-testid=win-max]").click()');
    await waitFor(() => js('window.__mysim.state.maximized === false'), 5000);
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
    await js('window.__mysim.run("about")');
    await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=dialog-about]"))'), 5000);
    await sleep(300);
    const text = await js('window.__mysim.query("[data-testid=dialog-about]").textContent');
    assert(/1\.0\.0/.test(text), 'no version');
    assert(/Tauri/.test(text), 'no Tauri version');
    // The dialog lives in a pop-out window (about:blank#popout-dialog-about-n), not in the main page.
    assert(!(await js('Boolean(document.querySelector("[data-testid=dialog-about]"))')), 'the dialog is still drawn in the main page');
    await waitFor(async () => (await targets()).some((t) => /#popout-dialog-about/.test(t.url)), 5000);
    await js('window.__mysim.query("[data-testid=dialog-close-about]").click()');
    await waitFor(async () => !(await targets()).some((t) => /#popout-dialog-about/.test(t.url)), 5000);
  });

  await step('pop-out windows: settings may be bigger than the main window; menus open in the menu window', async () => {
    // A small main window: the settings window (820 x 560) still shows whole, past the main window if need be.
    await js("window.__TAURI_INTERNALS__.invoke('plugin:window|unmaximize', { label: 'main' }).catch(() => {})");
    await js("window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1100, height: 700 } } }).catch(() => {})");
    await sleep(400);
    await js('window.__mysim.run("settings")');
    await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=settings-apply]"))'), 5000);
    await sleep(600);
    const size = await js('(() => { const el = window.__mysim.query("[data-testid=dialog-settings]"); const w = el.ownerDocument.defaultView; return { w: w.innerWidth, h: w.innerHeight, own: el.ownerDocument !== document }; })()');
    assert(size.own && size.w >= 800 && size.h >= 540, `settings window ${JSON.stringify(size)}`);
    { const t = (await targets()).find((x) => /#popout-dialog-settings/.test(x.url)); if (t) { const c = await new Cdp(t.webSocketDebuggerUrl).open(); await c.screenshot(path.join(shots, 'popout-settings.png')).catch(() => {}); c.close(); } }
    await js('window.__mysim.query("[data-testid=settings-cancel]").click()');
    await sleep(300);
    // The File menu drops into the menu window.
    await js('document.querySelector("[data-testid=menu-file]").click()');
    await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=menuitem-open]")) && !document.querySelector("[data-testid=menu-popup]")'), 5000);
    await waitFor(async () => (await targets()).some((t) => /#popout-menu/.test(t.url)), 5000);
    await sleep(300);
    { const t = (await targets()).find((x) => /#popout-menu/.test(x.url)); if (t) { const c = await new Cdp(t.webSocketDebuggerUrl).open(); await c.screenshot(path.join(shots, 'popout-file-menu.png')).catch(() => {}); c.close(); } }
    await js('window.__mysim.closeMenu()');
    await sleep(200);
    // The theme list too: picking in the menu window applies the theme.
    await js('document.querySelector("[data-testid=tb-theme-menu]").click()');
    await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=theme-pick-custom]"))'), 5000);
    await sleep(300);
    { const t = (await targets()).find((x) => /#popout-menu/.test(x.url)); if (t) { const c = await new Cdp(t.webSocketDebuggerUrl).open(); await c.screenshot(path.join(shots, 'popout-theme-menu.png')).catch(() => {}); c.close(); } }
    await js('window.__mysim.query("[data-testid=theme-pick-light]").click()');
    await sleep(200);
    assert((await js('window.__mysim.state.settings.theme')) === 'light', 'theme not picked from the menu window');
    await js('window.__mysim.query("[data-testid=theme-pick-light]") === null || true');
  });

  const runSample = async (sample) => {
    await js(`window.__mysim.run('newFromSample')`);
    await waitFor(() => js(`Boolean(window.__mysim.query('[data-testid=sample-${sample}]')?.ownerDocument.defaultView.innerWidth)`), 5000);
    await js(`window.__mysim.query('[data-testid=sample-${sample}]').click()`);
    await sleep(200);
    await js('window.__mysim.api.runPipeline()');
    await waitFor(() => js('!window.__mysim.state.running'), 240000, 200);
    return js(`(() => { const d = window.__mysim.doc(); return d.model.nodes.map((n) => { const o = d.results?.get(n.id); return { id: n.id, type: n.type, ok: Boolean(o?.ok), error: o?.error ?? null, ms: o?.elapsedMs ?? 0, scalars: Object.fromEntries((o?.scalars ?? []).map((s) => [s.name, s.value])) }; }); })()`);
  };

  for (const [sample, check] of [
    ['signalCleanup', (r) => Math.abs(r.find((n) => n.id === 'kpiF').scalars['Dominant frequency'] - 50) < 0.5],
    ['pidControl', (r) => r.find((n) => n.id === 'pid').scalars['steady-state error'] !== undefined],
    ['classification', (r) => r.find((n) => n.id === 'mlp').scalars['test accuracy'] > 90],
    ['tolerance', (r) => r.find((n) => n.id === 'mc').scalars['P(condition)'] > 1],
    ['pidSweep', (r) => r.find((n) => n.id === 'sw').ok],
  ]) {
    await step(`native run: ${sample}`, async () => {
      const r = await runSample(sample);
      const bad = r.filter((n) => !n.ok);
      assert(!bad.length, `failed nodes: ${bad.map((n) => `${n.id}: ${n.error}`).join(' | ')}`);
      assert(check(r), `out of range ${JSON.stringify(r.map((n) => n.scalars))}`);
      // The native engine times every node (the web engine has no clock).
      assert(r.some((n) => n.ms > 0), 'no node timings');
      await cdp.screenshot(path.join(shots, `sample-${sample}.png`));
    });
  }

  await step('MATLAB desktop: the native session keeps its workspace', async () => {
    const call = (code, st) => js(`window.__TAURI_INTERNALS__.invoke('matlab_eval', { request: JSON.stringify({ code: ${JSON.stringify(code)}, files: [], state: ${st ?? 'null'}, seed: 1 }), baseDir: null }).then((t) => JSON.parse(t))`);
    const r1 = await call('A = magic(4); s = sum(A(:))');
    assert(r1.ok && r1.output.includes('s = 136'), JSON.stringify(r1).slice(0, 300));
    const r2 = await call('t = trace(A)', JSON.stringify(r1.state));
    assert(r2.ok && r2.output.includes('t = 34'), JSON.stringify(r2).slice(0, 300));
    // The view itself: switch, run a command through the UI, back to the graph.
    await js(`window.__mysim.run('viewMatlab')`);
    await sleep(300);
    await js(`(() => { const ta = window.__mysim.query('[data-testid=ml-input]'); ta.value = 'x = linspace(0, 1, 5)'; ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await waitFor(() => js('Boolean(window.__mysim.doc().mlab?.vars?.some((v) => v.name === "x"))'), 20000, 100);
    await cdp.screenshot(path.join(shots, 'matlab-desktop.png'));
    await js(`window.__mysim.run('viewGraph')`);
  });

  await step('python node: runs the installed Python after the permission question', async () => {
    const python = await js('window.__TAURI_INTERNALS__.invoke("python_info")');
    if (!python) {
      // No Python on this computer: the node must fail with a clear message instead.
      await js(`window.__mysim.run('newFromSample')`);
      await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=sample-python]"))'), 5000);
      await js('window.__mysim.query("[data-testid=sample-python]").click()');
      void js('window.__mysim.api.runPipeline()');
      await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=external-allow]"))'), 8000);
      await js('window.__mysim.query("[data-testid=external-allow]").click()');
      await waitFor(() => js('!window.__mysim.state.running'), 60000, 200);
      const err = await js('window.__mysim.doc().results.get("py").error');
      assert(/Python 3 was not found/.test(err), `error: ${err}`);
      return;
    }
    await js(`window.__mysim.run('newFromSample')`);
    await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=sample-python]"))'), 5000);
    await js('window.__mysim.query("[data-testid=sample-python]").click()');
    await sleep(200);
    // Cancelling the question runs nothing.
    void js('window.__mysim.api.runPipeline()');
    await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=external-cancel]"))'), 8000);
    await js('window.__mysim.query("[data-testid=external-cancel]").click()');
    await sleep(300);
    assert(await js('!window.__mysim.doc().results'), 'ran although the question was cancelled');
    void js('window.__mysim.api.runPipeline()');
    await waitFor(() => js('Boolean(window.__mysim.query("[data-testid=external-allow]"))'), 8000);
    await js('window.__mysim.query("[data-testid=external-allow]").click()');
    await waitFor(() => js('!window.__mysim.state.running && Boolean(window.__mysim.doc().results)'), 120000, 200);
    const py = await js('(() => { const o = window.__mysim.doc().results.get("py"); return { ok: o.ok, error: o.error, cols: o.tables[0]?.columns.map((c) => c.name), peak: o.scalars.find((s) => s.name === "peak")?.value, text: o.text }; })()');
    assert(py.ok, `python failed: ${py.error}`);
    assert(py.cols.includes('smooth') && py.peak > 0.5, `python output ${JSON.stringify(py)}`);
    assert(/rows: 801/.test(py.text), `printed text: ${py.text}`);
    // The second run in the same tab does not ask again.
    await js('window.__mysim.api.runPipeline()');
    assert(!(await js('Boolean(window.__mysim.query("[data-testid=external-allow]"))')), 'asked twice');
    await cdp.screenshot(path.join(shots, 'python.png'));
  });

  await step('files: read and write data files relative to the saved pipeline', async () => {
    const folder = path.join(scratch, 'files').replace(/\\/g, '/');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'in.csv'), 't,y\n0,1\n1,3\n2,5\n');
    const model = {
      format: 'mysim', version: 1, name: 'files',
      nodes: [
        { id: 'r', type: 'io.readFile', name: 'read', x: 0, y: 0, params: { path: 'in.csv' } },
        { id: 'e', type: 'data.expression', name: 'double', x: 250, y: 0, params: { expressions: 'z = 2*y' } },
        { id: 'w', type: 'io.writeFile', name: 'write', x: 500, y: 0, params: { path: 'out/result.csv' } },
      ],
      links: [{ from: 'r', to: 'e' }, { from: 'e', to: 'w' }],
    };
    const file = `${folder}/files.mysim`;
    fs.writeFileSync(file, JSON.stringify(model));
    await js(`window.__mysim.api.openPath(${JSON.stringify(file)})`);
    await sleep(300);
    await js('window.__mysim.api.runPipeline()');
    await waitFor(() => js('!window.__mysim.state.running && Boolean(window.__mysim.doc().results)'), 30000, 200);
    const out = fs.readFileSync(path.join(folder, 'out', 'result.csv'), 'utf8');
    assert(out.startsWith('t,y,z\n0,1,2\n1,3,6'), `written: ${out}`);
  });

  await step('save and reopen through the backend file commands', async () => {
    const file = path.join(scratch, 'saved.mysim').replace(/\\/g, '/');
    await js(`window.__TAURI_INTERNALS__.invoke('write_text_file', { path: ${JSON.stringify(file)}, content: JSON.stringify(window.__mysim.doc().model), op: 'save' })`);
    const text = await js(`window.__TAURI_INTERNALS__.invoke('read_text_file', { path: ${JSON.stringify(file)}, op: 'open' })`);
    assert(JSON.parse(text).format === 'mysim', 'not a pipeline');
  });
} finally {
  cdp?.close();
  app.kill();
}

// Batch mode: no window, outputs next to the pipeline or in --out.
const batchDir = path.join(scratch, 'batch');
fs.mkdirSync(batchDir, { recursive: true });
fs.copyFileSync(path.join(root, 'samples', 'en', 'signalCleanup.mysim'), path.join(batchDir, 'clean.mysim'));
fs.copyFileSync(path.join(root, 'samples', 'en', 'chirpSpectrogram.mysim'), path.join(batchDir, 'chirp.mysim'));
const batchEnv = { ...process.env, MYSIMULATOR_LOCK_DIR: path.join(scratch, 'lock2') };
await step('batch: --batch writes the summary JSON and every table as CSV', async () => {
  const r = spawnSync(exe, ['--batch', path.join(batchDir, 'clean.mysim'), '--quiet'], { encoding: 'utf8', env: batchEnv });
  assert(r.status === 0, `exit ${r.status}: ${r.stdout} ${r.stderr}`);
  const summary = JSON.parse(fs.readFileSync(path.join(batchDir, 'clean.summary.json'), 'utf8'));
  assert(summary.ok && summary.nodes.length === 8, 'summary');
  const f0 = summary.nodes.find((n) => n.id === 'kpiF').results['Dominant frequency'];
  assert(Math.abs(f0 - 50) < 0.5, `dominant ${f0}`);
  const csv = fs.readFileSync(path.join(batchDir, 'clean.lp.filtered.csv'), 'utf8').split('\n');
  assert(csv[0] === 't (s),y,filtered,removed' && csv.length > 2000, `csv ${csv[0]} ${csv.length}`);
});
await step('batch: --set changes a parameter, --out and --only pick the outputs, grids become PNG', async () => {
  const out = path.join(batchDir, 'out');
  const r = spawnSync(exe, ['--batch', path.join(batchDir, 'clean.mysim'), '--set', 'sig.frequency=80', '--set', 'lp.cutoff=120', '--out', out, '--only', 'kpiF', '--quiet'], { encoding: 'utf8', env: batchEnv });
  assert(r.status === 0, `exit ${r.status}: ${r.stdout}`);
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'clean.summary.json'), 'utf8'));
  const f0 = summary.nodes.find((n) => n.id === 'kpiF').results['Dominant frequency'];
  assert(Math.abs(f0 - 80) < 0.5, `--set did not apply: ${f0}`);
  assert(!fs.existsSync(path.join(out, 'clean.lp.filtered.csv')), '--only wrote other nodes');
  const r2 = spawnSync(exe, ['--batch', path.join(batchDir, 'chirp.mysim'), '--quiet'], { encoding: 'utf8', env: batchEnv });
  assert(r2.status === 0, `chirp exit ${r2.status}`);
  const png = fs.readFileSync(path.join(batchDir, 'chirp.spec.spectrogram.png'));
  assert(png.subarray(1, 4).toString() === 'PNG', 'png');
});
await step('batch: a broken pipeline fails with exit code 2, a bad option with 1', async () => {
  fs.writeFileSync(path.join(batchDir, 'broken.mysim'), '{ not json');
  const r = spawnSync(exe, ['--batch', path.join(batchDir, 'broken.mysim'), '--quiet'], { encoding: 'utf8', env: batchEnv });
  assert(r.status === 2, `exit ${r.status}`);
  const r2 = spawnSync(exe, ['--batch', path.join(batchDir, 'clean.mysim'), '--set', 'nonsense'], { encoding: 'utf8', env: batchEnv });
  assert(r2.status === 1, `exit ${r2.status}`);
});

const passed = results.filter((r) => r.ok).length;
fs.mkdirSync(shots, { recursive: true });
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${totalsLine('E2E', passed, results.length - passed)}`);
console.log(`E2E: ${passed} passed, ${results.length - passed} failed`);
setTimeout(() => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* locked */ } }, 1500);
process.exitCode = passed === results.length ? 0 : 1;
