// SketchUp drawing and modification tools on faces and edges (src/modeling):
// line, rectangle, circle, arc, polygon, freehand, push/pull, offset, follow me,
// protractor and look around, plus group editing, explode, solid tools,
// intersect, soften and painting faces.
//
// Geometry lives in project.models: each model holds a GeoMesh (JSON) in its own
// coordinates. Drawing outside any group goes into the active level's "loose
// geometry" model (model.loose = true), where edges and faces stick together
// as in SketchUp; groups are other models and do not stick to it. Double-click
// a group to edit it (drawing then goes into that group).
import * as THREE from 'three';
import { GeoMesh } from '../modeling/mesh.js';
import { infer, projectRayToAxis } from '../modeling/inference.js';
import { newId, formatLength, parseLength, levelOf } from '../engine/document.js';
import { showInference } from '../engine/overlay.js';
import { Tool, NavTool } from './tools.js';

// ───────────────────────── live meshes

const meshes = new Map(); // model id → { json, mesh }
let editing = null; // model id being edited (group edit), or null

/** The live GeoMesh of a model (rebuilt when its JSON object changed, e.g. after undo). */
export function meshOf(model) {
  const hit = meshes.get(model.id);
  if (hit && hit.json === model.mesh) return hit.mesh;
  const mesh = model.mesh ? GeoMesh.fromJSON(model.mesh) : new GeoMesh();
  meshes.set(model.id, { json: model.mesh, mesh });
  return mesh;
}

/** Stores a mesh back into its model after an operation (one undo step). */
function store(api, model, mesh, labelKey = 'op.model') {
  const json = mesh.toJSON();
  model.mesh = json;
  model.rev = (model.rev ?? 0) + 1;
  meshes.set(model.id, { json, mesh });
  // Empty loose geometry disappears with its last face and edge.
  const p = api.project();
  if (model.loose && !mesh.edges.size) p.models = p.models.filter((m) => m !== model);
  api.commit(labelKey, ['models']);
}

/** The model new geometry goes into: the group being edited, else the level's loose geometry. */
function activeModel(api, { create = true } = {}) {
  const p = api.project();
  if (editing) { const m = p.models.find((x) => x.id === editing); if (m) return m; editing = null; }
  let m = p.models.find((x) => x.loose && x.level === p.activeLevel);
  if (!m && create) {
    m = { id: newId('md'), level: p.activeLevel, name: '', loose: true, mesh: new GeoMesh().toJSON(), position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], tag: 'untagged' };
    p.models.push(m);
  }
  return m;
}

/** World ↔ model coordinates (the model's group in the scene, level elevation included). */
function matrixOf(api, model) {
  const object = api.builder.objectOf(model.id);
  if (object) { object.updateWorldMatrix(true, false); return object.matrixWorld.clone(); }
  const level = levelOf(api.project(), model.level);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(model.position[0], level.elevation + model.position[1], model.position[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(...model.rotation, 'YXZ')), new THREE.Vector3(...model.scale));
  return m;
}
const toLocal = (api, model, p) => p.clone().applyMatrix4(matrixOf(api, model).invert());
const toWorld = (api, model, p) => new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(matrixOf(api, model));
const normalToLocal = (api, model, n) => n.clone().transformDirection(matrixOf(api, model).invert());

// ───────────────────────── picking and inference

/** The face of a model under the cursor: { model, mesh, faceId, point, normal }. */
function pickFace(api, e) {
  // A face drawn on a floor or a wall lies in the same plane: modelled faces win near-ties.
  const any = api.viewport.pick(e.clientX, e.clientY);
  const own = api.viewport.pick(e.clientX, e.clientY, { filter: (ent) => ent?.kind === 'model' });
  const hit = own && (!any || own.distance - any.distance < 0.01) ? own : any;
  if (!hit) return null;
  if (hit.entity?.kind === 'model' && hit.object.userData.faceOfTriangle) {
    const model = api.project().models.find((m) => m.id === hit.entity.id);
    const faceId = hit.object.userData.faceOfTriangle[hit.faceIndex];
    if (model && faceId != null) return { model, mesh: meshOf(model), faceId, point: hit.point, normal: hit.normal, hit };
  }
  return { model: null, point: hit.point, normal: hit.normal, hit };
}

