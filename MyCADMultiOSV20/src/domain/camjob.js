// FreeCAD CAM job: tool bits, tool controllers, an ordered list of
// operations (each with its own geometry and dress-ups), fixtures and a
// property bag, posted together as one G-code program. Adds the operations
// cam.js does not have — adaptive (contour-parallel) clearing, area, face
// milling, helix, thread milling, tapping, slot, deburr, V-carve, from-shape,
// probe, custom G-code, comment, stop, array, compound, simple copy — and the
// dress-ups: array, axis map, dogbone, drag knife, lead in/out, boundary, ramp
// entry, holding tags and Z correction. No DOM.

import { buildShapes } from './stl.js';
import { camPaths, normalizeCamOptions, offsetOutline, passDepths } from './cam.js';

export const TOOL_KINDS = ['endmill', 'ballend', 'vbit', 'drill', 'chamfer', 'threadmill', 'tap', 'probe'];
export const OP_TYPES = [
  'profile', 'pocket', 'drill', 'engrave', 'rough3d', 'finish3d',
  'adaptive', 'area', 'areaWorkplane', 'millFace', 'helix', 'threadMilling', 'tapping', 'slot', 'deburr', 'vcarve', 'shape', 'probe',
  'custom', 'comment', 'stop', 'array', 'compound', 'copy',
];
export const DRESSUP_TYPES = ['array', 'axisMap', 'dogbone', 'dragKnife', 'leadInOut', 'boundary', 'rampEntry', 'tag', 'zCorrect'];
export const FIXTURES = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59'];

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
let counter = 0;
export const camId = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

/** A tool bit: { id, name, kind, diameter, angle (V and chamfer bits), flutes, length, pitch (taps, thread mills) }. */
export function normalizeTool(raw) {
  return {
    id: str(raw?.id, 64) || camId('t'), name: str(raw?.name, 80) || 'Tool', kind: TOOL_KINDS.includes(raw?.kind) ? raw.kind : 'endmill',
    diameter: Math.max(0.01, num(raw?.diameter, 6)), angle: Math.min(179, Math.max(1, num(raw?.angle, 90))), flutes: Math.max(1, Math.round(num(raw?.flutes, 2))),
    length: Math.max(1, num(raw?.length, 50)), pitch: Math.max(0.01, num(raw?.pitch, 1)),
  };
}

/** A tool controller: which tool, its number, spindle speed and feeds. */
export function normalizeController(raw) {
  return { id: str(raw?.id, 64) || camId('c'), name: str(raw?.name, 80) || 'TC', tool: str(raw?.tool, 64), number: Math.max(1, Math.round(num(raw?.number, 1))), spindle: Math.max(0, num(raw?.spindle, 12000)), feed: Math.max(1, num(raw?.feed, 600)), plunge: Math.max(1, num(raw?.plunge, 150)) };
}

/** A dress-up: { type, params }. */
const normalizeDressup = (raw) => (DRESSUP_TYPES.includes(raw?.type) ? { type: raw.type, params: raw.params && typeof raw.params === 'object' ? structuredClone(raw.params) : {} } : null);

/** An operation: { id, type, name, active, controller, source: [entity ids], options, dressups, … }. */
export function normalizeOp(raw) {
  if (!OP_TYPES.includes(raw?.type)) return null;
  return {
    id: str(raw.id, 64) || camId('o'), type: raw.type, name: str(raw.name, 80) || raw.type, active: raw.active !== false,
    controller: str(raw.controller, 64), source: Array.isArray(raw.source) ? raw.source.filter((s) => typeof s === 'string').slice(0, 5000) : [],
    options: raw.options && typeof raw.options === 'object' ? structuredClone(raw.options) : {},
    dressups: (Array.isArray(raw.dressups) ? raw.dressups : []).map(normalizeDressup).filter(Boolean),
    ...(Array.isArray(raw.children) ? { children: raw.children.filter((c) => typeof c === 'string') } : {}),
    ...(typeof raw.base === 'string' ? { base: raw.base } : {}),
    ...(Array.isArray(raw.frozen) ? { frozen: raw.frozen } : {}),
    ...(raw.startPoint && Number.isFinite(raw.startPoint.x) && Number.isFinite(raw.startPoint.y) ? { startPoint: { x: raw.startPoint.x, y: raw.startPoint.y } } : {}),
  };
}

