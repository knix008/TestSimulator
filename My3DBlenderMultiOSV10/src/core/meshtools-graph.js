// Whole-mesh operations for geometry nodes, without selections.
import { addFace, cloneMesh, createMesh, faceCenter, triangulateIndices, v3 } from './mesh.js';

/** Every face as triangles. */
export function triangulateMesh(mesh) {
  const out = createMesh(mesh.verts.map((v) => [...v]), []);
  for (const t of triangulateIndices(mesh)) addFace(out, t);
  out.smooth = mesh.smooth;
  return out;
}

/** One plain subdivision: each edge halved, each face split around its middle. Nothing moves. */
export function subdivideAll(mesh) {
  if (!mesh.faces.length) return cloneMesh(mesh);
  const out = createMesh(mesh.verts.map((v) => [...v]), []);
  const middles = new Map();
  const middle = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (!middles.has(key)) { out.verts.push(v3.mul(v3.add(mesh.verts[a], mesh.verts[b]), 0.5)); middles.set(key, out.verts.length - 1); }
    return middles.get(key);
  };
  for (const face of mesh.faces) {
    const n = face.length;
    if (n === 3) {
      const [ab, bc, ca] = [middle(face[0], face[1]), middle(face[1], face[2]), middle(face[2], face[0])];
      addFace(out, [face[0], ab, ca]);
      addFace(out, [face[1], bc, ab]);
      addFace(out, [face[2], ca, bc]);
      addFace(out, [ab, bc, ca]);
      continue;
    }
    out.verts.push(faceCenter(mesh, face));
    const c = out.verts.length - 1;
    face.forEach((v, i) => addFace(out, [v, middle(v, face[(i + 1) % n]), c, middle(face[(i + n - 1) % n], v)]));
  }
  out.smooth = mesh.smooth;
  return out;
}
