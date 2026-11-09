// Dimensions and labels on printed floor plans (pure: no DOM, no three).
//
// The main window sends a small description of each level's plan (walls as centre lines with
// their thickness, openings with their widths, rooms with their names and areas — see
// host.js planData); the print window draws it over the plan picture in the sheet's SVG, in
// millimetres on paper, at the plan's real scale:
//   - chain dimensions along each outside of the building (one tick at every wall centre line
//     seen from that side) and the overall dimension behind them, like an architectural plan;
//   - in 'detailed' mode also the width of every door and window, and each room's size;
//   - room names and areas, nudged so they cover neither walls nor each other.
// World plan coordinates are metres, x to the right and z down the sheet.

/** Dimension modes the print window offers. */
export const DIM_MODES = ['none', 'overall', 'detailed'];
/** Paper (mm) kept free around a plan for its dimension lines, by mode. */
export const DIM_BAND_MM = { none: 0, overall: 11, detailed: 17 };
/** Distance (mm on paper) of the first and second dimension rows from the building's outer face. */
export const DIM_ROW_MM = [6, 12];
const MERGE_M = 0.05;
const AXIS_TOL = 0.02;

const finite = (v) => Number.isFinite(v);

/** The walls' extents: centre lines ({ minX, maxX, minZ, maxZ }) and outer faces (`outer`). Null without walls. */
export function wallsBox(walls) {
  let box = null;
  for (const w of walls ?? []) {
    const pts = [w.a, w.b];
    const r = (Number(w.t ?? w.thickness) || 0.15) / 2;
    for (const [x, z] of pts) {
      if (!finite(x) || !finite(z)) continue;
      if (!box) box = { minX: x, maxX: x, minZ: z, maxZ: z, outer: { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r } };
      box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x); box.minZ = Math.min(box.minZ, z); box.maxZ = Math.max(box.maxZ, z);
      box.outer.minX = Math.min(box.outer.minX, x - r); box.outer.maxX = Math.max(box.outer.maxX, x + r);
      box.outer.minZ = Math.min(box.outer.minZ, z - r); box.outer.maxZ = Math.max(box.outer.maxZ, z + r);
    }
  }
  return box;
}

