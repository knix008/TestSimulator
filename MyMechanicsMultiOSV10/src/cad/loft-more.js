// Loft options beyond a loft through profiles:
//   guide curves  intermediate sections between the profiles, each the point-by-point blend of its neighbours,
//                 moved (one guide) or moved, turned and scaled in its plane (two or more guides, a least-squares
//                 similarity) so that its anchor points lie on the guides
//   centerline    the blended sections' centroids carried along the centre line
//   start / end   normal to profile: an extra section a little along the profile's normal makes the loft leave
//                 (or arrive) square to it, as far along as the tangent length says
//   closed        the first profile again at the end (a ring)
//   thin          the loft of the profiles minus the loft of the profiles offset inward
// The profiles themselves are kept exact; the sections in between are B-spline curves through 96 points each.
import { rep } from './kernel.js';
import { normalize } from './refs.js';
import { codeError, sketchOf, loopDrawing, replicadPlane } from './features.js';
import { profiles } from './sketch.js';
import { curvePolyline } from './part-more.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const MITER = { lineJoinType: 'miter' };
const N = 96;

/** True when a loft needs this module. */
export function needsLoftMore(f) {
  return Boolean(f.guides?.length || f.centerline || (f.startCond && f.startCond !== 'none') || (f.endCond && f.endCond !== 'none') || f.closed || f.thin);
}

/** N points evenly along a closed wire (by arc length), starting at its first point. */
function resample(wire) {
  const { pts } = curvePolyline(wire, 128);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + len(sub(pts[i], pts[i - 1])));
  const L = s.at(-1);
  const out = [];
  for (let k = 0; k < N; k++) {
    const d = (L * k) / N;
    let i = s.findIndex((x) => x >= d);
    if (i <= 0) i = 1;
    const t = (d - s[i - 1]) / Math.max(1e-12, s[i] - s[i - 1]);
    out.push(add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), t)));
  }
  return out;
}

/** `b` turned (and reversed if that fits better) so its points pair with `a`'s. */
function align(a, b) {
  let best = null; let cost = Infinity;
  for (const list of [b, [...b].reverse()]) {
    for (let k = 0; k < N; k += 2) {
      let c = 0;
      for (let i = 0; i < N; i += 4) c += len(sub(a[i], list[(i + k) % N]));
      if (c < cost) { cost = c; best = list.map((_, i) => list[(i + k) % N]); }
    }
  }
  return best;
}

const centroid = (pts) => mul(pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / pts.length);

/** A closed B-spline wire through the points. */
function closedWire(pts) {
  const R = rep();
  return R.assembleWire([R.makeBSplineApproximation([...pts, pts[0]], { tolerance: 1e-4, degMax: 5, smoothing: null })]);
}

/** Points of a guide / centre line (dense). */
const curvePoints = (wire) => curvePolyline(wire, 256).pts;

/** The point of a polyline nearest to p, and its arc-length fraction. */
function nearestOn(poly, p) {
  let best = 0; let d = Infinity;
  for (let i = 0; i < poly.length; i++) { const e = len(sub(poly[i], p)); if (e < d) { d = e; best = i; } }
  return best;
}

