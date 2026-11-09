// Interior and general tools: select, place (library items, doors, windows),
// wall, room, move, rotate, scale, eraser, paint bucket, tape measure,
// dimension, text, section plane, walk. The SketchUp drawing tools that work on
// faces and edges (line, rectangle, push/pull …) live in modeling.js.
//
// A tool gets pointer events from the viewport (left button only; navigation
// keeps the middle button) and talks to the app through `app` (see app.js toolApi).
// Live previews change the project in place and call app.live(); app.commit()
// then records one undo step (History keeps the state of the last commit).
import * as THREE from 'three';
import { snapPlan } from './snap.js';
import { detectRoom, nearestWall, wallDir, wallLength, wallNormal, projectOnSegment, pointInPolygon } from '../engine/walls.js';
import { formatLength, newId, parseLength, polygonArea, formatArea, wallHeight } from '../engine/document.js';
import { showInference } from '../engine/overlay.js';
import { itemParams } from '../library/catalog.js';

export class Tool {
  constructor(app) { this.app = app; }
  get cursor() { return 'default'; }
  activate() {}
  deactivate() { this.app.overlay.reset(); }
  hint() { return `hint.${this.id}`; }
  down() {} move() {} up() {} dblclick() {}
  key() { return false; }
  vcb() { return false; }
  vcbLabel() { return null; }
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const planOf = (p) => [p.x, p.z];

/** Walls of the active level and points of its rooms (for snapping). */
function levelSnapData(app) {
  const project = app.project();
  const level = app.level();
  const walls = project.walls.filter((w) => w.level === level.id);
  const points = project.rooms.filter((r) => r.level === level.id).flatMap((r) => r.points.map((q) => [q, 'endpoint']));
  return { walls, points };
}

function snapAt(app, e, from = null, lockDir = null) {
  const ground = app.groundPoint(e);
  if (!ground) return null;
  const { walls, points } = levelSnapData(app);
  const s = app.settings();
  const snap = snapPlan(planOf(ground), { walls, points, from, lockDir, pixel: app.viewport.pixelSizeAt(ground), grid: s.snapToGrid ? (app.viewport.gridStep || s.gridSize) : null });
  const y = app.level().elevation;
  return { ...snap, world: v3(snap.point[0], y, snap.point[1]), guideWorld: snap.guideFrom ? v3(snap.guideFrom[0], y, snap.guideFrom[1]) : null };
}

const TIP = { endpoint: 'inf.endpoint', midpoint: 'inf.midpoint', onEdge: 'inf.onWall', axisX: 'inf.axisX', axisZ: 'inf.axisZ', aligned: 'inf.aligned', grid: 'inf.grid', locked: 'inf.locked' };
function showSnap(app, snap, from) {
  if (!snap) { showInference(app.overlay, null); return; }
  const kind = snap.kind === 'aligned' ? 'parallel' : snap.kind === 'grid' || snap.kind === 'free' ? 'ground' : snap.kind;
  showInference(app.overlay, { point: snap.world, kind, tooltip: TIP[snap.kind] ? app.t(TIP[snap.kind]) : '', lineFrom: snap.guideWorld ?? null }, { from });
}

// ───────────────────────── Select

export class SelectTool extends Tool {
  id = 'select';
  get cursor() { return 'default'; }

  down(e) {
    const app = this.app;
    const hit = app.viewport.pick(e.clientX, e.clientY);
    const entity = hit?.entity;
    this.press = { x: e.clientX, y: e.clientY, entity, hit, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    if (entity && app.isSelected(entity.id) && !this.press.shift && !this.press.ctrl && ['object', 'model'].includes(entity.kind) && !app.isLocked(entity.id)) {
      // Dragging a selected piece of furniture moves it on the floor (snapping to walls).
      this.drag = { ids: app.selection().filter((id) => !app.isLocked(id)), start: hit.point.clone(), last: hit.point.clone(), started: false };
    }
  }

  move(e) {
    const app = this.app;
    if (this.drag) {
      const p = this.press;
      if (!this.drag.started && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return;
      this.drag.started = true;
      const ground = app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, this.drag.start, new THREE.Vector3(0, 1, 0));
      if (!ground) return;
      const delta = ground.clone().sub(this.drag.last);
      this.drag.last.copy(ground);
      app.moveEntities(this.drag.ids, delta, { live: true });
      return;
    }
    if (this.press && (this.navigating || Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 4)) {
      const orbitDrag = app.settings().leftDrag !== 'select' && !this.press.shift && !this.press.ctrl;
      if (orbitDrag) {
        const vp = app.viewport;
        if (!this.navigating) { this.navigating = { x: this.press.x, y: this.press.y, pivot: this.press.hit?.point ?? vp.target.clone() }; }
        const dx = e.clientX - this.navigating.x; const dy = e.clientY - this.navigating.y;
        this.navigating.x = e.clientX; this.navigating.y = e.clientY;
        if (vp.planMode || e.altKey) vp.pan(dx, dy, this.navigating.pivot); else vp.orbit(dx, dy, this.navigating.pivot);
        vp.touchInteraction();
        return;
      }
      this.box = { x0: this.press.x, y0: this.press.y, x1: e.clientX, y1: e.clientY };
      app.showSelectionRect(this.box);
      return;
    }
    if (!this.press) {
      const hit = app.viewport.pick(e.clientX, e.clientY);
      app.setHover(hit?.entity?.id ?? null);
    }
  }

  up(e) {
    const app = this.app;
    const press = this.press;
    this.press = null;
    if (this.navigating) { this.navigating = null; this.app.cameraMoved?.(); return; }
    if (this.drag) {
      const drag = this.drag;
      this.drag = null;
      if (drag.started) { app.commit('op.move', ['objects', 'models']); return; }
    }
    if (this.box) {
      const box = this.box;
      this.box = null;
      app.showSelectionRect(null);
      // Left-to-right: window (inside only); right-to-left: crossing (touching) — as in SketchUp.
      const ids = app.entitiesInRect(box, { crossing: box.x1 < box.x0 });
      app.select(ids, { add: press?.ctrl, toggle: press?.shift });
      return;
    }
    if (!press) return;
    const entity = press.entity;
    if (!entity) { if (!press.ctrl && !press.shift) app.clearSelection(); return; }
    app.select([entity.id], { add: press.ctrl, toggle: press.shift });
  }

  dblclick(e) {
    const hit = this.app.viewport.pick(e.clientX, e.clientY);
    if (hit?.entity) this.app.editEntity(hit.entity.id);
  }

  key(e) {
    const app = this.app;
    const ids = app.selection();
    if (!ids.length) return false;
    const step = e.shiftKey ? 0.01 : 0.1;
    const arrows = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
    const k = e.key.toLowerCase();
    if (arrows[k] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      app.moveEntities(ids, new THREE.Vector3(arrows[k][0], 0, arrows[k][1]), { live: true });
      app.commit('op.nudge', ['objects', 'models', 'walls', 'rooms', 'openings']);
      return true;
    }
    return false;
  }
}

// ───────────────────────── Place (library items, doors and windows)

export class PlaceTool extends Tool {
  id = 'place';
  get cursor() { return 'copy'; }

