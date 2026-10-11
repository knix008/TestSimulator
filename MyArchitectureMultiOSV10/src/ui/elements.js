// UI of the BIM elements: the plan toolbar's split buttons (wall / curtain
// wall, column / beam, stair types / ramp / railing, slab / ceiling / shaft,
// types / design options / array), the inspector sections, the context-menu
// items, the extra commands, and the dialogs: the type catalogue ("families"
// with type parameters, slab and curtain-wall types, materials with thermal
// properties), design options, arrays and beam systems.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, modal, select, stepper, input, field, checkbox, tabs, toast, contextMenu, promptDialog, confirmDialog } from "./widgets.js";
import { uid, polygonArea, pointInPolygon, labelPoint, dist } from "../core/geom.js";
import { levelById, levelAbove, wallLength, LEVEL_COLLECTIONS } from "../core/project.js";
import { buildingOutlines } from "../core/rooms.js";
import { MATERIALS, materialsFor, uValue } from "../lib/materials.js";
import { allFurniture, furnitureDef } from "../lib/furniture.js";
import {
  TYPE_CATEGORIES, TYPE_PARAMS, TYPE_DEFAULTS, DEFAULT_TYPES, DEFAULT_SLAB_TYPES, DEFAULT_CURTAIN_TYPES, CURTAIN_DEFAULTS, BEAM_PROFILES, RAILING_STYLES, STAIR_SHAPES, STAIR_RAILINGS,
  allTypes, typesOf, typeById, applyType, applyTypes, typeInstances, isBuiltinType, categoryOf, allSlabTypes, slabTypeById, slabTypeThickness, optionName, activeModel,
} from "../core/elements/model.js";
import { slabArea, ceilingHeight, beamLength, beamSystem, rampModel, railingLength, shaftLevels, isCurtainWall, curtainTypeOf, stairLayout, stairRise, beamEnds } from "../core/elements/geometry.js";
import { elementSchedule, elementTotals, typeSchedule, thermalSchedule } from "../core/elements/schedule.js";
import * as ops from "../plan/ops.js";

const CAT_LABEL = { door: "Doors", window: "Windows", column: "Columns", beam: "Beams", furniture: "Furniture", railing: "Railings" };
const SHAPE_LABEL = { straight: "Straight", L: "L-shaped (quarter landing)", U: "U-shaped (half landing)", spiral: "Spiral" };
const RAIL_LABEL = { none: "None", left: "Left", right: "Right", both: "Both sides" };
const PROFILE_LABEL = { rect: "Rectangle", I: "I-section", T: "T-section", round: "Round" };
const STYLE_LABEL = { bars: "Balusters", glass: "Glass panels", panel: "Solid panels" };
const tr = (map) => Object.entries(map).map(([k, v]) => [k, t(v)]);

// ---------------------------------------------------------------- styles
let styled = false;
function injectStyle() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  document.head.append(h("style", { id: "elements-css" }, `
#toolbar .split-btn.tb-split { gap: 0; }
#toolbar .split-btn.tb-split .icon-btn.caret { min-width: 14px; width: 14px; padding: 0; margin-left: -2px; }
#toolbar .split-btn.tb-split .icon-btn.caret.on { color: var(--accent, #4f9dff); }
.el-cat { display: flex; flex-direction: column; gap: 2px; min-width: 150px; }
.el-cat button { text-align: left; }
.el-types { display: grid; grid-template-columns: 170px 240px 1fr; gap: 12px; min-height: 380px; }
.el-types .wt-list { max-height: 440px; overflow: auto; }
.el-types .badge { font-size: 10px; opacity: .7; margin-left: 6px; }
.el-edges td, .el-edges th { padding: 2px 6px; }
.el-swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; vertical-align: middle; margin-right: 6px; border: 1px solid rgba(0,0,0,.2); }
`));
}

// ---------------------------------------------------------------- toolbar
export const SPLIT_GROUPS = {
  wall: ["plan.wall", "plan.curtainWall"],
  column: ["plan.column", "plan.beam", "build.beamSystem"],
  stair: ["plan.stair", "stair.straight", "stair.L", "stair.U", "stair.spiral", "-", "plan.ramp", "plan.railing"],
  slab: ["plan.slab", "plan.ceiling", "plan.shaft", "build.slabOpening", "-", "build.autoSlabs", "build.autoCeilings"],
  types: ["build.types", "build.designOptions", "edit.array", "build.materials"],
};

// A split button: the group's tool (the active one, else the first) and a
// caret opening the rest. Nothing is hidden: every command stays one click away.
export function splitButton(app, group, btn) {
  injectStyle();
  const ids = SPLIT_GROUPS[group].filter((x) => x !== "-");
  const active = ids.find((id) => { const c = app.commands.get(id); return c && c.checked && c.checked(); });
  const mainId = active && active.startsWith("plan.") ? active : ids[0];
  const main = btn(mainId);
  const anyOn = !!active;
  const caret = h("button", {
    class: `icon-btn caret ${anyOn && active !== mainId ? "on" : ""}`, "data-split": group, title: t("More: {list}", { list: ids.map((id) => t((app.commands.get(id) || { label: id }).label)).join(", ") }), html: icon("chevronDown", 12),
    onclick: (e) => {
      const r = e.currentTarget.parentElement.getBoundingClientRect();
      contextMenu(app.menuItems(SPLIT_GROUPS[group]), r.left, r.bottom + 2);
    },
  });
  return h("div", { class: "split-btn tb-split", "data-group": group }, main, caret);
}

// ---------------------------------------------------------------- commands
export function registerElementCommands(app, C) {
  const toPlan = () => { if (app.tab !== "plan") app.setTab("plan"); };
  const inPlan = () => app.tab === "plan";
  for (const shape of STAIR_SHAPES) {
    C(`stair.${shape}`, { straight: "Straight stair", L: "L-shaped stair (quarter landing)", U: "U-shaped stair (half landing)", spiral: "Spiral stair" }[shape], { straight: "stairs", L: "stairL", U: "stairU", spiral: "stairSpiral" }[shape], "", () => {
      app.setSetting("stairShape", shape); toPlan(); app.plan.setTool("stair");
      if (shape === "spiral") app.setHint(t("Spiral stair: click the centre, then a point on the outside edge where it starts."));
    }, { checked: () => (app.settings.stairShape || "straight") === shape && app.tab === "plan" && app.plan.tool === "stair" });
  }
  C("build.types", "Type catalogue (families)…", "typesCat", "", () => typeCatalogDialog(app));
  C("build.materials", "Materials and thermal properties…", "material", "", () => typeCatalogDialog(app, { tab: "materials" }));
  C("build.typeSelectAll", "Select all instances of this type", "select", "", () => selectTypeInstances(app), { enabled: () => !!selectedTyped(app) });
  C("build.typeFromSelection", "Create a type from the selection", "typesCat", "", () => typeFromSelection(app), { enabled: () => { const it = app.plan.selectedItems()[0]; return !!it && !!categoryOf(it.kind, it.obj); } });
  C("build.designOptions", "Design options…", "options", "", () => designOptionsDialog(app));
  C("edit.array", "Array (linear / radial)…", "array", "", () => arrayDialog(app), { enabled: () => inPlan() && app.plan.sel.size > 0 });
  C("build.beamSystem", "Beam system in the selected slab or room…", "beam", "", () => beamSystemDialog(app));
  C("build.autoSlabs", "Floor slabs under every level", "slab", "", () => autoSlabs(app));
  C("build.autoCeilings", "Ceilings in every room of this level", "ceiling", "", () => autoCeilings(app));
  C("build.attachTop", "Attach the selected walls to the roof or slab above", "roof", "", () => attachWalls(app), { enabled: () => inPlan() && app.plan.selectedItems().some((i) => i.kind === "walls") });
  C("build.slabOpening", "Opening in a slab, ceiling or roof", "shaft", "", () => {
    toPlan();
    const it = app.plan.selectedItems().find((i) => ["slabs", "ceilings", "roofs"].includes(i.kind));
    app.plan.setTool("shaft", { holeIn: it ? it.obj.id : null });
    app.setHint(t("Click two opposite corners of the opening inside the slab, ceiling or roof."));
  });
}

