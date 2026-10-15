// FreeCAD Part dress-ups on prism-shaped solids (box, extrusion, prism,
// cylinder, tube): Fillet and Chamfer of their vertical edges and of the edges
// round the top and bottom faces, Thickness (hollowed out, open at the top)
// and Offset (grown or shrunk all round). The solid keeps its base (shape.base)
// like a boolean keeps its parts; the base sits in the dress-up's own
// coordinates, and Explode gives it back.
import { arcPoints, polygonArea } from './geometry.js';
import { triangulate } from './triangulate.js';
import { taperedExtrude } from './features.js';

export const DRESSUP_KINDS = ['fillet', 'chamfer', 'thickness', 'offset3d', 'draft'];
/** Which edges a fillet / chamfer takes. */
export const DRESSUP_EDGES = ['all', 'top', 'vertical', 'topVertical', 'bottom', 'picked'];
/** Solids a dress-up can be put on. */
export const DRESSUP_BASES = ['box', 'pad', 'prism', 'cylinder', 'tube'];

const ngon = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));
const ccw = (loop) => (polygonArea(loop) > 0 ? loop : loop.slice().reverse());
const cw = (loop) => (polygonArea(loop) < 0 ? loop : loop.slice().reverse());

/** A base solid as its outlines (counter-clockwise outer, clockwise holes) and height, in its own coordinates. */
export function profileOf(base) {
  const p = base?.params ?? {};
  switch (base?.kind) {
    case 'box': return { shapes: [{ outer: [{ x: 0, y: 0 }, { x: p.length, y: 0 }, { x: p.length, y: p.width }, { x: 0, y: p.width }], holes: [] }], height: p.height };
    case 'pad': return { shapes: (base.shape?.shapes ?? []).map((s) => ({ outer: ccw(s.outer), holes: (s.holes ?? []).map(cw) })), height: p.height };
    case 'prism': return { shapes: [{ outer: ngon(0, 0, p.radius, p.sides), holes: [] }], height: p.height, sharp: true };
    case 'cylinder': return p.angle >= 359.999 ? { shapes: [{ outer: ngon(0, 0, p.radius, 72), holes: [] }], height: p.height, round: true } : null;
    case 'tube': return { shapes: [{ outer: ngon(0, 0, p.outer, 72), holes: [cw(ngon(0, 0, p.inner, 72))] }], height: p.height, round: true };
    default: return null;
  }
}

export const canDressUp = (base) => Boolean(profileOf(base));

/** The loop moved out by d (in by −d), mitred, keeping its points (its own orientation decides "out"). */
export function offsetLoop(loop, d) {
  if (!d) return loop.map((q) => ({ x: q.x, y: q.y }));
  const sign = polygonArea(loop) > 0 ? 1 : -1;
  const n = loop.length;
  const lines = loop.map((a, i) => {
    const b = loop[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dir = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    const out = { x: dir.y * sign, y: -dir.x * sign };
    return { p: { x: a.x + out.x * d, y: a.y + out.y * d }, dir };
  });
  return loop.map((q, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const den = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
    if (Math.abs(den) < 1e-9) return l2.p;
    const wx = l2.p.x - l1.p.x; const wy = l2.p.y - l1.p.y;
    const t = (wx * l2.dir.y - wy * l2.dir.x) / den;
    return { x: l1.p.x + l1.dir.x * t, y: l1.p.y + l1.dir.y * t };
  });
}

/** Rounds (or cuts) the convex corners of a counter-clockwise loop (vertical edges of the solid). */
export function roundCorners(loop, r, chamfer = false) {
  if (!(r > 0)) return loop;
  const n = loop.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n]; const v = loop[i]; const next = loop[(i + 1) % n];
    const a = { x: prev.x - v.x, y: prev.y - v.y }; const b = { x: next.x - v.x, y: next.y - v.y };
    const la = Math.hypot(a.x, a.y); const lb = Math.hypot(b.x, b.y);
    const turn = (v.x - prev.x) * (next.y - v.y) - (v.y - prev.y) * (next.x - v.x);
    const cos = (a.x * b.x + a.y * b.y) / (la * lb || 1);
    const theta = Math.acos(Math.max(-1, Math.min(1, cos)));
    // Only convex corners (a left turn) that are sharp enough and long enough.
    const d = chamfer ? r : r / Math.tan(theta / 2);
    if (turn <= 1e-9 || theta > Math.PI - 1e-3 || d > Math.min(la, lb) / 2 + 1e-9) { out.push(v); continue; }
    const ua = { x: a.x / la, y: a.y / la }; const ub = { x: b.x / lb, y: b.y / lb };
    const t1 = { x: v.x + ua.x * d, y: v.y + ua.y * d };
    const t2 = { x: v.x + ub.x * d, y: v.y + ub.y * d };
    if (chamfer) { out.push(t1, t2); continue; }
    const bis = { x: ua.x + ub.x, y: ua.y + ub.y }; const lbis = Math.hypot(bis.x, bis.y) || 1;
    const h = r / Math.sin(theta / 2);
    const c = { x: v.x + (bis.x / lbis) * h, y: v.y + (bis.y / lbis) * h };
    const s0 = (Math.atan2(t1.y - c.y, t1.x - c.x) * 180) / Math.PI;
    let s1 = (Math.atan2(t2.y - c.y, t2.x - c.x) * 180) / Math.PI;
    while (s1 < s0) s1 += 360;
    out.push(...arcPoints(c.x, c.y, r, s0, s1, 7.5));
  }
  return out;
}

