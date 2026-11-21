// Costing and CO₂e of a part by manufacturing process (no DOM):
//   machining      feature based — holes found on the B-rep (coaxial concave cylinders and cones: drill, counterbore,
//                  countersink, ream; taps from the internal thread features), the material each cutting feature
//                  removed (its volume change while the part was built: pockets, slots, grooves), fillets and
//                  chamfers found on the B-rep (corner-rounding, ball-nose and chamfer mills by edge length), roughing of the
//                  rest of the stock, turning for rotational parts (round bar stock, facing both ends, rough turning,
//                  finish turning) and finishing of the surface area; setups by the directions the holes are drilled in;
//   sheet metal    the flat blank's cut length (outer and inner loops of the flat pattern), pierces, laser time by
//                  thickness, the bends on the press brake, the sheet bought (blank rectangle + margin × thickness);
//   casting        pour weight (casting yield), melting energy, solidification time by Chvorinov's rule, mould making,
//                  shake-out and fettling, the pattern amortised over the lot;
//   moulding       shot weight (cavities + runner), fill time, cooling time from the governing wall
//                  measured on the B-rep by inscribed spheres (t = s² / (π² α) · ln(4/π · (Tmelt − Tmould) /
//                  (Teject − Tmould))), press size from the clamp force of the projected area (the part's exact shadow
//                  along the pull, from the kernel), the mould (base + cavities + per-face complexity + side actions) amortised.
// Every result has rows { op, feature, qty, amount, unit, timeMin, cost, energy (kWh) }, so the app shows the breakdown
// and the report exports it; partCO2() turns the same rows into CO₂e. All the rates are editable (p.costing / p.sustain).
import { rep } from './kernel.js';
import { materialOf } from './materials.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const num = (v, d = 0) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));
const isCyl = (t) => t === 'CYLINDRE' || t === 'CYLINDER';

export const PROCESSES = ['machining', 'sheet', 'casting', 'moulding'];
export const MATERIAL_GROUPS = ['steel', 'iron', 'aluminium', 'copper', 'titanium', 'plastic', 'other'];

/** Plastics' moulding data by material id: thermal diffusivity α (mm²/s), melt, mould and ejection temperatures (°C). */
export const MOULD_PLASTICS = {
  abs: { alpha: 0.12, melt: 230, mould: 60, eject: 90 },
  pc: { alpha: 0.13, melt: 300, mould: 90, eject: 127 },
  nylon: { alpha: 0.10, melt: 280, mould: 80, eject: 150 },
  pom: { alpha: 0.09, melt: 210, mould: 90, eject: 140 },
  default: { alpha: 0.10, melt: 230, mould: 50, eject: 90 },
};

/** Starting values of every rate (editable; prices in the user's currency, rates per hour, times in minutes or seconds). */
export const COST_TABLE_DEFAULTS = {
  process: 'auto', currency: '$', lot: 100,
  pricePerKg: { steel: 1.2, iron: 0.9, aluminium: 3.5, copper: 9, titanium: 30, plastic: 2.5, other: 2 },
  machining: {
    rate: 60, setup: 30, setups: 'auto', allowance: 2, finishRate: 50, pocketFactor: 0.5, approach: 2, maxDrill: 32,
    removalRate: { steel: 15, iron: 20, aluminium: 60, copper: 30, titanium: 5, plastic: 80, other: 40 }, // cm³/min (milling)
    turnRate: { steel: 25, iron: 30, aluminium: 90, copper: 45, titanium: 8, plastic: 120, other: 60 }, // cm³/min (turning)
    drillSpeed: { steel: 25, iron: 30, aluminium: 90, copper: 50, titanium: 12, plastic: 60, other: 40 }, // m/min
    feedFactor: 0.015, // drill feed per rev = factor × diameter (mm/rev), kept within 0.02…0.5
    reamBelow: 0, reamSpeed: 0.5, tapSpeed: 0.3, threadPasses: 6, barStep: 5, power: 7.5,
    // Edge tools (fillets: corner-rounding cutters on outside edges, ball-nose on inside; chamfers: chamfer mills).
    millSpeed: { steel: 120, iron: 100, aluminium: 300, copper: 150, titanium: 40, plastic: 250, other: 150 }, // m/min
    edgeTeeth: 4, edgeFeedFactor: 0.01, minTool: 6, maxRpm: 12000, ballStep: 0.5,
  },
  sheet: {
    laserRate: 90, brakeRate: 60, margin: 5, pierceSec: 2, bendSec: 20, bendSetup: 15, laserPower: 12, brakePower: 5,
    // Laser cut speed (mm/min) by thickness (mm), interpolated; × the material's factor.
    cutSpeed: [[1, 8000], [2, 5000], [3, 3500], [5, 2000], [8, 1200], [12, 700], [20, 350]],
    cutFactor: { steel: 1, iron: 1, aluminium: 1.3, copper: 0.6, titanium: 0.5, plastic: 2, other: 1 },
  },
  casting: {
    yield: 0.6, B: 1.2, mouldMin: 10, pourRate: 1, shakeoutSec: 60, fettlingMin: 5, rate: 50, patternCost: 3000, cavities: 1,
    meltEnergy: { steel: 1.4, iron: 0.6, aluminium: 1.1, copper: 0.6, titanium: 2, plastic: 0.3, other: 0.8 }, // kWh/kg
    energyPrice: 0.15, power: 15,
  },
  moulding: {
    cavities: 1, runner: 0.15, wall: '', injectionRate: 30, resetSec: 4, cavityPressure: 40, pressBase: 40, pressPerTonne: 0.12,
    mouldBase: 5000, cavityCost: 8000, perFace: 40, sideActions: 0, sideActionCost: 3000, power: 20,
  },
};

/** Starting values of the CO₂e factors: kg CO₂e per kg of material, grid (kg/kWh), transport. */
export const CO2_TABLE_DEFAULTS = {
  perKg: { steel: 1.9, iron: 1.5, aluminium: 8.2, copper: 3.8, titanium: 35, plastic: 3.2, other: 2 },
  grid: 0.45, distance: 500, perTonneKm: 0.1,
};

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function merge(base, over) {
  if (!isObj(over)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isObj(base?.[k]) && isObj(v) ? merge(base[k], v) : v;
  }
  return out;
}
/** The rates in use: the defaults with the part's own values over them (nested tables merge key by key). */
export const costSettings = (user = {}) => merge(COST_TABLE_DEFAULTS, user ?? {});
export const co2Settings = (user = {}) => merge(CO2_TABLE_DEFAULTS, user ?? {});

/** A value of a table by material group (falls back to 'other'). */
const pick = (table, group) => num(table?.[group] ?? table?.other, 0);

