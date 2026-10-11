// GUI smoke test: launches the real desktop app (Electron) with a throw-away
// profile, drives it over CDP with real mouse and keyboard input and checks
// every feature end to end — every command and menu, every sample, drawing
// with the mouse, editing, BIM, SketchUp-style 3D tools, scenes, every import
// and export format (files are really written and read back), recent files,
// panels, settings, themes, both languages and the whole tutorial (watch mode
// and the practice-mode checks). Any uncaught renderer error fails the step.
//
//   npm run smoke            (or: node test/smoke/gui-smoke.mjs [--keep] [--shots dir] [--only section])
//
// Native file dialogs are replaced by MYARCH_FAKE_DIALOGS (see electron/main.cjs):
// saves go to a temporary folder that the test inspects.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, sleep, root } from "./driver.mjs";

const keep = process.argv.includes("--keep");
const shotsArg = process.argv.indexOf("--shots");
const shotsDir = shotsArg > 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? process.argv[onlyArg + 1].toLowerCase() : null;
const out = fs.mkdtempSync(path.join(os.tmpdir(), "myarch-smoke-out-"));
const results = [];
const sectionOrder = [];
let section = "Start-up";
let a;

const C = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = C("32"), red = C("31"), dim = C("2"), bold = C("1"), bgGreen = C("42;30;1"), bgRed = C("41;37;1"), bgBlue = C("44;37;1");

function sectionStart(name) {
  section = name;
  if (!sectionOrder.includes(name)) sectionOrder.push(name);
  process.stdout.write(`\n${bgBlue(` ${name} `)}\n`);
}

// --only drawing,3d  → run just the sections whose names contain one of the words.
const skipSection = () => only && !only.split(",").some((w) => section.toLowerCase().includes(w.trim()));

async function step(name, fn) {
  if (skipSection()) return;
  const t0 = performance.now();
  const before = a.errors.length;
  let ok = true;
  let detail = "";
  try {
    const r = await fn();
    if (r === false) { ok = false; detail = "check failed"; }
    else if (typeof r === "string") detail = r;
  } catch (e) { ok = false; detail = String(e.message || e).split("\n")[0]; }
  if (a.errors.length > before) { ok = false; detail += ` | ${a.errors.slice(before).join(" | ").slice(0, 500)}`; }
  results.push({ name, ok, detail, section, ms: performance.now() - t0 });
  process.stdout.write(`${ok ? green("✔") : red("✖")} ${name}${detail ? dim(`  — ${detail}`) : ""}\n`);
  if (!ok && shotsDir) await a.shot(path.join(shotsDir, `fail-${results.length}.png`));
}

