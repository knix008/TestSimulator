// Warpage (src/cad/plastics-warp.js) against exact answers: even shrinkage only scales the part (no warp); a
// shrinkage that varies linearly through the thickness of a free plate bends it into a dome of curvature Δε / h in
// both directions (a compatible strain: exact on quadratic tetrahedra); the side against the warmer mould shrinks
// more; fibers along x hold the shrinkage in x; and the strains of a real moulding come from the flow, cooling
// and fiber results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { warpage, mouldingStrains, bestFitSimilarity, solidOf } from '../../src/cad/plastics-warp.js';
import { plateDomain, RESINS } from '../../src/cad/plastics.js';
import { fiberOrientation } from '../../src/cad/plastics-fiber.js';
import { boxMesh } from './fem-shapes.js';

const L = 100, W = 40, H = 4;
const plate = () => boxMesh(L, W, H, 2);
const zero = [0, 0, 0, 0, 0, 0];
const at = (r, x, y, z) => { const N = r.model.nn; let best = 0, bd = Infinity; for (let n = 0; n < N; n++) { const d = Math.hypot(r.nodes[3 * n] - x, r.nodes[3 * n + 1] - y, r.nodes[3 * n + 2] - z); if (d < bd) { bd = d; best = n; } } return best; };
const solid = { E: 2300, nu: 0.35 };

test('the best-fit similarity takes out translation, small rotation and scaling exactly', () => {
  const nodes = Float64Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10, 10, 10, 10]);
  const u = new Float64Array(15);
  for (let n = 0; n < 5; n++) { const x = [nodes[3 * n] - 4, nodes[3 * n + 1] - 4, nodes[3 * n + 2] - 4]; u[3 * n] = 0.1 - 0.002 * x[1] - 0.003 * x[0]; u[3 * n + 1] = -0.2 + 0.002 * x[0] - 0.003 * x[1]; u[3 * n + 2] = 0.05 - 0.003 * x[2]; }
  const f = bestFitSimilarity(nodes, u, 5);
  assert.ok(f.residual.every((v) => Math.abs(v) < 1e-12));
  assert.ok(Math.abs(f.scale + 0.003) < 1e-12);
});

test('even shrinkage only scales the part: no warp, scale = −s/3', () => {
  const r = warpage({ mesh: plate(), strains: () => ({ shrinkage: [-0.004, -0.004, -0.004, 0, 0, 0], orientation: zero, coolingT: null, cte: 0 }), solid, meshOptions: { size: 5, order: 2 } });
  assert.equal(r.ok, true, r.error);
  assert.ok(r.cases.shrinkage.max > 0.1, `displacement ${r.cases.shrinkage.max}`);
  assert.ok(r.cases.shrinkage.warpMax < 1e-6 * r.cases.shrinkage.max + 1e-9, `warp ${r.cases.shrinkage.warpMax}`);
  assert.ok(Math.abs(r.cases.shrinkage.scale + 0.004) < 1e-9);
  assert.equal(r.cases.cooling.max, 0);
});

test('shrinkage varying through the thickness bends a free plate into a dome of curvature Δε/h', () => {
  const d = 0.002;                                     // the top shrinks 0.2 % more than the bottom
  const r = warpage({ mesh: plate(), strains: (p) => { const e = -0.005 - d * (p[2] / H - 0.5); return { shrinkage: [e, e, e, 0, 0, 0], orientation: zero, coolingT: null, cte: 0 }; }, solid, meshOptions: { size: 5, order: 2 } });
  assert.equal(r.ok, true, r.error);
  const u = r.cases.shrinkage.displacement;
  const c = at(r, L / 2, W / 2, 0), k = at(r, 0, 0, 0);
  const sag = u[3 * k + 2] - u[3 * c + 2];
  const kappa = d / H;
  const expected = (kappa * ((L / 2) ** 2 + (W / 2) ** 2)) / 2;
  assert.ok(Math.abs(sag - expected) < 0.03 * expected, `corner rises ${sag} vs ${expected} mm (top shrinks more: concave up)`);
  assert.ok(r.cases.shrinkage.warpMax > 0.5 * expected);
});

