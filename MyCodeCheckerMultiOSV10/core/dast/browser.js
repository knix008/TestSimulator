'use strict';

// Headless browser crawling for SPAs, built on Node built-ins only.
//
// We drive a locally installed Chromium-family browser (Edge / Chrome /
// Chromium) over the Chrome DevTools Protocol. The CDP transport is a WebSocket
// client written here with `net`/`http` upgrade plus manual frame encode and
// decode — no npm dependency. The browser is used for *discovery only*: it
// loads pages, waits for the network to go idle, reads the live DOM (links,
// forms, onclick/router targets) and the XHR/fetch URLs seen through the
// Network domain, optionally clicks a bounded number of in-scope elements, and
// returns the discovered requests. The actual security probing still runs
// through the rate-limited, scope-gated HTTP client.
//
// The browser process we spawn is always killed and its temporary profile
// directory is always deleted. We never touch any other browser process.

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { URL } = require('url');

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Browser binary discovery
// ---------------------------------------------------------------------------

function candidatePaths() {
  const plt = process.platform;
  const out = [];
  if (plt === 'win32') {
    const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || '';
    out.push(
      path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
      local && path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
      local && path.join(local, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(pf, 'Chromium\\Application\\chrome.exe'),
    );
  } else if (plt === 'darwin') {
    out.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    out.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/opt/google/chrome/chrome',
    );
  }
  return out.filter(Boolean);
}

// Locate a browser binary. options.browserPath takes priority; options.search
// === false disables scanning the standard install paths (used by tests to
// force the no-browser fallback deterministically).
function findBrowser(options = {}) {
  const explicit = options.browserPath;
  if (explicit) {
    try {
      if (fs.existsSync(explicit) && fs.statSync(explicit).isFile()) return explicit;
    } catch { /* fall through */ }
    if (options.search === false) return null;
  } else if (options.search === false) {
    return null;
  }
  for (const p of candidatePaths()) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch { /* ignore */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal CDP WebSocket client (RFC 6455 client frames, masked)
// ---------------------------------------------------------------------------

class CdpSocket {
  constructor(wsUrl, timeoutMs) {
    this.wsUrl = wsUrl;
    this.timeoutMs = timeoutMs || 15000;
    this.socket = null;
    this.buf = Buffer.alloc(0);
    this._id = 0;
    this._pending = new Map();
    this._handlers = [];
    this._frag = null;
    this.closed = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const u = new URL(this.wsUrl);
      const key = crypto.randomBytes(16).toString('base64');
      const req = http.request({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13',
        },
      });
      const to = setTimeout(() => { req.destroy(new Error('CDP connect timeout')); }, this.timeoutMs);
      req.on('upgrade', (res, socket, head) => {
        clearTimeout(to);
        this.socket = socket;
        socket.setNoDelay(true);
        socket.on('data', (d) => this._onData(d));
        socket.on('close', () => this._onClose());
        socket.on('error', () => this._onClose());
        if (head && head.length) this._onData(head);
        resolve();
      });
      req.on('error', (err) => { clearTimeout(to); reject(err); });
      req.end();
    });
  }

  onEvent(fn) { this._handlers.push(fn); }

  _onClose() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this._pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('CDP socket closed'));
    }
    this._pending.clear();
  }

  _onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      let maskKey = null;
      if (masked) {
        if (this.buf.length < off + 4) return;
        maskKey = this.buf.slice(off, off + 4);
        off += 4;
      }
      if (this.buf.length < off + len) return;
      let payload = this.buf.slice(off, off + len);
      if (masked && maskKey) {
        const u = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) u[i] = payload[i] ^ maskKey[i & 3];
        payload = u;
      }
      this.buf = this.buf.slice(off + len);
      this._frame(fin, opcode, payload);
    }
  }

  _frame(fin, opcode, payload) {
    if (opcode === 0x8) { this.close(); return; }
    if (opcode === 0x9) { this._writeFrame(0xA, payload); return; }
    if (opcode === 0xA) return;
    if (opcode === 0x1 || opcode === 0x2) this._frag = [payload];
    else if (opcode === 0x0 && this._frag) this._frag.push(payload);
    if (fin && this._frag) {
      const full = Buffer.concat(this._frag);
      this._frag = null;
      this._message(full.toString('utf8'));
    }
  }

  _message(str) {
    let msg;
    try { msg = JSON.parse(str); } catch { return; }
    if (msg.id != null && this._pending.has(msg.id)) {
      const p = this._pending.get(msg.id);
      this._pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(Object.assign(new Error(msg.error.message || 'CDP error'), { data: msg.error }));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      for (const h of this._handlers) { try { h(msg.method, msg.params || {}, msg.sessionId); } catch { /* ignore */ } }
    }
  }

  _writeFrame(opcode, payload) {
    if (!this.socket || this.closed) return;
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    const len = data.length;
    const mask = crypto.randomBytes(4);
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
      header.writeUInt32BE(len >>> 0, 6);
    }
    header[0] = 0x80 | opcode;
    const masked = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i & 3];
    try { this.socket.write(Buffer.concat([header, mask, masked])); } catch { /* ignore */ }
  }

  command(method, params, sessionId) {
    const id = ++this._id;
    const msg = { id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('CDP socket closed')); return; }
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, this.timeoutMs);
      this._pending.set(id, { resolve, reject, timer });
      this._writeFrame(0x1, JSON.stringify(msg));
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this._writeFrame(0x8, Buffer.alloc(0)); } catch { /* ignore */ }
    try { this.socket && this.socket.destroy(); } catch { /* ignore */ }
    for (const p of this._pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('CDP socket closed'));
    }
    this._pending.clear();
  }
}

