// GUI tests: drive the real desktop app (debug exe) over the DevTools protocol.
//
// The app runs with its own WebView2 profile and config folder (temporary), so the user's
// settings, window places and recent files are never touched, and with MYICOMAKER_MULTI=1 it
// runs beside an installed MyICOMaker. Input goes to the page through CDP (no real mouse).
//
//   node test/gui.mjs [exe] [--shots]      --shots: also save the guide pictures (ko and en)
//
// Prints one JSON line per check ({"name","ok","ms","error"}) for scripts/test.mjs.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFixtures } from './fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const shots = args.includes('--shots');
const exe = args.find((a) => !a.startsWith('--')) || process.env.MYICOMAKER_E2E_EXE || join(root, 'src-tauri', 'target', 'e2e', 'debug', process.platform === 'win32' ? 'MyICOMaker.exe' : 'MyICOMaker');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = (name, ok, ms, error = '', category = 'gui') => console.log(JSON.stringify({ name, ok, ms, error, category }));

async function waitFor(check, what, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
    } catch (err) { last = err; }
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}${last ? ` (${last.message})` : ''}`);
    await sleep(150);
  }
}

function launch(lang) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(os.tmpdir(), 'myicomaker-gui-'));
  const config = join(profile, 'config');
  mkdirSync(config, { recursive: true });
  // The installer's language marker: the first start opens in that language.
  writeFileSync(join(config, 'install-language'), lang);
  const app = spawn(exe, [], {
    env: {
      ...process.env, MYICOMAKER_MULTI: '1', MYICOMAKER_NO_OPEN: '1', MYICOMAKER_CONFIG_DIR: config,
      WEBVIEW2_USER_DATA_FOLDER: join(profile, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: 'ignore',
  });
  return { app, port, profile };
}

async function targets(port) {
  return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', fail, { once: true }); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? 'exception');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((done) => { const my = ++id; pending.set(my, done); ws.send(JSON.stringify({ id: my, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  const ev = async (expression) => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? 'evaluate failed');
    return m.result?.result?.value;
  };
  const mouse = (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
  const drag = async ([x1, y1], [x2, y2], steps = 8) => {
    await mouse('mouseMoved', x1, y1, 0);
    await mouse('mousePressed', x1, y1);
    for (let i = 1; i <= steps; i += 1) await mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await mouse('mouseReleased', x2, y2, 0);
  };
  const click = (selector) => ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('no ${selector.replace(/'/g, '')}'); el.click(); return true; })()`);
  const shot = async (file, clip) => {
    const m = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(file, Buffer.from(m.result.data, 'base64'));
  };
  return { ev, send, mouse, drag, click, shot, errors, close: () => ws.close() };
}

async function run(lang, checks) {
  const { app, port, profile } = launch(lang);
  const pages = [];
  let failed = 0;
  let section = 'app';
  const check = async (name, fn) => {
    const start = Date.now();
    try {
      await fn();
      report(name, true, Date.now() - start, '', `${lang} · ${section}`);
    } catch (err) {
      failed += 1;
      report(name, false, Date.now() - start, String(err.message ?? err).split('\n')[0], `${lang} · ${section}`);
    }
  };
  try {
    const mainTarget = await waitFor(async () => (await targets(port)).find((t) => !t.url.includes('popup=') && !t.url.includes('viewer=')), 'the main window', 60000);
    const main = await connect(mainTarget);
    pages.push(main);
    await checks({ main, port, check, lang, section: (name) => { section = name; }, connectTo: async (part) => { const p = await connect(await waitFor(async () => (await targets(port)).find((t) => t.url.includes(part)), `the ${part} window`)); pages.push(p); return p; } });
    section = 'windows';
    await check('no script errors in any window', async () => {
      const errors = pages.flatMap((p) => p.errors).filter((e) => !/ResizeObserver loop/.test(e));
      if (errors.length) throw new Error(errors[0]);
    });
  } finally {
    for (const p of pages) p.close();
    app.kill();
    await sleep(600);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* WebView2 may still hold a file */ }
  }
  return failed;
}

const shotDir = join(root, 'public', 'docs', 'images');

