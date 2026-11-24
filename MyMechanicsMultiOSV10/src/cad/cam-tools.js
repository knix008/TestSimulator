import { MATERIALS } from './materials.js';
// Machining libraries (no DOM): machines, cutting tools and the cutting data of work materials, and the feeds
// and speeds worked out from them.
//
// Cutting data are handbook starting values (carbide / HSS surface speed, chip load per tooth at Ø12 mm,
// specific cutting force) scaled by tool diameter, radial engagement (chip thinning) and the machine's
// spindle, feed and power limits.

/** Machines: kind 'mill' (3 axes, Z up into the spindle) or 'lathe' (Z along the spindle, X the radius). */
export const MACHINES = [
  { id: 'vmc', kind: 'mill', maxRpm: 12000, maxFeed: 10000, rapid: 24000, power: 11, toolChange: 6, post: 'fanuc', travel: [760, 410, 510] },
  { id: 'vmcHs', kind: 'mill', maxRpm: 24000, maxFeed: 15000, rapid: 36000, power: 15, toolChange: 3, post: 'haas', travel: [1020, 510, 635] },
  { id: 'router', kind: 'mill', maxRpm: 24000, maxFeed: 8000, rapid: 15000, power: 3, toolChange: 10, post: 'linuxcnc', travel: [1200, 900, 150] },
  { id: 'lathe', kind: 'lathe', maxRpm: 4000, maxFeed: 5000, rapid: 15000, power: 15, toolChange: 2, post: 'fanucLathe', travel: [200, 0, 500] },
  { id: 'latheLinux', kind: 'lathe', maxRpm: 3000, maxFeed: 3000, rapid: 8000, power: 5, toolChange: 3, post: 'linuxcncLathe', travel: [150, 0, 400] },
];
export const machineOf = (id) => MACHINES.find((m) => m.id === id) ?? MACHINES[0];

/** Tool types: milling (flat, ball, bull, face, drill, spot, tap) and turning (turn, bore, groove, thread). */
export const MILL_TOOL_TYPES = ['flat', 'ball', 'bull', 'face', 'drill', 'spot', 'tap'];
export const TURN_TOOL_TYPES = ['turnRough', 'turnFinish', 'bore', 'groove', 'thread', 'turnDrill'];

