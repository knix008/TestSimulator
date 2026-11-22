// The standard parts library: size tables of common ISO / DIN machine elements and parametric solids built
// from them on the kernel. Every part is modelled about the +Z axis (Z up):
//   bolts / screws  head on top (z 0 … k), shank down to z = −L; the head's underside is at z = 0
//                   (countersunk screws: the head's top is at z = 0, flush with the surface it sits in)
//   set screws      z −L … 0 (the socket / slot end at z = 0)
//   studs           the metal end below z = 0 (−bm … 0), the nut end above it (0 … l)
//   nuts, washers, rings, pins, keys, gears, pulleys, bearings, flanges   z 0 … thickness (pins: 0 … L)
//   racks           along +X, pitch line at y = 0, face width along +Z
//   elbows          inlet at the origin along +Z, bending toward +X; tees: run along X, branch along +Z
//
// Threads are cosmetic by default (the shank at the nominal diameter, a nut's bore at the minor diameter D1;
// the view and the drawings show the thread the standard way) or modelled (`modelled: true`): the ISO 68-1 /
// ISO 965-1 thread swept exactly along the screw (threads.js), slower to build and to show.
//
// Values are the nominal ones of the standards (ISO 4017 / 4762 / 10642 / 7380 / 4026 / 4029 / 4766, DIN 938 /
// 939, ISO 4032 / 4033 / 4035 / 7040, ISO 7089, DIN 127 B, ISO 15 series 60 / 62 with the catalogue ball sets,
// ISO 8734 / 2338 / 8752, DIN 471 / 472, DIN 6885 A, ISO 53 / 54 gears, DIN 7721 pulleys, ISO 4200 pipe,
// ASME B16.9 elbow / tee lengths, EN 1092-1 PN16 type 11 flanges). No DOM.
import { rep } from './kernel.js';
import { threadSolid, isoThread, cosmeticThread, threadFrame, externalRunoutCore } from './threads.js';
import { gearProfile, profilePolygon, helicalTransverse, bevelSphericalSection, bevelGeometry, rackOutline, pulleyProfile, pulleyGeometry, PULLEY_PROFILES } from './gears.js';

// ───────────────────────── tables

/** Metric coarse thread sizes: d, pitch, ISO 273 clearance hole (fine / medium / coarse), tap drill. */
export const METRIC = {
  M3: { d: 3, p: 0.5, fine: 3.2, medium: 3.4, coarse: 3.6, tap: 2.5 },
  M4: { d: 4, p: 0.7, fine: 4.3, medium: 4.5, coarse: 4.8, tap: 3.3 },
  M5: { d: 5, p: 0.8, fine: 5.3, medium: 5.5, coarse: 5.8, tap: 4.2 },
  M6: { d: 6, p: 1, fine: 6.4, medium: 6.6, coarse: 7, tap: 5 },
  M8: { d: 8, p: 1.25, fine: 8.4, medium: 9, coarse: 10, tap: 6.8 },
  M10: { d: 10, p: 1.5, fine: 10.5, medium: 11, coarse: 12, tap: 8.5 },
  M12: { d: 12, p: 1.75, fine: 13, medium: 13.5, coarse: 14.5, tap: 10.2 },
  M16: { d: 16, p: 2, fine: 17, medium: 17.5, coarse: 18.5, tap: 14 },
  M20: { d: 20, p: 2.5, fine: 21, medium: 22, coarse: 24, tap: 17.5 },
  M24: { d: 24, p: 3, fine: 25, medium: 26, coarse: 28, tap: 21 },
};
export const METRIC_SIZES = Object.keys(METRIC);
const sizesFrom = (a, b) => METRIC_SIZES.slice(METRIC_SIZES.indexOf(a), METRIC_SIZES.indexOf(b) + 1);

/** ISO 4017 hex head: s (across flats), k (head height), e (across corners, = s / cos 30°). */
export const HEX_BOLT = {
  M3: { s: 5.5, k: 2 }, M4: { s: 7, k: 2.8 }, M5: { s: 8, k: 3.5 }, M6: { s: 10, k: 4 }, M8: { s: 13, k: 5.3 },
  M10: { s: 16, k: 6.4 }, M12: { s: 18, k: 7.5 }, M16: { s: 24, k: 10 }, M20: { s: 30, k: 12.5 }, M24: { s: 36, k: 15 },
};

/** ISO 4762 socket head cap screw: dk (head diameter), k (head height = d), s (hex socket), t (socket depth). */
export const SOCKET_CAP = {
  M3: { dk: 5.5, k: 3, s: 2.5, t: 1.3 }, M4: { dk: 7, k: 4, s: 3, t: 2 }, M5: { dk: 8.5, k: 5, s: 4, t: 2.5 }, M6: { dk: 10, k: 6, s: 5, t: 3 },
  M8: { dk: 13, k: 8, s: 6, t: 4 }, M10: { dk: 16, k: 10, s: 8, t: 5 }, M12: { dk: 18, k: 12, s: 10, t: 6 }, M16: { dk: 24, k: 16, s: 14, t: 8 },
  M20: { dk: 30, k: 20, s: 17, t: 10 }, M24: { dk: 36, k: 24, s: 19, t: 12 },
};

/** ISO 10642 hex socket countersunk head screw (90° head): dk (theoretical), k (head height), s, t. */
export const COUNTERSUNK = {
  M3: { dk: 6.72, k: 1.86, s: 2, t: 1.1 }, M4: { dk: 8.96, k: 2.48, s: 2.5, t: 1.5 }, M5: { dk: 11.2, k: 3.1, s: 3, t: 1.9 }, M6: { dk: 13.44, k: 3.72, s: 4, t: 2.2 },
  M8: { dk: 17.92, k: 4.96, s: 5, t: 3 }, M10: { dk: 22.4, k: 6.2, s: 6, t: 3.6 }, M12: { dk: 26.88, k: 7.44, s: 8, t: 4.3 }, M16: { dk: 33.6, k: 8.8, s: 10, t: 4.5 },
  M20: { dk: 40.32, k: 10.16, s: 12, t: 4.8 },
};

/** ISO 7380-1 hex socket button head screw: dk, k, s, t. */
export const BUTTON_HEAD = {
  M3: { dk: 5.7, k: 1.65, s: 2, t: 1.04 }, M4: { dk: 7.6, k: 2.2, s: 2.5, t: 1.3 }, M5: { dk: 9.5, k: 2.75, s: 3, t: 1.56 }, M6: { dk: 10.5, k: 3.3, s: 4, t: 2.08 },
  M8: { dk: 14, k: 4.4, s: 5, t: 2.6 }, M10: { dk: 17.5, k: 5.5, s: 6, t: 3.12 }, M12: { dk: 21, k: 6.6, s: 8, t: 4.16 }, M16: { dk: 28, k: 8.8, s: 10, t: 5.2 },
};

/**
 * Set screws: ISO 4026 / 4029 hex socket (s, t min for short lengths, tl min for the other lengths), ISO 4766
 * slotted (n slot width, ts slot depth min), dp flat point (max), dz cup (max).
 * Sources: ISO 4026:1993 Table 1 (s, t, footnotes 4 / 5), ISO 4029:2003 Table 1 (dz), ISO 4766:2011 Table 1
 * (n, t, dp) — the iteh.ai sample PDFs; dp for M16–M24 from the Westfield ISO 4026 sheet.
 */
export const SET_SCREW = {
  M3: { s: 1.5, t: 1.2, tl: 2, n: 0.4, ts: 0.8, dp: 2, dz: 1.4 }, M4: { s: 2, t: 1.5, tl: 2.5, n: 0.6, ts: 1.12, dp: 2.5, dz: 2 }, M5: { s: 2.5, t: 2, tl: 3, n: 0.8, ts: 1.28, dp: 3.5, dz: 2.5 },
  M6: { s: 3, t: 2, tl: 3.5, n: 1, ts: 1.6, dp: 4, dz: 3 }, M8: { s: 4, t: 3, tl: 5, n: 1.2, ts: 2, dp: 5.5, dz: 5 }, M10: { s: 5, t: 4, tl: 6, n: 1.6, ts: 2.4, dp: 7, dz: 6 },
  M12: { s: 6, t: 4.8, tl: 8, n: 2, ts: 2.8, dp: 8.5, dz: 8 }, M16: { s: 8, t: 6.4, tl: 10, dp: 12, dz: 10 }, M20: { s: 10, t: 8, tl: 12, dp: 15, dz: 14 },
  M24: { s: 12, t: 10, tl: 15, dp: 18, dz: 16 },
};

/** ISO 4032 hex nut: s, m (height). */
export const HEX_NUT = {
  M3: { s: 5.5, m: 2.4 }, M4: { s: 7, m: 3.2 }, M5: { s: 8, m: 4.7 }, M6: { s: 10, m: 5.2 }, M8: { s: 13, m: 6.8 },
  M10: { s: 16, m: 8.4 }, M12: { s: 18, m: 10.8 }, M16: { s: 24, m: 14.8 }, M20: { s: 30, m: 18 }, M24: { s: 36, m: 21.5 },
};
/** ISO 4035 thin nut heights. */
export const THIN_NUT = { M3: 1.8, M4: 2.2, M5: 2.7, M6: 3.2, M8: 4, M10: 5, M12: 6, M16: 8, M20: 10, M24: 12 };
/** ISO 4033 style 2 hex nut heights. */
export const HEX_NUT2 = { M5: 5.1, M6: 5.7, M8: 7.5, M10: 9.3, M12: 12, M16: 16.4, M20: 20.3, M24: 23.9 };
/** ISO 7040 prevailing-torque nut with a nylon insert: h (overall height), m (the threaded hex part). */
export const NYLON_NUT = {
  M3: { h: 4.5, m: 3 }, M4: { h: 6, m: 4 }, M5: { h: 6.8, m: 4.8 }, M6: { h: 8, m: 5.4 }, M8: { h: 9.5, m: 7.14 },
  M10: { h: 11.5, m: 8.94 }, M12: { h: 14, m: 11.57 }, M16: { h: 18, m: 15.7 }, M20: { h: 22, m: 19 }, M24: { h: 26.5, m: 22.6 },
};

/** ISO 7089 plain washer: d1 (hole), d2 (outside), h. */
export const FLAT_WASHER = {
  M3: { d1: 3.2, d2: 7, h: 0.5 }, M4: { d1: 4.3, d2: 9, h: 0.8 }, M5: { d1: 5.3, d2: 10, h: 1 }, M6: { d1: 6.4, d2: 12, h: 1.6 },
  M8: { d1: 8.4, d2: 16, h: 1.6 }, M10: { d1: 10.5, d2: 20, h: 2 }, M12: { d1: 13, d2: 24, h: 2.5 }, M16: { d1: 17, d2: 30, h: 3 },
  M20: { d1: 21, d2: 37, h: 3 }, M24: { d1: 25, d2: 44, h: 4 },
};

