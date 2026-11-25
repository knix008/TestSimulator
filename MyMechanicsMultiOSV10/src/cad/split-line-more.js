// Split line kinds beyond the sketch projection:
//   silhouette    the faces split where they turn away from a direction (their normal square to it): the parting
//                 line of a moulded part. Cylinders split by the plane through their axis across the direction,
//                 spheres by the plane through their centre square to it (both exact), cones by the plane holding
//                 their two silhouette lines, any other curved face along its draft-zero curves (found and refined
//                 on its parameters, mold-brep.js) through which a thin ruled cutter along the face normal is laid —
//                 the splitter cuts the face where the cutter crosses it.
//   intersection  the faces split where they meet planes, faces of the body or surface bodies.
import { rep } from './kernel.js';
import { revolvedAxis } from './costing.js';
import { zeroCurves, chainCutter, coneCutter } from './mold-brep.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const L = Math.hypot(...a) || 1; return a.map((x) => x / L); };

/** A square planar face of half-size `big` through `p` with normal `n` (a cutting tool). */
export function planeTool(p, n, big) {
  const R = rep();
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, a)); const v = cross(n, u);
  const c = (s, t) => add(add(p, u, s * big), v, t * big);
  return R.makePolygon([c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)]);
}

/** The silhouette chains of a face for direction d: [[{ p, n }]] (none for planes). */
export function silhouetteChains(face, d, size = null) {
  return zeroCurves(face, unit(d), { grid: 24, size });
}

/** The cutting tools of a face's silhouette for direction d ([] for planes and faces that never turn away). */
export function silhouetteTools(face, d, big) {
  const type = face.geomType;
  if (type === 'PLANE') return [];
  const dd = unit(d);
  const ax = revolvedAxis(face);
  if (ax?.kind === 'cyl') {
    const across = sub(dd, ax.dir.map((x) => x * dot(dd, ax.dir)));
    if (Math.hypot(...across) < 1e-9) return [];
    // Its normal is square to d where the radial direction is square to d's part across the axis.
    return [planeTool(ax.point, unit(across), big)];
  }
  if (ax?.kind === 'sphere') return [planeTool(ax.point, dd, big)];
  if (type === 'CONE') { const t = coneCutter(face, dd, big); if (t) return [t]; if (t === undefined) return []; }
  const out = [];
  // Chains of a few points only are fragments where the zero line grazes the face's boundary (it runs along an
  // edge there): left out, the face is already split there.
  for (const c of silhouetteChains(face, dd, big).filter((x) => x.length >= 5)) { const t = chainCutter(face, c, big); if (t) out.push(t); }
  return out;
}

/** Splits `face` with the tool shapes (within `fuzzy`); its pieces (the face itself when nothing splits it). */
export function splitFace(face, tools, fuzzy = 0) {
  const R = rep(); const oc = R.getOC();
  const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(face.clone().wrapped);
  const list = new oc.NCollection_List_TopoDS_Shape();
  for (const t of tools) list.Append(t.clone().wrapped);
  const sp = new oc.BRepAlgoAPI_Splitter();
  sp.SetArguments(args); sp.SetTools(list); if (fuzzy > 0) sp.SetFuzzyValue(fuzzy); sp.Build(new oc.Message_ProgressRange());
  let pieces = sp.HasErrors() ? [face.clone()] : R.cast(sp.Shape()).faces;
  sp.delete();
  // A split that loses or adds surface is refused (the face stays whole) rather than damaging the body.
  if (pieces.length > 1) {
    try {
      const A = R.measureArea(face); const B = pieces.reduce((s, p) => s + R.measureArea(p), 0);
      if (Math.abs(A - B) > 1e-6 * Math.max(1, A)) pieces = [face.clone()];
    } catch { pieces = [face.clone()]; }
  }
  return pieces;
}

