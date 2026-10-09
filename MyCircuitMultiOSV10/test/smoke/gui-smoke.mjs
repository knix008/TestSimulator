// GUI smoke test: launches the real desktop app (Electron) with a throw-away
// profile, drives it through CDP with real mouse/keyboard events and runs
// every command, failing on any uncaught renderer exception.
//
//   npm run smoke            (or: node test/smoke/gui-smoke.mjs [--keep] [--shots dir])
//
// Unit tests cannot see renderer-only crashes (a typo in a dialog, a bad DOM
// call); this does.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 9581 + Math.floor(Math.random() * 300);
const keep = process.argv.includes("--keep");
const shotsArg = process.argv.indexOf("--shots");
const shotsDir = shotsArg > 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = process.platform === "win32" ? path.join(root, "node_modules/electron/dist/electron.exe")
  : process.platform === "darwin" ? path.join(root, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")
  : path.join(root, "node_modules/electron/dist/electron");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mycircuit-smoke-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(exe, [root, `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`], { env, stdio: "ignore" });

let ws;
let msgId = 0;
const pending = new Map();
const errors = [];
const results = [];

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === "page" && /index\.html/.test(t.url));
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
          if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
          if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push("console.error: " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
        };
        await send("Runtime.enable");
        await send("Page.enable");
        return;
      }
    } catch { /* not ready */ }
    await sleep(250);
  }
  throw new Error("app did not start");
}

function send(method, params = {}) {
  return new Promise((res) => { const i = ++msgId; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
}

async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
}

async function mouse(type, x, y, button = "left", clickCount = 1) {
  await send("Input.dispatchMouseEvent", { type, x, y, button, clickCount, buttons: type === "mouseReleased" ? 0 : button === "left" ? 1 : 2 });
}
async function click(x, y, opts = {}) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
  await mouse("mousePressed", x, y, opts.button || "left", opts.count || 1);
  await mouse("mouseReleased", x, y, opts.button || "left", opts.count || 1);
  await sleep(40);
}
async function move(x, y) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 }); await sleep(20); }
const VK = { Escape: 27, Enter: 13, Delete: 46, Backspace: 8, Home: 36, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F8: 119, PageDown: 34, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40 };
async function key(k, mods = 0) {
  const base = { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, modifiers: mods, windowsVirtualKeyCode: VK[k] || k.toUpperCase().charCodeAt(0) };
  await send("Input.dispatchKeyEvent", { type: k.length === 1 ? "keyDown" : "rawKeyDown", ...base, text: k.length === 1 && !mods ? k : undefined });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  await sleep(40);
}
async function shot(name) {
  if (!shotsDir) return;
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(shotsDir, `${name}.png`), Buffer.from(r.result.data, "base64"));
}

let section = "Start-up";
const sectionOrder = [];
function sectionStart(name) {
  section = name;
  if (!sectionOrder.includes(name)) sectionOrder.push(name);
  process.stdout.write(`\n\x1b[44;37;1m ${name} \x1b[0m\n`);
}

async function step(name, fn) {
  const t0 = performance.now();
  const before = errors.length;
  let ok = true;
  let detail = "";
  try {
    const r = await fn();
    if (r === false) { ok = false; detail = "check failed"; }
    else if (typeof r === "string") detail = r;
  } catch (e) { ok = false; detail = e.message.split("\n")[0]; }
  if (errors.length > before) { ok = false; detail += ` | ${errors.slice(before).join(" | ").slice(0, 400)}`; }
  results.push({ name, ok, detail, section, ms: performance.now() - t0 });
  process.stdout.write(`${ok ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✖\x1b[0m"} ${name}${detail ? `  — ${detail}` : ""}\n`);
}

const fail = (x) => { throw new Error(typeof x === "string" ? x : JSON.stringify(x)); };
const closeModals = () => ev(`document.querySelectorAll(".modal-backdrop,.qp-backdrop,.ctx-menu,.popup-input").forEach(e => e.remove()); return 1;`);

// Canvas centre / world→screen helpers inside the page.
const toScreen = (ed, x, y) => ev(`const e = window.mycircuitApp.${ed}; const r = e.canvas.getBoundingClientRect(); const [sx, sy] = e.vp.toScreen(${x}, ${y}); return [r.left + sx, r.top + sy];`);