  constructor(app, item, { params = {}, sticky = true } = {}) {
    super(app);
    this.item = item;
    this.params = itemParams(item, params);
    this.rotation = 0;
    this.sticky = sticky;
  }

  hint() { return this.item.placement === 'opening' ? 'hint.placeOpening' : 'hint.place'; }

  activate() {
    this.ghost = this.app.builder.instance ? this.makeGhost() : null;
    this.app.overlay.object('ghost', this.ghost);
    if (this.ghost) this.ghost.visible = false;
  }

  makeGhost() {
    const app = this.app;
    const object = this.item.kind === 'parametric' ? app.builder.instance(this.item, this.params, { wallThickness: app.settings().defaultWallThickness }) : app.builder.assetInstance(this.item, null);
    const holder = new THREE.Group();
    holder.add(object);
    holder.traverse((o) => { o.userData.noPick = true; if (o.isLineSegments) o.visible = false; });
    return holder;
  }

  deactivate() { this.app.overlay.reset(); this.ghost = null; }

  /** Where the item would go for this pointer position (null: nowhere). */
  placement(e) {
    const app = this.app;
    const item = this.item;
    const level = app.level();
    const project = app.project();
    if (item.placement === 'opening') {
      const ground = app.groundPoint(e);
      if (!ground) return null;
      const walls = project.walls.filter((w) => w.level === level.id);
      const hit = app.viewport.pick(e.clientX, e.clientY, { filter: (ent) => ent?.kind === 'wall' });
      let near = null;
      if (hit) {
        const wall = project.walls.find((w) => w.id === hit.entity.id);
        const pr = projectOnSegment(planOf(hit.point), wall.a, wall.b);
        near = { wall, t: pr.t * wallLength(wall), side: new THREE.Vector2(...wallNormal(wall)).dot(new THREE.Vector2(hit.normal?.x ?? 0, hit.normal?.z ?? 0)) >= 0 ? 'left' : 'right' };
      } else near = nearestWall(walls, planOf(ground), 0.6);
      if (!near) return null;
      const width = Number(this.params.width ?? item.size?.[0] ?? 0.9);
      const height = Number(this.params.height ?? item.size?.[1] ?? 2.1);
      const L = wallLength(near.wall);
      if (width > L - 0.05) return null;
      const offset = Math.max(width / 2 + 0.02, Math.min(L - width / 2 - 0.02, near.t));
      const sill = item.category === 'windows' ? Number(this.params.sill ?? item.defaultSill ?? 0.9) : 0;
      const d = wallDir(near.wall); const n = wallNormal(near.wall);
      const pos = v3(near.wall.a[0] + d[0] * offset, level.elevation + sill, near.wall.a[1] + d[1] * offset);
      return { kind: 'opening', wall: near.wall, offset, width, height, sill, side: near.side, position: pos, rotationY: Math.atan2(n[0], n[1]) + (near.side === 'right' ? Math.PI : 0) };
    }
    const hit = app.viewport.pick(e.clientX, e.clientY, { filter: (ent) => !ent || ent.kind !== 'opening' });
    const size = item.size ?? [0.5, 0.5, 0.5];
    if (item.placement === 'wall') {
      if (!hit?.normal || Math.abs(hit.normal.y) > 0.5) return null;
      const yaw = Math.atan2(hit.normal.x, hit.normal.z);
      // Wall items have a usual height (pictures at 1.3 m, sconces at 1.65 m …); otherwise centre on the cursor.
      const y = item.elevation != null ? level.elevation + item.elevation : Math.max(level.elevation, hit.point.y - size[1] / 2);
      const p = hit.point.clone();
      p.y = y;
      return { kind: 'object', position: p, rotationY: yaw };
    }
    if (item.placement === 'ceiling') {
      const ground = app.groundPoint(e);
      if (!ground) return null;
      const top = level.elevation + level.height;
      return { kind: 'object', position: v3(ground.x, top - size[1], ground.z), rotationY: this.rotation };
    }
    // Floor or on top of a surface (a vase on a table).
    let point;
    if (hit && hit.normal && hit.normal.y > 0.7 && (item.placement === 'surface' || hit.entity?.kind === 'room' || hit.point.y - level.elevation < 0.02)) point = hit.point.clone();
    else point = app.groundPoint(e);
    if (!point) return null;
    let rotationY = this.rotation;
    // Near a wall: turn the back to it and touch it (furniture is usually set against walls).
    if (item.placement !== 'surface' && point.y - level.elevation < 0.02) {
      const walls = project.walls.filter((w) => w.level === level.id);
      const near = nearestWall(walls, planOf(point), size[2] / 2 + (walls[0]?.thickness ?? 0.15) / 2 + 0.25);
      if (near && !this.freeRotation) {
        const n = wallNormal(near.wall);
        const side = near.side === 'left' ? 1 : -1;
        rotationY = Math.atan2(n[0] * side, n[1] * side) + this.rotation;
        const d = wallDir(near.wall);
        const base = [near.wall.a[0] + d[0] * near.t, near.wall.a[1] + d[1] * near.t];
        const gap = (near.wall.thickness ?? 0.15) / 2 + size[2] / 2 + 0.005;
        point.x = base[0] + n[0] * side * gap;
        point.z = base[1] + n[1] * side * gap;
      }
    }
    return { kind: 'object', position: point, rotationY };
  }

