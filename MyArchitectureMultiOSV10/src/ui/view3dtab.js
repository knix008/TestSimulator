// 3D tab: hosts the three.js viewer (loaded on first use so start-up stays
// fast), its toolbar, option panel (levels, section cut, sun, styles) and the
// picked-object inspector.

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, panelHead, toast, checkbox, select, field, stepper, contextMenu } from "./widgets.js";
import * as platform from "./platform.js";
import { levelById, findItem, wallHeight } from "../core/project.js";
import { materialsFor, materialColor } from "../lib/materials.js";
import { uid } from "../core/geom.js";
import { furnitureDef } from "../lib/furniture.js";
import { sunPosition, daylight } from "../core/sun.js";

const VIEWS = [["iso", "Isometric", "1"], ["top", "Top", "2"], ["front", "Front", "3"], ["back", "Rear", "4"], ["left", "Left side", "5"], ["right", "Right side", "6"], ["bird", "Bird's eye", "7"]];
const STYLES = [["realistic", "Realistic"], ["white", "White model"], ["lines", "Line drawing"], ["xray", "X-ray"]];

export class View3DTab {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.viewer = null;
    this.dirty = true;
    this.loading = null;
    this.highlighted = [];
    this.picked = null;
    this.hiddenLevels = new Set();
    this.opts = { style: "realistic", navMode: "orbit", ortho: false, section: null, openDoors: false, furniture: true, roofs: true, grid: true, axes: false, gizmo: true, dimensions: false, ground: true, tool: "none", fog: false, solids: true };
    this.paintMaterial = "brick";
  }

  // ---------------------------------------------------------------- SketchUp-style tools
  setTool(tool) {
    if (this.opts.navMode === "walk" && tool !== "none") this.setNav("orbit");
    this.setOpt("tool", this.opts.tool === tool ? "none" : tool);
    if (this.opts.tool !== "tape" && this.viewer) this.viewer.clearMeasures();
    const hints = {
      pushpull: t("Push/Pull: drag the top of a mass or a wall up or down. Esc leaves the tool."),
      paint: t("Paint bucket: pick a material on the left, then click walls, floors, roofs, masses or furniture."),
      tape: t("Tape measure: click two points on the model. Esc clears the measurements."),
    };
    this.app.setHint(hints[this.opts.tool] || this.hintText());
  }

  onTool(ev) {
    const app = this.app;
    const p = app.store.project;
    if (ev.type === "pushStart") {
      const it = findItem(p, ev.id);
      if (!it) return;
      this.push = { id: ev.id, kind: ev.kind, h0: ev.kind === "solids" ? it.obj.height : wallHeight(p, it.obj) };
      app.store.begin(t("Push/Pull"));
      return;
    }
    if (ev.type === "push" && this.push) {
      const it = findItem(app.store.project, this.push.id);
      if (!it) return;
      const hgt = Math.max(ev.kind === "solids" ? 100 : 300, Math.round((this.push.h0 + ev.dy) / 50) * 50);
      it.obj.height = hgt; // a mass or a wall: both keep their height in .height
      app.store.preview();
      app.setHint(`${t("Height")}: ${(hgt / 1000).toFixed(2)} m`);
      clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(() => { if (this.viewer) this.viewer.setProject(app.store.project); }, 30);
      return;
    }
    if (ev.type === "pushEnd" && this.push) {
      this.push = null;
      app.store.commit();
      this.markDirty();
      return;
    }
    if (ev.type === "paint") {
      const it = findItem(p, ev.id);
      if (!it) return;
      const m = this.paintMaterial;
      app.store.edit(t("Paint"), () => {
        const o = it.obj;
        if (it.kind === "rooms") o.floor = m;
        else if (it.kind === "furniture") o.color = materialColor(m);
        else if (it.kind === "openings") return false;
        else o.material = m;
        return true;
      });
      this.markDirty();
      return;
    }
    if (ev.type === "tape") toast(`${t("Distance")}: ${(ev.distance).toFixed(3)} m`, "info", 4000);
  }

  // ---------------------------------------------------------------- scenes
  addScene() {
    const v = this.viewer;
    if (!v) return null;
    const p = this.app.store.project;
    const sc = { id: uid("sc"), name: `${t("Scene")} ${p.scenes.length + 1}`, camera: v.getCamera(), style: this.opts.style, section: this.opts.section, phase: this.app.settings.phaseView || "all" };
    this.app.store.edit(t("Add scene"), (pr) => { pr.scenes.push(sc); });
    this.app.renderLeft();
    return sc;
  }

  goScene(sc, duration = 900) {
    if (!this.viewer || !sc) return;
    if (sc.style && sc.style !== this.opts.style) this.setOpt("style", sc.style);
    if ((sc.section ?? null) !== this.opts.section) this.setOpt("section", sc.section ?? null);
    if (sc.phase && sc.phase !== (this.app.settings.phaseView || "all")) { this.app.settings.phaseView = sc.phase; this.applySettings(); }
    this.opts.ortho = !!sc.camera.ortho;
    this.viewer.setCamera(sc.camera, duration);
    this.currentScene = sc.id;
  }

  // Tour every scene in turn (SketchUp's scene animation).
  async playScenes(dwell = 2500) {
    const list = this.app.store.project.scenes;
    if (!list.length) { toast(t("Add scenes first: set up a view and press Add scene."), "warn"); return; }
    this.playing = !this.playing;
    this.app.renderLeft();
    for (let i = 0; this.playing && this.app.tab === "3d"; i = (i + 1) % list.length) {
      this.goScene(list[i], 1400);
      await new Promise((r) => setTimeout(r, dwell));
      if (i === list.length - 1 && this.playOnce) break;
    }
    this.playing = false;
    this.app.renderLeft();
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
        this.opts.ground = st.ground3d !== false;
        this.viewer = createViewer(wrap, { ...this.opts, ...this.settingOpts(), levels: this.levelSet() });
        this.viewer.onTool((ev) => this.onTool(ev));
        this.viewer.onPick((info) => {
          this.picked = info;
          if (info && info.id) this.app.onSelection("3d", [info.id]);
          this.app.refreshInspector();
        });
        this.bindContextMenu(this.viewer.three.renderer.domElement);
      } catch (e) {
        console.error(e);
        wrap.append(h("div", { class: "empty-note", style: { padding: "30px" } }, t("3D view is not available: {m}", { m: e.message })));
      }
      return this.viewer;
    })();
    return this.loading;
  }

  // Right-click without dragging opens a menu (right-drag still pans).
  bindContextMenu(canvas) {
    let down = null;
    canvas.addEventListener("pointerdown", (e) => { if (e.button === 2) down = [e.clientX, e.clientY]; });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      down = null;
      const items = [...this.app.undoMenuItems(), "-", ...this.app.menuItems(["v3d.iso", "v3d.top", "v3d.front", "-", "v3d.walk", "v3d.section", "v3d.ortho", "v3d.openDoors", "-", "v3d.pushpull", "v3d.paint", "v3d.tape", "-", "v3d.addScene", "v3d.screenshot"])];
      if (this.picked && this.picked.id) items.unshift({ label: t("Show in plan"), icon: "floorplan", action: () => this.app.crossProbe([this.picked.id], "plan") }, "-");
      contextMenu(items, e.clientX, e.clientY);
    });
  }

  settingOpts() {
    const st = this.app.settings;
    const sun = this.sun();
    return { shadows: st.shadows !== false, background: this.background(), units3d: st.units3d || "m", fov: st.fov3d || 45, rotateSpeed: st.rotateSpeed3d || 1, sunAzimuth: sun.azimuth, sunAltitude: sun.altitude, north: this.app.store.project.meta.north || 0, phase: st.phaseView || "all" };
  }

  // The sun: fixed angles, or computed from the site, date and time (sun study).
  sun() {
    const st = this.app.settings;
    if (!st.sunStudy) return { azimuth: st.sunAzimuth ?? 135, altitude: st.sunAltitude ?? 45 };
    const m = this.app.store.project.meta;
    const d = new Date(new Date().getFullYear(), (st.sunMonth || 6) - 1, st.sunDay || 21, Math.floor(st.sunHour ?? 14), Math.round(((st.sunHour ?? 14) % 1) * 60));
    const s = sunPosition(+m.latitude || 37.57, +m.longitude || 126.98, d, m.timezone ?? 9);
    return { azimuth: s.azimuth, altitude: Math.max(3, s.altitude), below: s.altitude < 0 };
  }

  applySettings() {
    if (this.viewer) this.viewer.setOptions(this.settingOpts());
  }

  background() {
    const th = this.app.currentTheme();
    if (this.app.settings.background3d === "solid") return th.mode === "light" ? "#e8ebf0" : th.bg;
    return th.mode === "light" ? { top: "#a9c9ea", bottom: "#f1f4f6" } : "gradient";
  }

  levelSet() {
    const ids = this.app.store.project.levels.map((l) => l.id).filter((id) => !this.hiddenLevels.has(id));
    return new Set(ids);
  }

  // Push the current project into the viewer if it changed.
  syncModel() {
    if (!this.viewer || !this.dirty) return;
    this.viewer.setOptions({ levels: this.levelSet(), north: this.app.store.project.meta.north || 0 });
    this.viewer.setProject(this.app.store.project);
    this.dirty = false;
    if (this.highlighted.length) this.viewer.highlight(this.highlighted);
    if (this.app.tab === "3d") this.app.updateStatus();
  }

  async activate() {
    const v = await this.ensure();
    if (!v) return;
    v.resize();
    this.syncModel();
    if (!this.framed) { v.setView("iso"); this.framed = true; }
    this.app.setHint(this.hintText());
    this.app.renderLeft();
  }

  deactivate() {
    if (this.viewer && this.opts.navMode === "walk") this.setNav("orbit");
  }

  hintText() {
    if (this.opts.navMode === "walk") return t("Walk: W/A/S/D or arrows move, drag to look around, Q/E down/up, Shift runs. Esc leaves walk mode.");
    if (this.opts.navMode === "pan") return t("Pan mode: left-drag moves the view, right-drag rotates, wheel zooms.");
    return t("Left-drag to orbit, right-drag to pan, wheel to zoom. Click a wall, door or piece of furniture to select it in the plan too.");
  }

  markDirty() {
    this.dirty = true;
    if (this.app.tab === "3d" && this.viewer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = setTimeout(() => this.syncModel(), 200);
    }
  }

  resize() { if (this.viewer) this.viewer.resize(); }

  highlight(ids) {
    this.highlighted = ids || [];
    if (this.viewer) this.viewer.highlight(this.highlighted);
  }

  applyTheme() { if (this.viewer) this.viewer.setOptions({ background: this.background() }); }
  zoomToFit() { if (this.viewer) this.viewer.zoomToFit(); }

  setView(name) {
    this.ensure().then((v) => { if (!v) return; if (this.opts.navMode === "walk") this.setNav("orbit"); v.setView(name); });
  }

  // An elevation: orthographic, straight on, line drawing.
  elevation(dir = "front") {
    this.setOpt("ortho", true);
    this.setOpt("style", "lines");
    this.setView(dir);
  }

  setOpt(k, v) {
    this.opts[k] = v;
    if (this.viewer) this.viewer.setOptions({ [k]: v });
    this.app.renderToolbar();
    this.app.renderLeft();
    this.app.updateStatus();
  }

  setNav(mode) {
    this.setOpt("navMode", mode);
    this.app.setHint(this.hintText());
  }

  // Section cut 1.2 m above the floor of the plan's current level.
  toggleSection() {
    if (this.opts.section !== null) { this.setOpt("section", null); return; }
    const lv = levelById(this.app.store.project, this.app.plan.level) || this.app.store.project.levels[0];
    this.setOpt("section", lv.elevation + 1200);
  }

  // Back to the default 3D view state (no tool, orbit, no section, every
  // level shown …) — the tutorial starts from here.
  resetView() {
    const def = { style: "realistic", navMode: "orbit", ortho: false, section: null, openDoors: false, furniture: true, roofs: true, grid: true, ground: true, tool: "none", fog: false, solids: true };
    if (this.opts.navMode === "walk") this.setNav("orbit");
    if (this.viewer) this.viewer.clearMeasures();
    this.playing = false;
    Object.assign(this.opts, def);
    this.hiddenLevels.clear();
    if (this.viewer) this.viewer.setOptions({ ...def, levels: this.levelSet() });
    this.app.renderToolbar();
    this.app.renderLeft();
    this.app.updateStatus();
  }

  setLevelVisible(id, on) {
    if (on) this.hiddenLevels.delete(id); else this.hiddenLevels.add(id);
    if (this.viewer) this.viewer.setOptions({ levels: this.levelSet() });
    this.app.renderLeft();
  }

  onKey(e, down) {
    if (!this.viewer) return false;
    if (this.viewer.walkKey(e, down)) return true;
    if (!down || e.ctrlKey || e.metaKey) return false;
    const v = VIEWS.find((x) => x[2] === e.key);
    if (v) { this.setView(v[0]); return true; }
    const k = e.key.toLowerCase();
    if (k === "escape" && this.opts.tool !== "none") { this.setTool(this.opts.tool); return true; }
    if (k === "escape" && this.opts.navMode !== "orbit") { this.setNav("orbit"); return true; }
    if (k === "p") { this.setNav(this.opts.navMode === "pan" ? "orbit" : "pan"); return true; }
    if (k === "v") { this.setNav(this.opts.navMode === "walk" ? "orbit" : "walk"); return true; }
    if (k === "o") { this.setOpt("ortho", !this.opts.ortho); return true; }
    if (k === "x") { this.toggleSection(); return true; }
    if (k === "g") { this.setOpt("grid", !this.opts.grid); return true; }
    if (this.opts.navMode === "walk") return false;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (arrows) { if (e.shiftKey) this.viewer.pan(arrows[0] * 0.05, arrows[1] * 0.05); else this.viewer.orbit(arrows[0] * 7.5, arrows[1] * 7.5); return true; }
    return false;
  }

  renderToolbar(bar, btn, sep) {
    const nav = (mode, ic, label) => h("button", { class: `icon-btn ${this.opts.navMode === mode ? "on" : ""}`, title: t(label), "data-nav": mode, onclick: () => this.setNav(mode), html: icon(ic, 18) });
    const tool = (id, ic, label) => h("button", { class: `icon-btn ${this.opts.tool === id ? "on" : ""}`, title: t(label), "data-tool3d": id, onclick: () => this.setTool(id), html: icon(ic, 18) });
    bar.append(nav("orbit", "orbit", "Orbit: left-drag turns the view"), nav("pan", "hand", "Pan (P): left-drag moves the view"), nav("walk", "walk", "Walk through (V)"), sep(),
      tool("pushpull", "pushpull", "Push/Pull"), tool("paint", "bucket", "Paint bucket"), tool("tape", "tape", "Tape measure"), sep());
    const vb = (id, label, key) => h("button", { class: "icon-btn", title: `${t(label)} (${key})`, onclick: () => this.setView(id) }, h("span", { class: "lbl" }, t(label)));
    const tog = (k, ic, label) => h("button", { class: `icon-btn ${this.opts[k] ? "on" : ""}`, title: t(label), onclick: () => this.setOpt(k, !this.opts[k]), html: icon(ic, 18) });
    const styleSel = select(this.opts.style, STYLES.map(([id, label]) => [id, t(label)]), { onChange: (v) => this.setOpt("style", v) });
    styleSel.title = t("Render style");
    bar.append(...VIEWS.map(([id, label, key]) => vb(id, label, key)), sep(),
      tog("ortho", "ortho", "Orthographic projection (O)"),
      h("button", { class: `icon-btn ${this.opts.section !== null ? "on" : ""}`, title: t("Section cut at the current level (X)"), onclick: () => this.toggleSection(), html: icon("section", 18) }),
      tog("openDoors", "door", "Open doors"), tog("furniture", "sofa", "Furniture"), tog("roofs", "roof", "Roofs"), sep(),
      h("span", { class: "group-label" }, t("Style")), styleSel, sep(),
      tog("grid", "grid", "Grid (G)"), tog("dimensions", "dimension", "Building dimensions"),
      h("button", { class: "icon-btn", title: t("Zoom to fit"), html: icon("zoomFit", 18), onclick: () => this.zoomToFit() }), sep(),
      h("button", { class: "icon-btn", title: t("Save 3D image (PNG)…"), html: icon("camera", 18), onclick: () => this.screenshot() }),
      btn("file.export3d"), sep(), btn("view.plan", { label: true }));
  }

  renderPanel(host) {
    const p = this.app.store.project;
    // Paint bucket palette while that tool is active.
    if (this.opts.tool === "paint") {
      const pal = h("div", { class: "panel" }, panelHead("bucket", t("Paint bucket")));
      const sw = h("div", { class: "panel-body swatches" });
      for (const m of [...materialsFor("wall"), ...materialsFor("floor"), ...materialsFor("roof")].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)) {
        sw.append(h("button", { class: `swatch ${this.paintMaterial === m.id ? "on" : ""}`, title: t(m.name), "data-material": m.id, style: { background: m.color }, onclick: () => { this.paintMaterial = m.id; this.app.renderLeft(); } }));
      }
      pal.append(sw, h("div", { class: "panel-body field-hint" }, t("Material: {m}", { m: t((materialsFor("wall").concat(materialsFor("floor"), materialsFor("roof")).find((m) => m.id === this.paintMaterial) || { name: this.paintMaterial }).name) })));
      host.append(pal);
    }
    // Scenes: saved views to return to and to play as an animation.
    const scenes = h("div", { class: "panel" }, panelHead("scenes", t("Scenes"), h("div", { class: "grow" }),
      h("button", { class: "icon-btn", title: this.playing ? t("Stop") : t("Play the scenes"), "data-scene-play": "1", html: icon(this.playing ? "stop" : "play", 14), onclick: () => this.playScenes() }),
      h("button", { class: "icon-btn", title: t("Add scene"), "data-scene-add": "1", html: icon("plus", 14), onclick: () => this.addScene() })));
    const sb = h("div", { class: "panel-body flush", style: { padding: "0 6px 8px" } });
    for (const sc of p.scenes) {
      const row = h("div", { class: `net-row ${this.currentScene === sc.id ? "on" : ""}`, "data-scene": sc.id, title: t("Click to go to this view") }, h("span", {}, sc.name),
        h("span", { class: "ri-del", title: t("Delete"), html: icon("close", 12), onclick: (e) => { e.stopPropagation(); this.app.store.edit(t("Delete scene"), (pr) => { pr.scenes = pr.scenes.filter((x) => x.id !== sc.id); }); this.app.renderLeft(); } }));
      row.addEventListener("click", () => { this.goScene(sc); this.app.renderLeft(); });
      sb.append(row);
    }
    if (!p.scenes.length) sb.append(h("div", { class: "empty-note" }, t("Set up a view and press + to save it as a scene.")));
    scenes.append(sb);
    host.append(scenes);

    const panel = h("div", { class: "panel" });
    panel.append(panelHead("levels", t("Levels")));
    const body = h("div", { class: "panel-body" });
    for (const lv of p.levels.slice().reverse()) body.append(h("div", {}, checkbox(!this.hiddenLevels.has(lv.id), `${lv.name}  (${(lv.elevation / 1000).toFixed(2)} m)`, { onChange: (v) => this.setLevelVisible(lv.id, v) })));
    panel.append(body);
    host.append(panel);

    const vis = h("div", { class: "panel" });
    vis.append(panelHead("eye", t("Show")));
    const vb = h("div", { class: "panel-body" });
    for (const [k, label] of [["furniture", "Furniture"], ["roofs", "Roofs"], ["solids", "Mass models"], ["openDoors", "Open doors"], ["ground", "Ground"], ["grid", "Grid"], ["axes", "Axes"], ["dimensions", "Building dimensions"], ["gizmo", "Orientation gizmo"], ["fog", "Fog"]]) {
      vb.append(h("div", {}, checkbox(!!this.opts[k], t(label), { onChange: (v) => this.setOpt(k, v) })));
    }
    vis.append(vb);
    host.append(vis);

    const cut = h("div", { class: "panel" });
    cut.append(panelHead("section", t("Section and phases")));
    const cb = h("div", { class: "panel-body" });
    const top = Math.max(3000, ...p.levels.map((l) => l.elevation + l.height)) + 3000;
    cb.append(
      checkbox(this.opts.section !== null, t("Section cut"), { onChange: (v) => { if (v) this.toggleSection(); else this.setOpt("section", null); } }),
      field(t("Cut height"), stepper(this.opts.section ?? 1200, { min: -1000, max: top, step: 100, format: (v) => `${(v / 1000).toFixed(2)} m`, onChange: (v) => this.setOpt("section", v) })),
      field(t("Phase"), select(this.app.settings.phaseView || "all", [["all", t("All phases")], ["new", t("New design (no demolition)")], ["existing", t("Existing (before works)")]], { onChange: (v) => { this.app.setSetting("phaseView", v); this.applySettings(); } })),
      field(t("Render style"), select(this.opts.style, STYLES.map(([id, label]) => [id, t(label)]), { onChange: (v) => this.setOpt("style", v) })));
    const st = this.app.settings;
    const set = (k, v) => { st[k] = v; this.app.saveSettings(); this.applySettings(); this.app.renderLeft(); };
    const sunBody = h("div", { class: "panel-body" }, checkbox(!!st.sunStudy, t("Sun from the site, date and time"), { onChange: (v) => set("sunStudy", v) }));
    if (st.sunStudy) {
      const m = p.meta;
      const s = this.sun();
      const dl = daylight(+m.latitude || 37.57, +m.longitude || 126.98, new Date(new Date().getFullYear(), (st.sunMonth || 6) - 1, st.sunDay || 21), m.timezone ?? 9);
      const hh = (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`;
      sunBody.append(
        field(t("Month"), stepper(st.sunMonth || 6, { min: 1, max: 12, step: 1, onChange: (v) => set("sunMonth", v) })),
        field(t("Day"), stepper(st.sunDay || 21, { min: 1, max: 31, step: 1, onChange: (v) => set("sunDay", v) })),
        field(t("Time"), stepper(st.sunHour ?? 14, { min: 0, max: 23.5, step: 0.5, format: hh, onChange: (v) => set("sunHour", v) })),
        h("div", { class: "field-hint" }, t("{lat}°, {lon}° · azimuth {az}° · altitude {al}° · sunrise {r} · sunset {s}", { lat: (+m.latitude).toFixed(2), lon: (+m.longitude).toFixed(2), az: Math.round(s.azimuth), al: s.below ? "<0" : Math.round(s.altitude), r: dl.sunrise === null ? "—" : hh(dl.sunrise), s: dl.sunset === null ? "—" : hh(dl.sunset) })),
        h("button", { class: "btn small", onclick: () => this.app.run("file.props") }, t("Site location…")));
    } else {
      sunBody.append(
        field(t("Sun azimuth"), stepper(st.sunAzimuth ?? 135, { min: 0, max: 355, step: 15, format: (v) => `${v}°`, onChange: (v) => set("sunAzimuth", v) })),
        field(t("Sun altitude"), stepper(st.sunAltitude ?? 45, { min: 5, max: 90, step: 5, format: (v) => `${v}°`, onChange: (v) => set("sunAltitude", v) })));
    }
    cut.append(cb);
    host.append(cut, h("div", { class: "panel" }, panelHead("sunlight", t("Sun study")), sunBody));
    const stats = this.viewer ? this.viewer.stats() : null;
    if (stats) host.append(h("div", { class: "panel" }, h("div", { class: "panel-body" }, h("div", { class: "field-hint" }, t("{m} meshes · {k}k triangles", { m: stats.meshes, k: Math.round(stats.triangles / 1000) })))));
  }

  renderInspector(host) {
    const p = h("div", { class: "panel" });
    p.append(panelHead("list", t("Properties")));
    const body = h("div", { class: "panel-body" });
    const info = this.picked;
    const item = info && info.id ? findItem(this.app.store.project, info.id) : null;
    if (item) {
      const o = item.obj;
      const name = item.kind === "rooms" ? o.name || t("Room") : item.kind === "furniture" ? o.name || (furnitureDef(o.kind) ? t(furnitureDef(o.kind).name) : o.kind) : t({ walls: "Wall", openings: o.kind === "window" ? "Window" : "Door", columns: "Column", stairs: "Stair", roofs: "Roof" }[item.kind] || item.kind);
      const lv = levelById(this.app.store.project, info.level);
      body.append(h("div", { class: "prop-title" }, name), h("div", { class: "prop-sub" }, `${lv ? lv.name : ""} · ${t("height")} ${(info.point.y).toFixed(2)} m`),
        h("div", { class: "prop-actions" },
          h("button", { class: "btn small", onclick: () => this.app.crossProbe([o.id], "plan") }, h("span", { html: icon("floorplan", 14) }), t("Show in plan")),
          h("button", { class: "btn small", onclick: () => this.app.editProperties(item.kind, o) }, h("span", { html: icon("settings", 14) }), t("Properties…"))));
    } else body.append(h("div", { class: "empty-note" }, t("Click a wall, door, window, room floor or piece of furniture in the 3D view to see it here.")));
    p.append(body);
    host.append(p);
  }

  async screenshot() {
    const v = await this.ensure();
    if (!v) return;
    this.syncModel();
    const name = `${(this.app.store.project.meta.title || "building").replace(/[\\/:*?"<>|\s]+/g, "_")}-3d.png`;
    const r = await platform.saveDataUrl({ name, dataUrl: v.screenshot(), filters: [{ name: "PNG", extensions: ["png"] }] });
    if (r) toast(t("Saved {name}", { name: r.name }), "ok");
  }
}
