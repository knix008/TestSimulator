// FreeCAD Part: sub-elements (faces, edges, vertices), the shape operations
// (exact with OpenCASCADE, and their meshes), datums and attachment.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadOcc, occPieces, occProperties, occShapeFromMesh, occShapeInfo } from '../../src/domain/occ.js';
import { meshVolume, normalizeSolidData, resetSolidCaches, solidMesh } from '../../src/domain/solids.js';
import { elementName, elementSignature, matchElement, meshTopology } from '../../src/domain/topology.js';
import { mirrorTriangles, patternCopies, piecesOf } from '../../src/domain/partops.js';
import { attachedPlacement, frameToPlacement, resolveAttachments } from '../../src/domain/datums.js';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import { DrawingDocument } from '../../src/domain/document.js';
import { explode } from '../../src/domain/entities.js';
import { apply, rotationOf } from '../../src/domain/transform3d.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const box = (l, w, h, p = {}) => ({ type: 'solid', kind: 'box', params: { length: l, width: w, height: h }, ...p });
const solid = (raw) => normalizeSolidData({ type: 'solid', ...raw });
const volume = (e) => Math.abs(meshVolume(solidMesh(e)));

test('topology: a box has 6 faces, 12 edges, 8 vertices; a cylinder 3 faces (2 flat) and 2 round edges', () => {
  const t = meshTopology(solidMesh(solid(box(10, 20, 30))));
  assert.deepEqual([t.faces.length, t.edges.length, t.vertices.length], [6, 12, 8]);
  assert.ok(t.faces.every((f) => f.planar));
  near(t.faces.reduce((s, f) => s + f.area, 0), 2 * (200 + 300 + 600));
  const c = meshTopology(solidMesh(solid({ kind: 'cylinder', params: { radius: 5, height: 10, angle: 360 } })));
  assert.equal(c.faces.length, 3);
  assert.equal(c.faces.filter((f) => f.planar).length, 2);
  assert.equal(c.edges.length, 2);
  assert.ok(c.edges.every((e) => e.closed));
  assert.equal(elementName('face', 0), 'Face1');
});

test('topology: a picked face is found again when the solid grows (by its signature)', () => {
  const t = meshTopology(solidMesh(solid(box(10, 20, 30))));
  const top = t.faces.findIndex((f) => f.normal[2] > 0.99);
  const signature = elementSignature(t, 'face', top);
  const grown = meshTopology(solidMesh(solid(box(10, 20, 40))));
  const again = matchElement(grown, 'face', signature);
  near(grown.faces[again].normal[2], 1);
  near(grown.faces[again].center[2], 40);
});

test('mesh fallbacks: compound, fragments, mirror, scale, linear and polar patterns, compound filter', () => {
  near(volume(solid({ kind: 'compound', params: {}, shape: { parts: [box(10, 10, 10), box(10, 10, 10, { x: 20 })] } })), 2000);
  near(volume(solid({ kind: 'fragments', params: {}, shape: { parts: [box(10, 10, 10), box(10, 10, 10, { x: 5 })] } })), 1500, 1e-3);
  near(volume(solid({ kind: 'mirror3d', params: { plane: 0, offset: 0 }, shape: { base: box(10, 10, 10) } })), 1000);
  near(volume(solid({ kind: 'scale3d', params: { sx: 2, sy: 1, sz: 3 }, shape: { base: box(10, 10, 10) } })), 6000);
  near(volume(solid({ kind: 'pattern', params: { mode: 0, count: 3, length: 40, dx: 1, dy: 0, dz: 0 }, shape: { base: box(10, 10, 10) } })), 3000, 1e-3);
  const polar = solid({ kind: 'pattern', params: { mode: 1, count2: 6, angle: 360, axis: 2, cx: 0, cy: 0 }, shape: { base: box(4, 4, 4, { x: 30 }) } });
  assert.equal(patternCopies(polar).length, 6);
  near(volume(polar), 6 * 64, 1e-3);
  near(volume(solid({ kind: 'compoundFilter', params: { from: 1, to: 1, minVolume: 0 }, shape: { base: { kind: 'compound', params: {}, shape: { parts: [box(10, 10, 10), box(5, 5, 5, { x: 20 })] } } } })), 125);
  const mirrored = mirrorTriangles(solidMesh(solid(box(10, 10, 10))), 'yz', 0);
  assert.ok(mirrored.every((tri) => tri.every((p) => p[0] <= 1e-9)), 'on the other side of x = 0');
  near(Math.abs(meshVolume(mirrored)), 1000);
  assert.equal(piecesOf(solidMesh(solid({ kind: 'compound', params: {}, shape: { parts: [box(1, 1, 1), box(1, 1, 1, { x: 5 })] } }))).length, 2);
});