  move(e) {
    const where = this.placement(e);
    this.where = where;
    if (!this.ghost) return;
    this.ghost.visible = Boolean(where);
    if (where) {
      this.ghost.position.copy(where.position);
      this.ghost.rotation.set(0, where.rotationY, 0);
      if (where.kind === 'opening') this.app.overlay.label('place', where.position, `${formatLength(where.offset, this.app.units())}`, { kind: 'info' });
      else this.app.overlay.clearLabel('place');
    }
    this.app.viewport.requestRender();
  }

  up(e) {
    const where = this.where ?? this.placement(e);
    if (!where) { this.app.notify('info', this.app.t(this.item.placement === 'opening' ? 'notice.needWall' : 'notice.cannotPlace')); return; }
    const app = this.app;
    const level = app.level();
    if (where.kind === 'opening') {
      const id = newId('op');
      app.change('op.placeOpening', (project) => {
        project.openings.push({ id, wall: where.wall.id, item: this.item.id, offset: where.offset, width: where.width, height: where.height, sill: where.sill, side: where.side, flip: false, params: { ...this.params } });
      }, ['openings']);
      app.select([id]);
    } else {
      const id = newId('ob');
      app.change('op.place', (project) => {
        project.objects.push({ id, level: level.id, item: this.item.id, params: { ...this.params }, position: [where.position.x, where.position.y - level.elevation, where.position.z], rotation: [0, where.rotationY, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' });
      }, ['objects']);
      app.select([id]);
    }
    if (!this.sticky) app.setTool('select');
  }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === '[' || k === ']' || k === 'r' || k === ',' || k === '.') {
      this.rotation += (k === '[' || k === ',' ? -1 : 1) * (e.shiftKey ? Math.PI / 12 : Math.PI / 2);
      this.app.viewport.requestRender();
      return true;
    }
    if (k === 'alt') { this.freeRotation = !this.freeRotation; return true; }
    return false;
  }
}

// ───────────────────────── Wall

export class WallTool extends Tool {
  id = 'wall';
  get cursor() { return 'crosshair'; }
  vcbLabel() { return 'vcb.length'; }

  activate() { this.points = []; this.lock = null; }

  move(e) {
    const from = this.points.at(-1) ?? null;
    const snap = snapAt(this.app, e, from, this.lock);
    this.snap = snap;
    if (!snap) return;
    showSnap(this.app, snap, from ? v3(from[0], this.app.level().elevation, from[1]) : null);
    this.preview();
  }

  preview() {
    const app = this.app;
    const y = app.level().elevation;
    const pts = this.points.map(([x, z]) => v3(x, y, z));
    if (this.snap && pts.length) pts.push(this.snap.world);
    app.overlay.polyline('wall', pts, { color: '#1f2937' });
    // The wall's thickness as an outline, so the user sees what will be built.
    const s = app.settings();
    if (pts.length >= 2) {
      const a = pts.at(-2); const b = pts.at(-1);
      const d = b.clone().sub(a).setY(0);
      const len = d.length();
      if (len > 1e-6) {
        d.normalize();
        const n = v3(-d.z, 0, d.x).multiplyScalar(s.defaultWallThickness / 2);
        app.overlay.polyline('wall-outline', [a.clone().add(n), b.clone().add(n), b.clone().sub(n), a.clone().sub(n)], { color: '#2a5bd7', closed: true });
        app.overlay.label('len', a.clone().add(b).multiplyScalar(0.5), formatLength(len, app.units()), { kind: 'length', dx: 0, dy: -22 });
        app.setVcb('vcb.length', formatLength(len, app.units(), { suffix: false }));
      }
    } else { app.overlay.clear('wall-outline'); app.overlay.clearLabel('len'); }
  }

  up(e) {
    const snap = this.snap ?? snapAt(this.app, e, this.points.at(-1) ?? null, this.lock);
    if (!snap) return;
    this.addPoint(snap.point, snap);
  }

