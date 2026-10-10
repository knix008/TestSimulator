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
  await step("menu bar has File, Edit, View, Draw, Build, BIM, 3D and Help", async () => app(`return ["File","Edit","View","Draw","Build","BIM","3D","Help"].every(m => document.querySelector('.menu-root[data-menu="' + m + '"]'))`));
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
      if (tabs !== 5) fail(`${tabs} tabs`);
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
  const dxf = fs.readdirSync(out).find((f) => f.endsWith(".dxf"));
  await step("DXF imports as CAD layers", async () => {
    const n = await app(`return app.store.project.drawings.length`);
    await importFile(dxf);
    await primary(); await sleep(400);
    return app(`return app.store.project.drawings.length > ${n} + 10 && app.store.project.layers.some(l => l.name === "A-WALL")`);
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
  await step("closed formats (DWG, SKP, RVT) explain the alternatives", async () => {
    for (const ext of ["dwg", "skp", "rvt"]) {
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
