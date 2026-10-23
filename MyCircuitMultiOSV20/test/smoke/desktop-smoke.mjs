// Desktop shell test: what only the Tauri host does, in the real program.
// npm run smoke runs every command with the dialogs kept inside the page; this
// runs the program as people do, with each dialog in its own window, and
// checks the bridge to the operating system:
//   dialog windows (open, size, focus, close by button / Escape / system),
//   settings.json, open / save / Ctrl+S / binary export, Save as PDF, the
//   manual window, interface zoom, minimum size, window buttons, files dropped
//   on the window, files named on the command line, and closing with unsaved
//   changes.
//
//   npm run smoke:desktop     (node test/smoke/desktop-smoke.mjs [--keep])
//
// Open and save dialogs answer through MYCIRCUIT_TEST_OPEN / _SAVE_DIR, so no
// system dialog appears and nothing outside the scratch folder is written.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exe, launchEnv, isAppPage } from "./launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const keep = process.argv.includes("--keep");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "mycircuit-desktop-"));
const saveDir = path.join(scratch, "saved");
const sample = path.join(root, "sample", "03-555-blinker.mycircuit");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

// ---------------------------------------------------------------- CDP
class Page {
  constructor(target) { this.target = target; this.id = 0; this.pending = new Map(); this.errors = []; }
  async open() {
    this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); }
      if (msg.method === "Runtime.exceptionThrown") this.errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") this.errors.push("console.error: " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    };
    await this.send("Runtime.enable");
    return this;
  }
  send(method, params = {}) {
    return new Promise((res, rej) => {
      const i = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(i); rej(new Error(`${method} timed out`)); }, 20000);
      this.pending.set(i, (m) => { clearTimeout(timer); res(m); });
      this.ws.send(JSON.stringify({ id: i, method, params }));
    });
  }
  async ev(expr) {
    const r = await this.send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  }
  // Fire and forget: for calls that wait on a dialog this test answers later.
  fire(expr) { this.ws.send(JSON.stringify({ id: ++this.id, method: "Runtime.evaluate", params: { expression: expr, userGesture: true } })); }
  async click(x, y) {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  }
  async key(key, code, vk) {
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  }
  close() { try { this.ws.close(); } catch { /* gone */ } }
}

let port = 0;
const targets = async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === "page");

async function launch(args = [], extra = {}) {
  port = 9900 + Math.floor(Math.random() * 90);
  const profile = path.join(scratch, `profile-${port}`);
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(exe, args, { env: launchEnv({ port, profile, extra: { MYCIRCUIT_TEST_SAVE_DIR: saveDir, ...extra } }), stdio: "ignore" });
  const exited = new Promise((res) => child.on("exit", (code) => res(code)));
  for (let i = 0; i < 120; i++) {
    try {
      const t = (await targets()).find(isAppPage);
      if (t) {
        const page = await new Page(t).open();
        for (let j = 0; j < 80 && !(await page.ev("return !!window.mycircuitApp").catch(() => false)); j++) await sleep(100);
        return { child, page, profile, exited, mainId: t.id };
      }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  child.kill();
  throw new Error("the program did not start");
}

// The dialog windows: page targets other than the main page and the manual.
async function dialogTargets(mainId) {
  return (await targets()).filter((t) => t.id !== mainId && !/USERSGUIDE/.test(t.url));
}
async function waitDialog(mainId, predicate = () => true, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const t of await dialogTargets(mainId)) {
      const p = await new Page(t).open().catch(() => null);
      if (!p) continue;
      const info = await p.ev(`return document.body && document.body.classList.contains("dialog-host") && document.querySelector(".modal-title") ? { title: document.querySelector(".modal-title").textContent, w: innerWidth, h: innerHeight, visible: document.visibilityState, focus: document.hasFocus(), sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight } : null`).catch(() => null);
      if (info && predicate(info)) return { page: p, info, target: t };
      p.close();
    }
    await sleep(150);
  }
  throw new Error("no dialog window appeared");
}
async function waitGone(mainId, targetId, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!(await dialogTargets(mainId)).some((t) => t.id === targetId)) return true;
    await sleep(100);
  }
  return false;
}
async function clickButton(page, text) {
  const r = await page.ev(`const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return null; b.scrollIntoView(); const q = b.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2];`);
  if (!r) throw new Error(`no button "${text}"`);
  await page.click(r[0], r[1]);
}