test('a warmer mould side: that side shrinks more and the corners turn toward it', () => {
  const r = warpage({ mesh: plate(), strains: (p) => ({ shrinkage: zero, orientation: zero, coolingT: 40 + 20 * (p[2] / H), cte: 9e-5 }), solid, meshOptions: { size: 5, order: 2 } });
  const u = r.cases.cooling.displacement;
  const c = at(r, L / 2, W / 2, 0), k = at(r, 0, 0, 0);
  const sag = u[3 * k + 2] - u[3 * c + 2];
  const expected = ((9e-5 * 20) / H) * (((L / 2) ** 2 + (W / 2) ** 2) / 2);
  assert.ok(Math.abs(sag - expected) < 0.03 * expected, `${sag} vs ${expected}`);
  assert.equal(r.dominant, 'cooling');
});

test('fibers along x hold the shrinkage in x: the part shrinks less in x than in y, as (1 − c) : (1 + c/2)', () => {
  const sl = 0.004, c = 0.8;
  const A = [1, 0, 0, 0, 0, 0, 0, 0, 0];
  const r = warpage({ mesh: plate(), strains: () => ({ shrinkage: [-sl, -sl, -sl, 0, 0, 0], orientation: [sl * c * 1.5 * (A[0] - 1 / 3), sl * c * 1.5 * (-1 / 3), sl * c * 1.5 * (-1 / 3), 0, 0, 0], coolingT: null, cte: 0 }), solid, meshOptions: { size: 5, order: 2 } });
  const u = r.cases.total.displacement;
  const ex = (u[3 * at(r, L, W / 2, H / 2)] - u[3 * at(r, 0, W / 2, H / 2)]) / L;
  const ey = (u[3 * at(r, L / 2, W, H / 2) + 1] - u[3 * at(r, L / 2, 0, H / 2) + 1]) / W;
  assert.ok(Math.abs(ex + sl * (1 - c)) < 1e-6, `εx ${ex}`);
  assert.ok(Math.abs(ey + sl * (1 + c / 2)) < 1e-6, `εy ${ey}`);
});

test('strains of a moulding: packed shrinkage per node, the flow direction for an unfilled resin, the fiber tensor for a filled one', () => {
  const d = plateDomain(25, 10, 4, () => 4);
  const fill = { fillTime: Float64Array.from(d.nodes, (n) => n.c[0] / 50), shrinkage: Float64Array.from(d.nodes, (n) => 1.2 + n.c[0] / 100) };
  const s = mouldingStrains({ domain: d, fill, family: 'abs' })([50, 20, 2]);
  assert.ok(Math.abs(s.shrinkage[0] + (1.2 + 50 / 100) / 300) < 0.01 / 300, 'about −s_v/3 at x = 50');
  assert.ok(s.orientation[0] < 0 && s.orientation[1] > 0, 'unfilled: more shrinkage along the flow (x)');
  const fibers = fiberOrientation(d, fill, { fraction: 0.3, layers: 4, maxSteps: 60 });
  const g = mouldingStrains({ domain: d, fill, fibers, fiber: 0.3, family: 'pa66' })([50, 20, 2]);
  assert.ok(g.orientation[0] > 0, 'fibers along the flow hold the shrinkage in x');
  const r = warpage({ mesh: boxMesh(100, 40, 4, 2), strains: mouldingStrains({ domain: d, fill, family: 'abs' }), solid: solidOf('abs'), meshOptions: { size: 6, order: 1 } });
  assert.equal(r.ok, true);
  assert.ok(r.cases.shrinkage.warpMax > 0, 'shrinkage rising along x warps (in plane)');
  assert.ok(Math.abs(solidOf('pa66', 0.3).E - 3000 * 2.2) < 1e-9);
  assert.ok(RESINS.pa66);
});