/** Linear interpolation in [[x, y], …] (clamped at the ends). */
export function interpolate(table, x) {
  const t = [...table].map(([a, b]) => [Number(a), Number(b)]).sort((a, b) => a[0] - b[0]);
  if (!t.length) return 0;
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) { const [x0, y0] = t[i - 1]; const [x1, y1] = t[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return t.at(-1)[1];
}

// ───────────────────────── B-rep recognition

function adaptor(face, fn) {
  const R = rep(); const oc = R.getOC();
  let ad = null;
  try { ad = new oc.BRepAdaptor_Surface(face.wrapped, true); return fn(ad); } catch { return null; } finally { ad?.delete?.(); }
}
const axisOf = (ax) => { const l = ax.Location(); const d = ax.Direction(); return { point: [l.X(), l.Y(), l.Z()], dir: unit([d.X(), d.Y(), d.Z()]) }; };

/** Sample points on the face's boundary (5 per edge). */
function boundaryPoints(face) {
  const out = [];
  for (const e of face.edges) for (const t of [0, 0.25, 0.5, 0.75, 1]) { try { out.push(vec(e.pointAt(t))); } catch { /* none */ } }
  return out;
}

/** Axis data of a revolved face (cylinder, cone, torus, sphere): { kind, point, dir, r }; null for others. */
export function revolvedAxis(face) {
  const g = face.geomType;
  if (isCyl(g)) return adaptor(face, (ad) => { const c = ad.Cylinder(); return { kind: 'cyl', ...axisOf(c.Axis()), r: c.Radius() }; });
  // gp_Cone / gp_Torus are not bound in the kernel build: their axis is the one of their circular boundary edges.
  if (g === 'CONE') return adaptor(face, (ad) => { const c = ad.Cone(); return { kind: 'cone', ...axisOf(c.Axis()), semi: c.SemiAngle() }; }) ?? circleAxis(face, 'cone');
  if (g === 'TORUS' || g === 'TORE') return adaptor(face, (ad) => { const c = ad.Torus(); return { kind: 'torus', ...axisOf(c.Axis()) }; }) ?? circleAxis(face, 'torus');
  if (g === 'SPHERE') return adaptor(face, (ad) => { const c = ad.Sphere(); const l = c.Location(); return { kind: 'sphere', point: [l.X(), l.Y(), l.Z()], dir: null }; });
  return null;
}

/** The axis of a revolved face from its circular edges (centre and normal of the largest circle); null if none. */
function circleAxis(face, kind) {
  let best = null;
  for (const e of face.edges) {
    let p;
    try { p = [0, 0.2, 0.4, 0.6, 0.8].map((t) => vec(e.pointAt(t))); } catch { continue; }
    const ab = sub(p[1], p[0]); const ac = sub(p[2], p[0]);
    const n = cross(ab, ac); const d = 2 * dot(n, n);
    if (!(d > 1e-18)) continue;
    const c = add(p[0], mul(add(mul(cross(n, ab), dot(ac, ac)), mul(cross(ac, n), dot(ab, ab))), 1 / d));
    const r = Math.hypot(...sub(p[0], c));
    if (p.some((q) => Math.abs(Math.hypot(...sub(q, c)) - r) > r * 1e-6 + 1e-9)) continue;
    if (!best || r > best.r) best = { point: c, dir: unit(n), r };
  }
  return best ? { kind, point: best.point, dir: best.dir } : null;
}

/** Distance from p to the line { point, dir } and the position along it. */
const onAxis = (p, ax) => { const r = sub(p, ax.point); const t = dot(r, ax.dir); return { t, d: Math.hypot(...sub(r, mul(ax.dir, t))) }; };

/** Is the revolved face concave (its normal points toward the axis — the wall of a hole)? */
function concave(face, ax) {
  try {
    const p = vec(face.pointOnSurface(0.5, 0.5)); const n = unit(vec(face.normalAt(p)));
    const r = sub(p, ax.point); const radial = sub(r, mul(ax.dir, dot(r, ax.dir)));
    return dot(n, radial) < 0;
  } catch { return false; }
}

const sameLine = (a, b, tol) => Math.abs(Math.abs(dot(a.dir, b.dir)) - 1) < 1e-6 && onAxis(b.point, a).d < tol;

/**
 * The holes of the body: coaxial concave cylinders (going all the way round) and cones grouped per axis. Each hole:
 * { point, dir (from the entry into the material), entry ([x,y,z]), depth (to the deepest point, drill point
 * included), diameter (the smallest: the pilot drill), through, segments: [{ kind: 'cyl'|'cone', r0, r1, t0, t1 }]
 * (t from the entry), steps (counterbores: [{ diameter, depth }]), countersink ({ diameter, length } | null),
 * volume (mm³, the material the hole takes out), faces (indices) }.
 */
export function recogniseHoles(body) {
  const faces = body.faces;
  let size = 1; try { const [lo, hi] = body.boundingBox.bounds; size = Math.hypot(...sub(hi, lo)); } catch { /* 1 */ }
  const tol = size * 1e-6 + 1e-7;
  const segs = [];
  faces.forEach((face, index) => {
    const ax = revolvedAxis(face);
    if (!ax || (ax.kind !== 'cyl' && ax.kind !== 'cone')) return;
    if (!concave(face, ax)) return;
    const pts = boundaryPoints(face).map((p) => onAxis(p, ax));
    if (!pts.length) return;
    const t0 = Math.min(...pts.map((x) => x.t)); const t1 = Math.max(...pts.map((x) => x.t));
    if (!(t1 - t0 > tol)) return;
    const rAt = (t) => { const near = pts.filter((x) => Math.abs(x.t - t) < tol * 10); return near.length ? Math.max(...near.map((x) => x.d)) : 0; };
    let span = 2 * Math.PI;
    try { const uv = face.UVBounds; span = Math.abs(uv.uMax - uv.uMin); } catch { /* full */ }
    segs.push({ index, ax, kind: ax.kind, t0, t1, r0: ax.kind === 'cyl' ? ax.r : rAt(t0), r1: ax.kind === 'cyl' ? ax.r : rAt(t1), span });
  });
  // Group the segments on one axis line; the halves of a cylinder (two faces of the same radius and length) join up.
  const groups = [];
  for (const s of segs) {
    let g = groups.find((x) => sameLine(x.ax, s.ax, tol * 10));
    if (!g) { g = { ax: { point: s.ax.point, dir: s.ax.dir }, segs: [] }; groups.push(g); }
    // Positions along the group's own axis.
    const a = onAxis(add(s.ax.point, mul(s.ax.dir, s.t0)), g.ax).t; const b = onAxis(add(s.ax.point, mul(s.ax.dir, s.t1)), g.ax).t;
    const flip = a > b;
    g.segs.push({ ...s, t0: Math.min(a, b), t1: Math.max(a, b), r0: flip ? s.r1 : s.r0, r1: flip ? s.r0 : s.r1 });
  }
  const holes = [];
  for (const g of groups) {
    // Merge the pieces of one segment and keep only those that go all the way round.
    const merged = [];
    for (const s of g.segs) {
      const m = merged.find((x) => x.kind === s.kind && Math.abs(x.t0 - s.t0) < tol * 10 && Math.abs(x.t1 - s.t1) < tol * 10 && Math.abs(x.r0 - s.r0) < tol * 10 && Math.abs(x.r1 - s.r1) < tol * 10);
      if (m) { m.span += s.span; m.faces.push(s.index); } else merged.push({ ...s, faces: [s.index] });
    }
    const full = merged.filter((s) => s.span >= 2 * Math.PI * 0.999).sort((a, b) => a.t0 - b.t0);
    if (!full.some((s) => s.kind === 'cyl')) continue;
    // Contiguous runs along the axis are one hole each (two holes on one axis, with material between, are two).
    let run = [];
    const flush = () => { if (run.length) holes.push(holeOf(body, g.ax, run, size)); run = []; };
    for (const s of full) { if (run.length && s.t0 > run.at(-1).t1 + tol * 10) flush(); run.push(s); }
    flush();
  }
  return holes.filter(Boolean);
}

function holeOf(body, ax, run, size) {
  const t0 = run[0].t0; const t1 = run.at(-1).t1;
  const eps = Math.max(size * 1e-4, 1e-3);
  // A drill point (a cone closing toward the axis) or a flat bottom (a disk face on the axis) closes an end.
  const pointAt = (t) => run.some((s) => s.kind === 'cone' && ((Math.abs(s.t1 - t) < eps && s.r1 < eps) || (Math.abs(s.t0 - t) < eps && s.r0 < eps)));
  const diskAt = (t) => body.faces.some((f) => {
    if (f.geomType !== 'PLANE') return false;
    let n; try { n = unit(vec(f.normalAt(f.center))); } catch { return false; }
    if (Math.abs(Math.abs(dot(n, ax.dir)) - 1) > 1e-6) return false;
    const pts = boundaryPoints(f).map((p) => onAxis(p, ax));
    const rMax = Math.max(...run.map((s) => Math.max(s.r0, s.r1)));
    if (!pts.length || pts.some((x) => Math.abs(x.t - t) > eps || x.d > rMax + eps)) return false;
    // A disk (one loop); an annulus between two steps has a hole in it.
    try { return f.clone().innerWires().length === 0 && onAxis(vec(f.center), ax).d < eps; } catch { return false; }
  });
  const closed0 = pointAt(t0) || diskAt(t0); const closed1 = pointAt(t1) || diskAt(t1);
  if (closed0 && closed1) return null; // a closed cavity, not a hole
  // Entry: the open end (through: the end higher up Z, or the axis' own direction).
  let fromStart;
  if (closed1 !== closed0) fromStart = closed1;
  else { const zA = add(ax.point, mul(ax.dir, t0))[2]; const zB = add(ax.point, mul(ax.dir, t1))[2]; fromStart = Math.abs(zA - zB) > eps ? zA > zB : true; }
  const dir = fromStart ? ax.dir : mul(ax.dir, -1);
  const entryT = fromStart ? t0 : t1;
  const segments = run.map((s) => {
    const a = fromStart ? s.t0 - t0 : t1 - s.t1; const b = fromStart ? s.t1 - t0 : t1 - s.t0;
    return { kind: s.kind, t0: a, t1: b, r0: fromStart ? s.r0 : s.r1, r1: fromStart ? s.r1 : s.r0, faces: s.faces };
  }).sort((a, b) => a.t0 - b.t0);
  const cyls = segments.filter((s) => s.kind === 'cyl');
  const rMin = Math.min(...cyls.map((s) => s.r0));
  const steps = cyls.filter((s) => s.r0 > rMin + eps).map((s) => ({ diameter: 2 * s.r0, depth: s.t1 - s.t0, from: s.t0 }));
  const sink = segments.find((s) => s.kind === 'cone' && s.r0 > s.r1 + eps && s.t0 < eps);
  const volume = segments.reduce((v, s) => v + (s.kind === 'cyl' ? Math.PI * s.r0 * s.r0 * (s.t1 - s.t0) : (Math.PI * (s.t1 - s.t0) * (s.r0 * s.r0 + s.r0 * s.r1 + s.r1 * s.r1)) / 3), 0);
  return {
    point: ax.point, axis: ax.dir, dir, entry: add(ax.point, mul(ax.dir, entryT)), depth: t1 - t0, diameter: 2 * rMin,
    through: !closed0 && !closed1, segments, steps, countersink: sink ? { diameter: 2 * sink.r0, length: sink.t1 - sink.t0 } : null,
    volume, faces: segments.flatMap((s) => s.faces),
  };
}

/**
 * Is the body a turned part: all its faces (but the holes off the axis) planes square to one axis or revolved about
 * it? `tolArea` share of the area may be milled (flats, keyways). Returns { point, dir, rMax, t0, t1, area (turned
 * outside), offArea } or null.
 */
export function turnedAxis(body, { holes = null, tolArea = 0.15 } = {}) {
  const R = rep();
  const faces = body.faces;
  let size = 1; try { const [lo, hi] = body.boundingBox.bounds; size = Math.hypot(...sub(hi, lo)); } catch { /* 1 */ }
  const tol = size * 1e-6 + 1e-7;
  const hs = holes ?? recogniseHoles(body);
  const area = faces.map((f) => { try { return R.measureArea(f); } catch { return 0; } });
  const total = area.reduce((s, a) => s + a, 0);
  const axes = faces.map((f) => revolvedAxis(f));
  // Candidate: the axis of the biggest convex cylinder.
  let best = null;
  faces.forEach((f, i) => { const ax = axes[i]; if (ax?.kind === 'cyl' && !concave(f, ax) && (!best || area[i] > best.a)) best = { ax, a: area[i] }; });
  if (!best) return null;
  const A = best.ax;
  const offHole = new Set(hs.filter((h) => !sameLine({ point: h.point, dir: h.axis }, A, tol * 10)).flatMap((h) => h.faces));
  let off = 0;
  faces.forEach((f, i) => {
    if (offHole.has(i)) return;
    const ax = axes[i];
    let ok = false;
    if (f.geomType === 'PLANE') { try { ok = Math.abs(Math.abs(dot(unit(vec(f.normalAt(f.center))), A.dir)) - 1) < 1e-6; } catch { ok = false; } }
    else if (ax?.kind === 'sphere') ok = onAxis(ax.point, A).d < tol * 10;
    else if (ax) ok = sameLine(ax, A, tol * 10);
    if (!ok) off += area[i];
  });
  if (off > tolArea * total) return null;
  const pts = faces.flatMap((f) => boundaryPoints(f)).map((p) => onAxis(p, A));
  const ts = pts.map((x) => x.t);
  return { point: A.point, dir: A.dir, rMax: Math.max(...pts.map((x) => x.d)), t0: Math.min(...ts), t1: Math.max(...ts), offArea: off, area: total };
}

/**
 * The flat blank of a sheet part (the flat pattern, or a plate): the faces on its top side give the cut length (all
 * their edges: outer outline and inner cut-outs), the pierces (one per loop), the net area and the blank rectangle
 * across `normal` (width the longer side). Returns { cutLength, pierces, loops, area, width, height, thickness }.
 */
export function sheetBlank(flat, { normal = null, thickness = null } = {}) {
  const R = rep();
  const [lo, hi] = flat.boundingBox.bounds;
  let N = normal ? unit(normal) : null;
  if (!N) { const ext = sub(hi, lo); const k = ext.indexOf(Math.min(...ext)); N = [0, 0, 0]; N[k] = 1; }
  const planar = flat.faces.map((f) => { if (f.geomType !== 'PLANE') return null; try { const n = unit(vec(f.normalAt(f.center))); return Math.abs(dot(n, N)) > 1 - 1e-6 ? { f, h: dot(vec(f.center), N), up: dot(n, N) > 0 } : null; } catch { return null; } }).filter(Boolean);
  if (!planar.length) throw Object.assign(new Error('no-blank'), { code: 'no-blank' });
  const top = Math.max(...planar.map((x) => x.h)); const bottom = Math.min(...planar.map((x) => x.h));
  const size = Math.hypot(...sub(hi, lo));
  const tops = planar.filter((x) => Math.abs(x.h - top) < size * 1e-7 + 1e-9);
  let cutLength = 0; let loops = 0; let area = 0;
  const a = Math.abs(N[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(a, N)); const v = cross(N, u);
  const us = []; const vs = [];
  for (const { f } of tops) {
    for (const e of f.edges) { cutLength += e.length; for (const t of [0, 0.25, 0.5, 0.75, 1]) { const p = vec(e.pointAt(t)); us.push(dot(p, u)); vs.push(dot(p, v)); } }
    loops += 1 + f.clone().innerWires().length;
    area += R.measureArea(f);
  }
  const du = Math.max(...us) - Math.min(...us); const dv = Math.max(...vs) - Math.min(...vs);
  return { cutLength, pierces: loops, loops, area, width: Math.max(du, dv), height: Math.min(du, dv), thickness: thickness ?? top - bottom };
}

/** The mesh estimate of the projected area (the up-facing triangles); only used when the kernel projection fails. */
export function projectedAreaMesh(body, dir = [0, 0, 1]) {
  const d = unit(dir);
  let size = 1; try { const [lo, hi] = body.boundingBox.bounds; size = Math.hypot(...sub(hi, lo)); } catch { /* 1 */ }
  const mesh = body.mesh({ tolerance: Math.max(0.01, size * 0.001), angularTolerance: 0.2 });
  const V = mesh.vertices; const T = mesh.triangles;
  let a = 0;
  for (let i = 0; i < T.length; i += 3) {
    const p = [0, 1, 2].map((k) => [V[3 * T[i + k]], V[3 * T[i + k] + 1], V[3 * T[i + k] + 2]]);
    const s = dot(cross(sub(p[1], p[0]), sub(p[2], p[0])), d) / 2;
    if (s > 0) a += s;
  }
  return a;
}

/** A face swept along v (a solid), by the kernel's prism. */
function prismOf(face, v) {
  const R = rep(); const oc = R.getOC();
  const vv = new R.Vector(v);
  const mk = new oc.BRepPrimAPI_MakePrism(face.wrapped, vv.wrapped, false, true);
  try { return R.cast(mk.Shape()); } finally { mk.delete(); vv.delete?.(); }
}

/** Splits a face by planes (the kernel's splitter); its pieces. */
function splitFace(face, planes) {
  if (!planes.length) return [face];
  const R = rep(); const oc = R.getOC();
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(face.wrapped);
  const list = new oc.NCollection_List_TopoDS_Shape(); for (const t of planes) list.Append(t.wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  try {
    sp.SetArguments(args); sp.SetTools(list); sp.Build(new oc.Message_ProgressRange());
    if (sp.HasErrors()) return [face];
    const faces = R.cast(sp.Shape()).faces ?? [];
    return faces.length ? faces : [face];
  } finally { sp.delete(); }
}

/** A square planar face of half-size h through `point` with normal `n`. */
function planeFace(point, n, h) {
  const R = rep();
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(a, n)); const v = cross(n, u);
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => add(point, add(mul(u, x * h), mul(v, y * h))));
  return R.makeFace(R.assembleWire(c.map((p, i) => R.makeLine(p, c[(i + 1) % 4]))));
}

/**
 * The planes where a curved face turns from facing `d` to facing away (its silhouette seen along d): a cylinder or
 * a cone across d on the plane through its axis square to d's part across the axis, a sphere on the plane through
 * its centre square to d, a torus on its equator plane (and, lying across d, on the planes of its highest and lowest
 * circles). A cylinder or cone along d needs none (its normal keeps one side of d).
 */
function silhouettePlanes(face, d, h) {
  const ax = revolvedAxis(face);
  if (!ax) return face.geomType === 'PLANE' ? [] : [planeFace(vec(face.center), d, h)];
  if (ax.kind === 'sphere') return [planeFace(ax.point, d, h)];
  const along = dot(ax.dir, d);
  const parallel = Math.abs(Math.abs(along) - 1) < 1e-9;
  if (ax.kind === 'cyl' || ax.kind === 'cone') return parallel ? [] : [planeFace(ax.point, unit(sub(d, mul(ax.dir, along))), h)];
  const out = [planeFace(ax.point, parallel ? d : unit(sub(d, mul(ax.dir, along))), h)];
  if (!parallel) {
    const pts = boundaryPoints(face).map((p) => dot(sub(p, ax.point), ax.dir));
    for (const s of [Math.min(...pts), Math.max(...pts)]) if (Math.abs(s) > 1e-9) out.push(planeFace(add(ax.point, mul(ax.dir, s)), ax.dir, h));
  }
  return out;
}

/**
 * Projected area of the body along `dir` from the B-rep: the area of its shadow on a plane square to the pull — the
 * union of the projections of its faces, so faces over each other along the pull count once. Curved faces are split
 * at their silhouette, every piece facing the pull is swept past the part, each sweep is cut by a slab beyond the
 * part, the slices are fused: the fused volume / the slab's thickness is the area.
 */
export function projectedArea(body, dir = [0, 0, 1]) {
  const R = rep();
  const d = unit(dir);
  const [lo, hi] = body.boundingBox.bounds;
  const size = Math.max(1e-6, Math.hypot(...sub(hi, lo)));
  const corners = [];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z]);
  const wMin = Math.min(...corners.map((p) => dot(p, d)));
  const mid = mul(add(lo, hi), 0.5);
  const T = size * 0.05;
  const base = add(mid, mul(d, wMin - dot(mid, d) - 2 * T));
  const slab = prismOf(planeFace(base, d, size * 2), mul(d, T));
  let shadow = null;
  for (const face of body.faces) {
    const pieces = face.geomType === 'PLANE' ? [face] : splitFace(face, silhouettePlanes(face, d, size * 2));
    for (const piece of pieces) {
      let n;
      try { const p = piece.geomType === 'PLANE' ? piece.center : piece.pointOnSurface(0.5, 0.5); n = unit(vec(piece.normalAt(p))); } catch { continue; }
      if (!(dot(n, d) > 1e-9)) continue;
      const top = Math.max(...boundaryPoints(piece).map((p) => dot(p, d)));
      const tile = prismOf(piece.clone(), mul(d, -(top - wMin + 3 * T))).intersect(slab.clone());
      if (!(R.measureVolume(tile) > 0)) continue;
      shadow = shadow ? shadow.fuse(tile) : tile;
    }
  }
  return shadow ? R.measureVolume(shadow) / T : 0;
}

