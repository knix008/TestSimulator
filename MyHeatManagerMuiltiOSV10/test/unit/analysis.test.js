// Unit tests of the analysis helpers: DSC/TGA, reliability, compact models,
// isosurfaces, result post-processing, harmonic response, node maps, THERM helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCurveCsv, integratePeak, sampleDscCsv, sampleTgaCsv, glassTransition, derivative, smoothCurve, sigmoidBaseline, conversion,
  integratePeaks, kissinger, ozawaFlynnWall, tgaSteps, sapphireCp, sapphireCpAt, multiPointCalibration, sampleTgCurve, sampleKineticRuns,
  friedman, conversionAt, isoconversionalProfile,
  linearFit, calibration,
} from '../../src/core/thermalanalysis.js';
import { rainflow, miner, norrisLandzberg, engelmaier, steinberg, weibull, gamma, coffinManson, psdAt, randomVibration, halfSineShock } from '../../src/core/reliability.js';
import { jedecTwoResistor, heatSink, pcbStackup, powerMapBodies } from '../../src/core/compact.js';
import { marchingCubes, nodeValues } from '../../src/core/isosurface.js';
import { sampleLine, sampleLine3D, slice, bodyIntegrals, probesCsv, lineCsv } from '../../src/core/result.js';
import { harmonicResponse, responsePeaks, dominantAxis, pointTransmissibility } from '../../src/core/harmonic.js';
import { deltaMap, envelope, nodeStats, parseNodeCsv, sampleNodeCsv3d } from '../../src/core/heatmap.js';
import { cavityK, uFactorByTag } from '../../src/core/interop.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const rel = (a, b, tol, msg) => near(a, b, Math.abs(b) * tol, msg);

// ───────────────────────── DSC / TGA

test('derivative and smoothing of a quadratic are exact', () => {
  const T = Array.from({ length: 40 }, (_, i) => i * 0.5);
  const curve = { T, y: T.map((t) => 2 + 3 * t + 0.5 * t * t) };
  derivative(curve).forEach((p) => near(p.y, 3 + p.T, 1e-8));
  smoothCurve(curve).forEach((p, i) => near(p.y, curve.y[i], 1e-8));
  const fit = linearFit([0, 1, 2, 3], [1, 3, 5, 7]);
  near(fit.slope, 2, 1e-12); near(fit.intercept, 1, 1e-12); near(fit.r2, 1, 1e-12);
});

test('glass transition of a synthetic step', () => {
  const curve = sampleTgCurve({ Tg: 105, step: 0.12, width: 3, rate: 10, mass: 10 });
  const g = glassTransition(curve, 75, 135);
  near(g.midpoint, 105, 0.3, 'midpoint');
  near(g.inflection, 105, 0.3, 'inflection');
  // tanh step: tangent at the centre has slope step/(2·width) → onset/endset at Tg ∓ width.
  near(g.onset, 102, 0.5, 'onset');
  near(g.endset, 108, 0.5, 'endset');
  near(g.step, -0.12, 0.005, 'step');
  assert.equal(g.deltaCpUnit, 'J/gK');
  near(g.deltaCp, (-0.12 / 1000) / ((10 / 1000) * (10 / 60)), 0.005); // −0.072 J/gK
  const noisy = glassTransition(sampleTgCurve({ noise: 0.002 }), 75, 135);
  near(noisy.midpoint, 105, 1, 'noisy midpoint');
  assert.equal(glassTransition({ T: curve.T, y: curve.y }, 75, 135).deltaCpUnit, 'signal');
});

test('sigmoid baseline and conversion', () => {
  // A peak on a baseline that steps by 0.2 through the peak (cp change).
  const T = []; const y = [];
  for (let t = 0; t <= 100; t += 0.5) {
    const frac = 1 / (1 + Math.exp(-(t - 50) / 4));
    T.push(t);
    y.push(1 + 0.2 * frac + 3 * Math.exp(-((t - 50) ** 2) / 50));
  }
  const curve = { T, y };
  const base = sigmoidBaseline(curve, 20, 80, 3);
  assert.equal(base.length, T.length);
  near(base[T.indexOf(20)], 1, 0.02);
  near(base[T.indexOf(80)], 1.2, 0.02);
  const mid = base[T.indexOf(50)];
  assert.ok(mid > 1.05 && mid < 1.15, `blend at the peak ${mid}`);
  for (const kind of ['linear', 'sigmoid']) {
    const a = conversion(curve, 20, 80, kind);
    near(a[0].alpha, 0, 1e-12); near(a[a.length - 1].alpha, 1, 1e-12);
    if (kind === 'sigmoid') for (let i = 1; i < a.length; i++) assert.ok(a[i].alpha >= a[i - 1].alpha - 1e-3); // (a linear baseline under a cp step lies above the signal before the peak)
    near(a.find((p) => p.T === 50).alpha, 0.5, 0.03, kind);
  }
});

