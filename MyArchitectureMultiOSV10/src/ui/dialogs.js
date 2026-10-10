// Dialogs: themes, furniture picker, properties, settings, defaults, CAD
// layers, schedules, find, history, samples, help and About. Import/export
// and printing live in exports.js.

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, toast, quickPick, field, input, select, checkbox, tabs, confirmDialog, pager, stepper } from "./widgets.js";
import * as platform from "./platform.js";
import { allFurniture, furnitureDef, normalizeLight } from "../lib/furniture.js";
import { materialsFor } from "../lib/materials.js";
import { levelById, wallLength, DEFAULTS, openingTags } from "../core/project.js";
import { roomArea } from "../core/rooms.js";
import { roomSchedule, openingSchedule, levelSummary, projectTotals, toCSV, wallTypeSchedule, costEstimate } from "../core/schedule.js";
import { uid } from "../core/geom.js";
import { CHECKS } from "../core/check.js";
import { furnitureThumb } from "./panels.js";
import { THEMES, uiTokens, allThemes, setCustomThemes } from "./themes.js";

// ---------------------------------------------------------------- themes
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

// Theme dropdown under the palette button: dark, light and custom themes.
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
    h("p", { class: "field-hint span2" }, t("Changes are previewed on the whole program. The plan canvas follows the theme too.")));
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

// ---------------------------------------------------------------- furniture picker
export function furniturePicker(app) {
  const recent = app.settings.recentFurniture || [];
  const items = allFurniture().map((d) => ({ label: t(d.name), detail: `${t(d.cat)} · ${d.w} × ${d.d} × ${d.h} mm`, keywords: `${d.kind} ${d.name} ${d.cat}`, def: d }));
  items.sort((a, b) => (recent.indexOf(b.def.kind) + 1 ? 100 - recent.indexOf(b.def.kind) : 0) - (recent.indexOf(a.def.kind) + 1 ? 100 - recent.indexOf(a.def.kind) : 0));
  for (const m of app.store.project.models) items.push({ label: m.name, detail: `${t("Imported 3D model")} · ${m.size.map(Math.round).join(" × ")} mm`, keywords: m.format, model: m, icon: "model3d" });
  quickPick({
    items, title: t("Furniture"), placeholder: t("Furniture — type a name (sofa, bed, sink, car …)"),
    render: (row, it) => { if (it.def) row.prepend(furnitureThumb(it.def.kind, 48, 36, app.themeName())); },
    onPick: (it) => {
      app.setTab("plan");
      if (it.model) app.plan.setTool("furniture", { kind: "model", model: it.model.id });
      else app.plan.setTool("furniture", { kind: it.def.kind });
      app.plan.canvas.focus();
    },
  });
}

// ---------------------------------------------------------------- properties
const matOpts = (use) => materialsFor(use).map((m) => [m.id, t(m.name)]);

function numField(label, obj, key, { step = 10, min = 0, max = Infinity, unit = "mm" } = {}) {
  return field(label, stepper(+obj[key] || 0, { step, min, max, editable: true, format: (v) => `${Math.round(v * 10) / 10}${unit ? " " + unit : ""}`, onChange: (v) => { obj[key] = v; } }));
}

