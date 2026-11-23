// npm run docs:shots — takes the user guide pictures (doc/images/ko-*.jpg, en-*.jpg).
//
// Starts the web app on a free port, opens it in a headless Edge or Chrome with a fresh profile,
// drives it over the DevTools protocol (start screen → example painting → export menu → print
// window → guide) and saves one picture per step. It also checks the layout it photographs:
// the toolbar must fit at the minimum window width, and every screen must render without errors.
//
// Usage: node scripts/shoot-guide.mjs [--lang ko|en] [--check-only]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'doc', 'images');
const args = process.argv.slice(2);
const only = args.includes('--lang') ? [args[args.indexOf('--lang') + 1]] : ['ko', 'en'];
const checkOnly = args.includes('--check-only');
const WIDTH = 1400;
const HEIGHT = 860;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function browserPath() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('No Edge or Chrome found (set BROWSER_PATH).');
  return found;
}

function portFree(port, host) {
  return new Promise((done) => {
    const server = net.createServer();
    server.once('error', (error) => done(error.code === 'EADDRNOTAVAIL'));
    server.listen(port, host, () => server.close(() => done(true)));
  });
}

// A port nobody listens on, checked on IPv4 and IPv6 (another app may hold only one of them).
async function freePort(from) {
  for (let port = from; port < from + 200; port += 1) {
    if ((await portFree(port, '127.0.0.1')) && (await portFree(port, '::1'))) return port;
  }
  throw new Error('No free port');
}

async function waitFor(check, what, timeout = 30000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      // not ready yet
    }
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(150);
  }
}

class Page {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { done, fail } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) fail(new Error(message.error.message));
        else done(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text);
      } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
      }
    });
  }

  ready() {
    return new Promise((done, fail) => {
      this.ws.addEventListener('open', done, { once: true });
      this.ws.addEventListener('error', fail, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((done, fail) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(new Error(`${method} did not answer in 45 s`));
      }, 45000);
      this.pending.set(id, {
        done: (value) => { clearTimeout(timer); done(value); },
        fail: (error) => { clearTimeout(timer); fail(error); },
      });
    });
  }

  async eval(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  click(selector) {
    return this.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing ${selector}'); el.click(); return true; })()`);
  }

  async shot(name, { doc = true } = {}) {
    await sleep(350);
    const { data } = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    // The print window of the browser is not the guide's: the guide shows the desktop one (check-desktop.mjs).
    if (checkOnly || !doc) return;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, name), Buffer.from(data, 'base64'));
    console.log(`[shots] doc/images/${name}`);
  }
}