test('integratePeaks reuses integratePeak per range', () => {
  const curve = parseCurveCsv(sampleDscCsv());
  const [one, empty] = integratePeaks(curve, [{ T1: 20, T2: 52 }, { T1: 60, T2: 70 }], { mass: 8, rate: 10 });
  assert.deepEqual({ ...one, baseline: null }, { ...integratePeak(curve, { T1: 20, T2: 52, mass: 8, rate: 10 }), baseline: null, T1: 20, T2: 52 });
  rel(one.enthalpy, 180, 0.05);
  assert.ok(Math.abs(empty.enthalpy) < 2);
});

test('Kissinger and Ozawa–Flynn–Wall recover the activation energy', () => {
  const Ea = 80e3;
  const A = 1e9;
  const runs = sampleKineticRuns({ Ea, A, rates: [5, 10, 20] });
  assert.ok(runs[0].Tp < runs[1].Tp && runs[1].Tp < runs[2].Tp);
  const k = kissinger(runs.map((r) => ({ rate: r.rate, Tp: r.Tp })));
  rel(k.Ea, Ea, 0.03, 'Kissinger Ea');
  near(k.Ea_kJ, k.Ea / 1000, 1e-9);
  assert.ok(k.r2 > 0.999);
  assert.ok(k.A > A / 3 && k.A < A * 3, `A ${k.A}`);
  const o = ozawaFlynnWall(runs.map((r) => ({ rate: r.rate, T: r.alphaAt(0.5) })));
  rel(o.Ea, Ea, 0.08, 'OFW Ea');
  assert.throws(() => kissinger([{ rate: 10, Tp: 100 }]));
});

test('TGA steps of the sample curve', () => {
  const steps = tgaSteps(parseCurveCsv(sampleTgaCsv()));
  assert.equal(steps.length, 2);
  const [moist, decomp] = steps;
  near(moist.dtgPeakT, 100, 3); near(decomp.dtgPeakT, 420, 3);
  near(moist.massLossPct, 3, 0.5); near(decomp.massLossPct, 89, 1.5);
  // Logistic step: the inflection tangent meets the plateau 2·s before the centre (s = 8 and 15 K).
  near(moist.extrapolatedOnset, 84, 3); near(decomp.extrapolatedOnset, 390, 3);
  assert.ok(moist.Tend <= decomp.Tstart);
});

test('sapphire method recovers a known cp', () => {
  const T = []; for (let t = 30; t <= 300; t += 1) T.push(t);
  const beta = 20 / 60; // K/s
  const blank = { T, y: T.map((t) => 0.3 + 0.001 * t) };
  const sapphire = { T, y: T.map((t, i) => blank.y[i] + sapphireCpAt(t) * 25 * beta) }; // J/gK · mg · K/s = mW
  const cpSample = (t) => 1.2 + 0.002 * t;
  const sample = { T, y: T.map((t, i) => blank.y[i] + cpSample(t) * 10 * beta) };
  const { points, cpT } = sapphireCp({ blank, sapphire, sample, massSapphire: 25, massSample: 10 });
  assert.equal(points.length, T.length);
  points.forEach((p) => near(p.cp, cpSample(p.T), 1e-9));
  assert.ok(cpT.length <= 61);
  near(cpT[0][1], cpSample(30) * 1000, 0.1);
  near(sapphireCpAt(25), 0.775, 1e-9);
  near(sapphireCpAt(37.5), (0.775 + 0.8295) / 2, 1e-9);
});

test('multi-point calibration', () => {
  const cal = multiPointCalibration([{ name: 'In', measured: 157.6, reference: 156.6 }, { name: 'Sn', measured: 233.4, reference: 231.9 }, { name: 'Zn', measured: 421.9, reference: 419.5 }]);
  assert.ok(cal.r2 > 0.9999);
  near(cal.apply(157.6), 156.6, 0.1);
  near(cal.apply(421.9), 419.5, 0.1);
  const one = multiPointCalibration([{ measured: 158, reference: 156.6 }]);
  near(one.apply(100), 98.6, 1e-9);
  near(calibration('indium', 158, 28).offset, -1.4, 1e-9); // the single-point calibration still works
});

// ───────────────────────── reliability

test('rainflow reproduces the ASTM E1049 example', () => {
  const cycles = rainflow([-2, 1, -3, 5, -1, 3, -4, 4, -2]);
  const byRange = {};
  for (const c of cycles) byRange[c.range] = (byRange[c.range] ?? 0) + c.count;
  assert.deepEqual(byRange, { 3: 0.5, 4: 1.5, 6: 0.5, 8: 1, 9: 0.5 });
  assert.ok(cycles.every((c) => c.count === 1 || c.count === 0.5));
  const full = cycles.find((c) => c.count === 1);
  assert.deepEqual(full, { range: 4, mean: 1, count: 1 });
  // Intermediate points on a ramp are not reversals.
  assert.deepEqual(rainflow([0, 1, 2, 3, 0]), [{ range: 3, mean: 1.5, count: 0.5 }, { range: 3, mean: 1.5, count: 0.5 }]);
  const damage = miner(cycles, (range) => coffinManson(range, 1000, 2));
  near(damage, (0.5 * 9 + 1.5 * 16 + 0.5 * 36 + 64 + 0.5 * 81) / 1000, 1e-12);
});

