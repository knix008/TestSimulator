// Spline on Surface: a curve that lies exactly on a face of the body, through points picked on it. The points are
// taken to the face's own (u, v) parameters, the curve through them is drawn there — the sketch spline's
// interpolation (Catmull-Rom tangents, cubic Bézier pieces) — and wrapped onto the face's surface (a pcurve on
// it), so every point of the curve is on the surface, not only the picked ones.
//   feature: { type: 'surfaceSpline', face: faceSig, points: [[x, y, z]], closed }
import { rep } from './kernel.js';
import { codeError } from './features.js';
import { findFace } from './refs.js';

/** Catmull-Rom cubic Bézier pieces through 2D points (closed: back to the first), as the sketch spline makes. */
export function uvBeziers(P, closed = false) {
  const n = P.length;
  const at = (i) => (closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const T = (i) => [(at(i + 1)[0] - at(i - 1)[0]) / 2, (at(i + 1)[1] - at(i - 1)[1]) / 2];
  const out = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i); const p1 = at(i + 1); const t0 = T(i); const t1 = T(i + 1);
    out.push([p0, [p0[0] + t0[0] / 3, p0[1] + t0[1] / 3], [p1[0] - t1[0] / 3, p1[1] - t1[1] / 3], p1]);
  }
  return out;
}

/** The curve of a Spline on Surface feature on the body of `ctx`: { curve (wire), length }. */
export function buildSurfaceSpline(f, ctx) {
  const R = rep();
  if (!ctx.body) throw codeError('no-body');
  const face = f.face ? findFace(ctx.body, f.face) : null;
  if (!face) throw codeError('face-missing');
  const pts = (f.points ?? []).filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
  if (pts.length < 2) throw codeError('no-points');
  // The points on the surface's parameters (each projected to the nearest point of the surface).
  const uv = pts.map((p) => face.uvCoordinates(p));
  // A periodic direction (cylinder, cone …): keep consecutive points on the same turn.
  for (let i = 1; i < uv.length; i++) for (const k of [0, 1]) {
    const per = periodOf(face, k);
    if (!per) continue;
    while (uv[i][k] - uv[i - 1][k] > per / 2) uv[i][k] -= per;
    while (uv[i][k] - uv[i - 1][k] < -per / 2) uv[i][k] += per;
  }
  let pen = R.draw(uv[0]);
  if (uv.length === 2 && !f.closed) pen = pen.lineTo(uv[1]);
  else for (const [, c1, c2, p3] of uvBeziers(uv, Boolean(f.closed))) pen = pen.cubicBezierCurveTo(p3, c1, c2);
  const drawing = f.closed ? pen.close() : pen.done();
  const sk = drawing.sketchOnFace(face, 'native');
  const wire = sk.wire ?? sk.sketches?.[0]?.wire;
  if (!wire) throw codeError('kernel');
  const length = wire.edges.reduce((s, e) => s + e.length, 0);
  return { curve: wire, length };
}

function periodOf(face, k) {
  try {
    const oc = rep().getOC();
    const h = oc.BRep_Tool.Surface(face.wrapped);
    const s = typeof h.get === 'function' ? h.get() : h;
    if (k === 0 && s.IsUPeriodic()) return s.UPeriod();
    if (k === 1 && s.IsVPeriodic()) return s.VPeriod();
  } catch { /* not periodic */ }
  return 0;
}
