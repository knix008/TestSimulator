// FreeCAD Draft: join, stretch, path / point arrays, Bézier chains, slope,
// flipped dimensions, text outlines traced from a picture, document styles,
// and the Draft snaps (perpendicular, parallel, extension, angle, special).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arrayPoints, bezierFromPoints, flipDimension, joinPaths, loopArea, normalizeAnnotationStyles, normalizeWpProxies, pathPoints, placesAlong, simplifyPath,
  slopePath, stretchEntity, traceOutlines,
} from '../../src/domain/draft.js';
import { nurbsPoint } from '../../src/domain/sketch.js';
import { findSnap, forgetSnapLines } from '../../src/domain/snap.js';
import { createDrawing, normalizeDrawing } from '../../src/domain/drawing.js';
import { normalizeEntity } from '../../src/domain/entities.js';
import { defaultSettings } from '../../src/domain/settings.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const P = (x, y) => ({ x, y });

test('join: lines meeting end to end (in any direction) become one wire; a loop closes', () => {
  const joined = joinPaths([[P(0, 0), P(10, 0)], [P(10, 10), P(10, 0)], [P(20, 20), P(30, 20)]]);
  assert.equal(joined.length, 2);
  assert.deepEqual(joined[0].points, [P(0, 0), P(10, 0), P(10, 10)]);
  const loop = joinPaths([[P(0, 0), P(10, 0)], [P(10, 0), P(10, 10)], [P(10, 10), P(0, 0)]]);
  assert.equal(loop.length, 1);
  assert.equal(loop[0].closed, true);
  assert.equal(loop[0].points.length, 3);
  assert.equal(simplifyPath([P(0, 0), P(5, 0.001), P(10, 0), P(10, 10)], 0.01).length, 3);
});

test('paths: outlines of lines, arcs, circles and rectangles in order', () => {
  assert.equal(pathPoints({ type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }).points.length, 2);
  const circle = pathPoints({ type: 'circle', cx: 0, cy: 0, r: 5 });
  assert.equal(circle.closed, true);
  near(Math.hypot(circle.points[10].x, circle.points[10].y), 5);
  const rect = pathPoints(normalizeEntity({ type: 'rect', x: 0, y: 0, width: 10, height: 5 }));
  assert.equal(rect.closed, true);
  assert.equal(rect.points.length, 5);
  assert.equal(pathPoints({ type: 'text' }), null);
});

