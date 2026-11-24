// Sweep options beyond a profile along a path:
//   twist        the profile turns along the path by an angle or a number of turns (an auxiliary spine
//                winding round the path at the twist rate, rotation-minimising frames between)
//   guide curve  the profile scales so that it follows a guide curve (a scale law: the guide's distance from the
//                path over its distance at the start, along the path's arc length)
//   circular     no profile sketch: a circle of the given diameter square to the path at its start
//   thin         a wall of thickness along the profile's loops (one direction, mid-plane, two directions)
import { rep } from './kernel.js';
import { normalize } from './refs.js';
import { codeError, loopDrawing, replicadPlane } from './features.js';
import { profiles } from './sketch.js';
import { curvePolyline } from './part-more.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const MITER = { lineJoinType: 'miter' };

/** True when a sweep needs this module. */
export function needsSweepMore(f) {
  return Boolean(num(f.twist) || f.guide || f.circular || f.thin);
}

/** Points along the path with arc length (0 … 1) and unit tangents. */
function samples(path, perEdge = 96) {
  const { pts } = curvePolyline(path, perEdge);
  if (pts.length < 2) throw codeError('no-path');
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + len(sub(pts[i], pts[i - 1])));
  const L = s[s.length - 1] || 1;
  const tangent = (i) => normalize(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
  return pts.map((p, i) => ({ p, u: s[i] / L, t: tangent(i) }));
}

/** A frame along the path that does not twist by itself (double reflection, rotation-minimising). */
function frames(list, n0) {
  let r = normalize(sub(n0, mul(list[0].t, dot(n0, list[0].t))));
  const out = [r];
  for (let i = 1; i < list.length; i++) {
    const v1 = sub(list[i].p, list[i - 1].p); const c1 = dot(v1, v1) || 1e-30;
    const rL = sub(r, mul(v1, (2 / c1) * dot(v1, r)));
    const tL = sub(list[i - 1].t, mul(v1, (2 / c1) * dot(v1, list[i - 1].t)));
    const v2 = sub(list[i].t, tL); const c2 = dot(v2, v2) || 1e-30;
    r = normalize(sub(rL, mul(v2, (2 / c2) * dot(v2, rL))));
    out.push(r);
  }
  return out;
}

/** The auxiliary spine of a twist: a curve winding round the path, turned `deg` degrees by the end. */
function twistSpine(path, deg, radius) {
  const R = rep();
  const list = samples(path);
  const t0 = list[0].t;
  const n0 = Math.abs(t0[2]) < 0.9 ? cross(t0, [0, 0, 1]) : cross(t0, [1, 0, 0]);
  const rs = frames(list, n0);
  const pts = list.map(({ p, u, t }, i) => {
    const a = (deg * Math.PI * u) / 180;
    const r = rs[i]; const b = cross(t, r);
    return add(p, mul(add(mul(r, Math.cos(a)), mul(b, Math.sin(a))), radius));
  });
  return R.assembleWire([R.makeBSplineApproximation(pts, { tolerance: 1e-5, degMax: 5, smoothing: null })]);
}

/** The guide curve's distance from the path where each path point's normal plane meets it. */
function guideScale(path, guide) {
  const list = samples(path, 64);
  const g = curvePolyline(guide, 256).pts;
  const at = ({ p, t }) => {
    for (let i = 1; i < g.length; i++) {
      const a = dot(sub(g[i - 1], p), t); const b = dot(sub(g[i], p), t);
      if (a === 0) return g[i - 1];
      if (a * b < 0) { const k = a / (a - b); return add(g[i - 1], mul(sub(g[i], g[i - 1]), k)); }
    }
    // No crossing (the guide stops short): its nearest point.
    let best = g[0]; for (const q of g) if (len(sub(q, p)) < len(sub(best, p))) best = q;
    return best;
  };
  const d = list.map((x) => len(sub(at(x), x.p)));
  if (!(d[0] > 1e-9)) throw codeError('guide-on-path');
  return list.map((x, i) => [x.u, d[i] / d[0]]);
}

/** A kernel law through (u, scale) points. */
function scaleLaw(points) {
  const oc = rep().getOC();
  const arr = new oc.NCollection_Array1_gp_Pnt2d(1, points.length);
  points.forEach(([u, s], i) => arr.SetValue(i + 1, new oc.gp_Pnt2d(u, s)));
  const law = new oc.Law_Interpol();
  law.Set(arr, false);
  return law;
}

/** The profile's closed loops as wires (outer + holes per region); thin: the wall's loops. */
function profileLoops(sketch, fr, f) {
  const plane = replicadPlane(fr);
  const regions = profiles(sketch);
  if (!regions.length) throw codeError('no-profile');
  if (!f.thin) return regions.map((r) => ({ outer: loopDrawing(r.outer).sketchOnPlane(plane).wire, holes: r.holes.map((h) => loopDrawing(h).sketchOnPlane(plane).wire) }));
  const t1 = Math.max(1e-3, num(f.thinT1, 1)); const t2 = Math.max(1e-3, num(f.thinT2, t1));
  const kind = f.thinKind ?? 'oneDir';
  const out = [];
  for (const r of regions) {
    for (const loop of [r.outer, ...r.holes]) {
      const [a, b] = kind === 'mid' ? [t1 / 2, -t1 / 2] : kind === 'twoDir' ? [t2, -t1] : f.thinReverse ? [t1, 0] : [0, -t1];
      const outer = (a ? loopDrawing(loop).offset(a, MITER) : loopDrawing(loop)).sketchOnPlane(plane).wire;
      const inner = (b ? loopDrawing(loop).offset(b, MITER) : loopDrawing(loop)).sketchOnPlane(plane).wire;
      out.push({ outer, holes: [inner] });
    }
  }
  return out;
}

/** A circle of diameter d square to the path at its start. */
function circleAtStart(path, d) {
  const R = rep();
  const [first] = samples(path, 8);
  return R.assembleWire([R.makeCircle(d / 2, first.p, first.t)]);
}

/**
 * The swept tool: `sketch` + `fr` (unless circular), `path` (a wire), `config` the transition / frenet options.
 */
export function sweepMoreTool(f, path, config, sketch, fr) {
  const R = rep();
  const opts = { ...config };
  if (num(f.twist)) {
    const deg = f.twistUnit === 'turns' ? num(f.twist) * 360 : num(f.twist);
    opts.auxiliarySpine = twistSpine(path, deg, 10);
    delete opts.frenet;
  }
  if (f.guide) opts.law = scaleLaw(guideScale(path, f.guideWire));
  const loops = f.circular ? [{ outer: circleAtStart(path, Math.max(1e-3, num(f.diameter, 5))), holes: [] }] : profileLoops(sketch, fr, f);
  let tool = null;
  for (const { outer, holes } of loops) {
    let s = R.genericSweep(outer, path, opts, false);
    for (const h of holes) s = s.cut(R.genericSweep(h, path, opts, false));
    tool = tool ? tool.fuse(s) : s;
  }
  if (!tool) throw codeError('no-profile');
  return tool;
}