/** DIN 127 B spring lock washer: d1, d2, s (section thickness), h (free height, the minimum = 2 s). Source: Westfield DIN 127 sheet (h min / max). */
export const SPRING_WASHER = {
  M3: { d1: 3.1, d2: 6.2, s: 0.8, h: 1.6 }, M4: { d1: 4.1, d2: 7.6, s: 0.9, h: 1.8 }, M5: { d1: 5.1, d2: 9.2, s: 1.2, h: 2.4 }, M6: { d1: 6.1, d2: 11.8, s: 1.6, h: 3.2 },
  M8: { d1: 8.1, d2: 14.8, s: 2, h: 4 }, M10: { d1: 10.2, d2: 18.1, s: 2.2, h: 4.4 }, M12: { d1: 12.2, d2: 21.1, s: 2.5, h: 5 }, M16: { d1: 16.2, d2: 27.4, s: 3.5, h: 7 },
  M20: { d1: 20.2, d2: 33.6, s: 4, h: 8 }, M24: { d1: 24.5, d2: 40, s: 5, h: 10 },
};

/** Preferred bolt / screw lengths (ISO 888) and the range each size comes in. */
export const BOLT_LENGTHS = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200];
const LENGTH_RANGE = { M3: [6, 30], M4: [6, 40], M5: [8, 50], M6: [10, 60], M8: [12, 80], M10: [16, 100], M12: [20, 120], M16: [30, 160], M20: [40, 200], M24: [50, 200] };
export const boltLengths = (size) => { const [a, b] = LENGTH_RANGE[size] ?? [6, 200]; return BOLT_LENGTHS.filter((l) => l >= a && l <= b); };
const ranged = (table) => (size) => { const [a, b] = table[size] ?? [6, 200]; return BOLT_LENGTHS.filter((l) => l >= a && l <= b); };
const CSK_RANGE = { M3: [8, 30], M4: [8, 40], M5: [8, 50], M6: [8, 60], M8: [10, 80], M10: [12, 100], M12: [20, 100], M16: [30, 100], M20: [35, 100] };
const BUTTON_RANGE = { M3: [6, 16], M4: [6, 20], M5: [8, 30], M6: [8, 30], M8: [10, 40], M10: [12, 40], M12: [16, 50], M16: [20, 50] };
const STUD_RANGE = { M5: [16, 60], M6: [20, 80], M8: [20, 100], M10: [25, 120], M12: [30, 150], M16: [40, 200], M20: [50, 200], M24: [60, 200] };
export const SET_LENGTHS = [3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const SET_RANGE = { M3: [3, 16], M4: [4, 20], M5: [5, 25], M6: [6, 30], M8: [8, 40], M10: [10, 50], M12: [12, 60], M16: [16, 60], M20: [20, 60], M24: [25, 60] };
const setLengths = (size) => { const [a, b] = SET_RANGE[size] ?? [3, 60]; return SET_LENGTHS.filter((l) => l >= a && l <= b); };

/** Deep-groove ball bearings (ISO 15, series 60 and 62): d (bore), D (outside), B (width), r (chamfer). */
export const BEARINGS = {
  6000: { d: 10, D: 26, B: 8, r: 0.3 }, 6001: { d: 12, D: 28, B: 8, r: 0.3 }, 6002: { d: 15, D: 32, B: 9, r: 0.3 }, 6003: { d: 17, D: 35, B: 10, r: 0.3 },
  6004: { d: 20, D: 42, B: 12, r: 0.6 }, 6005: { d: 25, D: 47, B: 12, r: 0.6 }, 6006: { d: 30, D: 55, B: 13, r: 1 },
  6200: { d: 10, D: 30, B: 9, r: 0.6 }, 6201: { d: 12, D: 32, B: 10, r: 0.6 }, 6202: { d: 15, D: 35, B: 11, r: 0.6 }, 6203: { d: 17, D: 40, B: 12, r: 0.6 },
  6204: { d: 20, D: 47, B: 14, r: 1 }, 6205: { d: 25, D: 52, B: 15, r: 1 }, 6206: { d: 30, D: 62, B: 16, r: 1 },
};
export const BEARING_SIZES = Object.keys(BEARINGS);
/**
 * The ball sets of the series (catalogue internal geometry): [count Z, ball diameter Dw, pitch circle dm].
 * Source: GMN deep-groove bearing internal geometry table (gmn.de); 6204 cross-checked with NSK (Z 8, Dw 7.938).
 * Ball sets differ slightly between makers.
 */
export const BEARING_BALLS = {
  6000: [7, 4.762, 18], 6001: [8, 4.762, 20], 6002: [9, 4.762, 23.5], 6003: [10, 4.762, 26], 6004: [9, 6.35, 31], 6005: [10, 6.35, 36], 6006: [11, 7.144, 42.5],
  6200: [7, 5.556, 20], 6201: [7, 5.953, 22], 6202: [8, 5.953, 25.3], 6203: [8, 6.747, 28.5], 6204: [8, 7.938, 33.5], 6205: [9, 7.938, 39.1], 6206: [9, 9.525, 46],
};

/** ISO 8734 dowel pin / ISO 2338 parallel pin / ISO 8752 spring pin diameters and lengths. */
export const PIN_DIAMETERS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20];
export const PIN_LENGTHS = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 100];
export const pinLengths = (d) => PIN_LENGTHS.filter((l) => l >= Math.max(6, d * 1.5) && l <= Math.max(20, d * 6));
/** ISO 2338 end chamfer c. */
export const PARALLEL_PIN_C = { 2: 0.35, 3: 0.5, 4: 0.63, 5: 0.8, 6: 1.2, 8: 1.6, 10: 2, 12: 2.5, 16: 3, 20: 3.5 };
/**
 * ISO 8752:2009 heavy-duty spring pin (Table 1): s (wall), d1 before fitting (min / max), chamfer length a (min /
 * max). The standard leaves the slot's width to the supplier and asks only that it does not close when the pin
 * is driven into the smallest hole (H12 at the nominal size): the pin is modelled free, at the mean free
 * diameter, its gap the circumference the fitting takes away (π (d1 − d)) plus 30 % so it stays open.
 */
export const SPRING_PIN = {
  2: { s: 0.4, d1: [2.3, 2.4], a: [0.35, 0.55] }, 3: { s: 0.6, d1: [3.3, 3.5], a: [0.5, 0.7] }, 4: { s: 0.8, d1: [4.4, 4.6], a: [0.65, 0.85] },
  5: { s: 1, d1: [5.4, 5.6], a: [0.9, 1.1] }, 6: { s: 1.2, d1: [6.4, 6.7], a: [1.2, 1.4] }, 8: { s: 1.5, d1: [8.5, 8.8], a: [1.6, 2] },
  10: { s: 2, d1: [10.5, 10.8], a: [2, 2.4] }, 12: { s: 2.5, d1: [12.5, 12.8], a: [2, 2.4] }, 16: { s: 3, d1: [16.5, 16.8], a: [2, 2.4] }, 20: { s: 4, d1: [20.5, 20.9], a: [3, 3.4] },
};
/** A spring pin's free diameter, slot gap and chamfer (see SPRING_PIN). */
export function springPinGeometry(d) {
  const g = SPRING_PIN[d];
  const free = (g.d1[0] + g.d1[1]) / 2;
  return { ...g, free, gap: Math.PI * (free - d) * 1.3, chamfer: (g.a[0] + g.a[1]) / 2 };
}

/** DIN 471 external retaining rings (for shafts d1): s (thickness), d3 (inside, free), a (lug height), b (radial width at the back), d5 (lug hole). */
export const RETAINING_RINGS = {
  10: { s: 1, d3: 9.3, a: 3.3, b: 1.8, d5: 1.2 }, 12: { s: 1, d3: 11, a: 3.3, b: 1.8, d5: 1.2 }, 15: { s: 1, d3: 13.8, a: 3.6, b: 2.2, d5: 1.7 },
  17: { s: 1, d3: 15.7, a: 3.8, b: 2.3, d5: 1.7 }, 20: { s: 1.2, d3: 18.5, a: 4, b: 2.6, d5: 2 }, 25: { s: 1.2, d3: 23.2, a: 4.4, b: 3, d5: 2 },
  30: { s: 1.5, d3: 27.9, a: 5, b: 3.5, d5: 2 }, 35: { s: 1.5, d3: 32.2, a: 5.6, b: 3.9, d5: 2.5 }, 40: { s: 1.75, d3: 36.5, a: 6, b: 4.4, d5: 2.5 },
};
export const RING_SIZES = Object.keys(RETAINING_RINGS);
/** DIN 472 internal retaining rings (for bores d1): s, d3 (outside, free), a, b, d5. */
export const BORE_RINGS = {
  10: { s: 1, d3: 10.8, a: 3.2, b: 1.4, d5: 1.2 }, 12: { s: 1, d3: 13, a: 3.4, b: 1.7, d5: 1.5 }, 15: { s: 1, d3: 16.2, a: 3.7, b: 2, d5: 1.7 },
  17: { s: 1, d3: 18.3, a: 3.9, b: 2.1, d5: 1.7 }, 20: { s: 1, d3: 21.5, a: 4.1, b: 2.3, d5: 2 }, 25: { s: 1.2, d3: 26.9, a: 4.5, b: 2.7, d5: 2 },
  30: { s: 1.2, d3: 32.1, a: 4.8, b: 3, d5: 2 }, 35: { s: 1.5, d3: 37.8, a: 5.4, b: 3.4, d5: 2.5 }, 40: { s: 1.75, d3: 43.5, a: 5.8, b: 3.9, d5: 2.5 },
};
export const BORE_RING_SIZES = Object.keys(BORE_RINGS);

/** DIN 6885 A parallel keys: b × h, shaft range (over / up to), keyway depths t1 (shaft) and t2 (hub). */
export const KEYS = {
  '2x2': { b: 2, h: 2, shaft: [6, 8], t1: 1.2, t2: 1 }, '3x3': { b: 3, h: 3, shaft: [8, 10], t1: 1.8, t2: 1.4 }, '4x4': { b: 4, h: 4, shaft: [10, 12], t1: 2.5, t2: 1.8 },
  '5x5': { b: 5, h: 5, shaft: [12, 17], t1: 3, t2: 2.3 }, '6x6': { b: 6, h: 6, shaft: [17, 22], t1: 3.5, t2: 2.8 }, '8x7': { b: 8, h: 7, shaft: [22, 30], t1: 4, t2: 3.3 },
  '10x8': { b: 10, h: 8, shaft: [30, 38], t1: 5, t2: 3.3 }, '12x8': { b: 12, h: 8, shaft: [38, 44], t1: 5, t2: 3.3 }, '14x9': { b: 14, h: 9, shaft: [44, 50], t1: 5.5, t2: 3.8 },
  '16x10': { b: 16, h: 10, shaft: [50, 58], t1: 6, t2: 4.3 }, '18x11': { b: 18, h: 11, shaft: [58, 65], t1: 7, t2: 4.4 }, '20x12': { b: 20, h: 12, shaft: [65, 75], t1: 7.5, t2: 4.9 },
};
export const KEY_SIZES = Object.keys(KEYS);
export const KEY_LENGTHS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50, 56, 63, 70, 80, 90, 100];
export const keyLengths = (size) => { const k = KEYS[size]; return KEY_LENGTHS.filter((l) => l >= k.b * 1.5 && l <= k.b * 10); };
/** The key for a shaft diameter (DIN 6885 shaft ranges), or null. */
export const keyForShaft = (d) => KEY_SIZES.find((s) => d > KEYS[s].shaft[0] && d <= KEYS[s].shaft[1]) ?? null;