  addPoint(point, snap = null) {
    const app = this.app;
    const last = this.points.at(-1);
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.01) { this.finish(); return; }
    if (last) {
      const level = app.level();
      const s = app.settings();
      const id = newId('w');
      app.change('op.wall', (project) => {
        project.walls.push({ id, level: level.id, a: [...last], b: [...point], thickness: s.defaultWallThickness, height: null, material: {} });
      }, ['walls']);
    }
    this.points.push(point);
    // Closing the loop on the first point ends the chain (a room's walls are done).
    if (this.points.length > 2 && Math.hypot(point[0] - this.points[0][0], point[1] - this.points[0][1]) < 0.01) { this.finish(); return; }
    if (snap?.kind === 'endpoint' && this.points.length > 1 && snap.ref && this.points.length > 2) { /* joined an existing wall: keep drawing */ }
    this.preview();
  }

  finish() {
    this.points = [];
    this.lock = null;
    this.app.overlay.reset();
    this.app.setVcb('vcb.length', '');
  }

  dblclick() { this.finish(); }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'enter') { if (this.points.length) { this.finish(); return true; } return false; }
    if (k === 'shift' && this.snap && this.points.length) {
      const from = this.points.at(-1);
      const d = [this.snap.point[0] - from[0], this.snap.point[1] - from[1]];
      const l = Math.hypot(d[0], d[1]);
      if (l > 1e-6) this.lock = [d[0] / l, d[1] / l];
      return true;
    }
    if (k === 'arrowright' || k === 'arrowleft') { this.lock = this.lock?.axis === 'axisX' ? null : Object.assign([1, 0], { axis: 'axisX' }); return true; }
    if (k === 'arrowup' || k === 'arrowdown') { this.lock = this.lock?.axis === 'axisZ' ? null : Object.assign([0, 1], { axis: 'axisZ' }); return true; }
    return false;
  }

  keyUp(e) { if (e.key === 'Shift') this.lock = null; }

  /** Typed length: a wall of that length in the current direction. */
  vcb(text) {
    const value = parseLength(text, this.app.units());
    const from = this.points.at(-1);
    if (value == null || !from || !this.snap) return false;
    const len = Array.isArray(value) ? value[0] : value;
    const d = [this.snap.point[0] - from[0], this.snap.point[1] - from[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    this.addPoint([from[0] + (d[0] / l) * len, from[1] + (d[1] / l) * len]);
    return true;
  }
}

// ───────────────────────── Room (click inside walls → room; or draw its outline)

export class RoomTool extends Tool {
  id = 'room';
  get cursor() { return 'crosshair'; }
  vcbLabel() { return 'vcb.length'; }
  activate() { this.points = []; }

  move(e) {
    const app = this.app;
    const from = this.points.at(-1) ?? null;
    const snap = snapAt(app, e, from);
    this.snap = snap;
    if (!snap) return;
    const y = app.level().elevation + 0.01;
    if (!this.points.length) {
      // Hovering inside walls: show the room that one click would make.
      const project = app.project();
      const walls = project.walls.filter((w) => w.level === app.level().id);
      const poly = detectRoom(walls, snap.point, app.level().id);
      this.detected = poly;
      if (poly) {
        app.overlay.polygon('room', poly.map(([x, z]) => v3(x, y, z)), { color: '#2a9d5b', opacity: 0.25 });
        app.overlay.label('area', snap.world, formatArea(polygonArea(poly), app.units()), { kind: 'length' });
      } else { app.overlay.clear('room'); app.overlay.clearLabel('area'); }
      showSnap(app, snap, null);
      return;
    }
    showSnap(app, snap, v3(from[0], y, from[1]));
    const pts = [...this.points, snap.point].map(([x, z]) => v3(x, y, z));
    app.overlay.polyline('room-line', pts, { color: '#2a9d5b', closed: true });
    app.overlay.polygon('room', pts, { color: '#2a9d5b', opacity: 0.18 });
  }

  up() {
    const app = this.app;
    const snap = this.snap;
    if (!snap) return;
    if (!this.points.length && this.detected) {
      this.create(this.detected);
      return;
    }
    if (this.points.length >= 3 && Math.hypot(snap.point[0] - this.points[0][0], snap.point[1] - this.points[0][1]) < 0.02) { this.create(this.points); return; }
    this.points.push(snap.point);
    app.overlay.clear('room');
  }

  create(points) {
    const app = this.app;
    const level = app.level();
    const project = app.project();
    const exists = project.rooms.some((r) => r.level === level.id && r.points.length === points.length && r.points.every((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]) < 1e-3));
    if (exists) { app.notify('info', app.t('notice.roomExists')); return; }
    const id = newId('rm');
    const n = project.rooms.length + 1;
    app.change('op.room', (p) => { p.rooms.push({ id, level: level.id, name: app.t('room.defaultName', { n }), points: points.map((q) => [...q]), floor: 'floor-oak', ceiling: 'wall-paint-white', showCeiling: false }); }, ['rooms']);
    app.select([id]);
    this.points = [];
    app.overlay.reset();
  }

  dblclick() { if (this.points.length >= 3) this.create(this.points); }
  key(e) { if (e.key === 'Escape' && this.points.length) { this.points = []; this.app.overlay.reset(); return true; } if (e.key === 'Enter' && this.points.length >= 3) { this.create(this.points); return true; } return false; }
}

// ───────────────────────── Move / Rotate / Scale (selected entities; SketchUp two-click style)

export class MoveTool extends Tool {
  id = 'move';
  get cursor() { return 'move'; }
  vcbLabel() { return 'vcb.distance'; }
  activate() { this.start = null; this.copy = false; }

