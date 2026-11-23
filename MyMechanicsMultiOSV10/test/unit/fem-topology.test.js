// Topology optimisation (src/cad/fem/topology.js): a cantilever block 60×20×10 fixed at x = 0, loaded downwards at
// the free end, optimised to 40 % of its volume. The volume is met, the compliance drops far below that of the
// same material spread evenly, the loaded and fixed regions stay solid, and the shape is a closed surface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { topologyStudy, optimisedShape } from '../../src/cad/fem/topology.js';
import { linearStatic } from '../../src/cad/fem/static.js';
import { boxMesh } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250, density: 7850 };

test('SIMP cantilever: 40 % volume, compliance far below the even spread, solid at the supports, a closed shape', () => {
  const bodies = [{ mesh: boxMesh(60, 20, 10, 2), material: STEEL }];
  const loads = [{ faceId: 1, force: [0, 0, -1000] }];
  const r = topologyStudy({ bodies, fixtures: [0], loads, mesh: { size: 2.5 }, volumeFraction: 0.4, iterations: 30 });
  assert.equal(r.ok, true, r.error);
  assert.ok(Math.abs(r.volumeFraction - 0.4) < 0.01, `volume fraction ${r.volumeFraction}`);
  // The compliance falls over the iterations (allowing small wiggles) …
  const h = r.history.map((x) => x.compliance);
  assert.ok(h.at(-1) < 0.8 * h[0], `compliance ${h[0]} → ${h.at(-1)}`);
  // … and is far below the same volume spread evenly (stiffness 0.4³ of full: compliance × 15.6).
  const full = linearStatic({ bodies, fixtures: [0], loads, mesh: { size: 2.5, order: 1 } });
  const fullC = 1000 * full.maxDisplacement;           // fᵀu ≈ F × tip deflection (uniform end load)
  assert.ok(r.compliance < 4 * fullC, `optimised ${r.compliance} vs solid ${fullC} (even 40 %: ${fullC / 0.064})`);
  // Elements at the fixed and loaded faces stay solid; densities are mostly near 0 or 1 (a crisp layout).
  for (let e = 0; e < r.elements; e++) if (r.passive[e]) assert.equal(r.densities[e], 1);
  let grey = 0; for (const d of r.densities) if (d > 0.2 && d < 0.8) grey++;
  assert.ok(grey / r.elements < 0.35, `grey elements ${grey} of ${r.elements}`);
  // The shape: every edge shared by two triangles; its volume near the kept fraction.
  const s = r.shape, edges = new Map();
  for (let t = 0; t < s.triangles.length; t += 3) for (let q = 0; q < 3; q++) { const a = s.triangles[t + q], b = s.triangles[t + ((q + 1) % 3)], k = a < b ? `${a},${b}` : `${b},${a}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
  assert.ok([...edges.values()].every((n) => n === 2), 'closed (manifold) surface');
  assert.ok(s.volume > 0.25 * 12000 && s.volume < 0.6 * 12000, `shape volume ${s.volume}`);
});

test('the shape of all-solid elements is the whole block', () => {
  const r = topologyStudy({ bodies: [{ mesh: boxMesh(20, 10, 10, 2), material: STEEL }], fixtures: [0], loads: [{ faceId: 1, force: [0, 0, -100] }], mesh: { size: 3 }, volumeFraction: 0.5, iterations: 1 });
  const s = optimisedShape(r.model, new Float64Array(r.elements).fill(1), 0.5, 0);
  assert.ok(Math.abs(s.volume - 2000) < 1, `volume ${s.volume}`);
});
