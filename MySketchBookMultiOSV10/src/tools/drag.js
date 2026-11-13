// Dragging furniture with the mouse (select tool and Move tool): the surface the dragged selection follows.
// Pure (three.js only): the app is passed in, so test/unit/drag.test.js can check it with a stand-in.
import * as THREE from 'three';

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
  // Near the horizon a plane seen almost edge-on throws the point far away: ignore such jumps (more than 8 times the
  // camera's distance to the dragged thing, at least 30 m).
  const reach = Math.max(30, 8 * app.viewport.camera.position.distanceTo(surface.point));
  if (p.distanceTo(surface.point) > reach) return null;
  if (surface.mode === 'vertical') return new THREE.Vector3(surface.start.x, p.y, surface.start.z);
  return p;
}

