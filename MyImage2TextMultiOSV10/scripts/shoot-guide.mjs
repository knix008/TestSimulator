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
      } else if (message.method === 'Page.javascriptDialogOpening' && message.params.type === 'beforeunload') {
        // After real mouse input the page may ask before leaving (unsaved results): leave anyway.
        this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
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

  await checkZoomSharp(page, lang);
  await checkRailSplit(page);

  // User guide window.
  await page.click('#btn-guide');
  await waitFor(() => page.eval('document.querySelector("#guide-dialog").open && document.querySelectorAll("#guide-toc a").length > 3'), 'guide');
  await page.shot(p('guide'));
  await checkGuideTools(page, lang);
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

// Zooming the result: the text canvas always has one bitmap pixel per device pixel, so the
// letters stay sharp (a bigger bitmap shrunk by the browser smears them), also on a 150% screen.
async function checkZoomSharp(page, lang) {
  const sample = () => page.eval(`(() => {
    const c = document.querySelector('#text-preview');
    const r = c.getBoundingClientRect();
    const dpr = devicePixelRatio;
    return { zoom: document.querySelector('#zoom-reset').textContent, dpr, bitmap: c.width, device: Math.round(r.width * dpr), bitmapH: c.height, deviceH: Math.round(r.height * dpr) };
  })()`);
  const bad = [];
  for (const dpr of [1, 1.5]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: dpr, mobile: false });
    await sleep(300);
    await page.eval('document.querySelector("#zoom-reset").click()');
    for (let i = 0; i < 8; i += 1) {
      const s = await sample();
      if (Math.abs(s.bitmap - s.device) > 1 || Math.abs(s.bitmapH - s.deviceH) > 1) bad.push(s);
      if (i === 5 && dpr === 1 && process.env.SHOTS_EXTRA) {
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(process.env.SHOTS_EXTRA, `${lang}-zoom.png`), Buffer.from(data, 'base64'));
      }
      await page.eval('document.querySelector("#zoom-in").click()');
      await sleep(120);
    }
    await page.eval('document.querySelector("#zoom-out").click(); document.querySelector("#zoom-out").click()');
    await sleep(120);
    const out = await sample();
    if (Math.abs(out.bitmap - out.device) > 1) bad.push(out);
  }
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await page.eval('document.querySelector("#zoom-reset").click()');
  await sleep(300);
  if (bad.length) throw new Error(`text canvas is not 1:1 with the screen: ${JSON.stringify(bad.slice(0, 3))}`);
  console.log('[shots] zoom: text canvas is 1:1 with device pixels from 100% to 400%, at 100% and 150% screen scale');
}

// The divider above "2 Convert" in the left panel: a mouse drag moves it, the limits hold, the
// height is remembered and a double-click puts it back.
async function checkRailSplit(page) {
  const measure = () => page.eval(`(() => {
    const d = document.querySelector('#rail-split').getBoundingClientRect();
    const s = document.querySelector('.rail > .sources').getBoundingClientRect();
    const c = document.querySelector('.rail > .settings').getBoundingClientRect();
    const rail = document.querySelector('.rail').getBoundingClientRect();
    return { x: d.left + d.width / 2, y: d.top + d.height / 2, sources: Math.round(s.height), settings: Math.round(c.height),
      between: s.bottom <= d.top + 0.5 && d.bottom <= c.top + 0.5, inside: c.bottom <= rail.bottom + 0.5,
      stored: localStorage.getItem('image2text.railSplit') };
  })()`);
  const drag = async (from, dy) => {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 5; i += 1) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y + (dy * i) / 5, button: 'left', buttons: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x, y: from.y + dy, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(100);
    return measure();
  };
  const start = await measure();
  if (!start.between) throw new Error(`the panel divider is not between the images and the settings: ${JSON.stringify(start)}`);
  const down = await drag(start, 80);
  if (Math.abs(down.sources - (start.sources + 80)) > 2 || !down.inside || Number(down.stored) !== down.sources) throw new Error(`panel divider drag: ${JSON.stringify({ start, down })}`);
  const top = await drag(down, -2000);
  if (top.sources !== 120) throw new Error(`panel divider top limit: ${JSON.stringify(top)}`);
  const bottom = await drag(top, 2000);
  if (bottom.settings < 159 || !bottom.inside) throw new Error(`panel divider bottom limit: ${JSON.stringify(bottom)}`);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bottom.x, y: bottom.y, button: 'left', buttons: 1, clickCount: 2 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bottom.x, y: bottom.y, button: 'left', buttons: 0, clickCount: 2 });
  await sleep(100);
  const reset = await measure();
  if (Math.abs(reset.sources - start.sources) > 2 || reset.stored !== null) throw new Error(`panel divider reset: ${JSON.stringify({ start, reset })}`);
  console.log(`[shots] panel divider: ${start.sources} → ${down.sources} px, limits 120 / settings ${bottom.settings}, double-click resets`);
}