  pointOf(e) {
    const app = this.app;
    const hit = app.viewport.pick(e.clientX, e.clientY, { filter: (ent) => !this.start || !ent || !this.ids?.includes(ent.id) });
    if (this.start) {
      // Moving: on the horizontal plane through the start point, with axis inference from it.
      const p = app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, this.start, new THREE.Vector3(0, 1, 0));
      if (!p) return null;
      const snap = snapPlan(planOf(p), { ...levelSnapData(app), from: planOf(this.start), pixel: app.viewport.pixelSizeAt(p), lockDir: this.lock });
      return { world: v3(snap.point[0], this.start.y, snap.point[1]), kind: snap.kind };
    }
    return hit ? { world: hit.point, kind: 'onFace', entity: hit.entity } : (app.groundPoint(e) ? { world: app.groundPoint(e), kind: 'ground' } : null);
  }

  down(e) {
    const app = this.app;
    if (this.start) return;
    let ids = app.selection();
    const p = this.pointOf(e);
    if (!p) return;
    if (!ids.length && p.entity) { ids = [p.entity.id]; app.select(ids); }
    ids = ids.filter((id) => !app.isLocked(id));
    if (!ids.length) { app.notify('info', app.t('notice.selectFirst')); return; }
    this.ids = ids;
    this.start = p.world.clone();
    this.last = p.world.clone();
    this.copy = e.ctrlKey || e.metaKey;
    if (this.copy) { this.ids = app.duplicateEntities(ids, { live: true }); app.select(this.ids); }
  }

  move(e) {
    const p = this.pointOf(e);
    if (!p) return;
    if (!this.start) { showInference(this.app.overlay, { point: p.world, kind: p.kind === 'onFace' ? 'onFace' : 'ground', tooltip: '' }); return; }
    const delta = p.world.clone().sub(this.last);
    this.last.copy(p.world);
    this.app.moveEntities(this.ids, delta, { live: true });
    const total = p.world.distanceTo(this.start);
    this.app.overlay.lines('move', [this.start, p.world], { color: p.kind === 'axisX' ? '#d6303b' : p.kind === 'axisZ' ? '#2f9e44' : '#555', dashed: true });
    this.app.setVcb('vcb.distance', formatLength(total, this.app.units(), { suffix: false }));
  }

  up(e) {
    if (!this.start) return;
    if (this.last.distanceTo(this.start) < 1e-6 && !this.dragged) { this.dragged = true; return; }
    this.finish();
  }

  finish() {
    this.app.commit(this.copy ? 'op.copy' : 'op.move', ['objects', 'models', 'walls', 'rooms', 'openings', 'dimensions', 'texts']);
    this.lastMove = { ids: this.ids, vector: this.last.clone().sub(this.start), copy: this.copy };
    this.start = null;
    this.dragged = false;
    this.app.overlay.reset();
  }

  vcb(text) {
    const app = this.app;
    // "x5" / "*5": more copies at the same spacing; "/5": copies divided between the first two.
    const array = String(text).trim().match(/^([x*/])\s*(\d+)$/i);
    if (array && this.lastMove?.copy) {
      const n = Number(array[2]);
      const step = array[1] === '/' ? this.lastMove.vector.clone().divideScalar(n) : this.lastMove.vector.clone();
      if (array[1] === '/') app.moveEntities(this.lastMove.ids, step.clone().sub(this.lastMove.vector), { live: true });
      let source = this.lastMove.ids;
      for (let i = 1; i < n; i++) { const copy = app.duplicateEntities(source, { live: true }); app.moveEntities(copy, step, { live: true }); source = copy; }
      app.commit('op.array', ['objects', 'models']);
      return true;
    }
    const value = parseLength(text, app.units());
    if (value == null) return false;
    if (this.start) {
      const dir = this.last.clone().sub(this.start);
      if (dir.lengthSq() < 1e-12) return false;
      const want = this.start.clone().addScaledVector(dir.normalize(), Array.isArray(value) ? value[0] : value);
      app.moveEntities(this.ids, want.clone().sub(this.last), { live: true });
      this.last.copy(want);
      this.finish();
      return true;
    }
    if (this.lastMove) {
      const dir = this.lastMove.vector.clone().normalize();
      const want = dir.multiplyScalar(Array.isArray(value) ? value[0] : value);
      app.moveEntities(this.lastMove.ids, want.clone().sub(this.lastMove.vector), { live: true });
      this.lastMove.vector = want;
      app.commit('op.move', ['objects', 'models', 'walls', 'rooms', 'openings']);
      return true;
    }
    return false;
  }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape' && this.start) {
      this.app.moveEntities(this.ids, this.start.clone().sub(this.last), { live: true });
      if (this.copy) this.app.deleteEntities(this.ids, { live: true });
      this.start = null; this.app.overlay.reset(); this.app.live();
      return true;
    }
    if (k === 'arrowright' || k === 'arrowleft') { this.lock = this.lock?.axis === 'axisX' ? null : Object.assign([1, 0], { axis: 'axisX' }); return true; }
    if (k === 'arrowup' || k === 'arrowdown') { this.lock = this.lock?.axis === 'axisZ' ? null : Object.assign([0, 1], { axis: 'axisZ' }); return true; }
    if (k === 'control') { this.copyToggle = true; return true; }
    return false;
  }
}

export class RotateTool extends Tool {
  id = 'rotate';
  get cursor() { return 'crosshair'; }
  vcbLabel() { return 'vcb.angle'; }
  activate() { this.stage = 0; }

