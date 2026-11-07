// Desktop E2E: the real program (tauri build --debug --no-bundle, the page embedded) driven over WebView2's DevTools port.
// Prints "E2E: <passed> passed, <failed> failed". The program runs with its own config, lock and profile folders under the
// temp directory, so the user's settings and an installed copy are never touched, and no file outside that folder is written.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, freePort, sleep, waitFor } from './cdp.mjs';
import { resultLine, totalsLine } from './report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'test-results', 'desktop');
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const exeName = process.platform === 'win32' ? 'My3DBlender.exe' : 'My3DBlender';
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
  const sources = Math.max(newest(path.join(root, 'src')), newest(path.join(root, 'src-tauri', 'src')), newest(path.join(root, 'public')));
  if (fs.existsSync(exe) && fs.statSync(exe).mtimeMs > sources) return;
  console.log('  building the debug program (tauri build --debug --no-bundle)...');
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'build', '--debug', '--no-bundle'], { cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: targetDir } });
  if (r.status !== 0) throw new Error('debug build failed');
}

ensureBuilt();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'my3d-desktop-'));
const port = await freePort();
const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
// A local server stands in for Microsoft's: a slow download to stop, a failure, and one that finishes. The setup itself is never run.
let pkgMode = 'ok';
const pkgServer = http.createServer((req, res) => {
  if (pkgMode === 'fail') { res.writeHead(500); res.end('no'); return; }
  const size = pkgMode === 'slow' ? 4 * 1024 * 1024 : 256 * 1024;
  res.writeHead(200, { 'Content-Length': String(size) });
  let sent = 0;
  const chunk = Buffer.alloc(64 * 1024, 1);
  const send = () => {
    if (res.destroyed) return;
    if (sent >= size) { res.end(); return; }
    res.write(chunk);
    sent += chunk.length;
    setTimeout(send, pkgMode === 'slow' ? 60 : 0);
  };
  send();
});
await new Promise((resolve) => { pkgServer.listen(0, '127.0.0.1', resolve); });
const app = spawn(exe, [], {
  stdio: 'ignore',
  env: {
    ...childEnv,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: path.join(scratch, 'webview'),
    MY3DBLENDER_CONFIG_DIR: path.join(scratch, 'config'),
    MY3DBLENDER_LOCK_DIR: path.join(scratch, 'lock'),
    MY3DBLENDER_NO_OPEN: '1',
    MY3DBLENDER_PKG_URL: `http://127.0.0.1:${pkgServer.address().port}/setup.exe`,
    MY3DBLENDER_PKG_NO_RUN: '1',
  },
});
let exited = null;
app.on('exit', (code) => { exited = code ?? 0; });

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
    try { await cdp?.screenshot(path.join(shots, `fail-${name.replace(/[^\w-]+/g, '_').slice(0, 60)}.png`)); } catch { /* gone */ }
  }
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const eq = (a, b, message) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${message}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/** Resizes the real window through the OS, the way Snap does (Tauri's own minimum does not stop this). Windows only. */
function setWindowSizeOS(pid, width, height) {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
}
"@
$p = Get-Process -Id ${pid}
[W]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, 0, 0, ${width}, ${height}, 0x0016) | Out-Null`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
}

try {
  const target = await waitFor(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return list.find((item) => item.type === 'page' && /tauri\.localhost|localhost/.test(item.url));
  }, 60000, 300);
  cdp = await new Cdp(target.webSocketDebuggerUrl).open();
  cdp.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await waitFor(() => cdp.evaluate('Boolean(window.__my3d)'), 30000);
  const js = (expression) => cdp.evaluate(expression);
  const frame = () => js('new Promise((resolve) => setTimeout(resolve, 80))');
  const targets = async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).map((t) => t.url);
  // The suite reads and prints English.
  await js(`(() => { const a = window.__my3d; if (a.settings.language !== 'en') document.querySelector('[data-testid=language]').click(); })()`);
  await step('at first start the tutorial popup and the start screen open, with the samples in their section', async () => {
    await waitFor(() => js("Boolean(window.__my3d.query('[data-testid=\"tutorial-ask-later\"]'))"), 10000);
    await js("window.__my3d.query('[data-testid=\"tutorial-ask-later\"]').click()");
    eq(await js("document.querySelector('[data-testid=start-screen]').style.display !== 'none'"), true, 'shown at start');
    await waitFor(() => js("document.querySelectorAll('[data-card]').length === 6"), 10000);
    await waitFor(() => js("document.querySelectorAll('[data-testid=start-card-samples] .sample-card').length >= 40"), 10000);
    await waitFor(() => js("document.querySelector('[data-testid=start-card-samples] .sample-card img').naturalWidth > 0"), 10000);
  });
  await js('window.__my3d.hideStart()');

  await step('the program starts, shows its window and draws the scene with the GPU', async () => {
    await waitFor(() => js('!document.hidden'), 20000);
    eq(await js('window.__my3d.doc.objects.length'), 3, 'objects');
    await frame();
    const distinct = await js(`(() => {
      const c = document.querySelector('[data-testid=gl-canvas]');
      const s = document.createElement('canvas'); s.width = 64; s.height = 64;
      const g = s.getContext('2d'); g.drawImage(c, 0, 0, 64, 64);
      const d = g.getImageData(0, 0, 64, 64).data; const seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
      return seen.size; })()`);
    assert(distinct > 3, `canvas has ${distinct} colours`);
    await cdp.screenshot(path.join(shots, 'start.png'));
  });
  await step('it is frameless: its own minimize, maximize and close buttons are in the top bar', async () => {
    eq(await js("document.querySelectorAll('.topbar .win-btn').length"), 3, 'window buttons');
  });
  await step('About reports the build of the real program', async () => {
    const info = await js("window.__TAURI_INTERNALS__.invoke('app_info')");
    eq(info.name, 'My3DBlender', 'name');
    assert(/^\d+\.\d+\.\d+$/.test(info.version), `version ${info.version}`);
  });
  await step('Preferences opens as a window of its own, and closes', async () => {
    await js("document.querySelector('[data-testid=settings]').click()");
    await waitFor(async () => (await targets()).some((url) => url.includes('popout-dialog-settings')), 8000);
    await waitFor(() => js("Boolean(window.__my3d.query('[data-testid=dialog-settings]'))"), 5000);
    await js("window.__my3d.closeAllDialogs()");
    await waitFor(async () => !(await targets()).some((url) => url.includes('popout-dialog-settings')), 8000);
  });
  await step('a project written to disk reads back the same, through the native file commands', async () => {
    const file = path.join(scratch, 'scene.my3d').replaceAll('\\', '/');
    await js("window.__my3d.op('mesh.primitive_torus_add')");
    const text = await js("import('./src/core/doc.js').catch(() => null).then(() => { const skip = (k, v) => (k.startsWith('_') ? undefined : v); return JSON.stringify(window.__my3d.doc, skip); })");
    await js(`window.__TAURI_INTERNALS__.invoke('write_text_file', { path: ${JSON.stringify(file)}, content: ${JSON.stringify(text)}, op: 'save' })`);
    assert(fs.existsSync(file), 'the file exists');
    eq(JSON.parse(fs.readFileSync(file, 'utf8')).objects.length, 4, 'objects in the file');
    const back = await js(`window.__TAURI_INTERNALS__.invoke('read_text_file', { path: ${JSON.stringify(file)}, op: 'open' })`);
    eq(back, text, 'read back');
    await js(`window.__my3d.replaceDocument(${JSON.stringify(back)}, true)`);
    eq(await js('window.__my3d.doc.objects.at(-1).name'), 'Torus', 'loaded');
  });
  await step('binary files cross the native boundary intact (the import path)', async () => {
    const file = path.join(scratch, 'bytes.bin');
    const bytes = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
    fs.writeFileSync(file, bytes);
    const base64 = await js(`window.__TAURI_INTERNALS__.invoke('read_base64_file', { path: ${JSON.stringify(file.replaceAll('\\', '/'))} })`);
    eq(base64, bytes.toString('base64'), 'bytes');
  });
  await step('the path tracer runs in workers inside the program', async () => {
    await js("Object.assign(window.__my3d.doc.render, { width: 64, height: 36, percent: 100, samples: 2, engine: 'PATH' }); void window.__my3d.startRender();");
    await waitFor(() => js('Boolean(window.__my3d.renderResult?.linear) && !window.__my3d.isRendering()'), 120000, 150);
    eq(await js('[window.__my3d.renderResult.width, window.__my3d.renderResult.height]'), [64, 36], 'size');
    assert(await js('window.__my3d.renderResult.linear.data.some((x, i) => i % 4 === 0 && x > 0.05)'), 'the image is not black');
  });
  await step('the real-time engine renders with the GPU', async () => {
    await js("window.__my3d.renderResult = null; Object.assign(window.__my3d.doc.render, { width: 160, height: 90, engine: 'REALTIME' }); void window.__my3d.startRender();");
    await waitFor(() => js('Boolean(window.__my3d.renderResult?.linear)'), 30000, 100);
    assert(await js('window.__my3d.renderResult.display.some((x, i) => i % 4 === 0 && x > 20)'), 'the image is not black');
  });
  await step('all workspaces build in the real window', async () => {
    for (const id of ['modeling', 'sculpting', 'uv', 'paint', 'shading', 'animation', 'rendering', 'compositing', 'geonodes', 'scripting', 'layout']) {
      await js(`document.querySelector('[data-testid=ws-${id}]').click()`);
      await frame();
      await cdp.screenshot(path.join(shots, `ws-${id}.png`));
    }
  });
  await step('a sample opens from the start screen inside the program', async () => {
    await js('window.__my3d.showStart()');
    await waitFor(() => js("Boolean(document.querySelector('[data-testid=sample-snowman]'))"), 10000);
    await js("document.querySelector('[data-testid=sample-snowman]').click()");
    await waitFor(() => js("window.__my3d.doc.name === 'Snowman'"), 10000);
    eq(await js("document.querySelector('[data-testid=start-screen]').style.display"), 'none', 'the start screen closes');
  });
  await step('the tutorial runs to its end in the real program, with a real render', async () => {
    await js('void window.__my3d.startTutorial()');
    await sleep(300);
    // Unsaved work from the steps before is asked about, in a window of its own.
    if (await js(`Boolean(window.__my3d.query('[data-testid="ask-discard"]'))`)) await js(`window.__my3d.query('[data-testid="ask-discard"]').click()`);
    await waitFor(() => js("Boolean(document.querySelector('[data-testid=tutorial-card]'))"), 8000);
    const button = (id) => `document.querySelector('[data-testid=${id}]')`;
    for (let guard = 0; guard < 40; guard++) {
      if (await js(`Boolean(${button('tutorial-done')})`)) break;
      if (await js(`Boolean(${button('tutorial-do')})`)) await js(`${button('tutorial-do')}.click()`);
      await waitFor(() => js(`!${button('tutorial-next')}.disabled`), 120000, 100);
      await js(`${button('tutorial-next')}.click()`);
      await frame();
    }
    assert(await js(`Boolean(${button('tutorial-done')})`), 'it reached the last step');
    const final = await js("(() => { const a = window.__my3d; const b = a.doc.objects.find((o) => /sphere/i.test(o.name)); return { smooth: b.data.smooth, keys: Object.keys(b.anim.fcurves).length, linear: Boolean(a.renderResult?.linear) }; })()");
    assert(final.smooth && final.keys > 0 && final.linear, JSON.stringify(final));
    await js(`${button('tutorial-done')}.click()`);
    eq(await js(`Boolean(${button('tutorial-card')})`), false, 'it closes');
  });
  await step('the interface scale zooms the real window, and Hangul text gets a system font', async () => {
    const before = await js('window.innerWidth');
    await js('window.__my3d.setUiScaleForTest(1.25)');
    await waitFor(async () => (await js('window.innerWidth')) < before * 0.9, 6000);
    await js('window.__my3d.setUiScaleForTest(1)');
    await waitFor(async () => Math.abs((await js('window.innerWidth')) - before) < 2, 6000);
    // No font chosen, Hangul typed: the program finds one of the usual fonts.
    await js("window.__my3d.op('object.text_add', { body: '가나다' })");
    await waitFor(() => js("(() => { const a = window.__my3d; const o = a.doc.objects.find((x) => x.type === 'TEXT'); const list = a.evaluatedFaces(o); return list > 100; })()"), 15000, 200);
  });
  await step('windows have the size grip in their bottom right corner', async () => {
    const corner = await js("(() => { const g = document.querySelector('[data-testid=window-grip]').getBoundingClientRect(); return { right: innerWidth - g.right, bottom: innerHeight - g.bottom, dots: document.querySelectorAll('[data-testid=window-grip] circle').length }; })()");
    assert(corner.right < 8 && corner.bottom < 8, `in the corner: ${JSON.stringify(corner)}`);
    eq(corner.dots, 6, 'six dots in a triangle');
  });
  await step('Preferences › Packages: state, progress in the real window, stop, failure with a retry, and finishing', async () => {
    const q = (id) => `window.__my3d.query('[data-testid="${id}"]')`;
    await js("document.querySelector('[data-testid=settings]').click()");
    await waitFor(() => js(`Boolean(${q('pref-tab-packages')})`), 8000);
    await js(`${q('pref-tab-packages')}.click()`);
    await waitFor(() => js(`(${q('pkg-state')}.textContent || '').length > 3`), 5000);
    assert((await js(`${q('pkg-state')}.textContent`)).includes('Installed'), 'this copy is running on it');
    eq(await js(`Boolean(${q('dialog-grip')})`), true, 'the window has the size grip');
    const confirm = async () => { await waitFor(() => js(`Boolean(${q('ask-go')})`), 5000); await js(`${q('ask-go')}.click()`); };
    // Stop.
    pkgMode = 'slow';
    await js(`${q('pkg-install')}.click()`);
    await confirm();
    await waitFor(() => js(`/Downloading \\d+%/.test(${q('pkg-progress')}.textContent)`), 8000, 50);
    const percent = await js(`parseFloat(${q('pkg-fill')}.style.width)`);
    assert(percent >= 0 && percent < 100, `the bar shows it: ${percent}`);
    await js(`${q('pkg-stop')}.click()`);
    await waitFor(() => js(`/Stopped/.test(${q('pkg-progress')}.textContent)`), 8000, 50);
    // A failure asks whether to try again; trying again works.
    pkgMode = 'fail';
    await js(`${q('pkg-install')}.click()`);
    await confirm();
    await waitFor(() => js(`Boolean(${q('ask-retry')})`), 8000, 50);
    pkgMode = 'ok';
    await js(`${q('ask-retry')}.click()`);
    await waitFor(() => js(`/Finished/.test(${q('pkg-progress')}.textContent)`), 8000, 50);
    await js(`${q('dialog-close')}.click()`);
  });
  await step('the user\'s guide opens in its own window', async () => {
    await js("window.__TAURI_INTERNALS__.invoke('open_doc_window', { name: 'UsersGuide.en.html', title: 'Guide' })");
    await waitFor(async () => (await targets()).some((url) => url.includes('UsersGuide.en.html')), 10000);
    // The page's own script runs in the real window: the tree, the text size, the language link.
    const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.url.includes('UsersGuide.en.html'));
    const guide = await new Cdp(page.webSocketDebuggerUrl).open();
    await guide.send('Runtime.enable');
    await waitFor(() => guide.evaluate("document.querySelectorAll('.doc-tree a').length > 10 && document.getElementById('doc-font-value').textContent === '15px'"), 8000);
    await guide.evaluate("document.getElementById('doc-font-up').click()");
    eq(await guide.evaluate("document.getElementById('doc-font-value').textContent"), '16px', 'text size');
    await guide.evaluate("document.getElementById('doc-font-reset').click(); document.getElementById('doc-lang').click()");
    await waitFor(async () => (await targets()).some((url) => /doc\/UsersGuide\.html/.test(url)), 8000);
  });
  if (process.platform === 'win32') {
    await step('the window cannot be made narrower than the top bar, even by the OS', async () => {
      const need = await js('window.__my3d.minWidth');
      assert(need >= 800, `minimum ${need}`);
      setWindowSizeOS(app.pid, 620, 500);
      await sleep(900);
      const m = await js(`(() => { const bar = document.querySelector('[data-testid=topbar]'); return { w: innerWidth, h: innerHeight, overflow: bar.scrollWidth - bar.clientWidth, page: document.documentElement.scrollWidth - innerWidth }; })()`);
      assert(m.w >= need - 1, `width ${m.w} is under ${need}`);
      assert(m.overflow <= 0, `top bar overflow ${m.overflow}`);
      assert(m.page <= 0, `page scrolls sideways ${m.page}`);
      setWindowSizeOS(app.pid, 1500, 900);
      await sleep(500);
    });
  }
  await step('closing with no unsaved work ends the program', async () => {
    await js('window.__my3d.fileSaved()');
    await js("void document.querySelector('[data-testid=win-close]').click()").catch(() => {});
    await waitFor(() => exited !== null, 15000, 200);
    eq(exited, 0, 'exit code');
  });
} catch (error) {
  results.push({ name: 'the suite ran to the end', ok: false, error: error.message });
  console.log(resultLine({ status: 'fail', name: 'the suite ran to the end', error: error.message }));
} finally {
  cdp?.close();
  if (exited === null) app.kill();
  await sleep(500);
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* the webview may still hold its profile for a moment */ }
}
const failed = results.filter((r) => !r.ok).length;
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify(results, null, 2));
console.log(totalsLine('E2E', results.length - failed, failed));
pkgServer.close();
process.exit(failed ? 1 : 0);
