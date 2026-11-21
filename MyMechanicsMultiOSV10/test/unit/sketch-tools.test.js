// Every sketch entity type and editing tool, one behaviour per test: the geometry each builder makes, the
// degrees of freedom the solver counts, every relation and dimension type applied and satisfied numerically,
// conflicting / redundant constraints, the editing tools (fillet, chamfer, offset, mirror, patterns, trim,
// extend, move / copy / rotate / scale) and, on the kernel, convert entities and the intersection curve.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGIN, ENTITY_TYPES, RELATIONS, DIMENSIONS, createSketchGeometry, byId, pointsOf, arcGeometry, polyline, textWidth, hasRegions, addText,
  splineBeziers, bezierAt, sketchBounds, addConstraint, addLine, addCircle, addArc, arcThrough, addRectangle, addCenterRectangle, addPolygon,
  addSlot, removeEntities, geomKind, solveSketch, analyse, measure, dimensionFor, relationsFor, addRelation, autoRelationsForLine, mergePoints,
  hitTest, profiles, polygonArea, pointInPolygon, standalonePoints, constructionLines, cloneSketch,
} from '../../src/cad/sketch.js';
import {
  addSpline, addEllipse, sketchFillet, sketchChamfer, offsetEntities, mirrorEntities, linearSketchPattern, circularSketchPattern, intersect, trimAt, extendAt,
} from '../../src/cad/sketchtools.js';
// features.js first: it and advanced.js import each other, and the app loads features.js first too.
import '../../src/cad/features.js';
import { convertEntities, intersectionEntities, transformEntities, edgesToSketch } from '../../src/cad/sketch-more.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';

const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const fresh = () => createSketchGeometry();
const xy = (s, id) => { const p = byId(s, id); return [p.x, p.y]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lineLen = (s, l) => dist(xy(s, l.p1), xy(s, l.p2));
const lineDir = (s, l) => { const a = xy(s, l.p1); const b = xy(s, l.p2); const L = dist(a, b) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const pointLineDistance = (s, pid, l) => { const a = xy(s, l.p1); const d = lineDir(s, l); const p = xy(s, pid); return Math.abs(cross2(d, [p[0] - a[0], p[1] - a[1]])); };
const radiusOf = (s, e) => (e.type === 'circle' ? e.r : arcGeometry(s, e).r);
const lines = (s) => s.entities.filter((e) => e.type === 'line' && !e.construction);
const ofType = (s, type) => s.entities.filter((e) => e.type === type);
const solved = (s) => { const r = solveSketch(s); assert.ok(r.ok, `sketch solves (error ${r.error})`); return r; };
const dof = (s) => analyse(s).dof;

// ───────────────────────── registries

test('ENTITY_TYPES lists point, line, circle, arc, spline, ellipse and text', () => {
  assert.deepEqual([...ENTITY_TYPES].sort(), ['arc', 'circle', 'ellipse', 'line', 'point', 'spline', 'text']);
});

test('RELATIONS and DIMENSIONS have no duplicates and do not overlap', () => {
  assert.equal(new Set(RELATIONS).size, RELATIONS.length);
  assert.equal(new Set(DIMENSIONS).size, DIMENSIONS.length);
  assert.deepEqual(RELATIONS.filter((r) => DIMENSIONS.includes(r)), []);
});

test('a new sketch holds only the fixed origin point and no constraints', () => {
  const s = fresh();
  assert.deepEqual(s.entities.map((e) => e.id), [ORIGIN]);
  assert.equal(byId(s, ORIGIN).fixed, true);
  assert.equal(s.constraints.length, 0);
  assert.equal(dof(s), 0);
});

// ───────────────────────── one builder per entity type (shared checks)

const BUILDERS = {
  point: (s) => { const p = { id: 'pt1', type: 'point', x: 7, y: -3 }; s.entities.push(p); return { e: p, probe: [7, -3], dof: 2, points: 1 }; },
  line: (s) => ({ e: addLine(s, 1, 2, 11, 2), probe: [6, 2], dof: 4, points: 2 }),
  circle: (s) => ({ e: addCircle(s, 5, 5, 4), probe: [9, 5], dof: 3, points: 1 }),
  arc: (s) => ({ e: addArc(s, 0, 0, 10, 0, Math.PI / 2), probe: [10 * Math.SQRT1_2, 10 * Math.SQRT1_2], dof: 5, points: 3 }),
  spline: (s) => ({ e: addSpline(s, [[0, 0], [10, 5], [20, 0]]), probe: [20, 0], dof: 6, points: 3 }),
  ellipse: (s) => ({ e: addEllipse(s, 3, 4, 8, 2), probe: [11, 4], dof: 2, points: 1 }),
  text: (s) => ({ e: addText(s, 2, 3, 'AB', 10), probe: [2, 8], dof: 0, points: 0 }),
};

for (const type of ENTITY_TYPES) {
  test(`entity ${type}: the builder adds an entity of that type`, () => {
    const s = fresh();
    const { e } = BUILDERS[type](s);
    assert.equal(byId(s, e.id).type, type);
  });
  test(`entity ${type}: pointsOf lists its defining points`, () => {
    const s = fresh();
    const { e, points } = BUILDERS[type](s);
    const ids = pointsOf(e);
    assert.equal(ids.length, points);
    for (const id of ids) assert.equal(byId(s, id)?.type, 'point');
  });
  test(`entity ${type}: has a drawable polyline inside the sketch bounds`, () => {
    const s = fresh();
    const { e } = BUILDERS[type](s);
    const pts = polyline(s, e);
    assert.ok(pts.length >= 1);
    const b = sketchBounds(s);
    for (const [x, y] of pts) assert.ok(x >= b.x0 - 1e-9 && x <= b.x1 + 1e-9 && y >= b.y0 - 1e-9 && y <= b.y1 + 1e-9);
  });
  test(`entity ${type}: hit test picks it at a point on it`, () => {
    const s = fresh();
    const { e, probe } = BUILDERS[type](s);
    const hit = hitTest(s, probe[0], probe[1], 0.3);
    assert.ok(hit, 'something is hit');
    // A point on a curve end may win over the curve: either is the entity or one of its points.
    assert.ok(hit.id === e.id || pointsOf(e).includes(hit.id), `hit ${hit.id}`);
  });
  test(`entity ${type}: the solver counts ${BUILDERS[type](fresh()).dof} degrees of freedom`, () => {
    const s = fresh();
    const { dof: expected } = BUILDERS[type](s);
    assert.equal(dof(s), expected);
  });
}

test('geomKind treats an arc as a circle and returns null for nothing', () => {
  const s = fresh();
  assert.equal(geomKind(addArc(s, 0, 0, 5, 0, 1)), 'circle');
  assert.equal(geomKind(addLine(s, 0, 0, 1, 1)), 'line');
  assert.equal(geomKind(null), null);
});

// ───────────────────────── line, centerline, rectangles

test('line: from / to reuse existing points so two lines share a corner', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0);
  const b = addLine(s, 0, 0, 10, 10, { from: a.p2 });
  assert.equal(b.p1, a.p2);
  assert.equal(ofType(s, 'point').length, 1 + 3);
});

test('centerline: a construction line is listed as construction and closes no region', () => {
  const s = fresh();
  addLine(s, 0, -10, 0, 10, { construction: true });
  assert.equal(constructionLines(s).length, 1);
  assert.equal(profiles(s).length, 0);
  assert.equal(hasRegions(s), false);
});

test('rectangle: four joined lines with two horizontal and two vertical relations', () => {
  const s = fresh();
  const ls = addRectangle(s, 0, 0, 30, 20);
  assert.equal(ls.length, 4);
  for (let i = 0; i < 4; i++) assert.equal(ls[i].p2, ls[(i + 1) % 4].p1);
  assert.deepEqual(s.constraints.map((c) => c.type).sort(), ['horizontal', 'horizontal', 'vertical', 'vertical']);
});

test('rectangle: one region of area width × height', () => {
  const s = fresh();
  addRectangle(s, -5, -5, 25, 15);
  near(profiles(s)[0].outer.area, 600);
});

test('rectangle: 4 degrees of freedom (position and size)', () => {
  const s = fresh();
  addRectangle(s, 0, 0, 30, 20);
  assert.equal(dof(s), 4);
});

test('center rectangle: its centre point is the midpoint of the construction diagonal', () => {
  const s = fresh();
  const { lines: ls, center } = addCenterRectangle(s, 10, 5, 8, 3);
  const diag = constructionLines(s)[0];
  const a = xy(s, diag.p1); const b = xy(s, diag.p2);
  near((a[0] + b[0]) / 2, center.x); near((a[1] + b[1]) / 2, center.y);
  assert.equal(ls.length, 4);
});

test('center rectangle: dragging a corner keeps the centre in the middle', () => {
  const s = fresh();
  const { lines: ls, center } = addCenterRectangle(s, 0, 0, 10, 5);
  mergePoints(s, center.id, ORIGIN);
  const r = solveSketch(s, { drag: { id: ls[1].p2, x: 14, y: 9 } });
  assert.ok(r.ok);
  const p = xy(s, ls[1].p2); const q = xy(s, ls[0].p1);
  near(p[0] + q[0], 0, 1e-4); near(p[1] + q[1], 0, 1e-4);
});

test('center rectangle: centre on the origin leaves 2 degrees of freedom (width, height)', () => {
  const s = fresh();
  const { center } = addCenterRectangle(s, 0, 0, 10, 5);
  mergePoints(s, center.id, ORIGIN);
  assert.equal(dof(s), 2);
});

// ───────────────────────── circles and arcs

test('circle: a region of area π r²', () => {
  const s = fresh();
  addCircle(s, 3, 3, 6);
  near(profiles(s)[0].outer.area, Math.PI * 36, 1e-9);
});

test('circle: a radius below 1e-3 is clamped', () => {
  const s = fresh();
  assert.equal(addCircle(s, 0, 0, 0).r, 1e-3);
});

test('circle: centre on the origin and a diameter make it fully defined', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 5, { center: ORIGIN });
  addConstraint(s, { type: 'diameter', a: c.id, value: 16 });
  const r = solved(s);
  assert.equal(r.dof, 0);
  assert.equal(r.status[c.id], 'defined');
  near(c.r, 8);
});

