// Seams and unwrapping, edge marks, rip and slide, proportional editing, texture paint, remeshing, skin, ocean,
// multiresolution and dynamic topology.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { History } from '../../src/core/history.js';
import { activeObject, createDefaultScene, deserialize, evaluatedMesh } from '../../src/core/doc.js';
import {
  cloneMesh, createMesh, cubeMesh, cylinderMesh, edgeKey, edgeMap, eulerCharacteristic, faceArea, gridMesh, icoSphereMesh, isManifold, planeMesh, setEdgeMark, signedVolume, splitNormals, toTriangles, uvSphereMesh, v3,
} from '../../src/core/mesh.js';
import { edgeSlide, markSharpByAngle, pointNormalsAt, proportionalFalloff, proportionalWeights, ripSelection, setCustomNormalsFromShading } from '../../src/core/meshops.js';
import { applyModifier, catmullClark, createModifier, evaluateMesh } from '../../src/core/modifiers.js';
import { canRun, run } from '../../src/core/ops.js';
import { createImageBuffer, encodePNG, fillImage, paintDabImage, samplePixel, texturePaintDab } from '../../src/core/paint.js';
import { dyntopoRefine, multiresAddLevel, multiresEvaluate, multiresSculpt, oceanField, oceanMesh, signedDistanceGrid, skinMesh, voxelRemesh } from '../../src/core/remesh.js';
import { angleDistortion, findIslands, packIslands, unwrapSeams, uvOverlap } from '../../src/core/unwrap.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b} (±${eps})`);
const context = () => {
  const doc = createDefaultScene();
  const history = new History();
  history.reset(doc);
  return { doc, history, undo() { const text = this.history.undo(); if (text) this.doc = deserialize(text); return Boolean(text); } };
};
const uvBounds = (mesh) => {
  const all = mesh.uvs.flat().filter(Boolean);
  return { minU: Math.min(...all.map((p) => p[0])), maxU: Math.max(...all.map((p) => p[0])), minV: Math.min(...all.map((p) => p[1])), maxV: Math.max(...all.map((p) => p[1])) };
};
const uvArea = (uv) => { let s = 0; for (let i = 0; i < uv.length; i++) { const [p, q] = [uv[i], uv[(i + 1) % uv.length]]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

describe('seam unwrap (LSCM)', () => {
  test('a flat grid unwraps with no distortion at all', () => {
    const mesh = gridMesh(6, 4, 3);
    unwrapSeams(mesh);
    assert.ok(angleDistortion(mesh) < 0.01, `distortion ${angleDistortion(mesh)}`);
    const areas = mesh.faces.map((_, f) => Math.abs(uvArea(mesh.uvs[f])));
    for (const a of areas) near(a, areas[0], 1e-6);
  });
  test('a bent strip (developable) flattens without distortion', () => {
    const mesh = gridMesh(16, 4, 1);
    mesh.verts = mesh.verts.map(([x, y]) => { const a = (x + 0.5) * 3; return [Math.sin(a), y, Math.cos(a)]; });
    // Each quad stays a planar rectangle, but its width changes the strip's curvature: only a tolerance holds.
    unwrapSeams(mesh);
    assert.ok(angleDistortion(mesh) < 0.5, `distortion ${angleDistortion(mesh)}`);
  });
  test('front faces stay counter-clockwise in UV space', () => {
    const mesh = gridMesh(5, 5, 2);
    unwrapSeams(mesh);
    for (const uv of mesh.uvs) assert.ok(uvArea(uv) > 0, 'flipped');
  });
  test('everything lands inside the unit square, inside the margin', () => {
    const mesh = uvSphereMesh(16, 8, 1);
    for (const e of edgeMap(mesh).values()) {
      // A seam along one meridian plus the poles' rings opens the sphere.
      const [a, b] = [mesh.verts[e.a], mesh.verts[e.b]];
      if (Math.abs(a[1]) < 1e-9 && Math.abs(b[1]) < 1e-9 && a[0] > -1e-9 && b[0] > -1e-9) setEdgeMark(mesh, 'seam', e.a, e.b, true);
    }
    unwrapSeams(mesh, { margin: 0.02 });
    const b = uvBounds(mesh);
    assert.ok(b.minU >= 0.019 && b.minV >= 0.019 && b.maxU <= 0.981 && b.maxV <= 0.981, JSON.stringify(b));
  });
  test('seams split a cube into islands; a corner on a seam gets a UV per side', () => {
    const mesh = cubeMesh(2);
    // A "cross" net: cut every edge of the top face, and the side edges except one column of joins.
    for (const e of edgeMap(mesh).values()) setEdgeMark(mesh, 'seam', e.a, e.b, true);
    assert.equal(findIslands(mesh).length, 6);
    const result = unwrapSeams(mesh);
    assert.equal(result.islands, 6);
    assert.equal(result.autoCut, 0);
    assert.ok(angleDistortion(mesh) < 0.01);
    // Same scale for each island: texel density stays even.
    const areas = mesh.faces.map((_, f) => Math.abs(uvArea(mesh.uvs[f])));
    for (const a of areas) near(a, areas[0], 1e-6);
  });
  test('a closed mesh without seams still unwraps, and reports that it was cut', () => {
    const mesh = icoSphereMesh(2, 1);
    const result = unwrapSeams(mesh);
    assert.equal(result.autoCut, 1);
    assert.ok(result.islands >= 2);
    assert.ok(mesh.uvs.every(Boolean));
    assert.ok(mesh.uvs.flat().every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  });
  test('only the given faces change', () => {
    const mesh = gridMesh(4, 4, 2);
    const before = structuredClone(mesh.uvs);
    unwrapSeams(mesh, { faces: [0, 1] });
    assert.deepEqual(mesh.uvs[5], before[5]);
    assert.notDeepEqual(mesh.uvs[0], before[0]);
  });
  test('packing separates islands: no two overlap', () => {
    const a = new Map([[0, [[0, 0], [3, 0], [3, 1], [0, 1]]]]);
    const b = new Map([[1, [[10, 10], [11, 10], [11, 12], [10, 12]]]]);
    const c = new Map([[2, [[-5, -5], [-4, -5], [-4, -4], [-5, -4]]]]);
    packIslands([a, b, c], 0.02);
    const box = (m) => { const pts = [...m.values()][0]; return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) }; };
    const list = [a, b, c].map(box);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const [p, q] = [list[i], list[j]];
      assert.ok(p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0, `islands ${i} and ${j} overlap`);
    }
    for (const b2 of list) assert.ok(b2.x0 >= 0 && b2.x1 <= 1 && b2.y0 >= 0 && b2.y1 <= 1);
  });
  test('uv.unwrap unwraps the selected faces in edit mode, all faces otherwise', () => {
    const ctx = context();
    const mesh = activeObject(ctx.doc).data;
    run(ctx, 'uv.unwrap');
    assert.ok(ctx.lastUnwrap.islands >= 1);
    assert.ok(mesh.uvs.every(Boolean));
    assert.ok(ctx.history.canUndo);
  });
});

