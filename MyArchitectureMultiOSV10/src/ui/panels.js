// Side panels and the status bar.
//   left : plan → furniture library, imported models, CAD layers;
//          3D → view options (View3DTab.renderPanel)
//   right: plan → properties of the selection (every number is a − / + stepper)
//          and the model check issues; 3D → the picked object

import { t, getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h, panelHead, input, select, checkbox, stepper, toast } from "./widgets.js";
import { allFurniture, furnitureDef, drawFurniturePlan, drawLightSymbol, isLight, lightOf, FURNITURE_CATEGORIES } from "../lib/furniture.js";
import { switchLamps, temperatureOptions, temperatureOf, lampSummary } from "./lights.js";
import { materialsFor } from "../lib/materials.js";
import { levelById, wallLength, wallHeight, openingTags, levelAbove } from "../core/project.js";
import { roomArea, roomPerimeter } from "../core/rooms.js";
import { wallFrame } from "../core/walls.js";
import { fmtArea, fmtLen, dist } from "../core/geom.js";
import { PLAN_THEMES } from "../plan/render.js";
import { levelSummary } from "../core/schedule.js";
import { ifcGuid } from "../io/ifc.js";

const IFC_CLASS = { walls: "IfcWall", openings: "IfcDoor / IfcWindow", rooms: "IfcSpace", columns: "IfcColumn", stairs: "IfcStair", furniture: "IfcFurniture", roofs: "IfcRoof", grids: "IfcGrid", solids: "IfcBuildingElementProxy" };

// ---------------------------------------------------------------- previews
const thumbCache = new Map();

export function furnitureThumb(kind, w = 44, hgt = 36, themeName = "dark") {
  const key = `${kind}|${w}|${hgt}|${themeName}`;
  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const ctx = canvas.getContext("2d");
  if (thumbCache.has(key)) { ctx.drawImage(thumbCache.get(key), 0, 0); return canvas; }
  const def = furnitureDef(kind);
  if (!def) return canvas;
  const item = { kind, x: 0, y: 0, rot: 0, w: def.w, d: def.d, h: def.h };
  const s = Math.min((w * dpr * 0.84) / def.w, (hgt * dpr * 0.84) / def.d);
  ctx.setTransform(s, 0, 0, s, (w * dpr) / 2, (hgt * dpr) / 2);
  const th = { ...(PLAN_THEMES[themeName] || PLAN_THEMES.dark) };
  drawFurniturePlan(ctx, item, th, 1.2 / s);
  if (isLight(item)) drawLightSymbol(ctx, item, th, 1.2 / s);
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d").drawImage(canvas, 0, 0);
  thumbCache.set(key, copy);
  return canvas;
}

// ---------------------------------------------------------------- left panel
const libState = { query: "", category: "" };

export function renderLeft(app, host) {
  host.innerHTML = "";
  if (app.tab === "start") return undefined;
  if (!app.settings.showLeft) return rail(app, host, "left", app.tab === "3d" ? "cube" : "sofa", app.tab === "3d" ? t("3D view options") : t("Furniture library"));
  if (app.tab === "plan") renderLibrary(app, host);
  if (app.tab === "3d") app.v3d.renderPanel(host);
  addCollapse(app, host, "left");
  return undefined;
}

// The collapsed side panel: icon and vertical title; a click opens it again.
function rail(app, host, side, ic, title, badge = null) {
  host.append(h("button", { class: `side-rail ${side}`, title: t("Show {name}", { name: title }), "data-rail": side, onclick: () => app.run(side === "left" ? "view.left" : "view.right") },
    h("span", { class: "rail-ico", html: icon(side === "left" ? "chevronRight" : "chevronLeft", 14) }),
    h("span", { class: "rail-ico", html: icon(ic, 18) }),
    badge ? h("span", { class: `badge ${badge[1]}` }, String(badge[0])) : null,
    h("span", { class: "rail-title" }, title)));
}

function addCollapse(app, host, side) {
  const head = host.querySelector(".panel-head");
  if (!head) return;
  head.append(h("button", { class: "icon-btn collapse-btn", title: t("Hide the panel"), "data-collapse": side, html: icon(side === "left" ? "chevronLeft" : "chevronRight", 14), onclick: () => app.run(side === "left" ? "view.left" : "view.right") }));
}