test('centre-point arc: radius, start and end angles as given (counter-clockwise)', () => {
  const s = fresh();
  const a = addArc(s, 2, 3, 7, 0.25, 2);
  const g = arcGeometry(s, a);
  near(g.cx, 2); near(g.cy, 3); near(g.r, 7); near(g.a0, 0.25); near(g.a1, 2);
});

test('arcGeometry: an end angle before the start wraps by a full turn', () => {
  const s = fresh();
  const a = addArc(s, 0, 0, 5, 3, -3);
  const g = arcGeometry(s, a);
  assert.ok(g.a1 > g.a0);
  near(g.a1 - g.a0, 2 * Math.PI - 6, 1e-9);
});

test('arc: solving keeps both ends at the same distance from the centre', () => {
  const s = fresh();
  const a = addArc(s, 0, 0, 5, 0, Math.PI / 2);
  byId(s, a.p2).x = 1; byId(s, a.p2).y = 9;
  solved(s);
  near(dist(xy(s, a.c), xy(s, a.p1)), dist(xy(s, a.c), xy(s, a.p2)), 1e-6);
});

test('3-point arc: passes through start, middle and end points (drawn counter-clockwise)', () => {
  const s = fresh();
  const a = arcThrough(s, [10, 0], [0, 10], [-10, 0]);
  const g = arcGeometry(s, a);
  near(g.cx, 0); near(g.cy, 0); near(g.r, 10);
  near(xy(s, a.p1)[0], 10); near(xy(s, a.p2)[0], -10);
  near(g.a1 - g.a0, Math.PI);
});

test('3-point arc: drawn clockwise its ends swap so the arc still runs through the middle point', () => {
  const s = fresh();
  const a = arcThrough(s, [-10, 0], [0, 10], [10, 0]);
  const g = arcGeometry(s, a);
  const mid = (g.a0 + g.a1) / 2;
  near(g.cx + g.r * Math.cos(mid), 0, 1e-9); near(g.cy + g.r * Math.sin(mid), 10, 1e-9);
});

test('3-point arc: three points in a line give null', () => {
  const s = fresh();
  assert.equal(arcThrough(s, [0, 0], [5, 0], [10, 0]), null);
});

// ───────────────────────── polygon and slot

for (const sides of [3, 5, 6, 8]) {
  test(`polygon with ${sides} sides: ${sides} equal lines with vertices on the construction circle`, () => {
    const s = fresh();
    const { circle, lines: ls } = addPolygon(s, 0, 0, 10, sides);
    assert.equal(ls.length, sides);
    assert.equal(circle.construction, true);
    const L = lineLen(s, ls[0]);
    for (const l of ls) { near(lineLen(s, l), L, 1e-9); near(dist(xy(s, l.p1), [0, 0]), 10, 1e-9); }
    near(L, 2 * 10 * Math.sin(Math.PI / sides), 1e-9);
  });
}

test('polygon: the side count is clamped to 3 … 64', () => {
  assert.equal(addPolygon(fresh(), 0, 0, 5, 1).lines.length, 3);
  assert.equal(addPolygon(fresh(), 0, 0, 5, 200).lines.length, 64);
});

test('polygon: hexagon region area is (3√3 / 2) r²', () => {
  const s = fresh();
  addPolygon(s, 0, 0, 10, 6);
  near(profiles(s)[0].outer.area, (3 * Math.sqrt(3) / 2) * 100, 1e-6);
});

test('polygon: 4 degrees of freedom (centre, size, rotation)', () => {
  const s = fresh();
  addPolygon(s, 0, 0, 10, 6);
  assert.equal(dof(s), 4);
});

test('slot: two lines and two end arcs held by four tangents, one equal and one parallel', () => {
  const s = fresh();
  const slot = addSlot(s, 0, 0, 30, 0, 5);
  assert.equal(slot.lines.length, 2); assert.equal(slot.arcs.length, 2);
  const types = s.constraints.map((c) => c.type);
  assert.equal(types.filter((t) => t === 'tangent').length, 4);
  assert.ok(types.includes('equal') && types.includes('parallel'));
});

test('slot: the end arcs have the slot half-width as radius', () => {
  const s = fresh();
  const slot = addSlot(s, 0, 0, 30, 10, 4);
  for (const a of slot.arcs) near(arcGeometry(s, a).r, 4, 1e-9);
});

test('slot: the straight sides are as long as the centre distance', () => {
  const s = fresh();
  const slot = addSlot(s, 0, 0, 30, 40, 4);
  for (const l of slot.lines) near(lineLen(s, l), 50, 1e-9);
});

test('slot: its relations already hold when drawn', () => {
  const s = fresh();
  addSlot(s, 5, 5, 25, 15, 3);
  assert.equal(analyse(s).over, false);
});

test('slot: 5 degrees of freedom (two centres and the width)', () => {
  const s = fresh();
  addSlot(s, 0, 0, 30, 0, 5);
  assert.equal(dof(s), 5);
});

test('slot: both centres fixed and a radius make it fully defined (black)', () => {
  const s = fresh();
  const slot = addSlot(s, 0, 0, 30, 10, 5);
  addRelation(s, 'fix', [slot.axis.p1]); addRelation(s, 'fix', [slot.axis.p2]);
  addConstraint(s, { type: 'radius', a: slot.arcs[0].id, value: 6 });
  const r = solved(s);
  assert.equal(r.dof, 0);
  for (const e of [...slot.lines, ...slot.arcs]) assert.equal(r.status[e.id], 'defined');
  near(arcGeometry(s, slot.arcs[1]).r, 6, 1e-6);
});

test('slot: changing its radius keeps the sides tangent to the end arcs', () => {
  const s = fresh();
  const slot = addSlot(s, 0, 0, 30, 10, 5);
  addRelation(s, 'fix', [slot.axis.p1]); addRelation(s, 'fix', [slot.axis.p2]);
  addConstraint(s, { type: 'radius', a: slot.arcs[0].id, value: 8 });
  solved(s);
  for (const l of slot.lines) for (const a of slot.arcs) near(pointLineDistance(s, a.c, l), 8, 1e-5);
});

test('fillet: the filleted corner\'s tangent relations take away one degree of freedom (the radius)', () => {
  const s = fresh();
  const ls = addRectangle(s, 0, 0, 40, 20);
  const before = dof(s);
  sketchFillet(s, ls[0].p2, 5);
  // +2 points (4 unknowns) + arc centre (2) + arc implicit (−1) − 2 tangents − … : one more DOF than the rectangle (the radius).
  assert.equal(dof(s), before + 1);
});

// ───────────────────────── spline, ellipse, point, text

test('spline: its Bézier pieces start and end at its points', () => {
  const s = fresh();
  const sp = addSpline(s, [[0, 0], [10, 5], [20, -5], [30, 0]]);
  const bez = splineBeziers(s, sp);
  assert.equal(bez.length, 3);
  assert.deepEqual(bez[0][0], [0, 0]); assert.deepEqual(bez[1][0], [10, 5]); assert.deepEqual(bez[2][3], [30, 0]);
  assert.deepEqual(bezierAt(...bez[1], 0), [10, 5]);
});

test('spline: an open spline closes no region', () => {
  const s = fresh();
  addSpline(s, [[0, 0], [10, 5], [20, 0]]);
  assert.equal(profiles(s).length, 0);
});

test('spline: a closed spline repeats its first point and is a region of its own', () => {
  const s = fresh();
  const sp = addSpline(s, [[10, 0], [0, 10], [-10, 0], [0, -10]], { closed: true });
  assert.equal(sp.pts[0], sp.pts.at(-1));
  const r = profiles(s);
  assert.equal(r.length, 1);
  assert.ok(r[0].outer.area > 150 && r[0].outer.area < 400, `area ${r[0].outer.area}`);
});

test('spline: a closed spline drawn clockwise still has a positive area', () => {
  const s = fresh();
  addSpline(s, [[0, -10], [-10, 0], [0, 10], [10, 0]], { closed: true });
  assert.ok(profiles(s)[0].outer.area > 0);
});

test('spline: reusing point ids joins it to a line', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  const sp = addSpline(s, [[10, 0], [15, 5], [20, 0]], { ids: [l.p2] });
  assert.equal(sp.pts[0], l.p2);
});

test('ellipse: a region of area π · rx · ry', () => {
  const s = fresh();
  addEllipse(s, 0, 0, 10, 4);
  near(profiles(s)[0].outer.area, Math.PI * 40, 1e-9);
});

test('ellipse: a rotated ellipse\'s points satisfy its equation in its own axes', () => {
  const s = fresh();
  const e = addEllipse(s, 2, 1, 10, 4, Math.PI / 6);
  for (const [x, y] of polyline(s, e)) {
    const dx = x - 2; const dy = y - 1;
    const u = dx * Math.cos(Math.PI / 6) + dy * Math.sin(Math.PI / 6); const v = -dx * Math.sin(Math.PI / 6) + dy * Math.cos(Math.PI / 6);
    near((u * u) / 100 + (v * v) / 16, 1, 1e-9);
  }
});

test('ellipse: negative half axes are made positive', () => {
  const s = fresh();
  const e = addEllipse(s, 0, 0, -6, -2);
  assert.equal(e.rx, 6); assert.equal(e.ry, 2);
});

test('point: a loose point is a standalone point (a hole position); curve ends and the origin are not', () => {
  const s = fresh();
  addLine(s, 0, 0, 5, 5);
  s.entities.push({ id: 'h', type: 'point', x: 20, y: 20 });
  assert.deepEqual(standalonePoints(s).map((p) => p.id), ['h']);
});

test('point: a standalone-marked point on a construction line still counts as a hole position', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0, { construction: true });
  byId(s, l.p2).standalone = true;
  assert.deepEqual(standalonePoints(s).map((p) => p.id), [l.p2]);
});

test('text: width estimate is 0.62 × size per character', () => {
  near(textWidth({ text: 'ABCD', size: 10 }), 24.8);
  near(textWidth({ text: '', size: 5 }), 3.1);
});