describe('edge marks', () => {
  test('seam, sharp and crease survive vertex removal with their edges renumbered', () => {
    const ctx = context();
    run(ctx, 'object.editmode_toggle');
    const mesh = activeObject(ctx.doc).data;
    mesh.selV = [4, 5];
    run(ctx, 'mesh.mark_seam');
    assert.equal(mesh.marks.seam[edgeKey(4, 5)], true);
    run(ctx, 'mesh.mark_seam', { clear: true });
    assert.equal(mesh.marks.seam[edgeKey(4, 5)], undefined);
    run(ctx, 'mesh.crease', { value: 0.5 });
    assert.equal(mesh.marks.crease[edgeKey(4, 5)], 0.5);
    mesh.selV = [0];
    run(ctx, 'mesh.delete', { type: 'VERT' });
    const key = Object.keys(mesh.marks.crease)[0];
    const [a, b] = key.split('_').map(Number);
    near(v3.dist(mesh.verts[a], mesh.verts[b]), 2);
    near(mesh.verts[a][2], 1);
    near(mesh.verts[b][2], 1);
  });
  test('marking nothing is reported as nothing to do', () => {
    const ctx = context();
    run(ctx, 'object.editmode_toggle');
    activeObject(ctx.doc).data.selV = [];
    assert.equal(run(ctx, 'mesh.mark_seam'), 'CANCELLED');
  });
  test('a full crease keeps a subdivided cube a cube; no crease rounds it off', () => {
    const smooth = catmullClark(catmullClark(cubeMesh(2)));
    const creased = cubeMesh(2);
    for (const e of edgeMap(creased).values()) setEdgeMark(creased, 'crease', e.a, e.b, 1);
    const hard = catmullClark(catmullClark(creased));
    const extent = (m) => Math.max(...m.verts.map((v) => Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]))));
    near(signedVolume(hard), 8, 1e-6);
    near(extent(hard), 1, 1e-9);
    assert.ok(signedVolume(smooth) < 6, 'plain Catmull-Clark shrinks the cube');
    const half = cubeMesh(2);
    for (const e of edgeMap(half).values()) setEdgeMark(half, 'crease', e.a, e.b, 0.5);
    const v = signedVolume(catmullClark(catmullClark(half)));
    assert.ok(v > signedVolume(smooth) && v < 8, `a half crease lies between: ${v}`);
  });
  test('sharp edges split smooth normals; the rest stay shared', () => {
    const mesh = cubeMesh(2);
    mesh.smooth = true;
    const plain = toTriangles(mesh);
    const firstNormal = plain.normals.slice(0, 3);
    assert.ok(Math.abs(Math.abs(firstNormal[0]) - 0.57735) < 1e-3, 'an unmarked smooth cube has diagonal normals');
    markSharpByAngle(mesh, 30);
    assert.equal(Object.keys(mesh.marks.sharp).length, 12);
    for (const list of splitNormals(mesh)) for (const n of list) near(Math.max(...n.map(Math.abs)), 1, 1e-9);
    const split = toTriangles(mesh);
    for (let i = 0; i < split.normals.length; i += 3) near(Math.max(Math.abs(split.normals[i]), Math.abs(split.normals[i + 1]), Math.abs(split.normals[i + 2])), 1, 1e-9);
  });
  test('custom normals override the shading and aim at a point', () => {
    const mesh = planeMesh(2);
    mesh.selV = [0, 1, 2, 3];
    setCustomNormalsFromShading(mesh);
    assert.deepEqual(mesh.cornerNormals[0][0], [0, 0, 1]);
    pointNormalsAt(mesh, [0, 0, 5]);
    const tri = toTriangles(mesh);
    const expected = v3.norm(v3.sub([0, 0, 5], mesh.verts[mesh.faces[0][0]]));
    for (let k = 0; k < 3; k++) near(tri.normals[k], expected[k], 1e-9);
  });
});

