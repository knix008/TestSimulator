// Hole Wizard beyond ISO metric simple / counterbore / countersink / tapped with blind or through:
//   standards     ISO metric (holes in features.js) and ANSI inch: clearance (close / normal / loose fits,
//                 ASME B18.2.8), socket head cap screw counterbores (ASME B18.3), 82° flat head countersinks,
//                 UNC / UNF tap drills (75 % thread)
//   tapered tap   NPT pipe taps: the tap drill tapering 1:16 on the diameter
//   slots         the hole's cross-section stretched along a slot (straight, counterbore, countersink)
//   end condition up to next, up to vertex, up to surface, offset from surface (extrude-more.js)
import { rep } from './kernel.js';
import { codeError } from './features.js';
import { sizeAround } from './features.js';
import { capsAt, endCondition } from './extrude-more.js';

const IN = 25.4;

/** ANSI inch fastener sizes: [name, major Ø (in), clearance close / normal / loose (in), SHCS counterbore Ø, depth (in), 82° countersink Ø (in)]. */
export const ANSI_SIZES = [
  ['#4', 0.112, 0.1160, 0.1285, 0.1440, 0.219, 0.112, 0.255],
  ['#6', 0.138, 0.1440, 0.1495, 0.1695, 0.281, 0.138, 0.307],
  ['#8', 0.164, 0.1695, 0.1770, 0.1960, 0.312, 0.164, 0.359],
  ['#10', 0.190, 0.1960, 0.2010, 0.2210, 0.375, 0.190, 0.411],
  ['1/4', 0.250, 0.2570, 0.2660, 0.2810, 0.438, 0.250, 0.531],
  ['5/16', 0.3125, 0.3230, 0.3320, 0.3480, 0.531, 0.312, 0.656],
  ['3/8', 0.375, 0.3860, 0.3970, 0.4219, 0.625, 0.375, 0.781],
  ['7/16', 0.4375, 0.4531, 0.4687, 0.4844, 0.719, 0.438, 0.844],
  ['1/2', 0.500, 0.5156, 0.5312, 0.5625, 0.812, 0.500, 0.938],
  ['5/8', 0.625, 0.6406, 0.6562, 0.6875, 1.000, 0.625, 1.188],
  ['3/4', 0.750, 0.7656, 0.7812, 0.8125, 1.188, 0.750, 1.438],
  ['1', 1.000, 1.0156, 1.0312, 1.0625, 1.625, 1.000, 1.938],
];

/** UNC / UNF taps: [name, major Ø (in), threads per inch, tap drill Ø (in)]. */
export const ANSI_TAPS = [
  ['#4-40 UNC', 0.112, 40, 0.0890], ['#6-32 UNC', 0.138, 32, 0.1065], ['#8-32 UNC', 0.164, 32, 0.1360], ['#10-24 UNC', 0.190, 24, 0.1495],
  ['#10-32 UNF', 0.190, 32, 0.1590], ['1/4-20 UNC', 0.250, 20, 0.2010], ['1/4-28 UNF', 0.250, 28, 0.2130], ['5/16-18 UNC', 0.3125, 18, 0.2570],
  ['5/16-24 UNF', 0.3125, 24, 0.2720], ['3/8-16 UNC', 0.375, 16, 0.3125], ['3/8-24 UNF', 0.375, 24, 0.3320], ['7/16-14 UNC', 0.4375, 14, 0.3680],
  ['1/2-13 UNC', 0.500, 13, 0.4219], ['1/2-20 UNF', 0.500, 20, 0.4531], ['5/8-11 UNC', 0.625, 11, 0.5312], ['3/4-10 UNC', 0.750, 10, 0.6562],
  ['1-8 UNC', 1.000, 8, 0.8750],
];

/** NPT pipe taps: [name, pipe OD (in), threads per inch, tap drill Ø (in)]. */
export const NPT_SIZES = [
  ['1/8 NPT', 0.405, 27, 0.3438], ['1/4 NPT', 0.540, 18, 0.4375], ['3/8 NPT', 0.675, 18, 0.5781],
  ['1/2 NPT', 0.840, 14, 0.7188], ['3/4 NPT', 1.050, 14, 0.9219], ['1 NPT', 1.315, 11.5, 1.1563],
];

/** NPT taper: 1 in 16 on the diameter. */
export const NPT_TAPER = 1 / 16;

/** The hole dimensions (mm) of an ANSI inch size for a hole type and fit. */
export function ansiHole(size, kind, fit = 'normal') {
  const row = ANSI_SIZES.find((r) => r[0] === size);
  if (!row) return null;
  const d = row[fit === 'close' ? 2 : fit === 'loose' ? 4 : 3] * IN;
  if (kind === 'counterbore') return { diameter: d, cbDiameter: row[5] * IN, cbDepth: row[6] * IN };
  if (kind === 'countersink') return { diameter: d, csDiameter: row[7] * IN, csAngle: 82 };
  return { diameter: d };
}

