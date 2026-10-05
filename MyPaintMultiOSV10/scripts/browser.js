/* Starting a headless browser and talking to it over the DevTools protocol.
 * Shared by the test runner and by the sample writer, which needs the browser to
 * write the formats only a browser can encode (WebP, and AVIF where it is supported). */
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");

function contentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".nsh": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".sh": "text/plain; charset=utf-8",
  };
  return types[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || "";
}

function stopProcess(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode != null) {
      resolve();
      return;
    }
    const finish = () => resolve();
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore" });
      killer.on("exit", finish);
      killer.on("error", finish);
    } else {
      proc.once("exit", finish);
      proc.kill("SIGTERM");
    }
    setTimeout(finish, 4000);
  });
}

async function removeProfile(profile) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

async function waitForDebugger(port) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (response.ok) return response.json();
    } catch (error) { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The browser debugger did not open.");
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error("Could not connect to the browser.")));
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    }
  });
  return {
    ready: opened,
    send(method, params) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve, reject: reject });
        ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      });
    },
    close() { ws.close(); },
  };
}

async function pageSocket(debugPort) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch("http://127.0.0.1:" + debugPort + "/json/list");
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch (error) { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Could not connect to the test page.");
}

function launch(options) {
  const opts = options || {};
  const browserPath = findBrowser();
  if (!browserPath) throw new Error("Edge or Chrome was not found. Set BROWSER to the executable path.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), (opts.prefix || "mypaint") + "-"));
  const proc = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    "--remote-debugging-port=" + opts.port,
    "--user-data-dir=" + profile,
    "--window-size=" + (opts.window || "1440,1000"),
    opts.url,
  ], { stdio: "ignore" });
  return { proc: proc, profile: profile };
}

/* Opens a page, runs one expression in it, and shuts everything down again. */
async function evaluateInPage(pageUrl, expression) {
  const server = await startServer();
  const pagePort = server.address().port;
  const debugPort = pagePort + 1;
  const browser = launch({ port: debugPort, url: "http://127.0.0.1:" + pagePort + pageUrl, prefix: "mypaint-samples" });
  let cdp;
  try {
    await waitForDebugger(debugPort);
    cdp = connect(await pageSocket(debugPort));
    await cdp.ready;
    await cdp.send("Runtime.enable");
    const result = await cdp.send("Runtime.evaluate", {
      expression: expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "The page could not run that.");
    return result.result.value;
  } finally {
    if (cdp) cdp.close();
    await stopProcess(browser.proc);
    await new Promise((resolve) => server.close(resolve));
    await removeProfile(browser.profile);
  }
}

module.exports = {
  root: root,
  contentType: contentType,
  startServer: startServer,
  findBrowser: findBrowser,
  stopProcess: stopProcess,
  removeProfile: removeProfile,
  waitForDebugger: waitForDebugger,
  connect: connect,
  pageSocket: pageSocket,
  launch: launch,
  evaluateInPage: evaluateInPage,
};
