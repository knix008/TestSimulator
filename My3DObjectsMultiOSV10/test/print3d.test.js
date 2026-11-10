// @vitest-environment node
// Saving for a 3D printer (src/lib/print3d.js): millimetres, Z up, on the
// bed, welded, holes closed, consistent outward winding, and the 3MF / STL
// files a slicer reads.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import {
  normalizePrintOptions, mergeMeshes, weld, analyze, orientConsistently, signedVolume, boundaryLoops, fillHoles,
  placeOnBed, preparePrint, writeBinarySTL, writePrint, printFileName, canvasTextureSampler, bounds,
  PRINT_DEFAULTS, PRINT_SIZE_MAX, PLA_DENSITY,
} from '../src/lib/print3d.js';
import { collectMeshes } from '../src/lib/exporters.js';

// A cube from 0 to `s` (Y up) as six separate quads — every corner three
// times, as a textured mesh has its vertices split along UV seams.
function splitCube(s = 1, { drop = -1, flip = -1, inside = false } = {}) {
  const quads = [
    [[0, 0, 0], [0, s, 0], [s, s, 0], [s, 0, 0]], // back (z = 0), facing −Z
    [[0, 0, s], [s, 0, s], [s, s, s], [0, s, s]], // front (z = s), facing +Z
    [[0, 0, 0], [s, 0, 0], [s, 0, s], [0, 0, s]], // bottom, facing −Y
    [[0, s, 0], [0, s, s], [s, s, s], [s, s, 0]], // top, facing +Y
    [[0, 0, 0], [0, 0, s], [0, s, s], [0, s, 0]], // left, facing −X
    [[s, 0, 0], [s, s, 0], [s, s, s], [s, 0, s]], // right, facing +X
  ];
  const positions = [];
  const faces = [];
  quads.forEach((q, k) => {
    if (k === drop) return;
    const base = positions.length / 3;
    for (const p of q) positions.push(...p);
    const tris = [[0, 1, 2], [0, 2, 3]];
    tris.forEach((t, j) => {
      let tri = t.map((i) => base + i);
      if (inside || (k === flip && j === 0)) tri = [tri[0], tri[2], tri[1]];
      faces.push(...tri);
    });
  });
  return { name: 'cube', positions: Float32Array.from(positions), faces: Uint32Array.from(faces), colors: null, color: [1, 0.5, 0.25], points: false };
}

describe('options', () => {
  it('clamps and fills in', () => {
    expect(normalizePrintOptions({})).toEqual(PRINT_DEFAULTS);
    const o = normalizePrintOptions({ size: 99999, sizeAxis: 'diagonal', format: 'obj', fillHoles: 0, colors: false });
    expect(o.size).toBe(PRINT_SIZE_MAX);
    expect(o.sizeAxis).toBe('height');
    expect(o.format).toBe('3mf');
    expect(o.fillHoles).toBe(false);
    expect(normalizePrintOptions({ size: 'abc' }).size).toBe(PRINT_DEFAULTS.size);
    expect(normalizePrintOptions({ size: -5 }).size).toBe(1);
  });

  it('names the file after the model', () => {
    expect(printFileName('robot.glb', '3mf')).toBe('robot-print.3mf');
    expect(printFileName('C:\\a\\mug.png', 'stl')).toBe('C:\\a\\mug-print.stl');
    expect(printFileName('', 'stl')).toBe('model-print.stl');
  });
});

