// Partial ellipses, conics, parabolas and equation-driven curves in sketches: exact rational Bézier pieces (the
// kernel builds the same curves, so solids have the analytic areas), the solver keeps a partial ellipse's ends on
// it, tangent relations at shared ends, copies / mirrors / moves, sweep paths and DXF export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addLine, addConstraint, addCircle, createSketchGeometry, solveSketch, profiles, byId, curvePieces, analyse } from '../../src/cad/sketch.js';
import { addEllipseArc, addConic, addParabola, addEquationCurve, mirrorEntities, linearSketchPattern } from '../../src/cad/sketchtools.js';
import { transformEntities } from '../../src/cad/sketch-more.js';
import { pieceAt, ellipseArcPieces, conicWeight, rhoFromShoulder, parabolaSegment, compileEquation, equationPieces, ellipsePoint } from '../../src/cad/sketch-curves.js';
import { sketchToEntities } from '../../src/cad/sketch-export.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const newPart = () => ({ id: 'p', name: 'Part', features: [] });
const top = { kind: 'std', name: 'top' }; const front = { kind: 'std', name: 'front' };
function sketchOn(part, plane, draw) {
  const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() });
  draw(s);
  part.features.push(s);
  return s;
}
function extrudedVolume(draw, depth = 10) {
  const part = newPart();
  const s = sketchOn(part, top, draw);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth }));
  const r = regenerate(part);
  for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`);
  return R.measureVolume(r.body);
}
const P = (s, id) => { const p = byId(s, id); return [p.x, p.y]; };

test('rational pieces: an elliptical arc is exactly on its ellipse, a conic of the right weight is a circular arc', () => {
  const c = [3, -2]; const rx = 12; const ry = 5; const rot = 0.4;
  for (const [t0, t1] of [[0.2, 1.1], [-2, 2.5], [1, 1 + 2 * Math.PI - 0.01]]) {
    const pieces = ellipseArcPieces(c, rx, ry, rot, t0, t1);
    assert.ok(pieces.every((p) => p.w[1] > 0.7));
    for (const pc of pieces) for (const t of [0, 0.13, 0.5, 0.77, 1]) {
      const [x, y] = pieceAt(pc, t);
      const dx = x - c[0]; const dy = y - c[1];
      const u = (dx * Math.cos(rot) + dy * Math.sin(rot)) / rx; const v = (-dx * Math.sin(rot) + dy * Math.cos(rot)) / ry;
      near(Math.hypot(u, v), 1, 1e-12);
    }
    const a = pieceAt(pieces[0], 0); const b = pieceAt(pieces.at(-1), 1);
    near(a[0], ellipsePoint(c, rx, ry, rot, t0)[0], 1e-12); near(b[1], ellipsePoint(c, rx, ry, rot, t1)[1], 1e-12);
  }
  // A quarter circle: ends (r, 0) and (0, r), top vertex (r, r), w = cos 45°.
  const rho = Math.SQRT1_2 / (1 + Math.SQRT1_2);
  near(conicWeight(rho), Math.SQRT1_2, 1e-12);
  for (const t of [0.1, 0.4, 0.9]) near(Math.hypot(...pieceAt({ P: [[7, 0], [7, 7], [0, 7]], w: [1, conicWeight(rho), 1] }, t)), 7, 1e-12);
  // The shoulder point (the curve at t = ½) gives ρ back.
  const s = pieceAt({ P: [[0, 0], [4, 6], [10, 0]], w: [1, conicWeight(0.3), 1] }, 0.5);
  near(rhoFromShoulder([0, 0], [4, 6], [10, 0], s), 0.3, 1e-12);
});

test('a parabola from its focus and apex: the curve is the set of points as far from the focus as from the directrix', () => {
  const focus = [2, 5]; const apex = [2, 1];
  const seg = parabolaSegment(focus, apex, [-6, 0], [9, 0]);
  const pc = { P: [seg.p0, seg.pc, seg.p2], w: [1, 1, 1] };
  for (const t of [0, 0.25, 0.5, 0.8, 1]) {
    const [x, y] = pieceAt(pc, t);
    // Directrix y = −3 (as far below the apex as the focus is above).
    near(Math.hypot(x - focus[0], y - focus[1]), y + 3, 1e-12);
  }
  near(seg.p0[0], -6, 1e-12); near(seg.p2[0], 9, 1e-12);
  assert.equal(parabolaSegment(focus, focus, [0, 0], [1, 0]), null);
});

test('equations: radians, powers, functions and errors', () => {
  near(compileEquation('2*sin(x)^2 + cos(pi*x)', 'x')(0.5), 2 * Math.sin(0.5) ** 2 + Math.cos(Math.PI * 0.5), 1e-15);
  near(compileEquation('-2^2', 'x')(0), -4, 0);
  near(compileEquation('2^3^2', 'x')(0), 512, 0);
  near(compileEquation('exp(t)/ln(e) + abs(-t) + sqrt(t)*atan2(1, 1)', 't')(4), Math.exp(4) + 4 + 2 * Math.PI / 4, 1e-15);
  assert.throws(() => compileEquation('sin(x', 'x'), /missing \)/);
  assert.throws(() => compileEquation('foo(x)', 'x'), /unknown function/);
  assert.throws(() => compileEquation('y + 1', 'x'), /unknown name/);
  assert.throws(() => equationPieces({ fy: 'sqrt(x)', t0: -1, t1: 1 }), /not defined/);
  assert.throws(() => equationPieces({ fy: 'x', t0: 2, t1: 1 }), /greater/);
  // The pieces follow the curve within the tolerance everywhere, not only at their ends.
  const pieces = equationPieces({ fy: 'sin(3*x) * exp(-x/4)', t0: 0, t1: 10 }, 1e-5);
  for (const pc of pieces) for (const t of [0.1, 0.33, 0.5, 0.71, 0.9]) {
    const [x, y] = pieceAt(pc, t);
    assert.ok(Math.abs(y - Math.sin(3 * x) * Math.exp(-x / 4)) < 2e-5, `off the curve at x = ${x}`);
  }
});

test('a half ellipse closed by its axis extrudes to the exact half-ellipse prism', () => {
  const v = extrudedVolume((s) => {
    const e = addEllipseArc(s, 0, 0, 20, 8, 0, 0, Math.PI);
    addLine(s, 0, 0, 0, 0, { from: e.p2, to: e.p1 });
  });
  near(v, (Math.PI * 20 * 8) / 2 * 10, 1e-6);
});

test('a turned partial ellipse with a chord: segment area (rx·ry / 2)(Δt − sin Δt)', () => {
  const dt = 2.1;
  const v = extrudedVolume((s) => {
    const e = addEllipseArc(s, 5, 3, 15, 6, 0.7, -0.4, -0.4 + dt);
    addLine(s, 0, 0, 0, 0, { from: e.p2, to: e.p1 });
  }, 4);
  near(v, ((15 * 6) / 2) * (dt - Math.sin(dt)) * 4, 1e-6);
});

test('a parabola and a conic closed by chords: 2/3 of the control triangle; a conic of weight cos 45° is a quarter circle', () => {
  const tri = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  const v1 = extrudedVolume((s) => {
    const e = addConic(s, [0, 0], [10, 14], [24, 2], 0.5);
    addLine(s, 0, 0, 0, 0, { from: e.p2, to: e.p1 });
  }, 1);
  near(v1, (2 / 3) * tri([0, 0], [10, 14], [24, 2]), 1e-6);
  const r = 9; const rho = Math.SQRT1_2 / (1 + Math.SQRT1_2);
  const v2 = extrudedVolume((s) => {
    const e = addConic(s, [r, 0], [r, r], [0, r], rho);
    const l1 = addLine(s, 0, 0, 0, 0, { from: e.p2 });
    byId(s, l1.p2).x = 0; byId(s, l1.p2).y = 0;
    addLine(s, 0, 0, 0, 0, { from: l1.p2, to: e.p1 });
  }, 1);
  near(v2, (Math.PI * r * r) / 4, 1e-6);
  const v3 = extrudedVolume((s) => {
    const e = addParabola(s, [0, 4], [0, 0], [-10, 0], [10, 0]);
    addLine(s, 0, 0, 0, 0, { from: e.p2, to: e.p1 });
  }, 1);
  // y = x² / 16 between x = ±10: the area under the chord y = 100/16 is 20·100/16 − 2·1000/48.
  near(v3, (20 * 100) / 16 - (2 * 1000) / 48, 1e-6);
});

test('equation curves: y = sin x closed by the axis, and a parametric closed curve', () => {
  const v1 = extrudedVolume((s) => {
    const e = addEquationCurve(s, { fy: 'sin(x)', t0: 0, t1: Math.PI });
    addLine(s, 0, 0, 0, 0, { from: e.p2, to: e.p1 });
  }, 10);
  near(v1, 20, 1e-5);
  // A parametric cardioid-free check: an ellipse written as x = 6 cos t, y = 3 sin t (closed, one loop by itself).
  const v2 = extrudedVolume((s) => { addEquationCurve(s, { mode: 'parametric', fx: '6*cos(t)', fy: '3*sin(t)', t0: 0, t1: 2 * Math.PI }); }, 2);
  near(v2, Math.PI * 18 * 2, 1e-5);
});

test('the solver keeps a partial ellipse\'s ends on it and holds a tangent line at a shared end of a conic', () => {
  const s = createSketchGeometry();
  const e = addEllipseArc(s, 0, 0, 10, 4, 0.3, 0.1, 2);
  byId(s, e.p1).x += 1.5; byId(s, e.p1).y -= 0.7;
  const r = solveSketch(s);
  assert.ok(r.ok);
  for (const id of [e.p1, e.p2]) {
    const [x0, y0] = P(s, id); const [cx, cy] = P(s, e.c); const x = x0 - cx; const y = y0 - cy;
    const u = (x * Math.cos(0.3) + y * Math.sin(0.3)) / 10; const v = (-x * Math.sin(0.3) + y * Math.cos(0.3)) / 4;
    near(Math.hypot(u, v), 1, 1e-7);
  }
  // A conic and a line joined at the conic's end: tangent makes the line follow the end leg (top vertex → end).
  const k = createSketchGeometry();
  const c = addConic(k, [0, 0], [5, 8], [12, 0], 0.4);
  const l = addLine(k, 0, 0, 20, 3, { from: c.p2 });
  addConstraint(k, { type: 'tangent', a: c.id, b: l.id });
  assert.ok(solveSketch(k).ok);
  const d1 = [P(k, c.p2)[0] - P(k, c.pc)[0], P(k, c.p2)[1] - P(k, c.pc)[1]];
  const d2 = [P(k, l.p2)[0] - P(k, l.p1)[0], P(k, l.p2)[1] - P(k, l.p1)[1]];
  near(Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) / (Math.hypot(...d1) * Math.hypot(...d2)), 0, 1e-7);
  // An equation curve is fully defined by itself (its end points are where the equation puts them).
  const q = createSketchGeometry();
  addEquationCurve(q, { fy: 'x^2/10', t0: -3, t1: 5 });
  assert.equal(analyse(q).dof, 0);
});

test('mirror, pattern and move keep the new curves exact (equation placement, swapped ellipse ends)', () => {
  const s = createSketchGeometry();
  const axis = addLine(s, 0, -50, 0, 50, { construction: true });
  const e = addEllipseArc(s, 20, 0, 8, 4, 0.5, 0, 1.5);
  const q = addEquationCurve(s, { fy: 'x^2/8', t0: 2, t1: 6 });
  const made = mirrorEntities(s, [e.id, q.id], axis.id);
  const me = made.find((x) => x.type === 'ellipseArc'); const mq = made.find((x) => x.type === 'equation');
  // The mirrored arc still runs counter-clockwise, so its ends swapped: its start is the mirror of the old end.
  near(P(s, me.p1)[0], -P(s, e.p2)[0], 1e-9); near(P(s, me.p1)[1], P(s, e.p2)[1], 1e-9);
  const pieces = curvePieces(s, mq);
  for (const t of [0, 0.5, 1]) { const [x, y] = pieceAt(pieces[Math.floor(pieces.length / 2)], t); near(y, (x * x) / 8, 1e-4); assert.ok(x < 0); }
  assert.equal(byId(s, mq.p1).fixed, true);
  near(P(s, mq.p1)[0], -2, 1e-12); near(P(s, mq.p2)[1], 36 / 8, 1e-12);
  // A pattern copy is moved by the step; a move turns and scales the equation's placement.
  const [copy] = linearSketchPattern(s, [q.id], { dx: 0, dy: 10, count: 2 }).filter((x) => x.type === 'equation');
  near(P(s, copy.p2)[1], 36 / 8 + 10, 1e-12);
  transformEntities(s, [q.id], { kind: 'rotate', angle: 90, cx: 0, cy: 0 });
  near(P(s, q.p2)[0], -36 / 8, 1e-9); near(P(s, q.p2)[1], 6, 1e-9);
  assert.equal(byId(s, q.p2).fixed, true);
  transformEntities(s, [q.id], { kind: 'scale', factor: 2, cx: 0, cy: 0 });
  near(P(s, q.p2)[0], -36 / 4, 1e-9);
});

test('sweep along a parabola path: a tube of the path\'s exact arc length', () => {
  const part = newPart();
  const prof = sketchOn(part, top, (k) => addCircle(k, 0, 0, 1.5));
  // Apex at the origin, axis along the sketch's u: the path leaves the origin along v (normal to the top plane).
  const f = 10;
  const path = sketchOn(part, front, (k) => addParabola(k, [f, 0], [0, 0], [0, 0], [0, 30]));
  part.features.push(createFeature(part, 'sweep', { sketch: prof.id, path: path.id }));
  const r = regenerate(part);
  for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`);
  const a = 1 / (2 * f); const X = 30;
  const L = (X * Math.sqrt(1 + a * a * X * X)) / 2 + Math.asinh(a * X) / (2 * a);
  near(R.measureVolume(r.body), Math.PI * 1.5 * 1.5 * L, 1e-4);
});

