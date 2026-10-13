// Parametric machine parts library (fasteners, pins and rings, gears and
// drives, bearings and shafts, springs, structural profiles), sized from ISO /
// DIN / KS tables like FreeCAD's Fasteners and Gears workbenches.
//
// A part entity keeps only its kind and parameters; its outline is generated
// every time (so editing a parameter redraws the part). Generators return
// primitives in the part's own coordinates (origin = insertion point):
//   { kind: 'line', a, b } · { kind: 'poly', points, closed } · { kind: 'circle', c, r } · { kind: 'arc', c, r, start, end }
// with an optional `lineType` ('center' | 'hidden') and `thin` (thread lines).
import { arcPoints, deg, polar, rad, TAU } from './geometry.js';

// ───────────────────────── standard tables (mm)

/** Metric coarse threads: pitch, hex across flats (ISO 4032/4017), hex head height k, nut height m. */
export const METRIC = {
  3: { p: 0.5, s: 5.5, k: 2, m: 2.4 },
  4: { p: 0.7, s: 7, k: 2.8, m: 3.2 },
  5: { p: 0.8, s: 8, k: 3.5, m: 4.7 },
  6: { p: 1, s: 10, k: 4, m: 5.2 },
  8: { p: 1.25, s: 13, k: 5.3, m: 6.8 },
  10: { p: 1.5, s: 16, k: 6.4, m: 8.4 },
  12: { p: 1.75, s: 18, k: 7.5, m: 10.8 },
  16: { p: 2, s: 24, k: 10, m: 14.8 },
  20: { p: 2.5, s: 30, k: 12.5, m: 18 },
  24: { p: 3, s: 36, k: 15, m: 21.5 },
  30: { p: 3.5, s: 46, k: 18.7, m: 25.6 },
};
const SIZES = Object.keys(METRIC).map(Number);
const SMALL_SIZES = [3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
/** ISO 4762 socket head cap screws: head diameter, head height, hex key. */
const SOCKET = { 3: [5.5, 3, 2.5], 4: [7, 4, 3], 5: [8.5, 5, 4], 6: [10, 6, 5], 8: [13, 8, 6], 10: [16, 10, 8], 12: [18, 12, 10], 16: [24, 16, 14], 20: [30, 20, 17], 24: [36, 24, 19] };
/** ISO 10642 countersunk heads: head diameter, hex key. */
const COUNTERSUNK = { 3: [6.72, 2], 4: [8.96, 2.5], 5: [11.2, 3], 6: [13.44, 4], 8: [17.92, 5], 10: [22.4, 6], 12: [26.88, 8], 16: [33.6, 10], 20: [40.32, 12], 24: [48, 14] };
/** ISO 7380 button heads: head diameter, head height, hex key. */
const BUTTON = { 3: [5.7, 1.65, 2], 4: [7.6, 2.2, 2.5], 5: [9.5, 2.75, 3], 6: [10.5, 3.3, 4], 8: [14, 4.4, 5], 10: [17.5, 5.5, 6], 12: [21, 6.6, 8], 16: [28, 8.8, 10], 20: [35, 11, 12], 24: [42, 13.2, 14] };
/** Nut heights: ISO 4035 thin nuts, DIN 985 nylon-insert lock nuts. */
const THIN_NUT = { 3: 1.8, 4: 2.2, 5: 2.7, 6: 3.2, 8: 4, 10: 5, 12: 6, 16: 8, 20: 10, 24: 12, 30: 15 };
const LOCK_NUT = { 3: 4, 4: 5, 5: 5, 6: 6, 8: 8, 10: 10, 12: 12, 16: 16, 20: 20, 24: 24, 30: 30 };
/** Washers: ISO 7089 (inner, outer, thickness), ISO 7093 large (outer, thickness), DIN 127 spring (inner, outer, thickness). */
export const WASHER = { 3: [3.2, 7, 0.5], 4: [4.3, 9, 0.8], 5: [5.3, 10, 1], 6: [6.4, 12, 1.6], 8: [8.4, 16, 1.6], 10: [10.5, 20, 2], 12: [13, 24, 2.5], 16: [17, 30, 3], 20: [21, 37, 3], 24: [25, 44, 4], 30: [31, 56, 4] };
const LARGE_WASHER = { 3: [9, 0.8], 4: [12, 1], 5: [15, 1.2], 6: [18, 1.6], 8: [24, 2], 10: [30, 2.5], 12: [37, 3], 16: [50, 3], 20: [60, 4], 24: [72, 5], 30: [92, 6] };
const SPRING_WASHER = { 3: [3.1, 6.2, 0.8], 4: [4.1, 7.6, 0.9], 5: [5.1, 9.2, 1.2], 6: [6.1, 11.8, 1.6], 8: [8.2, 14.8, 2], 10: [10.2, 18.1, 2.2], 12: [12.2, 21.1, 2.5], 16: [16.2, 27.4, 3.5], 20: [20.2, 33.6, 4], 24: [24.5, 40, 5], 30: [30.5, 48.2, 6] };
/** ISO 273 clearance holes (fine, medium, coarse) and socket-cap counterbores (ISO 4762). */
const CLEARANCE = { 3: [3.2, 3.4, 3.6], 4: [4.3, 4.5, 4.8], 5: [5.3, 5.5, 5.8], 6: [6.4, 6.6, 7], 8: [8.4, 9, 10], 10: [10.5, 11, 12], 12: [13, 13.5, 14.5], 16: [17, 17.5, 18.5], 20: [21, 22, 24], 24: [25, 26, 28], 30: [31, 33, 35] };
const COUNTERBORE = { 3: 6.5, 4: 8, 5: 9.5, 6: 11, 8: 14, 10: 17.5, 12: 20, 16: 26, 20: 33, 24: 39, 30: 48 };
/** DIN 6885 A parallel keys: width → height. */
const KEYS = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 8: 7, 10: 8, 12: 8, 14: 9, 16: 10, 18: 11, 20: 12 };
/** Deep-groove ball bearings: bore, outer diameter, width, by designation. */
export const BEARINGS = {
  6000: [10, 26, 8], 6001: [12, 28, 8], 6002: [15, 32, 9], 6003: [17, 35, 10], 6004: [20, 42, 12], 6005: [25, 47, 12], 6006: [30, 55, 13], 6008: [40, 68, 15], 6010: [50, 80, 16],
  6200: [10, 30, 9], 6201: [12, 32, 10], 6202: [15, 35, 11], 6203: [17, 40, 12], 6204: [20, 47, 14], 6205: [25, 52, 15], 6206: [30, 62, 16], 6208: [40, 80, 18], 6210: [50, 90, 20],
  6300: [10, 35, 11], 6301: [12, 37, 12], 6302: [15, 42, 13], 6303: [17, 47, 14], 6304: [20, 52, 15], 6305: [25, 62, 17], 6306: [30, 72, 19], 6308: [40, 90, 23], 6310: [50, 110, 27],
};
/** ISO 606 roller chains: pitch → roller diameter. */
const CHAINS = { '05B': [8, 5], '06B': [9.525, 6.35], '08B': [12.7, 8.51], '10B': [15.875, 10.16], '12B': [19.05, 12.07], '16B': [25.4, 15.88] };
/** Timing belts: pitch, pitch-line offset, groove depth. */
const BELTS = { GT2: [2, 0.254, 0.75], '3M': [3, 0.381, 1.14], '5M': [5, 0.5715, 2.06], T5: [5, 0.6, 1.2] };
/** V-belt sections: top width, groove depth. */
const V_BELTS = { Z: [10, 9], A: [13, 11], B: [17, 14], C: [22, 19] };
/** Aluminium T-slot extrusions: size → slot opening. */
const EXTRUSIONS = { 20: 6, 30: 8, 40: 8, 45: 10 };
/** IPE beams: h, b, web, flange, root radius. UPN channels: h, b, web, flange. */
const IPE = { 80: [80, 46, 3.8, 5.2, 5], 100: [100, 55, 4.1, 5.7, 7], 120: [120, 64, 4.4, 6.3, 7], 140: [140, 73, 4.7, 6.9, 7], 160: [160, 82, 5, 7.4, 9], 180: [180, 91, 5.3, 8, 9], 200: [200, 100, 5.6, 8.5, 12] };
const UPN = { 80: [80, 45, 6, 8], 100: [100, 50, 6, 8.5], 120: [120, 55, 7, 9], 140: [140, 60, 7, 10], 160: [160, 65, 7.5, 10.5], 180: [180, 70, 8, 11], 200: [200, 75, 8.5, 11.5] };