// Menu entries the app adds to its menus.
export const ELEMENT_MENU = {
  Edit: ["edit.array"],
  Build: ["build.autoSlabs", "build.autoCeilings", "build.beamSystem", "build.attachTop", "build.slabOpening"],
  BIM: ["build.types", "build.typeSelectAll", "build.typeFromSelection", "build.designOptions", "build.materials"],
};

function selectedTyped(app) {
  if (!app.plan) return null;
  const it = app.plan.selectedItems()[0];
  return it && it.obj.typeId ? typeById(app.store.project, it.obj.typeId) : null;
}

export function selectTypeInstances(app, typeId = null) {
  const ty = typeId ? typeById(app.store.project, typeId) : selectedTyped(app);
  if (!ty) return 0;
  const list = typeInstances(app.store.project, ty.id);
  if (app.tab !== "plan") app.setTab("plan");
  app.plan.selectIds(list.map((x) => x.obj.id));
  // Instances on other levels stay in the selection set of the project, the
  // plan shows the ones on the level it jumped to.
  toast(t("{n} instances of {type} selected.", { n: list.length, type: ty.name }), "info", 2000);
  return list.length;
}

export function typeFromSelection(app) {
  const it = app.plan.selectedItems()[0];
  if (!it) return null;
  const cat = categoryOf(it.kind, it.obj);
  if (!cat) return null;
  const p = app.store.project;
  const base = it.obj.kind === "door" || it.obj.kind === "window" ? `${it.obj.kind === "door" ? t("Door") : t("Window")} ${it.obj.width} × ${it.obj.height}` : cat === "furniture" ? `${t((furnitureDef(it.obj.kind) || { name: it.obj.kind }).name)} ${it.obj.w} × ${it.obj.d}` : `${t(CAT_LABEL[cat])} ${it.obj.w || ""} × ${it.obj.d || it.obj.h || ""}`;
  const id = uid("ty");
  app.store.edit(t("New type"), (pr) => {
    const params = {};
    for (const k of [...TYPE_PARAMS[cat], ...(TYPE_DEFAULTS[cat] || [])]) if (it.obj[k] !== undefined && it.obj[k] !== null) params[k] = JSON.parse(JSON.stringify(it.obj[k]));
    pr.types.push({ id, category: cat, name: base, params });
    const obj = (pr[it.kind] || []).find((x) => x.id === it.obj.id);
    if (obj) obj.typeId = id;
  });
  toast(t("Type \"{name}\" created from the selection.", { name: base }), "ok");
  void p;
  return id;
}

// ---------------------------------------------------------------- bulk commands
export function autoSlabs(app) {
  const ids = [];
  app.store.edit(t("Floor slabs"), (p) => {
    for (const lv of p.levels) {
      const walls = p.walls.filter((w) => w.level === lv.id);
      for (const pts of buildingOutlines(walls)) {
        const [x, y] = labelPoint(pts);
        if (p.slabs.some((s) => s.level === lv.id && pointInPolygon(x, y, s.pts))) continue;
        const st = slabTypeById(p, app.settings.slabType || "floor-concrete-250");
        const id = uid("sl");
        p.slabs.push({ id, level: lv.id, pts: pts.map(([a, b]) => [Math.round(a), Math.round(b)]), holes: [], type: st.id, thickness: slabTypeThickness(st), offset: 0, slope: 0, slopeDir: 0, kind: "floor", phase: app.settings.drawPhase || "new" });
        ids.push(id);
      }
    }
    return ids.length > 0;
  });
  toast(ids.length ? t("{n} floor slabs added.", { n: ids.length }) : t("Every level already has its floor slab."), ids.length ? "ok" : "info");
  return ids;
}

export function autoCeilings(app) {
  const ids = [];
  const level = app.plan.level;
  app.store.edit(t("Ceilings"), (p) => {
    for (const r of p.rooms.filter((x) => x.level === level)) {
      const [x, y] = labelPoint(r.pts);
      if (p.ceilings.some((c) => c.level === level && pointInPolygon(x, y, c.pts))) continue;
      const st = slabTypeById(p, app.settings.ceilingType || "ceil-gypsum-15");
      const id = uid("cl");
      p.ceilings.push({ id, level, pts: r.pts.map((q) => q.slice()), holes: [], type: st.id, thickness: slabTypeThickness(st), height: null, phase: app.settings.drawPhase || "new" });
      ids.push(id);
    }
    return ids.length > 0;
  });
  toast(ids.length ? t("{n} ceilings added.", { n: ids.length }) : t("Every room already has a ceiling."), ids.length ? "ok" : "info");
  return ids;
}

export function attachWalls(app) {
  const walls = app.plan.selectedItems().filter((i) => i.kind === "walls").map((i) => i.obj);
  if (!walls.length) return 0;
  const off = walls.every((w) => w.attachTop);
  app.store.edit(off ? t("Detach walls") : t("Attach walls"), (p) => {
    for (const w0 of walls) {
      const w = p.walls.find((x) => x.id === w0.id);
      if (!w) continue;
      if (off) { delete w.attachTop; continue; }
      // A slab on the level above over the wall, else any roof.
      const above = levelAbove(p, w.level);
      const mid = [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2];
      const slab = above && p.slabs.find((s) => s.level === above.id && pointInPolygon(...mid, s.pts));
      w.attachTop = slab ? slab.id : "roof";
    }
  });
  toast(off ? t("Walls detached: they keep their own height.") : t("{n} walls now reach up to the roof or slab above.", { n: walls.length }), "ok");
  return walls.length;
}

