// CAM (FreeCAD CAM/Path workbench, 2.5D): tool paths from 2D outlines and
// G-code for a 3-axis mill (RS-274 / LinuxCNC · GRBL dialect). No DOM.
//   profile  — the tool runs around outlines, outside (parts) or inside (cut-outs)
//   pocket   — clears the inside of outlines (zigzag + a finishing pass), holes kept
//   drill    — a peck-drilling cycle at the centre of every circle
//   engrave  — the tool follows the lines themselves (no offset)
//   rough3d  — 3D roughing of a solid's surface in Z levels, stock left on (cam3d.js)
//   finish3d — 3D raster finishing of the surface with a ball or flat end mill

import { collectLoops, buildShapes } from './stl.js';
import { polygonArea } from './geometry.js';
import { surfacePaths } from './cam3d.js';

export const CAM_OPERATIONS = ['profile', 'pocket', 'drill', 'engrave', 'rough3d', 'finish3d'];
export const CAM_3D = ['rough3d', 'finish3d'];
export const TOOL_SHAPES = ['flat', 'ball'];
export const RASTER_DIRECTIONS = ['x', 'y'];
export const PROFILE_SIDES = ['outside', 'inside'];

export function defaultCamOptions() {
  return {
    operation: 'profile', side: 'outside', climb: true,
    tool: 6, depth: 5, stepDown: 1.5, stepOver: 0.5, top: 0,
    safeZ: 5, feed: 600, plunge: 150, spindle: 12000, peck: 2, finish: true,
    toolShape: 'flat', leave: 0.3, stockTop: 1, direction: 'x',
  };
}

const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
export function normalizeCamOptions(raw = {}) {
  const d = defaultCamOptions();
  const pos = (v, def, min = 1e-3) => Math.max(min, finite(v, def));
  return {
    operation: CAM_OPERATIONS.includes(raw.operation) ? raw.operation : d.operation,
    side: PROFILE_SIDES.includes(raw.side) ? raw.side : d.side,
    climb: raw.climb === undefined ? d.climb : Boolean(raw.climb),
    tool: pos(raw.tool, d.tool), depth: pos(raw.depth, d.depth), stepDown: pos(raw.stepDown, d.stepDown),
    stepOver: Math.min(1, pos(raw.stepOver, d.stepOver, 0.05)), top: finite(raw.top, d.top),
    safeZ: pos(raw.safeZ, d.safeZ, 0.1), feed: pos(raw.feed, d.feed, 1), plunge: pos(raw.plunge, d.plunge, 1),
    spindle: Math.max(0, finite(raw.spindle, d.spindle)), peck: Math.max(0, finite(raw.peck, d.peck)),
    finish: raw.finish === undefined ? d.finish : Boolean(raw.finish),
    toolShape: TOOL_SHAPES.includes(raw.toolShape) ? raw.toolShape : d.toolShape,
    leave: Math.max(0, finite(raw.leave, d.leave)), stockTop: Math.max(0, finite(raw.stockTop, d.stockTop)),
    direction: RASTER_DIRECTIONS.includes(raw.direction) ? raw.direction : d.direction,
  };
}

// ───────────────────────── geometry

const ccw = (loop) => (polygonArea(loop) > 0 ? loop : [...loop].reverse());

/**
 * Offset of a closed loop (any orientation): d > 0 outward, d < 0 inward.
 * Corners the tool goes round get arcs; the others get mitres. Returns a
 * counter-clockwise loop, or null when the loop vanishes (too small for the tool).
 */
