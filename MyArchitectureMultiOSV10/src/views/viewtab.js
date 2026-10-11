// The "Views & sheets" tab: opens documentation views in the centre area —
// sections, elevations, ceiling plans, details, drafting views, legends, 3D
// line views, sheets (paper with title block and viewports) and schedules
// (an editable table). Floor plans open in the Floor plan tab and 3D views in
// the 3D tab; everything else opens here. Open views are listed in a strip at
// the top of the tab; a view control bar at the bottom sets scale, detail
// level, crop and visibility like Revit's.

import { t } from "../ui/i18n.js";
import { icon } from "../ui/icons.js";
import { h, contextMenu, popupInput, toast, select } from "../ui/widgets.js";
import { Viewport } from "../ui/viewport.js";
import { findItem } from "../core/project.js";
import { viewById, sheetById, ensureView, effectiveView, sheetLayout, annotationsOf, VIEW_SCALES, DETAIL_LEVELS } from "./model.js";
import { viewSpec, drawView, ensureGen, cachedGen, staleGen, viewExtent, annotationOptions } from "./viewdraw.js";
import { drawSheet, viewportRects, prepareSheet } from "./sheets.js";
import { scheduleTable, cellText, setCell } from "./schedules.js";
import { AnnotationTool, TOOL_DEFS, pickAnnotation, drawHandles, dragAnnotations } from "./tools.js";
import { displayName } from "./names.js";

const KIND_ICON = { section: "section", elevation: "elevation", ceiling: "ceiling", detail: "zoomIn", drafting: "line", legend: "list", schedule: "schedule", "3d": "cube", plan: "floorplan", sheet: "sheet" };
export const kindIcon = (k) => KIND_ICON[k] || "file";

