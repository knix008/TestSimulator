// Evaluate tools on simple shapes with known answers: deviation along edges, symmetry, the geometry check,
// undercuts for a pull direction, comparing two parts, the cost estimate and the CO₂e report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  deviationAnalysis, symmetryCheck, geometryCheck, undercutAnalysis, compareParts, compareFeatures, costEstimate, sustainabilityReport,
  faceColours, edgeFaceMap, COST_DEFAULTS, CO2_DEFAULTS, RESULT_COLOURS,
} from '../../src/cad/evaluate-more.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const mesh = (s) => s.mesh({ tolerance: 0.05, angularTolerance: 0.3 });

test('deviation analysis: square corners are 90°, the edges of a fillet are tangent (0°)', () => {
  const rounded = R.makeBox([0, 0, 0], [30, 30, 10]).fillet(4, (e) => e.inDirection('Z'));
  const r = deviationAnalysis(rounded);
  near(r.max, 90, 0.01);
  assert.equal(r.tangent, 8, 'each of the 4 fillets meets its 2 side faces tangentially');
  assert.ok(r.edges.at(-1).max < 0.01);
  const box = deviationAnalysis(R.makeBox([0, 0, 0], [10, 10, 10]));
  assert.equal(box.count, 12); near(box.avg, 90, 1e-6);
  // Only the edges asked for.
  const one = deviationAnalysis(rounded, { edges: [r.edges[0].hash] });
  assert.equal(one.count, 1);
});

test('symmetry check: a centred block is symmetric, an off-centre hole is reported', () => {
  const box = R.makeBox([-20, -10, 0], [20, 10, 10]);
  const s = symmetryCheck(box, { point: [0, 0, 0], normal: [1, 0, 0] });
  assert.ok(s.symmetric); assert.equal(s.asymmetric, 0); near(s.ratio, 1, 1e-6);
  const holed = box.clone().cut(R.makeCylinder(3, 30, [8, 0, -5], [0, 0, 1]));
  const h = symmetryCheck(holed, { point: [0, 0, 0], normal: [1, 0, 0] });
  assert.ok(!h.symmetric);
  // The hole and the top / bottom faces it pierces have no mirror image; the four sides do.
  assert.equal(h.asymmetric, 3);
  near(h.common, h.volume - Math.PI * 9 * 10, 1e-3);
  // About the other plane (y = 0) the hole is on the plane: symmetric.
  assert.ok(symmetryCheck(holed, { point: [0, 0, 0], normal: [0, 1, 0] }).symmetric);
});

test('geometry check: a clean block has no problems; a tiny chamfer gives short edges and a sliver face', () => {
  const box = R.makeBox([0, 0, 0], [10, 10, 10]);
  const g = geometryCheck(box);
  assert.ok(g.valid); assert.equal(g.problems, 0); assert.equal(g.solids, 1);
  const tiny = R.makeBox([0, 0, 0], [10, 10, 10]).chamfer(0.004, (e) => e.inDirection('Z').containsPoint([10, 10, 5]));
  const t = geometryCheck(tiny, { minEdge: 0.01 });
  assert.ok(t.valid);
  assert.equal(t.shortEdges.length, 2, 'the chamfer face ends are 0.0057 long');
  assert.equal(t.slivers.length, 1);
  assert.ok(t.faces.some((f) => f.problem === 'sliver'));
  // A seam (cylinder) is not an open edge; an open shell has them.
  assert.equal(geometryCheck(R.makeCylinder(5, 10)).openEdges.length, 0);
  const open = R.makeBox([0, 0, 0], [10, 10, 10]).faces.slice(0, 3);
  const shell = R.makeCompound(open);
  assert.ok(geometryCheck(shell).openEdges.length > 0);
  // Seam edges count twice for their face.
  assert.ok([...edgeFaceMap(R.makeCylinder(5, 10)).values()].some((r) => r.seam && r.faces.length === 2));
});