// ---------------------------------------------------------------- inspector
// Called by panels.js inspector for every selected item: adds the fields of
// the new element kinds and the extra parameters of walls, openings, columns,
// stairs, roofs and furniture. ui: {title, grid, act, body, bindField, mmS, deg, matOpts}
export function elementPanel(app, kind, obj, ui) {
  injectStyle();
  const p = app.store.project;
  const { title, grid, act, bindField, mmS, deg, matOpts } = ui;
  const num = (step, min = 0) => mmS(step, min);
  const typeField = (cat) => {
    const opts = [["", t("(no type)")], ...typesOf(p, cat).map((ty) => [ty.id, ty.name])];
    return bindField(app, t("Catalogue type"), () => obj.typeId || "", (v) => { if (v) { obj.typeId = v; applyType(typeById(p, v), obj); } else delete obj.typeId; }, { options: opts });
  };
  const typeActions = () => {
    if (obj.typeId) {
      act(t("Edit type…"), "typesCat", () => typeCatalogDialog(app, { typeId: obj.typeId }));
      act(t("Select all instances"), "select", () => selectTypeInstances(app, obj.typeId));
    } else if (categoryOf(kind, obj)) act(t("Create a type"), "typesCat", () => typeFromSelection(app));
  };
  const lock = (labels) => { if (obj.typeId) lockFields(grid, labels.map((l) => t(l))); };
  if (kind === "slabs") {
    const st = slabTypeById(p, obj.type);
    title("slab", obj.kind === "foundation" ? t("Foundation") : t("Floor slab"), `${(slabArea(p, obj) / 1e6).toFixed(2)} m² · ${obj.thickness} mm${obj.holes.length ? ` · ${t("{n} openings", { n: obj.holes.length })}` : ""}${st ? ` · U ${uValue(st.layers, { rsi: 0.17 }).toFixed(2)}` : ""}`);
    grid.append(
      ...bindField(app, t("Slab type"), () => obj.type || "", (v) => { const s2 = slabTypeById(p, v); if (s2) { obj.type = v; obj.thickness = slabTypeThickness(s2); obj.kind = s2.use === "foundation" ? "foundation" : "floor"; } else delete obj.type; }, { options: [["", t("(no type)")], ...allSlabTypes(p).filter((s2) => s2.use !== "ceiling").map((s2) => [s2.id, s2.name])] }),
      ...bindField(app, t("Thickness"), () => obj.thickness, (v) => { obj.thickness = Math.max(10, v); delete obj.type; }, num(10, 10)),
      ...bindField(app, t("Top offset"), () => obj.offset || 0, (v) => { obj.offset = v; }, num(50, -1e5)),
      ...bindField(app, t("Slope"), () => obj.slope || 0, (v) => { obj.slope = Math.max(0, Math.min(60, v)); }, { type: "number", step: "1", min: 0, max: 60, format: (v) => `${v}°` }),
      ...bindField(app, t("Slope direction"), () => obj.slopeDir || 0, (v) => { obj.slopeDir = ((v % 360) + 360) % 360; }, deg),
      ...bindField(app, t("Finish"), () => obj.material || "", (v) => { if (v) obj.material = v; else delete obj.material; }, { options: [["", t("(from the type)")], ...matOpts("floor")] }));
    if (obj.type) lockFields(grid, [t("Thickness")]);
    act(t("Add opening"), "shaft", () => app.run("build.slabOpening"));
    if (obj.holes.length) act(t("Remove openings"), "trash", () => app.store.edit(t("Remove openings"), () => { obj.holes = []; }));
    act(t("Beam system…"), "beam", () => beamSystemDialog(app));
  } else if (kind === "ceilings") {
    title("ceiling", t("Ceiling"), `${(Math.abs(polygonArea(obj.pts)) / 1e6).toFixed(2)} m² · +${(ceilingHeight(p, obj) / 1000).toFixed(2)} m`);
    grid.append(
      ...bindField(app, t("Ceiling type"), () => obj.type || "", (v) => { const s2 = slabTypeById(p, v); if (s2) { obj.type = v; obj.thickness = slabTypeThickness(s2); } else delete obj.type; }, { options: [["", t("(no type)")], ...allSlabTypes(p).filter((s2) => s2.use === "ceiling").map((s2) => [s2.id, s2.name])] }),
      ...bindField(app, t("Height"), () => ceilingHeight(p, obj), (v) => { obj.height = Math.max(100, v); }, num(50, 100)),
      ...bindField(app, t("Thickness"), () => obj.thickness, (v) => { obj.thickness = Math.max(1, v); delete obj.type; }, num(5, 1)),
      ...bindField(app, t("Material"), () => obj.material || "", (v) => { if (v) obj.material = v; else delete obj.material; }, { options: [["", t("(from the type)")], ...matOpts("ceiling"), ...matOpts("wall")].filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i) }));
    if (obj.type) lockFields(grid, [t("Thickness")]);
    act(t("Add opening"), "shaft", () => app.run("build.slabOpening"));
  } else if (kind === "beams") {
    const [z1, z2] = beamEnds(p, obj);
    const lv = levelById(p, obj.level);
    title("beam", Math.abs(z2 - z1) > 1 ? t("Brace") : t("Beam"), `${(beamLength(p, obj) / 1000).toFixed(2)} m · ${t(PROFILE_LABEL[obj.profile])} ${obj.w} × ${obj.h}`);
    grid.append(
      ...typeField("beam"),
      ...bindField(app, t("Profile"), () => obj.profile, (v) => { obj.profile = v; }, { options: tr(PROFILE_LABEL) }),
      ...bindField(app, t("Width"), () => obj.w, (v) => { obj.w = Math.max(10, v); }, num(10, 10)),
      ...bindField(app, t("Depth"), () => obj.h, (v) => { obj.h = Math.max(10, v); }, num(10, 10)),
      ...bindField(app, t("Top at start"), () => z1 - lv.elevation, (v) => { obj.z1 = v; if (obj.z2 === null) obj.z2 = z2 - lv.elevation; }, num(50, -1e5)),
      ...bindField(app, t("Top at end"), () => z2 - lv.elevation, (v) => { obj.z2 = v; if (obj.z1 === null) obj.z1 = z1 - lv.elevation; }, num(50, -1e5)),
      ...bindField(app, t("Material"), () => obj.material || "concrete", (v) => { obj.material = v; }, { options: matOpts("structure").concat(matOpts("wall")).filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i) }));
    lock(["Profile", "Width", "Depth", "Material"]);
    typeActions();
  } else if (kind === "railings") {
    title("railing", t("Railing"), `${(railingLength(obj) / 1000).toFixed(2)} m · ${obj.height} mm`);
    grid.append(
      ...typeField("railing"),
      ...bindField(app, t("Height"), () => obj.height, (v) => { obj.height = Math.max(100, v); }, num(50, 100)),
      ...bindField(app, t("Base height"), () => obj.z || 0, (v) => { obj.z = v; }, num(50, -1e5)),
      ...bindField(app, t("Style"), () => obj.style, (v) => { obj.style = v; }, { options: tr(STYLE_LABEL) }),
      ...bindField(app, t("Baluster spacing"), () => obj.spacing, (v) => { obj.spacing = Math.max(50, v); }, num(10, 50)),
      ...bindField(app, t("Material"), () => obj.material || "steel", (v) => { obj.material = v; }, { options: matOpts("frame").concat(matOpts("structure")).filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i) }));
    lock(["Height", "Style", "Baluster spacing", "Material"]);
    typeActions();
  } else if (kind === "ramps") {
    const m = rampModel(p, obj);
    title("ramp", t("Ramp"), `${(m.length / 1000).toFixed(2)} m · ${(m.slope * 100).toFixed(1)}% (1:${m.slope > 0 ? Math.round(1 / m.slope) : "∞"})`);
    grid.append(
      ...bindField(app, t("Width"), () => obj.width, (v) => { obj.width = Math.max(300, v); }, num(50, 300)),
      ...bindField(app, t("Rise"), () => m.rise, (v) => { obj.rise = v; }, num(50, -1e5)),
      ...bindField(app, t("Thickness"), () => obj.thickness, (v) => { obj.thickness = Math.max(20, v); }, num(10, 20)),
      ...bindField(app, t("Railings"), () => obj.railing, (v) => { obj.railing = v; }, { options: tr(RAIL_LABEL) }),
      ...bindField(app, t("Material"), () => obj.material || "concrete", (v) => { obj.material = v; }, { options: matOpts("floor") }));
  } else if (kind === "shafts") {
    const lvs = shaftLevels(p, obj);
    title("shaft", obj.name || t("Shaft opening"), `${(Math.abs(polygonArea(obj.pts)) / 1e6).toFixed(2)} m² · ${lvs.map((l) => l.name).join(", ")}`);
    const lvOpts = p.levels.map((l) => [l.id, l.name]);
    grid.append(
      ...bindField(app, t("Name"), () => obj.name || "", (v) => { obj.name = v.trim(); }),
      ...bindField(app, t("Base level"), () => obj.level, (v) => { obj.level = v; const a = levelById(p, v), b = levelById(p, obj.top); if (!b || b.elevation < a.elevation) obj.top = v; }, { options: lvOpts }),
      ...bindField(app, t("Top level"), () => obj.top, (v) => { const a = levelById(p, obj.level), b = levelById(p, v); if (b && a && b.elevation >= a.elevation) obj.top = v; }, { options: lvOpts }));
  } else if (kind === "walls") {
    const ct = curtainTypeOf(p, obj);
    if (ct) {
      grid.append(h("span", { class: "prop-section" }, t("Curtain wall")), h("span", {}, ""),
        ...bindField(app, t("Grid spacing along"), () => (obj.curtain && obj.curtain.u) || ct.curtain.u, (v) => { obj.curtain = { ...(obj.curtain || {}), u: Math.max(200, v) }; }, num(50, 200)),
        ...bindField(app, t("Grid spacing up"), () => (obj.curtain && obj.curtain.v) || ct.curtain.v, (v) => { obj.curtain = { ...(obj.curtain || {}), v: Math.max(200, v) }; }, num(50, 200)));
      act(t("Edit curtain-wall type…"), "curtainwall", () => typeCatalogDialog(app, { tab: "curtain", typeId: ct.id }));
    } else {
      const above = levelAbove(p, obj.level);
      const targets = [["", t("(own height)")], ["roof", t("Roof above")], ...p.slabs.filter((s) => above && s.level === above.id).map((s) => [s.id, `${t("Floor slab")} ${above.name}`]), ...p.roofs.map((r) => [r.id, `${t("Roof")} ${(levelById(p, r.level) || {}).name || ""} (${t(r.kind === "edges" ? "Per edge" : r.kind.charAt(0).toUpperCase() + r.kind.slice(1))})`])];
      grid.append(h("span", { class: "prop-section" }, t("Profile")), h("span", {}, ""),
        ...bindField(app, t("Height at end"), () => obj.heightEnd || (obj.height || (levelById(p, obj.level) || {}).height), (v) => { obj.heightEnd = Math.max(100, v); }, num(50, 100)),
        ...bindField(app, t("Base offset"), () => obj.baseOffset || 0, (v) => { if (v) obj.baseOffset = v; else delete obj.baseOffset; }, num(50, -1e5)),
        ...bindField(app, t("Attach top"), () => obj.attachTop || "", (v) => { if (v) obj.attachTop = v; else delete obj.attachTop; }, { options: targets }));
      if (obj.heightEnd) act(t("Level top"), "wall", () => app.store.edit(t("Level top"), () => { delete obj.heightEnd; }));
    }
  } else if (kind === "openings" && (obj.kind === "door" || obj.kind === "window")) {
    grid.append(...typeField(obj.kind),
      ...bindField(app, t("Frame width"), () => obj.frameWidth || 60, (v) => { obj.frameWidth = Math.max(10, v); }, num(5, 10)),
      ...bindField(app, t("Frame depth"), () => obj.frameDepth || 0, (v) => { obj.frameDepth = Math.max(0, v); }, num(5, 0)));
    lock(["Catalogue type", "Type", "Width", "Height", "Frame width", "Frame depth"].slice(1));
    const w = p.walls.find((x) => x.id === obj.wall);
    if (w && isCurtainWall(p, w)) grid.append(h("span", {}, ""), h("small", { class: "prop-sub" }, t("In a curtain wall: it replaces the panels it covers.")));
    typeActions();
  } else if (kind === "columns") {
    grid.append(...typeField("column"));
    lock(["Shape", "Width", "Depth", "Material"]);
    typeActions();
  } else if (kind === "furniture" && obj.kind !== "model") {
    grid.append(...typeField("furniture"));
    lock(["Width", "Depth", "Height", "Colour"]);
    typeActions();
  } else if (kind === "stairs") {
    const shape = obj.shape || "straight";
    grid.append(h("span", { class: "prop-section" }, t("Stair type")), h("span", {}, ""),
      ...bindField(app, t("Shape"), () => shape, (v) => { if (v === "straight") delete obj.shape; else { obj.shape = v; if (v === "L" && !obj.length2) obj.length2 = Math.round(obj.length * 0.7); if (v === "spiral" && !obj.radius) { obj.radius = 300; obj.sweep = 270; } } }, { options: tr(SHAPE_LABEL) }),
      ...bindField(app, t("Railings"), () => obj.railing || "none", (v) => { obj.railing = v; }, { options: tr(RAIL_LABEL) }));
    if (shape !== "straight") grid.append(...bindField(app, t("Turn"), () => String(obj.turn === -1 ? -1 : 1), (v) => { obj.turn = +v; }, { options: [["1", t("Right")], ["-1", t("Left")]] }));
    if (shape === "L") grid.append(...bindField(app, t("Second flight"), () => obj.length2 || obj.length, (v) => { obj.length2 = Math.max(300, v); }, num(50, 300)));
    if (shape === "U") grid.append(...bindField(app, t("Landing depth"), () => obj.landing || obj.width, (v) => { obj.landing = Math.max(300, v); }, num(50, 300)), ...bindField(app, t("Well gap"), () => obj.gap ?? 100, (v) => { obj.gap = Math.max(0, v); }, num(10, 0)));
    if (shape === "spiral") grid.append(...bindField(app, t("Inner radius"), () => obj.radius || 300, (v) => { obj.radius = Math.max(50, v); }, num(25, 50)), ...bindField(app, t("Sweep angle"), () => obj.sweep || 270, (v) => { obj.sweep = Math.max(90, Math.min(720, v)); }, { type: "number", step: "15", min: 90, max: 720, format: (v) => `${v}°` }));
    if (shape !== "straight") {
      const lay = stairLayout(obj, stairRise(p, obj));
      grid.append(h("span", {}, ""), h("small", { class: "prop-sub" }, t("{a} + {b} steps, riser {r} mm", { a: lay.n1, b: lay.n2, r: Math.round(lay.riser) })));
    }
  } else if (kind === "roofs") {
    const edges = obj.kind === "edges";
    grid.append(h("span", {}, ""), checkbox(edges, t("Slope per edge (footprint roof)"), { onChange: (v) => app.store.edit(t("Edit roof"), () => { if (v) { obj.kind = "edges"; obj.edges = obj.pts.map(() => ({ slope: true })); } else { obj.kind = "hip"; delete obj.edges; } }) }));
    if (edges) ui.body.append(edgeTable(app, obj));
    act(t("Add opening"), "shaft", () => app.run("build.slabOpening"));
    if (obj.holes && obj.holes.length) act(t("Remove openings"), "trash", () => app.store.edit(t("Remove openings"), () => { delete obj.holes; }));
  }
  if (obj.option) grid.append(h("span", {}, t("Design option")), h("span", { class: "mono-val" }, optionName(p, obj.option)));
}

