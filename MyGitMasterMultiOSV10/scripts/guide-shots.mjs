// `npm run guide:shots`: the pictures in the user's guide, taken from the real app.
//
//   node scripts/guide-shots.mjs            both languages
//   node scripts/guide-shots.mjs ko         one language
//
// Copies the release build (src-tauri/target/release/MyGitMaster.exe + src-tauri/runtime,
// so run `npm run build:win` or `node scripts/tauri-before-build.mjs` + a release cargo
// build first) into a scratch folder, makes a sample repository there (a merged branch,
// uncommitted work and a merge conflict), starts the app with a throw-away settings
// folder (MGM_SETTINGS_DIR — never the user's own settings) and a debugging port picked
// free on IPv4 and IPv6, drives every window over CDP — the main window, menu, dialog,
// tool and guide windows are separate pages — and writes doc/images/<lang>/*.png, next to
// the guide that shows them (doc/UsersGuide.md, doc/UsersGuide.en.md).
// Only the processes it started are stopped.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, listTargets, waitForTarget } from "./cdp.mjs";
import { freePort } from "./free-port.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requested = process.argv.slice(2).filter((arg) => arg === "ko" || arg === "en");
const languages = requested.length ? requested : ["ko", "en"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const exe = path.join(root, "src-tauri", "target", "release", process.platform === "win32" ? "MyGitMaster.exe" : "MyGitMaster");
const runtime = path.join(root, "src-tauri", "runtime");
if (!fs.existsSync(exe) || !fs.existsSync(path.join(runtime, "desktop.cjs"))) {
  console.error("guide-shots  build the release first (npm run build:win)");
  process.exit(1);
}

/** Labels the script clicks by, per language. */
const LABELS = {
  ko: { resolve: "충돌 해결...", midnight: "자정", classic: "클래식", powershell: /PowerShell/ },
  en: { resolve: "Resolve conflict...", midnight: "Midnight", classic: "Classic", powershell: /PowerShell/ },
};

/* ------------------------------------------------------------ scratch */

// A short, readable folder: its paths show in the pictures (log, recent list, status bar).
const scratch = path.join(os.tmpdir(), "MyGitMaster");
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });
const appDir = path.join(scratch, "app");
fs.mkdirSync(appDir, { recursive: true });
fs.copyFileSync(exe, path.join(appDir, path.basename(exe)));
fs.cpSync(runtime, path.join(appDir, "runtime"), { recursive: true });

/** A small project: a feature branch merged back, uncommitted work and a merge conflict. */
function makeRepository(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0 && !(args[0] === "merge" && args.includes("feature/settings"))) {
      throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    }
  };
  const put = (name, text) => fs.writeFileSync(path.join(dir, name), text);
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Guide");
  git("config", "user.email", "guide@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  put("README.md", "# Greeter\n\nA small project.\n");
  put("app.js", "function greet(name) {\n  return 'Hello, ' + name;\n}\n\nmodule.exports = { greet };\n");
  put("config.json", "{\n  \"language\": \"en\",\n  \"loud\": false\n}\n");
  git("add", ".");
  git("commit", "-q", "-m", "Initial commit");
  git("checkout", "-q", "-b", "feature/farewell");
  put("app.js", "function greet(name) {\n  return 'Hello, ' + name;\n}\n\nfunction farewell(name) {\n  return 'Bye, ' + name;\n}\n\nmodule.exports = { greet, farewell };\n");
  git("commit", "-q", "-am", "Add farewell()");
  put("test.js", "const { farewell } = require('./app');\nconsole.assert(farewell('Kim') === 'Bye, Kim');\n");
  git("add", "test.js");
  git("commit", "-q", "-m", "Test farewell()");
  git("checkout", "-q", "main");
  put("README.md", "# Greeter\n\nA small project that greets people.\n");
  git("commit", "-q", "-am", "Describe the project");
  git("merge", "-q", "--no-ff", "-m", "Merge branch 'feature/farewell'", "feature/farewell");
  git("tag", "v1.0");
  git("checkout", "-q", "-b", "feature/settings");
  put("config.json", "{\n  \"language\": \"ko\",\n  \"loud\": false\n}\n");
  git("commit", "-q", "-am", "Default to Korean");
  git("checkout", "-q", "main");
  put("config.json", "{\n  \"language\": \"en\",\n  \"loud\": true\n}\n");
  git("commit", "-q", "-am", "Greet loudly");
  git("merge", "feature/settings");
  put("app.js", "function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nfunction farewell(name) {\n  return 'Bye, ' + name;\n}\n\nmodule.exports = { greet, farewell };\n");
  put("CHANGELOG.md", "## 1.1\n- Friendlier greeting.\n");
}

/* --------------------------------------------------------------- run */

const started = [];
function stopAll() {
  for (const child of started) {
    if (child.exitCode !== null) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill();
  }
}
process.on("exit", stopAll);

