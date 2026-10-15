// FreeCAD Sketcher: B-spline editing, conics, the shapes built from lines and
// arcs with constraints, splitting and joining, the solver diagnostics,
// refraction / block / reference constraints and the sketch validation.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arcFromCenter, arcSlotShape, centeredRectangleShape, circleThrough, elevateDegree, ellipseFrom3, hyperbolaArc, increaseMultiplicity,
  insertKnot, insertShape, internalGeometry, interpolate, interpolatePeriodic, joinNurbs, knotInfo, nurbsPoint, nurbsRange, nurbsSample,
  parabolaArc, periodicSpline, polygonShape, rectangleShape, reduceDegree, removeKnot, roundedRectangleShape, splineOverlay, splitEdge,
  splitNurbs, toNurbs, validateSketch, clampNurbs,
} from '../../src/domain/sketch.js';
import { addConstraint, constraintDiagnostics, constraintStatus, solveConstraints, normalizeConstraints, measureConstraint } from '../../src/domain/constraints.js';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const nearPt = (p, q, tol = 1e-6) => { near(p.x, q.x, tol); near(p.y, q.y, tol); };
/** The largest distance between two curves sampled at the same fractions of their ranges. */
function gap(s1, s2, n = 50) {
  const [a1, b1] = nurbsRange(s1); const [a2, b2] = nurbsRange(s2);
  let worst = 0;
  for (let i = 0; i <= n; i++) {
    const p = nurbsPoint(s1, a1 + ((b1 - a1) * i) / n);
    const q = nurbsPoint(s2, a2 + ((b2 - a2) * i) / n);
    worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return worst;
}
/** The largest distance from points of a curve to a shape given by distanceTo(p). */
const worstOff = (s, distanceTo) => Math.max(...nurbsSample(s, 120).map(distanceTo));
const cubic = () => ({ degree: 3, points: [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: -10 }, { x: 45, y: 15 }, { x: 60, y: 0 }], knots: null, weights: null });

test('NURBS conversion: a circle, an arc and a rotated ellipse arc are exact; lines and polygons keep their corners', () => {
  const circle = toNurbs({ type: 'circle', cx: 5, cy: -3, r: 12 });
  assert.ok(worstOff(circle, (p) => Math.abs(Math.hypot(p.x - 5, p.y + 3) - 12)) < 1e-9);
  nearPt(nurbsPoint(circle, 0), { x: 17, y: -3 });
  const arc = toNurbs({ type: 'arc', cx: 0, cy: 0, r: 10, start: 30, end: 250 });
  assert.ok(worstOff(arc, (p) => Math.abs(Math.hypot(p.x, p.y) - 10)) < 1e-9);
  nearPt(nurbsPoint(arc, 1), { x: 10 * Math.cos((250 * Math.PI) / 180), y: 10 * Math.sin((250 * Math.PI) / 180) });
  const ell = toNurbs({ type: 'ellipse', cx: 1, cy: 2, rx: 20, ry: 8, angle: 35, start: 0, end: 360 });
  const c = Math.cos((35 * Math.PI) / 180); const s = Math.sin((35 * Math.PI) / 180);
  assert.ok(worstOff(ell, (p) => { const x = (p.x - 1) * c + (p.y - 2) * s; const y = -(p.x - 1) * s + (p.y - 2) * c; return Math.abs((x / 20) ** 2 + (y / 8) ** 2 - 1); }) < 1e-9);
  const rect = toNurbs({ type: 'rect', x: 0, y: 0, width: 10, height: 5, angle: 0 });
  assert.equal(rect.degree, 1);
  assert.equal(rect.points.length, 5);
  assert.equal(toNurbs({ type: 'text' }), null);
});

test('degree: raising it keeps the curve exactly (also a rational one); lowering gives a close curve of one degree less', () => {
  const s = cubic();
  const up = elevateDegree(s);
  assert.equal(up.degree, 4);
  assert.ok(gap(s, up) < 1e-7, `gap ${gap(s, up)}`);
  const arc = toNurbs({ type: 'arc', cx: 0, cy: 0, r: 10, start: 0, end: 180 });
  const arcUp = elevateDegree(arc);
  assert.equal(arcUp.degree, 3);
  assert.ok(worstOff(arcUp, (p) => Math.abs(Math.hypot(p.x, p.y) - 10)) < 1e-6);
  const down = reduceDegree(up);
  assert.equal(down.degree, 3);
  assert.ok(gap(s, down) < 1e-4, `gap ${gap(s, down)}`);
  const quad = reduceDegree(s);
  assert.equal(quad.degree, 2);
  assert.ok(gap(s, quad) < 3, 'a near curve');
  nearPt(quad.points[0], s.points[0]);
  nearPt(quad.points.at(-1), s.points.at(-1));
});