// Grey out (and lock) the fields a type controls.
function lockFields(grid, labels) {
  for (const el of grid.querySelectorAll("[data-field]")) {
    if (!labels.includes(el.dataset.field)) continue;
    el.style.opacity = "0.55";
    el.style.pointerEvents = "none";
    el.title = t("Set by the type: edit the type, or choose (no type)");
    for (const c of el.querySelectorAll("input, select, button")) c.disabled = true;
    if (el.tagName === "SELECT" || el.tagName === "INPUT") el.disabled = true;
  }
}

// Per-edge slopes of a footprint roof: slope on/off, pitch, overhang.
function edgeTable(app, roof) {
  const tbl = h("table", { class: "grid el-edges" }, h("tr", {}, h("th", {}, "#"), h("th", {}, t("Sloped")), h("th", {}, t("Pitch")), h("th", {}, t("Overhang"))));
  roof.edges.forEach((e, i) => {
    tbl.append(h("tr", {},
      h("td", {}, String(i + 1)),
      h("td", {}, checkbox(e.slope !== false, "", { onChange: (v) => app.store.edit(t("Edit roof"), () => { e.slope = v; }) })),
      h("td", {}, stepper(e.pitch ?? roof.pitch, { min: 0, max: 75, step: 5, editable: true, format: (v) => `${v}°`, onChange: (v) => app.store.edit(t("Edit roof"), () => { e.pitch = v; }) })),
      h("td", {}, stepper(e.overhang ?? roof.overhang, { min: 0, max: 3000, step: 50, editable: true, format: (v) => String(Math.round(v)), onChange: (v) => app.store.edit(t("Edit roof"), () => { e.overhang = v; }) }))));
  });
  return h("div", { style: { margin: "6px 0" } }, h("div", { class: "prop-section" }, t("Roof edges")), tbl);
}