async function suite({ main, check, lang, connectTo, section }) {
  section('start');
  const box = (sel) => main.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);

  await check('the start screen opens in the installer language', async () => {
    await waitFor(() => main.ev('Boolean(document.querySelector("[data-testid=start-screen] .start-card"))'), 'start screen');
    const facts = await main.ev(`({ lang: document.documentElement.lang, title: document.querySelector('.titlebar').textContent, cards: document.querySelectorAll('.start-card').length, templates: document.querySelectorAll('[data-testid^=template-]').length })`);
    if (facts.lang !== lang) throw new Error(`language ${facts.lang}`);
    if (!/MyICOMaker/.test(facts.title) || !/v1\.0\.1/.test(facts.title)) throw new Error(`title bar: ${facts.title}`);
    if (facts.cards < 5 || facts.templates < 12) throw new Error(JSON.stringify(facts));
  });

  await check('start cards do not overlap and the background moves', async () => {
    await sleep(500);
    const overlaps = await main.ev(`(() => { const r = [...document.querySelectorAll('.start-board > .start-card')].map((c) => c.getBoundingClientRect()); let n = 0;
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1 && r[i].top < r[j].bottom - 1 && r[j].top < r[i].bottom - 1) n++; return n; })()`);
    if (overlaps) throw new Error(`${overlaps} overlapping cards`);
    const f1 = await main.ev('globalThis.__myicomakerStartAnimation.frames');
    await sleep(600);
    const f2 = await main.ev('globalThis.__myicomakerStartAnimation.frames');
    if (!(f2 > f1)) throw new Error('the background does not animate');
  });

  if (shots) await main.shot(join(shotDir, `${lang}-start.png`));

  await check('every button has a colour icon left of its label', async () => {
    const bad = await main.ev(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent && !b.closest('.swatches') && !b.classList.contains('swatch') && !b.classList.contains('theme-tile') && !b.classList.contains('size-chip') && !b.querySelector('svg')).map((b) => b.className + ':' + b.textContent.trim()).slice(0, 5)`);
    if (bad.length) throw new Error(`no icon: ${bad.join(', ')}`);
    const misaligned = await main.ev(`[...document.querySelectorAll('.btn, .start-tile, .toggle')].filter((b) => b.offsetParent && b.querySelector('.btn-label, .tile-text') && !['flex-start', 'flow-start', 'start', 'left', 'normal'].includes(getComputedStyle(b).justifyContent)).length`);
    if (misaligned) throw new Error(`${misaligned} buttons are not left-aligned`);
    const order = await main.ev(`[...document.querySelectorAll('.btn')].filter((b) => b.offsetParent && b.querySelector('.btn-label')).every((b) => b.querySelector('svg').getBoundingClientRect().left <= b.querySelector('.btn-label').getBoundingClientRect().left)`);
    if (!order) throw new Error('an icon is not left of its label');
  });

  await check('20 examples on the start screen open in the editor', async () => {
    const tiles = await main.ev('document.querySelectorAll("[data-testid^=example-]").length');
    if (tiles !== 20) throw new Error(`${tiles} examples`);
    await waitFor(() => main.ev('[...document.querySelectorAll("[data-testid^=example-] img")].filter((i) => i.complete && i.naturalWidth > 0).length === 20'), 'the 20 example pictures');
    if (shots) {
      // The card just below the title bar, whole on screen.
      await main.ev('(() => { const card = document.querySelector("[data-card=examples]"); const scroller = document.querySelector(".start-scroll"); scroller.scrollTop += card.getBoundingClientRect().top - 70; })()');
      await sleep(300);
      await main.shot(join(shotDir, `${lang}-examples.png`), await box('[data-card=examples]'));
    }
    await main.click('[data-testid=example-rocket]');
    await waitFor(() => main.ev('globalThis.__myicomaker?.screen() === "editor" && document.querySelectorAll(".layer-item").length === 5'), 'the rocket example in the editor');
    const emojiDrawn = await main.ev('document.querySelectorAll(".icon-canvas svg[viewBox=\'0 0 36 36\']").length');
    if (!emojiDrawn) throw new Error('the example\'s emoji is not drawn');
    await main.click('[data-command=start]');
    await waitFor(() => main.ev('globalThis.__myicomaker?.screen() === "start"'), 'back on the start screen');
  });

  section('editor');
  await check('a template opens in the editor', async () => {
    await main.click('[data-testid=template-appSquare]');
    await waitFor(() => main.ev('globalThis.__myicomaker?.screen() === "editor" && document.querySelectorAll(".layer-item").length === 2'), 'the editor with two layers');
    await waitFor(() => main.ev('document.querySelectorAll("[data-testid=preview-strip] img").length >= 6'), 'the preview strip');
  });

  await check('the toolbar keeps every item visible', async () => {
    const facts = await main.ev(`(() => { const bar = document.querySelector('.toolbar'); const r = bar.getBoundingClientRect(); const clipped = [...bar.querySelectorAll('.btn')].filter((b) => b.getBoundingClientRect().right > r.right + 1).length; return { clipped, scroll: bar.scrollWidth - bar.clientWidth }; })()`);
    if (facts.clipped) throw new Error(`${facts.clipped} toolbar buttons are cut off`);
    // At the default window size the file and export buttons keep their labels.
    const hidden = await main.ev(`[...document.querySelectorAll(".toolbar [data-prio='1'] .btn-label")].filter((l) => !l.offsetWidth).length`);
    if (hidden) throw new Error(`${hidden} file/export labels are hidden at the default size`);
  });

  await check('drawing a rectangle adds a layer; undo and redo', async () => {
    await main.click('[data-tool=rect]');
    const c = await box('.icon-canvas');
    await main.drag([c.x + c.width * 0.15, c.y + c.height * 0.6], [c.x + c.width * 0.45, c.y + c.height * 0.85]);
    await waitFor(() => main.ev('globalThis.__myicomaker.design().objects.length === 3'), 'three objects');
    const o = await main.ev('globalThis.__myicomaker.design().objects[2]');
    if (o.type !== 'rect' || o.w < 100 || o.h < 80) throw new Error(JSON.stringify({ type: o.type, w: o.w, h: o.h }));
    await main.click('[data-command=undo]');
    await waitFor(() => main.ev('globalThis.__myicomaker.design().objects.length === 2'), 'undo');
    await main.click('[data-command=redo]');
    await waitFor(() => main.ev('globalThis.__myicomaker.design().objects.length === 3'), 'redo');
  });

  await check('a shape from the palette is drawn and moved', async () => {
    await main.ev('[...document.querySelectorAll(".cat-tabs .btn")][3].click()');
    await waitFor(() => main.ev('Boolean(document.querySelector("[data-shape=heart]"))'), 'the symbols');
    await main.click('[data-shape=heart]');
    const c = await box('.icon-canvas');
    await main.drag([c.x + c.width * 0.55, c.y + c.height * 0.55], [c.x + c.width * 0.85, c.y + c.height * 0.85]);
    await waitFor(() => main.ev('globalThis.__myicomaker.design().objects.length === 4'), 'four objects');
    const before = await main.ev('globalThis.__myicomaker.design().objects[3]');
    if (before.shape !== 'heart') throw new Error(`drew ${before.shape}`);
    await main.drag([c.x + c.width * 0.7, c.y + c.height * 0.72], [c.x + c.width * 0.6, c.y + c.height * 0.62]);
    const after = await main.ev('globalThis.__myicomaker.design().objects[3]');
    if (!(after.x < before.x - 20 && after.y < before.y - 20)) throw new Error(`not moved: ${before.x},${before.y} → ${after.x},${after.y}`);
  });

  await check('shape search finds shapes across categories', async () => {
    await main.ev(`(() => { const input = document.querySelector('.search-field input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(lang === 'ko' ? '화살표' : 'arrow')}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(() => main.ev('document.querySelectorAll(".shape-grid [data-shape]").length >= 6'), 'arrows found');
    await main.click('.search-field .clear');
  });

  await check('the emoji palette has 100+ emoji in categories; a click puts one on the canvas', async () => {
    const cats = await main.ev('[...document.querySelectorAll("[data-emoji-cat]")].map((b) => b.dataset.emojiCat).filter((c) => c !== "mine")');
    let total = 0;
    for (const cat of cats) {
      await main.click(`[data-emoji-cat=${cat}]`);
      total += await main.ev('document.querySelectorAll(".emoji-grid [data-emoji]").length');
    }
    if (cats.length < 8 || total < 100) throw new Error(`${cats.length} categories, ${total} emoji`);
    await main.click('[data-emoji-cat=faces]');
    const colourful = await main.ev('document.querySelector(".emoji-grid [data-emoji] svg svg")?.innerHTML.includes("fill=") ?? false');
    if (!colourful) throw new Error('emoji buttons show no colour art');
    await main.ev(`(() => { const input = document.querySelector('[data-testid=emoji-search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(lang === 'ko' ? '로켓' : 'rocket')}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(() => main.ev('document.querySelectorAll(".emoji-grid [data-emoji]").length === 1'), 'the rocket found');
    if (shots) await main.ev('document.querySelector("[data-emoji-cat=faces]").click()');
    const before = await main.ev('globalThis.__myicomaker.design().objects.length');
    if (!shots) await main.click('.emoji-grid [data-emoji="1f680"]');
    else await main.click('.emoji-grid [data-emoji="1f60d"]');
    await waitFor(() => main.ev(`globalThis.__myicomaker.design().objects.length === ${before + 1} && globalThis.__myicomaker.design().objects.at(-1).type === "emoji"`), 'the emoji on the canvas');
    if (shots) {
      await main.ev('document.querySelector("[data-testid=emoji-card]").scrollIntoView({ block: "center" })');
      await sleep(300);
      await main.shot(join(shotDir, `${lang}-emoji.png`), await box('.side-left'));
      await main.ev('document.querySelector("[data-testid=tools-card]").scrollIntoView()');
    }
    // The emoji goes away again so the later checks see the template's objects.
    await main.ev('document.querySelector("[data-command=undo]").click()');
    await waitFor(() => main.ev(`globalThis.__myicomaker.design().objects.length === ${before}`), 'undo of the emoji');
    await main.ev(`(() => { const input = document.querySelector('[data-testid=emoji-search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  });

  await check('properties and effects change the selected object', async () => {
    await main.ev(`globalThis.__myicomaker.select(globalThis.__myicomaker.design().objects[3].id)`);
    await waitFor(() => main.ev('Boolean(document.querySelector("[data-testid=fx-card]"))'), 'the effects card');
    await main.ev(`[...document.querySelectorAll('[data-testid=fx-card] .toggle')][2].click()`);
    await waitFor(() => main.ev('globalThis.__myicomaker.design().objects[3].fx.shadow === true'), 'shadow on');
    await main.ev(`[...document.querySelectorAll('[data-testid=arrange-card] .btn')][6].click()`);
    await waitFor(() => main.ev('globalThis.__myicomaker.design().objects[3].flipX === true'), 'flipped');
  });

  if (shots) {
    await main.shot(join(shotDir, `${lang}-editor.png`));
    await main.shot(join(shotDir, `${lang}-shapes.png`), await box('.side-left'));
    await main.shot(join(shotDir, `${lang}-props.png`), await box('.side-right'));
    await main.ev('document.querySelector("[data-testid=export-card]").scrollIntoView()');
    await sleep(200);
    await main.shot(join(shotDir, `${lang}-export.png`), await box('.side-right'));
  }

  section('canvas');
  await check('rulers show the pointer as a red mark', async () => {
    const c = await box('.icon-canvas');
    await main.mouse('mouseMoved', c.x + c.width / 2, c.y + c.height / 4, 0);
    // The ruler redraws on the next frame: wait for the mark instead of a fixed pause.
    const red = () => main.ev(`(() => { const r = document.querySelector('[data-testid=ruler-top]'); const ctx = r.getContext('2d'); const d = ctx.getImageData(0, 0, r.width, r.height).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 90) n++; return n; })()`);
    await waitFor(async () => (await red()) >= 10, 'the red pointer mark on the top ruler');
    // The status bar follows the same pointer move (wait for it, not for an older position).
    const pos = () => main.ev('document.querySelector("[data-testid=statusbar]").textContent');
    try { await waitFor(async () => (await pos()).includes('256, 128'), 'the pointer position in the status bar', 5000); } catch { throw new Error(`status bar position: ${await pos()}`); }
  });

  await check('the grid is redrawn 5 × 5 finer when zooming in', async () => {
    await main.click('[data-command=actual]');
    await sleep(100);
    const at1 = await main.ev('({ major: +document.querySelector(".grid-lines").dataset.major, minor: +document.querySelector(".grid-lines").dataset.minor })');
    for (let i = 0; i < 6; i += 1) await main.click('[data-command=zoomIn]');
    await sleep(100);
    const at4 = await main.ev('({ major: +document.querySelector(".grid-lines").dataset.major, minor: +document.querySelector(".grid-lines").dataset.minor })');
    if (at1.major / at1.minor !== 5 || at4.major / at4.minor !== 5) throw new Error(`not 5 × 5: ${JSON.stringify([at1, at4])}`);
    if (!(at4.major < at1.major)) throw new Error(`not finer: ${at1.major} → ${at4.major}`);
    await main.click('[data-command=fit]');
  });

  await check('the canvas wears the theme colours', async () => {
    const facts = await main.ev(`({ canvas: getComputedStyle(document.querySelector('.center')).backgroundColor, checker: getComputedStyle(document.querySelector('.canvas-checker')).backgroundColor, ruler: getComputedStyle(document.querySelector('.ruler-corner')).backgroundColor, varCanvas: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() })`);
    const hex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
    if (hex(facts.canvas) !== facts.varCanvas) throw new Error(JSON.stringify(facts));
  });

  section('export');
  await check('ICO, ICNS, PNG and SVG exports are valid files', async () => {
    const ico = await main.ev('globalThis.__myicomaker.exportBytes("ico")');
    if (ico.head.slice(0, 4).join() !== '0,0,1,0' || ico.head[4] !== 7) throw new Error(`ico header ${ico.head}`);
    const icns = await main.ev('globalThis.__myicomaker.exportBytes("icns")');
    if (String.fromCharCode(...icns.head.slice(0, 4)) !== 'icns') throw new Error('icns header');
    const png = await main.ev('globalThis.__myicomaker.exportBytes("png")');
    if (png.head.slice(0, 4).join() !== '137,80,78,71') throw new Error('png header');
    const svg = await main.ev('globalThis.__myicomaker.exportBytes("svg")');
    if (String.fromCharCode(...svg.head.slice(0, 4)) !== '<svg') throw new Error('svg header');
  });

  /** The window `label` stays on screen while the main window is minimized: a window of its own. */
  const standsAlone = async (page, label) => {
    const call = (cmd, target) => page.ev(`window.__TAURI_INTERNALS__.invoke('plugin:window|${cmd}', { label: ${JSON.stringify(target)} })`);
    await call('minimize', 'main');
    try {
      await waitFor(async () => (await call('is_minimized', 'main')) === true, 'the main window minimized');
      await sleep(300);
      const visible = await call('is_visible', label);
      const minimized = await call('is_minimized', label);
      if (!visible || minimized) throw new Error(`${label} went away with the main window (visible ${visible}, minimized ${minimized})`);
    } finally {
      await call('unminimize', 'main');
      await waitFor(async () => (await call('is_minimized', 'main')) === false, 'the main window back');
    }
  };

  section('print');
  await check('the print window opens with printers, page setup and a preview', async () => {
    await main.click('[data-command=print]');
    const print = await connectTo('popup=print');
    await waitFor(() => print.ev('document.querySelectorAll("[data-testid=print-page] .page-item img").length >= 7'), 'the page');
    await print.ev('document.querySelector("[data-layout=sheet]").click()');
    await waitFor(() => print.ev('document.querySelectorAll("[data-testid=print-page] .page-item").length >= 20'), 'the sticker sheet');
    await print.ev('document.querySelector("[data-layout=sizes]").click()');
    const printers = await print.ev('window.__TAURI_INTERNALS__.invoke("list_printers")');
    if (!Array.isArray(printers.printers)) throw new Error('no printer list');
    const options = await print.ev('document.querySelectorAll("[data-testid=printer-card], [data-testid=paper-card], [data-testid=margins-card]").length');
    if (options !== 3) throw new Error('printer, paper and margin cards missing');
    await print.ev('document.querySelector("[data-margin=wide]").click()');
    await waitFor(() => print.ev('Math.abs(parseFloat(getComputedStyle(document.querySelector(".margin-box")).left) - 25 * 96 / 25.4) < 0.5'), 'wide margins in the preview');
    await print.ev('document.querySelector("[data-margin=normal]").click()');
    await sleep(300);
    if (shots) await print.shot(join(shotDir, `${lang}-print.png`));
  });

  await check('the print window is a window of its own (stays when the main window is minimized)', async () => {
    const print = await connectTo('popup=print');
    await standsAlone(print, 'popup-print');
  });

  await check('the print window writes the page to a PDF (what the printer gets)', async () => {
    const print = await connectTo('popup=print');
    const pdf = join(os.tmpdir(), `myicomaker-print-${process.pid}.pdf`);
    await print.ev(`window.__TAURI_INTERNALS__.invoke('print_pages_to_pdf', { job: { printer: '', copies: 1, widthMm: 210, heightMm: 297 }, path: ${JSON.stringify(pdf)} })`);
    const data = readFileSync(pdf);
    rmSync(pdf, { force: true });
    if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
    const pages = (data.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (pages !== 1) throw new Error(`${pages} pages`);
    await print.ev('document.querySelector(".print-titlebar .win-btn.close").click()');
  });

  section('settings');
  await check('the settings window opens and a custom theme reaches every window', async () => {
    await main.click('[data-testid=theme-settings-button]');
    const settings = await connectTo('popup=settings');
    await waitFor(() => settings.ev('Boolean(document.querySelector("[data-testid=custom-theme-card]"))'), 'the theme tab');
    const tiles = await settings.ev('document.querySelectorAll("[data-theme-id]").length');
    if (tiles < 41) throw new Error(`${tiles} theme tiles`);
    if (shots) await settings.shot(join(shotDir, `${lang}-settings.png`));
    await settings.ev(`(() => { const input = document.querySelector('.custom-row[data-key=bg] input.hex'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, '#3a1020'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await waitFor(() => main.ev('document.documentElement.dataset.theme === "custom" && getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() === "#3a1020"'), 'the main window in the custom theme');
    const same = await settings.ev('getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()');
    if (same !== '#3a1020') throw new Error(`settings window bg ${same}`);
    await settings.ev('document.querySelector("[data-theme-id=midnight]").click()');
    await waitFor(() => main.ev('document.documentElement.dataset.theme === "midnight"'), 'back to midnight');
    await settings.ev('document.querySelector("[data-testid=settings-close]").click()');
  });

  section('guide');
  await check("the user's guide opens in its own window", async () => {
    await main.click('[data-testid=guide-button]');
    const guide = await connectTo('viewer=guide');
    await waitFor(() => guide.ev('(document.querySelector("[data-testid=guide-frame]").contentDocument?.querySelectorAll("h2[id]").length ?? 0) >= 12'), 'the chapters');
    const lang2 = await guide.ev('document.querySelector("[data-testid=guide-frame]").contentDocument.documentElement.lang');
    if (lang2 !== lang) throw new Error(`guide language ${lang2}`);
    if (shots) await guide.shot(join(shotDir, `${lang}-guide.png`));
  });

  await check("the guide window is a window of its own (stays when the main window is minimized)", async () => {
    const guide = await connectTo('viewer=guide');
    await standsAlone(guide, 'doc-guide');
  });

  await check("the toolbar has a user's guide button that brings the guide window back", async () => {
    const label = await main.ev('document.querySelector(".toolbar [data-command=guide]")?.title ?? ""');
    if (!label.includes('F1')) throw new Error(`toolbar guide button: "${label}"`);
    await main.click('.toolbar [data-command=guide]');
    await connectTo('viewer=guide');
  });

  await check("the guide's Print opens the print window with every page of the guide", async () => {
    const guide = await connectTo('viewer=guide');
    await guide.click('[data-testid=guide-print]');
    const print = await connectTo('popup=print');
    await waitFor(() => print.ev('document.querySelectorAll("[data-testid=print-page].doc-page").length >= 8'), 'the guide pages');
    const pages = await print.ev('document.querySelectorAll("[data-testid=print-page].doc-page").length');
    // Every page's text fits its text area (nothing cut off at the bottom), pictures included.
    const over = await print.ev(`[...document.querySelectorAll(".doc-page .doc-body")].map((b, i) => {
      const bottom = b.getBoundingClientRect().bottom;
      const last = [...b.children].pop();
      const out = last ? last.getBoundingClientRect().bottom - bottom : 0;
      const z = b.getBoundingClientRect().height / b.offsetHeight;
      const parts = [...b.children].map((c) => \`\${c.tagName.toLowerCase()}:\${Math.round(c.getBoundingClientRect().height / z)}\`).join(',');
      return out > 2 && b.children.length > 1 ? \`page \${i + 1}: <\${last.tagName.toLowerCase()}> \${Math.round(out)} px past the text area (\${b.offsetHeight}: \${parts})\` : '';
    }).filter(Boolean).join('; ')`);
    if (over) throw new Error(`of ${pages} pages, ${over}`);
    const pictures = await print.ev('[...document.querySelectorAll(".doc-page img")].filter((i) => i.complete && i.naturalWidth > 0).length');
    if (pictures < 5) throw new Error(`${pictures} pictures shown`);
    const iconOnly = await print.ev('Boolean(document.querySelector("[data-layout]"))');
    if (iconOnly) throw new Error('icon layout options shown for the guide');
    const footer = await print.ev('document.querySelector(".doc-page .page-footer span:last-child").textContent');
    if (footer !== `1 / ${pages}`) throw new Error(`footer "${footer}"`);
    if (shots) await print.shot(join(shotDir, `${lang}-print-guide.png`));
    const pdf = join(os.tmpdir(), `myicomaker-guide-${process.pid}.pdf`);
    await print.ev(`window.__TAURI_INTERNALS__.invoke('print_pages_to_pdf', { job: { printer: '', copies: 1, widthMm: 210, heightMm: 297 }, path: ${JSON.stringify(pdf)} })`);
    const data = readFileSync(pdf);
    rmSync(pdf, { force: true });
    const printed = (data.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (printed !== pages) throw new Error(`PDF has ${printed} pages, preview ${pages}`);
    await print.ev('document.querySelector(".print-titlebar .win-btn.close").click()');
  });

  section('3D model');
  const fixtureDir = mkdtempSync(join(os.tmpdir(), 'myicomaker-fixtures-'));
  const fx = writeFixtures(fixtureDir);
  const b64 = (path) => readFileSync(path).toString('base64');
  const modelReady = () => waitFor(() => main.ev('Boolean(document.querySelector("[data-testid=model3d-place]")) && !document.querySelector("[data-testid=model3d-place]").disabled'), 'the 3D import window');
  const closeModal = () => main.ev('document.querySelector(".model3d-modal .modal-head .btn")?.click()');
  // The preview has drawn the model when the WebGL canvas has opaque pixels.
  const modelDrawn = () => main.ev(`(() => { const c = document.querySelector('[data-testid=model3d-canvas]'); const t = document.createElement('canvas'); t.width = 64; t.height = 64;
    const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n; })()`);

  await check('a 3D model (OBJ) opens in the import window, turns, and is placed as a picture', async () => {
    const before = await main.ev('globalThis.__myicomaker.design().objects.length');
    await main.ev(`globalThis.__myicomaker.openModel('cube.obj', ${JSON.stringify(b64(fx.obj))})`);
    await modelReady();
    await waitFor(async () => (await modelDrawn()) > 100, 'the cube in the preview');
    const stats = await main.ev('document.querySelector(".model3d-stats").textContent');
    if (!/6|12/.test(stats)) throw new Error(`model facts: ${stats}`);
    // The whole model is in view: no solid pixel on the preview's edge.
    const edge = await main.ev(`(() => { const c = document.querySelector('[data-testid=model3d-canvas]'); const t = document.createElement('canvas'); t.width = 64; t.height = 64;
      const g = t.getContext('2d'); g.drawImage(c, 0, 0, 64, 64); const d = g.getImageData(0, 0, 64, 64).data; let n = 0;
      for (let i = 0; i < 64; i++) for (const [x, y] of [[i, 0], [i, 63], [0, i], [63, i]]) if (d[(y * 64 + x) * 4 + 3] > 200) n++; return n; })()`);
    if (edge) throw new Error(`the model is cut off at the preview's edge (${edge} edge pixels)`);
    await main.click('[data-view-preset=top]');
    await main.ev('[...document.querySelectorAll(".model3d-options .toggle")][0].click()'); // one colour
    if (shots) await main.click('[data-view-preset=iso]'); // the angled view for the guide
    await sleep(150);
    if (shots) await main.shot(join(shotDir, `${lang}-model3d.png`), await box('.model3d-modal'));
    await main.click('[data-testid=model3d-place]');
    await waitFor(() => main.ev(`(() => { const o = globalThis.__myicomaker.design().objects; return o.length === ${before + 1} && o.at(-1).type === 'image' && o.at(-1).href.startsWith('data:image/png') && o.at(-1).w > 0; })()`), 'the model on the canvas');
    if (await main.ev('Boolean(document.querySelector(".model3d-modal"))')) throw new Error('the import window stayed open');
    await main.ev('document.querySelector("[data-command=undo]").click()');
  });

  await check('STL, PLY and glTF models open as well', async () => {
    for (const [name, path] of [['tetra.stl', fx.stl], ['quad.ply', fx.ply], ['triangle.gltf', fx.gltf]]) {
      await main.ev(`globalThis.__myicomaker.openModel(${JSON.stringify(name)}, ${JSON.stringify(b64(path))})`);
      await modelReady();
      await waitFor(async () => (await modelDrawn()) > 20, `${name} in the preview`);
      await closeModal();
      await waitFor(() => main.ev('!document.querySelector(".model3d-modal")'), `${name}: the window closes`);
    }
  });

  await check('a file that is not a model says so instead of failing silently', async () => {
    await main.ev(`globalThis.__myicomaker.openModel('broken.stl', ${JSON.stringify(Buffer.from('solid x\nfacet nonsense').toString('base64'))})`);
    await waitFor(() => main.ev('Boolean(document.querySelector(".modal-backdrop")) || Boolean(document.querySelector(".model3d-modal"))'), 'an answer');
    const modelOpen = await main.ev('Boolean(document.querySelector(".model3d-modal"))');
    if (modelOpen) { await closeModal(); return; } // three.js read something out of it: still no failure
    const text = await main.ev('document.querySelector(".modal-backdrop .modal")?.textContent ?? ""');
    if (!text.includes('broken.stl')) throw new Error(`error message: ${text.slice(0, 120)}`);
    await main.ev('document.querySelector(".modal-backdrop .modal-actions .btn, .modal-backdrop .modal-head .btn")?.click()');
    await waitFor(() => main.ev('!document.querySelector(".modal-backdrop")'), 'the message closes');
  });

  section('drop');
  // The desktop window gets dropped files from Tauri (paths), not as HTML drops: the checks emit
  // the same events Tauri sends while dragging over the window and on dropping.
  const tauriDrop = (type, paths = []) => main.ev(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'tauri://drag-${type}', payload: { paths: ${JSON.stringify(paths)}, position: { x: 400, y: 300 } } })`);

  await check('dragging files over the window shows where to drop them', async () => {
    await tauriDrop('enter', [fx.png]);
    await waitFor(() => main.ev('Boolean(document.querySelector("[data-testid=drop-overlay]"))'), 'the drop overlay');
    if (shots) await main.shot(join(shotDir, `${lang}-drop.png`));
    await tauriDrop('leave');
    await waitFor(() => main.ev('!document.querySelector("[data-testid=drop-overlay]")'), 'the overlay goes away');
  });

  await check('a dropped picture goes on the canvas; a dropped 3D model opens the import window', async () => {
    const before = await main.ev('globalThis.__myicomaker.design().objects.length');
    await tauriDrop('drop', [fx.png]);
    await waitFor(() => main.ev(`globalThis.__myicomaker.design().objects.length === ${before + 1} && globalThis.__myicomaker.design().objects.at(-1).name === 'dot.png'`), 'the dropped picture');
    await tauriDrop('drop', [fx.obj]);
    await modelReady();
    await closeModal();
    await waitFor(() => main.ev('!document.querySelector(".model3d-modal")'), 'the window closes');
    await tauriDrop('drop', [fx.other]);
    await waitFor(() => main.ev('document.querySelector("[data-testid=statusbar]").textContent.includes("notes.xyz")'), 'a note about the file that cannot be opened');
  });

  await check('a dropped design (.myico) opens after asking about unsaved changes', async () => {
    await tauriDrop('drop', [fx.myico]);
    await waitFor(() => main.ev('Boolean(document.querySelector(".modal-actions .btn.primary"))'), 'the unsaved-changes question');
    await main.click('.modal-actions .btn.primary');
    await waitFor(() => main.ev('globalThis.__myicomaker.design().objects.length === 3 && globalThis.__myicomaker.design().objects[0].shape === "heart"'), 'the dropped design');
  });
  rmSync(fixtureDir, { recursive: true, force: true });

  section('library');
  await check('the selected object becomes My emoji, goes back on the canvas, and can be removed', async () => {
    await main.ev('globalThis.__myicomaker.select(globalThis.__myicomaker.design().objects[0].id)');
    await main.click('[data-emoji-cat=mine]');
    await waitFor(() => main.ev('!document.querySelector("[data-testid=user-emoji-selection]").disabled'), 'the add-selection button');
    await main.click('[data-testid=user-emoji-selection]');
    await waitFor(() => main.ev('document.querySelectorAll("[data-user-emoji]").length === 1'), 'one of My emoji');
    const stored = await main.ev('JSON.parse(localStorage.getItem("myicomaker.userEmoji"))[0].href.slice(0, 26)');
    if (stored !== 'data:image/svg+xml;charset') throw new Error(`stored as ${stored}`);
    const before = await main.ev('globalThis.__myicomaker.design().objects.length');
    await main.click('[data-user-emoji] .emoji-btn');
    await waitFor(() => main.ev(`globalThis.__myicomaker.design().objects.length === ${before + 1} && globalThis.__myicomaker.design().objects.at(-1).type === 'image'`), 'it on the canvas');
    if (shots) {
      await main.ev('document.querySelector("[data-testid=emoji-card]").scrollIntoView({ block: "center" })');
      await sleep(250);
      await main.shot(join(shotDir, `${lang}-myemoji.png`), await box('[data-testid=emoji-card]'));
    }
    await main.click('[data-user-emoji] .user-emoji-remove');
    await main.click('.modal-actions .btn.primary');
    await waitFor(() => main.ev('document.querySelectorAll("[data-user-emoji]").length === 0'), 'removed');
    await main.click('[data-emoji-cat=faces]');
  });

  await check('the design is saved as my example and opens from the start screen', async () => {
    await main.click('[data-command=saveExample]');
    await waitFor(() => main.ev('JSON.parse(localStorage.getItem("myicomaker.userExamples") ?? "[]").length === 1'), 'the saved example');
    await main.click('[data-command=start]');
    await waitFor(() => main.ev('document.querySelectorAll("[data-user-example]").length === 1'), 'my example on the start screen');
    const count = await main.ev('document.querySelector("[data-card=examples] .start-card-note").textContent');
    if (count !== '21') throw new Error(`examples counted: ${count}`);
    const saved = await main.ev('JSON.parse(localStorage.getItem("myicomaker.userExamples"))[0].design.objects.length');
    await main.click('[data-user-example] .example-tile');
    // The design on screen has unsaved changes: the program asks first.
    await waitFor(() => main.ev('Boolean(document.querySelector(".modal-actions .btn.primary"))'), 'the unsaved-changes question');
    await main.click('.modal-actions .btn.primary');
    await waitFor(() => main.ev(`globalThis.__myicomaker.screen() === "editor" && globalThis.__myicomaker.design().objects.length === ${saved}`), 'my example in the editor');
    await main.click('[data-command=start]');
    await main.click('[data-user-example] .user-emoji-remove');
    await main.click('.modal-actions .btn.primary');
    await waitFor(() => main.ev('document.querySelectorAll("[data-user-example]").length === 0'), 'my example removed');
    await main.click('[data-testid=start-continue]');
    await waitFor(() => main.ev('globalThis.__myicomaker.screen() === "editor"'), 'back in the editor');
  });

  section('title bar');
  await check('language and theme switch from the title bar', async () => {
    await main.click('[data-testid=theme-select]');
    await main.ev('[...document.querySelectorAll(".iconselect-list .menu-item")].find((b) => /Paper|페이퍼/.test(b.textContent)).click()');
    await waitFor(() => main.ev('document.documentElement.dataset.theme === "paper"'), 'the paper theme');
    const other = lang === 'ko' ? 'en' : 'ko';
    await main.click('[data-testid=language-select]');
    await main.ev(`[...document.querySelectorAll(".iconselect-list .menu-item")].find((b) => b.textContent.includes(${JSON.stringify(other === 'en' ? 'English' : '한국어')})).click()`);
    await waitFor(() => main.ev(`document.documentElement.lang === ${JSON.stringify(other)}`), 'the other language');
    const label = await main.ev('document.querySelector("[data-command=save] .btn-label").textContent');
    if (label !== (other === 'en' ? 'Save' : '저장')) throw new Error(`save button says ${label}`);
  });

  await check("the guide's text sits on the theme's background and follows a theme change", async () => {
    const guide = await connectTo('viewer=guide');
    const colours = () => Promise.all([
      main.ev('getComputedStyle(document.body).backgroundColor'),
      guide.ev('(() => { const d = document.querySelector("[data-testid=guide-frame]").contentDocument; return getComputedStyle(d.body).backgroundColor + "|" + getComputedStyle(d.documentElement).colorScheme + "|" + document.querySelector("[data-testid=guide-frame]").style.visibility; })()'),
    ]);
    // The title bar check left the light "paper" theme on.
    await waitFor(async () => { const [m, g] = await colours(); return g.startsWith(`${m}|light|visible`); }, 'the guide on the light theme');
    await main.click('[data-testid=theme-select]');
    await main.ev('[...document.querySelectorAll(".iconselect-list .menu-item")].find((b) => /^(Ocean|오션)$/.test(b.textContent.trim())).click()');
    await waitFor(async () => { const [m, g] = await colours(); return g.startsWith(`${m}|`) && !g.startsWith('rgb(255, 255, 255)'); }, 'the guide on the next theme');
  });
}

if (!existsSync(exe)) {
  report('desktop app is built', false, 0, `no app at ${exe}`, 'setup');
  process.exit(1);
}
let failed = 0;
for (const lang of shots ? ['ko', 'en'] : ['ko']) failed += await run(lang, suite);
process.exit(failed ? 1 : 0);