test('undercut analysis: a vertical hole releases along z, a side hole is an undercut', () => {
  const up = [0, 0, 1];
  const block = R.makeBox([-20, -10, 0], [20, 10, 10]);
  const plain = undercutAnalysis(mesh(block), up);
  assert.equal(plain.undercut, 0);
  assert.equal(plain.counts.cavity, 1); assert.equal(plain.counts.core, 1); assert.equal(plain.counts.straight, 4);
  const through = undercutAnalysis(mesh(block.clone().cut(R.makeCylinder(3, 30, [0, 0, -5], [0, 0, 1]))), up);
  assert.equal(through.undercut, 0, 'a hole along the pull releases');
  const side = block.clone().cut(R.makeCylinder(3, 60, [-30, 0, 5], [1, 0, 0]));
  const s = undercutAnalysis(mesh(side), up);
  assert.ok(s.undercut >= 1, 'the side hole is an undercut');
  const hole = side.faces.find((f) => f.geomType === 'CYLINDRE');
  assert.equal(s.faces.get(hole.hashCode), 'undercut');
  // Pulled along x instead, the side hole releases.
  assert.equal(undercutAnalysis(mesh(side), [1, 0, 0]).faces.get(hole.hashCode) === 'undercut', false);
  // Colours per face.
  const m = mesh(side);
  const colours = faceColours(m, (id) => RESULT_COLOURS[s.faces.get(id)]);
  assert.equal(colours.length, m.vertices.length);
});

test('compare documents: the material only in one part, the changed faces and the features', () => {
  const a = R.makeBox([-20, -10, 0], [20, 10, 10]);
  const b = a.clone().cut(R.makeCylinder(3, 30, [0, 0, -5], [0, 0, 1]));
  const r = compareParts(a, b);
  near(r.onlyA, Math.PI * 9 * 10, 1e-3); near(r.onlyB, 0, 1e-6);
  near(r.volumeA - r.volumeB, Math.PI * 9 * 10, 1e-3);
  assert.ok(!r.identical);
  // The four sides of A are B's too; top and bottom are not (B has a hole through them).
  assert.equal(r.faces.filter((f) => f.same).length, 4);
  assert.ok(compareParts(a, a.clone()).identical);
  const f = compareFeatures([{ id: '1', type: 'extrude', name: 'E1', depth: 10 }, { id: '2', type: 'hole', name: 'H1' }], [{ id: '1', type: 'extrude', name: 'E1', depth: 12 }, { id: '3', type: 'fillet', name: 'F1' }]);
  assert.deepEqual(f, { added: ['H1'], removed: ['F1'], changed: ['E1'] });
});

test('cost estimate and CO₂e report of a 100 × 50 × 20 steel block', () => {
  const c = costEstimate({ volume: 100000, area: 2 * (100 * 50 + 100 * 20 + 50 * 20), bbox: [[0, 0, 0], [100, 50, 20]], material: 'steel-1020' });
  const stock = 104 * 54 * 24;
  near(c.stockVolume, stock); near(c.stockMass, stock * 1e-9 * 7900); near(c.partMass, 0.79);
  near(c.materialCost, c.stockMass * COST_DEFAULTS.pricePerKg.steel);
  near(c.roughMin, (stock - 100000) / 1000 / COST_DEFAULTS.removalRate.steel);
  near(c.finishMin, 160 / COST_DEFAULTS.finishRate);
  near(c.timeMin, COST_DEFAULTS.setup + c.roughMin + c.finishMin);
  near(c.total, c.materialCost + (c.timeMin / 60) * COST_DEFAULTS.rate);
  // Edited prices win.
  const c2 = costEstimate({ volume: 100000, area: 17000, bbox: [[0, 0, 0], [100, 50, 20]], material: 'steel-1020' }, { price: 5, rate: 100, allowance: 0, setup: 0 });
  near(c2.materialCost, 0.79 * 5); near(c2.roughMin, 0);
  const s = sustainabilityReport({ partMass: c.partMass, stockMass: c.stockMass, timeMin: c.timeMin, material: 'steel-1020' });
  near(s.materialCO2, c.stockMass * CO2_DEFAULTS.perKg.steel);
  near(s.energy, (c.timeMin / 60) * CO2_DEFAULTS.power);
  near(s.machiningCO2, s.energy * CO2_DEFAULTS.grid);
  near(s.transportCO2, (0.79 / 1000) * 500 * 0.1);
  near(s.total, s.materialCO2 + s.machiningCO2 + s.transportCO2);
  near(sustainabilityReport({ partMass: 1, stockMass: 1, timeMin: 0, material: 'al-6061' }, { factor: 2, distance: 0 }).total, 2);
});