function renderLibrary(app, host) {
  const p = app.store.project;
  const panel = h("div", { class: "panel grow" });
  panel.append(panelHead("sofa", t("Furniture library"), h("div", { class: "grow" }),
    h("button", { class: "icon-btn", title: t("Import 3D model (OBJ, FBX, GLB, STL…)…"), html: icon("model3d", 15), onclick: () => app.run("file.importModel") })));
  const search = h("input", { placeholder: t("Search (sofa, bed, toilet…)"), value: libState.query });
  panel.append(h("div", { class: "search" }, h("span", { html: icon("search", 15) }), search));
  const chips = h("div", { class: "chips" });
  for (const c of ["", ...FURNITURE_CATEGORIES]) {
    chips.append(h("button", { class: `chip ${libState.category === c ? "on" : ""}`, onclick: () => { libState.category = c; renderLeft(app, host); } }, c ? t(c) : t("All")));
  }
  panel.append(chips);
  const list = h("div", { class: "lib-list" });
  panel.append(list);
  host.append(panel);
  const fill = () => {
    list.innerHTML = "";
    const q = libState.query.trim().toLowerCase();
    let defs = allFurniture().filter((d) => !libState.category || d.cat === libState.category);
    if (q) defs = defs.filter((d) => `${d.kind} ${d.name} ${t(d.name)} ${d.cat} ${t(d.cat)}`.toLowerCase().includes(q));
    const groups = new Map();
    const recent = !q && !libState.category ? (app.settings.recentFurniture || []).map(furnitureDef).filter(Boolean) : [];
    if (recent.length) groups.set(t("Recently used"), recent);
    for (const d of defs) {
      const g = t(d.cat);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(d);
    }
    for (const [g, items] of groups) {
      list.append(h("div", { class: "lib-group" }, g));
      for (const d of items) {
        const row = h("div", { class: "lib-item", draggable: "true", "data-kind": d.kind, title: `${t(d.name)} — ${d.w} × ${d.d} × ${d.h} mm` }, furnitureThumb(d.kind, 44, 36, app.themeName()),
          h("div", {}, h("div", { class: "nm" }, t(d.name)), h("div", { class: "ds" }, `${d.w} × ${d.d} × ${d.h}`)));
        row.addEventListener("click", () => { app.setTab("plan"); app.plan.setTool("furniture", { kind: d.kind }); app.plan.canvas.focus(); });
        row.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/x-myarch-furniture", d.kind); e.dataTransfer.effectAllowed = "copy"; });
        list.append(row);
      }
    }
    // Imported 3D models (assets in this project).
    const models = p.models.filter((m) => !q || m.name.toLowerCase().includes(q));
    if (models.length && !libState.category) {
      list.append(h("div", { class: "lib-group" }, t("Imported 3D models")));
      for (const m of models) {
        const row = h("div", { class: "lib-item", title: `${m.name} — ${m.size.map(Math.round).join(" × ")} mm` }, h("span", { class: "lib-ico", html: icon("model3d", 26) }),
          h("div", {}, h("div", { class: "nm" }, m.name), h("div", { class: "ds" }, `${(m.format || "").toUpperCase()} · ${m.size.map((v) => Math.round(v)).join(" × ")}`)));
        row.addEventListener("click", () => { app.setTab("plan"); app.plan.setTool("furniture", { kind: "model", model: m.id }); });
        list.append(row);
      }
    }
    if (!list.children.length) list.append(h("div", { class: "empty-note" }, t("Nothing matches. Try another word, or import a 3D model.")));
  };
  search.addEventListener("input", () => { libState.query = search.value; fill(); });
  search.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { const first = list.querySelector(".lib-item"); if (first) first.click(); } });
  fill();
  bindCanvasDrop(app);

  // CAD layers (DXF / SVG imports, line tool).
  if (p.drawings.length || p.layers.length > 1) {
    const lp = h("div", { class: "panel" });
    lp.append(panelHead("layers", t("CAD layers"), h("small", {}, String(p.layers.length)), h("div", { class: "grow" }),
      h("button", { class: "icon-btn", title: t("CAD layers…"), html: icon("settings", 14), onclick: () => app.run("build.layers") })));
    const body = h("div", { class: "panel-body flush", style: { padding: "0 6px 8px", maxHeight: "190px", overflow: "auto" } });
    for (const l of p.layers) {
      const n = p.drawings.filter((d) => d.layer === l.id).length;
      const eye = h("span", { class: `eye ${l.visible === false ? "off" : ""}`, html: icon(l.visible === false ? "eyeOff" : "eye", 15), title: t("Show / hide") });
      eye.addEventListener("click", () => app.store.edit(t("Layer visibility"), () => { l.visible = l.visible === false; }));
      const row = h("div", { class: `layer-row ${app.settings.drawLayer === l.id ? "active" : ""}`, title: t("Click to draw lines on this layer") }, eye, h("span", { class: "sw", style: { background: l.color } }), h("span", {}, l.name), h("small", {}, String(n)));
      row.addEventListener("click", (e) => { if (e.target.closest(".eye")) return; app.setSetting("drawLayer", l.id); renderLeft(app, host); });
      body.append(row);
    }
    lp.append(body);
    host.append(lp);
  }
}