test('text: makes the sketch usable for a feature; blank text does not', () => {
  const s = fresh();
  addText(s, 0, 0, '   ');
  assert.equal(hasRegions(s), false);
  addText(s, 0, 0, 'Hi');
  assert.equal(hasRegions(s), true);
});

test('text: a turned text\'s box turns about its lower-left corner', () => {
  const s = fresh();
  const t = addText(s, 5, 5, 'A', 10, Math.PI / 2);
  const box = polyline(s, t);
  near(box[1][0], 5, 1e-9); near(box[1][1], 5 + textWidth(t), 1e-9);
  near(box[3][0], -5, 1e-9); near(box[3][1], 5, 1e-9);
});

// ───────────────────────── relations: each applied, satisfied, and its DOF taken

/** setup(s) → { ids, check(s) (asserts it holds), removes (DOF it takes away) } — geometry starts violating it. */
const RELATION_CASES = {
  coincident: (s) => {
    const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 12, 3, 20, 8);
    return { ids: [a.p2, b.p1], removes: 2, check: () => near(dist(xy(s, a.p2), xy(s, b.p1)), 0, 1e-6) };
  },
  horizontal: (s) => { const l = addLine(s, 0, 0, 10, 4); return { ids: [l.id], removes: 1, check: () => near(xy(s, l.p1)[1], xy(s, l.p2)[1], 1e-6) }; },
  vertical: (s) => { const l = addLine(s, 0, 0, 3, 10); return { ids: [l.id], removes: 1, check: () => near(xy(s, l.p1)[0], xy(s, l.p2)[0], 1e-6) }; },
  parallel: (s) => {
    const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 5, 10, 9);
    return { ids: [a.id, b.id], removes: 1, check: () => near(cross2(lineDir(s, a), lineDir(s, b)), 0, 1e-6) };
  },
  perpendicular: (s) => {
    const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 3, 1, 8, 9);
    return { ids: [a.id, b.id], removes: 1, check: () => near(dot2(lineDir(s, a), lineDir(s, b)), 0, 1e-6) };
  },
  tangent: (s) => {
    const l = addLine(s, -10, 8, 10, 9); const c = addCircle(s, 0, 0, 5);
    return { ids: [l.id, c.id], removes: 1, check: () => near(pointLineDistance(s, c.c, l), c.r, 1e-6) };
  },
  equal: (s) => {
    const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 5, 4, 8);
    return { ids: [a.id, b.id], removes: 1, check: () => near(lineLen(s, a), lineLen(s, b), 1e-6) };
  },
  concentric: (s) => {
    const a = addCircle(s, 0, 0, 5); const b = addCircle(s, 3, 2, 2);
    return { ids: [a.id, b.id], removes: 2, check: () => near(dist(xy(s, a.c), xy(s, b.c)), 0, 1e-6) };
  },
  midpoint: (s) => {
    const l = addLine(s, 0, 0, 10, 0); s.entities.push({ id: 'm', type: 'point', x: 3, y: 4 });
    return { ids: ['m', l.id], removes: 2, check: () => { const a = xy(s, l.p1); const b = xy(s, l.p2); near(dist(xy(s, 'm'), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), 0, 1e-6); } };
  },
  pointOnLine: (s) => {
    const l = addLine(s, 0, 0, 10, 0); s.entities.push({ id: 'q', type: 'point', x: 4, y: 3 });
    return { ids: ['q', l.id], removes: 1, check: () => near(pointLineDistance(s, 'q', l), 0, 1e-6) };
  },
  pointOnCircle: (s) => {
    const c = addCircle(s, 0, 0, 5); s.entities.push({ id: 'q', type: 'point', x: 1, y: 1 });
    return { ids: ['q', c.id], removes: 1, check: () => near(dist(xy(s, 'q'), xy(s, c.c)), c.r, 1e-6) };
  },
  fix: (s) => {
    s.entities.push({ id: 'q', type: 'point', x: 3, y: 4 });
    return { ids: ['q'], removes: 2, check: () => { near(byId(s, 'q').x, 3); near(byId(s, 'q').y, 4); } };
  },
  symmetric: (s) => {
    const axis = addLine(s, 0, -10, 0, 10, { construction: true });
    s.entities.push({ id: 'u', type: 'point', x: -4, y: 1 }, { id: 'v', type: 'point', x: 6, y: 3 });
    return {
      ids: ['u', 'v', axis.id], removes: 2,
      check: () => {
        const u = xy(s, 'u'); const v = xy(s, 'v'); const d = lineDir(s, axis);
        near(dot2([v[0] - u[0], v[1] - u[1]], d), 0, 1e-6);
        near(pointLineDistance(s, 'u', axis), pointLineDistance(s, 'v', axis), 1e-6);
      },
    };
  },
  collinear: (s) => {
    const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 12, 2, 20, 3);
    return { ids: [a.id, b.id], removes: 2, check: () => { near(pointLineDistance(s, b.p1, a), 0, 1e-6); near(pointLineDistance(s, b.p2, a), 0, 1e-6); } };
  },
};

test('every relation type has a case in this test file', () => {
  assert.deepEqual(RELATIONS.filter((r) => !RELATION_CASES[r]), []);
});

for (const type of RELATIONS) {
  const setup = RELATION_CASES[type];
  if (!setup) continue;
  test(`relation ${type}: added between the picked entities it holds after solving`, () => {
    const s = fresh();
    const c = setup(s);
    addRelation(s, type, c.ids);
    solved(s);
    c.check();
  });
  test(`relation ${type}: takes away its degrees of freedom`, () => {
    const s = fresh();
    const c = setup(s);
    const before = dof(s);
    addRelation(s, type, c.ids);
    solved(s);
    assert.equal(before - dof(s), c.removes);
  });
  test(`relation ${type}: the solved sketch is not over defined`, () => {
    const s = fresh();
    const c = setup(s);
    addRelation(s, type, c.ids);
    solved(s);
    assert.equal(analyse(s).over, false);
  });
}

test('relation: adding the same relation twice keeps one constraint', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 1); const b = addLine(s, 0, 5, 10, 7);
  const k1 = addRelation(s, 'parallel', [a.id, b.id]);
  const k2 = addRelation(s, 'parallel', [b.id, a.id]);
  assert.equal(k1, k2);
  assert.equal(s.constraints.length, 1);
});

test('relation: coincident between a point and a line becomes point-on-line', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0); s.entities.push({ id: 'q', type: 'point', x: 2, y: 2 });
  assert.equal(addRelation(s, 'coincident', ['q', l.id]).type, 'pointOnLine');
});

test('relation: coincident between a point and a circle becomes point-on-circle', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 5); s.entities.push({ id: 'q', type: 'point', x: 2, y: 2 });
  assert.equal(addRelation(s, 'coincident', [c.id, 'q']).type, 'pointOnCircle');
});

test('relation: concentric between a point and a circle makes the point coincide with the centre', () => {
  const s = fresh();
  const c = addCircle(s, 4, 4, 5); s.entities.push({ id: 'q', type: 'point', x: 2, y: 2 });
  const k = addRelation(s, 'concentric', ['q', c.id]);
  assert.equal(k.type, 'coincident'); assert.equal(k.b, c.c);
  solved(s);
  near(dist(xy(s, 'q'), xy(s, c.c)), 0, 1e-6);
});

test('relation: fix stores the point\'s current position', () => {
  const s = fresh();
  s.entities.push({ id: 'q', type: 'point', x: 2.5, y: -1 });
  const k = addRelation(s, 'fix', ['q']);
  assert.equal(k.x, 2.5); assert.equal(k.y, -1);
});

test('relation: a fixed point stays put while its line is dragged', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  addRelation(s, 'fix', [l.p1]);
  assert.ok(solveSketch(s, { drag: { id: l.p2, x: 20, y: 5 } }).ok);
  near(byId(s, l.p1).x, 0, 1e-6); near(byId(s, l.p1).y, 0, 1e-6);
});

test('relation: horizontal between two points puts them at the same height', () => {
  const s = fresh();
  s.entities.push({ id: 'u', type: 'point', x: 0, y: 0 }, { id: 'v', type: 'point', x: 5, y: 3 });
  addRelation(s, 'horizontal', ['u', 'v']);
  solved(s);
  near(byId(s, 'u').y, byId(s, 'v').y, 1e-6);
});

test('relation: vertical between two points puts them one above the other', () => {
  const s = fresh();
  s.entities.push({ id: 'u', type: 'point', x: 0, y: 0 }, { id: 'v', type: 'point', x: 5, y: 3 });
  addRelation(s, 'vertical', ['u', 'v']);
  solved(s);
  near(byId(s, 'u').x, byId(s, 'v').x, 1e-6);
});

test('relation: tangent between two circles drawn apart is external (centres r1 + r2 apart)', () => {
  const s = fresh();
  const a = addCircle(s, 0, 0, 5); const b = addCircle(s, 20, 0, 3);
  const k = addRelation(s, 'tangent', [a.id, b.id]);
  assert.ok(!k.internal);
  solved(s);
  near(dist(xy(s, a.c), xy(s, b.c)), a.r + b.r, 1e-6);
});

test('relation: tangent between a circle inside another is internal (centres |r1 − r2| apart)', () => {
  const s = fresh();
  const a = addCircle(s, 0, 0, 10); const b = addCircle(s, 6, 0, 3);
  const k = addRelation(s, 'tangent', [a.id, b.id]);
  assert.equal(k.internal, true);
  solved(s);
  near(dist(xy(s, a.c), xy(s, b.c)), Math.abs(a.r - b.r), 1e-6);
});

test('relation: tangent between a line and an arc keeps the arc\'s radius as the distance', () => {
  const s = fresh();
  const l = addLine(s, -10, 7, 10, 8); const a = addArc(s, 0, 0, 5, 0, Math.PI);
  addRelation(s, 'tangent', [l.id, a.id]);
  solved(s);
  near(pointLineDistance(s, a.c, l), arcGeometry(s, a).r, 1e-6);
});

