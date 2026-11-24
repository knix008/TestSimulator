// GUI smoke test of the real desktop app (Tauri + WebView2), driven over the
// Chrome DevTools Protocol: the start screen, the title bar, the toolbar,
// panels, the context menu, the print window (a window of its own), the
// gallery, the library, settings, themes and language.
//
//   npm run smoke:desktop              build a separate test copy, then run
//   npm run smoke:desktop -- --no-build   reuse the last test copy
//
// It never touches the user's own app or data:
// * the test copy has its own identifier (com.shkwon.mypdfviewer.smoketest),
//   so it is not the single instance of an installed or `npm start` app;
// * it is built into src-tauri/target-smoke and keeps its settings and
//   WebView2 profile in a fresh folder under the system temp folder;
// * it opens a PDF it writes itself, and it NEVER presses Print (a real or a
//   "Print to PDF" printer would print or ask to save a file).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const NO_BUILD = args.includes('--no-build');
const KEEP = args.includes('--keep');
const PORT = 9300 + Math.floor(Math.random() * 300);
const TARGET = path.join(root, 'src-tauri', 'target-smoke');
const EXE = path.join(TARGET, 'debug', process.platform === 'win32' ? 'mypdfviewer.exe' : 'mypdfviewer');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'mypdfviewer-smoke-'));
const SHOTS = path.join(WORK, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const C = process.stdout.isTTY ? { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' } : { g: '', r: '', d: '', b: '', x: '' };

// ── Build ────────────────────────────────────────────────────
function run(cmd, cmdArgs, env = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} failed`);
}
if (!NO_BUILD || !fs.existsSync(EXE)) {
  console.log(`${C.b}Building the test copy…${C.x}`);
  run('npx', ['vite', 'build']);
  const conf = path.join(WORK, 'tauri.smoke.conf.json');
  fs.writeFileSync(conf, JSON.stringify({ identifier: 'com.shkwon.mypdfviewer.smoketest', build: { beforeBuildCommand: '' } }));
  run('npx', ['tauri', 'build', '--debug', '--no-bundle', '--config', conf], { CARGO_TARGET_DIR: TARGET });
}

// ── A PDF with real text: six pages of body text at 10 pt ─────
async function makePdf(file) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 6; n++) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`Smoke test page ${n}`, { x: 60, y: 770, size: 22, font, color: rgb(0.1, 0.1, 0.3) });
    for (let i = 0; i < 40; i++) {
      page.drawText(`Line ${i + 1}: The quick brown fox jumps over the lazy dog, page ${n}.`, { x: 60, y: 730 - i * 16, size: 10, font });
    }
  }
  fs.writeFileSync(file, await pdf.save());
}
const PDF = path.join(WORK, 'smoke-test.pdf');
await makePdf(PDF);

// ── CDP ──────────────────────────────────────────────────────
async function list() {
  return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
}
async function waitTarget(match, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const t = (await list()).find((x) => x.type === 'page' && match(x));
      if (t) return t;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  return null;
}
function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const wait = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
  };
  const ready = new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const send = async (method, params = {}) => {
    await ready;
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    const d = await Promise.race([new Promise((r) => wait.set(n, r)), sleep(15000).then(() => ({ error: { message: 'timed out' } }))]);
    if (d.error) throw new Error(`${method}: ${d.error.message}`);
    return d.result;
  };
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const center = (sel) => ev(`(() => { const el = ${sel}; if (!el) return null; el.scrollIntoView?.({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const mouse = async (type, p, extra = {}) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1, ...extra });
  const click = async (sel, { button = 'left' } = {}) => {
    const p = await center(sel);
    if (!p) throw new Error(`nothing to click: ${sel}`);
    await mouse('mouseMoved', p, { button: 'none' });
    await mouse('mousePressed', p, { button });
    await mouse('mouseReleased', p, { button });
    await sleep(120);
  };
  const hover = async (sel) => {
    const p = await center(sel);
    if (!p) throw new Error(`nothing to hover: ${sel}`);
    await mouse('mouseMoved', p, { button: 'none' });
    await sleep(120);
  };
  const key = async (k, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await sleep(150);
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
  };
  return { send, ev, click, hover, key, shot, mouse, center, close: () => ws.close() };
}

// ── Cases ────────────────────────────────────────────────────
const results = [];
let current = '';
async function check(name, fn) {
  current = name;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ${C.g}✓${C.x}  ${name} ${C.d}${Date.now() - t0}ms${C.x}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ${C.r}✗  ${name}${C.x}\n     ${e.message}`);
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, what) => expect(JSON.stringify(a) === JSON.stringify(b), `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const env = {
  ...process.env,
  MYPDFVIEWER_CONFIG_DIR: path.join(WORK, 'config'),
  WEBVIEW2_USER_DATA_FOLDER: path.join(WORK, 'webview2'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
};
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(EXE, [], { env, stdio: 'ignore' });
let m;

const byLabel = (label, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '') === ${JSON.stringify(label)})`;
const printTarget = () => waitTarget((t) => t.url.includes('#dialog-print'), 8000);
const noPrintWindow = async () => {
  for (let i = 0; i < 20; i++) {
    if (!(await list()).some((t) => t.url.includes('#dialog-print'))) return true;
    await sleep(150);
  }
  return false;
};

try {
  console.log(`\n${C.b}MyPDFViewer desktop GUI smoke${C.x} ${C.d}(${WORK})${C.x}`);
  const main = await waitTarget((t) => /tauri\.localhost|index\.html/.test(t.url), 30000);
  expect(main, 'the main window never came up');
  m = connect(main);
  for (let i = 0; i < 60 && !(await m.ev(`!!document.querySelector('[data-start]')`).catch(() => false)); i++) await sleep(250);
  await sleep(800);

  console.log(`\n${C.b}Start screen${C.x}`);
  await check('the title bar shows version 1.0.2', async () => {
    eq(await m.ev(`document.querySelector('.titlebar-version').textContent`), 'v1.0.2', 'version');
  });
  await check('opens on the start screen with its cards, the title card fixed', async () => {
    eq(await m.ev(`[...document.querySelectorAll('.start-board > .start-card')].map((c) => c.dataset.card)`), ['begin', 'recent', 'library', 'background', 'tips'], 'cards');
    expect(await m.ev(`!document.querySelector('.start-hero [data-card-handle], .start-hero [data-card-resize]')`), 'the title card has a handle or a corner');
    await m.shot('start');
  });
  await check('background opacity and speed share one line, each between − and +', async () => {
    const r = await m.ev(`(() => {
      const rows = [...document.querySelectorAll('[data-bg-slider]')];
      return { tops: rows.map((r) => Math.round(r.getBoundingClientRect().top)), order: rows.map((r) => [...r.children].map((c) => c.dataset.bgStep || c.type || c.tagName.toLowerCase())) };
    })()`);
    eq(r.tops.length, 2, 'two sliders');
    expect(Math.abs(r.tops[0] - r.tops[1]) <= 2, `not on one line: ${r.tops}`);
    for (const row of r.order) {
      const i = row.indexOf('range');
      expect(/-down$/.test(row[i - 1]) && /-up$/.test(row[i + 1]), `− range + order: ${row}`);
    }
  });
  await check('the + and − buttons change the opacity by 5 %', async () => {
    const out = `document.querySelector('[data-bg-slider="opacity"] output').textContent`;
    const before = parseInt(await m.ev(out), 10);
    await m.click(`document.querySelector('[data-bg-step="opacity-down"]')`);
    eq(parseInt(await m.ev(out), 10), before - 5, 'after −');
    await m.click(`document.querySelector('[data-bg-step="opacity-up"]')`);
    eq(parseInt(await m.ev(out), 10), before, 'after +');
  });
  await check('auto arrange keeps the cards one under another', async () => {
    await m.click(`document.querySelector('[data-start-arrange]')`);
    const cols = await m.ev(`[...document.querySelectorAll('.start-board > .start-card')].map((c) => c.style.gridColumn)`);
    expect(cols.every((c) => c === '1 / span 3'), `columns ${cols}`);
  });
  await check('card resize corners and the window grip are dotted triangles', async () => {
    eq(await m.ev(`[...document.querySelectorAll('.card-resize')].map((c) => c.querySelectorAll('circle').length)`), [6, 6, 6, 6, 6], 'card corners');
    eq(await m.ev(`document.querySelectorAll('.st-grip circle').length`), 6, 'window grip');
  });
  await check('Settings opens from the start screen and closes with Esc', async () => {
    await m.click(`document.querySelector('[data-start-settings]')`);
    expect(await m.ev(`!!document.querySelector('.settings-modal')`), 'settings did not open');
    await m.key('Escape', 'Escape', 27);
    expect(await m.ev(`!document.querySelector('.settings-modal')`), 'settings did not close');
  });

  console.log(`\n${C.b}Title bar and toolbar${C.x}`);
  await check('Home sits right after the version; the panel folds sit left of the window buttons', async () => {
    eq(await m.ev(`document.querySelector('[data-titlebar-home]').previousElementSibling.className`), 'titlebar-version', 'home position');
    eq(await m.ev(`document.querySelector('.titlebar-folds').nextElementSibling?.className`), 'titlebar-controls', 'folds position');
    eq(await m.ev(`[...document.querySelectorAll('[data-titlebar-fold]')].map((b) => b.dataset.titlebarFold)`), ['left', 'right'], 'folds');
  });
  await check('the toolbar is never cut off', async () => {
    const r = await m.ev(`(() => { const s = document.querySelector('.toolbar-scroll'); return [s.scrollWidth, s.clientWidth]; })()`);
    expect(r[0] <= r[1] + 1, `toolbar overflows: ${r}`);
  });
  await check('icons are in colour, one colour per family', async () => {
    const r = await m.ev(`(() => {
      const text = getComputedStyle(document.body).color;
      const icons = [...document.querySelectorAll('.toolbar svg[data-hue], .titlebar svg[data-hue]')].filter((s) => !s.closest('.active'));
      return { n: icons.length, coloured: icons.filter((s) => getComputedStyle(s).color !== text).length, hues: new Set(icons.map((s) => s.dataset.hue)).size };
    })()`);
    expect(r.n >= 20 && r.coloured === r.n, `coloured ${r.coloured} of ${r.n}`);
    expect(r.hues >= 6, `only ${r.hues} colour families`);
  });

  console.log(`\n${C.b}Document${C.x}`);
  await check('opens a PDF handed to the app', async () => {
    await m.ev(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'open-path', payload: ${JSON.stringify(PDF)} })`);
    for (let i = 0; i < 40 && !(await m.ev(`!!document.querySelector('[data-page] canvas, .pdf-page canvas') && !document.querySelector('[data-start]')`)); i++) await sleep(250);
    expect(await m.ev(`!document.querySelector('[data-start]')`), 'the start screen is still up');
    expect(/smoke-test\.pdf/.test(await m.ev(`document.querySelector('.titlebar-title').textContent`)), 'title');
    await sleep(800);
    await m.shot('document');
  });
  await check('Home brings the start screen back and hides it again', async () => {
    await m.click(`document.querySelector('[data-titlebar-home]')`);
    expect(await m.ev(`!!document.querySelector('[data-start]')`), 'no start screen');
    await m.click(`document.querySelector('[data-titlebar-home]')`);
    expect(await m.ev(`!document.querySelector('[data-start]')`), 'start screen stayed');
  });
  await check('the left fold button closes and opens the left panel', async () => {
    const open = `document.querySelector('[data-titlebar-fold="left"]').getAttribute('aria-pressed')`;
    const before = await m.ev(open);
    await m.click(`document.querySelector('[data-titlebar-fold="left"]')`);
    expect((await m.ev(open)) !== before, 'did not change');
    await m.click(`document.querySelector('[data-titlebar-fold="left"]')`);
    eq(await m.ev(open), before, 'did not come back');
  });
  await check('the right fold button opens and closes the info panel', async () => {
    const open = `document.querySelector('[data-titlebar-fold="right"]').getAttribute('aria-pressed')`;
    const before = await m.ev(open);
    await m.click(`document.querySelector('[data-titlebar-fold="right"]')`);
    expect((await m.ev(open)) !== before, 'did not change');
    await m.click(`document.querySelector('[data-titlebar-fold="right"]')`);
    eq(await m.ev(open), before, 'did not come back');
  });
  await check('dragging one panel splitter lights up only that one, and resizes its panel', async () => {
    const fold = (side) => `document.querySelector('[data-titlebar-fold="${side}"]')`;
    const wasOpen = await m.ev(`${fold('right')}.getAttribute('aria-pressed') === 'true'`);
    if (!wasOpen) await m.click(fold('right'));
    const line = (sel) => `getComputedStyle(document.querySelector('${sel}'), '::before').width`;
    for (const [sel, other, panel, dx] of [
      ['.info-splitter', '.side-splitter', '.info-panel', -40],
      ['.side-splitter', '.info-splitter', '.sidebar', 40],
    ]) {
      const w0 = await m.ev(`document.querySelector('${panel}').getBoundingClientRect().width`);
      const p = await m.center(`document.querySelector('${sel}')`);
      await m.mouse('mouseMoved', p, { button: 'none' });
      await m.mouse('mousePressed', p);
      await m.mouse('mouseMoved', { x: p.x + dx / 2, y: p.y }, { buttons: 1 });
      await m.mouse('mouseMoved', { x: p.x + dx, y: p.y }, { buttons: 1 });
      await sleep(150);
      const during = { dragged: await m.ev(line(sel)), other: await m.ev(line(other)) };
      await m.mouse('mouseReleased', { x: p.x + dx, y: p.y });
      await sleep(200);
      eq(during, { dragged: '3px', other: '1px' }, `${sel} while dragging`);
      const w1 = await m.ev(`document.querySelector('${panel}').getBoundingClientRect().width`);
      expect(Math.abs(w1 - w0 - Math.abs(dx)) <= 2, `${panel} width ${w0} → ${w1}`);
      expect(!(await m.ev(`document.body.classList.contains('resizing-sidebar')`)), 'still marked as resizing');
    }
    if (!wasOpen) await m.click(fold('right'));
  });
  // Continuous scrolling (the default) has no next/previous buttons: type the page.
  const goTo = async (n) => {
    await m.click(`document.querySelector('.page-input')`);
    await m.key('a', 'KeyA', 65, 2);
    await m.send('Input.insertText', { text: String(n) });
    await m.key('Enter', 'Enter', 13);
    await sleep(500);
  };
  const statusPage = `(document.querySelector('.statusbar, .status-bar')?.textContent.match(/(\\d+)\\s*\\/\\s*6/) || [])[1]`;
  await check('goes to a typed page and back', async () => {
    await goTo(3);
    eq(await m.ev(statusPage), '3', 'status bar page after 3');
    await goTo(1);
    eq(await m.ev(statusPage), '1', 'status bar page after 1');
  });
  await check('zoom in and out', async () => {
    const z = `document.querySelector('.toolbar select')?.selectedOptions?.[0]?.textContent + '|' + document.querySelector('.statusbar, .status-bar')?.textContent`;
    const before = await m.ev(z);
    await m.click(byLabel('확대'));
    await sleep(300);
    expect((await m.ev(z)) !== before, 'zoom did not change');
  });
  await check('the page context menu ends with Print, which opens the print window', async () => {
    const p = await m.center(`document.querySelector('[data-page] canvas, .pdf-page canvas')`);
    await m.mouse('mousePressed', { x: p.x, y: p.y - 100 }, { button: 'right' });
    await m.mouse('mouseReleased', { x: p.x, y: p.y - 100 }, { button: 'right' });
    await sleep(300);
    const items = await m.ev(`[...document.querySelectorAll('.ctxmenu button, .ctx-menu button, [role=menuitem]')].map((b) => b.textContent.trim())`);
    expect(/인쇄/.test(items.at(-1) || ''), `last item: ${items.at(-1)}`);
    await m.shot('context-menu');
    await m.click(`[...document.querySelectorAll('.ctxmenu button, .ctx-menu button, [role=menuitem]')].at(-1)`);
    expect(await printTarget(), 'no print window');
  });

  console.log(`\n${C.b}Print window${C.x}`);
  let p;
  const openPrint = async () => {
    p?.close();
    const t = await printTarget();
    expect(t, 'no print window');
    p = connect(t);
    for (let i = 0; i < 40 && !(await p.ev(`(document.querySelector('[data-print-canvas]')?.width || 0) > 10`).catch(() => false)); i++) await sleep(200);
    await sleep(400);
  };
  await openPrint();
  const size = await p.ev(`[innerWidth, innerHeight]`);
  await check('is a window of its own, the whole window being the dialog', async () => {
    expect(await m.ev(`!document.querySelector('.print-modal')`), 'the dialog is inside the main page');
    const r = await p.ev(`(() => { const d = document.querySelector('.modal').getBoundingClientRect(); return [Math.round(d.width), Math.round(d.height), innerWidth, innerHeight]; })()`);
    eq([r[0], r[1]], [r[2], r[3]], 'dialog vs window');
    expect(r[2] >= 900 && r[3] >= 620, `too small: ${r}`);
  });
  await check('has no scroll bars anywhere', async () => {
    const r = await p.ev(`[...document.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      return (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY)) || (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX));
    }).map((el) => el.className || el.tagName)`);
    eq(r, [], 'scrollable elements');
    const body = await p.ev(`(() => { const b = document.querySelector('.modal-body'); return b.scrollHeight - b.clientHeight; })()`);
    expect(body <= 0, `body overflows by ${body}`);
  });
  await check('prints straight away: no system print dialog button', async () => {
    expect(!(await p.ev(`[...document.querySelectorAll('button')].some((b) => /시스템 인쇄|System print/.test(b.textContent))`)), 'system print button found');
    expect(await p.ev(`!!document.querySelector('[data-print-go]')`), 'no Print button');
  });
  await check('shows the chosen printer over the preview', async () => {
    const r = await p.ev(`[document.querySelector('[data-print-printer]').value, document.querySelector('[data-print-preview-printer]').textContent]`);
    expect(r[1] && (r[0] === r[1] || !r[0]), `printer ${r}`);
  });
  await check('offers page setup: paper, orientation, margins, pages per sheet, scale, colour, odd/even', async () => {
    for (const sel of ['paper', 'orientation', 'margin', 'per-sheet', 'scale', 'color', 'subset']) {
      expect(await p.ev(`!!document.querySelector('[data-print-${sel}]')`), `no ${sel}`);
    }
  });
  await check('the preview is detailed enough to read: real text, 2.5× pixels', async () => {
    const r = await p.ev(`(() => {
      const c = document.querySelector('[data-print-canvas]');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i] < 128) ink++;
      return { ratio: c.width / parseFloat(c.style.width), cssH: parseFloat(c.style.height), ink };
    })()`);
    expect(r.ratio >= 2.4, `pixel ratio ${r.ratio}`);
    expect(r.cssH >= 560, `preview only ${r.cssH}px tall`);
    expect(r.ink > 2000, `hardly any text drawn (${r.ink})`);
    await p.shot('print-window');
  });
  await check('the magnifier follows the pointer over the sheet', async () => {
    await p.hover(`document.querySelector('[data-print-canvas]')`);
    expect(await p.ev(`!document.querySelector('[data-print-lens]').hidden`), 'no magnifier');
    await p.shot('print-magnifier');
    const c = await p.center(`document.querySelector('.print-preview-nav')`);
    await p.mouse('mouseMoved', c, { button: 'none' });
    await sleep(150);
    expect(await p.ev(`document.querySelector('[data-print-lens]').hidden`), 'magnifier stayed');
  });
  const select = (sel, value) => p.ev(`(() => { const s = document.querySelector('${sel}'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await check('two pages per sheet: 3 sheets, landscape, and the sheet buttons step', async () => {
    await select('[data-print-per-sheet]', '2');
    await sleep(500);
    eq(await p.ev(`document.querySelector('[data-print-sheet]').textContent`), '1 / 3장 · 1–2쪽', 'sheet 1');
    eq(await p.ev(`document.querySelector('[data-print-preview-paper]').textContent`), 'A4 · 가로', 'paper');
    await p.click(byLabel('다음 장'));
    eq(await p.ev(`document.querySelector('[data-print-sheet]').textContent`), '2 / 3장 · 3–4쪽', 'sheet 2');
    await p.click(byLabel('마지막 장'));
    eq(await p.ev(`document.querySelector('[data-print-sheet]').textContent`), '3 / 3장 · 5–6쪽', 'sheet 3');
    await p.shot('print-2up');
  });
  await check('odd pages only: 3 pages to print', async () => {
    await select('[data-print-per-sheet]', '1');
    await select('[data-print-subset]', 'odd');
    await sleep(300);
    expect(/^3쪽 → 용지 3장/.test(await p.ev(`document.querySelector('[data-print-summary]').textContent`)), 'summary');
    await select('[data-print-subset]', 'all');
  });
  await check('a wrong range says why, disables Print, and the window keeps its size', async () => {
    await p.click(`[...document.querySelectorAll('.print-scope input')][2]`);
    await p.ev(`(() => { const i = document.querySelector('[data-print-range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '99'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(300);
    expect(await p.ev(`document.querySelector('[data-print-message]').classList.contains('error')`), 'no error');
    expect(await p.ev(`document.querySelector('[data-print-go]').disabled`), 'Print enabled');
    eq(await p.ev(`[innerWidth, innerHeight]`), size, 'window size');
    await p.click(`[...document.querySelectorAll('.print-scope input')][0]`);
  });
  await check('copies step with − and +', async () => {
    const v = `document.querySelector('[data-print-number="copies"]').value`;
    if (await p.ev(`document.querySelector('[data-print-number="copies"]').disabled`)) return;   // no printer installed
    await p.click(byLabel('매수 늘리기'));
    eq(await p.ev(v), '2', 'after +');
    await p.click(byLabel('매수 줄이기'));
    eq(await p.ev(v), '1', 'after −');
  });
  await check('the close button turns red under the pointer and closes the window', async () => {
    await p.hover(`document.querySelector('.modal-x')`);
    eq(await p.ev(`getComputedStyle(document.querySelector('.modal-x')).backgroundColor`), 'rgb(232, 17, 35)', 'hover colour');
    await p.click(`document.querySelector('.modal-x')`);
    expect(await noPrintWindow(), 'the print window stayed');
  });
  await check('opens again from the toolbar with the same size, and Esc closes it', async () => {
    await m.click(byLabel('인쇄'));
    await openPrint();
    eq(await p.ev(`[innerWidth, innerHeight]`), size, 'size');
    await p.key('Escape', 'Escape', 27);
    expect(await noPrintWindow(), 'Esc did not close it');
  });
  await check('Ctrl+P opens it too, and the main window takes input again afterwards', async () => {
    await m.key('p', 'KeyP', 80, 2);
    await openPrint();
    await p.click(`[...document.querySelectorAll('.modal-foot .btn')].find((b) => !b.dataset.printGo)`);
    expect(await noPrintWindow(), 'Cancel did not close it');
    await sleep(300);
    await goTo(2);
    eq(await m.ev(statusPage), '2', 'the main window did not react');
    await goTo(1);
  });

  console.log(`\n${C.b}Gallery, library, settings, themes${C.x}`);
  await check('Opened files has Clear all and a red-on-hover close button', async () => {
    await m.click(byLabel('열어 본 파일'));
    expect(await m.ev(`!!document.querySelector('[data-gallery-remove-all]')`), 'no Clear all');
    await m.hover(`document.querySelector('.gallery .close-x')`);
    eq(await m.ev(`getComputedStyle(document.querySelector('.gallery .close-x')).backgroundColor`), 'rgb(232, 17, 35)', 'hover colour');
    await m.click(`document.querySelector('.gallery .close-x')`);
    expect(await m.ev(`!document.querySelector('[data-gallery]')`), 'gallery stayed');
  });
  await check('the library opens and closes', async () => {
    await m.click(byLabel('서재'));
    expect(await m.ev(`!!document.querySelector('.library, [data-library]')`), 'no library');
    await m.click(`document.querySelector('.library .close-x, [data-library] .close-x')`);
    expect(await m.ev(`!document.querySelector('.library, [data-library]')`), 'library stayed');
  });
  await check('About opens and closes', async () => {
    await m.click(byLabel('프로그램 정보'));
    expect(await m.ev(`!!document.querySelector('.about-modal')`), 'no about');
    await m.key('Escape', 'Escape', 27);
    expect(await m.ev(`!document.querySelector('.about-modal')`), 'about stayed');
  });
  // The theme list itself is a separate window that closes as soon as the
  // real OS pointer is not over it, so CDP cannot hold it open; its
  // "Custom themes…" button is checked in test/ui-polish.test.jsx, and here
  // what that button sends.
  await check('Custom themes… opens Settings on the Theme tab with the custom theme settings', async () => {
    // What the theme menu window sends when its button is pressed.
    await m.ev(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'theme-picked', payload: '__custom-theme__' })`);
    await sleep(500);
    expect(await m.ev(`!!document.querySelector('.settings-modal')`), 'settings did not open');
    expect(await m.ev(`document.querySelector('[data-settings-tab="theme"]').classList.contains('on')`), 'not on the Theme tab');
    expect(await m.ev(`!!document.querySelector('[data-settings-tab="theme"] [data-custom-theme-settings] .theme-custom-head')`), 'no custom theme settings');
    expect(await m.ev(`!!document.querySelector('[data-settings-tab="theme"] .theme-groups')`), 'no built-in themes');
    await m.shot('settings-theme');
    await m.key('Escape', 'Escape', 27);
    expect(await m.ev(`!document.querySelector('.settings-modal')`), 'settings stayed');
  });
  await check('a light theme gives the icons their light-theme shades', async () => {
    const colour = `getComputedStyle(document.querySelector('.toolbar svg[data-hue="blue"]')).color`;
    const dark = await m.ev(colour);
    await m.ev(`document.documentElement.setAttribute('data-theme-kind', 'light')`);
    const light = await m.ev(colour);
    await m.ev(`document.documentElement.setAttribute('data-theme-kind', 'dark')`);
    expect(dark !== light, `same colour ${dark}`);
  });
  await check('the language button switches to English and back', async () => {
    const flag = `document.querySelector('.toolbar [aria-label*="English"], .toolbar [aria-label*="한국어"], .toolbar [aria-label*="Language"], .toolbar [aria-label*="언어"]')`;
    expect(await m.ev(`!!${flag}`), 'no language button');
    await m.click(flag);
    await sleep(300);
    eq(await m.ev(`!!${byLabel('Zoom In')}`), true, 'English');
    await m.click(flag);
    await sleep(300);
    eq(await m.ev(`!!${byLabel('확대')}`), true, 'Korean');
  });

  // ── Password-protected PDFs ──────────────────────────────
  // Copies of test/fixtures/encrypted/aes256-r6.pdf (user password "user-pw").
  console.log(`\n${C.b}Password-protected PDF${C.x}`);
  const LOCKED = path.join(WORK, 'locked.pdf');
  const LOCKED2 = path.join(WORK, 'locked-cancel.pdf');
  fs.copyFileSync(path.join(root, 'test', 'fixtures', 'encrypted', 'aes256-r6.pdf'), LOCKED);
  fs.copyFileSync(LOCKED, LOCKED2);
  const { loadPdfForEditing, mayBeEncrypted } = await import(pathToFileURL(path.join(root, 'src', 'lib', 'pdf-crypt.js')).href);
  const openPath = (p) => m.ev(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'open-path', payload: ${JSON.stringify(p)} })`);
  const waitFor = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await m.ev(expr)) return true; await sleep(150); }
    return false;
  };
  const promptUp = `!!document.querySelector('.prompt-modal input[type="password"]')`;
  const progressUp = `!!document.querySelector('.progress-modal')`;
  const typePassword = async (text) => {
    await m.ev(`(() => { const i = document.querySelector('.prompt-modal input[type="password"]'); i.focus(); i.select(); })()`);
    await m.send('Input.insertText', { text });
    await m.key('Enter', 'Enter', 13);
  };
  const title = () => m.ev(`document.querySelector('.titlebar-title').textContent`);
  const fileMenuItem = async (text) => {
    await m.click(byLabel('파일'));
    await m.click(`[...document.querySelectorAll('.dd-item')].find((b) => b.textContent.includes(${JSON.stringify(text)}))`);
  };

  await check('an encrypted PDF asks for its password, with nothing covering the prompt', async () => {
    await openPath(LOCKED);
    expect(await waitFor(promptUp), 'no password prompt');
    await sleep(400);   // past the 180 ms progress delay
    expect(!(await m.ev(progressUp)), 'the progress dialog is over the prompt');
    const top = await m.ev(`(() => { const r = document.querySelector('.prompt-modal').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el?.closest('.prompt-modal'); })()`);
    expect(top, 'something else is on top of the prompt');
    await m.shot('password-prompt');
  });
  await check('a wrong password asks again and says so', async () => {
    await typePassword('wrong');
    expect(await waitFor(`!!document.querySelector('.prompt-modal .field-error')`), 'no error shown');
    eq(await m.ev(`document.querySelector('.prompt-modal .field-error').textContent`), '암호가 올바르지 않습니다.', 'error text');
  });
  await check('the right password opens it', async () => {
    await typePassword('user-pw');
    expect(await waitFor(`!document.querySelector('.prompt-modal') && /locked\\.pdf/.test(document.querySelector('.titlebar-title').textContent)`), 'did not open');
    expect(await waitFor(`!!document.querySelector('[data-page] canvas, .pdf-page canvas')`), 'no page drawn');
    expect(!(await m.ev(progressUp)), 'progress dialog left behind');
  });
  await check('cancelling the prompt abandons the open instead of hanging', async () => {
    await openPath(LOCKED2);
    expect(await waitFor(promptUp), 'no password prompt');
    await m.key('Escape', 'Escape', 27);
    expect(await waitFor(`!document.querySelector('.prompt-modal')`), 'prompt stayed');
    await sleep(500);
    expect(!(await m.ev(progressUp)), 'progress dialog stuck');
    expect(/locked\.pdf/.test(await title()) && !/locked-cancel/.test(await title()), `title is ${await title()}`);
    // Still usable: the prompt comes back on a new try.
    await openPath(LOCKED2);
    expect(await waitFor(promptUp), 'no prompt on the second try');
    await m.key('Escape', 'Escape', 27);
    expect(await waitFor(`!document.querySelector('.prompt-modal')`), 'prompt stayed (2)');
  });
  await check('PDF Password… shows keep / remove / change for the protected file, fitting its window', async () => {
    await fileMenuItem('PDF 암호');
    expect(await waitFor(`!!document.querySelector('.security-modal')`), 'no dialog');
    eq(await m.ev(`[...document.querySelectorAll('.security-option-label')].map((e) => e.textContent)`),
      ['지금 암호 그대로 저장', '암호를 풀어서 저장', '새 암호로 바꿔 저장'], 'options');
    const fit = await m.ev(`(() => {
      const modal = document.querySelector('.security-modal').getBoundingClientRect();
      const cut = [...document.querySelectorAll('.security-modal *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length;
      return { inside: modal.left >= 0 && modal.top >= 0 && modal.right <= innerWidth && modal.bottom <= innerHeight, cut };
    })()`);
    eq(fit, { inside: true, cut: 0 }, 'layout');
    await m.click(`[...document.querySelectorAll('.security-option')][2]`);
    expect(await waitFor(`document.querySelectorAll('.security-modal input[type="password"]').length === 2`), 'no password fields');
    await m.shot('security-dialog');
  });
  await check('Remove the password + Save writes a PDF without a password', async () => {
    await m.click(`[...document.querySelectorAll('.security-option')][1]`);
    await m.click(`[...document.querySelectorAll('.security-modal .btn.primary')][0]`);
    expect(await waitFor(`!document.querySelector('.security-modal')`), 'dialog stayed');
    const before = fs.statSync(LOCKED).mtimeMs;
    await m.key('s', 'KeyS', 83, 2);
    const end = Date.now() + 10000;
    while (Date.now() < end && fs.statSync(LOCKED).mtimeMs === before) await sleep(200);
    await sleep(800);
    const bytes = new Uint8Array(fs.readFileSync(LOCKED));
    expect(!mayBeEncrypted(bytes), 'the saved file is still encrypted');
    eq((await loadPdfForEditing(bytes)).pdfDoc.getPageCount(), 2, 'pages');
    expect(!(await m.ev(promptUp)), 'asked for a password after saving');
  });
  await check('Protect with a password + Save locks it, and the app reopens it without asking', async () => {
    await fileMenuItem('PDF 암호');
    expect(await waitFor(`!!document.querySelector('.security-modal')`), 'no dialog');
    eq(await m.ev(`[...document.querySelectorAll('.security-option-label')].map((e) => e.textContent)`),
      ['암호 없이 저장', '암호를 걸어 저장'], 'options for a plain file');
    await m.click(`[...document.querySelectorAll('.security-option')][1]`);
    expect(await waitFor(`document.querySelectorAll('.security-modal input[type="password"]').length === 2`), 'no fields');
    for (const i of [0, 1]) {
      await m.ev(`document.querySelectorAll('.security-modal input[type="password"]')[${i}].focus()`);
      await m.send('Input.insertText', { text: '새 암호 1' });
    }
    await m.click(`[...document.querySelectorAll('.security-modal .btn.primary')][0]`);
    expect(await waitFor(`!document.querySelector('.security-modal')`), 'dialog stayed');
    const before = fs.statSync(LOCKED).mtimeMs;
    await m.key('s', 'KeyS', 83, 2);
    const end = Date.now() + 10000;
    while (Date.now() < end && fs.statSync(LOCKED).mtimeMs === before) await sleep(200);
    await sleep(1200);
    const bytes = new Uint8Array(fs.readFileSync(LOCKED));
    expect(mayBeEncrypted(bytes), 'the saved file is not encrypted');
    const { security } = await loadPdfForEditing(bytes, { password: '새 암호 1' });
    eq(security.method, 'aes256', 'method');
    let refused = false;
    try { await loadPdfForEditing(bytes, { password: 'user-pw' }); } catch { refused = true; }
    expect(refused, 'the old password still opens it');
    expect(!(await m.ev(promptUp)), 'asked for the password it just set');
    expect(await m.ev(`!!document.querySelector('[data-page] canvas, .pdf-page canvas')`), 'page not shown after reload');
  });
} catch (e) {
  results.push({ name: current || 'setup', ok: false, error: e.message });
  console.log(`  ${C.r}✗  ${current || 'setup'}: ${e.message}${C.x}`);
} finally {
  try { await m?.ev(`void window.desktopAPI.win.forceClose()`); } catch { /* gone */ }
  await sleep(800);
  try { process.kill(app.pid); } catch { /* gone */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${'─'.repeat(56)}\n${failed.length ? C.r : C.g}${results.length - failed.length} passed · ${failed.length} failed${C.x} ${C.d}· screenshots: ${SHOTS}${C.x}`);
if (!KEEP && !failed.length) {
  try { fs.rmSync(path.join(WORK, 'webview2'), { recursive: true, force: true }); } catch { /* still in use */ }
}
process.exit(failed.length ? 1 : 0);