let dropBound = false;
function bindCanvasDrop(app) {
  if (dropBound) return;
  dropBound = true;
  const canvas = app.plan.canvas;
  canvas.addEventListener("dragover", (e) => {
    if ([...e.dataTransfer.types].includes("text/x-myarch-furniture")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  });
  canvas.addEventListener("drop", (e) => {
    const kind = e.dataTransfer.getData("text/x-myarch-furniture");
    if (!kind) return;
    e.preventDefault();
    e.stopPropagation();
    const r = canvas.getBoundingClientRect();
    const [wx, wy] = app.plan.vp.toWorld(e.clientX - r.left, e.clientY - r.top);
    app.plan.setTool("furniture", { kind });
    app.plan.pointerPlace("down", { button: 0, shiftKey: false }, wx, wy);
  });
}

// ---------------------------------------------------------------- right panel
export function renderRight(app, host) {
  host.innerHTML = "";
  if (app.tab === "start") return;
  if (!app.settings.showRight) {
    const e = app.checkIssues.filter((i) => i.severity === "error").length;
    const w = app.checkIssues.length - e;
    rail(app, host, "right", "list", app.tab === "3d" ? t("Properties") : t("Properties and model check"), app.tab === "plan" && (e || w) ? [e || w, e ? "" : "warn"] : null);
    return;
  }
  if (app.tab === "3d") { app.v3d.renderInspector(host); addCollapse(app, host, "right"); return; }
  const insp = h("div", { class: "panel" });
  insp.append(panelHead("list", t("Properties")));
  const body = h("div", { class: "panel-body" });
  insp.append(body);
  inspector(app, body);
  host.append(insp);
  host.append(issuesPanel(app));
  addCollapse(app, host, "right");
}

// A labelled field bound to the project through store.edit (one undo step each).
function bindField(app, label, getter, setter, opts = {}) {
  if (opts.type === "number") {
    const step = parseFloat(opts.step) || 1;
    const el = stepper(+getter() || 0, {
      step, min: opts.min ?? -Infinity, max: opts.max ?? Infinity, editable: true,
      format: opts.format || ((v) => String(Math.round(v * 100) / 100)),
      onChange: (v) => app.store.edit(t("Edit {field}", { field: label }), () => setter(+v.toFixed(3))),
    });
    el.dataset.field = label;
    return [h("span", { title: label }, label), el];
  }
  const el = opts.options ? select(getter(), opts.options, {}) : input(getter(), { type: opts.type || "text" });
  el.dataset.field = label;
  if (opts.type === "color") el.style.padding = "1px 3px";
  el.addEventListener("change", () => app.store.edit(t("Edit {field}", { field: label }), () => setter(el.value)));
  el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") el.blur(); });
  return [h("span", { title: label }, label), el];
}

const mm = { type: "number", step: "10", min: 0, format: (v) => String(Math.round(v)) };
const mmS = (step, min = 0) => ({ type: "number", step: String(step), min, format: (v) => String(Math.round(v)) });
const deg = { type: "number", step: "15", format: (v) => `${Math.round(v * 10) / 10}°` };
const matOpts = (use) => materialsFor(use).map((m) => [m.id, t(m.name)]);

// Light settings of a lamp: on/off, brightness, colour temperature or colour,
// beam angle for spots.
function lightFields(app, obj, grid, act) {
  const l = lightOf(obj);
  const L = () => { if (!obj.light) obj.light = { on: l.on, lumens: l.lumens, color: l.color, ...(l.type === "spot" ? { beam: l.beam } : {}) }; return obj.light; };
  grid.append(h("span", { class: "prop-section" }, t("Lighting")), h("span", { class: "prop-sub" }, lampSummary(obj)));
  const sw = checkbox(l.on, t("Light on"), { onChange: (v) => switchLamps(app, [obj.id], v) });
  sw.dataset.lampOn = obj.id;
  grid.append(h("span", {}, t("Switch")), sw,
    ...bindField(app, t("Brightness (lm)"), () => l.lumens, (v) => { L().lumens = Math.max(0, Math.min(100000, Math.round(v))); }, { type: "number", step: "100", min: 0, max: 100000, format: (v) => `${Math.round(v)} lm` }),
    ...bindField(app, t("Colour temperature"), () => temperatureOf(l.color), (v) => { if (v) L().color = v; }, { options: temperatureOptions() }),
    ...bindField(app, t("Light colour"), () => l.color, (v) => { L().color = v; }, { type: "color" }));
  if (l.type === "spot") grid.append(...bindField(app, t("Beam angle"), () => l.beam, (v) => { L().beam = Math.max(5, Math.min(170, v)); }, { type: "number", step: "5", min: 5, max: 170, format: (v) => `${Math.round(v)}°` }));
  act(l.on ? t("Switch light off") : t("Switch light on"), l.on ? "bulbOff" : "bulb", () => switchLamps(app, [obj.id]), l.on ? "" : "primary");
  act(t("All lights on / off"), "bulbRays", () => app.run("light.all"));
}

function inspector(app, body) {
  const p = app.store.project;
  const items = app.plan.selectedItems();
  const units = app.settings.units || "mm";
  if (!items.length) return levelInspector(app, body);
  if (items.length > 1) {
    const counts = {};
    for (const i of items) counts[i.kind] = (counts[i.kind] || 0) + 1;
    body.append(h("div", { class: "prop-title" }, t("{n} items selected", { n: items.length })),
      h("div", { class: "prop-sub" }, Object.entries(counts).map(([k, n]) => `${n} ${t(k)}`).join(" · ")),
      h("div", { class: "prop-actions" },
        h("button", { class: "btn small", onclick: () => app.plan.rotate(90) }, t("Rotate")),
        h("button", { class: "btn small", onclick: () => app.plan.mirror("x") }, t("Mirror")),
        h("button", { class: "btn small", onclick: () => app.plan.duplicate() }, t("Duplicate")),
        h("button", { class: "btn small danger", onclick: () => app.plan.deleteSelection() }, t("Delete"))));
    body.lastChild.append(h("button", { class: "btn small", onclick: () => app.run("edit.group") }, t("Group")), h("button", { class: "btn small", onclick: () => app.run("edit.scale") }, t("Scale…")));
    if (items.every((i) => i.kind === "walls")) {
      const g = h("div", { class: "prop-grid", style: { marginTop: "10px" } },
        ...bindField(app, t("Thickness"), () => items[0].obj.thickness, (v) => { for (const i of items) i.obj.thickness = Math.max(10, v); }, mmS(10, 10)),
        ...bindField(app, t("Material"), () => items[0].obj.material || "plaster", (v) => { for (const i of items) i.obj.material = v; }, { options: matOpts("wall") }));
      body.append(g);
    }
    return;
  }
  const { kind, obj } = items[0];
  const title = (ic, text, sub) => body.append(h("div", { class: "prop-title" }, h("span", { html: icon(ic, 16) }), text), sub ? h("div", { class: "prop-sub" }, sub) : null);
  const grid = h("div", { class: "prop-grid" });
  const actions = h("div", { class: "prop-actions" });
  const act = (label, ic, fn, cls = "") => actions.append(h("button", { class: `btn small ${cls}`, onclick: fn }, ic ? h("span", { html: icon(ic, 14) }) : null, label));
  if (kind === "walls") {
    const L = wallLength(obj);
    const f = wallFrame(obj);
    const ang = ((-Math.atan2(f.d[1], f.d[0]) * 180) / Math.PI + 360) % 360;
    const lv = levelById(p, obj.level);
    title("wall", t("Wall"), `${fmtLen(L, units === "ft" ? "ft" : "mm")} · ${Math.round(ang)}° · ${t("{n} openings", { n: p.openings.filter((o) => o.wall === obj.id).length })}`);
    grid.append(
      ...bindField(app, t("Wall type"), () => obj.type || "", (v) => { if (v) { const wt = p.wallTypes.find((x) => x.id === v); obj.type = v; obj.thickness = wt.layers.reduce((s, l) => s + l.thickness, 0); } else delete obj.type; }, { options: [["", t("(no type)")], ...p.wallTypes.map((wt) => [wt.id, wt.name])] }),
      ...bindField(app, t("Length"), () => L, (v) => { if (v > 10) { const k = v / (wallLength(obj) || 1); moveEnd(p, obj, obj.x1 + (obj.x2 - obj.x1) * k, obj.y1 + (obj.y2 - obj.y1) * k); } }, mmS(10, 10)),
      ...bindField(app, t("Thickness"), () => obj.thickness, (v) => { obj.thickness = Math.max(10, v); delete obj.type; }, mmS(10, 10)),
      ...bindField(app, t("Height"), () => wallHeight(p, obj), (v) => { obj.height = Math.abs(v - lv.height) < 1 ? null : Math.max(100, v); }, mmS(50, 100)),
      ...bindField(app, t("Material"), () => obj.material || "plaster", (v) => { obj.material = v; }, { options: matOpts("wall") }));
    act(t("Add door"), "door", () => { app.plan.setTool("door"); toast(t("Click on the wall where the door goes."), "info"); });
    act(t("Add window"), "window", () => { app.plan.setTool("window"); toast(t("Click on the wall where the window goes."), "info"); });
    act(t("Split in the middle"), "cut", () => app.plan.splitWallAt(obj, (obj.x1 + obj.x2) / 2, (obj.y1 + obj.y2) / 2));
  } else if (kind === "openings") {
    const w = p.walls.find((x) => x.id === obj.wall);
    const tag = openingTags(p).get(obj.id);
    const typeOpts = obj.kind === "window" ? [["casement", t("Casement")], ["fixed", t("Fixed")], ["sliding", t("Sliding")]] : obj.kind === "door" ? [["single", t("Single")], ["double", t("Double")], ["sliding", t("Sliding")], ["garage", t("Garage")]] : [["none", "—"]];
    title(obj.kind === "window" ? "window" : "door", `${tag}  ${obj.kind === "window" ? t("Window") : obj.kind === "door" ? t("Door") : t("Opening")}`, `${obj.width} × ${obj.height} mm${obj.sill ? ` · ${t("sill")} ${obj.sill}` : ""}`);
    grid.append(
      ...bindField(app, t("Kind"), () => obj.kind, (v) => { obj.kind = v; obj.type = v === "window" ? "casement" : v === "door" ? "single" : "none"; if (v === "door" || v === "opening") obj.sill = 0; else if (!obj.sill) obj.sill = p.defaults.windowSill; }, { options: [["door", t("Door")], ["window", t("Window")], ["opening", t("Opening")]] }),
      ...bindField(app, t("Type"), () => obj.type, (v) => { obj.type = v; }, { options: typeOpts }),
      ...bindField(app, t("Width"), () => obj.width, (v) => { obj.width = Math.max(200, Math.min(v, w ? wallLength(w) : v)); }, mmS(50, 200)),
      ...bindField(app, t("Height"), () => obj.height, (v) => { obj.height = Math.max(200, v); }, mmS(50, 200)),
      ...bindField(app, t("Sill height"), () => obj.sill, (v) => { obj.sill = Math.max(0, v); }, mmS(50, 0)),
      ...bindField(app, t("Position"), () => obj.at, (v) => { obj.at = v; }, mmS(50, 0)),
      ...bindField(app, t("Tag"), () => obj.tag || tag, (v) => { obj.tag = v.trim() || undefined; }));
    act(t("Flip swing side"), "flip", () => app.plan.flipSelected("side"));
    act(t("Swap hinge"), "mirror", () => app.plan.flipSelected("hinge"));
    if (w) act(t("Select wall"), "wall", () => app.plan.select([w.id]));
  } else if (kind === "rooms") {
    const a = roomArea(obj);
    title("room", obj.name || t("Room"), `${fmtArea(a, units === "ft" ? "ft" : "mm")} · ${t("perimeter")} ${(roomPerimeter(obj) / 1000).toFixed(2)} m`);
    grid.append(
      ...bindField(app, t("Name"), () => obj.name, (v) => { obj.name = v.trim(); }),
      ...bindField(app, t("Number"), () => obj.number || "", (v) => { obj.number = v.trim() || undefined; }),
      ...bindField(app, t("Department"), () => obj.department || "", (v) => { obj.department = v.trim() || undefined; }),
      ...bindField(app, t("Floor"), () => obj.floor || "oak", (v) => { obj.floor = v; }, { options: matOpts("floor") }),
      ...bindField(app, t("Text size"), () => obj.textSize || 260, (v) => { obj.textSize = Math.max(50, v); }, mmS(20, 50)));
    grid.append(h("span", {}, ""), checkbox(obj.showArea !== false, t("Show area"), { onChange: (v) => app.store.edit(t("Edit room"), () => { obj.showArea = v; }) }));
    act(t("Properties…"), "settings", () => app.editProperties(kind, obj));
  } else if (kind === "furniture") {
    const def = furnitureDef(obj.kind);
    title(obj.kind === "model" ? "model3d" : "sofa", obj.name || (def ? t(def.name) : obj.kind), `${obj.w} × ${obj.d} × ${obj.h} mm`);
    grid.append(
      ...bindField(app, "X", () => obj.x, (v) => { obj.x = v; }, mmS(10, -1e9)),
      ...bindField(app, "Y", () => obj.y, (v) => { obj.y = v; }, mmS(10, -1e9)),
      ...bindField(app, t("Rotation"), () => obj.rot || 0, (v) => { obj.rot = ((v % 360) + 360) % 360; }, deg),
      ...bindField(app, t("Width"), () => obj.w, (v) => { obj.w = Math.max(10, v); }, mmS(10, 10)),
      ...bindField(app, t("Depth"), () => obj.d, (v) => { obj.d = Math.max(10, v); }, mmS(10, 10)),
      ...bindField(app, t("Height"), () => obj.h, (v) => { obj.h = Math.max(1, v); }, mmS(10, 1)),
      ...bindField(app, t("Elevation"), () => obj.elevation || 0, (v) => { obj.elevation = v; }, mmS(10, -1e5)),
      ...(obj.kind !== "model" ? bindField(app, t("Colour"), () => obj.color || "#8a9bb0", (v) => { obj.color = v; }, { type: "color" }) : []));
    if (isLight(obj)) lightFields(app, obj, grid, act);
    act(t("Show in 3D"), "cube", () => app.crossProbe([obj.id], "3d"));
  } else if (kind === "columns") {
    title("column", t("Column"), `${obj.w} × ${obj.d} mm`);
    grid.append(
      ...bindField(app, t("Shape"), () => obj.shape, (v) => { obj.shape = v; }, { options: [["rect", t("Rectangular")], ["round", t("Round")]] }),
      ...bindField(app, t("Width"), () => obj.w, (v) => { obj.w = Math.max(20, v); }, mmS(10, 20)),
      ...bindField(app, t("Depth"), () => obj.d, (v) => { obj.d = Math.max(20, v); }, mmS(10, 20)),
      ...bindField(app, t("Rotation"), () => obj.rot || 0, (v) => { obj.rot = v; }, deg),
      ...bindField(app, t("Material"), () => obj.material || "concrete", (v) => { obj.material = v; }, { options: matOpts("wall") }));
  } else if (kind === "stairs") {
    const lv = levelById(p, obj.level);
    const above = levelAbove(p, obj.level);
    const rise = (above ? above.elevation - lv.elevation : lv.height) / obj.steps;
    title("stairs", t("Stair"), t("{n} steps · riser {r} mm · going {g} mm", { n: obj.steps, r: Math.round(rise), g: Math.round(obj.length / obj.steps) }));
    grid.append(
      ...bindField(app, t("Steps"), () => obj.steps, (v) => { obj.steps = Math.max(2, Math.round(v)); }, { type: "number", step: "1", min: 2, format: (v) => String(Math.round(v)) }),
      ...bindField(app, t("Width"), () => obj.width, (v) => { obj.width = Math.max(300, v); }, mmS(50, 300)),
      ...bindField(app, t("Length"), () => obj.length, (v) => { obj.length = Math.max(300, v); }, mmS(50, 300)),
      ...bindField(app, t("Rotation"), () => obj.rot || 0, (v) => { obj.rot = ((v % 360) + 360) % 360; }, deg),
      ...bindField(app, t("Material"), () => obj.material || "oak", (v) => { obj.material = v; }, { options: matOpts("floor") }));
    if (rise > 200) body.append(h("div", { class: "empty-note" }, t("Risers over 200 mm are steep: add steps.")));
  } else if (kind === "roofs") {
    title("roof", t("Roof"), `${t(obj.kind === "flat" ? "Flat" : obj.kind === "hip" ? "Hip" : obj.kind === "shed" ? "Shed" : "Gable")} · ${obj.pitch}°`);
    grid.append(
      ...bindField(app, t("Shape"), () => obj.kind, (v) => { obj.kind = v; }, { options: [["gable", t("Gable")], ["hip", t("Hip")], ["shed", t("Shed")], ["flat", t("Flat")]] }),
      ...bindField(app, t("Pitch"), () => obj.pitch, (v) => { obj.pitch = Math.max(0, Math.min(75, v)); }, { type: "number", step: "5", min: 0, max: 75, format: (v) => `${v}°` }),
      ...bindField(app, t("Overhang"), () => obj.overhang, (v) => { obj.overhang = Math.max(0, v); }, mmS(50, 0)),
      ...bindField(app, t("Thickness"), () => obj.thickness, (v) => { obj.thickness = Math.max(20, v); }, mmS(10, 20)),
      ...bindField(app, t("Ridge direction"), () => String(obj.rot || 0), (v) => { obj.rot = +v; }, { options: [["0", t("Along the long side")], ["90", t("Across")]] }),
      ...bindField(app, t("Material"), () => obj.material || "roof-tiles", (v) => { obj.material = v; }, { options: matOpts("roof") }));
  } else if (kind === "dimensions") {
    title("dimension", t("Dimension"), fmtLen(dist(obj.x1, obj.y1, obj.x2, obj.y2), units === "ft" ? "ft" : "mm"));
    grid.append(
      ...bindField(app, t("Offset"), () => obj.offset || 0, (v) => { obj.offset = v; }, mmS(50, -1e6)),
      ...bindField(app, t("Text override"), () => obj.label || "", (v) => { obj.label = v.trim() || undefined; }));
  } else if (kind === "texts") {
    title("text", t("Text"));
    const ta = h("textarea", { class: "input wide", rows: 3 }, obj.text);
    ta.addEventListener("change", () => app.store.edit(t("Edit text"), () => { obj.text = ta.value; }));
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    body.append(ta);
    grid.style.marginTop = "8px";
    grid.append(
      ...bindField(app, t("Size"), () => obj.size, (v) => { obj.size = Math.max(10, v); }, mmS(10, 10)),
      ...bindField(app, t("Rotation"), () => obj.rot || 0, (v) => { obj.rot = v; }, deg),
      ...bindField(app, t("Align"), () => obj.align || "left", (v) => { obj.align = v; }, { options: [["left", t("Left")], ["center", t("Centre")], ["right", t("Right")]] }));
  } else if (kind === "drawings") {
    title("line", t("CAD line"), `${t("Layer")}: ${obj.layer}`);
    grid.append(
      ...bindField(app, t("Layer"), () => obj.layer, (v) => { obj.layer = v; }, { options: p.layers.map((l) => [l.id, l.name]) }),
      ...bindField(app, t("Colour"), () => obj.color || (p.layers.find((l) => l.id === obj.layer) || {}).color || "#9aa4b5", (v) => { obj.color = v; }, { type: "color" }));
  } else if (kind === "solids") {
    title("box3d", obj.name || t("Mass"), `${(Math.abs(areaOf(obj.pts)) / 1e6).toFixed(2)} m² · H ${(obj.height / 1000).toFixed(2)} m`);
    grid.append(
      ...bindField(app, t("Name"), () => obj.name || "", (v) => { obj.name = v.trim() || undefined; }),
      ...bindField(app, t("Height"), () => obj.height, (v) => { obj.height = Math.max(1, v); }, mmS(100, 1)),
      ...bindField(app, t("Base height"), () => obj.z0 || 0, (v) => { obj.z0 = v; }, mmS(100, -1e6)),
      ...bindField(app, t("Taper"), () => Math.round((obj.taper ?? 1) * 100), (v) => { obj.taper = Math.max(0, Math.min(1, v / 100)); }, { type: "number", step: "10", min: 0, max: 100, format: (v) => `${v}%` }),
      ...bindField(app, t("Material"), () => obj.material || "concrete", (v) => { obj.material = v; }, { options: [...matOpts("wall"), ...matOpts("roof")].filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i) }));
    act(t("Push/Pull in 3D"), "pushpull", () => { app.setTab("3d"); app.v3d.setTool("pushpull"); });
  } else if (kind === "grids") {
    title("gridline", `${t("Grid line")} ${obj.label}`, fmtLen(dist(obj.x1, obj.y1, obj.x2, obj.y2)));
    grid.append(...bindField(app, t("Label"), () => obj.label, (v) => { obj.label = v.trim(); }));
  } else if (kind === "underlays") {
    title("underlay", t("Image underlay"), `${Math.round(obj.w)} × ${Math.round(obj.h)} mm`);
    grid.append(
      ...bindField(app, "X", () => obj.x, (v) => { obj.x = v; }, mmS(10, -1e9)),
      ...bindField(app, "Y", () => obj.y, (v) => { obj.y = v; }, mmS(10, -1e9)),
      ...bindField(app, t("Width"), () => obj.w, (v) => { const k = v / obj.w; obj.w = Math.max(10, v); obj.h *= k; }, mmS(100, 10)),
      ...bindField(app, t("Rotation"), () => obj.rot || 0, (v) => { obj.rot = v; }, deg),
      ...bindField(app, t("Opacity"), () => Math.round((obj.opacity ?? 0.5) * 100), (v) => { obj.opacity = Math.max(0.05, Math.min(1, v / 100)); }, { type: "number", step: "5", min: 5, max: 100, format: (v) => `${v}%` }));
    body.append(h("div", { class: "empty-note" }, t("Tip: measure a known length on the image with M, then set the width so it matches.")));
  }
  body.append(grid);
  if (obj.group) {
    body.append(h("div", { class: "empty-note" }, t("Part of a group ({n} items). Alt+click selects a single item.", { n: app.store.project[kind].filter((x) => x.group === obj.group).length })));
    act(t("Ungroup"), "group", () => app.run("edit.ungroup"));
  }
  act(t("Delete"), "trash", () => app.plan.deleteSelection(), "danger");
  body.append(actions);
  if (IFC_CLASS[kind]) bimSection(app, body, kind, obj);
}

