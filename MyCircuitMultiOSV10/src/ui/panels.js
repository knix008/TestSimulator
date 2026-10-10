// Side panels and the status bar.
//   left : schematic → part library; PCB → layers, nets, routing progress;
//          3D → view options; simulation → (handled by SimView)
//   right: inspector for the selection, ERC/DRC issue list

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, input, select, checkbox, toast, stepper } from "./widgets.js";
import { allSymbols, getSymbol, symbolBounds, symbolCategories, partSymbol, unitCount, unitLetter } from "../lib/symbols.js";
import { getFootprint } from "../lib/footprints.js";
import { copperLayers } from "../core/project.js";
import { boardNets, footprintPads, trackWidthFor } from "../pcb/board.js";
import { SCH_THEMES, drawPart } from "../sch/render.js";
import { PCB_THEMES } from "../pcb/render.js";
import { drawPadPath } from "../pcb/zones.js";
import { formatValue } from "../core/project.js";
import { boardBounds } from "../pcb/board.js";
import { connectedCopper } from "../pcb/ops.js";
import { issueText } from "./issuetext.js";

// ---------------------------------------------------------------- previews
const thumbCache = new Map();

export function clearThumbCache() {
  thumbCache.clear();
}

export function symbolThumb(lib, w = 88, hgt = 72, themeName = "dark") {
  const key = `${lib}|${w}|${hgt}|${themeName}`;
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  if (thumbCache.has(key)) {
    canvas.getContext("2d").drawImage(thumbCache.get(key), 0, 0);
    return canvas;
  }
  const sym = partSymbol({ lib, unit: 1 });
  if (!sym) return canvas;
  const ctx = canvas.getContext("2d");
  const b = symbolBounds(sym);
  const bw = b.x2 - b.x1 + 120;
  const bh = b.y2 - b.y1 + 120;
  const s = Math.min((w * dpr) / bw, (hgt * dpr) / bh);
  ctx.setTransform(s, 0, 0, s, (w * dpr) / 2 - ((b.x1 + b.x2) / 2) * s, (hgt * dpr) / 2 - ((b.y1 + b.y2) / 2) * s);
  const theme = { ...(SCH_THEMES[themeName] || SCH_THEMES.dark) };
  drawPart(ctx, { id: "thumb", lib, ref: "", value: "", x: 0, y: 0, rot: 0, hideRef: true, hideValue: true }, theme, s / dpr);
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d").drawImage(canvas, 0, 0);
  thumbCache.set(key, copy);
  return canvas;
}

export function footprintThumb(name, w = 220, hgt = 140, themeName = "dark") {
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const def = getFootprint(name);
  if (!def) return canvas;
  const th = PCB_THEMES[themeName] || PCB_THEMES.dark;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const c = def.courtyard;
  const s = Math.min((w * dpr) / (c.x2 - c.x1 + 2), (hgt * dpr) / (c.y2 - c.y1 + 2));
  ctx.setTransform(s, 0, 0, s, (w * dpr) / 2 - ((c.x1 + c.x2) / 2) * s, (hgt * dpr) / 2 - ((c.y1 + c.y2) / 2) * s);
  const fp = { id: "p", footprint: name, x: 0, y: 0, rot: 0, side: "F", padNets: {} };
  for (const pad of footprintPads(fp, { layerCount: 2 })) {
    ctx.fillStyle = pad.smd ? th["F.Cu"] : th.pad;
    drawPadPath(ctx, pad);
    ctx.fill();
    if (pad.drill) { ctx.fillStyle = th.hole; ctx.beginPath(); ctx.arc(pad.x, pad.y, pad.drill / 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(pad.w, pad.h) * 0.45}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pad.num, pad.x, pad.y);
  }
  ctx.strokeStyle = th["F.SilkS"];
  ctx.lineCap = "round";
  for (const sl of def.silk || []) {
    ctx.lineWidth = sl.w || 0.12;
    ctx.beginPath();
    if (sl.t === "line") { ctx.moveTo(sl.x1, sl.y1); ctx.lineTo(sl.x2, sl.y2); }
    else if (sl.t === "rect") ctx.rect(sl.x1, sl.y1, sl.x2 - sl.x1, sl.y2 - sl.y1);
    else if (sl.t === "circle") ctx.arc(sl.cx, sl.cy, sl.r, 0, Math.PI * 2);
    else if (sl.t === "arc") ctx.arc(sl.cx, sl.cy, sl.r, -sl.a2 * Math.PI / 180, -sl.a1 * Math.PI / 180);
    ctx.stroke();
  }
  ctx.strokeStyle = th["F.CrtYd"];
  ctx.lineWidth = 0.05;
  ctx.strokeRect(c.x1, c.y1, c.x2 - c.x1, c.y2 - c.y1);
  return canvas;
}

// ---------------------------------------------------------------- left panel
let libState = { query: "", category: "" };

// Scan order for the library filters. Anything not listed (a custom category)
// is appended after these.
const LIB_CATS = ["Passive", "Diode", "Transistor", "Power", "Switch", "Simulation", "Connector", "Mechanical", "Misc", "IC", "MCU", "Logic", "Interface"];