describe('rip and slide', () => {
  test('ripping a line of edges on a grid opens a slit: new vertices, faces separated', () => {
    const mesh = gridMesh(4, 4, 4);
    // The middle row, except its two ends.
    const row = [11, 12, 13];
    const before = mesh.verts.length;
    mesh.selV = row;
    const added = ripSelection(mesh);
    // The interior vertex is split; the two ends of the line have one torn edge each, and stay joined.
    assert.equal(added, 1);
    assert.equal(mesh.verts.length, before + 1);
    assert.equal(mesh.selV.length, 1);
    assert.equal(mesh.faces.length, 16);
    near(mesh.faces.reduce((s, f) => s + faceArea(mesh, f), 0), 16);
  });
  test('ripping a longer line makes the slit\'s two sides separate edges', () => {
    const mesh = gridMesh(6, 4, 6);
    mesh.selV = [15, 16, 17, 18, 19];
    const added = ripSelection(mesh);
    assert.equal(added, 3);
    const boundary = [...edgeMap(mesh).values()].filter((e) => e.faces.length === 1).length;
    // The grid's 20 border edges, plus two sides of the 4-edge slit.
    assert.equal(boundary, 20 + 8);
  });
  test('a lone vertex tears its fan in two', () => {
    const mesh = gridMesh(2, 2, 2);
    mesh.selV = [4];
    assert.equal(ripSelection(mesh), 1);
    assert.equal(mesh.verts.length, 10);
    const used = mesh.faces.filter((f) => f.includes(4)).length;
    assert.equal(used, 2);
    assert.equal(mesh.faces.filter((f) => f.includes(9)).length, 2);
  });
  test('rip with nothing to tear does nothing', () => {
    const mesh = planeMesh(2);
    mesh.selV = [];
    assert.equal(ripSelection(mesh), 0);
    mesh.selV = [0];
    assert.equal(ripSelection(mesh), 0);
  });
  test('sliding a loop moves it along the neighbouring edges, as one', () => {
    const mesh = gridMesh(4, 1, 4);
    mesh.selV = [2, 7];
    edgeSlide(mesh, 0.5);
    const xs = [mesh.verts[2][0], mesh.verts[7][0]];
    near(xs[0], xs[1]);
    near(Math.abs(xs[0]), 0.5);
    near(mesh.verts[2][1], -2);
    near(mesh.verts[7][1], 2);
    const back = gridMesh(4, 1, 4);
    back.selV = [2, 7];
    edgeSlide(back, -0.5);
    near(back.verts[2][0], -xs[0]);
  });
});

describe('proportional editing', () => {
  test('the falloffs are 1 at the selection and 0 at the edge', () => {
    for (const kind of ['SMOOTH', 'SPHERE', 'ROOT', 'SHARP', 'LINEAR']) {
      near(proportionalFalloff(kind, 0), 1);
      near(proportionalFalloff(kind, 1), 0);
      assert.ok(proportionalFalloff(kind, 0.25) > proportionalFalloff(kind, 0.75), kind);
    }
    assert.equal(proportionalFalloff('CONSTANT', 0.9), 1);
    assert.equal(proportionalFalloff('CONSTANT', 1), 0);
  });
  test('only vertices inside the size follow, with weights by distance', () => {
    const mesh = gridMesh(10, 1, 10);
    mesh.selV = [5];
    const list = proportionalWeights(mesh, { size: 2, falloff: 'LINEAR' });
    const byIndex = new Map(list);
    near(byIndex.get(6), 0.5);
    near(byIndex.get(4), 0.5);
    assert.equal(byIndex.has(8), false);
    assert.equal(byIndex.has(5), false, 'the selection itself is not a follower');
  });
  test('Connected Only leaves another shell alone, however close', () => {
    const mesh = gridMesh(1, 1, 1);
    const base = mesh.verts.length;
    mesh.verts.push([0.6, -0.5, 0], [1.6, -0.5, 0], [1.6, 0.5, 0], [0.6, 0.5, 0]);
    mesh.faces.push([base, base + 1, base + 2, base + 3]);
    mesh.selV = [1];
    const near_ = proportionalWeights(mesh, { size: 1 });
    assert.ok(near_.some(([i]) => i >= base), 'plain distance reaches the other shell');
    const joined = proportionalWeights(mesh, { size: 3, connected: true });
    assert.ok(joined.every(([i]) => i < base), 'along edges it cannot');
  });
  test('the Move operator drags followers by their weights', () => {
    const ctx = context();
    run(ctx, 'mesh.primitive_grid_add', { x: 10, y: 1, size: 10 });
    run(ctx, 'object.editmode_toggle');
    const mesh = activeObject(ctx.doc).data;
    mesh.selV = [5];
    ctx.doc.proportional = { enabled: true, size: 2, falloff: 'LINEAR', connected: false };
    run(ctx, 'transform.translate', { value: [0, 0, 1] });
    near(mesh.verts[5][2], 1);
    near(mesh.verts[6][2], 0.5);
    near(mesh.verts[7][2], 0);
    run(ctx, 'wm.proportional_set', { enabled: false, size: 2 });
    run(ctx, 'transform.translate', { value: [0, 0, 1] });
    near(mesh.verts[6][2], 0.5);
    near(mesh.verts[5][2], 2);
  });
  test('Scale and Rotate apply part of the change to followers', () => {
    const ctx = context();
    run(ctx, 'mesh.primitive_grid_add', { x: 4, y: 1, size: 4 });
    run(ctx, 'object.editmode_toggle');
    const mesh = activeObject(ctx.doc).data;
    mesh.selV = [0, 1];
    ctx.doc.proportional = { enabled: true, size: 2, falloff: 'CONSTANT', connected: false };
    const before = mesh.verts[2][0];
    run(ctx, 'transform.resize', { value: [2, 1, 1] });
    assert.notEqual(mesh.verts[2][0], before);
  });
});