/** Gear modules (ISO 54, first choice). */
export const GEAR_MODULES = [0.5, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
export const PULLEY_SIZES = Object.keys(PULLEY_PROFILES);

/**
 * Pipe (ISO 4200 / ASME B36.10 Sch 40): outside diameter, wall; B16.9 long-radius elbow and tee centre-to-end;
 * EN 1092-1 PN16 type 11 weld-neck flange: D, K (bolt circle), n × L (holes), C (plate), N (hub at the plate),
 * H (overall), d1 / f1 (raised face B1), R1 (hub fillet), H2 (straight weld end), S (wall at the weld end: the
 * bore is A − 2S). Source: wermac.org EN 1092-1 / DIN 2633 PN16 weld-neck table (A … R columns).
 */
export const PIPES = {
  DN15: { od: 21.3, wall: 2.77, elbow: 38.1, tee: 25.4, flange: { D: 95, K: 65, n: 4, L: 14, C: 16, N: 32, H: 38, d1: 45, f1: 2, R1: 4, H2: 6, S: 2.0 } },
  DN20: { od: 26.9, wall: 2.87, elbow: 28.6, tee: 28.6, flange: { D: 105, K: 75, n: 4, L: 14, C: 18, N: 39, H: 40, d1: 58, f1: 2, R1: 4, H2: 6, S: 2.3 } },
  DN25: { od: 33.7, wall: 3.38, elbow: 38.1, tee: 38.1, flange: { D: 115, K: 85, n: 4, L: 14, C: 18, N: 46, H: 40, d1: 68, f1: 2, R1: 4, H2: 6, S: 2.6 } },
  DN32: { od: 42.4, wall: 3.56, elbow: 47.8, tee: 47.6, flange: { D: 140, K: 100, n: 4, L: 18, C: 18, N: 56, H: 42, d1: 78, f1: 2, R1: 6, H2: 6, S: 2.6 } },
  DN40: { od: 48.3, wall: 3.68, elbow: 57.2, tee: 57.2, flange: { D: 150, K: 110, n: 4, L: 18, C: 18, N: 64, H: 45, d1: 88, f1: 3, R1: 6, H2: 7, S: 2.6 } },
  DN50: { od: 60.3, wall: 3.91, elbow: 76.2, tee: 63.5, flange: { D: 165, K: 125, n: 4, L: 18, C: 18, N: 74, H: 45, d1: 102, f1: 3, R1: 6, H2: 8, S: 2.9 } },
  DN65: { od: 76.1, wall: 5.16, elbow: 95.3, tee: 76.2, flange: { D: 185, K: 145, n: 8, L: 18, C: 18, N: 92, H: 45, d1: 122, f1: 3, R1: 6, H2: 10, S: 2.9 } },
  DN80: { od: 88.9, wall: 5.49, elbow: 114.3, tee: 85.7, flange: { D: 200, K: 160, n: 8, L: 18, C: 20, N: 105, H: 50, d1: 138, f1: 3, R1: 8, H2: 10, S: 3.2 } },
  DN100: { od: 114.3, wall: 6.02, elbow: 152.4, tee: 104.8, flange: { D: 220, K: 180, n: 8, L: 18, C: 20, N: 131, H: 52, d1: 158, f1: 3, R1: 8, H2: 12, S: 3.6 } },
};
export const PIPE_SIZES = Object.keys(PIPES);

// ───────────────────────── the catalogue (what the library shows)

/**
 * Library items by category. `sizes`: the size choices; `lengths(size)`: length choices (when the item has a
 * length); `material`: the material a new part gets; `standard`: the standard's number; `threads`: the item has
 * threads (cosmetic or modelled); `gear` / `pulley`: parametric (module or profile, teeth …).
 */
export const STD_CATEGORIES = [
  { id: 'bolts', icon: 'hexBolt', items: ['hexBolt', 'socketCap', 'countersunk', 'buttonHead', 'setScrew', 'setScrewCup', 'setScrewSlotted', 'stud', 'stud939'] },
  { id: 'nuts', icon: 'hexNut', items: ['hexNut', 'hexNut2', 'thinNut', 'nylonNut'] },
  { id: 'washers', icon: 'flatWasher', items: ['flatWasher', 'springWasher'] },
  { id: 'bearings', icon: 'ballBearing', items: ['ballBearing'] },
  { id: 'pins', icon: 'dowelPin', items: ['dowelPin', 'parallelPin', 'springPin', 'retainingRing', 'boreRing', 'parallelKey'] },
  { id: 'gears', icon: 'spurGear', items: ['spurGear', 'helicalGear', 'bevelGear', 'gearRack', 'timingPulley'] },
  { id: 'fittings', icon: 'pipeElbow', items: ['elbow90', 'elbow45', 'pipeTee', 'flange'] },
];

const T = true;
export const STD_ITEMS = {
  hexBolt: { standard: 'ISO 4017', sizes: METRIC_SIZES, lengths: boltLengths, material: 'steel-4340', icon: 'hexBolt', threads: T, screw: T },
  socketCap: { standard: 'ISO 4762', sizes: METRIC_SIZES, lengths: boltLengths, material: 'steel-4340', icon: 'socketCap', threads: T, screw: T },
  countersunk: { standard: 'ISO 10642', sizes: sizesFrom('M3', 'M20'), lengths: ranged(CSK_RANGE), material: 'steel-4340', icon: 'countersunkScrew', threads: T, screw: T },
  buttonHead: { standard: 'ISO 7380', sizes: sizesFrom('M3', 'M16'), lengths: ranged(BUTTON_RANGE), material: 'steel-4340', icon: 'buttonHeadScrew', threads: T, screw: T },
  setScrew: { standard: 'ISO 4026', sizes: METRIC_SIZES, lengths: setLengths, material: 'steel-4340', icon: 'setScrew', threads: T },
  setScrewCup: { standard: 'ISO 4029', sizes: METRIC_SIZES, lengths: setLengths, material: 'steel-4340', icon: 'setScrewCup', threads: T },
  setScrewSlotted: { standard: 'ISO 4766', sizes: sizesFrom('M3', 'M12'), lengths: setLengths, material: 'steel-4340', icon: 'setScrewSlotted', threads: T },
  stud: { standard: 'DIN 938', sizes: sizesFrom('M5', 'M24'), lengths: ranged(STUD_RANGE), material: 'steel-4340', icon: 'studBolt', threads: T },
  stud939: { standard: 'DIN 939', sizes: sizesFrom('M5', 'M24'), lengths: ranged(STUD_RANGE), material: 'steel-4340', icon: 'studBolt', threads: T },
  hexNut: { standard: 'ISO 4032', sizes: METRIC_SIZES, material: 'steel-1020', icon: 'hexNut', threads: T, nut: T },
  hexNut2: { standard: 'ISO 4033', sizes: sizesFrom('M5', 'M24'), material: 'steel-1020', icon: 'hexNut', threads: T, nut: T },
  thinNut: { standard: 'ISO 4035', sizes: METRIC_SIZES, material: 'steel-1020', icon: 'thinNut', threads: T, nut: T },
  nylonNut: { standard: 'ISO 7040', sizes: METRIC_SIZES, material: 'steel-1020', icon: 'nylonNut', threads: T, nut: T },
  flatWasher: { standard: 'ISO 7089', sizes: METRIC_SIZES, material: 'steel-1020', icon: 'flatWasher' },
  springWasher: { standard: 'DIN 127 B', sizes: METRIC_SIZES, material: 'steel-4340', icon: 'springWasher' },
  ballBearing: { standard: 'ISO 15', sizes: BEARING_SIZES, material: 'stainless-304', icon: 'ballBearing' },
  dowelPin: { standard: 'ISO 8734', sizes: PIN_DIAMETERS.map(String), lengths: (s) => pinLengths(Number(s)), material: 'steel-4340', icon: 'dowelPin' },
  parallelPin: { standard: 'ISO 2338', sizes: PIN_DIAMETERS.map(String), lengths: (s) => pinLengths(Number(s)), material: 'steel-1020', icon: 'dowelPin' },
  springPin: { standard: 'ISO 8752', sizes: PIN_DIAMETERS.map(String), lengths: (s) => pinLengths(Number(s)), material: 'steel-4340', icon: 'springPin' },
  retainingRing: { standard: 'DIN 471', sizes: RING_SIZES, material: 'steel-4340', icon: 'retainingRing' },
  boreRing: { standard: 'DIN 472', sizes: BORE_RING_SIZES, material: 'steel-4340', icon: 'boreRing' },
  parallelKey: { standard: 'DIN 6885 A', sizes: KEY_SIZES, lengths: keyLengths, material: 'steel-1020', icon: 'parallelKey' },
  spurGear: { standard: 'ISO 53', sizes: GEAR_MODULES.map(String), material: 'steel-4340', icon: 'spurGear', gear: T },
  helicalGear: { standard: 'ISO 53', sizes: GEAR_MODULES.map(String), material: 'steel-4340', icon: 'helicalGear', gear: T },
  bevelGear: { standard: 'ISO 23509', sizes: GEAR_MODULES.map(String), material: 'steel-4340', icon: 'bevelGear', gear: T },
  gearRack: { standard: 'ISO 53', sizes: GEAR_MODULES.map(String), material: 'steel-1020', icon: 'gearRack', gear: T },
  timingPulley: { standard: 'DIN 7721', sizes: PULLEY_SIZES, material: 'aluminum-6061', icon: 'timingPulley', pulley: T },
  elbow90: { standard: 'ASME B16.9', sizes: PIPE_SIZES, material: 'steel-1020', icon: 'pipeElbow', pipe: T },
  elbow45: { standard: 'ASME B16.9', sizes: PIPE_SIZES, material: 'steel-1020', icon: 'pipeElbow45', pipe: T },
  pipeTee: { standard: 'ASME B16.9', sizes: PIPE_SIZES, material: 'steel-1020', icon: 'pipeTee', pipe: T },
  flange: { standard: 'EN 1092-1 PN16', sizes: PIPE_SIZES, material: 'steel-1020', icon: 'pipeFlange', pipe: T },
};
export const STD_KINDS = Object.keys(STD_ITEMS);

/** Parameters of gears and pulleys (besides the module / profile) with their defaults. */
export const GEAR_PARAMS = {
  spurGear: { teeth: 24, width: 20, bore: 10, keyway: false },
  helicalGear: { teeth: 24, width: 20, bore: 10, keyway: false, helixAngle: 15, hand: 'right' },
  bevelGear: { teeth: 20, mateTeeth: 40, width: 12, bore: 10, keyway: false },
  gearRack: { teeth: 20, width: 20, height: 20 },
  timingPulley: { teeth: 20, width: 15, bore: 8, keyway: false },
};
const GEAR_KEYS = ['teeth', 'width', 'bore', 'keyway', 'helixAngle', 'hand', 'mateTeeth', 'height'];

/** The parameters a new library part starts with (the first size / a middle length). */
export function stdDefaults(kind, base = {}) {
  const item = STD_ITEMS[kind];
  if (!item) throw new Error(`unknown standard part ${kind}`);
  const pick = () => {
    if (item.pipe) return PIPES[base.dn] ? base.dn : 'DN25';
    if (item.gear) return item.sizes.includes(String(base.module)) ? String(base.module) : '2';
    if (item.pulley) return item.sizes.includes(String(base.size)) ? String(base.size) : 'T5';
    if (item.sizes.includes(String(base.size))) return String(base.size);
    return item.sizes.includes('M8') ? 'M8' : item.sizes[Math.min(item.sizes.length - 1, 4)];
  };
  const size = pick();
  const lengths = item.lengths?.(size) ?? [];
  const length = lengths.includes(Number(base.length)) ? Number(base.length) : lengths[Math.floor(lengths.length / 3)] ?? 0;
  const out = { kind, size: item.pipe ? undefined : item.gear ? base.size : size, dn: item.pipe ? size : base.dn ?? 'DN25', length };
  if (item.gear || item.pulley) {
    const g = GEAR_PARAMS[kind];
    for (const k of Object.keys(g)) out[k] = base[k] ?? g[k];
    if (item.gear) out.module = Number(size);
  }
  if (item.threads) out.threads = base.threads ?? 'auto';
  return out;
}

/** The size key of a part's parameters (the size, or the pipe size, or the module of a gear). */
export const sizeOf = (p) => (STD_ITEMS[p.kind]?.pipe ? p.dn : STD_ITEMS[p.kind]?.gear ? String(p.module) : String(p.size));

/** The parameters that make a library part what it is (one project part per distinct set). */
export function stdKey(p) {
  const item = STD_ITEMS[p.kind] ?? {};
  const extra = {};
  if (item.gear || item.pulley) for (const k of GEAR_KEYS) if (p[k] !== undefined) extra[k] = p[k];
  return JSON.stringify([p.kind, sizeOf(p), item.lengths ? Number(p.length) : 0, extra, item.threads ? p.threads ?? 'auto' : 0]);
}

const STD_DESIGNATION_NAMES = { spurGear: 'Spur gear', helicalGear: 'Helical gear', bevelGear: 'Bevel gear', gearRack: 'Rack', timingPulley: 'Pulley', elbow90: 'Elbow 90°', elbow45: 'Elbow 45°', pipeTee: 'Tee', flange: 'Flange' };

/** The standard designation: "ISO 4017 M8×30", "6204", "DIN 6885 A 8×7×40", "Spur gear m2 z24". */
export function designation(p, names = {}) {
  const item = STD_ITEMS[p.kind];
  if (!item) return '?';
  const x = '×';
  const name = (k) => names[k] ?? STD_DESIGNATION_NAMES[k];
  switch (p.kind) {
    case 'hexBolt': case 'socketCap': case 'countersunk': case 'buttonHead': case 'setScrew': case 'setScrewCup': case 'setScrewSlotted': case 'stud': case 'stud939':
      return `${item.standard} ${p.size}${x}${p.length}`;
    case 'hexNut': case 'hexNut2': case 'thinNut': case 'nylonNut': return `${item.standard} ${p.size}`;
    case 'flatWasher': return `${item.standard} ${METRIC[p.size]?.d ?? p.size}`;
    case 'springWasher': return `${item.standard}${METRIC[p.size]?.d ?? p.size}`;
    case 'ballBearing': return `${p.size}`;
    case 'dowelPin': case 'springPin': return `${item.standard} ${p.size}${x}${p.length}`;
    case 'parallelPin': return `${item.standard} ${p.size} m6${x}${p.length}`;
    case 'retainingRing': return `${item.standard} ${p.size}${x}${RETAINING_RINGS[p.size]?.s ?? ''}`;
    case 'boreRing': return `${item.standard} ${p.size}${x}${BORE_RINGS[p.size]?.s ?? ''}`;
    case 'parallelKey': return `${item.standard} ${String(p.size).replace('x', x)}${x}${p.length}`;
    case 'spurGear': return `${name('spurGear')} m${p.module} z${p.teeth}`;
    case 'helicalGear': return `${name('helicalGear')} mn${p.module} z${p.teeth} β${p.helixAngle}°${p.hand === 'left' ? ' L' : ''}`;
    case 'bevelGear': return `${name('bevelGear')} m${p.module} z${p.teeth}/${p.mateTeeth}`;
    case 'gearRack': return `${name('gearRack')} m${p.module}${x}${p.teeth}`;
    case 'timingPulley': return `${name('timingPulley')} ${p.size} z${p.teeth}`;
    case 'elbow90': return `${name('elbow90')} ${p.dn}`;
    case 'elbow45': return `${name('elbow45')} ${p.dn}`;
    case 'pipeTee': return `${name('pipeTee')} ${p.dn}`;
    case 'flange': return `${name('flange')} ${p.dn} PN16`;
    default: return p.kind;
  }
}

/**
 * Rows of the size table the library shows for an item: [ [column keys], [[size, …values]] ]. Column keys are
 * i18n keys of `std.col.*`.
 */
export function sizeTable(kind) {
  const rows = (table, cols) => Object.entries(table).map(([k, v]) => [k, ...cols.map((c) => v[c])]);
  const sizes = STD_ITEMS[kind]?.sizes ?? [];
  const thread = (s) => [METRIC[s].d, METRIC[s].p];
  switch (kind) {
    case 'hexBolt': return [['d', 's', 'k', 'p'], METRIC_SIZES.map((s) => [s, METRIC[s].d, HEX_BOLT[s].s, HEX_BOLT[s].k, METRIC[s].p])];
    case 'socketCap': return [['d', 'dk', 'k', 'sSocket'], METRIC_SIZES.map((s) => [s, METRIC[s].d, SOCKET_CAP[s].dk, SOCKET_CAP[s].k, SOCKET_CAP[s].s])];
    case 'countersunk': return [['d', 'p', 'dk', 'k', 'sSocket'], sizes.map((s) => [s, ...thread(s), COUNTERSUNK[s].dk, COUNTERSUNK[s].k, COUNTERSUNK[s].s])];
    case 'buttonHead': return [['d', 'p', 'dk', 'k', 'sSocket'], sizes.map((s) => [s, ...thread(s), BUTTON_HEAD[s].dk, BUTTON_HEAD[s].k, BUTTON_HEAD[s].s])];
    case 'setScrew': return [['d', 'p', 'sSocket', 't', 'dp'], sizes.map((s) => [s, ...thread(s), SET_SCREW[s].s, SET_SCREW[s].t, SET_SCREW[s].dp])];
    case 'setScrewCup': return [['d', 'p', 'sSocket', 't', 'dz'], sizes.map((s) => [s, ...thread(s), SET_SCREW[s].s, SET_SCREW[s].t, SET_SCREW[s].dz])];
    case 'setScrewSlotted': return [['d', 'p', 'n', 't', 'dp'], sizes.map((s) => [s, ...thread(s), SET_SCREW[s].n, SET_SCREW[s].ts, SET_SCREW[s].dp])];
    case 'stud': case 'stud939': return [['d', 'p', 'bm', 'b'], sizes.map((s) => [s, ...thread(s), studMetalEnd(kind, s), `${2 * METRIC[s].d + 6}`])];
    case 'hexNut': return [['s', 'm', 'p'], METRIC_SIZES.map((s) => [s, HEX_NUT[s].s, HEX_NUT[s].m, METRIC[s].p])];
    case 'hexNut2': return [['s', 'm', 'p'], sizes.map((s) => [s, HEX_NUT[s].s, HEX_NUT2[s], METRIC[s].p])];
    case 'thinNut': return [['s', 'm', 'p'], sizes.map((s) => [s, HEX_NUT[s].s, THIN_NUT[s], METRIC[s].p])];
    case 'nylonNut': return [['s', 'h', 'm', 'p'], sizes.map((s) => [s, HEX_NUT[s].s, NYLON_NUT[s].h, NYLON_NUT[s].m, METRIC[s].p])];
    case 'flatWasher': return [['d1', 'd2', 'h'], rows(FLAT_WASHER, ['d1', 'd2', 'h'])];
    case 'springWasher': return [['d1', 'd2', 'sThick', 'h'], rows(SPRING_WASHER, ['d1', 'd2', 's', 'h'])];
    case 'ballBearing': return [['d', 'D', 'B', 'balls', 'Dw'], BEARING_SIZES.map((s) => [s, BEARINGS[s].d, BEARINGS[s].D, BEARINGS[s].B, BEARING_BALLS[s][0], BEARING_BALLS[s][1]])];
    case 'dowelPin': return [['d', 'lengths'], PIN_DIAMETERS.map((d) => [String(d), d, `${pinLengths(d)[0]}–${pinLengths(d).at(-1)}`])];
    case 'parallelPin': return [['d', 'c', 'lengths'], PIN_DIAMETERS.map((d) => [String(d), d, PARALLEL_PIN_C[d], `${pinLengths(d)[0]}–${pinLengths(d).at(-1)}`])];
    case 'springPin': return [['d', 'sThick', 'lengths'], PIN_DIAMETERS.map((d) => [String(d), d, SPRING_PIN[d].s, `${pinLengths(d)[0]}–${pinLengths(d).at(-1)}`])];
    case 'retainingRing': return [['shaft', 'sThick', 'd3', 'a', 'd5'], RING_SIZES.map((s) => [s, Number(s), RETAINING_RINGS[s].s, RETAINING_RINGS[s].d3, RETAINING_RINGS[s].a, RETAINING_RINGS[s].d5])];
    case 'boreRing': return [['boreD', 'sThick', 'd3out', 'a', 'd5'], BORE_RING_SIZES.map((s) => [s, Number(s), BORE_RINGS[s].s, BORE_RINGS[s].d3, BORE_RINGS[s].a, BORE_RINGS[s].d5])];
    case 'parallelKey': return [['b', 'h', 'shaft', 't1', 't2'], KEY_SIZES.map((s) => [s, KEYS[s].b, KEYS[s].h, `${KEYS[s].shaft[0]}–${KEYS[s].shaft[1]}`, KEYS[s].t1, KEYS[s].t2])];
    case 'spurGear': case 'helicalGear': case 'bevelGear': case 'gearRack': return [['module', 'tooth', 'rootRadius'], GEAR_MODULES.map((m) => [String(m), m, Number((2.25 * m).toFixed(3)), Number((0.38 * m).toFixed(3))])];
    case 'timingPulley': return [['pitchP', 'bw', 'hg', 'pld'], PULLEY_SIZES.map((s) => [s, PULLEY_PROFILES[s].pitch, PULLEY_PROFILES[s].bw, PULLEY_PROFILES[s].hg, PULLEY_PROFILES[s].pld])];
    case 'elbow90': case 'elbow45': return [['od', 'wall', 'radius'], PIPE_SIZES.map((s) => [s, PIPES[s].od, PIPES[s].wall, PIPES[s].elbow])];
    case 'pipeTee': return [['od', 'wall', 'centreToEnd'], PIPE_SIZES.map((s) => [s, PIPES[s].od, PIPES[s].wall, PIPES[s].tee])];
    case 'flange': return [['D', 'K', 'bolts', 'C', 'raisedFace'], PIPE_SIZES.map((s) => { const f = PIPES[s].flange; return [s, f.D, f.K, `${f.n}×Ø${f.L}`, f.C, `Ø${f.d1}×${f.f1}`]; })];
    default: return [[], []];
  }
}

// ───────────────────────── fasteners for holes

/**
 * The metric size for a hole of diameter `D` (mm): a tapped hole (blind, about the tap drill) takes the size
 * it was drilled for; a clearance hole the largest size whose bolt fits with no more than coarse clearance.
 * Returns { size, fit: 'tapped' | 'clearance' | 'loose' } or null when no size fits.
 */
export function fastenerSizeForHole(D, { blind = false } = {}) {
  if (!(D > 0)) return null;
  if (blind) {
    const tapped = METRIC_SIZES.find((s) => Math.abs(METRIC[s].tap - D) <= 0.3);
    if (tapped) return { size: tapped, fit: 'tapped' };
  }
  const clear = [...METRIC_SIZES].reverse().find((s) => METRIC[s].d < D + 1e-6 && D <= METRIC[s].coarse + 0.3);
  if (clear) return { size: clear, fit: 'clearance' };
  const loose = [...METRIC_SIZES].reverse().find((s) => METRIC[s].d < D + 1e-6);
  return loose ? { size: loose, fit: 'loose' } : null;
}

/**
 * The bolt length for a joint: through a clearance hole of `grip` (plates) with a washer of `washer` and a nut
 * of `nut` (heights, 0 = none) the shortest standard length that leaves two pitches past the nut; into a
 * tapped hole of depth `grip` the longest one that does not bottom out. `kind`: the screw (its lengths).
 */
export function boltLengthFor(size, grip, { washer = 0, nut = 0, blind = false, kind = 'hexBolt', head = 0 } = {}) {
  const list = (STD_ITEMS[kind]?.lengths ?? boltLengths)(size);
  const p = METRIC[size].p;
  if (blind) {
    const max = washer + grip - p + head;
    return [...list].reverse().find((l) => l <= max) ?? list[0];
  }
  const need = washer + grip + head + (nut ? nut + 2 * p : 0);
  return list.find((l) => l >= need - 1e-6) ?? list.at(-1);
}

/** Height of a nut kind (ISO 4032 / 4033 / 4035 / 7040). */
export const nutHeight = (kind, size) => ({ hexNut: HEX_NUT[size]?.m, hexNut2: HEX_NUT2[size], thinNut: THIN_NUT[size], nylonNut: NYLON_NUT[size]?.h }[kind] ?? HEX_NUT[size]?.m ?? 0);

// ───────────────────────── gear geometry (pure)

/**
 * The outline of a spur gear (ISO 53 basic rack: 20°, addendum m, dedendum 1.25 m, root fillet generated by the
 * cutter's 0.38 m tip radius — a trochoid; undercut below 17 teeth) as a dense closed polygon [[x, y] …].
 */
export function gearOutline({ module: m, teeth: z, pressureAngle = 20 }) {
  return profilePolygon(gearProfile({ module: m, teeth: z, pressureAngle }));
}

/** Polygon area (shoelace). */
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

/** The gear's circles: pitch, base, tip, root diameters. */
export const gearCircles = ({ module: m, teeth: z, pressureAngle = 20 }) => ({ pitch: m * z, base: m * z * Math.cos((pressureAngle * Math.PI) / 180), tip: m * (z + 2), root: m * (z - 2.5) });

// ───────────────────────── solids

const R = () => rep();
const EPS = 0.01;
const tan30 = Math.tan(Math.PI / 6);

/** A solid of revolution about +Z from a closed (r, z) profile; a point { arc: [r, z] } makes the segment to the next point an arc through it. */
function revolveProfile(pts) {
  const first = pts[0];
  let d = R().draw(first);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.arc) continue;
    const prev = pts[i - 1];
    if (prev.arc) d = d.threePointsArcTo(p, prev.arc);
    else d = d.lineTo(p);
  }
  return d.close().sketchOnPlane('XZ').revolve([0, 0, 1], { origin: [0, 0, 0] });
}