// ───────────────────────── wall thickness

/**
 * Wall thickness from the B-rep by inscribed spheres: at sample points spread over the faces by area (the centres
 * of the mesh triangles put back on their face, normals from the face), the largest sphere touching the face there
 * and staying in the material (centre on the inward normal, radius no more than the centre's distance to the
 * boundary) gives the wall: its diameter. Returns { max, min, avg (area weighted), governing (the thickest wall that
 * still covers `share` of the area — the one that sets the cooling time), samples: [{ p, t, a }] }.
 */
export function wallThickness(body, { samples = 160, share = 0.1 } = {}) {
  const R = rep();
  const [lo, hi] = body.boundingBox.bounds;
  const size = Math.max(1e-6, Math.hypot(...sub(hi, lo)));
  const boundary = R.makeCompound(body.faces.map((f) => f.clone()));
  const dist = (p) => { const v = R.makeVertex(p); try { return R.measureDistanceBetween(v, boundary); } finally { v.delete?.(); } };
  const mesh = body.mesh({ tolerance: Math.max(0.01, size * 0.002), angularTolerance: 0.3 });
  const V = mesh.vertices; const Tr = mesh.triangles;
  const faceById = new Map(body.faces.map((f) => [f.hashCode, f]));
  const tris = [];
  let total = 0;
  for (const fg of mesh.faceGroups ?? []) {
    const face = faceById.get(fg.faceId);
    if (!face) continue;
    for (let k = fg.start; k < fg.start + fg.count; k += 3) {
      const p = [0, 1, 2].map((j) => [V[3 * Tr[k + j]], V[3 * Tr[k + j] + 1], V[3 * Tr[k + j] + 2]]);
      const a = Math.hypot(...cross(sub(p[1], p[0]), sub(p[2], p[0]))) / 2;
      if (!(a > 0)) continue;
      tris.push({ face, p, a });
      total += a;
    }
  }
  // Deterministic samples: one every total/samples of area along the triangles; each carries that much area.
  const step = total / Math.max(1, samples);
  const picked = [];
  let next = step / 2; let run = 0;
  for (const tr of tris) {
    run += tr.a;
    let k = 0;
    while (next <= run) { k++; next += step; }
    // k samples spread over the triangle (a fixed low-discrepancy pattern), each carrying one step of area.
    for (let j = 0; j < k; j++) {
      const r1 = Math.sqrt(k === 1 ? 1 / 3 : (j + 0.5) / k); const r2 = k === 1 ? 0.5 : (j * 0.6180339887498949) % 1;
      const [A, B, C] = tr.p;
      picked.push({ face: tr.face, c: add(add(mul(A, 1 - r1), mul(B, r1 * (1 - r2))), mul(C, r1 * r2)), w: step });
    }
  }
  const tol = size * 1e-10;
  const out = [];
  for (const s of picked) {
    let p = s.c;
    if (s.face.geomType !== 'PLANE') { try { const uv = s.face.uvCoordinates(p); p = vec(s.face.pointOnSurface(uv[0] ?? uv.x, uv[1] ?? uv.y)); } catch { /* the centre */ } }
    let n;
    try { n = unit(vec(s.face.normalAt(p))); } catch { continue; }
    if (!n.some(Boolean)) continue;
    const fits = (r) => dist(sub(p, mul(n, r))) >= r - tol;
    let a = 0; let b = size / 2;
    if (fits(b)) a = b;
    else for (let i = 0; i < 60 && b - a > tol; i++) { const m = (a + b) / 2; if (fits(m)) a = m; else b = m; }
    out.push({ p, t: 2 * a, a: s.w });
  }
  if (!out.length) return { max: 0, min: 0, avg: 0, governing: 0, samples: [] };
  const W = out.reduce((x, s) => x + s.a, 0);
  const sorted = [...out].sort((x, y) => y.t - x.t);
  let cum = 0; let governing = sorted.at(-1).t;
  for (const s of sorted) { cum += s.a; if (cum >= share * W - 1e-12) { governing = s.t; break; } }
  return { max: sorted[0].t, min: sorted.at(-1).t, avg: out.reduce((x, s) => x + s.t * s.a, 0) / W, governing, samples: out };
}

