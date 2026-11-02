// The automated GUI test (`npm run smoke`, and the GUI half of `npm test`).
//
// It drives the real Tauri app from the outside, over the Chrome DevTools Protocol:
//
//   1. builds the UI (vite build) when dist/ is older than the sources, and the debug
//      exe into its own cargo target dir (src-tauri/target/smoke) — `npm start` holds
//      target/debug/*.exe open, so that one is never touched
//   2. starts the exe with a scratch settings folder under the OS temp dir (which also
//      gives it its own WebView2 profile and no single-instance lock) and the WebView2
//      debugging port switched on
//   3. every window — the app, the menu popup, each pooled dialog — is a page target on
//      that port; the steps drive the renderer through the `window.__mcm` hook
//      (src/smokeHooks.ts), the same store actions and DOM a user's clicks reach, and
//      check the popups in their own windows
//   4. prints the results grouped by category with a summary; exit code 1 on any failure
//
//   MCM_SMOKE_FILTER=menu,dialog   only these categories
//   MCM_SMOKE_TIMEOUT=600000       the whole run's limit, in ms (default 9 minutes)
//   --no-build                     use dist/ and the smoke exe as they are
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, listTargets, waitForTarget } from "./cdp.mjs";
import { freePort } from "./free-port.mjs";
import { PASS, FAIL, bar, banner, bold, dim, magenta, ratio, red } from "../test/helpers/colors.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "test-results", "smoke");
const samples = path.join(root, "samples");
const targetDir = path.join(root, "src-tauri", "target", "smoke");
const exe = path.join(targetDir, "debug", process.platform === "win32" ? "mycomparemaster.exe" : "mycomparemaster");
const filter = process.env.MCM_SMOKE_FILTER ? process.env.MCM_SMOKE_FILTER.split(",").map((item) => item.trim()) : null;
const limit = Number(process.env.MCM_SMOKE_TIMEOUT || 9 * 60 * 1000);
const noBuild = process.argv.includes("--no-build");

const results = [];
const shots = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sample = (...parts) => path.join(samples, ...parts);

/* ------------------------------------------------------------ harness */

async function step(category, name, fn) {
  if (filter && !filter.includes(category)) return;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ category, name, ok: true, ms: Date.now() - started, detail: detail === undefined ? "" : String(detail) });
  } catch (error) {
    results.push({
      category,
      name,
      ok: false,
      ms: Date.now() - started,
      detail: String(error && error.message ? error.message : error),
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Polls until `fn` returns something truthy. Each attempt is raced against a deadline
 * of its own, so one evaluation that never settles cannot hang the run.
 */
async function waitFor(fn, timeout = 10000, every = 60) {
  const deadline = Date.now() + timeout;
  let lastError = "";
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const value = await Promise.race([
        Promise.resolve().then(fn),
        sleep(Math.min(remaining, 3000)).then(() => undefined),
      ]);
      if (value) return value;
    } catch (error) {
      lastError = String(error && error.message ? error.message : error);
    }
    await sleep(every);
  }
  throw new Error(`timed out waiting: ${String(fn).slice(0, 110)}${lastError ? ` (last error: ${lastError})` : ""}`);
}

/** WCAG relative luminance of a `#rrggbb` string. */
function luminance(hex) {
  const value = String(hex).trim().replace("#", "");
  if (value.length !== 6) return NaN;
  const channel = (pair) => {
    const raw = parseInt(pair, 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(value.slice(0, 2)) + 0.7152 * channel(value.slice(2, 4)) + 0.0722 * channel(value.slice(4, 6));
}

/** `rgb(1, 2, 3)` as `#010203`, so the contrast maths can take it. */
function toHex(color) {
  const parts = String(color).match(/\d+/g);
  if (!parts || parts.length < 3) return "#000000";
  return "#" + parts.slice(0, 3).map((part) => Number(part).toString(16).padStart(2, "0")).join("");
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return NaN;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** The popup sizes the renderer hands the shell (src/dialogSpecs.ts), read as text. */
function dialogSpecs() {
  const source = fs.readFileSync(path.join(root, "src", "dialogSpecs.ts"), "utf8");
  const specs = {};
  const pattern = /^\s*(\w+):\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)([^}]*)\}/gm;
  for (const match of source.matchAll(pattern)) {
    specs[match[1]] = {
      width: Number(match[2]),
      height: Number(match[3]),
      fixed: /fixed:\s*true/.test(match[4]),
      resizable: /resizable:\s*true/.test(match[4]),
    };
  }
  return specs;
}

/* ------------------------------------------------------------- build */

function newestMtime(entry) {
  let newest = 0;
  const visit = (item) => {
    let stat;
    try {
      stat = fs.statSync(item);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(item)) visit(path.join(item, name));
    } else {
      newest = Math.max(newest, stat.mtimeMs);
    }
  };
  visit(entry);
  return newest;
}

function runTool(label, command, args, env = {}) {
  process.stdout.write(dim(`smoke: ${label}…\n`));
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(`smoke: ${label} failed (exit ${result.status})\n${(result.stdout || "") + (result.stderr || "")}`.slice(-6000));
    process.exit(1);
  }
}

function prepare() {
  // Retried: on Windows something (a scanner, Explorer, a viewer) may hold one of the
  // previous run's screenshots open for a moment.
  fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(sample("files", "left.txt"))) {
    runTool("making samples", process.execPath, [path.join(root, "scripts", "make-samples.mjs")]);
  }
  if (noBuild) {
    if (!fs.existsSync(path.join(root, "dist", "index.html")) || !fs.existsSync(exe)) {
      console.error("smoke: --no-build, but dist/ or the smoke exe is missing.");
      process.exit(1);
    }
    return;
  }

  // The UI: rebuilt only when a source is newer than the last build.
  const built = fs.existsSync(path.join(root, "dist", "index.html"))
    ? fs.statSync(path.join(root, "dist", "index.html")).mtimeMs
    : 0;
  const sources = Math.max(
    ...["src", "core", "assets", "index.html", "vite.config.ts", "package.json"].map((item) => newestMtime(path.join(root, item))),
  );
  if (sources > built) {
    runTool("building the UI", process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "build", "--logLevel", "warn"]);
  }

  // The exe: cargo decides what is stale. Its own target dir, never target/debug.
  runTool("building the app (src-tauri/target/smoke)", "cargo", [
    "build", "--manifest-path", path.join(root, "src-tauri", "Cargo.toml"),
  ], { CARGO_TARGET_DIR: targetDir });
}

/* ---------------------------------------------------- the app process */

const app = {
  child: null,
  cdpPort: 0,
  corePort: 0,
  settingsDir: "",
  output: "",
  mainTarget: null,
  main: null,
  conns: new Map(),
};

async function launch() {
  app.settingsDir = await fsp.mkdtemp(path.join(os.tmpdir(), "mcm-smoke-"));
  // The first-run tutorial offer would sit over the window the steps look at.
  await fsp.writeFile(path.join(app.settingsDir, "settings.json"), `${JSON.stringify({ showTutorial: false }, null, 2)}\n`);
  app.cdpPort = await freePort(9333);

  const env = {
    ...process.env,
    MCM_SMOKE: "1",
    MCM_SETTINGS_DIR: app.settingsDir,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${app.cdpPort}`,
  };
  delete env.MCM_UI;
  delete env.ELECTRON_RUN_AS_NODE;

  app.child = spawn(exe, [], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  app.child.stdout.on("data", (chunk) => (app.output += chunk));
  app.child.stderr.on("data", (chunk) => (app.output += chunk));
  app.exited = new Promise((resolve) => app.child.on("exit", (code) => resolve(code)));

  app.mainTarget = await waitForTarget(app.cdpPort, (target) => /^http:\/\/127\.0\.0\.1:\d+\/?#?$/.test(target.url), 60000);
  app.corePort = Number(new URL(app.mainTarget.url).port);
  app.main = await connect(app.mainTarget);
  app.conns.set(app.mainTarget.id, app.main);
}

/** Stops the app this run started — and only that one. */
async function shutdown() {
  for (const conn of app.conns.values()) {
    try {
      conn.close();
    } catch {
      /* already closed */
    }
  }
  if (app.child && app.child.exitCode === null) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(app.child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      app.child.kill();
    }
    await Promise.race([app.exited, sleep(5000)]);
  }
  // The WebView2 profile lives in here; its processes may hold it for a moment.
  if (app.settingsDir) {
    await fsp.rm(app.settingsDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {});
  }
}

/** A CDP connection to a page target, kept for reuse. */
async function pageOf(target) {
  let conn = app.conns.get(target.id);
  if (!conn || conn.closed) {
    conn = await connect(target);
    app.conns.set(target.id, conn);
  }
  return conn;
}

const js = (code, timeout = 20000) => app.main.evaluate(code, timeout);
const hook = (expression) => js(`(async () => { const h = window.__mcm; return ${expression} })()`);
const state = () => hook("h.state()");

async function shot(name, page = app.main) {
  try {
    const png = await Promise.race([page.screenshot(), sleep(6000).then(() => null)]);
    if (!png) return;
    const file = path.join(outDir, `${name}.png`);
    await fsp.writeFile(file, png);
    shots.push(file);
  } catch {
    // A screenshot is a convenience, not a result.
  }
}

/* --------------------------------------------------------- the windows */

/** The main window's client size (logical px). */
const windowSize = () => js("[window.innerWidth, window.innerHeight]");

/** Resizes the main window through the shell, which applies its minimum. */
async function resizeWindow(width, height) {
  await js(`window.mcm.resizeWindowTo(${Math.round(width)}, ${Math.round(height)})`);
  let last = null;
  // Settled once two readings agree.
  for (let index = 0; index < 20; index++) {
    await sleep(120);
    const size = await windowSize();
    if (last && last[0] === size[0] && last[1] === size[1]) return size;
    last = size;
  }
  return last;
}

/** The window's minimum size, found the way a user finds it: by shrinking it. */
async function minimumSize() {
  const before = await windowSize();
  const min = await resizeWindow(1, 1);
  await resizeWindow(before[0], before[1]);
  return min;
}

/** The OS title of the main window (the taskbar's), or the document title elsewhere. */
function nativeTitle() {
  if (process.platform !== "win32") return js("document.title");
  const result = spawnSync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${app.child.pid}).MainWindowTitle`], { encoding: "utf8" });
  return (result.stdout || "").trim();
}

const OS_WINDOWS_PS1 = `param([int]$procId)
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class McmWin {
  public delegate bool Proc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Proc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public struct Rect { public int L, T, R, B; }
  public static List<string> List(uint pid) {
    var found = new List<string>();
    EnumWindows((h, l) => {
      uint owner; GetWindowThreadProcessId(h, out owner);
      if (owner == pid && IsWindowVisible(h)) {
        Rect r; GetClientRect(h, out r);
        var text = new StringBuilder(256); GetWindowText(h, text, 256);
        found.Add(text.ToString() + "\\t" + (r.R - r.L) + "\\t" + (r.B - r.T) + "\\t" + GetWindowLong(h, -16) + "\\t" + GetDpiForWindow(h));
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
[McmWin]::List($procId) | ForEach-Object { $_ }
`;

/**
 * The app's visible top-level windows as the OS sees them: title, client size in
 * logical px, and whether the frame can be resized. Pooled dialogs are hidden windows,
 * which only the OS can tell apart from shown ones (a WebView reports itself visible
 * either way). Null where there is no Win32.
 */
function osWindows() {
  if (process.platform !== "win32") return null;
  const script = path.join(app.settingsDir, "windows.ps1");
  if (!fs.existsSync(script)) fs.writeFileSync(script, OS_WINDOWS_PS1);
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-procId", String(app.child.pid)], { encoding: "utf8" });
  return (result.stdout || "").split(/\r?\n/).filter(Boolean).map((line) => {
    const [title, width, height, style, dpi] = line.split("\t");
    const scale = (Number(dpi) || 96) / 96;
    return {
      title,
      width: Math.round(Number(width) / scale),
      height: Math.round(Number(height) / scale),
      // WS_THICKFRAME: the frame can be dragged to resize.
      resizable: (Number(style) & 0x00040000) !== 0,
    };
  });
}

const near = (a, b, slack = 3) => Math.abs(a - b) <= slack;

async function dialogTargets() {
  return (await listTargets(app.cdpPort)).filter((target) => target.url.includes("#dialog="));
}

/** The pooled window currently showing dialog `name`, once its content is there. */
async function findDialog(name, timeout = 12000) {
  return waitFor(async () => {
    for (const target of await dialogTargets()) {
      const page = await pageOf(target).catch(() => null);
      if (!page) continue;
      const here = await page.evaluate(`Boolean(document.querySelector('[data-dialog="${name}"]'))`, 3000).catch(() => false);
      if (here) {
        return {
          target,
          page,
          js: (code, wait = 20000) => page.evaluate(code, wait),
        };
      }
    }
    return null;
  }, timeout);
}

/** Runs a command and waits for the dialog it opens. */
async function openDialog(name, command) {
  await hook(`h.run(${JSON.stringify(command)})`);
  return findDialog(name);
}

/** Waits until the window that showed `dialog` is empty again (back in the pool). */
async function dialogGone(dialog, name, timeout = 8000) {
  await waitFor(async () => {
    if (dialog.page.closed) return true;
    return dialog.page.evaluate(`!document.querySelector('[data-dialog="${name}"]')`, 3000).catch(() => true);
  }, timeout);
}

async function menuPage() {
  const target = (await listTargets(app.cdpPort)).find((item) => item.url.includes("#menu="));
  if (!target) throw new Error("there is no menu window");
  return pageOf(target);
}

