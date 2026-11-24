// Reference planes: at an angle about an edge, three points, parallel at a point, normal to a curve, mid plane
// (parallel and bisecting), tangent to a cylinder, through a line and a point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';

await loadKernel();
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const nearV = (a, b, tol = 1e-9) => a.forEach((x, i) => near(x, b[i], tol));
const top = { kind: 'std', name: 'top' };
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
const frameOf = (part, f) => ok(part).planes.get(f.id);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A 40 × 30 × 20 box. */
function box() {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addRectangle(s, 0, 0, 40, 30); part.features.push(s);
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  return { part, body: ok(part).body };
}

test('plane at 30° to Top about the box edge along X (y = 0, z = 20)', () => {
  const { part, body } = box();
  const edge = body.edges.find((e) => Math.abs(e.startPoint.y) < 1e-9 && Math.abs(e.endPoint.y) < 1e-9 && Math.abs(e.startPoint.z - 20) < 1e-9 && Math.abs(e.endPoint.z - 20) < 1e-9);
  const p = add(part, 'plane', { mode: 'angle', base: top, axisRef: { kind: 'edge', sig: edgeSignature(edge) }, angle: 30 });
  const fr = frameOf(part, p);
  near(Math.abs(dot(fr.normal, [0, 0, 1])), Math.cos(Math.PI / 6));
  near(Math.abs(fr.normal[0]), 0);
  // It holds the edge.
  near(dot([10 - fr.origin[0], 0 - fr.origin[1], 20 - fr.origin[2]], fr.normal), 0);
});

test('three points, parallel at a point, line and point', () => {
  const { part } = box();
  const a = add(part, 'plane', { mode: 'threePoints', points: [[0, 0, 0], [40, 0, 20], [0, 30, 0]] });
  const fa = frameOf(part, a);
  for (const q of [[0, 0, 0], [40, 0, 20], [0, 30, 0]]) near(dot([q[0] - fa.origin[0], q[1] - fa.origin[1], q[2] - fa.origin[2]], fa.normal), 0, 1e-9);
  const b = add(part, 'plane', { mode: 'parallelAtPoint', base: top, point: [5, 5, 12] });
  const fb = frameOf(part, b);
  nearV(fb.normal, [0, 0, 1]); near(fb.origin[2], 12);
  const c = add(part, 'plane', { mode: 'linePoint', axisRef: { kind: 'axis', axis: 'z' }, point: [10, 10, 0] });
  const fc = frameOf(part, c);
  near(dot(fc.normal, [0, 0, 1]), 0); near(dot(fc.normal, [Math.SQRT1_2, Math.SQRT1_2, 0]), 0, 1e-9);
});

test('normal to a curve at a point, tangent to a cylinder', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addCircle(s, 0, 0, 10); part.features.push(s);
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  const body = ok(part).body;
  const rim = body.edges.find((e) => e.geomType === 'CIRCLE' && Math.abs(e.startPoint.z - 20) < 1e-9);
  const n = add(part, 'plane', { mode: 'normalToCurve', edge: edgeSignature(rim), at: 0 });
  const fn = frameOf(part, n);
  // The circle's tangent at its start is square to its radius there and horizontal.
  near(fn.normal[2], 0);
  near(dot(fn.normal, [fn.origin[0] / 10, fn.origin[1] / 10, 0]), 0, 1e-9);
  const side = body.faces.find((f) => /CYL/.test(f.geomType));
  const t = add(part, 'plane', { mode: 'tangent', face: faceSignature(side), point: [10, 0, 5] });
  const ft = frameOf(part, t);
  nearV(ft.normal.map(Math.abs), [1, 0, 0], 1e-9); near(ft.origin[0], 10);
});

test('mid plane: half way between two parallel planes; the bisector of two crossing ones', () => {
  const { part } = box();
  const p1 = add(part, 'plane', { base: top, offset: 4 });
  const p2 = add(part, 'plane', { base: top, offset: 16 });
  const m = add(part, 'plane', { mode: 'mid', base: { kind: 'ref', id: p1.id }, base2: { kind: 'ref', id: p2.id } });
  near(frameOf(part, m).origin[2], 10);
  const b = add(part, 'plane', { mode: 'mid', base: top, base2: { kind: 'std', name: 'right' } });
  const fb = frameOf(part, b);
  // Between Top (z) and Right (x): a 45° plane through the Y axis.
  near(Math.abs(fb.normal[0]), Math.SQRT1_2, 1e-9); near(Math.abs(fb.normal[2]), Math.SQRT1_2, 1e-9); near(fb.normal[1], 0);
  near(dot(fb.origin, fb.normal), 0, 1e-9);
});
