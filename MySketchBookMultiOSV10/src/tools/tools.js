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
import { detectRoom, nearestWall, wallDir, wallFootprints, wallLength, wallNormal, projectOnSegment, pointInPolygon } from '../engine/walls.js';
import { formatLength, newId, parseLength, polygonArea, formatArea, wallHeight } from '../engine/document.js';
import { showInference } from '../engine/overlay.js';
import { placeStairs as stairsPlace, riseToNextLevel as stairsRiseToNextLevel, stairInfo as stairsInfo, toWorld as stairsToWorld } from '../engine/stairs.js';
import { catalogItem as stairsCatalogItem } from '../library/catalog.js';
import { itemParams } from '../library/catalog.js';
import {
  arcCurve, arcFromRadius, arcFromThreePoints, arcWallSegments, attachColumn, columnFootprint, columnSnapPoints, columnsOf, curveChain, faceToCentre,
  isColumn, moveWallEnd, moveWallParallel, offsetPolyline, planSnapshot, rectangleSegments, refitRooms, restorePlan, roomsAfterWalls, splitWallsAtColumns,
} from '../engine/planedit.js';

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
  const points = [...columnSnapPoints(project, level.id), ...project.rooms.filter((r) => r.level === level.id).flatMap((r) => r.points.map((q) => [q, 'endpoint']))];
  return { walls, points };
}

function snapAt(app, e, from = null, lockDir = null, { exclude = null, extra = [] } = {}) {
  const ground = app.groundPoint(e);
  if (!ground) return null;
  const data = levelSnapData(app);
  const walls = exclude ? data.walls.filter((w) => !exclude.has(w.id)) : data.walls;
  const points = [...data.points, ...extra];
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

/**
 * What is under the pointer for the Select tool. In the 2D plan a structural column wins over the walls it
 * stands in (they are equally tall), and a wall is found by its footprint (the plan's section cut hides its
 * top from the picking ray); doors, windows and furniture picked first stay first.
 */
function selectHit(app, e) {
  const col = columnUnder(app, e);
  if (col) return col;
  const hit = app.viewport.pick(e.clientX, e.clientY, { lamps: true });
  if (hit?.entity && hit.entity.kind !== 'room') return hit;
  return wallUnder(app, e) ?? hit;
}

function wallUnder(app, e) {
  if (!app.viewport.planMode) return null;
  const g = app.groundPoint(e);
  if (!g) return null;
  const level = app.level().id;
  const walls = app.project().walls.filter((w) => w.level === level && !w.hidden);
  const fps = wallFootprints(walls);
  const wall = walls.find((w) => fps.get(w.id) && pointInPolygon([g.x, g.z], fps.get(w.id)));
  return wall ? { entity: { id: wall.id, kind: 'wall' }, point: g, object: null } : null;
}

/** In the 2D plan a structural column wins over the walls it stands in (they are equally tall), so it can be picked and dragged. */
function columnUnder(app, e) {
  if (!app.viewport.planMode) return null;
  const g = app.groundPoint(e);
  if (!g) return null;
  const col = columnsOf(app.project(), app.level().id).find((o) => !o.hidden && pointInPolygon([g.x, g.z], columnFootprint(o)));
  return col ? { entity: { id: col.id, kind: 'object' }, point: g, object: app.builder.objectOf(col.id) } : null;
}

// ───────────────────────── dragging furniture with the mouse

const UP = new THREE.Vector3(0, 1, 0);

/**
 * How a dragged selection follows the pointer (select tool and Move tool):
 *  - 'floor': on the horizontal plane through the base of what is dragged — not through the grab point: grabbed high
 *    up and seen from a low eye, that plane was nearly edge-on and the piece hardly moved towards or away from you;
 *  - 'wall': a wall item (picture, sconce, wall camera …) slides on its wall: along it and up and down;
 *  - 'vertical': straight up and down (↑ / PageUp while dragging), on the upright plane facing the camera.
 * `drag` = { ids, start (world grab point), mode }; returns { mode, base (world point on the drag surface) }.
 */
export function dragSurface(app, ids, start, mode = null) {
  const p = app.project();
  const objects = ids.map((id) => p.objects.find((o) => o.id === id)).filter(Boolean);
  const single = objects.length === 1 && ids.length === 1 ? objects[0] : null;
  const item = single ? stairsCatalogItem(single.item) : null;
  const planMode = app.viewport.planMode;
  let m = mode;
  if (!m) m = !planMode && item?.placement === 'wall' ? 'wall' : 'floor';
  if (planMode && m !== 'floor') m = 'floor';
  const out = { mode: m, start: start.clone(), normal: UP.clone(), point: start.clone() };
  if (m === 'wall') {
    const ry = single.rotation?.[1] ?? 0;
    out.normal.set(Math.sin(ry), 0, Math.cos(ry));
  } else if (m === 'vertical') {
    const toCam = new THREE.Vector3().subVectors(app.viewport.camera.position, start).setY(0);
    if (toCam.lengthSq() < 1e-8) toCam.set(0, 0, 1);
    out.normal.copy(toCam.normalize());
  } else {
    // The base of the dragged things (lowest point), so the plane is the floor under them.
    let base = start.y;
    for (const id of ids) { const b = app.builder?.worldBox?.(id); if (b && Number.isFinite(b.min.y)) base = Math.min(base, b.min.y); }
    out.point = new THREE.Vector3(start.x, base, start.z);
  }
  return out;
}

/** The pointer on a drag surface (dragSurface) → world point, or null. Vertical keeps x and z of the start. */
export function dragPointer(app, e, surface) {
  const p = app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, surface.point, surface.normal);
  if (!p) return null;
  // Near the horizon a plane seen almost edge-on throws the point kilometres away: ignore such jumps.
  if (p.distanceTo(surface.point) > 200) return null;
  if (surface.mode === 'vertical') return new THREE.Vector3(surface.start.x, p.y, surface.start.z);
  return p;
}

export class SelectTool extends Tool {
  id = 'select';
  get cursor() { return 'default'; }

  activate() { this.hotGrip = null; this.lastGrip = null; drawWallGrips(this.app, this); }
  deactivate() { this.app.overlay.reset(); this.gripDrag = null; this.rotDrag = null; }
  hint() { return wallGrips(this.app).length ? 'hint.wallGrip' : super.hint(); }

  down(e) {
    const app = this.app;
    this.lastGrip = null;
    // The selected furniture's rotation grip: drag to turn it about its centre.
    const turn = rotateGripAt(app, e);
    if (turn) {
      this.press = { x: e.clientX, y: e.clientY, grip: true };
      this.rotDrag = { ...turn, startAngle: angleAround(turn, this.planAt(e, turn.world)), applied: 0, unwrapped: 0, last: null, started: false };
      return;
    }
    // Grips of the selected wall come before anything in the scene.
    const grip = gripAt(app, e);
    if (grip) {
      this.press = { x: e.clientX, y: e.clientY, grip: true };
      const level = app.level().id;
      this.gripDrag = { grip, wall: grip.wall, end: grip.kind, snap: planSnapshot(app.project(), level), level, started: false, startPlan: this.gripPlane(e, grip) };
      return;
    }
    const hit = selectHit(app, e);
    const entity = hit?.entity;
    this.press = { x: e.clientX, y: e.clientY, entity, hit, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    if (entity?.kind === 'sun') {
      // The sun marker: drag to move the light (2D: its direction), click for its properties.
      this.sunDrag = { moved: false };
      return;
    }
    if (entity?.lamp && !this.press.shift && !this.press.ctrl && !app.isLocked(entity.id)) {
      // A lamp marker (2D and 3D) is a handle: press and drag moves the lamp at its own height right away.
      if (!app.isSelected(entity.id)) app.select([entity.id]);
      this.drag = { ids: app.selection().filter((id) => !app.isLocked(id)), start: hit.point.clone(), last: hit.point.clone(), started: false, lamp: true };
      return;
    }
    if (entity && app.isSelected(entity.id) && !this.press.shift && !this.press.ctrl && ['object', 'model'].includes(entity.kind) && !app.isLocked(entity.id)) {
      // Dragging a selected piece of furniture moves it on the floor (snapping to walls).
      this.drag = { ids: app.selection().filter((id) => !app.isLocked(id)), start: hit.point.clone(), last: hit.point.clone(), started: false };
    }
  }

  /** The pointer on the horizontal plane through `point` (a world point), as a plan point. */
  planAt(e, point) {
    const p = this.app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, point, new THREE.Vector3(0, 1, 0));
    return p ? planOf(p) : null;
  }

