// Sketcher constraints: the solver, degrees of freedom, and the document keeping them solved.
import assert from 'node:assert/strict';
import test from 'node:test';
import { addConstraint, nearestPoints, normalizeConstraints, solveConstraints } from '../../src/domain/constraints.js';
import { DrawingDocument } from '../../src/domain/document.js';
import { addEntity, createDrawing, findEntity, removeEntities, updateEntity } from '../../src/domain/drawing.js';
import { parseFile, serialize } from '../../src/domain/format.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const len = (l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1);

/** A rough four-sided outline joined at its corners, horizontal/vertical sides. */
function box(d) {
  const L = (x1, y1, x2, y2) => addEntity(d, 'line', { x1, y1, x2, y2 }).id;
  const ids = [L(0, 0, 48, 2), L(49, 1, 51, 33), L(50, 31, -1, 29), L(1, 28, 0.5, 1)];
  for (let i = 0; i < 4; i++) addConstraint(d, 'coincident', [{ id: ids[i], at: 'p2' }, { id: ids[(i + 1) % 4], at: 'p1' }]);
  addConstraint(d, 'horizontal', [{ id: ids[0] }]);
  addConstraint(d, 'horizontal', [{ id: ids[2] }]);
  addConstraint(d, 'vertical', [{ id: ids[1] }]);
  addConstraint(d, 'vertical', [{ id: ids[3] }]);
  return ids;
}

test('a rectangle: corners meet, sides square; width, height and a fixed corner point make it fully constrained', () => {
  const d = createDrawing();
  const ids = box(d);
  let status = solveConstraints(d);
  assert.equal(status.status, 'under');
  assert.equal(status.dof, 4, 'position (2) and size (2) are free');
  addConstraint(d, 'distance', [{ id: ids[0] }], 50);
  addConstraint(d, 'distance', [{ id: ids[1] }], 30);
  const anchor = addEntity(d, 'point', { x: 0, y: 0 });
  addConstraint(d, 'fixed', [{ id: anchor.id }]);
  addConstraint(d, 'coincident', [{ id: anchor.id, at: 'p' }, { id: ids[0], at: 'p1' }]);
  status = solveConstraints(d);
  assert.equal(status.status, 'full');
  assert.equal(status.dof, 0);
  const [a, b, c, e] = ids.map((id) => findEntity(d, id));
  assert.deepEqual([a.x1, a.y1, a.x2, a.y2, b.x2, b.y2].map((v) => Math.round(v * 1e6) / 1e6 + 0), [0, 0, 50, 0, 50, 30]);
  near(c.x2, 0); near(e.y2, 0);
});

test('dimensions drive the shape; redundant and conflicting constraints are reported', () => {
  const d = createDrawing();
  const ids = box(d);
  addConstraint(d, 'distance', [{ id: ids[0] }], 80);
  addConstraint(d, 'distance', [{ id: ids[1] }], 30);
  let status = solveConstraints(d);
  assert.equal(status.status, 'under');
  assert.equal(status.dof, 2, 'only the position is free');
  near(len(findEntity(d, ids[0])), 80);
  near(len(findEntity(d, ids[2])), 80, 1e-6);
  addConstraint(d, 'angle', [{ id: ids[0] }, { id: ids[1] }], 90);
  assert.equal(solveConstraints(d).status, 'over', 'a right angle is already given by H and V');
  d.constraints.pop();
  addConstraint(d, 'distance', [{ id: ids[2] }], 60);
  assert.equal(solveConstraints(d).status, 'conflict', 'opposite sides cannot differ');
});

test('tangent, concentric, radius, equal, point on object, perpendicular and angle', () => {
  const d = createDrawing();
  const line = addEntity(d, 'line', { x1: 0, y1: 0, x2: 100, y2: 3 });
  const circle = addEntity(d, 'circle', { cx: 40, cy: 20, r: 6 });
  const ring = addEntity(d, 'circle', { cx: 43, cy: 18, r: 15 });
  const other = addEntity(d, 'line', { x1: 10, y1: 10, x2: 30, y2: 50 });
  addConstraint(d, 'horizontal', [{ id: line.id }]);
  addConstraint(d, 'tangent', [{ id: line.id }, { id: circle.id }]);
  addConstraint(d, 'radius', [{ id: circle.id }], 10);
  addConstraint(d, 'concentric', [{ id: circle.id }, { id: ring.id }]);
  addConstraint(d, 'pointOnObject', [{ id: other.id, at: 'p1' }, { id: ring.id }]);
  addConstraint(d, 'angle', [{ id: line.id }, { id: other.id }], 60);
  assert.ok(solveConstraints(d).ok);
  const [l, c, r, o] = [line, circle, ring, other].map((e) => findEntity(d, e.id));
  near(l.y1, l.y2);
  near(c.r, 10);
  near(Math.abs(c.cy - l.y1), 10, 1e-6);
  near(c.cx, r.cx); near(c.cy, r.cy);
  near(Math.hypot(o.x1 - r.cx, o.y1 - r.cy), r.r, 1e-6);
  near((Math.atan2(o.y2 - o.y1, o.x2 - o.x1) * 180) / Math.PI, 60, 1e-6);
  addConstraint(d, 'perpendicular', [{ id: line.id }, { id: other.id }]);
  assert.equal(solveConstraints(d).status, 'conflict', '60° and 90° at once');
});

test('nearest points, file round trip, deleted entities drop their constraints', () => {
  const d = createDrawing();
  const a = addEntity(d, 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  const b = addEntity(d, 'line', { x1: 10.2, y1: 0.1, x2: 10, y2: 20 });
  assert.deepEqual(nearestPoints(a, b), [{ id: a.id, at: 'p2' }, { id: b.id, at: 'p1' }]);
  addConstraint(d, 'coincident', nearestPoints(a, b));
  addConstraint(d, 'distance', [{ id: a.id }], 25);
  const back = parseFile(serialize(d));
  assert.equal((back.drawing ?? back).constraints.length, 2);
  assert.deepEqual(normalizeConstraints([{ type: 'bogus', refs: [{ id: 'x' }] }, { type: 'radius', refs: [] }]), []);
  removeEntities(d, [b.id]);
  solveConstraints(d);
  assert.deepEqual(d.constraints.map((c) => c.type), ['distance']);
});

test('in a document, dragging a corner moves the rest and keeps the dragged point', () => {
  const doc = new DrawingDocument(createDrawing());
  let ids;
  doc.apply('sketch', (d) => { ids = box(d); addConstraint(d, 'distance', [{ id: ids[0] }], 50); });
  assert.equal(doc.constraintStatus.status, 'under');
  // The user drags the top-left end of the left side up to y = 70.
  const left = findEntity(doc.drawing, ids[3]);
  doc.apply('drag', (d) => updateEntity(d, ids[3], { x1: left.x1, y1: 70 }));
  const [a, b, c, e] = ids.map((id) => findEntity(doc.drawing, id));
  near(e.y1, 70, 1e-6);
  near(c.y1, 70, 1e-6, 'the top follows');
  near(b.y2, 70, 1e-6, 'and the right side grows');
  near(len(a), 50, 1e-6, 'the width stays');
  // Undo brings the old shape back.
  doc.undo();
  assert.ok(Math.abs(findEntity(doc.drawing, ids[3]).y1 - 70) > 1);
});