/** The drawing's CAM job (drawing.camJob). */
export function normalizeCamJob(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tools = (Array.isArray(raw.tools) ? raw.tools : []).map(normalizeTool);
  const controllers = (Array.isArray(raw.controllers) ? raw.controllers : []).map(normalizeController);
  const ops = (Array.isArray(raw.ops) ? raw.ops : []).map(normalizeOp).filter(Boolean);
  const fixtures = (Array.isArray(raw.fixtures) ? raw.fixtures : ['G54']).filter((f) => FIXTURES.includes(f));
  const bag = {};
  for (const [k, v] of Object.entries(raw.propertyBag ?? {})) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) bag[k] = String(v).slice(0, 200);
  return { name: str(raw.name, 80) || 'Job', tools, controllers, ops, fixtures: fixtures.length ? fixtures : ['G54'], propertyBag: bag, stock: { extra: Math.max(0, num(raw.stock?.extra, 2)), top: num(raw.stock?.top, 0), height: Math.max(0.1, num(raw.stock?.height, 10)) } };
}

export const emptyJob = () => normalizeCamJob({ name: 'Job', tools: [], controllers: [], ops: [] });

// ───────────────────────── tool bit files (FreeCAD .fctb)

const SHAPE_FILE = { endmill: 'endmill.fcstd', ballend: 'ballend.fcstd', vbit: 'v-bit.fcstd', drill: 'drill.fcstd', chamfer: 'chamfer.fcstd', threadmill: 'thread-mill.fcstd', tap: 'tap.fcstd', probe: 'probe.fcstd' };

/** CAM_ToolBitSave: a tool as FreeCAD's tool bit JSON. */
export function toolToFctb(tool) {
  const parameter = { Diameter: `${tool.diameter} mm`, Length: `${tool.length} mm`, Flutes: String(tool.flutes) };
  if (tool.kind === 'vbit' || tool.kind === 'chamfer' || tool.kind === 'drill') parameter.CuttingEdgeAngle = `${tool.angle} °`;
  if (tool.kind === 'tap' || tool.kind === 'threadmill') parameter.Pitch = `${tool.pitch} mm`;
  return `${JSON.stringify({ version: 2, name: tool.name, shape: SHAPE_FILE[tool.kind], parameter, attribute: {} }, null, 2)}\n`;
}

/** CAM_ToolBitLoad: a tool from FreeCAD's tool bit JSON. */
export function toolFromFctb(text) {
  const raw = JSON.parse(text);
  const value = (v) => Number.parseFloat(String(v ?? '').replace(',', '.'));
  const kind = Object.entries(SHAPE_FILE).find(([, file]) => String(raw.shape ?? '').toLowerCase().includes(file.replace('.fcstd', '')))?.[0] ?? 'endmill';
  const p = raw.parameter ?? {};
  return normalizeTool({ name: raw.name, kind, diameter: value(p.Diameter), angle: value(p.CuttingEdgeAngle), flutes: value(p.Flutes), length: value(p.Length), pitch: value(p.Pitch) });
}

// ───────────────────────── geometry helpers

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ring = (loop, z) => [...loop, loop[0]].map((p) => ({ x: p.x, y: p.y, z }));
const circlePoints = (c, r, z0, z1, turns = 1, segments = 36, start = 0) => Array.from({ length: Math.round(segments * turns) + 1 }, (_, i) => {
  const a = start + (2 * Math.PI * i) / segments;
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), z: z0 + ((z1 - z0) * i) / (segments * turns) };
});

/** Bounding box of the source (loops, chains, circles). */
function sourceBox(source) {
  const pts = [...source.loops.flat(), ...source.chains.flat(), ...source.circles.flatMap((c) => [{ x: c.x - c.r, y: c.y - c.r }, { x: c.x + c.r, y: c.y + c.r }])];
  if (!pts.length) return null;
  return { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) };
}

/** Loops ordered so the one nearest the start point comes first (CAM_SetStartPoint), each starting at its nearest point. */
function fromStart(loops, start) {
  if (!start) return loops;
  const near = (loop) => Math.min(...loop.map((p) => dist(p, start)));
  return loops.slice().sort((a, b) => near(a) - near(b)).map((loop, i) => {
    if (i) return loop;
    const k = loop.reduce((best, p, j) => (dist(p, start) < dist(loop[best], start) ? j : best), 0);
    return [...loop.slice(k), ...loop.slice(0, k)];
  });
}

// ───────────────────────── operations

/**
 * The paths of one operation: [{ op, kind: 'cut' | 'drill' | 'tap' | 'probe' | 'code', points, … }].
 * ctx: { source (camSource of its geometry), wires (3D paths), model (height field), job, tool, controller, opsById, pathsOf(op) }.
 */