/** SketchUp inference for the drawing tools: model vertices/edges near the cursor, walls, faces, ground. */
function snap(api, e, { from = null, lock = null, drawPlane = null } = {}) {
  const vp = api.viewport;
  const ray = vp.ray(e.clientX, e.clientY).ray;
  const rect = vp.canvas.getBoundingClientRect();
  const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const toScreen = (p) => { const s = vp.worldToScreen(new THREE.Vector3(p.x, p.y, p.z)); return { x: s.x - rect.left, y: s.y - rect.top }; };
  const near = (p) => { const s = toScreen(p); return Math.hypot(s.x - cursor.x, s.y - cursor.y) < 40; };
  const edges = [];
  const points = [];
  const p = api.project();
  for (const model of p.models) {
    if (model.hidden || (editing && model.id !== editing && model.level !== p.activeLevel)) continue;
    const mesh = meshOf(model);
    if (!mesh.edges.size) continue;
    const m = matrixOf(api, model);
    const world = new Map();
    const at = (vid) => { let w = world.get(vid); if (!w) { const v = mesh.vertices.get(vid); w = new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(m); world.set(vid, w); } return w; };
    let n = 0;
    for (const [id, edge] of mesh.edges) {
      if (edge.hidden) continue;
      const a = at(edge.a); const b = at(edge.b);
      // Only edges whose segment passes near the cursor on screen (keeps big models fast).
      const sa = toScreen(a); const sb = toScreen(b);
      const dx = sb.x - sa.x; const dy = sb.y - sa.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((cursor.x - sa.x) * dx + (cursor.y - sa.y) * dy) / l2));
      if (Math.hypot(sa.x + dx * t - cursor.x, sa.y + dy * t - cursor.y) > 40) continue;
      edges.push({ a, b, ref: { model: model.id, edge: id } });
      if (++n > 400) break;
    }
  }
  // Wall corners at the floor and the top of the active level.
  const level = levelOf(p, p.activeLevel);
  for (const w of p.walls) {
    if (w.level !== level.id) continue;
    const h = w.height ?? level.height;
    for (const [x, z] of [w.a, w.b]) for (const y of [level.elevation, level.elevation + h]) { const q = new THREE.Vector3(x, y, z); if (near(q)) points.push({ p: q, kind: 'endpoint' }); }
  }
  const hit = api.viewport.pick(e.clientX, e.clientY);
  const faces = hit?.normal ? [{ plane: { normal: hit.normal, point: hit.point }, contains: () => true, ref: hit.entity?.id }] : [];
  const r = infer({
    ray, toScreen, cursor, candidates: { points, edges, faces, guides: p.guides.map((g) => ({ a: new THREE.Vector3(...g.a), b: new THREE.Vector3(...g.b) })) },
    from, lock, tolerancePx: 10, groundY: level.elevation, ground: true, drawPlane,
  });
  if (!r) return null;
  const point = new THREE.Vector3(r.point.x, r.point.y, r.point.z);
  return { ...r, point, normal: hit?.normal ?? new THREE.Vector3(0, 1, 0), hit, tooltip: api.t(`inf.${r.kind === 'onEdge' ? 'onEdge' : r.kind}`, null, '') };
}

const showSnap = (api, s, from) => showInference(api.overlay, s ? { ...s, lineFrom: s.lineFrom ? new THREE.Vector3(s.lineFrom.x, s.lineFrom.y, s.lineFrom.z) : null } : null, { from });

/** Arrow keys lock an axis (right = red, left = green, up = blue), Shift locks the current direction. */
function lockKey(e, tool) {
  const k = e.key;
  const axes = { ArrowRight: 'x', ArrowLeft: 'z', ArrowUp: 'y', ArrowDown: 'y' };
  if (axes[k]) { tool.lock = tool.lock === axes[k] ? null : axes[k]; return true; }
  if (k === 'Shift' && tool.lastSnap && tool.from) {
    const d = tool.lastSnap.point.clone().sub(tool.from);
    if (d.lengthSq() > 1e-10) tool.lock = { direction: d.normalize() };
    return true;
  }
  return false;
}

/** The plane a shape is drawn in: the face under the first click, else the floor. */
function planeAt(s) {
  const n = s?.normal ? s.normal.clone() : new THREE.Vector3(0, 1, 0);
  // Snap nearly axis-aligned normals exactly (walls, floors).
  for (const axis of ['x', 'y', 'z']) if (Math.abs(n[axis]) > 0.999) { n.set(0, 0, 0); n[axis] = Math.sign(s.normal[axis]); }
  return n.normalize();
}

// ───────────────────────── base for drawing tools

