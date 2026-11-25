// Loft: guide curves (one moves the sections, two scale them), a centre line, start / end normal to profile,
// closed (a ring through three profiles), thin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addArc, createSketchGeometry, newSketchId } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const front = { kind: 'std', name: 'front' };
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
const sketchOn = (part, plane, draw) => { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
/** A three-point arc on a sketch from a through m to b. */
const arc3 = (k, a, m, b) => {
  const P = (p) => { const e = { id: newSketchId('p'), type: 'point', x: p[0], y: p[1] }; k.entities.push(e); return e; };
  const pa = P(a); const pb = P(b);
  // Circle through the three points.
  const [x1, y1] = a; const [x2, y2] = m; const [x3, y3] = b;
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  const ux = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / d;
  const uy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / d;
  const c = P([ux, uy]);
  const ccw = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1) > 0;
  k.entities.push({ id: newSketchId('a'), type: 'arc', c: c.id, p1: ccw ? pa.id : pb.id, p2: ccw ? pb.id : pa.id });
};

/** Two 20 × 20 squares, at z 0 and z 40. */
function twoSquares() {
  const part = { id: 'p', name: 'P', features: [] };
  const a = sketchOn(part, top, (k) => addRectangle(k, -10, -10, 10, 10));
  const pl = add(part, 'plane', { base: top, offset: 40 });
  const b = sketchOn(part, { kind: 'ref', id: pl.id }, (k) => addRectangle(k, -10, -10, 10, 10));
  return { part, a, b };
}

test('one guide curve bowing out to x = 20 half way moves the sections with it', () => {
  const { part, a, b } = twoSquares();
  const g = sketchOn(part, front, (k) => arc3(k, [10, 0], [20, 20], [10, 40]));
  add(part, 'loft', { sketches: [a.id, b.id], guides: [g.id] });
  const body = ok(part).body;
  near(body.boundingBox.bounds[1][0], 20, 0.5);
  near(V(body), 16000, 16000 * 0.02);
});

test('two guides bowing out on both sides scale the sections (twice as wide half way)', () => {
  const { part, a, b } = twoSquares();
  const g1 = sketchOn(part, front, (k) => arc3(k, [10, 0], [20, 20], [10, 40]));
  const g2 = sketchOn(part, front, (k) => arc3(k, [-10, 0], [-20, 20], [-10, 40]));
  add(part, 'loft', { sketches: [a.id, b.id], guides: [g1.id, g2.id] });
  const body = ok(part).body;
  near(body.boundingBox.bounds[1][0], 20, 0.5); near(body.boundingBox.bounds[0][0], -20, 0.5);
  assert.ok(V(body) > 16000 * 1.5, `${V(body)}`);
});

test('a centre line carries the sections; start / end normal to profile keep the volume close', () => {
  const { part, a, b } = twoSquares();
  const c = sketchOn(part, front, (k) => arc3(k, [0, 0], [10, 20], [0, 40]));
  const l = add(part, 'loft', { sketches: [a.id, b.id], centerline: c.id });
  near(ok(part).body.boundingBox.bounds[1][0], 20, 0.5);
  delete l.centerline; l.startCond = 'normal'; l.endCond = 'normal';
  near(V(ok(part).body), 16000, 16000 * 0.02);
});

test('closed loft: a ring through three profiles around Z', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const ids = [0, 120, 240].map((deg) => {
    const pl = add(part, 'plane', { mode: 'angle', base: front, axisRef: { kind: 'axis', axis: 'z' }, angle: deg });
    return sketchOn(part, { kind: 'ref', id: pl.id }, (k) => addRectangle(k, -5, 30, 5, 40)).id;
  });
  add(part, 'loft', { sketches: ids, closed: true });
  const body = ok(part).body;
  const [lo, hi] = body.boundingBox.bounds;
  // Round Z: it reaches out on every side.
  assert.ok(hi[0] - lo[0] > 50 && hi[1] - lo[1] > 50, JSON.stringify([lo, hi]));
  assert.ok(V(body) > 0);
});

test('thin loft: a 2 thick wall round two equal squares', () => {
  const { part, a, b } = twoSquares();
  add(part, 'loft', { sketches: [a.id, b.id], thin: true, thinT1: 2 });
  near(V(ok(part).body), 40 * (400 - 256), 1e-3);
});

void addArc;