// ───────────────────────── primitive helpers

const num = (key, def, min, max, step = 1, unit = 'mm') => ({ key, type: 'number', def, min, max, step, unit });
const int = (key, def, min, max) => ({ key, type: 'int', def, min, max, step: 1, unit: '' });
const bool = (key, def) => ({ key, type: 'bool', def });
const select = (key, def, options, unit = '') => ({ key, type: 'select', def, options, unit });
const size = (def = 10, options = SIZES) => select('size', def, options, 'M');
const view = (options, def = options[0]) => select('view', def, options);

const line = (ax, ay, bx, by, extra = {}) => ({ kind: 'line', a: { x: ax, y: ay }, b: { x: bx, y: by }, ...extra });
const circle = (cx, cy, r, extra = {}) => ({ kind: 'circle', c: { x: cx, y: cy }, r, ...extra });
const poly = (points, closed = true, extra = {}) => ({ kind: 'poly', points, closed, ...extra });
const arc = (cx, cy, r, start, end, extra = {}) => ({ kind: 'arc', c: { x: cx, y: cy }, r, start, end, ...extra });
const center = { lineType: 'center' };
const hidden = { lineType: 'hidden' };
const thin = { thin: true };
const P = (x, y) => ({ x, y });

/** Centre lines crossing at the origin, `size` long each way. */
const crossLines = (half) => [line(-half, 0, half, 0, center), line(0, -half, 0, half, center)];
/** Horizontal axis line from x0 to x1. */
const axis = (x0, x1) => line(x0, 0, x1, 0, center);
/** Points of the upper half mirrored below, as one closed outline (side views of round parts). */
const mirrored = (top) => [...top, ...top.map((p) => P(p.x, -p.y)).reverse()];
const rectangle = (x0, y0, x1, y1, extra = {}) => poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], true, extra);
const hexagon = (across, angle = 0) => Array.from({ length: 6 }, (_, i) => polar(P(0, 0), across / Math.sqrt(3), angle + i * 60));

/** Polygon with its corners rounded (radius per corner, or one radius for all). */
export function roundCorners(points, radii) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const r = Array.isArray(radii) ? radii[i] ?? 0 : radii;
    const p = points[i];
    if (!(r > 0)) { out.push(p); continue; }
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    const u = { x: a.x - p.x, y: a.y - p.y };
    const v = { x: b.x - p.x, y: b.y - p.y };
    const lu = Math.hypot(u.x, u.y);
    const lv = Math.hypot(v.x, v.y);
    const angle = Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv))));
    const d = Math.min(r / Math.tan(angle / 2), lu / 2, lv / 2);
    const rr = d * Math.tan(angle / 2);
    const t1 = P(p.x + (u.x / lu) * d, p.y + (u.y / lu) * d);
    const t2 = P(p.x + (v.x / lv) * d, p.y + (v.y / lv) * d);
    const bis = { x: u.x / lu + v.x / lv, y: u.y / lu + v.y / lv };
    const lb = Math.hypot(bis.x, bis.y) || 1;
    const c = P(p.x + (bis.x / lb) * (rr / Math.sin(angle / 2)), p.y + (bis.y / lb) * (rr / Math.sin(angle / 2)));
    const s = deg(Math.atan2(t1.y - c.y, t1.x - c.x));
    let e = deg(Math.atan2(t2.y - c.y, t2.x - c.x));
    // Go the short way round.
    let sweepAngle = ((e - s) % 360 + 360) % 360;
    if (sweepAngle > 180) sweepAngle -= 360;
    e = s + sweepAngle;
    const steps = Math.max(2, Math.ceil(Math.abs(sweepAngle) / 15));
    for (let k = 0; k <= steps; k++) out.push(polar(c, rr, s + (sweepAngle * k) / steps));
  }
  return out;
}

/** A threaded shank seen from the side: outline, thread-end line and the thin minor-diameter lines. */
function threadedShank(x0, x1, d, pitch, threadLength, { chamferEnd = true } = {}) {
  const r = d / 2;
  const c = chamferEnd ? Math.min(pitch, (x1 - x0) / 4) : 0;
  const minor = r - 0.6134 * pitch;
  const tStart = Math.max(x0, x1 - threadLength);
  return [
    poly([P(x0, r), P(x1 - c, r), P(x1, r - c), P(x1, -r + c), P(x1 - c, -r), P(x0, -r)], false),
    ...(c ? [line(x1 - c, r, x1 - c, -r)] : []),
    line(tStart, r, tStart, -r),
    line(tStart, minor, x1, minor, thin),
    line(tStart, -minor, x1, -minor, thin),
  ];
}

/** Top view of a thread: minor circle and the open 3/4 major-diameter arc (ISO 6410). */
const threadTop = (d, pitch) => [circle(0, 0, d / 2 - 0.6134 * pitch), arc(0, 0, d / 2, 0, 270, thin)];

// ───────────────────────── gears

const involute = (alpha) => Math.tan(alpha) - alpha;

/**
 * Involute tooth outline as one closed polyline. `addendum`/`dedendum` are in
 * modules (1 / 1.25 for an external gear; an internal gear's bore uses 1.25 / 1).
 */
export function gearProfile({ module: m, teeth: z, pressureAngle, addendum = 1, dedendum = 1.25 }) {
  const alpha = rad(pressureAngle);
  const rp = (m * z) / 2;
  const rb = rp * Math.cos(alpha);
  const ra = rp + addendum * m;
  const rf = Math.max(rp - dedendum * m, m * 0.5);
  const half = Math.PI / (2 * z) + involute(alpha);
  const flank = (r) => half - involute(Math.acos(Math.min(1, rb / Math.max(r, rb))));
  const start = Math.max(rf, rb);
  const steps = 8;
  const radii = Array.from({ length: steps + 1 }, (_, i) => start + ((ra - start) * i) / steps);
  const points = [];
  const at = (r, angle) => P(r * Math.cos(angle), r * Math.sin(angle));
  for (let i = 0; i < z; i++) {
    const c = (i * TAU) / z;
    if (rf < rb) points.push(at(rf, c - flank(rb)));
    for (const r of radii) points.push(at(r, c - flank(r)));
    const tipA = c - flank(ra);
    const tipB = c + flank(ra);
    for (let k = 1; k < 4; k++) points.push(at(ra, tipA + ((tipB - tipA) * k) / 4));
    for (const r of [...radii].reverse()) points.push(at(r, c + flank(r)));
    if (rf < rb) points.push(at(rf, c + flank(rb)));
    const from = c + flank(start);
    const to = c + TAU / z - flank(start);
    for (let k = 1; k < 4; k++) points.push(at(rf, from + ((to - from) * k) / 4));
  }
  return { points, rp, rb, ra, rf };
}

