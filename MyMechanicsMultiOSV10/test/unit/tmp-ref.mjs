import { flowStudy } from '../../src/cad/cfd/lbm.js';
import { boxMesh } from './fem-shapes.js';
const mesh = boxMesh(20, 20, 20, 2);
const base = { mode: 'external', axis: 'x', velocity: 0.0025, fluid: 'water', time: { mode: 'steady', maxSteps: 60000, passes: 10 } };
for (const [name, o] of [['refined6+1', { resolution: 6, refine: 1 }], ['refined6+2', { resolution: 6, refine: 2 }], ['refined6+2 m1.6', { resolution: 6, refine: 2, blockMargin: 1.6 }]]) {
  const r = flowStudy(mesh, { ...base, ...o });
  console.log(name, 'frontal', r.frontalArea?.toFixed(1), 'drag N', r.dragForce?.toExponential(4), 'Cd', r.dragCoefficient?.toFixed(4));
}