/** The default tool library: number (T), type, diameter, flutes, corner radius, flute / stick-out length. */
export const TOOLS = [
  { id: 't1', T: 1, type: 'face', d: 50, flutes: 5, rc: 0.8, flute: 6, length: 45, grade: 'carbide' },
  { id: 't2', T: 2, type: 'flat', d: 12, flutes: 3, rc: 0, flute: 26, length: 45, grade: 'carbide' },
  { id: 't3', T: 3, type: 'flat', d: 8, flutes: 3, rc: 0, flute: 20, length: 35, grade: 'carbide' },
  { id: 't4', T: 4, type: 'flat', d: 6, flutes: 3, rc: 0, flute: 16, length: 30, grade: 'carbide' },
  { id: 't5', T: 5, type: 'flat', d: 3, flutes: 2, rc: 0, flute: 8, length: 20, grade: 'carbide' },
  { id: 't6', T: 6, type: 'ball', d: 8, flutes: 2, rc: 4, flute: 16, length: 40, grade: 'carbide' },
  { id: 't7', T: 7, type: 'ball', d: 4, flutes: 2, rc: 2, flute: 10, length: 30, grade: 'carbide' },
  { id: 't8', T: 8, type: 'bull', d: 10, flutes: 4, rc: 1, flute: 22, length: 40, grade: 'carbide' },
  { id: 't9', T: 9, type: 'spot', d: 10, flutes: 2, tip: 90, flute: 10, length: 30, grade: 'carbide' },
  { id: 't10', T: 10, type: 'drill', d: 3.3, flutes: 2, tip: 118, flute: 30, length: 45, grade: 'carbide' },
  { id: 't11', T: 11, type: 'drill', d: 4.2, flutes: 2, tip: 118, flute: 36, length: 52, grade: 'carbide' },
  { id: 't12', T: 12, type: 'drill', d: 5, flutes: 2, tip: 118, flute: 40, length: 55, grade: 'carbide' },
  { id: 't13', T: 13, type: 'drill', d: 6.8, flutes: 2, tip: 118, flute: 48, length: 62, grade: 'carbide' },
  { id: 't14', T: 14, type: 'drill', d: 8.5, flutes: 2, tip: 118, flute: 56, length: 70, grade: 'carbide' },
  { id: 't15', T: 15, type: 'drill', d: 10, flutes: 2, tip: 118, flute: 60, length: 75, grade: 'carbide' },
  { id: 't16', T: 16, type: 'drill', d: 6.6, flutes: 2, tip: 118, flute: 48, length: 62, grade: 'carbide' },
  { id: 't17', T: 17, type: 'tap', d: 4, pitch: 0.7, flutes: 3, flute: 12, length: 50, grade: 'hss', thread: 'M4' },
  { id: 't18', T: 18, type: 'tap', d: 5, pitch: 0.8, flutes: 3, flute: 14, length: 55, grade: 'hss', thread: 'M5' },
  { id: 't19', T: 19, type: 'tap', d: 6, pitch: 1, flutes: 3, flute: 16, length: 60, grade: 'hss', thread: 'M6' },
  { id: 't20', T: 20, type: 'tap', d: 8, pitch: 1.25, flutes: 3, flute: 20, length: 70, grade: 'hss', thread: 'M8' },
  { id: 't21', T: 21, type: 'tap', d: 10, pitch: 1.5, flutes: 3, flute: 24, length: 80, grade: 'hss', thread: 'M10' },
  // Turning (d: nose radius × 2 for inserts, the width for grooving, the bar diameter for boring).
  { id: 'l1', T: 1, type: 'turnRough', insert: 'CNMG 120408', approach: 95, grade: 'carbide' },
  { id: 'l2', T: 2, type: 'turnFinish', insert: 'VBMT 160404', approach: 93, grade: 'carbide' },
  { id: 'l3', T: 3, type: 'bore', insert: 'CCMT 060204', approach: 95, d: 10, minBore: 12, grade: 'carbide' },
  { id: 'l4', T: 4, type: 'groove', d: 3, nose: 0.2, width: 3, grade: 'carbide' },
  { id: 'l5', T: 5, type: 'thread', insert: '16ER 1.5 ISO', d: 1, nose: 0.05, angle: 60, grade: 'carbide' },
  { id: 'l6', T: 6, type: 'turnDrill', d: 10, tip: 118, grade: 'carbide' },
];

export const cloneTools = (list = TOOLS) => list.map((t) => withInsert({ ...t }));

// ───────────────────────── ISO 1832 turning inserts

/** Insert shapes: the corner angle (degrees) of each ISO 1832 shape letter (R: round). */
export const INSERT_SHAPES = { A: 85, B: 82, C: 80, D: 55, E: 75, H: 120, K: 55, L: 90, M: 86, O: 135, P: 108, R: 0, S: 90, T: 60, V: 35, W: 80 };
const CLEARANCES = { A: 3, B: 5, C: 7, D: 15, E: 20, F: 25, G: 30, N: 0, P: 11, O: 0 };
const THICKNESS = { '01': 1.59, T0: 1.79, T1: 1.98, '02': 2.38, T2: 2.78, '03': 3.18, T3: 3.97, '04': 4.76, '05': 5.56, '06': 6.35, '07': 7.94, '09': 9.52 };

/**
 * An ISO 1832 insert code ("CNMG 120408", "VBMT160404", "RCMT 1204M0") → { shape, angle (corner, degrees),
 * clearance (degrees), edge (mm), ic (inscribed circle, mm), thickness (mm), nose (mm), round }; null when the
 * code is not one.
 */
export function parseInsert(code) {
  const m = /^([A-Z])([A-Z])([A-Z])([A-Z])\s*-?\s*(\d{2})(T\d|\d{2})(\d{2}|M0)/.exec(String(code ?? '').toUpperCase().trim());
  if (!m || !(m[1] in INSERT_SHAPES)) return null;
  const [, shape, clr, , , size, th, nr] = m;
  const angle = INSERT_SHAPES[shape];
  const edge = Number(size);
  const rad = (d) => (d * Math.PI) / 180;
  // The size digits are the cutting edge length cut to whole millimetres: the standard inscribed circles.
  const IC = { C: { '06': 6.35, '09': 9.525, '12': 12.7, '16': 15.875, '19': 19.05 }, D: { '07': 6.35, '11': 9.525, '15': 12.7, '19': 15.875 }, V: { '11': 6.35, '16': 9.525, '22': 12.7 }, T: { '11': 6.35, '16': 9.525, '22': 12.7, '27': 15.875 }, S: { '09': 9.525, '12': 12.7, '15': 15.875, '19': 19.05 }, W: { '06': 9.525, '08': 12.7 } };
  const table = IC[shape]?.[size];
  const ic = table ?? (shape === 'R' ? edge : shape === 'S' || shape === 'L' ? edge : shape === 'T' ? edge / Math.sqrt(3) : shape === 'W' ? edge * 1.46 : edge * Math.sin(rad(angle)));
  const nose = nr === 'M0' ? ic / 2 : Number(nr) / 10;
  return { shape, angle, clearance: CLEARANCES[clr] ?? 0, edge, ic: table ?? Math.round(ic * 100) / 100, thickness: THICKNESS[th] ?? Number(th) * 0.79375, nose, round: shape === 'R' };
}