/** The stack of (height, inset) rings of an edge profile from z0 to z1 rounding (or cutting) by r at the ends asked for. */
function levels(h, r, chamfer, top, bottom, reach = r) {
  const steps = chamfer ? 1 : 8;
  // reach < r: the corners rounded round the vertical edges would close to a point at the full inset.
  const k2 = reach / (r || 1);
  const out = [];
  if (bottom && r > 0) for (let k = 0; k <= steps; k++) { const a = (Math.PI / 2) * (1 - k / steps); out.push(chamfer ? [r * (k / steps), k2 * r * (1 - k / steps)] : [r - r * Math.sin(a), k2 * (r - r * Math.cos(a))]); }
  else out.push([0, 0]);
  if (top && r > 0) for (let k = 0; k <= steps; k++) { const a = (Math.PI / 2) * (k / steps); out.push(chamfer ? [h - r + r * (k / steps), k2 * r * (k / steps)] : [h - r + r * Math.sin(a), k2 * (r - r * Math.cos(a))]); }
  else out.push([h, 0]);
  return out.filter((lv, i, all) => i === 0 || Math.abs(lv[0] - all[i - 1][0]) > 1e-9 || Math.abs(lv[1] - all[i - 1][1]) > 1e-9);
}

/** A closed body: rings of each loop at the levels, with caps (holes grow where the outer shrinks). */
function stack(shape, rings) {
  const tris = [];
  // Where the outline moves in, the holes move out (both into the material: offsetLoop moves away from a loop's own inside).
  const ring = (loop, inset, z, hole) => offsetLoop(loop, hole ? inset : -inset).map((q) => [q.x, q.y, z]);
  const loops = [shape.outer, ...shape.holes];
  for (const loop of loops) {
    const hole = loop !== shape.outer;
    for (let k = 0; k + 1 < rings.length; k++) {
      const [z0, i0] = rings[k]; const [z1, i1] = rings[k + 1];
      const a = ring(loop, i0, z0, hole); const b = ring(loop, i1, z1, hole);
      for (let j = 0; j < loop.length; j++) {
        const j2 = (j + 1) % loop.length;
        tris.push([a[j], a[j2], b[j2]], [a[j], b[j2], b[j]]);
      }
    }
  }
  // Caps: bottom facing down, top facing up.
  const cap = (z, inset, up) => {
    const outer = offsetLoop(shape.outer, -inset);
    const holes = shape.holes.map((hole) => offsetLoop(hole, inset));
    for (const [a, b, c] of triangulate(outer, holes)) tris.push(up ? [[a.x, a.y, z], [b.x, b.y, z], [c.x, c.y, z]] : [[a.x, a.y, z], [c.x, c.y, z], [b.x, b.y, z]]);
  };
  cap(rings[0][0], rings[0][1], false);
  cap(rings[rings.length - 1][0], rings[rings.length - 1][1], true);
  return tris;
}