/** Sorted positions with neighbours closer than `tol` merged (the outermost ones are kept exactly). */
export function mergePositions(values, tol = MERGE_M) {
  const sorted = [...values].filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const out = [first];
  for (const v of sorted) if (v - out[out.length - 1] >= tol) out.push(v);
  if (out.length > 1 && last - out[out.length - 1] < tol) out[out.length - 1] = last;
  else if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Whether a wall point can be seen from outside the plan looking in from `side`: no other wall's centre
 * line lies in front of it (towards that side). `axis` 0: the view runs along z (top: from −z).
 */
function seenFrom(p, side, walls, self) {
  const u = side === 'top' || side === 'bottom' ? 0 : 1; // coordinate across the view
  const v = 1 - u; // coordinate along the view
  const toward = side === 'top' || side === 'left' ? -1 : 1;
  for (const w of walls) {
    if (w === self) continue;
    const lo = Math.min(w.a[u], w.b[u]);
    const hi = Math.max(w.a[u], w.b[u]);
    if (p[u] < lo - 1e-6 || p[u] > hi + 1e-6) continue;
    let front;
    if (hi - lo < 1e-9) front = toward < 0 ? Math.min(w.a[v], w.b[v]) : Math.max(w.a[v], w.b[v]);
    else { const k = (p[u] - w.a[u]) / (w.b[u] - w.a[u]); front = w.a[v] + k * (w.b[v] - w.a[v]); }
    if ((front - p[v]) * toward > MERGE_M) return false;
  }
  return true;
}

/**
 * The dimension lines of a plan: [{ side: 'top'|'bottom'|'left'|'right', row: 0|1, ticks: [positions m],
 * base (outer face coordinate, m), kind: 'chain'|'overall' }]. Top/bottom lines measure along x,
 * left/right along z. A side's chain ticks every wall centre line that can be seen from that side (no
 * wall in front of it, as on an architectural plan: the façade's walls and the walls meeting it, also
 * where the outline steps back) and always both ends, so the chain adds up to the overall dimension
 * behind it. 'overall' mode: the overall dimension on the top and left only.
 */
export function dimensionChains(walls, mode = 'detailed') {
  if (mode === 'none' || !DIM_MODES.includes(mode)) return [];
  const list = (walls ?? []).filter((w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) > 1e-6);
  const box = wallsBox(list);
  if (!box || (box.maxX - box.minX < MERGE_M && box.maxZ - box.minZ < MERGE_M)) return [];
  const sides = {
    top: { axis: 0, base: box.outer.minZ },
    bottom: { axis: 0, base: box.outer.maxZ },
    left: { axis: 1, base: box.outer.minX },
    right: { axis: 1, base: box.outer.maxX },
  };
  const out = [];
  for (const [side, s] of Object.entries(sides)) {
    const lo = s.axis === 0 ? box.minX : box.minZ;
    const hi = s.axis === 0 ? box.maxX : box.maxZ;
    if (hi - lo < MERGE_M) continue;
    if (mode === 'overall') {
      if (side === 'top' || side === 'left') out.push({ side, row: 0, ticks: [lo, hi], base: s.base, kind: 'overall' });
      continue;
    }
    const values = [lo, hi];
    const toward = side === 'top' || side === 'left' ? -1 : 1;
    for (const w of list) {
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      // A wall across the measured axis gives one tick (its centre line) at its end nearest the side; others give their ends.
      const across = Math.abs(w.b[s.axis] - w.a[s.axis]) / len < AXIS_TOL;
      const v = 1 - s.axis;
      const ends = across ? [(w.a[v] - w.b[v]) * toward > 0 ? w.a : w.b] : [w.a, w.b];
      for (const p of ends) if (seenFrom(p, side, list, w)) values.push(across ? (w.a[s.axis] + w.b[s.axis]) / 2 : p[s.axis]);
    }
    const ticks = mergePositions(values.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9));
    if (ticks.length > 2) {
      out.push({ side, row: 0, ticks, base: s.base, kind: 'chain' });
      out.push({ side, row: 1, ticks: [lo, hi], base: s.base, kind: 'overall' });
    } else out.push({ side, row: 0, ticks: [lo, hi], base: s.base, kind: 'overall' });
  }
  return out;
}

// ───────────────────────── geometry on paper

/** The four corners of a wall's plan rectangle (no mitres), in metres. */
export function wallCorners(w) {
  const dx = w.b[0] - w.a[0];
  const dz = w.b[1] - w.a[1];
  const len = Math.hypot(dx, dz) || 1;
  const r = (Number(w.t ?? w.thickness) || 0.15) / 2;
  const nx = (-dz / len) * r;
  const nz = (dx / len) * r;
  return [[w.a[0] + nx, w.a[1] + nz], [w.b[0] + nx, w.b[1] + nz], [w.b[0] - nx, w.b[1] - nz], [w.a[0] - nx, w.a[1] - nz]];
}

/** Axis-aligned box → its corners. */
export const boxCorners = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];

/** Whether two convex polygons overlap (separating axis test; touching does not count). */
export function convexOverlap(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const ax = -(q[1] - p[1]);
      const ay = q[0] - p[0];
      if (Math.abs(ax) + Math.abs(ay) < 1e-12) continue;
      let minA = Infinity; let maxA = -Infinity; let minB = Infinity; let maxB = -Infinity;
      for (const [x, y] of A) { const d = x * ax + y * ay; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const [x, y] of B) { const d = x * ax + y * ay; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) return false;
    }
  }
  return true;
}

/** Point in polygon (even-odd). */
export function insidePolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** About how wide `text` is at font size `size` (mm; CJK counts as wide). */
export function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text ?? '')) w += (/[ᄀ-ᇿ⺀-꓏가-힯豈-﫿＀-￯]/.test(ch) ? 0.95 : /[ .,:;'|!il1]/.test(ch) ? 0.32 : 0.56) * size;
  return w;
}

const RING_DIRS = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2], [0, 2], [-2, 0], [2, 0]];

