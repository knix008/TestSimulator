// The browser build in headless Edge/Chrome: same page, encoder = qrcore.wasm.
// One browser session; each check is a named step so the report shows the whole process.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { freePort } from "../scripts/free-port.js";
import { createServer } from "../scripts/serve-web.js";
import { Page, waitFor } from "./cdp.js";
import { checkContentTypes, checkEditing, checkExports, checkLayout, checkLogo, checkLogoInputs, checkStartup, checkStyles, checkTooLong, checkToolbar, checkToolbarFit } from "./scenario.js";
import { root } from "./support.js";

const BROWSERS = [
  process.env.QRGEN_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const browser = BROWSERS.find((p) => fs.existsSync(p));

test("browser build (headless Edge, WebAssembly)", { skip: !browser && "no Chromium-based browser found", timeout: 300000 }, async (t) => {
  const server = createServer();
  const webPort = await freePort(4180);
  await new Promise((resolve) => server.listen(webPort, "127.0.0.1", resolve));
  const debugPort = await freePort(9380);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "qrgen-web-"));
  const child = spawn(browser, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--window-size=1280,900", "--no-first-run", "--no-default-browser-check", `http://127.0.0.1:${webPort}/`], { stdio: "ignore" });
  let page;
  try {
    page = await Page.attach(debugPort, (url) => url.startsWith(`http://127.0.0.1:${webPort}`));
    await t.test("starts with the WebAssembly encoder", () => checkStartup(page, "rust-wasm"));
    await t.test("8 content types scan from the preview", () => checkContentTypes(page));
    await t.test("16 style combinations scan", () => checkStyles(page));
    await t.test("gradient, eye colour and logo scan", () => checkLogo(page));
    await t.test("logo files: PNG JPEG WebP GIF BMP ICO SVG AVIF TIFF, others refused", () => checkLogoInputs(page));
    await t.test("too much data shows an error", () => checkTooLong(page));
    await t.test("settings kept in localStorage", async () => {
      // Saving is debounced, and an older save may already be in localStorage.
      const saved = await waitFor(async () => {
        const raw = await page.eval("localStorage.getItem('qrgenerator.settings')");
        return raw && JSON.parse(raw).type === "text" ? raw : false;
      }, { what: "saved settings" });
      assert.equal(JSON.parse(saved).type, "text");
    });
    await t.test("10 export formats (WebAssembly raster, JS vector) decode and scan", () =>
      checkExports(page, async (id) => Buffer.from(await page.eval(`window.__qrgen.exportBytes("${id}")`), "base64")),
    );
    await t.test("toolbar toggles and icon dropdowns", () => checkToolbar(page));
    await t.test("toolbar fits from 1320 px to the minimum width (ko, en)", async () => {
      // The desktop minimum comes from src-tauri/src/placement.rs.
      const minWidth = Number(/MIN_SIZE: \(f64, f64\) = \((\d+)/.exec(fs.readFileSync(path.join(root, "src-tauri", "src", "placement.rs"), "utf8"))[1]);
      await checkToolbarFit(page, [1320, 1180, 1100, 1000, minWidth]);
      await page.send("Emulation.clearDeviceMetricsOverride");
    });
    await t.test("steppers, default size, undo and redo", () => checkEditing(page));
    await t.test("cards move by dragging; layout resets", () => checkLayout(page));
    await t.test("English and dark theme", async () => {
      assert.equal(await page.eval("document.querySelector('.brand-title').textContent"), "MyQRGenerator");
      assert.equal(await page.eval("document.documentElement.dataset.theme"), "dark");
      await page.screenshot("web-dark-en.png");
    });
    await t.test("phone width: one column, no horizontal scroll", async () => {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(await page.eval("document.documentElement.scrollWidth <= window.innerWidth"), true, "no horizontal scroll at 390px");
      await page.screenshot("web-phone.png");
    });
  } finally {
    page?.close();
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
      } catch {}
    } else child.kill();
    server.close();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