test('relation: equal between a circle and an arc gives them the same radius', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 5); const a = addArc(s, 20, 0, 3, 0, Math.PI);
  addRelation(s, 'equal', [c.id, a.id]);
  solved(s);
  near(c.r, arcGeometry(s, a).r, 1e-6);
});

test('relation: point on circle works on an arc', () => {
  const s = fresh();
  const a = addArc(s, 0, 0, 5, 0, Math.PI); s.entities.push({ id: 'q', type: 'point', x: 1, y: 1 });
  addRelation(s, 'coincident', ['q', a.id]);
  solved(s);
  near(dist(xy(s, 'q'), xy(s, a.c)), arcGeometry(s, a).r, 1e-6);
});

// ───────────────────────── relationsFor: what is offered per selection

const OFFERS = [
  ['one line', (s) => [addLine(s, 0, 0, 1, 0).id], ['horizontal', 'vertical']],
  ['one point', (s) => [addLine(s, 0, 0, 1, 0).p1], ['fix']],
  ['two points', (s) => { const l = addLine(s, 0, 0, 1, 0); return [l.p1, l.p2]; }, ['coincident', 'horizontal', 'vertical']],
  ['two circles', (s) => [addCircle(s, 0, 0, 1).id, addCircle(s, 5, 0, 1).id], ['equal', 'concentric', 'tangent']],
  ['a line and a circle', (s) => [addLine(s, 0, 0, 1, 0).id, addCircle(s, 5, 0, 1).id], ['tangent']],
  ['a point and a line', (s) => { s.entities.push({ id: 'q', type: 'point', x: 3, y: 3 }); return ['q', addLine(s, 0, 0, 1, 0).id]; }, ['coincident', 'midpoint']],
  ['a point and a circle', (s) => { s.entities.push({ id: 'q', type: 'point', x: 3, y: 3 }); return ['q', addCircle(s, 0, 0, 1).id]; }, ['coincident', 'concentric']],
  ['two points and a line', (s) => { s.entities.push({ id: 'u', type: 'point', x: 3, y: 3 }, { id: 'v', type: 'point', x: -3, y: 3 }); return ['u', 'v', addLine(s, 0, 0, 0, 1).id]; }, ['symmetric']],
  ['a point and an arc', (s) => { s.entities.push({ id: 'q', type: 'point', x: 3, y: 3 }); return ['q', addArc(s, 0, 0, 1, 0, 1).id]; }, ['coincident', 'concentric']],
  ['a text alone', (s) => [addText(s, 0, 0, 'x').id], []],
];
for (const [what, pick, expected] of OFFERS) {
  test(`relationsFor ${what}: offers ${expected.join(', ') || 'nothing'}`, () => {
    const s = fresh();
    assert.deepEqual(relationsFor(s, pick(s)), expected);
  });
}

// ───────────────────────── automatic relations while drawing

test('auto relation: a nearly horizontal new line gets horizontal', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0.2);
  autoRelationsForLine(s, l);
  assert.deepEqual(s.constraints.map((c) => c.type), ['horizontal']);
});

test('auto relation: a nearly vertical new line (drawn downwards) gets vertical', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 0.2, -10);
  autoRelationsForLine(s, l);
  assert.deepEqual(s.constraints.map((c) => c.type), ['vertical']);
});

test('auto relation: a slanted new line gets none', () => {
  const s = fresh();
  autoRelationsForLine(s, addLine(s, 0, 0, 10, 6));
  assert.equal(s.constraints.length, 0);
});

// ───────────────────────── dimensions: each type drives the geometry

const DIMENSION_CASES = {
  distance: (s) => { const l = addLine(s, 0, 0, 10, 3); return { c: { type: 'distance', a: l.id, value: 25 }, check: () => near(lineLen(s, l), 25, 1e-6) }; },
  hdistance: (s) => {
    s.entities.push({ id: 'u', type: 'point', x: 1, y: 1 }, { id: 'v', type: 'point', x: 6, y: 4 });
    return { c: { type: 'hdistance', a: 'u', b: 'v', sign: 1, value: 12 }, check: () => near(byId(s, 'v').x - byId(s, 'u').x, 12, 1e-6) };
  },
  vdistance: (s) => {
    s.entities.push({ id: 'u', type: 'point', x: 1, y: 1 }, { id: 'v', type: 'point', x: 6, y: 4 });
    return { c: { type: 'vdistance', a: 'u', b: 'v', sign: 1, value: 9 }, check: () => near(byId(s, 'v').y - byId(s, 'u').y, 9, 1e-6) };
  },
  radius: (s) => { const c = addCircle(s, 0, 0, 5); return { c: { type: 'radius', a: c.id, value: 7.5 }, check: () => near(c.r, 7.5, 1e-6) }; },
  diameter: (s) => { const c = addCircle(s, 0, 0, 5); return { c: { type: 'diameter', a: c.id, value: 30 }, check: () => near(c.r, 15, 1e-6) }; },
  angle: (s) => {
    const a = addLine(s, 0, 0, 10, 0, { from: ORIGIN }); const b = addLine(s, 0, 0, 5, 8, { from: ORIGIN });
    addConstraint(s, { type: 'horizontal', a: a.id });
    return { c: { type: 'angle', a: a.id, b: b.id, sign: 1, value: 40 }, check: () => { const d = lineDir(s, b); near((Math.atan2(d[1], d[0]) * 180) / Math.PI, 40, 1e-4); } };
  },
};

test('every dimension type has a case in this test file', () => {
  assert.deepEqual(DIMENSIONS.filter((d) => !DIMENSION_CASES[d]), []);
});

for (const type of DIMENSIONS) {
  const setup = DIMENSION_CASES[type];
  if (!setup) continue;
  test(`dimension ${type}: drives the geometry to its value`, () => {
    const s = fresh();
    const { c, check } = setup(s);
    addConstraint(s, c);
    solved(s);
    check();
  });
  test(`dimension ${type}: takes away one degree of freedom`, () => {
    const s = fresh();
    const { c } = setup(s);
    const before = dof(s);
    addConstraint(s, c);
    solved(s);
    assert.equal(before - dof(s), 1);
  });
  test(`dimension ${type}: measure() reads back the driven value`, () => {
    const s = fresh();
    const { c } = setup(s);
    const k = addConstraint(s, c);
    solved(s);
    near(Math.abs(measure(s, k)), c.value, 1e-4);
  });
  test(`dimension ${type}: a driven (reference) dimension moves nothing`, () => {
    const s = fresh();
    const { c } = setup(s);
    const before = JSON.stringify(s.entities);
    const d0 = dof(s);
    addConstraint(s, { ...c, driven: true });
    solved(s);
    assert.equal(JSON.stringify(s.entities), before);
    assert.equal(dof(s), d0);
  });
}

test('dimension: a suppressed constraint is ignored by the solver', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  addConstraint(s, { type: 'distance', a: l.id, value: 50, suppressed: true });
  solved(s);
  near(lineLen(s, l), 10);
});

// distance between entity pairs
const DISTANCE_PAIRS = [
  ['two points', (s) => { s.entities.push({ id: 'u', type: 'point', x: 0, y: 0 }, { id: 'v', type: 'point', x: 3, y: 4 }); return ['u', 'v', () => dist(xy(s, 'u'), xy(s, 'v'))]; }],
  ['two parallel lines', (s) => { const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 4, 10, 4); addRelation(s, 'parallel', [a.id, b.id]); return [a.id, b.id, () => pointLineDistance(s, b.p1, a)]; }],
  ['a point and a line', (s) => { const l = addLine(s, 0, 0, 10, 0); s.entities.push({ id: 'q', type: 'point', x: 5, y: 3 }); return ['q', l.id, () => pointLineDistance(s, 'q', l)]; }],
  ['two circles (centres)', (s) => { const a = addCircle(s, 0, 0, 2); const b = addCircle(s, 6, 0, 2); return [a.id, b.id, () => dist(xy(s, a.c), xy(s, b.c))]; }],
  ['a circle and a point', (s) => { const a = addCircle(s, 0, 0, 2); s.entities.push({ id: 'q', type: 'point', x: 5, y: 3 }); return [a.id, 'q', () => dist(xy(s, a.c), xy(s, 'q'))]; }],
  ['a circle and a line', (s) => { const a = addCircle(s, 0, 8, 2); const l = addLine(s, -10, 0, 10, 0); return [a.id, l.id, () => pointLineDistance(s, a.c, l)]; }],
];
for (const [what, setup] of DISTANCE_PAIRS) {
  test(`distance dimension between ${what}: holds 17 after solving`, () => {
    const s = fresh();
    const [a, b, measureNow] = setup(s);
    addConstraint(s, { type: 'distance', a, b, value: 17 });
    solved(s);
    near(measureNow(), 17, 1e-6);
  });
}

test('dimension: radius on an arc drives the arc radius', () => {
  const s = fresh();
  const a = addArc(s, 0, 0, 5, 0, Math.PI / 2);
  addConstraint(s, { type: 'radius', a: a.id, value: 9 });
  solved(s);
  near(arcGeometry(s, a).r, 9, 1e-6);
});

test('dimension: hdistance with sign −1 measures right-to-left', () => {
  const s = fresh();
  s.entities.push({ id: 'u', type: 'point', x: 10, y: 0 }, { id: 'v', type: 'point', x: 2, y: 0 });
  addConstraint(s, { type: 'hdistance', a: 'u', b: 'v', sign: -1, value: 5 });
  solved(s);
  near(byId(s, 'u').x - byId(s, 'v').x, 5, 1e-6);
});

test('dimension: hdistance of a single line measures its own ends', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 4, 7);
  addConstraint(s, { type: 'hdistance', a: l.id, value: 11 });
  solved(s);
  near(xy(s, l.p2)[0] - xy(s, l.p1)[0], 11, 1e-6);
});

test('dimension: hdistance between circles measures between centres', () => {
  const s = fresh();
  const a = addCircle(s, 0, 0, 2); const b = addCircle(s, 5, 5, 2);
  addConstraint(s, { type: 'hdistance', a: a.id, b: b.id, sign: 1, value: 20 });
  solved(s);
  near(xy(s, b.c)[0] - xy(s, a.c)[0], 20, 1e-6);
});