const imagesLoaded = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].every((img) => img.complete && img.naturalWidth > 0)`;

async function run(page, lang) {
  const p = (name) => `${lang}-${name}.jpg`;
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: page.base });
  await waitFor(() => page.eval('document.querySelectorAll(".example-card").length === 20'), 'the 20 example cards');
  if (lang === 'en') {
    await page.click('#btn-language');
    await waitFor(() => page.eval('document.documentElement.lang === "en"'), 'English');
  }
  await waitFor(() => page.eval(imagesLoaded('.example-card img')), 'example thumbnails');
  await page.shot(p('start'));

  // Start screen → example painting, converted at once.
  await page.click('[data-example="starry-night"]');
  await waitFor(() => page.eval('document.querySelectorAll("#gallery-track > *").length >= 10 && !document.querySelector("#btn-convert").classList.contains("is-running")'), 'conversion', 60000);
  await sleep(600);
  await page.shot(p('workspace'));

  // Pick a colour conversion for the remaining pictures.
  await page.eval('document.querySelector("#color").click()');
  await page.click('#btn-convert');
  await waitFor(() => page.eval('!document.querySelector("#btn-convert").classList.contains("is-running") && document.querySelectorAll("#gallery-track > *").length >= 10'), 'colour conversion', 60000);
  await sleep(400);

  // Input resolution 50 %: the source is halved before converting and so is the number of
  // characters; the exported image is the halved source size.
  for (let i = 0; i < 10; i += 1) await page.click('[aria-controls="input-scale"][data-nudge="-1"]');
  const scale = await page.eval('document.querySelector("#input-scale-out").textContent');
  if (scale !== '50%') throw new Error(`input resolution is ${scale}, expected 50%`);
  await page.click('#btn-convert');
  await waitFor(() => page.eval('!document.querySelector("#btn-convert").classList.contains("is-running") && /50%/.test(document.querySelector("#source-caption").textContent)'), 'conversion at 50 %', 60000);
  await sleep(400);
  await page.shot(p('resolution'));
  await page.click('#btn-export');
  const sizeText = await page.eval('document.querySelector("#export-size").textContent');
  if (!/^480 × 380 px/.test(sizeText)) throw new Error(`export size is "${sizeText}", expected 480 × 380 px`);
  await page.shot(p('export'));
  await page.eval('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))');
  await page.eval('document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');

  // Print window: default, then with the source image beside it in colour.
  await page.click('#btn-print');
  await waitFor(() => page.eval(`document.querySelector("#print-dialog").open && document.querySelectorAll(".sheet-frame img").length > 0 && ${imagesLoaded('.sheet-frame img')}`), 'print preview');
  await page.shot(p('print'), { doc: false });
  await page.click('#print-source-on');
  await page.click('input[name="print-ink"][value="color"]');
  await waitFor(() => page.eval(`document.querySelectorAll(".sheet-frame img").length === 2 && ${imagesLoaded('.sheet-frame img')}`), 'print preview with the source');
  const orientation = await page.eval('document.querySelector("#print-info").textContent');
  await page.shot(p('print-source'), { doc: false });

  // Press Print and look at the page as the printer gets it (print media): only the sheet is
  // shown, at the paper's size (A4 landscape, 1 mm shorter so it never spills onto a 2nd page),
  // with both pictures inside, and the @page rule asks for that paper with no margin.
  await page.eval('window.__printed = 0; window.print = () => { window.__printed += 1; }');
  await page.click('#print-go');
  await waitFor(() => page.eval(`window.__printed === 1 && !document.querySelector("#print-dialog").open && document.querySelectorAll("#print-sheet img").length === 2 && ${imagesLoaded('#print-sheet img')}`), 'print sheet');
  await page.send('Emulation.setEmulatedMedia', { media: 'print' });
  const printed = await page.eval(`(() => {
    const mm = (px) => Math.round(px * 25.4 / 96);
    const sheet = document.querySelector('#print-sheet .sheet').getBoundingClientRect();
    const imgs = [...document.querySelectorAll('#print-sheet img')].map((img) => img.getBoundingClientRect());
    const visible = [...document.body.children].filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.id || el.tagName);
    return { w: mm(sheet.width), h: mm(sheet.height), inside: imgs.every((r) => r.left >= sheet.left && r.right <= sheet.right + 1 && r.top >= sheet.top && r.bottom <= sheet.bottom + 1), visible, page: document.querySelector('#print-page-style').textContent };
  })()`);
  if (process.env.SHOTS_PRINT) {
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(process.env.SHOTS_PRINT.replace('{lang}', lang), Buffer.from(data, 'base64'));
  }
  await page.send('Emulation.setEmulatedMedia', { media: '' });
  const okPrint = printed.w === 297 && printed.h === 209 && printed.inside
    && printed.visible.join() === 'print-sheet' && printed.page === '@page { size: 297mm 210mm; margin: 0; }';
  if (!okPrint) throw new Error(`printed page is wrong: ${JSON.stringify(printed)}`);
  await page.click('#btn-print');
  await waitFor(() => page.eval('document.querySelector("#print-dialog").open'), 'print window again');
  await page.click('#print-defaults');
  await page.eval('document.querySelector("#print-dialog").close()');

  // User guide window.
  await page.click('#btn-guide');
  await waitFor(() => page.eval('document.querySelector("#guide-dialog").open && document.querySelectorAll("#guide-toc a").length > 3'), 'guide');
  await page.shot(p('guide'));
  await page.eval('document.querySelector("#guide-dialog").close()');

  // Extra views for a visual check (not used by the guide): the result card menu, the settings
  // window and a light theme. Saved only when SHOTS_EXTRA names a folder.
  if (process.env.SHOTS_EXTRA) {
    const extra = async (name) => {
      await sleep(300);
      const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
      writeFileSync(join(process.env.SHOTS_EXTRA, `${lang}-${name}.jpg`), Buffer.from(data, 'base64'));
    };
    await page.eval(`(() => { const card = document.querySelector('#gallery-track > *'); const r = card.getBoundingClientRect();
      card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 20 })); })()`);
    await extra('context-menu');
    await page.eval('document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');
    await page.click('#btn-settings');
    await page.click('[data-settings-tab="start"]');
    await extra('settings-start');
    await page.click('[data-settings-tab="theme"]');
    await extra('settings');
    await page.eval('document.querySelector("#settings-dialog").close()');
    await page.eval(`(() => { document.querySelector('#btn-theme-menu').click(); document.querySelector('#theme-menu-light [data-theme-id]').click(); })()`);
    await page.click('#btn-export');
    await extra('light-export');
    await page.eval('document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');
    await page.click('#btn-start');
    await extra('light-start');
    await page.click('#btn-start');
  }

  // Layout checks at the minimum window size (tauri.conf.json minWidth x minHeight): the toolbar
  // needs no more room than that, with every label shown.
  const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8')).app.windows[0];
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const needed = await page.eval(`(() => {
    const bar = document.querySelector('#toolbar');
    const style = getComputedStyle(bar);
    let sum = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    for (const child of bar.children) {
      const cs = getComputedStyle(child);
      const end = child.classList.contains('toolbar-end');
      sum += child.getBoundingClientRect().width + parseFloat(cs.marginRight) + (end ? 12 : parseFloat(cs.marginLeft));
    }
    return Math.ceil(sum);
  })()`);
  console.log(`[shots] toolbar needs ${needed} px; minimum window ${conf.minWidth} x ${conf.minHeight}`);
  if (needed > conf.minWidth) throw new Error(`the toolbar needs ${needed} px but the window may be ${conf.minWidth} px wide`);
  await page.send('Emulation.setDeviceMetricsOverride', { width: conf.minWidth, height: conf.minHeight, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const toolbar = await page.eval(`(() => {
    const bar = document.querySelector('#toolbar');
    const about = document.querySelector('#btn-about').getBoundingClientRect();
    return { overflow: bar.scrollWidth - bar.clientWidth, aboutRight: Math.round(about.right), width: innerWidth };
  })()`);
  if (toolbar.overflow > 0 || toolbar.aboutRight > toolbar.width) throw new Error(`toolbar clipped at the minimum width: ${JSON.stringify(toolbar)}`);
  await page.click('#btn-start');
  const startFits = await page.eval('(() => { const s = document.querySelector("#start-screen"); return s.scrollHeight <= s.clientHeight + 1; })()');
  if (!startFits) throw new Error('start screen overflows at the minimum size');
  await page.click('#btn-start');
  console.log(`[shots] ${lang}: export "${sizeText}", print "${orientation}", toolbar fits at the minimum width`);
}

async function main() {
  const port = await freePort(5300);
  const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let viteLog = '';
  vite.stdout.on('data', (chunk) => { viteLog += chunk; });
  vite.stderr.on('data', (chunk) => { viteLog += chunk; });
  const base = `http://localhost:${port}/`;
  const profile = mkdtempSync(join(os.tmpdir(), 'image2text-shots-'));
  const debugPort = await freePort(9400);
  let browser;
  try {
    await waitFor(async () => (await fetch(base)).ok, 'the web server');
    browser = spawn(browserPath(), [
      '--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
    ], { stdio: 'ignore' });
    const target = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((item) => item.type === 'page'), 'the browser');
    const page = new Page(target.webSocketDebuggerUrl);
    page.base = base;
    await page.ready();
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    for (const lang of only) {
      await page.eval('localStorage.clear()').catch(() => {});
      await run(page, lang);
    }
    if (page.errors.length) throw new Error(`page errors:\n${page.errors.join('\n')}`);
  } catch (error) {
    if (viteLog.trim()) console.error(viteLog.trim().split('\n').slice(-8).join('\n'));
    throw error;
  } finally {
    browser?.kill();
    vite.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

main().catch((error) => {
  console.error(`[shots] ${error.message}`);
  process.exit(1);
});
