// Plan dimensions in the view (2D plan and 3D): along each outside of the active level's walls a chain
// (one tick at every wall centre line seen from that side) and the overall dimension behind it — the same
// chains a printed plan carries (print/dimensions.js). The lines sit in the scene at the level's floor,
// outside the building, so walls and furniture in front of them hide them (a dimension never runs across
// an object); the lengths are labels, hidden where the model stands between them and the camera. Offsets
// and ticks are a fixed number of screen pixels, rebuilt when the zoom changes by a step. Their colour
// follows the background (light on dark, dark on light). Toggled by settings.showPlanDims.
import * as THREE from 'three';
import { dimensionChains, wallsBox } from '../print/dimensions.js';

/** Screen pixels: first row from the outer face, between rows, tick half-size, extension overshoot, face gap. */
const ROW_PX = 26;
const ROW_GAP_PX = 22;
const TICK_PX = 5;
const OVER_PX = 4;
const FACE_GAP_PX = 3;
/** Interior dimensions: distance in pixels from the room's inner face. */
const INNER_PX = 16;
/** A label needs about this many pixels of dimension line; shorter pieces keep their ticks only. */
const LABEL_PX = 38;

/**
 * Dimension segments of a level's walls (pure): [{ a: [x, z], b: [x, z], normal: [nx, nz], base, length, kind, row, side }]
 * — `a`/`b` on the dimension line, `base` the outer face position the extension lines start from, `normal`
 * pointing away from the building. Row offsets are pixels converted with `perPx` (metres per pixel).
 */
export function planDimensionSegments(walls, perPx, { mode = 'detailed' } = {}) {
  const out = [];
  const box = wallsBox((walls ?? []).filter((w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) > 1e-6));
  for (const chain of dimensionChains(walls, mode)) {
    // The overall dimension is the building's size with its walls: outer face to outer face.
    if (chain.kind === 'overall' && box) {
      const across = chain.side === 'top' || chain.side === 'bottom';
      chain.ticks = across ? [box.outer.minX, box.outer.maxX] : [box.outer.minZ, box.outer.maxZ];
    }
    const toward = chain.side === 'top' || chain.side === 'left' ? -1 : 1;
    const offset = (ROW_PX + chain.row * ROW_GAP_PX) * perPx;
    const line = chain.base + toward * offset;
    const across = chain.side === 'top' || chain.side === 'bottom';
    const normal = across ? [0, toward] : [toward, 0];
    for (let i = 0; i + 1 < chain.ticks.length; i++) {
      const t0 = chain.ticks[i]; const t1 = chain.ticks[i + 1];
      const a = across ? [t0, line] : [line, t0];
      const b = across ? [t1, line] : [line, t1];
      out.push({ a, b, normal, base: chain.base, length: t1 - t0, kind: chain.kind, row: chain.row, side: chain.side });
    }
  }
  return out;
}

/** The sides of the walls' box ('top' = −z, 'bottom' = +z, 'left' = −x, 'right' = +x) the camera sees from outside. */
export function facingSides(walls, camera) {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const w of walls) for (const [x, z] of [w.a, w.b]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const sides = [];
  if (camera.z < minZ) sides.push('top');
  if (camera.z > maxZ) sides.push('bottom');
  if (camera.x < minX) sides.push('left');
  if (camera.x > maxX) sides.push('right');
  // Inside the building (or straight above it): the two sides nearest the camera.
  if (!sides.length) {
    const cx = camera.x; const cz = camera.z;
    sides.push(cz - minZ < maxZ - cz ? 'top' : 'bottom', cx - minX < maxX - cx ? 'left' : 'right');
  }
  return sides;
}

/**
 * Clear interior dimensions of rooms (pure): for each room that is about a rectangle, its width and depth between
 * the inner wall faces (room polygons are drawn on the inner faces), placed inside the room a few pixels from its
 * lower and left side: [{ a, b, normal, length, room, axis: 'x' | 'z' }]. Rooms smaller than `minSize` are left out.
 */