  /** Turning the selection with its rotation grip: whole 15° steps, Shift turns freely. */
  dragRotate(e) {
    const app = this.app;
    const r = this.rotDrag;
    if (!r.started && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) < 3) return;
    const p = this.planAt(e, r.world);
    if (!p || r.startAngle == null) return;
    r.started = true;
    // Unwrapped angle since the press (turning past ±180° keeps counting).
    const a = angleAround(r, p);
    if (r.last != null) { let d = a - r.last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; r.unwrapped += d; } else r.unwrapped = a - r.startAngle;
    r.last = a;
    const step = Math.PI / 12;
    const target = e.shiftKey ? r.unwrapped : Math.round(r.unwrapped / step) * step;
    if (Math.abs(target - r.applied) > 1e-9) { app.rotateEntities(r.ids, r.center, target - r.applied); r.applied = target; }
    const deg = Math.round((r.applied * 180) / Math.PI * 10) / 10;
    app.overlay.label('grip', r.world, `${deg > 0 ? '+' : ''}${deg}°`, { kind: 'length', dx: 14, dy: -26 });
    app.setVcb('vcb.angle', String(deg));
    drawWallGrips(app, this);
  }

  /** The pointer on the horizontal plane through a grip, as a plan point. */
  gripPlane(e, grip) {
    const p = this.app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, grip.world, new THREE.Vector3(0, 1, 0));
    return p ? planOf(p) : null;
  }

  move(e) {
    const app = this.app;
    if (this.gripDrag) { this.dragGrip(e); return; }
    if (this.rotDrag) { this.dragRotate(e); return; }
    if (this.sunDrag) {
      if (!this.sunDrag.moved && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) < 3) return;
      this.sunDrag.moved = true;
      // The press point anchors the drag: the marker stays exactly where it was grabbed.
      app.dragSun(e.clientX, e.clientY, this.press);
      return;
    }
    if (this.drag) {
      const p = this.press;
      if (!this.drag.started && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return;
      this.drag.started = true;
      this.lastPointer = { clientX: e.clientX, clientY: e.clientY };
      if (!this.drag.surface) {
        this.drag.surface = dragSurface(app, this.drag.ids, this.drag.start, this.drag.mode);
        const from = dragPointer(app, { clientX: p.x, clientY: p.y }, this.drag.surface);
        if (from) this.drag.last.copy(from);
      }
      const ground = dragPointer(app, e, this.drag.surface);
      if (!ground) return;
      const delta = ground.clone().sub(this.drag.last);
      this.drag.last.copy(ground);
      app.moveEntities(this.drag.ids, delta, { live: true });
      return;
    }
    if (this.press && (this.navigating || Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 4)) {
      // Left drag on empty space: rotate · Ctrl/⌘ (or Alt) + drag: move the view (as OrbitControls) · Shift + drag: box selection.
      const panDrag = this.press.ctrl || e.ctrlKey || e.metaKey || e.altKey;
      const navDrag = !this.press.shift && (panDrag || app.settings().leftDrag !== 'select');
      if (navDrag) {
        const vp = app.viewport;
        if (!this.navigating) { this.navigating = { x: this.press.x, y: this.press.y, pivot: panDrag ? this.press.hit?.point ?? vp.target.clone() : vp.orbitPivotAt(this.press.x, this.press.y) }; }
        const dx = e.clientX - this.navigating.x; const dy = e.clientY - this.navigating.y;
        this.navigating.x = e.clientX; this.navigating.y = e.clientY;
        vp.navigate(vp.planMode || panDrag ? 'pan' : 'orbit', dx, dy, this.navigating.pivot);
        return;
      }
      this.box = { x0: this.press.x, y0: this.press.y, x1: e.clientX, y1: e.clientY };
      app.showSelectionRect(this.box);
      return;
    }
    if (!this.press) {
      if (rotateGripAt(app, e)) { app.setHover(null); app.viewport.canvas.style.cursor = 'grab'; return; }
      const grip = gripAt(app, e);
      if ((grip?.kind ?? null) !== (this.hotGrip ?? null)) { this.hotGrip = grip?.kind ?? null; drawWallGrips(app, this); }
      if (grip) { app.setHover(null); app.viewport.canvas.style.cursor = grip.kind === 'mid' ? 'move' : 'crosshair'; return; }
      const hit = selectHit(app, e);
      app.setHover(hit?.entity?.kind === 'sun' ? null : hit?.entity?.id ?? null);
      app.viewport.canvas.style.cursor = hit?.entity?.kind === 'sun' || hit?.entity?.lamp ? 'grab' : this.cursor;
    }
  }

  /** Dragging a wall grip: every step starts again from the plan as it was when the drag began. */
  dragGrip(e) {
    const app = this.app;
    const g = this.gripDrag;
    if (!g.started && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) < 3) return;
    const cursor = this.gripPlane(e, g.grip);
    if (!cursor || !g.startPlan) return;
    g.started = true;
    g.detach = e.altKey;
    const project = app.project();
    restorePlan(project, g.snap);
    const wall = g.wall;
    const y = app.level().elevation;
    const pixel = app.viewport.pixelSizeAt(g.grip.world);
    if (g.end === 'mid') {
      const n = wallNormal(wall);
      let s = (cursor[0] - g.startPlan[0]) * n[0] + (cursor[1] - g.startPlan[1]) * n[1];
      // Line the wall up with a wall end or column centre near the cursor.
      const others = project.walls.filter((w) => w.level === g.level && w !== wall);
      const target = [g.grip.plan[0] + n[0] * s, g.grip.plan[1] + n[1] * s];
      const snap = snapPlan(target, { walls: others.filter((w) => !touches(w, wall)), points: columnSnapPoints(project, g.level), pixel });
      if (snap.kind === 'endpoint') s = (snap.point[0] - wall.a[0]) * n[0] + (snap.point[1] - wall.a[1]) * n[1];
      this.applyGrip(s);
      const from = v3(g.grip.plan[0], y, g.grip.plan[1]);
      const to = v3(g.grip.plan[0] + n[0] * s, y, g.grip.plan[1] + n[1] * s);
      showInference(app.overlay, { point: to, kind: snap.kind === 'endpoint' ? 'endpoint' : 'perpendicular', tooltip: snap.kind === 'endpoint' ? app.t('inf.endpoint') : '', lineFrom: from });
      app.overlay.label('grip', to, formatLength(Math.abs(s), app.units()), { kind: 'length', dx: 0, dy: -26 });
      app.setVcb('vcb.distance', formatLength(Math.abs(s), app.units(), { suffix: false }));
      return;
    }
    const fixed = wall[g.end === 'a' ? 'b' : 'a'];
    const snap = gripEndSnap(app, project, g, cursor, fixed, pixel);
    if (Math.hypot(snap.point[0] - fixed[0], snap.point[1] - fixed[1]) < 0.05) { app.live(); return; }
    this.applyGrip(snap.point);
    const len = Math.hypot(snap.point[0] - fixed[0], snap.point[1] - fixed[1]);
    const world = v3(snap.point[0], y, snap.point[1]);
    showInference(app.overlay, { point: world, kind: snap.kind === 'aligned' ? 'parallel' : snap.kind === 'grid' || snap.kind === 'free' ? 'ground' : snap.kind, tooltip: snap.tip ?? (TIP[snap.kind] ? app.t(TIP[snap.kind]) : ''), lineFrom: snap.guideFrom ? v3(snap.guideFrom[0], y, snap.guideFrom[1]) : null }, { from: v3(fixed[0], y, fixed[1]) });
    app.overlay.label('grip', v3((fixed[0] + snap.point[0]) / 2, y, (fixed[1] + snap.point[1]) / 2), formatLength(len, app.units()), { kind: 'length', dx: 0, dy: -22 });
    app.setVcb('vcb.length', formatLength(len, app.units(), { suffix: false }));
  }

  /** One grip step from the drag's starting plan: an end to a point, or the middle by a sideways distance. */
  applyGrip(value) {
    const app = this.app;
    const g = this.gripDrag ?? this.lastGrip;
    const project = app.project();
    restorePlan(project, g.snap);
    if (g.end === 'mid') moveWallParallel(project, g.wall, value);
    else moveWallEnd(project, g.wall, g.end, value, { detach: g.detach });
    refitRooms(project, new Set([g.level]));
    g.value = value;
    app.live();
  }

  up(e) {
    const app = this.app;
    const press = this.press;
    this.press = null;
    if (this.rotDrag) {
      const r = this.rotDrag;
      this.rotDrag = null;
      app.overlay.clearLabel('grip');
      if (r.started && Math.abs(r.applied) > 1e-9) app.commit('op.rotate', ['objects', 'models']);
      drawWallGrips(app, this);
      return;
    }
    if (this.gripDrag) {
      const g = this.gripDrag;
      this.gripDrag = null;
      app.overlay.clearLabel('grip');
      showInference(app.overlay, null);
      if (g.started && g.value != null) {
        app.commit(g.end === 'mid' ? 'op.wallOffset' : 'op.wallEnd', ['walls', 'objects', 'rooms', 'openings']);
        this.lastGrip = g;
      }
      drawWallGrips(app, this);
      return;
    }
    if (this.sunDrag) {
      const moved = this.sunDrag.moved;
      this.sunDrag = null;
      if (moved) app.dragSun(null); else app.showSunPanel();
      return;
    }
    if (this.navigating) { this.navigating = null; this.app.viewport.endNavigation(); this.app.cameraMoved?.(); return; }
    if (this.drag) {
      const drag = this.drag;
      this.drag = null;
      // Columns drag the walls joined to them, and the rooms follow the walls; a column dropped in a wall joins it.
      if (drag.started) { attachColumns(app, drag.ids); app.commit('op.move', ['objects', 'models', 'walls', 'rooms', 'openings']); return; }
      if (drag.lamp) return; // a click on a lamp marker selected it (in down)
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
    const app = this.app;
    if (gripAt(app, e)) return;
    const hit = selectHit(app, e);
    if (!hit?.entity) return;
    // A piece of a curved wall: the first double-click selects the whole curve.
    if (hit.entity.kind === 'wall') {
      const wall = app.project().walls.find((w) => w.id === hit.entity.id);
      if (wall?.curve) {
        const chain = curveChain(app.project(), wall).map((w) => w.id);
        const sel = app.selection();
        if (!(sel.length === chain.length && chain.every((id) => sel.includes(id)))) { app.select(chain); return; }
      }
    }
    app.editEntity(hit.entity.id);
  }

  /** After a grip drag: a typed length (end grip) or distance (middle grip) sets it exactly. */
  vcb(text) {
    const app = this.app;
    const g = this.gripDrag ?? this.lastGrip;
    if (!g) return false;
    const value = parseLength(text, app.units());
    if (value == null) return false;
    const v = Math.abs(Array.isArray(value) ? value[0] : value);
    const wall = g.wall;
    if (g.end === 'mid') {
      const s = (g.value ?? 1) < 0 ? -v : v;
      this.applyGrip(s);
    } else {
      if (!(v > 0.05)) return false;
      // Along the wall's direction now (from the end that stayed).
      const fixed = g.snap.walls.get(wall.id)[g.end === 'a' ? 'b' : 'a'];
      const cur = wall[g.end];
      const d = [cur[0] - fixed[0], cur[1] - fixed[1]];
      const l = Math.hypot(d[0], d[1]) || 1;
      this.applyGrip([fixed[0] + (d[0] / l) * v, fixed[1] + (d[1] / l) * v]);
    }
    const dragging = Boolean(this.gripDrag);
    this.gripDrag = null;
    this.press = null;
    app.overlay.clearLabel('grip');
    showInference(app.overlay, null);
    if (dragging) app.commit(g.end === 'mid' ? 'op.wallOffset' : 'op.wallEnd', ['walls', 'objects', 'rooms', 'openings']);
    else app.commit(g.end === 'mid' ? 'op.wallOffset' : 'op.wallLength', ['walls', 'objects', 'rooms', 'openings']);
    this.lastGrip = g;
    drawWallGrips(app, this);
    return true;
  }

  key(e) {
    const app = this.app;
    // While dragging furniture: ↑ / PageUp switches between straight up-and-down and the floor (or wall) again.
    if (this.drag?.started && ['arrowup', 'pageup'].includes(e.key.toLowerCase())) {
      const vertical = this.drag.surface?.mode !== 'vertical';
      this.drag.mode = vertical ? 'vertical' : null;
      this.drag.surface = dragSurface(app, this.drag.ids, this.drag.last, this.drag.mode);
      const from = this.lastPointer && dragPointer(app, this.lastPointer, this.drag.surface);
      if (from) this.drag.last.copy(from);
      app.notify('info', app.t(vertical ? 'hint.dragVertical' : 'hint.dragFloor'));
      return true;
    }
    if (this.rotDrag) {
      if (e.key !== 'Escape') return false;
      const r = this.rotDrag;
      if (r.applied) app.rotateEntities(r.ids, r.center, -r.applied);
      this.rotDrag = null; this.press = null;
      app.overlay.clearLabel('grip');
      drawWallGrips(app, this);
      return true;
    }
    if (this.gripDrag) {
      if (e.key === 'Escape') {
        restorePlan(app.project(), this.gripDrag.snap);
        this.gripDrag = null; this.press = null;
        app.overlay.clearLabel('grip'); showInference(app.overlay, null);
        app.live();
        drawWallGrips(app, this);
        return true;
      }
      return e.key === 'Alt';
    }
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
    // Alt + ↑ / ↓: up and down (Y), the third direction the arrows do not reach (PageUp / PageDown stay the scene keys).
    if ((k === 'arrowup' || k === 'arrowdown') && e.altKey && !e.ctrlKey && !e.metaKey) {
      app.moveEntities(ids, new THREE.Vector3(0, k === 'arrowup' ? step : -step, 0), { live: true });
      app.commit('op.nudge', ['objects', 'models']);
      return true;
    }
    return false;
  }
}

