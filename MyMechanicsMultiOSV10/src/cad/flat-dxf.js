// A sheet metal part's flat pattern as a 2D drawing (DXF / DWG), straight from the part: the blank's outline and
// holes (the largest face of the flat body square to the sheet) on layer OUTLINE, the bend lines on BEND_UP and
// BEND_DOWN (by the side each bend turns to when formed) with a note per bend on BEND_NOTES — angle, inner radius
// and allowance. Coordinates are millimetres in the sheet plane (x along the first bend when there is one).
import { toWorld as bendToWorld } from './sheet-fold.js';
import { rep } from './kernel.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const L = Math.hypot(...a) || 1; return a.map((x) => x / L); };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const TAU = 2 * Math.PI;
const norm = (a) => { let x = a % TAU; if (x < 0) x += TAU; return x; };

export const FLAT_LAYERS = [
  { name: 'OUTLINE', color: 7 },
  { name: 'BEND_UP', color: 1, ltype: 'CONTINUOUS' },
  { name: 'BEND_DOWN', color: 3, ltype: 'CONTINUOUS' },
  { name: 'BEND_NOTES', color: 2 },
];

/** The sheet plane's frame: origin, normal and in-plane axes (x along the first bend line when given). */
export function sheetFrame(sheet, along = null) {
  const n = unit(sheet.normal);
  let x = along ? unit(sub(along, n.map((c) => c * dot(along, n)))) : null;
  if (!x || !Number.isFinite(x[0]) || Math.hypot(...x) < 0.5) { const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; x = unit(cross(cross(n, a), n)); }
  return { o: sheet.origin, n, x, y: cross(n, x) };
}

/** The circle through an edge (its points at 0, ¼, ½). */
function circleOf(edge) {
  const p = [0, 0.25, 0.5].map((t) => vec(edge.pointAt(t)));
  const ab = sub(p[1], p[0]); const ac = sub(p[2], p[0]);
  const n = cross(ab, ac); const d = 2 * dot(n, n);
  const c = p[0].map((v, i) => v + ((cross(n, ab)[i] * dot(ac, ac) + cross(ac, n)[i] * dot(ab, ab)) / d));
  return { c, r: Math.hypot(...sub(p[0], c)) };
}

/** One edge of the outline as DXF-model entities in the frame. */
function edgeEntities(edge, P, layer) {
  const type = edge.geomType;
  const a = vec(edge.startPoint); const b = vec(edge.endPoint);
  if (type === 'LINE') return [{ name: 'LINE', layerName: layer, start: [...P(a), 0], end: [...P(b), 0] }];
  if (type === 'CIRCLE') {
    const { c, r } = circleOf(edge); const C = P(c);
    if (Math.hypot(...sub(a, b)) < 1e-7) return [{ name: 'CIRCLE', layerName: layer, center: [...C, 0], radius: r }];
    // Counter-clockwise in the frame from start to end, or the other way round (the middle point decides).
    const m = P(vec(edge.pointAt(0.5))); const A = P(a); const B = P(b);
    const ang = (q) => Math.atan2(q[1] - C[1], q[0] - C[0]);
    const a0 = ang(A); const a1 = ang(B); const am = ang(m);
    const ccw = norm(am - a0) < norm(a1 - a0);
    return [{ name: 'ARC', layerName: layer, center: [...C, 0], radius: r, startAngle: norm(ccw ? a0 : a1), endAngle: norm(ccw ? a1 : a0) }];
  }
  // Other curves (ellipses, splines): a fine polyline.
  const n = 96;
  const pts = Array.from({ length: n + 1 }, (_, i) => P(vec(edge.pointAt(i / n))));
  return [{ name: 'LWPOLYLINE', layerName: layer, points: pts, bulges: [], closed: false }];
}

/**
 * The flat pattern as DXF-model entities: { entities, layers, size: [w, h], bends }. `flatBody` the part built flat,
 * `sheet` the formed part's sheet ({ normal, origin }), `flatBends` / `formedBends` the bend records (same order).
 */
export function flatPatternEntities(flatBody, sheet, flatBends = [], formedBends = [], { fmt = (v) => String(Math.round(v * 100) / 100) } = {}) {
  const first = flatBends.find((b) => b.frame);
  const F = sheetFrame(sheet, first ? first.frame.z : null);
  const P = (p) => { const d = sub(p, F.o); return [dot(d, F.x), dot(d, F.y)]; };
  // The blank: the largest face square to the sheet normal.
  let face = null; let best = -1;
  for (const f of flatBody.faces) {
    if (f.geomType !== 'PLANE') continue;
    let nn; try { nn = unit(vec(f.normalAt(f.center))); } catch { continue; }
    if (Math.abs(dot(nn, F.n)) < 1 - 1e-6) continue;
    let area = 0; try { area = rep().measureArea(f); } catch { area = 0; }
    if (area > best) { best = area; face = f; }
  }
  if (!face) return null;
  const entities = [];
  for (const e of face.edges) entities.push(...edgeEntities(e, P, 'OUTLINE'));
  // Bend lines across the blank, in the middle of each bend's strip.
  const [lo, hi] = flatBody.boundingBox.bounds;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
  const bends = [];
  flatBends.forEach((bend, i) => {
    const G = bend.frame;
    if (!G) return;
    const zs = corners.map((c) => dot(sub(c, G.o), G.z));
    const z0 = Math.max(G.zLo ?? -Infinity, Math.min(...zs)); const z1 = Math.min(G.zHi ?? Infinity, Math.max(...zs));
    if (!(z1 > z0)) return;
    const BA = Number(bend.BA ?? bend.allowance ?? 0);
    const A = P(bendToWorld(G, [BA / 2, 0, z0])); const B = P(bendToWorld(G, [BA / 2, 0, z1]));
    const fg = formedBends[i]?.frame;
    const down = fg && dot(fg.y, sheet.normal) < 0;
    const layer = down ? 'BEND_DOWN' : 'BEND_UP';
    entities.push({ name: 'LINE', layerName: layer, start: [...A, 0], end: [...B, 0] });
    const angle = Number(bend.theta ?? bend.angle ?? 0); const radius = Number(bend.r ?? bend.radius ?? 0);
    const text = `${down ? 'DOWN' : 'UP'} ${fmt(angle)}° R${fmt(radius)} BA${fmt(BA)}`;
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const rot = Math.atan2(B[1] - A[1], B[0] - A[0]);
    entities.push({ name: 'TEXT', layerName: 'BEND_NOTES', insert: [mid[0] - 1.5 * Math.sin(rot), mid[1] + 1.5 * Math.cos(rot)], height: 2.5, text, rotation: rot });
    bends.push({ dir: down ? 'down' : 'up', angle, radius, allowance: BA, line: [A, B] });
  });
  const xs = []; const ys = [];
  for (const c of corners) { const q = P(c); xs.push(q[0]); ys.push(q[1]); }
  return { entities, layers: FLAT_LAYERS, size: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], bends };
}