test('Norris–Landzberg, Engelmaier, Steinberg', () => {
  const af = norrisLandzberg({ dTtest: 165, dTfield: 60, fTest: 24, fField: 2, TmaxTest: 125, TmaxField: 60 });
  const expected = (165 / 60) ** 1.9 * (2 / 24) ** (1 / 3) * Math.exp((0.122 / 8.617333262e-5) * (1 / 333.15 - 1 / 398.15)); // ≈ 5.98
  rel(af, expected, 0.002);
  assert.ok(af > 5 && af < 7, `AF ${af}`);
  near(norrisLandzberg({ dTtest: 50, dTfield: 50, fTest: 1, fField: 1, TmaxTest: 80, TmaxField: 80 }), 1, 1e-12);

  const e = engelmaier({ LD: 5, dAlpha: 10e-6, dT: 60, h: 0.3, Tmean: 50, dwellMin: 15 });
  near(e.strainRange, 0.01, 1e-12);
  near(e.c, -0.442 - 0.03 + 0.0174 * Math.log(25), 1e-12);
  rel(e.Nf50, 0.5 * (0.01 / 0.65) ** (1 / e.c), 1e-12);
  assert.ok(e.Nf50 > 5e3 && e.Nf50 < 3e4, `Nf ${e.Nf50}`);

  // Steinberg, worked numbers: B = 6 in, L = 1 in, h = 0.062 in, fn = 300 Hz, 0.1 g²/Hz → Q = 17.3, Grms = 28.6.
  const s = steinberg({ fn: 300, psd: 0.1, bandwidth: 1980, B: 152.4, L: 25.4, h: 1.5748, r: 1, c: 1 });
  rel(s.Zallow, 0.02129 * 25.4, 0.002);
  rel(s.Grms, 28.57, 0.002);
  rel(s.Zresp, 3 * 9.8 * 28.57 / 90000 * 25.4, 0.002);
  rel(s.Nf, 20e6 * s.ratio ** 6.4, 1e-12);
  rel(s.GrmsInput, Math.sqrt(198), 1e-12);
  assert.equal(steinberg({ fn: 100, gLevel: 0, B: 100, L: 20, h: 1.6 }).ratio, Infinity);
});

test('Weibull with the Lanczos gamma function', () => {
  near(gamma(1), 1, 1e-12); near(gamma(5), 24, 1e-9); near(gamma(0.5), Math.sqrt(Math.PI), 1e-12); near(gamma(1.5), 0.886226925, 1e-9);
  const exp = weibull({ beta: 1, mttf: 1000 });
  near(exp.eta, 1000, 1e-9);
  near(exp.reliability(1000), Math.exp(-1), 1e-12);
  near(exp.hazard(123), 1 / 1000, 1e-15);
  const w = weibull({ beta: 2, mttf: 886.226925 });
  near(w.eta, 1000, 1e-4);
  near(w.cdf(1000), 1 - Math.exp(-1), 1e-9);
  near(w.hazard(500), 2 * 500 / 1e6, 1e-9);
  near(w.bLife(0.1), 1000 * Math.sqrt(-Math.log(0.9)), 1e-3);
});

// ───────────────────────── compact models

/** 1D finite volumes through the layers [{ t (mm), k, q (W) }] of area A (m²): top face at 0 °C, bottom adiabatic (or the reverse). */
function solve1d(layers, A, fixedTop) {
  const cells = [];
  for (const l of layers) for (let n = 0; n < 200; n++) cells.push({ dx: l.t / 1000 / 200, k: l.k, q: l.q / 200, layer: l.name });
  const order = fixedTop ? cells : [...cells].reverse(); // order[0] next to the adiabatic face … last at the fixed face
  // Heat flowing out of cell n toward the fixed face = all generation up to and including it.
  let flow = 0; const flows = order.map((c) => (flow += c.q));
  // March from the fixed face back: T(last) = flow·(dx/2)/(kA), then add the resistance between cell centres.
  const T = new Array(order.length);
  let n = order.length - 1;
  T[n] = (flows[n] * (order[n].dx / 2)) / (order[n].k * A);
  for (n = order.length - 2; n >= 0; n--) T[n] = T[n + 1] + flows[n] * (order[n].dx / (2 * order[n].k * A) + order[n + 1].dx / (2 * order[n + 1].k * A));
  return Math.max(...T);
}

