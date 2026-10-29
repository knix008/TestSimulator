// SketchUp-style modelling in the 3D tab: commands (command palette and the
// right-click menu), the grouped tool buttons of the 3D toolbar, the left
// panels (tags, components, outliner, materials, section planes, styles,
// camera, sandbox, animation export), the entity info in the inspector and
// the edits the viewer's tools ask for (src/view3d/sklayer.js events →
// src/core/skops.js inside store.edit, so everything undoes).

import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { h, panelHead, toast, checkbox, select, field, stepper, contextMenu, modal, promptDialog, input } from "./widgets.js";
import * as platform from "./platform.js";
import { findItem, levelById, LEVEL_COLLECTIONS } from "../core/project.js";
import { uid } from "../core/geom.js";
import { meshVolume, meshArea, faceNormal, sub, dot, add, mul, isClosed, solidMesh } from "../core/mesh.js";
import { componentById, instancesOf, tagOf, STYLE_DEFAULTS } from "../core/skmodel.js";
import * as sk from "../core/skops.js";
import { offsetFace } from "../core/mesh.js";
import { massSource, massLevels, massToBuilding, MASS_ROOF_KINDS } from "../core/massing.js";
import { MATERIALS, materialById, materialColor, projectMaterials } from "../lib/materials.js";
import { furnitureDef, allFurniture } from "../lib/furniture.js";
import { makeZip } from "../io/zip.js";

// _t() marks a string for the translation check; it is translated where shown.
const _t = (s) => s;
// What src/core/massing.js throws (shown translated by edit()).
const MASS_ERRORS = [_t("Select a mass, a face or lines drawn in 3D that close into an outline."), _t("The mass is lower than half a level.")];

// Tool groups of the 3D toolbar (split buttons: the last used tool shows).
export const TOOL_GROUPS = [
  ["draw", _t("Draw"), [["line", "skLine", _t("Line (L): click points; back on the start closes a face")], ["freehand", "skFreehand", _t("Freehand: press and draw")], ["rect", "skRect", _t("Rectangle (R)")], ["rotrect", "skRotRect", _t("Rotated rectangle: a side, then the width")], ["circle", "skCircle", _t("Circle (C)")], ["polygon", "skPolygon", _t("Polygon")], ["arc", "skArc", _t("Arc (A): start, end, bulge")], ["arc3", "skArc3", _t("3-point arc: start, a point on it, end")], ["pie", "skPie", _t("Pie: centre, radius, angle")]]],
  ["edit", _t("Modify"), [["move", "skMove", _t("Move / copy (M; Ctrl copies, then type x5 or /5)")], ["rotate", "rotate", _t("Rotate (Q; Ctrl copies)")], ["scale", "scale", _t("Scale (S)")], ["offset", "offset", _t("Offset (F)")], ["followme", "skFollow", _t("Follow me")], ["eraser", "skEraser", _t("Eraser (E)")]]],
  ["construct", _t("Construction"), [["protractor", "skProtractor", _t("Protractor: angled guide lines")], ["dimension", "dimension", _t("3D dimension")], ["text3d", "skText", _t("3D text")], ["axes", "axes", _t("Drawing axes")], ["sectionplane", "skSection", _t("Section plane: click a face")]]],
  ["camera", _t("Camera"), [["position", "skPosition", _t("Position camera: click where to stand")], ["lookaround", "skLook", _t("Look around")], ["twopoint", "skTwoPoint", _t("Two-point perspective")]]],
  ["sandbox", _t("Sandbox"), [["smoove", "skSmoove", _t("Smoove: drag a terrain up or down")], ["terrainScratch", "skTerrain", _t("Terrain from scratch…")], ["terrainContours", "skTerrain", _t("Terrain from contours (selected plan lines)")]]],
  ["solid", _t("Solid tools"), [["union", "skUnion", _t("Union")], ["subtract", "skSubtract", _t("Subtract: the second is cut out of the first")], ["trim", "skSubtract", _t("Trim: like subtract, the cutter stays")], ["intersect", "skIntersect", _t("Intersect")], ["split", "skSplit", _t("Split into three parts")], ["outer", "skUnion", _t("Outer shell")], ["intersectFaces", "skSplit", _t("Intersect faces (edges where masses meet)")], ["makeComponent", "skComponent", _t("Make component…")], ["massToBuilding", "skMassBuild", _t("Mass to building…")]]],
];
// U: push/pull (P is pan here).
const TOOL_KEYS = { l: "line", r: "rect", c: "circle", a: "arc", m: "move", q: "rotate", s: "scale", f: "offset", e: "eraser", t: "tape", b: "paint", u: "pushpull" };
const CLICK_TOOLS = new Set(["line", "freehand", "rect", "rotrect", "circle", "polygon", "arc", "arc3", "pie", "move", "rotate", "scale", "offset", "followme", "eraser", "protractor", "dimension", "text3d", "axes", "sectionplane", "position", "smoove", "place"]);

export const TOOL_HINTS = {
  line: _t("Line: click points (they snap to endpoints, midpoints, edges, faces and the axes). Click the start again to close a face; on a face it becomes its own face. Type a length + Enter. Esc ends."),
  freehand: _t("Freehand: press and draw; let go back at the start for a face, elsewhere for lines."),
  rotrect: _t("Rotated rectangle: click the first corner and the end of a side, then the width. Type a length + Enter for each."),
  arc3: _t("3-point arc: click the start, a point the arc passes through, then the end."),
  pie: _t("Pie: click the centre, the radius, then the angle (snaps every 15°; type degrees + Enter). It makes a face."),
  rect: _t("Rectangle: click two corners — on a face it is drawn into the face (pull it with Push/Pull). Type width,depth + Enter."),
  circle: _t("Circle: click the centre and the radius. Type a radius, or 32s for 32 sides, + Enter."),
  polygon: _t("Polygon: click the centre and a corner. Type 8s for eight sides."),
  arc: _t("Arc: click the start, the end, then the bulge."),
  move: _t("Move: click a point on the selection, then where it goes (arrows lock an axis). Ctrl copies; after a copy type 5x for an array or /5 to divide."),
  rotate: _t("Rotate: click the centre (on a face its normal is the axis), a start direction, then the angle (snaps every 15°; type degrees + Enter). Ctrl copies."),
  scale: _t("Scale: click the fixed point, a reference point, then drag the factor (along an axis = that axis only; type 2 or 1,1,2)."),
  offset: _t("Offset: click a face, then move to draw a loop inside its edge; click or type a distance."),
  followme: _t("Follow me: click the profile face, then the path — a face (its edge) or a drawn line."),
  eraser: _t("Eraser: click what to delete (also guides, 3D dimensions, text and section planes)."),
  protractor: _t("Protractor: click the vertex, the base line, then the angle — a guide line is made."),
  dimension: _t("3D dimension: click two points, then where the dimension line goes."),
  text3d: _t("3D text: click a point and type the text."),
  axes: _t("Axes: click the new origin and the red (x) direction. The tools snap to them."),
  sectionplane: _t("Section plane: click a face; the model is cut there. Manage the planes on the left."),
  position: _t("Position camera: click where to stand; then walk (W/A/S/D) and drag to look around."),
  smoove: _t("Smoove: drag a terrain up or down; the radius is on the left."),
  place: _t("Place component: click where it goes. Components that cut openings glue into the wall you click."),
  tape: _t("Tape measure: click two points. Ctrl (or 'Create guides') adds a guide line. Esc clears the measurements."),
};
// Typed in the measurements box with every drawing tool (shown in the hints).
export const POINT_HINT = _t("Type [x,y,z] for a point or <dx,dy,dz> from the last point, + Enter.");

export class SketchupUI {
  constructor(v3d) {
    this.v3d = v3d;
    this.app = v3d.app;
    this.last = { draw: "line", edit: "move", construct: "protractor", camera: "position", sandbox: "smoove", solid: "union" };
    this.outlinerQuery = "";
    this.lastCopy = null;
  }

  get p() { return this.app.store.project; }
  get viewer() { return this.v3d.viewer; }

  // ---------------------------------------------------------------- viewer options
  viewerOpts() {
    const s = { ...STYLE_DEFAULTS, ...(this.p.style3d || {}) };
    const lv = levelById(this.p, this.app.plan ? this.app.plan.level : null) || this.p.levels[0];
    return {
      edges: !!s.edges, edgeColor: s.edgeColor, profiles: !!s.profiles, profileWidth: s.profileWidth, colorByTag: !!s.colorByTag,
      groundColor: s.ground || null, fogDensity: s.fogDensity, hiddenTags: [...this.v3d.hiddenTags].sort(), workZ: lv ? lv.elevation : 0,
    };
  }
  pushOpts() { if (this.viewer) this.viewer.setOptions(this.viewerOpts()); }

  // Background from the style editor (sky gradient or a plain colour).
  background() {
    const s = this.p.style3d || {};
    if (s.sky) return { top: s.sky, bottom: s.horizon || "#f1f4f6" };
    if (s.background) return s.background;
    return null;
  }