// ───────────────────────── fillets and chamfers

/** Edge hash → the indices of the faces that share it. */
function edgeFaces(body) {
  const map = new Map();
  body.faces.forEach((f, i) => { for (const e of f.edges) { const k = e.hashCode; if (!map.has(k)) map.set(k, new Set()); map.get(k).add(i); } });
  return map;
}

const normalAtPoint = (face, p) => { try { return unit(vec(face.normalAt(p))); } catch { return null; } };

/** A circle through three points of an edge (null for a straight one): { centre, normal, radius }. */
function edgeCircle(e) {
  let p;
  try { p = [0, 0.3, 0.6, 0.9].map((t) => vec(e.pointAt(t))); } catch { return null; }
  const ab = sub(p[1], p[0]); const ac = sub(p[2], p[0]);
  const n = cross(ab, ac); const d = 2 * dot(n, n);
  if (!(d > 1e-18)) return null;
  const c = add(p[0], mul(add(mul(cross(n, ab), dot(ac, ac)), mul(cross(ac, n), dot(ab, ab))), 1 / d));
  const r = Math.hypot(...sub(p[0], c));
  if (Math.abs(Math.hypot(...sub(p[3], c)) - r) > r * 1e-6 + 1e-9) return null;
  return { centre: c, normal: unit(n), radius: r };
}

/** Where the lines (a + s·da) and (b + t·db) of one plane meet. */
function meet(a, da, b, db) {
  const n = cross(da, db); const nn = dot(n, n);
  if (!(nn > 1e-18)) return null;
  return add(a, mul(da, dot(cross(sub(b, a), db), n) / nn));
}

const triArea = (a, b, c) => Math.hypot(...cross(sub(b, a), sub(c, a))) / 2;

/**
 * The fillets and chamfers of the body (not those of holes: they are drilled and countersunk). Each is measured in
 * its cross-section — the band's two edges T1, T2 where it meets its neighbours, the sharp corner K where the
 * neighbours would meet:
 *   fillet   a cylinder or torus band tangent (< 1°) to the faces along its two edges, less than half round:
 *            { kind: 'fillet', radius, angle (θ, rad), convex, length (of the corner edge), area (of the section:
 *            r²·(tan(θ/2) − θ/2)), volume (the material rounded off or filled in) };
 *   chamfer  a planar or conical band at 5°…85° to both neighbours, narrow (width ≤ length / 4), cutting a corner
 *            off: { kind: 'chamfer', width, legs [|K T1|, |K T2|], length, area (the cut-off triangle), volume }.
 * Straight bands: volume = area × length; bands round an axis (torus, cone): Pappus (area × path of its centroid).
 */
