// The web app under test: builds the web app into test-results/web/dist (never dist/), serves it on a free port,
// opens it in a headless Edge / Chrome of its own (browser.mjs) and installs the test hooks: the clipboard, file
// downloads, new windows and printing are recorded in the page instead of reaching the OS.
//
//   const app = new WebApp(); await app.start(); await app.run(`return A.doc()?.name`); app.takeErrors(); await app.stop();
//
// `run(body)` evaluates an async function body in the page with these names:
//   A (window.__mychartmaster), sleep(ms), q(selector), qa(selector), pop(kind) (a popup frame's document),
//   until(fn, ms) (resolves with fn's value), doc(), svg(), marks(), key(element, key, init)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, serve } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..').replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);

export const PRELUDE = `const A = window.__mychartmaster; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s); const qa = (s) => [...document.querySelectorAll(s)];
  const pop = (kind) => document.querySelector('.web-popup-' + kind + ' iframe')?.contentDocument;
  const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch {} await sleep(60); } throw new Error('timeout: ' + fn.toString().slice(0, 140)); };
  const doc = () => A.doc(); const svg = () => q('.ch-canvas svg'); const marks = () => qa('.ch-canvas .mark').length;
  const key = (el, k, extra = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));`;

const HOOKS = `(() => {
  window.__copied = []; window.__images = []; window.__opened = []; window.__downloads = []; window.__clipboardText = '';
  try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied.push(t); }, readText: async () => window.__clipboardText, write: async (items) => { for (const item of items) window.__images.push(...item.types); } }, configurable: true }); } catch {}
  window.open = (url) => { window.__opened.push(String(url)); return { focus() {} }; };
  window.showSaveFilePicker = undefined;
  window.print = () => { window.__browserPrint = (window.__browserPrint ?? 0) + 1; };
  const blobs = new Map(); const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = create(blob); blobs.set(url, blob); return url; };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { const blob = blobs.get(this.href); const entry = { name: this.download, size: blob?.size ?? 0, type: blob?.type ?? '' }; window.__downloads.push(entry); (window.__blobs ??= {})[this.download] = blob; if (blob && blob.size < 2e6) blob.arrayBuffer().then((b) => { entry.head = Array.from(new Uint8Array(b).slice(0, 8)); entry.text = /text|json|svg|html|markdown|csv|tab/.test(blob.type) ? new TextDecoder().decode(b) : ''; }); return; } return click.call(this); };
  window.__mychartmasterPrintHook = (layout, job) => { window.__printed = { pages: layout.pages.length, job }; };
  window.__mychartmaster.popups.inline = true;
  return true;
})()`;

export class WebApp {
  constructor({ build = !process.argv.includes('--no-build'), width = 1600, height = 1000 } = {}) {
    this.build = build;
    this.width = width;
    this.height = height;
    this.out = path.join(root, 'test-results', 'web');
    this.dist = path.join(this.out, 'dist');
    this.seen = 0;
  }

  async start() {
    fs.mkdirSync(this.out, { recursive: true });
    if (this.build || !fs.existsSync(path.join(this.dist, 'index.html'))) {
      const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
      const r = spawnSync(process.execPath, [vite, 'build', '--outDir', this.dist, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`web build failed:\n${r.stdout}\n${r.stderr}`);
    }
    this.server = await serve(this.dist);
    this.url = this.server.url;
    this.page = await launch(`${this.server.url}?nowelcome`, { width: this.width, height: this.height });
    await this.page.waitFor('!!window.__mychartmaster && !!document.querySelector(".start-board")', 30000);
    await this.page.eval(HOOKS);
  }

  /** Evaluates an async function body in the page (see PRELUDE for the names it can use). */
  run(body) {
    return this.page.eval(`(async () => { ${PRELUDE}\n${body} })()`);
  }

  eval(expression) { return this.page.eval(expression); }

  /** Page errors (exceptions, console.error) since the last call. */
  takeErrors() {
    const all = [...this.page.errors, ...this.page.console];
    const fresh = all.slice(this.seen);
    this.seen = all.length;
    return fresh;
  }

  /** After a failed case: no popups, no tutorial, no charts — the next case starts clean. */
  async recover() {
    await this.run(`try { await A.tutorial()?.stop(); } catch {} await A.popups.closeAll(); for (const el of qa('.web-popup, .web-popup-shield')) el.remove(); A.popups.frames.clear();
      for (const d of [...A.state.docs]) await A.actions.closeDoc(d, { force: true }); A.actions.updateSettings({ language: 'en', theme: 'light', paneLayout: 'grid-bottom', textZoom: 0, showLeftPanel: true, showRightPanel: true, showBottomPanel: true }); return 1;`).catch(() => {});
    this.takeErrors();
  }

  async screenshot(name) {
    await this.page.screenshot(path.join(this.out, `${name.replace(/[^\w.-]+/g, '_')}.png`)).catch(() => {});
  }

  async stop() {
    await this.page?.close().catch(() => {});
    await this.server?.close().catch(() => {});
  }
}