test('profiles see the new curves; DXF export writes a partial ellipse with its parameter span', () => {
  const s = createSketchGeometry();
  const e = addEllipseArc(s, 1, 2, 6, 9, 0.2, 0.3, 2.4);
  addLine(s, 0, 0, 0, 0, { from: e.p2, to: e.p1 });
  const [region] = profiles(s);
  assert.ok(region.outer.segs.some((x) => x.kind === 'pieces'));
  const ell = sketchToEntities(s).find((x) => x.name === 'ELLIPSE');
  // The DXF ellipse: centre + majorAxis·cos s + minor·sin s, minor = ratio · (n × majorAxis).
  const at = (sp) => { const M = ell.majorAxis; const m = [-M[1] * ell.ratio, M[0] * ell.ratio]; return [ell.center[0] + M[0] * Math.cos(sp) + m[0] * Math.sin(sp), ell.center[1] + M[1] * Math.cos(sp) + m[1] * Math.sin(sp)]; };
  near(at(ell.startParam)[0], P(s, e.p1)[0], 1e-9); near(at(ell.startParam)[1], P(s, e.p1)[1], 1e-9);
  near(at(ell.endParam)[0], P(s, e.p2)[0], 1e-9); near(at(ell.endParam)[1], P(s, e.p2)[1], 1e-9);
  near(at((ell.startParam + ell.endParam) / 2)[0], ellipsePoint([1, 2], 6, 9, 0.2, 1.35)[0], 1e-9);
});
