// Door swings in plan (pure, Node-testable): which way a door opens, the floor area its
// leaf sweeps, and the lines that show it in the 2D plan (an arc + the open leaf, like an
// architectural drawing; sliding doors get an arrow).
//
// Every door item says how it moves in its build's `userData.swing` ({ hinge: 'left' |
// 'right' | 'both' | 'none', radius: leaf width, side: 'exterior' (opens to −Z), doubleActing,
// pivot, slide, fold, overhead }). In the item's own frame the hinge 'left' is at −x, the leaf
// opens to +Z (the item's front) unless side is 'exterior'. The scene builder mirrors x for
// `opening.flip` and turns the item so +Z faces the wall's left normal (or the right one for
// `opening.side === 'right'`); the functions here follow the same rules, so the Problems check
// and the plan drawing match what the 3D model shows.
import * as THREE from 'three';
import { wallDir, wallNormal, pointInPolygon } from './walls.js';

/** Extra clearance around a swing (m): fingers, a handle, a door stop. */
export const SWING_BAND = 0.1;

const META_MAT = new THREE.MeshBasicMaterial();
const metaCache = new Map();

/**
 * How the door of `item` moves (its build's userData.swing, see above), or null for windows,
 * placeholders and items that do not say. Built once per item/width/hinge (low quality, cached).
 */
export function swingMeta(item, params = {}, wallThickness = 0.2) {
  if (!item || item.category !== 'doors' || typeof item.build !== 'function') return null;
  const key = `${item.id}|${params.width ?? ''}|${params.hinge ?? ''}|${params.side ?? ''}|${wallThickness}`;
  if (metaCache.has(key)) return metaCache.get(key);
  let meta = null;
  try {
    const g = item.build(params, { quality: 'low', wallThickness, material: () => META_MAT, THREE });
    meta = g.userData.swing ? { ...g.userData.swing } : null;
    g.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
  } catch { meta = null; }
  if (meta) {
    // Sliding glass doors carry no `slide`: their panel runs to the left (−x).
    if (meta.hinge === 'none' && !meta.slide && !meta.fold && !meta.overhead && (item.tags ?? []).includes('sliding door')) meta.slide = 'left';
  }
  if (metaCache.size > 800) metaCache.delete(metaCache.keys().next().value);
  metaCache.set(key, meta);
  return meta;
}

/** 'swing' (hinged leaves), 'slide', 'fold', or 'none' (cased openings, garage doors, windows). */
export function swingKind(meta) {
  if (!meta) return 'none';
  if (meta.hinge && meta.hinge !== 'none' && meta.radius > 0) return 'swing';
  if (meta.slide) return 'slide';
  if (meta.fold) return 'fold';
  return 'none';
}

/** The opening's frame in plan: origin on the wall's centre line, ex/ez = the item's local x/z (before the flip mirror). */
export function openingFrame(opening, wall) {
  const d = wallDir(wall); const n = wallNormal(wall);
  const s = opening.side === 'right' ? -1 : 1;
  return { origin: [wall.a[0] + d[0] * opening.offset, wall.a[1] + d[1] * opening.offset], ex: [d[0] * s, d[1] * s], ez: [n[0] * s, n[1] * s] };
}

/**
 * The leaves of a swinging door in the opening group's frame (x along the wall, z out of it;
 * the flip mirror applied). Each leaf: { hinge: [x, z], dir (+1: the closed leaf runs to +x),
 * zs (+1: opens to +z), r (leaf width) }.
 */
export function swingLeaves(meta, { width, thickness = 0.2, flip = false } = {}) {
  if (swingKind(meta) !== 'swing') return [];
  const r = meta.radius;
  const zsList = meta.doubleActing ? [1, -1] : [meta.side === 'exterior' ? -1 : 1];
  const leaves = [];
  for (const zs of zsList) {
    const z = meta.doubleActing ? 0 : (zs * thickness) / 2;
    if (meta.pivot) {
      const dir = meta.hinge === 'right' ? -1 : 1;
      const hx = -dir * ((r + meta.pivot) / 2) + dir * meta.pivot;
      leaves.push({ hinge: [hx, 0], dir, zs, r });
      leaves.push({ hinge: [hx, 0], dir: -dir, zs: -zs, r: meta.pivot });
      break;
    }
    const dirs = meta.hinge === 'both' ? [1, -1] : [meta.hinge === 'right' ? -1 : 1];
    const span = dirs.length * r;
    for (const dir of dirs) leaves.push({ hinge: [Math.max(-width / 2, Math.min(width / 2, -dir * (span / 2))), z], dir, zs, r });
  }
  if (flip) for (const l of leaves) { l.hinge = [-l.hinge[0], l.hinge[1]]; l.dir = -l.dir; }
  return leaves;
}

const toPlan = (f, [x, z]) => [f.origin[0] + f.ex[0] * x + f.ez[0] * z, f.origin[1] + f.ex[1] * x + f.ez[1] * z];

