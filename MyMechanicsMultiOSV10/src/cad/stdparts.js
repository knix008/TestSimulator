// The standard parts library: size tables of common ISO / DIN machine elements and parametric solids built
// from them on the kernel. Every part is modelled about the +Z axis (Z up):
//   bolts / screws  head on top (z 0 … k), shank down to z = −L; the head's underside is at z = 0
//   nuts, washers, rings, pins, keys, gears, bearings, flanges   z 0 … thickness (pins: 0 … L)
//   elbows          inlet at the origin along +Z, bending toward +X; tees: run along X, branch along +Z
// Threads are cosmetic (the shank at the nominal diameter, a nut's bore at the minor diameter) — the drawing
// and the view show thread circles, the solid stays light for assemblies.
//
// Values are the nominal ones of the standards (ISO 4017 / 4762 / 4032 / 7089, DIN 127 B, ISO 15 series 60 /
// 62, ISO 8734, DIN 471, DIN 6885 A, ISO 4200 pipe, ASME B16.9 elbow / tee lengths, EN 1092-1 PN16 flanges);
// a few secondary dimensions (lug sizes, hub sizes, ball sizes) are simplified. No DOM.
import { rep } from './kernel.js';

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

/** ISO 4032 hex nut: s, m (height). */
export const HEX_NUT = {
  M3: { s: 5.5, m: 2.4 }, M4: { s: 7, m: 3.2 }, M5: { s: 8, m: 4.7 }, M6: { s: 10, m: 5.2 }, M8: { s: 13, m: 6.8 },
  M10: { s: 16, m: 8.4 }, M12: { s: 18, m: 10.8 }, M16: { s: 24, m: 14.8 }, M20: { s: 30, m: 18 }, M24: { s: 36, m: 21.5 },
};

/** ISO 7089 plain washer: d1 (hole), d2 (outside), h. */
export const FLAT_WASHER = {
  M3: { d1: 3.2, d2: 7, h: 0.5 }, M4: { d1: 4.3, d2: 9, h: 0.8 }, M5: { d1: 5.3, d2: 10, h: 1 }, M6: { d1: 6.4, d2: 12, h: 1.6 },
  M8: { d1: 8.4, d2: 16, h: 1.6 }, M10: { d1: 10.5, d2: 20, h: 2 }, M12: { d1: 13, d2: 24, h: 2.5 }, M16: { d1: 17, d2: 30, h: 3 },
  M20: { d1: 21, d2: 37, h: 3 }, M24: { d1: 25, d2: 44, h: 4 },
};

/** DIN 127 B spring lock washer: d1, d2, s (section thickness). */
export const SPRING_WASHER = {
  M3: { d1: 3.1, d2: 6.2, s: 0.8 }, M4: { d1: 4.1, d2: 7.6, s: 0.9 }, M5: { d1: 5.1, d2: 9.2, s: 1.2 }, M6: { d1: 6.1, d2: 11.8, s: 1.6 },
  M8: { d1: 8.1, d2: 14.8, s: 2 }, M10: { d1: 10.2, d2: 18.1, s: 2.2 }, M12: { d1: 12.2, d2: 21.1, s: 2.5 }, M16: { d1: 16.2, d2: 27.4, s: 3.5 },
  M20: { d1: 20.2, d2: 33.6, s: 4 }, M24: { d1: 24.5, d2: 40, s: 5 },
};

/** Preferred bolt / screw lengths (ISO 888) and the range each size comes in. */
export const BOLT_LENGTHS = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200];
const LENGTH_RANGE = { M3: [6, 30], M4: [6, 40], M5: [8, 50], M6: [10, 60], M8: [12, 80], M10: [16, 100], M12: [20, 120], M16: [30, 160], M20: [40, 200], M24: [50, 200] };
export const boltLengths = (size) => { const [a, b] = LENGTH_RANGE[size] ?? [6, 200]; return BOLT_LENGTHS.filter((l) => l >= a && l <= b); };

