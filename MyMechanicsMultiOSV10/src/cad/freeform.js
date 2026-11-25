// Freeform: a face reshaped by a grid of control points (nu × nv over the face's own parameters). Each control point
// moves along the face's normal by its offset; the face moves by the Bernstein blend of those offsets
// δ(s, t) = Σ Bᵢ(s) Bⱼ(t) dᵢⱼ. The border rows stay put (contact with the faces around), two rows with tangent
// continuity. A face whose boundary is its parameter rectangle becomes a B-spline surface fitted through the moved
// points and sewn back into the body; any other face is reshaped on a fine mesh (a faceted body).
import { rep } from './kernel.js';
import { faceSampler } from './mold-brep.js';

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

const binom = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - i + 1)) / i; return c; };
const bern = (n, k, t) => binom(n, k) * t ** k * (1 - t) ** (n - k);

/** The offset field δ(s, t) over (0…1)² from the control points [{ i, j, d }] of an nu × nv grid. */
export function freeformField(nu, nv, points, continuity = 'contact') {
  const fixed = continuity === 'tangent' ? 2 : 1;
  const c = Array.from({ length: nu }, () => new Array(nv).fill(0));
  for (const p of points ?? []) {
    const i = Math.round(Number(p.i)); const j = Math.round(Number(p.j));
    if (i < fixed || j < fixed || i > nu - 1 - fixed || j > nv - 1 - fixed) continue; // border rows stay put
    c[i][j] = Number(p.d) || 0;
  }
  return (s, t) => { let d = 0; for (let i = 0; i < nu; i++) { const bi = bern(nu - 1, i, s); if (!bi) continue; for (let j = 0; j < nv; j++) if (c[i][j]) d += bi * bern(nv - 1, j, t) * c[i][j]; } return d; };
}

/** Whether a face's boundary is its whole parameter rectangle (four edges on its u / v bounds). */
function untrimmed(face, S) {
  if (face.edges.length !== 4) return false;
  const { uMin, uMax, vMin, vMax } = S.bounds;
  const corners = [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]].map(([u, v]) => S.at(u, v).p);
  const verts = face.edges.flatMap((e) => [e.startPoint, e.endPoint]).map((p) => [p.x, p.y, p.z]);
  return corners.every((c) => verts.some((v) => Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]) < 1e-6));
}

/**
 * The body with `face` reshaped. `faceted(fn)` remeshes the body moving points by fn (the fallback); returns { body,
 * exact }.
 */
export function freeformBody(body, face, { nu = 4, nv = 4, points = [], continuity = 'contact' } = {}, { codeError, faceted }) {
  const R = rep(); const oc = R.getOC();
  const field = freeformField(Math.max(3, nu), Math.max(3, nv), points, continuity);
  const S = faceSampler(face);
  try {
    const { uMin, uMax, vMin, vMax } = S.bounds;
    const moved = (u, v) => { const q = S.at(u, v); return add(q.p, q.n, field((u - uMin) / (uMax - uMin), (v - vMin) / (vMax - vMin))); };
    if (untrimmed(face, S)) {
      const K = 25;
      const arr = new oc.NCollection_Array2_gp_Pnt(1, K, 1, K);
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { const p = moved(uMin + ((uMax - uMin) * i) / (K - 1), vMin + ((vMax - vMin) * j) / (K - 1)); arr.SetValue(i + 1, j + 1, new oc.gp_Pnt(p[0], p[1], p[2])); }
      const fit = new oc.GeomAPI_PointsToBSplineSurface();
      fit.Init(arr, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-7);
      if (fit.IsDone()) {
        const mkf = new oc.BRepBuilderAPI_MakeFace(fit.Surface(), 1e-7);
        const nf = R.cast(mkf.Face()); mkf.delete(); fit.delete();
        const sew = new oc.BRepBuilderAPI_Sewing(1e-5, true, true, true, false);
        for (const fc of body.faces) if (!fc.isSame(face)) sew.Add(fc.wrapped);
        sew.Add(nf.wrapped);
        sew.Perform(new oc.Message_ProgressRange());
        const shell = R.cast(sew.SewedShape()); sew.delete();
        try {
          let solid = R.makeSolid([shell]);
          if (R.measureVolume(solid) < 0) solid = R.cast(solid.wrapped.Reversed());
          if (R.measureVolume(solid) > 0) return { body: solid, exact: true };
        } catch { /* the faceted way below */ }
      } else fit.delete();
    }
    // Faceted: mesh points on the face move by the field at their own parameters; the rest stay.
    const q0 = (p) => { const d = new R.DistanceQuery(R.makeVertex(p)); try { return d.distanceTo(face); } catch { return Infinity; } };
    const fn = (p) => {
      if (q0(p) > 1e-6) return p;
      const [u, v] = face.uvCoordinates(p);
      const q = S.at(u, v);
      return add(p, q.n, field((u - uMin) / (uMax - uMin), (v - vMin) / (vMax - vMin)));
    };
    const out = faceted(fn);
    if (!out) throw codeError('kernel');
    return { body: out, exact: false };
  } finally { S.delete(); }
}