/** Waits for the menu popup to show `id` (any menu when omitted) and returns its page. */
async function waitMenu(id) {
  return waitFor(async () => {
    const page = await menuPage();
    // Ready once the shell has fitted the window to the popup (menu_size): the page
    // renders first, at the window's old size, and the bounds follow a moment later.
    const ready = await page.evaluate(`(() => {
      const popup = document.querySelector('.menu-popup');
      if (!popup || popup.querySelectorAll('.menu-row').length === 0 || window.innerHeight <= 30) return false;
      const box = popup.getBoundingClientRect();
      if (box.width > window.innerWidth + 2 || box.height > window.innerHeight + 2) return false;
      return ${id ? `popup.dataset.menu === ${JSON.stringify(id)}` : "true"};
    })()`, 3000);
    return ready ? page : null;
  }, 8000).catch(async (error) => {
    const page = await menuPage().catch(() => null);
    const seen = page ? await page.evaluate(`(() => {
      const popup = document.querySelector('.menu-popup');
      return JSON.stringify({ menu: popup && popup.dataset.menu, rows: document.querySelectorAll('.menu-row').length,
        popup: popup ? [Math.round(popup.getBoundingClientRect().width), Math.round(popup.getBoundingClientRect().height)] : null,
        view: [innerWidth, innerHeight] });
    })()`, 3000).catch(() => "?") : "no menu page";
    throw new Error(`menu ${id || "(context)"} did not show: ${seen}; ${error.message.slice(0, 60)}`);
  });
}

/** Closes the menu the renderer's way, so the menubar stops thinking one is open. */
async function closeMenu() {
  await hook("h.closeMenu()").catch(() => {});
  await waitFor(async () => {
    const page = await menuPage();
    return (await page.evaluate("document.querySelectorAll('.menu-popup .menu-row').length", 3000)) === 0;
  }, 4000).catch(() => {});
  await sleep(120);
}

/* -------------------------------------------------------------- steps */