  // ---------------------------------------------------------------- scenes
  sceneState() {
    const st = this.app.settings;
    return {
      hiddenTags: [...this.v3d.hiddenTags], sectionPlane: ((this.p.sections || []).find((x) => x.active) || {}).id || null, style3d: { ...(this.p.style3d || {}) },
      shadows: st.shadows !== false, sun: st.sunStudy ? { month: st.sunMonth || 6, day: st.sunDay || 21, hour: st.sunHour ?? 14 } : null,
      fov: st.fov3d || 45, twoPoint: !!this.v3d.opts.twoPoint, transition: st.sceneTransition ?? 1.4, delay: st.sceneDelay ?? 1.1,
    };
  }
  applyScene(sc) {
    // A scene without its own tag / section-plane state shows every tag and no plane cut.
    this.v3d.hiddenTags = new Set(Array.isArray(sc.hiddenTags) ? sc.hiddenTags : []);
    const st = this.app.settings;
    let settings = false;
    if (sc.sun) { Object.assign(st, { sunStudy: true, sunMonth: sc.sun.month, sunDay: sc.sun.day, sunHour: sc.sun.hour }); settings = true; }
    if (sc.shadows !== undefined && st.shadows !== sc.shadows) { st.shadows = sc.shadows; settings = true; }
    if (sc.fov && sc.fov !== st.fov3d) { st.fov3d = sc.fov; settings = true; }
    if (settings) this.v3d.applySettings();
    if (sc.twoPoint !== undefined && !!sc.twoPoint !== !!this.v3d.opts.twoPoint) this.v3d.setOpt("twoPoint", !!sc.twoPoint);
    // Section plane and style live in the model (as in SketchUp): not an undo step.
    for (const s of this.p.sections || []) s.active = !!sc.sectionPlane && s.id === sc.sectionPlane;
    if (sc.style3d) this.p.style3d = { ...STYLE_DEFAULTS, ...sc.style3d };
    this.pushOpts();
    if (this.viewer) { this.viewer.setOptions({ background: this.v3d.background() }); this.viewer.skRefresh(); this.viewer.rebuild(); }
  }

  // ---------------------------------------------------------------- tools
  setTool(tool) {
    if (tool === "lookaround") { this.v3d.setNav(this.v3d.opts.navMode === "walk" ? "orbit" : "walk"); return; }
    if (tool === "twopoint") { this.v3d.setOpt("twoPoint", !this.v3d.opts.twoPoint); return; }
    if (tool === "terrainScratch") { this.terrainDialog(); return; }
    if (tool === "terrainContours") { this.terrainFromContours(); return; }
    if (["union", "subtract", "trim", "intersect", "split", "outer"].includes(tool)) { this.solidTool(tool); return; }
    if (tool === "intersectFaces") { this.intersectFaces(); return; }
    if (tool === "makeComponent") { this.makeComponent(); return; }
    if (tool === "massToBuilding") { this.massToBuilding(); return; }
    this.v3d.setTool(tool);
  }
  hint(tool) {
    const base = TOOL_HINTS[tool] ? t(TOOL_HINTS[tool]) : "";
    return base && ["line", "rect", "rotrect", "move", "tape"].includes(tool) ? `${base} ${t(POINT_HINT)}` : base;
  }
  isClickTool(tool) { return CLICK_TOOLS.has(tool); }

  toolbar(bar, sep) {
    const cur = this.v3d.opts.tool;
    for (const [gid, gname, tools] of TOOL_GROUPS) {
      const active = tools.find(([id]) => id === cur || (id === "lookaround" && this.v3d.opts.navMode === "walk" && false) || (id === "twopoint" && false));
      const shown = active ? active[0] : this.last[gid];
      const def = tools.find(([id]) => id === shown) || tools[0];
      const on = !!active || (def[0] === "twopoint" && this.v3d.opts.twoPoint);
      const main = h("button", { class: `icon-btn ${on ? "on" : ""}`, title: `${t(gname)}: ${t(def[2])}`, "data-tool3d": def[0], "data-skgroup": gid, html: icon(def[1], 18), onclick: () => { this.last[gid] = def[0]; this.setTool(def[0]); } });
      const caret = h("button", { class: "icon-btn caret", title: t(gname), "data-skgroup-menu": gid, html: icon("chevronDown", 12), onclick: (e) => {
        const r = e.currentTarget.parentElement.getBoundingClientRect();
        contextMenu(tools.map(([id, ic, label]) => ({ label: t(label), icon: ic, checked: id === cur, action: () => { this.last[gid] = id; this.setTool(id); this.app.renderToolbar(); } })), r.left, r.bottom + 2);
      } });
      bar.append(h("div", { class: "split-btn", "data-skgroup-split": gid }, main, caret));
    }
    bar.append(sep());
  }

