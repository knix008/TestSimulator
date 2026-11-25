// Linear static FEA (voxel hexahedra) against beam theory and a bar in tension.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse, stressColor, elementStiffness, elementConduction, thermal, modal, temperatureColor, THERMAL, THERMAL_GENERIC, thermalProperties } from '../../src/cad/fea.js';
import { MATERIALS } from '../../src/cad/materials.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };
const within = (value, expected, rel, what) => assert.ok(Math.abs(value - expected) <= rel * Math.abs(expected), `${what}: ${value} vs ${expected} (±${rel * 100}%)`);

/**
 * Box [0,L]×[0,W]×[0,H] meshed like body.mesh(): each face its own faceGroup (start/count in index entries),
 * split into div×div quads, triangles counter-clockwise seen from outside.
 * Face ids: 0 x=0, 1 x=L, 2 y=0, 3 y=W, 4 z=0, 5 z=H.
 */
function boxMesh(L, W, H, div = 1) {
  const vertices = [], triangles = [], faceGroups = [];
  const faces = [   // origin, a, b with a × b pointing outwards
    [[0, 0, 0], [0, 0, H], [0, W, 0], 0],
    [[L, 0, 0], [0, W, 0], [0, 0, H], 1],
    [[0, 0, 0], [L, 0, 0], [0, 0, H], 2],
    [[0, W, 0], [0, 0, H], [L, 0, 0], 3],
    [[0, 0, 0], [0, W, 0], [L, 0, 0], 4],
    [[0, 0, H], [L, 0, 0], [0, W, 0], 5],
  ];
  for (const [org, a, b, faceId] of faces) {
    const base = vertices.length / 3, start = triangles.length;
    for (let j = 0; j <= div; j++) for (let i = 0; i <= div; i++) vertices.push(...org.map((o, c) => o + (a[c] * i) / div + (b[c] * j) / div));
    for (let j = 0; j < div; j++) for (let i = 0; i < div; i++) {
      const p = base + j * (div + 1) + i;
      triangles.push(p, p + 1, p + div + 2, p, p + div + 2, p + div + 1);
    }
    faceGroups.push({ start, count: triangles.length - start, faceId });
  }
  return { vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles), faceGroups };
}

test('the test box winds outwards (signed volume = L·W·H)', () => {
  const m = boxMesh(100, 10, 10, 3);
  let vol = 0;
  const V = m.vertices, T = m.triangles;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [3 * T[t], 3 * T[t + 1], 3 * T[t + 2]];
    vol += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6;
  }
  assert.ok(Math.abs(vol - 10000) < 1e-6, `${vol}`);
});

test('element stiffness is symmetric and has six rigid-body modes', () => {
  const K = elementStiffness(210000, 0.3, 2);
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) assert.ok(Math.abs(K[i * 24 + j] - K[j * 24 + i]) < 1e-6);
  const translate = Array.from({ length: 24 }, (_, d) => (d % 3 === 0 ? 1 : 0));
  for (let i = 0; i < 24; i++) assert.ok(Math.abs(translate.reduce((s, x, j) => s + K[i * 24 + j] * x, 0)) < 1e-6);
});

