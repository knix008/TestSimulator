// Interactive floor-plan editor: tools, selection, dragging with connected
// walls following, typed lengths, levels bar, context menus.

import { Viewport } from "../ui/viewport.js";
import { t } from "../ui/i18n.js";
import { contextMenu, popupInput, toast, confirmDialog } from "../ui/widgets.js";
import { uid, dist, rotPt, snap, pointInPolygon, polygonArea, fmtLen, offsetPolygon } from "../core/geom.js";
import { wallLength, newLevel, levelById, levelIndex, findItem, LEVEL_COLLECTIONS } from "../core/project.js";
import { wallAt, fitOpening, wallFrame, wallPoint, splitWall, mergeCollinear, wallOutlines } from "../core/walls.js";
import { roomAtPoint, detectRooms, buildingOutlines, suggestRoomName } from "../core/rooms.js";
import { furnitureDef, makeFurniture, drawFurniturePlan, furnitureCorners } from "../lib/furniture.js";
import { PLAN_THEMES, drawPlan, planBounds, stairGeometry, roomColor } from "./render.js";
import * as ops from "./ops.js";

export const PLAN_TOOLS = {
  select: { icon: "select", label: "Select", key: "Esc", hint: "Click to select, drag to move (joined walls follow), drag a wall end or room corner to reshape. Drag empty space to pan, Shift+drag to box-select. Double-click to edit." },
  wall: { icon: "wall", label: "Wall", key: "W", hint: "Click to start a wall and click each corner. Type a length (e.g. 3600 or 3.6m, or 3600<90) and press Enter for an exact wall. Shift = free angle. Enter, Esc or double-click ends; clicking the first point closes the outline." },
  room: { icon: "room", label: "Room", key: "A", hint: "Click inside walls to create the room automatically, or Shift+click to draw its corners (Enter finishes)." },
  door: { icon: "door", label: "Door", key: "D", hint: "Click on a wall to put a door there. X flips the swing side, H swaps the hinge." },
  window: { icon: "window", label: "Window", key: "N", hint: "Click on a wall to put a window there." },
  column: { icon: "column", label: "Column", key: "C", hint: "Click to place a column. It snaps to wall corners." },
  stair: { icon: "stairs", label: "Stair", key: "S", hint: "Click the bottom of the stair, then the top. The number of steps follows the level height." },
  furniture: { icon: "sofa", label: "Furniture", key: "F", hint: "Click to place. R rotates by 90° (Shift+R by 15°), Esc stops placing." },
  roof: { icon: "roof", label: "Roof", key: "O", hint: "Click inside the building for a roof over its outline, or Shift+click to draw the roof outline (Enter finishes)." },
  dimension: { icon: "dimension", label: "Dimension", key: "K", hint: "Click two points, move to set the offset and click again." },
  text: { icon: "text", label: "Text", key: "T", hint: "Click to place a text note." },
  line: { icon: "line", label: "Line", key: "L", hint: "Click points of a drafting line (CAD layer). Enter or double-click ends; clicking the first point closes it." },
  measure: { icon: "measure", label: "Measure", key: "M", hint: "Click two points to measure the distance. Esc clears." },
  massRect: { icon: "box3d", label: "Mass box", key: "B", hint: "Click two opposite corners of a mass model (SketchUp-style massing). Set its height on the right, or push/pull it in the 3D view." },
  massCircle: { icon: "cylinder", label: "Mass cylinder", key: "U", hint: "Click the centre, then a point on the circle." },
  massPoly: { icon: "massShape", label: "Mass shape", key: "", hint: "Click the corners of any shape; Enter or clicking the first point extrudes it into a mass." },
  grid: { icon: "gridline", label: "Grid line", key: "G", hint: "Click the two ends of a structural grid line. Lines are numbered 1, 2, 3 … (vertical) and A, B, C … (horizontal) and show on every level." },
};

