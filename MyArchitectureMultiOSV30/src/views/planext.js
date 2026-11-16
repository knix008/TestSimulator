// Floor-plan editor extension: the plan view's own annotations, the section /
// elevation / callout markers linked to their views, and the tools that make
// them. The editor (src/plan/editor.js) calls pointer / key / render here
// first; anything not taken is handled by the editor as before.
//
// Tools are plan.tool ids: "v:section", "v:elevation", "v:callout" and
// "a:<annotation kind>" (see tools.js).

import { t } from "../ui/i18n.js";
import { contextMenu, popupInput, toast } from "../ui/widgets.js";
import * as ops from "../plan/ops.js";
import { levelById, findItem } from "../core/project.js";
import { modelExtent } from "../view3d/build.js";
import { planViewId, viewById, ensureView, effectiveView, newView, allViews, annotationsOf } from "./model.js";
import { planProject, planShow, drawMarkers, hitMarker } from "./viewdraw.js";
import { drawAnnotations, planAnchor } from "./annot.js";
import { AnnotationTool, TOOL_DEFS, pickAnnotation, drawHandles, dragAnnotations } from "./tools.js";
import { displayName } from "./names.js";

export const VIEW_TOOLS = {
  "v:section": { icon: "section", label: "Section", hint: "Click the start and the end of the section line. It looks to the left of the direction you draw; flip it from its menu." },
  "v:elevation": { icon: "elevation", label: "Elevation", hint: "Click where the elevation marker goes: it looks towards the building." },
  "v:callout": { icon: "zoomIn", label: "Callout (detail view)", hint: "Drag (or click two corners of) the area to show at a larger scale." },
};

const nextRef = (p, kind, prefix) => {
  const n = allViews(p).filter((v) => v.kind === kind).length + 1;
  return `${prefix}${n}`;
};

// New section view from a plan line; crop to the line and the building height.
export function makeSection(p, a, b, props = {}) {
  const e = modelExtent(p);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = allViews(p).filter((v) => v.kind === "section").length + 1;
  return newView("section", { name: `Section ${n}`, ref: nextRef(p, "section", "S"), line: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, scale: 50, detail: "fine", template: null, cropOn: true, crop: { x1: 0, y1: -(e.top + 1500), x2: L, y2: 1500 }, ...props });
}

// New elevation looking from (x, y) towards the model (snapped to 90°).
export function makeElevation(p, x, y, props = {}) {
  const e = modelExtent(p);
  const cx = (e.x1 + e.x2) / 2, cy = (e.y1 + e.y2) / 2;
  let best = 0, bestDot = -Infinity;
  for (const ang of [0, 90, 180, -90]) {
    const r = (ang * Math.PI) / 180;
    const d = Math.cos(r) * (cx - x) + Math.sin(r) * (cy - y);
    if (d > bestDot) { bestDot = d; best = ang; }
  }
  const facade = { "-90": "South", 90: "North", 0: "West", 180: "East" }[best];
  const r = (best * Math.PI) / 180;
  const R = [-Math.sin(r), Math.cos(r)];
  const xs = [[e.x1, e.y1], [e.x2, e.y1], [e.x2, e.y2], [e.x1, e.y2]].map(([px, py]) => (px - x) * R[0] + (py - y) * R[1]);
  return newView("elevation", { name: `${facade} elevation`, ref: nextRef(p, "elevation", "E"), x, y, angle: best, scale: 100, detail: "medium", cropOn: true, crop: { x1: Math.min(...xs) - 1500, y1: -(e.top + 1500), x2: Math.max(...xs) + 1500, y2: 1500 }, ...props });
}

export class PlanExt {
  constructor(app) {
    this.app = app;
    this.sel = new Set();
    this.annTool = null;
    this.drag = null;
    this.viewOverride = null;
  }

  get plan() { return this.app.plan; }
  get p() { return this.app.store.project; }

  viewId() {
    const v = this.viewOverride && viewById(this.p, this.viewOverride);
    if (v && v.kind === "plan" && v.level === this.plan.level) return v.id;
    return planViewId(this.plan.level);
  }
  view() { return effectiveView(this.p, viewById(this.p, this.viewId())); }
  scale() { const v = this.view(); return (v && v.scale) || this.p.meta.scale || 100; }
  px() { return 1 / this.plan.vp.scale; }

  isOwnTool(name = this.plan.tool) { return /^[va]:/.test(name || ""); }

  setTool(name, opts = {}) {
    this.plan.setTool(name, opts);
    this.annTool = name.startsWith("a:") ? new AnnotationTool(this.host(), name.slice(2)) : null;
    this.calloutStart = null;
    this.sectionStart = null;
    const def = VIEW_TOOLS[name] || TOOL_DEFS[name.slice(2)];
    if (def) this.app.setHint(t(def.hint));
    this.plan.canvas.style.cursor = "crosshair";
  }