/** A turning tool with its insert's corner angle and nose radius filled in from the insert code. */
export function withInsert(tool) {
  const ins = TURN_TOOL_TYPES.includes(tool.type) ? parseInsert(tool.insert) : null;
  if (ins) { tool.angle = ins.round ? 180 : ins.angle; tool.nose = ins.nose; tool.d = 2 * ins.nose; tool.ic = ins.ic; }
  if (TURN_TOOL_TYPES.includes(tool.type)) tool.approach ??= 95;
  return tool;
}
export const isTurnTool = (tool) => TURN_TOOL_TYPES.includes(tool?.type);
/** The cutter shape a drop cutter / simulator uses. */
export function cutterOf(tool) {
  const r = Number(tool.d) / 2;
  if (tool.type === 'ball') return { type: 'ball', r, rc: r };
  if (tool.type === 'bull' || tool.type === 'face') return { type: 'bull', r, rc: Math.min(r, Number(tool.rc) || 0) };
  if (tool.type === 'drill' || tool.type === 'spot') return { type: 'drill', r, tip: Number(tool.tip) || 118 };
  return { type: 'flat', r, rc: 0 };
}

/** Work materials and their cutting data. vc: m/min (carbide, hss), fz12: mm/tooth at Ø12, kc: N/mm², turning vc and feed/rev. */
export const CUT_MATERIALS = {
  aluminium: { vc: [380, 110], fz12: 0.1, kc: 800, turnVc: 450, turnF: [0.3, 0.12], drillF: 0.022 },
  steel: { vc: [180, 30], fz12: 0.06, kc: 2000, turnVc: 220, turnF: [0.28, 0.1], drillF: 0.016 },
  alloySteel: { vc: [140, 22], fz12: 0.05, kc: 2300, turnVc: 170, turnF: [0.25, 0.09], drillF: 0.014 },
  stainless: { vc: [110, 15], fz12: 0.04, kc: 2500, turnVc: 150, turnF: [0.22, 0.08], drillF: 0.012 },
  castIron: { vc: [150, 25], fz12: 0.07, kc: 1200, turnVc: 200, turnF: [0.3, 0.12], drillF: 0.02 },
  titanium: { vc: [55, 10], fz12: 0.04, kc: 2100, turnVc: 60, turnF: [0.18, 0.08], drillF: 0.01 },
  copperAlloy: { vc: [250, 60], fz12: 0.08, kc: 780, turnVc: 300, turnF: [0.25, 0.1], drillF: 0.02 },
  plastic: { vc: [300, 150], fz12: 0.12, kc: 300, turnVc: 300, turnF: [0.25, 0.12], drillF: 0.03 },
  wood: { vc: [600, 300], fz12: 0.2, kc: 100, turnVc: 400, turnF: [0.3, 0.15], drillF: 0.04 },
};

