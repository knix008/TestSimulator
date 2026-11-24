// Tangent arc, 3-point rectangles, parallelogram, perimeter circle, split entities, stretch and Fully Define Sketch:
// the shapes are right, they carry the relations that keep them so, and the solver agrees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addArc, addCircle, addConstraint, addLine, addRectangle, analyse, arcGeometry, byId, createSketchGeometry, profiles, solveSketch, curvePieces, polygonArea, DIMENSIONS } from '../../src/cad/sketch.js';
import { addTangentArc, addRect3, addRect3Center, addParallelogram, addCircle3, circleThrough3, splitAt, splitConic, stretchEntities, fullyDefine, outwardTangent, curveIntersections } from '../../src/cad/sketch-draw.js';
import { addConic, addEllipse, addEllipseArc, addEquationCurve, trimAt, extendAt } from '../../src/cad/sketchtools.js';
import { pieceAt, piecesPolyline } from '../../src/cad/sketch-curves.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const P = (s, id) => { const p = byId(s, id); return [p.x, p.y]; };
// The regions' exact area (their curves finely sampled; the profile's own outline is coarse).
const loopArea = (loop) => polygonArea(loop.segs.flatMap((g) => {
  if (g.kind === 'line') return [g.a];
  if (g.kind === 'pieces') return piecesPolyline(g.pieces, 4000).slice(0, -1);
  if (g.kind === 'circle') return Array.from({ length: 20000 }, (_, i) => [g.c[0] + g.r * Math.cos((i / 20000) * 2 * Math.PI), g.c[1] + g.r * Math.sin((i / 20000) * 2 * Math.PI)]);
  if (g.kind === 'arc') return Array.from({ length: 8000 }, (_, i) => { const t = g.ccw ? g.a0 + ((g.a1 - g.a0) * i) / 8000 : g.a1 - ((g.a1 - g.a0) * i) / 8000; return [g.c[0] + g.r * Math.cos(t), g.c[1] + g.r * Math.sin(t)]; });
  throw new Error(g.kind);
}));
const regionArea = (s) => profiles(s).reduce((sum, r) => sum + Math.abs(loopArea(r.outer)) - r.holes.reduce((h, x) => h + Math.abs(loopArea(x)), 0), 0);

test('tangent arc: leaves a line along it, turns either way, keeps its tangent relation when dragged', () => {
  for (const end of [[30, 10], [30, -10]]) {
    const s = createSketchGeometry();
    const l = addLine(s, 0, 0, 20, 0);
    const { entity: arc } = addTangentArc(s, l.p2, end);
    const g = arcGeometry(s, arc);
    // Centre straight above or below the line's end (radius perpendicular to the line there).
    near(g.cx, 20, 1e-12);
    near(Math.hypot(end[0] - g.cx, end[1] - g.cy), g.r, 1e-12);
    assert.ok(s.constraints.some((k) => k.type === 'tangent'));
    // Moving the arc's free end keeps it tangent to the line.
    const far = end[1] > 0 ? arc.p2 : arc.p1;
    assert.ok(solveSketch(s, { drag: { id: far, x: 35, y: end[1] * 2 } }).ok);
    const h = arcGeometry(s, arc);
    const d = [P(s, l.p2)[0] - P(s, l.p1)[0], P(s, l.p2)[1] - P(s, l.p1)[1]]; const rad = [P(s, l.p2)[0] - h.cx, P(s, l.p2)[1] - h.cy];
    near((d[0] * rad[0] + d[1] * rad[1]) / (Math.hypot(...d) * Math.hypot(...rad)), 0, 1e-7);
  }
  // From the end of an arc: continues smoothly (the new arc's centre lies on the old arc's radius line).
  const s = createSketchGeometry();
  const a = addArc(s, 0, 0, 10, 0, Math.PI / 2);
  const { entity: b } = addTangentArc(s, a.p2, [-15, 3]);
  const ga = arcGeometry(s, a); const gb = arcGeometry(s, b);
  const end = P(s, a.p2);
  near(Math.abs((gb.cx - end[0]) * (ga.cy - end[1]) - (gb.cy - end[1]) * (ga.cx - end[0])), 0, 1e-9);
  // Straight on: a collinear line instead.
  const k = createSketchGeometry();
  const l2 = addLine(k, 0, 0, 10, 0);
  const r = addTangentArc(k, l2.p2, [25, 0]);
  assert.ok(r.straight);
  assert.deepEqual(outwardTangent(k, l2, l2.p2), [1, 0]);
});

