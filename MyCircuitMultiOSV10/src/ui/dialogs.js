// Dialogs: part picker, properties, settings, board setup, footprint
// assignment, find, reports and help. Export/print/fabrication dialogs live
// in exports.js, the library editors in libedit.js, calculators in calc.js.

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, toast, quickPick, field, input, select, checkbox, tabs, confirmDialog, pager, stepper } from "./widgets.js";
import * as platform from "./platform.js";
import { allSymbols, getSymbol } from "../lib/symbols.js";
import { allFootprints, getFootprint, searchFootprints } from "../lib/footprints.js";
import { copperLayers, defaultRules, parseValue, formatValue } from "../core/project.js";
import { buildNetlist } from "../core/netlist.js";
import { boardNets, boardBounds, routingStats } from "../pcb/board.js";
import { rectOutline, arrangeFootprints } from "../pcb/ops.js";
import { insetPolygon } from "../pcb/zones.js";
import { uid } from "../core/geom.js";
import { symbolThumb, footprintThumb } from "./panels.js";

export { printDialog, exportSchematicSvg, exportSchematicPng, exportPcbSvg, exportNetlist, exportSpice, bomDialog, exportPnp, fabricationDialog, gerberViewer } from "./exports.js";
export { symbolEditor, footprintWizard } from "./libedit.js";
export { calculators } from "./calc.js";
import { THEMES, uiTokens, allThemes, setCustomThemes } from "./themes.js";

// ---------------------------------------------------------------- themes
// 20 dark + 20 light themes as swatches; a click applies immediately.
function themeSwatch(app, th, onPick) {
  const tok = uiTokens(th);
  const on = app.settings.theme === th.id;
  const b = h("button", { class: `theme-swatch ${on ? "on" : ""}`, title: th.name[getLanguage()] || th.name.en, onclick: () => onPick(th) },
    h("span", { class: "theme-chip", style: { background: th.bg } },
      h("i", { style: { background: th.panel } }), h("i", { style: { background: tok["--line2"] } }), h("i", { style: { background: th.accent } })),
    h("span", { class: "theme-name" }, th.name[getLanguage()] || th.name.en));
  b.style.setProperty("--sw-text", th.text);
  return b;
}

export function themeGallery(app) {
  const body = h("div", { class: "theme-gallery" });
  const draw = () => {
    body.innerHTML = "";
    const pick = (th) => { app.setSetting("theme", th.id); draw(); };
    for (const mode of ["dark", "light"]) {
      body.append(h("div", { class: "theme-group-title" }, mode === "dark" ? t("Dark themes") : t("Light themes")),
        h("div", { class: "theme-grid4" }, ...THEMES.filter((x) => x.mode === mode).map((th) => themeSwatch(app, th, pick))));
    }
    const sys = checkbox(app.settings.theme === "system", t("Follow the system light/dark setting (uses the last dark and light themes you picked)"), {
      onChange: (v) => {
        if (v) { const cur = app.currentTheme(); app.settings[cur.mode === "dark" ? "systemDark" : "systemLight"] = cur.id; app.setSetting("theme", "system"); }
        else app.setSetting("theme", app.currentTheme().id);
        draw();
      },
    });
    body.append(h("div", { class: "theme-sys" }, sys));
  };
  draw();
  return modal({ title: t("Themes"), width: 760, body, buttons: [{ label: t("Close"), value: null, primary: true }] });
}