  down(e) {
    const app = this.app;
    const ground = app.groundPoint(e, { surface: true });
    if (!ground) return;
    if (this.stage === 0) {
      let ids = app.selection();
      const hit = app.viewport.pick(e.clientX, e.clientY);
      if (!ids.length && hit?.entity) { ids = [hit.entity.id]; app.select(ids); }
      this.ids = ids.filter((id) => !app.isLocked(id));
      if (!this.ids.length) { app.notify('info', app.t('notice.selectFirst')); return; }
      const snap = snapAt(app, e);
      this.center = snap ? snap.world.clone() : ground.clone();
      this.center.y = ground.y;
      this.stage = 1;
    } else if (this.stage === 1) {
      this.startDir = ground.clone().sub(this.center).setY(0);
      if (this.startDir.lengthSq() < 1e-8) return;
      this.startDir.normalize();
      this.angle = 0;
      this.stage = 2;
    } else if (this.stage === 2) this.finish();
  }

  move(e) {
    const app = this.app;
    const ground = app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, this.center ?? app.groundPoint(e) ?? v3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    if (!ground) return;
    if (this.stage === 0) { app.overlay.protractor('prot', ground, new THREE.Vector3(0, 1, 0), app.viewport.pixelSizeAt(ground) * 40); return; }
    app.overlay.protractor('prot', this.center, new THREE.Vector3(0, 1, 0), app.viewport.pixelSizeAt(this.center) * 40);
    if (this.stage === 1) { app.overlay.lines('ray', [this.center, ground], { color: '#555', dashed: true }); return; }
    const dir = ground.clone().sub(this.center).setY(0).normalize();
    let angle = Math.atan2(this.startDir.z * dir.x - this.startDir.x * dir.z, this.startDir.x * dir.x + this.startDir.z * dir.z);
    // Snap to 15° steps within 2° (protractor ticks), like SketchUp.
    const deg = (angle * 180) / Math.PI;
    const snapped = Math.round(deg / 15) * 15;
    if (Math.abs(deg - snapped) < 2.5) angle = (snapped * Math.PI) / 180;
    this.applyAngle(angle);
    app.overlay.lines('ray', [this.center, this.center.clone().addScaledVector(this.startDir, 1.5), this.center, this.center.clone().addScaledVector(dir, 1.5)], { color: '#2e6fd6' });
    app.setVcb('vcb.angle', ((angle * 180) / Math.PI).toFixed(1));
  }

  applyAngle(angle) {
    const delta = angle - (this.angle ?? 0);
    this.angle = angle;
    this.app.rotateEntities(this.ids, this.center, -delta, { live: true });
  }

  finish() {
    this.app.commit('op.rotate', ['objects', 'models', 'walls', 'rooms', 'openings']);
    this.stage = 0;
    this.app.overlay.reset();
  }

  vcb(text) {
    const v = Number(String(text).replace('°', ''));
    if (!Number.isFinite(v) || this.stage < 1) {
      // Without a rotation in progress: rotate the selection by the angle around its own centre.
      if (Number.isFinite(v) && this.app.selection().length) { this.app.rotateSelection(-(v * Math.PI) / 180); return true; }
      return false;
    }
    if (this.stage === 1) { this.startDir = v3(1, 0, 0); this.angle = 0; }
    this.applyAngle((v * Math.PI) / 180);
    this.finish();
    return true;
  }

  key(e) { if (e.key === 'Escape' && this.stage) { if (this.stage === 2) this.applyAngle(0); this.app.live(); this.stage = 0; this.app.overlay.reset(); return true; } return false; }
}

export class ScaleTool extends Tool {
  id = 'scale';
  get cursor() { return 'nwse-resize'; }
  vcbLabel() { return 'vcb.scale'; }

  down(e) {
    const app = this.app;
    if (this.drag) { this.finish(); return; }
    let ids = app.selection().filter((id) => ['object', 'model'].includes(app.kindOf(id)));
    const hit = app.viewport.pick(e.clientX, e.clientY);
    if (!ids.length && hit?.entity && ['object', 'model'].includes(hit.entity.kind)) { ids = [hit.entity.id]; app.select(ids); }
    if (!ids.length) { app.notify('info', app.t('notice.selectObject')); return; }
    const box = new THREE.Box3();
    for (const id of ids) { const b = app.builder.worldBox(id); if (b) box.union(b); }
    this.center = box.getCenter(new THREE.Vector3()).setY(box.min.y);
    const start = app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, this.center);
    this.startDist = Math.max(1e-3, start ? start.distanceTo(this.center) : 1);
    this.ids = ids;
    this.factor = 1;
    this.drag = true;
  }

  move(e) {
    if (!this.drag) return;
    const p = this.app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, this.center);
    if (!p) return;
    let f = p.distanceTo(this.center) / this.startDist;
    if (Math.abs(f - Math.round(f * 10) / 10) < 0.015) f = Math.round(f * 10) / 10;
    this.setFactor(Math.max(0.05, f));
  }

  setFactor(f) {
    const ratio = f / this.factor;
    this.factor = f;
    this.app.scaleEntities(this.ids, this.center, ratio, { live: true });
    this.app.setVcb('vcb.scale', f.toFixed(2));
  }

  finish() { this.drag = false; this.app.commit('op.scale', ['objects', 'models']); }

  vcb(text) {
    const f = Number(text);
    if (!Number.isFinite(f) || f <= 0) return false;
    if (!this.drag) {
      const ids = this.app.selection();
      if (!ids.length) return false;
      const box = new THREE.Box3();
      for (const id of ids) { const b = this.app.builder.worldBox(id); if (b) box.union(b); }
      this.center = box.getCenter(new THREE.Vector3()).setY(box.min.y);
      this.ids = ids; this.factor = 1;
    }
    this.setFactor(f);
    this.finish();
    return true;
  }

  key(e) { if (e.key === 'Escape' && this.drag) { this.setFactor(1); this.drag = false; this.app.live(); return true; } return false; }
}

