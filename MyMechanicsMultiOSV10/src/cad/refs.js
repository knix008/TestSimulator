// References to faces and edges that survive a rebuild ("topological naming"): a picked face or edge
// is remembered by its geometry (centre, normal or direction, size, surface type) and found again in
// the rebuilt solid as the closest match. A fillet keeps its edge when a dimension earlier in the tree
// changes, as long as the edge still exists somewhere near.
import { worldFront } from './frame.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lengthOf = (a) => Math.hypot(a[0], a[1], a[2]);
const tuple = (v) => (Array.isArray(v) ? v : [v.x, v.y, v.z]);

/** Surface types as the kernel names them (OpenCASCADE's enum: a cylinder is "CYLINDRE"). */
export const isCylinder = (type) => type === 'CYLINDRE' || type === 'CYLINDER';

const unit = (v) => { const l = lengthOf(v); return l > 1e-12 ? v.map((x) => x / l) : [0, 0, 0]; };

/** A face's signature: { type, center, normal (unit, on the face), area, radius (cylinders) }. */
export function faceSignature(face) {
  const center = tuple(face.center);
  let normal = [0, 0, 0];
  // Planes: the normal anywhere. Curved faces: at a point on the face (their centre of mass is off the surface).
  try { normal = unit(tuple(face.geomType === 'PLANE' ? face.normalAt(face.center) : face.normalAt(face.pointOnSurface(0.5, 0.5)))); } catch { /* a face without a normal there */ }
  let area = 0;
  try { area = faceArea(face); } catch { /* kept 0 */ }
  const sig = { type: face.geomType, center: center.map(round), normal: normal.map(round), area: round(area) };
  if (isCylinder(face.geomType)) { const radius = cylinderRadius(face); if (radius) sig.radius = round(radius); }
  return sig;
}

/** An edge's signature: { type, mid, dir, length, start, end }. */
export function edgeSignature(edge) {
  const mid = tuple(edge.pointAt(0.5));
  let dir = [0, 0, 0];
  try { dir = unit(tuple(edge.tangentAt(0.5))); } catch { /* degenerate */ }
  return { type: edge.geomType, mid: mid.map(round), dir: dir.map(round), length: round(edge.length), start: tuple(edge.startPoint).map(round), end: tuple(edge.endPoint).map(round) };
}

const round = (v) => Math.round(v * 1e6) / 1e6;

/** A cylindrical face's radius, from one of its circular edges (null when it has none). */
export function cylinderRadius(face) {
  for (const edge of face.edges ?? []) {
    if (edge.geomType !== 'CIRCLE') continue;
    const [a, b, c] = [0, 0.25, 0.5].map((t) => tuple(edge.pointAt(t)));
    const ab = lengthOf(sub(a, b)); const bc = lengthOf(sub(b, c)); const ca = lengthOf(sub(c, a));
    const area2 = lengthOf(crossV(sub(b, a), sub(c, a)));
    if (area2 > 1e-12) return (ab * bc * ca) / (2 * area2);
  }
  return null;
}

let measureArea = null;
/** The kernel's area measure is handed in once (kernel-free tests can leave it unset). */
export function setAreaMeasure(fn) { measureArea = fn; }
function faceArea(face) { return measureArea ? measureArea(face) : 0; }

/** How far a face is from a signature (0 = the same; scale-free). */
export function faceDistance(sig, face, size) {
  const s = faceSignature(face);
  const d = lengthOf(sub(s.center, sig.center)) / size;
  const n = 1 - dot(s.normal, sig.normal);
  const t = s.type === sig.type ? 0 : 0.5;
  const a = sig.area ? Math.abs(s.area - sig.area) / Math.max(sig.area, s.area, 1e-9) : 0;
  return d + n + t + a * 0.3;
}

export function edgeDistance(sig, edge, size) {
  const s = edgeSignature(edge);
  const d = lengthOf(sub(s.mid, sig.mid)) / size;
  const n = 1 - Math.abs(dot(s.dir, sig.dir));
  const t = s.type === sig.type ? 0 : 0.5;
  const l = sig.length ? Math.abs(s.length - sig.length) / Math.max(sig.length, s.length, 1e-9) : 0;
  return d + n + t + l * 0.3;
}

/** Size of a shape (its bounding box diagonal) for scale-free matching. */
export function shapeSize(shape) {
  try {
    const [lo, hi] = shape.boundingBox.bounds;
    return Math.max(1e-6, lengthOf(sub(hi, lo)));
  } catch { return 1; }
}

/** The face of `shape` matching `sig` best (null when nothing is close enough). */
export function findFace(shape, sig, limit = 0.6) {
  if (!shape || !sig) return null;
  const size = shapeSize(shape);
  let best = null; let score = Infinity;
  for (const face of shape.faces) {
    const s = faceDistance(sig, face, size);
    if (s < score) { score = s; best = face; }
  }
  return score <= limit ? best : null;
}

/** The edges of `shape` matching the signatures (each once). */
export function findEdges(shape, sigs, limit = 0.6) {
  if (!shape || !sigs?.length) return [];
  const size = shapeSize(shape);
  const edges = shape.edges;
  const out = [];
  for (const sig of sigs) {
    let best = null; let score = Infinity;
    for (const edge of edges) {
      if (out.includes(edge)) continue;
      const s = edgeDistance(sig, edge, size);
      if (s < score) { score = s; best = edge; }
    }
    if (best && score <= limit) out.push(best);
  }
  return out;
}

/** A plane from a planar face: { origin, normal, xDir } (x along the face's first straight edge when it has one). */
export function planeOfFace(face) {
  const origin = tuple(face.center);
  const normal = unit(tuple(face.normalAt(face.center)));
  let xDir = null;
  for (const edge of face.edges ?? []) {
    if (edge.geomType !== 'LINE') continue;
    const d = sub(tuple(edge.endPoint), tuple(edge.startPoint));
    const l = lengthOf(d);
    if (l > 1e-9) { xDir = d.map((v) => v / l); break; }
  }
  // No straight edge (a round face): x across the face from the front direction (or along X when it faces the front).
  if (!xDir || Math.abs(dot(xDir, normal)) > 0.99) { const fr = worldFront(); xDir = Math.abs(dot(normal, fr)) < 0.9 ? normalize(crossV(fr, normal)) : [1, 0, 0]; }
  // Remove any part along the normal.
  const k = dot(xDir, normal);
  xDir = normalize(sub(xDir, normal.map((v) => v * k)));
  return { origin, normal, xDir };
}

export const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a) => { const l = lengthOf(a) || 1; return a.map((v) => v / l); };