export function opPaths(op, ctx) {
  const tool = ctx.tool ?? normalizeTool({});
  const o = normalizeCamOptions({ ...op.options, tool: tool.diameter, toolShape: tool.kind === 'ballend' ? 'ball' : 'flat', operation: ['profile', 'pocket', 'drill', 'engrave', 'rough3d', 'finish3d'].includes(op.type) ? op.type : 'profile' });
  const r = tool.diameter / 2;
  const src = ctx.source ?? { loops: [], chains: [], circles: [] };
  const P = [];
  const cut = (points, extra = {}) => P.push({ op: op.id, kind: 'cut', points, ...extra });
  const loops = fromStart(src.loops, op.startPoint);
  switch (op.type) {
    case 'profile': case 'pocket': case 'drill': case 'engrave': case 'rough3d': case 'finish3d': {
      const job = camPaths({ ...src, loops, model: ctx.model }, o);
      for (const p of job.paths) P.push({ ...p, op: op.id });
      break;
    }
    case 'adaptive': case 'area': case 'areaWorkplane': {
      // Contour-parallel clearing: inward offsets one step-over apart, cut from the middle outward (even tool load).
      const top = op.type === 'areaWorkplane' ? num(op.options.workplaneZ, o.top) : o.top;
      const step = Math.max(0.05, tool.diameter * o.stepOver);
      for (const shape of buildShapes(loops)) {
        const rings = [];
        for (let d = r, guard = 0; guard < 2000; d += step, guard++) {
          const next = offsetOutline(shape.outer, -d);
          if (!next) break;
          rings.push(next);
        }
        const holes = shape.holes.map((h) => offsetOutline(h, r)).filter(Boolean);
        for (const z of passDepths({ ...o, top })) {
          for (const loop of rings.slice().reverse()) cut(ring(loop, z));
          for (const hole of holes) cut(ring(hole, z));
        }
      }
      break;
    }
    case 'millFace': {
      // Facing: zigzag over the stock top (the geometry's box and the tool's width round it).
      const box = sourceBox(src) ?? { minX: 0, minY: 0, maxX: 10, maxY: 10 };
      const pad = r + num(op.options.extra, ctx.job?.stock?.extra ?? 2);
      const step = Math.max(0.05, tool.diameter * o.stepOver);
      for (const z of passDepths(o)) {
        let flip = false;
        for (let y = box.minY - pad + r; y <= box.maxY + pad - r + 1e-9; y += step) {
          const a = { x: box.minX - pad, y, z }; const b = { x: box.maxX + pad, y, z };
          cut(flip ? [b, a] : [a, b]);
          flip = !flip;
        }
      }
      break;
    }
    case 'helix': {
      // CAM_Helix: helical boring of every circle down to depth, then a full circle at the bottom.
      for (const c of src.circles) {
        const R = c.r - r;
        if (R <= 1e-6) { P.push({ op: op.id, kind: 'drill', points: [{ x: c.x, y: c.y, z: o.top - o.depth }] }); continue; }
        const turns = Math.max(1, Math.ceil(o.depth / o.stepDown));
        cut([...circlePoints(c, R, o.top, o.top - o.depth, turns), ...circlePoints(c, R, o.top - o.depth, o.top - o.depth, 1).slice(1)]);
      }
      break;
    }
    case 'threadMilling': {
      // CAM_ThreadMilling: up the hole in a helix of the thread's pitch (climb, internal thread).
      const pitch = num(op.options.pitch, tool.pitch);
      const major = num(op.options.majorDiameter, 0);
      for (const c of src.circles) {
        const R = (major > 0 ? major / 2 : c.r) - r;
        if (R <= 1e-6) continue;
        const bottom = o.top - o.depth;
        cut([{ x: c.x, y: c.y, z: bottom }, ...circlePoints(c, R, bottom, o.top, Math.max(1, o.depth / pitch))]);
      }
      break;
    }
    case 'tapping': {
      const pitch = num(op.options.pitch, tool.pitch);
      for (const c of src.circles) P.push({ op: op.id, kind: 'tap', pitch, points: [{ x: c.x, y: c.y, z: o.top - o.depth }] });
      break;
    }
    case 'slot': {
      // CAM_Slot: the tool's centre along open lines (and closed outlines), ends extended.
      const extend = num(op.options.extend, 0);
      for (const chain of [...src.chains, ...loops.map((l) => [...l, l[0]])]) {
        if (chain.length < 2) continue;
        const a = chain[0]; const b = chain[1]; const y = chain[chain.length - 1]; const x = chain[chain.length - 2];
        const ua = { x: (a.x - b.x) / (dist(a, b) || 1), y: (a.y - b.y) / (dist(a, b) || 1) };
        const ub = { x: (y.x - x.x) / (dist(x, y) || 1), y: (y.y - x.y) / (dist(x, y) || 1) };
        const pts = [{ x: a.x + ua.x * extend, y: a.y + ua.y * extend }, ...chain.slice(1, -1), { x: y.x + ub.x * extend, y: y.y + ub.y * extend }];
        for (const z of passDepths(o)) cut(pts.map((p) => ({ ...p, z })));
      }
      break;
    }
    case 'deburr': {
      // CAM_Deburr: a V or chamfer bit along the edges, deep enough for the chamfer width.
      const width = num(op.options.width, 0.5);
      const half = ((tool.kind === 'vbit' || tool.kind === 'chamfer' ? tool.angle : 90) / 2) * (Math.PI / 180);
      const depth = width / Math.tan(half) + num(op.options.extraDepth, 0);
      const offset = depth * Math.tan(half) - width;
      for (const shape of buildShapes(loops)) {
        const outer = offsetOutline(shape.outer, offset);
        if (outer) cut(ring(outer, o.top - depth));
        for (const hole of shape.holes) { const h = offsetOutline(hole, -offset); if (h) cut(ring(h, o.top - depth)); }
      }
      break;
    }
    case 'vcarve': {
      // CAM_Vcarve: inward rings, each as deep as a V bit is wide there — the letter's middle deepest.
      const half = ((tool.kind === 'vbit' ? tool.angle : 60) / 2) * (Math.PI / 180);
      const step = Math.max(0.02, num(op.options.step, 0.2));
      const maxDepth = num(op.options.maxDepth, o.depth);
      for (const shape of buildShapes(loops)) {
        for (let d = 0, guard = 0; guard < 2000; d += step, guard++) {
          const inner = d ? offsetOutline(shape.outer, -d) : shape.outer;
          if (!inner) break;
          cut(ring(inner, o.top - Math.min(maxDepth, d / Math.tan(half))));
        }
      }
      break;
    }
    case 'shape': {
      // CAM_Shape / CAM_PathShapeTC: the tool along 3D wires as they are (their own heights), or flat 2D ones at the depth.
      for (const path of ctx.wires ?? []) cut(path.map(([x, y, z]) => ({ x, y, z })));
      for (const chain of [...src.chains, ...loops.map((l) => [...l, l[0]])]) cut(chain.map((p) => ({ x: p.x, y: p.y, z: o.top - o.depth })));
      break;
    }
    case 'probe': {
      // CAM_Probe: a grid of probing points over the geometry's box.
      const box = sourceBox(src) ?? { minX: 0, minY: 0, maxX: 10, maxY: 10 };
      const nx = Math.max(2, Math.round(num(op.options.nx, 3))); const ny = Math.max(2, Math.round(num(op.options.ny, 3)));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) P.push({ op: op.id, kind: 'probe', points: [{ x: box.minX + ((box.maxX - box.minX) * i) / (nx - 1), y: box.minY + ((box.maxY - box.minY) * j) / (ny - 1), z: o.top - num(op.options.probeDepth, 5) }] });
      break;
    }
    case 'custom': P.push({ op: op.id, kind: 'code', lines: String(op.options.gcode ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean), points: [] }); break;
    case 'comment': P.push({ op: op.id, kind: 'code', lines: [`(${String(op.options.text ?? '').replace(/[()]/g, '')})`], points: [] }); break;
    case 'stop': P.push({ op: op.id, kind: 'code', lines: [op.options.optional ? 'M1' : 'M0'], points: [] }); break;
    case 'copy': for (const p of op.frozen ?? []) P.push({ ...structuredClone(p), op: op.id }); break;
    case 'array': {
      // CAM_Array: the base operation's paths again at each offset (linear) or turn (polar).
      const base = ctx.opsById?.get(op.base);
      if (!base) break;
      const paths = ctx.pathsOf(base);
      const count = Math.max(1, Math.round(num(op.options.count, 3)));
      for (let k = 1; k < count; k++) {
        for (const p of paths) {
          const map = op.options.mode === 'polar'
            ? (q) => { const a = ((num(op.options.angle, 360) / count) * k * Math.PI) / 180; const cx = num(op.options.cx); const cy = num(op.options.cy); const dx = q.x - cx; const dy = q.y - cy; return { ...q, x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) }; }
            : (q) => ({ ...q, x: q.x + num(op.options.dx, 20) * k, y: q.y + num(op.options.dy, 0) * k });
          P.push({ ...p, op: op.id, points: p.points.map(map) });
        }
      }
      break;
    }
    case 'compound': for (const id of op.children ?? []) { const child = ctx.opsById?.get(id); if (child && child.active) P.push(...ctx.pathsOf(child)); } break;
    default: break;
  }
  return applyDressups(P, op.dressups, { tool, options: o });
}