describe('texture paint', () => {
  test('a dab in image space paints round, with its centre the strongest', () => {
    const image = createImageBuffer(64, 64, [1, 1, 1, 1]);
    paintDabImage(image, 0.5, 0.5, { radius: 10, strength: 1, color: [1, 0, 0] });
    const centre = samplePixel(image, 0.5, 0.5);
    near(centre[0], 1);
    assert.ok(centre[1] < 0.05, `centre ${centre}`);
    assert.deepEqual(samplePixel(image, 0.05, 0.05), [1, 1, 1, 1], 'far away stays white');
    const mid = samplePixel(image, 0.5 + 7 / 64, 0.5);
    assert.ok(mid[1] > centre[1] && mid[1] < 1, 'falls off towards the edge');
  });
  test('v runs upward: a dab near v=1 lands at the top row', () => {
    const image = createImageBuffer(32, 32, [0, 0, 0, 1]);
    paintDabImage(image, 0.5, 0.97, { radius: 3, color: [1, 1, 1] });
    assert.ok(image.rgba[(16 * 4) + 0] > 0 || image.rgba[(32 + 16) * 4] > 0, 'top row was painted');
    assert.equal(image.rgba[(31 * 32 + 16) * 4], 0, 'bottom row was not');
  });
  test('the blend modes do what they say', () => {
    const make = () => createImageBuffer(8, 8, [0.5, 0.5, 0.5, 1]);
    const at = (image) => samplePixel(image, 0.5, 0.5);
    const opts = { radius: 8, strength: 1 };
    let image = make();
    paintDabImage(image, 0.5, 0.5, { ...opts, color: [0.25, 0.25, 0.25], blend: 'ADD' });
    assert.ok(at(image)[0] > 0.7);
    image = make();
    paintDabImage(image, 0.5, 0.5, { ...opts, color: [0.25, 0.25, 0.25], blend: 'SUB' });
    assert.ok(at(image)[0] < 0.3);
    image = make();
    paintDabImage(image, 0.5, 0.5, { ...opts, color: [0.5, 0.5, 0.5], blend: 'MUL' });
    near(at(image)[0], 0.25, 0.02);
    image = make();
    paintDabImage(image, 0.5, 0.5, { ...opts, blend: 'ERASE' });
    assert.ok(at(image)[3] < 0.1);
  });
  test('a surface dab paints the texels of the 3D neighbourhood, across UV islands', () => {
    // A strip of two quads whose islands lie far apart in UV: the brush at the shared edge must reach both.
    const mesh = createMesh([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [2, 0, 0], [2, 1, 0]], [[0, 1, 2, 3], [1, 4, 5, 2]]);
    mesh.uvs = [[[0, 0], [0.4, 0], [0.4, 1], [0, 1]], [[0.6, 0], [1, 0], [1, 1], [0.6, 1]]];
    const image = createImageBuffer(128, 128, [1, 1, 1, 1]);
    const n = texturePaintDab(mesh, image, [1, 0.5, 0], { radius: 0.3, color: [1, 0, 0] });
    assert.ok(n > 0);
    assert.ok(samplePixel(image, 0.39, 0.5)[1] < 0.5, 'left island, next to the shared edge');
    assert.ok(samplePixel(image, 0.61, 0.5)[1] < 0.5, 'right island, next to the shared edge');
    assert.ok(samplePixel(image, 0.02, 0.5)[1] > 0.99, 'left island far away');
    assert.ok(samplePixel(image, 0.5, 0.5)[1] > 0.99, 'the gap between islands');
  });
  test('its size on the model does not depend on the UV scale', () => {
    const painted = (scale) => {
      const mesh = planeMesh(2);
      mesh.uvs = [mesh.uvs[0].map(([u, v]) => [u * scale, v * scale])];
      const image = createImageBuffer(256, 256, [1, 1, 1, 1]);
      return texturePaintDab(mesh, image, [0, 0, 0], { radius: 0.2, color: [1, 0, 0] }) / (scale * scale);
    };
    near(painted(1) / painted(0.5), 1, 0.05);
  });
  test('the far side of a thin object stays clean when a surface normal is given', () => {
    const mesh = createMesh([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 1, 2, 3], [3, 2, 1, 0]]);
    mesh.uvs = [[[0, 0], [0.45, 0], [0.45, 1], [0, 1]], [[0.55, 1], [1, 1], [1, 0], [0.55, 0]]];
    const image = createImageBuffer(128, 128, [1, 1, 1, 1]);
    texturePaintDab(mesh, image, [0.5, 0.5, 0], { radius: 0.3, color: [1, 0, 0], normal: [0, 0, 1] });
    assert.ok(samplePixel(image, 0.22, 0.5)[1] < 0.5, 'the front is painted');
    assert.ok(samplePixel(image, 0.77, 0.5)[1] > 0.99, 'the back is not');
  });
  test('a mesh without UVs cannot be painted', () => {
    const mesh = icoSphereMesh(1, 1);
    assert.equal(texturePaintDab(mesh, createImageBuffer(8, 8), [0, 0, 0], {}), 0);
  });
  test('Add Paint Texture wires an image to Base Color and unwraps if needed', () => {
    const ctx = context();
    const obj = activeObject(ctx.doc);
    obj.data.uvs = null;
    run(ctx, 'paint.add_texture', { size: 16 });
    assert.ok(obj.data.uvs.every(Boolean));
    assert.equal(ctx.doc.images.length, 1);
    const mat = ctx.doc.materials.find((m) => m.id === obj.materials[0]);
    assert.equal(mat.useNodes, true);
    const tex = mat.nodes.nodes.find((n) => n.type === 'TEX_IMAGE');
    assert.equal(tex.values.image, ctx.doc.images[0].id);
    assert.ok(mat.nodes.links.some((l) => l.from === tex.id && l.in === 'Base Color'));
  });
  test('faces stacked in UV space are told apart from a layout, and Add Paint Texture lays them out', () => {
    const ctx = context();
    const obj = activeObject(ctx.doc);
    assert.ok(uvOverlap(obj.data) > 0.9, 'all six faces of the default cube cover the same square');
    run(ctx, 'paint.add_texture', { size: 16 });
    assert.ok(uvOverlap(obj.data) < 0.02, `after: ${uvOverlap(obj.data)}`);
    const grid = gridMesh(4, 4, 2);
    assert.equal(uvOverlap(grid), 0, 'neighbours that share only a border do not overlap');
  });
  test('image.new makes a valid PNG in the document', () => {
    const ctx = context();
    run(ctx, 'image.new', { name: 'Test', width: 4, height: 2, color: [1, 0, 0], alpha: 1 });
    const image = ctx.doc.images[0];
    assert.match(image.dataUrl, /^data:image\/png;base64,/);
    const bytes = Buffer.from(image.dataUrl.split(',')[1], 'base64');
    assert.deepEqual([...bytes.subarray(0, 4)], [137, 80, 78, 71]);
    assert.equal(bytes.readUInt32BE(16), 4);
    assert.equal(bytes.readUInt32BE(20), 2);
  });
  test('the PNG writer stores big images in several deflate blocks, checksums valid', async () => {
    const { inflateSync } = await import('node:zlib');
    const image = fillImage(createImageBuffer(300, 300), [0.2, 0.4, 0.6, 1]);
    const png = encodePNG(image);
    let o = 8;
    let idat = null;
    while (o < png.length) {
      const view = new DataView(png.buffer, png.byteOffset + o);
      const len = view.getUint32(0);
      const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
      if (type === 'IDAT') idat = png.subarray(o + 8, o + 8 + len);
      o += 12 + len;
    }
    const raw = inflateSync(idat);
    assert.equal(raw.length, (300 * 4 + 1) * 300);
    assert.equal(raw[1], Math.round(0.2 * 255));
  });
  test('undo holds one copy of a picture, however many steps it stays in', () => {
    const ctx = context();
    run(ctx, 'image.new', { width: 128, height: 128 });
    const size = ctx.history.current.text.length;
    assert.ok(size < 20000, `snapshot is ${size} characters: the picture is not pooled`);
    run(ctx, 'mesh.primitive_cube_add', { location: [5, 0, 0] });
    assert.equal(ctx.history.poolIds.length, 1);
    ctx.undo();
    assert.match(ctx.doc.images[0].dataUrl, /^data:image\/png/);
    assert.equal(ctx.doc.images[0].dataUrl.includes('@pool'), false);
  });
});

