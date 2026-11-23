// Fatigue (src/cad/fatigue.js): Marin factors and S-N curves (Shigley), mean stress corrections, principal-stress
// measures, rainflow counting (the ASTM E1049 example), damage, life and the load factor of safety.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marinFactors, buildCurve, cyclesToFailure, equivalentAmplitude, principals, measureOf, rainflow, loadCycles, fatigueStudy } from '../../src/cad/fatigue.js';

const near = (v, e, rel, what = '') => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e}`);
const STEEL = { yield: 300, ultimate: 520, group: 'steel' };

test('Marin factors: Shigley machined Su 520 → ka 0.860; size, loading, reliability', () => {
  const m = marinFactors({ su: 520, finish: 'machined', diameter: 32, loadType: 'bending', reliability: 99 });
  near(m.ka, 0.860, 0.005, 'ka');
  near(m.kb, 1.24 * 32 ** -0.107, 1e-9, 'kb');
  assert.equal(m.kc, 1); assert.equal(m.kd, 1); assert.equal(m.ke, 0.814);
  near(m.k, m.ka * m.kb * m.ke, 1e-12, 'product');
  assert.equal(marinFactors({ su: 520, diameter: 32, loadType: 'axial' }).kb, 1, 'no size effect in axial loading');
  assert.equal(marinFactors({ su: 520, loadType: 'torsion' }).kc, 0.59);
  assert.ok(marinFactors({ su: 520, temperature: 450 }).kd < 1, 'hot');
});

test('S-N curve: 0.9 Su at 10³, Se at 10⁶ (infinite below for steel, falling on for aluminium); a table interpolates log-log', () => {
  const c = buildCurve({ material: STEEL, finish: 'polished' });
  near(c.se, 260, 1e-9, 'Se = 0.5 Su polished');
  near(cyclesToFailure(0.9 * 520, c), 1e3, 1e-9, '10³');
  near(cyclesToFailure(260.0001, c), 1e6, 1e-3, '10⁶');
  assert.equal(cyclesToFailure(250, c), Infinity);
  near(cyclesToFailure(Math.sqrt(0.9 * 520 * 260), c), Math.sqrt(1e3 * 1e6), 1e-6, 'mid-way on the log scale');
  const al = buildCurve({ material: { yield: 276, ultimate: 310, group: 'aluminium' }, finish: 'polished' });
  assert.ok(Number.isFinite(cyclesToFailure(0.5 * al.se, al)) && cyclesToFailure(0.5 * al.se, al) > 1e6, 'aluminium keeps falling');
  const t = buildCurve({ material: STEEL, source: 'table', table: [[1e7, 100], [1e4, 300], [1e5, 200]] });
  assert.deepEqual(t.points.map((p) => p[0]), [1e4, 1e5, 1e7], 'sorted');
  near(cyclesToFailure(200, t), 1e5, 1e-9, 'a table point');
  near(cyclesToFailure(Math.sqrt(300 * 200), t), Math.sqrt(1e4 * 1e5), 1e-6, 'between points');
  assert.equal(cyclesToFailure(90, t), Infinity, 'steel: infinite below the last point');
});

test('mean stress corrections (σa 100, σm 200, Su 400, Sy 300); compressive means get no credit', () => {
  const c = { su: 400, sy: 300 };
  near(equivalentAmplitude(100, 200, c, 'goodman'), 200, 1e-12, 'Goodman');
  near(equivalentAmplitude(100, 200, c, 'gerber'), 100 / 0.75, 1e-12, 'Gerber');
  near(equivalentAmplitude(100, 200, c, 'soderberg'), 300, 1e-12, 'Soderberg');
  near(equivalentAmplitude(100, 200, c, 'asme'), 100 / Math.sqrt(1 - (2 / 3) ** 2), 1e-12, 'ASME elliptic');
  assert.equal(equivalentAmplitude(100, 200, c, 'none'), 100);
  assert.equal(equivalentAmplitude(100, -200, c, 'goodman'), 100);
  assert.equal(equivalentAmplitude(100, 400, c, 'goodman'), Infinity, 'the mean alone breaks it');
});

test('principal stresses and the signed measures: uniaxial tension / compression, pure shear', () => {
  const p = principals([10, 2, -5, 3, 1, 4]);
  // Invariants: the trace and the sum of the principal products.
  near(p[0] + p[1] + p[2], 7, 1e-12, 'trace');
  assert.ok(p[0] >= p[1] && p[1] >= p[2]);
  assert.equal(measureOf([-150, 0, 0, 0, 0, 0], 0, 'vonMises').value, -150, 'compression signed');
  assert.equal(measureOf([150, 0, 0, 0, 0, 0], 0, 'maxPrincipal').value, 150);
  const shear = measureOf([0, 0, 0, 50, 0, 0], 0, 'vonMises');
  near(Math.abs(shear.value), 50 * Math.sqrt(3), 1e-9, 'von Mises of pure shear');
  near(shear.biax, -1, 1e-9, 'pure shear is biaxiality −1');
  near(measureOf([0, 0, 0, 50, 0, 0], 0, 'tresca').value, 100, 1e-9, 'Tresca σ1 − σ3');
  assert.equal(measureOf([100, 0, 0, 0, 0, 0], 0).biax, 0, 'uniaxial');
});

test('rainflow: the ASTM E1049 example; a repeated block leaves no half cycles', () => {
  const r = rainflow([-2, 1, -3, 5, -1, 3, -4, 4, -2], { repeated: false });
  const by = new Map(); for (const c of r) by.set(c.range, (by.get(c.range) ?? 0) + c.count);
  assert.deepEqual([...by].sort((a, b) => a[0] - b[0]), [[3, 0.5], [4, 1.5], [6, 0.5], [8, 1], [9, 0.5]]);
  const rep = rainflow([0, 2, -1, 3, -2, 1]);
  assert.ok(rep.every((c) => c.count === 1), 'closed block');
  const cyc = loadCycles({ history: [0, 1, 0, 1, 0], repeats: 1000 });
  assert.ok(cyc.every((c) => c.count === 1000 && c.amp === 0.5 && c.mean === 0.5));
});

test('a study: damage by Miner, life in blocks, the load factor of safety brings the worst point to a damage of 1', () => {
  // Three surface points: uniaxial 300, 150 and −300 MPa under the static load.
  const vertexTensor = Float32Array.from([300, 0, 0, 0, 0, 0, 150, 0, 0, 0, 0, 0, -300, 0, 0, 0, 0, 0]);
  const r = fatigueStudy({ vertexTensor }, { material: STEEL, curve: { finish: 'polished' }, events: [{ cycles: 1e4, min: -1, max: 1 }, { cycles: 1e5, min: 0, max: 1.5 }], mean: 'goodman' });
  const c = r.curve;
  const expect = 1e4 / cyclesToFailure(300, c) + 1e5 / cyclesToFailure(equivalentAmplitude(225, 225, c, 'goodman'), c);
  near(r.vertexDamage[0], expect, 1e-5, 'Miner sum at 300 MPa');
  assert.equal(r.vertexDamage[1], 0, '150 MPa: below the endurance limit in both events');
  assert.ok(r.vertexDamage[2] < r.vertexDamage[0], 'the compressive point: its 0…1.5 event has a compressive mean (no credit, but no Goodman penalty either)');
  assert.equal(r.worst, 0);
  near(r.minLife, 1 / r.maxDamage, 1e-12, 'life in blocks');
  // (Kf cannot go below 1, so the stresses themselves are scaled.)
  const scaled = vertexTensor.map((v) => v * r.factorOfSafety);
  const at = fatigueStudy({ vertexTensor: scaled }, { material: STEEL, curve: { finish: 'polished' }, events: [{ cycles: 1e4, min: -1, max: 1 }, { cycles: 1e5, min: 0, max: 1.5 }], mean: 'goodman' });
  near(at.maxDamage, 1, 1e-3, 'stresses × the factor of safety: damage 1');
  const safe = fatigueStudy({ vertexTensor: Float32Array.from([100, 0, 0, 0, 0, 0]) }, { material: STEEL, curve: { finish: 'polished' }, events: [{ cycles: 1e9, min: -1, max: 1 }] });
  assert.equal(safe.maxDamage, 0); assert.equal(safe.minLife, Infinity);
  near(safe.factorOfSafety * 100, 260, 1e-3, 'infinite life: the factor that brings it to the endurance limit');
});