// dimensionFor: the dimension the Smart Dimension tool proposes
test('dimensionFor one line: its length as a distance', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 3, 4);
  const d = dimensionFor(s, [l.id]);
  assert.equal(d.type, 'distance'); near(d.value, 5);
});

test('dimensionFor one circle: its diameter (radius on request)', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 6);
  const d = dimensionFor(s, [c.id]);
  assert.equal(d.type, 'diameter'); near(d.value, 12);
  const r = dimensionFor(s, [c.id], 'radius');
  assert.equal(r.type, 'radius'); near(r.value, 6);
});

test('dimensionFor one arc: its radius (diameter on request)', () => {
  const s = fresh();
  const a = addArc(s, 0, 0, 4, 0, 1);
  assert.equal(dimensionFor(s, [a.id]).type, 'radius');
  const d = dimensionFor(s, [a.id], 'diameter');
  assert.equal(d.type, 'diameter'); near(d.value, 8);
});

test('dimensionFor two parallel lines: their distance', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 6, 10, 6);
  const d = dimensionFor(s, [a.id, b.id]);
  assert.equal(d.type, 'distance'); near(d.value, 6);
});

test('dimensionFor two crossing lines: their angle', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 0, 10, 10);
  const d = dimensionFor(s, [a.id, b.id]);
  assert.equal(d.type, 'angle'); near(d.value, 45, 1e-6);
});

test('dimensionFor two points: their distance', () => {
  const s = fresh();
  s.entities.push({ id: 'u', type: 'point', x: 0, y: 0 }, { id: 'v', type: 'point', x: 6, y: 8 });
  const d = dimensionFor(s, ['u', 'v']);
  assert.equal(d.type, 'distance'); near(d.value, 10);
});

test('dimensionFor hdistance from right to left: positive value with sign −1', () => {
  const s = fresh();
  s.entities.push({ id: 'u', type: 'point', x: 10, y: 0 }, { id: 'v', type: 'point', x: 4, y: 0 });
  const d = dimensionFor(s, ['u', 'v'], 'hdistance');
  assert.equal(d.sign, -1); near(d.value, 6);
});

test('dimensionFor a lone point: nothing to dimension', () => {
  const s = fresh();
  s.entities.push({ id: 'u', type: 'point', x: 1, y: 1 });
  assert.equal(dimensionFor(s, ['u']), null);
});

test('dimensionFor: adding the proposed dimension moves nothing', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 0, 7, 9, { from: a.p1 });
  const before = JSON.stringify(s.entities);
  addConstraint(s, dimensionFor(s, [a.id, b.id]));
  solved(s);
  const now = s.entities.map((e) => (e.type === 'point' ? [e.x, e.y] : null)).filter(Boolean);
  const then = JSON.parse(before).map((e) => (e.type === 'point' ? [e.x, e.y] : null)).filter(Boolean);
  now.forEach((p, i) => { near(p[0], then[i][0], 1e-6); near(p[1], then[i][1], 1e-6); });
});

// ───────────────────────── fully defined, conflicts, redundancy

test('fully defined: a line from the origin, horizontal, with a length', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 8, 1, { from: ORIGIN });
  addRelation(s, 'horizontal', [l.id]);
  addConstraint(s, { type: 'distance', a: l.id, value: 20 });
  const r = solved(s);
  assert.equal(r.dof, 0);
  assert.equal(r.status[l.id], 'defined');
});

test('under defined: a free line is reported under (blue)', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 8, 1);
  assert.equal(analyse(s).status[l.id], 'under');
});

test('fully defined: the origin alone is defined', () => {
  assert.equal(analyse(fresh()).status[ORIGIN], 'defined');
});

test('conflict: horizontal and vertical on a line of fixed length cannot hold', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  addRelation(s, 'horizontal', [l.id]); addRelation(s, 'vertical', [l.id]);
  addConstraint(s, { type: 'distance', a: l.id, value: 10 });
  const r = solveSketch(s);
  assert.equal(r.ok, false);
  assert.equal(r.over, true);
  assert.equal(r.status[l.id], 'over');
});

test('conflict: two different lengths on one line', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  addConstraint(s, { type: 'distance', a: l.id, value: 10 });
  addConstraint(s, { type: 'distance', a: l.id, value: 14 });
  assert.equal(solveSketch(s).ok, false);
});

test('conflict: a radius and a diameter that disagree', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 5);
  addConstraint(s, { type: 'radius', a: c.id, value: 5 });
  addConstraint(s, { type: 'diameter', a: c.id, value: 14 });
  assert.equal(solveSketch(s).ok, false);
});

test('conflict: a point fixed in two different places', () => {
  const s = fresh();
  s.entities.push({ id: 'q', type: 'point', x: 1, y: 1 });
  addConstraint(s, { type: 'fix', a: 'q', x: 1, y: 1 });
  addConstraint(s, { type: 'coincident', a: 'q', b: ORIGIN });
  assert.equal(solveSketch(s).ok, false);
});

test('conflict: perpendicular and parallel on the same two lines', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 5, 10, 8);
  addRelation(s, 'parallel', [a.id, b.id]);
  addRelation(s, 'perpendicular', [a.id, b.id]);
  assert.equal(solveSketch(s).ok, false);
});

test('redundant but consistent: horizontal + length + horizontal distance solve and report 1 redundant equation', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  addRelation(s, 'horizontal', [l.id]);
  addConstraint(s, { type: 'distance', a: l.id, value: 10 });
  addConstraint(s, { type: 'hdistance', a: l.id, value: 10 });
  const r = solveSketch(s);
  assert.equal(r.ok, true);
  assert.equal(r.redundant, 1);
});

test('a failed drag keeps the old positions', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0, { from: ORIGIN });
  addRelation(s, 'horizontal', [l.id]);
  addConstraint(s, { type: 'distance', a: l.id, value: 10 });
  const r = solveSketch(s, { drag: { id: l.p2, x: 0, y: 30 } });
  // The end can only sit at x = ±10, y = 0: whatever the solver does, the relations still hold.
  near(xy(s, l.p2)[1], 0, 1e-6);
  near(Math.abs(xy(s, l.p2)[0]), 10, 1e-6);
  assert.equal(typeof r.ok, 'boolean');
});

// ───────────────────────── sketch fillet

function cornerRect() {
  const s = fresh();
  const ls = addRectangle(s, 0, 0, 40, 20);
  return { s, ls, corner: ls[0].p2 }; // (40, 0): lines 0 and 1 meet there
}

test('fillet: makes a tangent arc of the given radius at the corner', () => {
  const { s, corner } = cornerRect();
  const arc = sketchFillet(s, corner, 5);
  assert.ok(arc);
  const g = arcGeometry(s, arc);
  near(g.r, 5, 1e-9); near(g.cx, 35, 1e-9); near(g.cy, 5, 1e-9);
});

test('fillet: adds two tangent relations that hold', () => {
  const { s, ls, corner } = cornerRect();
  const arc = sketchFillet(s, corner, 5);
  const ts = s.constraints.filter((c) => c.type === 'tangent' && c.b === arc.id);
  assert.deepEqual(ts.map((c) => c.a).sort(), [ls[0].id, ls[1].id].sort());
  for (const l of [ls[0], ls[1]]) near(pointLineDistance(s, arc.c, l), 5, 1e-9);
});

test('fillet: shortens both lines to the tangent points and removes the sharp corner point', () => {
  const { s, ls, corner } = cornerRect();
  sketchFillet(s, corner, 5);
  near(lineLen(s, ls[0]), 35, 1e-9); near(lineLen(s, ls[1]), 15, 1e-9);
  assert.equal(byId(s, corner), null);
});

test('fillet: the region loses r²(1 − π/4)', () => {
  const { s, corner } = cornerRect();
  sketchFillet(s, corner, 5);
  near(profiles(s)[0].outer.area, 800 - 25 * (1 - Math.PI / 4), 0.05);
});

test('fillet: the filleted rectangle still solves', () => {
  const { s, corner } = cornerRect();
  sketchFillet(s, corner, 5);
  solved(s);
});

test('fillet: a radius too large for the lines gives null and changes nothing', () => {
  const { s, corner } = cornerRect();
  const before = JSON.stringify(s);
  assert.equal(sketchFillet(s, corner, 30), null);
  assert.equal(JSON.stringify(s), before);
});

test('fillet: a point that is not a corner of two lines gives null', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  assert.equal(sketchFillet(s, l.p2, 2), null);
});

test('fillet: a zero radius gives null', () => {
  const { s, corner } = cornerRect();
  assert.equal(sketchFillet(s, corner, 0), null);
});

test('fillet: two collinear lines give null (no corner)', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); addLine(s, 0, 0, 20, 0, { from: a.p2 });
  assert.equal(sketchFillet(s, a.p2, 2), null);
});

// ───────────────────────── sketch chamfer

test('chamfer: equal distances cut a 45° line of length d√2', () => {
  const { s, corner } = cornerRect();
  const l = sketchChamfer(s, corner, 4);
  near(lineLen(s, l), 4 * Math.SQRT2, 1e-9);
});

test('chamfer: equal distances remove d²/2 from the region', () => {
  const { s, corner } = cornerRect();
  sketchChamfer(s, corner, 4);
  near(profiles(s)[0].outer.area, 800 - 8, 1e-6);
});

test('chamfer: two distances cut d1 along the first line and d2 along the second', () => {
  const { s, ls, corner } = cornerRect();
  sketchChamfer(s, corner, 4, 6);
  near(lineLen(s, ls[0]), 36, 1e-9); near(lineLen(s, ls[1]), 14, 1e-9);
  near(profiles(s)[0].outer.area, 800 - 12, 1e-6);
});

test('chamfer: removes the corner point', () => {
  const { s, corner } = cornerRect();
  sketchChamfer(s, corner, 4);
  assert.equal(byId(s, corner), null);
});

test('chamfer: a distance as long as the line gives null and adds no points', () => {
  const { s, corner } = cornerRect();
  const n = s.entities.length;
  assert.equal(sketchChamfer(s, corner, 20, 25), null);
  assert.equal(s.entities.length, n);
});