// ───────────────────────── dress-ups

const cutsOf = (paths, f) => paths.map((p) => (p.kind === 'cut' && p.points.length >= 2 ? f(p) : p)).flat();
const isClosed = (pts) => pts.length > 3 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6;

/** Corners: each inner vertex with its incoming and outgoing directions and the turn (+ left, − right). */
function corners(pts) {
  const closed = isClosed(pts);
  const out = [];
  const n = pts.length;
  for (let i = closed ? 0 : 1; i < (closed ? n - 1 : n - 1); i++) {
    const prev = pts[i === 0 ? n - 2 : i - 1]; const p = pts[i]; const next = pts[i + 1];
    const u = { x: p.x - prev.x, y: p.y - prev.y }; const v = { x: next.x - p.x, y: next.y - p.y };
    const lu = Math.hypot(u.x, u.y); const lv = Math.hypot(v.x, v.y);
    if (lu < 1e-9 || lv < 1e-9) continue;
    const cross = (u.x * v.y - u.y * v.x) / (lu * lv);
    const dot = (u.x * v.x + u.y * v.y) / (lu * lv);
    out.push({ i, u: { x: u.x / lu, y: u.y / lu }, v: { x: v.x / lv, y: v.y / lv }, turn: Math.atan2(cross, dot) });
  }
  return out;
}

