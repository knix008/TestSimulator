// Section properties: the region where a plane cuts a solid, and its area properties — area, centroid, second
// moments of area about axes through the centroid along the plane's x and y (Iu, Iv), their product (Iuv), the
// principal moments and axis angle, the polar moment and the radii of gyration. Exact (the kernel's surface
// properties of the section faces; the product from the moment about the diagonal, I(n) = nᵀ I n).
import { rep } from './kernel.js';
import { planeFace } from './extrude-more.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** The section of `body` by the plane of frame `fr` (origin, xDir, yDir, normal): a shape of faces, or null. */
export function sectionFaces(body, fr) {
  const R = rep();
  const [lo, hi] = body.boundingBox.bounds;
  const size = Math.hypot(...sub(hi, lo)) * 2 + Math.hypot(...sub(fr.origin, lo)) + 10;
  const cutter = planeFace(fr.origin, fr.normal, size);
  const out = body.clone().intersect(cutter);
  return out?.faces?.length ? out : null;
}

/**
 * The area properties of the section of `body` by frame `fr`'s plane (u along fr.xDir, v along fr.yDir):
 * { area, centroid (world), cu, cv (in the plane), Iu, Iv, Iuv (about the centroid), I1, I2 (principal), angle
 * (of the I1 axis from u, degrees), J (polar), ru, rv (radii of gyration), faces } — null when the plane misses it.
 */
export function sectionProperties(body, fr) {
  const R = rep(); const oc = R.getOC();
  const sec = sectionFaces(body, fr);
  if (!sec) return null;
  const props = new oc.GProp_GProps();
  try {
    oc.BRepGProp.SurfaceProperties(sec.wrapped, props, false, false);
    const area = props.Mass();
    if (!(area > 1e-12)) return null;
    const c = props.CentreOfMass();
    const centroid = [c.X(), c.Y(), c.Z()];
    const u = unit(fr.xDir); const v = unit(fr.yDir);
    // Second moment about an in-plane axis through the centroid along d: ∫ (distance to the axis)² dA.
    const about = (d) => { const dir = new oc.gp_Dir(...d); const ax = new oc.gp_Ax1(c, dir); try { return props.MomentOfInertia(ax); } finally { ax.delete(); dir.delete(); } };
    // About the u axis the distance is along v: Iu = ∫ v² dA; about v: Iv = ∫ u² dA.
    const Iu = about(u); const Iv = about(v);
    const diag = unit([u[0] + v[0], u[1] + v[1], u[2] + v[2]]);
    // About the diagonal: ∫ ((u − v)/√2)² dA = (Iv + Iu)/2 − Iuv  ⇒  Iuv = ∫ u v dA.
    const Iuv = (Iu + Iv) / 2 - about(diag);
    const mean = (Iu + Iv) / 2; const rad = Math.hypot((Iu - Iv) / 2, Iuv);
    const I1 = mean + rad; const I2 = mean - rad;
    const angle = (0.5 * Math.atan2(-2 * Iuv, Iu - Iv) * 180) / Math.PI;
    c.delete?.();
    const d = sub(centroid, fr.origin);
    return {
      area, centroid, cu: dot(d, u), cv: dot(d, v), Iu, Iv, Iuv, I1, I2, angle, J: Iu + Iv,
      ru: Math.sqrt(Iu / area), rv: Math.sqrt(Iv / area), faces: sec.faces.length, shape: sec,
    };
  } finally { props.delete(); }
}