/** A regular hexagon prism, across flats `s`, z0 … z0 + h. */
const hexPrism = (s, h, z0 = 0) => R().drawPolysides(s / Math.sqrt(3), 6).sketchOnPlane('XY', [0, 0, z0]).extrude(h);

/** A hex head / nut body with a 30° chamfer on its top (and bottom, `both`) corners. */
function chamferedHex(s, h, both = false) {
  const e = s / Math.sqrt(3) + 0.5;
  const c = (e - s / 2) * tan30;
  const prof = both
    ? [[0, -EPS], [s / 2 * 0.95, -EPS], [e, c - EPS], [e, h - c + EPS], [s / 2 * 0.95, h + EPS], [0, h + EPS]]
    : [[0, -EPS], [e, -EPS], [e, h - c + EPS], [s / 2, h + EPS], [0, h + EPS]];
  return hexPrism(s, h).intersect(revolveProfile(prof));
}

/** Pitch and thread spec of a metric size. */
const spec = (size) => isoThread(METRIC[size].d, METRIC[size].p);
/** The end chamfer of a screw (ISO 4753: to below the minor diameter, 45°). */
const endRadius = (size) => spec(size).d3 / 2 - 0.05 * METRIC[size].p;

/**
 * A threaded rod from z = z0 up to z1 with the end at z0 chamfered (and at z1 too, `chamferTop`): cosmetic — the
 * plain cylinder at d; modelled — the ISO thread swept along it, its ends trimmed by the chamfers.
 */