export function edgeFeatures(body, { holes = null } = {}) {
  const faces = body.faces;
  const inHole = new Set((holes ?? recogniseHoles(body)).flatMap((h) => h.faces));
  const map = edgeFaces(body);
  const out = [];
  faces.forEach((face, i) => {
    if (inHole.has(i)) return;
    const g = face.geomType;
    const ax = revolvedAxis(face);
    const kind = isCyl(g) || ax?.kind === 'torus' ? 'fillet' : g === 'PLANE' || g === 'CONE' ? 'chamfer' : null;
    if (!kind) return;
    const revolved = ax && (ax.kind === 'torus' || ax.kind === 'cone');
    // The band's two long edges: lines along a cylinder / plane band, circles round the axis of a torus / cone.
    const edges = face.edges.map((e) => ({ e, len: e.length, circle: edgeCircle(e), faces: map.get(e.hashCode) ?? new Set() }))
      .filter((x) => x.faces.size === 2);
    let long;
    if (revolved) long = edges.filter((x) => x.circle && Math.abs(Math.abs(dot(x.circle.normal, ax.dir)) - 1) < 1e-6 && onAxis(x.circle.centre, ax).d < 1e-6 * Math.max(1, x.circle.radius));
    else if (isCyl(g)) long = edges.filter((x) => !x.circle && Math.abs(Math.abs(dot(unit(sub(vec(x.e.endPoint), vec(x.e.startPoint))), ax.dir)) - 1) < 1e-6);
    else long = [...edges].filter((x) => !x.circle).sort((a, b) => b.len - a.len).slice(0, 2);
    if (long.length !== 2) return;
    const nb = long.map((x) => faces[[...x.faces].find((j) => j !== i)]);
    if (nb.some((f) => !f)) return;
    // The cross-section: a station on the band, its plane square to the band's run (s).
    let T1; let T2; let s; let mid;
    if (revolved) {
      mid = vec(face.pointOnSurface(0.5, 0.5));
      const r0 = sub(mid, ax.point); const e = unit(sub(r0, mul(ax.dir, dot(r0, ax.dir))));
      [T1, T2] = long.map((x) => add(x.circle.centre, mul(e, x.circle.radius)));
      s = unit(cross(ax.dir, e));
    } else {
      const a = vec(long[0].e.startPoint); const b = vec(long[0].e.endPoint);
      s = unit(sub(b, a));
      T1 = mul(add(a, b), 0.5);
      const c = vec(long[1].e.startPoint);
      T2 = add(c, mul(s, dot(sub(T1, c), s)));
    }
    const nA = normalAtPoint(nb[0], T1); const nB = normalAtPoint(nb[1], T2);
    const n1 = normalAtPoint(face, T1); const n2 = normalAtPoint(face, T2);
    if (!nA || !nB || !n1 || !n2) return;
    const angA = (Math.acos(Math.max(-1, Math.min(1, dot(n1, nA)))) * 180) / Math.PI;
    const angB = (Math.acos(Math.max(-1, Math.min(1, dot(n2, nB)))) * 180) / Math.PI;
    const K = meet(T1, unit(cross(s, nA)), T2, unit(cross(s, nB)));
    if (!K) return;
    const convex = dot(sub(nA, nB), sub(T1, T2)) > 0;
    const pathAt = (p) => (revolved ? onAxis(p, ax).d * (long[0].len / long[0].circle.radius) : (long[0].len + long[1].len) / 2);
    if (kind === 'fillet') {
      if (angA > 1 || angB > 1) return;
      // Tube centre: the cylinder's axis, or the circle through T1, the band's middle and T2 for a torus.
      let q;
      if (!revolved) q = add(ax.point, mul(ax.dir, dot(sub(T1, ax.point), ax.dir)));
      else {
        const m = vec(face.pointOnSurface(0.5, 0.5));
        const ab = sub(m, T1); const ac = sub(T2, T1); const n = cross(ab, ac); const dd = 2 * dot(n, n);
        if (!(dd > 1e-18)) return;
        q = add(T1, mul(add(mul(cross(n, ab), dot(ac, ac)), mul(cross(ac, n), dot(ab, ab))), 1 / dd));
      }
      const r = Math.hypot(...sub(T1, q));
      const theta = Math.acos(Math.max(-1, Math.min(1, dot(unit(sub(T1, q)), unit(sub(T2, q))))));
      if (!(theta > 1e-6) || !(theta < Math.PI - 1e-6)) return;
      const kite = triArea(q, T1, K) + triArea(q, K, T2);
      const sector = 0.5 * r * r * theta;
      const area = kite - sector;
      const bis = unit(sub(mul(add(T1, T2), 0.5), q));
      const cSector = add(q, mul(bis, (4 * r * Math.sin(theta / 2)) / (3 * theta)));
      const cKite = mul(add(mul(add(add(q, T1), K), triArea(q, T1, K) / 3), mul(add(add(q, K), T2), triArea(q, K, T2) / 3)), 1 / kite);
      const centroid = mul(sub(mul(cKite, kite), mul(cSector, sector)), 1 / area);
      const length = pathAt(K);
      out.push({ kind, face: i, radius: r, angle: theta, convex, length, area, volume: area * pathAt(centroid) });
      return;
    }
    if (angA < 5 || angA > 85 || angB < 5 || angB > 85 || !convex) return;
    const width = Math.hypot(...sub(T1, T2));
    const length = pathAt(K);
    if (!(width > 0) || width > 0.25 * length) return;
    const area = triArea(T1, T2, K);
    const centroid = mul(add(add(T1, T2), K), 1 / 3);
    out.push({ kind, face: i, width, legs: [Math.hypot(...sub(K, T1)), Math.hypot(...sub(K, T2))], length, area, convex, volume: area * pathAt(centroid) });
  });
  return out;
}

// ───────────────────────── machining

/** Drill feed: spindle speed (rev/min) from the cutting speed, feed per rev from the diameter, the feed (mm/min). */
export function drillFeed(diameter, vc, feedFactor) {
  const rpm = (1000 * vc) / (Math.PI * diameter);
  const fr = Math.min(0.5, Math.max(0.02, feedFactor * diameter));
  return { rpm, fr, feed: rpm * fr };
}

const row = (op, feature, qty, amount, unit, timeMin, rate, extra = {}) => ({ op, feature, qty, amount, unit, timeMin, cost: (timeMin / 60) * rate, ...extra });

/** Volume after each feature (from the regenerate results); null where unknown. */
function featureVolumes(features, results) {
  const R = rep();
  const out = [];
  for (const f of features ?? []) {
    const r = results?.get?.(f.id);
    let v = null;
    if (r?.body) { try { v = R.measureVolume(r.body); } catch { v = null; } }
    out.push({ f, r, v });
  }
  return out;
}

/** Is p inside the solid (a small cube around it mostly in it)? */
function inside(shape, p, h) {
  const R = rep();
  try { return R.measureVolume(shape.clone().intersect(R.makeBox(sub(p, [h, h, h]), add(p, [h, h, h])))) > 4 * h ** 3; } catch { return false; }
}

const CUT_NAMES = { hole: 'hole', revolve: 'groove', sweep: 'slot', thread: 'thread' };
/** Features whose material comes off with the edge tools (their faces are found on the B-rep), not as pockets. */
const EDGE_FEATURES = new Set(['fillet', 'chamfer']);

/** Edge tool feed: rpm = 1000·Vc / (π·D) (at most maxRpm), feed per tooth = factor × D (0.01…0.15), feed = rpm × teeth × fz. */
export function edgeToolFeed(D, vc, { teeth = 4, factor = 0.01, maxRpm = 12000 } = {}) {
  const rpm = Math.min(maxRpm, (1000 * vc) / (Math.PI * D));
  const fz = Math.min(0.15, Math.max(0.01, factor * D));
  return { D, rpm, fz, feed: rpm * teeth * fz };
}

