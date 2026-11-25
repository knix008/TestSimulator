import './src/cad/features.js';
import { loadKernel, rep } from './src/cad/kernel.js';
import { chamferMore } from './src/cad/dressup-more.js';
import { edgeSignature } from './src/cad/refs.js';
import { planeFace } from './src/cad/extrude-more.js';
await loadKernel(); const R = rep();
const a = (30 * Math.PI) / 180; const n = [Math.sin(a), 0, Math.cos(a)]; const o = [0, 0, 15];
let body = R.makeCylinder(10, 30, [0, 0, 0], [0, 0, 1]);
body = body.cut(R.basicFaceExtrusion(planeFace(o, n, 100), new R.Vector(n.map((v) => v * 100))));
const rim = body.edges.find((e) => e.geomType !== 'LINE' && e.boundingBox.bounds[1][2] > 15.5);
const r = chamferMore({ kind: 'offsetFace', edges: [edgeSignature(rim)], distance: 1, distance2: 1 }, { body });
console.log('vol', R.measureVolume(body).toFixed(3), R.measureVolume(r.body).toFixed(3), r.body.faces.length);
let worst = 0, k = 0;
for (const e of r.body.edges) for (let i = 1; i < 10; i++) {
  const p = e.pointAt(i / 10); const P = [p.x, p.y, p.z]; const rr = Math.hypot(P[0], P[1]);
  if (Math.abs(rr - 10) > 1e-4 || P[2] < 3) continue;
  const dpl = (P[0] - o[0]) * n[0] + (P[1] - o[1]) * n[1] + (P[2] - o[2]) * n[2];
  if (Math.abs(dpl) < 1e-4 || dpl < -4) continue;
  const Q = [P[0] - P[0] / rr, P[1] - P[1] / rr, P[2]];
  const dq = -((Q[0] - o[0]) * n[0] + (Q[1] - o[1]) * n[1] + (Q[2] - o[2]) * n[2]);
  worst = Math.max(worst, Math.abs(dq - 1)); k++;
}
console.log('checked', k, 'worst', worst);