describe('welding and topology', () => {
  it('joins the corners split along seams into a closed cube', () => {
    const merged = mergeMeshes([splitCube()]);
    expect(merged.positions.length / 3).toBe(24);
    expect(analyze(merged).watertight).toBe(false); // seams are open edges
    const w = weld(merged, 1e-6);
    expect(w.positions.length / 3).toBe(8);
    expect(w.stats.welded).toBe(16);
    const a = analyze(w);
    expect(a).toMatchObject({ triangles: 12, vertices: 8, edges: 18, boundaryEdges: 0, nonManifoldEdges: 0, watertight: true });
    expect(signedVolume(w)).toBeCloseTo(1, 6);
  });

  it('drops degenerate and repeated triangles', () => {
    const m = splitCube();
    const faces = [...m.faces, ...m.faces.slice(0, 3), 0, 0, 1];
    const w = weld({ ...mergeMeshes([m]), faces: Uint32Array.from(faces) }, 1e-6);
    expect(w.stats.duplicate).toBe(1);
    expect(w.stats.degenerate).toBe(1);
    expect(w.faces.length / 3).toBe(12);
  });

  it('averages colours of joined vertices and keeps one colour per mesh otherwise', () => {
    const a = splitCube();
    const b = { ...splitCube(), positions: splitCube().positions.map((v) => v + 2), color: [0, 0, 1] };
    expect(mergeMeshes([a]).colors).toBeNull(); // one plain colour: nothing to write per vertex
    const merged = mergeMeshes([a, b]);
    expect(merged.colors).not.toBeNull();
    const w = weld(merged, 1e-6);
    expect(w.positions.length / 3).toBe(16);
    expect(Array.from(w.colors.slice(0, 3))).toEqual([1, 0.5, 0.25]);
    expect(Array.from(w.colors.slice(-3))).toEqual([0, 0, 1]);
  });

  it('finds the rim of a missing face and closes it', () => {
    const w = weld(mergeMeshes([splitCube(1, { drop: 3 })]), 1e-6);
    const a = analyze(w);
    expect(a.boundaryEdges).toBe(4);
    expect(a.watertight).toBe(false);
    const loops = boundaryLoops(w);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    const r = fillHoles(w);
    expect(r.filled).toBe(1);
    expect(r.added).toBe(4);
    expect(analyze(r.mesh).watertight).toBe(true);
    expect(signedVolume(r.mesh)).toBeCloseTo(1, 6); // the patch faces out too
  });

  it('turns a triangle wound against its neighbours', () => {
    const w = weld(mergeMeshes([splitCube(1, { flip: 4 })]), 1e-6);
    expect(analyze(w).misorientedEdges).toBeGreaterThan(0);
    expect(orientConsistently(w)).toBe(1);
    expect(analyze(w).watertight).toBe(true);
  });
});

describe('placing on the bed', () => {
  it('turns Y up into Z up with the front towards −Y', () => {
    // A point in front (+Z in glTF) and one on top (+Y).
    const { positions } = placeOnBed(Float64Array.from([0, 0, 0, 0, 0, 1, 0, 1, 0]), { size: 1, sizeAxis: 'height' });
    const p = (i) => Array.from(positions.slice(i * 3, i * 3 + 3)).map((v) => Math.round(v * 1000) / 1000 + 0);
    expect(p(1)[1]).toBeLessThan(p(0)[1]); // the front point moved to −Y
    expect(p(2)[2]).toBe(1);               // the top point is the highest
    expect(p(0)[2]).toBe(0);               // standing on Z = 0
  });

  it('scales the height or the longest side to the size asked', () => {
    // 2 wide (X), 1 tall (Y), 0.5 deep (Z).
    const box = Float64Array.from([0, 0, 0, 2, 1, 0.5]);
    const h = placeOnBed(box, { size: 100, sizeAxis: 'height' });
    expect(bounds(h.positions).size.map((v) => +v.toFixed(6))).toEqual([200, 50, 100]);
    const l = placeOnBed(box, { size: 100, sizeAxis: 'longest' });
    expect(bounds(l.positions).size.map((v) => +v.toFixed(6))).toEqual([100, 25, 50]);
    const b = bounds(l.positions);
    expect(b.min[0]).toBeCloseTo(-50);   // centred on X
    expect(b.min[1]).toBeCloseTo(-12.5); // and Y
    expect(b.min[2]).toBe(0);
  });
});

describe('preparePrint', () => {
  it('makes a split cube a watertight 20 mm cube on the bed', () => {
    const r = preparePrint([splitCube(0.37)], { size: 20 });
    expect(r.report.watertight).toBe(true);
    expect(r.report.size.map((v) => +v.toFixed(6))).toEqual([20, 20, 20]);
    expect(r.report.volume).toBeCloseTo(8000, 3);
    expect(r.report.grams).toBeCloseTo(8 * PLA_DENSITY, 6);
    expect(r.report.welded).toBe(16);
    expect(r.report.holesFilled).toBe(0);
    expect(r.report.inverted).toBe(false);
    expect(bounds(r.mesh.positions).min[2]).toBe(0);
    expect(signedVolume(r.mesh)).toBeGreaterThan(0);
  });

  it('closes a hole unless told not to', () => {
    const open = preparePrint([splitCube(1, { drop: 1 })], { fillHoles: false });
    expect(open.report.watertight).toBe(false);
    expect(open.report.boundaryEdges).toBe(4);
    expect(open.report.grams).toBeNull();
    const closed = preparePrint([splitCube(1, { drop: 1 })], { fillHoles: true });
    expect(closed.report.holesFilled).toBe(1);
    expect(closed.report.watertight).toBe(true);
  });

  it('turns an inside-out model the right way', () => {
    const r = preparePrint([splitCube(1, { inside: true })], {});
    expect(r.report.inverted).toBe(true);
    expect(signedVolume(r.mesh)).toBeGreaterThan(0);
  });

  it('keeps colours for 3MF only', () => {
    const a = splitCube();
    const b = { ...splitCube(), positions: splitCube().positions.map((v) => v + 2), color: [0, 0, 1] };
    expect(preparePrint([a, b], { format: '3mf', colors: true }).mesh.colors).not.toBeNull();
    expect(preparePrint([a, b], { format: '3mf', colors: false }).mesh.colors).toBeNull();
    expect(preparePrint([a, b], { format: 'stl', colors: true }).mesh.colors).toBeNull();
    expect(preparePrint([a, b], { format: 'stl' }).report.colors).toBe(true); // available, for the dialog
  });

  it('refuses a model without triangles', () => {
    expect(() => preparePrint([{ positions: new Float32Array(9), faces: null, points: true }])).toThrow(/no triangles/);
  });
});