test('JEDEC two-resistor stack reproduces Rjc and Rjb (1D)', () => {
  for (const dim of [2, 3]) {
    const pkg = dim === 2
      ? jedecTwoResistor({ x: 10, y: 2, w: 10, h: 1.2, depth: 10, Rjc: 2.5, Rjb: 12, power: 3, dim })
      : jedecTwoResistor({ x: 10, y: 2, w: 10, d: 8, t: 1.2, z0: 4, Rjc: 2.5, Rjb: 12, power: 3, dim });
    const [top, junction, bottom] = pkg.bodies;
    const matOf = (b) => pkg.materials.find((m) => m.id === b.material);
    assert.equal(junction.power, 3);
    near(bottom.y, 2, 1e-12); near(junction.y, bottom.y + bottom.h, 1e-12); near(top.y + top.h, 3.2, 1e-12);
    if (dim === 3) { assert.equal(top.z0, 4); assert.equal(top.z1, 12); } else assert.equal(top.z0, undefined);
    const A = pkg.layers.area;
    near(A, dim === 2 ? 1e-4 : 8e-5, 1e-15);
    const stack = [{ t: bottom.h, k: matOf(bottom).k, q: 0 }, { t: junction.h, k: matOf(junction).k, q: 1 }, { t: top.h, k: matOf(top).k, q: 0 }];
    // Top held, bottom adiabatic: the rise of the junction is P·Rjc; the reverse gives P·Rjb.
    rel(solve1d(stack, A, true), 2.5, 0.01, `Rjc ${dim}D`);
    rel(solve1d(stack.slice().reverse(), A, true), 12, 0.01, `Rjb ${dim}D`);
    near(pkg.probe.y, junction.y + junction.h / 2, 1e-12);
  }
  assert.throws(() => jedecTwoResistor({ w: 10, h: 1, Rjc: 0, Rjb: 1 }));
});

test('heat sink geometry', () => {
  const hs = heatSink({ x: 5, y: 10, baseW: 50, baseT: 4, finCount: 6, finT: 2, finH: 20, dim: 3, depth: 30 });
  assert.equal(hs.bodies.length, 7);
  near(hs.gap, (50 - 12) / 5, 1e-12);
  const fins = hs.bodies.slice(1);
  near(fins[0].x, 5, 1e-12);
  near(fins[5].x + fins[5].w, 55, 1e-9);
  assert.ok(fins.every((f) => f.y === 14 && f.h === 20 && f.z0 === 0 && f.z1 === 30));
  for (let i = 1; i < fins.length; i++) assert.ok(fins[i].x >= fins[i - 1].x + fins[i - 1].w - 1e-9);
  assert.equal(new Set(hs.bodies.map((b) => b.id)).size, 7);
  assert.throws(() => heatSink({ baseW: 10, baseT: 2, finCount: 6, finT: 2, finH: 5 }), /do not fit/);
  near(heatSink({ x: 0, baseW: 10, baseT: 2, finCount: 1, finT: 2, finH: 5 }).bodies[1].x, 4, 1e-12);
});

test('PCB stack-up effective conductivity', () => {
  const s = pcbStackup([
    { type: 'copper', thickness: 0.035, coverage: 0.5 }, { type: 'dielectric', thickness: 0.5 },
    { type: 'copper', thickness: 0.035, coverage: 1 }, { type: 'dielectric', thickness: 0.5 }, { type: 'copper', thickness: 0.035, coverage: 0.5 },
  ]);
  near(s.thickness, 1.105, 1e-12);
  const k50 = 0.5 * 390 + 0.5 * 0.3;
  near(s.kInPlane, (2 * 0.035 * k50 + 0.035 * 390 + 1.0 * 0.3) / 1.105, 1e-9);
  near(s.kThrough, 1.105 / (2 * 0.035 / k50 + 0.035 / 390 + 1.0 / 0.3), 1e-9);
  assert.ok(s.kInPlane > 20 && s.kThrough < 0.4);
  assert.equal(s.material.k, s.kThrough);
  assert.equal(s.material.kx, s.kInPlane);
  assert.equal(s.material.kz, s.kInPlane);
  assert.equal(s.material.kind, 'solid');
});

test('power map bodies', () => {
  const bodies = powerMapBodies('x,y,W\n10,20,1.5\n# comment\n30;40;2\nbad,row,3\n', { size: 4, dim: 3, z0: 1, z1: 2, taken: ['src1'] });
  assert.equal(bodies.length, 2);
  assert.deepEqual({ x: bodies[0].x, y: bodies[0].y, w: bodies[0].w, h: bodies[0].h, power: bodies[0].power, z0: bodies[0].z0, z1: bodies[0].z1 }, { x: 8, y: 18, w: 4, h: 4, power: 1.5, z0: 1, z1: 2 });
  assert.equal(bodies[1].power, 2);
  assert.notEqual(bodies[0].id, bodies[1].id);
  assert.equal(powerMapBodies('5,5,1').length, 1);
});

// ───────────────────────── isosurface

