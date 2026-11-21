// Smart fasteners: what a picked hole is (diameter, axis, the flat faces at its ends, through or blind,
// how deep) and which fastener stack fits it (bolt size and length, washer, nut) with where each one goes.
// holeOfFace() reads the kernel's faces; fastenerPlan() is plain maths. Coordinates are the part's own.
import { isCylinder, normalize } from './refs.js';
import { axisOfFace } from './assembly.js';
import { fastenerSizeForHole, boltLengthFor, FLAT_WASHER, HEX_NUT, METRIC } from './stdparts.js';

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

/**
 * The fastener stack for a hole: { size, fit, bolt: { kind, size, length }, washer?, nut?, entry, exit,
 * grip } or { error }. `entry` (index of the end the bolt goes in) defaults to the open end whose normal
 * points most along `up` (world Z by default, mapped by the caller) — `prefer` forces one.
 */
export function fastenerPlan(hole, { kind = 'hexBolt', washer = true, nut = true, prefer = null, up = [0, 0, 1] } = {}) {
  if (!hole) return { error: 'not-hole' };
  const open = hole.ends.map((e, i) => (e.open ? i : -1)).filter((i) => i >= 0);
  if (!open.length) return { error: 'no-entry' };
  const entry = prefer != null && open.includes(prefer) ? prefer : open.reduce((best, i) => (dot(hole.ends[i].normal, up) > dot(hole.ends[best].normal, up) + 1e-9 ? i : best), open[0]);
  const exit = 1 - entry;
  const fit = fastenerSizeForHole(hole.diameter, { blind: !hole.through });
  if (!fit) return { error: 'too-small' };
  const { size } = fit;
  const w = washer ? FLAT_WASHER[size].h : 0;
  const withNut = Boolean(nut && hole.through);
  const length = boltLengthFor(size, hole.depth, { washer: w, nut: withNut ? HEX_NUT[size].m : 0, blind: !hole.through });
  return {
    size, fit: fit.fit, grip: hole.depth, entry, exit, through: hole.through,
    bolt: { kind, size, length },
    washer: washer ? { kind: 'flatWasher', size } : null,
    nut: withNut ? { kind: 'hexNut', size } : null,
    pitch: METRIC[size].p,
  };
}
