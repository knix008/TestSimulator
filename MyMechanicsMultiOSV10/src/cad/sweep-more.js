// Sweep options beyond a profile along a path:
//   twist        the profile turns along the path by an angle or a number of turns (an auxiliary spine
//                winding round the path at the twist rate, rotation-minimising frames between)
//   guide curve  the profile scales so that it follows a guide curve (a scale law: the guide's distance from the
//                path over its distance at the start, along the path's arc length)
//   guide curves (two or more) the profile deforms so that it follows every guide: at stations along the path the
//                in-plane linear map that carries each guide's start point to where the guide crosses that
//                station's normal plane (exact for two guides, least squares for more) is applied to the sketch
//                (rotation, stretch, rotation), the sections placed square to the path and lofted through
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
  return Boolean(num(f.twist) || f.guide || f.circular || f.thin || (f.guides ?? []).length);
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

/** Where a guide (its polyline points) crosses the normal plane of the path at p (tangent t); else its nearest point. */
function guideAt(g, p, t) {
  for (let i = 1; i < g.length; i++) {
    const a = dot(sub(g[i - 1], p), t); const b = dot(sub(g[i], p), t);
    if (a === 0) return g[i - 1];
    if (b === 0) return g[i];
    if (a * b < 0) { const k = a / (a - b); return add(g[i - 1], mul(sub(g[i], g[i - 1]), k)); }
  }
  let best = g[0]; for (const q of g) if (len(sub(q, p)) < len(sub(best, p))) best = q;
  return best;
}

/** 2 x 2 helpers: [[a, b], [c, d]]. */
const mat2 = {
  mul: (A, B) => [[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]], [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]],
  inv: (A) => { const D = A[0][0] * A[1][1] - A[0][1] * A[1][0]; return [[A[1][1] / D, -A[0][1] / D], [-A[1][0] / D, A[0][0] / D]]; },
  apply: (A, v) => [A[0][0] * v[0] + A[0][1] * v[1], A[1][0] * v[0] + A[1][1] * v[1]],
};

/**
 * The linear map carrying the guides' start points q0 to their points q (2D, in the path's normal plane): exact for
 * two independent points, least squares for more; points on one line through the path map along it only.
 */
export function guideMap(q0, q) {
  let S00 = [[0, 0], [0, 0]]; let S10 = [[0, 0], [0, 0]];
  for (let k = 0; k < q0.length; k++) {
    const a = q0[k]; const b = q[k];
    S00 = [[S00[0][0] + a[0] * a[0], S00[0][1] + a[0] * a[1]], [S00[1][0] + a[1] * a[0], S00[1][1] + a[1] * a[1]]];
    S10 = [[S10[0][0] + b[0] * a[0], S10[0][1] + b[0] * a[1]], [S10[1][0] + b[1] * a[0], S10[1][1] + b[1] * a[1]]];
  }
  const det = S00[0][0] * S00[1][1] - S00[0][1] * S00[1][0];
  const tr = S00[0][0] + S00[1][1];
  if (Math.abs(det) > 1e-9 * tr * tr) return mat2.mul(S10, mat2.inv(S00));
  // All on one line through the path: the map along that line (scale and turn), the direction across kept unit.
  const e = Math.hypot(...q0[0]) > 1e-12 ? q0[0].map((x) => x / Math.hypot(...q0[0])) : [1, 0];
  let w = [0, 0]; let den = 0;
  for (let k = 0; k < q0.length; k++) { const s0 = q0[k][0] * e[0] + q0[k][1] * e[1]; w = [w[0] + q[k][0] * s0, w[1] + q[k][1] * s0]; den += s0 * s0; }
  const v = den > 0 ? [w[0] / den, w[1] / den] : e;
  const n = [-e[1], e[0]]; const vl = Math.hypot(...v) || 1; const vn = [-v[1] / vl, v[0] / vl];
  // M e = v, M n = vn: M = [v vn] [e n]^T ([e n] orthonormal).
  return [[v[0] * e[0] + vn[0] * n[0], v[0] * e[1] + vn[0] * n[1]], [v[1] * e[0] + vn[1] * n[0], v[1] * e[1] + vn[1] * n[1]]];
}

/**
 * The map the sections follow: { A, T } with q = A q0 + T. Guides around the path: the linear map (T = 0). Guides
 * all on one line through the path (both ends of an open profile, say): along that line the exact affine fit (scale
 * and shift, turned with it), so each guide is met exactly.
 */