test('3-point rectangles at an angle: right corners, the right size, fully held by two sizes and a position', () => {
  const s = createSketchGeometry();
  const lines = addRect3(s, [0, 0], [30, 40], [-8, 6]);
  // Side 50 long, width 10 (distance of (−8, 6) from the first side).
  near(regionArea(s), 500, 1e-12);
  assert.ok(s.constraints.some((k) => k.type === 'perpendicular') && s.constraints.filter((k) => k.type === 'parallel').length === 2);
  assert.equal(analyse(s).dof, 5);
  void lines;
  const c = createSketchGeometry();
  const { lines: cl, center } = addRect3Center(c, [10, 10], [10, 30], [25, 10]);
  near(regionArea(c), 40 * 30, 1e-12);
  // The construction diagonals meet at the centre point.
  near(P(c, center)[0], 10, 1e-12);
  assert.ok(cl.length === 4 && c.constraints.filter((k) => k.type === 'midpoint').length === 2);
  // Drawn level: horizontal / vertical relations instead.
  const h = createSketchGeometry();
  addRect3(h, [0, 0], [20, 0], [5, 7]);
  assert.equal(h.constraints.filter((k) => k.type === 'horizontal' || k.type === 'vertical').length, 4);
});

test('parallelogram and perimeter circle', () => {
  const s = createSketchGeometry();
  addParallelogram(s, [0, 0], [20, 0], [26, 9]);
  near(regionArea(s), 20 * 9, 1e-12);
  // Dragging a corner keeps the opposite sides parallel.
  const pts = s.entities.filter((e) => e.type === 'point' && !e.origin);
  assert.ok(solveSketch(s, { drag: { id: pts[2].id, x: 30, y: 14 } }).ok);
  const [a, b, c, d] = pts.map((p) => [p.x, p.y]);
  near((b[0] - a[0]) * (c[1] - d[1]) - (b[1] - a[1]) * (c[0] - d[0]), 0, 1e-6);
  const g = circleThrough3([0, 0], [10, 0], [5, 5]);
  near(g.cx, 5, 1e-12); near(g.cy, 0, 1e-12); near(g.r, 5, 1e-12);
  const k = createSketchGeometry();
  const p = k.entities[0];
  const circle = addCircle3(k, [0, 0], [10, 0], [5, 5], [p.id]);
  assert.ok(k.constraints.some((x) => x.type === 'pointOnCircle' && x.a === p.id && x.b === circle.id));
  assert.equal(addCircle3(k, [0, 0], [1, 1], [2, 2]), null);
});

test('split: a line becomes two collinear lines, an arc two arcs on one centre, a circle two arcs', () => {
  const s = createSketchGeometry();
  const [bottom] = addRectangle(s, 0, 0, 40, 20);
  const q = splitAt(s, bottom.id, 15, 0.3);
  near(P(s, q)[0], 15, 1e-12); near(P(s, q)[1], 0, 1e-12);
  assert.ok(s.constraints.some((k) => k.type === 'collinear'));
  near(regionArea(s), 800, 1e-12);
  assert.equal(profiles(s)[0].outer.segs.length, 5);
  assert.ok(solveSketch(s).ok);
  const a = createSketchGeometry();
  const arc = addArc(a, 0, 0, 10, 0, Math.PI);
  const m = splitAt(a, arc.id, 0, 12);
  near(P(a, m)[0], 0, 1e-12); near(P(a, m)[1], 10, 1e-12);
  assert.equal(a.entities.filter((e) => e.type === 'arc' && e.c === arc.c).length, 2);
  const c = createSketchGeometry();
  const circle = addCircle(c, 0, 0, 5);
  addConstraint(c, { type: 'diameter', a: circle.id, value: 10 });
  splitAt(c, circle.id, 5, 0, [-5, 0]);
  const arcs = c.entities.filter((e) => e.type === 'arc');
  assert.equal(arcs.length, 2);
  near(regionArea(c), Math.PI * 25, 1e-6);
  // The diameter dimension now holds the first arc; the second is equal to it.
  assert.ok(c.constraints.some((k) => k.type === 'diameter' && k.a === arcs[0].id));
  assert.ok(solveSketch(c).ok);
  // A pick at an end of a curve (nothing to split off) does nothing.
  const l = addLine(c, 50, 0, 60, 0);
  assert.equal(splitAt(c, l.id, 49, 0), null);
  assert.equal(splitAt(c, l.id, 60, 0), null);
});

