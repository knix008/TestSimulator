// Dragging furniture with the mouse (select tool and Move tool): the surface the dragged selection follows.
// Pure (three.js only): the app is passed in, so test/unit/drag.test.js can check it with a stand-in.
import * as THREE from 'three';
import { wallDir, wallLength, wallNormal as planNormal } from '../engine/walls.js';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * How a dragged selection follows the pointer (select tool and Move tool):
 *  - 'floor': on the horizontal plane through the base of what is dragged — not through the grab point: grabbed high
 *    up and seen from a low eye, that plane was nearly edge-on and the piece hardly moved towards or away from you;
 *  - 'wall': a wall item (picture, sconce, wall camera …) slides on its wall: along it and up and down;
 *  - 'vertical': straight up and down (↑ / PageUp while dragging), on the upright plane facing the camera.
 * `drag` = { ids, start (world grab point), mode }; returns { mode, base (world point on the drag surface) }.
 */
export function dragSurface(app, ids, start, mode = null, itemOf = (id) => app.catalogItem?.(id)) {
  const p = app.project();
  const objects = ids.map((id) => p.objects.find((o) => o.id === id)).filter(Boolean);
  const single = objects.length === 1 && ids.length === 1 ? objects[0] : null;
  const item = single ? itemOf(single.item) : null;
  const planMode = app.viewport.planMode;
  let m = mode;
  if (!m) m = !planMode && item?.placement === 'wall' ? 'wall' : 'floor';
  if (planMode && m !== 'floor') m = 'floor';
  // A surface seen (almost) edge-on gives no usable pointer (the piece would not move at all): a wall item then
  // follows the floor, and the floor gives way to straight up and down (a level eye sees vertical moves best).
  if (!planMode && m !== 'vertical' && !mode && edgeOn(app, start, m === 'wall' ? wallNormal(single) : UP)) {
    const fallback = m === 'wall' && !edgeOn(app, start, UP) ? 'floor' : 'vertical';
    return dragSurface(app, ids, start, fallback, itemOf);
  }
  const out = { mode: m, start: start.clone(), normal: UP.clone(), point: start.clone() };
  if (m === 'wall') {
    out.normal.copy(wallNormal(single));
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

/** Below this sine of the angle between the view ray and a drag surface, the surface counts as edge-on (about 4°). */
const EDGE_ON = 0.07;

const wallNormal = (object) => {
  const ry = object?.rotation?.[1] ?? 0;
  return new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
};

function edgeOn(app, point, normal) {
  const camera = app.viewport.camera;
  const view = app.viewport.isOrtho
    ? new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2)
    : new THREE.Vector3().subVectors(point, camera.position);
  if (view.lengthSq() < 1e-10) return false;
  return Math.abs(view.normalize().dot(normal)) < EDGE_ON;
}

/**
 * Furniture sliding on the floor meets a wall: it stops at the face (it does not enter the wall) and, when it is
 * close, turns so one side lies along the wall. `center` is the proposed plan position [x, z], `size` is
 * { hx, hz, ry } — half width, half depth and yaw. Walls are { a, b, thickness }. Returns { x, z, ry }.
 */
export function clearOfWalls(center, size, walls, { gap = 0.012, snap = 0.16, align = true } = {}) {
  let x = center[0];
  let z = center[1];
  let ry = size.ry ?? 0;
  const hx = Math.max(0.01, size.hx ?? 0.2);
  const hz = Math.max(0.01, size.hz ?? 0.2);
  for (let pass = 0; pass < 2; pass++) {
    for (const wall of walls ?? []) {
      if (!wall?.a || !wall?.b) continue;
      const L = wallLength(wall);
      if (L < 1e-4) continue;
      const n = planNormal(wall);
      const along = wallDir(wall);
      const fwd = [Math.sin(ry), Math.cos(ry)];
      const right = [Math.cos(ry), -Math.sin(ry)];
      const span = (d) => Math.abs(d[0] * right[0] + d[1] * right[1]) * hx + Math.abs(d[0] * fwd[0] + d[1] * fwd[1]) * hz;
      const relx = x - wall.a[0];
      const relz = z - wall.a[1];
      const t = relx * along[0] + relz * along[1];
      if (t < -span(along) || t > L + span(along)) continue;
      const signed = relx * n[0] + relz * n[1];
      const face = (wall.thickness ?? 0.2) / 2 + span(n) + gap;
      if (Math.abs(signed) > face + snap) continue;
      const side = signed < 0 ? -1 : 1;
      if (align && pass === 0) {
        const base = Math.atan2(side * n[0], side * n[1]);
        let best = ry;
        let bestD = Infinity;
        for (let k = 0; k < 4; k++) {
          const a = base + (k * Math.PI) / 2;
          const d = Math.abs(Math.atan2(Math.sin(a - ry), Math.cos(a - ry)));
          if (d < bestD) { bestD = d; best = a; }
        }
        if (Math.abs(signed) < face + 0.04 || bestD < 0.55) ry = best;
      }
      const fwd2 = [Math.sin(ry), Math.cos(ry)];
      const right2 = [Math.cos(ry), -Math.sin(ry)];
      const spanN = Math.abs(n[0] * right2[0] + n[1] * right2[1]) * hx + Math.abs(n[0] * fwd2[0] + n[1] * fwd2[1]) * hz;
      const face2 = (wall.thickness ?? 0.2) / 2 + spanN + gap;
      const signed2 = (x - wall.a[0]) * n[0] + (z - wall.a[1]) * n[1];
      if (Math.abs(signed2) > face2 + (pass === 0 ? snap : 0)) continue;
      const target = (signed2 < 0 ? -1 : 1) * face2;
      // Only pull in from the snap band on the first pass; the second pass just pushes out of the wall.
      if (pass === 1 && Math.abs(signed2) >= face2) continue;
      x += n[0] * (target - signed2);
      z += n[1] * (target - signed2);
    }
  }
  return { x, z, ry };
}

/** The pointer on a drag surface (dragSurface) → world point, or null. Vertical keeps x and z of the start. */
export function dragPointer(app, e, surface) {
  const p = app.viewport.screenToWorldOnPlane(e.clientX, e.clientY, surface.point, surface.normal);
  if (!p) return null;
  // Near the horizon a plane seen almost edge-on throws the point far away: ignore such jumps (more than 8 times the
  // camera's distance to the dragged thing, at least 30 m).
  const reach = Math.max(30, 8 * app.viewport.camera.position.distanceTo(surface.point));
  if (p.distanceTo(surface.point) > reach) return null;
  if (surface.mode === 'vertical') return new THREE.Vector3(surface.start.x, p.y, surface.start.z);
  return p;
}

