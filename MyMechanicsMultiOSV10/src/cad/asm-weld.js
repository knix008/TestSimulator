// Assembly weld beads: a fillet weld where a component's edge stands on another component's face (a plate on a
// plate, a tube on a flange). The bead's section is a right triangle with legs of the weld size, one up the
// first component's side face, one out along the second component's face; it runs the length of each edge
// (straight edges: extruded, full circles: revolved). Everything in assembly space; the parts are not changed.
import { rep } from './kernel.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; };
const vec = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

/** The direction from the edge (at p, tangent T) into the face. */
function intoFace(face, p, T) {
  const R = rep();
  const a = unit(cross(T, unit(vec(face.normalAt(p)))));
  const d = (q) => { try { return R.measureDistanceBetween(face, R.makeVertex(q)); } catch { return Infinity; } };
  return d(add(p, mul(a, 1e-2))) <= d(add(p, mul(a, -1e-2))) ? a : mul(a, -1);
}

/**
 * The bead of one edge of component A (`bodyA` and `edge` in assembly space) standing on face `faceB` of
 * component B (assembly space), with legs `size`. Returns { bead, length } (throws 'weld-not-on-face' when the
 * edge is not on the face, 'weld-no-side' when A has no side face at the edge, 'edge-unsupported' for an edge
 * that is neither straight nor a full circle).
 */
export function weldBeadOf(bodyA, edge, faceB, size) {
  const R = rep();
  const s = Math.max(0.05, Number(size) || 5);
  const p = vec(edge.pointAt(0)); const T = unit(vec(edge.tangentAt(0)));
  if (R.measureDistanceBetween(R.makeVertex(p), faceB) > Math.max(1e-3, s * 1e-3)) throw new Error('weld-not-on-face');
  let nB = unit(vec(faceB.normalAt(p)));
  // A's faces at the edge: the side face is the one that is not lying on B's face.
  const faces = bodyA.faces.filter((fc) => fc.edges.some((e) => e.isSame(edge)));
  const side = faces.map((fc) => ({ fc, n: unit(vec(fc.normalAt(p))) })).sort((x, y) => Math.abs(dot(x.n, nB)) - Math.abs(dot(y.n, nB)))[0];
  if (!side || Math.abs(dot(side.n, nB)) > 0.999) throw new Error('weld-no-side');
  // Up the side face (away from B) and out along B's face (away from A).
  const up = intoFace(side.fc, p, T);
  if (dot(up, nB) < 0) nB = mul(nB, -1);
  const outA = sub(side.n, mul(nB, dot(side.n, nB)));
  const out = unit(outA);
  const profile = R.makePolygon([p, add(p, mul(up, s)), add(p, mul(out, s))]);
  let bead;
  if (edge.geomType === 'LINE') bead = R.basicFaceExtrusion(profile, new R.Vector(sub(vec(edge.endPoint), vec(edge.startPoint))));
  else if (edge.geomType === 'CIRCLE' && Math.hypot(...sub(vec(edge.startPoint), vec(edge.endPoint))) < 1e-6) {
    const q = [0, 0.25, 0.5].map((t) => vec(edge.pointAt(t)));
    const ab = sub(q[1], q[0]); const ac = sub(q[2], q[0]);
    const n = cross(ab, ac); const d = 2 * dot(n, n);
    const c = add(q[0], mul(add(mul(cross(n, ab), dot(ac, ac)), mul(cross(ac, n), dot(ab, ab))), 1 / d));
    bead = R.revolution(profile, c, unit(n), 360);
  } else throw new Error('edge-unsupported');
  return { bead, length: edge.length };
}

/** All beads of a weld (several edges of A on one face of B): { bead (one shape), length, volume, count }. */
export function weldBeads(bodyA, edges, faceB, size) {
  const R = rep();
  const parts = edges.map((e) => weldBeadOf(bodyA, e, faceB, size));
  if (!parts.length) throw new Error('no-edges');
  const bead = parts.length > 1 ? R.makeCompound(parts.map((x) => x.bead)) : parts[0].bead;
  let volume = 0;
  for (const x of parts) { try { volume += R.measureVolume(x.bead); } catch { /* none */ } }
  return { bead, length: parts.reduce((t, x) => t + x.length, 0), volume, count: parts.length };
}