test('split a conic, a partial ellipse and an equation curve: the pieces are the same curve', () => {
  const [h1, h2] = splitConic([0, 0], [6, 9], [14, 1], 0.7, 0.35);
  const whole = { P: [[0, 0], [6, 9], [14, 1]], w: [1, 0.7, 1] };
  for (const f of [0.2, 0.6]) {
    // Every point of a half lies on the whole: compare with the nearest point on a fine sampling of the whole.
    const p = pieceAt({ P: h1.slice(0, 3), w: [1, h1[3], 1] }, f);
    const q = pieceAt({ P: h2.slice(0, 3), w: [1, h2[3], 1] }, f);
    for (const x of [p, q]) {
      let best = Infinity;
      for (let i = 0; i <= 20000; i++) { const y = pieceAt(whole, i / 20000); best = Math.min(best, Math.hypot(y[0] - x[0], y[1] - x[1])); }
      assert.ok(best < 2e-3, `off the conic by ${best}`);
    }
  }
  near(h1[2][0], pieceAt(whole, 0.35)[0], 1e-12);
  const s = createSketchGeometry();
  const cn = addConic(s, [0, 0], [6, 9], [14, 1], 0.4);
  addLine(s, 0, 0, 0, 0, { from: cn.p2, to: cn.p1 });
  const area0 = regionArea(s);
  assert.ok(splitAt(s, cn.id, 7, 5));
  near(regionArea(s), area0, 1e-6);
  assert.equal(s.entities.filter((e) => e.type === 'conic').length, 2);
  const e = createSketchGeometry();
  const ea = addEllipseArc(e, 0, 0, 10, 5, 0, 0, Math.PI);
  addLine(e, 0, 0, 0, 0, { from: ea.p2, to: ea.p1 });
  splitAt(e, ea.id, 0, 6);
  near(regionArea(e), Math.PI * 25, 1e-6);
  const q = createSketchGeometry();
  const eq = addEquationCurve(q, { fy: 'x^2/4', t0: -4, t1: 4 });
  const mid = splitAt(q, eq.id, 1, 0.2);
  near(P(q, mid)[0] ** 2 / 4, P(q, mid)[1], 1e-9);
  assert.equal(q.entities.filter((x) => x.type === 'equation').length, 2);
  assert.ok(q.entities.filter((x) => x.type === 'equation').every((x) => curvePieces(q, x).length > 0));
});

test('stretch keeps the relations: dragging one side of a rectangle widens it, a dimension stops it', () => {
  const s = createSketchGeometry();
  const lines = addRectangle(s, 0, 0, 40, 20);
  const right = lines[1];
  assert.ok(stretchEntities(s, [right.id], 10, 0));
  near(regionArea(s), 50 * 20, 1e-6);
  assert.equal(s.entities.filter((e) => e.type === 'line').length, 4);
  // The far side stayed where it was.
  near(byId(s, lines[3].p1).x, 0, 1e-6);
  // A width dimension and a fixed corner hold the rectangle: the stretch is refused and nothing moved.
  addConstraint(s, { type: 'distance', a: lines[0].id, value: 50 });
  const corner = byId(s, lines[0].p1);
  addConstraint(s, { type: 'fix', a: corner.id, x: corner.x, y: corner.y });
  assert.ok(solveSketch(s).ok);
  const before = s.entities.filter((e) => e.type === 'point').map((p) => [p.x, p.y]);
  assert.equal(stretchEntities(s, [right.id], 10, 0), false);
  assert.deepEqual(s.entities.filter((e) => e.type === 'point').map((p) => [p.x, p.y]), before);
});

test('fully define: a rectangle, a circle and an inclined triangle end with no freedom and nothing over-defined', () => {
  const s = createSketchGeometry();
  addRectangle(s, 10, 5, 50, 30);
  addCircle(s, 30, 17, 6);
  const r = fullyDefine(s);
  assert.equal(r.dof, 0);
  const a = analyse(s);
  assert.equal(a.dof, 0); assert.equal(a.over, false);
  assert.ok(Object.values(a.status).every((x) => x === 'defined'));
  assert.ok(r.dimensions >= 5);
  // Nothing moved: every dimension took the value the geometry had.
  assert.ok(solveSketch(s).ok);
  near(byId(s, s.entities.find((e) => e.type === 'circle').id).r, 6, 1e-9);
  const t = createSketchGeometry();
  const l1 = addLine(t, 3, 4, 40, 9);
  const l2 = addLine(t, 0, 0, 22, 35, { from: l1.p2 });
  addLine(t, 0, 0, 0, 0, { from: l2.p2, to: l1.p1 });
  const before = t.entities.filter((e) => e.type === 'point').map((p) => [p.x, p.y]);
  const rt = fullyDefine(t);
  assert.equal(rt.dof, 0);
  assert.equal(analyse(t).over, false);
  assert.ok(solveSketch(t).ok);
  // Dimension values are kept to 1e-6 mm, so the points stay within that.
  t.entities.filter((e) => e.type === 'point').forEach((p, i) => { near(p.x, before[i][0], 1e-5); near(p.y, before[i][1], 1e-5); });
  assert.ok(t.constraints.every((k) => !DIMENSIONS.includes(k.type) || Number.isFinite(k.value)));
  // A drawn-level line gets its relation first.
  const h = createSketchGeometry();
  addLine(h, 0, 0, 30, 0.2);
  const rh = fullyDefine(h);
  assert.equal(rh.relations, 1);
  assert.equal(rh.dof, 0);
  void polygonArea;
});