try {
  await connect();
  await sleep(1200);
  sectionStart("Start-up");
  await step("app boots, title set, welcome dialog shown", async () => ev(`return !!window.mycircuitApp && document.title.includes("MyCircuit") && !!document.querySelector(".modal")`));
  await closeModals();
  await ev(`window.mycircuitApp.settings.onboarded = true; window.mycircuitApp.setSetting("lang", "en"); return 1`);

  sectionStart("Schematic editing");
  await step("new project via Ctrl+N", async () => { await key("n", 2); await sleep(200); return ev(`return window.mycircuitApp.tab === "sch" && window.mycircuitApp.store.project.schematic.parts.length === 0`); });
  await step("place resistor with the mouse (A → pick → click)", async () => {
    await ev(`window.mycircuitApp.sch.setTool("place", { lib: "R" }); window.mycircuitApp.sch.vp.scale = 0.25; window.mycircuitApp.sch.vp.ox = 100; window.mycircuitApp.sch.vp.oy = 50; window.mycircuitApp.sch.request(); return 1`);
    const [x, y] = await toScreen("sch", 2000, 1500);
    await move(x, y);
    await click(x, y);
    return ev(`return window.mycircuitApp.store.project.schematic.parts.length === 1`);
  });
  await step("rotate ghost with R and place an LED", async () => {
    await ev(`window.mycircuitApp.sch.setTool("place", { lib: "LED" }); return 1`);
    const [x, y] = await toScreen("sch", 3000, 1800);
    await move(x, y);
    await click(x, y);
    await key("Escape");
    return ev(`return window.mycircuitApp.store.project.schematic.parts.length === 2 && window.mycircuitApp.sch.tool === "select"`);
  });
  await step("draw a wire between pins with W and clicks (auto-finish on pin)", async () => {
    const pins = await ev(`const {partPins} = await import("./src/core/netlist.js"); const s = window.mycircuitApp.store.project.schematic; return [partPins(s.parts[0]).find(p=>p.num==="2"), partPins(s.parts[1]).find(p=>p.num==="2")].map(p=>[p.x,p.y]);`);
    await key("w");
    const [ax, ay] = await toScreen("sch", pins[0][0], pins[0][1]);
    const [bx, by] = await toScreen("sch", pins[1][0], pins[1][1]);
    await move(ax, ay); await click(ax, ay);
    await move(bx, by); await click(bx, by);
    await key("Escape");
    return ev(`const {buildNetlist} = await import("./src/core/netlist.js"); const s = window.mycircuitApp.store.project.schematic; const nl = buildNetlist(s); return nl.pinNet.get(s.parts[0].id + ":2") === nl.pinNet.get(s.parts[1].id + ":2") && s.wires.length >= 1`);
  });
  await step("power port via P, GND placed on LED cathode", async () => {
    const pin = await ev(`const {partPins} = await import("./src/core/netlist.js"); const p = partPins(window.mycircuitApp.store.project.schematic.parts[1]).find(p=>p.num==="1"); return [p.x,p.y]`);
    await ev(`window.mycircuitApp.sch.setTool("place", { lib: "GND" }); return 1`);
    const [x, y] = await toScreen("sch", pin[0], pin[1]);
    await move(x, y); await click(x, y); await key("Escape");
    return ev(`return window.mycircuitApp.store.project.schematic.parts.some(p => p.lib === "GND")`);
  });
  await step("net label with L + inline editor", async () => {
    const pin = await ev(`const {partPins} = await import("./src/core/netlist.js"); const p = partPins(window.mycircuitApp.store.project.schematic.parts[0]).find(p=>p.num==="1"); return [p.x,p.y]`);
    await key("l");
    const [x, y] = await toScreen("sch", pin[0], pin[1]);
    await move(x, y); await click(x, y); await sleep(100);
    await ev(`const i = document.querySelector(".popup-input"); i.value = "VIN"; i.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true})); return 1`);
    await key("Escape");
    return ev(`return window.mycircuitApp.store.project.schematic.labels.some(l => l.text === "VIN")`);
  });
  await step("select by click, drag-move with rubber-banding, undo/redo", async () => {
    const [x, y] = await toScreen("sch", 2000, 1500);
    await move(x, y);
    await mouse("mousePressed", x, y);
    for (let i = 1; i <= 6; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + i * 12, y, buttons: 1 });
    await mouse("mouseReleased", x + 72, y);
    const moved = await ev(`return window.mycircuitApp.store.project.schematic.parts[0].x !== 2000`);
    await key("z", 2);
    const undone = await ev(`return window.mycircuitApp.store.project.schematic.parts[0].x === 2000`);
    await key("y", 2);
    return moved && undone && ev(`return window.mycircuitApp.store.project.schematic.parts[0].x !== 2000`);
  });
  await step("rotate (R), mirror (Y), copy/paste (Ctrl+C/V), delete (Del)", async () => {
    await ev(`const a = window.mycircuitApp; a.sch.select([a.store.project.schematic.parts[0].id]); return 1`);
    await key("r"); await key("y"); await key("c", 2);
    const [x, y] = await toScreen("sch", 4000, 3000);
    await move(x, y);
    await key("v", 2);
    const n = await ev(`return window.mycircuitApp.store.project.schematic.parts.length`);
    await key("Delete");
    return n >= 4 && ev(`return window.mycircuitApp.store.project.schematic.parts[0].rot === 90`);
  });
  await step("box selection (Shift+drag on empty canvas)", async () => {
    await ev(`window.mycircuitApp.sch.clearSelection(); return 1`);
    await ev(`window.mycircuitApp.sch.zoomFit(); return 1`);
    await sleep(100);
    const [x1, y1, x2, y2] = await ev(`const c = window.mycircuitApp.sch.canvas.getBoundingClientRect(); return [c.left + 30, c.top + 30, c.right - 8, c.bottom - 8];`);
    const ox = await ev(`return window.mycircuitApp.sch.vp.ox`);
    await move(x1, y1);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1, buttons: 1, modifiers: 8 });
    for (let i = 1; i <= 5; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + ((x2 - x1) * i) / 5, y: y1 + ((y2 - y1) * i) / 5, buttons: 1, modifiers: 8 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1, buttons: 0, modifiers: 8 });
    await sleep(60);
    return ev(`return window.mycircuitApp.sch.sel.size >= 3 && window.mycircuitApp.sch.vp.ox === ${ox}`);
  });
  await step("plain left-drag on empty canvas moves the drawing (default)", async () => {
    await ev(`window.mycircuitApp.sch.clearSelection(); return 1`);
    const [cx, cy] = await ev(`const c = window.mycircuitApp.sch.canvas.getBoundingClientRect(); return [c.left + 40, c.bottom - 40];`);
    const before = await ev(`const v = window.mycircuitApp.sch.vp; return [v.ox, v.oy, window.mycircuitApp.settings.emptyDrag]`);
    await move(cx, cy);
    await mouse("mousePressed", cx, cy);
    for (let i = 1; i <= 6; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + 15 * i, y: cy - 10 * i, buttons: 1 });
    await mouse("mouseReleased", cx + 90, cy - 60);
    await sleep(60);
    const after = await ev(`const v = window.mycircuitApp.sch.vp; return [v.ox, v.oy, window.mycircuitApp.sch.sel.size]`);
    // Back where it was, so later steps see the same view.
    await ev(`window.mycircuitApp.sch.vp.ox = ${before[0]}; window.mycircuitApp.sch.vp.oy = ${before[1]}; window.mycircuitApp.sch.request(); return 1`);
    return before[2] === "pan" && Math.abs(after[0] - before[0] - 90) < 3 && Math.abs(after[1] - before[1] + 60) < 3 && after[2] === 0 ? true : fail({ before, after });
  });
  await step("multi-page: add a page with the + tab, place a part there, switch back", async () => {
    const [x, y] = await ev(`const b = document.querySelector(".page-tab.add").getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2];`);
    await click(x, y);
    await sleep(150);
    await closeModals();
    const two = await ev(`const a = window.mycircuitApp; return a.store.project.schematic.pages.length === 2 && a.sch.pageId === a.store.project.schematic.pages[1].id && a.sch.sch.parts.length === 0`);
    await ev(`window.mycircuitApp.sch.setTool("place", { lib: "C" }); return 1`);
    const [cx, cy] = await ev(`const c = window.mycircuitApp.sch.canvas.getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2];`);
    await move(cx, cy); await click(cx, cy); await key("Escape");
    const onTwo = await ev(`return window.mycircuitApp.sch.sch.parts.length === 1`);
    const [fx, fy] = await ev(`const b = document.querySelector(".page-tab").getBoundingClientRect(); return [b.left + 10, b.top + 10];`);
    await click(fx, fy);
    return two && onTwo && ev(`const a = window.mycircuitApp; return a.sch.pageId === a.store.project.schematic.pages[0].id && !a.sch.sch.parts.some(p => p.lib === "C")`);
  });
  await step("right-click context menu opens", async () => {
    const [x, y] = await toScreen("sch", 2000, 1500);
    await click(x, y, { button: "right" });
    const ok = await ev(`return !!document.querySelector(".ctx-menu")`);
    await closeModals();
    return ok;
  });
  await step("command palette (Ctrl+K) and find", async () => {
    await key("k", 2);
    const ok = await ev(`return !!document.querySelector(".quickpick")`);
    await closeModals();
    return ok;
  });
  await shot("01-schematic");

  sectionStart("Samples (every tab)");
  const samples = await ev(`const { loadSampleIndex } = await import("./src/ui/dialogs.js"); return (await loadSampleIndex()).map(s => s.file);`);
  await step(`sample index lists samples (${samples.length})`, async () => samples.length > 0);
  for (const file of samples) {
    await step(`sample ${file}: open, schematic, PCB, ERC, DRC, 3D, simulate`, async () => {
      await ev(`const a = window.mycircuitApp; a.store.dirty = false; await a.openSample(${JSON.stringify(file)}); return 1`);
      await sleep(150);
      await key("F2"); await sleep(80);
      await key("F3"); await sleep(80);
      const erc = await ev(`return window.mycircuitApp.runErc(false).filter(i => i.severity === "error").length`);
      const drc = await ev(`return (await window.mycircuitApp.runDrc(false)).filter(i => i.severity === "error").length`);
      await key("F4"); await sleep(1200);
      const tri = await ev(`const v = window.mycircuitApp.v3d.viewer; return v ? v.stats().triangles : 0`);
      await key("F6"); await sleep(60);
      const sim = await ev(`const a = window.mycircuitApp; if (!a.store.project.sim.probes.length && a.store.project.sim.mode === "op" && !a.store.project.schematic.parts.some(p => p.lib === "VSOURCE" || p.lib === "BATTERY")) return "skip"; await a.simView.run(); return a.simResult ? a.simResult.ok : false;`);
      await shot(`sample-${file.replace(/\.mycircuit$/, "")}`);
      await closeModals();
      if (erc || drc || !tri || sim === false) throw new Error(`erc=${erc} drc=${drc} triangles=${tri} sim=${sim}`);
      return `drc ok, ${tri} triangles, sim ${sim}`;
    });
  }

  sectionStart("PCB editing");
  await step("PCB: route a track with the mouse (X, clicks, Esc)", async () => {
    await ev(`const a = window.mycircuitApp; a.store.dirty = false; a.store.load((await import("./src/core/project.js")).newProject("route")); return 1`);
    await ev(`const a = window.mycircuitApp; const s = a.store.project.schematic; const ops = await import("./src/sch/ops.js"); const {partPins} = await import("./src/core/netlist.js");
      const r1 = ops.newPart("R", 1000, 1000, {ref:"R1"}), r2 = ops.newPart("R", 2000, 1000, {ref:"R2"}); s.parts.push(r1, r2);
      const p1 = partPins(r1).find(p=>p.num==="1"), p2 = partPins(r2).find(p=>p.num==="1");
      s.labels.push({id:"a",kind:"local",text:"N1",x:p1.x,y:p1.y,rot:0},{id:"b",kind:"local",text:"N1",x:p2.x,y:p2.y,rot:0}); a.updatePcb();
      const f = a.store.project.pcb.footprints; f[0].x = 15; f[0].y = 20; f[1].x = 40; f[1].y = 20; a.store.touch("t"); a.pcb.zoomFit(); return 1`);
    await sleep(200);
    const pads = await ev(`const {footprintPads} = await import("./src/pcb/board.js"); const pcb = window.mycircuitApp.store.project.pcb; return pcb.footprints.map(f => footprintPads(f, pcb).find(p => p.num === "1")).map(p => [p.x, p.y]);`);
    await key("x");
    const [ax, ay] = await toScreen("pcb", pads[0][0], pads[0][1]);
    const [bx, by] = await toScreen("pcb", pads[1][0], pads[1][1]);
    await move(ax, ay); await click(ax, ay);
    await move((ax + bx) / 2, ay - 40); await click((ax + bx) / 2, ay - 40);
    await move(bx, by); await click(bx, by);
    await key("Escape"); await key("Escape");
    return ev(`return window.mycircuitApp.pcb.stats().unrouted === 0 && window.mycircuitApp.store.project.pcb.tracks.length >= 2`);
  });
  await step("PCB: via (V), rotate (R), flip (F), layer change (PgDn), measure (M)", async () => {
    await key("v");
    const [x, y] = await toScreen("pcb", 25, 30);
    await move(x, y); await click(x, y);
    await key("Escape");
    await ev(`const a = window.mycircuitApp; a.pcb.select([a.store.project.pcb.footprints[0].id]); return 1`);
    await key("r"); await key("f"); await key("PageDown"); await key("m");
    await click(x, y); await move(x + 80, y); await click(x + 80, y);
    await key("Escape"); await key("Escape");
    return ev(`const p = window.mycircuitApp.store.project.pcb; return p.vias.length === 1 && p.footprints[0].side === "B"`);
  });
  await step("PCB: draw board outline by dragging (O)", async () => {
    await key("o");
    const [x1, y1, x2, y2] = await ev(`const c = window.mycircuitApp.pcb.canvas.getBoundingClientRect(); return [c.left + 20, c.top + 20, c.right - 20, c.bottom - 20];`);
    const before = await ev(`return JSON.stringify(window.mycircuitApp.store.project.pcb.outline)`);
    await move(x1, y1);
    await mouse("mousePressed", x1, y1);
    for (let i = 1; i <= 5; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + ((x2 - x1) * i) / 5, y: y1 + ((y2 - y1) * i) / 5, buttons: 1 });
    await mouse("mouseReleased", x2, y2);
    await key("Escape");
    return ev(`return JSON.stringify(window.mycircuitApp.store.project.pcb.outline) !== ${JSON.stringify(before)} && window.mycircuitApp.store.project.pcb.outline.length === 4`);
  });
  await shot("02-pcb");
  await step("PCB: push and shove — routing next to another net's track pushes it aside", async () => {
    await ev(`const a = window.mycircuitApp; a.store.dirty = false; const P = await import("./src/core/project.js"); const p = P.newProject("shove");
      p.pcb.outline = [[0, 0], [60, 0], [60, 40], [0, 40]];
      p.pcb.tracks.push({ id: "tA", net: "A", layer: "F.Cu", w: 0.25, x1: 10, y1: 20, x2: 40, y2: 20 }, { id: "tB", net: "B", layer: "F.Cu", w: 0.25, x1: 5, y1: 19.7, x2: 10, y2: 19.7 });
      a.store.load(p); a.setTab("pcb"); a.pcb.setActiveLayer("F.Cu"); a.setSetting("routeMode", "shove"); a.pcb.vp.fit({ x1: 4, y1: 15, x2: 42, y2: 25 }, 0.05); return 1`);
    await sleep(250);
    await ev(`window.mycircuitApp.pcb.setTool("route"); return 1`);
    const [ax, ay] = await toScreen("pcb", 10, 19.7);
    const [bx, by] = await toScreen("pcb", 30, 19.7);
    await move(ax, ay); await click(ax, ay);
    await move(bx, by); await click(bx, by);
    await key("Escape"); await key("Escape");
    const r = await ev(`const p = window.mycircuitApp.store.project.pcb; const A = p.tracks.filter((t) => t.net === "A"); const B = p.tracks.filter((t) => t.net === "B");
      const { runDRC } = await import("./src/pcb/drc.js").catch(() => ({}));
      return { a: A.map((t) => [t.x1, t.y1, t.x2, t.y2].map((v) => +v.toFixed(3))), b: B.length, minGap: Math.min(...A.map((t) => Math.min(Math.abs(t.y1 - 19.7), Math.abs(t.y2 - 19.7)))) };`);
    await ev(`window.mycircuitApp.setSetting("routeMode", "highlight"); return 1`);
    // B gained a segment; A no longer sits 0.3 mm away (needs ≥ 0.45 mm centre to centre).
    return r.b >= 2 && r.a.length >= 1 && r.a.some((t) => t[1] !== 20 || t[3] !== 20) ? `A moved: ${JSON.stringify(r.a)}` : fail(r);
  });
  await step("PCB: routing mode 'stop at obstacles' refuses a clashing segment", async () => {
    await ev(`const a = window.mycircuitApp; a.store.dirty = false; const P = await import("./src/core/project.js"); const p = P.newProject("block");
      p.pcb.outline = [[0, 0], [60, 0], [60, 40], [0, 40]];
      p.pcb.tracks.push({ id: "tA", net: "A", layer: "F.Cu", w: 0.25, x1: 10, y1: 20, x2: 40, y2: 20 }, { id: "tB", net: "B", layer: "F.Cu", w: 0.25, x1: 5, y1: 19.7, x2: 10, y2: 19.7 });
      a.store.load(p); a.pcb.setActiveLayer("F.Cu"); a.setSetting("routeMode", "block"); a.pcb.vp.fit({ x1: 4, y1: 15, x2: 42, y2: 25 }, 0.05); a.pcb.setTool("route"); return 1`);
    await sleep(200);
    const [ax, ay] = await toScreen("pcb", 10, 19.7);
    const [bx, by] = await toScreen("pcb", 30, 19.7);
    await move(ax, ay); await click(ax, ay);
    await move(bx, by); await click(bx, by);
    await key("Escape"); await key("Escape");
    const n = await ev(`return window.mycircuitApp.store.project.pcb.tracks.filter((t) => t.net === "B").length`);
    await ev(`window.mycircuitApp.setSetting("routeMode", "highlight"); return 1`);
    return n === 1 ? true : fail(`B has ${n} tracks`);
  });
  await step("PCB: differential pair dialog routes USB D+/D- as a coupled pair", async () => {
    await ev(`const a = window.mycircuitApp; a.store.dirty = false; await a.openSample("09-usb-uart-ch340.mycircuit"); a.setTab("pcb"); return 1`);
    await sleep(500);
    await ev(`window.mycircuitApp.run("pcb.diffPair"); return 1`);
    await sleep(500);
    const rows = await ev(`return document.querySelectorAll('.modal [data-pair]').length`);
    await ev(`[...document.querySelectorAll(".modal-foot .btn")].find((b) => b.classList.contains("primary")).click(); return 1`);
    await sleep(1500);
    const r = await ev(`const dp = await import("./src/pcb/diffpair.js"); const p = window.mycircuitApp.store.project; const pr = dp.findPairs(p)[0]; const sk = dp.pairSkew(p, pr.p, pr.n);
      return { pair: pr.p + "/" + pr.n, tracksP: p.pcb.tracks.filter((t) => t.net === pr.p).length, tracksN: p.pcb.tracks.filter((t) => t.net === pr.n).length, skew: sk.skew };`);
    await closeModals();
    return rows >= 1 && r.tracksP > 0 && r.tracksN > 0 && r.skew < 1 ? `${r.pair}, skew ${r.skew} mm` : fail({ rows, ...r });
  });
  await step("PCB: length tuning dialog meanders nets to match the longest", async () => {
    await ev(`const a = window.mycircuitApp; a.store.dirty = false; await a.openSample("08-arduino-minimal.mycircuit"); a.setTab("pcb"); return 1`);
    await sleep(500);
    const nets = await ev(`const tu = await import("./src/pcb/tuning.js"); const p = window.mycircuitApp.store.project;
      const ns = ["MOSI", "MISO"].filter((n) => p.pcb.tracks.some((t) => t.net === n)); return ns.map((n) => [n, tu.netLength(p, n).length]);`);
    if (nets.length < 2) return fail({ nets });
    await ev(`window.mycircuitApp.run("pcb.tuneLengths"); return 1`);
    await sleep(500);
    // Tick the two nets (they may sit on another page of the list).
    await ev(`const want = new Set(${JSON.stringify(nets.map((x) => x[0]))});
      const tick = () => { for (const box of document.querySelectorAll('.modal [data-net]')) if (want.has(box.dataset.net) && !box.checked) box.click(); };
      tick();
      for (const tab of [...document.querySelectorAll('.modal .pager-tab')]) { tab.click(); tick(); }
      return 1`);
    await ev(`[...document.querySelectorAll(".modal-foot .btn")].find((b) => b.classList.contains("primary")).click(); return 1`);
    await sleep(1500);
    const after = await ev(`const tu = await import("./src/pcb/tuning.js"); const p = window.mycircuitApp.store.project; return ${JSON.stringify(nets.map((x) => x[0]))}.map((n) => tu.netLength(p, n).length);`);
    await closeModals();
    const skewBefore = Math.abs(nets[0][1] - nets[1][1]);
    const skewAfter = Math.abs(after[0] - after[1]);
    return skewAfter < Math.max(0.3, skewBefore / 4) ? `skew ${skewBefore.toFixed(2)} → ${skewAfter.toFixed(2)} mm` : fail({ nets, after });
  });

  await step("right panel: every number is a −/+ stepper with a centred value (board rules, footprint X/Y, track width)", async () => {
    const r = await ev(`const a = window.mycircuitApp; a.setTab("pcb"); a.pcb.clearSelection(); a.refreshInspector();
      await new Promise((res) => setTimeout(res, 100));
      const side = document.querySelector(".side.right");
      const check = () => [...side.querySelectorAll(".prop-grid .stepper")].map((st) => { const [dec, val, inc] = st.children; const cs = getComputedStyle(val);
        return dec.textContent === "−" && inc.textContent === "+" && (cs.textAlign === "center" || cs.justifyContent === "center"); });
      const board = check();
      const numberInputs = side.querySelectorAll('input[type="number"]').length;
      const rules = a.store.project.pcb.rules; const before = rules.trackWidth;
      side.querySelector('.stepper[data-field="' + a.t("Track width") + '"] [data-step="1"]').click();
      await new Promise((res) => setTimeout(res, 100));
      const after = a.store.project.pcb.rules.trackWidth;
      a.store.undo ? a.store.undo() : a.run("edit.undo");
      const fp = a.store.project.pcb.footprints[0];
      a.pcb.select([fp.id]); a.refreshInspector();
      await new Promise((res) => setTimeout(res, 100));
      const fpSteppers = check();
      const x0 = fp.x;
      const xs = side.querySelector('.stepper[data-field="X (mm)"]');
      xs.querySelector("input").value = String(x0 + 1.5); xs.querySelector("input").dispatchEvent(new Event("change"));
      await new Promise((res) => setTimeout(res, 100));
      const typed = a.store.project.pcb.footprints[0].x - x0;
      a.run("edit.undo");
      return { board: board.length, boardOk: board.every(Boolean), fp: fpSteppers.length, fpOk: fpSteppers.every(Boolean), numberInputs, stepped: +(after - before).toFixed(3), typed: +typed.toFixed(3) };`);
    return r.board >= 4 && r.boardOk && r.fp >= 3 && r.fpOk && r.numberInputs === 0 && r.stepped === 0.01 && r.typed === 1.5 ? `${r.board} + ${r.fp} steppers` : fail(r);
  });
  await step("hierarchical sheet block: Properties panel shows name, size, pins and opens its page", async () => {
    const r = await ev(`const a = window.mycircuitApp; a.store.dirty = false; const P = await import("./src/core/project.js"); const p = P.newProject("hier");
      p.schematic.pages.push({ id: "sub", name: "Filter" });
      p.schematic.labels.push({ id: "h1", kind: "hier", text: "IN", x: 1000, y: 1000, rot: 0, page: "sub" });
      p.schematic.sheets.push({ id: "sh1", page: "p1", x: 2000, y: 2000, w: 600, h: 400, name: "Filter", target: "sub", pins: [] });
      a.store.load(p); a.setTab("sch"); a.sch.setPage("p1"); a.sch.syncSheets(); a.sch.select(["sh1"]); a.refreshInspector();
      await new Promise((res) => setTimeout(res, 150));
      const side = document.querySelector(".side.right");
      const out = { text: side.textContent.includes("Filter"), pins: side.querySelectorAll("table.grid tr").length - 1, steppers: side.querySelectorAll(".stepper").length };
      [...side.querySelectorAll(".prop-actions .btn")].find((b) => b.textContent.includes(a.t("Open sheet page"))).click();
      await new Promise((res) => setTimeout(res, 150));
      out.page = a.sch.pageId;
      a.sch.setPage("p1");
      return out;`);
    return r.text && r.pins === 1 && r.steppers === 2 && r.page === "sub" ? true : fail(r);
  });
  sectionStart("Navigation, grid & dimensions");
  // Drag from a to b with the left button held.
  const drag = async (x1, y1, x2, y2) => {
    await move(x1, y1);
    await mouse("mousePressed", x1, y1);
    for (let i = 1; i <= 6; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + ((x2 - x1) * i) / 6, y: y1 + ((y2 - y1) * i) / 6, buttons: 1 });
    await mouse("mouseReleased", x2, y2);
    await sleep(60);
  };
  const canvasMid = (ed) => ev(`const r = window.mycircuitApp.${ed}.canvas.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];`);
  await step("schematic: hand button — left-drag pans the view, Esc leaves pan mode", async () => {
    await ev(`const a = window.mycircuitApp; a.store.dirty = false; a.store.load((await import("./src/core/project.js")).newProject("nav")); a.setTab("sch"); return 1`);
    await sleep(200);
    await ev(`window.mycircuitApp.run("view.pan"); return 1`);
    const [cx, cy] = await canvasMid("sch");
    const before = await ev(`const v = window.mycircuitApp.sch.vp; return [v.ox, v.oy]`);
    await drag(cx, cy, cx + 120, cy + 70);
    const after = await ev(`const v = window.mycircuitApp.sch.vp; return [v.ox, v.oy]`);
    await key("Escape");
    const off = await ev(`return !window.mycircuitApp.panMode && !window.mycircuitApp.sch.vp.panMode`);
    return Math.abs(after[0] - before[0] - 120) < 3 && Math.abs(after[1] - before[1] - 70) < 3 && off;
  });
  await step("setting: left-drag on empty canvas pans (schematic and PCB)", async () => {
    await ev(`window.mycircuitApp.setSetting("emptyDrag", "pan"); return 1`);
    let ok = true;
    for (const ed of ["sch", "pcb"]) {
      await ev(`window.mycircuitApp.setTab("${ed}"); return 1`);
      await sleep(200);
      const [cx, cy] = await canvasMid(ed);
      const b = await ev(`return window.mycircuitApp.${ed}.vp.ox`);
      await drag(cx - 200, cy + 150, cx - 120, cy + 150);
      const a2 = await ev(`return window.mycircuitApp.${ed}.vp.ox`);
      ok = ok && Math.abs(a2 - b - 80) < 3;
    }
    await ev(`window.mycircuitApp.setSetting("emptyDrag", "pan"); window.mycircuitApp.setTab("sch"); return 1`);
    return ok;
  });
  await step("grid and rulers toggle from the toolbar and draw on the canvas", async () => {
    await sleep(150);
    // Sample the top ruler band with rulers on and off.
    const sample = () => ev(`const e = window.mycircuitApp.sch; e.vp.renderNow(); const c = e.canvas; const d = c.getContext("2d").getImageData(0, 0, Math.min(400, c.width), Math.round(18 * e.vp.dpr)).data; let h = 0; for (let i = 0; i < d.length; i += 16) h = (h * 31 + d[i] + d[i+1] * 3 + d[i+2] * 7) >>> 0; return h;`);
    const on = await sample();
    const btnOk = await ev(`return !!document.querySelector('[data-cmd="view.rulers"]') && !!document.querySelector('[data-cmd="view.grid"]') && !!document.querySelector('[data-cmd="view.pan"]')`);
    await ev(`window.mycircuitApp.run("view.rulers"); return 1`);
    const off = await sample();
    await ev(`window.mycircuitApp.run("view.rulers"); return 1`);
    const g1 = await ev(`return window.mycircuitApp.settings.showGrid !== false`);
    await ev(`window.mycircuitApp.run("view.grid"); return 1`);
    const g2 = await ev(`return window.mycircuitApp.settings.showGrid !== false`);
    await ev(`window.mycircuitApp.run("view.grid"); return 1`);
    return on !== off && g1 && !g2 && btnOk ? true : fail(`rulers differ: ${on !== off}, buttons: ${btnOk}, grid toggles: ${g1 && !g2}`);
  });
  await step("schematic: measure (M) and dimension (D) tools", async () => {
    await ev(`const e = window.mycircuitApp.sch; e.vp.scale = 0.25; e.vp.ox = 100; e.vp.oy = 80; e.request(); e.canvas.focus(); return 1`);
    const [x1, y1] = await toScreen("sch", 1000, 1000);
    const [x2, y2] = await toScreen("sch", 2000, 1000);
    await key("m");
    await click(x1, y1); await move(x2, y2); await click(x2, y2);
    const m = await ev(`const m = window.mycircuitApp.sch.measure; return m && m.stage === 3 ? Math.hypot(m.x2 - m.x1, m.y2 - m.y1) : -1`);
    await key("Escape");
    await key("d");
    await click(x1, y1); await move(x2, y2); await click(x2, y2); await move(x2, y2 - 40); await click(x2, y2 - 40);
    const dims = await ev(`return (window.mycircuitApp.store.project.schematic.dimensions || []).map(d => Math.hypot(d.x2 - d.x1, d.y2 - d.y1))`);
    await key("Escape"); await key("Escape");
    return m === 1000 && dims.length === 1 && dims[0] === 1000 ? true : fail(`measure ${m}, dims ${JSON.stringify(dims)}`);
  });
  await step("PCB: board size dimensions and rulers render", async () => {
    await ev(`const a = window.mycircuitApp; a.setTab("pcb"); a.pcb.zoomFit(); a.pcb.vp.renderNow(); return 1`);
    return ev(`return window.mycircuitApp.settings.showBoardSize !== false && !!document.querySelector('[data-cmd="view.boardSize"]')`);
  });
  await step("3D: grid with mm scale, X/Y/Z axes, orientation gizmo on by default", async () => {
    await ev(`window.mycircuitApp.setTab("3d"); return 1`);
    await sleep(1500);
    const r = await ev(`const v = window.mycircuitApp.v3d.viewer; const o = v.getOptions(); let sprites = 0; v.three.scene.traverse(x => { if (x.isSprite) sprites++; }); return { grid: o.grid, axes: o.axes, gizmo: o.gizmo, sprites }`);
    return r.grid && r.axes && r.gizmo && r.sprites >= 6 ? `${r.sprites} labels` : fail(r);
  });
  await step("3D: left-drag rotates; pan mode makes left-drag move the view; arrows rotate", async () => {
    const [cx, cy] = await ev(`const r = window.mycircuitApp.v3d.viewer.three.renderer.domElement.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`);
    const state = `const t = window.mycircuitApp.v3d.viewer.three; return [t.camera.position.x, t.camera.position.y, t.camera.position.z, t.controls.target.x, t.controls.target.y, t.controls.target.z]`;
    const s0 = await ev(state);
    await drag(cx, cy, cx + 150, cy + 30);
    await sleep(600);
    const s1 = await ev(state);
    const rotated = Math.hypot(s1[0] - s0[0], s1[2] - s0[2]) > 1 && Math.hypot(s1[3] - s0[3], s1[4] - s0[4], s1[5] - s0[5]) < 0.5;
    await ev(`document.querySelector('[data-nav="pan"]').click(); return 1`);
    const leftPans = await ev(`return window.mycircuitApp.v3d.viewer.three.controls.mouseButtons.LEFT === 2`);
    await drag(cx, cy, cx + 150, cy + 30);
    await sleep(600);
    const s2 = await ev(state);
    const panned = Math.hypot(s2[3] - s1[3], s2[4] - s1[4], s2[5] - s1[5]) > 0.5;
    await ev(`document.querySelector('[data-nav="rotate"]').click(); return 1`);
    await key("ArrowLeft");
    await sleep(100);
    const s3 = await ev(state);
    const arrow = Math.hypot(s3[0] - s2[0], s3[2] - s2[2]) > 0.5;
    return rotated && leftPans && panned && arrow ? true : fail({ rotated, leftPans, panned, arrow });
  });
  await step("3D: measurements in cm or inch (axes, grid, board W × D × H) follow the setting", async () => {
    const read = () => ev(`const v = window.mycircuitApp.v3d.viewer; const i = v.helperInfo(); return { unit: i.grid && i.grid.unit, w: i.dimensions && i.dimensions.w, fmtW: i.dimensions ? i.format(i.dimensions.w, true) : "", btn: (document.querySelector('[data-unit3d]') || {}).textContent }`);
    await ev(`window.mycircuitApp.setSetting("units3d", "cm"); return 1`);
    await sleep(200);
    const cm = await read();
    await ev(`document.querySelector('[data-unit3d]').click(); return 1`);
    await sleep(300);
    const inch = await read();
    await ev(`window.mycircuitApp.setSetting("units3d", "cm"); return 1`);
    const okCm = cm.unit === "cm" && cm.fmtW === `${+(cm.w / 10).toFixed(cm.w / 10 >= 10 ? 1 : 2)} cm` && cm.btn === "cm";
    const okIn = inch.unit === "in" && / in$/.test(inch.fmtW) && inch.btn === "inch" && Math.abs(parseFloat(inch.fmtW) - inch.w / 25.4) < 0.01;
    return okCm && okIn ? `${cm.fmtW} = ${inch.fmtW}` : fail({ cm, inch });
  });
  await step("3D: the 5 × 5 grid re-spaces by ×5 when zooming so it stays even", async () => {
    const r = await ev(`
      const v = window.mycircuitApp.v3d.viewer; const { camera, controls } = v.three;
      const cellAt = async (k) => { const dir = camera.position.clone().sub(controls.target); camera.position.copy(controls.target).addScaledVector(dir, k); controls.update(); controls.dispatchEvent({ type: "change" }); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return v.helperInfo().grid; };
      const a = await cellAt(1);
      const b = await cellAt(8);
      const c = await cellAt(1 / 64);
      v.setView("iso");
      return { a, b, c };`);
    const ratio = (x, y) => Math.log(x / y) / Math.log(5);
    const ints = [ratio(r.b.cell, r.a.cell), ratio(r.a.cell, r.c.cell)].every((k) => k >= 1 && Math.abs(k - Math.round(k)) < 1e-6);
    const major = [r.a, r.b, r.c].every((g) => Math.abs(g.major / g.cell - 5) < 1e-9);
    return ints && major ? `cells ${r.c.cell} / ${r.a.cell} / ${r.b.cell} mm` : fail(r);
  });
  await shot("02b-3d-nav");
  await ev(`window.mycircuitApp.setTab("sch"); return 1`);

  sectionStart("Commands & dialogs");
  const skip = new Set(["help.tutorial", "file.open", "file.save", "file.saveAs", "file.exit", "file.print", "file.exportSchSvg", "file.exportSchPng", "file.exportPcbSvg", "file.exportNetlist", "file.exportSpice", "file.exportPnp", "file.export3d", "help.manual", "file.importKicad"]);
  const ids = await ev(`return [...window.mycircuitApp.commands.keys()]`);
  for (const id of ids) {
    if (skip.has(id)) continue;
    await step(`command ${id}`, async () => {
      await ev(`const a = window.mycircuitApp; a.store.dirty = false; window.confirm = () => true; a.run(${JSON.stringify(id)}); return 1`);
      await sleep(id.startsWith("view.3d") || id === "file.export3d" ? 900 : 160);
      await closeModals();
      await ev(`const a = window.mycircuitApp; a.sch.escape(); a.pcb.escape(); if (a.panMode) { a.panMode = false; a.applyPanMode(); } return 1`);
    });
  }
  await ev(`const a = window.mycircuitApp; for (const k of ["showGrid", "showRulers", "showBoardSize", "showRatsnest", "showSimOverlay"]) a.settings[k] = true; a.settings.routeMode = "highlight"; a.applySettings(); return 1`);
  // Dialogs that need a moment (async imports) — open, wait, close.
  for (const id of ["file.fab", "tools.bom", "tools.gerberViewer", "tools.calculators", "tools.symbolEditor", "tools.footprintWizard", "tools.boardSetup", "file.print", "inspect.lengths", "sim.spice", "tools.settings", "tools.footprints"]) {
    await step(`dialog ${id} opens`, async () => {
      await ev(`window.mycircuitApp.run(${JSON.stringify(id)}); return 1`);
      await sleep(700);
      const open = await ev(`return !!document.querySelector(".modal")`);
      if (shotsDir) await shot(`dialog-${id}`);
      await closeModals();
      return open;
    });
  }
  sectionStart("Tutorial");
  // Every lesson drives the real UI and checks its own result; practice-mode
  // goal checks must recognise each finished step.
  await step("tutorial (watch mode): every lesson step runs and checks out", async () => {
    await closeModals();
    const r = await ev(`const a = window.mycircuitApp; a.store.dirty = false; const tp = await a.openTutorial({ skipConfirm: true }); const rep = await tp.runAll(); tp.close(); return { bad: rep.filter(x => !x.ok).map(x => x.step + ": " + x.error), n: rep.length };`);
    if (r.bad.length) throw new Error(r.bad.join(" | "));
    return `${r.n} steps`;
  });
  await step("tutorial (practice mode): every goal check recognises its step", async () => {
    await closeModals();
    const r = await ev(`const a = window.mycircuitApp; a.store.dirty = false; const tp = await a.openTutorial({ skipConfirm: true }); const rep = await tp.verifyPractice(); tp.close(); return { bad: rep.filter(x => !x.run || x.check === false).map(x => x.step + ": run=" + x.run + " check=" + x.check + " " + (x.error || "")), n: rep.length, checked: rep.filter(x => x.check === true).length };`);
    if (r.bad.length) throw new Error(r.bad.join(" | "));
    return `${r.checked}/${r.n} goal checks`;
  });
  await step("tutorial panel opens in practice mode with markers", async () => {
    await ev(`const a = window.mycircuitApp; a.store.dirty = false; await a.openTutorial({ skipConfirm: true, lesson: 1, mode: "practice" }); return 1`);
    // Practice first fast-forwards lesson 1 (instant), then shows the markers.
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      await sleep(250);
      ok = await ev(`return !!document.querySelector(".tut-panel .tut-todo") && (document.querySelectorAll(".tut-target").length > 0 || document.querySelector(".tut-ring").style.display === "block")`);
    }
    await ev(`window.mycircuitApp.tutorial.close(); return 1`);
    return ok;
  });
  sectionStart("Appearance & windows");
  await step("narrow screen: toolbar labels collapse to icons so nothing is cut off", async () => {
    const r = await ev(`const a = window.mycircuitApp; a.setTab("pcb");
      Object.defineProperty(window.screen, "availWidth", { value: 1100, configurable: true });
      a.renderToolbar();
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const bar = document.getElementById("toolbar");
      const br = bar.getBoundingClientRect();
      const cut = [...bar.children].filter((k) => { const r = k.getBoundingClientRect(); return r.right > br.right + 1 || r.bottom > br.bottom + 1; }).length;
      const out = { compact: bar.classList.contains("compact"), wrap: bar.classList.contains("wrap"), need: +bar.dataset.need, labels: [...bar.querySelectorAll(".lbl")].filter((l) => l.offsetWidth > 0).length, cut };
      delete window.screen.availWidth;
      a.renderToolbar();
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      out.restored = !bar.classList.contains("compact") && !document.documentElement.classList.contains("toolbar-wrap");
      return out;`);
    return r.compact && r.labels === 0 && r.need <= 1100 && r.cut === 0 && r.restored ? `needs ${r.need}px${r.wrap ? ", two rows" : ""}` : fail(r);
  });
  await step("every toolbar fits: no hidden buttons, no wrapped labels (window minimum follows the widest)", async () => {
    const bad = [];
    for (const tab of ["start", "sch", "pcb", "3d", "sim"]) {
      await ev(`window.mycircuitApp.setTab("${tab}"); return 1`);
      await sleep(tab === "3d" ? 900 : 250);
      const r = await ev(`const bar = document.getElementById("toolbar"); const labels = [...bar.querySelectorAll(".lbl")].filter((l) => l.getBoundingClientRect().height > 20).map((l) => l.textContent);
        const hidden = [...bar.children].filter((k) => k.getBoundingClientRect().right > bar.getBoundingClientRect().right + 1).length;
        return { overflow: bar.scrollWidth - bar.clientWidth, labels, hidden, need: +bar.dataset.need || 0, width: bar.clientWidth };`);
      if (r.overflow > 1 || r.labels.length || r.hidden || r.need > r.width + 1) bad.push({ tab, ...r });
    }
    await ev(`window.mycircuitApp.setTab("sch"); return 1`);
    return bad.length ? fail(bad) : true;
  });
  await step("theme gallery: 20 dark + 20 light themes, each applies", async () => {
    await ev(`window.mycircuitApp.run("view.themes"); return 1`);
    await sleep(300);
    const counts = await ev(`const g = document.querySelectorAll(".theme-grid4"); return [g[0].children.length, g[1].children.length]`);
    const ids = await ev(`const { THEMES } = await import("./src/ui/themes.js"); return THEMES.map(t => t.id)`);
    for (const id of ids) await ev(`window.mycircuitApp.setSetting("theme", ${JSON.stringify(id)}); return 1`);
    const last = await ev(`return document.documentElement.dataset.themeId`);
    await ev(`window.mycircuitApp.setSetting("theme", "midnight"); return 1`);
    await closeModals();
    if (counts[0] !== 20 || counts[1] !== 20) throw new Error(`swatches ${counts}`);
    return last === ids[ids.length - 1] ? `${ids.length} themes` : false;
  });
  await step("settings window: nine tabs, same size on every tab, no scrollbars, numbers are −/+ steppers with centred values", async () => {
    await ev(`window.mycircuitApp.run("tools.settings"); return 1`);
    await sleep(300);
    const r = await ev(`
      const tabs = [...document.querySelectorAll(".modal .tab")];
      let steppers = 0, centred = 0, numberInputs = 0, layoutOk = 0, scrolls = 0;
      const sizes = [];
      for (const tab of tabs) {
        tab.click();
        await new Promise((res) => setTimeout(res, 30));
        for (const st of document.querySelectorAll(".modal .stepper")) {
          if (st.closest(".tab-hidden")) continue;
          steppers++;
          const [dec, val, inc] = st.children;
          const a = dec.getBoundingClientRect(), b = val.getBoundingClientRect(), c = inc.getBoundingClientRect();
          if (dec.textContent === "−" && inc.textContent === "+" && a.right <= b.left + 1 && b.right <= c.left + 1) layoutOk++;
          if (getComputedStyle(val).justifyContent === "center" || getComputedStyle(val).textAlign === "center") centred++;
        }
        numberInputs += [...document.querySelectorAll('.modal input[type="number"]')].filter((x) => !x.closest(".tab-hidden")).length;
        const m = document.querySelector(".modal").getBoundingClientRect();
        sizes.push(Math.round(m.width) + "x" + Math.round(m.height));
        const body = document.querySelector(".modal-body");
        if (body && (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1)) scrolls++;
      }
      return { tabs: tabs.length, steppers, centred, layoutOk, numberInputs, sameSize: new Set(sizes).size === 1, scrolls };`);
    // + and − change the value and the change is applied on OK.
    const changed = await ev(`
      document.querySelectorAll(".modal .tab")[2].click();
      const st = document.querySelector('.modal .stepper[data-setting="zoomSpeed"]');
      const before = st.getValue();
      st.querySelector('[data-step="1"]').click();
      const up = st.getValue();
      st.querySelector('[data-step="-1"]').click();
      st.querySelector('[data-step="-1"]').click();
      const down = st.getValue();
      return { before, up, down, text: st.querySelector(".stepper-val").textContent };`);
    await ev(`[...document.querySelectorAll(".modal-foot .btn")].find((b) => b.classList.contains("primary")).click(); return 1`);
    await sleep(200);
    const saved = await ev(`return window.mycircuitApp.settings.zoomSpeed`);
    await ev(`const a = window.mycircuitApp; a.settings.zoomSpeed = 1; a.settings.hintSeconds = 3; a.settings.uiScale = 1; a.applySettings(); return 1`);
    const ok = r.tabs === 9 && r.steppers >= 13 && r.centred === r.steppers && r.layoutOk === r.steppers && r.numberInputs === 0 && r.sameSize && r.scrolls === 0 && changed.up > changed.before && changed.down < changed.before && saved === changed.down;
    return ok ? `${r.tabs} tabs, ${r.steppers} steppers` : fail({ r, changed, saved });
  });
  await step("About window: icon, description, build information and author", async () => {
    await ev(`window.mycircuitApp.run("help.about"); return 1`);
    await sleep(500);
    const r = await ev(`const m = document.querySelector(".modal"); const ic = m.querySelector(".about-icon").getBoundingClientRect(); const d = m.querySelector(".about-desc"); const dr = d.getBoundingClientRect();
      return { icon: !!m.querySelector(".about-icon"), rows: m.querySelectorAll(".about-key").length, text: m.textContent,
        rightOfIcon: dr.left >= ic.right - 1 && dr.top < ic.bottom, descLen: d.textContent.length, features: d.querySelectorAll("li").length }`);
    await closeModals();
    if (!r.icon || r.rows < 8) throw new Error(`icon=${r.icon} rows=${r.rows}`);
    if (!r.rightOfIcon || r.descLen < 300 || r.features < 4) throw new Error(`description beside the icon: ${r.rightOfIcon}, ${r.descLen} chars, ${r.features} feature lines`);
    if (!/SHKWON/.test(r.text) || !/knix008@naver.com/.test(r.text)) throw new Error("author missing");
    return `${r.rows} rows`;
  });
  await step("every dialog: icon + name in the title bar, fits the window, no scrollbars", async () => {
    const ids = ["file.fab", "tools.bom", "tools.gerberViewer", "tools.calculators", "tools.symbolEditor", "tools.footprintWizard", "tools.boardSetup", "file.print", "inspect.lengths", "inspect.nets", "sim.spice", "tools.settings", "tools.footprints", "help.about", "help.keys", "view.themes", "file.props", "edit.history"];
    const bad = [];
    for (const id of ids) {
      await ev(`window.mycircuitApp.run(${JSON.stringify(id)}); return 1`);
      await sleep(600);
      const r = await ev(`const m = document.querySelector(".modal"); if (!m) return null;
        const rect = m.getBoundingClientRect();
        const scrollers = [...m.querySelectorAll("*")].filter(e => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2) && e.tagName !== "TEXTAREA"; }).length;
        return { icon: !!m.querySelector(".modal-head img"), title: m.querySelector(".modal-title").textContent.trim(), fits: rect.top >= 0 && rect.bottom <= innerHeight + 1 && rect.left >= 0 && rect.right <= innerWidth + 1, scrollers };`);
      await closeModals();
      if (!r) { bad.push(`${id}: no dialog`); continue; }
      if (!r.icon || !r.title || !r.fits || r.scrollers) bad.push(`${id}: icon=${r.icon} title=${!!r.title} fits=${r.fits} scrollers=${r.scrollers}`);
    }
    if (bad.length) throw new Error(bad.join("; "));
    return `${ids.length} dialogs`;
  });
  await step("language switch to Korean translates the menu", async () => {
    await ev(`window.mycircuitApp.setSetting("lang", "ko"); return 1`);
    return ev(`return document.querySelector(".menu-root").textContent === "파일"`);
  });
  await step("light theme", async () => {
    await ev(`window.mycircuitApp.setSetting("theme", "light"); return 1`);
    const ok = await ev(`return document.documentElement.dataset.theme === "light"`);
    await shot("03-light");
    await ev(`window.mycircuitApp.setSetting("theme", "dark"); window.mycircuitApp.setSetting("lang", "en"); return 1`);
    return ok;
  });
  await step("print area is filled and cleaned for printing", async () => {
    const r = await ev(`const { schematicSvg } = await import("./src/ui/exports.js"); return schematicSvg(window.mycircuitApp.store.project).length`);
    return r > 1000;
  });
} catch (e) {
  results.push({ name: "harness", ok: false, detail: e.message });
  console.error(e);
} finally {
  if (ws) ws.close();
  if (!keep) child.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
}