/** Bore with an optional keyway (DIN 6885 proportions) as a closed polyline, or a circle. */
export function boreOutline(diameter, keyway) {
  const r = diameter / 2;
  if (r <= 0) return [];
  if (!keyway || diameter < 6) return [circle(0, 0, r)];
  const width = Math.max(2, Math.round(diameter / 4));
  const depth = Math.max(1, Math.round(width * 0.4 * 10) / 10);
  const w = Math.min(width / 2, r * 0.8);
  const h = Math.sqrt(r * r - w * w);
  const edge = deg(Math.atan2(h, w));
  const points = arcPoints(0, 0, r, 180 - edge, edge, 6);
  points.push(P(w, r + depth), P(-w, r + depth));
  return [poly(points, true)];
}

/** Sprocket or timing pulley: round seats for rollers / belt teeth between straight flanks. */
function seatedWheel(z, pitchRadius, seatRadius, tipRadius, open = 62) {
  const points = [];
  for (let i = 0; i < z; i++) {
    const theta = (i * 360) / z;
    const half = 180 / z;
    const seat = polar(P(0, 0), pitchRadius, theta);
    for (let k = 0; k <= 8; k++) points.push(polar(seat, seatRadius, theta + 180 + open - (2 * open * k) / 8));
    points.push(polar(P(0, 0), tipRadius, theta + half));
  }
  return points;
}

// ───────────────────────── springs

function coilSide(wire, diameter, length, coils, { closedEnds = true } = {}) {
  const d = Math.min(wire, diameter / 3);
  const r = diameter / 2;
  const L = Math.max(length, d * (coils + 1));
  const pitch = (L - d) / coils;
  const parts = [];
  for (let i = 0; i <= coils; i++) {
    const xt = d / 2 + i * pitch;
    parts.push(circle(xt, r, d / 2));
    if (i < coils) {
      const xb = xt + pitch / 2;
      parts.push(circle(xb, -r, d / 2));
      parts.push(line(xt - d / 2, r, xb - d / 2, -r), line(xt + d / 2, r, xb + d / 2, -r));
    }
  }
  if (closedEnds) parts.push(line(0, r + d, 0, -r - d), line(L, r + d, L, -r - d));
  parts.push(axis(-3, L + 3));
  return { parts, L, r, d };
}

// ───────────────────────── definitions

export const PART_CATEGORIES = {
  fasteners: ['bolt', 'socketScrew', 'countersunk', 'buttonHead', 'setScrew', 'nut', 'washer', 'hole'],
  pins: ['dowelPin', 'springPin', 'cotterPin', 'parallelKey', 'circlipShaft', 'circlipBore', 'oRing'],
  gears: ['gear', 'internalGear', 'rack', 'sprocket', 'timingPulley', 'vPulley', 'worm'],
  bearings: ['bearing', 'bushing', 'shaft', 'flange'],
  springs: ['spring', 'extensionSpring', 'torsionSpring'],
  profiles: ['extrusion', 'iBeam', 'channel', 'angle', 'rectTube', 'roundTube', 'slot'],
};
export const CATEGORY_ICONS = { fasteners: 'bolt', pins: 'washer', gears: 'part', bearings: 'bearing', springs: 'spring', profiles: 'shaft' };

