// Wrap on any curved face (cones, spline faces …): the sketch is laid on the face by arc length — its y measured
// along the face's v line through the point under the sketch's origin, its x along the u line of the row it lands
// on (the sketch's axes
// matched to whichever face direction they lie closest to). Each closed outline is sampled, mapped into the face's
// own (u, v) and drawn there as smooth curves, laid on the face and thickened by the depth (raised or sunk).
import { rep } from './kernel.js';
import { faceSampler } from './mold-brep.js';
import { profiles } from './sketch.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a);
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** Points along a sketch loop (2D), `per` per segment (more for curved ones). */
export function loopPoints(loop, per = 24) {
  const out = [];
  const segs = loop.segs ?? [];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const bez = (P, t) => { let q = P.map((p) => [...p]); while (q.length > 1) q = q.slice(1).map((p, i) => lerp(q[i], p, t)); return q[0]; };
  const rbez = (P, w, t) => { const n = P.length - 1; let x = 0; let y = 0; let W = 0; const C = (k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - i + 1)) / i; return c; }; for (let i = 0; i <= n; i++) { const b = C(i) * t ** i * (1 - t) ** (n - i) * w[i]; x += b * P[i][0]; y += b * P[i][1]; W += b; } return [x / W, y / W]; };
  if (segs.length === 1 && segs[0].kind === 'circle') { const c = segs[0]; for (let i = 0; i < per * 4; i++) { const a = (2 * Math.PI * i) / (per * 4); out.push([c.c[0] + c.r * Math.cos(a), c.c[1] + c.r * Math.sin(a)]); } return out; }
  if (segs.length === 1 && segs[0].kind === 'ellipse') { const e = segs[0]; for (let i = 0; i < per * 4; i++) { const a = (2 * Math.PI * i) / (per * 4); const x = e.rx * Math.cos(a); const y = e.ry * Math.sin(a); out.push([e.c[0] + x * Math.cos(e.rot) - y * Math.sin(e.rot), e.c[1] + x * Math.sin(e.rot) + y * Math.cos(e.rot)]); } return out; }
  for (const s of segs) {
    if (s.kind === 'line') { for (let i = 0; i < per; i++) out.push(lerp(s.a, s.b, i / per)); continue; }
    if (s.kind === 'spline') { for (const b of s.beziers) for (let i = 0; i < per; i++) out.push(bez(b, i / per)); continue; }
    if (s.kind === 'pieces') { for (const pc of s.pieces) for (let i = 0; i < per; i++) out.push(rbez(pc.P, pc.w, i / per)); continue; }
    // An arc through from, mid, to.
    const [a, m, b] = [s.from, s.mid, s.to];
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    const ux = ((a[0] ** 2 + a[1] ** 2) * (m[1] - b[1]) + (m[0] ** 2 + m[1] ** 2) * (b[1] - a[1]) + (b[0] ** 2 + b[1] ** 2) * (a[1] - m[1])) / d;
    const uy = ((a[0] ** 2 + a[1] ** 2) * (b[0] - m[0]) + (m[0] ** 2 + m[1] ** 2) * (a[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (m[0] - a[0])) / d;
    const r = Math.hypot(a[0] - ux, a[1] - uy);
    const ang = (p) => Math.atan2(p[1] - uy, p[0] - ux);
    let a0 = ang(a); let a1 = ang(b); const am = ang(m);
    const ccw = ((am - a0 + 4 * Math.PI) % (2 * Math.PI)) < ((a1 - a0 + 4 * Math.PI) % (2 * Math.PI));
    let sweep = ((a1 - a0 + 4 * Math.PI) % (2 * Math.PI)); if (!ccw) sweep -= 2 * Math.PI;
    for (let i = 0; i < per * 2; i++) { const t = a0 + (sweep * i) / (per * 2); out.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]); }
    void a1;
  }
  return out;
}

/** Arc length along one parameter of the face (the other held): a monotone table and its inverse. */
function arcTable(at, from, to, n = 400) {
  const ts = []; const ss = []; let s = 0; let prev = at(from);
  for (let i = 0; i <= n; i++) { const t = from + ((to - from) * i) / n; const p = at(t); if (i) s += len(sub(p, prev)); prev = p; ts.push(t); ss.push(s); }
  return { ts, ss, s: (t) => interp(ts, ss, t), t: (x) => interp(ss, ts, x) };
}
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0] + ((ys[1] - ys[0]) / (xs[1] - xs[0] || 1)) * (x - xs[0]);
  const n = xs.length - 1;
  if (x >= xs[n]) return ys[n] + ((ys[n] - ys[n - 1]) / (xs[n] - xs[n - 1] || 1)) * (x - xs[n]);
  let lo = 0; let hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo] || 1);
}