test('chamfer: a non-positive distance gives null', () => {
  const { s, corner } = cornerRect();
  assert.equal(sketchChamfer(s, corner, -1), null);
});

// ───────────────────────── offset entities

test('offset line: a parallel copy at the distance, to the left of its direction', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  const [n] = offsetEntities(s, [l.id], 3);
  near(xy(s, n.p1)[1], 3); near(xy(s, n.p2)[1], 3);
  near(lineLen(s, n), 10);
});

test('offset line: a negative distance goes to the right', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  const [n] = offsetEntities(s, [l.id], -2);
  near(xy(s, n.p1)[1], -2);
});

test('offset line: adds a parallel relation between original and copy', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 5);
  const [n] = offsetEntities(s, [l.id], 3);
  assert.ok(s.constraints.some((c) => c.type === 'parallel' && c.a === l.id && c.b === n.id));
  near(pointLineDistance(s, n.p1, l), 3, 1e-9);
});

test('offset circle: a concentric circle with radius r + d', () => {
  const s = fresh();
  const c = addCircle(s, 2, 2, 5);
  const [n] = offsetEntities(s, [c.id], 2);
  near(n.r, 7); near(dist(xy(s, n.c), [2, 2]), 0);
  assert.ok(s.constraints.some((k) => k.type === 'concentric' && k.b === n.id));
});

test('offset circle: an inward offset past the centre makes nothing', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 5);
  assert.deepEqual(offsetEntities(s, [c.id], -6), []);
});

test('offset arc: same span, radius r + d', () => {
  const s = fresh();
  const a = addArc(s, 0, 0, 5, 0, Math.PI / 2);
  const [n] = offsetEntities(s, [a.id], 3);
  const g = arcGeometry(s, n);
  near(g.r, 8); near(g.a0, 0); near(g.a1, Math.PI / 2);
});

test('offset ellipse: both half axes grow by d', () => {
  const s = fresh();
  const e = addEllipse(s, 0, 0, 6, 3);
  const [n] = offsetEntities(s, [e.id], 1);
  assert.equal(n.rx, 7); assert.equal(n.ry, 4);
});

test('offset of a closed rectangle inwards: a joined smaller rectangle (a hole in the region)', () => {
  const s = fresh();
  const ls = addRectangle(s, 0, 0, 40, 20);
  const made = offsetEntities(s, ls.map((l) => l.id), 2);
  assert.equal(made.length, 4);
  assert.equal(new Set(made.flatMap((l) => [l.p1, l.p2])).size, 4, 'the copies share their corners');
  const r = profiles(s);
  assert.equal(r.length, 1); assert.equal(r[0].holes.length, 1);
  near(r[0].holes[0].area, 36 * 16, 1e-6);
});

test('offset of a closed rectangle outwards: a 44 × 24 rectangle around it', () => {
  const s = fresh();
  const ls = addRectangle(s, 0, 0, 40, 20);
  offsetEntities(s, ls.map((l) => l.id), -2);
  const areas = profiles(s).flatMap((r) => [r.outer.area, ...r.holes.map((h) => h.area)]).sort((a, b) => b - a);
  near(areas[0], 44 * 24, 1e-6);
});

test('offset ignores points and text', () => {
  const s = fresh();
  const t = addText(s, 0, 0, 'A');
  assert.deepEqual(offsetEntities(s, [t.id, ORIGIN], 2), []);
});

// ───────────────────────── mirror

test('mirror: the copied line\'s points are reflected in the centerline', () => {
  const s = fresh();
  const axis = addLine(s, 0, -10, 0, 10, { construction: true });
  const l = addLine(s, 2, 1, 6, 3);
  const [m] = mirrorEntities(s, [l.id], axis.id);
  assert.deepEqual(xy(s, m.p1), [-2, 1]); assert.deepEqual(xy(s, m.p2), [-6, 3]);
});

test('mirror: adds a symmetric relation for every mirrored point', () => {
  const s = fresh();
  const axis = addLine(s, 0, -10, 0, 10, { construction: true });
  const l = addLine(s, 2, 1, 6, 3);
  mirrorEntities(s, [l.id], axis.id);
  assert.equal(s.constraints.filter((c) => c.type === 'symmetric' && c.c === axis.id).length, 2);
  assert.equal(analyse(s).over, false);
});

test('mirror: a slanted mirror line reflects correctly', () => {
  const s = fresh();
  const axis = addLine(s, 0, 0, 10, 10, { construction: true });
  s.entities.push({ id: 'q', type: 'point', x: 5, y: 0 });
  const [m] = mirrorEntities(s, ['q'], axis.id);
  near(m.x, 0, 1e-9); near(m.y, 5, 1e-9);
});

test('mirror: an arc stays counter-clockwise with the same span and its middle reflected', () => {
  const s = fresh();
  const axis = addLine(s, 0, -10, 0, 10, { construction: true });
  const a = addArc(s, 5, 0, 2, 0, Math.PI / 2);
  const [m] = mirrorEntities(s, [a.id], axis.id);
  const g0 = arcGeometry(s, a); const g = arcGeometry(s, m);
  near(g.a1 - g.a0, g0.a1 - g0.a0, 1e-9);
  const mid0 = (g0.a0 + g0.a1) / 2; const mid = (g.a0 + g.a1) / 2;
  near(g.cx + g.r * Math.cos(mid), -(g0.cx + g0.r * Math.cos(mid0)), 1e-9);
  near(g.cy + g.r * Math.sin(mid), g0.cy + g0.r * Math.sin(mid0), 1e-9);
});

test('mirror: a closed shape mirrored gives a second region of the same area', () => {
  const s = fresh();
  const axis = addLine(s, 0, -10, 0, 10, { construction: true });
  const ls = addRectangle(s, 2, 0, 8, 5);
  mirrorEntities(s, ls.map((l) => l.id), axis.id);
  const r = profiles(s);
  assert.equal(r.length, 2);
  near(r[0].outer.area, 30, 1e-9); near(r[1].outer.area, 30, 1e-9);
});

test('mirror: about something that is not a line does nothing', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 2); const l = addLine(s, 3, 3, 5, 5);
  assert.deepEqual(mirrorEntities(s, [l.id], c.id), []);
});

test('mirror: the mirror line itself is not copied', () => {
  const s = fresh();
  const axis = addLine(s, 0, -10, 0, 10, { construction: true });
  const l = addLine(s, 2, 1, 6, 3);
  assert.equal(mirrorEntities(s, [l.id, axis.id], axis.id).length, 1);
});

// ───────────────────────── linear and circular sketch patterns

test('linear pattern: count 3 makes two copies spaced dx', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 2);
  const made = linearSketchPattern(s, [c.id], { dx: 10, dy: 0, count: 3 });
  assert.equal(made.length, 2);
  assert.deepEqual(made.map((m) => xy(s, m.c)[0]).sort((a, b) => a - b), [10, 20]);
});

test('linear pattern: two directions make count × count2 − 1 copies', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 2);
  const made = linearSketchPattern(s, [c.id], { dx: 10, dy: 0, count: 3, dx2: 0, dy2: 8, count2: 2 });
  assert.equal(made.length, 5);
  assert.ok(made.some((m) => xy(s, m.c)[0] === 20 && xy(s, m.c)[1] === 8));
});

test('linear pattern: count 1 makes nothing', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 2);
  assert.deepEqual(linearSketchPattern(s, [c.id], { count: 1 }), []);
});

test('linear pattern: copies keep their shape (joined rectangle copies are regions)', () => {
  const s = fresh();
  const ls = addRectangle(s, 0, 0, 5, 5);
  linearSketchPattern(s, ls.map((l) => l.id), { dx: 10, dy: 0, count: 3 });
  assert.equal(profiles(s).length, 3);
});

test('circular pattern: 4 around 360° puts copies every 90°', () => {
  const s = fresh();
  s.entities.push({ id: 'q', type: 'point', x: 10, y: 0 });
  const made = circularSketchPattern(s, ['q'], { cx: 0, cy: 0, count: 4, angle: 360 });
  assert.equal(made.length, 3);
  const expected = [[0, 10], [-10, 0], [0, -10]];
  made.forEach((p, i) => { near(p.x, expected[i][0], 1e-9); near(p.y, expected[i][1], 1e-9); });
});

test('circular pattern: a partial angle spreads the copies over it (end to end)', () => {
  const s = fresh();
  s.entities.push({ id: 'q', type: 'point', x: 10, y: 0 });
  const made = circularSketchPattern(s, ['q'], { count: 3, angle: 90 });
  near(Math.atan2(made[0].y, made[0].x), Math.PI / 4, 1e-9);
  near(Math.atan2(made[1].y, made[1].x), Math.PI / 2, 1e-9);
});

test('circular pattern: about a centre other than the origin', () => {
  const s = fresh();
  s.entities.push({ id: 'q', type: 'point', x: 15, y: 5 });
  const [p] = circularSketchPattern(s, ['q'], { cx: 5, cy: 5, count: 2, angle: 360 });
  near(p.x, -5, 1e-9); near(p.y, 5, 1e-9);
});

test('circular pattern: copies of a circle keep the radius', () => {
  const s = fresh();
  const c = addCircle(s, 10, 0, 3);
  for (const m of circularSketchPattern(s, [c.id], { count: 6 })) { assert.equal(m.r, 3); near(dist(xy(s, m.c), [0, 0]), 10, 1e-9); }
});

test('pattern: the origin is never copied', () => {
  const s = fresh();
  assert.deepEqual(linearSketchPattern(s, [ORIGIN], { count: 3 }), []);
});

// ───────────────────────── intersections

test('intersect: two crossing segments meet at one point', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 10); const b = addLine(s, 0, 10, 10, 0);
  const [p] = intersect(s, a, b);
  near(p[0], 5); near(p[1], 5);
});

test('intersect: segments whose lines cross outside them do not meet', () => {
  const s = fresh();
  assert.deepEqual(intersect(s, addLine(s, 0, 0, 1, 1), addLine(s, 10, 0, 9, 1)), []);
});

