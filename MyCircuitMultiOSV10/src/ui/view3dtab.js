// 3D tab: hosts the three.js viewer (loaded on first use so start-up stays
// fast), its toolbar, option panel and export.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, toast, modal, checkbox, select, field, stepper } from "./widgets.js";
import { panelHead } from "./panels.js";
import * as platform from "./platform.js";
import { getFootprint } from "../lib/footprints.js";

const VIEWS = [["iso", "Isometric", "1"], ["top", "Top", "2"], ["bottom", "Bottom", "3"], ["front", "Front", "4"], ["back", "Back", "5"], ["left", "Left", "6"], ["right", "Right", "7"]];
// Light and axes settings, kept in settings.scene3d between sessions.
// lightPos: {x, y, z} in mm on the board axes, or null for the default spot.
export const SCENE3D_DEFAULTS = { lights: true, lightIntensity: 100, lightAzimuth: 56, lightElevation: 56, lightPos: null, lightColor: "#ffffff", ambient: 100, headlight: 100, axesScale: 100, axesValues: true, axesLabelSize: 100 };
const LIGHT_COLORS = [["#ffffff", "White"], ["#fff1d6", "Warm white"], ["#ffd59a", "Warm"], ["#e3eeff", "Cool white"], ["#bcd6ff", "Cool"]];