/** The raised (or sunk) solid of the sketch's regions wrapped on `face`. */
export function wrapOnSurface(face, sketch, frame, depth, sink, { codeError, thickOf }) {
  const R = rep();
  const S = faceSampler(face);
  try {
    const { uMin, uMax, vMin, vMax } = S.bounds;
    const P = (u, v) => S.at(u, v).p;
    // The point under the sketch's origin (straight along the sketch's normal, either way) and the face's directions
    // there.
    const [lo, hi] = face.boundingBox.bounds; const big = len(sub(hi, lo)) * 4 + 10;
    const oc = R.getOC();
    const line = R.makeLine(sub(frame.origin, frame.normal.map((x) => x * big)), [0, 1, 2].map((i) => frame.origin[i] + frame.normal[i] * big));
    const ex = new oc.BRepExtrema_DistShapeShape(line.wrapped, face.wrapped);
    let hit = null;
    try { if (ex.Value() < 1e-6) { let best = Infinity; for (let i = 1; i <= ex.NbSolution(); i++) { const q = ex.PointOnShape2(i); const p = [q.X(), q.Y(), q.Z()]; const d = Math.abs(dot(sub(p, frame.origin), frame.normal)); if (d < best) { best = d; hit = p; } } } } finally { ex.delete(); }
    if (!hit) throw codeError('projection-missed');
    const [u0, v0] = face.uvCoordinates(hit);
    const du = (uMax - uMin) * 1e-4; const dv = (vMax - vMin) * 1e-4;
    const Su = sub(P(u0 + du, v0), P(u0, v0)); const Sv = sub(P(u0, v0 + dv), P(u0, v0));
    // The sketch's x goes along u or v, whichever it is closer to (and which way).
    const xu = Math.abs(dot(frame.xDir, Su)) / len(Su); const xv = Math.abs(dot(frame.xDir, Sv)) / len(Sv);
    const swap = xv > xu;
    const sxSign = Math.sign(dot(frame.xDir, swap ? Sv : Su)) || 1; const sySign = Math.sign(dot(frame.yDir, swap ? Su : Sv)) || 1;
    // Along v from the origin's row; along u measured on each row's own u line (rows at 33 heights, between them
    // interpolated), so widths keep their length all the way up.
    const V = arcTable((v) => P(u0, v), vMin, vMax); const sv0 = V.s(v0);
    const rows = Array.from({ length: 33 }, (_, i) => { const v = vMin + ((vMax - vMin) * i) / 32; const U = arcTable((u) => P(u, v), uMin, uMax, 200); return { v, U, s0: U.s(u0) }; });
    const uAt = (v, a) => {
      const k = Math.max(0, Math.min(31, Math.floor(((v - vMin) / (vMax - vMin)) * 32)));
      const A = rows[k]; const B = rows[k + 1]; const w = (v - A.v) / (B.v - A.v || 1);
      return A.U.t(A.s0 + a) * (1 - w) + B.U.t(B.s0 + a) * w;
    };
    const toUV = ([x, y]) => {
      const a = swap ? y * sySign : x * sxSign; const b = swap ? x * sxSign : y * sySign;
      const v = V.t(sv0 + b);
      return [uAt(v, a), v];
    };
    const regions = profiles(sketch);
    if (!regions.length) throw codeError('no-profile');
    // A closed smooth curve through the mapped points (Catmull-Rom as cubic Béziers) in the face's (u, v).
    const curve = (pts) => {
      const q = pts.map(toUV); const n = q.length;
      let pen = R.draw(q[0]);
      for (let i = 0; i < n; i++) {
        const p0 = q[(i - 1 + n) % n]; const p1 = q[i]; const p2 = q[(i + 1) % n]; const p3 = q[(i + 2) % n];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]; const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        pen = i === n - 1 ? pen.cubicBezierCurveTo(q[0], c1, c2) : pen.cubicBezierCurveTo(p2, c1, c2);
      }
      return pen.close();
    };
    let drawing = null;
    for (const r of regions) {
      let d = curve(loopPoints(r.outer));
      for (const h of r.holes) d = d.cut(curve(loopPoints(h)));
      drawing = drawing ? drawing.fuse(d) : d;
    }
    const sketches = drawing.sketchOnFace(face.clone(), 'native');
    const faces = sketches.sketches ? sketches.sketches.map((s) => s.face()) : [sketches.face()];
    let tool = null;
    for (const fc of faces) { const solid = thickOf(fc, sink ? -depth : depth); tool = tool ? tool.fuse(solid) : solid; }
    return tool;
  } finally { S.delete(); }
}

void vec;
