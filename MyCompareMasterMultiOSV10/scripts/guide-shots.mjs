// `npm run guide:shots`: the pictures in the user's guide, taken from the real app.
//
//   node scripts/guide-shots.mjs            both languages
//   node scripts/guide-shots.mjs ko         one language
//
// Starts the web build (API server + Vite) on ports nobody else is using — checked on
// both 127.0.0.1 and ::1, never another program's server — with a throw-away settings
// folder (light theme, no welcome card), copies samples/ into a scratch folder so
// nothing the app does can touch the real samples, builds a small git repository
// there, then drives headless Edge (or Chrome) over CDP and writes
// assets/guide/<lang>/*.png. Everything it started is stopped at the end.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, waitForTarget } from "./cdp.mjs";
import { freePort } from "./free-port.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGUAGES = process.argv.slice(2).filter((arg) => arg === "ko" || arg === "en");
const languages = LANGUAGES.length > 0 ? LANGUAGES : ["ko", "en"];
const WIDTH = 1280;
const HEIGHT = 800;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = [];

/* ------------------------------------------------------------ scratch */

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mcm-guide-shots-"));
const settingsDir = path.join(scratch, "settings");
const inputs = path.join(scratch, "samples");
const repo = path.join(scratch, "repository");
fs.mkdirSync(settingsDir, { recursive: true });

if (!fs.existsSync(path.join(root, "samples", "files", "left.txt"))) {
  // samples/ is generated, not committed; make it the usual way first.
  spawnSync(process.execPath, [path.join(root, "scripts", "make-samples.mjs")], { cwd: root, stdio: "inherit" });
}
fs.cpSync(path.join(root, "samples"), inputs, { recursive: true });
const sample = (...parts) => path.join(inputs, ...parts).replace(/\\/g, "/");

/** A repository with a little history (a branch merged back) and some uncommitted work. */
function makeRepository() {
  fs.mkdirSync(repo, { recursive: true });
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  };
  const put = (name, text) => fs.writeFileSync(path.join(repo, name), text);
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Guide");
  git("config", "user.email", "guide@example.invalid");
  git("config", "commit.gpgsign", "false");
  put("README.md", "# Demo\n\nA small project.\n");
  put("app.js", "function greet(name) {\n  return 'Hello, ' + name;\n}\n");
  git("add", ".");
  git("commit", "-q", "-m", "Initial commit");
  git("checkout", "-q", "-b", "feature/farewell");
  put("app.js", "function greet(name) {\n  return 'Hello, ' + name;\n}\n\nfunction farewell(name) {\n  return 'Bye, ' + name;\n}\n");
  git("commit", "-q", "-am", "Add farewell()");
  git("checkout", "-q", "main");
  put("README.md", "# Demo\n\nA small project that greets people.\n");
  git("commit", "-q", "-am", "Describe the project");
  git("merge", "-q", "--no-ff", "-m", "Merge branch 'feature/farewell'", "feature/farewell");
  put("app.js", "function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nfunction farewell(name) {\n  return 'Bye, ' + name;\n}\n");
  put("CHANGELOG.md", "## 1.1\n- Friendlier greeting.\n");
  put("README.md", "# Demo\n\nA small project that greets people politely.\n");
  git("add", "README.md");
}
makeRepository();

/* ------------------------------------------------------------ servers */

function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: "" },
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill();
    } catch {
      /* already gone */
    }
  }
}

async function waitForUrl(url, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${url}`);
}

function browserPath() {
  const candidates = [
    process.env.MCM_BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("no Edge or Chrome found; set MCM_BROWSER");
  return found;
}

/* -------------------------------------------------------------- shots */

let cdp;
let ui = "";
let api = "";

const js = (expression) => cdp.evaluate(expression);
const ready = "window.__mcm && window.__mcm.state() && window.__mcm.state().ready && window.__mcmCommands && window.__mcmStore";

async function putSettings(patch) {
  const response = await fetch(`${api}/api/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`settings: ${response.status}`);
}