export function roomInteriorSegments(rooms, perPx, { minSize = 0.6 } = {}) {
  const out = [];
  for (const room of rooms ?? []) {
    const pts = room.points ?? [];
    if (pts.length < 3) continue;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const w = maxX - minX; const d = maxZ - minZ;
    if (w < minSize || d < minSize) continue;
    // Only rectangle-like rooms: an L-shaped room has no single width.
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i]; const [x2, z2] = pts[(i + 1) % pts.length]; area += x1 * z2 - x2 * z1; }
    if (Math.abs(area) / 2 < 0.9 * w * d) continue;
    const inset = INNER_PX * perPx;
    out.push({ a: [minX, maxZ - inset], b: [maxX, maxZ - inset], normal: [0, -1], length: w, room: room.id, axis: 'x' });
    out.push({ a: [minX + inset, minZ], b: [minX + inset, maxZ], normal: [1, 0], length: d, room: room.id, axis: 'z' });
  }
  return out;
}

/** Interior dimensions' colour: blue, light on a dark background. */
export function interiorDimensionColor(background) {
  return dimensionColor(background) === '#e8edf3' ? '#7cc4fa' : '#1565c0';
}

/** Dimension colour for a background colour: light figures on a dark background, dark ones on a light one. */
export function dimensionColor(background) {
  const c = new THREE.Color(background);
  const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
  return luminance < 0.18 ? '#e8edf3' : '#1f2933';
}

