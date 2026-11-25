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
console.log('rim ends', rim.startPoint.x, rim.endPoint.x);
globalThis.__dbgChamfer = ({ sections, tool, loft, closed }) => {
  const h = Math.floor(sections.length / 2);
  const A = loft(sections.slice(0, h + 1)); const B = loft([...sections.slice(h), sections[0]]);
  console.log('closed', closed, 'n', sections.length, 'A', R.measureVolume(A).toFixed(3), 'B', R.measureVolume(B).toFixed(3), 'tool', R.measureVolume(tool).toFixed(3));
  console.log('cA', R.measureVolume(body.clone().intersect(A)).toFixed(3), 'cB', R.measureVolume(body.clone().intersect(B)).toFixed(3));
};
chamferMore({ kind: 'offsetFace', edges: [edgeSignature(rim)], distance: 1, distance2: 1 }, { body });
