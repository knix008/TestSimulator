// Dialog windows in the desktop app: every dialog opens as a window of its own
// (src/ui/widgets.js modal → a child BrowserWindow, electron/main.cjs), with
// the program icon and the window name in its title bar, movable anywhere —
// also outside the main window — and closed by its ✕, by Escape and by the OS.
//
//   npm run smoke:windows            (node test/smoke/windows-smoke.mjs [--shots dir])
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "./driver.mjs";

const shotsArg = process.argv.indexOf("--shots");
const shots = shotsArg > 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const C = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = C("32"), red = C("31"), dim = C("2"), bgGreen = C("42;30;1"), bgRed = C("41;37;1");
const results = [];
let a;
const app = (x) => a.ev(`const app = window.myarchApp; ${x}`);
async function step(name, fn) {
  let ok = true, detail = "";
  const before = a.errors.length;
  try { const r = await fn(); if (r === false) { ok = false; detail = "check failed"; } else if (typeof r === "string") detail = r; } catch (e) { ok = false; detail = String(e.message || e).split("\n")[0]; }
  if (a.errors.length > before) { ok = false; detail += ` | ${a.errors.slice(before).join(" | ").slice(0, 300)}`; }
  results.push({ name, ok, detail });
  console.log(`${ok ? green("✔") : red("✖")} ${name}${detail ? dim(`  — ${detail}`) : ""}`);
}
const fail = (x) => { throw new Error(typeof x === "string" ? x : JSON.stringify(x)); };

// A screenshot of a dialog window: its own DevTools target, found by title.
async function shotOf(title, file) {
  if (!shots) return;
  const list = await (await fetch(`http://127.0.0.1:${a.port}/json`)).json();
  const target = list.find((t) => t.type === "page" && t.title === title);
  if (!target) return;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const data = await new Promise((res) => { ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id === 1) res(msg.result && msg.result.data); }; ws.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params: { format: "png" } })); });
  ws.close();
  if (data) fs.writeFileSync(path.join(shots, file), Buffer.from(data, "base64"));
}

// What the top dialog window shows and where it is.
const TOP = `const ws = app.dialogWindows(); const w = ws[ws.length - 1];`;
const info = () => app(`${TOP} if (!w) return null; const d = w.document; const head = d.querySelector(".modal-head"); const ic = head && head.querySelector(".modal-icon svg");
  return { n: ws.length, title: d.title, headTitle: head ? head.querySelector(".modal-title > span:last-child").textContent : "", icon: ic ? head.querySelector(".modal-icon").dataset.icon : "", drag: head ? getComputedStyle(head).webkitAppRegion || getComputedStyle(head).getPropertyValue("-webkit-app-region") : "",
    x: w.screenX, y: w.screenY, w: w.outerWidth, h: w.outerHeight, inner: [w.innerWidth, w.innerHeight], fits: d.body.scrollWidth <= w.innerWidth + 1, inMain: !!document.querySelector(".modal-backdrop"), main: { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight } };`);
const waitWindows = async (n, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if ((await app(`return app.dialogWindows().length`)) >= n) return true; await sleep(100); } return false; };
const waitGone = async (n, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if ((await app(`return app.dialogWindows().length`)) <= n) return true; await sleep(100); } return false; };

// [command, title it shows (English)]
const icons = new Map(); // icon → the dialog that used it: every window its own
const DIALOGS = [
  ["help.about", "About MyArchitecture"], ["help.keys", "Keyboard shortcuts"], ["tools.settings", "Settings"], ["file.props", "Project properties"],
  ["build.wallTypes", "Wall types"], ["build.schedules", "Schedules and quantities"], ["build.types", "Type catalogue"], ["edit.history", "Undo history"],
  ["build.tower", "Lattice tower"], ["build.bridge", "Bridge"], ["file.print", "Print"], ["help.formats", "Supported file formats"],
];

