// Dimensions and diagnosis (sketch-diagnose.js and the solver): distance to a circle's nearest / farthest point,
// driven (reference) dimensions switched on and off, baseline dimensions from one base, and an over-defined sketch
// with the conflicting and redundant relations named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSketchGeometry, byId, addLine, addCircle, addConstraint, addRectangle, solveSketch, analyse, measure } from '../../src/cad/sketch.js';
import { diagnoseSketch, setDriven, setArcCondition, baselineDimensions, refreshDriven } from '../../src/cad/sketch-diagnose.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('distance between two circles: centres, nearest points (min) and farthest points (max)', () => {
  const s = createSketchGeometry();
  const c1 = addCircle(s, 0, 0, 5); const c2 = addCircle(s, 30, 0, 3);
  const d = addConstraint(s, { type: 'distance', a: c1.id, b: c2.id, value: 30 });
  near(measure(s, { ...d, value: 0 }), 30);
  assert.ok(setArcCondition(s, d.id, 'a', 'min')); assert.ok(setArcCondition(s, d.id, 'b', 'min'));
  near(d.value, 22);
  setArcCondition(s, d.id, 'b', 'max'); near(d.value, 28);
  // Driving the gap: 10 between the nearest points moves the circles to centres 18 apart (c1 fixed at the origin).
  setArcCondition(s, d.id, 'b', 'min'); d.value = 10;
  addConstraint(s, { type: 'fix', a: c1.c, x: 0, y: 0 }); addConstraint(s, { type: 'horizontal', a: c1.c, b: c2.c });
  addConstraint(s, { type: 'radius', a: c1.id, value: 5 }); addConstraint(s, { type: 'radius', a: c2.id, value: 3 });
  assert.ok(solveSketch(s).ok);
  near(byId(s, c2.c).x, 18, 1e-6);
  // A line to a circle's far side.
  const t = createSketchGeometry(); const c = addCircle(t, 0, 10, 4); const l = addLine(t, -20, 0, 20, 0);
  const k = addConstraint(t, { type: 'distance', a: c.id, b: l.id, value: 10, condA: 'max' });
  near(measure(t, { ...k, value: 0 }), 14);
});

test('a driven dimension follows the geometry; it drives again only when the sketch still solves', () => {
  const s = createSketchGeometry();
  const l = addLine(s, 0, 0, 40, 0);
  addConstraint(s, { type: 'fix', a: l.p1, x: 0, y: 0 }); addConstraint(s, { type: 'horizontal', a: l.id });
  const d = addConstraint(s, { type: 'distance', a: l.id, value: 40 });
  assert.ok(setDriven(s, d.id, true));
  assert.equal(d.driven, true);
  byId(s, l.p2).x = 55; refreshDriven(s); near(d.value, 55);
  assert.ok(setDriven(s, d.id, false)); assert.ok(!d.driven);
  // Fully fixed already (both ends fixed): a second length cannot drive.
  addConstraint(s, { type: 'fix', a: l.p2, x: 55, y: 0 });
  const d2 = addConstraint(s, { type: 'distance', a: l.id, value: 50, driven: true });
  assert.equal(setDriven(s, d2.id, false), false);
  assert.equal(d2.driven, true);
});

test('baseline dimensions: from a vertical base line, horizontal distances to every other point', () => {
  const s = createSketchGeometry();
  const base = addLine(s, 0, 0, 0, 30);
  const p = [10, 25, 47].map((x) => { const q = { id: `q${x}`, type: 'point', x, y: 5 }; s.entities.push(q); return q.id; });
  const made = baselineDimensions(s, base.id, p);
  assert.equal(made.length, 3);
  assert.ok(made.every((c) => c.type === 'hdistance' && c.baseline === base.id));
  assert.deepEqual(made.map((c) => c.value), [10, 25, 47]);
});

test('an over-defined rectangle: the conflicting dimension is named; a redundant relation is named', () => {
  const s = createSketchGeometry();
  const r = addRectangle(s, 0, 0, 40, 20); const L = r.lines ?? r;
  addConstraint(s, { type: 'horizontal', a: L[0].id }); addConstraint(s, { type: 'horizontal', a: L[2].id });
  addConstraint(s, { type: 'vertical', a: L[1].id }); addConstraint(s, { type: 'vertical', a: L[3].id });
  addConstraint(s, { type: 'fix', a: L[0].p1, x: 0, y: 0 });
  const w = addConstraint(s, { type: 'distance', a: L[0].id, value: 40 });
  addConstraint(s, { type: 'distance', a: L[1].id, value: 20 });
  assert.ok(solveSketch(s).ok);
  assert.equal(analyse(s).dof, 0);
  // A second width of 50 on the opposite side: cannot be solved; it or the first width conflicts.
  const w2 = addConstraint(s, { type: 'distance', a: L[2].id, value: 50 });
  const dg = diagnoseSketch(s);
  assert.equal(dg.over, true); assert.equal(dg.unsolvable, true);
  assert.ok(dg.conflicts.includes(w2.id) && dg.conflicts.includes(w.id), JSON.stringify(dg));
  // With the same value it is consistent but redundant.
  w2.value = 40; assert.ok(solveSketch(s).ok);
  const d2 = diagnoseSketch(s);
  assert.equal(d2.over, false);
  assert.ok(d2.redundant.includes(w2.id), JSON.stringify(d2));
});