/** The section's plane normal (Newell) — for start / end conditions. */
function normalOf(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) { const a = pts[i]; const b = pts[(i + 1) % pts.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
  return normalize(n);
}

/** Similarity (in 3D, about the section) that best moves points `from` to `to`: returns a function on points. */
function similarity(from, to) {
  const cf = centroid(from); const ct = centroid(to);
  if (from.length === 1) return (p) => add(p, sub(to[0], from[0]));
  // Scale from the spread; rotation about the axis square to both spreads (small in practice): Kabsch in the plane.
  const sf = Math.sqrt(from.reduce((s, p) => s + dot(sub(p, cf), sub(p, cf)), 0));
  const st = Math.sqrt(to.reduce((s, p) => s + dot(sub(p, ct), sub(p, ct)), 0));
  const k = sf > 1e-12 ? st / sf : 1;
  // Rotation taking the first spread direction to the target's (Rodrigues).
  const u = normalize(sub(from[1], from[0])); const v = normalize(sub(to[1], to[0]));
  const axis = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const sn = len(axis); const cs = dot(u, v);
  const rot = (x) => {
    if (sn < 1e-12) return x;
    const kk = mul(axis, 1 / sn);
    const kx = [kk[1] * x[2] - kk[2] * x[1], kk[2] * x[0] - kk[0] * x[2], kk[0] * x[1] - kk[1] * x[0]];
    return add(add(mul(x, cs), mul(kx, sn)), mul(kk, dot(kk, x) * (1 - cs)));
  };
  return (p) => add(ct, mul(rot(sub(p, cf)), k));
}

/**
 * The wires to loft through: the profiles, with sections blended in between when guides or a centre line steer
 * them, extra sections for start / end conditions, and the first again at the end when closed.
 */
function sectionWires(profilesPts, exactWires, f, guides, centre) {
  const out = [];
  const between = guides.length || centre ? 8 : 0;
  const anchors = guides.map((g) => nearestOn(profilesPts[0], g[0]));
  for (let i = 0; i < profilesPts.length; i++) {
    out.push(exactWires[i]);
    if (i === profilesPts.length - 1 || !between) continue;
    const A = profilesPts[i]; const B = profilesPts[i + 1];
    // Where each guide meets the two profiles (nearest points), for the fraction along it.
    const gA = guides.map((g, j) => nearestOn(g, A[anchors[j]])); const gB = guides.map((g, j) => nearestOn(g, B[anchors[j]]));
    const cA = centre ? nearestOn(centre, centroid(A)) : 0; const cB = centre ? nearestOn(centre, centroid(B)) : 0;
    for (let k = 1; k <= between; k++) {
      const t = k / (between + 1);
      let P = A.map((p, m) => add(mul(p, 1 - t), mul(B[m], t)));
      if (guides.length) {
        const from = anchors.map((a) => P[a]);
        const to = guides.map((g, j) => g[Math.round(gA[j] + (gB[j] - gA[j]) * t)]);
        const map = similarity(from, to);
        P = P.map(map);
      }
      if (centre) {
        const target = centre[Math.round(cA + (cB - cA) * t)];
        const shift = sub(target, centroid(P));
        P = P.map((p) => add(p, shift));
      }
      out.push(closedWire(P));
    }
  }
  return out;
}

/** Start / end condition: a copy of the end section moved along its normal into the loft. */
function tangentSection(pts, other, k) {
  let n = normalOf(pts);
  if (dot(n, sub(centroid(other), centroid(pts))) < 0) n = mul(n, -1);
  const d = len(sub(centroid(other), centroid(pts))) * Math.max(0.01, Math.min(0.45, 0.15 * k));
  return closedWire(pts.map((p) => add(p, mul(n, d))));
}

function thru(wires, ruled, compatible = true) {
  const R = rep(); const oc = R.getOC();
  const mk = new oc.BRepOffsetAPI_ThruSections(true, Boolean(ruled), 1e-6);
  for (const w of wires) mk.AddWire(w.wrapped);
  // Profiles of straight edges and B-spline sections in between: the kernel matches their vertices.
  mk.CheckCompatibility(compatible);
  mk.Build(new oc.Message_ProgressRange());
  if (!mk.IsDone()) { mk.delete(); throw codeError('loft-failed'); }
  let s = R.cast(mk.Shape());
  mk.delete();
  if (R.measureVolume(s) < 0) s = R.cast(s.wrapped.Reversed());
  return s;
}

/** The lofted tool with the options above. `pathOf(id)` gives a guide / centre line wire. */
export function loftMoreTool(f, ctx, pathOf) {
  const ids = f.sketches ?? [];
  if (ids.length < 2) throw codeError('loft-needs-two');
  const build = (offset) => {
    const wires = ids.map((id) => {
      const { sketch, frame } = sketchOf({ sketch: id }, ctx, id);
      const regions = profiles(sketch);
      if (!regions.length) throw codeError('no-profile');
      const d = offset ? loopDrawing(regions[0].outer).offset(offset, MITER) : loopDrawing(regions[0].outer);
      return d.sketchOnPlane(replicadPlane(frame)).wire;
    });
    let pts = wires.map(resample);
    for (let i = 1; i < pts.length; i++) pts[i] = align(pts[i - 1], pts[i]);
    const guides = (f.guides ?? []).map((id) => curvePoints(pathOf(id)));
    const centre = f.centerline ? curvePoints(pathOf(f.centerline)) : null;
    let list = sectionWires(pts, wires, f, guides, centre);
    if (f.startCond === 'normal') list.splice(1, 0, tangentSection(pts[0], pts[1], num(f.startLength, 1)));
    if (f.endCond === 'normal') list.splice(list.length - 1, 0, tangentSection(pts.at(-1), pts.at(-2), num(f.endLength, 1)));
    if (f.closed) list = [...list, wires[0]];
    try { return thru(list, f.ruled); } catch {
      // The profiles as B-splines too (through 96 points each, 1e-4 mm): every section then has one edge.
      const exact = new Set(wires);
      return thru(list.map((w) => (exact.has(w) ? closedWire(pts[wires.indexOf(w)]) : w)), f.ruled, false);
    }
  };
  let tool = build(0);
  if (f.thin) tool = tool.cut(build(-Math.max(1e-3, num(f.thinT1, 1))));
  return tool;
}