function httpGetJson(host, port, pathname, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, path: pathname, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 5000, () => req.destroy(new Error('HTTP timeout')));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Browser session: spawn, connect, drive one page target
// ---------------------------------------------------------------------------

class BrowserSession {
  constructor(opts = {}) {
    this.browserPath = opts.browserPath;
    this.timeoutMs = opts.timeoutMs || 15000;
    this.proc = null;
    this.userDataDir = null;
    this.browserSock = null;
    this.pageSock = null;
    this.sessionId = null;
    this.networkUrls = [];
    this._inflight = 0;
    this._quietResolvers = [];
    this._closed = false;
  }

  async launch() {
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-dast-'));
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--mute-audio',
      '--no-sandbox',
      'about:blank',
    ];
    this.proc = spawn(this.browserPath, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    this.proc.on('error', () => { /* surfaced via port read failure */ });

    const { port, wsPath } = await this._readDevToolsPort();
    this.port = port;
    let browserWs = wsPath ? `ws://127.0.0.1:${port}${wsPath}` : null;
    if (!browserWs) {
      const ver = await httpGetJson('127.0.0.1', port, '/json/version', this.timeoutMs);
      browserWs = ver.webSocketDebuggerUrl;
    }
    this.browserSock = new CdpSocket(browserWs, this.timeoutMs);
    await this.browserSock.connect();

    const created = await this.browserSock.command('Target.createTarget', { url: 'about:blank' });
    const targetId = created.targetId;
    const attached = await this.browserSock.command('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = attached.sessionId;
    this.pageSock = this.browserSock; // flat protocol multiplexes over one socket

    this.pageSock.onEvent((method, params, sid) => {
      if (sid && sid !== this.sessionId) return;
      if (method === 'Network.requestWillBeSent') {
        this._inflight += 1;
        const u = params.request && params.request.url;
        const m = params.request && params.request.method;
        if (u) this.networkUrls.push({ url: u, method: m || 'GET' });
      } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        this._inflight = Math.max(0, this._inflight - 1);
        this._maybeQuiet();
      }
    });

    await this.cmd('Page.enable');
    await this.cmd('Runtime.enable');
    await this.cmd('Network.enable');
    await this.cmd('DOM.enable');
  }

  cmd(method, params) {
    return this.pageSock.command(method, params, this.sessionId);
  }

  async _readDevToolsPort() {
    const file = path.join(this.userDataDir, 'DevToolsActivePort');
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      try {
        const c = fs.readFileSync(file, 'utf8');
        const lines = c.split('\n');
        const p = parseInt(lines[0], 10);
        if (p > 0) return { port: p, wsPath: (lines[1] || '').trim() };
      } catch { /* not written yet */ }
      if (this.proc && this.proc.exitCode != null) break;
      await delay(80);
    }
    throw new Error('DevToolsActivePort not available (browser did not start)');
  }

  _maybeQuiet() {
    if (this._inflight === 0 && this._quietResolvers.length) {
      const rs = this._quietResolvers.slice();
      this._quietResolvers = [];
      for (const r of rs) r();
    }
  }

  async waitNetworkIdle(quietMs, maxMs) {
    quietMs = quietMs || 500;
    maxMs = maxMs || 5000;
    const deadline = Date.now() + maxMs;
    for (;;) {
      if (this._inflight === 0) {
        await delay(quietMs);
        if (this._inflight === 0) return;
      } else {
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 250);
          this._quietResolvers.push(() => { clearTimeout(t); resolve(); });
        });
      }
      if (Date.now() > deadline) return;
    }
  }

  async navigate(url, waitIdleMs) {
    this._inflight = 0;
    await this.cmd('Page.navigate', { url });
    await this.waitNetworkIdle(400, waitIdleMs || 5000);
  }

  async evaluate(expression) {
    const res = await this.cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res && res.result) return res.result.value;
    return undefined;
  }

  // Read the live DOM: links, forms, onclick/router targets.
  async collectDom() {
    const expr = COLLECT_EXPR;
    let data;
    try { data = await this.evaluate(expr); } catch { data = null; }
    if (!data) return { links: [], forms: [], onclick: [] };
    return {
      links: Array.isArray(data.links) ? data.links : [],
      forms: Array.isArray(data.forms) ? data.forms : [],
      onclick: Array.isArray(data.onclick) ? data.onclick : [],
    };
  }

  // Click a bounded number of in-scope clickable elements (buttons / router
  // links without href) and re-collect links after each click.
  async clickAndCollect(maxClicks) {
    const extra = { links: [], onclick: [] };
    let count = 0;
    try {
      count = await this.evaluate(
        "document.querySelectorAll('button,[role=button],a:not([href]),[data-href],[data-url]').length",
      );
    } catch { count = 0; }
    count = Math.min(Number(count) || 0, maxClicks || 10);
    for (let i = 0; i < count; i++) {
      try {
        await this.evaluate(
          `(function(){var els=document.querySelectorAll('button,[role=button],a:not([href]),[data-href],[data-url]');` +
          `var el=els[${i}]; if(el){ try{ el.click(); }catch(e){} } return true;})()`,
        );
        await this.waitNetworkIdle(250, 1500);
        const dom = await this.collectDom();
        for (const l of dom.links) extra.links.push(l);
        for (const o of dom.onclick) extra.onclick.push(o);
      } catch { /* ignore a single click failure */ }
    }
    return extra;
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    try { if (this.browserSock) this.browserSock.close(); } catch { /* ignore */ }
    this._killProcess();
    await this._removeProfile();
  }

  _killProcess() {
    const proc = this.proc;
    if (!proc || proc.exitCode != null) return;
    try {
      if (process.platform === 'win32' && proc.pid) {
        const tk = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
        tk.on('error', () => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } });
      } else {
        proc.kill('SIGKILL');
      }
    } catch { /* ignore */ }
  }

  async _removeProfile() {
    if (!this.userDataDir) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
        return;
      } catch {
        await delay(150);
      }
    }
  }
}

