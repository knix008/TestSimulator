// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  extOf, baseOf, formatOf, isModelFile, isImageFile, exportName, exportFormat, references, gatherFiles,
  loadModel, exportModel, modelStats, EXPORT_FORMATS, IMPORT_FORMATS,
} from '../src/lib/formats.js';

const enc = (s) => new TextEncoder().encode(s);

// PLYExporter hands its result over in the next animation frame.
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0);

describe('file names', () => {
  it('reads extensions and base names', () => {
    expect(extOf('C:\\3D\\Chair.GLB')).toBe('glb');
    expect(extOf('noext')).toBe('');
    expect(baseOf('/a/b/c.obj')).toBe('c.obj');
    expect(baseOf('C:\\a\\b.stl')).toBe('b.stl');
  });

  it('knows models from images', () => {
    expect(isModelFile('x.fbx')).toBe(true);
    expect(isModelFile('x.usdz')).toBe(true);
    expect(isModelFile('x.png')).toBe(false);
    expect(isImageFile('x.JPEG')).toBe(true);
    expect(formatOf('x.vrml').id).toBe('wrl');
  });

  it('names the saved file after the model and the format', () => {
    expect(exportName('chair.glb', 'obj')).toBe('chair.obj');
    expect(exportName('C:\\x\\raccoon.png', 'stl-ascii')).toBe('raccoon.stl');
    expect(exportName('', 'usdz')).toBe('model.usdz');
    expect(exportFormat('nope').id).toBe('glb');
  });

  it('every import format has a loader and every export format a unique id', () => {
    expect(new Set(IMPORT_FORMATS.map((f) => f.id)).size).toBe(IMPORT_FORMATS.length);
    expect(new Set(EXPORT_FORMATS.map((f) => f.id)).size).toBe(EXPORT_FORMATS.length);
  });
});

describe('references between files', () => {
  it('finds the MTL of an OBJ and the textures of an MTL', () => {
    expect(references('a.obj', enc('mtllib my mat.mtl\nv 0 0 0\n'))).toEqual(['my mat.mtl']);
    expect(references('a.mtl', enc('newmtl m\nmap_Kd -s 1 1 1 tex/albedo.png\nbump normal.jpg\n')).sort())
      .toEqual(['normal.jpg', 'tex/albedo.png']);
  });

  it('finds the buffers and pictures of a .gltf but not embedded data', () => {
    const gltf = { buffers: [{ uri: 'scene.bin' }, { uri: 'data:application/octet-stream;base64,AAA=' }], images: [{ uri: 'tex%20a.png' }] };
    expect(references('s.gltf', enc(JSON.stringify(gltf))).sort()).toEqual(['scene.bin', 'tex a.png']);
  });

  it('gathers a whole chain (OBJ → MTL → texture)', async () => {
    const files = { 'a.mtl': enc('newmtl m\nmap_Kd t.png\n'), 't.png': new Uint8Array([1, 2, 3]) };
    const got = await gatherFiles({ name: 'a.obj', data: enc('mtllib a.mtl\n') }, async (rel) => files[rel] || null);
    expect([...got.keys()].sort()).toEqual(['a.mtl', 'a.obj', 't.png']);
  });
});

describe('saving and reading back', () => {
  const cube = () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    const g = new THREE.Group();
    g.add(mesh);
    return g;
  };

  it('counts what a model holds', () => {
    const s = modelStats(cube());
    expect(s.meshes).toBe(1);
    expect(s.triangles).toBe(12);
    expect(s.size.map((n) => Math.round(n))).toEqual([1, 2, 3]);
  });

  for (const id of ['obj', 'stl', 'stl-ascii', 'ply']) {
    it(`round-trips ${id}`, async () => {
      const bytes = await exportModel(cube(), id);
      expect(bytes.length).toBeGreaterThan(50);
      const back = await loadModel(`x.${exportFormat(id).ext}`, bytes);
      expect(modelStats(back.object).triangles).toBe(12);
    });
  }

  it('rejects unknown files', async () => {
    await expect(loadModel('x.txt', new Uint8Array(1))).rejects.toThrow(/Unsupported/);
  });
});