class DrawTool extends Tool {
  get cursor() { return 'crosshair'; }
  activate() { this.points = []; this.lock = null; this.from = null; }
  deactivate() { this.app.overlay.reset(); }
  keyUp(e) { if (e.key === 'Shift' && this.lock?.direction) this.lock = null; }
  move(e) {
    const s = snap(this.app, e, { from: this.from, lock: this.lock });
    this.lastSnap = s;
    showSnap(this.app, s, this.from);
    if (s) this.preview(s, e);
  }
  preview() {}
  key(e) {
    if (e.key === 'Escape' && this.points.length) { this.activate(); this.app.overlay.reset(); return true; }
    return lockKey(e, this);
  }
}

/** Line: click, click, …; a closed loop becomes a face. Typed length extends the last direction. */
class LineTool extends DrawTool {
  id = 'line';
  vcbLabel() { return 'vcb.length'; }
  preview(s) {
    if (!this.from) return;
    this.app.overlay.lines('line', [this.from, s.point], { color: '#111827' });
    const len = s.point.distanceTo(this.from);
    this.app.setVcb('vcb.length', formatLength(len, this.app.units(), { suffix: false }));
  }
  up() { const s = this.lastSnap; if (s) this.addPoint(s.point); }
  addPoint(world) {
    if (this.from && world.distanceTo(this.from) > 1e-6) {
      const model = activeModel(this.app);
      const mesh = meshOf(model);
      const a = toLocal(this.app, model, this.from); const b = toLocal(this.app, model, world);
      const r = mesh.addEdge(a, b);
      store(this.app, model, mesh, 'op.line');
      // A face closed the loop: start over (SketchUp ends the line there).
      if (r.faces?.length) { this.from = null; this.points = []; this.app.overlay.reset(); return; }
    }
    this.from = world.clone();
    this.points.push(world.clone());
  }
  dblclick() { this.from = null; this.points = []; this.app.overlay.reset(); }
  vcb(text) {
    const v = parseLength(text, this.app.units());
    if (v == null || !this.from || !this.lastSnap) return false;
    const dir = this.lastSnap.point.clone().sub(this.from);
    if (dir.lengthSq() < 1e-12) return false;
    this.addPoint(this.from.clone().addScaledVector(dir.normalize(), Array.isArray(v) ? v[0] : v));
    return true;
  }
}

/** Rectangle: two corners in the plane of the first click (face or floor). Typed "w,d". */
class RectangleTool extends DrawTool {
  id = 'rectangle';
  vcbLabel() { return 'vcb.dimensions'; }
  corners(p0, p1, n) {
    // Sides along the plane's world-aligned axes (as addRectangle with { normal }).
    const u = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    const d = p1.clone().sub(p0);
    const du = d.dot(u); const dv = d.dot(v);
    return { pts: [p0.clone(), p0.clone().addScaledVector(u, du), p0.clone().addScaledVector(u, du).addScaledVector(v, dv), p0.clone().addScaledVector(v, dv)], du, dv, u, v };
  }
  move(e) {
    const s = snap(this.app, e, { from: this.from, lock: this.from ? { plane: { normal: this.normal, point: this.from } } : null });
    this.lastSnap = s;
    showSnap(this.app, s, null);
    if (!s || !this.from) return;
    const { pts, du, dv } = this.corners(this.from, s.point, this.normal);
    this.app.overlay.polyline('rect', pts, { color: '#111827', closed: true });
    this.app.overlay.polygon('rect-face', pts, { color: '#2a5bd7', opacity: 0.15 });
    this.app.setVcb('vcb.dimensions', `${formatLength(Math.abs(du), this.app.units(), { suffix: false })}, ${formatLength(Math.abs(dv), this.app.units(), { suffix: false })}`);
  }
  up() {
    const s = this.lastSnap;
    if (!s) return;
    if (!this.from) { this.from = s.point.clone(); this.normal = planeAt(s); return; }
    this.make(s.point);
  }
  make(world) {
    const { pts } = this.corners(this.from, world, this.normal);
    if (pts[0].distanceTo(pts[2]) < 1e-4) return;
    const model = activeModel(this.app);
    const mesh = meshOf(model);
    const local = pts.map((q) => toLocal(this.app, model, q));
    mesh.addPolyline(local, { closed: true, planeNormal: normalToLocal(this.app, model, this.normal) });
    store(this.app, model, mesh, 'op.rectangle');
    this.lastRect = { from: this.from.clone(), normal: this.normal.clone(), dir: world.clone().sub(this.from) };
    this.from = null;
    this.app.overlay.reset();
  }
  vcb(text) {
    const v = parseLength(text, this.app.units());
    if (!Array.isArray(v) || v.length !== 2) return false;
    if (!this.from) return false;
    const { u, v: vv } = this.corners(this.from, this.lastSnap?.point ?? this.from.clone().add(new THREE.Vector3(1, 0, 1)), this.normal);
    const su = Math.sign((this.lastSnap?.point.clone().sub(this.from).dot(u)) || 1);
    const sv = Math.sign((this.lastSnap?.point.clone().sub(this.from).dot(vv)) || 1);
    this.make(this.from.clone().addScaledVector(u, v[0] * su).addScaledVector(vv, v[1] * sv));
    return true;
  }
}

