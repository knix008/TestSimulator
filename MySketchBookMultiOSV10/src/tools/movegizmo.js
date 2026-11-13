// The move handle of selected furniture (Select tool): three arrows — red X, blue up and down (Y), green Z. Dragging
// an arrow moves the selection along that axis only, so a piece can go anywhere in 3D with the mouse (also where the
// floor or its wall is seen edge-on). The handle stands just outside the selection's box, at the bottom corner nearest
// the eye, its flat arrows pointing away from the box: the piece itself stays free to grab and drag as before. The
// arrows keep the same size on screen (placed again before every frame); the 2D plan has no up-and-down arrow.
import * as THREE from 'three';
import { AXIS_COLORS } from '../engine/viewport.js';

/** Arrow length, shaft start, head length and radii, and the gap between the box corner and the handle, in screen pixels. */
const LENGTH = 70;
const SHAFT_FROM = 6;
const HEAD = 14;
const SHAFT_R = 1.6;
const HEAD_R = 5.2;
const GAP = 12;
/** How close (pixels) the pointer must be to an arrow to catch it. */
const CATCH_PX = 8;
const HOT = '#f5b700';
export const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

export class MoveGizmo {
  constructor(viewport) {
    this.viewport = viewport;
    this.group = new THREE.Group();
    this.group.name = 'move-gizmo';
    this.group.visible = false;
    this.group.userData.noPick = true;
    this.arrows = {};
    const shaft = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, LENGTH - HEAD - SHAFT_FROM, 8);
    shaft.translate(0, SHAFT_FROM + (LENGTH - HEAD - SHAFT_FROM) / 2, 0);
    const head = new THREE.ConeGeometry(HEAD_R, HEAD, 14);
    head.translate(0, LENGTH - HEAD / 2, 0);
    const hub = new THREE.SphereGeometry(SHAFT_R * 2.2, 12, 8);
    const hubMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false });
    this.group.add(new THREE.Mesh(hub, hubMaterial));
    for (const [axis, dir] of Object.entries(AXES)) {
      const material = new THREE.MeshBasicMaterial({ color: AXIS_COLORS[axis], depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false });
      const arrow = new THREE.Group();
      arrow.add(new THREE.Mesh(shaft, material), new THREE.Mesh(head, material));
      this.group.add(arrow);
      this.arrows[axis] = { arrow, material };
      arrow.quaternion.setFromUnitVectors(AXES.y, dir);
    }
    this.group.traverse((o) => { o.renderOrder = 30; o.frustumCulled = false; o.userData.noPick = true; });
    viewport.overlay.add(this.group);
    this.box = new THREE.Box3();
    this.floorY = null;
    /** Where the handle is and where its arrows point (world), as last drawn. */
    this.anchor = new THREE.Vector3();
    this.dirs = { x: AXES.x.clone(), y: AXES.y.clone(), z: AXES.z.clone() };
    /** While an arrow is dragged the handle keeps its corner (it would jump to another as the piece passes the eye). */
    this.frozen = false;
    this.sx = 1; this.sz = 1; this.middle = false;
    this.hot = null;
    const previous = viewport.options.beforeRender;
    viewport.options.beforeRender = (v) => { previous?.(v); this.fit(); };
  }

  get visible() { return this.group.visible; }

  /** Shows the handle for the selection's world box (`floorY`: the 2D plan's floor), or hides it (null). */
  show(box, { floorY = null } = {}) {
    if (!box) {
      if (this.group.visible) { this.group.visible = false; this.viewport.requestRender(); }
      return;
    }
    this.box.copy(box);
    this.floorY = floorY;
    this.arrows.y.arrow.visible = !this.viewport.planMode;
    this.group.visible = true;
    this.fit();
    this.viewport.requestRender();
  }

  /** The arrow under the pointer or being dragged is drawn in the highlight colour. */
  setHot(axis) {
    if (this.hot === axis) return;
    this.hot = axis;
    for (const [name, { material }] of Object.entries(this.arrows)) material.color.set(name === axis ? HOT : AXIS_COLORS[name]);
    this.viewport.requestRender();
  }

  /** The corner nearest the eye (2D: bottom left), just outside the box; same size on screen at any zoom. */
  fit() {
    if (!this.group.visible) return;
    const vp = this.viewport;
    const b = this.box;
    const center = b.getCenter(new THREE.Vector3());
    const cornerOf = (sx, sz) => {
      const corner = new THREE.Vector3(sx > 0 ? b.max.x : b.min.x, this.floorY ?? b.min.y, sz > 0 ? b.max.z : b.min.z);
      const gap = GAP * vp.pixelSizeAt(corner);
      corner.x += sx * gap; corner.z += sz * gap;
      return corner;
    };
    if (!this.frozen) {
      const eye = vp.camera.position;
      this.sx = vp.planMode ? -1 : eye.x >= center.x ? 1 : -1;
      this.sz = vp.planMode ? 1 : eye.z >= center.z ? 1 : -1;
      // A corner off the view (a big rug seen from inside the room) could not be reached: the box's middle then.
      const s = vp.worldToScreen(cornerOf(this.sx, this.sz));
      const r = vp.canvasRect();
      this.middle = s.behind || s.x < r.left + 20 || s.x > r.right - 20 || s.y < r.top + 20 || s.y > r.bottom - 20;
      this.dirs.x.set(this.middle ? 1 : this.sx, 0, 0);
      this.dirs.z.set(0, 0, this.middle ? 1 : this.sz);
      this.arrows.x.arrow.quaternion.setFromUnitVectors(AXES.y, this.dirs.x);
      this.arrows.z.arrow.quaternion.setFromUnitVectors(AXES.y, this.dirs.z);
    }
    if (this.middle) this.anchor.set(center.x, this.floorY ?? center.y, center.z);
    else this.anchor.copy(cornerOf(this.sx, this.sz));
    this.group.position.copy(this.anchor);
    this.group.scale.setScalar(vp.pixelSizeAt(this.anchor));
    this.group.updateMatrixWorld(true);
  }

  /** The arrow (x, y or z) under the pointer, the nearest one within CATCH_PX, else null. */
  axisAt(clientX, clientY) {
    if (!this.group.visible) return null;
    this.fit();
    const px = this.viewport.pixelSizeAt(this.anchor);
    let best = null;
    for (const axis of Object.keys(AXES)) {
      if (!this.arrows[axis].arrow.visible) continue;
      const dir = this.dirs[axis];
      const a = this.viewport.worldToScreen(this.anchor.clone().addScaledVector(dir, SHAFT_FROM * px));
      const b = this.viewport.worldToScreen(this.anchor.clone().addScaledVector(dir, LENGTH * px));
      if (a.behind || b.behind || Math.hypot(b.x - a.x, b.y - a.y) < 6) continue;
      const d = segmentDistance(clientX, clientY, a, b);
      if (d <= CATCH_PX && (!best || d < best.d)) best = { axis, d };
    }
    return best?.axis ?? null;
  }
}

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (a.x + dx * k), y - (a.y + dy * k));
}

/**
 * Where on the line through `origin` along the unit vector `dir` the pointer ray passes closest: the distance from
 * `origin` along `dir` (null when the line points almost straight into the screen — no sensible answer then).
 */
export function axisParam(ray, origin, dir) {
  const b = dir.dot(ray.direction);
  const denom = 1 - b * b;
  if (denom < 0.02) return null;
  const w = new THREE.Vector3().subVectors(origin, ray.origin);
  return (b * ray.direction.dot(w) - dir.dot(w)) / denom;
}