describe('files', () => {
  it('writes binary STL with outward normals', () => {
    const r = preparePrint([splitCube()], { size: 10, format: 'stl' });
    const bytes = writePrint(r, 'cube');
    expect(bytes.length).toBe(84 + 12 * 50);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(80, true)).toBe(12);
    expect(new TextDecoder().decode(bytes.slice(0, 11))).toBe('My3DObjects');
    // Every normal points away from the cube's centre (0, 0, 5).
    for (let i = 0; i < 12; i++) {
      const o = 84 + i * 50;
      const n = [0, 1, 2].map((k) => view.getFloat32(o + k * 4, true));
      const c = [0, 1, 2].map((k) => (view.getFloat32(o + 12 + k * 4, true) + view.getFloat32(o + 24 + k * 4, true) + view.getFloat32(o + 36 + k * 4, true)) / 3);
      const out = [c[0] - 0, c[1] - 0, c[2] - 5];
      expect(n[0] * out[0] + n[1] * out[1] + n[2] * out[2]).toBeGreaterThan(0);
    }
  });

  it('writes 3MF in millimetres with colours', () => {
    const a = splitCube();
    const b = { ...splitCube(), positions: splitCube().positions.map((v) => v + 2), color: [0, 0, 1] };
    const r = preparePrint([a, b], { size: 50, format: '3mf' });
    const zip = unzipSync(writePrint(r, 'pair'));
    const xml = strFromU8(zip['3D/3dmodel.model']);
    expect(xml).toContain('unit="millimeter"');
    expect(xml).toContain('<m:colorgroup');
    expect((xml.match(/<vertex /g) || []).length).toBe(16);
    expect((xml.match(/<triangle /g) || []).length).toBe(24);
    expect(xml).toContain('name="pair"');
    const plain = strFromU8(unzipSync(writePrint(preparePrint([a], { format: '3mf' }), 'one'))['3D/3dmodel.model']);
    expect(plain).not.toContain('colorgroup');
  });

  it('writes a three.js scene as shown (its transform included)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    mesh.scale.set(2, 2, 2);
    const root = new THREE.Group();
    root.add(mesh);
    const r = preparePrint(collectMeshes(root), { size: 80, sizeAxis: 'height' });
    expect(r.report.watertight).toBe(true);
    // 2 × 4 × 2 (Y up) → 40 × 40 × 80 mm (Z up).
    expect(r.report.size.map((v) => +v.toFixed(4))).toEqual([40, 40, 80]);
  });
});

describe('texture colours', () => {
  // A 2 × 2 texture: red, green on the first row; blue, white on the second.
  const fakeDoc = () => ({
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        putImageData() {},
        getImageData: () => ({ data: Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]) }),
      }),
    }),
  });

  it('reads the texel under each vertex, minding flipY', () => {
    const sample = canvasTextureSampler(fakeDoc());
    const gltf = { image: { width: 2, height: 2 }, flipY: false }; // glTF: v = 0 is the top row
    const uvs = Float32Array.from([0.25, 0.25, 0.75, 0.25, 0.25, 0.75, 0.75, 0.75]);
    expect(Array.from(sample(gltf, uvs))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]);
    const flipped = { image: { width: 2, height: 2 }, flipY: true }; // v = 0 is the bottom row
    expect(Array.from(sample(flipped, uvs).slice(0, 3))).toEqual([0, 0, 1]);
    expect(sample({ image: null }, uvs)).toBeNull();
  });

  it('collectMeshes turns a texture into vertex colours when asked', () => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const tex = new THREE.Texture();
    tex.flipY = false;
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex }));
    const root = new THREE.Group();
    root.add(mesh);
    expect(collectMeshes(root)[0].colors).toBeNull();
    const seen = [];
    const out = collectMeshes(root, {
      sampleTexture: (t, uvs) => { seen.push(t); return new Float32Array((uvs.length / 2) * 3).fill(0.5); },
    });
    expect(seen[0]).toBe(tex);
    expect(out[0].colors).toHaveLength(4 * 3);
    expect(out[0].colors[0]).toBeCloseTo(0.5);
  });
});