// ───────────────────────── Eraser and paint bucket

export class EraserTool extends Tool {
  id = 'eraser';
  get cursor() { return 'not-allowed'; }

  down(e) { this.erasing = new Set(); this.hit(e); }
  move(e) {
    const hit = this.app.viewport.pick(e.clientX, e.clientY, { includeLines: true });
    this.app.setHover(hit?.entity?.id ?? null);
    if (this.erasing) this.hit(e);
  }
  hit(e) {
    const hit = this.app.viewport.pick(e.clientX, e.clientY, { includeLines: true });
    // Modelled geometry: erase the edge or face itself, not the whole model.
    if (hit?.entity?.kind === 'model' && this.app.eraseModel?.(e)) return;
    if (hit?.entity && !this.app.isLocked(hit.entity.id)) { this.erasing.add(hit.entity.id); this.app.setHover(hit.entity.id); this.app.markErase([...this.erasing]); }
  }
  up() {
    const ids = [...(this.erasing ?? [])];
    this.erasing = null;
    this.app.markErase([]);
    if (ids.length) this.app.deleteEntities(ids);
  }
}

export class PaintTool extends Tool {
  id = 'paint';
  get cursor() { return 'cell'; }
  hint() { return 'hint.paint'; }

  move(e) {
    const hit = this.app.viewport.pick(e.clientX, e.clientY);
    this.app.setHover(hit?.entity?.id ?? null);
  }

  up(e) {
    const app = this.app;
    const hit = app.viewport.pick(e.clientX, e.clientY);
    if (!hit?.entity) return;
    // Alt+click: take the material under the cursor (eyedropper).
    if (e.altKey) {
      const m = Array.isArray(hit.object.material) ? hit.object.material[geometryGroupOf(hit)] : hit.object.material;
      const preset = (hit.object.userData.baseMaterial ? (Array.isArray(hit.object.userData.baseMaterial) ? hit.object.userData.baseMaterial[geometryGroupOf(hit)] : hit.object.userData.baseMaterial) : m)?.userData?.preset;
      if (preset) app.setBrush(preset);
      return;
    }
    app.paintHit(hit, app.brush());
  }
}

export function geometryGroupOf(hit) {
  const g = hit.object.geometry;
  if (!g.groups?.length || hit.faceIndex == null) return 0;
  const index = hit.faceIndex * 3;
  const group = g.groups.find((gr) => index >= gr.start && index < gr.start + gr.count);
  return group?.materialIndex ?? 0;
}

// ───────────────────────── Tape measure, dimension, text, section plane

function pickPoint3(app, e) {
  const hit = app.viewport.pick(e.clientX, e.clientY);
  if (hit) {
    // Snap to the nearest corner of the hit object's box when close (cheap endpoint inference for props).
    return { point: hit.point.clone(), kind: 'onFace', normal: hit.normal };
  }
  const g = app.groundPoint(e);
  return g ? { point: g, kind: 'ground' } : null;
}

export class TapeTool extends Tool {
  id = 'tape';
  get cursor() { return 'crosshair'; }
  vcbLabel() { return 'vcb.length'; }
  activate() { this.start = null; }
  move(e) {
    const app = this.app;
    const p = this.start ? snapAt(app, e, planOf(this.start)) : snapAt(app, e);
    const q = pickPoint3(app, e);
    const point = q && q.kind === 'onFace' && (!p || p.kind === 'free' || p.kind === 'grid') ? q.point : p?.world ?? q?.point;
    if (!point) return;
    this.current = point;
    showInference(app.overlay, { point, kind: p && p.kind !== 'free' ? (p.kind === 'aligned' ? 'parallel' : p.kind) : q?.kind ?? 'ground', tooltip: p && TIP[p.kind] ? app.t(TIP[p.kind]) : '' }, { from: this.start });
    if (this.start) {
      const len = point.distanceTo(this.start);
      app.overlay.lines('tape', [this.start, point], { color: '#c2410c', dashed: true });
      app.overlay.label('tape', point.clone().add(this.start).multiplyScalar(0.5), formatLength(len, app.units()), { kind: 'length', dx: 0, dy: -24 });
      app.setVcb('vcb.length', formatLength(len, app.units(), { suffix: false }));
    }
  }
  up() {
    if (!this.current) return;
    if (!this.start) { this.start = this.current.clone(); return; }
    const app = this.app;
    const len = this.current.distanceTo(this.start);
    app.notify('info', app.t('notice.measured', { length: formatLength(len, app.units()) }));
    // A guide line remains (SketchUp's tape leaves construction geometry), removable with Edit › Delete guides.
    const a = this.start.toArray(); const b = this.current.toArray();
    app.change('op.guide', (project) => { project.guides.push({ id: newId('g'), a, b }); }, ['guides']);
    this.start = null;
    app.overlay.reset();
  }
  key(e) { if (e.key === 'Escape' && this.start) { this.start = null; this.app.overlay.reset(); return true; } return false; }
}