export const PARTS = {
  // ── fasteners
  bolt: {
    standard: 'ISO 4017 / 4014',
    params: [size(10), num('length', 40, 5, 500, 1), view(['side', 'top'])],
    generate(p) {
      const spec = METRIC[p.size];
      const d = p.size;
      if (p.view === 'top') return [poly(hexagon(spec.s, 0), true), circle(0, 0, (spec.s * 0.95) / 2), ...crossLines(spec.s / Math.sqrt(3) + 2)];
      const k = spec.k;
      const e = spec.s / Math.cos(rad(30)) / 2;
      return [
        poly([P(-k, -e), P(0, -e), P(0, e), P(-k, e)], true),
        line(-k, e / 2, 0, e / 2), line(-k, -e / 2, 0, -e / 2),
        ...threadedShank(0, p.length, d, spec.p, Math.min(p.length, 2 * d + 6)),
        axis(-k - 2, p.length + 3),
      ];
    },
    info: (p) => ({ acrossFlats: METRIC[p.size].s, headHeight: METRIC[p.size].k, thread: Math.min(p.length, 2 * p.size + 6), pitchThread: METRIC[p.size].p }),
  },
  socketScrew: {
    standard: 'ISO 4762',
    params: [size(8, SMALL_SIZES), num('length', 25, 4, 300, 1), view(['side', 'top'])],
    generate(p) {
      const [dk, k, s] = SOCKET[p.size];
      if (p.view === 'top') return [circle(0, 0, dk / 2), poly(hexagon(s, 0), true), circle(0, 0, dk / 2 - 0.5, thin), ...crossLines(dk / 2 + 2)];
      const r = dk / 2;
      const c = Math.min(0.08 * dk, k / 4);
      return [
        poly([P(-k, -r + c), P(-k + c, -r), P(0, -r), P(0, r), P(-k + c, r), P(-k, r - c)], true),
        line(-k, s / 2, -k + 0.6 * k, s / 2, hidden), line(-k, -s / 2, -k + 0.6 * k, -s / 2, hidden), line(-k + 0.6 * k, s / 2, -k + 0.6 * k, -s / 2, hidden),
        ...threadedShank(0, p.length, p.size, METRIC[p.size].p, Math.min(p.length, 2 * p.size + 12)),
        axis(-k - 2, p.length + 3),
      ];
    },
    info: (p) => ({ headDiameter: SOCKET[p.size][0], headHeight: SOCKET[p.size][1], hexKey: SOCKET[p.size][2] }),
  },
  countersunk: {
    standard: 'ISO 10642',
    params: [size(6, SMALL_SIZES), num('length', 20, 4, 300, 1), view(['side', 'top'])],
    generate(p) {
      const [dk, s] = COUNTERSUNK[p.size];
      const d = p.size;
      if (p.view === 'top') return [circle(0, 0, dk / 2), poly(hexagon(s, 0), true), ...crossLines(dk / 2 + 2)];
      const k = (dk - d) / 2;
      return [
        poly([P(-k, dk / 2), P(0, d / 2), P(0, -d / 2), P(-k, -dk / 2)], true),
        ...threadedShank(0, p.length - k, d, METRIC[p.size].p, p.length - k),
        axis(-k - 2, p.length - k + 3),
      ];
    },
    info: (p) => ({ headDiameter: COUNTERSUNK[p.size][0], hexKey: COUNTERSUNK[p.size][1] }),
  },
  buttonHead: {
    standard: 'ISO 7380',
    params: [size(6, SMALL_SIZES), num('length', 16, 4, 200, 1), view(['side', 'top'])],
    generate(p) {
      const [dk, k, s] = BUTTON[p.size];
      if (p.view === 'top') return [circle(0, 0, dk / 2), poly(hexagon(s, 0), true), ...crossLines(dk / 2 + 2)];
      // Dome: an arc through the head's edge and its top.
      const r = dk / 2;
      const R = (r * r + k * k) / (2 * k);
      const half = deg(Math.asin(Math.min(1, r / R)));
      const dome = arcPoints(-k + R, 0, R, 180 - half, 180 + half, 4);
      return [
        poly([...dome, P(0, -r), P(0, r)], true),
        ...threadedShank(0, p.length, p.size, METRIC[p.size].p, p.length),
        axis(-k - 2, p.length + 3),
      ];
    },
    info: (p) => ({ headDiameter: BUTTON[p.size][0], headHeight: BUTTON[p.size][1], hexKey: BUTTON[p.size][2] }),
  },
  setScrew: {
    standard: 'ISO 4026',
    params: [size(6, SMALL_SIZES), num('length', 10, 2, 100, 1)],
    generate(p) {
      const d = p.size;
      const key = Math.max(1.5, d / 2);
      return [
        ...threadedShank(0, p.length, d, METRIC[p.size].p, p.length),
        line(0, key / 2, key * 0.6, key / 2, hidden), line(0, -key / 2, key * 0.6, -key / 2, hidden), line(key * 0.6, key / 2, key * 0.6, -key / 2, hidden),
        axis(-2, p.length + 2),
      ];
    },
  },
  nut: {
    standard: 'ISO 4032 / 4035 · DIN 985',
    params: [size(10), select('type', 'regular', ['regular', 'thin', 'nylock']), view(['top', 'side'])],
    generate(p) {
      const spec = METRIC[p.size];
      const d = p.size;
      const corner = spec.s / Math.sqrt(3);
      if (p.view === 'side') {
        const m = p.type === 'thin' ? THIN_NUT[p.size] : p.type === 'nylock' ? LOCK_NUT[p.size] : spec.m;
        const e = corner;
        const parts = [rectangle(0, -e, m, e), line(0, e / 2, m, e / 2), line(0, -e / 2, m, -e / 2), line(0, d / 2, m, d / 2, hidden), line(0, -d / 2, m, -d / 2, hidden)];
        if (p.type === 'nylock') parts.push(line(spec.m * 0.75, -e, spec.m * 0.75, e, thin));
        return [...parts, axis(-2, m + 2)];
      }
      return [poly(hexagon(spec.s, 0), true), circle(0, 0, (spec.s * 0.95) / 2), ...threadTop(d, spec.p), ...crossLines(corner + 2)];
    },
    info: (p) => ({ acrossFlats: METRIC[p.size].s, height: p.type === 'thin' ? THIN_NUT[p.size] : p.type === 'nylock' ? LOCK_NUT[p.size] : METRIC[p.size].m }),
  },
  washer: {
    standard: 'ISO 7089 / 7093 · DIN 127',
    params: [size(10), select('type', 'plain', ['plain', 'large', 'spring']), view(['top', 'side'])],
    generate(p) {
      const [inner, plainOuter, plainThickness] = WASHER[p.size];
      const [outer, thickness, innerDia] = p.type === 'large' ? [LARGE_WASHER[p.size][0], LARGE_WASHER[p.size][1], inner]
        : p.type === 'spring' ? [SPRING_WASHER[p.size][1], SPRING_WASHER[p.size][2], SPRING_WASHER[p.size][0]] : [plainOuter, plainThickness, inner];
      if (p.view === 'side') {
        if (p.type === 'spring') {
          // Split ring seen from the side: two slanted ends.
          return [rectangle(0, innerDia / 2, thickness, outer / 2), rectangle(0, -outer / 2, thickness, -innerDia / 2), line(0, innerDia / 2, thickness * 1.6, outer / 2, thin), axis(-2, thickness + 2)];
        }
        return [rectangle(0, innerDia / 2, thickness, outer / 2), rectangle(0, -outer / 2, thickness, -innerDia / 2), line(0, innerDia / 2, thickness, innerDia / 2, hidden), axis(-2, thickness + 2)];
      }
      const parts = [circle(0, 0, outer / 2), circle(0, 0, innerDia / 2), ...crossLines(outer / 2 + 2)];
      if (p.type === 'spring') parts.push(line(innerDia / 2, -0.4, outer / 2, 0.4));
      return parts;
    },
    info: (p) => {
      const [inner, outer, t] = p.type === 'large' ? [WASHER[p.size][0], ...LARGE_WASHER[p.size]] : p.type === 'spring' ? SPRING_WASHER[p.size] : WASHER[p.size];
      return { inner, outerDiameter: outer, thickness: t };
    },
  },
  hole: {
    standard: 'ISO 273 · ISO 4762 · ISO 6410',
    params: [size(8), select('type', 'clearance', ['clearance', 'counterbore', 'countersink', 'tapped']), select('fit', 'medium', ['fine', 'medium', 'coarse']), num('depth', 12, 1, 500, 1), view(['top', 'section'])],
    generate(p) {
      const d = p.size;
      const fitIndex = { fine: 0, medium: 1, coarse: 2 }[p.fit];
      const hole = p.type === 'tapped' ? d - METRIC[p.size].p : CLEARANCE[p.size][fitIndex];
      const cb = COUNTERBORE[p.size];
      const cs = (COUNTERSUNK[p.size]?.[0] ?? d * 2.2) + 0.4;
      if (p.view === 'section') {
        const r = hole / 2;
        const D = p.depth;
        const tip = r / Math.tan(rad(59));
        const parts = [];
        let top;
        if (p.type === 'counterbore') {
          const depth = (SOCKET[p.size]?.[1] ?? d) + 0.4;
          top = [P(-cb / 2, 0), P(-cb / 2, -depth), P(-r, -depth), P(-r, -D), P(0, -D - tip), P(r, -D), P(r, -depth), P(cb / 2, -depth), P(cb / 2, 0)];
        } else if (p.type === 'countersink') {
          const depth = (cs - hole) / 2;
          top = [P(-cs / 2, 0), P(-r, -depth), P(-r, -D), P(0, -D - tip), P(r, -D), P(r, -depth), P(cs / 2, 0)];
        } else {
          top = [P(-r, 0), P(-r, -D), P(0, -D - tip), P(r, -D), P(r, 0)];
        }
        parts.push(poly(top, false));
        if (p.type === 'tapped') {
          const thread = D * 0.8;
          parts.push(line(-d / 2, 0, -d / 2, -thread, thin), line(d / 2, 0, d / 2, -thread, thin), line(-d / 2, -thread, d / 2, -thread));
        }
        parts.push(line(0, 2, 0, -D - tip - 2, center));
        return parts;
      }
      const parts = [circle(0, 0, hole / 2), ...crossLines(Math.max(hole, cb) / 2 + 3)];
      if (p.type === 'counterbore') parts.push(circle(0, 0, cb / 2));
      if (p.type === 'countersink') parts.push(circle(0, 0, cs / 2));
      if (p.type === 'tapped') parts.push(arc(0, 0, d / 2, 0, 270, thin));
      return parts;
    },
    info: (p) => ({ holeDiameter: p.type === 'tapped' ? p.size - METRIC[p.size].p : CLEARANCE[p.size][{ fine: 0, medium: 1, coarse: 2 }[p.fit]], ...(p.type === 'counterbore' ? { counterbore: COUNTERBORE[p.size] } : {}) }),
  },

  // ── pins, keys and rings
  dowelPin: {
    standard: 'ISO 8734',
    params: [num('diameter', 6, 1, 50, 0.5), num('length', 24, 3, 300, 1)],
    generate(p) {
      const r = p.diameter / 2;
      const c = Math.min(r * 0.25, p.length / 6);
      return [poly(mirrored([P(0, r - c), P(c, r), P(p.length - c, r), P(p.length, r - c)]), true), line(c, r, c, -r), line(p.length - c, r, p.length - c, -r), axis(-2, p.length + 2)];
    },
  },
  springPin: {
    standard: 'ISO 8752',
    params: [num('diameter', 6, 1, 50, 0.5), num('length', 24, 3, 300, 1), view(['side', 'top'])],
    generate(p) {
      const r = p.diameter / 2;
      const wall = Math.max(0.2, p.diameter * 0.1);
      if (p.view === 'top') {
        const gap = deg(Math.asin(Math.min(0.9, (p.diameter * 0.12) / r)));
        return [arc(0, 0, r, 90 + gap, 90 - gap + 360), arc(0, 0, r - wall, 90 + gap * 1.2, 90 - gap * 1.2 + 360), ...crossLines(r + 2)];
      }
      const c = Math.min(r * 0.3, p.length / 6);
      return [poly(mirrored([P(0, r - c), P(c, r), P(p.length - c, r), P(p.length, r - c)]), true), line(c, r * 0.15, p.length - c, r * 0.15, thin), line(c, -r * 0.15, p.length - c, -r * 0.15, thin), axis(-2, p.length + 2)];
    },
  },
  cotterPin: {
    standard: 'ISO 1234',
    params: [select('diameter', 3.2, [1, 1.6, 2, 2.5, 3.2, 4, 5, 6.3, 8]), num('length', 25, 6, 200, 1)],
    generate(p) {
      // Two half-round legs (each d/2 thick, side by side) bent into an eye of
      // outer diameter 2d at x ≤ 0; the lower leg is shorter by d.
      const d = p.diameter;
      const t = d / 2;
      const L = Math.max(p.length, 3 * d);
      const neck = 1.5 * d;
      return [
        arc(0, 0, d, 90, 270),
        arc(0, 0, t, 90, 270),
        line(0, d, neck, t), line(0, -d, neck, -t),
        line(0, t, neck, 0), line(0, -t, neck, 0),
        line(neck, t, L, t), line(neck, -t, L - d, -t),
        line(neck, 0, L, 0, thin), line(L, t, L, 0), line(L - d, -t, L - d, 0),
      ];
    },
  },
  parallelKey: {
    standard: 'DIN 6885 A',
    params: [select('width', 8, Object.keys(KEYS).map(Number)), num('length', 32, 6, 400, 1), view(['top', 'side'])],
    generate(p) {
      const b = p.width;
      const h = KEYS[b];
      const L = Math.max(p.length, b);
      if (p.view === 'side') return [rectangle(0, -h / 2, L, h / 2), axis(-2, L + 2)];
      const r = b / 2;
      const points = [...arcPoints(L - r, 0, r, -90, 90, 10), ...arcPoints(r, 0, r, 90, 270, 10)];
      return [poly(points, true), axis(-2, L + 2), line(r, -r - 2, r, r + 2, center), line(L - r, -r - 2, L - r, r + 2, center)];
    },
    info: (p) => ({ height: KEYS[p.width] }),
  },
  circlipShaft: {
    standard: 'DIN 471',
    params: [num('diameter', 20, 6, 200, 1)],
    generate(p) {
      const d = p.diameter;
      const groove = d * 0.95;
      const a = Math.max(1.5, d * 0.12);
      const ri = groove / 2 - 0.15;
      const ro = ri + a;
      const gap = deg(Math.asin(Math.min(0.9, (d * 0.18) / ro)));
      const lug = Math.max(1, d * 0.06);
      const parts = [arc(0, 0, ro, 90 + gap, 90 - gap + 360), arc(0, 0, ri, 90 + gap, 90 - gap + 360)];
      for (const side of [-1, 1]) {
        const angle = 90 + side * gap;
        const centreLug = polar(P(0, 0), ro + lug * 0.6, angle);
        parts.push(circle(centreLug.x, centreLug.y, lug * 1.3), circle(centreLug.x, centreLug.y, lug * 0.6));
      }
      return [...parts, ...crossLines(ro + 3)];
    },
    info: (p) => ({ grooveDiameter: p.diameter * 0.95 }),
  },
  circlipBore: {
    standard: 'DIN 472',
    params: [num('diameter', 30, 8, 300, 1)],
    generate(p) {
      const d = p.diameter;
      const groove = d * 1.05;
      const a = Math.max(1.5, d * 0.1);
      const ro = groove / 2 + 0.15;
      const ri = ro - a;
      const gap = deg(Math.asin(Math.min(0.9, (d * 0.16) / ro)));
      const lug = Math.max(1, d * 0.05);
      const parts = [arc(0, 0, ro, 90 + gap, 90 - gap + 360), arc(0, 0, ri, 90 + gap, 90 - gap + 360)];
      for (const side of [-1, 1]) {
        const centreLug = polar(P(0, 0), ri - lug * 0.6, 90 + side * gap);
        parts.push(circle(centreLug.x, centreLug.y, lug * 1.3), circle(centreLug.x, centreLug.y, lug * 0.6));
      }
      return [...parts, ...crossLines(ro + 3)];
    },
    info: (p) => ({ grooveDiameter: p.diameter * 1.05 }),
  },
  oRing: {
    standard: 'ISO 3601',
    params: [num('inner', 20, 1, 1000, 0.5), num('crossSection', 2.5, 0.5, 20, 0.1), view(['top', 'section'])],
    generate(p) {
      const r1 = p.inner / 2;
      const cs = p.crossSection;
      if (p.view === 'section') return [circle(0, r1 + cs / 2, cs / 2), circle(0, -r1 - cs / 2, cs / 2), axis(-cs * 2, cs * 2), line(0, -r1 - cs * 1.5, 0, r1 + cs * 1.5, center)];
      return [circle(0, 0, r1), circle(0, 0, r1 + cs), circle(0, 0, r1 + cs / 2, center), ...crossLines(r1 + cs + 2)];
    },
  },

  // ── gears and drives
  gear: {
    standard: 'ISO 53 / 54',
    params: [num('module', 2, 0.2, 20, 0.25), int('teeth', 20, 6, 300), num('pressureAngle', 20, 14.5, 30, 0.5, '°'), num('bore', 10, 0, 400, 1), bool('keyway', true), bool('pitchCircle', true)],
    generate(p) {
      const { points, rp, ra } = gearProfile(p);
      const bore = Math.min(p.bore, 2 * rp * 0.8);
      return [poly(points, true), ...boreOutline(bore, p.keyway), ...(p.pitchCircle ? [circle(0, 0, rp, center)] : []), ...crossLines(ra + p.module * 2)];
    },
    info: (p) => ({ pitch: p.module * p.teeth, outside: p.module * (p.teeth + 2), root: Math.max(p.module * p.teeth - 2.5 * p.module, p.module) }),
  },
  internalGear: {
    standard: 'ISO 53',
    params: [num('module', 2, 0.2, 20, 0.25), int('teeth', 48, 12, 400), num('pressureAngle', 20, 14.5, 30, 0.5, '°'), num('rim', 12, 2, 200, 1), bool('pitchCircle', true)],
    generate(p) {
      // The ring's bore is the outline of an "external gear" with the addendum and dedendum swapped.
      const { points, rp } = gearProfile({ ...p, addendum: 1.25, dedendum: 1 });
      const outer = rp + 1.25 * p.module + p.rim;
      return [circle(0, 0, outer), poly(points, true), ...(p.pitchCircle ? [circle(0, 0, rp, center)] : []), ...crossLines(outer + 3)];
    },
    info: (p) => ({ pitch: p.module * p.teeth, outsideRing: p.module * p.teeth + 2.5 * p.module + 2 * p.rim, root: p.module * p.teeth - 2 * p.module }),
  },
  rack: {
    standard: 'ISO 53',
    params: [num('module', 2, 0.2, 20, 0.25), int('teeth', 10, 1, 300), num('pressureAngle', 20, 14.5, 30, 0.5, '°'), num('height', 15, 1, 500, 1)],
    generate(p) {
      const m = p.module;
      const pitch = Math.PI * m;
      const t = Math.tan(rad(p.pressureAngle));
      const tip = Math.max(0.05 * pitch, pitch / 4 - m * t);
      const root = pitch / 4 + 1.25 * m * t;
      const points = [P(0, -1.25 * m)];
      for (let i = 0; i < p.teeth; i++) {
        const xc = (i + 0.5) * pitch;
        points.push(P(xc - root, -1.25 * m), P(xc - tip, m), P(xc + tip, m), P(xc + root, -1.25 * m));
      }
      const length = p.teeth * pitch;
      points.push(P(length, -1.25 * m), P(length, -1.25 * m - p.height), P(0, -1.25 * m - p.height));
      return [poly(points, true), line(-m * 2, 0, length + m * 2, 0, center)];
    },
    info: (p) => ({ pitchThread: Math.PI * p.module, length: Math.PI * p.module * p.teeth }),
  },
  sprocket: {
    standard: 'ISO 606',
    params: [select('chain', '08B', Object.keys(CHAINS)), int('teeth', 18, 8, 120), num('bore', 15, 0, 300, 1), bool('pitchCircle', true)],
    generate(p) {
      const [pitch, roller] = CHAINS[p.chain];
      const rp = pitch / (2 * Math.sin(Math.PI / p.teeth));
      const tip = rp + pitch * 0.625 - roller / 2;
      const outline = seatedWheel(p.teeth, rp, roller * 0.505, tip);
      return [poly(outline, true), ...boreOutline(Math.min(p.bore, rp), true), ...(p.pitchCircle ? [circle(0, 0, rp, center)] : []), ...crossLines(tip + 3)];
    },
    info: (p) => {
      const [pitch, roller] = CHAINS[p.chain];
      const rp = pitch / (2 * Math.sin(Math.PI / p.teeth));
      return { pitch: rp * 2, outside: 2 * (rp + pitch * 0.625 - roller / 2), chainPitch: pitch };
    },
  },
  timingPulley: {
    standard: 'GT2 · HTD · T5',
    params: [select('belt', 'GT2', Object.keys(BELTS)), int('teeth', 20, 10, 200), num('bore', 5, 0, 200, 0.5)],
    generate(p) {
      const [pitch, offset, depth] = BELTS[p.belt];
      const rp = (pitch * p.teeth) / (2 * Math.PI);
      const ro = rp - offset;
      const groove = Math.min(depth, pitch * 0.32);
      const outline = seatedWheel(p.teeth, ro, groove, ro, 88);
      return [poly(outline, true), circle(0, 0, rp, center), ...boreOutline(Math.min(p.bore, ro), false), ...crossLines(ro + 3)];
    },
    info: (p) => {
      const [pitch, offset] = BELTS[p.belt];
      const rp = (pitch * p.teeth) / (2 * Math.PI);
      return { pitch: rp * 2, outside: 2 * (rp - offset) };
    },
  },
  vPulley: {
    standard: 'ISO 4183',
    params: [select('section', 'A', Object.keys(V_BELTS)), num('diameter', 100, 30, 1000, 1), int('grooves', 2, 1, 8), num('bore', 20, 0, 300, 1)],
    generate(p) {
      const [top, depth] = V_BELTS[p.section];
      const spacing = top * 1.15 + 3;
      const edge = 8;
      const width = spacing * p.grooves + edge * 2 - (spacing - top);
      const R = p.diameter / 2 + depth * 0.3;
      const half = Math.tan(rad(19)) * depth;
      // Section through the axis: upper half profile with V grooves, mirrored below.
      const profile = [P(0, p.bore / 2), P(0, R)];
      for (let i = 0; i < p.grooves; i++) {
        const x0 = edge + i * spacing;
        profile.push(P(x0, R), P(x0 + (top / 2 - half), R - depth), P(x0 + top / 2 + half, R - depth), P(x0 + top, R));
      }
      profile.push(P(width, R), P(width, p.bore / 2));
      const top2 = profile;
      const bottom = top2.map((q) => P(q.x, -q.y)).reverse();
      return [poly(top2, false), poly(bottom, false), line(0, p.bore / 2, width, p.bore / 2), line(0, -p.bore / 2, width, -p.bore / 2), line(-3, 0, width + 3, 0, center)];
    },
    info: (p) => ({ outside: p.diameter + 2 * V_BELTS[p.section][1] * 0.3, width: (V_BELTS[p.section][0] * 1.15 + 3) * p.grooves + 16 - (V_BELTS[p.section][0] * 0.15 + 3) }),
  },
  worm: {
    standard: 'ISO 1122',
    params: [num('module', 2, 0.5, 12, 0.25), int('starts', 1, 1, 4), num('diameter', 20, 6, 200, 1), num('length', 50, 10, 500, 1)],
    generate(p) {
      const m = p.module;
      const pitch = Math.PI * m * p.starts;
      const rp = p.diameter / 2;
      const ra = rp + m;
      const rf = rp - 1.2 * m;
      const t = Math.tan(rad(20));
      const top = [P(0, rf)];
      for (let x = 0; x + pitch <= p.length + 1e-9; x += Math.PI * m) {
        const half = Math.PI * m;
        top.push(P(x + half * 0.25 - 1.25 * m * t, rf), P(x + half * 0.25 + m * t * 0.0, ra), P(x + half * 0.75, ra), P(x + half * 0.75 + 1.25 * m * t, rf));
      }
      top.push(P(p.length, rf));
      const bottom = top.map((q) => P(q.x + (Math.PI * m) / 2, -q.y)).filter((q) => q.x <= p.length);
      return [poly(top, false), poly(bottom, false), line(0, rf, 0, -rf), line(p.length, rf, p.length, -rf), line(0, rp, p.length, rp, center), line(0, -rp, p.length, -rp, center), axis(-3, p.length + 3)];
    },
    info: (p) => ({ lead: Math.PI * p.module * p.starts, outside: p.diameter + 2 * p.module }),
  },

  // ── bearings and shafts
  bearing: {
    standard: 'ISO 15 (60xx · 62xx · 63xx)',
    params: [select('series', 6204, Object.keys(BEARINGS).map(Number)), int('balls', 8, 5, 24), view(['front', 'section'])],
    generate(p) {
      const [d, D, B] = BEARINGS[p.series];
      const ring = (D - d) / 2;
      const rp = (d + D) / 4;
      const rb = Math.min(ring * 0.31, rp * Math.sin(Math.PI / p.balls) * 0.9);
      if (p.view === 'section') {
        const t = ring * 0.3;
        const parts = [];
        for (const s of [1, -1]) {
          parts.push(rectangle(0, s * (D / 2), B, s * (D / 2 - t)), rectangle(0, s * (d / 2), B, s * (d / 2 + t)), circle(B / 2, s * rp, rb));
        }
        return [...parts, line(-3, 0, B + 3, 0, center)];
      }
      const balls = Array.from({ length: p.balls }, (_, i) => {
        const c = polar(P(0, 0), rp, 90 + (i * 360) / p.balls);
        return circle(c.x, c.y, rb);
      });
      return [circle(0, 0, D / 2), circle(0, 0, D / 2 - ring * 0.3), circle(0, 0, d / 2 + ring * 0.3), circle(0, 0, d / 2), ...balls, circle(0, 0, rp, center), ...crossLines(D / 2 + 2)];
    },
    info: (p) => ({ bore: BEARINGS[p.series][0], outerDiameter: BEARINGS[p.series][1], width: BEARINGS[p.series][2] }),
  },
  bushing: {
    standard: 'ISO 4379 (DIN 1850)',
    params: [num('bore', 20, 2, 300, 0.5), num('outer', 26, 3, 320, 0.5), num('flange', 32, 0, 400, 0.5), num('flangeThickness', 3, 0, 50, 0.5), num('length', 20, 2, 300, 1)],
    generate(p) {
      const ri = p.bore / 2;
      const ro = Math.max(p.outer / 2, ri + 0.5);
      const rf = p.flange > p.outer && p.flangeThickness > 0 ? p.flange / 2 : ro;
      const t = rf > ro ? Math.min(p.flangeThickness, p.length / 2) : 0;
      // Section through the axis: both walls hatched-style outlines.
      const wall = (s) => poly([P(0, s * ri), P(0, s * rf), P(t, s * rf), P(t, s * ro), P(p.length, s * ro), P(p.length, s * ri)], true);
      return [wall(1), wall(-1), line(-3, 0, p.length + 3, 0, center)];
    },
  },
  shaft: {
    standard: '',
    params: [{ key: 'segments', type: 'text', def: '20x30, 30x50, 25x20, 20x30' }, num('chamfer', 1, 0, 20, 0.5)],
    generate(p) {
      const segments = parseSegments(p.segments);
      const c = p.chamfer;
      const top = [];
      let x = 0;
      segments.forEach(([diameter, length], index) => {
        const r = diameter / 2;
        const ch = Math.min(c, r / 2, length / 3);
        if (index === 0) top.push(P(0, r - ch), P(ch, r));
        else top.push(P(x, r));
        x += length;
        if (index === segments.length - 1) top.push(P(x - ch, r), P(x, r - ch));
        else top.push(P(x, r));
      });
      const outline = [...top, ...top.map((point) => P(point.x, -point.y)).reverse()];
      const extras = [];
      let at = 0;
      segments.forEach(([diameter, length], index) => {
        if (index > 0) {
          const smaller = Math.min(diameter, segments[index - 1][0]) / 2;
          extras.push(line(at, smaller, at, -smaller));
        }
        at += length;
      });
      const first = segments[0][0] / 2;
      const last = segments[segments.length - 1][0] / 2;
      const ch0 = Math.min(c, first / 2, segments[0][1] / 3);
      const ch1 = Math.min(c, last / 2, segments[segments.length - 1][1] / 3);
      if (ch0 > 0) extras.push(line(ch0, first, ch0, -first));
      if (ch1 > 0) extras.push(line(at - ch1, last, at - ch1, -last));
      return [poly(outline, true), ...extras, axis(-3, at + 3)];
    },
    info: (p) => ({ length: parseSegments(p.segments).reduce((sum, [, length]) => sum + length, 0) }),
  },
  flange: {
    standard: 'EN 1092-1',
    params: [num('outer', 120, 10, 2000, 1), num('bore', 40, 1, 1500, 1), num('pcd', 90, 5, 1900, 1), int('holes', 6, 2, 36), num('holeDia', 11, 1, 100, 0.5)],
    generate(p) {
      const outer = p.outer;
      const bore = Math.min(p.bore, outer - 4);
      const pcd = Math.min(Math.max(p.pcd, bore + p.holeDia + 1), outer - p.holeDia - 1);
      const holes = Array.from({ length: p.holes }, (_, i) => {
        const c = polar(P(0, 0), pcd / 2, 90 + (i * 360) / p.holes);
        return [circle(c.x, c.y, p.holeDia / 2), line(c.x - p.holeDia * 0.7, c.y, c.x + p.holeDia * 0.7, c.y, center), line(c.x, c.y - p.holeDia * 0.7, c.x, c.y + p.holeDia * 0.7, center)];
      }).flat();
      return [circle(0, 0, outer / 2), circle(0, 0, bore / 2), circle(0, 0, pcd / 2, center), ...holes, ...crossLines(outer / 2 + 3)];
    },
  },

  // ── springs
  spring: {
    standard: 'ISO 2162 (compression)',
    params: [num('wire', 2, 0.2, 50, 0.1), num('diameter', 20, 2, 500, 1), num('length', 50, 5, 2000, 1), int('coils', 6, 2, 60)],
    generate(p) { return coilSide(p.wire, p.diameter, p.length, p.coils).parts; },
    info: (p) => ({ pitchThread: (Math.max(p.length, p.wire * (p.coils + 1)) - p.wire) / p.coils }),
  },
  extensionSpring: {
    standard: 'ISO 2162 (extension)',
    params: [num('wire', 1.5, 0.2, 50, 0.1), num('diameter', 12, 2, 500, 1), int('coils', 10, 2, 80)],
    generate(p) {
      const d = Math.min(p.wire, p.diameter / 3);
      const length = d * (p.coils + 1);
      const { parts, L, r } = coilSide(d, p.diameter, length, p.coils, { closedEnds: false });
      // Full loops (hooks) at both ends.
      // Full loops (hooks) at both ends, joined to the first and last coil.
      const hook = r * 0.85;
      parts.push(
        arc(-hook + d / 2, r - hook, hook, 90, 270), arc(-hook + d / 2, r - hook, hook - d, 90, 270), line(-hook + d / 2, r, d / 2, r), line(-hook + d / 2, r - d, d / 2, r - d),
        arc(L + hook - d / 2, r - hook, hook, 270, 90), arc(L + hook - d / 2, r - hook, hook - d, 270, 90), line(L - d / 2, r, L + hook - d / 2, r), line(L - d / 2, r - d, L + hook - d / 2, r - d),
      );
      return parts;
    },
    info: (p) => ({ length: Math.min(p.wire, p.diameter / 3) * (p.coils + 1) + p.diameter }),
  },
  torsionSpring: {
    standard: 'ISO 2162 (torsion)',
    params: [num('wire', 1.5, 0.2, 50, 0.1), num('diameter', 14, 2, 500, 1), int('coils', 5, 2, 60), num('legLength', 25, 2, 500, 1)],
    generate(p) {
      const d = Math.min(p.wire, p.diameter / 3);
      const length = d * (p.coils + 1);
      const { parts, L, r } = coilSide(d, p.diameter, length, p.coils, { closedEnds: false });
      parts.push(rectangle(-p.legLength, r - d, d / 2, r), rectangle(L - d / 2, -r, L + p.legLength, -r + d));
      return parts;
    },
  },

  // ── structural profiles (cross-sections)
  extrusion: {
    standard: 'T-slot (20 · 30 · 40 · 45)',
    params: [select('size', 20, Object.keys(EXTRUSIONS).map(Number))],
    generate(p) {
      const a = p.size;
      const h = a / 2;
      const w = EXTRUSIONS[a] / 2;
      const neck = a * 0.08;
      const slotDepth = a * 0.3;
      const wide = w * 1.85;
      // One side's T-slot (local: the side lies on y = h), then the four sides rotated.
      const side = [P(-h, h), P(-w, h), P(-w, h - neck), P(-wide, h - neck * 1.4), P(-wide * 0.6, h - slotDepth), P(wide * 0.6, h - slotDepth), P(wide, h - neck * 1.4), P(w, h - neck), P(w, h)];
      const rotate = (q, angle) => P(q.x * Math.cos(rad(angle)) - q.y * Math.sin(rad(angle)), q.x * Math.sin(rad(angle)) + q.y * Math.cos(rad(angle)));
      const outline = [0, -90, -180, -270].flatMap((angle) => side.map((q) => rotate(q, angle)));
      return [poly(roundCorners(outline, outline.map((_, i) => (i % side.length === 0 ? a * 0.04 : 0))), true), circle(0, 0, a * 0.21 / 2), ...crossLines(h + 3)];
    },
  },
  iBeam: {
    standard: 'IPE (EN 10365)',
    params: [select('size', 100, Object.keys(IPE).map(Number))],
    generate(p) {
      const [h, b, tw, tf, r] = IPE[p.size];
      const y = h / 2;
      const x = b / 2;
      const points = [P(-x, -y), P(x, -y), P(x, -y + tf), P(tw / 2, -y + tf), P(tw / 2, y - tf), P(x, y - tf), P(x, y), P(-x, y), P(-x, y - tf), P(-tw / 2, y - tf), P(-tw / 2, -y + tf), P(-x, -y + tf)];
      const radii = [0, 0, 0, r, r, 0, 0, 0, 0, r, r, 0];
      return [poly(roundCorners(points, radii), true), ...crossLines(Math.max(x, y) + 3)];
    },
    info: (p) => ({ height: IPE[p.size][0], width: IPE[p.size][1] }),
  },
  channel: {
    standard: 'UPN (EN 10365)',
    params: [select('size', 100, Object.keys(UPN).map(Number))],
    generate(p) {
      const [h, b, tw, tf] = UPN[p.size];
      const y = h / 2;
      const points = [P(0, -y), P(b, -y), P(b, -y + tf), P(tw, -y + tf), P(tw, y - tf), P(b, y - tf), P(b, y), P(0, y)];
      return [poly(roundCorners(points, [0, 0, tf / 2, tf, tf, tf / 2, 0, 0]), true), line(-3, 0, b + 3, 0, center)];
    },
    info: (p) => ({ height: UPN[p.size][0], width: UPN[p.size][1] }),
  },
  angle: {
    standard: 'L (EN 10056)',
    params: [num('size', 40, 10, 300, 1), num('thickness', 4, 1, 40, 0.5)],
    generate(p) {
      const a = p.size;
      const t = Math.min(p.thickness, a / 2);
      return [poly(roundCorners([P(0, 0), P(a, 0), P(a, t), P(t, t), P(t, a), P(0, a)], [0, 0, t / 2, t, t / 2, 0]), true)];
    },
  },
  rectTube: {
    standard: 'EN 10219',
    params: [num('width', 40, 5, 500, 1), num('height', 20, 5, 500, 1), num('thickness', 2, 0.5, 30, 0.5)],
    generate(p) {
      const w = p.width / 2;
      const h = p.height / 2;
      const t = Math.min(p.thickness, w / 2, h / 2);
      return [
        poly(roundCorners([P(-w, -h), P(w, -h), P(w, h), P(-w, h)], 2 * t), true),
        poly(roundCorners([P(-w + t, -h + t), P(w - t, -h + t), P(w - t, h - t), P(-w + t, h - t)], t), true),
        ...crossLines(Math.max(w, h) + 3),
      ];
    },
  },
  roundTube: {
    standard: 'EN 10219',
    params: [num('diameter', 30, 2, 1000, 0.5), num('thickness', 2, 0.2, 50, 0.1)],
    generate(p) {
      return [circle(0, 0, p.diameter / 2), circle(0, 0, Math.max(0.1, p.diameter / 2 - p.thickness)), ...crossLines(p.diameter / 2 + 3)];
    },
  },
  slot: {
    standard: '',
    params: [num('length', 40, 0, 2000, 1), num('width', 12, 0.5, 500, 0.5)],
    generate(p) {
      const r = p.width / 2;
      const h = p.length / 2;
      const points = [...arcPoints(h, 0, r, -90, 90, 10), ...arcPoints(-h, 0, r, 90, 270, 10)];
      return [poly(points, true), line(-h - r - 2, 0, h + r + 2, 0, center), line(-h, -r - 2, -h, r + 2, center), line(h, -r - 2, h, r + 2, center)];
    },
  },
};

