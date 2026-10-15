// The OpenCASCADE kernel: exact booleans and dress-ups, volumes, STEP and BREP.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadOcc, occBrep, occProperties, occRead, occStep } from '../../src/domain/occ.js';
import { meshVolume, resetSolidCaches, solidMesh, solidProperties } from '../../src/domain/solids.js';

await loadOcc();
resetSolidCaches();

const rel = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} vs ${b}`);
const box = (length, width, height, place = {}) => ({ type: 'solid', kind: 'box', params: { length, width, height }, ...place });
const cylinder = (radius, height, place = {}) => ({ type: 'solid', kind: 'cylinder', params: { radius, height, angle: 360 }, ...place });

test('a box with a cylinder cut through it: exact volume, the mesh within half a percent', () => {
  const cut = { type: 'solid', kind: 'boolean', params: {}, shape: { op: 'cut', parts: [box(100, 60, 30), cylinder(12, 40, { x: 50, y: 30, z: -5 })] } };
  const exact = 100 * 60 * 30 - Math.PI * 144 * 30;
  rel(occProperties(cut).volume, exact, 1e-9);
  rel(solidProperties(cut).volume, exact, 1e-9);
  rel(Math.abs(meshVolume(solidMesh(cut))), exact, 0.005);
  // Fuse and common too; placement (moved and turned) is kept.
  const fused = { type: 'solid', kind: 'boolean', params: {}, shape: { op: 'union', parts: [box(10, 10, 10), box(10, 10, 10, { x: 5 })] }, x: 100, rz: 90 };
  rel(occProperties(fused).volume, 1500, 1e-9);
  const common = { type: 'solid', kind: 'boolean', params: {}, shape: { op: 'common', parts: [box(10, 10, 10), { type: 'solid', kind: 'sphere', params: { radius: 10 } }] } };
  rel(occProperties(common).volume, (4 / 3) * Math.PI * 1000 / 8, 1e-9);
  const xs = solidMesh(fused).flat().map((p) => p[0]);
  rel(Math.min(...xs), 90, 1e-9);
});

test('a fillet round every edge of a box: the exact rounded-box volume', () => {
  const [a, b, c, r] = [40, 30, 20, 3];
  const fillet = { type: 'solid', kind: 'fillet', params: { size: r, edges: 0 }, shape: { base: box(a, b, c) } };
  const [A, B, C] = [a - 2 * r, b - 2 * r, c - 2 * r];
  const exact = A * B * C + 2 * r * (A * B + B * C + A * C) + Math.PI * r * r * (A + B + C) + (4 / 3) * Math.PI * r ** 3;
  rel(occProperties(fillet).volume, exact, 1e-6);
  // A chamfer on the top edges only: four prisms of r²/2 off, overlapping in a pyramid (r³/3) at each corner.
  const chamfer = { type: 'solid', kind: 'chamfer', params: { size: r, edges: 1 }, shape: { base: box(a, b, c) } };
  rel(occProperties(chamfer).volume, a * b * c - (r * r / 2) * 2 * (a + b) + 4 * (r ** 3 / 3), 1e-6);
  // A fillet on a cylinder's rims, and a hollowed box open at the top.
  const rim = { type: 'solid', kind: 'fillet', params: { size: 2, edges: 1 }, shape: { base: cylinder(10, 20) } };
  assert.ok(occProperties(rim).volume < Math.PI * 100 * 20);
  const shell = { type: 'solid', kind: 'thickness', params: { thickness: 2, open: 0 }, shape: { base: box(a, b, c) } };
  rel(occProperties(shell).volume, a * b * c - (a - 4) * (b - 4) * (c - 2), 1e-6);
});

test('STEP and BREP keep the exact surfaces: written, read back, same volume', () => {
  const cut = { type: 'solid', kind: 'boolean', params: {}, shape: { op: 'cut', parts: [box(100, 60, 30), cylinder(12, 40, { x: 50, y: 30, z: -5 })] }, name: 'Plate' };
  const step = occStep([cut, { type: 'solid', kind: 'sphere', params: { radius: 5 }, x: 200 }]);
  assert.match(step, /ISO-10303-21/);
  assert.match(step, /CYLINDRICAL_SURFACE/);
  assert.match(step, /SPHERICAL_SURFACE/);
  const back = occRead(step, 'step');
  assert.equal(back.length, 2);
  const volumes = back.map((s) => Math.abs(meshVolume(s.tris))).sort((x, y) => x - y);
  rel(volumes[0], (4 / 3) * Math.PI * 125, 0.01);
  rel(volumes[1], 100 * 60 * 30 - Math.PI * 144 * 30, 0.005);
  const brep = occBrep(cut);
  assert.match(brep, /CASCADE Topology/);
  rel(Math.abs(meshVolume(occRead(brep, 'brep')[0].tris)), 100 * 60 * 30 - Math.PI * 144 * 30, 0.005);
});

test('STEP names each solid; meshes read from STEP stay exact in booleans', async () => {
  const { occBrepAll } = await import('../../src/domain/occ.js');
  const step = occStep([{ ...box(10, 10, 10), name: 'Cube A' }, { ...cylinder(3, 10, { x: 30 }), name: 'Pin' }]);
  assert.match(step, /PRODUCT\('Cube A'/);
  assert.match(step, /PRODUCT\('Pin'/);
  const [pin] = occRead(occStep([cylinder(3, 10)]), 'step');
  const imported = { type: 'solid', kind: 'mesh', params: {}, shape: { tris: pin.tris.flat(2), brep: pin.brep } };
  const cut = { type: 'solid', kind: 'boolean', params: {}, shape: { op: 'cut', parts: [box(10, 10, 10, { x: -5, y: -5 }), imported] } };
  rel(occProperties(cut).volume, 1000 - Math.PI * 9 * 10, 1e-9);
  assert.match(occBrepAll([box(1, 1, 1), box(1, 1, 1, { x: 3 })]), /Co\b|CASCADE Topology/);
});

test('picked edges are found again after the solid changes (topological naming by geometry)', async () => {
  const { occDressEdges } = await import('../../src/domain/occ.js');
  const base = box(40, 30, 20);
  const all = occDressEdges({ type: 'solid', kind: 'fillet', params: { size: 2, edges: 0 }, shape: { base } });
  assert.equal(all.length, 12);
  // Pick the one vertical edge at x = 40, y = 30.
  const edge = all.find((e) => Math.abs(e.mid[0] - 40) < 1e-6 && Math.abs(e.mid[1] - 30) < 1e-6);
  const fillet = { type: 'solid', kind: 'fillet', params: { size: 5, edges: 5 }, shape: { base, picks: [{ mid: edge.mid, dir: edge.dir }] } };
  const one = 40 * 30 * 20 - (25 - Math.PI * 25 / 4) * 20;
  rel(occProperties(fillet).volume, one, 1e-6);
  // The box made longer: the same corner edge (now at x = 50) still takes the fillet.
  const longer = { ...fillet, shape: { ...fillet.shape, base: box(50, 30, 20) } };
  rel(occProperties(longer).volume, 50 * 30 * 20 - (25 - Math.PI * 25 / 4) * 20, 1e-6);
  assert.equal(occDressEdges(longer).filter((e) => e.picked).length, 1);
});

test('draft: the sides of a box lean in by the angle (∫ (a − 2kz)(b − 2kz) dz)', () => {
  const [a, b, h, deg] = [40, 30, 20, 10];
  const draft = { type: 'solid', kind: 'draft', params: { angle: deg }, shape: { base: box(a, b, h) } };
  const k = Math.tan((deg * Math.PI) / 180);
  const exact = a * b * h - k * (a + b) * h * h + (4 / 3) * k * k * h ** 3;
  rel(occProperties(draft).volume, exact, 1e-6);
  rel(Math.abs(meshVolume(solidMesh(draft))), exact, 1e-3);
});

test('FCStd: a Part::Feature with an exact .brp comes back exact (written by MyCAD, read by MyCAD)', async () => {
  const { exportMesh, importMesh } = await import('../../src/domain/exchange3d.js');
  const { addEntity, createDrawing } = await import('../../src/domain/drawing.js');
  const d = createDrawing({ title: 'Round' });
  addEntity(d, 'solid', { kind: 'fillet', name: 'Rounded', params: { size: 3, edges: 0 }, shape: { base: { kind: 'box', params: { length: 40, width: 30, height: 20 } } }, x: 10 });
  const back = importMesh('fcstd', exportMesh('fcstd', d, d.entities));
  const solid = back.entities.find((e) => e.name === 'Rounded');
  assert.ok(solid?.shape?.brep, 'kept exact');
  rel(occProperties({ ...solid, type: 'solid' }).volume, occProperties(d.entities[0]).volume, 1e-9);
});

test('IGES solids: written as B-rep objects (186) on planes, cylinders, spheres and B-splines, read back within a tessellation', async () => {
  const { exportIges, importIges } = await import('../../src/domain/iges.js');
  const { addEntity, createDrawing } = await import('../../src/domain/drawing.js');
  const fs = await import('node:fs');
  const d = createDrawing({ title: 'Solids' });
  addEntity(d, 'solid', { kind: 'boolean', name: 'Plate', params: {}, shape: { op: 'cut', parts: [box(80, 50, 10), cylinder(10, 20, { x: 40, y: 25, z: -5 })] } });
  addEntity(d, 'solid', { kind: 'sphere', name: 'Ball', params: { radius: 8 }, x: 120 });
  addEntity(d, 'solid', { kind: 'torus', name: 'Ring', params: { radius1: 10, radius2: 2 }, x: 200 });
  const text = exportIges(d, { file: 'solids.igs', date: new Date('2026-01-01T00:00:00Z') });
  for (const type of [186, 514, 510, 508, 504, 502, 190, 192, 196, 128]) assert.match(text, new RegExp(`^ +${type} `, 'm'), `entity ${type}`);
  const solids = importIges(text).drawing.entities.filter((e) => e.type === 'solid');
  assert.equal(solids.length, 3);
  const mesh = (e) => { const t = e.shape.tris; const out = []; for (let i = 0; i < t.length; i += 9) out.push([[t[i], t[i + 1], t[i + 2]], [t[i + 3], t[i + 4], t[i + 5]], [t[i + 6], t[i + 7], t[i + 8]]]); return out; };
  d.entities.filter((e) => e.type === 'solid').forEach((e, i) => rel(meshVolume(mesh(solids[i])), occProperties(e).volume, 0.006));
  // A FreeCAD IGES (trimmed surfaces 144 on planes 108 and revolutions 120).
  const bracket = importIges(fs.readFileSync(new URL('../../samples/freecad/freecad-bracket.iges', import.meta.url), 'utf8')).drawing.entities.filter((e) => e.type === 'solid');
  assert.equal(bracket.length, 1);
  rel(meshVolume(mesh(bracket[0])), 27895.22131576614, 0.001);
});
