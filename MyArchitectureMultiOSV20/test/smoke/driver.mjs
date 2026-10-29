// Drives the real desktop app over the Chrome DevTools Protocol: launches
// the Tauri debug build (test/smoke/launch.mjs) with a throw-away profile,
// evaluates code in the page, sends real mouse / keyboard input, takes
// screenshots and collects every uncaught renderer error. Used by gui-smoke.mjs and scripts/docs-shots.mjs.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exe, launchEnv, isAppPage } from "./launch.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// windowedDialogs: dialogs as their own windows, as users see them; by
// default the tests keep them inside the page (MYARCH_INLINE_DIALOGS) to
// read and click them there. args: Chromium switches for the webview, or
// files to open (anything not starting with "--").
export async function launch({ width = 1500, height = 950, args = [], env: extraEnv = {}, windowedDialogs = false } = {}) {
  const port = 9581 + Math.floor(Math.random() * 300);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "myarch-smoke-"));
  const browserArgs = args.filter((x) => x.startsWith("--"));
  const files = args.filter((x) => !x.startsWith("--"));
  const env = launchEnv({ port, profile, inlineDialogs: !windowedDialogs, browserArgs, extra: extraEnv });
  const child = spawn(exe, files, { env, stdio: "ignore" });
  const errors = [];
  const pending = new Map();
  const listeners = new Map(); // CDP event name → callbacks (api.on)
  let ws;
  let msgId = 0;
  const send = (method, params = {}) => new Promise((res) => { const i = ++msgId; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find(isAppPage);
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
          if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
          if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push("console.error: " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
          if (msg.method && listeners.has(msg.method)) for (const cb of listeners.get(msg.method)) cb(msg.params);
        };
        await send("Runtime.enable");
        await send("Page.enable");
        break;
      }
    } catch { /* not ready yet */ }
    await sleep(250);
  }
  if (!ws) { child.kill(); throw new Error("app did not start"); }
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  // Size the REAL window (the page always matches what is on screen). Viewport
  // emulation is only a fallback: it draws the page larger or smaller than the
  // window, which looks broken to anyone watching the run.
  // The bridge exists once the page has started: wait for it rather than fall
  // back to emulation because the first try came too early.
  let sized = false;
  for (let i = 0; i < 50 && !sized; i++) {
    sized = await ev(`if (!window.myarch || !window.myarch.resizeWindow) return false; window.myarch.resizeWindow(${width}, ${height}); return true`).catch(() => false);
    if (!sized) await sleep(100);
  }
  if (sized) { for (let i = 0; i < 30; i++) { const s = await ev(`return [innerWidth, innerHeight]`).catch(() => [0, 0]); if (Math.abs(s[0] - width) <= 1 && Math.abs(s[1] - height) <= 1) break; await sleep(100); } }
  else await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const mouse = (type, x, y, button = "left", clickCount = 1, modifiers = 0) => send("Input.dispatchMouseEvent", { type, x, y, button, clickCount, modifiers, buttons: type === "mouseReleased" ? 0 : button === "left" ? 1 : button === "right" ? 2 : 4 });
  const VK = { Escape: 27, Enter: 13, Delete: 46, Backspace: 8, Home: 36, F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F8: 119, F9: 120, PageDown: 34, PageUp: 33, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, " ": 32 };
  const api = {
    child, port, profile, errors, send, ev,
    on(method, cb) { if (!listeners.has(method)) listeners.set(method, new Set()); listeners.get(method).add(cb); return () => listeners.get(method).delete(cb); },
    async click(x, y, opts = {}) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
      await mouse("mousePressed", x, y, opts.button || "left", opts.count || 1, opts.modifiers || 0);
      await mouse("mouseReleased", x, y, opts.button || "left", opts.count || 1, opts.modifiers || 0);
      await sleep(opts.wait ?? 40);
    },
    async dblclick(x, y) { await api.click(x, y); await mouse("mousePressed", x, y, "left", 2); await mouse("mouseReleased", x, y, "left", 2); await sleep(60); },
    async move(x, y, buttons = 0) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons }); await sleep(16); },
    // A real mouse-wheel notch at (x, y): deltaY < 0 zooms in.
    async wheel(x, y, deltaY = -100) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY }); await sleep(16); },
    async drag(x1, y1, x2, y2, steps = 8, modifiers = 0) {
      await api.move(x1, y1);
      await mouse("mousePressed", x1, y1, "left", 1, modifiers);
      for (let i = 1; i <= steps; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps, buttons: 1, modifiers });
      await mouse("mouseReleased", x2, y2, "left", 1, modifiers);
      await sleep(60);
    },
    async key(k, mods = 0) {
      const base = { key: k, code: k.length === 1 ? (/\d/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`) : k, modifiers: mods, windowsVirtualKeyCode: VK[k] || k.toUpperCase().charCodeAt(0) };
      await send("Input.dispatchKeyEvent", { type: k.length === 1 ? "keyDown" : "rawKeyDown", ...base, text: k.length === 1 && !(mods & 2) ? k : undefined });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await sleep(40);
    },
    async type(text) { for (const ch of text) await api.key(ch); },
    async shot(file, opts = {}) {
      const r = await send("Page.captureScreenshot", { format: opts.format || "png", quality: opts.quality, clip: opts.clip });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    },
    async close() {
      try { await send("Runtime.evaluate", { expression: "window.myarchApp && (window.myarchApp.store.dirty = false)" }); } catch { /* gone */ }
      child.kill();
      await sleep(400);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }
    },
  };
  return api;
}
