// Smart fasteners: what a picked hole is (diameter, axis, the flat faces at its ends, through or blind,
// how deep) and which fastener stack fits it (bolt size and length, washer, nut) with where each one goes.
// holeOfFace() reads the kernel's faces; fastenerPlan() is plain maths. Coordinates are the part's own.
import { isCylinder, normalize } from './refs.js';
import { axisOfFace } from './assembly.js';
import { fastenerSizeForHole, boltLengthFor, FLAT_WASHER, SPRING_WASHER, METRIC, STD_ITEMS, nutHeight, baseKind, headTable } from './stdparts.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

/** Centre and radius of a circular edge (three points on it). */
function circleOf(edge) {
  const p = [0, 1 / 3, 2 / 3].map((t) => vec(edge.pointAt(t)));
  const ab = sub(p[1], p[0]); const ac = sub(p[2], p[0]);
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const d = 2 * dot(n, n);
  if (d < 1e-18) return null;
  const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const centre = add(p[0], mul(add(mul(cr(n, ab), dot(ac, ac)), mul(cr(ac, n), dot(ab, ab))), 1 / d));
  return { centre, radius: len(sub(p[0], centre)) };
}

/**
 * A hole from one of its cylindrical faces and the body's faces: { diameter, radius, axis: { point, dir },
 * ends: [{ centre, face, normal, open }] (two, along the axis), through, blind, depth } or null when the face
 * is not the inside of a hole (a boss, not a cylinder). An end is open when a flat face of the body meets
 * the hole there with its outward normal pointing away from the hole (a blind hole's bottom points back).
 */
export function holeOfFace(face, faces) {
  if (!face || !isCylinder(face.geomType)) return null;
  const axis = axisOfFace(face);
  if (!axis) return null;
  const dir = normalize(axis.dir);
  const circles = (face.edges ?? []).filter((e) => e.geomType === 'CIRCLE').map(circleOf).filter(Boolean);
  if (!circles.length) return null;
  const radius = circles[0].radius;
  // Inside or outside: the surface normal of a hole points toward its axis.
  try {
    const q = vec(face.pointOnSurface(0.5, 0.5));
    const n = vec(face.normalAt(face.pointOnSurface(0.5, 0.5)));
    const off = sub(q, axis.point);
    const radial = sub(off, mul(dir, dot(off, dir)));
    if (dot(radial, n) > 0) return null;
  } catch { /* keep it */ }
  // The two ends along the axis (a hole cut in pieces can have several circles at the same end).
  const along = (p) => dot(sub(p, axis.point), dir);
  const sorted = [...circles].sort((a, b) => along(a.centre) - along(b.centre));
  const lo = sorted[0]; const hi = sorted.at(-1);
  const depth = along(hi.centre) - along(lo.centre);
  if (depth < 1e-6) return null;
  const mid = mul(add(lo.centre, hi.centre), 0.5);
  const planar = faces.filter((f) => f.geomType === 'PLANE');
  const endInfo = (c) => {
    for (const f of planar) {
      let n;
      try { n = normalize(vec(f.normalAt(f.center))); } catch { continue; }
      if (Math.abs(dot(n, dir)) < 0.999) continue;
      if (Math.abs(dot(sub(c.centre, vec(f.center)), n)) > 1e-4) continue;
      const touches = (f.edges ?? []).some((e) => { if (e.geomType !== 'CIRCLE') return false; const k = circleOf(e); return k && len(sub(k.centre, c.centre)) < 1e-4 && Math.abs(k.radius - radius) < 1e-4; });
      if (!touches) continue;
      return { centre: c.centre, face: f, normal: n, open: dot(n, sub(c.centre, mid)) > 0 };
    }
    return { centre: c.centre, face: null, normal: null, open: false };
  };
  const ends = [endInfo(lo), endInfo(hi)];
  const through = ends.every((e) => e.open);
  return { diameter: 2 * radius, radius, axis: { point: axis.point, dir }, ends, through, blind: !through && ends.some((e) => e.open), depth };
}

/** Bolt / screw kinds a smart fastener can use, and nut kinds. */
export const FASTENER_KINDS = ['hexBolt', 'socketCap', 'countersunk', 'buttonHead', 'hexBolt933', 'hexBolt931', 'socketCap912', 'countersunk7991', 'lowHead7984'];
export const NUT_KINDS = ['hexNut', 'hexNut2', 'thinNut', 'nylonNut', 'hexNut934', 'thinNut439'];

/**
 * The fastener stack for a hole: { size, fit, bolt: { kind, size, length }, washer?, springWasher?, nutWasher?,
 * nut?, entry, exit, grip, stack } or { error }. `entry` (index of the end the bolt goes in) defaults to the open
 * end whose normal points most along `up` (world Z by default, mapped by the caller) — `prefer` forces one.
 * `grip` / `through` / `blindEnd` override the hole's own (a series of holes through stacked parts); `size` /
 * `length` force the size and length (changed after inserting). `stack` lists the parts with the offset of
 * their bearing face along the entry normal (0 = the entry face, negative = into the material; the nut side
 * starts at −grip): [{ role, kind, size, at, flip }] — `flip`: the part faces back toward the entry.
 */