/** The bounding box of `selector` (all matches), padded and kept inside the window. */
async function boxOf(selector, pad = 8) {
  const box = await js(`(() => {
    const list = [...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!list.length) return null;
    return { left: Math.min(...list.map((r) => r.left)), top: Math.min(...list.map((r) => r.top)),
      right: Math.max(...list.map((r) => r.right)), bottom: Math.max(...list.map((r) => r.bottom)) };
  })()`);
  if (!box) throw new Error(`nothing on screen for ${selector}`);
  return clip(box, pad);
}

function clip(box, pad = 0) {
  const x = Math.max(0, Math.floor(box.left - pad));
  const y = Math.max(0, Math.floor(box.top - pad));
  const right = Math.min(WIDTH, Math.ceil(box.right + pad));
  const bottom = Math.min(HEIGHT, Math.ceil(box.bottom + pad));
  return { x, y, width: right - x, height: bottom - y, scale: 1 };
}

const union = (a, b) => ({
  left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
  right: Math.max(a.x + a.width, b.x + b.width), bottom: Math.max(a.y + a.height, b.y + b.height),
});

async function shot(language, name, area) {
  await sleep(350);
  const params = { format: "png", captureBeyondViewport: false };
  if (area) params.clip = area;
  const result = await cdp.send("Page.captureScreenshot", params);
  const file = path.join(root, "assets", "guide", language, `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  console.log(`  ${path.relative(root, file).replace(/\\/g, "/")}  ${Math.round(fs.statSync(file).size / 1024)} KB`);
}

async function key(name, code, keyCode) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: keyCode });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: keyCode });
}

async function rightClick(x, y) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "right", buttons: 2, clickCount: 1 });
  }
}

const closeTabs = () => js("window.__mcmStore.tabs.forEach((tab) => window.__mcmStore.closeTab(tab.id)); true");
const open = (kind, paths) => js(`window.__mcm.open(${JSON.stringify(kind)}, ${JSON.stringify(paths)}).then(() => true)`);
const update = (patch) => js(`window.__mcmStore.updateSettings(${JSON.stringify(patch)}).then(() => true)`);
const closeDialog = () => js("(() => { document.querySelectorAll('.dialog.floating .dialog-close').forEach((b) => b.click()); return true; })()");

async function shootLanguage(language) {
  console.log(`\n[${language}]`);
  await putSettings({
    language, theme: "classic-light", showTutorial: false, restoreSession: false,
    showLogPanel: true, showTerminalPanel: false, bottomPanel: "log", showStatusBar: true,
    showLeftPanel: true, showRightPanel: true, zoom: 100,
  });
  await cdp.send("Page.navigate", { url: ui });
  await cdp.until(ready, 60000);
  await js(`(() => { try { localStorage.setItem('mcm.guide.language', ${JSON.stringify(language)}); } catch {} return true; })()`);
  await closeTabs();
  await sleep(1500);

  // The start screen.
  await shot(language, "start");

  // The tutorial on the start screen.
  await js("window.__mcmCommands['help.tutorial'].run(); true");
  await sleep(300);
  await js("window.__mcmTour.go(window.__mcmTour.steps.findIndex((s) => s.id === 'start-new-session')); true");
  await sleep(900);
  const card = await boxOf(".tour-card", 0);
  const lit = await boxOf(".tour-spotlight", 0);
  await shot(language, "tutorial", clip(union(card, lit), 16));
  await key("Escape", "Escape", 27);
  await sleep(300);

  // A text comparison: the whole window, then parts of it.
  await open("files", [sample("files", "left.txt"), sample("files", "right.txt")]);
  await sleep(900);
  await shot(language, "text-compare");
  await shot(language, "toolbar", await boxOf('[data-tour="toolbar"]', 0));
  await shot(language, "menubar", await boxOf('[data-tour="menubar"]', 0));

  // Its context menu.
  const pane = await boxOf('[data-tour="diff-view"]', 0);
  const at = { x: Math.round(pane.x + pane.width * 0.3), y: Math.round(pane.y + 120) };
  await rightClick(at.x, at.y);
  await cdp.until("document.querySelector('.menu-popup')", 5000);
  const menu = await boxOf(".menu-popup", 0);
  await shot(language, "context-menu", clip(union(menu, { x: at.x - 40, y: at.y - 30, width: 1, height: 1 }), 12));
  await key("Escape", "Escape", 27);
  await sleep(300);

  // The theme drop-down.
  await js("(() => { document.querySelector('[data-command=\"toolbar.themeList\"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; })()");
  await cdp.until("document.querySelector('.menu-popup')", 5000);
  const themes = await boxOf(".menu-popup", 0);
  const button = await boxOf('[data-tour="theme"]', 0);
  await shot(language, "theme-menu", clip(union(themes, button), 10));
  await key("Escape", "Escape", 27);
  await sleep(300);

  // The bottom panel with a terminal open.
  await update({ showTerminalPanel: true, bottomPanel: "terminal", logPanelHeight: 230 });
  await sleep(3500);
  await shot(language, "bottom-panel", await boxOf('[data-tour="bottom-panel"]', 0));
  await update({ showTerminalPanel: false, bottomPanel: "log", logPanelHeight: 140 });
  await closeTabs();

  // A folder comparison.
  await open("directories", [sample("tree", "left"), sample("tree", "right")]);
  await sleep(900);
  await shot(language, "folder-compare");
  await closeTabs();

  // A 3-way merge; the result goes to a scratch file, never into samples/.
  const merged = sample(`merged-${language}.txt`);
  await open("merge", [sample("merge", "base.txt"), sample("merge", "local.txt"), sample("merge", "remote.txt"), merged]);
  await sleep(900);
  await shot(language, "merge");
  await closeTabs();

  // A git repository.
  await open("repository", [repo.replace(/\\/g, "/")]);
  await sleep(1500);
  await shot(language, "git");
  await closeTabs();

  // The settings window: General and the start screen's tab.
  await js("window.__mcmCommands['tools.settings'].run(); true");
  await cdp.until("document.querySelector('.dialog.size-settings')", 8000);
  await sleep(600);
  await shot(language, "settings-general", await boxOf(".dialog.size-settings", 0));
  await js("(() => { document.querySelector('.dialog.size-settings [data-tab=\"start\"]').click(); return true; })()");
  await sleep(500);
  await shot(language, "settings-start", await boxOf(".dialog.size-settings", 0));
  await closeDialog();
  await sleep(300);

  // The user's guide itself.
  await js("window.__mcmCommands['help.guide'].run(); true");
  await cdp.until("document.querySelector('[data-testid=guide]')", 8000);
  await sleep(800);
  await shot(language, "guide", await boxOf(".dialog.size-guide", 0));
  await closeDialog();
}

/* --------------------------------------------------------------- main */

let browser = null;
let failed = false;
try {
  const apiPort = await freePort(4790);
  const uiPort = await freePort(5180, [apiPort]);
  const cdpPort = await freePort(9330, [apiPort, uiPort]);
  api = `http://127.0.0.1:${apiPort}`;
  ui = `http://127.0.0.1:${uiPort}/`;
  console.log(`api ${api}  ui ${ui}  cdp ${cdpPort}  scratch ${scratch}`);

  start(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "server/cli.ts"], {
    PORT: String(apiPort),
    MCM_SETTINGS_DIR: settingsDir,
  });
  start(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--port", String(uiPort), "--strictPort"], {
    MCM_API: api,
  });
  await waitForUrl(`${api}/api/settings`);
  await waitForUrl(ui);

  browser = start(browserPath(), [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${path.join(scratch, "browser")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--window-size=${WIDTH},${HEIGHT}`,
    "about:blank",
  ], {});
  const target = await waitForTarget(cdpPort, (item) => item.type === "page");
  cdp = await connect(target);
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });

  for (const language of languages) await shootLanguage(language);
} catch (error) {
  failed = true;
  console.error(`guide shots failed: ${error.stack || error}`);
} finally {
  try {
    await cdp?.send("Browser.close");
  } catch {
    /* gone */
  }
  stopAll();
  await sleep(300);
  try {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* a file still held open; the OS cleans the temp folder */
  }
}
process.exit(failed ? 1 : 0);
