// Towers and bridges (src/core/structures.js) in the UI: the Build menu
// commands, the parameter dialogs (also used to edit an existing structure:
// its members are made again) and the structure panel shown when the
// selection is one structure.

import { h, modal, field, select, stepper, checkbox, toast } from "./widgets.js";
import { t } from "./i18n.js";
import { materialPicker } from "./matpicker.js";
import { TOWER_DEFAULTS, BRIDGE_DEFAULTS, BRIDGE_TYPES, addStructure, updateStructure, removeStructure } from "../core/structures.js";
import { memberLength, memberWeight } from "../core/members.js";
import { materialById } from "../lib/materials.js";

export const BRIDGE_TYPE_LABEL = { beam: "Girder bridge", truss: "Truss bridge", arch: "Tied-arch bridge", suspension: "Suspension bridge", cableStayed: "Cable-stayed bridge",
  deckArch: "Deck arch bridge", haunched: "Haunched girder bridge", harp: "Single-pylon harp bridge", extradosed: "Extradosed bridge", ribbon: "Stress-ribbon footbridge" };

// A stepper in metres for a parameter kept in millimetres.
const metres = (o, k, { min = 0, max = 1e4, step = 1 } = {}) => stepper(Math.round((o[k] / 1000) * 100) / 100, { min, max, step, editable: true, format: (v) => `${Math.round(v * 100) / 100} m`, onChange: (v) => { o[k] = Math.round(v * 1000); } });
const mm = (o, k, { min = 0, max = 1e5, step = 10 } = {}) => stepper(o[k], { min, max, step, editable: true, format: (v) => `${Math.round(v)} mm`, onChange: (v) => { o[k] = v; } });

// Where a new structure goes: the middle of the plan view.
function viewCentre(app) {
  const vp = app.plan && app.plan.vp;
  if (!vp || !vp.visibleWorld) return [0, 0];
  const b = vp.visibleWorld();
  return [Math.round((b.x1 + b.x2) / 2), Math.round((b.y1 + b.y2) / 2)];
}

export async function towerDialog(app, st = null) {
  const o = JSON.parse(JSON.stringify({ ...TOWER_DEFAULTS, ...(st ? st.params : {}) }));
  if (!st) [o.x, o.y] = viewCentre(app);
  let platforms = (o.platforms || []).length > 0;
  const body = h("div", { class: "form-grid" },
    field(t("Height"), metres(o, "height", { min: 3, max: 1000 })),
    field(t("Mast on top"), metres(o, "mast", { min: 0, max: 200 })),
    field(t("Width at the base"), metres(o, "baseWidth", { min: 0.5, max: 200, step: 0.5 })),
    field(t("Width at the top"), metres(o, "topWidth", { min: 0.2, max: 200, step: 0.5 })),
    field(t("Panels"), stepper(o.panels, { min: 1, max: 60, step: 1, editable: true, onChange: (v) => { o.panels = Math.round(v); } })),
    field(t("Sides"), select(String(o.sides), [["3", t("3 (triangular)")], ["4", t("4 (square)")], ["6", t("6 (hexagonal)")]], { onChange: (v) => { o.sides = +v; } })),
    field(t("Bracing"), select(o.bracing, [["X", t("X bracing")], ["K", t("K bracing")], ["Z", t("Single diagonal")]], { onChange: (v) => { o.bracing = v; } })),
    field(t("Leg diameter"), mm(o.leg, "w", { min: 20, max: 5000 })),
    field(t("Brace size"), mm(o.brace, "w", { min: 20, max: 2000 })),
    field(t("Material"), materialPicker(o.material, { uses: ["structure", "frame"], onChange: (v) => { o.material = v; } })),
    field(t("Turn"), stepper(o.rot || 0, { min: -360, max: 360, step: 15, editable: true, format: (v) => `${v}°`, onChange: (v) => { o.rot = v; } })),
    field(t("Platforms"), checkbox(platforms, t("Walkways at mid-height and at the top"), { onChange: (v) => { platforms = v; } })));
  o.brace.h = o.brace.w; o.strut = { ...o.strut };
  const ok = await modal({ icon: "tower", title: st ? t("Edit tower") : t("Lattice tower"), width: 600, body, buttons: [{ label: t("Cancel"), value: false }, { label: st ? t("Apply") : t("Create"), value: true, primary: true }] });
  if (!ok) return null;
  o.brace.h = o.brace.w;
  o.strut = { ...o.strut, w: Math.round(o.brace.w * 0.8), h: Math.round(o.brace.w * 0.8) };
  o.platforms = platforms ? [0.5, 1] : [];
  o.leg.t = Math.max(6, Math.round(o.leg.w * 0.04));
  return commit(app, "tower", st, o, t("Lattice tower"));
}