test('stretch: only the points inside the window move; a part-covered rectangle becomes a polyline', () => {
  const box = { minX: 8, minY: -1, maxX: 12, maxY: 11 };
  const line = stretchEntity({ id: 'a', type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, box, 5, 0);
  assert.deepEqual([line.data.x1, line.data.x2], [0, 15]);
  assert.equal(stretchEntity({ id: 'b', type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }, box, 5, 0), null);
  const rect = stretchEntity(normalizeEntity({ type: 'rect', x: 0, y: 0, width: 10, height: 10 }), box, 5, 0);
  assert.equal(rect.type, 'polyline');
  assert.deepEqual(rect.data.points.map((p) => p.x), [0, 15, 15, 0]);
  const whole = stretchEntity(normalizeEntity({ type: 'rect', x: 9, y: 0, width: 2, height: 2 }), box, 5, 0);
  assert.equal(whole.type, 'rect');
  assert.equal(whole.data.x, 14);
  const circle = stretchEntity({ type: 'circle', cx: 10, cy: 5, r: 1 }, box, 0, 3);
  assert.equal(circle.data.cy, 8);
});

test('arrays: places along a path at equal distances with its direction; points of point objects and wires', () => {
  const places = placesAlong({ points: [P(0, 0), P(10, 0), P(10, 10)], closed: false }, 5);
  assert.equal(places.length, 5);
  assert.deepEqual([places[0].x, places[2].x, places[2].y, places[4].y], [0, 10, 0, 10]);
  near(places[3].angle, 90);
  const loop = placesAlong({ points: [P(0, 0), P(10, 0), P(10, 10), P(0, 10), P(0, 0)], closed: true }, 4);
  assert.deepEqual(loop.map((p) => [p.x, p.y]), [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.deepEqual(arrayPoints([{ type: 'point', x: 1, y: 2 }, { type: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }]), [P(1, 2), P(0, 0), P(3, 0)]);
});

test('Bézier: one curve through its end points; a cubic chain shares every third point', () => {
  const quad = bezierFromPoints([P(0, 0), P(5, 10), P(10, 0)], 2);
  assert.equal(quad.degree, 2);
  const mid = nurbsPoint(quad, 0.5);
  near(mid.x, 5); near(mid.y, 5);
  const chain = bezierFromPoints([P(0, 0), P(1, 3), P(3, 3), P(4, 0), P(5, -3), P(7, -3), P(8, 0)], 3);
  assert.deepEqual(chain.knots, [0, 0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1, 1]);
  const joint = nurbsPoint(chain, 0.5);
  near(joint.x, 4); near(joint.y, 0);
  assert.equal(bezierFromPoints([P(0, 0), P(1, 1), P(2, 0), P(3, 1)], 2).points.length, 5, 'the last segment is filled up');
});

test('slope: a wire rises by the percent of its run', () => {
  const path = slopePath([P(0, 0), P(10, 0), P(10, 10)], 10, 5);
  assert.deepEqual(path.map((p) => p[2]), [5, 6, 7]);
});

test('flip dimension: the offset goes across the measured line; radial dimensions turn round', () => {
  const aligned = flipDimension({ type: 'dim', kind: 'aligned', x1: 0, y1: 0, x2: 10, y2: 0, ox: 5, oy: 4 });
  assert.deepEqual([aligned.ox, aligned.oy], [5, -4]);
  const horizontal = flipDimension({ type: 'dim', kind: 'horizontal', x1: 0, y1: 0, x2: 10, y2: 2, ox: 5, oy: 6 });
  assert.equal(horizontal.oy, -4);
  assert.equal(flipDimension({ type: 'dim', kind: 'radius', cx: 0, cy: 0, r: 5, angle: 30 }).angle, 210);
  assert.equal(flipDimension({ type: 'line' }), null);
});

test('text outlines: a filled square and a ring in a picture give their outer and inner loops', () => {
  const w = 40; const h = 40;
  const alpha = new Uint8Array(w * h);
  for (let y = 5; y < 35; y++) for (let x = 5; x < 35; x++) {
    const d = Math.hypot(x - 20, y - 20);
    alpha[y * w + x] = d > 6 ? 255 : 0;
  }
  const loops = traceOutlines(alpha, w, h);
  assert.equal(loops.length, 2, 'outside and the hole');
  const areas = loops.map((l) => Math.abs(loopArea(l))).sort((a, b) => b - a);
  near(areas[0], 30 * 30, 0.05);
  near(areas[1], Math.PI * 6.5 * 6.5, 0.15);
  assert.ok(loops[0].length < 40, 'simplified');
});

test('document: annotation styles and working-plane proxies are kept in the file', () => {
  assert.deepEqual(normalizeAnnotationStyles([{ name: ' A ', textHeight: 5, precision: 9 }, { name: '' }]), [{ name: 'A', textHeight: 5, precision: 6 }]);
  assert.equal(normalizeWpProxies([{ name: 'p', workPlane: { z: 3 } }])[0].workPlane.z, 3);
  const d = normalizeDrawing({ ...createDrawing(), annotationStyles: [{ name: 'S', textHeight: 2, precision: 1 }], wpProxies: [{ name: 'W', workPlane: null }] });
  assert.equal(d.annotationStyles[0].name, 'S');
  assert.equal(d.wpProxies[0].name, 'W');
  assert.equal(normalizeEntity({ type: 'solid', kind: 'box', params: { length: 1, width: 1, height: 1 }, wireframe: true }).wireframe, true);
});

test('snaps: perpendicular from the last point, extension and parallel of a line passed over, 15° on circles, insertion points', () => {
  forgetSnapLines();
  const modes = { ...defaultSettings('en').snapModes };
  for (const k of Object.keys(modes)) modes[k] = false;
  const line = { id: 'l', type: 'line', layer: '0', x1: 0, y1: 0, x2: 10, y2: 0 };
  const perp = findSnap([line], P(4.2, 0.3), 1, { ...modes, perpendicular: true }, { base: P(4, 8) });
  assert.equal(perp.kind, 'perpendicular');
  near(perp.x, 4); near(perp.y, 0);
  // Pass over the line, then move past its end: on its extension.
  findSnap([line], P(5, 0.2), 1, { ...modes, extension: true });
  const ext = findSnap([line], P(15, 0.4), 1, { ...modes, extension: true });
  assert.equal(ext.kind, 'extension');
  near(ext.y, 0);
  // Parallel to it through the last point.
  const par = findSnap([line], P(7, 20.3), 1, { ...modes, parallel: true }, { base: P(0, 20) });
  assert.equal(par.kind, 'parallel');
  near(par.y, 20);
  const circle = { id: 'c', type: 'circle', layer: '0', cx: 0, cy: 0, r: 10 };
  const angle = findSnap([circle], P(8.6, 5.2), 1, { ...modes, angle: true });
  assert.equal(angle.kind, 'angle');
  near(Math.atan2(angle.y, angle.x) * (180 / Math.PI), 30);
  const text = normalizeEntity({ type: 'text', x: 3, y: 4, text: 'A', size: 2.5 });
  assert.equal(findSnap([text], P(3.3, 4.2), 1, { ...modes, special: true }).kind, 'special');
  assert.equal(defaultSettings('en').snapModes.perpendicular, false, 'off at first');
});
