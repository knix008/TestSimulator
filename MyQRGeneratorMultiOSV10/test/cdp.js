// A minimal DevTools-protocol client for the end-to-end tests (Node's built-in WebSocket).
import fs from "node:fs";
import path from "node:path";
import { root } from "./support.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(check, { timeout = 30000, every = 150, what = "condition" } = {}) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(every);
  }
  throw new Error(`Timed out waiting for ${what}${last instanceof Error ? `: ${last.message}` : ""}`);
}

export class Page {
  static async attach(port, match = () => true) {
    const target = await waitFor(
      async () => {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        return list.find((t) => t.type === "page" && match(t.url));
      },
      { what: "a page target" },
    );
    const page = new Page(target.webSocketDebuggerUrl);
    await page.open();
    return page;
  }

  constructor(url) {
    this.url = url;
    this.seq = 0;
    this.waiting = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error("could not attach"));
    });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const waiter = this.waiting.get(message.id);
      if (!waiter) return;
      this.waiting.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    };
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates an expression (awaiting promises) and returns its JSON value. */
  async eval(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  }

  async screenshot(name) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    const dir = path.join(root, "test", ".out");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }

  close() {
    this.socket?.close();
  }
}

/** The preview canvas as RGBA, ready for jsQR. */
export async function previewImage(page) {
  const { width, height, rgba } = await page.eval("window.__qrgen.previewPixels()");
  return { width, height, data: new Uint8ClampedArray(Buffer.from(rgba, "base64")) };
}

/** Reads PNG size from its IHDR chunk. */
export function pngSize(bytes) {
  assertPng(bytes);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function assertPng(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
}