// Theme dropdown under the palette button: Dark and Light themes listed
// vertically (20 each) plus the user's own themes. It is a popup, so it has a
// title bar with the program icon and its name, and it never scrolls.
export function themeMenu(app, anchor) {
  document.querySelector(".theme-drop")?.remove();
  const lang = getLanguage();
  const drop = h("div", { class: "theme-drop", role: "dialog" });
  const close = () => { drop.remove(); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", onKey, true); };
  const outside = (e) => { if (!drop.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const item = (th) => {
    const on = app.settings.theme === th.id;
    const row = h("button", { class: `theme-row ${on ? "on" : ""}`, onclick: () => { app.setSetting("theme", th.id); close(); } },
      h("span", { class: "theme-dot", style: { background: th.bg, borderColor: th.accent } }, h("i", { style: { background: th.accent } })),
      h("span", { class: "theme-row-name" }, th.name[lang] || th.name.en));
    if (th.custom) {
      row.append(h("span", { class: "theme-del", title: t("Delete"), html: icon("close", 12), onclick: (e) => {
        e.stopPropagation();
        app.setSetting("customThemes", (app.settings.customThemes || []).filter((c) => c.id !== th.id));
        if (app.settings.theme === th.id) app.setSetting("theme", "midnight");
        close();
        themeMenu(app, anchor);
      } }));
    }
    return row;
  };
  const col = (title, list) => h("div", { class: "theme-col" }, h("div", { class: "theme-col-title" }, title), ...list.map(item));
  const custom = allThemes().filter((x) => x.custom);
  drop.append(
    h("div", { class: "theme-drop-head" }, h("img", { src: "assets/icon.png", width: 16, height: 16, alt: "" }), h("span", {}, t("Themes")),
      h("span", { class: "grow" }),
      h("button", { class: "icon-btn", title: t("Close"), html: icon("close", 14), onclick: close })),
    h("div", { class: "theme-cols" },
      col(t("Dark themes"), THEMES.filter((x) => x.mode === "dark")),
      col(t("Light themes"), THEMES.filter((x) => x.mode === "light")),
      h("div", { class: "theme-col" }, h("div", { class: "theme-col-title" }, t("Custom themes")),
        ...custom.map(item),
        custom.length ? null : h("div", { class: "empty-note" }, t("None yet.")),
        h("button", { class: "btn small", style: { marginTop: "6px" }, onclick: () => { close(); customThemeEditor(app); } }, h("span", { html: icon("plus", 12) }), t("New custom theme…")),
        h("div", { class: "theme-col-title", style: { marginTop: "12px" } }, t("Automatic")),
        checkbox(app.settings.theme === "system", t("Follow the system"), { onChange: (v) => {
          if (v) { const cur = app.currentTheme(); app.settings[cur.mode === "dark" ? "systemDark" : "systemLight"] = cur.id; app.setSetting("theme", "system"); }
          else app.setSetting("theme", app.currentTheme().id);
          close();
        } }))));
  document.body.append(drop);
  const r = drop.getBoundingClientRect();
  const a2 = anchor || { right: window.innerWidth - 10, bottom: 40 };
  drop.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, a2.right - r.width))}px`;
  drop.style.top = `${Math.max(8, Math.min(window.innerHeight - r.height - 8, a2.bottom + 4))}px`;
  setTimeout(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", onKey, true); }, 0);
  return drop;
}

// Create a theme from four colours, previewed live on the whole program.
export async function customThemeEditor(app, base = null) {
  const cur = base || app.currentTheme();
  const draft = { name: cur.custom ? (cur.name.ko || cur.name.en) : `${t("My theme")} ${(app.settings.customThemes || []).length + 1}`, mode: cur.mode, bg: cur.bg, panel: cur.panel, text: cur.text, accent: cur.accent };
  const previous = app.settings.theme;
  const preview = () => {
    setCustomThemes([...(app.settings.customThemes || []), { ...draft, id: "__preview" }]);
    app.settings.theme = "__preview";
    app.applyTheme();
  };
  const colorField = (k, label) => {
    const el = h("input", { type: "color", class: "input", value: draft[k], style: { width: "100%", padding: "2px", height: "32px" } });
    el.addEventListener("input", () => { draft[k] = el.value; preview(); });
    return field(label, el);
  };
  const nameEl = input(draft.name, { onInput: (v) => { draft.name = v; } });
  nameEl.addEventListener("keydown", (e) => e.stopPropagation());
  const body = h("div", { class: "form-grid" },
    h("div", { class: "span2" }, field(t("Name"), nameEl)),
    field(t("Type"), select(draft.mode, [["dark", t("Dark")], ["light", t("Light")]], { onChange: (v) => { draft.mode = v; preview(); } })),
    colorField("accent", t("Accent")),
    colorField("bg", t("Background")),
    colorField("panel", t("Panels")),
    colorField("text", t("Text")),
    h("p", { class: "field-hint span2" }, t("Changes are previewed on the whole program. The schematic and PCB canvases follow the theme too.")));
  preview();
  const ok = await modal({ title: t("Custom theme"), width: 520, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Save theme"), value: true, primary: true }] });
  setCustomThemes(app.settings.customThemes || []);
  if (!ok) { app.settings.theme = previous; app.applyTheme(); return null; }
  const theme = { id: `custom-${Date.now().toString(36)}`, name: { ko: draft.name || t("My theme"), en: draft.name || "My theme" }, mode: draft.mode, bg: draft.bg, panel: draft.panel, text: draft.text, accent: draft.accent };
  app.setSetting("customThemes", [...(app.settings.customThemes || []), theme]);
  app.setSetting("theme", theme.id);
  toast(t("Theme \"{name}\" saved.", { name: draft.name }), "ok");
  return theme;
}

// ---------------------------------------------------------------- part pickers
export function partPicker(app) {
  const items = allSymbols().filter((s) => !s.power && !s.flag).map((s) => ({
    label: `${s.name}`, detail: `${t(s.title)} · ${t(s.category)}${s.value ? " · " + s.value : ""}`, keywords: `${s.title} ${s.keywords || ""} ${s.category}`, sym: s,
  }));
  const recent = app.settings.recentSymbols;
  items.sort((a, b) => (recent.indexOf(b.sym.name) + 1 ? 100 - recent.indexOf(b.sym.name) : 0) - (recent.indexOf(a.sym.name) + 1 ? 100 - recent.indexOf(a.sym.name) : 0));
  quickPick({
    items, title: t("Add part"), placeholder: t("Add part — type a name, value or keyword (resistor, 555, led …)"),
    render: (row, it) => row.prepend(symbolThumb(it.sym.name, 48, 36, app.themeName())),
    onPick: (it) => { app.setTab("sch"); app.sch.setTool("place", { lib: it.sym.name }); app.sch.canvas.focus(); },
  });
}

export function powerPicker(app, cb) {
  const items = allSymbols().filter((s) => s.power || s.flag).map((s) => ({ label: s.name, detail: t(s.title), keywords: s.keywords, sym: s }));
  quickPick({
    items, title: t("Power port"), placeholder: t("Pick a power symbol"),
    render: (row, it) => row.prepend(symbolThumb(it.sym.name, 48, 36, app.themeName())),
    onPick: (it) => cb(it.sym.name),
  });
}

// ---------------------------------------------------------------- properties
export async function partProperties(app, part) {
  const sym = getSymbol(part.lib);
  const draft = JSON.parse(JSON.stringify(part));
  const isPower = sym && (sym.power || sym.flag);
  const ref = input(draft.ref, { onInput: (v) => { draft.ref = v.trim(); } });
  const value = input(draft.value, { onInput: (v) => { draft.value = v; } });
  const valueHint = h("small", { class: "field-hint" });
  const showHint = () => {
    const v = parseValue(draft.value);
    valueHint.textContent = Number.isFinite(v) ? `= ${formatValue(v)}` : "";
  };
  value.addEventListener("input", showHint);
  showHint();
  const fpName = h("input", { class: "input", value: draft.footprint || "", list: "fp-list" });
  const dl = h("datalist", { id: "fp-list" }, ...allFootprints().map((f) => h("option", { value: f.name }, f.title)));
  const fpPrev = h("div", { class: "preview-box", style: { height: "150px", overflow: "hidden" } });
  const drawFp = () => { fpPrev.innerHTML = ""; if (getFootprint(fpName.value)) fpPrev.append(footprintThumb(fpName.value, 300, 150, app.themeName())); else fpPrev.append(h("div", { class: "empty-note", style: { padding: "12px" } }, t("No footprint preview"))); };
  fpName.addEventListener("input", () => { draft.footprint = fpName.value.trim(); drawFp(); });
  drawFp();
  const suggested = h("div", { class: "chips", style: { padding: "4px 0 0" } }, ...(sym && sym.footprints || []).map((f) => h("button", { class: "chip", onclick: () => { fpName.value = f; draft.footprint = f; drawFp(); } }, f)));
  const fields = { ...(sym && sym.fields ? sym.fields : {}), ...(draft.fields || {}) };
  const fieldRows = h("div", { class: "form-grid" });
  const fieldInputs = {};
  const addFieldRow = (k, v) => {
    const el = input(v, {});
    fieldInputs[k] = el;
    fieldRows.append(field(t(k), el));
  };
  for (const [k, v] of Object.entries(fields)) addFieldRow(k, v);
  const newKey = input("", { placeholder: t("Field name (e.g. MPN, Supplier)") });
  const addBtn = h("button", { class: "btn small", onclick: () => { const k = newKey.value.trim(); if (k && !fieldInputs[k]) { addFieldRow(k, ""); newKey.value = ""; } } }, t("Add field"));
  const general = h("div", { class: "form-grid" },
    !isPower && field(t("Reference"), ref),
    field(t("Value"), h("div", {}, value, valueHint)),
    field(t("Rotation"), select(String(draft.rot || 0), [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]], { onChange: (v) => { draft.rot = +v; } })),
    field(t("Options"), h("div", { style: { display: "flex", gap: "14px", flexWrap: "wrap" } },
      checkbox(draft.mirror, t("Mirrored"), { onChange: (v) => { draft.mirror = v; } }),
      checkbox(draft.dnp, t("Do not populate"), { onChange: (v) => { draft.dnp = v; } }),
      checkbox(draft.hideValue, t("Hide value"), { onChange: (v) => { draft.hideValue = v; } }))),
  );
  const fpTab = h("div", {}, field(t("Footprint"), fpName), dl, suggested, h("div", { style: { height: "8px" } }), fpPrev);
  const fieldTab = h("div", {}, fieldRows, h("div", { style: { display: "flex", gap: "8px", marginTop: "10px" } }, newKey, addBtn),
    h("p", { class: "field-hint" }, t("Simulation fields: value is the main parameter; sources use wave/amplitude/freq/offset/period/duty; switches use state; diodes and transistors accept is, n, bf … to override the model.")));
  const head = h("div", { style: { display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" } }, symbolThumb(part.lib, 90, 70, app.themeName()), h("div", {}, h("b", {}, sym ? t(sym.title) : part.lib), h("div", { class: "field-hint" }, `${part.lib} · ${sym ? t(sym.category) : ""}`)));
  const ok = await modal({
    title: t("Part properties — {ref}", { ref: part.ref }), width: 620,
    body: h("div", {}, head, tabs([{ id: "g", label: t("General"), body: general }, ...(isPower ? [] : [{ id: "f", label: t("Footprint"), body: fpTab }]), { id: "x", label: t("Fields"), body: fieldTab }])),
    buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }],
  });
  if (!ok) return;
  const newFields = {};
  for (const [k, el] of Object.entries(fieldInputs)) if (el.value !== "") newFields[k] = el.value;
  app.store.edit(t("Edit part"), () => {
    if (part.rot !== draft.rot) { delete part.refOffset; delete part.valueOffset; }
    Object.assign(part, { ref: draft.ref, value: draft.value, footprint: draft.footprint, rot: draft.rot, mirror: draft.mirror, dnp: !!draft.dnp, hideValue: !!draft.hideValue, fields: newFields });
  });
}

export async function footprintProperties(app, fp) {
  const draft = { ...fp };
  const fpSel = h("input", { class: "input", value: fp.footprint, list: "fp-list2" });
  const dl = h("datalist", { id: "fp-list2" }, ...allFootprints().map((f) => h("option", { value: f.name }, f.title)));
  const body = h("div", { class: "form-grid" },
    field(t("Reference"), h("input", { class: "input", value: fp.ref, disabled: true })),
    field(t("Value"), h("input", { class: "input", value: fp.value || "", disabled: true })),
    field("X (mm)", input(fp.x, { type: "number", step: "0.01", onInput: (v) => { draft.x = parseFloat(v); } })),
    field("Y (mm)", input(fp.y, { type: "number", step: "0.01", onInput: (v) => { draft.y = parseFloat(v); } })),
    field(t("Rotation"), input(fp.rot || 0, { type: "number", step: "15", onInput: (v) => { draft.rot = parseFloat(v); } })),
    field(t("Side"), select(fp.side, [["F", t("Top")], ["B", t("Bottom")]], { onChange: (v) => { draft.side = v; } })),
    h("div", { class: "span2" }, field(t("Footprint"), fpSel), dl, h("small", { class: "field-hint" }, t("Changing the footprint here is overwritten by the next Update PCB unless you change it in the schematic too."))),
    checkbox(fp.locked, t("Locked"), { onChange: (v) => { draft.locked = v; } }),
    checkbox(fp.hideRef, t("Hide reference"), { onChange: (v) => { draft.hideRef = v; } }),
  );
  const ok = await modal({ title: t("Footprint properties — {ref}", { ref: fp.ref }), width: 520, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return;
  app.store.edit(t("Edit footprint"), () => {
    fp.x = Number.isFinite(draft.x) ? draft.x : fp.x;
    fp.y = Number.isFinite(draft.y) ? draft.y : fp.y;
    fp.rot = Number.isFinite(draft.rot) ? ((draft.rot % 360) + 360) % 360 : fp.rot;
    fp.side = draft.side;
    fp.locked = !!draft.locked;
    fp.hideRef = !!draft.hideRef;
    if (getFootprint(fpSel.value)) fp.footprint = fpSel.value;
  });
}

export async function zoneProperties(app, zone, isNew) {
  const pcb = app.store.project.pcb;
  const draft = { ...zone };
  const nets = boardNets(pcb);
  const body = h("div", { class: "form-grid" },
    field(t("Net"), select(draft.net, [["", t("(no net)")], ...nets.map((n) => [n, n])], { onChange: (v) => { draft.net = v; } })),
    field(t("Layer"), select(draft.layer, copperLayers(pcb).map((l) => [l, l]), { onChange: (v) => { draft.layer = v; } })),
    field(t("Clearance (mm)"), input(draft.clearance, { type: "number", step: "0.05", onInput: (v) => { draft.clearance = parseFloat(v); } })),
    field(t("Priority"), input(draft.priority || 0, { type: "number", step: "1", onInput: (v) => { draft.priority = parseInt(v, 10) || 0; } })),
    checkbox(draft.thermal !== false, t("Thermal reliefs on pads"), { onChange: (v) => { draft.thermal = v; } }),
  );
  const ok = await modal({ title: isNew ? t("New copper zone") : t("Zone properties"), width: 460, body, buttons: [{ label: t("Cancel"), value: false }, { label: isNew ? t("Create zone") : t("OK"), value: true, primary: true }] });
  if (!ok) return;
  app.store.edit(isNew ? t("Add zone") : t("Edit zone"), (p) => {
    if (isNew) p.pcb.zones.push({ ...draft, clearance: Number.isFinite(draft.clearance) ? draft.clearance : 0.3 });
    else Object.assign(zone, draft);
  });
}

export async function projectProperties(app) {
  const meta = { ...app.store.project.meta };
  const f = (k, label) => field(label, input(meta[k], { onInput: (v) => { meta[k] = v; } }));
  const body = h("div", { class: "form-grid" }, h("div", { class: "span2" }, f("title", t("Title"))), f("author", t("Author")), f("company", t("Company")), f("rev", t("Revision")), f("date", t("Date")), h("div", { class: "span2" }, f("comment", t("Comment"))));
  const ok = await modal({ title: t("Project properties"), width: 520, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (ok) app.store.edit(t("Project properties"), (p) => { p.meta = meta; });
}

export const SETTING_DEFAULTS = {
  units: "mm", startup: "start", autosave: true, autosaveSeconds: 30, recentLimit: 10, showWelcome: false,
  uiScale: 1, animations: true, showHints: true, hintSeconds: 7,
  schGrid: 50, gridStyle: "lines", showGrid: true, showRulers: true, showBoardSize: true, emptyDrag: "pan", snapPins: true, crossProbe: true, showDangling: true, liveErc: true, showSimOverlay: true,
  pcbGrid: 0.635, showRatsnest: true, showCourtyards: true, padLabels: true, clearancePreview: true, liveDrc: true, routeMode: "highlight", autorouteLayers: "outer", autorouteGrid: 0.25, outlineRadius: 0,
  shadows: true, background3d: "gradient", units3d: "cm", fov3d: 35, rotateSpeed3d: 1, grid3d: true, axes3d: true, dims3d: true, zoomSpeed: 1, simMaxPoints: 100000,
  defaultPaper: "A4", maskExpansion: 0.05, tentVias: true,
};

// Settings: six tabs, every option takes effect (no scrolling — each tab fits).
export async function settingsDialog(app) {
  const s = { ...SETTING_DEFAULTS, ...app.settings };
  const sel = (k, opts, num = false) => select(String(s[k]), opts.map((o) => (Array.isArray(o) ? [String(o[0]), o[1]] : [String(o), String(o)])), { onChange: (v) => { s[k] = num ? +v : v; } });
  const chk = (k, label) => checkbox(s[k] !== false, label, { onChange: (v) => { s[k] = v; } });
  // Every number is a stepper: − on the left, + on the right, value centred.
  const num = (k, o) => { const el = stepper(s[k], { ...o, onChange: (v) => { s[k] = v; } }); el.dataset.setting = k; return el; };
  const unit = (u) => (v) => `${v} ${u}`;
  const secs = (v) => (v >= 60 ? `${v / 60} min` : `${v} s`);
  const general = h("div", { class: "form-grid" },
    field(t("Language"), sel("lang", [["ko", "한국어"], ["en", "English"]])),
    field(t("On start-up"), sel("startup", [["start", t("Show the start page")], ["last", t("Reopen the last project")]])),
    field(t("Recent files to remember"), num("recentLimit", { min: 1, max: 30, step: 1 })),
    field(t("Welcome"), chk("showWelcome", t("Show the welcome window at start-up"))),
    field(t("Autosave"), chk("autosave", t("Keep a recovery copy"))),
    field(t("Autosave interval"), num("autosaveSeconds", { values: [10, 15, 30, 60, 120, 300, 600], format: secs })),
  );
  const appearance = h("div", { class: "form-grid" },
    field(t("Theme"), h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, h("span", {}, app.themeLabel()), h("button", { class: "btn small", onclick: () => themeGallery(app) }, t("Themes…")))),
    field(t("Interface size"), num("uiScale", { values: [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.5], format: (v) => `${Math.round(v * 100)}%` })),
    field(t("Animations"), chk("animations", t("Animate dialogs, menus and the tutorial"))),
    field(t("Hints"), chk("showHints", t("Show tool hints on the canvas"))),
    field(t("Hint duration"), num("hintSeconds", { values: [0, 3, 5, 7, 10, 15, 30], format: (v) => (v ? `${v} s` : t("Always")) })),
  );
  const unitsGrid = h("div", { class: "form-grid" },
    field(t("Editor units"), sel("units", [["mm", "mm"], ["mil", "mil"]])),
    field(t("3D measurement unit"), sel("units3d", [["cm", t("Centimetres (cm)")], ["inch", t("Inches (in)")]])),
    field(t("Grid style"), sel("gridStyle", [["lines", t("Lines (5 × 5)")], ["dots", t("Dots")]])),
    field(t("Grid"), chk("showGrid", t("Show grid"))),
    field(t("Rulers"), chk("showRulers", t("Show rulers on the canvas edges"))),
    field(t("Board size"), chk("showBoardSize", t("Show the board's width and height on the PCB"))),
    field(t("Left-drag on empty canvas"), sel("emptyDrag", [["pan", t("Pan the view (Shift+drag = box select)")], ["select", t("Box select")]])),
    field(t("Wheel zoom speed"), num("zoomSpeed", { values: [0.5, 0.75, 1, 1.25, 1.5, 2, 3], format: (v) => `× ${v}` })),
  );
  const schematic = h("div", { class: "form-grid" },
    field(t("Schematic grid"), num("schGrid", { values: [5, 10, 25, 50, 100], format: unit("mil") })),
    field(t("Snapping"), chk("snapPins", t("Snap wires to pins and wire ends"))),
    field(t("Cross-probing"), chk("crossProbe", t("Selecting a part selects it in the other views"))),
    field(t("Wire ends"), chk("showDangling", t("Mark unconnected wire ends and pins"))),
    field(t("Checks"), chk("liveErc", t("Run ERC continuously"))),
    field(t("Simulation"), chk("showSimOverlay", t("Show simulation voltages on the schematic"))),
  );
  const pcbTab = h("div", { class: "form-grid" },
    field(t("PCB grid"), num("pcbGrid", { values: [0.05, 0.1, 0.127, 0.25, 0.5, 0.635, 1, 1.27, 2.54], format: unit("mm") })),
    field(t("Board outline corner radius (mm)"), num("outlineRadius", { min: 0, max: 20, step: 0.5, format: unit("mm") })),
    field(t("Ratsnest"), chk("showRatsnest", t("Show ratsnest"))),
    field(t("Courtyards"), chk("showCourtyards", t("Show courtyards"))),
    field(t("Pad labels"), chk("padLabels", t("Show pad numbers and nets when zoomed in"))),
    field(t("Checks"), chk("liveDrc", t("Re-run DRC after edits once it has been run"))),
  );
  const routing = h("div", { class: "form-grid" },
    field(t("Routing mode"), sel("routeMode", [["highlight", t("Highlight collisions")], ["shove", t("Push and shove")], ["block", t("Stop at obstacles")]])),
    field(t("Routing"), chk("clearancePreview", t("Warn about clearance while routing"))),
    field(t("Autorouter layers"), sel("autorouteLayers", [["outer", t("Outer layers only")], ["all", t("All copper layers")]])),
    field(t("Autorouter grid"), num("autorouteGrid", { values: [0.05, 0.1, 0.15, 0.2, 0.25, 0.5], format: unit("mm") })),
  );
  const view3d = h("div", { class: "form-grid" },
    field(t("3D background"), sel("background3d", [["gradient", t("Gradient")], ["solid", t("Solid")]])),
    field(t("3D shadows"), chk("shadows", t("Soft shadows under parts"))),
    field(t("Field of view"), num("fov3d", { min: 15, max: 75, step: 5, format: (v) => `${v}°` })),
    field(t("Rotate speed"), num("rotateSpeed3d", { values: [0.25, 0.5, 0.75, 1, 1.5, 2, 3], format: (v) => `× ${v}` })),
    field(t("Start with"), h("div", { class: "check-col" }, chk("grid3d", t("Grid with scale")), chk("axes3d", t("Coordinate axes")), chk("dims3d", t("Board dimensions")))),
  );
  const simTab = h("div", { class: "form-grid" },
    field(t("Transient points (max)"), num("simMaxPoints", { values: [10000, 50000, 100000, 250000, 500000, 1000000], format: (v) => v.toLocaleString() })),
  );
  const output = h("div", { class: "form-grid" },
    field(t("Default paper"), sel("defaultPaper", ["A4", "A3", "A5", "Letter", "Legal", "Tabloid"])),
    field(t("Solder mask expansion (mm)"), num("maskExpansion", { min: 0, max: 0.5, step: 0.01, format: unit("mm") })),
    field(t("Vias"), chk("tentVias", t("Tent vias (cover with mask)"))),
  );
  const ok = await modal({
    title: t("Settings"), width: 760, className: "settings-modal",
    body: tabs([
      { id: "g", label: t("General"), body: general }, { id: "a", label: t("Appearance"), body: appearance }, { id: "u", label: t("Units & grid"), body: unitsGrid },
      { id: "s", label: t("Schematic"), body: schematic }, { id: "p", label: t("PCB"), body: pcbTab }, { id: "r", label: t("Routing"), body: routing },
      { id: "v", label: t("3D view"), body: view3d }, { id: "m", label: t("Simulation"), body: simTab }, { id: "o", label: t("Output"), body: output },
    ]),
    buttons: [{ label: t("Reset to defaults"), value: "reset", left: true }, { label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }],
  });
  if (ok === "reset") {
    if (await confirmDialog(t("Reset all settings to their defaults?"))) {
      app.settings = { ...app.settings, ...SETTING_DEFAULTS, theme: "midnight" };
      app.applySettings();
    }
    return;
  }
  if (!ok) return;
  const langChanged = s.lang !== app.settings.lang;
  app.settings = { ...app.settings, ...s };
  if (langChanged) app.setSetting("lang", s.lang);
  app.applySettings();
}

// ---------------------------------------------------------------- board setup
export async function boardSetup(app) {
  const pcb = app.store.project.pcb;
  const b = boardBounds(pcb);
  const rules = JSON.parse(JSON.stringify(pcb.rules));
  const board = { w: +(b.x2 - b.x1).toFixed(3), h: +(b.y2 - b.y1).toFixed(3), r: app.settings.outlineRadius || 0, layers: pcb.layerCount, thickness: pcb.thickness, mask: pcb.maskColor, silk: pcb.silkColor, finish: pcb.finish, reshape: false };
  const num = (obj, k, step = "0.01") => input(obj[k], { type: "number", step, onInput: (v) => { obj[k] = parseFloat(v); } });
  const stackup = h("div", { class: "form-grid" },
    field(t("Copper layers"), select(String(board.layers), [["2", "2"], ["4", "4"], ["6", "6"]], { onChange: (v) => { board.layers = +v; } })),
    field(t("Thickness (mm)"), select(String(board.thickness), ["0.8", "1.0", "1.2", "1.6", "2.0"].map((x) => [x, x]), { onChange: (v) => { board.thickness = +v; } })),
    field(t("Solder mask"), select(board.mask, ["green", "red", "blue", "black", "white", "purple", "yellow"].map((c) => [c, t(c)]), { onChange: (v) => { board.mask = v; } })),
    field(t("Silkscreen"), select(board.silk, [["white", t("white")], ["black", t("black")], ["yellow", t("yellow")]], { onChange: (v) => { board.silk = v; } })),
    field(t("Surface finish"), select(board.finish, [["HASL", "HASL"], ["ENIG", "ENIG"], ["OSP", "OSP"]], { onChange: (v) => { board.finish = v; } })),
  );
  const outline = h("div", {},
    h("p", { class: "field-hint" }, t("Current outline: {w} × {h} mm with {n} corners. Set a rectangle below, or draw any shape with the Board outline tool (O).", { w: board.w, h: board.h, n: pcb.outline.length })),
    h("div", { class: "form-grid three" }, field(t("Width (mm)"), num(board, "w", "0.5")), field(t("Height (mm)"), num(board, "h", "0.5")), field(t("Corner radius (mm)"), num(board, "r", "0.5"))),
    h("div", { style: { marginTop: "10px" } }, checkbox(false, t("Replace the outline with this rectangle"), { onChange: (v) => { board.reshape = v; } })));
  const rulesTab = h("div", { class: "form-grid three" },
    field(t("Clearance"), num(rules, "clearance")), field(t("Track width"), num(rules, "trackWidth")), field(t("Min track width"), num(rules, "minTrackWidth")),
    field(t("Via diameter"), num(rules, "viaDiameter")), field(t("Via drill"), num(rules, "viaDrill")), field(t("Min drill"), num(rules, "minDrill")),
    field(t("Edge clearance"), num(rules, "edgeClearance")), field(t("Hole to hole"), num(rules, "holeToHole")),
  );
  const ncHost = h("div", {});
  const drawNc = () => {
    ncHost.innerHTML = "";
    const tbl = h("table", { class: "grid" }, h("tr", {}, ...["Name", "Track", "Clearance", "Via", "Drill", "Nets (comma separated)", ""].map((x) => h("th", {}, t(x)))));
    rules.netClasses.forEach((nc, i) => {
      const cell = (k, type = "number") => h("td", {}, input(k === "nets" ? nc.nets.join(", ") : nc[k], { type, step: "0.05", onInput: (v) => { if (k === "nets") nc.nets = v.split(",").map((s) => s.trim()).filter(Boolean); else if (type === "number") nc[k] = parseFloat(v); else nc[k] = v; } }));
      tbl.append(h("tr", {}, cell("name", "text"), cell("trackWidth"), cell("clearance"), cell("viaDiameter"), cell("viaDrill"), cell("nets", "text"),
        h("td", {}, h("button", { class: "icon-btn", html: icon("trash", 14), onclick: () => { rules.netClasses.splice(i, 1); drawNc(); } }))));
    });
    ncHost.append(h("div", { class: "table-wrap" }, tbl), h("div", { class: "prop-actions" },
      h("button", { class: "btn small", onclick: () => { rules.netClasses.push({ name: `Class${rules.netClasses.length + 1}`, trackWidth: rules.trackWidth, clearance: rules.clearance, viaDiameter: rules.viaDiameter, viaDrill: rules.viaDrill, nets: [] }); drawNc(); } }, t("Add net class")),
      h("span", { class: "field-hint" }, t("Nets on the board: {nets}", { nets: boardNets(pcb).join(", ") || "—" }))));
  };
  drawNc();
  const r = await modal({
    title: t("Board setup"), width: 760,
    body: tabs([{ id: "s", label: t("Stack-up & finish"), body: stackup }, { id: "o", label: t("Outline"), body: outline }, { id: "r", label: t("Design rules"), body: rulesTab }, { id: "n", label: t("Net classes"), body: ncHost }]),
    buttons: [{ label: t("Restore default rules"), value: "defaults", left: true }, { label: t("Cancel"), value: false }, { label: t("Apply"), value: true, primary: true }],
  });
  if (r === "defaults") { app.store.edit(t("Board setup"), (p) => { p.pcb.rules = defaultRules(); }); toast(t("Default design rules restored."), "ok"); return; }
  if (!r) return;
  app.store.edit(t("Board setup"), (p) => {
    p.pcb.rules = rules;
    p.pcb.layerCount = board.layers;
    p.pcb.thickness = board.thickness;
    p.pcb.maskColor = board.mask;
    p.pcb.silkColor = board.silk;
    p.pcb.finish = board.finish;
    if (board.reshape && board.w > 1 && board.h > 1) p.pcb.outline = rectOutline(b.x1, b.y1, board.w, board.h, board.r || 0);
    // Tracks on layers that no longer exist move to the bottom layer.
    const cu = copperLayers(p.pcb);
    for (const tr of p.pcb.tracks) if (!cu.includes(tr.layer)) tr.layer = "B.Cu";
    for (const z of p.pcb.zones) if (!cu.includes(z.layer)) z.layer = "B.Cu";
  });
  app.settings.outlineRadius = board.r || 0;
  app.saveSettings();
  app.renderToolbar();
  app.renderLeft();
}

// ---------------------------------------------------------------- footprint assignment
export async function assignFootprints(app) {
  const sch = app.store.project.schematic;
  const parts = sch.parts.filter((p) => { const s = getSymbol(p.lib); return s && !s.power && !s.flag; })
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  const choice = new Map(parts.map((p) => [p.id, p.footprint || ""]));
  const prev = h("div", { class: "preview-box", style: { height: "170px" } });
  const search = input("", { placeholder: t("Filter footprints") });
  const fpHost = h("div", {});
  const tblHost = h("div", {});
  let current = parts[0] ? parts[0].id : null;
  const showPrev = (name) => { prev.innerHTML = ""; if (getFootprint(name)) prev.append(footprintThumb(name, 320, 170, app.themeName())); };
  // Both lists are paged rather than scrolled (popups never scroll).
  const drawParts = (page = 0) => {
    tblHost.innerHTML = "";
    const pg = pager(parts, 10, (slice) => {
      const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, t("Reference")), h("th", {}, t("Value")), h("th", {}, t("Symbol")), h("th", {}, t("Footprint"))));
      for (const p of slice) {
        const sym = getSymbol(p.lib);
        const tr = h("tr", { style: { cursor: "pointer", background: p.id === current ? "var(--accent-soft)" : "" } }, h("td", {}, p.ref), h("td", {}, p.value), h("td", {}, sym ? sym.name : p.lib), h("td", {}, choice.get(p.id) || "—"));
        tr.addEventListener("click", () => { current = p.id; drawParts(Math.floor(parts.indexOf(p) / 10)); showPrev(choice.get(p.id)); drawFp(); });
        tbl.append(tr);
      }
      return tbl;
    });
    pg.showPage(page);
    tblHost.append(pg);
  };
  const drawFp = () => {
    fpHost.innerHTML = "";
    const part = parts.find((p) => p.id === current);
    const sym = part && getSymbol(part.lib);
    const suggested = new Set((sym && sym.footprints) || []);
    const list = searchFootprints(search.value).sort((x, y) => (suggested.has(y.name) ? 1 : 0) - (suggested.has(x.name) ? 1 : 0));
    fpHost.append(pager(list, 8, (slice) => h("div", { class: "fp-pick" }, ...slice.map((fp) => {
      const row = h("div", { class: `net-row ${choice.get(current) === fp.name ? "on" : ""}`, title: fp.title }, h("span", {}, `${suggested.has(fp.name) ? "★ " : ""}${fp.name}`), h("small", {}, fp.category));
      row.addEventListener("pointerenter", () => showPrev(fp.name));
      row.addEventListener("click", () => {
        if (!current) return;
        choice.set(current, fp.name);
        drawParts(Math.floor(parts.findIndex((p) => p.id === current) / 10));
        drawFp();
      });
      return row;
    }))));
  };
  search.addEventListener("input", drawFp);
  search.addEventListener("keydown", (e) => e.stopPropagation());
  drawParts();
  if (current) showPrev(choice.get(current));
  drawFp();
  const missing = parts.filter((p) => !p.footprint).length;
  const body = h("div", { style: { display: "grid", gridTemplateColumns: "1fr 340px", gap: "14px" } },
    h("div", {}, h("p", { class: "field-hint" }, t("Click a part, then pick its footprint on the right. ★ marks footprints suggested by the symbol. {n} parts have none yet.", { n: missing })), tblHost),
    h("div", {}, search, h("div", { style: { height: "6px" } }), fpHost, h("div", { style: { height: "8px" } }), prev));
  const ok = await modal({
    title: t("Assign footprints"), width: 980, body,
    buttons: [{ label: t("Use first suggestion for empty ones"), value: "auto", left: true }, { label: t("Cancel"), value: false }, { label: t("Apply"), value: true, primary: true }],
  });
  if (!ok) return;
  app.store.edit(t("Assign footprints"), () => {
    for (const p of parts) {
      let fp = choice.get(p.id);
      if (ok === "auto" && !fp) { const s = getSymbol(p.lib); fp = (s && s.footprints && s.footprints[0]) || ""; }
      p.footprint = fp;
    }
  });
  toast(t("Footprints assigned. Press F8 to update the PCB."), "ok");
}

// ---------------------------------------------------------------- find / history / reports
export function findDialog(app) {
  const items = [];
  const sch = app.store.project.schematic;
  for (const p of sch.parts) {
    const s = getSymbol(p.lib);
    if (!s || s.power || s.flag) continue;
    items.push({ label: `${p.ref} — ${p.value}`, detail: `${t(s.title)} · ${p.footprint || "—"}`, icon: "resistor", act: () => app.crossProbe([p.ref], app.tab === "pcb" ? "pcb" : "sch") });
  }
  for (const l of sch.labels) items.push({ label: l.text, detail: t("Net label"), icon: "label", act: () => { app.setTab("sch"); app.sch.focusPoint(l.x, l.y, [l.id]); } });
  for (const tx of sch.texts) items.push({ label: tx.text.split("\n")[0], detail: t("Text"), icon: "text", act: () => { app.setTab("sch"); app.sch.focusPoint(tx.x, tx.y, [tx.id]); } });
  for (const n of buildNetlist(sch).nets) items.push({ label: n.name, detail: `${t("Net")} · ${n.pins.map((p) => `${p.ref}.${p.pin}`).slice(0, 6).join(", ")}`, icon: "netlist", act: () => { app.highlightNet = n.name; app.sch.highlightNet = n.name; app.pcb.highlightNet = n.name; app.sch.request(); app.pcb.request(); } });
  quickPick({ items, title: t("Find…"), placeholder: t("Find a part, value, net, label or text…"), onPick: (it) => it.act() });
}

export function historyDialog(app) {
  const hst = app.store.history();
  const list = h("div", { class: "issue-list" });
  hst.undo.slice().reverse().forEach((l, i) => {
    const row = h("div", { class: "issue" }, h("span", { html: icon("undo", 14) }), h("div", {}, t(l), h("small", {}, i === 0 ? t("latest") : "")));
    row.addEventListener("click", () => { for (let k = 0; k <= i; k++) app.store.undo(); document.querySelector(".modal-backdrop")?.remove(); });
    list.append(row);
  });
  if (!hst.undo.length) list.append(h("div", { class: "empty-note" }, t("Nothing to undo yet.")));
  modal({ title: t("Undo history"), width: 420, body: h("div", {}, h("p", { class: "field-hint" }, t("Click a step to undo back to before it.")), list) });
}

export function netlistDialog(app) {
  const nl = buildNetlist(app.store.project.schematic);
  const body = pager(nl.nets, 12, (slice) => {
    const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, "#"), h("th", {}, t("Net")), h("th", {}, t("Pins")), h("th", {}, t("Connections"))));
    for (const n of slice) tbl.append(h("tr", {}, h("td", {}, n.code), h("td", {}, n.name), h("td", { class: "num" }, n.pins.length), h("td", {}, n.pins.map((p) => `${p.ref}.${p.pin}`).slice(0, 10).join("  ") + (n.pins.length > 10 ? " …" : ""))));
    return tbl;
  });
  modal({ title: t("Net list ({n} nets)", { n: nl.nets.length }), width: 820, body, buttons: [{ label: t("Export…"), value: "x" }, { label: t("Close"), value: null, primary: true }] }).then((r) => { if (r === "x") app.run("file.exportNetlist"); });
}

export async function lengthReport(app) {
  const { lengthReport: report } = await import("../pcb/cleanup.js");
  const rows = report(app.store.project);
  const st = routingStats(app.store.project.pcb);
  const table = pager(rows, 12, (slice) => {
    const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, t("Net")), h("th", {}, t("Length (mm)")), h("th", {}, t("Segments")), h("th", {}, t("Vias"))));
    for (const r of slice) tbl.append(h("tr", {}, h("td", {}, r.net), h("td", { class: "num" }, r.length.toFixed(2)), h("td", { class: "num" }, r.segments), h("td", { class: "num" }, r.vias)));
    return tbl;
  });
  modal({ title: t("Net length report"), width: 560, body: h("div", {}, h("p", { class: "field-hint" }, t("{r} of {n} connections routed.", { r: st.routed, n: st.total })), table) });
}

// Apply a pure routing result {remove, add:{tracks, vias}, update?} as one undo step.
export function applyRouting(app, label, r) {
  app.store.edit(label, (p) => {
    const rm = new Set(r.remove || []);
    p.pcb.tracks = p.pcb.tracks.filter((x) => !rm.has(x.id));
    p.pcb.vias = p.pcb.vias.filter((x) => !rm.has(x.id));
    for (const u of r.update || []) { const tr = p.pcb.tracks.find((x) => x.id === u.id); if (tr) Object.assign(tr, u.patch); }
    p.pcb.tracks.push(...((r.add && r.add.tracks) || []));
    p.pcb.vias.push(...((r.add && r.add.vias) || []));
  });
}

// Length tuning: meander the chosen nets up to the longest one (or a target).
export async function lengthTuning(app) {
  const tuning = await import("../pcb/tuning.js");
  const project = app.store.project;
  const nets = boardNets(project.pcb).filter((n) => project.pcb.tracks.some((tr) => tr.net === n));
  if (!nets.length) { toast(t("Route some tracks first: length tuning lengthens existing tracks."), "warn"); return; }
  const lengthOf = (n) => tuning.netLength(project, n).length;
  const rows = nets.map((n) => ({ net: n, length: lengthOf(n) })).sort((a, b) => b.length - a.length);
  const picked = new Set(rows.filter((r) => app.pcb && app.pcb.highlightNet === r.net).map((r) => r.net));
  const o = { mode: "match", target: Math.ceil((rows[0].length + 5) / 5) * 5, style: "rounded", side: "both", spacing: 0.5, tolerance: 0.1 };
  const longest = h("span", { class: "num" });
  const updateLongest = () => {
    const sel = rows.filter((r) => picked.has(r.net));
    longest.textContent = sel.length ? t("Longest selected: {l} mm", { l: Math.max(...sel.map((r) => r.length)).toFixed(2) }) : t("Tick the nets to tune.");
  };
  const list = pager(rows, 8, (slice) => {
    const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, ""), h("th", {}, t("Net")), h("th", {}, t("Length (mm)"))));
    for (const r of slice) {
      const box = h("input", { type: "checkbox", "data-net": r.net });
      box.checked = picked.has(r.net);
      box.addEventListener("change", () => { if (box.checked) picked.add(r.net); else picked.delete(r.net); updateLongest(); });
      tbl.append(h("tr", {}, h("td", {}, box), h("td", {}, r.net), h("td", { class: "num" }, r.length.toFixed(2))));
    }
    return tbl;
  });
  updateLongest();
  const body = h("div", { class: "tune-dialog" },
    h("p", { class: "field-hint" }, t("Each selected net gets a serpentine on its longest straight segment until it reaches the target. Bumps shrink or are left out where clearance would be violated.")),
    list, h("p", {}, longest),
    h("div", { class: "form-grid" },
      field(t("Target"), select(o.mode, [["match", t("Match the longest selected net")], ["fixed", t("Fixed length")]], { onChange: (v) => { o.mode = v; } })),
      field(t("Fixed length"), stepper(o.target, { min: 1, max: 1000, step: 1, format: (v) => `${v} mm`, onChange: (v) => { o.target = v; } })),
      field(t("Meander style"), select(o.style, [["rounded", t("Rounded bends")], ["mitered", t("Mitered (45°)")], ["square", t("Square")]], { onChange: (v) => { o.style = v; } })),
      field(t("Meander side"), select(o.side, [["both", t("Both sides")], ["left", t("Left of the track")], ["right", t("Right of the track")]], { onChange: (v) => { o.side = v; } })),
      field(t("Spacing"), stepper(o.spacing, { min: 0.1, max: 3, step: 0.1, format: (v) => `${v} mm`, onChange: (v) => { o.spacing = v; } })),
      field(t("Tolerance"), stepper(o.tolerance, { values: [0.01, 0.05, 0.1, 0.25, 0.5, 1], format: (v) => `± ${v} mm`, onChange: (v) => { o.tolerance = v; } }))));
  const ok = await modal({ title: t("Length tuning"), width: 640, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Tune"), value: true, primary: true }] });
  if (!ok) return null;
  const sel = [...picked];
  if (!sel.length) { toast(t("Tick the nets to tune."), "warn"); return null; }
  const r = tuning.matchLengths(project, sel, { target: o.mode === "fixed" ? o.target : undefined, style: o.style, side: o.side, spacing: o.spacing, tolerance: o.tolerance });
  if (!r.add.tracks.length) { toast(t("Nothing to tune: the nets already match, or there is no room for meanders."), "warn", 5000); return r; }
  applyRouting(app, t("Tune lengths"), r);
  const after = tuning.skewReport(app.store.project, sel);
  const worst = Math.min(...after.map((x) => x.delta));
  toast(t("Tuned {n} net(s) to {l} mm (largest skew now {s} mm).", { n: r.info.nets.filter((x) => x.reached).length, l: r.info.target.toFixed(2), s: Math.abs(worst).toFixed(3) }), "ok", 6000);
  return r;
}

// Differential pairs: pick a pair found by name (USB_D+/USB_D-, X_P/X_N …) and route it coupled.
export async function diffPairs(app) {
  const dp = await import("../pcb/diffpair.js");
  const project = app.store.project;
  const pairs = dp.findPairs(project);
  if (!pairs.length) { toast(t("No differential pairs found. Name nets like USB_D+ / USB_D- or CLK_P / CLK_N."), "warn", 6000); return null; }
  const rules = project.pcb.rules || {};
  const o = { pair: 0, layer: "F.Cu", width: rules.trackWidth || 0.25, gap: Math.max(0.15, rules.clearance || 0.2) };
  const list = pager(pairs.map((p, i) => ({ ...p, i, skew: dp.pairSkew(project, p.p, p.n) })), 6, (slice) => {
    const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, ""), h("th", {}, t("Pair")), h("th", {}, "P"), h("th", {}, "N"), h("th", {}, t("Skew (mm)"))));
    for (const r of slice) {
      const radio = h("input", { type: "radio", name: "dp-pick", "data-pair": String(r.i) });
      radio.checked = o.pair === r.i;
      radio.addEventListener("change", () => { o.pair = r.i; });
      tbl.append(h("tr", {}, h("td", {}, radio), h("td", {}, r.base), h("td", {}, r.p), h("td", {}, r.n), h("td", { class: "num" }, r.skew.skew.toFixed(3))));
    }
    return tbl;
  });
  const body = h("div", {},
    h("p", { class: "field-hint" }, t("The pair is routed as two parallel tracks at a constant gap; existing tracks of both nets are replaced.")),
    list,
    h("div", { class: "form-grid" },
      field(t("Layer"), select(o.layer, copperLayers(project.pcb).map((l) => [l, l]), { onChange: (v) => { o.layer = v; } })),
      field(t("Track width"), stepper(o.width, { min: 0.1, max: 2, step: 0.05, format: (v) => `${v} mm`, onChange: (v) => { o.width = v; } })),
      field(t("Gap"), stepper(o.gap, { min: 0.1, max: 2, step: 0.05, format: (v) => `${v} mm`, onChange: (v) => { o.gap = v; } }))));
  const ok = await modal({ title: t("Route differential pair"), width: 620, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Route"), value: true, primary: true }] });
  if (!ok) return null;
  const pr = pairs[o.pair];
  const r = dp.routeDiffPair(project, pr.p, pr.n, { layer: o.layer, width: o.width, gap: o.gap });
  if (r.error) { toast(t("Could not route the pair: {m}", { m: r.error }), "error", 6000); return r; }
  applyRouting(app, t("Route differential pair"), r);
  const sk = dp.pairSkew(app.store.project, pr.p, pr.n);
  toast(t("{p} / {n} routed: {a} / {b} mm, skew {s} mm.", { p: pr.p, n: pr.n, a: sk.lengthP.toFixed(2), b: sk.lengthN.toFixed(2), s: sk.skew.toFixed(3) }), "ok", 6000);
  return r;
}

export async function groundPour(app) {
  const pcb = app.store.project.pcb;
  const nets = boardNets(pcb);
  if (!nets.length) { toast(t("The board has no nets yet. Update the PCB from the schematic first."), "warn"); return; }
  const opts = { net: app.defaultZoneNet(), top: true, bottom: true, replace: true };
  const body = h("div", { class: "form-grid" },
    field(t("Net"), select(opts.net, nets.map((n) => [n, n]), { onChange: (v) => { opts.net = v; } })),
    field(t("Layers"), h("div", { style: { display: "flex", gap: "14px" } }, checkbox(true, "F.Cu", { onChange: (v) => { opts.top = v; } }), checkbox(true, "B.Cu", { onChange: (v) => { opts.bottom = v; } }))),
    h("div", { class: "span2" }, checkbox(true, t("Replace existing zones of this net"), { onChange: (v) => { opts.replace = v; } })));
  const ok = await modal({ title: t("Fill board with ground zone"), width: 460, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("Create"), value: true, primary: true }] });
  if (!ok) return;
  app.store.edit(t("Ground pour"), (p) => {
    const pts = insetPolygon(p.pcb.outline, p.pcb.rules.edgeClearance + 0.2);
    if (opts.replace) p.pcb.zones = p.pcb.zones.filter((z) => z.net !== opts.net);
    for (const [on, layer] of [[opts.top, "F.Cu"], [opts.bottom, "B.Cu"]]) if (on) p.pcb.zones.push({ id: uid("z"), layer, net: opts.net, pts, clearance: 0.3, thermal: true, priority: 0 });
  });
  toast(t("Ground zone created. Unrouted {net} pads inside it are now connected through the pour.", { net: opts.net }), "ok", 4500);
}

export async function cleanupTracks(app) {
  const { cleanupTracks: clean } = await import("../pcb/cleanup.js");
  let r;
  app.store.edit(t("Clean up tracks"), (p) => { r = clean(p); if (!r.removed && !r.merged) return false; return true; });
  toast(t("Clean-up: {r} removed, {m} merged.", { r: r.removed, m: r.merged }), "ok");
}

export function arrange(app) {
  app.store.edit(t("Arrange footprints"), (p) => arrangeFootprints(p.pcb));
  app.pcb.zoomFit();
}

// ---------------------------------------------------------------- recent / export / samples
export function recentPicker(app) {
  quickPick({
    items: (app.settings.recent || []).map((r) => ({ label: r.title || r.path.split(/[\\/]/).pop(), detail: r.path, icon: "file", r })),
    title: t("Open recent ▸"), placeholder: t("Open a recent project"),
    onPick: (it) => app.openPath(it.r.path),
  });
}

export function exportPicker(app) {
  const ids = ["file.exportSchSvg", "file.exportSchPng", "file.exportPcbSvg", "file.exportNetlist", "file.exportSpice", "file.exportBom", "file.exportPnp", "file.fab", "file.export3d"];
  quickPick({ items: ids.map((id) => { const c = app.commands.get(id); return { label: t(c.label), icon: c.icon, id }; }), title: t("Export ▸"), placeholder: t("Export…"), onPick: (it) => app.run(it.id) });
}

let sampleIndex = null;
export async function loadSampleIndex() {
  if (sampleIndex) return sampleIndex;
  try {
    if (window.mycircuit && window.mycircuit.listSamples) sampleIndex = await window.mycircuit.listSamples();
    else sampleIndex = await (await fetch("sample/index.json", { cache: "no-store" })).json();
  } catch {
    sampleIndex = [];
  }
  return sampleIndex || [];
}

export async function loadSampleText(file) {
  if (window.mycircuit && window.mycircuit.readSample) return window.mycircuit.readSample(file);
  const r = await fetch(`sample/${encodeURIComponent(file)}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
}

