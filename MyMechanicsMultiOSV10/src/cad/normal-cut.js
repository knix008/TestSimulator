// Normal cut of sheet metal: an extruded cut through a bent sheet made square to the sheet everywhere (as if cut
// in the flat and folded), not along the extrude direction. The cut's prism marks, on each sheet face it reaches
// (the planar flats and the cylindrical bends of one side of the sheet), the patch to remove; each patch is
// thickened straight through the sheet (along the face normal: radially in a bend) and those slabs are cut away.
// A face counts as a sheet face when, from its middle, the material runs exactly the sheet's thickness inward.
import { rep } from './kernel.js';
import { codeError } from './features.js';
import { isCylinder } from './refs.js';

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);

/** A point on a face (the middle of its parameters) and its outward unit normal there. */
function faceProbe(face) {
  // The middle of the face's parameter range (pointOnSurface takes 0…1).
  const q = vec(face.pointOnSurface(0.5, 0.5));
  const m = vec(face.normalAt(q)); const L = Math.hypot(...m) || 1;
  return { p: q, n: m.map((x) => x / L) };
}

/** Whether `p` is inside the solid: most of a small cube round it (half-size r) is material. */
function inside(R, body, p, r) {
  try { return R.measureVolume(body.clone().intersect(R.makeBox(add(p, [r, r, r], -1), add(p, [r, r, r])))) > 8 * r ** 3 * 0.5; } catch { return false; }
}

/**
 * The sheet faces of a body: planar or cylindrical faces with the material running `t` inward from them (the side
 * walls of the sheet, only t wide, run far further and are left out).
 */
export function sheetFaces(body, t) {
  const R = rep();
  const out = [];
  for (const face of body.faces) {
    if (face.geomType !== 'PLANE' && !isCylinder(face.geomType)) continue;
    let probe; try { probe = faceProbe(face); } catch { continue; }
    const { p, n } = probe;
    const r = t * 0.05;
    if (!inside(R, body, add(p, n, -t * 0.5), r)) continue;
    if (inside(R, body, add(p, n, -t * 1.2), r)) continue;
    out.push(face);
  }
  return out;
}

/** A face thickened by `d` along its normal (a solid; outward-normal sign as given). */
function thickFace(R, face, d) {
  const oc = R.getOC();
  const mk = new oc.BRepOffsetAPI_MakeThickSolid();
  mk.MakeThickSolidBySimple(face.wrapped, d);
  mk.Build(new oc.Message_ProgressRange());
  if (!mk.IsDone()) { mk.delete(); throw codeError('kernel'); }
  let s = R.cast(mk.Shape()); mk.delete();
  try { if (R.measureVolume(s) < 0) s = R.cast(s.wrapped.Reversed()); } catch { /* keep */ }
  return s;
}

/**
 * The normal-cut tool for a sheet body: the extruded prism `prism` laid onto the sheet faces it reaches and pushed
 * straight through the sheet of thickness `t`. Only the side the cut comes in through is used (faces turned against
 * `dir`, the cut's direction into the material), so a bend is cut radially from its entry face. Returns null when
 * the prism reaches no sheet face.
 */
export function normalCutTool(body, prism, t, dir) {
  const R = rep();
  const pad = Math.max(1e-3, t * 0.02);
  let tool = null;
  for (const face of sheetFaces(body, t)) {
    // A face is not a solid: its common part with the prism is taken with the kernel's boolean directly.
    let faces = [];
    try {
      const oc = R.getOC();
      const common = new oc.BRepAlgoAPI_Common(face.wrapped, prism.wrapped, new oc.Message_ProgressRange());
      if (!common.HasErrors()) { const patch = R.cast(common.Shape()); faces = patch.faces ?? []; }
      common.delete();
    } catch { continue; }
    for (const piece of faces) {
      let area = 0; try { area = R.measureArea(piece); } catch { area = 0; }
      if (!(area > 1e-8)) continue;
      let n; try { n = faceProbe(piece).n; } catch { continue; }
      if (dir && n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] > -1e-6) continue;
      // From just outside the face to just past the far side of the sheet.
      const slab = thickFace(R, piece, -(t + pad));
      tool = tool ? tool.fuse(slab) : slab;
    }
  }
  return tool;
}
