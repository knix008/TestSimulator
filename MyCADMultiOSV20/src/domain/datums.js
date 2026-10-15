// Datums (Part_DatumPlane / Line / Point, Part_CoordinateSystem, the
// PartDesign datums) and FreeCAD's Attacher: a datum (or any solid) can be
// attached to faces, edges and vertices of other solids; its placement is
// worked out from them and follows when they change.
import { meshTopology, matchElement } from './topology.js';
import { eulerOf } from './transform3d.js';

/** Attachment modes, what they need, and what they give. */
export const ATTACH_MODES = {
  // On a face: the origin at its centre, z along its normal (FreeCAD FlatFace).
  flat: { needs: ['face'] },
  // Normal to an edge: the origin at its middle, z along it (NormalToEdge).
  normal: { needs: ['edge'] },
  // At a vertex, keeping the axes of the drawing (Translate).
  point: { needs: ['vertex'] },
  // Through three vertices: the plane they span (ThreePointsPlane).
  threePoints: { needs: ['vertex', 'vertex', 'vertex'] },
  // Along two vertices: z from the first to the second (TwoPointLine).
  twoPoints: { needs: ['vertex', 'vertex'] },
  // The placement of a whole object (ObjectXY).
  object: { needs: ['object'] },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

/** A placement whose z axis is `z` (x chosen square to it, as near world x as can be). */
export function frameToPlacement(origin, z, xHint = null) {
  const zz = unit(z);
  let x = xHint ? unit(xHint) : (Math.abs(zz[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  x = unit(sub(x, zz.map((v) => v * (x[0] * zz[0] + x[1] * zz[1] + x[2] * zz[2]))));
  const y = cross(zz, x);
  const R = [[x[0], y[0], zz[0]], [x[1], y[1], zz[1]], [x[2], y[2], zz[2]]];
  return { x: origin[0], y: origin[1], z: origin[2], ...eulerOf(R) };
}

/**
 * The placement an attachment gives, or null when its references are gone.
 * elementOf(ref) → the element { kind, face|edge|vertex, entity } found again from its signature.
 */
export function attachedPlacement(attach, elementOf) {
  const refs = attach.refs.map(elementOf);
  if (refs.some((r) => !r)) return null;
  const offset = attach.offset ?? [0, 0, 0];
  let placement = null;
  switch (attach.mode) {
    case 'flat': { const f = refs[0].face; placement = f ? frameToPlacement(f.center, f.normal) : null; break; }
    case 'normal': { const e = refs[0].edge; placement = e ? frameToPlacement(e.mid, e.dir) : null; break; }
    case 'point': { const v = refs[0].vertex; placement = v ? { x: v.point[0], y: v.point[1], z: v.point[2], rx: 0, ry: 0, rz: 0 } : null; break; }
    case 'threePoints': {
      const [a, b, c] = refs.map((r) => r.vertex?.point);
      if (!a || !b || !c) return null;
      placement = frameToPlacement(a, cross(sub(b, a), sub(c, a)), sub(b, a));
      break;
    }
    case 'twoPoints': {
      const [a, b] = refs.map((r) => r.vertex?.point);
      if (!a || !b) return null;
      placement = frameToPlacement(a, sub(b, a));
      break;
    }
    case 'object': { const e = refs[0].entity; placement = e ? { x: e.x ?? 0, y: e.y ?? 0, z: e.z ?? 0, rx: e.rx ?? 0, ry: e.ry ?? 0, rz: e.rz ?? 0 } : null; break; }
    default: return null;
  }
  if (!placement) return null;
  return { ...placement, x: placement.x + offset[0], y: placement.y + offset[1], z: placement.z + offset[2] };
}

/**
 * Re-places every attached object of a drawing from what it is attached to
 * (after each change). meshOf(entity) gives a solid's triangles in drawing
 * coordinates. Returns how many moved.
 */
export function resolveAttachments(drawing, meshOf) {
  const attached = drawing.entities.filter((e) => e.type === 'solid' && e.attach?.refs?.length);
  if (!attached.length) return 0;
  const topologies = new Map();
  const topologyOf = (entity) => {
    if (!topologies.has(entity.id)) topologies.set(entity.id, meshTopology(meshOf(entity)));
    return topologies.get(entity.id);
  };
  let moved = 0;
  for (const datum of attached) {
    const elementOf = (ref) => {
      const entity = drawing.entities.find((e) => e.id === ref.id);
      if (!entity || entity.id === datum.id) return null;
      if (ref.kind === 'object') return { entity };
      const topology = topologyOf(entity);
      const index = matchElement(topology, ref.kind, ref.signature);
      if (index < 0) return null;
      return { entity, [ref.kind]: ref.kind === 'face' ? topology.faces[index] : ref.kind === 'edge' ? topology.edges[index] : topology.vertices[index] };
    };
    const place = attachedPlacement(datum.attach, elementOf);
    if (!place) continue;
    const i = drawing.entities.indexOf(datum);
    const same = ['x', 'y', 'z', 'rx', 'ry', 'rz'].every((k) => Math.abs((datum[k] ?? 0) - place[k]) < 1e-9);
    if (!same) { drawing.entities[i] = { ...datum, ...place }; moved++; }
  }
  return moved;
}

/** A datum's lines in its own coordinates, for the 3D view: { lines: [[p, q]], plane: size | 0, point: bool }. */
export function datumGlyph(type, size) {
  const s = size;
  switch (type) {
    case 'plane': return { lines: [[[-s / 2, -s / 2, 0], [s / 2, -s / 2, 0]], [[s / 2, -s / 2, 0], [s / 2, s / 2, 0]], [[s / 2, s / 2, 0], [-s / 2, s / 2, 0]], [[-s / 2, s / 2, 0], [-s / 2, -s / 2, 0]]], plane: s };
    case 'line': return { lines: [[[0, 0, -s / 2], [0, 0, s / 2]]], plane: 0 };
    case 'point': return { lines: [], plane: 0, point: true };
    default: return { lines: [[[0, 0, 0], [s, 0, 0]], [[0, 0, 0], [0, s, 0]], [[0, 0, 0], [0, 0, s]]], plane: 0, axes: true };
  }
}