export function applyDressups(paths, dressups = [], { tool, options }) {
  let out = paths;
  const r = tool.diameter / 2;
  for (const { type, params: q } of dressups) {
    switch (type) {
      case 'array': {
        const count = Math.max(1, Math.round(num(q.count, 2)));
        const copies = [];
        for (let k = 1; k < count; k++) for (const p of out) copies.push({ ...p, points: p.points.map((pt) => ({ ...pt, x: pt.x + num(q.dx, 20) * k, y: pt.y + num(q.dy, 0) * k })) });
        out = [...out, ...copies];
        break;
      }
      case 'axisMap': {
        // Y wrapped round a rotary axis: A (degrees) = y / radius.
        const radius = Math.max(0.01, num(q.radius, 10));
        out = out.map((p) => ({ ...p, axisMap: true, points: p.points.map((pt) => ({ ...pt, a: (pt.y / radius) * (180 / Math.PI) })) }));
        break;
      }
      case 'dogbone': {
        // Into every inside corner (left turns of a counter-clockwise pocket, by default) along its bisector, so a square part fits.
        const side = q.side === 'right' ? -1 : 1;
        out = cutsOf(out, (p) => {
          const pts = p.points.slice();
          const add = corners(pts).filter((c) => Math.sign(c.turn) === side && Math.abs(c.turn) > 0.35).map((c) => {
            // Towards the material's corner: along u − v.
            const b = { x: c.u.x - c.v.x, y: c.u.y - c.v.y };
            const lb = Math.hypot(b.x, b.y) || 1;
            const len = r * (1 / Math.sin((Math.PI - Math.abs(c.turn)) / 2) - 1);
            const at = pts[c.i];
            return { i: c.i, pts: [{ ...at, x: at.x + (b.x / lb) * len, y: at.y + (b.y / lb) * len }, { ...at }] };
          });
          for (const a of add.reverse()) pts.splice(a.i + 1, 0, ...a.pts);
          return { ...p, points: pts };
        });
        break;
      }
      case 'dragKnife': {
        // The blade trails by `offset`: lines run on by it, sharp corners get a swivel round the corner point.
        const offset = num(q.offset, 0.5);
        const filterAngle = (num(q.filterAngle, 20) * Math.PI) / 180;
        out = cutsOf(out, (p) => {
          const pts = p.points;
          const cs = new Map(corners(pts).map((c) => [c.i, c]));
          const next = [pts[0]];
          for (let i = 1; i < pts.length; i++) {
            const c = cs.get(i);
            if (!c || Math.abs(c.turn) < filterAngle) { next.push(pts[i]); continue; }
            const at = pts[i];
            const a0 = Math.atan2(c.u.y, c.u.x);
            const steps = Math.max(2, Math.ceil(Math.abs(c.turn) / 0.2));
            for (let k = 0; k <= steps; k++) { const a = a0 + (c.turn * k) / steps; next.push({ ...at, x: at.x + offset * Math.cos(a), y: at.y + offset * Math.sin(a) }); }
          }
          return { ...p, points: next };
        });
        break;
      }
      case 'leadInOut': {
        // A quarter-circle lead into a closed path's start and out of its end, tangent to it.
        const R = Math.max(0.01, num(q.radius, r));
        const side = q.side === 'left' ? 1 : -1;
        out = cutsOf(out, (p) => {
          const pts = p.points;
          if (!isClosed(pts)) return p;
          const s = pts[0]; const t = pts[1];
          const l = dist(s, t) || 1;
          const u = { x: (t.x - s.x) / l, y: (t.y - s.y) / l };
          const nrm = { x: -u.y * side, y: u.x * side };
          const c = { x: s.x + nrm.x * R, y: s.y + nrm.y * R };
          const base = Math.atan2(s.y - c.y, s.x - c.x);
          const arc = (from, to) => Array.from({ length: 9 }, (_, k) => { const a = from + ((to - from) * k) / 8; return { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a), z: s.z }; });
          const dir = side > 0 ? -1 : 1;
          return { ...p, points: [...arc(base + dir * (Math.PI / 2), base), ...pts.slice(1), ...arc(base, base - dir * (Math.PI / 2)).slice(1)] };
        });
        break;
      }
      case 'boundary': {
        // Only what lies inside the boundary outline is cut; the path is broken where it leaves it.
        const poly = Array.isArray(q.boundary) ? q.boundary : [];
        if (poly.length < 3) break;
        const inside = (pt) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]; const b = poly[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
        out = out.flatMap((p) => {
          if (p.kind !== 'cut') return p.points.every(inside) ? [p] : [];
          const pieces = [];
          let cur = [];
          for (let i = 0; i < p.points.length; i++) {
            const a = p.points[i];
            if (i === 0) { if (inside(a)) cur.push(a); continue; }
            const b0 = p.points[i - 1];
            // Split the segment where it crosses the boundary.
            const ts = [];
            for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
              const c = poly[j]; const d = poly[k];
              const den = (a.x - b0.x) * (d.y - c.y) - (a.y - b0.y) * (d.x - c.x);
              if (Math.abs(den) < 1e-15) continue;
              const tt = ((c.x - b0.x) * (d.y - c.y) - (c.y - b0.y) * (d.x - c.x)) / den;
              const ss = ((c.x - b0.x) * (a.y - b0.y) - (c.y - b0.y) * (a.x - b0.x)) / den;
              if (tt > 1e-9 && tt < 1 - 1e-9 && ss >= 0 && ss <= 1) ts.push(tt);
            }
            const marks = [0, ...ts.sort((x, y) => x - y), 1];
            for (let m = 1; m < marks.length; m++) {
              const lerp = (tt) => ({ x: b0.x + (a.x - b0.x) * tt, y: b0.y + (a.y - b0.y) * tt, z: b0.z + (a.z - b0.z) * tt });
              const mid = lerp((marks[m - 1] + marks[m]) / 2);
              if (inside(mid)) { if (!cur.length) cur.push(lerp(marks[m - 1])); cur.push(lerp(marks[m])); } else if (cur.length) { if (cur.length > 1) pieces.push({ ...p, points: cur }); cur = []; }
            }
          }
          if (cur.length > 1) pieces.push({ ...p, points: cur });
          return pieces;
        });
        break;
      }
      case 'rampEntry': {
        // No straight plunge: the tool ramps down along the path at the angle, then back to where it started.
        const angle = (Math.max(1, Math.min(89, num(q.angle, 5))) * Math.PI) / 180;
        out = cutsOf(out, (p) => {
          const pts = p.points;
          const z = pts[0].z;
          const from = z + num(q.height, options.stepDown);
          const run = (from - z) / Math.tan(angle);
          // Along the path for `run`, descending.
          const ramp = [{ ...pts[0], z: from }];
          let left = run; let i = 1;
          while (left > 1e-9 && i < pts.length) {
            const seg = dist(pts[i - 1], pts[i]);
            const f = Math.min(1, left / (seg || 1));
            const q2 = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
            left -= seg * f;
            ramp.push({ ...q2, z: from - ((run - left) / run) * (from - z) });
            if (f >= 1) i++; else break;
          }
          const back = ramp.slice(0, -1).reverse().map((pt) => ({ ...pt, z }));
          return { ...p, points: [...ramp, ...back, ...pts.slice(1)] };
        });
        break;
      }
      case 'tag': {
        // Holding tags: `count` bridges along each closed profile, `width` long and `height` above the bottom.
        const count = Math.max(1, Math.round(num(q.count, 4))); const width = num(q.width, 6); const height = num(q.height, 2);
        out = cutsOf(out, (p) => {
          const pts = p.points;
          if (!isClosed(pts)) return p;
          const lens = [0];
          for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + dist(pts[i - 1], pts[i]));
          const total = lens[lens.length - 1];
          const bottom = Math.min(...pts.map((pt) => pt.z));
          const top = bottom + height;
          const spans = Array.from({ length: count }, (_, k) => { const c = ((k + 0.5) * total) / count; return [c - width / 2, c + width / 2]; });
          const at = (s) => { let i = 1; while (i < lens.length - 1 && lens[i] < s) i++; const f = (s - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * f, s }; };
          const marks = [...pts.map((pt, i) => ({ ...pt, s: lens[i] })), ...spans.flatMap(([a, b]) => [at(a), at(b)])].sort((x, y) => x.s - y.s);
          const raised = marks.map((pt) => (spans.some(([a, b]) => pt.s >= a - 1e-9 && pt.s <= b + 1e-9) ? { ...pt, z: Math.max(pt.z, top) } : pt));
          // Tag ends: straight up and down (the ends land on the span edges at both heights).
          const result = [];
          raised.forEach((pt, k) => {
            const prev = raised[k - 1];
            if (prev && Math.abs(prev.z - pt.z) > 1e-9 && Math.hypot(prev.x - pt.x, prev.y - pt.y) < 1e-9) { result.push({ x: pt.x, y: pt.y, z: pt.z }); return; }
            if (prev && Math.abs(prev.z - pt.z) > 1e-9) result.push({ x: pt.x, y: pt.y, z: prev.z });
            result.push({ x: pt.x, y: pt.y, z: pt.z });
          });
          return { ...p, points: result };
        });
        break;
      }
      case 'zCorrect': {
        // Probed heights (a plane z = a + b·x + c·y, or measured points by inverse distance) added to the path.
        const pts = Array.isArray(q.points) ? q.points.filter((pt) => Number.isFinite(pt?.x) && Number.isFinite(pt?.y) && Number.isFinite(pt?.z)) : [];
        const dz = (x, y) => {
          if (pts.length) {
            let w = 0; let s = 0;
            for (const pt of pts) { const d = Math.hypot(pt.x - x, pt.y - y); if (d < 1e-9) return pt.z; const k = 1 / (d * d); w += k; s += k * pt.z; }
            return s / w;
          }
          return num(q.a) + num(q.b) * x + num(q.c) * y;
        };
        const maxSeg = Math.max(0.1, num(q.segment, 2));
        out = cutsOf(out, (p) => {
          const fine = [p.points[0]];
          for (let i = 1; i < p.points.length; i++) {
            const a = p.points[i - 1]; const b = p.points[i];
            const n2 = Math.max(1, Math.ceil(dist(a, b) / maxSeg));
            for (let k = 1; k <= n2; k++) fine.push({ ...b, x: a.x + ((b.x - a.x) * k) / n2, y: a.y + ((b.y - a.y) * k) / n2, z: a.z + ((b.z - a.z) * k) / n2 });
          }
          return { ...p, points: fine.map((pt) => ({ ...pt, z: pt.z + dz(pt.x, pt.y) })) };
        });
        break;
      }
      default: break;
    }
  }
  return out;
}

