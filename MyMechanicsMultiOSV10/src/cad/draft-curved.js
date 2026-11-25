// Parting-line draft on a curved parting line: the face next to the parting curve C is replaced by a ruled surface
// from C, each ruling at the draft angle to the pull direction (tilted into the material, so the face narrows away
// from the parting line) and square to C's tangent. The old face F and the new surface S bound the material that
// goes (under F, not under S) and the material that comes (under S, not under F, over F): the regions under and over
// each surface are the surface thickened along its own normals (deep enough for the gap between them).
import { rep } from './kernel.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const L = Math.hypot(...a) || 1; return a.map((x) => x / L); };
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** The ruling direction at a point of the parting curve: at `angle` to the pull, square to the tangent, into the face. */
export function rulingDir(T, nF, g, pull, angleDeg) {
  // The pull's part square to the tangent, pointing the way the face goes from the curve.
  let p = sub(pull, T.map((x) => x * dot(pull, T)));
  if (dot(p, g) < 0) p = p.map((x) => -x);
  p = unit(p);
  // Tilted toward the material (against the face's outward normal), within the plane square to T.
  let m = sub(nF, T.map((x) => x * dot(nF, T))); m = sub(m, p.map((x) => x * dot(m, p))); m = unit(m);
  const a = (angleDeg * Math.PI) / 180;
  return unit(add(p.map((x) => x * Math.cos(a)), m, -Math.sin(a)));
}

/**
 * The body with face `face` drafted about the parting `edge` by `angle` degrees for the pull direction `pull`.
 */
export function curvedPartingDraft(body, face, edge, pull, angle, opts) {
  const { remove, add: more } = curvedDraftRegions(face, edge, pull, angle, opts);
  return body.cut(remove).fuse(more);
}

/** The material a curved parting-line draft of one face takes away and adds: { remove, add }. */
export function curvedDraftRegions(face, edge, pull, angle, { codeError, normalAt }) {
  const R = rep(); const oc = R.getOC();
  const [lo, hi] = face.boundingBox.bounds; const size = Math.hypot(...sub(hi, lo)) + 1;
  // How far the face runs from the curve along the pull (its box corners): the rulings reach a little past it.
  const pu = unit(pull); const c0 = vec(edge.pointAt(0.5));
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]]);
  const ext = Math.max(...corners.map((q) => Math.abs(dot(sub(q, c0), pu))), size * 0.05);
  const reach = ext / Math.cos((Math.min(44, Math.abs(angle)) * Math.PI) / 180) * 1.1 + size * 0.02;
  const n = 48;
  const lo1 = []; const hi1 = [];
  let meanN = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const C = vec(edge.pointAt(t)); const T = unit(vec(edge.tangentAt(t)));
    const nF = unit(normalAt(face, C));
    meanN = add(meanN, nF);
    let g = cross(T, nF); // in the face, square to the curve; flipped to point into the face
    const probe = add(C, g, size * 1e-3);
    const q = new R.DistanceQuery(R.makeVertex(probe)); let d = 1; try { d = q.distanceTo(face); } catch { d = 1; }
    if (d > size * 1e-4) g = g.map((x) => -x);
    const w = rulingDir(T, nF, g, pull, angle);
    lo1.push(add(C, w, -size * 0.02)); hi1.push(add(C, w, reach));
  }
  meanN = unit(meanN);
  const curve = (pts) => R.assembleWire([R.makeBSplineApproximation(pts, { tolerance: 1e-7, smoothing: null, degMax: 3, degMin: 1 })]);
  const S = R.loft([curve(lo1), curve(hi1)], { ruled: true }, true);
  // Thick enough to hold the gap between the old face and the new one (reach · sin α), no more (offsets fold over).
  const depth = reach * Math.sin((Math.abs(angle) * Math.PI) / 180) * 1.5 + size * 0.01;
  // A surface thickened along its own normals (outward d > 0, inward d < 0): the region over / under it.
  const thick = (shape, d) => {
    const mk = new oc.BRepOffsetAPI_MakeThickSolid();
    mk.MakeThickSolidBySimple(shape.wrapped, d);
    mk.Build(new oc.Message_ProgressRange());
    if (!mk.IsDone()) { mk.delete(); throw codeError('draft-failed'); }
    let t = R.cast(mk.Shape()); mk.delete();
    try { if (R.measureVolume(t) < 0) t = R.cast(t.wrapped.Reversed()); } catch { /* keep */ }
    return t;
  };
  // Which way each thickening went (the kernel's offset follows the surface, not the face's orientation): a point
  // just outside the material next to the curve's middle decides.
  const Cm = vec(edge.pointAt(0.5)); const nm = unit(normalAt(face, Cm));
  const inside = (solid, p) => { const h = depth * 0.01; try { return R.measureVolume(solid.clone().intersect(R.makeBox(p.map((c) => c - h), p.map((c) => c + h)))) > 4 * h ** 3; } catch { return false; } };
  const sides = (shape, probe) => { const a = thick(shape, depth); const b = thick(shape, -depth); return inside(a, probe) ? { out: a, in: b } : { out: b, in: a }; };
  const Tm = unit(vec(edge.tangentAt(0.5)));
  let gm = cross(Tm, nm); { const q = new R.DistanceQuery(R.makeVertex(add(Cm, gm, size * 1e-3))); let d = 1; try { d = q.distanceTo(face); } catch { d = 1; } if (d > size * 1e-4) gm = gm.map((x) => -x); }
  const wm = rulingDir(Tm, nm, gm, pull, angle);
  // Only the sides under each surface matter: thin (depth) and deep (2 depth) ones.
  const under = (shape, probe, d) => { const a = thick(shape, d); const b = thick(shape, -d); return inside(a, probe) ? b : a; };
  const pF = add(add(Cm, gm, size * 0.05), nm, depth * 0.5); const pS = add(add(Cm, wm, size * 0.05), nm, depth * 0.5);
  const inF = under(face, pF, depth); const inF2 = under(face, pF, 2 * depth);
  const inS = under(S, pS, depth); const inS2 = under(S, pS, 2 * depth);
  void meanN;
  // Goes: under F, not under S (deep enough that nothing deeper is left); comes: under S, not under F.
  const fuzzy = (Op) => (a, b) => {
    const args = new oc.NCollection_List_TopoDS_Shape(); args.Append(a.wrapped);
    const tools = new oc.NCollection_List_TopoDS_Shape(); tools.Append(b.wrapped);
    const op = new Op();
    op.SetArguments(args); op.SetTools(tools); op.SetFuzzyValue(size * 1e-7); op.Build(new oc.Message_ProgressRange());
    if (op.HasErrors()) { op.delete(); throw codeError('draft-failed'); }
    const r = R.cast(op.Shape()); op.delete(); return r;
  };
  const fuzzyCut = fuzzy(oc.BRepAlgoAPI_Cut); const fuzzyCommon = fuzzy(oc.BRepAlgoAPI_Common);
  // Over F (thick enough): what comes stays within F's own extent, not where S runs on past it.
  const outF2 = (() => { const a = thick(face, 2 * depth); const b = thick(face, -2 * depth); return inside(a, pF) ? a : b; })();
  const res = { remove: fuzzyCut(inF, inS2), add: fuzzyCommon(fuzzyCut(inS, inF2), outF2) };
  return res;
}