// DOM collector expression: returns absolute links, forms (action/method/
// fields) and onclick/data-* navigation targets.
const COLLECT_EXPR = `(function(){
  var links=[];
  document.querySelectorAll('a[href]').forEach(function(a){ if(a.href) links.push(a.href); });
  var forms=[];
  document.querySelectorAll('form').forEach(function(f){
    var fields=[];
    f.querySelectorAll('input,select,textarea').forEach(function(el){
      fields.push({ name: el.name||'', type: (el.type||el.tagName||'text').toLowerCase(), value: el.value||'' });
    });
    forms.push({ action: f.action || location.href, method: (f.method||'GET').toUpperCase(), fields: fields });
  });
  var onclick=[];
  function grab(v){ if(!v) return; var m=String(v).match(/['"](https?:\\/\\/[^'"]+|\\/[^'"\\s]+)['"]/); if(m) onclick.push(m[1]); }
  document.querySelectorAll('[onclick]').forEach(function(e){ grab(e.getAttribute('onclick')); });
  document.querySelectorAll('[data-href],[data-url],[data-link]').forEach(function(e){
    var v=e.getAttribute('data-href')||e.getAttribute('data-url')||e.getAttribute('data-link'); if(v) onclick.push(v);
  });
  return { links: links, forms: forms, onclick: onclick };
})()`;

// ---------------------------------------------------------------------------
// High-level browser crawl: discover URLs/forms for the given seed pages.
// Returns { links:Set-like array, forms, requests, pagesVisited }. Only
// navigates to in-scope URLs. Always tears the browser down.
// ---------------------------------------------------------------------------

async function browserCrawl(opts) {
  const {
    browserPath, scope, seeds, maxPages = 20, maxClicks = 8,
    waitIdleMs = 5000, timeoutMs = 15000, isCancelled, onReady,
  } = opts;
  const result = { links: [], forms: [], requests: [], pagesVisited: 0, error: null };
  const session = new BrowserSession({ browserPath, timeoutMs });
  const seenNav = new Set();
  try {
    await session.launch();
    // Optional hook (e.g. recorded browser login) run before crawling.
    if (typeof onReady === 'function') {
      try { await onReady(session); } catch { /* login failure is non-fatal */ }
    }
    const frontier = [];
    for (const s of seeds) {
      if (scope.inScope(s) && !seenNav.has(s)) { seenNav.add(s); frontier.push(s); }
    }
    while (frontier.length && result.pagesVisited < maxPages) {
      if (isCancelled && isCancelled()) break;
      const url = frontier.shift();
      try {
        await session.navigate(url, waitIdleMs);
      } catch { continue; }
      result.pagesVisited += 1;
      const dom = await session.collectDom();
      const extra = await session.clickAndCollect(maxClicks);
      const allLinks = [].concat(dom.links, dom.onclick, extra.links, extra.onclick);
      for (const l of allLinks) if (l) result.links.push(l);
      for (const f of dom.forms) result.forms.push(f);
      // Enqueue newly discovered in-scope same-origin pages (bounded).
      for (const l of allLinks) {
        if (!l) continue;
        let abs;
        try { abs = new URL(l, url).href; } catch { continue; }
        if (scope.inScope(abs) && !seenNav.has(abs) && frontier.length + result.pagesVisited < maxPages) {
          seenNav.add(abs);
          frontier.push(abs);
        }
      }
    }
    for (const r of session.networkUrls) result.requests.push(r);
  } catch (err) {
    result.error = String((err && err.message) || err);
  } finally {
    await session.close();
  }
  return result;
}

module.exports = { findBrowser, BrowserSession, browserCrawl, CdpSocket, candidatePaths };