/** The cutting class of an app material id (cad/materials.js). */
export function cutMaterialOf(id) {
  // A library material names its machining class.
  const own = MATERIALS.find((m) => m.id === id)?.cut;
  if (own) return own;
  const s = String(id ?? '');
  if (s.startsWith('al-')) return 'aluminium';
  if (s === 'steel-4340') return 'alloySteel';
  if (s.startsWith('stainless')) return 'stainless';
  if (s.startsWith('steel')) return 'steel';
  if (s === 'cast-iron') return 'castIron';
  if (s === 'titanium') return 'titanium';
  if (s === 'brass' || s === 'copper') return 'copperAlloy';
  if (['abs', 'pc', 'nylon', 'pom', 'rubber', 'glass'].includes(s)) return 'plastic';
  if (s === 'oak') return 'wood';
  return CUT_MATERIALS[s] ? s : 'steel';
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Spindle speed and feeds for a milling tool: { rpm, feed (mm/min), plunge, fz, vc, power (kW) }.
 * ae: radial engagement (mm, default 50 % of Ø), ap: axial depth (mm).
 */
export function millingData(tool, materialClass, machine, { ae = null, ap = null } = {}) {
  const m = CUT_MATERIALS[materialClass] ?? CUT_MATERIALS.steel;
  const D = Math.max(0.1, Number(tool.d));
  const carbide = tool.grade !== 'hss';
  let vc = m.vc[carbide ? 0 : 1];
  if (tool.type === 'tap') vc = m.vc[1] * 0.35;
  if (tool.type === 'drill' || tool.type === 'spot') vc *= 0.75;
  let rpm = clamp((1000 * vc) / (Math.PI * D), 100, machine.maxRpm);
  let feed; let fz = 0; let plunge;
  if (tool.type === 'drill' || tool.type === 'spot') {
    const fr = m.drillF * D; // mm/rev
    feed = rpm * fr; plunge = feed;
  } else if (tool.type === 'tap') {
    const pitch = Number(tool.pitch) || 1;
    rpm = Math.min(rpm, 1500);
    feed = rpm * pitch; plunge = feed;
  } else {
    fz = m.fz12 * clamp(Math.sqrt(D / 12), 0.25, 1.6);
    if (tool.type === 'ball') fz *= 0.8;
    const e = ae == null ? D / 2 : clamp(ae, 0.01, D);
    // Chip thinning below half the diameter: the same chip thickness needs a higher feed per tooth.
    if (e < D / 2) fz *= clamp(D / (2 * Math.sqrt(D * e - e * e)), 1, 2.5);
    if (e >= D * 0.95) fz *= 0.7; // full slot
    feed = rpm * fz * (Number(tool.flutes) || 2);
    plunge = feed * 0.3;
  }
  feed = Math.min(feed, machine.maxFeed); plunge = Math.min(plunge, machine.maxFeed);
  const depth = ap ?? Math.min(D, Number(tool.flute) || D);
  const width = ae ?? D / 2;
  let power = (width * depth * feed * (m.kc)) / 60e6;
  if (tool.type !== 'drill' && tool.type !== 'spot' && tool.type !== 'tap' && power > machine.power * 0.85) {
    const k = (machine.power * 0.85) / power;
    feed *= k; plunge *= k; power *= k;
  }
  return { rpm: Math.round(rpm), feed: Math.round(feed), plunge: Math.max(1, Math.round(plunge)), fz, vc, power };
}

/** Turning data: { vc (m/min), feedRev (mm/rev), maxRpm, rpmAt(d) }. finish: the finishing feed. */
export function turningData(tool, materialClass, machine, { finish = false } = {}) {
  const m = CUT_MATERIALS[materialClass] ?? CUT_MATERIALS.steel;
  let vc = m.turnVc; let f = m.turnF[finish ? 1 : 0];
  if (tool.type === 'groove') { vc *= 0.7; f = 0.06; }
  if (tool.type === 'thread') { vc *= 0.5; f = Number(tool.pitch) || 1.5; }
  if (tool.type === 'turnDrill') { vc = m.vc[0] * 0.75; f = m.drillF * Number(tool.d); }
  if (tool.type === 'bore') vc *= 0.85;
  const rpmAt = (d) => clamp((1000 * vc) / (Math.PI * Math.max(1, d)), 50, machine.maxRpm);
  return { vc, feedRev: f, maxRpm: machine.maxRpm, rpmAt };
}

/** ISO metric coarse threads: tap drill and pitch. */
export const METRIC_THREADS = { M3: [2.5, 0.5], M4: [3.3, 0.7], M5: [4.2, 0.8], M6: [5, 1], M8: [6.8, 1.25], M10: [8.5, 1.5], M12: [10.2, 1.75], M16: [14, 2], M20: [17.5, 2.5] };
/** The thread whose tap drill is this diameter (± 0.06 mm), or null. */
export function threadForDrill(d) {
  for (const [name, [drill]] of Object.entries(METRIC_THREADS)) if (Math.abs(drill - d) <= 0.06) return name;
  return null;
}
