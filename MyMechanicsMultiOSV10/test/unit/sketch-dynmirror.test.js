// Dynamic mirror (sketchtools.js mirrorDynamic): what is drawn is mirrored about the centerline as it is made; points
// on the axis are shared and held on it, curves on the axis are not doubled, the other points are symmetric.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSketchGeometry, byId, addLine, addCircle, solveSketch } from '../../src/cad/sketch.js';
import { mirrorDynamic } from '../../src/cad/sketchtools.js';

const xy = (s, id) => { const p = byId(s, id); return [p.x, p.y]; };

test('a line from the axis is mirrored with its axis end shared', () => {
  const s = createSketchGeometry();
  const axis = addLine(s, 0, -50, 0, 50, { construction: true });
  const l = addLine(s, 0, 10, 20, 30);
  const [m] = mirrorDynamic(s, [l.id], axis.id);
  assert.ok(m);
  assert.ok([m.p1, m.p2].includes(l.p1), 'shares the point on the axis');
  const far = m.p1 === l.p1 ? m.p2 : m.p1;
  assert.deepEqual(xy(s, far).map((v) => Math.round(v * 1e9) / 1e9), [-20, 30]);
  assert.ok(s.constraints.some((k) => k.type === 'pointOnLine' && k.a === l.p1 && k.b === axis.id));
  assert.ok(s.constraints.some((k) => k.type === 'symmetric' && k.a === l.p2 && k.b === far && k.c === axis.id));
  // Moving the original moves the copy (symmetric relation; the axis held).
  byId(s, axis.p1).fixed = true; byId(s, axis.p2).fixed = true;
  solveSketch(s, { drag: { id: l.p2, x: 25, y: 30 } });
  assert.ok(Math.abs(xy(s, l.p2)[0] - 25) < 1e-3);
  assert.ok(Math.abs(xy(s, far)[0] + xy(s, l.p2)[0]) < 1e-6);
});

test('a circle is copied across; a line on the axis is not doubled', () => {
  const s = createSketchGeometry();
  const axis = addLine(s, 0, -50, 0, 50, { construction: true });
  const c = addCircle(s, 15, 5, 4);
  const on = addLine(s, 0, 0, 0, 20);
  const made = mirrorDynamic(s, [c.id, on.id], axis.id);
  assert.equal(made.length, 1);
  assert.equal(made[0].type, 'circle');
  assert.deepEqual(xy(s, made[0].c).map((v) => Math.round(v * 1e9) / 1e9), [-15, 5]);
  assert.equal(s.entities.filter((e) => e.type === 'line' && !e.construction).length, 1);
});