function threadedRod(size, z0, z1, { modelled = false, chamferBottom = true, chamferTop = false, point = null, runoutTop = false, runoutBottom = false } = {}) {
  const d = METRIC[size].d; const r = d / 2; const re = endRadius(size);
  const cb = chamferBottom ? r - re : 0; const ct = chamferTop ? r - re : 0;
  const blankR = modelled ? r + 0.3 : r;
  const prof = [[0, z0], ...(point ?? [[chamferBottom ? re : blankR, z0]]), ...(cb ? [[blankR, z0 + (blankR - re)]] : []), ...(ct ? [[blankR, z1 - (blankR - re)], [re, z1]] : [[blankR, z1]]), [0, z1]];
  const blank = revolveProfile(prof);
  if (!modelled) return blank;
  let rod = threadSolid(spec(size), 'external', { origin: [0, 0, z0], dir: [0, 0, 1], length: z1 - z0 });
  if (cb || ct || point) rod = rod.intersect(blank, { simplify: false });
  // Where the thread meets a plain shank it fades out over the runout (a vanishing thread), not cut off.
  if (runoutTop) rod = rod.fuse(externalRunoutCore(spec(size), threadFrame([0, 0, z0], [0, 0, 1]), z1 - z0), { simplify: false });
  if (runoutBottom) rod = rod.fuse(externalRunoutCore(spec(size), threadFrame([0, 0, z1], [0, 0, -1]), z1 - z0), { simplify: false });
  return rod;
}

/** A plain cylinder z0 … z1 at the nominal diameter. */
const plainRod = (size, z0, z1) => R().makeCylinder(METRIC[size].d / 2, z1 - z0, [0, 0, z0], [0, 0, 1]);

/** Fuses solids that meet at coplanar faces (the glue option keeps the screw sweep exact and fast). */
const glue = (a, b) => a.fuse(b, { optimisation: 'commonFace', simplify: false });

/**
 * The shank of a screw under a head: from z = top down to z = −L, threaded on the lowest `tl`, a plain part at d
 * above it. `top`: where the shank meets the head (0, or −k for a countersunk head).
 */
function screwShank(size, L, tl, modelled, top = 0) {
  const tlen = Math.min(tl, L + top);
  if (!modelled) return { shank: revolveProfile([[0, -L], [endRadius(size), -L], [METRIC[size].d / 2, -L + (METRIC[size].d / 2 - endRadius(size))], [METRIC[size].d / 2, top + EPS * 5], [0, top + EPS * 5]]), joinTop: false };
  const toHead = -L + tlen >= top - 1e-9;
  const rod = threadedRod(size, -L, -L + tlen, { modelled: true, runoutTop: true });
  if (toHead) return { shank: rod, joinTop: true };
  return { shank: glue(plainRod(size, -L + tlen, top + EPS * 5), rod), joinTop: false };
}

/** Screw thread lengths: ISO 4017 / 7380 to the head (2 pitches of runout), ISO 4762 / 10642 b = 2d + 12 for long screws. */
export function screwThreadLength(kind, size, L) {
  const { d, p } = METRIC[size];
  if (kind === 'countersunk') return Math.min(L - COUNTERSUNK[size].k - 2 * p, 2 * d + 12);
  if (kind === 'socketCap') return Math.min(L - 2 * p, 2 * d + 12);
  return L - 2 * p;
}

/** Joins a head (its underside at z = top) and a shank. */
function withShank(head, size, L, kind, modelled, top = 0) {
  const tl = screwThreadLength(kind, size, L);
  const { shank, joinTop } = screwShank(size, L, tl, modelled, top);
  return joinTop ? glue(head, shank) : head.fuse(shank);
}

function hexBolt(size, L, modelled) {
  const h = HEX_BOLT[size];
  return withShank(chamferedHex(h.s, h.k), size, L, 'hexBolt', modelled);
}

function socketCap(size, L, modelled) {
  const h = SOCKET_CAP[size];
  const c = h.k * 0.08;
  const head = revolveProfile([[0, 0], [h.dk / 2, 0], [h.dk / 2, h.k - c], [h.dk / 2 - c, h.k], [0, h.k]]);
  return withShank(head, size, L, 'socketCap', modelled).cut(hexPrism(h.s, h.t + 1, h.k - h.t));
}

/** ISO 10642: a 90° countersunk head from dk (z = 0, flush) down to d at z = −k, hex socket in the top. */
function countersunk(size, L, modelled) {
  const h = COUNTERSUNK[size]; const r = METRIC[size].d / 2;
  const k = h.dk / 2 - r; // 90°: the cone drops one unit per unit of radius
  const edge = Math.min(0.1, k * 0.05);
  const head = revolveProfile([[0, -k], [r, -k], [h.dk / 2, 0 - edge], [h.dk / 2, 0], [0, 0]]);
  const screw = withShank(head, size, L, 'countersunk', modelled, -k);
  return screw.cut(hexPrism(h.s, h.t + 1, -h.t));
}

/** ISO 7380-1: a button (spherical-cap) head, a small cylindrical rim, hex socket. */
function buttonHead(size, L, modelled) {
  const h = BUTTON_HEAD[size];
  const rim = h.k * 0.12; const rk = h.dk / 2;
  const top = h.k; const rt = Math.max(METRIC[size].d * 0.35, h.s * 0.75);
  // The dome: a spherical cap (centre on the axis) from the rim edge to the flat top around the socket.
  const zc = (rk * rk - rt * rt + rim * rim - top * top) / (2 * (rim - top));
  const rs = Math.hypot(rk, rim - zc);
  const am = (Math.atan2(rim - zc, rk) + Math.atan2(top - zc, rt)) / 2;
  const mid = [rs * Math.cos(am), zc + rs * Math.sin(am)];
  const head = revolveProfile([[0, 0], [rk, 0], [rk, rim], { arc: mid }, [rt, top], [0, top]]);
  return withShank(head, size, L, 'buttonHead', modelled).cut(hexPrism(h.s, h.t + 1, h.k - h.t));
}

