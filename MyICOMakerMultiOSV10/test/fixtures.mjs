// Small files for the GUI tests: 3D models in several formats, a picture and a design.
// Written to a temporary folder by test/gui.mjs (dropped on the window, opened by path).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyDesign, serializeDesign } from '../src/lib/project.js';
import { createObject } from '../src/lib/iconCanvas.js';

/** A cube as OBJ (8 vertices, 6 quads). */
export const OBJ_CUBE = `# cube
v -1 -1 -1
v 1 -1 -1
v 1 1 -1
v -1 1 -1
v -1 -1 1
v 1 -1 1
v 1 1 1
v -1 1 1
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 4 8 7 3
f 1 5 8 4
f 2 3 7 6
`;

/** A tetrahedron as ASCII STL. */
export const STL_TETRA = `solid tetra
${[[[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [0, 0, 1], [1, 0, 0]], [[0, 0, 0], [0, 1, 0], [0, 0, 1]], [[1, 0, 0], [0, 0, 1], [0, 1, 0]]]
  .map((tri) => `facet normal 0 0 0\nouter loop\n${tri.map((v) => `vertex ${v.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}
endsolid tetra
`;

/** Two coloured triangles as ASCII PLY. */
export const PLY_QUAD = `ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
element face 2
property list uchar int vertex_indices
end_header
0 0 0 255 0 0
1 0 0 0 255 0
1 1 0 0 0 255
0 1 0 255 255 0
3 0 1 2
3 0 2 3
`;

/** One triangle as glTF 2.0 with its buffer embedded as a data URI. */
export function gltfTriangle() {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  return JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: positions.length, uri: `data:application/octet-stream;base64,${positions.toString('base64')}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  });
}

/** A 2 × 2 PNG. */
export const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8Dwn4GBgYGJAQoAAB/kAQGkYIzNAAAAAElFTkSuQmCC';

/** Writes every fixture into `dir`; returns their paths by kind. */
export function writeFixtures(dir) {
  const files = {
    obj: join(dir, 'cube.obj'),
    stl: join(dir, 'tetra.stl'),
    ply: join(dir, 'quad.ply'),
    gltf: join(dir, 'triangle.gltf'),
    png: join(dir, 'dot.png'),
    myico: join(dir, 'dropped.myico'),
    other: join(dir, 'notes.xyz'),
  };
  writeFileSync(files.obj, OBJ_CUBE);
  writeFileSync(files.stl, STL_TETRA);
  writeFileSync(files.ply, PLY_QUAD);
  writeFileSync(files.gltf, gltfTriangle());
  writeFileSync(files.png, Buffer.from(PNG_BASE64, 'base64'));
  const design = { ...emptyDesign(), objects: [{ ...createObject('heart', 0, 0), x: 100, y: 100, w: 300, h: 280 }, { ...createObject('star', 0, 0), x: 10, y: 10, w: 90, h: 90 }, { ...createObject('ring', 0, 0), x: 400, y: 400, w: 90, h: 90 }] };
  writeFileSync(files.myico, serializeDesign(design, 'dropped'));
  writeFileSync(files.other, 'not a picture');
  return files;
}
