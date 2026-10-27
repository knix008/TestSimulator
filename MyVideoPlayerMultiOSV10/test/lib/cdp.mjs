// Chrome DevTools Protocol over Node's built-in WebSocket (Node 22+): enough to evaluate code
// in the app's WebView2 pages.

export async function listTargets(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return (await res.json()).filter((t) => t.type === "page");
}

export class Page {
  constructor(target) {
    this.target = target;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = [];
  }

  static async connect(port, match, { timeout = 15_000 } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      try {
        const target = (await listTargets(port)).find((t) => t.url.includes(match));
        if (target) {
          const page = new Page(target);
          await page.open();
          return page;
        }
      } catch {
        /* DevTools not up yet */
      }
      if (Date.now() > end) throw new Error(`no page matching "${match}" on port ${port}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", () => reject(new Error("CDP socket error")));
      this.ws.addEventListener("message", (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && this.pending.has(msg.id)) {
          this.pending.get(msg.id)(msg);
          this.pending.delete(msg.id);
        } else if (msg.method) {
          for (const l of this.listeners) l(msg);
        }
      });
    });
  }

  send(method, params = {}, timeout = 30_000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, timeout);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Runs `fn(...args)` in the page (awaiting promises) and returns its JSON value.
   * Throws with the page's error message when it throws.
   */
  async run(fn, ...args) {
    const expression = `(${fn})(...${JSON.stringify(args)})`;
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      // A thrown string (Tauri rejects invoke() with one) arrives as `value`.
      const text = d.exception?.description?.split("\n")[0] ?? (d.exception?.value != null ? String(d.exception.value) : d.text);
      throw new Error(text || "page error");
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}