// BIM data of one element: phase, classification, IFC class and GlobalId,
// and its free properties (exported to IFC as property sets).
function bimSection(app, body, kind, obj) {
  const p = app.store.project;
  const n = Object.keys(obj.props || {}).length;
  body.append(h("div", { class: "prop-section" }, t("BIM")));
  const g = h("div", { class: "prop-grid" });
  if (kind !== "grids") {
    g.append(...bindField(app, t("Phase"), () => obj.phase || "new", (v) => { obj.phase = v; }, { options: [["new", t("New")], ["existing", t("Existing")], ["demolish", t("Demolish")]] }),
      ...bindField(app, t("Classification"), () => obj.classification || "", (v) => { obj.classification = v.trim() || undefined; }));
  }
  g.append(h("span", {}, t("IFC class")), h("span", { class: "mono-val" }, IFC_CLASS[kind]),
    h("span", {}, "GlobalId"), h("span", { class: "mono-val", title: t("Click to copy") , onclick: (e) => { navigator.clipboard.writeText(e.target.textContent).catch(() => {}); toast(t("Copied to clipboard"), "ok", 1000); } }, ifcGuid(obj.id)));
  body.append(g, h("div", { class: "prop-actions" },
    h("button", { class: "btn small", onclick: () => app.run("build.bimProps") }, h("span", { html: icon("bim", 14) }), t("Properties ({n})…", { n })),
    h("button", { class: "btn small", onclick: () => app.plan.selectSimilar() }, h("span", { html: icon("select", 14) }), t("Select similar"))));
  void p;
}