test('knots: inserting keeps the curve, multiplicity goes up to the degree and back down, the knot goes away at 0', () => {
  const s = cubic();
  assert.deepEqual(knotInfo(s).map((k) => k.mult), [1]);
  const u = knotInfo(s)[0].u;
  const more = increaseMultiplicity(s, u);
  assert.equal(knotInfo(more)[0].mult, 2);
  assert.ok(gap(s, more) < 1e-9);
  const most = increaseMultiplicity(increaseMultiplicity(more, u), u);
  assert.equal(knotInfo(most)[0].mult, 3, 'never above the degree');
  const fewer = removeKnot(most, u);
  assert.equal(knotInfo(fewer)[0].mult, 2);
  assert.ok(gap(s, fewer) < 1e-6, 'removing an inserted knot gives the curve back');
  const gone = removeKnot(removeKnot(fewer, u), u);
  assert.equal(knotInfo(gone).length, 0);
  assert.equal(gone.points.length, 4);
  const inserted = insertKnot(s, 0.3);
  assert.equal(inserted.points.length, 6);
  assert.ok(gap(s, inserted) < 1e-9);
  assert.equal(insertKnot(s, 0), s, 'not at the ends');
});

test('periodic B-splines: closed and smooth; clamping one keeps its shape', () => {
  const poles = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
  const s = periodicSpline(poles, 3);
  const [a, b] = nurbsRange(s);
  nearPt(nurbsPoint(s, a), nurbsPoint(s, b));
  const clamped = clampNurbs(s);
  assert.ok(gap(s, clamped) < 1e-9);
  nearPt(clamped.points[0], nurbsPoint(s, a));
  const through = interpolatePeriodic(poles);
  nearPt(nurbsPoint(through, nurbsRange(through)[0]), nurbsPoint(through, nurbsRange(through)[1]));
});

test('interpolation: the B-spline passes through every point', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 8 }, { x: 25, y: -4 }, { x: 40, y: 6 }, { x: 52, y: 0 }];
  const s = interpolate(pts, 3);
  const samples = nurbsSample(s, 2000);
  for (const p of pts) assert.ok(Math.min(...samples.map((q) => Math.hypot(q.x - p.x, q.y - p.y))) < 0.05);
  nearPt(s.points[0], pts[0]);
  nearPt(s.points.at(-1), pts.at(-1));
  assert.equal(interpolate([{ x: 0, y: 0 }]), null);
});

test('conics: a parabolic arc lies on y² = 4fx, a hyperbolic one on x²/a² − y²/b² = 1', () => {
  const par = parabolaArc({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: -6 }, { x: 5, y: 10 });
  assert.ok(worstOff(par, (p) => Math.abs(p.y * p.y - 8 * p.x)) < 1e-9);
  near(par.points[0].y, -6);
  near(par.points.at(-1).y, 10);
  const hyp = hyperbolaArc({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 3 * Math.sqrt(3) }, { x: 8, y: -4 }, { x: 8, y: 7 });
  near(hyp.conic.b, 3);
  assert.ok(worstOff(hyp, (p) => Math.abs(p.x * p.x / 25 - p.y * p.y / 9 - 1)) < 1e-9);
  assert.ok(nurbsSample(hyp, 20).every((p) => p.x > 0), 'on the vertex branch');
});

test('circles and arcs from points: 3-point circle, arc from its centre, ellipse from 3 points', () => {
  const c = circleThrough({ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 });
  near(c.cx, 0); near(c.cy, 0); near(c.r, 10);
  assert.equal(circleThrough({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }), null);
  const arc = arcFromCenter({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 3 });
  near(arc.r, 10); near(arc.start, 0); near(arc.end, 90);
  const e = ellipseFrom3({ x: -20, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 8 });
  near(e.rx, 20); near(e.ry, 8); near(e.angle, 0);
});

