// Surface fillet: a round between two surface bodies. Each surface is split where the other crosses it and the side
// chosen (on the other's normal side, or the other side when flipped) is kept; the two kept pieces are sewn into one
// sheet whose shared edge is the crossing, and that edge is rounded by the radius (the kernel's fillet on a shell).
import { rep } from './kernel.js';
import { splitFace } from './split-line-more.js';
import { faceSampler } from './mold-brep.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** Which side of a surface a point lies on: the sign of (p − nearest point) · normal there. */
function sideOf(surface, p) {
  const R = rep(); const oc = R.getOC();
  let best = null; let bd = Infinity;
  for (const fc of surface.faces) {
    const ex = new oc.BRepExtrema_DistShapeShape(R.makeVertex(p).wrapped, fc.wrapped);
    try { const d = ex.Value(); if (d < bd) { const q = ex.PointOnShape2(1); bd = d; best = { fc, q: [q.X(), q.Y(), q.Z()] }; } } finally { ex.delete(); }
  }
  if (!best) return 0;
  const S = faceSampler(best.fc);
  try { const [u, v] = best.fc.uvCoordinates(best.q); return Math.sign(dot(sub(p, best.q), S.at(u, v).n)); } finally { S.delete(); }
}

/** A point well inside a face (the middle of its parameters, else its centre). */
const inner = (fc) => { try { return vec(fc.pointOnSurface(0.5, 0.5)); } catch { return vec(fc.center); } };

/** The kept side of `surface` cut by `other`: its pieces on other's normal side (sign 1) or against it (−1). */
function keptSide(surface, other, sign, big, codeError) {
  const pieces = surface.faces.flatMap((fc) => splitFace(fc, other.faces, big * 1e-7));
  const kept = pieces.filter((pc) => sideOf(other, inner(pc)) === sign);
  if (!kept.length) throw codeError('fillet-no-side');
  return kept;
}

/** The two surfaces trimmed to each other and rounded where they meet. */
export function surfaceFillet(A, B, r, { flipA = false, flipB = false } = {}, { codeError }) {
  const R = rep(); const oc = R.getOC();
  const [lo, hi] = A.boundingBox.bounds; const big = Math.hypot(...sub(hi, lo)) + 1;
  const keepA = keptSide(A, B, flipA ? -1 : 1, big, codeError);
  const keepB = keptSide(B, A, flipB ? -1 : 1, big, codeError);
  const sew = new oc.BRepBuilderAPI_Sewing(1e-5, true, true, true, false);
  for (const fc of [...keepA, ...keepB]) sew.Add(fc.wrapped);
  sew.Perform(new oc.Message_ProgressRange());
  const sheet = R.cast(sew.SewedShape()); sew.delete();
  // The crossing: edges with a face of A on one side and a face of B on the other.
  const near = (fc, list) => list.some((k) => Math.hypot(...sub(vec(k.center), vec(fc.center))) < 1e-6 && Math.abs(R.measureArea(k) - R.measureArea(fc)) < 1e-6 * Math.max(1, R.measureArea(fc)));
  const edges = sheet.edges.filter((e) => {
    const faces = sheet.faces.filter((fc) => fc.edges.some((x) => x.isSame(e)));
    return faces.length === 2 && faces.some((fc) => near(fc, keepA)) && faces.some((fc) => near(fc, keepB));
  });
  if (!edges.length) throw codeError('fillet-no-crossing');
  const mk = new oc.BRepFilletAPI_MakeFillet(sheet.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for (const e of edges) mk.Add(r, oc.TopoDS.Edge(e.wrapped));
  try { mk.Build(new oc.Message_ProgressRange()); } catch { mk.delete(); throw codeError('kernel'); }
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  const out = R.cast(mk.Shape()); mk.delete();
  return out;
}
