// npm run verify:formats — runs the readers over real files written by other programs (Blender 2.48 to 5.x, Maya, 3ds Max…).
// The files are public test assets of two open-source projects. They are downloaded into a cache outside the sources and are
// not part of `npm test`, which must pass offline.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importBlend, blendVersion } from '../src/core/blendfile.js';
import { importDAE, importFBX } from '../src/core/formats.js';
import { faceArea, signedVolume } from '../src/core/mesh.js';

const ASSIMP = 'https://raw.githubusercontent.com/assimp/assimp/master/test/models/';
const GLTF_IO = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Blender-IO/main/tests/scenes/';
// Each entry: file, how many mesh objects it holds, and a check on the first of them.
const cube = (o) => Math.abs(signedVolume(o.mesh) - 8) < 1e-3 && Math.abs(o.mesh.faces.reduce((s, f) => s + faceArea(o.mesh, f), 0) - 24) < 1e-3;
const FILES = [
  { url: `${ASSIMP}BLEND/BlenderDefault_248.blend`, count: 1, version: 248, first: cube },
  { url: `${ASSIMP}BLEND/BlenderDefault_250.blend`, count: 1, version: 252, first: cube },
  { url: `${ASSIMP}BLEND/BlenderDefault_276.blend`, count: 1, version: 276, first: cube },
  { url: `${GLTF_IO}19_sheen/19_sheen.blend`, alt: `${GLTF_IO}19_sheen.blend`, count: 7, version: 303, first: (o) => o.mesh.verts.length === 482 && Boolean(o.mesh.uvs) },
  { url: `${GLTF_IO}24_vertex_colors.blend`, count: 17, version: 405, first: cube },
  { url: `${GLTF_IO}22_node_groups.blend`, count: 6, version: 502, first: cube },
  { url: `${ASSIMP}FBX/box.fbx`, count: 1, first: (o) => o.mesh.faces.length === 12 && Boolean(o.mesh.uvs) },
  { url: `${ASSIMP}FBX/spider.fbx`, count: 19, first: (o) => o.mesh.faces.flat().every((i) => i >= 0 && i < o.mesh.verts.length) },
  { url: `${ASSIMP}FBX/huesitos.fbx`, count: 1, first: (o) => o.mesh.faces.length === 68 },
  { url: `${ASSIMP}Collada/duck.dae`, count: 1, first: (o) => o.mesh.faces.length === 2144 && Boolean(o.mesh.uvs) },
  { url: `${ASSIMP}Collada/cube_triangulate.dae`, count: 1, first: (o) => Math.abs(signedVolume(o.mesh) - 1) < 1e-3 },
];

const cache = path.join(os.tmpdir(), 'my3dblender-format-corpus');
fs.mkdirSync(cache, { recursive: true });

async function fetchFile(entry) {
  const name = entry.url.split('/').pop();
  const target = path.join(cache, name);
  if (fs.existsSync(target)) return new Uint8Array(fs.readFileSync(target));
  for (const url of [entry.url, entry.alt].filter(Boolean)) {
    const response = await fetch(url);
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      fs.writeFileSync(target, bytes);
      return bytes;
    }
  }
  return null;
}

let failed = 0;
let missing = 0;
for (const entry of FILES) {
  const name = entry.url.split('/').pop();
  let bytes;
  try { bytes = await fetchFile(entry); } catch (error) { bytes = null; console.log(`  no download  ${name}: ${error.message}`); }
  if (!bytes) { missing++; console.log(`  missing      ${name}`); continue; }
  try {
    const ext = name.split('.').pop();
    const list = ext === 'blend' ? importBlend(bytes) : ext === 'fbx' ? importFBX(bytes) : importDAE(new TextDecoder().decode(bytes));
    const problems = [];
    if (list.length !== entry.count) problems.push(`${list.length} objects, expected ${entry.count}`);
    if (entry.version && blendVersion(bytes) !== entry.version) problems.push(`version ${blendVersion(bytes)}`);
    if (!entry.first(list[0])) problems.push('the first object is not what it should be');
    for (const o of list) if (o.mesh.faces.flat().some((i) => !(i >= 0 && i < o.mesh.verts.length))) problems.push(`${o.name}: a face points at a missing vertex`);
    if (problems.length) { failed++; console.log(`  FAIL         ${name}: ${problems.join('; ')}`); } else console.log(`  ok           ${name}${entry.version ? ` (Blender ${entry.version})` : ''}: ${list.length} objects, ${list.reduce((s, o) => s + o.mesh.faces.length, 0)} faces`);
  } catch (error) {
    failed++;
    console.log(`  FAIL         ${name}: ${error.message}`);
  }
}
console.log(`\n${FILES.length - failed - missing} ok, ${failed} failed, ${missing} not downloaded (cache: ${cache})`);
process.exit(failed || missing ? 1 : 0);
