// Equations, global variables, configurations, design tables, and the sketch tools (spline, ellipse,
// fillet, chamfer, offset, mirror, patterns, trim, extend). Kernel-free except for one rebuild.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, variableValues, effectiveFeatures, equationRows, addConfiguration, setSuppressedIn, designTableCsv, applyDesignTable } from '../../src/cad/params.js';
import { addLine, addRectangle, addCircle, addConstraint, createSketchGeometry, profiles, solveSketch, byId, dimensionFor } from '../../src/cad/sketch.js';
import { addSpline, addEllipse, sketchFillet, sketchChamfer, offsetEntities, mirrorEntities, linearSketchPattern, circularSketchPattern, trimAt, extendAt } from '../../src/cad/sketchtools.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const sk = () => ({ id: 's', type: 'sketch', name: 'Sketch1', ...createSketchGeometry() });

test('expressions: arithmetic, functions in degrees, iif, errors', () => {
  near(evaluate('2 + 3 * 4 ^ 2 / 8'), 8);
  near(evaluate('sin(30) * 2'), 1);
  near(evaluate('iif(W > 10, 1, 2)', (n) => ({ W: 20 })[n]), 1);
  near(evaluate('-(3 - 5) * pi'), 2 * Math.PI);
  assert.throws(() => evaluate('1 +'), /syntax/);
  assert.throws(() => evaluate('1 / 0'), /divide/);
  assert.throws(() => evaluate('foo(1)'), /function/);
});

test('global variables in order, cycles reported, configurations override', () => {
  const part = { variables: [{ name: 'H', expr: 'W / 2' }, { name: 'W', expr: '120' }, { name: 'A', expr: 'B' }, { name: 'B', expr: 'A' }], features: [] };
  const { values, errors } = variableValues(part);
  assert.equal(values.get('H'), 60);
  assert.equal(errors.get('A'), 'cycle');
  const c = addConfiguration(part, 'Small');
  c.variables.W = '80';
  part.config = c.id;
  assert.equal(variableValues(part).values.get('H'), 40);
});

test('equations drive feature values and sketch dimensions; the stored part is unchanged', () => {
  const s = sketchOf();
  const ext = { id: 'e', type: 'extrude', name: 'Boss-Extrude1', sketch: 's', depth: 10, exprs: { depth: 'W / 5' } };
  const part = { variables: [{ name: 'W', expr: '40' }], features: [s, ext] };
  const dim = s.constraints.find((c) => c.type === 'distance');
  dim.expr = 'W'; dim.name = 'D1';
  const eff = effectiveFeatures(part);
  assert.equal(eff[1].depth, 8);
  const line = eff[0].entities.find((e) => e.type === 'line');
  const a = byId(eff[0], line.p1); const b = byId(eff[0], line.p2);
  near(Math.hypot(b.x - a.x, b.y - a.y), 40, 1e-5);
  assert.equal(ext.depth, 10);
  // A feature value can use a dimension by name ("D1@Sketch1").
  ext.exprs.depth = 'D1@Sketch1 / 8';
  assert.equal(effectiveFeatures(part)[1].depth, 5);
  const rows = equationRows(part);
  assert.deepEqual(rows.map((r) => r.kind), ['variable', 'dimension', 'feature']);
  function sketchOf() {
    const k = sk();
    const l = addLine(k, 0, 0, 20, 0);
    addConstraint(k, { type: 'horizontal', a: l.id });
    addConstraint(k, { type: 'coincident', a: l.p1, b: 'O' });
    addConstraint(k, { ...dimensionFor(k, [l.id]) });
    return k;
  }
});