// ───────────────────────── wall grips (the ends and the middle of one selected wall)

const GRIP_PX = 9;

/** Two walls share an end (within 1 cm). */
function touches(w, wall) {
  const n = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01;
  return n(w.a, wall.a) || n(w.a, wall.b) || n(w.b, wall.a) || n(w.b, wall.b);
}

/** Grips of the one selected wall of the active level: [{ kind: 'a' | 'b' | 'mid', wall, plan, world }] (else []). */
export function wallGrips(app) {
  const project = app.project?.();
  if (!project) return [];
  const ids = app.selection();
  if (ids.length !== 1) return [];
  const wall = project.walls.find((w) => w.id === ids[0]);
  // Pieces of a curved wall are edited as one curve (double-click selects it), not end by end.
  if (!wall || wall.locked || wall.hidden || wall.curve || wall.level !== app.level().id || wallLength(wall) < 0.02) return [];
  // 2D: on the floor (under the plan's section cut); 3D: on top of the wall, where they are seen.
  const y = app.level().elevation + (app.viewport.planMode ? 0.02 : wallHeight(project, wall) + 0.005);
  const mid = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  // A wall only a few grips long on screen has no middle grip (the ends must stay easy to catch).
  const sa = app.viewport.worldToScreen(v3(wall.a[0], y, wall.a[1])); const sb = app.viewport.worldToScreen(v3(wall.b[0], y, wall.b[1]));
  const short = Math.hypot(sa.x - sb.x, sa.y - sb.y) < GRIP_PX * 5;
  return [['a', wall.a], ['b', wall.b], ...(short ? [] : [['mid', mid]])].map(([kind, p]) => ({ kind, wall, plan: [p[0], p[1]], world: v3(p[0], y, p[1]) }));
}

// ───────────────────────── rotation grip (selected furniture)

/** Screen pixels between the furniture's outline and its rotation grip. */
const ROTATE_GRIP_PX = 30;

/**
 * The rotation grip of the selection when it is only furniture / models (none locked): { ids, center, world }
 * — in front of the piece (its own front, +Z turned with it) on its top in 3D, on the floor in the 2D plan.
 */
export function rotateGrip(app) {
  const ids = app.selection?.() ?? [];
  if (!ids.length || !app.builder) return null;
  if (!ids.every((id) => ['object', 'model'].includes(app.kindOf(id)) && !app.isLocked(id))) return null;
  const box = new THREE.Box3();
  for (const id of ids) { const b = app.builder.worldBox(id); if (b) box.union(b); }
  if (box.isEmpty()) return null;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const one = ids.length === 1 ? app.builder.objectOf?.(ids[0]) : null;
  const ry = one ? new THREE.Euler().setFromQuaternion(one.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
  const y = app.viewport.planMode ? app.level().elevation + 0.02 : box.max.y + 0.01;
  const at = new THREE.Vector3(center.x, y, center.z);
  const reach = Math.max(size.x, size.z) / 2 + ROTATE_GRIP_PX * app.viewport.pixelSizeAt(at);
  const world = at.clone().add(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)).multiplyScalar(reach));
  return { ids, center: new THREE.Vector3(center.x, y, center.z), world };
}

