// Fillet setback (vertex blend): where three or more filleted edges meet, the corner is blended smoothly from a
// distance (the setback) along each edge instead of the kernel's own corner patch. The filleted body's corner region
// — inside the planes square to each edge at its setback from the vertex — is taken out; what was its outer surface
// is replaced by one smooth patch bounded where the planes cut the body's surface and tangent (G1) to the faces
// around it; the planes' faces and the patch close the new corner piece, which goes back in.
import { rep } from './kernel.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const L = Math.hypot(...a) || 1; return a.map((x) => x / L); };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** The edges (of the original body) that meet at vertex v: [{ edge, dir }] with dir pointing away from v. */
export function edgesAt(body, v, tol = 1e-6) {
  const out = [];
  for (const e of body.edges) {
    const a = vec(e.startPoint); const b = vec(e.endPoint);
    if (Math.hypot(...sub(a, v)) < tol) out.push({ edge: e, dir: unit(vec(e.tangentAt(0))) });
    else if (Math.hypot(...sub(b, v)) < tol) out.push({ edge: e, dir: unit(vec(e.tangentAt(1)).map((x) => -x)) });
  }
  return out;
}

/**
 * Fillet overflow "keep edge": the material the round takes away (convex edges) or adds (concave ones) is kept to
 * the region under the edge's two faces (each face thickened inward by a few radii) — where the round would have
 * rolled over onto a neighbouring face, that face and its edge stay as they were.
 */
export function keepEdgeOverflow(orig, filleted, edges, r) {
  let allowed = null;
  for (const e of edges) { const zone = edgeZone(orig, e, r); if (zone) allowed = allowed ? allowed.fuse(zone) : zone; }
  if (!allowed) return filleted;
  const removed = orig.clone().cut(filleted).intersect(allowed);
  const added = filleted.clone().cut(orig).intersect(allowed);
  return orig.clone().cut(removed).fuse(added);
}

/** The region over and under an edge's two faces (each face thickened both ways by 3 r): where its round may act. */
export function edgeZone(orig, e, r) {
  const R = rep(); const oc = R.getOC();
  {
    const faces = orig.faces.filter((fc) => fc.edges.some((x) => x.isSame(e)));
    if (faces.length !== 2) return null;
    let zone = null;
    for (const fc of faces) {
      const mk = new oc.BRepOffsetAPI_MakeThickSolid();
      mk.MakeThickSolidBySimple(fc.wrapped, -3 * r);
      mk.Build(new oc.Message_ProgressRange());
      if (!mk.IsDone()) { mk.delete(); zone = null; break; }
      let slab = R.cast(mk.Shape()); mk.delete();
      try { if (R.measureVolume(slab) < 0) slab = R.cast(slab.wrapped.Reversed()); } catch { /* keep */ }
      // Both ways (a concave edge's added material is outside the body, over the faces).
      const mk2 = new oc.BRepOffsetAPI_MakeThickSolid();
      mk2.MakeThickSolidBySimple(fc.wrapped, 3 * r);
      mk2.Build(new oc.Message_ProgressRange());
      if (mk2.IsDone()) { let s2 = R.cast(mk2.Shape()); try { if (R.measureVolume(s2) < 0) s2 = R.cast(s2.wrapped.Reversed()); } catch { /* keep */ } slab = slab.fuse(s2); }
      mk2.delete();
      zone = zone ? zone.intersect(slab) : slab;
    }
    return zone;
  }
}

/** A half-space solid: the side of the plane through p with normal n that n points away from (a big box). */
function halfSpace(p, n, big) {
  const R = rep();
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, a)); const w = cross(n, u);
  const c = (s, t) => add(add(p, u, s * big), w, t * big);
  const face = R.makePolygon([c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)]);
  return R.basicFaceExtrusion(face, new R.Vector(n.map((x) => -x * big)));
}

/**
 * The filleted body with the corner at `v` blended from `setbacks` (distance per edge, in the order of `edges`).
 * `orig` the body before the fillet (its edges at v give the directions), `filleted` the body after it.
 */
