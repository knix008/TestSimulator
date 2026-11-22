// Texture coordinates of a meshed body from its B-rep faces: after meshing, every face keeps OpenCASCADE's
// triangulation with the surface parameters (u, v) of its nodes, in the order the mesh extractor copied the
// vertices. The parameters are scaled by the surface's metric at the face's middle (|∂P/∂u|, |∂P/∂v|), so a
// texture has the same size in millimetres on planes (u, v already mm), cylinders (u is an angle: × radius),
// cones, spheres, B-splines. A face whose triangulation does not line up falls back to projecting each vertex
// onto the surface. Cached on the build entry.
import { getOC } from 'replicad';

/**
 * Per-vertex UVs (mm) of a build entry { mesh: { vertices, triangles, faceGroups }, faces, faceIndex }:
 * { uv: Float32Array (2 a vertex), ok: Uint8Array (1 where the vertex has one), faces, fromTriangulation }.
 */
export function meshFaceUVs(entry) {
  if (entry.renderUv !== undefined) return entry.renderUv;
  let result = null;
  try { result = computeUVs(entry); } catch (error) { console.warn('uv', error); result = null; }
  entry.renderUv = result;
  return result;
}

function computeUVs({ mesh, faces, faceIndex }) {
  if (!mesh || !faces?.length) return null;
  const oc = getOC();
  const V = mesh.vertices; const T = mesh.triangles;
  const nv = V.length / 3;
  const uv = new Float32Array(nv * 2); const ok = new Uint8Array(nv);
  let fromTriangulation = 0; let projected = 0;
  for (const fg of mesh.faceGroups ?? []) {
    const face = faces[faceIndex?.get(fg.faceId) ?? -1];
    if (!face) continue;
    let lo = Infinity; let hi = -1;
    for (let k = fg.start; k < fg.start + fg.count; k++) { const i = T[k]; if (i < lo) lo = i; if (i > hi) hi = i; }
    if (hi < 0) continue;
    const surface = new oc.BRepAdaptor_Surface(face.wrapped, false);
    const pnt = new oc.gp_Pnt();
    const at = (u, v) => { surface.D0(u, v, pnt); return [pnt.X(), pnt.Y(), pnt.Z()]; };
    // The metric at the middle of the face's parameter box.
    const { uMin, uMax, vMin, vMax } = face.UVBounds;
    const um = (uMin + uMax) / 2; const vm = (vMin + vMax) / 2;
    const du = Math.max(1e-9, (uMax - uMin) * 1e-3); const dv = Math.max(1e-9, (vMax - vMin) * 1e-3);
    const p0 = at(um, vm); const pu = at(um + du, vm); const pv = at(um, vm + dv);
    const su = Math.hypot(pu[0] - p0[0], pu[1] - p0[1], pu[2] - p0[2]) / du || 1;
    const sv = Math.hypot(pv[0] - p0[0], pv[1] - p0[1], pv[2] - p0[2]) / dv || 1;
    let done = false;
    try {
      const loc = new oc.TopLoc_Location();
      const handle = oc.BRep_Tool.Triangulation(face.wrapped, loc, 0);
      const tri = handle?.get ? (handle.IsNull?.() ? null : handle.get()) : handle;
      if (tri && tri.HasUVNodes() && tri.NbNodes() === hi - lo + 1) {
        for (let i = 0; i < hi - lo + 1; i++) {
          const p = tri.UVNode(i + 1);
          uv[(lo + i) * 2] = p.X() * su; uv[(lo + i) * 2 + 1] = p.Y() * sv; ok[lo + i] = 1;
          p.delete?.();
        }
        done = true; fromTriangulation += 1;
      }
      loc.delete?.();
    } catch { done = false; }
    if (!done) {
      for (let i = lo; i <= hi; i++) {
        const [u, v] = face.uvCoordinates([V[i * 3], V[i * 3 + 1], V[i * 3 + 2]]);
        uv[i * 2] = u * su; uv[i * 2 + 1] = v * sv; ok[i] = 1;
      }
      projected += 1;
    }
    pnt.delete?.(); surface.delete?.();
  }
  return { uv, ok, faces: fromTriangulation + projected, fromTriangulation };
}

/**
 * The surface point of a face at (u, v) given in the scaled (mm) units of meshFaceUVs — the tests use it to check
 * that every vertex's UV maps back onto the vertex.
 */
export function pointAtScaledUV(face, su, sv, u, v) {
  const oc = getOC();
  const s = new oc.BRepAdaptor_Surface(face.wrapped, false); const p = new oc.gp_Pnt();
  s.D0(u / su, v / sv, p);
  const out = [p.X(), p.Y(), p.Z()];
  p.delete?.(); s.delete?.();
  return out;
}