/** Circle and polygon: centre, then radius. "12s" sets the number of segments / sides. */
class CircleTool extends DrawTool {
  constructor(app, polygon = false) { super(app); this.polygon = polygon; this.id = polygon ? 'polygon' : 'circle'; this.sides = polygon ? 6 : 24; }
  vcbLabel() { return 'vcb.radius'; }
  move(e) {
    const s = snap(this.app, e, { from: this.center ?? null, lock: this.center ? { plane: { normal: this.normal, point: this.center } } : null });
    this.lastSnap = s;
    showSnap(this.app, s, this.center);
    if (!s || !this.center) return;
    const r = s.point.distanceTo(this.center);
    this.app.overlay.polyline('circle', this.ring(r), { color: '#111827', closed: true });
    this.app.setVcb('vcb.radius', formatLength(r, this.app.units(), { suffix: false }));
  }
  ring(r) {
    const n = this.normal;
    const u = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    return Array.from({ length: this.sides }, (_, i) => { const a = (i / this.sides) * Math.PI * 2; return this.center.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r); });
  }
  up() {
    const s = this.lastSnap;
    if (!s) return;
    if (!this.center) { this.center = s.point.clone(); this.normal = planeAt(s); return; }
    this.make(s.point.distanceTo(this.center));
  }
  make(r) {
    if (r < 1e-4) return;
    const model = activeModel(this.app);
    const mesh = meshOf(model);
    const c = toLocal(this.app, model, this.center);
    const n = normalToLocal(this.app, model, this.normal);
    if (this.polygon) mesh.addPolygon(c, n, r, this.sides); else mesh.addCircle(c, n, r, this.sides);
    store(this.app, model, mesh, this.polygon ? 'op.polygon' : 'op.circle');
    this.center = null;
    this.app.overlay.reset();
  }
  vcb(text) {
    const sides = String(text).trim().match(/^(\d+)\s*s$/i);
    if (sides) { this.sides = Math.max(3, Math.min(999, Number(sides[1]))); this.app.notify('info', this.app.t('notice.sides', { n: this.sides })); return true; }
    const v = parseLength(text, this.app.units());
    if (v == null || !this.center) return false;
    this.make(Array.isArray(v) ? v[0] : v);
    return true;
  }
  key(e) { if (e.key === 'Escape' && this.center) { this.center = null; this.app.overlay.reset(); return true; } return lockKey(e, this); }
}

/** Arc: start, end, then the bulge point (2-point arc). */
class ArcTool extends DrawTool {
  id = 'arc';
  up() {
    const s = this.lastSnap;
    if (!s) return;
    this.points.push(s.point.clone());
    this.from = s.point.clone();
    if (this.points.length === 1) this.normal = planeAt(s);
    if (this.points.length === 3) {
      const model = activeModel(this.app);
      const mesh = meshOf(model);
      const [a, b, c] = this.points.map((q) => toLocal(this.app, model, q));
      try { mesh.addArc3(a, c, b, { segments: 12 }); store(this.app, model, mesh, 'op.arc'); } catch (error) { this.app.notify('error', String(error.message ?? error)); }
      this.points = []; this.from = null;
      this.app.overlay.reset();
    }
  }
  preview(s) {
    if (this.points.length === 1) this.app.overlay.lines('arc', [this.points[0], s.point], { color: '#111827', dashed: true });
    if (this.points.length === 2) {
      const [a, b] = this.points;
      const pts = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(a.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(s.point, 2 * t * (1 - t) * 2).addScaledVector(a.clone().add(b).multiplyScalar(0.5), -2 * t * (1 - t)).addScaledVector(b, t * t)); }
      this.app.overlay.polyline('arc', pts, { color: '#111827' });
    }
  }
}

