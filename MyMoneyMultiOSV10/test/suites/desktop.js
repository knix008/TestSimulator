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
  let about = null;
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
    // The next two tests count and weigh the processes with this dialog open.
    about = popup;
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
    // Opening About again only brings this one forward, so the tests after this need it gone.
    await about?.eval("window.__TAURI_INTERNALS__.invoke('finish_popup', { result: { action: 'close' } })").catch(() => {});
    await waitFor(async () => !(await app.targets()).some((t) => t.id === about?.target.id), { what: "about to close" });
  });

  h.test("a second launch leaves at once and the first copy keeps running", async () => {
    const second = spawn(app.child.spawnfile, [], { env: { ...process.env, MYMONEY_CONFIG_DIR: app.configDir }, stdio: "ignore" });
    const code = await new Promise((resolve) => second.on("exit", resolve));
    assert.equal(code, 0);
    assert.equal(app.exited, null);
  });

  h.test("moving a symbol to a new window from the quote menu opens it and frees the first window", async () => {
    await waitFor(() => main.eval("window.__mymoney.currentTab().board.symbols.length > 1 && Boolean(document.querySelector('.content [data-symbol]'))"), { what: "quotes" });
    const before = await main.eval("window.__mymoney.currentTab().board.symbols.map((s) => s.symbol)");
    await main.eval("(() => { const q = document.querySelector('.content [data-symbol]'); q.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 80, screenX: 240, screenY: 200, button: 2 })); })()");
    const menu = await app.page("menu-host.html");
    await waitFor(() => menu.eval("document.querySelector('[data-cmd=\"detach-symbol\"]')?.dataset.enabled === 'true'"), { what: "an enabled move item" });
    const moved = await main.eval("window.__mymoney.currentTab().selectedSymbol || window.__mymoney.currentTab().board.activeSymbol");
    await menu.eval("document.querySelector('[data-cmd=\"detach-symbol\"]').click()").catch(() => {});
    // A window built inside a synchronous command used to hang here: blank new window, frozen first one.
    const extra = await app.page("src/index.html");
    // The window draws the starter watchlist first and takes its own board once its settings arrive.
    await waitFor(() => extra.eval("window.__mymoney?.ready ? window.__mymoney.ready.then(() => true) : false"), { what: "the new window" });
    assert.deepEqual(await extra.eval("window.__mymoney.currentTab().board.symbols.map((s) => s.symbol)"), [moved]);
    assert.equal(await extra.eval("window.__mymoney.windowInfo.primary"), false);
    await waitFor(() => main.eval(`!window.__mymoney.currentTab().board.symbols.some((s) => s.symbol === ${JSON.stringify(moved)})`), { what: "the symbol to leave the first window" });
    assert.equal((await main.eval("window.__mymoney.currentTab().board.symbols.length")), before.length - 1);
    await extra.eval("window.__TAURI_INTERNALS__.invoke('remove_window')").catch(() => {});
    await waitFor(async () => (await windows("src/index.html")).length === 1, { what: "the new window to go" });
    await main.eval(`window.__mymoney.undo()`);
  });

  h.test("the stocks and rates windows show every piece of a row at one size", async () => {
    for (const kind of ["stocks", "rates"]) {
      void main.eval(`window.__mymoney.run('${kind}')`);
      const popup = await app.page("popup-host.html");
      await waitFor(() => popup.eval("document.querySelectorAll('[data-gui=panel] .board-rows > *').length > 0"), { what: `${kind} rows` });
      const sizes = await popup.eval(`[...new Set([...document.querySelectorAll('[data-gui=panel] .board-rows :is(strong, em, span)')].filter((el) => !el.childElementCount && el.textContent.trim()).map((el) => getComputedStyle(el).fontSize))]`);
      assert.deepEqual(sizes, ["13px"], kind);
      await popup.eval("window.__TAURI_INTERNALS__.invoke('finish_popup', { result: { action: 'close' } })").catch(() => {});
      await waitFor(async () => !(await app.targets()).some((t) => t.id === popup.target.id), { what: `${kind} to close` });
    }
  });

  h.test("a stocks window resizes by its corner grip and its list follows; settings and about do not resize", async () => {
    void main.eval("window.__mymoney.run('stocks')");
    const popup = await app.page("popup-host.html");
    await waitFor(() => popup.eval("document.querySelectorAll('[data-resize]').length === 3"), { what: "resize handles" });
    const measure = () => popup.eval("({ w: innerWidth, h: innerHeight, list: document.querySelector('.panel-fit').getBoundingClientRect().height })");
    // The window is shown before its page has finished laying out; wait until two readings agree.
    let before = await measure();
    await waitFor(async () => {
      const next = await measure();
      const same = JSON.stringify(next) === JSON.stringify(before);
      before = next;
      return same;
    }, { what: "the stocks window to settle", every: 250 });
    const mouse = (type, x, y, buttons = 1) => popup.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
    await mouse("mouseMoved", before.w - 8, before.h - 8, 0);
    await mouse("mousePressed", before.w - 8, before.h - 8);
    for (let i = 1; i <= 5; i += 1) await mouse("mouseMoved", before.w - 8 - i * 20, before.h - 8 - i * 8);
    await mouse("mouseReleased", before.w - 108, before.h - 48, 0);
    // The page hears of the new size one frame after the window has it.
    await waitFor(() => popup.eval(`innerWidth === ${before.w - 100} && innerHeight === ${before.h - 40} && document.querySelector('[data-popup]').getBoundingClientRect().height === innerHeight`), { what: "the smaller window" });
    const after = await popup.eval("({ popup: document.querySelector('[data-popup]').getBoundingClientRect().height, list: document.querySelector('.panel-fit').getBoundingClientRect().height })");
    assert.equal(after.popup, before.h - 40);
    assert.equal(Math.round(after.list), Math.round(before.list) - 40);
    await popup.eval("window.__TAURI_INTERNALS__.invoke('finish_popup', { result: { action: 'close' } })").catch(() => {});
    await waitFor(async () => !(await app.targets()).some((t) => t.id === popup.target.id), { what: "stocks to close" });
    for (const kind of ["settings", "about"]) {
      void main.eval(`window.__mymoney.run('${kind}')`);
      const fixed = await app.page("popup-host.html");
      await waitFor(() => fixed.eval(`Boolean(document.querySelector('[data-popup=${kind}]'))`), { what: kind });
      assert.equal(await fixed.eval("document.querySelectorAll('[data-resize]').length"), 0, kind);
      await fixed.eval("window.__TAURI_INTERNALS__.invoke('finish_popup', { result: { action: 'close' } })").catch(() => {});
      await waitFor(async () => !(await app.targets()).some((t) => t.id === fixed.target.id), { what: `${kind} to close` });
    }
  });

  h.test("the first window's quote text fits inside it, the date included", async () => {
    const size = await main.eval("({ width: innerWidth, height: innerHeight })");
    await main.invoke("window_size", { size: { width: 1600, height: 900 } });
    await waitFor(() => main.eval("innerWidth === 1600"), { what: "the larger window" });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const spill = await main.eval(`(() => {
      const market = document.querySelector('.market').getBoundingClientRect();
      return [...document.querySelectorAll('.scene-copy > *')].map((piece) => {
        const r = piece.getBoundingClientRect();
        return Math.max(r.left + piece.scrollWidth - market.right, piece.scrollWidth - piece.parentElement.clientWidth);
      });
    })()`);
    assert.ok(spill.length >= 3 && spill.every((px) => px <= 1), JSON.stringify(spill));
    await main.invoke("window_size", { size });
    await waitFor(() => main.eval(`innerWidth === ${size.width} && innerHeight === ${size.height}`), { what: "the earlier size" });
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
