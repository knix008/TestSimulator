// Mesh formats (src/cad/mesh-formats.js, mesh-import.js): every writer's file read back by its reader gives the same
// triangles (enclosed volume, box) in millimetres and Z up — whatever the format's own units and up axis — and an
// import builds the same closed solid. Hand-written files from other programs check the readers' handling of
// transforms, units, polygons and ASCII / big-endian data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { writeObj, writePly, writeGltf, writeGlb, writeVrml, write3mf, writeUsdz, readMeshFile, readObj, readPly, readGltf, readVrml, read3mf } from '../../src/cad/mesh-formats.js';
import { importMeshSolids } from '../../src/cad/mesh-import.js';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';

await loadKernel();
const R = rep();
const near = (a, b, rel, what) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b) + 1e-9, `${what}: ${a} vs ${b}`);

/** Enclosed volume (divergence theorem) and box of mesh objects. */
function stats(objects) {
  let vol = 0; const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    for (const p of o.verts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    for (const [a, b, c] of o.tris) { const p = o.verts[a]; const q = o.verts[b]; const r = o.verts[c]; vol += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }
  }
  return { vol, lo, hi };
}
// Two bodies: a block with a bore (offset, so the axes show) and a cylinder, as the app tessellates them.
const block = R.makeBox([10, 20, 0], [70, 60, 25]).cut(R.makeCylinder(8, 40, [40, 40, -5], [0, 0, 1]));
const peg = R.makeCylinder(6, 30, [100, 0, 5], [0, 0, 1]);
const item = (shape, name, color) => { const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.2 }); return { name, color, vertices: Float32Array.from(m.vertices), triangles: Uint32Array.from(m.triangles) }; };
const items = [item(block, 'Block', [0.8, 0.2, 0.1]), item(peg, 'Peg', [0.1, 0.4, 0.9])];
const want = stats(items.map((it) => ({ verts: Array.from({ length: it.vertices.length / 3 }, (_, i) => [it.vertices[3 * i], it.vertices[3 * i + 1], it.vertices[3 * i + 2]]), tris: Array.from({ length: it.triangles.length / 3 }, (_, i) => [it.triangles[3 * i], it.triangles[3 * i + 1], it.triangles[3 * i + 2]]) })));

const FORMATS = [
  ['obj', writeObj], ['ply', writePly], ['gltf', writeGltf], ['glb', writeGlb], ['wrl', writeVrml], ['3mf', write3mf],
];
for (const [ext, write] of FORMATS) {
  test(`${ext}: written and read back — two objects, same volume and box in mm, Z up`, () => {
    const objects = readMeshFile(`model.${ext}`, write(items));
    assert.equal(objects.length, 2, 'two objects');
    const got = stats(objects);
    near(got.vol, want.vol, 1e-5, 'enclosed volume');
    for (let k = 0; k < 3; k++) { near(got.lo[k], want.lo[k], 1e-5, `min ${'xyz'[k]}`); near(got.hi[k], want.hi[k], 1e-5, `max ${'xyz'[k]}`); }
  });
}

test('imported mesh files become closed solids with the bodies’ volumes', () => {
  for (const [ext, write] of FORMATS) {
    const got = importMeshSolids(`model.${ext}`, write(items));
    assert.equal(got.solids, 2, `${ext}: two solids`);
    near(R.measureVolume(got.shape), want.vol, 1e-5, `${ext}: solid volume`);
  }
});