// ---------------------------------------------------------------- context menu
export function elementMenuItems(app, hit) {
  const items = [];
  const o = hit.obj;
  if (o.typeId) items.push({ label: t("Edit type…"), icon: "typesCat", action: () => typeCatalogDialog(app, { typeId: o.typeId }) }, { label: t("Select all instances of this type"), icon: "select", action: () => selectTypeInstances(app, o.typeId) });
  else if (categoryOf(hit.kind, o)) items.push({ label: t("Create a type from the selection"), icon: "typesCat", action: () => typeFromSelection(app) });
  if (["slabs", "ceilings", "roofs"].includes(hit.kind)) items.push({ label: t("Opening in a slab, ceiling or roof"), icon: "shaft", action: () => app.run("build.slabOpening") });
  if (hit.kind === "slabs" || hit.kind === "rooms") items.push({ label: t("Beam system…"), icon: "beam", action: () => beamSystemDialog(app) });
  if (hit.kind === "walls" && !isCurtainWall(app.store.project, o)) items.push({ label: o.attachTop ? t("Detach from the roof / slab") : t("Attach the selected walls to the roof or slab above"), icon: "roof", action: () => attachWalls(app) });
  if (hit.kind === "rooms") items.push({ label: t("Ceilings in every room of this level"), icon: "ceiling", action: () => autoCeilings(app) });
  items.push({ label: t("Array (linear / radial)…"), icon: "array", action: () => arrayDialog(app) });
  if ((app.store.project.designOptions || []).length) items.push({ label: t("Design options…"), icon: "options", action: () => designOptionsDialog(app) });
  return items;
}