// ───────────────────────── posting the whole job

const n = (v) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };

/**
 * One G-code program for the job's active operations in order: fixtures,
 * a tool change when the controller changes, each operation's paths.
 * ctx(op) → the opPaths context for an operation.
 */
export function jobGcode(job, ctx, { title = 'MyCAD', date = new Date() } = {}) {
  const lines = ['%', `(${String(title).replace(/[()]/g, '')} — MyCAD CAM job "${job.name}")`, `(${date.toISOString().slice(0, 16).replace('T', ' ')})`];
  for (const [k, v] of Object.entries(job.propertyBag ?? {})) lines.push(`(${k} = ${String(v).replace(/[()]/g, '')})`);
  lines.push('G21 G90 G94 G17 (mm, absolute, feed per minute, XY plane)', job.fixtures[0] ?? 'G54');
  let current = null;
  const opsById = new Map(job.ops.map((o) => [o.id, o]));
  for (const op of job.ops) {
    if (!op.active) continue;
    // Children of a compound are posted as part of it.
    if (job.ops.some((o) => o.type === 'compound' && (o.children ?? []).includes(op.id))) continue;
    const c = ctx(op);
    const tc = c.controller ?? normalizeController({});
    const o = normalizeCamOptions({ ...op.options });
    const clear = (o.top ?? 0) + o.safeZ;
    const paths = opPaths(op, { ...c, opsById, pathsOf: (other) => opPaths(other, { ...ctx(other), opsById, pathsOf: () => [] }) });
    lines.push(`(Operation: ${String(op.name).replace(/[()]/g, '')} — ${op.type})`);
    if (paths.some((p) => p.kind !== 'code') && current !== tc.id) {
      lines.push(`M5`, `T${tc.number} M6 (${String(c.tool?.name ?? 'tool').replace(/[()]/g, '')} D${n(c.tool?.diameter ?? 0)})`, `S${Math.round(tc.spindle)} M3`, `G0 Z${n(clear)}`);
      current = tc.id;
    }
    let at = null;
    const xy = (p, axisMap) => (axisMap ? `X${n(p.x)} A${n(p.a ?? 0)}` : `X${n(p.x)} Y${n(p.y)}`);
    for (const path of paths) {
      if (path.kind === 'code') { lines.push(...path.lines); continue; }
      if (path.kind === 'probe') { const p = path.points[0]; lines.push(`G0 Z${n(clear)}`, `G0 X${n(p.x)} Y${n(p.y)}`, `G38.2 Z${n(p.z)} F${n(tc.plunge)}`, `G0 Z${n(clear)}`); at = null; continue; }
      if (path.kind === 'drill' || path.kind === 'tap') {
        const p = path.points[0];
        const retract = n((o.top ?? 0) + Math.min(1, o.safeZ));
        lines.push(`G0 Z${n(clear)}`, path.kind === 'tap' ? `G98 G84 X${n(p.x)} Y${n(p.y)} Z${n(p.z)} R${retract} F${n(tc.spindle * path.pitch)}` : `G98 ${o.peck > 0 ? `G83 Q${n(o.peck)}` : 'G81'} X${n(p.x)} Y${n(p.y)} Z${n(p.z)} R${retract} F${n(tc.plunge)}`, 'G80');
        at = null;
        continue;
      }
      const [first, ...rest] = path.points;
      if (!first) continue;
      const same = at && Math.hypot(at.x - first.x, at.y - first.y) < 1e-6;
      if (!same) lines.push(`G0 Z${n(clear)}`, `G0 ${xy(first, path.axisMap)}`, `G1 Z${n(first.z)} F${n(tc.plunge)}`);
      else if (Math.abs(at.z - first.z) > 1e-9) lines.push(`G1 Z${n(first.z)} F${n(tc.plunge)}`);
      let z = first.z;
      rest.forEach((p, i) => { lines.push(`G1 ${xy(p, path.axisMap)}${Math.abs(p.z - z) > 1e-9 ? ` Z${n(p.z)}` : ''}${i === 0 ? ` F${n(tc.feed)}` : ''}`); z = p.z; });
      at = rest.length ? rest[rest.length - 1] : first;
    }
    lines.push(`G0 Z${n(clear)}`);
  }
  lines.push('M5', 'M30', '%', '');
  return lines.join('\n');
}