test('marching cubes on a sphere field', () => {
  const n = 30;
  const grid = { dim: 3, nx: n, ny: n, nz: n, dx: 1, dy: 1, dz: 1 };
  const values = new Float32Array(n * n * n);
  const c = 15;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) values[i + n * (j + n * k)] = Math.hypot(i + 0.5 - c, j + 0.5 - c, k + 0.5 - c);
  const R = 8;
  const { positions, indices, triangles } = marchingCubes(grid, values, null, R);
  assert.ok(triangles > 100);
  assert.equal(indices.length, triangles * 3);
  let sum = 0;
  for (let v = 0; v < positions.length / 3; v++) {
    const [x, y, z] = [positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]];
    assert.ok(x >= 0 && x <= 30 && y >= 0 && y <= 30 && z >= 0 && z <= 30);
    sum += Math.hypot(x - c, y - c, z - c);
  }
  near(sum / (positions.length / 3), R, 0.15, 'mean radius');
  assert.ok(Math.max(...indices) < positions.length / 3);
  // Normals face the lower values: inward for a distance field.
  let inward = 0;
  for (let t = 0; t < triangles; t++) {
    const p = [0, 1, 2].map((q) => [0, 1, 2].map((ax) => positions[3 * indices[3 * t + q] + ax]));
    const u = p[1].map((v, ax) => v - p[0][ax]); const w = p[2].map((v, ax) => v - p[0][ax]);
    const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const out = p[0].map((v) => v - c);
    if (nrm[0] * out[0] + nrm[1] * out[1] + nrm[2] * out[2] < 0) inward++;
  }
  assert.equal(inward, triangles);
  // Void cells are skipped; 2D grids give nothing.
  const mat = new Uint8Array(n * n * n).fill(255);
  assert.equal(marchingCubes(grid, values, mat, R).triangles, 0);
  assert.equal(marchingCubes({ ...grid, dim: 2 }, values, null, R).triangles, 0);
  const nodes = nodeValues({ dim: 3, nx: 2, ny: 1, nz: 1, dx: 1, dy: 1, dz: 1 }, Float32Array.from([1, 3]), Uint8Array.from([0, 0]));
  near(nodes[1], 2, 1e-6); near(nodes[0], 1, 1e-6);
});

// ───────────────────────── result post-processing

/** A result object (header + data) from a grid and fields { name: Float32Array }. */
function makeResult(grid, fields, extra = {}) {
  const cells = grid.nx * grid.ny * (grid.dim === 3 ? grid.nz : 1);
  const header = { grid, fields: {}, times: [0], ...extra };
  const parts = [];
  let offset = 0;
  for (const [name, values] of Object.entries(fields)) {
    header.fields[name] = { offset, length: cells, frames: values.length / cells };
    parts.push(values);
    offset += values.length;
  }
  const data = new Float32Array(offset);
  let at = 0;
  for (const p of parts) { data.set(p, at); at += p.length; }
  return { header, data };
}