export class ViewsTab {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add("vt-host");
    this.strip = h("div", { class: "vt-strip" });
    this.canvas = h("canvas", { class: "editor-canvas vt-canvas", tabindex: "0" });
    this.canvasWrap = h("div", { class: "vt-canvas-wrap" }, this.canvas);
    this.table = h("div", { class: "vt-table" });
    this.empty = h("div", { class: "vt-empty" });
    this.bar = h("div", { class: "vt-bar" });
    host.append(this.strip, this.canvasWrap, this.table, this.empty, this.bar);
    this.open = []; // ids of open views / sheets
    this.current = null;
    this.sel = new Set();
    this.tool = "select";
    this.annTool = null;
    this.fitted = new Set();
    this.vp = new Viewport(this.canvas, {
      minScale: 0.0005, maxScale: 60,
      onRender: (ctx, vp) => this.render(ctx, vp),
      onPointer: (type, e, m) => this.pointer(type, e, m),
      onViewChange: () => this.app.updateStatus(),
    });
    this.canvas.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("text/x-myarch-view") && this.isSheet()) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
    this.canvas.addEventListener("drop", (e) => {
      const id = e.dataTransfer.getData("text/x-myarch-view");
      if (!id || !this.isSheet()) return;
      e.preventDefault();
      e.stopPropagation();
      const r = this.canvas.getBoundingClientRect();
      const [x, y] = this.vp.toWorld(e.clientX - r.left, e.clientY - r.top);
      this.app.views.placeOnSheet(this.current, id, [x, y]);
    });
  }

  get p() { return this.app.store.project; }
  get rev() { return this.app.store.revision; }
  item(id = this.current) { return sheetById(this.p, id) || viewById(this.p, id); }
  isSheet(id = this.current) { return !!sheetById(this.p, id); }
  view() { const v = viewById(this.p, this.current); return v ? effectiveView(this.p, v) : null; }
  spec() { const v = viewById(this.p, this.current); return v ? viewSpec(this.p, v) : null; }
  scale() { if (this.isSheet()) return 1; const s = this.spec(); return s ? s.scale : 100; }
  px() { return 1 / this.vp.scale; }

  // ---------------------------------------------------------------- open / close
  show(id) {
    if (!this.item(id)) return false;
    if (!this.open.includes(id)) this.open.push(id);
    if (this.current !== id) { this.sel.clear(); this.setTool("select"); }
    this.current = id;
    this.render2();
    return true;
  }

  close(id) {
    const i = this.open.indexOf(id);
    if (i < 0) return;
    this.open.splice(i, 1);
    if (this.current === id) this.current = this.open[Math.min(i, this.open.length - 1)] || null;
    this.render2();
    this.app.refreshInspector();
    this.app.updateStatus();
  }

  activate() {
    this.vp.resize();
    this.render2();
  }

  deactivate() { this.finishTool(); }

  // Re-check what is open (after undo, load, delete).
  sync() {
    this.open = this.open.filter((id) => this.item(id));
    if (this.current && !this.item(this.current)) this.current = this.open[0] || null;
    for (const id of [...this.sel]) if (!(this.p.annotations || []).some((a) => a.id === id) && !this.viewportById(id)) this.sel.delete(id);
  }

  viewportById(id) {
    const s = sheetById(this.p, this.current);
    return s ? (s.viewports || []).find((v) => v.id === id) || null : null;
  }

  saveState() { return { open: this.open.slice(), current: this.current }; }
  restoreState(s) { this.open = (s && s.open) || []; this.current = (s && s.current) || null; this.sel.clear(); this.fitted.clear(); this.sync(); }

  // ---------------------------------------------------------------- layout
  render2() {
    this.sync();
    this.renderStrip();
    const it = this.item();
    const sched = it && !this.isSheet() && it.kind === "schedule";
    this.canvasWrap.style.display = it && !sched ? "" : "none";
    this.table.style.display = sched ? "" : "none";
    this.empty.style.display = it ? "none" : "";
    if (!it) {
      this.empty.innerHTML = "";
      this.empty.append(h("div", { class: "vt-empty-box" }, h("span", { html: icon("sheet", 40) }), h("h3", {}, t("Views & sheets")),
        h("p", {}, t("Open a section, elevation, ceiling plan, detail, legend, schedule or sheet from the Project Browser on the left — or make one:")),
        h("div", { class: "vt-empty-actions" },
          ...[["views.section", "section"], ["views.extElevations", "elevation"], ["views.sheet", "sheet"], ["views.schedule", "schedule"]].map(([id]) => { const c = this.app.commands.get(id); return c ? h("button", { class: "btn", "data-cmd": id, onclick: () => this.app.run(id) }, h("span", { html: icon(c.icon, 15) }), t(c.label)) : null; }))));
    }
    if (sched) this.renderTable();
    this.renderBar();
    if (it && !sched) {
      if (!this.fitted.has(this.current)) { requestAnimationFrame(() => { this.vp.resize(); this.zoomFit(); }); this.fitted.add(this.current); }
      this.kick();
      this.vp.request();
    }
  }

  renderStrip() {
    this.strip.innerHTML = "";
    for (const id of this.open) {
      const it = this.item(id);
      if (!it) continue;
      const sheet = this.isSheet(id);
      const label = sheet ? `${it.number} — ${displayName(it.name)}` : it.id === "3d-default" ? t("Default 3D") : displayName(it.name);
      const tab = h("div", { class: `vt-tab ${id === this.current ? "on" : ""}`, "data-view": id, title: label },
        h("span", { class: "vt-tab-ico", html: icon(sheet ? "sheet" : kindIcon(it.kind), 13) }), h("span", { class: "vt-tab-name" }, label),
        h("button", { class: "vt-tab-close", title: t("Close view"), html: icon("close", 11), onclick: (e) => { e.stopPropagation(); this.close(id); } }));
      tab.addEventListener("click", () => { this.show(id); this.app.refreshInspector(); this.app.updateStatus(); this.app.renderToolbar(); });
      tab.addEventListener("auxclick", (e) => { if (e.button === 1) this.close(id); });
      this.strip.append(tab);
    }
    this.strip.style.display = this.open.length ? "" : "none";
  }

  // View control bar (scale, detail level, crop, visibility).
  renderBar() {
    const bar = this.bar;
    bar.innerHTML = "";
    const it = this.item();
    if (!it) { bar.style.display = "none"; return; }
    bar.style.display = "";
    if (this.isSheet()) {
      bar.append(h("span", { class: "vt-bar-label" }, `${t("Sheet")} ${it.number}`), h("span", { class: "vt-bar-dim" }, `${it.paper} ${it.landscape === false ? t("Portrait") : t("Landscape")}`));
      bar.append(h("button", { class: "btn small", onclick: () => this.app.run("views.placeView") }, h("span", { html: icon("plus", 13) }), t("Place view…")));
      bar.append(h("button", { class: "btn small", onclick: () => this.app.run("views.publish") }, h("span", { html: icon("print", 13) }), t("Print / publish…")));
      return;
    }
    const v = viewById(this.p, this.current);
    const eff = effectiveView(this.p, v);
    const locked = (k) => !!(v.template && (this.p.viewTemplates || []).find((x) => x.id === v.template && x[k] !== undefined));
    const edit = (label, fn) => this.app.store.edit(t(label), (p) => { const sv = ensureView(p, v.id); if (sv) fn(sv); });
    if (v.kind !== "schedule" && v.kind !== "3d") {
      const sc = select(String(eff.scale || 100), VIEW_SCALES.map((s) => [String(s), `1:${s}`]), { cls: "vt-scale", onChange: (x) => edit("View scale", (sv) => { sv.scale = +x; }) });
      sc.disabled = locked("scale");
      sc.title = t("View scale");
      const dl = select(eff.detail || "medium", DETAIL_LEVELS.map((d) => [d, t({ coarse: "Coarse", medium: "Medium", fine: "Fine" }[d])]), { cls: "vt-detail", onChange: (x) => edit("Detail level", (sv) => { sv.detail = x; }) });
      dl.disabled = locked("detail");
      dl.title = t("Detail level");
      bar.append(h("span", { class: "vt-bar-ico", html: icon("ruler", 14) }), sc, h("span", { class: "vt-bar-ico", html: icon("layers", 14) }), dl);
      if (v.kind !== "drafting" && v.kind !== "legend") {
        bar.append(
          h("button", { class: `icon-btn ${v.cropOn ? "on" : ""}`, "data-bar": "crop", title: t("Crop the view"), html: icon("outline", 15), onclick: () => edit("Crop view", (sv) => { sv.cropOn = !sv.cropOn; if (sv.cropOn && !sv.crop) sv.crop = this.defaultCrop(); }) }),
          h("button", { class: `icon-btn ${v.cropShow !== false ? "on" : ""}`, "data-bar": "cropShow", title: t("Show the crop region"), html: icon("eye", 15), onclick: () => edit("Show crop region", (sv) => { sv.cropShow = sv.cropShow === false; }) }));
      }
      bar.append(h("button", { class: "icon-btn", "data-bar": "vg", title: t("Visibility / graphics…"), html: icon("layers", 15), onclick: () => this.app.run("views.visibility") }));
      const tpl = (this.p.viewTemplates || []).find((x) => x.id === v.template);
      bar.append(h("span", { class: "vt-bar-dim" }, tpl ? `${t("Template")}: ${displayName(tpl.name)}` : t("No template")));
    }
    const spec = this.spec();
    if (spec && spec.type === "model") {
      const g = cachedGen(this.p, spec, this.rev);
      bar.append(h("span", { class: "vt-bar-dim vt-gen" }, g ? t("{n} lines, {c} cut", { n: g.lines.length, c: g.cut.length }) : t("Generating…")));
    }
  }

  defaultCrop() {
    const ext = viewExtent(this.p, viewById(this.p, this.current), null, this.rev);
    return { ...ext };
  }

  // Start the model generation for the open view / sheet; redraw when ready.
  kick() {
    const it = this.item();
    if (!it) return;
    const rev = this.rev;
    const done = () => { if (this.rev === rev) { this.vp.request(); this.renderBar(); this.app.updateStatus(); } };
    if (this.isSheet()) {
      prepareSheet(this.p, it, rev).then(done).catch((e) => console.error(e));
      return;
    }
    const spec = this.spec();
    if (spec && spec.type === "model" && !cachedGen(this.p, spec, rev)) ensureGen(this.p, spec, rev).then(() => { if (!this.fitted.has(`g:${this.current}`)) { this.fitted.add(`g:${this.current}`); this.zoomFit(); } done(); }).catch((e) => { console.error(e); toast(e.message, "error"); });
  }

  onDocChange() {
    this.sync();
    if (this.app.tab !== "views") return;
    this.render2();
  }

  zoomFit() {
    const it = this.item();
    if (!it) return;
    let b;
    if (this.isSheet()) { const L = sheetLayout(it); b = { x1: -10, y1: -10, x2: L.W + 10, y2: L.H + 10 }; }
    else b = viewExtent(this.p, viewById(this.p, this.current), null, this.rev);
    this.vp.fit(b, 0.06);
  }

  resize() { this.vp.resize(); }

  // ---------------------------------------------------------------- drawing
  theme() { return this.app.planPalette(); }

  render(ctx, vp) {
    const th = this.theme();
    vp.screenTransform(ctx);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, vp.width, vp.height);
    const it = this.item();
    if (!it) return;
    vp.worldTransform(ctx);
    const px = 1 / vp.scale;
    if (this.isSheet()) {
      const L = sheetLayout(it);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(2 * px * 3, 2 * px * 3, L.W, L.H);
      drawSheet(ctx, this.p, it, { rev: this.rev, t, selected: this.sel, selectedAnn: this.sel, select: th.select, minLw: px * 0.8, units: this.app.settings.units, labels: { up: t("UP") }, showCrops: true });
      if (this.dropHint) { ctx.strokeStyle = th.select; ctx.strokeRect(this.dropHint.x1, this.dropHint.y1, this.dropHint.x2 - this.dropHint.x1, this.dropHint.y2 - this.dropHint.y1); }
    } else {
      const spec = this.spec();
      if (!spec) return;
      const v = spec.view;
      const ink = th.wall;
      // Paper-like backdrop under the content so poché tints read on every theme.
      const ext = viewExtent(this.p, v, null, this.rev);
      ctx.fillStyle = th.paper || th.bg;
      ctx.fillRect(ext.x1, ext.y1, ext.x2 - ext.x1, ext.y2 - ext.y1);
      const gen = spec.type === "model" ? cachedGen(this.p, spec, this.rev) || staleGen(spec) : null;
      drawView(ctx, this.p, v, { ink, bg: th.paper || th.bg, select: th.select, selected: this.sel, minLw: px, px, rev: this.rev, gen, theme: th, units: this.app.settings.units, labels: { up: t("UP") }, halo: th.bg, planOpts: { lw: px } });
      if (v.crop && v.cropOn && v.cropShow !== false) {
        ctx.save(); ctx.strokeStyle = th.ghost || "#888"; ctx.lineWidth = px * 1.2; ctx.setLineDash([8 * px, 5 * px]);
        ctx.strokeRect(v.crop.x1, v.crop.y1, v.crop.x2 - v.crop.x1, v.crop.y2 - v.crop.y1);
        ctx.setLineDash([]); ctx.fillStyle = th.bg; ctx.strokeStyle = th.select;
        for (const [x, y] of this.cropCorners(v.crop)) { ctx.beginPath(); ctx.rect(x - 4 * px, y - 4 * px, 8 * px, 8 * px); ctx.fill(); ctx.stroke(); }
        ctx.restore();
      }
      if (spec.type === "model" && !gen) {
        vp.screenTransform(ctx);
        ctx.fillStyle = th.text; ctx.font = "13px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(t("Generating the drawing from the model…"), vp.width / 2, vp.height / 2);
        vp.worldTransform(ctx);
      }
      drawHandles(ctx, this.p, this.current, this.sel, { bg: th.bg, select: th.select, px });
    }
    if (this.annTool) this.annTool.draw(ctx, { ...this.annOpts(), px });
    if (this.boxStart && this.cursor) {
      ctx.save(); ctx.strokeStyle = th.select; ctx.lineWidth = 1.5 * px; ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeRect(Math.min(this.boxStart[0], this.cursor[0]), Math.min(this.boxStart[1], this.cursor[1]), Math.abs(this.cursor[0] - this.boxStart[0]), Math.abs(this.cursor[1] - this.boxStart[1]));
      ctx.restore();
    }
  }

  cropCorners(c) { return [[c.x1, c.y1], [c.x2, c.y1], [c.x2, c.y2], [c.x1, c.y2]]; }

  annOpts() {
    const th = this.theme();
    if (this.isSheet()) return { scale: 1, ink: "#000000", bg: "#ffffff", select: th.select, selected: this.sel, p: this.p, minLw: this.px() };
    const spec = this.spec();
    const gen = spec && spec.type === "model" ? cachedGen(this.p, spec, this.rev) || staleGen(spec) : null;
    return { ...annotationOptions(this.p, spec, gen, { ink: th.wall, bg: th.bg, select: th.select, selected: this.sel, minLw: this.px(), units: this.app.settings.units }), px: this.px() };
  }

  // ---------------------------------------------------------------- tools
  setTool(name, opts = {}) {
    this.finishTool();
    this.tool = name;
    this.toolOpts = opts;
    this.annTool = name.startsWith("a:") && this.item() ? new AnnotationTool(this.toolHost(), name.slice(2)) : null;
    const def = TOOL_DEFS[name.slice(2)];
    this.app.setHint(def ? t(def.hint) : name === "v:callout" ? t("Drag (or click two corners of) the area to show at a larger scale.") : "");
    this.canvas.style.cursor = name === "select" ? "default" : "crosshair";
    this.app.renderToolbar();
    this.vp.request();
  }

  finishTool() { this.annTool = null; this.boxStart = null; this.drag = null; }

  toolHost() {
    return {
      store: this.app.store, t,
      viewId: () => this.current, scale: () => this.scale(), px: () => this.px(),
      snap: (x, y, e) => this.snap(x, y, e),
      tagTarget: (x, y) => this.tagTarget(x, y),
      request: () => this.vp.request(), setHint: (s) => this.app.setHint(s), done: () => this.setTool("select"),
      popup: (e, value, cb) => popupInput({ x: (e && e.clientX) || 300, y: (e && e.clientY) || 300, value, onDone: cb }),
      revision: () => { const r = this.p.revisions || []; return r.length ? r[r.length - 1].id : null; },
      toolOpts: () => this.toolOpts || {},
      created: (a) => { this.sel = new Set([a.id]); this.app.queueInspector(); },
    };
  }

  // Snap to the ends of generated lines (and poché corners) near the cursor.
  snap(x, y, e) {
    if (e && e.altKey) return [x, y];
    const tol = 8 * this.px();
    const spec = this.isSheet() ? null : this.spec();
    const gen = spec && spec.type === "model" ? cachedGen(this.p, spec, this.rev) || staleGen(spec) : null;
    let best = null, bd = tol;
    const tryPt = (qx, qy) => { const d = Math.hypot(qx - x, qy - y); if (d < bd) { bd = d; best = [qx, qy]; } };
    if (gen) {
      for (const l of gen.lines) { tryPt(l.x1, l.y1); tryPt(l.x2, l.y2); }
      for (const c of gen.cut) for (const q of c.pts) tryPt(q[0], q[1]);
    }
    for (const a of annotationsOf(this.p, this.current)) for (const q of [...(a.pts || []), a.c, a.a, a.b, a.p].filter(Boolean)) tryPt(q[0], q[1]);
    if (best) return best;
    const g = this.isSheet() ? 1 : 10;
    return [Math.round(x / g) * g, Math.round(y / g) * g];
  }

  tagTarget(x, y) {
    const spec = this.spec();
    const gen = spec && spec.type === "model" ? cachedGen(this.p, spec, this.rev) || staleGen(spec) : null;
    if (!gen) return null;
    let best = null, area = Infinity;
    for (const [id, b] of gen.items) {
      if (x < b.x1 || x > b.x2 || y < b.y1 || y > b.y2) continue;
      const it = findItem(this.p, id);
      if (!it || !["rooms", "openings", "walls", "furniture", "columns", "stairs", "roofs"].includes(it.kind)) continue;
      const a = (b.x2 - b.x1) * (b.y2 - b.y1);
      if (a < area) { area = a; best = id; }
    }
    return best;
  }

  pointer(type, e, m) {
    const x = m.wx, y = m.wy;
    this.cursor = [x, y];
    if (type === "move") this.app.updateStatus();
    if (!this.item()) return;
    if (this.annTool) {
      if (type === "context") { this.setTool("select"); return; }
      this.annTool.pointer(type, e, x, y);
      return;
    }
    if (this.tool === "v:callout") {
      if (type === "context") { this.setTool("select"); return; }
      if (type === "move") { this.vp.request(); return; }
      if (type === "down" && e.button === 0) { if (!this.boxStart) { this.boxStart = [x, y]; this.boxT = performance.now(); } else this.finishCallout([x, y]); }
      if (type === "up" && this.boxStart && performance.now() - this.boxT > 250 && Math.hypot(x - this.boxStart[0], y - this.boxStart[1]) * this.vp.scale > 10) this.finishCallout([x, y]);
      return;
    }
    const tol = 7 * this.px();
    if (type === "context") return this.contextAt(e, x, y);
    if (type === "dblclick") return this.dblclickAt(e, x, y);
    if (type === "down" && e.button === 0) {
      this.canvas.focus();
      const hit = this.hitAt(x, y, tol);
      if (!hit) { if (this.sel.size) { this.sel.clear(); this.app.queueInspector(); this.vp.request(); } this.vp.startPan(e); return; }
      if (hit.id && !this.sel.has(hit.id)) this.sel = e.shiftKey ? new Set([...this.sel, hit.id]) : new Set([hit.id]);
      this.drag = { hit, start: [x, y], moved: false };
      if (hit.type === "ann") this.drag.dd = dragAnnotations(this.app.store, new Set([...this.sel].filter((k) => (this.p.annotations || []).some((a) => a.id === k))), hit.handle !== undefined ? { id: hit.id, index: hit.handle } : null, [x, y]);
      this.app.queueInspector();
      this.vp.request();
      return;
    }
    if (type === "move" && this.drag) {
      const d = this.drag;
      if (!d.moved && Math.hypot(x - d.start[0], y - d.start[1]) * this.vp.scale < 4) return;
      d.moved = true;
      if (d.dd) { d.dd.move(x, y); this.vp.request(); return; }
      const store = this.app.store;
      if (!d.begun) { store.begin(d.hit.type === "viewport" ? t("Move viewport") : t("Crop view")); d.begun = true; d.orig = d.hit.type === "viewport" ? { x: d.hit.rect.x1 + (d.hit.rect.x2 - d.hit.rect.x1) / 2, y: d.hit.rect.y1 + (d.hit.rect.y2 - d.hit.rect.y1) / 2 } : { ...viewById(this.p, this.current).crop }; }
      const p = store.project;
      if (d.hit.type === "viewport") {
        const s = sheetById(p, this.current);
        const vpo = s.viewports.find((q) => q.id === d.hit.id);
        vpo.fit = false;
        vpo.x = Math.round(d.orig.x + x - d.start[0]);
        vpo.y = Math.round(d.orig.y + y - d.start[1]);
      } else if (d.hit.type === "crop") {
        const v = ensureView(p, this.current);
        const c = { ...d.orig };
        const i = d.hit.corner;
        if (i === 0 || i === 3) c.x1 = x; else c.x2 = x;
        if (i === 0 || i === 1) c.y1 = y; else c.y2 = y;
        v.crop = { x1: Math.min(c.x1, c.x2), y1: Math.min(c.y1, c.y2), x2: Math.max(c.x1, c.x2), y2: Math.max(c.y1, c.y2) };
      }
      store.preview();
      this.vp.request();
      return;
    }
    if (type === "move") {
      const hit = this.hitAt(x, y, tol);
      this.canvas.style.cursor = hit ? (hit.type === "crop" || hit.handle !== undefined ? "crosshair" : "move") : "default";
      return;
    }
    if (type === "up" && this.drag) {
      const d = this.drag;
      this.drag = null;
      if (d.dd) d.dd.end();
      if (d.begun) this.app.store.commit();
      this.vp.request();
    }
  }

  // What is under the pointer: annotation (and its handles), crop corner, viewport.
  hitAt(x, y, tol) {
    const an = pickAnnotation(this.p, this.current, x, y, tol, this.annOpts(), this.sel);
    if (an) return { type: "ann", id: an.a.id, handle: an.handle, a: an.a };
    if (!this.isSheet()) {
      const v = viewById(this.p, this.current);
      if (v && v.crop && v.cropOn && v.cropShow !== false) {
        const cs = this.cropCorners(v.crop);
        for (let i = 0; i < 4; i++) if (Math.hypot(cs[i][0] - x, cs[i][1] - y) <= tol * 1.5) return { type: "crop", corner: i };
      }
      return null;
    }
    const s = sheetById(this.p, this.current);
    const rects = viewportRects(this.p, s, this.rev, t).reverse();
    for (const r of rects) if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2 + 12) return { type: "viewport", id: r.vp.id, rect: r };
    return null;
  }

  dblclickAt(e, x, y) {
    const hit = this.hitAt(x, y, 7 * this.px());
    if (!hit) return;
    if (hit.type === "viewport") this.app.views.open(hit.rect.view.id);
    else if (hit.type === "ann") {
      if (hit.a.kind === "note" || hit.a.kind === "keynote") popupInput({ x: e.clientX, y: e.clientY, value: hit.a.kind === "note" ? hit.a.text : hit.a.key, onDone: (v) => { if (v !== null) this.app.store.edit(t("Edit text"), (p) => { const q = p.annotations.find((a) => a.id === hit.id); if (q.kind === "note") q.text = v; else q.key = v; }); } });
      else if (hit.a.kind === "tag") { const it = findItem(this.p, hit.a.target); if (it) this.app.editProperties(it.kind, it.obj); }
      else this.app.views.annotationProperties(hit.a);
    }
  }

  contextAt(e, x, y) {
    const hit = this.hitAt(x, y, 7 * this.px());
    const items = [...this.app.undoMenuItems(), "-"];
    if (hit && hit.id && !this.sel.has(hit.id)) { this.sel = new Set([hit.id]); this.vp.request(); this.app.queueInspector(); }
    if (hit && hit.type === "viewport") {
      const v = hit.rect.view;
      items.push({ label: t("Open view"), icon: kindIcon(v.kind), action: () => this.app.views.open(v.id) },
        { label: t("View properties…"), icon: "settings", action: () => this.app.views.viewProperties(v.id) },
        { label: t("Remove from sheet"), icon: "trash", danger: true, action: () => this.deleteSelected() });
    } else if (hit && hit.type === "ann") {
      items.push({ label: t("Properties…"), icon: "settings", action: () => this.app.views.annotationProperties(hit.a) }, "-", { label: t("Delete"), icon: "trash", danger: true, shortcut: "Del", action: () => this.deleteSelected() });
    } else {
      const it = this.item();
      if (this.isSheet()) items.push({ label: t("Place view…"), icon: "plus", action: () => this.app.run("views.placeView") }, { label: t("Sheet properties…"), icon: "settings", action: () => this.app.views.sheetProperties(it.id) });
      else items.push({ label: t("View properties…"), icon: "settings", action: () => this.app.views.viewProperties(it.id) }, { label: t("Visibility / graphics…"), icon: "layers", action: () => this.app.run("views.visibility") });
      items.push("-", { label: t("Zoom to fit"), icon: "zoomFit", shortcut: "Home", action: () => this.zoomFit() });
    }
    contextMenu(items, e.clientX, e.clientY);
  }

  finishCallout(b) {
    const a = this.boxStart;
    this.boxStart = null;
    if (this.isSheet()) return;
    const S = this.scale();
    if (Math.abs(b[0] - a[0]) < 2 * S || Math.abs(b[1] - a[1]) < 2 * S) return;
    this.app.views.addCallout(this.current, { x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]), x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]) });
    this.setTool("select");
  }

  deleteSelected() {
    if (!this.sel.size) return false;
    const ids = new Set(this.sel);
    this.app.views.deleteIds(ids, this.current);
    this.sel.clear();
    this.vp.request();
    this.app.queueInspector();
    return true;
  }

  onKey(e) {
    if (this.annTool && this.annTool.key(e)) return true;
    if (e.key === "Escape") {
      if (this.tool !== "select") { this.setTool("select"); return true; }
      if (this.sel.size) { this.sel.clear(); this.vp.request(); this.app.queueInspector(); return true; }
      return false;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && this.sel.size) return this.deleteSelected();
    return false;
  }

  // ---------------------------------------------------------------- schedules
  renderTable() {
    const host = this.table;
    host.innerHTML = "";
    const v = viewById(this.p, this.current);
    if (!v) return;
    const tb = scheduleTable(this.p, v);
    const head = h("div", { class: "vt-table-head" }, h("span", { html: icon("schedule", 16) }), h("h3", {}, displayName(v.name)), h("span", { class: "vt-bar-dim" }, t("{n} rows", { n: tb.count })), h("div", { class: "grow" }),
      h("button", { class: "btn small", "data-act": "sched-props", onclick: () => this.app.views.scheduleProperties(v.id) }, h("span", { html: icon("settings", 13) }), t("Fields, filters and sorting…")),
      h("button", { class: "btn small", "data-act": "sched-csv", onclick: () => this.app.views.exportScheduleCsv(v.id) }, h("span", { html: icon("export", 13) }), t("Export CSV…")));
    const table = h("table", { class: "grid vt-sched" });
    const thead = h("tr", {}, ...tb.columns.map((c) => {
      const sortOn = (v.sort || [])[0];
      const th = h("th", { class: c.calc ? "calc" : "", title: t("Click to sort") }, t(c.label), sortOn && sortOn.field === c.key ? (sortOn.desc ? " ▼" : " ▲") : "");
      th.addEventListener("click", () => this.app.store.edit(t("Sort schedule"), (p) => { const sv = ensureView(p, v.id); const cur = (sv.sort || [])[0]; sv.sort = [{ field: c.key, desc: cur && cur.field === c.key ? !cur.desc : false }]; }));
      return th;
    }));
    table.append(h("thead", {}, thead));
    const body = h("tbody");
    const num = (c) => c.type !== "text";
    for (const g of tb.groups) {
      if (g.key !== null) body.append(h("tr", { class: "vt-group" }, h("td", { colspan: String(tb.columns.length) }, g.key || "—")));
      for (const r of g.rows) {
        const tr = h("tr", { "data-id": r._id });
        for (const c of tb.columns) {
          const td = h("td", { class: `${num(c) ? "num" : ""} ${c.editable ? "editable" : ""}` }, cellText(r[c.key], c.type));
          if (c.editable) {
            td.title = t("Double-click to edit");
            td.addEventListener("dblclick", (e) => {
              const rr = td.getBoundingClientRect();
              popupInput({ x: rr.left, y: rr.top, value: String(r[c.key] ?? ""), onDone: (val) => { if (val === null) return; this.app.store.edit(t("Edit schedule cell"), (p) => setCell(p, v, r._id, c.key, c.type === "text" ? val : parseFloat(val))); } });
              e.preventDefault();
            });
          }
          tr.append(td);
        }
        tr.addEventListener("click", (e) => { if (e.detail === 1 && findItem(this.p, r._id)) this.app.onSelection("schedule", [r._id]); });
        body.append(tr);
      }
      if (g.totals) body.append(h("tr", { class: "vt-subtotal" }, ...tb.columns.map((c, i) => h("td", { class: num(c) ? "num" : "" }, i === 0 ? String(g.rows.length) : g.totals[c.key] !== undefined ? cellText(g.totals[c.key], c.type) : ""))));
    }
    if (tb.totals) body.append(h("tr", { class: "vt-total" }, ...tb.columns.map((c, i) => h("td", { class: num(c) ? "num" : "" }, i === 0 ? `${t("Total")} (${tb.count})` : tb.totals[c.key] !== undefined ? cellText(tb.totals[c.key], c.type) : ""))));
    table.append(body);
    host.append(head, h("div", { class: "vt-table-scroll" }, table));
  }
}
