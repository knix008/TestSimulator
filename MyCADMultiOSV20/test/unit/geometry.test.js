import assert from 'node:assert/strict';
import test from 'node:test';
import {
  angleOf, angleOnArc, arcFrom3, arcPoints, bboxOf, circleFrom3, clean, closestOnArc, closestOnSegment, dist, ellipsePerimeter, intersectCircles, intersectLines,
  intersectSegmentCircle, mirrorPoint, normDeg, pointInPolygon, polar, polygonArea, polylineLength, rotate, scaleAt, segmentHitsBox, sweep,
} from '../../src/domain/geometry.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const nearPoint = (p, q, eps = 1e-9) => { near(p.x, q.x, eps); near(p.y, q.y, eps); };

test('angles: normalised to 0…360, counter-clockwise from +x', () => {
  near(normDeg(-90), 270);
  near(normDeg(720), 0);
  near(angleOf({ x: 0, y: 0 }, { x: 0, y: 5 }), 90);
  near(angleOf({ x: 0, y: 0 }, { x: -1, y: -1 }), 225);
  nearPoint(polar({ x: 1, y: 1 }, 2, 90), { x: 1, y: 3 });
});

test('arcs: sweep and membership go counter-clockwise', () => {
  near(sweep(350, 10), 20);
  near(sweep(10, 350), 340);
  near(sweep(30, 30), 360);
  assert.ok(angleOnArc(0, 350, 10));
  assert.ok(!angleOnArc(180, 350, 10));
  assert.ok(angleOnArc(90, 0, 180));
});

test('rotate, scale and mirror points', () => {
  nearPoint(rotate({ x: 2, y: 0 }, { x: 1, y: 0 }, 90), { x: 1, y: 1 });
  nearPoint(scaleAt({ x: 3, y: 3 }, { x: 1, y: 1 }, 2), { x: 5, y: 5 });
  nearPoint(mirrorPoint({ x: 2, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), { x: 2, y: -1 });
  nearPoint(mirrorPoint({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }), { x: 0, y: 1 });
});

test('closest points and distances', () => {
  const { point, t } = closestOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  nearPoint(point, { x: 5, y: 0 });
  near(t, 0.5);
  nearPoint(closestOnSegment({ x: -4, y: 2 }, { x: 0, y: 0 }, { x: 10, y: 0 }).point, { x: 0, y: 0 });
  // Outside the arc's angle range: the nearer end.
  nearPoint(closestOnArc({ x: -5, y: -1 }, { x: 0, y: 0 }, 5, 0, 90), { x: 0, y: 5 });
});

test('line, segment-circle and circle-circle intersections', () => {
  nearPoint(intersectLines({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }), { x: 5, y: 5 });
  assert.equal(intersectLines({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null, 'parallel');
  assert.equal(intersectLines({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: -1 }, { x: 5, y: 1 }), null, 'apart');
  assert.ok(intersectLines({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: -1 }, { x: 5, y: 1 }, true), 'infinite lines meet');
  const hits = intersectSegmentCircle({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, 5);
  assert.equal(hits.length, 2);
  nearPoint(hits[0], { x: -5, y: 0 });
  const circles = intersectCircles({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5);
  assert.equal(circles.length, 2);
  near(circles[0].x, 4);
  assert.equal(intersectCircles({ x: 0, y: 0 }, 1, { x: 9, y: 0 }, 1).length, 0);
});

test('circle and arc through three points', () => {
  const circle = circleFrom3({ x: 5, y: 0 }, { x: 0, y: 5 }, { x: -5, y: 0 });
  nearPoint(circle.center, { x: 0, y: 0 });
  near(circle.r, 5);
  assert.equal(circleFrom3({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }), null, 'collinear');
  const upper = arcFrom3({ x: 5, y: 0 }, { x: 0, y: 5 }, { x: -5, y: 0 });
  near(upper.start, 0);
  near(upper.end, 180);
  const lower = arcFrom3({ x: 5, y: 0 }, { x: 0, y: -5 }, { x: -5, y: 0 });
  // Counter-clockwise from 180 to 360 passes through 270.
  near(lower.start, 180);
  near(lower.end, 0);
});

test('areas, lengths, boxes and point-in-polygon', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  near(polygonArea(square), 100);
  near(polygonArea([...square].reverse()), -100);
  near(polylineLength(square, true), 40);
  near(polylineLength(square, false), 30);
  assert.deepEqual(bboxOf(square), { minX: 0, minY: 0, maxX: 10, maxY: 10 });
  assert.ok(pointInPolygon({ x: 5, y: 5 }, square));
  assert.ok(!pointInPolygon({ x: 15, y: 5 }, square));
  assert.ok(segmentHitsBox({ x: -5, y: 5 }, { x: 15, y: 5 }, { minX: 0, minY: 0, maxX: 10, maxY: 10 }));
  assert.ok(!segmentHitsBox({ x: -5, y: 20 }, { x: 15, y: 20 }, { minX: 0, minY: 0, maxX: 10, maxY: 10 }));
});

test('arc points and ellipse perimeter', () => {
  const points = arcPoints(0, 0, 10, 0, 90, 10);
  nearPoint(points[0], { x: 10, y: 0 });
  nearPoint(points.at(-1), { x: 0, y: 10 }, 1e-9);
  assert.ok(points.length >= 10);
  near(ellipsePerimeter(5, 5), 2 * Math.PI * 5, 1e-9);
  assert.equal(clean(-0.0000000001), 0);
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});