/** Set screws: fully threaded, z −L … 0; flat point (ISO 4026 / 4766) or cup point (ISO 4029). */
function setScrew(kind, size, L, modelled) {
  const g = SET_SCREW[size]; const d = METRIC[size].d; const r = d / 2;
  const re = endRadius(size);
  const blankR = modelled ? r + 0.3 : r;
  // The point: flat (dp, 45° chamfer from the minor diameter) or cup (dz, same chamfer, a cone recess).
  const pr = Math.min(g.dp / 2, re);
  const prof = [[0, -L], [pr, -L], [blankR, -L + (blankR - pr)], [blankR, -(blankR - re)], [re, 0], [0, 0]];
  let body = revolveProfile(prof);
  if (modelled) body = threadSolid(spec(size), 'external', { origin: [0, 0, -L], dir: [0, 0, 1], length: L }).intersect(body, { simplify: false });
  if (kind === 'setScrewCup') {
    const cr = g.dz / 2; const depth = cr * 0.6;
    body = body.cut(revolveProfile([[0, -L - 1], [cr + 1, -L - 1], [cr, -L], [0, -L + depth]]));
  }
  if (kind === 'setScrewSlotted') {
    const depth = Math.min(g.ts, L * 0.5);
    body = body.cut(R().makeBox([-d, -g.n / 2, -depth], [d, g.n / 2, 1]));
  } else {
    // ISO 4026 / 4029: the short screws (above the stepped line of the length table, L < 2 d here) take t, the others tl.
    const t = Math.min(L >= 2 * d ? g.tl : g.t, L * 0.6);
    body = body.cut(hexPrism(g.s, t + 1, -t));
  }
  return body;
}

/** Metal-end length of a stud: DIN 938 bm = d, DIN 939 bm = 1.25 d. */
export const studMetalEnd = (kind, size) => (kind === 'stud939' ? 1.25 : 1) * METRIC[size].d;
/** The nut-end thread length of a stud: b = 2d + 6 (l ≤ 125), 2d + 12 (125 < l ≤ 200). */
export const studThreadLength = (size, l) => Math.min(l, 2 * METRIC[size].d + (l > 125 ? 12 : 6));

/** DIN 938 / 939 stud: metal end −bm … 0 (threaded), plain middle, nut end threaded over b to z = l. */
function stud(kind, size, l, modelled) {
  const bm = studMetalEnd(kind, size); const b = studThreadLength(size, l);
  const metal = threadedRod(size, -bm, 0, { modelled, chamferBottom: true, runoutTop: l - b > 1e-9 });
  const nutEnd = threadedRod(size, l - b, l, { modelled, chamferBottom: false, chamferTop: true, runoutBottom: l - b > 1e-9 });
  if (!modelled) {
    return revolveProfile([[0, -bm], [endRadius(size), -bm], [METRIC[size].d / 2, -bm + (METRIC[size].d / 2 - endRadius(size))], [METRIC[size].d / 2, l - (METRIC[size].d / 2 - endRadius(size))], [endRadius(size), l], [0, l]]);
  }
  let s = metal;
  if (l - b > 1e-9) s = glue(s, plainRod(size, 0, l - b));
  return glue(s, nutEnd);
}

/** A hex nut body (both sides chamfered) of height m with the thread: cosmetic — a bore at D1; modelled — the ISO thread. */
function nutBody(size, s, m, modelled, threadTo = m) {
  const body = chamferedHex(s, m, true);
  const sp = spec(size);
  if (!modelled) return body.cut(R().makeCylinder(sp.d1 / 2, m + 2, [0, 0, -1], [0, 0, 1]));
  const hole = threadSolid(sp, 'internal', { origin: [0, 0, 0], dir: [0, 0, 1], length: threadTo });
  const cut = body.cut(hole);
  return threadTo < m - 1e-9 ? cut.cut(R().makeCylinder(sp.d1 / 2, m - threadTo + 1, [0, 0, threadTo - 0.5], [0, 0, 1])) : cut;
}

/** ISO 7040: the hex body of height m with the thread, a crown up to h holding the nylon ring (a second solid). */
function nylonNut(size, modelled) {
  const n = HEX_NUT[size]; const g = NYLON_NUT[size]; const sp = spec(size);
  const d = METRIC[size].d;
  const body = nutBody(size, n.s, g.m, modelled);
  const rc = Math.min(n.s * 0.47, n.s / 2 - 0.1); // crown outside radius (inside the flats)
  const lip = Math.max(0.3, (g.h - g.m) * 0.18);
  const rIn = sp.d1 / 2 + 0.05;
  // The crown: a thin wall around the insert, folded over its top edge.
  const crown = revolveProfile([[d / 2 + 0.4, g.m - EPS * 5], [rc, g.m - EPS * 5], [rc, g.h - lip], [rc - lip, g.h], [d * 0.5, g.h], [d * 0.5, g.h - lip], [rc - lip * 2, g.h - lip], [rc - lip * 2, g.m + EPS], [d / 2 + 0.4, g.m + EPS]]);
  const steel = body.fuse(crown);
  // The insert: unthreaded, its bore a quarter pitch under the minor diameter, so it grips the bolt's thread.
  const rInsert = rIn - 0.25 * METRIC[size].p;
  const insert = revolveProfile([[rInsert, g.m + EPS * 2], [rc - lip * 2 - EPS, g.m + EPS * 2], [rc - lip * 2 - EPS, g.h - lip - EPS], [rInsert, g.h - lip - EPS]]);
  return R().makeCompound([steel, insert]);
}

function flatWasher(size) {
  const w = FLAT_WASHER[size];
  return revolveProfile([[w.d1 / 2, 0], [w.d2 / 2, 0], [w.d2 / 2, w.h], [w.d1 / 2, w.h]]);
}

/**
 * DIN 127 B spring lock washer: the rectangular section (b × s) swept once round a helix — the split ends sit
 * h − s apart axially (free height h) and a gap of about s/2 apart around the ring.
 */
export function springWasherGeometry(size) {
  const w = SPRING_WASHER[size];
  const b = (w.d2 - w.d1) / 2; const rm = (w.d1 + w.d2) / 4;
  const gap = (0.5 * w.s) / rm; // radians
  const sweep = 2 * Math.PI - gap;
  const rise = w.h - w.s; // over the sweep
  return { ...w, b, rm, gap, sweep, rise, pitch: (rise * 2 * Math.PI) / sweep };
}
function springWasher(size) {
  const g = springWasherGeometry(size);
  const rep0 = R(); const oc = rep0.getOC();
  const spine = rep0.makeHelix(g.pitch, (g.pitch * g.sweep) / (2 * Math.PI), g.rm, [0, 0, g.s / 2], [0, 0, 1]);
  const sp = spine.startPoint; const a = Math.atan2(sp.y, sp.x);
  const u = [Math.cos(a), Math.sin(a), 0];
  const corner = (dr, dz) => [u[0] * (g.rm + dr), u[1] * (g.rm + dr), g.s / 2 + dz];
  const profile = rep0.makePolygon([corner(-g.b / 2, -g.s / 2), corner(g.b / 2, -g.s / 2), corner(g.b / 2, g.s / 2), corner(-g.b / 2, g.s / 2)]).outerWire();
  const builder = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
  try {
    // A fixed binormal (the axis) keeps the section in its axial plane all the way round.
    builder.SetMode(new oc.gp_Dir(0, 0, 1));
    builder.Add(profile.wrapped, false, false);
    builder.Build();
    builder.MakeSolid();
    let solid = rep0.cast(builder.Shape());
    if (rep0.measureVolume(solid) < 0) solid = rep0.cast(solid.wrapped.Reversed());
    return solid;
  } finally { builder.delete(); }
}

/**
 * The internal geometry of a deep-groove ball bearing: the catalogue ball set (count, Dw), the pitch diameter
 * dm = (d + D) / 2, raceway groove radii (0.52 / 0.53 Dw), ring shoulders at dm ∓ 0.6 Dw, the cage band.
 */
export function bearingBalls(size) {
  const b = BEARINGS[size];
  const [count, Dw, pitch] = BEARING_BALLS[size];
  return { Dw, pitch, count, innerGroove: 0.52 * Dw, outerGroove: 0.53 * Dw, innerShoulder: pitch - 0.6 * Dw, outerShoulder: pitch + 0.6 * Dw, cageWidth: 1.2 * Dw, cageThickness: 0.24 * Dw };
}

function ballBearing(size) {
  const b = BEARINGS[size];
  const g = bearingBalls(size);
  const rp = g.pitch / 2; const c = Math.min(b.r, b.B * 0.1);
  const ringProfile = (r0, r1) => [[r0 + c, 0], [r1 - c, 0], [r1, c], [r1, b.B - c], [r1 - c, b.B], [r0 + c, b.B], [r0, b.B - c], [r0, c]];
  const groove = (rg) => R().drawCircle(rg).translate([rp, b.B / 2]).sketchOnPlane('XZ').revolve([0, 0, 1], { origin: [0, 0, 0] });
  const inner = revolveProfile(ringProfile(b.d / 2, g.innerShoulder / 2)).cut(groove(g.innerGroove));
  const outer = revolveProfile(ringProfile(g.outerShoulder / 2, b.D / 2)).cut(groove(g.outerGroove));
  // The cage: a band at the pitch circle with a radial pocket at every ball.
  let cage = revolveProfile([[rp - g.cageThickness / 2, (b.B - g.cageWidth) / 2], [rp + g.cageThickness / 2, (b.B - g.cageWidth) / 2], [rp + g.cageThickness / 2, (b.B + g.cageWidth) / 2], [rp - g.cageThickness / 2, (b.B + g.cageWidth) / 2]]);
  const balls = [];
  for (let i = 0; i < g.count; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / g.count;
    const dir = [Math.cos(a), Math.sin(a), 0];
    cage = cage.cut(R().makeCylinder(0.52 * g.Dw, 2 * g.cageThickness + 2, [dir[0] * (rp - g.cageThickness - 1), dir[1] * (rp - g.cageThickness - 1), b.B / 2], dir));
    balls.push(R().makeSphere(g.Dw / 2).translate([rp * dir[0], rp * dir[1], b.B / 2]));
  }
  return R().makeCompound([inner, outer, cage, ...balls]);
}

/** ISO 8734 pin: chamfer at both ends. */
export const pinChamfer = (d) => Math.max(0.2, Math.min(0.12 * d, 1.6));
function dowelPin(d, L, c = pinChamfer(d)) {
  const r = d / 2;
  return revolveProfile([[0, 0], [r - c, 0], [r, c], [r, L - c], [r - c, L], [0, L]]);
}

/** ISO 8752 slotted spring pin: a tube (wall s) with a slot along its length, both ends chamfered. */
function springPin(d, L) {
  const g = springPinGeometry(d); const r = g.free / 2; const ri = r - g.s;
  // The chamfer: a long along the pin down to the bore (ISO 8752 fig. 1), within the wall.
  const c = Math.min(g.chamfer, L / 3); const cr = Math.min(g.s * 0.6, r - ri - 0.01);
  const tube = revolveProfile([[ri + EPS, 0], [r - cr, 0], [r, c], [r, L - c], [r - cr, L], [ri + EPS, L]]);
  return tube.cut(R().makeBox([-g.gap / 2, 0, -1], [g.gap / 2, r + 1, L + 1]));
}

/**
 * DIN 471 / 472 retaining ring: an eccentric ring (radial width b at the back, about 0.55 b at the lugs) with
 * two lugs of height a at the opening (+Y), each with its d5 hole for the pliers. External (471): free inside
 * diameter d3, lugs outside; internal (472): free outside diameter d3, lugs inside.
 */
