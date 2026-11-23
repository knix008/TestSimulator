// npm run check:desktop — drives the built desktop app (debug exe) over the DevTools protocol.
//
// Checks what only the desktop app does: the settings, about, guide and print windows are
// separate OS windows of a fixed size without scroll bars; a theme chosen in the settings window
// reaches the main window; the printer list loads; the print window writes the page to a PDF
// (the same page a printer gets) with one sheet of the chosen paper. Nothing is sent to a real
// printer. The app runs with its own WebView2 profile, so the user's settings are not touched.
//
// Build first:  CARGO_TARGET_DIR=src-tauri/target/e2e npx tauri build --debug --no-bundle
// Usage: node scripts/check-desktop.mjs [exe]
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.argv[2] || process.env.IMAGE2TEXT_E2E_EXE || join(root, 'src-tauri', 'target', 'e2e', 'debug', process.platform === 'win32' ? 'image2text.exe' : 'image2text');
const port = 9000 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const lang = process.env.CHECK_LANG === 'en' ? 'en' : 'ko';
// CHECK_DOC=1 saves the window pictures for the user guide (doc/images/<lang>-desk-*.jpg).
const shotsDir = process.env.CHECK_DOC ? join(root, 'doc', 'images') : process.env.CHECK_SHOTS || '';

async function waitFor(check, what, timeout = 30000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      // not yet
    }
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await sleep(200);
  }
}

async function targets() {
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
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception');
  });
  const send = (method, params = {}) => new Promise((done) => { const my = ++id; pending.set(my, done); ws.send(JSON.stringify({ id: my, method, params })); });
  await send('Runtime.enable');
  const ev = async (expression) => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? 'evaluate failed');
    return m.result?.result?.value;
  };
  const shot = async (name) => {
    if (!shotsDir) return;
    // The guide uses only these; the others are for a look while checking.
    if (process.env.CHECK_DOC && !['print', 'settings-general', 'settings-start', 'settings-theme'].includes(name)) return;
    const m = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    writeFileSync(join(shotsDir, `${lang}-desk-${name}.jpg`), Buffer.from(m.result.data, 'base64'));
  };
  return { ws, ev, send, shot, errors, close: () => ws.close() };
}

async function popup(kind) {
  const target = await waitFor(async () => (await targets()).find((t) => t.url.includes(`popup=${kind}`)), `${kind} window`);
  const page = await connect(target);
  await waitFor(() => page.ev('Boolean(document.querySelector("dialog[open]"))'), `${kind} window content`);
  await sleep(400);
  return page;
}

/** A popup is a fixed-size window of its own: no scroll bars, nothing cut off. */
async function checkPopup(page, kind) {
  const facts = await page.ev(`(() => {
    const dialog = document.querySelector('dialog[open]');
    const scrolling = [...document.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1 && el.offsetParent && !el.closest('.guide-content, .guide-toc, .pick-list');
    }).map((el) => el.className || el.tagName);
    return { w: innerWidth, h: innerHeight, mode: document.documentElement.classList.contains('popup-mode'),
      dialogW: Math.round(dialog.getBoundingClientRect().width), scrolling, bodyScroll: document.documentElement.scrollHeight > innerHeight + 1 };
  })()`);
  if (!facts.mode) throw new Error(`${kind}: not in popup mode`);
  if (facts.scrolling.length || facts.bodyScroll) throw new Error(`${kind}: content scrolls: ${JSON.stringify(facts.scrolling)}`);
  if (Math.abs(facts.dialogW - facts.w) > 2) throw new Error(`${kind}: the window content does not fill the window: ${JSON.stringify(facts)}`);
  return facts;
}

