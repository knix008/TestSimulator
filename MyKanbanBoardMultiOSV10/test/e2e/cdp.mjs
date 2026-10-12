// Minimal Chrome DevTools Protocol client (Node 22 WebSocket), shared by the
// desktop suite (WebView2) and the web suite (headless Edge / Chrome).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export { sleep };

/** CDP session on one page target. */
export class Page {
  constructor(target) {
    this.target = target;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.listeners = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    // A window that closes never answers; fail fast instead of hanging.
    this.ws.onclose = () => {
      for (const resolve of this.pending.values()) resolve({ error: { message: 'window closed' } });
      this.pending.clear();
    };
    this.ws.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id && this.pending.has(data.id)) {
        this.pending.get(data.id)(data);
        this.pending.delete(data.id);
      } else if (data.method === 'Runtime.exceptionThrown') {
        this.errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
      } else if (data.method) {
        for (const listener of this.listeners.get(data.method) ?? []) listener(data.params);
      }
    };
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    return this;
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  get closed() {
    return !this.ws || this.ws.readyState !== WebSocket.OPEN;
  }

  send(method, params = {}, timeout = 20000) {
    return new Promise((resolve) => {
      if (this.closed) return resolve({ error: { message: 'window closed' } });
      const id = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ error: { message: `${method} timed out` } });
      }, timeout);
      this.pending.set(id, (response) => { clearTimeout(timer); resolve(response); });
      this.ws.send(JSON.stringify({ id, method, params }));
      return undefined;
    });
  }

  async eval(expression, timeout) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, timeout);
    if (response.error) throw new Error(response.error.message);
    const details = response.result?.exceptionDetails;
    if (details) throw new Error(details.exception?.description ?? details.text);
    return response.result?.result?.value;
  }

  /** Clicks the element via the DOM. Throws if missing or disabled. */
  async click(selector) {
    const result = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'missing';
      if (el.disabled) return 'disabled';
      el.click();
      return 'ok';
    })()`);
    if (result !== 'ok') throw new Error(`${selector}: ${result}`);
  }

  /** Centre of an element in CSS pixels of the viewport. */
  async center(selector) {
    const box = await this.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
    if (!box) throw new Error(`${selector}: missing`);
    return box;
  }

  async mouse(type, x, y, { button = 'left', modifiers = 0, clickCount = 1 } = {}) {
    await this.send('Input.dispatchMouseEvent', {
      type, x, y, button, modifiers, clickCount, pointerType: 'mouse',
      buttons: type === 'mouseReleased' || type === 'mouseMoved' && button === 'none' ? 0 : button === 'right' ? 2 : 1,
    });
  }

  async realClick(x, y, options = {}) {
    await this.mouse('mouseMoved', x, y, { ...options, button: 'none' });
    await this.mouse('mousePressed', x, y, options);
    await this.mouse('mouseReleased', x, y, options);
  }

  /** Real pointer drag from one point to another in small steps. */
  async drag(from, to, steps = 12) {
    await this.mouse('mouseMoved', from.x, from.y, { button: 'none' });
    await this.mouse('mousePressed', from.x, from.y);
    for (let i = 1; i <= steps; i++) {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, button: 'left', buttons: 1, pointerType: 'mouse' });
      await sleep(16);
    }
    await this.mouse('mouseReleased', to.x, to.y);
  }

  async wheel(x, y, deltaY, modifiers = 0) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers, pointerType: 'mouse' });
  }

  /** Key press. modifiers: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift. */
  async key(key, modifiers = 0, code = null) {
    const codes = { Escape: 27, Enter: 13, Delete: 46, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, F1: 112, F2: 113, PageDown: 34, PageUp: 33 };
    const vk = codes[key] ?? key.toUpperCase().charCodeAt(0);
    const base = { key, code: code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    if (key.length === 1 && !(modifiers & 2)) await this.send('Input.dispatchKeyEvent', { type: 'char', text: key, ...base });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async type(text) {
    await this.send('Input.insertText', { text });
  }

  async screenshot(file) {
    const response = await this.send('Page.captureScreenshot', { format: 'png' });
    if (response.error) throw new Error(response.error.message);
    const fs = await import('node:fs');
    fs.writeFileSync(file, Buffer.from(response.result.data, 'base64'));
  }

  /** Polls `expression` until it returns a truthy value. */
  async waitFor(expression, { timeout = 15000, interval = 120, message } = {}) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try {
        last = await this.eval(expression);
        if (last) return last;
      } catch (error) {
        last = error.message;
      }
      await sleep(interval);
    }
    throw new Error(`${message ?? 'timed out waiting for'} ${expression.slice(0, 160)} (last: ${JSON.stringify(last)?.slice(0, 200)})`);
  }

  close() {
    this.ws?.close();
  }
}

export async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  return (await response.json()).filter((target) => target.type === 'page' || target.type === 'iframe');
}

export async function waitTarget(port, match, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const hit = (await listTargets(port)).find(match);
      if (hit) return hit;
    } catch { /* debugger not up yet */ }
    await sleep(150);
  }
  throw new Error('page target not found');
}