// The guide header: language, text size and print, all on one line and working.
async function checkGuideTools(page, lang) {
  const head = await page.eval(`(() => {
    const d = document.querySelector('#guide-dialog');
    const head = d.querySelector('.modal-head').getBoundingClientRect();
    const items = ['.guide-lang', '#guide-font-stepper', '#guide-print', '.icon-x'].map((s) => d.querySelector(s).getBoundingClientRect());
    return { inside: items.every((r) => r.top >= head.top && r.bottom <= head.bottom && r.right <= head.right + 0.5 && r.width > 0), size: d.querySelector('#guide-font-out').textContent };
  })()`);
  if (!head.inside || head.size !== '14') throw new Error(`guide header tools are wrong: ${JSON.stringify(head)}`);
  const other = lang === 'ko' ? 'en' : 'ko';
  const firstHeading = 'document.querySelector("#guide-content h1, #guide-content h2").textContent';
  const before = await page.eval(firstHeading);
  await page.eval(`document.querySelector('input[name="guide-language"][value="${other}"]').click()`);
  const after = await page.eval(firstHeading);
  if (before === after) throw new Error('the guide language switch did not change the document');
  await page.eval(`document.querySelector('input[name="guide-language"][value="${lang}"]').click()`);
  const font = async () => page.eval('[getComputedStyle(document.querySelector("#guide-content")).fontSize, document.querySelector("#guide-font-out").textContent]');
  await page.eval('document.querySelector("[data-guide-font=\\"1\\"]").click()');
  await page.eval('document.querySelector("[data-guide-font=\\"1\\"]").click()');
  const bigger = await font();
  if (bigger.join() !== '16px,16') throw new Error(`guide text size: ${bigger}`);
  await page.eval('document.querySelector("[data-guide-font=\\"-1\\"]").click(); document.querySelector("[data-guide-font=\\"-1\\"]").click()');
  // Print: the program's print window in document mode, the guide cut into pages.
  await page.eval('window.print = () => {}; document.querySelector("#guide-print").click()');
  await waitFor(() => page.eval('document.querySelector("#print-dialog").open && document.querySelector("#print-dialog").classList.contains("doc-mode") && document.querySelectorAll("#print-stage .doc-sheet").length > 3'), 'guide print window');
  await sleep(300);
  const preview = await page.eval(`(() => {
    const d = document.querySelector('#print-dialog');
    const bodies = [...d.querySelectorAll('#print-stage .doc-body')];
    const over = bodies.map((b, i) => [i + 1, b.scrollHeight - b.clientHeight]).filter(([, extra]) => extra > 2);
    const hidden = ['input[name="print-halign"]', 'input[name="print-ink"]', '.stepper[data-field="scale"]'].every((s) => d.querySelector(s).closest('.print-row').offsetParent === null);
    const empty = bodies.filter((b) => !b.textContent.trim() && !b.querySelector('img')).length;
    return { pages: bodies.length, over, hidden, empty, subject: d.querySelector('#print-subject').textContent, info: d.querySelector('#print-info').textContent };
  })()`);
  if (process.env.SHOTS_EXTRA) {
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(join(process.env.SHOTS_EXTRA, `${lang}-guide-print.jpg`), Buffer.from(data, 'base64'));
  }
  if (preview.over.length || !preview.hidden || preview.empty || !/^Image2Text (사용 설명서|User Guide)$/.test(preview.subject)) throw new Error(`guide print preview: ${JSON.stringify(preview)}`);
  await page.click('#print-go');
  await waitFor(() => page.eval('!document.querySelector("#print-dialog").open'), 'guide print sent');
  await page.send('Emulation.setEmulatedMedia', { media: 'print' });
  const printed = await page.eval(`(() => {
    const visible = [...document.body.children].filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.id || el.tagName);
    const sheets = [...document.querySelectorAll('#print-sheet .doc-sheet')];
    return { visible, sheets: sheets.length, breaks: sheets.map((s) => getComputedStyle(s).breakAfter), page: document.querySelector('#print-page-style').textContent };
  })()`);
  await page.send('Emulation.setEmulatedMedia', { media: '' });
  await page.eval('window.dispatchEvent(new Event("afterprint"))');
  const last = printed.breaks.at(-1);
  if (printed.visible.join() !== 'print-sheet' || printed.sheets !== preview.pages || printed.breaks.slice(0, -1).some((v) => v !== 'page') || last === 'page' || !/^@page \{ size: 210mm 297mm; margin: 0; \}$/.test(printed.page)) {
    throw new Error(`guide print is wrong: ${JSON.stringify(printed)}`);
  }
  console.log(`[shots] guide print: ${preview.pages} pages (${preview.info})`);
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
    // Wait for the browser to let go of its profile before removing it; a profile left behind
    // in the temp folder is not a failed check.
    const exited = browser && browser.exitCode === null ? new Promise((done) => browser.once('exit', done)) : null;
    browser?.kill();
    vite.kill();
    await Promise.race([exited, sleep(5000)]);
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      console.log('[shots] note: the temporary browser profile is still in use and was left in the temp folder');
    }
  }
}

main().catch((error) => {
  console.error(`[shots] ${error.message}`);
  process.exit(1);
});
