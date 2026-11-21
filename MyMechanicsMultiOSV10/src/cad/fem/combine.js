// Load-case combination of linear static results on the same tetrahedral model: linear (Σ factor·u, stresses
// recomputed from the combined displacement — exact by superposition) or SRSS (each stress component combined as
// √Σ(factor·σ)², displacements likewise, signed by the dominant case) — the usual envelope for independent loads.

import { linearStatic } from './static.js';
import { buildModel, elasticStresses, recoverNodal, vonMisesField, surfaceField, fieldMax } from './model.js';

const fail = (error, extra = {}) => ({ ok: false, error, elements: 0, elementSize: 0, maxDisplacement: 0, maxStress: 0, minFactorOfSafety: Infinity, vertexDisplacement: new Float32Array(0), vertexStress: new Float32Array(0), ...extra });

/** Combines solved cases [{ result, factor, name }] (results of linearStatic on one model). */
export function combineResults(cases, method = 'linear') {
  const usable = cases.filter((c) => c?.result?.displacement?.length && c.result.model);
  if (!usable.length) return fail('no-cases');
  const model = usable[0].result.model, ndof = 3 * model.nn;
  if (usable.some((c) => c.result.displacement.length !== ndof)) return fail('mismatch');
  const u = new Float64Array(ndof);
  let nodal;
  if (method === 'srss') {
    for (let d = 0; d < ndof; d++) {
      let s2 = 0, dom = 0;
      for (const c of usable) { const x = c.factor * c.result.displacement[d]; s2 += x * x; if (Math.abs(x) > Math.abs(dom)) dom = x; }
      u[d] = Math.sign(dom) * Math.sqrt(s2);
    }
    nodal = new Float64Array(6 * model.nn);
    for (const c of usable) { const st = c.result.stress; for (let i = 0; i < nodal.length; i++) nodal[i] += (c.factor * st[i]) ** 2; }
    for (let i = 0; i < nodal.length; i++) nodal[i] = Math.sqrt(nodal[i]);
  } else {
    for (const c of usable) for (let d = 0; d < ndof; d++) u[d] += c.factor * c.result.displacement[d];
    nodal = elasticStresses(model, u).nodal;
  }
  const vm = vonMisesField(nodal, model.nn), dm = fieldMax(model, u, 3), sm = fieldMax(model, vm, 1);
  let minFos = Infinity;
  for (let n = 0; n < model.nn; n++) { const y = model.bodies[model.nodeBody[n]].material.yield; if (y > 0 && vm[n] > 0) minFos = Math.min(minFos, y / vm[n]); }
  void recoverNodal;
  return {
    ok: true, error: null, solver: 'tet', model, method, cases: usable.length,
    nodes: model.nodes, displacement: u, stress: nodal, nodeStress: vm, elements: model.ne, elementSize: model.size,
    maxDisplacement: dm.value, maxDisplacementAt: dm.at, maxStress: sm.value, maxStressAt: sm.at, minFactorOfSafety: minFos,
    vertexDisplacement: surfaceField(model, u, 3, 0), vertexStress: surfaceField(model, vm, 1, 0),
  };
}

/** Solves each case [{ loads, factor, name }] with the same fixtures / mesh and combines them. */
export function combineStudy(input) {
  const { bodies, fixtures = [], cases = [], method = 'linear', mesh = {}, onProgress = null, cancel = null } = input;
  if (!cases.length) return fail('no-cases');
  const model = buildModel(bodies, mesh, (f) => onProgress?.(0.2 * f, 'mesh'));
  if (!model.ok) return fail(model.error);
  const solved = [];
  for (let i = 0; i < cases.length; i++) {
    const r = linearStatic({ ...input, model, loads: cases[i].loads, onProgress: (f) => onProgress?.(0.2 + 0.75 * ((i + f) / cases.length), 'solve'), cancel });
    if (r.error && r.error !== 'not-converged') return { ...fail(r.error), caseResults: solved.map((x) => ({ name: x.name, factor: x.factor, maxStress: x.result.maxStress, maxDisplacement: x.result.maxDisplacement })) };
    solved.push({ result: r, factor: cases[i].factor ?? 1, name: cases[i].name });
  }
  const combined = combineResults(solved, method);
  onProgress?.(1, 'done');
  return { ...combined, caseResults: solved.map((x) => ({ name: x.name, factor: x.factor, maxStress: x.result.maxStress, maxDisplacement: x.result.maxDisplacement })) };
}