  host() {
    return {
      store: this.app.store, t,
      viewId: () => this.viewId(), scale: () => this.scale(), px: () => this.px(),
      snap: (x, y, e) => { const s = this.plan.snapAt(x, y, { onWall: false, ortho: false, from: null, endpoints: !(e && e.altKey) }); return [s.x, s.y]; },
      tagTarget: (x, y) => { const hh = ops.hitTest(this.p, this.plan.level, x, y, this.plan.tol()); return hh && ["rooms", "openings", "walls", "furniture", "columns", "stairs", "roofs", "solids"].includes(hh.kind) ? hh.obj.id : null; },
      request: () => this.plan.request(), setHint: (s) => this.app.setHint(s), done: () => this.plan.setTool("select"),
      popup: (e, value, cb) => popupInput({ x: (e && e.clientX) || 200, y: (e && e.clientY) || 200, value, onDone: cb }),
      revision: () => { const r = this.p.revisions || []; return r.length ? r[r.length - 1].id : null; },
      toolOpts: () => this.plan.toolOpts || {},
      created: (a) => { this.sel = new Set([a.id]); this.app.queueInspector(); },
    };
  }

  annOpts(th) {
    const lv = levelById(this.p, this.plan.level);
    const v = this.view();
    return { scale: this.scale(), ink: th.text, bg: th.bg, select: th.select, selected: this.sel, minLw: this.px(), p: this.p, anchorOf: (id) => planAnchor(this.p, id), spot: () => (lv ? lv.elevation : 0), units: this.app.settings.units, hidden: new Set((v && v.hidden) || []), halo: th.bg, px: this.px() };
  }

  // ---------------------------------------------------------------- drawing hooks
  planProject(p) { return planProject(p, viewById(p, this.viewId()), this.app.store.revision); }
  planShow(show) { return planShow(this.p, viewById(this.p, this.viewId()), show); }