/**
 * The leaves of an opening's door in world plan coordinates: { hinge: [x, z], u (unit, along
 * the closed leaf), v (unit, the way it opens), r }. [] for doors that do not swing.
 */
export function planLeaves(opening, wall, meta) {
  if (!wall) return [];
  const f = openingFrame(opening, wall);
  return swingLeaves(meta, { width: opening.width, thickness: wall.thickness ?? 0.15, flip: opening.flip }).map((l) => ({
    hinge: toPlan(f, l.hinge),
    u: [f.ex[0] * l.dir, f.ex[1] * l.dir],
    v: [f.ez[0] * l.zs, f.ez[1] * l.zs],
    r: l.r,
  }));
}

/** The swept quarter disc of a plan leaf (plus `band`) as a convex polygon. */
export function sectorPolygon(leaf, band = 0, segs = 12) {
  const R = leaf.r + band;
  const pts = [[leaf.hinge[0] - leaf.u[0] * Math.min(band, 0.05), leaf.hinge[1] - leaf.u[1] * Math.min(band, 0.05)]];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * (Math.PI / 2);
    const c = Math.cos(a); const s = Math.sin(a);
    pts.push([leaf.hinge[0] + R * (c * leaf.u[0] + s * leaf.v[0]), leaf.hinge[1] + R * (c * leaf.u[1] + s * leaf.v[1])]);
  }
  if (band > 0) pts.push([leaf.hinge[0] - leaf.u[0] * Math.min(band, 0.05) + leaf.v[0] * R, leaf.hinge[1] - leaf.u[1] * Math.min(band, 0.05) + leaf.v[1] * R]);
  return convexHull(pts);
}

/**
 * The doorway's walk-through zone on each side that the leaf does not sweep (both sides for
 * sliding doors and openings): a passage `depth` deep in front of the wall face, as wide as the
 * door less 0.1 m at each jamb (at least 0.6 m), so a piece just beside the doorway is fine.
 */
export function doorwayZones(opening, wall, meta, depth = 0.5) {
  if (!wall) return [];
  const f = openingFrame(opening, wall);
  const t = (wall.thickness ?? 0.15) / 2;
  const w = Math.min(opening.width, Math.max(0.6, opening.width - 0.2)) / 2;
  const leaves = swingLeaves(meta, { width: opening.width, thickness: t * 2, flip: opening.flip });
  const swung = new Set(leaves.map((l) => l.zs));
  const out = [];
  for (const zs of [1, -1]) {
    if (swung.has(zs)) continue;
    out.push([[-w, zs * t], [w, zs * t], [w, zs * (t + depth)], [-w, zs * (t + depth)]].map((p) => toPlan(f, p)));
  }
  return out;
}

/** The plan rectangle of a wall (no mitres): four corners. */
export function wallQuad(wall) {
  const n = wallNormal(wall); const h = (wall.thickness ?? 0.15) / 2;
  return [[wall.a[0] + n[0] * h, wall.a[1] + n[1] * h], [wall.b[0] + n[0] * h, wall.b[1] + n[1] * h], [wall.b[0] - n[0] * h, wall.b[1] - n[1] * h], [wall.a[0] - n[0] * h, wall.a[1] - n[1] * h]];
}

/**
 * How deep two convex polygons overlap (separating axis test): the smallest penetration over
 * all edge normals, ≤ 0 when they do not overlap.
 */
export function overlapDepth(A, B) {
  let best = Infinity;
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]; const q = poly[(i + 1) % poly.length];
      let nx = q[1] - p[1]; let nz = p[0] - q[0];
      const len = Math.hypot(nx, nz);
      if (len < 1e-9) continue;
      nx /= len; nz /= len;
      let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity;
      for (const v of A) { const d = v[0] * nx + v[1] * nz; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of B) { const d = v[0] * nx + v[1] * nz; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o < best) best = o;
      if (best <= 0) return best;
    }
  }
  return best;
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = []; const upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ───────────────────────── which way it opens (Entity Info, context menu)

const other = (s) => (s === 'left' ? 'right' : 'left');

/**
 * How a swinging door is set up, in words the panel shows:
 *   hinge — the hinge jamb as seen standing on the side the door opens to ('left' | 'right'; null for pairs);
 *   swing — the wall face the leaf opens to ('left' = the wall's left normal, a → b).
 */
export function doorDirection(opening, meta) {
  if (swingKind(meta) !== 'swing') return null;
  const zs = meta.doubleActing ? 1 : meta.side === 'exterior' ? -1 : 1;
  const face = (opening.side === 'right' ? -1 : 1) * zs;
  let hinge = null;
  if (meta.hinge === 'left' || meta.hinge === 'right') {
    const local = opening.flip ? other(meta.hinge) : meta.hinge;
    hinge = zs > 0 ? local : other(local);
  }
  return { hinge, swing: face > 0 ? 'left' : 'right', pair: meta.hinge === 'both', doubleActing: Boolean(meta.doubleActing) };
}

/**
 * Changes opening.flip / opening.side so the door has the wanted hinge (as seen from its swing
 * side) and/or swing face. Changing the swing face keeps the hinge on the same jamb.
 */