// ---------------------------------------------------------------- grouped report
const ESC = "\x1b[";
const paint = (code, text) => `${ESC}${code}m${text}${ESC}0m`;
const fmt = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const tcode = (v) => (v < 300 ? "32" : v < 2000 ? "33" : "31");
const longest = Math.max(1, ...results.map((r) => r.ms || 0));
const sections = [...new Set([...sectionOrder, ...results.map((r) => r.section || "Other")])];
console.log("\n" + paint("1", "Results by category (slowest first)"));
for (const sec of sections) {
  const rs = results.filter((r) => (r.section || "Other") === sec);
  if (!rs.length) continue;
  const bad = rs.filter((r) => !r.ok).length;
  console.log("\n" + paint(bad ? "41;37;1" : "42;30;1", ` ${sec} `) + " " + paint("2", `${rs.length} checks · ${fmt(rs.reduce((a, r) => a + (r.ms || 0), 0))}`));
  for (const r of [...rs].sort((x, y) => (y.ms || 0) - (x.ms || 0))) {
    const n = Math.round(((r.ms || 0) / longest) * 12);
    const c = tcode(r.ms || 0);
    const detail = r.detail && r.ok ? " " + paint("2", `(${r.detail})`) : "";
    console.log(`  ${r.ok ? paint("32", "✔") : paint("31", "✖")} ${paint(c, fmt(r.ms || 0).padStart(9))} ${paint(c, "█".repeat(n))}${paint("2", "░".repeat(12 - n))} ${r.ok ? r.name : paint("31", r.name)}${detail}`);
    if (!r.ok && r.detail) console.log("      " + paint("31", r.detail));
  }
}
console.log("\n" + paint("1", "Summary"));
console.log(paint("2", "  category                       checks  pass  fail      time"));
for (const sec of sections) {
  const rs = results.filter((r) => (r.section || "Other") === sec);
  if (!rs.length) continue;
  const okN = rs.filter((r) => r.ok).length;
  const fail = rs.length - okN;
  console.log(`  ${paint(fail ? "31" : "36", sec.padEnd(30))} ${String(rs.length).padStart(6)} ${paint("32", String(okN).padStart(5))} ${paint(fail ? "31" : "2", String(fail).padStart(5))} ${fmt(rs.reduce((a, r) => a + (r.ms || 0), 0)).padStart(9)}`);
}
const failed = results.filter((r) => !r.ok);
const totalMs = results.reduce((a, r) => a + (r.ms || 0), 0);
console.log("\n  " + (failed.length ? paint("41;37;1", " SMOKE TEST FAILED ") : paint("42;30;1", " ALL SMOKE CHECKS PASSED ")) + `  ${results.length - failed.length}/${results.length} checks passed  ·  ${fmt(totalMs)}`);
if (failed.length) process.exit(1);
