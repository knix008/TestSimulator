// FreeCAD FEM analysis: elasticity against beam theory, heat conduction,
// electrostatics, static current, thermal strain, pressure, springs, the
// post-processing filters, 1D pipe flow and the solver input decks.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMesh, dataAlongLine, histogram, isoSurface, linearizedStresses, nodalValues, normalizeAnalysis, pipeNetwork, quadsOf, solveAnalysis, surfaceOf,
  toCalculixDeck, toElmer, toMystran, toZ88, valueAt, calculatorField, functionValue,
} from '../../src/domain/femx.js';
import { normalizeSolidData, solidMesh } from '../../src/domain/solids.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} vs ${b}`);
const bar = (l = 100, w = 10, h = 10) => solidMesh(normalizeSolidData({ type: 'solid', kind: 'box', params: { length: l, width: w, height: h } }));
const analysis = (extra) => normalizeAnalysis({ solid: 's', resolution: 20, material: { E: 210000, nu: 0.3, density: 7850, k: 50, alpha: 1.2e-5, eps: 1, sigma: 5.8e7 }, ...extra });

test('elasticity: a cantilever bends like the beam formula; reactions balance the load', () => {
  const r = solveAnalysis(bar(), analysis({ constraints: [{ type: 'fixed', faces: [{ box: 'xmin' }] }, { type: 'force', faces: [{ box: 'xmax' }], params: { fz: -100 } }], equations: ['elasticity'] }));
  assert.equal(r.ok, true);
  const beam = (100 * 100 ** 3) / (3 * 210000 * (10 * 10 ** 3) / 12);
  near(r.report.maxDisplacement, beam, 0.12);
  near(r.report.reaction[2], 100, 1e-6);
  // Bricks report their stress at their centres: about half the root's surface stress (60 MPa) on a 2-brick-high beam.
  assert.ok(r.report.maxVm > 20 && r.report.maxVm < 70, `${r.report.maxVm}`);
});

test('pressure equals the same total force; a spring support carries the load', () => {
  const force = solveAnalysis(bar(), analysis({ constraints: [{ type: 'fixed', faces: [{ box: 'xmin' }] }, { type: 'force', faces: [{ box: 'xmax' }], params: { fx: 1000 } }], equations: ['elasticity'] }));
  const press = solveAnalysis(bar(), analysis({ constraints: [{ type: 'fixed', faces: [{ box: 'xmin' }] }, { type: 'pressure', faces: [{ box: 'xmax' }], params: { pressure: -10 } }], equations: ['elasticity'] }));
  near(press.report.maxDisplacement, force.report.maxDisplacement, 1e-3);
  near(force.report.maxDisplacement, (1000 * 100) / (210000 * 100), 0.05);
  const sprung = solveAnalysis(bar(), analysis({ constraints: [{ type: 'spring', faces: [{ box: 'xmin' }], params: { normal: 1000, tangential: 1000 } }, { type: 'force', faces: [{ box: 'xmax' }], params: { fx: 10 } }], equations: ['elasticity'] }));
  assert.equal(sprung.ok, true);
  assert.ok(sprung.report.maxDisplacement > 0.009, 'the spring gives: 10 N / 1000 N/mm');
});

test('heat: a bar between 300 K and 400 K is linear in between, with k ΔT / L flux', () => {
  const r = solveAnalysis(bar(), analysis({ equations: ['heat'], constraints: [{ type: 'temperature', faces: [{ box: 'xmin' }], params: { value: 300 } }, { type: 'temperature', faces: [{ box: 'xmax' }], params: { value: 400 } }] }));
  near(valueAt(r, 'temperature', [50, 5, 5]), 350, 1e-6);
  near(Math.max(...r.fields.heatFlux.values), (50 * 100) / 0.1, 1e-6);
  const heated = solveAnalysis(bar(), analysis({ equations: ['heat', 'elasticity'], constraints: [{ type: 'fixed', faces: [{ box: 'xmin' }] }, { type: 'temperature', faces: [{ box: 'xmin' }], params: { value: 393.15 } }, { type: 'temperature', faces: [{ box: 'xmax' }], params: { value: 393.15 } }, { type: 'initialTemperature', faces: [], params: { value: 293.15 } }] }));
  near(heated.report.maxDisplacement, 1.2e-5 * 100 * 100, 0.06);
});