async function main() {
  if (!existsSync(exe)) throw new Error(`no app at ${exe} (build it first)`);
  const profile = mkdtempSync(join(os.tmpdir(), 'image2text-desktop-'));
  const pdfPath = join(profile, 'print-check.pdf');
  const app = spawn(exe, [], {
    env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: 'ignore',
  });
  const report = [];
  try {
    const mainTarget = await waitFor(async () => (await targets()).find((t) => !t.url.includes('popup=')), 'main window', 60000);
    const main = await connect(mainTarget);
    await waitFor(() => main.ev('document.querySelectorAll(".example-card").length === 20'), 'start screen');
    if ((await main.ev('document.documentElement.lang')) !== lang) {
      await main.ev('document.querySelector("#btn-language").click()');
      await waitFor(async () => (await main.ev('document.documentElement.lang')) === lang, 'language');
    }
    await main.ev('document.querySelector("[data-example=\'great-wave\']").click()');
    await waitFor(() => main.ev('document.querySelectorAll("#gallery-track > *").length >= 10'), 'conversion', 60000);
    report.push('main: example converted');

    // Settings window: its own window; a theme chosen there reaches the main window.
    await main.ev('document.querySelector("#btn-settings").click()');
    const settings = await popup('settings');
    const sf = await checkPopup(settings, 'settings');
    for (const tab of ['general', 'start', 'theme', 'custom']) {
      await settings.ev(`document.querySelector('[data-settings-tab="${tab}"]').click()`);
      await sleep(200);
      await checkPopup(settings, `settings/${tab}`);
      await settings.shot(`settings-${tab}`);
    }
    await settings.ev('document.querySelector("#settings-theme-light [data-theme-id]").click()');
    const themeId = await settings.ev('document.documentElement.dataset.theme');
    await waitFor(async () => (await main.ev('document.documentElement.dataset.theme')) === themeId, 'theme reaches the main window');
    report.push(`settings: ${sf.w}×${sf.h}, no scroll bars, theme ${themeId} applied to the main window`);
    // Back to the first dark theme, so the pictures look like the rest of the guide.
    await settings.ev('document.querySelector("#settings-theme-dark [data-theme-id]").click()');
    await waitFor(async () => (await main.ev('document.documentElement.dataset.mode')) === 'dark', 'dark theme again');
    await settings.ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
    await waitFor(async () => !(await targets()).some((t) => t.url.includes('popup=settings')), 'settings window closes');

    // About and guide windows.
    await main.ev('document.querySelector("#btn-about").click()');
    const about = await popup('about');
    const af = await checkPopup(about, 'about');
    await about.shot('about');
    await about.ev('document.querySelector("dialog[open] .icon-x").click()');
    await main.ev('document.querySelector("#btn-guide").click()');
    const guide = await popup('guide');
    const gf = await checkPopup(guide, 'guide');
    await waitFor(() => guide.ev('[...document.querySelectorAll("#guide-content img")].length >= 6'), 'guide pictures');
    await guide.shot('guide');
    // The guide's header tools fit in its own window, and the text size works there.
    const tools = await guide.ev(`(() => {
      const d = document.querySelector('dialog[open]');
      const head = d.querySelector('.modal-head').getBoundingClientRect();
      const fit = ['.guide-lang', '#guide-font-stepper', '#guide-print', '.icon-x'].every((s) => {
        const r = d.querySelector(s).getBoundingClientRect();
        return r.width > 0 && r.top >= head.top && r.bottom <= head.bottom && r.right <= innerWidth;
      });
      const before = getComputedStyle(d.querySelector('#guide-content')).fontSize;
      d.querySelector('[data-guide-font="1"]').click();
      const after = getComputedStyle(d.querySelector('#guide-content')).fontSize;
      d.querySelector('[data-guide-font="-1"]').click();
      return { fit, before, after };
    })()`);
    if (!tools.fit || parseFloat(tools.after) !== parseFloat(tools.before) + 1) throw new Error(`guide header tools: ${JSON.stringify(tools)}`);
    await guide.ev('document.querySelector("dialog[open] .icon-x").click()');
    report.push(`about ${af.w}×${af.h}, guide ${gf.w}×${gf.h}: own windows`);

    // Print window: printers, preview, and the printed page written to a PDF.
    await main.ev('document.querySelector("#btn-print").click()');
    const print = await popup('print');
    const pf = await checkPopup(print, 'print');
    await waitFor(() => print.ev('document.querySelectorAll(".sheet-frame img").length > 0'), 'print preview');
    const printers = await print.ev('window.__TAURI_INTERNALS__.invoke("list_printers")');
    if (!printers.direct) throw new Error('printing straight to a printer is not available');
    // The picture is taken with the printer list closed: it would show this computer's printers.
    await print.shot('print');
    await print.ev('document.querySelector("#print-printer").click()');
    await sleep(300);
    const items = await print.ev('document.querySelectorAll("#print-printer-list [data-value]").length');
    if (items !== printers.printers.length) throw new Error(`printer list shows ${items} of ${printers.printers.length}`);
    await print.ev('document.querySelector("#print-printer").click()');
    // The page as a printer gets it: build the sheet like Print does, then write it to a PDF.
    await print.ev(`(async () => {
      document.querySelector('#print-source-on').click();
      await new Promise((r) => setTimeout(r, 500));
    })()`);
    const pdfOk = await print.ev(`(async () => {
      const sheet = document.querySelector('.sheet-frame .sheet').cloneNode(true);
      sheet.style.transform = 'none';
      sheet.style.height = 'calc(' + sheet.style.height + ' - 1mm)';
      document.querySelector('#print-sheet').replaceChildren(sheet);
      const info = document.querySelector('#print-info').textContent;
      const w = /× (\\d+)/.exec(info) ? null : null;
      const landscape = parseFloat(sheet.style.width) > 250;
      document.querySelector('#print-page-style').textContent = '@page { size: ' + sheet.style.width + ' ' + (landscape ? '210mm' : '297mm') + '; margin: 0; }';
      await window.__TAURI_INTERNALS__.invoke('print_pdf', { job: { printer: '', copies: 1, widthMm: parseFloat(sheet.style.width), heightMm: landscape ? 210 : 297 }, path: ${JSON.stringify(pdfPath)} });
      return true;
    })()`);
    if (!pdfOk || !existsSync(pdfPath)) throw new Error('no PDF was written');
    const pdf = readFileSync(pdfPath).toString('latin1');
    const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const box = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    const mm = box ? [Number(box[1]), Number(box[2])].map((pt) => Math.round((pt * 25.4) / 72)) : [];
    if (pages !== 1 || mm[0] !== 297 || mm[1] !== 210) throw new Error(`printed page: ${pages} page(s), ${mm.join(' × ')} mm`);
    report.push(`print ${pf.w}×${pf.h}: ${printers.printers.length} printers (default "${printers.defaultPrinter}"), PDF = 1 page of 297 × 210 mm`);
    await print.ev('document.querySelector("dialog[open] .icon-x").click()');
    await waitFor(async () => !(await targets()).some((t) => t.url.includes('popup=print')), 'print window closes');

    // Print in the guide window: the program's print window opens with the guide cut into pages,
    // and those pages written to a PDF come out as the same number of A4 pages.
    await main.ev('document.querySelector("#btn-guide").click()');
    const guide2 = await popup('guide');
    await waitFor(() => guide2.ev('document.querySelectorAll("#guide-content h2").length > 3'), 'guide again');
    await guide2.ev('document.querySelector("#guide-print").click()');
    const docPrint = await popup('print');
    await waitFor(() => docPrint.ev('document.querySelector("#print-dialog").classList.contains("doc-mode") && document.querySelectorAll("#print-stage .doc-sheet").length > 3'), 'guide print window');
    await sleep(500);
    const docState = await docPrint.ev(`(() => {
      const bodies = [...document.querySelectorAll('#print-stage .doc-body')];
      return { pages: bodies.length, over: bodies.filter((b) => b.scrollHeight - b.clientHeight > 2).length, subject: document.querySelector('#print-subject').textContent };
    })()`);
    if (docState.over || !/^Image2Text /.test(docState.subject)) throw new Error(`guide print window: ${JSON.stringify(docState)}`);
    await docPrint.shot('guide-print');
    const docPdf = join(profile, 'guide-check.pdf');
    await docPrint.ev(`(async () => {
      const sheets = [...document.querySelectorAll('#print-stage .doc-sheet')].map((s) => {
        const copy = s.cloneNode(true);
        copy.style.transform = 'none';
        copy.style.height = 'calc(' + copy.style.height + ' - 1mm)';
        return copy;
      });
      document.querySelector('#print-sheet').replaceChildren(...sheets);
      document.querySelector('#print-page-style').textContent = '@page { size: 210mm 297mm; margin: 0; }';
      await window.__TAURI_INTERNALS__.invoke('print_pdf', { job: { printer: '', copies: 1, widthMm: 210, heightMm: 297 }, path: ${JSON.stringify(docPdf)} });
    })()`);
    if (!existsSync(docPdf)) throw new Error('no guide PDF was written');
    const docPdfPages = (readFileSync(docPdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (docPdfPages !== docState.pages) throw new Error(`guide PDF has ${docPdfPages} pages, the preview ${docState.pages}`);
    report.push(`guide print: print window with ${docState.pages} pages, PDF = ${docPdfPages} pages`);
    await docPrint.ev('document.querySelector("dialog[open] .icon-x").click()');
    await guide2.ev('document.querySelector("dialog[open] .icon-x").click()');
    await waitFor(async () => !(await targets()).some((t) => /popup=(print|guide)/.test(t.url)), 'guide and print windows close');

    const errors = [...main.errors];
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
    for (const line of report) console.log(`[desktop] ${line}`);
    console.log('[desktop] all checks passed');
  } finally {
    app.kill();
    await sleep(800);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

main().catch((error) => {
  console.error(`[desktop] ${error.message}`);
  process.exit(1);
});