export function guideAffine(q0, q) {
  const A = guideMap(q0, q);
  if (q0.length < 2) return { A, T: [0, 0] };
  const S = q0.reduce((m, a) => [[m[0][0] + a[0] * a[0], m[0][1] + a[0] * a[1]], [m[1][0] + a[1] * a[0], m[1][1] + a[1] * a[1]]], [[0, 0], [0, 0]]);
  const tr = S[0][0] + S[1][1]; const det = S[0][0] * S[1][1] - S[0][1] * S[1][0];
  if (Math.abs(det) > 1e-9 * tr * tr) return { A, T: [0, 0] };
  // On one line: least squares q = s0 * e + v * (q0·e) … i.e. q(t) = m + w t, t the position along e.
  const e = Math.hypot(...q0[0]) > 1e-12 ? q0[0].map((x) => x / Math.hypot(...q0[0])) : [1, 0];
  const ts = q0.map((a) => a[0] * e[0] + a[1] * e[1]);
  const tm = ts.reduce((s, t) => s + t, 0) / ts.length;
  const qm = q.reduce((s, b) => [s[0] + b[0] / q.length, s[1] + b[1] / q.length], [0, 0]);
  let wn = [0, 0]; let den = 0;
  ts.forEach((t, k) => { wn = [wn[0] + (q[k][0] - qm[0]) * (t - tm), wn[1] + (q[k][1] - qm[1]) * (t - tm)]; den += (t - tm) * (t - tm); });
  if (!(den > 1e-18)) return { A, T: [0, 0] };
  const w = [wn[0] / den, wn[1] / den]; // where a unit step along e goes
  const n = [-e[1], e[0]]; const wl = Math.hypot(...w) || 1; const wn2 = [-w[1] / wl, w[0] / wl];
  const M = [[w[0] * e[0] + wn2[0] * n[0], w[0] * e[1] + wn2[0] * n[1]], [w[1] * e[0] + wn2[1] * n[0], w[1] * e[1] + wn2[1] * n[1]]];
  // q = M q0 + T with M e = w: the mean point maps to the mean point.
  const m0 = [e[0] * tm, e[1] * tm];
  const Mm0 = [M[0][0] * m0[0] + M[0][1] * m0[1], M[1][0] * m0[0] + M[1][1] * m0[1]];
  return { A: M, T: [qm[0] - Mm0[0], qm[1] - Mm0[1]] };
}

/** L = Rot(phi) diag(s1, s2) Rot(theta) (radians; s2 < 0 for a mirroring map). */
export function svd2(L) {
  const [[a, b], [c, d]] = L;
  const E = (a + d) / 2; const F = (a - d) / 2; const G = (c + b) / 2; const H = (c - b) / 2;
  const Q = Math.hypot(E, H); const Rr = Math.hypot(F, G);
  const a1 = Math.atan2(G, F); const a2 = Math.atan2(H, E);
  return { phi: (a2 + a1) / 2, theta: (a2 - a1) / 2, s1: Q + Rr, s2: Q - Rr };
}

/**
 * An open profile (a wire in the sketch plane, frame fr) mapped by L in the sketch's coordinates and placed by
 * `place` (2D → 3D): straight edges stay exact lines, curved ones are fitted through 64 mapped points.
 */
function mappedOpenWire(wire, fr, L, place) {
  const R = rep();
  const to2 = (p) => { const d = sub(p, fr.origin); return [dot(d, fr.xDir), dot(d, fr.yDir)]; };
  const map3 = (p) => place(mat2.apply(L, to2(p)));
  const edges = wire.edges.map((e) => {
    const a = [e.startPoint.x, e.startPoint.y, e.startPoint.z]; const b = [e.endPoint.x, e.endPoint.y, e.endPoint.z];
    if (e.geomType === 'LINE') return R.makeLine(map3(a), map3(b));
    const pts = Array.from({ length: 65 }, (_, i) => { const q = e.pointAt(i / 64); return map3([q.x, q.y, q.z]); });
    return R.makeBSplineApproximation(pts, { tolerance: 1e-6, smoothing: null, degMax: 5, degMin: 1 });
  });
  return R.assembleWire(edges);
}

/** A sketch loop drawing mapped by L (2 x 2) in its own coordinates. */
function mappedDrawing(loop, L) {
  const { phi, theta, s1, s2 } = svd2(L);
  let d = loopDrawing(loop);
  const deg = (r) => (r * 180) / Math.PI;
  if (Math.abs(theta) > 1e-12) d = d.rotate(deg(theta), [0, 0]);
  // stretch(ratio, axis) is an affinity about the axis: it scales across it (x by the y axis, y by the x axis).
  if (Math.abs(s1 - 1) > 1e-12) d = d.stretch(s1, [0, 1], [0, 0]);
  if (Math.abs(s2 - 1) > 1e-12) d = d.stretch(s2, [1, 0], [0, 0]);
  if (Math.abs(phi) > 1e-12) d = d.rotate(deg(phi), [0, 0]);
  return d;
}

/**
 * A sweep that follows two or more guide curves: sections of the profile at stations along the path, each mapped so
 * that it passes through every guide there, lofted through. `guides` are wires.
 */
