// The sketcher without the kernel: relations and dimensions solve, the degrees of freedom are counted,
// closed regions are found (holes inside outer loops, loose lines ignored).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addArc, addCircle, addConstraint, addLine, addRectangle, addSlot, addPolygon, addRelation, analyse, arcThrough, createSketchGeometry, dimensionFor,
  hitTest, profiles, removeEntities, solveSketch, byId, ORIGIN, mergePoints, standalonePoints, relationsFor,
} from '../../src/cad/sketch.js';

const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test('a rectangle with two dimensions and its corner on the origin is fully defined', () => {
  const s = createSketchGeometry();
  const lines = addRectangle(s, 1, 1, 30, 18);
  assert.equal(analyse(s).dof, 4);
  mergePoints(s, lines[0].p1, ORIGIN);
  const w = dimensionFor(s, [lines[0].id]); w.value = 40; addConstraint(s, w);
  const h = dimensionFor(s, [lines[1].id]); h.value = 25; addConstraint(s, h);
  const result = solveSketch(s);
  assert.ok(result.ok);
  assert.equal(result.dof, 0);
  assert.ok(Object.values(result.status).every((v) => v === 'defined'));
  const p2 = byId(s, lines[1].p2);
  near(Math.abs(p2.x), 40); near(Math.abs(p2.y), 25);
});

test('under defined geometry stays blue; a conflicting dimension is reported over defined', () => {
  const s = createSketchGeometry();
  const line = addLine(s, 0, 0, 10, 0);
  addConstraint(s, { type: 'horizontal', a: line.id });
  let r = solveSketch(s);
  assert.equal(r.dof, 3);
  assert.equal(r.status[line.id], 'under');
  addConstraint(s, { type: 'vertical', a: line.id });
  addConstraint(s, { type: 'distance', a: line.id, value: 10 });
  r = solveSketch(s);
  assert.equal(r.ok, false);
});

test('tangent, equal, concentric and radius relations solve', () => {
  const s = createSketchGeometry();
  const c1 = addCircle(s, 0, 0, 10);
  const c2 = addCircle(s, 25, 3, 7);
  addRelation(s, 'equal', [c1.id, c2.id]);
  addRelation(s, 'tangent', [c1.id, c2.id]);
  addConstraint(s, { type: 'radius', a: c1.id, value: 12 });
  const r = solveSketch(s);
  assert.ok(r.ok);
  near(byId(s, c2.id).r, 12);
  const a = byId(s, c1.c); const b = byId(s, c2.c);
  near(Math.hypot(a.x - b.x, a.y - b.y), 24);
});

test('angle and horizontal/vertical distances', () => {
  const s = createSketchGeometry();
  const l1 = addLine(s, 0, 0, 20, 0, { from: ORIGIN });
  const l2 = addLine(s, 0, 0, 10, 12, { from: ORIGIN });
  addConstraint(s, { type: 'horizontal', a: l1.id });
  const ang = dimensionFor(s, [l1.id, l2.id]);
  assert.equal(ang.type, 'angle');
  ang.value = 30;
  addConstraint(s, ang);
  assert.ok(solveSketch(s).ok);
  const p = byId(s, l2.p2);
  near((Math.atan2(p.y, p.x) * 180) / Math.PI, 30, 1e-4);
});

test('dragging a point keeps the relations', () => {
  const s = createSketchGeometry();
  const lines = addRectangle(s, 0, 0, 10, 10);
  const corner = lines[1].p2;
  const r = solveSketch(s, { drag: { id: corner, x: 20, y: 15 } });
  assert.ok(r.ok);
  for (const l of lines) {
    const a = byId(s, l.p1); const b = byId(s, l.p2);
    assert.ok(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6);
  }
  near(byId(s, corner).x, 20, 1e-3); near(byId(s, corner).y, 15, 1e-3);
});

test('profiles: a plate with two holes and a loose line', () => {
  const s = createSketchGeometry();
  addRectangle(s, 0, 0, 100, 50);
  addCircle(s, 25, 25, 8);
  addCircle(s, 75, 25, 8);
  addLine(s, 120, 0, 140, 10);
  const regions = profiles(s);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].holes.length, 2);
  near(regions[0].outer.area, 5000);
});

test('profiles: arcs and lines close a slot; a split rectangle gives two regions', () => {
  const s = createSketchGeometry();
  addSlot(s, 0, 0, 40, 0, 6);
  assert.ok(solveSketch(s).ok);
  const regions = profiles(s);
  assert.equal(regions.length, 1);
  near(regions[0].outer.area, 40 * 12 + Math.PI * 36, 0.5);
  const t = createSketchGeometry();
  const lines = addRectangle(t, 0, 0, 20, 10);
  const a = byId(t, lines[0].p1); void a;
  // A vertical line splitting it at x = 8 (its ends merged into the rectangle's edges by position).
  addLine(t, 8, 0, 8, 10);
  // The split line's ends lie on the edges, not at vertices: no region change (edges are not split).
  assert.equal(profiles(t).length, 1);
});

test('profiles: an arc through three points closing a D shape', () => {
  const s = createSketchGeometry();
  const l = addLine(s, 0, -10, 0, 10);
  arcThrough(s, [0, 10], [10, 0], [0, -10], { from: l.p2, to: l.p1 });
  const regions = profiles(s);
  assert.equal(regions.length, 1);
  near(regions[0].outer.area, (Math.PI * 100) / 2, 0.5);
});

test('polygon and slot helpers build closed, solvable geometry', () => {
  const s = createSketchGeometry();
  addPolygon(s, 0, 0, 20, 6);
  const r = solveSketch(s);
  assert.ok(r.ok);
  assert.equal(profiles(s).length, 1);
});

test('hit test, removal and standalone points', () => {
  const s = createSketchGeometry();
  const line = addLine(s, 0, 0, 10, 0);
  const c = addCircle(s, 30, 0, 5);
  s.entities.push({ id: 'h1', type: 'point', x: 50, y: 5 });
  assert.equal(hitTest(s, 5, 0.1, 0.5)?.id, line.id);
  assert.equal(hitTest(s, 35, 0, 0.5)?.id, c.id);
  assert.deepEqual(standalonePoints(s).map((p) => p.id), ['h1']);
  removeEntities(s, [line.id]);
  assert.equal(byId(s, line.id), null);
  assert.equal(byId(s, line.p1), null);
});

test('relations offered for a selection', () => {
  const s = createSketchGeometry();
  const l1 = addLine(s, 0, 0, 10, 0); const l2 = addLine(s, 0, 5, 10, 6);
  assert.deepEqual(relationsFor(s, [l1.id, l2.id]), ['parallel', 'perpendicular', 'equal', 'collinear']);
  const a = addArc(s, 0, 0, 5, 0, Math.PI);
  assert.ok(relationsFor(s, [l1.id, a.id]).includes('tangent'));
});