/** Angle of a plan point around the grip's centre, counter-clockwise from above (rotateEntities' sense). */
function angleAround(grip, p) {
  if (!p) return null;
  return Math.atan2(-(p[1] - grip.center.z), p[0] - grip.center.x);
}

function rotateGripAt(app, e) {
  if (!(app.viewport && app.selection?.().length)) return null;
  const g = rotateGrip(app);
  if (!g) return null;
  const s = app.viewport.worldToScreen(g.world);
  return Math.hypot(s.x - e.clientX, s.y - e.clientY) <= GRIP_PX + 2 ? g : null;
}

function drawRotateGrip(app, tool) {
  const overlay = app.overlay;
  const g = tool instanceof SelectTool ? rotateGrip(app) : null;
  if (!g) { for (const n of ['rgrip-line', 'rgrip-ring', 'rgrip-fill']) overlay.clear(n); return; }
  overlay.lines('rgrip-line', [g.center, g.world], { color: '#f08c00', dashed: true });
  overlay.points('rgrip-ring', [g.world], { color: '#f08c00', size: 15 });
  overlay.points('rgrip-fill', [g.world], { color: '#ffffff', size: 8 });
  for (const [n, order] of [['rgrip-ring', 22], ['rgrip-fill', 23], ['rgrip-line', 21]]) { const o = overlay.layers.get(n)?.object; if (o) { o.renderOrder = order; o.userData.noPick = true; } }
}

/** The grip under the pointer (within GRIP_PX on screen), the nearest one. */
function gripAt(app, e) {
  let best = null;
  for (const g of wallGrips(app)) {
    const s = app.viewport.worldToScreen(g.world);
    if (s.behind) continue;
    const d = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    if (d <= GRIP_PX && (!best || d < best.d)) best = { ...g, d };
  }
  return best;
}

/**
 * Draws the grips of the selected wall while the Select tool is active (called by the app whenever the
 * selection or the scene changes): white squares framed in the selection blue, the middle one with a blue dot;
 * the grip under the pointer is filled orange.
 */
export function drawWallGrips(app, tool) {
  const overlay = app.overlay;
  if (!overlay) return;
  drawRotateGrip(app, tool);
  const grips = tool instanceof SelectTool && !tool.gripDrag?.started ? wallGrips(app) : [];
  const layer = (name, list, color, size, order) => {
    overlay.points(name, list, { color, size });
    const o = overlay.layers.get(name)?.object;
    if (o) { o.renderOrder = order; o.userData.noPick = true; }
  };
  if (!grips.length) { for (const n of ['grip-ring', 'grip-fill', 'grip-mid', 'grip-hot']) overlay.clear(n); return; }
  const hot = grips.find((g) => g.kind === tool.hotGrip);
  layer('grip-ring', grips.map((g) => g.world), '#2a5bd7', 13, 22);
  layer('grip-fill', grips.map((g) => g.world), '#ffffff', 8, 23);
  layer('grip-mid', grips.filter((g) => g.kind === 'mid').map((g) => g.world), '#2a5bd7', 4, 24);
  layer('grip-hot', hot ? [hot.world] : [], '#f59f00', 8, 25);
}

/** Snapping of a dragged wall end: wall ends and columns (not those moving with it), axes, perpendicular to joined walls, along the wall. */
function gripEndSnap(app, project, g, cursor, fixed, pixel) {
  const wall = g.wall;
  const node = g.snap.walls.get(wall.id)[g.end];
  const close = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01;
  // Walls whose ends move with this one are left out (they would snap to themselves).
  const moving = (w) => w === wall || (!g.detach && (close(w.a, node) || close(w.b, node)));
  const walls = project.walls.filter((w) => w.level === g.level && !moving(w));
  const points = [
    ...columnsOf(project, g.level).filter((o) => g.detach || !close([o.position[0], o.position[2]], node)).map((o) => [[o.position[0], o.position[2]], 'endpoint']),
    ...project.walls.filter((w) => w.level === g.level && w !== wall && moving(w)).map((w) => [close(w.a, node) ? w.b : w.a, 'endpoint']),
  ];
  const s = app.settings();
  const snap = snapPlan(cursor, { walls, points, from: fixed, pixel, grid: s.snapToGrid ? (app.viewport.gridStep || s.gridSize) : null });
  if (!['free', 'grid', 'aligned'].includes(snap.kind)) return snap;
  // Perpendicular to a wall joined at the end that stays, or straight along the wall's own line.
  const dx = cursor[0] - fixed[0]; const dz = cursor[1] - fixed[1];
  const L = Math.hypot(dx, dz);
  if (L < 1e-6) return snap;
  const dirs = [];
  const w0 = g.snap.walls.get(wall.id);
  const own = [w0.b[0] - w0.a[0], w0.b[1] - w0.a[1]];
  dirs.push({ d: own, kind: 'parallel', tip: app.t('inf.parallel') });
  for (const w of project.walls) {
    if (w === wall || w.level !== g.level || !(close(w.a, fixed) || close(w.b, fixed))) continue;
    const wd = wallDir(w);
    dirs.push({ d: [-wd[1], wd[0]], kind: 'perpendicular', tip: app.t('inf.perpendicular') });
  }
  for (const { d, kind, tip } of dirs) {
    const l = Math.hypot(d[0], d[1]) || 1;
    const u = [d[0] / l, d[1] / l];
    const along = dx * u[0] + dz * u[1];
    const sin = Math.abs(dx * u[1] - dz * u[0]) / L;
    if (sin < Math.sin((3.5 * Math.PI) / 180)) return { point: [fixed[0] + u[0] * along, fixed[1] + u[1] * along], kind, tip, guideFrom: fixed };
  }
  return snap;
}