export async function bridgeDialog(app, st = null) {
  const o = JSON.parse(JSON.stringify({ ...BRIDGE_DEFAULTS, ...(st ? st.params : {}) }));
  if (!st) { const [cx, cy] = viewCentre(app); o.x = cx - o.length / 2; o.y = cy; }
  const body = h("div", { class: "form-grid" },
    field(t("Kind"), select(o.type, BRIDGE_TYPES.map((k) => [k, t(BRIDGE_TYPE_LABEL[k])]), { onChange: (v) => { o.type = v; } })),
    field(t("Spans"), stepper(o.spans, { min: 1, max: 40, step: 1, editable: true, onChange: (v) => { o.spans = Math.round(v); } })),
    field(t("Length"), metres(o, "length", { min: 10, max: 5000, step: 10 })),
    field(t("Deck width"), metres(o, "width", { min: 2, max: 60, step: 0.5 })),
    field(t("Deck height above the ground"), metres(o, "deckZ", { min: 0, max: 300, step: 0.5 })),
    field(t("Deck depth"), metres(o, "deckDepth", { min: 0.3, max: 15, step: 0.1 })),
    field(t("Grade"), stepper(o.grade, { min: -12, max: 12, step: 0.5, editable: true, format: (v) => `${v}%`, onChange: (v) => { o.grade = v; } })),
    field(t("Crest (rise at mid-length)"), metres(o, "crest", { min: -50, max: 50, step: 0.5 })),
    field(t("Curve radius (0 = straight)"), metres(o, "radius", { min: -100000, max: 100000, step: 50 })),
    field(t("Direction"), stepper(o.angle, { min: -360, max: 360, step: 15, editable: true, format: (v) => `${v}°`, onChange: (v) => { o.angle = v; } })),
    field(t("Truss depth / arch rise / tower height (0 = automatic)"), metres(o, "height", { min: 0, max: 500 })),
    field(t("Piers"), select(o.pierShape, [["round", t("Round")], ["rect", t("Wall-like")]], { onChange: (v) => { o.pierShape = v; } })),
    field(t("Concrete"), materialPicker(o.material, { uses: ["structure", "wall"], onChange: (v) => { o.material = v; } })),
    field(t("Steel"), materialPicker(o.steel, { uses: ["structure", "frame"], onChange: (v) => { o.steel = v; } })),
    field(t("Cables"), materialPicker(o.cable, { uses: ["structure", "frame"], onChange: (v) => { o.cable = v; } })),
    field(t("Railings"), checkbox(o.railing, t("Handrails along both edges"), { onChange: (v) => { o.railing = v; } })));
  const ok = await modal({ icon: "bridge", title: st ? t("Edit bridge") : t("Bridge"), width: 640, body, buttons: [{ label: t("Cancel"), value: false }, { label: st ? t("Apply") : t("Create"), value: true, primary: true }] });
  if (!ok) return null;
  return commit(app, "bridge", st, o, t(BRIDGE_TYPE_LABEL[o.type]));
}

function commit(app, kind, st, params, name) {
  let rec = null;
  app.store.edit(st ? (kind === "tower" ? t("Edit tower") : t("Edit bridge")) : kind === "tower" ? t("Lattice tower") : t("Bridge"), (p) => {
    rec = st ? updateStructure(p, st.id, params) : addStructure(p, kind, app.plan.level, params, name);
  });
  if (!rec) return null;
  const ids = app.store.project.members.filter((m) => m.structure === rec.id).map((m) => m.id);
  app.plan.select(ids);
  if (!st) app.plan.zoomFit();
  toast(t("{n} members made.", { n: ids.length }), "ok");
  return rec;
}

// The structure of the current selection, when it is all one structure.
export function selectedStructure(app) {
  const items = app.plan.selectedItems();
  if (!items.length || items.some((i) => i.kind !== "members")) return null;
  const id = items[0].obj.structure;
  if (!id || items.some((i) => i.obj.structure !== id)) return null;
  return (app.store.project.structures || []).find((s) => s.id === id) || null;
}

export const editStructure = (app, st) => (st.kind === "tower" ? towerDialog(app, st) : bridgeDialog(app, st));

// The properties panel for a selected tower or bridge: a summary (members,
// steel and concrete weights) and its actions.
export function structurePanel(app, body, st) {
  const p = app.store.project;
  const ms = p.members.filter((m) => m.structure === st.id);
  let len = 0, kg = 0;
  for (const m of ms) { len += memberLength(m); const mat = materialById(m.material); kg += memberWeight(m, (mat && mat.density) || 7850); }
  const title = st.kind === "tower" ? t("Lattice tower") : t(BRIDGE_TYPE_LABEL[st.params.type] || "Bridge");
  const q = st.params;
  const sub = st.kind === "tower" ? `${(q.height / 1000).toFixed(1)} m · ${t("{n} members", { n: ms.length })}` : `${(q.length / 1000).toFixed(1)} m · ${t("{n} spans", { n: q.spans })} · ${t("{n} members", { n: ms.length })}`;
  body.append(h("div", { class: "prop-title" }, title), h("div", { class: "prop-sub" }, sub),
    h("div", { class: "prop-sub" }, t("Members {l} m long, {w} t", { l: Math.round(len / 1000).toLocaleString(), w: (kg / 1000).toFixed(1) })),
    h("div", { class: "prop-actions" },
      h("button", { class: "btn small primary", onclick: () => editStructure(app, st) }, st.kind === "tower" ? t("Edit tower…") : t("Edit bridge…")),
      h("button", { class: "btn small", onclick: () => app.crossProbe(ms.map((m) => m.id), "3d") }, t("Show in 3D")),
      h("button", { class: "btn small danger", onclick: () => { app.store.edit(t("Delete"), (pp) => removeStructure(pp, st.id)); app.plan.select([]); } }, t("Delete"))),
    h("div", { class: "empty-note" }, t("Alt+click picks a single member to change its section or material.")));
}

export function registerStructureCommands(app, C) {
  const toPlan = () => { if (app.tab !== "plan") app.setTab("plan"); };
  C("build.tower", "Lattice tower…", "tower", "", () => { toPlan(); return towerDialog(app); });
  C("build.bridge", "Bridge…", "bridge", "", () => { toPlan(); return bridgeDialog(app); });
  C("build.editStructure", "Edit the selected tower or bridge…", "settings", "", () => { const st = selectedStructure(app); return st ? editStructure(app, st) : null; }, { enabled: () => !!selectedStructure(app) });
}
