// A small Chrome DevTools Protocol client (Node 22 WebSocket): headless Edge for the web
// tests, WebView2 (--remote-debugging-port) for the desktop tests.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForTarget(port, match = () => true, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page' && match(t));
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`no page target on port ${port}`);
}

export class Page {
  static async connect(target) {
    const page = new Page();
    page.ws = new WebSocket(target.webSocketDebuggerUrl);
    page.pending = new Map();
    page.listeners = new Map();
    page.next = 0;
    await new Promise((resolve, reject) => { page.ws.addEventListener('open', resolve); page.ws.addEventListener('error', reject); });
    page.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && page.pending.has(msg.id)) { page.pending.get(msg.id)(msg); page.pending.delete(msg.id); }
      else if (msg.method) for (const fn of page.listeners.get(msg.method) || []) fn(msg.params);
    });
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    page.consoleErrors = [];
    page.on('Runtime.exceptionThrown', (p) => page.consoleErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
    page.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') page.consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(' ')); });
    return page;
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(fn);
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.next;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates `expression` (awaited) and returns its value; page exceptions are thrown. */
  async eval(expression, ms = 30000) {
    const answer = await Promise.race([
      this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      sleep(ms).then(() => ({ timeout: true })),
    ]);
    if (answer.timeout) throw new Error(`timed out after ${ms} ms: ${expression.slice(0, 80)}`);
    const details = answer.result?.exceptionDetails;
    // A rejected promise carries its reason in exception.value (a string) or .description (an Error).
    if (details) throw new Error(details.exception?.description?.split('\n')[0] || (details.exception?.value !== undefined ? String(details.exception.value) : '') || details.text);
    return answer.result?.result?.value;
  }

  async waitFor(expression, ms = 15000, what = expression) {
    const end = Date.now() + ms;
    let last;
    while (Date.now() < end) {
      try { if (await this.eval(expression, 5000)) return true; } catch (error) { last = error; }
      await sleep(100);
    }
    throw new Error(`waited ${ms} ms for: ${what.slice(0, 120)}${last ? ` (${last.message})` : ''}`);
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await sleep(300);
  }

  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  }

  // ── real input (the page sees trusted pointer and key events) ──
  async center(selector) {
    const box = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!box) throw new Error(`not found: ${selector}`);
    return box;
  }
  mouse(type, x, y, extra = {}) { return this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra }); }
  async click(selector, extra = {}) {
    const { x, y } = await this.center(selector);
    await this.mouse('mouseMoved', x, y, { button: 'none' });
    await this.mouse('mousePressed', x, y, extra);
    await this.mouse('mouseReleased', x, y, extra);
  }
  async drag(from, to, steps = 12) {
    await this.mouse('mouseMoved', from.x, from.y, { button: 'none' });
    await this.mouse('mousePressed', from.x, from.y);
    for (let i = 1; i <= steps; i += 1) {
      await this.mouse('mouseMoved', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, { buttons: 1 });
      await sleep(16);
    }
    await this.mouse('mouseReleased', to.x, to.y);
  }
  async key(key, { ctrl = false, shift = false, code } = {}) {
    const modifiers = (ctrl ? 2 : 0) | (shift ? 8 : 0);
    const keyCode = { Tab: 9, Escape: 27, Home: 36, F5: 116, F6: 117, F7: 118, Enter: 13 }[key] ?? key.toUpperCase().charCodeAt(0);
    const base = { key, code: code || (key.length === 1 ? `Key${key.toUpperCase()}` : key), modifiers, windowsVirtualKeyCode: keyCode };
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  async type(text) { await this.send('Input.insertText', { text }); }

  close() { try { this.ws.close(); } catch { /* gone */ } }
}

/** Headless Edge with its own profile; close() ends the browser and every child it started. */
export async function launchEdge({ width = 1440, height = 900 } = {}) {
  const candidates = [
    process.env.TTS_TEST_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const exe = candidates.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no Edge/Chrome found (set TTS_TEST_BROWSER)');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-test-edge-'));
  const port = 9500 + Math.floor(Math.random() * 400);
  const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  const target = await waitForTarget(port);
  const page = await Page.connect(target);
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return {
    page,
    port,
    async close() {
      try { await Promise.race([page.send('Browser.close'), sleep(1500)]); } catch { /* gone */ }
      page.close();
      try { child.kill(); } catch { /* gone */ }
      // child.kill() does not always end the real browser: end what still uses this profile.
      if (process.platform === 'win32') {
        try {
          execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
        } catch { /* nothing left */ }
      }
      await sleep(300);
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