a = await launch({ width: 1400, height: 900, windowedDialogs: true });
try {
  for (let i = 0; i < 80; i++) { if (await app(`return !!(app && app.store && app.dialogWindows)`).catch(() => false)) break; await sleep(250); }
  await app(`app.setSetting("lang", "en"); app.settings.onboarded = true; document.querySelectorAll(".modal-backdrop").forEach(e => e.remove()); return 1`);
  await app(`app.store.dirty = false; await app.openSample("03-two-storey-house.myarch"); app.setTab("plan"); return 1`);
  await sleep(800);
  // Close any dialog the start-up opened (welcome …).
  await app(`for (const w of app.dialogWindows()) w.close(); return 1`); await waitGone(0);

  for (const [cmd, title] of DIALOGS) {
    await step(`${cmd}: a window of its own with its own icon and "${title}" in its title bar`, async () => {
      await app(`setTimeout(() => app.run(${JSON.stringify(cmd)}), 0); return 1`);
      if (!(await waitWindows(1))) fail("no window opened");
      await sleep(400);
      const s = await info();
      await shotOf(s.title, `${cmd}.png`);
      const bad = [];
      if (s.inMain) bad.push("also drawn inside the main window");
      if (!s.icon) bad.push("no icon in the title bar");
      if (icons.has(s.icon)) bad.push(`same icon "${s.icon}" as ${icons.get(s.icon)}`);
      icons.set(s.icon, cmd);
      if (!s.headTitle || !s.title || s.headTitle !== s.title) bad.push(`title "${s.headTitle}" / window "${s.title}"`);
      if (!/drag/.test(s.drag)) bad.push(`title bar is not a drag handle (${s.drag})`);
      if (!s.fits) bad.push("content wider than the window");
      // Close with its ✕.
      await app(`${TOP} w.document.querySelector(".modal-head .icon-btn").click(); return 1`);
      if (!(await waitGone(0))) bad.push("✕ did not close the window");
      return bad.length ? fail(bad.join("; ")) : `icon ${s.icon}`;
    });
  }

  await step("a dialog window moves outside the main window", async () => {
    await app(`setTimeout(() => app.run("help.about"), 0); return 1`);
    if (!(await waitWindows(1))) fail("no window");
    const s0 = await info();
    // To the side of the main window that has room on this screen (left, right, else above).
    const scr = await app(`${TOP} return { l: screen.availLeft || 0, t: screen.availTop || 0, w: screen.availWidth, h: screen.availHeight, dw: w.document.documentElement.clientWidth, dh: w.document.documentElement.clientHeight }`);
    const m = s0.main;
    let tx = m.x, ty = m.y;
    if (m.x - scr.l >= scr.dw + 20) tx = m.x - scr.dw - 10;
    else if (scr.l + scr.w - (m.x + m.w) >= scr.dw + 20) tx = m.x + m.w + 10;
    else ty = Math.max(scr.t, m.y - scr.dh - 10);
    await app(`${TOP} w.moveTo(${tx}, ${ty}); return 1`); await sleep(500);
    const s1 = await info();
    await shotOf("About MyArchitecture", "moved.png");
    await app(`for (const w of app.dialogWindows()) w.close(); return 1`); await waitGone(0);
    const outside = s1.x + scr.dw <= m.x || s1.x >= m.x + m.w || s1.y + scr.dh <= m.y || s1.y >= m.y + m.h;
    const partly = s1.x !== s0.x || s1.y !== s0.y;
    return outside || (partly && m.w >= scr.w - 40 && m.h >= scr.h - 40) || fail({ wanted: [tx, ty], got: [s1.x, s1.y], main: m, screen: scr });
  });

  await step("Escape closes the dialog window and its promise answers null", async () => {
    const r = app(`const { modal, h } = await import("./src/ui/widgets.js"); const v = await modal({ title: "Escape test", body: h("p", {}, "Press Escape") }); return v === null ? "null" : String(v)`);
    if (!(await waitWindows(1))) fail("no window");
    await app(`${TOP} w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return 1`);
    const v = await r;
    return (v === "null" && (await waitGone(0))) || fail(v);
  });

  await step("closing the window from the system (Alt+F4) answers null too", async () => {
    const r = app(`const { modal, h } = await import("./src/ui/widgets.js"); const v = await modal({ title: "Close test", body: h("p", {}, "Close me") }); return v === null ? "null" : String(v)`);
    if (!(await waitWindows(1))) fail("no window");
    await app(`${TOP} w.close(); return 1`);
    const v = await r;
    const stuck = await app(`const { anyModalOpen } = await import("./src/ui/widgets.js"); return anyModalOpen()`);
    return (v === "null" && !stuck) || fail({ v, stuck });
  });

  await step("Enter presses the primary button and returns its value", async () => {
    const r = app(`const { modal, h } = await import("./src/ui/widgets.js"); return await modal({ title: "Enter test", body: h("input", { class: "input" }), buttons: [{ label: "Cancel", value: null }, { label: "OK", value: "ok", primary: true }] })`);
    if (!(await waitWindows(1))) fail("no window");
    await sleep(200);
    await app(`${TOP} w.document.querySelector("input").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return 1`);
    return (await r) === "ok" || fail("not ok");
  });

  await step("a dialog opened from a dialog is a window of its own on top of it", async () => {
    await app(`setTimeout(() => app.run("tools.settings"), 0); return 1`);
    if (!(await waitWindows(1))) fail("no first window");
    const r = app(`const { modal, h } = await import("./src/ui/widgets.js"); return await modal({ title: "Nested", body: h("p", {}, "on top") })`);
    if (!(await waitWindows(2))) fail("no second window");
    const s = await info();
    await shotOf("Nested", "nested.png");
    await app(`${TOP} w.close(); return 1`); await r;
    const left = await app(`return app.dialogWindows().length`);
    await app(`for (const w of app.dialogWindows()) w.close(); return 1`); await waitGone(0);
    return (s.n === 2 && s.title === "Nested" && left === 1) || fail({ s, left });
  });

  await step("menus and pickers opened in a dialog show in that window", async () => {
    await app(`setTimeout(() => app.run("build.bridge"), 0); return 1`);
    if (!(await waitWindows(1))) fail("no window");
    await sleep(300);
    await app(`${TOP} w.document.querySelector(".mat-pick").click(); return 1`); await sleep(400);
    const r = await app(`${TOP} return { inDialog: !!w.document.querySelector(".mat-pop"), inMain: !!document.querySelector(".mat-pop") }`);
    await shotOf("Bridge", "bridge-picker.png");
    await app(`${TOP} const t = w.document.querySelector(".mat-pop .mat-tile[data-mat='concrete-dark']"); if (t) t.click(); return 1`); await sleep(200);
    const picked = await app(`${TOP} return w.document.querySelector(".mat-pick .mat-name").textContent`);
    await app(`for (const w of app.dialogWindows()) w.close(); return 1`); await waitGone(0);
    return (r.inDialog && !r.inMain && /Dark concrete/.test(picked)) || fail({ r, picked });
  });

  await step("a dialog's OK still edits the project (lattice tower)", async () => {
    const n0 = await app(`return app.store.project.members.length`);
    await app(`setTimeout(() => app.run("build.tower"), 0); return 1`);
    if (!(await waitWindows(1))) fail("no window");
    await sleep(300);
    await app(`${TOP} [...w.document.querySelectorAll(".modal-foot .btn")].find(b => b.classList.contains("primary")).click(); return 1`);
    await waitGone(0); await sleep(300);
    const n1 = await app(`return app.store.project.members.length`);
    return n1 > n0 || fail({ n0, n1 });
  });
} finally {
  await a.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n  ${failed.length ? bgRed(" DIALOG WINDOWS FAILED ") : bgGreen(" DIALOG WINDOWS PASSED ")}  ${results.length - failed.length}/${results.length} checks`);
process.exit(failed.length ? 1 : 0);
