// Result display and modelling features: section planes through the tetrahedra, vector arrows, probe
// values, boolean bodies and profile bodies (meshed by the WebAssembly solver), conditional catalog
// fields and the inlet direction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cutTets, gridArrows, meshBox, nodalArrows, sectionPlane, surfaceNodes, valueAt } from '../../src/sim/section.js';
import { addBc, addBody, addSystem, buildJob, createProject } from '../../src/sim/project.js';
import { BCS, fieldShown } from '../../src/sim/catalog.js';
import { DEFAULT_PROFILES, bodyNode, cleanProfile, nodeBox, polygonArea, selfIntersects } from '../../src/sim/shapes.js';
import { fluidSlices } from '../../src/sim/results.js';
import { solve } from './wasm-helper.mjs';

/** Volume of the solid elements of a mesh (model units³). */
function meshVolume(info) {
  const p = info.positions; const t = info.tets; let v = 0;
  for (let e = 0; e < t.length / 4; e++) {
    if (info.tetRegion[e] >= info.bodies.length) continue;
    const q = (k) => [p[3 * t[4 * e + k]], p[3 * t[4 * e + k] + 1], p[3 * t[4 * e + k] + 2]];
    const [a, b, c, d] = [q(0), q(1), q(2), q(3)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const z = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    v += Math.abs(u[0] * (w[1] * z[2] - w[2] * z[1]) - u[1] * (w[0] * z[2] - w[2] * z[0]) + u[2] * (w[0] * z[1] - w[1] * z[0])) / 6;
  }
  return v;
}
const meshOf = (job) => solve({ ...job, analysis: 'mesh', mesh: { size: 2, order: 1 } }).mesh;

const unitTet = () => ({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), tets: new Uint32Array([0, 1, 2, 3]), tetRegion: new Uint32Array([0]), tris: new Uint32Array([0, 1, 2]), bodies: [{ id: 'b' }] });

test('a plane cuts a tetrahedron into a triangle or a quadrilateral, values interpolated', () => {
  const info = unitTet();
  const values = new Float32Array([0, 1, 2, 3]);
  // x = 0.5: one corner (1, 0, 0) on the far side → a triangle on the edges from node 1.
  const tri = cutTets(info, values, { normal: [1, 0, 0], point: [0.5, 0, 0] });
  assert.equal(tri.count, 1);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(tri.positions[3 * i] - 0.5) < 1e-6);
  // On edge 0–1 at its middle the value is 0.5.
  assert.ok([...tri.values].some((v) => Math.abs(v - 0.5) < 1e-6));
  // x + y = 0.5 … a plane between the pairs (0, 3) and (1, 2): a quadrilateral as two triangles.
  const n = [1 / Math.SQRT2, 1 / Math.SQRT2, 0];
  const quad = cutTets(info, values, { normal: n, point: [0.25, 0.25, 0] });
  assert.equal(quad.count, 2);
  const q2 = cutTets(info, values, { normal: [0, 0, 1], point: [0, 0, 0.3] }); // a triangle near the apex 3
  assert.equal(q2.count, 1);
  const mixed = cutTets(info, values, { normal: [1, 1, 0].map((v) => v / Math.SQRT2), point: [0.3, 0.3, 0] });
  assert.ok(mixed.count >= 1);
  // A plane missing the element cuts nothing; a region filter drops it too.
  assert.equal(cutTets(info, values, { normal: [1, 0, 0], point: [2, 0, 0] }).count, 0);
  assert.equal(cutTets(info, values, { normal: [1, 0, 0], point: [0.5, 0, 0] }, { regions: new Set([1]) }).count, 0);
});

