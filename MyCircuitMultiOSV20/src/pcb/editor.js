// Interactive PCB editor.

import { Viewport } from "../ui/viewport.js";
import { t } from "../ui/i18n.js";
import { contextMenu, popupInput, toast } from "../ui/widgets.js";
import { copperLayers } from "../core/project.js";
import { uid, round, snap, pointInPolygon } from "../core/geom.js";
import { routingStats, copperItems, footprintPads, netAtPoint, footprintCourtyard, trackWidthFor, boardBounds } from "./board.js";
import { PCB_THEMES, drawBoard, drawBoardText, drawDimension } from "./render.js";
import { shoveResult } from "./shove.js";
import { drawPadPath } from "./zones.js";
import * as ops from "./ops.js";

export const PCB_TOOLS = {
  select: { icon: "select", label: "Select", key: "Esc", hint: "Click to select, drag a part to move it, drag empty space to move the view, Shift+drag for a box selection. R rotates, F flips, double-click edits." },
  route: { icon: "route", label: "Route track", key: "X", hint: "Click a pad to start routing. Click to add corners, V adds a via and changes layer, / changes the corner style, Backspace undoes, Esc finishes." },
  via: { icon: "via", label: "Via", key: "V", hint: "Click to place a via. It takes the net of the copper under it." },
  zone: { icon: "zone", label: "Copper zone", key: "Z", hint: "Click the corners of a copper pour, double-click or Enter to close it." },
  outline: { icon: "outline", label: "Board outline", key: "O", hint: "Drag a rectangle, or click corners and double-click to draw the board edge." },
  text: { icon: "text", label: "Text", key: "T", hint: "Click to place text on the active silkscreen side." },
  line: { icon: "line", label: "Graphic line", key: "G", hint: "Draw lines on the active silkscreen, drawing or Edge.Cuts layer (copper layers draw on the silkscreen). Double-click to finish." },
  measure: { icon: "measure", label: "Measure", key: "M", hint: "Click two points to measure the distance. Esc to clear." },
  dimension: { icon: "dimension", label: "Dimension", key: "D", hint: "Click two points to add a dimension to the drawing." },
};

export class PcbEditor {
  constructor(app, host) {
    this.app = app;
    this.store = app.store;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "editor-canvas";
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    this.sel = new Set();
    this.tool = "select";
    this.activeLayer = "F.Cu";
    this.visible = {};
    this.highContrast = false;
    this.highlightNet = null;
    this.hover = null;
    this.drag = null;
    this.route = null;
    this.poly = null;
    this.measure = null;
    this.diagFirst = false;
    this.statsCache = { rev: -1, stats: null };
    this.drcIssues = [];
    this.vp = new Viewport(this.canvas, {
      minScale: 0.5, maxScale: 400,
      onRender: (ctx, vp) => { this.render(ctx, vp); this.renderOverlays(ctx, vp); },
      onPointer: (type, e, m) => this.pointer(type, e, m),
      onViewChange: () => this.app.updateStatus(),
    });
    this.fitted = false;
  }

  get pcb() { return this.store.project.pcb; }
  get theme() { return this.app.pcbPalette ? this.app.pcbPalette() : PCB_THEMES.dark; }
  get grid() { return this.app.settings.pcbGrid || 0.635; }

  stats() {
    if (this.statsCache.rev !== this.store.revision) this.statsCache = { rev: this.store.revision, stats: routingStats(this.pcb) };
    return this.statsCache.stats;
  }

  activate() {
    this.vp.resize();
    if (!copperLayers(this.pcb).includes(this.activeLayer)) this.activeLayer = "F.Cu";
    if (!this.fitted) { this.zoomFit(); this.fitted = true; }
    this.setTool(this.tool);
  }

  request() { this.vp.request(); }

  setTool(name) {
    if (this.route) this.finishRoute();
    this.poly = null;
    this.tool = name;
    if (name !== "measure") this.measure = null;
    this.canvas.style.cursor = name === "select" ? "default" : "crosshair";
    const def = PCB_TOOLS[name];
    this.app.setHint(def ? t(def.hint) : "");
    this.app.onToolChanged();
    this.request();
  }

  setActiveLayer(layer) {
    this.activeLayer = layer;
    this.app.onLayerChanged();
    this.request();
  }

  cycleLayer(dir = 1) {
    const cu = copperLayers(this.pcb);
    const i = cu.indexOf(this.activeLayer);
    this.setActiveLayer(cu[(i + dir + cu.length) % cu.length]);
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
    for (const id of [...this.sel]) if (!ops.findPcb(this.pcb, id)) this.sel.delete(id);
    const refs = this.pcb.footprints.filter((f) => this.sel.has(f.id)).map((f) => f.ref);
    this.app.onSelection("pcb", refs);
    this.request();
  }

