// Construction geometry, symmetric and horizontal/vertical distance constraints,
// and hidden lines in drawing views.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addConstraint, measureConstraint, solveConstraints } from '../../src/domain/constraints.js';
import { addEntity, createDrawing, findEntity } from '../../src/domain/drawing.js';
import { exportDxf2000 } from '../../src/domain/dxf2000.js';
import { createEntity } from '../../src/domain/entities.js';
import { collectLoops } from '../../src/domain/stl.js';
import { exportSvg } from '../../src/domain/svg.js';
import { drawingViews } from '../../src/domain/views.js';
import { projectEdges, solidMesh } from '../../src/domain/solids.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('construction geometry is drawn but left out of outlines and exports', () => {
  const d = createDrawing();
  addEntity(d, 'rect', { x: 0, y: 0, width: 40, height: 20 });
  const guide = addEntity(d, 'circle', { cx: 100, cy: 0, r: 30, construction: true });
  assert.equal(guide.construction, true);
  assert.equal(collectLoops(d.entities, d).loops.length, 1, 'only the rectangle is an outline');
  assert.doesNotMatch(exportDxf2000(d), /\nCIRCLE\r?\n/);
  assert.match(exportDxf2000(d), /\nLWPOLYLINE\r?\n/);
  assert.doesNotMatch(exportSvg(d), /<circle/);
});

test('symmetric: two points mirror each other across a line', () => {
  const d = createDrawing();
  const axis = addEntity(d, 'line', { x1: 0, y1: -50, x2: 0, y2: 50 });
  const a = addEntity(d, 'point', { x: -12, y: 5 });
  const b = addEntity(d, 'point', { x: 20, y: 9 });
  addConstraint(d, 'fixed', [{ id: axis.id }]);
  addConstraint(d, 'symmetric', [{ id: a.id, at: 'p' }, { id: b.id, at: 'p' }, { id: axis.id }]);
  assert.ok(solveConstraints(d).ok);
  const [p, q] = [findEntity(d, a.id), findEntity(d, b.id)];
  near(p.x, -q.x);
  near(p.y, q.y);
});

test('horizontal and vertical distances are signed, as in FreeCAD', () => {
  const d = createDrawing();
  const l = addEntity(d, 'line', { x1: 10, y1: 10, x2: 40, y2: 25 });
  assert.equal(measureConstraint(d, 'distanceX', [{ id: l.id }]), 30);
  assert.equal(measureConstraint(d, 'distanceY', [{ id: l.id }]), 15);
  addConstraint(d, 'distanceX', [{ id: l.id }], -20);
  addConstraint(d, 'distanceY', [{ id: l.id }], 50);
  assert.ok(solveConstraints(d).ok);
  const after = findEntity(d, l.id);
  near(after.x2 - after.x1, -20);
  near(after.y2 - after.y1, 50);
});

test('drawing views: hidden edges dashed in the orthographic views, none in the isometric', () => {
  // A tube: its bore is hidden in the front view.
  const tube = createEntity('solid', { kind: 'tube', params: { outer: 20, inner: 10, height: 30 } });
  const parts = drawingViews([tube], { views: { front: true, top: false, right: false, iso: true } });
  const hiddenLayer = parts.filter((e) => e.layer === 'hidden');
  assert.ok(hiddenLayer.length > 0, 'the bore is hidden in the front view');
  const box = createEntity('solid', { kind: 'box', params: { length: 10, width: 10, height: 10 } });
  const iso = drawingViews([box], { views: { front: false, top: false, right: false, iso: true } }).filter((e) => e.type === 'polyline');
  assert.ok(iso.every((e) => e.layer !== 'hidden'), 'no hidden lines in the isometric view');
  // A cube seen in isometric: 12 edges, 3 of them behind.
  const edges = projectEdges(solidMesh(box), 'iso', { hidden: true });
  assert.equal(edges.length, 12);
  assert.equal(edges.filter((e) => e.hidden).length, 3);
});
