// 3D tab: hosts the three.js viewer (loaded on first use so start-up stays
// fast), its toolbar, option panel and export.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, toast, modal, checkbox, select, field } from "./widgets.js";
import * as platform from "./platform.js";
import { getFootprint } from "../lib/footprints.js";

const VIEWS = [["iso", "Isometric", "1"], ["top", "Top", "2"], ["bottom", "Bottom", "3"], ["front", "Front", "4"], ["back", "Back", "5"], ["left", "Left", "6"], ["right", "Right", "7"]];

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
        this.viewer = createViewer(wrap, { ...this.opts, shadows: st.shadows !== false, background: this.background(), units3d: st.units3d || "cm", fov: st.fov3d || 35, rotateSpeed: st.rotateSpeed3d || 1 });
        this.viewer.onPick((ref) => {
          this.picked = ref;
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
      tog("grid", "grid", "Grid with scale (G)"), tog("axes", "axes", "Coordinate axes (A)"), tog("gizmo", "cube", "Orientation gizmo"), tog("dimensions", "dimension", "Board dimensions (W × D × H)"),
      h("button", { class: "icon-btn unit-btn", title: t("Measurement unit (cm / inch) — also in Settings"), "data-unit3d": "1", onclick: () => this.app.setSetting("units3d", (this.app.settings.units3d || "cm") === "cm" ? "inch" : "cm") }, h("span", { class: "lbl" }, (this.app.settings.units3d || "cm") === "cm" ? "cm" : "inch")),
      h("button", { class: "icon-btn", title: t("Zoom to fit"), html: icon("zoomFit", 18), onclick: () => this.viewer && this.viewer.zoomToFit() }), sep(),
      h("button", { class: "icon-btn", title: t("Screenshot (PNG)"), html: icon("camera", 18), onclick: () => this.screenshot() }),
      h("button", { class: "icon-btn", title: t("Export 3D model (STL / GLB)…"), html: icon("export", 18), onclick: () => this.exportDialog() }), sep(), btn("view.pcb", { label: true }));
  }

  renderPanel(host) {
    const pcb = this.app.store.project.pcb;
    const p = h("div", { class: "panel" });
    p.append(h("div", { class: "panel-head" }, h("span", {}, t("3D view"))));
    const body = h("div", { class: "panel-body" });
    for (const [k, label] of [["components", "Components"], ["silkscreen", "Silkscreen"], ["soldermask", "Solder mask"], ["copper", "Copper"], ["zones", "Copper zones"], ["boardBody", "Board body"], ["transparentBoard", "X-ray board"], ["axes", "Axes"], ["grid", "Grid"], ["gizmo", "Orientation gizmo"], ["dimensions", "Board dimensions (W × D × H)"]]) {
      body.append(h("div", {}, checkbox(this.opts[k], t(label), { onChange: (v) => this.setOpt(k, v) })));
    }
    body.append(h("div", { class: "prop-section" }, t("Board appearance")));
    const edit = (key, label, options) => field(t(label), select(pcb[key], options, { onChange: (v) => { this.app.store.edit(t("Board appearance"), (pr) => { pr.pcb[key] = key === "thickness" ? parseFloat(v) : v; }); } }));
    body.append(
      edit("maskColor", "Solder mask", ["green", "red", "blue", "black", "white", "purple", "yellow"].map((c) => [c, t(c)])),
      edit("silkColor", "Silkscreen", [["white", t("white")], ["black", t("black")], ["yellow", t("yellow")]]),
      edit("finish", "Surface finish", [["HASL", "HASL"], ["ENIG", "ENIG"], ["OSP", "OSP"]]),
      edit("thickness", "Thickness (mm)", ["0.8", "1.0", "1.2", "1.6", "2.0"].map((x) => [x, x])));
    p.append(body);
    host.append(p);
    const st = this.viewer ? this.viewer.stats() : null;
    if (st) host.append(h("div", { class: "panel" }, h("div", { class: "panel-body" }, h("div", { class: "field-hint" }, t("{c} components · {m} meshes · {k}k triangles", { c: st.components, m: st.meshes, k: Math.round(st.triangles / 1000) })))));
  }

  renderInspector(host) {
    const p = h("div", { class: "panel" });
    p.append(h("div", { class: "panel-head" }, h("span", {}, t("Properties"))));
    const body = h("div", { class: "panel-body" });
    const fp = this.picked ? this.app.store.project.pcb.footprints.find((f) => f.ref === this.picked) : null;
    if (fp) {
      const def = getFootprint(fp.footprint);
      body.append(h("div", { class: "prop-title" }, h("span", { html: icon("chip", 16) }), `${fp.ref}  ${fp.value || ""}`), h("div", { class: "prop-sub" }, def ? def.title : fp.footprint),
        h("div", { class: "prop-grid" }, h("span", {}, t("Side")), h("span", {}, fp.side === "B" ? t("Bottom") : t("Top")), h("span", {}, t("Position")), h("span", {}, `${fp.x.toFixed(2)}, ${fp.y.toFixed(2)} mm`), h("span", {}, t("Rotation")), h("span", {}, `${fp.rot || 0}°`)),
        h("div", { class: "prop-actions" }, h("button", { class: "btn small", onclick: () => this.app.crossProbe([fp.ref], "pcb") }, t("Show in PCB")), h("button", { class: "btn small", onclick: () => this.app.crossProbe([fp.ref], "sch") }, t("Show in schematic"))));
    } else body.append(h("div", { class: "empty-note" }, t("Click a component in the 3D view to see it here.")));
    p.append(body);
    host.append(p);
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
