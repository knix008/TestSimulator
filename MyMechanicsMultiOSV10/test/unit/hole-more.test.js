// Hole Wizard: ANSI inch sizes, slot holes, NPT tapered taps, and end conditions at geometry (up to surface,
// up to next) — volumes from the cross-sections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, newSketchId } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { ansiHole, NPT_TAPER } from '../../src/cad/hole-more.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }

/** A 60 × 40 × 20 block and a point sketch at (30, 20) on its top. */
function block() {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addRectangle(s, 0, 0, 60, 40); part.features.push(s);
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  const pl = add(part, 'plane', { base: top, offset: 20 });
  const pts = createFeature(part, 'sketch', { plane: { kind: 'ref', id: pl.id }, ...createSketchGeometry() });
  pts.entities.push({ id: newSketchId('p'), type: 'point', x: 30, y: 20, standalone: true }); part.features.push(pts);
  return { part, pts, volume: 60 * 40 * 20 };
}

test('ANSI inch sizes: a 1/4 normal clearance hole, its counterbore and countersink', () => {
  near(ansiHole('1/4', 'simple', 'normal').diameter, 0.266 * 25.4);
  near(ansiHole('1/4', 'simple', 'close').diameter, 0.257 * 25.4);
  const cb = ansiHole('1/4', 'counterbore');
  near(cb.cbDiameter, 0.438 * 25.4); near(cb.cbDepth, 0.25 * 25.4);
  assert.equal(ansiHole('1/4', 'countersink').csAngle, 82);
});

test('slot hole: a through slot 10 long, 6 wide in the 20 thick block', () => {
  const { part, pts, volume } = block();
  add(part, 'hole', { sketch: pts.id, kind: 'simple', diameter: 6, through: true, slot: true, slotLength: 10 });
  near(volume - V(ok(part).body), (Math.PI * 9 + 6 * 10) * 20, 1e-6);
});

test('tapered pipe tap: the drill narrows 1:16 on the diameter', () => {
  const { part, pts, volume } = block();
  add(part, 'hole', { sketch: pts.id, kind: 'taperedTap', diameter: 10, depth: 12, through: false });
  const r1 = 5; const r2 = 5 - (12 * NPT_TAPER) / 2;
  near(volume - V(ok(part).body), (Math.PI * 12 * (r1 * r1 + r1 * r2 + r2 * r2)) / 3, 1e-6);
});

test('hole end conditions: up to a plane (flat at it), up to next (stops at a hollow)', () => {
  let { part, pts, volume } = block();
  const stop = add(part, 'plane', { base: top, offset: 5 });
  part.features.push(part.features.splice(part.features.indexOf(pts), 1)[0]);
  add(part, 'hole', { sketch: pts.id, kind: 'simple', diameter: 6, end: 'upToSurface', endFace: { kind: 'ref', id: stop.id } });
  near(volume - V(ok(part).body), Math.PI * 9 * 15, 1e-6);

  ({ part, pts, volume } = block());
  const h = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addRectangle(h, 10, 5, 50, 35); part.features.splice(2, 0, h);
  const hollow = createFeature(part, 'extrude', { sketch: h.id, op: 'cut', start: 'offset', startOffset: 8, end: 'blind', depth: 4, reverse: true });
  part.features.splice(3, 0, hollow);
  const before = V(ok(part).body);
  add(part, 'hole', { sketch: pts.id, kind: 'simple', diameter: 6, end: 'upToNext' });
  // Only the top skin, z 12 … 20.
  near(before - V(ok(part).body), Math.PI * 9 * 8, 1e-6);
});

test('an ANSI tapped hole (1/4-20 UNC): the tap drill, the thread shown cosmetically', () => {
  const { part, pts, volume } = block();
  const h = add(part, 'hole', { sketch: pts.id, kind: 'tapped', standard: 'ansiInch', ansiTap: '1/4-20 UNC', diameter: 0.201 * 25.4, threadSize: undefined, depth: 15, through: false, threadDepth: 12 });
  const r = ok(part);
  const tip = (0.201 * 25.4) / 2 / Math.tan((59 * Math.PI) / 180);
  near(volume - V(r.body), Math.PI * ((0.201 * 25.4) / 2) ** 2 * 15 + (Math.PI * ((0.201 * 25.4) / 2) ** 2 * tip) / 3, 1e-6);
  void h;
});