  render(ctx, vp, th, px) {
    const p = this.p;
    const v = this.view();
    const o = this.annOpts(th);
    drawAnnotations(ctx, annotationsOf(p, this.viewId()), o);
    if (!o.hidden.has("markers")) drawMarkers(ctx, p, v, { scale: this.scale(), ink: th.text, markerInk: th.text, bg: th.bg, selected: this.sel, select: th.select, minLw: px });
    if (v && v.crop && v.cropShow !== false && v.cropOn) {
      ctx.save(); ctx.strokeStyle = th.ghost; ctx.lineWidth = px * 1.2; ctx.setLineDash([8 * px, 5 * px]);
      ctx.strokeRect(v.crop.x1, v.crop.y1, v.crop.x2 - v.crop.x1, v.crop.y2 - v.crop.y1); ctx.restore();
    }
    drawHandles(ctx, p, this.viewId(), this.sel, { ...o, px });
    const tool = this.plan.tool;
    if (this.annTool && tool.startsWith("a:")) this.annTool.draw(ctx, { ...o, px });
    const cur = this.cursor;
    if (tool === "v:section" && this.sectionStart && cur) {
      ctx.save(); ctx.strokeStyle = th.select; ctx.lineWidth = 2 * px; ctx.setLineDash([10 * px, 4 * px, 2 * px, 4 * px]);
      ctx.beginPath(); ctx.moveTo(...this.sectionStart); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
      // Look direction preview (left of the drawn direction).
      const L = Math.hypot(cur[0] - this.sectionStart[0], cur[1] - this.sectionStart[1]) || 1;
      const n = [(cur[1] - this.sectionStart[1]) / L, -(cur[0] - this.sectionStart[0]) / L];
      const m = [(cur[0] + this.sectionStart[0]) / 2, (cur[1] + this.sectionStart[1]) / 2];
      ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(...m); ctx.lineTo(m[0] + n[0] * 40 * px, m[1] + n[1] * 40 * px); ctx.stroke();
      ctx.restore();
    }
    if (tool === "v:callout" && this.calloutStart && cur) {
      ctx.save(); ctx.strokeStyle = th.select; ctx.lineWidth = 1.5 * px; ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeRect(Math.min(this.calloutStart[0], cur[0]), Math.min(this.calloutStart[1], cur[1]), Math.abs(cur[0] - this.calloutStart[0]), Math.abs(cur[1] - this.calloutStart[1]));
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- pointer
  pointer(type, e, x, y) {
    const tool = this.plan.tool;
    if (type === "leave") return false;
    if (this.isOwnTool(tool)) {
      if (type === "context") { this.plan.setTool("select"); return true; }
      if (tool.startsWith("a:")) {
        if (!this.annTool || this.annTool.kind !== tool.slice(2)) this.annTool = new AnnotationTool(this.host(), tool.slice(2));
        return this.annTool.pointer(type, e, x, y);
      }
      const s = this.plan.snapAt(x, y, { onWall: false, from: this.sectionStart, ortho: this.plan.ortho && !e.shiftKey });
      this.cursor = [s.x, s.y];
      if (type === "move") { this.plan.request(); return true; }
      if (tool === "v:section" && type === "down" && e.button === 0) {
        if (!this.sectionStart) { this.sectionStart = [s.x, s.y]; return true; }
        const a = this.sectionStart, b = [s.x, s.y];
        this.sectionStart = null;
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 200) return true;
        this.createView(makeSection(this.p, a, b), t("Add section"));
        return true;
      }
      if (tool === "v:elevation" && type === "down" && e.button === 0) { this.createView(makeElevation(this.p, s.x, s.y), t("Add elevation")); return true; }
      if (tool === "v:callout") {
        if (type === "down" && e.button === 0) { if (!this.calloutStart) { this.calloutStart = [s.x, s.y]; this.calloutDown = performance.now(); } else this.finishCallout([s.x, s.y]); return true; }
        if (type === "up" && this.calloutStart && performance.now() - this.calloutDown > 250 && Math.hypot(s.x - this.calloutStart[0], s.y - this.calloutStart[1]) > 300) { this.finishCallout([s.x, s.y]); return true; }
        return true;
      }
      return true;
    }
    if (tool !== "select") return false;
    const tol = this.plan.tol();
    const S = this.scale();
    if (type === "move") {
      if (this.drag) { this.dragTo(x, y); return true; }
      const over = hitMarker(this.p, this.view(), x, y, tol, S) || pickAnnotation(this.p, this.viewId(), x, y, tol, this.annOpts(this.app.planPalette()), this.sel);
      if (over) { this.plan.canvas.style.cursor = "move"; if (this.plan.hover) { this.plan.hover = null; this.plan.request(); } return true; }
      return false;
    }
    if (type === "down" && e.button === 0) {
      const m = hitMarker(this.p, this.view(), x, y, tol, S);
      const an = m ? null : pickAnnotation(this.p, this.viewId(), x, y, tol, this.annOpts(this.app.planPalette()), this.sel);
      if (!m && !an) { if (this.sel.size) { this.sel.clear(); this.app.queueInspector(); this.plan.request(); } return false; }
      const id = m ? m.view.id : an.a.id;
      if (e.shiftKey || e.ctrlKey) { if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id); }
      else if (!this.sel.has(id)) this.sel = new Set([id]);
      this.plan.clearSelection();
      this.drag = { start: [x, y], marker: m, ann: an, moved: false, dd: an ? dragAnnotations(this.app.store, new Set([...this.sel].filter((k) => !viewById(this.p, k))), an.handle !== undefined ? { id: an.a.id, index: an.handle } : null, [x, y]) : null };
      this.app.queueInspector();
      this.plan.request();
      return true;
    }
    if (type === "up" && this.drag) {
      const d = this.drag;
      this.drag = null;
      if (d.dd) d.dd.end();
      if (d.moved && d.marker) this.app.store.commit();
      this.plan.request();
      return true;
    }
    if (type === "dblclick") {
      const m = hitMarker(this.p, this.view(), x, y, tol, S);
      if (m) { this.app.views.open(m.view.id); return true; }
      const an = pickAnnotation(this.p, this.viewId(), x, y, tol, this.annOpts(this.app.planPalette()));
      if (an) { this.editAnnotation(an.a, e); return true; }
      return false;
    }
    if (type === "context") {
      const m = hitMarker(this.p, this.view(), x, y, tol, S);
      const an = m ? null : pickAnnotation(this.p, this.viewId(), x, y, tol, this.annOpts(this.app.planPalette()));
      if (!m && !an) return false;
      const id = m ? m.view.id : an.a.id;
      if (!this.sel.has(id)) this.sel = new Set([id]);
      this.plan.request();
      contextMenu([...this.app.undoMenuItems(), "-", ...(m ? this.app.views.viewMenuItems(m.view) : this.annotationMenu(an.a, e))], e.clientX, e.clientY);
      return true;
    }
    return false;
  }

