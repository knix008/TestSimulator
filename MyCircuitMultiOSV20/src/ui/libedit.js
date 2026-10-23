// Project-library editors: a symbol editor (pin table → box symbol with a
// live preview) and a footprint wizard (parametric generators). Both store
// their results in project.library so a project file carries its own parts.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, toast, field, input, select, pager } from "./widgets.js";
import { makeBoxSymbol, getSymbol, allSymbols } from "../lib/symbols.js";
import { makeFootprint, allFootprints, getFootprint } from "../lib/footprints.js";
import { registerProjectLibrary } from "../core/project.js";
import { symbolThumb, footprintThumb, clearThumbCache } from "./panels.js";

const PIN_TYPES = ["input", "output", "bidir", "tristate", "passive", "power_in", "power_out", "open_collector", "no_connect", "unspecified"];

export async function symbolEditor(app, existingName) {
  const lib = app.store.project.library;
  const existing = existingName ? lib.symbols.find((s) => s.name === existingName) : null;
  const spec = existing && existing.spec ? JSON.parse(JSON.stringify(existing.spec)) : {
    name: "MY_IC", title: "My IC", category: "Custom", refPrefix: "U", value: "MY_IC", footprint: "",
    pins: [
      { num: "1", name: "VCC", type: "power_in", side: "left" }, { num: "2", name: "IN", type: "input", side: "left" },
      { num: "3", name: "OUT", type: "output", side: "right" }, { num: "4", name: "GND", type: "power_in", side: "right" },
    ],
  };
  const preview = h("div", { class: "preview-box", style: { height: "300px", display: "flex", alignItems: "center", justifyContent: "center" } });
  const pinHost = h("div", {});
  const build = () => {
    const by = (side) => spec.pins.filter((p) => p.side === side).map((p) => [p.num, p.name, p.type]);
    return makeBoxSymbol(spec.name, {
      title: spec.title, category: spec.category || "Custom", refPrefix: spec.refPrefix || "U", value: spec.value || spec.name,
      footprints: spec.footprint ? [spec.footprint] : [], left: by("left"), right: by("right"), top: by("top"), bottom: by("bottom"), keywords: `${spec.title} custom`,
    });
  };
  const redraw = () => {
    const sym = { ...build(), spec };
    const others = lib.symbols.filter((s) => s.name !== (existing ? existing.name : spec.name));
    registerProjectLibrary({ library: { symbols: [...others, sym], footprints: lib.footprints } });
    preview.innerHTML = "";
    clearThumbCache();
    preview.append(symbolThumb(spec.name, 420, 290, app.themeName()));
  };
  const drawPins = () => {
    pinHost.innerHTML = "";
    const pg = pager(spec.pins, 7, (slice, offset) => {
    const tbl = h("table", { class: "grid" }, h("tr", {}, ...["#", "Name", "Type", "Side", ""].map((x) => h("th", {}, t(x)))));
    slice.forEach((p, k) => {
      const i = offset + k;
      const num = input(p.num, { onInput: (v) => { p.num = v.trim(); schedule(); } });
      const name = input(p.name, { onInput: (v) => { p.name = v; schedule(); } });
      const type = select(p.type, PIN_TYPES.map((x) => [x, x]), { onChange: (v) => { p.type = v; schedule(); } });
      const side = select(p.side, [["left", t("Left")], ["right", t("Right")], ["top", t("Top")], ["bottom", t("Bottom")]], { onChange: (v) => { p.side = v; schedule(); } });
      const del = h("button", { class: "icon-btn", title: t("Delete"), html: icon("trash", 14), onclick: () => { spec.pins.splice(i, 1); drawPins(); schedule(); } });
      for (const el of [num, name]) el.addEventListener("keydown", (e) => e.stopPropagation());
      tbl.append(h("tr", {}, h("td", { style: { width: "64px" } }, num), h("td", {}, name), h("td", {}, type), h("td", {}, side), h("td", { style: { width: "30px" } }, del)));
    });
    return tbl;
    });
    pg.showPage(Math.floor(Math.max(0, spec.pins.length - 1) / 7));
    pinHost.append(pg);
  };
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(redraw, 120); };
  const addPins = (n) => {
    const max = Math.max(0, ...spec.pins.map((p) => parseInt(p.num, 10) || 0));
    for (let i = 1; i <= n; i++) spec.pins.push({ num: String(max + i), name: `P${max + i}`, type: "bidir", side: spec.pins.filter((p) => p.side === "left").length <= spec.pins.filter((p) => p.side === "right").length ? "left" : "right" });
    drawPins();
    schedule();
  };
  const bulk = h("textarea", { class: "input wide", rows: 4, placeholder: t("Paste pins: one per line as  number, name, type, side") });
  bulk.addEventListener("keydown", (e) => e.stopPropagation());
  const meta = h("div", { class: "form-grid three" },
    field(t("Symbol name"), input(spec.name, { onInput: (v) => { spec.name = v.replace(/\s+/g, "_"); schedule(); } })),
    field(t("Description"), input(spec.title, { onInput: (v) => { spec.title = v; } })),
    field(t("Category"), input(spec.category, { onInput: (v) => { spec.category = v; } })),
    field(t("Reference prefix"), input(spec.refPrefix, { onInput: (v) => { spec.refPrefix = v; } })),
    field(t("Default value"), input(spec.value, { onInput: (v) => { spec.value = v; } })),
    field(t("Default footprint"), (() => { const el = h("input", { class: "input", value: spec.footprint, list: "se-fp" }); el.addEventListener("input", () => { spec.footprint = el.value; }); return h("div", {}, el, h("datalist", { id: "se-fp" }, ...allFootprints().map((f) => h("option", { value: f.name })))); })()),
  );
  for (const el of meta.querySelectorAll("input")) el.addEventListener("keydown", (e) => e.stopPropagation());
  const body = h("div", {},
    meta,
    h("div", { style: { display: "grid", gridTemplateColumns: "1fr 440px", gap: "14px", marginTop: "12px" } },
      h("div", {}, pinHost, h("div", { class: "prop-actions" },
        h("button", { class: "btn small", onclick: () => addPins(1) }, t("Add pin")),
        h("button", { class: "btn small", onclick: () => addPins(4) }, t("Add 4 pins")),
        h("button", { class: "btn small", onclick: () => { spec.pins.sort((a, b) => a.num.localeCompare(b.num, undefined, { numeric: true })); drawPins(); schedule(); } }, t("Sort by number"))),
      h("details", { style: { marginTop: "8px" } }, h("summary", {}, t("Bulk import from text")), bulk, h("button", { class: "btn small", style: { marginTop: "6px" }, onclick: () => {
        const rows = bulk.value.split(/\r?\n/).map((l) => l.split(/[,\t;]/).map((s) => s.trim())).filter((r) => r[0]);
        for (const r of rows) spec.pins.push({ num: r[0], name: r[1] || r[0], type: PIN_TYPES.includes(r[2]) ? r[2] : "bidir", side: ["left", "right", "top", "bottom"].includes(r[3]) ? r[3] : "left" });
        bulk.value = "";
        drawPins();
        schedule();
      } }, t("Import")))),
      preview),
    h("p", { class: "field-hint" }, t("Symbols are saved inside this project file, so it opens anywhere. Pins are spaced 100 mil apart; the box grows to fit the longest name.")));
  drawPins();
  redraw();
  const r = await modal({ title: existing ? t("Edit symbol {name}", { name: existing.name }) : t("Symbol editor"), width: "min(1100px, 95vw)", body,
    buttons: [{ label: t("Open existing…"), value: "open", left: true }, { label: t("Cancel"), value: null }, { label: t("Save to project"), value: "save", primary: true }] });
  if (r === "open") {
    const own = lib.symbols.map((s) => s.name);
    if (!own.length) { toast(t("This project has no custom symbols yet."), "info"); registerProjectLibrary(app.store.project); return; }
    registerProjectLibrary(app.store.project);
    const { quickPick } = await import("./widgets.js");
    quickPick({ items: own.map((n) => ({ label: n })), title: t("Symbol editor"), placeholder: t("Pick a symbol to edit"), onPick: (it) => symbolEditor(app, it.label) });
    return;
  }
  if (r !== "save") { registerProjectLibrary(app.store.project); return; }
  if (!spec.name || (getSymbolBuiltin(spec.name) && !existing)) { toast(t("Choose a unique symbol name (it clashes with the built-in library)."), "error"); registerProjectLibrary(app.store.project); return; }
  const dup = new Set();
  for (const p of spec.pins) { if (dup.has(p.num)) { toast(t("Pin number {n} is used twice.", { n: p.num }), "error"); registerProjectLibrary(app.store.project); return; } dup.add(p.num); }
  const sym = { ...build(), spec };
  app.store.edit(t("Save symbol"), (p) => {
    p.library.symbols = p.library.symbols.filter((s) => s.name !== (existing ? existing.name : spec.name));
    p.library.symbols.push(sym);
    registerProjectLibrary(p);
  });
  app.renderLeft();
  toast(t("Symbol {name} saved. It is in the library under \"{cat}\".", { name: sym.name, cat: sym.category }), "ok");
  app.setTab("sch");
  app.sch.setTool("place", { lib: sym.name });
}