export function offsetOutline(loop, d) {
  const pts = ccw(loop).filter((p, i, all) => Math.hypot(p.x - all[(i + 1) % all.length].x, p.y - all[(i + 1) % all.length].y) > 1e-9);
  const n = pts.length;
  if (n < 3) return null;
  if (!d) return pts.map((p) => ({ ...p }));
  const normal = (a, b) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.y - a.y) / l, y: -(b.x - a.x) / l }; // outward for a counter-clockwise loop
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const v = pts[i];
    const next = pts[(i + 1) % n];
    const n1 = normal(prev, v);
    const n2 = normal(v, next);
    const turn = (v.x - prev.x) * (next.y - v.y) - (v.y - prev.y) * (next.x - v.x); // > 0: convex corner
    const roundIt = d > 0 ? turn > 1e-12 : turn < -1e-12;
    if (roundIt) {
      // The tool goes round the corner: an arc of radius |d| about it.
      let a1 = Math.atan2(n1.y, n1.x);
      let a2 = Math.atan2(n2.y, n2.x);
      if (d > 0) { while (a2 < a1) a2 += 2 * Math.PI; } else { while (a2 > a1) a2 -= 2 * Math.PI; }
      const steps = Math.max(1, Math.ceil(Math.abs(a2 - a1) / (Math.PI / 18)));
      for (let k = 0; k <= steps; k++) {
        const a = a1 + ((a2 - a1) * k) / steps;
        out.push({ x: v.x + Math.abs(d) * Math.cos(a) * Math.sign(d), y: v.y + Math.abs(d) * Math.sin(a) * Math.sign(d) });
      }
    } else {
      // Mitre: where the two offset edges meet.
      const p1 = { x: prev.x + n1.x * d, y: prev.y + n1.y * d };
      const p2 = { x: v.x + n2.x * d, y: v.y + n2.y * d };
      const d1 = { x: v.x - prev.x, y: v.y - prev.y };
      const d2 = { x: next.x - v.x, y: next.y - v.y };
      const den = d1.x * d2.y - d1.y * d2.x;
      if (Math.abs(den) < 1e-12) out.push({ x: v.x + n2.x * d, y: v.y + n2.y * d });
      else {
        const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
        out.push({ x: p1.x + d1.x * t, y: p1.y + d1.y * t });
      }
    }
  }
  // An inward offset that turns inside out (or shrinks to nothing) is no path.
  const area = polygonArea(out);
  if (d < 0 && (area <= 1e-9 || area >= polygonArea(pts))) return null;
  if (d < 0 && selfCrossing(out)) return null;
  // Every point must keep the tool radius from the outline (else the loop turned inside out).
  if (d < 0 && out.some((p) => distanceToLoop(p, pts) < Math.abs(d) * (1 - 1e-6) - 1e-9)) return null;
  return out;
}

function distanceToLoop(p, loop) {
  let best = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return best;
}

/** True when two non-neighbouring edges of a loop cross. */
function selfCrossing(loop) {
  const n = loop.length;
  if (n > 400) return false;
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return o(a, b, c) * o(a, b, d) < -1e-12 && o(c, d, a) * o(c, d, b) < -1e-12;
  };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cross(loop[i], loop[(i + 1) % n], loop[j], loop[(j + 1) % n])) return true;
  }
  return false;
}

/** Zigzag lines (along X) inside a region (outer + holes), stepover apart. */
function zigzag(outer, holes, step) {
  const loops = [outer, ...holes];
  const ys = loops.flat().map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rows = [];
  for (let y = minY + step / 2, row = 0; y < maxY; y += step, row++) {
    const xs = [];
    for (const loop of loops) for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    const segments = [];
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > 1e-6) segments.push([{ x: xs[k], y }, { x: xs[k + 1], y }]);
    rows.push(row % 2 ? segments.reverse().map(([a, b]) => [b, a]) : segments);
  }
  return rows.flat();
}

/** Depths of the passes: every stepDown, the last one at the full depth. */
export function passDepths(o) {
  const out = [];
  for (let z = o.stepDown; z < o.depth - 1e-9; z += o.stepDown) out.push(o.top - z);
  out.push(o.top - o.depth);
  return out;
}

// ───────────────────────── tool paths

/** What CAM works on: closed outlines, open chains, circles (for drilling). Plain data. */
export function camSource(entities, drawing = null) {
  const flat = entities.filter((e) => e.type !== 'solid' && e.type !== 'dim' && e.type !== 'text' && e.type !== 'hatch' && e.type !== 'leader');
  const { loops, open } = collectLoops(flat, drawing);
  const circles = flat.filter((e) => e.type === 'circle').map((e) => ({ x: e.cx, y: e.cy, r: e.r }));
  return { loops, chains: open, circles };
}

/**
 * Tool paths: [{ op, kind: 'cut' | 'drill', points: [{ x, y, z }], depth? }] in
 * machining order, plus warnings (outlines too small for the tool…).
 */