test('cantilever 100×10×10 steel, 100 N tip load: deflection and root bending stress', () => {
  const t0 = performance.now();
  const res = analyse(boxMesh(100, 10, 10, 4), { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -100] }], mesher: 'voxel', resolution: 100 });
  const ms = performance.now() - t0;
  assert.equal(res.ok, true, res.error);
  assert.equal(res.elements, 10000);
  const I = (10 * 10 ** 3) / 12, G = STEEL.E / (2 * (1 + STEEL.nu));
  const bending = (100 * 100 ** 3) / (3 * STEEL.E * I), shear = (100 * 100) / ((5 / 6) * G * 100);   // 0.1905 + 0.0015 mm
  // tip node displacement (vertical) at the centre of the loaded end
  let tip = 0;
  for (let n = 0; n < res.nodes.length / 3; n++) if (res.nodes[3 * n] === 100 && res.nodes[3 * n + 1] === 5 && res.nodes[3 * n + 2] === 5) tip = res.displacement[3 * n + 2];
  console.log(`cantilever: tip ${(-tip).toFixed(4)} mm (beam theory ${(bending + shear).toFixed(4)}), max σvm ${res.maxStress.toFixed(2)} MPa at x=${res.maxStressAt[0]} (Mc/I = 60), ${res.iterations} CG iterations, ${ms.toFixed(0)} ms`);
  within(-tip, bending + shear, 0.15, 'tip deflection');
  within(res.maxDisplacement, bending + shear, 0.15, 'max displacement');
  assert.ok(res.maxDisplacementAt[0] === 100);
  // bending stress M·c/I = 100·100·5/I = 60 MPa at the root; voxel corners at the clamp add a local peak
  within(res.maxStress, 60, 0.25, 'max stress');
  assert.ok(res.maxStressAt[0] <= 10, 'max stress near the root');
  within(res.minFactorOfSafety, 250 / 60, 0.25, 'factor of safety');
  // the tip vertices of the input mesh moved with the beam
  const V = boxMesh(100, 10, 10, 4).vertices;
  for (let v = 0; v < V.length / 3; v++) if (V[3 * v] === 100) within(-res.vertexDisplacement[3 * v + 2], bending + shear, 0.15, 'vertex displacement');
});

test('bar in tension: stress F/A, uniform away from the clamp; elongation F·L/(E·A)', () => {
  const mesh = boxMesh(100, 10, 10, 10);
  const res = analyse(mesh, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [1000, 0, 0] }], mesher: 'voxel', resolution: 50 });
  assert.equal(res.ok, true, res.error);
  const V = mesh.vertices, mid = [];
  for (let v = 0; v < V.length / 3; v++) if (V[3 * v] >= 30 && V[3 * v] <= 70) mid.push(res.vertexStress[v]);
  const lo = Math.min(...mid), hi = Math.max(...mid);
  console.log(`bar: σvm mid-span ${lo.toFixed(3)}…${hi.toFixed(3)} MPa (F/A = 10), elongation ${res.maxDisplacement.toFixed(5)} mm (FL/EA = 0.00476)`);
  within(lo, 10, 0.05, 'mid-span stress min');
  within(hi, 10, 0.05, 'mid-span stress max');
  within(res.maxDisplacement, (1000 * 100) / (STEEL.E * 100), 0.1, 'elongation');
});

test('a pressure on the end face equals the force p·A along the inward normal', () => {
  const mesh = boxMesh(50, 10, 10, 2);
  const byForce = analyse(mesh, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [-500, 0, 0] }], mesher: 'voxel', resolution: 25 });
  const byPressure = analyse(mesh, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, pressure: 5 }], mesher: 'voxel', resolution: 25 });
  assert.equal(byPressure.ok, true);
  // the end face's mean shortening is the same (a pressure is spread by area, a force equally per node)
  const mean = (r) => { let s = 0, k = 0; for (let n = 0; n < r.nodes.length / 3; n++) if (r.nodes[3 * n] === 50) { s += r.displacement[3 * n]; k++; } return s / k; };
  assert.ok(mean(byPressure) < 0, 'pushed inwards');
  within(mean(byPressure), mean(byForce), 0.03, 'end-face shortening');
  within(byPressure.maxStress, 5, 0.1, 'σ = p');
});

test('self-weight of a cantilever: q·L⁴/(8·E·I) with q = ρ·g·A', () => {
  const res = analyse(boxMesh(100, 10, 10), { material: STEEL, fixtures: [0], loads: [], gravity: [0, 0, -9.81], mesher: 'voxel', resolution: 50 });
  assert.equal(res.ok, true, res.error);
  const q = STEEL.density * 9.81 * 1e-9 * 100, I = (10 * 10 ** 3) / 12;
  const expected = (q * 100 ** 4) / (8 * STEEL.E * I);
  console.log(`self-weight: max ${res.maxDisplacement.toExponential(3)} mm (theory ${expected.toExponential(3)})`);
  within(res.maxDisplacement, expected, 0.2, 'self-weight deflection');
});