  selectRefs(refs, { center = false } = {}) {
    const set = new Set(refs);
    const fps = this.pcb.footprints.filter((f) => set.has(f.ref));
    this.sel = new Set(fps.map((f) => f.id));
    if (center && fps.length) {
      const xs = fps.map((f) => f.x);
      const ys = fps.map((f) => f.y);
      this.vp.centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
    }
    this.request();
    this.app.refreshInspector();
  }

  selectedItems() {
    return [...this.sel].map((id) => ops.findPcb(this.pcb, id)).filter(Boolean);
  }

  focusPoint(x, y, ids = []) {
    this.vp.centerOn(x, y);
    if (this.vp.scale < 8) this.vp.zoomAt(this.vp.width / 2, this.vp.height / 2, 12 / this.vp.scale);
    if (ids.length) this.select(ids.filter((id) => ops.findPcb(this.pcb, id)));
    this.flash = { x, y, until: performance.now() + 1500 };
    const tick = () => { this.request(); if (performance.now() < this.flash.until) requestAnimationFrame(tick); };
    tick();
  }

  // ---------------------------------------------------------------- pointer
  tol() { return 5 / this.vp.scale; }

  snapXY(x, y) {
    return [round(snap(x, this.grid), 4), round(snap(y, this.grid), 4)];
  }

  pointer(type, e, m) {
    const x = m.wx;
    const y = m.wy;
    if (type === "leave") { this.hover = null; this.request(); return; }
    if (type === "context") return this.contextMenuAt(e, x, y);
    if (type === "dblclick") return this.dblclick(x, y);
    if (type === "move") this.app.updateStatus();
    switch (this.tool) {
      case "select": return this.pointerSelect(type, e, x, y);
      case "route": return this.pointerRoute(type, e, x, y);
      case "via": return this.pointerVia(type, e, x, y);
      case "zone": case "outline": case "line": return this.pointerPoly(type, e, x, y);
      case "text": return this.pointerText(type, e, x, y);
      case "measure": case "dimension": return this.pointerMeasure(type, e, x, y);
      default: return undefined;
    }
  }

  pointerSelect(type, e, x, y) {
    const opts = { activeLayer: this.activeLayer, visible: this.visible };
    if (type === "move") {
      if (this.drag) return this.dragMove(x, y);
      if (this.box) { this.box.x2 = x; this.box.y2 = y; this.request(); return; }
      const h = ops.hitTestPcb(this.pcb, x, y, this.tol(), opts);
      if ((h && h.obj) !== (this.hover && this.hover.obj)) { this.hover = h; this.request(); }
      this.canvas.style.cursor = h ? "move" : "default";
      return;
    }
    if (type === "down" && e.button === 0) {
      this.canvas.focus();
      const h = ops.hitTestPcb(this.pcb, x, y, this.tol(), opts);
      if (!h) {
        if (!e.shiftKey && !e.ctrlKey) { this.clearSelection(); this.highlightNet = null; }
        if (this.app.settings.emptyDrag === "pan" && !e.shiftKey && !e.ctrlKey) { this.vp.startPan(e); return; }
        this.box = { x1: x, y1: y, x2: x, y2: y, add: e.shiftKey || e.ctrlKey };
        return;
      }
      const id = h.kind === "outline" ? "outline" : h.obj.id;
      if (e.shiftKey || e.ctrlKey) { this.toggle(id); return; }
      if (!this.sel.has(id)) this.select([id]);
      // Clicking copper highlights its net.
      const net = h.kind === "tracks" || h.kind === "vias" || h.kind === "zones" ? h.obj.net : h.pad ? h.pad.net : null;
      this.highlightNet = net || null;
      this.app.highlightNet = net || null;
      this.drag = { sx: x, sy: y, moved: false, anchor: h.kind === "footprints" ? { x: h.obj.x, y: h.obj.y } : null };
      return;
    }
    if (type === "up") {
      if (this.box) {
        const b = this.box;
        this.box = null;
        const r = { x1: Math.min(b.x1, b.x2), y1: Math.min(b.y1, b.y2), x2: Math.max(b.x1, b.x2), y2: Math.max(b.y1, b.y2) };
        if ((r.x2 - r.x1) * this.vp.scale > 3 || (r.y2 - r.y1) * this.vp.scale > 3) this.select(ops.itemsInRectPcb(this.pcb, r, b.x2 < b.x1, this.visible), b.add);
        this.request();
        return;
      }
      if (this.drag) {
        const d = this.drag;
        this.drag = null;
        if (d.moved) { this.store.commit(); this.selectionChanged(); }
        this.request();
      }
    }
  }