export function camPaths(source, rawOptions) {
  const o = normalizeCamOptions(rawOptions);
  // 3D: over the solids' height field; the stock top (and the safe height above it) from the model.
  if (CAM_3D.includes(o.operation)) {
    if (!source.model) return { paths: [], warnings: ['noModel'], options: o };
    const options = { ...o, top: source.model.zMax + o.stockTop };
    return { paths: surfacePaths(source.model, options), warnings: [], options };
  }
  const r = o.tool / 2;
  const paths = [];
  const warnings = [];
  const loopPasses = (loop, external) => {
    // Climb milling with a clockwise spindle: round the outside clockwise, inside a hole or pocket counter-clockwise.
    const path = external === o.climb ? [...loop].reverse() : loop;
    for (const z of passDepths(o)) paths.push({ op: o.operation, kind: 'cut', points: [...path, path[0]].map((p) => ({ x: p.x, y: p.y, z })) });
  };
  if (o.operation === 'profile') {
    // The outline on the chosen side; its holes are always cut from inside (they keep their size).
    for (const shape of buildShapes(source.loops)) {
      const outside = o.side === 'outside';
      const path = offsetOutline(shape.outer, outside ? r : -r);
      if (path) loopPasses(path, outside); else warnings.push('tooSmall');
      for (const hole of shape.holes) {
        const inHole = offsetOutline(hole, -r);
        if (inHole) loopPasses(inHole, false); else warnings.push('tooSmall');
      }
    }
  } else if (o.operation === 'pocket') {
    for (const shape of buildShapes(source.loops)) {
      const outer = offsetOutline(shape.outer, -r);
      if (!outer) { warnings.push('tooSmall'); continue; }
      const holes = shape.holes.map((h) => offsetOutline(h, r)).filter(Boolean).map((h) => [...h].reverse());
      const lines = zigzag(outer, holes, o.tool * o.stepOver);
      for (const z of passDepths(o)) {
        for (const [a, b] of lines) paths.push({ op: 'pocket', kind: 'cut', points: [{ ...a, z }, { ...b, z }] });
        if (o.finish) {
          paths.push({ op: 'pocket', kind: 'cut', points: [...outer, outer[0]].map((p) => ({ x: p.x, y: p.y, z })) });
          for (const hole of holes) paths.push({ op: 'pocket', kind: 'cut', points: [...hole, hole[0]].map((p) => ({ x: p.x, y: p.y, z })) });
        }
      }
    }
  } else if (o.operation === 'drill') {
    for (const c of source.circles) {
      if (c.r * 2 < o.tool * 0.9) warnings.push('holeSmaller');
      paths.push({ op: 'drill', kind: 'drill', points: [{ x: c.x, y: c.y, z: o.top - o.depth }] });
    }
  } else {
    for (const chain of [...source.chains, ...source.loops.map((loop) => [...loop, loop[0]])]) {
      for (const z of passDepths(o)) paths.push({ op: 'engrave', kind: 'cut', points: chain.map((p) => ({ x: p.x, y: p.y, z })) });
    }
  }
  return { paths, warnings: [...new Set(warnings)], options: o };
}

// ───────────────────────── G-code