test('configurations: own suppression states, design table round trip', () => {
  const part = { variables: [{ name: 'W', expr: '100' }], features: [{ id: 'f1', name: 'Fillet1', type: 'fillet' }, { id: 'f2', name: 'Hole1', type: 'hole' }], configurations: [] };
  const c = addConfiguration(part, 'NoHole');
  part.config = c.id;
  setSuppressedIn(part, 'f2', true);
  assert.equal(part.features[1].suppressed, undefined);
  assert.equal(effectiveFeatures(part)[1].suppressed, true);
  part.config = null;
  assert.ok(!effectiveFeatures(part)[1].suppressed);
  const csv = designTableCsv(part);
  assert.match(csv, /^Configuration,W,\$STATE@Hole1\nDefault,100,U\nNoHole,100,S\n$/);
  const r = applyDesignTable(part, `${csv}Big,250,U\n`);
  assert.equal(r.made, 1);
  const big = part.configurations.find((x) => x.name === 'Big');
  part.config = big.id;
  assert.equal(variableValues(part).values.get('W'), 250);
});

test('spline and ellipse make closed profiles', () => {
  const k = sk();
  addSpline(k, [[0, 0], [10, 10], [20, 0], [10, -10]], { closed: true });
  const regions = profiles(k);
  assert.equal(regions.length, 1);
  assert.ok(regions[0].outer.area > 200);
  const e = sk();
  addEllipse(e, 0, 0, 10, 4);
  near(profiles(e)[0].outer.area, Math.PI * 40);
});

test('sketch fillet and chamfer round / cut a rectangle corner', () => {
  const k = sk();
  const lines = addRectangle(k, 0, 0, 40, 20);
  const corner = lines[1].p2; // (40, 20)
  const arc = sketchFillet(k, corner, 5);
  assert.ok(arc);
  solveSketch(k);
  const [region] = profiles(k);
  near(region.outer.area, 800 - (25 - Math.PI * 25 / 4), 1e-3);
  const corner2 = lines[0].p1; // (0, 0)
  assert.ok(sketchChamfer(k, corner2, 4));
  near(profiles(k)[0].outer.area, 800 - (25 - Math.PI * 25 / 4) - 8, 1e-3);
});

test('offset, mirror and patterns copy geometry', () => {
  const k = sk();
  const lines = addRectangle(k, 0, 0, 10, 10);
  const made = offsetEntities(k, lines.map((l) => l.id), -2);
  assert.equal(made.length, 4);
  const areas = profiles(k).map((r) => r.outer.area).sort((a, b) => a - b);
  near(areas.at(-1), 196);
  const m = sk();
  const c = addCircle(m, 10, 5, 2);
  const axis = addLine(m, 0, -10, 0, 10, { construction: true });
  mirrorEntities(m, [c.id], axis.id);
  const centres = m.entities.filter((e) => e.type === 'circle').map((x) => byId(m, x.c).x).sort((a, b) => a - b);
  assert.deepEqual(centres, [-10, 10]);
  const p = sk();
  const c2 = addCircle(p, 20, 0, 1);
  circularSketchPattern(p, [c2.id], { count: 4 });
  assert.equal(p.entities.filter((e) => e.type === 'circle').length, 4);
  linearSketchPattern(p, [c2.id], { dx: 5, count: 3 });
  assert.equal(p.entities.filter((e) => e.type === 'circle').length, 6);
});

test('power trim cuts at crossings, extend reaches the next line', () => {
  const k = sk();
  const h = addLine(k, -10, 0, 10, 0);
  addLine(k, 0, -10, 0, 10);
  trimAt(k, h.id, 5, 0);
  const left = byId(k, h.p2);
  near(left.x, 0); near(left.y, 0);
  const e = sk();
  const a = addLine(e, 0, 0, 5, 0);
  addLine(e, 20, -5, 20, 5);
  assert.ok(extendAt(e, a.id, 5, 0));
  near(byId(e, a.p2).x, 20);
  const c = sk();
  const circle = addCircle(c, 0, 0, 10);
  addLine(c, -20, 0, 20, 0);
  trimAt(c, circle.id, 0, 10);
  assert.equal(c.entities.filter((x) => x.type === 'arc').length, 1);
});

test('a rebuild uses the equations', async () => {
  await loadKernel();
  const R = rep();
  const part = { id: 'p', name: 'P', variables: [{ name: 'T', expr: '7' }], features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'front' }, ...createSketchGeometry() });
  addRectangle(s, 0, 0, 10, 10);
  part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 1, exprs: { depth: 'T * 2' } }));
  near(R.measureVolume(regenerate(part).body), 1400, 1e-6);
});