// "3600", "3.6m", "360cm", "12'6\"", "3600<90" → {len (mm), ang (deg) | null}
export function parseLength(s) {
  const str = String(s || "").trim().toLowerCase().replace(",", ".");
  let ang = null;
  let body = str;
  const m = str.match(/^(.*)<\s*(-?[\d.]+)\s*$/);
  if (m) { body = m[1].trim(); ang = parseFloat(m[2]); }
  let len = NaN;
  const ft = body.match(/^(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/);
  if (ft) len = (parseFloat(ft[1]) * 12 + (ft[2] ? parseFloat(ft[2]) : 0)) * 25.4;
  else {
    const v = body.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|")?$/);
    if (v) {
      const k = { m: 1000, cm: 10, mm: 1, in: 25.4, '"': 25.4 }[v[2] || "mm"];
      len = parseFloat(v[1]) * k;
    }
  }
  return Number.isFinite(len) ? { len, ang } : null;
}

export class PlanEditor {
  constructor(app, host) {
    this.app = app;
    this.store = app.store;
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "editor-canvas";
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    this.levelBar = document.createElement("div");
    this.levelBar.className = "page-bar";
    host.append(this.levelBar);
    this.sel = new Set();
    this.tool = "select";
    this.toolOpts = {};
    this.hover = null;
    this.drag = null;
    this.chain = null;
    this.ghost = null;
    this.box = null;
    this.cursor = null;
    this.measure = null;
    this.images = new Map();
    this.levelId = null;
    this.vp = new Viewport(this.canvas, {
      minScale: 0.002, maxScale: 3,
      onRender: (ctx, vp) => { this.render(ctx, vp); this.renderRulers(ctx, vp); },
      onPointer: (type, e, m) => this.pointer(type, e, m),
      onViewChange: () => this.app.updateStatus(),
    });
    this.fitted = false;
  }

  get p() { return this.store.project; }
  get level() {
    if (!this.levelId || !levelById(this.p, this.levelId)) this.levelId = levelById(this.p, this.p.view.level) ? this.p.view.level : this.p.levels[0].id;
    return this.levelId;
  }
  get theme() { return this.app.planPalette ? this.app.planPalette() : PLAN_THEMES.dark; }
  get grid() { return +this.app.settings.planGrid || 100; }
  get ortho() { return this.app.settings.ortho !== false; }
  tol() { return 7 / this.vp.scale; }

  activate() {
    this.vp.resize();
    if (!this.fitted) { this.zoomFit(); this.fitted = true; }
    this.renderLevelBar();
    this.setTool(this.tool, this.toolOpts);
  }

  request() { this.vp.request(); }

  // ---------------------------------------------------------------- levels
  renderLevelBar() {
    const bar = this.levelBar;
    bar.innerHTML = "";
    const levels = this.p.levels;
    // column-reverse: the first (lowest) level sits at the bottom of the stack.
    for (let i = 0; i < levels.length; i++) {
      const lv = levels[i];
      const b = document.createElement("button");
      b.className = `page-tab ${lv.id === this.level ? "on" : ""}`;
      b.textContent = `${lv.name}  ${(lv.elevation / 1000).toFixed(2)} m`;
      b.dataset.level = lv.id;
      b.title = t("Click to edit this level, double-click to rename, right-click for more");
      b.addEventListener("click", () => this.setLevel(lv.id));
      b.addEventListener("dblclick", () => this.renameLevel(lv.id));
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        contextMenu([
          ...this.app.undoMenuItems(), "-",
          { label: t("Rename level…"), icon: "text", action: () => this.renameLevel(lv.id) },
          { label: t("Level properties…"), icon: "settings", action: () => this.app.levelProperties(lv) },
          { label: t("Duplicate level (walls, doors, windows)"), icon: "copy", action: () => this.addLevel({ copyFrom: lv.id }) },
          "-",
          { label: t("Delete level"), icon: "trash", danger: true, disabled: levels.length < 2, action: () => this.deleteLevel(lv.id) },
        ], e.clientX, e.clientY);
      });
      bar.append(b);
    }
    const add = document.createElement("button");
    add.className = "page-tab add";
    add.textContent = "+";
    add.title = t("Add a level on top");
    add.addEventListener("click", () => this.addLevel({ copyFrom: this.p.levels[this.p.levels.length - 1].id, wallsOnly: true }));
    bar.append(add);
  }

  // New level on top; optionally copying the walls (and openings) of another.
  addLevel({ copyFrom = null, wallsOnly = false } = {}) {
    const top = this.p.levels[this.p.levels.length - 1];
    const lv = newLevel(`${this.p.levels.length + 1}F`, top.elevation + top.height, top.height);
    this.store.edit(t("Add level"), (p) => {
      p.levels.push(lv);
      if (copyFrom) {
        const src = p.walls.filter((w) => w.level === copyFrom);
        const map = new Map();
        for (const w of src) {
          const nw = { ...w, id: uid("w"), level: lv.id };
          map.set(w.id, nw.id);
          p.walls.push(nw);
        }
        if (!wallsOnly) {
          for (const o of p.openings.filter((x) => map.has(x.wall))) p.openings.push({ ...o, id: uid("o"), wall: map.get(o.wall), tag: undefined });
          for (const r of p.rooms.filter((x) => x.level === copyFrom)) p.rooms.push({ ...JSON.parse(JSON.stringify(r)), id: uid("r"), level: lv.id });
        } else {
          // Windows repeat on the walls above; doors do not.
          for (const o of p.openings.filter((x) => map.has(x.wall) && x.kind === "window")) p.openings.push({ ...o, id: uid("o"), wall: map.get(o.wall), tag: undefined });
        }
      }
    });
    this.setLevel(lv.id);
    toast(t("Level {name} added at {e} m.", { name: lv.name, e: (lv.elevation / 1000).toFixed(2) }), "ok");
  }

  renameLevel(id) {
    const lv = levelById(this.p, id);
    const btn = this.levelBar.querySelector(`[data-level="${id}"]`);
    const r = (btn || this.levelBar).getBoundingClientRect();
    popupInput({ x: r.right + 6, y: r.top, value: lv.name, onDone: (v) => { if (v && v.trim()) this.store.edit(t("Rename level"), () => { lv.name = v.trim(); }); } });
  }

  async deleteLevel(id) {
    if (this.p.levels.length < 2) return;
    const lv = levelById(this.p, id);
    if (!(await confirmDialog(t("Delete level \"{name}\" and everything on it?", { name: lv.name }), { danger: true, ok: t("Delete") }))) return;
    this.store.edit(t("Delete level"), (p) => {
      for (const k of LEVEL_COLLECTIONS) p[k] = p[k].filter((x) => x.level !== id);
      const walls = new Set(p.walls.map((w) => w.id));
      p.openings = p.openings.filter((o) => walls.has(o.wall));
      p.levels = p.levels.filter((l) => l.id !== id);
    });
    this.setLevel(this.p.levels[0].id);
  }

  setLevel(id) {
    this.finishChain();
    this.levelId = id;
    this.p.view.level = id;
    this.sel.clear();
    this.renderLevelBar();
    this.request();
    this.app.onLevelChanged();
  }

  // ---------------------------------------------------------------- tools
  setTool(name, opts = {}) {
    this.finishChain();
    this.tool = name;
    this.toolOpts = opts;
    this.ghost = null;
    this.measure = null;
    if (name === "furniture") {
      const kind = opts.kind || this.app.settings.lastFurniture || "sofa3";
      if (kind === "model" && opts.model) {
        const asset = this.p.models.find((m) => m.id === opts.model);
        const sz = asset ? asset.size : [1000, 1000, 1000];
        this.ghost = { kind: "model", model: opts.model, name: asset ? asset.name : "", x: 0, y: 0, rot: 0, w: sz[0], d: sz[1], h: sz[2], elevation: 0 };
      } else this.ghost = makeFurniture(kind, 0, 0);
      [this.ghost.x, this.ghost.y] = [this.vp.mouse.wx, this.vp.mouse.wy];
    }
    if (name === "column") this.ghost = { x: this.vp.mouse.wx, y: this.vp.mouse.wy, w: this.p.defaults.columnSize, d: this.p.defaults.columnSize, rot: 0, shape: "rect" };
    this.canvas.style.cursor = name === "select" ? "default" : "crosshair";
    const def = PLAN_TOOLS[name];
    this.app.setHint(def ? t(def.hint) : "");
    this.app.onToolChanged();
    this.request();
  }

  // ---------------------------------------------------------------- selection
  select(ids, add = false) {
    if (!add) this.sel.clear();
    for (const id of ids) this.sel.add(id);
    this.selectionChanged();
  }

  toggle(id) {
    if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id);
    this.selectionChanged();
  }

  clearSelection() {
    if (!this.sel.size) return;
    this.sel.clear();
    this.selectionChanged();
  }

  selectionChanged() {
    for (const id of [...this.sel]) if (!findItem(this.p, id)) this.sel.delete(id);
    this.app.onSelection("plan", [...this.sel]);
    this.request();
  }

  selectedItems() {
    return [...this.sel].map((id) => findItem(this.p, id)).filter(Boolean);
  }

  // Select ids coming from another view (3D picking); jump to their level.
  selectIds(ids, { center = false } = {}) {
    const items = ids.map((id) => findItem(this.p, id)).filter(Boolean);
    if (!items.length) { this.sel.clear(); this.request(); return; }
    const lvOf = (it) => (it.kind === "openings" ? (this.p.walls.find((w) => w.id === it.obj.wall) || {}).level : it.obj.level);
    const lv = lvOf(items[0]);
    if (lv && lv !== this.level) { this.levelId = lv; this.p.view.level = lv; this.renderLevelBar(); }
    this.sel = new Set(items.map((i) => i.obj.id));
    if (center) {
      const c = ops.selectionCentre(this.p, [...this.sel]);
      if (c) this.vp.centerOn(...c);
    }
    this.request();
    this.app.refreshInspector();
  }

  focusPoint(x, y, ids = [], level = null) {
    if (level && level !== this.level) this.setLevel(level);
    this.vp.centerOn(x, y);
    if (this.vp.scale < 0.08) this.vp.zoomAt(this.vp.width / 2, this.vp.height / 2, 0.1 / this.vp.scale);
    if (ids.length) this.select(ids.filter((id) => findItem(this.p, id)));
    this.flash = { x, y, until: performance.now() + 1500 };
    const tick = () => { this.request(); if (performance.now() < this.flash.until) requestAnimationFrame(tick); };
    tick();
  }

  zoomFit() {
    const b = planBounds(this.p, this.level) || planBounds(this.p) || { x1: -2000, y1: -2000, x2: 12000, y2: 9000 };
    const pad = 1500;
    this.vp.fit({ x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad }, 0.04);
  }

  // ---------------------------------------------------------------- pointer
  snapAt(x, y, extra = {}) {
    const snapOn = this.app.settings.snap !== false;
    return ops.snapPoint(this.p, this.level, x, y, { grid: snapOn ? this.grid : 0, tol: snapOn ? this.tol() * 1.6 : 0, ...extra });
  }

  pointer(type, e, m) {
    const x = m.wx;
    const y = m.wy;
    if (type === "leave") { this.hover = null; this.request(); return; }
    if (type === "context") return this.contextMenuAt(e, x, y);
    if (type === "dblclick") return this.dblclick(x, y, e);
    if (type === "move") this.app.updateStatus();
    const tool = this.tool;
    if (tool === "select") return this.pointerSelect(type, e, x, y);
    if (tool === "wall" || tool === "line") return this.pointerChain(type, e, x, y);
    if (tool === "room" || tool === "roof" || tool === "massPoly") return this.pointerArea(type, e, x, y);
    if (tool === "massRect" || tool === "massCircle") return this.pointerMeasure(type, e, x, y);
    if (tool === "door" || tool === "window") return this.pointerOpening(type, e, x, y);
    if (tool === "furniture" || tool === "column") return this.pointerPlace(type, e, x, y);
    if (tool === "stair") return this.pointerStair(type, e, x, y);
    if (tool === "dimension" || tool === "measure" || tool === "grid") return this.pointerMeasure(type, e, x, y);
    if (tool === "text") {
      if (type === "move") { this.cursor = this.snapAt(x, y, { onWall: false }); this.request(); return; }
      if (type === "down" && e.button === 0) this.placeText(this.snapAt(x, y, { onWall: false }), e);
    }
  }

  pointerSelect(type, e, x, y) {
    if (type === "move") {
      if (this.drag) return this.dragMove(x, y, e);
      if (this.box) { this.box.x2 = x; this.box.y2 = y; this.request(); return; }
      const h = ops.hitTest(this.p, this.level, x, y, this.tol(), { selected: this.sel });
      const id = h ? h.obj.id : null;
      if (id !== (this.hover && this.hover.obj.id) || (h && this.hover && h.handle !== this.hover.handle)) { this.hover = h; this.request(); }
      this.canvas.style.cursor = h ? (h.handle !== undefined ? "crosshair" : "move") : "default";
      return;
    }
    if (type === "down" && e.button === 0) {
      this.canvas.focus();
      const h = ops.hitTest(this.p, this.level, x, y, this.tol(), { selected: this.sel });
      if (!h) {
        if (!e.shiftKey && !e.ctrlKey) this.clearSelection();
        if (this.app.settings.emptyDrag !== "select" && !e.shiftKey && !e.ctrlKey) { this.vp.startPan(e); return; }
        this.box = { x1: x, y1: y, x2: x, y2: y, add: e.shiftKey || e.ctrlKey };
        return;
      }
      if (h.handle === undefined && (e.shiftKey || e.ctrlKey)) { this.toggle(h.obj.id); return; }
      // A grouped item selects its whole group (Alt picks just the one).
      if (!this.sel.has(h.obj.id)) this.select(e.altKey ? [h.obj.id] : ops.groupMembers(this.p, h.obj.id));
      this.drag = { sx: x, sy: y, moved: false, hit: h, applied: [0, 0], alt: e.altKey };
      return;
    }
    if (type === "up") {
      if (this.box) {
        const b = this.box;
        this.box = null;
        const r = { x1: Math.min(b.x1, b.x2), y1: Math.min(b.y1, b.y2), x2: Math.max(b.x1, b.x2), y2: Math.max(b.y1, b.y2) };
        // Left-to-right: window (fully inside); right-to-left: crossing.
        const ids = ops.boxSelect(this.p, this.level, r, b.x2 < b.x1);
        this.select(ids, b.add);
        return;
      }
      if (this.drag) {
        const d = this.drag;
        this.drag = null;
        if (d.moved) this.store.commit();
        this.request();
      }
    }
  }

  dragMove(x, y, e) {
    const d = this.drag;
    if (!d.moved) {
      if (Math.hypot(x - d.sx, y - d.sy) * this.vp.scale < 4) return;
      d.moved = true;
      this.store.begin(d.hit.handle !== undefined ? t("Reshape") : t("Move"));
    }
    const h = d.hit;
    const p = this.store.project;
    if (h.handle !== undefined) {
      const obj = findItem(p, h.obj.id).obj;
      if (h.kind === "walls") {
        const other = h.handle ? [obj.x1, obj.y1] : [obj.x2, obj.y2];
        const ex = h.handle ? [obj.x2, obj.y2] : [obj.x1, obj.y1];
        const joined = new Set(p.walls.filter((w) => w.level === obj.level && (dist(w.x1, w.y1, ...ex) < 2 || dist(w.x2, w.y2, ...ex) < 2)).map((w) => w.id));
        const s = this.snapAt(x, y, { from: other, ortho: this.ortho && !e.shiftKey, exclude: joined, onWall: false });
        ops.moveWallEnd(p, obj, h.handle, s.x, s.y);
        this.cursor = s;
      } else if (h.kind === "rooms" || h.kind === "roofs") {
        const s = this.snapAt(x, y, { exclude: new Set([obj.id]), onWall: false });
        obj.pts[h.handle] = [s.x, s.y];
        this.cursor = s;
      } else if (h.kind === "dimensions" || h.kind === "grids") {
        const s = this.snapAt(x, y, { onWall: false });
        if (h.handle) { obj.x2 = s.x; obj.y2 = s.y; } else { obj.x1 = s.x; obj.y1 = s.y; }
      }
      this.store.preview();
      this.request();
      return;
    }
    // Whole selection: translate by the grid-snapped offset.
    const g = this.app.settings.snap !== false ? this.grid : 0;
    let dx = x - d.sx, dy = y - d.sy;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const sdx = g ? snap(dx, g / (h.kind === "furniture" ? 2 : 1)) : dx;
    const sdy = g ? snap(dy, g / (h.kind === "furniture" ? 2 : 1)) : dy;
    const ddx = sdx - d.applied[0], ddy = sdy - d.applied[1];
    if (ddx || ddy) {
      ops.moveItems(p, [...this.sel], ddx, ddy, { stretch: !d.alt });
      d.applied = [sdx, sdy];
      this.store.preview();
    }
    this.request();
  }

  dblclick(x, y, e) {
    if (this.chain) { this.finishChain(); return; }
    if (this.tool !== "select") return;
    const h = ops.hitTest(this.p, this.level, x, y, this.tol(), { selected: this.sel });
    if (h) this.app.editProperties(h.kind, h.obj);
    void e;
  }

  // ---------------------------------------------------------------- walls / lines
  pointerChain(type, e, x, y) {
    const c = this.chain;
    const last = c && c.pts.length ? c.pts[c.pts.length - 1] : null;
    const s = this.snapAt(x, y, { from: last, ortho: this.ortho && !e.shiftKey });
    this.cursor = s;
    if (type === "move") { this.request(); return; }
    if (type !== "down") return;
    if (e.button !== 0) return;
    this.addChainPoint([s.x, s.y]);
  }

  addChainPoint(pt) {
    const tool = this.tool;
    if (!this.chain) { this.chain = { tool, pts: [pt], ids: [] }; this.request(); return; }
    const c = this.chain;
    const last = c.pts[c.pts.length - 1];
    if (dist(...last, ...pt) < 1) { this.finishChain(); return; }
    const closing = c.pts.length >= 2 && dist(...pt, ...c.pts[0]) < 1;
    if (tool === "wall") {
      const id = uid("w");
      const d = this.p.defaults;
      const wt = this.app.settings.wallType ? this.p.wallTypes.find((x) => x.id === this.app.settings.wallType) : null;
      const thickness = wt ? wt.layers.reduce((s, l) => s + l.thickness, 0) : +this.app.settings.wallThickness || d.wallThickness;
      this.store.edit(t("Add wall"), (p) => { p.walls.push({ id, level: this.level, x1: last[0], y1: last[1], x2: pt[0], y2: pt[1], thickness, height: null, material: this.app.settings.wallMaterial || null, ...(wt ? { type: wt.id } : {}), phase: this.app.settings.drawPhase || "new" }); });
      c.ids.push(id);
    }
    c.pts.push(pt);
    if (closing) this.finishChain();
    this.request();
  }

  finishChain() {
    const c = this.chain;
    if (!c) return;
    this.chain = null;
    if (c.tool === "line" && c.pts.length >= 2) {
      let pts = c.pts;
      const closed = pts.length > 3 && dist(...pts[0], ...pts[pts.length - 1]) < 1;
      if (closed) pts = pts.slice(0, -1);
      this.store.edit(t("Add line"), (p) => { p.drawings.push({ id: uid("g"), level: this.level, layer: this.app.settings.drawLayer || "0", kind: "polyline", pts, closed }); });
    }
    if ((c.tool === "room" || c.tool === "roof") && c.pts.length >= 3) this.createArea(c.tool, c.pts);
    if (c.tool === "massPoly" && c.pts.length >= 3) this.createSolid(c.pts);
    if (c.tool === "wall" && c.ids.length) {
      this.select(c.ids);
      this.app.setHint(t("{n} walls drawn. Press A and click inside them to make a room.", { n: c.ids.length }));
    }
    this.request();
  }

  undoChainPoint() {
    const c = this.chain;
    if (!c || c.pts.length < 2) { this.chain = null; this.request(); return; }
    if (c.tool === "wall" && c.ids.length) {
      const id = c.ids.pop();
      this.store.edit(t("Remove wall"), (p) => { p.walls = p.walls.filter((w) => w.id !== id); p.openings = p.openings.filter((o) => o.wall !== id); });
    }
    c.pts.pop();
    this.request();
  }

  // A typed length while drawing: along the current direction.
  typeLength(initial = "") {
    const c = this.chain;
    if (!c || !c.pts.length) return;
    const m = this.vp.mouse;
    popupInput({
      x: m.x + this.canvas.getBoundingClientRect().left + 16, y: m.y + this.canvas.getBoundingClientRect().top + 16, value: initial, selectAll: !initial, placeholder: t("Length (mm, 3.6m, 3600<90)"),
      onDone: (v) => {
        const r = parseLength(v);
        if (!r || r.len <= 0) return;
        const last = c.pts[c.pts.length - 1];
        let ang;
        if (r.ang !== null) ang = (-r.ang * Math.PI) / 180; // typed angles are counter-clockwise on screen
        else {
          const cur = this.cursor || { x: m.wx, y: m.wy };
          ang = Math.atan2(cur.y - last[1], cur.x - last[0]);
          if (!Number.isFinite(ang) || (cur.x === last[0] && cur.y === last[1])) ang = 0;
        }
        this.addChainPoint([Math.round((last[0] + Math.cos(ang) * r.len) * 10) / 10, Math.round((last[1] + Math.sin(ang) * r.len) * 10) / 10]);
        this.canvas.focus();
      },
    });
  }

  // ---------------------------------------------------------------- rooms / roofs
  pointerArea(type, e, x, y) {
    const c = this.chain;
    const last = c && c.pts.length ? c.pts[c.pts.length - 1] : null;
    const s = this.snapAt(x, y, { from: last, ortho: !!last && this.ortho && !e.shiftKey, onWall: false });
    this.cursor = s;
    if (type === "move") { this.request(); return; }
    if (type !== "down" || e.button !== 0) return;
    if (!c && !e.shiftKey && this.tool !== "massPoly") {
      const walls = this.p.walls.filter((w) => w.level === this.level);
      if (this.tool === "room") {
        const r = roomAtPoint(walls, x, y);
        if (r) { this.createArea("room", r.pts); return; }
      } else {
        const out = buildingOutlines(walls).filter((pts) => pointInPolygon(x, y, pts));
        if (out.length) { this.createArea("roof", out[0]); return; }
      }
    }
    if (c && c.pts.length >= 3 && dist(s.x, s.y, ...c.pts[0]) < this.tol() * 1.5) { this.finishChain(); return; }
    if (!c) this.chain = { tool: this.tool, pts: [[s.x, s.y]], ids: [] };
    else c.pts.push([s.x, s.y]);
    this.request();
  }

  createArea(kind, pts) {
    if (Math.abs(polygonArea(pts)) < 1e4) return;
    const id = uid(kind === "room" ? "r" : "f");
    if (kind === "room") {
      const n = this.p.rooms.filter((r) => r.level === this.level).length;
      const name = suggestRoomName(Math.abs(polygonArea(pts)), n, t);
      this.store.edit(t("Add room"), (p) => { p.rooms.push({ id, level: this.level, name, pts, floor: this.app.settings.floorMaterial || "oak" }); });
      toast(t("Room \"{name}\" added: {a} m². Double-click to rename it.", { name, a: (Math.abs(polygonArea(pts)) / 1e6).toFixed(2) }), "ok", 3000);
    } else {
      this.store.edit(t("Add roof"), (p) => { p.roofs.push({ id, level: this.level, pts, kind: this.app.settings.roofKind || "gable", pitch: 30, overhang: 400, thickness: 200, material: "roof-tiles" }); });
      toast(t("Roof added. Change its shape and pitch on the right; see it in 3D (F3)."), "ok", 3500);
    }
    this.select([id]);
  }

  // Create rooms for every enclosed space of the level that has none yet.
  detectRooms() {
    const walls = this.p.walls.filter((w) => w.level === this.level);
    const existing = this.p.rooms.filter((r) => r.level === this.level);
    const found = detectRooms(walls).filter((r) => !existing.some((e) => { const [cx, cy] = centre(r.pts); return pointInPolygon(cx, cy, e.pts); }));
    if (!found.length) { toast(t("No new enclosed spaces found."), "info"); return 0; }
    const ids = [];
    this.store.edit(t("Detect rooms"), (p) => {
      found.sort((a, b) => b.area - a.area).forEach((r, i) => {
        const id = uid("r");
        ids.push(id);
        p.rooms.push({ id, level: this.level, name: suggestRoomName(r.area, existing.length + i, t), pts: r.pts, floor: this.app.settings.floorMaterial || "oak" });
      });
    });
    this.select(ids);
    toast(t("{n} rooms created.", { n: found.length }), "ok");
    return found.length;
  }

  // ---------------------------------------------------------------- doors / windows
  openingTarget(x, y) {
    const walls = this.p.walls.filter((w) => w.level === this.level);
    const h = wallAt(walls, x, y, this.tol() * 2);
    if (!h) return null;
    const kind = this.tool === "window" ? "window" : "door";
    const d = this.p.defaults;
    const width = kind === "window" ? +this.app.settings.windowWidth || d.windowWidth : +this.app.settings.doorWidth || d.doorWidth;
    const L = wallLength(h.wall);
    if (L < width + 20) return { wall: h.wall, tooShort: true };
    const g = this.app.settings.snap !== false ? this.grid / 2 : 0;
    const at = fitOpening(h.wall, g ? snap(h.u, g) : h.u, width);
    // The side of the wall the cursor is on decides where a door swings.
    const f = wallFrame(h.wall);
    const side = (x - h.x) * f.n[0] + (y - h.y) * f.n[1] >= 0 ? 1 : -1;
    const hinge = h.u < at ? "start" : "end";
    return { wall: h.wall, at, width, kind, side, hinge };
  }

  pointerOpening(type, e, x, y) {
    this.ghost = this.openingTarget(x, y);
    if (type === "move") { this.request(); return; }
    if (type !== "down" || e.button !== 0) return;
    const g = this.ghost;
    if (!g) { toast(t("Click on a wall."), "warn", 1500); return; }
    if (g.tooShort) { toast(t("This wall is too short for it."), "warn"); return; }
    const d = this.p.defaults;
    const o = g.kind === "window"
      ? { id: uid("o"), wall: g.wall.id, kind: "window", type: this.app.settings.windowType || "casement", at: g.at, width: g.width, height: +this.app.settings.windowHeight || d.windowHeight, sill: +this.app.settings.windowSill || d.windowSill, side: g.side, hinge: g.hinge }
      : { id: uid("o"), wall: g.wall.id, kind: "door", type: this.app.settings.doorType || "single", at: g.at, width: g.width, height: +this.app.settings.doorHeight || d.doorHeight, sill: 0, side: g.side, hinge: g.hinge };
    const clash = this.p.openings.some((q) => q.wall === o.wall && Math.abs(q.at - o.at) < (q.width + o.width) / 2 - 1);
    if (clash) { toast(t("There is already a door or window there."), "warn"); return; }
    this.store.edit(g.kind === "window" ? t("Add window") : t("Add door"), (p) => { p.openings.push(o); });
    this.sel = new Set([o.id]);
    this.app.refreshInspector();
    this.request();
  }

  flipSelected(what = "side") {
    const ids = [...this.sel].filter((id) => this.p.openings.some((o) => o.id === id));
    if (!ids.length) return false;
    this.store.edit(t("Flip door"), (p) => {
      for (const o of p.openings) {
        if (!ids.includes(o.id)) continue;
        if (what === "side") o.side = -(o.side || 1);
        else o.hinge = o.hinge === "end" ? "start" : "end";
      }
    });
    return true;
  }

  // ---------------------------------------------------------------- furniture / columns
  pointerPlace(type, e, x, y) {
    const g = this.ghost;
    if (!g) return;
    const s = this.tool === "column" ? this.snapAt(x, y) : this.snapAt(x, y, { onWall: false, endpoints: false, grid: this.app.settings.snap !== false ? this.grid / 2 : 0 });
    g.x = s.x;
    g.y = s.y;
    if (type === "move") { this.request(); return; }
    if (type !== "down" || e.button !== 0) return;
    if (this.tool === "column") {
      const id = uid("c");
      this.store.edit(t("Add column"), (p) => { p.columns.push({ id, level: this.level, x: g.x, y: g.y, w: g.w, d: g.d, rot: g.rot, shape: this.app.settings.columnShape || "rect", height: null }); });
      return;
    }
    const id = uid("u");
    const item = { ...JSON.parse(JSON.stringify(g)), id, level: this.level };
    this.store.edit(t("Add furniture"), (p) => { p.furniture.push(item); });
    if (g.kind !== "model") { this.app.settings.lastFurniture = g.kind; this.app.recordRecentFurniture(g.kind); }
    if (e.shiftKey) return; // Shift keeps placing
    this.setTool("select");
    this.select([id]);
  }

  // ---------------------------------------------------------------- stairs
  pointerStair(type, e, x, y) {
    const s = this.snapAt(x, y, { from: this.stairStart || null, ortho: !!this.stairStart && this.ortho && !e.shiftKey, onWall: false });
    this.cursor = s;
    if (type === "move") { this.request(); return; }
    if (type !== "down" || e.button !== 0) return;
    if (!this.stairStart) { this.stairStart = [s.x, s.y]; this.request(); return; }
    const a = this.stairStart;
    this.stairStart = null;
    const len = dist(...a, s.x, s.y);
    if (len < 600) { this.request(); return; }
    const lv = levelById(this.p, this.level);
    const steps = Math.max(3, Math.round((lv.height + (lv.slab || 0)) / 175));
    const id = uid("s");
    const width = +this.app.settings.stairWidth || this.p.defaults.stairWidth;
    const rot = (Math.atan2(s.y - a[1], s.x - a[0]) * 180) / Math.PI;
    this.store.edit(t("Add stair"), (p) => { p.stairs.push({ id, level: this.level, x: (a[0] + s.x) / 2, y: (a[1] + s.y) / 2, rot, length: len, width, steps }); });
    this.select([id]);
  }

  // ---------------------------------------------------------------- dimensions / measure
  pointerMeasure(type, e, x, y) {
    const s = this.snapAt(x, y, { from: this.measure && this.measure.b === null ? this.measure.a : null, ortho: false, onWall: true });
    this.cursor = s;
    const m = this.measure;
    if (type === "move") {
      if (m && m.stage === 2) {
        const L = dist(...m.a, ...m.b) || 1;
        const nx = -(m.b[1] - m.a[1]) / L, ny = (m.b[0] - m.a[0]) / L;
        m.offset = snap((x - m.a[0]) * nx + (y - m.a[1]) * ny, 50);
      }
      this.request();
      return;
    }
    if (type !== "down" || e.button !== 0) return;
    if (!m || (this.tool === "measure" && m.b)) { this.measure = { a: [s.x, s.y], b: null, stage: 1, offset: 0 }; this.request(); return; }
    if (m.stage === 1) {
      m.b = [s.x, s.y];
      if (this.tool === "dimension") m.stage = 2;
      else if (this.tool === "grid") { this.addGridLine(m.a, m.b); this.measure = null; }
      else if (this.tool === "massRect" || this.tool === "massCircle") { this.createSolid(this.massShape(m.a, m.b)); this.measure = null; }
      else toast(`${t("Distance")}: ${fmtLen(dist(...m.a, ...m.b))}  (${(dist(...m.a, ...m.b) / 1000).toFixed(3)} m)`, "info", 3500);
      this.request();
      return;
    }
    if (m.stage === 2) {
      const id = uid("k");
      if (dist(...m.a, ...m.b) > 1) this.store.edit(t("Add dimension"), (p) => { p.dimensions.push({ id, level: this.level, x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1], offset: m.offset || 600 }); });
      this.measure = null;
      this.request();
    }
  }

  // The plan shape of a mass box (two corners) or cylinder (centre, radius).
  massShape(a, b) {
    if (this.tool === "massCircle") {
      const r = dist(...a, ...b);
      return Array.from({ length: 32 }, (_, i) => [a[0] + r * Math.cos((i / 32) * Math.PI * 2), a[1] + r * Math.sin((i / 32) * Math.PI * 2)]);
    }
    return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
  }

  createSolid(pts) {
    if (Math.abs(polygonArea(pts)) < 1e4) return null;
    const id = uid("v");
    this.store.edit(t("Add mass"), (p) => { p.solids.push({ id, level: this.level, pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]), z0: 0, height: +this.app.settings.massHeight || 3000, taper: 1, material: this.app.settings.massMaterial || "concrete", phase: this.app.settings.drawPhase || "new" }); });
    this.select([id]);
    return id;
  }

  // ---------------------------------------------------------------- groups / offset / scale
  groupSelection() {
    const ids = [...this.sel].filter((id) => !this.p.openings.some((o) => o.id === id) && !this.p.grids.some((g) => g.id === id));
    if (ids.length < 2) { toast(t("Select two or more items to group."), "warn"); return null; }
    const gid = uid("grp");
    this.store.edit(t("Group"), (p) => { for (const k of LEVEL_COLLECTIONS) for (const x of p[k]) if (ids.includes(x.id)) x.group = gid; });
    toast(t("{n} items grouped. Click any of them to select the group; Alt+click picks one.", { n: ids.length }), "ok", 3000);
    return gid;
  }

  ungroupSelection() {
    const ids = [...this.sel];
    let n = 0;
    this.store.edit(t("Ungroup"), (p) => { for (const k of LEVEL_COLLECTIONS) for (const x of p[k]) if (ids.includes(x.id) && x.group) { delete x.group; n++; } return n > 0; });
    if (n) toast(t("{n} items ungrouped.", { n }), "ok");
  }

  // A parallel copy of rooms, masses, roofs and closed lines (outwards for d > 0).
  offsetSelection(d) {
    const items = this.selectedItems().filter((i) => ["rooms", "solids", "roofs"].includes(i.kind) || (i.kind === "drawings" && i.obj.pts && i.obj.closed));
    if (!items.length || !d) { toast(t("Select a room, mass, roof or closed line to offset."), "warn"); return []; }
    const ids = [];
    this.store.edit(t("Offset"), (p) => {
      for (const { kind, obj } of items) {
        const copy = JSON.parse(JSON.stringify(obj));
        copy.id = uid(kind[0]);
        copy.pts = offsetPolygon(obj.pts, -d).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
        delete copy.label;
        delete copy.group;
        p[kind].push(copy);
        ids.push(copy.id);
      }
    });
    this.select(ids);
    return ids;
  }

  scaleSelection(k) {
    if (!this.sel.size || !(k > 0) || k === 1) return;
    const ids = [...this.sel];
    this.store.edit(t("Scale"), (p) => ops.scaleItems(p, ids, k));
  }

  // Structural grid line with the next free label (1, 2 … or A, B …).
  addGridLine(a, b) {
    if (dist(...a, ...b) < 500) return null;
    const vertical = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
    const used = new Set(this.p.grids.map((g) => g.label));
    let label = "";
    for (let i = 0; i < 200 && (!label || used.has(label)); i++) label = vertical ? String(i + 1) : i < 26 ? String.fromCharCode(65 + i) : `A${i - 25}`;
    const id = uid("g");
    this.store.edit(t("Add grid line"), (p) => { p.grids.push({ id, x1: a[0], y1: a[1], x2: b[0], y2: b[1], label }); });
    this.select([id]);
    return id;
  }

  // Select everything of the same kind (and wall type / furniture kind) on the level.
  selectSimilar() {
    const it = this.selectedItems()[0];
    if (!it) return;
    const same = (o) => (it.kind === "walls" ? (o.type || "") === (it.obj.type || "") && o.thickness === it.obj.thickness : it.kind === "furniture" ? o.kind === it.obj.kind : it.kind === "openings" ? o.kind === it.obj.kind && o.width === it.obj.width : true);
    let list = it.kind === "openings" ? this.p.openings.filter((o) => { const w = this.p.walls.find((q) => q.id === o.wall); return w && w.level === this.level; }) : it.kind === "grids" ? this.p.grids : (this.p[it.kind] || []).filter((o) => o.level === this.level);
    list = list.filter(same);
    this.select(list.map((o) => o.id));
    toast(t("{n} similar items selected.", { n: list.length }), "info", 1500);
  }

  // Overall dimensions along the outside of the level's walls.
  autoDimensions() {
    const walls = this.p.walls.filter((w) => w.level === this.level);
    if (!walls.length) { toast(t("Draw some walls first."), "warn"); return; }
    const outlines = buildingOutlines(walls);
    const pts = outlines.flat();
    if (!pts.length) for (const w of walls) pts.push([w.x1, w.y1], [w.x2, w.y2]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
    // Wall corner coordinates along the top and left side for the chains.
    const xsC = [...new Set(walls.flatMap((w) => [Math.round(w.x1), Math.round(w.x2)]))].sort((a, b) => a - b);
    const ysC = [...new Set(walls.flatMap((w) => [Math.round(w.y1), Math.round(w.y2)]))].sort((a, b) => a - b);
    this.store.edit(t("Auto dimensions"), (p) => {
      p.dimensions = p.dimensions.filter((d) => !(d.level === this.level && d.auto));
      const add = (ax, ay, bx, by, offset) => p.dimensions.push({ id: uid("k"), level: this.level, x1: ax, y1: ay, x2: bx, y2: by, offset, auto: true });
      add(x1, y1, x2, y1, -1400);
      add(x1, y2, x1, y1, -1400);
      for (let i = 0; i + 1 < xsC.length; i++) if (xsC[i + 1] - xsC[i] > 200) add(xsC[i], y1, xsC[i + 1], y1, -800);
      for (let i = 0; i + 1 < ysC.length; i++) if (ysC[i + 1] - ysC[i] > 200) add(x1, ysC[i + 1], x1, ysC[i], -800);
    });
    toast(t("Dimensions added around the building."), "ok");
  }

  // ---------------------------------------------------------------- text
  placeText(s, e) {
    const r = this.canvas.getBoundingClientRect();
    popupInput({
      x: e.clientX || r.left + this.vp.toScreen(s.x, s.y)[0], y: e.clientY || r.top + this.vp.toScreen(s.x, s.y)[1], placeholder: t("Text"),
      onDone: (v) => {
        if (!v || !v.trim()) return;
        const id = uid("t");
        this.store.edit(t("Add text"), (p) => { p.texts.push({ id, level: this.level, x: s.x, y: s.y, text: v, size: +this.app.settings.textSize || this.p.defaults.textSize, rot: 0 }); });
      },
    });
  }

  // ---------------------------------------------------------------- edit commands
  deleteSelection() {
    if (!this.sel.size) return;
    const ids = [...this.sel];
    this.store.edit(t("Delete"), (p) => ops.deleteItems(p, ids));
    this.sel.clear();
    this.selectionChanged();
  }

  selectAll() {
    this.select(ops.boxSelect(this.p, this.level, { x1: -1e9, y1: -1e9, x2: 1e9, y2: 1e9 }));
  }

  rotate(angle = 90) {
    if ((this.tool === "furniture" || this.tool === "column") && this.ghost) { this.ghost.rot = ((this.ghost.rot || 0) + angle + 360) % 360; this.request(); return; }
    if (!this.sel.size) return;
    const ids = [...this.sel];
    this.store.edit(t("Rotate"), (p) => ops.rotateItems(p, ids, angle, null, this.grid));
  }

  mirror(axis = "x") {
    if (!this.sel.size) return;
    if (axis === "x" && this.flipSelected("side")) return;
    const ids = [...this.sel];
    this.store.edit(t("Mirror"), (p) => ops.mirrorItems(p, ids, axis));
  }

  copy() {
    if (!this.sel.size) return;
    this.app.clipboard = ops.copyItems(this.p, [...this.sel]);
    toast(t("Copied {n} items", { n: this.sel.size }), "info", 1200);
  }

  cut() { this.copy(); this.deleteSelection(); }

  paste(at = null) {
    const clip = this.app.clipboard;
    if (!clip) return;
    const m = this.vp.mouse;
    const g = this.grid;
    const [x, y] = at || (m.inside ? [snap(m.wx, g), snap(m.wy, g)] : [clip.centre[0] + 1000, clip.centre[1] + 1000]);
    let ids = [];
    this.store.edit(t("Paste"), (p) => { ids = ops.pasteItems(p, clip, this.level, x, y); });
    this.select(ids);
  }

  duplicate() {
    if (!this.sel.size) return;
    const clip = ops.copyItems(this.p, [...this.sel]);
    let ids = [];
    this.store.edit(t("Duplicate"), (p) => { ids = ops.pasteItems(p, clip, this.level, clip.centre[0] + 1000, clip.centre[1] + 1000); });
    this.select(ids);
  }

  nudge(dx, dy) {
    if (!this.sel.size) return;
    const ids = [...this.sel];
    this.store.edit(t("Move"), (p) => ops.moveItems(p, ids, dx, dy));
  }

  splitWallAt(wall, x, y) {
    const { u } = { u: (x - wall.x1) * wallFrame(wall).d[0] + (y - wall.y1) * wallFrame(wall).d[1] };
    this.store.edit(t("Split wall"), (p) => {
      const w = p.walls.find((q) => q.id === wall.id);
      if (!splitWall(p, w, snap(u, 10), () => uid("w"))) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------- keys
  onKey(e) {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === "c") { this.copy(); return true; }
      if (lk === "x") { this.cut(); return true; }
      if (lk === "v") { this.paste(); return true; }
      if (lk === "d") { this.duplicate(); return true; }
      if (lk === "a") { this.selectAll(); return true; }
      return false;
    }
    if (this.chain && /^[0-9.]$/.test(k)) { this.typeLength(k); return true; }
    if (k === "Escape") {
      if (this.chain) { this.finishChain(); return true; }
      if (this.stairStart || this.measure) { this.stairStart = null; this.measure = null; this.request(); return true; }
      if (this.app.panMode) { this.app.panMode = false; this.app.applyPanMode(); return true; }
      if (this.tool !== "select") { this.setTool("select"); return true; }
      this.clearSelection();
      return true;
    }
    if (k === "Enter" && this.chain) { this.finishChain(); return true; }
    if (k === "Backspace" && this.chain) { this.undoChainPoint(); return true; }
    if (k === "Delete" || k === "Backspace") { this.deleteSelection(); return true; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (arrows && this.sel.size) { const s = e.shiftKey ? this.grid * 10 : this.grid; this.nudge(arrows[0] * s, arrows[1] * s); return true; }
    const lk = k.toLowerCase();
    if (lk === "r") { this.rotate(e.shiftKey ? -15 : 90); return true; }
    if (lk === "x") { this.mirror("x"); return true; }
    if (lk === "y") { this.mirror("y"); return true; }
    if (lk === "h" && this.flipSelected("hinge")) return true;
    if (lk === "e" && this.sel.size === 1) { const it = this.selectedItems()[0]; this.app.editProperties(it.kind, it.obj); return true; }
    for (const [id, def] of Object.entries(PLAN_TOOLS)) {
      if (def.key.length === 1 && def.key.toLowerCase() === lk && !e.altKey) {
        if (id === "furniture") this.app.run("plan.furniture");
        else this.setTool(id);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- context menu
  contextMenuAt(e, x, y) {
    if (this.chain) { this.finishChain(); return; }
    if (this.tool !== "select") { this.setTool("select"); return; }
    const h = ops.hitTest(this.p, this.level, x, y, this.tol(), { selected: this.sel });
    const items = [...this.app.undoMenuItems(), "-"];
    if (h) {
      if (!this.sel.has(h.obj.id)) this.select([h.obj.id]);
      items.push({ label: t("Properties…"), icon: "settings", shortcut: "E", action: () => this.app.editProperties(h.kind, h.obj) });
      if (h.kind === "walls") {
        items.push({ label: t("Add door here"), icon: "door", action: () => { this.setTool("door"); this.pointerOpening("down", { button: 0 }, x, y); this.setTool("select"); } },
          { label: t("Add window here"), icon: "window", action: () => { this.setTool("window"); this.pointerOpening("down", { button: 0 }, x, y); this.setTool("select"); } },
          { label: t("Split wall here"), icon: "cut", action: () => this.splitWallAt(h.obj, x, y) },
          { label: t("Merge straight walls"), icon: "line", action: () => { let n = 0; this.store.edit(t("Merge walls"), (p) => { n = mergeCollinear(p, this.level); return n > 0; }); toast(t("{n} walls merged.", { n }), "info"); } });
      }
      if (h.kind === "openings") items.push({ label: t("Flip swing side"), icon: "flip", shortcut: "X", action: () => this.flipSelected("side") }, { label: t("Swap hinge"), icon: "mirror", shortcut: "H", action: () => this.flipSelected("hinge") });
      items.push({ label: t("Select similar"), icon: "select", action: () => this.selectSimilar() }, { label: t("BIM properties…"), icon: "bim", action: () => this.app.run("build.bimProps") });
      items.push("-", { label: t("Rotate"), icon: "rotate", shortcut: "R", action: () => this.rotate(90) },
        { label: t("Duplicate"), icon: "copy", shortcut: "Ctrl+D", action: () => this.duplicate() },
        { label: t("Copy"), icon: "copy", shortcut: "Ctrl+C", action: () => this.copy() },
        { label: t("Show in 3D"), icon: "cube", action: () => this.app.crossProbe([...this.sel], "3d") },
        "-", { label: t("Delete"), icon: "trash", danger: true, shortcut: "Del", action: () => this.deleteSelection() });
    } else {
      items.push({ label: t("Paste"), icon: "paste", shortcut: "Ctrl+V", disabled: !this.app.clipboard, action: () => this.paste([snap(x, this.grid), snap(y, this.grid)]) },
        { label: t("Detect rooms"), icon: "room", action: () => this.detectRooms() },
        { label: t("Auto dimensions"), icon: "dimension", action: () => this.autoDimensions() },
        { label: t("Select all"), icon: "select", shortcut: "Ctrl+A", action: () => this.selectAll() },
        { label: t("Grid line"), icon: "gridline", shortcut: "G", action: () => this.setTool("grid") },
        "-", { label: t("Zoom to fit"), icon: "zoomFit", shortcut: "Home", action: () => this.zoomFit() });
    }
    contextMenu(items, e.clientX, e.clientY);
  }

  // ---------------------------------------------------------------- render
  render(ctx, vp) {
    const th = this.theme;
    vp.screenTransform(ctx);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, vp.width, vp.height);
    if (this.app.settings.showGrid !== false) vp.drawGrid(ctx, this.grid, th.grid, { style: this.app.settings.gridStyle || "lines", majorColor: th.gridMajor });
    vp.worldTransform(ctx);
    const px = 1 / vp.scale;
    const s = this.app.settings;
    drawPlan(ctx, this.p, th, {
      level: this.level, lw: px, px, selected: this.sel, hover: this.hover && this.tool === "select" ? this.hover.obj.id : null,
      wallStyle: s.wallStyle || "solid", units: s.units || "mm", phase: s.phaseView || "all", images: this.underlayImages(), models: new Map(this.p.models.map((m) => [m.id, m])),
      issues: s.showIssues === false ? [] : this.app.checkIssues, view: vp.visibleWorld(), labels: { up: t("UP") },
      show: { ghost: s.showGhost !== false, dims: s.showDims !== false, furniture: s.showFurniture !== false, roofs: s.showRoofs !== false, tags: s.showTags !== false, areas: s.showAreas !== false, underlays: s.showUnderlays !== false, drawings: s.showDrawings !== false },
    });
    this.renderOverlay(ctx, vp, th, px);
  }

  underlayImages() {
    for (const u of this.p.underlays) {
      if (this.images.has(u.id) && this.images.get(u.id).src === u.src) continue;
      const img = new Image();
      img.onload = () => this.request();
      img.src = u.src;
      this.images.set(u.id, img);
    }
    return this.images;
  }

  renderOverlay(ctx, vp, th, px) {
    const acc = th.select;
    const label = (txt, x, y) => {
      ctx.save();
      vp.screenTransform(ctx);
      const [sx, sy] = vp.toScreen(x, y);
      ctx.font = "600 12px 'Segoe UI', sans-serif";
      const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = "rgba(20,24,32,0.85)";
      ctx.fillRect(sx + 12, sy + 10, w, 20);
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, sx + 18, sy + 20);
      ctx.restore();
    };
    const units = this.app.settings.units || "mm";
    // Selected walls: end handles; rooms/roofs: corner handles.
    ctx.fillStyle = th.bg;
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.5 * px;
    const handle = (x, y) => { ctx.beginPath(); ctx.rect(x - 4 * px, y - 4 * px, 8 * px, 8 * px); ctx.fill(); ctx.stroke(); };
    for (const it of this.selectedItems()) {
      if (it.kind === "walls") { handle(it.obj.x1, it.obj.y1); handle(it.obj.x2, it.obj.y2); }
      if ((it.kind === "rooms" || it.kind === "roofs") && this.sel.size === 1) for (const [x, y] of it.obj.pts) handle(x, y);
      if (it.kind === "dimensions" || it.kind === "grids") { handle(it.obj.x1, it.obj.y1); handle(it.obj.x2, it.obj.y2); }
    }
    // Drawing chain (walls / lines / rooms / roofs).
    const c = this.chain;
    const cur = this.cursor;
    if (c) {
      const pts = [...c.pts];
      if (cur) pts.push([cur.x, cur.y]);
      if (c.tool === "wall" && cur) {
        const last = c.pts[c.pts.length - 1];
        const tw = +this.app.settings.wallThickness || this.p.defaults.wallThickness;
        const L = dist(...last, cur.x, cur.y);
        if (L > 1) {
          const nx = -(cur.y - last[1]) / L * tw / 2, ny = (cur.x - last[0]) / L * tw / 2;
          ctx.beginPath();
          ctx.moveTo(last[0] + nx, last[1] + ny); ctx.lineTo(cur.x + nx, cur.y + ny); ctx.lineTo(cur.x - nx, cur.y - ny); ctx.lineTo(last[0] - nx, last[1] - ny); ctx.closePath();
          ctx.fillStyle = "rgba(79,157,255,0.35)";
          ctx.fill();
          ctx.strokeStyle = acc;
          ctx.stroke();
          const ang = (-Math.atan2(cur.y - last[1], cur.x - last[0]) * 180) / Math.PI;
          label(`${fmtLen(L, units === "ft" ? "ft" : "mm")}   ${Math.round((ang + 360) % 360)}°`, cur.x, cur.y);
        }
      } else {
        ctx.strokeStyle = acc;
        ctx.lineWidth = 1.5 * px;
        ctx.setLineDash(c.tool === "roof" ? [8 * px, 4 * px] : []);
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (c.tool !== "line" && pts.length > 2) ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        if (c.tool === "room" && pts.length > 2) { ctx.fillStyle = "rgba(79,157,255,0.15)"; ctx.fill(); label(`${(Math.abs(polygonArea(pts)) / 1e6).toFixed(2)} m²`, cur ? cur.x : pts[0][0], cur ? cur.y : pts[0][1]); }
        else if (cur && c.pts.length) label(fmtLen(dist(...c.pts[c.pts.length - 1], cur.x, cur.y), units === "ft" ? "ft" : "mm"), cur.x, cur.y);
      }
      ctx.fillStyle = acc;
      for (const [x, y] of c.pts) { ctx.beginPath(); ctx.arc(x, y, 3.5 * px, 0, Math.PI * 2); ctx.fill(); }
    }
    // Opening ghost.
    if ((this.tool === "door" || this.tool === "window") && this.ghost && !this.ghost.tooShort) {
      const g = this.ghost;
      const w = g.wall;
      const tt = w.thickness / 2 + 30;
      ctx.fillStyle = g.kind === "window" ? "rgba(79,180,255,0.45)" : "rgba(232,170,80,0.5)";
      ctx.beginPath();
      const P = (u, v) => wallPoint(w, u, v);
      [P(g.at - g.width / 2, -tt), P(g.at + g.width / 2, -tt), P(g.at + g.width / 2, tt), P(g.at - g.width / 2, tt)].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      if (g.kind === "door") {
        const hingeU = g.hinge === "end" ? g.at + g.width / 2 : g.at - g.width / 2;
        const [hx, hy] = P(hingeU, (g.side * w.thickness) / 2);
        const f = wallFrame(w);
        ctx.strokeStyle = th.door;
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + f.n[0] * g.side * g.width, hy + f.n[1] * g.side * g.width);
        ctx.stroke();
      }
      label(`${g.width} mm`, ...P(g.at, 0));
    }
    // Furniture / column ghost.
    if ((this.tool === "furniture" || this.tool === "column") && this.ghost && this.vp.mouse.inside) {
      const g = this.ghost;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.translate(g.x, g.y);
      if (g.rot) ctx.rotate((g.rot * Math.PI) / 180);
      if (this.tool === "column") { ctx.fillStyle = th.column; ctx.fillRect(-g.w / 2, -g.d / 2, g.w, g.d); }
      else if (g.kind === "model") { ctx.strokeStyle = acc; ctx.lineWidth = 1.5 * px; ctx.strokeRect(-g.w / 2, -g.d / 2, g.w, g.d); }
      else drawFurniturePlan(ctx, g, th, px);
      ctx.restore();
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      furnitureCorners(g).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    }
    // Stair ghost.
    if (this.tool === "stair" && this.stairStart && cur) {
      const a = this.stairStart;
      const len = dist(...a, cur.x, cur.y);
      if (len > 10) {
        const g = stairGeometry({ x: (a[0] + cur.x) / 2, y: (a[1] + cur.y) / 2, rot: (Math.atan2(cur.y - a[1], cur.x - a[0]) * 180) / Math.PI, length: len, width: +this.app.settings.stairWidth || this.p.defaults.stairWidth });
        ctx.strokeStyle = acc;
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath();
        g.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
        label(fmtLen(len), cur.x, cur.y);
      }
    }
    // Measure / dimension preview.
    const m = this.measure;
    if (m) {
      const b = m.b || (cur ? [cur.x, cur.y] : null);
      if (b) {
        ctx.strokeStyle = th.dim;
        ctx.lineWidth = 1.5 * px;
        const L = dist(...m.a, ...b) || 1;
        if ((this.tool === "massRect" || this.tool === "massCircle") && !m.b) {
          ctx.fillStyle = "rgba(160,160,160,0.35)";
          ctx.beginPath();
          this.massShape(m.a, b).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fill();
        }
        const off = m.stage === 2 ? m.offset || 0 : 0;
        const nx = -(b[1] - m.a[1]) / L * off, ny = (b[0] - m.a[0]) / L * off;
        ctx.beginPath();
        ctx.moveTo(m.a[0], m.a[1]); ctx.lineTo(m.a[0] + nx, m.a[1] + ny); ctx.lineTo(b[0] + nx, b[1] + ny); ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        label(`${fmtLen(L)}  (${(L / 1000).toFixed(3)} m)`, b[0] + nx, b[1] + ny);
      }
    }
    // Snap marker and alignment guide.
    if (cur && this.tool !== "select" && this.vp.mouse.inside) {
      ctx.strokeStyle = cur.kind === "end" || cur.kind === "vertex" ? "#ffb300" : cur.kind === "wall" ? "#4caf50" : acc;
      ctx.lineWidth = 1.5 * px;
      const r = 6 * px;
      ctx.beginPath();
      if (cur.kind === "end" || cur.kind === "vertex") ctx.rect(cur.x - r, cur.y - r, 2 * r, 2 * r);
      else if (cur.kind === "wall") { ctx.moveTo(cur.x - r, cur.y + r); ctx.lineTo(cur.x, cur.y - r); ctx.lineTo(cur.x + r, cur.y + r); ctx.closePath(); }
      else { ctx.moveTo(cur.x - r, cur.y); ctx.lineTo(cur.x + r, cur.y); ctx.moveTo(cur.x, cur.y - r); ctx.lineTo(cur.x, cur.y + r); }
      ctx.stroke();
      if (cur.guide) {
        ctx.setLineDash([4 * px, 4 * px]);
        ctx.strokeStyle = "#ffb300";
        ctx.beginPath();
        ctx.moveTo(cur.guide[0], cur.guide[1]);
        ctx.lineTo(cur.guide[2], cur.guide[3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Box selection.
    if (this.box) {
      const b = this.box;
      const crossing = b.x2 < b.x1;
      ctx.strokeStyle = crossing ? "#4caf50" : acc;
      ctx.fillStyle = crossing ? "rgba(76,175,80,0.08)" : "rgba(79,157,255,0.08)";
      ctx.lineWidth = px;
      ctx.setLineDash(crossing ? [5 * px, 4 * px] : []);
      ctx.fillRect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
      ctx.strokeRect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
      ctx.setLineDash([]);
    }
    if (this.flash && performance.now() < this.flash.until) {
      const k = (this.flash.until - performance.now()) / 1500;
      ctx.strokeStyle = `rgba(255,170,0,${k})`;
      ctx.lineWidth = 3 * px;
      ctx.beginPath();
      ctx.arc(this.flash.x, this.flash.y, (30 + (1 - k) * 40) * px, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  renderRulers(ctx, vp) {
    if (this.app.settings.showRulers === false) return;
    const th = this.theme;
    const units = this.app.settings.units || "mm";
    const per = units === "m" ? 0.001 : units === "cm" ? 0.1 : units === "ft" ? 1 / 304.8 : 1;
    vp.drawRulers(ctx, { toDisplay: (v) => v * per, unit: units, bg: th.ruler, fg: th.text, accent: "#ff9f43" });
  }
}

function centre(pts) {
  const n = pts.length;
  return [pts.reduce((s, q) => s + q[0], 0) / n, pts.reduce((s, q) => s + q[1], 0) / n];
}

export { levelIndex, wallOutlines, roomColor, rotPt };