const n = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** G-code (mm, absolute) for the paths: rapid to safe Z between cuts, plunge feed down, cut feed along. */
export function toGcode(job, { title = 'MyCAD', date = new Date() } = {}) {
  const { paths, options: o } = job;
  // The safe height: above the stock top (0 for 2D jobs).
  const clear = (o.top ?? 0) + o.safeZ;
  const lines = [
    '%', `(${String(title).replace(/[()]/g, '')} — MyCAD CAM)`, `(${date.toISOString().slice(0, 16).replace('T', ' ')})`,
    `(Operation: ${o.operation}${o.operation === 'profile' ? ` ${o.side}` : ''}, tool D${n(o.tool)} mm${o.toolShape === 'ball' ? ' ball' : ''}, ${CAM_3D.includes(o.operation) ? `stock top ${n(o.top)} mm, leave ${n(o.operation === 'rough3d' ? o.leave : 0)} mm` : `depth ${n(o.depth)} mm`}, step down ${n(o.stepDown)} mm)`,
    'G21 G90 G94 G17 (mm, absolute, feed per minute, XY plane)',
    `G0 Z${n(clear)}`,
    `M3 S${Math.round(o.spindle)}`,
  ];
  let at = null;
  const drills = paths.filter((p) => p.kind === 'drill');
  for (const path of paths.filter((p) => p.kind === 'cut')) {
    const [first, ...rest] = path.points;
    const same = at && Math.hypot(at.x - first.x, at.y - first.y) < 1e-6;
    if (!same) {
      lines.push(`G0 Z${n(clear)}`, `G0 X${n(first.x)} Y${n(first.y)}`);
      lines.push(`G1 Z${n(first.z)} F${n(o.plunge)}`);
    } else if (Math.abs(at.z - first.z) > 1e-9) lines.push(`G1 Z${n(first.z)} F${n(o.plunge)}`);
    let feedSet = false;
    let z = first.z;
    for (const p of rest) {
      lines.push(`G1 X${n(p.x)} Y${n(p.y)}${Math.abs(p.z - z) > 1e-9 ? ` Z${n(p.z)}` : ''}${feedSet ? '' : ` F${n(o.feed)}`}`);
      z = p.z;
      feedSet = true;
    }
    at = rest.length ? rest[rest.length - 1] : first;
  }
  if (drills.length) {
    lines.push(`G0 Z${n(clear)}`);
    const retract = n(o.top + Math.min(1, o.safeZ));
    const cycle = o.peck > 0 ? `G83 Q${n(o.peck)}` : 'G81';
    drills.forEach((d, i) => {
      const p = d.points[0];
      lines.push(i === 0 ? `G98 ${cycle} X${n(p.x)} Y${n(p.y)} Z${n(p.z)} R${retract} F${n(o.plunge)}` : `X${n(p.x)} Y${n(p.y)}`);
    });
    lines.push('G80');
  }
  lines.push(`G0 Z${n(clear)}`, 'M5', 'M30', '%', '');
  return lines.join('\n');
}

/** Cut length, rapid length and an estimated time (minutes) for a job. */
export function camStats(job) {
  const { paths, options: o } = job;
  let cut = 0;
  let rapid = 0;
  let plunge = 0;
  let at = { x: 0, y: 0 };
  for (const path of paths) {
    const first = path.points[0];
    rapid += Math.hypot(first.x - at.x, first.y - at.y) + 2 * o.safeZ;
    plunge += o.safeZ + Math.abs(o.top - first.z);
    for (let i = 1; i < path.points.length; i++) cut += Math.hypot(path.points[i].x - path.points[i - 1].x, path.points[i].y - path.points[i - 1].y, path.points[i].z - path.points[i - 1].z);
    at = path.points[path.points.length - 1];
  }
  const minutes = cut / o.feed + plunge / o.plunge + rapid / 3000;
  return { cut, rapid, minutes, paths: paths.length };
}

/**
 * Reads G-code back into moves (for checking and the preview):
 * [{ rapid: boolean, from: {x,y,z}, to: {x,y,z} }]. Canned drill cycles become plunges.
 */
export function parseGcode(text) {
  const moves = [];
  let pos = { x: 0, y: 0, z: 0 };
  let mode = 0;
  let cycle = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\([^)]*\)|;.*$/g, '').trim().toUpperCase();
    if (!line || line === '%') continue;
    const words = Object.fromEntries([...line.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g)].map(([, k, v]) => [k, Number(v)]));
    const gs = [...line.matchAll(/G\s*(\d+)/g)].map((m) => Number(m[1]));
    for (const g of gs) {
      if (g === 0 || g === 1) { mode = g; cycle = null; }
      if (g === 81 || g === 83) cycle = { z: words.Z, r: words.R };
      if (g === 80) cycle = null;
    }
    if (!('X' in words || 'Y' in words || 'Z' in words)) continue;
    if (cycle) {
      const at = { x: words.X ?? pos.x, y: words.Y ?? pos.y, z: pos.z };
      if ('Z' in words) cycle.z = words.Z;
      moves.push({ rapid: true, from: pos, to: { ...at } });
      moves.push({ rapid: false, from: { ...at, z: cycle.r ?? at.z }, to: { ...at, z: cycle.z } });
      pos = at;
      continue;
    }
    const to = { x: words.X ?? pos.x, y: words.Y ?? pos.y, z: words.Z ?? pos.z };
    moves.push({ rapid: mode === 0, from: pos, to });
    pos = to;
  }
  return moves;
}
