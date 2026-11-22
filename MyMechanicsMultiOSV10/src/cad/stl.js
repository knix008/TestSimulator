// STL files: reading binary and ASCII STL into a mesh, and building a solid from it.
// The kernel's own reader (replicad importSTL) expects StlAPI_Reader to hand back a shell; with the
// OpenCASCADE build in use it returns another shape type and the import throws Standard_TypeMismatch,
// so the triangles are read here and joined by solidFromTriangles (part-more.js).
import { rep } from './kernel.js';
import { solidFromTriangles } from './part-more.js';

/** True when the bytes are a binary STL (80-byte header, count, 50 bytes per triangle). */
export function isBinaryStl(bytes) {
  if (bytes.length < 84) return false;
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  if (84 + count * 50 === bytes.length) return true;
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512))).trimStart();
  return !(head.startsWith('solid') && /facet/.test(head));
}

/**
 * The triangles of an STL file: { verts: [[x, y, z]], tris: [[a, b, c]] }, equal corners merged into one vertex
 * (rounded to `precision`), degenerate triangles dropped.
 */
export function parseStl(input, { precision = 1e-6 } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const verts = []; const tris = []; const index = new Map();
  const key = (p) => p.map((v) => Math.round(v / precision)).join(',');
  const vertex = (p) => { const k = key(p); let i = index.get(k); if (i == null) { i = verts.length; verts.push(p); index.set(k, i); } return i; };
  const tri = (a, b, c) => { const i = vertex(a); const j = vertex(b); const k = vertex(c); if (i !== j && j !== k && k !== i) tris.push([i, j, k]); };
  if (isBinaryStl(bytes)) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = dv.getUint32(80, true);
    for (let t = 0; t < count; t++) {
      const o = 84 + t * 50 + 12;
      if (o + 36 > bytes.length) break;
      const p = (k) => [dv.getFloat32(o + k * 12, true), dv.getFloat32(o + k * 12 + 4, true), dv.getFloat32(o + k * 12 + 8, true)];
      tri(p(0), p(1), p(2));
    }
  } else {
    const text = new TextDecoder().decode(bytes);
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    const pts = [];
    for (let m; (m = re.exec(text));) pts.push([Number(m[1]), Number(m[2]), Number(m[3])]);
    for (let i = 0; i + 2 < pts.length; i += 3) tri(pts[i], pts[i + 1], pts[i + 2]);
  }
  return { verts, tris };
}

/** A solid from STL bytes (binary or ASCII); coplanar triangles merged into faces when the kernel can. */
export function importStlSolid(input) {
  const { verts, tris } = parseStl(input);
  return solidFromMesh(verts, tris);
}

/** Equal corners (rounded to `precision`) merged into one vertex, degenerate triangles dropped. */
export function weldMeshObject(verts, tris, precision = 1e-6) {
  const out = []; const index = new Map(); const map = new Array(verts.length);
  verts.forEach((p, i) => { const k = p.map((v) => Math.round(v / precision)).join(','); let j = index.get(k); if (j == null) { j = out.length; out.push(p); index.set(k, j); } map[i] = j; });
  const t2 = [];
  for (const [a, b, c] of tris) { const i = map[a]; const j = map[b]; const k = map[c]; if (i !== j && j !== k && k !== i) t2.push([i, j, k]); }
  return { verts: out, tris: t2 };
}

/** A solid from a closed triangle mesh (verts [[x, y, z]], tris [[a, b, c]]); coplanar triangles merged into faces. */
export function solidFromMesh(verts, tris) {
  if (tris.length < 4) throw Object.assign(new Error('the mesh is not closed'), { code: 'bad-file' });
  const R = rep(); const oc = R.getOC();
  const solid = solidFromTriangles(verts, tris);
  try {
    const up = new oc.ShapeUpgrade_UnifySameDomain(solid.wrapped, true, true, false);
    up.Build();
    const merged = R.cast(up.Shape());
    up.delete();
    if (Math.abs(R.measureVolume(merged) - R.measureVolume(solid)) <= 1e-6 * Math.max(1, Math.abs(R.measureVolume(solid)))) return merged;
  } catch { /* keep the triangles */ }
  return solid;
}