// Full properties dialog for one item; edits a draft and applies it in one step.
export async function itemProperties(app, kind, obj) {
  const p = app.store.project;
  const draft = JSON.parse(JSON.stringify(obj));
  let body;
  let title = t("Properties");
  if (kind === "walls") {
    title = t("Wall properties");
    draft.length = wallLength(obj);
    draft.heightValue = obj.height || (levelById(p, obj.level) || {}).height || DEFAULTS.wallHeight;
    draft.levelHeight = !obj.height;
    body = h("div", { class: "form-grid" },
      numField(t("Length"), draft, "length", { min: 10 }),
      numField(t("Thickness"), draft, "thickness", { min: 10 }),
      numField(t("Height"), draft, "heightValue", { step: 50, min: 100 }),
      field(t("Height"), checkbox(draft.levelHeight, t("Same as the level height"), { onChange: (v) => { draft.levelHeight = v; } })),
      field(t("Material"), select(draft.material || "plaster", matOpts("wall"), { onChange: (v) => { draft.material = v; } })));
  } else if (kind === "openings") {
    title = obj.kind === "window" ? t("Window properties") : t("Door properties");
    body = h("div", { class: "form-grid" },
      field(t("Kind"), select(draft.kind, [["door", t("Door")], ["window", t("Window")], ["opening", t("Opening")]], { onChange: (v) => { draft.kind = v; } })),
      field(t("Type"), select(draft.type, [["single", t("Single")], ["double", t("Double")], ["sliding", t("Sliding")], ["garage", t("Garage")], ["casement", t("Casement")], ["fixed", t("Fixed")]], { onChange: (v) => { draft.type = v; } })),
      numField(t("Width"), draft, "width", { step: 50, min: 200 }),
      numField(t("Height"), draft, "height", { step: 50, min: 200 }),
      numField(t("Sill height"), draft, "sill", { step: 50 }),
      numField(t("Position"), draft, "at", { step: 50 }),
      field(t("Swing side"), select(String(draft.side || 1), [["1", t("Left of the wall")], ["-1", t("Right of the wall")]], { onChange: (v) => { draft.side = +v; } })),
      field(t("Hinge"), select(draft.hinge || "start", [["start", t("At the wall start")], ["end", t("At the wall end")]], { onChange: (v) => { draft.hinge = v; } })),
      field(t("Tag"), input(draft.tag || openingTags(p).get(obj.id), { onInput: (v) => { draft.tag = v.trim() || undefined; } })));
  } else if (kind === "rooms") {
    title = t("Room properties");
    const names = ["Living room", "Bedroom", "Kitchen", "Dining room", "Bathroom", "Toilet", "Hall", "Entrance", "Study", "Utility room", "Storage", "Dressing room", "Balcony", "Garage", "Office", "Meeting room", "Corridor", "Stairs"].map((n) => t(n));
    const nameEl = input(draft.name, { onInput: (v) => { draft.name = v; }, list: "room-names" });
    body = h("div", { class: "form-grid" },
      h("div", { class: "span2" }, field(t("Name"), nameEl), h("datalist", { id: "room-names" }, ...names.map((n) => h("option", { value: n })))),
      field(t("Floor"), select(draft.floor || "oak", matOpts("floor"), { onChange: (v) => { draft.floor = v; } })),
      field(t("Area"), h("div", { class: "input", style: { display: "flex", alignItems: "center" } }, `${(roomArea(obj) / 1e6).toFixed(2)} m²`)),
      numField(t("Text size"), draft, "textSize", { step: 20, min: 50 }),
      field(t("Options"), checkbox(draft.showArea !== false, t("Show area"), { onChange: (v) => { draft.showArea = v; } })));
    if (!draft.textSize) draft.textSize = 260;
  } else if (kind === "furniture") {
    const def = furnitureDef(obj.kind);
    title = def ? t(def.name) : obj.name || t("Furniture");
    body = h("div", { class: "form-grid" },
      field(t("Name"), input(draft.name || "", { placeholder: def ? t(def.name) : "", onInput: (v) => { draft.name = v || undefined; } })),
      field(t("Kind"), select(draft.kind, [...allFurniture().map((d) => [d.kind, t(d.name)]), ...(obj.kind === "model" ? [["model", t("Imported 3D model")]] : [])], { onChange: (v) => { draft.kind = v; const d = furnitureDef(v); if (d) { draft.w = d.w; draft.d = d.d; draft.h = d.h; } } })),
      numField(t("Width"), draft, "w", { min: 10 }), numField(t("Depth"), draft, "d", { min: 10 }), numField(t("Height"), draft, "h", { min: 1 }),
      numField(t("Elevation"), draft, "elevation", { min: -100000 }), numField(t("Rotation"), draft, "rot", { step: 15, min: -360, max: 360, unit: "°" }),
      field(t("Colour"), h("input", { type: "color", class: "input", value: draft.color || "#8a9bb0", oninput: (e) => { draft.color = e.target.value; } })));
  } else if (kind === "stairs") {
    title = t("Stair properties");
    body = h("div", { class: "form-grid" }, numField(t("Steps"), draft, "steps", { step: 1, min: 2, unit: "" }), numField(t("Width"), draft, "width", { step: 50, min: 300 }), numField(t("Length"), draft, "length", { step: 50, min: 300 }), numField(t("Rotation"), draft, "rot", { step: 15, min: -360, max: 360, unit: "°" }),
      field(t("Material"), select(draft.material || "oak", matOpts("floor"), { onChange: (v) => { draft.material = v; } })));
  } else if (kind === "roofs") {
    title = t("Roof properties");
    body = h("div", { class: "form-grid" },
      field(t("Shape"), select(draft.kind, [["gable", t("Gable")], ["hip", t("Hip")], ["shed", t("Shed")], ["flat", t("Flat")]], { onChange: (v) => { draft.kind = v; } })),
      numField(t("Pitch"), draft, "pitch", { step: 5, max: 75, unit: "°" }), numField(t("Overhang"), draft, "overhang", { step: 50 }), numField(t("Thickness"), draft, "thickness", { min: 20 }),
      field(t("Material"), select(draft.material || "roof-tiles", matOpts("roof"), { onChange: (v) => { draft.material = v; } })));
  } else if (kind === "columns") {
    title = t("Column properties");
    body = h("div", { class: "form-grid" }, field(t("Shape"), select(draft.shape, [["rect", t("Rectangular")], ["round", t("Round")]], { onChange: (v) => { draft.shape = v; } })),
      numField(t("Width"), draft, "w", { min: 20 }), numField(t("Depth"), draft, "d", { min: 20 }), numField(t("Rotation"), draft, "rot", { step: 15, min: -360, max: 360, unit: "°" }));
  } else if (kind === "texts") {
    title = t("Text");
    const ta = h("textarea", { class: "input wide", rows: 4 }, draft.text);
    ta.addEventListener("input", () => { draft.text = ta.value; });
    body = h("div", {}, ta, h("div", { class: "form-grid", style: { marginTop: "10px" } }, numField(t("Size"), draft, "size", { min: 10 }), numField(t("Rotation"), draft, "rot", { step: 15, min: -360, max: 360, unit: "°" })));
  } else {
    app.plan.select([obj.id]);
    toast(t("Edit it on the right."), "info", 1500);
    return;
  }
  const ok = await modal({ title, width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return;
  app.store.edit(t("Edit properties"), (pr) => {
    if (kind === "walls") {
      const k = draft.length / (wallLength(obj) || 1);
      if (Math.abs(k - 1) > 1e-6) { obj.x2 = obj.x1 + (obj.x2 - obj.x1) * k; obj.y2 = obj.y1 + (obj.y2 - obj.y1) * k; }
      obj.thickness = Math.max(10, draft.thickness);
      obj.height = draft.levelHeight ? null : Math.max(100, draft.heightValue);
      obj.material = draft.material;
      void pr;
    } else {
      for (const [k, v] of Object.entries(draft)) if (k !== "id" && k !== "level" && k !== "wall") obj[k] = v;
      if (kind === "furniture") { obj.rot = ((obj.rot % 360) + 360) % 360; normalizeLight(obj); }
    }
  });
}

export async function levelProperties(app, lv) {
  if (!lv) return;
  const draft = { ...lv };
  const body = h("div", { class: "form-grid" },
    field(t("Name"), input(draft.name, { onInput: (v) => { draft.name = v; } })),
    numField(t("Elevation"), draft, "elevation", { step: 50, min: -100000 }),
    numField(t("Height"), draft, "height", { step: 50, min: 1000 }),
    numField(t("Floor slab"), draft, "slab", { step: 10 }),
    h("p", { class: "field-hint span2" }, t("Walls without their own height use the level height. Moving a level up or down moves everything on it in 3D.")));
  const ok = await modal({ title: t("Level properties"), width: 480, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return;
  app.store.edit(t("Level properties"), (p) => {
    Object.assign(lv, { name: draft.name.trim() || lv.name, elevation: draft.elevation, height: draft.height, slab: draft.slab });
    p.levels.sort((a, b) => a.elevation - b.elevation);
  });
}

export async function projectProperties(app) {
  const meta = { ...app.store.project.meta };
  const f = (k, label) => field(label, input(meta[k], { onInput: (v) => { meta[k] = v; } }));
  const body = h("div", { class: "form-grid" }, h("div", { class: "span2" }, f("title", t("Title"))), f("client", t("Client")), f("address", t("Address")), f("author", t("Drawn by")), f("company", t("Company")),
    f("rev", t("Revision")), f("date", t("Date")),
    field(t("Drawing scale"), select(String(meta.scale || 100), [20, 50, 100, 200, 500].map((s) => [String(s), `1:${s}`]), { onChange: (v) => { meta.scale = +v; } })),
    field(t("North"), stepper(meta.north || 0, { min: -180, max: 180, step: 5, format: (v) => `${v}°`, onChange: (v) => { meta.north = v; } })),
    field(t("Latitude"), stepper(+meta.latitude || 37.57, { min: -90, max: 90, step: 0.01, editable: true, format: (v) => `${(+v).toFixed(4)}°`, onChange: (v) => { meta.latitude = v; } })),
    field(t("Longitude"), stepper(+meta.longitude || 126.98, { min: -180, max: 180, step: 0.01, editable: true, format: (v) => `${(+v).toFixed(4)}°`, onChange: (v) => { meta.longitude = v; } })),
    field(t("Time zone (UTC+)"), stepper(meta.timezone ?? 9, { min: -12, max: 14, step: 0.5, format: (v) => `UTC${v >= 0 ? "+" : ""}${v}`, onChange: (v) => { meta.timezone = v; } })),
    field(t("Classification system"), input(meta.classificationSystem || "Uniclass 2015", { onInput: (v) => { meta.classificationSystem = v; } })),
    h("div", { class: "span2" }, f("comment", t("Comment"))));
  const ok = await modal({ title: t("Project properties"), width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (ok) app.store.edit(t("Project properties"), (p) => { p.meta = meta; });
}

// ---------------------------------------------------------------- BIM
const LAYER_FUNCTIONS = [["finish", "Finish"], ["insulation", "Insulation"], ["structure", "Structure"], ["air", "Air gap"]];
const layerMats = () => [...materialsFor("wall"), ...materialsFor("layer")].map((m) => [m.id, t(m.name)]);

// Wall types: a list on the left, the layers of the chosen type on the right.
export async function wallTypesDialog(app) {
  const p = app.store.project;
  const types = JSON.parse(JSON.stringify(p.wallTypes));
  let cur = 0;
  const left = h("div", { class: "wt-list" });
  const right = h("div", { class: "wt-edit" });
  const draw = () => {
    left.innerHTML = "";
    types.forEach((wt, i) => left.append(h("button", { class: `wt-row ${i === cur ? "on" : ""}`, onclick: () => { cur = i; draw(); } }, h("b", {}, wt.name), h("small", {}, `${wt.layers.reduce((s, l) => s + l.thickness, 0)} mm · ${t("{n} layers", { n: wt.layers.length })} · ${p.walls.filter((w) => w.type === wt.id).length} ${t("walls")}`))));
    left.append(h("div", { class: "prop-actions" },
      h("button", { class: "btn small", onclick: () => { types.push({ id: uid("wt"), name: `${t("Wall type")} ${types.length + 1}`, exterior: false, layers: [{ material: "concrete", thickness: 200, function: "structure" }] }); cur = types.length - 1; draw(); } }, h("span", { html: icon("plus", 12) }), t("New type")),
      h("button", { class: "btn small", onclick: () => { const c = JSON.parse(JSON.stringify(types[cur])); c.id = uid("wt"); c.name += ` (${t("copy")})`; types.push(c); cur = types.length - 1; draw(); } }, t("Duplicate")),
      h("button", { class: "btn small danger", disabled: types.length < 2 || p.walls.some((w) => w.type === types[cur].id), onclick: () => { types.splice(cur, 1); cur = 0; draw(); } }, t("Delete"))));
    right.innerHTML = "";
    const wt = types[cur];
    if (!wt) return;
    const nameEl = input(wt.name, { onInput: (v) => { wt.name = v; } });
    nameEl.addEventListener("change", draw);
    const tbl = h("table", { class: "grid" }, h("tr", {}, ...["#", "Function", "Material", "Thickness", ""].map((x) => h("th", {}, x === "#" || !x ? x : t(x)))));
    wt.layers.forEach((l, i) => {
      tbl.append(h("tr", {},
        h("td", {}, String(i + 1)),
        h("td", {}, select(l.function, LAYER_FUNCTIONS.map(([v, n]) => [v, t(n)]), { onChange: (v) => { l.function = v; } })),
        h("td", {}, select(l.material, layerMats(), { onChange: (v) => { l.material = v; } })),
        h("td", {}, stepper(l.thickness, { min: 1, max: 1000, step: 5, editable: true, format: (v) => `${v} mm`, onChange: (v) => { l.thickness = v; draw(); } })),
        h("td", {}, h("button", { class: "icon-btn", title: t("Move up"), disabled: i === 0, html: icon("arrowUp", 14), onclick: () => { [wt.layers[i - 1], wt.layers[i]] = [wt.layers[i], wt.layers[i - 1]]; draw(); } }),
          h("button", { class: "icon-btn", title: t("Delete"), disabled: wt.layers.length < 2, html: icon("trash", 14), onclick: () => { wt.layers.splice(i, 1); draw(); } }))));
    });
    // Section sketch of the layers, outside on the left.
    const sk = h("div", { class: "wt-sketch" }, ...wt.layers.map((l) => h("i", { title: `${t((materialsFor("wall").concat(materialsFor("layer")).find((m) => m.id === l.material) || { name: l.material }).name)} ${l.thickness} mm`, style: { flex: `${l.thickness} 0 0`, background: (materialsFor("wall").concat(materialsFor("layer")).find((m) => m.id === l.material) || { color: "#999" }).color } })));
    right.append(h("div", { class: "form-grid" }, field(t("Name"), nameEl), field(t("Use"), checkbox(wt.exterior, t("Exterior wall"), { onChange: (v) => { wt.exterior = v; } }))),
      h("div", { class: "prop-section" }, t("Layers (outside → inside) — total {t} mm", { t: wt.layers.reduce((s, l) => s + l.thickness, 0) })), sk, tbl,
      h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => { wt.layers.push({ material: "plaster", thickness: 15, function: "finish" }); draw(); } }, h("span", { html: icon("plus", 12) }), t("Add layer"))));
  };
  draw();
  const ok = await modal({ title: t("Wall types"), width: 900, body: h("div", { class: "wt-dialog" }, left, right), buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return;
  app.store.edit(t("Wall types"), (pr) => {
    pr.wallTypes = types;
    for (const w of pr.walls) {
      const wt = types.find((x) => x.id === w.type);
      if (wt) w.thickness = wt.layers.reduce((s, l) => s + l.thickness, 0);
    }
  });
}

// Free BIM properties of the selected elements (key → value), shared edit.
export async function bimPropertiesDialog(app) {
  const items = app.plan.selectedItems().filter((i) => i.kind !== "drawings" && i.kind !== "texts" && i.kind !== "dimensions" && i.kind !== "underlays");
  if (!items.length) { toast(t("Select one or more elements first."), "warn"); return; }
  const first = items[0].obj;
  const rows = Object.entries(first.props || {}).map(([k, v]) => ({ k, v: String(v) }));
  const preset = ["FireRating", "AcousticRating", "ThermalTransmittance", "LoadBearing", "Manufacturer", "Model", "Cost", "Mark", "Comments"];
  const list = h("div", {});
  const draw = () => {
    list.innerHTML = "";
    const tbl = h("table", { class: "grid" }, h("tr", {}, h("th", {}, t("Property")), h("th", {}, t("Value")), h("th", {}, "")));
    rows.forEach((r, i) => {
      const key = input(r.k, { list: "bim-keys", onInput: (v) => { r.k = v; } });
      const val = input(r.v, { onInput: (v) => { r.v = v; } });
      for (const el of [key, val]) el.addEventListener("keydown", (e) => e.stopPropagation());
      tbl.append(h("tr", {}, h("td", {}, key), h("td", {}, val), h("td", {}, h("button", { class: "icon-btn", title: t("Delete"), html: icon("trash", 14), onclick: () => { rows.splice(i, 1); draw(); } }))));
    });
    list.append(tbl, h("datalist", { id: "bim-keys" }, ...preset.map((k) => h("option", { value: k }))));
  };
  draw();
  const body = h("div", {},
    h("p", { class: "field-hint" }, items.length > 1 ? t("The properties are written to all {n} selected elements.", { n: items.length }) : t("Exported to IFC as the property set MyArchitecture_Properties.")),
    list, h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => { rows.push({ k: "", v: "" }); draw(); } }, h("span", { html: icon("plus", 12) }), t("Add property"))));
  const ok = await modal({ title: t("BIM properties"), width: 620, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return;
  const props = {};
  for (const r of rows) {
    const k = r.k.trim();
    if (!k) continue;
    const v = r.v.trim();
    props[k] = v === "true" ? true : v === "false" ? false : v !== "" && Number.isFinite(+v) ? +v : v;
  }
  app.store.edit(t("BIM properties"), () => { for (const i of items) { if (Object.keys(props).length) i.obj.props = { ...props }; else delete i.obj.props; } });
}

// Sizes the project uses for new walls, doors, windows …
export async function defaultsDialog(app) {
  const s = app.settings;
  const d = app.store.project.defaults;
  const draft = { wallThickness: +s.wallThickness || d.wallThickness, doorWidth: +s.doorWidth || d.doorWidth, doorHeight: +s.doorHeight || d.doorHeight, windowWidth: +s.windowWidth || d.windowWidth, windowHeight: +s.windowHeight || d.windowHeight, windowSill: +s.windowSill || d.windowSill, stairWidth: +s.stairWidth || d.stairWidth, textSize: +s.textSize || d.textSize };
  const body = h("div", { class: "form-grid" },
    numField(t("Wall thickness"), draft, "wallThickness"), numField(t("Stair width"), draft, "stairWidth", { step: 50 }),
    numField(t("Door width"), draft, "doorWidth", { step: 50 }), numField(t("Door height"), draft, "doorHeight", { step: 50 }),
    numField(t("Window width"), draft, "windowWidth", { step: 50 }), numField(t("Window height"), draft, "windowHeight", { step: 50 }),
    numField(t("Window sill"), draft, "windowSill", { step: 50 }), numField(t("Text size"), draft, "textSize"),
    field(t("Door type"), select(s.doorType || "single", [["single", t("Single")], ["double", t("Double")], ["sliding", t("Sliding")]], { onChange: (v) => { draft.doorType = v; } })),
    field(t("Window type"), select(s.windowType || "casement", [["casement", t("Casement")], ["fixed", t("Fixed")], ["sliding", t("Sliding")]], { onChange: (v) => { draft.windowType = v; } })),
    field(t("Wall material"), select(s.wallMaterial || "plaster", matOpts("wall"), { onChange: (v) => { draft.wallMaterial = v; } })),
    field(t("Floor material"), select(s.floorMaterial || "oak", matOpts("floor"), { onChange: (v) => { draft.floorMaterial = v; } })));
  const ok = await modal({ title: t("Default sizes"), width: 600, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return;
  Object.assign(app.settings, draft);
  app.saveSettings();
  toast(t("New walls, doors and windows use these sizes."), "ok");
}

export async function layersDialog(app) {
  const p = app.store.project;
  const draft = p.layers.map((l) => ({ ...l, count: p.drawings.filter((d) => d.layer === l.id).length }));
  const body = pager(draft, 10, (slice) => {
    const tbl = h("table", { class: "grid" }, h("tr", {}, ...["", "Layer", "Colour", "Items", ""].map((x) => h("th", {}, x ? t(x) : ""))));
    for (const l of slice) {
      const vis = h("input", { type: "checkbox" });
      vis.checked = l.visible !== false;
      vis.addEventListener("change", () => { l.visible = vis.checked; });
      const col = h("input", { type: "color", value: l.color || "#9aa4b5", style: { width: "36px", height: "22px", border: 0, padding: 0, background: "none" } });
      col.addEventListener("input", () => { l.color = col.value; });
      const del = h("button", { class: "btn small", disabled: l.count > 0 || l.id === "0", onclick: () => { l.deleted = true; del.closest("tr").style.opacity = 0.35; } }, t("Delete"));
      tbl.append(h("tr", {}, h("td", {}, vis), h("td", {}, l.name), h("td", {}, col), h("td", { class: "num" }, l.count), h("td", {}, del)));
    }
    return tbl;
  });
  const ok = await modal({ title: t("CAD layers"), width: 560, body: h("div", {}, h("p", { class: "field-hint" }, t("Layers hold imported DXF/SVG drawings and lines drawn with the Line tool.")), body), buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return;
  app.store.edit(t("CAD layers"), (pr) => { pr.layers = draft.filter((l) => !l.deleted).map(({ count, deleted, ...l }) => l); });
}

// ---------------------------------------------------------------- settings
export const SETTING_DEFAULTS = {
  units: "mm", startup: "start", autosave: true, autosaveSeconds: 30, recentLimit: 10, showWelcome: false,
  uiScale: 1, animations: true, showHints: true, hintSeconds: 7,
  planGrid: 100, gridStyle: "lines", showGrid: true, showRulers: true, snap: true, ortho: true, emptyDrag: "pan", crossProbe: true, liveCheck: true, zoomSpeed: 1,
  wallStyle: "solid", showDims: true, showFurniture: true, showAreas: true, showGhost: true, showTags: true, showRoofs: true, showUnderlays: true, showDrawings: true,
  shadows: true, background3d: "gradient", units3d: "m", fov3d: 45, rotateSpeed3d: 1, grid3d: true, ground3d: true, sunAzimuth: 135, sunAltitude: 45,
  defaultPaper: "A3", roofKind: "gable",
};

export async function settingsDialog(app) {
  const s = { ...SETTING_DEFAULTS, ...app.settings };
  const sel = (k, opts, num = false) => select(String(s[k]), opts.map((o) => (Array.isArray(o) ? [String(o[0]), o[1]] : [String(o), String(o)])), { onChange: (v) => { s[k] = num ? +v : v; } });
  const chk = (k, label) => checkbox(s[k] !== false, label, { onChange: (v) => { s[k] = v; } });
  const num = (k, o) => { const el = stepper(s[k], { ...o, onChange: (v) => { s[k] = v; } }); el.dataset.setting = k; return el; };
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
    field(t("Animations"), chk("animations", t("Animate dialogs, menus and the start page"))),
    field(t("Hints"), chk("showHints", t("Show tool hints on the canvas"))),
    field(t("Hint duration"), num("hintSeconds", { values: [0, 3, 5, 7, 10, 15, 30], format: (v) => (v ? `${v} s` : t("Always")) })),
  );
  const unitsGrid = h("div", { class: "form-grid" },
    field(t("Units"), sel("units", [["mm", "mm"], ["cm", "cm"], ["m", "m"], ["ft", t("feet / inches")]])),
    field(t("Grid"), num("planGrid", { values: [10, 25, 50, 100, 250, 500, 1000], format: (v) => `${v} mm` })),
    field(t("Grid style"), sel("gridStyle", [["lines", t("Lines (5 × 5)")], ["dots", t("Dots")]])),
    field(t("Grid"), chk("showGrid", t("Show grid"))),
    field(t("Rulers"), chk("showRulers", t("Show rulers on the canvas edges"))),
    field(t("Snapping"), chk("snap", t("Snap to the grid, wall ends and walls"))),
    field(t("Drawing"), chk("ortho", t("Walls in 45° steps (hold Shift for any angle)"))),
    field(t("Left-drag on empty canvas"), sel("emptyDrag", [["pan", t("Pan the view (Shift+drag = box select)")], ["select", t("Box select")]])),
    field(t("Wheel zoom speed"), num("zoomSpeed", { values: [0.5, 0.75, 1, 1.25, 1.5, 2, 3], format: (v) => `× ${v}` })),
  );
  const plan = h("div", { class: "form-grid" },
    field(t("Wall drawing"), sel("wallStyle", [["solid", t("Solid (poché)")], ["hatch", t("Hatched")], ["outline", t("Outline only")]])),
    field(t("Show"), h("div", { class: "check-col" }, chk("showDims", t("Dimensions")), chk("showFurniture", t("Furniture")), chk("showAreas", t("Room areas")), chk("showTags", t("Door and window tags")))),
    field(t("Show"), h("div", { class: "check-col" }, chk("showGhost", t("The level below (faint)")), chk("showRoofs", t("Roofs (dashed)")), chk("showUnderlays", t("Image underlays")), chk("showDrawings", t("CAD layers")))),
    field(t("Checks"), chk("liveCheck", t("Run the model check while drawing"))),
    field(t("Cross-selection"), chk("crossProbe", t("Selecting in the plan highlights it in 3D and back"))),
    field(t("New roofs"), sel("roofKind", [["gable", t("Gable")], ["hip", t("Hip")], ["shed", t("Shed")], ["flat", t("Flat")]])),
  );
  const view3d = h("div", { class: "form-grid" },
    field(t("3D background"), sel("background3d", [["gradient", t("Sky")], ["solid", t("Theme colour")]])),
    field(t("3D shadows"), chk("shadows", t("Sun shadows"))),
    field(t("Field of view"), num("fov3d", { min: 20, max: 90, step: 5, format: (v) => `${v}°` })),
    field(t("Rotate speed"), num("rotateSpeed3d", { values: [0.25, 0.5, 0.75, 1, 1.5, 2, 3], format: (v) => `× ${v}` })),
    field(t("3D measurement unit"), sel("units3d", [["m", t("Metres (m)")], ["ft", t("Feet (ft)")]])),
    field(t("Start with"), h("div", { class: "check-col" }, chk("grid3d", t("Grid with scale")), chk("ground3d", t("Ground")))),
    field(t("Sun azimuth"), num("sunAzimuth", { min: 0, max: 355, step: 5, format: (v) => `${v}°` })),
    field(t("Sun altitude"), num("sunAltitude", { min: 5, max: 90, step: 5, format: (v) => `${v}°` })),
  );
  const output = h("div", { class: "form-grid" },
    field(t("Default paper"), sel("defaultPaper", ["A4", "A3", "A2", "A1", "A0", "Letter", "Tabloid"])),
  );
  const ok = await modal({
    title: t("Settings"), width: 760, className: "settings-modal",
    body: tabs([
      { id: "g", label: t("General"), body: general }, { id: "a", label: t("Appearance"), body: appearance }, { id: "u", label: t("Units & grid"), body: unitsGrid },
      { id: "p", label: t("Floor plan"), body: plan }, { id: "v", label: t("3D view"), body: view3d }, { id: "o", label: t("Output"), body: output },
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

// ---------------------------------------------------------------- schedules
// opts.tab: the tab to open on ("r" rooms, "o" openings, "w" wall types, "l" levels, "c" cost).
export async function schedulesDialog(app, opts = {}) {
  const p = app.store.project;
  const rooms = roomSchedule(p);
  const openings = openingSchedule(p);
  const levels = levelSummary(p);
  const tot = projectTotals(p);
  const f2 = (v) => (+v).toFixed(2);
  const tbl = (cols, rows) => {
    const table = h("table", { class: "grid" }, h("tr", {}, ...cols.map(([, label]) => h("th", {}, label))));
    for (const r of rows) table.append(h("tr", {}, ...cols.map(([k, , fmt]) => h("td", { class: typeof r[k] === "number" ? "num" : "" }, fmt ? fmt(r[k]) : r[k]))));
    return table;
  };
  const roomCols = [["level", t("Level")], ["name", t("Room")], ["area", "m²", f2], ["perimeter", t("Perimeter (m)"), f2], ["floor", t("Floor"), (v) => t((materialsFor("floor").find((m) => m.id === v) || { name: v }).name)]];
  const openCols = [["tag", t("Tag")], ["kind", t("Kind"), (v) => t(v === "door" ? "Door" : v === "window" ? "Window" : "Opening")], ["type", t("Type"), (v) => t(v.charAt(0).toUpperCase() + v.slice(1))], ["level", t("Level")], ["width", t("Width")], ["height", t("Height")], ["sill", t("Sill height")]];
  const levelCols = [["level", t("Level")], ["elevation", t("Elevation")], ["walls", t("Walls")], ["wallLength", t("Wall length (m)"), f2], ["wallAreaNet", t("Wall area (m²)"), f2], ["rooms", t("Rooms")], ["roomArea", t("Room area (m²)"), f2], ["grossArea", t("Gross area (m²)"), f2], ["doors", t("Doors")], ["windows", t("Windows")]];
  const totalRow = h("p", { class: "field-hint" }, t("Total: {r} m² rooms, {g} m² gross floor area, {d} doors, {w} windows, {l} m of walls ({v} m³).", { r: tot.roomArea.toFixed(2), g: tot.grossArea.toFixed(2), d: tot.doors, w: tot.windows, l: tot.wallLength.toFixed(1), v: tot.wallVolume.toFixed(2) }));
  const wtypes = wallTypeSchedule(p);
  const wtCols = [["type", t("Wall type")], ["thickness", t("Thickness")], ["layers", t("Layers")], ["count", t("Walls")], ["length", t("Length (m)"), f2], ["area", t("Wall area (m²)"), f2]];
  // Cost estimate with editable unit prices (saved in the project).
  const costs = { ...p.costs };
  const costHost = h("div", {});
  const money = (v) => Math.round(v).toLocaleString();
  const costCols = [["item", t("Item"), (v) => t(v)], ["qty", t("Quantity"), (v) => (+v).toFixed(2)], ["unit", t("Unit"), (v) => t(v)], ["price", t("Unit price"), money], ["total", t("Amount"), money]];
  const drawCost = () => {
    costHost.innerHTML = "";
    const est = costEstimate({ ...p, costs });
    const priceField = (k, label) => field(label, stepper(costs[k] || 0, { min: 0, max: 1e9, step: 10000, editable: true, format: money, onChange: (v) => { costs[k] = v; drawCost(); } }));
    costHost.append(h("div", { class: "form-grid three" }, priceField("wall", t("Wall per m²")), priceField("floor", t("Floor per m²")), priceField("roof", t("Roof per m²")), priceField("door", t("Door each")), priceField("window", t("Window each")), priceField("opening", t("Opening each")), priceField("stair", t("Stair each")), priceField("column", t("Column each"))),
      tbl(costCols, est.lines), h("p", { class: "cost-total" }, t("Estimated total: {v} {c}", { v: money(est.total), c: est.currency })));
  };
  drawCost();
  const body = h("div", {}, tabs([
    { id: "r", label: t("Rooms"), body: rooms.length ? pager(rooms, 12, (s) => tbl(roomCols, s)) : h("div", { class: "empty-note" }, t("No rooms yet: press A and click inside walls.")) },
    { id: "o", label: t("Doors and windows"), body: openings.length ? pager(openings, 12, (s) => tbl(openCols, s)) : h("div", { class: "empty-note" }, t("No doors or windows yet.")) },
    { id: "w", label: t("Wall types"), body: tbl(wtCols, wtypes) },
    { id: "l", label: t("Levels"), body: tbl(levelCols, levels) },
    { id: "c", label: t("Cost estimate"), body: costHost },
  ]), totalRow);
  if (opts.tab) setTimeout(() => { const b = body.querySelector(`.tab[data-id="${opts.tab}"]`); if (b) b.click(); }, 0);
  const r = await modal({ title: t("Schedules and quantities"), width: 920, body, buttons: [{ label: t("Rooms CSV…"), value: "r", left: true }, { label: t("Doors & windows CSV…"), value: "o" }, { label: t("Wall types CSV…"), value: "w" }, { label: t("Cost CSV…"), value: "c" }, { label: t("Levels CSV…"), value: "l" }, { label: t("Close"), value: null, primary: true }] });
  if (JSON.stringify(costs) !== JSON.stringify(p.costs)) app.store.edit(t("Unit prices"), (pr) => { pr.costs = costs; });
  if (!r) return;
  const base = (p.meta.title || "project").replace(/[\\/:*?"<>|\s]+/g, "_");
  const csv = r === "r" ? toCSV(rooms, roomCols) : r === "o" ? toCSV(openings, openCols) : r === "w" ? toCSV(wtypes, wtCols) : r === "c" ? toCSV(costEstimate(p).lines, costCols) : toCSV(levels, levelCols);
  const name = `${base}-${{ r: "rooms", o: "openings", w: "wall-types", c: "cost", l: "levels" }[r]}.csv`;
  const saved = await platform.saveTextFile({ name, text: csv, filters: [{ name: "CSV", extensions: ["csv"] }] });
  if (saved) toast(t("Saved {name}", { name: saved.name }), "ok");
}

// ---------------------------------------------------------------- find / history
export function findDialog(app) {
  const p = app.store.project;
  const items = [];
  const lvName = (id) => (levelById(p, id) || {}).name || "";
  for (const r of p.rooms) items.push({ label: r.name || t("Room"), detail: `${t("Room")} · ${lvName(r.level)} · ${(roomArea(r) / 1e6).toFixed(1)} m²`, icon: "room", act: () => app.crossProbe([r.id], "plan") });
  const tags = openingTags(p);
  for (const o of p.openings) {
    const w = p.walls.find((x) => x.id === o.wall);
    items.push({ label: tags.get(o.id), detail: `${o.kind === "window" ? t("Window") : t("Door")} · ${o.width} × ${o.height} · ${w ? lvName(w.level) : ""}`, icon: o.kind === "window" ? "window" : "door", act: () => app.crossProbe([o.id], "plan") });
  }
  for (const f of p.furniture) { const d = furnitureDef(f.kind); items.push({ label: f.name || (d ? t(d.name) : f.kind), detail: `${t("Furniture")} · ${lvName(f.level)}`, icon: "sofa", act: () => app.crossProbe([f.id], "plan") }); }
  for (const tx of p.texts) items.push({ label: tx.text.split("\n")[0], detail: t("Text"), icon: "text", act: () => app.crossProbe([tx.id], "plan") });
  for (const lv of p.levels) items.push({ label: lv.name, detail: `${t("Level")} · ${(lv.elevation / 1000).toFixed(2)} m`, icon: "levels", act: () => { app.setTab("plan"); app.plan.setLevel(lv.id); } });
  quickPick({ items, title: t("Find…"), placeholder: t("Find a room, door, window, furniture or text…"), onPick: (it) => it.act() });
}

export function historyDialog(app) {
  const hst = app.store.history();
  const steps = hst.undo.slice().reverse().map((l, i) => ({ l, i }));
  const body = steps.length ? pager(steps, 12, (slice) => h("div", { class: "issue-list" }, ...slice.map(({ l, i }) => {
    const row = h("div", { class: "issue" }, h("span", { html: icon("undo", 14) }), h("div", {}, t(l), h("small", {}, i === 0 ? t("latest") : "")));
    row.addEventListener("click", () => { for (let k = 0; k <= i; k++) app.store.undo(); document.querySelector(".modal-backdrop")?.remove(); });
    return row;
  }))) : h("div", { class: "empty-note" }, t("Nothing to undo yet."));
  modal({ title: t("Undo history"), width: 420, body: h("div", {}, h("p", { class: "field-hint" }, t("Click a step to undo back to before it.")), body) });
}

// ---------------------------------------------------------------- recent / import / export / samples
// Recent files: open one, remove one, or clear the list (the files stay on disk).
export function recentPicker(app) {
  const body = h("div", { class: "recent-dialog" });
  let close = null;
  const draw = () => {
    body.innerHTML = "";
    const list = app.settings.recent || [];
    if (!list.length) { body.append(h("div", { class: "empty-note" }, t("No recent files."))); return; }
    for (const r of list) {
      body.append(h("div", { class: "recent-row" },
        h("button", { class: "recent-open", title: r.path, onclick: () => { if (close) close(null); app.openPath(r.path); } }, h("span", { html: icon("file", 15) }),
          h("span", { class: "rr-name" }, r.title || r.path.split(/[\\/]/).pop()), h("small", {}, `${r.path}  ·  ${new Date(r.at).toLocaleString()}`)),
        h("button", { class: "icon-btn", title: t("Remove from the list"), "data-remove": r.path, html: icon("close", 14), onclick: () => { app.removeRecent(r.path); draw(); } })));
    }
  };
  draw();
  modal({
    title: t("Recent files"), width: 720, body,
    buttons: [{ label: t("Clear list"), value: "clear", left: true, danger: true }, { label: t("Close"), value: null, primary: true }],
    onOpen: (_box, c) => { close = c; },
  }).then((v) => { if (v === "clear") { app.clearRecent(); toast(t("The recent files list was cleared."), "ok"); } });
}

export function importPicker(app) {
  const ids = ["file.import", "file.importDxf", "file.importIfc", "file.importBim", "file.importModel", "file.importSvg", "file.importImage"];
  quickPick({ items: ids.map((id) => { const c = app.commands.get(id); return { label: t(c.label), icon: c.icon, id }; }), title: t("Import ▸"), placeholder: t("Import…"), onPick: (it) => app.run(it.id) });
}

export function exportPicker(app) {
  const ids = ["file.exportDxf", "file.exportIfc", "file.export3d", "file.exportPdf", "file.exportSvg", "file.exportPng", "file.exportCsv"];
  quickPick({ items: ids.map((id) => { const c = app.commands.get(id); return { label: t(c.label), icon: c.icon, id }; }), title: t("Export ▸"), placeholder: t("Export…"), onPick: (it) => app.run(it.id) });
}

let sampleIndex = null;
export async function loadSampleIndex() {
  if (sampleIndex) return sampleIndex;
  try {
    if (window.myarch && window.myarch.listSamples) sampleIndex = await window.myarch.listSamples();
    else sampleIndex = await (await fetch("sample/index.json", { cache: "no-store" })).json();
  } catch {
    sampleIndex = [];
  }
  if (sampleIndex && !Array.isArray(sampleIndex)) sampleIndex = sampleIndex.samples || [];
  return sampleIndex || [];
}

export async function loadSampleText(file) {
  if (window.myarch && window.myarch.readSample) return window.myarch.readSample(file);
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

// Notes from an import, paged (popups never scroll).
export function importReport(app, title, lines) {
  const body = h("div", { class: "import-report" });
  body.append(h("p", { class: "muted" }, t("The import finished. Notes:")));
  body.append(pager(lines, 10, (s) => h("div", {}, ...s.map((w) => h("div", { class: "issue-row" }, w)))));
  modal({ title, body, width: 640 });
}

export function closedFormat(app, ext) {
  const msg = {
    skp: t("SketchUp files (.skp) are a closed format. In SketchUp use File → Export → 3D Model and choose Collada (.dae), OBJ or glTF, then import that."),
    rvt: t("Revit files (.rvt) are a closed format. Export IFC from Revit (File → Export → IFC) and import the IFC file — or export gbXML (File → Export → gbXML) for walls, openings and rooms."),
    pln: t("ArchiCAD files (.pln) are a closed format. Save as IFC in ArchiCAD and import the IFC file — gbXML exported by ArchiCAD can be imported too."),
    ifcxml: t("ifcXML (.ifcxml) is not read. Save or export the model as IFC (.ifc, STEP) or as a zipped .ifczip and import that."),
    "3dm": t("Rhino files (.3dm): export OBJ, STL or glTF from Rhino and import that."),
  }[ext];
  modal({ title: t("Format not supported"), width: 520, body: h("p", { class: "confirm-text" }, msg || t("This file type is not supported: .{ext}", { ext })), buttons: [{ label: t("Supported file formats…"), value: "f", left: true }, { label: t("OK"), value: null, primary: true }] })
    .then((r) => { if (r === "f") formatsDialog(app); });
}

export function phaseMenu(app, anchor) {
  import("./widgets.js").then(({ contextMenu }) => contextMenu([["all", "All phases"], ["new", "New design (no demolition)"], ["existing", "Existing (before works)"]].map(([v, l]) => ({ label: t(l), checked: (app.settings.phaseView || "all") === v, action: () => app.setPhaseView(v) })), anchor.x, anchor.y));
}

// ---------------------------------------------------------------- help
export const FORMATS = [
  ["MyArchitecture project", ".myarch", "✓", "✓", "Everything (JSON)"],
  ["AutoCAD DXF", ".dxf", "✓", "✓", "2D drawing; import as CAD layers, export with A-WALL/A-DOOR… layers (R12)"],
  ["AutoCAD DWG", ".dwg", "✓", "—", "2D drawing from AutoCAD R13 to 2025 (DWG R13–R2018); import as CAD layers like DXF"],
  ["IFC (BIM)", ".ifc", "✓", "✓", "IFC4 / IFC2X3: storeys, walls, doors, windows, spaces, slabs, roofs, stairs, columns, furniture"],
  ["IFC ZIP", ".ifczip", "✓", "—", "A zipped IFC file: read like .ifc (ifcXML is not read)"],
  ["Sweet Home 3D", ".sh3d", "✓", "—", "Sweet Home 3D 5.3+: levels, walls, doors, windows, rooms, furniture, stairs, dimensions, labels"],
  ["gbXML", ".gbxml .xml", "✓", "—", "Energy-model export of Revit, ArchiCAD, Vectorworks…: storeys, walls, doors, windows, spaces as rooms, roofs"],
  ["glTF / GLB", ".gltf .glb", "✓", "✓", "3D with materials (Blender, Unity, web)"],
  ["Wavefront OBJ (+MTL)", ".obj", "✓", "✓", "3D with materials (OBJ + MTL in a ZIP)"],
  ["STL", ".stl", "✓", "✓", "3D printing (geometry only)"],
  ["Collada", ".dae", "✓", "✓", "SketchUp, Blender, 3ds Max"],
  ["3MF", ".3mf", "✓", "✓", "3D printing with colours"],
  ["PLY", ".ply", "✓", "✓", "Point / mesh exchange"],
  ["USDZ", ".usdz", "—", "✓", "Apple AR Quick Look"],
  ["FBX", ".fbx", "✓", "—", "Autodesk models (furniture)"],
  ["3DS", ".3ds", "✓", "—", "3ds Max models"],
  ["VRML / AMF", ".wrl .amf", "✓", "—", "Older 3D formats"],
  ["SVG", ".svg", "✓", "✓", "2D vector drawing"],
  ["PDF", ".pdf", "—", "✓", "Drawing sheets with title block (print)"],
  ["PNG / JPG / WebP", ".png .jpg .webp", "✓", "✓", "Images: import as tracing underlay; export plan or 3D image"],
  ["CSV", ".csv", "—", "✓", "Room, door/window, wall type, cost and level schedules"],
  ["SKP / RVT / PLN", "", "—", "—", "Closed formats, not read directly: export IFC or gbXML from Revit / ArchiCAD, DAE or OBJ from SketchUp, DXF from CAD programs, and import that"],
];

export function formatsDialog() {
  const tbl = h("table", { class: "grid" }, h("tr", {}, ...["Format", "Extension", "Import", "Export", "Use"].map((x) => h("th", {}, t(x)))));
  for (const [name, ext, i, e, use] of FORMATS) tbl.append(h("tr", {}, h("td", {}, t(name)), h("td", {}, ext), h("td", {}, i), h("td", {}, e), h("td", {}, t(use))));
  modal({ title: t("Supported file formats"), width: 880, body: tbl });
}

export async function about(app, version) {
  let BUILD = { version, buildDate: "", commit: "", branch: "", dirty: false, author: "SHKWON", email: "knix008@naver.com" };
  try { BUILD = { ...BUILD, ...(await import("../buildinfo.js")).BUILD }; } catch { /* development without a build stamp */ }
  let threeRev = "";
  try { threeRev = (await import("../vendor/three/three.module.js")).REVISION; } catch { /* 3D not loaded */ }
  const desk = window.myarch || null;
  const v = (desk && desk.versions) || {};
  const when = BUILD.buildDate ? new Date(BUILD.buildDate).toLocaleString() : "—";
  const rows = [
    [t("Program"), `MyArchitecture ${BUILD.version}`],
    [t("Build"), `${BUILD.commit || "—"}${BUILD.dirty ? " (+)" : ""} · ${BUILD.branch || "—"}`],
    [t("Build date"), when],
    [t("Author"), `${BUILD.author || "SHKWON"} (${BUILD.email || "knix008@naver.com"})`],
    [t("Edition"), platform.isDesktop ? t("Desktop") : t("Web")],
    [t("Operating system"), `${platform.platformName}${desk && desk.arch ? " · " + desk.arch : ""}`],
    [t("Runtime"), desk ? `Electron ${v.electron || "?"} · Chromium ${v.chrome || "?"} · Node.js ${v.node || "?"}` : navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 80)],
    [t("3D engine"), threeRev ? `three.js r${threeRev} (WebGL)` : "three.js"],
    [t("Library"), t("{f} furniture items · {m} materials", { f: allFurniture().length, m: materialsFor("wall").length + materialsFor("floor").length + materialsFor("roof").length })],
    [t("File formats"), "MYARCH · DXF · DWG · IFC ·GLB/glTF · OBJ · STL · DAE · 3MF · PLY · FBX · 3DS · USDZ · SVG · PDF · PNG · CSV"],
    [t("Language / theme"), `${getLanguage() === "ko" ? "한국어" : "English"} · ${app.themeLabel ? app.themeLabel() : app.settings.theme}`],
    [t("License"), t("Freeware. 3D rendering by three.js (MIT licence).")],
  ];
  const body = h("div", { class: "about" },
    h("div", { class: "about-head" },
      h("img", { src: "assets/icon.png", width: 112, height: 112, alt: "", class: "about-icon" }),
      h("div", { class: "about-desc" },
        h("h2", {}, `MyArchitecture ${BUILD.version}`),
        h("div", { class: "about-tagline" }, t("Architectural drawing and 3D tool")),
        h("p", {}, t("Draw floor plans with walls, doors, windows, rooms, stairs and roofs, see the building in 3D at once, and exchange it with CAD, BIM and 3D programs.")),
        h("ul", { class: "about-features" },
          h("li", {}, t("Plan: walls with clean joins, doors and windows, automatic rooms and areas, levels, stairs, roofs, dimensions, furniture.")),
          h("li", {}, t("3D: sun and shadows, walk-through, section cut, elevations, white model and line drawing styles.")),
          h("li", {}, t("Exchange: DXF, IFC, glTF/GLB, OBJ, STL, Collada, 3MF, PLY, FBX, 3DS, USDZ, SVG, PDF, PNG and CSV schedules.")),
          h("li", {}, t("Runs on the Web, Windows, macOS and Linux; Korean and English, 40 themes."))))),
    h("div", { class: "about-rows" }, ...rows.flatMap(([k, val]) => [h("span", { class: "about-key" }, k), h("span", { class: "about-val" }, val)])));
  modal({ title: t("About MyArchitecture"), width: 760, body, buttons: [{ label: t("Copy information"), value: "copy", left: true }, { label: t("Close"), value: null, primary: true }] }).then(async (r) => {
    if (r === "copy") {
      await navigator.clipboard.writeText(rows.map(([k, val]) => `${k}: ${val}`).join("\n")).catch(() => {});
      toast(t("Copied to clipboard"), "ok");
    }
  });
}

const SHORTCUTS = [
  ["General", [["Ctrl+K", "Command palette — search every command, room and level"], ["Ctrl+N / Ctrl+O / Ctrl+S", "New / open / save"], ["Ctrl+Tab / Ctrl+Shift+Tab", "Next / previous document tab"], ["Ctrl+W", "Close the document tab"],["Ctrl+I", "Import (DXF, IFC, 3D models, images…)"], ["Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z)", "Undo / redo"], ["Ctrl+X / Ctrl+A", "Cut / select all"], ["Ctrl+F", "Find"], ["Ctrl+P", "Print / PDF"], ["Ctrl+,", "Settings"], ["Ctrl+/", "Keyboard shortcuts"], ["F1", "User manual"], ["F2 / F3 (F4)", "Floor plan / 3D view"], ["F5", "Model check"], ["F8 / F9", "Orthogonal drawing / snapping"], ["Home", "Zoom to fit"], ["Ctrl+1 / Ctrl+2", "Toggle side panels"]]],
  ["Floor plan", [["W", "Wall (click corners; type a length and Enter)"], ["A", "Room (click inside walls)"], ["D / N", "Door / window"], ["C", "Column"], ["S", "Stair"], ["F", "Furniture"], ["O", "Roof"], ["B / U", "Mass box / cylinder"], ["G", "Structural grid line"], ["K", "Dimension"], ["T", "Text"], ["L", "Line"], ["M", "Measure"], ["Ctrl+G / Ctrl+Shift+G", "Group / ungroup"], ["R / Shift+R", "Rotate 90° / back 15°"], ["X / Y", "Mirror (X also flips a door)"], ["H", "Swap door hinge"], ["E or double-click", "Edit properties"], ["Ctrl+C / Ctrl+V / Ctrl+D", "Copy / paste / duplicate"], ["Del", "Delete"], ["Arrows / Shift+arrows", "Nudge by one / ten grid steps"], ["Backspace", "While drawing: undo the last corner"], ["Shift", "While drawing: any angle"], ["Alt+drag", "Move without stretching joined walls"]]],
  ["Navigation", [["Wheel / Ctrl+wheel", "Zoom"], ["Shift+wheel", "Pan sideways"], ["Drag empty canvas, middle/right-drag, Space+drag", "Move the view (pan)"], ["Shift+drag", "Box selection (right-to-left: crossing)"], ["Esc", "Leave a tool / hand mode"]]],
  ["3D", [["Left-drag", "Orbit"], ["Right-drag", "Pan"], ["Wheel", "Zoom"], ["Double-click", "Zoom in on that point"], ["Arrows / Shift+arrows", "Orbit / pan"], ["1–7", "Iso / top / front / rear / left / right side / bird's eye"], ["P", "Pan mode"], ["V", "Walk through (WASD, Q/E up/down, drag to look)"], ["Q / E, PageDown / PageUp", "While walking: down / up"], ["O", "Orthographic projection"], ["X", "Section cut"], ["G", "Grid"], ["Esc", "Leave the tool or walk mode"]]],
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

export function manual() {
  const ko = getLanguage() === "ko";
  if (window.myarch && window.myarch.openManual) { window.myarch.openManual(ko ? "ko" : "en"); return; }
  window.open(ko ? "docs/USERSGUIDE.ko.html" : "docs/USERSGUIDE.en.html", "_blank", "noopener");
}

export function showWelcome(app) {
  const steps = [
    ["wall", t("1. Draw the walls"), t("Press W and click the corners (or type lengths like 4200 and Enter). Doors (D) and windows (N) snap onto the walls.")],
    ["room", t("2. Rooms, stairs, roof"), t("Press A and click inside walls: the room and its area appear. Add levels with the + on the left, stairs with S, the roof with Build → Roof over the top level.")],
    ["sofa", t("3. Furnish it"), t("Drag furniture from the library on the left, or import your own 3D models (OBJ, FBX, GLB, STL, DAE…).")],
    ["cube", t("4. See it in 3D and share it"), t("F3 shows the building in 3D with sun and shadows; walk through it. Export DXF, IFC, GLB, OBJ, PDF sheets and schedules.")],
  ];
  const body = h("div", {},
    h("p", { style: { marginTop: 0, lineHeight: 1.6 } }, t("MyArchitecture turns a floor plan into a 3D building as you draw. Everything is searchable with Ctrl+K, and every tool shows a hint at the bottom of the canvas.")),
    ...steps.map(([ic, title, text]) => h("div", { class: "action-card", style: { cursor: "default", marginBottom: "8px" } }, h("span", { class: "ai", html: icon(ic, 18) }), h("div", {}, h("b", {}, title), h("small", {}, text)))));
  modal({
    title: t("Welcome to MyArchitecture 10.0"), width: 640, body,
    buttons: [{ label: t("Open a sample"), value: "sample" }, { label: t("Start a new project"), value: "new" }, { label: t("Got it"), value: "ok", primary: true }],
  }).then((r) => {
    app.settings.onboarded = true;
    app.saveSettings();
    if (r === "sample") samplePicker(app);
    if (r === "new") app.newProject();
  });
}

export { CHECKS };