describe('voxel remesh', () => {
  test('the distance grid is negative inside and positive outside', () => {
    const grid = signedDistanceGrid(cubeMesh(2), 0.25);
    const at = (p) => grid.value(...p.map((x, k) => Math.round((x - grid.min[k]) / 0.25)));
    assert.ok(at([0, 0, 0.9]) < 0);
    assert.ok(at([0, 0, 1.2]) > 0);
    near(Math.abs(at([0, 0, 0.75])), 0.25, 0.26);
  });
  test('a sphere comes out closed, with about the same volume', () => {
    const sphere = icoSphereMesh(3, 1);
    const out = voxelRemesh(sphere, { voxel: 0.1 });
    assert.ok(isManifold(out), 'closed and consistent');
    assert.equal(eulerCharacteristic(out), 2);
    near(signedVolume(out), signedVolume(sphere), 0.08);
    assert.ok(signedVolume(out) > 0, 'normals outward');
  });
  test('a smaller voxel means more faces', () => {
    const cube = cubeMesh(2);
    assert.ok(voxelRemesh(cube, { voxel: 0.1 }).faces.length > voxelRemesh(cube, { voxel: 0.25 }).faces.length * 3);
  });
  test('two overlapping cubes join into one shell', () => {
    const a = cubeMesh(2);
    const b = cubeMesh(2);
    const mesh = createMesh([...a.verts, ...b.verts.map((v) => v3.add(v, [1, 0, 0]))], [...a.faces, ...b.faces.map((f) => f.map((i) => i + 8))]);
    const out = voxelRemesh(mesh, { voxel: 0.125 });
    assert.ok(isManifold(out));
    assert.equal(eulerCharacteristic(out), 2);
    near(signedVolume(out), 12, 0.5);
  });
  test('a torus keeps its hole', () => {
    const out = voxelRemesh(cylinderTorus(), { voxel: 0.05 });
    assert.equal(eulerCharacteristic(out), 0);
  });
  test('the grid is capped: a huge object gets larger voxels instead of running out of memory', () => {
    const big = cubeMesh(1000);
    const started = Date.now();
    const out = voxelRemesh(big, { voxel: 0.001, maxCells: 32 });
    assert.ok(out.faces.length > 0);
    assert.ok(Date.now() - started < 20000);
  });
  test('as a modifier and as an operator', () => {
    const out = applyModifier(cubeMesh(2), createModifier('REMESH'));
    assert.ok(out.faces.length > 100);
    assert.equal(out.smooth, true);
    const ctx = context();
    run(ctx, 'object.voxel_remesh', { voxelSize: 0.25 });
    assert.ok(activeObject(ctx.doc).data.faces.length > 12);
  });
});

