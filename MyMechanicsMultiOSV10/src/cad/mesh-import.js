// Mesh files as solids: every object of an OBJ, PLY, glTF / GLB, VRML or 3MF file (mesh-formats.js) welded and
// built into a closed solid like an STL import (stl.js solidFromMesh); several objects come in as a compound.
import { rep } from './kernel.js';
import { readMeshFile } from './mesh-formats.js';
import { solidFromMesh, weldMeshObject } from './stl.js';

/**
 * The solid(s) of a mesh file: { shape (one solid, or a compound of them), solids (how many), skipped (names of
 * objects that were not closed meshes) }. Throws { code: 'bad-file' } when nothing closed is in it.
 */
export function importMeshSolids(name, data) {
  const R = rep();
  const solids = []; const skipped = [];
  for (const o of readMeshFile(name, data)) {
    const { verts, tris } = weldMeshObject(o.verts, o.tris, 1e-5);
    try { solids.push(solidFromMesh(verts, tris)); } catch { skipped.push(o.name); }
  }
  if (!solids.length) throw Object.assign(new Error('the file holds no closed mesh'), { code: 'bad-file' });
  return { shape: solids.length === 1 ? solids[0] : R.makeCompound(solids), solids: solids.length, skipped };
}