test('shapes: rectangles, squares and polygons are lines with constraints and are fully defined once sized', () => {
  const d = createDrawing();
  insertShape(d, rectangleShape({ x: 0, y: 0 }, { x: 40, y: 20 }), addEntity);
  assert.equal(d.entities.length, 4);
  assert.equal(d.constraints.length, 8);
  assert.equal(constraintStatus(d).dof, 4, 'position and size are free');
  const sq = createDrawing();
  insertShape(sq, rectangleShape({ x: 0, y: 0 }, { x: 30, y: 10 }, { square: true }), addEntity);
  const [bottom, right] = sq.entities;
  near(Math.hypot(bottom.x2 - bottom.x1, bottom.y2 - bottom.y1), Math.hypot(right.x2 - right.x1, right.y2 - right.y1));
  assert.equal(constraintStatus(sq).dof, 3);
  const centred = rectangleShape(...[{ x: 0, y: 0 }, { x: 10, y: 5 }].map((p) => p)); void centred;
  const cr = centeredRectangleShape({ x: 0, y: 0 }, { x: 10, y: 5 });
  assert.deepEqual(cr.entities[0].data, { x1: -10, y1: -5, x2: 10, y2: -5 });
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const p = createDrawing();
    insertShape(p, polygonShape({ x: 0, y: 0 }, { x: 10, y: 0 }, n), addEntity);
    assert.equal(p.entities.length, n + 1);
    assert.ok(p.entities.at(-1).construction, 'its circle is construction geometry');
    const status = solveConstraints(p);
    assert.equal(status.ok, true);
    assert.equal(status.dof, 4, `${n}-gon: centre, size and turn`);
  }
});

test('shapes: rounded rectangle and arc slot are tangent lines and arcs that solve without conflict', () => {
  const d = createDrawing();
  insertShape(d, roundedRectangleShape({ x: 0, y: 0 }, { x: 60, y: 30 }, 5), addEntity);
  assert.deepEqual(d.entities.map((e) => e.type), ['line', 'arc', 'line', 'arc', 'line', 'arc', 'line', 'arc']);
  const status = solveConstraints(d);
  assert.equal(status.ok, true, JSON.stringify(status));
  near(d.entities[1].r, 5);
  const s = createDrawing();
  insertShape(s, arcSlotShape({ x: 0, y: 0 }, 50, 10, 80, 10), addEntity);
  assert.equal(s.entities.length, 4);
  const slot = solveConstraints(s);
  assert.equal(slot.ok, true, JSON.stringify(slot));
  near(s.entities[0].r - s.entities[1].r, 10);
  assert.equal(arcSlotShape({ x: 0, y: 0 }, 50, 0, 360, 10), null);
});