/** Columns among `ids` that were dropped in a wall join it (split it at their centre). Returns whether anything changed. */
function attachColumns(app, ids) {
  const project = app.project();
  let changed = false;
  for (const o of project.objects.filter((x) => ids.includes(x.id) && isColumn(x) && !x.locked)) {
    const r = attachColumn(project, o, () => newId('w'));
    if (r.moved || r.split.length) changed = true;
  }
  if (changed) app.live();
  return changed;
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
  /** Kept between uses: draw by the centre line or a face ('center' | 'left' | 'right'), straight or arc walls. */
  static options = { align: 'center', mode: 'line' };
  get cursor() { return 'crosshair'; }
  vcbLabel() { return this.arcEnd ? 'vcb.radius' : 'vcb.length'; }
  hint() { return WallTool.options.mode === 'arc' ? 'hint.wallArc' : 'hint.wall'; }
  hintParams() { return { align: this.app.t(ALIGN_LABEL[WallTool.options.align]) }; }

  /** The tool's choices for the status bar (segmented controls). */
  options() {
    const o = WallTool.options;
    return [
      { key: 'align', label: 'wallTool.align', value: o.align, choices: [['center', 'wallTool.alignCenter', 'alignCenter'], ['left', 'wallTool.alignLeft', 'alignLeft'], ['right', 'wallTool.alignRight', 'alignRight']] },
      { key: 'mode', label: 'wallTool.mode', value: o.mode, choices: [['line', 'wallTool.line', 'wallTool'], ['arc', 'wallTool.arc', 'arcTool']] },
    ];
  }

  setOption(key, value) {
    const o = WallTool.options;
    if (key === 'align' && ['center', 'left', 'right'].includes(value)) {
      o.align = value;
      // The chain being drawn follows (its walls move to the new centre line, one undo step).
      if (this.walls.some(Boolean)) this.app.change('op.wall', (project) => this.applyChain(project), ['walls']);
    } else if (key === 'mode' && ['line', 'arc'].includes(value)) {
      o.mode = value;
      this.arcEnd = null;
    } else return;
    this.app.renderStatus?.();
    this.preview();
  }

  activate() { this.points = []; this.walls = []; this.curves = []; this.lock = null; this.arcEnd = null; this.thickness = null; }

  move(e) {
    const from = this.arcEnd ? null : this.points.at(-1) ?? null;
    const snap = snapAt(this.app, e, from, this.arcEnd ? null : this.lock, this.snapOptions());
    this.snap = snap;
    if (!snap) return;
    showSnap(this.app, snap, from ? v3(from[0], this.app.level().elevation, from[1]) : null);
    this.preview();
  }

  /** Drawing by a face: the chain's own walls lie half a thickness off the clicked points; snap to those points instead. */
  snapOptions() {
    if (WallTool.options.align === 'center' || !this.points.length) return {};
    return { exclude: new Set(this.walls.filter(Boolean)), extra: this.points.map((q) => [q, 'endpoint']) };
  }

  /** The arc being drawn: from the last point to the arc's end, through `through` (or of radius `radius`). */
  pendingArc(through, radius = null) {
    const p0 = this.points.at(-1);
    const p1 = this.arcEnd;
    if (!p0 || !p1 || !through) return null;
    const arc = radius ? arcFromRadius(p0, p1, radius, through) : arcFromThreePoints(p0, p1, through);
    if (!arc) return null;
    return { arc, points: arcWallSegments([arc.cx, arc.cz], arc.r, arc.a0, arc.a1, { start: p0, end: p1 }).map(([, b]) => b) };
  }

  preview() {
    const app = this.app;
    if (!this.points) return;
    const y = app.level().elevation;
    const thick = this.thickness ?? app.settings().defaultWallThickness;
    let extra = [];
    let radius = null;
    if (this.snap && this.points.length) {
      if (this.arcEnd) {
        const pending = this.pendingArc(this.snap.point);
        extra = pending ? pending.points : [this.arcEnd];
        radius = pending?.arc.r ?? null;
      } else extra = [this.snap.point];
    }
    const face = [...this.points, ...extra];
    app.overlay.polyline('wall', face.map(([x, z]) => v3(x, y, z)), { color: '#1f2937' });
    if (this.arcEnd) app.overlay.points('wall-arc-end', [v3(this.arcEnd[0], y, this.arcEnd[1])], { color: '#2a5bd7', size: 9 }); else app.overlay.clear('wall-arc-end');
    const k = Math.max(0, this.points.length - 1);
    if (face.length >= 2 && extra.length) {
      // The walls that the next click makes, as their outline (thickness and mitres included).
      const centre = faceToCentre(face, thick, WallTool.options.align).slice(k);
      const left = offsetPolyline(centre, thick / 2); const right = offsetPolyline(centre, -thick / 2);
      const pairs = [];
      for (const side of [left, right]) for (let i = 0; i < side.length - 1; i++) pairs.push(side[i], side[i + 1]);
      pairs.push(left[0], right[0], left.at(-1), right.at(-1));
      app.overlay.lines('wall-outline', pairs.map(([x, z]) => v3(x, y, z)), { color: '#2a5bd7' });
      if (this.arcEnd) {
        if (radius) app.overlay.label('len', v3(...[this.snap.point[0], y, this.snap.point[1]]), `R ${formatLength(radius, app.units())}`, { kind: 'length', dx: 0, dy: -22 });
        app.setVcb('vcb.radius', radius ? formatLength(radius, app.units(), { suffix: false }) : '');
      } else {
        const a = face.at(-2); const b = face.at(-1);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        app.overlay.label('len', v3((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2), formatLength(len, app.units()), { kind: 'length', dx: 0, dy: -22 });
        app.setVcb('vcb.length', formatLength(len, app.units(), { suffix: false }));
      }
    } else { app.overlay.clear('wall-outline'); app.overlay.clearLabel('len'); }
  }

  up(e) {
    const snap = this.snap ?? snapAt(this.app, e, this.points.at(-1) ?? null, this.lock, this.snapOptions());
    if (!snap) return;
    if (WallTool.options.mode === 'arc' && this.points.length) { this.arcClick(snap.point); return; }
    this.addPoint(snap.point, snap);
  }

  /** Arc mode after the start point: the first click is the arc's end, the next one a point it passes through. */
  arcClick(point) {
    const last = this.points.at(-1);
    if (!this.arcEnd) {
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.01) { this.finish(); return; }
      this.arcEnd = point;
      this.app.setVcb('vcb.radius', '');
      this.preview();
      return;
    }
    this.addArc(this.pendingArc(point));
  }

  addArc(pending) {
    const end = this.arcEnd;
    this.arcEnd = null;
    if (!pending) { this.addPoint(end); return; }
    const { arc, points } = pending;
    this.addSegments(points, { id: newId('cv'), arc }, 'op.wallArc');
    this.afterAdd(end);
  }

  addPoint(point) {
    const last = this.points.at(-1);
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.01) { this.finish(); return; }
    if (!last) { this.points.push(point); this.thickness = this.app.settings().defaultWallThickness; this.preview(); return; }
    this.addSegments([point], null, 'op.wall');
    this.afterAdd(point);
  }

  /** Closing the loop on the first point ends the chain (a room's walls are done). */
  afterAdd(point) {
    const first = this.points[0];
    if (this.points.length > 2 && Math.hypot(point[0] - first[0], point[1] - first[1]) < 0.01) {
      if (WallTool.options.align !== 'center') this.app.change('op.wall', (project) => this.applyChain(project, true), ['walls']);
      this.finish();
      return;
    }
    this.preview();
  }

  /** New face points → new walls (one undo step); the whole chain's centre line is laid out again (mitres). */
  addSegments(points, curve, label) {
    const app = this.app;
    const level = app.level();
    const align = WallTool.options.align;
    const ids = [];
    app.change(label, (project) => {
      for (const point of points) {
        const last = this.points.at(-1);
        // A straight wall drawn over an existing one (same line, both ends on it) is not doubled.
        const twin = !curve && align === 'center' && project.walls.find((w) => w.level === level.id && projectOnSegment(last, w.a, w.b).distance < 0.01 && projectOnSegment(point, w.a, w.b).distance < 0.01);
        let id = null;
        if (!twin) {
          id = newId('w');
          project.walls.push({ id, level: level.id, a: [...last], b: [...point], thickness: this.thickness, height: null, material: {}, ...(align !== 'center' ? { align } : {}) });
          ids.push(id);
        }
        this.points.push(point);
        this.walls.push(id);
        this.curves.push(curve);
      }
      this.applyChain(project);
    }, ['walls']);
    return ids;
  }

  /** The chain's walls on the centre line of the drawn points (offset by half the thickness when drawn by a face). */
  applyChain(project, closed = false) {
    const align = WallTool.options.align;
    const pts = closed ? this.points.slice(0, -1) : this.points;
    const centre = faceToCentre(pts, this.thickness, align, closed);
    // For an arc drawn by a face the centre line's radius differs by half the thickness.
    const off = align === 'left' ? -this.thickness / 2 : align === 'right' ? this.thickness / 2 : 0;
    this.walls.forEach((id, i) => {
      const w = id && project.walls.find((x) => x.id === id);
      if (!w) return;
      w.a = [...centre[i % centre.length]];
      w.b = [...centre[(i + 1) % centre.length]];
      if (align === 'center') delete w.align; else w.align = align;
      const c = this.curves[i];
      if (c) { const sweep = Math.sign(c.arc.a1 - c.arc.a0); w.curve = arcCurve(c.id, [c.arc.cx, c.arc.cz], c.arc.r - sweep * off, c.arc.a0, c.arc.a1); }
    });
  }

  finish() {
    const created = (this.walls ?? []).filter(Boolean);
    this.points = [];
    this.walls = [];
    this.curves = [];
    this.lock = null;
    this.arcEnd = null;
    this.app.overlay.reset();
    this.app.setVcb('vcb.length', '');
    if (created.length) {
      const split = splitAtColumns(this.app, created);
      makeRoomsFor(this.app, [...created, ...split]);
    }
  }

  deactivate() { if (this.walls?.some(Boolean)) this.finish(); this.app.overlay.reset(); }

  dblclick() { this.finish(); }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape' && this.arcEnd) { this.arcEnd = null; this.preview(); return true; }
    if (k === 'escape' || k === 'enter') { if (this.points.length) { this.finish(); return true; } return false; }
    if (k === 'tab') { const order = ['center', 'left', 'right']; this.setOption('align', order[(order.indexOf(WallTool.options.align) + 1) % 3]); return true; }
    if (k === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey) { this.setOption('mode', WallTool.options.mode === 'arc' ? 'line' : 'arc'); return true; }
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

  /** Typed length: a wall (or the arc's end) that far in the current direction; after an arc's end: its radius. */
  vcb(text) {
    const value = parseLength(text, this.app.units());
    const from = this.points.at(-1);
    if (value == null || !from || !this.snap) return false;
    const len = Math.abs(Array.isArray(value) ? value[0] : value);
    if (this.arcEnd) {
      const pending = this.pendingArc(this.snap.point, len);
      if (!pending) return false;
      this.addArc(pending);
      return true;
    }
    const d = [this.snap.point[0] - from[0], this.snap.point[1] - from[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    const point = [from[0] + (d[0] / l) * len, from[1] + (d[1] / l) * len];
    if (WallTool.options.mode === 'arc') this.arcClick(point); else this.addPoint(point);
    return true;
  }
}

const ALIGN_LABEL = { center: 'wallTool.alignCenter', left: 'wallTool.alignLeft', right: 'wallTool.alignRight' };

/** Walls just drawn are split at the columns standing on them (one undo step when there are any). Returns the new ids. */
function splitAtColumns(app, wallIds) {
  const project = app.project();
  const walls = project.walls.filter((w) => wallIds.includes(w.id));
  const hit = walls.some((w) => columnsOf(project, w.level).some((o) => { const pr = projectOnSegment([o.position[0], o.position[2]], w.a, w.b); return pr.distance <= Math.max(0.01, (w.thickness ?? 0.15) / 2) && pr.t > 1e-6 && pr.t < 1 - 1e-6; }));
  if (!hit) return [];
  return app.change('op.split', (p) => splitWallsAtColumns(p, wallIds, () => newId('w')), ['walls', 'openings', 'objects']) ?? [];
}


// ───────────────────────── Room (click inside walls → room; or draw its outline)

export class RoomTool extends Tool {
  id = 'room';
  get cursor() { return 'crosshair'; }
  vcbLabel() { return 'vcb.length'; }
  activate() { this.points = []; this.corner = null; }

  move(e) {
    const app = this.app;
    const from = this.corner ?? this.points.at(-1) ?? null;
    const snap = snapAt(app, e, from);
    this.snap = snap;
    if (!snap) return;
    const y = app.level().elevation + 0.01;
    if (this.corner) { this.previewRect(snap.point); showSnap(app, snap, v3(from[0], y, from[1])); return; }
    if (!this.points.length) {
      // Hovering inside walls: show the room that one click would make.
      const project = app.project();
      const walls = project.walls.filter((w) => w.level === app.level().id);
      let poly = detectRoom(walls, snap.point, app.level().id);
      // On a wall or its corner (outside the room's inner faces) a click starts a rectangle instead.
      if (poly && !pointInPolygon(snap.point, poly)) poly = null;
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

  /** Rectangle from the first corner to `q`: its outline and the two side lengths. */
  previewRect(q) {
    const app = this.app;
    const y = app.level().elevation + 0.01;
    const c = this.corner;
    const pts = [[c[0], c[1]], [q[0], c[1]], [q[0], q[1]], [c[0], q[1]]].map(([x, z]) => v3(x, y, z));
    app.overlay.polyline('room-line', pts, { color: '#2a5bd7', closed: true });
    app.overlay.polygon('room', pts, { color: '#2a9d5b', opacity: 0.15 });
    const w = Math.abs(q[0] - c[0]); const d = Math.abs(q[1] - c[1]);
    app.overlay.label('len', v3((c[0] + q[0]) / 2, y, Math.min(c[1], q[1])), formatLength(w, app.units()), { kind: 'length', dx: 0, dy: -18 });
    app.overlay.label('area', v3(Math.max(c[0], q[0]), y, (c[1] + q[1]) / 2), formatLength(d, app.units()), { kind: 'length', dx: 34, dy: 0 });
    app.setVcb('vcb.length', `${formatLength(w, app.units(), { suffix: false })},${formatLength(d, app.units(), { suffix: false })}`);
  }

  /** Four walls (sharing stretches that are already walled) and the room inside them. */
  createRect(c, q) {
    const app = this.app;
    this.corner = null;
    app.overlay.reset();
    app.setVcb('vcb.length', '');
    if (Math.abs(q[0] - c[0]) < 0.3 || Math.abs(q[1] - c[1]) < 0.3) return;
    const level = app.level();
    const s = app.settings();
    const segs = rectangleSegments(app.project().walls.filter((w) => w.level === level.id), c, q);
    const ids = segs.map(() => newId('w'));
    if (ids.length) app.change('op.roomRect', (project) => { segs.forEach(([a, b], i) => project.walls.push({ id: ids[i], level: level.id, a, b, thickness: s.defaultWallThickness, height: null, material: {} })); }, ['walls']);
    // Rooms: the rectangle (and any room it split); a rectangle drawn entirely on existing walls still gets its room.
    const made = makeRoomsFor(app, [...ids, ...splitAtColumns(app, ids)], { quiet: true });
    if (made.length) { app.select(made); return; }
    const centre = [(c[0] + q[0]) / 2, (c[1] + q[1]) / 2];
    const poly = detectRoom(app.project().walls.filter((w) => w.level === level.id), centre, level.id);
    if (poly && !app.project().rooms.some((r) => r.level === level.id && pointInPolygon(centre, r.points))) this.create(poly);
  }

  up(e) {
    const app = this.app;
    const snap = this.snap;
    if (!snap) return;
    if (this.corner) { this.createRect(this.corner, snap.point); return; }
    // Inside walls that already hold a room, a click starts a rectangle (a room inside the room) instead.
    const roomed = this.detected && app.project().rooms.some((r) => r.level === app.level().id && pointInPolygon(snap.point, r.points));
    if (!this.points.length && this.detected && !roomed) {
      this.create(this.detected);
      return;
    }
    // Elsewhere: the first corner of a rectangle of walls (Alt: the old free outline, a floor without walls).
    if (!this.points.length && !e?.altKey) { this.corner = snap.point; app.overlay.clear('room'); app.overlay.clearLabel('area'); return; }

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
  key(e) { if (e.key === 'Escape' && (this.points.length || this.corner)) { this.points = []; this.corner = null; this.app.overlay.reset(); this.app.setVcb('vcb.length', ''); return true; } if (e.key === 'Enter' && this.points.length >= 3) { this.create(this.points); return true; } return false; }

  /** Typed size after the first corner: "4000,3000" (width, depth) towards the cursor; one value = a square. */
  vcb(text) {
    const value = parseLength(text, this.app.units());
    if (value == null || !this.corner) return false;
    const [w, d] = Array.isArray(value) ? value : [value, value];
    const c = this.corner;
    const q = this.snap?.point ?? [c[0] + 1, c[1] + 1];
    const sx = q[0] < c[0] ? -1 : 1; const sz = q[1] < c[1] ? -1 : 1;
    this.createRect(c, [c[0] + sx * Math.abs(w), c[1] + sz * Math.abs(d ?? w)]);
    return true;
  }
}

/** Rooms for the areas that new walls closed (planedit.roomsAfterWalls), as one undo step. Returns the new room ids. */
function makeRoomsFor(app, wallIds, { quiet = false } = {}) {
  const project = app.project();
  const walls = project.walls.filter((w) => wallIds.includes(w.id));
  if (!walls.length) return [];
  const level = walls[0].level;
  // Dry run on copies first: an undo step is recorded only when rooms change.
  const probe = roomsAfterWalls({ walls: project.walls, rooms: project.rooms.map((r) => ({ ...r })) }, level, walls, (points) => ({ id: 'probe', level, points }));
  if (!probe.added.length && !probe.changed.length) return [];
  let n = project.rooms.length;
  let result = { added: [], changed: [] };
  app.change('op.room', (p) => {
    result = roomsAfterWalls(p, level, walls, (points, from) => {
      n += 1;
      return { id: newId('rm'), level, name: from ? `${from.name} (${n})` : app.t('room.defaultName', { n }), points, floor: from?.floor ?? 'floor-oak', ceiling: from?.ceiling ?? 'wall-paint-white', showCeiling: from?.showCeiling ?? false };
    });
  }, ['rooms']);
  if (!quiet && result.added.length) app.notify('info', app.t('notice.roomsMade', { count: result.added.length }));
  return result.added;
}

// ───────────────────────── Column (structure; engine/planedit.js)

const COLUMN_SHAPES = ['square', 'round', 'rect'];

export class ColumnTool extends Tool {
  id = 'column';
  static last = { shape: 'square', size: 0.4, depth: 0.6 };
  get cursor() { return 'crosshair'; }
  vcbLabel() { return 'vcb.length'; }
  activate() { this.params = { ...ColumnTool.last }; this.rotation = 0; }

  move(e) {
    const app = this.app;
    const snap = snapAt(app, e);
    this.snap = snap;
    if (!snap) return;
    showSnap(app, snap, null);
    this.preview();
  }

  preview() {
    const app = this.app;
    const snap = this.snap;
    if (!snap) return;
    this.rotation = this.alongWall(snap);
    const y = app.level().elevation + 0.01;
    const fp = columnFootprint(this.objectAt(snap.point));
    app.overlay.polyline('column', fp.map(([x, z]) => v3(x, y, z)), { color: '#2a5bd7', closed: true });
    const p = this.params;
    const u = app.units();
    app.overlay.label('column', snap.world, p.shape === 'rect' ? `${formatLength(p.size, u, { suffix: false })} × ${formatLength(p.depth, u)}` : formatLength(p.size, u), { kind: 'info', dx: 0, dy: -26 });
    app.setVcb('vcb.length', p.shape === 'rect' ? `${formatLength(p.size, u, { suffix: false })},${formatLength(p.depth, u, { suffix: false })}` : formatLength(p.size, u, { suffix: false }));
  }

  /** On or at the end of a wall: turned with it (rectangular columns line up with the wall). */
  alongWall(snap) {
    const wall = snap.ref ? this.app.project().walls.find((w) => w.id === snap.ref) : null;
    if (!wall) return 0;
    const d = wallDir(wall);
    const a = Math.atan2(-d[1], d[0]);
    // Within ±90°, so square columns do not spin needlessly.
    return Math.abs(a) > Math.PI / 2 + 1e-6 ? a - Math.sign(a) * Math.PI : a;
  }

  objectAt(point) {
    return { item: 'column', params: { ...this.params }, position: [point[0], 0, point[1]], rotation: [0, this.rotation ?? 0, 0], scale: [1, 1, 1] };
  }

  up(e) {
    const snap = this.snap ?? snapAt(this.app, e);
    if (snap) this.place(snap.point);
  }

  place(point) {
    const app = this.app;
    const level = app.level();
    if (columnsOf(app.project(), level.id).some((o) => Math.hypot(o.position[0] - point[0], o.position[2] - point[1]) < 0.05)) return;
    const id = newId('ob');
    const o = this.objectAt(point);
    app.change('op.column', (project) => {
      const column = { id, level: level.id, item: 'column', params: { ...o.params, fitLevel: true, height: level.height, trim: false, material: 'wall-paint-white' }, position: o.position, rotation: o.rotation, scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' };
      project.objects.push(column);
      // In the middle of a wall: the wall is split at the column, which becomes the joint of both pieces.
      attachColumn(project, column, () => newId('w'));
    }, ['objects', 'walls', 'openings']);
    app.select([id]);
  }

  key(e) {
    if (e.key !== 'Tab') return false;
    const i = COLUMN_SHAPES.indexOf(this.params.shape);
    this.params.shape = COLUMN_SHAPES[(i + 1) % COLUMN_SHAPES.length];
    ColumnTool.last = { ...this.params };
    this.preview();
    return true;
  }

  /** Typed size: "400" (width or diameter) or "400,600" (a rectangular column). */
  vcb(text) {
    const value = parseLength(text, this.app.units());
    if (value == null) return false;
    const [w, d] = Array.isArray(value) ? value.map(Math.abs) : [Math.abs(value), null];
    if (!(w >= 0.05) || (d != null && !(d >= 0.05))) return false;
    this.params.size = w;
    if (d != null) { this.params.depth = d; this.params.shape = 'rect'; } else if (this.params.shape === 'rect') this.params.shape = 'square';
    ColumnTool.last = { ...this.params };
    this.preview();
    return true;
  }
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
    if (this.start && this.lock?.axis === 'vertical') {
      // Blue (vertical) lock: straight up and down from the start point.
      const p = dragPointer(app, e, dragSurface(app, this.ids, this.start, 'vertical'));
      return p ? { world: p, kind: 'axisY' } : null;
    }
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
    this.app.overlay.lines('move', [this.start, p.world], { color: p.kind === 'axisX' ? '#d6303b' : p.kind === 'axisZ' ? '#2f9e44' : p.kind === 'axisY' ? '#2e6fd6' : '#555', dashed: true });
    this.app.setVcb('vcb.distance', formatLength(total, this.app.units(), { suffix: false }));
  }

  up(e) {
    if (!this.start) return;
    if (this.last.distanceTo(this.start) < 1e-6 && !this.dragged) { this.dragged = true; return; }
    this.finish();
  }

  finish() {
    attachColumns(this.app, this.ids);
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
    // SketchUp's arrow keys: → red (X), ← / ↓ green (Z), ↑ blue (up and down). Pressed again: the lock is released.
    if (k === 'arrowright') { this.lock = this.lock?.axis === 'axisX' ? null : Object.assign([1, 0], { axis: 'axisX' }); return true; }
    if (k === 'arrowleft' || k === 'arrowdown') { this.lock = this.lock?.axis === 'axisZ' ? null : Object.assign([0, 1], { axis: 'axisZ' }); return true; }
    if (k === 'arrowup' || (k === 'pageup' && this.start)) {
      this.lock = this.lock?.axis === 'vertical' ? null : { axis: 'vertical' };
      if (this.app.viewport.planMode && this.lock) { this.lock = null; this.app.notify('info', this.app.t('hint.verticalIn3d')); }
      return true;
    }
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

// ───────────────────────── Stairs (engine/stairs.js: layouts, stairwell holes in the floor above)

/** Small plan pictograms of the stair types for the tool's option strip. */
const STAIR_GLYPHS = {
  straight: '<rect x="8" y="2" width="8" height="20" rx="1"/><path d="M8 6h8M8 10h8M8 14h8M8 18h8"/>',
  l: '<path d="M4 22V10h12v6H10v6z"/><path d="M4 18h6M4 14h6M14 10v6"/>',
  winder: '<path d="M4 22V8h16v8H10v6z"/><path d="M4 18h6M10 16 4 8M10 16l4-8M20 12h-6"/>',
  u: '<rect x="3" y="2" width="18" height="7" rx="1"/><path d="M3 9v13h7V9M14 9v13h7V9M3 13h7M3 17h7M14 13h7M14 17h7"/>',
  spiral: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1.6"/><path d="M12 2v8M21.5 9l-8 2.4M17.5 20.5 13 13.5M5 19.5l6-6M2.5 9l8 2.4"/>',
  curved: '<path d="M3 21A18 18 0 0 1 21 3v7a11 11 0 0 0-11 11z"/><path d="M5.5 14.5l6 2M9.5 8.5l4 4.5M15 5l1 6"/>',
};
const STAIR_TOOL_TYPES = ['straight', 'l', 'winder', 'u', 'spiral', 'curved'];

/**
 * Draws a `stairs` object: click the start (the middle of the first riser), then the direction it climbs,
 * then (L, U, winder, spiral, curved) the side it turns to. The rise reaches the level above (or is the
 * level's height on the top level); type, width and turn come from the option strip over the view
 * (Tab: next type; typing a length: width, or diameter for a spiral).
 */
export class StairsTool extends Tool {
  id = 'stairs';
  static last = { type: 'u', width: 1.0, diameter: 1.6, turn: 'right' };
  get cursor() { return 'crosshair'; }
  vcbLabel() { return 'vcb.length'; }

  activate() {
    this.opts = { ...StairsTool.last };
    this.phase = 0;
    this.start = null;
    this.dir = [0, -1];
    this.strip = this.makeStrip();
  }

  deactivate() {
    this.app.overlay.reset();
    this.strip?.remove();
    this.strip = null;
    this.ghost = null;
    this.ghostKey = '';
  }

  needsTurn() { return this.opts.type !== 'straight'; }

  /** The params of the stair being drawn. */
  params() {
    const o = this.opts;
    const spiral = o.type === 'spiral';
    return {
      type: o.type, rise: stairsRiseToNextLevel(this.app.project(), this.app.level().id), width: o.width, run: 0.27, maxRiser: 0.19, turn: o.turn,
      landing: 0, gap: 0.1, angle: o.type === 'curved' ? 180 : 360, diameter: o.diameter, innerRadius: 0.5,
      rail: 'baluster', railSides: 'auto', risers: spiral ? 'open' : 'closed', guard: false, stairwell: true, tread: 'wood-oak', riser: 'paint-white-matte',
    };
  }

  // ── option strip (type · width · turn)

  makeStrip() {
    const host = this.app.viewport?.canvas?.closest?.('.view-host') ?? this.app.viewport?.canvas?.parentElement;
    if (!host || typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'stairs-strip';
    el.setAttribute('role', 'toolbar');
    el.addEventListener('pointerdown', (event) => event.stopPropagation());
    el.addEventListener('click', (event) => {
      const b = event.target.closest('button');
      if (!b) return;
      if (b.dataset.stairType) this.opts.type = b.dataset.stairType;
      else if (b.dataset.stairStep) this.stepWidth(Number(b.dataset.stairStep));
      else if (b.dataset.stairTurn) this.opts.turn = this.opts.turn === 'left' ? 'right' : 'left';
      this.remember();
      this.preview();
    });
    host.appendChild(el);
    this.renderStrip(el);
    return el;
  }

  renderStrip(el = this.strip) {
    if (!el) return;
    const t = (k, p) => this.app.t(k, p);
    const o = this.opts;
    const u = this.app.units();
    const spiral = o.type === 'spiral';
    const svg = (body) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;
    el.innerHTML = `<span class="stairs-strip-group">${STAIR_TOOL_TYPES.map((type) => `<button type="button" class="${o.type === type ? 'active' : ''}" data-stair-type="${type}" aria-pressed="${o.type === type}" title="${t(`stairs.type.${type}.tip`)}">${svg(STAIR_GLYPHS[type])}<span>${t(`stairs.type.${type}`)}</span></button>`).join('')}</span>
      <span class="stairs-strip-group"><span class="stairs-strip-label">${t(spiral ? 'stairs.diameter' : 'stairs.width')}</span><span class="stepper"><button type="button" class="stepper-button" data-stair-step="-1" title="−">−</button><span class="stepper-value stairs-strip-value">${formatLength(spiral ? o.diameter : o.width, u)}</span><button type="button" class="stepper-button" data-stair-step="1" title="+">+</button></span></span>
      <span class="stairs-strip-group"><button type="button" data-stair-turn="1" ${o.type === 'straight' ? 'disabled' : ''} title="${t('stairs.turnTip')}"><span>${t(o.turn === 'left' ? 'stairs.turn.left' : 'stairs.turn.right')}</span></button></span>`;
  }

  stepWidth(sign) {
    if (this.opts.type === 'spiral') this.opts.diameter = Math.min(3.0, Math.max(1.2, Math.round((this.opts.diameter + sign * 0.1) * 100) / 100));
    else this.opts.width = Math.min(2.0, Math.max(0.6, Math.round((this.opts.width + sign * 0.05) * 100) / 100));
  }

  remember() { StairsTool.last = { ...this.opts }; this.renderStrip(); }

  // ── pointer

  move(e) {
    const app = this.app;
    if (this.phase === 0) {
      const snap = snapAt(app, e);
      this.snap = snap;
      if (!snap) return;
      showSnap(app, snap, null);
      this.start = snap.point;
    } else {
      const g = app.groundPoint(e);
      if (!g) return;
      const v = [g.x - this.start[0], g.z - this.start[1]];
      if (this.phase === 1 && Math.hypot(v[0], v[1]) > 0.05) {
        // Snapped to 15° steps (Shift: free).
        let a = Math.atan2(v[1], v[0]);
        if (!e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        this.dir = [Math.cos(a), Math.sin(a)];
      } else if (this.phase === 2) {
        // The side of the climbing line the pointer is on: the way the stair turns.
        const right = [-this.dir[1], this.dir[0]]; // the walker's right (rotation of `dir` by +90° in plan)
        const side = v[0] * right[0] + v[1] * right[1];
        if (Math.abs(side) > 0.05) this.opts.turn = side > 0 ? 'right' : 'left';
      }
    }
    this.preview();
  }

  up(e) {
    if (this.phase === 0) {
      const snap = this.snap ?? snapAt(this.app, e);
      if (!snap) return;
      this.start = snap.point;
      this.phase = 1;
      return;
    }
    if (this.phase === 1 && this.needsTurn()) { this.phase = 2; this.preview(); return; }
    this.place();
  }

  key(e) {
    if (e.key === 'Tab') {
      const i = STAIR_TOOL_TYPES.indexOf(this.opts.type);
      this.opts.type = STAIR_TOOL_TYPES[(i + (e.shiftKey ? STAIR_TOOL_TYPES.length - 1 : 1)) % STAIR_TOOL_TYPES.length];
      this.remember();
      this.preview();
      return true;
    }
    if (e.key === 'Escape' && this.phase > 0) { this.phase = 0; this.preview(); return true; }
    return false;
  }

  /** Typed width (or the diameter of a spiral stair). */
  vcb(text) {
    const value = parseLength(text, this.app.units());
    if (value == null || Array.isArray(value)) return false;
    const v = Math.abs(value);
    if (this.opts.type === 'spiral') { if (!(v >= 1.0 && v <= 4)) return false; this.opts.diameter = v; } else { if (!(v >= 0.5 && v <= 3)) return false; this.opts.width = v; }
    this.remember();
    this.preview();
    return true;
  }

  /** The stair object for the current start, direction and options (local → world: engine/stairs.js placeStairs). */
  objectNow() {
    if (!this.start) return null;
    const params = this.params();
    const placed = stairsPlace(params, this.start, this.dir);
    return { item: 'stairs', params, position: placed.position, rotation: placed.rotation, scale: [1, 1, 1], layout: placed.layout };
  }

  preview() {
    const app = this.app;
    this.renderStrip();
    const o = this.objectNow();
    if (!o) return;
    const level = app.level();
    const y = level.elevation;
    const item = stairsCatalogItem('stairs');
    const key = JSON.stringify(o.params);
    if (item && app.builder?.instance && key !== this.ghostKey) {
      const holder = new THREE.Group();
      holder.add(app.builder.instance(item, o.params, {}));
      holder.traverse((m) => { m.userData.noPick = true; if (m.isLineSegments) m.visible = false; });
      this.ghost = holder;
      this.ghostKey = key;
      app.overlay.object('stairs-ghost', holder);
      app.viewport.applyStyle?.(holder);
    }
    // The 2D plan shows the stair as its tread lines (the plan symbol); 3D shows the stair itself.
    if (this.ghost) this.ghost.visible = !app.viewport.planMode;
    const treadLines = [];
    for (const st of o.layout.steps) {
      const w = st.poly.map((q) => stairsToWorld(o, q));
      for (let i = 0; i < w.length; i++) treadLines.push(new THREE.Vector3(w[i][0], y + 0.013, w[i][1]), new THREE.Vector3(w[(i + 1) % w.length][0], y + 0.013, w[(i + 1) % w.length][1]));
    }
    app.overlay.lines('stairs-treads', treadLines, { color: '#2a5bd7', opacity: 0.7 });
    if (this.ghost) {
      this.ghost.position.set(o.position[0], y, o.position[2]);
      this.ghost.rotation.set(0, o.rotation[1], 0);
      this.ghost.updateMatrixWorld(true);
    }
    const fp = o.layout.footprint.map((q) => stairsToWorld(o, q));
    app.overlay.polyline('stairs-outline', fp.map(([x, z]) => new THREE.Vector3(x, y + 0.012, z)), { color: '#2a5bd7', closed: true });
    // The climbing direction from the start point.
    const s = this.start;
    app.overlay.lines('stairs-dir', [new THREE.Vector3(s[0], y + 0.015, s[1]), new THREE.Vector3(s[0] + this.dir[0] * 0.8, y + 0.015, s[1] + this.dir[1] * 0.8)], { color: '#e0531f' });
    const u = app.units();
    const info = stairsInfo(o.params);
    app.overlay.label('stairs', new THREE.Vector3(s[0], y, s[1]), app.t('stairs.previewLabel', { n: info.n, riser: formatLength(info.riser, u), rise: formatLength(o.params.rise, u) }), { kind: 'info', dx: 0, dy: -30 });
    app.setVcb('vcb.length', formatLength(o.params.type === 'spiral' ? o.params.diameter : o.params.width, u, { suffix: false }));
    app.viewport.requestRender();
  }

  place() {
    const app = this.app;
    const o = this.objectNow();
    if (!o) return;
    const level = app.level();
    const id = newId('ob');
    app.change('op.stairs', (project) => {
      project.objects.push({ id, level: level.id, item: 'stairs', params: { ...o.params }, position: o.position, rotation: o.rotation, scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' });
    }, ['objects']);
    app.select([id]);
    this.phase = 0;
    this.app.overlay.clear('stairs-dir');
  }
}