function machiningCost(input, s, group, m) {
  const R = rep();
  const body = input.body;
  const M = s.machining;
  const rate = num(M.rate, 60);
  const volume = R.measureVolume(body); const area = R.measureArea(body);
  const rows = [];
  const holes = recogniseHoles(body);
  const turned = input.forceMilling ? null : turnedAxis(body, { holes });
  const al = Math.max(0, num(M.allowance, 2));
  // Stock: round bar for a turned part, else a block (bounding box + allowance on every side).
  let stockVolume; let stock;
  if (turned) {
    const step = Math.max(0.001, num(M.barStep, 5));
    const D = Math.ceil((2 * turned.rMax + 2 * al) / step - 1e-9) * step;
    const L = turned.t1 - turned.t0 + 2 * al;
    stockVolume = Math.PI * (D / 2) ** 2 * L;
    stock = { kind: 'bar', diameter: D, length: L };
  } else {
    const [lo, hi] = body.boundingBox.bounds;
    const size = hi.map((x, i) => x - lo[i] + 2 * al);
    stockVolume = size[0] * size[1] * size[2];
    stock = { kind: 'block', size };
  }
  const vc = pick(M.drillSpeed, group); const ff = num(M.feedFactor, 0.015); const approach = Math.max(0, num(M.approach, 2));
  const maxDrill = num(M.maxDrill, 32);
  const mill = pick(M.removalRate, group); const pocketRate = mill * num(M.pocketFactor, 0.5);
  const turnRate = pick(M.turnRate, group);
  const minutes = (cm3, r) => (r > 0 ? cm3 / r : 0);
  // Internal threads (taps) by the hole they are in.
  const threads = [];
  for (const f of input.features ?? []) { const th = input.results?.get?.(f.id)?.thread; if (th) threads.push({ f, ...th }); }
  let holeVolume = 0;
  const dirs = [];
  holes.forEach((h, i) => {
    const name = `${input.labels?.hole ?? 'Hole'} ${i + 1} Ø${round(h.diameter, 2)}`;
    holeVolume += h.volume;
    if (!dirs.some((d) => Math.abs(Math.abs(dot(d, h.dir)) - 1) < 1e-6)) dirs.push(h.dir);
    if (h.diameter > maxDrill) {
      rows.push(row('interpolate', name, 1, h.volume / 1000, 'cm³', minutes(h.volume / 1000, pocketRate), rate, { volume: h.volume }));
      return;
    }
    const d = drillFeed(h.diameter, vc, ff);
    rows.push(row('drill', name, 1, h.depth, 'mm', (h.depth + approach) / d.feed, rate, { diameter: h.diameter, depth: h.depth, rpm: d.rpm, feed: d.feed, volume: h.volume, through: h.through }));
    for (const st of h.steps) {
      const c = drillFeed(st.diameter, vc, ff);
      rows.push(row('counterbore', `${name} · Ø${round(st.diameter, 2)}`, 1, st.depth, 'mm', (st.depth + approach) / c.feed, rate, { diameter: st.diameter, depth: st.depth, rpm: c.rpm, feed: c.feed }));
    }
    if (h.countersink) {
      const c = drillFeed(h.countersink.diameter, vc, ff);
      rows.push(row('countersink', `${name} · Ø${round(h.countersink.diameter, 2)}`, 1, h.countersink.length, 'mm', (h.countersink.length + approach) / c.feed, rate, { diameter: h.countersink.diameter, depth: h.countersink.length, rpm: c.rpm, feed: c.feed }));
    }
    const tap = threads.find((th) => th.internal && onAxis(th.centre, { point: h.point, dir: h.axis }).d < Math.max(1e-3, h.diameter * 1e-3));
    if (tap) {
      tap.used = true;
      const rpm = (1000 * vc * num(M.tapSpeed, 0.3)) / (Math.PI * 2 * tap.radius);
      rows.push(row('tap', `${name} · M${round(2 * tap.radius, 1)}×${round(tap.pitch, 2)}`, 1, tap.length, 'mm', (2 * (tap.length + approach)) / (tap.pitch * rpm), rate, { pitch: tap.pitch, rpm }));
    } else if (num(M.reamBelow, 0) > 0 && h.diameter <= num(M.reamBelow, 0)) {
      const rpm = (1000 * vc * num(M.reamSpeed, 0.5)) / (Math.PI * h.diameter);
      const feed = rpm * 2 * Math.min(0.5, Math.max(0.02, ff * h.diameter));
      rows.push(row('ream', name, 1, h.depth, 'mm', (h.depth + approach) / feed, rate, { rpm, feed }));
    }
  });
  for (const th of threads) {
    if (th.used) continue;
    const rpm = (1000 * vc * num(M.tapSpeed, 0.3)) / (Math.PI * 2 * th.radius);
    const passes = th.internal ? 1 : Math.max(1, Math.round(num(M.threadPasses, 6)));
    const time = th.internal ? (2 * (th.length + approach)) / (th.pitch * rpm) : (passes * (th.length + approach)) / (th.pitch * rpm);
    rows.push(row(th.internal ? 'tap' : 'threadTurn', `${th.f.name || 'Thread'} · M${round(2 * th.radius, 1)}×${round(th.pitch, 2)}`, passes, th.length, 'mm', time, rate, { pitch: th.pitch, rpm }));
  }
  // Pockets: what each cutting feature took away, less the holes inside its tool (those are drilled).
  let pocketVolume = 0;
  const seq = featureVolumes(input.features, input.results);
  let prev = null;
  for (const { f, r, v } of seq) {
    if (v == null || r?.suppressed || r?.rolledBack || r?.ok === false) { if (v != null) prev = v; continue; }
    const removed = prev != null ? prev - v : 0;
    prev = v;
    if (!(removed > volume * 1e-9 + 1e-9) || f.type === 'hole' || f.type === 'thread' || EDGE_FEATURES.has(f.type)) continue;
    let own = removed;
    if (r?.tool) {
      const tool = r.tool;
      for (const h of holes) {
        const mid = add(h.entry, mul(h.dir, h.depth / 2));
        if (inside(tool, mid, Math.max(1e-3, h.diameter * 0.1))) own -= h.volume;
      }
    }
    if (!(own > volume * 1e-9 + 1e-9)) continue;
    pocketVolume += own;
    const op = CUT_NAMES[f.type] ?? 'pocket';
    rows.push(row(op, f.name || f.type, 1, own / 1000, 'cm³', minutes(own / 1000, pocketRate), rate, { volume: own }));
  }
  // Fillets and chamfers on the B-rep (a turned part's are part of its turned profile): their own tools, by length.
  let edgeVolume = 0;
  const edges = turned ? [] : edgeFeatures(body, { holes });
  const ev = pick(M.millSpeed, group);
  const toolOpts = { teeth: Math.max(1, Math.round(num(M.edgeTeeth, 4))), factor: num(M.edgeFeedFactor, 0.01), maxRpm: num(M.maxRpm, 12000) };
  const minTool = Math.max(0.1, num(M.minTool, 6));
  edges.forEach((x, k) => {
    const label = x.kind === 'fillet' ? `${input.labels?.fillet ?? 'Fillet'} R${round(x.radius, 3)} · ${round(x.length, 2)} mm` : `${input.labels?.chamfer ?? 'Chamfer'} ${round(x.legs[0], 3)} × ${round(x.legs[1], 3)} · ${round(x.length, 2)} mm`;
    if (x.kind === 'fillet' && x.convex) {
      const t = edgeToolFeed(Math.max(minTool, 4 * x.radius), ev, toolOpts);
      edgeVolume += x.volume;
      rows.push(row('cornerRound', label, 1, x.length, 'mm', (x.length + 2 * approach) / t.feed, rate, { ...x, tool: t.D, rpm: t.rpm, feed: t.feed, index: k }));
    } else if (x.kind === 'fillet') {
      // An inside round: a ball-nose of the fillet's radius, stepping across the arc.
      const t = edgeToolFeed(2 * x.radius, ev, toolOpts);
      const passes = Math.max(1, Math.ceil((x.radius * x.angle) / Math.max(1e-3, num(M.ballStep, 0.5)) - 1e-9));
      rows.push(row('ballNose', label, passes, x.length, 'mm', (passes * (x.length + 2 * approach)) / t.feed, rate, { ...x, tool: t.D, rpm: t.rpm, feed: t.feed, passes, index: k }));
    } else {
      const t = edgeToolFeed(Math.max(minTool, 2 * Math.max(...x.legs) + 2), ev, toolOpts);
      edgeVolume += x.volume;
      rows.push(row('chamferMill', label, 1, x.length, 'mm', (x.length + 2 * approach) / t.feed, rate, { ...x, tool: t.D, rpm: t.rpm, feed: t.feed, index: k }));
    }
  });
  if (turned) {
    const D = stock.diameter;
    const faceV = Math.PI * (D / 2) ** 2 * al;
    for (const k of [1, 2]) if (al > 0) rows.push(row('facing', `${input.labels?.end ?? 'End'} ${k}`, 1, faceV / 1000, 'cm³', minutes(faceV / 1000, turnRate), rate, { volume: faceV }));
    const turnV = Math.max(0, stockVolume - volume - 2 * faceV - holeVolume - pocketVolume);
    rows.push(row('turn', `Ø${round(D, 2)} → Ø${round(2 * turned.rMax, 2)}`, 1, turnV / 1000, 'cm³', minutes(turnV / 1000, turnRate), rate, { volume: turnV }));
  } else {
    const roughV = Math.max(0, stockVolume - volume - holeVolume - pocketVolume - edgeVolume);
    rows.push(row('rough', input.labels?.stock ?? 'Stock', 1, roughV / 1000, 'cm³', minutes(roughV / 1000, mill), rate, { volume: roughV }));
  }
  const finishRate = num(M.finishRate, 50);
  rows.push(row(turned ? 'finishTurn' : 'finish', input.labels?.surface ?? 'Surface', 1, area / 100, 'cm²', finishRate > 0 ? area / 100 / finishRate : 0, rate));
  // Setups: one per direction the holes go in (a turned part: both ends), or the number given.
  const autoSetups = turned ? 2 : Math.max(1, dirs.length);
  const setups = M.setups === 'auto' || M.setups === '' || M.setups == null ? autoSetups : Math.max(0, Math.round(num(M.setups, autoSetups)));
  const lot = Math.max(1, num(s.lot, 1));
  const setupMin = (setups * num(M.setup, 30)) / lot;
  rows.push(row('setup', `${setups} × ${round(num(M.setup, 30), 1)} min / ${lot}`, setups, setups, '', setupMin, rate));
  const power = num(M.power, 7.5);
  for (const r of rows) r.energy = (r.timeMin / 60) * power;
  const boughtMass = stockVolume * 1e-9 * m.density;
  return { stock, stockVolume, boughtMass, rows, holes, edges, turned: Boolean(turned), setups, removed: stockVolume - volume };
}