// ---------------------------------------------------------------- type catalogue
// tab: a category ("door" …), "curtain", "slab" or "materials"; typeId opens it.
export async function typeCatalogDialog(app, { tab = null, typeId = null } = {}) {
  injectStyle();
  const p = app.store.project;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // Working copies: catalogue (own + built-in), curtain wall types, slab types.
  const types = allTypes(p).map(clone);
  const curtains = p.wallTypes.filter((w) => w.kind === "curtain").map(clone);
  if (!curtains.length) curtains.push(...clone(DEFAULT_CURTAIN_TYPES));
  const slabs = allSlabTypes(p).map(clone);
  const start = typeId ? (types.find((x) => x.id === typeId) || {}).category || (curtains.some((c) => c.id === typeId) ? "curtain" : null) : null;
  let cat = tab || start || "door";
  let cur = typeId;
  const used = (id) => {
    if (cat === "curtain") return p.walls.filter((w) => w.type === id).length;
    if (cat === "slab") return p.slabs.filter((s) => s.type === id).length + p.ceilings.filter((s) => s.type === id).length;
    return typeInstances(p, id).length;
  };
  const listOf = () => (cat === "curtain" ? curtains : cat === "slab" ? slabs : types.filter((x) => x.category === cat));
  const cats = [...TYPE_CATEGORIES.map((c) => [c, t(CAT_LABEL[c])]), ["curtain", t("Curtain walls")], ["slab", t("Floor and ceiling types")], ["materials", t("Materials")]];
  const catHost = h("div", { class: "el-cat" });
  const listHost = h("div", { class: "wt-list" });
  const editHost = h("div", { class: "wt-edit" });
  const draw = () => {
    catHost.innerHTML = "";
    for (const [c, label] of cats) catHost.append(h("button", { class: `wt-row ${c === cat ? "on" : ""}`, "data-cat": c, onclick: () => { cat = c; cur = null; draw(); } }, h("b", {}, label)));
    listHost.innerHTML = "";
    editHost.innerHTML = "";
    if (cat === "materials") { listHost.append(h("div", { class: "empty-note" }, t("Every material with its colour and thermal properties; the U-values of the layered types follow from them."))); editHost.append(materialsTable(p)); return; }
    const list = listOf();
    if (!list.some((x) => x.id === cur)) cur = list.length ? list[0].id : null;
    for (const ty of list) {
      listHost.append(h("button", { class: `wt-row ${ty.id === cur ? "on" : ""}`, "data-type": ty.id, onclick: () => { cur = ty.id; draw(); } }, h("b", {}, ty.name, cat !== "curtain" && cat !== "slab" && isBuiltinType(ty.id) ? h("span", { class: "badge" }, t("built-in")) : null), h("small", {}, t("{n} placed", { n: used(ty.id) }))));
    }
    listHost.append(h("div", { class: "prop-actions" },
      h("button", { class: "btn small", "data-act": "duplicate", disabled: !cur, onclick: () => { const src = list.find((x) => x.id === cur); const c = clone(src); c.id = uid(cat === "curtain" ? "cw" : cat === "slab" ? "st" : "ty"); c.name = `${src.name} (${t("copy")})`; (cat === "curtain" ? curtains : cat === "slab" ? slabs : types).push(c); cur = c.id; draw(); } }, h("span", { html: icon("plus", 12) }), t("Duplicate")),
      h("button", { class: "btn small danger", disabled: !cur || used(cur) > 0 || (cat !== "curtain" && cat !== "slab" && isBuiltinType(cur)) || (cat === "slab" && DEFAULT_SLAB_TYPES.some((s) => s.id === cur)), onclick: () => { const arr = cat === "curtain" ? curtains : cat === "slab" ? slabs : types; arr.splice(arr.findIndex((x) => x.id === cur), 1); cur = null; draw(); } }, t("Delete"))));
    const ty = list.find((x) => x.id === cur);
    if (!ty) return;
    const nameEl = input(ty.name, { onInput: (v) => { ty.name = v; } });
    nameEl.addEventListener("change", draw);
    const rows = [field(t("Name"), nameEl)];
    const num = (obj, k, step, min = 0, max = 1e6, unit = "mm") => field(t(PARAM_LABEL[k] || k), stepper(obj[k] ?? 0, { min, max, step, editable: true, format: (v) => `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ""}`, onChange: (v) => { obj[k] = v; } }));
    const sel = (obj, k, opts) => field(t(PARAM_LABEL[k] || k), select(obj[k], opts, { onChange: (v) => { obj[k] = v; } }));
    if (cat === "curtain") {
      const c = ty.curtain = { ...CURTAIN_DEFAULTS, ...(ty.curtain || {}) };
      rows.push(num(c, "u", 50, 200, 10000), num(c, "v", 50, 200, 10000), num(c, "mullion", 5, 10, 500), num(c, "depth", 10, 20, 1000), num(c, "spandrel", 50, 0, 3000),
        sel(c, "gridMode", [["even", t("Equal cells (maximum spacing)")], ["fixed", t("Fixed spacing from the start")]]),
        sel(c, "panel", [...materialsFor("wall").map((m) => [m.id, t(m.name)])]), sel(c, "frame", [...materialsFor("frame").map((m) => [m.id, t(m.name)])]));
    } else if (cat === "slab") {
      rows.push(sel(ty, "use", [["floor", t("Floor")], ["foundation", t("Foundation")], ["ceiling", t("Ceiling")]]));
      const tbl = h("table", { class: "grid" }, h("tr", {}, ...["#", "Function", "Material", "Thickness", ""].map((x) => h("th", {}, x === "#" || !x ? x : t(x)))));
      ty.layers.forEach((l, i) => tbl.append(h("tr", {}, h("td", {}, String(i + 1)),
        h("td", {}, select(l.function, [["finish", t("Finish")], ["structure", t("Structure")], ["insulation", t("Insulation")], ["air", t("Air gap")]], { onChange: (v) => { l.function = v; } })),
        h("td", {}, select(l.material, MATERIALS.map((m) => [m.id, t(m.name)]), { onChange: (v) => { l.material = v; draw(); } })),
        h("td", {}, stepper(l.thickness, { min: 1, max: 2000, step: 5, editable: true, format: (v) => `${v} mm`, onChange: (v) => { l.thickness = v; draw(); } })),
        h("td", {}, h("button", { class: "icon-btn", title: t("Delete"), disabled: ty.layers.length < 2, html: icon("trash", 14), onclick: () => { ty.layers.splice(i, 1); draw(); } })))));
      rows.push(h("div", { class: "prop-section" }, t("Layers (top → bottom) — total {t} mm · U {u} W/m²K", { t: slabTypeThickness(ty), u: uValue(ty.layers, { rsi: 0.17 }).toFixed(2) })), tbl,
        h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => { ty.layers.push({ material: "concrete", thickness: 100, function: "structure" }); draw(); } }, h("span", { html: icon("plus", 12) }), t("Add layer"))));
    } else {
      const pr = ty.params;
      for (const k of [...TYPE_PARAMS[cat], ...(TYPE_DEFAULTS[cat] || [])]) {
        if (k === "type") rows.push(sel(pr, k, cat === "door" ? [["single", t("Single")], ["double", t("Double")], ["sliding", t("Sliding")], ["garage", t("Garage")]] : [["casement", t("Casement")], ["fixed", t("Fixed")], ["sliding", t("Sliding")]]));
        else if (k === "shape") rows.push(sel(pr, k, [["rect", t("Rectangular")], ["round", t("Round")]]));
        else if (k === "profile") rows.push(sel(pr, k, tr(PROFILE_LABEL)));
        else if (k === "style") rows.push(sel(pr, k, tr(STYLE_LABEL)));
        else if (k === "material") rows.push(sel(pr, k, MATERIALS.filter((m) => m.use.some((u) => ["wall", "structure", "frame"].includes(u))).map((m) => [m.id, t(m.name)])));
        else if (k === "kind") rows.push(sel(pr, k, allFurniture().map((d) => [d.kind, t(d.name)])));
        else if (k === "color") rows.push(field(t("Colour"), input(pr.color || "#8a9bb0", { type: "color", onChange: (v) => { pr.color = v; } })));
        else rows.push(num(pr, k, k === "spacing" ? 10 : 10, 0));
      }
      rows.push(h("div", { class: "prop-actions" },
        h("button", { class: "btn small", "data-act": "select-instances", onclick: () => close("select") }, h("span", { html: icon("select", 12) }), t("Select all instances")),
        h("button", { class: "btn small", "data-act": "apply", onclick: () => close("apply") }, t("Apply to the selection"))));
    }
    editHost.append(h("div", { class: "form-grid" }, ...rows));
  };
  let close = () => {};
  draw();
  const result = await modal({ title: t("Type catalogue"), width: 980, body: h("div", { class: "el-types" }, catHost, listHost, editHost), buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }], onOpen: (_box, c) => { close = c; } });
  if (!result) return null;
  const builtins = new Map(DEFAULT_TYPES.map((x) => [x.id, JSON.stringify(x)]));
  app.store.edit(t("Type catalogue"), (pr) => {
    // Save the project's own types and the built-ins that were changed.
    pr.types = types.filter((x) => !builtins.has(x.id) || builtins.get(x.id) !== JSON.stringify(x));
    const keep = pr.wallTypes.filter((w) => w.kind !== "curtain");
    const usedCurtain = curtains.filter((c) => pr.walls.some((w) => w.type === c.id) || !DEFAULT_CURTAIN_TYPES.some((d) => d.id === c.id && JSON.stringify(d) === JSON.stringify(c)) || pr.wallTypes.some((w) => w.id === c.id));
    for (const c of usedCurtain) c.layers = [{ material: c.curtain.panel, thickness: c.curtain.depth, function: "finish" }];
    pr.wallTypes = [...keep, ...usedCurtain];
    const slabBuiltins = new Map(DEFAULT_SLAB_TYPES.map((x) => [x.id, JSON.stringify(x)]));
    pr.slabTypes = slabs.filter((x) => !slabBuiltins.has(x.id) || slabBuiltins.get(x.id) !== JSON.stringify(x));
    for (const w of pr.walls) { const c = usedCurtain.find((x) => x.id === w.type); if (c) w.thickness = c.curtain.depth; }
    for (const s of [...pr.slabs, ...pr.ceilings]) { const st = slabTypeById(pr, s.type); if (st) s.thickness = slabTypeThickness(st); }
    applyTypes(pr);
    if (result === "apply" && cur) {
      const ty = types.find((x) => x.id === cur);
      for (const it of app.plan.selectedItems()) {
        const obj = (pr[it.kind] || []).find((x) => x.id === it.obj.id);
        if (obj && ty && categoryOf(it.kind, obj) === ty.category) { obj.typeId = ty.id; applyType(ty, obj); }
      }
    }
  });
  if (result === "select" && cur) selectTypeInstances(app, cur);
  return result;
}

