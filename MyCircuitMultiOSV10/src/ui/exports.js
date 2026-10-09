// Printing, file exports, BOM, fabrication outputs and the Gerber viewer.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, toast, field, input, select, checkbox, pager, tabs } from "./widgets.js";
import * as platform from "./platform.js";
import { SvgContext } from "./svgctx.js";
import { SCH_THEMES, SHEETS, drawSchematic } from "../sch/render.js";
import { copperLayers } from "../core/project.js";
import { Viewport } from "./viewport.js";

const baseName = (app) => (app.store.project.meta.title || "untitled").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");

// ---------------------------------------------------------------- schematic SVG / PNG
export function schematicSvg(project, themeName = "print", page = null) {
  const sheet = SHEETS[project.schematic.sheet] || SHEETS.A4;
  const ctx = new SvgContext(sheet.w, sheet.h);
  drawSchematic(ctx, project, SCH_THEMES[themeName] || SCH_THEMES.print, 1, { page });
  return ctx.toString(SCH_THEMES[themeName].bg);
}

export async function exportSchematicSvg(app) {
  const svg = schematicSvg(app.store.project, "print", app.sch.pageId);
  const r = await platform.saveTextFile({ name: `${baseName(app)}-schematic.svg`, text: svg, title: t("Export schematic as SVG"), filters: [{ name: "SVG", extensions: ["svg"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

export async function exportSchematicPng(app) {
  const project = app.store.project;
  const sheet = SHEETS[project.schematic.sheet] || SHEETS.A4;
  const scale = 0.3; // 300 dpi: 1000 mil = 300 px
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sheet.w * scale);
  canvas.height = Math.round(sheet.h * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawSchematic(ctx, project, SCH_THEMES.print, scale, { page: app.sch.pageId });
  const r = await platform.saveDataUrl({ name: `${baseName(app)}-schematic.png`, dataUrl: canvas.toDataURL("image/png"), filters: [{ name: "PNG", extensions: ["png"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

export async function exportPcbSvg(app) {
  const { pcbLayerSvg } = await import("../fab/svgExport.js");
  const pcb = app.store.project.pcb;
  const all = [...copperLayers(pcb).slice().reverse(), "B.SilkS", "F.Mask", "F.SilkS", "Edge.Cuts"];
  const chosen = new Set(["B.Cu", "F.Cu", "F.SilkS", "Edge.Cuts"]);
  let bg = "#ffffff";
  let mirror = false;
  const boxes = h("div", { style: { display: "flex", flexWrap: "wrap", gap: "10px 16px" } }, ...all.map((l) => checkbox(chosen.has(l), l, { onChange: (v) => (v ? chosen.add(l) : chosen.delete(l)) })));
  const body = h("div", {}, field(t("Layers"), boxes), h("div", { class: "form-grid", style: { marginTop: "12px" } },
    field(t("Background"), select(bg, [["#ffffff", t("White")], ["#001023", t("Dark")], ["", t("Transparent")]], { onChange: (v) => { bg = v; } })),
    field(t("View"), checkbox(false, t("Mirror (view from bottom)"), { onChange: (v) => { mirror = v; } }))));
  const ok = await modal({ title: t("Export PCB as SVG"), width: 520, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Export"), value: true, primary: true }] });
  if (!ok) return;
  const svg = pcbLayerSvg(app.store.project, all.filter((l) => chosen.has(l)), { background: bg || null, mirror, fit: false });
  const r = await platform.saveTextFile({ name: `${baseName(app)}-pcb.svg`, text: svg, filters: [{ name: "SVG", extensions: ["svg"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

export async function exportNetlist(app) {
  const { kicadNetlist } = await import("../fab/netlistExport.js");
  const r = await platform.saveTextFile({ name: `${baseName(app)}.net`, text: kicadNetlist(app.store.project), filters: [{ name: "KiCad netlist", extensions: ["net"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

export async function exportSpice(app) {
  const { toSpiceNetlist } = await import("../sim/engine.js");
  const r = await platform.saveTextFile({ name: `${baseName(app)}.cir`, text: toSpiceNetlist(app.store.project), filters: [{ name: "SPICE", extensions: ["cir", "sp"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

export async function exportPnp(app) {
  const { pickPlaceCsv } = await import("../fab/pnp.js");
  const r = await platform.saveTextFile({ name: `${baseName(app)}-pos.csv`, text: pickPlaceCsv(app.store.project, { side: "both" }), filters: [{ name: "CSV", extensions: ["csv"] }] });
  if (r) toast(t("Saved {name}", { name: r.name }), "ok");
}

// ---------------------------------------------------------------- BOM
export async function bomDialog(app) {
  const { bomRows, bomCsv } = await import("../fab/bom.js");
  let group = true;
  const host = h("div", {});
  const draw = () => {
    host.innerHTML = "";
    const rows = bomRows(app.store.project, { group });
    const total = rows.reduce((n, r) => n + r.qty, 0);
    const table = pager(rows, 12, (slice) => {
      const tbl = h("table", { class: "grid" }, h("tr", {}, ...["#", "Qty", "References", "Value", "Footprint", "Description"].map((x) => h("th", {}, t(x)))));
      for (const r of slice) {
        const tr = h("tr", { style: { cursor: "pointer", opacity: r.dnp ? 0.5 : 1 }, title: t("Click to select these parts") }, h("td", {}, r.item), h("td", { class: "num" }, r.qty), h("td", {}, r.references), h("td", {}, r.value), h("td", {}, r.footprint), h("td", {}, `${t(r.description || "")}${r.dnp ? " (DNP)" : ""}`));
        tr.addEventListener("click", () => { app.sch.selectRefs(r.refs); app.pcb.selectRefs(r.refs); app.v3d.highlight(r.refs); });
        tbl.append(tr);
      }
      return tbl;
    });
    host.append(h("div", { class: "summary-row" }, h("span", { class: "pill" }, t("{n} lines", { n: rows.length })), h("span", { class: "pill" }, t("{n} parts", { n: total })), checkbox(group, t("Group identical parts"), { onChange: (v) => { group = v; draw(); } })), table);
  };
  draw();
  const r = await modal({ title: t("Bill of materials"), width: 900, body: host, buttons: [{ label: t("Copy"), value: "copy", left: true }, { label: t("Close"), value: null }, { label: t("Export CSV…"), value: "csv", primary: true }] });
  const csv = bomCsv(app.store.project, { group });
  if (r === "copy") { await navigator.clipboard.writeText(csv).catch(() => {}); toast(t("Copied to clipboard"), "ok"); }
  if (r === "csv") {
    const s = await platform.saveTextFile({ name: `${baseName(app)}-BOM.csv`, text: "﻿" + csv, filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (s) toast(t("Saved {name}", { name: s.name }), "ok");
  }
}

// ---------------------------------------------------------------- fabrication
export async function fabricationDialog(app) {
  const fab = await import("../fab/package.js");
  const project = app.store.project;
  const opts = { maskExpansion: app.settings.maskExpansion ?? 0.05, tentVias: app.settings.tentVias !== false, bom: true, pnp: true, netlist: true };
  const issues = await app.runDrc(false);
  const errs = issues.filter((i) => i.severity === "error").length;
  const list = h("div", {});
  const drawList = () => {
    list.innerHTML = "";
    let files = [];
    try { files = fab.fabricationFiles(project, opts); } catch (e) { list.append(h("div", { class: "empty-note" }, e.message)); return; }
    list.append(pager(files, 9, (slice) => {
      const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, t("File")), h("th", {}, t("Kind")), h("th", {}, t("Size"))));
      for (const f of slice) tbl.append(h("tr", {}, h("td", {}, f.name), h("td", {}, f.layer || f.kind), h("td", { class: "num" }, `${(f.data.length / 1024).toFixed(1)} KB`)));
      return tbl;
    }));
    list.dataset.count = String(files.length);
  };
  drawList();
  const body = h("div", {},
    errs ? h("div", { class: "tip", style: { background: "color-mix(in srgb, var(--danger) 18%, transparent)", marginTop: 0, marginBottom: "12px" } }, t("DRC reports {n} errors. Fix them before ordering boards — open the PCB tab to see them.", { n: errs })) : h("div", { class: "tip", style: { marginTop: 0, marginBottom: "12px" } }, t("DRC passed. The package contains Gerber X2 for every layer, Excellon drill files, BOM, pick-and-place, IPC-356 netlist and a job file — what board houses ask for.")),
    h("div", { class: "form-grid" },
      field(t("Solder mask expansion (mm)"), input(opts.maskExpansion, { type: "number", step: "0.01", onChange: (v) => { opts.maskExpansion = parseFloat(v) || 0; drawList(); } })),
      field(t("Vias"), checkbox(opts.tentVias, t("Tent vias (cover with mask)"), { onChange: (v) => { opts.tentVias = v; drawList(); } })),
      field(t("Include"), h("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap" } },
        checkbox(true, "BOM", { onChange: (v) => { opts.bom = v; drawList(); } }), checkbox(true, t("Pick & place"), { onChange: (v) => { opts.pnp = v; drawList(); } }), checkbox(true, "IPC-356", { onChange: (v) => { opts.netlist = v; drawList(); } })))),
    h("div", { style: { height: "12px" } }), list);
  const r = await modal({ title: t("Fabrication outputs"), width: 720, body, buttons: [{ label: t("Preview in Gerber viewer"), value: "view", left: true }, { label: t("Cancel"), value: null }, { label: t("Save ZIP…"), value: "zip", primary: true }] });
  if (r === "view") { gerberViewer(app, fab.fabricationFiles(project, opts)); return; }
  if (r !== "zip") return;
  const bytes = fab.fabricationZip(project, opts);
  const s = await platform.saveBinaryFile({ name: `${baseName(app)}-fabrication.zip`, bytes, filters: [{ name: "ZIP", extensions: ["zip"] }] });
  if (s) toast(t("Saved {name} ({kb} KB)", { name: s.name, kb: (bytes.length / 1024).toFixed(0) }), "ok", 4000);
}

// ---------------------------------------------------------------- Gerber viewer
const VIEW_COLORS = {
  gtl: "#d0443e", gbl: "#3f7fd8", g2: "#d9b23a", g3: "#4fb35a", g4: "#b45cc0", g5: "#3fb8b8", gto: "#f0eaa0", gbo: "#d9a3c9", gts: "#a33d9c", gbs: "#1c9a9a",
  gtp: "#9a9a9a", gbp: "#707070", gm1: "#e6e23b", drl: "#ffffff",
};

export async function gerberViewer(app, preset) {
  const { parseGerber, renderGerberToCanvas, parseExcellon } = await import("../fab/gerberParse.js");
  const { readZip } = await import("../fab/zip.js");
  let layers = [];
  const addFile = (name, text) => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    try {
      if (ext === "drl" || ext === "xln" || /drill|\.txt$/i.test(name) && /M48/.test(text)) {
        const d = parseExcellon(text);
        layers.push({ name, kind: "drill", data: d, color: VIEW_COLORS.drl, on: true });
      } else if (/%FS|G04|%MO/.test(text)) {
        layers.push({ name, kind: "gerber", data: parseGerber(text), color: VIEW_COLORS[ext] || "#c0c0c0", on: true });
      }
    } catch (e) { toast(`${name}: ${e.message}`, "warn"); }
  };
  if (preset) for (const f of preset) if (f.kind === "gerber" || f.kind === "drill") addFile(f.name, typeof f.data === "string" ? f.data : new TextDecoder().decode(f.data));

  const canvasHost = h("div", { style: { position: "relative", height: "62vh", borderRadius: "8px", overflow: "hidden", background: "#0b0f14" } });
  const canvas = h("canvas", { class: "editor-canvas" });
  canvasHost.append(canvas);
  const side = h("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } });
  const fileInput = h("input", { type: "file", multiple: true, style: { display: "none" } });
  const offscreen = new Map();
  let vp = null;
  const render = (ctx, v) => {
    v.screenTransform(ctx);
    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(0, 0, v.width, v.height);
    for (const L of layers) {
      if (!L.on) continue;
      let oc = offscreen.get(L);
      if (!oc || oc.width !== canvas.width || oc.height !== canvas.height) { oc = document.createElement("canvas"); oc.width = canvas.width; oc.height = canvas.height; offscreen.set(L, oc); }
      const c = oc.getContext("2d");
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, oc.width, oc.height);
      c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      if (L.kind === "gerber") renderGerberToCanvas(c, L.data, { color: L.color, scale: v.scale, offsetX: v.ox, offsetY: v.oy });
      else {
        c.fillStyle = L.color;
        for (const hole of L.data.holes) { c.beginPath(); c.arc(hole.x * v.scale + v.ox, -hole.y * v.scale + v.oy, (hole.d / 2) * v.scale, 0, Math.PI * 2); c.fill(); }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.78;
      ctx.drawImage(oc, 0, 0);
      ctx.globalAlpha = 1;
    }
    v.screenTransform(ctx);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${layers.filter((l) => l.on).length}/${layers.length} ${t("layers")} · ${t("wheel to zoom, right-drag to pan")}`, 10, v.height - 10);
  };
  const fit = () => {
    let b = null;
    for (const L of layers) {
      const bb = L.kind === "gerber" ? L.data.bounds : null;
      if (!bb || !Number.isFinite(bb.x1)) continue;
      const r = { x1: bb.x1, y1: -bb.y2, x2: bb.x2, y2: -bb.y1 };
      b = b ? { x1: Math.min(b.x1, r.x1), y1: Math.min(b.y1, r.y1), x2: Math.max(b.x2, r.x2), y2: Math.max(b.y2, r.y2) } : r;
    }
    if (b && vp) vp.fit(b, 0.06);
  };
  const drawSide = () => {
    side.innerHTML = "";
    side.append(h("button", { class: "btn small", onclick: () => fileInput.click() }, h("span", { html: icon("open", 14) }), t("Open Gerber / drill / ZIP…")),
      h("button", { class: "btn small", onclick: async () => { const fab = await import("../fab/package.js"); layers = []; offscreen.clear(); for (const f of fab.fabricationFiles(app.store.project, {})) if (f.kind === "gerber" || f.kind === "drill") addFile(f.name, f.data); drawSide(); fit(); vp.request(); } }, h("span", { html: icon("chip", 14) }), t("Load current board")));
    if (layers.length) side.append(pager(layers, 12, (slice) => h("div", {}, ...slice.map((L) => {
      const sw = h("input", { type: "color", value: L.color, style: { width: "22px", height: "18px", border: 0, padding: 0, background: "none" } });
      sw.addEventListener("input", () => { L.color = sw.value; vp.request(); });
      const cb = h("input", { type: "checkbox" });
      cb.checked = L.on;
      cb.addEventListener("change", () => { L.on = cb.checked; vp.request(); });
      return h("label", { class: "layer-row", style: { gridTemplateColumns: "18px 26px 1fr" } }, cb, sw, h("span", { style: { fontSize: "11.5px", overflow: "hidden", textOverflow: "ellipsis" }, title: L.name }, L.name));
    }))));
    if (!layers.length) side.append(h("div", { class: "empty-note" }, t("Open Gerber files or a ZIP, or load the current board.")));
  };
  fileInput.addEventListener("change", async () => {
    for (const f of fileInput.files) {
      if (/\.zip$/i.test(f.name)) {
        try {
          const entries = await readZip(new Uint8Array(await f.arrayBuffer()));
          for (const e of entries) addFile(e.name, typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data));
        } catch (e) { toast(t("Only uncompressed (stored) ZIP files can be read: {m}", { m: e.message }), "warn", 5000); }
      } else addFile(f.name, await f.text());
    }
    drawSide();
    fit();
    vp.request();
  });
  modal({
    title: t("Gerber viewer"), width: "min(1200px, 95vw)",
    body: h("div", { style: { display: "grid", gridTemplateColumns: "250px 1fr", gap: "12px" } }, h("div", {}, side, fileInput), canvasHost),
    buttons: [{ label: t("Close"), value: null, primary: true }],
    onOpen: () => {
      vp = new Viewport(canvas, { minScale: 0.2, maxScale: 600, onRender: render, onPointer: () => {} });
      drawSide();
      setTimeout(() => { vp.resize(); fit(); }, 30);
    },
  }).then(() => vp && vp.dispose());
}

// ---------------------------------------------------------------- print
const PAPER = { A4: [297, 210], A3: [420, 297], A5: [210, 148], Letter: [279.4, 215.9], Legal: [355.6, 215.9], Tabloid: [431.8, 279.4] };

export async function printDialog(app) {
  const { pcbLayerSvg } = await import("../fab/svgExport.js");
  const project = app.store.project;
  const pcb = project.pcb;
  const cfg = {
    what: app.tab === "pcb" ? "pcb" : "sch", paper: project.schematic.sheet === "A3" ? "A3" : app.settings.defaultPaper || "A4", landscape: true, mono: false, frame: true,
    pcbSets: { top: true, bottom: true, assembly: false, inner: false }, scale: "fit", copies: 1, mirrorBottom: true,
  };
  const pages = () => {
    const out = [];
    if (cfg.what === "sch" || cfg.what === "both") {
      for (const pg of project.schematic.pages || [{ id: null, name: "" }]) {
        out.push({ title: `${t("Schematic")} — ${pg.name}`, svg: schematicSvg(project, cfg.mono ? "mono" : "print", pg.id) });
      }
    }
    if (cfg.what === "pcb" || cfg.what === "both") {
      const real = cfg.scale === "1:1";
      const colors = cfg.mono ? Object.fromEntries([...copperLayers(pcb), "F.SilkS", "B.SilkS", "Edge.Cuts", "F.Fab", "F.Mask", "B.Mask"].map((l) => [l, "#000"])) : undefined;
      const mk = (label, layers, mirror) => out.push({ title: label, svg: pcbLayerSvg(project, layers, { background: "#ffffff", fit: !real, mirror, colors, margin: 3 }), real });
      if (cfg.pcbSets.top) mk(t("Top layer (F.Cu + F.SilkS)"), ["F.Cu", "F.SilkS", "Edge.Cuts"], false);
      if (cfg.pcbSets.bottom) mk(t("Bottom layer (B.Cu + B.SilkS)"), ["B.Cu", "B.SilkS", "Edge.Cuts"], cfg.mirrorBottom);
      if (cfg.pcbSets.inner) for (const l of copperLayers(pcb).filter((x) => x.startsWith("In"))) mk(l, [l, "Edge.Cuts"], false);
      if (cfg.pcbSets.assembly) mk(t("Assembly drawing (top)"), ["F.SilkS", "F.Fab", "Edge.Cuts"], false);
    }
    return out;
  };
  const stage = h("div", { class: "print-stage" });
  const nav = h("div", { class: "summary-row", style: { justifyContent: "center" } });
  let index = 0;
  const draw = () => {
    const ps = pages();
    index = Math.min(index, Math.max(0, ps.length - 1));
    stage.innerHTML = "";
    const [pw, ph] = PAPER[cfg.paper];
    const w = cfg.landscape ? pw : ph;
    const hh = cfg.landscape ? ph : pw;
    const page = h("div", { class: "page", style: { aspectRatio: `${w} / ${hh}`, height: "100%", padding: "4%", boxSizing: "border-box" } });
    if (ps[index]) page.innerHTML = ps[index].svg.replace(/^<\?xml[^>]*>/, "").replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" height="100%"');
    stage.append(page);
    nav.innerHTML = "";
    nav.append(h("button", { class: "icon-btn", disabled: index === 0, html: icon("chevronRight", 16), style: { transform: "rotate(180deg)" }, onclick: () => { index--; draw(); } }),
      h("span", {}, ps.length ? `${index + 1} / ${ps.length} — ${ps[index].title}` : t("Nothing selected to print")),
      h("button", { class: "icon-btn", disabled: index >= ps.length - 1, html: icon("chevronRight", 16), onclick: () => { index++; draw(); } }));
  };
  // Two tabs keep the options column short enough to never need a scrollbar.
  const contentsTab = h("div", { class: "print-options" },
    field(t("Print"), select(cfg.what, [["sch", t("Schematic")], ["pcb", t("PCB layers")], ["both", t("Schematic and PCB")]], { onChange: (v) => { cfg.what = v; draw(); } })),
    field(t("PCB pages"), h("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
      checkbox(true, t("Top"), { onChange: (v) => { cfg.pcbSets.top = v; draw(); } }),
      checkbox(true, t("Bottom"), { onChange: (v) => { cfg.pcbSets.bottom = v; draw(); } }),
      checkbox(false, t("Inner layers"), { onChange: (v) => { cfg.pcbSets.inner = v; draw(); } }),
      checkbox(false, t("Assembly drawing"), { onChange: (v) => { cfg.pcbSets.assembly = v; draw(); } }),
      checkbox(true, t("Mirror bottom layer"), { onChange: (v) => { cfg.mirrorBottom = v; draw(); } }))),
    field(t("Colour"), checkbox(cfg.mono, t("Black and white"), { onChange: (v) => { cfg.mono = v; draw(); } })));
  const pageTab = h("div", { class: "print-options" },
    field(t("Paper"), select(cfg.paper, Object.keys(PAPER).map((p) => [p, p]), { onChange: (v) => { cfg.paper = v; draw(); } })),
    field(t("Orientation"), select(cfg.landscape ? "l" : "p", [["l", t("Landscape")], ["p", t("Portrait")]], { onChange: (v) => { cfg.landscape = v === "l"; draw(); } })),
    field(t("PCB scale"), select(cfg.scale, [["fit", t("Fit to page")], ["1:1", t("Actual size 1:1 (toner transfer)")]], { onChange: (v) => { cfg.scale = v; draw(); } })),
    field(t("Copies"), input(cfg.copies, { type: "number", min: 1, max: 99, onInput: (v) => { cfg.copies = Math.max(1, Math.min(99, parseInt(v, 10) || 1)); } })));
  const opts = tabs([{ id: "c", label: t("Contents"), body: contentsTab }, { id: "p", label: t("Page"), body: pageTab }]);
  const body = h("div", { class: "print-preview" }, opts, h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", minHeight: 0 } }, stage, nav));
  const r = await modal({
    title: t("Print"), width: "min(1100px, 95vw)", body,
    buttons: [...(window.mycircuit && window.mycircuit.printToPDF ? [{ label: t("Save as PDF…"), value: "pdf", left: true }] : []), { label: t("Cancel"), value: null }, { label: t("Print…"), value: "print", primary: true }],
    onOpen: () => setTimeout(draw, 10),
  });
  if (!r) return;
  // Lay the pages out in the hidden print area and hand over to the system dialog.
  const area = document.getElementById("print-area");
  const ps = pages();
  area.innerHTML = "";
  const [pw, ph] = PAPER[cfg.paper];
  let style = document.getElementById("print-page-style");
  if (!style) { style = document.createElement("style"); style.id = "print-page-style"; document.head.append(style); }
  style.textContent = `@page { size: ${cfg.landscape ? pw : ph}mm ${cfg.landscape ? ph : pw}mm; margin: 8mm; }`;
  for (let c = 0; c < cfg.copies; c++) {
    for (const p of ps) {
      const sheet = h("section", { class: "print-sheet" });
      sheet.innerHTML = p.real ? p.svg.replace(/^<\?xml[^>]*>/, "") : p.svg.replace(/^<\?xml[^>]*>/, "").replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" height="100%"');
      if (p.real) sheet.style.alignItems = "flex-start";
      area.append(sheet);
    }
  }
  await new Promise((res) => setTimeout(res, 60));
  try {
    if (r === "pdf") {
      const out = await window.mycircuit.printToPDF({ pageSize: cfg.paper, landscape: cfg.landscape, defaultPath: `${baseName(app)}.pdf` });
      if (out && !out.canceled) toast(t("Saved {name}", { name: out.filePath || "PDF" }), "ok");
    } else await platform.printPage();
  } finally {
    setTimeout(() => { area.innerHTML = ""; }, 1000);
  }
}