/** Freehand: drag to draw a polyline (points thinned by screen distance). */
class FreehandTool extends DrawTool {
  id = 'freehand';
  down(e) { const s = snap(this.app, e); if (!s) return; this.drawing = [s.point.clone()]; this.normal = planeAt(s); this.screen = { x: e.clientX, y: e.clientY }; }
  move(e) {
    if (!this.drawing) { super.move(e); return; }
    if (Math.hypot(e.clientX - this.screen.x, e.clientY - this.screen.y) < 8) return;
    this.screen = { x: e.clientX, y: e.clientY };
    const p = this.app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, this.drawing[0], this.normal);
    if (p) { this.drawing.push(p); this.app.overlay.polyline('free', this.drawing, { color: '#111827' }); }
  }
  up() {
    if (!this.drawing || this.drawing.length < 2) { this.drawing = null; return; }
    const model = activeModel(this.app);
    const mesh = meshOf(model);
    const closed = this.drawing[0].distanceTo(this.drawing.at(-1)) < this.app.viewport.pixelSizeAt(this.drawing[0]) * 12;
    mesh.addPolyline(this.drawing.map((q) => toLocal(this.app, model, q)), { closed, planeNormal: normalToLocal(this.app, model, this.normal) });
    store(this.app, model, mesh, 'op.freehand');
    this.drawing = null;
    this.app.overlay.reset();
  }
}

/** Push/Pull: click a face, move along its normal, click (or type a distance). Double-click repeats the last distance. */
class PushPullTool extends Tool {
  id = 'pushpull';
  get cursor() { return 'ns-resize'; }
  vcbLabel() { return 'vcb.distance'; }
  activate() { this.active = null; }
  deactivate() { this.app.overlay.reset(); }
  move(e) {
    const app = this.app;
    if (!this.active) {
      const f = pickFace(app, e);
      if (f?.model) this.highlight(f); else app.overlay.clear('pp-face');
      return;
    }
    const a = this.active;
    const ray = app.viewport.ray(e.clientX, e.clientY).ray;
    const pr = projectRayToAxis(ray, a.startWorld, a.normalWorld);
    let d = pr.point ? new THREE.Vector3(pr.point.x, pr.point.y, pr.point.z).sub(a.startWorld).dot(a.normalWorld) : 0;
    // Snap the distance to points of other geometry at the same height (SketchUp pushes to an inferred point).
    const s = snap(app, e);
    if (s && ['endpoint', 'midpoint', 'onEdge'].includes(s.kind)) d = s.point.clone().sub(a.startWorld).dot(a.normalWorld);
    a.distance = d;
    const loop = a.loopWorld;
    const top = loop.map((q) => q.clone().addScaledVector(a.normalWorld, d));
    const lines = [];
    for (let i = 0; i < loop.length; i++) { const j = (i + 1) % loop.length; lines.push(top[i], top[j], loop[i], top[i]); }
    app.overlay.lines('pp', lines, { color: '#2a5bd7' });
    app.overlay.polygon('pp-face', top, { color: '#2a5bd7', opacity: 0.22 });
    app.setVcb('vcb.distance', formatLength(d, app.units(), { suffix: false }));
  }
  highlight(f) {
    const loop = f.mesh.faces.get(f.faceId)?.outer.map((vid) => toWorld(this.app, f.model, f.mesh.vertices.get(vid)));
    if (loop) this.app.overlay.polygon('pp-face', loop, { color: '#2a5bd7', opacity: 0.25 });
  }
  down(e) {
    if (this.active) return;
    const f = pickFace(this.app, e);
    if (!f?.model) return;
    const face = f.mesh.faces.get(f.faceId);
    const loopWorld = face.outer.map((vid) => toWorld(this.app, f.model, f.mesh.vertices.get(vid)));
    const n = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z).transformDirection(matrixOf(this.app, f.model)).normalize();
    this.active = { ...f, startWorld: f.point.clone(), normalWorld: n, loopWorld, distance: 0, ctrl: e.ctrlKey || e.metaKey, at: { x: e.clientX, y: e.clientY } };
  }
  up(e) {
    if (!this.active) return;
    // Click-move-click (SketchUp) or press-drag-release both work: a release right where it was pressed waits for the second click.
    if (!this.active.moved && Math.hypot(e.clientX - this.active.at.x, e.clientY - this.active.at.y) < 4) { this.active.moved = true; return; }
    this.apply(this.active.distance);
  }
  apply(distance) {
    const a = this.active;
    if (!a || Math.abs(distance) < 1e-6) { this.active = null; this.app.overlay.reset(); return; }
    // The distance in the model's own units (a scaled group stretches it).
    const linear = new THREE.Matrix3().setFromMatrix4(matrixOf(this.app, a.model).invert());
    const local = distance * a.normalWorld.clone().applyMatrix3(linear).length();
    const r = a.mesh.pushPull(a.faceId, local, { createNew: a.ctrl });
    if (r?.error) this.app.notify('error', r.error);
    store(this.app, a.model, a.mesh, 'op.pushpull');
    this.last = distance;
    this.active = null;
    this.app.overlay.reset();
  }
  dblclick(e) {
    if (this.last == null) return;
    const f = pickFace(this.app, e);
    if (!f?.model) return;
    f.mesh.pushPull(f.faceId, this.last);
    store(this.app, f.model, f.mesh, 'op.pushpull');
    this.active = null;
  }
  vcb(text) {
    const v = parseLength(text, this.app.units());
    if (v == null) return false;
    if (this.active) { this.apply(Array.isArray(v) ? v[0] : v); return true; }
    return false;
  }
  key(e) { if (e.key === 'Escape' && this.active) { this.active = null; this.app.overlay.reset(); return true; } return false; }
}