export const PART_KINDS = Object.values(PART_CATEGORIES).flat();
export const categoryOf = (kind) => Object.keys(PART_CATEGORIES).find((category) => PART_CATEGORIES[category].includes(kind)) ?? 'fasteners';

/** "20x30, 30x50" → [[20, 30], [30, 50]] (diameter × length), invalid items skipped. */
export function parseSegments(text) {
  const segments = String(text ?? '')
    .split(/[,;\n]/)
    .map((item) => item.trim().toLowerCase().split(/\s*[x×*]\s*/).map(Number))
    .filter((pair) => pair.length === 2 && pair.every((n) => Number.isFinite(n) && n > 0))
    .slice(0, 40);
  return segments.length ? segments : [[20, 50]];
}

export function defaultParams(kind) {
  const definition = PARTS[kind];
  if (!definition) throw new Error(`unknown part ${kind}`);
  return Object.fromEntries(definition.params.map((param) => [param.key, param.def]));
}

/** Fills missing parameters and keeps every value in its range (select values must be listed). */
export function normalizeParams(kind, raw = {}) {
  const definition = PARTS[kind];
  if (!definition) throw new Error(`unknown part ${kind}`);
  const out = {};
  for (const param of definition.params) {
    const value = raw?.[param.key];
    if (param.type === 'bool') out[param.key] = typeof value === 'boolean' ? value : param.def;
    else if (param.type === 'text') out[param.key] = typeof value === 'string' && value.trim() ? value : param.def;
    else if (param.type === 'select') out[param.key] = param.options.find((option) => String(option) === String(value)) ?? param.def;
    else {
      let number = Number(value);
      if (!Number.isFinite(number)) number = param.def;
      number = Math.min(param.max, Math.max(param.min, number));
      out[param.key] = param.type === 'int' ? Math.round(number) : number;
    }
  }
  return out;
}

/** The part's primitives in its own coordinates. */
export function generatePart(kind, params) {
  return PARTS[kind].generate(normalizeParams(kind, params));
}

/** Derived values shown next to the parameters (pitch diameter, …). */
export function partInfo(kind, params) {
  return PARTS[kind]?.info?.(normalizeParams(kind, params)) ?? {};
}

/** Label of a select option: numbers as they are (with the unit), words through i18n keys "opt.<value>". */
export const optionIsWord = (option) => typeof option === 'string' && !/^\d/.test(option) && !/^[A-Z0-9]+$/.test(option);