export class PlanDimensions {
  /**
   * @param {import('../engine/viewport.js').Viewport} viewport
   * @param {import('../engine/overlay.js').Overlay} overlay
   * @param {{ enabled: () => boolean, project: () => object|null, format: (m: number) => string, color: () => string }} options
   *   color: the dimensions' colour for the current background (see dimensionColor)
   */
  constructor(viewport, overlay, options) {
    this.viewport = viewport;
    this.overlay = overlay;
    this.options = options;
    this.key = '';
    this.labelCount = 0;
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#1f2933', toneMapped: false, fog: false }));
    this.lines.name = 'planDimensions';
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.userData = { helper: true, noPick: true };
    viewport.helpers.add(this.lines);
    // Interior (clear) dimensions: dashed, in their own colour, so they read apart from the outside ones.
    this.inner = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: '#1565c0', dashSize: 0.1, gapSize: 0.06, toneMapped: false, fog: false }));
    this.inner.name = 'planDimensionsInterior';
    this.inner.frustumCulled = false;
    this.inner.visible = false;
    this.inner.userData = { helper: true, noPick: true };
    viewport.helpers.add(this.inner);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    const previous = viewport.options.beforeRender;
    viewport.options.beforeRender = (v) => { previous?.(v); this.update(); };
  }

  /** Forces a rebuild on the next frame (walls, units or theme changed). */
  invalidate() { this.key = ''; this.viewport.requestRender(); }

  update() {
    const p = this.options.project();
    const vp = this.viewport;
    if (!p || !this.options.enabled()) { this.clear(); return; }
    const level = p.levels?.find((l) => l.id === p.activeLevel) ?? p.levels?.[0];
    const walls = (p.walls ?? []).filter((w) => !level || (w.level ?? level.id) === level.id);
    const perPx = vp.pixelSizeAt(vp.target);
    if (!walls.length || !Number.isFinite(perPx) || perPx <= 0) { this.clear(); return; }
    // Rebuilt when the zoom moves by a step of 15 % (offsets and ticks stay about the same size on screen).
    const step = Math.round(Math.log(perPx) / Math.log(1.15));
    // In 3D only the sides facing the camera carry dimensions (the far ones are behind the building).
    this.sides = vp.planMode ? null : facingSides(walls, vp.camera.position);
    const color = this.options.color();
    const innerColor = this.options.innerColor?.() ?? '#1565c0';
    const rooms = (p.rooms ?? []).filter((r) => !level || (r.level ?? level.id) === level.id);
    const key = JSON.stringify([walls.map((w) => [w.a, w.b, w.thickness]), rooms.map((r) => r.points), p.units, level?.elevation, step, vp.planMode, this.sides, color, innerColor]);
    // Tools clear the whole overlay (overlay.reset): rebuild when our labels went with it.
    if (key === this.key && (!this.labelCount || this.overlay.labels.has('pd-0'))) return;
    this.key = key;
    this.build(walls, Math.pow(1.15, step), (level?.elevation ?? 0) + 0.02, color, rooms, innerColor);
  }

  build(walls, perPx, y, color, rooms = [], innerColor = '#1565c0') {
    const points = [];
    const v = (x, z) => new THREE.Vector3(x, y, z);
    const segments = planDimensionSegments(walls, perPx).filter((s) => !this.sides || this.sides.includes(s.side));
    let labels = 0;
    for (const s of segments) {
      const out = new THREE.Vector3(s.normal[0], 0, s.normal[1]);
      const A = v(...s.a); const B = v(...s.b);
      // Extension lines from just off the outer face to a little past the dimension line.
      for (const P of [A, B]) {
        const along = out.x !== 0 ? P.x - s.base : P.z - s.base;
        points.push(P.clone().addScaledVector(out, -Math.abs(along) + FACE_GAP_PX * perPx), P.clone().addScaledVector(out, OVER_PX * perPx));
      }
      points.push(A, B);
      // Architectural ticks: short 45° strokes through both ends.
      const tick = B.clone().sub(A).normalize().add(out).normalize().multiplyScalar(TICK_PX * perPx);
      for (const P of [A, B]) points.push(P.clone().sub(tick), P.clone().add(tick));
      if (s.length / perPx >= LABEL_PX) {
        const mid = A.clone().add(B).multiplyScalar(0.5).addScaledVector(out, 2 * perPx);
        this.overlay.label(`pd-${labels}`, mid, this.options.format(s.length), { kind: 'plandim', dx: 0, dy: 0, visible: () => this.seen(mid) });
        labels += 1;
      }
    }
    // Inside each room: clear width and depth between the inner faces (dashed, second colour).
    const inner = [];
    for (const s of roomInteriorSegments(rooms, perPx)) {
      const out = new THREE.Vector3(s.normal[0], 0, s.normal[1]);
      const A = v(...s.a); const B = v(...s.b);
      inner.push(A, B);
      const tick = B.clone().sub(A).normalize().add(out).normalize().multiplyScalar(TICK_PX * perPx);
      for (const P of [A, B]) inner.push(P.clone().sub(tick), P.clone().add(tick));
      if (s.length / perPx >= LABEL_PX) {
        const mid = A.clone().add(B).multiplyScalar(0.5).addScaledVector(out, 9 * perPx);
        this.overlay.label(`pd-${labels}`, mid, this.options.format(s.length), { kind: 'plandim-in', dx: 0, dy: 0, visible: () => this.seen(mid) });
        labels += 1;
      }
    }
    for (let i = labels; i < this.labelCount; i++) this.overlay.clearLabel(`pd-${i}`);
    this.labelCount = labels;
    this.overlay.labelHost.style.setProperty('--plandim-color', color);
    this.overlay.labelHost.style.setProperty('--plandim-in-color', innerColor);
    const gi = this.inner.geometry;
    gi.setAttribute('position', new THREE.Float32BufferAttribute(inner.flatMap((P) => [P.x, P.y, P.z]), 3));
    gi.computeBoundingSphere();
    this.inner.computeLineDistances();
    this.inner.material.color.set(innerColor);
    this.inner.material.dashSize = 6 * perPx;
    this.inner.material.gapSize = 4 * perPx;
    this.inner.visible = inner.length > 0;
    const g = this.lines.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((P) => [P.x, P.y, P.z]), 3));
    g.computeBoundingSphere();
    this.lines.material.color.set(color);
    this.lines.visible = points.length > 0;
    this.viewport.requestRender();
  }

  /** A label shows only where nothing of the model stands between it and the camera (always in the 2D plan). */
  seen(point) {
    const vp = this.viewport;
    if (vp.planMode) return true;
    const cam = vp.camera.position;
    const dir = point.clone().sub(cam);
    const far = dir.length();
    this.raycaster.set(cam, dir.divideScalar(far));
    this.raycaster.far = far - 0.05;
    const hit = this.raycaster.intersectObject(vp.content, true).find((h) => h.object.visible && !h.object.userData.helper && !h.object.isLine && !h.object.isLineSegments && !h.object.isPoints);
    return !hit;
  }

  clear() {
    if (!this.key && !this.labelCount && !this.lines.visible && !this.inner.visible) return;
    this.key = '';
    for (let i = 0; i < this.labelCount; i++) this.overlay.clearLabel(`pd-${i}`);
    this.labelCount = 0;
    this.lines.visible = false;
    this.inner.visible = false;
    this.viewport.requestRender();
  }
}