test('exact (OpenCASCADE): fragments, slice, refine, mirror, scale, pattern, shape info, pieces and sewing a mesh', async () => {
  await loadOcc();
  resetSolidCaches();
  const fragments = solid({ kind: 'fragments', params: {}, shape: { parts: [box(10, 10, 10), box(10, 10, 10, { x: 5 })] } });
  near(occProperties(fragments).volume, 1500);
  assert.equal(occShapeInfo(fragments).solids, 3, 'the overlap is a piece of its own');
  const slice = solid({ kind: 'slice', params: {}, shape: { base: box(10, 10, 10), tools: [box(1, 20, 20, { x: 4.5, y: -5, z: -5 })] } });
  assert.deepEqual(occPieces(slice).map((p) => Math.round(p.volume)).sort((a, b) => a - b), [100, 450, 450]);
  const refined = solid({ kind: 'refine', params: {}, shape: { base: { kind: 'boolean', params: {}, shape: { op: 'union', parts: [box(10, 10, 10), box(10, 10, 10, { x: 10 })] } } } });
  assert.equal(occShapeInfo(refined).faces, 6, 'coplanar faces merged');
  near(occProperties(solid({ kind: 'scale3d', params: { sx: 2, sy: 2, sz: 2 }, shape: { base: box(10, 10, 10) } })).volume, 8000);
  near(occProperties(solid({ kind: 'mirror3d', params: { plane: 2, offset: 5 }, shape: { base: box(10, 10, 10) } })).volume, 1000);
  near(occProperties(solid({ kind: 'pattern', params: { mode: 1, count2: 4, angle: 360, axis: 2 }, shape: { base: box(10, 10, 10, { x: 20 }) } })).volume, 4000);
  const sewn = occShapeFromMesh(solidMesh(solid(box(10, 10, 10))));
  near(occProperties({ type: 'solid', kind: 'mesh', params: {}, shape: { tris: [], brep: sewn } }).volume, 1000);
});

test('explode gives back what an operation was made of', () => {
  const compound = { type: 'solid', kind: 'compound', params: {}, shape: { parts: [solid(box(1, 1, 1)), solid(box(1, 1, 1, { x: 3 }))] }, x: 10, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, flip: false, layer: '0' };
  const parts = explode(compound);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => p.x), [10, 13]);
});

test('datums: placement from a face, an edge, two and three points; attached solids follow what they are on', () => {
  const flat = frameToPlacement([1, 2, 3], [0, 0, 1]);
  assert.deepEqual([flat.x, flat.y, flat.z, flat.rx, flat.ry, flat.rz], [1, 2, 3, 0, 0, 0]);
  const t = meshTopology(solidMesh(solid(box(10, 20, 30))));
  const side = t.faces.find((f) => f.normal[0] > 0.99);
  const place = attachedPlacement({ mode: 'flat', refs: [{}], offset: [0, 0, 0] }, () => ({ face: side }));
  near(place.x, 10);
  // Its z axis is the face's normal (+x).
  const z = apply(rotationOf(place), [0, 0, 1]);
  near(z[0], 1); near(Math.abs(z[1]) + Math.abs(z[2]), 0);
  const doc = new DrawingDocument(createDrawing({ title: 'Attach' }));
  let base; let datum;
  doc.apply('add', (d) => { base = addEntity(d, 'solid', box(10, 20, 30)); });
  doc.apply('datum', (d) => { datum = addEntity(d, 'solid', { kind: 'datum', params: { type: 0, size: 20 }, attach: { mode: 'flat', refs: [{ id: base.id, kind: 'face', signature: { center: [5, 10, 30], normal: [0, 0, 1] } }], offset: [0, 0, 2] } }); });
  assert.equal(doc.drawing.entities.find((e) => e.id === datum.id).z, 32);
  doc.apply('grow', (d) => { d.entities = d.entities.map((e) => (e.id === base.id ? { ...e, params: { ...e.params, height: 45 } } : e)); });
  assert.equal(doc.drawing.entities.find((e) => e.id === datum.id).z, 47, 'it follows the face');
  assert.equal(resolveAttachments(doc.drawing, solidMesh), 0, 'already in place');
});

test('PartDesign body: the features after its tip are not shown', async () => {
  const { isVisible3d, normalizeDrawing } = await import('../../src/domain/drawing.js');
  const d = normalizeDrawing({ title: 'Body', entities: [], groups: [{ id: 'b', name: 'Body', body: true, tip: 'f2' }] });
  const ids = ['f1', 'f2', 'f3'].map((id) => { const e = addEntity(d, 'solid', { ...box(1, 1, 1), group: 'b' }); e.id = id; return e; });
  assert.deepEqual(ids.map((e) => isVisible3d(d, e)), [true, true, false]);
  d.groups[0].tip = undefined;
  assert.deepEqual(ids.map((e) => isVisible3d(d, e)), [true, true, true]);
});