// ───────────────────────── sheet metal

function sheetCost(input, s, group, m) {
  const S = s.sheet;
  const flat = input.flat ?? input.body;
  const t = input.sheet?.thickness ?? null;
  const blank = sheetBlank(flat, { normal: input.sheet?.normal ?? null, thickness: t });
  const th = blank.thickness;
  const speed = interpolate(S.cutSpeed, th) * pick(S.cutFactor, group);
  const rows = [];
  const cutMin = speed > 0 ? blank.cutLength / speed : 0;
  rows.push(row('laserCut', `${round(th, 2)} mm`, 1, blank.cutLength, 'mm', cutMin, num(S.laserRate, 90), { speed }));
  const pierceMin = (blank.pierces * num(S.pierceSec, 2)) / 60;
  rows.push(row('pierce', '', blank.pierces, blank.pierces, '', pierceMin, num(S.laserRate, 90)));
  // Bends: the sheet's own list, else the bend faces (two cylinders per bend) of the folded body.
  let bends = input.sheet?.bends?.length ?? 0;
  if (!bends && input.body) {
    const N = input.sheet?.normal ? unit(input.sheet.normal) : null;
    const cyl = input.body.faces.map((f) => revolvedAxis(f)).filter((a) => a?.kind === 'cyl' && (!N || Math.abs(dot(a.dir, N)) < 1e-6));
    bends = Math.floor(cyl.length / 2);
  }
  const lot = Math.max(1, num(s.lot, 1));
  if (bends) {
    rows.push(row('bend', '', bends, bends, '', (bends * num(S.bendSec, 20)) / 60, num(S.brakeRate, 60)));
    rows.push(row('setup', `${round(num(S.bendSetup, 15), 1)} min / ${lot}`, 1, 1, '', num(S.bendSetup, 15) / lot, num(S.brakeRate, 60)));
  }
  for (const r of rows) r.energy = (r.timeMin / 60) * (r.op === 'bend' || r.op === 'setup' ? num(S.brakePower, 5) : num(S.laserPower, 12));
  const mg = Math.max(0, num(S.margin, 5));
  const sheetArea = (blank.width + 2 * mg) * (blank.height + 2 * mg);
  const boughtMass = sheetArea * th * 1e-9 * m.density;
  return { blank, bends, sheetArea, utilisation: sheetArea > 0 ? blank.area / sheetArea : 0, boughtMass, rows };
}

// ───────────────────────── casting

/** Chvorinov's rule: solidification time (s) = B · (V / A)², V mm³, A mm², B s/mm². */
export const chvorinov = (V, A, B) => B * (V / A) ** 2;

function castingCost(input, s, group, m, volume, area) {
  const C = s.casting;
  const partMass = volume * 1e-9 * m.density;
  const y = Math.min(1, Math.max(0.05, num(C.yield, 0.6)));
  const cav = Math.max(1, Math.round(num(C.cavities, 1)));
  const poured = partMass / y;
  const solidSec = chvorinov(volume, area, num(C.B, 1.2));
  const pourSec = num(C.pourRate, 1) > 0 ? (poured * cav) / num(C.pourRate, 1) : 0;
  const rate = num(C.rate, 50);
  const rows = [];
  rows.push(row('mouldMaking', `/ ${cav}`, 1, num(C.mouldMin, 10), 'min', num(C.mouldMin, 10) / cav, rate));
  rows.push(row('pour', `${round(poured, 3)} kg`, 1, poured, 'kg', pourSec / 60 / cav, rate));
  rows.push(row('solidify', `M = V/A ${round(volume / area, 3)} mm`, 1, solidSec, 's', solidSec / 60 / cav, rate, { modulus: volume / area }));
  rows.push(row('shakeout', '', 1, num(C.shakeoutSec, 60), 's', num(C.shakeoutSec, 60) / 60 / cav, rate));
  rows.push(row('fettling', '', 1, num(C.fettlingMin, 5), 'min', num(C.fettlingMin, 5), rate));
  const meltKWh = poured * pick(C.meltEnergy, group);
  rows.push(row('melt', `${round(pick(C.meltEnergy, group), 3)} kWh/kg`, 1, meltKWh, 'kWh', 0, 0, { cost: meltKWh * num(C.energyPrice, 0.15) }));
  const lot = Math.max(1, num(s.lot, 1));
  rows.push(row('tooling', `${round(num(C.patternCost, 3000), 0)} / ${lot}`, 1, lot, '', 0, 0, { cost: num(C.patternCost, 3000) / lot }));
  for (const r of rows) r.energy = r.op === 'melt' ? meltKWh : (r.timeMin / 60) * num(C.power, 15);
  return { poured, solidSec, cycleSec: pourSec / cav + solidSec + num(C.shakeoutSec, 60), boughtMass: poured, rows, cavities: cav };
}

// ───────────────────────── injection moulding

/** Cooling time (s) of a wall s (mm): s² / (π² α) · ln(4/π · (Tm − Tw) / (Te − Tw)), α mm²/s. */
export function coolingTime(s, { alpha, melt, mould, eject }) {
  return ((s * s) / (Math.PI * Math.PI * alpha)) * Math.log((4 / Math.PI) * ((melt - mould) / (eject - mould)));
}

function mouldingCost(input, s, group, m, volume, area) {
  const P = s.moulding;
  const plastic = { ...MOULD_PLASTICS.default, ...(MOULD_PLASTICS[m.id] ?? {}), ...(input.plastic ?? {}) };
  for (const k of ['alpha', 'melt', 'mould', 'eject']) if (P[k] !== undefined && P[k] !== '') plastic[k] = num(P[k], plastic[k]);
  const cav = Math.max(1, Math.round(num(P.cavities, 1)));
  const runner = Math.max(0, num(P.runner, 0.15));
  // The wall that sets the cooling: the one given, else the governing wall measured on the B-rep.
  const walls = P.wall !== '' && P.wall != null ? null : input.walls ?? wallThickness(input.body);
  const wall = walls ? walls.governing : num(P.wall, 2);
  const shotVolume = volume * cav * (1 + runner);
  const partMass = volume * 1e-9 * m.density;
  const shotMass = shotVolume * 1e-9 * m.density;
  const fillSec = num(P.injectionRate, 30) > 0 ? shotVolume / 1000 / num(P.injectionRate, 30) : 0;
  const coolSec = Math.max(0, coolingTime(wall, plastic));
  const resetSec = num(P.resetSec, 4);
  const cycleSec = fillSec + coolSec + resetSec;
  let proj = input.projectedArea;
  let projectedExact = true;
  if (proj == null) { try { proj = projectedArea(input.body, input.pull ?? [0, 0, 1]); } catch { proj = projectedAreaMesh(input.body, input.pull ?? [0, 0, 1]); projectedExact = false; } }
  const tonnes = (proj * cav * (1 + runner) * num(P.cavityPressure, 40)) / 9806.65;
  const pressRate = num(P.pressBase, 40) + num(P.pressPerTonne, 0.12) * tonnes;
  const rows = [];
  rows.push(row('fill', `${round(shotVolume / 1000, 3)} cm³`, 1, fillSec, 's', fillSec / 60 / cav, pressRate));
  rows.push(row('cool', `s = ${round(wall, 3)} mm`, 1, coolSec, 's', coolSec / 60 / cav, pressRate, { wall }));
  rows.push(row('eject', '', 1, resetSec, 's', resetSec / 60 / cav, pressRate));
  const faces = input.body.faces.length;
  const mouldCost = num(P.mouldBase, 5000) + cav * (num(P.cavityCost, 8000) + faces * num(P.perFace, 40)) + num(P.sideActions, 0) * num(P.sideActionCost, 3000);
  const lot = Math.max(1, num(s.lot, 1));
  rows.push(row('tooling', `${round(mouldCost, 0)} / ${lot}`, 1, lot, '', 0, 0, { cost: mouldCost / lot }));
  for (const r of rows) r.energy = (r.timeMin / 60) * num(P.power, 20);
  return { wall, walls: walls ? { max: walls.max, min: walls.min, avg: walls.avg, governing: walls.governing } : null, projectedExact, plastic, shotVolume, shotMass, fillSec, coolSec, cycleSec, projected: proj, tonnes, pressRate, mouldCost, boughtMass: partMass * (1 + runner), rows, cavities: cav };
}