test('formats keep their own conventions: glTF and VRML in metres with Y up, 3MF in mm with materials, USDZ aligned', () => {
  const g = JSON.parse(writeGltf(items));
  const acc = g.accessors.find((a) => a.type === 'VEC3');
  assert.ok(Math.max(...acc.max.map(Math.abs)) < 1, 'glTF positions in metres');
  near(acc.max[1], 25 / 1000, 1e-6, 'the block’s top (z 25 mm) is glTF +Y 0.025 m');
  assert.match(writeVrml(items), /^#VRML V2\.0 utf8/);
  const z = unzipSync(write3mf(items));
  const model = strFromU8(z['3D/3dmodel.model']);
  assert.match(model, /unit="millimeter"/);
  assert.match(model, /displaycolor="#cc331a"/i, 'the block’s colour as a base material');
  assert.ok(z['[Content_Types].xml'] && z['_rels/.rels'], 'OPC parts');
  // USDZ: every file's data starts on a 64-byte boundary.
  const u = writeUsdz(items); const v = new DataView(u.buffer, u.byteOffset);
  const nameLen = v.getUint16(26, true); const extra = v.getUint16(28, true);
  assert.equal((30 + nameLen + extra) % 64, 0, 'USDZ data aligned to 64 bytes');
  const usda = strFromU8(unzipSync(u)['model.usda']);
  assert.match(usda, /upAxis = "Z"/); assert.match(usda, /metersPerUnit = 0\.001/); assert.match(usda, /def Mesh "Block"/);
});

test('files from other programs: OBJ polygons and negative indices, PLY ASCII, glTF node transforms, VRML transforms, 3MF inch units and build transforms', () => {
  // A unit cube as quads with negative (relative) indices.
  const obj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf -8 -5 -6 -7\nf -4 -3 -2 -1\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n';
  const o = readObj(obj);
  assert.equal(o[0].tris.length, 12, 'six quads fanned into twelve triangles');
  near(Math.abs(stats(o).vol), 1, 1e-9, 'unit cube');
  // PLY ASCII, a tetrahedron.
  const ply = 'ply\nformat ascii 1.0\nelement vertex 4\nproperty double x\nproperty double y\nproperty double z\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n6 0 0\n0 6 0\n0 0 6\n3 0 2 1\n3 0 1 3\n3 0 3 2\n3 1 2 3\n';
  near(stats(readPly(new TextEncoder().encode(ply))).vol, 36, 1e-9, 'tetrahedron 6³/6');
  // glTF: a node scaled 2× and moved 0.1 m along +Y (= +Z in the app).
  const pos = new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0, 0, 0, 0.01]); const idx = new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  const buf = new Uint8Array(48 + 24); buf.set(new Uint8Array(pos.buffer), 0); buf.set(new Uint8Array(idx.buffer), 48);
  let s = ''; for (const c of buf) s += String.fromCharCode(c);
  const gl = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ children: [1], translation: [0, 0.1, 0] }, { mesh: 0, scale: [2, 2, 2] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], buffers: [{ byteLength: buf.length, uri: `data:application/octet-stream;base64,${btoa(s)}` }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 48 }, { buffer: 0, byteOffset: 48, byteLength: 24 }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }] };
  const gs = stats(readGltf(JSON.stringify(gl)));
  near(Math.abs(gs.vol), 20 ** 3 / 6, 1e-6, 'scaled tetrahedron (20 mm legs)');
  near(gs.lo[2], 100, 1e-6, 'moved 0.1 m up (glTF +Y) = 100 mm along the app’s Z');
  // VRML: a Transform rotating a tetrahedron 90° about X and moving it.
  const wrl = '#VRML V2.0 utf8\nTransform { translation 0 0.05 0 rotation 1 0 0 1.5707963267948966 children [ Shape { geometry IndexedFaceSet { coord Coordinate { point [ 0 0 0, 0.01 0 0, 0 0.01 0, 0 0 0.01 ] } coordIndex [ 0 2 1 -1, 0 1 3 -1, 0 3 2 -1, 1 2 3 -1 ] } } ] }\n';
  const vs = stats(readVrml(wrl));
  near(Math.abs(vs.vol), 10 ** 3 / 6, 1e-6, 'VRML tetrahedron');
  near(vs.lo[2], 40, 1e-6, 'turned 90° about X (VRML y ∈ [−0.01, 0]) and 0.05 m up: 40 mm along Z');
  near(vs.hi[2], 50, 1e-6, 'its top at 50 mm');
  // 3MF in inches with a build transform moving it 1 in along x.
  const model = '<?xml version="1.0"?><model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 1 0 0"/></build></model>';
  const zip = { '3D/3dmodel.model': new TextEncoder().encode(model) };
  const bytes = (async () => 0, null);
  void bytes;
  const fflateZip = import('three/examples/jsm/libs/fflate.module.js');
  return fflateZip.then(({ zipSync }) => {
    const ms = stats(read3mf(zipSync(zip)));
    near(Math.abs(ms.vol), 25.4 ** 3 / 6, 1e-6, 'inch tetrahedron in mm³');
    near(ms.lo[0], 25.4, 1e-6, 'moved 1 in along x');
  });
});

test('broken files are refused with bad-file', () => {
  assert.throws(() => readMeshFile('x.wrl', 'not vrml'), (e) => e.code === 'bad-file');
  assert.throws(() => importMeshSolids('x.obj', 'v 0 0 0\n'), (e) => e.code === 'bad-file');
  assert.throws(() => readMeshFile('x.abc', ''), (e) => e.code === 'bad-file');
});