export class DimensionTool extends Tool {
  id = 'dimension';
  get cursor() { return 'crosshair'; }
  activate() { this.points = []; }
  pointAt(e) {
    const app = this.app;
    const snap = snapAt(app, e, this.points[0] ? planOf(this.points[0]) : null);
    const q = pickPoint3(app, e);
    if (q?.kind === 'onFace' && (!snap || snap.kind === 'free' || snap.kind === 'grid')) return q.point;
    return snap?.world ?? q?.point ?? null;
  }
  move(e) {
    const app = this.app;
    const p = this.pointAt(e);
    if (!p) return;
    showInference(app.overlay, { point: p, kind: 'endpoint', tooltip: '' });
    if (this.points.length === 1) {
      app.overlay.lines('dim', [this.points[0], p], { color: '#111' });
      app.overlay.label('dim', p.clone().add(this.points[0]).multiplyScalar(0.5), formatLength(p.distanceTo(this.points[0]), app.units()), { kind: 'length', dx: 0, dy: -22 });
    } else if (this.points.length === 2) {
      const [a, b] = this.points;
      const offset = offsetOf(a, b, p);
      app.overlay.lines('dim', dimensionLines(a, b, offset), { color: '#111' });
      app.overlay.label('dim', a.clone().add(b).multiplyScalar(0.5).add(offset), formatLength(a.distanceTo(b), app.units()), { kind: 'length', dx: 0, dy: -22 });
    }
  }
  up(e) {
    const p = this.pointAt(e);
    if (!p) return;
    this.points.push(p);
    if (this.points.length === 3) {
      const [a, b, c] = this.points;
      const offset = offsetOf(a, b, c);
      this.app.change('op.dimension', (project) => { project.dimensions.push({ id: newId('dm'), a: a.toArray(), b: b.toArray(), offset: offset.toArray() }); }, ['dimensions']);
      this.points = [];
      this.app.overlay.reset();
    }
  }
  key(e) { if (e.key === 'Escape' && this.points.length) { this.points = []; this.app.overlay.reset(); return true; } return false; }
}

/** Offset of a dimension line: the part of (c − a) perpendicular to ab (horizontal dimensions stay in their plane). */
export function offsetOf(a, b, c) {
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const t = ab.lengthSq() ? ac.dot(ab) / ab.lengthSq() : 0;
  return ac.sub(ab.multiplyScalar(t));
}

/** Extension lines, the dimension line and its ticks. */
export function dimensionLines(a, b, offset) {
  const a2 = a.clone().add(offset); const b2 = b.clone().add(offset);
  const dir = b.clone().sub(a).normalize();
  const tick = offset.clone().normalize().multiplyScalar(0.04).add(dir.clone().multiplyScalar(0.04));
  const over = offset.clone().normalize().multiplyScalar(0.05);
  return [a, a2.clone().add(over), b, b2.clone().add(over), a2, b2, a2.clone().sub(tick), a2.clone().add(tick), b2.clone().sub(tick), b2.clone().add(tick)];
}

export class TextTool extends Tool {
  id = 'text';
  get cursor() { return 'text'; }
  async up(e) {
    const app = this.app;
    const q = pickPoint3(app, e);
    if (!q) return;
    let text = '';
    if (q.kind === 'onFace') {
      const hit = app.viewport.pick(e.clientX, e.clientY);
      text = hit?.entity ? app.describeEntity(hit.entity.id) : '';
    }
    const value = await app.prompt({ title: app.t('action.text'), label: app.t('text.label'), value: text });
    if (!value) return;
    app.change('op.text', (project) => { project.texts.push({ id: newId('tx'), point: q.point.toArray(), text: value }); }, ['texts']);
  }
}

export class SectionTool extends Tool {
  id = 'section';
  get cursor() { return 'crosshair'; }
  move(e) {
    const hit = this.app.viewport.pick(e.clientX, e.clientY);
    if (!hit?.normal) { this.app.overlay.clear('section'); return; }
    const n = hit.normal.clone();
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? v3(1, 0, 0) : v3(0, 1, 0)).normalize().multiplyScalar(0.6);
    const w = new THREE.Vector3().crossVectors(n, u).normalize().multiplyScalar(0.6);
    const c = hit.point;
    this.app.overlay.polyline('section', [c.clone().add(u).add(w), c.clone().sub(u).add(w), c.clone().sub(u).sub(w), c.clone().add(u).sub(w)], { color: '#e8590c', closed: true });
    this.app.overlay.lines('section-n', [c, c.clone().addScaledVector(n, 0.4)], { color: '#e8590c' });
  }
  up(e) {
    const hit = this.app.viewport.pick(e.clientX, e.clientY);
    if (!hit?.normal) return;
    // The plane cuts away what is in front of the clicked face (its normal points into the removed half).
    const n = hit.normal.clone().negate();
    this.app.change('op.section', (project) => {
      for (const s of project.sections) s.active = false;
      project.sections.push({ id: newId('sc'), point: hit.point.toArray(), normal: n.toArray(), active: true });
    }, ['sections']);
    this.app.setTool('select');
  }
}

export class WalkTool extends Tool {
  id = 'walk';
  get cursor() { return 'grab'; }
  activate() { this.app.viewport.startWalk(); }
  deactivate() { this.app.viewport.stopWalk(); this.app.overlay.reset(); }
  down(e) { this.look = { x: e.clientX, y: e.clientY }; }
  move(e) { if (!this.look) return; this.app.viewport.walkLook(e.clientX - this.look.x, e.clientY - this.look.y); this.look = { x: e.clientX, y: e.clientY }; }
  up() { this.look = null; }
  key(e) { return this.app.viewport.walkKey(e.key, true); }
  keyUp(e) { return this.app.viewport.walkKey(e.key, false); }
}

/** Navigation tools: the viewport handles the left button itself while one of these is active. */
export class NavTool extends Tool {
  constructor(app, id) { super(app); this.id = id; }
  get cursor() { return this.id === 'pan' ? 'grab' : this.id === 'zoom' ? 'zoom-in' : 'move'; }
  activate() { this.app.viewport.navTool = this.id; }
  deactivate() { this.app.viewport.navTool = null; }
}

export { pointInPolygon, wallHeight };
