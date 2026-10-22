// Drives the real desktop executable (debug build of the latest code) over WebView2's
// DevTools protocol. Settings, window placement and exports go to a temporary folder,
// never the user's. The test build has its own target folder, so a copy of the app the
// user is running (which locks target/debug) is never touched.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { freePort } from "../scripts/free-port.js";
import { Page, waitFor } from "./cdp.js";
import { checkContentTypes, checkEditing, checkExports, checkLayout, checkLogo, checkLogoInputs, checkStartup, checkStyles, checkTooLong, checkToolbar } from "./scenario.js";
import { root } from "./support.js";

const targetDir = path.join(root, "src-tauri", "target", "e2e");
const exe = path.join(targetDir, "debug", process.platform === "win32" ? "qrgenerator.exe" : "qrgenerator");

function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") execFileSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
  else child.kill();
}

/**
 * Dropdowns open as their own window in the desktop app: open one from the main page, then
 * pick in the popup (its own DevTools target).
 */
function nativePicker(port) {
  let menu;
  return async (page, rootId, value) => {
    await page.eval(`document.querySelector("#${rootId} .iselect-button").click()`);
    menu ??= await Page.attach(port, (url) => url.includes("menu.html"));
    await waitFor(() => menu.eval(`document.visibilityState === "visible" && Boolean(document.querySelector('.iselect-option[data-value="${value}"]'))`), { what: `${rootId} popup` });
    assert.equal(await menu.eval(`[...document.querySelectorAll(".iselect-option")].every((o) => o.querySelector("svg"))`), true, `${rootId} options have icons`);
    // The popup is a separate window placed under its button (screen coordinates).
    const menuTop = await menu.eval("window.screenY");
    const buttonBottom = await page.eval(`window.screenY + document.querySelector("#${rootId}").getBoundingClientRect().bottom`);
    assert.ok(Math.abs(menuTop - buttonBottom) < 40, `${rootId} popup under its button (${menuTop} vs ${buttonBottom})`);
    await menu.eval(`document.querySelector('.iselect-option[data-value="${value}"]').click()`);
    // menu-closed is sent once Rust has hidden the popup (WebView2 keeps visibilityState "visible").
    await waitFor(() => page.eval(`document.querySelector("#${rootId} .iselect-button").getAttribute("aria-expanded") === "false"`), { what: "popup to close" });
    await waitFor(async () => (await page.eval(`window.__qrgen.selects["${rootId.replace("-select", "")}"].value`)) === value, { what: `${rootId} = ${value}` });
  };
}

