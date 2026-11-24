// Helix: tapered, variable pitch (a table of turn / pitch / diameter) and a flat spiral — the fitted curve
// against the ideal one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';

await loadKernel();
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const curveOf = (params) => {
  const part = { id: 'p', name: 'P', features: [] };
  const h = createFeature(part, 'helix', { plane: top, radius: 10, pitch: 5, turns: 4, ...params }); part.features.push(h);
  const r = regenerate(part); assert.ok(r.results.get(h.id).ok, r.results.get(h.id).detail);
  return r.curves.get(h.id);
};
const samples = (wire, n = 200) => { const e = wire.edges[0]; return Array.from({ length: n + 1 }, (_, i) => { const p = e.pointAt(i / n); return [p.x, p.y, p.z]; }); };

test('tapered helix: the radius shrinks by tan(angle) per unit of height', () => {
  const w = curveOf({ taper: 10 });
  for (const [x, y, z] of samples(w)) near(Math.hypot(x, y), 10 - z * Math.tan((10 * Math.PI) / 180), 1e-4);
  const end = samples(w).at(-1); near(end[2], 20, 1e-4);
});

test('variable pitch: pitch 2 → 6 and diameter 20 → 30 over four turns', () => {
  const w = curveOf({ variable: [{ rev: 0, pitch: 2, d: 20 }, { rev: 4, pitch: 6, d: 30 }] });
  const pts = samples(w);
  // Height = ∫ pitch du = 4 · (2 + 6) / 2.
  near(pts.at(-1)[2], 16, 1e-4);
  near(Math.hypot(pts.at(-1)[0], pts.at(-1)[1]), 15, 1e-4);
  near(Math.hypot(pts[0][0], pts[0][1]), 10, 1e-4);
});

test('spiral: flat, the radius grows by the pitch each turn', () => {
  const w = curveOf({ kind: 'spiral', pitch: 3, turns: 2 });
  const pts = samples(w);
  for (const p of pts) near(p[2], 0, 1e-9);
  near(Math.hypot(pts.at(-1)[0], pts.at(-1)[1]), 16, 1e-4);
});
