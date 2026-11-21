// Kernel primitives that only take an axis (helix, cylinder): OpenCASCADE picks their x direction (where a helix
// starts, where a cylinder's seam is) from the axis' components (gp_Ax2 / gp_Ax3 without an x direction), which
// does not turn with the model. These give them the x direction OpenCASCADE would pick in the old Y-up frame,
// turned into the current one (frame.js), so a part built Z up is exactly the old one turned — same helix start,
// same seams, same thread and spring solids.
import { rep } from './kernel.js';
import { isYUp, toZUp, toYUp } from './frame.js';

const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((x) => x / l); };

/** The x direction OpenCASCADE gives an axis placement with normal `v` (gp_Ax3(P, V)). */
export function occtXDir(v) {
  const [A, B, C] = v; const a = Math.abs(A); const b = Math.abs(B); const c = Math.abs(C);
  let d;
  if (b <= a && b <= c) d = a > c ? [-C, 0, A] : [C, 0, -A];
  else if (a <= b && a <= c) d = b > c ? [0, -C, B] : [0, C, -B];
  else d = a > b ? [-B, A, 0] : [B, -A, 0];
  return unit(d);
}

/** The x direction for an axis `dir`: OpenCASCADE's choice in the Y-up frame, seen in the current frame. */
export const stableXDir = (dir) => (isYUp() ? occtXDir(unit(dir)) : toZUp(occtXDir(toYUp(unit(dir)))));

/** A helix wire (as R.makeHelix) whose start turns with the model. */
export function makeHelixStable(pitch, height, radius, center = [0, 0, 0], dir = [0, 0, 1], lefthand = false) {
  const R = rep();
  const oc = R.getOC();
  const [r, gc] = R.localGC();
  const turn = lefthand ? -2 * Math.PI : 2 * Math.PI;
  const line = r(new oc.Geom2d_Line(r(new oc.gp_Pnt2d(0, 0)), r(new oc.gp_Dir2d(turn, pitch))));
  const nTurns = height / pitch;
  const u0 = line.Value(0);
  const u1 = line.Value(nTurns * Math.sqrt((2 * Math.PI) ** 2 + pitch ** 2));
  const seg = r(new oc.GC_MakeSegment2d(u0, u1));
  const surf = new oc.Geom_CylindricalSurface(r(R.makeAx3(center, dir, stableXDir(dir))), radius);
  const e = r(new oc.BRepBuilderAPI_MakeEdge(r(seg.Value()), r(surf))).Edge();
  const w = r(new oc.BRepBuilderAPI_MakeWire(e)).Wire();
  oc.BRepLib.BuildCurves3d(w);
  gc();
  return new R.Wire(w);
}

/** A solid cylinder (as R.makeCylinder) whose seam turns with the model. */
export function makeCylinderStable(radius, height, location = [0, 0, 0], dir = [0, 0, 1]) {
  const R = rep();
  const oc = R.getOC();
  const axis = R.makeAx2(location, dir, stableXDir(dir));
  const maker = new oc.BRepPrimAPI_MakeCylinder(axis, radius, height);
  const solid = new R.Solid(maker.Shape());
  axis.delete();
  maker.delete();
  return solid;
}

/** A circle edge (as R.makeCircle) whose start point turns with the model. */
export function makeCircleStable(radius, center = [0, 0, 0], normal = [0, 0, 1]) {
  const R = rep();
  const oc = R.getOC();
  const [r, gc] = R.localGC();
  const circ = r(new oc.gp_Circ(r(R.makeAx2(center, normal, stableXDir(normal))), radius));
  const edge = new R.Edge(r(new oc.BRepBuilderAPI_MakeEdge(circ)).Edge());
  gc();
  return edge;
}