test("desktop app (real exe, native Rust)", { skip: process.platform !== "win32" && "WebView2 DevTools port is Windows-only", timeout: 900000 }, async (t) => {
  await t.test("builds the latest code (cargo, debug, own target folder)", () => {
    execFileSync("cargo", ["build", "--manifest-path", path.join(root, "src-tauri", "Cargo.toml"), "--target-dir", targetDir], { cwd: root, stdio: "pipe" });
  });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "qrgen-e2e-"));
  const config = path.join(work, "config");
  const saves = path.join(work, "saves");
  fs.mkdirSync(saves, { recursive: true });
  fs.mkdirSync(config, { recursive: true });
  // Where the window was "last closed": it must open there again.
  const windowFile = path.join(config, "window.json");
  const savedPlacement = { x: 140, y: 90, width: 1400, height: 860, maximized: false };
  fs.writeFileSync(windowFile, JSON.stringify(savedPlacement));

  const port = await freePort(9340);
  const child = spawn(exe, [], {
    env: { ...process.env, QRGEN_DEBUG_PORT: String(port), QRGEN_CONFIG_DIR: config, QRGEN_SAVE_DIR: saves, QRGEN_WEBVIEW_DIR: path.join(work, "webview") },
    stdio: "ignore",
  });
  let page;
  try {
    page = await Page.attach(port, (url) => !url.includes("menu.html") && (url.includes("index.html") || url.includes("tauri.localhost")));
    await t.test("starts with the native Rust encoder", () => checkStartup(page, "rust-native"));
    await t.test("reopens at the saved window position and size", async () => {
      const placed = await page.eval("({ x: window.screenX, y: window.screenY, w: window.outerWidth, dpr: devicePixelRatio })");
      // screenX/Y is the content corner; Windows adds an invisible resize border (≤ 8 px) around it.
      assert.ok(Math.abs(placed.x * placed.dpr - savedPlacement.x) <= 10 && Math.abs(placed.y * placed.dpr - savedPlacement.y) <= 10, `window reopened where it was: ${JSON.stringify(placed)}`);
      assert.ok(Math.abs(placed.w * placed.dpr - savedPlacement.width) <= 4, `window reopened at its size: ${JSON.stringify(placed)}`);
    });
    await t.test("frameless window: own window buttons and resize grip", async () => {
      assert.equal(await page.eval("document.getElementById('window-controls').hidden"), false);
      assert.equal(await page.eval("document.getElementById('resize-grip').hidden"), false);
    });
    await t.test("8 content types scan from the preview", () => checkContentTypes(page));
    await t.test("16 style combinations scan", () => checkStyles(page));
    await t.test("gradient, eye colour and logo scan", () => checkLogo(page));
    await t.test("logo files: PNG JPEG WebP GIF BMP ICO SVG AVIF TIFF, others refused", () => checkLogoInputs(page));
    await t.test("too much data shows an error", () => checkTooLong(page));
    await t.test("10 export formats saved (native Rust raster) decode and scan", async () => {
      const EXT = { png: "png", jpeg: "jpg", webp: "webp", gif: "gif", bmp: "bmp", tiff: "tif", ico: "ico", svg: "svg", pdf: "pdf", eps: "eps" };
      await checkExports(page, async (id) => {
        const saved = await page.eval(`window.__qrgen.exportAs("${id}")`);
        assert.equal(path.dirname(saved), saves, `${id} saved into QRGEN_SAVE_DIR`);
        assert.match(path.basename(saved), new RegExp(`^qrcode-url-[0-9]{8}-[0-9]{6}[.]${EXT[id]}$`));
        return fs.readFileSync(saved);
      });
    });
    await t.test("toolbar toggles; dropdowns open as popup windows", () => checkToolbar(page, nativePicker(port)));
    await t.test("steppers, default size, undo and redo", () => checkEditing(page));
    await t.test("cards move by dragging; layout resets", () => checkLayout(page));
    await t.test("settings file saved (no Wi-Fi password)", async () => {
      const settingsFile = path.join(config, "settings.json");
      const settings = await waitFor(() => fs.existsSync(settingsFile) && JSON.parse(fs.readFileSync(settingsFile, "utf8")), { what: "settings file" });
      assert.equal(settings.values.wifi.password, "", "Wi-Fi password is not stored");
      assert.equal(settings.export.format, "png", "the last chosen format (the editing step ends on PNG)");
      assert.ok(Array.isArray(settings.layout) && settings.layout.length === 3, "card layout is saved");
    });
    await t.test("screenshot of the finished window", async () => {
      await page.eval("(async () => { window.__qrgen.setDesign({ moduleStyle: 'rounded', eyeFrame: 'rounded', eyeBall: 'circle', gradient: 'diagonal' }); await window.__qrgen.setType('url'); await window.__qrgen.setValue('url', 'https://github.com/knix008/TestSimulator'); })()");
      await page.screenshot("desktop.png");
      assert.equal(await page.eval("document.visibilityState"), "visible", "the window is shown after the first render");
    });
    await t.test("close button saves the window placement and exits", async () => {
      const before = fs.statSync(windowFile).mtimeMs;
      await page.eval("document.getElementById('win-close').click()").catch(() => {});
      await waitFor(() => child.exitCode !== null, { timeout: 15000, what: "the app to exit" });
      assert.ok(fs.statSync(windowFile).mtimeMs > before, "window.json written on close");
      const closed = JSON.parse(fs.readFileSync(windowFile, "utf8"));
      assert.deepEqual({ x: closed.x, y: closed.y, maximized: closed.maximized }, { x: savedPlacement.x, y: savedPlacement.y, maximized: false });
    });
  } finally {
    page?.close();
    stop(child);
    // WebView2 keeps its profile folder locked for a moment after the process ends.
    await waitFor(() => child.exitCode !== null || child.signalCode !== null, { timeout: 10000, what: "exit" }).catch(() => {});
    try {
      fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      // Left in the temp folder; it is never reused.
    }
  }
});