export function setbackCorner(orig, filleted, v0, setbacks, { codeError }) {
  const R = rep(); const oc = R.getOC();
  // The corner: the body's vertex nearest the point given (picked on a preview, the corner may already be rounded).
  let v = v0; let at = edgesAt(orig, v);
  if (at.length < 3) {
    let best = null; let bd = Infinity;
    for (const e of orig.edges) for (const q of [vec(e.startPoint), vec(e.endPoint)]) { const d = Math.hypot(...sub(q, v0)); if (d < bd && edgesAt(orig, q).length >= 3) { bd = d; best = q; } }
    if (best) { v = best; at = edgesAt(orig, v); }
  }
  if (at.length < 3) throw codeError('setback-not-corner');
  const [lo, hi] = filleted.boundingBox.bounds; const big = Math.hypot(...sub(hi, lo)) * 2 + 10;
  // The corner region: on the vertex side of every setback plane.
  let region = null;
  at.forEach((x, i) => {
    const d = Math.max(1e-3, Number(setbacks?.[i] ?? setbacks?.[0] ?? 1));
    const hs = halfSpace(add(v, x.dir, d), x.dir, big);
    region = region ? region.intersect(hs) : hs;
  });
  const chunk = filleted.clone().intersect(region);
  const rest = filleted.clone().cut(region);
  // The chunk's faces on the setback planes stay; its other faces (the outer surface) are replaced.
  const onPlane = (fc) => fc.geomType === 'PLANE' && at.some((x, i) => {
    const d = Math.max(1e-3, Number(setbacks?.[i] ?? setbacks?.[0] ?? 1));
    let n; try { n = unit(vec(fc.normalAt(fc.center))); } catch { return false; }
    return Math.abs(Math.abs(dot(n, x.dir)) - 1) < 1e-9 && Math.abs(dot(sub(vec(fc.center), add(v, x.dir, d)), x.dir)) < 1e-6;
  });
  const planeFaces = chunk.faces.filter(onPlane);
  if (planeFaces.length < 3) throw codeError('setback-too-large');
  // The patch's boundary: the plane faces' edges that are not shared with another plane face.
  const shared = (e, own) => planeFaces.some((pf) => pf !== own && pf.edges.some((x) => x.isSame(e)));
  const boundary = [];
  for (const pf of planeFaces) for (const e of pf.edges) if (!shared(e, pf) && !boundary.some((x) => x.isSame(e))) boundary.push(e);
  // Tangent to the faces of the rest of the body along that boundary.
  const supportOf = (e) => {
    const m = vec(e.pointAt(0.5));
    let best = null; let bd = Infinity;
    for (const fc of rest.faces) {
      if (fc.geomType === 'PLANE' && onPlane(fc)) continue;
      const q = new R.DistanceQuery(R.makeVertex(m)); let d = Infinity; try { d = q.distanceTo(fc); } catch { d = Infinity; }
      if (d < bd) { bd = d; best = fc; }
    }
    return bd < 1e-5 ? best : null;
  };
  const mk = new oc.BRepOffsetAPI_MakeFilling(3, 15, 2, false, 1e-5, 1e-4, 0.01, 0.1, 8, 9);
  for (const e of boundary) {
    const s = supportOf(e);
    if (s) mk.Add(e.wrapped, s.wrapped, oc.GeomAbs_Shape.GeomAbs_G1, true);
    else mk.Add(e.wrapped, oc.GeomAbs_Shape.GeomAbs_C0, true);
  }
  mk.Build(new oc.Message_ProgressRange());
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  const patch = R.cast(mk.Shape()); mk.delete();
  // The new corner piece: the patch and the plane faces sewn shut.
  const sew = new oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false);
  sew.Add(patch.wrapped);
  for (const pf of planeFaces) sew.Add(pf.wrapped);
  sew.Perform(new oc.Message_ProgressRange());
  const shell = R.cast(sew.SewedShape()); sew.delete();
  let piece;
  try { piece = R.makeSolid([shell]); if (R.measureVolume(piece) < 0) piece = R.cast(piece.wrapped.Reversed()); } catch { throw codeError('setback-failed'); }
  return rest.fuse(piece);
}