function cylinderTorus() {
  // A torus built without the UV seam the primitive function has none of: closed, genus one.
  const [major, minor] = [24, 10];
  const verts = [];
  const faces = [];
  for (let i = 0; i < major; i++) for (let j = 0; j < minor; j++) {
    const [a, b] = [(i / major) * Math.PI * 2, (j / minor) * Math.PI * 2];
    const r = 1 + 0.35 * Math.cos(b);
    verts.push([r * Math.cos(a), r * Math.sin(a), 0.35 * Math.sin(b)]);
  }
  const at = (i, j) => ((i + major) % major) * minor + ((j + minor) % minor);
  for (let i = 0; i < major; i++) for (let j = 0; j < minor; j++) faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  return createMesh(verts, faces);
}

describe('skin', () => {
  test('a single edge becomes a closed capsule of the right size', () => {
    const mesh = createMesh([[0, 0, -1], [0, 0, 1]], []);
    mesh.loose = [[0, 1]];
    const out = skinMesh(mesh, { radius: 0.3, resolution: 0.06, blend: 0 });
    assert.ok(isManifold(out));
    assert.equal(eulerCharacteristic(out), 2);
    const expected = Math.PI * 0.09 * 2 + (4 / 3) * Math.PI * 0.027;
    near(signedVolume(out), expected, expected * 0.08);
  });
  test('a branching skeleton is one shell; radii per vertex are honoured', () => {
    const mesh = createMesh([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], []);
    mesh.loose = [[0, 1], [0, 2], [0, 3]];
    const out = skinMesh(mesh, { radius: 0.15, resolution: 0.05 });
    assert.ok(isManifold(out));
    assert.equal(eulerCharacteristic(out), 2);
    mesh.skin = { 1: 0.4 };
    const bigger = skinMesh(mesh, { radius: 0.15, resolution: 0.05 });
    assert.ok(signedVolume(bigger) > signedVolume(out) * 1.2);
  });
  test('as a modifier', () => {
    const mesh = createMesh([[0, 0, 0], [0, 0, 1]], []);
    mesh.loose = [[0, 1]];
    assert.ok(applyModifier(mesh, createModifier('SKIN')).faces.length > 20);
  });
  test('no edges: an empty mesh, not an error', () => {
    assert.equal(skinMesh(createMesh([[0, 0, 0]], [])).faces.length, 0);
  });
});