/** Offset: click a face, move to set the distance, click (or type it). */
class OffsetTool extends Tool {
  id = 'offset';
  get cursor() { return 'crosshair'; }
  vcbLabel() { return 'vcb.offset'; }
  down(e) {
    if (this.active) return;
    const f = pickFace(this.app, e);
    if (f?.model) this.active = { ...f, start: f.point.clone(), at: { x: e.clientX, y: e.clientY } };
  }
  move(e) {
    if (!this.active) { const f = pickFace(this.app, e); this.app.setHover(f?.model?.id ?? null); return; }
    const a = this.active;
    const p = this.app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, a.start, a.normal);
    if (!p) return;
    // Inward when the cursor moves towards the face's centre.
    const face = a.mesh.faces.get(a.faceId);
    const centre = face.outer.reduce((acc, vid) => acc.add(toWorld(this.app, a.model, a.mesh.vertices.get(vid))), new THREE.Vector3()).divideScalar(face.outer.length);
    const d = p.distanceTo(a.start) * (p.distanceTo(centre) < a.start.distanceTo(centre) ? 1 : -1);
    a.distance = d;
    this.app.overlay.lines('offset', [a.start, p], { color: '#2a5bd7', dashed: true });
    this.app.setVcb('vcb.offset', formatLength(d, this.app.units(), { suffix: false }));
  }
  up(e) {
    if (!this.active) return;
    if (!this.active.clicked) { this.active.clicked = true; if (Math.hypot(e.clientX - this.active.at.x, e.clientY - this.active.at.y) < 4) return; }
    if (Math.abs(this.active.distance ?? 0) > 1e-5) this.apply(this.active.distance);
  }
  apply(d) {
    const a = this.active;
    const r = a.mesh.offsetFace(a.faceId, d);
    if (r?.error) this.app.notify('error', this.app.t(`error.code.${r.error}`, null, r.error));
    else store(this.app, a.model, a.mesh, 'op.offset');
    this.active = null;
    this.app.overlay.reset();
  }
  vcb(text) { const v = parseLength(text, this.app.units()); if (v == null || !this.active) return false; this.apply(Array.isArray(v) ? v[0] : v); return true; }
  key(e) { if (e.key === 'Escape' && this.active) { this.active = null; this.app.overlay.reset(); return true; } return false; }
}

/** Follow Me: click the profile face, then an edge of the path (the connected chain is followed). */
class FollowMeTool extends Tool {
  id = 'followme';
  get cursor() { return 'crosshair'; }
  hint() { return this.profile ? 'hint.followmePath' : 'hint.followme'; }
  up(e) {
    const app = this.app;
    if (!this.profile) {
      const f = pickFace(app, e);
      if (f?.model) { this.profile = f; app.notify('info', app.t('hint.followmePath')); }
      return;
    }
    const s = snap(app, e);
    const ref = s?.ref;
    if (!ref?.edge || ref.model !== this.profile.model.id) { app.notify('info', app.t('notice.pickPathEdge')); return; }
    const mesh = this.profile.mesh;
    const path = chainFrom(mesh, ref.edge, new Set(mesh.boundaryEdges(this.profile.faceId)));
    const r = mesh.followMe(this.profile.faceId, path);
    if (r?.error) app.notify('error', app.t(`error.code.${r.error}`, null, r.error));
    else store(app, this.profile.model, mesh, 'op.followme');
    this.profile = null;
  }
  key(e) { if (e.key === 'Escape' && this.profile) { this.profile = null; return true; } return false; }
}

