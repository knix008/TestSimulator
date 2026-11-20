// Editing a sketch in the graphics area (SolidWorks' sketch mode): draw lines, rectangles, circles,
// arcs, polygons, slots, points and centerlines on the sketch plane; ends snap to existing points
// (shared = coincident) and onto curves; drag geometry and the solver keeps the relations; Smart
// Dimension adds driving dimensions shown as labels (double click to change the value). Geometry is
// black when fully defined, blue while it can still move, red when over defined.
import * as THREE from 'three';
import {
  addArc, addCenterRectangle, addCircle, addConstraint, addLine, addPolygon, addRectangle, addSlot, analyse, arcGeometry, arcThrough, autoRelationsForLine,
  byId, dimensionFor, hitTest, mergePoints, ORIGIN, pointsOf, polyline, removeEntities, solveSketch, newSketchId, DIMENSIONS, measure,
} from '../cad/sketch.js';
import { toWorld, toSketch } from '../cad/features.js';

export const SKETCH_TOOLS = ['select', 'line', 'centerline', 'rect', 'centerRect', 'circle', 'arc3', 'centerArc', 'polygon', 'slot', 'point', 'dimension', 'trim'];

const COLORS = { defined: '#111827', under: '#1f5fd6', over: '#d4282f', construction: '#7a8798', selected: '#18a058', hover: '#f28c1e', preview: '#f28c1e', point: '#1f5fd6' };

export class SketchEditor {
  constructor(api, feature, frame) {
    this.api = api;
    this.feature = feature;
    this.frame = frame;
    this.tool = 'select';
    this.selection = [];
    this.hover = null;
    this.pending = [];
    this.cursor = null;
    this.status = {};
    this.dof = 0;
    this.polygonSides = 6;
    this.chain = null;
    this.solve();
  }

  get sketch() { return this.feature; }

  /** After an edit: redraw, then tell the app (PropertyManager, status bar). */
  commit(label) { this.render(); this.api.changed?.(label); }
  get viewport() { return this.api.viewport; }

  setTool(tool) {
    this.tool = SKETCH_TOOLS.includes(tool) ? tool : 'select';
    this.pending = [];
    this.chain = null;
    if (this.tool !== 'select' && this.tool !== 'dimension') this.selection = [];
    this.render();
    this.api.onState?.();
  }

  /** Re-solves and refreshes the colours (after any change). */
  solve(options = {}) {
    const r = solveSketch(this.sketch, options);
    this.status = r.status;
    this.dof = r.dof;
    this.over = r.over || !r.ok;
    return r;
  }

  analyseOnly() { const r = analyse(this.sketch); this.status = r.status; this.dof = r.dof; this.over = r.over; }

  // ───────────────────────── coordinates