export async function samplePicker(app) {
  const list = await loadSampleIndex();
  const ko = getLanguage() === "ko";
  quickPick({
    items: list.map((s) => ({ label: ko ? s.titleKo || s.title : s.title, detail: ko ? s.descriptionKo || s.description : s.description, icon: "sample", keywords: (s.tags || []).join(" "), s })),
    title: t("Open sample…"), placeholder: t("Open a sample project"),
    onPick: (it) => app.openSample(it.s.file),
  });
}

// ---------------------------------------------------------------- help
// Program information: icon + description on top, then every fact as a
// "category | value" row, aligned in two columns (no scrolling).
// Notes from an import, paged (no scrolling).
export function importReport(app, warnings) {
  const body = h("div", { class: "import-report" });
  body.append(h("p", { class: "muted" }, t("The import finished. These items were simplified or skipped:")));
  body.append(pager(warnings, 8, (w) => h("div", { class: "issue-row" }, w)));
  modal({ title: t("Import notes"), body, width: 640 });
}

export async function about(app, version) {
  let BUILD = { version, buildDate: "", commit: "", branch: "", dirty: false, author: "SHKWON", email: "knix008@naver.com" };
  try { BUILD = { ...BUILD, ...(await import("../buildinfo.js")).BUILD }; } catch { /* development without a build stamp */ }
  let threeRev = "";
  try { threeRev = (await import("../vendor/three/three.module.js")).REVISION; } catch { /* 3D not loaded */ }
  const desk = window.mycircuit || null;
  const v = (desk && desk.versions) || {};
  const syms = allSymbols().length;
  const fps = allFootprints().length;
  const when = BUILD.buildDate ? new Date(BUILD.buildDate).toLocaleString() : "—";
  const rows = [
    [t("Program"), `MyCircuit ${BUILD.version}`],
    [t("Build"), `${BUILD.commit || "—"}${BUILD.dirty ? " (+)" : ""} · ${BUILD.branch || "—"}`],
    [t("Build date"), when],
    [t("Author"), `${BUILD.author || "SHKWON"} (${BUILD.email || "knix008@naver.com"})`],
    [t("Edition"), platform.isDesktop ? t("Desktop") : t("Web")],
    [t("Operating system"), `${platform.platformName}${desk && desk.arch ? " · " + desk.arch : ""}`],
    [t("Runtime"), desk ? `Electron ${v.electron || "?"} · Chromium ${v.chrome || "?"} · Node.js ${v.node || "?"}` : navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 80)],
    [t("3D engine"), threeRev ? `three.js r${threeRev} (WebGL)` : "three.js"],
    [t("Library"), t("{s} symbols · {f} footprints", { s: syms, f: fps })],
    [t("File format"), ".mycircuit (JSON, v1)"],
    [t("Language / theme"), `${getLanguage() === "ko" ? "한국어" : "English"} · ${app.themeLabel ? app.themeLabel() : app.settings.theme}`],
    [t("License"), t("Freeware. 3D rendering by three.js (MIT licence).")],
  ];
  const body = h("div", { class: "about" },
    h("div", { class: "about-head" },
      h("img", { src: "assets/icon.png", width: 112, height: 112, alt: "", class: "about-icon" }),
      h("div", { class: "about-desc" },
        h("h2", {}, `MyCircuit ${BUILD.version}`),
        h("div", { class: "about-tagline" }, t("Electronic circuit design and 3D tool")),
        h("p", {}, t("An electronics design suite in one window: draw the schematic, lay out and route the printed circuit board, check it in 3D, simulate the circuit and write every manufacturing file.")),
        h("ul", { class: "about-features" },
          h("li", {}, t("Schematic: symbol library, multi-unit parts, multi-page and hierarchical sheets, buses, annotation and electrical rules check.")),
          h("li", {}, t("PCB: footprints, up to 6 copper layers, interactive and automatic routing, copper pours, length tuning, design rules check.")),
          h("li", {}, t("3D and simulation: a live 3D board with measurements in cm or inch, and DC / AC / transient simulation with probes.")),
          h("li", {}, t("Output: Gerber, drill, BOM, pick-and-place, PDF printing, STL / GLB, KiCad import; runs on the Web, Windows, macOS and Linux."))))),
    h("div", { class: "about-rows" }, ...rows.flatMap(([k, val]) => [h("span", { class: "about-key" }, k), h("span", { class: "about-val" }, val)])));
  modal({ title: t("About MyCircuit"), width: 760, body, buttons: [{ label: t("Copy information"), value: "copy", left: true }, { label: t("Close"), value: null, primary: true }] }).then(async (r) => {
    if (r === "copy") {
      await navigator.clipboard.writeText(rows.map(([k, val]) => `${k}: ${val}`).join("\n")).catch(() => {});
      toast(t("Copied to clipboard"), "ok");
    }
  });
}

