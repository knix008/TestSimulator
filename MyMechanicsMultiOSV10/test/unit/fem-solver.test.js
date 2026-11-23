// Solver robustness (sparse.js, amg.js, mesh.js improveMesh): the cases that made a 12-part assembly study take
// minutes — a stack overflow in the RCM order of a big mesh, the multigrid given up for a weak fallback, and slivers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rcmOrder, applyDirichlet, multiply, pcg, preconditioner } from '../../src/cad/fem/sparse.js';
import { smoothedAggregation } from '../../src/cad/fem/amg.js';
import { buildModel, stiffnessMatrix } from '../../src/cad/fem/model.js';
import { tetMesh } from '../../src/cad/fem/mesh.js';
import { boxMesh, quarterPlateWithHole } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250 };

test('RCM order of a 300 000-node component (no call-stack overflow), a permutation', () => {
  const nn = 300000, ptr = new Int32Array(nn + 1), idx = [];
  for (let i = 0; i < nn; i++) { if (i) idx.push(i - 1); idx.push(i); if (i < nn - 1) idx.push(i + 1); ptr[i + 1] = idx.length; }
  const perm = rcmOrder({ nn, ptr, idx: Int32Array.from(idx) });
  assert.equal(perm.length, nn);
  assert.equal(new Set(perm).size, nn);
});

test('multigrid with whole aggregates of fixed dofs (zero coarse rows) is still built, and CG converges fast with it', () => {
  const model = buildModel([{ mesh: boxMesh(120, 30, 30, 2), material: STEEL }], { size: 3.5, order: 2 });
  const K = stiffnessMatrix(model);
  assert.ok(K.n > 15000, `${K.n} dofs`);
  // Every node within 25 mm of one end fixed: aggregates there are fixed through and through.
  const fixed = new Uint8Array(K.n), b = new Float64Array(K.n);
  for (let n = 0; n < model.nn; n++) { if (model.nodes[3 * n] < 25) for (let k = 0; k < 3; k++) fixed[3 * n + k] = 1; if (model.nodes[3 * n] > 119) b[3 * n + 2] = -1; }
  applyDirichlet(K, fixed, new Float64Array(K.n), b);
  const M = smoothedAggregation(K, { coords: model.nodes, mask: fixed });
  assert.ok(M, 'the multigrid is built (it used to give up and leave CG to a Jacobi-like fallback)');
  const x = new Float64Array(K.n), r = pcg((v, out) => multiply(K, v, out), M, b, x, { tol: 1e-8, maxIter: 3000 });
  assert.ok(r.converged && r.it < 150, `multigrid CG: ${r.it} iterations`);
  const x2 = new Float64Array(K.n), r2 = pcg((v, out) => multiply(K, v, out), preconditioner(K), b, x2, { tol: 1e-8, maxIter: 5000 });
  assert.ok(r.it * 3 < r2.it, `multigrid ${r.it} vs incomplete Cholesky ${r2.it} iterations`);
});

test('mesh improvement: no slivers left on the plate with a hole, the CAD edge still in the mesh, the volume kept', () => {
  const surface = quarterPlateWithHole(100, 50, 5, 2, 64);
  const opts = { size: 4, refine: [{ faceIds: [4], size: 0.5 }], grading: 0.3 };
  const raw = tetMesh(surface, { ...opts, improve: false }), good = tetMesh(surface, opts);
  assert.ok(raw.quality.poor > 10 && raw.quality.min < 0.05, `without: ${raw.quality.poor} poor, min ${raw.quality.min}`);
  assert.equal(good.quality.poor, 0, `with: ${good.quality.poor} tets below 0.1`);
  assert.ok(good.quality.min > 0.15 && good.quality.mean > raw.quality.mean, `min ${good.quality.min}, mean ${good.quality.mean} vs ${raw.quality.mean}`);
  let on = 0; for (let n = 0; n < good.nodes.length / 3; n++) if (Math.abs(good.nodes[3 * n]) < 1e-6 && Math.abs(good.nodes[3 * n + 1] - 5) < 1e-6) on++;
  assert.ok(on >= 4, `nodes on the hole / symmetry-plane edge: ${on}`);
  const vol = (m) => m.volume ?? m.quality.volume;
  if (vol(good) && vol(raw)) assert.ok(Math.abs(vol(good) - vol(raw)) < 1e-3 * vol(raw), 'volume kept');
});