function libraryCategories() {
  const present = new Set(symbolCategories());
  const ordered = LIB_CATS.filter((c) => present.has(c));
  for (const c of symbolCategories()) if (!ordered.includes(c)) ordered.push(c);
  return ordered;
}

export function renderLeft(app, host) {
  host.innerHTML = "";
  if (app.tab === "sch") return renderLibrary(app, host);
  if (app.tab === "pcb") return renderLayers(app, host);
  if (app.tab === "3d") return app.v3d.renderPanel(host);
  if (app.tab === "sim") return app.simView.renderPanel(host);
  return undefined;
}

function renderLibrary(app, host) {
  const panel = h("div", { class: "panel grow" });
  panel.append(h("div", { class: "panel-head" }, h("span", {}, t("Part library")), h("div", { class: "grow" }),
    h("button", { class: "icon-btn", title: t("Symbol editor…"), html: icon("symbolEdit", 15), onclick: () => app.run("tools.symbolEditor") }),
    h("button", { class: "icon-btn", title: t("Power port"), html: icon("ground", 15), onclick: () => app.run("sch.power") })));
  const search = h("input", { placeholder: t("Search parts (e.g. 10k, led, 555)"), value: libState.query });
  panel.append(h("div", { class: "search" }, h("span", { html: icon("search", 15) }), search));
  const chips = h("div", { class: "lib-cats" });
  for (const c of ["", ...libraryCategories()]) {
    const label = c ? t(c) : t("All");
    chips.append(h("button", { class: `chip ${libState.category === c ? "on" : ""}`, title: label, onclick: () => { libState.category = c; renderLeft(app, host); } }, label));
  }
  panel.append(chips);
  const preview = h("div", { class: "lib-preview" });
  const list = h("div", { class: "lib-list" });
  panel.append(list, preview);
  host.append(panel);

  const showPreview = (sym) => {
    preview.innerHTML = "";
    if (!sym) { preview.append(h("div", { class: "cap" }, t("Hover a part to preview. Drag it onto the sheet, or click and then click on the sheet."))); return; }
    const c = symbolThumb(sym.name, Math.max(200, (host.clientWidth || 280) - 22), 150, app.themeName());
    preview.append(c, h("div", { class: "cap" }, `${sym.title} · ${sym.footprints && sym.footprints[0] ? sym.footprints[0] : t("no footprint")}`));
  };
  const fill = () => {
    list.innerHTML = "";
    const q = libState.query.trim().toLowerCase();
    let syms = allSymbols().filter((s) => !libState.category || s.category === libState.category);
    if (q) {
      const words = q.split(/\s+/);
      syms = syms.filter((s) => {
        const hay = `${s.name} ${s.title} ${t(s.title)} ${s.category} ${s.keywords || ""} ${s.value || ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    const recent = !q && !libState.category ? app.settings.recentSymbols.map(getSymbol).filter(Boolean) : [];
    const groups = new Map();
    if (recent.length) groups.set(t("Recently used"), recent);
    for (const s of syms) {
      const g = t(s.category);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    for (const [g, items] of groups) {
      list.append(h("div", { class: "lib-group" }, g));
      for (const s of items) {
        const row = h("div", { class: "lib-item", draggable: "true", title: `${s.title}\n${s.keywords || ""}` }, symbolThumb(s.name, 44, 36, app.themeName()),
          h("div", {}, h("div", { class: "nm" }, s.name), h("div", { class: "ds" }, `${t(s.title)}${s.value ? " · " + s.value : ""}`)));
        row.addEventListener("pointerenter", () => showPreview(s));
        row.addEventListener("click", () => { app.sch.setTool("place", { lib: s.name }); app.sch.canvas.focus(); });
        row.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/x-mycircuit-symbol", s.name); e.dataTransfer.effectAllowed = "copy"; });
        list.append(row);
      }
    }
    if (!list.children.length) list.append(h("div", { class: "empty-note" }, t("No parts match. Try another word, or create one with the symbol editor.")));
  };
  search.addEventListener("input", () => { libState.query = search.value; fill(); });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = list.querySelector(".lib-item");
      if (first) first.click();
    }
    e.stopPropagation();
  });
  fill();
  showPreview(null);
  bindCanvasDrop(app);
}

let dropBound = false;
function bindCanvasDrop(app) {
  if (dropBound) return;
  dropBound = true;
  const canvas = app.sch.canvas;
  canvas.addEventListener("dragover", (e) => {
    if ([...e.dataTransfer.types].includes("text/x-mycircuit-symbol")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  });
  canvas.addEventListener("drop", (e) => {
    const lib = e.dataTransfer.getData("text/x-mycircuit-symbol");
    if (!lib) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const [wx, wy] = app.sch.vp.toWorld(e.clientX - r.left, e.clientY - r.top);
    app.sch.setTool("place", { lib });
    app.sch.ghost.x = Math.round(wx / app.sch.grid) * app.sch.grid;
    app.sch.ghost.y = Math.round(wy / app.sch.grid) * app.sch.grid;
    app.sch.pointerPlace("down", { button: 0, shiftKey: true }, wx, wy);
    app.sch.setTool("select");
  });
  // Files dropped anywhere open as projects.
  document.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", async (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    if (!/\.mycircuit$|\.json$/i.test(f.name)) { toast(t("Only .mycircuit project files can be opened."), "warn"); return; }
    if (!(await app.confirmDiscard())) return;
    if (app.loadText(await f.text(), { fileName: f.name })) app.setTab("sch");
  });
}

function renderLayers(app, host) {
  const pcb = app.store.project.pcb;
  const ed = app.pcb;
  const th = PCB_THEMES[app.themeName()];
  const st = ed.stats();

  const prog = h("div", { class: "panel" });
  const pct = st.total ? Math.round((st.routed / st.total) * 100) : 100;
  prog.append(h("div", { class: "panel-head" }, h("span", {}, t("Routing"))),
    h("div", { class: "panel-body" },
      h("div", { class: "summary-row" }, h("span", { class: `pill ${st.unrouted ? "warn" : "ok"}` }, `${st.routed} / ${st.total}`), t("connections routed"), h("b", {}, `${pct}%`)),
      h("div", { class: "progress" }, h("div", { style: { width: `${pct}%` } })),
      h("div", { class: "prop-actions" },
        h("button", { class: "btn small", onclick: () => app.run("pcb.autoroute") }, h("span", { html: icon("autoroute", 14) }), t("Autoroute")),
        h("button", { class: "btn small", onclick: () => app.run("tools.updatePcb") }, h("span", { html: icon("updatePcb", 14) }), t("Update from schematic")))));
  host.append(prog);

  const layers = h("div", { class: "panel" });
  layers.append(h("div", { class: "panel-head" }, h("span", {}, t("Layers")), h("div", { class: "grow" }),
    h("button", { class: `icon-btn ${ed.highContrast ? "on" : ""}`, title: t("High-contrast layers"), html: icon("layers", 15), onclick: () => app.run("view.contrast") })));
  const body = h("div", { class: "panel-body flush", style: { padding: "0 6px 8px" } });
  const row = (layer, label, desc, selectable) => {
    const visible = ed.visible[layer] !== false;
    const eye = h("span", { class: `eye ${visible ? "" : "off"}`, html: icon(visible ? "eye" : "eyeOff", 15), title: t("Show / hide") });
    eye.addEventListener("click", (e) => {
      e.stopPropagation();
      ed.visible[layer] = !visible;
      ed.request();
      renderLeft(app, host);
    });
    const r = h("div", { class: `layer-row ${ed.activeLayer === layer ? "active" : ""}`, title: selectable ? t("Click to make active") : "" }, eye,
      h("span", { class: "sw", style: { background: th[layer] || th.text } }), h("span", {}, label), h("small", {}, desc || ""));
    if (selectable) r.addEventListener("click", () => ed.setActiveLayer(layer));
    body.append(r);
  };
  for (const l of copperLayers(pcb)) row(l, l, l === "F.Cu" ? t("Top copper") : l === "B.Cu" ? t("Bottom copper") : t("Inner copper"), true);
  row("F.SilkS", "F.SilkS", t("Top silkscreen"), true);
  row("B.SilkS", "B.SilkS", t("Bottom silkscreen"), true);
  row("Edge.Cuts", "Edge.Cuts", t("Board outline"), true);
  row("F.CrtYd", "Courtyard", t("Part keep-out"), false);
  row("F.Fab", "F.Fab", t("Values"), false);
  row("Dwgs.User", "Dwgs.User", t("Drawings"), true);
  row("zones", t("Zones"), t("Copper pours"), false);
  row("vias", t("Vias"), "", false);
  layers.append(body);
  host.append(layers);

  const netsP = h("div", { class: "panel grow" });
  const nets = boardNets(pcb);
  const q = h("input", { placeholder: t("Filter nets") });
  const list = h("div", { class: "panel-body flush", style: { padding: "0 6px 8px" } });
  netsP.append(h("div", { class: "panel-head" }, h("span", {}, t("Nets")), h("small", {}, String(nets.length))), h("div", { class: "search" }, h("span", { html: icon("search", 14) }), q), list);
  const unroutedByNet = new Map();
  for (const r of st.rats) unroutedByNet.set(r.net, (unroutedByNet.get(r.net) || 0) + 1);
  const fill = () => {
    list.innerHTML = "";
    const f = q.value.trim().toLowerCase();
    for (const n of nets) {
      if (f && !n.toLowerCase().includes(f)) continue;
      const un = unroutedByNet.get(n) || 0;
      const r = h("div", { class: `net-row ${ed.highlightNet === n ? "on" : ""}`, title: t("Click to highlight, double-click to autoroute this net") },
        h("span", {}, n), h("small", {}, un ? `${un} ${t("open")}` : "✓"));
      r.addEventListener("click", () => { ed.highlightNet = ed.highlightNet === n ? null : n; app.highlightNet = ed.highlightNet; ed.request(); app.sch.request(); fill(); });
      r.addEventListener("dblclick", () => app.autoroute([n]));
      list.append(r);
    }
    if (!nets.length) list.append(h("div", { class: "empty-note", html: t("No nets yet. Draw the schematic, then press <b>F8</b> (Update PCB from schematic).") }));
  };
  q.addEventListener("input", fill);
  q.addEventListener("keydown", (e) => e.stopPropagation());
  fill();
  host.append(netsP);
}

// ---------------------------------------------------------------- right panel
export function renderRight(app, host) {
  host.innerHTML = "";
  if (app.tab === "start" || app.tab === "sim") return;
  if (app.tab === "3d") return app.v3d.renderInspector(host);
  const insp = h("div", { class: "panel" });
  insp.append(h("div", { class: "panel-head" }, h("span", {}, t("Properties"))));
  const body = h("div", { class: "panel-body" });
  insp.append(body);
  if (app.tab === "sch") schInspector(app, body);
  else pcbInspector(app, body);
  host.append(insp);
  host.append(issuesPanel(app));
}

function bindField(app, label, getter, setter, opts = {}) {
  // Numbers: [−] value [+] with the value centred (and still typeable).
  if (opts.type === "number") {
    const step = parseFloat(opts.step) || 1;
    const dec = String(opts.step || "1").includes(".") ? String(opts.step).split(".")[1].length : 0;
    const el = stepper(+getter() || 0, { step, min: opts.min ?? -Infinity, max: opts.max ?? Infinity, editable: true, format: (v) => (dec ? (+v.toFixed(Math.max(dec, 2))).toString() : String(Math.round(v * 1000) / 1000)),
      onChange: (v) => app.store.edit(t("Edit {field}", { field: label }), () => setter(+v.toFixed(6))) });
    el.dataset.field = label;
    return [h("span", { title: label }, label), el];
  }
  const el = opts.options ? select(getter(), opts.options, {}) : input(getter(), { type: opts.type || "text", step: opts.step });
  el.addEventListener("change", () => {
    let v = el.value;
    if (opts.type === "number") { v = parseFloat(v); if (!Number.isFinite(v)) return; }
    app.store.edit(t("Edit {field}", { field: label }), () => setter(v));
  });
  el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") el.blur(); });
  return [h("span", { title: label }, label), el];
}

function schInspector(app, body) {
  const items = app.sch.selectedItems();
  if (!items.length) {
    const sch = app.store.project.schematic;
    const real = sch.parts.filter((p) => { const s = getSymbol(p.lib); return s && !s.power && !s.flag; });
    body.append(
      h("div", { class: "prop-title" }, h("span", { html: icon("sheet", 16) }), app.store.project.meta.title || t("Untitled")),
      h("div", { class: "prop-sub" }, t("{p} parts · {w} wires · {n} nets", { p: real.length, w: sch.wires.length, n: app.sch.netlist().nets.length })),
      h("div", { class: "prop-grid" }, ...bindField(app, t("Sheet size"), () => sch.sheet, (v) => { sch.sheet = v; }, { options: ["A4", "A3", "A2", "Letter", "Tabloid"] })),
      h("div", { class: "empty-note", html: t("Select something to edit it here.<br><b>A</b> add part · <b>W</b> wire · <b>L</b> label · <b>P</b> power · <b>Ctrl+K</b> search everything") }),
    );
    return;
  }
  if (items.length > 1) {
    const counts = {};
    for (const i of items) counts[i.kind] = (counts[i.kind] || 0) + 1;
    body.append(h("div", { class: "prop-title" }, t("{n} items selected", { n: items.length })),
      h("div", { class: "prop-sub" }, Object.entries(counts).map(([k, n]) => `${n} ${t(k)}`).join(" · ")),
      h("div", { class: "prop-actions" },
        h("button", { class: "btn small", onclick: () => app.sch.rotate() }, t("Rotate")),
        h("button", { class: "btn small", onclick: () => app.sch.mirror("x") }, t("Mirror")),
        h("button", { class: "btn small", onclick: () => app.sch.duplicate() }, t("Duplicate")),
        h("button", { class: "btn small danger", onclick: () => app.sch.deleteSelection() }, t("Delete"))));
    return;
  }
  const { kind, obj } = items[0];
  if (kind === "parts") {
    const sym = getSymbol(obj.lib);
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("resistor", 16) }), `${obj.ref}  ${obj.value}`), h("div", { class: "prop-sub" }, `${sym ? t(sym.title) : obj.lib} · ${obj.lib}`));
    const grid = h("div", { class: "prop-grid" });
    if (!(sym && (sym.power || sym.flag))) grid.append(...bindField(app, t("Reference"), () => obj.ref, (v) => { obj.ref = v.trim(); }));
    grid.append(...bindField(app, t("Value"), () => obj.value, (v) => { obj.value = v.trim(); }));
    if (sym && !sym.power && !sym.flag) {
      const fps = [...new Set([obj.footprint, ...(sym.footprints || [])].filter(Boolean))];
      const fpSel = select(obj.footprint, [["", t("(none)")], ...fps.map((f) => [f, f]), ["__more", t("More…")]]);
      fpSel.addEventListener("change", () => {
        if (fpSel.value === "__more") { fpSel.value = obj.footprint; app.run("tools.footprints"); return; }
        app.store.edit(t("Edit footprint"), () => { obj.footprint = fpSel.value; });
      });
      grid.append(h("span", {}, t("Footprint")), fpSel);
      // Multi-unit parts: which unit this symbol shows (U1A, U1B …).
      const units = unitCount(sym);
      if (units > 1) {
        const unitSel = select(String(obj.unit || 1), sym.units.map((u, i) => [String(i + 1), `${unitLetter(i + 1)}${u.name && u.name !== unitLetter(i + 1) ? " — " + u.name : ""}`]));
        unitSel.addEventListener("change", () => app.store.edit(t("Change unit"), () => { obj.unit = +unitSel.value; }));
        grid.append(h("span", {}, t("Unit")), unitSel);
      }
    }
    grid.append(...bindField(app, t("Rotation"), () => String(obj.rot || 0), (v) => { obj.rot = +v; delete obj.refOffset; delete obj.valueOffset; }, { options: [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]] }));
    const mirror = checkbox(obj.mirror, t("Mirrored"), { onChange: (v) => app.store.edit(t("Mirror"), () => { obj.mirror = v; }) });
    const dnp = checkbox(obj.dnp, t("Do not populate"), { onChange: (v) => app.store.edit(t("Edit DNP"), () => { obj.dnp = v; }) });
    grid.append(h("span", {}, ""), mirror, h("span", {}, ""), dnp);
    body.append(grid);
    // Simulation fields (sources, switches …).
    const fields = { ...(sym && sym.fields ? sym.fields : {}), ...(obj.fields || {}) };
    if (Object.keys(fields).length) {
      body.append(h("div", { class: "prop-section" }, t("Simulation")));
      const g2 = h("div", { class: "prop-grid" });
      for (const k of Object.keys(fields)) {
        const opts = k === "wave" ? { options: [["dc", "DC"], ["sine", t("Sine")], ["pulse", t("Pulse")]] } : k === "state" ? { options: [["open", t("Open")], ["closed", t("Closed")]] } : {};
        g2.append(...bindField(app, t(k), () => fields[k], (v) => { obj.fields = { ...(obj.fields || {}), [k]: v }; }, opts));
      }
      body.append(g2);
    }
    body.append(h("div", { class: "prop-actions" },
      h("button", { class: "btn small", onclick: () => app.editPartProperties(obj) }, h("span", { html: icon("settings", 14) }), t("All properties…")),
      sym && !sym.power && h("button", { class: "btn small", onclick: () => app.crossProbe([obj.ref], "pcb") }, h("span", { html: icon("chip", 14) }), t("Show in PCB"))));
    return;
  }
  if (kind === "labels") {
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon(obj.kind === "global" ? "globalLabel" : "label", 16) }), obj.text), h("div", { class: "prop-sub" }, obj.kind === "global" ? t("Global label") : t("Net label")));
    body.append(h("div", { class: "prop-grid" },
      ...bindField(app, t("Name"), () => obj.text, (v) => { obj.text = v.trim(); }),
      ...bindField(app, t("Type"), () => obj.kind, (v) => { obj.kind = v; }, { options: [["local", t("Net label")], ["global", t("Global label")]] }),
      ...bindField(app, t("Rotation"), () => String(obj.rot || 0), (v) => { obj.rot = +v; }, { options: [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]] })));
    return;
  }
  if (kind === "texts") {
    const ta = h("textarea", { class: "input wide", rows: 4 }, obj.text);
    ta.addEventListener("change", () => app.store.edit(t("Edit text"), () => { obj.text = ta.value; }));
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    body.append(h("div", { class: "prop-title" }, t("Text")), ta, h("div", { class: "prop-grid", style: { marginTop: "8px" } }, ...bindField(app, t("Size (mil)"), () => obj.size || 50, (v) => { obj.size = v; }, { type: "number", step: "5", min: 10 })));
    return;
  }
  if (kind === "sheets") {
    const page = (app.store.project.schematic.pages || []).find((p) => p.id === obj.target);
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("sheet", 16) }), obj.name || t("Sheet")),
      h("div", { class: "prop-sub" }, t("Hierarchical sheet → page \"{p}\" · {n} pins", { p: page ? page.name : "?", n: (obj.pins || []).length })));
    body.append(h("div", { class: "prop-grid" },
      // Renaming the block renames its page too, so the page tab matches.
      ...bindField(app, t("Name"), () => obj.name, (v) => { obj.name = v.trim() || obj.name; if (page) page.name = obj.name; }),
      ...bindField(app, t("Width"), () => obj.w, (v) => { obj.w = Math.max(200, Math.round(v / 50) * 50); }, { type: "number", step: "50", min: 200 }),
      ...bindField(app, t("Height"), () => obj.h, (v) => { obj.h = Math.max(200, Math.round(v / 50) * 50); }, { type: "number", step: "50", min: 200 })));
    if ((obj.pins || []).length) {
      const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, t("Pin")), h("th", {}, t("Side"))));
      for (const p of obj.pins.slice(0, 16)) tbl.append(h("tr", {}, h("td", {}, p.name), h("td", {}, p.side === "R" ? t("Right") : t("Left"))));
      body.append(h("div", { class: "prop-section" }, t("Sheet pins")), tbl);
    } else body.append(h("div", { class: "empty-note" }, t("No pins yet: add hierarchical labels (H) on the sheet's page.")));
    body.append(h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => app.sch.setPage(obj.target) }, h("span", { html: icon("sheet", 14) }), t("Open sheet page"))));
    return;
  }
  if (kind === "wires") {
    const net = app.sch.netlist().wireNet.get(obj.id);
    const len = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("wire", 16) }), t("Wire")), h("div", { class: "prop-sub" }, `${t("Net")}: ${net || "—"} · ${(len / 1000 * 25.4).toFixed(2)} mm`),
      h("div", { class: "prop-actions" },
        net && h("button", { class: "btn small", onclick: () => { app.sch.highlightNet = net; app.sch.request(); } }, t("Highlight net")),
        net && h("button", { class: "btn small", onclick: () => app.addProbe(net) }, h("span", { html: icon("probe", 14) }), t("Add probe"))));
    return;
  }
  body.append(h("div", { class: "prop-title" }, t(kind)));
}

function pcbInspector(app, body) {
  const pcb = app.store.project.pcb;
  const items = app.pcb.selectedItems();
  const num = { type: "number", step: "0.01" };
  const pos = { type: "number", step: "0.01", min: 0 };
  if (!items.length) {
    const b = boardBounds(pcb);
    body.append(
      h("div", { class: "prop-title" }, h("span", { html: icon("chip", 16) }), t("Board")),
      h("div", { class: "prop-sub" }, `${(b.x2 - b.x1).toFixed(2)} × ${(b.y2 - b.y1).toFixed(2)} mm · ${pcb.layerCount} ${t("layers")} · ${pcb.footprints.length} ${t("footprints")}`),
      h("div", { class: "prop-grid" },
        ...bindField(app, t("Track width"), () => pcb.rules.trackWidth, (v) => { pcb.rules.trackWidth = v; }, pos),
        ...bindField(app, t("Clearance"), () => pcb.rules.clearance, (v) => { pcb.rules.clearance = v; }, pos),
        ...bindField(app, t("Via size"), () => pcb.rules.viaDiameter, (v) => { pcb.rules.viaDiameter = v; }, pos),
        ...bindField(app, t("Via drill"), () => pcb.rules.viaDrill, (v) => { pcb.rules.viaDrill = v; }, pos),
        ...bindField(app, t("Mask colour"), () => pcb.maskColor, (v) => { pcb.maskColor = v; }, { options: ["green", "red", "blue", "black", "white", "purple", "yellow"].map((c) => [c, t(c)]) }),
        ...bindField(app, t("Finish"), () => pcb.finish, (v) => { pcb.finish = v; }, { options: [["HASL", "HASL"], ["ENIG", "ENIG"], ["OSP", "OSP"]] })),
      h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => app.run("tools.boardSetup") }, h("span", { html: icon("settings", 14) }), t("Board setup…"))),
      h("div", { class: "empty-note", html: t("<b>X</b> route · <b>V</b> via · <b>Z</b> zone · <b>R</b> rotate · <b>F</b> flip · <b>PgUp/PgDn</b> layer · <b>H</b> high contrast") }),
    );
    return;
  }
  if (items.length > 1) {
    body.append(h("div", { class: "prop-title" }, t("{n} items selected", { n: items.length })),
      h("div", { class: "prop-actions" },
        h("button", { class: "btn small", onclick: () => app.pcb.rotate() }, t("Rotate")),
        h("button", { class: "btn small", onclick: () => app.pcb.flip() }, t("Flip")),
        h("button", { class: "btn small danger", onclick: () => app.pcb.deleteSelection() }, t("Delete"))));
    if (items.every((i) => i.kind === "tracks")) {
      const w = stepper(items[0].obj.w, { step: 0.05, min: 0.05, editable: true, format: (v) => String(+v.toFixed(3)), onChange: (v) => app.store.edit(t("Track width"), () => { for (const i of items) i.obj.w = +v.toFixed(4); }) });
      body.append(h("div", { class: "prop-grid", style: { marginTop: "10px" } }, h("span", {}, t("Width")), w));
    }
    return;
  }
  const { kind, obj } = items[0];
  const layerOpts = copperLayers(pcb).map((l) => [l, l]);
  if (kind === "footprints") {
    const def = getFootprint(obj.footprint);
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("chip", 16) }), `${obj.ref}  ${obj.value || ""}`), h("div", { class: "prop-sub" }, def ? def.title : obj.footprint));
    body.append(h("div", { class: "prop-grid" },
      ...bindField(app, "X (mm)", () => obj.x, (v) => { obj.x = v; }, num),
      ...bindField(app, "Y (mm)", () => obj.y, (v) => { obj.y = v; }, num),
      ...bindField(app, t("Rotation"), () => obj.rot || 0, (v) => { obj.rot = ((v % 360) + 360) % 360; }, { type: "number", step: "15" }),
      ...bindField(app, t("Side"), () => obj.side, (v) => { obj.side = v; }, { options: [["F", t("Top")], ["B", t("Bottom")]] }),
      h("span", {}, ""), checkbox(obj.locked, t("Locked"), { onChange: (v) => app.store.edit(t("Lock"), () => { obj.locked = v; }) })));
    const pads = footprintPads(obj, pcb);
    const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, t("Pad")), h("th", {}, t("Net"))));
    for (const p of pads.slice(0, 40)) tbl.append(h("tr", {}, h("td", {}, p.num), h("td", {}, p.net || "—")));
    body.append(h("div", { class: "prop-section" }, t("Pads")), h("div", { class: "table-wrap", style: { maxHeight: "180px" } }, tbl),
      h("div", { class: "prop-actions" },
        h("button", { class: "btn small", onclick: () => app.crossProbe([obj.ref], "sch") }, t("Show in schematic")),
        h("button", { class: "btn small", onclick: () => app.crossProbe([obj.ref], "3d") }, t("Show in 3D"))));
    return;
  }
  if (kind === "tracks") {
    const len = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("route", 16) }), t("Track")), h("div", { class: "prop-sub" }, `${obj.net || t("(no net)")} · ${len.toFixed(3)} mm`));
    const ampacity = trackCurrent(obj.w, 1, 10, obj.layer !== "F.Cu" && obj.layer !== "B.Cu");
    body.append(h("div", { class: "prop-grid" },
      ...bindField(app, t("Width"), () => obj.w, (v) => { obj.w = v; }, { type: "number", step: "0.05", min: 0.05 }),
      ...bindField(app, t("Layer"), () => obj.layer, (v) => { obj.layer = v; }, { options: layerOpts }),
      ...bindField(app, t("Net"), () => obj.net, (v) => { obj.net = v; }, { options: [["", t("(no net)")], ...boardNets(pcb).map((n) => [n, n])] })),
      h("div", { class: "empty-note" }, t("Carries about {a} A at 10 °C rise (1 oz copper, IPC-2221).", { a: ampacity.toFixed(2) })),
      h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => { app.pcb.select(connectedCopper(pcb, [obj.id])); } }, t("Select connected copper")),
        h("button", { class: "btn small", onclick: () => app.store.edit(t("Track width"), () => { obj.w = trackWidthFor(pcb.rules, obj.net); }) }, t("Use net class width"))));
    return;
  }
  if (kind === "vias") {
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("via", 16) }), t("Via")), h("div", { class: "prop-grid" },
      ...bindField(app, t("Diameter"), () => obj.d, (v) => { obj.d = v; }, pos),
      ...bindField(app, t("Drill"), () => obj.drill, (v) => { obj.drill = v; }, pos),
      ...bindField(app, t("Net"), () => obj.net, (v) => { obj.net = v; }, { options: [["", t("(no net)")], ...boardNets(pcb).map((n) => [n, n])] }),
      ...bindField(app, "X", () => obj.x, (v) => { obj.x = v; }, num),
      ...bindField(app, "Y", () => obj.y, (v) => { obj.y = v; }, num)));
    return;
  }
  if (kind === "zones") {
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("zone", 16) }), t("Copper zone")), h("div", { class: "prop-grid" },
      ...bindField(app, t("Net"), () => obj.net, (v) => { obj.net = v; }, { options: [["", t("(no net)")], ...boardNets(pcb).map((n) => [n, n])] }),
      ...bindField(app, t("Layer"), () => obj.layer, (v) => { obj.layer = v; }, { options: layerOpts }),
      ...bindField(app, t("Clearance"), () => obj.clearance, (v) => { obj.clearance = v; }, num),
      ...bindField(app, t("Priority"), () => obj.priority || 0, (v) => { obj.priority = v; }, { type: "number", step: "1" }),
      h("span", {}, ""), checkbox(obj.thermal !== false, t("Thermal reliefs"), { onChange: (v) => app.store.edit(t("Edit zone"), () => { obj.thermal = v; }) })));
    return;
  }
  if (kind === "texts") {
    body.append(h("div", { class: "prop-title" }, t("Text")), h("div", { class: "prop-grid" },
      ...bindField(app, t("Text"), () => obj.text, (v) => { obj.text = v; }),
      ...bindField(app, t("Size (mm)"), () => obj.size || 1.5, (v) => { obj.size = v; }, num),
      ...bindField(app, t("Rotation"), () => obj.rot || 0, (v) => { obj.rot = v; }, { type: "number", step: "90" }),
      ...bindField(app, t("Layer"), () => obj.layer, (v) => { obj.layer = v; }, { options: [...copperLayers(pcb), "F.SilkS", "B.SilkS", "Dwgs.User"].map((l) => [l, l]) })));
    return;
  }
  if (kind === "outline") {
    const b = boardBounds(pcb);
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("outline", 16) }), t("Board outline")), h("div", { class: "prop-sub" }, `${pcb.outline.length} ${t("corners")} · ${(b.x2 - b.x1).toFixed(2)} × ${(b.y2 - b.y1).toFixed(2)} mm`),
      h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => app.run("tools.boardSetup") }, t("Board setup…"))));
    return;
  }
  body.append(h("div", { class: "prop-title" }, t(kind)));
}

// IPC-2221 external/internal track current estimate.
export function trackCurrent(widthMm, oz = 1, rise = 10, internal = false) {
  const k = internal ? 0.024 : 0.048;
  const thickMil = oz * 1.378;
  const area = (widthMm / 0.0254) * thickMil;
  return k * Math.pow(rise, 0.44) * Math.pow(area, 0.725);
}

function issuesPanel(app) {
  const issues = app.tab === "sch" ? app.ercIssues : app.drcIssues;
  const kind = app.tab === "sch" ? "ERC" : "DRC";
  const p = h("div", { class: "panel grow" });
  const errs = issues.filter((i) => i.severity === "error").length;
  p.append(h("div", { class: "panel-head" }, h("span", {}, t("{k} issues", { k: kind })), h("div", { class: "grow" }),
    h("button", { class: "icon-btn", title: t("Run {k} again", { k: kind }), html: icon("refresh", 15), onclick: () => (app.tab === "sch" ? app.runErc(true) : app.runDrc(true)) })));
  const body = h("div", { class: "panel-body" });
  body.append(h("div", { class: "summary-row" },
    h("span", { class: `pill ${errs ? "err" : "ok"}` }, h("span", { html: icon(errs ? "error" : "check", 12) }), `${errs} ${t("errors")}`),
    h("span", { class: `pill ${issues.length - errs ? "warn" : ""}` }, `${issues.length - errs} ${t("warnings")}`)));
  if (!issues.length) {
    body.append(h("div", { class: "empty-note", html: app.tab === "sch" ? t("No ERC problems. The check runs automatically as you draw.") : app.drcIssues.length === 0 && app.drcRan ? t("No DRC problems.") : t("Run the DRC (toolbar shield) to check clearances, unrouted nets and board edges. It then updates as you edit.") }));
  }
  const list = h("div", { class: "issue-list" });
  for (const is of issues.slice(0, 400)) {
    const row = h("div", { class: `issue ${is.severity}`, title: t("Click to zoom to the problem") }, h("span", { html: icon(is.severity === "error" ? "error" : "warning", 15) }),
      h("div", {}, issueText(is.message), h("small", {}, `${is.code}${is.layer ? " · " + is.layer : ""}`)));
    row.addEventListener("click", () => {
      const ed = app.tab === "sch" ? app.sch : app.pcb;
      ed.focusPoint(is.x, is.y, is.ids || [], is.page || null);
    });
    list.append(row);
  }
  body.append(list);
  p.append(body);
  return p;
}

// ---------------------------------------------------------------- status bar
export function renderStatus(app, bar) {
  bar.innerHTML = "";
  const cell = (content, cls = "") => h("div", { class: `cell ${cls}` }, content);
  bar.append(cell(app.hintText || t("Ready"), "grow"));
  const ed = app.editor();
  if (ed) {
    const m = ed.vp.mouse;
    if (app.tab === "sch") {
      const unit = app.settings.units === "mm";
      const fmt = (v) => (unit ? `${(v * 0.0254).toFixed(2)} mm` : `${Math.round(v)} mil`);
      bar.append(cell(`X ${fmt(m.wx)}  Y ${fmt(m.wy)}`, "mono"));
      bar.append(h("button", { class: "cell", title: t("Change grid"), onclick: (e) => gridMenu(app, e) }, `${t("Grid")} ${app.settings.schGrid} mil`));
      bar.append(cell(`${Math.round(ed.vp.scale * 1000)}%`, "mono"));
    } else {
      const unit = app.settings.units === "mil";
      const fmt = (v) => (unit ? `${(v / 0.0254).toFixed(1)} mil` : `${v.toFixed(3)} mm`);
      bar.append(cell(`X ${fmt(m.wx)}  Y ${fmt(m.wy)}`, "mono"));
      bar.append(h("button", { class: "cell", title: t("Change grid"), onclick: (e) => gridMenu(app, e) }, `${t("Grid")} ${app.settings.pcbGrid} mm`));
      bar.append(cell(h("span", {}, h("span", { class: "layer-chip", style: { background: (PCB_THEMES[app.themeName()] || {})[app.pcb.activeLayer] } }), app.pcb.activeLayer)));
      const st = app.pcb.stats();
      bar.append(cell(`${t("Routed")} ${st.routed}/${st.total}`));
      bar.append(cell(`${Math.round(ed.vp.scale * 10) / 10} px/mm`, "mono"));
    }
    bar.append(h("button", { class: "cell", title: t("Switch units"), onclick: () => app.setSetting("units", app.settings.units === "mm" ? "mil" : "mm") }, app.settings.units));
  }
  if (app.simOverlay && app.tab === "sch") bar.append(cell(t("Simulation overlay on")));
  const e = app.ercIssues.filter((i) => i.severity === "error").length;
  bar.append(h("button", { class: "cell", onclick: () => app.run("inspect.erc") }, `ERC ${e ? "✖ " + e : "✓"}`));
  const d = app.drcIssues.filter((i) => i.severity === "error").length;
  bar.append(h("button", { class: "cell", onclick: () => app.run("inspect.drc") }, `DRC ${d ? "✖ " + d : app.drcRan ? "✓" : "—"}`));
  void formatValue;
}

function gridMenu(app, e) {
  const sch = app.tab === "sch";
  const opts = sch ? [10, 25, 50, 100] : [0.05, 0.1, 0.127, 0.25, 0.5, 0.635, 1, 1.27, 2.54];
  import("./widgets.js").then(({ contextMenu }) => contextMenu(opts.map((g) => ({
    label: sch ? `${g} mil` : `${g} mm`, checked: (sch ? app.settings.schGrid : app.settings.pcbGrid) === g,
    action: () => app.setSetting(sch ? "schGrid" : "pcbGrid", g),
  })), e.clientX, e.clientY - 10 - opts.length * 28));
}