  onKey(e, down) {
    if (this.viewer && this.viewer.skKey(e, down)) return true;
    if (!down || e.ctrlKey || e.metaKey || e.altKey) return false;
    const tool = TOOL_KEYS[e.key.toLowerCase()];
    if (tool && this.v3d.opts.navMode !== "walk") {
      for (const [gid, , tools] of TOOL_GROUPS) if (tools.some(([id]) => id === tool)) this.last[gid] = tool;
      if (this.v3d.opts.tool !== tool) this.v3d.setTool(tool);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- events from the viewer
  levelFor(ev) {
    for (const r of ev.hits || []) { const it = findItem(this.p, r.kind === "comp" ? r.inst : r.id); if (it && it.obj.level) return it.obj.level; }
    return this.app.plan.level;
  }
  select(ids) { this.app.plan.select(ids.filter((id) => findItem(this.p, id))); this.v3d.highlight(ids); this.app.refreshInspector(); }
  edit(label, fn) {
    let out;
    try { out = this.app.store.edit(t(label), (p) => fn(p)); } catch (e) { toast(t(e.message), "warn", 4000); return undefined; }
    this.v3d.markDirty();
    return out;
  }
  // A push/pull or smoove drag: one undo step; each preview starts from the state before.
  begin(label) { this.app.store.begin(t(label)); }
  preview(fn) {
    const st = this.app.store;
    if (!st.pending) return;
    st.project = st.parse(st.pending.before);
    try { fn(st.project); } catch (e) { void e; }
    st.preview();
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => { if (this.viewer) this.viewer.setProject(st.project); }, 30);
  }
  commit() { clearTimeout(this.previewTimer); this.app.store.commit(); this.v3d.markDirty(); if (this.viewer) this.viewer.setProject(this.app.store.project); }
  cancel() { clearTimeout(this.previewTimer); this.app.store.cancel(); this.v3d.markDirty(); if (this.viewer) this.viewer.setProject(this.app.store.project); }

  // World distance along the hit normal → local distance of a component definition.
  localDistance(p, target, p0, n, d) {
    if (target.kind !== "comp") return d;
    const def = componentById(p, target.def), inst = p.furniture.find((f) => f.id === target.inst);
    if (!def || !inst) return d;
    const a = sk.worldToInstance(p, inst, def, p0), b = sk.worldToInstance(p, inst, def, add(p0, mul(n, d)));
    return dot(sub(b, a), faceNormal(def.mesh, target.face));
  }

  handle(ev) {
    const app = this.app;
    const v = this.viewer;
    switch (ev.op) {
      case "hint": if (ev.text) app.setHint(t(ev.text)); return;
      case "vcb": app.setHint(`${t("Measurements")}: ${ev.text}`); return;
      case "select": this.select(ev.ids); return;
      case "drawLoop": {
        let r = null;
        this.edit("Draw face", (p) => { r = sk.drawLoop(p, ev.pts, { level: this.levelFor(ev), hits: ev.hits, towards: ev.towards }); return r ? true : false; });
        if (r) { app.setHint(r.imprinted ? t("The shape is now a face of its own: pull it with Push/Pull.") : t("A new face: pull it into a solid with Push/Pull.")); if (!r.imprinted) this.select([r.id]); }
        return;
      }
      case "drawLine": {
        let r = null;
        this.edit("Draw line", (p) => { r = sk.drawLine(p, ev.pts, { level: this.levelFor(ev), hits: ev.hits }); return r ? true : false; });
        if (r) app.setHint(r.split ? t("The face is split in two.") : t("Lines drawn: use them as a path for Follow me, or close them into a face."));
        return;
      }
      case "pushStart": this.pp = { target: ev.target, copy: ev.copy, p0: ev.p0, n: ev.n }; this.begin("Push/Pull"); return;
      case "pushPreview": {
        const pp = this.pp;
        if (!pp) return;
        this.preview((p) => { const d = this.localDistance(p, pp.target, pp.p0, pp.n, ev.d); const r = sk.pushPullFace(p, pp.target, pp.target.face, d, { copy: pp.copy }); pp.mode = r.mode; });
        app.setHint(`${t("Push/Pull")}: ${(ev.d / 1000).toFixed(2)} m`);
        return;
      }
      case "pushEnd": {
        const pp = this.pp;
        if (!pp) return;
        this.preview((p) => { const d = this.localDistance(p, pp.target, pp.p0, pp.n, ev.d); sk.pushPullFace(p, pp.target, pp.target.face, d, { copy: pp.copy }); });
        this.pp = null;
        this.commit();
        return;
      }
      case "pushCancel": this.pp = null; this.cancel(); return;
      case "smooveStart": this.begin("Smoove"); return;
      case "smoovePreview": this.preview((p) => sk.smooveTerrain(p, ev.id, ev.x, ev.y, ev.r, ev.d)); return;
      case "smooveEnd": this.commit(); return;
      case "smooveCancel": this.cancel(); return;
      case "paintFace": {
        const m = this.v3d.paintMaterial;
        this.edit("Paint", (p) => {
          if (ev.target.kind === "comp") { const def = componentById(p, ev.target.def); if (!def || !def.mesh.f[ev.target.face]) return false; def.mesh.f[ev.target.face].m = m; return true; }
          const s = p.solids.find((x) => x.id === ev.target.id);
          if (!s) return false;
          sk.toMeshSolid(s);
          if (!s.mesh.f[ev.target.face]) return false;
          s.mesh.f[ev.target.face].m = m;
          return true;
        });
        return;
      }
      case "paintInstance": this.edit("Paint", (p) => { const f = p.furniture.find((x) => x.id === ev.id); if (!f) return false; f.material = this.v3d.paintMaterial; return true; }); return;
      case "sample": {
        let m = ev.material;
        const it = !m && ev.id ? findItem(this.p, ev.id) : null;
        if (it) m = it.obj.material || it.obj.floor || null;
        if (m) { this.v3d.paintMaterial = m; app.renderLeft(); toast(t("Material: {m}", { m: t((materialById(m) || { name: m }).name) }), "info", 1800); }
        return;
      }
      case "move": {
        let added = null;
        this.edit(ev.copy ? "Copy" : "Move", (p) => { if (ev.copy) added = sk.copyItems3d(p, ev.ids, ev.d); else sk.moveItems3d(p, ev.ids, ev.d); });
        if (added) { this.lastCopy = { kind: "move", ids: ev.ids, d: ev.d, added }; v.skLastCopy(this.lastCopy); this.select(added); app.setHint(t("Copied. Type 5x (an array of five) or /5 (five between) and Enter.")); }
        return;
      }
      case "rotate": {
        let r = null;
        this.edit(ev.copy ? "Rotated copy" : "Rotate", (p) => { r = sk.rotateItems3d(p, ev.ids, ev.c, ev.axis, ev.deg, { copies: ev.copy ? 1 : 0 }); });
        if (r && r.skipped) toast(t("Only masses can be tipped about a level axis; {n} items were left as they were.", { n: r.skipped }), "warn");
        if (ev.copy && r) { this.lastCopy = { kind: "rotate", ids: ev.ids, c: ev.c, axis: ev.axis, deg: ev.deg, added: r.ids }; v.skLastCopy(this.lastCopy); this.select(r.ids); app.setHint(t("Copied. Type 6x for a polar array and Enter.")); }
        return;
      }
      case "array": {
        const c = ev.last;
        if (!c) return;
        let added = [];
        this.edit("Array", (p) => {
          sk.eraseIds(p, c.added);
          if (c.kind === "move") added = sk.copyItems3d(p, c.ids, c.d, { n: ev.n, divide: ev.divide });
          else {
            const step = ev.divide ? c.deg / ev.n : c.deg;
            added = sk.rotateItems3d(p, c.ids, c.c, c.axis, step, { copies: ev.n }).ids;
          }
        });
        this.select(added);
        toast(t("{n} copies.", { n: added.length }), "ok");
        return;
      }
      case "scale": { let rest = 0; this.edit("Scale", (p) => { rest = sk.scaleItems3d(p, ev.ids, ev.o, ev.k); }); if (rest && Math.abs(ev.k[0] - ev.k[1]) > 1e-9) toast(t("Walls, rooms and similar items scale evenly only; they were left as they were."), "warn"); return; }
      case "offset": {
        let ok = false;
        this.edit("Offset", (p) => {
          const target = ev.target.kind === "comp" ? { kind: "comp", def: ev.target.def } : { kind: "solids", id: ev.target.id };
          const r = sk.editMesh(p, target, (m) => { const o = offsetFace(m, ev.target.face, ev.d); return o ? o.mesh : undefined; });
          ok = !!r;
          return ok;
        });
        if (!ok) toast(t("That offset does not fit inside the face."), "warn");
        return;
      }
      case "followme": {
        let s = null;
        this.edit("Follow me", (p) => {
          let path = null, closed = false;
          if (ev.path.kind === "edges") { const c = sk.edgeChainWorld(p, ev.path.id); if (!c) throw new Error("Pick a drawn line or a face as the path."); path = c.pts; closed = c.closed; }
          else { const l = sk.faceLoopWorld(p, ev.path.id, ev.path.face); if (!l) throw new Error("Pick a drawn line or a face as the path."); path = l[0]; closed = true; }
          s = sk.followMeOp(p, ev.profile, path, { closed });
        });
        if (s) this.select([s.id]);
        return;
      }
      case "erase": this.edit("Erase", (p) => sk.eraseIds(p, ev.ids) > 0); return;
      case "guide": this.edit("Guide", (p) => { sk.addGuide(p, ev.a, ev.b || null); }); return;
      case "dim": this.edit("3D dimension", (p) => { sk.addDim3d(p, ev.a, ev.b, ev.off); }); return;
      case "text": {
        promptDialog(t("Text"), "", { title: t("3D text") }).then((txt) => {
          if (!txt) return;
          this.edit("3D text", (p) => { sk.addText3d(p, [ev.at[0], ev.at[1], ev.at[2] + 800], txt, ev.at); });
        });
        return;
      }
      case "axes": this.edit("Axes", (p) => { p.view.axes3d = { o: ev.o.map(Math.round), ang: +ev.ang.toFixed(2) }; }); this.v3d.setTool("axes"); return;
      case "section": {
        this.edit("Section plane", (p) => { sk.addSection(p, ev.o.map(Math.round), ev.n, `${t("Section")} ${p.sections.length + 1}`); });
        if (this.viewer) this.viewer.rebuild();
        app.renderLeft();
        return;
      }
      case "positioned": this.v3d.opts.tool = "none"; this.v3d.opts.navMode = "walk"; app.renderToolbar(); app.setHint(this.v3d.hintText()); return;
      case "place": {
        let id = null;
        this.edit("Place component", (p) => {
          const def = componentById(p, ev.def);
          if (!def) return false;
          const wall = ev.wall && def.cut ? p.walls.find((w) => w.id === ev.wall) : null;
          if (wall) { id = sk.glueComponent(p, def.id, wall.id, sk.wallAt(wall, ev.at[0], ev.at[1])).id; return true; }
          const level = ev.level || app.plan.level;
          id = sk.placeComponent(p, def.id, level, ev.at[0], ev.at[1], { elevation: Math.max(0, ev.at[2] - sk.elevationOf(p, level)) }).id;
          return true;
        });
        if (id) this.select([id]);
        return;
      }
      case "sides": if (ev.tool === "circle") this.v3d.setOpt("circleSides", ev.n); else this.v3d.setOpt("polygonSides", ev.n); return;
      case "editEnd": app.setHint(this.v3d.hintText()); app.renderLeft(); return;
      default: return;
    }
  }

  // Double-click on a component instance: edit it in place.
  editComponent(id) {
    const f = this.p.furniture.find((x) => x.id === id && x.kind === "component");
    if (!f || !this.viewer) return false;
    this.viewer.skSetEditing({ inst: f.id, def: f.comp });
    this.app.setHint(t("Editing component {name}: every copy changes too. Push/pull, paint and draw on its faces; Esc closes it.", { name: (componentById(this.p, f.comp) || {}).name || "" }));
    this.app.renderLeft();
    return true;
  }
  editing() { return this.viewer ? this.viewer.skEditing() : null; }

  // ---------------------------------------------------------------- commands
  selIds() { return [...(this.app.plan.sel || [])]; }
  solidTool(op) {
    const ids = this.selIds();
    let r = null;
    this.edit({ union: "Union", subtract: "Subtract", trim: "Trim", intersect: "Intersect", split: "Split", outer: "Outer shell" }[op], (p) => { r = sk.solidTool(p, op, ids); });
    if (r) { this.select(r.ids); toast(t("Done: {n} solids.", { n: r.ids.length }), "ok", 1800); }
  }
  intersectFaces() { let n = 0; this.edit("Intersect faces", (p) => { n = sk.intersectFaces(p, this.selIds()); }); if (n) toast(t("Edges added to {n} masses.", { n }), "ok"); }
  async makeComponent() {
    const ids = this.selIds().filter((id) => { const it = findItem(this.p, id); return it && it.kind === "solids"; });
    if (!ids.length) { toast(t("Select one or more masses to make a component."), "warn"); return; }
    const name = h("input", { class: "input wide", value: t("Component") });
    let cut = false;
    const ok = await modal({ icon: "skComponent", title: t("Make component"), width: 440, body: h("div", { class: "form-grid" }, field(t("Name"), name), h("span", {}, ""), checkbox(false, t("Cuts an opening (glues into walls, like a window)"), { onChange: (v) => { cut = v; } })),
      buttons: [{ label: t("Cancel"), value: false }, { label: t("Make component"), value: true, primary: true }] });
    if (!ok) return;
    let r = null;
    this.edit("Make component", (p) => { r = sk.makeComponent(p, ids, { name: name.value.trim() || t("Component"), cut }); });
    if (r) { this.select([r.inst.id]); this.app.renderLeft(); }
  }
  // Mass → building: walls, slabs, rooms, windows, a door and a roof from the
  // selected mass, face or closed lines (src/core/massing.js).
  async massToBuilding() {
    const ids = this.selIds().filter((id) => { const it = findItem(this.p, id); return it && it.kind === "solids"; });
    const src = ids.length ? massSource(this.p, ids.length > 1 ? ids : ids[0]) : null;
    if (!src) { toast(t(MASS_ERRORS[0]), "warn", 4000); return; }
    const plan = massLevels(this.p, src, { count: 1 });
    const o = { count: src.flat ? Math.max(1, this.p.levels.length) : plan.length, wallType: ((this.p.wallTypes || []).find((w) => w.exterior) || {}).id || "", roof: plan.length > 3 ? "flat" : this.app.settings.roofKind || "gable", rooms: true, windows: true, door: true, keepMass: false };
    const walls = (this.p.wallTypes || []).map((w) => [w.id, `${w.name} (${w.layers.reduce((n, l) => n + l.thickness, 0)} mm)`]);
    const roofs = MASS_ROOF_KINDS.map((k) => [k, t({ flat: _t("Flat"), gable: _t("Gable"), hip: _t("Hip"), shed: _t("Shed"), none: _t("No roof") }[k])]);
    const body = h("div", { class: "form-grid", "data-sk-massing": "1" },
      src.flat ? field(t("Levels"), stepper(o.count, { min: 1, max: 60, step: 1, onChange: (v) => { o.count = v; } }))
        : field(t("Levels"), h("span", {}, t("{n} levels (from the height of the mass)", { n: plan.length }))),
      field(t("Wall type"), select(o.wallType, walls.length ? walls : [["", t("Default")]], { onChange: (v) => { o.wallType = v; } })),
      field(t("Roof"), select(o.roof, roofs, { onChange: (v) => { o.roof = v; } })),
      h("span", {}, ""), checkbox(true, t("A room on each level"), { onChange: (v) => { o.rooms = v; } }),
      h("span", {}, ""), checkbox(true, t("Windows along the walls"), { onChange: (v) => { o.windows = v; } }),
      h("span", {}, ""), checkbox(true, t("Entrance doors on the ground floor"), { onChange: (v) => { o.door = v; } }),
      h("span", {}, ""), checkbox(false, t("Keep the mass (hidden)"), { onChange: (v) => { o.keepMass = v; } }));
    const ok = await modal({ icon: "skMassBuild", title: t("Mass to building"), width: 480, body: h("div", {}, h("p", { class: "field-hint" }, t("Each level gets walls along the mass where it cuts the middle of the level, a floor slab and a room; the top gets the roof.")), body),
      buttons: [{ label: t("Cancel"), value: false }, { label: t("Make the building"), value: true, primary: true }] });
    if (!ok) return;
    let r = null;
    this.edit("Mass to building", (p) => { r = massToBuilding(p, src.ids.length > 1 ? src.ids : src.ids[0], { ...o, roomName: (lv) => lv.name }); });
    if (!r) return;
    this.select(r.walls);
    this.app.renderLeft();
    toast(t("Building made: {levels} levels, {walls} walls, {rooms} rooms, {openings} doors and windows.", { levels: r.levels.length, walls: r.walls.length, rooms: r.rooms.length, openings: r.openings.length }), "ok", 4000);
  }
  makeUnique() { let n = 0; this.edit("Make unique", (p) => { n = sk.makeUnique(p, this.selIds()); return n > 0; }); toast(n ? t("{n} instances now have their own definition.", { n }) : t("Select component instances or imported models."), n ? "ok" : "warn"); this.app.renderLeft(); }
  explode() {
    const ids = this.selIds().filter((id) => { const it = findItem(this.p, id); return it && it.kind === "furniture" && it.obj.kind === "component"; });
    if (!ids.length) { toast(t("Select component instances to explode."), "warn"); return; }
    const out = [];
    this.edit("Explode", (p) => { for (const id of ids) { const s = sk.explodeInstance(p, id); if (s) out.push(s.id); } });
    this.select(out);
  }
  hideSelected(on = true) {
    const ids = new Set(this.selIds());
    if (!ids.size) { toast(t("Select something to hide."), "warn"); return; }
    this.edit(on ? "Hide" : "Unhide", (p) => { for (const k of ["walls", "openings", ...LEVEL_COLLECTIONS]) for (const it of p[k] || []) if (ids.has(it.id)) { if (on) it.hidden = true; else delete it.hidden; } });
  }
  unhideAll() { let n = 0; this.edit("Unhide all", (p) => { for (const k of ["walls", "openings", ...LEVEL_COLLECTIONS]) for (const it of p[k] || []) if (it.hidden) { delete it.hidden; n++; } return n > 0; }); toast(t("{n} items shown again.", { n }), "ok"); }
  async addTag() {
    const name = await promptDialog(t("Tag name"), `${t("Tag")} ${this.p.layers.length}`, { title: t("New tag") });
    if (!name) return null;
    const id = uid("tag");
    const colors = ["#e57373", "#64b5f6", "#81c784", "#ffb74d", "#ba68c8", "#4db6ac", "#f06292", "#a1887f"];
    this.edit("New tag", (p) => { p.layers.push({ id, name: name.trim(), color: colors[p.layers.length % colors.length], visible: true }); });
    this.app.renderLeft();
    return id;
  }
  assignTag(tag) {
    const ids = new Set(this.selIds());
    if (!ids.size) { toast(t("Select items first, then assign them a tag."), "warn"); return; }
    this.edit("Assign tag", (p) => { for (const k of ["walls", "openings", ...LEVEL_COLLECTIONS]) for (const it of p[k] || []) if (ids.has(it.id)) { if (tag === "0") delete it.layer; else it.layer = tag; } });
    this.app.renderLeft();
  }
  setTagVisible(id, on) {
    if (on) this.v3d.hiddenTags.delete(id); else this.v3d.hiddenTags.add(id);
    this.pushOpts();
    this.app.renderLeft();
  }

  async terrainDialog() {
    const v = { w: 40000, d: 30000, cell: 2000 };
    const num = (k, step) => stepper(v[k], { min: step, max: 1e6, step, format: (x) => `${(x / 1000).toFixed(1)} m`, onChange: (x) => { v[k] = x; } });
    const ok = await modal({ icon: "skTerrain", title: t("Terrain from scratch"), width: 420, body: h("div", { class: "form-grid" }, field(t("Width"), num("w", 1000)), field(t("Depth"), num("d", 1000)), field(t("Grid cell"), num("cell", 250))), buttons: [{ label: t("Cancel"), value: false }, { label: t("Create"), value: true, primary: true }] });
    if (!ok) return;
    const ex = this.p.walls.length || this.p.solids.length ? null : [0, 0];
    let s = null;
    this.edit("Terrain", (p) => {
      const xs = [...p.walls.flatMap((w) => [w.x1, w.x2]), ...p.solids.flatMap((q) => q.pts.map((x) => x[0]))], ys = [...p.walls.flatMap((w) => [w.y1, w.y2]), ...p.solids.flatMap((q) => q.pts.map((x) => x[1]))];
      const cx = ex ? 0 : (Math.min(...xs) + Math.max(...xs)) / 2, cy = ex ? 0 : (Math.min(...ys) + Math.max(...ys)) / 2;
      s = sk.terrainFromScratch(p, this.app.plan.level, { x0: cx - v.w / 2, y0: cy - v.d / 2, w: v.w, d: v.d, nx: Math.round(v.w / v.cell), ny: Math.round(v.d / v.cell), z: -5 });
    });
    if (s) { this.select([s.id]); toast(t("Terrain made: shape it with Smoove."), "ok"); }
  }
  terrainFromContours() {
    let s = null;
    this.edit("Terrain from contours", (p) => { s = sk.terrainFromDrawings(p, this.selIds(), { interval: 1000, cell: 1000, level: this.app.plan.level }); });
    if (s) { this.select([s.id]); toast(t("Terrain made from {n} contour lines.", { n: this.selIds().length }), "ok"); }
  }

  // ---------------------------------------------------------------- animation export
  async exportAnimationDialog() {
    if (!this.p.scenes.length) { toast(t("Add scenes first: set up a view and press Add scene."), "warn"); return; }
    const o = { format: "webm", fps: 30, width: 0 };
    const ok = await modal({ icon: "skVideo", title: t("Export animation"), width: 460, body: h("div", { class: "form-grid" },
      field(t("Format"), select(o.format, [["webm", t("WebM video")], ["png", t("PNG frames (ZIP)")]], { onChange: (x) => { o.format = x; } })),
      field(t("Frames per second"), stepper(o.fps, { min: 5, max: 60, step: 5, onChange: (x) => { o.fps = x; } })),
      h("p", { class: "field-hint" }, t("The scenes play in order with their transition and delay times."))),
    buttons: [{ label: t("Cancel"), value: false }, { label: t("Export"), value: true, primary: true }] });
    if (ok) await this.exportAnimation(o.format, o.fps);
  }
  // Frames of the scene tour: each transition eased, each scene held for its delay.
  framePlan(fps) {
    const list = this.p.scenes;
    const frames = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i], b = list[(i + 1) % list.length];
      const hold = Math.max(1, Math.round((a.delay ?? 1.1) * fps));
      for (let k = 0; k < hold; k++) frames.push({ a, b: a, t: 1, scene: a });
      if (i === list.length - 1) break;
      const n = Math.max(1, Math.round((b.transition ?? 1.4) * fps));
      for (let k = 1; k <= n; k++) frames.push({ a, b, t: k / n, scene: k === n ? b : a });
    }
    return frames;
  }
  async exportAnimation(format = "webm", fps = 30, { save = true } = {}) {
    const v = await this.v3d.ensure();
    if (!v) return null;
    this.v3d.syncModel();
    const frames = this.framePlan(fps);
    const canvas = v.three.renderer.domElement;
    const base = `${(this.p.meta.title || "building").replace(/[\\/:*?"<>|\s]+/g, "_")}-animation`;
    let shown = null;
    const show = (f) => {
      if (f.scene !== shown) { shown = f.scene; this.v3d.goScene(f.scene, 1); }
      v.skCameraBetween(f.a.camera, f.b.camera, f.t);
      return v.screenshot();
    };
    toast(t("Exporting {n} frames…", { n: frames.length }), "info", 2500);
    if (format === "png") {
      const files = [];
      frames.forEach((f, i) => { const url = show(f); files.push({ name: `${base}/frame-${String(i + 1).padStart(5, "0")}.png`, data: platform.base64ToBytes ? platform.base64ToBytes(url.split(",")[1]) : Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0)) }); });
      const bytes = makeZip(files);
      if (!save) return { frames: frames.length, bytes };
      const r = await platform.saveBinaryFile({ name: `${base}-png.zip`, bytes, filters: [{ name: "ZIP", extensions: ["zip"] }] });
      if (r) toast(t("Saved {name}", { name: r.name }), "ok");
      return { frames: frames.length };
    }
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) { toast(t("This system cannot record video: export PNG frames instead."), "warn"); return null; }
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    rec.start();
    for (const f of frames) {
      show(f);
      if (track.requestFrame) track.requestFrame();
      await new Promise((r) => setTimeout(r, 1000 / fps));
    }
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: "video/webm" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!save) return { frames: frames.length, bytes };
    const r = await platform.saveBinaryFile({ name: `${base}.webm`, bytes, filters: [{ name: "WebM", extensions: ["webm"] }] });
    if (r) toast(t("Saved {name}", { name: r.name }), "ok");
    return { frames: frames.length, size: bytes.length };
  }

  // ---------------------------------------------------------------- panels
  renderToolPanel(host) {
    const tool = this.v3d.opts.tool;
    const ed = this.editing();
    if (ed) {
      const def = componentById(this.p, ed.def);
      host.append(h("div", { class: "panel" }, panelHead("skComponent", t("Editing component")), h("div", { class: "panel-body" },
        h("div", { class: "field-hint" }, t("{name}: {n} copies change together.", { name: def ? def.name : "", n: instancesOf(this.p, ed.def).length })),
        h("button", { class: "btn small", "data-sk-edit-close": "1", onclick: () => { this.viewer.skSetEditing(null); this.app.renderLeft(); this.app.setHint(this.v3d.hintText()); } }, t("Close component")))));
    }
    if (tool === "circle" || tool === "polygon") {
      const k = tool === "circle" ? "circleSides" : "polygonSides";
      host.append(h("div", { class: "panel" }, panelHead(tool === "circle" ? "skCircle" : "skPolygon", t(tool === "circle" ? "Circle" : "Polygon")), h("div", { class: "panel-body" },
        field(t("Sides"), stepper(this.v3d.opts[k] || (tool === "circle" ? 24 : 6), { min: 3, max: 128, step: 1, onChange: (x) => this.v3d.setOpt(k, x) })))));
    }
    if (tool === "smoove") host.append(h("div", { class: "panel" }, panelHead("skSmoove", t("Smoove")), h("div", { class: "panel-body" }, field(t("Radius"), stepper(this.v3d.opts.smooveRadius || 5000, { min: 500, max: 50000, step: 500, format: (x) => `${(x / 1000).toFixed(1)} m`, onChange: (x) => this.v3d.setOpt("smooveRadius", x) })))));
    if (tool === "tape") host.append(h("div", { class: "panel" }, panelHead("tape", t("Tape measure")), h("div", { class: "panel-body" }, checkbox(!!this.v3d.opts.tapeGuides, t("Create guides"), { onChange: (x) => this.v3d.setOpt("tapeGuides", x) }))));
    if (tool === "place") host.append(this.componentsPanel(true));
    if (tool === "paint") host.append(this.materialsPanel());
  }

  renderPanels(host) {
    for (const panel of [this.tagsPanel(), this.componentsPanel(false), this.outlinerPanel(), this.sectionsPanel(), this.stylesPanel(), this.cameraPanel(), this.animationPanel()]) host.append(this.fold(panel));
  }

  // A panel that folds to its title (remembered in the settings); tags and
  // components start open, the rest folded.
  fold(panel) {
    const key = panel.dataset.skPanel;
    const st = this.app.settings;
    const state = st.skFold || {};
    const open = state[key] ?? ["tags", "components"].includes(key);
    const head = panel.querySelector(".panel-head");
    head.classList.add("foldable");
    head.prepend(h("span", { class: "fold-ico", html: icon(open ? "chevronDown" : "chevronRight", 12) }));
    head.dataset.skFold = key;
    if (!open) panel.classList.add("folded");
    head.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      st.skFold = { ...(st.skFold || {}), [key]: !open };
      this.app.saveSettings();
      this.app.renderLeft();
    });
    return panel;
  }

  tagsPanel() {
    const p = this.p;
    const count = new Map();
    for (const k of ["walls", "openings", ...LEVEL_COLLECTIONS]) for (const it of p[k] || []) count.set(tagOf(it), (count.get(tagOf(it)) || 0) + 1);
    const panel = h("div", { class: "panel", "data-sk-panel": "tags" }, panelHead("skTag", t("Tags"), h("div", { class: "grow" }),
      h("button", { class: "icon-btn", title: t("New tag"), "data-sk-tag-add": "1", html: icon("plus", 14), onclick: () => this.addTag() })));
    const body = h("div", { class: "panel-body flush", style: { padding: "0 6px 8px" } });
    for (const l of p.layers) {
      const row = h("div", { class: "net-row", "data-sk-tag": l.id },
        checkbox(!this.v3d.hiddenTags.has(l.id), "", { onChange: (v) => this.setTagVisible(l.id, v) }),
        h("span", { style: { display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: l.color || "#9aa4b5", marginRight: "6px" } }),
        h("span", { class: "grow" }, `${l.name} (${count.get(l.id) || 0})`),
        h("span", { class: "ri-del", title: t("Assign the selection to this tag"), "data-sk-tag-assign": l.id, html: icon("skTag", 12), onclick: (e) => { e.stopPropagation(); this.assignTag(l.id); } }));
      body.append(row);
    }
    body.append(h("div", { class: "field-hint" }, t("Untick a tag to hide its items in 3D; scenes remember which tags are shown.")));
    panel.append(body);
    return panel;
  }

  // Definitions: components, imported models, built-in furniture — each with its instances.
  definitions() {
    const p = this.p;
    const out = [];
    for (const c of p.components) out.push({ key: `c:${c.id}`, name: c.name, icon: "skComponent", n: instancesOf(p, c.id).length, comp: c });
    for (const m of p.models) out.push({ key: `m:${m.id}`, name: m.name, icon: "model3d", n: p.furniture.filter((f) => f.kind === "model" && f.model === m.id).length, model: m });
    const kinds = new Map();
    for (const f of p.furniture) if (f.kind !== "component" && f.kind !== "model") kinds.set(f.kind, (kinds.get(f.kind) || 0) + 1);
    for (const [k, n] of kinds) { const d = furnitureDef(k); out.push({ key: `k:${k}`, name: d ? t(d.name) : k, icon: "sofa", n, kind: k }); }
    return out;
  }
  instanceIds(def) {
    const p = this.p;
    if (def.comp) return instancesOf(p, def.comp.id).map((x) => x.id);
    if (def.model) return p.furniture.filter((f) => f.kind === "model" && f.model === def.model.id).map((f) => f.id);
    return p.furniture.filter((f) => f.kind === def.kind).map((f) => f.id);
  }
  componentsPanel(placing) {
    const panel = h("div", { class: "panel", "data-sk-panel": "components" }, panelHead("skComponent", t("Components"), h("div", { class: "grow" }),
      h("button", { class: "icon-btn", title: t("Make component…"), "data-sk-make-comp": "1", html: icon("plus", 14), onclick: () => this.makeComponent() })));
    const body = h("div", { class: "panel-body flush", style: { padding: "0 6px 8px" } });
    const defs = this.definitions();
    for (const d of defs) {
      const row = h("div", { class: `net-row ${placing && d.comp && this.v3d.opts.placeComp === d.comp.id ? "on" : ""}`, "data-sk-def": d.key, title: t("Click to select every instance") },
        h("span", { html: icon(d.icon, 13), style: { marginRight: "6px" } }), h("span", { class: "grow" }, `${d.name}  ×${d.n}`),
        d.comp ? h("span", { class: "ri-del", title: t("Place in 3D"), "data-sk-place": d.comp.id, html: icon("plus", 12), onclick: (e) => { e.stopPropagation(); this.v3d.setOpt("placeComp", d.comp.id); this.v3d.setTool("place"); if (this.v3d.opts.tool !== "place") this.v3d.setTool("place"); } }) : null,
        d.comp && !d.n ? h("span", { class: "ri-del", title: t("Delete"), html: icon("close", 12), onclick: (e) => { e.stopPropagation(); this.edit("Delete component", (p) => { p.components = p.components.filter((c) => c.id !== d.comp.id); }); this.app.renderLeft(); } }) : null);
      row.addEventListener("click", () => { if (placing && d.comp) { this.v3d.setOpt("placeComp", d.comp.id); return; } this.select(this.instanceIds(d)); });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const items = [{ label: t("Select instances"), icon: "select", action: () => this.select(this.instanceIds(d)) }];
        if (d.comp) items.push({ label: t("Place in 3D"), icon: "plus", action: () => { this.v3d.setOpt("placeComp", d.comp.id); this.v3d.setTool("place"); } },
          { label: t("Rename…"), icon: "text", action: async () => { const n = await promptDialog(t("Name"), d.comp.name); if (n) this.edit("Rename component", (p) => { const c = componentById(p, d.comp.id); c.name = n.trim(); for (const f of p.furniture) if (f.comp === c.id) f.name = c.name; }); this.app.renderLeft(); } },
          { label: d.comp.cut ? t("Stop cutting openings") : t("Cut openings (glue into walls)"), icon: "window", action: () => { this.edit("Component", (p) => { const c = componentById(p, d.comp.id); c.cut = !c.cut; }); this.app.renderLeft(); } });
        contextMenu(items, e.clientX, e.clientY);
      });
      body.append(row);
    }
    if (!defs.length) body.append(h("div", { class: "empty-note" }, t("Select masses and press + to make a component; every copy of it changes together.")));
    panel.append(body);
    return panel;
  }

  outlinerPanel() {
    const p = this.p;
    const panel = h("div", { class: "panel", "data-sk-panel": "outliner" }, panelHead("skOutliner", t("Outliner")));
    const body = h("div", { class: "panel-body flush", style: { padding: "0 6px 8px" } });
    const q = h("input", { class: "input wide", placeholder: t("Filter…"), value: this.outlinerQuery, "data-sk-outliner-filter": "1" });
    q.addEventListener("keydown", (e) => e.stopPropagation());
    q.addEventListener("input", () => { this.outlinerQuery = q.value; fill(); });
    const list = h("div", {});
    const sel = new Set(this.selIds());
    const label = (k, o) => o.name || (k === "furniture" ? (o.kind === "component" ? `<${(componentById(p, o.comp) || {}).name || t("Component")}>` : furnitureDef(o.kind) ? t(furnitureDef(o.kind).name) : o.kind) : t({ walls: "Wall", rooms: "Room", columns: "Column", stairs: "Stair", roofs: "Roof", solids: "Mass", openings: "Opening" }[k] || k));
    const fill = () => {
      list.innerHTML = "";
      const f = this.outlinerQuery.trim().toLowerCase();
      let n = 0;
      for (const lv of p.levels) {
        const items = [];
        for (const k of ["solids", "furniture", "walls", "rooms", "roofs", "columns", "stairs"]) for (const o of (p[k] || []).filter((x) => x.level === lv.id)) items.push([k, o]);
        if (!items.length) continue;
        list.append(h("div", { class: "lib-group" }, lv.name));
        const groups = new Map();
        for (const [k, o] of items) { const g = o.group ? o.groupName || t("Group") : ""; if (!groups.has(g)) groups.set(g, []); groups.get(g).push([k, o]); }
        for (const [g, rows] of groups) {
          if (g) list.append(h("div", { class: "field-hint", style: { padding: "2px 4px" } }, `▾ ${g}`));
          for (const [k, o] of rows) {
            const name = label(k, o);
            if (f && !name.toLowerCase().includes(f)) continue;
            if (n++ > 400) continue;
            const row = h("div", { class: `net-row ${sel.has(o.id) ? "on" : ""}`, "data-sk-outline": o.id, style: { paddingLeft: g ? "16px" : "4px" } },
              h("span", { class: "grow" }, name),
              h("span", { class: "ri-del", title: o.hidden ? t("Show") : t("Hide"), "data-sk-hide": o.id, html: icon(o.hidden ? "eyeOff" : "eye", 12), onclick: (e) => { e.stopPropagation(); this.edit(o.hidden ? "Unhide" : "Hide", (pr) => { const it = findItem(pr, o.id); if (!it) return false; if (it.obj.hidden) delete it.obj.hidden; else it.obj.hidden = true; return true; }); this.app.renderLeft(); } }));
            row.addEventListener("click", () => this.select(o.group ? (p[k] || []).filter((x) => x.group === o.group).map((x) => x.id) : [o.id]));
            list.append(row);
          }
        }
      }
      if (n > 400) list.append(h("div", { class: "field-hint" }, t("{n} more — type to filter.", { n: n - 400 })));
      if (!n) list.append(h("div", { class: "empty-note" }, t("Nothing here yet.")));
    };
    fill();
    body.append(q, list);
    panel.append(body);
    return panel;
  }

  materialsPanel() {
    const own = projectMaterials();
    const panel = h("div", { class: "panel", "data-sk-panel": "materials" }, panelHead("material", t("Materials"), h("div", { class: "grow" }),
      h("button", { class: "icon-btn", title: t("New material…"), "data-sk-mat-new": "1", html: icon("plus", 14), onclick: () => this.materialDialog(null) }),
      h("button", { class: "icon-btn", title: t("Edit the material…"), "data-sk-mat-edit": "1", html: icon("settings", 14), onclick: () => this.materialDialog(this.v3d.paintMaterial) })));
    const sw = h("div", { class: "panel-body swatches" });
    for (const m of own.filter((x) => x.custom)) {
      const b = h("button", { class: `swatch ${this.v3d.paintMaterial === m.id ? "on" : ""}`, title: m.name, "data-material": m.id, style: { background: m.src ? `center / cover url(${m.src})` : m.color, opacity: String(Math.max(0.35, m.opacity ?? 1)) }, onclick: () => { this.v3d.paintMaterial = m.id; this.app.renderLeft(); } });
      sw.append(b);
    }
    if (!own.some((x) => x.custom)) sw.append(h("div", { class: "field-hint" }, t("Your own materials (colour, texture image and size, opacity) appear here.")));
    panel.append(sw, h("div", { class: "panel-body field-hint" }, t("Alt+click a face samples its material. On a reshaped mass each face is painted on its own; Ctrl+click paints the whole mass.")));
    return panel;
  }

  async materialDialog(id) {
    const lib = id ? materialById(id) : null;
    const m = { id: lib ? lib.id : uid("mat"), name: lib ? (lib.custom ? lib.name : t(lib.name)) : t("Material"), color: lib ? lib.color : "#c8b8a0", tile: lib ? lib.tile || 1000 : 1000, opacity: lib && lib.opacity !== undefined ? lib.opacity : 1, src: lib && lib.src ? lib.src : "" };
    const name = input(m.name, { onInput: (v) => { m.name = v; } });
    const color = h("input", { type: "color", value: m.color, oninput: (e) => { m.color = e.target.value; } });
    const prev = h("div", { style: { width: "64px", height: "64px", borderRadius: "6px", border: "1px solid var(--line)", background: m.src ? `center / cover url(${m.src})` : m.color } });
    const pick = h("button", { class: "btn small", onclick: async () => {
      const f = await platform.openFile({ filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"] }], binary: true }).catch(() => null);
      if (!f || !f.bytes) return;
      const ext = (f.name.split(".").pop() || "png").toLowerCase();
      let bin = "";
      for (let i = 0; i < f.bytes.length; i += 0x8000) bin += String.fromCharCode(...f.bytes.subarray(i, i + 0x8000));
      m.src = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${btoa(bin)}`;
      prev.style.background = `center / cover url(${m.src})`;
    } }, t("Texture image…"));
    const clear = h("button", { class: "btn small", onclick: () => { m.src = ""; prev.style.background = m.color; } }, t("No texture"));
    const ok = await modal({ icon: "material", title: lib ? t("Edit material") : t("New material"), width: 460, body: h("div", { class: "form-grid" },
      field(t("Name"), name), field(t("Colour"), color), field(t("Texture"), h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } }, prev, pick, clear)),
      field(t("Texture size"), stepper(m.tile, { min: 50, max: 20000, step: 50, format: (x) => `${x} mm`, onChange: (x) => { m.tile = x; } })),
      field(t("Opacity"), stepper(Math.round(m.opacity * 100), { min: 5, max: 100, step: 5, format: (x) => `${x}%`, onChange: (x) => { m.opacity = x / 100; } }))),
    buttons: [{ label: t("Cancel"), value: false }, { label: t("OK"), value: true, primary: true }] });
    if (!ok) return;
    this.edit(lib ? "Edit material" : "New material", (p) => {
      const entry = { id: m.id, name: m.name, color: m.color, tile: m.tile, opacity: m.opacity, ...(m.src ? { src: m.src } : {}) };
      const i = p.materials.findIndex((x) => x.id === m.id);
      if (i >= 0) p.materials[i] = entry; else p.materials.push(entry);
    });
    this.v3d.paintMaterial = m.id;
    this.app.renderLeft();
  }

  sectionsPanel() {
    const p = this.p;
    const o = this.v3d.opts;
    const panel = h("div", { class: "panel", "data-sk-panel": "sections" }, panelHead("skSection", t("Section planes"), h("div", { class: "grow" }),
      h("button", { class: "icon-btn", title: t("Section plane: click a face"), "data-sk-section-add": "1", html: icon("plus", 14), onclick: () => this.v3d.setTool("sectionplane") })));
    const body = h("div", { class: "panel-body flush", style: { padding: "0 6px 8px" } });
    for (const s of p.sections) {
      const row = h("div", { class: `net-row ${s.active ? "on" : ""}`, "data-sk-section": s.id, title: t("Click to make it the active cut (again: no cut)") },
        h("span", { html: icon(s.active ? "check" : "skSection", 12), style: { marginRight: "6px" } }), h("span", { class: "grow" }, s.name),
        h("span", { class: "ri-del", title: t("Move 100 mm into the model"), html: icon("arrowDown", 12), onclick: (e) => { e.stopPropagation(); this.edit("Move section plane", (pr) => sk.moveSection(pr, s.id, -100)); this.afterSection(); } }),
        h("span", { class: "ri-del", title: t("Move 100 mm out"), html: icon("arrowUp", 12), onclick: (e) => { e.stopPropagation(); this.edit("Move section plane", (pr) => sk.moveSection(pr, s.id, 100)); this.afterSection(); } }),
        h("span", { class: "ri-del", title: t("Flip"), html: icon("flip", 12), onclick: (e) => { e.stopPropagation(); this.edit("Flip section plane", (pr) => sk.flipSection(pr, s.id)); this.afterSection(); } }),
        h("span", { class: "ri-del", title: t("Delete"), html: icon("close", 12), onclick: (e) => { e.stopPropagation(); this.edit("Delete section plane", (pr) => { sk.eraseIds(pr, [s.id]); }); this.afterSection(); } }));
      row.addEventListener("click", () => { this.edit("Section plane", (pr) => sk.activateSection(pr, s.id)); this.afterSection(); });
      row.addEventListener("dblclick", async () => { const n = await promptDialog(t("Name"), s.name); if (n) { this.edit("Rename section plane", (pr) => { pr.sections.find((x) => x.id === s.id).name = n.trim(); }); this.afterSection(); } });
      body.append(row);
    }
    if (!p.sections.length) body.append(h("div", { class: "empty-note" }, t("Press + and click a face to cut the model there.")));
    body.append(h("div", {}, checkbox(o.showSections !== false, t("Show section planes"), { onChange: (v) => this.v3d.setOpt("showSections", v) })),
      h("div", {}, checkbox(o.sectionCuts !== false, t("Show section cuts"), { onChange: (v) => this.v3d.setOpt("sectionCuts", v) })),
      h("div", {}, checkbox(o.sectionFill !== false, t("Section fill"), { onChange: (v) => this.v3d.setOpt("sectionFill", v) })));
    panel.append(body);
    return panel;
  }
  afterSection() { if (this.viewer) { this.viewer.setOptions({ sectionCuts: this.v3d.opts.sectionCuts }); this.viewer.rebuild(); } this.app.renderLeft(); }

  stylesPanel() {
    const s = { ...STYLE_DEFAULTS, ...(this.p.style3d || {}) };
    const set = (k, v) => { this.edit("Style", (p) => { p.style3d = { ...STYLE_DEFAULTS, ...(p.style3d || {}), [k]: v }; }); this.pushOpts(); if (this.viewer) { this.viewer.setOptions({ background: this.v3d.background() }); this.viewer.skRefresh(); } this.app.renderLeft(); };
    const col = (k, fallback) => h("input", { type: "color", value: s[k] || fallback, "data-sk-style": k, onchange: (e) => set(k, e.target.value) });
    const clr = (k) => h("button", { class: "btn small", title: t("Default"), onclick: () => set(k, "") }, "×");
    const wm = h("input", { class: "input wide", value: s.watermark, placeholder: t("Watermark text"), "data-sk-style": "watermark" });
    wm.addEventListener("keydown", (e) => e.stopPropagation());
    wm.addEventListener("change", () => set("watermark", wm.value));
    const body = h("div", { class: "panel-body" },
      field(t("Faces"), select(this.v3d.opts.style, [["realistic", t("Realistic")], ["white", t("White model")], ["lines", t("Line drawing")], ["sketch", t("Sketch")], ["xray", t("X-ray")]], { onChange: (v) => this.v3d.setOpt("style", v) })),
      h("div", {}, checkbox(!!s.edges, t("Edges"), { onChange: (v) => set("edges", v) })),
      h("div", {}, checkbox(!!s.profiles, t("Profiles (thick outlines)"), { onChange: (v) => set("profiles", v) })),
      field(t("Profile width"), stepper(s.profileWidth, { min: 1, max: 12, step: 1, format: (x) => `${x} px`, onChange: (x) => set("profileWidth", x) })),
      field(t("Edge colour"), col("edgeColor", "#1d2128")),
      h("div", {}, checkbox(!!s.colorByTag, t("Colour by tag"), { onChange: (v) => set("colorByTag", v) })),
      field(t("Sky"), h("span", {}, col("sky", "#8fb6dc"), clr("sky"))),
      field(t("Horizon"), h("span", {}, col("horizon", "#f1f4f6"), clr("horizon"))),
      field(t("Background"), h("span", {}, col("background", "#e8ebf0"), clr("background"))),
      field(t("Ground"), h("span", {}, col("ground", "#9aa68a"), clr("ground"))),
      field(t("Section fill"), col("sectionFill", "#3b4250")),
      field(t("Fog density"), stepper(s.fogDensity, { min: 0.1, max: 5, step: 0.1, format: (x) => x.toFixed(1), onChange: (x) => set("fogDensity", +x.toFixed(1)) })),
      field(t("Watermark"), wm),
      field(t("Position"), select(s.watermarkPos, [["br", t("Bottom right")], ["bl", t("Bottom left")], ["tr", t("Top right")], ["tl", t("Top left")], ["c", t("Centre")]], { onChange: (v) => set("watermarkPos", v) })));
    return h("div", { class: "panel", "data-sk-panel": "styles" }, panelHead("skStyle", t("Style")), body);
  }

  cameraPanel() {
    const st = this.app.settings;
    const body = h("div", { class: "panel-body" },
      field(t("Field of view"), stepper(st.fov3d || 45, { min: 15, max: 110, step: 5, format: (x) => `${x}°`, onChange: (x) => { this.app.setSetting("fov3d", x); this.v3d.applySettings(); } })),
      h("div", {}, checkbox(!!this.v3d.opts.twoPoint, t("Two-point perspective"), { onChange: (v) => this.v3d.setOpt("twoPoint", v) })),
      h("div", {}, checkbox(st.shadows !== false, t("Shadows"), { onChange: (v) => { this.app.setSetting("shadows", v); this.v3d.applySettings(); } })),
      h("div", { class: "prop-actions" },
        h("button", { class: "btn small", onclick: () => this.v3d.setTool("position") }, h("span", { html: icon("skPosition", 14) }), t("Position camera")),
        h("button", { class: "btn small", onclick: () => this.v3d.setNav("walk") }, h("span", { html: icon("skLook", 14) }), t("Look around"))),
      h("div", { class: "prop-actions" },
        h("button", { class: "btn small", onclick: () => this.terrainDialog() }, h("span", { html: icon("skTerrain", 14) }), t("Terrain…")),
        h("button", { class: "btn small", onclick: () => this.terrainFromContours() }, t("From contours")),
        h("button", { class: "btn small", onclick: () => this.v3d.setTool("smoove") }, t("Smoove"))));
    return h("div", { class: "panel", "data-sk-panel": "camera" }, panelHead("camera", t("Camera and sandbox")), body);
  }

  animationPanel() {
    const st = this.app.settings;
    const body = h("div", { class: "panel-body" },
      field(t("Transition"), stepper(st.sceneTransition ?? 1.4, { min: 0, max: 10, step: 0.2, format: (x) => `${x.toFixed(1)} s`, onChange: (x) => { st.sceneTransition = +x.toFixed(1); this.app.saveSettings(); for (const s of this.p.scenes) s.transition = st.sceneTransition; } })),
      field(t("Scene delay"), stepper(st.sceneDelay ?? 1.1, { min: 0, max: 10, step: 0.1, format: (x) => `${x.toFixed(1)} s`, onChange: (x) => { st.sceneDelay = +x.toFixed(1); this.app.saveSettings(); for (const s of this.p.scenes) s.delay = st.sceneDelay; } })),
      h("div", { class: "prop-actions" }, h("button", { class: "btn small", "data-sk-anim": "1", onclick: () => this.exportAnimationDialog() }, h("span", { html: icon("skVideo", 14) }), t("Export animation…"))));
    return h("div", { class: "panel", "data-sk-panel": "animation" }, panelHead("skVideo", t("Animation")), body);
  }

  // Entity info for a picked item (below the 3D inspector's properties).
  renderEntityInfo(host, item, info) {
    const p = this.p;
    const o = item.obj;
    const body = h("div", { class: "panel-body" });
    body.append(field(t("Tag"), select(o.layer || "0", p.layers.map((l) => [l.id, l.name]), { onChange: (v) => this.edit("Assign tag", (pr) => { const it = findItem(pr, o.id); if (!it) return false; if (v === "0") delete it.obj.layer; else it.obj.layer = v; return true; }) })));
    body.append(h("div", {}, checkbox(!!o.hidden, t("Hidden"), { onChange: (v) => this.edit(v ? "Hide" : "Unhide", (pr) => { const it = findItem(pr, o.id); if (!it) return false; if (v) it.obj.hidden = true; else delete it.obj.hidden; return true; }) })));
    const acts = h("div", { class: "prop-actions" });
    if (item.kind === "solids") {
      const m = solidMesh(o);
      body.append(h("div", { class: "prop-sub" }, `${t("Volume")} ${(Math.abs(meshVolume(m)) / 1e9).toFixed(2)} m³ · ${t("Area")} ${(meshArea(m) / 1e6).toFixed(2)} m²${isClosed(m) ? "" : ` · ${t("not a closed solid")}`}`));
      if (info && info.face !== undefined && info.face !== null && m.f[info.face]) body.append(h("div", { class: "prop-sub" }, `${t("Face")} ${info.face + 1}: ${(meshArea({ v: m.v, f: [m.f[info.face]] }) / 1e6).toFixed(2)} m²`));
      acts.append(h("button", { class: "btn small", onclick: () => { this.app.plan.select([o.id]); this.makeComponent(); } }, h("span", { html: icon("skComponent", 14) }), t("Make component…")),
        h("button", { class: "btn small", "data-sk-mass-build": o.id, onclick: () => { this.app.plan.select([o.id]); this.massToBuilding(); } }, h("span", { html: icon("skMassBuild", 14) }), t("Mass to building…")));
    }
    if (item.kind === "furniture") {
      const ids = sk.sameDefinition(p, o.id);
      body.append(h("div", { class: "prop-sub" }, t("Definition: {name} · {n} instances", { name: o.kind === "component" ? (componentById(p, o.comp) || {}).name : o.kind === "model" ? (p.models.find((m) => m.id === o.model) || {}).name : t((furnitureDef(o.kind) || { name: o.kind }).name), n: ids.length })));
      acts.append(h("button", { class: "btn small", onclick: () => this.select(ids) }, t("Select instances")));
      if (o.kind === "component") {
        acts.append(h("button", { class: "btn small", "data-sk-edit-comp": o.id, onclick: () => this.editComponent(o.id) }, t("Edit component")),
          h("button", { class: "btn small", onclick: () => { this.app.plan.select([o.id]); this.makeUnique(); } }, t("Make unique")),
          h("button", { class: "btn small", onclick: () => { this.app.plan.select([o.id]); this.explode(); } }, t("Explode")));
      } else if (o.kind === "model") acts.append(h("button", { class: "btn small", onclick: () => { this.app.plan.select([o.id]); this.makeUnique(); } }, t("Make unique")));
      else acts.append(h("button", { class: "btn small", title: t("Every instance takes this one's size and colour"), onclick: () => { let n = 0; this.edit("Edit definition", (pr) => { n = sk.applyToInstances(pr, o.id); }); toast(t("{n} instances updated.", { n }), "ok"); } }, t("Apply to all instances")));
      const repl = h("select", { class: "input", title: t("Replace with") }, h("option", { value: "" }, `${t("Replace with")}…`),
        ...p.components.map((c) => h("option", { value: `c:${c.id}` }, c.name)), ...p.models.map((m) => h("option", { value: `m:${m.id}` }, m.name)), ...allFurniture().slice(0, 80).map((d) => h("option", { value: `k:${d.kind}` }, t(d.name))));
      repl.addEventListener("change", () => {
        const v = repl.value;
        if (!v) return;
        const [k, id] = [v.slice(0, 1), v.slice(2)];
        const ids2 = this.selIds().length ? this.selIds() : [o.id];
        this.edit("Replace", (pr) => sk.replaceInstances(pr, ids2, k === "c" ? { comp: id } : k === "m" ? { model: id } : { kind: id }, (kind) => { const d = furnitureDef(kind); return d ? [d.w, d.d, d.h] : null; }) > 0);
      });
      body.append(repl);
    }
    body.append(acts);
    host.append(h("div", { class: "panel", "data-sk-panel": "entity" }, panelHead("info", t("Entity info")), body));
  }
}

// Commands for the palette and the right-click menu (the toolbar has buttons).
export function registerSketchupCommands(app) {
  const C = (id, label, ic, run, extra = {}) => app.cmd(id, { label, icon: ic, key: extra.key || "", run, ...extra });
  const ui = () => { app.setTab("3d"); return app.v3d.ensure().then(() => app.v3d.sk); };
  for (const [, , tools] of TOOL_GROUPS) {
    for (const [id, ic, label] of tools) {
      C(`sk.${id}`, label, ic, () => ui().then((s) => s.setTool(id)), { checked: CLICK_TOOLS.has(id) ? () => app.v3d.opts.tool === id : id === "twopoint" ? () => !!app.v3d.opts.twoPoint : undefined });
    }
  }
  C("sk.makeUnique", _t("Make unique"), "skComponent", () => ui().then((s) => s.makeUnique()));
  C("sk.explode", _t("Explode component"), "skComponent", () => ui().then((s) => s.explode()));
  C("sk.hide", _t("Hide the selection in 3D"), "eyeOff", () => ui().then((s) => s.hideSelected(true)));
  C("sk.unhideAll", _t("Unhide all"), "eye", () => ui().then((s) => s.unhideAll()));
  C("sk.addTag", _t("New tag…"), "skTag", () => ui().then((s) => s.addTag()));
  C("sk.newMaterial", _t("New material…"), "material", () => ui().then((s) => s.materialDialog(null)));
  C("sk.exportAnimation", _t("Export animation…"), "skVideo", () => ui().then((s) => s.exportAnimationDialog()));
  C("sk.clearGuides", _t("Delete all guides"), "skGuide", () => ui().then((s) => s.edit("Delete guides", (p) => { const n = p.guides.length; p.guides = []; return n > 0; })));
  C("sk.place", _t("Place component"), "skComponent", () => ui().then(() => { if (!app.store.project.components.length) { toast(t("Make a component first (select masses, then Make component)."), "warn"); return; } if (!app.v3d.opts.placeComp) app.v3d.opts.placeComp = app.store.project.components[0].id; app.v3d.setTool("place"); }), { checked: () => app.v3d.opts.tool === "place" });
}

export { _t };
