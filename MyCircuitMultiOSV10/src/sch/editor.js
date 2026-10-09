// Interactive schematic editor.

import { Viewport } from "../ui/viewport.js";
import { t } from "../ui/i18n.js";
import { contextMenu, popupInput, toast } from "../ui/widgets.js";
import { getSymbol, allSymbols, unitCount } from "../lib/symbols.js";
import { buildNetlist, partPins, pageView, writePageView, pageOf } from "../core/netlist.js";
import { snap, uid, pointSegDist } from "../core/geom.js";
import { formatValue } from "../core/project.js";
import { SCH_THEMES, SHEETS, pageInfo, drawSheetBlock, drawSchDimension, formatSchLength, drawPart, drawWire, drawJunction, drawNoConnect, drawLabel, drawText, drawSheet, lineWidthFor, fieldPositions, FONT } from "./render.js";
import * as ops from "./ops.js";

export const SCH_TOOLS = {
  select: { icon: "select", label: "Select", key: "Esc", hint: "Click to select, drag a part to move it, drag empty space to move the view, Shift+drag for a box selection. Double-click to edit." },
  place: { icon: "resistor", label: "Add part", key: "A", hint: "Click to place. R rotates, X/Y mirrors, Esc stops placing." },
  wire: { icon: "wire", label: "Wire", key: "W", hint: "Click to start a wire, click to add corners; it ends on a pin or wire. / switches the corner, Backspace undoes a corner, Esc finishes." },
  bus: { icon: "bus", label: "Bus", key: "B", hint: "Draw a bus line (graphical). Click to start, double-click to finish." },
  label: { icon: "label", label: "Net label", key: "L", hint: "Click on a wire or pin end to place a net label. Same names are connected." },
  global: { icon: "globalLabel", label: "Global label", key: "Ctrl+L", hint: "Click to place a global label." },
  power: { icon: "ground", label: "Power port", key: "P", hint: "Pick a power symbol, then click to place it." },
  noconnect: { icon: "noconnect", label: "No-connect flag", key: "Q", hint: "Click on an unused pin to mark it as intentionally unconnected." },
  junction: { icon: "junction", label: "Junction", key: "J", hint: "Click where wires cross to connect them." },
  text: { icon: "text", label: "Text", key: "T", hint: "Click to place a text note." },
  hlabel: { icon: "hierLabel", label: "Hierarchical label", key: "H", hint: "Click a wire or pin end on a sub-sheet page; the label becomes a pin on the sheet block that shows this page." },
  measure: { icon: "measure", label: "Measure", key: "M", hint: "Click two points to measure the distance (shown in mm and mil). Esc clears." },
  dimension: { icon: "dimension", label: "Dimension", key: "D", hint: "Click two points, then move to set the offset and click again, to add a dimension to the drawing." },
  sheet: { icon: "sheet", label: "Hierarchical sheet", key: "S", hint: "Drag a rectangle for a sheet block. It gets its own page; hierarchical labels on that page become its pins." },
};

export class SchematicEditor {
  constructor(app, host) {
    this.app = app;
    this.store = app.store;
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "editor-canvas";
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    this.pageBar = document.createElement("div");
    this.pageBar.className = "page-bar";
    host.append(this.pageBar);
    this.sel = new Set();
    this.tool = "select";
    this.toolOpts = {};
    this.hover = null;
    this.drag = null;
    this.wire = null;
    this.ghost = null;
    this.box = null;
    this.vFirst = false;
    this.highlightNet = null;
    this.clipboard = null;
    this.netCache = { rev: -1, nl: null };
    this.vp = new Viewport(this.canvas, {
      minScale: 0.005, maxScale: 4,
      onRender: (ctx, vp) => { this.render(ctx, vp); this.renderRulers(ctx, vp); },
      onPointer: (type, e, m) => this.pointer(type, e, m),
      onViewChange: () => this.app.updateStatus(),
    });
    this.fitted = false;
  }