/** Triangles of a dress-up solid (in its own coordinates). */
export function dressupMesh(entity) {
  const base = entity.shape?.base;
  const prof = profileOf(base);
  if (!prof) return [];
  const p = entity.params;
  const h = prof.height;
  const tris = [];
  if (entity.kind === 'fillet' || entity.kind === 'chamfer') {
    const chamfer = entity.kind === 'chamfer';
    const r = Math.max(0, Math.min(p.size, h / 2 - 1e-6));
    const edges = DRESSUP_EDGES[p.edges] ?? 'all';
    const vertical = edges === 'all' || edges === 'vertical' || edges === 'topVertical';
    const top = edges === 'all' || edges === 'top' || edges === 'topVertical';
    const bottom = edges === 'all' || edges === 'bottom';
    for (const shape of prof.shapes) {
      const outer = vertical && !prof.round ? roundCorners(shape.outer, r, chamfer) : shape.outer;
      tris.push(...stack({ outer, holes: shape.holes }, levels(h, r, chamfer, top, bottom, vertical && !prof.round ? r * 0.97 : r)));
    }
    return tris;
  }
  if (entity.kind === 'draft') {
    // Draft (PartDesign Draft): the side faces lean in by the angle from the bottom (the neutral plane) up.
    for (const shape of prof.shapes) tris.push(...(taperedExtrude(shape, h, p.angle) ?? []));
    return tris;
  }
  if (entity.kind === 'thickness') {
    // Hollowed out: walls `thickness` thick; the top, the bottom, both or neither left open.
    const t = Math.max(0.01, p.thickness);
    const open = ['top', 'bottom', 'both', 'none'][p.open ?? 0] ?? 'top';
    const openTop = open === 'top' || open === 'both';
    const openBottom = open === 'bottom' || open === 'both';
    const zi0 = openBottom ? 0 : t;
    const zi1 = openTop ? h : h - t;
    for (const shape of prof.shapes) {
      const inner = offsetLoop(shape.outer, -t);
      if (polygonArea(inner) <= 0 || zi1 - zi0 <= 1e-9) { tris.push(...stack(shape, [[0, 0], [h, 0]])); continue; }
      const holesOut = shape.holes.map((hole) => offsetLoop(hole, t));
      const ring = (loop, z) => loop.map((q) => [q.x, q.y, z]);
      const band = (loop, z0, z1, flip) => {
        const a = ring(loop, z0); const b = ring(loop, z1);
        for (let j = 0; j < loop.length; j++) {
          const j2 = (j + 1) % loop.length;
          if (flip) tris.push([a[j], b[j2], a[j2]], [a[j], b[j], b[j2]]);
          else tris.push([a[j], a[j2], b[j2]], [a[j], b[j2], b[j]]);
        }
      };
      // Outside walls, the walls round the holes, the inside walls (facing in), the inside of the hole walls.
      band(shape.outer, 0, h, false);
      shape.holes.forEach((hole) => band(hole, 0, h, false));
      band(inner, zi0, zi1, true);
      holesOut.forEach((hole) => band(hole, zi0, zi1, true));
      // Each end: a rim round the opening, or a full cap plus the inside face (floor / ceiling).
      const rim = (z, up) => {
        for (const [a, b, c] of triangulate(shape.outer, [cw(inner)])) tris.push(up ? [[a.x, a.y, z], [b.x, b.y, z], [c.x, c.y, z]] : [[a.x, a.y, z], [c.x, c.y, z], [b.x, b.y, z]]);
        shape.holes.forEach((hole, i) => { for (const [a, b, c] of triangulate(ccw(holesOut[i]), [hole])) tris.push(up ? [[a.x, a.y, z], [b.x, b.y, z], [c.x, c.y, z]] : [[a.x, a.y, z], [c.x, c.y, z], [b.x, b.y, z]]); });
      };
      const closed = (z, up, zInside) => {
        for (const [a, b, c] of triangulate(shape.outer, shape.holes)) tris.push(up ? [[a.x, a.y, z], [b.x, b.y, z], [c.x, c.y, z]] : [[a.x, a.y, z], [c.x, c.y, z], [b.x, b.y, z]]);
        for (const [a, b, c] of triangulate(inner, holesOut)) tris.push(up ? [[a.x, a.y, zInside], [c.x, c.y, zInside], [b.x, b.y, zInside]] : [[a.x, a.y, zInside], [b.x, b.y, zInside], [c.x, c.y, zInside]]);
      };
      if (openBottom) rim(0, false); else closed(0, false, zi0);
      if (openTop) rim(h, true); else closed(h, true, zi1);
    }
    return tris;
  }
  // Offset: d all round (out when positive), the top and bottom moved by d too.
  const d = p.distance;
  for (const shape of prof.shapes) {
    const grown = { outer: offsetLoop(shape.outer, d), holes: shape.holes.map((hole) => offsetLoop(hole, -d)) };
    if (polygonArea(grown.outer) <= 0 || h + 2 * d <= 0) continue;
    tris.push(...stack(grown, [[-d, 0], [h + d, 0]]));
  }
  return tris;
}

/** Top view of a dress-up: its outlines (the vertical edges rounded, the offset applied). */
export function dressupOutlines(entity) {
  const prof = profileOf(entity.shape?.base);
  if (!prof) return [];
  const p = entity.params;
  return prof.shapes.flatMap((shape) => {
    if (entity.kind === 'offset3d') return [offsetLoop(shape.outer, p.distance), ...shape.holes.map((hole) => offsetLoop(hole, -p.distance))];
    if (entity.kind === 'thickness') return [shape.outer, offsetLoop(shape.outer, -p.thickness), ...shape.holes];
    const edges = DRESSUP_EDGES[p.edges] ?? 'all';
    const vertical = (edges === 'all' || edges === 'vertical' || edges === 'topVertical') && !prof.round;
    return [vertical ? roundCorners(shape.outer, p.size, entity.kind === 'chamfer') : shape.outer, ...shape.holes];
  });
}
