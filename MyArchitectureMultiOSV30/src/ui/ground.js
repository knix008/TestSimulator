// View → "Ground…": what the building stands on in 3D (core/ground.js) — a
// gallery of surfaces (lawn, meadow, soil, snow, sand, gravel, pavers, deck,
// water …, each with its material's swatch), the shape (round, square, the
// building plot, to the horizon, hills) and "use for new projects". One undo
// step; the 3D view follows at once.

import { t } from "./i18n.js";
import { h, modal, field, select, checkbox, toast } from "./widgets.js";
import { GROUND_TYPES, GROUND_SHAPES } from "../core/ground.js";
import { STYLE_DEFAULTS } from "../core/skmodel.js";
import { materialById } from "../lib/materials.js";
import { materialThumb, materialThumbLoaded } from "./matpicker.js";

/** Puts the defaults from the settings on a new project's 3D style (before it is shown). */
export function applyGroundDefaults(project, settings) {
  const type = GROUND_TYPES.some((g) => g.id === settings.groundType) ? settings.groundType : null;
  const shape = GROUND_SHAPES.some((g) => g.id === settings.groundShape) ? settings.groundShape : null;
  if (!type && !shape) return project;
  project.style3d = { ...STYLE_DEFAULTS, ...(project.style3d || {}), ...(type ? { groundType: type } : {}), ...(shape ? { groundShape: shape } : {}) };
  return project;
}

function tile(g, on, pick) {
  const m = g.material ? materialById(g.material) : null;
  const sw = h("span", { class: "mat-sw big", style: { backgroundColor: m ? m.color : "#9aa68a" } });
  if (m) {
    sw.style.backgroundImage = `url("${materialThumb(m)}")`;
    if (m.preset && m.preset.textures) materialThumbLoaded(m).then((url) => { sw.style.backgroundImage = `url("${url}")`; });
  }
  const b = h("button", { class: `mat-tile ${on ? "on" : ""}`, type: "button", "data-ground": g.id, title: t(g.name) }, sw, h("span", { class: "mat-tile-name" }, t(g.name)));
  b.addEventListener("click", () => pick(g.id, b));
  return b;
}

export async function groundDialog(app, { ask = true, options = {} } = {}) {
  const p = app.store.project;
  const s = { ...STYLE_DEFAULTS, ...(p.style3d || {}) };
  const st = app.settings;
  const draft = { groundType: s.groundType, groundShape: s.groundShape, forNew: st.groundType === s.groundType && st.groundShape === s.groundShape && !!st.groundType, ...options };
  if (ask) {
    const grid = h("div", { class: "mat-grid ground-grid" });
    const pick = (id, b) => { draft.groundType = id; for (const x of grid.children) x.classList.toggle("on", x === b); };
    for (const g of GROUND_TYPES) grid.append(tile(g, g.id === draft.groundType, pick));
    const body = h("div", { class: "form-grid" },
      h("div", { class: "span2" }, h("div", { class: "field-label" }, t("Ground surface")), grid),
      field(t("Ground shape"), select(draft.groundShape, GROUND_SHAPES.map((g) => [g.id, t(g.name)]), { onChange: (v) => { draft.groundShape = v; } })),
      h("div", { class: "span2" }, checkbox(draft.forNew, t("Use for new projects too"), { onChange: (v) => { draft.forNew = v; } })),
      h("p", { class: "field-hint span2" }, t("The ground follows the building's size. Plain colour uses the Ground colour of the Style panel. Hills leave a flat pad around the building.")));
    const ok = await modal({ icon: "ground", title: t("Ground"), width: 640, body, buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
    if (!ok) return null;
  }
  if (draft.groundType !== s.groundType || draft.groundShape !== s.groundShape) {
    app.store.edit(t("Ground"), (pr) => { pr.style3d = { ...STYLE_DEFAULTS, ...(pr.style3d || {}), groundType: draft.groundType, groundShape: draft.groundShape }; });
  }
  if (draft.forNew) { st.groundType = draft.groundType; st.groundShape = draft.groundShape; app.saveSettings(); }
  if (app.v3d && app.v3d.sk) { app.v3d.sk.pushOpts(); app.renderLeft && app.renderLeft(); }
  if (ask) toast(t("Ground: {type}, {shape}.", { type: t(GROUND_TYPES.find((g) => g.id === draft.groundType).name), shape: t(GROUND_SHAPES.find((g) => g.id === draft.groundShape).name) }), "ok");
  return draft;
}