/** Edges connected end to end through vertices with exactly two path edges (a chain), skipping the profile's own edges. */
function chainFrom(mesh, start, skip) {
  const chain = [start];
  const seen = new Set(chain);
  for (const dir of ['a', 'b']) {
    let edge = mesh.edges.get(start);
    let v = edge[dir];
    for (let guard = 0; guard < 10000; guard++) {
      const next = mesh.edgesOfVertex(v).filter((id) => !seen.has(id) && !skip.has(id) && mesh.facesOfEdge(id).length === 0);
      if (next.length !== 1) break;
      seen.add(next[0]);
      if (dir === 'a') chain.unshift(next[0]); else chain.push(next[0]);
      edge = mesh.edges.get(next[0]);
      v = edge.a === v ? edge.b : edge.a;
    }
  }
  return chain;
}

/** Protractor: vertex, first direction, second direction → the angle (and a guide line). */
class ProtractorTool extends DrawTool {
  id = 'protractor';
  vcbLabel() { return 'vcb.angle'; }
  up() {
    const s = this.lastSnap;
    if (!s) return;
    this.points.push(s.point.clone());
    this.from = this.points[0];
    if (this.points.length === 1) this.normal = planeAt(s);
    if (this.points.length === 3) {
      const [c, a, b] = this.points;
      const angle = a.clone().sub(c).angleTo(b.clone().sub(c));
      this.app.notify('info', this.app.t('notice.angle', { angle: ((angle * 180) / Math.PI).toFixed(1) }));
      const dir = b.clone().sub(c).normalize();
      this.app.change('op.guide', (p) => { p.guides.push({ id: newId('g'), a: c.toArray(), b: c.clone().addScaledVector(dir, 3).toArray() }); }, ['guides']);
      this.points = []; this.from = null; this.app.overlay.reset();
    }
  }
  preview(s) {
    if (!this.points.length) return;
    const c = this.points[0];
    this.app.overlay.protractor('prot', c, this.normal, this.app.viewport.pixelSizeAt(c) * 40);
    const pts = [c, this.points[1] ?? s.point];
    if (this.points.length === 2) pts.push(c, s.point);
    this.app.overlay.lines('prot-lines', pts, { color: '#2e6fd6', dashed: true });
    if (this.points.length === 2) this.app.setVcb('vcb.angle', ((this.points[1].clone().sub(c).angleTo(s.point.clone().sub(c)) * 180) / Math.PI).toFixed(1));
  }
}

/** Look around: turn the camera on the spot. */
class LookAroundTool extends Tool {
  id = 'lookAround';
  get cursor() { return 'grab'; }
  down(e) { this.at = { x: e.clientX, y: e.clientY }; }
  move(e) { if (!this.at) return; this.app.viewport.walkLook(e.clientX - this.at.x, e.clientY - this.at.y); this.at = { x: e.clientX, y: e.clientY }; }
  up() { this.at = null; }
}

export function createTool(api, id) {
  switch (id) {
    case 'line': return new LineTool(api);
    case 'rectangle': return new RectangleTool(api);
    case 'circle': return new CircleTool(api, false);
    case 'polygon': return new CircleTool(api, true);
    case 'arc': return new ArcTool(api);
    case 'freehand': return new FreehandTool(api);
    case 'pushpull': return new PushPullTool(api);
    case 'offset': return new OffsetTool(api);
    case 'followme': return new FollowMeTool(api);
    case 'protractor': return new ProtractorTool(api);
    case 'lookAround': return new LookAroundTool(api);
    case 'axes': return null;
    default: return null;
  }
}

// ───────────────────────── commands used by app.js

export function paintModelFace(api, modelId, hit, preset) {
  const model = api.project().models.find((m) => m.id === modelId);
  const faceId = hit.object.userData.faceOfTriangle?.[hit.faceIndex];
  if (!model || faceId == null) return;
  const mesh = meshOf(model);
  // Paint the front or the back depending on which side was clicked.
  const face = mesh.faces.get(faceId);
  const n = new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z).transformDirection(matrixOf(api, model));
  const back = hit.normal && n.dot(api.viewport.camera.position.clone().sub(hit.point)) < 0;
  mesh.setMaterial([faceId], preset, { back });
  store(api, model, mesh, 'op.paint');
}

/** Group editing: drawing goes into this model until Esc / another selection. */
export function editModel(api, modelId) {
  editing = modelId;
  api.select([modelId]);
  api.notify('info', api.t('notice.editGroup'));
  api.setTool('select');
}
export function stopEditing() { editing = null; }
export const editingModel = () => editing;