// ───────────────────────── the cost of a part

/** The process a part is costed for when it is not chosen: sheet metal parts are cut and bent, plastics moulded. */
export function autoProcess({ sheet, material }) {
  if (sheet) return 'sheet';
  return materialOf(material).group === 'plastic' ? 'moulding' : 'machining';
}

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * The cost of the part: input { body, material, features?, results? (regenerate), sheet?, flat? (the flat pattern),
 * projectedArea?, labels? }, settings as COST_TABLE_DEFAULTS (merged). Returns { process, currency, group, price,
 * partMass, boughtMass, materialCost, processCost, toolingCost, timeMin, total, rows (breakdown), ... }.
 */
export function partCost(input, user = {}) {
  const R = rep();
  const s = costSettings(user);
  const m = materialOf(input.material);
  const group = m.group ?? 'other';
  const process = PROCESSES.includes(s.process) ? s.process : autoProcess(input);
  const volume = R.measureVolume(input.body); const area = R.measureArea(input.body);
  const partMass = volume * 1e-9 * m.density;
  const price = s.price != null && s.price !== '' ? num(s.price) : pick(s.pricePerKg, group);
  let detail;
  if (process === 'sheet') detail = sheetCost(input, s, group, m);
  else if (process === 'casting') detail = castingCost(input, s, group, m, volume, area);
  else if (process === 'moulding') detail = mouldingCost(input, s, group, m, volume, area);
  else detail = machiningCost(input, s, group, m);
  const materialCost = detail.boughtMass * price;
  const rows = [{ op: 'material', feature: `${round(detail.boughtMass, 4)} kg × ${price}`, qty: 1, amount: detail.boughtMass, unit: 'kg', timeMin: 0, cost: materialCost, energy: 0 }, ...detail.rows];
  const toolingCost = rows.filter((r) => r.op === 'tooling').reduce((a, r) => a + r.cost, 0);
  const processCost = rows.filter((r) => r.op !== 'material' && r.op !== 'tooling').reduce((a, r) => a + r.cost, 0);
  const timeMin = rows.reduce((a, r) => a + r.timeMin, 0);
  return {
    ...detail, process, group, currency: s.currency, lot: Math.max(1, num(s.lot, 1)), price, volume, area, partMass, rows,
    materialCost, processCost, toolingCost, machiningCost: processCost, timeMin, energy: rows.reduce((a, r) => a + (r.energy ?? 0), 0),
    total: materialCost + processCost + toolingCost,
  };
}

/**
 * CO₂e of making the part from its cost breakdown: the material bought × factor, every row's energy × the grid
 * factor, and transport of the part. Returns { factor, rows: [{ op, feature, energy, co2 }], materialCO2, energy,
 * processCO2, machiningCO2, transportCO2, total, perKgPart }.
 */
export function partCO2(cost, user = {}) {
  const s = co2Settings(user);
  const factor = s.factor != null && s.factor !== '' ? num(s.factor) : pick(s.perKg, cost.group);
  const grid = num(s.grid, 0.45);
  const materialCO2 = cost.boughtMass * factor;
  const rows = [{ op: 'material', feature: `${round(cost.boughtMass, 4)} kg × ${factor}`, energy: 0, co2: materialCO2 }];
  let energy = 0;
  for (const r of cost.rows) { if (r.op === 'material' || !(r.energy > 0)) continue; energy += r.energy; rows.push({ op: r.op, feature: r.feature, energy: r.energy, co2: r.energy * grid }); }
  const processCO2 = energy * grid;
  const transportCO2 = ((cost.partMass || 0) / 1000) * num(s.distance, 0) * num(s.perTonneKm, 0);
  rows.push({ op: 'transport', feature: `${num(s.distance, 0)} km`, energy: 0, co2: transportCO2 });
  const total = materialCO2 + processCO2 + transportCO2;
  return { group: cost.group, factor, grid, rows, materialCO2, energy, processCO2, machiningCO2: processCO2, transportCO2, total, perKgPart: cost.partMass > 0 ? total / cost.partMass : 0 };
}

// ───────────────────────── report

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tr = (t, k, fb) => { const v = t ? t(k) : null; return v && v !== k ? v : fb; };

/** The breakdown as CSV (one row per operation, CO₂e beside the cost, the totals last). `t` translates the labels. */
export function costReportCsv(cost, co2, t = null) {
  const grid = co2?.grid ?? 0;
  const head = ['op', 'feature', 'qty', 'amount', 'unit', 'time', 'cost', 'energy', 'co2'].map((k) => tr(t, `cost.col.${k}`, k));
  const lines = [head.map(csvCell).join(',')];
  for (const r of cost.rows) {
    const c = r.op === 'material' ? co2?.materialCO2 ?? '' : (r.energy ?? 0) * grid;
    lines.push([tr(t, `cost.op.${r.op}`, r.op), r.feature, r.qty, round(r.amount, 4), r.unit, round(r.timeMin, 4), round(r.cost, 4), round(r.energy ?? 0, 5), co2 ? round(c, 5) : ''].map(csvCell).join(','));
  }
  if (co2) lines.push([tr(t, 'cost.op.transport', 'transport'), '', '', '', '', '', '', '', round(co2.transportCO2, 5)].map(csvCell).join(','));
  lines.push([tr(t, 'cost.total', 'total'), '', '', '', '', round(cost.timeMin, 4), round(cost.total, 4), round(cost.energy, 5), co2 ? round(co2.total, 5) : ''].map(csvCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** The breakdown as a stand-alone HTML report. meta: { title, part, material, date }. */
export function costReportHtml(cost, co2, t = null, meta = {}) {
  const L = (k, fb) => esc(tr(t, k, fb));
  const money = (v) => `${esc(cost.currency)}${round(v, 2).toFixed(2)}`;
  const grid = co2?.grid ?? 0;
  const body = cost.rows.map((r) => `<tr><td>${L(`cost.op.${r.op}`, r.op)}</td><td>${esc(r.feature)}</td><td class="n">${esc(r.qty)}</td><td class="n">${round(r.amount, 3)} ${esc(r.unit)}</td><td class="n">${round(r.timeMin, 3)}</td><td class="n">${money(r.cost)}</td><td class="n">${round(r.energy ?? 0, 4)}</td><td class="n">${co2 ? round(r.op === 'material' ? co2.materialCO2 : (r.energy ?? 0) * grid, 4) : ''}</td></tr>`).join('');
  const sum = [
    [L('cost.process', 'Process'), L(`cost.proc.${cost.process}`, cost.process)], [L('cost.lot', 'Lot size'), cost.lot],
    [L('drwEval.partMass', 'Part mass'), `${round(cost.partMass, 4)} kg`], [L('cost.boughtMass', 'Material bought'), `${round(cost.boughtMass, 4)} kg`],
    [L('drwEval.materialCost', 'Material cost'), money(cost.materialCost)], [L('cost.processCost', 'Process cost'), money(cost.processCost)],
    [L('cost.toolingCost', 'Tooling per part'), money(cost.toolingCost)], [L('drwEval.totalCost', 'Total'), money(cost.total)],
    ...(co2 ? [[L('drwEval.co2Total', 'CO₂e'), `${round(co2.total, 4)} kg CO₂e`]] : []),
  ].map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  const cols = ['op', 'feature', 'qty', 'amount', 'time', 'cost', 'energy', 'co2'].map((k) => `<th>${L(`cost.col.${k}`, k)}</th>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.title ?? 'Cost report')}</title><style>body{font:13px system-ui,sans-serif;margin:24px;color:#222;background:#fff}h1{font-size:18px}table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left}td.n{text-align:right;font-variant-numeric:tabular-nums}thead th{background:#eef1f5}</style></head><body><h1>${esc(meta.title ?? 'Cost report')}</h1><p>${esc(meta.part ?? '')} · ${esc(meta.material ?? '')} · ${esc(meta.date ?? '')}</p><table>${sum}</table><table><thead><tr>${cols}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}