test('missing fixtures, missing loads and empty meshes are reported', () => {
  const mesh = boxMesh(10, 10, 10);
  assert.equal(analyse(mesh, { material: STEEL, fixtures: [], loads: [{ faceId: 1, force: [1, 0, 0] }] }).error, 'no-fixtures');
  assert.equal(analyse(mesh, { material: STEEL, fixtures: [99], loads: [{ faceId: 1, force: [1, 0, 0] }] }).error, 'no-fixtures');
  assert.equal(analyse(mesh, { material: STEEL, fixtures: [0], loads: [] }).error, 'no-loads');
  assert.equal(analyse(mesh, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [0, 0, 0] }] }).error, 'no-loads');
  assert.equal(analyse({ vertices: [], triangles: [], faceGroups: [] }, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [1, 0, 0] }] }).error, 'empty');
  const r = analyse(mesh, { material: STEEL, fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -100] }], mesher: 'voxel', resolution: 8, maxIter: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'not-converged');
});

test('stressColor runs blue → green → red', () => {
  assert.deepEqual(stressColor(0, 0, 10), [0, 0, 1]);
  assert.deepEqual(stressColor(10, 0, 10), [1, 0, 0]);
  assert.deepEqual(stressColor(5, 0, 10), [0, 1, 0]);
  assert.deepEqual(stressColor(-3, 0, 10), [0, 0, 1]);
  assert.deepEqual(stressColor(30, 0, 10), [1, 0, 0]);
  assert.deepEqual(stressColor(4, 4, 4), [0, 0, 1]);
  for (let v = 0; v <= 10; v += 0.5) for (const c of stressColor(v, 0, 10)) assert.ok(c >= 0 && c <= 1);
});

// ───────────────────────── steady-state heat conduction (mm, W, °C; k in W/(m·K) → ×1e-3 W/(mm·K))

const K1020 = THERMAL['steel-1020'].k * 1e-3;   // W/(mm·K)

test('thermal properties cover every material id; objects and unknown ids fall back sensibly', () => {
  for (const m of MATERIALS) {
    // From the table, or the library material's own values (materials-more.js).
    const t = thermalProperties(m.id);
    assert.ok(t !== THERMAL_GENERIC && t.k > 0 && t.cp > 0, `thermal data for ${m.id}`);
  }
  assert.equal(thermalProperties('steel-1020').k, 51.9);
  assert.equal(thermalProperties({ k: 12 }).k, 12);
  assert.equal(thermalProperties({ id: 'copper' }).k, THERMAL.copper.k);
  assert.deepEqual(thermalProperties('unobtainium'), THERMAL_GENERIC);
  const K = elementConduction(1, 2);
  for (let a = 0; a < 8; a++) {
    let s = 0;
    for (let b = 0; b < 8; b++) { s += K[a * 8 + b]; assert.ok(Math.abs(K[a * 8 + b] - K[b * 8 + a]) < 1e-12); }
    assert.ok(Math.abs(s) < 1e-12, 'a constant field carries no heat');
  }
});