test('curve intersections: a line and an ellipse meet where the ellipse equation says, to 1e-9', () => {
  const s = createSketchGeometry();
  const e = addEllipseArc(s, 0, 0, 10, 5, 0, -3, 3);
  const l = addLine(s, 6, -10, 6, 10);
  const hits = curveIntersections(s, l, e);
  assert.equal(hits.length, 2);
  for (const h of hits) { near(h.point[0], 6, 1e-9); near(Math.abs(h.point[1]), 5 * Math.sqrt(1 - 0.36), 1e-9); }
  // A conic and a circle.
  const c = addCircle(s, 20, 0, 4);
  const k = addConic(s, [14, -6], [20, 10], [26, -6], 0.3);
  const hk = curveIntersections(s, k, c);
  assert.equal(hk.length, 2);
  for (const h of hk) near(Math.hypot(h.point[0] - 20, h.point[1]), 4, 1e-9);
});

test('trim: an ellipse cut by a line becomes a partial ellipse; a line is trimmed at an ellipse; conic and equation pieces go', () => {
  const s = createSketchGeometry();
  const el = addEllipse(s, 0, 0, 10, 5, 0);
  addLine(s, 6, -10, 6, 10);
  assert.ok(trimAt(s, el.id, 10, 0));
  const arcE = s.entities.find((x) => x.type === 'ellipseArc');
  assert.ok(arcE && !s.entities.some((x) => x.type === 'ellipse'));
  // What is left runs from the upper crossing round the left side to the lower one.
  near(P(s, arcE.p1)[0], 6, 1e-9); near(P(s, arcE.p1)[1], 4, 1e-9); near(P(s, arcE.p2)[1], -4, 1e-9);
  // Now the line: its top part beyond the ellipse goes.
  const line = s.entities.find((x) => x.type === 'line');
  assert.ok(trimAt(s, line.id, 6, 8));
  const ys = s.entities.filter((x) => x.type === 'line').flatMap((x) => [P(s, x.p1)[1], P(s, x.p2)[1]]);
  near(Math.max(...ys), 4, 1e-9);
  // A conic crossed twice by a line: the middle piece goes, two conics stay and still lie on the old curve.
  const k = createSketchGeometry();
  const cn = addConic(k, [0, 0], [10, 20], [20, 0], 0.5);
  addLine(k, -5, 6, 25, 6);
  assert.ok(trimAt(k, cn.id, 10, 9.9));
  const parts = k.entities.filter((x) => x.type === 'conic');
  assert.equal(parts.length, 2);
  for (const pc of parts) for (const id of [pc.p1, pc.p2]) { const [x, y] = P(k, id); near(y, (x * (20 - x)) / 10, 1e-7); }
  // y = sin x crossed by y = 0.5: trimming the hump's top removes the piece between the crossings.
  const q = createSketchGeometry();
  const eq = addEquationCurve(q, { fy: 'sin(x)', t0: 0, t1: Math.PI });
  addLine(q, -1, 0.5, 4, 0.5);
  assert.ok(trimAt(q, eq.id, Math.PI / 2, 1));
  const qs = q.entities.filter((x) => x.type === 'equation');
  assert.equal(qs.length, 2);
  near(Math.min(...qs.map((x) => x.t1)), Math.PI / 6, 1e-7);
  near(Math.max(...qs.map((x) => x.t0)), (5 * Math.PI) / 6, 1e-7);
});

test('extend: a line grows to an ellipse and to a parabola', () => {
  const s = createSketchGeometry();
  addEllipse(s, 0, 0, 10, 5, 0);
  const l = addLine(s, 0, 0, 3, 0);
  assert.ok(extendAt(s, l.id, 3, 0));
  near(Math.max(P(s, l.p1)[0], P(s, l.p2)[0]), 10, 1e-7);
  const k = createSketchGeometry();
  addConic(k, [-10, 10], [0, -10], [10, 10], 0.5);
  const v = addLine(k, 4, 20, 4, 15);
  assert.ok(extendAt(k, v.id, 4, 15));
  // The parabola through (−10, 10), (0, 0), (10, 10) is y = x² / 10.
  near(Math.min(P(k, v.p1)[1], P(k, v.p2)[1]), 1.6, 1e-7);
});