export function ringGeometry(kind, size) {
  const g = kind === 'boreRing' ? BORE_RINGS[size] : RETAINING_RINGS[size];
  const e = 0.225 * g.b;
  const r3 = g.d3 / 2;
  const open = 0.45 * g.a;
  const lugX = open / 2 + g.a / 2;
  const lugR = kind === 'boreRing' ? r3 - g.a / 2 - 0.02 : r3 + g.a / 2 + 0.02;
  return { ...g, e, r3, open, lugX, lugY: Math.sqrt(Math.max(0, lugR ** 2 - lugX ** 2)), outerRadius: kind === 'boreRing' ? r3 : r3 + g.b - e, innerRadius: kind === 'boreRing' ? r3 - g.b + e : r3 };
}
function retainingRing(kind, size) {
  const g = ringGeometry(kind, size);
  const cyl = (r, x, y, h = g.s, z = 0) => R().makeCylinder(r, h, [x, y, z], [0, 0, 1]);
  // Solids, not 2D drawings: the lug circles meet the ring tangentially, which the 2D booleans cannot cut.
  let shape = kind === 'boreRing' ? cyl(g.r3, 0, 0).cut(cyl(g.innerRadius, 0, g.e, g.s + 2, -1)) : cyl(g.outerRadius, 0, -g.e).cut(cyl(g.r3, 0, 0, g.s + 2, -1));
  for (const sx of [-1, 1]) shape = shape.fuse(cyl(g.a / 2, sx * g.lugX, g.lugY));
  if (kind === 'boreRing') shape = shape.intersect(cyl(g.r3, 0, 0, g.s + 2, -1));
  const reach = kind === 'boreRing' ? g.r3 + 1 : g.r3 + g.a * 2 + g.b;
  shape = shape.cut(R().makeBox([-g.open / 2, 0, -1], [g.open / 2, reach, g.s + 1]));
  for (const sx of [-1, 1]) shape = shape.cut(cyl(g.d5 / 2, sx * g.lugX, g.lugY, g.s + 2, -1));
  return shape;
}

function parallelKey(size, L) {
  const k = KEYS[size];
  return R().drawRoundedRectangle(L, k.b, k.b / 2 - 1e-4).sketchOnPlane('XY').extrude(k.h);
}

/** A closed 2D drawing from outline pieces (arcs exact, curves as B-splines). */
function piecesFace(pieces, z = 0) {
  const r = R();
  const edges = [];
  const at = ([x, y]) => [x, y, z];
  for (const p of pieces) {
    if (p.kind === 'arc') {
      const m = (p.a0 + p.a1) / 2;
      edges.push(r.makeThreePointArc(at([p.r * Math.cos(p.a0), p.r * Math.sin(p.a0)]), at([p.r * Math.cos(m), p.r * Math.sin(m)]), at([p.r * Math.cos(p.a1), p.r * Math.sin(p.a1)])));
    } else if (p.kind === 'line') edges.push(r.makeLine(at(p.a), at(p.b)));
    else if (p.kind === 'arc3') edges.push(r.makeThreePointArc(at(p.a), at(p.m), at(p.b)));
    else if (p.pts.length === 2) edges.push(r.makeLine(at(p.pts[0]), at(p.pts[1])));
    else edges.push(r.makeBSplineApproximation(p.pts.map(at), { tolerance: 1e-5, degMax: 5, degMin: 2 }));
  }
  return r.assembleWire(edges);
}

/** Cuts the bore (and a DIN 6885 hub keyway, `keyway`) through a gear / pulley body z 0 … width. */
function boreAndKeyway(body, bore, width, keyway) {
  if (!(bore > 0)) return body;
  let s = body.cut(R().makeCylinder(bore / 2, width + 2, [0, 0, -1], [0, 0, 1]));
  if (keyway) {
    const k = KEYS[keyForShaft(bore) ?? ''];
    if (k) s = s.cut(R().makeBox([-k.b / 2, 0, -1], [k.b / 2, bore / 2 + k.t2, width + 1]));
  }
  return s;
}

/** Keyway data for a bore (DIN 6885 hub): { key, b, t2 } or null. */
export const hubKeyway = (bore) => { const k = keyForShaft(bore); return k ? { key: k, b: KEYS[k].b, t2: KEYS[k].t2 } : null; };

function spurGear({ module: m, teeth: z, width: b, bore = 0, keyway = false }) {
  const wire = piecesFace(gearProfile({ module: m, teeth: z }).pieces);
  return boreAndKeyway(extrudeWire(wire, b), bore, b, keyway);
}

/** A planar closed wire (z = 0) extruded along +Z. */
function extrudeWire(wire, h) {
  const r = R();
  return r.basicFaceExtrusion(r.makeFace(wire), new r.Vector([0, 0, h]));
}

/**
 * Helical gear: the transverse profile (transverse module mn / cos β and pressure angle) swept along the axis
 * while turning — a screw sweep with lead π d / tan β (right hand turns counter-clockwise going up).
 */