/**
 * CAM_Sanity: what would go wrong — no operations, operations without a tool
 * controller or geometry, a tool controller without its tool, zero feeds or
 * speeds, tools too big for their outlines. [{ level: 'error' | 'warning', key, op?, … }].
 */
export function sanityCheck(job, ctx) {
  const issues = [];
  if (!job.ops.length) issues.push({ level: 'error', key: 'noOps' });
  for (const tc of job.controllers) {
    if (!job.tools.some((t) => t.id === tc.tool)) issues.push({ level: 'error', key: 'tcNoTool', name: tc.name });
    if (!(tc.spindle > 0)) issues.push({ level: 'warning', key: 'noSpindle', name: tc.name });
  }
  for (const op of job.ops) {
    if (!op.active) continue;
    const needsTool = !['custom', 'comment', 'stop', 'compound', 'array', 'copy'].includes(op.type);
    if (needsTool && !job.controllers.some((tc) => tc.id === op.controller)) issues.push({ level: 'error', key: 'opNoController', name: op.name });
    const c = ctx(op);
    const geometry = (c.source?.loops.length ?? 0) + (c.source?.chains.length ?? 0) + (c.source?.circles.length ?? 0) + (c.wires?.length ?? 0) + (c.model ? 1 : 0);
    if (needsTool && !['millFace', 'probe'].includes(op.type) && !geometry) issues.push({ level: 'warning', key: 'opNoGeometry', name: op.name });
    if (['profile', 'pocket', 'engrave', 'drill'].includes(op.type) && c.tool) {
      const r = camPaths({ ...c.source, model: c.model }, { ...op.options, operation: op.type, tool: c.tool.diameter });
      for (const w of r.warnings) issues.push({ level: 'warning', key: w, name: op.name });
    }
  }
  return issues;
}