/** True when a hole needs this module (the plain blind / through ISO hole is built in features.js). */
export function needsHoleMore(f) {
  return Boolean(f.slot) || f.kind === 'taperedTap' || ['upToNext', 'upToVertex', 'upToSurface', 'offsetFromSurface'].includes(f.end);
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** The (radius, depth) cross-section of a tapered pipe-tap hole: the tap drill narrowing 1:16 on the diameter. */
function taperedProfile(f, depth) {
  const r = Math.max(0.05, num(f.diameter, 10) / 2);
  const lead = 0.01 * Math.max(1, r);
  const rEnd = Math.max(0.05, r - (depth * NPT_TAPER) / 2);
  return [[0, -lead], [r, -lead], [r, 0], [rEnd, depth], [0, depth]];
}

/** A closed polygon (r, z) as a face in the plane spanned by u (radial) and `into` at `at`. */
function sectionFace(pts, at, u, into, mirror = false) {
  const R = rep();
  const P = ([r, z]) => [0, 1, 2].map((k) => at[k] + u[k] * r + into[k] * z);
  const list = mirror ? [...pts.map(([r, z]) => [r, z]), ...pts.slice().reverse().map(([r, z]) => [-r, z])] : pts;
  const clean = list.filter((p, i) => i === 0 || Math.hypot(p[0] - list[i - 1][0], p[1] - list[i - 1][1]) > 1e-9);
  if (Math.hypot(clean[0][0] - clean.at(-1)[0], clean[0][1] - clean.at(-1)[1]) < 1e-9) clean.pop();
  const edges = clean.map((p, i) => R.makeLine(P(p), P(clean[(i + 1) % clean.length]))).filter((e) => e.length === undefined || e.length > 1e-9);
  return R.makeFace(R.assembleWire(edges));
}

/**
 * The tool of one hole at `at` going `into` the material: the revolved cross-section, stretched along a slot
 * when asked (the section square to the slot swept along it, round ends at both).
 */
function oneHole(f, profile, at, into, xDir, cross) {
  const R = rep();
  // The profile's plane holds the axis: x = radial along the sketch x, y = into the material.
  let pen = R.draw(profile[0]);
  for (const q of profile.slice(1)) pen = pen.lineTo(q);
  const round = (p) => pen.close().sketchOnPlane(new R.Plane(p, xDir, cross(xDir, into))).revolve(into, { origin: p });
  if (!f.slot) return round(at);
  // Slot: length along the sketch x turned by slotAngle; the hole's section (mirrored) swept along it.
  const a = (num(f.slotAngle) * Math.PI) / 180;
  const yDir = cross(into, xDir);
  const dir = [0, 1, 2].map((k) => xDir[k] * Math.cos(a) + yDir[k] * Math.sin(a));
  const L = Math.max(1e-3, num(f.slotLength, 10));
  const p0 = [0, 1, 2].map((k) => at[k] - (dir[k] * L) / 2);
  const p1 = [0, 1, 2].map((k) => at[k] + (dir[k] * L) / 2);
  const side = cross(into, dir);
  // The section without its first point on the axis: the right half, then the left half mirrored back.
  const section = sectionFace(profile.slice(1), p0, side, into, true);
  const middle = R.basicFaceExtrusion(section, new R.Vector(dir.map((v) => v * L)));
  return round(p0).fuse(round(p1)).fuse(middle);
}

/**
 * The hole tool with the options above. `points` are the hole centres (world), `fr` the sketch frame (holes go
 * against its normal), `profileOf(depth)` the ISO / ANSI cross-section for a depth.
 */
export function holeMoreTool(f, ctx, points, fr, profileOf, cross) {
  const into = fr.normal.map((v) => -v);
  const big = sizeAround(ctx, 200) * 2;
  const bounded = ['upToNext', 'upToVertex', 'upToSurface', 'offsetFromSurface'].includes(f.end);
  const depth = bounded || f.through ? big : Math.max(0.1, num(f.depth, 10));
  const profile = f.kind === 'taperedTap' ? taperedProfile(f, depth) : profileOf(bounded ? { ...f, through: true } : f, depth);
  let tool = null;
  for (const at of points) {
    const one = oneHole(f, profile, at, into, fr.xDir, cross);
    tool = tool ? tool.fuse(one) : one;
  }
  if (!bounded) return tool;
  // End at the geometry: the long holes cut where the condition says, keeping what starts at the sketch plane.
  // The holes' tops sit a lead (1 % of the radius, at least 0.01) above the sketch plane.
  const lead = 0.01 * Math.max(1, num(f.diameter, 10) / 2);
  const refs = capsAt(tool, fr, into, -lead);
  if (!refs.length) throw codeError('kernel');
  return endCondition(tool, refs, f, ctx, fr, into, '', big, true);
}