async function shootLanguage(lang) {
  const out = path.join(root, "doc", "images", lang);
  fs.mkdirSync(out, { recursive: true });
  const repo = path.join(scratch, "my-project");
  makeRepository(repo);
  const profile = path.join(scratch, "settings");
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({
    language: lang,
    theme: "light-classic",
    showTutorial: true,
    startScreen: { showOnStartup: true, background: "history", cardOpacity: 85 },
    lastSession: { mode: "local", path: repo },
    recentRepositoryPaths: [repo],
    window: { width: 1280, height: 800, x: 60, y: 40, maximized: false },
  }, null, 2));

  const port = await freePort(9420);
  const child = spawn(path.join(appDir, path.basename(exe)), [], {
    cwd: appDir,
    env: { ...process.env, MGM_SETTINGS_DIR: profile, MGM_SMOKE: "1", WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
    stdio: "ignore",
  });
  started.push(child);
  const L = LABELS[lang];
  const saved = [];

  const page = await connect(await waitForTarget(port, (t) => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(t.url), 60000));
  const save = async (name, conn, selector = null, pad = 0) => {
    let shot;
    if (selector) {
      const clip = await conn.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = Math.max(0, r.left - ${pad}), y = Math.max(0, r.top - ${pad});
        return { x, y, width: Math.min(innerWidth - x, r.width + ${pad * 2}), height: Math.min(innerHeight - y, r.height + ${pad * 2}) };
      })()`);
      if (!clip || clip.width < 4 || clip.height < 4) throw new Error(`${name}: ${selector} not found`);
      const result = await conn.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
      shot = Buffer.from(result.data, "base64");
    } else {
      shot = await conn.screenshot();
    }
    fs.writeFileSync(path.join(out, `${name}.png`), shot);
    saved.push(name);
  };
  /** The page of a popup window whose content matches `test` (pooled windows stay listed). */
  const popup = async (prefix, test, ms = 12000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      for (const target of (await listTargets(port)).filter((t) => t.url.includes(prefix))) {
        const conn = await connect(target);
        if (await conn.evaluate(`!!(${test})`).catch(() => false)) return conn;
        conn.close();
      }
      await sleep(250);
    }
    throw new Error(`no ${prefix} window with ${test}`);
  };
  const escape = (conn) => conn.evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`).catch(() => {});
  const click = (selector, conn = page) => conn.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("missing ${selector.replaceAll("\"", "'")}"); el.click(); })()`);
  /** A visible toolbar button (the hidden measuring copy has the same labels). */
  const toolbarButton = (label) => page.evaluate(`[...document.querySelectorAll(".toolbar button")].find((b) => !b.closest(".git-toolbar-ruler") && b.getAttribute("aria-label") === ${JSON.stringify(label)}).click()`);

  // 1. Start screen with the tutorial's welcome card
  await page.until(`document.querySelector(".tour-welcome")`, 30000);
  await sleep(2500);
  await save("tutorial", page, ".tour-welcome", 6);
  await click(`[data-welcome="later"]`);
  await sleep(1200);
  await save("start-screen", page);

  // 2. The workspace
  await click(".start-toggle");
  await page.until(`document.querySelector(".commit-row")`, 20000);
  await sleep(800);
  await page.evaluate(`[...document.querySelectorAll(".commit-row")].find((row) => row.textContent.includes("Add farewell()")).click()`);
  await page.until(`document.querySelector(".changed-row")`, 10000);
  await page.evaluate(`document.querySelector(".changed-row").click()`);
  await sleep(1200);
  await save("main", page);
  await save("menubar", page, ".menubar");
  await save("toolbar", page, ".toolbar");
  await save("commit-history", page, ".center-col");
  await save("commit-details", page, ".right-col");
  await save("files-panel", page, ".left-col");

  // 3. Menus (each a window of its own).
  const withMenu = async (open, test) => {
    await open();
    return popup("#menu=", test, 10000);
  };
  const openContext = () => page.evaluate(`(() => { const row = document.querySelector(".changed-row"); const r = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.top + 6, screenX: screenX + r.left + 30, screenY: screenY + r.top + 40 })); })()`);
  const pressPointer = (selector) => page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); b.click(); })()`);

  let menu = await withMenu(openContext, `[...document.querySelectorAll(".popup-menu-row")].some((row) => /diff/i.test(row.textContent)) && !document.querySelector(".theme-option")`);
  await sleep(500);
  await save("context-menu", menu);
  // Closed with "Built-in diff tool" (that window is pictured below anyway); copying the
  // path would fail here, the window not being focused, and leave an error in the log.
  await menu.evaluate(`document.querySelector(".popup-menu-row").click()`);
  await sleep(800);

  menu = await withMenu(() => pressPointer(".split-tool .caret"), `document.querySelectorAll(".theme-option").length >= 40`);
  await sleep(600);
  await save("theme-menu", menu);
  // Closed by choosing the theme already in use; the dark shot comes last.
  await menu.evaluate(`[...document.querySelectorAll(".theme-option")].find((b) => b.textContent.includes(${JSON.stringify(L.classic)})).click()`);
  await sleep(1500);

  menu = await withMenu(() => pressPointer(".menubar .menu > button"), `document.querySelector(".popup-menu-row") && !document.querySelector(".theme-option")`);
  await sleep(500);
  await save("menu-file", menu);
  await escape(menu);
  await sleep(800);

  // 4. Preferences, every tab
  await page.evaluate(`document.querySelectorAll(".toolbar-end > button")[1].click()`);
  const prefs = await popup("#dialog=", `document.querySelector(".prefs-tabs")`);
  await sleep(900);
  const tabs = ["general", "theme", "start", "prompt", "prompt-editor", "tools"];
  for (let index = 0; index < tabs.length; index++) {
    await prefs.evaluate(`document.querySelectorAll(".prefs-tabs button")[${index}].click()`);
    await sleep(index === 3 || index === 4 ? 1500 : 800);
    await save(`prefs-${tabs[index]}`, prefs);
  }
  await escape(prefs);
  await prefs.evaluate(`[...document.querySelectorAll("button")].find((b) => /close|닫기|취소|Cancel/i.test(b.getAttribute("aria-label") || b.textContent || ""))?.click()`).catch(() => {});
  await sleep(800);

  // 5. Log and terminals: the whole bottom panel
  await page.evaluate(`document.querySelector(".bottom-tabs").parentElement.setAttribute("data-shot", "bottom")`);
  await page.evaluate(`document.querySelector(".bottom-tabs button").click()`);
  await sleep(500);
  await save("log", page, `[data-shot="bottom"]`);
  // Two PowerShell tabs from the shell list (▾), each given time to draw its prompt.
  for (let tab = 0; tab < 2; tab++) {
    await page.evaluate(`document.querySelector(".terminal-new-caret").click()`);
    await page.until(`document.querySelector(".terminal-shell-menu button")`, 5000);
    await page.evaluate(`(() => { const items = [...document.querySelectorAll(".terminal-shell-menu button")];
      (items.find((b) => /PowerShell/.test(b.textContent)) ?? items[0]).click(); })()`);
    await sleep(6000);
  }
  // A command, so the prompt shows twice with git's output between.
  await page.evaluate(`[...document.querySelectorAll(".xterm-helper-textarea")].find((area) => area.offsetParent)?.focus()`);
  await page.send("Input.insertText", { text: "git status --short" });
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(3500);
  await save("terminal", page, `[data-shot="bottom"]`);

  // 6. Built-in Diff window
  await page.evaluate(`document.querySelector(".changed-row").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`);
  const diff = await connect(await waitForTarget(port, (t) => t.url.includes("#tool?kind=diff"), 15000));
  await diff.until(`document.querySelector(".side-line")`, 15000);
  await sleep(1000);
  await save("diff-window", diff);

  // 7. Built-in Diff & Merge window (config.json is in conflict)
  await toolbarButton(L.resolve);
  const merge = await connect(await waitForTarget(port, (t) => t.url.includes("#tool?kind=merge"), 15000));
  await merge.until(`document.querySelector(".merge-tool")`, 15000);
  await sleep(1000);
  await save("merge-window", merge);

  // 8. The user's guide window
  await page.evaluate(`window.mgm.openGuide()`);
  const guide = await connect(await waitForTarget(port, (t) => t.url.includes("#guide"), 15000));
  await guide.until(`document.querySelector(".guide-toc, nav")`, 15000);
  await sleep(1500);
  await save("guide-window", guide);

  // 9. About
  await page.evaluate(`[...document.querySelectorAll(".toolbar-end > button")].pop().click()`);
  const about = await popup("#dialog=", `document.querySelector(".about-icon, .about-name")`);
  await sleep(800);
  await save("about", about);
  await escape(about);
  await about.evaluate(`[...document.querySelectorAll("button")].find((b) => /close|닫기|확인|OK/i.test(b.getAttribute("aria-label") || b.textContent || ""))?.click()`).catch(() => {});
  await sleep(800);

  // 10. Last, so no other window opens in it: the main window in a dark theme.
  menu = await withMenu(() => pressPointer(".split-tool .caret"), `document.querySelectorAll(".theme-option").length >= 40`);
  await menu.evaluate(`[...document.querySelectorAll(".theme-option")].find((b) => b.textContent.includes(${JSON.stringify(L.midnight)})).click()`);
  await sleep(1800);
  await save("main-dark", page);

  console.log(`guide-shots  ${lang}: ${saved.length} pictures → doc/images/${lang}/ (${saved.join(", ")})`);
  child.kill();
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  await sleep(1500);
}

try {
  for (const lang of languages) await shootLanguage(lang);
} catch (error) {
  console.error(`guide-shots  failed: ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
} finally {
  stopAll();
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* WebView2 may still hold a file for a moment */
  }
}