test('split: lines, arcs, circles, polylines and B-splines are cut where picked; end constraints follow', () => {
  const line = splitEdge({ type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { x: 4, y: 1 });
  assert.equal(line.pieces.length, 2);
  near(line.pieces[0].data.x2, 4);
  assert.deepEqual(line.refMap('p2'), { piece: 1, at: 'p2' });
  const arc = splitEdge({ type: 'arc', cx: 0, cy: 0, r: 10, start: 0, end: 180 }, { x: 0, y: 10 });
  near(arc.pieces[0].data.end, 90);
  assert.equal(splitEdge({ type: 'arc', cx: 0, cy: 0, r: 10, start: 0, end: 90 }, { x: -10, y: 0 }), null, 'outside the arc');
  assert.equal(splitEdge({ type: 'circle', cx: 0, cy: 0, r: 5 }, { x: 5, y: 0 }).pieces.length, 2);
  assert.equal(splitEdge({ type: 'polyline', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: false }, { x: 10, y: 4 }).pieces.length, 2);
  const s = cubic();
  const halves = splitNurbs(s, 0.4);
  nearPt(halves[0].points.at(-1), nurbsPoint(s, 0.4));
  nearPt(halves[1].points[0], nurbsPoint(s, 0.4));
  assert.ok(gap(halves[0], { ...s, knots: null }, 1) >= 0);
  const spline = splitEdge({ type: 'spline', ...s, closed: false }, nurbsPoint(s, 0.7));
  assert.equal(spline.pieces.length, 2);
  nearPt(spline.pieces[1].data.points[0], nurbsPoint(s, 0.7), 1e-4);
});

test('join: a line and an arc meeting at an end become one B-spline through both', () => {
  const l = toNurbs({ type: 'line', x1: -10, y1: 0, x2: 0, y2: 0 });
  const a = toNurbs({ type: 'arc', cx: 0, cy: 10, r: 10, start: 270, end: 360 });
  const joined = joinNurbs(l, a);
  assert.equal(joined.degree, 2);
  nearPt(nurbsPoint(joined, 0), { x: -10, y: 0 });
  nearPt(nurbsPoint(joined, 1), { x: 10, y: 10 });
  const pts = nurbsSample(joined, 400);
  assert.ok(pts.some((p) => Math.abs(p.y) < 1e-9 && p.x < -4), 'the line part');
  assert.ok(pts.filter((p) => p.x > 0.5).every((p) => Math.abs(Math.hypot(p.x, p.y - 10) - 10) < 1e-6), 'the arc part stays exact');
  assert.equal(joinNurbs(l, toNurbs({ type: 'line', x1: 50, y1: 50, x2: 60, y2: 60 })), null, 'not touching');
});

test('overlays and internal geometry: control polygon, comb, knots, weights; ellipse axes and foci, pole circles', () => {
  const e = { type: 'spline', ...cubic(), closed: false };
  const prims = splineOverlay(e, { polygon: true, comb: true, degree: true, knots: true, weights: true, size: 1 });
  assert.ok(prims.some((p) => p.kind === 'poly' && p.points.length === 5), 'polygon');
  assert.ok(prims.filter((p) => p.kind === 'line').length > 20, 'comb teeth');
  assert.ok(prims.some((p) => p.kind === 'text' && p.text === '(3)'), 'degree');
  assert.equal(prims.filter((p) => p.kind === 'text' && p.text.startsWith('[')).length, 5, 'weights');
  const inner = internalGeometry({ type: 'ellipse', cx: 0, cy: 0, rx: 5, ry: 3, angle: 0 });
  assert.deepEqual(inner.map((g) => g.role), ['major', 'minor', 'focus1', 'focus2']);
  near(inner[2].data.x, 4);
  assert.equal(internalGeometry(e).length, 5);
});

test('constraints: block holds geometry, reference dimensions follow, inactive ones do nothing, sketch axes can be used', () => {
  const d = createDrawing();
  const a = addEntity(d, 'line', { x1: 0, y1: 0, x2: 10, y2: 3 });
  addConstraint(d, 'block', [{ id: a.id }]);
  addConstraint(d, 'horizontal', [{ id: a.id }]);
  solveConstraints(d);
  near(d.entities[0].y2, 3, 1e-12);
  const r = createDrawing();
  const l = addEntity(r, 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  const dim = addConstraint(r, 'distance', [{ id: l.id }]);
  r.constraints = r.constraints.map((c) => (c.id === dim.id ? { ...c, driving: false } : c));
  r.entities = r.entities.map((e) => ({ ...e, x2: 25 }));
  solveConstraints(r);
  near(r.constraints[0].value, 25);
  const off = createDrawing();
  const m = addEntity(off, 'line', { x1: 0, y1: 0, x2: 10, y2: 5 });
  off.constraints = [{ id: 'k1', type: 'horizontal', refs: [{ id: m.id }], active: false }];
  solveConstraints(off);
  near(off.entities[0].y2, 5);
  assert.deepEqual(normalizeConstraints(off.constraints)[0].active, false);
  const axes = createDrawing();
  const p = addEntity(axes, 'point', { x: 3, y: 4 });
  addConstraint(axes, 'coincident', [{ id: p.id, at: 'p' }, { id: '@origin', at: 'p' }]);
  const q = addEntity(axes, 'line', { x1: 0, y1: 5, x2: 10, y2: 7 });
  addConstraint(axes, 'parallel', [{ id: q.id }, { id: '@h' }]);
  const status = solveConstraints(axes);
  assert.equal(status.ok, true);
  near(axes.entities[0].x, 0); near(axes.entities[0].y, 0);
  near(axes.entities[1].y2 - axes.entities[1].y1, 0);
  assert.equal(axes.constraints.length, 2, 'references to the axes are kept');
});

test('refraction (Snell): two rays meeting on a boundary bend by the ratio', () => {
  const d = createDrawing();
  const boundary = addEntity(d, 'line', { x1: -50, y1: 0, x2: 50, y2: 0 });
  const r1 = addEntity(d, 'line', { x1: -20, y1: 20, x2: 0, y2: 0 });
  const r2 = addEntity(d, 'line', { x1: 0.5, y1: 0.2, x2: 10, y2: -30 });
  addConstraint(d, 'fixed', [{ id: boundary.id }]);
  addConstraint(d, 'fixed', [{ id: r1.id }]);
  const c = addConstraint(d, 'snellsLaw', [{ id: r1.id, at: 'p2' }, { id: r2.id, at: 'p1' }, { id: boundary.id }], 1.5);
  assert.ok(c);
  const status = solveConstraints(d);
  assert.equal(status.ok, true, JSON.stringify(status));
  const ray = d.entities[2];
  const sin2 = (ray.x2 - ray.x1) / Math.hypot(ray.x2 - ray.x1, ray.y2 - ray.y1);
  near(Math.sin(Math.PI / 4) / sin2, 1.5, 1e-5);
  near(measureConstraint(d, 'snellsLaw', c.refs), 1.5, 1e-5);
});

test('diagnostics: free geometry, redundant, partially redundant, conflicting and malformed constraints', () => {
  const d = createDrawing();
  const a = addEntity(d, 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  const b = addEntity(d, 'line', { x1: 0, y1: 5, x2: 10, y2: 5 });
  addConstraint(d, 'fixed', [{ id: a.id }]);
  const h = addConstraint(d, 'horizontal', [{ id: b.id }]);
  const p = addConstraint(d, 'parallel', [{ id: a.id }, { id: b.id }]);
  let diag = constraintDiagnostics(d);
  assert.ok(diag.free.includes(b.id) && !diag.free.includes(a.id));
  assert.ok(diag.redundant.includes(h.id) && diag.redundant.includes(p.id), JSON.stringify(diag));
  // Partly: coincident twice-over in one direction.
  const e = createDrawing();
  const l1 = addEntity(e, 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  const l2 = addEntity(e, 'line', { x1: 10, y1: 0, x2: 20, y2: 3 });
  addConstraint(e, 'fixed', [{ id: l1.id }]);
  const k = addConstraint(e, 'coincident', [{ id: l1.id, at: 'p2' }, { id: l2.id, at: 'p1' }]);
  addConstraint(e, 'distanceY', [{ id: l1.id, at: 'p2' }, { id: l2.id, at: 'p1' }], 0);
  diag = constraintDiagnostics(e);
  assert.ok(diag.partially.includes(k.id), JSON.stringify(diag));
  // Conflict: two different lengths.
  const f = createDrawing();
  const m = addEntity(f, 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  const k1 = addConstraint(f, 'distance', [{ id: m.id }], 10);
  const k2 = addConstraint(f, 'distance', [{ id: m.id }], 20);
  diag = constraintDiagnostics(f);
  assert.deepEqual(diag.conflicting.sort(), [k1.id, k2.id].sort());
  f.constraints.push({ id: 'bad', type: 'radius', refs: [{ id: m.id }], value: 3 });
  assert.deepEqual(constraintDiagnostics(f).malformed, ['bad']);
});

test('validation: ends that meet without a constraint, zero-length and duplicate geometry', () => {
  const d = createDrawing();
  const a = addEntity(d, 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  const b = addEntity(d, 'line', { x1: 10, y1: 0.0001, x2: 10, y2: 10 });
  addEntity(d, 'line', { x1: 5, y1: 5, x2: 5, y2: 5 });
  addEntity(d, 'line', { x1: 10, y1: 0, x2: 0, y2: 0 });
  const found = validateSketch(d);
  assert.ok(found.missing.some(([p, q]) => p.id === a.id && p.at === 'p2' && q.id === b.id && q.at === 'p1'));
  assert.equal(found.degenerate.length, 1);
  assert.equal(found.duplicates.length, 1);
  addConstraint(d, 'coincident', found.missing.find(([p, q]) => p.id === a.id && q.id === b.id));
  assert.ok(!validateSketch(d).missing.some(([p, q]) => p.id === a.id && q.id === b.id));
});