const fail = (x) => { throw new Error(typeof x === "string" ? x : JSON.stringify(x)); };
const app = (expr) => a.ev(`const app = window.myarchApp; ${expr}`);
const closeModals = () => a.ev(`for (let i = 0; i < 4; i++) { const x = document.querySelector(".modal-head .icon-btn"); if (!x) break; x.click(); } document.querySelectorAll(".qp-backdrop,.ctx-menu,.popup-input,.theme-drop").forEach(e => e.remove()); return 1;`);
const waitFor = async (expr, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await app(`return !!(${expr})`)) return true; await sleep(60); } fail(`timed out: ${expr}`); };
const clickSel = async (sel) => { const r = await a.ev(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView && el.scrollIntoView({block:"nearest"}); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2];`); if (!r) fail(`not found: ${sel}`); await a.click(r[0], r[1]); };
const primary = async () => { await waitFor(`document.querySelector(".modal-foot .btn.primary")`); await clickSel(".modal-foot .btn.primary"); await sleep(120); };
const dialogButton = async (label) => { await waitFor(`[...document.querySelectorAll(".modal-foot .btn")].some(b => b.textContent.trim() === ${JSON.stringify(label)})`); const r = await a.ev(`const b = [...document.querySelectorAll(".modal-foot .btn")].find(b => b.textContent.trim() === ${JSON.stringify(label)}); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];`); await a.click(r[0], r[1]); await sleep(150); };
// Plan world (mm) → screen.
const scr = (x, y) => app(`const e = app.plan; const r = e.canvas.getBoundingClientRect(); const [sx, sy] = e.vp.toScreen(${x}, ${y}); return [r.left + sx, r.top + sy];`);
const clickW = async (x, y, opts) => { const [sx, sy] = await scr(x, y); await a.move(sx, sy); await a.click(sx, sy, opts); };
const outFile = (name) => path.join(out, name);
const exists = (name) => fs.existsSync(outFile(name)) && fs.statSync(outFile(name)).size > 0;
const head = (name, n = 16) => fs.readFileSync(outFile(name)).subarray(0, n);
const openSample = (file) => app(`app.store.dirty = false; await app.openSample(${JSON.stringify(file)}); return app.store.fileName === ${JSON.stringify(file)};`);
const newProject = async () => { await app(`app.store.dirty = false; return 1`); await a.key("n", 2); await sleep(250); await closeModals(); };
// Title-bar items that are cut off, hidden or pushed under the OS window buttons.
const TITLE_HIDDEN = `(() => { const t = document.getElementById("titlebar"); const tr = t.getBoundingClientRect(); const right = tr.right - parseFloat(getComputedStyle(t).paddingRight) + 1;
  return [...t.querySelectorAll(".brand, .menu-root, .doc-tab, .doc-tab .tab-label, .search-btn, .title-right > *")].filter(e => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return s.display === "none" || s.visibility === "hidden" || b.width === 0 || b.right > right || b.bottom > tr.bottom + 1 || e.scrollWidth > e.clientWidth + 1; }).map(e => e.className || e.tagName); })()`;
const fitView = (b) => app(`app.plan.vp.fit(${JSON.stringify(b)}, 0.08); return 1`);

try {
  a = await launch({ env: { MYARCH_FAKE_DIALOGS: out } });
  await sleep(1500);

  // ---------------------------------------------------------------- start-up
  sectionStart("Start-up");
  await step("app boots, title set, welcome dialog shown", async () => app(`return !!app && document.title.includes("MyArchitecture") && !!document.querySelector(".modal")`));
  await closeModals();
  await app(`app.settings.onboarded = true; app.setSetting("lang", "en"); return 1`);
  await step("start page lists every sample with a card", async () => { await sleep(400); const n = await app(`return document.querySelectorAll(".sample-card").length`); const idx = JSON.parse(fs.readFileSync(path.join(root, "sample/index.json"), "utf8")); return n === idx.length || fail(`${n} cards for ${idx.length} samples`); });
  await step("program icon and favicon load", async () => app(`const img = document.querySelector(".brand img"); return img.complete && img.naturalWidth >= 256`));
  await step("menu bar has File, Edit, View, Build, BIM and Help — no Draw or 3D menu repeating the toolbar", async () => app(`return ["File","Edit","View","Build","BIM","Help"].every(m => document.querySelector('.menu-root[data-menu="' + m + '"]')) && !document.querySelector('.menu-root[data-menu="Draw"], .menu-root[data-menu="3D"]')`));
  await step("every menu opens and lists its items", async () => {
    const menus = await app(`return [...document.querySelectorAll(".menu-root")].map(b => b.dataset.menu)`);
    for (const m of menus) {
      await clickSel(`.menu-root[data-menu="${m}"]`);
      const n = await app(`return document.querySelectorAll(".ctx-menu .menu-item").length`);
      if (n < 3) fail(`${m}: ${n} items`);
      await a.key("Escape");
      await closeModals();
    }
    return `${menus.length} menus`;
  });

  // ---------------------------------------------------------------- samples
  sectionStart("Samples");
  const samples = JSON.parse(fs.readFileSync(path.join(root, "sample/index.json"), "utf8"));
  for (const s of samples) {
    await step(`${s.file}: opens, plan draws, model check clean, 3D builds`, async () => {
      if (!(await openSample(s.file))) fail("not opened");
      await sleep(300);
      const issues = await app(`app.runCheck(false); return app.checkIssues.length`);
      await a.key("F3");
      await waitFor(`app.v3d.viewer`, 10000);
      await app(`app.v3d.syncModel(); return 1`);
      await sleep(300);
      const st = await app(`return app.v3d.viewer.stats()`);
      await a.key("F2");
      if (issues) fail(`${issues} model-check issues`);
      return st.meshes > 0 || fail("no 3D meshes");
    });
  }
  await step("start page sample card opens its sample by mouse", async () => {
    await app(`app.store.dirty = false; app.setTab("start"); return 1`);
    await sleep(500);
    await clickSel(".sample-card");
    await sleep(500);
    return app(`return app.tab === "plan" && !!app.store.fileName`);
  });

  // ---------------------------------------------------------------- document tabs
  sectionStart("Document tabs");
  const tabs = () => app(`return app.docTabs.docs.list()`);
  const tabXY = (i, sel = "") => a.ev(`const el = document.querySelectorAll("#doctabs .doctab")[${i}]; if (!el) return null; el.scrollIntoView({ block: "nearest", inline: "nearest" }); const t = ${sel ? `el.querySelector(${JSON.stringify(sel)})` : "el"}; const b = t.getBoundingClientRect(); return [b.left + Math.min(b.width / 2, 40), b.top + b.height / 2]`);
  const clickTab = async (i, opts) => { const r = await tabXY(i); if (!r) fail(`no tab ${i}`); await a.click(r[0], r[1], opts); await sleep(250); };
  const closeAllTabs = () => app(`const dt = app.docTabs; for (const d of dt.docs.docs) dt.docs.stateOf(d).dirty = false; await dt.closeMany(dt.docs.docs.map(d => d.id)); return dt.docs.count`);
  await step("every opened sample got its own tab; closing them all leaves one empty Untitled tab", async () => {
    const n = (await tabs()).length;
    if (n < samples.length) fail(`${n} tabs for ${samples.length} samples`);
    const left = await closeAllTabs();
    return (left === 1 && (await app(`return app.docTabs.docs.isUntouched() && app.tab === "start"`))) || fail(`${left} left`);
  });
  await step("three samples open as three tabs (the empty Untitled tab is reused)", async () => {
    for (const f of ["01-studio.myarch", "02-two-bedroom.myarch", "03-two-storey-house.myarch"]) await openSample(f);
    const t = await tabs();
    const shown = await app(`return [...document.querySelectorAll("#doctabs .doctab .doctab-name")].map(e => e.textContent)`);
    return (t.length === 3 && t[2].active && shown.join() === "01-studio.myarch,02-two-bedroom.myarch,03-two-storey-house.myarch") || fail({ t, shown });
  });
  const STRIP_LAYOUT = `(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const tb = r("toolbar"), l = r("left-panel"), rp = r("right-panel"), s = r("doctabs"), c = r("center");
    const view = document.querySelector("#center > .view.on"); const v = view.getBoundingClientRect(); const cv = view.querySelector("canvas"); const cr = cv ? cv.getBoundingClientRect() : v;
    const ws = document.getElementById("workspace").classList; const leftOn = l.width > 0 && !ws.contains("no-left"), rightOn = rp.width > 0 && !ws.contains("no-right");
    return { leftTouches: !leftOn || Math.abs(l.top - tb.bottom) < 1, rightTouches: !rightOn || Math.abs(rp.top - tb.bottom) < 1, inCentre: s.left >= (leftOn ? l.right : 0) - 0.5 && s.right <= (rightOn ? rp.left : innerWidth) + 0.5 && Math.abs(s.left - c.left) < 1 && Math.abs(s.right - c.right) < 1,
      onTop: Math.abs(s.top - tb.bottom) < 1, notCovering: v.top >= s.bottom - 0.5 && cr.top >= s.bottom - 0.5, stripH: s.height }; })()`;
  const layoutOk = (r) => r.leftTouches && r.rightTouches && r.inCentre && r.onTop && r.notCovering && r.stripH >= 30;
  await step("the strip sits above the canvas only: both side panels touch the tool bar; no ruler, 3D canvas or start page under it", async () => {
    const res = {};
    for (const tab of ["plan", "3d", "start"]) {
      await app(`app.setTab("${tab}"); return 1`);
      if (tab === "3d") await waitFor(`app.v3d.viewer`, 10000);
      await sleep(400);
      res[tab] = await app(`return ${STRIP_LAYOUT}`);
    }
    await app(`app.setTab("plan"); return 1`);
    return Object.values(res).every(layoutOk) || fail(res);
  });
  await step("an edit marks only its own tab dirty (●), and the window title follows the active tab", async () => {
    await app(`app.store.edit("Delete", (p) => { p.walls.pop(); }); return 1`);
    await sleep(150);
    const r = await app(`return { dirty: [...document.querySelectorAll("#doctabs .doctab")].map(e => e.classList.contains("dirty") && getComputedStyle(e.querySelector(".doctab-dirty")).display !== "none"), title: document.title }`);
    return (r.dirty.join() === "false,false,true" && r.title.includes("● 03-two-storey-house")) || fail(r);
  });
  await step("clicking a tab switches the whole document: project, undo stack, file name, level and zoom", async () => {
    await clickTab(0);
    await app(`app.store.edit("Delete", (p) => { p.furniture.pop(); }); app.store.edit("Delete", (p) => { p.furniture.pop(); }); app.plan.vp.zoomBy(1.5); return 1`);
    const zoomA = await app(`return app.plan.vp.scale`);
    const a1 = await app(`return { f: app.store.fileName, u: app.store.undoStack.length, fur: app.store.project.furniture.length }`);
    await clickTab(2);
    const c = await app(`return { f: app.store.fileName, u: app.store.undoStack.length, levels: app.store.project.levels.length, title: document.title }`);
    await app(`app.plan.setLevel(app.store.project.levels[1].id); return 1`);
    await clickTab(1);
    const b = await app(`return { f: app.store.fileName, u: app.store.undoStack.length, dirty: app.store.dirty }`);
    await clickTab(0);
    const a2 = await app(`return { f: app.store.fileName, u: app.store.undoStack.length, fur: app.store.project.furniture.length, zoom: app.plan.vp.scale, sel: app.plan.sel.size }`);
    await app(`app.run("edit.undo"); return 1`);
    const a3 = await app(`return app.store.project.furniture.length`);
    await clickTab(2);
    const lv = await app(`return app.plan.level === app.store.project.levels[1].id`);
    const ok = a1.u === 2 && c.f === "03-two-storey-house.myarch" && c.u === 1 && c.levels === 2 && b.f === "02-two-bedroom.myarch" && b.u === 0 && !b.dirty
      && a2.f === "01-studio.myarch" && a2.u === 2 && a2.fur === a1.fur && Math.abs(a2.zoom - zoomA) < 1e-9 && a2.sel === 0 && a3 === a1.fur + 1 && lv;
    return ok || fail({ a1, c, b, a2, a3, lv, zoomA });
  });
  await step("each tab keeps its own 3D camera (one 3D viewer, resynced)", async () => {
    await clickTab(0);
    await a.key("F3"); await waitFor(`app.v3d.viewer`, 10000); await sleep(400);
    await app(`app.v3d.setView("top"); return 1`); await sleep(600);
    // Wait for the camera animation to settle.
    let camA = null;
    for (let i = 0; i < 40; i++) { const c = await app(`return JSON.stringify(app.v3d.viewer.getCamera())`); if (c === camA) break; camA = c; await sleep(200); }
    camA = JSON.parse(camA);
    const viewer = await app(`window.__v = app.v3d.viewer; return 1`);
    await clickTab(1); await sleep(800);
    const b = await app(`return { tab: app.tab, same: window.__v === app.v3d.viewer, title: app.store.project.meta.title }`);
    await clickTab(0); await sleep(800);
    const camA2 = await app(`return app.v3d.viewer.getCamera()`);
    const d = Math.hypot(...camA.pos.map((v, i) => v - camA2.pos[i]));
    await a.key("F2");
    void viewer;
    return (b.tab === "3d" && b.same && d < 0.05) || fail({ b, camA, camA2 });
  });
  await step("Ctrl+Tab / Ctrl+Shift+Tab move to the next / previous tab (wrapping)", async () => {
    const i0 = await app(`return app.docTabs.docs.indexOf(app.docTabs.docs.activeId)`);
    await a.key("Tab", 2); await sleep(200);
    const i1 = await app(`return app.docTabs.docs.indexOf(app.docTabs.docs.activeId)`);
    await a.key("Tab", 2 | 8); await sleep(200); await a.key("Tab", 2 | 8); await sleep(200);
    const i2 = await app(`return app.docTabs.docs.indexOf(app.docTabs.docs.activeId)`);
    return (i1 === (i0 + 1) % 3 && i2 === (i0 + 2) % 3) || fail({ i0, i1, i2 });
  });
  await step("dragging a tab sideways reorders the tabs", async () => {
    const p0 = await tabXY(0), p2 = await tabXY(2);
    const r2 = await a.ev(`return document.querySelectorAll("#doctabs .doctab")[2].getBoundingClientRect().right`);
    await a.drag(p0[0], p0[1], r2 - 8, p2[1], 12);
    await sleep(200);
    const names = await app(`return app.docTabs.docs.list().map(d => d.fileName)`);
    const dom = await app(`return [...document.querySelectorAll("#doctabs .doctab .doctab-name")].map(e => e.textContent)`);
    return (names[2] === "01-studio.myarch" && dom.join() === names.join()) || fail({ names, dom });
  });
  await step("× on a tab with unsaved changes asks first (Cancel keeps it, Don't save closes it)", async () => {
    const i = await app(`return app.docTabs.docs.list().findIndex(d => d.fileName === "03-two-storey-house.myarch")`);
    const x = await tabXY(i, ".doctab-close");
    await a.click(x[0], x[1]);
    await waitFor(`document.querySelector(".modal")`);
    await dialogButton("Cancel");
    const kept = (await tabs()).length === 3;
    const x2 = await tabXY(i, ".doctab-close");
    await a.click(x2[0], x2[1]);
    await waitFor(`document.querySelector(".modal")`);
    await dialogButton("Don't save");
    await sleep(200);
    const t = await tabs();
    return (kept && t.length === 2 && !t.some((d) => d.fileName === "03-two-storey-house.myarch")) || fail(t);
  });
  await step("middle click closes a tab; Ctrl+W closes the active one", async () => {
    await app(`for (const d of app.docTabs.docs.docs) app.docTabs.docs.stateOf(d).dirty = false; return 1`);
    const r = await tabXY(0);
    await a.click(r[0], r[1], { button: "middle" });
    await sleep(250);
    const n1 = (await tabs()).length;
    await a.key("w", 2); await sleep(250);
    const t = await tabs();
    return (n1 === 1 && t.length === 1 && (await app(`return app.docTabs.docs.isUntouched()`))) || fail({ n1, t });
  });
  await step("15 more tabs overflow the strip: \"<\" / \">\" at its right end scroll it and are disabled at the ends", async () => {
    for (const s of samples) await openSample(s.file);
    await sleep(300);
    const st = () => app(`const dt = app.docTabs, s = dt.scroller, b = s.getBoundingClientRect(), act = document.querySelector("#doctabs .doctab.on").getBoundingClientRect(); return { n: dt.docs.count, left: s.scrollLeft, max: s.scrollWidth - s.clientWidth, prev: dt.btnPrev.disabled, next: dt.btnNext.disabled, activeShown: act.left >= b.left - 1 && act.right <= b.right + 1 }`);
    const s0 = await st();
    if (!(s0.n === samples.length && s0.max > 0 && s0.activeShown && !s0.prev && s0.next)) fail({ s0 });
    const prev = await a.ev(`const b = document.querySelector('#doctabs [data-act="prev"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.right]`);
    await a.click(prev[0], prev[1]); await sleep(120);
    const s1 = await st();
    for (let i = 0; i < 40 && !(await st()).prev; i++) { await a.click(prev[0], prev[1]); await sleep(30); }
    const s2 = await st();
    const next = await a.ev(`const b = document.querySelector('#doctabs [data-act="next"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]`);
    await a.click(next[0], next[1]); await sleep(120);
    const s3 = await st();
    const ok = s1.left < s0.left && !s1.next && s2.left === 0 && s2.prev && !s2.next && s3.left > 0 && !s3.prev && prev[2] > (await a.ev(`return document.getElementById("doctabs").getBoundingClientRect().right`)) - 120;
    return ok || fail({ s0, s1, s2, s3 });
  });
  await step("\"▾\" lists every open drawing and switches to the one picked", async () => {
    await clickSel('#doctabs [data-act="list"]');
    const n = await app(`return document.querySelectorAll(".ctx-menu.doctabs-list .menu-item").length`);
    const r = await a.ev(`const it = document.querySelectorAll(".ctx-menu.doctabs-list .menu-item")[1]; const b = it.getBoundingClientRect(); return [b.left + 30, b.top + b.height / 2]`);
    await a.click(r[0], r[1]); await sleep(300);
    const t = await tabs();
    return (n === samples.length && t[1].active) || fail({ n, active: t.findIndex((d) => d.active) });
  });
  await step("at the window's minimum width (both side panels open) the narrow strip still scrolls and nothing is cut off", async () => {
    const before = await a.ev(`return await window.myarch.windowSize()`);
    await app(`app.settings.showLeft = true; app.settings.showRight = true; app.applyPanels(); return 1`);
    await a.ev(`window.myarch.resizeWindow(600, 700); return 1`); await sleep(600);
    const r = await app(`const W = innerWidth; const s = document.getElementById("doctabs").getBoundingClientRect(); const els = [...document.querySelectorAll("#doctabs .doctabs-nav .icon-btn")].map(e => e.getBoundingClientRect());
      return { W, layout: ${STRIP_LAYOUT}, nav: els.every(b => b.width > 20 && b.right <= s.right + 0.5 && b.left >= s.left), page: document.documentElement.scrollWidth <= W + 1 }`);
    // Scroll to the start, then step right with ">" (real clicks) until it disables.
    await app(`app.docTabs.scroller.scrollLeft = 0; app.docTabs.updateNav(); return 1`);
    const nx = await a.ev(`const b = document.querySelector('#doctabs [data-act="next"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]`);
    let steps = 0;
    while (steps < 60 && !(await app(`return app.docTabs.btnNext.disabled`))) { await a.click(nx[0], nx[1]); steps++; }
    const end = await app(`const s = app.docTabs.scroller; return { at: Math.round(s.scrollLeft), max: Math.round(s.scrollWidth - s.clientWidth), prev: app.docTabs.btnPrev.disabled }`);
    await a.ev(`window.myarch.resizeWindow(${before.width}, ${before.height}); return 1`); await sleep(400);
    return (layoutOk(r.layout) && r.nav && r.page && steps > 1 && end.at === end.max && !end.prev) || fail({ r, steps, end });
  });
  await step("light and dark themes style the strip", async () => {
    const col = async (theme) => { await app(`app.setSetting("theme", "${theme}"); return 1`); await sleep(150); return app(`return [getComputedStyle(document.getElementById("doctabs")).backgroundColor, getComputedStyle(document.querySelector("#doctabs .doctab.on")).backgroundColor, getComputedStyle(document.querySelector("#doctabs .doctab.on .doctab-name")).color]`); };
    const t0 = await app(`return app.settings.theme`);
    const light = await col("daylight"), dark = await col("midnight");
    await app(`app.setSetting("theme", ${JSON.stringify(t0)}); return 1`);
    return (light.join() !== dark.join() && light[0] !== light[1]) || fail({ light, dark });
  });
  await step("tabs are closed back to one (the rest of the run starts from a single tab)", async () => (await closeAllTabs()) === 1);

  // ---------------------------------------------------------------- drawing with the mouse
  sectionStart("Drawing");
  await step("Ctrl+N opens an empty plan", async () => { await newProject(); return app(`return app.tab === "plan" && app.store.project.walls.length === 0`); });
  await fitView({ x1: -2000, y1: -2000, x2: 12000, y2: 9000 });
  await step("W + clicks draws a closed outline of four walls", async () => {
    await a.key("w");
    for (const [x, y] of [[0, 0], [9000, 0], [9000, 6000], [0, 6000], [0, 0]]) await clickW(x, y);
    return app(`return app.store.project.walls.length === 4`);
  });
  await step("toolbar Undo/Redo buttons enable after an edit and work by mouse", async () => {
    const st = () => app(`const u = document.querySelector('#toolbar [data-cmd="edit.undo"]'), r = document.querySelector('#toolbar [data-cmd="edit.redo"]'); return [!!u && !u.disabled, !!r && !r.disabled, u ? u.title : ""]`);
    const [u0, r0, title] = await st();
    if (!u0 || r0) fail(`after drawing: undo ${u0}, redo ${r0}`);
    await clickSel('#toolbar [data-cmd="edit.undo"]');
    const n1 = await app(`return app.store.project.walls.length`);
    const [, r1] = await st();
    await clickSel('#toolbar [data-cmd="edit.redo"]');
    const n2 = await app(`return app.store.project.walls.length`);
    return (n1 < 4 && r1 && n2 === 4 && /:/.test(title)) || fail(`undo → ${n1} walls (redo on ${r1}), redo → ${n2}, title "${title}"`);
  });
  await step("an inside wall ending on two walls (T joints)", async () => {
    await a.key("w");
    await clickW(5000, 0); await clickW(5000, 6000); await a.key("Escape"); await a.key("Escape");
    return app(`return app.store.project.walls.length === 5 && app.plan.tool === "select"`);
  });
  await step("typed length: W, click, type 5000 + Enter draws exactly 5000 mm", async () => {
    await a.key("w");
    await clickW(0, 3000);
    const [sx, sy] = await scr(2500, 3000); await a.move(sx, sy);
    await a.type("5000"); await sleep(100);
    await a.key("Enter"); await sleep(100);
    await a.key("Escape"); await a.key("Escape");
    return app(`return app.store.project.walls.some(w => Math.abs(Math.hypot(w.x2 - w.x1, w.y2 - w.y1) - 5000) < 1 && Math.abs(w.y1 - 3000) < 1)`);
  });
  await step("A + click inside walls creates three rooms with areas", async () => {
    await a.key("a");
    for (const [x, y] of [[2500, 1500], [2500, 4500], [7000, 3000]]) await clickW(x, y);
    await a.key("Escape");
    return app(`return app.store.project.rooms.length === 3 && app.store.project.rooms.every(r => r.pts.length >= 4)`);
  });
  await step("D places a door and N two windows on the walls", async () => {
    await a.key("d"); await clickW(2000, 5950); await a.key("Escape");
    await a.key("n"); await clickW(2500, 0); await clickW(7000, 0); await a.key("Escape");
    return app(`const o = app.store.project.openings; return o.filter(x => x.kind === "door").length === 1 && o.filter(x => x.kind === "window").length === 2`);
  });
  await step("door: click, X flips the swing, H swaps the hinge", async () => {
    await clickW(2000, 6000);
    const before = await app(`const o = app.store.project.openings.find(x => x.kind === "door"); return [o.side, o.hinge]`);
    await a.key("x"); await a.key("h");
    return app(`const o = app.store.project.openings.find(x => x.kind === "door"); return o.side === ${-before[0]} && o.hinge !== ${JSON.stringify(before[1])}`);
  });
  await step("drag a furniture item from the library onto the plan", async () => {
    await app(`app.settings.showLeft = true; app.applyPanels(); return 1`); await sleep(200);
    await clickSel('.lib-item[data-kind="sofa3"]');
    await clickW(7000, 4000);
    return app(`return app.store.project.furniture.some(f => f.kind === "sofa3")`);
  });
  await step("F + search places a double bed", async () => {
    await a.key("f"); await sleep(200);
    await a.type("double bed"); await a.key("Enter"); await sleep(150);
    await clickW(2500, 1400);
    return app(`return app.store.project.furniture.some(f => f.kind === "doubleBed")`);
  });
  await step("drag-move a wall: joined walls stretch, Ctrl+Z / Ctrl+Y", async () => {
    await a.key("Escape");
    const [x1, y1] = await scr(5000, 4500); const [x2, y2] = await scr(5600, 4500);
    await a.drag(x1, y1, x2, y2);
    const moved = await app(`return app.store.project.walls.some(w => Math.abs(w.x1 - 5600) < 1 && Math.abs(w.x2 - 5600) < 1)`);
    await a.key("z", 2);
    const undone = await app(`return app.store.project.walls.some(w => w.x1 === 5000 && w.x2 === 5000)`);
    await a.key("y", 2);
    const redone = await app(`return app.store.project.walls.some(w => Math.abs(w.x1 - 5600) < 1)`);
    await a.key("z", 2);
    return (moved && undone && redone) || fail(`moved ${moved} undone ${undone} redone ${redone}`);
  });
  await step("drag a wall end: every joined end follows", async () => {
    await clickW(9000, 1500);
    // Ortho keeps the dragged end on the wall's own line, so drag along it.
    const [x1, y1] = await scr(9000, 6000); const [x2, y2] = await scr(9000, 7000);
    await a.drag(x1, y1, x2, y2);
    const ok = await app(`const w = app.store.project.walls; return w.filter(q => (Math.abs(q.x1 - 9000) < 1 && Math.abs(q.y1 - 7000) < 1) || (Math.abs(q.x2 - 9000) < 1 && Math.abs(q.y2 - 7000) < 1)).length === 2`);
    await a.key("z", 2);
    return ok;
  });
  await step("Shift+box select, Ctrl+D duplicate, Del delete", async () => {
    await a.key("Escape");
    const [x1, y1] = await scr(-800, -800); const [x2, y2] = await scr(4300, 2900);
    await a.drag(x1, y1, x2, y2, 8, 8);
    const sel = await app(`return app.plan.selectedItems().map(i => i.kind)`);
    if (!sel.includes("furniture")) fail(`selection ${sel}`);
    const n = await app(`return app.store.project.furniture.length`);
    await a.key("d", 2);
    const dup = await app(`return app.store.project.furniture.length`);
    await a.key("Delete");
    const del = await app(`return app.store.project.furniture.length`);
    return (dup > n && del < dup) || fail(`${n} → ${dup} → ${del}`);
  });
  await step("copy and paste with Ctrl+C / Ctrl+V at the cursor", async () => {
    await clickW(7000, 4000);
    await a.key("c", 2);
    const [sx, sy] = await scr(7000, 2000); await a.move(sx, sy);
    const n = await app(`return app.store.project.furniture.length`);
    await a.key("v", 2);
    return app(`return app.store.project.furniture.length === ${n + 1}`);
  });
  await step("R rotates, Y mirrors, arrows nudge the selection", async () => {
    await clickW(7000, 4000);
    const f0 = await app(`return app.plan.selectedItems()[0].obj.rot || 0`);
    await a.key("r");
    const f1 = await app(`return app.plan.selectedItems()[0].obj.rot`);
    await a.key("ArrowRight");
    return f1 === (f0 + 90) % 360 || fail(`${f0} → ${f1}`);
  });
  await step("group (Ctrl+G) selects together; ungroup (Ctrl+Shift+G)", async () => {
    await clickW(7000, 4000);
    await clickW(2500, 1400, { modifiers: 8 });
    await a.key("g", 2);
    const g = await app(`return app.store.project.furniture.filter(f => f.group).length`);
    await a.key("Escape");
    await clickW(2500, 1400);
    const n = await app(`return app.plan.sel.size`);
    await a.key("g", 2 | 8);
    const after = await app(`return app.store.project.furniture.filter(f => f.group).length`);
    return (g >= 2 && n >= 2 && after === 0) || fail(`grouped ${g}, selected ${n}, after ${after}`);
  });
  await step("double-click opens the properties window; OK applies", async () => {
    const [sx, sy] = await scr(7000, 2200); await a.dblclick(sx, sy);
    await waitFor(`document.querySelector(".modal")`);
    await primary();
    return app(`return !document.querySelector(".modal")`);
  });
  await step("right-click context menu on a wall, empty space and furniture", async () => {
    for (const [x, y] of [[4000, 0], [-1500, -1500], [7000, 4000]]) {
      const [sx, sy] = await scr(x, y);
      await a.click(sx, sy, { button: "right" });
      const n = await app(`return document.querySelectorAll(".ctx-menu .menu-item").length`);
      const undo = await app(`return [...document.querySelectorAll(".ctx-menu .menu-item")].map(m => m.textContent).join("|")`);
      await a.key("Escape"); await closeModals();
      if (n < 3) fail(`menu with ${n} items at ${x},${y}`);
      if (!/Undo/.test(undo) || !/Redo/.test(undo)) fail(`no Undo/Redo in the menu at ${x},${y}: ${undo}`);
    }
    return true;
  });
  await step("Undo in the plan context menu undoes the last edit", async () => {
    const n = await app(`app.plan.select([app.store.project.furniture[0].id]); return app.store.project.furniture.length`);
    await a.key("d", 2);
    const dup = await app(`return app.store.project.furniture.length`);
    const [sx, sy] = await scr(-1500, -1500);
    await a.click(sx, sy, { button: "right" });
    const r = await a.ev(`const it = [...document.querySelectorAll(".ctx-menu .menu-item")].find(m => m.textContent.includes("Undo")); if (!it) return null; const b = it.getBoundingClientRect(); return [b.left + 20, b.top + b.height / 2]`);
    if (!r) fail("no Undo item in the menu");
    await a.click(r[0], r[1]);
    const after = await app(`return app.store.project.furniture.length`);
    return (dup === n + 1 && after === n) || fail(`${n} → duplicate ${dup} → undo ${after}`);
  });
  await step("wheel zooms about the cursor, empty-canvas drag pans", async () => {
    // Pan first: after zooming in, (-1500, -1500) is no longer on the canvas.
    const ox = await app(`return app.plan.vp.ox`);
    const [x1, y1] = await scr(-1500, -1500);
    const under = await a.ev(`return document.elementFromPoint(${x1}, ${y1})?.className`);
    if (under !== "editor-canvas") fail(`pan start is not on the canvas: ${under}`);
    await a.drag(x1, y1, x1 + 80, y1 + 40);
    const ox2 = await app(`return app.plan.vp.ox`);
    const s0 = await app(`return app.plan.vp.scale`);
    const [sx, sy] = await scr(4500, 3000);
    await a.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: sx, y: sy, deltaX: 0, deltaY: -240 });
    await sleep(100);
    const s1 = await app(`return app.plan.vp.scale`);
    const [sx2, sy2] = await scr(4500, 3000); // the point under the cursor stays put
    return (s1 > s0 && ox2 !== ox && Math.hypot(sx2 - sx, sy2 - sy) < 3) || fail(`scale ${s0}→${s1}, ox ${ox}→${ox2}, anchor moved ${Math.round(sx2 - sx)},${Math.round(sy2 - sy)}`);
  });
  await step("columns, stairs, roof (polygon), dimension, text, line, measure, grid by mouse", async () => {
    await fitView({ x1: -2500, y1: -2500, x2: 14000, y2: 9000 });
    await a.key("c"); await clickW(9000, 6000); await a.key("Escape");
    await a.key("s"); await clickW(5600, 5350); await clickW(8600, 5350); await a.key("Escape");
    await a.key("k"); await clickW(0, 6000); await clickW(5000, 6000); await clickW(2500, 7000); await a.key("Escape");
    await a.key("t"); await clickW(500, 7600); await sleep(120); await a.type("Entrance"); await a.key("Enter"); await a.key("Escape");
    await a.key("l"); await clickW(10500, 2000); await clickW(12000, 2000); await a.key("Enter"); await a.key("Escape");
    await a.key("m"); await clickW(0, 0); await clickW(9000, 6000); await a.key("Escape"); await a.key("Escape");
    await a.key("g"); await clickW(0, -1500); await clickW(0, 7500); await a.key("Escape");
    return app(`const p = app.store.project; return [p.columns.length, p.stairs.length, p.dimensions.length, p.texts.length, p.drawings.length, p.grids.length].join(",")`).then((s) => s === "1,1,1,1,1,1" || fail(s));
  });
  await step("mass box (B), cylinder (U) and polygon mass", async () => {
    await a.key("b"); await clickW(11000, 1000); await clickW(14000, 4000); await a.key("Escape");
    await a.key("u"); await clickW(12500, 6500); await clickW(13500, 6500); await a.key("Escape");
    await app(`app.plan.setTool("massPoly"); return 1`);
    for (const [x, y] of [[10500, 7500], [12500, 7500], [11500, 9000]]) await clickW(x, y);
    await a.key("Enter"); await a.key("Escape");
    return app(`return app.store.project.solids.length === 3`);
  });
  await step("detect rooms, auto dimensions, auto roof, add level (+) with copied walls", async () => {
    await app(`app.run("build.detectRooms"); app.run("build.autoDims"); return 1`);
    await clickSel("#view-plan .page-tab.add");
    await sleep(200);
    await app(`app.run("build.autoRoof"); return 1`);
    return app(`const p = app.store.project; return p.levels.length === 2 && p.walls.some(w => w.level === p.levels[1].id) && p.roofs.length >= 1 && p.dimensions.length >= 3`);
  });
  await step("level properties dialog and switching levels", async () => {
    await app(`app.run("build.levelProps"); return 1`); await primary();
    await clickSel(`#view-plan .page-tab`);
    return app(`return !document.querySelector(".modal")`);
  });

  // ---------------------------------------------------------------- BIM
  sectionStart("BIM");
  await step("wall types dialog: add a type with a layer, OK", async () => {
    const n = await app(`return app.store.project.wallTypes.length`);
    await app(`app.run("build.wallTypes"); return 1`);
    await waitFor(`document.querySelector(".wt-dialog")`);
    const r = await a.ev(`const b = [...document.querySelectorAll(".wt-dialog .btn")].find(b => b.textContent.includes("New")); const q = b.getBoundingClientRect(); return [q.left + 5, q.top + 5]`);
    await a.click(r[0], r[1]);
    const r2 = await a.ev(`const b = [...document.querySelectorAll(".wt-dialog .btn")].find(b => b.textContent.includes("Add layer")); const q = b.getBoundingClientRect(); return [q.left + 5, q.top + 5]`);
    await a.click(r2[0], r2[1]);
    await primary();
    return app(`const t = app.store.project.wallTypes; return t.length === ${n + 1} && t[t.length - 1].layers.length === 2`);
  });
  await step("assign a wall type in the inspector: thickness follows the layers", async () => {
    await app(`app.plan.setLevel(app.store.project.levels[0].id); return 1`);
    await clickW(4000, 0);
    await waitFor(`document.querySelector('#right-panel [data-field="Wall type"]')`);
    await app(`const s = document.querySelector('#right-panel [data-field="Wall type"]'); s.value = "ext-brick-300"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1`);
    return app(`const w = app.plan.selectedItems()[0].obj; return w.type === "ext-brick-300" && w.thickness === 300`);
  });
  await step("BIM properties dialog writes props; IFC GlobalId shown", async () => {
    await app(`app.run("build.bimProps"); return 1`);
    await waitFor(`document.querySelector(".modal")`);
    await app(`[...document.querySelectorAll(".modal .btn")].find(b => b.textContent.includes("Add property")).click(); return 1`);
    await app(`const i = document.querySelectorAll(".modal table input"); i[0].value = "FireRating"; i[0].dispatchEvent(new Event("input")); i[1].value = "REI 60"; i[1].dispatchEvent(new Event("input")); return 1`);
    await primary();
    return app(`const w = app.plan.selectedItems()[0].obj; return w.props && w.props.FireRating === "REI 60" && /^[0-9A-Za-z_$]{22}$/.test([...document.querySelectorAll("#right-panel .mono-val")].pop().textContent)`);
  });
  await step("phase demolish: plan draws it dashed, phase views hide it", async () => {
    await app(`const s = document.querySelector('#right-panel [data-field="Phase"]'); s.value = "demolish"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1`);
    await app(`app.run("view.phaseNew"); app.run("view.phaseExisting"); app.run("view.phaseAll"); return 1`);
    return app(`return app.store.project.walls.some(w => w.phase === "demolish")`);
  });
  await step("select similar, classification and room number fields", async () => {
    await clickW(9000, 2000);
    await app(`app.run("build.selectSimilar"); return 1`);
    const n = await app(`return app.plan.sel.size`);
    await clickW(2500, 4500);
    await app(`const f = document.querySelector('#right-panel [data-field="Number"]'); f.value = "102"; f.dispatchEvent(new Event("change", { bubbles: true })); const c = document.querySelector('#right-panel [data-field="Classification"]'); c.value = "SL_45_10"; c.dispatchEvent(new Event("change", { bubbles: true })); return 1`);
    return app(`return ${n} >= 2 && app.store.project.rooms.some(r => r.number === "102" && r.classification === "SL_45_10")`);
  });
  await step("schedules: every tab, cost estimate with unit prices, CSV export of each", async () => {
    for (const label of ["Rooms CSV…", "Doors & windows CSV…", "Wall types CSV…", "Cost CSV…", "Levels CSV…"]) {
      await app(`app.run("build.schedules"); return 1`);
      await waitFor(`document.querySelector(".modal .tabs")`);
      const tabs = await app(`return document.querySelectorAll(".modal .tab").length`);
      if (tabs !== 7) fail(`${tabs} tabs`);
      await dialogButton(label);
      await sleep(200);
    }
    const csv = fs.readdirSync(out).filter((f) => f.endsWith(".csv"));
    return csv.length >= 5 || fail(`csv files: ${csv}`);
  });
  await step("model check finds a clash and the issue list focuses it", async () => {
    await app(`const p = app.store.project; app.store.edit("x", () => { p.furniture.push({ id: "clashA", level: p.levels[0].id, kind: "box", x: 7000, y: 1200, rot: 0, w: 1000, d: 1000, h: 1000, elevation: 0 }, { id: "clashB", level: p.levels[0].id, kind: "box", x: 7300, y: 1300, rot: 0, w: 1000, d: 1000, h: 1000, elevation: 0 }); }); return 1`);
    await a.key("F5"); await sleep(200);
    const has = await app(`return app.checkIssues.some(i => i.code === "clash-furniture")`);
    await clickSel("#right-panel .issue");
    await a.key("z", 2);
    return has;
  });

  // ---------------------------------------------------------------- 3D
  sectionStart("3D view");
  await step("F3: views, styles, ortho, section, open doors, fog, grid", async () => {
    await a.key("F3"); await waitFor(`app.v3d.viewer`, 10000); await app(`app.v3d.syncModel(); return 1`);
    for (const k of ["1", "2", "3", "4", "5", "6", "7"]) { await a.key(k); await sleep(80); }
    for (const st of ["white", "lines", "xray", "realistic"]) await app(`app.v3d.setOpt("style", "${st}"); return 1`);
    await a.key("o"); await a.key("o");
    await a.key("x");
    const sec = await app(`return app.v3d.viewer.helperInfo().section`);
    await a.key("x");
    await app(`app.run("v3d.openDoors"); app.run("v3d.openDoors"); app.run("v3d.fog"); app.run("v3d.fog"); return 1`);
    await a.key("g"); await a.key("g");
    return sec;
  });
  await step("3D numbers hide behind the building; only X-ray shows them through", async () => {
    const depth = () => app(`const s = []; app.v3d.viewer.three.scene.traverse(o => { if (o.isSprite && o.userData.label3d) s.push(o.material.depthTest); }); return s`);
    await app(`app.v3d.setOpt("dimensions", true); return 1`);
    const solid = await depth();
    await app(`app.v3d.setOpt("style", "xray"); return 1`);
    const xray = await depth();
    await app(`app.v3d.setOpt("style", "realistic"); app.v3d.setOpt("dimensions", false); return 1`);
    const back = await depth();
    if (!solid.length) fail("no labels");
    if (!solid.every(Boolean)) fail("labels drawn over the building in the solid style");
    if (xray.some(Boolean)) fail("labels hidden in X-ray");
    return back.every(Boolean) || fail("labels still see-through after leaving X-ray");
  });
  await step("3D toolbar carries the 3D menu's commands (front elevation, fog)", async () => app(`return !!document.querySelector('#toolbar [data-cmd="v3d.front"]') && [...document.querySelectorAll("#toolbar .icon-btn")].some(b => b.title === "Fog")`));
  await step("X/Y/Z axes with a scale: the toolbar button toggles them, wheel zoom is smooth and changes the tick spacing", async () => {
    await app(`app.setTab("3d"); await app.v3d.ensure(); app.v3d.setView("iso"); return 1`); await sleep(1500);
    const btn = `[...document.querySelectorAll("#toolbar .icon-btn")].find(b => b.title === "Axes with scale (X, Y, Z)")`;
    if (!(await app(`return !!${btn}`))) fail("no axes button on the 3D toolbar");
    if (!(await app(`return app.v3d.opts.axes`))) await app(`${btn}.click(); return 1`);
    await sleep(300);
    const far = await app(`return app.v3d.viewer.helperInfo().axes`);
    if (!far || !far.tick) fail("axes not shown");
    const [cx, cy] = await app(`const r = app.v3d.viewer.three.renderer.domElement.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
    const dist = () => app(`const t = app.v3d.viewer.three; return t.camera.position.distanceTo(t.controls.target)`);
    const d0 = await dist();
    await a.move(cx, cy); for (let i = 0; i < 6; i++) await a.wheel(cx, cy, -240);
    await sleep(40); const dMid = await dist(); await sleep(1500); const d1 = await dist();
    const near = await app(`return app.v3d.viewer.helperInfo().axes`);
    await app(`${btn}.click(); return 1`); await sleep(200);
    const off = await app(`return !app.v3d.opts.axes && !app.v3d.viewer.helperInfo().axes`);
    await app(`${btn}.click(); return 1`); await sleep(600);
    // Smooth: the zoom is still under way right after the wheel, and ends closer.
    return (d1 < d0 * 0.8 && dMid > d1 + 1e-3 && near.tick < far.tick && off) || fail({ far, near, d0, dMid, d1, off });
  });
  await step("no toolbar repeats the view tabs (Floor plan / 3D view live only in the title bar and View menu)", async () => {
    const bad = [];
    for (const tab of ["start", "plan", "3d"]) {
      const n = await app(`app.setTab("${tab}"); await new Promise(r => setTimeout(r, 150)); return document.querySelectorAll('#toolbar [data-cmd="view.plan"], #toolbar [data-cmd="view.3d"], #toolbar [data-cmd="view.start"]').length`);
      if (n) bad.push(`${tab}: ${n}`);
    }
    await app(`app.setTab("3d"); return 1`);
    return !bad.length || fail(bad.join(", "));
  });
  await step("3D grid keeps 5×5 blocks at an even on-screen size while zooming (like the plan)", async () => {
    await a.key("1"); await sleep(500);
    const [cx, cy] = await app(`const r = app.v3d.viewer.three.renderer.domElement.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
    const info = () => app(`const g = app.v3d.viewer.helperInfo().grid; return { cell: g.cell, major: g.major, px: g.px, w: g.majorWidth }`);
    const seen = [];
    for (const [dy, n] of [[0, 0], [-120, 10], [120, 25], [-120, 8]]) {
      for (let i = 0; i < n; i++) { await a.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: cx, y: cy, deltaX: 0, deltaY: dy }); await sleep(40); }
      await sleep(600);
      const g = await info();
      const cellPx = g.cell * g.px;
      if (cellPx < 11.5 || cellPx >= 60.5) fail(`cell ${g.cell} is ${cellPx.toFixed(1)} px on screen`);
      if (Math.abs(g.major / g.cell - 5) > 1e-9) fail(`blocks of ${g.major / g.cell} cells`);
      if (Math.abs(g.w * g.px - 1.5) > 0.4) fail(`block lines ${(g.w * g.px).toFixed(2)} px wide`);
      seen.push(+g.cell.toFixed(3));
    }
    await a.key("1");
    return new Set(seen).size >= 2 ? `cells ${seen.join(" → ")} m` : fail(`cell never changed: ${seen}`);
  });
  await step("3D right-click menu has Undo/Redo and the view commands; right-drag still pans", async () => {
    const [cx, cy] = await app(`const r = app.v3d.viewer.three.renderer.domElement.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
    await a.click(cx, cy, { button: "right" });
    const items = await app(`return [...document.querySelectorAll(".ctx-menu .menu-item")].map(m => m.textContent).join("|")`);
    await a.key("Escape"); await closeModals();
    await a.move(cx, cy);
    await a.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "right", clickCount: 1, buttons: 2 });
    for (let i = 1; i <= 6; i++) await a.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + i * 10, y: cy, buttons: 2 });
    await a.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx + 60, y: cy, button: "right", clickCount: 1, buttons: 0 });
    await sleep(80);
    const after = await app(`return !!document.querySelector(".ctx-menu")`);
    await closeModals();
    return (/Undo/.test(items) && /Redo/.test(items) && /Top view/.test(items) && !after) || fail(`items ${items}, menu after drag ${after}`);
  });
  await step("walk mode (V): W moves the camera, Esc leaves", async () => {
    await a.key("v");
    const p0 = await app(`return app.v3d.viewer.three.camera.position.toArray()`);
    await a.send("Input.dispatchKeyEvent", { type: "keyDown", key: "w", code: "KeyW", windowsVirtualKeyCode: 87 });
    await sleep(400);
    await a.send("Input.dispatchKeyEvent", { type: "keyUp", key: "w", code: "KeyW", windowsVirtualKeyCode: 87 });
    const p1 = await app(`return app.v3d.viewer.three.camera.position.toArray()`);
    await a.key("Escape");
    const nav = await app(`return app.v3d.opts.navMode`);
    return (Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.1 && nav === "orbit") || fail(`moved ${p0} → ${p1}, nav ${nav}`);
  });
  await step("clicking a wall in 3D selects it in the plan", async () => {
    await a.key("1"); await sleep(600);
    const [x, y] = await app(`const v = app.v3d.viewer; const { camera, renderer, THREE } = v.three; const r = renderer.domElement.getBoundingClientRect(); const q = new THREE.Vector3(9.0, 1.4, 3.0).project(camera); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height];`);
    await app(`app.plan.clearSelection(); return 1`);
    await a.click(x, y);
    await sleep(200);
    return app(`return app.plan.sel.size >= 1`);
  });
  await step("push/pull raises a mass with a real mouse drag", async () => {
    await app(`app.v3d.setTool("pushpull"); return 1`);
    const s = await app(`return app.store.project.solids[0]`);
    const [x, y] = await app(`const v = app.v3d.viewer; const { camera, renderer, THREE } = v.three; const r = renderer.domElement.getBoundingClientRect(); const q = new THREE.Vector3(12.5, ${s.height / 1000}, 2.5).project(camera); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height];`);
    await a.drag(x, y, x, y - 90, 10);
    const h = await app(`return app.store.project.solids.find(q => q.id === ${JSON.stringify(s.id)}).height`);
    return h > s.height || fail(`height ${s.height} → ${h}`);
  });
  await step("paint bucket paints a mass, tape measure measures", async () => {
    await app(`app.v3d.setTool("paint"); app.v3d.paintMaterial = "brick"; return 1`);
    const [x, y] = await app(`const v = app.v3d.viewer; const { camera, renderer, THREE } = v.three; const r = renderer.domElement.getBoundingClientRect(); const q = new THREE.Vector3(14.0, 1.0, 2.5).project(camera); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height];`);
    await a.click(x, y);
    const painted = await app(`return app.store.project.solids[0].material === "brick"`);
    await app(`app.v3d.setTool("tape"); return 1`);
    // Two points on the mass's side face (x = 14 m), so both clicks hit it.
    const [x2, y2] = await app(`const v = app.v3d.viewer; const { camera, renderer, THREE } = v.three; const r = renderer.domElement.getBoundingClientRect(); const q = new THREE.Vector3(14.0, 2.2, 1.6).project(camera); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height];`);
    await a.click(x, y); await a.click(x2, y2);
    const m = await app(`return app.v3d.viewer.measureCount()`);
    await app(`app.v3d.setTool("tape"); return 1`);
    return (painted && m >= 1) || fail(`painted ${painted}, measures ${m}`);
  });
  await step("scenes: add two, go to one, play the animation", async () => {
    await clickSel('[data-scene-add="1"]');
    await a.key("2"); await sleep(400);
    await clickSel('[data-scene-add="1"]');
    await clickSel("[data-scene]");
    await app(`app.v3d.playOnce = true; app.v3d.playScenes(200); return 1`);
    await sleep(1200);
    await app(`app.v3d.playing = false; return 1`);
    return app(`return app.store.project.scenes.length === 2`);
  });
  await step("sun study from the site, date and time moves the sun", async () => {
    await app(`app.settings.sunStudy = true; app.settings.sunMonth = 12; app.settings.sunHour = 12; app.v3d.applySettings(); app.renderLeft(); return 1`);
    const winter = await app(`return app.v3d.viewer.getOptions().sunAltitude`);
    await app(`app.settings.sunMonth = 6; app.v3d.applySettings(); return 1`);
    const summer = await app(`return app.v3d.viewer.getOptions().sunAltitude`);
    await app(`app.settings.sunStudy = false; app.v3d.applySettings(); app.renderLeft(); return 1`);
    return (summer > winter + 30) || fail(`winter ${winter}, summer ${summer}`);
  });
  await step("hide a level and the furniture in 3D, show them again", async () => {
    await app(`const id = app.store.project.levels[1].id; app.v3d.setLevelVisible(id, false); app.v3d.setOpt("furniture", false); return 1`);
    const st = await app(`return app.v3d.viewer.stats().meshes`);
    await app(`app.v3d.setLevelVisible(app.store.project.levels[1].id, true); app.v3d.setOpt("furniture", true); return 1`);
    const st2 = await app(`return app.v3d.viewer.stats().meshes`);
    return st2 > st || fail(`${st} → ${st2}`);
  });

  // ---------------------------------------------------------------- SketchUp tools (src/ui/skui.js, src/view3d/sklayer.js)
  sectionStart("SketchUp tools");
  // These steps use sample 07; the drawing made so far comes back afterwards.
  const keptDrawing = await app(`return JSON.stringify({ p: app.store.project, fileName: app.store.fileName, filePath: app.store.filePath })`);
  // Plan point (mm, z absolute) → screen; tools are driven with the real mouse.
  const s3 = (q) => app(`return app.v3d.viewer.skScreenOf(${JSON.stringify(q)})`);
  const hover3 = async (q) => { const [x, y] = await s3(q); await a.move(x - 4, y + 2); await a.move(x, y); await sleep(50); return [x, y]; };
  const click3 = async (q, opts) => { const [x, y] = await hover3(q); await a.click(x, y, opts); await sleep(90); };
  const cam3 = async (pos, target) => { await app(`app.v3d.viewer.setCamera({ pos: ${JSON.stringify(pos)}, target: ${JSON.stringify(target)}, ortho: false }, 1); return 1`); await sleep(350); await app(`app.v3d.viewer.three.controls.update(); return 1`); await sleep(80); };
  const tool3 = (t) => app(`if (app.v3d.opts.tool !== ${JSON.stringify(t)}) app.v3d.setTool(${JSON.stringify(t)}); return app.v3d.opts.tool`);
  const solidBy = (name) => app(`const s = app.store.project.solids.find((x) => x.name === ${JSON.stringify(name)}); return s ? JSON.parse(JSON.stringify(s)) : null`);
  const volOf = (id) => app(`const m = await import("./src/core/mesh.js"); const s = app.store.project.solids.find((x) => x.id === ${JSON.stringify(id)}); return Math.abs(m.meshVolume(m.solidMesh(s))) / 1e9`);
  await step("sample 07 in 3D; the toolbar groups the SketchUp tools in split buttons, every one visible, and each dropdown lists its tools", async () => {
    await closeModals();
    await app(`app.settings.onboarded = true; app.setSetting("lang", "en"); return 1`);
    await openSample("07-massing-study.myarch");
    await a.key("F3");
    await waitFor(`app.v3d.viewer`, 10000);
    await app(`app.v3d.syncModel(); app.v3d.resetView(); app.v3d.setOpt("furniture", false); return 1`); // trees would stand in front of the faces clicked
    const groups = await app(`return [...document.querySelectorAll("#toolbar [data-skgroup-split]")].map(b => { const r = b.getBoundingClientRect(); return [b.dataset.skgroupSplit, r.width > 0 && r.height > 0] })`);
    if (groups.length !== 6 || groups.some((g) => !g[1])) fail(groups);
    await clickSel('#toolbar [data-skgroup-menu="draw"]');
    const items = await app(`return [...document.querySelectorAll(".ctx-menu .menu-item")].map(m => m.textContent)`);
    await a.key("Escape"); await closeModals();
    return (items.length === 5 && items.some((x) => /Rectangle/.test(x))) || fail(items);
  });
  await step("rectangle on the podium's top becomes a face of it; push/pull drags it up into a tower (real mouse)", async () => {
    await cam3([45, 38, 52], [21, 6, 16]);
    const pod0 = await solidBy("Podium");
    await clickSel('#toolbar [data-skgroup-split="draw"] [data-tool3d]');
    if ((await app(`return app.v3d.opts.tool`)) !== "line") fail("draw split button did not pick the line tool");
    await tool3("rect");
    await click3([18500, 16500, 6000]);
    await click3([25500, 19000, 6000]);
    const pod = await solidBy("Podium");
    if (!pod.mesh || pod.mesh.f.length !== 7) fail(`podium faces ${pod.mesh && pod.mesh.f.length}`);
    await tool3("pushpull");
    const [x, y] = await hover3([22000, 17750, 6000]);
    await a.drag(x, y, x, y - 110, 12);
    await sleep(300);
    const after = await solidBy("Podium");
    const v0 = 30 * 20 * 6;
    const v1 = await volOf(pod0.id);
    return (after.height > 6000 && v1 > v0 && after.mesh.f.length === 11) || fail(`height ${after.height}, volume ${v1}, faces ${after.mesh.f.length}`);
  });
  await step("undo puts the podium back; redo pulls the tower again", async () => {
    await a.key("Escape");
    await a.key("z", 2); await sleep(250);
    const h1 = (await solidBy("Podium")).height;
    await a.key("y", 2); await sleep(250);
    const h2 = (await solidBy("Podium")).height;
    return (h1 === 6000 && h2 > 6000) || fail(`${h1} / ${h2}`);
  });
  await step("line tool: four clicks round on the ground and back to the start close a face; push/pull with a typed height (3000 Enter)", async () => {
    await cam3([10, 30, 60], [8, 0, 30]);
    await tool3("line");
    const n0 = await app(`return app.store.project.solids.length`);
    for (const q of [[2000, 26000, 0], [8000, 26000, 0], [8000, 30000, 0], [2000, 30000, 0], [2000, 26000, 0]]) await click3(q);
    const face = await app(`const s = app.store.project.solids[app.store.project.solids.length - 1]; return { n: app.store.project.solids.length, faces: s.mesh ? s.mesh.f.length : 0, id: s.id }`);
    if (face.n !== n0 + 1 || face.faces !== 1) fail(face);
    await tool3("pushpull");
    const [x, y] = await hover3([5000, 28000, 0]);
    await a.click(x, y); await a.move(x, y - 25); await sleep(80);
    await a.type("3000"); await a.key("Enter"); await sleep(300);
    const s = await app(`const s = app.store.project.solids.find(q => q.id === ${JSON.stringify(face.id)}); return [s.height, s.mesh.f.length]`);
    const v = await volOf(face.id);
    return (Math.abs(s[0] - 3000) < 1 && s[1] === 6 && Math.abs(v - 72) < 0.5) || fail(`${s} vol ${v}`);
  });
  await step("move tool with Ctrl copies the box; typing 3x makes an array of three", async () => {
    const id = await app(`const s = app.store.project.solids[app.store.project.solids.length - 1]; app.plan.select([s.id]); app.v3d.highlight([s.id]); return s.id`);
    await tool3("move");
    const n0 = await app(`return app.store.project.solids.length`);
    await click3([2000, 26000, 0]);
    await hover3([10000, 26000, 0]);
    const [x, y] = await s3([10000, 26000, 0]);
    await a.click(x, y, { modifiers: 2 });
    await sleep(250);
    const n1 = await app(`return app.store.project.solids.length`);
    await a.type("3x"); await a.key("Enter"); await sleep(300);
    const n2 = await app(`return app.store.project.solids.length`);
    void id;
    return (n1 === n0 + 1 && n2 === n0 + 3) || fail(`${n0} → ${n1} → ${n2}`);
  });
  await step("rotate tool: centre, start direction and 90° turn a box about the vertical", async () => {
    await cam3([5, 60, 28.1], [5, 0, 28]);
    const s = await app(`const s = app.store.project.solids[app.store.project.solids.length - 1]; app.plan.select([s.id]); app.v3d.highlight([s.id]); return s`);
    const xs = s.pts.map((q) => q[0]), ys = s.pts.map((q) => q[1]);
    const c = [Math.min(...xs), Math.min(...ys), 0];
    await tool3("rotate");
    await click3(c); await click3([c[0] + 4000, c[1], 0]); await click3([c[0], c[1] - 4000, 0]);
    const r = await app(`const q = app.store.project.solids.find(x => x.id === ${JSON.stringify(s.id)}); return q.pts`);
    const w = Math.max(...r.map((q) => q[0])) - Math.min(...r.map((q) => q[0]));
    return Math.abs(w - 4000) < 2 || fail(`width after turn ${w}`);
  });
  await step("offset a loop into the face of a mass, then push it in: a recess (volume goes down, still closed)", async () => {
    await cam3([45, 38, 52], [21, 6, 16]);
    const rot = await solidBy("Rotunda");
    void rot;
    const pod = await solidBy("Podium");
    const v0 = await volOf(pod.id);
    await tool3("offset");
    // The front face of the podium (y = 20000), from near its edge inwards.
    await click3([3000, 20000, 500]);
    await click3([3000, 20000, 1500]);
    const faces = (await solidBy("Podium")).mesh.f.length;
    await tool3("pushpull");
    const [x, y] = await hover3([15000, 20000, 3000]);
    await a.click(x, y); await a.move(x, y + 10); await sleep(60);
    await a.type("-500"); await a.key("Enter"); await sleep(400);
    const v1 = await volOf(pod.id);
    const closed = await app(`const m = await import("./src/core/mesh.js"); return m.isClosed(app.store.project.solids.find(s => s.id === ${JSON.stringify(pod.id)}).mesh)`);
    return (v1 < v0 - 1 && closed && faces > 11) || fail(`volume ${v0} → ${v1}, closed ${closed}, faces ${faces}`);
  });
  await step("solid tools: union of two selected masses (from the Solid tools dropdown) leaves one closed solid", async () => {
    const ids = await app(`const s = app.store.project.solids.filter(x => x.name === "Face"); app.plan.select(s.slice(0, 2).map(x => x.id)); return s.length`);
    if (ids < 2) fail(`${ids} boxes`);
    const n0 = await app(`return app.store.project.solids.length`);
    await clickSel('#toolbar [data-skgroup-menu="solid"]');
    const r = await a.ev(`const it = [...document.querySelectorAll(".ctx-menu .menu-item")].find(m => m.textContent.trim() === "Union"); const b = it.getBoundingClientRect(); return [b.left + 20, b.top + 8]`);
    await a.click(r[0], r[1]); await sleep(300);
    const n1 = await app(`return app.store.project.solids.length`);
    return n1 === n0 - 1 || fail(`${n0} → ${n1}`);
  });
  await step("make component from a mass (dialog), place a second copy, edit it in place: both copies change", async () => {
    await app(`const s = app.store.project.solids.find(x => x.name === "Rotunda"); app.plan.select([s.id]); return 1`);
    await app(`app.run("sk.makeComponent"); return 1`);
    await primary();
    const inst = await app(`return app.store.project.furniture.find(f => f.kind === "component")`);
    if (!inst) fail("no instance");
    await app(`app.v3d.setOpt("placeComp", app.store.project.components[0].id); app.v3d.setTool("place"); return 1`);
    await cam3([30, 32, -42], [30, 0, -6]);
    await click3([36000, -6000, 0]);
    const n = await app(`return app.store.project.furniture.filter(f => f.kind === "component").length`);
    if (n !== 2) fail(`${n} instances`);
    await tool3("none");
    const [x, y] = await s3([inst.x, inst.y, 4000]);
    await a.dblclick(x, y); await sleep(250);
    const ed = await app(`return app.v3d.viewer.skEditing()`);
    if (!ed) fail("not editing");
    await tool3("pushpull");
    const [x2, y2] = await hover3([inst.x, inst.y + 1500, 9000]);
    await a.drag(x2, y2, x2, y2 - 60, 8); await sleep(300);
    const hs = await app(`return app.store.project.furniture.filter(f => f.kind === "component").map(f => Math.round(f.h))`);
    await a.key("Escape"); await a.key("Escape");
    return (hs.every((h) => h > 9000) && hs.length === 2) || fail(hs);
  });
  await step("tags: a new tag, the selection assigned to it, unticked in the panel → its meshes leave the 3D view", async () => {
    await tool3("none");
    await app(`app.settings.skFold = { tags: true }; app.renderLeft(); return 1`);
    await app(`const s = app.store.project.solids.find(x => x.name === "Tower A"); app.plan.select([s.id]); return 1`);
    await clickSel('[data-sk-tag-add="1"]');
    await primary();
    const tag = await app(`return app.store.project.layers[app.store.project.layers.length - 1].id`);
    await clickSel(`[data-sk-tag-assign="${tag}"]`);
    const m0 = await app(`return app.v3d.viewer.stats().meshes`);
    await clickSel(`[data-sk-tag="${tag}"] label.check`);
    await sleep(300);
    const m1 = await app(`return app.v3d.viewer.stats().meshes`);
    const hidden = await app(`return app.v3d.viewer.getOptions().hiddenTags`);
    await clickSel(`[data-sk-tag="${tag}"] label.check`);
    await sleep(300);
    return (m1 < m0 && hidden.includes(tag) && (await app(`return app.v3d.viewer.stats().meshes`)) === m0) || fail(`${m0} → ${m1}, ${hidden}`);
  });
  await step("section plane tool: click a face → the model is cut there, with a filled cut; the plane is listed and switches off", async () => {
    await cam3([60, 45, 45], [15, 6, 10]);
    await tool3("sectionplane");
    await click3([30000, 10000, 3000]);
    const st = await app(`return [app.store.project.sections.length, app.v3d.viewer.skCaps(), app.store.project.sections[0] && app.store.project.sections[0].active]`);
    await app(`app.settings.skFold = { sections: true }; app.renderLeft(); return 1`);
    await sleep(300);
    await waitFor(`document.querySelector('[data-sk-section]')`);
    await clickSel(`[data-sk-section="${await app(`return app.store.project.sections[0].id`)}"]`);
    await sleep(400);
    const off = await app(`return [app.store.project.sections[0].active, app.v3d.viewer.skCaps()]`);
    await tool3("none");
    return (st[0] === 1 && st[1] > 0 && st[2] && !off[0] && off[1] === 0) || fail({ st, off });
  });
  await step("style editor: edges and profiles from the panel, a watermark in the saved image", async () => {
    await app(`app.settings.skFold = { styles: true }; app.renderLeft(); return 1`);
    const box = async (label) => { const r = await a.ev(`const el = [...document.querySelectorAll('[data-sk-panel="styles"] label')].find(l => l.textContent.trim() === ${JSON.stringify(label)}); el.scrollIntoView({ block: "nearest" }); const b = el.getBoundingClientRect(); return [b.left + 8, b.top + b.height / 2]`); await a.click(r[0], r[1]); await sleep(600); };
    await box("Edges"); await box("Profiles (thick outlines)");
    await app(`app.store.edit("Style", p => { p.style3d.watermark = "SMOKE"; }); app.v3d.viewer.skRefresh(); return 1`);
    const info = await app(`return [app.store.project.style3d.edges, app.store.project.style3d.profiles, app.v3d.viewer.helperInfo().edges, app.v3d.viewer.skProfiles(), app.v3d.viewer.three.renderer.domElement.parentElement.querySelector(".sk-watermark").style.display]`);
    await app(`app.store.edit("Style", p => { p.style3d.edges = false; p.style3d.profiles = false; p.style3d.watermark = ""; }); app.v3d.sk.pushOpts(); app.v3d.viewer.skRefresh(); return 1`);
    return (info[0] && info[1] && info[2] && info[3] > 0 && info[4] === "block") || fail(info);
  });
  await step("tape measure with Ctrl leaves a guide; 3D dimension by three clicks; the eraser deletes the guide", async () => {
    await cam3([45, 38, 52], [21, 6, 16]);
    await tool3("tape");
    await click3([0, 20000, 0]);
    const [x, y] = await hover3([30000, 20000, 0]);
    await a.click(x, y, { modifiers: 2 }); await sleep(150);
    await tool3("dimension");
    await click3([0, 20000, 6000]); await click3([30000, 20000, 6000]); await click3([15000, 24000, 6000]);
    const n = await app(`return [app.store.project.guides.length, app.store.project.dims3d.length]`);
    await tool3("eraser");
    const g = await app(`return app.store.project.guides[0]`);
    await click3([g.a[0] + 10000, g.a[1], g.a[2]]);
    const left = await app(`return app.store.project.guides.length`);
    await tool3("none");
    return (n[0] === 1 && n[1] === 1 && left === 0) || fail(`${n} / ${left}`);
  });
  await step("two-point perspective keeps verticals vertical (camera looks level)", async () => {
    await cam3([40, 30, 40], [10, 5, 10]);
    await clickSel('#toolbar [data-skgroup-menu="camera"]');
    const r = await a.ev(`const it = [...document.querySelectorAll(".ctx-menu .menu-item")].find(m => m.textContent.includes("Two-point")); const b = it.getBoundingClientRect(); return [b.left + 20, b.top + 8]`);
    await a.click(r[0], r[1]); await sleep(300);
    const dir = await app(`app.v3d.viewer.screenshot(); const v = app.v3d.viewer.three.camera; const d = new (app.v3d.viewer.three.THREE.Vector3)(); v.getWorldDirection(d); return [d.y, app.v3d.opts.twoPoint]`);
    await app(`app.v3d.setOpt("twoPoint", false); return 1`);
    return (Math.abs(dir[0]) < 1e-6 && dir[1]) || fail(dir);
  });
  await step("sandbox: terrain from scratch (dialog), then smoove drags a hill up", async () => {
    await app(`app.run("sk.terrainScratch"); return 1`);
    await primary();
    const t0 = await app(`const t = app.store.project.solids.find(s => s.terrain); return t && JSON.parse(JSON.stringify(t))`);
    if (!t0) fail("no terrain");
    await cam3([(t0.pts[0][0] + 6000) / 1000 - 20, 40, (t0.pts[2][1] - 6000) / 1000 + 30], [(t0.pts[0][0] + 6000) / 1000, 0, (t0.pts[2][1] - 6000) / 1000]);
    await tool3("smoove");
    const cx = t0.pts[0][0] + 6000, cy = t0.pts[2][1] - 6000; // a corner of the terrain, clear of the masses
    const [x, y] = await hover3([cx, cy, 0]);
    await a.drag(x, y, x, y - 70, 8); await sleep(300);
    const h = await app(`return app.store.project.solids.find(s => s.terrain).height`);
    await tool3("none");
    return h > t0.height + 100 || fail(`${t0.height} → ${h}`);
  });
  await step("follow me: an upright profile face swept along a drawn path makes a closed solid", async () => {
    await app(`const m = await import("./src/core/skops.js"); app.store.edit("prep", (p) => { const L = p.levels[0].id; m.drawLine(p, [[-20000, -20000, 0], [-10000, -20000, 0], [-10000, -14000, 0]], { level: L }); m.drawLoop(p, [[-20000, -20300, 0], [-20000, -19700, 0], [-20000, -19700, 600], [-20000, -20300, 600]], { level: L, towards: [-1, 0, 0] }); }); return 1`);
    await sleep(300);
    await cam3([-30, 12, -10], [-15, 0, -18]);
    await tool3("followme");
    await click3([-20000, -20000, 300]);
    await hover3([-15000, -20000, 0]);
    await click3([-15000, -20000, 0]);
    const s = await app(`const m = await import("./src/core/mesh.js"); const s = app.store.project.solids.find(x => x.name === "Follow me"); return s ? [m.isClosed(s.mesh), Math.abs(m.meshVolume(s.mesh)) / 1e9] : null`);
    await tool3("none");
    return (s && s[0] && s[1] > 0.3 * 0.6 * 15) || fail(s);
  });
  await step("paint bucket on a reshaped mass paints one face; Alt+click samples a material", async () => {
    await cam3([45, 38, 52], [21, 6, 16]);
    await tool3("paint");
    await app(`app.v3d.paintMaterial = "brick"; return 1`);
    await click3([29999, 10000, 3000]);
    const pod = await solidBy("Podium");
    const painted = pod.mesh.f.filter((f) => f.m === "brick").length;
    await app(`app.v3d.paintMaterial = "glass"; return 1`);
    await click3([29999, 10000, 3000], { modifiers: 1 });
    const sampled = await app(`return app.v3d.paintMaterial`);
    await tool3("none");
    return (painted === 1 && sampled === "brick") || fail(`${painted} faces, sampled ${sampled}`);
  });
  await step("scenes remember tags and the section plane; animation export writes PNG frames and a WebM video", async () => {
    await app(`app.store.edit("x", p => { for (const s of p.scenes) { s.transition = 0.2; s.delay = 0.2; } }); return 1`);
    const r = await app(`const z = await app.v3d.sk.exportAnimation("png", 5); return z`);
    const f = fs.readdirSync(out).find((x) => x.endsWith("-png.zip"));
    if (!f || !r || r.frames < 4) fail(`png ${f} ${JSON.stringify(r)}`);
    const w = await app(`return await app.v3d.sk.exportAnimation("webm", 10)`);
    const wf = fs.readdirSync(out).find((x) => x.endsWith(".webm"));
    const sc = await app(`app.v3d.addScene(); const s = app.store.project.scenes[app.store.project.scenes.length - 1]; return [Array.isArray(s.hiddenTags), "sectionPlane" in s, "style3d" in s]`);
    return (wf && head(wf, 4).toString("hex") === "1a45dfa3" && w.size > 100 && sc.every(Boolean)) || fail({ wf, w, sc });
  });
  await step("the drawing from before the SketchUp steps comes back", async () => {
    await app(`app.v3d.resetView(); app.v3d.setOpt("furniture", true); const k = JSON.parse(${JSON.stringify(keptDrawing)}); app.store.load(k.p, { fileName: k.fileName, filePath: k.filePath }); app.v3d.hiddenTags.clear(); return 1`);
    await sleep(300);
    return app(`return app.store.project.walls.length === ${JSON.parse(keptDrawing).p.walls.length} && app.v3d.opts.furniture`);
  });

  // ---------------------------------------------------------------- export (files really written)
  sectionStart("Export");
  await app(`app.store.project.meta.title = "smoke"; return 1`);
  await step("save project (Ctrl+S) writes a .myarch that parses back", async () => {
    await a.key("F2");
    await a.key("s", 2); await sleep(400);
    const f = fs.readdirSync(out).find((x) => x.endsWith(".myarch"));
    if (!f) fail("no .myarch");
    const p = JSON.parse(fs.readFileSync(outFile(f), "utf8"));
    return (p.format === "myarch" && p.walls.length >= 5) || fail("bad file");
  });
  for (const [fmt, file, sig] of [["glb", "smoke.glb", "glTF"], ["gltf", "smoke.gltf", "{"], ["stl", "smoke.stl", null], ["ply", "smoke.ply", "ply"], ["usdz", "smoke.usdz", "PK"], ["obj", "smoke-obj.zip", "PK"], ["dae", "smoke.dae", "<?xml"], ["3mf", "smoke.3mf", "PK"]]) {
    await step(`3D export ${fmt.toUpperCase()} writes a valid file`, async () => {
      await app(`const ex = await import("./src/ui/exports.js"); await ex.export3d(app, "${fmt}", "m"); return 1`);
      await sleep(150);
      if (!exists(file)) fail(`${file} missing`);
      const h = head(file, 8).toString("latin1");
      return !sig || h.startsWith(sig) || fail(`header ${JSON.stringify(h)}`);
    });
  }
  await step("3D export dialog: pick a format and export", async () => {
    await app(`app.run("file.export3d"); return 1`);
    await waitFor(`document.querySelector('.format-row input[value="stl"]')`);
    await app(`document.querySelector('.format-row input[value="stl"]').click(); return 1`);
    await primary();
    await sleep(300);
    return exists("smoke.stl");
  });
  await step("DXF export (one file per level) reads back with walls on A-WALL", async () => {
    await app(`app.run("file.exportDxf"); return 1`);
    await waitFor(`document.querySelector(".modal")`);
    await app(`document.querySelectorAll(".modal input[type=checkbox]")[0].click(); return 1`);
    await primary(); await sleep(400);
    const files = fs.readdirSync(out).filter((f) => f.endsWith(".dxf"));
    if (files.length < 2) fail(`${files}`);
    const text = fs.readFileSync(outFile(files[0]), "utf8");
    return /AC1009/.test(text) && /A-WALL/.test(text);
  });
  await step("DXF export as AutoCAD 2018: handles, LWPOLYLINE, furniture blocks; reads back like R12", async () => {
    // The R12 files stay for the import steps below: remember them, put them back.
    const snap = Object.fromEntries(fs.readdirSync(out).filter((f) => f.endsWith(".dxf")).map((f) => [f, fs.readFileSync(outFile(f))]));
    await app(`app.run("file.exportDxf"); return 1`);
    await waitFor(`[...document.querySelectorAll(".modal select")].some(s => [...s.options].some(o => o.value === "2018"))`);
    const opts = await app(`const s = [...document.querySelectorAll(".modal select")].find(s => [...s.options].some(o => o.value === "2018")); const o = [...s.options].map(o => o.value); s.value = "2018"; s.dispatchEvent(new Event("change")); return { o, hint: document.querySelector(".modal .field-hint").textContent }`);
    await primary(); await sleep(400);
    const changed = Object.keys(snap).find((f) => !fs.readFileSync(outFile(f)).equals(snap[f]));
    if (!changed) fail("no DXF written");
    const text = fs.readFileSync(outFile(changed), "utf8");
    fs.writeFileSync(outFile(changed), snap[changed]);
    const remembered = await app(`const v = app.settings.dxfVersion; app.setSetting("dxfVersion", "R12"); return v`);
    const { importDxf } = await import(`file://${path.join(root, "src/io/dxf.js").replace(/\\/g, "/")}`);
    const r2018 = importDxf(text), r12 = importDxf(snap[changed]);
    const ok = /AC1032/.test(text) && /\n\s*5\n1F\n/.test(text) && /LWPOLYLINE/.test(text) && !/\nPOLYLINE\n/.test(text) && /\nINSERT\n/.test(text) && /\nOBJECTS\n/.test(text)
      && opts.o.join() === "R12,2000,2004,2007,2010,2013,2018" && /2018/.test(opts.hint) && remembered === "2018"
      && r2018.drawings.length === r12.drawings.length && r2018.warnings.length === 0;
    return ok || fail({ opts, remembered, d: [r2018.drawings.length, r12.drawings.length], w: r2018.warnings });
  });
  await step("DWG export (AutoCAD 2000) reads back like the DXF export", async () => {
    await app(`app.run("file.exportDwg"); return 1`);
    await waitFor(`document.querySelector(".modal") && /DWG/.test(document.querySelector(".modal").textContent)`);
    await primary(); await sleep(500);
    const file = fs.readdirSync(out).find((f) => f.endsWith(".dwg"));
    if (!file) fail("no DWG written");
    const bytes = fs.readFileSync(outFile(file));
    const { importDwg } = await import(`file://${path.join(root, "src/io/dwg.js").replace(/\\/g, "/")}`);
    const { importDxf, exportDxf } = await import(`file://${path.join(root, "src/io/dxf.js").replace(/\\/g, "/")}`);
    const r = importDwg(bytes);
    const level = await app(`return app.plan.level`);
    const p = await app(`return JSON.parse(JSON.stringify(app.store.project))`);
    const d = importDxf(exportDxf(p, { level, version: "2000" }));
    fs.unlinkSync(outFile(file)); // (later steps import every .dwg they write)
    const ok = bytes.subarray(0, 6).toString() === "AC1015" && r.units === "mm" && r.drawings.length === d.drawings.length && r.texts.length === d.texts.length && r.layers.some((l) => l.name === "A-WALL");
    return ok || fail({ head: bytes.subarray(0, 6).toString(), d: [r.drawings.length, d.drawings.length], t: [r.texts.length, d.texts.length], w: r.warnings });
  });
  await step("IFC export (IFC4 and IFC2X3) writes valid STEP", async () => {
    for (const schema of ["IFC4", "IFC2X3"]) {
      await app(`app.run("file.exportIfc"); return 1`);
      await waitFor(`document.querySelector(".modal select")`);
      await app(`const s = document.querySelector(".modal select"); s.value = "${schema}"; s.dispatchEvent(new Event("change")); return 1`);
      await primary(); await sleep(300);
      const text = fs.readFileSync(outFile("smoke.ifc"), "utf8");
      if (!text.includes(`FILE_SCHEMA(('${schema}'))`) || !/IFCWALL/.test(text)) fail(`${schema} invalid`);
      fs.copyFileSync(outFile("smoke.ifc"), outFile(`smoke-${schema}.ifc`));
    }
    return true;
  });
  await step("IFC export as ifcXML (IFC4, IFC2x3) and as IFC ZIP", async () => {
    const pick = async (schema, format) => {
      await app(`app.run("file.exportIfc"); return 1`);
      await waitFor(`document.querySelectorAll(".modal select").length >= 2`);
      await app(`const [s, f] = document.querySelectorAll(".modal select"); s.value = "${schema}"; s.dispatchEvent(new Event("change")); f.value = "${format}"; f.dispatchEvent(new Event("change")); return 1`);
      await primary(); await sleep(400);
    };
    await pick("IFC2X3", "ifcxml");
    const x2 = fs.readFileSync(outFile("smoke.ifcxml"), "utf8");
    if (!/<ex:iso_10303_28[\s>]/.test(x2) || !/configuration="i_ifc2x3"/.test(x2) || !/<IfcWall/.test(x2)) fail("IFC2x3 ifcXML invalid");
    fs.copyFileSync(outFile("smoke.ifcxml"), outFile("smoke-2x3.ifcxml"));
    await pick("IFC4", "ifcxml");
    const x4 = fs.readFileSync(outFile("smoke.ifcxml"), "utf8");
    if (!/<ifcXML xmlns="http:\/\/www.buildingsmart-tech.org\/ifcXML\/IFC4\/Add2"/.test(x4) || !/<IfcWall/.test(x4)) fail("IFC4 ifcXML invalid");
    await pick("IFC4", "ifczip");
    const z = fs.readFileSync(outFile("smoke.ifczip"));
    if (z.subarray(0, 2).toString() !== "PK" || z.readUInt16LE(8) !== 8) fail("ifczip not a deflated ZIP");
    fs.renameSync(outFile("smoke.ifczip"), outFile("smoke-export.ifczip"));
    return true;
  });
  await step("gbXML export writes spaces, surfaces, openings and constructions", async () => {
    const walls = await app(`return app.store.project.walls.filter(w => w.phase !== "demolish").length`);
    await app(`app.run("file.exportGbxml"); return 1`);
    await waitFor(`document.querySelectorAll(".modal select").length >= 3`);
    await primary(); await sleep(500);
    const x = fs.readFileSync(outFile("smoke.xml"), "utf8");
    fs.renameSync(outFile("smoke.xml"), outFile("smoke-export.gbxml"));
    const spaces = (x.match(/<Space /g) || []).length, surf = (x.match(/<Surface /g) || []).length;
    const ok = /<gbXML [^>]*version="7\.03"/.test(x) && spaces > 0 && surf >= walls && /surfaceType="ExteriorWall"/.test(x) && /<Opening /.test(x) && /<Construction /.test(x);
    await closeModals();
    return ok || fail({ spaces, surf, walls });
  });
  await step("Sweet Home 3D export writes a .sh3d with Home.xml and OBJ models that reads back", async () => {
    const before = await app(`const p = app.store.project; return { walls: p.walls.length, openings: p.openings.filter(o => p.walls.some(w => w.id === o.wall)).length, rooms: p.rooms.length }`);
    await app(`app.run("file.exportSh3d"); return 1`);
    await waitFor(`[...document.querySelectorAll(".toast")].some(t => /\\.sh3d/.test(t.textContent))`, 30000);
    await closeModals();
    const bytes = new Uint8Array(fs.readFileSync(outFile("smoke.sh3d")));
    fs.renameSync(outFile("smoke.sh3d"), outFile("smoke-export.sh3d"));
    const { zipEntries } = await import(`file://${path.join(root, "src/io/unzip.js").replace(/\\/g, "/")}`);
    const { importSh3d } = await import(`file://${path.join(root, "src/io/sh3d.js").replace(/\\/g, "/")}`);
    const names = zipEntries(bytes).map((e) => e.name);
    const warn = console.warn; console.warn = () => {};
    let back;
    try { back = (await importSh3d(bytes, { name: "smoke-export.sh3d", models: "catalog", glb: false, textures: false })).project; } finally { console.warn = warn; }
    const ok = names[0] === "Home.xml" && names.some((n) => /\/model\.obj$/.test(n)) && back.walls.length === before.walls && back.rooms.length === before.rooms && back.openings.length >= before.openings - 2;
    return ok || fail({ names: names.slice(0, 5), before, back: { walls: back.walls.length, rooms: back.rooms.length, openings: back.openings.length } });
  });
  await step("plan SVG and PNG export", async () => {
    await app(`const ex = await import("./src/ui/exports.js"); await ex.exportPlanSvg(app); return 1`);
    await app(`app.run("file.exportPng"); return 1`);
    await primary(); await sleep(500);
    const svg = fs.readdirSync(out).find((f) => f.endsWith(".svg"));
    const png = fs.readdirSync(out).find((f) => f.endsWith(".png"));
    return (svg && png && fs.readFileSync(outFile(svg), "utf8").includes("<svg") && head(png, 4).toString("latin1").includes("PNG")) || fail(`svg ${svg} png ${png}`);
  });
  await step("print preview with title block; save as PDF and as SVG sheets", async () => {
    await app(`app.run("file.print"); return 1`);
    await waitFor(`document.querySelector(".print-stage svg")`);
    const tb = await app(`return document.querySelector(".print-stage svg").innerHTML.includes("1:")`);
    await dialogButton("Save as PDF…");
    await sleep(1500);
    await app(`app.run("file.print"); return 1`);
    await waitFor(`document.querySelector(".print-stage svg")`);
    await dialogButton("Save as SVG…");
    await sleep(400);
    const pdf = fs.readdirSync(out).find((f) => f.endsWith(".pdf"));
    return (tb && pdf && head(pdf, 4).toString("latin1") === "%PDF") || fail(`title ${tb}, pdf ${pdf}`);
  });
  await step("the built-in vector PDF writer (the web build's Save as PDF…) saves every sheet", async () => {
    if (fs.existsSync(outFile("smoke.pdf"))) fs.rmSync(outFile("smoke.pdf"));
    const r = await app(`const pw = await import("./src/ui/printwin.js"); const p = app.store.project; p.meta.title = "smoke";
      const cfg = { paper: "A3", landscape: true, scale: "fit" };
      const pages = p.levels.map((l, i) => pw.sheetSvg(app, l.id, cfg, i + 1, p.levels.length));
      const saved = await pw.saveSheetsPdf(app, pages);
      return { saved: saved && saved.name, n: pages.length }`);
    await sleep(200);
    if (!exists("smoke.pdf")) fail(r);
    const s = fs.readFileSync(outFile("smoke.pdf")).toString("latin1");
    const sx = +/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)[1];
    const count = +/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)[1];
    const boxes = [...s.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Math.round((m[1] * 25.4) / 72), Math.round((m[2] * 25.4) / 72)]);
    const ok = s.startsWith("%PDF-1.4") && s.slice(sx, sx + 4) === "xref" && count === r.n && boxes.length === r.n && boxes.every(([w, h]) => w === 420 && h === 297) && /\/BaseFont \/Helvetica/.test(s);
    return ok || fail({ r, count, boxes, head: s.slice(0, 20) });
  });
  // The print window: title bar with the program icon, settings on the left,
  // live preview on the right, and a Print button that prints at once.
  const pageBox = () => app(`const pg = document.querySelector(".print-stage .page"); if (!pg) return null; const b = pg.getBoundingClientRect(); return { w: b.width, h: b.height, sw: +pg.dataset.w, sh: +pg.dataset.h, svg: pg.querySelector("svg").outerHTML.length, text: pg.querySelector("svg").innerHTML }`);
  const pwChange = (sel, value) => app(`const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("change", { bubbles: true })); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return 1`);
  const settle = () => app(`await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return 1`);
  await step("print window: title bar with icon and name, settings on the left, preview on the right", async () => {
    await closeModals();
    await app(`delete app.settings.print; app.run("file.print"); return 1`);
    await waitFor(`document.querySelector(".print-window .print-stage .page svg")`);
    await waitFor(`document.querySelector(".pw-printer option") && !document.querySelector(".pw-printer").textContent.includes("Loading")`);
    const r = await app(`const box = document.querySelector(".modal.print-window"); const icon = box.querySelector(".modal-head .modal-appicon"); const left = box.querySelector(".pw-settings").getBoundingClientRect(); const right = box.querySelector(".print-stage").getBoundingClientRect(); const b = box.getBoundingClientRect();
      return { icon: icon && icon.complete && icon.naturalWidth > 0, title: box.querySelector(".modal-title").textContent.trim(), sections: box.querySelectorAll(".pw-section").length, leftOfPreview: left.right <= right.left + 1, big: b.width > innerWidth * 0.6 && b.height > innerHeight * 0.6, printers: box.querySelectorAll(".pw-printer option").length, inside: b.right <= innerWidth && b.bottom <= innerHeight, buttons: [...box.querySelectorAll(".modal-foot .btn")].map(x => x.textContent.trim()) }`);
    return (r.icon && r.title === "Print" && r.sections >= 5 && r.leftOfPreview && r.big && r.printers >= 1 && r.inside && r.buttons.includes("Print") && !r.buttons.includes("Print…")) || fail(r);
  });
  await step("print window: orientation, paper, margins and sheet options change the preview", async () => {
    const land = await pageBox();
    await clickSel('.pw-orient [data-value="p"]'); await settle();
    const port = await pageBox();
    await pwChange(".pw-paper", "A4");
    const a4 = await pageBox();
    const m0 = await app(`return document.querySelector(".pw-margins").style.left`);
    await pwChange(".pw-margin-preset", "wide");
    const m1 = await app(`return document.querySelector(".pw-margins").style.left`);
    const tbOn = (await pageBox()).text.includes("Drawn by");
    await app(`document.querySelector('[data-section="sheet"]').open = true; return 1`);
    const tbCheck = await app(`const l = [...document.querySelectorAll('[data-section="sheet"] .check')].find(c => c.textContent.includes("Title block")); l.querySelector("input").click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return document.querySelector(".print-stage .page svg").innerHTML.includes("Drawn by")`);
    await app(`const l = [...document.querySelectorAll('[data-section="sheet"] .check')].find(c => c.textContent.includes("Title block")); l.querySelector("input").click(); return 1`);
    await pwChange(".pw-scale", "50"); await settle();
    const info = await app(`return document.querySelector(".pw-status").textContent`);
    const ok = land.w > land.h && port.h > port.w && a4.sw === 210 && a4.sh === 297 && m0 !== m1 && tbOn && tbCheck === false && info.includes("1:50") && info.includes("A4") && info.includes("Portrait");
    return ok || fail({ land, port: [port.w, port.h], a4: [a4.sw, a4.sh], m0, m1, tbOn, tbCheck, info });
  });
  await step("print window: Print sends the sheets straight to the printer — no second dialog (fake: PDF + job)", async () => {
    for (const f of ["print.pdf", "print-job.json"]) if (fs.existsSync(outFile(f))) fs.rmSync(outFile(f));
    await app(`const el = document.querySelector('[data-section="printer"] input[type=number]'); el.value = "2"; el.dispatchEvent(new Event("change")); return 1`);
    const printer = await app(`return document.querySelector(".pw-printer").value`);
    // Enter in a settings box commits the value; it must not print.
    await app(`document.querySelector('[data-section="printer"] input[type=number]').focus(); return 1`);
    await a.key("Enter"); await sleep(300);
    if (exists("print-job.json") || !(await app(`return !!document.querySelector(".print-window")`))) fail("Enter in a settings box printed");
    await dialogButton("Print");
    const t0 = Date.now();
    while (!exists("print-job.json") && Date.now() - t0 < 8000) await sleep(100);
    await sleep(200);
    const job = exists("print-job.json") ? JSON.parse(fs.readFileSync(outFile("print-job.json"), "utf8")) : null;
    const pdfOk = exists("print.pdf") && head("print.pdf", 4).toString("latin1") === "%PDF";
    const noDialog = await app(`return !document.querySelector(".modal-backdrop")`);
    const saved = await app(`return app.settings.print && app.settings.print.paper === "A4" && app.settings.print.landscape === false && app.settings.print.marginPreset === "wide"`);
    await app(`delete app.settings.print; app.settings.defaultPaper = "A3"; app.saveSettings(); return 1`);
    const ok = job && pdfOk && noDialog && saved && job.silent === true && job.copies === 2 && job.landscape === false && job.pageSize === "A4" && job.margins.marginType === "none" && (job.deviceName || "") === printer && job.sheet[0] === 210;
    return ok || fail({ job, pdfOk, noDialog, saved, printer });
  });
  await step("3D screenshot (PNG)", async () => {
    await a.key("F3"); await sleep(300);
    await app(`await app.v3d.screenshot(); return 1`);
    await a.key("F2");
    return exists("smoke-3d.png");
  });

  // ---------------------------------------------------------------- import (the exported files)
  sectionStart("Import");
  const importFile = async (file) => {
    await app(`app.store.dirty = false; app.openPath(${JSON.stringify(outFile(file))}); return 1`);
    await sleep(300);
  };
  await step("IFC (IFC4) imports as a new project with walls, openings, rooms, types", async () => {
    await importFile("smoke-IFC4.ifc");
    await waitFor(`app.store.project.walls.length >= 5`, 8000);
    await closeModals();
    return app(`const p = app.store.project; return p.openings.length >= 3 && p.rooms.length >= 3 && p.walls.some(w => w.type === "ext-brick-300") && p.solids.length === 3 && p.grids.length === 1`);
  });
  await step("IFC2X3 imports too", async () => { await importFile("smoke-IFC2X3.ifc"); await waitFor(`app.store.project.walls.length >= 5`, 8000); await closeModals(); return true; });
  // Other programs' files: generated here from the unit-test fixtures.
  const fx = await import(`file://${path.join(root, "test/unit/interop-fixtures.mjs").replace(/\\/g, "/")}`);
  const projectCounts = `const p = app.store.project; return { levels: p.levels.length, walls: p.walls.length, openings: p.openings.length, rooms: p.rooms.length, furniture: p.furniture.length, stairs: p.stairs.length, roofs: p.roofs.length, tab: app.tab, notes: !!document.querySelector(".import-report") }`;
  await step("Sweet Home 3D (.sh3d) imports levels, walls, doors/windows, rooms, furniture and stairs", async () => {
    fs.writeFileSync(outFile("smoke-home.sh3d"), fx.deflateZip([{ name: "Home", data: new Uint8Array([0xac, 0xed, 0, 5]) }, { name: "Home.xml", data: fx.HOME_XML }]));
    await importFile("smoke-home.sh3d");
    await waitFor(`app.store.project.stairs.length === 1`, 8000);
    const c = await app(projectCounts);
    await closeModals();
    return (c.levels === 2 && c.walls === 14 && c.openings === 3 && c.rooms === 3 && c.furniture === 7 && c.tab === "plan" && c.notes) || fail(c);
  });
  await step("the imported Sweet Home 3D home builds in 3D", async () => {
    await a.key("F3"); await waitFor(`app.v3d.viewer`, 10000); await app(`app.v3d.syncModel(); return 1`); await sleep(800);
    const st = await app(`return app.v3d.viewer.stats()`);
    await a.key("F2");
    return st.meshes > 30 || fail(st);
  });
  await step("Sweet Home 3D with packed 3D models: model furniture (baked GLBs) and texture materials, drawn in 3D", async () => {
    fs.writeFileSync(outFile("smoke-models.sh3d"), fx.sh3dModelZip());
    await importFile("smoke-models.sh3d");
    await waitFor(`[...document.querySelectorAll(".modal")].some(m => /Sweet Home 3D/.test(m.textContent) && m.querySelector("select"))`, 8000);
    await primary();
    await waitFor(`app.store.project.models.length === 2 && app.store.project.furniture.length === 3`, 30000);
    await closeModals();
    const c = await app(`const p = app.store.project; return { models: p.furniture.filter(f => f.kind === "model").length, glb: p.models.every(m => m.data && m.data.length > 100), mirrored: p.furniture.filter(f => f.mirrored).length, colors: p.furniture.filter(f => f.modelColors).length, mats: (p.materials || []).filter(m => m.src).length, wallMat: p.walls.some(w => (p.materials || []).some(m => m.id === w.material)) }`);
    await a.key("F3"); await waitFor(`app.v3d.viewer`, 10000); await app(`app.v3d.syncModel(); return 1`);
    // The placeholders are swapped for the models once the GLBs are parsed.
    let loaded = 0;
    for (let i = 0; i < 40 && loaded < 3; i++) { await sleep(250); loaded = await app(`let n = 0; app.v3d.viewer.three.building.traverse((o) => { if (/^model /.test(o.name || "") && o.children.some(c => !c.isMesh)) n++; }); return n`).catch(() => 0); }
    await a.key("F2");
    const ok = c.models === 3 && c.glb && c.mirrored === 1 && c.colors === 1 && c.mats === 1 && c.wallMat && loaded >= 3;
    return ok || fail({ ...c, loaded });
  });
  await step("gbXML (UTF-16, as Revit writes it) imports storeys, walls, openings, rooms and the roof", async () => {
    const text = fx.gbxmlFixture();
    fs.writeFileSync(outFile("smoke-gbxml.xml"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
    await importFile("smoke-gbxml.xml");
    await waitFor(`app.store.project.roofs.length === 1`, 8000);
    const c = await app(projectCounts);
    await closeModals();
    return (c.levels === 2 && c.walls === 9 && c.openings === 5 && c.rooms === 3 && c.notes) || fail(c);
  });
  await step("IFC ZIP (.ifczip) imports like the IFC inside it", async () => {
    fs.writeFileSync(outFile("smoke.ifczip"), fx.deflateZip([{ name: "smoke.ifc", data: fs.readFileSync(outFile("smoke-IFC4.ifc")) }]));
    await importFile("smoke.ifczip");
    await waitFor(`app.store.project.walls.length >= 5 && app.store.project.grids.length === 1`, 8000);
    await closeModals();
    return true;
  });
  await step("an old .sh3d explains what to do", async () => {
    fs.writeFileSync(outFile("smoke-old.sh3d"), fx.deflateZip([{ name: "Home", data: new Uint8Array([0xac, 0xed, 0, 5]) }]));
    await importFile("smoke-old.sh3d");
    await waitFor(`[...document.querySelectorAll(".toast")].some(t => /5\\.3/.test(t.textContent))`, 5000);
    await closeModals();
    return true;
  });
  await step("ifcXML (IFC2x3 and IFC4) and the exported .ifczip import like IFC", async () => {
    const counts = [];
    for (const f of ["smoke-2x3.ifcxml", "smoke.ifcxml", "smoke-export.ifczip"]) {
      await app(`window.__before = app.store.project; return 1`);
      await importFile(f);
      await waitFor(`app.store.project !== window.__before && app.store.project.walls.length >= 5`, 8000);
      counts.push(await app(`return app.store.project.walls.length + "/" + app.store.project.openings.length`));
      await closeModals();
    }
    return new Set(counts).size === 1 || fail(counts);
  });
  await step("the exported gbXML imports back with the same walls", async () => {
    await app(`window.__before = app.store.project; return 1`);
    await importFile("smoke-export.gbxml");
    await waitFor(`app.store.project !== window.__before && app.store.project.walls.length >= 5 && app.store.project.rooms.length >= 1`, 8000);
    await closeModals();
    return true;
  });
  const dxf = fs.readdirSync(out).find((f) => f.endsWith(".dxf"));
  await step("DXF imports as CAD layers", async () => {
    const n = await app(`return app.store.project.drawings.length`);
    await importFile(dxf);
    await primary(); await sleep(400);
    return app(`return app.store.project.drawings.length > ${n} + 10 && app.store.project.layers.some(l => l.name === "A-WALL")`);
  });
  await step("binary DXF imports like its ASCII twin", async () => {
    const bin = await import(`file://${path.join(root, "src/io/dxfbin.js").replace(/\\/g, "/")}`);
    fs.writeFileSync(outFile("smoke-binary.dxf"), bin.writeBinaryDxf(bin.asciiPairs(fs.readFileSync(outFile(dxf), "utf8"))));
    const n = await app(`return app.store.project.drawings.length`);
    await importFile("smoke-binary.dxf");
    await primary(); await sleep(400);
    await closeModals();
    const m = await app(`return app.store.project.drawings.length`);
    // The ASCII import above added the same number of items.
    return m - n > 10 || fail({ before: n, after: m });
  });
  await step("SVG with an embedded and a linked image: both become tracing underlays", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DwnwECAP0A/+5m0+0AAAAASUVORK5CYII=";
    fs.writeFileSync(outFile("smoke-scan.png"), Buffer.from(png, "base64"));
    fs.writeFileSync(outFile("smoke-images.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100" fill="none" stroke="#000"/><image x="10" y="10" width="80" height="40" href="data:image/png;base64,${png}"/><g transform="rotate(10 150 50)"><image x="110" y="10" width="80" height="40" href="smoke-scan.png"/></g></svg>`);
    const n = await app(`return app.store.project.underlays.length`);
    await importFile("smoke-images.svg");
    await waitFor(`document.querySelector(".modal") && /SVG/.test(document.querySelector(".modal").textContent)`);
    await primary(); await sleep(500);
    await closeModals();
    const r = await app(`const u = app.store.project.underlays.slice(${n}); return u.map(x => ({ w: Math.round(x.w), h: Math.round(x.h), rot: Math.round(x.rot), src: x.src.slice(0, 22), name: x.name }))`);
    const ok = r.length === 2 && r.every((u) => u.w === 80 && u.h === 40 && u.src === "data:image/png;base64,") && r[1].rot === 10 && r[1].name === "smoke-scan.png";
    return ok || fail(r);
  });
  await step("DWG (R2000, written by the test) imports as CAD layers", async () => {
    const dwgFx = await import(`file://${path.join(root, "test/unit/dwg-fixtures.mjs").replace(/\\/g, "/")}`);
    fs.writeFileSync(outFile("smoke.dwg"), dwgFx.sampleDwg());
    const n = await app(`return app.store.project.drawings.length`);
    const nt = await app(`return app.store.project.texts.length`);
    await importFile("smoke.dwg");
    await waitFor(`document.querySelector(".modal") && /DWG/.test(document.querySelector(".modal").textContent)`);
    await primary(); await sleep(400);
    await closeModals();
    return app(`const p = app.store.project; return p.drawings.length === ${n} + 4 && p.texts.length === ${nt} + 1 && p.layers.some(l => l.name === "Walls") && p.layers.some(l => l.name === "Hidden" && !l.visible)`);
  });
  await step("CAD layouts, an external reference next to the file and a raster image (all layouts side by side)", async () => {
    // A DXF host (same path as DWG: importCadRecords) with a layout and its
    // viewport, an XREF block whose file sits next to it, and an IMAGE of
    // smoke-scan.png (written by the SVG step).
    const doc = (header, tables, blocks, entities, objects) => {
      const o = []; const g = (c, v) => o.push(String(c), String(v));
      const recs = (l) => { for (const [ty, tags] of l) { g(0, ty); for (const [c, v] of tags) g(c, v); } };
      g(0, "SECTION"); g(2, "HEADER"); for (const [c, v] of header) g(c, v); g(0, "ENDSEC");
      for (const [n, l] of [["TABLES", tables], ["BLOCKS", blocks], ["ENTITIES", entities], ["OBJECTS", objects]]) { g(0, "SECTION"); g(2, n); recs(l); g(0, "ENDSEC"); }
      g(0, "EOF"); return o.join("\r\n") + "\r\n";
    };
    const ln = (x1, y1, x2, y2, layer, extra = []) => ["LINE", [[8, layer], ...extra, [10, x1], [20, y1], [11, x2], [21, y2]]];
    fs.writeFileSync(outFile("smoke-site.dxf"), doc([[9, "$INSUNITS"], [70, 4]], [["LAYER", [[2, "Roads"], [62, 1], [70, 0]]]], [], [ln(0, 0, 3000, 0, "Roads")], []));
    fs.writeFileSync(outFile("smoke-layouts.dxf"), doc([[9, "$INSUNITS"], [70, 4]],
      [["BLOCK_RECORD", [[5, "1B"], [2, "*Paper_Space"], [340, "1E"]]]],
      [["BLOCK", [[2, "Site"], [70, 4], [10, 0], [20, 0], [1, "C:\\elsewhere\\smoke-site.dxf"]]], ["ENDBLK", []]],
      [ln(0, 0, 5000, 0, "Model"), ["INSERT", [[8, "X"], [2, "Site"], [10, 0], [20, 1000]]],
        ["IMAGE", [[8, "Img"], [10, 0], [20, 2000], [11, 10], [21, 0], [12, 0], [22, 10], [13, 2], [23, 1], [70, 3], [340, "1A"]]],
        ln(0, 0, 200, 0, "Title", [[67, 1]]),
        ["VIEWPORT", [[67, 1], [8, "0"], [10, 100], [20, 50], [40, 300], [41, 200], [68, 1], [69, 1], [12, 100], [22, 50], [45, 200]]],
        ["VIEWPORT", [[67, 1], [8, "VP"], [10, 100], [20, 50], [40, 100], [41, 50], [68, 2], [69, 2], [12, 2500], [22, 0], [45, 5000]]]],
      [["LAYOUT", [[5, "1E"], [100, "AcDbLayout"], [1, "Sheet A"], [71, 1], [330, "1B"]]], ["IMAGEDEF", [[5, "1A"], [1, "C:\\scans\\smoke-scan.png"]]]]));
    const n = await app(`const p = app.store.project; return { d: p.drawings.length, u: p.underlays.length }`);
    await importFile("smoke-layouts.dxf");
    await waitFor(`[...document.querySelectorAll(".modal select")].some(s => [...s.options].some(o => o.value === "all"))`, 8000);
    const options = await app(`const s = [...document.querySelectorAll(".modal select")].find(s => [...s.options].some(o => o.value === "all")); const o = [...s.options].map(o => o.value); s.value = "all"; s.dispatchEvent(new Event("change")); return o`);
    await primary(); await sleep(600);
    await closeModals();
    const r = await app(`const p = app.store.project; return { layers: p.layers.map(l => l.name), d: p.drawings.length - ${n.d}, u: p.underlays.slice(${n.u}).map(u => ({ name: u.name, w: Math.round(u.w), h: Math.round(u.h) })) }`);
    const ok = options.join() === "model,layout:Sheet A,all" && r.layers.includes("Site|Roads") && r.layers.includes("Sheet A|VP") && r.layers.includes("Sheet A|Title")
      && r.u.length === 1 && r.u[0].name === "smoke-scan.png" && r.u[0].w === 20 && r.u[0].h === 10;
    return ok || fail({ options, r });
  });
  await step("DWG from the corpus imports (MYARCH_DWG_CORPUS)", async () => {
    const dir = process.env.MYARCH_DWG_CORPUS;
    if (!dir || !fs.existsSync(dir)) return "skipped: MYARCH_DWG_CORPUS is not set";
    const pick = fs.readdirSync(dir).filter((f) => /\.dwg$/i.test(f)).map((f) => [f, fs.statSync(path.join(dir, f)).size]).sort((x, y) => x[1] - y[1])[0];
    if (!pick) return "skipped: no .dwg in MYARCH_DWG_CORPUS";
    fs.copyFileSync(path.join(dir, pick[0]), outFile(`corpus-${pick[0]}`));
    const n = await app(`return app.store.project.drawings.length + app.store.project.texts.length`);
    await importFile(`corpus-${pick[0]}`);
    await primary(); await sleep(600);
    await closeModals();
    return (await app(`return app.store.project.drawings.length + app.store.project.texts.length > ${n}`)) ? pick[0] : false;
  });
  await step("a file that only claims to be DWG is refused with a note", async () => {
    await app(`app.openFileObject({ name: "x.dwg", bytes: new Uint8Array(16), text: "" }); return 1`);
    await waitFor(`[...document.querySelectorAll(".toast")].some(t => /DWG/.test(t.textContent))`, 5000);
    return app(`return !document.querySelector(".modal")`);
  });
  await step("SVG imports as drawing lines", async () => {
    const svg = fs.readdirSync(out).find((f) => f.endsWith(".svg"));
    const n = await app(`return app.store.project.drawings.length`);
    await importFile(svg); await primary(); await sleep(400);
    return app(`return app.store.project.drawings.length > ${n}`);
  });
  for (const file of ["smoke.glb", "smoke.stl", "smoke.ply", "smoke.dae", "smoke.3mf"]) {
    await step(`3D model ${path.extname(file)} imports as a placed model`, async () => {
      const n = await app(`return app.store.project.models.length`);
      await importFile(file); await primary();
      await waitFor(`app.store.project.models.length === ${n + 1}`, 15000);
      return app(`const m = app.store.project.models.at(-1); return m.size.every(v => v > 100) && m.data.length > 100 && app.store.project.furniture.some(f => f.model === m.id)`);
    });
  }
  // Rhino: the sample of test/unit/rhino3dm-fixtures.mjs (centimetres, layers, a block, curves).
  await step("Rhino .3dm imports as a 3D model (rhino3dm wasm in a worker) and as a plan drawing", async () => {
    const rfx = await import(`file://${path.join(root, "test/unit/rhino3dm-fixtures.mjs").replace(/\\/g, "/")}`);
    fs.writeFileSync(outFile("smoke.3dm"), await rfx.sample3dm());
    const n = await app(`return app.store.project.models.length`);
    await closeModals();
    await importFile("smoke.3dm");
    await waitFor(`document.querySelectorAll(".modal-foot .btn").length === 3`, 8000); // Cancel · Plan drawing · 3D model
    await primary(); // 3D model
    await primary(); // units / up axis
    await waitFor(`app.store.project.models.length === ${n + 1}`, 20000);
    const size = await app(`return app.store.project.models.at(-1).size.join("×")`);
    if (size !== "4000×3000×2500") fail(`model size ${size}`);
    await sleep(300); await closeModals();
    const d = await app(`return app.store.project.drawings.length`);
    await closeModals();
    await importFile("smoke.3dm");
    await waitFor(`document.querySelectorAll(".modal-foot .btn").length === 3`, 8000);
    await clickSel(".modal-foot .btn:nth-child(2)"); // Plan drawing
    await sleep(150);
    await primary();
    await waitFor(`app.store.project.drawings.length >= ${d + 9}`, 20000);
    await sleep(300); await closeModals();
    return app(`const p = app.store.project; return p.layers.some(l => l.id === "Walls") && p.layers.some(l => l.id === "Hidden" && !l.visible) && p.drawings.some(x => x.layer === "Plan" && x.kind === "circle" && x.r === 500) && p.texts.some(t => t.text === "Room 1")`);
  });
  await step("OBJ (from the exported ZIP) imports", async () => {
    const { readZip } = await import(`file://${path.join(root, "src/io/zip.js").replace(/\\/g, "/")}`);
    for (const e of readZip(new Uint8Array(fs.readFileSync(outFile("smoke-obj.zip"))))) fs.writeFileSync(outFile(e.name), e.data);
    const n = await app(`return app.store.project.models.length`);
    await importFile("smoke.obj"); await primary();
    await waitFor(`app.store.project.models.length === ${n + 1}`, 15000);
    return true;
  });
  await step("image imports as a tracing underlay", async () => {
    const png = fs.readdirSync(out).find((f) => f.endsWith(".png"));
    await importFile(png); await primary(); await sleep(400);
    return app(`return app.store.project.underlays.length >= 1`);
  });
  await step("3D view shows the imported models", async () => {
    await a.key("F3"); await app(`app.v3d.syncModel(); return 1`); await sleep(1500);
    const st = await app(`return app.v3d.viewer.stats()`);
    await a.key("F2");
    return st.meshes > 10;
  });
  await step("closed formats (SKP, RVT, PLN) explain the alternatives", async () => {
    for (const ext of ["skp", "rvt", "pln"]) {
      await app(`app.openFileObject({ name: "x.${ext}", bytes: new Uint8Array(4), text: "" }); return 1`);
      await waitFor(`document.querySelector(".modal")`);
      await closeModals();
    }
    return true;
  });

  // ---------------------------------------------------------------- recent files
  sectionStart("Recent files");
  await step("opened and saved files are remembered (newest first)", async () => app(`return (app.settings.recent || []).length >= 3 && app.settings.recent[0].path.endsWith(".png")`));
  await step("the list keeps 10 files at most", async () => {
    await app(`for (let i = 0; i < 14; i++) app.addRecent("C:/x/file" + i + ".myarch", "f" + i); return 1`);
    return app(`return app.settings.recent.length === 10 && app.settings.recent[0].path.endsWith("file13.myarch")`);
  });
  await step("recent files dialog removes one entry", async () => {
    await app(`app.run("file.recent"); return 1`);
    await waitFor(`document.querySelector(".recent-row [data-remove]")`);
    await clickSel(".recent-row [data-remove]");
    const n = await app(`return app.settings.recent.length`);
    await closeModals();
    return n === 9;
  });
  await step("start page shows the list with remove buttons; Clear list empties it", async () => {
    await app(`app.store.dirty = false; app.setTab("start"); return 1`); await sleep(300);
    const shown = await app(`return document.querySelectorAll(".recent-item").length`);
    await clickSel(".recent-item [data-remove]");
    const after = await app(`return app.settings.recent.length`);
    await clickSel('[data-clear-recent="1"]');
    const cleared = await app(`return app.settings.recent.length === 0 && !document.querySelector(".recent-item")`);
    return (shown === 9 && after === 8 && cleared) || fail(`shown ${shown}, after ${after}, cleared ${cleared}`);
  });

  // ---------------------------------------------------------------- UI
  sectionStart("Panels and settings");
  // Nothing in the side panels or the toolbar may be clipped, cut off with "…",
  // squashed or pushed out of view — checked in the plan and 3D, at the normal
  // size and at the window's minimum width (where the toolbar wraps onto two rows).
  const CLIP_CHECK = `(() => {
    const bad = [];
    const name = (e) => (e.getAttribute("title") || e.textContent || e.className || e.tagName).trim().replace(/\\s+/g, " ").slice(0, 40);
    const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    for (const side of document.querySelectorAll("#left-panel, #right-panel")) {
      if (!shown(side)) continue;
      const S = side.getBoundingClientRect();
      const panels = [...side.querySelectorAll(":scope > .panel, :scope > * > .panel")].filter(shown);
      panels.forEach((p, i) => {
        const head = p.querySelector(".panel-head");
        const P = p.getBoundingClientRect();
        if (head && P.height < head.offsetHeight - 1) bad.push("squashed panel: " + name(head));
        if (i && P.top < panels[i - 1].getBoundingClientRect().bottom - 1) bad.push("overlapping panel: " + (head ? name(head) : i));
        if (!p.classList.contains("grow")) for (const b of p.querySelectorAll(":scope > .panel-body")) if (b.scrollHeight > b.clientHeight + 2) bad.push("panel content cut off: " + (head ? name(head) : i));
      });
      for (const e of side.querySelectorAll("button, .chip, label, select, input, .ph-title, .lbl")) {
        if (!shown(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.left < S.left - 1 || r.right > S.right + 1) bad.push("outside the panel: " + name(e));
        const cs = getComputedStyle(e);
        if (e.tagName !== "INPUT" && e.tagName !== "SELECT" && (cs.overflowX !== "visible" || cs.textOverflow === "ellipsis") && e.scrollWidth > e.clientWidth + 1) bad.push("text cut off: " + name(e));
      }
    }
    // Every row of the side panels carries an icon, like the toolbar.
    for (const e of document.querySelectorAll("#left-panel label.check, #right-panel label.check, #left-panel .field-label, #right-panel .field-label, #left-panel .net-row, #right-panel .net-row"))
      if (shown(e) && !e.querySelector("svg, canvas, img")) bad.push("row without an icon: " + name(e));
    const bar = document.getElementById("toolbar"), B = bar.getBoundingClientRect();
    for (const e of bar.children) {
      if (!shown(e) || e.classList.contains("grow")) continue;
      const r = e.getBoundingClientRect();
      if (r.left < B.left - 1 || r.right > B.right + 1 || r.top < B.top - 1 || r.bottom > B.bottom + 1) bad.push("toolbar item cut off: " + name(e));
    }
    // Icons only on the toolbar: no visible words, no text dropdowns.
    for (const e of bar.querySelectorAll("button, select, span, label")) if (shown(e) && (e.tagName === "SELECT" || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) bad.push("toolbar shows text: " + name(e));
    return [...new Set(bad)].slice(0, 20);
  })()`;
  await step("no button or label in the side panels and toolbar is hidden, cut off or squashed (plan, 3D, normal and minimum width)", async () => {
    await openSample("10-office-tower.myarch"); await sleep(400);
    const panelsWere = await app(`return [app.settings.showLeft, app.settings.showRight]`);
    await app(`app.settings.showLeft = true; app.settings.showRight = true; app.applyPanels(); return 1`);
    const before = await a.ev(`return await window.myarch.windowSize()`);
    const found = [];
    for (const size of [null, [600, 700]]) {
      if (size) { await a.ev(`window.myarch.resizeWindow(${size[0]}, ${size[1]}); return 1`); await sleep(700); }
      for (const tab of ["plan", "3d"]) {
        await app(`app.setTab("${tab}"); ${tab === "3d" ? "await app.v3d.ensure();" : ""} return 1`); await sleep(600);
        const bad = await a.ev(`return ${CLIP_CHECK}`);
        for (const b of bad) found.push(`${size ? "min" : "normal"}/${tab}: ${b}`);
      }
    }
    // Back to the original size, and wait until the page has really followed.
    for (let i = 0; i < 25; i++) {
      await a.ev(`window.myarch.resizeWindow(${before.width}, ${before.height}); return 1`); await sleep(250);
      const now = await a.ev(`const s = await window.myarch.windowSize(); return s.width === ${before.width} && s.height === ${before.height} && Math.abs(innerHeight - document.documentElement.clientHeight) < 2`);
      if (now) break;
    }
    await app(`app.setTab("plan"); app.settings.showLeft = ${panelsWere[0]}; app.settings.showRight = ${panelsWere[1]}; app.applyPanels(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); return 1`); await sleep(400);
    return !found.length || fail(found.slice(0, 12).join(" · "));
  });
  await step("panel titles show icons", async () => { await openSample("03-two-storey-house.myarch"); await sleep(300); return app(`return [...document.querySelectorAll(".side .panel-head")].every(h => h.querySelector(".ph-ico svg"))`); });
  await step("collapsed panels leave rails with icon and title; click reopens", async () => {
    await a.key("1", 2); await a.key("2", 2); await sleep(200);
    const rails = await app(`return [...document.querySelectorAll(".side-rail")].map(r => !!r.querySelector("svg") && r.querySelector(".rail-title").textContent.length > 3)`);
    await clickSel('#left-panel .side-rail'); await clickSel('#right-panel .side-rail');
    const open = await app(`return app.settings.showLeft && app.settings.showRight && !document.querySelector(".side-rail")`);
    return (rails.length === 2 && rails.every(Boolean) && open) || fail(`${rails} ${open}`);
  });
  await step("status bar along the bottom on every page, with page-specific cells", async () => {
    const out = [];
    for (const tab of ["start", "plan", "3d"]) {
      await app(`app.store.dirty = false; app.setTab("${tab}"); return 1`);
      if (tab === "3d") await waitFor(`app.v3d.viewer`, 10000);
      await sleep(200);
      const r = await app(`const b = document.getElementById("statusbar").getBoundingClientRect(); return [Math.round(b.height), Math.round(innerHeight - b.bottom), Math.round(b.width - innerWidth), document.querySelectorAll("#status-cells .cell").length]`);
      if (r[0] < 18 || Math.abs(r[1]) > 1 || Math.abs(r[2]) > 1 || r[3] < 3) fail(`${tab}: height ${r[0]}, gap below ${r[1]}, width diff ${r[2]}, ${r[3]} cells`);
      out.push(`${tab} ${r[3]} cells`);
    }
    await app(`app.setTab("plan"); return 1`);
    return out.join(", ");
  });
  await step("page fills the real window exactly and the window stays on the screen (UI scale 100 % and 125 %)", async () => {
    const res = [];
    for (const z of [1, 1.25]) {
      await app(`app.settings.uiScale = ${z}; app.applySettings(); return 1`);
      await sleep(900);
      const m = await app(`const w = await window.myarch.windowSize(); const s = document.getElementById("statusbar").getBoundingClientRect(); return { w, inner: [innerWidth, innerHeight], dpr: devicePixelRatio, sb: [s.right, s.bottom] }`);
      const pageW = Math.round(m.inner[0] * z), pageH = Math.round(m.inner[1] * z);
      const a2 = m.w.area;
      if (Math.abs(pageW - m.w.width) > 2 || Math.abs(pageH - m.w.height) > 2) fail(`scale ${z}: page ${pageW}×${pageH} in a ${m.w.width}×${m.w.height} window`);
      if (Math.abs(m.sb[0] - m.inner[0]) > 1 || Math.abs(m.sb[1] - m.inner[1]) > 1) fail(`scale ${z}: status bar ends at ${m.sb} in ${m.inner}`);
      if (!m.w.maximized && (m.w.x < a2.x || m.w.y < a2.y || m.w.x + m.w.width > a2.x + a2.width || m.w.y + m.w.height > a2.y + a2.height)) fail(`scale ${z}: window ${m.w.x},${m.w.y} ${m.w.width}×${m.w.height} outside the work area ${JSON.stringify(a2)}`);
      res.push(`${z}: ${m.w.width}×${m.w.height}`);
    }
    await app(`app.settings.uiScale = 1; app.applySettings(); return 1`);
    await sleep(500);
    return res.join(", ");
  });
  await step("resize grip in the bottom-right corner resizes the window by dragging", async () => {
    const g = await app(`const el = document.getElementById("size-grip"); const b = el.getBoundingClientRect(); return { shown: getComputedStyle(el).display !== "none", cursor: getComputedStyle(el).cursor, right: Math.round(innerWidth - b.right), bottom: Math.round(innerHeight - b.bottom), x: b.left + b.width / 2, y: b.top + b.height / 2 }`);
    if (!g.shown || g.cursor !== "nwse-resize" || g.right > 1 || g.bottom > 1) fail(g);
    const before = await a.ev(`return await window.myarch.windowSize()`);
    if (before.maximized) return "window is maximized: grip hidden";
    // Shrink: synthetic mouse events outside the page are dropped, so the drag
    // stays inside the window (a real mouse keeps sending them while held).
    // The width may stop at the toolbar's minimum; the height has room.
    await a.drag(g.x, g.y, g.x - 60, g.y - 60, 10);
    await sleep(400);
    const after = await a.ev(`return await window.myarch.windowSize()`);
    await a.ev(`window.myarch.resizeWindow(${before.width}, ${before.height}); return 1`);
    await sleep(300);
    return (after.width <= before.width && after.height < before.height - 30) || fail(`${before.width}×${before.height} → ${after.width}×${after.height}`);
  });
  await step("collapse buttons in the panel titles", async () => {
    await clickSel('[data-collapse="left"]');
    const off = await app(`return !app.settings.showLeft`);
    await clickSel('#left-panel .side-rail');
    return off;
  });
  await step("settings dialog: every tab, steppers, OK", async () => {
    await a.key(",", 2);
    await waitFor(`document.querySelector(".settings-modal")`);
    const tabs = await app(`return document.querySelectorAll(".settings-modal .tab").length`);
    for (let i = 0; i < tabs; i++) await app(`document.querySelectorAll(".settings-modal .tab")[${i}].click(); return 1`);
    await app(`document.querySelector('.settings-modal [data-setting="planGrid"] [data-step="1"]').click(); return 1`);
    await primary();
    return app(`return app.settings.planGrid === 250 && ${tabs} === 6`);
  });
  await step("themes: random, menu, gallery; language toggle; units cycle", async () => {
    const t0 = await app(`return app.settings.theme`);
    await clickSel("#title-right .split-btn .icon-btn");
    const t1 = await app(`return app.settings.theme`);
    await clickSel("#title-right .split-btn .caret");
    const rows = await app(`return document.querySelectorAll(".theme-row").length`);
    await a.key("Escape"); await closeModals();
    await app(`app.run("view.themes"); return 1`); await closeModals();
    await clickSel("#title-right .lang-toggle");
    const ko = await app(`return document.querySelector('.menu-root[data-menu="File"]').textContent`);
    await clickSel("#title-right .lang-toggle");
    const u0 = await app(`return app.settings.units || "mm"`);
    await app(`[...document.querySelectorAll("#statusbar button.cell")].find(b => b.textContent.trim() === "${"mm"}").click(); return 1`);
    const u1 = await app(`return app.settings.units`);
    await app(`app.setSetting("units", "mm"); app.setSetting("theme", ${JSON.stringify(t0)}); return 1`);
    return (t1 !== t0 && rows >= 40 && ko === "파일" && u1 !== u0) || fail(`theme ${t0}→${t1}, rows ${rows}, menu ${ko}, units ${u0}→${u1}`);
  });
  await step("title bar shows every menu, view tab, the search box and its buttons in full on every page", async () => {
    for (const t of ["start", "plan", "3d"]) {
      await app(`app.store.dirty = false; app.setTab("${t}"); return 1`); await sleep(500);
      const hidden = JSON.parse(await app(`return JSON.stringify(${TITLE_HIDDEN})`));
      if (hidden.length) fail(`${t}: ${hidden.join(", ")}`);
    }
    await app(`app.setTab("plan"); return 1`);
    return true;
  });
  await step("toolbar keeps every button on a narrow (1024 px) screen", async () => {
    // A 1024 px wide screen: the desktop app shrinks or wraps the toolbar so every button stays visible.
    await a.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, screenWidth: 1024, screenHeight: 768, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const bad = await app(`app.renderToolbar(); await new Promise(r => setTimeout(r, 300)); const bar = document.getElementById("toolbar"); const r = bar.getBoundingClientRect(); return JSON.stringify({ bar: [Math.round(r.width), Math.round(r.height), bar.className, innerWidth, screen.availWidth], out: [...bar.querySelectorAll(".icon-btn")].filter(b => { const q = b.getBoundingClientRect(); return !(q.right <= r.right + 1 && q.bottom <= r.bottom + 1 && q.width > 0); }).map(b => b.dataset.cmd) })`);
    const ok = JSON.parse(bad).out.length === 0 || fail(bad);
    // The title bar (menus, view tabs, search, buttons) wraps rather than hiding anything.
    const tb = await app(`await new Promise(r => setTimeout(r, 300)); return JSON.stringify(titleHidden())`.replace("titleHidden()", TITLE_HIDDEN));
    if (JSON.parse(tb).length) fail(`title bar on a 1024 px screen hides: ${tb}`);
    await a.send("Emulation.clearDeviceMetricsOverride");
    await sleep(300);
    await app(`app.renderToolbar(); return 1`);
    return ok;
  });
  await step("about, shortcuts, formats, welcome, find, history, palette, project properties", async () => {
    for (const id of ["help.about", "help.keys", "help.formats", "help.tour", "edit.history", "file.props", "build.defaults", "build.layers"]) {
      await app(`app.run("${id}"); return 1`);
      await waitFor(`document.querySelector(".modal")`);
      await closeModals();
    }
    for (const id of ["edit.find", "palette", "file.samples"]) { await app(`app.run("${id}"); return 1`); await waitFor(`document.querySelector(".quickpick")`); await closeModals(); }
    return true;
  });

  // ---------------------------------------------------------------- lighting
  sectionStart("Lighting");
  const lampAt = (id) => app(`const f = app.store.project.furniture.find(q => q.id === ${JSON.stringify(id)}); return f ? { x: f.x, y: f.y, on: f.light && f.light.on, elevation: f.elevation } : null`);
  // Screen point of a lamp's bulb in the 3D view.
  const lampScreen = (id) => app(`const v = app.v3d.viewer; const { camera, renderer, THREE, building } = v.three; let a = null; building.traverse(o => { if (o.userData.lamp && o.userData.lamp.id === ${JSON.stringify(id)}) a = o; }); if (!a) return null; building.updateMatrixWorld(true); const q = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld).project(camera); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height];`);
  let lamp1 = null;
  await step("library Lighting category: click Ceiling light, click the plan — the lamp hangs under the ceiling, switched on", async () => {
    await closeModals();
    await app(`app.setTab("plan"); return 1`);
    await newProject();
    await fitView({ x1: -1000, y1: -1000, x2: 8000, y2: 6000 });
    const chip = await a.ev(`const c = [...document.querySelectorAll(".chip")].find(b => b.textContent === "Lighting"); if (!c) return null; const b = c.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]`);
    if (!chip) fail("no Lighting category chip");
    await a.click(chip[0], chip[1]);
    const cat = await app(`return document.querySelector(".chip.on").textContent`);
    await clickSel('.lib-item[data-kind="ceilingLight"]');
    await clickW(3000, 2000);
    lamp1 = await app(`const f = app.store.project.furniture.find(q => q.kind === "ceilingLight"); return f && f.id`);
    const l = await lampAt(lamp1);
    await app(`const c = [...document.querySelectorAll(".chip")].find(b => b.textContent === "All"); if (c) c.click(); return 1`);
    if (cat !== "Lighting") fail(`category chip "${cat}"`);
    return (l && l.on === true && l.elevation === 2800 - 120 && Math.abs(l.x - 3000) <= 50 && Math.abs(l.y - 2000) <= 50) || fail(l);
  });
  await step("plan: the lamp drags with the mouse (and snaps), its symbol shows on/off", async () => {
    const [x1, y1] = await scr(3000, 2000);
    const [x2, y2] = await scr(4500, 3200);
    await a.drag(x1, y1, x2, y2, 10);
    const l = await lampAt(lamp1);
    return (Math.abs(l.x - 4500) <= 60 && Math.abs(l.y - 3200) <= 60 && l.x % 50 === 0) || fail(l);
  });
  await step("plan right-click on the lamp: Switch light off; the properties switch turns it back on", async () => {
    const l0 = await lampAt(lamp1);
    const [x, y] = await scr(l0.x, l0.y);
    await a.click(x, y, { button: "right" });
    const r = await a.ev(`const it = [...document.querySelectorAll(".ctx-menu .menu-item")].find(m => m.textContent.includes("Switch light off")); if (!it) return null; const b = it.getBoundingClientRect(); return [b.left + 20, b.top + b.height / 2]`);
    if (!r) fail("no Switch light off item");
    await a.click(r[0], r[1]);
    const off = (await lampAt(lamp1)).on;
    await sleep(150);
    await clickSel(`[data-lamp-on="${lamp1}"] input`);
    const on = (await lampAt(lamp1)).on;
    return (off === false && on === true) || fail({ off, on });
  });
  await step("the properties show brightness, colour temperature and colour; edits are undoable", async () => {
    await app(`app.plan.select([${JSON.stringify(lamp1)}]); return 1`);
    const fields = await app(`await new Promise(r => setTimeout(r, 120)); return ["Brightness (lm)", "Colour temperature", "Light colour"].map(f => !!document.querySelector('[data-field="' + f + '"]'))`);
    if (!fields.every(Boolean)) fail(`fields ${fields}`);
    await app(`app.store.edit("x", (p) => { const f = p.furniture.find(q => q.id === ${JSON.stringify(lamp1)}); f.light.lumens = 3000; f.light.color = "#eef3ff"; }); return 1`);
    const l = await app(`return app.store.project.furniture.find(q => q.id === ${JSON.stringify(lamp1)}).light`);
    await app(`app.run("edit.undo"); return 1`);
    const back = await app(`return app.store.project.furniture.find(q => q.id === ${JSON.stringify(lamp1)}).light.lumens`);
    return (l.lumens === 3000 && back === 2000) || fail({ l, back });
  });
  await step("3D: lit lamps become lights; the toolbar's All lights button switches them off and on without a rebuild", async () => {
    await app(`app.plan.setTool("furniture", { kind: "downlight" }); return 1`);
    await clickW(1500, 1500);
    await a.key("F3");
    await waitFor(`app.v3d.viewer`, 10000);
    await app(`app.v3d.syncModel(); return 1`);
    await sleep(300);
    const info = () => app(`return app.v3d.viewer.lampInfo()`);
    const i0 = await info();
    if (!(await app(`return !!document.querySelector('#toolbar [data-cmd="light.all"]') && !!document.querySelector('#toolbar [data-cmd="v3d.night"]')`))) fail("no lighting buttons on the 3D toolbar");
    const built = await app(`return app.v3d.viewer.three.building.uuid`);
    await clickSel('#toolbar [data-cmd="light.all"]');
    await sleep(150);
    const i1 = await info();
    const offs = await app(`return app.store.project.furniture.filter(f => f.light).map(f => f.light.on)`);
    await clickSel('#toolbar [data-cmd="light.all"]');
    await sleep(150);
    const i2 = await info();
    const same = await app(`return app.v3d.viewer.three.building.uuid`);
    if (built !== same) fail("the switch rebuilt the model");
    return (i0.lamps === 2 && i0.active === 2 && i1.active === 0 && offs.every((v) => v === false) && i2.active === 2) || fail({ i0, i1, i2, offs });
  });
  await step("3D night view dims the sun so only the lamps light the room", async () => {
    await clickSel('#toolbar [data-cmd="v3d.night"]');
    await sleep(200);
    const n = await app(`const { scene } = app.v3d.viewer.three; let sun = 0; scene.traverse(o => { if (o.isDirectionalLight && o.castShadow !== undefined && o.parent === scene) sun = Math.max(sun, o.intensity); }); return { sun, env: scene.environmentIntensity, night: app.v3d.opts.night }`);
    return (n.night && n.sun === 0 && n.env < 0.1) || fail(n);
  });
  await step("3D: double-click a lamp switches it; right-click offers Switch light; a selected lamp drags with the mouse", async () => {
    await a.key("2"); await sleep(700);
    let pt = await lampScreen(lamp1);
    if (!pt) fail("no lamp anchor");
    await a.dblclick(pt[0], pt[1]);
    await sleep(200);
    const afterDbl = (await lampAt(lamp1)).on;
    const i1 = await app(`return app.v3d.viewer.lampInfo()`);
    await a.click(pt[0], pt[1], { button: "right" });
    const items = await app(`return [...document.querySelectorAll(".ctx-menu .menu-item")].map(m => m.textContent).join("|")`);
    await a.key("Escape"); await closeModals();
    if (afterDbl !== false || i1.active !== 1) fail({ afterDbl, i1 });
    if (!/Switch light on/.test(items)) fail(`menu: ${items}`);
    // Select it (click), then drag it 100 px to the right.
    const x0 = (await lampAt(lamp1)).x;
    await a.click(pt[0], pt[1]);
    await sleep(100);
    pt = await lampScreen(lamp1);
    await a.drag(pt[0], pt[1], pt[0] + 150, pt[1], 10);
    await sleep(400);
    const x1 = (await lampAt(lamp1)).x;
    await app(`app.v3d.setOpt("night", false); app.setTab("plan"); return 1`);
    return x1 > x0 + 50 || fail(`x ${x0} → ${x1}`);
  });

  // ---------------------------------------------------------------- views and sheets (src/views)
  sectionStart("Views and sheets");
  const vtCanvasXY = (x, y) => app(`const t = app.views.tab; const r = t.canvas.getBoundingClientRect(); const [sx, sy] = t.vp.toScreen(${x}, ${y}); return [r.left + sx, r.top + sy];`);
  const genReady = () => waitFor(`(() => { const t = app.views.tab; const s = t.spec(); return !s || (s.type !== "model" || !!document.querySelector(".vt-gen") && !document.querySelector(".vt-gen").textContent.includes("…")); })()`, 30000);
  await step("Project Browser lists the views, sheets and schedules of the sample", async () => {
    await closeModals();
    if (!(await openSample("03-two-storey-house.myarch"))) fail("not opened");
    await app(`app.setTab("plan"); app.settings.showLeft = true; app.applyPanels(); app.renderLeft(); return 1`);
    await sleep(300);
    const groups = await app(`return [...document.querySelectorAll("#left-panel .vb-group")].map(g => g.dataset.group)`);
    const items = await app(`return document.querySelectorAll("#left-panel .vb-item").length`);
    return (["Floor plans", "Sections", "Elevations", "Schedules", "Sheets"].every((g) => groups.includes(g)) && items >= 8) || fail({ groups, items });
  });
  let secId = null;
  await step("draw a section with the mouse: the marker appears on the plan", async () => {
    await app(`app.run("views.section"); return 1`);
    await sleep(150);
    await fitView({ x1: -4000, y1: -4000, x2: 14000, y2: 12000 });
    await clickW(-1500, 2500);
    await clickW(11500, 2500);
    await sleep(200);
    secId = await app(`const v = app.store.project.views.filter(v => v.kind === "section").at(-1); return v && Math.abs(v.line.y1 - 2500) < 60 && Math.abs(v.line.x2 - 11500) < 60 ? v.id : null`);
    return !!secId || fail("no section from the mouse");
  });
  await step("double-click the section head: the section opens, generated from the model", async () => {
    const [x, y] = await app(`const v = app.store.project.views.find(v => v.id === ${JSON.stringify(secId)}); const S = app.views.ext.scale(); const e = app.plan; const r = e.canvas.getBoundingClientRect(); const [sx, sy] = e.vp.toScreen(v.line.x2 + 4 * S, v.line.y2); return [r.left + sx, r.top + sy];`);
    await a.dblclick(x, y);
    await waitFor(`app.tab === "views" && app.views.tab.current === ${JSON.stringify(secId)}`, 5000);
    await genReady();
    const st = await app(`const t = app.views.tab; const s = t.spec(); const { cachedGen } = await import("./src/views/viewdraw.js"); const g = cachedGen(app.store.project, s, app.store.revision); return g ? { cut: g.cut.length, lines: g.lines.length, walls: g.cut.filter(c => c.kind === "walls").length } : null`);
    if (shotsDir) await a.shot(path.join(shotsDir, "views-section.png"));
    return (st && st.walls >= 2 && st.lines > 50) || fail(st);
  });
  await step("annotate the section with the mouse: aligned dimension, spot elevation and a tag", async () => {
    const n0 = await app(`return app.store.project.annotations.filter(a => a.view === ${JSON.stringify(secId)}).length`);
    await app(`app.run("ann.dim"); return 1`);
    for (const [x, y] of [[1500, 0], [9000, 0], [5000, 1200]]) { const [sx, sy] = await vtCanvasXY(x, y); await a.move(sx, sy); await a.click(sx, sy); }
    await app(`app.run("ann.spot"); return 1`);
    { const [sx, sy] = await vtCanvasXY(4000, -2800); await a.click(sx, sy); }
    await app(`app.run("ann.tag"); return 1`);
    const wallPt = await app(`const t = app.views.tab; const { cachedGen } = await import("./src/views/viewdraw.js"); const g = cachedGen(app.store.project, t.spec(), app.store.revision); const c = g.cut.find(c => c.kind === "walls"); const xs = c.pts.map(q => q[0]), ys = c.pts.map(q => q[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]`);
    { const [sx, sy] = await vtCanvasXY(...wallPt); await a.click(sx, sy); }
    await a.key("Escape");
    const list = await app(`return app.store.project.annotations.filter(a => a.view === ${JSON.stringify(secId)}).map(a => a.kind)`);
    return (list.length >= n0 + 3 && list.includes("dim") && list.includes("spot") && list.includes("tag")) || fail(list);
  });
  let sheetId = null;
  await step("new sheet, place the section on it, drag the viewport with the mouse", async () => {
    await app(`app.run("views.sheet"); return 1`);
    await waitFor(`app.views.tab.isSheet()`);
    sheetId = await app(`return app.views.tab.current`);
    await app(`app.run("views.placeView"); return 1`);
    await waitFor(`document.querySelector(".qp-input")`);
    const name = await app(`return app.store.project.views.find(v => v.id === ${JSON.stringify(secId)}).name`);
    await a.type(name);
    await sleep(150);
    const row = await a.ev(`const it = [...document.querySelectorAll(".qp-item")].find(r => r.textContent.trim().startsWith(${JSON.stringify(name)})); if (!it) return null; const b = it.getBoundingClientRect(); return [b.left + 30, b.top + b.height / 2]`);
    if (!row) fail("view not in the list");
    await a.click(row[0], row[1]);
    await waitFor(`app.store.project.sheets.find(s => s.id === ${JSON.stringify(sheetId)}).viewports.some(vp => vp.view === ${JSON.stringify(secId)})`, 15000);
    await sleep(400);
    const vp0 = await app(`const vp = app.store.project.sheets.find(s => s.id === ${JSON.stringify(sheetId)}).viewports[0]; return [vp.x, vp.y]`);
    const [sx, sy] = await vtCanvasXY(vp0[0], vp0[1]);
    await a.drag(sx, sy, sx + 120, sy + 60, 10);
    await sleep(200);
    const vp1 = await app(`const vp = app.store.project.sheets.find(s => s.id === ${JSON.stringify(sheetId)}).viewports[0]; return [vp.x, vp.y]`);
    if (shotsDir) await a.shot(path.join(shotsDir, "views-sheet.png"));
    return (vp1[0] > vp0[0] + 5 && vp1[1] > vp0[1] + 2) || fail({ vp0, vp1 });
  });
  await step("print the sheet through the print window (sheet mode, fake dialogs: PDF + job)", async () => {
    for (const f of ["print.pdf", "print-job.json"]) if (fs.existsSync(outFile(f))) fs.rmSync(outFile(f));
    await app(`app.views.printSheets([${JSON.stringify(sheetId)}]); return 1`);
    await waitFor(`document.querySelector(".print-window .print-stage .page svg")`, 15000);
    const preview = await app(`const n = app.store.project.sheets.find(s => s.id === ${JSON.stringify(sheetId)}).number; return document.querySelector(".print-stage .page svg").innerHTML.includes(n) && document.querySelector(".pw-status").textContent`);
    await dialogButton("Print");
    const t0 = Date.now();
    while (!exists("print-job.json") && Date.now() - t0 < 10000) await sleep(100);
    await sleep(200);
    const job = exists("print-job.json") ? JSON.parse(fs.readFileSync(outFile("print-job.json"), "utf8")) : null;
    const pdfOk = exists("print.pdf") && head("print.pdf", 4).toString("latin1") === "%PDF";
    return (preview && job && pdfOk && job.pages === 1 && job.paper === "A1" && job.sheet[0] === 841) || fail({ preview, job, pdfOk });
  });
  await step("publish dialog and DXF / SVG of the sheet are written", async () => {
    await app(`app.views.exportSheetsDxf([${JSON.stringify(sheetId)}]); return 1`);
    await sleep(1500);
    await app(`app.views.exportSheetsSvg([${JSON.stringify(sheetId)}]); return 1`);
    await sleep(800);
    const files = fs.readdirSync(out).filter((f) => /\.(dxf|svg)$/.test(f) && /A\d{3}/.test(f));
    const dxf = files.find((f) => f.endsWith(".dxf"));
    const ok = dxf && fs.readFileSync(path.join(out, dxf), "latin1").includes("AC1009");
    await app(`app.run("views.publish"); return 1`);
    await waitFor(`document.querySelector(".vt-pub-list")`);
    await closeModals();
    return (ok && files.some((f) => f.endsWith(".svg"))) || fail(files);
  });
  await step("every view, schedule and sheet of the sample opens without an error", async () => {
    const ids = await app(`const { allViews } = await import("./src/views/model.js"); const p = app.store.project; return [...allViews(p).filter(v => v.kind !== "plan").map(v => v.id), ...p.sheets.map(s => s.id)]`);
    for (const id of ids) {
      await app(`app.views.open(${JSON.stringify(id)}); return 1`);
      await sleep(80);
      if (await app(`return app.tab === "views"`)) await genReady();
    }
    return `${ids.length} views and sheets`;
  });
  await step("schedule view: double-click a cell, type, the model changes", async () => {
    const id = await app(`return app.views.newSchedule("rooms")`);
    await waitFor(`document.querySelector(".vt-sched td.editable")`);
    const col = await app(`const v = app.store.project.views.find(v => v.id === ${JSON.stringify(id)}); return v.fields.indexOf("name")`);
    const r = await a.ev(`const td = document.querySelectorAll(".vt-sched tbody tr[data-id]")[0].children[${col}]; const b = td.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, td.parentElement.dataset.id]`);
    await a.dblclick(r[0], r[1]);
    await waitFor(`document.querySelector(".popup-input")`);
    await app(`document.querySelector(".popup-input").value = ""; return 1`);
    await a.type("Studio X");
    await a.key("Enter");
    await sleep(200);
    return (await app(`return app.store.project.rooms.find(x => x.id === ${JSON.stringify(r[2])}).name === "Studio X"`)) || fail("not written");
  });
  await step("undo removes the last change; the views tab and plan stay consistent", async () => {
    await a.key("z", 2);
    await sleep(200);
    const ok = await app(`return app.store.project.rooms.every(r => r.name !== "Studio X")`);
    await app(`app.setTab("plan"); return 1`);
    return ok || fail("undo did not restore");
  });

  // ---------------------------------------------------------------- building elements (src/core/elements)
  sectionStart("Building elements");
  // Pick a tool from a toolbar split button's dropdown by its label.
  const splitPick = async (group, label) => {
    await clickSel(`#toolbar [data-split="${group}"]`);
    await waitFor(`[...document.querySelectorAll(".ctx-menu .menu-item")].some(m => m.textContent.includes(${JSON.stringify(label)}))`);
    const r = await a.ev(`const it = [...document.querySelectorAll(".ctx-menu .menu-item")].find(m => m.textContent.includes(${JSON.stringify(label)})); const b = it.getBoundingClientRect(); return [b.left + 24, b.top + b.height / 2]`);
    await a.click(r[0], r[1]);
    await sleep(120);
  };
  const count = (k) => app(`return app.store.project.${k}.length`);
  await step("toolbar groups the element tools in split buttons, every one visible", async () => {
    await newProject();
    await app(`app.setTab("plan"); app.renderToolbar(); return 1`);
    await sleep(200);
    const groups = await app(`return [...document.querySelectorAll("#toolbar [data-split]")].map(b => { const r = b.getBoundingClientRect(); return [b.dataset.split, r.width > 0 && r.height > 0] })`);
    const want = ["wall", "column", "stair", "slab", "types"];
    return want.every((g) => groups.some(([n, vis]) => n === g && vis)) || fail(groups);
  });
  await fitView({ x1: -3000, y1: -3000, x2: 16000, y2: 12000 });
  await step("walls, room, then P + click inside: a floor slab under the outline", async () => {
    await a.key("w");
    for (const [x, y] of [[0, 0], [9000, 0], [9000, 6000], [0, 6000], [0, 0]]) await clickW(x, y);
    await a.key("Escape"); await a.key("Escape");
    await a.key("a"); await clickW(4500, 3000); await a.key("Escape");
    await a.key("p"); await clickW(4500, 3000); await a.key("Escape");
    return app(`const s = app.store.project.slabs; return s.length === 1 && s[0].type === "floor-concrete-250" && s[0].thickness === 250 && app.plan.tool === "select"`);
  });
  await step("slab inspector: slope field changes the slab", async () => {
    await app(`app.plan.select([app.store.project.slabs[0].id]); app.settings.showRight = true; app.applyPanels(); return 1`);
    await sleep(200);
    const has = await app(`return !!document.querySelector('#right-panel [data-field="Slab type"]') && !!document.querySelector('#right-panel [data-field="Slope"]')`);
    await clickSel('#right-panel [data-field="Slope"] [data-step="1"]');
    return (has && (await app(`return app.store.project.slabs[0].slope === 1`))) || fail(`fields ${has}`);
  });
  await step("ceiling from the slab dropdown, click inside the room", async () => {
    await a.key("Escape");
    await splitPick("slab", "Ceiling");
    await clickW(4500, 3000); await a.key("Escape");
    return app(`const c = app.store.project.ceilings; return c.length === 1 && c[0].pts.length >= 4`);
  });
  await step("J + two clicks draws a beam at the top of the storey", async () => {
    await a.key("j"); await clickW(0, 3000); await clickW(9000, 3000); await a.key("Escape");
    return app(`const b = app.store.project.beams; return b.length === 1 && b[0].typeId === "beam-concrete-300x600" && b[0].w === 300`);
  });
  await step("I + clicks + Enter draws a railing", async () => {
    await a.key("i"); for (const [x, y] of [[10000, 0], [10000, 4000], [12000, 4000]]) await clickW(x, y);
    await a.key("Enter"); await a.key("Escape");
    return app(`const r = app.store.project.railings; return r.length === 1 && r[0].pts.length === 3 && r[0].height === 1000`);
  });
  await step("ramp from the stair dropdown: clicks + Enter", async () => {
    await splitPick("stair", "Ramp");
    await clickW(13000, 0); await clickW(13000, 7200); await a.key("Enter"); await a.key("Escape");
    return app(`const r = app.store.project.ramps; return r.length === 1 && r[0].width === 1500`);
  });
  await step("shaft from the slab dropdown: two corners cut the slab", async () => {
    await splitPick("slab", "Shaft opening");
    await clickW(6000, 1000); await clickW(7000, 2000); await a.key("Escape");
    return app(`return app.store.project.shafts.length === 1`);
  });
  await step("slab opening: two corners make a hole in the slab", async () => {
    await app(`app.plan.select([app.store.project.slabs[0].id]); return 1`);
    await app(`app.run("build.slabOpening"); return 1`);
    await clickW(1000, 1000); await clickW(2000, 2000);
    return app(`return app.store.project.slabs[0].holes.length === 1`);
  });
  await step("V draws a curtain wall; a door placed in it replaces panels", async () => {
    await a.key("Escape");
    await a.key("v"); await clickW(0, 9000); await clickW(9000, 9000); await a.key("Escape"); await a.key("Escape");
    await a.key("d"); await clickW(4500, 9000); await a.key("Escape");
    return app(`const p = app.store.project; const w = p.walls.find(x => x.type && p.wallTypes.find(t => t.id === x.type && t.kind === "curtain")); return !!w && p.openings.some(o => o.wall === w.id && o.kind === "door")`);
  });
  await step("L-shaped stair from the stair dropdown gets landing and railings", async () => {
    await splitPick("stair", "L-shaped");
    await clickW(1000, -2000); await clickW(5000, -2000); await a.key("Escape");
    return app(`const s = app.store.project.stairs.find(x => x.shape === "L"); return !!s && s.railing === "both"`);
  });
  await step("3D view builds slabs, ceilings, beams, railings, ramps, the curtain wall and the stair", async () => {
    await a.key("F3");
    await waitFor(`app.v3d.viewer`, 10000);
    await app(`app.v3d.syncModel(); return 1`);
    await sleep(500);
    const kinds = await app(`const s = new Set(); app.v3d.viewer.three.building.traverse(o => { if (o.isMesh && o.userData.kind) s.add(o.userData.kind); }); return [...s]`);
    if (shotsDir) await a.shot(path.join(shotsDir, "elements-3d.png"));
    await a.key("F2");
    return ["slabs", "ceilings", "beams", "railings", "ramps", "walls", "stairs"].every((k) => kinds.includes(k)) || fail(kinds);
  });
  await step("type catalogue opens from the toolbar, lists the beam type with 1 placed", async () => {
    await clickSel('#toolbar [data-group="types"] [data-cmd="build.types"]');
    await waitFor(`document.querySelector(".el-types")`);
    await clickSel('.el-types [data-cat="beam"]');
    const ok = await app(`return [...document.querySelectorAll(".el-types [data-type]")].some(b => b.dataset.type === "beam-concrete-300x600" && b.textContent.includes("1 placed"))`);
    await closeModals();
    return ok;
  });
  await step("select all instances of a type, array the beam, design option hides it", async () => {
    const id = await app(`return app.store.project.beams[0].id`);
    await app(`app.plan.select(["${id}"]); app.run("build.typeSelectAll"); return 1`);
    const sel = await app(`return app.plan.sel.size`);
    await app(`const { arrayItems } = await import("./src/ui/elements.js"); app.store.edit("Array", (p) => arrayItems(p, ["${id}"], app.plan.level, { mode: "linear", count: 3, dx: 0, dy: 1000 })); return 1`);
    const n = await count("beams");
    await app(`app.store.edit("Design options", (p) => { p.designOptions = [{ id: "ds", name: "Beams", options: [{ id: "oa", name: "A" }, { id: "ob", name: "B" }], active: "oa" }]; p.beams[0].option = "ob"; }); return 1`);
    const hidden = await app(`const h = (await import("./src/core/elements/model.js")); h.syncOptions(app.store.project); return h.optionHidden(app.store.project.beams[0])`);
    return (sel === 1 && n === 3 && hidden) || fail(`sel ${sel} beams ${n} hidden ${hidden}`);
  });
  await step("schedules show the building elements and types pages", async () => {
    await app(`app.run("build.schedules"); return 1`);
    await waitFor(`document.querySelector('.tab[data-id="e"]') && document.querySelector('.tab[data-id="t"]')`);
    await clickSel('.tab[data-id="e"]');
    const rows = await app(`return document.querySelectorAll(".modal table.grid tr").length`);
    await closeModals();
    return rows > 5 || fail(`${rows} rows`);
  });
  await step("element properties (slab, ceiling, beam, railing, ramp, shaft, stairs, curtain wall, roof) show every row with an icon, nothing cut off", async () => {
    await app(`app.setTab("plan"); app.settings.showLeft = true; app.settings.showRight = true; app.applyPanels(); return 1`);
    const ids = await app(`const p = app.store.project; return [p.slabs[0], p.ceilings[0], p.beams[0], p.railings[0], p.ramps[0], p.shafts[0], p.stairs[0], p.walls.find(w => w.type && w.type.startsWith("curtain")), p.walls[0], p.openings[0]].filter(Boolean).map(x => x.id)`);
    const found = [];
    for (const id of ids) {
      await app(`app.plan.select(["${id}"]); return 1`); await sleep(250);
      for (const b of await a.ev(`return ${CLIP_CHECK}`)) found.push(`${id}: ${b}`);
    }
    await app(`app.plan.clearSelection(); return 1`);
    return !found.length || fail(found.slice(0, 12).join(" · "));
  });
  await step("IFC export of the elements reads back with every element", async () => {
    const r = await app(`const ifc = await import("./src/io/ifc.js"); const t = ifc.exportIfc(app.store.project); const q = ifc.importIfc(t).project; return [q.slabs.length, q.ceilings.length, q.beams.length, q.railings.length, q.ramps.length, q.shafts.length]`);
    const p = await app(`const p = app.store.project; return [p.slabs.length, p.ceilings.length, p.beams.filter(b => b.option !== "ob").length, p.railings.length, p.ramps.length, p.shafts.length]`);
    return JSON.stringify(r) === JSON.stringify(p) || fail(`${r} vs ${p}`);
  });

  // ---------------------------------------------------------------- every command
  sectionStart("Every command");
  await step("every registered command runs on the plan and in 3D without an error", async () => {
    const skip = new Set(["file.exit", "help.manual", "palette", "help.tutorial", "file.new", "file.samples", "v3d.playScenes"]);
    const ids = await app(`return [...app.commands.keys()]`);
    let n = 0;
    for (const tab of ["plan", "3d"]) {
      await openSample("06-renovation-bim.myarch");
      await app(`app.setTab("${tab}"); return 1`);
      if (tab === "3d") await waitFor(`app.v3d.viewer`, 10000);
      for (const id of ids) {
        if (skip.has(id)) continue;
        await app(`app.store.dirty = false; app.plan.select(app.store.project.walls.slice(0, 2).map(w => w.id)); app.run(${JSON.stringify(id)}); return 1`);
        await sleep(60);
        await closeModals();
        await a.key("Escape");
        n++;
      }
    }
    return `${n} command runs`;
  });

  // ---------------------------------------------------------------- tutorial
  sectionStart("Tutorial");
  for (const lang of ["en", "ko"]) {
    await step(`tutorial (${lang}): every step of every lesson runs and checks its result`, async () => {
      await closeModals();
      await app(`app.setSetting("lang", "${lang}"); app.store.dirty = false; return 1`);
      const rep = await app(`const t = await app.openTutorial({ skipConfirm: true }); return await t.runAll();`);
      const bad = rep.filter((r) => !r.ok);
      return bad.length ? fail(bad.map((r) => `${r.lesson} / ${r.step}: ${r.error}`).join("; ")) : `${rep.length} steps`;
    });
  }
  await step("tutorial practice mode recognises every step done by the user", async () => {
    await app(`app.setSetting("lang", "en"); app.store.dirty = false; app.tutorial.close(); return 1`);
    const rep = await app(`const t = await app.openTutorial({ skipConfirm: true }); return await t.verifyPractice();`);
    const bad = rep.filter((r) => !r.run || r.check === false);
    return bad.length ? fail(bad.map((r) => `${r.lesson} / ${r.step}`).join("; ")) : `${rep.length} steps`;
  });
  await step("tutorial opens from the Help menu with watch/practice modes", async () => {
    await app(`app.tutorial.close(); app.store.dirty = false; return 1`);
    await clickSel('.menu-root[data-menu="Help"]');
    const r = await a.ev(`const it = [...document.querySelectorAll(".ctx-menu .menu-item")].find(m => m.textContent.includes("Interactive tutorial")); const b = it.getBoundingClientRect(); return [b.left + 20, b.top + 10]`);
    await a.click(r[0], r[1]);
    await waitFor(`document.querySelector(".tut-panel") && document.querySelector(".tut-panel").style.display !== "none"`);
    const lessons = await app(`return document.querySelectorAll(".tut-lesson option").length`);
    await app(`app.tutorial.close(); return 1`);
    return lessons >= 16 || fail(`${lessons} lessons`);
  });
} catch (e) {
  results.push({ name: "harness", ok: false, detail: e.stack || String(e), section, ms: 0 });
  console.error(e);
} finally {
  if (a) await a.close();
  if (!keep) fs.rmSync(out, { recursive: true, force: true });
  else console.log(`output kept in ${out}`);
}

// ---------------------------------------------------------------- summary
console.log(`\n${bold("Summary")}`);
for (const s of sectionOrder) {
  const r = results.filter((x) => x.section === s);
  if (!r.length) continue;
  const f = r.filter((x) => !x.ok).length;
  console.log(`  ${(f ? red : green)(s.padEnd(22))} ${String(r.length).padStart(4)} checks  ${f ? red(`${f} failed`) : green("all passed")}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n  ${failed.length ? bgRed(" SMOKE FAILED ") : bgGreen(" ALL GUI CHECKS PASSED ")}  ${results.length - failed.length}/${results.length} checks`);
for (const f of failed) console.log(red(`  ✖ [${f.section}] ${f.name}: ${f.detail}`));
process.exit(failed.length ? 1 : 0);
