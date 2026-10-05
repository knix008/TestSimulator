const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");

function paint(code, text) {
  return "\x1b[" + code + "m" + text + "\x1b[0m";
}

function parseDuration(text) {
  const value = String(text || "").trim();
  if (value.endsWith("ms")) return Number.parseFloat(value) || 0;
  if (value.endsWith("s")) return (Number.parseFloat(value) || 0) * 1000;
  return 0;
}

function formatSummaryDuration(ms) {
  if (ms < 1000) return Math.round(ms) + " ms";
  return (ms / 1000).toFixed(2) + " s";
}

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

async function readResult(cdp) {
  const response = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const button = document.getElementById("rerun");
      return {
        ready: Boolean(button),
        done: Boolean(button && !button.disabled),
        label: document.getElementById("progressLabel")?.textContent || "",
        pass: document.getElementById("countPass")?.textContent || "0",
        fail: document.getElementById("countFail")?.textContent || "0",
        total: document.getElementById("countTotal")?.textContent || "0",
        time: document.getElementById("countTime")?.textContent || "",
        clock: document.getElementById("clock")?.textContent || "",
        cases: [...document.querySelectorAll(".suite")].flatMap((suite) => {
          const group = suite.querySelector("h3")?.textContent || "";
          return [...suite.querySelectorAll(".case")].map((row) => ({
            group: group,
            name: row.querySelector(".name")?.textContent || "",
            status: row.classList.contains("fail") ? "fail" : row.classList.contains("pass") ? "pass" : row.classList.contains("run") ? "run" : "wait",
            dur: (row.querySelector(".dur")?.textContent || "").trim(),
            error: row.querySelector(".error")?.textContent || "",
          }));
        }),
      };
    })()`,
    returnByValue: true,
  });
  return response.result.value;
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

async function main() {
  if (!fs.existsSync(path.join(root, "assets", "icon.png"))) {
    await spawnSyncNode(path.join(root, "scripts", "make-icons.js"));
  }
  const browserPath = findBrowser();
  if (!browserPath) {
    console.error("Edge or Chrome was not found. Set BROWSER to the executable path.");
    process.exit(1);
  }
  const server = await startServer();
  const pagePort = server.address().port;
  const debugPort = pagePort + 1;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mymerge-test-"));
  const browser = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    "--remote-debugging-port=" + debugPort,
    "--user-data-dir=" + profile,
    "--window-size=1440,1000",
    "http://127.0.0.1:" + pagePort + "/test/",
  ], { stdio: "ignore" });

  let cdp;
  try {
    await waitForDebugger(debugPort);
    cdp = connect(await pageSocket(debugPort));
    await cdp.ready;
    await cdp.send("Runtime.enable");
    const started = Date.now();
    let last = "";
    let result;
    while (Date.now() - started < 120000) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      try { result = await readResult(cdp); } catch (error) { continue; }
      if (!result || !result.ready) continue;
      const running = (result.cases || []).find((item) => item.status === "run");
      const line = running ? "Running  " + running.group + " · " + running.name + "   " + result.clock : result.label + "   " + result.clock;
      if (line !== last) {
        process.stdout.write("\r" + paint("36", line.padEnd(Math.max(last.length, line.length), " ")));
        last = line;
      }
      const finished = (result.cases || []).filter((item) => item.status === "pass" || item.status === "fail").length;
      if (result.done && Number(result.total) > 0 && finished >= Number(result.total)) break;
    }
    process.stdout.write("\n\n");
    if (!result || !result.done) {
      console.error(paint("31", "Tests did not finish in time."));
      process.exitCode = 1;
      return;
    }
    const finished = (result.cases || []).filter((item) => item.status === "pass" || item.status === "fail");
    const suites = [];
    finished.forEach((item) => { if (!suites.includes(item.group)) suites.push(item.group); });
    console.log(paint("1", "DETAILS"));
    console.log(paint("2", "  " + "#".padEnd(4) + "Status".padEnd(10) + "Duration".padEnd(12) + "Case"));
    console.log(paint("2", "  " + "-".repeat(72)));
    let lastGroup = "";
    finished.forEach((item, index) => {
      if (item.group !== lastGroup) {
        const count = finished.filter((row) => row.group === item.group).length;
        console.log("");
        console.log("  " + paint("1", item.group) + "  " + paint("2", "(" + count + ")"));
        lastGroup = item.group;
      }
      const status = item.status === "pass" ? paint("32", "Passed".padEnd(10)) : paint("31", "Failed".padEnd(10));
      const detail = item.error ? "  " + paint("31", item.error) : "";
      console.log("  " + String(index + 1).padStart(2, "0") + "  " + status + (item.dur || "-").padEnd(12) + item.name + detail);
    });
    console.log("");
    console.log(paint("1", "SUMMARY"));
    console.log(paint("2", "  " + "-".repeat(28)));
    const summaryRows = [
      ["Total", result.total],
      ["Passed", result.pass],
      ["Failed", result.fail],
      ["Duration", result.time],
      ["Suites", String(suites.length)],
    ];
    summaryRows.forEach((row) => {
      const color = row[0] === "Failed" ? (row[1] === "0" ? "32" : "31") : row[0] === "Passed" ? "32" : "33";
      console.log("  " + row[0].padEnd(10) + "  " + paint(color, String(row[1]).padStart(8)));
    });
    console.log("");
    const summaryWidth = 28 + 8 + 8 + 12;
    console.log(paint("2", "  " + "Suite".padEnd(28) + "Passed".padStart(8) + "Failed".padStart(8) + "Duration".padStart(12)));
    console.log(paint("2", "  " + "-".repeat(summaryWidth)));
    let passedAll = 0;
    let failedAll = 0;
    let msAll = 0;
    suites.forEach((group) => {
      const rows = finished.filter((item) => item.group === group);
      const passed = rows.filter((item) => item.status === "pass").length;
      const failed = rows.filter((item) => item.status === "fail").length;
      const ms = rows.reduce((sum, item) => sum + parseDuration(item.dur), 0);
      passedAll += passed;
      failedAll += failed;
      msAll += ms;
      console.log("  " + group.padEnd(28) + paint("32", String(passed).padStart(8)) + paint(failed ? "31" : "32", String(failed).padStart(8)) + formatSummaryDuration(ms).padStart(12));
    });
    console.log(paint("2", "  " + "-".repeat(summaryWidth)));
    console.log("  " + paint("1", "Total".padEnd(28)) + paint("32", String(passedAll).padStart(8)) + paint(failedAll ? "31" : "32", String(failedAll).padStart(8)) + formatSummaryDuration(msAll).padStart(12));
    console.log("");
    if (result.fail !== "0") process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    await stopProcess(browser);
    await new Promise((resolve) => server.close(resolve));
    await removeProfile(profile);
  }
}

function spawnSyncNode(script) {
  const result = spawn(process.execPath, [script], { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    result.on("exit", (code) => (code ? reject(new Error("make-icons failed")) : resolve()));
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