test('intersect: parallel segments do not meet', () => {
  const s = fresh();
  assert.deepEqual(intersect(s, addLine(s, 0, 0, 10, 0), addLine(s, 0, 1, 10, 1)), []);
});

test('intersect: a line through a circle crosses it twice', () => {
  const s = fresh();
  const pts = intersect(s, addLine(s, -10, 0, 10, 0), addCircle(s, 0, 0, 5));
  assert.equal(pts.length, 2);
  assert.deepEqual(pts.map((p) => Math.round(p[0])).sort((a, b) => a - b), [-5, 5]);
});

test('intersect: a tangent line touches a circle once', () => {
  const s = fresh();
  const pts = intersect(s, addLine(s, -10, 5, 10, 5), addCircle(s, 0, 0, 5));
  assert.equal(pts.length, 1);
  near(pts[0][0], 0); near(pts[0][1], 5);
});

test('intersect: a line crosses an arc only on the arc\'s span', () => {
  const s = fresh();
  const arc = addArc(s, 0, 0, 5, 0, Math.PI);
  assert.equal(intersect(s, addLine(s, -10, 3, 10, 3), arc).length, 2);
  assert.equal(intersect(s, addLine(s, -10, -3, 10, -3), arc).length, 0);
});

test('intersect: two overlapping circles cross twice', () => {
  const s = fresh();
  const pts = intersect(s, addCircle(s, 0, 0, 5), addCircle(s, 6, 0, 5));
  assert.equal(pts.length, 2);
  for (const p of pts) near(p[0], 3, 1e-9);
});

test('intersect: circles apart, inside each other or concentric do not cross', () => {
  const s = fresh();
  assert.deepEqual(intersect(s, addCircle(s, 0, 0, 2), addCircle(s, 10, 0, 2)), []);
  assert.deepEqual(intersect(s, addCircle(s, 0, 0, 10), addCircle(s, 1, 0, 2)), []);
  assert.deepEqual(intersect(s, addCircle(s, 0, 0, 3), addCircle(s, 0, 0, 5)), []);
});

// ───────────────────────── trim

function crossedLine() {
  const s = fresh();
  const l = addLine(s, 0, 0, 30, 0);
  addLine(s, 10, -5, 10, 5); addLine(s, 20, -5, 20, 5);
  return { s, l };
}

test('trim: the middle piece of a line crossed twice is removed, leaving two lines', () => {
  const { s, l } = crossedLine();
  assert.equal(trimAt(s, l.id, 15, 0), true);
  const horizontal = lines(s).filter((e) => Math.abs(xy(s, e.p1)[1]) < 1e-9 && Math.abs(xy(s, e.p2)[1]) < 1e-9);
  assert.equal(horizontal.length, 2);
  const spans = horizontal.map((e) => [xy(s, e.p1)[0], xy(s, e.p2)[0]].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(spans, [[0, 10], [20, 30]]);
});

test('trim: the end piece of a line is cut back to the nearest crossing', () => {
  const { s, l } = crossedLine();
  trimAt(s, l.id, 5, 0);
  assert.deepEqual([xy(s, l.p1)[0], xy(s, l.p2)[0]], [10, 30]);
});

test('trim: the far end piece is cut back to the last crossing', () => {
  const { s, l } = crossedLine();
  trimAt(s, l.id, 25, 0);
  assert.deepEqual([xy(s, l.p1)[0], xy(s, l.p2)[0]], [0, 20]);
});

test('trim: a line nothing crosses is deleted', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  trimAt(s, l.id, 5, 0);
  assert.equal(byId(s, l.id), null);
});

test('trim: a circle crossed twice becomes the arc on the far side of the pick', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 10);
  addLine(s, -20, 0, 20, 0);
  trimAt(s, c.id, 0, 10);
  assert.equal(byId(s, c.id), null);
  const [arc] = ofType(s, 'arc');
  const g = arcGeometry(s, arc);
  near(g.r, 10); near(g.a1 - g.a0, Math.PI, 1e-9);
  const mid = (g.a0 + g.a1) / 2;
  near(Math.sin(mid), -1, 1e-9);
});

test('trim: a circle crossed once is deleted', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 10);
  addLine(s, 0, 0, 20, 0);
  trimAt(s, c.id, 0, 10);
  assert.equal(byId(s, c.id), null);
  assert.equal(ofType(s, 'arc').length, 0);
});

test('trim: an arc crossed once keeps the piece away from the pick', () => {
  const s = fresh();
  const a = addArc(s, 0, 0, 10, 0, Math.PI);
  addLine(s, 0, 0, 0, 15);
  trimAt(s, a.id, 10 * Math.cos(Math.PI / 4), 10 * Math.sin(Math.PI / 4));
  const g = arcGeometry(s, a);
  near(g.a0, Math.PI / 2, 1e-9); near(g.a1, Math.PI, 1e-9);
});

test('trim: an arc crossed twice loses its middle and splits in two', () => {
  const s = fresh();
  const a = addArc(s, 0, 0, 10, 0, Math.PI);
  addLine(s, -5, 0, -5, 15); addLine(s, 5, 0, 5, 15);
  trimAt(s, a.id, 0, 10);
  assert.equal(ofType(s, 'arc').length, 2);
});

test('trim: a spline (not cut by crossings) is deleted whole', () => {
  const s = fresh();
  const sp = addSpline(s, [[0, 0], [5, 5], [10, 0]]);
  trimAt(s, sp.id, 5, 5);
  assert.equal(byId(s, sp.id), null);
});

test('trim: the origin cannot be trimmed', () => {
  const s = fresh();
  assert.equal(trimAt(s, ORIGIN, 0, 0), false);
});

// ───────────────────────── extend

test('extend: a line grows to the next line ahead', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 5, 0);
  addLine(s, 20, -5, 20, 5);
  assert.equal(extendAt(s, l.id, 5, 0), true);
  near(xy(s, l.p2)[0], 20);
});

test('extend: from the start end it grows backwards', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 5, 0);
  addLine(s, -12, -5, -12, 5);
  extendAt(s, l.id, 0, 0);
  near(xy(s, l.p1)[0], -12); near(xy(s, l.p2)[0], 5);
});

test('extend: a line grows to the near side of a circle', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 5, 0);
  addCircle(s, 30, 0, 5);
  extendAt(s, l.id, 5, 0);
  near(xy(s, l.p2)[0], 25, 1e-9);
});

test('extend: the nearest of several curves wins', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 5, 0);
  addLine(s, 40, -5, 40, 5); addLine(s, 15, -5, 15, 5);
  extendAt(s, l.id, 5, 0);
  near(xy(s, l.p2)[0], 15);
});

test('extend: nothing ahead returns false and changes nothing', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 5, 0);
  addLine(s, -20, -5, -20, 5);
  assert.equal(extendAt(s, l.id, 5, 0), false);
  near(xy(s, l.p2)[0], 5);
});

test('extend: a shared end gets a new point so the other curve does not move', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 5, 0);
  const other = addLine(s, 0, 0, 5, 10, { from: l.p2 });
  addLine(s, 20, -5, 20, 5);
  extendAt(s, l.id, 5, 0);
  assert.notEqual(l.p2, other.p1);
  assert.deepEqual(xy(s, other.p1), [5, 0]);
  near(xy(s, l.p2)[0], 20);
});

test('extend: only lines can be extended', () => {
  const s = fresh();
  const c = addCircle(s, 0, 0, 2);
  assert.equal(extendAt(s, c.id, 2, 0), false);
});

test('extend: construction geometry is not a target', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 5, 0);
  addLine(s, 20, -5, 20, 5, { construction: true });
  assert.equal(extendAt(s, l.id, 5, 0), false);
});

// ───────────────────────── move / copy / rotate / scale

test('move: points shift by dx, dy', () => {
  const s = fresh();
  const l = addLine(s, 1, 1, 4, 5);
  transformEntities(s, [l.id], { kind: 'move', dx: 10, dy: -2 });
  assert.deepEqual(xy(s, l.p1), [11, -1]); assert.deepEqual(xy(s, l.p2), [14, 3]);
});

test('move: keeps the moved line\'s own relations and dimensions', () => {
  const s = fresh();
  const l = addLine(s, 1, 1, 4, 1);
  addRelation(s, 'horizontal', [l.id]);
  addConstraint(s, { type: 'distance', a: l.id, value: 3 });
  transformEntities(s, [l.id], { kind: 'move', dx: 5, dy: 5 });
  assert.deepEqual(s.constraints.map((c) => c.type).sort(), ['distance', 'horizontal']);
});

test('move: drops relations that tie moved entities to ones that stay', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 5, 10, 5);
  addRelation(s, 'parallel', [a.id, b.id]);
  transformEntities(s, [b.id], { kind: 'move', dx: 0, dy: 3 });
  assert.equal(s.constraints.length, 0);
});

test('move: drops fix relations on what moves', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  addRelation(s, 'fix', [l.p1]);
  transformEntities(s, [l.id], { kind: 'move', dx: 1, dy: 0 });
  assert.equal(s.constraints.length, 0);
});

test('move: a line on the origin gets its own point; the origin stays at 0,0', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0, { from: ORIGIN });
  transformEntities(s, [l.id], { kind: 'move', dx: 3, dy: 4 });
  assert.notEqual(l.p1, ORIGIN);
  assert.deepEqual(xy(s, ORIGIN), [0, 0]);
  assert.deepEqual(xy(s, l.p1), [3, 4]);
});

test('rotate: 90° about the origin turns (10, 0) to (0, 10)', () => {
  const s = fresh();
  const l = addLine(s, 5, 0, 10, 0);
  transformEntities(s, [l.id], { kind: 'rotate', angle: 90, cx: 0, cy: 0 });
  near(xy(s, l.p2)[0], 0, 1e-9); near(xy(s, l.p2)[1], 10, 1e-9);
});

test('rotate: about a given centre', () => {
  const s = fresh();
  s.entities.push({ id: 'q', type: 'point', x: 6, y: 2 });
  transformEntities(s, ['q'], { kind: 'rotate', angle: 180, cx: 4, cy: 2 });
  near(byId(s, 'q').x, 2, 1e-9); near(byId(s, 'q').y, 2, 1e-9);
});

