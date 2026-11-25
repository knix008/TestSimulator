// Adaptive meshing (fem/adaptive.js): the error estimate falls as the mesh is refined where it is large, the hole of a
// plate in tension gets the refinement, and its peak stress moves towards a fine uniform mesh's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linearStatic } from '../../src/cad/fem/static.js';
import { adaptiveStatic, elementErrors } from '../../src/cad/fem/adaptive.js';
import { quarterPlateWithHole } from './fem-shapes.js';

const STEEL = { E: 210000, nu: 0.3, yield: 250 };
// A quarter plate 60 × 60 with a 10 mm hole, 10 mm thick, pulled along x at x = 60 (faces 0 x = 0 and 1 y = 0
// symmetric, 100 the bottom). Thick enough that the mesher's elements stay well shaped at size 8 — a 2 mm plate gives
// thickness-limited slivers whose peak stress jumps about from one size to the next.
const body = { mesh: quarterPlateWithHole(60, 60, 10, 10, 48), material: STEEL };
const input = { bodies: [body], fixtures: [{ faceId: 0, type: 'roller' }, { faceId: 1, type: 'roller' }, { faceId: 100, type: 'roller' }], loads: [{ faceId: 2, traction: [100, 0, 0] }], mesh: { size: 8, order: 2 }, tol: 1e-9 };
const nearHole = (err, e) => Math.hypot(err.centroids[3 * e], err.centroids[3 * e + 1]) < 16;

test('error estimate: uniform refinement lowers it (about as h²), and it sits at the hole', () => {
  const coarse = elementErrors(linearStatic(input));
  const fine = elementErrors(linearStatic({ ...input, mesh: { size: 4, order: 2 } }));
  assert.ok(fine.eta < 0.7 * coarse.eta, `${coarse.eta} → ${fine.eta}`);
  let near = 0; for (let e = 0; e < fine.errors.length; e++) if (nearHole(fine, e)) near += fine.errors[e];
  assert.ok(near > 0.7 * fine.total, `share at the hole ${near / fine.total}`);
});

test('adaptive passes: the error falls each pass to the target, the hole is refined, and it beats a uniform mesh', () => {
  const seen = [];
  const r = adaptiveStatic(input, { target: 0.01, maxPasses: 4, onPass: (h) => seen.push(h) });
  assert.ok(r.ok, r.error);
  const h = r.adaptive.history;
  assert.equal(h.length, seen.length);
  assert.ok(h.length >= 2 && r.adaptive.converged && r.adaptive.eta <= 0.01, h.map((x) => x.error.toFixed(4)).join(' '));
  for (let i = 1; i < h.length; i++) assert.ok(h[i].error < h[i - 1].error && h[i].elements > h[i - 1].elements, h.map((x) => x.error.toFixed(4)).join(' '));
  // The peak stress (at the hole) settles: the last two passes within 1 %.
  assert.ok(Math.abs(h.at(-1).maxStress - h.at(-2).maxStress) < 0.01 * h.at(-1).maxStress, h.map((x) => x.maxStress.toFixed(1)).join(' '));
  // Smaller elements at the hole than far from it.
  const err = elementErrors(r);
  let a = 0, na = 0, b = 0, nb = 0;
  for (let e = 0; e < err.sizes.length; e++) if (nearHole(err, e)) { a += err.sizes[e]; na++; } else if (Math.hypot(err.centroids[3 * e], err.centroids[3 * e + 1]) > 40) { b += err.sizes[e]; nb++; }
  assert.ok(a / na < 0.5 * (b / nb), `hole ${a / na} far ${b / nb}`);
  // A uniform mesh with more elements is still less accurate.
  const uniform = linearStatic({ ...input, mesh: { size: 2.5, order: 2 } });
  assert.ok(uniform.elements > h.at(-1).elements && elementErrors(uniform).eta > r.adaptive.eta, `${uniform.elements} / ${h.at(-1).elements}`);
});

test('the element budget stops the passes', () => {
  const r = adaptiveStatic(input, { target: 0.001, maxPasses: 6, maxElements: 2000 });
  assert.ok(r.ok && !r.adaptive.converged);
  assert.equal(r.adaptive.history.length, 2, r.adaptive.history.map((x) => x.elements).join(' '));
});

test('p-adaptive: the strain energy rises from linear to quadratic tetrahedra, the error falls; hp refines on when needed', async () => {
  const { pAdaptiveStatic } = await import('../../src/cad/fem/adaptive.js');
  const r = pAdaptiveStatic(input, { target: 0.05, maxPasses: 2 });
  const [p1, p2] = r.adaptive.history;
  assert.equal(p1.order, 1); assert.equal(p2.order, 2);
  assert.ok(p2.energy > p1.energy, `${p1.energy} → ${p2.energy}`);
  assert.ok(p2.error < p1.error, `${p1.error} → ${p2.error}`);
  assert.equal(r.adaptive.method, 'p');
  const hp = pAdaptiveStatic(input, { target: 0.01, maxPasses: 4 });
  assert.equal(hp.adaptive.method, 'hp');
  assert.ok(hp.adaptive.history.length >= 3 && hp.adaptive.eta < p2.error, hp.adaptive.history.map((x) => `${x.order}:${x.error.toFixed(4)}`).join(' '));
});