// ---------------------------------------------------------------- steps
const results = [];
const fail = (x) => { throw new Error(typeof x === "string" ? x : JSON.stringify(x)); };
async function step(name, fn, page) {
  const t0 = performance.now();
  const before = page ? page.errors.length : 0;
  let ok = true;
  let detail = "";
  try {
    const r = await fn();
    if (typeof r === "string") detail = r;
  } catch (e) { ok = false; detail = String(e.message || e).split("\n")[0]; }
  if (page && page.errors.length > before) { ok = false; detail += ` | ${page.errors.slice(before).join(" | ").slice(0, 300)}`; }
  results.push({ name, ok, detail, ms: performance.now() - t0 });
  process.stdout.write(`${ok ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✖\x1b[0m"} ${name}${detail ? `  — ${detail}` : ""} \x1b[2m(${Math.round(performance.now() - t0)} ms)\x1b[0m\n`);
}

let run = null;
try {
  run = await launch([], { MYCIRCUIT_TEST_OPEN: sample });
  const { page, profile, mainId } = run;
  const app = "window.mycircuitApp";

  await step("bridge: Tauri host, version, platform, desktop body classes", async () => {
    const r = await page.ev(`const d = window.mycircuit; return { tauri: d.isTauri, v: await d.getVersion(), p: d.platform, tv: d.versions.tauri, wv: d.versions.webview, desk: document.body.classList.contains("desktop"), ctl: document.querySelectorAll("#win-controls .win-btn").length, inline: !!window.mycircuitInlineDialogs, pdf: typeof d.printToPDF }`);
    if (!r.tauri || r.v !== pkg.version || r.p !== "win32" || !r.tv || !r.wv || !r.desk || r.ctl !== 3 || r.inline || r.pdf !== "function") fail(r);
    return `Tauri ${r.tv}, WebView2 ${r.wv}`;
  }, page);

  await step("window shown once the page started; title follows the document", async () => {
    const r = await page.ev(`return { vis: document.visibilityState, title: document.title }`);
    if (r.vis !== "visible" || !r.title.includes("MyCircuit")) fail(r);
  }, page);

  await step("welcome dialog opens in its own window, sized to fit, focused", async () => {
    const d = await waitDialog(mainId);
    const back = await page.ev(`return !!document.querySelector(".modal-backdrop")`);
    if (!back || d.info.visible !== "visible" || d.info.sw > d.info.w + 1 || d.info.sh > d.info.h + 1) fail({ back, ...d.info });
    await d.page.key("Escape", "Escape", 27);
    if (!(await waitGone(mainId, d.target.id))) fail("Escape did not close the dialog window");
    await sleep(200);
    if (await page.ev(`return !!document.querySelector(".modal-backdrop")`)) fail("main page still dimmed");
    d.page.close();
    return `"${d.info.title}" ${d.info.w}×${d.info.h}`;
  }, page);
  await page.ev(`${app}.settings.onboarded = true; ${app}.setSetting("lang", "en"); return 1`);

  await step("About: dialog window, Tauri runtime row, close button", async () => {
    page.fire(`${app}.run("help.about")`);
    const d = await waitDialog(mainId, (i) => /About/.test(i.title));
    const row = await d.page.ev(`return [...document.querySelectorAll(".about-val")].map((e) => e.textContent).find((t) => /Tauri/.test(t)) || ""`);
    if (!/^Tauri \d+\.\d+\.\d+ · WebView2 \d+/.test(row)) fail(`runtime row: ${row}`);
    const xy = await d.page.ev(`const q = document.querySelector(".modal-head .icon-btn").getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]`);
    await d.page.click(xy[0], xy[1]);
    if (!(await waitGone(mainId, d.target.id))) fail("close button did not close the window");
    d.page.close();
    return row;
  }, page);

  await step("dialog closed by the system (window destroyed) releases the main window", async () => {
    page.fire(`${app}.run("help.keys")`);
    const d = await waitDialog(mainId, (i) => /shortcuts/i.test(i.title));
    const label = await d.page.ev(`return window.mycircuitDialogLabel`);
    d.page.close();
    await page.ev(`await window.__TAURI__.core.invoke("close_dialog", { label: ${JSON.stringify(label)} }); return 1`);
    await sleep(700);
    const r = await page.ev(`return { dim: !!document.querySelector(".modal-backdrop"), open: (await import("./src/ui/widgets.js")).anyModalOpen() }`);
    if (r.dim || r.open) fail(r);
  }, page);

  await step("settings.json written to the settings folder", async () => {
    await page.ev(`${app}.setSetting("gridMm", 2.54); ${app}.setSetting("smokeMarker", "tauri"); return 1`);
    await sleep(300);
    const s = JSON.parse(fs.readFileSync(path.join(profile, "settings.json"), "utf8"));
    if (s.smokeMarker !== "tauri" || s.lang !== "en") fail({ marker: s.smokeMarker, lang: s.lang });
    const back = await page.ev(`return (await window.mycircuit.loadSettings()).smokeMarker`);
    if (back !== "tauri") fail(`loadSettings: ${back}`);
  }, page);

  await step("open project via the Open dialog (File ▸ Open)", async () => {
    // The Open dialog answers with MYCIRCUIT_TEST_OPEN (the sample).
    await page.ev(`await ${app}.run("file.open"); return 1`);
    let r = null;
    for (let i = 0; i < 30; i++) {
      r = await page.ev(`return { name: ${app}.store.fileName, path: ${app}.store.filePath, parts: ${app}.store.project.schematic.parts.length }`);
      if (r.path === sample) break;
      await sleep(100);
    }
    if (r.path !== sample || !r.parts) fail(r);
    return `${r.name}, ${r.parts} parts`;
  }, page);

  await step("Save As writes the file; Ctrl+S writes it back without a dialog", async () => {
    // app.run() does not hand back the save; call what File ▸ Save as / Save run.
    await page.ev(`await ${app}.save(true); return 1`);
    const files = fs.existsSync(saveDir) ? fs.readdirSync(saveDir).filter((n) => n.endsWith(".mycircuit")) : [];
    if (!files.length) fail("nothing saved");
    const saved = path.join(saveDir, files[0]);
    const r = await page.ev(`return { path: ${app}.store.filePath, dirty: ${app}.store.dirty }`);
    if (r.path !== saved || r.dirty) fail(r);
    const before = fs.readFileSync(saved, "utf8");
    await page.ev(`const p = ${app}.store.project; p.meta = { ...(p.meta || {}), title: "Saved by the desktop test" }; ${app}.store.dirty = true; await ${app}.save(); return 1`);
    const after = fs.readFileSync(saved, "utf8");
    if (after === before || !after.includes("Saved by the desktop test")) fail("Ctrl+S did not write the change");
    if (fs.readdirSync(saveDir).filter((n) => n.endsWith(".mycircuit")).length !== 1) fail("Ctrl+S asked for a new name");
    return files[0];
  }, page);

  await step("binary export (base64) arrives byte for byte", async () => {
    const r = await page.ev(`const bytes = new Uint8Array(256).map((_, i) => i); const out = await (await import("./src/ui/platform.js")).saveBinaryFile({ name: "bytes.bin", bytes, filters: [{ name: "Binary", extensions: ["bin"] }] }); return out && out.path`);
    const data = fs.readFileSync(r);
    if (data.length !== 256 || data.some((b, i) => b !== i)) fail(`got ${data.length} bytes`);
  }, page);

  await step("readPath of a missing file rejects cleanly", async () => {
    const r = await page.ev(`try { await (await import("./src/ui/platform.js")).readPath("C:/no/such/file.mycircuit"); return "resolved"; } catch (e) { return "rejected: " + e.message; }`);
    if (!r.startsWith("rejected")) fail(r);
  }, page);

  await step("Print ▸ Save as PDF writes an A4 landscape PDF", async () => {
    await page.ev(`${app}.setTab("sch"); return 1`);
    page.fire(`${app}.run("file.print")`);
    const d = await waitDialog(mainId, (i) => /^Print$/.test(i.title), 10000);
    await sleep(400);
    await clickButton(d.page, "Save as PDF…");
    d.page.close();
    const t0 = Date.now();
    let pdf = null;
    while (Date.now() - t0 < 20000 && !pdf) {
      const f = fs.existsSync(saveDir) && fs.readdirSync(saveDir).find((n) => n.endsWith(".pdf"));
      if (f && fs.statSync(path.join(saveDir, f)).size > 1000) pdf = path.join(saveDir, f);
      else await sleep(250);
    }
    if (!pdf) fail("no PDF written");
    await sleep(300);
    const text = fs.readFileSync(pdf).toString("latin1");
    const box = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (!text.startsWith("%PDF") || !box || Math.abs(+box[1] - 842) > 3 || Math.abs(+box[2] - 595) > 3 || pages < 1) fail({ head: text.slice(0, 8), box: box && box.slice(1), pages });
    return `${path.basename(pdf)}, ${pages} page(s), ${Math.round(+box[1])}×${Math.round(+box[2])} pt`;
  }, page);

  await step("user manual opens in its own window, once", async () => {
    await page.ev(`${app}.run("help.manual"); return 1`);
    await sleep(1500);
    await page.ev(`${app}.run("help.manual"); return 1`);
    await sleep(800);
    const manuals = (await targets()).filter((t) => /USERSGUIDE\.(en|ko)\.html/.test(t.url));
    if (manuals.length !== 1) fail(`${manuals.length} manual windows`);
    const m = await new Page(manuals[0]).open();
    const r = await m.ev(`return { h1: (document.querySelector("h1") || {}).textContent || "", imgs: document.images.length, broken: [...document.images].filter((i) => i.getAttribute("src") && i.complete && !i.naturalWidth).map((i) => i.getAttribute("src")) }`);
    // It wears the program's theme, and follows a change made while it is open.
    const bgOf = (p) => p.ev(`const c = document.createElement("canvas").getContext("2d"); c.fillStyle = getComputedStyle(document.body).backgroundColor; return c.fillStyle`);
    const appBg = () => page.ev(`const c = document.createElement("canvas").getContext("2d"); c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(); return c.fillStyle`);
    const before = { app: await appBg(), manual: await bgOf(m) };
    await page.ev(`${app}.setSetting("theme", ${app}.currentTheme().mode === "dark" ? "daylight" : "midnight"); return 1`);
    await sleep(500);
    const after = { app: await appBg(), manual: await bgOf(m), scheme: await m.ev(`return document.documentElement.dataset.appTheme`) };
    await page.ev(`${app}.setSetting("theme", "midnight"); return 1`);
    m.close();
    if (!r.h1 || r.broken.length) fail(r);
    if (before.manual !== before.app || after.manual !== after.app || after.app === before.app) fail({ before, after });
    return `${manuals[0].url.replace(/^.*\//, "")}: ${r.imgs} images`;
  }, page);

  await step("minimum size: the window grows to what the page asks for", async () => {
    // Never more than the screen can show (work area − 16 px).
    const r = await page.ev(`await window.mycircuit.setMinSize(1024, 700); const before = innerWidth; const want = Math.min(before + 60, screen.availWidth - 16); await window.mycircuit.setMinSize(before + 60, 700); await new Promise((r) => setTimeout(r, 400)); const after = innerWidth; ${app}.toolbarMinWidth = 0; ${app}.updateMinWidth(); return { before, want, after, screen: screen.availWidth }`);
    if (r.after < r.want - 1 || r.after > r.screen) fail(r);
    return `${r.before} → ${r.after} px`;
  }, page);

  await step("window buttons: maximise and restore", async () => {
    const click = async () => {
      const xy = await page.ev(`const q = document.querySelector(".win-btn.win-max").getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]`);
      await page.click(xy[0], xy[1]);
      await sleep(600);
      return page.ev(`return { max: await window.mycircuit.isMaximized(), cls: document.body.classList.contains("maximized"), w: innerWidth }`);
    };
    const a = await click();
    const b = await click();
    if (!a.max || !a.cls || b.max || b.cls || a.w <= b.w) fail({ a, b });
  }, page);

  await step("interface zoom (Settings ▸ Appearance) scales the webview", async () => {
    const base = await page.ev(`return devicePixelRatio`);
    await page.ev(`${app}.settings.uiScale = 1.25; ${app}.applySettings(); return 1`);
    await sleep(500);
    const zoomed = await page.ev(`return devicePixelRatio`);
    await page.ev(`${app}.settings.uiScale = 1; ${app}.applySettings(); return 1`);
    await sleep(500);
    const back = await page.ev(`return devicePixelRatio`);
    if (Math.abs(zoomed / base - 1.25) > 0.02 || Math.abs(back - base) > 0.01) fail({ base, zoomed, back });
  }, page);

  await step("a .mycircuit file dropped on the window opens", async () => {
    const before = await page.ev(`${app}.store.dirty = false; await ${app}.run("file.new"); await new Promise((r) => setTimeout(r, 300)); return ${app}.store.fileName`);
    if (before === path.basename(sample)) fail("File ▸ New kept the old project");
    const at = { x: 700, y: 400 };
    const data = { items: [], files: [sample], dragOperationsMask: 1 };
    for (const type of ["dragEnter", "dragOver", "drop"]) await page.send("Input.dispatchDragEvent", { type, ...at, data });
    await sleep(800);
    const r = await page.ev(`return { name: ${app}.store.fileName, parts: ${app}.store.project.schematic.parts.length }`);
    if (r.name !== path.basename(sample) || !r.parts) fail({ before, ...r });
  }, page);

  await step("closing with unsaved changes asks first; Cancel keeps the program", async () => {
    await page.ev(`${app}.store.dirty = true; ${app}.updateTitle(); return 1`);
    await page.ev(`${app}.run("file.exit"); return 1`);
    const d = await waitDialog(mainId, () => true, 6000);
    const buttons = await d.page.ev(`return [...document.querySelectorAll(".modal-foot button")].map((b) => b.textContent.trim())`);
    await d.page.key("Escape", "Escape", 27);
    d.page.close();
    await sleep(600);
    const alive = await page.ev(`return !!window.mycircuitApp`);
    if (!alive) fail("program closed");
    return `${d.info.title}: ${buttons.join(" / ")}`;
  }, page);

  await step("closing after discarding ends the program", async () => {
    await page.ev(`${app}.store.dirty = false; return 1`);
    page.fire(`${app}.run("file.exit")`);
    const code = await Promise.race([run.exited, sleep(8000).then(() => "still running")]);
    if (code === "still running") fail("the program did not exit");
    return `exit code ${code}`;
  });
  page.close();

  // A second start with a project named on the command line.
  run = await launch([sample]);
  await step("a .mycircuit named on the command line opens at start", async () => {
    let r = null;
    for (let i = 0; i < 60 && !(r && r.path === sample); i++) {
      r = await run.page.ev(`return { name: window.mycircuitApp.store.fileName, path: window.mycircuitApp.store.filePath }`);
      await sleep(100);
    }
    if (r.path !== sample) fail(r);
    return r.name;
  }, run.page);
} catch (e) {
  results.push({ name: "harness", ok: false, detail: String(e.message || e) });
  console.error(e);
} finally {
  if (run && !keep) { run.page.close(); run.child.kill(); await sleep(500); }
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* still locked */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n  ${failed.length ? "\x1b[41;37;1m DESKTOP TEST FAILED \x1b[0m" : "\x1b[42;30;1m ALL DESKTOP CHECKS PASSED \x1b[0m"}  ${results.length - failed.length}/${results.length} checks passed`);
for (const r of failed) console.log(`  \x1b[31m✖ ${r.name}: ${r.detail}\x1b[0m`);
process.exit(failed.length ? 1 : 0);