/** Deep-groove ball bearings (ISO 15, series 60 and 62): d (bore), D (outside), B (width), r (chamfer). */
export const BEARINGS = {
  6000: { d: 10, D: 26, B: 8, r: 0.3 }, 6001: { d: 12, D: 28, B: 8, r: 0.3 }, 6002: { d: 15, D: 32, B: 9, r: 0.3 }, 6003: { d: 17, D: 35, B: 10, r: 0.3 },
  6004: { d: 20, D: 42, B: 12, r: 0.6 }, 6005: { d: 25, D: 47, B: 12, r: 0.6 }, 6006: { d: 30, D: 55, B: 13, r: 1 },
  6200: { d: 10, D: 30, B: 9, r: 0.6 }, 6201: { d: 12, D: 32, B: 10, r: 0.6 }, 6202: { d: 15, D: 35, B: 11, r: 0.6 }, 6203: { d: 17, D: 40, B: 12, r: 0.6 },
  6204: { d: 20, D: 47, B: 14, r: 1 }, 6205: { d: 25, D: 52, B: 15, r: 1 }, 6206: { d: 30, D: 62, B: 16, r: 1 },
};
export const BEARING_SIZES = Object.keys(BEARINGS);

/** ISO 8734 dowel pin diameters and lengths. */
export const PIN_DIAMETERS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20];
export const PIN_LENGTHS = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 100];
export const pinLengths = (d) => PIN_LENGTHS.filter((l) => l >= Math.max(6, d * 1.5) && l <= Math.max(20, d * 6));

/** DIN 471 external retaining rings (for shafts d1): s (thickness), d3 (inside, free), a (lug height), b (radial width), d5 (lug hole). */
export const RETAINING_RINGS = {
  10: { s: 1, d3: 9.3, a: 3.3, b: 1.8, d5: 1.2 }, 12: { s: 1, d3: 11, a: 3.3, b: 1.8, d5: 1.2 }, 15: { s: 1, d3: 13.8, a: 3.6, b: 2.2, d5: 1.7 },
  17: { s: 1, d3: 15.7, a: 3.8, b: 2.3, d5: 1.7 }, 20: { s: 1.2, d3: 18.5, a: 4, b: 2.6, d5: 2 }, 25: { s: 1.2, d3: 23.2, a: 4.4, b: 3, d5: 2 },
  30: { s: 1.5, d3: 27.9, a: 5, b: 3.5, d5: 2 }, 35: { s: 1.5, d3: 32.2, a: 5.6, b: 3.9, d5: 2.5 }, 40: { s: 1.75, d3: 36.5, a: 6, b: 4.4, d5: 2.5 },
};
export const RING_SIZES = Object.keys(RETAINING_RINGS);

/** DIN 6885 A parallel keys: b × h for shafts over / up to (mm), and the lengths they come in. */
export const KEYS = {
  '2x2': { b: 2, h: 2, shaft: [6, 8] }, '3x3': { b: 3, h: 3, shaft: [8, 10] }, '4x4': { b: 4, h: 4, shaft: [10, 12] }, '5x5': { b: 5, h: 5, shaft: [12, 17] },
  '6x6': { b: 6, h: 6, shaft: [17, 22] }, '8x7': { b: 8, h: 7, shaft: [22, 30] }, '10x8': { b: 10, h: 8, shaft: [30, 38] }, '12x8': { b: 12, h: 8, shaft: [38, 44] },
  '14x9': { b: 14, h: 9, shaft: [44, 50] }, '16x10': { b: 16, h: 10, shaft: [50, 58] }, '18x11': { b: 18, h: 11, shaft: [58, 65] }, '20x12': { b: 20, h: 12, shaft: [65, 75] },
};
export const KEY_SIZES = Object.keys(KEYS);
export const KEY_LENGTHS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50, 56, 63, 70, 80, 90, 100];
export const keyLengths = (size) => { const k = KEYS[size]; return KEY_LENGTHS.filter((l) => l >= k.b * 1.5 && l <= k.b * 10); };
/** The key for a shaft diameter (DIN 6885 shaft ranges), or null. */
export const keyForShaft = (d) => KEY_SIZES.find((s) => d > KEYS[s].shaft[0] && d <= KEYS[s].shaft[1]) ?? null;

