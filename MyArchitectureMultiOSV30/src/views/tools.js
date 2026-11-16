// Annotation tools shared by the floor-plan editor and the views editor:
// click sequences that create dimensions (aligned, linear, chained, angular,
// radial, arc length), spot elevations, notes with leaders, tags, keynotes,
// symbols, revision clouds, filled / masking regions and detail lines, plus
// selecting, moving and reshaping annotations.
//
// host: {store, t, viewId(), scale(), snap(x, y) → [x, y], tagTarget(x, y)
//        → element id | null, request(), setHint(s), done(), popup(x, y, value,
//        cb), revision() → id | null, units, toolOpts}

import { newAnnotation, annotationsOf } from "./model.js";
import { drawAnnotation, hitAnnotation, handlesOf, moveAnnotation } from "./annot.js";

export const TOOL_DEFS = {
  dim: { icon: "dimension", label: "Aligned dimension", hint: "Click two points, then click to place the dimension line." },
  dimlin: { icon: "dimension", label: "Linear dimension", hint: "Click two points, then move up/down (horizontal) or sideways (vertical) and click." },
  chain: { icon: "dimension", label: "Chained dimension", hint: "Click each point of the chain; Enter or double-click, then click to place the line." },
  angle: { icon: "measure", label: "Angular dimension", hint: "Click the vertex, then a point on each leg." },
  radius: { icon: "measure", label: "Radial dimension", hint: "Click the centre, then a point on the arc (Shift = diameter)." },
  arclen: { icon: "measure", label: "Arc length dimension", hint: "Click the centre, the arc start and the arc end." },
  spot: { icon: "levels", label: "Spot elevation", hint: "Click a point: its height is read from the model." },
  note: { icon: "text", label: "Text with leader", hint: "Click the arrow point, then where the text goes (click the same spot for no leader) and type." },
  tag: { icon: "label", label: "Tag", hint: "Click a room, door, window, wall or furniture to tag it with its parameters." },
  keynote: { icon: "label", label: "Keynote", hint: "Click the arrow point, then the keynote position, and type the key." },
  symbol: { icon: "plus", label: "Symbol", hint: "Click to place the symbol (north arrow, arrow, break line, centre mark)." },
  cloud: { icon: "highlight", label: "Revision cloud", hint: "Click the corners of the cloud; Enter or clicking the first point closes it." },
  region: { icon: "zone", label: "Filled region", hint: "Click the corners of the region; Enter or clicking the first point closes it." },
  mask: { icon: "zone", label: "Masking region", hint: "Click the corners of the area to mask; Enter or clicking the first point closes it." },
  line: { icon: "line", label: "Detail line", hint: "Click the points of the line; Enter or double-click ends." },
};
export const TOOL_IDS = Object.keys(TOOL_DEFS);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class AnnotationTool {
  constructor(host, kind) {
    this.host = host;
    this.kind = kind;
    this.pts = [];
    this.cursor = null;
    this.stage = 0;
  }

  add(a, label) {
    const h = this.host;
    h.store.edit(h.t(label || "Add annotation"), (p) => { p.annotations = p.annotations || []; p.annotations.push(a); });
    this.pts = [];
    this.stage = 0;
    if (h.created) h.created(a);
    h.request();
  }

  base(props) { return newAnnotation(this.host.viewId(), this.kind, props); }

  // Distance from the line through a, b (signed, along its left normal).
  offsetOf(a, b, q, kind) {
    let d;
    if (kind === "dimlin") d = this.axis === "y" ? [0, 1] : [1, 0];
    else { const L = dist(a, b) || 1; d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; }
    const n = [-d[1], d[0]];
    const an = a[0] * n[0] + a[1] * n[1], bn = b[0] * n[0] + b[1] * n[1];
    const qn = q[0] * n[0] + q[1] * n[1];
    const hi = Math.max(an, bn), lo = Math.min(an, bn);
    return qn >= (hi + lo) / 2 ? Math.max(0, qn - hi) : Math.min(-1e-6, qn - lo);
  }

  finishPoly() {
    const k = this.kind;
    const n = this.pts.length;
    if (k === "line" && n >= 2) this.add(this.base({ pts: this.pts.slice(), style: this.host.toolOpts().style || "medium" }), "Add detail line");
    else if (k === "chain" && n >= 2) { this.stage = 2; return; }
    else if ((k === "cloud" || k === "region" || k === "mask") && n >= 3) {
      const props = { pts: this.pts.slice() };
      if (k === "cloud") props.rev = this.host.revision();
      if (k === "region") { props.pattern = this.host.toolOpts().pattern || "hatch"; props.border = "thin"; }
      this.add(this.base(props), k === "cloud" ? "Add revision cloud" : k === "mask" ? "Add masking region" : "Add filled region");
    }
    this.pts = [];
    this.host.request();
  }

  // → true when the event was used.
  pointer(type, e, x, y) {
    const h = this.host;
    const S = h.scale();
    const q = h.snap(x, y, e);
    this.cursor = q;
    const k = this.kind;
    if (type === "move") {
      if (k === "dimlin" && this.pts.length === 2) this.axis = Math.abs(q[0] - (this.pts[0][0] + this.pts[1][0]) / 2) > Math.abs(q[1] - (this.pts[0][1] + this.pts[1][1]) / 2) ? "y" : "x";
      h.request();
      return true;
    }
    if (type === "dblclick") { if (["line", "chain", "cloud", "region", "mask"].includes(k)) this.finishPoly(); return true; }
    if (type !== "down" || e.button !== 0) return type === "up";
    const P = [q[0], q[1]];
    if (k === "dim" || k === "dimlin") {
      if (this.pts.length < 2) { this.pts.push(P); if (this.pts.length === 2 && k === "dimlin") this.axis = "x"; h.request(); return true; }
      const [a, b] = this.pts;
      this.add(this.base({ pts: [a, b], offset: this.offsetOf(a, b, P, k), axis: k === "dimlin" ? this.axis : undefined }), "Add dimension");
      return true;
    }
    if (k === "chain") {
      if (this.stage === 2) {
        const a = this.pts[0], b = this.pts[1];
        const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        this.add(this.base({ pts: this.pts.slice(), angle, offset: this.offsetOf(a, b, P, "dim") }), "Add dimension");
        return true;
      }
      if (this.pts.length && dist(this.pts[this.pts.length - 1], P) < 1e-6) return true;
      this.pts.push(P); h.request(); return true;
    }
    if (k === "angle" || k === "arclen") {
      this.pts.push(P);
      if (this.pts.length === 3) {
        const [c, a, b] = this.pts;
        this.add(this.base(k === "angle" ? { c, a, b, r: Math.max(8 * S, Math.min(dist(c, a), dist(c, b)) * 0.5) } : { c, a, b }), "Add dimension");
      } else h.request();
      return true;
    }
    if (k === "radius") {
      this.pts.push(P);
      if (this.pts.length === 2) this.add(this.base({ c: this.pts[0], p: this.pts[1], diameter: !!e.shiftKey }), "Add dimension");
      return true;
    }
    if (k === "spot") { this.add(this.base({ x: P[0], y: P[1], dx: 8 * S, dy: -6 * S }), "Add spot elevation"); return true; }
    if (k === "symbol") { this.add(this.base({ x: P[0], y: P[1], sym: h.toolOpts().sym || "north", size: 10, rot: 0 }), "Add symbol"); return true; }
    if (k === "tag") {
      const target = h.tagTarget(x, y);
      if (!target) { h.setHint(h.t("Nothing to tag here: click a room, door, window, wall or furniture.")); return true; }
      if (annotationsOf(h.store.project, h.viewId()).some((a) => a.kind === "tag" && a.target === target)) { h.setHint(h.t("This element is already tagged in this view.")); return true; }
      this.add(this.base({ target, dx: 0, dy: 0, leader: false, template: h.toolOpts().template || undefined }), "Add tag");
      return true;
    }
    if (k === "note" || k === "keynote") {
      this.pts.push(P);
      if (this.pts.length < 2) { h.request(); return true; }
      const [tip, at] = this.pts;
      const leader = dist(tip, at) > 2 * S ? [tip] : [];
      this.pts = [];
      h.popup(e, "", (txt) => {
        if (!txt) { h.request(); return; }
        if (k === "note") this.add(this.base({ x: at[0], y: at[1], text: txt, size: 2.5, leader }), "Add text");
        else this.add(this.base({ x: at[0], y: at[1], key: txt.split(/\s+/)[0], text: txt.split(/\s+/).slice(1).join(" "), leader }), "Add keynote");
      });
      return true;
    }
    // Polylines: line, cloud, region, mask.
    if (this.pts.length >= 3 && k !== "line" && dist(this.pts[0], P) <= 8 * h.px()) { this.finishPoly(); return true; }
    if (this.pts.length && dist(this.pts[this.pts.length - 1], P) < 1e-6) return true;
    this.pts.push(P);
    h.request();
    return true;
  }

  key(e) {
    if (e.key === "Enter") { if (["line", "chain", "cloud", "region", "mask"].includes(this.kind)) this.finishPoly(); return true; }
    if (e.key === "Backspace" && this.pts.length) { this.pts.pop(); this.host.request(); return true; }
    if (e.key === "Escape") {
      if (this.pts.length || this.stage) { this.pts = []; this.stage = 0; this.host.request(); return true; }
      this.host.done();
      return true;
    }
    return false;
  }

  // Preview of the annotation being made.
  draw(ctx, o) {
    const c = this.cursor;
    const pts = [...this.pts];
    ctx.save();
    ctx.strokeStyle = o.select || "#1a73e8";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.5 * o.px;
    const k = this.kind;
    if (c && (k === "dim" || k === "dimlin") && pts.length === 2) {
      drawAnnotation(ctx, { kind: k, pts, offset: this.offsetOf(pts[0], pts[1], c, k), axis: this.axis }, { ...o, ink: ctx.strokeStyle });
    } else if (c && k === "chain" && this.stage === 2) {
      const a = pts[0], b = pts[1];
      drawAnnotation(ctx, { kind: "chain", pts, angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, offset: this.offsetOf(a, b, c, "dim") }, { ...o, ink: ctx.strokeStyle });
    } else if (pts.length) {
      ctx.beginPath();
      [...pts, ...(c ? [c] : [])].forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      if (["cloud", "region", "mask"].includes(k) && pts.length >= 2) ctx.closePath();
      ctx.setLineDash([6 * o.px, 4 * o.px]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const q of pts) { ctx.beginPath(); ctx.arc(q[0], q[1], 3.5 * o.px, 0, Math.PI * 2); ctx.fill(); }
    if (c) { ctx.beginPath(); ctx.moveTo(c[0] - 6 * o.px, c[1]); ctx.lineTo(c[0] + 6 * o.px, c[1]); ctx.moveTo(c[0], c[1] - 6 * o.px); ctx.lineTo(c[0], c[1] + 6 * o.px); ctx.stroke(); }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- selection
// Top annotation of a view under (x, y) → {a, handle?}
export function pickAnnotation(p, viewId, x, y, tol, o, selected = null) {
  const list = annotationsOf(p, viewId);
  // Handles of selected annotations first.
  if (selected) {
    for (const a of list) {
      if (!selected.has(a.id)) continue;
      const hs = handlesOf(a);
      for (let i = 0; i < hs.length; i++) { const q = hs[i].get(); if (q && Math.hypot(q[0] - x, q[1] - y) <= tol * 1.4) return { a, handle: i }; }
    }
  }
  for (let i = list.length - 1; i >= 0; i--) if (hitAnnotation(list[i], x, y, tol, o)) return { a: list[i] };
  return null;
}

export function drawHandles(ctx, p, viewId, selected, o) {
  ctx.save();
  ctx.fillStyle = o.bg || "#ffffff";
  ctx.strokeStyle = o.select || "#1a73e8";
  ctx.lineWidth = 1.5 * o.px;
  for (const a of annotationsOf(p, viewId)) {
    if (!selected.has(a.id)) continue;
    for (const hd of handlesOf(a)) {
      const q = hd.get();
      if (!q) continue;
      ctx.beginPath(); ctx.rect(q[0] - 4 * o.px, q[1] - 4 * o.px, 8 * o.px, 8 * o.px); ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

// Drag state for moving / reshaping annotations inside store.begin/commit.
export function dragAnnotations(store, ids, handle, start) {
  let applied = [0, 0];
  let begun = false;
  return {
    move(x, y, label = "Move annotation") {
      if (!begun) { store.begin(label); begun = true; }
      const p = store.project;
      if (handle) {
        const a = (p.annotations || []).find((q) => q.id === handle.id);
        if (a) { const hs = handlesOf(a); if (hs[handle.index]) hs[handle.index].set([x, y]); }
      } else {
        const dx = x - start[0] - applied[0], dy = y - start[1] - applied[1];
        for (const a of p.annotations || []) if (ids.has(a.id)) moveAnnotation(a, dx, dy);
        applied = [x - start[0], y - start[1]];
      }
      store.preview();
    },
    end() { if (begun) store.commit(); },
    get begun() { return begun; },
  };
}