export function setDoorDirection(opening, meta, { hinge, swing } = {}) {
  const now = doorDirection(opening, meta);
  if (!now) return false;
  let changed = false;
  if (swing && swing !== now.swing) {
    opening.side = opening.side === 'right' ? 'left' : 'right';
    opening.flip = !opening.flip;
    changed = true;
  }
  if (hinge && now.hinge) {
    const cur = doorDirection(opening, meta).hinge;
    if (hinge !== cur) { opening.flip = !opening.flip; changed = true; }
  }
  if (!opening.flip) opening.flip = false;
  return changed;
}

/**
 * doorDirection of a project's opening plus the names of the rooms on the wall's left and right
 * faces ({ left, right }, '' outside every room), for the Entity Info panel. null for windows
 * and doors that do not swing.
 */
export function doorSideRooms(project, opening, item) {
  const wall = project.walls.find((w) => w.id === opening.wall);
  if (!wall || item?.category !== 'doors') return null;
  const meta = swingMeta(item, { ...(opening.params ?? {}), width: opening.width, height: opening.height }, wall.thickness ?? 0.15);
  const dir = doorDirection(opening, meta);
  if (!dir) return null;
  const d = wallDir(wall); const n = wallNormal(wall);
  const c = [wall.a[0] + d[0] * opening.offset, wall.a[1] + d[1] * opening.offset];
  const off = (wall.thickness ?? 0.15) / 2 + 0.3;
  const roomAt = (s) => project.rooms.find((r) => r.level === wall.level && pointInPolygon([c[0] + n[0] * s * off, c[1] + n[1] * s * off], r.points))?.name ?? '';
  return { ...dir, rooms: { left: roomAt(1), right: roomAt(-1) } };
}

// ───────────────────────── plan drawing

const ARC_SEGS = 18;

/**
 * Line segment points (group-local x, y, z triples, pairs) showing how the door moves: for each
 * leaf an arc from the closed to the open leaf plus the open leaf; sliding doors an arrow along
 * the wall, folding doors a zigzag.
 */
export function swingLinePoints(meta, { width, thickness = 0.2, flip = false, y = 0.012 } = {}) {
  const out = [];
  const seg = (a, b) => out.push(a[0], y, a[1], b[0], y, b[1]);
  const kind = swingKind(meta);
  if (kind === 'swing') {
    for (const l of swingLeaves(meta, { width, thickness, flip })) {
      const at = (a, R = l.r) => [l.hinge[0] + R * Math.cos(a) * l.dir, l.hinge[1] + R * Math.sin(a) * l.zs];
      for (let i = 0; i < ARC_SEGS; i++) seg(at((i / ARC_SEGS) * (Math.PI / 2)), at(((i + 1) / ARC_SEGS) * (Math.PI / 2)));
      seg(l.hinge, at(Math.PI / 2));
      // The leaf's thickness: a second line along the open leaf.
      const tk = 0.04 * -l.dir;
      seg([l.hinge[0] + tk, l.hinge[1]], [l.hinge[0] + tk, at(Math.PI / 2)[1]]);
    }
  } else if (kind === 'slide' || kind === 'fold') {
    const t = thickness / 2;
    const zf = t + 0.06;
    const m = flip ? -1 : 1;
    const arrow = (x0, x1) => {
      seg([x0, zf], [x1, zf]);
      const s = Math.sign(x1 - x0) || 1;
      seg([x1, zf], [x1 - s * 0.1, zf + 0.06]);
      seg([x1, zf], [x1 - s * 0.1, zf - 0.06]);
    };
    const w = width / 2;
    if (kind === 'slide') {
      seg([-w, 0], [w, 0]);
      const sides = meta.slide === 'both' ? [-1, 1] : [(meta.slide === 'left' ? -1 : 1) * m];
      for (const s of sides) arrow(s * w * 0.15, s * w * 0.85);
    } else {
      const n = Math.max(2, Math.round(width / 0.45));
      const pw = width / n;
      for (let i = 0; i < n; i++) seg([-w + i * pw, i % 2 ? 0.12 : 0], [-w + (i + 1) * pw, i % 2 ? 0 : 0.12]);
      const sides = meta.fold === 'both' ? [-1, 1] : [(meta.fold === 'left' ? -1 : 1) * m];
      for (const s of sides) arrow(s * w * 0.15, s * w * 0.85);
    }
  }
  return out;
}

const swingMaterial = new THREE.LineBasicMaterial({ color: '#1565c0', transparent: true, opacity: 0.95, depthTest: false });
swingMaterial.userData.keepStyle = true;

/** The plan-only lines of a door (null when it has none); hidden until the plan view shows them. */
export function doorSwingLines(meta, options) {
  const pts = swingLinePoints(meta, options);
  if (!pts.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(g, swingMaterial);
  lines.userData = { helper: true, noPick: true, noBounds: true, noExport: true, ownsGeometry: true, doorSwing: true };
  lines.renderOrder = 4;
  lines.frustumCulled = false;
  return lines;
}
