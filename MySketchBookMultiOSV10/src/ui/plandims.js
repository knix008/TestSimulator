// Plan dimensions in the view (2D plan and 3D): along each outside of the active level's walls a chain
// (one tick at every wall centre line seen from that side) and the overall dimension behind it — the same
// chains a printed plan carries (print/dimensions.js). Drawn as overlay lines + labels at the level's
// floor; their offsets and ticks are a fixed number of screen pixels, so they are rebuilt when the zoom
// changes by a step (not on every frame). Toggled by settings.showPlanDims.
import * as THREE from 'three';
import { dimensionChains } from '../print/dimensions.js';

/** Screen pixels: first row from the outer face, between rows, tick half-size, extension overshoot, face gap. */
const ROW_PX = 26;
const ROW_GAP_PX = 22;
const TICK_PX = 5;
const OVER_PX = 4;
const FACE_GAP_PX = 3;
/** A label needs about this many pixels of dimension line; shorter pieces keep their ticks only. */
const LABEL_PX = 38;

/**
 * Dimension segments of a level's walls (pure): [{ a: [x, z], b: [x, z], normal: [nx, nz], offset, base, length, kind }]
 * — `a`/`b` on the dimension line, `base` the outer face position the extension lines start from, `normal`
 * pointing away from the building. `rowPx`/`gapPx` are converted with `perPx` (metres per pixel).
 */
export function planDimensionSegments(walls, perPx, { mode = 'detailed' } = {}) {
  const out = [];
  for (const chain of dimensionChains(walls, mode)) {
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

export class PlanDimensions {
  /**
   * @param {import('../engine/viewport.js').Viewport} viewport
   * @param {import('../engine/overlay.js').Overlay} overlay
   * @param {{ enabled: () => boolean, project: () => object|null, format: (m: number) => string, color: () => string }} options
   */
  constructor(viewport, overlay, options) {
    this.viewport = viewport;
    this.overlay = overlay;
    this.options = options;
    this.key = '';
    this.labelCount = 0;
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
    // In 3D only the sides facing the camera carry dimensions (the far ones would show through the walls).
    this.sides = vp.planMode ? null : facingSides(walls, vp.camera.position);
    const key = JSON.stringify([walls.map((w) => [w.a, w.b, w.thickness]), p.units, level?.elevation, step, vp.planMode, this.sides, this.options.color()]);
    // Tools clear the whole overlay (overlay.reset): rebuild when our layer went with it.
    if (key === this.key && this.overlay.layers.has('plan-dims')) return;
    this.key = key;
    this.build(walls, Math.pow(1.15, step), (level?.elevation ?? 0) + 0.02);
  }

  build(walls, perPx, y) {
    const lines = [];
    const v = (x, z) => new THREE.Vector3(x, y, z);
    const segments = planDimensionSegments(walls, perPx).filter((s) => !this.sides || this.sides.includes(s.side));
    let labels = 0;
    for (const s of segments) {
      const [nx, nz] = s.normal;
      const A = v(...s.a); const B = v(...s.b);
      // Extension lines from just off the outer face to a little past the dimension line.
      for (const P of [A, B]) {
        const along = nx !== 0 ? P.x - s.base : P.z - s.base;
        const from = P.clone().addScaledVector(new THREE.Vector3(nx, 0, nz), -Math.abs(along) + FACE_GAP_PX * perPx);
        lines.push(from, P.clone().addScaledVector(new THREE.Vector3(nx, 0, nz), OVER_PX * perPx));
      }
      lines.push(A, B);
      // Architectural ticks: short 45° strokes through both ends.
      const dir = B.clone().sub(A).normalize();
      const tick = dir.clone().add(new THREE.Vector3(nx, 0, nz)).normalize().multiplyScalar(TICK_PX * perPx);
      for (const P of [A, B]) lines.push(P.clone().sub(tick), P.clone().add(tick));
      if (s.length / perPx >= LABEL_PX) {
        const mid = A.clone().add(B).multiplyScalar(0.5).addScaledVector(new THREE.Vector3(nx, 0, nz), 2 * perPx);
        this.overlay.label(`pd-${labels}`, mid, this.options.format(s.length), { kind: 'plandim', dx: 0, dy: 0 });
        labels += 1;
      }
    }
    for (let i = labels; i < this.labelCount; i++) this.overlay.clearLabel(`pd-${i}`);
    this.labelCount = labels;
    this.overlay.lines('plan-dims', lines, { color: this.options.color(), depthTest: false, opacity: 0.9 });
  }

  clear() {
    if (!this.key && !this.labelCount && !this.overlay.layers.has('plan-dims')) return;
    this.key = '';
    for (let i = 0; i < this.labelCount; i++) this.overlay.clearLabel(`pd-${i}`);
    this.labelCount = 0;
    this.overlay.clear('plan-dims');
  }
}
