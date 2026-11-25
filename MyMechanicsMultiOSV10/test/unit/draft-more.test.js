// Draft: a different angle on one face, and parting-line draft (faces turn about their parting edges).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature, edgeSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }

/** A 40 × 30 × 20 box. */
function box() {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addRectangle(s, 0, 0, 40, 30); part.features.push(s);
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  return { part, body: ok(part).body };
}
const side = (body, x) => faceSignature(body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.x - x) < 1e-6));

test('draft: one face at its own angle (5° and 10° on two opposite sides, neutral plane at the bottom)', () => {
  const { part, body } = box();
  add(part, 'draft', { neutral: top, angle: 5, faces: [side(body, 0), side(body, 40)], angles: [{ sig: side(body, 40), angle: 10 }] });
  // Each side leans in from the bottom: a wedge 20 high, 20·tan(a) deep, 30 wide comes off.
  const v = V(ok(part).body);
  const off = (a) => (20 * 20 * Math.tan((a * Math.PI) / 180) * 30) / 2;
  near(40 * 30 * 20 - v, off(5) + off(10), 1e-6);
});

test('parting-line draft: the two long sides turn about their bottom edges (pull +Z)', () => {
  const { part, body } = box();
  const bottomEdge = (y) => edgeSignature(body.edges.find((e) => Math.abs(e.startPoint.z) < 1e-6 && Math.abs(e.endPoint.z) < 1e-6 && Math.abs(e.startPoint.y - y) < 1e-6 && Math.abs(e.endPoint.y - y) < 1e-6));
  add(part, 'draft', { kind: 'partingLine', pull: { kind: 'axis', axis: 'z' }, angle: 5, partingEdges: [bottomEdge(0), bottomEdge(30)] });
  const off = (20 * 20 * Math.tan((5 * Math.PI) / 180) * 40) / 2;
  near(40 * 30 * 20 - V(ok(part).body), 2 * off, 1e-6);
});