function areaOf(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}

function moveEnd(p, w, x, y) {
  // Lengthening a wall drags the joined walls at its end along.
  const ox = w.x2, oy = w.y2;
  for (const o of p.walls) {
    if (o.level !== w.level) continue;
    if (Math.hypot(o.x1 - ox, o.y1 - oy) < 2) { o.x1 = x; o.y1 = y; }
    if (o !== w && Math.hypot(o.x2 - ox, o.y2 - oy) < 2) { o.x2 = x; o.y2 = y; }
  }
  w.x2 = x;
  w.y2 = y;
}

function levelInspector(app, body) {
  const p = app.store.project;
  const lv = levelById(p, app.plan.level);
  const sum = levelSummary(p).find((s) => s.level === lv.name) || {};
  body.append(
    h("div", { class: "prop-title" }, h("span", { html: icon("levels", 16) }), `${t("Level")} ${lv.name}`),
    h("div", { class: "prop-sub" }, t("{w} walls · {r} rooms · {a} m² rooms · {g} m² gross", { w: sum.walls || 0, r: sum.rooms || 0, a: (sum.roomArea || 0).toFixed(1), g: (sum.grossArea || 0).toFixed(1) })),
    h("div", { class: "prop-grid" },
      ...bindField(app, t("Name"), () => lv.name, (v) => { lv.name = v.trim() || lv.name; }),
      ...bindField(app, t("Elevation"), () => lv.elevation, (v) => { lv.elevation = v; p.levels.sort((a, b) => a.elevation - b.elevation); }, mmS(50, -1e6)),
      ...bindField(app, t("Height"), () => lv.height, (v) => { lv.height = Math.max(1000, v); }, mmS(50, 1000)),
      ...bindField(app, t("Floor slab"), () => lv.slab, (v) => { lv.slab = Math.max(0, v); }, mmS(10, 0))));
  // Defaults for new walls / openings (settings: no undo step).
  const s = app.settings;
  const d = p.defaults;
  const num = (k, def, step, min, label) => {
    const el = stepper(+s[k] || def, { step, min, editable: true, format: (v) => String(Math.round(v)), onChange: (v) => app.setSetting(k, v) });
    el.dataset.setting = k;
    return [h("span", { title: label }, label), el];
  };
  body.append(h("div", { class: "prop-section" }, t("New items")),
    h("div", { class: "prop-grid" },
      h("span", {}, t("Wall type")), select(s.wallType || "", [["", t("(no type)")], ...p.wallTypes.map((wt) => [wt.id, wt.name])], { onChange: (v) => app.setSetting("wallType", v) }),
      h("span", {}, t("Phase")), select(s.drawPhase || "new", [["new", t("New")], ["existing", t("Existing")], ["demolish", t("Demolish")]], { onChange: (v) => app.setSetting("drawPhase", v) }),
      ...num("wallThickness", d.wallThickness, 10, 10, t("Wall thickness")),
      ...num("doorWidth", d.doorWidth, 50, 400, t("Door width")),
      ...num("windowWidth", d.windowWidth, 50, 300, t("Window width")),
      ...num("windowSill", d.windowSill, 50, 0, t("Window sill"))));
  body.append(h("div", { class: "empty-note", html: t("<b>W</b> wall · <b>A</b> room · <b>D</b> door · <b>N</b> window · <b>F</b> furniture · <b>S</b> stair · <b>O</b> roof · <b>K</b> dimension · <b>Ctrl+K</b> search everything") }));
  void getLanguage;
}