/** Make Group: the selected loose geometry becomes a group (the loose model is renamed; drawing starts a new loose model). */
export function makeGroup(api, ids) {
  const p = api.project();
  const models = p.models.filter((m) => ids.includes(m.id));
  if (!models.length) { api.notify('info', api.t('notice.selectModel')); return; }
  api.change('op.group', () => {
    for (const m of models) { if (m.loose) { delete m.loose; m.name = m.name || api.t('kind.group', { n: p.models.filter((x) => !x.loose).length }); } }
  }, ['models']);
}

/** Explode: a group's geometry joins the level's loose geometry (it becomes sticky again). */
export function explode(api, ids) {
  const p = api.project();
  const groups = p.models.filter((m) => ids.includes(m.id) && !m.loose);
  if (!groups.length) return;
  for (const g of groups) {
    const loose = (() => { const prev = editing; editing = null; const m = activeModel(api); editing = prev; return m; })();
    const target = meshOf(loose);
    const rel = matrixOf(api, loose).invert().multiply(matrixOf(api, g));
    target.merge(meshOf(g), rel);
    loose.mesh = target.toJSON();
    loose.rev = (loose.rev ?? 0) + 1;
    meshes.set(loose.id, { json: loose.mesh, mesh: target });
    p.models = p.models.filter((m) => m !== g);
  }
  api.commit('op.explode', ['models']);
}

/** Solid tools on two (or more, for union) selected models. */
export async function solid(api, kind, ids) {
  const p = api.project();
  const models = ids.map((id) => p.models.find((m) => m.id === id)).filter(Boolean);
  if (models.length < 2) return;
  const S = await import('../modeling/solids.js');
  const [first, ...rest] = models;
  // Bring every operand into the first model's coordinates.
  let acc = meshOf(first).clone();
  try {
    for (const other of rest) {
      const rel = matrixOf(api, first).invert().multiply(matrixOf(api, other));
      const b = new GeoMesh();
      b.merge(meshOf(other), rel);
      const r = await S[kind === 'union' ? 'union' : kind === 'subtract' ? 'subtract' : 'intersect'](acc, b);
      if (r?.error) { api.notify('error', api.t(`error.code.${r.error}`, null, r.error)); return; }
      acc = r.mesh ?? r;
    }
  } catch (error) { api.showError('error.tool', error); return; }
  first.mesh = acc.toJSON();
  first.rev = (first.rev ?? 0) + 1;
  meshes.set(first.id, { json: first.mesh, mesh: acc });
  delete first.loose;
  p.models = p.models.filter((m) => !rest.includes(m));
  api.commit(`op.solid.${kind}`, ['models']);
}

/** Intersect Faces with Model: the selected models' faces with all others in the same model. */
export function intersect(api, ids) {
  for (const model of api.project().models.filter((m) => ids.includes(m.id))) {
    const mesh = meshOf(model);
    mesh.intersectFaces([...mesh.faces.keys()]);
    model.mesh = mesh.toJSON();
    model.rev = (model.rev ?? 0) + 1;
    meshes.set(model.id, { json: model.mesh, mesh });
  }
  api.commit('op.intersect', ['models']);
}

export function soften(api, ids) {
  for (const model of api.project().models.filter((m) => ids.includes(m.id))) {
    const mesh = meshOf(model);
    mesh.softenEdges(null, 20);
    model.mesh = mesh.toJSON();
    model.rev = (model.rev ?? 0) + 1;
    meshes.set(model.id, { json: model.mesh, mesh });
  }
  api.commit('op.soften', ['models']);
}

export function modelStats(model) {
  const mesh = meshOf(model);
  const solid = mesh.faces.size && mesh.isSolid();
  return `${mesh.faces.size} faces · ${mesh.edges.size} edges${solid ? ` · solid ${Math.abs(mesh.volume()).toFixed(3)} m³` : ''}`;
}

/** Eraser on modelled geometry: the edge under the cursor (its whole curve), else the face. */
export function eraseAt(api, e) {
  const s = snap(api, e);
  const ref = s?.ref;
  if (ref?.edge != null && (s.kind === 'onEdge' || s.kind === 'endpoint' || s.kind === 'midpoint')) {
    const model = api.project().models.find((m) => m.id === ref.model);
    if (!model) return false;
    const mesh = meshOf(model);
    mesh.eraseEdges(mesh.curveEdges(ref.edge));
    store(api, model, mesh, 'op.erase');
    return true;
  }
  const f = pickFace(api, e);
  if (f?.model) { f.mesh.erase([f.faceId]); store(api, f.model, f.mesh, 'op.erase'); return true; }
  return false;
}

export { NavTool };