const SHORTCUTS = [
  ["General", [["Ctrl+K", "Command palette — search every command, part and net"], ["Ctrl+N / Ctrl+O / Ctrl+S", "New / open / save"], ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+F", "Find"], ["Ctrl+P", "Print"], ["F1", "User manual"], ["F2 / F3 / F4 / F6", "Schematic / PCB / 3D / Simulation"], ["F5", "Run simulation"], ["F8", "Update PCB from schematic"], ["Home", "Zoom to fit"], ["Wheel / Ctrl+wheel", "Zoom"], ["Drag empty canvas, middle/right-drag, Space+drag", "Move the view (pan)"], ["Shift+drag", "Box selection"], ["Esc", "Leave hand (pan) mode"], ["Ctrl+1 / Ctrl+2", "Toggle side panels"]]],
  ["Schematic", [["A", "Add part"], ["P", "Power port"], ["W", "Wire"], ["B", "Bus"], ["L / Ctrl+L", "Net label / global label"], ["Q", "No-connect flag"], ["J", "Junction"], ["T", "Text"], ["H / S", "Hierarchical label / sheet"], ["M / D", "Measure / dimension"], ["R", "Rotate"], ["Y / X", "Mirror horizontally / vertically"], ["E or double-click", "Edit properties"], ["Ctrl+C / Ctrl+V / Ctrl+D", "Copy / paste / duplicate"], ["Del", "Delete"], ["Arrows", "Nudge by one grid step"], ["/", "While wiring: switch corner direction"], ["Backspace", "While wiring: undo last corner"], ["Alt+drag", "Move without dragging wires"]]],
  ["PCB", [["X", "Route track"], ["V", "Via (while routing: add via and change layer)"], ["W / Shift+W", "While routing: wider / narrower track"], ["/", "While routing: switch 45° corner style"], ["Z", "Copper zone"], ["O", "Board outline (drag for a rectangle)"], ["T", "Text"], ["G", "Graphic line"], ["M", "Measure"], ["D", "Dimension"], ["R / Shift+R", "Rotate CCW / CW"], ["F", "Flip to the other side"], ["L", "Lock / unlock"], ["H", "High-contrast layers"], ["PgUp / PgDn", "Change active layer"], ["Ctrl+Shift+A", "Autoroute"], ["Double-click track", "Select whole connection"]]],
  ["3D", [["Left-drag", "Orbit"], ["Right-drag", "Pan"], ["Wheel", "Zoom"], ["P", "Pan mode: left-drag moves the view"], ["Arrows / Shift+arrows", "Rotate / pan"], ["G / A", "Grid / axes"], ["Double-click", "Fly to point"], ["1–7", "Iso / top / bottom / front / back / left / right"], ["C", "Toggle components"]]],
];

export function shortcuts() {
  const body = h("div", { class: "help-body", style: { columns: "2 360px", columnGap: "28px" } });
  for (const [group, rows] of SHORTCUTS) {
    body.append(h("h3", {}, t(group)));
    const tbl = h("table", {});
    for (const [k, d] of rows) tbl.append(h("tr", {}, h("td", {}, h("kbd", {}, k)), h("td", {}, t(d))));
    body.append(tbl);
  }
  modal({ title: t("Keyboard shortcuts"), width: 900, body });
}

// The manual is a long document: it opens in its own window (desktop) or a
// new browser tab (web) rather than in a popup.
export function manual() {
  const ko = getLanguage() === "ko";
  if (window.mycircuit && window.mycircuit.openManual) { window.mycircuit.openManual(ko ? "ko" : "en"); return; }
  window.open(ko ? "docs/USERSGUIDE.ko.html" : "docs/USERSGUIDE.en.html", "_blank", "noopener");
}

export async function showSpice(app) {
  const { toSpiceNetlist } = await import("../sim/engine.js");
  const text = toSpiceNetlist(app.store.project);
  const ta = h("textarea", { class: "input wide", rows: 22, readonly: true }, text);
  const r = await modal({ title: t("SPICE netlist"), width: 720, body: ta, buttons: [{ label: t("Copy"), value: "copy" }, { label: t("Save…"), value: "save" }, { label: t("Close"), value: null, primary: true }] });
  if (r === "copy") { await navigator.clipboard.writeText(text).catch(() => {}); toast(t("Copied to clipboard"), "ok"); }
  if (r === "save") app.run("file.exportSpice");
}

export function showWelcome(app) {
  const steps = [
    ["resistor", t("1. Draw the schematic"), t("Press A (or drag from the library on the left) to place parts, W to wire pins together, P for power symbols. ERC runs live; problems appear on the right.")],
    ["updatePcb", t("2. Send it to the board"), t("Press F8. Footprints appear next to the board with airwires (ratsnest) showing what must be connected.")],
    ["route", t("3. Lay out and route"), t("Drag parts onto the board, press X to route tracks (or Autoroute), Z for copper zones. Run DRC to check.")],
    ["cube", t("4. Check it in 3D, simulate, manufacture"), t("F4 shows the board in 3D, F5 simulates the circuit, File → Fabrication outputs writes Gerber and drill files in one zip.")],
  ];
  const body = h("div", {},
    h("p", { style: { marginTop: 0, lineHeight: 1.6 } }, t("MyCircuit takes you from idea to manufacturable board. Everything is searchable with Ctrl+K, and every tool shows a hint at the bottom of the canvas.")),
    ...steps.map(([ic, title, text]) => h("div", { class: "action-card", style: { cursor: "default", marginBottom: "8px" } }, h("span", { class: "ai", html: icon(ic, 18) }), h("div", {}, h("b", {}, title), h("small", {}, text)))));
  modal({
    title: t("Welcome to MyCircuit 10.0"), width: 640, body,
    buttons: [{ label: t("Open a sample"), value: "sample" }, { label: t("Start a new project"), value: "new" }, { label: t("Watch the tutorial"), value: "tutorial" }, { label: t("Got it"), value: "ok", primary: true }],
  }).then((r) => {
    app.settings.onboarded = true;
    app.saveSettings();
    if (r === "sample") samplePicker(app);
    if (r === "new") app.newProject();
    if (r === "tutorial") app.openTutorial({ autoplay: true });
  });
}

export { routingStats };