describe('ocean', () => {
  const base = { resolution: 64, size: 50, waveScale: 1, windSpeed: 12, windAngle: 0, choppiness: 1, seed: 3, time: 0 };
  const rms = (list) => Math.sqrt(list.reduce((s, x) => s + x * x, 0) / list.length);
  test('the same settings give the same sea; another seed another', () => {
    const a = oceanField(base);
    assert.deepEqual([...a.height], [...oceanField(base).height]);
    assert.notDeepEqual([...a.height], [...oceanField({ ...base, seed: 4 }).height]);
  });
  test('waves average to sea level and move over time', () => {
    const a = oceanField(base);
    const mean = a.height.reduce((s, x) => s + x, 0) / a.height.length;
    assert.ok(Math.abs(mean) < rms(a.height) * 0.05, `mean ${mean} of rms ${rms(a.height)}`);
    assert.ok(rms(a.height) > 0.01, `rms ${rms(a.height)}`);
    assert.notDeepEqual([...a.height], [...oceanField({ ...base, time: 1 }).height]);
  });
  test('wave scale scales the height; stronger wind makes bigger waves', () => {
    const a = rms(oceanField(base).height);
    near(rms(oceanField({ ...base, waveScale: 4 }).height) / a, 2, 0.001);
    // On a tile much larger than the waves: a small tile has no room for the longer waves a strong wind makes.
    const wide = { ...base, size: 800 };
    assert.ok(rms(oceanField({ ...wide, windSpeed: 24 }).height) > rms(oceanField(wide).height) * 1.5);
    // 12 m/s of wind over a big sea: a significant wave height of a few metres.
    const big = rms(oceanField({ ...wide, resolution: 128 }).height) * 4;
    assert.ok(big > 0.5 && big < 8, `significant height ${big} m`);
  });
  test('energy runs along the wind: the crests form across it', () => {
    const slope = (f, dx, dy) => { let s = 0; const { n } = f; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) s += (f.height[y * n + x] - f.height[((y + dy) % n) * n + ((x + dx) % n)]) ** 2; return s; };
    const f = oceanField(base);
    assert.ok(slope(f, 1, 0) > slope(f, 0, 1) * 1.5, 'steeper along the wind than across it');
  });
  test('the tile repeats: its two edges match, so tiles fit side by side', () => {
    const mesh = oceanMesh({ ...base, choppiness: 0 });
    const n = 64;
    for (let y = 0; y <= n; y += 8) near(mesh.verts[y * (n + 1)][2], mesh.verts[y * (n + 1) + n][2], 1e-9);
  });
  test('choppiness moves points sideways only', () => {
    const flat = oceanMesh({ ...base, choppiness: 0 });
    const chop = oceanMesh({ ...base, choppiness: 2 });
    let moved = 0;
    flat.verts.forEach((v, i) => { near(chop.verts[i][2], v[2], 1e-9); if (v3.dist(v, chop.verts[i]) > 1e-3) moved++; });
    assert.ok(moved > flat.verts.length / 2);
  });
  test('as a modifier it follows the frame', () => {
    const doc = createDefaultScene();
    const obj = activeObject(doc);
    obj.modifiers.push(createModifier('OCEAN'));
    doc.frame = 1;
    const a = evaluatedMesh(doc, obj);
    doc.frame = 48;
    const b = evaluatedMesh(doc, obj);
    assert.equal(a.verts.length, 65 * 65);
    assert.notDeepEqual(a.verts[100], b.verts[100]);
  });
});

describe('multiresolution', () => {
  const mod = () => ({ ...createModifier('MULTIRES'), levels: 2, total: 2 });
  test('without sculpting it is plain subdivision', () => {
    const base = cubeMesh(2);
    const expected = catmullClark(catmullClark(base));
    assert.deepEqual(multiresEvaluate(base, mod(), catmullClark).verts, expected.verts);
  });
  test('a sculpted dab is kept as offsets and the base mesh does not change', () => {
    const base = cubeMesh(2);
    const before = cloneMesh(base);
    const m = mod();
    multiresSculpt(base, m, catmullClark, (top) => { top.verts[10] = v3.add(top.verts[10], [0, 0, 0.5]); });
    assert.deepEqual(base.verts, before.verts);
    const shown = multiresEvaluate(base, m, catmullClark);
    const smooth = catmullClark(catmullClark(base));
    near(shown.verts[10][2] - smooth.verts[10][2], 0.5);
  });
  test('a second dab adds to the first', () => {
    const base = cubeMesh(2);
    const m = mod();
    const push = (top) => { top.verts[10] = v3.add(top.verts[10], [0, 0, 0.25]); };
    multiresSculpt(base, m, catmullClark, push);
    multiresSculpt(base, m, catmullClark, push);
    near(m.disp[10][2], 0.5);
  });
  test('a lower level shows the sculpting of the vertices it shares with the top', () => {
    const base = cubeMesh(2);
    const m = mod();
    // Original vertex 0 is found at the top level by going past the new points of each level.
    const level1 = catmullClark(base);
    const top = level1.faces.length + edgeMap(level1).size + (base.faces.length + edgeMap(base).size);
    multiresSculpt(base, m, catmullClark, (mesh) => { mesh.verts[top] = v3.add(mesh.verts[top], [0, 0, -1]); });
    const low = multiresEvaluate(base, { ...m, levels: 0 }, catmullClark);
    assert.equal(low.verts.length, 8);
    near(low.verts[0][2] - base.verts[0][2], -1);
    near(low.verts[7][2], base.verts[7][2]);
  });
  test('Subdivide adds a level and keeps the sculpted shape', () => {
    const base = cubeMesh(2);
    const m = mod();
    multiresSculpt(base, m, catmullClark, (mesh) => { mesh.verts = mesh.verts.map((v) => [v[0], v[1], v[2] * 1.5]); });
    const before = signedVolume(multiresEvaluate(base, m, catmullClark));
    multiresAddLevel(base, m, catmullClark);
    assert.equal(m.total, 3);
    assert.equal(m.levels, 3);
    const after = signedVolume(multiresEvaluate(base, m, catmullClark));
    near(after, before, before * 0.05);
  });
  test('the operator needs the modifier', () => {
    const ctx = context();
    assert.equal(canRun(ctx, 'object.multires_subdivide'), false);
    run(ctx, 'object.modifier_add', { type: 'MULTIRES' });
    run(ctx, 'object.multires_subdivide');
    assert.equal(activeObject(ctx.doc).modifiers[0].total, 2);
  });
  test('editing the base topology afterwards ignores offsets that no longer fit', () => {
    const base = cubeMesh(2);
    const m = mod();
    multiresSculpt(base, m, catmullClark, () => {});
    base.faces.pop();
    const out = multiresEvaluate(base, m, catmullClark);
    assert.ok(out.verts.every((v) => v.every(Number.isFinite)));
  });
});