/** Spur gear modules (ISO 54, first choice). */
export const GEAR_MODULES = [0.5, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/** Pipe (ISO 4200 / ASME B36.10 Sch 40): outside diameter, wall; B16.9 long-radius elbow and tee centre-to-end; EN 1092-1 PN16 weld-neck flange. */
export const PIPES = {
  DN15: { od: 21.3, wall: 2.77, elbow: 38.1, tee: 25.4, flange: { D: 95, K: 65, n: 4, L: 14, C: 16, N: 32, H: 38 } },
  DN20: { od: 26.9, wall: 2.87, elbow: 28.6, tee: 28.6, flange: { D: 105, K: 75, n: 4, L: 14, C: 18, N: 39, H: 40 } },
  DN25: { od: 33.7, wall: 3.38, elbow: 38.1, tee: 38.1, flange: { D: 115, K: 85, n: 4, L: 14, C: 18, N: 46, H: 40 } },
  DN32: { od: 42.4, wall: 3.56, elbow: 47.8, tee: 47.6, flange: { D: 140, K: 100, n: 4, L: 18, C: 18, N: 56, H: 42 } },
  DN40: { od: 48.3, wall: 3.68, elbow: 57.2, tee: 57.2, flange: { D: 150, K: 110, n: 4, L: 18, C: 18, N: 64, H: 45 } },
  DN50: { od: 60.3, wall: 3.91, elbow: 76.2, tee: 63.5, flange: { D: 165, K: 125, n: 4, L: 18, C: 18, N: 74, H: 45 } },
  DN65: { od: 76.1, wall: 5.16, elbow: 95.3, tee: 76.2, flange: { D: 185, K: 145, n: 8, L: 18, C: 18, N: 92, H: 45 } },
  DN80: { od: 88.9, wall: 5.49, elbow: 114.3, tee: 85.7, flange: { D: 200, K: 160, n: 8, L: 18, C: 20, N: 105, H: 50 } },
  DN100: { od: 114.3, wall: 6.02, elbow: 152.4, tee: 104.8, flange: { D: 220, K: 180, n: 8, L: 18, C: 20, N: 131, H: 52 } },
};
export const PIPE_SIZES = Object.keys(PIPES);

// ───────────────────────── the catalogue (what the library shows)

/**
 * Library items by category. `sizes`: the size choices; `lengths(size)`: length choices (when the item has a
 * length); `material`: the material a new part gets; `standard`: the standard's number.
 */
export const STD_CATEGORIES = [
  { id: 'bolts', icon: 'hexBolt', items: ['hexBolt', 'socketCap'] },
  { id: 'nuts', icon: 'hexNut', items: ['hexNut'] },
  { id: 'washers', icon: 'flatWasher', items: ['flatWasher', 'springWasher'] },
  { id: 'bearings', icon: 'ballBearing', items: ['ballBearing'] },
  { id: 'pins', icon: 'dowelPin', items: ['dowelPin', 'retainingRing', 'parallelKey'] },
  { id: 'gears', icon: 'spurGear', items: ['spurGear'] },
  { id: 'fittings', icon: 'pipeElbow', items: ['elbow90', 'elbow45', 'pipeTee', 'flange'] },
];

export const STD_ITEMS = {
  hexBolt: { standard: 'ISO 4017', sizes: METRIC_SIZES, lengths: boltLengths, material: 'steel-4340', icon: 'hexBolt' },
  socketCap: { standard: 'ISO 4762', sizes: METRIC_SIZES, lengths: boltLengths, material: 'steel-4340', icon: 'socketCap' },
  hexNut: { standard: 'ISO 4032', sizes: METRIC_SIZES, material: 'steel-1020', icon: 'hexNut' },
  flatWasher: { standard: 'ISO 7089', sizes: METRIC_SIZES, material: 'steel-1020', icon: 'flatWasher' },
  springWasher: { standard: 'DIN 127 B', sizes: METRIC_SIZES, material: 'steel-4340', icon: 'springWasher' },
  ballBearing: { standard: 'ISO 15', sizes: BEARING_SIZES, material: 'stainless-304', icon: 'ballBearing' },
  dowelPin: { standard: 'ISO 8734', sizes: PIN_DIAMETERS.map(String), lengths: (s) => pinLengths(Number(s)), material: 'steel-4340', icon: 'dowelPin' },
  retainingRing: { standard: 'DIN 471', sizes: RING_SIZES, material: 'steel-4340', icon: 'retainingRing' },
  parallelKey: { standard: 'DIN 6885 A', sizes: KEY_SIZES, lengths: keyLengths, material: 'steel-1020', icon: 'parallelKey' },
  spurGear: { standard: 'ISO 53', sizes: GEAR_MODULES.map(String), material: 'steel-4340', icon: 'spurGear', gear: true },
  elbow90: { standard: 'ASME B16.9', sizes: PIPE_SIZES, material: 'steel-1020', icon: 'pipeElbow', pipe: true },
  elbow45: { standard: 'ASME B16.9', sizes: PIPE_SIZES, material: 'steel-1020', icon: 'pipeElbow45', pipe: true },
  pipeTee: { standard: 'ASME B16.9', sizes: PIPE_SIZES, material: 'steel-1020', icon: 'pipeTee', pipe: true },
  flange: { standard: 'EN 1092-1 PN16', sizes: PIPE_SIZES, material: 'steel-1020', icon: 'pipeFlange', pipe: true },
};
export const STD_KINDS = Object.keys(STD_ITEMS);

/** The parameters a new library part starts with (the first size / a middle length). */
export function stdDefaults(kind, base = {}) {
  const item = STD_ITEMS[kind];
  if (!item) throw new Error(`unknown standard part ${kind}`);
  const size = item.pipe ? (PIPES[base.dn] ? base.dn : 'DN25') : item.sizes.includes(String(base.size)) ? String(base.size) : item.gear ? '2' : item.sizes[Math.min(item.sizes.length - 1, kind === 'ballBearing' ? 4 : 4)];
  const lengths = item.lengths?.(size) ?? [];
  const length = lengths.includes(Number(base.length)) ? Number(base.length) : lengths[Math.floor(lengths.length / 3)] ?? 0;
  const out = { kind, size: item.pipe ? undefined : size, dn: item.pipe ? size : base.dn ?? 'DN25', length };
  if (item.gear) Object.assign(out, { module: Number(size), teeth: base.teeth ?? 24, width: base.width ?? 20, bore: base.bore ?? 10 });
  return out;
}

/** The size key of a part's parameters (the size, or the pipe size, or the module of a gear). */
export const sizeOf = (p) => (STD_ITEMS[p.kind]?.pipe ? p.dn : STD_ITEMS[p.kind]?.gear ? String(p.module) : String(p.size));

/** The standard designation: "ISO 4017 M8×30", "6204", "DIN 6885 A 8×7×40", "Spur gear m2 z24". */
export function designation(p, names = {}) {
  const item = STD_ITEMS[p.kind];
  if (!item) return '?';
  const x = '×';
  switch (p.kind) {
    case 'hexBolt': case 'socketCap': return `${item.standard} ${p.size}${x}${p.length}`;
    case 'hexNut': return `${item.standard} ${p.size}`;
    case 'flatWasher': return `${item.standard} ${METRIC[p.size]?.d ?? p.size}`;
    case 'springWasher': return `${item.standard}${METRIC[p.size]?.d ?? p.size}`;
    case 'ballBearing': return `${p.size}`;
    case 'dowelPin': return `${item.standard} ${p.size}${x}${p.length}`;
    case 'retainingRing': return `${item.standard} ${p.size}${x}${RETAINING_RINGS[p.size]?.s ?? ''}`;
    case 'parallelKey': return `${item.standard} ${String(p.size).replace('x', x)}${x}${p.length}`;
    case 'spurGear': return `${names.spurGear ?? 'Spur gear'} m${p.module} z${p.teeth}`;
    case 'elbow90': return `${names.elbow90 ?? 'Elbow 90°'} ${p.dn}`;
    case 'elbow45': return `${names.elbow45 ?? 'Elbow 45°'} ${p.dn}`;
    case 'pipeTee': return `${names.pipeTee ?? 'Tee'} ${p.dn}`;
    case 'flange': return `${names.flange ?? 'Flange'} ${p.dn} PN16`;
    default: return p.kind;
  }
}

/**
 * Rows of the size table the library shows for an item: [ [column keys], [[size, …values]] ]. Column keys are
 * i18n keys of `std.col.*`.
 */
export function sizeTable(kind) {
  const rows = (table, cols) => Object.entries(table).map(([k, v]) => [k, ...cols.map((c) => v[c])]);
  switch (kind) {
    case 'hexBolt': return [['d', 's', 'k', 'p'], METRIC_SIZES.map((s) => [s, METRIC[s].d, HEX_BOLT[s].s, HEX_BOLT[s].k, METRIC[s].p])];
    case 'socketCap': return [['d', 'dk', 'k', 'sSocket'], METRIC_SIZES.map((s) => [s, METRIC[s].d, SOCKET_CAP[s].dk, SOCKET_CAP[s].k, SOCKET_CAP[s].s])];
    case 'hexNut': return [['s', 'm', 'p'], METRIC_SIZES.map((s) => [s, HEX_NUT[s].s, HEX_NUT[s].m, METRIC[s].p])];
    case 'flatWasher': return [['d1', 'd2', 'h'], rows(FLAT_WASHER, ['d1', 'd2', 'h'])];
    case 'springWasher': return [['d1', 'd2', 'sThick'], rows(SPRING_WASHER, ['d1', 'd2', 's'])];
    case 'ballBearing': return [['d', 'D', 'B'], rows(BEARINGS, ['d', 'D', 'B'])];
    case 'dowelPin': return [['d', 'lengths'], PIN_DIAMETERS.map((d) => [String(d), d, `${pinLengths(d)[0]}–${pinLengths(d).at(-1)}`])];
    case 'retainingRing': return [['shaft', 'sThick', 'd3'], RING_SIZES.map((s) => [s, Number(s), RETAINING_RINGS[s].s, RETAINING_RINGS[s].d3])];
    case 'parallelKey': return [['b', 'h', 'shaft'], KEY_SIZES.map((s) => [s, KEYS[s].b, KEYS[s].h, `${KEYS[s].shaft[0]}–${KEYS[s].shaft[1]}`])];
    case 'spurGear': return [['module', 'tooth'], GEAR_MODULES.map((m) => [String(m), m, Number((2.25 * m).toFixed(3))])];
    case 'elbow90': case 'elbow45': return [['od', 'wall', 'radius'], PIPE_SIZES.map((s) => [s, PIPES[s].od, PIPES[s].wall, PIPES[s].elbow])];
    case 'pipeTee': return [['od', 'wall', 'centreToEnd'], PIPE_SIZES.map((s) => [s, PIPES[s].od, PIPES[s].wall, PIPES[s].tee])];
    case 'flange': return [['D', 'K', 'bolts', 'C'], PIPE_SIZES.map((s) => { const f = PIPES[s].flange; return [s, f.D, f.K, `${f.n}×Ø${f.L}`, f.C]; })];
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
 * tapped hole of depth `grip` the longest one that does not bottom out.
 */
export function boltLengthFor(size, grip, { washer = 0, nut = 0, blind = false } = {}) {
  const list = boltLengths(size);
  const p = METRIC[size].p;
  if (blind) {
    const max = washer + grip - p;
    return [...list].reverse().find((l) => l <= max) ?? list[0];
  }
  const need = washer + grip + (nut ? nut + 2 * p : 0);
  return list.find((l) => l >= need - 1e-6) ?? list.at(-1);
}

// ───────────────────────── gear geometry (pure)

const inv = (a) => Math.tan(a) - a;

/**
 * The outline of a spur gear (involute teeth, 20° pressure angle, full-depth: addendum m, dedendum 1.25 m) as a
 * closed polygon [[x, y] …] about the origin. `flank`: points per flank.
 */
export function gearOutline({ module: m, teeth: z, pressureAngle = 20, flank = 6 }) {
  const alpha = (pressureAngle * Math.PI) / 180;
  const rp = (m * z) / 2; const rb = rp * Math.cos(alpha); const ra = rp + m; const rf = Math.max(rp - 1.25 * m, 0.1);
  const half = (r) => Math.PI / (2 * z) + inv(alpha) - inv(Math.acos(Math.min(1, rb / r)));
  const r0 = Math.max(rb, rf);
  const tipHalf = Math.max(half(ra), 0.02 / z);
  const pts = [];
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  for (let i = 0; i < z; i++) {
    const c = (2 * Math.PI * i) / z;
    const rootHalf = half(r0);
    // Root fillet region: radial line from the root circle to the base circle.
    if (rf < r0) pts.push(at(rf, c - rootHalf));
    for (let k = 0; k <= flank; k++) { const r = r0 + ((ra - r0) * k) / flank; pts.push(at(r, c - Math.max(half(r), tipHalf))); }
    pts.push(at(ra, c));
    for (let k = flank; k >= 0; k--) { const r = r0 + ((ra - r0) * k) / flank; pts.push(at(r, c + Math.max(half(r), tipHalf))); }
    if (rf < r0) pts.push(at(rf, c + rootHalf));
    // The root arc to the next tooth.
    const a0 = c + rootHalf; const a1 = c + (2 * Math.PI) / z - rootHalf;
    for (let k = 1; k < 3; k++) pts.push(at(rf, a0 + ((a1 - a0) * k) / 3));
  }
  return pts;
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

/** A solid of revolution about +Z from a closed (r, z) profile. */
function revolveProfile(pts) {
  let d = R().draw(pts[0]);
  for (const p of pts.slice(1)) d = d.lineTo(p);
  return d.close().sketchOnPlane('XZ').revolve([0, 0, 1], { origin: [0, 0, 0] });
}

/** A regular hexagon prism, across flats `s`, z 0 … h. */
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

/** The shank of a bolt / screw: diameter d from z = +overlap down to z = −L, with a pitch-sized end chamfer. */
function shank(d, L, p) {
  const c = Math.min(p, d / 4);
  return revolveProfile([[0, -L], [d / 2 - c, -L], [d / 2, -L + c], [d / 2, EPS * 5], [0, EPS * 5]]);
}

function hexBolt(size, L) {
  const m = METRIC[size]; const h = HEX_BOLT[size];
  return chamferedHex(h.s, h.k).fuse(shank(m.d, L, m.p));
}

function socketCap(size, L) {
  const m = METRIC[size]; const h = SOCKET_CAP[size];
  const c = h.k * 0.08;
  const head = revolveProfile([[0, 0], [h.dk / 2, 0], [h.dk / 2, h.k - c], [h.dk / 2 - c, h.k], [0, h.k]]);
  const socket = hexPrism(h.s, h.t + 1, h.k - h.t);
  return head.cut(socket).fuse(shank(m.d, L, m.p));
}

function hexNut(size) {
  const m = METRIC[size]; const n = HEX_NUT[size];
  const minor = m.d - 1.0825 * m.p;
  return chamferedHex(n.s, n.m, true).cut(R().makeCylinder(minor / 2, n.m + 2, [0, 0, -1], [0, 0, 1]));
}

function flatWasher(size) {
  const w = FLAT_WASHER[size];
  return revolveProfile([[w.d1 / 2, 0], [w.d2 / 2, 0], [w.d2 / 2, w.h], [w.d1 / 2, w.h]]);
}

function springWasher(size) {
  const w = SPRING_WASHER[size];
  const ring = R().drawCircle(w.d2 / 2).cut(R().drawCircle(w.d1 / 2));
  const gap = R().drawRectangle(w.s, w.d2).translate([0, w.d2 / 2]);
  return ring.cut(gap).sketchOnPlane('XY').extrude(w.s);
}

/** Ball count and ball diameter of a bearing (simplified: Dw ≈ 0.3 (D − d)). */
export function bearingBalls(size) {
  const b = BEARINGS[size];
  const Dw = 0.3 * (b.D - b.d);
  const pitch = (b.d + b.D) / 2;
  return { Dw, pitch, count: Math.max(6, Math.floor((Math.PI * pitch) / (Dw * 1.55))) };
}

function ballBearing(size) {
  const b = BEARINGS[size];
  const { Dw, pitch, count } = bearingBalls(size);
  const rp = pitch / 2; const c = Math.min(b.r, b.B * 0.1);
  const ringProfile = (r0, r1) => [[r0 + c, 0], [r1 - c, 0], [r1, c], [r1, b.B - c], [r1 - c, b.B], [r0 + c, b.B], [r0, b.B - c], [r0, c]];
  const groove = () => R().drawCircle(Dw * 0.515).translate([rp, b.B / 2]).sketchOnPlane('XZ').revolve([0, 0, 1], { origin: [0, 0, 0] });
  const inner = revolveProfile(ringProfile(b.d / 2, rp - Dw * 0.32)).cut(groove());
  const outer = revolveProfile(ringProfile(rp + Dw * 0.32, b.D / 2)).cut(groove());
  const balls = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    balls.push(R().makeSphere(Dw / 2).translate([rp * Math.cos(a), rp * Math.sin(a), b.B / 2]));
  }
  return R().makeCompound([inner, outer, ...balls]);
}

/** ISO 8734 pin: chamfer at both ends. */
export const pinChamfer = (d) => Math.max(0.2, Math.min(0.12 * d, 1.6));
function dowelPin(d, L) {
  const r = d / 2; const c = pinChamfer(d);
  return revolveProfile([[0, 0], [r - c, 0], [r, c], [r, L - c], [r - c, L], [0, L]]);
}

function retainingRing(size) {
  const g = RETAINING_RINGS[size];
  const r3 = g.d3 / 2;
  // Solids, not 2D drawings: the lug circles meet the ring tangentially, which the 2D booleans cannot cut.
  let shape = revolveProfile([[r3, 0], [r3 + g.b, 0], [r3 + g.b, g.s], [r3, g.s]]);
  // Two lugs either side of the opening (on +Y), each with its hole for the pliers.
  const open = g.a * 0.45;
  const lug = (sx) => { const lx = sx * (open / 2 + g.a / 2); return [lx, Math.sqrt(Math.max(0, (r3 + g.a / 2 + 0.02) ** 2 - lx * lx))]; };
  for (const sx of [-1, 1]) { const [x, y] = lug(sx); shape = shape.fuse(R().makeCylinder(g.a / 2, g.s, [x, y, 0], [0, 0, 1])); }
  shape = shape.cut(R().makeBox([-open / 2, 0, -1], [open / 2, r3 + g.b + g.a * 2, g.s + 1]));
  for (const sx of [-1, 1]) { const [x, y] = lug(sx); shape = shape.cut(R().makeCylinder(g.d5 / 2, g.s + 2, [x, y, -1], [0, 0, 1])); }
  return shape;
}

function parallelKey(size, L) {
  const k = KEYS[size];
  return R().drawRoundedRectangle(L, k.b, k.b / 2 - 1e-4).sketchOnPlane('XY').extrude(k.h);
}

function spurGear({ module: m, teeth: z, width: b, bore = 0 }) {
  const pts = gearOutline({ module: m, teeth: z });
  let d = R().draw(pts[0]);
  for (const p of pts.slice(1)) d = d.lineTo(p);
  let drawing = d.close();
  const { root } = gearCircles({ module: m, teeth: z });
  if (bore > 0 && bore < root * 0.9) drawing = drawing.cut(R().drawCircle(bore / 2));
  return drawing.sketchOnPlane('XY').extrude(b);
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

/** EN 1092-1 weld-neck flange: plate z 0 … C, hub to z = H, bore = the pipe's inside diameter. */
function flange(dn) {
  const p = PIPES[dn]; const f = p.flange;
  const ri = p.od / 2 - p.wall;
  let s = revolveProfile([[ri, 0], [f.D / 2, 0], [f.D / 2, f.C], [f.N / 2, f.C], [p.od / 2, f.H], [ri, f.H]]);
  for (let i = 0; i < f.n; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / f.n;
    s = s.cut(R().makeCylinder(f.L / 2, f.C + 2, [(f.K / 2) * Math.cos(a), (f.K / 2) * Math.sin(a), -1], [0, 0, 1]));
  }
  return s;
}

/** The solid of a standard part at its own origin (see the header for the orientation). */
export function stdShape(p) {
  const L = Number(p.length) || 0;
  switch (p.kind) {
    case 'hexBolt': return hexBolt(p.size, L);
    case 'socketCap': return socketCap(p.size, L);
    case 'hexNut': return hexNut(p.size);
    case 'flatWasher': return flatWasher(p.size);
    case 'springWasher': return springWasher(p.size);
    case 'ballBearing': return ballBearing(p.size);
    case 'dowelPin': return dowelPin(Number(p.size), L);
    case 'retainingRing': return retainingRing(p.size);
    case 'parallelKey': return parallelKey(p.size, L);
    case 'spurGear': return spurGear({ module: Number(p.module), teeth: Math.round(Number(p.teeth)), width: Number(p.width), bore: Number(p.bore) || 0 });
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
  if (item.gear) {
    if (!(p.module > 0) || !(p.teeth >= 6) || p.teeth > 400 || !(p.width > 0)) return 'std-gear';
    return null;
  }
  if (!item.sizes.includes(String(p.size))) return 'std-size';
  if (item.lengths && !(Number(p.length) > 0)) return 'std-length';
  return null;
}

/**
 * Mate references of a library part in its own coordinates (smart fasteners mate through them):
 * axis (+Z through the origin), the bearing face (bolts: head underside; others: bottom) and the top face.
 */
export function stdMateRefs(p) {
  const top = { hexNut: HEX_NUT[p.size]?.m, flatWasher: FLAT_WASHER[p.size]?.h, springWasher: SPRING_WASHER[p.size]?.s }[p.kind] ?? 0;
  return {
    axis: { kind: 'axis', point: [0, 0, 0], dir: [0, 0, 1] },
    bottom: { kind: 'plane', point: [0, 0, 0], dir: [0, 0, -1] },
    top: { kind: 'plane', point: [0, 0, top], dir: [0, 0, 1] },
  };
}

/** Thread data of a bolt (for the cosmetic thread circles): { centre, dir, radius, pitch, length }. */
export function stdThread(p) {
  if (p.kind !== 'hexBolt' && p.kind !== 'socketCap') return null;
  const m = METRIC[p.size];
  const L = Number(p.length) || 0;
  const tl = Math.min(L, 2 * m.d + 6);
  return { centre: [0, 0, -L], dir: [0, 0, 1], radius: m.d / 2, pitch: m.p, length: tl, internal: false };
}