function getSymbolBuiltin(name) {
  const s = getSymbol(name);
  return s && !s.spec ? s : null;
}

// ---------------------------------------------------------------- footprint wizard
export async function footprintWizard(app) {
  const params = { kind: "soic", name: "SOIC-14_custom", n: 14, rows: 1, pitch: 1.27, span: 5.4, row: 7.62, perSide: 8, body: 7, L: 2.0, W: 1.25, height: 3,
    pads: [
      { num: "1", shape: "rect", x: 0, y: 0, w: 1.8, h: 1.8, drill: 1.0 },
      { num: "2", shape: "circle", x: 5.08, y: 0, w: 1.8, h: 1.8, drill: 1.0 },
    ] };
  const preview = h("div", { class: "preview-box", style: { height: "280px" } });
  const info = h("div", { class: "field-hint" });
  const fieldsHost = h("div", { class: "form-grid three" });
  // Custom footprints are built straight from the pad table; the silkscreen
  // outline and courtyard follow the pads.
  const makeCustom = () => {
    const pads = params.pads.map((p) => {
      const smd = !(p.drill > 0);
      return { num: String(p.num), shape: p.shape, x: +p.x || 0, y: +p.y || 0, w: +p.w || 1, h: +p.h || 1, ...(smd ? {} : { drill: +p.drill }), layers: smd ? "F" : "*" };
    });
    if (!pads.length) throw new Error(t("Add at least one pad."));
    const xs = pads.flatMap((p) => [p.x - p.w / 2, p.x + p.w / 2]);
    const ys = pads.flatMap((p) => [p.y - p.h / 2, p.y + p.h / 2]);
    const x1 = Math.min(...xs) - 0.5, x2 = Math.max(...xs) + 0.5, y1 = Math.min(...ys) - 0.5, y2 = Math.max(...ys) + 0.5;
    const w = 0.12;
    return {
      name: params.name, title: t("Custom footprint"), kind: pads.every((p) => p.layers === "F") ? "smd" : "tht", category: "Custom", pads,
      silk: [{ t: "line", x1, y1, x2, y2: y1, w }, { t: "line", x1: x2, y1, x2, y2, w }, { t: "line", x1: x2, y1: y2, x2: x1, y2, w }, { t: "line", x1, y1: y2, x2: x1, y2: y1, w }],
      model3d: { kind: "box", W: x2 - x1 - 0.4, L: y2 - y1 - 0.4, H: +params.height || 3 },
    };
  };
  const make = () => (params.kind === "custom" ? makeCustom() : makeFootprint(params.kind, params));
  const redraw = () => {
    let fp;
    try { fp = make(); } catch (e) { info.textContent = e.message; return; }
    const others = app.store.project.library.footprints.filter((f) => f.name !== fp.name);
    registerProjectLibrary({ library: { symbols: app.store.project.library.symbols, footprints: [...others, fp] } });
    preview.innerHTML = "";
    preview.append(footprintThumb(fp.name, 560, 280, app.themeName()));
    const c = getFootprint(fp.name).courtyard;
    info.textContent = t("{n} pads · courtyard {w} × {h} mm", { n: fp.pads.length, w: (c.x2 - c.x1).toFixed(2), h: (c.y2 - c.y1).toFixed(2) });
  };
  const num = (k, label, step = "0.01") => {
    const el = input(params[k], { type: "number", step, onInput: (v) => { params[k] = parseFloat(v); redraw(); } });
    el.addEventListener("keydown", (e) => e.stopPropagation());
    return field(label, el);
  };
  const drawFields = () => {
    fieldsHost.innerHTML = "";
    const nm = input(params.name, { onInput: (v) => { params.name = v.replace(/\s+/g, "_"); redraw(); } });
    nm.addEventListener("keydown", (e) => e.stopPropagation());
    fieldsHost.append(field(t("Footprint name"), nm));
    if (params.kind === "header") fieldsHost.append(num("rows", t("Rows (1–2)"), "1"), num("n", t("Pins per row"), "1"), num("pitch", t("Pitch (mm)")));
    if (params.kind === "dip") fieldsHost.append(num("n", t("Pin count"), "2"), num("row", t("Row spacing (mm)")));
    if (params.kind === "soic") fieldsHost.append(num("n", t("Pin count"), "2"), num("pitch", t("Pitch (mm)")), num("span", t("Pad row spacing (mm)")));
    if (params.kind === "qfp") fieldsHost.append(num("perSide", t("Pins per side"), "1"), num("pitch", t("Pitch (mm)")), num("body", t("Body size (mm)")));
    if (params.kind === "chip") fieldsHost.append(num("L", t("Length (mm)")), num("W", t("Width (mm)")));
    if (params.kind === "custom") {
      fieldsHost.append(num("height", t("Body height for 3D (mm)"), "0.5"));
      const padPages = pager(params.pads, 5, (slice, offset) => {
      const tbl = h("table", { class: "grid" }, h("tr", {}, ...["#", "Shape", "X", "Y", "W", "H", "Drill", ""].map((x) => h("th", {}, t(x)))));
      slice.forEach((p, k) => {
        const i = offset + k;
        const cell = (k, type = "number") => {
          const el = input(p[k], { type, step: "0.01", onInput: (v) => { p[k] = type === "number" ? parseFloat(v) || 0 : v; redraw(); } });
          el.addEventListener("keydown", (e) => e.stopPropagation());
          el.style.width = "64px";
          return h("td", {}, el);
        };
        tbl.append(h("tr", {}, cell("num", "text"),
          h("td", {}, select(p.shape, [["rect", t("Rectangle")], ["roundrect", t("Rounded")], ["circle", t("Circle")], ["oval", t("Oval")]], { onChange: (v) => { p.shape = v; redraw(); } })),
          cell("x"), cell("y"), cell("w"), cell("h"), cell("drill"),
          h("td", {}, h("button", { class: "icon-btn", html: icon("trash", 14), onclick: () => { params.pads.splice(i, 1); drawFields(); redraw(); } }))));
      });
      return tbl;
      });
      padPages.showPage(Math.floor(Math.max(0, params.pads.length - 1) / 5));
      const addPad = () => {
        const last = params.pads[params.pads.length - 1] || { x: -2.54, y: 0, w: 1.8, h: 1.8, drill: 1.0, shape: "circle" };
        const next = Math.max(0, ...params.pads.map((p) => parseInt(p.num, 10) || 0)) + 1;
        params.pads.push({ ...last, num: String(next), x: +(last.x + 2.54).toFixed(3), shape: last.shape === "rect" ? "circle" : last.shape });
        drawFields();
        redraw();
      };
      fieldsHost.append(h("div", { class: "span2", style: { gridColumn: "1 / -1" } }, padPages,
        h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: addPad }, t("Add pad")),
          h("span", { class: "field-hint" }, t("Drill 0 makes an SMD pad on the top layer; a drill makes a plated through-hole pad.")))));
    }
  };
  const kinds = [["header", t("Pin header")], ["dip", "DIP"], ["soic", "SOIC / SOP"], ["qfp", "QFP"], ["chip", t("2-pad chip (R/C/L)")], ["custom", t("Custom pads")]];
  const kindSel = select(params.kind, kinds, { onChange: (v) => {
    params.kind = v;
    params.name = { header: "PinHeader_custom", dip: "DIP_custom", soic: "SOIC_custom", qfp: "QFP_custom", chip: "Chip_custom", custom: "MyFootprint" }[v];
    drawFields();
    redraw();
  } });
  const body = h("div", {}, h("div", { class: "form-grid three" }, field(t("Package type"), kindSel)), h("div", { style: { height: "8px" } }), fieldsHost,
    h("div", { style: { height: "12px" } }), preview, info,
    h("p", { class: "field-hint" }, t("Footprints are saved in the project. Assign them to parts with Tools → Assign footprints.")));
  drawFields();
  redraw();
  const r = await modal({ title: t("Footprint wizard"), width: 640, body, buttons: [{ label: t("Cancel"), value: null }, { label: t("Save to project"), value: "save", primary: true }] });
  if (r !== "save") { registerProjectLibrary(app.store.project); return; }
  const fp = make();
  app.store.edit(t("Save footprint"), (p) => {
    p.library.footprints = p.library.footprints.filter((f) => f.name !== fp.name);
    p.library.footprints.push(fp);
    registerProjectLibrary(p);
  });
  toast(t("Footprint {name} saved to the project.", { name: fp.name }), "ok");
  void allSymbols;
}