test('a quadrilateral cut is two triangles covering its area', () => {
  // The plane z = 0.5 through a unit cube made of the mesh solver: the cut area is the cube's face area.
  const r = solve({ analysis: 'mesh', unit: 0.001, bodies: [{ id: 'b', material: 'steel', shape: { type: 'box', size: [10, 10, 10] } }], mesh: { size: 2.5, order: 1 } });
  const info = r.mesh;
  assert.ok(info.tets.length / 4 === info.elements, 'tets travel with the mesh');
  const box = meshBox(info);
  const plane = sectionPlane(box, { axis: 'z', offset: 0.37 });
  const cut = cutTets(info, null, plane);
  let area = 0;
  for (let t = 0; t < cut.count; t++) {
    const p = (k) => [cut.positions[9 * t + 3 * k], cut.positions[9 * t + 3 * k + 1], cut.positions[9 * t + 3 * k + 2]];
    const [a, b, c] = [p(0), p(1), p(2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    area += 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  }
  assert.ok(Math.abs(area - 100) < 0.5, `cut area ${area}`);
  assert.ok(Math.abs(plane.at - (box[0][2] + 0.37 * (box[1][2] - box[0][2]))) < 1e-9);
  assert.deepEqual(sectionPlane(box, { axis: 'y', flip: true }).normal, [0, -1, 0]);
});

test('arrows spread evenly and follow the vectors; probe values come from the nearest node', () => {
  const r = solve({ analysis: 'mesh', unit: 0.001, bodies: [{ id: 'b', material: 'steel', shape: { type: 'box', size: [40, 40, 10] } }], mesh: { size: 2, order: 1 } });
  const info = r.mesh;
  const n = info.positions.length / 3;
  const vec = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { vec[3 * i] = 1; vec[3 * i + 2] = info.positions[3 * i] / 20; }
  const arrows = nodalArrows(info, vec, { count: 60 });
  assert.ok(arrows.length > 20 && arrows.length <= 60, `arrows ${arrows.length}`);
  const surf = new Set(surfaceNodes(info));
  assert.ok(arrows.every((a) => a.m > 0 && a.d[0] === 1));
  // On a section plane only nodes within the band.
  const plane = sectionPlane(meshBox(info), { axis: 'x', offset: 0.5 });
  const onPlane = nodalArrows(info, vec, { count: 50, plane, band: 1.2 });
  assert.ok(onPlane.length > 5 && onPlane.every((a) => Math.abs(a.p[0] - plane.at) <= 1.2 + 1e-6));
  assert.ok(surf.size < n);
  const values = Float32Array.from({ length: n }, (_, i) => info.positions[3 * i]);
  const v = valueAt(info, values, [20, 20, 5]);
  assert.ok(Math.abs(v.value - 20) < 1e-6 && v.distance < 1e-6);
});

test('flow grid arrows and planes at a chosen offset', () => {
  const dims = [4, 3, 2];
  const nc = 24;
  const fluid = { dims, origin: [0, 0, 0], cellSize: 1, cells: new Uint16Array(nc), fields: { ux: new Float32Array(nc).fill(2), uy: new Float32Array(nc), uz: new Float32Array(nc), speed: Float32Array.from({ length: nc }, (_, i) => i) } };
  const arrows = gridArrows(fluid, { axis: 2, offset: 0.9, count: 100 });
  assert.equal(arrows.length, 12);
  assert.ok(arrows.every((a) => a.p[2] === 1.5 && a.d[0] === 2));
  const [sl] = fluidSlices(fluid, 'speed', [0], 0.6);
  assert.equal(sl.axis, 0);
  assert.equal(sl.at, 2.5);
  assert.deepEqual(sl.size, [3, 2]);
});

test('booleans: a body minus a tool body meshes as one body with less volume', () => {
  const p = createProject('b');
  const plate = addBody(p, 'box', { params: { width: 40, depth: 40, height: 10 } });
  const pin = addBody(p, 'cylinder', { params: { radius: 8, height: 30 } });
  plate.ops = [{ op: 'subtract', tool: pin.id }];
  pin.tool = true;
  const sys = addSystem(p, 'static');
  const job = buildJob(p, sys);
  assert.equal(job.bodies.length, 1, 'the tool is not meshed on its own');
  assert.equal(job.bodies[0].shape.type, 'subtract');
  const box = nodeBox(bodyNode(plate, p));
  assert.deepEqual(box[0].map(Math.round), [-20, -20, -5]);
  const m = meshOf(job);
  assert.equal(m.bodies.length, 1);
  const vol = 16000 - Math.PI * 64 * 10;
  assert.ok(Math.abs(meshVolume(m) - vol) / vol < 0.05, `volume ${meshVolume(m)} vs ${vol}`);
  // Intersection and union.
  plate.ops = [{ op: 'intersect', tool: pin.id }];
  const vi = Math.PI * 64 * 10;
  const mi = meshVolume(meshOf(buildJob(p, sys)));
  assert.ok(Math.abs(mi - vi) / vi < 0.1, `intersection ${mi} vs ${vi}`);
  plate.ops = [{ op: 'union', tool: pin.id }];
  const vu = 16000 + Math.PI * 64 * 20;
  const mu = meshVolume(meshOf(buildJob(p, sys)));
  assert.ok(Math.abs(mu - vu) / vu < 0.05, `union ${mu} vs ${vu}`);
});

test('profile bodies: an extruded polygon and a revolved section', () => {
  const p = createProject('pr');
  const ex = addBody(p, 'profileExtrude', { params: { height: 20 } });
  assert.deepEqual(ex.profile, DEFAULT_PROFILES.xy);
  ex.profile = [[0, 0], [30, 0], [30, 20], [0, 20]];
  const sys = addSystem(p, 'modal');
  const ve = meshVolume(meshOf(buildJob(p, sys)));
  assert.ok(Math.abs(ve - 12000) / 12000 < 0.03, `extrusion volume ${ve}`);
  const p2 = createProject('rv');
  const rv = addBody(p2, 'profileRevolve');
  rv.profile = [[0, 0], [10, 0], [10, 20], [0, 20]];
  const v2 = meshVolume(meshOf(buildJob(p2, addSystem(p2, 'modal'))));
  const vc = Math.PI * 100 * 20;
  assert.ok(Math.abs(v2 - vc) / vc < 0.05, `revolution volume ${v2} vs ${vc}`);
  // Profile helpers.
  assert.equal(polygonArea([[0, 0], [2, 0], [2, 1], [0, 1]]), 2);
  assert.equal(selfIntersects([[0, 0], [2, 2], [2, 0], [0, 2]]), true);
  assert.equal(selfIntersects(DEFAULT_PROFILES.xy), false);
  assert.equal(cleanProfile([[0, 0], [1, 0], [1, 0], [1, 1], [0, 0]]).length, 3);
});

test('conditional fields and the inlet direction vector', () => {
  const inlet = BCS.inlet;
  const speed = inlet.fields.find((f) => f.key === 'speed');
  const vector = inlet.fields.find((f) => f.key === 'vector');
  assert.equal(fieldShown(speed, { useVector: false }), true);
  assert.equal(fieldShown(vector, { useVector: false }), false);
  assert.equal(fieldShown(vector, { useVector: true }), true);
  assert.equal(fieldShown({ if: 'combination=cqc' }, { combination: 'cqc' }), true);
  assert.equal(fieldShown({ if: 'combination=cqc' }, { combination: 'srss' }), false);
  const p = createProject('f');
  addBody(p, 'duct');
  const sys = addSystem(p, 'fluid');
  const bc = addBc(sys, 'inlet', { faces: [] });
  assert.equal('vector' in buildJob(p, sys).bcs[0], false, 'speed only: no vector');
  bc.useVector = true;
  bc.vector = [0, 2, 0];
  const job = buildJob(p, sys).bcs[0];
  assert.deepEqual(job.vector, [0, 2, 0]);
  assert.equal('useVector' in job, false);
});

test('probe histories for every probe', () => {
  const job = {
    analysis: 'transient', unit: 0.001,
    bodies: [{ id: 'b', material: 'steel', shape: { type: 'box', size: [100, 10, 10], placement: { position: [50, 0, 0] } } }],
    mesh: { size: 5, order: 1 },
    bcs: [{ type: 'fixed', faces: [{ body: 'b', c: [0, 0, 0], n: [-1, 0, 0], a: 100 }] }, { type: 'force', vector: [0, 0, -100], faces: [{ body: 'b', c: [100, 0, 0], n: [1, 0, 0], a: 100 }] }],
    settings: { endTime: 0.005, steps: 20 },
    probes: [[100, 0, 5], [50, 0, 5], [25, 0, 5]],
  };
  const r = solve(job);
  assert.equal(r.transient.probes.length, 3);
  const last = (q) => Math.abs(q.history[2].at(-1));
  assert.ok(last(r.transient.probes[0]) > last(r.transient.probes[1]) && last(r.transient.probes[1]) > last(r.transient.probes[2]));
});