/**
 * Places labels (boxes in paper mm) so they cover no obstacle and no other label: each label
 * `{ x, y (its wanted centre), w, h, region? (polygon it should stay in) }` tries its centre, then
 * spots around it further and further out (inside its region), and takes the first free one — or,
 * when nothing is free, the spot that hits the fewest things. Returns [{ x, y (centre), moved, clear }].
 * `obstacles` are convex polygons in mm.
 */
export function placeLabels(labels, obstacles = [], { step = 1.6, rings = 7 } = {}) {
  const placed = [];
  const order = labels.map((l, i) => i).sort((a, b) => (labels[b].w * labels[b].h) - (labels[a].w * labels[a].h));
  const result = new Array(labels.length);
  for (const i of order) {
    const l = labels[i];
    let best = null;
    for (let ring = 0; ring <= rings && !(best && best.hits === 0); ring++) {
      for (const [dx, dy] of ring === 0 ? [[0, 0]] : RING_DIRS.slice(1)) {
        const x = l.x + dx * ring * step;
        const y = l.y + dy * ring * step;
        const box = { x: x - l.w / 2, y: y - l.h / 2, w: l.w, h: l.h };
        const corners = boxCorners(box);
        if (l.region && ring > 0 && !corners.every((c) => insidePolygon(c, l.region))) continue;
        let hits = 0;
        for (const ob of obstacles) if (convexOverlap(corners, ob)) hits++;
        for (const p of placed) if (convexOverlap(corners, p)) hits += 2;
        const score = hits * 1000 + ring;
        if (!best || score < best.score) best = { x, y, hits, score, corners, ring };
        if (hits === 0) break;
      }
    }
    placed.push(best.corners);
    result[i] = { x: best.x, y: best.y, moved: best.ring > 0, clear: best.hits === 0 };
  }
  return result;
}

/**
 * A level's plan for the sheets from the project's entities (used by the main window; pure).
 * `opts` = { levelId, firstLevel, isDoor(opening) → bool, openSide(opening) → ±1/0, roomName(room), areaText(room), centre(room), units }.
 */
export function planData(project, opts) {
  const { levelId } = opts;
  const first = opts.firstLevel ?? project?.levels?.[0]?.id;
  const on = (e) => (e.level ?? first) === levelId;
  const r4 = (v) => Math.round(v * 10000) / 10000;
  const walls = (project?.walls ?? []).filter(on).map((w) => ({ id: w.id, a: [r4(w.a[0]), r4(w.a[1])], b: [r4(w.b[0]), r4(w.b[1])], t: r4(Number(w.thickness) || 0.15) }));
  const byId = new Map(walls.map((w) => [w.id, w]));
  const openings = [];
  for (const o of project?.openings ?? []) {
    const w = byId.get(o.wall);
    if (!w) continue;
    const dx = w.b[0] - w.a[0]; const dz = w.b[1] - w.a[1];
    const len = Math.hypot(dx, dz) || 1;
    const off = Number(o.offset) || 0;
    // swing: the wall face a door's leaf opens to (+1 left normal, −1 right, 0 none) — its width goes on the other face.
    openings.push({ x: r4(w.a[0] + (dx / len) * off), z: r4(w.a[1] + (dz / len) * off), ux: r4(dx / len), uz: r4(dz / len), width: r4(Number(o.width) || 0.9), t: w.t, door: Boolean(opts.isDoor?.(o)), swing: Math.sign(opts.openSide?.(o) ?? 0) || 0 });
  }
  const rooms = [];
  for (const room of project?.rooms ?? []) {
    if (!on(room) || !(room.points?.length >= 3)) continue;
    const pts = room.points.map(([x, z]) => [r4(x), r4(z)]);
    const xs = pts.map((p) => p[0]); const zs = pts.map((p) => p[1]);
    rooms.push({ name: opts.roomName ? opts.roomName(room) : room.name ?? '', area: opts.areaText ? opts.areaText(room) : '', points: pts, centre: opts.centre ? opts.centre(room) : [r4(xs.reduce((s, v) => s + v, 0) / xs.length), r4(zs.reduce((s, v) => s + v, 0) / zs.length)], size: [r4(Math.max(...xs) - Math.min(...xs)), r4(Math.max(...zs) - Math.min(...zs))] });
  }
  return { walls: walls.map(({ id, ...w }) => (void id, w)), openings, rooms, units: opts.units ?? 'mm' };
}