  dragTo(x, y) {
    const d = this.drag;
    if (!d.moved && Math.hypot(x - d.start[0], y - d.start[1]) * this.plan.vp.scale < 4) return;
    if (d.dd) { d.moved = true; d.dd.move(x, y); this.plan.request(); return; }
    const store = this.app.store;
    if (!d.moved) { d.moved = true; store.begin(t("Move marker")); d.orig = JSON.parse(JSON.stringify(viewById(this.p, d.marker.view.id))); }
    const v = ensureView(store.project, d.marker.view.id);
    const s = this.plan.snapAt(x, y, { onWall: false });
    const dx = s.x - d.start[0], dy = s.y - d.start[1];
    const o = d.orig;
    if (v.kind === "section") {
      if (d.marker.part === "a") { v.line.x1 = s.x; v.line.y1 = s.y; }
      else if (d.marker.part === "b") { v.line.x2 = s.x; v.line.y2 = s.y; }
      else v.line = { x1: o.line.x1 + dx, y1: o.line.y1 + dy, x2: o.line.x2 + dx, y2: o.line.y2 + dy };
      if (v.crop && (d.marker.part === "a" || d.marker.part === "b")) v.crop = { ...v.crop, x1: 0, x2: Math.hypot(v.line.x2 - v.line.x1, v.line.y2 - v.line.y1) };
    } else if (v.kind === "elevation") { v.x = o.x + dx; v.y = o.y + dy; }
    else if (v.kind === "detail") {
      const c = { ...o.crop };
      if (d.marker.part === "corner") {
        const i = d.marker.index;
        if (i === 0 || i === 3) c.x1 = s.x; else c.x2 = s.x;
        if (i === 0 || i === 1) c.y1 = s.y; else c.y2 = s.y;
      } else { c.x1 += dx; c.x2 += dx; c.y1 += dy; c.y2 += dy; }
      v.crop = c;
    }
    store.preview();
    this.plan.request();
  }

  finishCallout(b) {
    const a = this.calloutStart;
    this.calloutStart = null;
    if (Math.abs(b[0] - a[0]) < 200 || Math.abs(b[1] - a[1]) < 200) return;
    const n = allViews(this.p).filter((v) => v.kind === "detail").length + 1;
    const v = newView("detail", { name: `Detail ${n}`, ref: `D${n}`, parent: this.viewId(), crop: { x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]), x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]) }, cropOn: true, scale: 20, detail: "fine" });
    this.createView(v, t("Add callout"));
  }

  createView(v, label) {
    this.app.store.edit(label, (p) => { p.views.push(v); });
    this.sel = new Set([v.id]);
    this.plan.setTool("select");
    this.app.renderLeft();
    toast(t("{name} created. Double-click its marker (or the Project Browser entry) to open it.", { name: displayName(v.name) }), "ok", 4000);
    this.app.queueInspector();
  }

  editAnnotation(a, e) {
    if (a.kind === "note" || a.kind === "keynote") {
      popupInput({ x: e.clientX, y: e.clientY, value: a.kind === "note" ? a.text : `${a.key} ${a.text || ""}`.trim(), onDone: (v) => { if (v === null) return; this.app.store.edit(t("Edit text"), (p) => { const q = p.annotations.find((x) => x.id === a.id); if (a.kind === "note") q.text = v; else { q.key = v.split(/\s+/)[0]; q.text = v.split(/\s+/).slice(1).join(" "); } }); } });
    } else if (a.kind === "tag") {
      const it = findItem(this.p, a.target);
      if (it) this.app.editProperties(it.kind, it.obj);
    } else this.app.views.annotationProperties(a);
  }

  annotationMenu(a, e) {
    return [
      { label: t("Properties…"), icon: "settings", action: () => this.app.views.annotationProperties(a) },
      ...(a.kind === "note" || a.kind === "keynote" ? [{ label: t("Edit text"), icon: "text", action: () => this.editAnnotation(a, e) }] : []),
      ...(a.kind === "tag" ? [{ label: a.leader ? t("Hide leader") : t("Show leader"), icon: "line", action: () => this.app.store.edit(t("Tag leader"), (p) => { const q = p.annotations.find((x) => x.id === a.id); q.leader = !q.leader; if (q.leader && !q.dx && !q.dy) { q.dx = 8 * this.scale(); q.dy = -8 * this.scale(); } }) }] : []),
      "-", { label: t("Delete"), icon: "trash", danger: true, shortcut: "Del", action: () => this.deleteSelected() },
    ];
  }

  deleteSelected() {
    if (!this.sel.size) return false;
    const ids = new Set(this.sel);
    this.app.views.deleteIds(ids);
    this.sel.clear();
    this.plan.request();
    return true;
  }

  key(e) {
    const tool = this.plan.tool;
    if (this.isOwnTool(tool)) {
      if (this.annTool && tool.startsWith("a:")) return this.annTool.key(e);
      if (e.key === "Escape") { if (this.sectionStart || this.calloutStart) { this.sectionStart = this.calloutStart = null; this.plan.request(); } else this.plan.setTool("select"); return true; }
      return false;
    }
    if (this.sel.size && (e.key === "Delete" || e.key === "Backspace")) return this.deleteSelected();
    if (this.sel.size && e.key === "Escape") { this.sel.clear(); this.app.queueInspector(); this.plan.request(); return true; }
    return false;
  }

  clear() { this.sel.clear(); this.drag = null; this.sectionStart = this.calloutStart = null; }
}