test('sampleLine3D interpolates trilinearly and marks void', () => {
  const grid = { dim: 3, nx: 10, ny: 4, nz: 5, dx: 2, dy: 1, dz: 1 };
  const cells = 200;
  const values = new Float32Array(cells); const mat = new Uint8Array(cells);
  for (let k = 0; k < 5; k++) for (let j = 0; j < 4; j++) for (let i = 0; i < 10; i++) values[i + 10 * (j + 4 * k)] = 3 * ((i + 0.5) * 2) + 2 * ((k + 0.5) * 1);
  const line = sampleLine3D(grid, values, mat, { x: 1, y: 2, z: 0.5 }, { x: 19, y: 2, z: 4.5 }, 40);
  assert.equal(line.length, 41);
  line.forEach((p) => near(p.value, 3 * p.x + 2 * p.z, 1e-4));
  near(line[40].s, Math.hypot(18, 4), 1e-9);
  mat[5 + 10 * (2 + 4 * 2)] = 255;
  const withVoid = sampleLine3D(grid, values, mat, { x: 11, y: 2.5, z: 2.5 }, { x: 11, y: 2.5, z: 2.5 }, 1);
  assert.ok(Number.isNaN(withVoid[0].value));
  assert.equal(sampleLine3D(grid, values, mat, { x: -5, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, 4).length, 0);
  // 2D grids work too and the old sampleLine is unchanged.
  const g2 = { dim: 2, nx: 4, ny: 1, nz: 1, dx: 1, dy: 1, dz: 10 };
  const v2 = Float32Array.from([0, 1, 2, 3]);
  near(sampleLine3D(g2, v2, null, { x: 1, y: 0.5 }, { x: 1, y: 0.5 }, 1)[0].value, 0.5, 1e-6);
  assert.equal(sampleLine(g2, v2, null, { x: 1, y: 0.5 }, { x: 1, y: 0.5 }, 0, 1)[0].value, 1);
});

test('slice extracts planes on every axis', () => {
  const grid = { dim: 3, nx: 3, ny: 4, nz: 5, dx: 1, dy: 2, dz: 3 };
  const values = new Float32Array(60).map((_, n) => n); // value = index
  const z = slice(grid, values, 'z', 2);
  assert.deepEqual([z.width, z.height], [3, 4]);
  assert.equal(z.values[1 + 3 * 2], 1 + 3 * (2 + 4 * 2));
  near(z.axes.position, 7.5, 1e-12);
  const y = slice(grid, values, 'y', 1);
  assert.deepEqual([y.width, y.height, y.axes.u, y.axes.v], [3, 5, 'x', 'z']);
  assert.equal(y.values[2 + 3 * 4], 2 + 3 * (1 + 4 * 4));
  const x = slice(grid, values, 'x', 99);
  assert.deepEqual([x.width, x.height, x.axes.index], [5, 4, 2]);
  assert.equal(x.values[3 + 5 * 1], 2 + 3 * (1 + 4 * 3));
  const mat = new Uint8Array(60); mat[0] = 255;
  assert.ok(Number.isNaN(slice(grid, values, 'z', 0, mat).values[0]));
  assert.throws(() => slice(grid, values, 'w', 0));
});

test('bodyIntegrals per material and per body', () => {
  const grid = { dim: 2, nx: 4, ny: 2, nz: 1, dx: 1, dy: 1, dz: 10 };
  const mat = Float32Array.from([0, 0, 1, 255, 0, 0, 1, 1]);
  const T = Float32Array.from([10, 20, 30, NaN, 10, 20, 50, 70]);
  const result = makeResult(grid, { mat, T }, { materials: ['air', 'copper'] });
  const model = {
    materials: [{ id: 'air', name: 'Air' }, { id: 'copper', name: 'Copper' }],
    bodies: [{ id: 'b1', name: 'Block', shape: 'rect', x: 2, y: 0, w: 2, h: 2, material: 'copper' }, { id: 'b2', shape: 'rect', x: 3, y: 1, w: 1, h: 1, material: 'copper' }],
  };
  const { materials, bodies } = bodyIntegrals(result, model, 'T');
  const air = materials.find((m) => m.id === 'air');
  const cu = materials.find((m) => m.id === 'copper');
  assert.equal(air.cells, 4); assert.equal(air.name, 'Air');
  near(air.volume, 4e-8, 1e-20);
  near(air.mean, 15, 1e-9); near(air.min, 10, 0); near(air.max, 20, 0);
  near(air.integral, 15 * 4e-8, 1e-18);
  near(cu.mean, 50, 1e-9);
  assert.deepEqual(bodies.map((b) => b.cells), [2, 1]); // b2 paints over the top-right cell
  near(bodies[0].mean, 40, 1e-9); near(bodies[1].mean, 70, 1e-9);
  assert.deepEqual(bodyIntegrals(result, null).bodies, []);
});

test('probe and line CSV', () => {
  const header = { times: [0, 10], probes: [{ id: 'p1', values: [25, 30.5] }, { id: 'p2', values: [null, null] }] };
  const csv = probesCsv(header, { probes: [{ id: 'p1', name: 'Junction, die' }] }, '°C');
  assert.equal(csv, 'time_s,"Junction, die (°C)",p2 (°C)\n0,25.00000,\n10,30.50000,\n');
  assert.equal(lineCsv([{ s: 0, x: 1, y: 2, value: 3 }], 'T', 'C'), 's_mm,x_mm,y_mm,T_C\n0.0000,1.0000,2.0000,3.000000\n');
  assert.match(lineCsv([{ s: 0, x: 1, y: 2, z: 3, value: NaN }]), /z_mm,value\n0\.0000,1\.0000,2\.0000,3\.0000,\n$/);
});

// ───────────────────────── harmonic

test('harmonic response from modal data', () => {
  const modes = [{ frequency: 100, participation: [0, 0.64, 0] }, { frequency: 400, participation: [0, 0.09, 0.02] }];
  assert.equal(dominantAxis(modes), 1);
  const curve = harmonicResponse({ modes, fMin: 10, fMax: 1000, points: 2001, damping: 0.02 });
  assert.equal(curve.length, 2001);
  near(curve[0].f, 10, 1e-9); near(curve[2000].f, 1000, 1e-6);
  const peaks = responsePeaks(curve, 2);
  near(peaks[0].f, 100, 1.5);
  near(peaks[0].amplitude, 0.8 / (2 * 0.02), 2); // √0.64 · Q, Q = 1/(2ζ) = 25
  near(peaks[1].f, 400, 5);
  // A single mode: phase −90° at resonance, ~0° well below.
  const single = harmonicResponse({ modes: [{ frequency: 50, participation: 1 }], fMin: 50, fMax: 50, points: 2 });
  near(single[0].phase, -90, 1e-9); near(single[0].amplitude, 25, 1e-9);
  near(harmonicResponse({ modes: [{ frequency: 50, participation: 1 }], fMin: 1, fMax: 2, points: 2 })[0].phase, 0, 2);
  // Base reaction: → 1 well below the first mode (all mass moves rigidly).
  near(harmonicResponse({ modes, fMin: 1, fMax: 2, points: 2, kind: 'baseForce' })[0].amplitude, 1, 0.01);
});

// ───────────────────────── node maps

test('node delta map and envelope', () => {
  const a = [{ id: '1', x: 0, y: 0, T: 20 }, { id: '2', x: 1, y: 0, T: 30 }, { id: '3', x: 2, y: 0, T: 40 }];
  const b = [{ id: '2', x: 1, y: 0, T: 35 }, { id: '1', x: 0, y: 0, T: 18 }, { id: '9', x: 5, y: 5, T: 0 }];
  const d = deltaMap(a, b);
  assert.deepEqual(d.map((n) => [n.id, n.T]), [['2', 5], ['1', -2]]);
  near(nodeStats(d).max, 5, 0);
  const env = envelope([a, b]);
  const two = env.find((n) => n.id === '2');
  assert.deepEqual([two.max, two.min, two.T, two.range, two.maxSet, two.minSet], [35, 30, 35, 5, 1, 0]);
  assert.equal(env.length, 4);
});

// ───────────────────────── THERM helpers

test('cavity equivalent conductivity and U per tag', () => {
  // 20 × 50 mm cavity, ΔT 10 K, 10 °C, ε 0.9: ha = max(1.25, 1.573) = 1.573; F = ½(1 + √1.16 − 0.4) = 0.8385.
  const c = cavityK({ width: 20, height: 50, dT: 10, Tmean: 10, e1: 0.9, e2: 0.9 });
  near(c.ha, 0.73 * 10 ** (1 / 3), 1e-9);
  near(c.F, 0.5 * (1 + Math.sqrt(1.16) - 0.4), 1e-12);
  near(c.hr, (4 * 5.670374419e-8 * 283.15 ** 3) / (2 / 0.9 - 2 + 1 / c.F), 1e-9);
  near(c.k, 0.02 * (c.ha + c.hr), 1e-12);
  assert.ok(c.k > 0.06 && c.k < 0.12, `k ${c.k}`);
  const thin = cavityK({ width: 2, height: 50, dT: 10, Tmean: 10, e1: 0.05, e2: 0.9 });
  near(thin.ha, 12.5, 1e-9); // conduction limit C1/d
  assert.ok(cavityK({ width: 20, height: 50, heatFlow: 'up' }).k > c.k);
  assert.ok(cavityK({ width: 20, height: 50, heatFlow: 'down' }).k < c.k);

  const boundaries = [
    { id: 'a', tag: 'Frame', range: [0, 60] }, { id: 'b', tag: 'Frame', range: [60, 100] },
    { id: 'c', tag: 'Edge' }, { id: 'd' },
  ];
  const results = [{ id: 'a', heat: 3, area: 0.12 * 0.001 }, { id: 'b', heat: 1, area: 0.08 * 0.001 }, { id: 'c', heat: -2, area: 0.05 * 0.001 }, { id: 'd', heat: 9, area: 1 }];
  const rows = uFactorByTag({ boundaries, results, depth: 1, Twarm: 20, Tcold: 0 });
  const frame = rows.find((r) => r.tag === 'Frame');
  near(frame.length, 200, 1e-9); near(frame.projectedLength, 100, 1e-12); near(frame.heat, 4, 1e-12);
  near(frame.Utotal, 4 / (0.2 * 0.001 * 20), 1e-9);
  near(frame.Uprojected, 4 / (0.1 * 0.001 * 20), 1e-9);
  const edge = rows.find((r) => r.tag === 'Edge');
  near(edge.projectedLength, edge.length, 1e-12);
  near(uFactorByTag({ boundaries, results, depth: 1, Twarm: 20, Tcold: 0, projected: { Edge: 25 } }).find((r) => r.tag === 'Edge').Uprojected, 2 / (0.025 * 0.001 * 20), 1e-9);
  assert.equal(rows.length, 2);
});

test('Friedman and the model-free Ea(α) profile recover the activation energy of synthetic runs', () => {
  const runs = sampleKineticRuns({ Ea: 80e3 }).map((r) => ({ rate: r.rate, conv: conversion(r.curve, 20, 300, 'linear') }));
  const at = runs.map((r) => ({ rate: r.rate, ...conversionAt(r.conv, 0.5) }));
  assert.ok(at.every((r) => r.dadT > 0), 'dα/dT positive at α = 0.5');
  const fr = friedman(at);
  assert.ok(Math.abs(fr.Ea_kJ - 80) < 3, `Friedman Ea ${fr.Ea_kJ}`);
  assert.ok(fr.r2 > 0.999);
  const profile = isoconversionalProfile(runs);
  assert.equal(profile.length, 9);
  for (const p of profile.slice(1, 8)) {
    assert.ok(Math.abs(p.friedman - 80) < 3, `Friedman at α ${p.alpha}: ${p.friedman}`);
    assert.ok(Math.abs(p.ofw - 80) < 5, `OFW at α ${p.alpha}: ${p.ofw}`);
  }
  assert.throws(() => friedman(at.slice(0, 1)), /two heating rates/);
});

test('random vibration over a PSD table agrees with Miles and Steinberg for white noise', () => {
  assert.ok(Math.abs(psdAt([[20, 0.01], [80, 0.04]], 40) - 0.02) < 1e-12, '+3 dB/oct line is straight on log–log axes');
  assert.equal(psdAt([[20, 0.01], [80, 0.04]], 10), 0);
  const r = randomVibration({ psd: [[20, 0.04], [2000, 0.04]], fn: 300 });
  assert.ok(Math.abs(r.GrmsInput - Math.sqrt(0.04 * 1980)) < 1e-3, `input ${r.GrmsInput}`);
  assert.ok(Math.abs(r.GrmsResponse / r.GrmsMiles - 1) < 0.01, `response ${r.GrmsResponse} vs Miles ${r.GrmsMiles}`);
  const s = steinberg({ fn: 300, psd: 0.04, B: 100, L: 20, h: 1.6 });
  assert.ok(Math.abs(r.z3sigma / s.Zresp - 1) < 0.02, `3σ displacement ${r.z3sigma} vs ${s.Zresp}`);
  assert.throws(() => randomVibration({ psd: [[20, 0.04]], fn: 300 }), /two or more points/);
});

test('half-sine shock follows the classic shock response spectrum', () => {
  // Undamped half-sine SRS: small fn·T → ≈ 4·fn·T (residual), maximum ≈ 1.77 near fn·T = 0.8, → 1 for long pulses.
  const srs = (fT) => halfSineShock({ peakG: 50, durationMs: 1, fn: fT * 1000, Q: 1000 });
  assert.ok(Math.abs(srs(0.05).amplification - 0.2) < 0.01 && srs(0.05).residual);
  assert.ok(Math.abs(srs(0.8).amplification - 1.77) < 0.02);
  assert.ok(Math.abs(srs(10).amplification - 1) < 0.08);
  // Quasi-static limit: a long pulse moves the mass by peak·g/ω².
  const slow = halfSineShock({ peakG: 10, durationMs: 200, fn: 500, Q: 10 });
  const zStatic = (10 * 9.80665) / (2 * Math.PI * 500) ** 2 * 1000;
  assert.ok(Math.abs(slow.zMax / zStatic - 1) < 0.05, `${slow.zMax} vs ${zStatic}`);
});

test('3D node sample: three layers, hottest node in the middle layer near the busbar end', () => {
  const data = parseNodeCsv(sampleNodeCsv3d());
  assert.equal(data.nodes.length, 3 * 7 * 11);
  assert.deepEqual([...new Set(data.nodes.map((n) => n.z))], [0, 40, 80]);
  const hottest = data.nodes.reduce((a, b) => (b.T > a.T ? b : a));
  assert.equal(hottest.z, 40);
  assert.ok(hottest.x >= 160, `hottest at x ${hottest.x}`);
});

test('point transmissibility from mode shapes: one mode is the classic SDOF transmissibility', () => {
  const zeta = 0.05;
  const curve = pointTransmissibility({ modes: [{ frequency: 100, factor: [0, 1] }], shapes: [[0, 1, 0]], fMin: 10, fMax: 1000, points: 301, damping: zeta, axis: 1 });
  for (const p of curve) {
    const r = p.f / 100;
    const classic = Math.sqrt((1 + (2 * zeta * r) ** 2) / ((1 - r * r) ** 2 + (2 * zeta * r) ** 2));
    assert.ok(Math.abs(p.amplitude - classic) < 1e-9 * Math.max(1, classic), `f ${p.f}: ${p.amplitude} vs ${classic}`);
  }
  const peak = curve.reduce((a, b) => (b.amplitude > a.amplitude ? b : a));
  assert.ok(Math.abs(peak.f - 100) < 3 && Math.abs(peak.amplitude - Math.sqrt(1 + 1 / (4 * zeta * zeta))) < 0.2, 'Q ≈ 1/(2ζ) at resonance');
  assert.ok(Math.abs(curve[0].amplitude - 1) < 0.02, 'rigid at low frequency');
  // Static limit of the relative displacement: φ·L·g/ω² (mm per g).
  near(curve[0].disp, (9.80665 / (2 * Math.PI * 100) ** 2) * 1000 * (1 / (1 - 0.01)), 1e-3);
  // A point on a node line of the mode (φ = 0) only follows the base.
  const still = pointTransmissibility({ modes: [{ frequency: 100, factor: [0, 1] }], shapes: [[0, 0, 0]], fMin: 10, fMax: 1000, points: 11, axis: 1 });
  assert.ok(still.every((p) => Math.abs(p.amplitude - 1) < 1e-12));
});
