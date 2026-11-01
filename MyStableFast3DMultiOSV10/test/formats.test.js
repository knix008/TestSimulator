// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { JSDOM } from 'jsdom';

// The XML formats (3MF, AMF, COLLADA) are read with the browser's DOMParser.
globalThis.DOMParser ??= new JSDOM().window.DOMParser;
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

  for (const id of ['obj', 'stl', 'stl-ascii', 'ply', 'ply-ascii', '3mf', 'amf', 'dae', 'wrl', 'vtk']) {
    it(`round-trips ${id}`, async () => {
      const bytes = await exportModel(cube(), id);
      expect(bytes.length).toBeGreaterThan(50);
      const back = await loadModel(`x.${exportFormat(id).ext}`, bytes);
      const s = modelStats(back.object);
      expect(s.triangles).toBe(12);
      // Same size as saved: no unit conversion on the way back in.
      expect(s.size.map((n) => Math.round(n))).toEqual([1, 2, 3]);
    });
  }

  for (const id of ['pcd', 'xyz']) {
    it(`round-trips ${id} as points`, async () => {
      const bytes = await exportModel(cube(), id);
      const back = await loadModel(`x.${exportFormat(id).ext}`, bytes);
      expect(modelStats(back.object).points).toBe(cube().children[0].geometry.getAttribute('position').count);
    });
  }

  it('keeps colours in 3MF: the material, and per vertex when there are some', async () => {
    const back = await loadModel('x.3mf', await exportModel(cube(), '3mf'));
    let color = null;
    back.object.traverse((o) => { if (o.isMesh && !color) color = [].concat(o.material)[0].color; });
    expect(color.getHexString()).toBe('ff0000');

    const painted = cube();
    const geo = painted.children[0].geometry;
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill([0, 0, 1]).flat(), 3));
    // jsdom's selectors miss the prefixed <m:colorgroup> that browsers find
    // (the smoke test reads it back there), so look at the file itself.
    const { unzipSync, strFromU8 } = await import('three/examples/jsm/libs/fflate.module.js');
    const files = unzipSync(await exportModel(painted, '3mf'));
    const xml = strFromU8(files['3D/3dmodel.model']);
    expect(xml).toMatch(/<m:colorgroup id="2"><m:color color="#0000FF"\/>/);
    expect(xml).toMatch(/<triangle v1="\d+" v2="\d+" v3="\d+" pid="2" p1=/);
  });

  it('writes the unit it is told', async () => {
    const dae = new TextDecoder().decode(await exportModel(cube(), 'dae', { units: 'mm' }));
    expect(dae).toMatch(/<unit name="millimeter" meter="0.001"\/>/);
    const amf = new TextDecoder().decode(await exportModel(cube(), 'amf', { units: 'in' }));
    expect(amf).toMatch(/<amf unit="inch"/);
  });

  it('rejects unknown files', async () => {
    await expect(loadModel('x.txt', new Uint8Array(1))).rejects.toThrow(/Unsupported/);
  });
});