function issuesPanel(app) {
  const issues = app.checkIssues;
  const p = h("div", { class: "panel grow" });
  const errs = issues.filter((i) => i.severity === "error").length;
  p.append(panelHead("modelcheck", t("Model check"), h("div", { class: "grow" }),
    h("button", { class: "icon-btn", title: t("Run the model check again"), html: icon("refresh", 15), onclick: () => app.runCheck(true) })));
  const body = h("div", { class: "panel-body" });
  body.append(h("div", { class: "summary-row" },
    h("span", { class: `pill ${errs ? "err" : "ok"}` }, h("span", { html: icon(errs ? "error" : "check", 12) }), `${errs} ${t("errors")}`),
    h("span", { class: `pill ${issues.length - errs ? "warn" : ""}` }, `${issues.length - errs} ${t("warnings")}`)));
  if (!issues.length) body.append(h("div", { class: "empty-note" }, t("No problems. The model check runs as you draw: overlapping walls, openings, blocked doors, rooms without doors…")));
  const list = h("div", { class: "issue-list" });
  const levelName = (id) => (levelById(app.store.project, id) || {}).name || "";
  for (const is of issues.slice(0, 300)) {
    const row = h("div", { class: `issue ${is.severity}`, title: t("Click to zoom to the problem") }, h("span", { html: icon(is.severity === "error" ? "error" : "warning", 15) }),
      h("div", {}, t(is.key, is.vars), h("small", {}, `${is.code} · ${levelName(is.level)}`)));
    row.addEventListener("click", () => app.plan.focusPoint(is.x, is.y, is.ids || [], is.level));
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
  if (app.tab === "plan") {
    const ed = app.plan;
    const m = ed.vp.mouse;
    const units = app.settings.units || "mm";
    const fmt = (v) => (units === "m" ? `${(v / 1000).toFixed(3)} m` : units === "cm" ? `${(v / 10).toFixed(1)} cm` : units === "ft" ? `${(v / 304.8).toFixed(2)} ft` : `${Math.round(v)} mm`);
    bar.append(cell(`X ${fmt(m.wx)}  Y ${fmt(-m.wy)}`, "mono"));
    const lv = levelById(app.store.project, ed.level);
    bar.append(h("button", { class: "cell", title: t("Level properties…"), onclick: () => app.run("build.levelProps") }, h("span", { html: icon("levels", 13) }), lv ? lv.name : ""));
    bar.append(h("button", { class: "cell", title: t("Change grid"), onclick: (e) => gridMenu(app, e) }, `${t("Grid")} ${app.settings.planGrid || 100} mm`));
    bar.append(h("button", { class: `cell ${app.settings.snap !== false ? "on" : ""}`, title: t("Snap to grid and walls"), onclick: () => app.run("view.snap") }, `${t("Snap")} ${app.settings.snap !== false ? "✓" : "—"}`));
    bar.append(h("button", { class: `cell ${app.settings.ortho !== false ? "on" : ""}`, title: t("Orthogonal drawing (45° steps)"), onclick: () => app.run("view.ortho") }, `${t("Ortho")} ${app.settings.ortho !== false ? "✓" : "—"}`));
    // Approximate drawing scale at 96 dpi.
    const scale = Math.round(1 / (ed.vp.scale * (25.4 / 96)) || 0);
    bar.append(cell(`1:${scale}`, "mono"));
    bar.append(h("button", { class: "cell", title: t("Switch units"), onclick: () => app.setSetting("units", { mm: "cm", cm: "m", m: "ft", ft: "mm" }[units] || "mm") }, units));
    if (ed.sel.size) bar.append(cell(t("{n} selected", { n: ed.sel.size })));
  } else if (app.tab === "3d") {
    const v = app.v3d;
    const o = v.opts;
    const nav = { orbit: t("Orbit"), pan: t("Pan"), walk: t("Walk") }[o.navMode] || t("Orbit");
    bar.append(h("button", { class: "cell", title: t("Walk through (first person)"), onclick: () => app.run("v3d.walk") }, h("span", { html: icon(o.navMode === "walk" ? "walk" : "orbit", 13) }), nav));
    bar.append(h("button", { class: `cell ${o.ortho ? "on" : ""}`, title: t("Orthographic projection"), onclick: () => app.run("v3d.ortho") }, o.ortho ? t("Orthographic") : t("Perspective")));
    bar.append(h("button", { class: `cell ${o.section !== null ? "on" : ""}`, title: t("Section cut at the current level"), onclick: () => app.run("v3d.section") }, `${t("Section")} ${o.section !== null ? "✓" : "—"}`));
    const style = { realistic: t("Realistic"), white: t("White model"), lines: t("Line drawing"), xray: t("X-ray") }[o.style] || t("Realistic");
    bar.append(cell(style));
    if (v.viewer) { const s = v.viewer.stats(); bar.append(cell(t("{n} triangles", { n: s.triangles.toLocaleString() }), "mono")); }
    if (app.plan.sel.size) bar.append(cell(t("{n} selected", { n: app.plan.sel.size })));
  } else {
    const p = app.store.project;
    bar.append(cell(t("{n} recent files", { n: (app.settings.recent || []).length })));
    bar.append(cell(`${t("Theme")}: ${app.themeLabel ? app.themeLabel() : app.settings.theme}`));
    bar.append(cell(p.walls.length ? t("{n} walls", { n: p.walls.length }) : t("Empty project")));
  }
  const e = app.checkIssues.filter((i) => i.severity === "error").length;
  const w = app.checkIssues.length - e;
  bar.append(h("button", { class: "cell", onclick: () => app.run("build.check") }, `${t("Check")} ${e ? "✖ " + e : w ? "⚠ " + w : "✓"}`));
}

function gridMenu(app, e) {
  const opts = [10, 25, 50, 100, 250, 500, 1000];
  import("./widgets.js").then(({ contextMenu }) => contextMenu(opts.map((g) => ({
    label: `${g} mm`, checked: (app.settings.planGrid || 100) === g,
    action: () => app.setSetting("planGrid", g),
  })), e.clientX, e.clientY - 10 - opts.length * 28));
}