  /** Sketch coordinates under the pointer (on the sketch plane). */
  toPlane(e) {
    const ray = this.viewport.rayAt(e.clientX, e.clientY).ray;
    const f = this.frame;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...f.normal), new THREE.Vector3(...f.origin));
    const p = ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return null;
    return toSketch(f, p.toArray());
  }

  world(u, v) { return toWorld(this.frame, [u, v]); }
  tol() { return this.viewport.pixelSize() * 7; }

  /** The point or curve the pointer would snap to: { kind: 'point', id, x, y } | { kind: 'curve', id, x, y } | grid point. */
  snapAt(e, { skip = null } = {}) {
    const p = this.toPlane(e);
    if (!p) return null;
    const [x, y] = p;
    const tol = this.tol();
    let best = null;
    for (const ent of this.sketch.entities) {
      if (ent.type !== 'point' || skip?.has(ent.id)) continue;
      const d = Math.hypot(ent.x - x, ent.y - y);
      if (d < tol && (!best || d < best.d)) best = { kind: 'point', id: ent.id, x: ent.x, y: ent.y, d };
    }
    if (best) return best;
    // Midpoints of lines.
    for (const ent of this.sketch.entities) {
      if (ent.type !== 'line' || skip?.has(ent.id)) continue;
      const a = byId(this.sketch, ent.p1); const b = byId(this.sketch, ent.p2);
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      if (Math.hypot(mx - x, my - y) < tol) return { kind: 'mid', id: ent.id, x: mx, y: my };
    }
    const hit = hitTest(this.sketch, x, y, tol * 0.8, { skip });
    if (hit) {
      const ent = byId(this.sketch, hit.id);
      if (ent.type === 'line' || ent.type === 'circle' || ent.type === 'arc') {
        const q = closestOn(this.sketch, ent, x, y);
        return { kind: 'curve', id: ent.id, x: q[0], y: q[1] };
      }
    }
    // Grid snap (Settings › Snap to grid).
    if (this.api.settings().snapToGrid) {
      const g = this.gridStep();
      return { kind: 'free', x: Math.round(x / g) * g, y: Math.round(y / g) * g };
    }
    return { kind: 'free', x, y };
  }

  /** A new point at a snap: an existing point (shared), on a curve (relation added) or free. */
  pointAt(snap) {
    if (snap.kind === 'point') return snap.id;
    const p = { id: newSketchId('p'), type: 'point', x: snap.x, y: snap.y };
    this.sketch.entities.push(p);
    if (snap.kind === 'curve') {
      const ent = byId(this.sketch, snap.id);
      addConstraint(this.sketch, { type: ent.type === 'line' ? 'pointOnLine' : 'pointOnCircle', a: p.id, b: ent.id });
    } else if (snap.kind === 'mid') addConstraint(this.sketch, { type: 'midpoint', a: p.id, b: snap.id });
    return p.id;
  }

  gridStep() {
    const px = this.viewport.pixelSize() * 24;
    const pow = 10 ** Math.floor(Math.log10(px));
    return [1, 2, 5, 10].map((k) => k * pow).find((v) => v >= px) ?? pow * 10;
  }

  // ───────────────────────── pointer (Viewport calls these while the sketch is open)

  down(e) {
    if (e.button !== 0) return false;
    if (this.tool === 'select') {
      const hit = this.pickEntity(e);
      if (hit && byId(this.sketch, hit)?.type === 'point' && !byId(this.sketch, hit).fixed) {
        this.drag = { id: hit, moved: false };
        return true;
      }
      if (hit && ['line', 'circle', 'arc'].includes(byId(this.sketch, hit)?.type)) {
        const p = this.toPlane(e);
        this.drag = { id: hit, entity: true, from: p, moved: false, start: this.snapshot() };
        return true;
      }
      return false;
    }
    return false;
  }

  move(e) {
    if (this.drag) {
      const p = this.toPlane(e);
      if (!p) return true;
      this.drag.moved = true;
      if (this.drag.entity) this.dragEntity(p);
      else this.solve({ drag: { id: this.drag.id, x: p[0], y: p[1] } });
      this.render();
      return true;
    }
    if (this.tool === 'select' || this.tool === 'dimension' || this.tool === 'trim') {
      const id = this.pickEntity(e);
      if (id !== this.hover) { this.hover = id; this.render(); }
      return true;
    }
    this.cursor = this.snapAt(e);
    this.render();
    return true;
  }

  up() {
    const d = this.drag;
    this.drag = null;
    if (d?.moved) this.commit('op.dragSketch');
    else if (d) this.selectEntity(d.id, false);
    return true;
  }

  /** Moving a whole curve: every free point of it moves by the pointer's step, then the relations are solved. */
  dragEntity(p) {
    const dx = p[0] - this.drag.from[0]; const dy = p[1] - this.drag.from[1];
    this.restore(this.drag.start);
    const ent = byId(this.sketch, this.drag.id);
    for (const id of pointsOf(ent)) { const q = byId(this.sketch, id); if (!q.fixed) { q.x += dx; q.y += dy; } }
    const first = pointsOf(ent).map((id) => byId(this.sketch, id)).find((q) => !q.fixed);
    this.solve(first ? { drag: { id: first.id, x: first.x, y: first.y } } : {});
  }

  snapshot() { return this.sketch.entities.map((e) => ({ id: e.id, x: e.x, y: e.y, r: e.r })); }
  restore(snap) { for (const s of snap) { const e = byId(this.sketch, s.id); if (e) { if (s.x != null) { e.x = s.x; e.y = s.y; } if (s.r != null) e.r = s.r; } } }

  pickEntity(e) {
    const p = this.toPlane(e);
    if (!p) return null;
    return hitTest(this.sketch, p[0], p[1], this.tol())?.id ?? null;
  }

  click(e) {
    if (this.tool === 'select') {
      const id = this.pickEntity(e);
      if (!id) { if (!e.shiftKey && !e.ctrlKey) { this.selection = []; this.render(); this.api.onState?.(); } return true; }
      this.selectEntity(id, e.shiftKey || e.ctrlKey || e.metaKey);
      return true;
    }
    if (this.tool === 'dimension') return this.dimensionClick(e);
    if (this.tool === 'trim') {
      const id = this.pickEntity(e);
      if (id && id !== ORIGIN) { removeEntities(this.sketch, [id]); this.solve(); this.commit('op.trim'); }
      return true;
    }
    const snap = this.snapAt(e);
    if (!snap) return true;
    this.pending.push(snap);
    this.place();
    return true;
  }

  selectEntity(id, add) {
    if (add) this.selection = this.selection.includes(id) ? this.selection.filter((x) => x !== id) : [...this.selection, id];
    else this.selection = [id];
    this.render();
    this.api.onState?.();
  }

  /** Esc: finishes a chain of lines, then drops the tool. */
  escape() {
    if (this.pending.length || this.chain) { this.pending = []; this.chain = null; this.render(); return true; }
    if (this.tool !== 'select') { this.setTool('select'); return true; }
    if (this.selection.length) { this.selection = []; this.render(); this.api.onState?.(); return true; }
    return false;
  }

  deleteSelection() {
    const ids = this.selection.filter((id) => id !== ORIGIN);
    if (!ids.length) return false;
    const dims = ids.filter((id) => this.sketch.constraints.some((c) => c.id === id));
    this.sketch.constraints = this.sketch.constraints.filter((c) => !dims.includes(c.id));
    removeEntities(this.sketch, ids.filter((id) => !dims.includes(id)));
    this.selection = [];
    this.solve();
    this.commit('op.delete');
    return true;
  }

  // ───────────────────────── drawing tools

  place() {
    const s = this.sketch;
    const P = this.pending;
    const tool = this.tool;
    const done = (label) => { this.pending = []; this.solve(); this.commit(label); };
    if (tool === 'point') { const id = this.pointAt(P[0]); const p = byId(s, id); p.standalone = true; return done('op.point'); }
    if (tool === 'line' || tool === 'centerline') {
      if (P.length < 2) { this.chain = this.chain ?? null; this.render(); return undefined; }
      const [a, b] = P;
      if (Math.hypot(a.x - b.x, a.y - b.y) < this.tol() * 0.3) { P.pop(); return undefined; }
      const from = this.chain ?? this.pointAt(a);
      const to = this.pointAt(b);
      const line = addLine(s, 0, 0, 0, 0, { from, to, construction: tool === 'centerline' });
      autoRelationsForLine(s, line);
      // Lines chain: the next one starts where this one ended (until Esc or a click on an existing point).
      const closed = b.kind === 'point';
      this.pending = closed || tool === 'centerline' ? [] : [b];
      this.chain = closed || tool === 'centerline' ? null : line.p2;
      this.solve();
      this.commit('op.line');
      return undefined;
    }
    if (tool === 'rect' && P.length === 2) {
      const [a, b] = P;
      const lines = addRectangle(s, a.x, a.y, b.x, b.y);
      if (a.kind === 'point') mergePoints(s, lines[0].p1, a.id);
      if (b.kind === 'point') mergePoints(s, lines[1].p2, b.id);
      return done('op.rectangle');
    }
    if (tool === 'centerRect' && P.length === 2) {
      const [c, b] = P;
      const { center } = addCenterRectangle(s, c.x, c.y, Math.abs(b.x - c.x), Math.abs(b.y - c.y));
      if (c.kind === 'point') mergePoints(s, center.id, c.id);
      return done('op.rectangle');
    }
    if (tool === 'circle' && P.length === 2) {
      const [c, b] = P;
      const circle = addCircle(s, c.x, c.y, Math.hypot(b.x - c.x, b.y - c.y));
      if (c.kind === 'point') mergePoints(s, circle.c, c.id);
      if (b.kind === 'point' || b.kind === 'curve') { const id = this.pointAt(b); addConstraint(s, { type: 'pointOnCircle', a: id, b: circle.id }); }
      return done('op.circle');
    }
    if (tool === 'arc3' && P.length === 3) {
      const [a, b, m] = P;
      const from = this.pointAt(a); const to = this.pointAt(b);
      const arc = arcThrough(s, [a.x, a.y], [m.x, m.y], [b.x, b.y], { from, to });
      if (!arc) { this.pending = []; this.api.notify?.('info', this.api.t('sketch.arcInLine')); return undefined; }
      return done('op.arc');
    }
    if (tool === 'centerArc' && P.length === 3) {
      const [c, a, b] = P;
      const r = Math.hypot(a.x - c.x, a.y - c.y);
      const a0 = Math.atan2(a.y - c.y, a.x - c.x); const a1 = Math.atan2(b.y - c.y, b.x - c.x);
      const center = c.kind === 'point' ? c.id : null;
      const arc = addArc(s, c.x, c.y, r, a0, a1, { center, from: a.kind === 'point' ? a.id : null });
      void arc;
      return done('op.arc');
    }
    if (tool === 'polygon' && P.length === 2) {
      const [c, b] = P;
      const r = Math.hypot(b.x - c.x, b.y - c.y);
      const { circle } = addPolygon(s, c.x, c.y, r, this.polygonSides, Math.atan2(b.y - c.y, b.x - c.x));
      if (c.kind === 'point') mergePoints(s, circle.c, c.id);
      return done('op.polygon');
    }
    if (tool === 'slot' && P.length === 3) {
      const [a, b, w] = P;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len; const ny = (b.x - a.x) / len;
      const r = Math.max(this.tol(), Math.abs((w.x - a.x) * nx + (w.y - a.y) * ny));
      addSlot(s, a.x, a.y, b.x, b.y, r);
      return done('op.slot');
    }
    this.render();
    return undefined;
  }

  // ───────────────────────── smart dimension

  dimensionClick(e) {
    const id = this.pickEntity(e);
    if (id) {
      // Pick one or two entities; a single line, circle or arc is dimensioned at once.
      this.selection = this.selection.includes(id) ? this.selection : [...this.selection, id].slice(-2);
      const ents = this.selection.map((x) => byId(this.sketch, x));
      const single = ents.length === 1 && ['line', 'circle', 'arc'].includes(ents[0].type);
      if (single && !e.shiftKey) {
        this.render();
        this.pendingDimensionAt = Date.now();
        clearTimeout(this.dimTimer);
        // A second pick soon after makes it a two-entity dimension instead.
        this.dimTimer = setTimeout(() => { if (this.selection.length === 1) this.createDimension(); }, 350);
        return true;
      }
      if (ents.length === 2) { clearTimeout(this.dimTimer); this.createDimension(); return true; }
      this.render();
      return true;
    }
    this.selection = [];
    this.render();
    return true;
  }

  async createDimension(kind = 'auto') {
    const c = dimensionFor(this.sketch, this.selection, kind);
    this.selection = [];
    if (!c) { this.render(); return; }
    const value = await this.api.askValue({ type: c.type, value: c.value });
    if (value == null) { this.render(); return; }
    c.value = value;
    const added = addConstraint(this.sketch, c);
    const r = this.solve();
    if (!r.ok) {
      // Over defined: the dimension becomes a reference (driven) one, like SolidWorks offers.
      added.driven = true;
      added.value = Math.abs(measure(this.sketch, { ...added, value: 0 }));
      this.solve();
      this.api.notify?.('warning', this.api.t('sketch.overDefinedDriven'));
    }
    this.commit('op.dimension');
  }

  /** Changes a dimension's value (double click on its label). */
  async editDimension(id) {
    const c = this.sketch.constraints.find((k) => k.id === id);
    if (!c) return;
    if (c.driven) { this.api.notify?.('info', this.api.t('sketch.drivenNote')); return; }
    const value = await this.api.askValue({ type: c.type, value: c.value });
    if (value == null) return;
    const old = c.value;
    const before = this.snapshot();
    c.value = value;
    const r = this.solve();
    if (!r.ok) { c.value = old; this.restore(before); this.solve(); this.api.notify?.('error', this.api.t('sketch.cannotSolve')); }
    this.commit('op.dimension');
  }

  // ───────────────────────── drawing in the view

  render() {
    const s = this.sketch;
    const segs = { defined: [], under: [], over: [], construction: [], selected: [], hover: [] };
    const map = new Map(s.entities.map((e) => [e.id, e]));
    const push = (bucket, pts) => { for (let i = 1; i < pts.length; i++) segs[bucket].push(...this.world(...pts[i - 1]), ...this.world(...pts[i])); };
    for (const e of s.entities) {
      if (e.type === 'point') continue;
      const pts = polyline(s, e, map, 64);
      const bucket = this.selection.includes(e.id) ? 'selected' : this.hover === e.id ? 'hover' : e.construction ? 'construction' : this.status[e.id] === 'over' ? 'over' : this.status[e.id] === 'defined' ? 'defined' : 'under';
      push(bucket, pts);
    }
    const list = [
      { segments: segs.construction, color: COLORS.construction, width: 1.4, dashed: true, dashSize: this.viewport.pixelSize() * 6, gapSize: this.viewport.pixelSize() * 4 },
      { segments: segs.defined, color: getComputedStyle(document.documentElement).getPropertyValue('--sketch-defined').trim() || COLORS.defined, width: 2 },
      { segments: segs.under, color: COLORS.under, width: 2 },
      { segments: segs.over, color: COLORS.over, width: 2.2 },
      { segments: segs.selected, color: COLORS.selected, width: 3 },
      { segments: segs.hover, color: COLORS.hover, width: 3 },
    ];
    // Points: ends, centres, standalone points.
    const pts = { defined: [], under: [], selected: [] };
    for (const e of s.entities) {
      if (e.type !== 'point' || e.origin) continue;
      const bucket = this.selection.includes(e.id) || this.hover === e.id ? 'selected' : this.status[e.id] === 'defined' ? 'defined' : 'under';
      pts[bucket].push(...this.world(e.x, e.y));
    }
    list.push({ points: pts.defined, color: getComputedStyle(document.documentElement).getPropertyValue('--sketch-defined').trim() || COLORS.defined, size: 6 });
    list.push({ points: pts.under, color: COLORS.point, size: 6 });
    list.push({ points: pts.selected, color: COLORS.selected, size: 9 });
    // The origin of the sketch (red arrows like SolidWorks).
    const o = this.world(0, 0); const ax = this.viewport.pixelSize() * 28;
    list.push({ segments: [...o, ...this.world(ax, 0), ...o, ...this.world(0, ax)], color: '#d4282f', width: 1.6 });
    list.push(...this.previewLines());
    list.push(this.gridLines());
    this.viewport.setLines('sketch', list);
    this.renderDimensions();
  }

  gridLines() {
    const step = this.gridStep();
    const span = step * 40;
    const c = this.viewport.target.toArray();
    const [cu, cv] = toSketch(this.frame, c);
    const u0 = Math.floor((cu - span) / step) * step; const v0 = Math.floor((cv - span) / step) * step;
    const seg = [];
    for (let i = 0; i <= 80; i++) {
      const u = u0 + i * step; const v = v0 + i * step;
      seg.push(...this.world(u, v0), ...this.world(u, v0 + 80 * step));
      seg.push(...this.world(u0, v), ...this.world(u0 + 80 * step, v));
    }
    return { segments: seg, color: '#7f93ad', width: 1, opacity: 0.22, depthTest: true, order: 1 };
  }

  previewLines() {
    const out = [];
    const c = this.cursor;
    if (!c || this.tool === 'select' || this.tool === 'dimension' || this.tool === 'trim') return out;
    const P = this.pending;
    const seg = [];
    const line = (a, b) => seg.push(...this.world(a.x, a.y), ...this.world(b.x, b.y));
    const circle = (cx, cy, r, a0 = 0, a1 = Math.PI * 2) => { const n = 64; for (let i = 0; i < n; i++) { const t0 = a0 + ((a1 - a0) * i) / n; const t1 = a0 + ((a1 - a0) * (i + 1)) / n; seg.push(...this.world(cx + r * Math.cos(t0), cy + r * Math.sin(t0)), ...this.world(cx + r * Math.cos(t1), cy + r * Math.sin(t1))); } };
    const t = this.tool;
    if ((t === 'line' || t === 'centerline') && P.length === 1) line(P[0], c);
    if (t === 'rect' && P.length === 1) { const a = P[0]; line(a, { x: c.x, y: a.y }); line({ x: c.x, y: a.y }, c); line(c, { x: a.x, y: c.y }); line({ x: a.x, y: c.y }, a); }
    if (t === 'centerRect' && P.length === 1) { const m = P[0]; const hx = c.x - m.x; const hy = c.y - m.y; const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: m.x + i * hx, y: m.y + j * hy })); for (let i = 0; i < 4; i++) line(q[i], q[(i + 1) % 4]); }
    if (t === 'circle' && P.length === 1) circle(P[0].x, P[0].y, Math.hypot(c.x - P[0].x, c.y - P[0].y));
    if (t === 'polygon' && P.length === 1) { const r = Math.hypot(c.x - P[0].x, c.y - P[0].y); const a0 = Math.atan2(c.y - P[0].y, c.x - P[0].x); const n = this.polygonSides; for (let i = 0; i < n; i++) { const p = { x: P[0].x + r * Math.cos(a0 + (i * 2 * Math.PI) / n), y: P[0].y + r * Math.sin(a0 + (i * 2 * Math.PI) / n) }; const q = { x: P[0].x + r * Math.cos(a0 + ((i + 1) * 2 * Math.PI) / n), y: P[0].y + r * Math.sin(a0 + ((i + 1) * 2 * Math.PI) / n) }; line(p, q); } }
    if (t === 'arc3') { if (P.length === 1) line(P[0], c); if (P.length === 2) { const g = circleThrough(P[0], c, P[1]); if (g) { const tmp = arcAngles(g, P[0], P[1], c); circle(g.cx, g.cy, g.r, tmp.a0, tmp.a1); } else line(P[0], P[1]); } }
    if (t === 'centerArc') { if (P.length === 1) line(P[0], c); if (P.length === 2) { const r = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y); let a0 = Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x); let a1 = Math.atan2(c.y - P[0].y, c.x - P[0].x); while (a1 <= a0) a1 += Math.PI * 2; circle(P[0].x, P[0].y, r, a0, a1); void a0; } }
    if (t === 'slot') { if (P.length === 1) line(P[0], c); if (P.length === 2) { const [a, b] = P; const len = Math.hypot(b.x - a.x, b.y - a.y) || 1; const nx = -(b.y - a.y) / len; const ny = (b.x - a.x) / len; const r = Math.abs((c.x - a.x) * nx + (c.y - a.y) * ny); line({ x: a.x + nx * r, y: a.y + ny * r }, { x: b.x + nx * r, y: b.y + ny * r }); line({ x: a.x - nx * r, y: a.y - ny * r }, { x: b.x - nx * r, y: b.y - ny * r }); const an = Math.atan2(ny, nx); circle(b.x, b.y, r, an - Math.PI, an); circle(a.x, a.y, r, an, an + Math.PI); } }
    out.push({ segments: seg, color: COLORS.preview, width: 1.8 });
    // The snap target: a ring around a point, a small square on a curve.
    const mark = [];
    const r = this.viewport.pixelSize() * 6;
    if (c.kind === 'point' || c.kind === 'mid' || c.kind === 'curve') { const n = 16; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const b = ((i + 1) / n) * Math.PI * 2; mark.push(...this.world(c.x + r * Math.cos(a), c.y + r * Math.sin(a)), ...this.world(c.x + r * Math.cos(b), c.y + r * Math.sin(b))); } }
    out.push({ segments: mark, color: c.kind === 'point' ? '#f28c1e' : c.kind === 'mid' ? '#9c4dcc' : '#18a058', width: 2 });
    out.push({ points: [...this.world(c.x, c.y)], color: COLORS.preview, size: 7 });
    return out;
  }

  /** Dimension labels (values in the length unit): placed beside what they measure. */
  renderDimensions() {
    const s = this.sketch;
    const fmt = this.api.formatValue;
    const labels = [];
    for (const c of s.constraints) {
      if (!DIMENSIONS.includes(c.type)) continue;
      const at = this.dimensionAnchor(c);
      if (!at) continue;
      const text = c.type === 'angle' ? `${fmt(c.value, 'angle')}` : c.type === 'diameter' ? `⌀${fmt(c.value)}` : c.type === 'radius' ? `R${fmt(c.value)}` : fmt(c.value);
      labels.push({ id: c.id, at: this.world(...at), html: `<span>${c.driven ? `(${text})` : text}</span>`, className: `dim-label ${c.driven ? 'driven' : ''} ${this.selection.includes(c.id) ? 'selected' : ''} ${this.over ? '' : ''}`, title: this.api.t(`dim.${c.type}`) });
    }
    this.viewport.setLabels(labels);
  }

  dimensionAnchor(c) {
    const s = this.sketch;
    const a = byId(s, c.a); const b = c.b ? byId(s, c.b) : null;
    if (!a) return null;
    const off = this.viewport.pixelSize() * 16;
    const mid = (e) => { if (e.type === 'point') return [e.x, e.y]; if (e.type === 'line') { const p = byId(s, e.p1); const q = byId(s, e.p2); return [(p.x + q.x) / 2, (p.y + q.y) / 2]; } const cc = byId(s, e.c); return [cc.x, cc.y]; };
    if (c.type === 'radius' || c.type === 'diameter') {
      if (a.type === 'circle') { const cc = byId(s, a.c); return [cc.x + a.r * 0.72 + off * 0.5, cc.y + a.r * 0.72 + off * 0.5]; }
      const g = arcGeometry(s, a); const m = (g.a0 + g.a1) / 2; return [g.cx + (g.r + off) * Math.cos(m), g.cy + (g.r + off) * Math.sin(m)];
    }
    if (!b && a.type === 'line') {
      const p = byId(s, a.p1); const q = byId(s, a.p2);
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return [(p.x + q.x) / 2 - ((q.y - p.y) / len) * off, (p.y + q.y) / 2 + ((q.x - p.x) / len) * off];
    }
    if (c.type === 'angle') {
      const pa = byId(s, a.p1); const qa = byId(s, a.p2);
      return [(pa.x + qa.x) / 2 + off, (pa.y + qa.y) / 2 + off];
    }
    const m1 = mid(a); const m2 = b ? mid(b) : m1;
    return [(m1[0] + m2[0]) / 2 + off * 0.4, (m1[1] + m2[1]) / 2 + off * 0.8];
  }

  /** What the PropertyManager shows about the selection. */
  selectionInfo() {
    return this.selection.map((id) => byId(this.sketch, id) ?? this.sketch.constraints.find((c) => c.id === id)).filter(Boolean);
  }

  toggleConstruction() {
    let n = 0;
    for (const id of this.selection) { const e = byId(this.sketch, id); if (e && e.type !== 'point') { if (e.construction) delete e.construction; else e.construction = true; n++; } }
    if (n) { this.solve(); this.commit('op.construction'); }
    return n > 0;
  }

  dispose() {
    this.viewport.setLines('sketch', []);
    this.viewport.setLabels([]);
  }
}

