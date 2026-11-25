// Sketch additions: arc slots (the region a sweep of a circle along an arc leaves: θ·2Rh + πh² for a slot of
// half width h on a centre arc of radius R over θ).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { createSketchGeometry, profiles } from '../../src/cad/sketch.js';
import { addArcSlot } from '../../src/cad/sketch-draw.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('arc slot: one closed region, its area θ·2Rh + πh² (90° on R 30, width 8)', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  const made = addArcSlot(s, { cx: 0, cy: 0, r: 30 }, 0, Math.PI / 2, 8);
  assert.ok(made);
  part.features.push(s);
  assert.equal(profiles(s).length, 1);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 1 }));
  const body = regenerate(part).body;
  near(R.measureVolume(body), (Math.PI / 2) * 2 * 30 * 4 + Math.PI * 16, 1e-6);
});

import { addArc, addLine, addRelation, solveSketch, relationsFor, endCurvature, byId } from '../../src/cad/sketch.js';
import { addSpline } from '../../src/cad/sketchtools.js';

test('smooth (G2): a spline leaving an arc takes the arc curvature at the joint; coradial; merge', () => {
  const s = createSketchGeometry();
  const arc = addArc(s, 0, 0, 20, 0, Math.PI / 2);
  const end = s.entities.find((e) => e.id === arc.p2);
  const sp = addSpline(s, [[end.x, end.y], [-15, 25], [-30, 20], [-45, 30]], { ids: [arc.p2] });
  assert.ok(relationsFor(s, [arc.id, sp.id]).includes('smooth'));
  addRelation(s, 'smooth', [arc.id, sp.id]);
  solveSketch(s);
  const map = new Map(s.entities.map((e) => [e.id, e]));
  const P = (id) => { const p = map.get(id); return [p.x, p.y]; };
  const R = (id) => { const e = map.get(id); const c = map.get(e.c); const p = map.get(e.p1); return Math.hypot(p.x - c.x, p.y - c.y); };
  const ka = Math.abs(endCurvature(arc, arc.p2, P, map, R)); const ks = Math.abs(endCurvature(sp, sp.pts[0], P, map, R));
  near(ka, ks, 1e-4);

  const t = createSketchGeometry();
  const a = addArc(t, 0, 0, 10, 0, Math.PI / 2); const b = addArc(t, 3, 4, 7, Math.PI, 1.5 * Math.PI);
  addRelation(t, 'coradial', [a.id, b.id]);
  solveSketch(t);
  const m2 = new Map(t.entities.map((e) => [e.id, e]));
  const ca = m2.get(a.c); const cb = m2.get(b.c);
  near(Math.hypot(ca.x - cb.x, ca.y - cb.y), 0, 1e-6);
  const r = (e) => Math.hypot(m2.get(e.p1).x - m2.get(e.c).x, m2.get(e.p1).y - m2.get(e.c).y);
  near(r(a), r(b), 1e-6);

  const u = createSketchGeometry();
  const l1 = addLine(u, 0, 0, 10, 0); const l2 = addLine(u, 12, 1, 20, 5);
  addRelation(u, 'merge', [l1.p2, l2.p1]);
  solveSketch(u);
  const q1 = byId(u, l1.p2); const q2 = byId(u, l2.p1);
  near(Math.hypot(q1.x - q2.x, q1.y - q2.y), 0, 1e-6);
});

import { dimensionFor, addConstraint } from '../../src/cad/sketch.js';

test('arc length dimension: an arc and one of its ends; driving it to 40 changes the swept angle', () => {
  const s = createSketchGeometry();
  const arc = addArc(s, 0, 0, 20, 0, Math.PI / 2);
  const c = dimensionFor(s, [arc.id, arc.p2]);
  assert.equal(c.type, 'arcLength');
  near(c.value, 10 * Math.PI, 1e-6);
  addConstraint(s, { type: 'radius', a: arc.id, value: 20 });
  addConstraint(s, { ...c, value: 40 });
  solveSketch(s);
  const m = new Map(s.entities.map((e) => [e.id, e]));
  const o = m.get(arc.c); const a = m.get(arc.p1); const b = m.get(arc.p2);
  let th = Math.atan2(b.y - o.y, b.x - o.x) - Math.atan2(a.y - o.y, a.x - o.x); while (th <= 0) th += 2 * Math.PI;
  near(20 * th, 40, 1e-6);
});

test('tangent between an arc and a spline leaving its end', () => {
  const s = createSketchGeometry();
  const arc = addArc(s, 0, 0, 20, 0, Math.PI / 2);
  const end = s.entities.find((e) => e.id === arc.p2);
  const sp = addSpline(s, [[end.x, end.y], [-10, 30], [-30, 20]], { ids: [arc.p2] });
  addRelation(s, 'tangent', [arc.id, sp.id]);
  solveSketch(s);
  const m = new Map(s.entities.map((e) => [e.id, e]));
  const o = m.get(arc.c); const p = m.get(arc.p2); const q = m.get(sp.pts[1]);
  // The spline leaves square to the radius at the joint.
  const r = [p.x - o.x, p.y - o.y]; const t = [q.x - p.x, q.y - p.y];
  near((r[0] * t[0] + r[1] * t[1]) / (Math.hypot(...r) * Math.hypot(...t)), 0, 1e-6);
});