export class View3DTab {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.viewer = null;
    this.dirty = true;
    this.loading = null;
    this.highlighted = [];
    this.opts = { components: true, silkscreen: true, soldermask: true, copper: true, zones: true, boardBody: true, axes: true, grid: true, gizmo: true, dimensions: true, transparentBoard: false, navMode: "rotate" };
    this.picked = null;
    this.pickedHelper = null; // "light" | "axes" | null
  }

  scene3d() {
    return { ...SCENE3D_DEFAULTS, ...(this.app.settings.scene3d || {}) };
  }

  // Change light / axes settings: viewer, saved settings and the panels.
  setScene(patch) {
    const next = { ...this.scene3d(), ...patch };
    this.app.settings.scene3d = next;
    this.app.saveSettings();
    if ("axes" in patch) { this.opts.axes = patch.axes; this.app.settings.axes3d = patch.axes; }
    if (this.viewer) this.viewer.setOptions(patch);
    this.app.renderToolbar();
    this.app.refreshInspector();
  }

  // Select the light or the axes (also from the toolbar / left panel).
  selectHelper(kind) {
    this.pickedHelper = kind;
    this.picked = null;
    if (this.viewer) this.viewer.selectHelper(kind);
    if (this.app.settings.showRight === false) this.app.setSetting("showRight", true);
    if (this.app.settings.rightCollapsed) this.app.togglePanel("right");
    this.app.refreshInspector();
  }

  async ensure() {
    if (this.viewer) return this.viewer;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const wrap = h("div", { class: "v3d-host" });
      this.host.append(wrap);
      try {
        const { createViewer } = await import("../view3d/viewer.js");
        const st = this.app.settings;
        this.opts.grid = st.grid3d !== false;
        this.opts.axes = st.axes3d !== false;
        this.opts.dimensions = st.dims3d !== false;
        this.viewer = createViewer(wrap, { ...this.scene3d(), ...this.opts, shadows: st.shadows !== false, background: this.background(), units3d: st.units3d || "cm", fov: st.fov3d || 35, rotateSpeed: st.rotateSpeed3d || 1 });
        // Dragging the sun: the X / Y / Z steppers follow, the drop is saved.
        this.viewer.onLightMove((pos, done) => {
          for (const axis of ["x", "y", "z"]) {
            const st = document.querySelector(`.side.right .stepper[data-light-axis="${axis}"]`);
            if (st) st.setValue(pos[axis]);
          }
          if (done) { this.app.settings.scene3d = { ...this.scene3d(), lightPos: { ...pos } }; this.app.saveSettings(); }
        });
        this.viewer.onPick((ref, helper) => {
          this.picked = ref;
          this.pickedHelper = helper || null;
          if (ref) this.app.onSelection("3d", [ref]);
          this.app.refreshInspector();
        });
      } catch (e) {
        console.error(e);
        wrap.append(h("div", { class: "empty-note", style: { padding: "30px" } }, t("3D view is not available: {m}", { m: e.message })));
      }
      return this.viewer;
    })();
    return this.loading;
  }

  background() {
    const th = this.app.currentTheme();
    if (this.app.settings.background3d === "solid") return th.mode === "light" ? "#e8ebf0" : th.bg;
    return th.mode === "light" ? { top: "#f4f6fa", bottom: "#c9d1de" } : "gradient";
  }

  async activate() {
    const v = await this.ensure();
    if (!v) return;
    v.resize();
    if (this.dirty) {
      v.setProject(this.app.store.project);
      this.dirty = false;
      if (!this.framed) { v.setView("iso"); this.framed = true; }
    }
    if (this.highlighted.length) v.highlight(this.highlighted);
    this.app.setHint(this.opts.navMode === "pan"
      ? t("Pan mode: left-drag moves the view, right-drag rotates, wheel zooms. Arrow keys rotate, Shift+arrows pan.")
      : t("Left-drag to orbit, right-drag to pan, wheel to zoom. Arrow keys rotate, Shift+arrows pan. Click a part to select it everywhere."));
  }

  markDirty() {
    this.dirty = true;
    if (this.app.tab === "3d" && this.viewer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = setTimeout(() => { if (this.viewer) { this.viewer.setProject(this.app.store.project); this.dirty = false; } }, 250);
    }
  }

  resize() { if (this.viewer) this.viewer.resize(); }

  highlight(refs) {
    this.highlighted = refs || [];
    if (this.viewer) this.viewer.highlight(this.highlighted);
  }

  applyTheme() {
    if (this.viewer) this.viewer.setOptions({ background: this.background() });
  }

  zoomToFit() { if (this.viewer) this.viewer.zoomToFit(); }

  setOpt(k, v) {
    this.opts[k] = v;
    if (k === "axes") { this.setScene({ axes: v }); this.app.renderLeft(); return; }
    if (this.viewer) this.viewer.setOptions({ [k]: v });
    this.app.renderToolbar();
    this.app.renderLeft();
  }

  onKey(e) {
    if (!this.viewer || e.ctrlKey || e.metaKey) return false;
    const v = VIEWS.find((x) => x[2] === e.key);
    if (v) { this.viewer.setView(v[0]); return true; }
    if (e.key.toLowerCase() === "c") { this.setOpt("components", !this.opts.components); return true; }
    if (e.key === "Home") { this.viewer.zoomToFit(); return true; }
    if (e.key.toLowerCase() === "g") { this.setOpt("grid", !this.opts.grid); return true; }
    if (e.key.toLowerCase() === "a") { this.setOpt("axes", !this.opts.axes); return true; }
    if (e.key.toLowerCase() === "l") { this.setScene({ lights: this.scene3d().lights === false }); return true; }
    if (e.key.toLowerCase() === "p") { this.setNav(this.opts.navMode === "pan" ? "rotate" : "pan"); return true; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (arrows) { if (e.shiftKey) this.viewer.pan(arrows[0] * 0.05, arrows[1] * 0.05); else this.viewer.orbit(arrows[0] * 7.5, arrows[1] * 7.5); return true; }
    return false;
  }

  setNav(mode) {
    this.setOpt("navMode", mode);
    this.activateHint();
  }

  activateHint() {
    if (this.app.tab === "3d") this.app.setHint(this.opts.navMode === "pan"
      ? t("Pan mode: left-drag moves the view, right-drag rotates, wheel zooms. Arrow keys rotate, Shift+arrows pan.")
      : t("Left-drag to orbit, right-drag to pan, wheel to zoom. Arrow keys rotate, Shift+arrows pan. Click a part to select it everywhere."));
  }

  renderToolbar(bar, btn, sep) {
    const nav = (mode, ic, label) => h("button", { class: `icon-btn ${this.opts.navMode === mode ? "on" : ""}`, title: t(label), "data-nav": mode, onclick: () => this.setNav(mode), html: icon(ic, 18) });
    bar.append(nav("rotate", "orbit", "Rotate: left-drag orbits the view"), nav("pan", "hand", "Pan (P): left-drag moves the view"), sep());
    const vb = (id, label, key) => h("button", { class: "icon-btn", title: `${t(label)} (${key})`, onclick: () => this.viewer && this.viewer.setView(id) }, h("span", { class: "lbl" }, t(label)));
    const tog = (k, ic, label) => h("button", { class: `icon-btn ${this.opts[k] ? "on" : ""}`, title: t(label), onclick: () => this.setOpt(k, !this.opts[k]), html: icon(ic, 18) });
    bar.append(...VIEWS.map(([id, label, key]) => vb(id, label, key)), sep(),
      tog("components", "chip", "Components"), tog("silkscreen", "text", "Silkscreen"), tog("soldermask", "layers", "Solder mask"), tog("zones", "zone", "Copper zones"), tog("transparentBoard", "eye", "X-ray board"), sep(),
      tog("grid", "grid", "Grid with scale (G)"), tog("axes", "axes", "Coordinate axes (A)"), tog("gizmo", "cube", "Orientation gizmo"), tog("dimensions", "dimension", "Board dimensions (W × D × H)"), sep(),
      this.lightButton(),
      h("button", { class: "icon-btn unit-btn", title: t("Measurement unit (cm / inch) — also in Settings"), "data-unit3d": "1", onclick: () => this.app.setSetting("units3d", (this.app.settings.units3d || "cm") === "cm" ? "inch" : "cm") }, h("span", { class: "lbl" }, (this.app.settings.units3d || "cm") === "cm" ? "cm" : "inch")),
      h("button", { class: "icon-btn", title: t("Zoom to fit"), html: icon("zoomFit", 18), onclick: () => this.viewer && this.viewer.zoomToFit() }), sep(),
      h("button", { class: "icon-btn", title: t("Screenshot (PNG)"), html: icon("camera", 18), onclick: () => this.screenshot() }),
      h("button", { class: "icon-btn", title: t("Export 3D model (STL / GLB)…"), html: icon("export", 18), onclick: () => this.exportDialog() }), sep(), btn("view.pcb", { label: true }));
  }

  // Light on/off; the caret beside it opens the light's properties.
  lightButton() {
    const on = this.scene3d().lights !== false;
    return h("div", { class: "split-btn tb-split" },
      h("button", { class: `icon-btn ${on ? "on" : ""}`, "data-light3d": "1", title: `${t(on ? "Light: on (L) — click to turn off" : "Light: off (L) — click to turn on")}`, onclick: () => this.setScene({ lights: !on }) },
        h("span", { html: icon(on ? "light" : "lightOff", 18) }), h("span", { class: "lbl" }, t("Light source"))),
      h("button", { class: "icon-btn caret", title: t("Light properties"), html: icon("settings", 14), onclick: () => this.selectHelper("light") }));
  }

  renderPanel(host) {
    const pcb = this.app.store.project.pcb;
    const p = h("div", { class: "panel" });
    p.append(panelHead(this.app, "left", "cube", t("3D view")));
    const body = h("div", { class: "panel-body" });
    const optIcon = { components: "chip", silkscreen: "text", soldermask: "zone", copper: "route", zones: "zone", boardBody: "cube", transparentBoard: "eye", axes: "axes", grid: "grid", gizmo: "orbit", dimensions: "dimension" };
    for (const [k, label] of [["components", "Components"], ["silkscreen", "Silkscreen"], ["soldermask", "Solder mask"], ["copper", "Copper"], ["zones", "Copper zones"], ["boardBody", "Board body"], ["transparentBoard", "X-ray board"], ["axes", "Axes"], ["grid", "Grid"], ["gizmo", "Orientation gizmo"], ["dimensions", "Board dimensions (W × D × H)"]]) {
      body.append(h("div", {}, checkbox(this.opts[k], t(label), { icon: optIcon[k], onChange: (v) => this.setOpt(k, v) })));
    }
    // Scene objects: click to edit them in the Properties panel (or click the
    // sun / an axis in the view).
    body.append(h("div", { class: "prop-section" }, h("span", { html: icon("light", 12) }), t("Scene")),
      h("div", { class: "scene-pick" },
        h("button", { class: `btn small ${this.pickedHelper === "light" ? "on" : ""}`, "data-scene-pick": "light", onclick: () => this.selectHelper("light") }, h("span", { html: icon("light", 14) }), t("Light source")),
        h("button", { class: `btn small ${this.pickedHelper === "axes" ? "on" : ""}`, "data-scene-pick": "axes", onclick: () => this.selectHelper("axes") }, h("span", { html: icon("axes", 14) }), t("Axes"))));
    body.append(h("div", { class: "prop-section" }, h("span", { html: icon("palette", 12) }), t("Board appearance")));
    const edit = (key, label, options) => field(t(label), select(pcb[key], options, { onChange: (v) => { this.app.store.edit(t("Board appearance"), (pr) => { pr.pcb[key] = key === "thickness" ? parseFloat(v) : v; }); } }));
    body.append(
      edit("maskColor", "Solder mask", ["green", "red", "blue", "black", "white", "purple", "yellow"].map((c) => [c, t(c)])),
      edit("silkColor", "Silkscreen", [["white", t("white")], ["black", t("black")], ["yellow", t("yellow")]]),
      edit("finish", "Surface finish", [["HASL", "HASL"], ["ENIG", "ENIG"], ["OSP", "OSP"]]),
      field(t("Thickness (mm)"), stepper(Number(pcb.thickness) || 1.6, { values: [0.8, 1.0, 1.2, 1.6, 2.0], format: (v) => v.toFixed(1),
        onChange: (v) => this.app.store.edit(t("Board appearance"), (pr) => { pr.pcb.thickness = v; }) })));
    p.append(body);
    host.append(p);
    const st = this.viewer ? this.viewer.stats() : null;
    if (st) host.append(h("div", { class: "panel" }, h("div", { class: "panel-body" }, h("div", { class: "field-hint" }, t("{c} components · {m} meshes · {k}k triangles", { c: st.components, m: st.meshes, k: Math.round(st.triangles / 1000) })))));
  }

  renderInspector(host) {
    const p = h("div", { class: "panel" });
    p.append(panelHead(this.app, "right", "list", t("Properties")));
    const body = h("div", { class: "panel-body" });
    const fp = this.picked ? this.app.store.project.pcb.footprints.find((f) => f.ref === this.picked) : null;
    if (this.pickedHelper === "light") this.lightInspector(body);
    else if (this.pickedHelper === "axes") this.axesInspector(body);
    else if (fp) {
      const def = getFootprint(fp.footprint);
      body.append(h("div", { class: "prop-title" }, h("span", { html: icon("chip", 16) }), `${fp.ref}  ${fp.value || ""}`), h("div", { class: "prop-sub" }, def ? def.title : fp.footprint),
        h("div", { class: "prop-grid" }, h("span", {}, t("Side")), h("span", {}, fp.side === "B" ? t("Bottom") : t("Top")), h("span", {}, t("Position")), h("span", {}, `${fp.x.toFixed(2)}, ${fp.y.toFixed(2)} mm`), h("span", {}, t("Rotation")), h("span", {}, `${fp.rot || 0}°`)),
        h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => this.app.crossProbe([fp.ref], "pcb") }, t("Show in PCB")), h("button", { class: "btn small", onclick: () => this.app.crossProbe([fp.ref], "sch") }, t("Show in schematic"))));
    } else body.append(h("div", { class: "empty-note" }, t("Click a component, the sun (light) or an axis in the 3D view to see it here.")));
    p.append(body);
    host.append(p);
  }

  // [label, stepper] rows for a numeric scene setting.
  sceneNum(label, key, { min, max, step, unit = "" }) {
    const el = stepper(this.scene3d()[key], { min, max, step, editable: true, format: (v) => `${Math.round(v * 10) / 10}${unit}`,
      onChange: (v) => this.setScene({ [key]: v }) });
    el.dataset.field = label;
    el.dataset.scene = key;
    return [h("span", { title: label }, label), el];
  }

  // One coordinate of the light: [−] value [+], value centred, 1 mm steps
  // (typeable). Starts from where the light is now.
  lightAxis(label, axis) {
    const cur = this.viewer ? this.viewer.lightPosition() : { x: 0, y: 0, z: 50 };
    const el = stepper(cur[axis], { step: 1, min: axis === "z" ? 1 : -2000, max: 2000, editable: true, format: (v) => (Math.round(v * 10) / 10).toFixed(1),
      onChange: (v) => {
        const now = this.viewer ? this.viewer.lightPosition() : cur;
        this.setScene({ lightPos: { ...now, [axis]: v } });
      } });
    el.dataset.field = label;
    el.dataset.lightAxis = axis;
    return [h("span", { title: label }, label), el];
  }

  sceneSwitch(label, key) {
    return [h("span", { title: label }, label), checkbox(this.scene3d()[key] !== false, t("On"), { onChange: (v) => this.setScene({ [key]: v }) })];
  }

  lightInspector(body) {
    const s = this.scene3d();
    const color = select(s.lightColor, LIGHT_COLORS.map(([v, n]) => [v, t(n)]), { onChange: (v) => this.setScene({ lightColor: v }) });
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon(s.lights !== false ? "light" : "lightOff", 16) }), t("Light source")),
      h("div", { class: "prop-sub" }, t("Key light with shadows, a soft fill light and a headlight that follows the camera.")),
      h("div", { class: "prop-grid" },
        ...this.sceneSwitch(t("Light source"), "lights"),
        ...this.sceneNum(t("Intensity"), "lightIntensity", { min: 0, max: 300, step: 10, unit: "%" }),
        h("span", {}, t("Colour")), color,
        h("div", { class: "prop-section prop-span" }, h("span", { html: icon("light", 12) }), t("Position (mm) — or drag the sun")),
        ...this.lightAxis("X", "x"), ...this.lightAxis("Y", "y"), ...this.lightAxis(t("Z (height)"), "z"),
        ...this.sceneNum(t("Ambient light"), "ambient", { min: 0, max: 300, step: 10, unit: "%" }),
        ...this.sceneNum(t("Headlight"), "headlight", { min: 0, max: 300, step: 10, unit: "%" }),
        h("span", {}, t("Shadows")), checkbox(this.app.settings.shadows !== false, t("On"), { onChange: (v) => { this.app.setSetting("shadows", v); if (this.viewer) this.viewer.setOptions({ shadows: v }); } })),
      h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => this.setScene({ lights: true, lightIntensity: 100, lightAzimuth: 56, lightElevation: 56, lightPos: null, lightColor: "#ffffff", ambient: 100, headlight: 100 }) }, t("Reset"))));
  }

  axesInspector(body) {
    body.append(h("div", { class: "prop-title" }, h("span", { html: icon("axes", 16) }), t("Axes")),
      h("div", { class: "prop-sub" }, t("X, Y and Z from the board origin, with ticks in {u}.", { u: (this.app.settings.units3d || "cm") === "cm" ? "cm" : "inch" })),
      h("div", { class: "prop-grid" },
        ...this.sceneSwitch(t("Show axes"), "axes"),
        ...this.sceneNum(t("Length"), "axesScale", { min: 50, max: 300, step: 10, unit: "%" }),
        ...this.sceneSwitch(t("Tick values"), "axesValues"),
        ...this.sceneNum(t("Label size"), "axesLabelSize", { min: 50, max: 250, step: 10, unit: "%" }),
        h("span", {}, t("Units")), select(this.app.settings.units3d || "cm", [["cm", "cm"], ["inch", "inch"]], { onChange: (v) => this.app.setSetting("units3d", v) })),
      h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => this.setScene({ axes: true, axesScale: 100, axesValues: true, axesLabelSize: 100 }) }, t("Reset"))));
  }

  async screenshot() {
    const v = await this.ensure();
    if (!v) return;
    const name = `${(this.app.store.project.meta.title || "board").replace(/[\\/:*?"<>|\s]+/g, "_")}-3d.png`;
    const r = await platform.saveDataUrl({ name, dataUrl: v.screenshot(), filters: [{ name: "PNG", extensions: ["png"] }] });
    if (r) toast(t("Saved {name}", { name: r.name }), "ok");
  }

  async exportDialog() {
    if (this.app.tab !== "3d") this.app.setTab("3d");
    const v = await this.ensure();
    if (!v) return;
    if (this.dirty) { v.setProject(this.app.store.project); this.dirty = false; }
    const r = await modal({
      title: t("Export 3D model"), width: 460,
      body: h("div", {}, h("p", { style: { lineHeight: 1.6 } }, t("GLB keeps colours and materials (Blender, web viewers, Windows 3D Viewer). STL is geometry only (mechanical CAD, 3D printing an enclosure mock-up)."))),
      buttons: [{ label: t("Cancel"), value: null }, { label: "STL", value: "stl" }, { label: "GLB", value: "glb", primary: true }],
    });
    const base = (this.app.store.project.meta.title || "board").replace(/[\\/:*?"<>|\s]+/g, "_");
    if (r === "stl") {
      const text = v.exportSTL();
      const s = await platform.saveTextFile({ name: `${base}.stl`, text, filters: [{ name: "STL", extensions: ["stl"] }] });
      if (s) toast(t("Saved {name}", { name: s.name }), "ok");
    } else if (r === "glb") {
      const buf = await v.exportGLB();
      const s = await platform.saveBinaryFile({ name: `${base}.glb`, bytes: new Uint8Array(buf), filters: [{ name: "glTF binary", extensions: ["glb"] }] });
      if (s) toast(t("Saved {name}", { name: s.name }), "ok");
    }
  }
}