  dragMove(x, y) {
    const d = this.drag;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) * this.vp.scale < 4) return;
    if (!d.moved) {
      d.moved = true;
      this.store.begin(t("Move"));
      d.mv = ops.beginMovePcb(this.pcb, [...this.sel]);
    }
    let dx = x - d.sx;
    let dy = y - d.sy;
    // Snap the grabbed footprint's origin to the grid, everything moves by the same delta.
    if (d.anchor) {
      const [ax, ay] = this.snapXY(d.anchor.x + dx, d.anchor.y + dy);
      dx = ax - d.anchor.x;
      dy = ay - d.anchor.y;
    } else {
      dx = snap(dx, this.grid);
      dy = snap(dy, this.grid);
    }
    ops.applyMovePcb(this.pcb, d.mv, dx, dy);
    this.store.preview();
    this.request();
  }

  // ---------------------------------------------------------------- routing
  pointerRoute(type, e, x, y) {
    if (type === "move") {
      this.cursor = this.routeCursor(x, y);
      this.request();
      return;
    }
    if (type !== "down" || e.button !== 0) return;
    const c = this.routeCursor(x, y);
    if (!this.route) {
      const start = ops.snapCopper(this.pcb, x, y, this.tol() * 2, { layer: this.activeLayer }) || ops.snapCopper(this.pcb, x, y, this.tol() * 2);
      const net = start ? start.net : (netAtPoint(this.pcb, x, y, this.activeLayer) || {}).net || "";
      const sx = start ? start.x : c.x;
      const sy = start ? start.y : c.y;
      // THT pads and vias let routing start on any layer; SMD pads force theirs.
      if (start && start.pad && start.pad.smd && !start.pad.layers.includes(this.activeLayer)) this.setActiveLayer(start.pad.layers[0]);
      this.store.begin(t("Route track"));
      this.route = { net, w: trackWidthFor(this.pcb.rules, net), pts: [[sx, sy]], layer: this.activeLayer, startedOn: start };
      this.app.setHint(t("Routing net {net} — width {w} mm. Click to add corners, V for via, Esc to finish.", { net: net || t("(no net)"), w: this.route.w }));
      this.request();
      return;
    }
    this.commitRouteTo(c.x, c.y);
    // Reaching same-net copper ends the route.
    const hit = ops.snapCopper(this.pcb, c.x, c.y, 0.01, { net: this.route.net || null });
    const target = hit && !(hit.kind === "track-end" && this.routeTrackIds().has(hit.track.id));
    if (target && this.route.net && (hit.kind === "pad" || hit.kind === "via" || hit.kind === "track-end")) this.finishRoute();
  }

  routeTrackIds() {
    return new Set((this.route && this.route.added) || []);
  }

  routeCursor(x, y) {
    const net = this.route ? this.route.net || null : null;
    const s = ops.snapCopper(this.pcb, x, y, this.tol() * 2.5, { net: this.route ? net : null });
    if (s && (!this.route || s.net === this.route.net)) return { x: s.x, y: s.y, snapped: true };
    const [gx, gy] = this.snapXY(x, y);
    return { x: gx, y: gy, snapped: false };
  }

  previewSegments() {
    if (!this.route || !this.cursor) return [];
    const [lx, ly] = this.route.pts[this.route.pts.length - 1];
    const path = ops.route45(lx, ly, this.cursor.x, this.cursor.y, this.diagFirst);
    const segs = [];
    for (let i = 1; i < path.length; i++) segs.push({ x1: path[i - 1][0], y1: path[i - 1][1], x2: path[i][0], y2: path[i][1], w: this.route.w, layer: this.route.layer });
    return segs;
  }

  // Routing mode (Settings → Routing): "highlight" places the segment and
  // marks collisions, "shove" pushes other nets' tracks aside, "block" refuses
  // a segment that would violate clearance. Returns false to stop the route.
  routeModeAllows(tr) {
    const mode = this.app.settings.routeMode || "highlight";
    if (mode === "highlight") return true;
    const seg = { x1: tr.x1, y1: tr.y1, x2: tr.x2, y2: tr.y2, w: tr.w, layer: tr.layer };
    const own = new Set(this.route.added || []);
    const items = copperItems(this.pcb).filter((i) => !own.has(i.id));
    if (ops.checkSegment(this.pcb, seg, this.route.net, items).ok) return true;
    if (mode === "block") { toast(t("Clearance violation: the segment was not placed (routing mode: stop at obstacles)."), "warn"); return false; }
    const res = shoveResult(this.store.project, seg, this.route.net, { includeSegment: false });
    if (!res.ok) { toast(t("Push and shove: pads, vias, the board edge or too many tracks are in the way; the segment was not placed."), "warn", 4500); return false; }
    const rm = new Set(res.remove);
    this.pcb.tracks = this.pcb.tracks.filter((x) => !rm.has(x.id));
    for (const u of res.update) { const o = this.pcb.tracks.find((x) => x.id === u.id); if (o) Object.assign(o, u.patch); }
    this.pcb.tracks.push(...res.add.tracks);
    this.pcb.vias.push(...res.add.vias);
    this.shoved = (this.shoved || 0) + res.update.length + res.add.tracks.length;
    return true;
  }

  commitRouteTo(x, y) {
    const r = this.route;
    const [lx, ly] = r.pts[r.pts.length - 1];
    if (Math.hypot(x - lx, y - ly) < 1e-6) return;
    const path = ops.route45(lx, ly, x, y, this.diagFirst);
    r.added = r.added || [];
    for (let i = 1; i < path.length; i++) {
      const tr = ops.newTrack(r.net, r.layer, r.w, path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
      if (tr.x1 === tr.x2 && tr.y1 === tr.y2) continue;
      if (!this.routeModeAllows(tr)) break;
      this.pcb.tracks.push(tr);
      r.added.push(tr.id);
      r.pts.push(path[i]);
    }
    this.store.preview();
    this.request();
  }

  routeVia() {
    const r = this.route;
    if (!r) return;
    if (this.cursor) this.commitRouteTo(this.cursor.x, this.cursor.y);
    const [x, y] = r.pts[r.pts.length - 1];
    if (!this.pcb.vias.some((v) => Math.hypot(v.x - x, v.y - y) < 0.01)) this.pcb.vias.push(ops.newVia(this.pcb, r.net, x, y));
    const cu = copperLayers(this.pcb);
    const next = r.layer === "F.Cu" ? "B.Cu" : r.layer === "B.Cu" ? "F.Cu" : cu[(cu.indexOf(r.layer) + 1) % cu.length];
    r.layer = next;
    this.setActiveLayer(next);
    this.store.preview();
    this.request();
  }

  finishRoute() {
    if (!this.route) return;
    this.route = null;
    this.store.commit();
    this.app.setHint(t(PCB_TOOLS[this.tool] ? PCB_TOOLS[this.tool].hint : ""));
    this.request();
  }

  // ---------------------------------------------------------------- other tools
  pointerVia(type, e, x, y) {
    if (type === "move") { this.cursor = this.routeCursor(x, y); this.request(); return; }
    if (type !== "down" || e.button !== 0) return;
    const c = this.routeCursor(x, y);
    const under = ops.snapCopper(this.pcb, c.x, c.y, 0.05) || netAtPoint(this.pcb, c.x, c.y, null);
    const net = under ? under.net || "" : "";
    this.store.edit(t("Add via"), (p) => { p.pcb.vias.push(ops.newVia(p.pcb, net, c.x, c.y)); });
  }

  pointerPoly(type, e, x, y) {
    const [gx, gy] = this.snapXY(x, y);
    if (type === "move") {
      this.cursor = { x: gx, y: gy };
      if (this.rectDrag) { this.rectDrag.x2 = gx; this.rectDrag.y2 = gy; }
      this.request();
      return;
    }
    if (type === "down" && e.button === 0) {
      if (!this.poly) {
        this.poly = { pts: [[gx, gy]] };
        if (this.tool === "outline") this.rectDrag = { x1: gx, y1: gy, x2: gx, y2: gy };
      } else {
        const last = this.poly.pts[this.poly.pts.length - 1];
        if (last[0] !== gx || last[1] !== gy) this.poly.pts.push([gx, gy]);
        if (this.tool === "line" && this.poly.pts.length >= 2) {
          const [a, b] = this.poly.pts.slice(-2);
          const layer = this.activeLayer.endsWith(".Cu") ? (this.activeLayer.startsWith("B") ? "B.SilkS" : "F.SilkS") : this.activeLayer;
          this.store.edit(t("Add line"), (p) => { p.pcb.graphics.push({ id: uid("g"), layer, kind: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 0.15 }); });
        }
      }
      this.request();
      return;
    }
    if (type === "up" && this.rectDrag) {
      const r = this.rectDrag;
      this.rectDrag = null;
      // A drag (not a click) draws a rectangular outline straight away.
      if (Math.abs(r.x2 - r.x1) > this.grid && Math.abs(r.y2 - r.y1) > this.grid) {
        const x1 = Math.min(r.x1, r.x2), y1 = Math.min(r.y1, r.y2);
        this.store.edit(t("Board outline"), (p) => { p.pcb.outline = ops.rectOutline(x1, y1, Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1), this.app.settings.outlineRadius || 0); });
        this.poly = null;
        toast(t("Board outline set to {w} × {h} mm", { w: Math.abs(r.x2 - r.x1).toFixed(2), h: Math.abs(r.y2 - r.y1).toFixed(2) }), "ok");
        this.request();
      }
    }
  }

  finishPoly() {
    const poly = this.poly;
    this.poly = null;
    this.rectDrag = null;
    if (!poly) return;
    if (this.tool === "line") { this.request(); return; }
    if (poly.pts.length < 3) { toast(t("A polygon needs at least 3 corners."), "warn"); this.request(); return; }
    if (this.tool === "outline") {
      this.store.edit(t("Board outline"), (p) => { p.pcb.outline = poly.pts; });
    } else if (this.tool === "zone") {
      this.app.editZone({ id: uid("z"), layer: this.activeLayer.endsWith(".Cu") ? this.activeLayer : "F.Cu", net: this.app.defaultZoneNet(), pts: poly.pts, clearance: 0.3, thermal: true, priority: 0 }, true);
    }
    this.request();
  }

  pointerText(type, e, x, y) {
    if (type !== "down" || e.button !== 0) return;
    const [gx, gy] = this.snapXY(x, y);
    const [sx, sy] = this.vp.toScreen(gx, gy);
    const r = this.canvas.getBoundingClientRect();
    popupInput({
      x: r.left + sx, y: r.top + sy - 30, placeholder: t("Text"),
      onDone: (text) => {
        if (!text) return;
        const a = this.activeLayer;
        const layer = a === "B.SilkS" || a === "F.SilkS" || a === "Dwgs.User" ? a : a.startsWith("B") ? "B.SilkS" : "F.SilkS";
        this.store.edit(t("Add text"), (p) => { p.pcb.texts.push({ id: uid("x"), layer, text, x: gx, y: gy, size: 1.5, rot: 0 }); });
      },
    });
  }

  pointerMeasure(type, e, x, y) {
    const s = ops.snapCopper(this.pcb, x, y, this.tol() * 2);
    const [gx, gy] = s ? [s.x, s.y] : this.snapXY(x, y);
    if (type === "move") {
      this.cursor = { x: gx, y: gy };
      if (this.measure && !this.measure.done) { this.measure.x2 = gx; this.measure.y2 = gy; }
      this.request();
      return;
    }
    if (type !== "down" || e.button !== 0) return;
    if (!this.measure || this.measure.done) { this.measure = { x1: gx, y1: gy, x2: gx, y2: gy, done: false }; return; }
    this.measure.x2 = gx;
    this.measure.y2 = gy;
    this.measure.done = true;
    if (this.tool === "dimension") {
      const m = this.measure;
      this.store.edit(t("Add dimension"), (p) => { p.pcb.dimensions.push({ id: uid("d"), x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, offset: 2 }); });
      this.measure = null;
    }
    this.request();
  }

  dblclick(x, y) {
    if (this.route) { this.finishRoute(); return; }
    if (this.poly) { this.finishPoly(); return; }
    if (this.tool !== "select") return;
    const h = ops.hitTestPcb(this.pcb, x, y, this.tol(), { activeLayer: this.activeLayer, visible: this.visible });
    if (!h) return;
    if (h.kind === "footprints") this.app.editFootprintProperties(h.obj);
    else if (h.kind === "zones") this.app.editZone(h.obj, false);
    else if (h.kind === "texts") {
      const [sx, sy] = this.vp.toScreen(h.obj.x, h.obj.y);
      const r = this.canvas.getBoundingClientRect();
      popupInput({ x: r.left + sx, y: r.top + sy - 30, value: h.obj.text, onDone: (v) => { if (v) this.store.edit(t("Edit text"), () => { h.obj.text = v; }); } });
    } else if (h.kind === "tracks") {
      // Double-click a track selects the whole routed connection.
      this.select(ops.connectedCopper(this.pcb, [h.obj.id]));
    }
  }

  contextMenuAt(e, x, y) {
    if (this.route) { this.finishRoute(); return; }
    if (this.poly) { this.finishPoly(); return; }
    if (this.tool !== "select") { this.setTool("select"); return; }
    const h = ops.hitTestPcb(this.pcb, x, y, this.tol(), { activeLayer: this.activeLayer, visible: this.visible });
    if (h) {
      const id = h.kind === "outline" ? "outline" : h.obj.id;
      if (!this.sel.has(id)) this.select([id]);
    }
    const fp = h && h.kind === "footprints" ? h.obj : null;
    const net = h ? (h.pad ? h.pad.net : h.obj.net) : null;
    const has = this.sel.size > 0;
    contextMenu([
      fp && { label: t("Properties…"), icon: "settings", shortcut: "E", action: () => this.app.editFootprintProperties(fp) },
      fp && { label: t("Show in schematic"), icon: "resistor", action: () => this.app.crossProbe([fp.ref], "sch") },
      fp && { label: t("Show in 3D"), icon: "cube", action: () => this.app.crossProbe([fp.ref], "3d") },
      fp && { label: fp.locked ? t("Unlock") : t("Lock"), icon: fp.locked ? "unlock" : "lock", shortcut: "L", action: () => this.toggleLock() },
      h && h.kind === "zones" && { label: t("Zone properties…"), icon: "zone", action: () => this.app.editZone(h.obj, false) },
      net && { label: t("Highlight net {net}", { net }), icon: "highlight", action: () => { this.highlightNet = net; this.request(); } },
      net && { label: t("Route net {net} automatically", { net }), icon: "autoroute", action: () => this.app.autoroute([net]) },
      h && (h.kind === "tracks" || h.kind === "vias") && { label: t("Select connected copper"), action: () => this.select(ops.connectedCopper(this.pcb, [h.obj.id])) },
      has && "-",
      has && { label: t("Rotate"), icon: "rotate", shortcut: "R", action: () => this.rotate() },
      has && { label: t("Flip to other side"), icon: "flip", shortcut: "F", action: () => this.flip() },
      has && { label: t("Duplicate"), icon: "copy", shortcut: "Ctrl+D", action: () => this.duplicate() },
      has && { label: t("Delete"), icon: "trash", shortcut: "Del", danger: true, action: () => this.deleteSelection() },
      "-",
      { label: t("Route track"), icon: "route", shortcut: "X", action: () => this.setTool("route") },
      { label: t("Zoom to fit"), icon: "zoomFit", shortcut: "Home", action: () => this.zoomFit() },
    ], e.clientX, e.clientY);
  }

  // ---------------------------------------------------------------- commands
  rotate(deg = 90) {
    if (!this.sel.size) return;
    this.store.edit(t("Rotate"), (p) => ops.rotatePcb(p.pcb, [...this.sel], deg));
    this.request();
  }

  flip() {
    if (!this.sel.size) return;
    this.store.edit(t("Flip"), (p) => ops.flipPcb(p.pcb, [...this.sel]));
    this.request();
  }

  toggleLock() {
    const fps = this.pcb.footprints.filter((f) => this.sel.has(f.id));
    if (!fps.length) return;
    const lock = !fps[0].locked;
    this.store.edit(lock ? t("Lock") : t("Unlock"), () => { for (const f of fps) f.locked = lock; });
  }

  deleteSelection() {
    if (!this.sel.size) return;
    const ids = [...this.sel].filter((id) => id !== "outline");
    const locked = this.pcb.footprints.filter((f) => this.sel.has(f.id) && f.locked).length;
    this.store.edit(t("Delete"), (p) => ops.deletePcb(p.pcb, ids));
    if (locked) toast(t("{n} locked footprints were kept.", { n: locked }), "warn");
    this.sel.clear();
    this.selectionChanged();
  }

  duplicate() {
    const items = this.selectedItems().filter((i) => i.kind !== "outline" && i.kind !== "footprints");
    if (!items.length) { toast(t("Footprints come from the schematic; duplicate the symbol there."), "info"); return; }
    const ids = [];
    this.store.edit(t("Duplicate"), (p) => {
      for (const { kind, obj } of items) {
        const n = JSON.parse(JSON.stringify(obj));
        n.id = uid(kind[0]);
        p.pcb[kind].push(n);
        ids.push(n.id);
        const mv = ops.beginMovePcb(p.pcb, [n.id]);
        ops.applyMovePcb(p.pcb, mv, 2, 2);
      }
    });
    this.select(ids);
  }

  selectAll() {
    this.select(ops.PCB_KINDS.flatMap((k) => this.pcb[k].map((o) => o.id)));
  }

  nudge(dx, dy) {
    if (!this.sel.size) return;
    this.store.edit(t("Move"), (p) => {
      const mv = ops.beginMovePcb(p.pcb, [...this.sel]);
      ops.applyMovePcb(p.pcb, mv, dx * this.grid, dy * this.grid);
    });
  }

  zoomFit() {
    const b = ops.pcbContentBounds(this.pcb);
    this.vp.fit({ x1: b.x1 - 3, y1: b.y1 - 3, x2: b.x2 + 3, y2: b.y2 + 3 }, 0.05);
  }

  escape() {
    if (this.route) { this.finishRoute(); return true; }
    if (this.poly) { this.poly = null; this.rectDrag = null; this.request(); return true; }
    if (this.measure) { this.measure = null; this.request(); return true; }
    if (this.app.panMode) { this.app.panMode = false; this.app.applyPanMode(); return true; }
    if (this.drag && this.drag.moved) { this.store.cancel(); this.drag = null; return true; }
    if (this.tool !== "select") { this.setTool("select"); return true; }
    if (this.highlightNet) { this.highlightNet = null; this.app.highlightNet = null; this.request(); return true; }
    if (this.sel.size) { this.clearSelection(); return true; }
    return false;
  }

  onKey(e) {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (k === "Escape") return this.escape();
    if (this.route) {
      if (k.toLowerCase() === "v") { this.routeVia(); return true; }
      if (k === "/") { this.diagFirst = !this.diagFirst; this.request(); return true; }
      if (k === "Enter") { this.finishRoute(); return true; }
      if (k === "Backspace") {
        const r = this.route;
        const id = r.added && r.added.pop();
        if (id) {
          this.pcb.tracks = this.pcb.tracks.filter((tr) => tr.id !== id);
          r.pts.pop();
          this.store.preview();
          this.request();
        }
        return true;
      }
      if (k === "w" || k === "W") {
        // W / Shift+W steps the track width up/down through common sizes.
        const sizes = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.5, 2.0];
        let i = sizes.findIndex((s) => s >= this.route.w - 1e-6);
        i = Math.max(0, Math.min(sizes.length - 1, i + (e.shiftKey ? -1 : 1)));
        this.route.w = sizes[i];
        this.app.setHint(t("Track width {w} mm", { w: this.route.w }));
        this.request();
        return true;
      }
    }
    if (this.poly && k === "Enter") { this.finishPoly(); return true; }
    if (k === "PageUp") { this.cycleLayer(-1); return true; }
    if (k === "PageDown") { this.cycleLayer(1); return true; }
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === "d") { this.duplicate(); return true; }
      if (lk === "a") { this.selectAll(); return true; }
      return false;
    }
    if (e.altKey) return false;
    switch (k.toLowerCase()) {
      case "delete": case "backspace": this.deleteSelection(); return true;
      case "r": this.rotate(e.shiftKey ? -90 : 90); return true;
      case "f": this.flip(); return true;
      case "l": this.toggleLock(); return true;
      case "x": this.setTool("route"); return true;
      case "v": this.setTool("via"); return true;
      case "z": this.setTool("zone"); return true;
      case "o": this.setTool("outline"); return true;
      case "t": this.setTool("text"); return true;
      case "g": this.setTool("line"); return true;
      case "m": this.setTool("measure"); return true;
      case "d": this.setTool("dimension"); return true;
      case "h": this.highContrast = !this.highContrast; this.request(); this.app.onToolChanged(); return true;
      case "e": { const fp = this.pcb.footprints.find((f) => this.sel.has(f.id)); if (fp) this.app.editFootprintProperties(fp); return true; }
      case "home": this.zoomFit(); return true;
      case "arrowleft": this.nudge(-1, 0); return true;
      case "arrowright": this.nudge(1, 0); return true;
      case "arrowup": this.nudge(0, -1); return true;
      case "arrowdown": this.nudge(0, 1); return true;
      default: return false;
    }
  }

  // ---------------------------------------------------------------- render
  render(ctx, vp) {
    const th = this.theme;
    const s = vp.scale;
    vp.screenTransform(ctx);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, vp.width, vp.height);
    if (this.app.settings.showGrid !== false) vp.drawGrid(ctx, this.grid, th.grid, { style: this.app.settings.gridStyle || "lines", major: 5, majorColor: th.gridMajor });
    vp.worldTransform(ctx);
    const sel = new Set(this.sel);
    drawBoard(ctx, this.store.project, th, s, {
      visible: this.visible, activeLayer: this.activeLayer, highContrast: this.highContrast,
      highlightNet: this.highlightNet || this.app.highlightNet, selection: sel,
      courtyards: this.visible["F.CrtYd"] !== false && this.app.settings.showCourtyards !== false, fab: this.visible["F.Fab"] === true,
      padLabels: this.app.settings.padLabels !== false,
    });

    // Hover outline.
    if (this.hover && this.tool === "select") {
      ctx.strokeStyle = th.select;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.2 / s;
      if (this.hover.kind === "footprints") {
        const c = footprintCourtyard(this.hover.obj);
        ctx.beginPath();
        c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Selected footprints get a dashed box.
    ctx.setLineDash([4 / s, 3 / s]);
    ctx.strokeStyle = th.select;
    ctx.lineWidth = 1 / s;
    for (const fp of this.pcb.footprints) {
      if (!sel.has(fp.id)) continue;
      const c = footprintCourtyard(fp);
      ctx.beginPath();
      c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      if (fp.locked) drawBoardText(ctx, "🔒", c[1][0], c[1][1], 1, th.select, {});
    }
    ctx.setLineDash([]);

    // Ratsnest.
    if (this.app.settings.showRatsnest !== false) {
      const st = this.stats();
      ctx.strokeStyle = th.rats;
      ctx.lineWidth = Math.max(0.03, 1 / s);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (const r of st.rats) {
        if (this.highlightNet && r.net !== this.highlightNet) continue;
        ctx.moveTo(r.x1, r.y1);
        ctx.lineTo(r.x2, r.y2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // DRC markers.
    for (const is of this.drcIssues) {
      ctx.strokeStyle = is.severity === "error" ? th.drc : th.drcWarn;
      ctx.lineWidth = 2 / s;
      const r = Math.max(0.4, 6 / s);
      ctx.beginPath();
      ctx.arc(is.x, is.y, r, 0, Math.PI * 2);
      ctx.moveTo(is.x - r * 0.6, is.y - r * 0.6); ctx.lineTo(is.x + r * 0.6, is.y + r * 0.6);
      ctx.moveTo(is.x + r * 0.6, is.y - r * 0.6); ctx.lineTo(is.x - r * 0.6, is.y + r * 0.6);
      ctx.stroke();
    }

    // Routing preview with live clearance check.
    if (this.route) {
      const segs = this.previewSegments();
      const items = this.routeItems || (this.routeItems = { rev: -1 });
      if (items.rev !== this.store.revision) { items.rev = this.store.revision; items.list = copperItems(this.pcb); }
      let bad = false;
      for (const sg of this.app.settings.clearancePreview === false ? [] : segs) {
        const chk = ops.checkSegment(this.pcb, sg, this.route.net, items.list.filter((i) => !(this.route.added || []).includes(i.id)));
        if (!chk.ok) bad = true;
      }
      ctx.lineCap = "round";
      for (const sg of segs) {
        ctx.strokeStyle = bad ? th.bad : th[sg.layer] || "#fff";
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = sg.w;
        ctx.beginPath();
        ctx.moveTo(sg.x1, sg.y1);
        ctx.lineTo(sg.x2, sg.y2);
        ctx.stroke();
        // Clearance halo.
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = sg.w + this.pcb.rules.clearance * 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (bad) this.app.setHint(t("Clearance violation — this segment is too close to other copper."));
    }
    if (this.cursor && ["route", "via", "zone", "outline", "line", "measure", "dimension", "text"].includes(this.tool)) {
      const c = this.cursor;
      const r = 6 / s;
      ctx.strokeStyle = c.snapped ? th.select : th.ghost;
      ctx.lineWidth = 1.2 / s;
      ctx.beginPath();
      ctx.moveTo(c.x - r, c.y); ctx.lineTo(c.x + r, c.y);
      ctx.moveTo(c.x, c.y - r); ctx.lineTo(c.x, c.y + r);
      ctx.stroke();
      if (this.tool === "via") {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = th.via;
        ctx.beginPath();
        ctx.arc(c.x, c.y, this.pcb.rules.viaDiameter / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (this.poly) {
      const pts = [...this.poly.pts, this.cursor ? [this.cursor.x, this.cursor.y] : null].filter(Boolean);
      ctx.strokeStyle = this.tool === "zone" ? th[this.activeLayer] || th.select : this.tool === "outline" ? th["Edge.Cuts"] : th["F.SilkS"];
      ctx.lineWidth = 1.5 / s;
      ctx.setLineDash([5 / s, 3 / s]);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (this.tool !== "line") ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.rectDrag) {
      const r = this.rectDrag;
      ctx.strokeStyle = th["Edge.Cuts"];
      ctx.lineWidth = 1.5 / s;
      ctx.strokeRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1));
      drawBoardText(ctx, `${Math.abs(r.x2 - r.x1).toFixed(2)} × ${Math.abs(r.y2 - r.y1).toFixed(2)} mm`, (r.x1 + r.x2) / 2, Math.min(r.y1, r.y2) - 1.5, 1.2, th["Edge.Cuts"], {});
    }
    if (this.measure) {
      const m = this.measure;
      ctx.strokeStyle = th.select;
      ctx.lineWidth = 1.2 / s;
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      ctx.stroke();
      const d = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
      const label = `${d.toFixed(3)} mm  (Δx ${(m.x2 - m.x1).toFixed(3)}, Δy ${(m.y2 - m.y1).toFixed(3)})  ${(d / 0.0254).toFixed(1)} mil`;
      vp.screenTransform(ctx);
      const [sx, sy] = vp.toScreen((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2);
      ctx.font = "12px 'Segoe UI', sans-serif";
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(sx - w / 2, sy - 28, w, 20);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, sx, sy - 18);
      vp.worldTransform(ctx);
    }
    if (this.box) {
      const b = this.box;
      const crossing = b.x2 < b.x1;
      ctx.fillStyle = crossing ? "rgba(80,200,120,0.10)" : "rgba(80,140,255,0.10)";
      ctx.strokeStyle = crossing ? "#4cc674" : "#5a8cff";
      ctx.lineWidth = 1 / s;
      ctx.fillRect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
      ctx.strokeRect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
    }
    if (this.flash && performance.now() < this.flash.until) {
      const k = (this.flash.until - performance.now()) / 1500;
      ctx.strokeStyle = th.drc;
      ctx.lineWidth = 2.5 / s;
      ctx.beginPath();
      ctx.arc(this.flash.x, this.flash.y, 1 + (1 - k) * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    void pointInPolygon; void footprintPads; void drawPadPath;
  }

  // Board size (automatic overall dimensions) and rulers, drawn over everything.
  renderOverlays(ctx, vp) {
    const th = this.theme;
    if (this.app.settings.showBoardSize !== false) {
      const b = boardBounds(this.pcb);
      if (b && Number.isFinite(b.x1) && b.x2 - b.x1 > 0.01) {
        vp.worldTransform(ctx);
        const color = th.dimension || th["Dwgs.User"] || "#c8c8c8";
        const off = Math.max(2, 18 / vp.scale);
        drawDimension(ctx, { x1: b.x1, y1: b.y2, x2: b.x2, y2: b.y2, offset: off }, color, vp.scale);
        drawDimension(ctx, { x1: b.x2, y1: b.y2, x2: b.x2, y2: b.y1, offset: off }, color, vp.scale);
      }
    }
    if (this.app.settings.showRulers !== false) {
      const mil = this.app.settings.units === "mil";
      vp.drawRulers(ctx, { toDisplay: (v) => (mil ? v / 0.0254 : v), unit: mil ? "mil" : "mm", bg: th.rulerBg || th.bg, fg: th.rulerFg || "#c8ccd4", accent: th.select });
    }
  }
}