test('bar 100×10×10, 100 °C / 0 °C ends: linear profile and heat flow k·A·ΔT/L', () => {
  const mesh = boxMesh(100, 10, 10, 4), t0 = performance.now();
  const res = thermal(mesh, { material: 'steel-1020', temperatures: [{ faceId: 0, value: 100 }, { faceId: 1, value: 0 }], mesher: 'voxel', resolution: 50 });
  const ms = performance.now() - t0;
  assert.equal(res.ok, true, res.error);
  const Q = (K1020 * 100 * 100) / 100;                                 // 5.19 W
  let mid = 0, k = 0;
  for (let n = 0; n < res.nodes.length / 3; n++) if (res.nodes[3 * n] === 50) { mid += res.nodeTemperature[n]; k++; }
  mid /= k;
  const [hot, cold] = res.faceHeatFlow;
  console.log(`thermal bar: mid ${mid.toFixed(3)} °C (50), out through the cold end ${cold.value.toFixed(4)} W, in at the hot end ${(-hot.value).toFixed(4)} W (kAΔT/L = ${Q.toFixed(4)}), ${res.elements} elements, ${res.iterations} CG iterations, ${ms.toFixed(0)} ms`);
  assert.ok(Math.abs(mid - 50) <= 2, `mid ${mid}`);
  within(cold.value, Q, 0.1, 'heat out at the cold end');
  within(-hot.value, Q, 0.1, 'heat in at the hot end');
  within(res.heatFlowOut, Q, 0.1, 'heatFlowOut');
  within(res.heatFlowIn, Q, 0.1, 'heatFlowIn');
  assert.ok(Math.abs(res.min) < 1e-6 && Math.abs(res.max - 100) < 1e-6);
  assert.equal(res.minAt[0], 100);
  assert.equal(res.maxAt[0], 0);
  const V = mesh.vertices;
  assert.equal(res.vertexTemperature.length, V.length / 3);
  for (let v = 0; v < V.length / 3; v++) assert.ok(Math.abs(res.vertexTemperature[v] - 100 * (1 - V[3 * v] / 100)) <= 2, `vertex at x=${V[3 * v]}: ${res.vertexTemperature[v]}`);
});

test('bar with 20 °C at one end and 5 W into the other: ΔT = P·L/(k·A)', () => {
  const res = thermal(boxMesh(100, 10, 10, 4), { material: { k: 51.9 }, temperatures: [{ faceId: 0, value: 20 }], fluxes: [{ faceId: 1, power: 5 }], mesher: 'voxel', resolution: 50 });
  assert.equal(res.ok, true, res.error);
  const dT = (5 * 100) / (K1020 * 100);                               // 96.34 °C
  console.log(`thermal flux: hot end ${res.max.toFixed(3)} °C (20 + ${dT.toFixed(3)}), heat out ${res.heatFlowOut.toFixed(5)} W of ${res.fluxIn} W`);
  within(res.max - 20, dT, 0.1, 'temperature rise');
  assert.equal(res.maxAt[0], 100);
  within(res.min, 20, 1e-9, 'fixed end');
  within(res.heatFlowOut, 5, 0.01, 'all the power leaves through the fixed face');
});

test('convection-cooled fin (80 °C root, h = 25 W/m²K into 20 °C air): fin theory, bounds and heat balance', () => {
  const k = THERMAL['al-6061'].k * 1e-3, h = 25e-6, P = 40, A = 100, L = 100;
  const res = thermal(boxMesh(L, 10, 10, 4), { material: 'al-6061', temperatures: [{ faceId: 0, value: 80 }], convections: [1, 2, 3, 4, 5].map((faceId) => ({ faceId, h: 25, ambient: 20 })), mesher: 'voxel', resolution: 50 });
  assert.equal(res.ok, true, res.error);
  // 1-D fin with a convecting tip (Incropera, Fundamentals of Heat and Mass Transfer, Table 3.4 case A)
  const m = Math.sqrt((h * P) / (k * A)), r = h / (m * k), mL = m * L;
  const q = Math.sqrt(h * P * k * A) * 60 * ((Math.sinh(mL) + r * Math.cosh(mL)) / (Math.cosh(mL) + r * Math.sinh(mL)));
  const tip = 20 + 60 / (Math.cosh(mL) + r * Math.sinh(mL));
  console.log(`fin: root heat ${res.heatFlowIn.toFixed(4)} W (fin theory ${q.toFixed(4)}), convected ${res.convectionOut.toFixed(4)} W, tip ${res.min.toFixed(3)} °C (theory ${tip.toFixed(3)})`);
  assert.ok(res.min >= 20 && res.max <= 80 + 1e-9, `${res.min}…${res.max}`);
  for (const t of res.vertexTemperature) assert.ok(t >= 20 && t <= 80 + 1e-4);
  within(res.heatFlowIn, q, 0.05, 'root heat flow vs fin theory');
  within(res.min, tip, 0.02, 'tip temperature');
  within(res.convectionOut, res.heatFlowIn, 1e-4, 'heat balance');
});

