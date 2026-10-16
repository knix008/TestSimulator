// Drives the real MyMoney executable through the DevTools protocol. Each run gets its own
// settings folder (MYMONEY_CONFIG_DIR) and a port nobody else is using, so it never touches
// the installed copy's settings, its login entry, or another program's debug server.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import { freePort } from "../../scripts/free-port.js";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function exePath(profile = "debug") {
  const name = process.platform === "win32" ? "mymoney.exe" : "mymoney";
  return path.join(root, "src-tauri", "target", profile, name);
}

/** Stages the pages and builds the debug executable, so the run always shows the latest code. */
export function buildDebug() {
  execFileSync(process.execPath, [path.join(root, "scripts", "stage-web.js")], { cwd: root, stdio: "pipe" });
  execFileSync("cargo", ["build", "--manifest-path", path.join(root, "src-tauri", "Cargo.toml")], { cwd: root, stdio: "pipe" });
  return exePath("debug");
}

export { freePort };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(check, { timeout = 20000, every = 100, what = "condition" } = {}) {
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

class Page {
  constructor(target) {
    this.target = target;
    this.url = target.url;
    this.seq = 0;
    this.waiting = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error(`Could not attach to ${this.url}`));
    });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const waiter = this.waiting.get(message.id);
      if (!waiter) return;
      this.waiting.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    };
    this.socket.onclose = () => {
      for (const waiter of this.waiting.values()) waiter.reject(new Error("window closed"));
      this.waiting.clear();
    };
    return this;
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Runs an expression in the page and returns its value (promises are awaited). */
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  invoke(command, args = {}) {
    return this.eval(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`);
  }

  async screenshot(file) {
    const shot = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    return file;
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      /* already closed */
    }
  }
}

export async function launch({ exe = exePath(), settings = null, env = {} } = {}) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "mymoney-e2e-"));
  if (settings) fs.writeFileSync(path.join(configDir, "settings.json"), JSON.stringify(settings, null, 2));
  const port = await freePort(9480);
  const child = spawn(exe, [], {
    cwd: root,
    env: { ...process.env, ...env, MYMONEY_CONFIG_DIR: configDir, MYMONEY_DEBUG_PORT: String(port) },
    stdio: "ignore",
  });
  let exited = null;
  child.on("exit", (code) => {
    exited = code ?? 0;
  });
  const pages = [];
  const app = {
    child,
    port,
    configDir,
    get exited() {
      return exited;
    },
    async targets() {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      return (await response.json()).filter((target) => target.type === "page");
    },
    /** Attaches to the first window whose address contains `part` and that was not attached before. */
    async page(part, timeout = 20000) {
      const seen = new Set(pages.map((page) => page.target.id));
      const target = await waitFor(async () => (await app.targets()).find((t) => t.url.includes(part) && !seen.has(t.id)), { timeout, what: part });
      const page = await new Page(target).open();
      pages.push(page);
      // A window is listed before its page has loaded; wait for the page and Tauri's globals.
      await waitFor(() => page.eval("document.readyState === 'complete' && Boolean(window.__TAURI__?.webviewWindow)"), { timeout, what: `${part} to load` });
      return page;
    },
    async quit() {
      if (exited === null) {
        const main = pages.find((page) => page.url.includes("index.html"));
        try {
          await main?.invoke("confirm_quit");
        } catch {
          /* the window closes while answering */
        }
        await waitFor(() => exited !== null, { timeout: 8000, what: "exit" }).catch(() => child.kill());
      }
      pages.forEach((page) => page.close());
      // WebView2 helpers can hold the folder for a moment after the app has gone.
      await waitFor(
        () => {
          fs.rmSync(configDir, { recursive: true, force: true });
          return true;
        },
        { timeout: 10000, every: 250, what: "the test settings folder to be removed" },
      ).catch(() => {});
    },
  };
  await waitFor(async () => (await app.targets()).length > 0, { what: "the first window", timeout: 30000 });
  return app;
}

/** Working set and private memory of the app and its WebView2 children, in MB. */
export function memoryOf(pid) {
  if (process.platform !== "win32") return null;
  const script = `
    $all = Get-CimInstance Win32_Process
    $ids = New-Object System.Collections.Generic.HashSet[int]
    [void]$ids.Add(${pid})
    do { $added = 0; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $added++ } } } while ($added)
    $procs = Get-Process -Id ([int[]]@($ids)) -ErrorAction SilentlyContinue
    "{0} {1} {2}" -f $procs.Count, [math]::Round(($procs | Measure-Object WorkingSet64 -Sum).Sum/1MB,1), [math]::Round(($procs | Measure-Object PrivateMemorySize64 -Sum).Sum/1MB,1)`;
  const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim().split(/\s+/);
  return { processes: Number(out[0]), workingSetMB: Number(out[1]), privateMB: Number(out[2]) };
}