const PARAM_LABEL = {
  width: "Width", height: "Height", w: "Width", d: "Depth", h: "Height", frameWidth: "Frame width", frameDepth: "Frame depth", sill: "Default sill height", type: "Operation", shape: "Shape",
  material: "Material", profile: "Profile", kind: "Furniture", color: "Colour", spacing: "Baluster spacing", baluster: "Baluster size", rail: "Top rail size", style: "Style",
  u: "Grid spacing along", v: "Grid spacing up", mullion: "Mullion width", depth: "Mullion depth", spandrel: "Spandrel height", gridMode: "Grid layout", panel: "Panel material", frame: "Frame material", use: "Use",
};

function materialsTable(p) {
  const tbl = h("table", { class: "grid" }, h("tr", {}, ...["Material", "λ (W/mK)", "Density (kg/m³)", "Specific heat (J/kgK)"].map((x) => h("th", {}, t(x)))));
  for (const m of MATERIALS) tbl.append(h("tr", {}, h("td", {}, h("span", { class: "el-swatch", style: { background: m.color } }), t(m.name)), h("td", { class: "num" }, m.lambda ?? ""), h("td", { class: "num" }, m.density ?? ""), h("td", { class: "num" }, m.cp ?? "")));
  const u = h("table", { class: "grid" }, h("tr", {}, ...["Kind", "Type", "Thickness", "U (W/m²K)"].map((x) => h("th", {}, t(x)))));
  for (const r of thermalSchedule(p)) u.append(h("tr", {}, h("td", {}, t(r.kind)), h("td", {}, r.type), h("td", { class: "num" }, String(r.thickness)), h("td", { class: "num" }, r.uValue.toFixed(3))));
  return h("div", { style: { maxHeight: "440px", overflow: "auto" } }, tbl, h("div", { class: "prop-section" }, t("U-values of the layered types")), u);
}