test('rotate: drops horizontal / vertical relations of the turned entities', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  addRelation(s, 'horizontal', [l.id]);
  addConstraint(s, { type: 'distance', a: l.id, value: 10 });
  transformEntities(s, [l.id], { kind: 'rotate', angle: 30 });
  assert.deepEqual(s.constraints.map((c) => c.type), ['distance']);
});

test('rotate: an ellipse turns its axes too', () => {
  const s = fresh();
  const e = addEllipse(s, 0, 0, 5, 2, 0.1);
  transformEntities(s, [e.id], { kind: 'rotate', angle: 90 });
  near(e.rot, 0.1 + Math.PI / 2, 1e-12);
});

test('scale: points scale about the centre and radii scale', () => {
  const s = fresh();
  const c = addCircle(s, 4, 0, 3);
  transformEntities(s, [c.id], { kind: 'scale', factor: 2, cx: 0, cy: 0 });
  assert.equal(c.r, 6);
  assert.deepEqual(xy(s, c.c), [8, 0]);
});

test('scale: the scaled entities\' own length dimensions scale; angles do not', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 0, 10, 10, { from: a.p1 });
  addConstraint(s, { type: 'distance', a: a.id, value: 10 });
  addConstraint(s, { type: 'angle', a: a.id, b: b.id, value: 45, sign: 1 });
  transformEntities(s, [a.id, b.id], { kind: 'scale', factor: 3 });
  assert.equal(s.constraints.find((c) => c.type === 'distance').value, 30);
  assert.equal(s.constraints.find((c) => c.type === 'angle').value, 45);
});

test('scale: ellipse half axes and text size scale', () => {
  const s = fresh();
  const e = addEllipse(s, 0, 0, 5, 2); const t = addText(s, 1, 1, 'A', 10);
  transformEntities(s, [e.id, t.id], { kind: 'scale', factor: 0.5 });
  assert.equal(e.rx, 2.5); assert.equal(e.ry, 1);
  assert.equal(t.size, 5); assert.deepEqual([t.x, t.y], [0.5, 0.5]);
});

test('scale: a negative factor does nothing', () => {
  const s = fresh();
  const c = addCircle(s, 4, 0, 3);
  assert.deepEqual(transformEntities(s, [c.id], { kind: 'scale', factor: -2 }), []);
  assert.equal(c.r, 3);
});

test('copy: leaves the originals and returns moved copies', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  const [n] = transformEntities(s, [l.id], { kind: 'move', dx: 0, dy: 5, copy: true });
  assert.notEqual(n.id, l.id);
  assert.deepEqual(xy(s, l.p1), [0, 0]);
  assert.deepEqual(xy(s, n.p1), [0, 5]); assert.deepEqual(xy(s, n.p2), [10, 5]);
});

test('copy: a copied closed rectangle is a second region', () => {
  const s = fresh();
  const ls = addRectangle(s, 0, 0, 5, 5);
  transformEntities(s, ls.map((l) => l.id), { kind: 'move', dx: 20, dy: 0, copy: true });
  assert.equal(profiles(s).length, 2);
});

test('copy with rotate: a copied circle keeps its radius, scale copies scale it', () => {
  const s = fresh();
  const c = addCircle(s, 10, 0, 2);
  const [r] = transformEntities(s, [c.id], { kind: 'rotate', angle: 90, copy: true });
  assert.equal(r.r, 2);
  near(xy(s, r.c)[1], 10, 1e-9);
  const [k] = transformEntities(s, [c.id], { kind: 'scale', factor: 2, copy: true });
  assert.equal(k.r, 4);
});

test('copy: a copied point list returns the new points', () => {
  const s = fresh();
  s.entities.push({ id: 'q', type: 'point', x: 1, y: 2, standalone: true });
  const [p] = transformEntities(s, ['q'], { kind: 'move', dx: 1, dy: 1, copy: true });
  assert.deepEqual([p.x, p.y, p.standalone], [2, 3, true]);
});

// ───────────────────────── removal, merge, clone, helpers

test('remove: deleting a point deletes the lines on it and their relations', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 0, 5, 5, { from: a.p2 });
  addRelation(s, 'horizontal', [a.id]);
  removeEntities(s, [a.p2]);
  assert.equal(byId(s, a.id), null); assert.equal(byId(s, b.id), null);
  assert.equal(s.constraints.length, 0);
});

test('remove: deleting a line keeps the end point a neighbour still uses', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 0, 0, 5, 5, { from: a.p2 });
  removeEntities(s, [a.id]);
  assert.ok(byId(s, a.p2)); assert.equal(byId(s, a.p1), null); assert.ok(byId(s, b.id));
});

test('remove: the origin is never removed', () => {
  const s = fresh();
  removeEntities(s, [ORIGIN]);
  assert.ok(byId(s, ORIGIN));
});

test('merge points: the curves of the merged point use the kept one and coincident-to-self goes', () => {
  const s = fresh();
  const a = addLine(s, 0, 0, 10, 0); const b = addLine(s, 10, 0.1, 20, 0);
  addConstraint(s, { type: 'coincident', a: a.p2, b: b.p1 });
  mergePoints(s, b.p1, a.p2);
  assert.equal(b.p1, a.p2);
  assert.equal(s.constraints.length, 0);
});

test('merge points: the origin is never merged away', () => {
  const s = fresh();
  const l = addLine(s, 1, 1, 10, 0);
  mergePoints(s, ORIGIN, l.p1);
  assert.ok(byId(s, ORIGIN));
});

test('clone sketch: a deep copy that edits do not leak into', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  const c = cloneSketch(s);
  byId(c, l.p2).x = 99;
  assert.equal(byId(s, l.p2).x, 10);
});

test('polygonArea is signed (counter-clockwise positive) and pointInPolygon tests inside', () => {
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4]];
  near(polygonArea(sq), 16); near(polygonArea([...sq].reverse()), -16);
  assert.equal(pointInPolygon([2, 2], sq), true);
  assert.equal(pointInPolygon([5, 2], sq), false);
});

test('sketchBounds include the origin and every curve', () => {
  const s = fresh();
  addCircle(s, 20, 20, 5);
  const b = sketchBounds(s);
  near(b.x0, 0); near(b.y0, 0); near(b.x1, 25, 1e-9); near(b.y1, 25, 1e-9);
});

test('hit test prefers a point over the curve through it', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  assert.equal(hitTest(s, 10, 0, 0.5).id, l.p2);
});

test('hit test can skip entities', () => {
  const s = fresh();
  const l = addLine(s, 0, 0, 10, 0);
  assert.equal(hitTest(s, 5, 0, 0.5, { skip: new Set([l.id]) }), null);
});

// ───────────────────────── convert entities and intersection curve (kernel)

await loadKernel();
const R = rep();
const xyFrame = (z) => ({ origin: [0, 0, z], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] });
/** A 20 × 10 × 5 block on z = 0 … 5, centred on the z axis; optionally with a through hole of radius 3. */
const block = (hole = false) => {
  let b = R.drawRectangle(20, 10).sketchOnPlane('XY').extrude(5);
  if (hole) b = b.cut(R.drawCircle(3).sketchOnPlane('XY').extrude(5));
  return b;
};

test('convert entities: the top face\'s four edges become four joined lines', () => {
  const s = fresh();
  const made = convertEntities(s, xyFrame(5), block());
  assert.equal(made.length, 4);
  assert.ok(made.every((e) => e.type === 'line'));
  assert.equal(ofType(s, 'point').length - 1, 4, 'corners are shared');
  near(profiles(s)[0].outer.area, 200, 1e-6);
});

test('convert entities: a hole\'s edge becomes a circle (or arcs) of its radius', () => {
  const s = fresh();
  const made = convertEntities(s, xyFrame(5), block(true));
  const round = made.filter((e) => e.type === 'circle' || e.type === 'arc');
  assert.ok(round.length >= 1);
  for (const e of round) near(radiusOf(s, e), 3, 1e-6);
  const r = profiles(s);
  assert.equal(r.length, 1); assert.equal(r[0].holes.length, 1);
});

test('convert entities: edges off the sketch plane are left out', () => {
  const s = fresh();
  assert.deepEqual(convertEntities(s, xyFrame(2.5), block()), []);
});

test('convert entities: no body gives nothing', () => {
  assert.deepEqual(convertEntities(fresh(), xyFrame(0), null), []);
});

test('convert entities: limited to one face, only that face\'s edges', () => {
  const s = fresh();
  const body = block();
  const top = body.faces.find((f) => f.edges.every((e) => Math.abs(e.startPoint.z - 5) < 1e-6 && Math.abs(e.endPoint.z - 5) < 1e-6));
  assert.ok(top, 'top face');
  assert.equal(convertEntities(s, xyFrame(5), body, { faces: [top] }).length, 4);
});

test('intersection curve: a mid-height plane cuts the block in a 20 × 10 rectangle', () => {
  const s = fresh();
  const made = intersectionEntities(s, xyFrame(2.5), block());
  assert.equal(made.length, 4);
  near(profiles(s)[0].outer.area, 200, 1e-6);
});

test('intersection curve: through a block with a hole, a region with one hole', () => {
  const s = fresh();
  intersectionEntities(s, xyFrame(2.5), block(true));
  const r = profiles(s);
  assert.equal(r.length, 1); assert.equal(r[0].holes.length, 1);
  near(r[0].outer.area - r[0].holes[0].area, 200 - Math.PI * 9, 0.05);
});

test('intersection curve: a plane that misses the body gives nothing', () => {
  assert.deepEqual(intersectionEntities(fresh(), xyFrame(50), block()), []);
});

test('edgesToSketch: a curve that is neither line nor circle becomes a spline with joined ends', () => {
  const s = fresh();
  const edge = R.drawEllipse(10, 4).sketchOnPlane('XY').face().edges[0];
  const made = edgesToSketch(s, xyFrame(0), [edge]);
  assert.equal(made.length, 1);
  assert.equal(made[0].type, 'spline');
});