test('convection only: a 2 W heater on one end, every other face cooled — heat balance, above ambient', () => {
  const res = thermal(boxMesh(50, 20, 10, 2), { material: 'copper', fluxes: [{ faceId: 0, power: 2 }], convections: [1, 2, 3, 4, 5].map((faceId) => ({ faceId, h: 10, ambient: 25 })), mesher: 'voxel', resolution: 25 });
  assert.equal(res.ok, true, res.error);
  // copper is nearly isothermal: T ≈ ambient + P / (h·A_cooled)
  const area = 20 * 10 + 2 * 50 * 10 + 2 * 50 * 20, lumped = 25 + 2 / (10e-6 * area);
  console.log(`convection only: ${res.min.toFixed(3)}…${res.max.toFixed(3)} °C (lumped ${lumped.toFixed(3)}), convected ${res.convectionOut.toFixed(5)} W`);
  assert.ok(res.min > 25);
  within(res.convectionOut, 2, 1e-3, 'all power convected away');
  within(res.max, lumped, 0.05, 'lumped temperature');
  assert.equal(res.faceHeatFlow.length, 0);
});

test('thermal errors: no temperature or convection, empty mesh, not converged', () => {
  const mesh = boxMesh(10, 10, 10);
  assert.equal(thermal(mesh, { material: 'steel-1020', fluxes: [{ faceId: 1, power: 1 }] }).error, 'no-temperature');
  assert.equal(thermal(mesh, { material: 'steel-1020', temperatures: [{ faceId: 99, value: 1 }] }).error, 'no-temperature');
  assert.equal(thermal({ vertices: [], triangles: [], faceGroups: [] }, { temperatures: [{ faceId: 0, value: 1 }] }).error, 'empty');
  const r = thermal(boxMesh(100, 10, 10), { material: 'steel-1020', temperatures: [{ faceId: 0, value: 100 }], fluxes: [{ faceId: 1, power: 1 }], mesher: 'voxel', resolution: 20, maxIter: 1, precond: false });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'not-converged');
});

test('temperatureColor uses the result legend', () => {
  assert.deepEqual(temperatureColor(20, 20, 80), [0, 0, 1]);
  assert.deepEqual(temperatureColor(80, 20, 80), [1, 0, 0]);
  assert.deepEqual(temperatureColor(50, 20, 80), [0, 1, 0]);
});

// ───────────────────────── natural frequencies (mm, N, MPa, t/mm³ → Hz)

const beamF1 = () => ((1.875 ** 2) / (2 * Math.PI)) * Math.sqrt((STEEL.E * ((10 * 10 ** 3) / 12)) / (STEEL.density * 1e-12 * 100 * 100 ** 4));   // 835.4 Hz