// ---------------------------------------------------------------- design options
export async function designOptionsDialog(app) {
  const p = app.store.project;
  const sets = JSON.parse(JSON.stringify(p.designOptions || []));
  const host = h("div", {});
  const count = (oid) => Object.values(p).filter(Array.isArray).reduce((s, arr) => s + arr.filter((x) => x && x.option === oid).length, 0);
  const actions = [];
  const draw = () => {
    host.innerHTML = "";
    if (!sets.length) host.append(h("div", { class: "empty-note" }, t("Design options keep alternatives of a part of the design in one project (e.g. two lobby layouts). Everything else is the main model; only the active option of each set is shown, built, scheduled and exported.")));
    for (const s of sets) {
      const nameEl = input(s.name, { onInput: (v) => { s.name = v; } });
      const rows = s.options.map((o) => h("div", { class: "layer-row", style: { display: "flex", gap: "8px", alignItems: "center" } },
        h("input", { type: "radio", name: `set-${s.id}`, checked: s.active === o.id, onchange: () => { s.active = o.id; } }),
        input(o.name, { onInput: (v) => { o.name = v; } }),
        h("small", {}, t("{n} items", { n: count(o.id) })),
        h("button", { class: "btn small", "data-act": "add-selection", onclick: () => { actions.push(["add", o.id]); toast(t("The selection goes into \"{o}\" when you press OK.", { o: o.name }), "info", 2000); } }, t("Add the selection")),
        h("button", { class: "btn small danger", disabled: s.options.length < 2, onclick: () => { actions.push(["drop", o.id]); s.options = s.options.filter((x) => x !== o); if (s.active === o.id) s.active = s.options[0].id; draw(); } }, t("Delete"))));
      host.append(h("div", { class: "panel", style: { padding: "8px", marginBottom: "8px" } }, field(t("Option set"), nameEl), ...rows,
        h("div", { class: "prop-actions" },
          h("button", { class: "btn small", onclick: () => { s.options.push({ id: uid("do"), name: `${t("Option")} ${s.options.length + 1}` }); draw(); } }, h("span", { html: icon("plus", 12) }), t("Add option")),
          h("button", { class: "btn small", onclick: () => { actions.push(["accept", s.id]); toast(t("The active option becomes part of the main model when you press OK."), "info", 2500); } }, t("Accept the active option")))));
    }
    host.append(h("div", { class: "prop-actions" },
      h("button", { class: "btn small", "data-act": "new-set", onclick: () => { const a = { id: uid("do"), name: `${t("Option")} 1` }, b = { id: uid("do"), name: `${t("Option")} 2` }; sets.push({ id: uid("ds"), name: `${t("Option set")} ${sets.length + 1}`, options: [a, b], active: a.id }); draw(); } }, h("span", { html: icon("plus", 12) }), t("New option set")),
      h("button", { class: "btn small", onclick: () => { actions.push(["main", null]); toast(t("The selection goes back into the main model when you press OK."), "info", 2000); } }, t("Move the selection to the main model"))));
  };
  draw();
  const ok = await modal({ title: t("Design options"), width: 720, body: host, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return false;
  const sel = new Set(app.plan.selectedItems().map((i) => i.obj.id));
  app.store.edit(t("Design options"), (pr) => {
    pr.designOptions = sets;
    const all = Object.values(pr).filter((v) => Array.isArray(v));
    for (const [kind, id] of actions) {
      for (const arr of all) for (const it of arr) {
        if (!it || typeof it !== "object") continue;
        if (kind === "add" && sel.has(it.id)) it.option = id;
        if (kind === "main" && sel.has(it.id)) delete it.option;
      }
      if (kind === "drop") for (const k of Object.keys(pr)) if (Array.isArray(pr[k])) pr[k] = pr[k].filter((x) => !(x && x.option === id));
      if (kind === "accept") {
        const s = pr.designOptions.find((x) => x.id === id);
        if (!s) continue;
        const others = new Set(s.options.filter((o) => o.id !== s.active).map((o) => o.id));
        for (const k of Object.keys(pr)) if (Array.isArray(pr[k])) pr[k] = pr[k].filter((x) => !(x && others.has(x.option)));
        for (const arr of Object.values(pr).filter(Array.isArray)) for (const it of arr) if (it && it.option === s.active) delete it.option;
        pr.designOptions = pr.designOptions.filter((x) => x.id !== id);
      }
    }
    // Openings of deleted walls go too.
    const walls = new Set(pr.walls.map((w) => w.id));
    pr.openings = pr.openings.filter((o) => walls.has(o.wall));
  });
  app.plan.selectionChanged();
  return true;
}

// ---------------------------------------------------------------- arrays
// Linear: n copies every (dx, dy); radial: n copies turned about the centre.
export function arrayItems(p, ids, level, { mode = "linear", count = 3, dx = 1000, dy = 0, angle = 360, cx = null, cy = null, group = false } = {}) {
  const clip = ops.copyItems(p, ids);
  const created = [];
  const n = Math.max(2, Math.round(count));
  const c = cx !== null && cy !== null ? [cx, cy] : clip.centre;
  const step = mode === "radial" ? (Math.abs(angle) >= 360 ? angle / n : angle / (n - 1)) : 0;
  for (let k = 1; k < n; k++) {
    let added;
    if (mode === "radial") {
      added = ops.pasteItems(p, clip, level, clip.centre[0], clip.centre[1]);
      ops.rotateItems(p, added, step * k, c);
    } else added = ops.pasteItems(p, clip, level, clip.centre[0] + dx * k, clip.centre[1] + dy * k);
    if (group) { const gid = uid("grp"); for (const k2 of LEVEL_COLLECTIONS) for (const x of p[k2]) if (added.includes(x.id)) x.group = gid; }
    created.push(...added);
  }
  return created;
}

export async function arrayDialog(app) {
  const ids = [...app.plan.sel];
  if (!ids.length) { toast(t("Select what to repeat first."), "warn"); return null; }
  const o = { mode: "linear", count: 4, dx: 3000, dy: 0, angle: 360, group: true };
  const c = ops.selectionCentre(app.store.project, ids) || [0, 0];
  o.cx = Math.round(c[0]); o.cy = Math.round(c[1]) + 5000;
  const body = h("div", { class: "form-grid" },
    field(t("Kind"), select(o.mode, [["linear", t("Linear")], ["radial", t("Radial")]], { onChange: (v) => { o.mode = v; } })),
    field(t("Number of items (with the original)"), stepper(o.count, { min: 2, max: 200, step: 1, editable: true, onChange: (v) => { o.count = v; } })),
    field(t("Spacing X (linear)"), stepper(o.dx, { min: -1e6, max: 1e6, step: 100, editable: true, format: (v) => `${v} mm`, onChange: (v) => { o.dx = v; } })),
    field(t("Spacing Y (linear)"), stepper(o.dy, { min: -1e6, max: 1e6, step: 100, editable: true, format: (v) => `${v} mm`, onChange: (v) => { o.dy = v; } })),
    field(t("Total angle (radial)"), stepper(o.angle, { min: -360, max: 360, step: 15, editable: true, format: (v) => `${v}°`, onChange: (v) => { o.angle = v; } })),
    field(t("Centre X (radial)"), stepper(o.cx, { min: -1e7, max: 1e7, step: 100, editable: true, onChange: (v) => { o.cx = v; } })),
    field(t("Centre Y (radial)"), stepper(o.cy, { min: -1e7, max: 1e7, step: 100, editable: true, onChange: (v) => { o.cy = v; } })),
    field(t("Group"), checkbox(o.group, t("Group each copy"), { onChange: (v) => { o.group = v; } })));
  const ok = await modal({ title: t("Array"), width: 560, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
  if (!ok) return null;
  let made = [];
  app.store.edit(t("Array"), (p) => { made = arrayItems(p, ids, app.plan.level, o); });
  app.plan.select([...ids, ...made]);
  toast(t("{n} copies made.", { n: o.count - 1 }), "ok");
  return made;
}

// ---------------------------------------------------------------- beam systems
export async function beamSystemDialog(app) {
  const it = app.plan.selectedItems().find((i) => i.kind === "slabs" || i.kind === "rooms");
  if (!it) { toast(t("Select a floor slab or a room for the beam system."), "warn"); return null; }
  const v = await promptDialog(t("Beam spacing in mm, and the direction in degrees (e.g. 1200 or 1200 90)"), "1200 0", { title: t("Beam system") });
  if (v === null) return null;
  const [spacing, angle] = String(v).split(/[\s,;]+/).map(parseFloat);
  if (!(spacing >= 200)) return null;
  const ty = typeById(app.store.project, app.settings.beamType || "beam-timber-100x250");
  const lines = beamSystem(it.obj.pts, spacing, Number.isFinite(angle) ? angle : 0, 100);
  const ids = [];
  app.store.edit(t("Beam system"), (p) => {
    const gid = uid("grp");
    for (const l of lines) {
      const b = { id: uid("bm"), level: it.obj.level, ...l, w: 100, h: 250, profile: "rect", z1: null, z2: null, material: "timber", group: gid, phase: app.settings.drawPhase || "new" };
      if (ty) { b.typeId = ty.id; applyType(ty, b); }
      p.beams.push(b);
      ids.push(b.id);
    }
  });
  app.plan.select(ids);
  toast(t("{n} beams laid out every {s} mm (grouped).", { n: ids.length, s: spacing }), "ok");
  return ids;
}

// ---------------------------------------------------------------- schedules
// Extra tabs for the schedules dialog: elements and types.
export function elementScheduleTabs(app, tbl, f2) {
  const p = app.store.project;
  const rows = elementSchedule(p);
  const cols = [["category", t("Element"), (v) => t(v)], ["level", t("Level")], ["type", t("Type")], ["length", t("Length (m)"), f2], ["area", "m²", f2], ["volume", "m³", f2], ["uValue", "U (W/m²K)", (v) => (v === null || v === undefined ? "" : (+v).toFixed(2))]];
  const totals = elementTotals(p);
  const tcols = [["category", t("Element"), (v) => t(v)], ["count", t("Count")], ["length", t("Length (m)"), f2], ["area", "m²", f2], ["volume", "m³", f2]];
  const typeCols = [["category", t("Category"), (v) => t(CAT_LABEL[v] || v)], ["type", t("Type")], ["count", t("Count")], ["params", t("Type parameters")]];
  return [
    { id: "e", label: t("Building elements"), body: rows.length ? h("div", {}, tbl(tcols, totals), h("div", { class: "prop-section" }, t("Every element")), tbl(cols, rows)) : h("div", { class: "empty-note" }, t("No slabs, ceilings, beams, railings, ramps, shafts or curtain walls yet.")), rows, cols },
    { id: "t", label: t("Types"), body: tbl(typeCols, typeSchedule(p)), rows: typeSchedule(p), cols: typeCols },
  ];
}

export { activeModel, dist, wallLength };