function guidedSweep(path, guides, sketch, fr, stations = 24, { shell = false, openWire = null } = {}) {
  const R = rep();
  // The path resampled evenly by arc length (a straight edge has only its two ends as samples), with frames.
  const raw = samples(path, 96);
  const M = stations * 4;
  const list = Array.from({ length: M + 1 }, (_, k) => {
    const u = k / M;
    let i = 1; while (i < raw.length - 1 && raw[i].u < u) i++;
    const A = raw[i - 1]; const B = raw[i]; const w = B.u > A.u ? (u - A.u) / (B.u - A.u) : 0;
    const p = add(A.p, mul(sub(B.p, A.p), w));
    const t = normalize(add(mul(A.t, 1 - w), mul(B.t, w)));
    return { p, u, t };
  });
  const idx = Array.from({ length: stations + 1 }, (_, k) => k * 4);
  const rs = frames(list, fr.xDir);
  const g = guides.map((w) => curvePolyline(w, 256).pts);
  const st = idx.map((i) => { const { p, t } = list[i]; const r = rs[i]; const b = cross(t, r); return { p, t, r, b }; });
  const loc = (s, X) => [dot(sub(X, s.p), s.r), dot(sub(X, s.p), s.b)];
  const s0 = st[0];
  const q0 = g.map((G) => loc(s0, guideAt(G, s0.p, s0.t)));
  if (q0.some((q) => Math.hypot(...q) < 1e-9)) throw codeError('guide-on-path');
  // The sketch's own coordinates in the start station's (r, b): q = c + J [x, y].
  const J = [[dot(fr.xDir, s0.r), dot(fr.yDir, s0.r)], [dot(fr.xDir, s0.b), dot(fr.yDir, s0.b)]];
  const c = loc(s0, fr.origin);
  // An open profile (surface sweep): its edges mapped station by station, lofted into a sheet.
  if (openWire) {
    const wires = st.map((s) => {
      const { A, T } = guideAffine(q0, g.map((G) => loc(s, guideAt(G, s.p, s.t))));
      const L = mat2.mul(A, J); const Ac = mat2.apply(A, c); const o = [Ac[0] + T[0], Ac[1] + T[1]];
      return mappedOpenWire(openWire, fr, L, ([u, v]) => add(s.p, add(mul(s.r, u + o[0]), mul(s.b, v + o[1]))));
    });
    return R.loft(wires, { ruled: false }, true);
  }
  const regions = profiles(sketch);
  if (!regions.length) throw codeError('no-profile');
  let tool = null;
  for (const region of regions) {
    const loops = [region.outer, ...region.holes];
    const wires = loops.map(() => []);
    for (const s of st) {
      const { A, T } = guideAffine(q0, g.map((G) => loc(s, guideAt(G, s.p, s.t))));
      const L = mat2.mul(A, J); const Ac = mat2.apply(A, c); const o = [Ac[0] + T[0], Ac[1] + T[1]];
      const plane = replicadPlane({ origin: add(s.p, add(mul(s.r, o[0]), mul(s.b, o[1]))), xDir: s.r, yDir: s.b, normal: s.t });
      loops.forEach((loop, k) => wires[k].push(mappedDrawing(loop, L).sketchOnPlane(plane).wire));
    }
    if (shell) { const sk = [wires[0], ...wires.slice(1)].map((w) => R.loft(w, { ruled: false }, true)); tool = R.makeCompound([...(tool ? [tool] : []), ...sk]); continue; }
    let solid = R.loft(wires[0], { ruled: false }, false);
    for (const h of wires.slice(1)) solid = solid.cut(R.loft(h, { ruled: false }, false));
    tool = tool ? tool.fuse(solid) : solid;
  }
  return tool;
}

/** The guide curve's distance from the path where each path point's normal plane meets it. */
function guideScale(path, guide) {
  const list = samples(path, 64);
  const g = curvePolyline(guide, 256).pts;
  const at = ({ p, t }) => {
    for (let i = 1; i < g.length; i++) {
      const a = dot(sub(g[i - 1], p), t); const b = dot(sub(g[i], p), t);
      if (a === 0) return g[i - 1];
    if (b === 0) return g[i];
      if (b === 0) return g[i];
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
export function sweepMoreTool(f, path, config, sketch, fr, { shell = false, openWire = null } = {}) {
  const R = rep();
  // Two or more guide curves: sections mapped through every guide, lofted (the twist does not apply).
  if ((f.guideWires ?? []).length >= 2 && !f.circular && !f.thin) return guidedSweep(path, f.guideWires, sketch, fr, 24, { shell, openWire });
  const opts = { ...config };
  if (num(f.twist)) {
    const deg = f.twistUnit === 'turns' ? num(f.twist) * 360 : num(f.twist);
    opts.auxiliarySpine = twistSpine(path, deg, 10);
    delete opts.frenet;
  }
  if (f.guide) opts.law = scaleLaw(guideScale(path, f.guideWire));
  // A surface sweep: the profile's sheet (open profiles too), no caps.
  if (shell) {
    const list = openWire ? [openWire] : (f.circular ? [circleAtStart(path, Math.max(1e-3, num(f.diameter, 5)))] : profileLoops(sketch, fr, f).flatMap((x) => [x.outer, ...x.holes]));
    const sheets = list.map((w) => R.genericSweep(w, path, opts, true)[0]);
    return sheets.length === 1 ? sheets[0] : R.makeCompound(sheets);
  }
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