  // The editor works on one page at a time: `sch` is a view of the current
  // page; every change goes through mutate()/edit() so it lands back in the
  // project's arrays (tagged with the page).
  get fullSch() { return this.store.project.schematic; }
  get pageId() {
    const pages = this.fullSch.pages || [];
    if (!pages.some((p) => p.id === this.curPage)) this.curPage = pages[0] ? pages[0].id : "";
    return this.curPage;
  }
  get sch() {
    const c = this.viewCache;
    if (c && c.rev === this.store.revision && c.page === this.pageId && c.project === this.store.project) return c.view;
    const view = pageView(this.fullSch, this.pageId);
    this.viewCache = { rev: this.store.revision, page: this.pageId, project: this.store.project, view };
    return view;
  }
  mutate(fn, project = this.store.project) {
    const v = pageView(project.schematic, this.pageId);
    const r = fn(v);
    writePageView(project.schematic, v);
    this.viewCache = null;
    return r;
  }
  edit(label, fn) {
    return this.store.edit(label, (p) => this.mutate(fn, p));
  }
  // ---------------------------------------------------------------- pages
  renderPageBar() {
    const bar = this.pageBar;
    bar.innerHTML = "";
    const pages = this.fullSch.pages || [];
    pages.forEach((pg, i) => {
      const b = document.createElement("button");
      b.className = `page-tab ${pg.id === this.pageId ? "on" : ""}`;
      b.textContent = `${i + 1}. ${pg.name}`;
      b.title = t("Click to open, double-click to rename, right-click for more");
      b.addEventListener("click", () => this.setPage(pg.id));
      b.addEventListener("dblclick", () => this.renamePage(pg.id));
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        contextMenu([
          { label: t("Rename page…"), icon: "text", action: () => this.renamePage(pg.id) },
          { label: t("Move left"), disabled: i === 0, action: () => this.movePage(pg.id, -1) },
          { label: t("Move right"), disabled: i === pages.length - 1, action: () => this.movePage(pg.id, 1) },
          "-",
          { label: t("Delete page"), icon: "trash", danger: true, disabled: pages.length < 2, action: () => this.deletePage(pg.id) },
        ], e.clientX, e.clientY);
      });
      bar.append(b);
    });
    const add = document.createElement("button");
    add.className = "page-tab add";
    add.textContent = "+";
    add.title = t("Add page");
    add.addEventListener("click", () => this.addPage());
    bar.append(add);
  }

  addPage() {
    const id = uid("pg");
    const n = (this.fullSch.pages || []).length + 1;
    this.store.edit(t("Add page"), (p) => { p.schematic.pages.push({ id, name: `${t("Page")} ${n}` }); });
    this.setPage(id);
    toast(t("Page added. Use global labels or power ports to connect nets between pages."), "info", 4500);
  }

  renamePage(id) {
    const pg = this.fullSch.pages.find((p) => p.id === id);
    const btn = [...this.pageBar.children].find((b) => b.textContent.endsWith(pg.name));
    const r = (btn || this.pageBar).getBoundingClientRect();
    popupInput({ x: r.left, y: r.top - 36, value: pg.name, onDone: (v) => { if (v && v.trim()) this.store.edit(t("Rename page"), () => { pg.name = v.trim(); }); } });
  }

  movePage(id, dir) {
    this.store.edit(t("Move page"), (p) => {
      const list = p.schematic.pages;
      const i = list.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return false;
      [list[i], list[j]] = [list[j], list[i]];
      return true;
    });
    this.renderPageBar();
  }

  async deletePage(id) {
    const pages = this.fullSch.pages;
    if (pages.length < 2) return;
    const pg = pages.find((p) => p.id === id);
    const { confirmDialog } = await import("../ui/widgets.js");
    if (!(await confirmDialog(t("Delete page \"{name}\" and everything on it?", { name: pg.name }), { danger: true, ok: t("Delete") }))) return;
    this.store.edit(t("Delete page"), (p) => {
      const sch = p.schematic;
      for (const k of ops.KINDS) sch[k] = sch[k].filter((o) => pageOf(sch, o) !== id);
      sch.pages = sch.pages.filter((x) => x.id !== id);
      // Items without an explicit page belonged to the old first page.
      for (const k of ops.KINDS) for (const o of sch[k]) if (!o.page) o.page = sch.pages[0].id;
    });
    this.setPage(this.fullSch.pages[0].id);
  }

  setPage(id) {
    if (this.wire) this.finishWire();
    this.curPage = id;
    this.viewCache = null;
    this.sel.clear();
    this.renderPageBar();
    this.zoomFit();
    this.app.refreshInspector();
  }
  get theme() { return this.app.schPalette ? this.app.schPalette() : SCH_THEMES.dark; }
  get grid() { return this.app.settings.schGrid || 50; }

  netlist() {
    if (this.netCache.rev !== this.store.revision || this.netCache.project !== this.store.project) this.netCache = { rev: this.store.revision, project: this.store.project, nl: buildNetlist(this.fullSch) };
    return this.netCache.nl;
  }

  activate() {
    this.vp.resize();
    if (!this.fitted) { this.zoomFit(); this.fitted = true; }
    this.renderPageBar();
    this.setTool(this.tool, this.toolOpts);
  }

  request() { this.vp.request(); }

  // ---------------------------------------------------------------- tools
  setTool(name, opts = {}) {
    if (this.wire) this.finishWire();
    this.tool = name;
    this.toolOpts = opts;
    this.ghost = null;
    if (name === "place" && opts.lib) {
      this.ghost = ops.newPart(opts.lib, snap(this.vp.mouse.wx, this.grid), snap(this.vp.mouse.wy, this.grid), { rot: opts.rot || 0 });
    }
    this.canvas.style.cursor = name === "select" ? "default" : "crosshair";
    const def = SCH_TOOLS[name];
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
    if (this.sel.has(id)) this.sel.delete(id);
    else this.sel.add(id);
    this.selectionChanged();
  }

  clearSelection() {
    if (!this.sel.size) return;
    this.sel.clear();
    this.selectionChanged();
  }

  selectionChanged() {
    // Drop ids that no longer exist (after undo, delete …).
    for (const id of [...this.sel]) if (!ops.findById(this.sch, id)) this.sel.delete(id);
    const refs = this.selectedParts().map((p) => p.ref);
    this.app.onSelection("sch", refs);
    this.request();
  }

  selectedParts() {
    return this.sch.parts.filter((p) => this.sel.has(p.id));
  }

  selectedItems() {
    return [...this.sel].map((id) => ops.findById(this.sch, id)).filter(Boolean);
  }

  // Select parts by reference (cross-probing from the board / 3D / BOM).
  selectRefs(refs, { center = false } = {}) {
    const set = new Set(refs);
    // Jump to the page holding the first of these parts when focusing on it.
    const first = this.fullSch.parts.find((p) => set.has(p.ref));
    if (center && first && pageOf(this.fullSch, first) !== this.pageId) this.setPage(pageOf(this.fullSch, first));
    const parts = this.sch.parts.filter((p) => set.has(p.ref));
    this.sel = new Set(parts.map((p) => p.id));
    if (center && parts.length) {
      const b = parts.map(ops.partBox).reduce((a, c) => ({ x1: Math.min(a.x1, c.x1), y1: Math.min(a.y1, c.y1), x2: Math.max(a.x2, c.x2), y2: Math.max(a.y2, c.y2) }));
      this.vp.centerOn((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2);
    }
    this.request();
    this.app.refreshInspector();
  }

  focusPoint(x, y, ids = [], page = null) {
    if (page && page !== this.pageId) this.setPage(page);
    this.vp.centerOn(x, y);
    if (this.vp.scale < 0.15) this.vp.zoomAt(this.vp.width / 2, this.vp.height / 2, 0.2 / this.vp.scale);
    if (ids.length) this.select(ids.filter((id) => ops.findById(this.sch, id)));
    this.flash = { x, y, until: performance.now() + 1500 };
    const tick = () => { this.request(); if (performance.now() < this.flash.until) requestAnimationFrame(tick); };
    tick();
  }

  // ---------------------------------------------------------------- pointer
  tol() { return 6 / this.vp.scale; }

  // Snap radius for wires/labels (0 when snapping to pins is turned off).
  snapTol() { return this.app.settings.snapPins === false ? 0 : this.tol() * 1.5; }

  pointer(type, e, m) {
    const x = m.wx;
    const y = m.wy;
    if (type === "leave") { this.hover = null; this.request(); return; }
    if (type === "context") return this.contextMenuAt(e, x, y);
    if (type === "dblclick") return this.dblclick(x, y);
    const tool = this.tool;
    if (tool === "select") return this.pointerSelect(type, e, x, y);
    if (tool === "place") return this.pointerPlace(type, e, x, y);
    if (tool === "wire" || tool === "bus") return this.pointerWire(type, e, x, y);
    if (tool === "sheet") return this.pointerSheet(type, e, x, y);
    if (tool === "measure" || tool === "dimension") return this.pointerMeasure(type, e, x, y);
    if (type === "move") { this.cursor = ops.snapPoint(this.sch, x, y, this.grid, this.snapTol()); this.request(); this.app.updateStatus(); return; }
    if (type !== "down" || e.button !== 0) return;
    const p = ops.snapPoint(this.sch, x, y, this.grid, this.snapTol());
    if (tool === "label" || tool === "global" || tool === "hlabel") this.placeLabel(p.x, p.y, tool === "global" ? "global" : tool === "hlabel" ? "hier" : "local", e);
    else if (tool === "noconnect") this.placeNoConnect(p.x, p.y);
    else if (tool === "junction") this.edit(t("Add junction"), (s) => { s.junctions.push({ id: uid("j"), x: p.x, y: p.y }); ops.cleanup(s); });
    else if (tool === "text") this.placeText(p.x, p.y, e);
    else if (tool === "power") {
      if (!this.toolOpts.lib) { this.app.pickPower((lib) => this.setTool("place", { lib, keep: true })); return; }
    }
  }

  pointerSelect(type, e, x, y) {
    if (type === "move") {
      this.app.updateStatus();
      if (this.drag) return this.dragMove(x, y, e);
      if (this.box) { this.box.x2 = x; this.box.y2 = y; this.request(); return; }
      const h = ops.hitTest(this.sch, x, y, this.tol(), this.vp.ctx);
      const id = h ? h.obj.id : null;
      if (id !== (this.hover && this.hover.obj.id)) { this.hover = h; this.request(); }
      this.canvas.style.cursor = h ? "move" : "default";
      return;
    }
    if (type === "down" && e.button === 0) {
      this.canvas.focus();
      const h = ops.hitTest(this.sch, x, y, this.tol(), this.vp.ctx);
      if (!h) {
        if (!e.shiftKey && !e.ctrlKey) this.clearSelection();
        // Settings → "Left-drag on empty canvas": pan instead of box select.
        if (this.app.settings.emptyDrag === "pan" && !e.shiftKey && !e.ctrlKey) { this.vp.startPan(e); return; }
        this.box = { x1: x, y1: y, x2: x, y2: y, add: e.shiftKey || e.ctrlKey };
        return;
      }
      if (e.shiftKey || e.ctrlKey) { this.toggle(h.obj.id); return; }
      if (!this.sel.has(h.obj.id)) this.select([h.obj.id]);
      // Highlight the net of a clicked wire like KiCad's net highlight.
      if (h.kind === "wires") this.highlightNet = this.netlist().wireNet.get(h.obj.id) || null;
      else this.highlightNet = null;
      this.drag = { sx: x, sy: y, moved: false, field: h.field && h.kind === "parts" ? { part: h.obj, field: h.field } : null };
      return;
    }
    if (type === "up") {
      if (this.box) {
        const b = this.box;
        this.box = null;
        const r = { x1: Math.min(b.x1, b.x2), y1: Math.min(b.y1, b.y2), x2: Math.max(b.x1, b.x2), y2: Math.max(b.y1, b.y2) };
        if (r.x2 - r.x1 > 2 / this.vp.scale || r.y2 - r.y1 > 2 / this.vp.scale) {
          // Left→right = window (fully inside), right→left = crossing, like most CAD tools.
          const ids = ops.itemsInRect(this.sch, r, b.x2 < b.x1);
          this.select(ids, b.add);
        }
        this.request();
        return;
      }
      if (this.drag) {
        const d = this.drag;
        this.drag = null;
        if (d.moved) {
          if (d.state) this.mutate((s) => ops.finishDrag(s, d.state));
          this.store.commit();
          this.selectionChanged();
        }
        this.request();
      }
    }
  }

  dragMove(x, y, e) {
    const d = this.drag;
    const dx = snap(x - d.sx, this.grid);
    const dy = snap(y - d.sy, this.grid);
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) * this.vp.scale < 4) return;
    if (!d.moved) {
      d.moved = true;
      this.store.begin(d.field ? t("Move field") : t("Move"));
      if (d.field) {
        const sym = getSymbol(d.field.part.lib);
        const pos = fieldPositions(d.field.part, sym)[d.field.field];
        d.fieldStart = { x: pos.x - d.field.part.x - (pos.align === "center" ? 60 : 0), y: pos.y - d.field.part.y };
      } else d.state = ops.beginDrag(this.sch, [...this.sel]);
    }
    if (d.field) {
      const key = d.field.field === "ref" ? "refOffset" : "valueOffset";
      d.field.part[key] = { x: Math.round(d.fieldStart.x + (x - d.sx)), y: Math.round(d.fieldStart.y + (y - d.sy)) };
    } else {
      // Alt (or Option) moves without dragging the attached wires along.
      ops.applyDrag(this.sch, d.state, dx, dy, { rubber: !e.altKey });
    }
    this.store.preview();
    this.request();
  }

  pointerPlace(type, e, x, y) {
    if (!this.ghost) return;
    if (type === "move") {
      this.ghost.x = snap(x, this.grid);
      this.ghost.y = snap(y, this.grid);
      this.app.updateStatus();
      this.request();
      return;
    }
    if (type === "down" && e.button === 0) {
      const g = this.ghost;
      const units = unitCount(getSymbol(g.lib));
      const extra = units > 1 ? { unit: g.unit || 1, unitGroup: g.unitGroup || (g.unitGroup = uid("ug")) } : {};
      const part = ops.newPart(g.lib, g.x, g.y, { rot: g.rot, mirror: g.mirror, ...extra, ...(this.toolOpts.overrides || {}) });
      this.edit(t("Add part"), (s) => {
        s.parts.push(part);
        ops.cleanup(s);
      });
      this.app.recordRecentSymbol(g.lib);
      // Next click places the next unit (U1A → U1B …); after the last, a new component.
      if (units > 1) {
        if ((g.unit || 1) < units) g.unit = (g.unit || 1) + 1;
        else { g.unit = 1; g.unitGroup = uid("ug"); }
        this.app.setHint(this.app.t("Placing unit {u} — click to place, Esc to stop.", { u: String.fromCharCode(64 + g.unit) }));
      }
      this.sel = new Set([part.id]);
      this.selectionChanged();
      const sym = getSymbol(g.lib);
      // Power ports and repeated parts stay in the tool; Shift places once.
      if (e.shiftKey && !sym.power) this.setTool("select");
    }
  }

  // ---------------------------------------------------------------- wires
  pointerWire(type, e, x, y) {
    const p = ops.snapPoint(this.sch, x, y, this.grid, this.snapTol());
    this.cursor = p;
    if (type === "move") { this.app.updateStatus(); this.request(); return; }
    if (type !== "down" || e.button !== 0) return;
    const isBus = this.tool === "bus";
    if (!this.wire) {
      this.store.begin(isBus ? t("Draw bus") : t("Draw wire"));
      this.wire = { pts: [[p.x, p.y]], bus: isBus };
      this.request();
      return;
    }
    const [lx, ly] = this.wire.pts[this.wire.pts.length - 1];
    if (lx === p.x && ly === p.y) return;
    const path = ops.orthoPath(lx, ly, p.x, p.y, this.vFirst);
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1];
      const [bx, by] = path[i];
      this.mutate((s) => {
        if (isBus) s.buses.push({ id: uid("b"), x1: ax, y1: ay, x2: bx, y2: by });
        else ops.addWire(s, ax, ay, bx, by);
      });
      this.wire.pts.push([bx, by]);
    }
    this.store.preview();
    // Ending on something connectable finishes the wire automatically.
    const onWire = !isBus && this.sch.wires.some((w) => !(w.x2 === p.x && w.y2 === p.y) && !(w.x1 === p.x && w.y1 === p.y) && pointSegDist(p.x, p.y, w.x1, w.y1, w.x2, w.y2) < 0.5);
    if (!isBus && (p.snapped === "pin" || p.snapped === "end" || p.snapped === "label" || onWire) && this.wire.pts.length > 1) this.finishWire();
    this.request();
  }

  finishWire() {
    if (!this.wire) return;
    this.wire = null;
    this.mutate((s) => ops.cleanup(s));
    this.store.commit();
    this.request();
  }

  // ---------------------------------------------------------------- measure / dimension
  // Measure: click, click (shows the distance). Dimension: click, click, then a
  // third click sets the offset and adds it to the drawing.
  pointerMeasure(type, e, x, y) {
    const gx = snap(x, this.grid);
    const gy = snap(y, this.grid);
    const m = this.measure;
    if (type === "move") {
      if (m && m.stage === 1) { m.x2 = gx; m.y2 = gy; }
      if (m && m.stage === 2) {
        const dx = m.x2 - m.x1, dy = m.y2 - m.y1, len = Math.hypot(dx, dy) || 1;
        m.offset = Math.round(((x - m.x1) * -dy + (y - m.y1) * dx) / len / 25) * 25;
      }
      this.request();
      return;
    }
    if (type !== "down" || e.button !== 0) return;
    if (!m || m.stage === 3) { this.measure = { x1: gx, y1: gy, x2: gx, y2: gy, stage: 1, offset: 100 }; this.request(); return; }
    if (m.stage === 1) {
      m.x2 = gx; m.y2 = gy;
      if (m.x1 === m.x2 && m.y1 === m.y2) return;
      m.stage = this.tool === "dimension" ? 2 : 3;
      this.request();
      return;
    }
    if (m.stage === 2) {
      const d = { id: uid("dm"), x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, offset: m.offset || 100 };
      this.measure = null;
      this.edit(t("Add dimension"), (s) => { s.dimensions = s.dimensions || []; s.dimensions.push(d); });
    }
  }

  // ---------------------------------------------------------------- hierarchical sheets
  pointerSheet(type, e, x, y) {
    const gx = snap(x, this.grid);
    const gy = snap(y, this.grid);
    if (type === "down" && e.button === 0) { this.sheetDrag = { x1: gx, y1: gy, x2: gx, y2: gy }; this.request(); return; }
    if (type === "move" && this.sheetDrag) { this.sheetDrag.x2 = gx; this.sheetDrag.y2 = gy; this.request(); return; }
    if (type === "up" && this.sheetDrag) {
      const r = this.sheetDrag;
      this.sheetDrag = null;
      const x1 = Math.min(r.x1, r.x2), y1 = Math.min(r.y1, r.y2);
      const w = Math.max(600, Math.abs(r.x2 - r.x1)), hh = Math.max(400, Math.abs(r.y2 - r.y1));
      const [sx, sy] = this.vp.toScreen(x1, y1);
      const cr = this.canvas.getBoundingClientRect();
      popupInput({
        x: cr.left + sx, y: cr.top + sy - 36, value: `${this.app.t("Sheet")} ${(this.fullSch.sheets || []).length + 1}`, placeholder: this.app.t("Sheet name"),
        onDone: (name) => {
          if (!name) { this.request(); return; }
          const target = uid("pg");
          this.store.edit(t("Add sheet"), (p) => {
            p.schematic.pages.push({ id: target, name: name.trim() });
            p.schematic.sheets = p.schematic.sheets || [];
            p.schematic.sheets.push({ id: uid("sh"), page: this.pageId, x: x1, y: y1, w, h: hh, name: name.trim(), target, pins: [] });
          });
          this.renderPageBar();
          toast(t("Sheet created. Double-click it to open its page and add hierarchical labels (H) — they appear as pins on the block."), "ok", 5000);
        },
      });
    }
  }

  // Keep every sheet's pins in step with the labels on its page (no undo step:
  // the pins are derived data).
  syncSheets() {
    const sch = this.fullSch;
    let changed = false;
    for (const sh of sch.sheets || []) if (ops.syncSheetPins(sch, sh)) changed = true;
    if (changed) { this.viewCache = null; this.netCache.rev = -1; }
    return changed;
  }

  // ---------------------------------------------------------------- other placements
  placeLabel(x, y, kind, e) {
    const [sx, sy] = this.vp.toScreen(x, y);
    const r = this.canvas.getBoundingClientRect();
    const last = this.lastLabel || "";
    popupInput({
      x: r.left + sx + 8, y: r.top + sy - 34, value: last ? ops.incrementText(last) : "", placeholder: t("Label name"),
      onDone: (text) => {
        if (!text) return;
        const name = text.trim();
        this.lastLabel = name;
        // Pick a sensible direction: away from the wire end the label sits on.
        let rot = 0;
        const w = this.sch.wires.find((ww) => (ww.x1 === x && ww.y1 === y) || (ww.x2 === x && ww.y2 === y));
        if (w) {
          const ox = w.x1 === x && w.y1 === y ? w.x2 : w.x1;
          const oy = w.x1 === x && w.y1 === y ? w.y2 : w.y1;
          if (ox > x) rot = 180; else if (oy < y) rot = 270; else if (oy > y) rot = 90;
        }
        this.edit(t("Add label"), (s) => {
          const l = { id: uid("l"), kind, text: name, x, y, rot };
          s.labels.push(l);
          ops.cleanup(s);
        });
      },
    });
    void e;
  }

  placeNoConnect(x, y) {
    const pin = ops.pinAt(this.sch, x, y, this.tol() * 2);
    if (!pin) { toast(t("Click on a pin end to place a no-connect flag."), "warn"); return; }
    if (this.sch.noconnects.some((n) => n.x === pin.pin.x && n.y === pin.pin.y)) return;
    this.edit(t("Add no-connect"), (s) => { s.noconnects.push({ id: uid("n"), x: pin.pin.x, y: pin.pin.y }); });
  }

  placeText(x, y) {
    const [sx, sy] = this.vp.toScreen(x, y);
    const r = this.canvas.getBoundingClientRect();
    popupInput({
      x: r.left + sx, y: r.top + sy - 30, placeholder: t("Text"),
      onDone: (text) => {
        if (!text) return;
        this.edit(t("Add text"), (s) => { s.texts.push({ id: uid("t"), text, x, y, size: 50, rot: 0 }); });
      },
    });
  }

  dblclick(x, y) {
    if (this.wire) { this.finishWire(); return; }
    if (this.tool !== "select") return;
    const h = ops.hitTest(this.sch, x, y, this.tol(), this.vp.ctx);
    if (!h) return;
    if (h.kind === "sheets") { this.setPage(h.obj.target); return; }
    if (h.kind === "labels" || h.kind === "texts") {
      const [sx, sy] = this.vp.toScreen(h.obj.x, h.obj.y);
      const r = this.canvas.getBoundingClientRect();
      popupInput({
        x: r.left + sx, y: r.top + sy - 34, value: h.obj.text,
        onDone: (text) => { if (text) this.store.edit(t("Edit text"), () => { h.obj.text = text.trim(); }); },
      });
      return;
    }
    if (h.kind === "parts") {
      if (h.field === "value") {
        const sym = getSymbol(h.obj.lib);
        const pos = fieldPositions(h.obj, sym).value;
        const [sx, sy] = this.vp.toScreen(pos.x, pos.y);
        const r = this.canvas.getBoundingClientRect();
        popupInput({ x: r.left + sx - 40, y: r.top + sy - 16, value: h.obj.value, onDone: (v) => { if (v != null) this.store.edit(t("Edit value"), () => { h.obj.value = v.trim(); }); } });
        return;
      }
      this.app.editPartProperties(h.obj);
    }
  }

  contextMenuAt(e, x, y) {
    const h = ops.hitTest(this.sch, x, y, this.tol(), this.vp.ctx);
    if (this.wire) { this.finishWire(); return; }
    if (this.tool !== "select") { this.setTool("select"); return; }
    if (h && !this.sel.has(h.obj.id)) this.select([h.obj.id]);
    const has = this.sel.size > 0;
    const part = h && h.kind === "parts" ? h.obj : null;
    const net = h && h.kind === "wires" ? this.netlist().wireNet.get(h.obj.id) : null;
    contextMenu([
      part && { label: t("Properties…"), icon: "settings", shortcut: "E", action: () => this.app.editPartProperties(part) },
      part && { label: t("Show in PCB"), icon: "chip", action: () => this.app.crossProbe([part.ref], "pcb") },
      part && { label: t("Show in 3D"), icon: "cube", action: () => this.app.crossProbe([part.ref], "3d") },
      net && { label: t("Highlight net {net}", { net }), icon: "highlight", action: () => { this.highlightNet = net; this.request(); } },
      net && { label: t("Probe this net in simulation"), icon: "probe", action: () => this.app.addProbe(net) },
      has && "-",
      has && { label: t("Rotate"), icon: "rotate", shortcut: "R", action: () => this.rotate() },
      has && { label: t("Mirror horizontally"), icon: "mirror", shortcut: "Y", action: () => this.mirror("x") },
      has && { label: t("Mirror vertically"), icon: "flip", shortcut: "X", action: () => this.mirror("y") },
      has && { label: t("Duplicate"), icon: "copy", shortcut: "Ctrl+D", action: () => this.duplicate() },
      has && { label: t("Copy"), icon: "copy", shortcut: "Ctrl+C", action: () => this.copy() },
      has && { label: t("Cut"), icon: "cut", shortcut: "Ctrl+X", action: () => this.cut() },
      has && { label: t("Delete"), icon: "trash", shortcut: "Del", danger: true, action: () => this.deleteSelection() },
      !has && { label: t("Paste"), icon: "paste", shortcut: "Ctrl+V", disabled: !this.app.clipboard, action: () => this.paste(x, y) },
      !has && { label: t("Add part…"), icon: "resistor", shortcut: "A", action: () => this.app.openPartPicker() },
      !has && { label: t("Wire"), icon: "wire", shortcut: "W", action: () => this.setTool("wire") },
      "-",
      { label: t("Zoom to fit"), icon: "zoomFit", shortcut: "Home", action: () => this.zoomFit() },
      { label: t("Select all"), shortcut: "Ctrl+A", action: () => this.selectAll() },
    ], e.clientX, e.clientY);
  }

  // ---------------------------------------------------------------- commands
  rotate() {
    if (this.tool === "place" && this.ghost) { this.ghost.rot = ((this.ghost.rot || 0) + 90) % 360; this.request(); return; }
    if (!this.sel.size) return;
    this.edit(t("Rotate"), (s) => ops.rotateItems(s, [...this.sel]));
    this.selectionChanged();
  }

  mirror(axis) {
    if (this.tool === "place" && this.ghost) {
      this.ghost.mirror = !this.ghost.mirror;
      if (axis === "y") this.ghost.rot = ((this.ghost.rot || 0) + 180) % 360;
      this.request();
      return;
    }
    if (!this.sel.size) return;
    this.edit(t("Mirror"), (s) => ops.mirrorItems(s, [...this.sel], axis));
    this.selectionChanged();
  }

  deleteSelection() {
    if (!this.sel.size) return;
    const ids = [...this.sel];
    this.edit(t("Delete"), (s) => ops.deleteItems(s, ids));
    this.sel.clear();
    this.selectionChanged();
  }

  copy() {
    if (!this.sel.size) return;
    this.app.clipboard = ops.copyItems(this.sch, [...this.sel]);
    toast(t("Copied {n} items", { n: this.sel.size }), "ok", 1500);
  }

  cut() {
    this.copy();
    this.deleteSelection();
  }

  paste(x, y) {
    const clip = this.app.clipboard;
    if (!clip || clip.kind !== "mycircuit-sch") return;
    const px = snap(x ?? this.vp.mouse.wx, this.grid);
    const py = snap(y ?? this.vp.mouse.wy, this.grid);
    let ids = [];
    this.edit(t("Paste"), (s) => { ids = ops.pasteItems(s, clip, px, py); });
    this.select(ids);
  }

  duplicate() {
    if (!this.sel.size) return;
    const clip = ops.copyItems(this.sch, [...this.sel]);
    let ids = [];
    this.edit(t("Duplicate"), (s) => { ids = ops.pasteItems(s, clip, clip.anchor.x + 200, clip.anchor.y + 200); });
    this.select(ids);
  }

  selectAll() {
    const ids = ops.KINDS.flatMap((k) => this.sch[k].map((o) => o.id));
    this.select(ids);
  }

  nudge(dx, dy) {
    if (!this.sel.size) return;
    this.edit(t("Move"), (s) => {
      const d = ops.beginDrag(s, [...this.sel]);
      ops.applyDrag(s, d, dx * this.grid, dy * this.grid);
      ops.finishDrag(s, d);
    });
    this.request();
  }

  zoomFit() {
    const b = ops.schematicBounds(this.sch);
    const s = SHEETS[this.sch.sheet] || SHEETS.A4;
    this.vp.fit(b && this.sch.parts.length ? { x1: b.x1 - 300, y1: b.y1 - 300, x2: b.x2 + 300, y2: b.y2 + 300 } : { x1: 0, y1: 0, x2: s.w, y2: s.h }, 0.04);
  }

  zoomSheet() {
    const s = SHEETS[this.sch.sheet] || SHEETS.A4;
    this.vp.fit({ x1: 0, y1: 0, x2: s.w, y2: s.h }, 0.02);
  }

  escape() {
    if (this.wire) { this.finishWire(); return true; }
    if (this.drag && this.drag.moved) { this.store.cancel(); this.drag = null; return true; }
    if (this.tool !== "select") { this.setTool("select"); return true; }
    if (this.highlightNet) { this.highlightNet = null; this.request(); return true; }
    if (this.sel.size) { this.clearSelection(); return true; }
    return false;
  }

  onKey(e) {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (k === "Escape" && this.measure) { this.measure = null; this.request(); return true; }
    if (k === "Escape" && this.app.panMode) { this.app.panMode = false; this.app.applyPanMode(); return true; }
    if (k === "Escape") return this.escape();
    if (this.wire && k === "Backspace") {
      // Remove the last committed corner.
      if (this.wire.pts.length > 1) {
        const [bx, by] = this.wire.pts.pop();
        const [ax, ay] = this.wire.pts[this.wire.pts.length - 1];
        this.mutate((s) => {
          const list = this.wire.bus ? s.buses : s.wires;
          const i = list.findIndex((w) => w.x1 === ax && w.y1 === ay && w.x2 === bx && w.y2 === by);
          if (i >= 0) list.splice(i, 1);
        });
        this.store.preview();
        this.request();
      }
      return true;
    }
    if (k === "/" ) { this.vFirst = !this.vFirst; this.request(); return true; }
    if (k === "Enter" && this.wire) { this.finishWire(); return true; }
    if (ctrl) {
      const lk = k.toLowerCase();
      if (lk === "c") { this.copy(); return true; }
      if (lk === "x") { this.cut(); return true; }
      if (lk === "v") { this.paste(); return true; }
      if (lk === "d") { this.duplicate(); return true; }
      if (lk === "a") { this.selectAll(); return true; }
      if (lk === "l") { this.setTool("global"); return true; }
      return false;
    }
    if (e.altKey) return false;
    switch (k.toLowerCase()) {
      case "delete": case "backspace": this.deleteSelection(); return true;
      case "r": this.rotate(); return true;
      case "y": this.mirror("x"); return true;
      case "x": this.mirror("y"); return true;
      case "w": this.setTool("wire"); return true;
      case "b": this.setTool("bus"); return true;
      case "l": this.setTool("label"); return true;
      case "q": this.setTool("noconnect"); return true;
      case "j": this.setTool("junction"); return true;
      case "t": this.setTool("text"); return true;
      case "h": this.setTool("hlabel"); return true;
      case "s": this.setTool("sheet"); return true;
      case "m": this.setTool("measure"); return true;
      case "d": this.setTool("dimension"); return true;
      case "p": this.app.pickPower((lib) => this.setTool("place", { lib })); return true;
      case "a": this.app.openPartPicker(); return true;
      case "e": { const p = this.selectedParts()[0]; if (p) this.app.editPartProperties(p); return true; }
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
    const sch = this.sch;
    vp.screenTransform(ctx);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, vp.width, vp.height);
    if (this.app.settings.showGrid !== false) vp.drawGrid(ctx, this.grid, th.grid, { style: this.app.settings.gridStyle || "lines", major: 5, majorColor: th.gridMajor });
    vp.worldTransform(ctx);
    const s = vp.scale;
    drawSheet(ctx, sch, this.store.project.meta, th, s, pageInfo(this.fullSch, this.pageId));

    const nl = this.netlist();
    const hlNet = this.highlightNet || this.app.highlightNet;
    const hlWires = new Set();
    if (hlNet) for (const [id, n] of nl.wireNet) if (n === hlNet) hlWires.add(id);

    for (const b of sch.buses || []) drawWire(ctx, b, this.sel.has(b.id) ? th.select : th.bus, s, 14);
    for (const w of sch.wires) {
      const color = this.sel.has(w.id) ? th.select : hlWires.has(w.id) ? th.highlight : this.hover && this.hover.obj === w ? th.hover : th.wire;
      drawWire(ctx, w, color, s, hlWires.has(w.id) ? 12 : 6);
    }
    for (const j of sch.junctions) drawJunction(ctx, j, this.sel.has(j.id) ? th.select : th.junction);
    for (const n of sch.noconnects) drawNoConnect(ctx, n, this.sel.has(n.id) ? th.select : th.nc, s);

    const hlParts = new Map();
    if (hlNet) {
      const net = nl.nets.find((n) => n.name === hlNet);
      if (net) for (const p of net.allPins) { if (!hlParts.has(p.partId)) hlParts.set(p.partId, new Set()); hlParts.get(p.partId).add(p.num); }
    }
    for (const p of sch.parts) {
      drawPart(ctx, p, th, s, { selected: this.sel.has(p.id), hover: this.hover && this.hover.obj === p, highlightPins: hlParts.get(p.id) || null });
    }
    for (const l of sch.labels) drawLabel(ctx, l, th, s, { selected: this.sel.has(l.id) || (hlNet && l.text === hlNet) });
    for (const tx of sch.texts) drawText(ctx, tx, th, { selected: this.sel.has(tx.id) });
    for (const sh of sch.sheets || []) {
      const pgObj = (this.fullSch.pages || []).find((p) => p.id === sh.target);
      drawSheetBlock(ctx, sh, th, s, { selected: this.sel.has(sh.id), pageName: pgObj ? pgObj.name : "?" });
    }
    for (const d of sch.dimensions || []) drawSchDimension(ctx, d, th, s, { selected: this.sel.has(d.id), units: this.app.settings.units });
    if (this.measure && (this.tool === "measure" || this.tool === "dimension")) {
      const m = this.measure;
      if (this.tool === "dimension" && m.stage >= 1) drawSchDimension(ctx, { ...m }, th, s, { selected: true, units: this.app.settings.units });
      else {
        ctx.strokeStyle = th.select;
        ctx.lineWidth = lineWidthFor(s, 5, 1.2);
        ctx.setLineDash([20, 15]);
        ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke();
        ctx.setLineDash([]);
        const d = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
        const label = `${formatSchLength(d, this.app.settings.units)}   Δx ${Math.round(m.x2 - m.x1)}  Δy ${Math.round(m.y2 - m.y1)} mil`;
        vp.screenTransform(ctx);
        const [sx, sy] = vp.toScreen((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2);
        ctx.font = "12px 'Segoe UI', sans-serif";
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = "rgba(0,0,0,0.78)";
        ctx.fillRect(sx - w / 2, sy - 28, w, 20);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, sx, sy - 18);
        vp.worldTransform(ctx);
      }
    }
    if (this.sheetDrag) {
      const r = this.sheetDrag;
      ctx.setLineDash([30, 20]);
      ctx.strokeStyle = th.global;
      ctx.lineWidth = lineWidthFor(s, 6, 1.2);
      ctx.strokeRect(Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1));
      ctx.setLineDash([]);
    }

    // Unconnected wire ends: small open circles so they are easy to spot.
    const showDangling = this.app.settings.showDangling !== false;
    ctx.strokeStyle = th.ercWarn;
    ctx.lineWidth = lineWidthFor(s, 4, 1);
    for (const [x, y] of showDangling ? ops.danglingEnds(sch) : []) {
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Pin tips: tiny circles on unconnected pins when zoomed in.
    if (s > 0.12 && showDangling) {
      const connected = new Set();
      for (const net of nl.nets) if (net.allPins.length > 1 || net.labels.length || net.power.length) for (const p of net.allPins) connected.add(`${p.partId}:${p.num}`);
      for (const n of sch.noconnects) connected.add(`nc:${n.x},${n.y}`);
      ctx.strokeStyle = th.pin;
      ctx.lineWidth = lineWidthFor(s, 3, 0.8);
      for (const part of sch.parts) {
        const sym = getSymbol(part.lib);
        if (!sym || sym.power || sym.flag) continue;
        for (const pin of partPins(part)) {
          if (connected.has(`${part.id}:${pin.num}`) || connected.has(`nc:${pin.x},${pin.y}`)) continue;
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    this.renderErc(ctx, th, s);
    this.renderSimOverlay(ctx, th, s, nl);

    // Selection outlines.
    ctx.setLineDash([30, 20]);
    ctx.strokeStyle = th.select;
    ctx.lineWidth = lineWidthFor(s, 3, 1);
    for (const p of this.selectedParts()) {
      const b = ops.partBox(p);
      ctx.strokeRect(b.x1 - 20, b.y1 - 20, b.x2 - b.x1 + 40, b.y2 - b.y1 + 40);
    }
    ctx.setLineDash([]);

    // Tool previews.
    if (this.tool === "place" && this.ghost && this.vp.mouse.inside) drawPart(ctx, this.ghost, th, s, { ghost: true });
    if ((this.tool === "wire" || this.tool === "bus") && this.cursor) {
      const c = this.cursor;
      if (this.wire) {
        const [lx, ly] = this.wire.pts[this.wire.pts.length - 1];
        const path = ops.orthoPath(lx, ly, c.x, c.y, this.vFirst);
        ctx.strokeStyle = th.ghost;
        ctx.lineWidth = lineWidthFor(s, this.wire.bus ? 14 : 6, 1.4);
        ctx.setLineDash([25, 15]);
        ctx.beginPath();
        path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      this.drawSnapMarker(ctx, th, s, c);
    } else if (["label", "global", "noconnect", "junction", "text"].includes(this.tool) && this.cursor) {
      this.drawSnapMarker(ctx, th, s, this.cursor);
    }
    if (this.box) {
      const b = this.box;
      const crossing = b.x2 < b.x1;
      ctx.fillStyle = crossing ? "rgba(80,200,120,0.10)" : "rgba(80,140,255,0.10)";
      ctx.strokeStyle = crossing ? "#4cc674" : "#5a8cff";
      ctx.lineWidth = 1 / s;
      if (crossing) ctx.setLineDash([8 / s, 5 / s]);
      ctx.fillRect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
      ctx.strokeRect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
      ctx.setLineDash([]);
    }
    if (this.flash && performance.now() < this.flash.until) {
      const k = (this.flash.until - performance.now()) / 1500;
      ctx.strokeStyle = th.erc;
      ctx.lineWidth = 3 / s;
      ctx.beginPath();
      ctx.arc(this.flash.x, this.flash.y, (40 + (1 - k) * 160), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawSnapMarker(ctx, th, s, c) {
    const r = 8 / s;
    ctx.strokeStyle = c.snapped ? th.select : th.ghost;
    ctx.lineWidth = 1.5 / s;
    ctx.beginPath();
    if (c.snapped) {
      ctx.rect(c.x - r, c.y - r, r * 2, r * 2);
    } else {
      ctx.moveTo(c.x - r, c.y); ctx.lineTo(c.x + r, c.y);
      ctx.moveTo(c.x, c.y - r); ctx.lineTo(c.x, c.y + r);
    }
    ctx.stroke();
  }

  renderErc(ctx, th, s) {
    const issues = this.app.ercIssues || [];
    for (const is of issues) {
      const color = is.severity === "error" ? th.erc : th.ercWarn;
      ctx.fillStyle = color;
      const r = Math.max(22, 7 / s);
      ctx.beginPath();
      ctx.moveTo(is.x, is.y);
      ctx.lineTo(is.x + r * 1.6, is.y - r * 2.4);
      ctx.lineTo(is.x + r * 2.8, is.y - r * 1.2);
      ctx.closePath();
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  renderSimOverlay(ctx, th, s, nl) {
    const sim = this.app.simOverlay;
    if (!sim || !sim.voltages || this.app.settings.showSimOverlay === false) return;
    // One badge per net, at the middle of its longest wire (or first label).
    const done = new Set();
    const best = new Map();
    for (const w of this.sch.wires) {
      const net = nl.wireNet.get(w.id);
      if (!net || sim.voltages[net] == null) continue;
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (!best.has(net) || best.get(net).len < len) best.set(net, { len, x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
    }
    ctx.font = `bold ${Math.max(36, 11 / s)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [net, p] of best) {
      if (done.has(net)) continue;
      done.add(net);
      const label = formatValue(sim.voltages[net], "V");
      const w = ctx.measureText(label).width + 24 / s * 0.5 + 20;
      const hgt = Math.max(54, 16 / s);
      ctx.fillStyle = "rgba(20,20,20,0.78)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x - w / 2, p.y - hgt - 10, w, hgt, hgt / 3);
      else ctx.rect(p.x - w / 2, p.y - hgt - 10, w, hgt);
      ctx.fill();
      ctx.fillStyle = th.probe;
      ctx.fillText(label, p.x, p.y - hgt / 2 - 10);
    }
  }

  renderRulers(ctx, vp) {
    if (this.app.settings.showRulers === false) return;
    const th = this.theme;
    const mil = this.app.settings.units === "mil";
    vp.drawRulers(ctx, { toDisplay: (v) => (mil ? v : v * 0.0254), unit: mil ? "mil" : "mm", bg: th.rulerBg || th.bg, fg: th.rulerFg || th.text || "#c8ccd4", accent: th.select });
  }

  allSymbols() { return allSymbols(); }
}