export function fastenerPlan(hole, { kind = 'hexBolt', washer = true, nut = true, nutKind = 'hexNut', nutWasher = false, springWasher = false, prefer = null, up = [0, 0, 1], grip = null, through = null, size: forceSize = null, length: forceLength = null } = {}) {
  if (!hole) return { error: 'not-hole' };
  const open = hole.ends.map((e, i) => (e.open ? i : -1)).filter((i) => i >= 0);
  if (!open.length) return { error: 'no-entry' };
  const entry = prefer != null && open.includes(prefer) ? prefer : open.reduce((best, i) => (dot(hole.ends[i].normal, up) > dot(hole.ends[best].normal, up) + 1e-9 ? i : best), open[0]);
  const exit = 1 - entry;
  const isThrough = through ?? hole.through;
  const fit = forceSize ? { size: forceSize, fit: 'forced' } : fastenerSizeForHole(hole.diameter, { blind: !isThrough });
  if (!fit || !METRIC[fit.size]) return { error: 'too-small' };
  const { size } = fit;
  const boltKind = STD_ITEMS[kind]?.screw ? kind : 'hexBolt';
  const csk = baseKind(boltKind) === 'countersunk';
  if (csk && !headTable(boltKind)[size]) return { error: 'too-large' };
  if (!STD_ITEMS[boltKind].sizes.includes(size)) return { error: 'too-large' };
  const g = grip ?? hole.depth;
  const withWasher = Boolean(washer && !csk);
  const withSpring = Boolean(springWasher && !csk);
  const withNut = Boolean(nut && isThrough);
  const nk = NUT_KINDS.includes(nutKind) && STD_ITEMS[nutKind].sizes.includes(size) ? nutKind : 'hexNut';
  const hw = withWasher ? FLAT_WASHER[size].h : 0;
  const hs = withSpring ? SPRING_WASHER[size].s : 0;
  const hw2 = withNut && nutWasher ? FLAT_WASHER[size].h : 0;
  const hn = withNut ? nutHeight(nk, size) : 0;
  const auto = boltLengthFor(size, g + hw2, { washer: hw + hs, nut: hn, blind: !isThrough, kind: boltKind });
  const lengths = STD_ITEMS[boltKind].lengths(size);
  const length = forceLength && lengths.includes(Number(forceLength)) ? Number(forceLength) : auto;
  const stack = [];
  if (withWasher) stack.push({ role: 'washer', kind: 'flatWasher', size, at: 0, flip: false });
  if (withSpring) stack.push({ role: 'springWasher', kind: 'springWasher', size, at: hw, flip: false });
  stack.push({ role: 'bolt', kind: boltKind, size, length, at: hw + hs, flip: false });
  if (withNut) {
    if (hw2) stack.push({ role: 'nutWasher', kind: 'flatWasher', size, at: -g, flip: true });
    stack.push({ role: 'nut', kind: nk, size, at: -g - hw2, flip: true });
  }
  return {
    size, fit: fit.fit, grip: g, entry, exit, through: isThrough,
    bolt: { kind: boltKind, size, length },
    washer: withWasher ? { kind: 'flatWasher', size } : null,
    springWasher: withSpring ? { kind: 'springWasher', size } : null,
    nutWasher: hw2 ? { kind: 'flatWasher', size } : null,
    nut: withNut ? { kind: nk, size } : null,
    pitch: METRIC[size].p, stack, lengths,
    // How far the bolt's end is past the nut (through) or short of the hole's bottom (blind).
    protrusion: isThrough ? length - (hw + hs + g + hw2 + hn) : hw + hs + g - length,
  };
}

/**
 * The holes of a pattern: the holes among `holes` (holeOfFace results) with the same diameter whose axis is
 * parallel to `hole`'s and that open on the same plane as its entry end (a linear / circular pattern, or the
 * points of one Hole Wizard feature). The picked hole comes first. Returns [{ hole, entry }].
 */
export function holePattern(hole, entry, holes, { tol = 1e-4 } = {}) {
  const e = hole.ends[entry];
  if (!e?.normal) return [{ hole, entry }];
  const out = [{ hole, entry }];
  for (const h of holes) {
    if (h === hole || Math.abs(h.diameter - hole.diameter) > 1e-3) continue;
    if (Math.abs(Math.abs(dot(h.axis.dir, hole.axis.dir)) - 1) > 1e-6) continue;
    const k = h.ends.findIndex((x) => x.open && x.normal && dot(x.normal, e.normal) > 1 - 1e-6 && Math.abs(dot(sub(x.centre, e.centre), e.normal)) < tol);
    if (k < 0) continue;
    // The same hole found again (one cylinder split in several faces).
    if (out.some((o) => len(sub(o.hole.ends[o.entry].centre, h.ends[k].centre)) < 1e-4)) continue;
    out.push({ hole: h, entry: k });
  }
  return out;
}

/**
 * A series of holes through stacked parts: `segments` are the holes on one axis as intervals along it, t
 * measured from the picked hole's entry face into the material ([{ t0, t1, through, blind, diameter, … }]).
 * From t = 0 the chain follows segments that start where the last one ended (within `gap`), as long as the last
 * was open at its far end. Returns { chain, grip, through, last } — `through` when the last hole is open at its
 * far end (a nut can go there), else the bolt screws into the last (blind, tapped) hole.
 */
export function holeSeries(segments, { gap = 0.05 } = {}) {
  const sorted = [...segments].sort((a, b) => a.t0 - b.t0);
  const first = sorted.find((s) => Math.abs(s.t0) <= gap);
  if (!first) return { chain: [], grip: 0, through: false, last: null };
  const chain = [first];
  let end = first.t1;
  while (chain.at(-1).through) {
    const next = sorted.find((s) => !chain.includes(s) && Math.abs(s.t0 - end) <= gap);
    if (!next) break;
    chain.push(next); end = next.t1;
  }
  const last = chain.at(-1);
  return { chain, grip: end, through: Boolean(last.through), last };
}