function closestOn(sketch, ent, x, y) {
  if (ent.type === 'line') {
    const a = byId(sketch, ent.p1); const b = byId(sketch, ent.p2);
    const dx = b.x - a.x; const dy = b.y - a.y; const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    return [a.x + dx * t, a.y + dy * t];
  }
  const c = byId(sketch, ent.c);
  const r = ent.type === 'circle' ? ent.r : Math.hypot(byId(sketch, ent.p1).x - c.x, byId(sketch, ent.p1).y - c.y);
  const ang = Math.atan2(y - c.y, x - c.x);
  return [c.x + r * Math.cos(ang), c.y + r * Math.sin(ang)];
}

function circleThrough(a, m, b) {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-12) return null;
  const s1 = a.x * a.x + a.y * a.y; const sm = m.x * m.x + m.y * m.y; const s2 = b.x * b.x + b.y * b.y;
  const cx = (s1 * (m.y - b.y) + sm * (b.y - a.y) + s2 * (a.y - m.y)) / d;
  const cy = (s1 * (b.x - m.x) + sm * (a.x - b.x) + s2 * (m.x - a.x)) / d;
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) };
}

function arcAngles(g, a, b, m) {
  const ang = (p) => Math.atan2(p.y - g.cy, p.x - g.cx);
  const ccw = (m.x - a.x) * (b.y - a.y) - (m.y - a.y) * (b.x - a.x) < 0;
  let a0 = ccw ? ang(a) : ang(b); let a1 = ccw ? ang(b) : ang(a);
  while (a1 <= a0) a1 += Math.PI * 2;
  void a0;
  return { a0, a1 };
}

export { ORIGIN };