test('steel cantilever 100×10×10: first two bending modes vs Euler–Bernoulli', () => {
  const mesh = boxMesh(100, 10, 10, 4), t0 = performance.now();
  const res = modal(mesh, { material: STEEL, fixtures: [0], modes: 4, mesher: 'voxel', resolution: 50 });
  const ms = performance.now() - t0;
  assert.equal(res.ok, true, res.error);
  const f1 = beamF1(), f3 = f1 * (4.694 / 1.875) ** 2;                  // second bending pair
  console.log(`modal: ${res.frequencies.map((f) => f.toFixed(1)).join(', ')} Hz (beam ${f1.toFixed(1)}, ${f1.toFixed(1)}, ${f3.toFixed(1)}, ${f3.toFixed(1)}), ${res.elements} elements, ${res.iterations} subspace iterations, ${res.solverIterations} CG iterations, ${ms.toFixed(0)} ms`);
  assert.equal(res.frequencies.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(res.frequencies[i] >= res.frequencies[i - 1], 'ascending');
  within(res.frequencies[0], f1, 0.15, 'first bending');
  within(res.frequencies[1], f1, 0.15, 'first bending, other direction');
  within(res.frequencies[1], res.frequencies[0], 0.01, 'square section: equal pair');
  within(res.frequencies[2], f3, 0.15, 'second bending');
  // the two lowest modes bend sideways (y–z plane) in perpendicular directions, the tip moving most
  const V = mesh.vertices, dirs = [];
  for (const mode of res.modes.slice(0, 2)) {
    assert.equal(mode.length, V.length);
    let big = 0, tip = [0, 0, 0];
    for (let v = 0; v < V.length / 3; v++) {
      const m = Math.hypot(mode[3 * v], mode[3 * v + 1], mode[3 * v + 2]);
      big = Math.max(big, m);
      if (V[3 * v] === 100 && V[3 * v + 1] === 5 && V[3 * v + 2] === 5) tip = [mode[3 * v], mode[3 * v + 1], mode[3 * v + 2]];
      if (V[3 * v] === 0) assert.ok(m < 1e-6, 'clamped end does not move');
    }
    within(big, 1, 1e-6, 'normalized to max |u| = 1');
    const t = Math.hypot(...tip);
    assert.ok(t > 0.95, `tip moves most (${t})`);
    assert.ok(Math.abs(tip[0]) < 0.05 * t, 'bending, not axial');
    dirs.push(tip.map((x) => x / t));
  }
  const cos = dirs[0][1] * dirs[1][1] + dirs[0][2] * dirs[1][2];
  assert.ok(Math.abs(cos) < 0.1, `the pair bends in perpendicular directions (cos ${cos})`);
});

test('modal at ~5k elements: fast, and refined toward beam theory', () => {
  const t0 = performance.now();
  const res = modal(boxMesh(100, 10, 10, 4), { material: STEEL, fixtures: [0], modes: 4, mesher: 'voxel', resolution: 80 });
  const ms = performance.now() - t0;
  assert.equal(res.ok, true, res.error);
  console.log(`modal 5k: ${res.elements} elements, f1 ${res.frequencies[0].toFixed(2)} Hz (beam ${beamF1().toFixed(2)}), ${res.iterations} subspace / ${res.solverIterations} CG iterations, ${ms.toFixed(0)} ms`);
  assert.equal(res.elements, 5120);
  within(res.frequencies[0], beamF1(), 0.03, 'first bending at h = 1.25 mm');
  assert.ok(ms < 15000, `${ms} ms`);
});

test('multigrid and Jacobi preconditioning give the same frequencies (plate fixed on one edge)', () => {
  const mesh = boxMesh(60, 40, 4, 3);
  const mg = modal(mesh, { material: STEEL, fixtures: [0], mesher: 'voxel', resolution: 30 });
  const jac = modal(mesh, { material: STEEL, fixtures: [0], mesher: 'voxel', resolution: 30, precond: false });
  assert.equal(mg.ok, true, mg.error);
  assert.equal(jac.ok, true, jac.error);
  for (let i = 0; i < 4; i++) within(mg.frequencies[i], jac.frequencies[i], 1e-4, `mode ${i + 1}`);
  assert.ok(mg.solverIterations < jac.solverIterations / 5, `${mg.solverIterations} vs ${jac.solverIterations} CG iterations`);
});

test('modal errors: no fixtures, unmatched fixtures, empty mesh, not converged', () => {
  const mesh = boxMesh(10, 10, 10);
  assert.equal(modal(mesh, { material: STEEL, fixtures: [] }).error, 'no-fixtures');
  assert.equal(modal(mesh, { material: STEEL, fixtures: [99] }).error, 'no-fixtures');
  assert.equal(modal({ vertices: [], triangles: [], faceGroups: [] }, { material: STEEL, fixtures: [0] }).error, 'empty');
  const r = modal(boxMesh(100, 10, 10), { material: STEEL, fixtures: [0], mesher: 'voxel', resolution: 20, maxIter: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'not-converged');
  assert.equal(r.frequencies.length, 4, 'best estimates are still returned');
});
