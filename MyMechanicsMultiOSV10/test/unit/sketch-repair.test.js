// Repair Sketch (sketch-repair.js): tiny curves, duplicates, overlapping collinear lines and small gaps are fixed so
// a broken rectangle becomes one closed profile; open ends and branch points are reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSketchGeometry, byId, addLine, addCircle, addArc, profiles } from '../../src/cad/sketch.js';
import { checkSketch, repairSketch } from '../../src/cad/sketch-repair.js';

const curves = (s) => s.entities.filter((e) => e.type !== 'point');

/** A 40 × 20 rectangle drawn badly: a 0.004 gap at one corner, the bottom drawn as two overlapping lines,
 *  the right side twice, and a 0.003 sliver line at the top-left corner. */
function broken() {
  const s = createSketchGeometry();
  addLine(s, 0, 0, 25, 0); addLine(s, 15, 0, 40, 0);
  const r1 = addLine(s, 40, 0.004, 40, 20); addLine(s, 40, 0.004, 40, 20);
  const top = addLine(s, 40, 20, 0.003, 20, { from: r1.p2 });
  const sliver = addLine(s, 0, 0, 0, 20, { from: top.p2 }); byId(s, sliver.p2).x = 0; byId(s, sliver.p2).y = 20;
  addLine(s, 0, 20, 0, 0);
  return s;
}

test('checkSketch finds every kind of problem without changing the sketch', () => {
  const s = broken();
  const before = JSON.stringify(s);
  const c = checkSketch(s, { gap: 0.01 });
  assert.equal(JSON.stringify(s), before);
  assert.equal(c.tiny.length, 1);
  assert.equal(c.duplicates.length, 1);
  assert.equal(c.overlaps.length, 1);
  assert.ok(c.gaps.length >= 3, String(c.gaps.length));
});

test('repairSketch makes the broken rectangle one closed 40 × 20 profile', () => {
  const s = broken();
  assert.equal(profiles(s).length, 0);
  const r = repairSketch(s, { gap: 0.01 });
  assert.equal(r.removedTiny, 1); assert.equal(r.removedDuplicates, 1); assert.equal(r.mergedOverlaps, 1);
  assert.ok(r.closedGaps >= 2);
  assert.deepEqual(r.openEnds, []); assert.deepEqual(r.branches, []);
  assert.equal(curves(s).length, 4);
  const p = profiles(s);
  assert.equal(p.length, 1);
  assert.ok(Math.abs(p[0].outer.area - 800) < 0.5, String(p[0].outer.area));
});

test('a gap wider than the tolerance stays open and is reported; a T junction is a branch', () => {
  const s = createSketchGeometry();
  const a = addLine(s, 0, 0, 10, 0); addLine(s, 10.5, 0, 20, 0);
  const r = repairSketch(s, { gap: 0.1 });
  assert.equal(r.closedGaps, 0);
  assert.equal(r.openEnds.length, 4);
  const t = createSketchGeometry();
  const h = addLine(t, 0, 0, 10, 0);
  addLine(t, 0, 0, 20, 0, { from: h.p2 }); addLine(t, 0, 0, 10, 10, { from: h.p2 });
  const rt = repairSketch(t, { gap: 0.01 });
  assert.equal(rt.branches.length, 1);
  void a;
});

test('duplicate circles and arcs go; construction geometry is left alone', () => {
  const s = createSketchGeometry();
  addCircle(s, 5, 5, 3); addCircle(s, 5, 5, 3);
  addArc(s, 0, 0, 4, 0, 1); addArc(s, 0, 0, 4, 0, 1);
  addLine(s, 0, 0, 10, 0, { construction: true }); addLine(s, 0, 0, 10, 0, { construction: true });
  const r = repairSketch(s);
  assert.equal(r.removedDuplicates, 2);
  assert.equal(s.entities.filter((e) => e.type === 'circle').length, 1);
  assert.equal(s.entities.filter((e) => e.type === 'arc').length, 1);
  assert.equal(s.entities.filter((e) => e.type === 'line' && e.construction).length, 2);
});