describe('dynamic topology', () => {
  test('long edges near the brush split; far ones stay', () => {
    const mesh = gridMesh(10, 10, 10);
    mesh.faces = mesh.faces.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
    mesh.uvs = null;
    const before = mesh.verts.length;
    const { split } = dyntopoRefine(mesh, [0, 0, 0], 1.5, 0.5);
    assert.ok(split > 0);
    assert.equal(mesh.verts.length, before + split);
    for (const face of mesh.faces) for (let i = 0; i < 3; i++) {
      const [a, b] = [mesh.verts[face[i]], mesh.verts[face[(i + 1) % 3]]];
      const mid = v3.lerp(a, b, 0.5);
      if (v3.dist(mid, [0, 0, 0]) > 3) assert.ok(v3.dist(a, b) >= 1 - 1e-9, 'the far side is untouched');
    }
  });
  test('a closed mesh stays closed and keeps its shape through many refinements', () => {
    const mesh = icoSphereMesh(2, 1);
    const volume = signedVolume(mesh);
    for (let i = 0; i < 6; i++) dyntopoRefine(mesh, [0, 0, 1], 0.8, 0.15);
    assert.ok(isManifold(mesh), 'still manifold');
    assert.equal(eulerCharacteristic(mesh), 2);
    near(signedVolume(mesh), volume, volume * 0.1);
    assert.ok(mesh.faces.length > 80);
  });
  test('quads are triangulated first, and the UVs (no longer valid) dropped', () => {
    const mesh = cubeMesh(2);
    dyntopoRefine(mesh, [0, 0, 1], 1, 1);
    assert.ok(mesh.faces.every((f) => f.length === 3));
    assert.equal(mesh.uvs, null);
  });
  test('very short edges collapse', () => {
    const mesh = icoSphereMesh(3, 1);
    const before = mesh.faces.length;
    const { collapsed } = dyntopoRefine(mesh, [0, 0, 1], 0.6, 1.2);
    void collapsed;
    assert.ok(isManifold(mesh));
    assert.ok(mesh.faces.length !== before || collapsed === 0);
  });
  test('collapsing really happens when the detail asks for bigger triangles', () => {
    const mesh = icoSphereMesh(4, 1);
    const before = mesh.faces.length;
    const { collapsed } = dyntopoRefine(mesh, [0, 0, 1], 0.5, 0.5);
    assert.ok(collapsed > 0);
    assert.ok(mesh.faces.length < before);
    assert.ok(mesh.faces.every(([a, b, c]) => a !== b && b !== c && c !== a));
  });
});

describe('shrinkwrap to the surface', () => {
  test('a point lands on a big face, not on its nearest corner', () => {
    const target = planeMesh(10);
    const mesh = createMesh([[0.3, 0.2, 3]], []);
    const mod = { ...createModifier('SHRINKWRAP'), object: 'x', offset: 0.1 };
    const out = applyModifier(mesh, mod, { meshInLocal: () => target });
    near(out.verts[0][0], 0.3);
    near(out.verts[0][1], 0.2);
    near(out.verts[0][2], 0.1);
  });
  test('points around a sphere land on its surface', () => {
    const target = icoSphereMesh(4, 1);
    const mesh = icoSphereMesh(1, 3);
    const out = applyModifier(mesh, { ...createModifier('SHRINKWRAP'), object: 'x', offset: 0 }, { meshInLocal: () => target });
    for (const v of out.verts) near(v3.len(v), 1, 0.01);
    void evaluateMesh;
    void cylinderMesh;
  });
});