test('electrostatics and current: a plate capacitor has V/d; a conductor carries σ A V / L', () => {
  const r = solveAnalysis(bar(10, 10, 2), analysis({ equations: ['electrostatic', 'electricforce'], constraints: [{ type: 'electrostaticPotential', faces: [{ box: 'zmin' }], params: { value: 0 } }, { type: 'electrostaticPotential', faces: [{ box: 'zmax' }], params: { value: 100 } }] }));
  near(Math.max(...r.fields.electricField.values), 100 / 0.002, 1e-6);
  assert.ok(Math.abs(r.report.electricForce[2]) > 0);
  const c = solveAnalysis(bar(100, 10, 10), analysis({ equations: ['staticCurrent'], material: { sigma: 1e6 }, constraints: [{ type: 'electrostaticPotential', faces: [{ box: 'xmin' }], params: { value: 0 } }, { type: 'electrostaticPotential', faces: [{ box: 'xmax' }], params: { value: 1 } }] }));
  near(c.report.current, 1e6 * 1e-4 * 1 / 0.1, 0.02);
});

test('meshing, faces and post-processing: picked faces, iso-surface, histogram, line data, linearization, calculator', () => {
  const mesh = buildMesh(bar(), analysis({ resolution: 10 }));
  assert.equal(mesh.elements.length, 10 * 1 * 1 * 1 || mesh.elements.length);
  const top = quadsOf(mesh, [{ signature: { center: [50, 5, 10], normal: [0, 0, 1], area: 1000 } }]);
  assert.ok(top.length > 0 && top.every((q) => q.normal[2] === 1));
  const r = solveAnalysis(bar(), analysis({ constraints: [{ type: 'fixed', faces: [{ box: 'xmin' }] }, { type: 'force', faces: [{ box: 'xmax' }], params: { fz: -100 } }], equations: ['elasticity'] }));
  const vm = nodalValues(r, 'vm');
  assert.equal(vm.length, r.mesh.nodes.length);
  const iso = isoSurface(r, vm, Math.max(...vm) / 2);
  assert.ok(iso.tris.length > 0);
  const counts = histogram(r.fields.vm.values, 8);
  assert.equal(counts.reduce((s, b) => s + b.count, 0), r.fields.vm.values.length);
  const line = dataAlongLine(r, 'displacement', [0, 5, 5], [100, 5, 5], 10);
  assert.ok(line.at(-1).value > line[0].value);
  const lin = linearizedStresses(r, [20, 5, 0.01], [20, 5, 9.99]);
  assert.ok(lin.bending > lin.membrane, 'a bent beam: bending dominates');
  const doubled = calculatorField(r, 'displacement*2', ['displacement']);
  near(Math.max(...doubled), 2 * r.report.maxDisplacement, 1e-9);
  const surf = surfaceOf(r, () => true, (e) => r.fields.vm.values[e], { warp: 100 });
  assert.equal(surf.tris.length, surf.values.length);
  assert.ok(functionValue({ type: 'sphere', params: { cx: 0, cy: 0, cz: 0, r: 5 } }, [1, 0, 0]) < 0);
});

test('1D pipe flow and the solver decks (CalculiX, Mystran, Z88, Elmer)', () => {
  const net = pipeNetwork([{ a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, d: 10 }], [[{ x: 0, y: 0 }, 0.1], [{ x: 1000, y: 0 }, 0]], 1e-3);
  near(net.flows[0], (Math.PI * 10 ** 4 * 0.1) / (128 * 1e-12 * 1000), 1e-9);
  const r = solveAnalysis(bar(), analysis({ resolution: 6, constraints: [{ type: 'fixed', faces: [{ box: 'xmin' }] }, { type: 'force', faces: [{ box: 'xmax' }], params: { fz: -100 } }], equations: ['elasticity'] }));
  assert.match(toCalculixDeck(r), /\*ELEMENT, TYPE=C3D8I[\s\S]*\*CLOAD/);
  const bdf = toMystran(r);
  assert.match(bdf, /^ID MYCAD,FEM/);
  assert.match(bdf, /CHEXA,1,1,/);
  assert.match(bdf, /SPC1,1,123456,/);
  assert.equal(toZ88(r).map((f) => f.name).join(' '), 'z88i1.txt z88i2.txt z88i5.txt z88mat.txt z88man.txt');
  const elmer = toElmer(r);
  assert.match(elmer.find((f) => f.name === 'case.sif').data, /Linear Elasticity[\s\S]*Displacement 1 = 0/);
  assert.match(elmer.find((f) => f.name === 'mesh.header').data, /^\d+ \d+ \d+\n2\n808/);
});
