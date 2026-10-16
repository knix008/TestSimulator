import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildDebug, launch, memoryOf, root, waitFor } from "../e2e/harness.js";

const SETTINGS = {
  language: "ko",
  theme: "dark-ink",
  transparency: 30,
  windowPosition: { x: 160, y: 140 },
  windowSize: { width: 420, height: 220 },
};

/** The Rust unit tests (placement, dialog hub, settings merge) run as one entry each. */
export function registerRust(h) {
  h.category("Rust");
  let output = "";
  h.test("cargo test --lib passes", () => {
    output = execFileSync("cargo", ["test", "--manifest-path", path.join(root, "src-tauri", "Cargo.toml"), "--lib", "--", "--test-threads=1"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.match(output, /test result: ok\. \d+ passed; 0 failed/);
  });
  h.test("every Rust module has its tests", () => {
    for (const module of ["placement", "hub", "store"]) assert.match(output, new RegExp(`test ${module}::tests::`), module);
    const passed = Number(output.match(/test result: ok\. (\d+) passed/)?.[1] || 0);
    assert.ok(passed >= 14, `${passed} Rust tests`);
  });
}

/** The real executable, driven through the DevTools protocol in its own settings folder. */
export function registerDesktop(h) {
  h.category("Desktop (Tauri)");
  let app = null;
  let main = null;
  // A failed step must not leave the test copy running behind the tray.
  process.on("exit", () => {
    if (app && app.exited === null) app.child.kill();
  });
  const windows = async (prefix) => (await app.targets()).filter((t) => t.url.includes(prefix));

  h.test("the debug build starts and the quote window boots on the Tauri platform", async () => {
    // This suite runs after the jsdom ones and talks to real windows over Node's WebSocket.
    if (globalThis.__nodeEvent) globalThis.Event = globalThis.__nodeEvent;
    buildDebug();
    app = await launch({ settings: SETTINGS });
    main = await app.page("src/index.html");
    await waitFor(() => main.eval("window.__mymoney?.ready ? window.__mymoney.ready.then(() => true) : false"), { what: "app" });
    // The hidden webview can lay out once at another size before the window settles.
    await waitFor(() => main.eval("innerWidth === 420 && innerHeight === 220"), { what: "the saved size" });
    const info = JSON.parse(await main.eval(`JSON.stringify({ kind: window.__mymoney.platform.kind, host: document.body.dataset.host, electron: typeof window.electronAPI, w: innerWidth, h: innerHeight })`));
    assert.deepEqual(info, { kind: "desktop", host: "desktop", electron: "undefined", w: 420, h: 220 });
  });

  h.test("the window opens where settings.json put it", async () => {
    const bounds = await main.invoke("window_bounds");
    assert.deepEqual({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, { x: 160, y: 140, width: 420, height: 220 });
    assert.equal(bounds.maximized, false);
  });

  h.test("quotes are fetched through Rust (no CORS, User-Agent allowed)", async () => {
    const text = await main.eval(
      `window.__mymoney.platform.fetch("https://query1.finance.yahoo.com/v8/finance/chart/005930.KS?range=1d&interval=1d", { headers: { "User-Agent": "MyMoney/1.0" } }).then((r) => r.text())`,
    );
    assert.match(text, /"chart"/);
  });

  h.test("dragging moves the window and window.json is written once it settles", async () => {
    await main.eval(`(async () => {
      const p = window.__mymoney.platform;
      await p.moveWindow({ phase: "start" });
      for (let i = 1; i <= 20; i++) p.moveWindow({ phase: "move", dx: i * 2, dy: i });
      await p.moveWindow({ phase: "end" });
    })()`);
    const bounds = await main.invoke("window_bounds");
    assert.deepEqual([bounds.x, bounds.y], [200, 160]);
    const file = path.join(app.configDir, "window.json");
    const saved = await waitFor(() => fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).x === 200 && JSON.parse(fs.readFileSync(file, "utf8")), { what: "window.json" });
    assert.equal(saved.y, 160);
  });

  h.test("resizing stops at the minimum window size", async () => {
    const result = await main.eval(`(async () => {
      const p = window.__mymoney.platform;
      await p.resizeWindow({ phase: "start" });
      p.resizeWindow({ phase: "move", dx: -1000, dy: -1000 });
      return p.resizeWindow({ phase: "end" });
    })()`);
    assert.equal(result.width, 313);
    assert.equal(result.height, 150);
    assert.equal(await main.eval("innerWidth"), 313);
  });

  h.test("settings open in their own window, and asking again brings the same one forward", async () => {
    void main.eval("window.__mymoney.run('settings')");
    const popup = await app.page("popup-host.html");
    await waitFor(() => popup.eval("Boolean(document.querySelector('[data-popup=settings]'))"), { what: "settings page" });
    await main.eval("window.__mymoney.run('settings')");
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal((await windows("popup-host.html")).length, 1);
    await popup.eval("window.__TAURI_INTERNALS__.invoke('finish_popup', { result: { action: 'close' } })").catch(() => {});
    await waitFor(async () => (await windows("popup-host.html")).length === 0, { what: "settings to close" });
  });

  h.test("a menu opens as its own window and closes after a choice reaches the quote window", async () => {
    await main.eval("window.__mymoney.openMenu('window', { clientX: 40, clientY: 40, screenX: 240, screenY: 200 }, { atPointer: true })");
    const menu = await app.page("menu-host.html");
    await waitFor(() => menu.eval("document.querySelectorAll('.menu-item').length > 0"), { what: "menu items" });
    await main.eval("window.__menuHeard = []; window.__TAURI__.webviewWindow.getCurrentWebviewWindow().listen('menu-command', (e) => window.__menuHeard.push(e.payload))");
    await menu.eval("window.__TAURI_INTERNALS__.invoke('menu_command', { id: 'show-window' })").catch(() => {});
    await waitFor(async () => (await windows("menu-host.html")).length === 0, { what: "menu to close" });
    assert.deepEqual(await waitFor(() => main.eval("window.__menuHeard.length && window.__menuHeard")), ["show-window"]);
  });

  h.test("events reach only the window they were sent to", async () => {
    void main.eval("window.__mymoney.run('about')");
    const popup = await app.page("popup-host.html");
    await popup.eval("window.__heard = []; window.__TAURI__.webviewWindow.getCurrentWebviewWindow().listen('menu-command', (e) => window.__heard.push(e.payload))");
    await main.eval("window.__heard = []; window.__TAURI__.webviewWindow.getCurrentWebviewWindow().listen('menu-command', (e) => window.__heard.push(e.payload))");
    await main.eval("window.__TAURI_INTERNALS__.invoke('menu_command', { id: 'show-window' })");
    await waitFor(() => main.eval("window.__heard.length > 0"), { what: "the owner to hear it" });
    assert.deepEqual(await popup.eval("window.__heard"), []);
  });

  h.test("every window shares one renderer process", async () => {
    const types = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$all=Get-CimInstance Win32_Process; $ids=@(${app.child.pid}); do { $n=$ids.Count; $ids += @($all | ? { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId } | % { $_.ProcessId }) } while ($ids.Count -ne $n); $all | ? { $ids -contains $_.ProcessId } | % { if ($_.CommandLine -match '--type=(\\S+)') { $matches[1] } }`,
      ],
      { encoding: "utf8" },
    )
      .split(/\r?\n/)
      .filter(Boolean);
    assert.ok((await windows(".html")).length >= 2, "a dialog is open beside the quote window");
    assert.equal(types.filter((t) => t === "renderer").length, 1, types.join(","));
  });

  h.test("memory stays well under the Electron build", async () => {
    const memory = memoryOf(app.child.pid);
    assert.ok(memory.privateMB < 180, JSON.stringify(memory));
  });

  h.test("a second launch leaves at once and the first copy keeps running", async () => {
    const second = spawn(app.child.spawnfile, [], { env: { ...process.env, MYMONEY_CONFIG_DIR: app.configDir }, stdio: "ignore" });
    const code = await new Promise((resolve) => second.on("exit", resolve));
    assert.equal(code, 0);
    assert.equal(app.exited, null);
  });

  h.test("quitting saves the window's place in settings.json and ends the process", async () => {
    const configDir = app.configDir;
    const keep = path.join(root, "test", ".last-settings.json");
    const settingsFile = path.join(configDir, "settings.json");
    await main.invoke("confirm_quit").catch(() => {});
    await waitFor(() => app.exited !== null, { what: "exit" });
    fs.copyFileSync(settingsFile, keep);
    const saved = JSON.parse(fs.readFileSync(keep, "utf8"));
    fs.rmSync(keep);
    await app.quit();
    assert.equal(app.exited, 0);
    assert.deepEqual(saved.windowPosition, { x: 200, y: 160 });
    assert.deepEqual(saved.windowSize, { width: 313, height: 150 });
    assert.equal(saved.theme, "dark-ink");
  });
}