async function run() {
  await app.main.until("window.__mcm && window.mcm", 30000);
  await waitFor(async () => (await state())?.ready === true, 30000);
  await sleep(800);
  if (await js("window.mcm.isMaximized()")) await js("window.mcm.toggleMaximizeWindow()");

  const specs = dialogSpecs();

  /* ----------------------------------------------------------- window */

  await step("window", "the title bar carries the program name and version", async () => {
    const title = await waitFor(async () => {
      const text = await nativeTitle();
      return /My Compare Master V\d+\.\d+/.test(text) ? text : null;
    }, 8000).catch(async () => {
      throw new Error(`window title: ${await nativeTitle()}`);
    });
    const brand = await hook("h.text('.menubar-brand')");
    assert(/My Compare Master V\d+\.\d+/.test(brand), `brand: ${brand}`);
    return title;
  });

  await step("window", "the window icon is the application icon", async () => {
    const iconFile = path.join(root, "assets", process.platform === "win32" ? "icon.ico" : "icon.png");
    await fsp.access(iconFile);
    const icon = await js(`(() => {
      const img = document.querySelector('.menubar-brand img.brand-icon');
      return img ? { loaded: img.complete && img.naturalWidth > 0, width: img.naturalWidth } : null;
    })()`);
    assert(icon, "the title bar has no program icon");
    assert(icon.loaded, "the title bar icon did not load");
    return `${path.relative(root, iconFile)}, title bar icon ${icon.width}px`;
  });

  await step("window", "the minimum width covers the whole toolbar", async () => {
    const needed = await hook("h.toolbarWidth()");
    const [minWidth] = await minimumSize();
    assert(needed > 300, `toolbar measured ${needed}px`);
    assert(minWidth >= needed - 2, `minimum ${minWidth} < toolbar ${needed}`);
    return `toolbar ${needed}px, minimum ${minWidth}px`;
  });

  await step("window", "no toolbar button is clipped at the minimum width", async () => {
    const before = await windowSize();
    const [minWidth] = await resizeWindow(1, before[1]);
    const clipped = await js(`(() => {
      const bar = document.querySelector('.toolbar');
      const right = bar.getBoundingClientRect().right;
      return [...bar.querySelectorAll('[data-command]')]
        .filter((b) => b.getBoundingClientRect().right > right + 1).length;
    })()`);
    await resizeWindow(before[0], before[1]);
    assert(clipped === 0, `${clipped} buttons run past the toolbar at ${minWidth}px`);
    return `0 clipped at ${minWidth}px`;
  });

  await step("window", "the status bar is present and reports state", async () => {
    const text = await hook("h.text('.status-bar')");
    assert(text && text.length > 3, `status bar: ${text}`);
    return text.slice(0, 80);
  });

  await step("window", "no tutorial offer covers the window when it is switched off", async () => {
    const shown = await js(`({
      welcome: document.querySelectorAll('[data-testid="tour-welcome"]').length,
      tour: document.querySelectorAll('[data-testid="tour"]').length,
    })`);
    const saved = (await state()).settings.showTutorial;
    assert(saved === false, `settings.showTutorial is ${saved}`);
    assert(shown.welcome === 0 && shown.tour === 0, JSON.stringify(shown));
    return "showTutorial false, no welcome card, no tour";
  });

  /** Opens the merge sample and waits for it, for the steps that need a merge tab. */
  const openMergeTab = async () => {
    const files = [
      sample("merge", "base.txt"),
      sample("merge", "local.txt"),
      sample("merge", "remote.txt"),
      path.join(outDir, "merged.txt"),
    ];
    await hook(`h.open('merge', ${JSON.stringify(files)})`);
    await waitFor(async () => (await state()).tabs.at(-1).kind === "merge", 8000);
    await sleep(300);
  };

  await step("window", "the start screen offers every kind of session", async () => {
    const start = await js(`(() => {
      const list = [...document.querySelectorAll('.start-tile[data-session-type]')];
      return {
        kinds: list.map((tile) => tile.dataset.sessionType),
        described: list.filter((tile) => (tile.querySelector('small')?.textContent ?? '').length > 4).length,
        cards: [...document.querySelectorAll('[data-tour^="start-"]')].map((card) => card.dataset.tour),
      };
    })()`);
    for (const kind of ["folder-compare", "folder-sync", "text-compare", "text-merge", "image-compare", "hex-compare"]) {
      assert(start.kinds.includes(kind), `the start screen has no ${kind} tile`);
    }
    assert(start.described === start.kinds.length, "a tile has no description");
    for (const card of ["start-hero", "start-new-session", "start-recent"]) {
      assert(start.cards.includes(card), `the start screen has no ${card} card (${start.cards.join(", ")})`);
    }
    await shot("01-start");
    return `${start.kinds.length} session types, cards ${start.cards.join(", ")}`;
  });

  await step("window", "the start screen has the whole workspace, no side panels", async () => {
    const layout = await js(`(() => ({
      left: document.querySelectorAll('.panel-left').length,
      right: document.querySelectorAll('.panel-right').length,
      rails: document.querySelectorAll('.panel-rail').length,
      bottom: document.querySelectorAll('.bottom-panel').length,
    }))()`);
    assert(layout.left === 0 && layout.right === 0 && layout.rails === 0, JSON.stringify(layout));
    assert(layout.bottom === 0, "the bottom panel is showing on the start screen");
    return "no panels, no rails";
  });

  await step("window", "with a comparison open the session panel is on the left, and only it", async () => {
    await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
    await waitFor(async () => (await hook("h.query('.panel-left')")) === 1, 8000);
    const layout = await js(`(() => ({
      left: document.querySelectorAll('.panel-left').length,
      right: document.querySelectorAll('.panel-right').length,
      sessions: document.querySelectorAll('.panel-left [data-session-type]').length,
    }))()`);
    assert(layout.left === 1, `${layout.left} left panels`);
    // The right panel belongs to a merge; a plain comparison has none.
    assert(layout.right === 0, "the property panel is showing with no merge open");
    assert(layout.sessions >= 6, `the session panel lists only ${layout.sessions} kinds`);
    return `session panel with ${layout.sessions} kinds`;
  });

  await step("window", "the session panel closes and reopens from the panel itself", async () => {
    await hook("h.settings({ showLeftPanel: true })");
    await waitFor(async () => (await state()).settings.showLeftPanel === true);
    const open = await js("document.querySelector('.panel-left').getBoundingClientRect().width");

    await hook(`h.click('.panel-left [data-command="panel.collapse"]')`);
    await waitFor(async () => (await state()).settings.showLeftPanel === false, 6000);
    const closed = await js(`(() => {
      const rail = document.querySelector('.panel-rail');
      return {
        panels: document.querySelectorAll('.panel-left').length,
        rail: rail ? Math.round(rail.getBoundingClientRect().width) : 0,
        label: rail ? rail.textContent.trim() : "",
      };
    })()`);
    assert(closed.panels === 0, "the panel is still there after being closed");
    assert(closed.rail > 0 && closed.rail < 40, `the rail is ${closed.rail}px wide`);
    assert(closed.label.length > 0, "the rail does not say which panel it reopens");

    await hook(`h.click('.panel-rail')`);
    await waitFor(async () => (await state()).settings.showLeftPanel === true, 6000);
    const reopened = await js("document.querySelector('.panel-left').getBoundingClientRect().width");
    assert(Math.abs(reopened - open) < 2, `the panel came back ${reopened}px wide instead of ${open}px`);
    return `${Math.round(open)}px → ${closed.rail}px rail → ${Math.round(reopened)}px`;
  });

  await step("window", "the minimum width is the toolbar's, and nothing else", async () => {
    const [minWidth] = await minimumSize();
    const toolbar = await hook("h.toolbarWidth()");
    assert(minWidth >= Math.floor(toolbar), `minimum ${minWidth} clips a ${toolbar}px toolbar`);
    assert(minWidth <= toolbar + 80, `minimum ${minWidth} is far wider than the ${toolbar}px toolbar`);
    return `toolbar ${Math.round(toolbar)}px, minimum ${minWidth}px`;
  });

  await shot("01-main");

  /* ---------------------------------------------------------- toolbar */

  await step("toolbar", "every toolbar button has a tooltip", async () => {
    const buttons = await hook("h.toolbar()");
    assert(buttons.length >= 18, `only ${buttons.length} buttons`);
    const missing = buttons.filter((button) => !button.tooltip || button.tooltip.trim().length === 0);
    assert(missing.length === 0, `without tooltip: ${missing.map((b) => b.command).join(", ")}`);
    return `${buttons.length} buttons, all with tooltips`;
  });

  await step("window", "the tab strip keeps its height whatever is open", async () => {
    const measure = () => js(`(() => {
      const bar = document.querySelector('.tabbar');
      if (!bar) return null;
      const box = bar.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('.tab')];
      return {
        height: Math.round(box.height),
        bottom: Math.round(box.bottom),
        shell: Math.round(document.querySelector('.shell').getBoundingClientRect().bottom),
        clipped: tabs.filter((tab) => tab.getBoundingClientRect().height < 10).length,
      };
    })()`);

    const files = [sample("files", "left.txt"), sample("files", "right.txt")];
    for (const [what, open] of [
      ["a comparison", `h.open('files', ${JSON.stringify(files)})`],
      ["a folder comparison", `h.open('directories', ${JSON.stringify([outDir, outDir])})`],
    ]) {
      await hook(open);
      await sleep(400);
      const bar = await measure();
      assert(bar, `no tab strip with ${what} open`);
      assert(bar.height >= 24, `the strip is ${bar.height}px tall with ${what} open`);
      assert(bar.bottom <= bar.shell, `the strip is below the window with ${what} open`);
      assert(bar.clipped === 0, `${bar.clipped} tabs have no height with ${what} open`);
    }
    return "the strip keeps its height";
  });

  await step("toolbar", "no two toolbar buttons are drawn the same", async () => {
    // The icons are coloured now and drawn from several shapes, so a button's glyph is
    // all of its outlines together, not just the first one.
    const shapes = await js(`(() => {
      const seen = {};
      for (const button of document.querySelectorAll('.toolbar [data-command]')) {
        const svg = button.querySelector('svg');
        if (!svg || svg.classList.contains('flag')) continue;
        const d = [...svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')]
          .map((shape) => shape.tagName + (shape.getAttribute('d') || [...shape.attributes].map((a) => a.name + a.value).join(' ')))
          .join('|');
        if (!d) continue;
        (seen[d] = seen[d] || []).push(button.dataset.command);
      }
      return Object.values(seen).filter((commands) => commands.length > 1);
    })()`);
    assert(
      shapes.length === 0,
      `these share an icon: ${shapes.map((group) => group.join(" = ")).join(" | ")}`,
    );
    return "every button has its own glyph";
  });

  await step("toolbar", "the zoom readout follows Ctrl+Wheel", async () => {
    const before = (await state()).settings.zoom;
    await hook("h.wheelZoom(-120)");
    await waitFor(async () => (await state()).settings.zoom > before);
    const zoomed = (await state()).settings.zoom;
    const readout = await js(`document.querySelector('.zoom-group .stepper-value').value`);
    assert(Number(readout) === zoomed, `the toolbar readout reads ${readout}, not ${zoomed}`);
    await hook("h.run('view.zoomReset')");
    await waitFor(async () => (await state()).settings.zoom === 100);
    return `${before}% → ${zoomed}% → 100%`;
  });

  /* ------------------------------------------------------------ menus */

  await step("menu", "every menu opens as its own window, in a single column", async () => {
    const titles = (await hook("h.menuTitles()")).filter(Boolean);
    assert(titles.length === 7, `menu bar has ${titles.length} titles: ${titles.join(", ")}`);
    let osChecked = "";
    for (const id of titles) {
      await hook("h.openMenu(" + JSON.stringify(id) + ")");
      const popup = await waitMenu(id);
      const box = await popup.evaluate(`({
        flex: getComputedStyle(document.querySelector('.menu-popup')).flexDirection,
        rows: document.querySelectorAll('.menu-popup .menu-row').length,
        width: window.innerWidth,
        height: window.innerHeight,
      })`);
      assert(box.flex === "column", `menu ${id} is not a single column`);
      assert(box.rows > 0, `menu ${id} is empty`);
      if (id === "file") {
        await shot("02-menu-file", popup);
        // The popup is a real window: the OS lists it, shown, at the size the page has.
        const windows = osWindows();
        if (windows) {
          const menu = windows.find((item) => item.title === "Menu");
          assert(menu, `no visible menu window (${windows.map((item) => item.title).join(", ")})`);
          assert(near(menu.width, box.width, 4) && near(menu.height, box.height, 4),
            `the menu window is ${menu.width}x${menu.height}, its page ${box.width}x${box.height}`);
          osChecked = `, OS window ${menu.width}x${menu.height}`;
        }
      }
      if (id === "compare") await shot("02b-menu-compare", popup);
      await closeMenu();
    }
    return `${titles.length} menus${osChecked}`;
  });

  await step("menu", "every menu row has an icon beside its label", async () => {
    await hook("h.openMenu('file')");
    const popup = await waitMenu("file");
    const counts = await popup.evaluate(`(() => {
      const rows = [...document.querySelectorAll('.menu-popup .menu-row')];
      return {
        total: rows.length,
        withIcon: rows.filter((row) => row.querySelector('.menu-icon svg')).length,
        withLabel: rows.filter((row) => (row.querySelector('.menu-label') || {}).textContent).length,
      };
    })()`);
    await closeMenu();
    assert(counts.total === counts.withIcon, `${counts.total - counts.withIcon} rows without an icon`);
    assert(counts.total === counts.withLabel, `${counts.total - counts.withLabel} rows without a label`);
    return `${counts.total} rows, each with an icon and a label`;
  });

  await step("menu", "a menu with nothing to tick does not indent past a tick column", async () => {
    const measure = async (menu) => {
      await closeMenu();
      await hook(`h.openMenu(${JSON.stringify(menu)})`);
      const popup = await waitMenu(menu);
      return popup.evaluate(`(() => {
        const popup = document.querySelector('.menu-popup');
        const rows = [...popup.querySelectorAll('.menu-row:not(.compact)')];
        const style = getComputedStyle(popup);
        const content = popup.getBoundingClientRect().left
          + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const icons = rows.map((row) => row.querySelector('.menu-icon').getBoundingClientRect().left);
        const rowStyle = getComputedStyle(rows[0]);
        return {
          rows: rows.length,
          ticks: popup.querySelectorAll('.menu-row:not(.compact) .menu-check').length,
          gutter: Math.round(Math.min(...icons) - content - parseFloat(rowStyle.paddingLeft)),
          spread: Math.round(Math.max(...icons) - Math.min(...icons)),
          width: Math.round(popup.getBoundingClientRect().width),
        };
      })()`);
    };

    const file = await measure("file");
    const compare = await measure("compare");
    await closeMenu();

    assert(file.ticks === 0, `the File menu reserves ${file.ticks} tick cells it never fills`);
    assert(file.gutter === 0, `the File menu indents its icons by ${file.gutter}px of nothing`);
    assert(file.spread === 0, "the File menu's icons are not aligned with each other");
    assert(compare.ticks === compare.rows, `the Compare menu has ${compare.rows} rows but ${compare.ticks} tick cells`);
    assert(compare.gutter > 0, "the Compare menu left no room for its ticks");
    return `file ${file.width}px, no tick column; compare ${compare.width}px, ${compare.gutter}px tick gutter`;
  });

  await step("menu", "a menu taller than the window is still shown in full", async () => {
    const before = await windowSize();
    const small = await resizeWindow(before[0], 620);
    await hook("h.openMenu('view')");
    const popup = await waitMenu("view");
    const menu = await popup.evaluate(`(() => {
      const el = document.querySelector('.menu-popup');
      return { height: window.innerHeight, scrolls: el.scrollHeight > el.clientHeight + 2 };
    })()`);
    await shot("03-menu-view", popup);
    await closeMenu();
    await resizeWindow(before[0], before[1]);
    assert(!menu.scrolls, "the menu scrolls instead of showing every row");
    return `${menu.height}px tall, window ${small[1]}px`;
  });

  await step("menu", "a context menu opens on the workspace", async () => {
    await closeMenu();
    // The workspace's menu is the active tab's (src/contextMenus.ts); a comparison is open.
    await hook("h.contextMenu('.workspace')");
    const popup = await waitMenu();
    const rows = await popup.evaluate("document.querySelectorAll('.menu-popup .menu-row').length");
    await closeMenu();
    assert(rows > 0, "the context menu is empty");
    return `${rows} rows`;
  });

  await step("menu", "the Help menu offers the guide (F1) and the tutorial", async () => {
    await hook("h.openMenu('help')");
    const popup = await waitMenu("help");
    const rows = await popup.evaluate(`[...document.querySelectorAll('.menu-popup .menu-row')]
      .map((row) => ({ id: row.dataset.command || '', text: row.textContent }))`);
    await closeMenu();
    const ids = rows.map((row) => row.id);
    for (const id of ["help.guide", "help.tutorial", "help.about"]) {
      assert(ids.includes(id), `the Help menu has no ${id} (${ids.join(", ")})`);
    }
    const guide = rows.find((row) => row.id === "help.guide");
    assert(/F1/.test(guide.text), `the guide row does not show F1: "${guide.text}"`);
    return ids.filter(Boolean).join(", ");
  });

  /* ---------------------------------------------------- file compare */

  await step("compare", "two files open side by side with the right counts", async () => {
    const result = await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
    const tab = result.tabs[result.tabs.length - 1];
    assert(tab.kind === "compare", `opened a ${tab.kind} tab`);
    assert(tab.added > 0 && tab.removed > 0 && tab.modified > 0, JSON.stringify(tab));
    await waitFor(async () => (await hook("h.query('.diff-row')")) > 0);
    return `+${tab.added} -${tab.removed} ~${tab.modified}`;
  });

  await step("compare", "added, removed and modified rows are coloured apart", async () => {
    const colours = await js(`(() => {
      const pick = (selector) => {
        const half = document.querySelector(selector + ' .diff-half');
        return half ? getComputedStyle(half).backgroundColor : null;
      };
      return {
        added: pick('.diff-row.kind-added'),
        removed: pick('.diff-row.kind-removed'),
        modified: pick('.diff-row.kind-modified'),
      };
    })()`);
    const distinct = new Set(Object.values(colours).filter(Boolean));
    assert(distinct.size >= 2, `row colours: ${JSON.stringify(colours)}`);
    return JSON.stringify(colours);
  });

  await step("compare", "Next difference walks the blocks", async () => {
    const first = (await state()).tabs.at(-1).cursor;
    await hook("h.run('nav.nextDiff')");
    await sleep(150);
    const second = (await state()).tabs.at(-1).cursor;
    assert(second !== first, `cursor stayed at ${first}`);
    await hook("h.run('nav.firstDiff')");
    await sleep(150);
    return `${first} → ${second}`;
  });

  await step("compare", "identical files are reported as identical", async () => {
    const result = await hook(`h.open('files', ${JSON.stringify([sample("files", "identical-a.txt"), sample("files", "identical-b.txt")])})`);
    const tab = result.tabs.at(-1);
    assert(tab.identical === true, JSON.stringify(tab));
    assert((await hook("h.query('.diff-banner')")) === 0, "a banner is covering the panes");
    const status = await hook("h.text('.status-message')");
    assert(status.length > 0, "the status bar said nothing about it");
    return `identical, status bar reads "${status}"`;
  });

  await step("compare", "ignoring whitespace and case changes the result", async () => {
    const pair = JSON.stringify([sample("files", "loose-a.txt"), sample("files", "loose-b.txt")]);
    let result = await hook(`h.open('files', ${pair})`);
    const strict = result.tabs.at(-1);
    assert(strict.identical === false, "the pair should differ with strict comparison");
    await hook("h.settings({ ignoreWhitespace: true, ignoreCase: true })");
    result = await hook(`h.open('files', ${pair})`);
    const loose = result.tabs.at(-1);
    await hook("h.settings({ ignoreWhitespace: false, ignoreCase: false })");
    assert(loose.identical === true, `still different: ${JSON.stringify(loose)}`);
    return "strict differs, loose matches";
  });

  await step("compare", "a diff scrollbar sits on each side and stays a strip", async () => {
    const box = await js(`(() => {
      const bars = [...document.querySelectorAll('.diff-scrollbar')];
      const scroller = document.querySelector('.diff-scroller');
      return {
        count: bars.length,
        widths: bars.map((bar) => bar.getBoundingClientRect().width),
        scroller: scroller.getBoundingClientRect().width,
      };
    })()`);
    assert(box.count === 2, `${box.count} scrollbars, expected one per side`);
    for (const width of box.widths) {
      assert(width > 12 && width < 40, `a scrollbar is ${width}px wide`);
    }
    assert(box.scroller > 200, `the panes got only ${box.scroller}px`);
    return `2 bars of ${Math.round(box.widths[0])}px, panes ${Math.round(box.scroller)}px`;
  });

  await step("compare", "the scrollbar paints the differences and carries a thumb", async () => {
    await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
    await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 8000);
    await sleep(400);
    const painted = await js(`(() => {
      const bar = document.querySelector('.diff-scrollbar');
      const canvas = bar.querySelector('canvas');
      const thumb = bar.querySelector('.scrollbar-thumb');
      const context = canvas.getContext('2d');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colours = new Set();
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 0) colours.add(pixels[index] + ',' + pixels[index + 1] + ',' + pixels[index + 2]);
      }
      return { colours: colours.size, thumb: thumb ? thumb.getBoundingClientRect().height : 0 };
    })()`);
    assert(painted.colours > 1, "the scrollbar painted nothing");
    assert(painted.thumb > 0, "the scrollbar has no thumb");
    return `${painted.colours} colours, thumb ${Math.round(painted.thumb)}px`;
  });

  await step("compare", "the two halves are drawn as separate documents", async () => {
    const box = await js(`(() => {
      const row = document.querySelector('.diff-row');
      const halves = [...row.querySelectorAll('.diff-half')];
      const divider = row.querySelector('.cell-divider');
      return {
        halves: halves.length,
        gutters: halves.map((half) => Boolean(half.querySelector('.cell-gutter'))),
        gap: divider
          ? divider.getBoundingClientRect().left - halves[0].getBoundingClientRect().right
          : -1,
        divider: divider ? divider.getBoundingClientRect().width : 0,
      };
    })()`);
    assert(box.halves === 2, `${box.halves} halves in a row`);
    assert(box.gutters.every(Boolean), "a half is missing its line numbers");
    assert(box.divider > 10, `the divider is only ${box.divider}px`);
    assert(box.gap > 0, "the halves are not separated");
    return `2 framed halves, ${Math.round(box.divider)}px divider`;
  });

  await step("compare", "a binary pair falls back to the hex view", async () => {
    const result = await hook(`h.open('files', ${JSON.stringify([sample("files", "left.bin"), sample("files", "right.bin")])})`);
    assert(result.tabs.at(-1).mode === "binary", "not shown as binary");
    await waitFor(async () => (await hook("h.query('.diff-row.hex')")) > 0);
    return "hex rows rendered";
  });

  await step("grammar", "code is coloured by its grammar", async () => {
    const left = path.join(outDir, "grammar", "a.ts");
    const right = path.join(outDir, "grammar", "b.ts");
    await fsp.mkdir(path.dirname(left), { recursive: true });
    const source = [
      'const greeting = "hello";   // a greeting',
      "const count = 42;",
      "/* a block",
      "   comment */",
      "export { greeting, count };",
      "",
    ].join("\n");
    await fsp.writeFile(left, source);
    await fsp.writeFile(right, source.replace("hello", "hallo"));

    await hook(`h.open('files', ${JSON.stringify([left, right])})`);
    await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 8000);
    await sleep(300);

    const kinds = await js(`(() => {
      const found = new Set();
      for (const span of document.querySelectorAll('.cell-text [class*="tok-"]')) {
        for (const name of span.classList) if (name.startsWith('tok-')) found.add(name);
      }
      return [...found];
    })()`);
    for (const wanted of ["tok-keyword", "tok-string", "tok-number", "tok-comment"]) {
      assert(kinds.includes(wanted), `nothing was coloured as ${wanted}; found ${kinds.join(", ")}`);
    }
    const colours = await js(`(() => {
      const read = (name) => {
        const span = document.querySelector('.cell-text .' + name);
        return span ? getComputedStyle(span).color : null;
      };
      return { comment: read('tok-comment'), string: read('tok-string'), keyword: read('tok-keyword') };
    })()`);
    assert(new Set(Object.values(colours)).size === 3, `the colours repeat: ${JSON.stringify(colours)}`);
    return `${kinds.length} kinds of token coloured`;
  });

  await step("grammar", "a block comment is still a comment on its second line", async () => {
    const second = await js(`(() => {
      const rows = [...document.querySelectorAll('.diff-row')];
      const row = rows.find((item) => item.textContent.includes('comment */'));
      if (!row) return null;
      const half = row.querySelector('.diff-half .cell-text');
      return { text: half.textContent.trim(), comment: Boolean(half.querySelector('.tok-comment')) };
    })()`);
    assert(second, "the continuation line was not rendered");
    assert(second.comment, `"${second.text}" was not coloured as a comment`);
    return second.text;
  });

  await step("grammar", "turning off syntax highlighting removes the colour", async () => {
    await hook("h.settings({ syntaxHighlight: false })");
    await waitFor(async () => (await hook('h.query(\'.cell-text [class*="tok-"]\')')) === 0, 8000);
    await hook("h.settings({ syntaxHighlight: true })");
    await waitFor(async () => (await hook('h.query(\'.cell-text [class*="tok-"]\')')) > 0, 8000);
    return "off, then on again";
  });

  await step("grammar", "ignoring comments stops a comment-only change being a difference", async () => {
    const left = path.join(outDir, "grammar", "c1.ts");
    const right = path.join(outDir, "grammar", "c2.ts");
    await fsp.writeFile(left, "const x = 1; // one\nconst y = 2;\n");
    await fsp.writeFile(right, "const x = 1; // ONE, rewritten\nconst y = 2;\n");
    const pair = JSON.stringify([left, right]);

    let result = await hook(`h.open('files', ${pair})`);
    assert(result.tabs.at(-1).identical === false, "the comment change should differ by default");

    await hook("h.settings({ ignoreComments: true })");
    result = await hook(`h.open('files', ${pair})`);
    const loose = result.tabs.at(-1);
    assert(loose.identical === true, `still different with comments ignored: ${JSON.stringify(loose)}`);

    await fsp.writeFile(right, "const x = 2; // ONE, rewritten\nconst y = 2;\n");
    result = await hook(`h.open('files', ${pair})`);
    assert(result.tabs.at(-1).identical === false, "a code change was swallowed by the comment rule");

    await hook("h.settings({ ignoreComments: false })");
    return "comment-only changes ignored, code changes kept";
  });

  await step("grammar", "quote style and number format can be ignored too", async () => {
    const left = path.join(outDir, "grammar", "q1.ts");
    const right = path.join(outDir, "grammar", "q2.ts");
    await fsp.writeFile(left, "const a = 'x';\nconst b = 0x10;\n");
    await fsp.writeFile(right, 'const a = "x";\nconst b = 16;\n');
    const pair = JSON.stringify([left, right]);

    let result = await hook(`h.open('files', ${pair})`);
    assert(result.tabs.at(-1).identical === false, "they differ as written");

    await hook("h.settings({ ignoreQuoteStyle: true, ignoreNumberFormat: true })");
    result = await hook(`h.open('files', ${pair})`);
    assert(result.tabs.at(-1).identical === true, "the two rules together should make these equal");

    await hook("h.settings({ ignoreQuoteStyle: false, ignoreNumberFormat: false })");
    return "'x' == \"x\" and 0x10 == 16";
  });

  /** Types into a controlled input the way React sees a keystroke. */
  const typeInto = (selector, value) => js(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

  await step("find", "searching covers the whole file, not just the loaded rows", async () => {
    const left = path.join(outDir, "find", "long-a.txt");
    const right = path.join(outDir, "find", "long-b.txt");
    await fsp.mkdir(path.dirname(left), { recursive: true });
    const lines = Array.from({ length: 3000 }, (_, index) => `line ${index}`);
    lines[2900] = "the needle is here";
    await fsp.writeFile(left, `${lines.join("\n")}\n`);
    await fsp.writeFile(right, `${lines.join("\n")}\n`);

    await hook(`h.open('files', ${JSON.stringify([left, right])})`);
    await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 10000);
    await typeInto('[data-field="find"]', "the needle");

    await waitFor(async () => {
      const text = await hook("h.text('[data-testid=\"find-count\"]')");
      return text.includes("1") && !text.includes("없음") && !text.includes("none");
    }, 10000);
    await waitFor(async () => (await state()).tabs.at(-1).cursor === 2900, 10000);
    return `found at row ${(await state()).tabs.at(-1).cursor}`;
  });

  await step("find", "the search switches change what matches", async () => {
    const left = path.join(outDir, "find", "flags-a.txt");
    const right = path.join(outDir, "find", "flags-b.txt");
    const body = "cat\nCAT\nconcatenate\n";
    await fsp.writeFile(left, body);
    await fsp.writeFile(right, body);
    await hook(`h.open('files', ${JSON.stringify([left, right])})`);
    await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 8000);

    // The search is debounced and runs on the server, so each count is waited for.
    const countIs = async (wanted, what) => {
      await waitFor(async () => {
        const text = await hook("h.text('[data-testid=\"find-count\"]')");
        return new RegExp(`(^|[^0-9])${wanted}([^0-9]|$)`).test(text) ? text : null;
      }, 10000).catch(async () => {
        const text = await hook("h.text('[data-testid=\"find-count\"]')");
        throw new Error(`${what} reported "${text}", expected ${wanted}`);
      });
      return hook("h.text('[data-testid=\"find-count\"]')");
    };

    await typeInto('[data-field="find"]', "cat");
    const all = await countIs(3, "a plain search");
    await hook("h.click('[data-find-flag=\"caseSensitive\"]')");
    const cased = await countIs(2, "case-sensitive");
    await hook("h.click('[data-find-flag=\"wholeWord\"]')");
    const word = await countIs(1, "whole-word");
    await hook("h.click('[data-find-flag=\"caseSensitive\"]')");
    await hook("h.click('[data-find-flag=\"wholeWord\"]')");
    await sleep(300);
    return `all ${all.trim()}, cased ${cased.trim()}, word ${word.trim()}`;
  });

  await step("find", "replace all rewrites one side and leaves the other", async () => {
    const left = path.join(outDir, "find", "rep-a.txt");
    const right = path.join(outDir, "find", "rep-b.txt");
    await fsp.writeFile(left, "red\nred and red\nblue\n");
    await fsp.writeFile(right, "red\nred and red\nblue\n");
    await hook(`h.open('files', ${JSON.stringify([left, right])})`);
    await waitFor(async () => (await hook("h.query('.diff-row')")) > 0, 8000);

    if ((await hook('h.query(\'[data-field="replace"]\')')) === 0) {
      await hook("h.click('[data-find=\"toggleReplace\"]')");
    }
    await waitFor(async () => (await hook('h.query(\'[data-field="replace"]\')')) === 1, 6000);

    // Both boxes are controlled: a re-render between typing and clicking (a line
    // arriving in the log, say) can put the stored value back. And the button stays
    // disabled until the debounced search has counted the matches. So the values are
    // typed again until they hold, and the click waits for an enabled button — never
    // for a fixed delay.
    await waitFor(async () => {
      const ready = await js(`(() => {
        const find = document.querySelector('[data-field="find"]');
        const box = document.querySelector('[data-field="replace"]');
        const button = document.querySelector('[data-find="replaceLeft"]');
        return { find: find && find.value, box: box && box.value, enabled: Boolean(button && !button.disabled) };
      })()`);
      if (ready.find !== "red") await typeInto('[data-field="find"]', "red");
      if (ready.box !== "green") await typeInto('[data-field="replace"]', "green");
      return ready.find === "red" && ready.box === "green" && ready.enabled;
    }, 15000, 150);

    // The click is repeated until the file changes: a click that lands while the
    // search is being redone is dropped by the bar, not an error.
    await waitFor(async () => {
      const text = await fsp.readFile(left, "utf8");
      if (text === "green\ngreen and green\nblue\n") return true;
      await hook("h.click('[data-find=\"replaceLeft\"]')").catch(() => {});
      await sleep(700);
      return (await fsp.readFile(left, "utf8")) === "green\ngreen and green\nblue\n";
    }, 15000, 100);
    const other = await fsp.readFile(right, "utf8");
    assert(other === "red\nred and red\nblue\n", `the right side was changed too: ${JSON.stringify(other)}`);
    return "three replaced on the left, none on the right";
  });

  /**
   * Clicks a comparison row and waits for the cursor to land on it. Retried: the rows
   * are fetched asynchronously, and a click on a node that is re-rendered a moment
   * later never reaches the store.
   */
  const clickRow = async (row) => {
    await waitFor(async () => {
      if ((await hook(`h.query('[data-row="${row}"]')`)) !== 1) return null;
      await js(`document.querySelector('[data-row="${row}"]')`
        + `.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
      await sleep(120);
      return (await state()).tabs.at(-1).cursor === row ? true : null;
    }, 10000);
  };

  await step("find", "a row can be bookmarked and jumped back to", async () => {
    await clickRow(1);
    await hook("h.click('[data-find=\"bookmark\"]')");
    await waitFor(async () => (await hook("h.query('.diff-row.bookmarked')")) === 1, 6000);

    await clickRow(0);
    await hook("h.click('[data-find=\"nextBookmark\"]')");
    await waitFor(async () => (await state()).tabs.at(-1).cursor === 1, 6000);

    await clickRow(1);
    await hook("h.click('[data-find=\"bookmark\"]')");
    await waitFor(async () => (await hook("h.query('.diff-row.bookmarked')")) === 0, 6000);
    return "marked, jumped to, and cleared";
  });

  await step("find", "go to line moves the cursor there", async () => {
    await js(`(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const box = document.querySelector('[data-field="goToLine"]');
      setter.call(box, '3');
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`);
    await waitFor(async () => (await state()).tabs.at(-1).cursor === 2, 6000);
    return "line 3 is row 2";
  });

  await shot("04-compare");

  /* ----------------------------------------------- directory compare */

  await step("directory", "two trees compare with every status", async () => {
    const result = await hook(`h.open('directories', ${JSON.stringify([sample("tree", "left"), sample("tree", "right")])})`);
    const tab = result.tabs.at(-1);
    assert(tab.kind === "directory", `opened a ${tab.kind} tab`);
    assert(tab.same >= 1 && tab.different >= 1 && tab.leftOnly === 1 && tab.rightOnly === 1, JSON.stringify(tab));
    await waitFor(async () => (await hook("h.query('.tree-pair')")) > 1);
    return `same ${tab.same}, diff ${tab.different}, left ${tab.leftOnly}, right ${tab.rightOnly}`;
  });

  await step("directory", "each side is shown as a tree with its own path bar", async () => {
    assert((await hook("h.query('.tree-headers .path-bar')")) === 2, "two path bars");
    const left = await hook("h.attr('[data-path=\"left\"]', 'value')");
    const right = await hook("h.attr('[data-path=\"right\"]', 'value')");
    assert(left.endsWith("left"), `left path bar: ${left}`);
    assert(right.endsWith("right"), `right path bar: ${right}`);
    const pairs = await hook("h.query('.tree-pair')");
    const cells = await hook("h.query('.tree-pair .tree-cell')");
    assert(cells === pairs * 2, `${pairs} rows but ${cells} cells`);
    return `${pairs} aligned rows`;
  });

  await step("directory", "folders nest and can be expanded and collapsed", async () => {
    await hook("h.click('[data-command=\"tree.expandAll\"]')");
    await sleep(250);
    const expanded = await hook("h.query('.tree-pair')");
    assert((await hook("h.query('[data-entry=\"src/app.js\"]')")) === 1, "a nested file is listed when expanded");
    await hook("h.click('[data-command=\"tree.collapseAll\"]')");
    await sleep(250);
    const collapsed = await hook("h.query('.tree-pair')");
    assert(collapsed < expanded, `${expanded} expanded, ${collapsed} collapsed`);
    await hook("h.click('[data-command=\"tree.expandAll\"]')");
    await sleep(250);
    return `${collapsed} → ${expanded} rows`;
  });

  await step("directory", "a filter hides its rows", async () => {
    const before = await hook("h.query('.tree-pair')");
    await hook("h.click('[data-filter=\"same\"]')");
    await sleep(250);
    const after = await hook("h.query('.tree-pair')");
    await hook("h.click('[data-filter=\"same\"]')");
    await sleep(200);
    assert(after < before, `${before} rows before, ${after} after`);
    return `${before} → ${after}`;
  });

  await step("directory", "double-clicking a file opens it as a file comparison", async () => {
    await js(`document.querySelector('[data-entry="src/app.js"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    await waitFor(async () => (await state()).tabs.at(-1).kind === "compare", 8000);
    const tab = (await state()).tabs.at(-1);
    assert(tab.modified > 0, JSON.stringify(tab));
    return tab.title;
  });

  /** Answers a confirmation popup, in its own window, with Yes. */
  const confirmYes = async () => {
    const confirm = await findDialog("confirm", 10000);
    await waitFor(async () => confirm.js("document.querySelectorAll('[data-action=\"yes\"]').length > 0", 3000));
    await confirm.js("document.querySelector('[data-action=\"yes\"]').click()");
    return confirm;
  };

  const exists = (file) => fsp.access(file).then(() => true, () => false);

  await step("sync", "an entry can be copied from one side to the other", async () => {
    const outLeft = path.join(outDir, "sync", "left");
    const outRight = path.join(outDir, "sync", "right");
    await fsp.mkdir(outLeft, { recursive: true });
    await fsp.mkdir(outRight, { recursive: true });
    await fsp.writeFile(path.join(outLeft, "only.txt"), "from the left\n");
    await fsp.writeFile(path.join(outLeft, "both.txt"), "left version\n");
    await fsp.writeFile(path.join(outRight, "both.txt"), "right version\n");

    await hook(`h.open('directories', ${JSON.stringify([outLeft, outRight])})`);
    await waitFor(async () => (await state()).tabs.at(-1).kind === "directory");

    await js(`document.querySelector('[data-entry="only.txt"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
    await sleep(150);
    await hook("h.click('[data-command=\"dir.copyToRight\"]')");
    await waitFor(() => exists(path.join(outRight, "only.txt")), 10000);
    assert((await fsp.readFile(path.join(outRight, "only.txt"), "utf8")) === "from the left\n", "wrong content copied");
    return "only.txt copied to the right";
  });

  await step("sync", "copying makes a differing pair identical", async () => {
    const outRight = path.join(outDir, "sync", "right");
    await js(`document.querySelector('[data-entry="both.txt"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
    await sleep(150);
    await hook("h.click('[data-command=\"dir.copyToRight\"]')");
    await waitFor(async () => (await fsp.readFile(path.join(outRight, "both.txt"), "utf8")) === "left version\n", 10000);
    await waitFor(async () => (await state()).tabs.at(-1).different === 0, 10000);
    return "both.txt is now identical on each side";
  });

  await step("sync", "deleting asks first and then removes the entry", async () => {
    const outRight = path.join(outDir, "sync", "right");
    await js(`document.querySelector('[data-entry="only.txt"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
    await sleep(150);
    await hook("h.click('[data-command=\"dir.deleteRight\"]')");
    const confirm = await confirmYes();
    await waitFor(async () => !(await exists(path.join(outRight, "only.txt"))), 10000);
    await dialogGone(confirm, "confirm");
    return "the confirmation was its own window, and the file is gone";
  });

  await step("sync", "a folder sync previews what it would do before doing it", async () => {
    const left = path.join(outDir, "syncsession", "left");
    const right = path.join(outDir, "syncsession", "right");
    await fsp.mkdir(left, { recursive: true });
    await fsp.mkdir(right, { recursive: true });
    await fsp.writeFile(path.join(left, "new.txt"), "new\n");
    await fsp.writeFile(path.join(left, "both.txt"), "left wins\n");
    await fsp.writeFile(path.join(right, "both.txt"), "old\n");
    await fsp.writeFile(path.join(left, "same.txt"), "same\n");
    await fsp.writeFile(path.join(right, "same.txt"), "same\n");
    const future = new Date(Date.now() + 60_000);
    await fsp.utimes(path.join(left, "both.txt"), future, future);

    await hook(`h.open('sync', ${JSON.stringify([left, right])})`);
    await waitFor(async () => (await hook("h.query('.sync-bar')")) === 1, 10000);

    await hook("h.click('[data-command=\"sync.preview\"]')");
    await waitFor(async () => {
      const tab = (await state()).tabs.at(-1);
      return Boolean(tab.sync && tab.sync.plan);
    }, 10000);

    const plan = (await state()).tabs.at(-1).sync.plan;
    const byRel = Object.fromEntries(plan.actions.map((action) => [action.rel, action.operation]));
    assert(byRel["new.txt"] === "copyToRight", `new.txt planned as ${byRel["new.txt"]}`);
    assert(byRel["both.txt"] === "copyToRight", `both.txt planned as ${byRel["both.txt"]}`);
    assert(!("same.txt" in byRel), "an identical file was planned for copying");
    const before = await fsp.readFile(path.join(right, "both.txt"), "utf8");
    assert(before === "old\n", `the preview already wrote: ${JSON.stringify(before)}`);
    return `${plan.actions.length} planned, ${plan.skipped} left alone`;
  });

  await step("sync", "running the sync asks first and then carries out the plan", async () => {
    const right = path.join(outDir, "syncsession", "right");
    await hook("h.click('[data-command=\"sync.run\"]')");
    await confirmYes();
    await waitFor(async () => (await fsp.readFile(path.join(right, "both.txt"), "utf8")) === "left wins\n", 10000);
    await fsp.access(path.join(right, "new.txt"));
    return "both.txt updated and new.txt copied across";
  });

  await step("sync", "mirroring deletes what the other side does not have", async () => {
    const right = path.join(outDir, "syncsession", "right");
    await fsp.writeFile(path.join(right, "orphan.txt"), "orphan\n");

    await hook("h.run('view.refresh')");
    await sleep(400);
    await js(`(() => {
      const select = document.querySelector('[data-field="syncMode"]');
      select.value = 'mirrorToRight';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(async () => {
      const tab = (await state()).tabs.at(-1);
      return Boolean(tab.sync && tab.sync.plan && tab.sync.plan.mode === "mirrorToRight");
    }, 10000);

    const plan = (await state()).tabs.at(-1).sync.plan;
    const orphan = plan.actions.find((action) => action.rel === "orphan.txt");
    assert(orphan && orphan.operation === "deleteRight", `orphan.txt planned as ${JSON.stringify(orphan)}`);
    assert(orphan.reason === "orphan", `reason: ${orphan.reason}`);
    await fsp.rm(path.join(right, "orphan.txt"));
    return "a mirror plans the deletion, with its reason";
  });

  await shot("05-directory");

  await step("directory", "the pane title bars follow the theme", async () => {
    const read = () => js(`(() => {
      const bar = document.querySelector('.path-bar');
      const style = getComputedStyle(bar);
      const input = getComputedStyle(bar.querySelector('.path-input'));
      return { background: style.backgroundColor, color: style.color, field: input.backgroundColor };
    })()`);

    await hook("h.settings({ theme: 'classic-light' })");
    await sleep(300);
    const light = await read();
    await hook("h.settings({ theme: 'classic-dark' })");
    await sleep(300);
    const dark = await read();

    assert(light.background !== dark.background, `the title bar stayed ${light.background}`);
    assert(light.color !== dark.color, `the title bar's text stayed ${light.color}`);
    assert(light.field !== dark.field, `the path box stayed ${light.field}`);
    assert(contrast(toHex(dark.background), toHex(dark.color)) >= 4.5, `dark title bar: ${dark.background} on ${dark.color}`);
    assert(contrast(toHex(light.background), toHex(light.color)) >= 4.5, `light title bar: ${light.background} on ${light.color}`);

    await hook("h.settings({ theme: 'classic-light' })");
    await sleep(250);
    return `${light.background} / ${dark.background}`;
  });

  /* ------------------------------------------------------------ merge */

  await step("merge", "a 3-way merge opens with the expected conflicts", async () => {
    const files = [
      sample("merge", "base.txt"),
      sample("merge", "local.txt"),
      sample("merge", "remote.txt"),
      path.join(outDir, "merged.txt"),
    ];
    const result = await hook(`h.open('merge', ${JSON.stringify(files)})`);
    const tab = result.tabs.at(-1);
    assert(tab.kind === "merge", `opened a ${tab.kind} tab`);
    assert(tab.conflicts >= 1, `no conflicts: ${JSON.stringify(tab)}`);
    assert(tab.resolved === 0, "conflicts start unresolved");
    return `${tab.conflicts} conflicts`;
  });

  await step("merge", "the panes stay aligned line for line", async () => {
    const counts = await js(`(() => {
      const panes = [...document.querySelectorAll('.merge-pane')];
      return panes.map((pane) => pane.querySelectorAll('.merge-row').length);
    })()`);
    assert(counts.length >= 2, `only ${counts.length} panes`);
    assert(new Set(counts).size === 1, `pane row counts differ: ${counts.join(", ")}`);
    return `${counts.length} panes of ${counts[0]} rows`;
  });

  await step("merge", "the left panel opens each conflict out, with its sides", async () => {
    const cards = await hook("h.query('.panel-left .conflict-card')");
    const unresolved = await hook("h.query('.panel-left .conflict-card.unresolved')");
    assert(cards > 0, "no conflicts in the left panel");
    assert(unresolved === cards, "a conflict is already marked resolved");
    const opened = await js(`(() => {
      const card = document.querySelector('.panel-left .conflict-card');
      const sides = [...card.querySelectorAll('.conflict-side')];
      return {
        sides: sides.length,
        texts: sides.filter((side) => side.querySelector('.conflict-side-text').textContent.length > 0).length,
      };
    })()`);
    assert(opened.sides >= 2, `a conflict shows only ${opened.sides} sides`);
    assert(opened.texts >= 1, "the sides are shown without their text");
    return `${cards} conflicts, ${opened.sides} sides each`;
  });

  await step("merge", "a conflict is settled from the left panel", async () => {
    await hook("h.click('[data-resolve=\"0:local\"]')");
    await waitFor(async () => (await state()).tabs.at(-1).resolved === 1, 6000);
    assert((await hook("h.query('.panel-left .conflict-card.resolved')")) >= 1, "the card still reads unresolved");
    await hook("h.click('[data-resolve=\"0:unresolved\"]')");
    await waitFor(async () => (await state()).tabs.at(-1).resolved === 0, 6000);
    return "resolved from the panel, then undone";
  });

  await step("merge", "the right panel reports the state of the merge", async () => {
    const panel = await js(`(() => {
      const rows = [...document.querySelectorAll('.panel-right .property-row')];
      return {
        rows: rows.length,
        controls: document.querySelectorAll('.panel-right .panel-scroll input, .panel-right .panel-scroll select, .panel-right .panel-scroll button').length,
      };
    })()`);
    assert(panel.rows >= 6, `only ${panel.rows} rows of merge information`);
    assert(panel.controls === 0, `${panel.controls} controls in a read-only panel`);
    return `${panel.rows} rows, read-only`;
  });

  await step("merge", "Take Local resolves the selected conflict", async () => {
    await hook("h.command('merge.takeLocal')");
    await waitFor(async () => (await state()).tabs.at(-1).resolved === 1);
    assert((await hook("h.query('.merge-row.kind-resolved')")) > 0, "no resolved rows in the view");
    return "resolved as local";
  });

  await step("merge", "undo and redo reverse the resolution", async () => {
    await hook("h.undo()");
    await waitFor(async () => (await state()).tabs.at(-1).resolved === 0);
    assert((await state()).undo.canRedo === true, "redo is not available after an undo");
    await hook("h.redo()");
    await waitFor(async () => (await state()).tabs.at(-1).resolved === 1);
    return "undo then redo";
  });

  await step("merge", "the document is marked modified until it is saved", async () => {
    const before = await state();
    assert(before.dirty === true, "resolving did not mark the document modified");
    const title = await waitFor(async () => {
      const text = await nativeTitle();
      return /\*/.test(text) ? text : null;
    }, 6000).catch(async () => {
      throw new Error(`title does not show unsaved work: ${await nativeTitle()}`);
    });
    return title;
  });

  await step("merge", "resolving every conflict and saving writes the file", async () => {
    await hook("h.run('merge.resolveAllLocal')");
    await waitFor(async () => {
      const tab = (await state()).tabs.at(-1);
      return tab.resolved === tab.conflicts;
    });
    await hook("h.save()");
    await waitFor(async () => (await state()).tabs.at(-1).dirty === false, 8000);
    const written = await fsp.readFile(path.join(outDir, "merged.txt"), "utf8");
    assert(!written.includes("<<<<<<<"), "conflict markers were written to a fully resolved file");
    assert(written.includes("Hello"), `unexpected result:\n${written}`);
    return `${written.split("\n").length} lines written`;
  });

  await shot("06-merge");

  await step("merge", "a conflicted file opens from its markers", async () => {
    const result = await hook(`h.open('conflict', ${JSON.stringify([sample("conflict", "conflicted.txt")])})`);
    const tab = result.tabs.at(-1);
    assert(tab.kind === "merge", `opened a ${tab.kind} tab`);
    assert(tab.conflicts === 2, `expected 2 conflicts, got ${tab.conflicts}`);
    return `${tab.conflicts} conflicts`;
  });

  await step("merge", "Next conflict moves the selection", async () => {
    const before = (await state()).tabs.at(-1).selectedConflict;
    await hook("h.run('merge.nextConflict')");
    await sleep(200);
    const after = (await state()).tabs.at(-1).selectedConflict;
    assert(after !== before, `selection stayed at ${before}`);
    return `${before} → ${after}`;
  });

  /* ------------------------------------------------------------- tabs */

  await step("tabs", "each comparison opened its own tab", async () => {
    const tabs = (await state()).tabs;
    assert(tabs.length >= 6, `only ${tabs.length} tabs`);
    assert((await hook("h.query('.tab')")) === tabs.length, "the tab strip does not match the state");
    return `${tabs.length} tabs`;
  });

  await step("tabs", "overflow shows scroll buttons instead of a scrollbar", async () => {
    const before = await windowSize();
    await resizeWindow(1, before[1]);
    const overflowing = await js(
      "(() => { const s = document.querySelector('.tab-strip'); return s.scrollWidth > s.clientWidth + 2 })()",
    );
    const buttons = await hook("h.query('.tab-scroll')");
    const scrollbar = await js("getComputedStyle(document.querySelector('.tab-strip')).overflowX");
    await resizeWindow(before[0], before[1]);
    assert(scrollbar === "hidden", `the tab strip scrolls with a scrollbar (${scrollbar})`);
    if (overflowing) assert(buttons === 2, `${buttons} scroll buttons while overflowing`);
    return overflowing ? "overflowing, two scroll buttons" : "fits, no buttons needed";
  });

  await step("tabs", "a tab can be closed", async () => {
    const before = (await state()).tabs.length;
    await hook("h.closeTab()");
    await waitFor(async () => (await state()).tabs.length === before - 1);
    return `${before} → ${before - 1}`;
  });

  /* ---------------------------------------------------------- dialogs */

  await step("dialog", "each popup is its own window at its own size, and goes back to the pool", async () => {
    const report = [];
    for (const [name, command] of [["about", "help.about"], ["settings", "tools.settings"], ["guide", "help.guide"]]) {
      const spec = specs[name];
      assert(spec, `no spec for ${name} in src/dialogSpecs.ts`);
      const dialog = await openDialog(name, command);
      assert(dialog.target.id !== app.mainTarget.id, `${name} is drawn in the main window`);
      assert(!dialog.target.url.includes("#menu="), `${name} is in the menu window`);
      const size = await dialog.js("[window.innerWidth, window.innerHeight]");
      assert(near(size[0], spec.width), `${name} is ${size[0]}px wide, its spec says ${spec.width}`);
      if (spec.fixed || spec.resizable) assert(near(size[1], spec.height), `${name} is ${size[1]}px tall, its spec says ${spec.height}`);

      // Shown by the OS at that size, with a frame that resizes only when the spec says so.
      const windows = osWindows();
      let os = "";
      if (windows) {
        const shown = windows.find((item) => near(item.width, size[0], 4) && near(item.height, size[1], 4) && item.title !== "Menu");
        assert(shown, `no visible ${size[0]}x${size[1]} window (${windows.map((item) => `${item.width}x${item.height}`).join(", ")})`);
        assert(shown.resizable === Boolean(spec.resizable), `${name} resizable=${shown.resizable}, spec says ${Boolean(spec.resizable)}`);
        os = shown.resizable ? " resizable" : " fixed";
      }

      await dialog.js("window.mcm.closeDialog()");
      await dialogGone(dialog, name);
      // Back in the pool: the same window, hidden and emptied (or destroyed when the
      // pool was already full) — never left showing.
      const after = osWindows();
      if (after) {
        const still = after.find((item) => near(item.width, size[0], 4) && near(item.height, size[1], 4) && item.title !== "Menu");
        assert(!still, `${name}'s window is still showing after closing`);
      }
      const pooled = (await dialogTargets()).some((target) => target.id === dialog.target.id);
      report.push(`${name} ${size[0]}x${size[1]}${os}${pooled ? " → pool" : " → destroyed"}`);
      await sleep(150);
    }
    const count = (await dialogTargets()).length;
    assert(count <= 6, `${count} dialog windows exist: the pool is growing`);
    return `${report.join("; ")}; ${count} pooled windows`;
  });

  await step("dialog", "About names the author, the build and the runtime", async () => {
    const dialog = await openDialog("about", "help.about");
    const author = await dialog.js("document.querySelector('[data-testid=\"about-author\"]').textContent");
    assert(author.includes("SHKWON(knix008@naver.com)"), `author: ${author}`);
    const tabs = await dialog.js("document.querySelectorAll('.dialog-tabs .dialog-tab').length");
    assert(tabs === 0, `About still has ${tabs} tabs`);
    const build = await waitFor(async () => {
      const text = await dialog.js("document.body.innerText", 3000);
      return /Tauri \d/.test(text) && /WebView \d/.test(text) && /Node \d/.test(text) ? text : null;
    }, 6000).catch(async () => {
      throw new Error(`the runtime summary is incomplete: ${(await dialog.js("document.body.innerText")).replace(/\s+/g, " ").slice(0, 200)}`);
    });
    await shot("07-about", dialog.page);
    await dialog.js("document.querySelector('[data-action=\"close\"]').click()");
    await dialogGone(dialog, "about");
    const runtime = (build.match(/Tauri [\d.]+|WebView \d+|Node [\d.]+/g) || []).join(", ");
    return `${author.trim()}; ${runtime}`;
  });

  await step("dialog", "popups never scroll", async () => {
    for (const [name, command] of [["about", "help.about"], ["settings", "tools.settings"]]) {
      const dialog = await openDialog(name, command);
      await sleep(200);
      const scrolls = await dialog.js(
        "document.documentElement.scrollHeight > document.documentElement.clientHeight + 2"
        + " || document.documentElement.scrollWidth > document.documentElement.clientWidth + 2",
      );
      assert(!scrolls, `${name} needs to scroll`);
      await dialog.js("window.mcm.closeDialog()");
      await dialogGone(dialog, name);
    }
    return "about and settings fit without scrolling";
  });

  await step("dialog", "Settings is tabbed, one setting per line", async () => {
    const dialog = await openDialog("settings", "tools.settings");
    // The tab list grows (Start was added); the ones every build has must be there.
    const ids = await dialog.js("[...document.querySelectorAll('.dialog-tabs [data-tab]')].map((tab) => tab.dataset.tab)");
    for (const id of ["general", "appearance", "custom", "font", "compare", "git", "terminal", "prompt", "promptCustom"]) {
      assert(ids.includes(id), `no ${id} tab (${ids.join(", ")})`);
    }
    const tabs = ids.length;
    const perLine = await dialog.js(`(() => {
      const fields = [...document.querySelectorAll('.tab-panel .field')];
      const tops = fields.map((field) => Math.round(field.getBoundingClientRect().top));
      return { fields: fields.length, rows: new Set(tops).size };
    })()`);
    assert(perLine.fields > 0 && perLine.fields === perLine.rows, `${perLine.fields} fields on ${perLine.rows} rows`);
    await shot("08-settings", dialog.page);
    for (const [name, tab] of [["08b-settings-terminal", "terminal"], ["08c-settings-prompt", "prompt"], ["08d-settings-prompt-custom", "promptCustom"]]) {
      await dialog.js(`document.querySelector('[data-tab="${tab}"]').click()`);
      await sleep(300);
      await shot(name, dialog.page);
    }
    await dialog.js("document.querySelector('[data-tab=\"general\"]').click()");
    return `${tabs} tabs, ${perLine.fields} fields each on its own line`;
  });

  await step("dialog", "changing the theme in Settings repaints the main window", async () => {
    const dialog = await findDialog("settings");
    const before = await hook("h.cssVar('--bg')");
    await dialog.js("document.querySelector('[data-tab=\"appearance\"]').click()");
    await sleep(250);
    await dialog.js(`(() => {
      const select = document.querySelector('[data-field="theme"]');
      select.value = 'classic-dark';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(async () => (await state()).settings.theme === "classic-dark", 8000);
    const after = await hook("h.cssVar('--bg')");
    assert(before !== after, `the background did not change (${before})`);
    await hook("h.settings({ theme: 'classic-light' })");
    await sleep(250);
    return `${before} → ${after}`;
  });

  await step("dialog", "the Settings font tab lists the system fonts", async () => {
    const dialog = await findDialog("settings");
    await dialog.js("document.querySelector('[data-tab=\"font\"]').click()");
    const fonts = await waitFor(async () => {
      const count = await dialog.js("document.querySelectorAll('[data-field=\"fontFamily\"] option').length", 3000);
      return count > 3 ? count : null;
    }, 8000).catch(async () => {
      throw new Error(`only ${await dialog.js("document.querySelectorAll('[data-field=\"fontFamily\"] option').length")} fonts offered`);
    });
    const controls = await dialog.js(
      "['fontSize','fontWeight','fontStyle'].every((name) => document.querySelector('[data-field=\"' + name + '\"]'))",
    );
    assert(controls, "size, weight or style is missing");
    await dialog.js("window.mcm.closeDialog()");
    await dialogGone(dialog, "settings");
    return `${fonts} font families, with size, weight and style`;
  });

  await step("dialog", "the error popup shows the detail and can copy it", async () => {
    // The step copies to the real clipboard; whatever the user had there goes back.
    const saved = await js("window.mcm.readText()").catch(() => null);
    try {
      await js(`window.__mcmStore.report(new Error('smoke test failure detail'))`);
      const dialog = await findDialog("error", 10000);
      await waitFor(async () => dialog.js("document.querySelectorAll('[data-testid=\"error-detail\"]').length > 0", 3000));
      const detail = await dialog.js("document.querySelector('[data-testid=\"error-detail\"]').value");
      assert(detail.includes("smoke test failure detail"), `detail: ${detail}`);
      await dialog.js("document.querySelector('[data-action=\"copy\"]').click()");
      const copied = await waitFor(async () => {
        const text = await js("window.mcm.readText()", 3000);
        return text.includes("smoke test failure detail") ? text : null;
      }, 5000).catch(() => {
        throw new Error("the detail was not copied to the clipboard");
      });
      await shot("09-error", dialog.page);
      await dialog.js("window.mcm.closeDialog()");
      await dialogGone(dialog, "error");
      return `detail shown and copied (${copied.length} chars)`;
    } finally {
      if (typeof saved === "string") await js(`window.mcm.copyText(${JSON.stringify(saved)})`).catch(() => {});
    }
  });

  await step("dialog", "a long operation shows a progress popup", async () => {
    await hook("h.dialog('progress', { label: 'progress.comparingDirs' })");
    const dialog = await findDialog("progress", 10000);
    await waitFor(async () => dialog.js("document.querySelectorAll('[data-testid=\"progress-label\"]').length > 0", 3000));
    const label = await dialog.js("document.querySelector('[data-testid=\"progress-label\"]').textContent");
    assert(label && label.length > 2, `progress label: ${label}`);
    assert((await dialog.js("document.querySelectorAll('.progress-track').length")) === 1, "no progress bar");
    await hook("h.closeDialog('progress')");
    await dialogGone(dialog, "progress");
    return label;
  });

  await step("dialog", "closing with unsaved work offers save, discard or cancel", async () => {
    await hook("h.dialog('unsaved', {})");
    const dialog = await findDialog("unsaved", 10000);
    await waitFor(async () => dialog.js("document.querySelectorAll('[data-action=\"save\"]').length > 0", 3000));
    const actions = await dialog.js("[...document.querySelectorAll('[data-action]')].map((b) => b.dataset.action)");
    for (const action of ["cancel", "discard", "save"]) {
      assert(actions.includes(action), `no ${action} button: ${actions.join(", ")}`);
    }
    await hook("h.closeDialog('unsaved')");
    await dialogGone(dialog, "unsaved");
    return actions.join(", ");
  });

  await step("dialog", "F1 opens the user's guide with its contents", async () => {
    await hook("h.key({ key: 'F1' })");
    const dialog = await findDialog("guide", 10000);
    const guide = await waitFor(async () => {
      const found = await dialog.js(`({
        nav: document.querySelectorAll('.guide-nav a, .guide-nav button, .guide-nav li').length,
        text: (document.querySelector('.guide-main')?.innerText || '').length,
      })`, 3000);
      return found.nav > 3 && found.text > 200 ? found : null;
    }, 8000);
    await shot("09b-guide", dialog.page);
    await dialog.js("window.mcm.closeDialog()");
    await dialogGone(dialog, "guide");
    return `${guide.nav} contents entries, ${guide.text} characters`;
  });

  /* --------------------------------------------------------- tutorial */

  await step("tutorial", "Help › Tutorial starts the tour, which steps and can be skipped", async () => {
    await hook("h.run('help.tutorial')");
    await waitFor(async () => (await hook("h.query('[data-testid=\"tour\"]')")) === 1, 8000);
    const first = await js(`({
      step: document.querySelector('[data-testid="tour"]').dataset.step,
      count: document.querySelector('[data-testid="tour-count"]').textContent.trim(),
    })`);
    await hook("h.click('[data-tour-action=\"next\"]')");
    await waitFor(async () => (await js(`document.querySelector('[data-testid="tour"]')?.dataset.step`)) !== first.step, 6000);
    const second = await js(`document.querySelector('[data-testid="tour-count"]').textContent.trim()`);
    await shot("09c-tutorial");
    await hook("h.click('[data-tour-action=\"skip\"]')");
    await waitFor(async () => (await hook("h.query('[data-testid=\"tour\"]')")) === 0, 6000);
    return `${first.count} → ${second}, then skipped`;
  });

  /* ----------------------------------------------------------- labels */

  await step("labels", "nothing wraps onto a second line, at any width", async () => {
    const selectors = [
      ".property-label", ".property-value", ".panel-section h3", ".panel-title span",
      ".panel-button > span", ".chip > span", ".tab-label", ".tree-label",
      ".status-cell", ".menubar-item span", ".start-tile > b",
    ];
    const before = await windowSize();
    const [minWidth] = await minimumSize();
    const offenders = [];
    for (const width of [minWidth, Math.max(minWidth + 420, 1400)]) {
      const [actual] = await resizeWindow(width, before[1]);
      for (const selector of selectors) {
        const wrapped = await hook(`h.wrapped(${JSON.stringify(selector)})`);
        for (const item of wrapped) offenders.push(`${actual}px ${selector} "${item.text}" (${item.height}px)`);
      }
    }
    await resizeWindow(before[0], before[1]);
    assert(offenders.length === 0, offenders.slice(0, 6).join(" | "));
    return `${selectors.length} kinds of label, at two widths, all on one line`;
  });

  await step("labels", "dialog labels stay on one line too", async () => {
    const dialog = await openDialog("settings", "tools.settings");
    const offenders = [];
    // Every tab, the prompt editor included: its rows carry the long wording in a
    // tooltip exactly so that no label has to wrap.
    const tabs = await dialog.js("[...document.querySelectorAll('.dialog-tabs [data-tab]')].map((tab) => tab.dataset.tab)");
    assert(tabs.length >= 9, `only ${tabs.length} tabs`);
    for (const tab of tabs) {
      await dialog.js(`document.querySelector('[data-tab="${tab}"]').click()`);
      await sleep(200);
      const wrapped = await dialog.js(`(() => {
        return ['.field-label', '.dialog-tab > span', '.dialog-button span']
          .flatMap((selector) => [...document.querySelectorAll(selector)]
            .filter((element) => {
              const box = element.getBoundingClientRect();
              if (box.height === 0) return false;
              const style = getComputedStyle(element);
              const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
              return box.height > line * 1.6;
            })
            .map((element) => selector + ' "' + element.textContent.trim().slice(0, 30) + '"'));
      })()`);
      for (const item of wrapped) offenders.push(`${tab}: ${item}`);
    }
    await dialog.js("window.mcm.closeDialog()");
    await dialogGone(dialog, "settings");
    assert(offenders.length === 0, offenders.slice(0, 6).join(" | "));
    return `${tabs.length} tabs, no wrapped label`;
  });

  /* ------------------------------------------------------ the chrome */

  await step("chrome", "the window draws its own title bar, icon and controls", async () => {
    const bar = await js(`(() => {
      const brand = document.querySelector('.menubar-brand');
      const icon = brand ? brand.querySelector('img.brand-icon') : null;
      const controls = [...document.querySelectorAll('.window-controls .window-button')];
      return {
        title: brand ? brand.textContent.trim() : '',
        icon: icon ? { width: icon.getBoundingClientRect().width } : null,
        controls: controls.map((button) => button.dataset.window || ''),
        drag: getComputedStyle(document.querySelector('.menubar')).webkitAppRegion,
      };
    })()`);
    assert(bar.icon, "the title bar has no program icon");
    assert(bar.icon.width > 8, `the icon is ${bar.icon.width}px`);
    assert(bar.title.includes("My Compare Master"), `the title reads "${bar.title}"`);
    assert(bar.controls.join("/") === "minimize/maximize/close", `window buttons: ${bar.controls.join("/")}`);
    assert(bar.drag === "drag", `the title bar is not marked as a drag region (${bar.drag})`);
    return `${bar.title}, ${bar.controls.join("/")}`;
  });

  await step("chrome", "maximise and restore work from the title bar", async () => {
    if (await js("window.mcm.isMaximized()")) await js("window.mcm.toggleMaximizeWindow()");
    await sleep(250);
    const label = () => js(`document.querySelector('.window-button[data-window="maximize"]').title`);
    const before = await label();
    const normal = await windowSize();

    await js(`document.querySelector('.window-button[data-window="maximize"]').click()`);
    await waitFor(async () => js("window.mcm.isMaximized()"), 6000);
    await waitFor(async () => (await label()) !== before, 4000).catch(() => {});
    const maximized = await label();
    const big = await windowSize();
    assert(maximized !== before, `the button still reads "${before}"`);

    await js(`document.querySelector('.window-button[data-window="maximize"]').click()`);
    await waitFor(async () => !(await js("window.mcm.isMaximized()")), 6000);
    await waitFor(async () => (await label()) === before, 4000).catch(() => {});
    assert((await label()) === before, "the button did not go back to maximise");
    return `${normal[0]}x${normal[1]} → ${big[0]}x${big[1]} ("${maximized}") → back`;
  });

  await step("chrome", "the toolbar has the same gap at both ends", async () => {
    const edges = await js(`(() => {
      const toolbar = document.querySelector('.toolbar');
      const box = toolbar.getBoundingClientRect();
      const children = [...toolbar.children].filter((child) => child.getBoundingClientRect().width > 0);
      const first = children[0].getBoundingClientRect();
      const last = children[children.length - 1].getBoundingClientRect();
      return { left: first.left - box.left, right: box.right - last.right };
    })()`);
    assert(Math.abs(edges.left - edges.right) <= 1, `left gap ${edges.left}px, right gap ${edges.right}px`);
    return `${Math.round(edges.left)}px at both ends`;
  });

  await step("chrome", "the font size and zoom steppers step up and down", async () => {
    const before = (await state()).settings;
    // One press at a time: a stepper steps from the value it is showing.
    const press = async (group, which, settled) => {
      await js(`document.querySelector('.${group} [data-step="${which}"]').click()`);
      await waitFor(async () => settled(await state()), 6000);
    };
    await press("font-group", "paneFontSize:up", (s) => s.settings.font.size === before.font.size + 1);
    await press("font-group", "paneFontSize:down", (s) => s.settings.font.size === before.font.size);
    await press("zoom-group", "zoom:up", (s) => s.settings.zoom > before.zoom);
    await press("zoom-group", "zoom:down", (s) => s.settings.zoom === before.zoom);
    return `font ${before.font.size}px and zoom ${before.zoom}% both stepped, then restored`;
  });

  await step("chrome", "the language button is a flag that toggles", async () => {
    const flag = await js(`Boolean(document.querySelector('[data-command="toolbar.language"] svg.flag'))`);
    assert(flag, "the language button is not showing a flag");
    const before = (await state()).settings.language;
    await js(`document.querySelector('[data-command="toolbar.language"]').click()`);
    await waitFor(async () => (await state()).settings.language !== before, 6000);
    const after = (await state()).settings.language;
    await js(`document.querySelector('[data-command="toolbar.language"]').click()`);
    await waitFor(async () => (await state()).settings.language === before, 6000);
    return `${before} to ${after} and back, drawn as a flag`;
  });

  await step("chrome", "the panel buttons close and reopen the two panels", async () => {
    await openMergeTab();
    for (const [command, selector] of [["view.leftPanel", ".panel-left"], ["view.rightPanel", ".panel-right"]]) {
      await hook(`h.run(${JSON.stringify(command)})`);
      await waitFor(async () => (await hook(`h.query(${JSON.stringify(selector)})`)) === 0, 6000);
      await hook(`h.run(${JSON.stringify(command)})`);
      await waitFor(async () => (await hook(`h.query(${JSON.stringify(selector)})`)) === 1, 6000);
    }
    return "both panels close and reopen";
  });

  await step("chrome", "the panels start equal and the splitters resize them", async () => {
    await openMergeTab();
    await hook("h.settings({ leftPanelWidth: 252, rightPanelWidth: 252 })");
    await sleep(300);
    const equal = await js(`(() => ({
      left: Math.round(document.querySelector('.panel-left').getBoundingClientRect().width),
      right: Math.round(document.querySelector('.panel-right').getBoundingClientRect().width),
    }))()`);
    assert(equal.left === equal.right, `the panels are ${equal.left}px and ${equal.right}px`);
    const splitters = await hook("h.query('.body .splitter')");
    assert(splitters === 2, `${splitters} splitters, expected one per side panel`);
    await js(`(() => {
      const splitter = document.querySelector('[data-splitter="left"]');
      splitter.setPointerCapture = () => {};
      splitter.releasePointerCapture = () => {};
      const box = splitter.getBoundingClientRect();
      const at = (type, x) => splitter.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: 1, clientX: x, clientY: box.top + box.height / 2,
      }));
      at('pointerdown', box.left + 2);
      at('pointermove', box.left + 62);
      at('pointerup', box.left + 62);
    })()`);
    await waitFor(async () => (await state()).settings.leftPanelWidth > 290, 6000);
    const widened = (await state()).settings.leftPanelWidth;
    await hook("h.settings({ leftPanelWidth: 252, rightPanelWidth: 252 })");
    await sleep(250);
    return `both ${equal.left}px, dragged to ${widened}px`;
  });

  await step("chrome", "the side panels follow the session", async () => {
    await openMergeTab();
    const read = () => js(`(() => ({
      conflicts: document.querySelectorAll('.panel-left .conflict-card').length,
      sessions: document.querySelectorAll('.panel-left [data-session-type]').length,
      right: document.querySelectorAll('.panel-right').length,
    }))()`);
    let panels = await read();
    assert(panels.conflicts > 0, "a merge is not showing its conflicts");
    assert(panels.sessions === 0, "a merge is showing the session list");
    assert(panels.right === 1, "a merge has no right panel");

    await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
    await waitFor(async () => (await state()).tabs.at(-1).kind === "compare", 8000);
    await sleep(300);
    panels = await read();
    assert(panels.sessions > 0, "a comparison is not showing the session list");
    assert(panels.conflicts === 0, "a comparison is showing conflicts");
    assert(panels.right === 0, "a comparison has a right panel");
    return "conflicts on a merge, sessions elsewhere";
  });

  await step("merge", "both merge panels collapse to a rail and come back", async () => {
    await openMergeTab();
    await hook("h.settings({ showLeftPanel: true, showRightPanel: true })");
    await waitFor(async () => (await state()).settings.showRightPanel === true, 6000);

    const rails = async () => js(`(() => {
      const body = document.querySelector('.body').getBoundingClientRect();
      return [...document.querySelectorAll('.panel-rail')].map((rail) => {
        const box = rail.getBoundingClientRect();
        return {
          width: Math.round(box.width),
          label: rail.textContent.trim(),
          side: box.left - body.left < body.right - box.right ? "left" : "right",
        };
      });
    })()`);

    await hook(`h.click('.panel-right [data-command="panel.collapseRight"]')`);
    await waitFor(async () => (await state()).settings.showRightPanel === false, 6000);
    let listed = await rails();
    assert(listed.length === 1, `${listed.length} rails with only the right panel closed`);
    assert(listed[0].side === "right", "the right panel left its rail on the left");
    assert(listed[0].width > 0 && listed[0].width < 40, `the rail is ${listed[0].width}px wide`);
    assert(listed[0].label.length > 0, "the rail does not say which panel it reopens");

    await hook(`h.click('.panel-left [data-command="panel.collapse"]')`);
    await waitFor(async () => (await state()).settings.showLeftPanel === false, 6000);
    listed = await rails();
    assert(listed.length === 2, `${listed.length} rails with both panels closed`);
    assert(listed[0].side === "left" && listed[1].side === "right", "the two rails are on the same edge");

    await hook(`h.click('.panel-rail.right')`);
    await waitFor(async () => (await state()).settings.showRightPanel === true, 6000);
    await hook(`h.click('.panel-rail:not(.right)')`);
    await waitFor(async () => (await state()).settings.showLeftPanel === true, 6000);
    const back = await js(`(() => ({
      left: document.querySelectorAll('.panel-left').length,
      right: document.querySelectorAll('.panel-right').length,
      rails: document.querySelectorAll('.panel-rail').length,
    }))()`);
    assert(back.left === 1 && back.right === 1 && back.rails === 0, JSON.stringify(back));

    await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
    await waitFor(async () => (await state()).tabs.at(-1).kind === "compare", 8000);
    return "both closed to their own edge and reopened from the rail";
  });

  await step("chrome", "a session can be saved and reopened from the panel", async () => {
    await hook("h.click('.panel-left [data-command=\"session.save\"]')");
    await waitFor(async () => ((await state()).settings.sessions ?? []).length > 0, 6000);
    const saved = (await state()).settings.sessions[0];
    assert(saved.kind === "text-compare", `saved as ${saved.kind}`);
    assert(saved.paths.length === 2, `saved ${saved.paths.length} paths`);
    const listed = await js(`document.querySelectorAll('.panel-left [data-session]').length`);
    assert(listed === 1, "the saved session is not in the list");
    await hook("h.settings({ sessions: [] })");
    await waitFor(async () => ((await state()).settings.sessions ?? []).length === 0, 6000);
    return `saved "${saved.name}" as ${saved.kind}`;
  });

  await step("chrome", "the log panel opens across the whole window", async () => {
    await hook("h.settings({ showLogPanel: false, showTerminalPanel: false })");
    await waitFor(async () => (await hook("h.query('.bottom-panel')")) === 0, 6000);
    await hook("h.run('view.logPanel')");
    await waitFor(async () => (await hook("h.query('.bottom-panel')")) === 1, 6000);
    const box = await waitFor(async () => {
      const found = await js(`(() => {
        const log = document.querySelector('.bottom-panel').getBoundingClientRect();
        const shell = document.querySelector('.shell').getBoundingClientRect();
        const rows = document.querySelectorAll('.log-row').length;
        return { log: Math.round(log.width), shell: Math.round(shell.width), rows };
      })()`);
      return found.rows > 0 ? found : null;
    }, 6000).catch(() => {
      throw new Error("the log recorded nothing");
    });
    assert(box.log === box.shell, `the log is ${box.log}px of a ${box.shell}px window`);
    await hook("h.run('view.logPanel')");
    await waitFor(async () => (await hook("h.query('.bottom-panel')")) === 0, 6000);
    return `${box.log}px wide, ${box.rows} entries`;
  });

  await step("chrome", "the terminal panel runs a command and draws its prompt", async () => {
    await hook("h.run('view.terminalPanel')");
    await waitFor(async () => (await hook("h.query('.term-view')")) === 1, 20000);
    await waitFor(async () => (await hook("h.query('.term-prompt')")) > 0, 20000);
    const marker = `mcm-smoke-${Date.now()}`;
    await js(`(() => {
      const input = document.querySelector('.term-out input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'echo ${marker}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    })()`);
    await waitFor(async () => js(`document.querySelector('.term-out').textContent.split('${marker}').length > 2`), 25000);
    const prompts = await hook("h.query('.term-prompt')");
    await shot("12-terminal");
    await hook("h.run('view.terminalPanel')");
    await waitFor(async () => (await hook("h.query('.bottom-panel')")) === 0, 6000);
    return `the command echoed back, ${prompts} prompts drawn`;
  });

  await step("chrome", "the resize grip is drawn in the corner and resizes the window", async () => {
    const grip = await js(`(() => {
      const element = document.querySelector('[data-testid="resize-grip"]');
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        svg: Boolean(element.querySelector('svg')),
        cursor: getComputedStyle(element).cursor,
        fromRight: window.innerWidth - box.right,
        fromBottom: window.innerHeight - box.bottom,
      };
    })()`);
    assert(grip, "there is no resize grip");
    assert(grip.svg, "the grip draws nothing");
    assert(grip.cursor === "nwse-resize", `the grip's cursor is ${grip.cursor}`);
    assert(grip.fromRight < 12 && grip.fromBottom < 12,
      `the grip sits ${grip.fromRight}px from the right and ${grip.fromBottom}px from the bottom`);

    const before = await windowSize();
    await js(`(() => {
      const grip = document.querySelector('[data-testid="resize-grip"]');
      grip.setPointerCapture = () => {};
      grip.releasePointerCapture = () => {};
      const at = (type, dx, dy) => grip.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: 1, screenX: 500 + dx, screenY: 500 + dy,
      }));
      at('pointerdown', 0, 0);
      at('pointermove', 70, 50);
      at('pointerup', 70, 50);
    })()`);
    await waitFor(async () => (await windowSize())[0] > before[0] + 40, 6000);
    const after = await windowSize();
    await resizeWindow(before[0], before[1]);
    return `${before[0]}x${before[1]} dragged to ${after[0]}x${after[1]}`;
  });

  await shot("12-chrome");

  /* ------------------------------------------------------------ print */

  await step("print", "the preview paginates and can be stepped through", async () => {
    await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
    await sleep(300);
    const dialog = await openDialog("print", "file.print");
    await waitFor(async () => dialog.js("document.querySelectorAll('.print-sheet').length > 0", 3000), 15000);
    const page = await dialog.js("document.querySelector('[data-testid=\"print-page\"]').textContent");
    assert(/\d+\s*\/\s*\d+|Page \d+ of \d+/.test(page), `page indicator: ${page}`);
    const rows = await dialog.js("document.querySelectorAll('.print-sheet .sheet-row').length");
    assert(rows > 0, "the preview page is empty");
    await shot("10-print", dialog.page);
    return `${page.trim()}, ${rows} rows on the page`;
  });

  await step("print", "the preview settles at the size that fits, and stays there", async () => {
    const dialog = await findDialog("print");
    const measure = () => dialog.js(`(() => {
      const frame = document.querySelector('.print-preview-frame');
      const sheet = document.querySelector('.print-sheet');
      const box = sheet.getBoundingClientRect();
      const available = frame.getBoundingClientRect();
      return {
        scale: Number((sheet.style.transform.match(/[\\d.]+/) || [0])[0]),
        fill: Math.round(100 * Math.max(box.width / available.width, box.height / available.height)),
        overflows: box.width > available.width + 1 || box.height > available.height + 1,
      };
    })()`);
    const first = await measure();
    await sleep(900);
    const second = await measure();
    assert(Math.abs(first.scale - second.scale) < 0.001, `the preview is still resizing itself: ${first.scale} → ${second.scale}`);
    assert(!second.overflows, "the page is larger than the space the preview has");
    assert(second.fill >= 80, `the page uses only ${second.fill}% of the preview area`);
    return `scale ${second.scale.toFixed(2)}, filling ${second.fill}% of the frame`;
  });

  await step("print", "page setup re-paginates the preview", async () => {
    const dialog = await findDialog("print");
    const before = await dialog.js("document.querySelector('.print-sheet').style.width");
    await dialog.js(`(() => {
      const select = document.querySelector('[data-field="orientation"]');
      select.value = 'landscape';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const after = await waitFor(async () => {
      const width = await dialog.js("document.querySelector('.print-sheet').style.width", 3000);
      return width !== before ? width : null;
    }, 5000).catch(() => {
      throw new Error(`the sheet size did not change (${before})`);
    });
    return `${before} → ${after}`;
  });

  await step("print", "the range offers all, current and a custom list", async () => {
    const dialog = await findDialog("print");
    const options = await dialog.js("[...document.querySelectorAll('[data-field=\"range\"] option')].map((o) => o.value)");
    assert(options.join(",") === "all,current,custom", `range options: ${options.join(",")}`);
    await dialog.js(`(() => {
      const select = document.querySelector('[data-field="range"]');
      select.value = 'custom';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const enabled = await waitFor(
      async () => dialog.js("!document.querySelector('[data-field=\"customRange\"]').disabled", 3000),
      4000,
    ).catch(() => false);
    assert(enabled, "the custom range box stays disabled");
    await dialog.js("window.mcm.closeDialog()");
    await dialogGone(dialog, "print");
    return options.join(", ");
  });

  /* ----------------------------------------------------------- themes */

  await step("theme", "every theme applies and stays readable", async () => {
    const themes = await hook("h.themes()");
    assert(themes.length === 40, `${themes.length} themes, expected 20 light and 20 dark`);
    const unreadable = [];
    const seen = new Set();
    for (const id of themes) {
      await hook(`h.settings({ theme: ${JSON.stringify(id)} })`);
      await waitFor(async () => (await state()).settings.theme === id, 6000);
      const panel = await hook("h.cssVar('--panel')");
      const text = await hook("h.cssVar('--text')");
      const background = await hook("h.cssVar('--bg')");
      seen.add(background);
      const value = contrast(panel, text);
      if (!(value >= 4.5)) unreadable.push(`${id} ${Number.isFinite(value) ? value.toFixed(2) : panel + "/" + text}`);
    }
    await hook("h.settings({ theme: 'classic-light' })");
    await sleep(250);
    assert(unreadable.length === 0, `too little contrast: ${unreadable.join(", ")}`);
    assert(seen.size >= 20, `only ${seen.size} distinct backgrounds across ${themes.length} themes`);
    return `${themes.length} themes, ${seen.size} distinct backgrounds, all at least 4.5:1`;
  });

  await step("theme", "the toolbar button alternates light and dark, at random", async () => {
    await hook("h.settings({ theme: 'ocean-light' })");
    await waitFor(async () => (await state()).settings.theme === "ocean-light");
    const seen = [];
    let expected = "dark";
    for (let press = 0; press < 6; press++) {
      await hook("h.run('view.themeToggle')");
      await waitFor(async () => (await state()).settings.theme.endsWith(expected), 6000);
      const id = (await state()).settings.theme;
      seen.push(id);
      expected = expected === "dark" ? "light" : "dark";
    }
    const families = new Set(seen.map((id) => id.slice(0, id.lastIndexOf("-"))));
    assert(families.size > 1, `six presses only ever chose ${[...families].join(", ")}`);
    await hook("h.settings({ theme: 'classic-light' })");
    await sleep(250);
    return `${seen.length} presses, ${families.size} families`;
  });

  await step("theme", "the toolbar button shows the theme's own colours", async () => {
    const chips = await js(`(() => {
      const swatches = [...document.querySelectorAll('.theme-chips > span')];
      return swatches.map((chip) => getComputedStyle(chip).backgroundColor);
    })()`);
    assert(chips.length >= 3, `${chips.length} chips on the theme button`);
    assert(new Set(chips).size > 1, `all the chips are ${chips[0]}`);
    return `${chips.length} chips: ${[...new Set(chips)].join(" ")}`;
  });

  await step("theme", "a custom theme is applied from its four colours", async () => {
    await hook(`h.settings({ theme: 'custom', customTheme: { kind: 'dark', bg: '#101820', panel: '#18222c', text: '#eaf2fa', accent: '#4f9ad8' } })`);
    await waitFor(async () => (await state()).settings.theme === "custom", 6000);
    const applied = {
      bg: await hook("h.cssVar('--bg')"),
      panel: await hook("h.cssVar('--panel')"),
      text: await hook("h.cssVar('--text')"),
    };
    assert(applied.bg.toLowerCase() === "#101820", `--bg is ${applied.bg}`);
    assert(contrast(applied.panel, applied.text) >= 4.5, "the custom theme is not readable");
    await hook("h.settings({ theme: 'classic-light' })");
    await sleep(250);
    return `custom ${applied.bg}, contrast ${contrast(applied.panel, applied.text).toFixed(2)}:1`;
  });

  /* --------------------------------------------------------- language */

  await step("language", "switching to English retranslates the interface", async () => {
    const koreanMenu = await hook("h.text('.menubar-item[data-menu=\"file\"]')");
    await hook("h.settings({ language: 'en' })");
    await waitFor(async () => (await state()).settings.language === "en");
    const englishMenu = await waitFor(async () => {
      const text = await hook("h.text('.menubar-item[data-menu=\"file\"]')");
      return text !== koreanMenu ? text : null;
    }, 4000).catch(() => koreanMenu);
    await hook("h.settings({ language: 'ko' })");
    await waitFor(async () => (await state()).settings.language === "ko");
    assert(koreanMenu === "파일", `Korean menu read "${koreanMenu}"`);
    assert(englishMenu === "File", `English menu read "${englishMenu}"`);
    return `${koreanMenu} ↔ ${englishMenu}`;
  });

  /* ----------------------------------------------------------- recent */

  await step("recent", "opening files records them, newest first, capped at ten", async () => {
    const settings = (await state()).settings;
    assert(settings.recent.length > 0, "nothing was recorded");
    assert(settings.recent.length <= 10, `${settings.recent.length} entries`);
    assert(settings.recentDirectories.length > 0, "no directories remembered");
    return `${settings.recent.length} entries, ${settings.recentDirectories.length} folders`;
  });

  await step("recent", "the File menu lists the recent entries", async () => {
    await hook("h.openMenu('file')");
    const popup = await waitMenu("file");
    const rows = await popup.evaluate("document.querySelectorAll('.menu-row[data-command^=\"recent:\"]').length");
    await closeMenu();
    assert(rows > 0, "no recent rows in the File menu");
    return `${rows} recent entries`;
  });

  await step("recent", "one entry can be removed and the list cleared, from the panel", async () => {
    // The session panel is the left panel of every tab but a merge.
    if ((await state()).tabs.at(-1)?.kind === "merge" || !(await hook("h.query('.panel-left [data-recent]')"))) {
      await hook(`h.open('files', ${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
    }
    await hook("h.settings({ showLeftPanel: true })");
    await waitFor(async () => (await hook("h.query('.panel-left [data-recent]')")) > 0, 6000);

    const before = (await state()).settings.recent;
    assert(before.length > 1, `only ${before.length} recent entries to work with`);
    const rows = await js("document.querySelectorAll('.panel-left [data-recent]').length");
    assert(rows === before.length, `${before.length} entries but ${rows} rows in the panel`);

    const removed = before[0];
    await hook(`h.click('.panel-left [data-recent-remove="0"]')`);
    await waitFor(async () => (await state()).settings.recent.length === before.length - 1, 8000);
    const left = (await state()).settings.recent;
    assert(
      !left.some((entry) => entry.paths.join("|") === removed.paths.join("|")),
      "the remove button took a different entry than the one it was on",
    );

    await hook(`h.click('.panel-left [data-command="recent.clear"]')`);
    await waitFor(async () => (await state()).settings.recent.length === 0, 8000);
    const empty = await waitFor(async () => {
      const found = await js(`(() => ({
        rows: document.querySelectorAll('.panel-left [data-recent]').length,
        clearDisabled: document.querySelector('.panel-left [data-command="recent.clear"]').disabled,
      }))()`);
      return found.rows === 0 ? found : null;
    }, 4000).catch(() => ({ rows: -1, clearDisabled: false }));
    assert(empty.rows === 0, "rows survived clearing the list");
    assert(empty.clearDisabled, "Clear stays live with an empty list");
    return `${before.length} → ${before.length - 1} → 0`;
  });

  /* ------------------------------------------------------ drag & drop */

  await step("dnd", "dropping two files opens them as a comparison", async () => {
    const result = await hook(`h.drop(${JSON.stringify([sample("files", "left.txt"), sample("files", "right.txt")])})`);
    const tab = result.tabs.at(-1);
    assert(tab.kind === "compare", `a drop opened a ${tab.kind} tab`);
    return tab.title;
  });

  await step("dnd", "dropping two folders opens a directory comparison", async () => {
    const result = await hook(`h.drop(${JSON.stringify([sample("tree", "left"), sample("tree", "right")])})`);
    const tab = result.tabs.at(-1);
    assert(tab.kind === "directory", `a folder drop opened a ${tab.kind} tab`);
    return tab.title;
  });

  /* -------------------------------------------------------- shortcuts */

  await step("keyboard", "shortcuts reach their commands", async () => {
    const before = (await state()).settings.zoom;
    await hook("h.key({ key: '+', ctrlKey: true })");
    await waitFor(async () => (await state()).settings.zoom > before, 5000);
    await hook("h.key({ key: '-', ctrlKey: true })");
    await waitFor(async () => (await state()).settings.zoom === before, 5000);
    return `Ctrl++ / Ctrl+- around ${before}%`;
  });

  /* -------------------------------------------------------- settings */

  await step("persist", "settings are written to disk and read back", async () => {
    await hook("h.settings({ theme: 'nord-dark', zoom: 120 })");
    await waitFor(async () => (await state()).settings.theme === "nord-dark");
    const file = path.join(app.settingsDir, "settings.json");
    const reported = (await state()).settings.settingsPath;
    assert(!reported || path.resolve(reported) === path.resolve(file), `the app reports ${reported}, not ${file}`);
    const saved = await waitFor(async () => {
      const data = JSON.parse(await fsp.readFile(file, "utf8"));
      return data.theme === "nord-dark" && data.zoom === 120 ? data : null;
    }, 5000).catch(async () => {
      const data = JSON.parse(await fsp.readFile(file, "utf8"));
      throw new Error(JSON.stringify({ theme: data.theme, zoom: data.zoom }));
    });
    await hook("h.settings({ theme: 'classic-light', zoom: 100 })");
    return `${file} (showTutorial ${saved.showTutorial})`;
  });

  await shot("11-final");

  /* -------------------------------------------------------- shutdown */

  await step("shutdown", "quitting closes every window, the popups and the core", async () => {
    const dialog = await openDialog("about", "help.about");
    const before = (await listTargets(app.cdpPort)).length;
    assert(before >= 3, `only ${before} windows before quitting`);
    void dialog;
    await js("window.mcm.quit()", 5000).catch(() => {});
    const code = await Promise.race([app.exited, sleep(15000).then(() => "timeout")]);
    assert(code !== "timeout", "the app was still running 15 s after quitting");
    assert(code === 0, `the app exited with ${code}`);
    const answers = async (port) => {
      try {
        await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
        return true;
      } catch {
        return false;
      }
    };
    await waitFor(async () => !(await answers(app.corePort)), 6000).catch(() => {
      throw new Error(`the core on port ${app.corePort} outlived the app`);
    });
    // The WebView's browser process outlives the exe by a moment while debugging
    // clients are attached (measured: answering at +10 ms, gone well within 2 s), so it
    // gets the same grace as the core rather than one look straight after the exit.
    await waitFor(async () => !(await answers(app.cdpPort)), 6000).catch(() => {
      throw new Error("the WebView is still serving after the app quit");
    });
    return `${before} windows, exit code 0, core stopped`;
  });
}

/* ------------------------------------------------------------- report */

export function printReport(report) {
  const byCategory = new Map();
  for (const result of report.results) {
    if (!byCategory.has(result.category)) byCategory.set(result.category, []);
    byCategory.get(result.category).push(result);
  }

  console.log(`\n${bold(magenta("═══ GUI test (Tauri) ═══"))}`);
  for (const [category, items] of byCategory) {
    const passed = items.filter((item) => item.ok).length;
    console.log(`\n${bold(passed === items.length ? magenta(`[${category}]`) : red(`[${category}]`))} ${ratio(passed, items.length)}`);
    for (const item of items) {
      const detail = item.detail ? ` — ${item.detail.split("\n")[0].slice(0, 110)}` : "";
      console.log(
        `  ${item.ok ? PASS : FAIL} ${item.ok ? item.name : red(item.name)}`
        + `${item.ok ? dim(detail) : red(detail)}${item.ms ? dim(` (${item.ms} ms)`) : ""}`,
      );
    }
  }

  const total = report.results.length;
  const passed = report.results.filter((item) => item.ok).length;
  console.log(`\n${bold(magenta("─── Summary (GUI) ───"))}`);
  for (const [category, items] of byCategory) {
    const ok = items.filter((item) => item.ok).length;
    console.log(`  ${(ok === items.length ? (text) => text : red)(category.padEnd(18))} ${ratio(ok, items.length)}  ${bar(ok, items.length, 12)}`);
  }
  console.log(
    `  ${bold("total".padEnd(18))} ${ratio(passed, total)}  ${bar(passed, total, 12)}  `
    + banner(passed === total && total > 0 ? "ALL PASSED" : `${total - passed} FAILED`, passed === total && total > 0),
  );
  if (report.shots?.length) console.log(dim(`  screenshots: ${report.outDir}`));
}

/* --------------------------------------------------------------- main */

async function main() {
  prepare();
  let harnessError = null;
  try {
    await launch();
    const timedOut = sleep(limit).then(() => {
      throw new Error(`the GUI test did not finish within ${limit} ms`);
    });
    await Promise.race([run(), timedOut]);
  } catch (error) {
    harnessError = error;
  } finally {
    await shutdown();
  }
  if (harnessError) {
    results.push({ category: "harness", name: "smoke run", ok: false, detail: String(harnessError && harnessError.stack ? harnessError.stack : harnessError) });
  }

  fs.writeFileSync(path.join(outDir, "output.log"), app.output);
  const report = { results, shots, outDir };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  printReport(report);
  process.exit(results.length > 0 && results.every((item) => item.ok) ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