function helicalGear({ module: mn, teeth: z, width: b, bore = 0, keyway = false, helixAngle = 15, hand = 'right' }) {
  const beta = Math.max(0, Math.min(45, Number(helixAngle) || 0));
  if (beta < 1e-6) return spurGear({ module: mn, teeth: z, width: b, bore, keyway });
  const { mt, alphaT } = helicalTransverse(mn, beta);
  // The ISO 53 rack in the normal section (tip radius 0.38 mn) seen in the transverse plane: an elliptic tip.
  const prof = gearProfile({ module: mt, teeth: z, pressureAngle: alphaT, ha: mn, hf: 1.25 * mn, rho: 0.38 * mn, rhoX: (0.38 * mn) / Math.cos((beta * Math.PI) / 180) });
  const wire = piecesFace(prof.pieces);
  const lead = (Math.PI * mt * z) / Math.tan((beta * Math.PI) / 180);
  const r = R(); const oc = r.getOC();
  const spine = r.assembleWire([r.makeLine([0, 0, 0], [0, 0, b])]);
  const aux = r.makeHelix(lead, b, 1, [0, 0, 0], [0, 0, 1], hand === 'left');
  const builder = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
  let solid;
  try {
    builder.SetMode(aux.wrapped, false, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
    builder.Add(wire.wrapped, false, false);
    builder.Build();
    builder.MakeSolid();
    solid = r.cast(builder.Shape());
    if (r.measureVolume(solid) < 0) solid = r.cast(solid.wrapped.Reversed());
  } finally { builder.delete(); }
  return boreAndKeyway(solid, bore, b, keyway);
}

/** Helical gear figures: transverse module, pitch diameter, lead, twist over the face width (degrees). */
export function helicalGeometry({ module: mn, teeth: z, width: b, helixAngle = 15 }) {
  const { mt, alphaT } = helicalTransverse(mn, helixAngle);
  const d = mt * z;
  const lead = helixAngle > 0 ? (Math.PI * d) / Math.tan((helixAngle * Math.PI) / 180) : Infinity;
  return { mt, alphaT, pitchDiameter: d, tipDiameter: d + 2 * mn, rootDiameter: d - 2.5 * mn, lead, twist: Number.isFinite(lead) ? (360 * b) / lead : 0 };
}

/**
 * Straight bevel gear (90° shaft angle with a `mateTeeth` partner), apex on +Z at A = rp / tan δ above the back
 * plane: the tooth form of the back sphere (spherical involute flanks, gears.js bevelSphericalSection) is
 * projected from the apex onto two planes and lofted straight between them — every flank is an exact cone through
 * the apex — then trimmed by the blank: the back cone (perpendicular to the pitch cone at the outer cone distance
 * Re, the flat back face under it), the front cone at Re − b, the bore. z = 0 is the pitch circle's plane.
 */
function bevelGear({ module: m, teeth: z, mateTeeth: z2, width: b, bore = 0, keyway = false }) {
  const r = R();
  const sec = bevelSphericalSection({ module: m, teeth: z, mateTeeth: z2 });
  const { delta, Re, rp } = sec; const A = sec.apex;
  const face = Math.min(b, sec.maxWidth);
  const gen = [Math.sin(delta), -Math.cos(delta)]; // apex → pitch point, (r, z)
  const nrm = [Math.cos(delta), Math.sin(delta)]; // along the back cone, outward
  const Po = [rp, 0]; const Pi = [gen[0] * (Re - face), A + gen[1] * (Re - face)];
  const sa = 2.5 * m; const sb = 2.5 * m;
  const at = (P, s) => [P[0] + nrm[0] * s, P[1] + nrm[1] * s];
  const ob = at(Po, -sb); const oa = at(Po, sa); const ia = at(Pi, sa); const ib = at(Pi, -sb);
  const blank = revolveProfile([[0, ob[1]], ob, oa, ia, ib, [0, ib[1]]]);
  // The tooth cones: the back-sphere outline projected from the apex onto z = zLow and z = zHigh.
  const zLow = ob[1] - 1; const zHigh = Math.min(A - 0.05 * Re, Math.max(ia[1], oa[1]) + 1);
  const wireAt = (zp) => {
    const h = A - zp;
    const pieces = sec.pieces.map((p) => (p.kind === 'cone'
      ? { kind: 'arc', r: h * Math.tan(p.gamma), a0: p.phi0, a1: p.phi1 }
      : { kind: 'curve', pts: p.pts.map(([gm, ph]) => [h * Math.tan(gm) * Math.cos(ph), h * Math.tan(gm) * Math.sin(ph)]) }));
    return piecesFace(pieces, zp);
  };
  const teeth = r.loft([wireAt(zLow), wireAt(zHigh)], { ruled: true });
  let solid = teeth.intersect(blank, { simplify: false });
  if (bore > 0) {
    solid = solid.cut(r.makeCylinder(bore / 2, A + 10 - ob[1], [0, 0, ob[1] - 1], [0, 0, 1]));
    const k = keyway ? KEYS[keyForShaft(bore) ?? ''] : null;
    if (k) solid = solid.cut(r.makeBox([-k.b / 2, 0, ob[1] - 1], [k.b / 2, bore / 2 + k.t2, A + 5]));
  }
  return solid;
}

/** Rack (ISO 53 basic rack, root fillets 0.38 m): `teeth` along +X, pitch line y = 0, base at y = −height, z 0 … width. */
function gearRack({ module: m, teeth, width, height }) {
  const pts = rackOutline({ module: m, count: Math.max(1, Math.round(teeth)), height: Math.max(1.25 * m + 0.5, Number(height)) });
  return filletedPolygon(pts).sketchOnPlane('XY').extrude(width);
}

/** A replicad drawing of a polygon with optional fillets at its corners ({ p, r }). */
function filletedPolygon(corners) {
  const n = corners.length;
  const pts = corners.map((c) => c.p);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const segs = corners.map((c, i) => {
    if (!c.r) return { start: c.p, end: c.p, mid: null };
    const prev = pts[(i - 1 + n) % n]; const next = pts[(i + 1) % n];
    const u = unit2(sub(prev, c.p)); const v = unit2(sub(next, c.p));
    const ang = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    const t = c.r / Math.tan(ang / 2);
    const bis = unit2([u[0] + v[0], u[1] + v[1]]);
    const dc = c.r / Math.sin(ang / 2);
    const centre = [c.p[0] + bis[0] * dc, c.p[1] + bis[1] * dc];
    const a = [c.p[0] + u[0] * t, c.p[1] + u[1] * t]; const b = [c.p[0] + v[0] * t, c.p[1] + v[1] * t];
    const mid = [centre[0] - bis[0] * c.r, centre[1] - bis[1] * c.r];
    return { start: a, end: b, mid };
  });
  let d = R().draw(segs[0].start);
  if (segs[0].mid) d = d.threePointsArcTo(segs[0].end, segs[0].mid);
  for (let i = 1; i < n; i++) {
    d = d.lineTo(segs[i].start);
    if (segs[i].mid) d = d.threePointsArcTo(segs[i].end, segs[i].mid);
  }
  return d.close();
}

/** DIN 7721 T-profile synchronous belt pulley, z 0 … width, with bore and optional keyway. */
function timingPulley({ size, teeth, width, bore = 0, keyway = false }) {
  const wire = piecesFace(pulleyProfile(size, Math.round(teeth)).pieces);
  return boreAndKeyway(extrudeWire(wire, width), bore, width, keyway);
}

/** A hollow pipe bend: the annulus (od, wall) swept along an arc of radius R through `angle` degrees. */
export function pipeBend(od, wall, radius, angle) {
  const ro = od / 2; const ri = ro - wall;
  return R().drawCircle(ro).translate([-radius, 0]).cut(R().drawCircle(ri).translate([-radius, 0]))
    .sketchOnPlane('XY').revolve([0, 1, 0], { origin: [0, 0, 0], angle }).translate([radius, 0, 0]);
}

function elbow(dn, angle) {
  const p = PIPES[dn];
  return pipeBend(p.od, p.wall, p.elbow, angle);
}

function pipeTee(dn) {
  const p = PIPES[dn]; const ro = p.od / 2; const ri = ro - p.wall; const C = p.tee;
  const outer = R().makeCylinder(ro, 2 * C, [-C, 0, 0], [1, 0, 0]).fuse(R().makeCylinder(ro, C, [0, 0, 0], [0, 0, 1]));
  const inner = R().makeCylinder(ri, 2 * C + 2, [-C - 1, 0, 0], [1, 0, 0]).fuse(R().makeCylinder(ri, C + 1, [0, 0, 0], [0, 0, 1]));
  return outer.cut(inner);
}

/**
 * EN 1092-1 type 11 weld-neck flange with a B1 raised face: the raised face d1 × f1 at z 0 … f1, the plate
 * (D, C) above it, the hub from N (with the R1 fillet) tapering to the pipe's outside diameter, the straight
 * weld end H2 up to z = H; the bore = the pipe's inside diameter; n holes of L on the bolt circle K.
 */
function flange(dn) {
  const p = PIPES[dn]; const f = p.flange;
  const ri = p.od / 2 - f.S; // the flange's own bore (A − 2S), welded to the pipe
  const zp = f.f1 + f.C; // top of the plate
  const r1 = f.R1; const k = Math.SQRT1_2;
  const prof = [[ri, 0], [f.d1 / 2, 0], [f.d1 / 2, f.f1], [f.D / 2, f.f1], [f.D / 2, zp], [f.N / 2 + r1, zp], { arc: [f.N / 2 + r1 - r1 * k, zp + r1 - r1 * k] }, [f.N / 2, zp + r1], [p.od / 2, f.H - f.H2], [p.od / 2, f.H], [ri, f.H]];
  let s = revolveProfile(prof);
  for (let i = 0; i < f.n; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / f.n;
    s = s.cut(R().makeCylinder(f.L / 2, f.H + 2, [(f.K / 2) * Math.cos(a), (f.K / 2) * Math.sin(a), -1], [0, 0, 1]));
  }
  return s;
}

/**
 * The solid of a standard part at its own origin (see the header for the orientation). `modelled`: model the
 * ISO threads (else cosmetic); by default the part's own `threads` choice ('modelled' → true).
 */
export function stdShape(p, { modelled = p.threads === 'modelled' } = {}) {
  const mod = Boolean(modelled && STD_ITEMS[p.kind]?.threads);
  // Modelled threads take seconds: the same part (kind, size, length, options) is made once, then copied.
  if (!mod) return buildStdShape(p, false);
  const key = `${stdKey(p)}|${p.dn ?? ''}`;
  let s = modelledShapes.get(key);
  if (!s) {
    s = buildStdShape(p, true);
    if (modelledShapes.size > 100) modelledShapes.clear();
    modelledShapes.set(key, s);
  }
  return s.clone();
}
const modelledShapes = new Map();

function buildStdShape(p, mod) {
  const L = Number(p.length) || 0;
  const gear = { module: Number(p.module), teeth: Math.round(Number(p.teeth)), width: Number(p.width), bore: Number(p.bore) || 0, keyway: Boolean(p.keyway) };
  switch (p.kind) {
    case 'hexBolt': return hexBolt(p.size, L, mod);
    case 'socketCap': return socketCap(p.size, L, mod);
    case 'countersunk': return countersunk(p.size, L, mod);
    case 'buttonHead': return buttonHead(p.size, L, mod);
    case 'setScrew': case 'setScrewCup': case 'setScrewSlotted': return setScrew(p.kind, p.size, L, mod);
    case 'stud': case 'stud939': return stud(p.kind, p.size, L, mod);
    case 'hexNut': return nutBody(p.size, HEX_NUT[p.size].s, HEX_NUT[p.size].m, mod);
    case 'hexNut2': return nutBody(p.size, HEX_NUT[p.size].s, HEX_NUT2[p.size], mod);
    case 'thinNut': return nutBody(p.size, HEX_NUT[p.size].s, THIN_NUT[p.size], mod);
    case 'nylonNut': return nylonNut(p.size, mod);
    case 'flatWasher': return flatWasher(p.size);
    case 'springWasher': return springWasher(p.size);
    case 'ballBearing': return ballBearing(p.size);
    case 'dowelPin': return dowelPin(Number(p.size), L);
    case 'parallelPin': return dowelPin(Number(p.size), L, PARALLEL_PIN_C[Number(p.size)]);
    case 'springPin': return springPin(Number(p.size), L);
    case 'retainingRing': case 'boreRing': return retainingRing(p.kind, p.size);
    case 'parallelKey': return parallelKey(p.size, L);
    case 'spurGear': return spurGear(gear);
    case 'helicalGear': return helicalGear({ ...gear, helixAngle: Number(p.helixAngle) || 0, hand: p.hand });
    case 'bevelGear': return bevelGear({ ...gear, mateTeeth: Math.round(Number(p.mateTeeth)) });
    case 'gearRack': return gearRack({ module: Number(p.module), teeth: Number(p.teeth), width: Number(p.width), height: Number(p.height) });
    case 'timingPulley': return timingPulley({ size: p.size, teeth: Number(p.teeth), width: Number(p.width), bore: Number(p.bore) || 0, keyway: Boolean(p.keyway) });
    case 'elbow90': return elbow(p.dn, 90);
    case 'elbow45': return elbow(p.dn, 45);
    case 'pipeTee': return pipeTee(p.dn);
    case 'flange': return flange(p.dn);
    default: throw Object.assign(new Error(`unknown standard part ${p.kind}`), { code: 'std-unknown' });
  }
}

/** Checks a standard part's parameters; returns an error code or null. */
export function stdProblem(p) {
  const item = STD_ITEMS[p.kind];
  if (!item) return 'std-unknown';
  if (item.pipe) return PIPES[p.dn] ? null : 'std-size';
  const teeth = Number(p.teeth);
  if (item.gear) {
    if (!(p.module > 0) || !(teeth >= 6) || teeth > 400 || !(p.width > 0)) return p.kind === 'gearRack' && teeth >= 1 && p.module > 0 && p.width > 0 ? null : 'std-gear';
    if (p.kind === 'helicalGear' && !(Number(p.helixAngle) >= 0 && Number(p.helixAngle) <= 45)) return 'std-gear';
    if (p.kind === 'bevelGear' && !(Number(p.mateTeeth) >= 6 && Number(p.mateTeeth) <= 400)) return 'std-gear';
    const root = p.kind === 'gearRack' ? Infinity : Number(p.module) * (teeth - 2.5);
    if (Number(p.bore) > 0 && Number(p.bore) >= root * 0.9) return 'std-bore';
    return null;
  }
  if (item.pulley) {
    if (!PULLEY_PROFILES[p.size] || !(teeth >= 10 && teeth <= 200) || !(p.width > 0)) return 'std-gear';
    if (Number(p.bore) > 0 && Number(p.bore) >= pulleyGeometry(p.size, teeth).root * 0.9) return 'std-bore';
    return null;
  }
  if (!item.sizes.includes(String(p.size))) return 'std-size';
  if (item.lengths && !(Number(p.length) > 0)) return 'std-length';
  return null;
}

/** The height of the bearing face … top of a part (nuts, washers): the `top` mate plane. */
function topOf(p) {
  if (STD_ITEMS[p.kind]?.nut) return nutHeight(p.kind, p.size);
  return { flatWasher: FLAT_WASHER[p.size]?.h, springWasher: SPRING_WASHER[p.size]?.s }[p.kind] ?? 0;
}

/**
 * Mate references of a library part in its own coordinates (smart fasteners mate through them):
 * axis (+Z through the origin), the bearing face (bolts: head underside; others: bottom), the top face and a
 * radial plane through the axis (`spin`, its normal along +X — a parallel mate to it stops the part spinning).
 */
export function stdMateRefs(p) {
  return {
    axis: { kind: 'axis', point: [0, 0, 0], dir: [0, 0, 1] },
    bottom: { kind: 'plane', point: [0, 0, 0], dir: [0, 0, -1] },
    top: { kind: 'plane', point: [0, 0, topOf(p)], dir: [0, 0, 1] },
    spin: { kind: 'plane', point: [0, 0, 0], dir: [1, 0, 0] },
  };
}

/**
 * The threads of a part in its own coordinates (cosmetic thread records, threads.js cosmeticThread): screws one
 * external (studs two), nuts one internal. `modelled` marks them as modelled (the view then shows no circles).
 */
export function stdThreads(p, { modelled = false } = {}) {
  const item = STD_ITEMS[p.kind];
  if (!item?.threads || !METRIC[p.size]) return [];
  const { d, p: P } = METRIC[p.size];
  const L = Number(p.length) || 0;
  const ext = (z0, length, dir = 1) => cosmeticThread({ centre: [0, 0, z0], dir: [0, 0, dir], length, internal: false, d, P, modelled });
  switch (p.kind) {
    case 'hexBolt': case 'socketCap': case 'countersunk': case 'buttonHead': return [ext(-L, screwThreadLength(p.kind, p.size, L))];
    case 'setScrew': case 'setScrewCup': case 'setScrewSlotted': return [ext(-L, L)];
    case 'stud': case 'stud939': { const b = studThreadLength(p.size, L); return [ext(-studMetalEnd(p.kind, p.size), studMetalEnd(p.kind, p.size)), ext(L, b, -1)]; }
    default: {
      const m = p.kind === 'nylonNut' ? NYLON_NUT[p.size].m : nutHeight(p.kind, p.size);
      return [cosmeticThread({ centre: [0, 0, 0], dir: [0, 0, 1], length: m, internal: true, d, P, modelled })];
    }
  }
}

/** The first thread of a part (or null) — see stdThreads. */
export const stdThread = (p, opts) => stdThreads(p, opts)[0] ?? null;

export { gearProfile, helicalTransverse, bevelGeometry, pulleyGeometry, PULLEY_PROFILES };
